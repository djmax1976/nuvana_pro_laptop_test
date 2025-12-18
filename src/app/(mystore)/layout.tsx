"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MyStoreDashboardLayout } from "@/components/layout/MyStoreDashboardLayout";
import {
  ClientAuthProvider,
  useClientAuth,
} from "@/contexts/ClientAuthContext";
import { CashierSessionProvider } from "@/contexts/CashierSessionContext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Inner layout component that uses client auth context
 * Only allows store-level users (CLIENT_USER, STORE_MANAGER, SHIFT_MANAGER, CASHIER)
 * CLIENT_OWNER users should be redirected to /client-dashboard
 *
 * Session Expiration: Handled automatically by api-client.ts
 * When any API returns 401, user is redirected to login
 */
function MyStoreDashboardLayoutInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading, isStoreUser, userRole } = useClientAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        // Not authenticated - redirect to unified login
        router.push("/login");
      } else if (!isStoreUser) {
        // Authenticated but not a store-level user
        // CLIENT_OWNER goes to /client-dashboard, others to /dashboard
        if (userRole === "CLIENT_OWNER") {
          router.push("/client-dashboard");
        } else {
          router.push("/dashboard");
        }
      }
    }
  }, [isAuthenticated, isLoading, isStoreUser, userRole, router]);

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

  // Don't render dashboard if not authenticated or not a store-level user
  if (!isAuthenticated || !isStoreUser) {
    return null;
  }

  return <MyStoreDashboardLayout>{children}</MyStoreDashboardLayout>;
}

/**
 * MyStore Terminal Dashboard route layout
 * Protects all routes under (mystore) from unauthorized access
 * Only allows users who are authenticated and have store-level roles
 * (CLIENT_USER, STORE_MANAGER, SHIFT_MANAGER, CASHIER)
 * Redirects CLIENT_OWNER to /client-dashboard
 *
 * @requirements
 * - AC #1: Redirect store-level users to /mystore dashboard
 * - AC #2: Redirect CLIENT_OWNER to /client-dashboard (not /mystore)
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
        <CashierSessionProvider>
          <MyStoreDashboardLayoutInner>{children}</MyStoreDashboardLayoutInner>
        </CashierSessionProvider>
      </ClientAuthProvider>
    </QueryClientProvider>
  );
}
