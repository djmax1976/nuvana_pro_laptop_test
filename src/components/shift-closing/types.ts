/**
 * Shift/Day Closing Shared Types
 *
 * Type definitions for shift and day closing workflows.
 * These types ensure consistency between Day Close and Shift End pages.
 *
 * New dual-column layout:
 * - Reports Totals: Manual input for items that need verification
 * - POS Totals: Read-only values from POS system
 *
 * @security
 * - FE-005: UI_SECURITY - No secrets exposed in these display types
 * - API-008: OUTPUT_FILTERING - Types mirror whitelisted API response fields only
 */

import type { LotteryCloseResult } from "@/components/lottery/CloseDayModal";

/**
 * Closing workflow mode - determines lottery requirement
 */
export type ClosingMode = "day" | "shift";

/**
 * Lottery status for the current business day
 * - not_closed: Lottery bins haven't been scanned yet
 * - pending: Lottery bins scanned, awaiting day close commit (two-phase commit)
 * - closed: Lottery day fully committed/closed
 * - closed_earlier: Lottery was closed before current session started
 */
export type LotteryStatus =
  | "not_closed"
  | "pending"
  | "closed"
  | "closed_earlier";

/**
 * Money received line item for cash reconciliation
 */
export interface MoneyReceivedItem {
  /** Unique identifier for the line item */
  id: string;
  /** Display label */
  label: string;
  /** Current value in dollars */
  value: number;
  /** Whether this is a payout (negative value display) */
  isNegative?: boolean;
  /** Whether field is editable */
  readOnly?: boolean;
}

/**
 * Sales breakdown line item
 */
export interface SalesBreakdownItem {
  /** Unique identifier for the line item */
  id: string;
  /** Display label (e.g., "Grocery", "Tobacco", "Scratch Off") */
  label: string;
  /** Current value in dollars */
  value: number;
  /** Whether field is editable */
  readOnly?: boolean;
  /** Whether to highlight this row (used for lottery) */
  highlight?: boolean;
}

/**
 * State for money received section - POS Totals (read-only from POS)
 */
export interface MoneyReceivedPOSState {
  cash: number;
  creditCard: number;
  debitCard: number;
  ebt: number;
  cashPayouts: number;
  lotteryPayouts: number;
  gamingPayouts: number;
}

/**
 * State for money received section - Reports Totals (manual input for payouts only)
 */
export interface MoneyReceivedReportsState {
  cashPayouts: number;
  lotteryPayouts: number;
  gamingPayouts: number;
}

/**
 * Combined state for money received section
 */
export interface MoneyReceivedState {
  pos: MoneyReceivedPOSState;
  reports: MoneyReceivedReportsState;
}

/**
 * State for sales breakdown section - POS Totals (read-only from POS)
 */
export interface SalesBreakdownPOSState {
  gasSales: number;
  grocery: number;
  tobacco: number;
  beverages: number;
  snacks: number;
  other: number;
  scratchOff: number;
  onlineLottery: number;
  salesTax: number;
}

/**
 * State for sales breakdown section - Reports Totals (manual input for lottery only)
 */
export interface SalesBreakdownReportsState {
  scratchOff: number;
  onlineLottery: number;
}

/**
 * Combined state for sales breakdown section
 */
export interface SalesBreakdownState {
  pos: SalesBreakdownPOSState;
  reports: SalesBreakdownReportsState;
}

/**
 * Props for the LotteryStatusBanner component
 */
export interface LotteryStatusBannerProps {
  /** Current lottery status */
  status: LotteryStatus;
  /** Lottery data if closed in current session */
  lotteryData: LotteryCloseResult | null;
  /** Lottery total to display */
  lotteryTotal: number;
  /** Whether lottery is required (day close) or optional (shift close) */
  isRequired: boolean;
  /** Callback when user clicks to open lottery modal (optional when status is closed) */
  onOpenLotteryModal?: () => void;
}

/**
 * Props for shared MoneyReceivedCard component
 */
export interface MoneyReceivedCardProps {
  /** Current state values */
  state: MoneyReceivedState;
  /** Callback to update reports state (manual inputs) */
  onReportsChange: (newState: Partial<MoneyReceivedReportsState>) => void;
  /** Callback to update POS state (for testing purposes) */
  onPOSChange?: (newState: Partial<MoneyReceivedPOSState>) => void;
  /** Whether inputs are disabled */
  disabled?: boolean;
  /** Whether to allow editing POS values (for testing) */
  editablePOS?: boolean;
}

/**
 * Props for shared SalesBreakdownCard component
 */
export interface SalesBreakdownCardProps {
  /** Current state values */
  state: SalesBreakdownState;
  /** Callback to update reports state (manual inputs) */
  onReportsChange: (newState: Partial<SalesBreakdownReportsState>) => void;
  /** Callback to update POS state (for testing purposes) */
  onPOSChange?: (newState: Partial<SalesBreakdownPOSState>) => void;
  /** Whether inputs are disabled */
  disabled?: boolean;
  /** Whether to allow editing POS values (for testing) */
  editablePOS?: boolean;
}

