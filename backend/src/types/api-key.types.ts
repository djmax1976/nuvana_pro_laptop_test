/**
 * API Key Types
 *
 * Type definitions for the enterprise API Keys system.
 * Supports desktop POS applications with offline authentication,
 * key rotation, IP allowlisting, and comprehensive audit logging.
 *
 * @module types/api-key.types
 * @security API key hashes only - raw keys never stored after creation
 */

import type {
  ApiKeyStatus,
  ApiKeyRevocationReason,
  ApiKeyAuditEventType,
} from "@prisma/client";

// ============================================================================
// API Key Identity (Offline Token Payload)
// ============================================================================

/**
 * Identity payload embedded in API key for offline validation
 * This is signed JWT that the desktop app can verify without server connectivity
 *
 * @example
 * ```json
 * {
 *   "v": 1,
 *   "store_id": "uuid",
 *   "store_name": "Main Street Store",
 *   "store_public_id": "ST1A2B3C",
 *   "company_id": "uuid",
 *   "company_name": "ABC Corp",
 *   "timezone": "America/New_York",
 *   "offline_permissions": ["SHIFT_OPEN", "TRANSACTION_CREATE"],
 *   "metadata": { "terminal_id": "T001" },
 *   "iss": "nuvana-backend",
 *   "iat": 1704067200,
 *   "jti": "uuid"
 * }
 * ```
 */
export interface ApiKeyIdentityPayload {
  /** Payload version for future migrations */
  v: 1;

  // Store identity
  store_id: string;
  store_name: string;
  store_public_id: string;

  // Company identity
  company_id: string;
  company_name: string;

  // Timezone (IANA format for offline date handling)
  timezone: string;

  // State info for lottery operations
  state_id?: string;
  state_code?: string;

  // Curated list of permissions for offline operations
  offline_permissions: string[];

  // Extensible metadata
  metadata: ApiKeyMetadata;

  // JWT standard claims
  iss: string; // Issuer: "nuvana-backend"
  iat: number; // Issued at timestamp
  exp?: number; // Optional expiration (0 = no expiration)
  jti: string; // JWT ID (matches api_key_id)
}

/**
 * Extensible metadata stored with API key
 * Can be updated without rotating the key
 */
export interface ApiKeyMetadata {
  /** Optional terminal identifier */
  terminal_id?: string;
  /** POS vendor type for this store */
  pos_vendor?: string;
  /** Feature flags enabled for this store */
  features?: string[];
  /** Additional custom fields */
  [key: string]: unknown;
}

// ============================================================================
// API Key Identity (Request Context)
// ============================================================================

/**
 * API Key identity attached to request after middleware validation
 * Similar to UserIdentity but for API key authentication
 */
export interface ApiKeyIdentity {
  /** API key ID (UUID) */
  apiKeyId: string;

  /** Store ID the key is bound to */
  storeId: string;

  /** Store name for display */
  storeName: string;

  /** Store public ID */
  storePublicId: string;

  /** Company ID */
  companyId: string;

  /** Company name for display */
  companyName: string;

  /** Store timezone (IANA format) */
  timezone: string;

  /** State ID (if applicable) */
  stateId?: string;

  /** State code (if applicable) */
  stateCode?: string;

  /** Permissions allowed for offline operations */
  offlinePermissions: string[];

  /** Extensible metadata */
  metadata: ApiKeyMetadata;

  /** API keys never have elevated access */
  isElevated: false;
}

// ============================================================================
// API Key Generation
// ============================================================================

/**
 * Result of API key generation
 * rawKey is returned ONCE and must be shown to admin immediately
 */
export interface GeneratedApiKey {
  /** Full API key (returned ONCE, never stored) */
  rawKey: string;

  /** SHA-256 hash for storage and validation */
  keyHash: string;

  /** Key prefix for identification (e.g., "nuvpos_sk_ST1A2B3C") */
  keyPrefix: string;

  /** Last 4 characters for display */
  keySuffix: string;

  /** Signed identity payload (JWT) */
  identityPayload: string;
}

/**
 * Input for creating a new API key
 */
export interface CreateApiKeyInput {
  /** Store ID to bind the key to */
  storeId: string;

  /** Optional human-readable label */
  label?: string;

  /** Optional expiration date */
  expiresAt?: Date;

  /** Optional metadata */
  metadata?: ApiKeyMetadata;

  /** IP allowlist (CIDR notation supported) */
  ipAllowlist?: string[];

  /** Whether to enforce IP allowlist */
  ipEnforcementEnabled?: boolean;

