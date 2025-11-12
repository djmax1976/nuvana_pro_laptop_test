"use client";

import { useState, useEffect, Suspense } from "react";
import { supabase } from "@/lib/auth/supabase";
import { useRouter, useSearchParams } from "next/navigation";

// Mark as dynamic to prevent prerendering
export const dynamic = "force-dynamic";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Handle OAuth errors from URL params
  useEffect(() => {
    const error = searchParams.get("error");
    if (error) {
      setErrorMessage("Authentication failed. Please try again.");
    }
  }, [searchParams]);

  const handleOAuthLogin = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      // Get the current origin for redirect URL
      const redirectUrl = `${window.location.origin}/auth/callback`;

      // Initiate OAuth login with Supabase
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google", // Can be configured to use other providers
        options: {
          redirectTo: redirectUrl,
        },
      });

      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
      }
      // Note: User will be redirected to OAuth provider, so we don't set loading to false here
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "An error occurred during login",
      );
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-md w-full items-center justify-center font-mono text-sm">
        <h1 className="text-4xl font-bold text-center mb-8">Login</h1>

        {errorMessage && (
          <div
            data-testid="auth-error-message"
            className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded"
          >
            {errorMessage}
          </div>
        )}

        <button
          data-testid="oauth-login-button"
          onClick={handleOAuthLogin}
          disabled={isLoading}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isLoading ? "Loading..." : "Sign in with Google"}
        </button>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
