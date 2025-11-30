/**
 * Shift API client functions
 * Provides functions for interacting with the shift API
 * All functions require appropriate shift permissions
 *
 * Story: 4.7 - Shift Management UI
 */

import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// ============ Types ============

/**
 * Shift status enum
 */
export type ShiftStatus =
  | "NOT_STARTED"
  | "OPEN"
  | "ACTIVE"
  | "CLOSING"
  | "RECONCILING"
  | "CLOSED"
  | "VARIANCE_REVIEW";

/**
 * Shift query filters
 */
export interface ShiftQueryFilters {
  status?: ShiftStatus;
  store_id?: string;
  from?: string; // ISO 8601 date string
  to?: string; // ISO 8601 date string
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  limit: number;
  offset: number;
}

/**
 * Shift response
 */
export interface ShiftResponse {
  shift_id: string;
  store_id: string;
  opened_by: string;
  cashier_id: string;
  pos_terminal_id: string;
  status: ShiftStatus;
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number | null;
  variance_amount: number | null;
  variance_percentage: number | null;
  opened_at: string; // ISO 8601
  closed_at: string | null; // ISO 8601
  // Extended fields from joins (optional, populated by backend)
  store_name?: string;
  cashier_name?: string;
  opener_name?: string;
}

/**
 * Shift detail response
 * Extended response for shift detail view with transaction count and variance details
 * Story 4.7: Shift Management UI
 */
export interface ShiftDetailResponse extends ShiftResponse {
  transaction_count: number;
  variance_reason: string | null;
  approved_by: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

/**
 * Shift query result
 */
export interface ShiftQueryResult {
  shifts: ShiftResponse[];
  meta: PaginationMeta;
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

/**
 * API error response
 */
export interface ApiError {
  success: false;
  error: string;
  message: string;
}

// ============ API Request Helper ============

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

  if (!response.ok) {
    const errorData: ApiError = await response.json().catch(() => ({
      success: false,
      error: "Unknown error",
      message: `HTTP ${response.status}: ${response.statusText}`,
    }));

    throw new Error(
      errorData.message || errorData.error || "API request failed",
    );
  }

