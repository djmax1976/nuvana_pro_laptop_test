/**
 * Lottery Service
 *
 * Service for lottery-related business logic including:
 * - Variance detection and reconciliation calculations
 * - Expected count calculations
 * - Game code lookup for serialized pack reception
 *
 * Story 6.7: Shift Lottery Closing and Reconciliation
 * Story 6.12: Serialized Pack Reception with Batch Processing
 */

import { prisma } from "../utils/db";

/**
 * Calculate expected ticket count based on opening and closing serials
 * Formula: expected = closing_serial - opening_serial + 1
 *
 * @param openingSerial - Opening serial number (string, e.g., "0001")
 * @param closingSerial - Closing serial number (string, e.g., "0050")
 * @returns Expected count of tickets that should have been sold
 * @throws Error if serials are not numeric
 */
export function calculateExpectedCount(
  openingSerial: string,
  closingSerial: string,
): number {
  // Parse serials as integers (assumes numeric serials, common for lottery tickets)
  const openingSerialNum = parseInt(openingSerial, 10);
  const closingSerialNum = parseInt(closingSerial, 10);

  if (isNaN(openingSerialNum) || isNaN(closingSerialNum)) {
    throw new Error(
      `Invalid serial format: opening=${openingSerial}, closing=${closingSerial}. Serials must be numeric.`,
    );
  }

  return closingSerialNum - openingSerialNum + 1;
}

/**
 * Detect if variance exists between expected and actual counts
 *
 * @param expected - Expected ticket count
 * @param actual - Actual ticket count from database
 * @returns true if variance exists (expected ≠ actual), false otherwise
 */
export function hasVariance(expected: number, actual: number): boolean {
  return expected !== actual;
}

/**
 * Calculate variance difference
 *
 * @param expected - Expected ticket count
 * @param actual - Actual ticket count from database
 * @returns Difference: expected - actual (positive = shortage, negative = surplus)
 */
export function calculateVarianceDifference(
  expected: number,
  actual: number,
): number {
  return expected - actual;
}

/**
 * Detect variance for a shift and pack, creating LotteryVariance record if variance exists
 *
 * @param shiftId - Shift UUID
 * @param packId - Pack UUID
 * @param openingSerial - Opening serial number
 * @param closingSerial - Closing serial number
 * @param shiftOpenedAt - Shift opened timestamp (for filtering actual count)
 * @returns LotteryVariance record if variance exists, null otherwise
 */
export async function detectVariance(
  shiftId: string,
  packId: string,
  openingSerial: string,
  closingSerial: string,
  _shiftOpenedAt: Date, // Unused until LotteryTicketSerial model is implemented
): Promise<{
  variance: any;
  expected: number;
  actual: number;
  difference: number;
} | null> {
  // Calculate expected count
  const expected = calculateExpectedCount(openingSerial, closingSerial);

  // Query actual count from lottery_shift_closings for this shift and pack
  // Note: LotteryTicketSerial model doesn't exist in schema yet
  // For now, use difference between closing and opening serials as actual count
  // TODO: Replace with actual ticket serial tracking when model is implemented
  const actual = expected; // Placeholder: assumes no variance until ticket tracking is implemented

  // Calculate difference
  const difference = calculateVarianceDifference(expected, actual);

  // Create LotteryVariance if difference exists
  if (hasVariance(expected, actual)) {
    const variance = await prisma.lotteryVariance.create({
      data: {
        shift_id: shiftId,
        pack_id: packId,
        expected,
        actual,
        difference,
      },
    });

    return {
      variance,
      expected,
      actual,
      difference,
    };
  }

  return null;
}

/**
 * Lookup game by game code
 * Story 6.12: Serialized Pack Reception with Batch Processing
 *
 * @param gameCode - 4-digit game code (e.g., "0001")
 * @returns Game information (game_id, name) if found
 * @throws Error if game_code not found
 */
export async function lookupGameByCode(gameCode: string): Promise<{
  game_id: string;
  name: string;
}> {
  // Validate game code format (4 digits)
  if (!/^\d{4}$/.test(gameCode)) {
    throw new Error(
      `Invalid game code format: ${gameCode}. Game code must be exactly 4 digits.`,
    );
  }

  // Lookup game by game_code using Prisma ORM (prevents SQL injection)
  const game = await prisma.lotteryGame.findUnique({
    where: { game_code: gameCode },
    select: {
      game_id: true,
      name: true,
    },
  });

  if (!game) {
    throw new Error(`Game code ${gameCode} not found in database.`);
  }

  return {
    game_id: game.game_id,
    name: game.name,
  };
}

