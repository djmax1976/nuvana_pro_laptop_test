"use client";

/**
 * Day Summary Detail Page for Client Owner Dashboard
 *
 * Displays comprehensive day close information matching the Shift Detail page layout:
 * - Header with date, store, and status badge
 * - Two-column layout: MoneyReceivedCard (left) + SalesBreakdownCard (right)
 * - LotterySalesDetails table (bins closed with starting/ending serials)
 * - Cash Reconciliation card
 * - Variance Details card (conditional)
 * - Success message when no variance
 *
 * Route: /client-dashboard/day-summary/[storeId]/[date]
 *
 * MCP Guidance Applied:
 * - SEC-001: AUTHENTICATION - Requires authenticated user session
 * - SEC-010: AUTHORIZATION - SHIFT_REPORT_VIEW permission required via API
 * - SEC-014: INPUT_VALIDATION - Strict route parameter validation with allowlists
 * - FE-001: STATE_MANAGEMENT - Secure state management, no secrets in localStorage
 * - FE-005: UI_SECURITY - Read-only display, no sensitive data exposed
 * - SEC-004: XSS - All data properly escaped through React rendering
 * - API-008: OUTPUT_FILTERING - Uses whitelisted API response fields only
 *
 * @security
 * - SEC-014: INPUT_VALIDATION - UUID and date format validation on route params
 * - FE-005: UI_SECURITY - No sensitive data exposed, read-only display
 * - SEC-004: XSS - React auto-escapes all output
 */

import { useParams, useRouter } from "next/navigation";
import { useDayCloseReconciliation } from "@/lib/api/day-summaries";
import {
  formatBusinessDateFull,
  formatDateTime,
  formatTime,
} from "@/utils/date-format.utils";
import { useStoreTimezone } from "@/contexts/StoreContext";
import {
  Loader2,
  ArrowLeft,
  AlertCircle,
  Calendar,
  FileText,
  DollarSign,
  Clock,
  Users,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePageTitleEffect } from "@/contexts/PageTitleContext";

// Import shared shift-closing components for consistent layout
import {
  MoneyReceivedCard,
  SalesBreakdownCard,
  LotterySalesDetails,
  type MoneyReceivedState,
  type SalesBreakdownState,
} from "@/components/shift-closing";

import type { LotteryCloseResult } from "@/components/lottery/DayCloseModeScanner";

// ============================================================================
// INPUT VALIDATION
// SEC-014: INPUT_VALIDATION - Validate route parameters using strict allowlists
// ============================================================================

/**
 * UUID v4 regex pattern for storeId validation
 * SEC-014: Strict allowlist pattern for UUID format - prevents injection attacks
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Date format regex (YYYY-MM-DD)
 * SEC-014: Strict allowlist pattern for date format - prevents format injection
 */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate storeId parameter
 * SEC-014: INPUT_VALIDATION - Reject malformed UUIDs at boundary
 *
 * @param storeId - Raw storeId from route params
 * @returns Type-guarded string if valid, false otherwise
 */
function isValidStoreId(storeId: unknown): storeId is string {
  return typeof storeId === "string" && UUID_PATTERN.test(storeId);
}

/**
 * Validate date parameter (YYYY-MM-DD format)
 * SEC-014: INPUT_VALIDATION - Reject malformed dates at boundary
 *
 * @param date - Raw date from route params
 * @returns Type-guarded string if valid, false otherwise
 */
function isValidDate(date: unknown): date is string {
  if (typeof date !== "string" || !DATE_PATTERN.test(date)) {
    return false;
  }
  // Verify it's a real calendar date (not 2024-02-31)
  const parsed = new Date(date + "T00:00:00");
  return !Number.isNaN(parsed.getTime());
}

// ============================================================================
// UTILITY FUNCTIONS
// SEC-014: INPUT_VALIDATION - Type-safe utility functions with null checks
// NOTE: Date formatting now uses centralized utilities from date-format.utils.ts
// ============================================================================

