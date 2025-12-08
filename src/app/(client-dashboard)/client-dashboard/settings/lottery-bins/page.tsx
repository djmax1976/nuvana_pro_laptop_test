"use client";

/**
 * Client Dashboard Lottery Bin Configuration Page
 * Allows Client Owners to configure lottery bins for their stores
 *
 * Story 6.13: Lottery Database Enhancements & Bin Management
 * AC #1: Configure lottery bins, set number of bins (24-100+), set names/locations/display order,
 *        add/remove bins, save and persist configuration
 */

import { useState, useEffect } from "react";
import { useClientAuth } from "@/contexts/ClientAuthContext";
import { useClientDashboard } from "@/lib/api/client-dashboard";
import { StoreTabs } from "@/components/lottery/StoreTabs";
import { BinConfigurationForm } from "@/components/lottery/BinConfigurationForm";
import { Loader2 } from "lucide-react";

export default function LotteryBinsSettingsPage() {
  const { user } = useClientAuth();
  const {
    data: dashboardData,
    isLoading: dashboardLoading,
    isError: dashboardError,
  } = useClientDashboard();
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  // Set first store as selected when stores are loaded
  const stores = dashboardData?.stores || [];
  useEffect(() => {
    if (stores.length > 0 && selectedStoreId === null) {
      setSelectedStoreId(stores[0].store_id);
    }
  }, [stores, selectedStoreId]);

  // Loading state
  if (dashboardLoading) {
    return (
      <div className="space-y-6" data-testid="lottery-bins-settings-page">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Lottery Bin Configuration</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Loading stores...
          </p>
        </div>
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Error state
  if (dashboardError) {
    return (
      <div className="space-y-6" data-testid="lottery-bins-settings-page">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Lottery Bin Configuration</h1>
          <p className="text-destructive">
            Failed to load stores: {dashboardError?.message || "Unknown error"}
          </p>
        </div>
      </div>
    );
  }

  // No stores available
  if (stores.length === 0) {
    return (
      <div className="space-y-6" data-testid="lottery-bins-settings-page">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Lottery Bin Configuration</h1>
          <p className="text-muted-foreground">No stores available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="lottery-bins-settings-page">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Lottery Bin Configuration</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Configure lottery bins for your stores. Set bin names, locations,
            and display order.
          </p>
        </div>
      </div>

      {/* Store Tabs */}
      {stores.length > 1 && (
        <StoreTabs
          stores={stores}
          selectedStoreId={selectedStoreId}
          onStoreSelect={setSelectedStoreId}
        />
      )}

      {/* Bin Configuration Form */}
      {selectedStoreId && <BinConfigurationForm storeId={selectedStoreId} />}
    </div>
  );
}
