/**
 * DaySummary Types
 *
 * Type definitions for the Day Summary tables.
 * Phase 3.1: Shift & Day Summary Implementation Plan
 *
 * These types define the structure for daily aggregated summaries
 * that combine data from all shifts for a single business day.
 */

import { Decimal } from "@prisma/client/runtime/library";

/**
 * Day Summary Status enum values
 */
export type DaySummaryStatusType = "OPEN" | "PENDING_CLOSE" | "CLOSED";

/**
 * DaySummary - Pre-aggregated daily snapshot combining all shifts
 */
export interface DaySummary {
  day_summary_id: string;
  store_id: string;
  business_date: Date;

  // Shift counts
  shift_count: number;

  // Timing
  first_shift_opened: Date | null;
  last_shift_closed: Date | null;

  // Sales Totals
  gross_sales: Decimal;
  returns_total: Decimal;
  discounts_total: Decimal;
  net_sales: Decimal;

  // Tax
  tax_collected: Decimal;
  tax_exempt_sales: Decimal;
  taxable_sales: Decimal;

  // Transaction Counts
  transaction_count: number;
  void_count: number;
  refund_count: number;
  customer_count: number;

  // Item Counts
  items_sold_count: number;
  items_returned_count: number;

  // Averages
  avg_transaction: Decimal;
  avg_items_per_txn: Decimal;

  // Cash Reconciliation
  total_opening_cash: Decimal;
  total_closing_cash: Decimal;
  total_expected_cash: Decimal;
  total_cash_variance: Decimal;

  // Lottery (optional)
  lottery_sales: Decimal | null;
  lottery_cashes: Decimal | null;
  lottery_net: Decimal | null;
  lottery_packs_sold: number | null;
  lottery_tickets_sold: number | null;

  // Fuel (optional)
  fuel_gallons: Decimal | null;
  fuel_sales: Decimal | null;

  // Status & Closing
  status: DaySummaryStatusType;
  closed_at: Date | null;
  closed_by: string | null;

  // Manager notes
  notes: string | null;

  // Extra data
  extra_data: Record<string, unknown> | null;

  // Metadata
  created_at: Date;
  updated_at: Date;
}

/**
 * DayTenderSummary - Payment method breakdown for a day
 */
export interface DayTenderSummary {
  id: string;
  day_summary_id: string;
  tender_type_id: string;
  tender_code: string;
  tender_display_name: string;

  // Totals
  total_amount: Decimal;
  transaction_count: number;

  // Refunds
  refund_amount: Decimal;
  refund_count: number;

  // Net
  net_amount: Decimal;

  created_at: Date;
}

/**
 * DayDepartmentSummary - Department sales breakdown for a day
 */
export interface DayDepartmentSummary {
  id: string;
  day_summary_id: string;
  department_id: string;
  department_code: string;
  department_name: string;

  // Sales Totals
  gross_sales: Decimal;
  returns_total: Decimal;
  discounts_total: Decimal;
  net_sales: Decimal;

  // Tax
  tax_collected: Decimal;

  // Counts
  transaction_count: number;
  items_sold_count: number;
  items_returned_count: number;

  created_at: Date;
}

/**
 * DayTaxSummary - Tax collection breakdown for a day
 */
export interface DayTaxSummary {
  id: string;
  day_summary_id: string;
  tax_rate_id: string;
  tax_code: string;
  tax_display_name: string;
  tax_rate_snapshot: Decimal;

  // Totals
  taxable_amount: Decimal;
  tax_collected: Decimal;
  exempt_amount: Decimal;

  // Counts
  transaction_count: number;

  created_at: Date;
}

/**
 * DayHourlySummary - Hourly breakdown for a day
 */
export interface DayHourlySummary {
  id: string;
  day_summary_id: string;
  hour_start: Date;
  hour_number: number;

  // Totals
  gross_sales: Decimal;
  net_sales: Decimal;
  transaction_count: number;
  items_sold_count: number;

  // Averages
  avg_transaction: Decimal;

  created_at: Date;
}

/**
 * Input for closing a day summary
 */
export interface CloseDaySummaryInput {
  store_id: string;
  business_date: Date;
  closed_by_user_id: string;
  notes?: string;
}

