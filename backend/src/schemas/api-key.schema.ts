/**
 * API Key Validation Schemas
 *
 * Zod schemas for API key management endpoints.
 * Enforces strict input validation for enterprise-grade security.
 *
 * @module schemas/api-key.schema
 */

import { z } from "zod";

// =============================================================================
// Constants
// =============================================================================

/** Valid API key statuses */
export const API_KEY_STATUSES = [
  "ACTIVE",
  "REVOKED",
  "EXPIRED",
  "PENDING",
  "SUSPENDED",
] as const;

/** Valid revocation reasons */
export const REVOCATION_REASONS = [
  "ROTATION",
  "COMPROMISED",
  "STORE_CLOSED",
  "ADMIN_ACTION",
  "QUOTA_ABUSE",
] as const;

// =============================================================================
// Base Schemas
// =============================================================================

/** UUID validation */
const uuidSchema = z.string().uuid("Invalid UUID format");

/** IP address or CIDR validation */
const ipAddressSchema = z.string().refine(
  (val) => {
    // Allow empty strings (will be filtered)
    if (!val) return true;
    // IPv4 - bounded repetition, safe from ReDoS
    // eslint-disable-next-line security/detect-unsafe-regex
    const ipv4 = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    // IPv6 (simplified) - bounded repetition, safe from ReDoS
    // eslint-disable-next-line security/detect-unsafe-regex
    const ipv6 = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}(\/\d{1,3})?$/;
    return ipv4.test(val) || ipv6.test(val);
  },
  { message: "Invalid IP address or CIDR notation" },
);

/** Label validation */
const labelSchema = z
  .string()
  .min(1, "Label must be at least 1 character")
  .max(100, "Label must be at most 100 characters")
  .regex(
    /^[a-zA-Z0-9\s\-_]+$/,
    "Label can only contain letters, numbers, spaces, hyphens, and underscores",
  )
  .optional();

/** Rate limit validation */
const rateLimitSchema = z
  .number()
  .int("Rate limit must be an integer")
  .min(1, "Rate limit must be at least 1")
  .max(10000, "Rate limit cannot exceed 10000 RPM")
  .optional();

/** Quota validation */
const quotaSchema = z
  .number()
  .int("Quota must be an integer")
  .min(1, "Quota must be at least 1")
  .max(1000000, "Quota exceeds maximum allowed")
  .optional();

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Create API Key Request Schema
 */
export const createApiKeySchema = z.object({
  store_id: uuidSchema,

  label: labelSchema,

  expires_at: z
    .string()
    .datetime("expires_at must be a valid ISO 8601 datetime")
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        return new Date(val) > new Date();
      },
      { message: "Expiration date must be in the future" },
    ),

  metadata: z.record(z.string(), z.unknown()).optional(),

  ip_allowlist: z
    .array(ipAddressSchema)
    .max(50, "IP allowlist cannot exceed 50 entries")
    .optional(),

  ip_enforcement_enabled: z.boolean().optional(),

  rate_limit_rpm: rateLimitSchema,

  daily_sync_quota: quotaSchema,

  monthly_data_quota_mb: quotaSchema,
});

/**
 * Update API Key Request Schema
 */
export const updateApiKeySchema = z
  .object({
    label: labelSchema,

    metadata: z.record(z.string(), z.unknown()).optional(),

    ip_allowlist: z.array(ipAddressSchema).max(50).optional(),

    ip_enforcement_enabled: z.boolean().optional(),

    rate_limit_rpm: rateLimitSchema,

    daily_sync_quota: quotaSchema,

    monthly_data_quota_mb: quotaSchema,

    expires_at: z
      .string()
      .datetime()
      .nullable()
      .optional()
      .refine(
        (val) => {
          if (val === null || val === undefined) return true;
          return new Date(val) > new Date();
        },
        { message: "Expiration date must be in the future" },
      ),
  })
  .refine(
    (data) => {
      // At least one field must be provided
      return Object.values(data).some((v) => v !== undefined);
    },
    { message: "At least one field must be provided for update" },
  );

