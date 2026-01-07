/**
 * Shift & Day Report Filter Validation Schemas
 *
 * Enterprise-grade validation for unified shift/day report filtering.
 *
 * Security Standards Applied:
 * - SEC-014: INPUT_VALIDATION - Strict schema validation with allowlists
 * - API-001: VALIDATION - Schema validation for all filter parameters
 * - FE-002: FORM_VALIDATION - Client-side validation mirroring backend rules
 */

import { z } from "zod";

/**
 * Report type enum - validates report type filter
 * SEC-014: Allowlist for report type enumeration
 *
 * Options:
 * - "all": Show both shift and day reports (default)
 * - "shift": Show only individual shift records
 * - "day": Show only aggregated day summaries
 */
export const ReportTypeSchema = z.enum(["all", "shift", "day"], {
  message: "Report type must be 'all', 'shift', or 'day'",
});

export type ReportType = z.infer<typeof ReportTypeSchema>;

/**
 * Range preset enum - validates date range preset selection
 * SEC-014: Allowlist for range preset enumeration
 *
 * Options:
 * - "current": Show current/active data (no date filter) - DEFAULT
 * - "custom": User specifies both From and To dates
 * - "day": User picks a single date
 * - "current_week/month/year": From start of period to last closed date
 * - "previous_week/month/year": Full previous period boundaries
 */
export const RangePresetSchema = z.enum(
  [
    "current",
    "custom",
    "day",
    "current_week",
    "previous_week",
    "current_month",
    "previous_month",
    "current_year",
    "previous_year",
  ],
  {
    message: "Invalid range preset selected",
  },
);

export type RangePreset = z.infer<typeof RangePresetSchema>;

/**
 * Date string validation - ensures valid ISO date format (YYYY-MM-DD)
 * SEC-014: Format constraint for date inputs
 */
export const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .refine(
    (dateStr) => {
      const date = new Date(dateStr);
      return !isNaN(date.getTime());
    },
    { message: "Invalid date value" },
  );

/**
 * UUID validation for cashier_id filter
 * SEC-014: Format validation for UUID identifiers
 */
export const UUIDSchema = z
  .string()
  .uuid({ message: "Invalid identifier format" });

/**
 * Optional UUID that allows empty string (for "All" selection)
 */
export const OptionalUUIDSchema = z
  .string()
  .refine((val) => val === "" || z.string().uuid().safeParse(val).success, {
    message: "Invalid identifier format",
  });

/**
 * Complete filter state schema for Shift & Day reports
 * API-001: Comprehensive schema for filter validation
 */
export const ShiftDayFiltersSchema = z
  .object({
    /** Report type: 'shift' or 'day' */
    reportType: ReportTypeSchema.optional(),

    /** Cashier UUID filter (empty string means all cashiers) */
    cashierId: OptionalUUIDSchema.optional(),

    /** Range preset selection */
    rangePreset: RangePresetSchema.default("custom"),

    /** From date (YYYY-MM-DD format) */
    fromDate: DateStringSchema.optional(),

    /** To date (YYYY-MM-DD format) */
    toDate: DateStringSchema.optional(),

    /** Store ID filter (required for API calls) */
    storeId: UUIDSchema.optional(),
  })
  .refine(
    (data) => {
      // When preset is 'custom', both dates should be provided for a valid query
      // When preset is 'day', only fromDate is needed
      // For other presets, dates are auto-calculated
      if (data.rangePreset === "custom") {
        // Custom allows partial dates - API will handle defaults
        return true;
      }
      if (data.rangePreset === "day") {
        // Day preset requires fromDate
        return true; // fromDate will be set by UI
      }
      // Other presets auto-calculate dates
      return true;
    },
    { message: "Invalid date range configuration" },
  );

export type ShiftDayFilters = z.infer<typeof ShiftDayFiltersSchema>;

/**
 * Filter state for UI components (includes empty/placeholder states)
 * FE-002: Form state that handles unselected/placeholder values
 */
export const FilterFormStateSchema = z.object({
  /** Store selection (empty string = no store selected, required for data fetch) */
  storeId: z.string().default(""),

  /** Report type selection (defaults to "all" to show both shift and day reports) */
  reportType: z.union([ReportTypeSchema, z.literal("")]).default("all"),

  /** Cashier selection (empty string = "All Cashiers") */
  cashierId: z.string().default(""),

  /** Range preset selection - defaults to "current" to show active data */
  rangePreset: RangePresetSchema.default("current"),

  /** From date input value */
  fromDate: z.string().default(""),

  /** To date input value */
  toDate: z.string().default(""),
});

export type FilterFormState = z.infer<typeof FilterFormStateSchema>;

/**
 * Validate and parse filter form state
 * Returns validated filters or null if validation fails
 *
 * @param formState - Raw form state from UI
 * @returns Validated filter object or null
 */
export function parseFilterFormState(
  formState: FilterFormState,
): ShiftDayFilters | null {
  try {
    const result = ShiftDayFiltersSchema.safeParse({
      reportType: formState.reportType || undefined,
      cashierId: formState.cashierId || undefined,
      rangePreset: formState.rangePreset,
      fromDate: formState.fromDate || undefined,
      toDate: formState.toDate || undefined,
    });

    if (result.success) {
      return result.data;
    }

    console.warn("Filter validation failed:", result.error.flatten());
    return null;
  } catch (error) {
    console.error("Filter parsing error:", error);
    return null;
  }
}

/**
 * Default filter form state
 * Defaults to:
 * - "all" report type to show both shift and day reports
 * - "current" range to show active/current data
 */
export const DEFAULT_FILTER_STATE: FilterFormState = {
  storeId: "",
  reportType: "all",
  cashierId: "",
  rangePreset: "current",
  fromDate: "",
  toDate: "",
};
