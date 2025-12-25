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

/**
 * StatsGrid Component
 *
 * Displays 4 key stat cards with sparkline charts:
 * 1. Average Ticket - with weekly trend line
 * 2. Active Shifts - with cashier badges
 * 3. Lottery Sales - with weekly trend line
 * 4. Lottery Variance - with variance trend line
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

// Sample active cashiers
const activeCashiers = [
  { name: "Sarah M.", initials: "SM" },
  { name: "John D.", initials: "JD" },
  { name: "Mike J.", initials: "MJ" },
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

  return (
    <Card className="p-3 h-[120px] flex flex-col">
      <div className="flex justify-between items-start">
        <div>
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            {label}
          </span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-xl font-bold">{value}</span>
            {trend && (
              <span
                className={`flex items-center gap-0.5 text-[11px] ${trend.positive ? "text-success" : "text-destructive"}`}
              >
                <TrendIcon className="w-3 h-3" />
                {trend.value}
              </span>
            )}
          </div>
        </div>
        <div
          className={`w-7 h-7 rounded-md flex items-center justify-center ${iconBgClass}`}
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
}

function SparklineChart({
  data,
  color,
  showLabels = true,
  formatValue = (v) => `$${v}`,
  varianceMode = false,
}: SparklineChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value));
  const minValue = Math.min(...data.map((d) => d.value));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 12, right: 5, left: 5, bottom: 0 }}>
        <XAxis
          dataKey="day"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 8, fill: "#6b7280" }}
          interval={0}
        />
        <defs>
          <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
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
  );
}

export function StatsGrid() {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      data-testid="stats-grid"
    >
      {/* Average Ticket */}
      <StatCard
        label="Average Ticket"
        value="$24.95"
        trend={{ value: "+8.3%", positive: true }}
        icon={<Receipt className="w-3.5 h-3.5" />}
        iconColor="primary"
      >
        <div className="h-[50px]">
          <SparklineChart
            data={avgTicketData}
            color="#0066FF"
            formatValue={(v) => `$${v.toFixed(0)}`}
          />
        </div>
      </StatCard>

      {/* Active Shifts */}
      <StatCard
        label="Active Shifts"
        value="3"
        trend={{ value: "open", positive: true, icon: "clock" }}
        icon={<Users className="w-3.5 h-3.5" />}
        iconColor="success"
      >
        <div className="flex flex-wrap gap-1 mt-1">
          {activeCashiers.map((cashier) => (
            <Badge
              key={cashier.initials}
              variant="success"
              className="text-[11px] px-2 py-0.5"
            >
              {cashier.name}
            </Badge>
          ))}
        </div>
      </StatCard>

      {/* Lottery Sales */}
      <StatCard
        label="Lottery Sales"
        value="$1,847"
        trend={{ value: "+8.2%", positive: true }}
        icon={<Ticket className="w-3.5 h-3.5" />}
        iconColor="warning"
      >
        <div className="h-[50px]">
          <SparklineChart
            data={lotterySalesData}
            color="#FF9800"
            formatValue={(v) => `$${(v / 1000).toFixed(1)}k`}
          />
        </div>
      </StatCard>

      {/* Lottery Variance */}
      <StatCard
        label="Lottery Variance"
        value="$0"
        trend={{ value: "balanced", positive: true, icon: "check" }}
        icon={<Scale className="w-3.5 h-3.5" />}
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
          />
        </div>
      </StatCard>
    </div>
  );
}