/**
 * Rotate API Key Request Schema
 */
export const rotateApiKeySchema = z.object({
  grace_period_days: z
    .number()
    .int("Grace period must be an integer")
    .min(0, "Grace period cannot be negative")
    .max(30, "Grace period cannot exceed 30 days")
    .optional()
    .default(7),

  new_label: labelSchema,

  preserve_metadata: z.boolean().optional().default(true),

  preserve_ip_allowlist: z.boolean().optional().default(true),
});

/**
 * Revoke API Key Request Schema
 */
export const revokeApiKeySchema = z.object({
  reason: z.enum(REVOCATION_REASONS, {
    message: `Reason must be one of: ${REVOCATION_REASONS.join(", ")}`,
  }),

  notes: z.string().max(1000, "Notes cannot exceed 1000 characters").optional(),

  notify_admins: z.boolean().optional().default(false),
});

/**
 * Suspend API Key Request Schema
 */
export const suspendApiKeySchema = z.object({
  reason: z
    .string()
    .min(1, "Reason is required")
    .max(500, "Reason cannot exceed 500 characters"),
});

/**
 * List API Keys Query Schema
 */
export const listApiKeysQuerySchema = z.object({
  store_id: uuidSchema.optional(),
  company_id: uuidSchema.optional(),
  status: z.enum(API_KEY_STATUSES).optional(),
  search: z.string().max(100).optional(),
  include_expired: z
    .string()
    .transform((v) => v === "true")
    .optional(),
  include_revoked: z
    .string()
    .transform((v) => v === "true")
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort_by: z
    .enum(["createdAt", "lastUsedAt", "storeName", "status"])
    .optional()
    .default("createdAt"),
  sort_order: z.enum(["asc", "desc"]).optional().default("desc"),
});

// =============================================================================
// Device API Schemas
// =============================================================================

/**
 * Activate API Key Request Schema
 */
export const activateApiKeySchema = z.object({
  deviceFingerprint: z
    .string()
    .min(32, "Device fingerprint must be at least 32 characters")
    .max(64, "Device fingerprint cannot exceed 64 characters")
    .regex(/^[a-fA-F0-9]+$/, "Device fingerprint must be a hex string"),

  appVersion: z
    .string()
    .min(1, "App version is required")
    .max(50, "App version cannot exceed 50 characters"),

  osInfo: z.string().max(100).optional(),
});

/**
 * Heartbeat Request Schema
 */
export const heartbeatSchema = z.object({
  deviceFingerprint: z
    .string()
    .min(32)
    .max(64)
    .regex(/^[a-fA-F0-9]+$/),

  appVersion: z.string().min(1).max(50),

  lastSyncSequence: z.number().int().min(0).optional(),
});

/**
 * Sync Start Request Schema
 */
export const syncStartSchema = z.object({
  deviceFingerprint: z
    .string()
    .min(32)
    .max(64)
    .regex(/^[a-fA-F0-9]+$/),

  appVersion: z.string().min(1).max(50),

  osInfo: z.string().max(100).optional(),

  lastSyncSequence: z.number().int().min(0).default(0),

  offlineDurationSeconds: z.number().int().min(0).default(0),
});

/**
 * Sync Push Request Schema
 */
export const syncPushSchema = z.object({
  sessionId: uuidSchema,

  transactions: z
    .array(
      z.object({
        localId: z.string().min(1).max(100),
        data: z.record(z.string(), z.unknown()),
        createdAt: z.string().datetime(),
      }),
    )
    .max(1000, "Cannot push more than 1000 transactions at once")
    .optional(),

  lotteryOperations: z
    .array(
      z.object({
        localId: z.string().min(1).max(100),
        type: z.enum(["pack_activate", "pack_deplete", "shift_close"]),
        data: z.record(z.string(), z.unknown()),
        createdAt: z.string().datetime(),
      }),
    )
    .max(500, "Cannot push more than 500 lottery operations at once")
    .optional(),
});

/**
 * Sync Pull Query Schema
 */