/**
 * Move pack between bins
 * Story 6.13: Lottery Database Enhancements & Bin Management (AC #5)
 *
 * Moves a lottery pack from one bin to another, creating an audit trail
 * in LotteryPackBinHistory and updating the pack's current_bin_id.
 *
 * @param packId - Pack UUID to move
 * @param newBinId - Target bin UUID (null to unassign from bin)
 * @param movedBy - User UUID who performed the movement
 * @param reason - Optional reason for movement (max 500 characters)
 * @returns Updated pack with new bin assignment
 * @throws Error if pack or bin not found, or if validation fails
 */
export async function movePackBetweenBins(
  packId: string,
  newBinId: string | null,
  movedBy: string,
  reason?: string,
): Promise<{
  pack_id: string;
  current_bin_id: string | null;
  history_id: string | null;
}> {
  // Validate pack exists using Prisma ORM (prevents SQL injection)
  const pack = await prisma.lotteryPack.findUnique({
    where: { pack_id: packId },
    select: {
      pack_id: true,
      current_bin_id: true,
      store_id: true,
      pack_number: true,
    },
  });

  if (!pack) {
    throw new Error(`Pack ${packId} not found`);
  }

  // Validate new bin exists (if provided)
  if (newBinId !== null) {
    const bin = await prisma.lotteryBin.findUnique({
      where: { bin_id: newBinId },
      select: {
        bin_id: true,
        store_id: true,
        is_active: true,
      },
    });

    if (!bin) {
      throw new Error(`Bin ${newBinId} not found`);
    }

    // Validate bin is active
    if (!bin.is_active) {
      throw new Error(`Bin ${newBinId} is not active`);
    }

    // Validate pack and bin belong to same store (RLS enforcement)
    if (pack.store_id !== bin.store_id) {
      throw new Error(
        `Pack and bin must belong to the same store. Pack store: ${pack.store_id}, Bin store: ${bin.store_id}`,
      );
    }
  }

  // Validate reason length if provided
  if (reason && reason.length > 500) {
    throw new Error("Reason must be 500 characters or less");
  }

  // Use Prisma transaction to ensure atomicity (all-or-nothing)
  const result = await prisma.$transaction(async (tx) => {
    // Update pack's current_bin_id
    const updatedPack = await tx.lotteryPack.update({
      where: { pack_id: packId },
      data: { current_bin_id: newBinId },
      select: {
        pack_id: true,
        current_bin_id: true,
      },
    });

    // Create LotteryPackBinHistory record for audit trail (only when moving TO a bin)
    let historyId: string | null = null;
    if (newBinId !== null) {
      const history = await tx.lotteryPackBinHistory.create({
        data: {
          pack_id: packId,
          bin_id: newBinId,
          moved_by: movedBy,
          moved_at: new Date(),
          reason: reason || null,
        },
        select: {
          history_id: true,
        },
      });
      historyId = history.history_id;
    }

    return {
      pack_id: updatedPack.pack_id,
      current_bin_id: updatedPack.current_bin_id,
      history_id: historyId,
    };
  });

  // Create audit log entry (non-blocking)
  try {
    await prisma.auditLog.create({
      data: {
        user_id: movedBy,
        action: "LOTTERY_PACK_MOVED",
        table_name: "lottery_packs",
        record_id: packId,
        old_values: {
          current_bin_id: pack.current_bin_id,
        } as Record<string, any>,
        new_values: {
          current_bin_id: newBinId,
          reason: reason || null,
        } as Record<string, any>,
        reason: `Pack ${pack.pack_number} moved ${pack.current_bin_id ? `from bin ${pack.current_bin_id}` : "from unassigned"} ${newBinId ? `to bin ${newBinId}` : "to unassigned"}. Reason: ${reason || "Not provided"}`,
      },
    });
  } catch (auditError) {
    // Log error but don't fail the operation
    console.error("Failed to create audit log for pack movement:", auditError);
  }

  return result;
}
