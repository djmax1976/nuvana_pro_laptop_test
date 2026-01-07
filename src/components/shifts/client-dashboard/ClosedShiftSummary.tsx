"use client";

/**
 * Closed Shift Summary Component for Client Owner Dashboard
 *
 * Displays completed shift information:
 * - Shift header with terminal, cashier, timing info
 * - Money Received breakdown (dual columns, read-only)
 * - Sales Breakdown by department (dual columns, read-only)
 * - Cash reconciliation and variance details
 *
 * NOTE: Lottery details (bins, packs, etc.) are NOT shown here.
 * Lottery information is displayed on the Day Close page, not individual shift views.
 *
 * MCP Guidance Applied:
 * - FE-001: STATE_MANAGEMENT - Secure state management for auth data
 * - FE-005: UI_SECURITY - Read-only display, no sensitive data exposed
 * - SEC-004: XSS - All data properly escaped through React rendering
 * - API-008: OUTPUT_FILTERING - Uses whitelisted API response fields only
 * - SEC-014: INPUT_VALIDATION - Type-safe props with defensive null checks
 *
 * @security
 * - FE-005: UI_SECURITY - Read-only display, no sensitive data exposed
 * - SEC-004: XSS - All data properly escaped through React rendering
 * - API-008: OUTPUT_FILTERING - Uses whitelisted API response fields only
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime } from "@/utils/date-format.utils";
import { useStoreTimezone } from "@/contexts/StoreContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Clock,
  User,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FileText,
  DollarSign,
} from "lucide-react";
import { ShiftStatusBadge } from "@/components/shifts/ShiftStatusBadge";
import { MoneyReceivedCard } from "@/components/shift-closing/MoneyReceivedCard";
import { SalesBreakdownCard } from "@/components/shift-closing/SalesBreakdownCard";
import type {
  ShiftDetailResponse,
  ShiftLotterySummaryResponse,
} from "@/lib/api/shifts";
import type { ShiftSummaryResponse } from "@/lib/api/shift-summary";
import { formatCurrency } from "@/lib/utils";

// ============================================================================
// TYPE DEFINITIONS
// MCP: SEC-014 INPUT_VALIDATION - Strict type definitions for component props
// ============================================================================

interface ClosedShiftSummaryProps {
  shift: ShiftDetailResponse;
  summary: ShiftSummaryResponse | undefined;
  isLoadingSummary: boolean;
  summaryError: Error | null;
  /** Comprehensive lottery summary data for money received/sales breakdown */
  lotterySummary?: ShiftLotterySummaryResponse;
  isLoadingLotterySummary?: boolean;
  lotterySummaryError?: Error | null;
}

// ============================================================================
// UTILITY FUNCTIONS
// MCP: SEC-014 INPUT_VALIDATION - Type-safe utility functions
// ============================================================================

/**
 * Calculate duration between two dates
 *
 * @param start - Start date
 * @param end - End date
 * @returns Human-readable duration string
 */
function calculateDuration(start: Date, end: Date): string {
  const diffMs = end.getTime() - start.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (diffHours === 0) {
    return `${diffMinutes}m`;
  }
  return `${diffHours}h ${diffMinutes}m`;
}

// ============================================================================
// COMPONENT
// MCP: FE-001 STATE_MANAGEMENT - Component with secure state handling
// ============================================================================

/**
 * ClosedShiftSummary component
 * Displays shift summary for closed shifts in client owner dashboard
 *
 * Shows:
 * - Shift header info (terminal, cashier, timing)
 * - Sales Breakdown by department
 * - Money Received breakdown
 * - Cash Reconciliation
 *
 * NOTE: Lottery details are shown on the Day Close page, not here.
 */
