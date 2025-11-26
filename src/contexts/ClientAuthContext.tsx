"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";

/**
 * Client user interface with is_client_user flag
 */
interface ClientUser {
  id: string;
  email: string;
  name: string;
  is_client_user: boolean;
}

/**
 * Client auth context type
 */
interface ClientAuthContextType {
  user: ClientUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isClientUser: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const ClientAuthContext = createContext<ClientAuthContextType | undefined>(
  undefined,
);

const STORAGE_KEY = "auth_session";

/**
 * Client Auth Provider
 * Provides authentication context specifically for client users
 * Uses unified POST /api/auth/login endpoint (role-based routing)
 */
export function ClientAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ClientUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

  // Validate session with backend on mount
  useEffect(() => {
    const validateSession = async () => {
      try {
        setIsLoading(true);

        // Check localStorage first for quick initial state
        // Clear legacy key if present to prevent conflicts
        try {
          localStorage.removeItem("client_auth_session");
        } catch (storageError) {
          // Non-fatal: failed to clear legacy key
        }

        let authSession: string | null = null;
        try {
          authSession = localStorage.getItem(STORAGE_KEY);
        } catch (storageError) {
          // localStorage access failed (e.g., private browsing, storage disabled)
          console.warn(
            "Failed to access localStorage for auth session:",
            storageError instanceof Error
              ? storageError.message
              : "Unknown error",
          );
          setIsLoading(false);
          return;
        }

        if (!authSession) {
          setIsLoading(false);
          return;
        }

        let timeout: NodeJS.Timeout | undefined;
        try {
          const data = JSON.parse(authSession);
          if (!data.authenticated || !data.user) {
            try {
              localStorage.removeItem(STORAGE_KEY);
              localStorage.removeItem("client_auth_session");
            } catch (storageError) {
              // Non-fatal: failed to remove invalid session
              console.warn(
                "Failed to remove invalid session from localStorage:",
                storageError instanceof Error
                  ? storageError.message
                  : "Unknown error",
              );
            }
            setIsLoading(false);
            return;
          }

          // Check if user is a client user from stored payload or validate
          const isClientUserFromStorage = data.isClientUser === true;
          if (!isClientUserFromStorage) {
            // Not a client user - clear session and return
            try {
              localStorage.removeItem(STORAGE_KEY);
              localStorage.removeItem("client_auth_session");
            } catch (storageError) {
              // Non-fatal: failed to remove session
            }
            setIsLoading(false);
            return;
          }

          // CRITICAL: Validate JWT tokens with backend server
          // This prevents dashboard render with expired/invalid tokens
          const controller = new AbortController();
          timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout

          const response = await fetch(`${backendUrl}/api/auth/me`, {
            method: "GET",
            credentials: "include", // Send httpOnly cookies
            signal: controller.signal,
          });

          // Clear timeout on successful response
          clearTimeout(timeout);

          if (response.ok) {
            const validatedData = await response.json();

            // Check if user has client permissions
            const hasClientAccess =
              validatedData.user.permissions?.includes(
                "CLIENT_DASHBOARD_ACCESS",
              ) ||
              validatedData.user.roles?.some(
                (r: string) => r === "CLIENT_USER" || r === "CLIENT_OWNER",
              );

            if (!hasClientAccess) {
              // User doesn't have client access - clear session
              try {
                localStorage.removeItem(STORAGE_KEY);
                localStorage.removeItem("client_auth_session");
              } catch (storageError) {
                // Non-fatal: failed to clear session
              }
              setUser(null);
              setIsLoading(false);
              return;
            }

            const userData: ClientUser = {
              id: validatedData.user.id,
              email: validatedData.user.email,
              name: validatedData.user.name || validatedData.user.email,
              is_client_user: true,
            };

            // Update localStorage with validated user data
            // Clear legacy key to prevent conflicts
            try {
              localStorage.removeItem("client_auth_session");
              localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({
                  user: userData,
                  authenticated: true,
                  isClientUser: true,
                }),
              );
            } catch (storageError) {
              // Non-fatal: failed to save session, but user is still authenticated
              console.warn(
                "Failed to save validated session to localStorage:",
                storageError instanceof Error
                  ? storageError.message
                  : "Unknown error",
              );
            }

            setUser(userData);
          } else {
            // Token invalid or expired - clear localStorage and stay logged out
            try {
              localStorage.removeItem(STORAGE_KEY);
              localStorage.removeItem("client_auth_session");
            } catch (storageError) {
              // Non-fatal: failed to clear expired session
              console.warn(
                "Failed to clear expired session from localStorage:",
                storageError instanceof Error
                  ? storageError.message
                  : "Unknown error",
              );
            }
            setUser(null);
          }
        } catch (error) {
          // Clear timeout in case of error (if it was set)
          if (timeout) {
            clearTimeout(timeout);
          }

          // Handle AbortError (timeout) specifically
          if (error instanceof Error && error.name === "AbortError") {
            console.warn(
              "Session validation request timed out after 5 seconds",
            );
            // Treat timeout as invalid session - clear and stay logged out
          } else {
            // JSON parse error or other processing error
            console.warn(
              "Error during session validation:",
              error instanceof Error ? error.message : "Unknown error",
            );
          }

          try {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem("client_auth_session");
          } catch (storageError) {
            // Non-fatal: failed to remove corrupted session
            console.warn(
              "Failed to remove corrupted session from localStorage:",
              storageError instanceof Error
                ? storageError.message
                : "Unknown error",
            );
          }
          setUser(null);
        }
      } catch (error) {
        // Catch any unexpected errors to prevent propagation
        console.warn(
          "Unexpected error during session validation:",
          error instanceof Error ? error.message : "Unknown error",
        );
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    validateSession();
  }, [backendUrl]);

  /**
   * Logout - clear session and redirect to unified login
   */
  const logout = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    try {
      const response = await fetch(`${backendUrl}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
        signal: controller.signal,
      });

      // Clear timeout on success
      clearTimeout(timeoutId);

      // Check response status - treat non-2xx as errors
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `Logout failed with status ${response.status}`,
        );
      }
    } catch (error) {
      // Clear timeout in case of error
      clearTimeout(timeoutId);

      // Handle AbortError (timeout) specifically
      if (error instanceof Error && error.name === "AbortError") {
        console.error("Logout request timed out after 5 seconds");
        // Proceed with local logout as fallback
      } else if (error instanceof Error) {
        console.error("Logout error:", error.message);
        // Proceed with local logout as fallback
      } else {
        console.error("Logout error: Unknown error occurred");
        // Proceed with local logout as fallback
      }
    }

    // Clear state regardless of backend success (safe fallback)
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("client_auth_session");
    setUser(null);
    router.push("/login");
  }, [backendUrl, router]);

  // Proactive token refresh to keep users logged in during active sessions
  // Refreshes access token every 10 minutes (before 15-minute expiry)
  useEffect(() => {
    if (!user) {
      return; // Only run when user is authenticated
    }

    const REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes in milliseconds

    const refreshInterval = setInterval(async () => {
      const controller = new AbortController();
      const REFRESH_TIMEOUT = 5000; // 5 seconds timeout (configurable)
      const timeoutId = setTimeout(() => controller.abort(), REFRESH_TIMEOUT);

      try {
        const response = await fetch(`${backendUrl}/api/auth/refresh`, {
          method: "POST",
          credentials: "include", // Send refresh token cookie
          signal: controller.signal,
        });

        // Clear timeout on success
        clearTimeout(timeoutId);

        if (!response.ok) {
          // Token refresh failed - session is expired, logout user
          await logout();
        }
      } catch (error) {
        // Clear timeout in case of error
        clearTimeout(timeoutId);

        // Handle AbortError (timeout) - treat as failed refresh
        if (error instanceof Error && error.name === "AbortError") {
          console.error("Token refresh request timed out after 5 seconds");
          // Treat timeout as failed refresh - logout to prevent stale tokens
          await logout();
        } else {
          // Network error or backend unavailable - logout for security
          await logout();
        }
      }
    }, REFRESH_INTERVAL);

    // Cleanup interval on unmount or when user logs out
    return () => clearInterval(refreshInterval);
  }, [user, backendUrl, logout]);

  /**
   * Client login - uses unified /api/auth/login endpoint
   * Verifies that the user is a client user after authentication
   */
  const login = async (email: string, password: string) => {
    const response = await fetch(`${backendUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Login failed");
    }

    // Verify the user has client access
    const isClientUser = data.user?.is_client_user === true;
    if (!isClientUser) {
      // User is not a client user - logout and show error
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      try {
        const response = await fetch(`${backendUrl}/api/auth/logout`, {
          method: "POST",
          credentials: "include",
          signal: controller.signal,
        });

        // Clear timeout on success
        clearTimeout(timeoutId);

        // Check response status - treat non-2xx as errors
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error(
            `Logout failed with status ${response.status}:`,
            errorData.message || "Unknown error",
          );
          // Continue with error throw even if logout fails
        }
      } catch (error) {
        // Clear timeout in case of error
        clearTimeout(timeoutId);

        // Handle AbortError (timeout) specifically
        if (error instanceof Error && error.name === "AbortError") {
          console.error("Logout request timed out after 5 seconds");
          // Continue with error throw even if logout times out
        } else if (error instanceof Error) {
          console.error("Logout error:", error.message);
          // Continue with error throw even if logout fails
        } else {
          console.error("Logout error: Unknown error occurred");
          // Continue with error throw even if logout fails
        }
      }

      throw new Error("This account does not have client portal access");
    }

    const userData: ClientUser = {
      id: data.user.id,
      email: data.user.email,
      name: data.user.name || data.user.email,
      is_client_user: true,
    };

    // Store user info - clear legacy key to prevent conflicts
    localStorage.removeItem("client_auth_session");
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        user: userData,
        authenticated: true,
        isClientUser: true,
      }),
    );

    setUser(userData);
  };

  /**
   * Refresh user data from backend
   */
  const refreshUser = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    try {
      const response = await fetch(`${backendUrl}/api/auth/me`, {
        method: "GET",
        credentials: "include",
        signal: controller.signal,
      });

      // Clear timeout on successful response
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();

        const hasClientAccess =
          data.user.permissions?.includes("CLIENT_DASHBOARD_ACCESS") ||
          data.user.roles?.some(
            (r: string) => r === "CLIENT_USER" || r === "CLIENT_OWNER",
          );

        const userData: ClientUser = {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name || data.user.email,
          is_client_user: hasClientAccess,
        };

        // Clear legacy key to prevent conflicts
        localStorage.removeItem("client_auth_session");
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            user: userData,
            authenticated: true,
            isClientUser: hasClientAccess,
          }),
        );

        setUser(userData);
      } else {
        // Token invalid or expired
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem("client_auth_session");
        setUser(null);
      }
    } catch (error) {
      // Clear timeout in case of error
      clearTimeout(timeoutId);

      // Handle AbortError (timeout) - treat as refresh failure
      if (error instanceof Error && error.name === "AbortError") {
        console.error("Refresh user request timed out after 5 seconds");
      } else {
        console.error("Failed to refresh user:", error);
      }

      // Remove STORAGE_KEY and setUser(null) on error (including abort)
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem("client_auth_session");
      setUser(null);
    }
  }, [backendUrl, setUser]);

  return (
    <ClientAuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        isClientUser: user?.is_client_user ?? false,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </ClientAuthContext.Provider>
  );
}

/**
 * Hook to use client auth context
 * Throws error if used outside of ClientAuthProvider
 */
export function useClientAuth() {
  const context = useContext(ClientAuthContext);
  if (context === undefined) {
    throw new Error("useClientAuth must be used within a ClientAuthProvider");
  }
  return context;
}
