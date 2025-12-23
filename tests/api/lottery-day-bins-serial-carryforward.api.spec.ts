/**
 * Lottery Day Bins - Serial Carry-Forward Tests
 *
 * Tests for the fix that ensures ending serials from a closed lottery day
 * are properly carried forward as starting serials for the next day.
 *
 * This addresses the bug where after closing a lottery day, the starting
 * serials would not reflect the previous day's ending serials.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TRACEABILITY MATRIX
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * | Test ID              | Requirement                                  | Priority |
 * |----------------------|----------------------------------------------|----------|
 * | CARRYFW-001          | Starting serial from previous closed day     | P0       |
 * | CARRYFW-002          | Ending serial shows after same-day close     | P0       |
 * | CARRYFW-003          | New day uses previous day's ending serial    | P0       |
 * | CARRYFW-004          | Starting serial fallback to pack serial_start| P1       |
 * | CARRYFW-005          | Multiple packs carry forward independently   | P1       |
 * | CARRYFW-006          | Closed day status shows ending as starting   | P0       |
 *
 * @test-level API Integration
 * @story Lottery Day Serial Carry-Forward Fix
 * @priority P0 (Critical - Business Logic)
 * @security RLS enforcement, store isolation
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import { withBypassClient } from "../support/prisma-bypass";

/**
 * Generate a unique 4-digit game code for test isolation
 */
function generateUniqueGameCode(): string {
  const random = Math.floor(1000 + Math.random() * 9000);
  return random.toString();
}

/**
 * Generate a unique pin hash to avoid constraint violations
 */
function generateUniquePinHash(): string {
  const random = Math.random().toString(36).substring(2, 15);
  const timestamp = Date.now().toString(36);
  return `$2b$10$test${random}${timestamp}`.substring(0, 60);
}

/**
 * Get a date string in YYYY-MM-DD format
 */
function getDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Helper to create test data
 */
async function createTestSetup(
  storeId: string,
  userId: string,
  gameCode: string,
  binOrder: number,
) {
  return await withBypassClient(async (tx) => {
    const game = await tx.lotteryGame.create({
      data: {
        name: `Carryforward Test Game ${gameCode}`,
        game_code: gameCode,
        price: 5.0,
        pack_value: 150,
        status: "ACTIVE",
        store_id: storeId,
      },
    });

    const bin = await tx.lotteryBin.create({
      data: {
        store_id: storeId,
        name: `Carryforward Test Bin ${binOrder}`,
        display_order: binOrder,
        is_active: true,
      },
    });

    const pack = await tx.lotteryPack.create({
      data: {
        game_id: game.game_id,
        store_id: storeId,
        pack_number: `CARRYFW-${Date.now()}-${binOrder}`,
        serial_start: "001",
        serial_end: "050",
        status: "ACTIVE",
        activated_at: new Date(),
        current_bin_id: bin.bin_id,
        tickets_sold_count: 0,
      },
    });

    const cashier = await tx.cashier.create({
      data: {
        store_id: storeId,
        employee_id: `${Math.floor(1000 + Math.random() * 9000)}`,
        name: "Carryforward Test Cashier",
        pin_hash: generateUniquePinHash(),
        hired_on: new Date(),
        created_by: userId,
      },
    });

    const shift = await tx.shift.create({
      data: {
        store_id: storeId,
        cashier_id: cashier.cashier_id,
        opened_by: userId,
        status: "OPEN",
        opened_at: new Date(),
        opening_cash: 100.0,
      },
    });

    return { game, bin, pack, cashier, shift };
  });
}

/**
 * Helper to clean up test data
 */