export function ClosedShiftSummary({
  shift,
  summary,
  isLoadingSummary,
  summaryError,
  lotterySummary,
  isLoadingLotterySummary = false,
  lotterySummaryError,
}: ClosedShiftSummaryProps) {
  // ========================================================================
  // HOOKS
  // MCP: FE-001 STATE_MANAGEMENT - Access store timezone for date formatting
  // ========================================================================
  const storeTimezone = useStoreTimezone();

  // ========================================================================
  // COMPUTED VALUES
  // MCP: FE-001 STATE_MANAGEMENT - Derived state from props
  // ========================================================================

  // Format timestamps using centralized timezone-aware utilities
  const openedAtFormatted = formatDateTime(shift.opened_at, storeTimezone);
  const closedAtFormatted = shift.closed_at
    ? formatDateTime(shift.closed_at, storeTimezone)
    : "N/A";

  // Calculate duration if both times are available
  const durationText = shift.closed_at
    ? calculateDuration(new Date(shift.opened_at), new Date(shift.closed_at))
    : "N/A";

  // Determine variance status
  const hasVariance =
    shift.variance_amount !== null && shift.variance_amount !== 0;
  const isVarianceNegative =
    shift.variance_amount !== null && shift.variance_amount < 0;

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <div className="space-y-6" data-testid="closed-shift-summary">
      {/* ================================================================
       * HEADER SECTION
       * ================================================================ */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <FileText className="h-8 w-8" aria-hidden="true" />
              Shift Summary
            </h1>
            <p className="text-muted-foreground">
              {shift.store_name || "Store"}
            </p>
          </div>
          <ShiftStatusBadge status={shift.status} shiftId={shift.shift_id} />
        </div>

        {/* Shift Info Bar */}
        <Card className="bg-muted/30">
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Terminal:</span>
                <span className="font-medium">
                  {lotterySummary?.shift_info?.terminal_name || "N/A"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Shift #:</span>
                <span className="font-medium">
                  {shift.shift_number || "N/A"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  {shift.cashier_name || "Unknown"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{openedAtFormatted}</span>
              </div>
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-600" />
                <span className="font-medium text-green-600">
                  Opening: {formatCurrency(shift.opening_cash)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Duration:</span>
                <span className="font-medium">{durationText}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ================================================================
       * LOADING STATE
       * ================================================================ */}
      {isLoadingLotterySummary && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">
            Loading shift details...
          </span>
        </div>
      )}

      {/* ================================================================
       * ERROR STATE
       * ================================================================ */}
      {lotterySummaryError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Failed to load shift details:{" "}
            {lotterySummaryError.message || "Unknown error"}
          </AlertDescription>
        </Alert>
      )}

      {/* ================================================================
       * SALES BREAKDOWN & MONEY RECEIVED - Two Column Layout
       * Shows department sales and payment methods (read-only)
       * ================================================================ */}
      {lotterySummary?.money_received?.pos &&
        lotterySummary?.money_received?.reports &&
        lotterySummary?.sales_breakdown?.pos &&
        lotterySummary?.sales_breakdown?.reports && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Money Received (Read-Only) */}
            <MoneyReceivedCard
              state={lotterySummary.money_received}
              readOnly={true}
            />

            {/* Right Column - Sales Breakdown (Read-Only) */}
            <SalesBreakdownCard
              state={lotterySummary.sales_breakdown}
              readOnly={true}
            />
          </div>
        )}

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
            Opening, closing, and variance details
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Opening Cash
              </p>
              <p className="text-xl font-bold">
                {formatCurrency(shift.opening_cash)}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Closing Cash
              </p>
              <p className="text-xl font-bold">
                {shift.closing_cash !== null
                  ? formatCurrency(shift.closing_cash)
                  : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Expected Cash
              </p>
              <p className="text-xl font-bold">
                {shift.expected_cash !== null
                  ? formatCurrency(shift.expected_cash)
                  : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Variance
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
                {shift.variance_amount !== null
                  ? `${shift.variance_amount >= 0 ? "+" : ""}${formatCurrency(shift.variance_amount)}`
                  : "$0.00"}
                {shift.variance_percentage !== null && (
                  <span className="text-sm ml-1">
                    ({shift.variance_percentage >= 0 ? "+" : ""}
                    {shift.variance_percentage.toFixed(2)}%)
                  </span>
                )}
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
              Variance Details
            </CardTitle>
            <CardDescription>
              Variance explanation and approval information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {shift.variance_reason && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  Reason
                </p>
                <p className="p-3 bg-muted rounded-md">
                  {shift.variance_reason}
                </p>
              </div>
            )}
            {(shift.approved_by_name || shift.approved_at) && (
              <div className="grid grid-cols-2 gap-4">
                {shift.approved_by_name && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Approved By
                    </p>
                    <p className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      {shift.approved_by_name}
                    </p>
                  </div>
                )}
                {shift.approved_at && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Approved At
                    </p>
                    <p>{formatDateTime(shift.approved_at, storeTimezone)}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ================================================================
       * NO VARIANCE SUCCESS MESSAGE
       * ================================================================ */}
      {!hasVariance && shift.status === "CLOSED" && (
        <Alert className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-700 dark:text-green-400">
            This shift was closed with no variance. Cash reconciliation balanced
            perfectly.
          </AlertDescription>
        </Alert>
      )}

      {/* ================================================================
       * LEGACY SUMMARY FALLBACK
       * Only shown if no lottery summary available for this shift
       * ================================================================ */}
      {!lotterySummary && !isLoadingLotterySummary && summary && (
        <Card>
          <CardHeader>
            <CardTitle>Sales Summary</CardTitle>
            <CardDescription>
              Basic summary (detailed lottery data not available for this shift)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Total Sales
                </p>
                <p className="text-xl font-bold">
                  {formatCurrency(summary.total_sales)}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Transactions
                </p>
                <p className="text-xl font-bold">{summary.transaction_count}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
