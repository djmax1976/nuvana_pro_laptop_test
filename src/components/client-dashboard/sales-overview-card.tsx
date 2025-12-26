"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Filter } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LabelList,
} from "recharts";
import type { LabelContentType } from "recharts/types/component/Label";

/**
 * Time period options for sales filter
 * @security Immutable object to prevent tampering
 */
const TIME_PERIODS = Object.freeze({
  hourly: { label: "Hourly", maxDays: 7 },
  daily: { label: "Daily", maxDays: 31 },
  weekly: { label: "Weekly", maxDays: 365 },
  monthly: { label: "Monthly", maxDays: 730 },
  yearly: { label: "Yearly", maxDays: 1825 },
} as const);

type TimePeriod = keyof typeof TIME_PERIODS;

/**
 * Metric types organized by category
 * @security Immutable object with whitelisted values only
 */
const METRIC_TYPES = Object.freeze({
  "total-sales": { label: "Total Sales", unit: "currency", color: "#0066FF" },
  "taxable-sales": {
    label: "Taxable Sales",
    unit: "currency",
    color: "#0066FF",
  },
  "non-taxable-sales": {
    label: "Non-Taxable Sales",
    unit: "currency",
    color: "#00C853",
  },
  "fuel-sales": { label: "Fuel Sales", unit: "currency", color: "#00C853" },
  "food-sales": { label: "Food Sales", unit: "currency", color: "#FF9800" },
  "lottery-sales": {
    label: "Lottery Sales",
    unit: "currency",
    color: "#FF9800",
  },
  "sales-by-hour": {
    label: "Sales by Hour",
    unit: "currency",
    color: "#0066FF",
  },
  "peak-hours": { label: "Peak Hours", unit: "count", color: "#0066FF" },
  "transactions-by-hour": {
    label: "Transactions by Hour",
    unit: "count",
    color: "#00C853",
  },
  "cashier-voids": { label: "Cashier Voids", unit: "count", color: "#F44336" },
  "cashier-cancels": {
    label: "Cashier Cancels",
    unit: "count",
    color: "#F44336",
  },
  "cashier-refunds": {
    label: "Cashier Refunds",
    unit: "count",
    color: "#F44336",
  },
  "avg-ticket-by-cashier": {
    label: "Avg Ticket by Cashier",
    unit: "currency",
    color: "#0066FF",
  },
  "cash-variance": {
    label: "Cash Variance",
    unit: "currency",
    color: "#F44336",
  },
  "lottery-variance": {
    label: "Lottery Variance",
    unit: "currency",
    color: "#F44336",
  },
} as const);

type MetricType = keyof typeof METRIC_TYPES;

interface SalesDataPoint {
  label: string;
  value: number;
}

interface SalesStats {
  highest: number;
  lowest: number;
  average: number;
  trendPercent: number;
}

interface FilterState {
  startDate: string;
  endDate: string;
  timePeriod: TimePeriod;
  metricType: MetricType;
}

interface SalesOverviewCardProps {
  className?: string;
  initialData?: SalesDataPoint[];
  initialTotal?: number;
  initialStats?: SalesStats;
  onFilterChange?: (filters: FilterState) => void;
}

/**
 * Validates date string format (YYYY-MM-DD)
 * @security Input validation to prevent injection
 */
