/**
 * Lottery Sync Validation Schemas
 *
 * Enterprise-grade Zod schemas for lottery sync endpoints.
 * Enforces strict input validation for all 25 lottery sync endpoints.
 *
 * Security Controls:
 * - API-001: Schema validation for every request payload
 * - SEC-006: Parameterized values prevent injection
 * - DB-006: Store isolation enforced via session validation
 *
 * @module schemas/lottery-sync.schema
 */

import { z } from "zod";

// =============================================================================
// Constants
// =============================================================================

/** Valid lottery pack statuses for sync (matches Prisma enum) */
export const LOTTERY_PACK_STATUSES = [
  "RECEIVED",
  "ACTIVE",
  "DEPLETED",
  "RETURNED",
] as const;

/** Valid entry methods for serial input */
export const ENTRY_METHODS = ["SCAN", "MANUAL"] as const;

/** Valid depletion reasons (matches Prisma enum) */
export const DEPLETION_REASONS = [
  "SHIFT_CLOSE",
  "AUTO_REPLACED",
  "MANUAL_SOLD_OUT",
  "POS_LAST_TICKET",
] as const;

/** Valid return reasons (matches Prisma enum) */
export const RETURN_REASONS = [
  "SUPPLIER_RECALL",
  "DAMAGED",
  "EXPIRED",
  "INVENTORY_ADJUSTMENT",
  "STORE_CLOSURE",
] as const;

/** Valid day statuses */
export const DAY_STATUSES = ["OPEN", "PENDING_CLOSE", "CLOSED"] as const;

// =============================================================================
// Base Schemas (Reusable)
// =============================================================================

/** UUID validation */
const uuidSchema = z.string().uuid("Invalid UUID format");

/** Serial number validation - alphanumeric, 1-100 chars */
const serialSchema = z
  .string()
  .min(1, "Serial number is required")
  .max(100, "Serial number cannot exceed 100 characters")
  .regex(/^[a-zA-Z0-9]+$/, "Serial number must be alphanumeric");

/** Pack number validation */
const packNumberSchema = z
  .string()
  .min(1, "Pack number is required")
  .max(50, "Pack number cannot exceed 50 characters");

/** Game code validation - exactly 4 characters */
const gameCodeSchema = z
  .string()
  .length(4, "Game code must be exactly 4 characters")
  .regex(/^[a-zA-Z0-9]+$/, "Game code must be alphanumeric");

/** Reason/notes validation */
const reasonSchema = z
  .string()
  .max(500, "Reason cannot exceed 500 characters")
  .optional();

/** ISO 8601 datetime validation */
const isoDatetimeSchema = z
  .string()
  .datetime("Must be a valid ISO 8601 datetime");

/**
 * Validate a string as a valid decimal (up to 2 decimal places)
 * Supports positive numbers only: "123" or "123.45"
 */
function isValidDecimal(val: string): boolean {
  const num = Number(val);
  if (Number.isNaN(num) || !Number.isFinite(num)) return false;
  if (num < 0) return false;
  // Check format: digits with optional 1-2 decimal places
  const parts = val.split(".");
  if (parts.length > 2) return false;
  if (parts[0].length === 0 || parts[0].length > 15) return false;
  if (!/^[0-9]+$/.test(parts[0])) return false;
  if (parts[1] && (parts[1].length === 0 || parts[1].length > 2)) return false;
  if (parts[1] && !/^[0-9]+$/.test(parts[1])) return false;
  return true;
}

/**
 * Validate a string as a valid signed decimal (up to 2 decimal places)
 * Supports positive and negative numbers: "123", "-123.45"
 */
function isValidSignedDecimal(val: string): boolean {
  const trimmed = val.startsWith("-") ? val.slice(1) : val;
  if (trimmed.length === 0) return false;
  return isValidDecimal(trimmed);
}

/** Positive integer validation */
const positiveIntSchema = z
  .number()
  .int("Must be an integer")
  .min(0, "Cannot be negative");

// =============================================================================
// PULL Endpoint Query Schemas
// =============================================================================

/**
 * Base sync query schema - common parameters for all PULL endpoints
 */
