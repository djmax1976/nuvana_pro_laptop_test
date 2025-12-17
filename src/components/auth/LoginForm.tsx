"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface LoginFormProps {
  onSuccess?: () => void;
}

/**
 * Session expiration reason messages
 * Maps URL query param values to user-friendly messages
 */
const SESSION_MESSAGES: Record<string, { title: string; message: string }> = {
  session_expired: {
    title: "Session Expired",
    message: "Your session has expired. Please sign in again to continue.",
  },
  inactivity: {
    title: "Session Timeout",
    message: "You were logged out due to inactivity. Please sign in again.",
  },
  token_refresh_failed: {
    title: "Session Error",
    message: "Unable to refresh your session. Please sign in again.",
  },
  logout: {
    title: "Logged Out",
    message: "You have been successfully logged out.",
  },
};

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionMessage, setSessionMessage] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, userRole, isStoreUser } = useAuth();

  // Check for session expiration reason in URL params
  useEffect(() => {
    const reason = searchParams.get("reason");
    if (
      reason &&
      Object.prototype.hasOwnProperty.call(SESSION_MESSAGES, reason)
    ) {
      const message = SESSION_MESSAGES[reason as keyof typeof SESSION_MESSAGES];
      setSessionMessage(message);
      // Clear the URL param without navigation (cleaner UX)
      const url = new URL(window.location.href);
      url.searchParams.delete("reason");
      window.history.replaceState({}, "", url.pathname);
    }
  }, [searchParams]);

  // Check for redirect after login
  useEffect(() => {
    // Clear session message after a delay if user doesn't interact
    if (sessionMessage) {
      const timer = setTimeout(() => {
        setSessionMessage(null);
      }, 10000); // Clear after 10 seconds
      return () => clearTimeout(timer);
    }
  }, [sessionMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Use AuthContext login which updates React state AND localStorage
      await login(email, password);

      // After successful login, get the role from the updated auth context
      // We need to refetch from localStorage since the hook state won't be updated yet in this render
      const authSession = localStorage.getItem("auth_session");
      const sessionData = authSession ? JSON.parse(authSession) : null;
      const currentUserRole = sessionData?.userRole;
      const currentIsStoreUser = sessionData?.isStoreUser;

      // Clear session expiration message on successful login
      setSessionMessage(null);

      // Call success callback or redirect based on user type
      if (onSuccess) {
        onSuccess();
      } else {
        // Check for redirect path saved before session expiration
        let redirectPath: string | null = null;
        try {
          redirectPath = sessionStorage.getItem("redirect_after_login");
          if (redirectPath) {
            sessionStorage.removeItem("redirect_after_login");
          }
        } catch {
          // Ignore storage errors
        }

        // Role-based redirect (unless we have a saved redirect path):
        // - Store-level users (CLIENT_USER, STORE_MANAGER, SHIFT_MANAGER, CASHIER) go to /mystore
        // - CLIENT_OWNER goes to /client-dashboard (client owner dashboard)
        // - Admin users (SUPERADMIN) go to /dashboard (admin dashboard)
        if (redirectPath && !redirectPath.includes("/login")) {
          // Validate redirect path matches user's role
          const isStoreRedirect = redirectPath.startsWith("/mystore");
          const isClientRedirect = redirectPath.startsWith("/client-dashboard");
          const isAdminRedirect = redirectPath.startsWith("/dashboard");

          if (
            (currentIsStoreUser && isStoreRedirect) ||
            (currentUserRole === "CLIENT_OWNER" && isClientRedirect) ||
            (!currentIsStoreUser &&
              currentUserRole !== "CLIENT_OWNER" &&
              isAdminRedirect)
          ) {
            router.push(redirectPath);
            return;
          }
        }

        // Default role-based redirect
        if (currentIsStoreUser) {
          router.push("/mystore");
        } else if (currentUserRole === "CLIENT_OWNER") {
          router.push("/client-dashboard");
        } else {
          router.push("/dashboard");
        }
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "An error occurred";
      setError(errorMessage);

      // Show toast for specific errors
      if (errorMessage.includes("invalid role")) {
        toast({
          title: "Authentication Error",
          description:
            "Your account has an invalid role. Please contact support.",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold">Welcome back</h1>
        <p className="text-gray-500">
          Enter your credentials to access your account
        </p>
      </div>

      {/* Session expiration message */}
      {sessionMessage && (
        <Alert
          variant={
            sessionMessage.title === "Logged Out" ? "default" : "destructive"
          }
          className="border-amber-500 bg-amber-50 dark:bg-amber-950"
        >
          <Clock className="h-4 w-4" />
          <AlertTitle>{sessionMessage.title}</AlertTitle>
          <AlertDescription>{sessionMessage.message}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
            autoComplete="email"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              minLength={6}
              autoComplete="current-password"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              disabled={isLoading}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 disabled:opacity-50"
              aria-label={showPassword ? "Hide" : "Show"}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "Signing in..." : "Sign In"}
        </Button>
      </form>
    </div>
  );
}
