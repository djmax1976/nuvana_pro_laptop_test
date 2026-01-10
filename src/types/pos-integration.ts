/**
 * POS Integration Types
 *
 * TypeScript type definitions for POS integration UI components.
 * These types align with the backend POSIntegration model and API schemas.
 *
 * @module types/pos-integration
 * @security Credentials are NEVER returned from API - only has_credentials boolean
 */

// ============================================================================
// POS System Types - Must match backend POSSystemType enum
// ============================================================================

/**
 * POS System Type Enum
 * Matches Prisma POSSystemType enum exactly
 */
export type POSSystemType =
  | "GILBARCO_PASSPORT"
  | "GILBARCO_NAXML"
  | "GILBARCO_COMMANDER"
  | "VERIFONE_RUBY2"
  | "VERIFONE_COMMANDER"
  | "VERIFONE_SAPPHIRE"
  | "CLOVER_REST"
  | "ORACLE_SIMPHONY"
  | "NCR_ALOHA"
  | "LIGHTSPEED_REST"
  | "SQUARE_REST"
  | "TOAST_REST"
  | "GENERIC_XML"
  | "GENERIC_REST"
  | "MANUAL_ENTRY";

/**
 * POS Authentication Type Enum
 * Matches Prisma POSAuthType enum
 */
export type POSAuthType =
  | "NONE"
  | "API_KEY"
  | "BASIC_AUTH"
  | "OAUTH2"
  | "CERTIFICATE"
  | "CUSTOM";

/**
 * POS Sync Status Enum
 * Matches Prisma POSSyncStatus enum
 */
export type POSSyncStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "SUCCESS"
  | "PARTIAL_SUCCESS"
  | "FAILED"
  | "TIMEOUT"
  | "AUTH_ERROR"
  | "CONNECTION_ERROR";

/**
 * POS Sync Trigger Type
 */
export type POSSyncTrigger = "SCHEDULED" | "MANUAL";

/**
 * Connection category for UI organization
 */
export type POSConnectionCategory = "file" | "network" | "cloud" | "manual";

// ============================================================================
// POS Type Configuration (UI Metadata)
// ============================================================================

/**
 * POS Type configuration metadata for UI display
 */
export interface POSTypeConfig {
  /** Unique key matching POSSystemType */
  key: POSSystemType;
  /** Connection category for form field selection */
  type: POSConnectionCategory;
  /** Human-readable display name */
  name: string;
  /** Short description for info card */
  description: string;
  /** Font Awesome icon class (without 'fa-' prefix) */
  icon: string;
  /** Group for dropdown organization */
  group: "Verifone" | "Gilbarco" | "Cloud POS" | "Other";
  /** Default port for network connections */
  defaultPort?: number;
  /** Default export path for file-based connections */
  exportPath?: string;
  /** Default import path for file-based connections */
  importPath?: string;
  /** Cloud provider name for display */
  provider?: string;
}

// ============================================================================
// POS Integration Entity
// ============================================================================

/**
 * POS Integration entity as returned from API
 * Note: Credentials are never returned - only has_credentials boolean
 */
