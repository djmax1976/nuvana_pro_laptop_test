"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isClientUser: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClientUser, setIsClientUser] = useState(false);
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
          const userData = {
            id: validatedData.user.id,
            email: validatedData.user.email,
            name: validatedData.user.name || validatedData.user.email,
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
            }),
          );

          setUser(userData);
          setIsClientUser(validatedData.user?.is_client_user === true);

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
        }
      } catch (error) {
        localStorage.removeItem("auth_session");
        localStorage.removeItem("client_auth_session");
        setUser(null);
        setIsClientUser(false);
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
  }, [user, backendUrl]); // Re-run effect when user changes

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

    // Store user info - clear legacy key to prevent conflicts
    localStorage.removeItem("client_auth_session");
    localStorage.setItem(
      "auth_session",
      JSON.stringify({
        user: data.user,
        authenticated: true,
        isClientUser: data.user?.is_client_user === true,
      }),
    );

    // Restore user's theme preference immediately before setting user state
    // This ensures next-themes can read the correct theme on initialization
    const userThemeKey = `nuvana-theme-${data.user.id}`;
    const savedTheme = localStorage.getItem(userThemeKey);
    if (savedTheme && (savedTheme === "dark" || savedTheme === "light")) {
      // Set the theme in the key that next-themes reads
      localStorage.setItem("nuvana-theme", savedTheme);
    }

    setUser(data.user);
    setIsClientUser(data.user?.is_client_user === true);
    // ThemeSync will call setTheme() to ensure next-themes internal state is updated
  };

  const logout = async () => {
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
    router.push("/login");
  };

  const refreshUser = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/auth/me`, {
        method: "GET",
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        const userData = {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name || data.user.email,
        };

        // Clear legacy key to prevent conflicts
        localStorage.removeItem("client_auth_session");
        localStorage.setItem(
          "auth_session",
          JSON.stringify({
            user: userData,
            authenticated: true,
            isClientUser: data.user?.is_client_user === true,
          }),
        );

        setUser(userData);
        setIsClientUser(data.user?.is_client_user === true);
      } else {
        // Token invalid or expired
        localStorage.removeItem("auth_session");
        localStorage.removeItem("client_auth_session");
        setUser(null);
        setIsClientUser(false);
      }
    } catch (error) {
      console.error("Failed to refresh user:", error);
      localStorage.removeItem("auth_session");
      localStorage.removeItem("client_auth_session");
      setUser(null);
      setIsClientUser(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        isClientUser,
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
