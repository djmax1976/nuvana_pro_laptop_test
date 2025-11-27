"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Dashboard layout for authenticated admin pages
 * Uses DashboardLayout component with sidebar and header
 * Redirects to login if user is not authenticated
 * Redirects client users to their dedicated dashboard
 */
export default function DashboardRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading, isClientUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.push("/login");
      } else if (isClientUser) {
        // Client users should not access admin dashboard - redirect to client dashboard
        router.push("/client-dashboard");
      }
    }
  }, [isAuthenticated, isLoading, isClientUser, router]);

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Don't render dashboard if not authenticated or if client user
  if (!isAuthenticated || isClientUser) {
    return null;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
