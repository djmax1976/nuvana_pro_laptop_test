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
// Path Validation Schema
// ============================================================================

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
 * Safe validation for file log query
 */
export function safeValidateNAXMLFileLogQuery(data: unknown) {
  return NAXMLFileLogQuerySchema.safeParse(data);
}

// ============================================================================
// Movement Report Schemas (Gilbarco Passport)
// ============================================================================

/**
 * Primary Report Period enum validation
 * SEC-014: Strict allowlist for report period values
 */
export const NAXMLPrimaryReportPeriodSchema = z.union([
  z.literal(2),
  z.literal(98),
]);

/**
 * Movement Report Type enum validation
 * SEC-014: Strict allowlist for movement report types
 */
export const NAXMLMovementReportTypeSchema = z.enum([
  "FuelGradeMovement",
  "FuelProductMovement",
  "MiscellaneousSummaryMovement",
  "TaxLevelMovement",
  "MerchandiseCodeMovement",
  "ItemSalesMovement",
  "TankProductMovement",
]);

/**
 * Fuel Tender Code enum validation
 * SEC-014: Strict allowlist for fuel tender codes
 */
export const NAXMLFuelTenderCodeSchema = z.enum([
  "cash",
  "outsideCredit",
  "outsideDebit",
  "insideCredit",
  "insideDebit",
  "fleet",
]);

/**
 * Date string validation (YYYY-MM-DD format)
 */
const NAXMLDateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .refine((val) => !isNaN(Date.parse(val)), "Invalid date value");

/**
 * Time string validation (HH:MM:SS format)
 */
const NAXMLTimeStringSchema = z
  .string()
  .regex(/^\d{2}:\d{2}:\d{2}$/, "Time must be in HH:MM:SS format");

/**
 * Non-negative number validation (for amounts and volumes)
 */
const NonNegativeNumberSchema = z.number().min(0, "Value cannot be negative");

/**
 * Numeric string ID validation (for fuel grade IDs, position IDs, etc.)
 */
const NumericStringIdSchema = z
  .string()
  .min(1, "ID cannot be empty")
  .max(10, "ID too long")
  .regex(/^[0-9]+$/, "ID must contain only digits");

// ----------------------------------------------------------------------------
// Movement Header Schemas
// ----------------------------------------------------------------------------

/**
 * Movement Header schema - common to all movement reports
 */
export const NAXMLMovementHeaderSchema = z.object({
  reportSequenceNumber: z
    .number()
    .int()
    .positive("Sequence number must be positive"),
  primaryReportPeriod: NAXMLPrimaryReportPeriodSchema,
  secondaryReportPeriod: z.number().int().min(0),
  businessDate: NAXMLDateStringSchema,
  beginDate: NAXMLDateStringSchema,
  beginTime: NAXMLTimeStringSchema,
  endDate: NAXMLDateStringSchema,
  endTime: NAXMLTimeStringSchema,
});

/**
 * Sales Movement Header schema - for shift-specific reports
 */
export const NAXMLSalesMovementHeaderSchema = z.object({
  registerId: z.string().min(1, "Register ID cannot be empty").max(50),
  cashierId: z.string().min(1, "Cashier ID cannot be empty").max(50),
  tillId: z.string().min(1, "Till ID cannot be empty").max(50),
});

// ----------------------------------------------------------------------------
// FGM (Fuel Grade Movement) Schemas
// ----------------------------------------------------------------------------

/**
 * FGM Tender schema
 */
export const NAXMLFGMTenderSchema = z.object({
  tenderCode: NAXMLFuelTenderCodeSchema,
  tenderSubCode: z.string().min(1).max(50),
});

/**
 * FGM Pump Test Totals schema
 */
export const NAXMLFGMPumpTestTotalsSchema = z.object({
  pumpTestAmount: NonNegativeNumberSchema,
  pumpTestVolume: NonNegativeNumberSchema,
  returnTankId: z.string().optional(),
});

/**
 * FGM Sales Totals schema
 */
export const NAXMLFGMSalesTotalsSchema = z.object({
  fuelGradeSalesVolume: NonNegativeNumberSchema,
  fuelGradeSalesAmount: NonNegativeNumberSchema,
  discountAmount: NonNegativeNumberSchema,
  discountCount: z.number().int().min(0),
  taxExemptSalesVolume: NonNegativeNumberSchema.optional(),
  dispenserDiscountAmount: NonNegativeNumberSchema.optional(),
  dispenserDiscountCount: z.number().int().min(0).optional(),
  pumpTestTotals: NAXMLFGMPumpTestTotalsSchema.optional(),
});

