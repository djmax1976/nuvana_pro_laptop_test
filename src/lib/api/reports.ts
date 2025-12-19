/**
 * X/Z Report API Client
 *
 * Frontend API functions for viewing X and Z reports.
 * Phase 6.5: Shift & Day Summary Implementation Plan
 *
 * Enterprise coding standards applied:
 * - API-001: Schema validation using TypeScript types
 * - FE-001: HttpOnly cookies for auth tokens
 * - API-003: Error handling with typed responses
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

// ============ Types ============

/**
 * X Report (mid-shift snapshot)
 */
export interface XReport {
  x_report_id: string;
  shift_id: string;
  store_id: string;
  report_number: number;
  generated_at: string;
  generated_by: string;
  generated_by_name?: string;
  // Snapshot data
  gross_sales: number;
  returns_total: number;
  discounts_total: number;
  net_sales: number;
  tax_collected: number;
  transaction_count: number;
  items_sold_count: number;
  cash_in_drawer: number;
  expected_cash: number;
  // Printing info
  print_count: number;
  last_printed_at: string | null;
  // Metadata
  created_at: string;
}

/**
 * Z Report (end-of-shift final snapshot)
 */
export interface ZReport {
  z_report_id: string;
  shift_id: string;
  store_id: string;
  business_date: string;
  z_number: number;
  generated_at: string;
  // Shift info
  shift_opened_at: string;
  shift_closed_at: string;
  cashier_id: string;
  cashier_name?: string;
  // Financial summary
  opening_cash: number;
  closing_cash: number;
  gross_sales: number;
  returns_total: number;
  discounts_total: number;
  net_sales: number;
  tax_collected: number;
  transaction_count: number;
  items_sold_count: number;
  expected_cash: number;
  variance_amount: number;
  variance_percentage: number;
  // Tender breakdown
  tender_breakdown: Array<{
    tender_code: string;
    tender_name: string;
    amount: number;
    transaction_count: number;
  }>;
  // Department breakdown
  department_breakdown: Array<{
    department_code: string;
    department_name: string;
    gross_sales: number;
    item_count: number;
  }>;
  // Tax breakdown
  tax_breakdown: Array<{
    tax_name: string;
    tax_rate: number;
    taxable_amount: number;
    tax_collected: number;
  }>;
  // Integrity
  integrity_hash: string;
  is_verified: boolean;
  // Printing/export info
  print_count: number;
  last_printed_at: string | null;
  export_count: number;
  last_exported_at: string | null;
  last_exported_format: string | null;
  // Metadata
  created_at: string;
}

/**
 * Z Report sequence summary
 */
export interface ZReportSequenceSummary {
  store_id: string;
  total_z_reports: number;
  latest_z_number: number | null;
  first_z_report_date: string | null;
  last_z_report_date: string | null;
  gaps: number[];
}

/**
 * Query parameters for listing X/Z reports
 */
export interface ReportQueryParams {
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

/**
 * Z Report specific query params
 */
export interface ZReportQueryParams extends ReportQueryParams {
  business_date?: string;
  from_z_number?: number;
  to_z_number?: number;
}

/**
 * API response wrapper
 */
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  meta?: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
    store_id?: string;
    shift_id?: string;
    latest_z_number?: number;
  };
}

/**
 * API error response
 */
interface ApiError {
  success: false;
  error: string | { code: string; message: string };
  message?: string;
}

// ============ API Request Helper ============

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

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

    let errorMessage: string;
    if (errorData.message) {
      errorMessage = errorData.message;
    } else if (typeof errorData.error === "string") {
      errorMessage = errorData.error;
    } else if (
      typeof errorData.error === "object" &&
      errorData.error?.message
    ) {
      errorMessage = errorData.error.message;
    } else {
      errorMessage = "API request failed";
    }

    throw new Error(errorMessage);
  }

  return response.json();
}

// ============ X Report API Functions ============

