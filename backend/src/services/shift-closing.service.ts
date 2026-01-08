/**
 * Shift Closing Service
 *
 * Service for lottery shift closing operations including:
 * - Creating LotteryShiftClosing records
 * - Updating pack status (DEPLETED or ACTIVE)
 * - Calculating variance (expected vs actual tickets sold)
 * - Creating LotteryVariance records
 * - Creating AuditLog entries
 *
 * Story 10.7: Shift Closing Submission & Pack Status Updates
 */

import { withRLSTransaction, TRANSACTION_TIMEOUTS } from "../utils/db";
import { LotteryPackStatus } from "@prisma/client";
import {
  calculateExpectedCount,
  calculateExpectedCountForDepletion,
} from "./lottery.service";

/**
 * Input for a single pack closing
 */
export interface LotteryClosingInput {
  bin_id: string;
  pack_id: string;
  ending_serial: string;
  entry_method: "SCAN" | "MANUAL";
  manual_entry_authorized_by?: string;
  manual_entry_authorized_at?: string;
}

/**
 * Result of closing operation
 */
export interface LotteryClosingResult {
  packs_closed: number;
  packs_depleted: number;
  total_tickets_sold: number;
  variances: Array<{
    pack_id: string;
    pack_number: string;
    game_name: string;
    expected: number;
    actual: number;
    difference: number;
  }>;
}

/**
 * Close lottery for a shift
 * Creates LotteryShiftClosing records, updates pack status, calculates variance, and creates audit logs
 *
 * @param shiftId - Shift UUID
 * @param closings - Array of closing data for each pack
 * @param closedBy - User UUID who is closing the shift
 * @returns Summary of closing operation with counts and variances
 * @throws Error if validation fails or database operation fails
 */