/**
 * FGM Service Level Summary schema
 */
export const NAXMLFGMServiceLevelSummarySchema = z.object({
  serviceLevelCode: z.string().min(1).max(10),
  fgmSalesTotals: NAXMLFGMSalesTotalsSchema,
});

/**
 * FGM Sell Price Summary schema
 */
export const NAXMLFGMSellPriceSummarySchema = z.object({
  actualSalesPrice: NonNegativeNumberSchema,
  fgmServiceLevelSummary: NAXMLFGMServiceLevelSummarySchema,
});

/**
 * FGM Tender Summary schema
 */
export const NAXMLFGMTenderSummarySchema = z.object({
  tender: NAXMLFGMTenderSchema,
  fgmSellPriceSummary: NAXMLFGMSellPriceSummarySchema,
});

/**
 * FGM Non-Resettable Total schema
 */
export const NAXMLFGMNonResettableTotalSchema = z.object({
  fuelGradeNonResettableTotalVolume: NonNegativeNumberSchema,
  fuelGradeNonResettableTotalAmount: NonNegativeNumberSchema,
});

/**
 * FGM Price Tier Summary schema
 */
export const NAXMLFGMPriceTierSummarySchema = z.object({
  priceTierCode: z.string().min(1).max(10),
  fgmSalesTotals: NAXMLFGMSalesTotalsSchema,
});

/**
 * FGM Position Summary schema
 */
export const NAXMLFGMPositionSummarySchema = z.object({
  fuelPositionId: NumericStringIdSchema,
  fgmNonResettableTotal: NAXMLFGMNonResettableTotalSchema.optional(),
  fgmPriceTierSummaries: z.array(NAXMLFGMPriceTierSummarySchema).min(1),
});

/**
 * FGM Detail schema
 */
export const NAXMLFGMDetailSchema = z
  .object({
    fuelGradeId: NumericStringIdSchema,
    fgmTenderSummary: NAXMLFGMTenderSummarySchema.optional(),
    fgmPositionSummary: NAXMLFGMPositionSummarySchema.optional(),
  })
  .refine(
    (data) => {
      // Must have exactly one of fgmTenderSummary or fgmPositionSummary
      const hasTender = !!data.fgmTenderSummary;
      const hasPosition = !!data.fgmPositionSummary;
      return (hasTender && !hasPosition) || (!hasTender && hasPosition);
    },
    {
      message:
        "FGMDetail must have either fgmTenderSummary OR fgmPositionSummary, not both or neither",
    },
  );

/**
 * Fuel Grade Movement Data schema
 */
export const NAXMLFuelGradeMovementDataSchema = z.object({
  movementHeader: NAXMLMovementHeaderSchema,
  salesMovementHeader: NAXMLSalesMovementHeaderSchema.optional(),
  fgmDetails: z.array(NAXMLFGMDetailSchema).min(0),
});

// ----------------------------------------------------------------------------
// FPM (Fuel Product Movement) Schemas
// ----------------------------------------------------------------------------

/**
 * FPM Non-Resettable Totals schema
 */
export const NAXMLFPMNonResettableTotalsSchema = z.object({
  fuelPositionId: NumericStringIdSchema,
  fuelProductNonResettableAmountNumber: NonNegativeNumberSchema,
  fuelProductNonResettableVolumeNumber: NonNegativeNumberSchema,
});

/**
 * FPM Detail schema
 */
export const NAXMLFPMDetailSchema = z.object({
  fuelProductId: NumericStringIdSchema,
  fpmNonResettableTotals: z.array(NAXMLFPMNonResettableTotalsSchema).min(1),
});

/**
 * Fuel Product Movement Data schema
 */
export const NAXMLFuelProductMovementDataSchema = z.object({
  movementHeader: NAXMLMovementHeaderSchema,
  fpmDetails: z.array(NAXMLFPMDetailSchema).min(0),
});

// ----------------------------------------------------------------------------
// MSM (Miscellaneous Summary Movement) Schemas
// ----------------------------------------------------------------------------

