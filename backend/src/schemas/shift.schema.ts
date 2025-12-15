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
 * Story 4.8: cashier_id is optional - if not provided, backend auto-assigns from authenticated user
 */
export const OpenShiftSchema = z.object({
  store_id: z.string().uuid("store_id must be a valid UUID"),
  cashier_id: z.string().uuid("cashier_id must be a valid UUID").optional(),
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
  limit: z.coerce
    .number()
    .int("limit must be an integer")
    .min(1, "limit must be at least 1")
    .max(200, "limit must be at most 200")
    .default(50),
  offset: z.coerce
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

/**
 * Start Shift Request Schema
 * Validates the request body for POST /api/terminals/:terminalId/shifts/start
 * Story 4.92: Terminal Shift Page
 */
export const StartShiftSchema = z.object({
  cashier_id: z.string().uuid("cashier_id must be a valid UUID"),
});

/**
 * Type inference from start shift schema
 */
export type StartShiftInput = z.infer<typeof StartShiftSchema>;

/**
 * Validate start shift request and return typed result
 * @param data - Raw payload data
 * @returns Validated and typed start shift input
 * @throws ZodError if validation fails
 */
export function validateStartShiftInput(data: unknown): StartShiftInput {
  return StartShiftSchema.parse(data);
}

/**
 * Safe validation that returns result object instead of throwing
 * @param data - Raw payload data
 * @returns SafeParseResult with success flag and data/error
 */
export function safeValidateStartShiftInput(data: unknown) {
  return StartShiftSchema.safeParse(data);
}

/**
 * Update Starting Cash Request Schema
 * Validates the request body for PUT /api/shifts/:shiftId/starting-cash
 *
 * Note: cashier_id is NOT included here - it's extracted from the validated
 * X-Cashier-Session token by the cashierSessionWithPermission middleware.
 * This follows the enterprise cashier session pattern where the authenticated
 * cashier's identity comes from the session, not the request body.
 *
 * Story 4.92: Terminal Shift Page
 */
export const UpdateStartingCashSchema = z.object({
  starting_cash: z
    .number()
    .nonnegative("starting_cash must be a non-negative number or zero"),
});

/**
 * Type inference from update starting cash schema
 */
export type UpdateStartingCashInput = z.infer<typeof UpdateStartingCashSchema>;

/**
 * Validate update starting cash request and return typed result
 * @param data - Raw payload data
 * @returns Validated and typed update starting cash input
 * @throws ZodError if validation fails
 */
export function validateUpdateStartingCashInput(
  data: unknown,
): UpdateStartingCashInput {
  return UpdateStartingCashSchema.parse(data);
}

/**
 * Safe validation that returns result object instead of throwing
 * @param data - Raw payload data
 * @returns SafeParseResult with success flag and data/error
 */
export function safeValidateUpdateStartingCashInput(data: unknown) {
  return UpdateStartingCashSchema.safeParse(data);
}

/**
 * Pack Opening Schema
 * Validates a single pack opening entry
 * Story 6.6: Shift Lottery Opening
 */
export const PackOpeningSchema = z.object({
  packId: z.string().uuid("packId must be a valid UUID"),
  openingSerial: z
    .string()
    .min(1, "openingSerial is required")
    .max(100, "openingSerial must be at most 100 characters"),
});

/**
 * Shift Lottery Opening Request Schema
 * Validates the request body for POST /api/shifts/:shiftId/lottery/opening
 * Story 6.6: Shift Lottery Opening
 */
export const ShiftLotteryOpeningSchema = z.object({
  packOpenings: z
    .array(PackOpeningSchema)
    .min(1, "At least one pack opening is required"),
});

/**
 * Type inference from schemas
 */
export type PackOpeningInput = z.infer<typeof PackOpeningSchema>;
export type ShiftLotteryOpeningInput = z.infer<
  typeof ShiftLotteryOpeningSchema
>;

/**
 * Validate shift lottery opening request and return typed result
 * @param data - Raw payload data
 * @returns Validated and typed shift lottery opening input
 * @throws ZodError if validation fails
 */
export function validateShiftLotteryOpeningInput(
  data: unknown,
): ShiftLotteryOpeningInput {
  return ShiftLotteryOpeningSchema.parse(data);
}

/**
 * Safe validation that returns result object instead of throwing
 * @param data - Raw payload data
 * @returns SafeParseResult with success flag and data/error
 */
export function safeValidateShiftLotteryOpeningInput(data: unknown) {
  return ShiftLotteryOpeningSchema.safeParse(data);
}

/**
 * Pack Closing Schema
 * Validates a single pack closing entry
 * Story 6.7: Shift Lottery Closing and Reconciliation
 * Story 10.4: Manual Entry Override - Added entry_method tracking
 */
export const PackClosingSchema = z
  .object({
    packId: z.string().uuid("packId must be a valid UUID"),
    closingSerial: z
      .string()
      .min(1, "closingSerial is required")
      .max(100, "closingSerial must be at most 100 characters"),
    entry_method: z
      .enum(["SCAN", "MANUAL"], {
        errorMap: () => ({
          message: "entry_method must be 'SCAN' or 'MANUAL'",
        }),
      })
      .optional(),
    manual_entry_authorized_by: z
      .string()
      .uuid("manual_entry_authorized_by must be a valid UUID")
      .optional(),
    manual_entry_authorized_at: z
      .string()
      .datetime("manual_entry_authorized_at must be a valid ISO 8601 datetime")
      .optional(),
  })
  .refine(
    (data) => {
      // If entry_method is 'MANUAL', then authorization fields are required
      if (data.entry_method === "MANUAL") {
        return (
          data.manual_entry_authorized_by !== undefined &&
          data.manual_entry_authorized_at !== undefined
        );
      }
      return true;
    },
    {
      message:
        "manual_entry_authorized_by and manual_entry_authorized_at are required when entry_method is 'MANUAL'",
    },
  );

/**
 * Shift Lottery Closing Request Schema
 * Validates the request body for POST /api/shifts/:shiftId/lottery/closing
 * Story 6.7: Shift Lottery Closing and Reconciliation
 */
export const ShiftLotteryClosingSchema = z.object({
  packClosings: z
    .array(PackClosingSchema)
    .min(1, "At least one pack closing is required"),
});

/**
 * Type inference from schemas
 */
export type PackClosingInput = z.infer<typeof PackClosingSchema>;
export type ShiftLotteryClosingInput = z.infer<
  typeof ShiftLotteryClosingSchema
>;

/**
 * Validate shift lottery closing request and return typed result
 * @param data - Raw payload data
 * @returns Validated and typed shift lottery closing input
 * @throws ZodError if validation fails
 */
export function validateShiftLotteryClosingInput(
  data: unknown,
): ShiftLotteryClosingInput {
  return ShiftLotteryClosingSchema.parse(data);
}

/**
 * Safe validation that returns result object instead of throwing
 * @param data - Raw payload data
 * @returns SafeParseResult with success flag and data/error
 */
export function safeValidateShiftLotteryClosingInput(data: unknown) {
  return ShiftLotteryClosingSchema.safeParse(data);
}
