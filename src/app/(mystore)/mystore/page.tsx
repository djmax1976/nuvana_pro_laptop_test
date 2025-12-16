"use client";

import { useClientDashboard } from "@/lib/api/client-dashboard";
import { Loader2 } from "lucide-react";

/**
 * MyStore Terminal Dashboard Home Page
 *
 * @requirements
 * - AC #1: Dashboard home page for terminal operators
 * - AC #2: Shows actual store name as page title
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
      <div className="space-y-1">
        <h1 className="text-heading-2 font-bold text-foreground">
          {storeName}
        </h1>
        <p className="text-muted-foreground">
          Select a terminal from the sidebar to begin operations.
        </p>
      </div>
    </div>
  );
}
