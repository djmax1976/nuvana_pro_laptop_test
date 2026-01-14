"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  YAxis,
  XAxis,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  CheckCircle,
  Receipt,
  Utensils,
  Ticket,
  Fuel,
  Clock,
  Scale,
  Wallet,
} from "lucide-react";

/**
 * Icon mapping for stat cards
 */
const ICONS = {
  receipt: Receipt,
  utensils: Utensils,
  ticket: Ticket,
  fuel: Fuel,
  clock: Clock,
  scale: Scale,
  wallet: Wallet,
} as const;

type IconName = keyof typeof ICONS;

/**
 * Color variants for stat card icons
 */
type IconVariant = "primary" | "secondary" | "warning" | "error";

const ICON_VARIANT_STYLES: Record<IconVariant, string> = {
  primary: "bg-primary/10 text-primary",
  secondary: "bg-green-500/10 text-green-600",
  warning: "bg-orange-500/10 text-orange-600",
  error: "bg-red-500/10 text-red-600",
};

const CHART_COLORS: Record<IconVariant, string> = {
  primary: "hsl(var(--primary))",
  secondary: "#22c55e",
  warning: "#f97316",
  error: "#ef4444",
};

/**
 * Default weekday labels for 7-day charts
 */
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Hour labels for 24-hour charts (Sales by Hour)
 */
const HOUR_LABELS = [
  "12a",
  "1a",
  "2a",
  "3a",
  "4a",
  "5a",
  "6a",
  "7a",
  "8a",
  "9a",
  "10a",
  "11a",
  "12p",
  "1p",
  "2p",
  "3p",
  "4p",
  "5p",
  "6p",
  "7p",
  "8p",
  "9p",
  "10p",
  "11p",
];

/**
 * Format currency value with K notation for thousands
 */
function formatCurrencyK(value: number): string {
  if (Math.abs(value) >= 1000) {
    return "$" + (value / 1000).toFixed(1) + "k";
  }
  return "$" + value.toLocaleString();
}

/**
 * Format variance values with +/- prefix
 */
function formatVariance(value: number): string {
  if (value === 0) return "$0";
  const prefix = value > 0 ? "+$" : "-$";
  return prefix + Math.abs(value);
}

interface ChartDataPoint {
  value: number;
  label?: string;
}

/**
 * Chart type determines X-axis labels and value formatting
 */
type ChartType = "weekly" | "hourly" | "variance";

/**
 * Light background colors for chart fill area (curtain effect)
 */
const CHART_BG_COLORS: Record<IconVariant, string> = {
  primary: "rgba(0, 102, 255, 0.1)",
  secondary: "rgba(34, 197, 94, 0.1)",
  warning: "rgba(249, 115, 22, 0.1)",
  error: "rgba(239, 68, 68, 0.1)",
};

interface StatCardProps {
  id: string;
  label: string;
  value: string;
  trend?: {
    value: string;
    isPositive: boolean;
    label?: string;
  };
  icon: IconName;
  iconVariant?: IconVariant;
  chartData?: ChartDataPoint[];
  chartType?: ChartType;
  /** Show labels only at max/min points (true) or all points (false) */
  showOnlyExtremes?: boolean;
  className?: string;
  "data-testid"?: string;
  "aria-label"?: string;
}

/**
 * StatCard - KPI metric card with mini trend chart
 *
 * @description Enterprise-grade stat card component with:
 * - Mini sparkline chart using Recharts
 * - Trend indicator with percentage
 * - Accessible ARIA labels
 * - Draggable support (future)
 *
 * @security Input validation for all props
 * @accessibility WCAG 2.1 AA compliant with proper ARIA attributes
 */