/**
 * Aggregated data from shift summaries for a day
 */
export interface DayShiftAggregates {
  shift_count: number;
  first_shift_opened: Date | null;
  last_shift_closed: Date | null;
  gross_sales: number;
  returns_total: number;
  discounts_total: number;
  net_sales: number;
  tax_collected: number;
  tax_exempt_sales: number;
  taxable_sales: number;
  transaction_count: number;
  void_count: number;
  refund_count: number;
  items_sold_count: number;
  items_returned_count: number;
  total_opening_cash: number;
  total_closing_cash: number;
  total_expected_cash: number;
  total_cash_variance: number;
  lottery_sales: number | null;
  lottery_cashes: number | null;
  lottery_net: number | null;
  lottery_packs_sold: number | null;
  lottery_tickets_sold: number | null;
  fuel_gallons: number | null;
  fuel_sales: number | null;
}

/**
 * Aggregated tender data from shift tender summaries
 */
export interface DayTenderAggregates {
  tender_type_id: string;
  tender_code: string;
  tender_display_name: string;
  total_amount: number;
  transaction_count: number;
  refund_amount: number;
  refund_count: number;
}

/**
 * Aggregated department data from shift department summaries
 */
export interface DayDepartmentAggregates {
  department_id: string;
  department_code: string;
  department_name: string;
  gross_sales: number;
  returns_total: number;
  discounts_total: number;
  net_sales: number;
  tax_collected: number;
  transaction_count: number;
  items_sold_count: number;
  items_returned_count: number;
}

/**
 * Aggregated tax data from shift tax summaries
 */
export interface DayTaxAggregates {
  tax_rate_id: string;
  tax_code: string;
  tax_display_name: string;
  tax_rate_snapshot: number;
  taxable_amount: number;
  tax_collected: number;
  exempt_amount: number;
  transaction_count: number;
}

/**
 * Aggregated hourly data from shift hourly summaries
 */
export interface DayHourlyAggregates {
  hour_start: Date;
  hour_number: number;
  gross_sales: number;
  net_sales: number;
  transaction_count: number;
  items_sold_count: number;
}

/**
 * Complete day summary with all child summaries
 */
export interface DaySummaryWithDetails extends DaySummary {
  tender_summaries: DayTenderSummary[];
  department_summaries: DayDepartmentSummary[];
  tax_summaries: DayTaxSummary[];
  hourly_summaries: DayHourlySummary[];
}

/**
 * Day summary for API response (with numbers instead of Decimal)
 */
export interface DaySummaryResponse {
  day_summary_id: string;
  store_id: string;
  business_date: string;

  // Shift counts
  shift_count: number;

  // Timing
  first_shift_opened: string | null;
  last_shift_closed: string | null;

  // Sales Totals
  gross_sales: number;
  returns_total: number;
  discounts_total: number;
  net_sales: number;

  // Tax
  tax_collected: number;
  tax_exempt_sales: number;
  taxable_sales: number;

  // Transaction Counts
  transaction_count: number;
  void_count: number;
  refund_count: number;
  customer_count: number;

  // Item Counts
  items_sold_count: number;
  items_returned_count: number;

  // Averages
  avg_transaction: number;
  avg_items_per_txn: number;

  // Cash Reconciliation
  total_opening_cash: number;
  total_closing_cash: number;
  total_expected_cash: number;
  total_cash_variance: number;

  // Lottery (optional)
  lottery_sales: number | null;
  lottery_cashes: number | null;
  lottery_net: number | null;
  lottery_packs_sold: number | null;
  lottery_tickets_sold: number | null;

  // Fuel (optional)
  fuel_gallons: number | null;
  fuel_sales: number | null;

  // Status & Closing
  status: DaySummaryStatusType;
  closed_at: string | null;
  closed_by: string | null;

  // Manager notes
  notes: string | null;

  created_at: string;
  updated_at: string;

  // Child summaries (optional)
  tender_summaries?: DayTenderSummaryResponse[];
  department_summaries?: DayDepartmentSummaryResponse[];
  tax_summaries?: DayTaxSummaryResponse[];
  hourly_summaries?: DayHourlySummaryResponse[];
}

