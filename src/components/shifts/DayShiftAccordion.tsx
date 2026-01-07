"use client";

/**
 * Day-Shift Accordion Component
 *
 * Unified accordion view that displays Day Summaries as parent rows with
 * their associated Shifts as collapsible children. Supports:
 * - Current day highlighting
 * - Current (open) shift highlighting
 * - Shift numbering (Shift 1, Shift 2, etc.)
 * - Click navigation to day/shift detail pages
 * - All accordions expanded by default
 *
 * Design Pattern:
 * - Follows LotteryTable accordion design pattern for visual consistency
 * - Uses Table size="compact" for data-dense views
 * - Blue gradient child rows with left border indicator
 * - Dark mode support with proper color contrast (WCAG 2.1 AA)
 *
 * Enterprise Standards Applied:
 * - FE-005: UI_SECURITY - No sensitive data in DOM; display-only component
 * - SEC-004: XSS - All values escaped via React's default behavior
 * - FE-020: REACT_OPTIMIZATION - Memoized callbacks and derived values
 * - FE-002: FORM_VALIDATION - Click handlers validate data before navigation
 *
 * @security FE-005: Component displays only pre-sanitized business data
 */

import * as React from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, cn } from "@/lib/utils";
import { ShiftStatusBadge } from "./ShiftStatusBadge";
import { formatDateTime, formatBusinessDate } from "@/utils/date-format.utils";
import { useStoreTimezone } from "@/contexts/StoreContext";
import type {
  DayShiftAccordionProps,
  DayAccordionItem,
  DayShiftItem,
} from "./types/day-shift-accordion.types";

/**
 * Centralized style constants for expandable accordion rows
 *
 * ACCESSIBILITY: Dark mode support with proper color contrast
 * These constants ensure consistent styling across all accordion rows
 * and maintain WCAG 2.1 AA contrast requirements in both light and dark modes.
 *
 * Pattern: Matches LotteryTable ACCORDION_STYLES for visual consistency
 *
 * @remarks
 * - FE-005: UI_SECURITY - No sensitive data in styling, pure visual enhancement
 * - SEC-004: XSS - Static class strings, no user input interpolation
 */
const ACCORDION_STYLES = {
  /**
   * Background gradient for expanded rows
   * Light: blue-50 → slate-50 (subtle blue tint)
   * Dark: blue-950 → slate-900 (dark blue tint for visibility)
   */
  ROW_BASE:
    "bg-gradient-to-r from-blue-50 to-slate-50 dark:from-blue-950 dark:to-slate-900 border-l-[3px] border-l-blue-500 dark:border-l-blue-400",

  /**
   * Hover state for interactive data rows
   * Light: blue-100 → blue-50 (slightly darker on hover)
   * Dark: blue-900 → blue-950 (slightly lighter on hover)
   */
  ROW_HOVER:
    "hover:from-blue-100 hover:to-blue-50 dark:hover:from-blue-900 dark:hover:to-blue-950",

  /**
   * Header text styling for column labels in child table
   * Light: blue-700 (dark blue for readability)
   * Dark: blue-300 (light blue for contrast against dark background)
   */
  HEADER_TEXT: "text-xs font-medium text-blue-700 dark:text-blue-300 py-1",
} as const;

/**
 * Format timestamp for display (date and time) with store timezone
 * SEC-004: Output encoding handled by React
 *
 * Uses centralized date formatting utility for consistent timezone handling.
 *
 * @param timestamp - ISO 8601 timestamp string
 * @param storeTimezone - IANA timezone string (e.g., "America/New_York")
 * @returns Formatted date/time string or em-dash for null
 */
function formatTimestamp(
  timestamp: string | null,
  storeTimezone: string,
): string {
  if (!timestamp) return "—";
  try {
    return formatDateTime(timestamp, storeTimezone);
  } catch {
    return timestamp;
  }
}

/**
 * Format business date for display (date only, no time)
 *
 * Uses centralized formatBusinessDate utility which correctly handles YYYY-MM-DD
 * strings as conceptual dates (not UTC timestamps). This prevents the bug where
 * `new Date("2026-01-06")` gets interpreted as UTC midnight and shifted back
 * a day when displayed in local time.
 *
 * SEC-004: Output encoding handled by React
 *
 * @param dateStr - Date string in YYYY-MM-DD format (business date)
 * @returns Formatted date string or em-dash for null
 */
function formatDateOnly(dateStr: string | null): string {
  // Delegate to centralized utility which handles all edge cases
  return formatBusinessDate(dateStr);
}

/**
 * Format variance amount with color coding
 * Positive = green, Negative = red, Zero = neutral
 *
 * @param amount - Variance amount or null
 * @returns Object with formatted value and CSS class
 */
