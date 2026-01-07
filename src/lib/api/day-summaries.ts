/**
 * Day Summary API Client
 *
 * Frontend API functions for managing day summaries.
 * Phase 6.4: Shift & Day Summary Implementation Plan
 *
 * Enterprise coding standards applied:
 * - API-001: Schema validation using TypeScript types
 * - FE-001: HttpOnly cookies for auth tokens
 * - API-003: Error handling with typed responses
 *
 * Uses shared API client for consistent:
 * - 401/session expiration handling (automatic redirect to login)
 * - Error formatting with ApiError class
 * - Timeout configuration (30s default)
 * - Credential handling (httpOnly cookies)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "./client";

// ============ Types ============

/**
 * Day summary status enum
 */
export type DaySummaryStatus = "OPEN" | "CLOSED";

/**
 * Tender summary breakdown
 */
export interface TenderSummary {
  tender_code: string;
  tender_name: string;
  transaction_count: number;
  amount: number;
}

/**
 * Department summary breakdown
 */
export interface DepartmentSummary {
  department_code: string;
  department_name: string;
  item_count: number;
  gross_sales: number;
  discounts: number;
  net_sales: number;
}

/**
 * Tax summary breakdown
 */
export interface TaxSummary {
  tax_rate_id: string;
  tax_name: string;
  tax_rate: number;
  taxable_amount: number;
  tax_collected: number;
}

/**
 * Hourly summary breakdown
 */
export interface HourlySummary {
  hour: number;
  transaction_count: number;
  gross_sales: number;
  net_sales: number;
  item_count: number;
}

/**
 * Day summary response from the API
 */
export interface DaySummary {
  day_summary_id: string;
  store_id: string;
  business_date: string;
  status: DaySummaryStatus;
  shift_count: number;
  transaction_count: number;
  items_sold_count: number;
  gross_sales: number;
  returns_total: number;
  discounts_total: number;
  net_sales: number;
  tax_collected: number;
  total_cash: number;
  total_credit: number;
  total_debit: number;
  total_other_tender: number;
  expected_cash: number;
  actual_cash: number;
  total_cash_variance: number;
  notes: string | null;
  closed_by: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  tender_summaries?: TenderSummary[];
  department_summaries?: DepartmentSummary[];
  tax_summaries?: TaxSummary[];
  hourly_summaries?: HourlySummary[];
}

/**
 * Query parameters for listing day summaries
 */
export interface DaySummaryQueryParams {
  start_date?: string;
  end_date?: string;
  status?: DaySummaryStatus;
  include_tender_summaries?: boolean;
  include_department_summaries?: boolean;
  include_tax_summaries?: boolean;
  include_hourly_summaries?: boolean;
}

/**
 * Period report totals - aggregated metrics for weekly/monthly reports
 */
export interface PeriodTotals {
  gross_sales: number;
  returns_total: number;
  discounts_total: number;
  net_sales: number;
  tax_collected: number;
  transaction_count: number;
  items_sold_count: number;
  avg_daily_sales: number;
  avg_transaction_value: number;
  total_variance: number;
  shift_count: number;
  lottery_sales: number | null;
  lottery_net: number | null;
  fuel_sales: number | null;
  fuel_gallons: number | null;
}

/**
 * Daily breakdown item for period reports
 */
export interface DayBreakdownItem {
  business_date: string;
  shift_count: number;
  net_sales: number;
  gross_sales: number;
  transaction_count: number;
  variance_amount: number;
  status: string;
}

/**
 * Weekly breakdown item for monthly reports
 */
export interface WeekBreakdownItem {
  week_number: number;
  week_start: string;
  week_end: string;
  net_sales: number;
  gross_sales: number;
  transaction_count: number;
  shift_count: number;
  variance_amount: number;
}

/**
 * Weekly report response (with nested totals and daily breakdown)
 */
