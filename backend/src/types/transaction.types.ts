/**
 * Transaction-related TypeScript types
 * These types complement Prisma-generated types for use in services and routes
 */

import { Decimal } from "@prisma/client/runtime/library";

/**
 * Payment method types for transactions
 * CASH - Cash payment
 * CREDIT - Credit card payment
 * DEBIT - Debit card payment
 * EBT - Electronic Benefit Transfer
 * OTHER - Other payment methods
 */
export type PaymentMethod = "CASH" | "CREDIT" | "DEBIT" | "EBT" | "OTHER";

/**
 * Shift status types
 * OPEN - Shift is currently active
 * CLOSED - Shift has been closed by cashier
 * RECONCILED - Shift has been reconciled by manager
 */
export type ShiftStatus = "OPEN" | "CLOSED" | "RECONCILED";

/**
 * POS Terminal status types
 */
export type POSTerminalStatus = "ACTIVE" | "INACTIVE" | "MAINTENANCE";

/**
 * Input type for creating a new transaction
 */
export interface CreateTransactionInput {
  store_id: string;
  shift_id: string;
  cashier_id: string;
  pos_terminal_id?: string;
  subtotal: number | Decimal;
  tax?: number | Decimal;
  discount?: number | Decimal;
  total: number | Decimal;
  line_items: CreateTransactionLineItemInput[];
  payments: CreateTransactionPaymentInput[];
}

/**
 * Input type for creating a transaction line item
 */
export interface CreateTransactionLineItemInput {
  product_id?: string;
  sku?: string;
  name: string;
  quantity: number;
  unit_price: number | Decimal;
  discount?: number | Decimal;
  line_total: number | Decimal;
}

/**
 * Input type for creating a transaction payment
 */
export interface CreateTransactionPaymentInput {
  method: PaymentMethod;
  amount: number | Decimal;
  reference?: string;
}

/**
 * Input type for creating a shift
 */
export interface CreateShiftInput {
  store_id: string;
  cashier_id: string;
  pos_terminal_id?: string;
  opening_amount?: number | Decimal;
}

/**
 * Input type for closing a shift
 */
export interface CloseShiftInput {
  closing_amount: number | Decimal;
}

/**
 * Input type for creating a POS terminal
 */
export interface CreatePOSTerminalInput {
  store_id: string;
  name: string;
  device_id?: string;
}

/**
 * Query filters for transactions
 */
export interface TransactionFilters {
  store_id?: string;
  shift_id?: string;
  cashier_id?: string;
  from_date?: Date;
  to_date?: Date;
  min_total?: number;
  max_total?: number;
}

/**
 * Transaction summary for reporting
 */
export interface TransactionSummary {
  total_transactions: number;
  total_revenue: Decimal;
  total_tax: Decimal;
  total_discount: Decimal;
  average_transaction: Decimal;
  payment_breakdown: PaymentBreakdown[];
}

/**
 * Payment breakdown by method
 */
export interface PaymentBreakdown {
  method: PaymentMethod;
  count: number;
  total: Decimal;
}

/**
 * Shift summary for reconciliation
 */
export interface ShiftSummary {
  shift_id: string;
  store_id: string;
  cashier_id: string;
  start_time: Date;
  end_time?: Date;
  opening_amount: Decimal;
  closing_amount?: Decimal;
  total_sales: Decimal;
  transaction_count: number;
  expected_cash: Decimal;
  variance?: Decimal;
}