  /** Rate limit (requests per minute) */
  rateLimitRpm?: number;

  /** Daily sync quota */
  dailySyncQuota?: number;

  /** Monthly data quota in MB */
  monthlyDataQuotaMb?: number;
}

/**
 * Input for updating API key settings
 */
export interface UpdateApiKeyInput {
  /** Update label */
  label?: string;

  /** Update metadata (merged with existing) */
  metadata?: ApiKeyMetadata;

  /** Update IP allowlist */
  ipAllowlist?: string[];

  /** Update IP enforcement */
  ipEnforcementEnabled?: boolean;

  /** Update rate limit */
  rateLimitRpm?: number;

  /** Update daily sync quota */
  dailySyncQuota?: number;

  /** Update monthly data quota */
  monthlyDataQuotaMb?: number;

  /** Update expiration */
  expiresAt?: Date | null;
}

/**
 * Input for rotating an API key
 */
export interface RotateApiKeyInput {
  /** Grace period in days (default: 7) */
  gracePeriodDays?: number;

  /** Optional new label for the rotated key */
  newLabel?: string;

  /** Preserve metadata from old key */
  preserveMetadata?: boolean;

  /** Preserve IP allowlist from old key */
  preserveIpAllowlist?: boolean;
}

/**
 * Input for revoking an API key
 */
export interface RevokeApiKeyInput {
  /** Reason for revocation */
  reason: ApiKeyRevocationReason;

  /** Optional notes */
  notes?: string;

  /** Whether to notify admins */
  notifyAdmins?: boolean;
}

// ============================================================================
// API Key Validation
// ============================================================================

/**
 * Result of API key validation
 */
export interface ApiKeyValidationResult {
  /** Whether the key is valid */
  valid: boolean;

  /** Error code if invalid */
  errorCode?:
    | "INVALID_FORMAT"
    | "KEY_NOT_FOUND"
    | "KEY_REVOKED"
    | "KEY_EXPIRED"
    | "KEY_SUSPENDED"
    | "KEY_PENDING"
    | "IP_NOT_ALLOWED"
    | "RATE_LIMIT_EXCEEDED"
    | "QUOTA_EXCEEDED";

  /** Human-readable error message */
  errorMessage?: string;

  /** API key record (if valid) */
  apiKey?: ApiKeyRecord;

  /** Decoded identity payload (if valid) */
  identity?: ApiKeyIdentity;
}

/**
 * API key record from database
 */
export interface ApiKeyRecord {
  apiKeyId: string;
  storeId: string;
  companyId: string;
  keyPrefix: string;
  keyHash: string;
  keySuffix: string;
  label: string | null;
  identityPayload: string;
  payloadVersion: number;
  metadata: ApiKeyMetadata | null;
  ipAllowlist: string[];
  ipEnforcementEnabled: boolean;
  rateLimitRpm: number;
  dailySyncQuota: number;
  monthlyDataQuotaMb: number;
  status: ApiKeyStatus;
  activatedAt: Date | null;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  lastSyncAt: Date | null;
  deviceFingerprint: string | null;
  revokedAt: Date | null;
  revokedBy: string | null;
  revocationReason: ApiKeyRevocationReason | null;
  revocationNotes: string | null;
  rotatedFromKeyId: string | null;
  rotationGraceEndsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

// ============================================================================
// Device Endpoints
// ============================================================================

/**
 * Request to activate API key on device
 */
export interface ActivateApiKeyRequest {
  /** Device fingerprint (SHA-256 of device identifiers) */
  deviceFingerprint: string;

  /** Desktop app version */
  appVersion: string;

  /** Operating system info */
  osInfo?: string;
}

/**
 * Response from API key activation
 */
export interface ActivateApiKeyResponse {
  /** Decoded identity for local storage */
  identity: {
    storeId: string;
    storeName: string;
    storePublicId: string;
    companyId: string;
    companyName: string;
    timezone: string;
    stateId?: string;
    stateCode?: string;
    offlinePermissions: string[];
    metadata: ApiKeyMetadata;
  };

  /** Offline token for local validation */
  offlineToken: string;

  /** When offline token expires */
  offlineTokenExpiresAt: string;

  /** Server time for clock sync */
  serverTime: string;

  /** How often to check revocation (seconds) */
  revocationCheckInterval: number;

  /** Store manager data for offline authentication (null if no store login configured) */
  storeManager: StoreManagerSyncRecord | null;
}

/**
 * Heartbeat request from device
 */
export interface HeartbeatRequest {
  /** Device fingerprint */
  deviceFingerprint: string;

