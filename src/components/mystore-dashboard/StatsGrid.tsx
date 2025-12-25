"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Receipt,
  Users,
  Ticket,
  Scale,
  TrendingUp,
  Clock,
  CheckCircle,
} from "lucide-react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  ReferenceDot,
  XAxis,
} from "recharts";
import {
  AccessibleChart,
  generateChartDescription,
} from "@/components/ui/accessible-chart";
import {
  sanitizeForDisplay,
  formatCurrency,
  maskEmployeeName,
} from "@/lib/utils/security";

/**
 * StatsGrid Component
 *
 * Displays 4 key stat cards with sparkline charts:
 * 1. Average Ticket - with weekly trend line
 * 2. Active Shifts - with cashier badges
 * 3. Lottery Sales - with weekly trend line
 * 4. Lottery Variance - with variance trend line
 *
 * Security Features:
 * - SEC-004: XSS prevention via sanitized output
 * - FE-005: Employee name masking for privacy
 * - WCAG 2.1: Full accessibility support
 *
 * Story: MyStore Dashboard Redesign
 */

// Sample data for charts - will be replaced with real API data
const avgTicketData = [
  { day: "Mon", value: 21.5 },
  { day: "Tue", value: 22.15 },
  { day: "Wed", value: 23.8 },
  { day: "Thu", value: 22.95 },
  { day: "Fri", value: 24.1 },
  { day: "Sat", value: 26.45 },
  { day: "Sun", value: 24.95 },
];

const lotterySalesData = [
  { day: "Mon", value: 1520 },
  { day: "Tue", value: 1680 },
  { day: "Wed", value: 1890 },
  { day: "Thu", value: 1750 },
  { day: "Fri", value: 1620 },
  { day: "Sat", value: 2100 },
  { day: "Sun", value: 1847 },
];

const lotteryVarianceData = [
  { day: "Mon", value: 0 },
  { day: "Tue", value: -15 },
  { day: "Wed", value: 0 },
  { day: "Thu", value: 10 },
  { day: "Fri", value: -5 },
  { day: "Sat", value: 0 },
  { day: "Sun", value: 0 },
];

// Sample active cashiers - names will be masked for display
const activeCashiers = [
  { name: "Sarah Miller", initials: "SM" },
  { name: "John Davis", initials: "JD" },
  { name: "Mike Johnson", initials: "MJ" },
];

interface StatCardProps {
  label: string;
  value: string;
  trend?: {
    value: string;
    positive: boolean;
    icon?: "trending" | "clock" | "check";
  };
  icon: React.ReactNode;
  iconColor: "primary" | "success" | "warning" | "error";
  children?: React.ReactNode;
}

function StatCard({
  label,
  value,
  trend,
  icon,
  iconColor,
  children,
}: StatCardProps) {
  const iconBgColors = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    error: "bg-destructive/10 text-destructive",
  };

  const TrendIcon =
    trend?.icon === "clock"
      ? Clock
      : trend?.icon === "check"
        ? CheckCircle
        : TrendingUp;

  const iconBgClass = iconBgColors[iconColor as keyof typeof iconBgColors];

  // Sanitize label for display (SEC-004: XSS prevention)
  const safeLabel = sanitizeForDisplay(label);
  const safeValue = sanitizeForDisplay(value);
  const safeTrendValue = trend ? sanitizeForDisplay(trend.value) : "";

  // ARIA description for screen readers
  const ariaDescription = trend
    ? `${safeLabel}: ${safeValue}, trend ${trend.positive ? "up" : "down"} ${safeTrendValue}`
    : `${safeLabel}: ${safeValue}`;

  return (
    <Card
      className="p-3 h-[120px] flex flex-col"
      role="region"
      aria-label={ariaDescription}
    >
      <div className="flex justify-between items-start">
        <div>
          <span
            className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide"
            id={`stat-label-${safeLabel.replace(/\s+/g, "-").toLowerCase()}`}
          >
            {safeLabel}
          </span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span
              className="text-xl font-bold"
              aria-labelledby={`stat-label-${safeLabel.replace(/\s+/g, "-").toLowerCase()}`}
            >
              {safeValue}
            </span>
            {trend && (
              <span
                className={`flex items-center gap-0.5 text-[11px] ${trend.positive ? "text-success" : "text-destructive"}`}
                role="status"
                aria-label={`Trend: ${trend.positive ? "positive" : "negative"} ${safeTrendValue}`}
              >
                <TrendIcon className="w-3 h-3" aria-hidden="true" />
                {safeTrendValue}
              </span>
            )}
          </div>
        </div>
        <div
          className={`w-7 h-7 rounded-md flex items-center justify-center ${iconBgClass}`}
          aria-hidden="true"
        >
          {icon}
        </div>
      </div>
      <div className="flex-1 mt-1">{children}</div>
    </Card>
  );
}

interface SparklineChartProps {
  data: { day: string; value: number }[];
  color: string;
  showLabels?: boolean;
  formatValue?: (value: number) => string;
  varianceMode?: boolean;
  /** Chart title for accessibility */
  title?: string;
  /** Chart description for screen readers */
  description?: string;
}

