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
import {
  getCurrentStoreDate,
  DEFAULT_STORE_TIMEZONE,
} from "../utils/timezone.utils";
import { daySummaryService } from "./day-summary.service";

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
  /**
   * Whether this pack was marked as sold out (depleted)
   * When true: Use depletion formula (serial_end + 1) - starting
   * When false/undefined: Use normal formula ending - starting
   *
   * This flag is critical for correct sales calculation:
   * - Normal scan: closing_serial is the NEXT position after last sold ticket
   * - Sold out: closing_serial equals serial_end (last ticket INDEX)
   */
  is_sold_out?: boolean;
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
 * Information about a pack that was depleted during day close
 * SEC-017: AUDIT_TRAILS - Captures depletion context for audit
 */
export interface DepletedPackInfo {
  /** Pack UUID */
  pack_id: string;
  /** Store UUID (for UPC cleanup) */
  store_id: string;
  /** Pack number for logging */
  pack_number: string;
  /** Game name for logging */
  game_name: string;
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
  /**
   * Packs that were marked as sold out and depleted during this day close.
   * SEC-017: AUDIT_TRAILS - Enables caller to perform post-commit actions
   * (e.g., UPC cleanup from Redis/POS) without blocking the atomic transaction.
   */
  packs_depleted: DepletedPackInfo[];
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

/**
 * Result of creating the next business day after day close
 * SEC-017: AUDIT_TRAILS - Track new day creation for audit
 */
export interface NextDayCreationResult {
  /** New lottery business day ID */
  lottery_day_id: string;
  /** New day summary ID */
  day_summary_id: string;
  /** Business date of the new day (YYYY-MM-DD) */
  business_date: string;
}

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

      // Get current date in store timezone (DB-006: timezone-aware date calculation)
      // CRITICAL: Must use store timezone, not UTC, to determine business day
      const storeTimezone = store.timezone || DEFAULT_STORE_TIMEZONE;
      const targetDateStr = getCurrentStoreDate(storeTimezone);
      const targetDate = new Date(targetDateStr + "T00:00:00");