export const baseSyncQuerySchema = z.object({
  session_id: uuidSchema,
  since_timestamp: z
    .string()
    .datetime("since_timestamp must be a valid ISO 8601 datetime")
    .optional(),
  since_sequence: z.coerce
    .number()
    .int("since_sequence must be an integer")
    .min(0, "since_sequence cannot be negative")
    .optional(),
  limit: z.coerce
    .number()
    .int("limit must be an integer")
    .min(1, "limit must be at least 1")
    .max(500, "limit cannot exceed 500")
    .default(100),
});

/**
 * GET /api/v1/sync/lottery/games
 * Query schema for fetching lottery games
 */
export const lotterySyncGamesQuerySchema = baseSyncQuerySchema.extend({
  include_inactive: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});

/**
 * GET /api/v1/sync/lottery/config
 * Query schema for fetching lottery configuration
 */
export const lotterySyncConfigQuerySchema = baseSyncQuerySchema;

/**
 * GET /api/v1/sync/lottery/bins
 * Query schema for fetching lottery bins
 */
export const lotterySyncBinsQuerySchema = baseSyncQuerySchema.extend({
  include_inactive: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});

/**
 * GET /api/v1/sync/lottery/packs/* (received, activated, returned, depleted)
 * Query schema for fetching lottery packs by status
 */
export const lotterySyncPacksQuerySchema = baseSyncQuerySchema.extend({
  bin_id: uuidSchema.optional(),
  game_id: uuidSchema.optional(),
});

/**
 * GET /api/v1/sync/lottery/day-status
 * Query schema for fetching current day status
 */
export const lotterySyncDayStatusQuerySchema = z.object({
  session_id: uuidSchema,
  business_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "business_date must be YYYY-MM-DD format")
    .optional(),
});

/**
 * GET /api/v1/sync/lottery/shift-openings
 * Query schema for fetching shift opening records
 */
export const lotterySyncShiftOpeningsQuerySchema = baseSyncQuerySchema.extend({
  shift_id: uuidSchema.optional(),
});

/**
 * GET /api/v1/sync/lottery/shift-closings
 * Query schema for fetching shift closing records
 */
export const lotterySyncShiftClosingsQuerySchema = baseSyncQuerySchema.extend({
  shift_id: uuidSchema.optional(),
});

/**
 * GET /api/v1/sync/lottery/variances
 * Query schema for fetching variance records
 */
export const lotterySyncVariancesQuerySchema = baseSyncQuerySchema.extend({
  shift_id: uuidSchema.optional(),
  pack_id: uuidSchema.optional(),
  unresolved_only: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});

/**
 * GET /api/v1/sync/lottery/day-packs
 * Query schema for fetching day pack records
 */
export const lotterySyncDayPacksQuerySchema = baseSyncQuerySchema.extend({
  day_id: uuidSchema.optional(),
  pack_id: uuidSchema.optional(),
});

/**
 * GET /api/v1/sync/lottery/bin-history
 * Query schema for fetching bin history records
 */
export const lotterySyncBinHistoryQuerySchema = baseSyncQuerySchema.extend({
  pack_id: uuidSchema.optional(),
  bin_id: uuidSchema.optional(),
});

// =============================================================================
// PUSH Endpoint Body Schemas
// =============================================================================

/**
 * POST /api/v1/sync/lottery/packs/receive
 * Schema for receiving a single pack
 */
export const lotteryPackReceiveSchema = z.object({
  session_id: uuidSchema,
  game_code: gameCodeSchema,
  pack_number: packNumberSchema,
  serial_start: serialSchema,
  serial_end: serialSchema,
  received_at: isoDatetimeSchema.optional(),
  /** Local ID for offline conflict resolution */
  local_id: z.string().max(100).optional(),
});

/**
 * POST /api/v1/sync/lottery/packs/receive/batch
 * Schema for receiving multiple packs
 */