function SparklineChart({
  data,
  color,
  showLabels = true,
  formatValue = (v) => `$${v}`,
  varianceMode = false,
  title = "Trend Chart",
  description,
}: SparklineChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value));
  const minValue = Math.min(...data.map((d) => d.value));

  // Generate accessible description if not provided
  const chartDescription =
    description ||
    generateChartDescription(
      data.map((d) => ({ name: d.day, value: d.value })),
      "line",
      formatValue,
    );

  return (
    <AccessibleChart
      title={title}
      description={chartDescription}
      data={data.map((d) => ({ name: d.day, value: d.value }))}
      xKey="name"
      yKey="value"
      xLabel="Day"
      yLabel="Value"
      formatValue={formatValue}
      height="100%"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 12, right: 5, left: 5, bottom: 0 }}
        >
          <XAxis
            dataKey="day"
            axisLine={{ stroke: "#e5e7eb", strokeWidth: 1 }}
            tickLine={false}
            tick={{ fontSize: 8, fill: "#6b7280" }}
            interval={0}
          />
          <defs>
            <linearGradient
              id={`gradient-${color}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            fill={`url(#gradient-${color})`}
          />
          {/* Show dots at min/max points */}
          {data.map((point, index) => {
            if (varianceMode) {
              // For variance, highlight zeros as green, negatives as red
              if (point.value === 0) {
                return (
                  <ReferenceDot
                    key={index}
                    x={point.day}
                    y={point.value}
                    r={3}
                    fill="#00C853"
                    stroke="#fff"
                    strokeWidth={1.5}
                  />
                );
              } else if (point.value < 0) {
                return (
                  <ReferenceDot
                    key={index}
                    x={point.day}
                    y={point.value}
                    r={3}
                    fill="#F44336"
                    stroke="#fff"
                    strokeWidth={1.5}
                  />
                );
              }
            } else {
              if (point.value === maxValue || point.value === minValue) {
                return (
                  <ReferenceDot
                    key={index}
                    x={point.day}
                    y={point.value}
                    r={3}
                    fill={point.value === maxValue ? "#00C853" : "#F44336"}
                    stroke="#fff"
                    strokeWidth={1.5}
                  />
                );
              }
            }
            return null;
          })}
        </LineChart>
      </ResponsiveContainer>
    </AccessibleChart>
  );
}

export function StatsGrid() {
  return (
    <section
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      data-testid="stats-grid"
      aria-label="Store Performance Metrics"
      role="region"
    >
      {/* Average Ticket */}
      <StatCard
        label="Average Ticket"
        value="$24.95"
        trend={{ value: "+8.3%", positive: true }}
        icon={<Receipt className="w-3.5 h-3.5" aria-hidden="true" />}
        iconColor="primary"
      >
        <div className="h-[50px]">
          <SparklineChart
            data={avgTicketData}
            color="#0066FF"
            formatValue={(v) => formatCurrency(v)}
            title="Average Ticket Weekly Trend"
            description="Line chart showing average transaction amount from Monday to Sunday. Current value is $24.95 with an 8.3% increase from previous period."
          />
        </div>
      </StatCard>

      {/* Active Shifts */}
      <StatCard
        label="Active Shifts"
        value="3"
        trend={{ value: "open", positive: true, icon: "clock" }}
        icon={<Users className="w-3.5 h-3.5" aria-hidden="true" />}
        iconColor="success"
      >
        <div
          className="flex flex-wrap gap-1 mt-1"
          role="list"
          aria-label="Active cashiers"
        >
          {activeCashiers.map((cashier) => (
            <Badge
              key={cashier.initials}
              variant="success"
              className="text-[11px] px-2 py-0.5"
              role="listitem"
            >
              {/* FE-005: Mask employee names for privacy */}
              {maskEmployeeName(cashier.name)}
            </Badge>
          ))}
        </div>
      </StatCard>

      {/* Lottery Sales */}
      <StatCard
        label="Lottery Sales"
        value="$1,847"
        trend={{ value: "+8.2%", positive: true }}
        icon={<Ticket className="w-3.5 h-3.5" aria-hidden="true" />}
        iconColor="warning"
      >
        <div className="h-[50px]">
          <SparklineChart
            data={lotterySalesData}
            color="#FF9800"
            formatValue={(v) => formatCurrency(v)}
            title="Lottery Sales Weekly Trend"
            description="Line chart showing lottery sales from Monday to Sunday. Current value is $1,847 with an 8.2% increase from previous period."
          />
        </div>
      </StatCard>

      {/* Lottery Variance */}
      <StatCard
        label="Lottery Variance"
        value="$0"
        trend={{ value: "balanced", positive: true, icon: "check" }}
        icon={<Scale className="w-3.5 h-3.5" aria-hidden="true" />}
        iconColor="error"
      >
        <div className="h-[50px]">
          <SparklineChart
            data={lotteryVarianceData}
            color="#F44336"
            formatValue={(v) => {
              const prefix = v > 0 ? "+$" : v < 0 ? "-$" : "$";
              return prefix + Math.abs(v);
            }}
            varianceMode
            title="Lottery Variance Weekly Trend"
            description="Line chart showing lottery variance from Monday to Sunday. Current variance is $0 (balanced). Green dots indicate balanced days, red dots indicate negative variance."
          />
        </div>
      </StatCard>
    </section>
  );
}