export interface WeeklyReport {
  store_id: string;
  period_type: "week";
  period_start: string;
  period_end: string;
  day_count: number;
  totals: PeriodTotals;
  daily_breakdown: DayBreakdownItem[];
}

/**
 * Monthly report response (with nested totals, daily, and weekly breakdowns)
 */
export interface MonthlyReport {
  store_id: string;
  period_type: "month";
  period_start: string;
  period_end: string;
  day_count: number;
  totals: PeriodTotals;
  daily_breakdown: DayBreakdownItem[];
  weekly_breakdown?: WeekBreakdownItem[];
}

/**
 * Date range report response
 */
export interface DateRangeReport {
  store_id: string;
  start_date: string;
  end_date: string;
  day_count: number;
  shift_count: number;
  gross_sales: number;
  returns_total: number;
  discounts_total: number;
  net_sales: number;
  tax_collected: number;
  transaction_count: number;
  items_sold_count: number;
  avg_daily_sales: number;
  avg_transaction: number;
  total_cash_variance: number;
  daily_breakdown?: DaySummary[];
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
    store_id: string;
  };
}

// ============ API Functions ============

/**
 * Get day summaries for a store
 */
export async function getDaySummaries(
  storeId: string,
  params?: DaySummaryQueryParams,
): Promise<ApiResponse<DaySummary[]>> {
  const searchParams = new URLSearchParams();

  if (params?.start_date) {
    searchParams.append("start_date", params.start_date);
  }
  if (params?.end_date) {
    searchParams.append("end_date", params.end_date);
  }
  if (params?.status) {
    searchParams.append("status", params.status);
  }
  if (params?.include_tender_summaries) {
    searchParams.append("include_tender_summaries", "true");
  }
  if (params?.include_department_summaries) {
    searchParams.append("include_department_summaries", "true");
  }
  if (params?.include_tax_summaries) {
    searchParams.append("include_tax_summaries", "true");
  }
  if (params?.include_hourly_summaries) {
    searchParams.append("include_hourly_summaries", "true");
  }

  const queryString = searchParams.toString();
  const endpoint = `/api/stores/${storeId}/day-summaries${queryString ? `?${queryString}` : ""}`;

  const response = await apiClient.get<ApiResponse<DaySummary[]>>(endpoint);
  return response.data;
}

/**
 * Get day summary for a specific date
 */
export async function getDaySummaryByDate(
  storeId: string,
  date: string,
  params?: {
    include_tender_summaries?: boolean;
    include_department_summaries?: boolean;
    include_tax_summaries?: boolean;
    include_hourly_summaries?: boolean;
  },
): Promise<ApiResponse<DaySummary>> {
  const searchParams = new URLSearchParams();

  if (params?.include_tender_summaries) {
    searchParams.append("include_tender_summaries", "true");
  }
  if (params?.include_department_summaries) {
    searchParams.append("include_department_summaries", "true");
  }
  if (params?.include_tax_summaries) {
    searchParams.append("include_tax_summaries", "true");
  }
  if (params?.include_hourly_summaries) {
    searchParams.append("include_hourly_summaries", "true");
  }

  const queryString = searchParams.toString();
  const endpoint = `/api/stores/${storeId}/day-summary/${date}${queryString ? `?${queryString}` : ""}`;

  const response = await apiClient.get<ApiResponse<DaySummary>>(endpoint);
  return response.data;
}

/**
 * Get day summary by ID
 */
export async function getDaySummaryById(
  daySummaryId: string,
  params?: {
    include_tender_summaries?: boolean;
    include_department_summaries?: boolean;
    include_tax_summaries?: boolean;
    include_hourly_summaries?: boolean;
  },
): Promise<ApiResponse<DaySummary>> {
  const searchParams = new URLSearchParams();

  if (params?.include_tender_summaries) {
    searchParams.append("include_tender_summaries", "true");
  }
  if (params?.include_department_summaries) {
    searchParams.append("include_department_summaries", "true");
  }
  if (params?.include_tax_summaries) {
    searchParams.append("include_tax_summaries", "true");
  }
  if (params?.include_hourly_summaries) {
    searchParams.append("include_hourly_summaries", "true");
  }

  const queryString = searchParams.toString();
  const endpoint = `/api/day-summaries/${daySummaryId}${queryString ? `?${queryString}` : ""}`;

  const response = await apiClient.get<ApiResponse<DaySummary>>(endpoint);
  return response.data;
}

