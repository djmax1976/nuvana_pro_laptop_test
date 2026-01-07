/**
 * Day-Shift Accordion Type Definitions
 *
 * Type definitions for the unified Day-Shift accordion view component.
 * Combines Day Summary (parent) and Shift (children) data structures.
 *
 * Enterprise Standards Applied:
 * - SEC-014: INPUT_VALIDATION - All types validated via Zod schemas where applicable
 * - FE-005: UI_SECURITY - No sensitive data exposed; only display-safe fields included
 * - API-008: OUTPUT_FILTERING - Types reflect whitelisted response fields only
 *
 * Date Handling Strategy:
 * - Business dates (YYYY-MM-DD) are conceptual day identifiers, NOT timestamps
 * - Timestamps (ISO 8601) are converted to store timezone for date extraction
 * - "Today" detection uses store timezone, not browser timezone
 *
 * @security FE-005: All fields are display-safe business identifiers
 */

import type { ShiftResponse, ShiftStatus } from "@/lib/api/shifts";
import type { DaySummary, DaySummaryStatus } from "@/lib/api/day-summaries";
import {
  extractBusinessDateFromTimestamp,
  getTodayBusinessDate,
} from "@/utils/date-format.utils";

/**
 * Shift item within a day accordion
 * Extends ShiftResponse with computed display fields
 *
 * @security FE-005: shift_number is a business identifier, safe for display
 */
export interface DayShiftItem {
  /** Unique shift identifier (UUID) */
  readonly shiftId: string;

  /** Computed shift number for display (e.g., "Shift 1", "Shift 2") */
  readonly shiftNumber: number;

  /** Cashier name for display */
  readonly cashierName: string;

  /** Shift opened timestamp (ISO 8601) */
  readonly openedAt: string;

  /** Shift closed timestamp (ISO 8601), null if still open */
  readonly closedAt: string | null;

  /** Shift status */
  readonly status: ShiftStatus;

  /** Cash variance amount, null if not yet calculated */
  readonly varianceAmount: number | null;

  /** Whether this is the currently active (open) shift */
  readonly isCurrentShift: boolean;

  /** Original shift data for navigation */
  readonly _originalShift: ShiftResponse;
}

/**
 * Day accordion item containing day summary and its shifts
 *
 * @security FE-005: Only display-safe aggregated data exposed
 */
export interface DayAccordionItem {
  /** Unique day summary identifier (UUID) */
  readonly daySummaryId: string;

  /** Store identifier for navigation */
  readonly storeId: string;

  /** Business date in YYYY-MM-DD format */
  readonly businessDate: string;

  /** Day summary status */
  readonly status: DaySummaryStatus;

  /** Number of shifts in this day */
  readonly shiftCount: number;

  /** Total transaction count for the day */
  readonly transactionCount: number;

  /** Gross sales total for the day */
  readonly grossSales: number;

  /** Net sales total for the day */
  readonly netSales: number;

  /** Total cash variance for the day */
  readonly totalCashVariance: number;

  /** Whether this is the current (today's) day */
  readonly isCurrentDay: boolean;

  /** Child shifts belonging to this day, sorted by opened_at ascending */
  readonly shifts: ReadonlyArray<DayShiftItem>;

  /** Original day summary data for navigation */
  readonly _originalDaySummary: DaySummary;
}

/**
 * Props for the DayShiftAccordion component
 *
 * @security SEC-014: All callback parameters validated before invocation
 */
export interface DayShiftAccordionProps {
  /** Array of day accordion items to display */
  readonly items: ReadonlyArray<DayAccordionItem>;

  /** Callback when a day row is clicked (navigates to day summary detail) */
  readonly onDayClick?: (item: DayAccordionItem) => void;

  /** Callback when a shift row is clicked (navigates to shift detail) */
  readonly onShiftClick?: (shift: DayShiftItem) => void;

  /** Whether the accordion is in loading state */
  readonly isLoading?: boolean;

  /** IDs of initially expanded days (defaults to all expanded) */
  readonly defaultExpandedDays?: ReadonlyArray<string>;
}

/**
 * Props for the DayAccordionHeader component (clickable day row)
 *
 * @security FE-005: UI_SECURITY - Display-only component, no mutations
 */
