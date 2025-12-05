"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

interface LoginFormProps {
  onSuccess?: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  // Define explicit set of allowed roles
  const ALLOWED_ROLES = [
    "CLIENT_OWNER",
    "CLIENT_USER",
    "STORE_MANAGER",
    "SHIFT_MANAGER",
    "CASHIER",
    "SUPERADMIN",
  ] as const;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const backendUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

      const response = await fetch(`${backendUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Important for httpOnly cookies
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || data.message || "Login failed");
      }

      // Get user role and client user flag for routing
      // Backend returns { success: true, data: { user: { ... } } }
      const userData = data.data?.user || data.user;
      const userRole = userData?.user_role;
      const isClientUser = userData?.is_client_user === true;

      // Validate userRole against explicit set of allowed roles
      const isValidRole =
        userRole &&
        typeof userRole === "string" &&
        ALLOWED_ROLES.includes(userRole as any);
      if (!isValidRole) {
        // Log minimal non-PII info in production, detailed info in development
        if (process.env.NODE_ENV === "development") {
          console.error("[LoginForm] Role validation failed:", {
            userRole,
            allowedRoles: ALLOWED_ROLES,
            userData: userData,
          });
        } else {
          console.error("[LoginForm] Role validation failed:", {
            userRole,
            allowedRoles: ALLOWED_ROLES,
            userId: userData?.id
              ? `user_${userData.id.substring(0, 8)}...`
              : "unknown",
          });
        }

        toast({
          title: "Authentication Error",
          description:
            "Your account has an invalid role. Please contact support.",
          variant: "destructive",
        });

        // Clear any partial auth state
        localStorage.removeItem("auth_session");
        localStorage.removeItem("client_auth_session");

        // Redirect to login page (safe fallback)
        setTimeout(() => {
          router.push("/login");
        }, 2000);

        setError("Invalid user role. Redirecting to login...");
        setIsLoading(false);
        return;
      }

      // Determine if user should go to mystore (terminal dashboard)
      // Only store-level roles go to /mystore: CLIENT_USER, STORE_MANAGER, SHIFT_MANAGER, CASHIER
      // CLIENT_OWNER goes to /dashboard (client owner dashboard)
      const isStoreUser = [
        "CLIENT_USER",
        "STORE_MANAGER",
        "SHIFT_MANAGER",
        "CASHIER",
      ].includes(userRole);

      // Store basic user info for UI (not for auth - that's in httpOnly cookies)
      // Always use single source of truth: "auth_session" with role information
      // Clear both keys to prevent stale/conflicting entries
      localStorage.removeItem("auth_session");
      localStorage.removeItem("client_auth_session");
      localStorage.setItem(
        "auth_session",
        JSON.stringify({
          user: userData,
          authenticated: true,
          isClientUser: isClientUser,
          isStoreUser: isStoreUser,
          userRole: userRole,
        }),
      );

      // Call success callback or redirect based on user type
      if (onSuccess) {
        onSuccess();
      } else {
        // Role-based redirect:
        // - Store-level users (CLIENT_USER, STORE_MANAGER, SHIFT_MANAGER, CASHIER) go to /mystore
        // - CLIENT_OWNER goes to /client-dashboard (client owner dashboard)
        // - Admin users (SUPERADMIN) go to /dashboard (admin dashboard)
        if (isStoreUser) {
          router.push("/mystore");
        } else if (userRole === "CLIENT_OWNER") {
          router.push("/client-dashboard");
        } else {
          router.push("/dashboard");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
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
          <Input
            id="password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLoading}
            minLength={6}
            autoComplete="current-password"
          />
        </div>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "Signing in..." : "Sign In"}
        </Button>
      </form>
    </div>
  );
}
