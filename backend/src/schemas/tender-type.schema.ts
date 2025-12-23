/**
 * TenderType Validation Schemas
 *
 * Zod schemas for validating tender type API payloads.
 * Phase 1.1: Shift & Day Summary Implementation Plan
 */

import { z } from "zod";

/**
 * TenderType code validation
 * Must be uppercase letters, numbers, and underscores, starting with a letter
 */
export const TenderTypeCodeSchema = z
  .string()
  .min(2, "Code must be at least 2 characters")
  .max(50, "Code must be at most 50 characters")
  .regex(
    /^[A-Z][A-Z0-9_]*$/,
    "Code must be uppercase letters, numbers, and underscores, starting with a letter",
  );

/**
 * Hex color code validation
 */
export const HexColorSchema = z
  .string()
  .regex(
    /^#[0-9A-Fa-f]{6}$/,
    "Color must be a valid hex color code (e.g., #FF0000)",
  )
  .optional();

/**
 * Create TenderType Request Schema
 * Validates the request body for POST /api/config/tender-types
 */
export const TenderTypeCreateSchema = z.object({
  code: TenderTypeCodeSchema,
  display_name: z
    .string()
    .min(1, "Display name is required")
    .max(100, "Display name must be at most 100 characters"),
  description: z
    .string()
    .max(500, "Description must be at most 500 characters")
    .optional(),
  is_cash_equivalent: z.boolean().default(false),
  requires_reference: z.boolean().default(false),
  is_electronic: z.boolean().default(false),
  affects_cash_drawer: z.boolean().default(true),
  sort_order: z
    .number()
    .int()
    .min(0, "Sort order must be non-negative")
    .default(0),
  icon_name: z
    .string()
    .max(50, "Icon name must be at most 50 characters")
    .optional(),
  color_code: HexColorSchema,
});

/**
 * Update TenderType Request Schema
 * Validates the request body for PATCH /api/config/tender-types/:id
 */
export const TenderTypeUpdateSchema = z.object({
  display_name: z
    .string()
    .min(1, "Display name is required")
    .max(100, "Display name must be at most 100 characters")
    .optional(),
  description: z
    .string()
    .max(500, "Description must be at most 500 characters")
    .optional(),
  is_cash_equivalent: z.boolean().optional(),
  requires_reference: z.boolean().optional(),
  is_electronic: z.boolean().optional(),
  affects_cash_drawer: z.boolean().optional(),
  sort_order: z
    .number()
    .int()
    .min(0, "Sort order must be non-negative")
    .optional(),
  icon_name: z
    .string()
    .max(50, "Icon name must be at most 50 characters")
    .optional(),
  color_code: HexColorSchema,
  is_active: z.boolean().optional(),
});

/**
 * Query parameters for listing tender types
 * Query string booleans come as strings, so we transform them
 */
export const TenderTypeQuerySchema = z.object({
  include_inactive: z
    .string()
    .optional()
    .transform((val) => val === "true")
    .default(false),
  include_system: z
    .string()
    .optional()
    .transform((val) => val === "true" || val === undefined)
    .default(true),
  client_id: z.string().uuid("client_id must be a valid UUID").optional(),
});

/**
 * TenderType ID validation schema
 * Validates tender_type_id from path parameters
 */
export const TenderTypeIdSchema = z.object({
  id: z.string().uuid("Tender type ID must be a valid UUID"),
});

/**
 * Type inference from schemas
 */
export type TenderTypeCreate = z.infer<typeof TenderTypeCreateSchema>;
export type TenderTypeUpdate = z.infer<typeof TenderTypeUpdateSchema>;
export type TenderTypeQuery = z.infer<typeof TenderTypeQuerySchema>;
export type TenderTypeId = z.infer<typeof TenderTypeIdSchema>;

/**
 * Validate create tender type input
 * @param data - Raw payload data
 * @returns Validated and typed create input
 * @throws ZodError if validation fails
 */
export function validateTenderTypeCreate(data: unknown): TenderTypeCreate {
  return TenderTypeCreateSchema.parse(data);
}

/**
 * Validate update tender type input
 * @param data - Raw payload data
 * @returns Validated and typed update input
 * @throws ZodError if validation fails
 */
export function validateTenderTypeUpdate(data: unknown): TenderTypeUpdate {
  return TenderTypeUpdateSchema.parse(data);
}

/**
 * Safe validation that returns result object instead of throwing
 * @param data - Raw payload data
 * @returns SafeParseResult with success flag and data/error
 */
export function safeValidateTenderTypeCreate(data: unknown) {
  return TenderTypeCreateSchema.safeParse(data);
}

export function safeValidateTenderTypeUpdate(data: unknown) {
  return TenderTypeUpdateSchema.safeParse(data);
}