/**
 * Tender summary for API response
 */
export interface DayTenderSummaryResponse {
  id: string;
  tender_type_id: string;
  tender_code: string;
  tender_display_name: string;
  total_amount: number;
  transaction_count: number;
  refund_amount: number;
  refund_count: number;
  net_amount: number;
}

/**
 * Department summary for API response
 */
export interface DayDepartmentSummaryResponse {
  id: string;
  department_id: string;
  department_code: string;
  department_name: string;
  gross_sales: number;
  returns_total: number;
  discounts_total: number;
  net_sales: number;
  tax_collected: number;
  transaction_count: number;
  items_sold_count: number;
  items_returned_count: number;
}

/**
 * Tax summary for API response
 */
export interface DayTaxSummaryResponse {
  id: string;
  tax_rate_id: string;
  tax_code: string;
  tax_display_name: string;
  tax_rate_snapshot: number;
  taxable_amount: number;
  tax_collected: number;
  exempt_amount: number;
  transaction_count: number;
}

/**
 * Hourly summary for API response
 */
export interface DayHourlySummaryResponse {
  id: string;
  hour_start: string;
  hour_number: number;
  gross_sales: number;
  net_sales: number;
  transaction_count: number;
  items_sold_count: number;
  avg_transaction: number;
}

/**
 * Query options for getting day summaries
 */
export interface DaySummaryQueryOptions {
  store_id?: string;
  business_date?: Date;
  from_date?: Date;
  to_date?: Date;
  status?: DaySummaryStatusType;
  include_tender_summaries?: boolean;
  include_department_summaries?: boolean;
  include_tax_summaries?: boolean;
  include_hourly_summaries?: boolean;
}

/**
 * Date range report options
 */
export interface DateRangeReportOptions {
  store_id: string;
  start_date: Date;
  end_date: Date;
  include_details?: boolean;
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
 * Weekly/Monthly aggregate report (legacy flat format)
 * @deprecated Use PeriodSummaryReportWithBreakdown for new implementations
 */
export interface PeriodSummaryReport {
  store_id: string;
  period_type: "week" | "month";
  period_start: string;
  period_end: string;
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
  lottery_sales: number | null;
  lottery_net: number | null;
  fuel_sales: number | null;
  fuel_gallons: number | null;
}

/**
 * Weekly/Monthly aggregate report with breakdown arrays
 * Used by frontend weekly/monthly report pages
 */
export interface PeriodSummaryReportWithBreakdown {
  store_id: string;
  period_type: "week" | "month";
  period_start: string;
  period_end: string;
  day_count: number;
  totals: PeriodTotals;
  daily_breakdown: DayBreakdownItem[];
  weekly_breakdown?: WeekBreakdownItem[];
}

// ============================================================================
// DAY CLOSE RECONCILIATION TYPES
// ============================================================================

/**
 * Shift detail for reconciliation view
 * SEC-014: Contains only necessary fields for UI display
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
 * Matches the structure returned by lottery-day-close service
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
 * Combines all shifts + lottery data for a business day
 *
 * Used by:
 * - GET /api/stores/:storeId/day-summary/:date/reconciliation
 */
export interface DayCloseReconciliationResponse {
  /** Store identifier */
  store_id: string;
  /** Business date (YYYY-MM-DD) */
  business_date: string;
  /** Day close status */
  status: DaySummaryStatusType;
  /** When day was closed (if closed) */
  closed_at: string | null;
  /** Who closed the day (user ID) */
  closed_by: string | null;
  /** Who closed the day (user name) */
  closed_by_name: string | null;

  /** All shifts for this business day */
  shifts: ReconciliationShiftDetail[];

  /** Lottery closing data - bins closed during day close */
  lottery: {
    /** Whether lottery was closed for this day */
    is_closed: boolean;
    /** When lottery was closed (if closed) */
    closed_at: string | null;
    /** Bins with closing data */
    bins_closed: ReconciliationLotteryBin[];
    /** Total lottery sales from bin closings */
    total_sales: number;
    /** Total tickets sold from bin closings */
    total_tickets_sold: number;
  };

  /** Aggregated day totals */
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

  /** Manager notes */
  notes: string | null;
}
