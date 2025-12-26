/**
 * Client Dashboard Components
 *
 * @description Enterprise-grade dashboard components for the Client Owner Dashboard.
 * All components follow WCAG 2.1 AA accessibility guidelines and OWASP security best practices.
 *
 * @security Components implement input validation and XSS protection
 * @accessibility All components include proper ARIA attributes and keyboard navigation
 */

// KPI Stat Cards
export {
  StatCard,
  StatCardSkeleton,
  type StatCardProps,
  type IconName,
  type IconVariant,
  type ChartDataPoint,
  type ChartType,
} from "./stat-card";

// Sales Overview Chart
export {
  SalesOverviewCard,
  SalesOverviewCardSkeleton,
  type FilterState,
  type SalesDataPoint,
  type SalesStats,
  type TimePeriod,
  type MetricType,
} from "./sales-overview-card";

// Shift Performance Donut Chart
export {
  ShiftPerformanceCard,
  ShiftPerformanceCardSkeleton,
  type ShiftPerformanceData,
  type PerformanceView,
} from "./shift-performance-card";

// Recent Transactions Table
export {
  RecentTransactionsTable,
  RecentTransactionsTableSkeleton,
  type Transaction,
  type PaymentType,
} from "./recent-transactions-table";

// Recent Activity Feed
export {
  RecentActivityFeed,
  RecentActivityFeedSkeleton,
  type ActivityItem,
  type ActivityType,
} from "./recent-activity-feed";

// Lottery Packs Table
export {
  LotteryPacksTable,
  LotteryPacksTableSkeleton,
  type LotteryPack,
  type PackStatus,
} from "./lottery-packs-table";

// Shift History Table
export {
  ShiftHistoryTable,
  ShiftHistoryTableSkeleton,
  type Shift,
  type ShiftVariance,
  type ShiftStatus,
  type VarianceStatus,
} from "./shift-history-table";
