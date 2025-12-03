"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MyStoreDashboardLayout } from "@/components/layout/MyStoreDashboardLayout";
import {
  ClientAuthProvider,
  useClientAuth,
} from "@/contexts/ClientAuthContext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Inner layout component that uses client auth context
 */
function MyStoreDashboardLayoutInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading, isClientUser } = useClientAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        // Not authenticated - redirect to unified login
        router.push("/login");
      } else if (!isClientUser) {
        // Authenticated but not a client user - redirect to main app
        router.push("/");
      }
    }
  }, [isAuthenticated, isLoading, isClientUser, router]);

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <div className="h-10 w-10 mx-auto animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render dashboard if not authenticated or not a client user
  if (!isAuthenticated || !isClientUser) {
    return null;
  }

  return <MyStoreDashboardLayout>{children}</MyStoreDashboardLayout>;
}

/**
 * MyStore Terminal Dashboard route layout
 * Protects all routes under (mystore) from unauthorized access
 * Only allows users who are authenticated and are client users
 * Redirects non-client users to the appropriate dashboard
 *
 * @requirements
 * - AC #1: Redirect CLIENT_USER to /mystore dashboard
 * - Route protection with proper loading states
 */
export default function MyStoreDashboardRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Create a QueryClient instance per component tree for proper cache isolation
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30000, // 30 seconds
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ClientAuthProvider>
        <MyStoreDashboardLayoutInner>{children}</MyStoreDashboardLayoutInner>
      </ClientAuthProvider>
    </QueryClientProvider>
  );
}
