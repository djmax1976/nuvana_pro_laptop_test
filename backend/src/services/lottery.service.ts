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
 * Game scope type for lookup results
 * - STATE: Game is scoped to the store's state (visible to all stores in that state)
 * - STORE: Game is scoped to a specific store (fallback, edge case)
 * - GLOBAL: Legacy global game (store_id IS NULL, state_id IS NULL)
 */
export type GameScopeType = "STATE" | "STORE" | "GLOBAL";

/**
 * Lookup game by game code with state-first priority
 * Story 6.12: Serialized Pack Reception with Batch Processing
 * Story: State-Scoped Lottery Games Phase
 *
 * Game Scoping Rules (Priority Order):
 * 1. STATE-scoped game: If storeId provided, get store's state_id and look for state-scoped game
 * 2. STORE-scoped game: If no state game found, look for store-specific game (fallback/edge case)
 * 3. GLOBAL game: If no state/store game found, look for legacy global game (store_id IS NULL, state_id IS NULL)
 *
 * This NEW priority order means:
 * - State-scoped games (created by SuperAdmin) are the PRIMARY source
 * - Store-scoped games are a FALLBACK for edge cases only
 * - Global games provide backwards compatibility
 *
 * @param gameCode - 4-digit game code (e.g., "0001")
 * @param storeId - Optional store ID for scoped lookup (required for state/store scoping)
 * @returns Game information (game_id, name, tickets_per_pack, scope_type, state_id) if found
 * @throws Error if game_code not found
 */
export async function lookupGameByCode(
  gameCode: string,
  storeId?: string,
): Promise<{
  game_id: string;
  name: string;
  tickets_per_pack: number | null;
  is_global: boolean;
  scope_type: GameScopeType;
  state_id: string | null;
}> {
  // Validate game code format (4 digits)
  if (!/^\d{4}$/.test(gameCode)) {
    throw new Error(
      `Invalid game code format: ${gameCode}. Game code must be exactly 4 digits.`,
    );
  }

  // If storeId provided, get the store's state_id for state-scoped lookup
  let storeStateId: string | null = null;
  if (storeId) {
    const store = await prisma.store.findUnique({
      where: { store_id: storeId },
      select: { state_id: true },
    });
    storeStateId = store?.state_id ?? null;
  }

  // Priority 1: Look for STATE-scoped game (if store has state_id)
  if (storeStateId) {
    const stateGame = await prisma.lotteryGame.findFirst({
      where: {
        game_code: gameCode,
        state_id: storeStateId,
        status: "ACTIVE",
      },
      select: {
        game_id: true,
        name: true,
        tickets_per_pack: true,
        state_id: true,
      },
    });

    if (stateGame) {
      return {
        game_id: stateGame.game_id,
        name: stateGame.name,
        tickets_per_pack: stateGame.tickets_per_pack,
        is_global: false,
        scope_type: "STATE",
        state_id: stateGame.state_id,
      };
    }
  }

  // Priority 2: Look for STORE-scoped game (fallback for edge cases)
  if (storeId) {
    const storeGame = await prisma.lotteryGame.findFirst({
      where: {
        game_code: gameCode,
        store_id: storeId,
        state_id: null, // Store-scoped games should not have state_id
        status: "ACTIVE",
      },
      select: {
        game_id: true,
        name: true,
        tickets_per_pack: true,
      },
    });

    if (storeGame) {
      return {
        game_id: storeGame.game_id,
        name: storeGame.name,
        tickets_per_pack: storeGame.tickets_per_pack,
        is_global: false,
        scope_type: "STORE",
        state_id: null,
      };
    }
  }

  // Priority 3: Look for GLOBAL game (legacy, store_id IS NULL AND state_id IS NULL)
  const globalGame = await prisma.lotteryGame.findFirst({
    where: {
      game_code: gameCode,
      store_id: null,
      state_id: null,
      status: "ACTIVE",
    },
    select: {
      game_id: true,
      name: true,
      tickets_per_pack: true,
    },
  });

  if (!globalGame) {
    throw new Error(`Game code ${gameCode} not found in database.`);
  }

  return {
    game_id: globalGame.game_id,
    name: globalGame.name,
    tickets_per_pack: globalGame.tickets_per_pack,
    is_global: true,
    scope_type: "GLOBAL",
    state_id: null,
  };
}

/**
 * Lookup game by game code with state ID directly (for state-scoped operations)
 * Use this when you already have the state_id and want to skip store lookup
 *
 * @param gameCode - 4-digit game code
 * @param stateId - State ID for state-scoped lookup
 * @returns Game information if found, null otherwise
 */
export async function lookupGameByCodeAndState(
  gameCode: string,
  stateId: string,
): Promise<{
  game_id: string;
  name: string;
  tickets_per_pack: number | null;
} | null> {
  // Validate game code format (4 digits)
  if (!/^\d{4}$/.test(gameCode)) {
    return null;
  }

  const stateGame = await prisma.lotteryGame.findFirst({
    where: {
      game_code: gameCode,
      state_id: stateId,
      status: "ACTIVE",
    },
    select: {
      game_id: true,
      name: true,
      tickets_per_pack: true,
    },
  });

  return stateGame;
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
