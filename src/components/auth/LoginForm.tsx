"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

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
  const { login, userRole, isStoreUser } = useAuth();

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

      // Call success callback or redirect based on user type
      if (onSuccess) {
        onSuccess();
      } else {
        // Role-based redirect:
        // - Store-level users (CLIENT_USER, STORE_MANAGER, SHIFT_MANAGER, CASHIER) go to /mystore
        // - CLIENT_OWNER goes to /client-dashboard (client owner dashboard)
        // - Admin users (SUPERADMIN) go to /dashboard (admin dashboard)
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
