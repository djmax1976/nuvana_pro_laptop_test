"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  const handleCallback = useCallback(
    async (code: string) => {
      try {
        // Call backend callback endpoint
        const backendUrl =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        const response = await fetch(
          `${backendUrl}/api/auth/callback?code=${code}`,
          {
            method: "GET",
            credentials: "include",
          },
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Authentication failed");
        }

        const data = await response.json();

        // Store user session
        if (data.user) {
          localStorage.setItem("auth_session", JSON.stringify(data.user));
          // Redirect to dashboard
          router.push("/dashboard");
        } else {
          throw new Error("No user data received");
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to complete authentication",
        );
        router.push(
          `/login?error=${encodeURIComponent(err instanceof Error ? err.message : "unknown")}`,
        );
      }
    },
    [router],
  );

  useEffect(() => {
    const code = searchParams.get("code");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      setError("Authentication failed. Please try again.");
      router.push("/login?error=auth_failed");
      return;
    }

    if (code) {
      handleCallback(code);
    } else {
      setError("No authorization code received");
      router.push("/login?error=no_code");
    }
  }, [searchParams, router, handleCallback]);

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-24">
        <div className="text-red-600">{error}</div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div>Completing authentication...</div>
    </main>
  );
}
