"use client";

import { useClientDashboard } from "@/lib/api/client-dashboard";
import { Loader2 } from "lucide-react";
import {
  StatsGrid,
  ExpectedDeliveries,
  RecentlyActivatedPacks,
  SalesByDepartment,
  RecentTransactions,
  RecentActivity,
  RecentVoids,
  RecentShiftHistory,
} from "@/components/mystore-dashboard";

/**
 * MyStore Terminal Dashboard Home Page
 *
 * @requirements
 * - AC #1: Dashboard home page for terminal operators
 * - AC #2: Shows actual store name as page title
 * - AC #3: Displays key metrics, recent activity, and operational data
 */
export default function MyStoreDashboardPage() {
  const { data: dashboardData, isLoading } = useClientDashboard();

  // Get the first active store or first store
  const store =
    dashboardData?.stores.find((s) => s.status === "ACTIVE") ||
    dashboardData?.stores[0];

  const storeName = store?.name || "Store Dashboard";

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="mystore-dashboard-page">
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="mystore-dashboard-page">
      {/* Header - Store Name */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">{storeName}</h1>
      </div>

      {/* Stats Grid - 4 stat cards */}
      <StatsGrid />

      {/* Content Grid - 3 equal cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ExpectedDeliveries />
        <RecentlyActivatedPacks />
        <SalesByDepartment />
      </div>

      {/* Bottom Grid - 2 cards side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentTransactions />
        <RecentActivity />
      </div>

      {/* Full Width - Recent Voids */}
      <RecentVoids />

      {/* Full Width - Recent Shift History */}
      <RecentShiftHistory />
    </div>
  );
}
