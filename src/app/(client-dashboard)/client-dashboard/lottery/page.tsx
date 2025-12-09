"use client";

import { useState, useEffect, useMemo } from "react";
import { useClientAuth } from "@/contexts/ClientAuthContext";
import { useClientDashboard } from "@/lib/api/client-dashboard";
import { StoreTabs } from "@/components/lottery/StoreTabs";
import { LotteryTable } from "@/components/lottery/LotteryTable";
import { PackReceptionForm } from "@/components/lottery/PackReceptionForm";
import { EditLotteryDialog } from "@/components/lottery/EditLotteryDialog";
import { DeleteLotteryDialog } from "@/components/lottery/DeleteLotteryDialog";
import { BinConfigurationCard } from "@/components/lottery/BinConfigurationCard";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInvalidateLottery } from "@/hooks/useLottery";

/**
 * Client Dashboard Lottery Page
 * Displays active lottery packs across all stores with store tabs for navigation
 *
 * @requirements
 * - AC #1: Store tabs for all accessible stores, sidebar link exists and functional
 * - AC #2: Table listing active lottery packs with columns: Bin Number, Dollar Amount, Game Number, Game Name, Pack Number, Status, Actions
 * - AC #3: Only ACTIVE status packs shown, bins displayed in order
 * - AC #4: "+ Add New Lottery" button opens form/modal
 * - AC #7: Proper authentication (JWT tokens), RLS enforcement, error messages, loading states
 * - AC #8: Empty state when no active packs exist
 */
export default function ClientDashboardLotteryPage() {
  const { user } = useClientAuth();
  const {
    data: dashboardData,
    isLoading: dashboardLoading,
    isError: dashboardError,
  } = useClientDashboard();
  const { invalidatePacks } = useInvalidateLottery();
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingPackId, setEditingPackId] = useState<string | null>(null);
  const [deletingPackId, setDeletingPackId] = useState<string | null>(null);

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
      <div className="space-y-6" data-testid="client-dashboard-lottery-page">
        <div className="space-y-1">
          <h1 className="text-heading-2 font-bold text-foreground">
            Lottery Management
          </h1>
          <p className="text-muted-foreground">Loading stores...</p>
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
      <div className="space-y-6" data-testid="client-dashboard-lottery-page">
        <div className="space-y-1">
          <h1 className="text-heading-2 font-bold text-foreground">
            Lottery Management
          </h1>
          <p className="text-destructive">
            Failed to load stores. Please try again.
          </p>
        </div>
      </div>
    );
  }

  // No stores available
  if (stores.length === 0) {
    return (
      <div className="space-y-6" data-testid="client-dashboard-lottery-page">
        <div className="space-y-1">
          <h1 className="text-heading-2 font-bold text-foreground">
            Lottery Management
          </h1>
          <p className="text-muted-foreground">No stores available</p>
        </div>
      </div>
    );
  }

  // Get selected store name for display
  const selectedStore = stores.find((s) => s.store_id === selectedStoreId);

  return (
    <div className="space-y-6" data-testid="client-dashboard-lottery-page">
      {/* Page Header */}
      <div className="space-y-1">
        <h1 className="text-heading-2 font-bold text-foreground">
          Lottery Management
        </h1>
        <p className="text-muted-foreground">
          View and manage lottery packs and configuration across your stores
        </p>
      </div>

      {/* Store Tabs */}
      <StoreTabs
        stores={stores}
        selectedStoreId={selectedStoreId}
        onStoreSelect={setSelectedStoreId}
      />

      {/* Main Content Tabs */}
      <Tabs defaultValue="inventory" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
        </TabsList>

        {/* Inventory Tab */}
        <TabsContent value="inventory" className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setIsAddDialogOpen(true)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              data-testid="add-new-lottery-button"
              aria-label="Add new lottery pack"
            >
              + Add New Lottery
            </button>
          </div>

          {/* Lottery Table */}
          {selectedStoreId && (
            <LotteryTable
              storeId={selectedStoreId}
              onEdit={(packId) => {
                setEditingPackId(packId);
              }}
              onDelete={(packId) => {
                setDeletingPackId(packId);
              }}
            />
          )}
        </TabsContent>

        {/* Configuration Tab */}
        <TabsContent value="configuration" className="space-y-4">
          {selectedStoreId && selectedStore && (
            <BinConfigurationCard
              storeId={selectedStoreId}
              storeName={selectedStore.name}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Pack Reception Form (Serialized Input) */}
      {selectedStoreId && (
        <PackReceptionForm
          open={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
          storeId={selectedStoreId}
          onSuccess={() => {
            setIsAddDialogOpen(false);
            // Invalidate the lottery packs query to refresh the table
            invalidatePacks();
          }}
        />
      )}

      {/* Edit Lottery Dialog */}
      <EditLotteryDialog
        open={editingPackId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingPackId(null);
          }
        }}
        packId={editingPackId}
        onSuccess={() => {
          setEditingPackId(null);
          // Table will refresh automatically via query invalidation
        }}
      />

      {/* Delete Lottery Dialog */}
      <DeleteLotteryDialog
        open={deletingPackId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingPackId(null);
          }
        }}
        packId={deletingPackId}
        onSuccess={() => {
          setDeletingPackId(null);
          // Table will refresh automatically via query invalidation
        }}
      />
    </div>
  );
}
