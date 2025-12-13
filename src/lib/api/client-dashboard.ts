/**
 * Client Dashboard API client functions
 * Provides functions for interacting with the client dashboard API
 * All functions require CLIENT_DASHBOARD_ACCESS permission (Client Users only)
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

/**
 * Company status values
 */
export type CompanyStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING";

/**
 * Store status values
 */
export type StoreStatus = "ACTIVE" | "INACTIVE" | "CLOSED";

/**
 * Owned company entity for client dashboard
 */
export interface OwnedCompany {
  company_id: string;
  name: string;
  address: string | null;
  status: CompanyStatus;
  created_at: string;
  store_count: number;
}

/**
 * Owned store entity for client dashboard
 */
export interface OwnedStore {
  store_id: string;
  company_id: string;
  company_name: string;
  name: string;
  location_json: {
    address?: string;
    gps?: { lat: number; lng: number };
  } | null;
  timezone: string;
  status: StoreStatus;
  created_at: string;
}

/**
 * Dashboard statistics
 */
export interface DashboardStats {
  total_companies: number;
  total_stores: number;
  active_stores: number;
  total_employees: number;
  today_transactions: number;
}

/**
 * Client dashboard response
 */
export interface ClientDashboardResponse {
  user: {
    id: string;
    email: string;
    name: string;
  };
  companies: OwnedCompany[];
  stores: OwnedStore[];
  stats: DashboardStats;
}

/**
 * API error response
 */
interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

/**
 * API success response
 */
interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * Make authenticated API request
 * Uses credentials: "include" to send httpOnly cookies
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  // Only set Content-Type header if there's a body
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers,
  });

  // Capture status before consuming response
  const status = response.status;
  const statusText = response.statusText;

  if (!response.ok) {
    const errorData: ApiError = await response.json().catch(() => ({
      success: false,
      error: {
        code: "UNKNOWN_ERROR",
        message: `HTTP ${status}: ${statusText}`,
      },
    }));

    throw new Error(
      errorData.error?.message || errorData.error?.code || "API request failed",
    );
  }

  const result = await response.json();

  // Runtime validation of response payload
  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    result.success !== true ||
    !("data" in result) ||
    result.data === undefined
  ) {
    // Only include payload preview in development/test to prevent information leakage in production
    // Truncate to 500 chars to prevent huge error messages
    // In test environment, we need the payload for debugging test failures
    const payloadPreview =
      process.env.NODE_ENV !== "production"
        ? ` Payload: ${JSON.stringify(result, null, 2).slice(0, 500)}`
        : "";
    throw new Error(
      `Invalid API response format: Expected { success: true, data: T }. ` +
        `HTTP Status: ${status} ${statusText}.${payloadPreview}`,
    );
  }

  return result.data;
}

/**
 * Get client dashboard data
 * Returns user info, owned companies, stores, and stats
 * @returns Client dashboard data
 */
export async function getClientDashboard(): Promise<ClientDashboardResponse> {
  return apiRequest<ClientDashboardResponse>("/api/client/dashboard", {
    method: "GET",
  });
}

/**
 * Get stores for a specific owned company
 * @param companyId - Company UUID (must be owned by current user)
 * @returns List of stores for the company
 */
export async function getOwnedCompanyStores(
  companyId: string,
): Promise<OwnedStore[]> {
  if (!companyId) {
    throw new Error("Company ID is required");
  }

  return apiRequest<OwnedStore[]>(`/api/client/companies/${companyId}/stores`, {
    method: "GET",
  });
}

/**
 * Get company details for an owned company
 * @param companyId - Company UUID (must be owned by current user)
 * @returns Company details
 */
export async function getOwnedCompany(
  companyId: string,
): Promise<OwnedCompany> {
  if (!companyId) {
    throw new Error("Company ID is required");
  }

  return apiRequest<OwnedCompany>(`/api/client/companies/${companyId}`, {
    method: "GET",
  });
}

/**
 * Get store details for an owned store
 * @param storeId - Store UUID (must be in a company owned by current user)
 * @returns Store details
 */
export async function getOwnedStore(storeId: string): Promise<OwnedStore> {
  if (!storeId) {
    throw new Error("Store ID is required");
  }

  return apiRequest<OwnedStore>(`/api/client/stores/${storeId}`, {
    method: "GET",
  });
}

// ============ TanStack Query Hooks ============

/**
 * Query key factory for client dashboard queries
 */
export const clientDashboardKeys = {
  all: ["client-dashboard"] as const,
  dashboard: () => [...clientDashboardKeys.all, "dashboard"] as const,
  companies: () => [...clientDashboardKeys.all, "companies"] as const,
  company: (id: string) => [...clientDashboardKeys.companies(), id] as const,
  stores: () => [...clientDashboardKeys.all, "stores"] as const,
  companyStores: (companyId: string) =>
    [...clientDashboardKeys.stores(), "company", companyId] as const,
  store: (id: string) => [...clientDashboardKeys.stores(), id] as const,
};

/**
 * Hook to fetch client dashboard data
 * Returns user info, owned companies, stores, and stats
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with dashboard data
 */
export function useClientDashboard(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: clientDashboardKeys.dashboard(),
    queryFn: getClientDashboard,
    enabled: options?.enabled !== false,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 30000, // Consider data fresh for 30 seconds
  });
}

/**
 * Hook to fetch stores for a specific owned company
 * @param companyId - Company UUID
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with stores data
 */
export function useOwnedCompanyStores(
  companyId: string | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: clientDashboardKeys.companyStores(companyId || ""),
    queryFn: () => getOwnedCompanyStores(companyId!),
    enabled: options?.enabled !== false && !!companyId,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook to fetch owned company details
 * @param companyId - Company UUID
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with company data
 */
export function useOwnedCompany(
  companyId: string | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: clientDashboardKeys.company(companyId || ""),
    queryFn: () => getOwnedCompany(companyId!),
    enabled: options?.enabled !== false && !!companyId,
  });
}

/**
 * Hook to fetch owned store details
 * @param storeId - Store UUID
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with store data
 */
export function useOwnedStore(
  storeId: string | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: clientDashboardKeys.store(storeId || ""),
    queryFn: () => getOwnedStore(storeId!),
    enabled: options?.enabled !== false && !!storeId,
  });
}

/**
 * Hook to invalidate client dashboard queries
 * Useful after mutations that affect dashboard data
 */
export function useInvalidateClientDashboard() {
  const queryClient = useQueryClient();

  return {
    invalidateDashboard: () =>
      queryClient.invalidateQueries({
        queryKey: clientDashboardKeys.dashboard(),
      }),
    invalidateAll: () =>
      queryClient.invalidateQueries({
        queryKey: clientDashboardKeys.all,
      }),
  };
}
