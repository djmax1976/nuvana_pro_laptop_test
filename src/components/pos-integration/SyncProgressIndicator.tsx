/**
 * Sync Progress Indicator Component
 *
 * Displays sync operation progress with multiple states:
 * - In Progress: Progress bar and entity counts
 * - Success: Completion message with entity change details
 * - Partial Success: Warning with failed items list
 * - Failed: Error details with retry option
 *
 * Reference: nuvana_docs/templates/onboarding-ui/states.html lines 175-365
 *
 * Security: FE-005 (UI Security - no secrets exposed)
 *
 * @module components/pos-integration/SyncProgressIndicator
 */

import {
  Loader2,
  Check,
  AlertTriangle,
  X,
  RefreshCw,
  StopCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  POSSyncStatus,
  POSSyncResult,
  SyncEntityResult,
} from "@/types/pos-integration";

// ============================================================================
// Types
// ============================================================================

interface SyncProgressIndicatorProps {
  /** Current sync status */
  status: POSSyncStatus;
  /** Sync result data (when complete) */
  result?: POSSyncResult["data"] | null;
  /** POS system name for display */
  posName: string;
  /** Callback to retry sync */
  onRetry?: () => void;
  /** Callback to retry only failed items */
  onRetryFailed?: () => void;
  /** Whether retry is in progress */
  isRetrying?: boolean;
  /** Optional class name */
  className?: string;
}

