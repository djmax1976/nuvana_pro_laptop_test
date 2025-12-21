/**
 * NAXML Validation Schemas
 *
 * Zod schemas for validating NAXML-related API payloads.
 * Phase 1: NAXML Core Infrastructure
 *
 * @module schemas/naxml.schema
 */

import { z } from "zod";

// ============================================================================
// Enum Schemas
// ============================================================================

/**
 * NAXML File Status enum validation
 */
export const NAXMLFileStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "SUCCESS",
  "PARTIAL",
  "FAILED",
  "SKIPPED",
]);

/**
 * NAXML File Direction enum validation
 */
export const NAXMLFileDirectionSchema = z.enum(["IMPORT", "EXPORT"]);

/**
 * NAXML Document Type enum validation
 */
export const NAXMLDocumentTypeSchema = z.enum([
  "PriceBookMaintenance",
  "TransactionDocument",
  "InventoryMovement",
  "EmployeeMaintenance",
  "TenderMaintenance",
  "DepartmentMaintenance",
  "TaxRateMaintenance",
  "Acknowledgment",
]);

/**
 * NAXML Version enum validation
 */
export const NAXMLVersionSchema = z.enum(["3.2", "3.4", "4.0"]);

/**
 * Connection Mode enum validation
 */
export const ConnectionModeSchema = z.enum(["API", "FILE_EXCHANGE", "HYBRID"]);

// ============================================================================
// Parameter Schemas
// ============================================================================

/**
 * Store ID parameter validation
 */
export const StoreIdParamSchema = z.object({
  storeId: z.string().uuid("Store ID must be a valid UUID"),
});

/**
 * File Log ID parameter validation
 */
export const FileLogIdParamSchema = z.object({
  storeId: z.string().uuid("Store ID must be a valid UUID"),
  fileLogId: z.string().uuid("File Log ID must be a valid UUID"),
});

// ============================================================================
// Query Schemas
// ============================================================================

/**
 * NAXML File Log Query Parameters
 */
export const NAXMLFileLogQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 50))
    .pipe(z.number().int().min(1).max(200)),
  offset: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 0))
    .pipe(z.number().int().min(0)),
  status: NAXMLFileStatusSchema.optional(),
  file_type: NAXMLDocumentTypeSchema.optional(),
  direction: NAXMLFileDirectionSchema.optional(),
  from_date: z
    .string()
    .optional()
    .refine((val) => !val || !isNaN(Date.parse(val)), "Invalid date format"),
  to_date: z
    .string()
    .optional()
    .refine((val) => !val || !isNaN(Date.parse(val)), "Invalid date format"),
});

// ============================================================================
// File Watcher Config Schemas
// ============================================================================

/**
 * File pattern validation (glob patterns)
 */
const FilePatternSchema = z
  .string()
  .min(1, "File pattern cannot be empty")
  .max(100, "File pattern too long")
  .regex(/^[\w\*\?\.\-\[\]]+$/i, "Invalid file pattern characters");

/**
 * Path validation (security: prevent path traversal)
 */
const SafePathSchema = z
  .string()
  .min(1, "Path cannot be empty")
  .max(500, "Path too long")
  .refine(
    (path) => !path.includes(".."),
    "Path cannot contain parent directory references (..)",
  )
  .refine(
    (path) => !path.includes("~"),
    "Path cannot contain home directory references (~)",
  );

/**
 * Create File Watcher Config Request Schema
 */
export const FileWatcherConfigCreateSchema = z.object({
  watch_path: SafePathSchema,
  processed_path: SafePathSchema.optional(),
  error_path: SafePathSchema.optional(),
  file_patterns: z
    .array(FilePatternSchema)
    .min(1, "At least one file pattern is required")
    .max(20, "Maximum 20 file patterns allowed")
    .default(["*.xml", "TLog*.xml", "Dept*.xml"]),
  poll_interval_seconds: z
    .number()
    .int()
    .min(10, "Poll interval must be at least 10 seconds")
    .max(3600, "Poll interval must be at most 3600 seconds (1 hour)")
    .default(60),
  is_active: z.boolean().default(true),
});

