/**
 * Integration Tests: Lottery Game Code Uniqueness and Constraints
 *
 * Tests database constraints for game_code:
 * - UNIQUE constraint enforcement
 * - NOT NULL constraint enforcement
 * - CHECK constraint for 4-digit format
 * - CHECK constraint for price > 0
 *
 * @test-level INTEGRATION
 * @justification Tests database constraints and Prisma Client operations that require database connection
 * @story 6-13 - Lottery Database Enhancements & Bin Management
 * @priority P0 (Critical - Data Integrity)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createLotteryGame } from "../../support/factories/lottery.factory";

const prisma = new PrismaClient();

// Test data - isolated per test suite
let testGames: any[] = [];

// Test-specific game codes to clean up - unique per test
const TEST_GAME_CODES = [
  "1234",
  "5678",
  "9999",
  "ABCD",
  "9876",
  "0001",
  "0002",
  "0003",
];

// ═══════════════════════════════════════════════════════════════════════════
// TEST SETUP & TEARDOWN
// ═══════════════════════════════════════════════════════════════════════════

beforeAll(async () => {
  // Clean up any leftover test data from previous runs
  await prisma.lotteryPack.deleteMany({
    where: { game: { game_code: { in: TEST_GAME_CODES } } },
  });
  await prisma.lotteryGame.deleteMany({
    where: { game_code: { in: TEST_GAME_CODES } },
  });
});

afterEach(async () => {
  // Clean up after each test to ensure isolation
  if (testGames.length > 0) {
    const gameIds = testGames.map((g) => g.game_id);
    await prisma.lotteryPack.deleteMany({
      where: { game_id: { in: gameIds } },
    });
    await prisma.lotteryGame.deleteMany({
      where: { game_id: { in: gameIds } },
    });
    testGames = [];
  }
});

afterAll(async () => {
  // Final cleanup of any remaining test data
  await prisma.lotteryPack.deleteMany({
    where: { game: { game_code: { in: TEST_GAME_CODES } } },
  });
  await prisma.lotteryGame.deleteMany({
    where: { game_code: { in: TEST_GAME_CODES } },
  });
  await prisma.$disconnect();
});

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("6.13-INTEGRATION: Lottery Game Code Uniqueness and Constraints", () => {
  describe("UNIQUE Constraint", () => {
    it("6.13-INTEGRATION-006: should enforce unique game_code constraint", async () => {
      // GIVEN: A game with game_code "1234"
      const game1 = await createLotteryGame(prisma, {
        game_code: "1234",
        price: 5.0,
      });
      testGames.push(game1);

      // WHEN: Attempting to create another game with the same game_code
      // THEN: Database should reject duplicate game_code
      await expect(
        createLotteryGame(prisma, {
          game_code: "1234",
          price: 10.0,
        }),
      ).rejects.toThrow();
      // afterEach handles cleanup
    });

    it("6.13-INTEGRATION-007: should allow different game codes", async () => {
      // GIVEN: Multiple games with different game codes
      const game1 = await createLotteryGame(prisma, {
        game_code: "1234",
        price: 5.0,
      });
      const game2 = await createLotteryGame(prisma, {
        game_code: "5678",
        price: 10.0,
      });
      testGames = [game1, game2];

      // WHEN: Querying games by game_code
      const foundGame1 = await prisma.lotteryGame.findUnique({
        where: { game_code: "1234" },
      });
      const foundGame2 = await prisma.lotteryGame.findUnique({
        where: { game_code: "5678" },
      });

      // THEN: Both games are found with correct game codes
      expect(foundGame1).not.toBeNull();
      expect(foundGame2).not.toBeNull();
      expect(foundGame1?.game_code).toBe("1234");
      expect(foundGame2?.game_code).toBe("5678");
    });
  });

  describe("NOT NULL Constraints", () => {
    it("6.13-INTEGRATION-008: should enforce game_code NOT NULL constraint", async () => {
      // GIVEN: Attempting to create a game without game_code
      // WHEN: Creating game with null game_code
      // THEN: Database should reject null game_code
      await expect(
        prisma.lotteryGame.create({
          data: {
            game_code: null as any,
            name: "Test Game",
            price: 5.0,
            pack_value: 150,
            // game_code is null - should fail
          },
        }),
      ).rejects.toThrow();
    });

    it("6.13-INTEGRATION-009: should enforce price NOT NULL constraint", async () => {
      // GIVEN: Attempting to create a game without price
      // WHEN: Creating game with null price
      // THEN: Database should reject null price
      await expect(
        prisma.lotteryGame.create({
          data: {
            name: "Test Game",
            game_code: "9999",
            price: null as any,
            pack_value: 150,
            // price is null - should fail
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe("CHECK Constraints", () => {
    it("6.13-INTEGRATION-010: should enforce game_code format constraint (4 digits)", async () => {
      // GIVEN: Attempting to create a game with invalid game_code format
      // WHEN: Creating game with 3-digit game_code
      // THEN: Database should reject invalid format
      await expect(
        createLotteryGame(prisma, {
          game_code: "123", // Invalid: only 3 digits
          price: 5.0,
        }),
      ).rejects.toThrow();

      // WHEN: Creating game with 5-digit game_code
      // THEN: Database should reject invalid format
      await expect(
        createLotteryGame(prisma, {
          game_code: "12345", // Invalid: 5 digits
          price: 5.0,
        }),
      ).rejects.toThrow();

      // WHEN: Creating game with non-numeric game_code
      // THEN: Database should reject invalid format
      await expect(
        createLotteryGame(prisma, {
          game_code: "12AB", // Invalid: contains letters
          price: 5.0,
        }),
      ).rejects.toThrow();
    });

    it("6.13-INTEGRATION-011: should enforce price > 0 constraint", async () => {
      // GIVEN: Attempting to create a game with zero price
      // WHEN: Creating game with price = 0
      // THEN: Database should reject zero price
      await expect(
        createLotteryGame(prisma, {
          game_code: "0001",
          price: 0,
        }),
      ).rejects.toThrow();

      // WHEN: Creating game with negative price
      // THEN: Database should reject negative price
      await expect(
        createLotteryGame(prisma, {
          game_code: "0002",
          price: -5.0,
        }),
      ).rejects.toThrow();
    });

    it("6.13-INTEGRATION-012: should accept valid game_code format and positive price", async () => {
      // GIVEN: Valid game_code and positive price
      // WHEN: Creating game with valid constraints
      const game = await createLotteryGame(prisma, {
        game_code: "0001",
        price: 5.0,
      });
      testGames.push(game);

      // THEN: Game is created successfully
      expect(game).not.toBeNull();
      expect(game.game_code).toBe("0001");
      expect(game.price.toNumber()).toBe(5.0);
    });
  });
});
