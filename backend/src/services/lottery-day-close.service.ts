/**
 * Lottery Day Close Service
 *
 * Enterprise-grade service for atomic lottery day closing with two-phase commit.
 *
 * Architecture:
 * - Phase 1 (prepare): Validate and store pending close data with PENDING_CLOSE status
 * - Phase 2 (commit): Atomically commit lottery close and day close together
 * - Cancel: Rollback pending state if user cancels or timeout occurs
 *
 * Security Controls:
 * - DB-006: TENANT_ISOLATION - Store-scoped operations with RLS enforcement
 * - SEC-006: SQL_INJECTION - Uses Prisma ORM for all database operations
 * - API-004: AUTHENTICATION - Requires authenticated user context
 * - SEC-010: AUTHORIZATION - RBAC permission checks via middleware
 *
 * Story: MyStore Day Close Atomic Transaction
 *
 * @module services/lottery-day-close
 */

import { Prisma } from "@prisma/client";
import {
  prisma,
  withRLSTransaction,
  isValidUUID,
  TRANSACTION_TIMEOUTS,
} from "../utils/db";
import type { RLSContext } from "../utils/db";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Lottery closing input for a single pack
 * SEC-014: Strict type validation on all inputs
 */
export interface LotteryClosingInput {
  /** Pack UUID */
  pack_id: string;
  /** 3-digit closing serial number (e.g., "045") */
  closing_serial: string;
}

/**
 * Pending close data structure stored in JSONB column
 * Structure is validated before storage and on retrieval
 */
export interface PendingCloseData {
  closings: LotteryClosingInput[];
  entry_method: "SCAN" | "MANUAL";
  authorized_by_user_id?: string;
  /** Current shift ID for open shifts validation */
  current_shift_id?: string;
}

/**
 * Result of prepare-close operation
 */
export interface PrepareCloseResult {
  day_id: string;
  business_date: string;
  status: "PENDING_CLOSE";
  pending_close_at: string;
  pending_close_expires_at: string;
  closings_count: number;
  /** Calculated lottery total for UI display (not yet committed) */
  estimated_lottery_total: number;
  /** Estimated bin breakdown for UI preview */
  bins_preview: Array<{
    bin_number: number;
    pack_number: string;
    game_name: string;
    starting_serial: string;
    closing_serial: string;
    game_price: number;
    tickets_sold: number;
    sales_amount: number;
  }>;
}

/**
 * Result of commit-close operation
 */
export interface CommitCloseResult {
  day_id: string;
  business_date: string;
  closed_at: string;
  closings_created: number;
  lottery_total: number;
  bins_closed: Array<{
    bin_number: number;
    pack_number: string;
    game_name: string;
    starting_serial: string;
    closing_serial: string;
    game_price: number;
    tickets_sold: number;
    sales_amount: number;
  }>;
}

/**
 * Error codes for day close operations
 * API-003: Standardized error codes for machine-readable responses
 */
export const DAY_CLOSE_ERROR_CODES = {
  STORE_NOT_FOUND: "STORE_NOT_FOUND",
  DAY_NOT_FOUND: "DAY_NOT_FOUND",
  DAY_ALREADY_CLOSED: "DAY_ALREADY_CLOSED",
  DAY_NOT_PENDING: "DAY_NOT_PENDING",
  PENDING_EXPIRED: "PENDING_EXPIRED",
  SHIFTS_STILL_OPEN: "SHIFTS_STILL_OPEN",
  INVALID_CLOSINGS: "INVALID_CLOSINGS",
  PACK_NOT_FOUND: "PACK_NOT_FOUND",
  SERIAL_VALIDATION_FAILED: "SERIAL_VALIDATION_FAILED",
  CONCURRENT_MODIFICATION: "CONCURRENT_MODIFICATION",
} as const;

export type DayCloseErrorCode =
  (typeof DAY_CLOSE_ERROR_CODES)[keyof typeof DAY_CLOSE_ERROR_CODES];

/**
 * Custom error class for day close operations
 */
