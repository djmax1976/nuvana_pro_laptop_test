/**
 * POS Integration Types (Phase 1.6)
 *
 * Type definitions for POS system integration, auto-onboarding,
 * and entity synchronization.
 *
 * @module types/pos-integration.types
 * @security POS credentials must be encrypted before storage
 */

import type { POSSystemType, POSAuthType, POSSyncStatus } from "@prisma/client";

// ============================================================================
// POS Connection Configuration
// ============================================================================

/**
 * POS connection configuration for adapter initialization
 */
export interface POSConnectionConfig {
  /** Hostname or IP address of the POS system */
  host: string;
  /** Port number */
  port: number;
  /** Whether to use SSL/TLS */
  useSsl: boolean;
  /** Connection timeout in milliseconds */
  timeoutMs: number;
  /** Authentication type */
  authType: POSAuthType;
  /** Authentication credentials (type varies by authType) */
  credentials: POSCredentials;
}

/**
 * POS authentication credentials
 * Structure varies by authentication type
 */
export type POSCredentials =
  | POSApiKeyCredentials
  | POSBasicAuthCredentials
  | POSOAuth2Credentials
  | POSCertificateCredentials
  | POSNoAuthCredentials;

export interface POSApiKeyCredentials {
  type: "API_KEY";
  apiKey: string;
  /** Optional header name (default: X-API-Key) */
  headerName?: string;
}

export interface POSBasicAuthCredentials {
  type: "BASIC_AUTH";
  username: string;
  password: string;
}

export interface POSOAuth2Credentials {
  type: "OAUTH2";
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  /** Optional: Cached access token */
  accessToken?: string;
  /** Optional: Token expiry time */
  tokenExpiresAt?: Date;
}

export interface POSCertificateCredentials {
  type: "CERTIFICATE";
  /** Path to client certificate file */
  certPath: string;
  /** Path to private key file */
  keyPath: string;
  /** Optional passphrase for private key */
  passphrase?: string;
}

export interface POSNoAuthCredentials {
  type: "NONE";
}

// ============================================================================
// POS Connection Test Results
// ============================================================================

/**
 * Result of testing a POS connection
 */
export interface POSConnectionTestResult {
  /** Whether the connection was successful */
  success: boolean;
  /** Human-readable message */
  message: string;
  /** POS software version if available */
  posVersion?: string;
  /** POS hardware serial number if available */
  posSerial?: string;
  /** Connection latency in milliseconds */
  latencyMs?: number;
  /** Error code if failed */
  errorCode?: string;
  /** Detailed error information */
  errorDetails?: Record<string, unknown>;
}

// ============================================================================
// POS Entity Types (Standardized from any POS)
// ============================================================================

/**
 * Standardized department from any POS system
 */
export interface POSDepartment {
  /** Code as defined in POS system */
  posCode: string;
  /** Display name for the department */
  displayName: string;
  /** Whether items in this department are taxable */
  isTaxable: boolean;
  /** Minimum age requirement (e.g., 21 for alcohol) */
  minimumAge?: number;
  /** Whether this is a lottery department */
  isLottery: boolean;
  /** Whether this department is active in POS */
  isActive: boolean;
  /** Display order */
  sortOrder?: number;
  /** Optional description */
  description?: string;
}

/**
 * Standardized tender type from any POS system
 */
export interface POSTenderType {
  /** Code as defined in POS system */
  posCode: string;
  /** Display name for the tender type */
  displayName: string;
  /** Whether this is cash or cash-equivalent */
  isCashEquivalent: boolean;
  /** Whether this is an electronic payment */
  isElectronic: boolean;
  /** Whether this affects cash drawer count */
  affectsCashDrawer: boolean;
  /** Whether a reference number is required */
  requiresReference: boolean;
  /** Whether this tender type is active */
  isActive: boolean;
  /** Display order */
  sortOrder?: number;
  /** Optional description */
  description?: string;
}

/**
 * Standardized cashier from any POS system
 */
