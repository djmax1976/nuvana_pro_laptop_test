/**
 * POS Integration Components
 *
 * Exports all POS integration UI components for the setup wizard
 * and configured state views.
 *
 * @module components/pos-integration
 */

// Main Components - Phase 2 (Setup Wizard)
export { POSSetupWizard } from "./POSSetupWizard";
export { SetupSuccessState } from "./SetupSuccessState";
export { TestConnectionButton } from "./TestConnectionButton";

// Authentication Components - Phase 4
export { POSAuthModal } from "./POSAuthModal";

// Main Components - Phase 3 (Configured State)
export { ConfiguredStatusView } from "./ConfiguredStatusView";
export { POSInfoCard } from "./POSInfoCard";
export { SyncStatusCard } from "./SyncStatusCard";
export { SyncHistoryList } from "./SyncHistoryList";
export { SyncProgressIndicator } from "./SyncProgressIndicator";
export { EditConnectionModal } from "./EditConnectionModal";

// Step Components
export { StepIndicator } from "./steps/StepIndicator";
export { Step1POSSelector } from "./steps/Step1POSSelector";
export { Step2ConnectionDetails } from "./steps/Step2ConnectionDetails";
export { Step3SyncOptions } from "./steps/Step3SyncOptions";
export { Step4ReviewConfirm } from "./steps/Step4ReviewConfirm";

// Form Components
export { FileConnectionForm } from "./forms/FileConnectionForm";
export { NetworkConnectionForm } from "./forms/NetworkConnectionForm";
export { CloudConnectionForm } from "./forms/CloudConnectionForm";
export { ManualConnectionInfo } from "./forms/ManualConnectionInfo";

// Hooks
export { usePOSSetupWizard } from "./hooks/usePOSSetupWizard";
export type {
  UsePOSSetupWizardReturn,
  WizardState,
} from "./hooks/usePOSSetupWizard";
