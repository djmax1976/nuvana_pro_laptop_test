/**
 * @test-level INTEGRATION
 * @justification Tests game lookup with real database - validates database queries and constraints
 * @story 6.12
 * @enhanced-by workflow-9 on 2025-01-28
 *
 * Integration Tests: Lottery Game Code Lookup
 *
 * Tests game code lookup with database:
 * - Lookup game by game code (database integration)
 * - Error handling for game code not found
 * - Database constraint enforcement
 *
 * Story: 6.12 - Serialized Pack Reception with Batch Processing
 * Priority: P0 (Critical - Database Operations)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { lookupGameByCode } from "../../backend/src/services/lottery.service";
import { createLotteryGame } from "../support/factories/lottery.factory";

const prisma = new PrismaClient();

// Test data
let testGame: any;

beforeAll(async () => {
  // Create test game with game_code
  testGame = await prisma.lotteryGame.create({
    data: {
      name: "Test Game for Lookup",
      game_code: "0001",
      price: 2.0,
    },
  });
});

afterAll(async () => {
  // Cleanup
  if (testGame) {
    await prisma.lotteryGame.delete({
      where: { game_id: testGame.game_id },
    });
  }
  await prisma.$disconnect();
});

describe("6.12-INTEGRATION: lookupGameByCode", () => {
  it("6.12-INTEGRATION-006: should lookup game by game code from database", async () => {
    // GIVEN: Game exists in database with game_code
    const gameCode = "0001";

    // WHEN: Looking up game by code
    const result = await lookupGameByCode(gameCode);

    // THEN: Game is found and returned correctly
    expect(result.game_id).toBe(testGame.game_id);
    expect(result.name).toBe("Test Game for Lookup");
  });

  it("6.12-INTEGRATION-007: should throw error when game code not found in database", async () => {
    // GIVEN: Game code that doesn't exist
    const gameCode = "9999";

    // WHEN: Attempting to lookup
    // THEN: Error is thrown
    await expect(lookupGameByCode(gameCode)).rejects.toThrow(
      "Game code 9999 not found in database.",
    );
  });

  it("6.12-INTEGRATION-008: should handle game codes with leading zeros", async () => {
    // GIVEN: Game code with leading zeros
    const gameCode = "0001";

    // WHEN: Looking up game
    const result = await lookupGameByCode(gameCode);

    // THEN: Game is found correctly (leading zeros preserved)
    expect(result.game_id, "Game should be found with leading zeros").toBe(
      testGame.game_id,
    );
    expect(result.name, "Game name should match").toBe("Test Game for Lookup");
  });

  it("6.12-INTEGRATION-009: should enforce unique constraint on game_code", async () => {
    // GIVEN: Game already exists with game_code "0001"
    // WHEN: Attempting to create another game with same game_code
    await expect(
      prisma.lotteryGame.create({
        data: {
          name: "Duplicate Game Code Test",
          game_code: "0001", // Same as testGame
          price: 2.0,
        },
      }),
    ).rejects.toThrow(); // Should throw unique constraint violation

    // THEN: Only one game with game_code "0001" exists
    const games = await prisma.lotteryGame.findMany({
      where: { game_code: "0001" },
    });
    expect(
      games.length,
      "Unique constraint should prevent duplicate game_code",
    ).toBe(1);
  });

  it("6.12-INTEGRATION-010: should handle multiple games with different game codes", async () => {
    // GIVEN: Multiple games with different game codes
    const game2 = await createLotteryGame(prisma, {
      name: "Test Game 2",
      price: 3.0,
      game_code: "0002",
    });
    const game3 = await createLotteryGame(prisma, {
      name: "Test Game 3",
      price: 4.0,
      game_code: "0003",
    });

    // WHEN: Looking up each game by code
    const result2 = await lookupGameByCode("0002");
    const result3 = await lookupGameByCode("0003");

    // THEN: Each game is found correctly
    expect(result2.game_id, "Game 2 should be found by game_code 0002").toBe(
      game2.game_id,
    );
    expect(result2.name, "Game 2 name should match").toBe("Test Game 2");
    expect(result3.game_id, "Game 3 should be found by game_code 0003").toBe(
      game3.game_id,
    );
    expect(result3.name, "Game 3 name should match").toBe("Test Game 3");

    // Cleanup
    await prisma.lotteryGame.delete({ where: { game_id: game2.game_id } });
    await prisma.lotteryGame.delete({ where: { game_id: game3.game_id } });
  });

  it("6.12-INTEGRATION-011: should handle case sensitivity correctly", async () => {
    // GIVEN: Game code is numeric (no case sensitivity for numbers)
    // Note: Game codes are numeric, so case sensitivity doesn't apply
    // But we should verify the lookup is exact match

    // WHEN: Looking up with exact game code
    const result = await lookupGameByCode("0001");

    // THEN: Game is found
    expect(result.game_id, "Game should be found with exact match").toBe(
      testGame.game_id,
    );
  });

  it("6.12-INTEGRATION-012: should return consistent results on multiple lookups", async () => {
    // GIVEN: Same game code
    const gameCode = "0001";

    // WHEN: Looking up multiple times
    const result1 = await lookupGameByCode(gameCode);
    const result2 = await lookupGameByCode(gameCode);
    const result3 = await lookupGameByCode(gameCode);

    // THEN: All results are identical
    expect(result1.game_id, "First lookup should return correct game_id").toBe(
      testGame.game_id,
    );
    expect(result2.game_id, "Second lookup should return same game_id").toBe(
      result1.game_id,
    );
    expect(result3.game_id, "Third lookup should return same game_id").toBe(
      result1.game_id,
    );
    expect(result1.name, "All lookups should return same name").toBe(
      result2.name,
    );
    expect(result2.name, "All lookups should return same name").toBe(
      result3.name,
    );
  });
});