  /** App version */
  appVersion: string;

  /** Last known sync sequence */
  lastSyncSequence?: number;
}

/**
 * Heartbeat response
 */
export interface HeartbeatResponse {
  /** Key status */
  status: "VALID" | "ROTATED" | "REVOKED" | "SUSPENDED";

  /** Server time */
  serverTime: string;

  /** Whether a new key is available (after rotation) */
  newKeyAvailable?: boolean;

  /** When grace period ends (if rotated) */
  gracePeriodEndsAt?: string;

  /** Whether new key is required (grace period ended) */
  newKeyRequired?: boolean;

  /** Message for display */
  message?: string;

  /** Next heartbeat interval (seconds) */
  nextHeartbeatInterval: number;

  /** Whether there are pending updates to sync */
  syncPending?: boolean;

  /** Number of pending records */
  pendingRecordCount?: number;
}

// ============================================================================
// Sync Protocol
// ============================================================================

/**
 * Request to start a sync session
 */
export interface SyncStartRequest {
  /** Device fingerprint */
  deviceFingerprint: string;

  /** App version */
  appVersion: string;

  /** OS info */
  osInfo?: string;

  /** Last completed sync sequence */
  lastSyncSequence: number;

  /** Seconds the device was offline */
  offlineDurationSeconds: number;
}

/**
 * Response from sync start
 */
export interface SyncStartResponse {
  /** Revocation status */
  revocationStatus: "VALID" | "REVOKED" | "ROTATED";

  /** Session ID (only if VALID) */
  sessionId?: string;

  /** Server time */
  serverTime?: string;

  /** Number of records pending pull */
  pullPendingCount?: number;

  /** Whether new key is available */
  newKeyAvailable?: boolean;

  /** Whether new key is required */
  newKeyRequired?: boolean;

  /** Grace period end (if rotated) */
  gracePeriodEndsAt?: string;

  /** Lockout message (if revoked) */
  lockoutMessage?: string;

  /** Admin contact info (if revoked) */
  adminContact?: string;
}

/**
 * Request to push offline data
 */
export interface SyncPushRequest {
  /** Session ID */
  sessionId: string;

  /** Offline transactions to push */
  transactions?: OfflineTransaction[];

  /** Offline lottery operations */
  lotteryOperations?: OfflineLotteryOperation[];
}

/**
 * Offline transaction created while device was offline
 */
export interface OfflineTransaction {
  /** Local transaction ID */
  localId: string;

  /** Transaction data */
  data: Record<string, unknown>;

  /** When created locally */
  createdAt: string;
}

/**
 * Offline lottery operation
 */
export interface OfflineLotteryOperation {
  /** Local operation ID */
  localId: string;

  /** Operation type */
  type: "pack_activate" | "pack_deplete" | "shift_close";

  /** Operation data */
  data: Record<string, unknown>;

  /** When created locally */
  createdAt: string;
}

/**
 * Response from sync push
 */
export interface SyncPushResponse {
  /** Number of records pushed successfully */
  pushedCount: number;

  /** Conflicts detected */
  conflicts: SyncConflict[];

  /** New server sequence */
  serverSequence: number;
}

/**
 * Sync conflict
 */
export interface SyncConflict {
  /** Local record ID */
  localId: string;

  /** Type of conflict */
  type: "DUPLICATE" | "VERSION_MISMATCH" | "VALIDATION_ERROR";

  /** Conflict message */
  message: string;

  /** Server record (if applicable) */
  serverRecord?: Record<string, unknown>;
}

/**
 * Request to pull server updates
 */
export interface SyncPullRequest {
  /** Session ID */
  sessionId: string;

  /** Pull records since this sequence */
  sinceSequence: number;

  /** Maximum records to pull */
  limit: number;
}

/**
 * Response from sync pull
 */
export interface SyncPullResponse {
  /** Records to sync */
  records: SyncRecord[];

  /** New sequence number */
  newSequence: number;

  /** Whether there are more records */
  hasMore: boolean;
}

/**
 * Record from server sync
 */
export interface SyncRecord {
  /** Record type */
  type: string;

  /** Record ID */
  id: string;

  /** Operation: create, update, delete */
  operation: "create" | "update" | "delete";

  /** Record data */
  data: Record<string, unknown>;

  /** Sequence number */
  sequence: number;

  /** When modified on server */
  modifiedAt: string;
}

/**
 * Request to complete sync session
 */
export interface SyncCompleteRequest {
  /** Session ID */
  sessionId: string;

