/**
 * Shift Lottery Summary Types
 *
 * Type definitions for the shift lottery summary endpoint that returns
 * comprehensive lottery data for closed shifts. Used by the Client Dashboard
 * to display historical shift reconciliation matching the Day Close Wizard view.
 *
 * @security
 * - API-008: OUTPUT_FILTERING - Types define whitelisted response fields only
 * - FE-005: UI_SECURITY - No sensitive data exposed in these types
 * - DB-006: TENANT_ISOLATION - All data scoped by store_id in queries
 */

/**
 * Individual bin/pack closing details for lottery summary
 * Matches the LotteryCloseResult.bins_closed structure in frontend
 */
export interface LotteryBinCloseSummary {
  /** Bin display number (1-indexed) */
  bin_number: number;
  /** Pack identifier */
  pack_number: string;
  /** Game name for display */
  game_name: string;
  /** Game ticket price */
  game_price: number;
  /** Starting serial for the business period */
  starting_serial: string;
  /** Ending/closing serial recorded at day close */
  closing_serial: string;
  /** Number of tickets sold (ending - starting, with fencepost handling) */
  tickets_sold: number;
  /** Sales amount (tickets_sold × game_price) */
  sales_amount: number;
}

/**
 * Depleted pack summary
 * Pack that was sold out during the business period
 */
export interface DepletedPackSummary {
  pack_id: string;
  pack_number: string;
  game_name: string;
  game_price: number;
  bin_number: number;
  activated_at: string;
  depleted_at: string;
}

/**
 * Returned pack summary
 * Pack that was returned during the business period
 */
export interface ReturnedPackSummary {
  pack_id: string;
  pack_number: string;
  game_name: string;
  game_price: number;
  bin_number: number;
  activated_at: string;
  returned_at: string;
  return_reason: string | null;
  return_notes: string | null;
  last_sold_serial: string | null;
  tickets_sold_on_return: number | null;
  return_sales_amount: number | null;
  returned_by_name: string | null;
}

/**
 * Activated pack summary
 * Pack that was activated during the business period
 */
export interface ActivatedPackSummary {
  pack_id: string;
  pack_number: string;
  game_name: string;
  game_price: number;
  bin_number: number;
  activated_at: string;
  status: "ACTIVE" | "DEPLETED" | "RETURNED";
}

/**
 * Open business period metadata
 * Used by pack section components to display appropriate context
 *
 * @security FE-005: UI_SECURITY - Display-only metadata, no sensitive data
 */
export interface OpenBusinessPeriodSummary {
  /** When the business period started (last day close timestamp) */
  started_at: string | null;
  /** The business date of the last closed day (YYYY-MM-DD) */
  last_closed_date: string | null;
  /** Number of days since last close (for UI warning if > 1) */
  days_since_last_close: number | null;
  /** True if this is the first period (no prior day closes) */
  is_first_period: boolean;
}

/**
 * Money received state for the shift
 * Matches MoneyReceivedState structure in frontend
 */
export interface ShiftMoneyReceivedSummary {
  pos: {
    cash: number;
    creditCard: number;
    debitCard: number;
    ebt: number;
    cashPayouts: number;
    lotteryPayouts: number;
    gamingPayouts: number;
  };
  reports: {
    cashPayouts: number;
    lotteryPayouts: number;
    gamingPayouts: number;
  };
}

/**
 * Sales breakdown state for the shift
 * Matches SalesBreakdownState structure in frontend
 */
export interface ShiftSalesBreakdownSummary {
  pos: {
    gasSales: number;
    grocery: number;
    tobacco: number;
    beverages: number;
    snacks: number;
    other: number;
    scratchOff: number;
    instantCashes: number;
    onlineLottery: number;
    onlineCashes: number;
    salesTax: number;
  };
  reports: {
    scratchOff: number;
    instantCashes: number;
    onlineLottery: number;
    onlineCashes: number;
  };
}

/**
 * Complete shift lottery summary response
 * Contains all data needed to render the full reconciliation view
 */
export interface ShiftLotterySummaryResponse {
  /** Shift identifier */
  shift_id: string;
  /** Store identifier */
  store_id: string;
  /** Business date for this shift (YYYY-MM-DD) */
  business_date: string;
  /** Whether lottery was closed for this business day */
  lottery_closed: boolean;
  /** Lottery close timestamp if closed */
  lottery_closed_at: string | null;

  /** Aggregated lottery totals from ShiftSummary */
  lottery_totals: {
    /** Total lottery sales */
    lottery_sales: number;
    /** Total lottery cashes/payouts */
    lottery_cashes: number;
    /** Net lottery (sales - cashes) */
    lottery_net: number;
    /** Number of packs sold/closed */
    packs_sold: number;
    /** Total tickets sold */
    tickets_sold: number;
  };

  /** Per-bin lottery close details */
  bins_closed: LotteryBinCloseSummary[];

  /** Packs depleted during this business period */
  depleted_packs: DepletedPackSummary[];

  /** Packs returned during this business period */
  returned_packs: ReturnedPackSummary[];

  /** Packs activated during this business period */
  activated_packs: ActivatedPackSummary[];

  /** Open business period metadata for pack section components */
  open_business_period: OpenBusinessPeriodSummary;

  /** Money received breakdown */
  money_received: ShiftMoneyReceivedSummary;

  /** Sales breakdown by department */
  sales_breakdown: ShiftSalesBreakdownSummary;

  /** Shift timing and personnel info */
  shift_info: {
    terminal_name: string | null;
    shift_number: number | null;
    cashier_name: string;
    opened_at: string;
    closed_at: string | null;
    opening_cash: number;
    closing_cash: number | null;
    expected_cash: number | null;
    variance: number | null;
  };
}
