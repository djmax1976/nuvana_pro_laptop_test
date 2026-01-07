"use client";

/**
 * Closed Day Summary Component for Client Owner Dashboard
 *
 * Displays completed day close information:
 * - Day header with store, date, timing info
 * - Money Received breakdown (dual columns, read-only)
 * - Sales Breakdown by department (dual columns, read-only)
 * - Cash reconciliation and variance details
 * - Lottery Sales Details (bins closed with serials)
 *
 * This component mirrors the ClosedShiftSummary layout but for day-level data.
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
import {
  formatBusinessDateFull,
  formatDateTime,
  formatTime,
} from "@/utils/date-format.utils";
import { useStoreTimezone } from "@/contexts/StoreContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  DollarSign,
  Calendar,
  Store,
  Users,
} from "lucide-react";
import type { DayCloseReconciliationResponse } from "@/lib/api/day-summaries";
import { formatCurrency } from "@/lib/utils";

// ============================================================================
// TYPE DEFINITIONS
// MCP: SEC-014 INPUT_VALIDATION - Strict type definitions for component props
// ============================================================================

interface ClosedDaySummaryProps {
  data: DayCloseReconciliationResponse;
  storeName?: string;
}

// ============================================================================
// UTILITY FUNCTIONS
// MCP: SEC-014 INPUT_VALIDATION - Type-safe utility functions
// NOTE: Date formatting now uses centralized utilities from date-format.utils.ts
// ============================================================================

// ============================================================================
// COMPONENT
// MCP: FE-001 STATE_MANAGEMENT - Component with secure state handling
// ============================================================================

/**
 * ClosedDaySummary component
 * Displays day summary for closed days in client owner dashboard
 *
 * Shows:
 * - Day header info (store, date, timing)
 * - Shifts table
 * - Lottery Sales Details
 * - Cash Reconciliation
 */
export function ClosedDaySummary({ data, storeName }: ClosedDaySummaryProps) {
  // ========================================================================
  // HOOKS
  // MCP: FE-001 STATE_MANAGEMENT - Access store timezone for date formatting
  // ========================================================================
  const storeTimezone = useStoreTimezone();

  // ========================================================================
  // COMPUTED VALUES
  // MCP: FE-001 STATE_MANAGEMENT - Derived state from props
  // ========================================================================

  const { shifts, lottery, day_totals } = data;

  // Determine variance status
  const varianceAmount = day_totals.total_cash_variance ?? 0;
  const hasVariance = varianceAmount !== 0;
  const isVarianceNegative = varianceAmount < 0;

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <div className="space-y-6" data-testid="closed-day-summary">
      {/* ================================================================
       * HEADER SECTION
       * ================================================================ */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <FileText className="h-8 w-8" aria-hidden="true" />
              Day Summary
            </h1>
            <p className="text-muted-foreground flex items-center gap-2 mt-1">
              <Store className="h-4 w-4" />
              {storeName || "Store"}
            </p>
          </div>
          <Badge
            variant={data.status === "CLOSED" ? "default" : "secondary"}
            className="text-sm px-3 py-1"
          >
            {data.status}
          </Badge>
        </div>

        {/* Day Info Bar */}
        <Card className="bg-muted/30">
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  {formatBusinessDateFull(data.business_date)}
                </span>
              </div>
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
                        (shift.variance ?? 0) < 0
                          ? "text-destructive"
                          : (shift.variance ?? 0) > 0
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
       * LOTTERY SALES DETAILS
       * ================================================================ */}
      {lottery.is_closed && lottery.bins_closed.length > 0 && (
        <Card data-testid="lottery-sales-details">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Lottery Sales Details
              </span>
              <Badge variant="outline" className="font-normal">
                {lottery.bins_closed.length} bins closed
              </Badge>
            </CardTitle>
            <CardDescription>
              Bin closings recorded on{" "}
              {formatBusinessDateFull(data.business_date)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto max-h-96">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="text-center">Bin</TableHead>
                    <TableHead>Game</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Start</TableHead>
                    <TableHead className="text-right">End</TableHead>
                    <TableHead className="text-right">Sold</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lottery.bins_closed.map((bin, index) => (
                    <TableRow
                      key={`${bin.pack_number}-${index}`}
                      data-testid={`lottery-row-${bin.bin_number}`}
                    >
                      <TableCell className="text-center font-mono font-semibold text-primary">
                        {bin.bin_number}
                      </TableCell>
                      <TableCell title={bin.pack_number}>
                        {bin.game_name || "Unknown"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(bin.game_price)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {bin.starting_serial || "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {bin.closing_serial || "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {bin.tickets_sold}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatCurrency(bin.sales_amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <tfoot className="sticky bottom-0 bg-card">
                  <TableRow
                    className="bg-muted/50 font-bold"
                    data-testid="lottery-totals-row"
                  >
                    <TableCell colSpan={5}>Total Lottery Sales</TableCell>
                    <TableCell className="text-right font-mono">
                      {lottery.total_tickets_sold}
                    </TableCell>
                    <TableCell className="text-right font-mono text-green-600 dark:text-green-400">
                      {formatCurrency(lottery.total_sales)}
                    </TableCell>
                  </TableRow>
                </tfoot>
              </Table>
            </div>
          </CardContent>
        </Card>
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

      {/* ================================================================
       * SALES SUMMARY CARD
       * ================================================================ */}
      <Card data-testid="sales-summary-card">
        <CardHeader>
          <CardTitle>Sales Summary</CardTitle>
          <CardDescription>Daily totals across all shifts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Gross Sales
              </p>
              <p className="text-xl font-bold">
                {formatCurrency(day_totals.gross_sales)}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Net Sales
              </p>
              <p className="text-xl font-bold text-green-600">
                {formatCurrency(day_totals.net_sales)}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Tax Collected
              </p>
              <p className="text-xl font-bold">
                {formatCurrency(day_totals.tax_collected)}
              </p>
            </div>
            {day_totals.lottery_sales !== null && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Lottery Sales
                </p>
                <p className="text-xl font-bold">
                  {formatCurrency(day_totals.lottery_sales)}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