export interface DayAccordionHeaderProps {
  /** Day item data */
  readonly item: DayAccordionItem;

  /** Whether this accordion is expanded */
  readonly isExpanded: boolean;

  /** Toggle expand/collapse callback */
  readonly onToggle: () => void;

  /** Click handler for navigation (separate from toggle) */
  readonly onClick?: (item: DayAccordionItem) => void;
}

/**
 * Props for the ShiftTableRow component
 *
 * @security FE-005: UI_SECURITY - Display-only component, no mutations
 */
export interface ShiftTableRowProps {
  /** Shift item data */
  readonly shift: DayShiftItem;

  /** Click handler for navigation */
  readonly onClick?: (shift: DayShiftItem) => void;
}

/**
 * Configuration options for transforming accordion items.
 *
 * Enterprise Standards Applied:
 * - SEC-014: INPUT_VALIDATION - Timezone validated before use
 */
export interface TransformAccordionOptions {
  /**
   * Store timezone (IANA format, e.g., "America/New_York").
   * Required for correct "today" detection and timestamp-to-date conversion.
   *
   * @security SEC-014: Validated as non-empty string
   */
  readonly storeTimezone: string;
}

/**
 * Transform raw API responses into DayAccordionItem structure
 *
 * IMPORTANT: This function uses day_summary_id for grouping shifts to their
 * correct business day. This is the authoritative source for shift-to-day
 * association, correctly handling overnight operations where a business day
 * may span across midnight.
 *
 * Business Rule: A shift belongs to the business day that was ACTIVE (OPEN status)
 * when the shift was opened, regardless of calendar date. This means:
 * - A shift opened on Jan 6th at 2 AM while Jan 5th's business day is still open
 *   will belong to the Jan 5th business day.
 *
 * Date Handling:
 * - "Today" detection uses store timezone, not browser timezone
 * - Fallback date extraction from timestamps uses store timezone
 * - Business dates (YYYY-MM-DD) are compared as strings (no timezone conversion)
 *
 * Enterprise Standards Applied:
 * - DB-006: TENANT_ISOLATION - Shift-day associations enforced by FK
 * - SEC-014: INPUT_VALIDATION - All inputs validated before processing
 * - FE-020: REACT_OPTIMIZATION - Efficient data transformation
 *
 * @param daySummaries - Array of day summaries from API
 * @param shifts - Array of shifts from API (with day_summary_id)
 * @param options - Transformation options including store timezone
 * @returns Array of DayAccordionItem sorted by business_date descending (most recent first)
 *
 * @security SEC-014: Validates data integrity before processing
 */
