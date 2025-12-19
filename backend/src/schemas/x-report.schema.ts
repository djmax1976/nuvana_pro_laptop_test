/**
 * XReport Validation Schemas
 *
 * Zod schemas for validating X Report API requests.
 * Phase 4.1: Shift & Day Summary Implementation Plan
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
 * Path parameters for store-specific X Report routes
 */
export const XReportStoreParamsSchema = z.object({
  storeId: uuidSchema,
});

/**
 * Path parameters for shift-specific X Report routes
 */
export const XReportShiftParamsSchema = z.object({
  shiftId: uuidSchema,
});

/**
 * Path parameters for specific X Report by ID
 */
export const XReportIdParamsSchema = z.object({
  xReportId: uuidSchema,
});

/**
 * Path parameters for X Report by shift and report number
 */
export const XReportShiftNumberParamsSchema = z.object({
  shiftId: uuidSchema,
  reportNumber: z
    .string()
    .regex(/^\d+$/, "Report number must be a positive integer")
    .transform((val) => parseInt(val, 10))
    .refine((val) => val >= 1, { message: "Report number must be at least 1" }),
});

/**
 * Query parameters for listing X Reports
 */
export const XReportListQuerySchema = z
  .object({
    shift_id: uuidSchema.optional(),
    store_id: uuidSchema.optional(),
    start_date: businessDateSchema.optional(),
    end_date: businessDateSchema.optional(),
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
      // Date range must be at most 90 days for X Reports
      if (data.start_date && data.end_date) {
        const start = new Date(data.start_date);
        const end = new Date(data.end_date);
        const diffDays = Math.ceil(
          (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
        );
        return diffDays <= 90;
      }
      return true;
    },
    {
      message: "Date range must not exceed 90 days",
      path: ["end_date"],
    },
  );

/**
 * Request body for generating a new X Report
 * (no body required - shift_id comes from path)
 */
export const GenerateXReportRequestSchema = z.object({}).strict();

/**
 * Request body for marking X Report as printed
 */
export const MarkXReportPrintedRequestSchema = z.object({
  print_count_increment: z.number().int().min(1).max(10).optional().default(1),
});

/**
 * Type exports for use in route handlers
 */
export type XReportStoreParams = z.infer<typeof XReportStoreParamsSchema>;
export type XReportShiftParams = z.infer<typeof XReportShiftParamsSchema>;
export type XReportIdParams = z.infer<typeof XReportIdParamsSchema>;
export type XReportShiftNumberParams = z.infer<
  typeof XReportShiftNumberParamsSchema
>;
export type XReportListQuery = z.infer<typeof XReportListQuerySchema>;
export type GenerateXReportRequest = z.infer<
  typeof GenerateXReportRequestSchema
>;
export type MarkXReportPrintedRequest = z.infer<
  typeof MarkXReportPrintedRequestSchema
>;
