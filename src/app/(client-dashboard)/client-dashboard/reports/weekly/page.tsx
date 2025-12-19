"use client";

/**
 * Weekly Reports Page
 *
 * Displays weekly aggregated sales summaries.
 *
 * Phase 6.4: Day Summary Dashboard
 */

import { useState } from "react";
import { useWeeklyReport } from "@/lib/api/day-summaries";
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
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Store,
  DollarSign,
  TrendingUp,
  Receipt,
  Users,
} from "lucide-react";

export default function WeeklyReportsPage() {
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek;
    return new Date(now.getFullYear(), now.getMonth(), diff);
  });

  const { data: storesData, isLoading: storesLoading } = useStores();
  const stores = storesData?.data || [];

  const weekStartStr = weekStart.toISOString().split("T")[0];

  const { data: reportData, isLoading: reportLoading } = useWeeklyReport(
    selectedStoreId,
    weekStartStr,
    { enabled: !!selectedStoreId },
  );
  const report = reportData?.data;

  const handlePrevWeek = () => {
    const newDate = new Date(weekStart);
    newDate.setDate(newDate.getDate() - 7);
    setWeekStart(newDate);
  };

  const handleNextWeek = () => {
    const newDate = new Date(weekStart);
    newDate.setDate(newDate.getDate() + 7);
    setWeekStart(newDate);
  };

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const formatDateRange = () => {
    const startStr = weekStart.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const endStr = weekEnd.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `${startStr} - ${endStr}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Weekly Reports</h1>
          <p className="text-muted-foreground">
            View weekly aggregated sales summaries
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
          {/* Week Navigation */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  {formatDateRange()}
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handlePrevWeek}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleNextWeek}
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
                      Cash variance for week
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Daily Breakdown Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Daily Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Net Sales</TableHead>
                        <TableHead className="text-right">
                          Transactions
                        </TableHead>
                        <TableHead className="text-right">Shifts</TableHead>
                        <TableHead className="text-right">Variance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.daily_breakdown.map((day) => (
                        <TableRow key={day.business_date}>
                          <TableCell className="font-medium">
                            {new Date(day.business_date).toLocaleDateString(
                              "en-US",
                              {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                              },
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
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No data available for this week
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
