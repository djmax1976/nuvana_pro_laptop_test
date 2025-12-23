/**
 * POS Audit Validation Schemas
 *
 * Zod schemas for validating POS data exchange audit API payloads.
 * Phase 0: Data Exchange Audit Infrastructure
 *
 * Security: Audit records are critical for regulatory compliance.
 * All queries are scoped to prevent cross-tenant data access.
 *
 * @module schemas/pos-audit.schema
 */

import { z } from "zod";

/**
 * POS Exchange Type enum validation
 * Matches Prisma POSExchangeType enum
 */
export const POSExchangeTypeSchema = z.enum([
  "FILE_IMPORT",
  "FILE_EXPORT",
  "API_REQUEST",
  "API_RESPONSE",
  "WEBHOOK",
  "SYNC_OPERATION",
]);

/**
 * POS Data Category enum validation
 * Matches Prisma POSDataCategory enum
 */
export const POSDataCategorySchema = z.enum([
  "TRANSACTION",
  "PRICEBOOK",
  "DEPARTMENT",
  "TENDER_TYPE",
  "TAX_RATE",
  "EMPLOYEE",
  "CASHIER",
  "INVENTORY",
  "FINANCIAL",
  "PII",
  "SYSTEM_CONFIG",
]);

/**
 * POS Audit Status enum validation
 * Matches Prisma POSAuditStatus enum
 */
export const POSAuditStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "SUCCESS",
  "PARTIAL",
  "FAILED",
  "REJECTED",
]);

/**
 * POS Retention Policy enum validation
 * Matches Prisma POSRetentionPolicy enum
 */
export const POSRetentionPolicySchema = z.enum([
  "STANDARD",
  "EXTENDED",
  "PERMANENT",
  "PII_RESTRICTED",
]);

/**
 * Store ID parameter validation
 */
export const StoreIdParamSchema = z.object({
  storeId: z.string().uuid("Store ID must be a valid UUID"),
});

/**
 * Audit ID parameter validation
 */
export const AuditIdParamSchema = z.object({
  auditId: z.string().uuid("Audit ID must be a valid UUID"),
});

/**
 * Company ID parameter validation (for admin endpoints)
 */
export const CompanyIdParamSchema = z.object({
  companyId: z.string().uuid("Company ID must be a valid UUID"),
});

/**
 * Query parameters for listing audit records
 *
 * Supports filtering by:
 * - dataCategory: Type of data being exchanged
 * - status: Processing status
 * - containsPii: Filter for PII-containing records
 * - containsFinancial: Filter for financial records
 * - exchangeType: Type of exchange operation
 * - direction: INBOUND or OUTBOUND
 * - fromDate/toDate: Date range filtering
 */
export const POSAuditQuerySchema = z.object({
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
  dataCategory: POSDataCategorySchema.optional(),
  status: POSAuditStatusSchema.optional(),
  containsPii: z
    .string()
    .optional()
    .transform((val) =>
      val === "true" ? true : val === "false" ? false : undefined,
    ),
  containsFinancial: z
    .string()
    .optional()
    .transform((val) =>
      val === "true" ? true : val === "false" ? false : undefined,
    ),
  exchangeType: POSExchangeTypeSchema.optional(),
  direction: z.enum(["INBOUND", "OUTBOUND"]).optional(),
  fromDate: z
    .string()
    .optional()
    .refine((val) => !val || !isNaN(Date.parse(val)), "Invalid date format"),
  toDate: z
    .string()
    .optional()
    .refine((val) => !val || !isNaN(Date.parse(val)), "Invalid date format"),
  jurisdiction: z.string().max(50).optional(),
});

/**
 * Query parameters for admin-level audit queries
 * Extends base query with company-wide filtering
 */
export const POSAuditAdminQuerySchema = POSAuditQuerySchema.extend({
  companyId: z.string().uuid("Company ID must be a valid UUID").optional(),
  storeId: z.string().uuid("Store ID must be a valid UUID").optional(),
  posIntegrationId: z
    .string()
    .uuid("POS Integration ID must be a valid UUID")
    .optional(),
});

/**
 * Query parameters for audit summary reports
 */
export const POSAuditSummaryQuerySchema = z.object({
  fromDate: z
    .string()
    .optional()
    .refine((val) => !val || !isNaN(Date.parse(val)), "Invalid date format"),
  toDate: z
    .string()
    .optional()
    .refine((val) => !val || !isNaN(Date.parse(val)), "Invalid date format"),
});

/**
 * Query parameters for PII access reports
 * Used for compliance auditing of PII data access
 */
export const POSAuditPIIReportQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 100))
    .pipe(z.number().int().min(1).max(500)),
  offset: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 0))
    .pipe(z.number().int().min(0)),
  fromDate: z
    .string()
    .optional()
    .refine((val) => !val || !isNaN(Date.parse(val)), "Invalid date format"),
  toDate: z
    .string()
    .optional()
    .refine((val) => !val || !isNaN(Date.parse(val)), "Invalid date format"),
});

/**
 * Request body for retention cleanup (admin only)
 */
export const RetentionCleanupRequestSchema = z.object({
  dryRun: z
    .boolean()
    .default(true)
    .describe("If true, only reports what would be deleted"),
  maxRecords: z
    .number()
    .int()
    .min(1)
    .max(10000)
    .default(1000)
    .describe("Maximum records to delete in one operation"),
});

/**
 * Type inference from schemas
 */
export type POSExchangeType = z.infer<typeof POSExchangeTypeSchema>;
export type POSDataCategory = z.infer<typeof POSDataCategorySchema>;
export type POSAuditStatus = z.infer<typeof POSAuditStatusSchema>;
export type POSRetentionPolicy = z.infer<typeof POSRetentionPolicySchema>;
export type POSAuditQuery = z.infer<typeof POSAuditQuerySchema>;
export type POSAuditAdminQuery = z.infer<typeof POSAuditAdminQuerySchema>;
export type POSAuditSummaryQuery = z.infer<typeof POSAuditSummaryQuerySchema>;
export type POSAuditPIIReportQuery = z.infer<
  typeof POSAuditPIIReportQuerySchema
>;
export type RetentionCleanupRequest = z.infer<
  typeof RetentionCleanupRequestSchema
>;
export type StoreIdParam = z.infer<typeof StoreIdParamSchema>;
export type AuditIdParam = z.infer<typeof AuditIdParamSchema>;
export type CompanyIdParam = z.infer<typeof CompanyIdParamSchema>;
