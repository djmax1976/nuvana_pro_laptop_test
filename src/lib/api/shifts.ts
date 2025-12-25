/**
 * Shift API client functions
 * Provides functions for interacting with the shift API
 * All functions require appropriate shift permissions
 *
 * Story: 4.7 - Shift Management UI
 *
 * Uses shared API client for consistent:
 * - 401/session expiration handling (automatic redirect to login)
 * - Error formatting with ApiError class
 * - Timeout configuration (30s default)
 * - Credential handling (httpOnly cookies)
 */

import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import apiClient from "./client";

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
  // Report-related fields (optional, populated for shift list views)
  net_sales?: number;
  x_report_count?: number;
  has_z_report?: boolean;
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
  const response = await apiClient.get<ApiResponse<ShiftQueryResult>>(
    `/api/shifts${queryString}`,
  );
  return response.data;
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
  const response = await apiClient.get<ApiResponse<ShiftDetailResponse>>(
    `/api/shifts/${shiftId}`,
  );
  return response.data;
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
 * Close shift response (simplified single-step flow)
 * Story: Simplified Shift Closing
 */
export interface CloseShiftResponse {
  shift_id: string;
  status: ShiftStatus;
  closing_cash: number;
  closed_at: string;
  closed_by: string;
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
  const response = await apiClient.post<ApiResponse<OpenShiftResponse>>(
    "/api/shifts/open",
    data,
  );
  return response.data;
}

/**
 * Close shift input (simplified single-step flow)
 * Story: Simplified Shift Closing
 */
export interface CloseShiftInput {
  closing_cash: number;
}

/**
 * Close a shift directly with closing cash (simplified single-step flow)
 * Goes directly from OPEN/ACTIVE → CLOSED
 *
 * Story: Simplified Shift Closing
 *
 * @param shiftId - Shift UUID
 * @param closingCash - Actual cash in drawer
 * @returns Close shift response
 */
export async function closeShift(
  shiftId: string,
  closingCash: number,
): Promise<ApiResponse<CloseShiftResponse>> {
  const response = await apiClient.post<ApiResponse<CloseShiftResponse>>(
    `/api/shifts/${shiftId}/close`,
    { closing_cash: closingCash },
  );
  return response.data;
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
  const response = await apiClient.put<ApiResponse<ReconcileCashResponse>>(
    `/api/shifts/${shiftId}/reconcile`,
    data,
  );
  return response.data;
}

/**
 * Start a shift for a terminal
 *
 * Requires a valid cashier session token from authenticateCashier().
 * The cashier_id is extracted from the session token on the backend.
 *
 * Story 4.92: Terminal Shift Page
 *
 * @param terminalId - Terminal UUID
 * @param sessionToken - Cashier session token from authenticateCashier()
 */
export async function startShift(
  terminalId: string,
  sessionToken: string,
): Promise<ApiResponse<ShiftResponse & { shift_number: number | null }>> {
  const response = await apiClient.post<
    ApiResponse<ShiftResponse & { shift_number: number | null }>
  >(
    `/api/terminals/${terminalId}/shifts/start`,
    {}, // No body needed - cashier_id from session
    {
      headers: {
        "X-Cashier-Session": sessionToken,
      },
    },
  );
  return response.data;
}

/**
 * Get active shift for a terminal
 * Story 4.92: Terminal Shift Page
 */
export async function getActiveShift(
  terminalId: string,
): Promise<
  ApiResponse<(ShiftResponse & { shift_number: number | null }) | null>
> {
  const response = await apiClient.get<
    ApiResponse<(ShiftResponse & { shift_number: number | null }) | null>
  >(`/api/terminals/${terminalId}/shifts/active`);
  return response.data;
}

/**
 * Update starting cash for a shift
 *
 * Requires a valid cashier session token from authenticateCashier().
 * The cashier_id is extracted from the session token on the backend.
 *
 * Story 4.92: Terminal Shift Page
 *
 * @param shiftId - Shift UUID
 * @param startingCash - Starting cash amount
 * @param sessionToken - Cashier session token from authenticateCashier()
 */
export async function updateStartingCash(
  shiftId: string,
  startingCash: number,
  sessionToken: string,
): Promise<ApiResponse<ShiftResponse & { shift_number: number | null }>> {
  const response = await apiClient.put<
    ApiResponse<ShiftResponse & { shift_number: number | null }>
  >(
    `/api/shifts/${shiftId}/starting-cash`,
    { starting_cash: startingCash },
    {
      headers: {
        "X-Cashier-Session": sessionToken,
      },
    },
  );
  return response.data;
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
  active: () => [...shiftKeys.all, "active"] as const,
  activeByTerminal: (terminalId: string | undefined) =>
    [...shiftKeys.active(), terminalId] as const,
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
 * Hook to close a shift directly (simplified single-step flow)
 * Story: Simplified Shift Closing
 * @returns Mutation hook for closing shifts
 */
export function useCloseShift() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      shiftId,
      closingCash,
    }: {
      shiftId: string;
      closingCash: number;
    }) => closeShift(shiftId, closingCash),
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