function isValidDate(dateStr: string): boolean {
  if (typeof dateStr !== "string") return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  const date = new Date(dateStr);
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Generates mock chart data based on filters
 * In production, this would be replaced with API call
 */
function generateMockData(filters: FilterState): {
  chartData: SalesDataPoint[];
  total: number;
  stats: SalesStats;
} {
  const metric = METRIC_TYPES[filters.metricType];
  const isCurrency = metric.unit === "currency";

  // Generate labels based on time period
  const labels: string[] = [];
  const period = filters.timePeriod;

  if (period === "hourly") {
    for (let i = 6; i <= 22; i++) {
      labels.push(`${i}:00`);
    }
  } else if (period === "daily") {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    labels.push(...days);
  } else if (period === "weekly") {
    labels.push("Week 1", "Week 2", "Week 3", "Week 4");
  } else if (period === "monthly") {
    labels.push("Jan", "Feb", "Mar", "Apr", "May", "Jun");
  } else {
    labels.push("2020", "2021", "2022", "2023", "2024");
  }

  // Generate random values
  const baseValue = isCurrency ? 5000 : 50;
  const variance = isCurrency ? 3000 : 30;

  const chartData = labels.map((label) => ({
    label,
    value: Math.round(baseValue + Math.random() * variance),
  }));

  const values = chartData.map((d) => d.value);
  const total = values.reduce((sum, v) => sum + v, 0);
  const highest = Math.max(...values);
  const lowest = Math.min(...values);
  const average = Math.round(total / values.length);
  const trendPercent = Math.round((Math.random() * 30 - 10) * 10) / 10;

  return {
    chartData,
    total,
    stats: { highest, lowest, average, trendPercent },
  };
}

/**
 * Formats a number as currency
 */
function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Formats a number as compact currency (e.g., $5.2k)
 */
function formatCurrencyCompact(value: number): string {
  if (Math.abs(value) >= 1000) {
    return "$" + (value / 1000).toFixed(1) + "k";
  }
  return "$" + value.toLocaleString();
}

/**
 * Custom label renderer for chart data points
 * Shows value above each point with color coding for max/min
 * @security Type-safe label renderer with proper Recharts ContentType
 */
function CustomDataLabel(props: {
  x?: number;
  y?: number;
  value?: number;
  viewBox?: { x?: number; y?: number };
  offset?: number;
  highest: number;
  lowest: number;
  isCurrency: boolean;
}) {
  const { x, y, value, highest, lowest, isCurrency } = props;
  if (x === undefined || y === undefined || value === undefined) return null;

  // Determine color based on value
  let fill = "#6b7280"; // muted color
  if (value === highest) {
    fill = "#22c55e"; // green-600
  } else if (value === lowest) {
    fill = "#ef4444"; // red-500
  }

  const displayValue = isCurrency
    ? formatCurrencyCompact(value)
    : value.toLocaleString();

  return (
    <text
      x={x}
      y={(y as number) - 10}
      fill={fill}
      fontSize={10}
      fontWeight={600}
      textAnchor="middle"
      fontFamily="Inter, system-ui, sans-serif"
    >
      {displayValue}
    </text>
  );
}

/**
 * SalesOverviewCard - Main sales chart with filtering controls
 *
 * @description Enterprise-grade sales visualization component with:
 * - Date range selection
 * - Time period granularity (Hourly → Yearly)
 * - Metric type selection with categories
 * - Quick stats display
 *
 * @security OWASP compliant with input validation and whitelisting
 * @accessibility WCAG 2.1 AA compliant with proper ARIA attributes
 */
export function SalesOverviewCard({
  className,
  initialData,
  initialTotal = 52847.52,
  initialStats,
  onFilterChange,
}: SalesOverviewCardProps) {
  // Get today's date and 7 days ago for defaults
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const formatDate = (d: Date) => d.toISOString().split("T")[0];

  // Filter state
  const [startDate, setStartDate] = React.useState(formatDate(weekAgo));
  const [endDate, setEndDate] = React.useState(formatDate(today));
  const [timePeriod, setTimePeriod] = React.useState<TimePeriod>("weekly");
  const [metricType, setMetricType] = React.useState<MetricType>("total-sales");

  // Chart data state
  const [chartData, setChartData] = React.useState<SalesDataPoint[]>(
    initialData || [
      { label: "Mon", value: 7245 },
      { label: "Tue", value: 8123 },
      { label: "Wed", value: 6892 },
      { label: "Thu", value: 9245 },
      { label: "Fri", value: 8756 },
      { label: "Sat", value: 7535 },
      { label: "Sun", value: 5051 },
    ],
  );
  const [total, setTotal] = React.useState(initialTotal);
  const [stats, setStats] = React.useState<SalesStats>(
    initialStats || {
      highest: 9245,
      lowest: 5051,
      average: 7549,
      trendPercent: 12.4,
    },
  );

  // Screen reader announcement ref
  const announcerRef = React.useRef<HTMLDivElement>(null);

  /**
   * Announces changes to screen readers
   */
  const announceChange = React.useCallback((message: string) => {
    if (announcerRef.current) {
      announcerRef.current.textContent = message;
    }
  }, []);

  /**
   * Validates and applies filters
   * @security Input validation before processing
   */
  const handleApplyFilter = React.useCallback(() => {
    // Validate dates
    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      announceChange("Invalid date format. Please use valid dates.");
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      announceChange("Start date must be before end date.");
      return;
    }

    const daysDiff = Math.ceil(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
    );
    // eslint-disable-next-line security/detect-object-injection -- Safe: timePeriod is a typed enum key
    const maxDays = TIME_PERIODS[timePeriod].maxDays;

    if (daysDiff > maxDays) {
      announceChange(
        `Date range exceeds ${maxDays} days for ${timePeriod} view.`,
      );
      return;
    }

    // Generate new data
    const filters: FilterState = { startDate, endDate, timePeriod, metricType };
    const {
      chartData: newData,
      total: newTotal,
      stats: newStats,
    } = generateMockData(filters);

    setChartData(newData);
    setTotal(newTotal);
    setStats(newStats);

    // Announce update
    // eslint-disable-next-line security/detect-object-injection -- Safe: metricType is a typed enum key
    const metric = METRIC_TYPES[metricType];
    announceChange(
      // eslint-disable-next-line security/detect-object-injection -- Safe: timePeriod is a typed enum key
      `Chart updated to show ${metric.label} for ${TIME_PERIODS[timePeriod].label} view. Total: ${formatCurrency(newTotal)}`,
    );

    // Callback for parent component
    onFilterChange?.(filters);
  }, [
    startDate,
    endDate,
    timePeriod,
    metricType,
    onFilterChange,
    announceChange,
  ]);

  // eslint-disable-next-line security/detect-object-injection -- Safe: metricType is a typed enum key
  const metric = METRIC_TYPES[metricType];
  const isCurrency = metric.unit === "currency";
  // eslint-disable-next-line security/detect-object-injection -- Safe: timePeriod is a typed enum key
  const periodLabel = `${TIME_PERIODS[timePeriod].label} Total`;

  return (
    <Card
      className={cn("shadow-sm", className)}
      data-testid="sales-overview-card"
      data-analytics-id="sales-overview"
      role="region"
      aria-labelledby="sales-overview-title"
    >
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-4">
        <CardTitle
          id="sales-overview-title"
          className="text-base font-semibold"
        >
          Sales Overview
        </CardTitle>

        {/* Filter Controls */}
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Chart filter controls"
        >
          {/* Date Range */}
          <div className="flex items-center gap-1">
            <label htmlFor="sales-date-start" className="sr-only">
              Start Date
            </label>
            <Input
              type="date"
              id="sales-date-start"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-8 w-[130px] text-xs"
              aria-label="Start date for sales data"
              data-testid="sales-date-start"
            />
            <span className="text-xs text-muted-foreground" aria-hidden="true">
              to
            </span>
            <label htmlFor="sales-date-end" className="sr-only">
              End Date
            </label>
            <Input
              type="date"
              id="sales-date-end"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-8 w-[130px] text-xs"
              aria-label="End date for sales data"
              data-testid="sales-date-end"
            />
          </div>

          {/* Time Period */}
          <Select
            value={timePeriod}
            onValueChange={(v) => setTimePeriod(v as TimePeriod)}
          >
            <SelectTrigger
              className="h-8 w-[100px] text-xs"
              aria-label="Select time period granularity"
              data-testid="sales-time-period"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TIME_PERIODS).map(([key, { label }]) => (
                <SelectItem key={key} value={key} className="text-xs">
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Metric Type */}
          <Select
            value={metricType}
            onValueChange={(v) => setMetricType(v as MetricType)}
          >
            <SelectTrigger
              className="h-8 w-[150px] text-xs"
              aria-label="Select metric to display"
              data-testid="sales-metric-type"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel className="text-xs font-semibold">
                  Sales Metrics
                </SelectLabel>
                <SelectItem value="total-sales" className="text-xs">
                  Total Sales
                </SelectItem>
                <SelectItem value="taxable-sales" className="text-xs">
                  Taxable Sales
                </SelectItem>
                <SelectItem value="non-taxable-sales" className="text-xs">
                  Non-Taxable Sales
                </SelectItem>
                <SelectItem value="fuel-sales" className="text-xs">
                  Fuel Sales
                </SelectItem>
                <SelectItem value="food-sales" className="text-xs">
                  Food Sales
                </SelectItem>
                <SelectItem value="lottery-sales" className="text-xs">
                  Lottery Sales
                </SelectItem>
              </SelectGroup>
              <SelectGroup>
                <SelectLabel className="text-xs font-semibold">
                  Time Analysis
                </SelectLabel>
                <SelectItem value="sales-by-hour" className="text-xs">
                  Sales by Hour
                </SelectItem>
                <SelectItem value="peak-hours" className="text-xs">
                  Peak Hours
                </SelectItem>
                <SelectItem value="transactions-by-hour" className="text-xs">
                  Transactions by Hour
                </SelectItem>
              </SelectGroup>
              <SelectGroup>
                <SelectLabel className="text-xs font-semibold">
                  Cashier Metrics
                </SelectLabel>
                <SelectItem value="cashier-voids" className="text-xs">
                  Cashier Voids
                </SelectItem>
                <SelectItem value="cashier-cancels" className="text-xs">
                  Cashier Cancels
                </SelectItem>
                <SelectItem value="cashier-refunds" className="text-xs">
                  Cashier Refunds
                </SelectItem>
                <SelectItem value="avg-ticket-by-cashier" className="text-xs">
                  Avg Ticket by Cashier
                </SelectItem>
              </SelectGroup>
              <SelectGroup>
                <SelectLabel className="text-xs font-semibold">
                  Variance Tracking
                </SelectLabel>
                <SelectItem value="cash-variance" className="text-xs">
                  Cash Variance
                </SelectItem>
                <SelectItem value="lottery-variance" className="text-xs">
                  Lottery Variance
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>

          {/* Apply Button */}
          <Button
            type="button"
            size="sm"
            onClick={handleApplyFilter}
            className="h-8 text-xs gap-1"
            aria-label="Apply selected filters to chart"
            data-testid="sales-apply-filter"
          >
            <Filter className="h-3 w-3" aria-hidden="true" />
            Apply
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {/* Screen reader announcer */}
        <div
          ref={announcerRef}
          className="sr-only"
          role="status"
          aria-live="polite"
        />

        {/* Summary */}
        <div
          className="flex items-baseline gap-2 mb-6"
          id="sales-summary-display"
        >
          <span
            className="text-3xl font-bold text-foreground"
            id="sales-total-value"
          >
            {isCurrency ? formatCurrency(total) : total.toLocaleString()}
          </span>
          <span
            className="text-sm text-muted-foreground"
            id="sales-period-label"
          >
            {periodLabel}
          </span>
        </div>

        {/* Chart */}
        <div style={{ minHeight: 280 }}>
          <ResponsiveContainer width="100%" height={280} minHeight={280}>
            <LineChart
              data={chartData}
              margin={{ top: 30, right: 20, left: 10, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) =>
                  isCurrency ? `$${(v / 1000).toFixed(0)}k` : v.toString()
                }
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(val) => {
                  const numVal = typeof val === "number" ? val : 0;
                  return [
                    isCurrency
                      ? formatCurrency(numVal)
                      : numVal.toLocaleString(),
                    metric.label,
                  ];
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Line
                type="monotone"
                dataKey="value"
                name={metric.label}
                stroke={metric.color}
                strokeWidth={2}
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  const isExtreme =
                    payload.value === stats.highest ||
                    payload.value === stats.lowest;
                  const dotFill =
                    payload.value === stats.highest
                      ? "#22c55e"
                      : payload.value === stats.lowest
                        ? "#ef4444"
                        : metric.color;
                  return (
                    <circle
                      key={`dot-${props.key}`}
                      cx={cx}
                      cy={cy}
                      r={isExtreme ? 5 : 4}
                      fill={dotFill}
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  );
                }}
                activeDot={{ r: 6, strokeWidth: 0 }}
              >
                <LabelList
                  dataKey="value"
                  position="top"
                  offset={12}
                  content={
                    ((labelProps: {
                      x?: number;
                      y?: number;
                      value?: number;
                    }) => (
                      <CustomDataLabel
                        x={labelProps.x}
                        y={labelProps.y}
                        value={labelProps.value}
                        highest={stats.highest}
                        lowest={stats.lowest}
                        isCurrency={isCurrency}
                      />
                    )) as LabelContentType
                  }
                />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Quick Stats */}
        <div
          className="flex justify-between mt-4 pt-4 border-t border-border text-xs"
          aria-label="Quick statistics"
        >
          <div className="text-center">
            <div className="font-semibold text-green-600" id="stats-high-value">
              {isCurrency
                ? formatCurrency(stats.highest)
                : stats.highest.toLocaleString()}
            </div>
            <div className="text-muted-foreground">Highest</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-red-500" id="stats-low-value">
              {isCurrency
                ? formatCurrency(stats.lowest)
                : stats.lowest.toLocaleString()}
            </div>
            <div className="text-muted-foreground">Lowest</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-foreground" id="stats-avg-value">
              {isCurrency
                ? formatCurrency(stats.average)
                : stats.average.toLocaleString()}
            </div>
            <div className="text-muted-foreground">Average</div>
          </div>
          <div className="text-center">
            <div
              className={cn(
                "font-semibold",
                stats.trendPercent >= 0 ? "text-primary" : "text-red-500",
              )}
              id="stats-trend-value"
            >
              {stats.trendPercent >= 0 ? "+" : ""}
              {stats.trendPercent}%
            </div>
            <div className="text-muted-foreground">vs Last Period</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * SalesOverviewCardSkeleton - Loading state
 */
export function SalesOverviewCardSkeleton() {
  return (
    <Card className="shadow-sm animate-pulse">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="h-5 w-32 bg-muted rounded" />
        <div className="flex gap-2">
          <div className="h-8 w-24 bg-muted rounded" />
          <div className="h-8 w-24 bg-muted rounded" />
          <div className="h-8 w-24 bg-muted rounded" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-8 w-40 bg-muted rounded mb-6" />
        <div className="h-[280px] bg-muted/50 rounded" />
        <div className="flex justify-between mt-4 pt-4 border-t">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="text-center">
              <div className="h-4 w-16 bg-muted rounded mb-1 mx-auto" />
              <div className="h-3 w-12 bg-muted rounded mx-auto" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export type { FilterState, SalesDataPoint, SalesStats, TimePeriod, MetricType };
