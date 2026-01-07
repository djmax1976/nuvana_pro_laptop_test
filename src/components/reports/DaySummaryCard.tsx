"use client";

/**
 * DaySummaryCard Component
 *
 * Displays a compact summary card for a single day's business data.
 *
 * Phase 6.4: Day Summary Dashboard
 */

import { DaySummary } from "@/lib/api/day-summaries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBusinessDate } from "@/utils/date-format.utils";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Clock,
  AlertTriangle,
} from "lucide-react";

interface DaySummaryCardProps {
  summary: DaySummary;
  onClick?: () => void;
}

export function DaySummaryCard({ summary, onClick }: DaySummaryCardProps) {
  const hasVariance = Math.abs(summary.total_cash_variance) > 0.01;
  const isNegativeVariance = summary.total_cash_variance < -0.01;

  // Format date for display - use centralized utility with T12:00:00 anchor
  // to avoid timezone issues with business dates
  const displayDate = formatBusinessDate(summary.business_date, "EEE, MMM d");

  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md ${
        onClick ? "hover:border-primary" : ""
      }`}
      onClick={onClick}
      data-testid={`day-summary-card-${summary.business_date}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{displayDate}</CardTitle>
          <Badge
            variant={summary.status === "CLOSED" ? "secondary" : "default"}
            className={
              summary.status === "CLOSED"
                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300"
            }
          >
            {summary.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Net Sales */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <DollarSign className="h-4 w-4" />
            <span className="text-sm">Net Sales</span>
          </div>
          <span className="font-semibold">
            {formatCurrency(summary.net_sales)}
          </span>
        </div>

        {/* Transaction Count */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ShoppingCart className="h-4 w-4" />
            <span className="text-sm">Transactions</span>
          </div>
          <span className="font-medium">{summary.transaction_count}</span>
        </div>

        {/* Shift Count */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span className="text-sm">Shifts</span>
          </div>
          <span className="font-medium">{summary.shift_count}</span>
        </div>

        {/* Cash Variance (if any) */}
        {hasVariance && (
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-2 text-muted-foreground">
              {isNegativeVariance ? (
                <TrendingDown className="h-4 w-4 text-red-500" />
              ) : (
                <TrendingUp className="h-4 w-4 text-amber-500" />
              )}
              <span className="text-sm">Variance</span>
            </div>
            <span
              className={`font-medium ${
                isNegativeVariance ? "text-red-600" : "text-amber-600"
              }`}
            >
              {formatCurrency(summary.total_cash_variance)}
            </span>
          </div>
        )}

        {/* Warning if open */}
        {summary.status === "OPEN" && (
          <div className="flex items-center gap-2 pt-2 border-t text-amber-600">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs">Day not yet closed</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
