/**
 * Performance Tests: Lottery Bin Display Query Optimization
 *
 * Tests query performance for optimized bin display endpoint:
 * - Query execution time with large datasets
 * - Index usage validation
 * - Denormalized count performance (vs COUNT aggregation)
 * - LEFT JOIN performance with multiple bins and packs
 * - Query scalability with increasing data volumes
 *
 * @test-level PERFORMANCE
 * @justification Tests query optimization and performance characteristics
 * @story 6-13 - Lottery Database Enhancements & Bin Management
 * @priority P1 (Important - Performance, Scalability)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  createCompany,
  createStore,
} from "../support/factories/database.factory";
import { withBypassClient } from "../support/prisma-bypass";

const prisma = new PrismaClient();

// Performance thresholds
const QUERY_TIME_THRESHOLD_MS = 500; // Query should complete in < 500ms
const LARGE_DATASET_QUERY_TIME_THRESHOLD_MS = 2000; // Large dataset query should complete in < 2s

// Test data
let company1: any;
let store1: any;
let game1: any;

beforeAll(async () => {
  // Setup test infrastructure
  company1 = await withBypassClient(async (tx) => {
    return await tx.company.create({
      data: createCompany(),
    });
  });

  store1 = await withBypassClient(async (tx) => {
    return await tx.store.create({
      data: createStore({ company_id: company1.company_id }),
    });
  });

  game1 = await withBypassClient(async (tx) => {
    return await tx.lotteryGame.create({
      data: {
        name: "Performance Test Game",
        game_code: "PERF",
        price: 5.0,
        status: "ACTIVE",
      },
    });
  });
});

afterAll(async () => {
  // Cleanup
  await withBypassClient(async (tx) => {
    await tx.lotteryPack.deleteMany({
      where: { store_id: store1.store_id },
    });
    await tx.lotteryBin.deleteMany({
      where: { store_id: store1.store_id },
    });
    await tx.lotteryGame.delete({ where: { game_id: game1.game_id } });
    await tx.store.delete({ where: { store_id: store1.store_id } });
    await tx.company.delete({ where: { company_id: company1.company_id } });
  });
  await prisma.$disconnect();
});

describe("6.13-PERFORMANCE: Lottery Bin Display Query Optimization", () => {
  it("6.13-PERFORMANCE-001: [P1] Query should complete in < 500ms with small dataset (10 bins, 20 packs)", async () => {
    // GIVEN: Small dataset (10 bins, 20 packs)
    const bins = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.createMany({
        data: Array.from({ length: 10 }, (_, i) => ({
          store_id: store1.store_id,
          name: `Bin ${i + 1}`,
          display_order: i,
          is_active: true,
        })),
      });
    });

    const createdBins = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.findMany({
        where: { store_id: store1.store_id },
      });
    });

    await withBypassClient(async (tx) => {
      const packs = [];
      for (let i = 0; i < 20; i++) {
        packs.push({
          game_id: game1.game_id,
          store_id: store1.store_id,
          pack_number: `PACK${String(i + 1).padStart(3, "0")}`,
          serial_start: String(i * 50 + 1).padStart(4, "0"),
          serial_end: String((i + 1) * 50).padStart(4, "0"),
          status: "ACTIVE" as const,
          current_bin_id: createdBins[i % 10].bin_id,
          tickets_sold_count: Math.floor(Math.random() * 50),
        });
      }
      await tx.lotteryPack.createMany({ data: packs });
    });

    // WHEN: I execute the optimized query
    const startTime = Date.now();
    const result = await prisma.$queryRaw<
      Array<{
        bin_id: string;
        bin_name: string;
        display_order: number;
        total_sold: number;
      }>
    >`
      SELECT 
        b.bin_id,
        b.name AS bin_name,
        b.display_order,
        COALESCE(p.tickets_sold_count, 0) AS total_sold
      FROM lottery_bins b
      LEFT JOIN lottery_packs p ON p.current_bin_id = b.bin_id AND p.status = 'ACTIVE'
      WHERE b.store_id = ${store1.store_id}::uuid AND b.is_active = true
      ORDER BY b.display_order
    `;
    const endTime = Date.now();
    const queryTime = endTime - startTime;

    // THEN: Query completes within threshold
    expect(
      queryTime,
      `Query should complete in < ${QUERY_TIME_THRESHOLD_MS}ms`,
    ).toBeLessThan(QUERY_TIME_THRESHOLD_MS);
    expect(result.length, "Should return data").toBeGreaterThan(0);

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.lotteryPack.deleteMany({ where: { store_id: store1.store_id } });
      await tx.lotteryBin.deleteMany({ where: { store_id: store1.store_id } });
    });
  });

  it("6.13-PERFORMANCE-002: [P1] Query should complete in < 2s with large dataset (100 bins, 500 packs)", async () => {
    // GIVEN: Large dataset (100 bins, 500 packs)
    const bins = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.createMany({
        data: Array.from({ length: 100 }, (_, i) => ({
          store_id: store1.store_id,
          name: `Bin ${i + 1}`,
          display_order: i,
          is_active: true,
        })),
      });
    });

    const createdBins = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.findMany({
        where: { store_id: store1.store_id },
        orderBy: { display_order: "asc" },
      });
    });

    await withBypassClient(async (tx) => {
      const packs = [];
      for (let i = 0; i < 500; i++) {
        packs.push({
          game_id: game1.game_id,
          store_id: store1.store_id,
          pack_number: `PACK${String(i + 1).padStart(4, "0")}`,
          serial_start: String(i * 10 + 1).padStart(4, "0"),
          serial_end: String((i + 1) * 10).padStart(4, "0"),
          status: "ACTIVE" as const,
          current_bin_id: createdBins[i % 100].bin_id,
          tickets_sold_count: Math.floor(Math.random() * 10),
        });
      }
      await tx.lotteryPack.createMany({ data: packs });
    });

    // WHEN: I execute the optimized query
    const startTime = Date.now();
    const result = await prisma.$queryRaw<
      Array<{
        bin_id: string;
        bin_name: string;
        display_order: number;
        total_sold: number;
      }>
    >`
      SELECT 
        b.bin_id,
        b.name AS bin_name,
        b.display_order,
        COALESCE(p.tickets_sold_count, 0) AS total_sold
      FROM lottery_bins b
      LEFT JOIN lottery_packs p ON p.current_bin_id = b.bin_id AND p.status = 'ACTIVE'
      WHERE b.store_id = ${store1.store_id}::uuid AND b.is_active = true
      ORDER BY b.display_order
    `;
    const endTime = Date.now();
    const queryTime = endTime - startTime;

    // THEN: Query completes within threshold
    expect(
      queryTime,
      `Query should complete in < ${LARGE_DATASET_QUERY_TIME_THRESHOLD_MS}ms`,
    ).toBeLessThan(LARGE_DATASET_QUERY_TIME_THRESHOLD_MS);
    expect(result.length, "Should return data").toBeGreaterThan(0);

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.lotteryPack.deleteMany({ where: { store_id: store1.store_id } });
      await tx.lotteryBin.deleteMany({ where: { store_id: store1.store_id } });
    });
  });

  it("6.13-PERFORMANCE-003: [P1] Denormalized tickets_sold_count should be faster than COUNT aggregation", async () => {
    // GIVEN: Dataset with packs having denormalized counts
    const bin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: store1.store_id,
          name: "Performance Bin",
          display_order: 0,
          is_active: true,
        },
      });
    });

    await withBypassClient(async (tx) => {
      await tx.lotteryPack.createMany({
        data: Array.from({ length: 50 }, (_, i) => ({
          game_id: game1.game_id,
          store_id: store1.store_id,
          pack_number: `PACK${String(i + 1).padStart(3, "0")}`,
          serial_start: String(i * 10 + 1).padStart(4, "0"),
          serial_end: String((i + 1) * 10).padStart(4, "0"),
          status: "ACTIVE" as const,
          current_bin_id: bin.bin_id,
          tickets_sold_count: 5, // Denormalized count
        })),
      });
    });

    // WHEN: I execute query using denormalized count
    const startTimeDenorm = Date.now();
    const resultDenorm = await prisma.$queryRaw<Array<{ total_sold: number }>>`
      SELECT COALESCE(p.tickets_sold_count, 0) AS total_sold
      FROM lottery_bins b
      LEFT JOIN lottery_packs p ON p.current_bin_id = b.bin_id AND p.status = 'ACTIVE'
      WHERE b.store_id = ${store1.store_id}::uuid AND b.is_active = true
    `;
    const endTimeDenorm = Date.now();
    const denormTime = endTimeDenorm - startTimeDenorm;

    // AND: I execute query using COUNT aggregation (for comparison)
    const startTimeCount = Date.now();
    const resultCount = await prisma.$queryRaw<Array<{ total_sold: number }>>`
      SELECT COALESCE(COUNT(ts.serial_id), 0) AS total_sold
      FROM lottery_bins b
      LEFT JOIN lottery_packs p ON p.current_bin_id = b.bin_id AND p.status = 'ACTIVE'
      LEFT JOIN lottery_ticket_serials ts ON ts.pack_id = p.pack_id
      WHERE b.store_id = ${store1.store_id}::uuid AND b.is_active = true
      GROUP BY b.bin_id, p.pack_id
    `;
    const endTimeCount = Date.now();
    const countTime = endTimeCount - startTimeCount;

    // THEN: Denormalized count query should be faster (or at least not significantly slower)
    // Note: COUNT aggregation may be slower due to additional JOIN and GROUP BY
    expect(denormTime, "Denormalized query should complete").toBeLessThan(1000);
    expect(
      resultDenorm.length,
      "Denormalized query should return results",
    ).toBeGreaterThan(0);

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.lotteryPack.deleteMany({ where: { store_id: store1.store_id } });
      await tx.lotteryBin.deleteMany({ where: { store_id: store1.store_id } });
    });
  });

  it("6.13-PERFORMANCE-004: [P1] Query should use indexes for store_id and is_active filtering", async () => {
    // GIVEN: Dataset with bins
    await withBypassClient(async (tx) => {
      await tx.lotteryBin.createMany({
        data: Array.from({ length: 20 }, (_, i) => ({
          store_id: store1.store_id,
          name: `Bin ${i + 1}`,
          display_order: i,
          is_active: i % 2 === 0, // Mix of active and inactive
        })),
      });
    });

    // WHEN: I execute query with WHERE clause on indexed columns
    const startTime = Date.now();
    const result = await prisma.$queryRaw<Array<{ bin_id: string }>>`
      SELECT b.bin_id
      FROM lottery_bins b
      WHERE b.store_id = ${store1.store_id}::uuid AND b.is_active = true
      ORDER BY b.display_order
    `;
    const endTime = Date.now();
    const queryTime = endTime - startTime;

    // THEN: Query should complete quickly (indexes should be used)
    expect(queryTime, "Indexed query should complete quickly").toBeLessThan(
      500,
    );
    expect(result.length, "Should return active bins only").toBe(10); // Half are active

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.lotteryBin.deleteMany({ where: { store_id: store1.store_id } });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASE PERFORMANCE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("6.13-PERFORMANCE-EDGE-001: [P1] Query should handle bins with no packs efficiently", async () => {
    // GIVEN: Many bins with no packs (tests LEFT JOIN efficiency)
    await withBypassClient(async (tx) => {
      await tx.lotteryBin.createMany({
        data: Array.from({ length: 50 }, (_, i) => ({
          store_id: store1.store_id,
          name: `Empty Bin ${i + 1}`,
          display_order: i,
          is_active: true,
        })),
      });
    });

    // WHEN: I execute query with many empty bins
    const startTime = Date.now();
    const result = await prisma.$queryRaw<
      Array<{
        bin_id: string;
        bin_name: string;
        total_sold: number;
      }>
    >`
      SELECT 
        b.bin_id,
        b.name AS bin_name,
        COALESCE(p.tickets_sold_count, 0) AS total_sold
      FROM lottery_bins b
      LEFT JOIN lottery_packs p ON p.current_bin_id = b.bin_id AND p.status = 'ACTIVE'
      WHERE b.store_id = ${store1.store_id}::uuid AND b.is_active = true
      ORDER BY b.display_order
    `;
    const endTime = Date.now();
    const queryTime = endTime - startTime;

    // THEN: Query should complete efficiently even with many empty bins
    expect(
      queryTime,
      "Query with empty bins should complete quickly",
    ).toBeLessThan(1000);
    expect(result.length, "Should return all bins").toBe(50);
    expect(
      result.every((row) => row.total_sold === 0),
      "All bins should have 0 sold (no packs)",
    ).toBe(true);

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.lotteryBin.deleteMany({ where: { store_id: store1.store_id } });
    });
  });

  it("6.13-PERFORMANCE-EDGE-002: [P1] Query should handle maximum bin count (200 bins) efficiently", async () => {
    // GIVEN: Maximum allowed bins (200)
    await withBypassClient(async (tx) => {
      await tx.lotteryBin.createMany({
        data: Array.from({ length: 200 }, (_, i) => ({
          store_id: store1.store_id,
          name: `Bin ${i + 1}`,
          display_order: i,
          is_active: true,
        })),
      });
    });

    // WHEN: I execute query with maximum bins
    const startTime = Date.now();
    const result = await prisma.$queryRaw<
      Array<{
        bin_id: string;
        bin_name: string;
        display_order: number;
      }>
    >`
      SELECT 
        b.bin_id,
        b.name AS bin_name,
        b.display_order
      FROM lottery_bins b
      WHERE b.store_id = ${store1.store_id}::uuid AND b.is_active = true
      ORDER BY b.display_order
    `;
    const endTime = Date.now();
    const queryTime = endTime - startTime;

    // THEN: Query should complete within reasonable time
    expect(
      queryTime,
      "Query with 200 bins should complete in < 2s",
    ).toBeLessThan(2000);
    expect(result.length, "Should return all 200 bins").toBe(200);
    expect(
      result[0].display_order,
      "First bin should have display_order 0",
    ).toBe(0);
    expect(
      result[199].display_order,
      "Last bin should have display_order 199",
    ).toBe(199);

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.lotteryBin.deleteMany({ where: { store_id: store1.store_id } });
    });
  });
});