  return response.json();
}

// ============ API Functions ============

/**
 * Build query string from filters and pagination
 */
function buildQueryString(
  filters?: ShiftQueryFilters,
  pagination?: PaginationOptions,
): string {
  const params = new URLSearchParams();

  if (filters?.status) {
    params.append("status", filters.status);
  }
  if (filters?.store_id) {
    params.append("store_id", filters.store_id);
  }
  if (filters?.from) {
    params.append("from", filters.from);
  }
  if (filters?.to) {
    params.append("to", filters.to);
  }

  if (pagination?.limit != null) {
    params.append("limit", pagination.limit.toString());
  }
  if (pagination?.offset != null) {
    params.append("offset", pagination.offset.toString());
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

/**
 * Get shifts with filters and pagination
 * @param filters - Query filters (status, store_id, from, to)
 * @param pagination - Pagination options (limit, offset)
 * @returns Shift query result with shifts and pagination meta
 */
export async function getShifts(
  filters?: ShiftQueryFilters,
  pagination?: PaginationOptions,
): Promise<ApiResponse<ShiftQueryResult>> {
  const queryString = buildQueryString(filters, pagination);
  return apiRequest<ApiResponse<ShiftQueryResult>>(
    `/api/shifts${queryString}`,
    {
      method: "GET",
    },
  );
}

/**
 * Get shift details by ID
 * @param shiftId - Shift UUID
 * @returns Shift detail response with transaction count and variance details
 * Story 4.7: Shift Management UI
 */
export async function getShiftById(
  shiftId: string,
): Promise<ApiResponse<ShiftDetailResponse>> {
  return apiRequest<ApiResponse<ShiftDetailResponse>>(
    `/api/shifts/${shiftId}`,
    {
      method: "GET",
    },
  );
}

/**
 * Open shift input
 * cashier_id is optional - if not provided, backend auto-assigns from authenticated user
 */
export interface OpenShiftInput {
  store_id: string;
  cashier_id?: string;
  pos_terminal_id: string;
  opening_cash: number;
}

/**
 * Open shift response
 */
export interface OpenShiftResponse {
  shift_id: string;
  store_id: string;
  opened_by: string;
  cashier_id: string;
  pos_terminal_id: string;
  opened_at: string;
  opening_cash: number;
  status: ShiftStatus;
}

/**
 * Close shift response
 */
export interface CloseShiftResponse {
  shift_id: string;
  status: ShiftStatus;
  closing_initiated_at: string;
  closing_initiated_by: string;
  expected_cash: number;
  opening_cash: number;
  cash_transactions_total: number;
  calculated_at: string;
}

/**
 * Reconcile cash input
 */
export interface ReconcileCashInput {
  closing_cash?: number;
  variance_reason?: string;
}

/**
 * Reconcile cash response
 */
export interface ReconcileCashResponse {
  shift_id: string;
  status: ShiftStatus;
  closing_cash: number;
  expected_cash: number;
  variance_amount: number;
  variance_percentage: number;
  variance_reason?: string;
  reconciled_at?: string;
  reconciled_by?: string;
  approved_by?: string;
  approved_at?: string;
  closed_at?: string;
}

/**
 * Open a new shift
 * @param data - Shift opening data
 * @returns Created shift response
 */
export async function openShift(
  data: OpenShiftInput,
): Promise<ApiResponse<OpenShiftResponse>> {
  return apiRequest<ApiResponse<OpenShiftResponse>>("/api/shifts/open", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Initiate shift closing
 * @param shiftId - Shift UUID
 * @returns Close shift response with expected cash
 */
export async function closeShift(
  shiftId: string,
): Promise<ApiResponse<CloseShiftResponse>> {
  return apiRequest<ApiResponse<CloseShiftResponse>>(
    `/api/shifts/${shiftId}/close`,
    {
      method: "POST",
    },
  );
}

/**
 * Reconcile cash for a shift
 * @param shiftId - Shift UUID
 * @param data - Reconciliation data
 * @returns Reconciliation response
 */
export async function reconcileCash(
  shiftId: string,
  data: ReconcileCashInput,
): Promise<ApiResponse<ReconcileCashResponse>> {
  return apiRequest<ApiResponse<ReconcileCashResponse>>(
    `/api/shifts/${shiftId}/reconcile`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    },
  );
}

// ============ TanStack Query Keys ============

/**
 * Query key factory for shift queries
 */
export const shiftKeys = {
  all: ["shifts"] as const,
  lists: () => [...shiftKeys.all, "list"] as const,
  list: (filters?: ShiftQueryFilters, pagination?: PaginationOptions) =>
    [
      ...shiftKeys.lists(),
      filters || {},
      pagination || { limit: 50, offset: 0 },
    ] as const,
  details: () => [...shiftKeys.all, "detail"] as const,
  detail: (shiftId: string | undefined) =>
    [...shiftKeys.details(), shiftId] as const,
};

// ============ TanStack Query Hooks ============

/**
 * Hook to fetch shifts with filters and pagination
 * @param filters - Query filters
 * @param pagination - Pagination options (default: limit 50, offset 0)
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with shifts data
 */
export function useShifts(
  filters?: ShiftQueryFilters,
  pagination?: PaginationOptions,
  options?: { enabled?: boolean },
) {
  const defaultPagination: PaginationOptions = {
    limit: 50,
    offset: 0,
  };

  return useQuery({
    queryKey: shiftKeys.list(filters, pagination || defaultPagination),
    queryFn: () => getShifts(filters, pagination || defaultPagination),
    enabled: options?.enabled !== false,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 30000, // Consider data fresh for 30 seconds
    select: (response) => response.data,
  });
}

/**
 * Hook to invalidate shift queries
 * Useful after mutations that affect shift data
 */
export function useInvalidateShifts() {
  const queryClient = useQueryClient();

  return {
    invalidateList: () =>
      queryClient.invalidateQueries({ queryKey: shiftKeys.lists() }),
    invalidateDetail: (shiftId: string) => {
      return queryClient.invalidateQueries({
        queryKey: shiftKeys.detail(shiftId),
      });
    },
    invalidateAll: () =>
      queryClient.invalidateQueries({ queryKey: shiftKeys.all }),
  };
}

/**
 * Hook to open a new shift
 * @returns Mutation hook for opening shifts
 */
export function useOpenShift() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: openShift,
    onSuccess: () => {
      // Invalidate shift list queries to refresh the list
      queryClient.invalidateQueries({ queryKey: shiftKeys.lists() });
    },
  });
}

/**
 * Hook to close a shift
 * @returns Mutation hook for closing shifts
 */
export function useCloseShift() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: closeShift,
    onSuccess: () => {
      // Invalidate shift list and detail queries to refresh after closing
      queryClient.invalidateQueries({ queryKey: shiftKeys.lists() });
      queryClient.invalidateQueries({ queryKey: shiftKeys.details() });
    },
  });
}

/**
 * Hook to reconcile cash for a shift
 * @returns Mutation hook for reconciling shifts
 */
export function useReconcileCash() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      shiftId,
      data,
    }: {
      shiftId: string;
      data: ReconcileCashInput;
    }) => reconcileCash(shiftId, data),
    onSuccess: () => {
      // Invalidate shift list and detail queries to refresh
      queryClient.invalidateQueries({ queryKey: shiftKeys.lists() });
      queryClient.invalidateQueries({ queryKey: shiftKeys.details() });
    },
  });
}

/**
 * Hook to fetch shift details by ID
 * @param shiftId - Shift UUID
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with shift detail data
 * Story 4.7: Shift Management UI
 */
export function useShiftDetail(
  shiftId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: shiftKeys.detail(shiftId ?? undefined),
    queryFn: () => getShiftById(shiftId!),
    enabled: options?.enabled !== false && shiftId !== null,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    staleTime: 30000, // Consider data fresh for 30 seconds
    select: (response) => response.data,
  });
}