function formatVariance(amount: number | null): {
  value: string;
  className: string;
} {
  if (amount === null || amount === undefined) {
    return { value: "—", className: "" };
  }

  const formattedValue = formatCurrency(Math.abs(amount), "USD", "en-US");
  const prefix = amount > 0 ? "+" : amount < 0 ? "-" : "";

  let className = "";
  if (amount > 0) {
    className = "text-green-600 dark:text-green-400";
  } else if (amount < 0) {
    className = "text-destructive";
  }

  return {
    value: `${prefix}${formattedValue}`,
    className,
  };
}

/**
 * DayAccordionHeader Component
 *
 * Renders the clickable day row with expand/collapse functionality.
 * Displays day summary metrics in a card-like bordered container.
 * Follows LotteryTable design pattern with:
 * - Ghost button chevron toggle (matches LotteryTable expand buttons)
 * - Current day highlighting
 * - Consistent hover states
 *
 * @security FE-005: Display-only, no mutations or sensitive data
 * @security SEC-004: XSS - All values escaped via React's default behavior
 */
const DayAccordionHeader = React.memo(function DayAccordionHeader({
  item,
  isExpanded,
  onDayClick,
}: {
  item: DayAccordionItem;
  isExpanded: boolean;
  onDayClick?: (item: DayAccordionItem) => void;
}) {
  const variance = formatVariance(item.totalCashVariance);

  /**
   * Handle day row click for navigation
   * Stops propagation to prevent triggering accordion toggle
   *
   * @security FE-002: Validates item data before navigation
   * @security SEC-014: INPUT_VALIDATION - Validates storeId and businessDate exist
   */
  const handleDayClick = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onDayClick && item.storeId && item.businessDate) {
        onDayClick(item);
      }
    },
    [onDayClick, item],
  );

  return (
    <div
      className={cn(
        "flex items-center justify-between px-4 py-3 rounded-lg border transition-colors",
        "hover:bg-muted/50 cursor-pointer",
        item.isCurrentDay && "border-primary bg-primary/5",
        !item.isCurrentDay && "border-border bg-card",
      )}
      onClick={handleDayClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleDayClick(e as unknown as React.MouseEvent);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`View details for ${formatDateOnly(item.businessDate)}`}
      data-testid={`day-accordion-header-${item.businessDate}`}
    >
      {/* Chevron toggle button - matches LotteryTable expand button pattern */}
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="p-0 h-table-icon-button-compact w-table-icon-button-compact mr-3"
          onClick={(e) => e.stopPropagation()}
          aria-label={isExpanded ? "Collapse shifts" : "Expand shifts"}
          data-testid={`day-accordion-toggle-${item.businessDate}`}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      </CollapsibleTrigger>

      {/* Day info grid - SEC-004: All text content escaped by React */}
      <div className="flex-1 grid grid-cols-6 gap-4 items-center text-sm">
        {/* Date */}
        <div className="font-medium">
          {formatDateOnly(item.businessDate)}
          {item.isCurrentDay && (
            <span className="ml-2 text-xs text-primary">(Today)</span>
          )}
        </div>

        {/* Shift count */}
        <div className="text-muted-foreground">
          {item.shiftCount} {item.shiftCount === 1 ? "shift" : "shifts"}
        </div>

        {/* Transaction count */}
        <div className="text-muted-foreground">
          {item.transactionCount} txns
        </div>

        {/* Gross Sales */}
        <div className="text-right">
          {formatCurrency(item.grossSales, "USD", "en-US")}
        </div>

        {/* Variance */}
        <div
          className={cn(
            "text-right flex items-center justify-end gap-1",
            variance.className,
          )}
        >
          <span>{variance.value}</span>
          {item.totalCashVariance !== 0 && (
            <AlertTriangle className="h-3 w-3" aria-label="Variance present" />
          )}
        </div>

        {/* Status */}
        <div className="text-right">
          <span
            data-testid={`day-status-badge-${item._originalDaySummary.day_summary_id}`}
            className={cn(
              "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium",
              item.status === "CLOSED"
                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
            )}
          >
            {item.status === "CLOSED" ? "Closed" : "Open"}
          </span>
        </div>
      </div>
    </div>
  );
});

DayAccordionHeader.displayName = "DayAccordionHeader";

/**
 * ShiftTable Component
 *
 * Renders the table of shifts within a day accordion.
 * Follows LotteryTable design pattern with:
 * - Table size="compact" for data-dense views
 * - Blue gradient child rows with left border indicator
 * - Consistent header styling using ACCORDION_STYLES
 *
 * @security FE-005: Display-only, no mutations or sensitive data
 * @security SEC-004: XSS - All values escaped via React's default behavior
 */