export const lotteryPackReceiveBatchSchema = z.object({
  session_id: uuidSchema,
  packs: z
    .array(
      z.object({
        game_code: gameCodeSchema,
        pack_number: packNumberSchema,
        serial_start: serialSchema,
        serial_end: serialSchema,
        received_at: isoDatetimeSchema.optional(),
        local_id: z.string().max(100).optional(),
      }),
    )
    .min(1, "At least one pack is required")
    .max(100, "Cannot receive more than 100 packs at once"),
});

/**
 * POST /api/v1/sync/lottery/packs/activate
 * Schema for activating a pack and assigning to bin
 *
 * Server handles:
 * 1. Pack exists with RECEIVED status: Activate it
 * 2. Pack already ACTIVE in same bin: Idempotent success
 * 3. Pack doesn't exist + optional fields provided: Create and activate
 * 4. Pack ACTIVE in different bin: Error
 */
export const lotteryPackActivateSchema = z.object({
  session_id: uuidSchema,
  pack_id: uuidSchema,
  bin_id: uuidSchema,
  opening_serial: serialSchema,
  /** When pack was activated - required */
  activated_at: isoDatetimeSchema,
  /** When pack was received - required */
  received_at: isoDatetimeSchema,
  // Pack data fields - required for activation
  game_code: gameCodeSchema,
  pack_number: packNumberSchema,
  serial_start: serialSchema,
  serial_end: serialSchema,
  // Optional fields
  shift_id: uuidSchema.optional(),
  local_id: z.string().max(100).optional(),
  /**
   * Pre-sold tickets fields - OPTIONAL
   * Only used when opening_serial is NOT "000" (meaning some tickets were sold before activation)
   * These track tickets that were sold before the pack was officially activated in the system
   */
  mark_sold_tickets: positiveIntSchema.optional(),
  mark_sold_approved_by: uuidSchema.optional(),
  mark_sold_reason: reasonSchema.optional(),
});

/**
 * POST /api/v1/sync/lottery/packs/move
 * Schema for moving a pack between bins
 */
export const lotteryPackMoveSchema = z.object({
  session_id: uuidSchema,
  pack_id: uuidSchema,
  from_bin_id: uuidSchema,
  to_bin_id: uuidSchema,
  reason: reasonSchema,
  moved_at: isoDatetimeSchema.optional(),
  local_id: z.string().max(100).optional(),
});

/**
 * POST /api/v1/sync/lottery/packs/deplete
 * Schema for marking a pack as sold out
 */
export const lotteryPackDepleteSchema = z.object({
  session_id: uuidSchema,
  pack_id: uuidSchema,
  final_serial: serialSchema,
  depletion_reason: z.enum(DEPLETION_REASONS),
  depleted_at: isoDatetimeSchema.optional(),
  shift_id: uuidSchema.optional(),
  notes: reasonSchema,
  local_id: z.string().max(100).optional(),
});

/**
 * POST /api/v1/sync/lottery/packs/return
 * Schema for returning a pack to supplier
 */
export const lotteryPackReturnSchema = z.object({
  session_id: uuidSchema,
  pack_id: uuidSchema,
  return_reason: z.enum(RETURN_REASONS),
  last_sold_serial: serialSchema.optional(),
  tickets_sold_on_return: positiveIntSchema.optional(),
  return_notes: reasonSchema,
  returned_at: isoDatetimeSchema.optional(),
  shift_id: uuidSchema.optional(),
  day_id: uuidSchema.optional(),
  local_id: z.string().max(100).optional(),
});

/**
 * POST /api/v1/sync/lottery/shift/open
 * Schema for recording shift opening serials
 */
export const lotteryShiftOpenSchema = z.object({
  session_id: uuidSchema,
  shift_id: uuidSchema,
  openings: z
    .array(
      z.object({
        pack_id: uuidSchema,
        opening_serial: serialSchema,
      }),
    )
    .min(1, "At least one pack opening is required")
    .max(100, "Cannot record more than 100 openings at once"),
  local_id: z.string().max(100).optional(),
});

/**
 * POST /api/v1/sync/lottery/shift/close
 * Schema for recording shift closing serials
 */