/**
 * Get X reports for a shift
 */
export async function getXReportsByShift(
  shiftId: string,
): Promise<ApiResponse<XReport[]>> {
  return apiRequest<ApiResponse<XReport[]>>(
    `/api/shifts/${shiftId}/x-reports`,
    { method: "GET" },
  );
}

/**
 * Get X reports for a store
 */
export async function getXReportsByStore(
  storeId: string,
  params?: ReportQueryParams,
): Promise<ApiResponse<XReport[]>> {
  const searchParams = new URLSearchParams();

  if (params?.start_date) {
    searchParams.append("start_date", params.start_date);
  }
  if (params?.end_date) {
    searchParams.append("end_date", params.end_date);
  }
  if (params?.limit !== undefined) {
    searchParams.append("limit", String(params.limit));
  }
  if (params?.offset !== undefined) {
    searchParams.append("offset", String(params.offset));
  }

  const queryString = searchParams.toString();
  const endpoint = `/api/stores/${storeId}/x-reports${queryString ? `?${queryString}` : ""}`;

  return apiRequest<ApiResponse<XReport[]>>(endpoint, { method: "GET" });
}

/**
 * Get X report by ID
 */
export async function getXReportById(
  xReportId: string,
): Promise<ApiResponse<XReport>> {
  return apiRequest<ApiResponse<XReport>>(`/api/x-reports/${xReportId}`, {
    method: "GET",
  });
}

/**
 * Generate a new X report for a shift
 */
export async function generateXReport(
  shiftId: string,
): Promise<ApiResponse<XReport>> {
  return apiRequest<ApiResponse<XReport>>(`/api/shifts/${shiftId}/x-reports`, {
    method: "POST",
  });
}

/**
 * Mark X report as printed
 */
export async function markXReportPrinted(
  xReportId: string,
  printCountIncrement?: number,
): Promise<ApiResponse<XReport>> {
  return apiRequest<ApiResponse<XReport>>(
    `/api/x-reports/${xReportId}/printed`,
    {
      method: "POST",
      body: JSON.stringify({ print_count_increment: printCountIncrement || 1 }),
    },
  );
}

// ============ Z Report API Functions ============

/**
 * Get Z report for a shift
 */
export async function getZReportByShift(
  shiftId: string,
): Promise<ApiResponse<ZReport>> {
  return apiRequest<ApiResponse<ZReport>>(`/api/shifts/${shiftId}/z-report`, {
    method: "GET",
  });
}

/**
 * Get Z reports for a store
 */
export async function getZReportsByStore(
  storeId: string,
  params?: ZReportQueryParams,
): Promise<ApiResponse<ZReport[]>> {
  const searchParams = new URLSearchParams();

  if (params?.start_date) {
    searchParams.append("start_date", params.start_date);
  }
  if (params?.end_date) {
    searchParams.append("end_date", params.end_date);
  }
  if (params?.business_date) {
    searchParams.append("business_date", params.business_date);
  }
  if (params?.from_z_number !== undefined) {
    searchParams.append("from_z_number", String(params.from_z_number));
  }
  if (params?.to_z_number !== undefined) {
    searchParams.append("to_z_number", String(params.to_z_number));
  }
  if (params?.limit !== undefined) {
    searchParams.append("limit", String(params.limit));
  }
  if (params?.offset !== undefined) {
    searchParams.append("offset", String(params.offset));
  }

  const queryString = searchParams.toString();
  const endpoint = `/api/stores/${storeId}/z-reports${queryString ? `?${queryString}` : ""}`;

  return apiRequest<ApiResponse<ZReport[]>>(endpoint, { method: "GET" });
}

/**
 * Get Z report by ID
 */
export async function getZReportById(
  zReportId: string,
): Promise<ApiResponse<ZReport>> {
  return apiRequest<ApiResponse<ZReport>>(`/api/z-reports/${zReportId}`, {
    method: "GET",
  });
}