export async function closeLotteryForShift(
  shiftId: string,
  closings: LotteryClosingInput[],
  closedBy: string,
): Promise<LotteryClosingResult> {
  // Validate inputs using Prisma ORM (prevents SQL injection)
  if (!shiftId || typeof shiftId !== "string") {
    throw new Error("Invalid shiftId: must be a non-empty string");
  }

  if (!Array.isArray(closings)) {
    throw new Error("Invalid closings: must be an array");
  }
  // Note: closings can be empty if all packs are auto-closed (sold packs)

  if (!closedBy || typeof closedBy !== "string") {
    throw new Error("Invalid closedBy: must be a non-empty string");
  }

  // Validate each closing input
  for (const closing of closings) {
    if (!closing.pack_id || typeof closing.pack_id !== "string") {
      throw new Error("Invalid closing: pack_id is required");
    }
    if (!closing.ending_serial || typeof closing.ending_serial !== "string") {
      throw new Error("Invalid closing: ending_serial is required");
    }
    if (
      !closing.entry_method ||
      (closing.entry_method !== "SCAN" && closing.entry_method !== "MANUAL")
    ) {
      throw new Error(
        "Invalid closing: entry_method must be 'SCAN' or 'MANUAL'",
      );
    }
    if (
      closing.entry_method === "MANUAL" &&
      (!closing.manual_entry_authorized_by ||
        !closing.manual_entry_authorized_at)
    ) {
      throw new Error(
        "Invalid closing: manual_entry_authorized_by and manual_entry_authorized_at are required for MANUAL entry",
      );
    }
  }

  /**
   * ENTERPRISE-GRADE SHIFT CLOSING
   *
   * @enterprise-standards
   * - DB-001: ORM_USAGE - All database operations via Prisma ORM
   * - DB-006: TENANT_ISOLATION - Store-scoped queries enforced via RLS
   * - SEC-006: SQL_INJECTION - Parameterized queries via Prisma
   * - API-003: ERROR_HANDLING - Centralized error handling with safe messages
   *
   * Performance Optimization:
   * - Single batch query for shift openings (eliminates N+1)
   * - Single batch query for ticket counts using groupBy (eliminates N+1)
   * - Bulk createMany for closings, variances, and audit logs
   * - Target: 100 packs in <3 seconds (was 10-20 seconds)
   */
  return withRLSTransaction(
    closedBy,
    async (tx) => {
      const result: LotteryClosingResult = {
        packs_closed: 0,
        packs_depleted: 0,
        total_tickets_sold: 0,
        variances: [],
      };

      // ============================================================
      // PHASE 1: Batch fetch all required data (parallel queries)
      // ============================================================

      // Get shift information for audit context
      const shift = await tx.shift.findUnique({
        where: { shift_id: shiftId },
        select: {
          shift_id: true,
          store_id: true,
          cashier_id: true,
          opened_at: true,
        },
      });

      if (!shift) {
        throw new Error(`Shift ${shiftId} not found`);
      }

      // Parallel fetch: sold packs, existing closings, manual closing packs
      const [soldPacks, existingClosings] = await Promise.all([
        // AC #4: Auto-close sold packs (activated AND depleted during this shift)
        tx.lotteryPack.findMany({
          where: {
            store_id: shift.store_id,
            status: LotteryPackStatus.DEPLETED,
            activated_shift_id: shiftId,
            depleted_shift_id: shiftId,
            activated_at: { gte: shift.opened_at },
            depleted_at: { gte: shift.opened_at, not: null },
          },
          select: {
            pack_id: true,
            pack_number: true,
            serial_start: true,
            serial_end: true,
            game: { select: { game_id: true, name: true } },
          },
        }),
        // Get existing closing records for this shift to avoid duplicates
        tx.lotteryShiftClosing.findMany({
          where: { shift_id: shiftId },
          select: { pack_id: true },
        }),
      ]);

      const existingPackIds = new Set(existingClosings.map((c) => c.pack_id));
      const manualClosingPackIds = closings.map((c) => c.pack_id);

      // Filter sold packs that need auto-closing
      const soldPacksToAutoClose = soldPacks.filter(
        (p) =>
          !existingPackIds.has(p.pack_id) &&
          !manualClosingPackIds.includes(p.pack_id),
      );

      // Get all pack IDs we need to process
      const allPackIdsToProcess = [
        ...soldPacksToAutoClose.map((p) => p.pack_id),
        ...manualClosingPackIds,
      ];

      if (allPackIdsToProcess.length === 0) {
        return result; // Nothing to process
      }

      // ============================================================
      // PHASE 2 & 3: Batch fetch packs, openings, and ticket counts
      // ============================================================
      // PHASE 4: QUERY PARALLELIZATION
      // DB-001: ORM_USAGE - Using Prisma ORM for all queries
      // SEC-006: SQL_INJECTION - Parameterized queries via Prisma
      // Performance: Run independent queries in parallel using Promise.all
      // - Manual packs: Depends on manualClosingPackIds (known)
      // - All openings: Depends on allPackIdsToProcess (known)
      // - Ticket counts: Depends on allPackIdsToProcess and shift.opened_at (known)
      // These queries have NO data dependencies on each other
      // ============================================================

      const [manualPacks, allOpenings, ticketCounts] = await Promise.all([
        // Query 1: Fetch all manual closing packs
        tx.lotteryPack.findMany({
          where: { pack_id: { in: manualClosingPackIds } },
          select: {
            pack_id: true,
            pack_number: true,
            serial_start: true,
            serial_end: true,
            status: true,
            game: { select: { game_id: true, name: true } },
          },
        }),
        // Query 2: Batch fetch all openings
        tx.lotteryShiftOpening.findMany({
          where: {
            shift_id: shiftId,
            pack_id: { in: allPackIdsToProcess },
          },
          select: { pack_id: true, opening_serial: true },
        }),
        // Query 3: Batch fetch ticket counts using groupBy
        tx.lotteryTicketSerial.groupBy({
          by: ["pack_id"],
          where: {
            pack_id: { in: allPackIdsToProcess },
            sold_at: { not: null, gte: shift.opened_at },
          },
          _count: { serial_number: true },
        }),
      ]);

      // Build maps from parallel query results
      const manualPackMap = new Map(manualPacks.map((p) => [p.pack_id, p]));
      const openingMap = new Map(
        allOpenings.map((o) => [o.pack_id, o.opening_serial]),
      );
      const ticketCountMap = new Map(
        ticketCounts.map((c) => [c.pack_id, c._count.serial_number]),
      );

      // API-003: ERROR_HANDLING - Validate results after parallel queries
      // Validate all manual packs exist
      for (const closing of closings) {
        if (!manualPackMap.has(closing.pack_id)) {
          throw new Error(`Pack ${closing.pack_id} not found`);
        }
      }

      // Validate all manual closings have opening records
      for (const closing of closings) {
        if (!openingMap.has(closing.pack_id)) {
          throw new Error(
            `Opening record not found for shift ${shiftId} and pack ${closing.pack_id}`,
          );
        }
      }

      // ============================================================
      // PHASE 4: Prepare bulk insert data
      // ============================================================

      interface ClosingToCreate {
        shift_id: string;
        pack_id: string;
        cashier_id: string | null;
        closing_serial: string;
        entry_method: "SCAN" | "MANUAL";
        manual_entry_authorized_by: string | null;
        manual_entry_authorized_at: Date | null;
      }

      interface VarianceToCreate {
        shift_id: string;
        pack_id: string;
        expected: number;
        actual: number;
        difference: number;
      }

      interface AuditEntry {
        user_id: string;
        action: string;
        table_name: string;
        record_id: string;
        new_values: Record<string, any>;
        reason: string;
      }

      const closingsToCreate: ClosingToCreate[] = [];
      const variancesToCreate: VarianceToCreate[] = [];
      const auditEntries: AuditEntry[] = [];

      // Process auto-close sold packs
      for (const soldPack of soldPacksToAutoClose) {
        const openingSerial = openingMap.get(soldPack.pack_id);
        if (!openingSerial) {
          continue; // Skip if no opening record
        }

        // Calculate tickets sold for DEPLETION
        const expected = calculateExpectedCountForDepletion(
          openingSerial,
          soldPack.serial_end,
        );
        const actualCount = ticketCountMap.get(soldPack.pack_id) ?? 0;
        const actual = actualCount > 0 ? actualCount : expected;
        const difference = actual - expected;

        closingsToCreate.push({
          shift_id: shiftId,
          pack_id: soldPack.pack_id,
          cashier_id: shift.cashier_id,
          closing_serial: soldPack.serial_end,
          entry_method: "SCAN",
          manual_entry_authorized_by: null,
          manual_entry_authorized_at: null,
        });

        if (difference !== 0) {
          variancesToCreate.push({
            shift_id: shiftId,
            pack_id: soldPack.pack_id,
            expected,
            actual,
            difference,
          });
          result.variances.push({
            pack_id: soldPack.pack_id,
            pack_number: soldPack.pack_number,
            game_name: soldPack.game.name,
            expected,
            actual,
            difference,
          });
        }

        auditEntries.push({
          user_id: closedBy,
          action: "LOTTERY_SHIFT_CLOSING_AUTO_CREATED",
          table_name: "lottery_shift_closings",
          record_id: soldPack.pack_id,
          new_values: {
            shift_id: shiftId,
            pack_id: soldPack.pack_id,
            pack_number: soldPack.pack_number,
            closing_serial: soldPack.serial_end,
            opening_serial: openingSerial,
            entry_method: "SCAN",
            expected_count: expected,
            actual_count: actual,
            difference,
            pack_status: "DEPLETED",
            auto_closed: true,
          },
          reason: `Auto-closed sold pack ${soldPack.pack_number} - Pack was activated and depleted during this shift`,
        });

        result.packs_closed++;
        result.packs_depleted++;
        result.total_tickets_sold += expected;
      }

      // Process manual closings
      for (const closing of closings) {
        const pack = manualPackMap.get(closing.pack_id)!;
        const openingSerial = openingMap.get(closing.pack_id)!;

        const expected = calculateExpectedCount(
          openingSerial,
          closing.ending_serial,
        );
        const actualCount = ticketCountMap.get(closing.pack_id) ?? 0;
        const actual = actualCount > 0 ? actualCount : expected;
        const difference = actual - expected;

        closingsToCreate.push({
          shift_id: shiftId,
          pack_id: closing.pack_id,
          cashier_id: shift.cashier_id,
          closing_serial: closing.ending_serial,
          entry_method: closing.entry_method,
          manual_entry_authorized_by:
            closing.entry_method === "MANUAL"
              ? (closing.manual_entry_authorized_by ?? null)
              : null,
          manual_entry_authorized_at:
            closing.entry_method === "MANUAL" &&
            closing.manual_entry_authorized_at
              ? new Date(closing.manual_entry_authorized_at)
              : null,
        });

        if (difference !== 0) {
          variancesToCreate.push({
            shift_id: shiftId,
            pack_id: closing.pack_id,
            expected,
            actual,
            difference,
          });
          result.variances.push({
            pack_id: closing.pack_id,
            pack_number: pack.pack_number,
            game_name: pack.game.name,
            expected,
            actual,
            difference,
          });
        }

        auditEntries.push({
          user_id: closedBy,
          action: "LOTTERY_SHIFT_CLOSING_CREATED",
          table_name: "lottery_shift_closings",
          record_id: closing.pack_id,
          new_values: {
            shift_id: shiftId,
            pack_id: closing.pack_id,
            pack_number: pack.pack_number,
            closing_serial: closing.ending_serial,
            opening_serial: openingSerial,
            entry_method: closing.entry_method,
            manual_entry_authorized_by:
              closing.manual_entry_authorized_by ?? null,
            expected_count: expected,
            actual_count: actual,
            difference,
          },
          reason: `Lottery shift closing created for pack ${pack.pack_number} - Entry: ${closing.entry_method}, Expected: ${expected}, Actual: ${actual}, Difference: ${difference}`,
        });

        result.packs_closed++;
        result.total_tickets_sold += expected;
      }

      // ============================================================
      // PHASE 5: Bulk inserts (3 queries instead of N*3)
      // ============================================================

      // Bulk create closings
      if (closingsToCreate.length > 0) {
        await tx.lotteryShiftClosing.createMany({
          data: closingsToCreate,
          skipDuplicates: true,
        });
      }

      // Bulk create variances
      if (variancesToCreate.length > 0) {
        await tx.lotteryVariance.createMany({
          data: variancesToCreate,
          skipDuplicates: true,
        });
      }

      // Bulk create audit logs (non-critical)
      if (auditEntries.length > 0) {
        try {
          await tx.auditLog.createMany({ data: auditEntries });
        } catch (auditError) {
          console.error("Failed to create batch audit logs:", auditError);
        }
      }

      return result;
    },
    { timeout: TRANSACTION_TIMEOUTS.BULK },
  );
}
