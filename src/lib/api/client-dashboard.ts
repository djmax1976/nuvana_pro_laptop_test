/**
 * Client Dashboard API client functions
 * Provides functions for interacting with the client dashboard API
 * All functions require CLIENT_DASHBOARD_ACCESS permission (Client Users only)
 *
 * Uses shared API client for consistent:
 * - 401/session expiration handling (automatic redirect to login)
 * - Error formatting with ApiError class
 * - Timeout configuration (30s default)
 * - Credential handling (httpOnly cookies)
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import apiClient, { extractData, ApiResponse } from "./client";

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
 * Today's sales data from DaySummary
 * When today has no data, returns the most recent available date's data
 */
export interface TodaySalesData {
  fuel_sales: number;
  fuel_gallons: number;
  net_sales: number;
  gross_sales: number;
  tax_collected: number;
  lottery_sales: number | null;
  lottery_net: number | null;
  transaction_count: number;
  avg_transaction: number;
  /** The actual business date of the data (may differ from today if no data for today) */
  business_date: string | null;
}

/**
 * Daily sales data for trend charts
 */
export interface DailySalesData {
  date: string;
  fuel_sales: number;
  net_sales: number;
  gross_sales: number;
  lottery_sales: number | null;
  tax_collected: number;
}

/**
 * Sales data response from /api/client/dashboard/sales
 */
export interface SalesDataResponse {
  today: TodaySalesData;
  week: DailySalesData[];
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
 * Get client dashboard data
 * Returns user info, owned companies, stores, and stats
 * @returns Client dashboard data
 */
export async function getClientDashboard(): Promise<ClientDashboardResponse> {
  const response = await apiClient.get<ApiResponse<ClientDashboardResponse>>(
    "/api/client/dashboard",
  );
  return extractData(response);
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

  const response = await apiClient.get<OwnedStore[]>(
    `/api/client/companies/${companyId}/stores`,
  );
  return response.data;
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

  const response = await apiClient.get<OwnedCompany>(
    `/api/client/companies/${companyId}`,
  );
  return response.data;
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

  const response = await apiClient.get<OwnedStore>(
    `/api/client/stores/${storeId}`,
  );
  return response.data;
}

// ============ TanStack Query Hooks ============

/**
 * Get dashboard sales data (today + 7-day trend)
 * Returns fuel sales, net sales, lottery, and transaction metrics
 * @returns Sales data for dashboard KPI cards
 */
export async function getDashboardSales(): Promise<SalesDataResponse> {
  const response = await apiClient.get<ApiResponse<SalesDataResponse>>(
    "/api/client/dashboard/sales",
  );
  return extractData(response);
}

/**
 * Query key factory for client dashboard queries
 */
export const clientDashboardKeys = {
  all: ["client-dashboard"] as const,
  dashboard: () => [...clientDashboardKeys.all, "dashboard"] as const,
  sales: () => [...clientDashboardKeys.all, "sales"] as const,
  companies: () => [...clientDashboardKeys.all, "companies"] as const,
  company: (id: string) => [...clientDashboardKeys.companies(), id] as const,
  stores: () => [...clientDashboardKeys.all, "stores"] as const,
  companyStores: (companyId: string) =>
    [...clientDashboardKeys.stores(), "company", companyId] as const,
  store: (id: string) => [...clientDashboardKeys.stores(), id] as const,
};

// Dashboard refresh interval: 5 minutes (300,000ms)
const DASHBOARD_REFETCH_INTERVAL = 5 * 60 * 1000;

/**
 * Hook to fetch client dashboard data
 * Returns user info, owned companies, stores, and stats
 * Auto-refreshes every 5 minutes for near real-time updates
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
    staleTime: 60000, // Consider data fresh for 1 minute
    refetchInterval: DASHBOARD_REFETCH_INTERVAL, // Auto-refresh every 5 minutes
  });
}

/**
 * Hook to fetch dashboard sales data (today + 7-day trend)
 * Returns fuel sales, net sales, lottery, and transaction metrics
 * Auto-refreshes every 5 minutes for near real-time updates
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with sales data
 */
export function useDashboardSales(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: clientDashboardKeys.sales(),
    queryFn: getDashboardSales,
    enabled: options?.enabled !== false,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 60000, // Consider data fresh for 1 minute
    refetchInterval: DASHBOARD_REFETCH_INTERVAL, // Auto-refresh every 5 minutes
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