export interface POSCashier {
  /** Cashier ID/code in POS system */
  posCode: string;
  /** Employee first name */
  firstName: string;
  /** Employee last name */
  lastName: string;
  /** Hashed PIN (if available) */
  pinHash?: string;
  /** Whether this cashier is active */
  isActive: boolean;
  /** Employee ID if available */
  employeeId?: string;
}

/**
 * Standardized tax rate from any POS system
 */
export interface POSTaxRate {
  /** Code as defined in POS system */
  posCode: string;
  /** Display name for the tax rate */
  displayName: string;
  /** Tax rate as decimal (e.g., 0.0825 for 8.25%) */
  rate: number;
  /** Whether this tax rate is active */
  isActive: boolean;
  /** Optional jurisdiction code */
  jurisdictionCode?: string;
  /** Optional description */
  description?: string;
}

// ============================================================================
// POS Sync Results
// ============================================================================

/**
 * Result of a sync operation for a single entity type
 */
export interface POSEntitySyncResult {
  /** Number of entities received from POS */
  received: number;
  /** Number of new entities created */
  created: number;
  /** Number of existing entities updated */
  updated: number;
  /** Number of entities deactivated (not in POS response) */
  deactivated: number;
  /** Errors encountered during sync */
  errors: POSSyncError[];
}

/**
 * Error during POS sync
 */
export interface POSSyncError {
  /** Type of entity that failed */
  entityType: "department" | "tender_type" | "cashier" | "tax_rate";
  /** POS code of the entity */
  posCode: string;
  /** Error message */
  error: string;
  /** Error code for categorization */
  errorCode?: string;
  /** Raw data that caused the error */
  rawData?: Record<string, unknown>;
}

/**
 * Complete sync result from POS system
 */
export interface POSSyncResult {
  /** Overall sync success */
  success: boolean;
  /** Sync status */
  status: POSSyncStatus;
  /** Duration of sync in milliseconds */
  durationMs: number;
  /** Departments synced */
  departments?: POSEntitySyncResult;
  /** Tender types synced */
  tenderTypes?: POSEntitySyncResult;
  /** Cashiers synced */
  cashiers?: POSEntitySyncResult;
  /** Tax rates synced */
  taxRates?: POSEntitySyncResult;
  /** Overall errors */
  errors: POSSyncError[];
  /** Error message if failed */
  errorMessage?: string;
  /** Error code if failed */
  errorCode?: string;
}

// ============================================================================
// POS Adapter Interface
// ============================================================================

/**
 * POS Adapter Interface
 *
 * Each POS system implements this interface to provide a consistent
 * way to communicate with different POS types.
 *
 * @example
 * ```typescript
 * const adapter = new GilbarcoPassportAdapter();
 * const testResult = await adapter.testConnection(config);
 * if (testResult.success) {
 *   const departments = await adapter.syncDepartments(config);
 * }
 * ```
 */
export interface POSAdapter {
  /** POS type this adapter handles */
  readonly posType: POSSystemType;

  /** Human-readable name for this adapter */
  readonly displayName: string;

  /** Test connection to POS system */
  testConnection(config: POSConnectionConfig): Promise<POSConnectionTestResult>;

  /** Sync all supported entities from POS */
  syncAll(config: POSConnectionConfig): Promise<POSSyncResult>;

  /** Sync departments from POS */
  syncDepartments(config: POSConnectionConfig): Promise<POSDepartment[]>;

  /** Sync tender types from POS */
  syncTenderTypes(config: POSConnectionConfig): Promise<POSTenderType[]>;

  /** Sync cashiers from POS */
  syncCashiers(config: POSConnectionConfig): Promise<POSCashier[]>;

  /** Sync tax rates from POS */
  syncTaxRates(config: POSConnectionConfig): Promise<POSTaxRate[]>;

  /**
   * Parse a raw transaction from POS format
   * @param rawData Raw transaction data from POS
   * @returns Standardized transaction data
   */
  parseTransaction?(rawData: unknown): POSTransaction;