export function StatCard({
  id,
  label,
  value,
  trend,
  icon,
  iconVariant = "primary",
  chartData,
  chartType = "weekly",
  showOnlyExtremes = false,
  className,
  "data-testid": testId,
  "aria-label": ariaLabel,
}: StatCardProps) {
  // eslint-disable-next-line security/detect-object-injection -- Safe: icon is typed IconName enum
  const IconComponent = ICONS[icon];

  // Validate and transform chartData with labels
  const { validChartData, maxIndex, minIndex, formatValue } =
    React.useMemo(() => {
      if (!chartData || !Array.isArray(chartData)) {
        return {
          validChartData: null,
          maxIndex: -1,
          minIndex: -1,
          formatValue: formatCurrencyK,
        };
      }

      const filtered = chartData.filter(
        (d) => typeof d.value === "number" && !isNaN(d.value),
      );

      if (filtered.length === 0) {
        return {
          validChartData: null,
          maxIndex: -1,
          minIndex: -1,
          formatValue: formatCurrencyK,
        };
      }

      // Determine labels based on chart type or data length
      const labels =
        chartType === "hourly" || filtered.length === 24
          ? HOUR_LABELS
          : WEEKDAY_LABELS;

      // Add labels to data points
      const dataWithLabels = filtered.map((d, i) => ({
        ...d,
        label: labels[i % labels.length],
      }));

      // Find max and min indices for highlighting
      const values = dataWithLabels.map((d) => d.value);
      const maxVal = Math.max(...values);
      const minVal = Math.min(...values);
      const maxIdx = values.indexOf(maxVal);
      const minIdx = values.lastIndexOf(minVal);

      // Choose formatter based on chart type
      const formatter =
        chartType === "variance" ? formatVariance : formatCurrencyK;

      return {
        validChartData: dataWithLabels,
        maxIndex: maxIdx,
        minIndex: minIdx,
        formatValue: formatter,
      };
    }, [chartData, chartType]);

  // Pre-compute chart colors for the iconVariant to avoid object injection warnings in JSX
  // eslint-disable-next-line security/detect-object-injection -- Safe: iconVariant is typed IconVariant enum
  const chartStrokeColor = CHART_COLORS[iconVariant];
  // eslint-disable-next-line security/detect-object-injection -- Safe: iconVariant is typed IconVariant enum
  const chartFillColor = CHART_BG_COLORS[iconVariant];

  // Generate accessible label
  const computedAriaLabel =
    ariaLabel ||
    `${label}: ${value}${trend ? `, ${trend.isPositive ? "up" : "down"} ${trend.value}` : ""}`;

  return (
    <article
      className={cn(
        "bg-card border border-border rounded-xl p-4 shadow-sm transition-shadow duration-200 hover:shadow-md",
        "flex flex-col h-[140px] min-w-0 overflow-hidden",
        className,
      )}
      data-card-id={id}
      data-testid={testId || `stat-card-${id}`}
      data-analytics-id={`metric-${id}`}
      role="listitem"
      tabIndex={0}
      aria-label={computedAriaLabel}
    >
      {/* Header with label, value, trend, and icon */}
      <div className="flex justify-between items-start mb-0">
        <div className="min-w-0 flex-1">
          <span
            className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block"
            id={`label-${id}`}
          >
            {label}
          </span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span
              className="text-xl font-bold text-foreground"
              aria-describedby={`label-${id}`}
            >
              {value}
            </span>
            {trend && (
              <span
                className={cn(
                  "flex items-center gap-0.5 text-[11px]",
                  trend.isPositive ? "text-green-600" : "text-red-500",
                )}
                aria-label={`Trend: ${trend.isPositive ? "up" : "down"} ${trend.value}`}
              >
                {trend.isPositive ? (
                  <TrendingUp className="w-3 h-3" aria-hidden="true" />
                ) : trend.label === "balanced" ? (
                  <CheckCircle className="w-3 h-3" aria-hidden="true" />
                ) : (
                  <TrendingDown className="w-3 h-3" aria-hidden="true" />
                )}
                <span>{trend.label || trend.value}</span>
              </span>
            )}
          </div>
        </div>
        <div
          className={cn(
            "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0",
            // eslint-disable-next-line security/detect-object-injection -- Safe: iconVariant is typed IconVariant enum
            ICON_VARIANT_STYLES[iconVariant],
          )}
          aria-hidden="true"
        >
          <IconComponent className="w-3.5 h-3.5" />
        </div>
      </div>

      {/* Mini Chart with X-axis labels, fill area, and value annotations */}
      {validChartData && (
        <div
          className="flex-1 mt-1"
          style={{ minHeight: 60 }}
          aria-hidden="true"
        >
          <ResponsiveContainer width="100%" height={60}>
            <AreaChart
              data={validChartData}
              margin={{ top: 18, right: 12, bottom: 0, left: 12 }}
            >
              <XAxis
                dataKey="label"
                axisLine={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
                tickLine={false}
                tick={{
                  fontSize: 9,
                  fill: "hsl(var(--muted-foreground))",
                }}
                interval={chartType === "hourly" ? 3 : 0}
              />
              <YAxis domain={["dataMin - 10", "dataMax + 10"]} hide />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(val) => {
                  const numVal = typeof val === "number" ? val : 0;
                  return [formatValue(numVal), label];
                }}
                labelFormatter={(lbl) => lbl}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={chartStrokeColor}
                strokeWidth={2}
                fill={chartFillColor}
                dot={(props) => {
                  const { cx, cy, index } = props;
                  if (
                    typeof cx !== "number" ||
                    typeof cy !== "number" ||
                    typeof index !== "number" ||
                    index < 0 ||
                    index >= validChartData.length
                  ) {
                    return <g key="dot-invalid" />;
                  }

                  // eslint-disable-next-line security/detect-object-injection -- Safe: index is bounded by validChartData.length
                  const dataValue = validChartData[index].value;
                  const isMax = index === maxIndex;
                  const isMin = index === minIndex && minIndex !== maxIndex;

                  // Determine if we should show this point's label
                  const shouldShowLabel = !showOnlyExtremes || isMax || isMin;

                  // Determine colors
                  // eslint-disable-next-line security/detect-object-injection -- Safe: iconVariant is typed IconVariant enum
                  let dotColor = CHART_COLORS[iconVariant];
                  let textColor = "hsl(var(--muted-foreground))";

                  if (chartType === "variance") {
                    // For variance charts: green for 0, red for negative, orange for positive
                    if (dataValue === 0) {
                      dotColor = "#22c55e";
                      textColor = "#22c55e";
                    } else if (dataValue < 0) {
                      dotColor = "#ef4444";
                      textColor = "#ef4444";
                    } else {
                      dotColor = "#f97316";
                      textColor = "#f97316";
                    }
                  } else if (isMax) {
                    dotColor = "#22c55e";
                    textColor = "#22c55e";
                  } else if (isMin) {
                    dotColor = "#ef4444";
                    textColor = "#ef4444";
                  }

                  // Only render dot for max/min, or for all if not showOnlyExtremes
                  const showDot = isMax || isMin;

                  return (
                    <g key={`dot-${index}`}>
                      {showDot && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={4}
                          fill={dotColor}
                          stroke="white"
                          strokeWidth={2}
                        />
                      )}
                      {shouldShowLabel && (
                        <text
                          x={cx}
                          y={cy - 8}
                          textAnchor="middle"
                          fill={textColor}
                          fontSize={9}
                          fontWeight="bold"
                        >
                          {formatValue(dataValue)}
                        </text>
                      )}
                    </g>
                  );
                }}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </article>
  );
}

/**
 * StatCardSkeleton - Loading state for StatCard
 */
export function StatCardSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-4 shadow-sm h-[140px] animate-pulse">
      <div className="flex justify-between items-start">
        <div>
          <div className="h-3 w-20 bg-muted rounded mb-2" />
          <div className="h-6 w-16 bg-muted rounded" />
        </div>
        <div className="w-7 h-7 bg-muted rounded-lg" />
      </div>
      <div className="h-[60px] mt-4 bg-muted/50 rounded" />
    </div>
  );
}

export type { StatCardProps, IconName, IconVariant, ChartDataPoint, ChartType };
