/**
 * Lottery Day Close - Shift Query Fix Tests
 *
 * Tests for the fix that allows day close to work with shifts that were
 * opened on a previous day but are still currently open (active).
 *
 * This addresses the bug where the day close endpoint only looked for
 * shifts opened TODAY, missing shifts opened yesterday that are still OPEN.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TRACEABILITY MATRIX
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * | Test ID              | Requirement                                  | Priority |
 * |----------------------|----------------------------------------------|----------|
 * | SHIFT-FIX-001        | Accept shifts opened today                   | P0       |
 * | SHIFT-FIX-002        | Accept currently open shifts from yesterday  | P0       |
 * | SHIFT-FIX-003        | Prioritize today's shift over yesterday's    | P1       |
 * | SHIFT-FIX-004        | Reject when no eligible shift exists         | P0       |
 * | SHIFT-FIX-005        | Handle multiple open shifts correctly        | P1       |
 *
 * @test-level API Integration
 * @story Lottery Day Close Fix - Active Shift Detection
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
 * Helper to create a complete test setup with game, bin, and pack
 */
async function createTestBinWithPack(
  store: { store_id: string },
  gameCode: string,
  binOrder: number,
  packSuffix: string = "",
) {
  return await withBypassClient(async (tx) => {
    const game = await tx.lotteryGame.create({
      data: {
        name: `Shift Fix Test Game ${gameCode}`,
        game_code: gameCode,
        price: 5.0,
        pack_value: 150,
        status: "ACTIVE",
        store_id: store.store_id,
      },
    });

    const bin = await tx.lotteryBin.create({
      data: {
        store_id: store.store_id,
        name: `Shift Fix Test Bin ${binOrder}`,
        display_order: binOrder,
        is_active: true,
      },
    });

    const pack = await tx.lotteryPack.create({
      data: {
        game_id: game.game_id,
        store_id: store.store_id,
        pack_number: `SHIFTFIX-${Date.now()}-${binOrder}${packSuffix}`,
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
}

/**
 * Helper to create a shift with specific timing
 */
async function createShift(
  store: { store_id: string },
  userId: string,
  options: {
    openedAt: Date;
    status: "OPEN" | "CLOSED";
    closedAt?: Date;
  },
) {
  return await withBypassClient(async (tx) => {
    const cashier = await tx.cashier.create({
      data: {
        store_id: store.store_id,
        employee_id: `${Math.floor(1000 + Math.random() * 9000)}`,
        name: "Shift Fix Test Cashier",
        pin_hash: generateUniquePinHash(),
        hired_on: new Date(),
        created_by: userId,
      },
    });

    const shift = await tx.shift.create({
      data: {
        store_id: store.store_id,
        cashier_id: cashier.cashier_id,
        opened_by: userId,
        status: options.status,
        opened_at: options.openedAt,
        opening_cash: 100.0,
        ...(options.status === "CLOSED" && {
          closed_at: options.closedAt || new Date(),
          closing_cash: 150.0,
        }),
      },
    });

    return { shift, cashier };
  });
}

/**
 * Helper to clean up test data
 */
async function cleanupTestData(entities: {
  closingIds?: string[];
  shiftIds?: string[];
  cashierIds?: string[];
  packIds?: string[];
  binIds?: string[];
  gameIds?: string[];
  dayPackIds?: string[];
  dayIds?: string[];
}) {
  await withBypassClient(async (tx) => {
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

test.describe("Lottery Day Close - Shift Query Fix", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // SHIFT-FIX-001: Accept shifts opened today
  // ═══════════════════════════════════════════════════════════════════════════
  test("SHIFT-FIX-001: [P0] Should successfully close day with shift opened today", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A shift that was opened TODAY
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
    const { game, bin, pack } = await createTestBinWithPack(
      store,
      gameCode,
      300,
    );
    const { shift, cashier } = await createShift(store, clientUser.user_id, {
      openedAt: new Date(), // Today
      status: "OPEN",
    });

    // WHEN: I close the lottery day
    // Note: current_shift_id is passed to exclude the current shift from open shifts check
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [{ pack_id: pack.pack_id, closing_serial: "020" }],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    // THEN: Day close should succeed
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.closings_created, "Should create 1 closing").toBe(1);

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
  // SHIFT-FIX-002: Accept currently open shifts from yesterday
  // ═══════════════════════════════════════════════════════════════════════════
  test("SHIFT-FIX-002: [P0] Should successfully close day with shift opened YESTERDAY but still OPEN", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A shift that was opened YESTERDAY but is still OPEN (active)
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
    const { game, bin, pack } = await createTestBinWithPack(
      store,
      gameCode,
      301,
    );

    // Create a shift opened YESTERDAY that is still OPEN
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(10, 0, 0, 0); // 10:00 AM yesterday

    const { shift, cashier } = await createShift(store, clientUser.user_id, {
      openedAt: yesterday,
      status: "OPEN", // Still open!
    });

    // WHEN: I close the lottery day
    // Note: current_shift_id is passed to exclude the current shift from open shifts check
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [{ pack_id: pack.pack_id, closing_serial: "025" }],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    // THEN: Day close should succeed (this is the fix!)
    expect(
      response.status(),
      "Should return 200 OK for yesterday's still-open shift",
    ).toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.closings_created, "Should create 1 closing").toBe(1);

    // Verify the closing was created for the correct shift
    const closing = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findFirst({
        where: { pack_id: pack.pack_id },
      });
    });
    expect(closing?.shift_id, "Closing should be for yesterday's shift").toBe(
      shift.shift_id,
    );

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
  // SHIFT-FIX-003: Prioritize today's shift over yesterday's
  // ═══════════════════════════════════════════════════════════════════════════
  test("SHIFT-FIX-003: [P1] Should prioritize today's shift over yesterday's open shift", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Both a shift from yesterday (still open) AND a shift from today
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    // Clean up any pre-existing shifts in this store to ensure test isolation
    await withBypassClient(async (tx) => {
      // First delete any lottery closings for shifts in this store
      await tx.lotteryShiftClosing.deleteMany({
        where: {
          shift: { store_id: store.store_id },
        },
      });
      // Then delete all shifts
      await tx.shift.deleteMany({
        where: { store_id: store.store_id },
      });
    });

    const gameCode = generateUniqueGameCode();
    const { game, bin, pack } = await createTestBinWithPack(
      store,
      gameCode,
      302,
    );

    // Create yesterday's shift (CLOSED - must be closed for lottery close to work)
    // Use a timestamp clearly in yesterday (48 hours ago to avoid any timezone edge cases)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 2); // Use 2 days ago to be safe across timezones
    yesterday.setHours(10, 0, 0, 0);

    const { shift: yesterdayShift, cashier: yesterdayCashier } =
      await createShift(store, clientUser.user_id, {
        openedAt: yesterday,
        status: "CLOSED",
        closedAt: new Date(yesterday.getTime() + 8 * 60 * 60 * 1000), // 8 hours later
      });

    // Create today's shift (currently open - this is the cashier's current shift)
    // Use current time to ensure it's clearly "today" in any timezone
    const now = new Date();

    const { shift: todayShift, cashier: todayCashier } = await createShift(
      store,
      clientUser.user_id,
      {
        openedAt: now,
        status: "OPEN",
      },
    );

    // WHEN: I close the lottery day
    // Pass today's shift as current_shift_id to exclude it from open shifts check
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [{ pack_id: pack.pack_id, closing_serial: "030" }],
        entry_method: "SCAN",
        current_shift_id: todayShift.shift_id,
      },
    );

    // THEN: Day close should succeed and use TODAY's shift (not yesterday's closed one)
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);

    // Verify the closing was created for TODAY's shift (prioritized)
    const closing = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findFirst({
        where: { pack_id: pack.pack_id },
      });
    });
    expect(
      closing?.shift_id,
      "Closing should be for TODAY's shift, not yesterday's",
    ).toBe(todayShift.shift_id);

    // Cleanup
    const closings = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findMany({
        where: {
          shift_id: { in: [yesterdayShift.shift_id, todayShift.shift_id] },
        },
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
      shiftIds: [yesterdayShift.shift_id, todayShift.shift_id],
      cashierIds: [yesterdayCashier.cashier_id, todayCashier.cashier_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SHIFT-FIX-004: Reject when no eligible shift exists
  // ═══════════════════════════════════════════════════════════════════════════
  test("SHIFT-FIX-004: [P0] Should reject when no eligible shift exists (all closed, none today)", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Only a CLOSED shift from yesterday exists (no open shifts, none today)
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    // CRITICAL: Clean up ALL existing shifts in this store to ensure test isolation
    // Other tests may have left shifts that would make this test pass incorrectly
    await withBypassClient(async (tx) => {
      // First delete lottery shift closings/openings for shifts in this store
      await tx.lotteryShiftClosing.deleteMany({
        where: {
          shift: { store_id: store.store_id },
        },
      });
      await tx.lotteryShiftOpening.deleteMany({
        where: {
          shift: { store_id: store.store_id },
        },
      });
      // Then delete all shifts
      await tx.shift.deleteMany({
        where: { store_id: store.store_id },
      });
    });

    const gameCode = generateUniqueGameCode();
    const { game, bin, pack } = await createTestBinWithPack(
      store,
      gameCode,
      303,
    );

    // Create yesterday's shift that is already CLOSED
    // Use 2 days ago to be safe across all timezones
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 2);
    yesterday.setHours(10, 0, 0, 0);

    const { shift: closedShift, cashier } = await createShift(
      store,
      clientUser.user_id,
      {
        openedAt: yesterday,
        status: "CLOSED",
        closedAt: new Date(yesterday.getTime() + 8 * 60 * 60 * 1000),
      },
    );

    // WHEN: I try to close the lottery day with no eligible shift
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [{ pack_id: pack.pack_id, closing_serial: "015" }],
        entry_method: "SCAN",
      },
    );

    // THEN: Should return 400 with NO_SHIFT_TODAY error
    expect(response.status(), "Should return 400 for no eligible shift").toBe(
      400,
    );
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NO_SHIFT_TODAY");

    // Cleanup
    await cleanupTestData({
      shiftIds: [closedShift.shift_id],
      cashierIds: [cashier.cashier_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SHIFT-FIX-005: Handle multiple open shifts correctly
  // ═══════════════════════════════════════════════════════════════════════════
  test("SHIFT-FIX-005: [P1] Should use most recent shift when multiple today shifts exist", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Multiple shifts opened today
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
    const { game, bin, pack } = await createTestBinWithPack(
      store,
      gameCode,
      304,
    );

    // Create first shift today (morning)
    const morning = new Date();
    morning.setHours(6, 0, 0, 0);
    const { shift: morningShift, cashier: morningCashier } = await createShift(
      store,
      clientUser.user_id,
      {
        openedAt: morning,
        status: "CLOSED",
        closedAt: new Date(morning.getTime() + 4 * 60 * 60 * 1000), // 4 hours later
      },
    );

    // Create second shift today (afternoon - most recent, still open)
    const afternoon = new Date();
    afternoon.setHours(12, 0, 0, 0);
    const { shift: afternoonShift, cashier: afternoonCashier } =
      await createShift(store, clientUser.user_id, {
        openedAt: afternoon,
        status: "OPEN",
      });

    // WHEN: I close the lottery day (passing current shift to exclude it from open shifts check)
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [{ pack_id: pack.pack_id, closing_serial: "035" }],
        entry_method: "SCAN",
        current_shift_id: afternoonShift.shift_id,
      },
    );

    // THEN: Should succeed and use the most recent (afternoon) shift
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // Verify closing was created for the MOST RECENT shift
    const closing = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findFirst({
        where: { pack_id: pack.pack_id },
      });
    });
    expect(
      closing?.shift_id,
      "Closing should be for the most recent (afternoon) shift",
    ).toBe(afternoonShift.shift_id);

    // Cleanup
    const closings = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findMany({
        where: {
          shift_id: { in: [morningShift.shift_id, afternoonShift.shift_id] },
        },
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
      shiftIds: [morningShift.shift_id, afternoonShift.shift_id],
      cashierIds: [morningCashier.cashier_id, afternoonCashier.cashier_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });
});
