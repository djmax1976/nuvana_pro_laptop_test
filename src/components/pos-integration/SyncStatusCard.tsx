/**
 * Sync Status Card Component
 *
 * Displays current sync status including:
 * - Last sync time and status
 * - Entity counts (departments, tender types, tax rates)
 * - Sync Now button
 * - Auto-sync toggle with interval display
 *
 * Reference: nuvana_docs/templates/onboarding-ui/states.html lines 228-271
 *
 * Security: FE-005 (UI Security), FE-001 (State Management)
 *
 * @module components/pos-integration/SyncStatusCard
 */

import { useState, useCallback } from "react";
import { RefreshCw, Check, X, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatSyncInterval } from "@/lib/pos-integration/pos-types";
import { SyncProgressIndicator } from "./SyncProgressIndicator";
import type {
  POSIntegration,
  POSSyncStatus,
  POSSyncResult,
} from "@/types/pos-integration";

// ============================================================================
// Types
// ============================================================================

interface SyncStatusCardProps {
  /** POS integration data */
  integration: POSIntegration;
  /** Callback to trigger manual sync */
  onSyncNow: () => Promise<POSSyncResult>;
  /** Callback to toggle auto-sync */
  onToggleAutoSync: (enabled: boolean) => Promise<void>;
  /** Whether operations are disabled (e.g., during edit) */
  disabled?: boolean;
  /** Optional class name */
  className?: string;
}

interface EntityCountProps {
  label: string;
  count: number | null;
  synced: boolean;
  status?: POSSyncStatus | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format last sync time for display
 */
function formatLastSyncTime(dateString: string | null | undefined): string {
  if (!dateString) return "Never";

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  // Today
  if (diffDays === 0) {
    if (diffMins < 1) return "Just now";
    if (diffMins < 60)
      return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
    return `Today at ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }

  // Yesterday
  if (diffDays === 1) {
    return `Yesterday at ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }

  // Older
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Get status icon based on sync status
 */
function getStatusIcon(status: POSSyncStatus | null | undefined): JSX.Element {
  switch (status) {
    case "SUCCESS":
      return <Check className="h-4 w-4 text-green-600" />;
    case "PARTIAL_SUCCESS":
      return <Clock className="h-4 w-4 text-yellow-600" />;
    case "FAILED":
    case "CONNECTION_ERROR":
    case "AUTH_ERROR":
    case "TIMEOUT":
      return <X className="h-4 w-4 text-red-600" />;
    case "IN_PROGRESS":
    case "PENDING":
      return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
    default:
      return <Clock className="h-4 w-4 text-gray-400" />;
  }
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Entity count display with sync status
 */
function EntityCount({
  label,
  count,
  synced,
  status,
}: EntityCountProps): JSX.Element {
  const isSuccess = status === "SUCCESS" || status === "PARTIAL_SUCCESS";

  // Determine what text to show
  let displayText: string;
  if (!synced) {
    displayText = `${label} (disabled)`;
  } else if (count !== null) {
    displayText = `${count} ${label}`;
  } else if (isSuccess) {
    displayText = `${label} (synced)`;
  } else {
    displayText = `${label} (pending)`;
  }

  return (
    <div className="flex items-center gap-2">
      {synced ? (
        isSuccess ? (
          <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
        ) : (
          <X className="h-4 w-4 text-red-600 flex-shrink-0" />
        )
      ) : (
        <span className="w-4 h-4 flex items-center justify-center text-gray-400">
          —
        </span>
      )}
      <span
        className={cn("text-sm", synced ? "text-gray-700" : "text-gray-400")}
      >
        {displayText}
      </span>
    </div>
  );
}

// ============================================================================
// Component
// ============================================================================

/**
 * Sync status card with last sync info and controls.
 *
 * Features:
 * - Last sync time with relative formatting
 * - Entity counts with sync status indicators
 * - Sync Now button with loading state
 * - Auto-sync toggle with interval display
 *
 * @example
 * ```tsx
 * <SyncStatusCard
 *   integration={posIntegration}
 *   onSyncNow={handleSyncNow}
 *   onToggleAutoSync={handleToggleAutoSync}
 * />
 * ```
 */
export function SyncStatusCard({
  integration,
  onSyncNow,
  onToggleAutoSync,
  disabled = false,
  className,
}: SyncStatusCardProps): JSX.Element {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTogglingAutoSync, setIsTogglingAutoSync] = useState(false);
  const [syncResult, setSyncResult] = useState<POSSyncResult["data"] | null>(
    null,
  );
  const [showProgress, setShowProgress] = useState(false);

  /**
   * Handle sync now button click
   */
  const handleSyncNow = useCallback(async () => {
    setIsSyncing(true);
    setShowProgress(true);
    setSyncResult(null);

    try {
      const result = await onSyncNow();
      setSyncResult(result.data);
    } catch (error) {
      // Error is handled by parent, we just update state
      setSyncResult({
        status: "FAILED",
        durationMs: 0,
        errors: [],
        errorMessage: error instanceof Error ? error.message : "Sync failed",
        errorCode: "SYNC_ERROR",
      });
    } finally {
      setIsSyncing(false);
    }
  }, [onSyncNow]);

  /**
   * Handle auto-sync toggle
   */
  const handleToggleAutoSync = useCallback(
    async (checked: boolean) => {
      setIsTogglingAutoSync(true);
      try {
        await onToggleAutoSync(checked);
      } finally {
        setIsTogglingAutoSync(false);
      }
    },
    [onToggleAutoSync],
  );

  /**
   * Handle retry from progress indicator
   */
  const handleRetry = useCallback(async () => {
    await handleSyncNow();
  }, [handleSyncNow]);

  /**
   * Dismiss progress indicator
   */
  const handleDismissProgress = useCallback(() => {
    setShowProgress(false);
    setSyncResult(null);
  }, []);

  // Determine if we should show progress indicator
  const shouldShowProgress = showProgress && (isSyncing || syncResult);

  return (
    <div
      className={cn("bg-white rounded-lg border shadow-sm", className)}
      data-testid="sync-status-card"
    >
      {/* Header: Last Sync and Sync Now */}
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
            Last Sync
          </h3>
          <div className="flex items-center gap-2 mt-1">
            {getStatusIcon(integration.last_sync_status)}
            <span className="text-gray-800 font-medium">
              {formatLastSyncTime(integration.last_sync_at)}
            </span>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleSyncNow}
          disabled={disabled || isSyncing}
          className="text-blue-600 border-blue-200 hover:bg-blue-50"
          data-testid="sync-now-button"
        >
          {isSyncing ? (
            <>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <RefreshCw className="mr-1 h-4 w-4" />
              Sync Now
            </>
          )}
        </Button>
      </div>

      {/* Sync Progress Indicator (when syncing or showing result) */}
      {shouldShowProgress && (
        <div className="p-4 border-b">
          <SyncProgressIndicator
            status={isSyncing ? "IN_PROGRESS" : syncResult?.status || "PENDING"}
            result={syncResult}
            posName={integration.pos_name || integration.pos_type}
            onRetry={handleRetry}
            isRetrying={isSyncing}
          />
          {!isSyncing && syncResult && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismissProgress}
              className="mt-2 text-gray-500 text-xs"
            >
              Dismiss
            </Button>
          )}
        </div>
      )}

