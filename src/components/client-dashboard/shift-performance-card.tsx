"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

/**
 * View options for shift performance
 */
type PerformanceView = "current-shift" | "today" | "this-week";

interface ShiftPerformanceData {
  goalPercent: number;
  transactions: number;
  avgTicket: number;
  paceCompare: {
    percent: number;
    label: string;
  };
}

interface ShiftPerformanceCardProps {
  className?: string;
  initialData?: ShiftPerformanceData;
  onViewChange?: (view: PerformanceView) => void;
}

/**
 * Default performance data
 */
const DEFAULT_DATA: ShiftPerformanceData = {
  goalPercent: 71,
  transactions: 86,
  avgTicket: 24.95,
  paceCompare: {
    percent: 18,
    label: "ahead of pace vs. last week",
  },
};

/**
 * ShiftPerformanceCard - Donut chart showing goal progress
 *
 * @description Enterprise-grade shift performance component with:
 * - Donut/progress ring chart using Recharts
 * - View selector (Current Shift, Today, This Week)
 * - Transaction and average ticket stats
 *
 * @accessibility WCAG 2.1 AA compliant with proper ARIA attributes
 */
export function ShiftPerformanceCard({
  className,
  initialData = DEFAULT_DATA,
  onViewChange,
}: ShiftPerformanceCardProps) {
  const [view, setView] = React.useState<PerformanceView>("current-shift");
  const [data, setData] = React.useState<ShiftPerformanceData>(initialData);

  // Handle view change
  const handleViewChange = React.useCallback(
    (newView: PerformanceView) => {
      setView(newView);
      onViewChange?.(newView);

      // Mock data update based on view
      if (newView === "today") {
        setData({
          goalPercent: 85,
          transactions: 245,
          avgTicket: 26.5,
          paceCompare: { percent: 22, label: "ahead of pace vs. yesterday" },
        });
      } else if (newView === "this-week") {
        setData({
          goalPercent: 68,
          transactions: 1247,
          avgTicket: 23.8,
          paceCompare: { percent: 15, label: "ahead of pace vs. last week" },
        });
      } else {
        setData(initialData);
      }
    },
    [initialData, onViewChange],
  );

  // Chart data for donut
  const chartData = [
    { name: "Completed", value: data.goalPercent },
    { name: "Remaining", value: 100 - data.goalPercent },
  ];

  const COLORS = ["hsl(var(--primary))", "hsl(var(--border))"];

  return (
    <Card
      className={cn("shadow-sm", className)}
      data-testid="shift-performance-card"
      role="region"
      aria-labelledby="shift-performance-title"
    >
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle
          id="shift-performance-title"
          className="text-base font-semibold"
        >
          Shift Performance
        </CardTitle>
        <Select
          value={view}
          onValueChange={(v) => handleViewChange(v as PerformanceView)}
        >
          <SelectTrigger
            className="h-8 w-[130px] text-xs"
            aria-label="Select performance view"
            data-testid="shift-view-select"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current-shift" className="text-xs">
              Current Shift
            </SelectItem>
            <SelectItem value="today" className="text-xs">
              Today
            </SelectItem>
            <SelectItem value="this-week" className="text-xs">
              This Week
            </SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>

      <CardContent>
        {/* Donut Chart */}
        <div className="flex flex-col items-center py-5">
          <div className="relative" style={{ width: 180, height: 180 }}>
            <ResponsiveContainer
              width={180}
              height={180}
              minWidth={180}
              minHeight={180}
            >
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={85}
                  startAngle={90}
                  endAngle={-270}
                  paddingAngle={0}
                  dataKey="value"
                  stroke="none"
                >
                  {chartData.map((entry, index) => (
                    // eslint-disable-next-line security/detect-object-injection -- Safe: index is bounded by chartData length (2 items)
                    <Cell key={`cell-${index}`} fill={COLORS[index]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>

            {/* Center text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold text-primary">
                {data.goalPercent}%
              </span>
              <span className="text-xs text-muted-foreground">of Goal</span>
            </div>
          </div>

          {/* Legend text */}
          <p className="mt-4 text-sm text-muted-foreground text-center">
            <strong className="text-green-600">
              +{data.paceCompare.percent}%
            </strong>{" "}
            {data.paceCompare.label}.<br />
            Keep up the great work!
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-border">
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">
              {data.transactions}
            </div>
            <div className="text-xs text-muted-foreground">Transactions</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">
              ${data.avgTicket.toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground">Avg. Ticket</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * ShiftPerformanceCardSkeleton - Loading state
 */
export function ShiftPerformanceCardSkeleton() {
  return (
    <Card className="shadow-sm animate-pulse">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="h-5 w-32 bg-muted rounded" />
        <div className="h-8 w-28 bg-muted rounded" />
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center py-5">
          <div className="w-[180px] h-[180px] rounded-full bg-muted" />
          <div className="h-4 w-48 bg-muted rounded mt-4" />
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="text-center">
              <div className="h-7 w-12 bg-muted rounded mb-1 mx-auto" />
              <div className="h-3 w-20 bg-muted rounded mx-auto" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export type { ShiftPerformanceData, PerformanceView };
