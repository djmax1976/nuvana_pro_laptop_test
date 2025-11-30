/**
 * Shift Validation Schemas
 *
 * Zod schemas for validating shift API payloads.
 * Story 4.2: Shift Opening API
 */

import { z } from "zod";

/**
 * Open Shift Request Schema
 * Validates the request body for POST /api/shifts/open
 */
export const OpenShiftSchema = z.object({
  store_id: z.string().uuid("store_id must be a valid UUID"),
  cashier_id: z.string().uuid("cashier_id must be a valid UUID"),
  pos_terminal_id: z.string().uuid("pos_terminal_id must be a valid UUID"),
  opening_cash: z
    .number()
    .nonnegative("opening_cash must be a non-negative number"),
});

/**
 * Type inference from schemas
 */
export type OpenShiftInput = z.infer<typeof OpenShiftSchema>;

/**
 * Validate open shift request and return typed result
 * @param data - Raw payload data
 * @returns Validated and typed open shift input
 * @throws ZodError if validation fails
 */
export function validateOpenShiftInput(data: unknown): OpenShiftInput {
  return OpenShiftSchema.parse(data);
}

/**
 * Safe validation that returns result object instead of throwing
 * @param data - Raw payload data
 * @returns SafeParseResult with success flag and data/error
 */
export function safeValidateOpenShiftInput(data: unknown) {
  return OpenShiftSchema.safeParse(data);
}

/**
 * Shift ID validation schema
 * Validates shiftId from path parameters
 */
export const ShiftIdSchema = z.string().uuid("shiftId must be a valid UUID");

/**
 * Validate shift ID from path parameter
 * @param shiftId - Shift ID from path parameter
 * @returns Validated shift ID
 * @throws ZodError if validation fails
 */
export function validateShiftId(shiftId: string): string {
  return ShiftIdSchema.parse(shiftId);
}

/**
 * Reconcile Cash Request Schema
 * Validates the request body for PUT /api/shifts/:shiftId/reconcile
 */
export const ReconcileCashSchema = z.object({
  closing_cash: z.number().positive("closing_cash must be a positive number"),
  variance_reason: z
    .string()
    .optional()
    .refine(
      (val) => val === undefined || val.trim().length > 0,
      "variance_reason cannot be empty if provided",
    ),
});

/**
 * Type inference from schemas
 */
export type ReconcileCashInput = z.infer<typeof ReconcileCashSchema>;

/**
 * Validate reconcile cash request and return typed result
 * @param data - Raw payload data
 * @returns Validated and typed reconcile cash input
 * @throws ZodError if validation fails
 */
export function validateReconcileCashInput(data: unknown): ReconcileCashInput {
  return ReconcileCashSchema.parse(data);
}

/**
 * Safe validation that returns result object instead of throwing
 * @param data - Raw payload data
 * @returns SafeParseResult with success flag and data/error
 */
export function safeValidateReconcileCashInput(data: unknown) {
  return ReconcileCashSchema.safeParse(data);
}