      // Find or create business day record with row-level locking
      // PHASE 3: Status-based lookup - find OPEN or PENDING_CLOSE lottery day
      // DB-006: TENANT_ISOLATION - Scoped by store_id
      let businessDay = await tx.lotteryBusinessDay.findFirst({
        where: {
          store_id: storeId,
          status: { in: ["OPEN", "PENDING_CLOSE"] },
        },
        orderBy: {
          opened_at: "desc", // Most recent first
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

      // ============================================================
      // PHASE 4: QUERY PARALLELIZATION
      // ============================================================
      // DB-001: ORM_USAGE - Using Prisma ORM for all queries
      // SEC-006: SQL_INJECTION - Parameterized queries via Prisma
      // Performance: Run independent queries in parallel using Promise.all
      // - Open shifts check: Independent, only depends on storeId
      // - Pack validation: Independent, only depends on packIds and storeId
      // These queries have NO data dependencies on each other
      // ============================================================
      const packIds = closings.map((c) => c.pack_id);

      const [openShifts, packs] = await Promise.all([
        // Query 1: Check for other open shifts (excluding current shift)
        tx.shift.findMany({
          where: {
            store_id: storeId,
            status: "OPEN",
            ...(options?.currentShiftId && {
              shift_id: { not: options.currentShiftId },
            }),
          },
          select: { shift_id: true, pos_terminal_id: true },
        }),
        // Query 2: Validate all packs exist and are active in this store
        tx.lotteryPack.findMany({
          where: {
            pack_id: { in: packIds },
            store_id: storeId,
            status: "ACTIVE",
          },
          include: {
            game: { select: { name: true, price: true } },
            bin: { select: { display_order: true } },
          },
        }),
      ]);

      // API-003: ERROR_HANDLING - Validate results after parallel queries
      if (openShifts.length > 0) {
        throw new DayCloseError(
          DAY_CLOSE_ERROR_CODES.SHIFTS_STILL_OPEN,
          `${openShifts.length} shift(s) are still open`,
          { open_shift_count: openShifts.length },
        );
      }

      if (packs.length !== packIds.length) {
        const foundPackIds = new Set(packs.map((p) => p.pack_id));
        const missingPackIds = packIds.filter((id) => !foundPackIds.has(id));
        throw new DayCloseError(
          DAY_CLOSE_ERROR_CODES.PACK_NOT_FOUND,
          `Some packs were not found or are not active: ${missingPackIds.join(", ")}`,
          { missing_pack_ids: missingPackIds },
        );
      }

      // Get starting serials from previous day close or pack activation
      const startingSerials = await getStartingSerials(tx, storeId, packs);

      // Validate closing serials against pack ranges
      for (const closing of closings) {
        const pack = packs.find((p) => p.pack_id === closing.pack_id)!;
        const startingInfo = startingSerials.get(pack.pack_id) || {
          serial: pack.serial_start,
        };
        const closingNum = parseInt(closing.closing_serial, 10);
        const startNum = parseInt(startingInfo.serial, 10);
        const endNum = parseInt(pack.serial_end, 10);

        if (closingNum < startNum) {
          throw new DayCloseError(
            DAY_CLOSE_ERROR_CODES.SERIAL_VALIDATION_FAILED,
            `Closing serial ${closing.closing_serial} is less than starting serial ${startingInfo.serial} for pack ${pack.pack_number}`,
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
      // SEC-014: Use correct formula based on is_sold_out flag
      // - Normal scan: tickets_sold = ending - starting
      // - Sold out: tickets_sold = (serial_end + 1) - starting
      let estimatedTotal = 0;
      const binsPreview = closings.map((closing) => {
        const pack = packs.find((p) => p.pack_id === closing.pack_id)!;
        const startingInfo = startingSerials.get(pack.pack_id) || {
          serial: pack.serial_start,
        };
        // SEC-014: Check is_sold_out flag to determine correct formula
        // Sold-out packs use depletion formula with +1 adjustment
        const ticketsSold =
          closing.is_sold_out === true
            ? calculateTicketsSoldForDepletion(
                closing.closing_serial,
                startingInfo.serial,
              )
            : calculateTicketsSold(closing.closing_serial, startingInfo.serial);
        const gamePrice = Number(pack.game.price);
        const salesAmount = ticketsSold * gamePrice;
        estimatedTotal += salesAmount;

        return {
          bin_number: (pack.bin?.display_order ?? 0) + 1,
          pack_number: pack.pack_number,
          game_name: pack.game.name,
          starting_serial: startingInfo.serial,
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

  // Track current_shift_id from pending data for DaySummary close
  let currentShiftId: string | undefined;

  const result = await withRLSTransaction(
    rlsContext,
    async (tx) => {
      // ============================================================
      // PHASE 4: QUERY PARALLELIZATION
      // ============================================================
      // DB-001: ORM_USAGE - Using Prisma ORM for all queries
      // SEC-006: SQL_INJECTION - Parameterized queries via Prisma
      // DB-006: TENANT_ISOLATION - Both queries scoped by store_id
      // Performance: Run independent queries in parallel using Promise.all
      // - Store lookup: Depends only on storeId
      // - BusinessDay lookup: Depends only on storeId
      // These queries have NO data dependencies on each other
      // ============================================================
      const [store, businessDay] = await Promise.all([
        // Query 1: Get store to retrieve timezone
        tx.store.findUnique({
          where: { store_id: storeId },
          select: { store_id: true, timezone: true },
        }),
        // Query 2: Find business day with PENDING_CLOSE status
        // PHASE 3: Status-based lookup - find PENDING_CLOSE lottery day for commit
        // NOTE: Calendar date lookup removed - status is now authoritative
        tx.lotteryBusinessDay.findFirst({
          where: {
            store_id: storeId,
            status: "PENDING_CLOSE", // commitClose only works on PENDING_CLOSE days
          },
          orderBy: {
            pending_close_at: "desc", // Most recent pending close first
          },
        }),
      ]);

      // API-003: ERROR_HANDLING - Validate results after parallel queries
      if (!store) {
        throw new DayCloseError(
          DAY_CLOSE_ERROR_CODES.STORE_NOT_FOUND,
          "Store not found",
        );
      }

      if (!businessDay) {
        throw new DayCloseError(
          DAY_CLOSE_ERROR_CODES.DAY_NOT_FOUND,
          "No pending lottery day found. Please complete lottery scanning first.",
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
      const now = new Date();
      if (
        businessDay.pending_close_expires_at &&
        businessDay.pending_close_expires_at < now
      ) {
        // Revert to OPEN status
        await tx.lotteryBusinessDay.update({
          where: { day_id: businessDay.day_id },
          data: {
            status: "OPEN",
            pending_close_data: Prisma.JsonNull,
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

      // Capture current_shift_id for DaySummary close (outside transaction)
      // SEC-014: Validate UUID if present
      if (pendingData.current_shift_id) {
        validateUUID(pendingData.current_shift_id, "pending current_shift_id");
        currentShiftId = pendingData.current_shift_id;
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
          bin: { select: { bin_id: true, display_order: true } },
        },
      });

      // Get starting serials
      const startingSerials = await getStartingSerials(tx, storeId, packs);

      // Calculate totals and create LotteryDayPack records
      let lotteryTotal = 0;
      const binsClosed: CommitCloseResult["bins_closed"] = [];
      const packsDepleted: DepletedPackInfo[] = [];
      const closedAt = new Date();

      for (const closing of pendingData.closings) {
        const pack = packs.find((p) => p.pack_id === closing.pack_id);
        if (!pack) continue;

        // Get starting serial for this pack
        const startingInfo = startingSerials.get(pack.pack_id) || {
          serial: pack.serial_start,
        };
        // SEC-014: Check is_sold_out flag to determine correct formula
        // Sold-out packs use depletion formula with +1 adjustment
        const ticketsSold =
          closing.is_sold_out === true
            ? calculateTicketsSoldForDepletion(
                closing.closing_serial,
                startingInfo.serial,
              )
            : calculateTicketsSold(closing.closing_serial, startingInfo.serial);
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
            bin_id: pack.bin?.bin_id || null,
            starting_serial: startingInfo.serial,
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

        // =====================================================================
        // PACK DEPLETION ON EXPLICIT SOLD OUT
        // =====================================================================
        // SEC-017: AUDIT_TRAILS - Pack depletion is triggered ONLY when user
        // explicitly marks a pack as sold out via the "Bins that Need Attention"
        // modal (is_sold_out === true). This is an explicit user action.
        //
        // DB-001: ORM_USAGE - Uses Prisma ORM with atomic update within transaction
        // DB-006: TENANT_ISOLATION - Pack already validated against storeId above
        //
        // We do NOT auto-deplete when closing_serial === serial_end because:
        // - Scanner might capture serial_end as "next position" (normal scan)
        // - Only explicit user action via checkbox should trigger depletion
        // =====================================================================
        if (closing.is_sold_out === true) {
          // Validate pack is still ACTIVE before depletion (TOCTOU prevention)
          // SEC-006: SQL_INJECTION - Using Prisma ORM with parameterized values
          const depletionResult = await tx.lotteryPack.updateMany({
            where: {
              pack_id: pack.pack_id,
              status: "ACTIVE", // Only deplete if currently ACTIVE
            },
            data: {
              status: "DEPLETED",
              depleted_at: closedAt,
              depleted_by: rlsContext.userId,
              depleted_shift_id: pendingData.current_shift_id || null,
              depletion_reason: "MANUAL_SOLD_OUT",
            },
          });

          // Track successfully depleted packs for post-commit UPC cleanup
          // SEC-017: AUDIT_TRAILS - Log depletion for audit and UPC sync
          if (depletionResult.count > 0) {
            packsDepleted.push({
              pack_id: pack.pack_id,
              store_id: storeId,
              pack_number: pack.pack_number,
              game_name: pack.game.name,
            });
          }
        }

        binsClosed.push({
          bin_number: (pack.bin?.display_order ?? 0) + 1,
          pack_number: pack.pack_number,
          game_name: pack.game.name,
          starting_serial: startingInfo.serial,
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
          pending_close_data: Prisma.JsonNull,
          pending_close_by: null,
          pending_close_at: null,
          pending_close_expires_at: null,
        },
      });

      // Format business_date from the database record (Date -> YYYY-MM-DD string)
      const businessDateStr = businessDay.business_date
        .toISOString()
        .split("T")[0];

      return {
        day_id: businessDay.day_id,
        business_date: businessDateStr,
        closed_at: closedAt.toISOString(),
        closings_created: binsClosed.length,
        lottery_total: lotteryTotal,
        bins_closed: binsClosed,
        packs_depleted: packsDepleted,
      };
    },
    // Phase 2.2: Use BULK timeout (120s) for day close with 50+ packs
    // DB-001: ORM_USAGE - Extended timeout prevents transaction abort on large datasets
    // API-003: ERROR_HANDLING - Prevents timeout errors during high-volume day closes
    { timeout: TRANSACTION_TIMEOUTS.BULK },
  );

  // =========================================================================
  // CLOSE DAY SUMMARY
  // =========================================================================
  // DB-006: TENANT_ISOLATION - Day summary is scoped to same store_id
  // API-003: ERROR_HANDLING - Non-blocking with structured error logging
  // LM-001: LOGGING - Structured logging for observability
  //
  // After lottery day close commits, close the DaySummary for this business day.
  // This is done outside the RLS transaction to avoid complexity.
  // The DaySummary service will:
  // 1. Verify all shifts are closed (current shift excluded if provided)
  // 2. Verify lottery is closed (already done above)
  // 3. Aggregate all shift summaries into day totals
  // 4. Set status to CLOSED
  // =========================================================================
  let closedDaySummaryId: string | undefined;
  try {
    const businessDate = new Date(result.business_date + "T00:00:00");
    const closedDaySummary = await daySummaryService.closeDaySummary(
      storeId,
      businessDate,
      rlsContext.userId,
      undefined, // notes - optional
      currentShiftId, // exclude current shift from open shifts check
    );
    closedDaySummaryId = closedDaySummary.day_summary_id;
  } catch (daySummaryError) {
    // Non-blocking: Log error but don't fail the lottery close
    // The lottery is already closed, DaySummary can be closed later
    // SEC-017: AUDIT_TRAILS - Log for investigation, no sensitive data exposed
    console.error("[LotteryDayCloseService] Failed to close day summary:", {
      store_id: storeId,
      business_date: result.business_date,
      lottery_day_id: result.day_id,
      error:
        daySummaryError instanceof Error
          ? daySummaryError.message
          : "Unknown error",
    });
  }

  // =========================================================================
  // CREATE NEXT BUSINESS DAY (PHASE 2: Day Close Creates Next Day)
  // =========================================================================
  // CRITICAL BUSINESS LOGIC:
  // After closing the current day, immediately create the NEXT day so that:
  // 1. When a new shift opens (e.g., at 6:17 PM), it finds an OPEN day to attach to
  // 2. The lottery wizard finds an OPEN lottery_business_day (not "already closed")
  // 3. The DaySummary and LotteryBusinessDay are properly linked via FK
  //
  // BOUNDARY RULE (gt - greater than):
  // - Everything at or before closed_at → belongs to CLOSED day
  // - Everything after closed_at → belongs to NEW day
  //
  // DB-006: TENANT_ISOLATION - New records scoped to same store_id
  // SEC-017: AUDIT_TRAILS - Track who created the new day (same user who closed)
  // =========================================================================
  try {
    const closedAt = new Date(result.closed_at);
    await createNextBusinessDay(
      storeId,
      closedAt,
      rlsContext.userId,
      closedDaySummaryId,
    );
  } catch (nextDayError) {
    // Non-blocking: Log error but don't fail the day close
    // The current day is closed; next day creation is for future convenience
    // A new day can be created on-demand when a shift opens (fallback in shift.service)
    // SEC-017: AUDIT_TRAILS - Log for investigation
    console.error(
      "[LotteryDayCloseService] Failed to create next business day:",
      {
        store_id: storeId,
        business_date: result.business_date,
        lottery_day_id: result.day_id,
        error:
          nextDayError instanceof Error
            ? nextDayError.message
            : "Unknown error",
      },
    );
  }

  return result;
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
      // PHASE 3: Status-based update - cancel any PENDING_CLOSE lottery day
      // DB-006: TENANT_ISOLATION - Scoped by store_id
      const result = await tx.lotteryBusinessDay.updateMany({
        where: {
          store_id: storeId,
          status: "PENDING_CLOSE", // Only cancel PENDING_CLOSE days
        },
        data: {
          status: "OPEN",
          pending_close_data: Prisma.JsonNull,
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

  // PHASE 3: Status-based lookup - find OPEN or PENDING_CLOSE lottery day
  // DB-006: TENANT_ISOLATION - Scoped by store_id
  const businessDay = await prisma.lotteryBusinessDay.findFirst({
    where: {
      store_id: storeId,
      status: { in: ["OPEN", "PENDING_CLOSE"] },
    },
    select: {
      day_id: true,
      status: true,
      pending_close_at: true,
      pending_close_expires_at: true,
    },
    orderBy: {
      opened_at: "desc", // Most recent first
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
      pending_close_data: Prisma.JsonNull,
      pending_close_by: null,
      pending_close_at: null,
      pending_close_expires_at: null,
    },
  });

  return result.count;
}

// ============================================================================
// NEXT DAY CREATION
// ============================================================================

/**
 * Create next business day after day close
 *
 * Creates both a NEW DaySummary (status=OPEN) and a NEW LotteryBusinessDay (status=OPEN)
 * linked together via FK. This enables the lottery wizard to find an OPEN lottery day
 * when a new shift opens after a day close.
 *
 * CRITICAL BUSINESS LOGIC:
 * - Called after a day is closed (lottery + day summary both CLOSED)
 * - Creates new day with business_date = closed_at timestamp (next moment after close)
 * - Links lottery_business_day → day_summary via day_summary_id FK
 * - Uses gt (greater than) boundary: Everything AFTER closed_at belongs to new day
 *
 * Security Controls:
 * - DB-006: TENANT_ISOLATION - All operations scoped to store_id
 * - SEC-006: SQL_INJECTION - Uses Prisma ORM for all database operations
 * - SEC-014: INPUT_VALIDATION - UUID validation on all inputs
 * - DB-001: ORM_USAGE - Atomic transaction for consistency
 *
 * @param storeId - Store UUID (validated before call)
 * @param closedAt - Timestamp when the day was closed (boundary marker)
 * @param closedByUserId - User who closed the day (for audit)
 * @param closedDaySummaryId - The day_summary_id of the day being closed (for linking closed lottery day)
 * @returns NextDayCreationResult with IDs of created records
 */
export async function createNextBusinessDay(
  storeId: string,
  closedAt: Date,
  closedByUserId: string,
  closedDaySummaryId?: string,
): Promise<NextDayCreationResult> {
  // SEC-014: Input validation
  validateUUID(storeId, "storeId");
  validateUUID(closedByUserId, "closedByUserId");
  if (closedDaySummaryId) {
    validateUUID(closedDaySummaryId, "closedDaySummaryId");
  }

  // Calculate the new business date
  // BOUNDARY RULE: New day's business_date is the calendar date of the closed_at timestamp
  // This ensures all activity after close belongs to the new day
  const newBusinessDate = new Date(closedAt);
  newBusinessDate.setHours(0, 0, 0, 0);
  const businessDateStr = newBusinessDate.toISOString().split("T")[0];

  // Create both records atomically in a transaction
  // DB-001: ORM_USAGE - Using Prisma transaction for atomicity
  const result = await prisma.$transaction(
    async (tx) => {
      // STEP 1: Get or create DaySummary with OPEN status
      // =========================================================================
      // IMPORTANT: DaySummary has @@unique([store_id, business_date]) constraint
      // If we close a day mid-day (e.g., 12:03 PM) and create a new day, BOTH days
      // would have the same business_date (calendar date). We use upsert to:
      // - Reuse existing OPEN day_summary if one exists for this date
      // - Create new one only if none exists
      // - Update status to OPEN if the existing one was CLOSED (edge case)
      //
      // This differs from lottery_business_days which had its unique constraint
      // removed to support multiple lottery days per calendar date.
      // =========================================================================
      // DB-006: TENANT_ISOLATION - Scoped to store_id
      const newDaySummary = await tx.daySummary.upsert({
        where: {
          store_id_business_date: {
            store_id: storeId,
            business_date: newBusinessDate,
          },
        },
        create: {
          store_id: storeId,
          business_date: newBusinessDate,
          status: "OPEN",
          // All numeric fields default to 0 in schema
        },
        update: {
          // If an OPEN day_summary already exists for this date, just return it
          // If a CLOSED day_summary exists, reset it to OPEN for the new business period
          // This handles the case where day was closed and reopened on same calendar date
          status: "OPEN",
        },
      });

      // STEP 2: Create new LotteryBusinessDay with OPEN status, linked to DaySummary
      // Unlike DaySummary, lottery_business_days can have multiple records per date
      // (unique constraint was removed in migration 20260106100000)
      // DB-006: TENANT_ISOLATION - Scoped to store_id
      const newLotteryDay = await tx.lotteryBusinessDay.create({
        data: {
          store_id: storeId,
          business_date: newBusinessDate,
          status: "OPEN",
          opened_at: closedAt, // Opens at the moment of previous day's close
          opened_by: closedByUserId,
          day_summary_id: newDaySummary.day_summary_id, // Link to DaySummary
        },
      });

      // STEP 3: Link the CLOSED lottery day to its corresponding CLOSED day_summary
      // This maintains the FK relationship for historical records
      if (closedDaySummaryId) {
        await tx.lotteryBusinessDay.updateMany({
          where: {
            store_id: storeId,
            status: "CLOSED",
            closed_at: closedAt,
            day_summary_id: null, // Only update if not already linked
          },
          data: {
            day_summary_id: closedDaySummaryId,
          },
        });
      }

      return {
        lottery_day_id: newLotteryDay.day_id,
        day_summary_id: newDaySummary.day_summary_id,
        business_date: businessDateStr,
      };
    },
    { timeout: TRANSACTION_TIMEOUTS.STANDARD },
  );

  // LM-001: LOGGING - Structured logging for observability
  console.info("[LotteryDayCloseService] Created next business day:", {
    store_id: storeId,
    new_lottery_day_id: result.lottery_day_id,
    new_day_summary_id: result.day_summary_id,
    business_date: result.business_date,
    created_at: closedAt.toISOString(),
  });

  return result;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Starting serial info for a pack
 *
 * Contains the starting serial position for ticket counting.
 * The starting serial is either:
 * - Previous day's ending serial (for continuing packs)
 * - Pack's serial_start (for new packs)
 *
 * SEC-014: INPUT_VALIDATION - All serial values are validated before use
 */
interface StartingSerialInfo {
  /** The starting serial number (3 digits, e.g., "000" or "045") */
  serial: string;
}

/**
 * Get starting serials for packs from previous day close or pack activation
 *
 * Priority:
 * 1. Previous day's ending serial (from most recent CLOSED day's LotteryDayPack)
 * 2. Pack's serial_start (if never closed before)
 *
 * Serial difference calculation: tickets_sold = ending - starting
 * Examples:
 * - New pack: serial_start=000, ending=015 → 15-0 = 15 tickets sold
 * - Continuing pack: prev_ending=045, ending=090 → 90-45 = 45 tickets sold
 *   (Note: starting serial equals prev_ending for continuing packs)
 *
 * SEC-006: SQL_INJECTION - Uses Prisma ORM for all database operations
 * DB-006: TENANT_ISOLATION - Queries are scoped to store_id
 */
async function getStartingSerials(
  tx: Prisma.TransactionClient,
  storeId: string,
  packs: Array<{ pack_id: string; serial_start: string }>,
): Promise<Map<string, StartingSerialInfo>> {
  const result = new Map<string, StartingSerialInfo>();
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

  // Use previous day's ending serials as starting serials (continuing packs)
  if (lastClosedDay?.day_packs) {
    for (const dayPack of lastClosedDay.day_packs) {
      if (dayPack.ending_serial) {
        result.set(dayPack.pack_id, {
          serial: dayPack.ending_serial,
        });
      }
    }
  }

  // For packs without previous closing, use serial_start (new packs)
  for (const pack of packs) {
    if (!result.has(pack.pack_id)) {
      result.set(pack.pack_id, {
        serial: pack.serial_start,
      });
    }
  }

  return result;
}

/**
 * Calculate tickets sold using serial difference
 *
 * Formula: tickets_sold = ending_serial - starting_serial
 *
 * The starting serial represents the NEXT ticket to be sold (first unsold),
 * and the ending serial represents the NEXT ticket to be sold after sales.
 * The difference gives the exact count of tickets sold during the period.
 *
 * Serial Position Semantics:
 * - Starting serial: Position of the first ticket available for sale
 * - Ending serial: Position after the last ticket sold (next available)
 *
 * Examples:
 * - Starting: 0, Ending: 0 = 0 tickets sold (no sales, still at position 0)
 * - Starting: 0, Ending: 1 = 1 ticket sold (ticket #0 sold, now at position 1)
 * - Starting: 0, Ending: 15 = 15 tickets sold (tickets #0-14 sold)
 * - Starting: 5, Ending: 10 = 5 tickets sold (tickets #5-9 sold)
 * - Starting: 45, Ending: 90 = 45 tickets sold (tickets #45-89 sold)
 *
 * @param endingSerial - The ending serial position (3 digits, e.g., "015")
 * @param startingSerial - The starting serial position (3 digits, e.g., "000")
 * @returns Number of tickets sold (never negative)
 *
 * SEC-014: INPUT_VALIDATION - Strict numeric validation with NaN guard and bounds check
 * API-003: ERROR_HANDLING - Returns 0 for invalid input (fail-safe for UI calculations)
 */
function calculateTicketsSold(
  endingSerial: string,
  startingSerial: string,
): number {
  // SEC-014: Validate input types before processing
  if (typeof endingSerial !== "string" || typeof startingSerial !== "string") {
    return 0;
  }

  // SEC-014: Parse with explicit radix to prevent octal interpretation
  const endingNum = parseInt(endingSerial, 10);
  const startingNum = parseInt(startingSerial, 10);

  // SEC-014: Strict NaN validation using Number.isNaN (not global isNaN)
  if (Number.isNaN(endingNum) || Number.isNaN(startingNum)) {
    return 0;
  }

  // SEC-014: Validate serial range (reasonable bounds check)
  const MAX_SERIAL = 999;
  if (
    endingNum < 0 ||
    endingNum > MAX_SERIAL ||
    startingNum < 0 ||
    startingNum > MAX_SERIAL
  ) {
    return 0;
  }

  // Calculate tickets sold: ending - starting
  // This gives the exact count of tickets sold during the period
  // Example: starting=0, ending=15 means tickets 0-14 were sold = 15 tickets
  const ticketsSold = endingNum - startingNum;

  // Ensure non-negative result (ending should never be less than starting)
  // Math.max provides defense-in-depth against data integrity issues
  return Math.max(0, ticketsSold);
}

/**
 * Calculate tickets sold for DEPLETED packs (manual or auto sold-out)
 *
 * IMPORTANT: This function uses a DIFFERENT formula than calculateTicketsSold.
 * Use this ONLY for packs marked as "sold out" / depleted.
 *
 * Formula: tickets_sold = (serial_end + 1) - starting_serial
 *
 * The +1 is required because serial_end is the LAST ticket INDEX (0-based),
 * not the next position. For example, a 30-ticket pack has serial_end=029,
 * meaning ticket indices 0-29 are valid. To get the count, we need 029+1=30.
 *
 * When to use this function:
 * 1. Manual depletion - user marks pack as "sold out" in UnscannedBinWarningModal
 * 2. Auto depletion - new pack activated in same bin, old pack auto-closes
 *
 * In these cases, closing_serial equals serial_end (the last ticket index).
 *
 * Examples (30-ticket pack with serial_end=029):
 * - Starting: 0, serial_end: 29 → (29 + 1) - 0 = 30 tickets sold (full pack)
 * - Starting: 10, serial_end: 29 → (29 + 1) - 10 = 20 tickets sold (partial)
 * - Starting: 25, serial_end: 29 → (29 + 1) - 25 = 5 tickets sold (end of pack)
 *
 * @param serialEnd - The pack's last ticket INDEX (3 digits, e.g., "029" for 30-ticket pack)
 * @param startingSerial - The starting serial position for today (3 digits, e.g., "000")
 * @returns Number of tickets sold (never negative)
 *
 * SEC-014: INPUT_VALIDATION - Strict numeric validation with NaN guard and bounds check
 * API-003: ERROR_HANDLING - Returns 0 for invalid input (fail-safe for calculations)
 */
function calculateTicketsSoldForDepletion(
  serialEnd: string,
  startingSerial: string,
): number {
  // SEC-014: Validate input types before processing
  if (typeof serialEnd !== "string" || typeof startingSerial !== "string") {
    return 0;
  }

  // SEC-014: Parse with explicit radix to prevent octal interpretation
  const serialEndNum = parseInt(serialEnd, 10);
  const startingNum = parseInt(startingSerial, 10);

  // SEC-014: Strict NaN validation using Number.isNaN (not global isNaN)
  if (Number.isNaN(serialEndNum) || Number.isNaN(startingNum)) {
    return 0;
  }

  // SEC-014: Validate serial range (reasonable bounds check)
  const MAX_SERIAL = 999;
  if (
    serialEndNum < 0 ||
    serialEndNum > MAX_SERIAL ||
    startingNum < 0 ||
    startingNum > MAX_SERIAL
  ) {
    return 0;
  }

  // Depletion formula: (serial_end + 1) - starting = tickets sold
  // serial_end is the LAST ticket index, so +1 converts to count
  // Example: serial_end=29, starting=0 → (29+1)-0 = 30 tickets (full 30-ticket pack)
  const ticketsSold = serialEndNum + 1 - startingNum;

  // Ensure non-negative result (serial_end+1 should never be less than starting)
  // Math.max provides defense-in-depth against data integrity issues
  return Math.max(0, ticketsSold);
}
