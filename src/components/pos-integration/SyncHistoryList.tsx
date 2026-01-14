/**
 * Sync History List Component
 *
 * Displays collapsible sync history with:
 * - Expandable/collapsible header
 * - Paginated sync log entries
 * - Status icons and timestamps
 * - Entity counts per sync
 * - Error details for failed syncs
 *
 * Reference: nuvana_docs/templates/onboarding-ui/states.html
 *
 * Security: FE-005 (UI Security), API-008 (Output filtering)
 *
 * @module components/pos-integration/SyncHistoryList
 */

import { useState, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  Check,
  X,
  AlertTriangle,
  Clock,
  Loader2,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePOSSyncLogs } from "@/lib/api/pos-integration";
import type { POSSyncLog, POSSyncStatus } from "@/types/pos-integration";

// ============================================================================
// Types
// ============================================================================

interface SyncHistoryListProps {
  /** Store ID for fetching logs */
  storeId: string;
  /** Initial expanded state */
  defaultExpanded?: boolean;
  /** Optional class name */
  className?: string;
}

interface SyncLogEntryProps {
  /** Sync log entry data */
  log: POSSyncLog;
}

// ============================================================================
// Constants
// ============================================================================

const LOGS_PER_PAGE = 10;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format timestamp for display
 */
