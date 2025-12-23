"use client";

/**
 * Closed Shift Summary Component for Client Owner Dashboard
 *
 * Displays completed shift information with full breakdown:
 * - Shift information header
 * - Payment methods breakdown (left column)
 * - Sales breakdown (right column)
 * - Variance details and approval information
 *
 * Layout mirrors the shift-end page but in read-only mode.
 *
 * This component is independent and can be customized for client owner
 * specific features (reports, analytics, audit trails) without affecting
 * the cashier terminal pages.
 *
 * @security
 * - FE-005: UI_SECURITY - Read-only display, no sensitive data exposed
 * - SEC-004: XSS - All data properly escaped through React rendering
 * - API-008: OUTPUT_FILTERING - Uses whitelisted API response fields only
 */

import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Clock,
  User,
  Store,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FileText,
} from "lucide-react";
import { ShiftStatusBadge } from "@/components/shifts/ShiftStatusBadge";
import { MoneyReceivedSummary } from "./MoneyReceivedSummary";
import { SalesBreakdownSummary } from "./SalesBreakdownSummary";
import type { ShiftDetailResponse } from "@/lib/api/shifts";
import type { ShiftSummaryResponse } from "@/lib/api/shift-summary";
import { formatCurrency } from "@/lib/utils";

interface ClosedShiftSummaryProps {
  shift: ShiftDetailResponse;
  summary: ShiftSummaryResponse | undefined;
  isLoadingSummary: boolean;
  summaryError: Error | null;
}

/**
 * ClosedShiftSummary component
 * Displays complete shift summary for closed shifts in client owner dashboard
 */
export function ClosedShiftSummary({
  shift,
  summary,
  isLoadingSummary,
  summaryError,
}: ClosedShiftSummaryProps) {
  // Format timestamps
  const openedAtFormatted = format(
    new Date(shift.opened_at),
    "MMM d, yyyy h:mm a",
  );
  const closedAtFormatted = shift.closed_at
    ? format(new Date(shift.closed_at), "MMM d, yyyy h:mm a")
    : "N/A";

  // Calculate duration if both times are available
  const durationText = shift.closed_at
    ? calculateDuration(new Date(shift.opened_at), new Date(shift.closed_at))
    : "N/A";

  // Format shift ID for display
  const shortShiftId = shift.shift_id.slice(0, 8);

  // Determine variance status
  const hasVariance =
    shift.variance_amount !== null && shift.variance_amount !== 0;
  const isVarianceNegative =
    shift.variance_amount !== null && shift.variance_amount < 0;

  return (
    <div className="space-y-6" data-testid="closed-shift-summary">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <FileText className="h-8 w-8" aria-hidden="true" />
              Shift Summary
            </h1>
            <p className="text-muted-foreground">
              {shift.store_name || "Store"} - Shift {shortShiftId}
            </p>
          </div>
          <ShiftStatusBadge status={shift.status} shiftId={shift.shift_id} />
        </div>
      </div>

      {/* Shift Information Card */}
      <Card data-testid="shift-info-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" aria-hidden="true" />
            Shift Information
          </CardTitle>
          <CardDescription>Completed shift details</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Cashier */}
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Cashier
              </p>
              <p className="text-lg font-semibold flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                {shift.cashier_name || "Unknown"}
              </p>
            </div>

            {/* Store */}
            <div>
              <p className="text-sm font-medium text-muted-foreground">Store</p>
              <p className="text-lg font-semibold flex items-center gap-2">
                <Store className="h-4 w-4 text-muted-foreground" />
                {shift.store_name || "Unknown"}
              </p>
            </div>

            {/* Opened At */}
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Opened At
              </p>
              <p className="text-lg">{openedAtFormatted}</p>
            </div>

            {/* Closed At */}
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Closed At
              </p>
              <p className="text-lg">{closedAtFormatted}</p>
            </div>

            {/* Duration */}
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Duration
              </p>
              <p className="text-lg">{durationText}</p>
            </div>

            {/* Opened By */}
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Opened By
              </p>
              <p className="text-lg">{shift.opener_name || "Unknown"}</p>
            </div>

            {/* Transaction Count */}
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Transactions
              </p>
              <p className="text-lg font-semibold">{shift.transaction_count}</p>
            </div>

            {/* Shift ID */}
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Shift ID
              </p>
              <Badge variant="outline" className="font-mono text-xs">
                {shortShiftId}...
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cash Reconciliation Card */}
      <Card data-testid="cash-reconciliation-card">
        <CardHeader>
          <CardTitle>Cash Reconciliation</CardTitle>
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

      {/* Variance Details Card (if applicable) */}
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
                    <p>
                      {format(
                        new Date(shift.approved_at),
                        "MMM d, yyyy h:mm a",
                      )}
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Payment Methods and Sales Breakdown - Two Column Layout */}
      {isLoadingSummary && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">
            Loading shift breakdown...
          </span>
        </div>
      )}

      {summaryError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Failed to load shift breakdown:{" "}
            {summaryError.message || "Unknown error"}
          </AlertDescription>
        </Alert>
      )}

      {summary && !isLoadingSummary && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Payment Methods */}
          <MoneyReceivedSummary paymentMethods={summary.payment_methods} />

          {/* Right Column - Sales Breakdown */}
          <SalesBreakdownSummary
            totalSales={summary.total_sales}
            transactionCount={summary.transaction_count}
          />
        </div>
      )}

      {/* No Variance Success Message */}
      {!hasVariance && shift.status === "CLOSED" && (
        <Alert className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-700 dark:text-green-400">
            This shift was closed with no variance. Cash reconciliation balanced
            perfectly.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

/**
 * Calculate duration between two dates
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
