/**
 * Configured Status View Component
 *
 * Main view for an already-configured POS integration.
 * Displays integration info, sync status, and history in a unified view.
 *
 * Reference: nuvana_docs/templates/onboarding-ui/states.html
 * Reference: Plan lines 810-894
 *
 * Security: FE-005 (UI Security), FE-001 (State Management)
 *
 * @module components/pos-integration/ConfiguredStatusView
 */

import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  useTriggerPOSSync,
  useUpdatePOSIntegration,
  getErrorMessage,
} from "@/lib/api/pos-integration";
import { POSInfoCard } from "./POSInfoCard";
import { SyncStatusCard } from "./SyncStatusCard";
import { SyncHistoryList } from "./SyncHistoryList";
import { EditConnectionModal } from "./EditConnectionModal";
import { getConnectionCategory } from "@/lib/pos-integration/pos-types";
import type { POSIntegration, POSSyncResult } from "@/types/pos-integration";

// ============================================================================
// Types
// ============================================================================

interface ConfiguredStatusViewProps {
  /** Store ID for API calls */
  storeId: string;
  /** POS integration data */
  integration: POSIntegration;
  /** Callback to switch to edit mode */
  onEdit?: () => void;
  /** Optional class name */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Configured status view for an active POS integration.
 *
 * Layout:
 * ```
 * ┌──────────────────────────────────────────────────────┐
 * │  ✓ VERIFONE COMMANDER                        [Edit] │
 * │    File-based • Connected                           │
 * ├──────────────────────────────────────────────────────┤
 * │  Export: C:\Verifone\Export                         │
 * │  Import: C:\Verifone\Import                         │
 * ├──────────────────────────────────────────────────────┤
 * │  LAST SYNC                         ┌──────────────┐ │
 * │  Today at 2:30 PM                  │  Sync Now    │ │
 * │  ✓ 45 Departments                  └──────────────┘ │
 * │  ✓ 12 Tender Types                                  │
 * │  ─ Tax Rates (not synced)                           │
 * │                                                     │
 * │  Auto-Sync: Every hour               [ON] / OFF     │
 * ├──────────────────────────────────────────────────────┤
 * │  ▼ SYNC HISTORY                                     │
 * │  [Collapsible history entries]                      │
 * └──────────────────────────────────────────────────────┘
 * ```
 *
 * @example
 * ```tsx
 * <ConfiguredStatusView
 *   storeId={storeId}
 *   integration={posIntegration}
 *   onEdit={() => setEditMode(true)}
 * />
 * ```
 */
export function ConfiguredStatusView({
  storeId,
  integration,
  onEdit,
  className,
}: ConfiguredStatusViewProps): JSX.Element {
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // API mutations
  const triggerSyncMutation = useTriggerPOSSync();
  const updateIntegrationMutation = useUpdatePOSIntegration();

  // Check if this is a file-based connection (supports path editing)
  const connectionCategory = getConnectionCategory(integration.pos_type);
  const isFileBasedConnection = connectionCategory === "file";

  /**
   * Handle manual sync trigger
   */
  const handleSyncNow = useCallback(async (): Promise<POSSyncResult> => {
    setIsSyncing(true);

    try {
      const result = await triggerSyncMutation.mutateAsync({
        storeId,
        options: {
          sync_departments: integration.sync_departments,
          sync_tender_types: integration.sync_tender_types,
          sync_tax_rates: integration.sync_tax_rates,
        },
      });

      if (result.success && result.data.status === "SUCCESS") {
        toast({
          title: "Sync Completed",
          description: `Successfully synced data from ${integration.pos_name || integration.pos_type}`,
        });
      } else if (result.data.status === "PARTIAL_SUCCESS") {
        toast({
          title: "Sync Completed with Warnings",
          description: `${result.data.errors?.length || 0} items failed to sync`,
          variant: "destructive",
        });
      }

      return result;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      toast({
        title: "Sync Failed",
        description: errorMessage,
        variant: "destructive",
      });

      // Return a failed result for the UI
      return {
        success: false,
        data: {
          status: "FAILED",
          durationMs: 0,
          errors: [],
          errorMessage,
          errorCode: "SYNC_ERROR",
        },
      };
    } finally {
      setIsSyncing(false);
    }
  }, [storeId, integration, triggerSyncMutation, toast]);

  /**
   * Handle auto-sync toggle
   */
  const handleToggleAutoSync = useCallback(
    async (enabled: boolean) => {
      try {
        await updateIntegrationMutation.mutateAsync({
          storeId,
          data: { sync_enabled: enabled },
        });

        toast({
          title: enabled ? "Auto-Sync Enabled" : "Auto-Sync Disabled",
          description: enabled
            ? `Data will sync every ${integration.sync_interval_mins} minutes`
            : "Automatic syncing has been disabled",
        });
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        toast({
          title: "Failed to Update Settings",
          description: errorMessage,
          variant: "destructive",
        });
        throw error; // Re-throw to let the switch revert
      }
    },
    [storeId, integration.sync_interval_mins, updateIntegrationMutation, toast],
  );

  /**
   * Handle edit button click
   * For file-based connections, opens the EditConnectionModal
   * For other types, calls the external onEdit callback if provided
   */
  const handleEdit = useCallback(() => {
    if (isFileBasedConnection) {
      setIsEditModalOpen(true);
    } else if (onEdit) {
      onEdit();
    }
  }, [isFileBasedConnection, onEdit]);

  /**
   * Handle successful edit save
   * Invalidates the integration query to refresh data
   */
  const handleEditSaveSuccess = useCallback(() => {
    // The mutation already invalidates the query via React Query
    // This callback is for any additional actions needed
  }, []);

  return (
    <div
      className={className}
      data-testid="configured-status-view"
      role="region"
      aria-label="POS Integration Status"
    >
      <div className="space-y-4">
        {/* POS Info Card */}
        <POSInfoCard
          integration={integration}
          onEdit={isFileBasedConnection || onEdit ? handleEdit : undefined}
          editDisabled={isSyncing}
        />

        {/* Sync Status Card */}
        <SyncStatusCard
          integration={integration}
          onSyncNow={handleSyncNow}
          onToggleAutoSync={handleToggleAutoSync}
          disabled={isSyncing}
        />

        {/* Sync History List */}
        <SyncHistoryList storeId={storeId} defaultExpanded={false} />
      </div>

      {/* Edit Connection Modal - Only for file-based connections */}
      {isFileBasedConnection && (
        <EditConnectionModal
          open={isEditModalOpen}
          onOpenChange={setIsEditModalOpen}
          storeId={storeId}
          integration={integration}
          onSaveSuccess={handleEditSaveSuccess}
        />
      )}
    </div>
  );
}

export default ConfiguredStatusView;
