/**
 * POS Setup Wizard State Management Hook
 *
 * Provides centralized state management for the 4-step POS integration wizard.
 * Implements the wizard flow from template: nuvana_docs/templates/onboarding-ui/index.html
 *
 * Security: FE-002 (form validation), SEC-014 (input validation)
 *
 * @module components/pos-integration/hooks/usePOSSetupWizard
 */

import { useCallback, useMemo, useReducer } from "react";
import type {
  POSSystemType,
  POSConnectionTestResult,
  WizardStep,
  FileConnectionConfig,
  NetworkConnectionConfig,
  CloudConnectionConfig,
  SyncOptionsConfig,
  CreatePOSIntegrationRequest,
  SelectedItemsConfig,
  POSDataPreview,
} from "@/types/pos-integration";
import {
  getConnectionCategory,
  getPOSTypeConfig,
  getDefaultPort,
  getDefaultExportPath,
  getDefaultImportPath,
  DEFAULT_SYNC_OPTIONS,
  requiresConnectionTest,
} from "@/lib/pos-integration/pos-types";

// ============================================================================
// State Types
// ============================================================================

interface WizardState {
  /** Current step (1-4) */
  currentStep: WizardStep;
  /** Selected POS system type */
  selectedPOS: POSSystemType | null;
  /** File-based connection config */
  fileConfig: FileConnectionConfig;
  /** Network-based connection config */
  networkConfig: NetworkConnectionConfig;
  /** Cloud-based connection config */
  cloudConfig: CloudConnectionConfig;
  /** Sync options */
  syncOptions: SyncOptionsConfig;
  /** Whether connection has been successfully tested */
  connectionTested: boolean;
  /** Result from connection test */
  connectionTestResult: POSConnectionTestResult | null;
  /** Whether the form is being submitted */
  isSubmitting: boolean;
  /** Error message if any */
  error: string | null;
}

// ============================================================================
// Actions
// ============================================================================

type WizardAction =
  | { type: "SET_STEP"; step: WizardStep }
  | { type: "SELECT_POS"; posType: POSSystemType }
  | { type: "UPDATE_FILE_CONFIG"; config: Partial<FileConnectionConfig> }
  | { type: "UPDATE_NETWORK_CONFIG"; config: Partial<NetworkConnectionConfig> }
  | { type: "UPDATE_CLOUD_CONFIG"; config: Partial<CloudConnectionConfig> }
  | { type: "UPDATE_SYNC_OPTIONS"; options: Partial<SyncOptionsConfig> }
  | { type: "SET_CONNECTION_TEST_RESULT"; result: POSConnectionTestResult }
  | { type: "INIT_SELECTED_ITEMS_FROM_PREVIEW"; preview: POSDataPreview }
  | {
      type: "TOGGLE_ITEM_SELECTION";
      entityType: "departments" | "tenderTypes" | "taxRates";
      posCode: string;
    }
  | {
      type: "SELECT_ALL_ITEMS";
      entityType: "departments" | "tenderTypes" | "taxRates";
      posCodes: string[];
    }
  | {
      type: "DESELECT_ALL_ITEMS";
      entityType: "departments" | "tenderTypes" | "taxRates";
    }
  | { type: "RESET_CONNECTION_TEST" }
  | { type: "SET_SUBMITTING"; isSubmitting: boolean }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "RESET" };

// ============================================================================
// Initial State
// ============================================================================

/**
 * Create a fresh SelectedItemsConfig with empty Sets
 * Must be a function to avoid shared Set instances
 */
function createEmptySelectedItems(): SelectedItemsConfig {
  return {
    departments: new Set<string>(),
    tenderTypes: new Set<string>(),
    taxRates: new Set<string>(),
  };
}

/**
 * Create fresh sync options with empty selected items
 */
function createDefaultSyncOptions(): SyncOptionsConfig {
  return {
    ...DEFAULT_SYNC_OPTIONS,
    selectedItems: createEmptySelectedItems(),
  };
}

