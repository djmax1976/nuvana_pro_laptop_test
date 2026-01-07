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
 * Calculate expected ticket count using serial difference
 *
 * Formula: tickets_sold = closing_serial - opening_serial
 *
 * The opening serial represents the NEXT ticket to be sold (first unsold),
 * and the closing serial represents the NEXT ticket to be sold after sales.
 * The difference gives the exact count of tickets sold during the period.
 *
 * Serial Position Semantics:
 * - Opening serial: Position of the first ticket available for sale
 * - Closing serial: Position after the last ticket sold (next available)
 *
 * Examples:
 * - Opening: 0, Closing: 0 = 0 tickets sold (no sales, still at position 0)
 * - Opening: 0, Closing: 1 = 1 ticket sold (ticket #0 sold, now at position 1)
 * - Opening: 0, Closing: 15 = 15 tickets sold (tickets #0-14 sold)
 * - Opening: 5, Closing: 10 = 5 tickets sold (tickets #5-9 sold)
 * - Opening: 45, Closing: 90 = 45 tickets sold (tickets #45-89 sold)
 *
 * @param openingSerial - Opening serial position (string, e.g., "000")
 * @param closingSerial - Closing serial position (string, e.g., "015")
 * @returns Expected count of tickets sold (never negative)
 * @throws Error if serials are not numeric
 *
 * SEC-014: INPUT_VALIDATION - Strict numeric validation with type coercion prevention
 * API-003: ERROR_HANDLING - Clear error message for invalid input with context
 */
export function calculateExpectedCount(
  openingSerial: string,
  closingSerial: string,
): number {
  // SEC-014: Validate input types before processing
  if (typeof openingSerial !== "string" || typeof closingSerial !== "string") {
    throw new Error(
      `Invalid serial type: opening=${typeof openingSerial}, closing=${typeof closingSerial}. Serials must be strings.`,
    );
  }

  // SEC-014: Parse with explicit radix to prevent octal interpretation
  const openingSerialNum = parseInt(openingSerial, 10);
  const closingSerialNum = parseInt(closingSerial, 10);

  // SEC-014: Strict NaN validation using Number.isNaN (not global isNaN)
  if (Number.isNaN(openingSerialNum) || Number.isNaN(closingSerialNum)) {
    throw new Error(
      `Invalid serial format: opening="${openingSerial}", closing="${closingSerial}". Serials must be numeric strings.`,
    );
  }

  // SEC-014: Validate serial range (reasonable bounds check)
  const MAX_SERIAL = 999;
  if (
    openingSerialNum < 0 ||
    openingSerialNum > MAX_SERIAL ||
    closingSerialNum < 0 ||
    closingSerialNum > MAX_SERIAL
  ) {
    throw new Error(
      `Serial out of valid range [0-${MAX_SERIAL}]: opening=${openingSerialNum}, closing=${closingSerialNum}.`,
    );
  }

  // Calculate tickets sold: closing - opening
  // This gives the exact count of tickets sold during the period
  // Example: opening=0, closing=15 means tickets 0-14 were sold = 15 tickets
  const ticketsSold = closingSerialNum - openingSerialNum;

  // Ensure non-negative result (closing should never be less than opening)
  // Math.max provides defense-in-depth against data integrity issues
  return Math.max(0, ticketsSold);
}

/**
 * Calculate expected ticket count for DEPLETED packs (manual or auto sold-out)
 *
 * Formula: tickets_sold = (serial_end + 1) - opening_serial
 *
 * IMPORTANT: This function is specifically for DEPLETION scenarios where:
 * 1. Manual depletion - user marks pack as "sold out"
 * 2. Auto depletion - new pack activated in same bin, old pack auto-closes
 *
 * In depletion cases, serial_end represents the LAST ticket INDEX (e.g., "014" for
 * a 15-ticket pack), NOT the next position. Therefore we add 1 to convert from
 * last-index to count.
 *
 * This differs from normal scanning where the closing serial IS the next position.
 *
 * Serial Position Semantics for Depletion:
 * - Opening serial: Position of the first ticket available for sale
 * - Serial end: LAST ticket index in the pack (needs +1 for count)
 *
 * Examples (15-ticket pack with serial_end="014"):
 * - Opening: "000", serial_end: "014" → (14 + 1) - 0 = 15 tickets sold (full pack)
 * - Opening: "005", serial_end: "014" → (14 + 1) - 5 = 10 tickets sold (partial)
 * - Opening: "010", serial_end: "014" → (14 + 1) - 10 = 5 tickets sold (end of pack)
 *
 * @param openingSerial - Opening serial position (string, e.g., "000")
 * @param serialEnd - The pack's last ticket INDEX (string, e.g., "014" for 15-ticket pack)
 * @returns Expected count of tickets sold (never negative)
 * @throws Error if serials are not numeric or out of range
 *
 * SEC-014: INPUT_VALIDATION - Strict numeric validation with type coercion prevention
 * API-003: ERROR_HANDLING - Clear error message for invalid input with context
 */
export function calculateExpectedCountForDepletion(
  openingSerial: string,
  serialEnd: string,
): number {
  // SEC-014: Validate input types before processing
  if (typeof openingSerial !== "string" || typeof serialEnd !== "string") {
    throw new Error(
      `Invalid serial type: opening=${typeof openingSerial}, serialEnd=${typeof serialEnd}. Serials must be strings.`,
    );
  }

  // SEC-014: Parse with explicit radix to prevent octal interpretation
  const openingSerialNum = parseInt(openingSerial, 10);
  const serialEndNum = parseInt(serialEnd, 10);

  // SEC-014: Strict NaN validation using Number.isNaN (not global isNaN)
  if (Number.isNaN(openingSerialNum) || Number.isNaN(serialEndNum)) {
    throw new Error(
      `Invalid serial format: opening="${openingSerial}", serialEnd="${serialEnd}". Serials must be numeric strings.`,
    );
  }

  // SEC-014: Validate serial range (reasonable bounds check)
  const MAX_SERIAL = 999;
  if (
    openingSerialNum < 0 ||
    openingSerialNum > MAX_SERIAL ||
    serialEndNum < 0 ||
    serialEndNum > MAX_SERIAL
  ) {
    throw new Error(
      `Serial out of valid range [0-${MAX_SERIAL}]: opening=${openingSerialNum}, serialEnd=${serialEndNum}.`,
    );
  }

  // Depletion formula: (serial_end + 1) - opening = tickets sold
  // serial_end is the LAST ticket index, so +1 converts to count
  // Example: serial_end=14, opening=0 → (14+1)-0 = 15 tickets (full 15-ticket pack)
  const ticketsSold = serialEndNum + 1 - openingSerialNum;

  // Ensure non-negative result (serial_end+1 should never be less than opening)
  // Math.max provides defense-in-depth against data integrity issues
  return Math.max(0, ticketsSold);
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
 * Game lookup result with priority and scope information
 *
 * @enterprise-standards
 * - DB-001: ORM_USAGE - All lookups via Prisma ORM
 * - DB-006: TENANT_ISOLATION - Games scoped to state/store
 */
export interface BatchGameLookupResult {
  game_id: string;
  game_code: string;
  name: string;
  tickets_per_pack: number | null;
  scope_type: GameScopeType;
  state_id: string | null;
  store_id: string | null;
}

/**
 * Batch lookup games by codes with proper scope priority
 *
 * Performs a single database query to fetch all games matching the provided codes,
 * then applies scope priority (STATE > STORE > GLOBAL) to return the best match
 * for each game code.
 *
 * This function eliminates N+1 queries when processing batch pack receptions.
 * Instead of N calls to lookupGameByCode, use one call to lookupGamesByCodesBatch.
 *
 * Scope Priority (highest to lowest):
 * 1. STATE-scoped games (games tied to the store's state)
 * 2. STORE-scoped games (games tied directly to the store)
 * 3. GLOBAL games (legacy games with no state/store scope)
 *
 * @enterprise-standards
 * - DB-001: ORM_USAGE - Uses Prisma ORM with parameterized queries
 * - DB-006: TENANT_ISOLATION - Enforces state/store scoping
 * - SEC-006: SQL_INJECTION - No raw SQL, all params bound via Prisma
 * - API-003: ERROR_HANDLING - Returns Map (no throws), caller handles missing
 *
 * @param gameCodes - Array of 4-digit game codes to lookup
 * @param storeId - Store ID for scope context
 * @param stateId - Store's state ID for state-scoped lookups
 * @returns Map of game_code -> game data (missing codes not in map)
 *
 * @example
 * ```typescript
 * const gameMap = await lookupGamesByCodesBatch(
 *   ['0001', '0002', '0003'],
 *   storeId,
 *   stateId
 * );
 * const game = gameMap.get('0001'); // undefined if not found
 * ```
 */
export async function lookupGamesByCodesBatch(
  gameCodes: string[],
  storeId: string,
  stateId: string | null,
): Promise<Map<string, BatchGameLookupResult>> {
  // Input validation: filter to valid 4-digit codes only
  const validCodes = Array.from(
    new Set(gameCodes.filter((code) => /^\d{4}$/.test(code))),
  );

  if (validCodes.length === 0) {
    return new Map();
  }

  // Single query to fetch ALL potential matches across all scopes
  // Uses OR conditions to get state-scoped, store-scoped, and global games
  const games = await prisma.lotteryGame.findMany({
    where: {
      game_code: { in: validCodes },
      status: "ACTIVE",
      OR: [
        // State-scoped games (highest priority)
        ...(stateId ? [{ state_id: stateId, store_id: null }] : []),
        // Store-scoped games (medium priority)
        { store_id: storeId, state_id: null },
        // Global games (lowest priority, legacy)
        { state_id: null, store_id: null },
      ],
    },
    select: {
      game_id: true,
      game_code: true,
      name: true,
      tickets_per_pack: true,
      state_id: true,
      store_id: true,
    },
  });

  // Build result map with scope priority
  // Process in reverse priority order so higher priority overwrites lower
  const resultMap = new Map<string, BatchGameLookupResult>();

  // Pass 1: Add GLOBAL games (lowest priority)
  for (const game of games) {
    if (game.state_id === null && game.store_id === null) {
      resultMap.set(game.game_code, {
        game_id: game.game_id,
        game_code: game.game_code,
        name: game.name,
        tickets_per_pack: game.tickets_per_pack,
        scope_type: "GLOBAL",
        state_id: null,
        store_id: null,
      });
    }
  }

  // Pass 2: Add STORE games (medium priority, overwrites GLOBAL)
  for (const game of games) {
    if (game.store_id === storeId && game.state_id === null) {
      resultMap.set(game.game_code, {
        game_id: game.game_id,
        game_code: game.game_code,
        name: game.name,
        tickets_per_pack: game.tickets_per_pack,
        scope_type: "STORE",
        state_id: null,
        store_id: game.store_id,
      });
    }
  }

  // Pass 3: Add STATE games (highest priority, overwrites STORE/GLOBAL)
  for (const game of games) {
    if (game.state_id === stateId && game.store_id === null) {
      resultMap.set(game.game_code, {
        game_id: game.game_id,
        game_code: game.game_code,
        name: game.name,
        tickets_per_pack: game.tickets_per_pack,
        scope_type: "STATE",
        state_id: game.state_id,
        store_id: null,
      });
    }
  }

  return resultMap;
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