/**
 * Props for LotterySalesDetails table component
 */
export interface LotterySalesDetailsProps {
  /** Lottery close result data */
  data: LotteryCloseResult;
}

/**
 * Calculated totals for display
 */
export interface ClosingTotals {
  /** Net cash from reports = receipts - payouts */
  netCashReports: number;
  /** Net cash from POS = receipts - payouts */
  netCashPOS: number;
  /** Total sales from reports */
  totalSalesReports: number;
  /** Total sales from POS */
  totalSalesPOS: number;
}

/**
 * Calculate net cash from money received state (Reports column)
 * Formula: POS(Cash+Credit+Debit+EBT) - REPORTS(Payouts)
 * @param state - Money received state
 * @returns Net cash amount for reports
 */
export function calculateNetCashReports(state: MoneyReceivedState): number {
  const posReceipts =
    state.pos.cash + state.pos.creditCard + state.pos.debitCard + state.pos.ebt;
  const reportsPayouts =
    state.reports.cashPayouts +
    state.reports.lotteryPayouts +
    state.reports.gamingPayouts;
  return posReceipts - reportsPayouts;
}

/**
 * Calculate net cash from money received state (POS column)
 * @param state - Money received state
 * @returns Net cash amount for POS
 */
export function calculateNetCashPOS(state: MoneyReceivedState): number {
  return (
    state.pos.cash +
    state.pos.creditCard +
    state.pos.debitCard +
    state.pos.ebt -
    state.pos.cashPayouts -
    state.pos.lotteryPayouts -
    state.pos.gamingPayouts
  );
}

/**
 * Calculate total sales from sales breakdown state (Reports column)
 * Formula: POS(Gas+Grocery+Tobacco+Beverages+Snacks+Other+Tax) + REPORTS(Lottery)
 * @param state - Sales breakdown state
 * @returns Total sales amount for reports
 */
export function calculateTotalSalesReports(state: SalesBreakdownState): number {
  const posDepartments =
    state.pos.gasSales +
    state.pos.grocery +
    state.pos.tobacco +
    state.pos.beverages +
    state.pos.snacks +
    state.pos.other +
    state.pos.salesTax;
  const reportsLottery = state.reports.scratchOff + state.reports.onlineLottery;
  return posDepartments + reportsLottery;
}

/**
 * Calculate total sales from sales breakdown state (POS column)
 * @param state - Sales breakdown state
 * @returns Total sales amount for POS
 */
export function calculateTotalSalesPOS(state: SalesBreakdownState): number {
  return (
    state.pos.gasSales +
    state.pos.grocery +
    state.pos.tobacco +
    state.pos.beverages +
    state.pos.snacks +
    state.pos.other +
    state.pos.scratchOff +
    state.pos.onlineLottery +
    state.pos.salesTax
  );
}

// Legacy exports for backward compatibility - keeping old function names
export function calculateNetCash(state: MoneyReceivedState): number {
  return calculateNetCashPOS(state);
}

export function calculateTotalSales(state: SalesBreakdownState): number {
  return calculateTotalSalesPOS(state);
}

/**
 * Default initial state for money received
 * Includes sample POS data for testing
 */
export const DEFAULT_MONEY_RECEIVED_STATE: MoneyReceivedState = {
  pos: {
    cash: 1234.56,
    creditCard: 890.0,
    debitCard: 456.78,
    ebt: 123.45,
    cashPayouts: 200.0,
    lotteryPayouts: 150.0,
    gamingPayouts: 75.0,
  },
  reports: {
    cashPayouts: 0,
    lotteryPayouts: 0,
    gamingPayouts: 0,
  },
};

/**
 * Default initial state for sales breakdown
 *
 * Column layout:
 * - Reports Totals: OUR data (lottery tracking, manual entries)
 * - POS Totals: 3rd party POS data (placeholder until integration)
 *
 * Data flow for lottery:
 * 1. Step 1 (Lottery Close): Our calculated lottery_total → reports.scratchOff
 * 2. Step 2 (Report Scanning): Online lottery entry → reports.onlineLottery
 *
 * @business-rule All our lottery data goes to REPORTS column
 * @business-rule POS column is placeholder for future 3rd party POS integration
 *
 * Includes sample POS data for department sales (placeholder until POS integration)
 */
export const DEFAULT_SALES_BREAKDOWN_STATE: SalesBreakdownState = {
  pos: {
    // Department sales - placeholder values until POS integration
    gasSales: 2500.0,
    grocery: 1200.0,
    tobacco: 800.0,
    beverages: 450.0,
    snacks: 320.0,
    other: 180.0,
    // Lottery POS values - populated from lottery terminal report in Step 2
    scratchOff: 0,
    onlineLottery: 0,
    salesTax: 245.0,
  },
  reports: {
    // Lottery values from our internal lottery system (populated from Step 1 lottery close)
    scratchOff: 0,
    onlineLottery: 0,
  },
};
