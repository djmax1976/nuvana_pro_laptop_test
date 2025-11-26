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

const STORAGE_KEY = "client_auth_session";

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
      setIsLoading(true);

      // Check localStorage first for quick initial state
      const authSession = localStorage.getItem(STORAGE_KEY);
      if (!authSession) {
        setIsLoading(false);
        return;
      }

      try {
        const data = JSON.parse(authSession);
        if (!data.authenticated || !data.user) {
          localStorage.removeItem(STORAGE_KEY);
          setIsLoading(false);
          return;
        }

        // CRITICAL: Validate JWT tokens with backend server
        // This prevents dashboard render with expired/invalid tokens
        const response = await fetch(`${backendUrl}/api/auth/me`, {
          method: "GET",
          credentials: "include", // Send httpOnly cookies
        });

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

          const userData: ClientUser = {
            id: validatedData.user.id,
            email: validatedData.user.email,
            name: validatedData.user.name || validatedData.user.email,
            is_client_user: hasClientAccess,
          };

          // Update localStorage with validated user data
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              user: userData,
              authenticated: true,
            }),
          );

          setUser(userData);
        } else {
          // Token invalid or expired - clear localStorage and stay logged out
          localStorage.removeItem(STORAGE_KEY);
          setUser(null);
        }
      } catch (error) {
        localStorage.removeItem(STORAGE_KEY);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    validateSession();
  }, [backendUrl]);

  // Proactive token refresh to keep users logged in during active sessions
  // Refreshes access token every 10 minutes (before 15-minute expiry)
  useEffect(() => {
    if (!user) {
      return; // Only run when user is authenticated
    }

    const REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes in milliseconds

    const refreshInterval = setInterval(async () => {
      try {
        const response = await fetch(`${backendUrl}/api/auth/refresh`, {
          method: "POST",
          credentials: "include", // Send refresh token cookie
        });

        if (!response.ok) {
          // Token refresh failed - session is expired, logout user
          await logout();
        }
      } catch (error) {
        // Network error or backend unavailable - logout for security
        await logout();
      }
    }, REFRESH_INTERVAL);

    // Cleanup interval on unmount or when user logs out
    return () => clearInterval(refreshInterval);
  }, [user, backendUrl]);

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
      await fetch(`${backendUrl}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      throw new Error("This account does not have client portal access");
    }

    const userData: ClientUser = {
      id: data.user.id,
      email: data.user.email,
      name: data.user.name || data.user.email,
      is_client_user: true,
    };

    // Store user info
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        user: userData,
        authenticated: true,
      }),
    );

    setUser(userData);
  };

  /**
   * Logout - clear session and redirect to unified login
   */
  const logout = useCallback(async () => {
    try {
      await fetch(`${backendUrl}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Logout error:", error);
    }

    // Clear state regardless of backend success
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    router.push("/login");
  }, [backendUrl, router]);

  /**
   * Refresh user data from backend
   */
  const refreshUser = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/auth/me`, {
        method: "GET",
        credentials: "include",
      });

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

        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            user: userData,
            authenticated: true,
          }),
        );

        setUser(userData);
      } else {
        // Token invalid or expired
        localStorage.removeItem(STORAGE_KEY);
        setUser(null);
      }
    } catch (error) {
      console.error("Failed to refresh user:", error);
      localStorage.removeItem(STORAGE_KEY);
      setUser(null);
    }
  };

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