interface EntityProgressProps {
  label: string;
  current?: number;
  total?: number;
  status: "pending" | "in_progress" | "complete" | "failed";
  result?: SyncEntityResult;
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Entity progress card showing sync status for a single entity type
 */
function EntityProgress({
  label,
  current,
  total,
  status,
  result,
}: EntityProgressProps): JSX.Element {
  const getStatusColor = () => {
    switch (status) {
      case "complete":
        return "border-green-200 bg-white";
      case "failed":
        return "border-red-200 bg-white";
      case "in_progress":
        return "border-blue-200 bg-white";
      default:
        return "border-blue-200 bg-white";
    }
  };

  const getTextColor = () => {
    switch (status) {
      case "complete":
        return "text-green-600";
      case "failed":
        return "text-red-600";
      default:
        return "text-blue-600";
    }
  };

  const getValueColor = () => {
    switch (status) {
      case "complete":
        return "text-green-800";
      case "failed":
        return "text-red-800";
      default:
        return "text-blue-800";
    }
  };

  return (
    <div className={cn("rounded p-3 border", getStatusColor())}>
      <p className={cn("text-sm", getTextColor())}>{label}</p>
      <p className={cn("font-medium", getValueColor())}>
        {status === "pending"
          ? "Pending..."
          : status === "in_progress" &&
              current !== undefined &&
              total !== undefined
            ? `${current} / ${total}`
            : result
              ? `${result.received} synced`
              : "—"}
      </p>
      {result && status === "complete" && (
        <p className="text-xs mt-1">
          {result.created > 0 && (
            <span className="text-green-600">+{result.created} new</span>
          )}
          {result.updated > 0 && (
            <span className="text-blue-600 ml-2">
              ~{result.updated} updated
            </span>
          )}
          {result.created === 0 && result.updated === 0 && (
            <span className="text-green-600">No changes</span>
          )}
        </p>
      )}
      {result && status === "failed" && result.errors.length > 0 && (
        <p className="text-xs text-red-600 mt-1">
          {result.errors.length} failed
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * Sync progress indicator with comprehensive state display.
 *
 * States:
 * - IN_PROGRESS: Blue background, spinner, progress bar
 * - SUCCESS: Green background, checkmark, entity counts with changes
 * - PARTIAL_SUCCESS: Yellow background, warning icon, failed items list
 * - FAILED: Red background, X icon, error details
 *
 * @example
 * ```tsx
 * <SyncProgressIndicator
 *   status="IN_PROGRESS"
 *   posName="Verifone Commander"
 *   onRetry={handleRetry}
 * />
 * ```
 */
export function SyncProgressIndicator({
  status,
  result,
  posName,
  onRetry,
  onRetryFailed,
  isRetrying = false,
  className,
}: SyncProgressIndicatorProps): JSX.Element {
  // Calculate progress percentage
  const calculateProgress = (): number => {
    if (!result) return 0;
    const entities = [
      result.departments,
      result.tenderTypes,
      result.taxRates,
    ].filter(Boolean);
    if (entities.length === 0) return 0;

    const totalReceived = entities.reduce(
      (sum, e) => sum + (e?.received || 0),
      0,
    );
    const totalProcessed = entities.reduce(
      (sum, e) =>
        sum + (e?.created || 0) + (e?.updated || 0) + (e?.deactivated || 0),
      0,
    );

    return totalReceived > 0
      ? Math.round((totalProcessed / totalReceived) * 100)
      : 0;
  };

  // Count total errors
  const getTotalErrors = (): number => {
    if (!result) return 0;
    return result.errors?.length || 0;
  };

  // Format duration
  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)} seconds`;
  };

  // ============================================================================
  // Render: In Progress State
  // ============================================================================

  if (status === "IN_PROGRESS" || status === "PENDING") {
    const progress = calculateProgress();

    return (
      <div
        className={cn(
          "bg-blue-50 border border-blue-200 rounded-lg p-4",
          className,
        )}
        data-testid="sync-progress-in-progress"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <Loader2
                className="h-5 w-5 text-blue-600 animate-spin"
                aria-hidden="true"
              />
            </div>
            <div>
              <p className="font-medium text-blue-800">
                Syncing data from {posName}...
              </p>
              <p className="text-sm text-blue-600">
                {result?.departments
                  ? `Syncing departments (${result.departments.created + result.departments.updated} of ${result.departments.received})...`
                  : "Initializing sync..."}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled
            className="border-blue-300 text-blue-400 cursor-not-allowed"
          >
            <StopCircle className="mr-1 h-4 w-4" />
            Cancel
          </Button>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex justify-between text-xs text-blue-600 mb-1">
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>

        {/* Entity progress cards */}
        <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
          <EntityProgress
            label="Departments"
            current={result?.departments?.created}
            total={result?.departments?.received}
            status={result?.departments ? "in_progress" : "pending"}
          />
          <EntityProgress label="Tender Types" status="pending" />
          <EntityProgress label="Tax Rates" status="pending" />
        </div>
      </div>
    );
  }

  // ============================================================================
  // Render: Success State
  // ============================================================================

  if (status === "SUCCESS") {
    return (
      <div
        className={cn(
          "bg-green-50 border border-green-200 rounded-lg p-4",
          className,
        )}
        data-testid="sync-progress-success"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <Check className="h-5 w-5 text-green-600" aria-hidden="true" />
            </div>
            <div>
              <p className="font-medium text-green-800">
                Sync Completed Successfully
              </p>
              <p className="text-sm text-green-600">
                Completed in{" "}
                {result?.durationMs ? formatDuration(result.durationMs) : "—"}
              </p>
            </div>
          </div>
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              disabled={isRetrying}
              className="border-green-300 text-green-700 hover:bg-green-50"
            >
              {isRetrying ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-4 w-4" />
              )}
              Sync Again
            </Button>
          )}
        </div>

        {/* Entity result cards */}
        <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
          <EntityProgress
            label="Departments"
            status="complete"
            result={result?.departments}
          />
          <EntityProgress
            label="Tender Types"
            status="complete"
            result={result?.tenderTypes}
          />
          <EntityProgress
            label="Tax Rates"
            status="complete"
            result={result?.taxRates}
          />
        </div>
      </div>
    );
  }

  // ============================================================================
  // Render: Partial Success State
  // ============================================================================

  if (status === "PARTIAL_SUCCESS") {
    const totalErrors = getTotalErrors();

    return (
      <div
        className={cn(
          "bg-yellow-50 border border-yellow-200 rounded-lg p-4",
          className,
        )}
        data-testid="sync-progress-partial"
        role="alert"
        aria-live="polite"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
              <AlertTriangle
                className="h-5 w-5 text-yellow-600"
                aria-hidden="true"
              />
            </div>
            <div>
              <p className="font-medium text-yellow-800">
                Sync Completed with Warnings
              </p>
              <p className="text-sm text-yellow-600">
                {totalErrors} item{totalErrors !== 1 ? "s" : ""} failed to sync
              </p>
            </div>
          </div>
          {onRetryFailed && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetryFailed}
              disabled={isRetrying}
              className="border-yellow-300 text-yellow-700 hover:bg-yellow-50"
            >
              {isRetrying ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-4 w-4" />
              )}
              Retry Failed
            </Button>
          )}
        </div>

        {/* Entity result cards */}
        <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
          <EntityProgress
            label="Departments"
            status={result?.departments?.errors?.length ? "failed" : "complete"}
            result={result?.departments}
          />
          <EntityProgress
            label="Tender Types"
            status={result?.tenderTypes?.errors?.length ? "failed" : "complete"}
            result={result?.tenderTypes}
          />
          <EntityProgress
            label="Tax Rates"
            status={result?.taxRates?.errors?.length ? "failed" : "complete"}
            result={result?.taxRates}
          />
        </div>

        {/* Error details */}
        {result?.errors && result.errors.length > 0 && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded p-3">
            <p className="text-sm font-medium text-red-800 mb-2">
              Failed Items:
            </p>
            <ul className="text-sm text-red-600 space-y-1">
              {result.errors.slice(0, 5).map((error, index) => (
                <li key={index} className="flex items-start gap-2">
                  <X className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <span>
                    {error.entityType} &quot;{error.posCode}&quot; -{" "}
                    {error.error}
                  </span>
                </li>
              ))}
              {result.errors.length > 5 && (
                <li className="text-red-500 italic">
                  ...and {result.errors.length - 5} more
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // Render: Failed State
  // ============================================================================

  return (
    <div
      className={cn(
        "bg-red-50 border border-red-200 rounded-lg p-4",
        className,
      )}
      data-testid="sync-progress-failed"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
            <X className="h-5 w-5 text-red-600" aria-hidden="true" />
          </div>
          <div>
            <p className="font-medium text-red-800">Sync Failed</p>
            <p className="text-sm text-red-600">
              {result?.errorMessage || "Connection lost during sync operation"}
            </p>
          </div>
        </div>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={isRetrying}
            className="border-red-300 text-red-700 hover:bg-red-50"
          >
            {isRetrying ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-4 w-4" />
            )}
            Retry
          </Button>
        )}
      </div>

      {/* Error details */}
      <div className="mt-4 bg-red-100 border border-red-200 rounded p-3">
        <p className="text-sm font-medium text-red-800 mb-1">Error Details:</p>
        <p className="text-sm text-red-600">
          <strong>Error:</strong> {result?.errorCode || "SYNC_FAILED"} -{" "}
          {result?.errorMessage || "Unknown error"}
        </p>
        {result?.departments && (
          <p className="text-sm text-red-600 mt-1">
            <strong>At:</strong> Syncing departments (item{" "}
            {result.departments.created + result.departments.updated} of{" "}
            {result.departments.received})
          </p>
        )}
      </div>
    </div>
  );
}

export default SyncProgressIndicator;