async function cleanupTestData(entities: {
  closingIds?: string[];
  openingIds?: string[];
  shiftIds?: string[];
  cashierIds?: string[];
  packIds?: string[];
  binIds?: string[];
  gameIds?: string[];
  dayPackIds?: string[];
  dayIds?: string[];
}) {
  await withBypassClient(async (tx) => {
    if (entities.openingIds?.length) {
      await tx.lotteryShiftOpening.deleteMany({
        where: { opening_id: { in: entities.openingIds } },
      });
    }
    if (entities.dayPackIds?.length) {
      await tx.lotteryDayPack.deleteMany({
        where: { day_pack_id: { in: entities.dayPackIds } },
      });
    }
    if (entities.dayIds?.length) {
      await tx.lotteryBusinessDay.deleteMany({
        where: { day_id: { in: entities.dayIds } },
      });
    }
    if (entities.closingIds?.length) {
      await tx.lotteryShiftClosing.deleteMany({
        where: { closing_id: { in: entities.closingIds } },
      });
    }
    if (entities.shiftIds?.length) {
      await tx.shift.deleteMany({
        where: { shift_id: { in: entities.shiftIds } },
      });
    }
    if (entities.cashierIds?.length) {
      await tx.cashier.deleteMany({
        where: { cashier_id: { in: entities.cashierIds } },
      });
    }
    if (entities.packIds?.length) {
      await tx.lotteryPack.deleteMany({
        where: { pack_id: { in: entities.packIds } },
      });
    }
    if (entities.binIds?.length) {
      await tx.lotteryBin.deleteMany({
        where: { bin_id: { in: entities.binIds } },
      });
    }
    if (entities.gameIds?.length) {
      await tx.lotteryGame.deleteMany({
        where: { game_id: { in: entities.gameIds } },
      });
    }
  });
}