const initialState: WizardState = {
  currentStep: 1,
  selectedPOS: null,
  fileConfig: {
    exportPath: "",
    importPath: "",
    naxmlVersion: "3.4",
    generateAcknowledgments: true,
  },
  networkConfig: {
    host: "",
    port: 8080,
    useSsl: true,
  },
  cloudConfig: {
    apiKey: "",
    locationId: "",
  },
  syncOptions: createDefaultSyncOptions(),
  connectionTested: false,
  connectionTestResult: null,
  isSubmitting: false,
  error: null,
};

// ============================================================================
// Reducer
// ============================================================================

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET_STEP":
      return {
        ...state,
        currentStep: action.step,
        error: null,
      };

    case "SELECT_POS": {
      const config = getPOSTypeConfig(action.posType);
      const category = getConnectionCategory(action.posType);

      // Reset connection config based on POS type
      const newState: WizardState = {
        ...state,
        selectedPOS: action.posType,
        connectionTested: false,
        connectionTestResult: null,
        error: null,
      };

      // Pre-populate defaults based on connection type
      if (category === "file") {
        newState.fileConfig = {
          exportPath: getDefaultExportPath(action.posType) || "",
          importPath: getDefaultImportPath(action.posType) || "",
          naxmlVersion: "3.4",
          generateAcknowledgments: true,
        };
      } else if (category === "network") {
        newState.networkConfig = {
          host: "",
          port: getDefaultPort(action.posType) || 8080,
          useSsl: true,
        };
      } else if (category === "cloud") {
        newState.cloudConfig = {
          apiKey: "",
          locationId: "",
        };
      }

      return newState;
    }

    case "UPDATE_FILE_CONFIG":
      return {
        ...state,
        fileConfig: { ...state.fileConfig, ...action.config },
        connectionTested: false,
        connectionTestResult: null,
      };

    case "UPDATE_NETWORK_CONFIG":
      return {
        ...state,
        networkConfig: { ...state.networkConfig, ...action.config },
        connectionTested: false,
        connectionTestResult: null,
      };

    case "UPDATE_CLOUD_CONFIG":
      return {
        ...state,
        cloudConfig: { ...state.cloudConfig, ...action.config },
        connectionTested: false,
        connectionTestResult: null,
      };

    case "UPDATE_SYNC_OPTIONS":
      return {
        ...state,
        syncOptions: { ...state.syncOptions, ...action.options },
      };

    case "SET_CONNECTION_TEST_RESULT":
      return {
        ...state,
        connectionTestResult: action.result,
        connectionTested: action.result.success && action.result.data.connected,
      };

    case "INIT_SELECTED_ITEMS_FROM_PREVIEW": {
      // Initialize selectedItems with ALL items from preview (all selected by default)
      const newSelectedItems = createEmptySelectedItems();

      if (action.preview.departments?.items) {
        action.preview.departments.items.forEach((item) => {
          newSelectedItems.departments.add(item.posCode);
        });
      }
      if (action.preview.tenderTypes?.items) {
        action.preview.tenderTypes.items.forEach((item) => {
          newSelectedItems.tenderTypes.add(item.posCode);
        });
      }
      if (action.preview.taxRates?.items) {
        action.preview.taxRates.items.forEach((item) => {
          newSelectedItems.taxRates.add(item.posCode);
        });
      }

      return {
        ...state,
        syncOptions: {
          ...state.syncOptions,
          selectedItems: newSelectedItems,
        },
      };
    }

    case "TOGGLE_ITEM_SELECTION": {
      const currentSet = state.syncOptions.selectedItems[action.entityType];
      const newSet = new Set(currentSet);

      if (newSet.has(action.posCode)) {
        newSet.delete(action.posCode);
      } else {
        newSet.add(action.posCode);
      }

      return {
        ...state,
        syncOptions: {
          ...state.syncOptions,
          selectedItems: {
            ...state.syncOptions.selectedItems,
            [action.entityType]: newSet,
          },
        },
      };
    }

    case "SELECT_ALL_ITEMS": {
      const newSet = new Set(action.posCodes);
      return {
        ...state,
        syncOptions: {
          ...state.syncOptions,
          selectedItems: {
            ...state.syncOptions.selectedItems,
            [action.entityType]: newSet,
          },
        },
      };
    }

    case "DESELECT_ALL_ITEMS": {
      return {
        ...state,
        syncOptions: {
          ...state.syncOptions,
          selectedItems: {
            ...state.syncOptions.selectedItems,
            [action.entityType]: new Set<string>(),
          },
        },
      };
    }

    case "RESET_CONNECTION_TEST":
      return {
        ...state,
        connectionTested: false,
        connectionTestResult: null,
      };

    case "SET_SUBMITTING":
      return {
        ...state,
        isSubmitting: action.isSubmitting,
      };

    case "SET_ERROR":
      return {
        ...state,
        error: action.error,
        isSubmitting: false,
      };

    case "RESET":
      return { ...initialState };

    default:
      return state;
  }
}

