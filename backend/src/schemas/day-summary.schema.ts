/**
 * DaySummary Validation Schemas
 *
 * Zod schemas for validating Day Summary API requests.
 * Phase 3.1: Shift & Day Summary Implementation Plan
 *
 * Following enterprise coding standards:
 * - API-001: Schema validation for every request payload
 * - Centralized schema modules per endpoint
 */

import { z } from "zod";

/**
 * Day summary status enum values
 */
export const DaySummaryStatusEnum = z.enum(["OPEN", "PENDING_CLOSE", "CLOSED"]);

/**
 * UUID validation pattern
 */
const uuidSchema = z.string().uuid("Invalid UUID format");

/**
 * Business date string validation (YYYY-MM-DD format)
 * Uses strict calendar validation to reject invalid dates like Feb 30
 */
const businessDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .refine(
    (date) => {
      // Parse the date components
      const [year, month, day] = date.split("-").map(Number);

      // Validate month range
      if (month < 1 || month > 12) return false;

      // Validate day range (basic check)
      if (day < 1 || day > 31) return false;

      // Create a Date object and verify it matches the input
      // This catches invalid dates like Feb 30 which JS auto-corrects
      const parsed = new Date(year, month - 1, day);
      return (
        parsed.getFullYear() === year &&
        parsed.getMonth() === month - 1 &&
        parsed.getDate() === day
      );
    },
    { message: "Invalid date" },
  );

/**
 * Path parameters for store-specific day summary routes
 */
export const DaySummaryStoreParamsSchema = z.object({
  storeId: uuidSchema,
});

/**
 * Path parameters for specific day summary by date
 */
export const DaySummaryDateParamsSchema = z.object({
  storeId: uuidSchema,
  date: businessDateSchema,
});

/**
 * Path parameters for specific day summary by ID
 */
export const DaySummaryIdParamsSchema = z.object({
  daySummaryId: uuidSchema,
});

/**
 * Query parameters for listing day summaries
 */
export const DaySummaryListQuerySchema = z
  .object({
    start_date: businessDateSchema.optional(),
    end_date: businessDateSchema.optional(),
    status: DaySummaryStatusEnum.optional(),
    include_tender_summaries: z
      .string()
      .transform((val) => val === "true")
      .optional(),
    include_department_summaries: z
      .string()
      .transform((val) => val === "true")
      .optional(),
    include_tax_summaries: z
      .string()
      .transform((val) => val === "true")
      .optional(),
    include_hourly_summaries: z
      .string()
      .transform((val) => val === "true")
      .optional(),
    limit: z
      .string()
      .transform((val) => parseInt(val, 10))
      .refine((val) => !isNaN(val) && val >= 1 && val <= 100, {
        message: "Limit must be between 1 and 100",
      })
      .optional(),
    offset: z
      .string()
      .transform((val) => parseInt(val, 10))
      .refine((val) => !isNaN(val) && val >= 0, {
        message: "Offset must be a non-negative integer",
      })
      .optional(),
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
      // If dates are provided, range must be at most 365 days
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
  );

/**
 * Query parameters for getting a single day summary
 */
export const DaySummaryGetQuerySchema = z.object({
  include_tender_summaries: z
    .string()
    .transform((val) => val === "true")
    .optional(),
  include_department_summaries: z
    .string()
    .transform((val) => val === "true")
    .optional(),
  include_tax_summaries: z
    .string()
    .transform((val) => val === "true")
    .optional(),
  include_hourly_summaries: z
    .string()
    .transform((val) => val === "true")
    .optional(),
});

/**
 * Request body for closing a day
 */
export const CloseDayRequestSchema = z.object({
  notes: z
    .string()
    .max(2000, "Notes must be 2000 characters or less")
    .optional(),
});

/**
 * Request body for updating day summary notes
 */
export const UpdateDaySummaryNotesSchema = z.object({
  notes: z
    .string()
    .max(2000, "Notes must be 2000 characters or less")
    .nullable(),
});

/**
 * Weekly report query parameters
 */
export const WeeklyReportQuerySchema = z.object({
  week_of: businessDateSchema
    .optional()
    .describe("Any date within the week to report on"),
  include_details: z
    .string()
    .transform((val) => val === "true")
    .optional(),
});

/**
 * Monthly report query parameters
 */
export const MonthlyReportQuerySchema = z.object({
  year: z
    .string()
    .regex(/^\d{4}$/, "Year must be a 4-digit number")
    .transform((val) => parseInt(val, 10))
    .refine((val) => val >= 2000 && val <= 2100, {
      message: "Year must be between 2000 and 2100",
    }),
  month: z
    .string()
    .regex(/^(0?[1-9]|1[0-2])$/, "Month must be between 1 and 12")
    .transform((val) => parseInt(val, 10)),
  include_details: z
    .string()
    .transform((val) => val === "true")
    .optional(),
});

/**
 * Custom date range report query parameters
 */
export const DateRangeReportQuerySchema = z
  .object({
    start_date: businessDateSchema,
    end_date: businessDateSchema,
    include_daily_breakdown: z
      .string()
      .transform((val) => val === "true")
      .optional(),
    include_tender_breakdown: z
      .string()
      .transform((val) => val === "true")
      .optional(),
    include_department_breakdown: z
      .string()
      .transform((val) => val === "true")
      .optional(),
  })
  .refine(
    (data) => {
      const start = new Date(data.start_date);
      const end = new Date(data.end_date);
      return start <= end;
    },
    {
      message: "start_date must be before or equal to end_date",
      path: ["start_date"],
    },
  )
  .refine(
    (data) => {
      const start = new Date(data.start_date);
      const end = new Date(data.end_date);
      const diffDays = Math.ceil(
        (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
      );
      return diffDays <= 365;
    },
    {
      message: "Date range must not exceed 365 days",
      path: ["end_date"],
    },
  );

/**
 * Type exports for use in route handlers
 */
export type DaySummaryStoreParams = z.infer<typeof DaySummaryStoreParamsSchema>;
export type DaySummaryDateParams = z.infer<typeof DaySummaryDateParamsSchema>;
export type DaySummaryIdParams = z.infer<typeof DaySummaryIdParamsSchema>;
export type DaySummaryListQuery = z.infer<typeof DaySummaryListQuerySchema>;
export type DaySummaryGetQuery = z.infer<typeof DaySummaryGetQuerySchema>;
export type CloseDayRequest = z.infer<typeof CloseDayRequestSchema>;
export type UpdateDaySummaryNotes = z.infer<typeof UpdateDaySummaryNotesSchema>;
export type WeeklyReportQuery = z.infer<typeof WeeklyReportQuerySchema>;
export type MonthlyReportQuery = z.infer<typeof MonthlyReportQuerySchema>;
export type DateRangeReportQuery = z.infer<typeof DateRangeReportQuerySchema>;
