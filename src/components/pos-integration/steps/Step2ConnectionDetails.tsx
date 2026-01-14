/**
 * Step 2: Connection Details Component
 *
 * Second step of the wizard - displays dynamic connection form based on POS type.
 * Includes Test Connection functionality before allowing progression.
 *
 * Reference: nuvana_docs/templates/onboarding-ui/index.html lines 104-179
 *
 * Security: SEC-014 (input validation), FE-002 (form validation)
 *
 * @module components/pos-integration/steps/Step2ConnectionDetails
 */

import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  POSSystemType,
  POSConnectionCategory,
  FileConnectionConfig,
  NetworkConnectionConfig,
  CloudConnectionConfig,
  POSConnectionTestResult,
} from "@/types/pos-integration";
import { FileConnectionForm } from "../forms/FileConnectionForm";
import { NetworkConnectionForm } from "../forms/NetworkConnectionForm";
import { CloudConnectionForm } from "../forms/CloudConnectionForm";
import { ManualConnectionInfo } from "../forms/ManualConnectionInfo";
import { TestConnectionButton } from "../TestConnectionButton";

// ============================================================================
// Types
// ============================================================================

interface Step2ConnectionDetailsProps {
  /** Selected POS type */
  posType: POSSystemType;
  /** Connection category (file, network, cloud, manual) */
  connectionCategory: POSConnectionCategory;
  /** File connection config */
  fileConfig: FileConnectionConfig;
  /** Network connection config */
  networkConfig: NetworkConnectionConfig;
  /** Cloud connection config */
  cloudConfig: CloudConnectionConfig;
  /** Callback for file config changes */
  onFileConfigChange: (config: Partial<FileConnectionConfig>) => void;
  /** Callback for network config changes */
  onNetworkConfigChange: (config: Partial<NetworkConnectionConfig>) => void;
  /** Callback for cloud config changes */
  onCloudConfigChange: (config: Partial<CloudConnectionConfig>) => void;
  /** Connection test handler */
  onTestConnection: () => void;
  /** Whether connection test is in progress */
  isTestingConnection: boolean;
  /** Connection test result */
  connectionTestResult: POSConnectionTestResult | null;
  /** Whether next button should be enabled */
  canProceed: boolean;
  /** Callback to proceed to next step */
  onNext: () => void;
  /** Callback to go back to previous step */
  onBack: () => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get connection description text based on category
 */
function getConnectionDescription(category: POSConnectionCategory): string {
  switch (category) {
    case "file":
      return "Enter the file exchange paths configured on your POS";
    case "network":
      return "Enter the network connection details for your POS";
    case "cloud":
      return "Enter your cloud POS API credentials";
    case "manual":
      return "Manual entry requires no connection setup";
  }
}

// ============================================================================
// Component
// ============================================================================

/**
 * Connection details step with dynamic form based on POS type.
 *
 * Renders appropriate form:
 * - File-based: Export/Import paths
 * - Network: Host/Port/SSL
 * - Cloud: API Key
 * - Manual: Info message only
 *
 * Includes Test Connection button (except for manual) that must succeed
 * before allowing progression to next step.
 *
 * @example
 * ```tsx
 * <Step2ConnectionDetails
 *   posType={state.selectedPOS}
 *   connectionCategory={connectionCategory}
 *   fileConfig={state.fileConfig}
 *   networkConfig={state.networkConfig}
 *   cloudConfig={state.cloudConfig}
 *   onFileConfigChange={updateFileConfig}
 *   onNetworkConfigChange={updateNetworkConfig}
 *   onCloudConfigChange={updateCloudConfig}
 *   onTestConnection={handleTestConnection}
 *   isTestingConnection={testMutation.isPending}
 *   connectionTestResult={state.connectionTestResult}
 *   canProceed={canGoNext}
 *   onNext={goNext}
 *   onBack={goBack}
 * />
 * ```
 */
export function Step2ConnectionDetails({
  posType,
  connectionCategory,
  fileConfig,
  networkConfig,
  cloudConfig,
  onFileConfigChange,
  onNetworkConfigChange,
  onCloudConfigChange,
  onTestConnection,
  isTestingConnection,
  connectionTestResult,
  canProceed,
  onNext,
  onBack,
}: Step2ConnectionDetailsProps): JSX.Element {
  const showTestConnection = connectionCategory !== "manual";

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <h2 className="text-lg font-medium text-gray-800 mb-2">
        Connection Details
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        {getConnectionDescription(connectionCategory)}
      </p>

      {/* Dynamic Form Based on Connection Type */}
      {connectionCategory === "file" && (
        <FileConnectionForm
          config={fileConfig}
          posType={posType}
          onChange={onFileConfigChange}
        />
      )}

      {connectionCategory === "network" && (
        <NetworkConnectionForm
          config={networkConfig}
          posType={posType}
          onChange={onNetworkConfigChange}
        />
      )}

      {connectionCategory === "cloud" && (
        <CloudConnectionForm
          config={cloudConfig}
          posType={posType}
          onChange={onCloudConfigChange}
        />
      )}

      {connectionCategory === "manual" && <ManualConnectionInfo />}

      {/* Test Connection Section */}
      {showTestConnection && (
        <div className="mt-6 pt-6 border-t">
          <TestConnectionButton
            onTest={onTestConnection}
            isLoading={isTestingConnection}
            result={connectionTestResult}
          />
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <Button
          variant="outline"
          onClick={onBack}
          className="px-6"
          data-testid="step2-back-button"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={onNext}
          disabled={!canProceed}
          className={cn(
            "px-6",
            canProceed
              ? "bg-blue-600 hover:bg-blue-700 text-white"
              : "bg-gray-300 text-gray-500 cursor-not-allowed",
          )}
          data-testid="step2-next-button"
        >
          Next
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default Step2ConnectionDetails;
