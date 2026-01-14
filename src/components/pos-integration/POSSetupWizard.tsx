/**
 * POS Setup Wizard Component
 *
 * Main container for the 4-step POS integration setup wizard.
 * Orchestrates all wizard steps and manages state transitions.
 *
 * Reference: nuvana_docs/templates/onboarding-ui/index.html
 *
 * Security: FE-002 (form validation), SEC-014 (input validation)
 *
 * @module components/pos-integration/POSSetupWizard
 */

import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  useCreatePOSIntegration,
  useTestPOSConnection,
  useTriggerPOSSync,
  getErrorMessage,
} from "@/lib/api/pos-integration";
import { usePOSSetupWizard } from "./hooks/usePOSSetupWizard";
import { StepIndicator } from "./steps/StepIndicator";
import { Step1POSSelector } from "./steps/Step1POSSelector";
import { Step2ConnectionDetails } from "./steps/Step2ConnectionDetails";
import { Step3SyncOptions } from "./steps/Step3SyncOptions";
import { Step4ReviewConfirm } from "./steps/Step4ReviewConfirm";
import { SetupSuccessState } from "./SetupSuccessState";
import type { CreatePOSIntegrationRequest } from "@/types/pos-integration";

// ============================================================================
// Types
// ============================================================================

interface POSSetupWizardProps {
  /** Store ID for the integration */
  storeId: string;
  /** Callback when setup is complete */
  onComplete?: () => void;
  /** Callback when user cancels */
  onCancel?: () => void;
}

// ============================================================================
// Component
// ============================================================================

/**
 * 4-step wizard for configuring POS integration.
 *
 * Steps:
 * 1. POS System Selection
 * 2. Connection Details (dynamic based on POS type)
 * 3. Sync Options (entities and schedule)
 * 4. Review & Confirm
 *
 * After successful save, shows success state with first sync progress.
 *
 * @example
 * ```tsx
 * <POSSetupWizard
 *   storeId={storeId}
 *   onComplete={() => setShowConfiguredView(true)}
 *   onCancel={() => router.back()}
 * />
 * ```
 */