/**
 * Update File Watcher Config Request Schema
 */
export const FileWatcherConfigUpdateSchema = z.object({
  watch_path: SafePathSchema.optional(),
  processed_path: SafePathSchema.optional().nullable(),
  error_path: SafePathSchema.optional().nullable(),
  file_patterns: z
    .array(FilePatternSchema)
    .min(1, "At least one file pattern is required")
    .max(20, "Maximum 20 file patterns allowed")
    .optional(),
  poll_interval_seconds: z
    .number()
    .int()
    .min(10, "Poll interval must be at least 10 seconds")
    .max(3600, "Poll interval must be at most 3600 seconds (1 hour)")
    .optional(),
  is_active: z.boolean().optional(),
});

// ============================================================================
// Manual File Import Schema
// ============================================================================

/**
 * Manual file import request schema - supports both file path and content modes
 *
 * Mode 1: File Path Import (server-side file)
 *   - file_path: Path to file on server filesystem
 *   - file_type: Optional document type hint
 *
 * Mode 2: Content Import (uploaded/pasted content)
 *   - content: Base64-encoded or raw XML content
 *   - file_name: Original file name for logging
 *   - file_type: Optional document type hint
 *   - is_base64: Whether content is base64 encoded (default: false)
 */
export const ManualFileImportSchema = z
  .object({
    // File path mode
    file_path: SafePathSchema.optional(),
    // Content mode
    content: z
      .string()
      .max(10 * 1024 * 1024, "Content exceeds maximum size of 10MB")
      .optional(),
    file_name: z
      .string()
      .min(1, "File name cannot be empty")
      .max(255, "File name too long")
      .regex(/^[\w\-. ]+\.xml$/i, "File name must be a valid XML file name")
      .optional(),
    is_base64: z.boolean().default(false),
    // Common
    file_type: NAXMLDocumentTypeSchema.optional(),
    // Processing options
    process_sync: z
      .boolean()
      .default(true)
      .describe("Process synchronously and return result"),
  })
  .refine(
    (data) => {
      // Must have either file_path OR (content AND file_name)
      const hasFilePath = !!data.file_path;
      const hasContent = !!data.content && !!data.file_name;
      return hasFilePath || hasContent;
    },
    {
      message: "Either file_path or (content and file_name) must be provided",
    },
  )
  .refine(
    (data) => {
      // Cannot have both file_path AND content
      return !(data.file_path && data.content);
    },
    {
      message: "Cannot provide both file_path and content. Use one mode only.",
    },
  );

// ============================================================================
// NAXML Export Schemas
// ============================================================================

/**
 * Export departments request schema
 */
export const ExportDepartmentsSchema = z.object({
  maintenance_type: z.enum(["Full", "Incremental"]).default("Full"),
  department_ids: z.array(z.string().uuid()).optional(),
});

/**
 * Export tender types request schema
 */
export const ExportTenderTypesSchema = z.object({
  maintenance_type: z.enum(["Full", "Incremental"]).default("Full"),
  tender_type_ids: z.array(z.string().uuid()).optional(),
});

/**
 * Export tax rates request schema
 */
export const ExportTaxRatesSchema = z.object({
  maintenance_type: z.enum(["Full", "Incremental"]).default("Full"),
  tax_rate_ids: z.array(z.string().uuid()).optional(),
});

/**
 * Export price book request schema
 */
export const ExportPriceBookSchema = z.object({
  maintenance_type: z.enum(["Full", "Incremental"]).default("Full"),
  department_codes: z.array(z.string()).optional(),
  effective_date: z
    .string()
    .optional()
    .refine((val) => !val || !isNaN(Date.parse(val)), "Invalid date format"),
});

// ============================================================================
// POS Integration NAXML Config Schema
// ============================================================================

/**
 * NAXML-specific configuration for POS Integration
 */
