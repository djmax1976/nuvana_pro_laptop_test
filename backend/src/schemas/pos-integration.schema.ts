/**
 * POS Integration Validation Schemas
 *
 * Zod schemas for validating POS integration API payloads.
 * Phase 1.6: POS Integration & Auto-Onboarding
 *
 * @module schemas/pos-integration.schema
 */

import { z } from "zod";

/**
 * POS System Type enum validation
 * Matches Prisma POSSystemType enum
 */
export const POSSystemTypeSchema = z.enum([
  "GILBARCO_PASSPORT",
  "GILBARCO_NAXML", // Gilbarco Passport NAXML file-based exchange (XMLGateway)
  "GILBARCO_COMMANDER",
  "VERIFONE_RUBY2",
  "VERIFONE_COMMANDER",
  "VERIFONE_SAPPHIRE",
  "CLOVER_REST",
  "ORACLE_SIMPHONY",
  "NCR_ALOHA",
  "LIGHTSPEED_REST",
  "SQUARE_REST",
  "TOAST_REST",
  "GENERIC_XML",
  "GENERIC_REST",
  "MANUAL_ENTRY",
]);

/**
 * POS Auth Type enum validation
 * Matches Prisma POSAuthType enum
 */
export const POSAuthTypeSchema = z.enum([
  "NONE",
  "API_KEY",
  "BASIC_AUTH",
  "OAUTH2",
  "CERTIFICATE",
  "CUSTOM",
]);

/**
 * POS Sync Status enum validation
 * Matches Prisma POSSyncStatus enum
 */
export const POSSyncStatusSchema = z.enum([
  "PENDING",
  "IN_PROGRESS",
  "SUCCESS",
  "PARTIAL_SUCCESS",
  "FAILED",
  "TIMEOUT",
  "AUTH_ERROR",
  "CONNECTION_ERROR",
]);

/**
 * API Key credentials schema
 */
const ApiKeyCredentialsSchema = z.object({
  type: z.literal("API_KEY"),
  api_key: z.string().min(1, "API key is required"),
  header_name: z.string().optional().default("X-API-Key"),
});

/**
 * Basic Auth credentials schema
 */
