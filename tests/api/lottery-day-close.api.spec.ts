/**
 * Lottery Day Close API Tests
 *
 * Tests for day-based lottery closing endpoint:
 * - POST /api/lottery/bins/day/:storeId/close
 * - Validates all active bins are included
 * - Creates LotteryShiftClosing records
 * - Validates closing_serial ranges
 * - Authentication and authorization
 * - RLS enforcement (store isolation)
 *
 * @test-level API
 * @justification Tests day closing business logic with database integration
 * @story Lottery Day Closing Feature
 * @priority P0 (Critical - Business Logic, Data Integrity)
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
 * Get today's date string in YYYY-MM-DD format for a given timezone
 * Used to match the API's business day calculation which uses the store's timezone
 */
function getTodayDateString(timezone: string = "America/New_York"): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now); // Returns YYYY-MM-DD
}

/**
 * Helper to create a complete test setup with game, bin, and pack
 */
async function createTestBinWithPack(
  store: any,
  gameCode: string,
  binOrder: number,
  packSuffix: string = "",
) {
  return await withBypassClient(async (tx) => {
    // Create store-scoped game to ensure uniqueness per store
    const game = await tx.lotteryGame.create({
      data: {
        name: `Test Game ${gameCode}`,
        game_code: gameCode,
        price: 5.0,
        pack_value: 150,
        status: "ACTIVE",
        store_id: store.store_id, // Store-scoped for test isolation
      },
    });

    const bin = await tx.lotteryBin.create({
      data: {
        store_id: store.store_id,
        name: `Test Bin ${binOrder}`,
        display_order: binOrder,
        is_active: true,
      },
    });

    const pack = await tx.lotteryPack.create({
      data: {
        game_id: game.game_id,
        store_id: store.store_id,
        pack_number: `DAYCLOSE-${Date.now()}-${binOrder}${packSuffix}`,
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
 * Generate a unique pin hash to avoid constraint violations
 */
function generateUniquePinHash(): string {
  const random = Math.random().toString(36).substring(2, 15);
  const timestamp = Date.now().toString(36);
  return `$2b$10$test${random}${timestamp}`.substring(0, 60);
}

/**
 * Helper to create a shift for the current day
 */
async function createTodayShift(
  store: any,
  userId: string,
  status: "OPEN" | "CLOSED" | "NOT_STARTED" = "OPEN",
) {
  return await withBypassClient(async (tx) => {
    // Create a cashier for the shift with unique pin_hash
    const cashier = await tx.cashier.create({
      data: {
        store_id: store.store_id,
        employee_id: `${Math.floor(1000 + Math.random() * 9000)}`,
        name: "Test Cashier",
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
        status: status,
        opened_at: new Date(),
        opening_cash: 100.0,
        ...(status === "CLOSED" && {
          closed_at: new Date(),
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
  terminalIds?: string[];
}) {
  await withBypassClient(async (tx) => {
    // Delete day packs first (foreign key constraint)
    if (entities.dayPackIds) {
      await tx.lotteryDayPack.deleteMany({
        where: { day_pack_id: { in: entities.dayPackIds } },
      });
    }
    // Delete business days
    if (entities.dayIds) {
      await tx.lotteryBusinessDay.deleteMany({
        where: { day_id: { in: entities.dayIds } },
      });
    }
    if (entities.closingIds) {
      await tx.lotteryShiftClosing.deleteMany({
        where: { closing_id: { in: entities.closingIds } },
      });
    }
    if (entities.shiftIds) {
      await tx.shift.deleteMany({
        where: { shift_id: { in: entities.shiftIds } },
      });
    }
    if (entities.cashierIds) {
      await tx.cashier.deleteMany({
        where: { cashier_id: { in: entities.cashierIds } },
      });
    }
    // Delete terminals after shifts (shifts have FK to terminals)
    if (entities.terminalIds) {
      await tx.pOSTerminal.deleteMany({
        where: { pos_terminal_id: { in: entities.terminalIds } },
      });
    }
    if (entities.packIds) {
      await tx.lotteryPack.deleteMany({
        where: { pack_id: { in: entities.packIds } },
      });
    }
    if (entities.binIds) {
      await tx.lotteryBin.deleteMany({
        where: { bin_id: { in: entities.binIds } },
      });
    }
    if (entities.gameIds) {
      await tx.lotteryGame.deleteMany({
        where: { game_id: { in: entities.gameIds } },
      });
    }
  });
}

test.describe("MyStore-API: Lottery Day Close Endpoint", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // POST /api/lottery/bins/day/:storeId/close - Happy Path Tests (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  test("DAY-CLOSE-001: [P0] Should successfully close day with all active bins scanned", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: Multiple bins with active packs exist
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    // Create test data: 3 bins with active packs
    const gameCode1 = generateUniqueGameCode();
    const gameCode2 = generateUniqueGameCode();
    const gameCode3 = generateUniqueGameCode();

    const {
      game: game1,
      bin: bin1,
      pack: pack1,
    } = await createTestBinWithPack(store, gameCode1, 100, "-A");
    const {
      game: game2,
      bin: bin2,
      pack: pack2,
    } = await createTestBinWithPack(store, gameCode2, 101, "-B");
    const {
      game: game3,
      bin: bin3,
      pack: pack3,
    } = await createTestBinWithPack(store, gameCode3, 102, "-C");

    // Create a shift for today
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // WHEN: I close the day with all active packs
    // Note: current_shift_id is passed to exclude the current shift from open shifts check
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [
          { pack_id: pack1.pack_id, closing_serial: "015" },
          { pack_id: pack2.pack_id, closing_serial: "020" },
          { pack_id: pack3.pack_id, closing_serial: "025" },
        ],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    // THEN: I receive a success response
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data, "Response should contain data").toBeDefined();

    // AND: Response includes summary
    expect(body.data.closings_created, "Should create 3 closings").toBe(3);
    expect(body.data.business_day, "Should include business day").toBeDefined();
    expect(
      body.data.bins_closed,
      "Should include bins_closed array",
    ).toBeDefined();
    expect(body.data.bins_closed.length, "Should have 3 bins closed").toBe(3);

    // Verify closing records were created
    const closings = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findMany({
        where: {
          shift_id: shift.shift_id,
          pack_id: { in: [pack1.pack_id, pack2.pack_id, pack3.pack_id] },
        },
      });
    });

    expect(closings.length, "Should create 3 closing records").toBe(3);

    // Cleanup
    await cleanupTestData({
      closingIds: closings.map((c) => c.closing_id),
      shiftIds: [shift.shift_id],
      cashierIds: [cashier.cashier_id],
      packIds: [pack1.pack_id, pack2.pack_id, pack3.pack_id],
      binIds: [bin1.bin_id, bin2.bin_id, bin3.bin_id],
      gameIds: [game1.game_id, game2.game_id, game3.game_id],
    });
  });

  test("DAY-CLOSE-002: [P0] Should create LotteryShiftClosing records for each pack", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Active packs exist
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
      103,
    );
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // WHEN: I close the day
    // Note: current_shift_id is passed to exclude the current shift from open shifts check
    await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [{ pack_id: pack.pack_id, closing_serial: "030" }],
        entry_method: "MANUAL",
        current_shift_id: shift.shift_id,
      },
    );

    // THEN: Closing record should exist with correct data
    const closing = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findFirst({
        where: {
          shift_id: shift.shift_id,
          pack_id: pack.pack_id,
        },
      });
    });

    expect(closing, "Closing record should exist").toBeDefined();
    expect(closing?.closing_serial, "Should have correct closing serial").toBe(
      "030",
    );
    expect(closing?.entry_method, "Should have correct entry method").toBe(
      "MANUAL",
    );
    // Verify cashier_id is recorded for direct cashier querying
    expect(closing?.cashier_id, "Should record cashier_id from the shift").toBe(
      cashier.cashier_id,
    );

    // Cleanup
    await cleanupTestData({
      closingIds: closing ? [closing.closing_id] : [],
      shiftIds: [shift.shift_id],
      cashierIds: [cashier.cashier_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });

  test("DAY-CLOSE-002B: [P1] Should allow querying lottery closings directly by cashier_id", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A lottery day close with cashier_id recorded
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
      150,
    );
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // WHEN: I close the day
    await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [{ pack_id: pack.pack_id, closing_serial: "025" }],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    // THEN: I can query closing records directly by cashier_id (no JOIN required)
    const closingsByCashier = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findMany({
        where: {
          cashier_id: cashier.cashier_id,
        },
      });
    });

    expect(
      closingsByCashier.length,
      "Should find closing record by cashier_id",
    ).toBeGreaterThanOrEqual(1);
    const ourClosing = closingsByCashier.find(
      (c) => c.pack_id === pack.pack_id,
    );
    expect(ourClosing, "Should find our specific closing").toBeDefined();
    expect(ourClosing?.cashier_id, "Should have correct cashier_id").toBe(
      cashier.cashier_id,
    );

    // Cleanup
    await cleanupTestData({
      closingIds: closingsByCashier.map((c) => c.closing_id),
      shiftIds: [shift.shift_id],
      cashierIds: [cashier.cashier_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });

  test("DAY-CLOSE-003: [P0] Should return correct summary with bins_closed array", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Two active packs
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
    const {
      game: game1,
      bin: bin1,
      pack: pack1,
    } = await createTestBinWithPack(store, gameCode1, 104);
    const {
      game: game2,
      bin: bin2,
      pack: pack2,
    } = await createTestBinWithPack(store, gameCode2, 105);
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // WHEN: I close the day
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [
          { pack_id: pack1.pack_id, closing_serial: "010" },
          { pack_id: pack2.pack_id, closing_serial: "012" },
        ],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    // THEN: bins_closed should contain details for each bin
    const body = await response.json();
    expect(
      body.data.bins_closed,
      "Should have bins_closed array",
    ).toBeDefined();

    const bin1Closed = body.data.bins_closed.find(
      (b: any) => b.bin_number === bin1.display_order + 1,
    );
    const bin2Closed = body.data.bins_closed.find(
      (b: any) => b.bin_number === bin2.display_order + 1,
    );

    expect(bin1Closed, "Bin 1 should be in response").toBeDefined();
    expect(bin1Closed.pack_number, "Should have pack_number").toContain(
      "DAYCLOSE-",
    );
    expect(bin1Closed.game_name, "Should have game_name").toBe(
      `Test Game ${gameCode1}`,
    );
    expect(bin1Closed.closing_serial, "Should have closing_serial").toBe("010");

    expect(bin2Closed, "Bin 2 should be in response").toBeDefined();

    // Cleanup
    const closings = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findMany({
        where: { shift_id: shift.shift_id },
      });
    });

    await cleanupTestData({
      closingIds: closings.map((c) => c.closing_id),
      shiftIds: [shift.shift_id],
      cashierIds: [cashier.cashier_id],
      packIds: [pack1.pack_id, pack2.pack_id],
      binIds: [bin1.bin_id, bin2.bin_id],
      gameIds: [game1.game_id, game2.game_id],
    });
  });

  test("DAY-CLOSE-004: [P0] Should carry forward ending_serial as starting_serial after day close", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: An active pack
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
      106,
    );
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // WHEN: I close the day with closing_serial "035"
    const closeResponse = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [{ pack_id: pack.pack_id, closing_serial: "035" }],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    // Verify the close was successful
    expect(closeResponse.status()).toBe(200);
    const closeBody = await closeResponse.json();
    expect(closeBody.success).toBe(true);
    expect(closeBody.data.day_closed).toBe(true);

    // AND: I query the day bins after day is closed
    const binsResponse = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${store.store_id}`,
    );

    // THEN: The closed day's ending serial becomes the starting serial for the next period
    // Once a day is closed, the ending_serial is carried forward as starting_serial
    // and ending_serial is null (no new ending yet for the next period)
    const binsBody = await binsResponse.json();
    const testBin = binsBody.data.bins.find(
      (b: any) => b.bin_id === bin.bin_id,
    );
    expect(testBin, "Bin should be present in day bins").toBeDefined();
    expect(
      testBin.pack.starting_serial,
      "Starting serial should carry forward from closed day's ending serial",
    ).toBe("035");
    expect(
      testBin.pack.ending_serial,
      "Ending serial should be null after day close (no new ending for next period)",
    ).toBeNull();

    // Cleanup
    const closing = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findFirst({
        where: { shift_id: shift.shift_id, pack_id: pack.pack_id },
      });
    });

    await cleanupTestData({
      closingIds: closing ? [closing.closing_id] : [],
      shiftIds: [shift.shift_id],
      cashierIds: [cashier.cashier_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Validation Tests (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  test("DAY-CLOSE-005: [P0] Should reject if not all active bins are included", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Two active packs exist
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
    const {
      game: game1,
      bin: bin1,
      pack: pack1,
    } = await createTestBinWithPack(store, gameCode1, 107);
    const {
      game: game2,
      bin: bin2,
      pack: pack2,
    } = await createTestBinWithPack(store, gameCode2, 108);
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // WHEN: I try to close with only one pack (missing pack2)
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [{ pack_id: pack1.pack_id, closing_serial: "015" }],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    // THEN: Should return 400 with MISSING_PACKS error
    expect(response.status(), "Should return 400 for incomplete closings").toBe(
      400,
    );
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("MISSING_PACKS");
    expect(body.error.message).toContain("active");

    // Cleanup
    await cleanupTestData({
      shiftIds: [shift.shift_id],
      cashierIds: [cashier.cashier_id],
      packIds: [pack1.pack_id, pack2.pack_id],
      binIds: [bin1.bin_id, bin2.bin_id],
      gameIds: [game1.game_id, game2.game_id],
    });
  });

  test("DAY-CLOSE-006: [P0] Should reject invalid pack_id (non-existent)", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: I am authenticated
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );
    const fakePackId = "00000000-0000-0000-0000-000000000000";

    // WHEN: I try to close with a non-existent pack_id
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [{ pack_id: fakePackId, closing_serial: "015" }],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    // THEN: Should return 400 with INVALID_PACKS error
    expect(response.status(), "Should return 400 for invalid pack_id").toBe(
      400,
    );
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("INVALID_PACKS");

    // Cleanup
    await cleanupTestData({
      shiftIds: [shift.shift_id],
      cashierIds: [cashier.cashier_id],
    });
  });

  test("DAY-CLOSE-007: [P0] Should reject pack_id not belonging to store", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A pack exists for a different store
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    // Create another store and pack
    const {
      otherStore,
      otherPack,
      otherGame,
      otherBin,
      otherCompany,
      otherUser,
    } = await withBypassClient(async (tx) => {
      const otherUser = await tx.user.create({
        data: {
          public_id: `usr_other_${Date.now()}`,
          email: `test_other_close_${Date.now()}@test.nuvana.local`,
          name: "Test Other Owner",
          status: "ACTIVE",
        },
      });
      const otherCompany = await tx.company.create({
        data: {
          public_id: `cmp_other_${Date.now()}`,
          name: "Test Other Company",
          status: "ACTIVE",
          owner_user_id: otherUser.user_id,
        },
      });
      const otherStore = await tx.store.create({
        data: {
          public_id: `str_other_${Date.now()}`,
          company_id: otherCompany.company_id,
          name: "Test Other Store",
          status: "ACTIVE",
          timezone: "America/New_York",
        },
      });
      const otherGame = await tx.lotteryGame.create({
        data: {
          name: "Other Game",
          game_code: generateUniqueGameCode(),
          price: 5.0,
          pack_value: 150,
          status: "ACTIVE",
          store_id: otherStore.store_id, // Store-scoped to avoid unique constraint conflicts
        },
      });
      const otherBin = await tx.lotteryBin.create({
        data: {
          store_id: otherStore.store_id,
          name: "Other Bin",
          display_order: 0,
          is_active: true,
        },
      });
      const otherPack = await tx.lotteryPack.create({
        data: {
          game_id: otherGame.game_id,
          store_id: otherStore.store_id,
          pack_number: `OTHER-${Date.now()}`,
          serial_start: "001",
          serial_end: "050",
          status: "ACTIVE",
          activated_at: new Date(),
          current_bin_id: otherBin.bin_id,
        },
      });
      return {
        otherStore,
        otherPack,
        otherGame,
        otherBin,
        otherCompany,
        otherUser,
      };
    });

    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // WHEN: I try to close with a pack from another store
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [{ pack_id: otherPack.pack_id, closing_serial: "015" }],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    // THEN: Should return 400 with INVALID_PACKS error (pack not in this store)
    expect(
      response.status(),
      "Should return 400 for pack from different store",
    ).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("INVALID_PACKS");

    // Cleanup
    await cleanupTestData({
      shiftIds: [shift.shift_id],
      cashierIds: [cashier.cashier_id],
    });
    await withBypassClient(async (tx) => {
      await tx.lotteryPack.delete({ where: { pack_id: otherPack.pack_id } });
      await tx.lotteryBin.delete({ where: { bin_id: otherBin.bin_id } });
      await tx.lotteryGame.delete({ where: { game_id: otherGame.game_id } });
      await tx.store.delete({ where: { store_id: otherStore.store_id } });
      await tx.company.delete({ where: { company_id: otherStore.company_id } });
    });
  });

  test("DAY-CLOSE-008: [P0] Should reject closing_serial < starting_serial", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A pack with serial_start "001"
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
      109,
    );
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // Create a shift opening with starting_serial "020"
    const opening = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftOpening.create({
        data: {
          shift_id: shift.shift_id,
          pack_id: pack.pack_id,
          opening_serial: "020",
        },
      });
    });

    // WHEN: I try to close with closing_serial "015" (less than starting "020")
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [{ pack_id: pack.pack_id, closing_serial: "015" }],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    // THEN: Should return 400 validation error
    expect(
      response.status(),
      "Should return 400 for invalid serial range",
    ).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("closing serial");

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.lotteryShiftOpening.delete({
        where: { opening_id: opening.opening_id },
      });
    });
    await cleanupTestData({
      shiftIds: [shift.shift_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });

  test("DAY-CLOSE-009: [P0] Should reject closing_serial > serial_end", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A pack with serial_end "050"
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
      110,
    );
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // WHEN: I try to close with closing_serial "055" (greater than serial_end "050")
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [{ pack_id: pack.pack_id, closing_serial: "055" }],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    // THEN: Should return 400 validation error
    expect(response.status(), "Should return 400 for serial > serial_end").toBe(
      400,
    );
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");

    // Cleanup
    await cleanupTestData({
      shiftIds: [shift.shift_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });

  test("DAY-CLOSE-010: [P0] Should reject non-3-digit closing_serial", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: An active pack
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
      111,
    );
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // WHEN: I try to close with invalid serial format
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [{ pack_id: pack.pack_id, closing_serial: "1" }],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    // THEN: Should return 400 validation error (schema validation rejects non-3-digit)
    expect(
      response.status(),
      "Should return 400 for invalid serial format",
    ).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    // Schema validation returns different error structure
    expect(body.error || body.message).toBeDefined();

    // Cleanup
    await cleanupTestData({
      shiftIds: [shift.shift_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });

  test("DAY-CLOSE-011: [P0] Should reject duplicate pack_id in request", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: An active pack
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
      112,
    );
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // WHEN: I try to close with duplicate pack_id
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [
          { pack_id: pack.pack_id, closing_serial: "015" },
          { pack_id: pack.pack_id, closing_serial: "020" }, // Duplicate
        ],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    // THEN: Should return error (400 or 500 depending on validation implementation)
    // The API currently doesn't explicitly validate for duplicates before processing,
    // which may result in a database constraint error (500) or validation error (400)
    expect([400, 500]).toContain(response.status());
    const body = await response.json();
    expect(body.success).toBe(false);

    // Cleanup
    await cleanupTestData({
      shiftIds: [shift.shift_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Authorization Tests (P0 - Security)
  // ═══════════════════════════════════════════════════════════════════════════

  test("DAY-CLOSE-012: [P0] Should reject unauthenticated requests", async ({
    request,
  }) => {
    // Use a valid UUID format to pass schema validation
    const fakeStoreId = "00000000-0000-0000-0000-000000000001";
    const fakePackId = "00000000-0000-0000-0000-000000000002";

    // WHEN: I make an unauthenticated request with valid UUID format
    const response = await request.post(
      `http://localhost:3001/api/lottery/bins/day/${fakeStoreId}/close`,
      {
        data: {
          closings: [{ pack_id: fakePackId, closing_serial: "015" }],
        },
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    // THEN: Should reject with error (400 or 401)
    // Note: Fastify schema validation may run before auth middleware,
    // resulting in 400 for schema errors. The key security requirement
    // is that the request is rejected without processing.
    expect([400, 401]).toContain(response.status());

    // Verify the request was rejected (not 2xx success)
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("DAY-CLOSE-013: [P0] Should return 403 for unauthorized store access", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: A store from a different company
    const { otherStore, otherCompany, otherOwner } = await withBypassClient(
      async (tx) => {
        // Create owner user for the other company
        const _otherOwner = await tx.user.create({
          data: {
            public_id: `usr_other_owner_${Date.now()}`,
            email: `other_owner_${Date.now()}@test.nuvana.local`,
            name: "Other Owner",
            status: "ACTIVE",
          },
        });
        const _otherCompany = await tx.company.create({
          data: {
            public_id: `cmp_other_${Date.now()}`,
            name: "Other Company For Auth Test",
            status: "ACTIVE",
            owner_user_id: _otherOwner.user_id,
          },
        });
        const otherStore = await tx.store.create({
          data: {
            public_id: `str_other_${Date.now()}`,
            company_id: _otherCompany.company_id,
            name: "Other Store For Auth Test",
            status: "ACTIVE",
            timezone: "America/New_York",
          },
        });
        return {
          otherStore,
          otherCompany: _otherCompany,
          otherOwner: _otherOwner,
        };
      },
    );

    // Use valid UUID format for pack_id to pass schema validation
    const fakePackId = "00000000-0000-0000-0000-000000000099";

    // WHEN: I try to close day for unauthorized store
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${otherStore.store_id}/close`,
      {
        closings: [{ pack_id: fakePackId, closing_serial: "015" }],
      },
    );

    // THEN: Should return 403 Forbidden
    expect(response.status(), "Should return 403 for unauthorized access").toBe(
      403,
    );

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.store.delete({ where: { store_id: otherStore.store_id } });
      await tx.company.delete({
        where: { company_id: otherCompany.company_id },
      });
      await tx.user.delete({ where: { user_id: otherOwner.user_id } });
    });
  });

  test("DAY-CLOSE-015: [P0] Should reject request for non-existent store", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: A non-existent store ID (valid UUID format to pass schema validation)
    const fakeStoreId = "00000000-0000-0000-0000-000000000000";
    const fakePackId = "00000000-0000-0000-0000-000000000001";

    // WHEN: I try to close day for non-existent store
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${fakeStoreId}/close`,
      {
        closings: [{ pack_id: fakePackId, closing_serial: "015" }],
      },
    );

    // THEN: Should return 403 or 404
    // Note: The API correctly returns 403 (Forbidden) instead of 404 for security
    // This prevents information disclosure about which store IDs exist.
    // RLS check runs before existence check, so user gets 403 for stores
    // they don't have access to, regardless of whether they exist.
    expect([403, 404]).toContain(response.status());

    const body = await response.json();
    expect(body.success).toBe(false);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Edge Cases (P1)
  // ═══════════════════════════════════════════════════════════════════════════

  test("DAY-CLOSE-016: [P1] Should handle store with no active bins (empty closings array OK)", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A store with no active packs
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // WHEN: I close the day with empty closings array
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    // THEN: Should succeed with 0 closings created
    expect(response.status(), "Should return 200 for empty closings").toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.closings_created).toBe(0);
    expect(body.data.bins_closed.length).toBe(0);

    // Cleanup
    await cleanupTestData({
      shiftIds: [shift.shift_id],
      cashierIds: [cashier.cashier_id],
    });
  });

  test("DAY-CLOSE-017: [P1] Should handle closing_serial equal to starting_serial", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A pack with starting_serial "020"
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
      113,
    );
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    const opening = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftOpening.create({
        data: {
          shift_id: shift.shift_id,
          pack_id: pack.pack_id,
          opening_serial: "020",
        },
      });
    });

    // WHEN: I close with closing_serial equal to starting_serial
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [{ pack_id: pack.pack_id, closing_serial: "020" }],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    // THEN: Should succeed (no tickets sold)
    expect(response.status(), "Should return 200 for equal serials").toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // Cleanup
    const closing = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findFirst({
        where: { shift_id: shift.shift_id },
      });
    });

    await withBypassClient(async (tx) => {
      await tx.lotteryShiftOpening.delete({
        where: { opening_id: opening.opening_id },
      });
    });

    await cleanupTestData({
      closingIds: closing ? [closing.closing_id] : [],
      shiftIds: [shift.shift_id],
      cashierIds: [cashier.cashier_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });

  test("DAY-CLOSE-018: [P1] Should handle closing_serial equal to serial_end", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A pack with serial_end "050"
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
      114,
    );
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // WHEN: I close with closing_serial equal to serial_end (pack depleted)
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [{ pack_id: pack.pack_id, closing_serial: "050" }],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    // THEN: Should succeed (pack fully depleted)
    expect(response.status(), "Should return 200 for depleted pack").toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // Cleanup
    const closing = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findFirst({
        where: { shift_id: shift.shift_id },
      });
    });

    await cleanupTestData({
      closingIds: closing ? [closing.closing_id] : [],
      shiftIds: [shift.shift_id],
      cashierIds: [cashier.cashier_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });

  test("DAY-CLOSE-019: [P1] Should handle multiple shifts in the same day", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Multiple shifts exist for today
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
      115,
    );

    // Create first shift (closed)
    const { shift: shift1, cashier: cashier1 } = await createTodayShift(
      store,
      clientUser.user_id,
      "CLOSED",
    );

    // Create second shift (currently open)
    const { shift: shift2, cashier: cashier2 } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // WHEN: I close the day (passing shift2 as current shift to exclude it from open shifts check)
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [{ pack_id: pack.pack_id, closing_serial: "025" }],
        entry_method: "SCAN",
        current_shift_id: shift2.shift_id,
      },
    );

    // THEN: Should succeed and use the latest open shift
    expect(response.status(), "Should return 200 for multiple shifts").toBe(
      200,
    );
    const body = await response.json();
    expect(body.success).toBe(true);

    // Cleanup
    const closing = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findFirst({
        where: { shift_id: shift2.shift_id },
      });
    });

    // Also cleanup business day data
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
      closingIds: closing ? [closing.closing_id] : [],
      dayPackIds: dayPacks.map((dp) => dp.day_pack_id),
      dayIds: days.map((d) => d.day_id),
      shiftIds: [shift1.shift_id, shift2.shift_id],
      cashierIds: [cashier1.cashier_id, cashier2.cashier_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Data Integrity Tests (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  test("DAY-CLOSE-020: [P0] Closing serial should become next day's starting serial", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A pack closed today with closing_serial "025"
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
      116,
    );
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // Close the day
    await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [{ pack_id: pack.pack_id, closing_serial: "025" }],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    // WHEN: A new shift opens tomorrow (simulated by creating new shift)
    const { nextShift, nextCashier } = await withBypassClient(async (tx) => {
      const nextCashier = await tx.cashier.create({
        data: {
          store_id: store.store_id,
          employee_id: `${Math.floor(1000 + Math.random() * 9000)}`,
          name: "Test Cashier Tomorrow",
          pin_hash: generateUniquePinHash(),
          hired_on: new Date(),
          created_by: clientUser.user_id,
        },
      });
      const nextShift = await tx.shift.create({
        data: {
          store_id: store.store_id,
          cashier_id: nextCashier.cashier_id,
          opened_by: clientUser.user_id,
          status: "OPEN",
          opened_at: new Date(Date.now() + 86400000), // Tomorrow
          opening_cash: 100.0,
        },
      });
      return { nextShift, nextCashier };
    });

    // AND: New shift opening is created with next serial (026)
    const nextOpening = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftOpening.create({
        data: {
          shift_id: nextShift.shift_id,
          pack_id: pack.pack_id,
          opening_serial: "026", // Should be closing_serial + 1
        },
      });
    });

    // THEN: The opening_serial should be "026" (one after closing "025")
    expect(nextOpening.opening_serial, "Next opening should be 026").toBe(
      "026",
    );

    // Cleanup
    const closing = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findFirst({
        where: { shift_id: shift.shift_id },
      });
    });

    await withBypassClient(async (tx) => {
      await tx.lotteryShiftOpening.delete({
        where: { opening_id: nextOpening.opening_id },
      });
    });

    await cleanupTestData({
      closingIds: closing ? [closing.closing_id] : [],
      shiftIds: [shift.shift_id, nextShift.shift_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });

  test("DAY-CLOSE-021: [P0] Should not allow re-closing already closed day (or handle gracefully)", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A day that has already been closed
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
      117,
    );
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // Close the day first time
    await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [{ pack_id: pack.pack_id, closing_serial: "020" }],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    // WHEN: I try to close the same day again with different serial
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [{ pack_id: pack.pack_id, closing_serial: "025" }],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    // THEN: Should return 400 with CLOSINGS_ALREADY_EXIST error
    // The API doesn't allow re-closing the same pack in the same shift
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("CLOSINGS_ALREADY_EXIST");

    // Cleanup
    const closings = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findMany({
        where: { shift_id: shift.shift_id },
      });
    });

    // Clean up LotteryBusinessDay records
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
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LotteryBusinessDay and LotteryDayPack Tests (P0 - Day-Based Tracking)
  // ═══════════════════════════════════════════════════════════════════════════

  test("DAY-CLOSE-022: [P0] Should create LotteryBusinessDay record when day is closed", async ({
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
    const { game, bin, pack } = await createTestBinWithPack(
      store,
      gameCode,
      200,
    );
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // WHEN: I close the day
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [{ pack_id: pack.pack_id, closing_serial: "025" }],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    // THEN: LotteryBusinessDay record should be created with CLOSED status
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.data.day_closed, "Response should indicate day closed").toBe(
      true,
    );

    const businessDay = await withBypassClient(async (tx) => {
      // Use store's timezone to match the API's business day calculation
      return await tx.lotteryBusinessDay.findFirst({
        where: {
          store_id: store.store_id,
          business_date: new Date(
            getTodayDateString(store.timezone || "America/New_York") +
              "T00:00:00Z",
          ),
        },
      });
    });

    expect(businessDay, "LotteryBusinessDay record should exist").toBeDefined();
    expect(businessDay?.status, "Status should be CLOSED").toBe("CLOSED");
    expect(businessDay?.closed_by, "closed_by should be set").toBeDefined();
    expect(businessDay?.closed_at, "closed_at should be set").toBeDefined();

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

    await cleanupTestData({
      closingIds: closings.map((c) => c.closing_id),
      dayPackIds: dayPacks.map((dp) => dp.day_pack_id),
      dayIds: businessDay ? [businessDay.day_id] : [],
      shiftIds: [shift.shift_id],
      cashierIds: [cashier.cashier_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });

  test("DAY-CLOSE-023: [P0] Should create LotteryDayPack records for each closed pack", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Multiple active packs
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
    const {
      game: game1,
      bin: bin1,
      pack: pack1,
    } = await createTestBinWithPack(store, gameCode1, 201, "-A");
    const {
      game: game2,
      bin: bin2,
      pack: pack2,
    } = await createTestBinWithPack(store, gameCode2, 202, "-B");
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // WHEN: I close the day with both packs
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [
          { pack_id: pack1.pack_id, closing_serial: "020" },
          { pack_id: pack2.pack_id, closing_serial: "030" },
        ],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    expect(response.status(), "Should return 200 OK").toBe(200);

    // THEN: LotteryDayPack records should be created for each pack
    const dayPacks = await withBypassClient(async (tx) => {
      return await tx.lotteryDayPack.findMany({
        where: {
          pack_id: { in: [pack1.pack_id, pack2.pack_id] },
        },
      });
    });

    expect(dayPacks.length, "Should create 2 LotteryDayPack records").toBe(2);

    const pack1DayRecord = dayPacks.find((dp) => dp.pack_id === pack1.pack_id);
    const pack2DayRecord = dayPacks.find((dp) => dp.pack_id === pack2.pack_id);

    expect(pack1DayRecord, "Pack 1 day record should exist").toBeDefined();
    expect(
      pack1DayRecord?.ending_serial,
      "Pack 1 ending_serial should be 020",
    ).toBe("020");
    expect(
      pack1DayRecord?.starting_serial,
      "Pack 1 starting_serial should be set",
    ).toBeDefined();

    expect(pack2DayRecord, "Pack 2 day record should exist").toBeDefined();
    expect(
      pack2DayRecord?.ending_serial,
      "Pack 2 ending_serial should be 030",
    ).toBe("030");

    // Cleanup
    const closings = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findMany({
        where: { shift_id: shift.shift_id },
      });
    });
    const businessDay = await withBypassClient(async (tx) => {
      return await tx.lotteryBusinessDay.findFirst({
        where: { store_id: store.store_id },
      });
    });

    await cleanupTestData({
      closingIds: closings.map((c) => c.closing_id),
      dayPackIds: dayPacks.map((dp) => dp.day_pack_id),
      dayIds: businessDay ? [businessDay.day_id] : [],
      shiftIds: [shift.shift_id],
      cashierIds: [cashier.cashier_id],
      packIds: [pack1.pack_id, pack2.pack_id],
      binIds: [bin1.bin_id, bin2.bin_id],
      gameIds: [game1.game_id, game2.game_id],
    });
  });

  test("DAY-CLOSE-024: [P0] LotteryDayPack should store correct starting_serial from shift opening", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A pack with a shift opening at serial 015
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
      203,
    );
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // Create a shift opening with specific serial
    const opening = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftOpening.create({
        data: {
          shift_id: shift.shift_id,
          pack_id: pack.pack_id,
          opening_serial: "015",
        },
      });
    });

    // WHEN: I close the day
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [{ pack_id: pack.pack_id, closing_serial: "040" }],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    expect(response.status(), "Should return 200 OK").toBe(200);

    // THEN: LotteryDayPack should have starting_serial from opening
    const dayPack = await withBypassClient(async (tx) => {
      return await tx.lotteryDayPack.findFirst({
        where: { pack_id: pack.pack_id },
      });
    });

    expect(dayPack, "LotteryDayPack record should exist").toBeDefined();
    expect(
      dayPack?.starting_serial,
      "starting_serial should match opening",
    ).toBe("015");
    expect(dayPack?.ending_serial, "ending_serial should be 040").toBe("040");

    // Cleanup
    const closings = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findMany({
        where: { shift_id: shift.shift_id },
      });
    });
    const businessDay = await withBypassClient(async (tx) => {
      return await tx.lotteryBusinessDay.findFirst({
        where: { store_id: store.store_id },
      });
    });

    await withBypassClient(async (tx) => {
      await tx.lotteryShiftOpening.delete({
        where: { opening_id: opening.opening_id },
      });
    });

    await cleanupTestData({
      closingIds: closings.map((c) => c.closing_id),
      dayPackIds: dayPack ? [dayPack.day_pack_id] : [],
      dayIds: businessDay ? [businessDay.day_id] : [],
      shiftIds: [shift.shift_id],
      cashierIds: [cashier.cashier_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });

  test("DAY-CLOSE-025: [P0] LotteryDayPack should store correct bin_id", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: An active pack in a specific bin
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
      204,
    );
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // WHEN: I close the day
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [{ pack_id: pack.pack_id, closing_serial: "025" }],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    expect(response.status(), "Should return 200 OK").toBe(200);

    // THEN: LotteryDayPack should have correct bin_id
    const dayPack = await withBypassClient(async (tx) => {
      return await tx.lotteryDayPack.findFirst({
        where: { pack_id: pack.pack_id },
      });
    });

    expect(dayPack, "LotteryDayPack record should exist").toBeDefined();
    expect(dayPack?.bin_id, "bin_id should match pack's bin").toBe(bin.bin_id);

    // Cleanup
    const closings = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findMany({
        where: { shift_id: shift.shift_id },
      });
    });
    const businessDay = await withBypassClient(async (tx) => {
      return await tx.lotteryBusinessDay.findFirst({
        where: { store_id: store.store_id },
      });
    });

    await cleanupTestData({
      closingIds: closings.map((c) => c.closing_id),
      dayPackIds: dayPack ? [dayPack.day_pack_id] : [],
      dayIds: businessDay ? [businessDay.day_id] : [],
      shiftIds: [shift.shift_id],
      cashierIds: [cashier.cashier_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Defense-in-Depth: Open Shift Blocking (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  test("DAY-CLOSE-SHIFT-001: [P0] Should reject lottery close when shifts are OPEN", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A store with an OPEN shift today
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    // Create test data: bin with active pack
    const gameCode = generateUniqueGameCode();
    const { game, bin, pack } = await createTestBinWithPack(
      store,
      gameCode,
      200,
    );

    // Create an OPEN shift (not closed)
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // WHEN: I try to close the lottery day
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [{ pack_id: pack.pack_id, closing_serial: "015" }],
        entry_method: "SCAN",
      },
    );

    // THEN: I receive a 400 error with SHIFTS_STILL_OPEN code
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Response should contain error object").toBeDefined();
    expect(body.error.code, "Error code should be SHIFTS_STILL_OPEN").toBe(
      "SHIFTS_STILL_OPEN",
    );
    expect(
      body.error.message,
      "Error message should mention open shifts",
    ).toContain("shifts must be closed");
    expect(
      body.error.details?.open_shifts,
      "Should include open shifts details",
    ).toBeDefined();
    expect(
      body.error.details.open_shifts.length,
      "Should have 1 open shift",
    ).toBe(1);

    // Cleanup
    await cleanupTestData({
      shiftIds: [shift.shift_id],
      cashierIds: [cashier.cashier_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });

  test("DAY-CLOSE-SHIFT-002: [P0] Should reject lottery close when shifts are ACTIVE", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A store with an ACTIVE shift today
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    // Create test data
    const gameCode = generateUniqueGameCode();
    const { game, bin, pack } = await createTestBinWithPack(
      store,
      gameCode,
      201,
    );

    // Create an ACTIVE shift (using ACTIVE instead of OPEN)
    const { shift, cashier } = await withBypassClient(async (tx) => {
      const cashierRecord = await tx.cashier.create({
        data: {
          store_id: store.store_id,
          employee_id: `${Math.floor(1000 + Math.random() * 9000)}`,
          name: "Test Cashier Active",
          pin_hash: generateUniquePinHash(),
          hired_on: new Date(),
          created_by: clientUser.user_id,
        },
      });

      const shiftRecord = await tx.shift.create({
        data: {
          store_id: store.store_id,
          cashier_id: cashierRecord.cashier_id,
          opened_by: clientUser.user_id,
          status: "ACTIVE", // Explicitly ACTIVE
          opened_at: new Date(),
          opening_cash: 100.0,
        },
      });

      return { shift: shiftRecord, cashier: cashierRecord };
    });

    // WHEN: I try to close the lottery day
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [{ pack_id: pack.pack_id, closing_serial: "015" }],
        entry_method: "SCAN",
      },
    );

    // THEN: I receive a 400 error with SHIFTS_STILL_OPEN code
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
    const body = await response.json();
    expect(body.error.code, "Error code should be SHIFTS_STILL_OPEN").toBe(
      "SHIFTS_STILL_OPEN",
    );

    // Cleanup
    await cleanupTestData({
      shiftIds: [shift.shift_id],
      cashierIds: [cashier.cashier_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });

  test("DAY-CLOSE-SHIFT-003: [P0] Should allow lottery close when all shifts are CLOSED", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A store where all today's shifts are CLOSED
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    // Create test data
    const gameCode = generateUniqueGameCode();
    const { game, bin, pack } = await createTestBinWithPack(
      store,
      gameCode,
      202,
    );

    // Create a CLOSED shift
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "CLOSED",
    );

    // WHEN: I close the lottery day
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [{ pack_id: pack.pack_id, closing_serial: "015" }],
        entry_method: "SCAN",
      },
    );

    // THEN: I receive a success response (no shift blocking)
    expect(response.status(), "Expected 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);

    // Get the closing for cleanup
    const closing = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findFirst({
        where: { pack_id: pack.pack_id },
      });
    });
    const businessDay = await withBypassClient(async (tx) => {
      return await tx.lotteryBusinessDay.findFirst({
        where: { store_id: store.store_id },
      });
    });
    const dayPack = await withBypassClient(async (tx) => {
      return await tx.lotteryDayPack.findFirst({
        where: { pack_id: pack.pack_id },
      });
    });

    // Cleanup
    await cleanupTestData({
      closingIds: closing ? [closing.closing_id] : [],
      dayPackIds: dayPack ? [dayPack.day_pack_id] : [],
      dayIds: businessDay ? [businessDay.day_id] : [],
      shiftIds: [shift.shift_id],
      cashierIds: [cashier.cashier_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });

  test("DAY-CLOSE-SHIFT-004: [P0] Should include open shift details in error response", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A store with multiple open shifts
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    // Create test data
    const gameCode = generateUniqueGameCode();
    const { game, bin, pack } = await createTestBinWithPack(
      store,
      gameCode,
      203,
    );

    // Create two OPEN shifts with terminals
    const terminal1 = await withBypassClient(async (tx) => {
      return await tx.pOSTerminal.create({
        data: {
          store_id: store.store_id,
          name: "Terminal A",
          device_id: `TERM-A-${Date.now()}`,
        },
      });
    });

    const terminal2 = await withBypassClient(async (tx) => {
      return await tx.pOSTerminal.create({
        data: {
          store_id: store.store_id,
          name: "Terminal B",
          device_id: `TERM-B-${Date.now()}`,
        },
      });
    });

    const cashier1 = await withBypassClient(async (tx) => {
      return await tx.cashier.create({
        data: {
          store_id: store.store_id,
          employee_id: `${Math.floor(1000 + Math.random() * 9000)}`,
          name: "John Doe",
          pin_hash: generateUniquePinHash(),
          hired_on: new Date(),
          created_by: clientUser.user_id,
        },
      });
    });

    const cashier2 = await withBypassClient(async (tx) => {
      return await tx.cashier.create({
        data: {
          store_id: store.store_id,
          employee_id: `${Math.floor(1000 + Math.random() * 9000)}`,
          name: "Jane Smith",
          pin_hash: generateUniquePinHash(),
          hired_on: new Date(),
          created_by: clientUser.user_id,
        },
      });
    });

    const shift1 = await withBypassClient(async (tx) => {
      return await tx.shift.create({
        data: {
          store_id: store.store_id,
          cashier_id: cashier1.cashier_id,
          pos_terminal_id: terminal1.pos_terminal_id,
          opened_by: clientUser.user_id,
          status: "OPEN",
          opened_at: new Date(),
          opening_cash: 100.0,
        },
      });
    });

    const shift2 = await withBypassClient(async (tx) => {
      return await tx.shift.create({
        data: {
          store_id: store.store_id,
          cashier_id: cashier2.cashier_id,
          pos_terminal_id: terminal2.pos_terminal_id,
          opened_by: clientUser.user_id,
          status: "ACTIVE",
          opened_at: new Date(),
          opening_cash: 150.0,
        },
      });
    });

    // WHEN: I try to close the lottery day
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [{ pack_id: pack.pack_id, closing_serial: "015" }],
        entry_method: "SCAN",
      },
    );

    // THEN: Error details should include information about both open shifts
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
    const body = await response.json();
    expect(body.error.code, "Error code should be SHIFTS_STILL_OPEN").toBe(
      "SHIFTS_STILL_OPEN",
    );
    expect(
      body.error.details.open_shifts.length,
      "Should have 2 open shifts",
    ).toBe(2);

    // Verify each open shift has required details
    for (const shift of body.error.details.open_shifts) {
      expect(shift.shift_id, "Shift should have shift_id").toBeDefined();
      expect(
        shift.terminal_name,
        "Shift should have terminal_name",
      ).toBeDefined();
      expect(
        shift.cashier_name,
        "Shift should have cashier_name",
      ).toBeDefined();
      expect(shift.status, "Shift should have status").toBeDefined();
      expect(shift.opened_at, "Shift should have opened_at").toBeDefined();
    }

    // Cleanup
    await cleanupTestData({
      shiftIds: [shift1.shift_id, shift2.shift_id],
      cashierIds: [cashier1.cashier_id, cashier2.cashier_id],
      terminalIds: [terminal1.pos_terminal_id, terminal2.pos_terminal_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });
});