/**
 * Close a business day
 */
export async function closeDay(
  storeId: string,
  date: string,
  notes?: string,
): Promise<ApiResponse<DaySummary>> {
  const response = await apiClient.post<ApiResponse<DaySummary>>(
    `/api/stores/${storeId}/day-summary/${date}/close`,
    { notes },
  );
  return response.data;
}

/**
 * Update day notes
 */
export async function updateDayNotes(
  storeId: string,
  date: string,
  notes: string,
): Promise<ApiResponse<DaySummary>> {
  const response = await apiClient.patch<ApiResponse<DaySummary>>(
    `/api/stores/${storeId}/day-summary/${date}/notes`,
    { notes },
  );
  return response.data;
}

/**
 * Get weekly report
 */
export async function getWeeklyReport(
  storeId: string,
  weekOf?: string,
): Promise<ApiResponse<WeeklyReport>> {
  const searchParams = new URLSearchParams();
  if (weekOf) {
    searchParams.append("week_of", weekOf);
  }

  const queryString = searchParams.toString();
  const endpoint = `/api/stores/${storeId}/reports/weekly${queryString ? `?${queryString}` : ""}`;

  const response = await apiClient.get<ApiResponse<WeeklyReport>>(endpoint);
  return response.data;
}

/**
 * Get monthly report
 */
export async function getMonthlyReport(
  storeId: string,
  year: number,
  month: number,
): Promise<ApiResponse<MonthlyReport>> {
  const endpoint = `/api/stores/${storeId}/reports/monthly?year=${year}&month=${month}`;
  const response = await apiClient.get<ApiResponse<MonthlyReport>>(endpoint);
  return response.data;
}

/**
 * Get date range report
 */
export async function getDateRangeReport(
  storeId: string,
  startDate: string,
  endDate: string,
  options?: {
    include_daily_breakdown?: boolean;
    include_tender_breakdown?: boolean;
    include_department_breakdown?: boolean;
  },
): Promise<ApiResponse<DateRangeReport>> {
  const searchParams = new URLSearchParams();
  searchParams.append("start_date", startDate);
  searchParams.append("end_date", endDate);

  if (options?.include_daily_breakdown) {
    searchParams.append("include_daily_breakdown", "true");
  }
  if (options?.include_tender_breakdown) {
    searchParams.append("include_tender_breakdown", "true");
  }
  if (options?.include_department_breakdown) {
    searchParams.append("include_department_breakdown", "true");
  }

  const endpoint = `/api/stores/${storeId}/reports/date-range?${searchParams.toString()}`;
  const response = await apiClient.get<ApiResponse<DateRangeReport>>(endpoint);
  return response.data;
}

/**
 * Refresh day summary
 */
export async function refreshDaySummary(
  storeId: string,
  date: string,
): Promise<ApiResponse<DaySummary>> {
  const response = await apiClient.post<ApiResponse<DaySummary>>(
    `/api/stores/${storeId}/day-summary/${date}/refresh`,
    {},
  );
  return response.data;
}

// ============ TanStack Query Keys ============

