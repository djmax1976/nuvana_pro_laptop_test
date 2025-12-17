/**
 * @test-level UNIT
 * @justification Tests game lookup service logic with mocked database - fast, isolated
 * @story 6.12
 * @enhanced-by workflow-9 on 2025-01-28
 *
 * Unit Tests: Lottery Game Code Lookup Service
 *
 * Tests game code lookup logic:
 * - Lookup game by game code
 * - Validate game code format
 * - Error handling for invalid game codes
 * - Edge cases (boundaries, special characters)
 *
 * Story: 6.12 - Serialized Pack Reception with Batch Processing
 * Priority: P0 (Foundation - Game Code Lookup)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { lookupGameByCode } from "../../../backend/src/services/lottery.service";
import { prisma } from "../../../backend/src/utils/db";

// Mock Prisma - use findFirst for store-scoped lookup
vi.mock("../../../backend/src/utils/db", () => ({
  prisma: {
    lotteryGame: {
      findFirst: vi.fn(),
    },
  },
}));

describe("6.12-UNIT: lookupGameByCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("6.12-UNIT-019: should lookup global game by valid 4-digit game code (no storeId)", async () => {
    // GIVEN: Valid game code and mock global game data
    const gameCode = "0001";
    const mockGlobalGame = {
      game_id: "test-game-id",
      name: "Test Game",
      tickets_per_pack: 150,
    };

    vi.mocked(prisma.lotteryGame.findFirst).mockResolvedValue(
      mockGlobalGame as any,
    );

    // WHEN: Looking up game by code (no storeId)
    const result = await lookupGameByCode(gameCode);

    // THEN: Global game is found and returned correctly
    expect(result.game_id).toBe("test-game-id");
    expect(result.name).toBe("Test Game");
    expect(result.tickets_per_pack).toBe(150);
    expect(result.is_global).toBe(true);
    expect(prisma.lotteryGame.findFirst).toHaveBeenCalledWith({
      where: { game_code: gameCode, store_id: null, status: "ACTIVE" },
      select: {
        game_id: true,
        name: true,
        tickets_per_pack: true,
      },
    });
  });

  it("6.12-UNIT-020: should throw error for invalid game code format (too short)", async () => {
    // GIVEN: Invalid game code (3 digits)
    const gameCode = "001";

    // WHEN: Attempting to lookup
    // THEN: Error is thrown
    await expect(lookupGameByCode(gameCode)).rejects.toThrow(
      "Invalid game code format: 001. Game code must be exactly 4 digits.",
    );
    expect(prisma.lotteryGame.findFirst).not.toHaveBeenCalled();
  });

  it("6.12-UNIT-021: should throw error for invalid game code format (too long)", async () => {
    // GIVEN: Invalid game code (5 digits)
    const gameCode = "00001";

    // WHEN: Attempting to lookup
    // THEN: Error is thrown
    await expect(lookupGameByCode(gameCode)).rejects.toThrow(
      "Invalid game code format: 00001. Game code must be exactly 4 digits.",
    );
    expect(prisma.lotteryGame.findFirst).not.toHaveBeenCalled();
  });

  it("6.12-UNIT-022: should throw error for non-numeric game code", async () => {
    // GIVEN: Invalid game code (non-numeric)
    const gameCode = "ABCD";

    // WHEN: Attempting to lookup
    // THEN: Error is thrown
    await expect(lookupGameByCode(gameCode)).rejects.toThrow(
      "Invalid game code format: ABCD. Game code must be exactly 4 digits.",
    );
    expect(prisma.lotteryGame.findFirst).not.toHaveBeenCalled();
  });

  it("6.12-UNIT-023: should throw error when game code not found (global lookup)", async () => {
    // GIVEN: Valid format game code but not in database
    const gameCode = "9999";

    vi.mocked(prisma.lotteryGame.findFirst).mockResolvedValue(null);

    // WHEN: Attempting to lookup
    // THEN: Error is thrown
    await expect(lookupGameByCode(gameCode)).rejects.toThrow(
      "Game code 9999 not found in database.",
    );
    expect(prisma.lotteryGame.findFirst).toHaveBeenCalledWith({
      where: { game_code: gameCode, store_id: null, status: "ACTIVE" },
      select: {
        game_id: true,
        name: true,
        tickets_per_pack: true,
      },
    });
  });

  it("6.12-UNIT-024: should preserve leading zeros in game code", async () => {
    // GIVEN: Game code with leading zeros
    const gameCode = "0001";
    const mockGame = {
      game_id: "test-game-id",
      name: "Test Game",
      tickets_per_pack: 150,
    };

    vi.mocked(prisma.lotteryGame.findFirst).mockResolvedValue(mockGame as any);

    // WHEN: Looking up game
    const result = await lookupGameByCode(gameCode);

    // THEN: Leading zeros are preserved in lookup
    expect(prisma.lotteryGame.findFirst).toHaveBeenCalledWith({
      where: { game_code: "0001", store_id: null, status: "ACTIVE" },
      select: {
        game_id: true,
        name: true,
        tickets_per_pack: true,
      },
    });
    expect(result.game_id).toBe("test-game-id");
  });

  it("6.12-UNIT-025: should throw error for empty game code", async () => {
    // GIVEN: Empty game code
    const gameCode = "";

    // WHEN: Attempting to lookup
    // THEN: Error is thrown
    await expect(lookupGameByCode(gameCode)).rejects.toThrow(
      "Invalid game code format",
    );
    expect(prisma.lotteryGame.findFirst).not.toHaveBeenCalled();
  });

  it("6.12-UNIT-026: should throw error for whitespace in game code", async () => {
    // GIVEN: Game code with whitespace
    const gameCodes = [" 0001", "0001 ", "00 01", "0001\n"];

    // WHEN: Attempting to lookup each
    // THEN: All should throw error
    for (const code of gameCodes) {
      await expect(lookupGameByCode(code)).rejects.toThrow(
        "Invalid game code format",
      );
    }
    expect(prisma.lotteryGame.findFirst).not.toHaveBeenCalled();
  });

  it("6.12-UNIT-027: should handle boundary game codes (0000 and 9999)", async () => {
    // GIVEN: Boundary game codes
    const mockGame = {
      game_id: "test-game-id",
      name: "Test Game",
      tickets_per_pack: 150,
    };
    vi.mocked(prisma.lotteryGame.findFirst).mockResolvedValue(mockGame as any);

    // WHEN: Looking up minimum game code (0000)
    const resultMin = await lookupGameByCode("0000");

    // THEN: Lookup succeeds
    expect(resultMin.game_id).toBe("test-game-id");
    expect(prisma.lotteryGame.findFirst).toHaveBeenCalledWith({
      where: { game_code: "0000", store_id: null, status: "ACTIVE" },
      select: { game_id: true, name: true, tickets_per_pack: true },
    });

    vi.clearAllMocks();
    vi.mocked(prisma.lotteryGame.findFirst).mockResolvedValue(mockGame as any);

    // WHEN: Looking up maximum game code (9999)
    const resultMax = await lookupGameByCode("9999");

    // THEN: Lookup succeeds
    expect(resultMax.game_id).toBe("test-game-id");
    expect(prisma.lotteryGame.findFirst).toHaveBeenCalledWith({
      where: { game_code: "9999", store_id: null, status: "ACTIVE" },
      select: { game_id: true, name: true, tickets_per_pack: true },
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS (P0 - Mandatory)
  // ═══════════════════════════════════════════════════════════════════════════

  it("6.12-UNIT-SEC-005: [P0] should reject SQL injection patterns in game code", async () => {
    // GIVEN: Game codes with SQL injection patterns
    const sqlInjectionPatterns = [
      "'; DROP TABLE games; --",
      "1' OR '1'='1",
      "0001' UNION SELECT * FROM games --",
    ];

    // WHEN: Attempting to lookup each
    // THEN: All should throw error (format validation prevents SQL injection)
    for (const code of sqlInjectionPatterns) {
      await expect(lookupGameByCode(code)).rejects.toThrow(
        "Invalid game code format",
      );
      expect(
        prisma.lotteryGame.findFirst,
        "Database should not be queried with SQL injection pattern",
      ).not.toHaveBeenCalled();
    }
  });

  it("6.12-UNIT-SEC-006: [P0] should use Prisma ORM (prevents SQL injection)", async () => {
    // GIVEN: Valid game code
    const gameCode = "0001";
    const mockGame = {
      game_id: "test-game-id",
      name: "Test Game",
      tickets_per_pack: 150,
    };
    vi.mocked(prisma.lotteryGame.findFirst).mockResolvedValue(mockGame as any);

    // WHEN: Looking up game
    await lookupGameByCode(gameCode);

    // THEN: Prisma ORM is used (not raw SQL)
    expect(prisma.lotteryGame.findFirst).toHaveBeenCalledWith({
      where: { game_code: gameCode, store_id: null, status: "ACTIVE" }, // Prisma parameterized query
      select: {
        game_id: true,
        name: true,
        tickets_per_pack: true,
      },
    });
    // Verify Prisma is used (not string concatenation or template literals)
    const callArgs = vi.mocked(prisma.lotteryGame.findFirst).mock.calls[0][0];
    expect(
      callArgs!.where!.game_code,
      "Game code should be parameter, not string",
    ).toBe(gameCode);
  });

  it("6.12-UNIT-SEC-007: [P0] should reject XSS patterns in game code", async () => {
    // GIVEN: Game codes with XSS patterns
    const xssPatterns = [
      "<script>",
      "javascript:",
      "onerror=",
      "&#60;script&#62;",
    ];

    // WHEN: Attempting to lookup each
    // THEN: All should throw error (format validation prevents XSS)
    for (const code of xssPatterns) {
      await expect(lookupGameByCode(code)).rejects.toThrow(
        "Invalid game code format",
      );
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASE TESTS (P1)
  // ═══════════════════════════════════════════════════════════════════════════

  it("6.12-UNIT-028: should throw error for null game code", async () => {
    // GIVEN: Null game code
    // WHEN: Attempting to lookup
    // THEN: Error is thrown
    await expect(lookupGameByCode(null as any)).rejects.toThrow(
      "Invalid game code format",
    );
    expect(prisma.lotteryGame.findFirst).not.toHaveBeenCalled();
  });

  it("6.12-UNIT-029: should throw error for undefined game code", async () => {
    // GIVEN: Undefined game code
    // WHEN: Attempting to lookup
    // THEN: Error is thrown
    await expect(lookupGameByCode(undefined as any)).rejects.toThrow(
      "Invalid game code format",
    );
    expect(prisma.lotteryGame.findFirst).not.toHaveBeenCalled();
  });

  it("6.12-UNIT-030: should throw error for number type game code", async () => {
    // GIVEN: Number type instead of string
    const gameCode = 1 as any;

    // WHEN: Attempting to lookup
    // THEN: Error is thrown (must be string)
    await expect(lookupGameByCode(gameCode)).rejects.toThrow(
      "Invalid game code format",
    );
    expect(prisma.lotteryGame.findFirst).not.toHaveBeenCalled();
  });

  it("6.12-UNIT-031: should return correct response structure with tickets_per_pack and is_global", async () => {
    // GIVEN: Valid game code
    const gameCode = "0001";
    const mockGame = {
      game_id: "test-game-id",
      name: "Test Game",
      tickets_per_pack: 150,
    };
    vi.mocked(prisma.lotteryGame.findFirst).mockResolvedValue(mockGame as any);

    // WHEN: Looking up game
    const result = await lookupGameByCode(gameCode);

    // THEN: Response has correct structure including tickets_per_pack and is_global
    expect(result, "Result should have game_id").toHaveProperty("game_id");
    expect(result, "Result should have name").toHaveProperty("name");
    expect(result, "Result should have tickets_per_pack").toHaveProperty(
      "tickets_per_pack",
    );
    expect(result, "Result should have is_global").toHaveProperty("is_global");
    expect(typeof result.game_id, "game_id should be string").toBe("string");
    expect(typeof result.name, "name should be string").toBe("string");
    expect(result.tickets_per_pack, "tickets_per_pack should be 150").toBe(150);
    expect(result.is_global, "is_global should be true for global game").toBe(
      true,
    );
    expect(
      Object.keys(result).length,
      "Result should have game_id, name, tickets_per_pack, and is_global",
    ).toBe(4);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STORE-SCOPED LOOKUP TESTS (P0 - New Tests)
  // ═══════════════════════════════════════════════════════════════════════════

  it("6.12-UNIT-032: [P0] should lookup store-scoped game when storeId provided and store game exists", async () => {
    // GIVEN: Valid game code, storeId, and a store-scoped game exists
    const gameCode = "0001";
    const storeId = "test-store-id";
    const mockStoreGame = {
      game_id: "store-game-id",
      name: "Store Game",
      tickets_per_pack: 100,
      store_id: storeId,
    };

    vi.mocked(prisma.lotteryGame.findFirst).mockResolvedValue(
      mockStoreGame as any,
    );

    // WHEN: Looking up game with storeId
    const result = await lookupGameByCode(gameCode, storeId);

    // THEN: Store-scoped game is returned (not global)
    expect(result.game_id).toBe("store-game-id");
    expect(result.name).toBe("Store Game");
    expect(result.tickets_per_pack).toBe(100);
    expect(result.is_global).toBe(false);
    expect(prisma.lotteryGame.findFirst).toHaveBeenCalledWith({
      where: { game_code: gameCode, store_id: storeId, status: "ACTIVE" },
      select: {
        game_id: true,
        name: true,
        tickets_per_pack: true,
        store_id: true,
      },
    });
  });

  it("6.12-UNIT-033: [P0] should fallback to global game when store-scoped game not found", async () => {
    // GIVEN: Valid game code, storeId, but no store-scoped game exists (only global)
    const gameCode = "0001";
    const storeId = "test-store-id";
    const mockGlobalGame = {
      game_id: "global-game-id",
      name: "Global Game",
      tickets_per_pack: 150,
    };

    // First call (store-scoped lookup) returns null
    // Second call (global lookup) returns the global game
    vi.mocked(prisma.lotteryGame.findFirst)
      .mockResolvedValueOnce(null) // Store-scoped: not found
      .mockResolvedValueOnce(mockGlobalGame as any); // Global: found

    // WHEN: Looking up game with storeId
    const result = await lookupGameByCode(gameCode, storeId);

    // THEN: Global game is returned as fallback
    expect(result.game_id).toBe("global-game-id");
    expect(result.name).toBe("Global Game");
    expect(result.tickets_per_pack).toBe(150);
    expect(result.is_global).toBe(true);

    // Verify both calls were made in order
    expect(prisma.lotteryGame.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.lotteryGame.findFirst).toHaveBeenNthCalledWith(1, {
      where: { game_code: gameCode, store_id: storeId, status: "ACTIVE" },
      select: {
        game_id: true,
        name: true,
        tickets_per_pack: true,
        store_id: true,
      },
    });
    expect(prisma.lotteryGame.findFirst).toHaveBeenNthCalledWith(2, {
      where: { game_code: gameCode, store_id: null, status: "ACTIVE" },
      select: {
        game_id: true,
        name: true,
        tickets_per_pack: true,
      },
    });
  });

  it("6.12-UNIT-034: [P0] should throw error when neither store-scoped nor global game found", async () => {
    // GIVEN: Valid game code, storeId, but no game exists (neither store nor global)
    const gameCode = "9999";
    const storeId = "test-store-id";

    vi.mocked(prisma.lotteryGame.findFirst)
      .mockResolvedValueOnce(null) // Store-scoped: not found
      .mockResolvedValueOnce(null); // Global: not found

    // WHEN: Looking up game with storeId
    // THEN: Error is thrown
    await expect(lookupGameByCode(gameCode, storeId)).rejects.toThrow(
      "Game code 9999 not found in database.",
    );
  });

  it("6.12-UNIT-035: [P0] should return tickets_per_pack as null when not set in database", async () => {
    // GIVEN: Valid game code and a game with null tickets_per_pack
    const gameCode = "0001";
    const mockGame = {
      game_id: "test-game-id",
      name: "Test Game",
      tickets_per_pack: null, // Not set (legacy game)
    };

    vi.mocked(prisma.lotteryGame.findFirst).mockResolvedValue(mockGame as any);

    // WHEN: Looking up game
    const result = await lookupGameByCode(gameCode);

    // THEN: tickets_per_pack is null in response
    expect(result.game_id).toBe("test-game-id");
    expect(result.tickets_per_pack).toBeNull();
    expect(result.is_global).toBe(true);
  });

  it("6.12-UNIT-036: [P0] should prioritize store-scoped game over global game with same code", async () => {
    // GIVEN: Both store-scoped and global games exist with same code
    // This test verifies that store game takes precedence (override behavior)
    const gameCode = "0001";
    const storeId = "test-store-id";
    const mockStoreGame = {
      game_id: "store-game-id",
      name: "Store Override Game",
      tickets_per_pack: 100,
      store_id: storeId,
    };

    // When store game exists, the global lookup should never be reached
    vi.mocked(prisma.lotteryGame.findFirst).mockResolvedValue(
      mockStoreGame as any,
    );

    // WHEN: Looking up game with storeId
    const result = await lookupGameByCode(gameCode, storeId);

    // THEN: Store-scoped game is returned (priority over global)
    expect(result.game_id).toBe("store-game-id");
    expect(result.is_global).toBe(false);

    // Only one call should have been made (store lookup found the game)
    expect(prisma.lotteryGame.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.lotteryGame.findFirst).toHaveBeenCalledWith({
      where: { game_code: gameCode, store_id: storeId, status: "ACTIVE" },
      select: {
        game_id: true,
        name: true,
        tickets_per_pack: true,
        store_id: true,
      },
    });
  });
});
