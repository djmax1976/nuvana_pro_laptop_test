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

import { prisma } from "../utils/db";
import { Prisma, LotteryPackStatus } from "@prisma/client";
import { calculateExpectedCount } from "./lottery.service";

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

  // Use Prisma transaction for atomicity (all-or-nothing)
  return prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      const result: LotteryClosingResult = {
        packs_closed: 0,
        packs_depleted: 0,
        total_tickets_sold: 0,
        variances: [],
      };

      // Get shift information for audit context
      const shift = await tx.shift.findUnique({
        where: { shift_id: shiftId },
        select: {
          shift_id: true,
          store_id: true,
          cashier_id: true, // Include for lottery closing records
          opened_at: true,
        },
      });

      if (!shift) {
        throw new Error(`Shift ${shiftId} not found`);
      }

      // AC #4: Auto-close sold packs (activated AND depleted during this shift)
      // Find packs that were activated and depleted during this shift
      const soldPacks = await tx.lotteryPack.findMany({
        where: {
          store_id: shift.store_id,
          status: LotteryPackStatus.DEPLETED,
          activated_shift_id: shiftId,
          depleted_shift_id: shiftId,
          activated_at: {
            gte: shift.opened_at,
          },
          depleted_at: {
            gte: shift.opened_at,
            not: null,
          },
        },
        select: {
          pack_id: true,
          pack_number: true,
          serial_start: true,
          serial_end: true,
          game: {
            select: {
              game_id: true,
              name: true,
            },
          },
        },
      });

      // Get existing closing records for this shift to avoid duplicates
      const existingClosings = await tx.lotteryShiftClosing.findMany({
        where: {
          shift_id: shiftId,
        },
        select: {
          pack_id: true,
        },
      });

      const existingPackIds = new Set(existingClosings.map((c) => c.pack_id));

      // Auto-create closing records for sold packs that don't already have one
      for (const soldPack of soldPacks) {
        // Skip if already has a closing record or is in manual closings
        if (
          existingPackIds.has(soldPack.pack_id) ||
          closings.some((c) => c.pack_id === soldPack.pack_id)
        ) {
          continue;
        }

        // Get opening serial for this pack
        const opening = await tx.lotteryShiftOpening.findUnique({
          where: {
            shift_id_pack_id: {
              shift_id: shiftId,
              pack_id: soldPack.pack_id,
            },
          },
          select: {
            opening_serial: true,
          },
        });

        if (!opening) {
          // Skip if no opening record (shouldn't happen, but be safe)
          continue;
        }

        // Calculate tickets sold (expected count) - ending = serial_end for sold packs
        const expected = calculateExpectedCount(
          opening.opening_serial,
          soldPack.serial_end,
        );

        // Get actual count from LotteryTicketSerial
        const actualCount = await tx.lotteryTicketSerial.count({
          where: {
            pack_id: soldPack.pack_id,
            sold_at: {
              not: null,
              gte: shift.opened_at,
            },
          },
        });

        const actual = actualCount > 0 ? actualCount : expected;

        // Calculate variance
        const difference = actual - expected;

        // Auto-create closing record with ending = serial_end
        await tx.lotteryShiftClosing.create({
          data: {
            shift_id: shiftId,
            pack_id: soldPack.pack_id,
            cashier_id: shift.cashier_id, // Direct cashier reference for efficient querying
            closing_serial: soldPack.serial_end, // AC #4: ending = serial_end for sold packs
            entry_method: "SCAN", // Auto-closed packs are treated as scanned
            manual_entry_authorized_by: null,
            manual_entry_authorized_at: null,
          },
        });

        // Create LotteryVariance if variance exists
        if (difference !== 0) {
          await tx.lotteryVariance.create({
            data: {
              shift_id: shiftId,
              pack_id: soldPack.pack_id,
              expected,
              actual,
              difference,
            },
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

        // Create AuditLog entry (non-blocking)
        try {
          await tx.auditLog.create({
            data: {
              user_id: closedBy,
              action: "LOTTERY_SHIFT_CLOSING_AUTO_CREATED",
              table_name: "lottery_shift_closings",
              record_id: soldPack.pack_id,
              new_values: {
                shift_id: shiftId,
                pack_id: soldPack.pack_id,
                pack_number: soldPack.pack_number,
                closing_serial: soldPack.serial_end,
                opening_serial: opening.opening_serial,
                entry_method: "SCAN",
                expected_count: expected,
                actual_count: actual,
                difference: difference,
                pack_status: "DEPLETED",
                auto_closed: true,
              } as Record<string, any>,
              reason: `Auto-closed sold pack ${soldPack.pack_number} - Pack was activated and depleted during this shift`,
            },
          });
        } catch (auditError) {
          console.error(
            "Failed to create audit log for auto-closed pack:",
            auditError,
          );
        }

        result.packs_closed++;
        result.packs_depleted++; // Sold packs are already depleted
        result.total_tickets_sold += expected;
      }

      // Process each manual closing
      for (const closing of closings) {
        // Get pack with opening data
        const pack = await tx.lotteryPack.findUnique({
          where: { pack_id: closing.pack_id },
          select: {
            pack_id: true,
            pack_number: true,
            serial_start: true,
            serial_end: true,
            status: true,
            game: {
              select: {
                game_id: true,
                name: true,
              },
            },
          },
        });

        if (!pack) {
          throw new Error(`Pack ${closing.pack_id} not found`);
        }

        // Get opening serial from LotteryShiftOpening
        const opening = await tx.lotteryShiftOpening.findUnique({
          where: {
            shift_id_pack_id: {
              shift_id: shiftId,
              pack_id: closing.pack_id,
            },
          },
          select: {
            opening_serial: true,
          },
        });

        if (!opening) {
          throw new Error(
            `Opening record not found for shift ${shiftId} and pack ${closing.pack_id}`,
          );
        }

        // Calculate tickets sold (expected count)
        const expected = calculateExpectedCount(
          opening.opening_serial,
          closing.ending_serial,
        );

        // Get actual count from LotteryTicketSerial (if model exists)
        // Count tickets sold during this shift for this pack
        const actualCount = await tx.lotteryTicketSerial.count({
          where: {
            pack_id: closing.pack_id,
            sold_at: {
              not: null,
              gte: shift.opened_at,
            },
          },
        });

        // Use expected as actual if ticket tracking not fully implemented
        const actual = actualCount > 0 ? actualCount : expected;

        // Calculate variance
        const difference = actual - expected;

        // Create LotteryShiftClosing record
        const closingRecord = await tx.lotteryShiftClosing.create({
          data: {
            shift_id: shiftId,
            pack_id: closing.pack_id,
            cashier_id: shift.cashier_id, // Direct cashier reference for efficient querying
            closing_serial: closing.ending_serial,
            entry_method: closing.entry_method,
            manual_entry_authorized_by:
              closing.entry_method === "MANUAL"
                ? closing.manual_entry_authorized_by
                : null,
            manual_entry_authorized_at:
              closing.entry_method === "MANUAL" &&
              closing.manual_entry_authorized_at
                ? new Date(closing.manual_entry_authorized_at)
                : null,
          },
        });

        // Determine if pack is depleted (ending >= serial_end)
        const endingSerialNum = parseInt(closing.ending_serial, 10);
        const serialEndNum = parseInt(pack.serial_end, 10);
        const isDepleted =
          !isNaN(endingSerialNum) &&
          !isNaN(serialEndNum) &&
          endingSerialNum >= serialEndNum;

        // Update pack status if depleted
        if (isDepleted && pack.status === LotteryPackStatus.ACTIVE) {
          await tx.lotteryPack.update({
            where: { pack_id: closing.pack_id },
            data: {
              status: LotteryPackStatus.DEPLETED,
              depleted_at: new Date(),
              depleted_by: closedBy,
              depleted_shift_id: shiftId,
              depletion_reason: "SHIFT_CLOSE",
            },
          });
          result.packs_depleted++;
        }

        // Create LotteryVariance if variance exists
        if (difference !== 0) {
          await tx.lotteryVariance.create({
            data: {
              shift_id: shiftId,
              pack_id: closing.pack_id,
              expected,
              actual,
              difference,
            },
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

        // Create AuditLog entry (non-blocking - don't fail if audit fails)
        try {
          await tx.auditLog.create({
            data: {
              user_id: closedBy,
              action: "LOTTERY_SHIFT_CLOSING_CREATED",
              table_name: "lottery_shift_closings",
              record_id: closingRecord.closing_id,
              new_values: {
                closing_id: closingRecord.closing_id,
                shift_id: shiftId,
                pack_id: closing.pack_id,
                pack_number: pack.pack_number,
                closing_serial: closing.ending_serial,
                opening_serial: opening.opening_serial,
                entry_method: closing.entry_method,
                manual_entry_authorized_by:
                  closing.manual_entry_authorized_by || null,
                expected_count: expected,
                actual_count: actual,
                difference: difference,
                pack_status_updated: isDepleted ? "DEPLETED" : "ACTIVE",
              } as Record<string, any>,
              reason: `Lottery shift closing created for pack ${pack.pack_number} - Entry: ${closing.entry_method}, Expected: ${expected}, Actual: ${actual}, Difference: ${difference}`,
            },
          });
        } catch (auditError) {
          // Log error but don't fail the operation
          console.error(
            "Failed to create audit log for shift closing:",
            auditError,
          );
        }

        result.packs_closed++;
        result.total_tickets_sold += expected;
      }

      return result;
    },
    {
      timeout: 60000, // 60 second timeout for large stores
    },
  );
}
