/**
 * ZReport Validation Schemas
 *
 * Zod schemas for validating Z Report API requests.
 * Phase 4.2: Shift & Day Summary Implementation Plan
 *
 * Following enterprise coding standards:
 * - API-001: Schema validation for every request payload
 * - Centralized schema modules per endpoint
 */

import { z } from "zod";

/**
 * UUID validation pattern
 */
const uuidSchema = z.string().uuid("Invalid UUID format");

/**
 * Business date string validation (YYYY-MM-DD format)
 */
const businessDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .refine(
    (date) => {
      const parsed = new Date(date);
      return !isNaN(parsed.getTime());
    },
    { message: "Invalid date" },
  );

/**
 * Path parameters for store-specific Z Report routes
 */
export const ZReportStoreParamsSchema = z.object({
  storeId: uuidSchema,
});

/**
 * Path parameters for shift-specific Z Report route
 */
export const ZReportShiftParamsSchema = z.object({
  shiftId: uuidSchema,
});

/**
 * Path parameters for specific Z Report by ID
 */
export const ZReportIdParamsSchema = z.object({
  zReportId: uuidSchema,
});

/**
 * Path parameters for Z Report by store and Z number
 */
export const ZReportByZNumberParamsSchema = z.object({
  storeId: uuidSchema,
  zNumber: z
    .string()
    .regex(/^\d+$/, "Z number must be a positive integer")
    .transform((val) => parseInt(val, 10))
    .refine((val) => val >= 1, { message: "Z number must be at least 1" }),
});

/**
 * Query parameters for listing Z Reports
 */
export const ZReportListQuerySchema = z
  .object({
    store_id: uuidSchema.optional(),
    business_date: businessDateSchema.optional(),
    start_date: businessDateSchema.optional(),
    end_date: businessDateSchema.optional(),
    from_z_number: z
      .string()
      .regex(/^\d+$/, "from_z_number must be a positive integer")
      .transform((val) => parseInt(val, 10))
      .refine((val) => val >= 1, {
        message: "from_z_number must be at least 1",
      })
      .optional(),
    to_z_number: z
      .string()
      .regex(/^\d+$/, "to_z_number must be a positive integer")
      .transform((val) => parseInt(val, 10))
      .refine((val) => val >= 1, { message: "to_z_number must be at least 1" })
      .optional(),
    limit: z
      .string()
      .optional()
      .default("20")
      .transform((val) => parseInt(val, 10))
      .refine((val) => !isNaN(val) && val >= 1 && val <= 100, {
        message: "Limit must be between 1 and 100",
      }),
    offset: z
      .string()
      .optional()
      .default("0")
      .transform((val) => parseInt(val, 10))
      .refine((val) => !isNaN(val) && val >= 0, {
        message: "Offset must be a non-negative integer",
      }),
  })
  .refine(
    (data) => {
      // If both dates are provided, start_date must be before or equal to end_date
      if (data.start_date && data.end_date) {
        const start = new Date(data.start_date);
        const end = new Date(data.end_date);
        return start <= end;
      }
      return true;
    },
    {
      message: "start_date must be before or equal to end_date",
      path: ["start_date"],
    },
  )
  .refine(
    (data) => {
      // Date range must be at most 365 days for Z Reports
      if (data.start_date && data.end_date) {
        const start = new Date(data.start_date);
        const end = new Date(data.end_date);
        const diffDays = Math.ceil(
          (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
        );
        return diffDays <= 365;
      }
      return true;
    },
    {
      message: "Date range must not exceed 365 days",
      path: ["end_date"],
    },
  )
  .refine(
    (data) => {
      // If both Z numbers are provided, from must be <= to
      if (data.from_z_number !== undefined && data.to_z_number !== undefined) {
        return data.from_z_number <= data.to_z_number;
      }
      return true;
    },
    {
      message: "from_z_number must be less than or equal to to_z_number",
      path: ["from_z_number"],
    },
  );

/**
 * Request body for marking Z Report as printed
 */
export const MarkZReportPrintedRequestSchema = z.object({
  print_count_increment: z.number().int().min(1).max(10).optional().default(1),
});

/**
 * Request body for marking Z Report as exported
 */
export const MarkZReportExportedRequestSchema = z.object({
  export_format: z
    .enum(["PDF", "CSV", "XLSX", "JSON"])
    .describe("Format the report was exported in"),
});

/**
 * Query parameters for Z Report sequence summary
 */
export const ZReportSequenceQuerySchema = z.object({
  store_id: uuidSchema,
});

/**
 * Type exports for use in route handlers
 */
export type ZReportStoreParams = z.infer<typeof ZReportStoreParamsSchema>;
export type ZReportShiftParams = z.infer<typeof ZReportShiftParamsSchema>;
export type ZReportIdParams = z.infer<typeof ZReportIdParamsSchema>;
export type ZReportByZNumberParams = z.infer<
  typeof ZReportByZNumberParamsSchema
>;
export type ZReportListQuery = z.infer<typeof ZReportListQuerySchema>;
export type MarkZReportPrintedRequest = z.infer<
  typeof MarkZReportPrintedRequestSchema
>;
export type MarkZReportExportedRequest = z.infer<
  typeof MarkZReportExportedRequestSchema
>;
export type ZReportSequenceQuery = z.infer<typeof ZReportSequenceQuerySchema>;
