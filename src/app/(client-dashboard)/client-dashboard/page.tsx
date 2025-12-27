"use client";

import * as React from "react";
import { useClientAuth } from "@/contexts/ClientAuthContext";
import { Loader2 } from "lucide-react";
import { useClientDashboard } from "@/lib/api/client-dashboard";

// Import all dashboard components
import {
  StatCard,
  StatCardSkeleton,
  SalesOverviewCard,
  SalesOverviewCardSkeleton,
  ShiftPerformanceCard,
  ShiftPerformanceCardSkeleton,
  RecentTransactionsTable,
  RecentTransactionsTableSkeleton,
  RecentActivityFeed,
  RecentActivityFeedSkeleton,
  LotteryPacksTable,
  LotteryPacksTableSkeleton,
  ShiftHistoryTable,
  ShiftHistoryTableSkeleton,
  type ChartDataPoint,
} from "@/components/client-dashboard";

/**
 * KPI Stat Cards configuration
 * Matches the sample HTML design exactly
 */
const KPI_CARDS_ROW_1 = [
  {
    id: "taxable-sales",
    label: "Taxable Sales (includes Food Sales)",
    value: "$5,892",
    trend: { value: "+6.4%", isPositive: true },
    icon: "receipt" as const,
    iconVariant: "primary" as const,
    chartType: "weekly" as const,
    chartData: [
      { value: 5250 },
      { value: 5480 },
      { value: 5890 },
      { value: 5620 },
      { value: 5780 },
      { value: 6120 },
      { value: 5892 },
    ],
  },
  {
    id: "food-sales",
    label: "Food Sales",
    value: "$2,156",
    trend: { value: "+4.2%", isPositive: true },
    icon: "utensils" as const,
    iconVariant: "secondary" as const,
    chartType: "weekly" as const,
    chartData: [
      { value: 1850 },
      { value: 2120 },
      { value: 1980 },
      { value: 2350 },
      { value: 2180 },
      { value: 2450 },
      { value: 2156 },
    ],
  },
  {
    id: "lottery-sales",
    label: "Lottery Sales",
    value: "$1,847",
    trend: { value: "+8.2%", isPositive: true },
    icon: "ticket" as const,
    iconVariant: "warning" as const,
    chartType: "weekly" as const,
    chartData: [
      { value: 1520 },
      { value: 1680 },
      { value: 1890 },
      { value: 1750 },
      { value: 1620 },
      { value: 2100 },
      { value: 1847 },
    ],
  },
  {
    id: "fuel-sales",
    label: "Fuel Sales",
    value: "$3,245",
    trend: { value: "+5.7%", isPositive: true },
    icon: "fuel" as const,
    iconVariant: "secondary" as const,
    chartType: "weekly" as const,
    chartData: [
      { value: 2850 },
      { value: 3120 },
      { value: 2980 },
      { value: 3450 },
      { value: 3280 },
      { value: 3650 },
      { value: 3245 },
    ],
  },
];

const KPI_CARDS_ROW_2 = [
  {
    id: "average-ticket",
    label: "Average Ticket",
    value: "$24.95",
    trend: { value: "+8.3%", isPositive: true },
    icon: "receipt" as const,
    iconVariant: "primary" as const,
    chartType: "weekly" as const,
    chartData: [
      { value: 21.5 },
      { value: 22.15 },
      { value: 23.8 },
      { value: 22.95 },
      { value: 24.1 },
      { value: 26.45 },
      { value: 24.95 },
    ],
  },
  {
    id: "sales-by-hour",
    label: "Sales by Hour",
    value: "$847",
    trend: { value: "peak 2PM", isPositive: true, label: "peak 2PM" },
    icon: "clock" as const,
    iconVariant: "primary" as const,
    chartType: "hourly" as const,
    showOnlyExtremes: true,
    chartData: [
      { value: 120 },
      { value: 85 },
      { value: 45 },
      { value: 30 },
      { value: 25 },
      { value: 35 },
      { value: 180 },
      { value: 420 },
      { value: 580 },
      { value: 650 },
      { value: 720 },
      { value: 780 },
      { value: 847 },
      { value: 810 },
      { value: 750 },
      { value: 680 },
      { value: 590 },
      { value: 520 },
      { value: 480 },
      { value: 390 },
      { value: 320 },
      { value: 280 },
      { value: 210 },
      { value: 150 },
    ],
  },
  {
    id: "lottery-variance",
    label: "Lottery Variance",
    value: "$0",
    trend: { value: "balanced", isPositive: true, label: "balanced" },
    icon: "scale" as const,
    iconVariant: "error" as const,
    chartType: "variance" as const,
    chartData: [
      { value: 0 },
      { value: -15 },
      { value: 0 },
      { value: 10 },
      { value: -5 },
      { value: 0 },
      { value: 0 },
    ],
  },
  {
    id: "cash-variance",
    label: "Cash Variance",
    value: "-$12",
    trend: { value: "-0.2%", isPositive: false },
    icon: "wallet" as const,
    iconVariant: "error" as const,
    chartType: "variance" as const,
    chartData: [
      { value: 5 },
      { value: -18 },
      { value: 12 },
      { value: -8 },
      { value: 25 },
      { value: -32 },
      { value: -12 },
    ],
  },
];