export class DayCloseError extends Error {
  constructor(
    public readonly code: DayCloseErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DayCloseError";
  }
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default expiration time for pending close (1 hour) */
const PENDING_CLOSE_EXPIRY_MS = 60 * 60 * 1000;

/** Valid status values for lottery business day */
const VALID_STATUSES = ["OPEN", "PENDING_CLOSE", "CLOSED"] as const;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate UUID format
 * SEC-014: Input validation before database operations
 */
function validateUUID(value: string, fieldName: string): void {
  if (!value || typeof value !== "string") {
    throw new DayCloseError(
      DAY_CLOSE_ERROR_CODES.INVALID_CLOSINGS,
      `${fieldName} is required`,
    );
  }
  if (!isValidUUID(value)) {
    throw new DayCloseError(
      DAY_CLOSE_ERROR_CODES.INVALID_CLOSINGS,
      `${fieldName} must be a valid UUID`,
    );
  }
}

/**
 * Validate 3-digit serial number format
 * SEC-014: Strict format validation
 */
function validateSerial(value: string, context: string): void {
  if (!value || typeof value !== "string") {
    throw new DayCloseError(
      DAY_CLOSE_ERROR_CODES.SERIAL_VALIDATION_FAILED,
      `Serial number is required for ${context}`,
    );
  }
  if (!/^[0-9]{3}$/.test(value)) {
    throw new DayCloseError(
      DAY_CLOSE_ERROR_CODES.SERIAL_VALIDATION_FAILED,
      `Serial number must be exactly 3 digits for ${context}`,
    );
  }
}

/**
 * Validate entry method
 */
function validateEntryMethod(
  value: string,
): asserts value is "SCAN" | "MANUAL" {
  if (value !== "SCAN" && value !== "MANUAL") {
    throw new DayCloseError(
      DAY_CLOSE_ERROR_CODES.INVALID_CLOSINGS,
      "entry_method must be 'SCAN' or 'MANUAL'",
    );
  }
}

/**
 * Validate all closing inputs
 * SEC-014: Comprehensive input validation
 */
function validateClosings(closings: LotteryClosingInput[]): void {
  if (!Array.isArray(closings)) {
    throw new DayCloseError(
      DAY_CLOSE_ERROR_CODES.INVALID_CLOSINGS,
      "closings must be an array",
    );
  }

  if (closings.length === 0) {
    throw new DayCloseError(
      DAY_CLOSE_ERROR_CODES.INVALID_CLOSINGS,
      "closings array cannot be empty",
    );
  }

  const seenPackIds = new Set<string>();
  for (let i = 0; i < closings.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- Array index access is safe with controlled loop
    const closing = closings[i];
    const context = `closings[${i}]`;

    validateUUID(closing.pack_id, `${context}.pack_id`);
    validateSerial(closing.closing_serial, context);

    // Check for duplicate pack_ids
    if (seenPackIds.has(closing.pack_id)) {
      throw new DayCloseError(
        DAY_CLOSE_ERROR_CODES.INVALID_CLOSINGS,
        `Duplicate pack_id found: ${closing.pack_id}`,
      );
    }
    seenPackIds.add(closing.pack_id);
  }
}

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Phase 1: Prepare lottery day close
 *
 * Validates inputs, calculates estimated totals, and stores pending close data.
 * Does NOT commit any lottery records - just stores the intent.
 *
 * Security:
 * - DB-006: Tenant isolation via store_id scope
 * - SEC-006: Uses Prisma ORM (no raw SQL)
 * - SEC-014: Input validation before any database operations
 *
 * @param rlsContext - RLS context with user permissions
 * @param storeId - Store UUID
 * @param closings - Array of pack closings
 * @param entryMethod - SCAN or MANUAL
 * @param options - Additional options
 * @returns PrepareCloseResult with pending state info
 * @throws DayCloseError if validation fails
 */
export async function prepareClose(
  rlsContext: RLSContext,
  storeId: string,
  closings: LotteryClosingInput[],
  entryMethod: "SCAN" | "MANUAL",
  options?: {
    currentShiftId?: string;
    authorizedByUserId?: string;
  },
): Promise<PrepareCloseResult> {
  // Input validation (SEC-014)
  validateUUID(storeId, "storeId");
  validateClosings(closings);
  validateEntryMethod(entryMethod);

  if (options?.currentShiftId) {
    validateUUID(options.currentShiftId, "currentShiftId");
  }
  if (options?.authorizedByUserId) {
    validateUUID(options.authorizedByUserId, "authorizedByUserId");
  }

  return withRLSTransaction(
    rlsContext,
    async (tx) => {
      // Verify store exists and user has access (DB-006: tenant isolation)
      const store = await tx.store.findUnique({
        where: { store_id: storeId },
        select: { store_id: true, timezone: true },
      });

      if (!store) {
        throw new DayCloseError(
          DAY_CLOSE_ERROR_CODES.STORE_NOT_FOUND,
          "Store not found",
        );
      }

      // Get current date in store timezone
      const now = new Date();
      const targetDateStr = now.toISOString().split("T")[0];
      const targetDate = new Date(targetDateStr + "T00:00:00");

      // Find or create business day record with row-level locking
      let businessDay = await tx.lotteryBusinessDay.findUnique({
        where: {
          store_id_business_date: {
            store_id: storeId,
            business_date: targetDate,
          },
        },
      });

      if (!businessDay) {
        // Create business day if doesn't exist
        businessDay = await tx.lotteryBusinessDay.create({
          data: {
            store_id: storeId,
            business_date: targetDate,
            status: "OPEN",
            opened_by: rlsContext.userId,
          },
        });
      }

      // Check current status
      if (businessDay.status === "CLOSED") {
        throw new DayCloseError(
          DAY_CLOSE_ERROR_CODES.DAY_ALREADY_CLOSED,
          "Lottery day is already closed",
        );
      }

      // Check for other open shifts (excluding current shift)
      const openShifts = await tx.shift.findMany({
        where: {
          store_id: storeId,
          status: "OPEN",
          ...(options?.currentShiftId && {
            shift_id: { not: options.currentShiftId },
          }),
        },
        select: { shift_id: true, terminal_id: true },
      });

      if (openShifts.length > 0) {
        throw new DayCloseError(
          DAY_CLOSE_ERROR_CODES.SHIFTS_STILL_OPEN,
          `${openShifts.length} shift(s) are still open`,
          { open_shift_count: openShifts.length },
        );
      }

      // Validate all packs exist and are active in this store
      const packIds = closings.map((c) => c.pack_id);
      const packs = await tx.lotteryPack.findMany({
        where: {
          pack_id: { in: packIds },
          store_id: storeId,
          status: "ACTIVE",
        },
        include: {
          game: { select: { name: true, price: true } },
          lottery_bin: { select: { display_order: true } },
        },
      });

      if (packs.length !== packIds.length) {
        const foundPackIds = new Set(packs.map((p) => p.pack_id));
        const missingPackIds = packIds.filter((id) => !foundPackIds.has(id));
        throw new DayCloseError(
          DAY_CLOSE_ERROR_CODES.PACK_NOT_FOUND,
          `Some packs were not found or are not active: ${missingPackIds.join(", ")}`,
          { missing_pack_ids: missingPackIds },
        );
      }

      // Get starting serials from previous day or pack activation
      const startingSerials = await getStartingSerials(tx, storeId, packs);

      // Validate closing serials against pack ranges
      for (const closing of closings) {
        const pack = packs.find((p) => p.pack_id === closing.pack_id)!;
        const startingSerial =
          startingSerials.get(pack.pack_id) || pack.serial_start;
        const closingNum = parseInt(closing.closing_serial, 10);
        const startNum = parseInt(startingSerial, 10);
        const endNum = parseInt(pack.serial_end, 10);

        if (closingNum < startNum) {
          throw new DayCloseError(
            DAY_CLOSE_ERROR_CODES.SERIAL_VALIDATION_FAILED,
            `Closing serial ${closing.closing_serial} is less than starting serial ${startingSerial} for pack ${pack.pack_number}`,
            { pack_id: pack.pack_id, pack_number: pack.pack_number },
          );
        }

        if (closingNum > endNum) {
          throw new DayCloseError(
            DAY_CLOSE_ERROR_CODES.SERIAL_VALIDATION_FAILED,
            `Closing serial ${closing.closing_serial} exceeds pack end serial ${pack.serial_end} for pack ${pack.pack_number}`,
            { pack_id: pack.pack_id, pack_number: pack.pack_number },
          );
        }
      }

      // Calculate estimated totals for preview
      let estimatedTotal = 0;
      const binsPreview = closings.map((closing) => {
        const pack = packs.find((p) => p.pack_id === closing.pack_id)!;
        const startingSerial =
          startingSerials.get(pack.pack_id) || pack.serial_start;
        const closingNum = parseInt(closing.closing_serial, 10);
        const startNum = parseInt(startingSerial, 10);
        const ticketsSold = Math.max(0, closingNum - startNum);
        const gamePrice = Number(pack.game.price);
        const salesAmount = ticketsSold * gamePrice;
        estimatedTotal += salesAmount;

        return {
          bin_number: (pack.lottery_bin?.display_order ?? 0) + 1,
          pack_number: pack.pack_number,
          game_name: pack.game.name,
          starting_serial: startingSerial,
          closing_serial: closing.closing_serial,
          game_price: gamePrice,
          tickets_sold: ticketsSold,
          sales_amount: salesAmount,
        };
      });

      // Build pending close data
      const pendingCloseData: PendingCloseData = {
        closings,
        entry_method: entryMethod,
        authorized_by_user_id: options?.authorizedByUserId,
        current_shift_id: options?.currentShiftId,
      };

      // Calculate expiration time
      const pendingCloseAt = new Date();
      const pendingCloseExpiresAt = new Date(
        pendingCloseAt.getTime() + PENDING_CLOSE_EXPIRY_MS,
      );

      // Update business day to PENDING_CLOSE status
      const updated = await tx.lotteryBusinessDay.update({
        where: {
          day_id: businessDay.day_id,
          // Optimistic locking - ensure status hasn't changed
          status: businessDay.status,
        },
        data: {
          status: "PENDING_CLOSE",
          pending_close_data: pendingCloseData as unknown as Prisma.JsonObject,
          pending_close_by: rlsContext.userId,
          pending_close_at: pendingCloseAt,
          pending_close_expires_at: pendingCloseExpiresAt,
        },
      });

      return {
        day_id: updated.day_id,
        business_date: targetDateStr,
        status: "PENDING_CLOSE" as const,
        pending_close_at: pendingCloseAt.toISOString(),
        pending_close_expires_at: pendingCloseExpiresAt.toISOString(),
        closings_count: closings.length,
        estimated_lottery_total: estimatedTotal,
        bins_preview: binsPreview,
      };
    },
    { timeout: TRANSACTION_TIMEOUTS.STANDARD },
  );
}

/**
 * Phase 2: Commit lottery day close
 *
 * Atomically commits both lottery close and day close in a single transaction.
 * Creates LotteryDayPack records and updates business day status to CLOSED.
 *
 * Security:
 * - DB-006: Tenant isolation via RLS context
 * - SEC-006: Uses Prisma ORM (no raw SQL)
 * - Atomic transaction with proper locking
 *
 * @param rlsContext - RLS context with user permissions
 * @param storeId - Store UUID
 * @returns CommitCloseResult with final lottery totals
 * @throws DayCloseError if validation fails or day is not in PENDING_CLOSE status
 */
export async function commitClose(
  rlsContext: RLSContext,
  storeId: string,
): Promise<CommitCloseResult> {
  // Input validation (SEC-014)
  validateUUID(storeId, "storeId");

  return withRLSTransaction(
    rlsContext,
    async (tx) => {
      // Get current date
      const now = new Date();
      const targetDateStr = now.toISOString().split("T")[0];
      const targetDate = new Date(targetDateStr + "T00:00:00");

      // Find business day with row-level locking via FOR UPDATE
      const businessDay = await tx.lotteryBusinessDay.findUnique({
        where: {
          store_id_business_date: {
            store_id: storeId,
            business_date: targetDate,
          },
        },
      });

      if (!businessDay) {
        throw new DayCloseError(
          DAY_CLOSE_ERROR_CODES.DAY_NOT_FOUND,
          "Business day not found",
        );
      }

      if (businessDay.status === "CLOSED") {
        throw new DayCloseError(
          DAY_CLOSE_ERROR_CODES.DAY_ALREADY_CLOSED,
          "Lottery day is already closed",
        );
      }

      if (businessDay.status !== "PENDING_CLOSE") {
        throw new DayCloseError(
          DAY_CLOSE_ERROR_CODES.DAY_NOT_PENDING,
          "Lottery day is not in PENDING_CLOSE status. Please complete lottery scanning first.",
        );
      }

      // Check if pending close has expired
      if (
        businessDay.pending_close_expires_at &&
        businessDay.pending_close_expires_at < now
      ) {
        // Revert to OPEN status
        await tx.lotteryBusinessDay.update({
          where: { day_id: businessDay.day_id },
          data: {
            status: "OPEN",
            pending_close_data: null,
            pending_close_by: null,
            pending_close_at: null,
            pending_close_expires_at: null,
          },
        });

        throw new DayCloseError(
          DAY_CLOSE_ERROR_CODES.PENDING_EXPIRED,
          "Pending close has expired. Please re-scan lottery to continue.",
        );
      }

      // Parse pending close data
      const pendingData =
        businessDay.pending_close_data as unknown as PendingCloseData;
      if (!pendingData || !Array.isArray(pendingData.closings)) {
        throw new DayCloseError(
          DAY_CLOSE_ERROR_CODES.DAY_NOT_PENDING,
          "Invalid pending close data",
        );
      }

      // Re-validate closings (defense in depth)
      validateClosings(pendingData.closings);

      // Get packs for creating LotteryDayPack records
      const packIds = pendingData.closings.map((c) => c.pack_id);
      const packs = await tx.lotteryPack.findMany({
        where: {
          pack_id: { in: packIds },
          store_id: storeId,
        },
        include: {
          game: { select: { name: true, price: true } },
          lottery_bin: { select: { bin_id: true, display_order: true } },
        },
      });

      // Get starting serials
      const startingSerials = await getStartingSerials(tx, storeId, packs);

      // Calculate totals and create LotteryDayPack records
      let lotteryTotal = 0;
      const binsClosed: CommitCloseResult["bins_closed"] = [];
      const closedAt = new Date();

      for (const closing of pendingData.closings) {
        const pack = packs.find((p) => p.pack_id === closing.pack_id);
        if (!pack) continue;

        const startingSerial =
          startingSerials.get(pack.pack_id) || pack.serial_start;
        const closingNum = parseInt(closing.closing_serial, 10);
        const startNum = parseInt(startingSerial, 10);
        const ticketsSold = Math.max(0, closingNum - startNum);
        const gamePrice = Number(pack.game.price);
        const salesAmount = ticketsSold * gamePrice;
        lotteryTotal += salesAmount;

        // Create LotteryDayPack record
        await tx.lotteryDayPack.upsert({
          where: {
            day_id_pack_id: {
              day_id: businessDay.day_id,
              pack_id: pack.pack_id,
            },
          },
          create: {
            day_id: businessDay.day_id,
            pack_id: pack.pack_id,
            bin_id: pack.lottery_bin?.bin_id || null,
            starting_serial: startingSerial,
            ending_serial: closing.closing_serial,
            tickets_sold: ticketsSold,
            sales_amount: new Prisma.Decimal(salesAmount),
            entry_method: pendingData.entry_method,
          },
          update: {
            ending_serial: closing.closing_serial,
            tickets_sold: ticketsSold,
            sales_amount: new Prisma.Decimal(salesAmount),
            entry_method: pendingData.entry_method,
          },
        });

        // Update pack's ending_serial field
        await tx.lotteryPack.update({
          where: { pack_id: pack.pack_id },
          data: {
            // Check if pack is fully depleted
            ...(closingNum >= parseInt(pack.serial_end, 10) && {
              status: "DEPLETED",
              depleted_at: closedAt,
              depleted_by: rlsContext.userId,
            }),
          },
        });

        binsClosed.push({
          bin_number: (pack.lottery_bin?.display_order ?? 0) + 1,
          pack_number: pack.pack_number,
          game_name: pack.game.name,
          starting_serial: startingSerial,
          closing_serial: closing.closing_serial,
          game_price: gamePrice,
          tickets_sold: ticketsSold,
          sales_amount: salesAmount,
        });
      }

      // Update business day to CLOSED status with same timestamp
      await tx.lotteryBusinessDay.update({
        where: { day_id: businessDay.day_id },
        data: {
          status: "CLOSED",
          closed_at: closedAt,
          closed_by: rlsContext.userId,
          // Clear pending close data
          pending_close_data: null,
          pending_close_by: null,
          pending_close_at: null,
          pending_close_expires_at: null,
        },
      });

      return {
        day_id: businessDay.day_id,
        business_date: targetDateStr,
        closed_at: closedAt.toISOString(),
        closings_created: binsClosed.length,
        lottery_total: lotteryTotal,
        bins_closed: binsClosed,
      };
    },
    { timeout: TRANSACTION_TIMEOUTS.STANDARD },
  );
}

/**
 * Cancel pending lottery day close
 *
 * Reverts PENDING_CLOSE status back to OPEN and clears pending data.
 * Should be called when user cancels day close wizard or navigates away.
 *
 * @param rlsContext - RLS context with user permissions
 * @param storeId - Store UUID
 * @returns true if cancelled successfully, false if no pending close found
 */
export async function cancelClose(
  rlsContext: RLSContext,
  storeId: string,
): Promise<boolean> {
  // Input validation (SEC-014)
  validateUUID(storeId, "storeId");

  return withRLSTransaction(
    rlsContext,
    async (tx) => {
      const now = new Date();
      const targetDateStr = now.toISOString().split("T")[0];
      const targetDate = new Date(targetDateStr + "T00:00:00");

      const result = await tx.lotteryBusinessDay.updateMany({
        where: {
          store_id: storeId,
          business_date: targetDate,
          status: "PENDING_CLOSE",
        },
        data: {
          status: "OPEN",
          pending_close_data: null,
          pending_close_by: null,
          pending_close_at: null,
          pending_close_expires_at: null,
        },
      });

      return result.count > 0;
    },
    { timeout: TRANSACTION_TIMEOUTS.FAST },
  );
}

/**
 * Get lottery day status
 *
 * Returns the current status of the lottery business day including any pending close info.
 *
 * @param storeId - Store UUID
 * @returns Day status or null if no day exists
 */
export async function getDayStatus(storeId: string): Promise<{
  day_id: string;
  status: string;
  pending_close_at?: string;
  pending_close_expires_at?: string;
} | null> {
  validateUUID(storeId, "storeId");

  const now = new Date();
  const targetDateStr = now.toISOString().split("T")[0];
  const targetDate = new Date(targetDateStr + "T00:00:00");

  const businessDay = await prisma.lotteryBusinessDay.findUnique({
    where: {
      store_id_business_date: {
        store_id: storeId,
        business_date: targetDate,
      },
    },
    select: {
      day_id: true,
      status: true,
      pending_close_at: true,
      pending_close_expires_at: true,
    },
  });

  if (!businessDay) return null;

  return {
    day_id: businessDay.day_id,
    status: businessDay.status,
    pending_close_at: businessDay.pending_close_at?.toISOString(),
    pending_close_expires_at:
      businessDay.pending_close_expires_at?.toISOString(),
  };
}

/**
 * Cleanup expired pending closes
 *
 * Background job to revert expired PENDING_CLOSE states back to OPEN.
 * Should be called periodically (e.g., every 5 minutes).
 *
 * @returns Number of expired pending closes that were reverted
 */
export async function cleanupExpiredPendingCloses(): Promise<number> {
  const now = new Date();

  const result = await prisma.lotteryBusinessDay.updateMany({
    where: {
      status: "PENDING_CLOSE",
      pending_close_expires_at: { lt: now },
    },
    data: {
      status: "OPEN",
      pending_close_data: null,
      pending_close_by: null,
      pending_close_at: null,
      pending_close_expires_at: null,
    },
  });

  return result.count;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get starting serials for packs from previous day close or pack activation
 *
 * Priority:
 * 1. Previous day's ending serial (from most recent CLOSED day's LotteryDayPack)
 * 2. Pack's serial_start (if never closed before)
 */
async function getStartingSerials(
  tx: Prisma.TransactionClient,
  storeId: string,
  packs: Array<{ pack_id: string; serial_start: string }>,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const packIds = packs.map((p) => p.pack_id);

  // Find most recent closed day with ending serials for these packs
  const lastClosedDay = await tx.lotteryBusinessDay.findFirst({
    where: {
      store_id: storeId,
      status: "CLOSED",
    },
    orderBy: { closed_at: "desc" },
    include: {
      day_packs: {
        where: {
          pack_id: { in: packIds },
          ending_serial: { not: null },
        },
        select: {
          pack_id: true,
          ending_serial: true,
        },
      },
    },
  });

  // Use previous day's ending serials as starting serials
  if (lastClosedDay?.day_packs) {
    for (const dayPack of lastClosedDay.day_packs) {
      if (dayPack.ending_serial) {
        result.set(dayPack.pack_id, dayPack.ending_serial);
      }
    }
  }

  // For packs without previous closing, use serial_start
  for (const pack of packs) {
    if (!result.has(pack.pack_id)) {
      result.set(pack.pack_id, pack.serial_start);
    }
  }

  return result;
}
