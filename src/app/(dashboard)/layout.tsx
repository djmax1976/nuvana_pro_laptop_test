"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { SessionExpirationGuard } from "@/components/session/SessionExpirationGuard";

/**
 * Dashboard layout for authenticated SUPERADMIN users only
 * Uses DashboardLayout component with sidebar and header
 * Redirects to login if user is not authenticated
 * Redirects store-level users (CLIENT_USER, STORE_MANAGER, etc.) to /mystore
 * Redirects CLIENT_OWNER users to /client-dashboard (their proper dashboard)
 *
 * Session Expiration Handling:
 * - Real-time session monitoring with warning modal
 * - Automatic logout when session expires
 * - Cross-tab synchronization
 */
export default function DashboardRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading, isStoreUser, userRole } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.push("/login");
      } else if (isStoreUser) {
        // Store-level users (CLIENT_USER, STORE_MANAGER, SHIFT_MANAGER, CASHIER)
        // should use /mystore terminal dashboard, not the admin dashboard
        router.push("/mystore");
      } else if (userRole === "CLIENT_OWNER") {
        // CLIENT_OWNER users should use /client-dashboard, not the admin dashboard
        router.push("/client-dashboard");
      }
    }
  }, [isAuthenticated, isLoading, isStoreUser, userRole, router]);

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Don't render dashboard if not authenticated, store-level user, or CLIENT_OWNER
  if (!isAuthenticated || isStoreUser || userRole === "CLIENT_OWNER") {
    return null;
  }

  return (
    <SessionExpirationGuard
      loginPath="/login"
      warningMessage="Your admin session is about to expire due to inactivity. Would you like to stay logged in?"
    >
      <DashboardLayout>{children}</DashboardLayout>
    </SessionExpirationGuard>
  );
}