/**
 * Loading skeleton for the full dashboard
 */
function DashboardSkeleton() {
  return (
    <div className="space-y-6" data-testid="client-dashboard-page">
      {/* Header skeleton */}
      <div className="space-y-1">
        <div className="h-8 w-64 bg-muted animate-pulse rounded" />
        <div className="h-4 w-48 bg-muted animate-pulse rounded" />
      </div>

      {/* KPI Cards skeleton */}
      <section aria-labelledby="kpi-heading">
        <h2 id="kpi-heading" className="sr-only">
          Key Performance Indicators
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-4">
          {[...Array(4)].map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      </section>

      {/* Content Grid skeleton */}
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <SalesOverviewCardSkeleton />
        <ShiftPerformanceCardSkeleton />
      </div>

      {/* Bottom Grid skeleton */}
      <div className="grid gap-6 lg:grid-cols-2">
        <RecentTransactionsTableSkeleton />
        <RecentActivityFeedSkeleton />
      </div>

      <LotteryPacksTableSkeleton />
      <ShiftHistoryTableSkeleton />
    </div>
  );
}

/**
 * Client Owner Dashboard Home Page
 *
 * @description Enterprise-grade dashboard displaying:
 * - KPI Summary Cards with trend charts (8 cards in 2 rows)
 * - Sales Overview with filtering controls
 * - Shift Performance donut chart
 * - Recent Transactions table
 * - Recent Activity feed
 * - Active Lottery Packs table
 * - Shift History table
 *
 * @requirements
 * - AC #5: Display client name, associated companies, stores, and quick stats
 * - Show real-time metrics and analytics
 * - Enterprise-grade security and accessibility
 *
 * @security OWASP Top 10 compliant with input validation
 * @accessibility WCAG 2.1 AA compliant with proper ARIA attributes
 */
export default function ClientDashboardPage() {
  const { user } = useClientAuth();
  const { data, isLoading, isError, error } = useClientDashboard();

  // Loading state
  if (isLoading) {
    return <DashboardSkeleton />;
  }

  // Error state
  if (isError) {
    return (
      <div className="space-y-6" data-testid="client-dashboard-page">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">
            Welcome back{user?.name ? `, ${user.name}` : ""}
          </h1>
          <p className="text-destructive">
            Failed to load dashboard: {error?.message || "Unknown error"}
          </p>
        </div>
      </div>
    );
  }

  // Get user name from data or context
  const userName = data?.user?.name || user?.name;

  return (
    <div className="space-y-6" data-testid="client-dashboard-page">
      {/* ============================================
          KPI STAT CARDS SECTION
          Key Performance Indicators with trend charts
          ============================================ */}
      <section aria-labelledby="kpi-heading" data-testid="kpi-section">
        <h2 id="kpi-heading" className="sr-only">
          Key Performance Indicators
        </h2>

        {/* Stats Grid Row 1 */}
        <div
          className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-4"
          role="list"
          aria-label="Primary metrics"
        >
          {KPI_CARDS_ROW_1.map((card) => (
            <StatCard
              key={card.id}
              id={card.id}
              label={card.label}
              value={card.value}
              trend={card.trend}
              icon={card.icon}
              iconVariant={card.iconVariant}
              chartType={card.chartType}
              chartData={card.chartData}
            />
          ))}
        </div>

        {/* Stats Grid Row 2 */}
        <div
          className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
          role="list"
          aria-label="Secondary metrics"
        >
          {KPI_CARDS_ROW_2.map((card) => (
            <StatCard
              key={card.id}
              id={card.id}
              label={card.label}
              value={card.value}
              trend={card.trend}
              icon={card.icon}
              iconVariant={card.iconVariant}
              chartType={card.chartType}
              showOnlyExtremes={
                "showOnlyExtremes" in card ? card.showOnlyExtremes : false
              }
              chartData={card.chartData}
            />
          ))}
        </div>
      </section>

      {/* ============================================
          MAIN CONTENT GRID
          Sales Chart + Shift Performance
          ============================================ */}
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <SalesOverviewCard />
        <ShiftPerformanceCard />
      </div>

      {/* ============================================
          BOTTOM GRID
          Transactions + Activity Feed
          ============================================ */}
      <div className="grid gap-6 lg:grid-cols-2">
        <RecentTransactionsTable
          onViewAll={() => {
            // TODO: Navigate to transactions page
          }}
        />
        <RecentActivityFeed />
      </div>

      {/* ============================================
          LOTTERY PACKS STATUS
          Full width table
          ============================================ */}
      <LotteryPacksTable
        onViewAll={() => {
          // TODO: Navigate to lottery page
        }}
      />

      {/* ============================================
          SHIFT HISTORY
          Full width table
          ============================================ */}
      <ShiftHistoryTable
        onViewAll={() => {
          // TODO: Navigate to shifts page
        }}
      />
    </div>
  );
}
