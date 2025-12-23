/**
 * XReport Types
 *
 * Type definitions for X Report (mid-shift snapshot) functionality.
 * Phase 4.1: Shift & Day Summary Implementation Plan
 *
 * X Reports are point-in-time snapshots of shift data generated on demand.
 * Multiple X Reports can be generated per shift for interim reporting.
 */

import { Decimal } from "@prisma/client/runtime/library";

/**
 * Tender breakdown entry in X Report
 */
export interface XReportTenderBreakdown {
  tender_type_id: string;
  tender_code: string;
  tender_name: string;
  total_amount: number;
  transaction_count: number;
  refund_amount: number;
  refund_count: number;
  net_amount: number;
}

/**
 * Department breakdown entry in X Report
 */
export interface XReportDepartmentBreakdown {
  department_id: string;
  department_code: string;
  department_name: string;
  gross_sales: number;
  net_sales: number;
  items_sold_count: number;
  items_returned_count: number;
  tax_collected: number;
}

/**
 * XReport database model
 */
export interface XReport {
  x_report_id: string;
  shift_id: string;
  store_id: string;
  report_number: number;

  // Timing
  generated_at: Date;
  generated_by: string;

  // Snapshot Data
  gross_sales: Decimal;
  returns_total: Decimal;
  discounts_total: Decimal;
  net_sales: Decimal;
  tax_collected: Decimal;
  transaction_count: number;

  // Item Counts
  items_sold_count: number;
  items_returned_count: number;

  // Cash Drawer State
  opening_cash: Decimal;
  expected_cash: Decimal;

  // Breakdowns
  tender_breakdown: XReportTenderBreakdown[];
  department_breakdown: XReportDepartmentBreakdown[];

  // Lottery (optional)
  lottery_sales: Decimal | null;
  lottery_cashes: Decimal | null;
  lottery_tickets_sold: number | null;

  // Tracking
  was_printed: boolean;
  print_count: number;

  // Metadata
  created_at: Date;
}

/**
 * Input for generating a new X Report
 */
export interface GenerateXReportInput {
  shift_id: string;
  generated_by: string;
}

/**
 * XReport for API response (with numbers instead of Decimal)
 */
export interface XReportResponse {
  x_report_id: string;
  shift_id: string;
  store_id: string;
  report_number: number;

  // Timing
  generated_at: string;
  generated_by: string;

  // Snapshot Data
  gross_sales: number;
  returns_total: number;
  discounts_total: number;
  net_sales: number;
  tax_collected: number;
  transaction_count: number;

  // Item Counts
  items_sold_count: number;
  items_returned_count: number;

  // Cash Drawer State
  opening_cash: number;
  expected_cash: number;

  // Breakdowns
  tender_breakdown: XReportTenderBreakdown[];
  department_breakdown: XReportDepartmentBreakdown[];

  // Lottery (optional)
  lottery_sales: number | null;
  lottery_cashes: number | null;
  lottery_tickets_sold: number | null;

  // Tracking
  was_printed: boolean;
  print_count: number;

  // Metadata
  created_at: string;
}

/**
 * Query options for listing X Reports
 */
export interface XReportQueryOptions {
  shift_id?: string;
  store_id?: string;
  from_date?: Date;
  to_date?: Date;
  limit?: number;
  offset?: number;
}

/**
 * List response for X Reports
 */
export interface XReportListResponse {
  reports: XReportResponse[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}