export const daySummaryKeys = {
  all: ["day-summaries"] as const,
  lists: () => [...daySummaryKeys.all, "list"] as const,
  list: (storeId: string, params?: DaySummaryQueryParams) =>
    [...daySummaryKeys.lists(), storeId, params || {}] as const,
  details: () => [...daySummaryKeys.all, "detail"] as const,
  detail: (daySummaryId: string) =>
    [...daySummaryKeys.details(), daySummaryId] as const,
  byDate: (storeId: string, date: string) =>
    [...daySummaryKeys.all, "by-date", storeId, date] as const,
  weeklyReports: () => [...daySummaryKeys.all, "weekly"] as const,
  weeklyReport: (storeId: string, weekOf?: string) =>
    [...daySummaryKeys.weeklyReports(), storeId, weekOf || "current"] as const,
  monthlyReports: () => [...daySummaryKeys.all, "monthly"] as const,
  monthlyReport: (storeId: string, year: number, month: number) =>
    [...daySummaryKeys.monthlyReports(), storeId, year, month] as const,
  dateRangeReports: () => [...daySummaryKeys.all, "date-range"] as const,
  dateRangeReport: (storeId: string, startDate: string, endDate: string) =>
    [
      ...daySummaryKeys.dateRangeReports(),
      storeId,
      startDate,
      endDate,
    ] as const,
};

// ============ TanStack Query Hooks ============

/**
 * Hook to fetch day summaries for a store
 */
export function useDaySummaries(
  storeId: string | null,
  params?: DaySummaryQueryParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: daySummaryKeys.list(storeId || "", params),
    queryFn: () => getDaySummaries(storeId!, params),
    enabled: options?.enabled !== false && storeId !== null,
    select: (response) => response.data,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook to fetch day summary by date
 */
export function useDaySummaryByDate(
  storeId: string | null,
  date: string | null,
  params?: {
    include_tender_summaries?: boolean;
    include_department_summaries?: boolean;
    include_tax_summaries?: boolean;
    include_hourly_summaries?: boolean;
  },
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: daySummaryKeys.byDate(storeId || "", date || ""),
    queryFn: () => getDaySummaryByDate(storeId!, date!, params),
    enabled: options?.enabled !== false && storeId !== null && date !== null,
    select: (response) => response.data,
    staleTime: 30000,
  });
}

/**
 * Hook to fetch day summary by ID
 */
export function useDaySummary(
  daySummaryId: string | null,
  params?: {
    include_tender_summaries?: boolean;
    include_department_summaries?: boolean;
    include_tax_summaries?: boolean;
    include_hourly_summaries?: boolean;
  },
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: daySummaryKeys.detail(daySummaryId || ""),
    queryFn: () => getDaySummaryById(daySummaryId!, params),
    enabled: options?.enabled !== false && daySummaryId !== null,
    select: (response) => response.data,
  });
}

/**
 * Hook to fetch weekly report
 */
export function useWeeklyReport(
  storeId: string | null,
  weekOf?: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: daySummaryKeys.weeklyReport(storeId || "", weekOf),
    queryFn: () => getWeeklyReport(storeId!, weekOf),
    enabled: options?.enabled !== false && storeId !== null,
    select: (response) => response.data,
    staleTime: 60000, // 1 minute
  });
}

/**
 * Hook to fetch monthly report
 */
export function useMonthlyReport(
  storeId: string | null,
  year: number,
  month: number,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: daySummaryKeys.monthlyReport(storeId || "", year, month),
    queryFn: () => getMonthlyReport(storeId!, year, month),
    enabled: options?.enabled !== false && storeId !== null,
    select: (response) => response.data,
    staleTime: 60000, // 1 minute
  });
}

/**
 * Hook to fetch date range report
 */
export function useDateRangeReport(
  storeId: string | null,
  startDate: string | null,
  endDate: string | null,
  options?: {
    enabled?: boolean;
    include_daily_breakdown?: boolean;
    include_tender_breakdown?: boolean;
    include_department_breakdown?: boolean;
  },
) {
  return useQuery({
    queryKey: daySummaryKeys.dateRangeReport(
      storeId || "",
      startDate || "",
      endDate || "",
    ),
    queryFn: () =>
      getDateRangeReport(storeId!, startDate!, endDate!, {
        include_daily_breakdown: options?.include_daily_breakdown,
        include_tender_breakdown: options?.include_tender_breakdown,
        include_department_breakdown: options?.include_department_breakdown,
      }),
    enabled:
      options?.enabled !== false &&
      storeId !== null &&
      startDate !== null &&
      endDate !== null,
    select: (response) => response.data,
    staleTime: 60000,
  });
}

