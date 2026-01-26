/**
 * POS Info Card Component
 *
 * Displays POS integration information including:
 * - POS type name and status badge
 * - Connection type indicator (file, network, cloud)
 * - Connection details (paths, host:port, or API)
 * - Edit button for configuration changes
 *
 * Reference: nuvana_docs/templates/onboarding-ui/states.html
 *
 * Security: FE-005 (UI Security - no secrets exposed), API-008 (Output filtering)
 *
 * @module components/pos-integration/POSInfoCard
 */

import { Check, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getPOSTypeConfig,
  getPOSDisplayName,
  getConnectionCategory,
  getPOSIcon,
} from "@/lib/pos-integration/pos-types";
import type {
  POSIntegration,
  POSConnectionCategory,
} from "@/types/pos-integration";

// ============================================================================
// Types
// ============================================================================

interface POSInfoCardProps {
  /** POS integration data */
  integration: POSIntegration;
  /** Callback when edit button is clicked */
  onEdit?: () => void;
  /** Whether edit is disabled (e.g., during sync) */
  editDisabled?: boolean;
  /** Optional class name */
  className?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get connection type display label
 */
function getConnectionTypeLabel(category: POSConnectionCategory): string {
  switch (category) {
    case "file":
      return "File-based";
    case "network":
      return "Network";
    case "cloud":
      return "Cloud API";
    case "manual":
      return "Manual";
    default:
      return "Unknown";
  }
}

/**
 * Format connection details based on type
 * Security: Never expose credentials, only show connection targets
 *
 * For file-based connections:
 * - Outbox (POS → Nuvana): BOOutbox folder where POS writes, Nuvana reads
 * - Inbox (Nuvana → POS): BOInbox folder where Nuvana writes, POS reads
 */
function formatConnectionDetails(
  integration: POSIntegration,
  category: POSConnectionCategory,
): { label: string; value: string }[] {
  switch (category) {
    case "file":
      return [
        { label: "Outbox", value: integration.xml_gateway_path || "N/A" },
        { label: "Inbox", value: integration.host || "N/A" },
      ];
    case "network":
      return [
        {
          label: "Host",
          value: `${integration.host}:${integration.port}${integration.use_ssl ? " (SSL)" : ""}`,
        },
      ];
    case "cloud":
      return [
        {
          label: "Connection",
          value: `${getPOSDisplayName(integration.pos_type)}`,
        },
      ];
    case "manual":
      return [{ label: "Mode", value: "Manual data entry" }];
    default:
      return [];
  }
}

// ============================================================================
// Component
// ============================================================================

/**
 * POS info card displaying integration details.
 *
 * Shows:
 * - POS type with icon and status badge
 * - Connection type (file/network/cloud/manual)
 * - Connection details appropriate for the type
 * - Edit button for configuration changes
 *
 * Security:
 * - Never displays credentials or secrets
 * - Only shows connection targets (hosts, paths)
 *
 * @example
 * ```tsx
 * <POSInfoCard
 *   integration={posIntegration}
 *   onEdit={() => setEditMode(true)}
 * />
 * ```
 */
export function POSInfoCard({
  integration,
  onEdit,
  editDisabled = false,
  className,
}: POSInfoCardProps): JSX.Element {
  const posConfig = getPOSTypeConfig(integration.pos_type);
  const connectionCategory = getConnectionCategory(integration.pos_type);
  const connectionDetails = formatConnectionDetails(
    integration,
    connectionCategory,
  );
  const iconClass = getPOSIcon(integration.pos_type);

  return (
    <div
      className={cn("bg-white rounded-lg border shadow-sm", className)}
      data-testid="pos-info-card"
    >
      {/* Header: POS Type and Status */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          {/* Status icon */}
          <div
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center",
              integration.is_active ? "bg-green-100" : "bg-gray-100",
            )}
          >
            {integration.is_active ? (
              <Check className="h-4 w-4 text-green-600" aria-hidden="true" />
            ) : (
              <i
                className={cn("fas", iconClass, "text-gray-400")}
                aria-hidden="true"
              />
            )}
          </div>

          {/* POS Name and Type */}
          <div>
            <h3 className="font-semibold text-gray-800 uppercase tracking-wide text-sm">
              {posConfig.name}
            </h3>
            <p className="text-sm text-gray-500">
              {getConnectionTypeLabel(connectionCategory)} •{" "}
              <span
                className={cn(
                  "font-medium",
                  integration.is_active ? "text-green-600" : "text-gray-400",
                )}
              >
                {integration.is_active ? "Connected" : "Inactive"}
              </span>
            </p>
          </div>
        </div>

        {/* Edit Button */}
        {onEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            disabled={editDisabled}
            className="text-gray-500 hover:text-gray-700"
            data-testid="pos-info-edit-button"
          >
            <Edit2 className="h-4 w-4 mr-1" />
            Edit
          </Button>
        )}
      </div>

      {/* Connection Details */}
      <div className="p-4 space-y-2">
        {connectionDetails.map((detail, index) => (
          <div key={index} className="flex items-start gap-2 text-sm">
            <span className="text-gray-500 min-w-[60px]">{detail.label}:</span>
            <span
              className="text-gray-700 font-mono text-xs break-all"
              title={detail.value}
            >
              {detail.value}
            </span>
          </div>
        ))}

        {/* Additional Info for File-based */}
        {connectionCategory === "file" && integration.naxml_version && (
          <div className="flex items-start gap-2 text-sm">
            <span className="text-gray-500 min-w-[60px]">NAXML:</span>
            <span className="text-gray-700">v{integration.naxml_version}</span>
          </div>
        )}

        {/* Timeout info */}
        {connectionCategory === "network" && (
          <div className="flex items-start gap-2 text-sm">
            <span className="text-gray-500 min-w-[60px]">Timeout:</span>
            <span className="text-gray-700">{integration.timeout}ms</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default POSInfoCard;
