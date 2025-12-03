"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClientDashboardLayout } from "@/components/layout/ClientDashboardLayout";
import {
  ClientAuthProvider,
  useClientAuth,
} from "@/contexts/ClientAuthContext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Inner layout component that uses client auth context
 * Only CLIENT_OWNER role users can access /client-dashboard
 */
function ClientDashboardLayoutInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading, userRole, isStoreUser } = useClientAuth();
  const router = useRouter();

  // CLIENT_OWNER is the only role that can access /client-dashboard
  const isClientOwner = userRole === "CLIENT_OWNER";

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        // Not authenticated - redirect to unified login
        router.push("/login");
      } else if (isStoreUser) {
        // Store-level users should go to /mystore
        router.push("/mystore");
      } else if (!isClientOwner) {
        // Authenticated but not CLIENT_OWNER - redirect to appropriate dashboard
        router.push("/dashboard");
      }
    }
  }, [isAuthenticated, isLoading, isClientOwner, isStoreUser, router]);

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

  // Don't render dashboard if not authenticated or not CLIENT_OWNER
  if (!isAuthenticated || !isClientOwner) {
    return null;
  }

  return <ClientDashboardLayout>{children}</ClientDashboardLayout>;
}

/**
 * Client Dashboard route layout
 * Protects all routes under (client-dashboard) from unauthorized access
 * Only allows users who are authenticated with CLIENT_OWNER role
 * Redirects store-level users to /mystore, non-client users to /dashboard
 *
 * @requirements
 * - AC #3: Redirect if not authenticated as CLIENT_OWNER
 * - Route protection with proper loading states
 */
export default function ClientDashboardRouteLayout({
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
        <ClientDashboardLayoutInner>{children}</ClientDashboardLayoutInner>
      </ClientAuthProvider>
    </QueryClientProvider>
  );
}
