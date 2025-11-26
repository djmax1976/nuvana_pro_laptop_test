"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Client Login Page - Redirects to unified login
 *
 * This page exists for backwards compatibility and SEO.
 * All authentication now goes through the unified /login page,
 * which handles role-based redirect after successful authentication.
 *
 * Client users (is_client_user=true) are automatically redirected
 * to /client-dashboard after logging in via /login.
 */
export default function ClientLoginPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to unified login page
    router.replace("/login");
  }, [router]);

  // Show loading state while redirecting
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="space-y-4 text-center">
        <div className="h-10 w-10 mx-auto animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-muted-foreground">Redirecting to login...</p>
      </div>
    </div>
  );
}