      {/* Entity Counts */}
      <div className="p-4 border-b">
        <div className="space-y-2">
          <EntityCount
            label="Departments"
            count={syncResult?.departments?.received ?? null}
            synced={integration.sync_departments}
            status={integration.last_sync_status}
          />
          <EntityCount
            label="Tender Types"
            count={syncResult?.tenderTypes?.received ?? null}
            synced={integration.sync_tender_types}
            status={integration.last_sync_status}
          />
          <EntityCount
            label="Tax Rates"
            count={syncResult?.taxRates?.received ?? null}
            synced={integration.sync_tax_rates}
            status={integration.last_sync_status}
          />
        </div>
      </div>

      {/* Auto-Sync Toggle */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label htmlFor="auto-sync-toggle" className="text-sm text-gray-700">
            Auto-Sync:
          </Label>
          <span className="text-sm text-gray-500">
            {integration.sync_enabled
              ? formatSyncInterval(integration.sync_interval_mins)
              : "Disabled"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isTogglingAutoSync && (
            <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
          )}
          <Switch
            id="auto-sync-toggle"
            checked={integration.sync_enabled}
            onCheckedChange={handleToggleAutoSync}
            disabled={disabled || isTogglingAutoSync}
            data-testid="auto-sync-toggle"
          />
        </div>
      </div>

      {/* Last Sync Error (if any) */}
      {integration.last_sync_status &&
        ["FAILED", "CONNECTION_ERROR", "AUTH_ERROR", "TIMEOUT"].includes(
          integration.last_sync_status,
        ) &&
        integration.last_sync_error && (
          <div className="px-4 pb-4">
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-600">
              <strong>Last Error:</strong> {integration.last_sync_error}
            </div>
          </div>
        )}
    </div>
  );
}

export default SyncStatusCard;