  /**
   * Get adapter capabilities
   * @returns What this adapter supports
   */
  getCapabilities(): POSAdapterCapabilities;
}

/**
 * Capabilities of a POS adapter
 */
export interface POSAdapterCapabilities {
  /** Can sync departments */
  syncDepartments: boolean;
  /** Can sync tender types */
  syncTenderTypes: boolean;
  /** Can sync cashiers */
  syncCashiers: boolean;
  /** Can sync tax rates */
  syncTaxRates: boolean;
  /** Can sync products (future) */
  syncProducts: boolean;
  /** Can receive real-time transactions */
  realTimeTransactions: boolean;
  /** Supports webhook notifications */
  webhookSupport: boolean;
}

/**
 * Standardized transaction from POS
 * (For future real-time transaction processing)
 */
export interface POSTransaction {
  /** POS transaction ID */
  posTransactionId: string;
  /** Transaction timestamp */
  timestamp: Date;
  /** Cashier code */
  cashierCode: string;
  /** Terminal/register ID */
  terminalId?: string;
  /** Subtotal before tax */
  subtotal: number;
  /** Tax amount */
  tax: number;
  /** Total amount */
  total: number;
  /** Line items */
  lineItems: POSTransactionLineItem[];
  /** Payments */
  payments: POSTransactionPayment[];
}

export interface POSTransactionLineItem {
  /** Department code */
  departmentCode: string;
  /** SKU or product code */
  sku?: string;
  /** Item description */
  description: string;
  /** Quantity */
  quantity: number;
  /** Unit price */
  unitPrice: number;
  /** Tax amount for this item */
  taxAmount: number;
  /** Line total */
  lineTotal: number;
}

export interface POSTransactionPayment {
  /** Tender type code */
  tenderCode: string;
  /** Amount paid with this tender */
  amount: number;
  /** Reference number if applicable */
  reference?: string;
}

// ============================================================================
// POS Integration Service Types
// ============================================================================

/**
 * Options for creating/updating a POS integration
 */
export interface CreatePOSIntegrationInput {
  storeId: string;
  posType: POSSystemType;
  posName?: string;
  host: string;
  port?: number;
  useSsl?: boolean;
  timeout?: number;
  authType: POSAuthType;
  authCredentials?: Record<string, unknown>;
  syncEnabled?: boolean;
  syncIntervalMins?: number;
  syncDepartments?: boolean;
  syncTenderTypes?: boolean;
  syncCashiers?: boolean;
  syncTaxRates?: boolean;
}

/**
 * Options for updating a POS integration
 */
export interface UpdatePOSIntegrationInput {
  posName?: string;
  host?: string;
  port?: number;
  useSsl?: boolean;
  timeout?: number;
  authType?: POSAuthType;
  authCredentials?: Record<string, unknown>;
  syncEnabled?: boolean;
  syncIntervalMins?: number;
  syncDepartments?: boolean;
  syncTenderTypes?: boolean;
  syncCashiers?: boolean;
  syncTaxRates?: boolean;
  isActive?: boolean;
}

/**
 * Options for triggering a manual sync
 */
export interface TriggerSyncOptions {
  /** Sync departments */
  departments?: boolean;
  /** Sync tender types */
  tenderTypes?: boolean;
  /** Sync cashiers */
  cashiers?: boolean;
  /** Sync tax rates */
  taxRates?: boolean;
  /** User who triggered the sync */
  triggeredBy?: string;
}

// ============================================================================
// Credential Encryption Types
// ============================================================================

/**
 * Encrypted credentials storage format
 */
export interface EncryptedCredentials {
  /** Encryption version for future migrations */
  version: number;
  /** Encrypted data (base64) */
  encryptedData: string;
  /** Initialization vector (base64) */
  iv: string;
  /** Auth tag for AES-GCM (base64) */
  authTag: string;
}

// ============================================================================
// Export all types
// ============================================================================

export type {
  POSSystemType,
  POSAuthType,
  POSSyncStatus,
  POSSyncTrigger,
} from "@prisma/client";