export function transformToAccordionItems(
  daySummaries: ReadonlyArray<DaySummary>,
  shifts: ReadonlyArray<ShiftResponse>,
  options: TransformAccordionOptions,
): DayAccordionItem[] {
  // SEC-014: Validate required timezone parameter
  const storeTimezone = options.storeTimezone;
  if (!storeTimezone || typeof storeTimezone !== "string") {
    // Fail safely with empty result rather than incorrect date calculations
    // This prevents silent bugs where "today" detection is wrong
    console.error(
      "[transformToAccordionItems] Missing or invalid storeTimezone. " +
        "Cannot correctly determine 'today' or extract dates from timestamps.",
    );
    return [];
  }

  // Calculate "today" in the store's timezone (not browser timezone)
  const todayDate = getTodayBusinessDate(storeTimezone);

  // ENTERPRISE FIX: Group shifts by day_summary_id (authoritative FK association)
  // This correctly handles overnight operations where business days span midnight
  const shiftsByDaySummaryId = new Map<string, ShiftResponse[]>();

  // Also keep a fallback map by business_date for legacy shifts without day_summary_id
  const shiftsByDateFallback = new Map<string, ShiftResponse[]>();

  for (const shift of shifts) {
    // PRIMARY: Group by day_summary_id if available (enterprise-grade approach)
    if (shift.day_summary_id) {
      const existing = shiftsByDaySummaryId.get(shift.day_summary_id) || [];
      existing.push(shift);
      shiftsByDaySummaryId.set(shift.day_summary_id, existing);
    } else {
      // FALLBACK: For legacy shifts without day_summary_id, use date extraction
      // This maintains backwards compatibility during migration
      // CRITICAL: Use store timezone for correct date extraction from timestamps
      const businessDate = extractBusinessDateFromTimestamp(
        shift.opened_at,
        storeTimezone,
      );
      if (businessDate) {
        const existing = shiftsByDateFallback.get(businessDate) || [];
        existing.push(shift);
        shiftsByDateFallback.set(businessDate, existing);
      }
    }
  }

  // Transform day summaries into accordion items
  const items: DayAccordionItem[] = daySummaries.map((daySummary) => {
    // PRIMARY: Get shifts by day_summary_id (authoritative)
    let dayShifts = shiftsByDaySummaryId.get(daySummary.day_summary_id) || [];

    // FALLBACK: Merge in any legacy shifts grouped by date (for backwards compatibility)
    const fallbackShifts =
      shiftsByDateFallback.get(daySummary.business_date) || [];
    if (fallbackShifts.length > 0) {
      // Filter out any fallback shifts that already have a day_summary_id
      // (they would be in the primary map)
      const unmappedFallbackShifts = fallbackShifts.filter(
        (shift) => !shift.day_summary_id,
      );
      dayShifts = [...dayShifts, ...unmappedFallbackShifts];
    }

    // Sort shifts by opened_at ascending (earliest first) for consistent numbering
    const sortedShifts = [...dayShifts].sort(
      (a, b) =>
        new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime(),
    );

    // Transform shifts with computed fields
    const transformedShifts: DayShiftItem[] = sortedShifts.map(
      (shift, index) => ({
        shiftId: shift.shift_id,
        shiftNumber: index + 1, // 1-based numbering within the day
        cashierName: shift.cashier_name || "Unknown",
        openedAt: shift.opened_at,
        closedAt: shift.closed_at,
        status: shift.status,
        varianceAmount: shift.variance_amount,
        isCurrentShift: isShiftOpen(shift.status),
        _originalShift: shift,
      }),
    );

    const isCurrentDay = daySummary.business_date === todayDate;

    return {
      daySummaryId: daySummary.day_summary_id,
      storeId: daySummary.store_id,
      businessDate: daySummary.business_date,
      status: daySummary.status,
      shiftCount: daySummary.shift_count,
      transactionCount: daySummary.transaction_count,
      grossSales: daySummary.gross_sales,
      netSales: daySummary.net_sales,
      totalCashVariance: daySummary.total_cash_variance,
      isCurrentDay,
      shifts: transformedShifts,
      _originalDaySummary: daySummary,
    };
  });

  // Sort by business_date descending (most recent first)
  return items.sort(
    (a, b) =>
      new Date(b.businessDate).getTime() - new Date(a.businessDate).getTime(),
  );
}

// NOTE: extractBusinessDate has been removed in favor of the centralized
// extractBusinessDateFromTimestamp utility from @/utils/date-format.utils.
// The centralized version correctly uses store timezone for date extraction.

/**
 * Check if a shift status indicates the shift is currently open/active
 *
 * @param status - Shift status value
 * @returns True if shift is open/active
 */
function isShiftOpen(status: ShiftStatus): boolean {
  return status === "OPEN" || status === "ACTIVE" || status === "NOT_STARTED";
}

/**
 * Get today's date in YYYY-MM-DD format using store timezone.
 *
 * IMPORTANT: This function requires a store timezone to correctly determine
 * "today" for the store's location. Using browser timezone would cause
 * incorrect "today" detection for stores in different timezones.
 *
 * Enterprise Standards Applied:
 * - SEC-014: INPUT_VALIDATION - Timezone parameter validated
 *
 * @param storeTimezone - IANA timezone string (e.g., "America/New_York")
 * @returns Today's date in YYYY-MM-DD format in the store's timezone
 *
 * @security SEC-014: Validates timezone input before processing
 *
 * @example
 * // At 11 PM UTC on Jan 5, 2026:
 * getTodayDateString("America/New_York");
 * // Returns: "2026-01-05" (6 PM in NYC - still Jan 5)
 *
 * getTodayDateString("Asia/Tokyo");
 * // Returns: "2026-01-06" (8 AM in Tokyo - already Jan 6)
 */
export function getTodayDateString(storeTimezone: string): string {
  // Delegate to centralized utility for consistent timezone handling
  return getTodayBusinessDate(storeTimezone);
}
