"use client";

/**
 * Monthly Reports Page
 *
 * Displays monthly aggregated sales summaries.
 *
 * Phase 6.4: Day Summary Dashboard
 */

import { useState } from "react";
import {
  useMonthlyReport,
  WeekBreakdownItem,
  DayBreakdownItem,
} from "@/lib/api/day-summaries";
import { useStores } from "@/lib/api/stores";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { formatBusinessDate } from "@/utils/date-format.utils";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Store,
  DollarSign,
  TrendingUp,
  Receipt,
  Users,
  BarChart3,
} from "lucide-react";

export default function MonthlyReportsPage() {
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const { data: storesData, isLoading: storesLoading } = useStores();
  const stores = storesData?.data || [];

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth() + 1;

  const { data: report, isLoading: reportLoading } = useMonthlyReport(
    selectedStoreId,
    year,
    month,
    { enabled: !!selectedStoreId },
  );

  const handlePrevMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1),
    );
  };

  const handleNextMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1),
    );
  };

  const monthName = currentMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  // Group weekly data for the table
  const getWeekNumber = (dateStr: string) => {
    const date = new Date(dateStr);
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const dayOfMonth = date.getDate();
    return Math.ceil((dayOfMonth + firstDay.getDay()) / 7);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Monthly Reports</h1>
          <p className="text-muted-foreground">
            View monthly aggregated sales summaries
          </p>
        </div>
      </div>

      {/* Store Selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Store className="h-5 w-5" />
            Select Store
          </CardTitle>
        </CardHeader>
        <CardContent>
          {storesLoading ? (
            <Skeleton className="h-10 w-64" />
          ) : (
            <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select a store" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((store) => (
                  <SelectItem key={store.store_id} value={store.store_id}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {selectedStoreId && (
        <>
          {/* Month Navigation */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  {monthName}
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handlePrevMonth}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleNextMonth}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          {reportLoading ? (
            <div className="grid gap-4 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          ) : report ? (
            <>
              {/* Summary Cards */}
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Net Sales
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(report.totals.net_sales)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Gross: {formatCurrency(report.totals.gross_sales)}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Receipt className="h-4 w-4" />
                      Transactions
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {report.totals.transaction_count.toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Avg: {formatCurrency(report.totals.avg_transaction_value)}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Shifts
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {report.totals.shift_count}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Across {report.daily_breakdown.length} days
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Total Variance
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div
                      className={`text-2xl font-bold ${
                        report.totals.total_variance < -0.01
                          ? "text-red-600"
                          : report.totals.total_variance > 0.01
                            ? "text-amber-600"
                            : "text-green-600"
                      }`}
                    >
                      {formatCurrency(report.totals.total_variance)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Cash variance for month
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Weekly Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Weekly Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Week</TableHead>
                        <TableHead className="text-right">Net Sales</TableHead>
                        <TableHead className="text-right">
                          Transactions
                        </TableHead>
                        <TableHead className="text-right">Shifts</TableHead>
                        <TableHead className="text-right">Variance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(report.weekly_breakdown ?? []).map(
                        (week: WeekBreakdownItem, index: number) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">
                              Week {index + 1}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(week.net_sales)}
                            </TableCell>
                            <TableCell className="text-right">
                              {week.transaction_count}
                            </TableCell>
                            <TableCell className="text-right">
                              {week.shift_count}
                            </TableCell>
                            <TableCell
                              className={`text-right ${
                                week.variance_amount < -0.01
                                  ? "text-red-600"
                                  : week.variance_amount > 0.01
                                    ? "text-amber-600"
                                    : "text-green-600"
                              }`}
                            >
                              {formatCurrency(week.variance_amount)}
                            </TableCell>
                          </TableRow>
                        ),
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Daily Breakdown Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Daily Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-96 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">
                            Net Sales
                          </TableHead>
                          <TableHead className="text-right">
                            Transactions
                          </TableHead>
                          <TableHead className="text-right">Shifts</TableHead>
                          <TableHead className="text-right">Variance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {report.daily_breakdown.map((day: DayBreakdownItem) => (
                          <TableRow key={day.business_date}>
                            <TableCell className="font-medium">
                              {formatBusinessDate(
                                day.business_date,
                                "EEE, MMM d",
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(day.net_sales)}
                            </TableCell>
                            <TableCell className="text-right">
                              {day.transaction_count}
                            </TableCell>
                            <TableCell className="text-right">
                              {day.shift_count}
                            </TableCell>
                            <TableCell
                              className={`text-right ${
                                day.variance_amount < -0.01
                                  ? "text-red-600"
                                  : day.variance_amount > 0.01
                                    ? "text-amber-600"
                                    : "text-green-600"
                              }`}
                            >
                              {formatCurrency(day.variance_amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No data available for this month
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