export interface POSIntegration {
  pos_integration_id: string;
  store_id: string;
  pos_type: POSSystemType;
  pos_version?: string | null;
  pos_serial?: string | null;
  pos_name?: string | null;
  host: string;
  port: number;
  use_ssl: boolean;
  timeout: number;
  auth_type: POSAuthType;
  /** Indicates if credentials are stored (credentials never returned) */
  has_credentials: boolean;
  sync_enabled: boolean;
  sync_interval_mins: number;
  last_sync_at?: string | null;
  last_sync_status?: POSSyncStatus | null;
  last_sync_error?: string | null;
  next_sync_at?: string | null;
  sync_departments: boolean;
  sync_tender_types: boolean;
  sync_cashiers: boolean;
  sync_tax_rates: boolean;
  sync_products: boolean;
  /** NAXML version for file-based integrations */
  naxml_version?: string | null;
  /** XML gateway path for file-based integrations */
  xml_gateway_path?: string | null;
  /** Generate NAXML acknowledgment files */
  generate_acknowledgments: boolean;
  /** Connection mode: API, FILE_EXCHANGE, or HYBRID */
  connection_mode: "API" | "FILE_EXCHANGE" | "HYBRID";
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// API Request Types
// ============================================================================

/**
 * API Key credentials for create/update
 */
export interface POSApiKeyCredentials {
  type: "API_KEY";
  api_key: string;
  header_name?: string;
}

/**
 * Basic Auth credentials for create/update
 */
export interface POSBasicAuthCredentials {
  type: "BASIC_AUTH";
  username: string;
  password: string;
}

/**
 * OAuth2 credentials for create/update
 */
export interface POSOAuth2Credentials {
  type: "OAUTH2";
  client_id: string;
  client_secret: string;
  token_url: string;
  scope?: string;
}

/**
 * Certificate credentials for create/update
 */
export interface POSCertificateCredentials {
  type: "CERTIFICATE";
  certificate: string;
  private_key: string;
  passphrase?: string;
}

/**
 * No auth credentials
 */
export interface POSNoAuthCredentials {
  type: "NONE";
}

/**
 * Union of all credential types for API requests
 */
export type POSCredentials =
  | POSApiKeyCredentials
  | POSBasicAuthCredentials
  | POSOAuth2Credentials
  | POSCertificateCredentials
  | POSNoAuthCredentials;

/**
 * Create POS Integration request payload
 */
export interface CreatePOSIntegrationRequest {
  pos_type: POSSystemType;
  connection_name?: string;
  host: string;
  port?: number;
  use_ssl?: boolean;
  timeout_ms?: number;
  auth_type: POSAuthType;
  credentials?: POSCredentials;
  // Sync settings
  sync_enabled?: boolean;
  sync_interval_minutes?: number;
  sync_departments?: boolean;
  sync_tender_types?: boolean;
  sync_cashiers?: boolean;
  sync_tax_rates?: boolean;
  // File-based config
  export_path?: string;
  import_path?: string;
  naxml_version?: string;
  generate_acknowledgments?: boolean;
}

/**
 * Update POS Integration request payload
 * All fields optional for partial updates
 */
export interface UpdatePOSIntegrationRequest {
  connection_name?: string;
  host?: string;
  port?: number;
  use_ssl?: boolean;
  timeout_ms?: number;
  auth_type?: POSAuthType;
  credentials?: POSCredentials;
  sync_enabled?: boolean;
  sync_interval_minutes?: number;
  sync_departments?: boolean;
  sync_tender_types?: boolean;
  sync_cashiers?: boolean;
  sync_tax_rates?: boolean;
  export_path?: string;
  import_path?: string;
  naxml_version?: string;
  generate_acknowledgments?: boolean;
  is_active?: boolean;
}

/**
 * Sync trigger options
 */
export interface TriggerSyncOptions {
  sync_departments?: boolean;
  sync_tender_types?: boolean;
  sync_cashiers?: boolean;
  sync_tax_rates?: boolean;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Single department item from POS preview
 */
export interface POSPreviewDepartment {
  posCode: string;
  displayName: string;
  isTaxable?: boolean;
}

/**
 * Single tender type item from POS preview
 */
export interface POSPreviewTenderType {
  posCode: string;
  displayName: string;
  isElectronic?: boolean;
}

/**
 * Single tax rate item from POS preview
 */
export interface POSPreviewTaxRate {
  posCode: string;
  name: string;
  rate: number;
  jurisdiction?: string;
}

/**
 * Preview of data available from POS (returned during connection test)
 * Contains ALL items found - user selects which to import
 */
export interface POSDataPreview {
  /** All departments found in POS */
  departments?: {
    count: number;
    items: POSPreviewDepartment[];
  };
  /** All tender types found in POS */
  tenderTypes?: {
    count: number;
    items: POSPreviewTenderType[];
  };
  /** All tax rates found in POS */
  taxRates?: {
    count: number;
    items: POSPreviewTaxRate[];
  };
}

/**
 * Connection test result
 */
export interface POSConnectionTestResult {
  success: boolean;
  data: {
    connected: boolean;
    message: string;
    posVersion?: string;
    posSerial?: string;
    latencyMs?: number;
    errorCode?: string;
    errorDetails?: Record<string, unknown>;
    /** Preview of available data (populated on successful connection) */
    preview?: POSDataPreview;
  };
}

/**
 * Sync result for a single entity type
 */
export interface SyncEntityResult {
  received: number;
  created: number;
  updated: number;
  deactivated: number;
  errors: Array<{
    posCode: string;
    error: string;
    errorCode?: string;
  }>;
}

/**
 * Complete sync result
 */
export interface POSSyncResult {
  success: boolean;
  data: {
    status: POSSyncStatus;
    durationMs: number;
    departments?: SyncEntityResult;
    tenderTypes?: SyncEntityResult;
    cashiers?: SyncEntityResult;
    taxRates?: SyncEntityResult;
    errors: Array<{
      entityType: "department" | "tender_type" | "cashier" | "tax_rate";
      posCode: string;
      error: string;
      errorCode?: string;
    }>;
    errorMessage?: string;
    errorCode?: string;
  };
}

/**
 * Sync log entry
 */
export interface POSSyncLog {
  sync_log_id: string;
  pos_integration_id: string;
  started_at: string;
  completed_at?: string | null;
  duration_ms?: number | null;
  status: POSSyncStatus;
  trigger_type: POSSyncTrigger;
  triggered_by_user?: {
    user_id: string;
    email: string;
    name: string;
  } | null;
  departments_synced: number;
  tender_types_synced: number;
  cashiers_synced: number;
  tax_rates_synced: number;
  entities_created: number;
  entities_updated: number;
  entities_deactivated: number;
  error_message?: string | null;
  error_code?: string | null;
}

/**
 * Sync logs query parameters
 */
export interface POSSyncLogsQuery {
  limit?: number;
  offset?: number;
  status?: POSSyncStatus;
  from_date?: string;
  to_date?: string;
}

/**
 * Sync logs response with pagination
 */
export interface POSSyncLogsResponse {
  success: boolean;
  data: POSSyncLog[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// ============================================================================
// Wizard State Types
// ============================================================================

/**
 * Wizard step number
 */
export type WizardStep = 1 | 2 | 3 | 4;

/**
 * Connection config for file-based POS
 */
export interface FileConnectionConfig {
  exportPath: string;
  importPath: string;
  naxmlVersion?: string;
  generateAcknowledgments?: boolean;
}

/**
 * Connection config for network-based POS
 */
export interface NetworkConnectionConfig {
  host: string;
  port: number;
  useSsl: boolean;
}

/**
 * Connection config for cloud POS
 */
export interface CloudConnectionConfig {
  apiKey: string;
  locationId?: string;
}

/**
 * Selected items for import - tracks which specific items user wants to import
 * Keys are posCode strings, values indicate selection state
 */
export interface SelectedItemsConfig {
  /** Selected department posCodes for import */
  departments: Set<string>;
  /** Selected tender type posCodes for import */
  tenderTypes: Set<string>;
  /** Selected tax rate posCodes for import */
  taxRates: Set<string>;
}

/**
 * Sync options configuration
 */
export interface SyncOptionsConfig {
  /** Master toggle for department sync category */
  syncDepartments: boolean;
  /** Master toggle for tender types sync category */
  syncTenders: boolean;
  /** Master toggle for tax rates sync category */
  syncTaxRates: boolean;
  /** Enable automatic scheduled syncing */
  autoSyncEnabled: boolean;
  /** Interval between syncs in minutes */
  syncIntervalMinutes: number;
  /** Specific items selected for import (when not importing all) */
  selectedItems: SelectedItemsConfig;
}

/**
 * Complete wizard state
 */
export interface POSSetupWizardState {
  currentStep: WizardStep;
  selectedPOS: POSSystemType | null;
  connectionConfig: {
    file?: FileConnectionConfig;
    network?: NetworkConnectionConfig;
    cloud?: CloudConnectionConfig;
  };
  syncOptions: SyncOptionsConfig;
  connectionTested: boolean;
  connectionTestResult: POSConnectionTestResult | null;
  isSubmitting: boolean;
  error: string | null;
}

// ============================================================================
// Component Props Types
// ============================================================================

/**
 * Props for TestConnectionButton component
 */
export interface TestConnectionButtonProps {
  onTest: () => Promise<void>;
  isLoading: boolean;
  result: POSConnectionTestResult | null;
  disabled?: boolean;
}

/**
 * Props for wizard step components
 */
export interface WizardStepProps {
  onNext: () => void;
  onBack: () => void;
  isFirstStep?: boolean;
  isLastStep?: boolean;
}