export const POSIntegrationNAXMLConfigSchema = z.object({
  naxml_version: NAXMLVersionSchema.default("3.4"),
  xml_gateway_path: SafePathSchema.optional(),
  generate_acknowledgments: z.boolean().default(true),
  connection_mode: ConnectionModeSchema.default("API"),
});

/**
 * Update NAXML config for existing POS Integration
 */
export const UpdateNAXMLConfigSchema = z.object({
  naxml_version: NAXMLVersionSchema.optional(),
  xml_gateway_path: SafePathSchema.optional().nullable(),
  generate_acknowledgments: z.boolean().optional(),
  connection_mode: ConnectionModeSchema.optional(),
});

// ============================================================================
// Scheduled Export Schemas (Phase 2)
// ============================================================================

/**
 * NAXML Export Type enum validation
 */
export const NAXMLExportTypeSchema = z.enum([
  "DEPARTMENTS",
  "TENDER_TYPES",
  "TAX_RATES",
  "PRICE_BOOK",
  "FULL_SYNC",
]);

/**
 * Scheduled Export Status enum validation
 */
export const ScheduledExportStatusSchema = z.enum([
  "ACTIVE",
  "PAUSED",
  "DISABLED",
]);

/**
 * Cron expression validation
 * Standard 5-field cron: minute hour day_of_month month day_of_week
 * Supports: *, numbers, ranges (1-5), lists (1,2,3), steps (*\/5, 0\/15)
 */
const CronExpressionSchema = z
  .string()
  .min(9, "Cron expression too short")
  .max(50, "Cron expression too long")
  .regex(
    /^(\*|\*\/[0-9]+|[0-9,\-\/]+)\s+(\*|\*\/[0-9]+|[0-9,\-\/]+)\s+(\*|\*\/[0-9]+|[0-9,\-\/]+)\s+(\*|\*\/[0-9]+|[0-9,\-\/]+)\s+(\*|\*\/[0-9]+|[0-9,\-\/]+)$/,
    "Invalid cron expression format. Use: minute hour day month weekday",
  );

/**
 * Timezone validation
 */
const TimezoneSchema = z
  .string()
  .min(1, "Timezone cannot be empty")
  .max(50, "Timezone too long")
  .regex(/^[A-Za-z_\/]+$/, "Invalid timezone format");

/**
 * Create scheduled export request schema
 */
export const CreateScheduledExportSchema = z.object({
  export_type: NAXMLExportTypeSchema,
  export_name: z
    .string()
    .min(1, "Export name cannot be empty")
    .max(255, "Export name too long"),
  cron_expression: CronExpressionSchema,
  timezone: TimezoneSchema.optional().default("America/New_York"),
  maintenance_type: z.enum(["Full", "Incremental"]).optional().default("Full"),
  output_path: SafePathSchema.optional(),
  file_name_pattern: z
    .string()
    .max(255, "File name pattern too long")
    .optional()
    .default("{type}_{date}_{time}.xml"),
  notify_on_failure: z.boolean().optional().default(true),
  notify_on_success: z.boolean().optional().default(false),
  notify_emails: z
    .array(z.string().email("Invalid email address"))
    .max(10, "Maximum 10 notification emails allowed")
    .optional()
    .default([]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Update scheduled export request schema
 */
export const UpdateScheduledExportSchema = z.object({
  export_name: z
    .string()
    .min(1, "Export name cannot be empty")
    .max(255, "Export name too long")
    .optional(),
  cron_expression: CronExpressionSchema.optional(),
  timezone: TimezoneSchema.optional(),
  maintenance_type: z.enum(["Full", "Incremental"]).optional(),
  output_path: SafePathSchema.optional().nullable(),
  file_name_pattern: z
    .string()
    .max(255, "File name pattern too long")
    .optional(),
  status: ScheduledExportStatusSchema.optional(),
  notify_on_failure: z.boolean().optional(),
  notify_on_success: z.boolean().optional(),
  notify_emails: z
    .array(z.string().email("Invalid email address"))
    .max(10, "Maximum 10 notification emails allowed")
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Schedule ID parameter validation
 */
export const ScheduleIdParamSchema = z.object({
  storeId: z.string().uuid("Store ID must be a valid UUID"),
  scheduleId: z.string().uuid("Schedule ID must be a valid UUID"),
});

/**
 * Scheduled export list query schema
 */
export const ScheduledExportQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 50))
    .pipe(z.number().int().min(1).max(200)),
  offset: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 0))
    .pipe(z.number().int().min(0)),
  status: ScheduledExportStatusSchema.optional(),
  export_type: NAXMLExportTypeSchema.optional(),
});