const BasicAuthCredentialsSchema = z.object({
  type: z.literal("BASIC_AUTH"),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

/**
 * OAuth2 credentials schema
 */
const OAuth2CredentialsSchema = z.object({
  type: z.literal("OAUTH2"),
  client_id: z.string().min(1, "Client ID is required"),
  client_secret: z.string().min(1, "Client secret is required"),
  token_url: z.string().url("Token URL must be a valid URL"),
  scope: z.string().optional(),
});

/**
 * Certificate credentials schema
 */
const CertificateCredentialsSchema = z.object({
  type: z.literal("CERTIFICATE"),
  certificate: z.string().min(1, "Certificate is required"),
  private_key: z.string().min(1, "Private key is required"),
  passphrase: z.string().optional(),
});

/**
 * No auth credentials schema
 */
const NoAuthCredentialsSchema = z.object({
  type: z.literal("NONE"),
});

/**
 * Custom auth credentials schema
 */
const CustomCredentialsSchema = z.object({
  type: z.literal("CUSTOM"),
  custom_config: z.record(z.string(), z.unknown()),
});

/**
 * Union of all credential types
 */
export const POSCredentialsSchema = z.discriminatedUnion("type", [
  ApiKeyCredentialsSchema,
  BasicAuthCredentialsSchema,
  OAuth2CredentialsSchema,
  CertificateCredentialsSchema,
  NoAuthCredentialsSchema,
  CustomCredentialsSchema,
]);

/**
 * Store ID parameter validation
 */
export const StoreIdParamSchema = z.object({
  storeId: z.string().uuid("Store ID must be a valid UUID"),
});

/**
 * Integration ID parameter validation
 */
export const IntegrationIdParamSchema = z.object({
  storeId: z.string().uuid("Store ID must be a valid UUID"),
  integrationId: z.string().uuid("Integration ID must be a valid UUID"),
});

/**
 * Create/Update POS Integration Request Schema
 * Validates the request body for POST/PUT /api/stores/:storeId/pos-integration
 */
export const POSIntegrationCreateSchema = z.object({
  pos_type: POSSystemTypeSchema,
  connection_name: z
    .string()
    .min(1, "Connection name is required")
    .max(100, "Connection name must be at most 100 characters"),
  host: z
    .string()
    .min(1, "Host is required")
    .max(255, "Host must be at most 255 characters"),
  port: z
    .number()
    .int()
    .min(1, "Port must be between 1 and 65535")
    .max(65535, "Port must be between 1 and 65535"),
  use_ssl: z.boolean().default(true),
  base_path: z
    .string()
    .max(255, "Base path must be at most 255 characters")
    .optional(),
  auth_type: POSAuthTypeSchema,
  credentials: POSCredentialsSchema,
  timeout_ms: z
    .number()
    .int()
    .min(1000, "Timeout must be at least 1000ms")
    .max(120000, "Timeout must be at most 120000ms")
    .default(30000),
  // Sync settings
  sync_enabled: z.boolean().default(true),
  sync_interval_minutes: z
    .number()
    .int()
    .min(5, "Sync interval must be at least 5 minutes")
    .max(1440, "Sync interval must be at most 1440 minutes (24 hours)")
    .default(60),
  sync_departments: z.boolean().default(true),
  sync_tender_types: z.boolean().default(true),
  sync_cashiers: z.boolean().default(true),
  sync_tax_rates: z.boolean().default(true),
});

/**
 * Update POS Integration Request Schema
 * All fields are optional for partial updates
 */
export const POSIntegrationUpdateSchema = z.object({
  connection_name: z
    .string()
    .min(1, "Connection name is required")
    .max(100, "Connection name must be at most 100 characters")
    .optional(),
  host: z
    .string()
    .min(1, "Host is required")
    .max(255, "Host must be at most 255 characters")
    .optional(),
  port: z
    .number()
    .int()
    .min(1, "Port must be between 1 and 65535")
    .max(65535, "Port must be between 1 and 65535")
    .optional(),
  use_ssl: z.boolean().optional(),
  base_path: z
    .string()
    .max(255, "Base path must be at most 255 characters")
    .optional(),
  auth_type: POSAuthTypeSchema.optional(),
  credentials: POSCredentialsSchema.optional(),
  timeout_ms: z
    .number()
    .int()
    .min(1000, "Timeout must be at least 1000ms")
    .max(120000, "Timeout must be at most 120000ms")
    .optional(),
  // File paths for file-based POS systems (Gilbarco NAXML, Verifone, etc.)
  // SEC-014: INPUT_VALIDATION - Path length validation
  export_path: z
    .string()
    .max(1024, "Export path must be at most 1024 characters")
    .optional(),
  import_path: z
    .string()
    .max(1024, "Import path must be at most 1024 characters")
    .optional(),
  // Sync settings
  sync_enabled: z.boolean().optional(),
  sync_interval_minutes: z
    .number()
    .int()
    .min(5, "Sync interval must be at least 5 minutes")
    .max(1440, "Sync interval must be at most 1440 minutes (24 hours)")
    .optional(),
  sync_departments: z.boolean().optional(),
  sync_tender_types: z.boolean().optional(),
  sync_cashiers: z.boolean().optional(),
  sync_tax_rates: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

/**
 * Query parameters for listing sync logs
 */
export const POSSyncLogQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 20))
    .pipe(z.number().int().min(1).max(100)),
  offset: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 0))
    .pipe(z.number().int().min(0)),
  status: POSSyncStatusSchema.optional(),
  from_date: z
    .string()
    .optional()
    .refine((val) => !val || !isNaN(Date.parse(val)), "Invalid date format"),
  to_date: z
    .string()
    .optional()
    .refine((val) => !val || !isNaN(Date.parse(val)), "Invalid date format"),
});

/**
 * Manual sync trigger request schema
 */
export const POSSyncTriggerSchema = z.object({
  sync_departments: z.boolean().default(true),
  sync_tender_types: z.boolean().default(true),
  sync_cashiers: z.boolean().default(true),
  sync_tax_rates: z.boolean().default(true),
});