/**
 * Get Z report by store and Z number
 */
export async function getZReportByNumber(
  storeId: string,
  zNumber: number,
): Promise<ApiResponse<ZReport>> {
  return apiRequest<ApiResponse<ZReport>>(
    `/api/stores/${storeId}/z-reports/${zNumber}`,
    { method: "GET" },
  );
}

/**
 * Get Z report sequence summary
 */
export async function getZReportSequence(
  storeId: string,
): Promise<ApiResponse<ZReportSequenceSummary>> {
  return apiRequest<ApiResponse<ZReportSequenceSummary>>(
    `/api/stores/${storeId}/z-reports/sequence`,
    { method: "GET" },
  );
}

/**
 * Verify Z report integrity
 */
export async function verifyZReportIntegrity(zReportId: string): Promise<
  ApiResponse<{
    z_report_id: string;
    integrity_valid: boolean;
    verified_at: string;
  }>
> {
  return apiRequest<
    ApiResponse<{
      z_report_id: string;
      integrity_valid: boolean;
      verified_at: string;
    }>
  >(`/api/z-reports/${zReportId}/verify`, { method: "GET" });
}

/**
 * Mark Z report as printed
 */
export async function markZReportPrinted(
  zReportId: string,
  printCountIncrement?: number,
): Promise<ApiResponse<ZReport>> {
  return apiRequest<ApiResponse<ZReport>>(
    `/api/z-reports/${zReportId}/printed`,
    {
      method: "POST",
      body: JSON.stringify({ print_count_increment: printCountIncrement || 1 }),
    },
  );
}

/**
 * Mark Z report as exported
 */
export async function markZReportExported(
  zReportId: string,
  exportFormat: string,
): Promise<ApiResponse<ZReport>> {
  return apiRequest<ApiResponse<ZReport>>(
    `/api/z-reports/${zReportId}/exported`,
    {
      method: "POST",
      body: JSON.stringify({ export_format: exportFormat }),
    },
  );
}

// ============ TanStack Query Keys ============

export const xReportKeys = {
  all: ["x-reports"] as const,
  lists: () => [...xReportKeys.all, "list"] as const,
  listByShift: (shiftId: string) =>
    [...xReportKeys.lists(), "shift", shiftId] as const,
  listByStore: (storeId: string, params?: ReportQueryParams) =>
    [...xReportKeys.lists(), "store", storeId, params || {}] as const,
  details: () => [...xReportKeys.all, "detail"] as const,
  detail: (xReportId: string) => [...xReportKeys.details(), xReportId] as const,
};

export const zReportKeys = {
  all: ["z-reports"] as const,
  lists: () => [...zReportKeys.all, "list"] as const,
  listByStore: (storeId: string, params?: ZReportQueryParams) =>
    [...zReportKeys.lists(), "store", storeId, params || {}] as const,
  byShift: (shiftId: string) => [...zReportKeys.all, "shift", shiftId] as const,
  details: () => [...zReportKeys.all, "detail"] as const,
  detail: (zReportId: string) => [...zReportKeys.details(), zReportId] as const,
  byNumber: (storeId: string, zNumber: number) =>
    [...zReportKeys.all, "by-number", storeId, zNumber] as const,
  sequence: (storeId: string) =>
    [...zReportKeys.all, "sequence", storeId] as const,
};

// ============ X Report Query Hooks ============

/**
 * Hook to fetch X reports for a shift
 */
export function useXReportsByShift(
  shiftId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: xReportKeys.listByShift(shiftId || ""),
    queryFn: () => getXReportsByShift(shiftId!),
    enabled: options?.enabled !== false && shiftId !== null,
    select: (response) => response.data,
    staleTime: 30000,
  });
}

/**
 * Hook to fetch X reports for a store
 */