/**
 * Safely convert value to number with NaN protection
 * SEC-014: INPUT_VALIDATION - Sanitize numeric input before display
 *
 * @param value - Value to convert
 * @returns Safe number, 0 for invalid/NaN values
 */
function safeNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Format currency for display
 * SEC-014: INPUT_VALIDATION - Sanitize numeric input before display
 *
 * @param amount - Amount to format (may be null/undefined)
 * @returns Formatted currency string
 */
function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeNumber(amount));
}

// ============================================================================
// DATA TRANSFORMATION
// API-008: OUTPUT_FILTERING - Transform API data to component-expected format
// ============================================================================

/**
 * Transform reconciliation data to MoneyReceivedState
 * Maps day totals to the dual-column layout expected by MoneyReceivedCard
 *
 * API-008: OUTPUT_FILTERING - Only map whitelisted fields
 * SEC-014: INPUT_VALIDATION - Use safeNumber for all numeric conversions
 *
 * @param dayTotals - Day totals from reconciliation API
 * @param lotteryData - Lottery data from reconciliation API
 * @returns MoneyReceivedState for component consumption
 */
function transformToMoneyReceivedState(
  dayTotals: {
    total_opening_cash: number;
    total_closing_cash: number;
    total_expected_cash: number;
    total_cash_variance: number;
    net_sales: number;
    lottery_sales: number | null;
    lottery_net: number | null;
  },
  lotteryData: {
    total_sales: number;
    is_closed: boolean;
  },
): MoneyReceivedState {
  // For historical day summary, we display the recorded values as read-only
  // POS column shows actual recorded data, Reports column shows 0 (no manual entry needed)
  return {
    pos: {
      cash: safeNumber(dayTotals.total_closing_cash),
      creditCard: 0, // Not tracked in current reconciliation data
      debitCard: 0, // Not tracked in current reconciliation data
      ebt: 0, // Not tracked in current reconciliation data
      cashPayouts: 0, // Calculated from variance if needed
      lotteryPayouts: safeNumber(
        lotteryData.is_closed ? dayTotals.lottery_net : 0,
      ),
      gamingPayouts: 0, // Not tracked in current reconciliation data
    },
    reports: {
      cashPayouts: 0,
      lotteryPayouts: safeNumber(
        lotteryData.is_closed ? dayTotals.lottery_net : 0,
      ),
      gamingPayouts: 0,
    },
  };
}

/**
 * Transform reconciliation data to SalesBreakdownState
 * Maps day totals to the dual-column layout expected by SalesBreakdownCard
 *
 * API-008: OUTPUT_FILTERING - Only map whitelisted fields
 * SEC-014: INPUT_VALIDATION - Use safeNumber for all numeric conversions
 *
 * @param dayTotals - Day totals from reconciliation API
 * @param lotteryData - Lottery data from reconciliation API
 * @returns SalesBreakdownState for component consumption
 */
function transformToSalesBreakdownState(
  dayTotals: {
    gross_sales: number;
    net_sales: number;
    tax_collected: number;
    lottery_sales: number | null;
    lottery_net: number | null;
  },
  lotteryData: {
    total_sales: number;
    is_closed: boolean;
  },
): SalesBreakdownState {
  // For historical day summary, we display the recorded values as read-only
  // POS column shows actual department sales, Reports column shows lottery data
  return {
    pos: {
      gasSales: 0, // Not broken down in current reconciliation data
      grocery: safeNumber(dayTotals.gross_sales), // Show gross as generic sales
      tobacco: 0,
      beverages: 0,
      snacks: 0,
      other: 0,
      scratchOff: 0, // Lottery in reports column
      instantCashes: 0,
      onlineLottery: 0,
      onlineCashes: 0,
      salesTax: safeNumber(dayTotals.tax_collected),
    },
    reports: {
      scratchOff: lotteryData.is_closed
        ? safeNumber(lotteryData.total_sales)
        : 0,
      instantCashes: 0, // Not tracked separately
      onlineLottery: 0, // Not tracked separately
      onlineCashes: 0, // Not tracked separately
    },
  };
}