/**
 * MSM Summary Codes schema
 */
export const NAXMLMiscellaneousSummaryCodesSchema = z.object({
  miscellaneousSummaryCode: z.string().min(0).max(100),
  miscellaneousSummarySubCode: z.string().max(100).optional(),
  miscellaneousSummarySubCodeModifier: z.string().max(100).optional(),
});

/**
 * MSM Sales Totals schema
 */
export const NAXMLMSMSalesTotalsSchema = z.object({
  tender: NAXMLFGMTenderSchema.optional(),
  miscellaneousSummaryAmount: z.number(),
  miscellaneousSummaryCount: z.number(),
});

/**
 * MSM Detail schema
 */
export const NAXMLMSMDetailSchema = z.object({
  miscellaneousSummaryCodes: NAXMLMiscellaneousSummaryCodesSchema,
  registerId: z.string().max(50).optional(),
  cashierId: z.string().max(50).optional(),
  tillId: z.string().max(50).optional(),
  msmSalesTotals: NAXMLMSMSalesTotalsSchema,
});

/**
 * Miscellaneous Summary Movement Data schema
 */
export const NAXMLMiscellaneousSummaryMovementDataSchema = z.object({
  movementHeader: NAXMLMovementHeaderSchema,
  salesMovementHeader: NAXMLSalesMovementHeaderSchema.optional(),
  msmDetails: z.array(NAXMLMSMDetailSchema).min(0),
});

// ----------------------------------------------------------------------------
// TLM (Tax Level Movement) Schemas
// ----------------------------------------------------------------------------

/**
 * TLM Detail schema
 */
export const NAXMLTLMDetailSchema = z.object({
  taxLevelId: z.string().min(1).max(50),
  merchandiseCode: z.string().min(1).max(50),
  taxableSalesAmount: z.number(),
  taxableSalesRefundedAmount: z.number(),
  taxCollectedAmount: z.number(),
  taxExemptSalesAmount: z.number(),
  taxExemptSalesRefundedAmount: z.number(),
  taxForgivenSalesAmount: z.number(),
  taxForgivenSalesRefundedAmount: z.number(),
  taxRefundedAmount: z.number(),
});

/**
 * Tax Level Movement Data schema
 */
export const NAXMLTaxLevelMovementDataSchema = z.object({
  movementHeader: NAXMLMovementHeaderSchema,
  salesMovementHeader: NAXMLSalesMovementHeaderSchema.optional(),
  tlmDetails: z.array(NAXMLTLMDetailSchema).min(0),
});

// ----------------------------------------------------------------------------
// MCM (Merchandise Code Movement) Schemas
// ----------------------------------------------------------------------------

/**
 * MCM Sales Totals schema
 */
export const NAXMLMCMSalesTotalsSchema = z.object({
  discountAmount: NonNegativeNumberSchema,
  discountCount: z.number().int().min(0),
  promotionAmount: NonNegativeNumberSchema,
  promotionCount: z.number().int().min(0),
  refundAmount: NonNegativeNumberSchema,
  refundCount: z.number().int().min(0),
  salesQuantity: z.number().int().min(0),
  salesAmount: NonNegativeNumberSchema,
  transactionCount: z.number().int().min(0),
  openDepartmentSalesAmount: NonNegativeNumberSchema,
  openDepartmentTransactionCount: z.number().int().min(0),
});

/**
 * MCM Detail schema
 */
export const NAXMLMCMDetailSchema = z.object({
  merchandiseCode: z.string().min(1).max(50),
  merchandiseCodeDescription: z.string().max(255),
  mcmSalesTotals: NAXMLMCMSalesTotalsSchema,
});

/**
 * Merchandise Code Movement Data schema
 */
export const NAXMLMerchandiseCodeMovementDataSchema = z.object({
  movementHeader: NAXMLMovementHeaderSchema,
  salesMovementHeader: NAXMLSalesMovementHeaderSchema.optional(),
  mcmDetails: z.array(NAXMLMCMDetailSchema).min(0),
});

// ----------------------------------------------------------------------------
// ISM (Item Sales Movement) Schemas
// ----------------------------------------------------------------------------

/**
 * ISM Detail schema
 */
