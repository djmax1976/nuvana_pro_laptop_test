"use client";

/**
 * Client Dashboard Settings Page
 * Displays store settings including employees and cashiers per store
 *
 * Story 6.14: Store Settings Page with Employee/Cashier Management
 * AC #1: Navigate to /client-dashboard/settings and see store tabs
 * AC #2: Select store tab and see internal tabs (Store Info, Employees, Cashiers)
 *
 * Security Considerations (FE-001: STATE_MANAGEMENT):
 * - Page title uses centralized context for consistent header display
 * - No sensitive data stored in component state
 */

import { useState, useEffect, useMemo } from "react";
import { useClientDashboard } from "@/lib/api/client-dashboard";
import { StoreTabs } from "@/components/lottery/StoreTabs";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { usePageTitleEffect } from "@/contexts/PageTitleContext";

// Lazy load tab components to improve initial page load
const StoreInfoTab = dynamic(
  () =>
    import("@/components/settings/StoreInfoTab").then(
      (mod) => mod.StoreInfoTab,
    ),
  { loading: () => <Loader2 className="h-6 w-6 animate-spin mx-auto my-8" /> },
);

const StoreEmployeesTab = dynamic(
  () =>
    import("@/components/settings/StoreEmployeesTab").then(
      (mod) => mod.StoreEmployeesTab,
    ),
  { loading: () => <Loader2 className="h-6 w-6 animate-spin mx-auto my-8" /> },
);

const StoreCashiersTab = dynamic(
  () =>
    import("@/components/settings/StoreCashiersTab").then(
      (mod) => mod.StoreCashiersTab,
    ),
  { loading: () => <Loader2 className="h-6 w-6 animate-spin mx-auto my-8" /> },
);

export default function SettingsPage() {
  const {
    data: dashboardData,
    isLoading: dashboardLoading,
    isError: dashboardError,
  } = useClientDashboard();
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  // Set page title in header (FE-001: STATE_MANAGEMENT)
  usePageTitleEffect("Settings");

  // Set first store as selected when stores are loaded
  const stores = useMemo(
    () => dashboardData?.stores || [],
    [dashboardData?.stores],
  );
  useEffect(() => {
    if (stores.length > 0 && selectedStoreId === null) {
      setSelectedStoreId(stores[0].store_id);
    }
  }, [stores, selectedStoreId]);

  // Loading state
  if (dashboardLoading) {
    return (
      <div className="space-y-6" data-testid="settings-page">
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Error state
  if (dashboardError) {
    return (
      <div className="space-y-6" data-testid="settings-page">
        <p className="text-destructive">
          Failed to load stores. Please try again.
        </p>
      </div>
    );
  }

  // No stores available
  if (stores.length === 0) {
    return (
      <div className="space-y-6" data-testid="settings-page">
        <p className="text-muted-foreground">No stores available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="settings-page">
      {/* Store Tabs */}
      {stores.length > 1 && (
        <StoreTabs
          stores={stores}
          selectedStoreId={selectedStoreId}
          onStoreSelect={setSelectedStoreId}
        />
      )}

      {/* Internal Tabs: Store Info, Employees, Cashiers */}
      {selectedStoreId && (
        <Tabs defaultValue="store-info" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="store-info" data-testid="store-info-tab">
              Store Info
            </TabsTrigger>
            <TabsTrigger value="employees" data-testid="employees-tab">
              Employees
            </TabsTrigger>
            <TabsTrigger value="cashiers" data-testid="cashiers-tab">
              Cashiers
            </TabsTrigger>
          </TabsList>

          {/* Store Info Tab */}
          <TabsContent value="store-info" className="space-y-4">
            <StoreInfoTab storeId={selectedStoreId} />
          </TabsContent>

          {/* Employees Tab */}
          <TabsContent value="employees" className="space-y-4">
            <StoreEmployeesTab storeId={selectedStoreId} />
          </TabsContent>

          {/* Cashiers Tab */}
          <TabsContent value="cashiers" className="space-y-4">
            <StoreCashiersTab storeId={selectedStoreId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
