/**
 * Shift Report Types
 *
 * Type definitions for shift report data structures.
 * Story 4.6: Shift Report Generation
 */

/**
 * Shift report data structure
 */
export interface ShiftReportData {
  shift: {
    shift_id: string;
    store_id: string;
    store_name: string | null;
    opened_by: {
      user_id: string;
      name: string;
    } | null;
    cashier_id: string;
    cashier_name: {
      cashier_id: string;
      name: string;
    } | null;
    opened_at: string;
    closed_at: string | null;
    status: string;
  };
  summary: {
    total_sales: number;
    transaction_count: number;
    opening_cash: number;
    closing_cash: number;
    expected_cash: number;
    variance_amount: number;
    variance_percentage: number;
  };
  payment_methods: Array<{
    method: string;
    total: number;
    count: number;
  }>;
  variance: {
    variance_amount: number;
    variance_percentage: number;
    variance_reason: string | null;
    approved_by: {
      user_id: string;
      name: string;
    } | null;
    approved_at: string | null;
  } | null;
  transactions: Array<{
    transaction_id: string;
    timestamp: string;
    total: number;
    cashier: {
      user_id: string;
      name: string;
    } | null;
    line_items: Array<{
      product_name: string;
      quantity: number;
      price: number;
      subtotal: number;
    }>;
    payments: Array<{
      method: string;
      amount: number;
    }>;
  }>;
}
