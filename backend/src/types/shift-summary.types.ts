/**
 * ShiftSummary Types
 *
 * Type definitions for the Shift Summary tables.
 * Phase 2.1: Shift & Day Summary Implementation Plan
 */

import { Decimal } from "@prisma/client/runtime/library";

/**
 * ShiftSummary - Pre-aggregated shift snapshot created at close time
 */
export interface ShiftSummary {
  shift_summary_id: string;
  shift_id: string;
  store_id: string;
  business_date: Date;

  // Timing
  shift_opened_at: Date;
  shift_closed_at: Date;
  shift_duration_mins: number;

  // Personnel
  opened_by_user_id: string;
  closed_by_user_id: string;
  cashier_user_id: string | null;

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
  no_sale_count: number;

  // Item Counts
  items_sold_count: number;
  items_returned_count: number;

  // Averages
  avg_transaction: Decimal;
  avg_items_per_txn: Decimal;

  // Cash Drawer Reconciliation
  opening_cash: Decimal;
  closing_cash: Decimal;
  expected_cash: Decimal;
  cash_variance: Decimal;
  variance_percentage: Decimal;
  variance_approved: boolean;
  variance_approved_by: string | null;
  variance_approved_at: Date | null;
  variance_reason: string | null;

  // Lottery (optional)
  lottery_sales: Decimal | null;
  lottery_cashes: Decimal | null;
  lottery_net: Decimal | null;
  lottery_packs_sold: number | null;
  lottery_tickets_sold: number | null;

  // Fuel (optional)
  fuel_gallons: Decimal | null;
  fuel_sales: Decimal | null;

  // Extra data
  extra_data: Record<string, unknown> | null;

  // Metadata
  created_at: Date;
}

/**
 * ShiftTenderSummary - Payment method breakdown for a shift
 */
export interface ShiftTenderSummary {
  id: string;
  shift_summary_id: string;
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
 * ShiftDepartmentSummary - Department sales breakdown for a shift
 */
export interface ShiftDepartmentSummary {
  id: string;
  shift_summary_id: string;
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
 * ShiftTaxSummary - Tax collection breakdown for a shift
 */
export interface ShiftTaxSummary {
  id: string;
  shift_summary_id: string;
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
 * ShiftHourlySummary - Hourly breakdown within a shift
 */
export interface ShiftHourlySummary {
  id: string;
  shift_summary_id: string;
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
 * Input for creating a shift summary (aggregated from transactions)
 */
export interface CreateShiftSummaryInput {
  shift_id: string;
  closed_by_user_id: string;
  closing_cash: number;
  variance_reason?: string;
}

/**
 * Aggregated transaction data for shift summary creation
 */
export interface ShiftTransactionAggregates {
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
}

/**
 * Aggregated tender data for shift summary creation
 */
export interface ShiftTenderAggregates {
  tender_type_id: string;
  tender_code: string;
  tender_display_name: string;
  total_amount: number;
  transaction_count: number;
  refund_amount: number;
  refund_count: number;
}

/**
 * Aggregated department data for shift summary creation
 */
export interface ShiftDepartmentAggregates {
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
 * Aggregated tax data for shift summary creation
 */
export interface ShiftTaxAggregates {
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
 * Aggregated hourly data for shift summary creation
 */
export interface ShiftHourlyAggregates {
  hour_start: Date;
  hour_number: number;
  gross_sales: number;
  net_sales: number;
  transaction_count: number;
  items_sold_count: number;
}

/**
 * Complete shift summary with all child summaries
 */
export interface ShiftSummaryWithDetails extends ShiftSummary {
  tender_summaries: ShiftTenderSummary[];
  department_summaries: ShiftDepartmentSummary[];
  tax_summaries: ShiftTaxSummary[];
  hourly_summaries: ShiftHourlySummary[];
}

/**
 * Shift summary for API response (with numbers instead of Decimal)
 */
export interface ShiftSummaryResponse {
  shift_summary_id: string;
  shift_id: string;
  store_id: string;
  business_date: string;

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

  // Cash Drawer Reconciliation
  opening_cash: number;
  closing_cash: number;
  expected_cash: number;
  cash_variance: number;
  variance_percentage: number;
  variance_approved: boolean;
  variance_approved_by: string | null;
  variance_approved_at: string | null;
  variance_reason: string | null;

  // Lottery (optional)
  lottery_sales: number | null;
  lottery_cashes: number | null;
  lottery_net: number | null;
  lottery_packs_sold: number | null;
  lottery_tickets_sold: number | null;

  // Fuel (optional)
  fuel_gallons: number | null;
  fuel_sales: number | null;

  created_at: string;

  // Child summaries
  tender_summaries?: ShiftTenderSummaryResponse[];
  department_summaries?: ShiftDepartmentSummaryResponse[];
  tax_summaries?: ShiftTaxSummaryResponse[];
  hourly_summaries?: ShiftHourlySummaryResponse[];
}

/**
 * Tender summary for API response
 */
export interface ShiftTenderSummaryResponse {
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
export interface ShiftDepartmentSummaryResponse {
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
export interface ShiftTaxSummaryResponse {
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
export interface ShiftHourlySummaryResponse {
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
 * Query options for getting shift summaries
 */
export interface ShiftSummaryQueryOptions {
  store_id?: string;
  business_date?: Date;
  from_date?: Date;
  to_date?: Date;
  include_tender_summaries?: boolean;
  include_department_summaries?: boolean;
  include_tax_summaries?: boolean;
  include_hourly_summaries?: boolean;
}