export const lotteryShiftCloseSchema = z.object({
  session_id: uuidSchema,
  shift_id: uuidSchema,
  cashier_id: uuidSchema.optional(),
  closings: z
    .array(
      z.object({
        pack_id: uuidSchema,
        closing_serial: serialSchema,
        entry_method: z.enum(ENTRY_METHODS).default("SCAN"),
      }),
    )
    .min(1, "At least one pack closing is required")
    .max(100, "Cannot record more than 100 closings at once"),
  /** Manual entry authorization (dual-auth) */
  manual_entry_authorized_by: uuidSchema.optional(),
  local_id: z.string().max(100).optional(),
});

/**
 * POST /api/v1/sync/lottery/day/prepare-close
 * Schema for Phase 1: Validate & stage day close
 */
export const lotteryDayPrepareCloseSchema = z.object({
  session_id: uuidSchema,
  day_id: uuidSchema,
  closings: z
    .array(
      z.object({
        pack_id: uuidSchema,
        ending_serial: serialSchema,
        entry_method: z.enum(ENTRY_METHODS).default("SCAN"),
        bin_id: uuidSchema.optional(),
      }),
    )
    .min(1, "At least one pack closing is required"),
  /** User initiating the pending close */
  initiated_by: uuidSchema,
  /** Manual entry authorization (dual-auth) */
  manual_entry_authorized_by: uuidSchema.optional(),
  /** Expiration timeout in minutes (default: 60) */
  expire_minutes: z.coerce
    .number()
    .int()
    .min(5, "Expiration must be at least 5 minutes")
    .max(120, "Expiration cannot exceed 120 minutes")
    .default(60),
});

/**
 * POST /api/v1/sync/lottery/day/commit-close
 * Schema for Phase 2: Finalize day close
 */
export const lotteryDayCommitCloseSchema = z.object({
  session_id: uuidSchema,
  day_id: uuidSchema,
  closed_by: uuidSchema,
  notes: reasonSchema,
});

/**
 * POST /api/v1/sync/lottery/day/cancel-close
 * Schema for rollback pending close
 */
export const lotteryDayCancelCloseSchema = z.object({
  session_id: uuidSchema,
  day_id: uuidSchema,
  cancelled_by: uuidSchema,
  reason: reasonSchema,
});

/**
 * POST /api/v1/sync/lottery/variances/approve
 * Schema for approving a variance
 */
export const lotteryVarianceApproveSchema = z.object({
  session_id: uuidSchema,
  variance_id: uuidSchema,
  approved_by: uuidSchema,
  approval_notes: reasonSchema,
});

/**
 * Valid shift statuses for sync (matches Prisma ShiftStatus enum)
 * Desktop should only sync shifts in these transitional states
 */
export const SHIFT_STATUSES = [
  "NOT_STARTED",
  "OPEN",
  "ACTIVE",
  "CLOSING",
  "RECONCILING",
  "CLOSED",
  "VARIANCE_REVIEW",
] as const;

/**
 * POST /api/v1/sync/lottery/shifts
 * Schema for syncing a shift record from desktop to server
 *
 * Server handles:
 * 1. Shift doesn't exist: Create it with provided data
 * 2. Shift exists: Update it (idempotent)
 * 3. Foreign key validation: Validates cashier_id and opened_by exist
 *
 * Security Controls:
 * - API-001: VALIDATION - All fields validated with Zod
 * - DB-006: TENANT_ISOLATION - store_id validated against API key
 * - SEC-006: SQL_INJECTION - Parameterized through Prisma ORM
 */