// ============================================================================
// Hook
// ============================================================================

export interface UsePOSSetupWizardReturn {
  /** Current wizard state */
  state: WizardState;
  /** Navigation actions */
  goToStep: (step: WizardStep) => void;
  goNext: () => void;
  goBack: () => void;
  /** POS selection */
  selectPOS: (posType: POSSystemType) => void;
  /** Config updates */
  updateFileConfig: (config: Partial<FileConnectionConfig>) => void;
  updateNetworkConfig: (config: Partial<NetworkConnectionConfig>) => void;
  updateCloudConfig: (config: Partial<CloudConnectionConfig>) => void;
  updateSyncOptions: (options: Partial<SyncOptionsConfig>) => void;
  /** Connection test */
  setConnectionTestResult: (result: POSConnectionTestResult) => void;
  resetConnectionTest: () => void;
  /** Item selection for import */
  initSelectedItemsFromPreview: (preview: POSDataPreview) => void;
  toggleItemSelection: (
    entityType: "departments" | "tenderTypes" | "taxRates",
    posCode: string,
  ) => void;
  selectAllItems: (
    entityType: "departments" | "tenderTypes" | "taxRates",
    posCodes: string[],
  ) => void;
  deselectAllItems: (
    entityType: "departments" | "tenderTypes" | "taxRates",
  ) => void;
  /** Submission */
  setSubmitting: (isSubmitting: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
  /** Computed values */
  canGoNext: boolean;
  connectionCategory: "file" | "network" | "cloud" | "manual" | null;
  needsConnectionTest: boolean;
  /** Build API request from state */
  buildCreateRequest: () => CreatePOSIntegrationRequest | null;
}

/**
 * Hook for managing POS setup wizard state
 *
 * @example
 * ```tsx
 * const {
 *   state,
 *   goToStep,
 *   selectPOS,
 *   updateNetworkConfig,
 *   canGoNext,
 *   buildCreateRequest
 * } = usePOSSetupWizard();
 *
 * // In step 1
 * <select onChange={(e) => selectPOS(e.target.value as POSSystemType)}>
 *
 * // In step 2
 * <input value={state.networkConfig.host}
 *        onChange={(e) => updateNetworkConfig({ host: e.target.value })} />
 *
 * // Navigation
 * <button onClick={() => goToStep(3)} disabled={!canGoNext}>Next</button>
 * ```
 */
export function usePOSSetupWizard(): UsePOSSetupWizardReturn {
  const [state, dispatch] = useReducer(wizardReducer, initialState);

  // Navigation actions
  const goToStep = useCallback((step: WizardStep) => {
    dispatch({ type: "SET_STEP", step });
  }, []);

  const goNext = useCallback(() => {
    if (state.currentStep < 4) {
      dispatch({
        type: "SET_STEP",
        step: (state.currentStep + 1) as WizardStep,
      });
    }
  }, [state.currentStep]);

  const goBack = useCallback(() => {
    if (state.currentStep > 1) {
      dispatch({
        type: "SET_STEP",
        step: (state.currentStep - 1) as WizardStep,
      });
    }
  }, [state.currentStep]);

  // POS selection
  const selectPOS = useCallback((posType: POSSystemType) => {
    dispatch({ type: "SELECT_POS", posType });
  }, []);

  // Config updates
  const updateFileConfig = useCallback(
    (config: Partial<FileConnectionConfig>) => {
      dispatch({ type: "UPDATE_FILE_CONFIG", config });
    },
    [],
  );

  const updateNetworkConfig = useCallback(
    (config: Partial<NetworkConnectionConfig>) => {
      dispatch({ type: "UPDATE_NETWORK_CONFIG", config });
    },
    [],
  );

  const updateCloudConfig = useCallback(
    (config: Partial<CloudConnectionConfig>) => {
      dispatch({ type: "UPDATE_CLOUD_CONFIG", config });
    },
    [],
  );

  const updateSyncOptions = useCallback(
    (options: Partial<SyncOptionsConfig>) => {
      dispatch({ type: "UPDATE_SYNC_OPTIONS", options });
    },
    [],
  );

  // Connection test
  const setConnectionTestResult = useCallback(
    (result: POSConnectionTestResult) => {
      dispatch({ type: "SET_CONNECTION_TEST_RESULT", result });
    },
    [],
  );

  const resetConnectionTest = useCallback(() => {
    dispatch({ type: "RESET_CONNECTION_TEST" });
  }, []);

  // Item selection for import
  const initSelectedItemsFromPreview = useCallback(
    (preview: POSDataPreview) => {
      dispatch({ type: "INIT_SELECTED_ITEMS_FROM_PREVIEW", preview });
    },
    [],
  );

  const toggleItemSelection = useCallback(
    (
      entityType: "departments" | "tenderTypes" | "taxRates",
      posCode: string,
    ) => {
      dispatch({ type: "TOGGLE_ITEM_SELECTION", entityType, posCode });
    },
    [],
  );

  const selectAllItems = useCallback(
    (
      entityType: "departments" | "tenderTypes" | "taxRates",
      posCodes: string[],
    ) => {
      dispatch({ type: "SELECT_ALL_ITEMS", entityType, posCodes });
    },
    [],
  );

  const deselectAllItems = useCallback(
    (entityType: "departments" | "tenderTypes" | "taxRates") => {
      dispatch({ type: "DESELECT_ALL_ITEMS", entityType });
    },
    [],
  );

  // Submission
  const setSubmitting = useCallback((isSubmitting: boolean) => {
    dispatch({ type: "SET_SUBMITTING", isSubmitting });
  }, []);

  const setError = useCallback((error: string | null) => {
    dispatch({ type: "SET_ERROR", error });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  // Computed: connection category
  const connectionCategory = useMemo(() => {
    if (!state.selectedPOS) return null;
    return getConnectionCategory(state.selectedPOS);
  }, [state.selectedPOS]);

  // Computed: needs connection test
  const needsConnectionTest = useMemo(() => {
    if (!state.selectedPOS) return false;
    return requiresConnectionTest(state.selectedPOS);
  }, [state.selectedPOS]);

  // Computed: can proceed to next step
  const canGoNext = useMemo(() => {
    switch (state.currentStep) {
      case 1:
        // Step 1: Must have selected a POS
        return state.selectedPOS !== null;

      case 2:
        // Step 2: Connection must be configured and tested (except for manual)
        if (!state.selectedPOS) return false;

        // Manual entry doesn't need connection test
        if (connectionCategory === "manual") return true;

        // For all other types, connection must be tested successfully
        if (!state.connectionTested) return false;

        // Validate required fields based on connection type
        if (connectionCategory === "file") {
          return (
            state.fileConfig.exportPath.trim() !== "" &&
            state.fileConfig.importPath.trim() !== ""
          );
        }
        if (connectionCategory === "network") {
          return (
            state.networkConfig.host.trim() !== "" &&
            state.networkConfig.port > 0 &&
            state.networkConfig.port <= 65535
          );
        }
        if (connectionCategory === "cloud") {
          return state.cloudConfig.apiKey.trim() !== "";
        }
        return false;

      case 3:
        // Step 3: At least one sync option must be selected (unless manual)
        if (connectionCategory === "manual") return true;
        return (
          state.syncOptions.syncDepartments ||
          state.syncOptions.syncTenders ||
          state.syncOptions.syncTaxRates
        );

      case 4:
        // Step 4: Ready to submit (validation already done)
        return !state.isSubmitting;

      default:
        return false;
    }
  }, [state, connectionCategory]);

  // Build API request from current state
  const buildCreateRequest =
    useCallback((): CreatePOSIntegrationRequest | null => {
      if (!state.selectedPOS) return null;

      const category = getConnectionCategory(state.selectedPOS);
      const config = getPOSTypeConfig(state.selectedPOS);

      // Base request with all required fields for backend validation
      const baseRequest: CreatePOSIntegrationRequest = {
        pos_type: state.selectedPOS,
        connection_name: config.name, // Required: use POS display name as default
        host: "",
        port: 80, // Required: default port, will be overridden per category
        auth_type: "NONE",
        credentials: { type: "NONE" }, // Required: credentials object
        sync_enabled: state.syncOptions.autoSyncEnabled,
        sync_interval_minutes: state.syncOptions.syncIntervalMinutes,
        sync_departments: state.syncOptions.syncDepartments,
        sync_tender_types: state.syncOptions.syncTenders,
        sync_tax_rates: state.syncOptions.syncTaxRates,
      };

      switch (category) {
        case "file":
          // For file-based POS, host stores the XMLGateway path (used by backend as xmlGatewayPath)
          // The exportPath IS the XMLGateway path (e.g., C:\Passport\XMLGateway)
          return {
            ...baseRequest,
            host: state.fileConfig.exportPath, // XMLGateway path - backend maps this to xmlGatewayPath
            port: 1, // File-based doesn't use network port (1 is placeholder to pass validation)
            export_path: state.fileConfig.exportPath,
            import_path: state.fileConfig.importPath,
            naxml_version: state.fileConfig.naxmlVersion,
            generate_acknowledgments: state.fileConfig.generateAcknowledgments,
          };

        case "network":
          return {
            ...baseRequest,
            host: state.networkConfig.host,
            port: state.networkConfig.port,
            use_ssl: state.networkConfig.useSsl,
          };

        case "cloud":
          return {
            ...baseRequest,
            host: `api.${state.selectedPOS.toLowerCase().replace("_rest", "")}.com`,
            port: 443, // HTTPS port for cloud APIs
            auth_type: "API_KEY",
            credentials: {
              type: "API_KEY",
              api_key: state.cloudConfig.apiKey,
            },
          };

        case "manual":
          return {
            ...baseRequest,
            host: "localhost",
            port: 1, // Manual doesn't use network port (1 is placeholder to pass validation)
            sync_enabled: false,
          };

        default:
          return null;
      }
    }, [state]);

  return {
    state,
    goToStep,
    goNext,
    goBack,
    selectPOS,
    updateFileConfig,
    updateNetworkConfig,
    updateCloudConfig,
    updateSyncOptions,
    setConnectionTestResult,
    resetConnectionTest,
    initSelectedItemsFromPreview,
    toggleItemSelection,
    selectAllItems,
    deselectAllItems,
    setSubmitting,
    setError,
    reset,
    canGoNext,
    connectionCategory,
    needsConnectionTest,
    buildCreateRequest,
  };
}

export type { WizardState, WizardAction };