export function POSSetupWizard({
  storeId,
  onComplete,
}: POSSetupWizardProps): JSX.Element {
  const { toast } = useToast();
  const [showSuccess, setShowSuccess] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Wizard state management
  const {
    state,
    goNext,
    goBack,
    selectPOS,
    updateFileConfig,
    updateNetworkConfig,
    updateCloudConfig,
    updateSyncOptions,
    setConnectionTestResult,
    setSubmitting,
    setError,
    canGoNext,
    connectionCategory,
    buildCreateRequest,
    initSelectedItemsFromPreview,
    toggleItemSelection,
    selectAllItems,
    deselectAllItems,
  } = usePOSSetupWizard();

  // API mutations
  const testConnectionMutation = useTestPOSConnection();
  const createIntegrationMutation = useCreatePOSIntegration();
  const triggerSyncMutation = useTriggerPOSSync();

  /**
   * Handle connection test
   * Builds test config from current state and calls API
   */
  const handleTestConnection = useCallback(async () => {
    if (!state.selectedPOS) return;

    try {
      const testConfig = buildCreateRequest();
      if (!testConfig) {
        toast({
          title: "Configuration Error",
          description: "Unable to build connection configuration",
          variant: "destructive",
        });
        return;
      }

      const result = await testConnectionMutation.mutateAsync({
        storeId,
        config: testConfig,
      });

      setConnectionTestResult(result);

      if (!result.success || !result.data.connected) {
        toast({
          title: "Connection Failed",
          description: result.data.message || "Could not connect to POS system",
          variant: "destructive",
        });
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      setConnectionTestResult({
        success: false,
        data: {
          connected: false,
          message: errorMessage,
          errorCode: "CONNECTION_ERROR",
        },
      });
      toast({
        title: "Connection Test Failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  }, [
    state.selectedPOS,
    storeId,
    buildCreateRequest,
    testConnectionMutation,
    setConnectionTestResult,
    toast,
  ]);

  /**
   * Handle save configuration
   * Creates integration and triggers initial sync
   */
  const handleSave = useCallback(async () => {
    const createRequest = buildCreateRequest();
    if (!createRequest) {
      toast({
        title: "Configuration Error",
        description: "Unable to build configuration request",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Create the integration
      await createIntegrationMutation.mutateAsync({
        storeId,
        data: createRequest,
      });

      // Show success state
      setShowSuccess(true);
      setIsSyncing(true);

      // Trigger initial sync (non-blocking)
      try {
        await triggerSyncMutation.mutateAsync({
          storeId,
          options: {
            sync_departments: state.syncOptions.syncDepartments,
            sync_tender_types: state.syncOptions.syncTenders,
            sync_tax_rates: state.syncOptions.syncTaxRates,
          },
        });
        setIsSyncing(false);
      } catch (syncError) {
        // Sync failure doesn't fail the setup
        console.warn("Initial sync failed:", syncError);
        setIsSyncing(false);
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      setError(errorMessage);
      toast({
        title: "Failed to Save Configuration",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    storeId,
    buildCreateRequest,
    createIntegrationMutation,
    triggerSyncMutation,
    state.syncOptions,
    setSubmitting,
    setError,
    toast,
  ]);

  /**
   * Handle view settings from success state
   */
  const handleViewSettings = useCallback(() => {
    if (onComplete) {
      onComplete();
    }
  }, [onComplete]);

  // Show success state after save
  if (showSuccess) {
    return (
      <div className="max-w-2xl mx-auto">
        <SetupSuccessState
          onViewSettings={handleViewSettings}
          isSyncing={isSyncing}
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Wizard Header with Progress */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-gray-800 mb-6">
          POS Integration Setup
        </h1>
        <StepIndicator currentStep={state.currentStep} />
      </div>

      {/* Step Content */}
      {state.currentStep === 1 && (
        <Step1POSSelector
          selectedPOS={state.selectedPOS}
          onSelect={selectPOS}
          onNext={goNext}
          canProceed={canGoNext}
        />
      )}

      {state.currentStep === 2 && state.selectedPOS && connectionCategory && (
        <Step2ConnectionDetails
          posType={state.selectedPOS}
          connectionCategory={connectionCategory}
          fileConfig={state.fileConfig}
          networkConfig={state.networkConfig}
          cloudConfig={state.cloudConfig}
          onFileConfigChange={updateFileConfig}
          onNetworkConfigChange={updateNetworkConfig}
          onCloudConfigChange={updateCloudConfig}
          onTestConnection={handleTestConnection}
          isTestingConnection={testConnectionMutation.isPending}
          connectionTestResult={state.connectionTestResult}
          canProceed={canGoNext}
          onNext={goNext}
          onBack={goBack}
        />
      )}

      {state.currentStep === 3 && (
        <Step3SyncOptions
          syncOptions={state.syncOptions}
          onSyncOptionsChange={updateSyncOptions}
          canProceed={canGoNext}
          onNext={goNext}
          onBack={goBack}
          preview={state.connectionTestResult?.data?.preview}
          onInitSelectedItems={initSelectedItemsFromPreview}
          onToggleItem={toggleItemSelection}
          onSelectAll={selectAllItems}
          onDeselectAll={deselectAllItems}
        />
      )}

      {state.currentStep === 4 && state.selectedPOS && connectionCategory && (
        <Step4ReviewConfirm
          posType={state.selectedPOS}
          connectionCategory={connectionCategory}
          fileConfig={state.fileConfig}
          networkConfig={state.networkConfig}
          cloudConfig={state.cloudConfig}
          syncOptions={state.syncOptions}
          isSubmitting={state.isSubmitting}
          onSave={handleSave}
          onBack={goBack}
        />
      )}

      {/* Error Display */}
      {state.error && (
        <div
          className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm"
          role="alert"
          data-testid="wizard-error"
        >
          {state.error}
        </div>
      )}
    </div>
  );
}

export default POSSetupWizard;