/**
 * Hook to close a day
 */
export function useCloseDay() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      storeId,
      date,
      notes,
    }: {
      storeId: string;
      date: string;
      notes?: string;
    }) => closeDay(storeId, date, notes),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: daySummaryKeys.list(variables.storeId),
      });
      queryClient.invalidateQueries({
        queryKey: daySummaryKeys.byDate(variables.storeId, variables.date),
      });
    },
  });
}

/**
 * Hook to update day notes
 */
export function useUpdateDayNotes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      storeId,
      date,
      notes,
    }: {
      storeId: string;
      date: string;
      notes: string;
    }) => updateDayNotes(storeId, date, notes),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: daySummaryKeys.byDate(variables.storeId, variables.date),
      });
    },
  });
}

/**
 * Hook to refresh day summary
 */
export function useRefreshDaySummary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ storeId, date }: { storeId: string; date: string }) =>
      refreshDaySummary(storeId, date),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: daySummaryKeys.byDate(variables.storeId, variables.date),
      });
      queryClient.invalidateQueries({
        queryKey: daySummaryKeys.list(variables.storeId),
      });
    },
  });
}

// ============ Day Close Reconciliation Types ============

/**
 * Shift detail for reconciliation view
 */
export interface ReconciliationShiftDetail {
  shift_id: string;
  terminal_name: string | null;
  cashier_name: string;
  opened_at: string;
  closed_at: string | null;
  status: string;
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number | null;
  variance: number | null;
  net_sales: number;
  transaction_count: number;
  lottery_sales: number | null;
  lottery_tickets_sold: number | null;
}

/**
 * Lottery bin closed detail for reconciliation view
 */
export interface ReconciliationLotteryBin {
  bin_number: number;
  pack_number: string;
  game_name: string;
  game_price: number;
  starting_serial: string;
  closing_serial: string;
  tickets_sold: number;
  sales_amount: number;
}

/**
 * Complete Day Close reconciliation response
 */
export interface DayCloseReconciliationResponse {
  store_id: string;
  business_date: string;
  status: DaySummaryStatus;
  closed_at: string | null;
  closed_by: string | null;
  closed_by_name: string | null;

  shifts: ReconciliationShiftDetail[];

  lottery: {
    is_closed: boolean;
    closed_at: string | null;
    bins_closed: ReconciliationLotteryBin[];
    total_sales: number;
    total_tickets_sold: number;
  };

  day_totals: {
    shift_count: number;
    gross_sales: number;
    net_sales: number;
    tax_collected: number;
    transaction_count: number;
    total_opening_cash: number;
    total_closing_cash: number;
    total_expected_cash: number;
    total_cash_variance: number;
    lottery_sales: number | null;
    lottery_net: number | null;
  };

  notes: string | null;
}

// ============ Day Close Reconciliation API ============

/**
 * Get Day Close reconciliation data
 */
export async function getDayCloseReconciliation(
  storeId: string,
  date: string,
): Promise<ApiResponse<DayCloseReconciliationResponse>> {
  const endpoint = `/api/stores/${storeId}/day-summary/${date}/reconciliation`;
  const response =
    await apiClient.get<ApiResponse<DayCloseReconciliationResponse>>(endpoint);
  return response.data;
}

/**
 * Hook to fetch Day Close reconciliation data
 */
export function useDayCloseReconciliation(
  storeId: string | null,
  date: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: [...daySummaryKeys.all, "reconciliation", storeId, date],
    queryFn: () => getDayCloseReconciliation(storeId!, date!),
    enabled: options?.enabled !== false && storeId !== null && date !== null,
    select: (response) => response.data,
    staleTime: 30000,
  });
}
