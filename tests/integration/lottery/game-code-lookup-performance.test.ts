/**
 * Performance Tests: Lottery Game Code Lookup Queries
 *
 * Tests query performance for game_code lookups:
 * - Index performance for game_code lookups
 * - Query execution time benchmarks
 * - Large dataset performance
 *
 * @test-level INTEGRATION (Performance)
 * @justification Tests database query performance with indexes
 * @story 6-13 - Lottery Database Enhancements & Bin Management
 * @priority P2 (Medium - Performance Optimization)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createLotteryGame } from "../../support/factories/lottery.factory";

const prisma = new PrismaClient();

// Test data - isolated per test suite
let testGames: any[] = [];

// ═══════════════════════════════════════════════════════════════════════════
// TEST SETUP & TEARDOWN
// ═══════════════════════════════════════════════════════════════════════════

beforeAll(async () => {
  // Create test games with various game codes for performance testing
  const gamePromises = [];
  for (let i = 0; i < 100; i++) {
    const gameCode = String(i).padStart(4, "0"); // 0000, 0001, ..., 0099
    gamePromises.push(
      createLotteryGame(prisma, {
        game_code: gameCode,
        price: 5.0 + i,
      }),
    );
  }
  testGames = await Promise.all(gamePromises);
});

afterAll(async () => {
  // Clean up test data
  await prisma.lotteryGame.deleteMany({
    where: { game_id: { in: testGames.map((g) => g.game_id) } },
  });
  await prisma.$disconnect();
});

// ═══════════════════════════════════════════════════════════════════════════
// PERFORMANCE TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("6.13-PERFORMANCE: Lottery Game Code Lookup Performance", () => {
  it("6.13-PERFORMANCE-001: should lookup game by game_code quickly with index", async () => {
    // GIVEN: Games with indexed game_code field
    const targetGameCode = "0050";

    // WHEN: Querying game by game_code
    const startTime = performance.now();
    const game = await prisma.lotteryGame.findUnique({
      where: { game_code: targetGameCode },
    });
    const endTime = performance.now();
    const queryTime = endTime - startTime;

    // THEN: Game is found quickly (index should make this fast)
    expect(game).not.toBeNull();
    expect(game?.game_code).toBe(targetGameCode);
    // Performance assertion: Should complete in under 100ms with proper index
    expect(queryTime).toBeLessThan(100);
  });

  it("6.13-PERFORMANCE-002: should handle multiple game_code lookups efficiently", async () => {
    // GIVEN: Multiple game codes to lookup
    const gameCodes = ["0001", "0025", "0050", "0075", "0099"];

    // WHEN: Querying multiple games by game_code
    const startTime = performance.now();
    const games = await Promise.all(
      gameCodes.map((code) =>
        prisma.lotteryGame.findUnique({
          where: { game_code: code },
        }),
      ),
    );
    const endTime = performance.now();
    const queryTime = endTime - startTime;

    // THEN: All games are found efficiently
    expect(games).toHaveLength(5);
    expect(games.every((g) => g !== null)).toBe(true);
    // Performance assertion: 5 lookups should complete in under 200ms
    expect(queryTime).toBeLessThan(200);
  });

  it("6.13-PERFORMANCE-003: should use index for game_code in WHERE clause", async () => {
    // GIVEN: Query filtering by game_code
    const targetGameCode = "0042";

    // WHEN: Querying with game_code in WHERE clause
    const startTime = performance.now();
    const games = await prisma.lotteryGame.findMany({
      where: { game_code: targetGameCode },
    });
    const endTime = performance.now();
    const queryTime = endTime - startTime;

    // THEN: Query uses index and completes quickly
    expect(games).toHaveLength(1);
    expect(games[0].game_code).toBe(targetGameCode);
    // Performance assertion: Indexed lookup should be fast
    expect(queryTime).toBeLessThan(100);
  });
});