function formatTimestamp(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return `Today ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Get status display info
 */
function getStatusInfo(status: POSSyncStatus): {
  icon: JSX.Element;
  label: string;
  colorClass: string;
} {
  switch (status) {
    case "SUCCESS":
      return {
        icon: <Check className="h-4 w-4" />,
        label: "Success",
        colorClass: "text-green-600",
      };
    case "PARTIAL_SUCCESS":
      return {
        icon: <AlertTriangle className="h-4 w-4" />,
        label: "Partial",
        colorClass: "text-yellow-600",
      };
    case "FAILED":
      return {
        icon: <X className="h-4 w-4" />,
        label: "Failed",
        colorClass: "text-red-600",
      };
    case "CONNECTION_ERROR":
      return {
        icon: <X className="h-4 w-4" />,
        label: "Connection Error",
        colorClass: "text-red-600",
      };
    case "AUTH_ERROR":
      return {
        icon: <X className="h-4 w-4" />,
        label: "Auth Error",
        colorClass: "text-red-600",
      };
    case "TIMEOUT":
      return {
        icon: <Clock className="h-4 w-4" />,
        label: "Timeout",
        colorClass: "text-orange-600",
      };
    case "IN_PROGRESS":
    case "PENDING":
      return {
        icon: <Loader2 className="h-4 w-4 animate-spin" />,
        label: "In Progress",
        colorClass: "text-blue-600",
      };
    default:
      return {
        icon: <Clock className="h-4 w-4" />,
        label: "Unknown",
        colorClass: "text-gray-400",
      };
  }
}

/**
 * Format entity counts for display
 */
function formatEntityCounts(log: POSSyncLog): string {
  const parts: string[] = [];

  if (log.departments_synced > 0) {
    parts.push(`${log.departments_synced} dept`);
  }
  if (log.tender_types_synced > 0) {
    parts.push(`${log.tender_types_synced} tnd`);
  }
  if (log.tax_rates_synced > 0) {
    parts.push(`${log.tax_rates_synced} tax`);
  }

  return parts.length > 0 ? parts.join(", ") : "No data synced";
}

/**
 * Format duration for display
 */
function formatDuration(ms: number | null | undefined): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Individual sync log entry row
 */
function SyncLogEntry({ log }: SyncLogEntryProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const statusInfo = getStatusInfo(log.status);
  const hasError = log.error_message || log.error_code;
  const isExpandable = hasError || log.triggered_by_user;

  return (
    <div
      className={cn(
        "border-b border-gray-100 last:border-b-0",
        isExpandable && "cursor-pointer hover:bg-gray-50",
      )}
      data-testid="sync-log-entry"
    >
      {/* Main Row */}
      <div
        className="flex items-center justify-between py-3 px-4"
        onClick={() => isExpandable && setExpanded(!expanded)}
        role={isExpandable ? "button" : undefined}
        tabIndex={isExpandable ? 0 : undefined}
        onKeyDown={(e) => {
          if (isExpandable && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Expand/Collapse Icon */}
          {isExpandable && (
            <span className="text-gray-400 flex-shrink-0">
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </span>
          )}

          {/* Timestamp */}
          <span className="text-sm text-gray-600 whitespace-nowrap">
            {formatTimestamp(log.started_at)}
          </span>

          {/* Status */}
          <span
            className={cn(
              "flex items-center gap-1 text-sm font-medium",
              statusInfo.colorClass,
            )}
          >
            {statusInfo.icon}
            <span className="hidden sm:inline">{statusInfo.label}</span>
          </span>

          {/* Trigger Type Badge */}
          {log.trigger_type === "MANUAL" && (
            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
              Manual
            </span>
          )}
        </div>

        {/* Entity Counts / Error */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          {hasError ? (
            <span className="text-red-600 truncate max-w-[200px]">
              {log.error_message || log.error_code}
            </span>
          ) : (
            <span>{formatEntityCounts(log)}</span>
          )}
          <span className="text-gray-400 text-xs hidden sm:inline">
            {formatDuration(log.duration_ms)}
          </span>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && isExpandable && (
        <div className="px-4 pb-3 pt-1 bg-gray-50 text-sm space-y-2">
          {/* Triggered By */}
          {log.triggered_by_user && (
            <div className="flex items-center gap-2 text-gray-600">
              <User className="h-4 w-4 text-gray-400" />
              <span>
                Triggered by{" "}
                <span className="font-medium">
                  {log.triggered_by_user.name}
                </span>
              </span>
            </div>
          )}

          {/* Error Details */}
          {log.error_message && (
            <div className="bg-red-50 border border-red-200 rounded p-2 text-red-600">
              <strong>Error:</strong> {log.error_message}
              {log.error_code && (
                <span className="block text-xs text-red-500 mt-1">
                  Code: {log.error_code}
                </span>
              )}
            </div>
          )}

          {/* Detailed Counts */}
          {!hasError && (
            <div className="grid grid-cols-3 gap-4 text-gray-600">
              <div>
                <span className="text-gray-400">Created:</span>{" "}
                <span className="font-medium">{log.entities_created}</span>
              </div>
              <div>
                <span className="text-gray-400">Updated:</span>{" "}
                <span className="font-medium">{log.entities_updated}</span>
              </div>
              <div>
                <span className="text-gray-400">Deactivated:</span>{" "}
                <span className="font-medium">{log.entities_deactivated}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * Collapsible sync history list with pagination.
 *
 * Features:
 * - Expandable/collapsible header
 * - Paginated sync log entries
 * - Status icons and timestamps
 * - Entity counts per sync
 * - Error details for failed syncs
 * - Triggered-by user info for manual syncs
 *
 * @example
 * ```tsx
 * <SyncHistoryList
 *   storeId={storeId}
 *   defaultExpanded={true}
 * />
 * ```
 */
export function SyncHistoryList({
  storeId,
  defaultExpanded = false,
  className,
}: SyncHistoryListProps): JSX.Element {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [offset, setOffset] = useState(0);

  // Fetch sync logs
  const {
    data: logsResponse,
    isLoading,
    isFetching,
    error,
  } = usePOSSyncLogs(
    storeId,
    { limit: LOGS_PER_PAGE, offset },
    { enabled: expanded },
  );

  const logs = logsResponse?.data || [];
  const hasMore = logsResponse?.meta?.hasMore || false;
  const total = logsResponse?.meta?.total || 0;

  /**
   * Toggle expanded state
   */
  const handleToggle = useCallback(() => {
    setExpanded(!expanded);
  }, [expanded]);

  /**
   * Load next page
   */
  const handleLoadMore = useCallback(() => {
    setOffset((prev) => prev + LOGS_PER_PAGE);
  }, []);

  /**
   * Load previous page
   */
  const handleLoadPrevious = useCallback(() => {
    setOffset((prev) => Math.max(0, prev - LOGS_PER_PAGE));
  }, []);

  return (
    <div
      className={cn("bg-white rounded-lg border shadow-sm", className)}
      data-testid="sync-history-list"
    >
      {/* Header */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
        aria-expanded={expanded}
        data-testid="sync-history-toggle"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
          <span className="text-sm font-medium text-gray-500 uppercase tracking-wide">
            Sync History
          </span>
          {total > 0 && (
            <span className="text-xs text-gray-400">({total} total)</span>
          )}
        </div>
        {isFetching && !isLoading && (
          <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
        )}
      </button>

      {/* Content */}
      {expanded && (
        <div className="border-t">
          {/* Loading State */}
          {isLoading && (
            <div className="p-8 text-center">
              <Loader2 className="h-6 w-6 text-gray-400 animate-spin mx-auto" />
              <p className="text-sm text-gray-500 mt-2">
                Loading sync history...
              </p>
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <div className="p-4">
              <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-600">
                Failed to load sync history. Please try again.
              </div>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && logs.length === 0 && (
            <div className="p-8 text-center">
              <Clock className="h-8 w-8 text-gray-300 mx-auto" />
              <p className="text-sm text-gray-500 mt-2">No sync history yet</p>
            </div>
          )}

          {/* Log Entries */}
          {!isLoading && !error && logs.length > 0 && (
            <>
              <div className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <SyncLogEntry key={log.sync_log_id} log={log} />
                ))}
              </div>

              {/* Pagination */}
              {(hasMore || offset > 0) && (
                <div className="flex items-center justify-between p-3 border-t bg-gray-50">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLoadPrevious}
                    disabled={offset === 0 || isFetching}
                    className="text-gray-600"
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-gray-500">
                    Showing {offset + 1}-{Math.min(offset + logs.length, total)}{" "}
                    of {total}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLoadMore}
                    disabled={!hasMore || isFetching}
                    className="text-gray-600"
                  >
                    {isFetching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Next"
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default SyncHistoryList;