export const lotteryShiftSyncSchema = z.object({
  session_id: uuidSchema,
  /** Desktop's shift UUID - becomes server shift_id */
  shift_id: uuidSchema,
  /** User who opened the shift - FK to users.user_id */
  opened_by: uuidSchema,
  /** Cashier assigned to shift - FK to cashiers.cashier_id */
  cashier_id: uuidSchema,
  /** POS terminal ID (optional) - FK to pos_terminals.pos_terminal_id */
  pos_terminal_id: uuidSchema.optional(),
  /** When shift was opened */
  opened_at: isoDatetimeSchema,
  /** When shift was closed (optional, null if still open) */
  closed_at: isoDatetimeSchema.optional().nullable(),
  /** Opening cash amount (decimal) */
  opening_cash: z
    .string()
    .refine(isValidDecimal, "opening_cash must be a valid decimal")
    .optional()
    .default("0.00"),
  /** Closing cash amount (optional) */
  closing_cash: z
    .string()
    .refine(isValidDecimal, "closing_cash must be a valid decimal")
    .optional()
    .nullable(),
  /** Expected cash amount (optional) */
  expected_cash: z
    .string()
    .refine(isValidDecimal, "expected_cash must be a valid decimal")
    .optional()
    .nullable(),
  /** Cash variance (optional) */
  variance: z
    .string()
    .refine(isValidSignedDecimal, "variance must be a valid decimal")
    .optional()
    .nullable(),
  /** Variance reason (optional) */
  variance_reason: reasonSchema,
  /** Shift status */
  status: z.enum(SHIFT_STATUSES),
  /** Shift number for the day (optional) */
  shift_number: positiveIntSchema.optional().nullable(),
  /** User who approved the shift (optional) */
  approved_by: uuidSchema.optional().nullable(),
  /** When shift was approved (optional) */
  approved_at: isoDatetimeSchema.optional().nullable(),
  /** Business date YYYY-MM-DD (optional, for day association) */
  business_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "business_date must be YYYY-MM-DD format")
    .optional(),
  /** External shift ID from POS system (for reference/mapping) */
  external_shift_id: z.string().max(255).optional(),
  /** Local ID for offline conflict resolution */
  local_id: z.string().max(100).optional(),
});

// =============================================================================
// Type Exports
// =============================================================================

export type LotterySyncGamesQuery = z.infer<typeof lotterySyncGamesQuerySchema>;
export type LotterySyncConfigQuery = z.infer<
  typeof lotterySyncConfigQuerySchema
>;
export type LotterySyncBinsQuery = z.infer<typeof lotterySyncBinsQuerySchema>;
export type LotterySyncPacksQuery = z.infer<typeof lotterySyncPacksQuerySchema>;
export type LotterySyncDayStatusQuery = z.infer<
  typeof lotterySyncDayStatusQuerySchema
>;
export type LotterySyncShiftOpeningsQuery = z.infer<
  typeof lotterySyncShiftOpeningsQuerySchema
>;
export type LotterySyncShiftClosingsQuery = z.infer<
  typeof lotterySyncShiftClosingsQuerySchema
>;
export type LotterySyncVariancesQuery = z.infer<
  typeof lotterySyncVariancesQuerySchema
>;
export type LotterySyncDayPacksQuery = z.infer<
  typeof lotterySyncDayPacksQuerySchema
>;
export type LotterySyncBinHistoryQuery = z.infer<
  typeof lotterySyncBinHistoryQuerySchema
>;

export type LotteryPackReceiveInput = z.infer<typeof lotteryPackReceiveSchema>;
export type LotteryPackReceiveBatchInput = z.infer<
  typeof lotteryPackReceiveBatchSchema
>;
export type LotteryPackActivateInput = z.infer<
  typeof lotteryPackActivateSchema
>;
export type LotteryPackMoveInput = z.infer<typeof lotteryPackMoveSchema>;
export type LotteryPackDepleteInput = z.infer<typeof lotteryPackDepleteSchema>;
export type LotteryPackReturnInput = z.infer<typeof lotteryPackReturnSchema>;
export type LotteryShiftOpenInput = z.infer<typeof lotteryShiftOpenSchema>;
export type LotteryShiftCloseInput = z.infer<typeof lotteryShiftCloseSchema>;
export type LotteryDayPrepareCloseInput = z.infer<
  typeof lotteryDayPrepareCloseSchema
>;
export type LotteryDayCommitCloseInput = z.infer<
  typeof lotteryDayCommitCloseSchema
>;
export type LotteryDayCancelCloseInput = z.infer<
  typeof lotteryDayCancelCloseSchema
>;
export type LotteryVarianceApproveInput = z.infer<
  typeof lotteryVarianceApproveSchema
>;
export type LotteryShiftSyncInput = z.infer<typeof lotteryShiftSyncSchema>;
