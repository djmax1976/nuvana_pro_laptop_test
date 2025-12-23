/**
 * Department Validation Schemas
 *
 * Zod schemas for validating department API payloads.
 * Phase 1.2: Shift & Day Summary Implementation Plan
 */

import { z } from "zod";

/**
 * Department code validation
 * Must be uppercase letters, numbers, and underscores, starting with a letter
 */
export const DepartmentCodeSchema = z
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
 * Create Department Request Schema
 * Validates the request body for POST /api/config/departments
 */
export const DepartmentCreateSchema = z.object({
  code: DepartmentCodeSchema,
  display_name: z
    .string()
    .min(1, "Display name is required")
    .max(100, "Display name must be at most 100 characters"),
  description: z
    .string()
    .max(500, "Description must be at most 500 characters")
    .optional(),
  parent_id: z.string().uuid("Parent ID must be a valid UUID").optional(),
  is_taxable: z.boolean().default(true),
  default_tax_rate_id: z
    .string()
    .uuid("Tax rate ID must be a valid UUID")
    .optional(),
  minimum_age: z
    .number()
    .int()
    .min(0, "Minimum age must be non-negative")
    .max(100, "Minimum age must be at most 100")
    .optional(),
  requires_id_scan: z.boolean().default(false),
  is_lottery: z.boolean().default(false),
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
 * Update Department Request Schema
 * Validates the request body for PATCH /api/config/departments/:id
 */
export const DepartmentUpdateSchema = z.object({
  display_name: z
    .string()
    .min(1, "Display name is required")
    .max(100, "Display name must be at most 100 characters")
    .optional(),
  description: z
    .string()
    .max(500, "Description must be at most 500 characters")
    .optional()
    .nullable(),
  parent_id: z
    .string()
    .uuid("Parent ID must be a valid UUID")
    .optional()
    .nullable(),
  is_taxable: z.boolean().optional(),
  default_tax_rate_id: z
    .string()
    .uuid("Tax rate ID must be a valid UUID")
    .optional()
    .nullable(),
  minimum_age: z
    .number()
    .int()
    .min(0, "Minimum age must be non-negative")
    .max(100, "Minimum age must be at most 100")
    .optional()
    .nullable(),
  requires_id_scan: z.boolean().optional(),
  is_lottery: z.boolean().optional(),
  sort_order: z
    .number()
    .int()
    .min(0, "Sort order must be non-negative")
    .optional(),
  icon_name: z
    .string()
    .max(50, "Icon name must be at most 50 characters")
    .optional()
    .nullable(),
  color_code: HexColorSchema.nullable(),
  is_active: z.boolean().optional(),
});

/**
 * Query parameters for listing departments
 * Query string booleans come as strings, so we transform them
 */
export const DepartmentQuerySchema = z.object({
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
  parent_id: z.string().uuid("Parent ID must be a valid UUID").optional(),
  is_lottery: z
    .string()
    .optional()
    .transform((val) => (val === undefined ? undefined : val === "true")),
  include_children: z
    .string()
    .optional()
    .transform((val) => val === "true")
    .default(false),
  client_id: z.string().uuid("client_id must be a valid UUID").optional(),
});

/**
 * Department ID validation schema
 * Validates department_id from path parameters
 */
export const DepartmentIdSchema = z.object({
  id: z.string().uuid("Department ID must be a valid UUID"),
});

/**
 * Type inference from schemas
 */
export type DepartmentCreate = z.infer<typeof DepartmentCreateSchema>;
export type DepartmentUpdate = z.infer<typeof DepartmentUpdateSchema>;
export type DepartmentQuery = z.infer<typeof DepartmentQuerySchema>;
export type DepartmentId = z.infer<typeof DepartmentIdSchema>;

/**
 * Validate create department input
 * @param data - Raw payload data
 * @returns Validated and typed create input
 * @throws ZodError if validation fails
 */
export function validateDepartmentCreate(data: unknown): DepartmentCreate {
  return DepartmentCreateSchema.parse(data);
}

/**
 * Validate update department input
 * @param data - Raw payload data
 * @returns Validated and typed update input
 * @throws ZodError if validation fails
 */
export function validateDepartmentUpdate(data: unknown): DepartmentUpdate {
  return DepartmentUpdateSchema.parse(data);
}

/**
 * Safe validation that returns result object instead of throwing
 * @param data - Raw payload data
 * @returns SafeParseResult with success flag and data/error
 */
export function safeValidateDepartmentCreate(data: unknown) {
  return DepartmentCreateSchema.safeParse(data);
}

export function safeValidateDepartmentUpdate(data: unknown) {
  return DepartmentUpdateSchema.safeParse(data);
}