/**
 * Execute export request schema (for manual trigger)
 */
export const ExecuteExportSchema = z.object({
  trigger_type: z.enum(["MANUAL", "API"]).optional().default("API"),
});

// ============================================================================
// Type Inferences
// ============================================================================

export type NAXMLFileStatus = z.infer<typeof NAXMLFileStatusSchema>;
export type NAXMLFileDirection = z.infer<typeof NAXMLFileDirectionSchema>;
export type NAXMLDocumentType = z.infer<typeof NAXMLDocumentTypeSchema>;
export type NAXMLVersion = z.infer<typeof NAXMLVersionSchema>;
export type ConnectionMode = z.infer<typeof ConnectionModeSchema>;
export type NAXMLFileLogQuery = z.infer<typeof NAXMLFileLogQuerySchema>;
export type FileWatcherConfigCreate = z.infer<
  typeof FileWatcherConfigCreateSchema
>;
export type FileWatcherConfigUpdate = z.infer<
  typeof FileWatcherConfigUpdateSchema
>;
export type ManualFileImport = z.infer<typeof ManualFileImportSchema>;
export type ExportDepartments = z.infer<typeof ExportDepartmentsSchema>;
export type ExportTenderTypes = z.infer<typeof ExportTenderTypesSchema>;
export type ExportTaxRates = z.infer<typeof ExportTaxRatesSchema>;
export type ExportPriceBook = z.infer<typeof ExportPriceBookSchema>;
export type POSIntegrationNAXMLConfig = z.infer<
  typeof POSIntegrationNAXMLConfigSchema
>;
export type UpdateNAXMLConfig = z.infer<typeof UpdateNAXMLConfigSchema>;
export type NAXMLExportType = z.infer<typeof NAXMLExportTypeSchema>;
export type ScheduledExportStatus = z.infer<typeof ScheduledExportStatusSchema>;
export type CreateScheduledExport = z.infer<typeof CreateScheduledExportSchema>;
export type UpdateScheduledExport = z.infer<typeof UpdateScheduledExportSchema>;
export type ScheduledExportQuery = z.infer<typeof ScheduledExportQuerySchema>;
export type ExecuteExport = z.infer<typeof ExecuteExportSchema>;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate file log query parameters
 */
export function validateNAXMLFileLogQuery(data: unknown): NAXMLFileLogQuery {
  return NAXMLFileLogQuerySchema.parse(data);
}

/**
 * Validate file watcher config creation
 */
export function validateFileWatcherConfigCreate(
  data: unknown,
): FileWatcherConfigCreate {
  return FileWatcherConfigCreateSchema.parse(data);
}

/**
 * Validate file watcher config update
 */
export function validateFileWatcherConfigUpdate(
  data: unknown,
): FileWatcherConfigUpdate {
  return FileWatcherConfigUpdateSchema.parse(data);
}

/**
 * Validate manual file import request
 */
export function validateManualFileImport(data: unknown): ManualFileImport {
  return ManualFileImportSchema.parse(data);
}

/**
 * Safe validation for file log query
 */
export function safeValidateNAXMLFileLogQuery(data: unknown) {
  return NAXMLFileLogQuerySchema.safeParse(data);
}

/**
 * Safe validation for file watcher config create
 */
export function safeValidateFileWatcherConfigCreate(data: unknown) {
  return FileWatcherConfigCreateSchema.safeParse(data);
}

/**
 * Safe validation for file watcher config update
 */
export function safeValidateFileWatcherConfigUpdate(data: unknown) {
  return FileWatcherConfigUpdateSchema.safeParse(data);
}
