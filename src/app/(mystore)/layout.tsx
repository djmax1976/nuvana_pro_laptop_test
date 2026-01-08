"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { MyStoreDashboardLayout } from "@/components/layout/MyStoreDashboardLayout";
import {
  ClientAuthProvider,
  useClientAuth,
} from "@/contexts/ClientAuthContext";
import { CashierSessionProvider } from "@/contexts/CashierSessionContext";
import { StoreProvider, type StoreContextValue } from "@/contexts/StoreContext";
import { useClientDashboard } from "@/lib/api/client-dashboard";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@/lib/query-client-factory";

/**
 * Default timezone fallback constant
 * Used when store timezone is unavailable or invalid
 *
 * MCP Guidance Applied:
 * - FE-001: STATE_MANAGEMENT - Documented fallback value for timezone
 * - SEC-014: INPUT_VALIDATION - Safe default prevents undefined behavior
 */
const DEFAULT_TIMEZONE = "UTC";

/**
 * IANA timezone validation regex
 * Matches patterns like: America/New_York, Europe/London, Asia/Tokyo, UTC
 *
 * MCP Guidance Applied:
 * - SEC-014: INPUT_VALIDATION - Strict format validation before use
 */
const IANA_TIMEZONE_REGEX = /^[A-Za-z_]+\/[A-Za-z_]+$|^UTC$/;

/**
 * Validates IANA timezone string format and existence
 * Uses Intl.DateTimeFormat for runtime validation
 *
 * @param timezone - Timezone string to validate
 * @returns true if valid IANA timezone, false otherwise
 *
 * MCP Guidance Applied:
 * - SEC-014: INPUT_VALIDATION - Validate external input using strict allowlists
 * - FE-002: FORM_VALIDATION - Mirror backend validation client-side
 */
function isValidIANATimezone(timezone: string | null | undefined): boolean {
  // Null/undefined check
  if (!timezone || typeof timezone !== "string") {
    return false;
  }

  // Length constraint (reasonable max for timezone strings)
  if (timezone.length > 50) {
    return false;
  }

  // Format check (basic pattern matching)
  if (!IANA_TIMEZONE_REGEX.test(timezone)) {
    return false;
  }

  // Runtime validation using Intl.DateTimeFormat
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Store Context Provider Wrapper
 * Fetches dashboard data and provides store context with timezone
 *
 * This component bridges the gap between authentication and store context,
 * ensuring all child components have access to the current store's timezone
 * for proper date/time formatting.
 *
 * MCP Guidance Applied:
 * - FE-001: STATE_MANAGEMENT - Encapsulate state handling in dedicated modules
 * - FE-005: UI_SECURITY - No secrets exposed; only store metadata
 * - SEC-014: INPUT_VALIDATION - Timezone validated before use
 *
 * @requirements
 * - Provide store timezone to all child components via StoreContext
 * - Handle loading and error states gracefully
 * - Fallback to UTC if timezone unavailable or invalid
 */
function StoreContextProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const {
    data: dashboardData,
    isLoading: dashboardLoading,
    isError: dashboardError,
  } = useClientDashboard();

  /**
   * Compute store context value from dashboard data
   * Memoized to prevent unnecessary re-renders
   *
   * Selection logic:
   * 1. Find first ACTIVE store
   * 2. Fallback to first store in list
   * 3. Fallback to defaults if no stores
   *
   * MCP Guidance Applied:
   * - FE-001: STATE_MANAGEMENT - Memoized computation for performance
   * - SEC-014: INPUT_VALIDATION - Timezone validated with fallback
   */
  const storeContextValue = useMemo<StoreContextValue>(() => {
    // Default value when no data available
    if (!dashboardData?.stores || dashboardData.stores.length === 0) {
      return {
        storeId: null,
        timezone: DEFAULT_TIMEZONE,
        storeName: null,
        companyId: null,
        clientId: null,
      };
    }

    // Find first active store, fallback to first store
    const activeStore =
      dashboardData.stores.find((store) => store.status === "ACTIVE") ||
      dashboardData.stores[0];

    // Validate and sanitize timezone
    // SEC-014: INPUT_VALIDATION - Validate timezone before use
    const rawTimezone = activeStore?.timezone;
    const validatedTimezone = isValidIANATimezone(rawTimezone)
      ? rawTimezone
      : DEFAULT_TIMEZONE;

    return {
      storeId: activeStore?.store_id ?? null,
      timezone: validatedTimezone,
      storeName: activeStore?.name ?? null,
      companyId: activeStore?.company_id ?? null,
      clientId: null, // Not available in OwnedStore type
    };
  }, [dashboardData?.stores]);

  // During dashboard loading, provide default context to prevent errors
  // Children will receive updates once data loads
  if (dashboardLoading) {
    return (
      <StoreProvider
        value={{
          storeId: null,
          timezone: DEFAULT_TIMEZONE,
          storeName: null,
          companyId: null,
          clientId: null,
        }}
      >
        {children}
      </StoreProvider>
    );
  }

  // On error, provide default context with fallback timezone
  // Allows app to continue functioning with UTC dates
  if (dashboardError) {
    return (
      <StoreProvider
        value={{
          storeId: null,
          timezone: DEFAULT_TIMEZONE,
          storeName: null,
          companyId: null,
          clientId: null,
        }}
      >
        {children}
      </StoreProvider>
    );
  }

  return <StoreProvider value={storeContextValue}>{children}</StoreProvider>;
}

/**
 * Inner layout component that uses client auth context
 * Only allows store-level users (CLIENT_USER, STORE_MANAGER, SHIFT_MANAGER, CASHIER)
 * CLIENT_OWNER users should be redirected to /client-dashboard
 *
 * Session Expiration: Handled automatically by api-client.ts
 * When any API returns 401, user is redirected to login
 *
 * MCP Guidance Applied:
 * - FE-001: STATE_MANAGEMENT - Auth state managed via context
 * - FE-005: UI_SECURITY - No sensitive data exposed in loading states
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
  // FE-005: UI_SECURITY - Generic loading message, no sensitive data
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

  // Wrap with StoreContextProviderWrapper to provide timezone
  // This ensures all child components have access to store timezone
  return (
    <StoreContextProviderWrapper>
      <MyStoreDashboardLayout>{children}</MyStoreDashboardLayout>
    </StoreContextProviderWrapper>
  );
}

/**
 * MyStore Terminal Dashboard route layout
 * Protects all routes under (mystore) from unauthorized access
 * Only allows users who are authenticated and have store-level roles
 * (CLIENT_USER, STORE_MANAGER, SHIFT_MANAGER, CASHIER)
 * Redirects CLIENT_OWNER to /client-dashboard
 *
 * Session Expiration Handling:
 * Uses createQueryClient() which includes global 401 error handlers.
 * When any API returns 401, user is automatically redirected to /login.
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
  // Create a QueryClient with proper 401 handling for session expiration
  // This ensures users are redirected to login when their session expires
  const [queryClient] = useState(() => createQueryClient({ staleTime: 30000 }));

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
