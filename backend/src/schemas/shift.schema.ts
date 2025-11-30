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
 * Supports both reconciliation (CLOSING status) and variance approval (VARIANCE_REVIEW status)
 */
export const ReconcileCashSchema = z.object({
  closing_cash: z
    .number()
    .positive("closing_cash must be a positive number")
    .optional(),
  variance_reason: z
    .string()
    .optional()
    .refine(
      (val) => val === undefined || val.trim().length > 0,
      "variance_reason cannot be empty if provided",
    ),
});

/**
 * Variance Approval Request Schema
 * Validates the request body for variance approval (VARIANCE_REVIEW status)
 */
export const ApproveVarianceSchema = z.object({
  variance_reason: z
    .string()
    .min(1, "variance_reason is required when approving variance"),
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

/**
 * Type inference from variance approval schema
 */
export type ApproveVarianceInput = z.infer<typeof ApproveVarianceSchema>;

/**
 * Validate variance approval request and return typed result
 * @param data - Raw payload data
 * @returns Validated and typed variance approval input
 * @throws ZodError if validation fails
 */
export function validateApproveVarianceInput(
  data: unknown,
): ApproveVarianceInput {
  return ApproveVarianceSchema.parse(data);
}

/**
 * Safe validation that returns result object instead of throwing
 * @param data - Raw payload data
 * @returns SafeParseResult with success flag and data/error
 */
export function safeValidateApproveVarianceInput(data: unknown) {
  return ApproveVarianceSchema.safeParse(data);
}

/**
 * Shift Query Parameters Schema
 * Validates query parameters for GET /api/shifts
 * Story 4.7: Shift Management UI
 */
export const ShiftQuerySchema = z.object({
  status: z
    .enum([
      "NOT_STARTED",
      "OPEN",
      "ACTIVE",
      "CLOSING",
      "RECONCILING",
      "CLOSED",
      "VARIANCE_REVIEW",
    ])
    .optional(),
  store_id: z.string().uuid("store_id must be a valid UUID").optional(),
  from: z
    .string()
    .datetime("from must be a valid ISO 8601 datetime")
    .optional(),
  to: z.string().datetime("to must be a valid ISO 8601 datetime").optional(),
  limit: z
    .number()
    .int("limit must be an integer")
    .min(1, "limit must be at least 1")
    .max(200, "limit must be at most 200")
    .default(50),
  offset: z
    .number()
    .int("offset must be an integer")
    .min(0, "offset must be non-negative")
    .default(0),
});

/**
 * Type inference from shift query schema
 */
export type ShiftQueryInput = z.infer<typeof ShiftQuerySchema>;

/**
 * Validate shift query parameters and return typed result
 * @param data - Raw query parameters
 * @returns Validated and typed shift query input
 * @throws ZodError if validation fails
 */
export function validateShiftQueryInput(data: unknown): ShiftQueryInput {
  return ShiftQuerySchema.parse(data);
}

/**
 * Safe validation that returns result object instead of throwing
 * @param data - Raw query parameters
 * @returns SafeParseResult with success flag and data/error
 */
export function safeValidateShiftQueryInput(data: unknown) {
  return ShiftQuerySchema.safeParse(data);
}