test.describe("Lottery Day Bins - Serial Carry-Forward", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // CARRYFW-001: Starting serial from previous closed day
  // ═══════════════════════════════════════════════════════════════════════════
  test("CARRYFW-001: [P0] Day bins should use previous closed day's ending serial as starting serial", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A closed lottery day with ending serial "025"
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    const gameCode = generateUniqueGameCode();
    const { game, bin, pack, cashier, shift } = await createTestSetup(
      store.store_id,
      clientUser.user_id,
      gameCode,
      400,
    );

    // Create a closed LotteryBusinessDay with ending_serial
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDateString = getDateString(yesterday);

    const closedDay = await withBypassClient(async (tx) => {
      const day = await tx.lotteryBusinessDay.create({
        data: {
          store_id: store.store_id,
          business_date: new Date(yesterdayDateString + "T00:00:00Z"),
          status: "CLOSED",
          closed_by: clientUser.user_id,
          closed_at: new Date(),
        },
      });

      const dayPack = await tx.lotteryDayPack.create({
        data: {
          day_id: day.day_id,
          pack_id: pack.pack_id,
          bin_id: bin.bin_id,
          starting_serial: "001",
          ending_serial: "025", // This should become today's starting serial
        },
      });

      return { day, dayPack };
    });

    // WHEN: I query today's day bins
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${store.store_id}`,
    );

    // THEN: Starting serial should be yesterday's ending serial
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    const testBin = body.data.bins.find((b: any) => b.bin_id === bin.bin_id);
    expect(testBin, "Test bin should be present").toBeDefined();
    expect(
      testBin.pack.starting_serial,
      "Starting serial should be previous day's ending serial",
    ).toBe("025");

    // Cleanup
    await cleanupTestData({
      dayPackIds: [closedDay.dayPack.day_pack_id],
      dayIds: [closedDay.day.day_id],
      shiftIds: [shift.shift_id],
      cashierIds: [cashier.cashier_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CARRYFW-002: Ending serial shows after same-day close
  // ═══════════════════════════════════════════════════════════════════════════
  test("CARRYFW-002: [P0] After closing today, day bins should show ending serial as starting serial", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: An active pack and shift
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    const gameCode = generateUniqueGameCode();
    const { game, bin, pack, cashier, shift } = await createTestSetup(
      store.store_id,
      clientUser.user_id,
      gameCode,
      401,
    );

    // Close the lottery day
    const closeResponse = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [{ pack_id: pack.pack_id, closing_serial: "030" }],
        entry_method: "SCAN",
      },
    );
    expect(closeResponse.status()).toBe(200);

    // WHEN: I query today's day bins after closing
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${store.store_id}`,
    );

    // THEN: Starting serial should now be the closing serial (carry-forward on same day)
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    const testBin = body.data.bins.find((b: any) => b.bin_id === bin.bin_id);
    expect(testBin, "Test bin should be present").toBeDefined();
    expect(
      testBin.pack.starting_serial,
      "Starting serial should be the closing serial after day close",
    ).toBe("030");

    // Cleanup
    const closings = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findMany({
        where: { shift_id: shift.shift_id },
      });
    });
    const dayPacks = await withBypassClient(async (tx) => {
      return await tx.lotteryDayPack.findMany({
        where: { pack_id: pack.pack_id },
      });
    });
    const days = await withBypassClient(async (tx) => {
      return await tx.lotteryBusinessDay.findMany({
        where: { store_id: store.store_id },
      });
    });

    await cleanupTestData({
      closingIds: closings.map((c) => c.closing_id),
      dayPackIds: dayPacks.map((dp) => dp.day_pack_id),
      dayIds: days.map((d) => d.day_id),
      shiftIds: [shift.shift_id],
      cashierIds: [cashier.cashier_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CARRYFW-003: New day uses previous day's ending serial
  // ═══════════════════════════════════════════════════════════════════════════
  test("CARRYFW-003: [P0] Querying tomorrow's bins should use today's closed ending serial", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Today's lottery day was closed with ending serial "035"
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    const gameCode = generateUniqueGameCode();
    const { game, bin, pack, cashier, shift } = await createTestSetup(
      store.store_id,
      clientUser.user_id,
      gameCode,
      402,
    );

    // Close the lottery day
    const closeResponse = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [{ pack_id: pack.pack_id, closing_serial: "035" }],
        entry_method: "SCAN",
      },
    );
    expect(closeResponse.status()).toBe(200);

    // WHEN: I query tomorrow's day bins
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDateString = getDateString(tomorrow);

    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${store.store_id}?date=${tomorrowDateString}`,
    );

    // THEN: Starting serial should be today's ending serial
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    const testBin = body.data.bins.find((b: any) => b.bin_id === bin.bin_id);
    expect(testBin, "Test bin should be present").toBeDefined();
    expect(
      testBin.pack.starting_serial,
      "Tomorrow's starting serial should be today's ending serial",
    ).toBe("035");

    // Cleanup
    const closings = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findMany({
        where: { shift_id: shift.shift_id },
      });
    });
    const dayPacks = await withBypassClient(async (tx) => {
      return await tx.lotteryDayPack.findMany({
        where: { pack_id: pack.pack_id },
      });
    });
    const days = await withBypassClient(async (tx) => {
      return await tx.lotteryBusinessDay.findMany({
        where: { store_id: store.store_id },
      });
    });

    await cleanupTestData({
      closingIds: closings.map((c) => c.closing_id),
      dayPackIds: dayPacks.map((dp) => dp.day_pack_id),
      dayIds: days.map((d) => d.day_id),
      shiftIds: [shift.shift_id],
      cashierIds: [cashier.cashier_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CARRYFW-004: Fallback to pack serial_start
  // ═══════════════════════════════════════════════════════════════════════════
  test("CARRYFW-004: [P1] Should fallback to pack serial_start when no previous day exists", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A new pack with no previous day history
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    const gameCode = generateUniqueGameCode();
    const { game, bin, pack, cashier, shift } = await createTestSetup(
      store.store_id,
      clientUser.user_id,
      gameCode,
      403,
    );

    // WHEN: I query today's day bins (no previous close exists)
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${store.store_id}`,
    );

    // THEN: Starting serial should be pack's serial_start
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    const testBin = body.data.bins.find((b: any) => b.bin_id === bin.bin_id);
    expect(testBin, "Test bin should be present").toBeDefined();
    expect(
      testBin.pack.starting_serial,
      "Starting serial should fallback to pack's serial_start",
    ).toBe("001");

    // Cleanup
    await cleanupTestData({
      shiftIds: [shift.shift_id],
      cashierIds: [cashier.cashier_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CARRYFW-005: Multiple packs carry forward independently
  // ═══════════════════════════════════════════════════════════════════════════
  test("CARRYFW-005: [P1] Multiple packs should carry forward their ending serials independently", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Two packs closed with different ending serials
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    const gameCode1 = generateUniqueGameCode();
    const gameCode2 = generateUniqueGameCode();

    // Create two separate test setups
    const setup1 = await createTestSetup(
      store.store_id,
      clientUser.user_id,
      gameCode1,
      404,
    );
    const setup2 = await withBypassClient(async (tx) => {
      const game = await tx.lotteryGame.create({
        data: {
          name: `Carryforward Test Game 2 ${gameCode2}`,
          game_code: gameCode2,
          price: 5.0,
          pack_value: 150,
          status: "ACTIVE",
          store_id: store.store_id,
        },
      });

      const bin = await tx.lotteryBin.create({
        data: {
          store_id: store.store_id,
          name: `Carryforward Test Bin 405`,
          display_order: 405,
          is_active: true,
        },
      });

      const pack = await tx.lotteryPack.create({
        data: {
          game_id: game.game_id,
          store_id: store.store_id,
          pack_number: `CARRYFW-${Date.now()}-405`,
          serial_start: "001",
          serial_end: "050",
          status: "ACTIVE",
          activated_at: new Date(),
          current_bin_id: bin.bin_id,
          tickets_sold_count: 0,
        },
      });

      return { game, bin, pack };
    });

    // Close both packs with different ending serials
    const closeResponse = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [
          { pack_id: setup1.pack.pack_id, closing_serial: "015" },
          { pack_id: setup2.pack.pack_id, closing_serial: "040" },
        ],
        entry_method: "SCAN",
      },
    );
    expect(closeResponse.status()).toBe(200);

    // WHEN: I query day bins after closing
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${store.store_id}`,
    );

    // THEN: Each pack should show its own ending serial as starting serial
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    const testBin1 = body.data.bins.find(
      (b: any) => b.bin_id === setup1.bin.bin_id,
    );
    const testBin2 = body.data.bins.find(
      (b: any) => b.bin_id === setup2.bin.bin_id,
    );

    expect(testBin1, "Test bin 1 should be present").toBeDefined();
    expect(
      testBin1.pack.starting_serial,
      "Pack 1 starting serial should be its ending serial",
    ).toBe("015");

    expect(testBin2, "Test bin 2 should be present").toBeDefined();
    expect(
      testBin2.pack.starting_serial,
      "Pack 2 starting serial should be its ending serial",
    ).toBe("040");

    // Cleanup
    const closings = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findMany({
        where: { shift_id: setup1.shift.shift_id },
      });
    });
    const dayPacks = await withBypassClient(async (tx) => {
      return await tx.lotteryDayPack.findMany({
        where: {
          pack_id: { in: [setup1.pack.pack_id, setup2.pack.pack_id] },
        },
      });
    });
    const days = await withBypassClient(async (tx) => {
      return await tx.lotteryBusinessDay.findMany({
        where: { store_id: store.store_id },
      });
    });

    await cleanupTestData({
      closingIds: closings.map((c) => c.closing_id),
      dayPackIds: dayPacks.map((dp) => dp.day_pack_id),
      dayIds: days.map((d) => d.day_id),
      shiftIds: [setup1.shift.shift_id],
      cashierIds: [setup1.cashier.cashier_id],
      packIds: [setup1.pack.pack_id, setup2.pack.pack_id],
      binIds: [setup1.bin.bin_id, setup2.bin.bin_id],
      gameIds: [setup1.game.game_id, setup2.game.game_id],
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CARRYFW-006: Closed day status shows ending as starting
  // ═══════════════════════════════════════════════════════════════════════════
  test("CARRYFW-006: [P0] When day is CLOSED, starting serial should be the ending serial", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A lottery day that was just closed
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    const gameCode = generateUniqueGameCode();
    const { game, bin, pack, cashier, shift } = await createTestSetup(
      store.store_id,
      clientUser.user_id,
      gameCode,
      406,
    );

    // Create a shift opening first
    const opening = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftOpening.create({
        data: {
          shift_id: shift.shift_id,
          pack_id: pack.pack_id,
          opening_serial: "010",
        },
      });
    });

    // Close the lottery day
    const closeResponse = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [{ pack_id: pack.pack_id, closing_serial: "045" }],
        entry_method: "SCAN",
      },
    );
    expect(closeResponse.status()).toBe(200);

    // WHEN: I query the day bins for the same day
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${store.store_id}`,
    );

    // THEN: Starting serial should be the ending serial (not the original opening)
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    const testBin = body.data.bins.find((b: any) => b.bin_id === bin.bin_id);
    expect(testBin, "Test bin should be present").toBeDefined();
    expect(
      testBin.pack.starting_serial,
      "After close, starting serial should be the ending serial, not the original opening",
    ).toBe("045");

    // Verify ending_serial is null (no new closing yet)
    expect(
      testBin.pack.ending_serial,
      "Ending serial should be null after day close",
    ).toBeNull();

    // Cleanup
    const closings = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findMany({
        where: { shift_id: shift.shift_id },
      });
    });
    const dayPacks = await withBypassClient(async (tx) => {
      return await tx.lotteryDayPack.findMany({
        where: { pack_id: pack.pack_id },
      });
    });
    const days = await withBypassClient(async (tx) => {
      return await tx.lotteryBusinessDay.findMany({
        where: { store_id: store.store_id },
      });
    });

    await cleanupTestData({
      openingIds: [opening.opening_id],
      closingIds: closings.map((c) => c.closing_id),
      dayPackIds: dayPacks.map((dp) => dp.day_pack_id),
      dayIds: days.map((d) => d.day_id),
      shiftIds: [shift.shift_id],
      cashierIds: [cashier.cashier_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });
});