/**
 * Hook to start a shift for a terminal
 *
 * Requires a valid cashier session token from authenticateCashier().
 *
 * Story 4.92: Terminal Shift Page
 */
export function useShiftStart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      terminalId,
      sessionToken,
    }: {
      terminalId: string;
      sessionToken: string;
    }) => startShift(terminalId, sessionToken),
    onSuccess: (_, variables) => {
      // Invalidate active shift query for this terminal
      queryClient.invalidateQueries({
        queryKey: shiftKeys.activeByTerminal(variables.terminalId),
      });
      // Invalidate shift list queries
      queryClient.invalidateQueries({ queryKey: shiftKeys.lists() });
    },
  });
}

/**
 * Hook to get active shift for a terminal
 * Story 4.92: Terminal Shift Page
 */
export function useActiveShift(
  terminalId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: shiftKeys.activeByTerminal(terminalId ?? undefined),
    queryFn: () => getActiveShift(terminalId!),
    enabled: options?.enabled !== false && terminalId !== null,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    staleTime: 10000, // Consider data fresh for 10 seconds (more frequent for active shift)
    select: (response) => response.data,
  });
}

/**
 * Hook to update starting cash for a shift
 *
 * Requires a valid cashier session token from authenticateCashier().
 *
 * Story 4.92: Terminal Shift Page
 */
export function useUpdateStartingCash() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      shiftId,
      startingCash,
      sessionToken,
    }: {
      shiftId: string;
      startingCash: number;
      sessionToken: string;
    }) => updateStartingCash(shiftId, startingCash, sessionToken),
    onSuccess: (response, variables) => {
      // Extract terminalId from response
      const terminalId = response.data?.pos_terminal_id;

      // Invalidate shift detail query
      queryClient.invalidateQueries({
        queryKey: shiftKeys.detail(variables.shiftId),
      });
      // Invalidate shift list queries
      queryClient.invalidateQueries({ queryKey: shiftKeys.lists() });
      // Invalidate active shift query for the terminal if terminalId is available
      if (terminalId) {
        queryClient.invalidateQueries({
          queryKey: shiftKeys.activeByTerminal(terminalId),
        });
      }
    },
  });
}

// ============ Open Shifts Check API ============

/**
 * Open shift detail for UX display
 * SEC-014: Only contains necessary fields for display
 */
export interface OpenShiftDetail {
  shift_id: string;
  terminal_name: string | null;
  cashier_name: string;
  status: string;
  opened_at: string;
}

/**
 * Response type for open shifts check
 * FE-002: Structured response for form validation/display
 */
export interface OpenShiftsCheckResponse {
  has_open_shifts: boolean;
  open_shift_count: number;
  open_shifts: OpenShiftDetail[];
}

/**
 * Check for open shifts on a given business date
 * @param storeId - Store UUID
 * @param businessDate - Business date (YYYY-MM-DD), defaults to today
 * @returns Open shifts check response
 */
export async function checkOpenShifts(
  storeId: string,
  businessDate?: string,
): Promise<ApiResponse<OpenShiftsCheckResponse>> {
  const params = businessDate ? { business_date: businessDate } : {};
  const response = await apiClient.get<ApiResponse<OpenShiftsCheckResponse>>(
    `/api/stores/${storeId}/shifts/open-check`,
    { params },
  );
  return response.data;
}

/**
 * Query key for open shifts check
 */
export const openShiftsCheckKeys = {
  all: ["open-shifts-check"] as const,
  check: (storeId: string | undefined, businessDate: string | undefined) =>
    [...openShiftsCheckKeys.all, storeId, businessDate] as const,
};

/**
 * Hook to check for open shifts on a given business date
 *
 * Defense-in-depth: Frontend uses this to show blocking UI
 * Backend still enforces the rule - this is for UX only
 *
 * FE-002: Form validation - disable day close when shifts are open
 *
 * @param storeId - Store UUID
 * @param businessDate - Business date (YYYY-MM-DD), defaults to today
 * @param options - Query options (enabled, etc.)
 */
export function useOpenShiftsCheck(
  storeId: string | undefined,
  businessDate?: string,
  options?: { enabled?: boolean },
) {
  // BUSINESS RULE: For day close blocking, we check ALL open shifts (no date filter)
  // Only pass businessDate if explicitly provided for reporting use cases
  // When businessDate is undefined, backend returns ALL open shifts regardless of when opened

  return useQuery({
    queryKey: openShiftsCheckKeys.check(storeId, businessDate),
    queryFn: () => checkOpenShifts(storeId!, businessDate),
    enabled: options?.enabled !== false && !!storeId,
    staleTime: 10000, // 10 seconds - refresh frequently during day close flow
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    select: (response) => response.data,
  });
}