  /** Final sequence number */
  finalSequence: number;

  /** Sync statistics */
  stats: {
    pulled: number;
    pushed: number;
    conflictsResolved: number;
  };
}

// ============================================================================
// Audit Types
// ============================================================================

/**
 * Audit event input
 */
export interface ApiKeyAuditEventInput {
  /** API key ID */
  apiKeyId: string;

  /** Event type */
  eventType: ApiKeyAuditEventType;

  /** Actor user ID (null for system/device) */
  actorUserId?: string;

  /** Actor type */
  actorType: "ADMIN" | "SYSTEM" | "DEVICE";

  /** IP address */
  ipAddress?: string;

  /** User agent */
  userAgent?: string;

  /** Additional event details */
  eventDetails?: Record<string, unknown>;
}

/**
 * Audit event record
 */
export interface ApiKeyAuditEventRecord {
  auditEventId: string;
  apiKeyId: string;
  eventType: ApiKeyAuditEventType;
  actorUserId: string | null;
  actorType: string;
  ipAddress: string | null;
  userAgent: string | null;
  eventDetails: Record<string, unknown> | null;
  createdAt: Date;
}

// ============================================================================
// Admin API Types
// ============================================================================

/**
 * API key list item (for admin listing)
 */
export interface ApiKeyListItem {
  apiKeyId: string;
  storeId: string;
  storeName: string;
  storePublicId: string;
  companyId: string;
  companyName: string;
  keyPrefix: string;
  keySuffix: string;
  label: string | null;
  status: ApiKeyStatus;
  activatedAt: Date | null;
  lastUsedAt: Date | null;
  lastSyncAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  createdByName: string;
}

/**
 * API key details (for admin view)
 */
export interface ApiKeyDetails extends ApiKeyListItem {
  metadata: ApiKeyMetadata | null;
  ipAllowlist: string[];
  ipEnforcementEnabled: boolean;
  rateLimitRpm: number;
  dailySyncQuota: number;
  monthlyDataQuotaMb: number;
  deviceFingerprint: string | null;
  rotatedFromKeyId: string | null;
  rotationGraceEndsAt: Date | null;
  revokedAt: Date | null;
  revokedBy: string | null;
  revokedByName: string | null;
  revocationReason: ApiKeyRevocationReason | null;
  revocationNotes: string | null;
  timezone: string;
  stateCode: string | null;
}

/**
 * Filter options for listing API keys
 */
export interface ApiKeyListFilter {
  /** Filter by store ID */
  storeId?: string;

  /** Filter by company ID */
  companyId?: string;

  /** Filter by status */
  status?: ApiKeyStatus;

  /** Search by label or store name */
  search?: string;

  /** Include expired keys */
  includeExpired?: boolean;

  /** Include revoked keys */
  includeRevoked?: boolean;
}

/**
 * Pagination options
 */
export interface ApiKeyPaginationOptions {
  /** Page number (1-based) */
  page?: number;

  /** Items per page */
  limit?: number;

  /** Sort field */
  sortBy?: "createdAt" | "lastUsedAt" | "storeName" | "status";

  /** Sort direction */
  sortOrder?: "asc" | "desc";
}

/**
 * Paginated API key list response
 */
export interface ApiKeyListResponse {
  /** API keys */
  items: ApiKeyListItem[];

  /** Total count */
  total: number;

  /** Current page */
  page: number;

  /** Items per page */
  limit: number;

  /** Total pages */
  totalPages: number;
}

// ============================================================================
// Cashier Sync Types (Enterprise POS Pattern)
// ============================================================================

/**
 * Cashier data for offline authentication
 * Following enterprise POS patterns (NCR Aloha, Microsoft Dynamics 365)
 *
 * Security: PIN hashes stored locally enable offline authentication
 * when internet connectivity is unavailable. This is standard industry
 * practice for enterprise POS systems.
 */
export interface CashierSyncRecord {
  /** Unique cashier identifier */
  cashierId: string;

  /** 4-digit employee ID (display code) */
  employeeId: string;

  /** Cashier display name */
  name: string;

  /** bcrypt-hashed PIN for offline authentication */
  pinHash: string;

  /** Whether cashier is active */
  isActive: boolean;

  /** When cashier was disabled (soft delete) */
  disabledAt: string | null;

  /** Last modified timestamp for delta sync */
  updatedAt: string;