/**
 * Connection Test Request Schema
 *
 * Validates the optional request body for POST /api/stores/:storeId/pos-integration/test
 *
 * SEC-014: INPUT_VALIDATION - Schema validation for connection test parameters
 * API-001: VALIDATION - Schema validation before business logic
 *
 * Two modes:
 * 1. Empty body: Test existing saved integration
 * 2. Body with config: Test new configuration before saving (pre-save validation)
 *
 * This enables the setup wizard flow where users test connection BEFORE saving.
 * Note: Uses .passthrough() to allow extra fields (like sync options) from the
 * CreatePOSIntegrationRequest that may be sent by the frontend during setup.
 * These extra fields are simply ignored - only connection-relevant fields are used.
 */
export const POSConnectionTestSchema = z
  .object({
    /** POS system type - required for pre-save testing */
    pos_type: POSSystemTypeSchema,
    /**
     * Host/IP address or file path for file-based POS
     * SEC-014: Validated for max length to prevent buffer overflow attacks
     */
    host: z
      .string()
      .min(1, "Host is required")
      .max(1024, "Host must be at most 1024 characters"),
    /** Port number for network-based connections */
    port: z
      .number()
      .int()
      .min(1, "Port must be between 1 and 65535")
      .max(65535, "Port must be between 1 and 65535")
      .optional()
      .default(8080),
    /** Whether to use SSL/TLS */
    use_ssl: z.boolean().optional().default(true),
    /** Authentication type */
    auth_type: POSAuthTypeSchema.optional().default("NONE"),
    /** Authentication credentials (optional, depends on auth_type) */
    credentials: POSCredentialsSchema.optional(),
    /**
     * File paths for file-based POS systems (Gilbarco NAXML, Verifone, etc.)
     * SEC-014: These are validated but actual path traversal protection
     * is handled by the adapter layer
     */
    export_path: z
      .string()
      .max(1024, "Export path must be at most 1024 characters")
      .optional(),
    import_path: z
      .string()
      .max(1024, "Import path must be at most 1024 characters")
      .optional(),
  })
  .passthrough() // Allow extra fields (sync options, etc.) - they're ignored
  .optional(); // Entire body is optional (empty = test existing integration)

/**
 * Type inference for connection test schema
 */
export type POSConnectionTest = z.infer<typeof POSConnectionTestSchema>;

/**
 * Type inference from schemas
 */
export type POSSystemType = z.infer<typeof POSSystemTypeSchema>;
export type POSAuthType = z.infer<typeof POSAuthTypeSchema>;
export type POSSyncStatus = z.infer<typeof POSSyncStatusSchema>;
export type POSCredentials = z.infer<typeof POSCredentialsSchema>;
export type POSIntegrationCreate = z.infer<typeof POSIntegrationCreateSchema>;
export type POSIntegrationUpdate = z.infer<typeof POSIntegrationUpdateSchema>;
export type POSSyncLogQuery = z.infer<typeof POSSyncLogQuerySchema>;
export type POSSyncTrigger = z.infer<typeof POSSyncTriggerSchema>;
export type POSConnectionTestInput = z.infer<typeof POSConnectionTestSchema>;
export type StoreIdParam = z.infer<typeof StoreIdParamSchema>;
export type IntegrationIdParam = z.infer<typeof IntegrationIdParamSchema>;

/**
 * Validate create POS integration input
 */
export function validatePOSIntegrationCreate(
  data: unknown,
): POSIntegrationCreate {
  return POSIntegrationCreateSchema.parse(data);
}

/**
 * Validate update POS integration input
 */
export function validatePOSIntegrationUpdate(
  data: unknown,
): POSIntegrationUpdate {
  return POSIntegrationUpdateSchema.parse(data);
}

/**
 * Safe validation for sync log query
 */
export function safeValidatePOSSyncLogQuery(data: unknown) {
  return POSSyncLogQuerySchema.safeParse(data);
}

/**
 * Safe validation for sync trigger
 */
export function safeValidatePOSSyncTrigger(data: unknown) {
  return POSSyncTriggerSchema.safeParse(data);
}
