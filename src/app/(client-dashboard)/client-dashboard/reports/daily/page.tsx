"use client";

/**
 * Daily Reports Page
 *
 * Displays day summaries with calendar navigation.
 *
 * Phase 6.4: Day Summary Dashboard
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDaySummaries } from "@/lib/api/day-summaries";
import { useStores } from "@/lib/api/stores";
import { DaySummaryCard } from "@/components/reports/DaySummaryCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, ChevronLeft, ChevronRight, Store } from "lucide-react";

export default function DailyReportsPage() {
  const router = useRouter();
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const { data: storesData, isLoading: storesLoading } = useStores();
  const stores = storesData?.data || [];

  // Calculate date range for current month view
  const startDate = currentMonth.toISOString().split("T")[0];
  const endDate = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + 1,
    0,
  )
    .toISOString()
    .split("T")[0];

  const { data: summariesData, isLoading: summariesLoading } = useDaySummaries(
    selectedStoreId,
    { start_date: startDate, end_date: endDate },
    { enabled: !!selectedStoreId },
  );
  const summaries = summariesData || [];

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

  const handleSummaryClick = (businessDate: string) => {
    router.push(
      `/client-dashboard/reports/daily/${businessDate}?storeId=${selectedStoreId}`,
    );
  };

  // Build calendar grid
  const daysInMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + 1,
    0,
  ).getDate();
  const firstDayOfWeek = currentMonth.getDay();

  const calendarDays: (string | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    calendarDays.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth(),
      day,
    );
    calendarDays.push(date.toISOString().split("T")[0]);
  }

  // Create a map of date -> summary for quick lookup
  const summaryMap = new Map(
    summaries.map((s) => [s.business_date.split("T")[0], s]),
  );

  const monthName = currentMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Daily Reports</h1>
          <p className="text-muted-foreground">
            View day-by-day sales summaries
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
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                {monthName}
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="icon" onClick={handlePrevMonth}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={handleNextMonth}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {summariesLoading ? (
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: 35 }).map((_, i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
            ) : (
              <>
                {/* Day headers */}
                <div className="grid grid-cols-7 gap-2 mb-2">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                    (day) => (
                      <div
                        key={day}
                        className="text-center text-sm font-medium text-muted-foreground py-2"
                      >
                        {day}
                      </div>
                    ),
                  )}
                </div>

                {/* Calendar grid */}
                <div className="grid grid-cols-7 gap-2">
                  {calendarDays.map((date, index) => {
                    if (!date) {
                      return <div key={`empty-${index}`} className="h-24" />;
                    }

                    const summary = summaryMap.get(date);
                    const dayNumber = new Date(date).getDate();

                    if (summary) {
                      return (
                        <DaySummaryCard
                          key={date}
                          summary={summary}
                          onClick={() => handleSummaryClick(date)}
                        />
                      );
                    }

                    return (
                      <div
                        key={date}
                        className="h-24 border rounded-lg p-2 bg-muted/30"
                      >
                        <span className="text-sm font-medium text-muted-foreground">
                          {dayNumber}
                        </span>
                        <p className="text-xs text-muted-foreground mt-1">
                          No data
                        </p>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
