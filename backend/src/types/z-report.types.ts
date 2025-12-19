/**
 * ZReport Types
 *
 * Type definitions for Z Report (end-of-shift final snapshot) functionality.
 * Phase 4.2: Shift & Day Summary Implementation Plan
 *
 * Z Reports are permanent, immutable records of shift totals generated at shift close.
 * One Z Report per shift - represents the official, final shift record.
 * Z Number provides sequential numbering for audit trail.
 */

/**
 * Tender breakdown in Z Report data
 */
export interface ZReportTenderBreakdown {
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
 * Department breakdown in Z Report data
 */
export interface ZReportDepartmentBreakdown {
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
 * Tax breakdown in Z Report data
 */
export interface ZReportTaxBreakdown {
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
 * Hourly breakdown in Z Report data
 */
export interface ZReportHourlyBreakdown {
  hour_number: number;
  hour_start: string;
  gross_sales: number;
  net_sales: number;
  transaction_count: number;
  items_sold_count: number;
  avg_transaction: number;
}

/**
 * Cash reconciliation data in Z Report
 */
export interface ZReportCashReconciliation {
  opening_cash: number;
  closing_cash: number;
  expected_cash: number;
  cash_variance: number;
  variance_percentage: number;
  variance_approved: boolean;
  variance_approved_by: string | null;
  variance_approved_at: string | null;
  variance_reason: string | null;
}

/**
 * Complete Z Report data snapshot stored in JSONB
 */
export interface ZReportData {
  // Timing
  shift_opened_at: string;
  shift_closed_at: string;
  shift_duration_mins: number;

  // Personnel
  opened_by_user_id: string;
  closed_by_user_id: string;
  cashier_user_id: string | null;

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
  no_sale_count: number;

  // Item Counts
  items_sold_count: number;
  items_returned_count: number;

  // Averages
  avg_transaction: number;
  avg_items_per_txn: number;

  // Cash Reconciliation
  cash_reconciliation: ZReportCashReconciliation;

  // Breakdowns
  tender_breakdown: ZReportTenderBreakdown[];
  department_breakdown: ZReportDepartmentBreakdown[];
  tax_breakdown: ZReportTaxBreakdown[];
  hourly_breakdown: ZReportHourlyBreakdown[];

  // Lottery (optional)
  lottery_sales: number | null;
  lottery_cashes: number | null;
  lottery_net: number | null;
  lottery_packs_sold: number | null;
  lottery_tickets_sold: number | null;

  // Fuel (optional)
  fuel_gallons: number | null;
  fuel_sales: number | null;

  // Extra data
  extra_data: Record<string, unknown> | null;
}

/**
 * ZReport database model
 */
export interface ZReport {
  z_report_id: string;
  shift_id: string;
  shift_summary_id: string;
  store_id: string;
  business_date: Date;

  // Timing
  generated_at: Date;
  generated_by: string;

  // Z Report Specific
  z_number: number;

  // Complete Snapshot Data
  report_data: ZReportData;

  // Tracking
  was_printed: boolean;
  print_count: number;
  was_exported: boolean;
  export_format: string | null;

  // Digital Signature
  signature_hash: string | null;

  // Metadata
  created_at: Date;
}

/**
 * Input for generating a new Z Report
 * (automatically called when shift is closed)
 */
export interface GenerateZReportInput {
  shift_id: string;
  shift_summary_id: string;
  generated_by: string;
}

/**
 * ZReport for API response
 */
export interface ZReportResponse {
  z_report_id: string;
  shift_id: string;
  shift_summary_id: string;
  store_id: string;
  business_date: string;

  // Timing
  generated_at: string;
  generated_by: string;

  // Z Report Specific
  z_number: number;

  // Complete Snapshot Data
  report_data: ZReportData;

  // Tracking
  was_printed: boolean;
  print_count: number;
  was_exported: boolean;
  export_format: string | null;

  // Signature
  signature_hash: string | null;

  // Metadata
  created_at: string;
}

/**
 * Query options for listing Z Reports
 */
export interface ZReportQueryOptions {
  store_id?: string;
  business_date?: Date;
  from_date?: Date;
  to_date?: Date;
  from_z_number?: number;
  to_z_number?: number;
  limit?: number;
  offset?: number;
}

/**
 * List response for Z Reports
 */
export interface ZReportListResponse {
  reports: ZReportResponse[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
    latest_z_number?: number;
  };
}

/**
 * Summary response for store's Z Report sequence
 */
export interface ZReportSequenceSummary {
  store_id: string;
  total_z_reports: number;
  latest_z_number: number;
  latest_z_report_date: string | null;
  first_z_report_date: string | null;
}
