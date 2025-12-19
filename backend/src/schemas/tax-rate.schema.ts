/**
 * Tax Rate Validation Schemas
 *
 * Zod schemas for validating tax rate API requests.
 * Phase 1.3: Shift & Day Summary Implementation Plan
 */

import { z } from "zod";

/**
 * Tax rate type enum values
 */
export const TaxRateTypeEnum = z.enum(["PERCENTAGE", "FIXED"]);

/**
 * Tax jurisdiction level enum values
 */
export const TaxJurisdictionLevelEnum = z.enum([
  "FEDERAL",
  "STATE",
  "COUNTY",
  "CITY",
  "DISTRICT",
  "COMBINED",
]);

/**
 * Tax rate code format
 * Must be uppercase letters, numbers, and underscores
 */
export const TaxRateCodeSchema = z
  .string()
  .min(2, "Code must be at least 2 characters")
  .max(50, "Code must not exceed 50 characters")
  .regex(
    /^[A-Z][A-Z0-9_]*$/,
    "Code must start with a letter and contain only uppercase letters, numbers, and underscores",
  );

/**
 * Tax rate value validation
 * For PERCENTAGE: 0 to 1 (e.g., 0.0825 for 8.25%)
 * For FIXED: any positive number
 */
export const TaxRateValueSchema = z
  .number()
  .nonnegative("Rate must be non-negative")
  .max(1, "Percentage rate must be <= 1 (100%)");

/**
 * Date string or Date object that converts to a Date
 */
export const DateSchema = z.preprocess((arg) => {
  if (typeof arg === "string" || arg instanceof Date) {
    return new Date(arg);
  }
  return arg;
}, z.date());

/**
 * Schema for creating a new tax rate
 */
export const TaxRateCreateSchema = z
  .object({
    code: TaxRateCodeSchema,
    display_name: z
      .string()
      .min(1, "Display name is required")
      .max(100, "Display name must not exceed 100 characters"),
    description: z
      .string()
      .max(500, "Description must not exceed 500 characters")
      .optional(),
    rate: z.number().nonnegative("Rate must be non-negative"),
    rate_type: TaxRateTypeEnum.default("PERCENTAGE"),
    jurisdiction_level: TaxJurisdictionLevelEnum.default("STATE"),
    jurisdiction_code: z
      .string()
      .max(20, "Jurisdiction code must not exceed 20 characters")
      .optional(),
    effective_from: DateSchema,
    effective_to: DateSchema.nullable().optional(),
    sort_order: z.number().int().min(0).default(0),
    is_compound: z.boolean().default(false),
    store_id: z.string().uuid("Invalid store ID").optional(),
  })
  .refine(
    (data) => {
      // For PERCENTAGE type, rate should be <= 1
      if (data.rate_type === "PERCENTAGE" && data.rate > 1) {
        return false;
      }
      return true;
    },
    {
      message: "Percentage rate must be <= 1 (e.g., 0.0825 for 8.25%)",
      path: ["rate"],
    },
  )
  .refine(
    (data) => {
      // effective_to must be after effective_from if provided
      if (data.effective_to && data.effective_from >= data.effective_to) {
        return false;
      }
      return true;
    },
    {
      message: "Effective end date must be after start date",
      path: ["effective_to"],
    },
  );

/**
 * Schema for updating an existing tax rate
 */
export const TaxRateUpdateSchema = z
  .object({
    display_name: z
      .string()
      .min(1, "Display name is required")
      .max(100, "Display name must not exceed 100 characters")
      .optional(),
    description: z
      .string()
      .max(500, "Description must not exceed 500 characters")
      .nullable()
      .optional(),
    rate: z.number().nonnegative("Rate must be non-negative").optional(),
    rate_type: TaxRateTypeEnum.optional(),
    jurisdiction_level: TaxJurisdictionLevelEnum.optional(),
    jurisdiction_code: z
      .string()
      .max(20, "Jurisdiction code must not exceed 20 characters")
      .nullable()
      .optional(),
    effective_from: DateSchema.optional(),
    effective_to: DateSchema.nullable().optional(),
    sort_order: z.number().int().min(0).optional(),
    is_compound: z.boolean().optional(),
    is_active: z.boolean().optional(),
  })
  .refine(
    (data) => {
      // For PERCENTAGE type, rate should be <= 1
      if (
        data.rate !== undefined &&
        data.rate_type === "PERCENTAGE" &&
        data.rate > 1
      ) {
        return false;
      }
      return true;
    },
    {
      message: "Percentage rate must be <= 1 (e.g., 0.0825 for 8.25%)",
      path: ["rate"],
    },
  );

/**
 * Schema for tax rate query parameters
 */
export const TaxRateQuerySchema = z.object({
  client_id: z.string().uuid("Invalid client ID").optional(),
  store_id: z.string().uuid("Invalid store ID").optional(),
  include_inactive: z
    .union([z.boolean(), z.string().transform((val) => val === "true")])
    .optional()
    .default(false),
  include_system: z
    .union([z.boolean(), z.string().transform((val) => val === "true")])
    .optional()
    .default(true),
  jurisdiction_level: TaxJurisdictionLevelEnum.optional(),
  effective_date: z
    .string()
    .transform((val) => new Date(val))
    .optional(),
  include_store: z
    .union([z.boolean(), z.string().transform((val) => val === "true")])
    .optional()
    .default(false),
});

/**
 * Type exports from schemas
 */
export type TaxRateCreate = z.infer<typeof TaxRateCreateSchema>;
export type TaxRateUpdate = z.infer<typeof TaxRateUpdateSchema>;
export type TaxRateQuery = z.infer<typeof TaxRateQuerySchema>;