export const syncPullQuerySchema = z.object({
  session_id: uuidSchema,
  since_sequence: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});

/**
 * Sync Complete Request Schema
 */
export const syncCompleteSchema = z.object({
  sessionId: uuidSchema,

  finalSequence: z.number().int().min(0),

  stats: z.object({
    pulled: z.number().int().min(0),
    pushed: z.number().int().min(0),
    conflictsResolved: z.number().int().min(0),
  }),
});

// =============================================================================
// Employee Sync Schemas (Unified Enterprise POS Pattern)
// =============================================================================

/**
 * Employee Sync Query Schema
 * Validates query parameters for unified employee data synchronization
 * Includes: Store Managers, Shift Managers, Cashiers
 */
export const employeeSyncQuerySchema = z.object({
  session_id: z.string().uuid("session_id must be a valid UUID"),

  since_timestamp: z
    .string()
    .datetime("since_timestamp must be a valid ISO 8601 datetime")
    .optional(),

  since_sequence: z.coerce
    .number()
    .int("since_sequence must be an integer")
    .min(0, "since_sequence cannot be negative")
    .optional(),

  include_inactive: z
    .string()
    .transform((v) => v === "true")
    .optional(),

  limit: z.coerce
    .number()
    .int("limit must be an integer")
    .min(1, "limit must be at least 1")
    .max(500, "limit cannot exceed 500")
    .default(100),
});

// =============================================================================
// Cashier Sync Schemas (Enterprise POS Pattern)
// =============================================================================

/**
 * Cashier Sync Query Schema
 * Validates query parameters for cashier data synchronization
 */
export const cashierSyncQuerySchema = z.object({
  session_id: uuidSchema,

  since_timestamp: z
    .string()
    .datetime("since_timestamp must be a valid ISO 8601 datetime")
    .optional(),

  since_sequence: z.coerce
    .number()
    .int("since_sequence must be an integer")
    .min(0, "since_sequence cannot be negative")
    .optional(),

  include_inactive: z
    .string()
    .transform((v) => v === "true")
    .optional(),

  limit: z.coerce
    .number()
    .int("limit must be an integer")
    .min(1, "limit must be at least 1")
    .max(500, "limit cannot exceed 500")
    .default(100),
});

/**
 * Cashier Offline Authentication Schema
 * Validates request body for offline cashier authentication
 */
export const cashierOfflineAuthSchema = z.object({
  employeeId: z
    .string()
    .regex(/^\d{4}$/, "Employee ID must be exactly 4 numeric digits"),

  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 numeric digits"),

  deviceFingerprint: z
    .string()
    .min(32, "Device fingerprint must be at least 32 characters")
    .max(64, "Device fingerprint cannot exceed 64 characters")
    .regex(/^[a-fA-F0-9]+$/, "Device fingerprint must be a hex string"),
});

// =============================================================================
// Type Exports
// =============================================================================

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>;
export type RotateApiKeyInput = z.infer<typeof rotateApiKeySchema>;
export type RevokeApiKeyInput = z.infer<typeof revokeApiKeySchema>;
export type SuspendApiKeyInput = z.infer<typeof suspendApiKeySchema>;
export type ListApiKeysQuery = z.infer<typeof listApiKeysQuerySchema>;
export type ActivateApiKeyInput = z.infer<typeof activateApiKeySchema>;
export type HeartbeatInput = z.infer<typeof heartbeatSchema>;
export type SyncStartInput = z.infer<typeof syncStartSchema>;
export type SyncPushInput = z.infer<typeof syncPushSchema>;
export type SyncPullQuery = z.infer<typeof syncPullQuerySchema>;
export type SyncCompleteInput = z.infer<typeof syncCompleteSchema>;
export type CashierSyncQuery = z.infer<typeof cashierSyncQuerySchema>;
export type CashierOfflineAuthInput = z.infer<typeof cashierOfflineAuthSchema>;
export type EmployeeSyncQuery = z.infer<typeof employeeSyncQuerySchema>;
