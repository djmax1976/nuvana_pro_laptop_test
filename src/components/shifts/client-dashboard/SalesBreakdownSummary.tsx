"use client";

/**
 * Sales Breakdown Summary Component for Client Owner Dashboard
 *
 * Read-only display of sales breakdown for closed shifts.
 * Shows total sales and transaction metrics.
 *
 * Note: Department-level sales breakdown (Gas, Grocery, Tobacco, etc.)
 * requires POS integration data. Currently shows aggregate totals.
 * This component is designed to be extended when POS integration is available.
 *
 * @security
 * - FE-005: UI_SECURITY - Read-only display, no sensitive data exposed
 * - SEC-004: XSS - All data properly escaped through React rendering
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Receipt, ShoppingCart, Info } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SalesBreakdownSummaryProps {
  totalSales: number;
  transactionCount: number;
}

/**
 * Simple horizontal separator
 */
function Separator({ className = "" }: { className?: string }) {
  return <hr className={`border-t border-border ${className}`} />;
}

/**
 * Metric display item
 */
interface MetricItemProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: React.ReactNode;
}

function MetricItem({ label, value, subtext, icon }: MetricItemProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
    </div>
  );
}

/**
 * SalesBreakdownSummary component
 * Displays sales breakdown for closed shifts
 */
export function SalesBreakdownSummary({
  totalSales,
  transactionCount,
}: SalesBreakdownSummaryProps) {
  // Calculate average transaction value
  const averageTransaction =
    transactionCount > 0 ? totalSales / transactionCount : 0;

  return (
    <Card data-testid="sales-breakdown-summary">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" aria-hidden="true" />
          Sales Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Total Sales */}
          <div
            className="p-4 bg-primary/10 rounded-lg"
            data-testid="total-sales-metric"
          >
            <MetricItem
              label="Total Sales"
              value={formatCurrency(totalSales)}
              icon={<TrendingUp className="h-4 w-4" />}
            />
          </div>

          {/* Transaction Count */}
          <div
            className="p-4 bg-muted/50 rounded-lg"
            data-testid="transaction-count-metric"
          >
            <MetricItem
              label="Transactions"
              value={transactionCount}
              subtext={transactionCount === 1 ? "transaction" : "transactions"}
              icon={<Receipt className="h-4 w-4" />}
            />
          </div>

          {/* Average Transaction */}
          <div
            className="p-4 bg-muted/50 rounded-lg"
            data-testid="avg-transaction-metric"
          >
            <MetricItem
              label="Avg. Transaction"
              value={formatCurrency(averageTransaction)}
              subtext="per transaction"
              icon={<ShoppingCart className="h-4 w-4" />}
            />
          </div>
        </div>

        <Separator />

        {/* Department Sales Placeholder */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-muted-foreground">
            Department Breakdown
          </h4>
          <Alert className="bg-muted/30 border-muted">
            <Info className="h-4 w-4" />
            <AlertDescription>
              Department-level sales breakdown (Gas, Grocery, Tobacco,
              Beverages, etc.) will be available when POS integration data is
              synced.
            </AlertDescription>
          </Alert>

          {/* Placeholder department rows - can be populated later */}
          <div className="space-y-2 opacity-50">
            <div className="grid grid-cols-[1fr_100px] gap-2 py-2 items-center">
              <div className="text-sm text-muted-foreground">Gas Sales</div>
              <div className="text-right font-mono text-sm text-muted-foreground">
                --
              </div>
            </div>
            <div className="grid grid-cols-[1fr_100px] gap-2 py-2 items-center">
              <div className="text-sm text-muted-foreground">Grocery</div>
              <div className="text-right font-mono text-sm text-muted-foreground">
                --
              </div>
            </div>
            <div className="grid grid-cols-[1fr_100px] gap-2 py-2 items-center">
              <div className="text-sm text-muted-foreground">Tobacco</div>
              <div className="text-right font-mono text-sm text-muted-foreground">
                --
              </div>
            </div>
            <div className="grid grid-cols-[1fr_100px] gap-2 py-2 items-center">
              <div className="text-sm text-muted-foreground">Beverages</div>
              <div className="text-right font-mono text-sm text-muted-foreground">
                --
              </div>
            </div>
            <div className="grid grid-cols-[1fr_100px] gap-2 py-2 items-center">
              <div className="text-sm text-muted-foreground">Lottery</div>
              <div className="text-right font-mono text-sm text-muted-foreground">
                --
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
