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

// Mock Prisma
vi.mock("../../../backend/src/utils/db", () => ({
  prisma: {
    lotteryGame: {
      findUnique: vi.fn(),
    },
  },
}));

describe("6.12-UNIT: lookupGameByCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("6.12-UNIT-019: should lookup game by valid 4-digit game code", async () => {
    // GIVEN: Valid game code and mock game data
    const gameCode = "0001";
    const mockGame = {
      game_id: "test-game-id",
      name: "Test Game",
    };

    vi.mocked(prisma.lotteryGame.findUnique).mockResolvedValue(mockGame as any);

    // WHEN: Looking up game by code
    const result = await lookupGameByCode(gameCode);

    // THEN: Game is found and returned correctly
    expect(result.game_id).toBe("test-game-id");
    expect(result.name).toBe("Test Game");
    expect(prisma.lotteryGame.findUnique).toHaveBeenCalledWith({
      where: { game_code: gameCode },
      select: {
        game_id: true,
        name: true,
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
    expect(prisma.lotteryGame.findUnique).not.toHaveBeenCalled();
  });

  it("6.12-UNIT-021: should throw error for invalid game code format (too long)", async () => {
    // GIVEN: Invalid game code (5 digits)
    const gameCode = "00001";

    // WHEN: Attempting to lookup
    // THEN: Error is thrown
    await expect(lookupGameByCode(gameCode)).rejects.toThrow(
      "Invalid game code format: 00001. Game code must be exactly 4 digits.",
    );
    expect(prisma.lotteryGame.findUnique).not.toHaveBeenCalled();
  });

  it("6.12-UNIT-022: should throw error for non-numeric game code", async () => {
    // GIVEN: Invalid game code (non-numeric)
    const gameCode = "ABCD";

    // WHEN: Attempting to lookup
    // THEN: Error is thrown
    await expect(lookupGameByCode(gameCode)).rejects.toThrow(
      "Invalid game code format: ABCD. Game code must be exactly 4 digits.",
    );
    expect(prisma.lotteryGame.findUnique).not.toHaveBeenCalled();
  });

  it("6.12-UNIT-023: should throw error when game code not found", async () => {
    // GIVEN: Valid format game code but not in database
    const gameCode = "9999";

    vi.mocked(prisma.lotteryGame.findUnique).mockResolvedValue(null);

    // WHEN: Attempting to lookup
    // THEN: Error is thrown
    await expect(lookupGameByCode(gameCode)).rejects.toThrow(
      "Game code 9999 not found in database.",
    );
    expect(prisma.lotteryGame.findUnique).toHaveBeenCalledWith({
      where: { game_code: gameCode },
      select: {
        game_id: true,
        name: true,
      },
    });
  });

  it("6.12-UNIT-024: should preserve leading zeros in game code", async () => {
    // GIVEN: Game code with leading zeros
    const gameCode = "0001";
    const mockGame = {
      game_id: "test-game-id",
      name: "Test Game",
    };

    vi.mocked(prisma.lotteryGame.findUnique).mockResolvedValue(mockGame as any);

    // WHEN: Looking up game
    const result = await lookupGameByCode(gameCode);

    // THEN: Leading zeros are preserved in lookup
    expect(prisma.lotteryGame.findUnique).toHaveBeenCalledWith({
      where: { game_code: "0001" },
      select: {
        game_id: true,
        name: true,
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
    expect(prisma.lotteryGame.findUnique).not.toHaveBeenCalled();
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
    expect(prisma.lotteryGame.findUnique).not.toHaveBeenCalled();
  });

  it("6.12-UNIT-027: should handle boundary game codes (0000 and 9999)", async () => {
    // GIVEN: Boundary game codes
    const mockGame = {
      game_id: "test-game-id",
      name: "Test Game",
    };
    vi.mocked(prisma.lotteryGame.findUnique).mockResolvedValue(mockGame as any);

    // WHEN: Looking up minimum game code (0000)
    const resultMin = await lookupGameByCode("0000");

    // THEN: Lookup succeeds
    expect(resultMin.game_id).toBe("test-game-id");
    expect(prisma.lotteryGame.findUnique).toHaveBeenCalledWith({
      where: { game_code: "0000" },
      select: { game_id: true, name: true },
    });

    vi.clearAllMocks();
    vi.mocked(prisma.lotteryGame.findUnique).mockResolvedValue(mockGame as any);

    // WHEN: Looking up maximum game code (9999)
    const resultMax = await lookupGameByCode("9999");

    // THEN: Lookup succeeds
    expect(resultMax.game_id).toBe("test-game-id");
    expect(prisma.lotteryGame.findUnique).toHaveBeenCalledWith({
      where: { game_code: "9999" },
      select: { game_id: true, name: true },
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
        prisma.lotteryGame.findUnique,
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
    };
    vi.mocked(prisma.lotteryGame.findUnique).mockResolvedValue(mockGame as any);

    // WHEN: Looking up game
    await lookupGameByCode(gameCode);

    // THEN: Prisma ORM is used (not raw SQL)
    expect(prisma.lotteryGame.findUnique).toHaveBeenCalledWith({
      where: { game_code: gameCode }, // Prisma parameterized query
      select: {
        game_id: true,
        name: true,
      },
    });
    // Verify Prisma is used (not string concatenation or template literals)
    const callArgs = vi.mocked(prisma.lotteryGame.findUnique).mock.calls[0][0];
    expect(
      callArgs.where.game_code,
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
    expect(prisma.lotteryGame.findUnique).not.toHaveBeenCalled();
  });

  it("6.12-UNIT-029: should throw error for undefined game code", async () => {
    // GIVEN: Undefined game code
    // WHEN: Attempting to lookup
    // THEN: Error is thrown
    await expect(lookupGameByCode(undefined as any)).rejects.toThrow(
      "Invalid game code format",
    );
    expect(prisma.lotteryGame.findUnique).not.toHaveBeenCalled();
  });

  it("6.12-UNIT-030: should throw error for number type game code", async () => {
    // GIVEN: Number type instead of string
    const gameCode = 1 as any;

    // WHEN: Attempting to lookup
    // THEN: Error is thrown (must be string)
    await expect(lookupGameByCode(gameCode)).rejects.toThrow(
      "Invalid game code format",
    );
    expect(prisma.lotteryGame.findUnique).not.toHaveBeenCalled();
  });

  it("6.12-UNIT-031: should return correct response structure", async () => {
    // GIVEN: Valid game code
    const gameCode = "0001";
    const mockGame = {
      game_id: "test-game-id",
      name: "Test Game",
    };
    vi.mocked(prisma.lotteryGame.findUnique).mockResolvedValue(mockGame as any);

    // WHEN: Looking up game
    const result = await lookupGameByCode(gameCode);

    // THEN: Response has correct structure
    expect(result, "Result should have game_id").toHaveProperty("game_id");
    expect(result, "Result should have name").toHaveProperty("name");
    expect(typeof result.game_id, "game_id should be string").toBe("string");
    expect(typeof result.name, "name should be string").toBe("string");
    expect(
      Object.keys(result).length,
      "Result should only have game_id and name",
    ).toBe(2);
  });
});