export const NAXMLISMDetailSchema = z.object({
  itemCode: z.string().min(1).max(50),
  itemDescription: z.string().max(255),
  merchandiseCode: z.string().min(1).max(50),
  salesQuantity: z.number().int().min(0),
  salesAmount: NonNegativeNumberSchema,
  unitPrice: NonNegativeNumberSchema,
});

/**
 * Item Sales Movement Data schema
 */
export const NAXMLItemSalesMovementDataSchema = z.object({
  movementHeader: NAXMLMovementHeaderSchema,
  salesMovementHeader: NAXMLSalesMovementHeaderSchema.optional(),
  ismDetails: z.array(NAXMLISMDetailSchema).min(0),
});

// ----------------------------------------------------------------------------
// TPM (Tank Product Movement) Schemas
// ----------------------------------------------------------------------------

/**
 * TPM Detail schema
 */
export const NAXMLTPMDetailSchema = z.object({
  tankId: z.string().min(1).max(50),
  fuelProductId: NumericStringIdSchema,
  tankVolume: NonNegativeNumberSchema,
  tankCapacity: NonNegativeNumberSchema.optional(),
  tankUllage: NonNegativeNumberSchema.optional(),
  waterLevel: NonNegativeNumberSchema.optional(),
  productTemperature: z.number().optional(),
  readingTimestamp: z.string().optional(),
});

/**
 * Tank Product Movement Data schema
 */
export const NAXMLTankProductMovementDataSchema = z.object({
  movementHeader: NAXMLMovementHeaderSchema,
  tpmDetails: z.array(NAXMLTPMDetailSchema).min(0),
});

// ----------------------------------------------------------------------------
// Movement Report Document Schema
// ----------------------------------------------------------------------------

/**
 * Transmission Header schema
 */
export const NAXMLTransmissionHeaderSchema = z.object({
  storeLocationId: z.string().min(1).max(50),
  vendorName: z.string().max(100),
  vendorModelVersion: z.string().max(50).optional(),
});

/**
 * Movement Report Document schema (generic)
 */
export const NAXMLMovementReportDocumentSchema = z.object({
  transmissionHeader: NAXMLTransmissionHeaderSchema,
  movementType: NAXMLMovementReportTypeSchema,
  data: z.unknown(), // Specific data type depends on movementType
});

// ----------------------------------------------------------------------------
// Movement Report Type Inferences
// ----------------------------------------------------------------------------

export type NAXMLPrimaryReportPeriod = z.infer<
  typeof NAXMLPrimaryReportPeriodSchema
>;
export type NAXMLMovementReportType = z.infer<
  typeof NAXMLMovementReportTypeSchema
>;
export type NAXMLFuelTenderCode = z.infer<typeof NAXMLFuelTenderCodeSchema>;
export type NAXMLMovementHeader = z.infer<typeof NAXMLMovementHeaderSchema>;
export type NAXMLSalesMovementHeader = z.infer<
  typeof NAXMLSalesMovementHeaderSchema
>;
export type NAXMLFGMTender = z.infer<typeof NAXMLFGMTenderSchema>;
export type NAXMLFGMSalesTotals = z.infer<typeof NAXMLFGMSalesTotalsSchema>;
export type NAXMLFGMDetail = z.infer<typeof NAXMLFGMDetailSchema>;
export type NAXMLFuelGradeMovementData = z.infer<
  typeof NAXMLFuelGradeMovementDataSchema
>;
export type NAXMLFPMDetail = z.infer<typeof NAXMLFPMDetailSchema>;
export type NAXMLFuelProductMovementData = z.infer<
  typeof NAXMLFuelProductMovementDataSchema
>;
export type NAXMLMSMDetail = z.infer<typeof NAXMLMSMDetailSchema>;
export type NAXMLMiscellaneousSummaryMovementData = z.infer<
  typeof NAXMLMiscellaneousSummaryMovementDataSchema
>;
export type NAXMLTLMDetail = z.infer<typeof NAXMLTLMDetailSchema>;
export type NAXMLTaxLevelMovementData = z.infer<
  typeof NAXMLTaxLevelMovementDataSchema
>;
export type NAXMLMCMDetail = z.infer<typeof NAXMLMCMDetailSchema>;
export type NAXMLMerchandiseCodeMovementData = z.infer<
  typeof NAXMLMerchandiseCodeMovementDataSchema
