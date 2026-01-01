"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useClientAuth } from "@/contexts/ClientAuthContext";
import { useClientDashboard } from "@/lib/api/client-dashboard";
import { StoreTabs } from "@/components/lottery/StoreTabs";
import { LotteryTable } from "@/components/lottery/LotteryTable";
import {
  PackReceptionForm,
  type PackItem,
} from "@/components/lottery/PackReceptionForm";
import { EditLotteryDialog } from "@/components/lottery/EditLotteryDialog";
import { DeleteLotteryDialog } from "@/components/lottery/DeleteLotteryDialog";
import { AddBinModal } from "@/components/lottery/AddBinModal";
import { BinListDisplay, BinItem } from "@/components/lottery/BinListDisplay";
import { Loader2, Plus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInvalidateLottery } from "@/hooks/useLottery";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";

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
  const queryClient = useQueryClient();
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isAddBinDialogOpen, setIsAddBinDialogOpen] = useState(false);

  // MCP FE-001: STATE_MANAGEMENT - Lifted state for pack reception
  // Pack list is owned by parent to persist across modal close/reopen
  // Prevents data loss if user accidentally closes modal during batch scanning
  const [receptionPackList, setReceptionPackList] = useState<PackItem[]>([]);
  const [editingPackId, setEditingPackId] = useState<string | null>(null);
  const [deletingPackId, setDeletingPackId] = useState<string | null>(null);
  const [occupiedBinNumbers, setOccupiedBinNumbers] = useState<number[]>([]);

  // Memoized callback to handle bin data loaded - prevents infinite re-render loop
  const handleBinsDataLoaded = useCallback((bins: BinItem[]) => {
    // Extract bin numbers that have an active pack assigned
    const occupied = bins
      .filter((bin) => bin.current_pack != null)
      .map((bin) => bin.display_order + 1); // display_order is 0-indexed, bin numbers are 1-indexed
    setOccupiedBinNumbers(occupied);
  }, []);

  // MCP FE-001: STATE_MANAGEMENT - Lifted state callbacks for PackReceptionForm
  // These handlers manage pack list state at parent level for persistence
  const handlePackAdd = useCallback((pack: PackItem) => {
    // Prepend new pack to list (newest first for immediate visual feedback)
    setReceptionPackList((prev) => [pack, ...prev]);
  }, []);

  const handlePackRemove = useCallback((index: number) => {
    setReceptionPackList((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handlePacksClear = useCallback(() => {
    setReceptionPackList([]);
  }, []);

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

        {/* Configuration Tab - Bin Management */}
        <TabsContent value="configuration" className="space-y-4">
          {selectedStoreId && selectedStore && (
            <>
              {/* Add Bin Button */}
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-semibold">Bin Configuration</h2>
                  <p className="text-sm text-muted-foreground">
                    Manage lottery bins for {selectedStore.name}
                  </p>
                </div>
                <Button
                  onClick={() => setIsAddBinDialogOpen(true)}
                  data-testid="add-bin-button"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Bin
                </Button>
              </div>

              {/* Bin List Display */}
              <BinListDisplay
                storeId={selectedStoreId}
                onDataLoaded={handleBinsDataLoaded}
              />
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Pack Reception Form (Serialized Input) */}
      {/* MCP FE-001: STATE_MANAGEMENT - Parent owns pack list state for persistence */}
      {/* Pack list survives modal close/reopen to prevent accidental data loss */}
      {selectedStoreId && (
        <PackReceptionForm
          open={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
          storeId={selectedStoreId}
          packList={receptionPackList}
          onPackAdd={handlePackAdd}
          onPackRemove={handlePackRemove}
          onPacksClear={handlePacksClear}
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

      {/* Add Bin Modal */}
      {selectedStoreId && (
        <AddBinModal
          open={isAddBinDialogOpen}
          onOpenChange={setIsAddBinDialogOpen}
          storeId={selectedStoreId}
          occupiedBinNumbers={occupiedBinNumbers}
          onBinCreated={() => {
            setIsAddBinDialogOpen(false);
            // Invalidate bins query to refresh the list
            queryClient.invalidateQueries({
              queryKey: ["lottery-bins", selectedStoreId],
            });
            // Also invalidate packs as pack status may have changed
            invalidatePacks();
          }}
        />
      )}
    </div>
  );
}
