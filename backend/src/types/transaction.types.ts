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
 * @deprecated POSTerminal model no longer has a status field. Terminals use soft-delete only (deleted_at).
 * This type is kept for backward compatibility but should not be used in new code.
 * Use deleted_at === null to check if a terminal is available.
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

/**
 * Story 3.4: Transaction Query API Types
 */

/**
 * Query filters for transaction query API
 */
export interface TransactionQueryFilters {
  store_id?: string;
  shift_id?: string;
  cashier_id?: string;
  from?: Date;
  to?: Date;
}

/**
 * Pagination options for transaction query
 */
export interface PaginationOptions {
  limit: number;
  offset: number;
}

/**
 * Include options for transaction query
 */
export interface IncludeOptions {
  line_items?: boolean;
  payments?: boolean;
}

/**
 * Line item response for API output
 */
export interface TransactionLineItemResponse {
  line_item_id: string;
  product_id: string | null;
  sku: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  discount: number;
  line_total: number;
}

/**
 * Payment response for API output
 */
export interface TransactionPaymentResponse {
  payment_id: string;
  method: string;
  amount: number;
  reference: string | null;
}

/**
 * Transaction response for API output
 */
export interface TransactionResponse {
  transaction_id: string;
  store_id: string;
  shift_id: string;
  cashier_id: string;
  pos_terminal_id: string | null;
  timestamp: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  public_id: string;
  line_items?: TransactionLineItemResponse[];
  payments?: TransactionPaymentResponse[];
  // Extended fields from joins (optional, populated by backend)
  cashier_name?: string;
  store_name?: string;
}

/**
 * Pagination metadata for response
 */
export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

/**
 * Transaction query result from service
 */
export interface TransactionQueryResult {
  transactions: TransactionResponse[];
  meta: PaginationMeta;
}
