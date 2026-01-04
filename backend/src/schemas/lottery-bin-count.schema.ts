/**
 * Lottery Bin Count Validation Schemas
 *
 * Enterprise-grade Zod schemas for lottery bin count configuration.
 * Used when store owners set the number of bins for their store.
 *
 * @enterprise-standards
 * - API-001: VALIDATION - Schema validation for every request payload
 * - SEC-014: INPUT_VALIDATION - Strict allowlists and range constraints
 * - FE-002: FORM_VALIDATION - Mirror backend validation client-side
 *
 * Business Rules:
 * - Bin count must be between 1 and 200 (inclusive)
 * - Setting to 0 effectively disables lottery bins
 * - Reducing bin count only soft-deletes empty bins
 * - Bins with active packs cannot be removed (validation at service layer)
 */

import { z } from "zod";

// =============================================================================
// Constants
// =============================================================================

/**
 * Minimum number of lottery bins a store can have
 * 0 means lottery bins are disabled for the store
 */
export const MIN_LOTTERY_BIN_COUNT = 0;

/**
 * Maximum number of lottery bins a store can have
 * Based on physical store capacity constraints
 */
export const MAX_LOTTERY_BIN_COUNT = 200;

// =============================================================================
// Schemas
// =============================================================================

/**
 * Lottery Bin Count Schema
 * Validates the bin count value with enterprise-grade constraints
 */
export const LotteryBinCountSchema = z
  .number()
  .int("Bin count must be a whole number")
  .min(
    MIN_LOTTERY_BIN_COUNT,
    `Bin count must be at least ${MIN_LOTTERY_BIN_COUNT}`,
  )
  .max(
    MAX_LOTTERY_BIN_COUNT,
    `Bin count cannot exceed ${MAX_LOTTERY_BIN_COUNT}`,
  );

/**
 * Update Lottery Bin Count Request Schema
 * For PUT /api/stores/:storeId/lottery/bin-count endpoint
 */
export const UpdateLotteryBinCountSchema = z.object({
  bin_count: LotteryBinCountSchema,
});

export type UpdateLotteryBinCountInput = z.infer<
  typeof UpdateLotteryBinCountSchema
>;

/**
 * Lottery Bin Count Response Schema
 * For GET /api/stores/:storeId/lottery/bin-count endpoint
 */
export const LotteryBinCountResponseSchema = z.object({
  store_id: z.string().uuid(),
  bin_count: z.number().int().nullable(),
  active_bins: z.number().int(),
  bins_with_packs: z.number().int(),
  empty_bins: z.number().int(),
});

export type LotteryBinCountResponse = z.infer<
  typeof LotteryBinCountResponseSchema
>;

// =============================================================================
// Validation Helper Functions
// =============================================================================

/**
 * Validate update lottery bin count input
 * @param data - Raw input data
 * @returns Validated and typed input
 * @throws ZodError if validation fails
 */
export function validateUpdateLotteryBinCount(
  data: unknown,
): UpdateLotteryBinCountInput {
  return UpdateLotteryBinCountSchema.parse(data);
}

/**
 * Safe validation for update lottery bin count
 * @param data - Raw input data
 * @returns SafeParseResult with success flag and data/error
 */
export function safeValidateUpdateLotteryBinCount(data: unknown) {
  return UpdateLotteryBinCountSchema.safeParse(data);
}

/**
 * Validate just the bin count value
 * @param value - Raw bin count value
 * @returns Validated bin count number
 * @throws ZodError if validation fails
 */
export function validateBinCount(value: unknown): number {
  return LotteryBinCountSchema.parse(value);
}

/**
 * Safe validation for bin count value
 * @param value - Raw bin count value
 * @returns SafeParseResult with success flag and data/error
 */
export function safeValidateBinCount(value: unknown) {
  return LotteryBinCountSchema.safeParse(value);
}