const ShiftTable = React.memo(function ShiftTable({
  shifts,
  onShiftClick,
}: {
  shifts: ReadonlyArray<DayShiftItem>;
  onShiftClick?: (shift: DayShiftItem) => void;
}) {
  // Get store timezone for date formatting
  const storeTimezone = useStoreTimezone();

  if (shifts.length === 0) {
    return (
      <div
        className={cn(
          ACCORDION_STYLES.ROW_BASE,
          "py-4 text-center text-muted-foreground text-sm ml-8 mt-2 mb-4 rounded-md",
        )}
      >
        No shifts recorded for this day
      </div>
    );
  }

  return (
    <div
      className="rounded-md border overflow-x-auto ml-8 mt-2 mb-4"
      role="region"
      aria-label="Shifts table"
    >
      <Table size="compact">
        <TableHeader>
          {/* Header row with ACCORDION_STYLES for visual consistency */}
          <TableRow className={ACCORDION_STYLES.ROW_BASE}>
            <TableHead className={cn(ACCORDION_STYLES.HEADER_TEXT, "w-24")}>
              Shift
            </TableHead>
            <TableHead className={ACCORDION_STYLES.HEADER_TEXT}>
              Cashier
            </TableHead>
            <TableHead className={ACCORDION_STYLES.HEADER_TEXT}>
              Opened At
            </TableHead>
            <TableHead className={ACCORDION_STYLES.HEADER_TEXT}>
              Closed At
            </TableHead>
            <TableHead className={ACCORDION_STYLES.HEADER_TEXT}>
              Status
            </TableHead>
            <TableHead
              className={cn(ACCORDION_STYLES.HEADER_TEXT, "text-right")}
            >
              Variance
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shifts.map((shift) => (
            <ShiftTableRow
              key={shift.shiftId}
              shift={shift}
              onClick={onShiftClick}
              storeTimezone={storeTimezone}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
});

ShiftTable.displayName = "ShiftTable";

/**
 * ShiftTableRow Component
 *
 * Individual shift row with highlighting for current/open shifts.
 * Follows LotteryTable design pattern with:
 * - Blue gradient background with left border indicator
 * - Hover state transitions
 * - Current shift highlighting with pulse indicator
 *
 * @security FE-005: Display-only, validates data before navigation
 * @security SEC-004: XSS - All values escaped via React's default behavior
 */
const ShiftTableRow = React.memo(function ShiftTableRow({
  shift,
  onClick,
  storeTimezone,
}: {
  shift: DayShiftItem;
  onClick?: (shift: DayShiftItem) => void;
  storeTimezone: string;
}) {
  const variance = formatVariance(shift.varianceAmount);

  /**
   * Handle shift row click for navigation
   *
   * @security FE-002: Validates shift data before navigation
   * @security SEC-014: INPUT_VALIDATION - Validates shiftId exists before callback
   */
  const handleClick = React.useCallback(() => {
    if (onClick && shift.shiftId) {
      onClick(shift);
    }
  }, [onClick, shift]);

  /**
   * Handle keyboard navigation for accessibility
   *
   * @security SEC-004: XSS - No user input interpolation in event handlers
   */
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick],
  );

  return (
    <TableRow
      className={cn(
        // Base accordion row styling for visual consistency with LotteryTable
        ACCORDION_STYLES.ROW_BASE,
        ACCORDION_STYLES.ROW_HOVER,
        // Interactive states
        onClick && "cursor-pointer",
        // Current shift highlighting (enhanced visibility for active shift)
        shift.isCurrentShift && "ring-1 ring-primary ring-inset",
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? "button" : undefined}
      aria-label={`View details for Shift ${shift.shiftNumber}`}
      data-testid={`shift-row-${shift.shiftId}`}
      data-current-shift={shift.isCurrentShift}
    >
      {/* Shift number - SEC-004: React escapes shift.shiftNumber automatically */}
      <TableCell className="font-medium">
        <span className="flex items-center gap-2">
          {shift.isCurrentShift && (
            <span
              className="w-2 h-2 rounded-full bg-primary animate-pulse"
              aria-label="Current active shift"
            />
          )}
          Shift {shift.shiftNumber}
        </span>
      </TableCell>

      {/* Cashier - SEC-004: React escapes cashierName automatically */}
      <TableCell>{shift.cashierName}</TableCell>

      {/* Opened At - SEC-004: formatTimestamp returns sanitized string */}
      <TableCell>{formatTimestamp(shift.openedAt, storeTimezone)}</TableCell>

      {/* Closed At - SEC-004: formatTimestamp returns sanitized string */}
      <TableCell>{formatTimestamp(shift.closedAt, storeTimezone)}</TableCell>

      {/* Status - ShiftStatusBadge handles its own XSS protection */}
      <TableCell>
        <ShiftStatusBadge status={shift.status} shiftId={shift.shiftId} />
      </TableCell>

      {/* Variance - SEC-004: formatVariance returns sanitized string */}
      <TableCell className={cn("text-right", variance.className)}>
        <span className="flex items-center justify-end gap-1">
          {variance.value}
          {shift.varianceAmount !== null &&
            shift.varianceAmount !== 0 &&
            shift.status === "VARIANCE_REVIEW" && (
              <AlertTriangle
                className="h-3 w-3 text-destructive"
                aria-label="Variance requires review"
              />
            )}
        </span>
      </TableCell>
    </TableRow>
  );
});

ShiftTableRow.displayName = "ShiftTableRow";

/**
 * DayShiftAccordion Component
 *
 * Main accordion component that renders the unified Day-Shift view.
 * Each day is a collapsible section with its shifts displayed below the day header.
 *
 * Layout:
 * ```
 * ┌─ DAY ROW (Parent - Clickable header) ─────────────────────┐
 * │  ▼ Jan 06, 2026  │ 2 shifts │ $4,520 │ — │ ● Open         │
 * └───────────────────────────────────────────────────────────┘
 * ┌─ SHIFTS TABLE (Children - Expands below parent) ──────────┐
 * │  Shift 1    John Doe      06:00    14:00    -$12.50       │
 * │  ● Shift 2  Jane Smith    14:00    —        —      ← OPEN │
 * └───────────────────────────────────────────────────────────┘
 * ```
 *
 * @security FE-005: UI_SECURITY - Display-only, all data pre-sanitized
 * @security FE-020: REACT_OPTIMIZATION - Memoized subcomponents
 */
export function DayShiftAccordion({
  items,
  onDayClick,
  onShiftClick,
  isLoading = false,
  defaultExpandedDays,
}: DayShiftAccordionProps) {
  /**
   * Track expanded state for each day
   * Defaults to all expanded if defaultExpandedDays not provided
   *
   * FE-020: Using Set for O(1) lookup performance
   */
  const [expandedDays, setExpandedDays] = React.useState<Set<string>>(() => {
    if (defaultExpandedDays) {
      return new Set(defaultExpandedDays);
    }
    // Default: all days expanded
    return new Set(items.map((item) => item.daySummaryId));
  });

  /**
   * Update expanded days when items change (new data loaded)
   * Ensures new items are expanded by default
   */
  React.useEffect(() => {
    if (!defaultExpandedDays) {
      setExpandedDays(new Set(items.map((item) => item.daySummaryId)));
    }
  }, [items, defaultExpandedDays]);

  /**
   * Toggle expanded state for a specific day
   *
   * FE-020: Memoized callback to prevent unnecessary re-renders
   */
  const toggleExpanded = React.useCallback((daySummaryId: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(daySummaryId)) {
        next.delete(daySummaryId);
      } else {
        next.add(daySummaryId);
      }
      return next;
    });
  }, []);

  if (isLoading) {
    return (
      <div
        className="space-y-4"
        data-testid="day-shift-accordion-loading"
        aria-busy="true"
        aria-label="Loading shift data"
      >
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-16 rounded-lg border bg-muted/20 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className="py-12 text-center border rounded-lg"
        data-testid="day-shift-accordion-empty"
      >
        <p className="text-muted-foreground">No day reports found</p>
      </div>
    );
  }

  return (
    <div
      className="space-y-2"
      data-testid="day-shift-accordion"
      role="region"
      aria-label="Day and shift reports"
    >
      {/* Static header row for the day table */}
      <div
        className="flex items-center px-4 py-2 border-b bg-muted/30 rounded-t-lg"
        data-testid="day-accordion-header-row"
      >
        {/* Spacer for chevron button */}
        <div className="w-8 mr-3" />
        {/* Header columns matching day row grid */}
        <div className="flex-1 grid grid-cols-6 gap-4 items-center text-sm font-medium text-muted-foreground">
          <div>Date</div>
          <div>Shifts</div>
          <div>Transactions</div>
          <div className="text-right">Gross Sales</div>
          <div className="text-right">Variance</div>
          <div className="text-right">Status</div>
        </div>
      </div>
      {items.map((item) => {
        const isExpanded = expandedDays.has(item.daySummaryId);

        return (
          <Collapsible
            key={item.daySummaryId}
            open={isExpanded}
            onOpenChange={() => toggleExpanded(item.daySummaryId)}
            data-testid={`day-accordion-${item.businessDate}`}
          >
            {/* Day header row (parent - clickable to expand) */}
            <DayAccordionHeader
              item={item}
              isExpanded={isExpanded}
              onDayClick={onDayClick}
            />

            {/* Shifts table BELOW the day header (children expand downward) */}
            <CollapsibleContent>
              <ShiftTable shifts={item.shifts} onShiftClick={onShiftClick} />
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}

export default DayShiftAccordion;