  /** Sync sequence number for ordering */
  syncSequence: number;
}

// ============================================================================
// Store Manager Sync Types (Enterprise POS Pattern)
// ============================================================================

/**
 * Store manager data for offline authentication
 * Following enterprise POS patterns for manager override/approval operations
 *
 * Security: PIN hash stored locally enables offline manager authentication
 * for operations like void approval, safe drops, and end-of-day reconciliation.
 * Password hash is NEVER included - only PIN for terminal operations.
 */
export interface StoreManagerSyncRecord {
  /** Unique user identifier */
  userId: string;

  /** User's public ID (display code) */
  publicId: string;

  /** Store manager display name */
  name: string;

  /** Store manager email (for identification/display) */
  email: string;

  /** bcrypt-hashed PIN for offline authentication (null if not set) */
  pinHash: string | null;

  /** Whether manager is active */
  isActive: boolean;

  /** Role information for this store */
  role: {
    /** Role code (e.g., "STORE_MANAGER", "CLIENT_OWNER") */
    code: string;
    /** Role description */
    description: string | null;
  };

  /** Store assignments for this user (the specific store this key is bound to) */
  storeAssignments: Array<{
    storeId: string;
    storeName: string;
    storePublicId: string;
  }>;

  /** Permissions granted to this user for offline operations */
  permissions: string[];

  /** Last modified timestamp for delta sync */
  updatedAt: string;

  /** Sync sequence number for ordering */
  syncSequence: number;
}

/**
 * Query parameters for cashier sync endpoint
 */
export interface CashierSyncQuery {
  /** Session ID from sync/start */
  sessionId: string;

  /** Only fetch records modified after this timestamp (ISO 8601) */
  sinceTimestamp?: string;

  /** Only fetch records with sequence > this value */
  sinceSequence?: number;

  /** Include inactive (soft-deleted) cashiers */
  includeInactive?: boolean;

  /** Maximum records to return (default: 100, max: 500) */
  limit?: number;
}

/**
 * Response from cashier sync endpoint
 */
export interface CashierSyncResponse {
  /** Cashier records */
  cashiers: CashierSyncRecord[];

  /** Total count matching query */
  totalCount: number;

  /** Current sync sequence (for delta sync) */
  currentSequence: number;

  /** Whether more records are available */
  hasMore: boolean;

  /** Server timestamp for clock sync */
  serverTime: string;

  /** Next sync cursor (use as sinceSequence in next request) */
  nextCursor?: number;
}

/**
 * Cashier authentication request (offline-capable)
 */
export interface CashierOfflineAuthRequest {
  /** 4-digit employee ID */
  employeeId: string;

  /** 4-digit PIN (will be verified against local hash) */
  pin: string;

  /** Device fingerprint for audit */
  deviceFingerprint: string;
}

/**
 * Cashier authentication response
 */
export interface CashierOfflineAuthResponse {
  /** Whether authentication succeeded */
  success: boolean;

  /** Authenticated cashier info (if success) */
  cashier?: {
    cashierId: string;
    employeeId: string;
    name: string;
  };

  /** Error code (if failure) */
  errorCode?: "INVALID_CREDENTIALS" | "CASHIER_INACTIVE" | "CASHIER_NOT_FOUND";

  /** Error message */
  errorMessage?: string;
}

// ============================================================================
// Re-export Prisma enums
// ============================================================================

// ============================================================================
// Store Reset Types
// ============================================================================

/**
 * Store reset type options
 */
export type StoreResetType = "FULL_RESET" | "LOTTERY_ONLY" | "SYNC_STATE";

/**
 * Request to reset store data on Desktop App
 */
export interface StoreResetRequest {
  /** Type of reset operation */
  resetType: StoreResetType;

  /** Device fingerprint for audit trail */
  deviceFingerprint: string;

  /** Reason for the reset */
  reason: string;

  /** App version performing the reset */
  appVersion: string;

  /** Confirmation flag */
  confirmed: true;
}

/**
 * Response from store reset endpoint
 */
export interface StoreResetResponse {
  /** Whether reset authorization was successful */
  authorized: boolean;

  /** Reset type that was authorized */
  resetType: StoreResetType;

  /** Server timestamp for audit correlation */
  serverTime: string;

  /** Audit reference ID for tracking */
  auditReferenceId: string;

  /** Instructions for client-side reset execution */
  instructions: {
    /** Tables/data that should be cleared */
    clearTargets: string[];
    /** Whether to re-sync after reset */
    resyncRequired: boolean;
  };
}

// ============================================================================
// Re-export Prisma enums
// ============================================================================

export type {
  ApiKeyStatus,
  ApiKeyRevocationReason,
  ApiKeyAuditEventType,
} from "@prisma/client";