/**
 * Transform reconciliation lottery data to LotteryCloseResult format
 * Maps bins_closed array to format expected by LotterySalesDetails component
 *
 * API-008: OUTPUT_FILTERING - Only map whitelisted fields
 * SEC-014: INPUT_VALIDATION - Use safeNumber for all numeric conversions
 *
 * @param lotteryData - Lottery data from reconciliation API
 * @param businessDate - Business date string
 * @returns LotteryCloseResult for component consumption, or null if no data
 */
function transformToLotteryCloseResult(
  lotteryData: {
    is_closed: boolean;
    bins_closed: Array<{
      bin_number: number;
      pack_number: string;
      game_name: string;
      game_price: number;
      starting_serial: string;
      closing_serial: string;
      tickets_sold: number;
      sales_amount: number;
    }>;
    total_sales: number;
    total_tickets_sold: number;
  },
  businessDate: string,
): LotteryCloseResult | null {
  if (!lotteryData.is_closed || lotteryData.bins_closed.length === 0) {
    return null;
  }

  return {
    closings_created: lotteryData.bins_closed.length,
    business_day: businessDate,
    lottery_total: safeNumber(lotteryData.total_sales),
    bins_closed: lotteryData.bins_closed.map((bin) => ({
      bin_number: safeNumber(bin.bin_number),
      pack_number: bin.pack_number || "",
      game_name: bin.game_name || "Unknown",
      closing_serial: bin.closing_serial || "",
      starting_serial: bin.starting_serial || "",
      game_price: safeNumber(bin.game_price),
      tickets_sold: safeNumber(bin.tickets_sold),
      sales_amount: safeNumber(bin.sales_amount),
    })),
  };
}

// ============================================================================
// COMPONENT
// FE-001: STATE_MANAGEMENT - Component with secure state handling
// ============================================================================

/**
 * Day Summary Detail Page Component
 *
 * Displays day close summary for a specific business date.
 * Layout matches the Shift Detail page for consistency:
 * - Header section with title, date, status
 * - Two-column layout: MoneyReceivedCard + SalesBreakdownCard
 * - LotterySalesDetails table
 * - Cash Reconciliation card
 * - Variance Details card (conditional)
 *
 * @security
 * - SEC-014: INPUT_VALIDATION - Route params validated before use
 * - FE-005: UI_SECURITY - Read-only display mode
 * - SEC-004: XSS - React auto-escapes all output
 */
