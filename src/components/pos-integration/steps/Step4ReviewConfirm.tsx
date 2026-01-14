/**
 * Step 4: Review & Confirm Component
 *
 * Final step of the wizard - displays summary of all configuration
 * and allows user to confirm and save.
 *
 * Reference: nuvana_docs/templates/onboarding-ui/index.html lines 290-332
 *
 * @module components/pos-integration/steps/Step4ReviewConfirm
 */

import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  POSSystemType,
  POSConnectionCategory,
  FileConnectionConfig,
  NetworkConnectionConfig,
  CloudConnectionConfig,
  SyncOptionsConfig,
} from "@/types/pos-integration";
import {
  getPOSDisplayName,
  getCloudProvider,
  formatSyncInterval,
} from "@/lib/pos-integration/pos-types";

// ============================================================================
// Types
// ============================================================================

interface Step4ReviewConfirmProps {
  /** Selected POS type */
  posType: POSSystemType;
  /** Connection category */
  connectionCategory: POSConnectionCategory;
  /** File connection config */
  fileConfig: FileConnectionConfig;
  /** Network connection config */
  networkConfig: NetworkConnectionConfig;
  /** Cloud connection config */
  cloudConfig: CloudConnectionConfig;
  /** Sync options */
  syncOptions: SyncOptionsConfig;
  /** Whether form is being submitted */
  isSubmitting: boolean;
  /** Callback to save configuration */
  onSave: () => void;
  /** Callback to go back to previous step */
  onBack: () => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build connection summary text based on category and config
 */
function getConnectionSummary(
  category: POSConnectionCategory,
  posType: POSSystemType,
  fileConfig: FileConnectionConfig,
  networkConfig: NetworkConnectionConfig,
  _cloudConfig: CloudConnectionConfig,
): string {
  switch (category) {
    case "file":
      return fileConfig.exportPath || "File exchange configured";
    case "network":
      return `${networkConfig.host}:${networkConfig.port}`;
    case "cloud":
      return `${getCloudProvider(posType) || "Cloud"} API`;
    case "manual":
      return "Manual entry";
  }
}

/**
 * Build sync entities summary text
 */
function getSyncEntitiesSummary(syncOptions: SyncOptionsConfig): string {
  const entities: string[] = [];
  if (syncOptions.syncDepartments) entities.push("Departments");
  if (syncOptions.syncTenders) entities.push("Tenders");
  if (syncOptions.syncTaxRates) entities.push("Taxes");
  return entities.length > 0 ? entities.join(", ") : "None selected";
}

/**
 * Build schedule summary text
 */
function getScheduleSummary(syncOptions: SyncOptionsConfig): string {
  if (!syncOptions.autoSyncEnabled) {
    return "Manual only";
  }
  return formatSyncInterval(syncOptions.syncIntervalMinutes);
}

// ============================================================================
// Component
// ============================================================================

/**
 * Review and confirm step with summary display.
 *
 * Shows:
 * - POS System name
 * - Connection details (path, host:port, or provider)
 * - Data entities to sync
 * - Auto-sync schedule
 *
 * Has Back button (gray) and Save & Start Syncing button (green).
 *
 * @example
 * ```tsx
 * <Step4ReviewConfirm
 *   posType={state.selectedPOS}
 *   connectionCategory={connectionCategory}
 *   fileConfig={state.fileConfig}
 *   networkConfig={state.networkConfig}
 *   cloudConfig={state.cloudConfig}
 *   syncOptions={state.syncOptions}
 *   isSubmitting={state.isSubmitting}
 *   onSave={handleSave}
 *   onBack={goBack}
 * />
 * ```
 */
export function Step4ReviewConfirm({
  posType,
  connectionCategory,
  fileConfig,
  networkConfig,
  cloudConfig,
  syncOptions,
  isSubmitting,
  onSave,
  onBack,
}: Step4ReviewConfirmProps): JSX.Element {
  const summaryItems = [
    {
      label: "POS System",
      value: getPOSDisplayName(posType),
    },
    {
      label: "Connection",
      value: getConnectionSummary(
        connectionCategory,
        posType,
        fileConfig,
        networkConfig,
        cloudConfig,
      ),
    },
    {
      label: "Data to Sync",
      value: getSyncEntitiesSummary(syncOptions),
    },
    {
      label: "Auto-Sync",
      value: getScheduleSummary(syncOptions),
    },
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <h2 className="text-lg font-medium text-gray-800 mb-2">
        Review & Confirm
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        Review your settings before saving
      </p>

      {/* Summary */}
      <div className="space-y-4 mb-6">
        {summaryItems.map((item, index) => (
          <div
            key={item.label}
            className={`flex items-center justify-between py-3 ${
              index < summaryItems.length - 1 ? "border-b" : ""
            }`}
            data-testid={`summary-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <span className="text-sm text-gray-500">{item.label}</span>
            <span className="font-medium text-gray-800">{item.value}</span>
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={isSubmitting}
          className="px-6"
          data-testid="step4-back-button"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={onSave}
          disabled={isSubmitting}
          className="px-6 bg-green-600 hover:bg-green-700 text-white"
          data-testid="step4-save-button"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check className="mr-2 h-4 w-4" />
              Save & Start Syncing
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export default Step4ReviewConfirm;