export function useXReportsByStore(
  storeId: string | null,
  params?: ReportQueryParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: xReportKeys.listByStore(storeId || "", params),
    queryFn: () => getXReportsByStore(storeId!, params),
    enabled: options?.enabled !== false && storeId !== null,
    select: (response) => response.data,
    staleTime: 30000,
  });
}

/**
 * Hook to fetch X report by ID
 */
export function useXReport(
  xReportId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: xReportKeys.detail(xReportId || ""),
    queryFn: () => getXReportById(xReportId!),
    enabled: options?.enabled !== false && xReportId !== null,
    select: (response) => response.data,
  });
}

/**
 * Hook to generate X report
 */
export function useGenerateXReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (shiftId: string) => generateXReport(shiftId),
    onSuccess: (_, shiftId) => {
      queryClient.invalidateQueries({
        queryKey: xReportKeys.listByShift(shiftId),
      });
    },
  });
}

/**
 * Hook to mark X report as printed
 */
export function useMarkXReportPrinted() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      xReportId,
      printCountIncrement,
    }: {
      xReportId: string;
      printCountIncrement?: number;
    }) => markXReportPrinted(xReportId, printCountIncrement),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: xReportKeys.detail(variables.xReportId),
      });
    },
  });
}

// ============ Z Report Query Hooks ============

/**
 * Hook to fetch Z report for a shift
 */
export function useZReportByShift(
  shiftId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: zReportKeys.byShift(shiftId || ""),
    queryFn: () => getZReportByShift(shiftId!),
    enabled: options?.enabled !== false && shiftId !== null,
    select: (response) => response.data,
    staleTime: 60000,
  });
}

/**
 * Hook to fetch Z reports for a store
 */
export function useZReportsByStore(
  storeId: string | null,
  params?: ZReportQueryParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: zReportKeys.listByStore(storeId || "", params),
    queryFn: () => getZReportsByStore(storeId!, params),
    enabled: options?.enabled !== false && storeId !== null,
    select: (response) => response.data,
    staleTime: 30000,
  });
}

/**
 * Hook to fetch Z report by ID
 */
export function useZReport(
  zReportId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: zReportKeys.detail(zReportId || ""),
    queryFn: () => getZReportById(zReportId!),
    enabled: options?.enabled !== false && zReportId !== null,
    select: (response) => response.data,
  });
}

/**
 * Hook to fetch Z report by number
 */
export function useZReportByNumber(
  storeId: string | null,
  zNumber: number | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: zReportKeys.byNumber(storeId || "", zNumber || 0),
    queryFn: () => getZReportByNumber(storeId!, zNumber!),
    enabled: options?.enabled !== false && storeId !== null && zNumber !== null,
    select: (response) => response.data,
  });
}

/**
 * Hook to fetch Z report sequence summary
 */
export function useZReportSequence(
  storeId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: zReportKeys.sequence(storeId || ""),
    queryFn: () => getZReportSequence(storeId!),
    enabled: options?.enabled !== false && storeId !== null,
    select: (response) => response.data,
    staleTime: 60000,
  });
}

/**
 * Hook to verify Z report integrity
 */
export function useVerifyZReportIntegrity() {
  return useMutation({
    mutationFn: (zReportId: string) => verifyZReportIntegrity(zReportId),
  });
}

/**
 * Hook to mark Z report as printed
 */
export function useMarkZReportPrinted() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      zReportId,
      printCountIncrement,
    }: {
      zReportId: string;
      printCountIncrement?: number;
    }) => markZReportPrinted(zReportId, printCountIncrement),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: zReportKeys.detail(variables.zReportId),
      });
    },
  });
}

/**
 * Hook to mark Z report as exported
 */
export function useMarkZReportExported() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      zReportId,
      exportFormat,
    }: {
      zReportId: string;
      exportFormat: string;
    }) => markZReportExported(zReportId, exportFormat),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: zReportKeys.detail(variables.zReportId),
      });
    },
  });
}
