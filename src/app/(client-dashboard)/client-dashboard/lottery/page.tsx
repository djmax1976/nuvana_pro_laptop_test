"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useClientAuth } from "@/contexts/ClientAuthContext";
import { useClientDashboard } from "@/lib/api/client-dashboard";
import { usePageTitleEffect } from "@/contexts/PageTitleContext";
import { LotteryTable } from "@/components/lottery/LotteryTable";
import {
  PackReceptionForm,
  type PackItem,
} from "@/components/lottery/PackReceptionForm";
import { EditLotteryDialog } from "@/components/lottery/EditLotteryDialog";
import { DeleteLotteryDialog } from "@/components/lottery/DeleteLotteryDialog";
import { Loader2 } from "lucide-react";
import { useInvalidateLottery } from "@/hooks/useLottery";

/**
 * Client Dashboard Lottery Page
 * Displays lottery inventory for stores with integrated store selection
 *
 * @description
 * Streamlined lottery management page with store dropdown integrated into
 * the filters row. Configuration tab removed as bin count management is
 * now accessible via the "Total Bins" badge in the LotteryTable component.
 *
 * @requirements
 * - Store dropdown in filters row (only shown for multi-store companies)
 * - Table listing lottery packs grouped by game with expandable rows
 * - Bin count configuration via clickable "Total Bins" badge
 * - Pack reception, editing, and deletion via modals
 *
 * @security
 * - FE-001: STATE_MANAGEMENT - Lifted state for pack reception persistence
 * - FE-005: UI_SECURITY - No sensitive data exposed in UI
 * - SEC-004: XSS - React auto-escapes all text content
 */
export default function ClientDashboardLotteryPage() {
  // Authentication context hook - ensures user is authenticated
  useClientAuth();

  // Dashboard data including stores list
  const {
    data: dashboardData,
    isLoading: dashboardLoading,
    isError: dashboardError,
  } = useClientDashboard();

  // Query invalidation for refreshing lottery data
  const { invalidatePacks } = useInvalidateLottery();

  // Selected store state - FE-001: STATE_MANAGEMENT
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  // Modal states for pack operations
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingPackId, setEditingPackId] = useState<string | null>(null);
  const [deletingPackId, setDeletingPackId] = useState<string | null>(null);

  // Set page title in header (FE-001: STATE_MANAGEMENT)
  usePageTitleEffect("Lottery Management");

  /**
   * FE-001: STATE_MANAGEMENT - Lifted state for pack reception
   * Pack list is owned by parent to persist across modal close/reopen
   * Prevents data loss if user accidentally closes modal during batch scanning
   */
  const [receptionPackList, setReceptionPackList] = useState<PackItem[]>([]);

  /**
   * FE-001: STATE_MANAGEMENT - Lifted state callbacks for PackReceptionForm
   * These handlers manage pack list state at parent level for persistence
   */
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

  /**
   * Memoized stores array to prevent unnecessary re-renders
   * SEC-014: INPUT_VALIDATION - Stores are validated by backend RLS
   */
  const stores = useMemo(
    () => dashboardData?.stores || [],
    [dashboardData?.stores],
  );

  /**
   * Auto-select first store when stores are loaded
   * Ensures a valid store is always selected when available
   */
  useEffect(() => {
    if (stores.length > 0 && selectedStoreId === null) {
      setSelectedStoreId(stores[0].store_id);
    }
  }, [stores, selectedStoreId]);

  /**
   * Handle store change from LotteryTable dropdown
   * SEC-014: INPUT_VALIDATION - Validates store exists in allowed list
   */
  const handleStoreChange = useCallback(
    (storeId: string) => {
      // Validate that the selected store is in the allowed stores list
      const isValidStore = stores.some((store) => store.store_id === storeId);
      if (isValidStore) {
        setSelectedStoreId(storeId);
      }
    },
    [stores],
  );

  // Loading state with accessible loading indicator
  if (dashboardLoading) {
    return (
      <div className="space-y-6" data-testid="client-dashboard-lottery-page">
        <div
          className="flex items-center justify-center p-8"
          role="status"
          aria-label="Loading lottery data"
        >
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="sr-only">Loading lottery data...</span>
        </div>
      </div>
    );
  }

  // Error state with user-friendly message
  if (dashboardError) {
    return (
      <div className="space-y-6" data-testid="client-dashboard-lottery-page">
        <div role="alert" aria-live="assertive">
          <p className="text-destructive">
            Failed to load stores. Please try again.
          </p>
        </div>
      </div>
    );
  }

  // No stores available state
  if (stores.length === 0) {
    return (
      <div className="space-y-6" data-testid="client-dashboard-lottery-page">
        <p className="text-muted-foreground">No stores available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="client-dashboard-lottery-page">
      {/* Lottery Table with integrated store dropdown */}
      {/* Store dropdown only shown for multi-store companies (handled in LotteryTable) */}
      {selectedStoreId && (
        <LotteryTable
          storeId={selectedStoreId}
          stores={stores}
          onStoreChange={handleStoreChange}
          onReceivePacksClick={() => setIsAddDialogOpen(true)}
          onEdit={(packId) => {
            setEditingPackId(packId);
          }}
          onDelete={(packId) => {
            setDeletingPackId(packId);
          }}
        />
      )}

      {/* Pack Reception Form (Serialized Input) */}
      {/* FE-001: STATE_MANAGEMENT - Parent owns pack list state for persistence */}
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
    </div>
  );
}
