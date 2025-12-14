"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  email: string;
  name: string;
  user_role?: string;
  roles?: string[];
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isClientUser: boolean;
  isStoreUser: boolean; // True if user should access /mystore (store-level roles)
  userRole: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Store-level roles that should access /mystore instead of /dashboard
const STORE_ROLES = [
  "CLIENT_USER",
  "STORE_MANAGER",
  "SHIFT_MANAGER",
  "CASHIER",
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClientUser, setIsClientUser] = useState(false);
  const [isStoreUser, setIsStoreUser] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const router = useRouter();

  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

  // Validate session with backend on mount
  useEffect(() => {
    const validateSession = async () => {
      setIsLoading(true);

      // Check localStorage first for quick initial state
      const authSession = localStorage.getItem("auth_session");
      if (!authSession) {
        setIsLoading(false);
        return;
      }

      try {
        const data = JSON.parse(authSession);
        if (!data.authenticated || !data.user) {
          localStorage.removeItem("auth_session");
          localStorage.removeItem("client_auth_session");
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
          const roles = validatedData.user.roles || [];

          // Determine user_role for routing
          let detectedUserRole: string | null = null;
          if (roles.includes("CLIENT_OWNER")) {
            detectedUserRole = "CLIENT_OWNER";
          } else if (roles.includes("CLIENT_USER")) {
            detectedUserRole = "CLIENT_USER";
          } else if (roles.includes("STORE_MANAGER")) {
            detectedUserRole = "STORE_MANAGER";
          } else if (roles.includes("SHIFT_MANAGER")) {
            detectedUserRole = "SHIFT_MANAGER";
          } else if (roles.includes("CASHIER")) {
            detectedUserRole = "CASHIER";
          } else if (roles.includes("SUPERADMIN")) {
            detectedUserRole = "SUPERADMIN";
          }

          // Check if user is a store-level user
          const detectedIsStoreUser = roles.some((r: string) =>
            STORE_ROLES.includes(r),
          );

          const userData: User = {
            id: validatedData.user.id,
            email: validatedData.user.email,
            name: validatedData.user.name || validatedData.user.email,
            user_role: detectedUserRole || undefined,
            roles: roles,
          };

          // Update localStorage with validated user data
          // Clear legacy key to prevent conflicts
          localStorage.removeItem("client_auth_session");
          localStorage.setItem(
            "auth_session",
            JSON.stringify({
              user: userData,
              authenticated: true,
              isClientUser: validatedData.user?.is_client_user === true,
              isStoreUser: detectedIsStoreUser,
              userRole: detectedUserRole,
            }),
          );

          setUser(userData);
          setIsClientUser(validatedData.user?.is_client_user === true);
          setIsStoreUser(detectedIsStoreUser);
          setUserRole(detectedUserRole);

          // Restore user's theme preference immediately
          // This must happen before next-themes initializes
          const userThemeKey = `nuvana-theme-${userData.id}`;
          const savedTheme = localStorage.getItem(userThemeKey);
          if (savedTheme && (savedTheme === "dark" || savedTheme === "light")) {
            // Set the theme in the key that next-themes reads
            localStorage.setItem("nuvana-theme", savedTheme);
          }
        } else {
          // Token invalid or expired - clear localStorage and stay logged out
          localStorage.removeItem("auth_session");
          localStorage.removeItem("client_auth_session");
          setUser(null);
          setIsClientUser(false);
          setIsStoreUser(false);
          setUserRole(null);
        }
      } catch (error) {
        localStorage.removeItem("auth_session");
        localStorage.removeItem("client_auth_session");
        setUser(null);
        setIsClientUser(false);
        setIsStoreUser(false);
        setUserRole(null);
      } finally {
        setIsLoading(false);
      }
    };

    validateSession();
  }, [backendUrl]);

  const logout = useCallback(async () => {
    try {
      await fetch(`${backendUrl}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Logout error:", error);
    }

    // Save current theme preference for this user before clearing
    // ThemeSync will handle saving the current theme before logout
    if (user) {
      const currentTheme = localStorage.getItem("nuvana-theme");
      if (currentTheme) {
        const userThemeKey = `nuvana-theme-${user.id}`;
        localStorage.setItem(userThemeKey, currentTheme);
      }
    }

    // Clear state regardless of backend success
    localStorage.removeItem("auth_session");
    localStorage.removeItem("client_auth_session");

    // Theme reset is handled by ThemeSync component
    // which properly integrates with next-themes

    setUser(null);
    setIsClientUser(false);
    setIsStoreUser(false);
    setUserRole(null);
    router.push("/login");
  }, [backendUrl, user, router]);

  // Proactive token refresh to keep users logged in during active sessions
  // Refresh intervals are role-based to match backend token expiry:
  // - SUPERADMIN: Refresh every 7 hours (before 8-hour expiry)
  // - CLIENT_OWNER: Refresh every 50 minutes (before 1-hour expiry)
  // - CLIENT_USER: Refresh every 7 days (before 30-day expiry)
  useEffect(() => {
    if (!user) {
      return; // Only run when user is authenticated
    }

    // Determine refresh interval based on user role
    const roles = user.roles || [];
    let refreshIntervalMs: number;

    if (roles.includes("SUPERADMIN")) {
      refreshIntervalMs = 7 * 60 * 60 * 1000; // 7 hours in milliseconds
    } else if (roles.includes("CLIENT_USER")) {
      refreshIntervalMs = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    } else {
      // CLIENT_OWNER and other roles
      refreshIntervalMs = 50 * 60 * 1000; // 50 minutes in milliseconds
    }

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
    }, refreshIntervalMs);

    // Cleanup interval on unmount or when user logs out
    return () => clearInterval(refreshInterval);
  }, [user, backendUrl, logout]); // Re-run effect when user changes

  const login = async (email: string, password: string) => {
    const response = await fetch(`${backendUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    const responseData = await response.json();

    if (!response.ok) {
      throw new Error(
        responseData.error?.message || responseData.message || "Login failed",
      );
    }

    // Backend returns { success: true, data: { user: {...} } }
    const userData = responseData.data?.user || responseData.user;

    if (!userData) {
      throw new Error("Invalid response from server - no user data");
    }

    // Determine isStoreUser from roles
    const roles = userData.roles || [];
    const detectedIsStoreUser = roles.some((r: string) =>
      STORE_ROLES.includes(r),
    );

    // Store user info - clear legacy key to prevent conflicts
    localStorage.removeItem("client_auth_session");
    localStorage.setItem(
      "auth_session",
      JSON.stringify({
        user: userData,
        authenticated: true,
        isClientUser: userData.is_client_user === true,
        isStoreUser: detectedIsStoreUser,
        userRole: userData.user_role,
      }),
    );

    // Restore user's theme preference immediately before setting user state
    // This ensures next-themes can read the correct theme on initialization
    if (userData.id) {
      const userThemeKey = `nuvana-theme-${userData.id}`;
      const savedTheme = localStorage.getItem(userThemeKey);
      if (savedTheme && (savedTheme === "dark" || savedTheme === "light")) {
        // Set the theme in the key that next-themes reads
        localStorage.setItem("nuvana-theme", savedTheme);
      }
    }

    setUser(userData);
    setIsClientUser(userData.is_client_user === true);
    setIsStoreUser(detectedIsStoreUser);
    setUserRole(userData.user_role || null);
    // ThemeSync will call setTheme() to ensure next-themes internal state is updated
  };

  const refreshUser = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/auth/me`, {
        method: "GET",
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        const roles = data.user.roles || [];

        // Determine user_role for routing
        let detectedUserRole: string | null = null;
        if (roles.includes("CLIENT_OWNER")) {
          detectedUserRole = "CLIENT_OWNER";
        } else if (roles.includes("CLIENT_USER")) {
          detectedUserRole = "CLIENT_USER";
        } else if (roles.includes("STORE_MANAGER")) {
          detectedUserRole = "STORE_MANAGER";
        } else if (roles.includes("SHIFT_MANAGER")) {
          detectedUserRole = "SHIFT_MANAGER";
        } else if (roles.includes("CASHIER")) {
          detectedUserRole = "CASHIER";
        } else if (roles.includes("SUPERADMIN")) {
          detectedUserRole = "SUPERADMIN";
        }

        const detectedIsStoreUser = roles.some((r: string) =>
          STORE_ROLES.includes(r),
        );

        const userData: User = {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name || data.user.email,
          user_role: detectedUserRole || undefined,
          roles: roles,
        };

        // Clear legacy key to prevent conflicts
        localStorage.removeItem("client_auth_session");
        localStorage.setItem(
          "auth_session",
          JSON.stringify({
            user: userData,
            authenticated: true,
            isClientUser: data.user?.is_client_user === true,
            isStoreUser: detectedIsStoreUser,
            userRole: detectedUserRole,
          }),
        );

        setUser(userData);
        setIsClientUser(data.user?.is_client_user === true);
        setIsStoreUser(detectedIsStoreUser);
        setUserRole(detectedUserRole);
      } else {
        // Token invalid or expired
        localStorage.removeItem("auth_session");
        localStorage.removeItem("client_auth_session");
        setUser(null);
        setIsClientUser(false);
        setIsStoreUser(false);
        setUserRole(null);
      }
    } catch (error) {
      console.error("Failed to refresh user:", error);
      localStorage.removeItem("auth_session");
      localStorage.removeItem("client_auth_session");
      setUser(null);
      setIsClientUser(false);
      setIsStoreUser(false);
      setUserRole(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        isClientUser,
        isStoreUser,
        userRole,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