export default function DaySummaryDetailPage() {
  const params = useParams();
  const router = useRouter();

  // ========================================================================
  // HOOKS
  // MCP: FE-001 STATE_MANAGEMENT - Access store timezone for date formatting
  // ========================================================================
  const storeTimezone = useStoreTimezone();

  // SEC-014: INPUT_VALIDATION - Extract and validate route parameters at boundary
  const rawStoreId = params.storeId;
  const rawDate = params.date;

  // Validate parameters using strict allowlist patterns
  const storeId = isValidStoreId(rawStoreId) ? rawStoreId : null;
  const date = isValidDate(rawDate) ? rawDate : null;

  // Set page title in header
  usePageTitleEffect("Day Summary");

  // Fetch reconciliation data - hook handles null params gracefully
  const { data, isLoading, error } = useDayCloseReconciliation(storeId, date);

  // Handle back navigation
  const handleBack = () => {
    router.push("/client-dashboard/shifts");
  };

  // ========================================================================
  // RENDER: Invalid Parameters
  // SEC-014: INPUT_VALIDATION - Show error for invalid parameters
  // ========================================================================
  if (!storeId || !date) {
    return (
      <div
        className="container mx-auto p-6"
        data-testid="day-summary-detail-invalid-params"
      >
        <Button
          variant="ghost"
          onClick={handleBack}
          className="mb-4"
          data-testid="back-button"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Shifts
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Invalid page parameters. Please navigate from the Shift Management
            page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // ========================================================================
  // RENDER: Loading State
  // ========================================================================
  if (isLoading) {
    return (
      <div
        className="container mx-auto p-6"
        data-testid="day-summary-detail-loading"
      >
        <div className="flex h-[400px] items-center justify-center">
          <div className="space-y-4 text-center">
            <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary" />
            <p className="text-muted-foreground">Loading day summary...</p>
          </div>
        </div>
      </div>
    );
  }

  // ========================================================================
  // RENDER: Error State
  // SEC-014: INPUT_VALIDATION - Sanitized error message display
  // ========================================================================
  if (error) {
    return (
      <div
        className="container mx-auto p-6"
        data-testid="day-summary-detail-error"
      >
        <Button
          variant="ghost"
          onClick={handleBack}
          className="mb-4"
          data-testid="back-button"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Shifts
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error instanceof Error
              ? error.message
              : "Failed to load day summary. Please try again."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // ========================================================================
  // RENDER: No Data State
  // ========================================================================
  if (!data) {
    return (
      <div
        className="container mx-auto p-6"
        data-testid="day-summary-detail-not-found"
      >
        <Button
          variant="ghost"
          onClick={handleBack}
          className="mb-4"
          data-testid="back-button"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Shifts
        </Button>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No day summary found for {formatBusinessDateFull(date)}.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // ========================================================================
  // DATA TRANSFORMATION
  // API-008: OUTPUT_FILTERING - Transform API data to component format
  // ========================================================================
  const { shifts, lottery, day_totals } = data;

  // Transform data for shared components
  const moneyReceivedState = transformToMoneyReceivedState(day_totals, lottery);
  const salesBreakdownState = transformToSalesBreakdownState(
    day_totals,
    lottery,
  );
  const lotteryCloseResult = transformToLotteryCloseResult(lottery, date);

  // Variance calculations with null safety
  const varianceAmount = safeNumber(day_totals.total_cash_variance);
  const hasVariance = varianceAmount !== 0;
  const isVarianceNegative = varianceAmount < 0;

  // ========================================================================
  // RENDER: Main Content
  // ========================================================================
  return (
    <div
      className="container mx-auto p-6 space-y-6"
      data-testid="day-summary-detail-page"
    >
      {/* ================================================================
       * HEADER SECTION
       * ================================================================ */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={handleBack}
              data-testid="back-button"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <FileText className="h-8 w-8" aria-hidden="true" />
                Day Summary
              </h1>
              <div className="flex items-center gap-2 text-muted-foreground mt-1">
                <Calendar className="h-4 w-4" />
                <span>{formatBusinessDateFull(date)}</span>
              </div>
            </div>
          </div>
          <Badge
            variant={data.status === "CLOSED" ? "default" : "secondary"}
            className="text-sm px-3 py-1"
          >
            {data.status}
          </Badge>
        </div>

        {/* Day Info Bar - matches ClosedShiftSummary layout */}
        <Card className="bg-muted/30">
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Shifts:</span>
                <span className="font-medium">{day_totals.shift_count}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Transactions:</span>
                <span className="font-medium">
                  {day_totals.transaction_count}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-600" />
                <span className="font-medium text-green-600">
                  Net Sales: {formatCurrency(day_totals.net_sales)}
                </span>
              </div>
              {lottery.is_closed && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Lottery Sales:</span>
                  <span className="font-medium">
                    {formatCurrency(lottery.total_sales)}
                  </span>
                </div>
              )}
              {data.closed_at && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Closed:</span>
                  <span className="font-medium">
                    {formatDateTime(data.closed_at, storeTimezone)}
                    {data.closed_by_name && ` by ${data.closed_by_name}`}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ================================================================
       * TWO-COLUMN LAYOUT: Money Received + Sales Breakdown
       * Matches ClosedShiftSummary layout exactly
       * ================================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Money Received (Read-Only) */}
        <MoneyReceivedCard state={moneyReceivedState} readOnly={true} />

        {/* Right Column - Sales Breakdown (Read-Only) */}
        <SalesBreakdownCard state={salesBreakdownState} readOnly={true} />
      </div>

      {/* ================================================================
       * LOTTERY SALES DETAILS
       * Shows bins closed with starting/ending serials
       * ================================================================ */}
      {lotteryCloseResult && <LotterySalesDetails data={lotteryCloseResult} />}

      {/* ================================================================
       * SHIFTS TABLE
       * ================================================================ */}
      <Card data-testid="shifts-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Shifts ({shifts.length})
          </CardTitle>
          <CardDescription>All shifts for this business day</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Terminal</TableHead>
                  <TableHead>Cashier</TableHead>
                  <TableHead>Opened</TableHead>
                  <TableHead>Closed</TableHead>
                  <TableHead className="text-right">Net Sales</TableHead>
                  <TableHead className="text-right">Transactions</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shifts.map((shift) => (
                  <TableRow key={shift.shift_id}>
                    <TableCell className="font-medium">
                      {shift.terminal_name || "Terminal"}
                    </TableCell>
                    <TableCell>{shift.cashier_name}</TableCell>
                    <TableCell>
                      {shift.opened_at
                        ? formatTime(shift.opened_at, storeTimezone)
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {shift.closed_at
                        ? formatTime(shift.closed_at, storeTimezone)
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(shift.net_sales)}
                    </TableCell>
                    <TableCell className="text-right">
                      {shift.transaction_count}
                    </TableCell>
                    <TableCell
                      className={`text-right ${
                        safeNumber(shift.variance) < 0
                          ? "text-destructive"
                          : safeNumber(shift.variance) > 0
                            ? "text-amber-600"
                            : "text-green-600"
                      }`}
                    >
                      {shift.variance !== null
                        ? `${shift.variance >= 0 ? "+" : ""}${formatCurrency(shift.variance)}`
                        : "$0.00"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ================================================================
       * CASH RECONCILIATION CARD
       * ================================================================ */}
      <Card data-testid="cash-reconciliation-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Cash Reconciliation
          </CardTitle>
          <CardDescription>
            Combined cash drawer balances for all shifts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Total Opening Cash
              </p>
              <p className="text-xl font-bold">
                {formatCurrency(day_totals.total_opening_cash)}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Total Closing Cash
              </p>
              <p className="text-xl font-bold">
                {formatCurrency(day_totals.total_closing_cash)}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Expected Cash
              </p>
              <p className="text-xl font-bold">
                {formatCurrency(day_totals.total_expected_cash)}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Total Variance
              </p>
              <p
                className={`text-xl font-bold ${
                  isVarianceNegative
                    ? "text-destructive"
                    : hasVariance
                      ? "text-amber-600"
                      : "text-green-600"
                }`}
              >
                {varianceAmount >= 0 ? "+" : ""}
                {formatCurrency(varianceAmount)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ================================================================
       * VARIANCE DETAILS CARD (if applicable)
       * ================================================================ */}
      {hasVariance && (
        <Card
          data-testid="variance-details-card"
          className={
            isVarianceNegative ? "border-destructive/50" : "border-amber-500/50"
          }
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle
                className={`h-5 w-5 ${isVarianceNegative ? "text-destructive" : "text-amber-600"}`}
              />
              Day Variance Summary
            </CardTitle>
            <CardDescription>Combined variance from all shifts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-muted-foreground">
                The total cash variance for this day is{" "}
                <span
                  className={`font-bold ${isVarianceNegative ? "text-destructive" : "text-amber-600"}`}
                >
                  {formatCurrency(varianceAmount)}
                </span>
                . Review individual shift variances above for details.
              </p>
              {data.notes && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    Notes
                  </p>
                  <p className="p-3 bg-muted rounded-md">{data.notes}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ================================================================
       * NO VARIANCE SUCCESS MESSAGE
       * ================================================================ */}
      {!hasVariance && data.status === "CLOSED" && (
        <Alert className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-700 dark:text-green-400">
            This day was closed with no variance. All shift cash reconciliations
            balanced perfectly.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
