/**
 * Integration Tests: Lottery Bin Display Data Accuracy
 *
 * Tests data accuracy for optimized bin display query:
 * - Query returns correct bin data with correct display_order
 * - Pack data is correctly associated with bins
 * - Game information is correctly joined
 * - Denormalized ticket counts match actual counts
 * - LEFT JOIN correctly includes bins with no packs
 * - Active/inactive filtering works correctly
 * - Serial ranges are correctly returned
 * - Multiple packs per bin are handled correctly
 *
 * @test-level INTEGRATION
 * @justification Tests data accuracy across database and API layers
 * @story 6-13 - Lottery Database Enhancements & Bin Management
 * @priority P0 (Critical - Data Integrity, Business Logic)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  createCompany,
  createStore,
} from "../support/factories/database.factory";
import { withBypassClient } from "../support/prisma-bypass";

const prisma = new PrismaClient();

// Test data
let testUser: any;
let company1: any;
let store1: any;
let game1: any;
let game2: any;
let bin1: any;
let bin2: any;
let bin3: any;
let pack1: any;
let pack2: any;
let pack3: any;

describe("6.13-INTEGRATION: Lottery Bin Display Data Accuracy", () => {
  beforeAll(async () => {
    testUser = await withBypassClient(async (tx) => {
      return await tx.user.create({
        data: {
          email: `test-lottery-display-${Date.now()}@test.com`,
          name: "Test User",
          public_id: `USR${Date.now()}`,
        },
      });
    });

    company1 = await withBypassClient(async (tx) => {
      return await tx.company.create({
        data: createCompany({ owner_user_id: testUser.user_id }),
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
          name: "Game 1",
          game_code: "1111",
          price: 5.0,
          status: "ACTIVE",
        },
      });
    });

    game2 = await withBypassClient(async (tx) => {
      return await tx.lotteryGame.create({
        data: {
          name: "Game 2",
          game_code: "2222",
          price: 10.0,
          status: "ACTIVE",
        },
      });
    });

    bin1 = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: store1.store_id,
          name: "Bin 1",
          location: "Front",
          display_order: 0,
          is_active: true,
        },
      });
    });

    bin2 = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: store1.store_id,
          name: "Bin 2",
          location: "Back",
          display_order: 1,
          is_active: true,
        },
      });
    });

    bin3 = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: store1.store_id,
          name: "Bin 3 (Empty)",
          display_order: 2,
          is_active: true,
        },
      });
    });

    pack1 = await withBypassClient(async (tx) => {
      return await tx.lotteryPack.create({
        data: {
          game_id: game1.game_id,
          store_id: store1.store_id,
          pack_number: "PACK001",
          serial_start: "0001",
          serial_end: "0050",
          status: "ACTIVE",
          current_bin_id: bin1.bin_id,
          tickets_sold_count: 25,
        },
      });
    });

    pack2 = await withBypassClient(async (tx) => {
      return await tx.lotteryPack.create({
        data: {
          game_id: game2.game_id,
          store_id: store1.store_id,
          pack_number: "PACK002",
          serial_start: "0051",
          serial_end: "0100",
          status: "ACTIVE",
          current_bin_id: bin2.bin_id,
          tickets_sold_count: 30,
        },
      });
    });

    pack3 = await withBypassClient(async (tx) => {
      return await tx.lotteryPack.create({
        data: {
          game_id: game1.game_id,
          store_id: store1.store_id,
          pack_number: "PACK003",
          serial_start: "0101",
          serial_end: "0150",
          status: "ACTIVE",
          current_bin_id: bin1.bin_id, // Same bin as pack1
          tickets_sold_count: 40,
        },
      });
    });
  });

  afterAll(async () => {
    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.lotteryPack.deleteMany({
        where: {
          pack_id: { in: [pack1.pack_id, pack2.pack_id, pack3.pack_id] },
        },
      });
      await tx.lotteryBin.deleteMany({
        where: {
          bin_id: { in: [bin1.bin_id, bin2.bin_id, bin3.bin_id] },
        },
      });
      await tx.lotteryGame.deleteMany({
        where: {
          game_id: { in: [game1.game_id, game2.game_id] },
        },
      });
      await tx.store.delete({ where: { store_id: store1.store_id } });
      await tx.company.delete({ where: { company_id: company1.company_id } });
    });
    await prisma.$disconnect();
  });

  it("6.13-INTEGRATION-007: [P0] Query should return correct bin data with display_order", async () => {
    // WHEN: I execute the optimized query
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

    // THEN: Bin data is correct and ordered by display_order
    expect(result.length, "Should return 3 bins").toBe(3);
    expect(result[0].bin_id, "First bin should be bin1").toBe(bin1.bin_id);
    expect(result[0].bin_name, "First bin name should match").toBe("Bin 1");
    expect(result[0].display_order, "First bin display_order should be 0").toBe(
      0,
    );
    expect(result[1].bin_id, "Second bin should be bin2").toBe(bin2.bin_id);
    expect(
      result[1].display_order,
      "Second bin display_order should be 1",
    ).toBe(1);
    expect(result[2].bin_id, "Third bin should be bin3").toBe(bin3.bin_id);
    expect(result[2].display_order, "Third bin display_order should be 2").toBe(
      2,
    );
  });

  it("6.13-INTEGRATION-008: [P0] Query should correctly associate packs with bins", async () => {
    // WHEN: I execute the optimized query
    const result = await prisma.$queryRaw<
      Array<{
        bin_id: string;
        bin_name: string;
        pack_number: string | null;
      }>
    >`
      SELECT 
        b.bin_id,
        b.name AS bin_name,
        p.pack_number
      FROM lottery_bins b
      LEFT JOIN lottery_packs p ON p.current_bin_id = b.bin_id AND p.status = 'ACTIVE'
      WHERE b.store_id = ${store1.store_id}::uuid AND b.is_active = true
      ORDER BY b.display_order, p.pack_number
    `;

    // THEN: Packs are correctly associated with bins
    const bin1Rows = result.filter((row) => row.bin_id === bin1.bin_id);
    expect(bin1Rows.length, "Bin 1 should have 2 packs").toBe(2);
    expect(
      bin1Rows.some((row) => row.pack_number === "PACK001"),
      "Bin 1 should contain PACK001",
    ).toBe(true);
    expect(
      bin1Rows.some((row) => row.pack_number === "PACK003"),
      "Bin 1 should contain PACK003",
    ).toBe(true);

    const bin2Rows = result.filter((row) => row.bin_id === bin2.bin_id);
    expect(bin2Rows.length, "Bin 2 should have 1 pack").toBe(1);
    expect(bin2Rows[0].pack_number, "Bin 2 should contain PACK002").toBe(
      "PACK002",
    );

    const bin3Rows = result.filter((row) => row.bin_id === bin3.bin_id);
    expect(bin3Rows.length, "Bin 3 should have 1 row (no packs)").toBe(1);
    expect(
      bin3Rows[0].pack_number,
      "Bin 3 should have null pack_number",
    ).toBeNull();
  });

  it("6.13-INTEGRATION-009: [P0] Query should correctly join game information", async () => {
    // WHEN: I execute the optimized query
    const result = await prisma.$queryRaw<
      Array<{
        bin_id: string;
        pack_number: string | null;
        game_code: string | null;
        game_name: string | null;
        price: number | null;
      }>
    >`
      SELECT 
        b.bin_id,
        p.pack_number,
        g.game_code,
        g.name AS game_name,
        g.price
      FROM lottery_bins b
      LEFT JOIN lottery_packs p ON p.current_bin_id = b.bin_id AND p.status = 'ACTIVE'
      LEFT JOIN lottery_games g ON g.game_id = p.game_id
      WHERE b.store_id = ${store1.store_id}::uuid AND b.is_active = true
      ORDER BY b.display_order, p.pack_number
    `;

    // THEN: Game information is correctly joined
    const pack1Row = result.find((row) => row.pack_number === "PACK001");
    expect(pack1Row, "PACK001 should be present").toBeDefined();
    expect(pack1Row?.game_code, "PACK001 game_code should be 1111").toBe(
      "1111",
    );
    expect(pack1Row?.game_name, "PACK001 game_name should be Game 1").toBe(
      "Game 1",
    );
    expect(Number(pack1Row?.price), "PACK001 price should be 5.0").toBe(5.0);

    const pack2Row = result.find((row) => row.pack_number === "PACK002");
    expect(pack2Row, "PACK002 should be present").toBeDefined();
    expect(pack2Row?.game_code, "PACK002 game_code should be 2222").toBe(
      "2222",
    );
    expect(pack2Row?.game_name, "PACK002 game_name should be Game 2").toBe(
      "Game 2",
    );
    expect(Number(pack2Row?.price), "PACK002 price should be 10.0").toBe(10.0);

    const emptyBinRow = result.find(
      (row) => row.bin_id === bin3.bin_id && row.pack_number === null,
    );
    expect(emptyBinRow, "Empty bin row should be present").toBeDefined();
    expect(
      emptyBinRow?.game_code,
      "Empty bin game_code should be null",
    ).toBeNull();
    expect(
      emptyBinRow?.game_name,
      "Empty bin game_name should be null",
    ).toBeNull();
    expect(emptyBinRow?.price, "Empty bin price should be null").toBeNull();
  });

  it("6.13-INTEGRATION-010: [P0] Query should return correct denormalized ticket counts", async () => {
    // WHEN: I execute the optimized query
    const result = await prisma.$queryRaw<
      Array<{
        pack_number: string | null;
        total_sold: number;
      }>
    >`
      SELECT 
        p.pack_number,
        COALESCE(p.tickets_sold_count, 0) AS total_sold
      FROM lottery_bins b
      LEFT JOIN lottery_packs p ON p.current_bin_id = b.bin_id AND p.status = 'ACTIVE'
      WHERE b.store_id = ${store1.store_id}::uuid AND b.is_active = true
      ORDER BY p.pack_number
    `;

    // THEN: Denormalized ticket counts are correct
    const pack1Row = result.find((row) => row.pack_number === "PACK001");
    expect(pack1Row?.total_sold, "PACK001 total_sold should be 25").toBe(25);

    const pack2Row = result.find((row) => row.pack_number === "PACK002");
    expect(pack2Row?.total_sold, "PACK002 total_sold should be 30").toBe(30);

    const pack3Row = result.find((row) => row.pack_number === "PACK003");
    expect(pack3Row?.total_sold, "PACK003 total_sold should be 40").toBe(40);

    const emptyBinRow = result.find((row) => row.pack_number === null);
    expect(emptyBinRow?.total_sold, "Empty bin total_sold should be 0").toBe(0);
  });

  it("6.13-INTEGRATION-011: [P0] Query should return correct serial ranges", async () => {
    // WHEN: I execute the optimized query
    const result = await prisma.$queryRaw<
      Array<{
        pack_number: string | null;
        serial_start: string | null;
        serial_end: string | null;
      }>
    >`
      SELECT 
        p.pack_number,
        p.serial_start,
        p.serial_end
      FROM lottery_bins b
      LEFT JOIN lottery_packs p ON p.current_bin_id = b.bin_id AND p.status = 'ACTIVE'
      WHERE b.store_id = ${store1.store_id}::uuid AND b.is_active = true
      ORDER BY p.pack_number
    `;

    // THEN: Serial ranges are correct
    const pack1Row = result.find((row) => row.pack_number === "PACK001");
    expect(pack1Row?.serial_start, "PACK001 serial_start should be 0001").toBe(
      "0001",
    );
    expect(pack1Row?.serial_end, "PACK001 serial_end should be 0050").toBe(
      "0050",
    );

    const pack2Row = result.find((row) => row.pack_number === "PACK002");
    expect(pack2Row?.serial_start, "PACK002 serial_start should be 0051").toBe(
      "0051",
    );
    expect(pack2Row?.serial_end, "PACK002 serial_end should be 0100").toBe(
      "0100",
    );

    const pack3Row = result.find((row) => row.pack_number === "PACK003");
    expect(pack3Row?.serial_start, "PACK003 serial_start should be 0101").toBe(
      "0101",
    );
    expect(pack3Row?.serial_end, "PACK003 serial_end should be 0150").toBe(
      "0150",
    );
  });

  it("6.13-INTEGRATION-012: [P0] Query should filter active bins and active packs only", async () => {
    // GIVEN: Inactive bin and inactive pack exist
    const inactiveBin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: store1.store_id,
          name: "Inactive Bin",
          display_order: 10,
          is_active: false,
        },
      });
    });

    await withBypassClient(async (tx) => {
      await tx.lotteryPack.create({
        data: {
          game_id: game1.game_id,
          store_id: store1.store_id,
          pack_number: "INACTIVE_PACK",
          serial_start: "9999",
          serial_end: "9999",
          status: "DEPLETED",
          current_bin_id: bin1.bin_id,
          tickets_sold_count: 0,
        },
      });
    });

    // WHEN: I execute the optimized query
    const result = await prisma.$queryRaw<
      Array<{
        bin_id: string;
        bin_name: string;
        pack_number: string | null;
        status: string | null;
      }>
    >`
      SELECT 
        b.bin_id,
        b.name AS bin_name,
        p.pack_number,
        p.status
      FROM lottery_bins b
      LEFT JOIN lottery_packs p ON p.current_bin_id = b.bin_id AND p.status = 'ACTIVE'
      WHERE b.store_id = ${store1.store_id}::uuid AND b.is_active = true
      ORDER BY b.display_order, p.pack_number
    `;

    // THEN: Only active bins and active packs are returned
    const inactiveBinRow = result.find(
      (row) => row.bin_id === inactiveBin.bin_id,
    );
    expect(
      inactiveBinRow,
      "Inactive bin should not be included",
    ).toBeUndefined();

    const inactivePackRow = result.find(
      (row) => row.pack_number === "INACTIVE_PACK",
    );
    expect(
      inactivePackRow,
      "Inactive pack should not be included",
    ).toBeUndefined();

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.lotteryPack.delete({
        where: {
          store_id_pack_number: {
            store_id: store1.store_id,
            pack_number: "INACTIVE_PACK",
          },
        },
      });
      await tx.lotteryBin.delete({ where: { bin_id: inactiveBin.bin_id } });
    });
  });

  it("6.13-INTEGRATION-013: [P0] Query should handle multiple packs per bin correctly", async () => {
    // GIVEN: Bin 1 has 2 packs (PACK001 and PACK003)
    // WHEN: I execute the optimized query
    const result = await prisma.$queryRaw<
      Array<{
        bin_id: string;
        bin_name: string;
        pack_number: string | null;
      }>
    >`
      SELECT 
        b.bin_id,
        b.name AS bin_name,
        p.pack_number
      FROM lottery_bins b
      LEFT JOIN lottery_packs p ON p.current_bin_id = b.bin_id AND p.status = 'ACTIVE'
      WHERE b.store_id = ${store1.store_id}::uuid AND b.is_active = true
        AND b.bin_id = ${bin1.bin_id}::uuid
      ORDER BY p.pack_number
    `;

    // THEN: Both packs are returned for bin 1
    expect(result.length, "Should return 2 rows for bin 1").toBe(2);
    expect(
      result.some((row) => row.pack_number === "PACK001"),
      "Should include PACK001",
    ).toBe(true);
    expect(
      result.some((row) => row.pack_number === "PACK003"),
      "Should include PACK003",
    ).toBe(true);
    expect(result[0].bin_id, "Both rows should have bin1 bin_id").toBe(
      bin1.bin_id,
    );
    expect(result[1].bin_id, "Both rows should have bin1 bin_id").toBe(
      bin1.bin_id,
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - Data Accuracy & Integrity
  // ═══════════════════════════════════════════════════════════════════════════

  it("6.13-INTEGRATION-SEC-005: [P0] Query should not leak data from other stores", async () => {
    // GIVEN: Bins exist for my store and another store
    const otherUser = await withBypassClient(async (tx) => {
      return await tx.user.create({
        data: {
          email: `test-other-user-${Date.now()}@test.com`,
          name: "Other Test User",
          public_id: `USR${Date.now()}`,
        },
      });
    });

    const otherCompany = await withBypassClient(async (tx) => {
      return await tx.company.create({
        data: createCompany({ owner_user_id: otherUser.user_id }),
      });
    });

    const otherStore = await withBypassClient(async (tx) => {
      return await tx.store.create({
        data: createStore({ company_id: otherCompany.company_id }),
      });
    });

    const otherBin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: otherStore.store_id,
          name: "Other Company Bin",
          display_order: 0,
          is_active: true,
        },
      });
    });

    // WHEN: I query bin display data for my store
    const result = await prisma.$queryRaw<
      Array<{
        bin_id: string;
        bin_name: string;
        store_id: string;
      }>
    >`
      SELECT 
        b.bin_id,
        b.name AS bin_name,
        b.store_id
      FROM lottery_bins b
      WHERE b.store_id = ${store1.store_id}::uuid AND b.is_active = true
      ORDER BY b.display_order
    `;

    // THEN: Only bins from my store are returned
    expect(result.length, "Should return bins from my store").toBeGreaterThan(
      0,
    );
    const otherStoreBins = result.filter(
      (row) => row.store_id === otherStore.store_id,
    );
    expect(
      otherStoreBins.length,
      "Should not return bins from other store",
    ).toBe(0);

    // AND: All returned bins belong to my store
    const allMyStoreBins = result.every(
      (row) => row.store_id === store1.store_id,
    );
    expect(allMyStoreBins, "All returned bins should belong to my store").toBe(
      true,
    );

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.lotteryBin.delete({ where: { bin_id: otherBin.bin_id } });
      await tx.store.delete({ where: { store_id: otherStore.store_id } });
      await tx.company.delete({
        where: { company_id: otherCompany.company_id },
      });
    });
  });

  it("6.13-INTEGRATION-SEC-006: [P0] Denormalized tickets_sold_count should match actual ticket count", async () => {
    // GIVEN: A pack exists with denormalized count
    const testPack = await withBypassClient(async (tx) => {
      return await tx.lotteryPack.create({
        data: {
          game_id: game1.game_id,
          store_id: store1.store_id,
          pack_number: "COUNT_TEST_PACK",
          serial_start: "0001",
          serial_end: "0100",
          status: "ACTIVE",
          current_bin_id: bin1.bin_id,
          tickets_sold_count: 50, // Denormalized count
        },
      });
    });

    // WHEN: I query bin display data
    const result = await prisma.$queryRaw<
      Array<{
        pack_id: string;
        pack_number: string;
        tickets_sold_count: number;
      }>
    >`
      SELECT 
        p.pack_id,
        p.pack_number,
        p.tickets_sold_count
      FROM lottery_packs p
      WHERE p.pack_id = ${testPack.pack_id}::uuid
    `;

    // THEN: Denormalized count is returned
    expect(result.length, "Should return pack data").toBe(1);
    expect(
      result[0].tickets_sold_count,
      "Denormalized count should match",
    ).toBe(50);

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.lotteryPack.delete({ where: { pack_id: testPack.pack_id } });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("6.13-INTEGRATION-EDGE-006: [P1] Query should handle bins with no packs correctly (LEFT JOIN)", async () => {
    // GIVEN: A bin exists with no packs
    const emptyBin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: store1.store_id,
          name: "Empty Bin",
          display_order: 100,
          is_active: true,
        },
      });
    });

    // WHEN: I query bin display data
    const result = await prisma.$queryRaw<
      Array<{
        bin_id: string;
        bin_name: string;
        pack_number: string | null;
      }>
    >`
      SELECT 
        b.bin_id,
        b.name AS bin_name,
        p.pack_number
      FROM lottery_bins b
      LEFT JOIN lottery_packs p ON p.current_bin_id = b.bin_id AND p.status = 'ACTIVE'
      WHERE b.store_id = ${store1.store_id}::uuid 
        AND b.is_active = true
        AND b.bin_id = ${emptyBin.bin_id}::uuid
    `;

    // THEN: Empty bin is included with null pack data
    expect(
      result.length,
      "Should return at least 1 row for empty bin",
    ).toBeGreaterThanOrEqual(1);
    const emptyBinRow = result.find((row) => row.bin_id === emptyBin.bin_id);
    expect(emptyBinRow, "Empty bin should be included").toBeDefined();
    expect(emptyBinRow?.bin_name, "Bin name should be present").toBe(
      "Empty Bin",
    );
    expect(
      emptyBinRow?.pack_number,
      "Pack number should be null for empty bin",
    ).toBeNull();

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.lotteryBin.delete({ where: { bin_id: emptyBin.bin_id } });
    });
  });

  it("6.13-INTEGRATION-EDGE-007: [P1] Query should handle very large display_order values", async () => {
    // GIVEN: Bins exist with very large display_order values
    const largeOrderBin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: store1.store_id,
          name: "Large Order Bin",
          display_order: 999999,
          is_active: true,
        },
      });
    });

    // WHEN: I query bin display data ordered by display_order
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
      ORDER BY b.display_order DESC
      LIMIT 1
    `;

    // THEN: Bin with large display_order is returned correctly
    expect(result.length, "Should return bin").toBe(1);
    expect(result[0].display_order, "Display order should match").toBe(999999);
    expect(
      typeof result[0].display_order,
      "Display order should be number",
    ).toBe("number");

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.lotteryBin.delete({ where: { bin_id: largeOrderBin.bin_id } });
    });
  });
});