>;
export type NAXMLISMDetail = z.infer<typeof NAXMLISMDetailSchema>;
export type NAXMLItemSalesMovementData = z.infer<
  typeof NAXMLItemSalesMovementDataSchema
>;
export type NAXMLTPMDetail = z.infer<typeof NAXMLTPMDetailSchema>;
export type NAXMLTankProductMovementData = z.infer<
  typeof NAXMLTankProductMovementDataSchema
>;
export type NAXMLTransmissionHeader = z.infer<
  typeof NAXMLTransmissionHeaderSchema
>;
export type NAXMLMovementReportDocument = z.infer<
  typeof NAXMLMovementReportDocumentSchema
>;

// ----------------------------------------------------------------------------
// Movement Report Validation Functions
// ----------------------------------------------------------------------------

/**
 * Validate FGM (Fuel Grade Movement) data
 */
export function validateFuelGradeMovementData(
  data: unknown,
): NAXMLFuelGradeMovementData {
  return NAXMLFuelGradeMovementDataSchema.parse(data);
}

/**
 * Safe validation for FGM data
 */
export function safeValidateFuelGradeMovementData(data: unknown) {
  return NAXMLFuelGradeMovementDataSchema.safeParse(data);
}

/**
 * Validate FPM (Fuel Product Movement) data
 */
export function validateFuelProductMovementData(
  data: unknown,
): NAXMLFuelProductMovementData {
  return NAXMLFuelProductMovementDataSchema.parse(data);
}

/**
 * Safe validation for FPM data
 */
export function safeValidateFuelProductMovementData(data: unknown) {
  return NAXMLFuelProductMovementDataSchema.safeParse(data);
}

/**
 * Validate MSM (Miscellaneous Summary Movement) data
 */
export function validateMiscellaneousSummaryMovementData(
  data: unknown,
): NAXMLMiscellaneousSummaryMovementData {
  return NAXMLMiscellaneousSummaryMovementDataSchema.parse(data);
}

/**
 * Safe validation for MSM data
 */
export function safeValidateMiscellaneousSummaryMovementData(data: unknown) {
  return NAXMLMiscellaneousSummaryMovementDataSchema.safeParse(data);
}

/**
 * Validate TLM (Tax Level Movement) data
 */
export function validateTaxLevelMovementData(
  data: unknown,
): NAXMLTaxLevelMovementData {
  return NAXMLTaxLevelMovementDataSchema.parse(data);
}

/**
 * Safe validation for TLM data
 */
export function safeValidateTaxLevelMovementData(data: unknown) {
  return NAXMLTaxLevelMovementDataSchema.safeParse(data);
}

/**
 * Validate MCM (Merchandise Code Movement) data
 */
export function validateMerchandiseCodeMovementData(
  data: unknown,
): NAXMLMerchandiseCodeMovementData {
  return NAXMLMerchandiseCodeMovementDataSchema.parse(data);
}

/**
 * Safe validation for MCM data
 */
export function safeValidateMerchandiseCodeMovementData(data: unknown) {
  return NAXMLMerchandiseCodeMovementDataSchema.safeParse(data);
}

/**
 * Validate ISM (Item Sales Movement) data
 */
export function validateItemSalesMovementData(
  data: unknown,
): NAXMLItemSalesMovementData {
  return NAXMLItemSalesMovementDataSchema.parse(data);
}

/**
 * Safe validation for ISM data
 */
export function safeValidateItemSalesMovementData(data: unknown) {
  return NAXMLItemSalesMovementDataSchema.safeParse(data);
}

/**
 * Validate TPM (Tank Product Movement) data
 */
export function validateTankProductMovementData(
  data: unknown,
): NAXMLTankProductMovementData {
  return NAXMLTankProductMovementDataSchema.parse(data);
}

/**
 * Safe validation for TPM data
 */
export function safeValidateTankProductMovementData(data: unknown) {
  return NAXMLTankProductMovementDataSchema.safeParse(data);
}

/**
 * Validate Movement Header
 */
export function validateMovementHeader(data: unknown): NAXMLMovementHeader {
  return NAXMLMovementHeaderSchema.parse(data);
}

/**
 * Safe validation for Movement Header
 */
export function safeValidateMovementHeader(data: unknown) {
  return NAXMLMovementHeaderSchema.safeParse(data);
}
