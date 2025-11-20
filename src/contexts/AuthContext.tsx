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
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

  // Load user from localStorage on mount
  useEffect(() => {
    const loadUser = () => {
      const authSession = localStorage.getItem("auth_session");
      if (authSession) {
        try {
          const data = JSON.parse(authSession);
          if (data.authenticated && data.user) {
            setUser(data.user);
          }
        } catch (error) {
          console.error("Failed to parse auth session:", error);
          localStorage.removeItem("auth_session");
        }
      }
      setIsLoading(false);
    };

    loadUser();
  }, []);

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

    // Store user info
    localStorage.setItem(
      "auth_session",
      JSON.stringify({
        user: data.user,
        authenticated: true,
      }),
    );

    setUser(data.user);
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

    // Clear state regardless of backend success
    localStorage.removeItem("auth_session");
    setUser(null);
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

        localStorage.setItem(
          "auth_session",
          JSON.stringify({
            user: userData,
            authenticated: true,
          }),
        );

        setUser(userData);
      } else {
        // Token invalid or expired
        localStorage.removeItem("auth_session");
        setUser(null);
      }
    } catch (error) {
      console.error("Failed to refresh user:", error);
      localStorage.removeItem("auth_session");
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
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
