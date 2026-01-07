"use client";

/**
 * DaySummaryDetail Component
 *
 * Displays detailed view of a day's summary with breakdowns.
 *
 * Phase 6.4: Day Summary Dashboard
 */

import { DaySummary } from "@/lib/api/day-summaries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBusinessDateFull } from "@/utils/date-format.utils";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import {
  DollarSign,
  CreditCard,
  FolderTree,
  Receipt,
  Clock,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

interface DaySummaryDetailProps {
  summary: DaySummary;
}

export function DaySummaryDetail({ summary }: DaySummaryDetailProps) {
  // Format date for display - use centralized utility with T12:00:00 anchor
  // to avoid timezone issues with business dates
  const displayDate = formatBusinessDateFull(summary.business_date);

  const avgTransaction =
    summary.transaction_count > 0
      ? summary.net_sales / summary.transaction_count
      : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{displayDate}</h2>
          <p className="text-muted-foreground">Daily Business Summary</p>
        </div>
        <Badge
          variant={summary.status === "CLOSED" ? "secondary" : "default"}
          className={`text-sm ${
            summary.status === "CLOSED"
              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
              : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300"
          }`}
        >
          {summary.status}
        </Badge>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Net Sales</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary.net_sales)}
            </div>
            <p className="text-xs text-muted-foreground">
              Gross: {formatCurrency(summary.gross_sales)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Transactions</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.transaction_count}
            </div>
            <p className="text-xs text-muted-foreground">
              Avg: {formatCurrency(avgTransaction)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Items Sold</CardTitle>
            <FolderTree className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.items_sold_count}</div>
            <p className="text-xs text-muted-foreground">
              {summary.shift_count} shift{summary.shift_count !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Cash Variance</CardTitle>
            {summary.total_cash_variance < 0 ? (
              <TrendingDown className="h-4 w-4 text-red-500" />
            ) : (
              <TrendingUp className="h-4 w-4 text-green-500" />
            )}
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                summary.total_cash_variance < -0.01
                  ? "text-red-600"
                  : summary.total_cash_variance > 0.01
                    ? "text-amber-600"
                    : "text-green-600"
              }`}
            >
              {formatCurrency(summary.total_cash_variance)}
            </div>
            <p className="text-xs text-muted-foreground">
              Expected: {formatCurrency(summary.expected_cash)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Breakdown */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Financial Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Financial Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Gross Sales</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(summary.gross_sales)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium text-red-600">
                    Returns
                  </TableCell>
                  <TableCell className="text-right text-red-600">
                    ({formatCurrency(summary.returns_total)})
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium text-amber-600">
                    Discounts
                  </TableCell>
                  <TableCell className="text-right text-amber-600">
                    ({formatCurrency(summary.discounts_total)})
                  </TableCell>
                </TableRow>
                <TableRow className="border-t-2">
                  <TableCell className="font-bold">Net Sales</TableCell>
                  <TableCell className="text-right font-bold">
                    {formatCurrency(summary.net_sales)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Tax Collected</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(summary.tax_collected)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Cash Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Cash Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Total Cash</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(summary.total_cash)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Total Credit</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(summary.total_credit)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Total Debit</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(summary.total_debit)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Other Tender</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(summary.total_other_tender)}
                  </TableCell>
                </TableRow>
                <TableRow className="border-t-2">
                  <TableCell className="font-medium">Expected Cash</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(summary.expected_cash)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Actual Cash</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(summary.actual_cash)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-bold">Variance</TableCell>
                  <TableCell
                    className={`text-right font-bold ${
                      summary.total_cash_variance < -0.01
                        ? "text-red-600"
                        : summary.total_cash_variance > 0.01
                          ? "text-amber-600"
                          : "text-green-600"
                    }`}
                  >
                    {formatCurrency(summary.total_cash_variance)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Tender Breakdown */}
      {summary.tender_summaries && summary.tender_summaries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Tender Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tender Type</TableHead>
                  <TableHead className="text-right">Transactions</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.tender_summaries.map((tender) => (
                  <TableRow key={tender.tender_code}>
                    <TableCell className="font-medium">
                      {tender.tender_name}
                    </TableCell>
                    <TableCell className="text-right">
                      {tender.transaction_count}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(tender.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Department Breakdown */}
      {summary.department_summaries &&
        summary.department_summaries.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderTree className="h-5 w-5" />
                Department Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Gross Sales</TableHead>
                    <TableHead className="text-right">Discounts</TableHead>
                    <TableHead className="text-right">Net Sales</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.department_summaries.map((dept) => (
                    <TableRow key={dept.department_code}>
                      <TableCell className="font-medium">
                        {dept.department_name}
                      </TableCell>
                      <TableCell className="text-right">
                        {dept.item_count}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(dept.gross_sales)}
                      </TableCell>
                      <TableCell className="text-right text-amber-600">
                        ({formatCurrency(dept.discounts)})
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(dept.net_sales)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

      {/* Hourly Breakdown */}
      {summary.hourly_summaries && summary.hourly_summaries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Hourly Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hour</TableHead>
                  <TableHead className="text-right">Transactions</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Net Sales</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.hourly_summaries
                  .filter((h) => h.transaction_count > 0)
                  .map((hourly) => (
                    <TableRow key={hourly.hour}>
                      <TableCell className="font-medium">
                        {hourly.hour.toString().padStart(2, "0")}:00
                      </TableCell>
                      <TableCell className="text-right">
                        {hourly.transaction_count}
                      </TableCell>
                      <TableCell className="text-right">
                        {hourly.item_count}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(hourly.net_sales)}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {summary.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-muted-foreground">
              {summary.notes}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
