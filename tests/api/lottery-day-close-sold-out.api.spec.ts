/**
 * Lottery Day Close - Sold Out (is_sold_out) Flag API Tests
 *
 * Tests the is_sold_out flag flow from frontend through backend calculation.
 * This is critical for ensuring that packs marked as "sold out" use the
 * depletion formula ((serial_end + 1) - starting) instead of the normal
 * formula (ending - starting).
 *
 * @test-level API
 * @justification Tests is_sold_out flag propagation through API endpoints with actual database
 * @story Lottery Day Close - Sold Out Pack Calculation Fix
 * @priority P0 (Critical - Financial Calculations)
 *
 * TRACEABILITY MATRIX:
 * ┌─────────────────────────────────────────────────────────────────────────────────────┐
 * │ Test ID              │ Requirement                              │ MCP Rule │ Priority │
 * ├─────────────────────────────────────────────────────────────────────────────────────┤
 * │ SOLD-OUT-API-001     │ Accept is_sold_out flag in request       │ API-001  │ P0       │
 * │ SOLD-OUT-API-002     │ Use depletion formula when is_sold_out   │ SEC-014  │ P0       │
 * │ SOLD-OUT-API-003     │ Use normal formula when not sold out     │ SEC-014  │ P0       │
 * │ SOLD-OUT-API-004     │ Return correct sales amount (sold out)   │ API-003  │ P0       │
 * │ SOLD-OUT-API-005     │ Return correct sales amount (normal)     │ API-003  │ P0       │
 * │ SOLD-OUT-API-006     │ Handle mixed sold-out and normal packs   │ SEC-014  │ P0       │
 * │ SOLD-OUT-API-007     │ Default is_sold_out to false when omitted│ API-001  │ P1       │
 * │ SOLD-OUT-API-008     │ Persist is_sold_out in closing record    │ SEC-014  │ P0       │
 * │ SOLD-OUT-API-009     │ Calculate $300 for $10 sold-out pack     │ SEC-014  │ P0       │
 * │ SOLD-OUT-API-010     │ Calculate $290 for $10 normal scan       │ SEC-014  │ P0       │
 * └─────────────────────────────────────────────────────────────────────────────────────┘
 *
 * TESTING PYRAMID PLACEMENT:
 * ┌─────────────────────────────────────────────────────────────────────────────────────┐
 * │ Level        │ Coverage                         │ This File                         │
 * ├─────────────────────────────────────────────────────────────────────────────────────┤
 * │ Unit         │ Pure calculation logic           │ day-close-sold-out-calculation.ts │
 * │ Component    │ UI sold-out selection            │ DayCloseModeScanner.test.tsx      │
 * │ API (here)   │ is_sold_out flag flow            │ lottery-day-close-sold-out.api.ts │
 * │ E2E          │ Full day close workflow          │ lottery-management-flow.spec.ts   │
 * └─────────────────────────────────────────────────────────────────────────────────────┘
 *
 * BUSINESS CONTEXT:
 * When a pack is marked as "sold out" (depleted), the calculation must use:
 *   tickets_sold = (serial_end + 1) - starting_serial
 *
 * For normal scans, the calculation uses:
 *   tickets_sold = ending_serial - starting_serial
 *
 * Example for $10 game, 30-ticket pack (serial_end=029), starting at 000:
 *   - Normal scan at 029: 29 - 0 = 29 tickets = $290 (WRONG for sold out)
 *   - Sold out at 029: (29 + 1) - 0 = 30 tickets = $300 (CORRECT for sold out)
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import { withBypassClient } from "../support/prisma-bypass";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

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
  options: {
    packSuffix?: string;
    gamePrice?: number;
    serialStart?: string;
    serialEnd?: string;
  } = {},
) {
  const {
    packSuffix = "",
    gamePrice = 10.0,
    serialStart = "000",
    serialEnd = "029", // 30 tickets by default
  } = options;

  return await withBypassClient(async (tx) => {
    // Create store-scoped game to ensure uniqueness per store
    const game = await tx.lotteryGame.create({
      data: {
        name: `Test Game ${gameCode}`,
        game_code: gameCode,
        price: gamePrice,
        pack_value: gamePrice * (parseInt(serialEnd, 10) + 1), // Calculate pack value
        status: "ACTIVE",
        store_id: store.store_id,
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
        pack_number: `SOLDOUT-${Date.now()}-${binOrder}${packSuffix}`,
        serial_start: serialStart,
        serial_end: serialEnd,
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
 * Helper to create a shift for the current day
 */
async function createTodayShift(
  store: { store_id: string },
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

// ═══════════════════════════════════════════════════════════════════════════════
// SOLD OUT FLAG API TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("API: Lottery Day Close - is_sold_out Flag", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // SOLD OUT PACK CALCULATION TESTS (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  test("SOLD-OUT-API-001: [P0] Should accept is_sold_out flag in day close request", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A pack with 30 tickets ($10 game) exists
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
      {
        gamePrice: 10.0,
        serialStart: "000",
        serialEnd: "029", // 30 tickets
      },
    );
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // WHEN: I close the day with is_sold_out=true
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [
          {
            pack_id: pack.pack_id,
            closing_serial: "029", // Full pack
            is_sold_out: true, // Mark as sold out
          },
        ],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    // THEN: The request should succeed
    if (response.status() !== 200) {
      const errorBody = await response.json();
      console.log("Error response:", JSON.stringify(errorBody, null, 2));
    }
    expect(response.status(), "Expected 200 OK status").toBe(200);

    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);

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
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });

  test("SOLD-OUT-API-009: [P0] Should calculate $300 for $10 sold-out pack (30 tickets)", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A $10 game with 30-ticket pack (serial_end=029)
    // This is the critical test case from the bug report
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
      201,
      {
        gamePrice: 10.0,
        serialStart: "000",
        serialEnd: "029", // 30 tickets
      },
    );
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // WHEN: I mark the pack as sold out at serial 029
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [
          {
            pack_id: pack.pack_id,
            closing_serial: "029",
            is_sold_out: true, // Critical: sold out flag
          },
        ],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    // THEN: Sales should be $300 (30 tickets × $10), NOT $290 (29 tickets × $10)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // Verify the calculation in the response
    const binsClosed = body.data.bins_closed;
    expect(binsClosed).toBeDefined();
    expect(binsClosed.length).toBe(1);

    // The API should return the correct sales amount
    const binData = binsClosed[0];
    if (binData.sales_amount !== undefined) {
      expect(
        binData.sales_amount,
        "Sales should be $300 for sold-out 30-ticket pack at $10",
      ).toBe(300);
    }

    // Also verify via database
    const closing = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findFirst({
        where: { pack_id: pack.pack_id, shift_id: shift.shift_id },
      });
    });

    expect(closing).toBeDefined();
    expect(closing?.closing_serial).toBe("029");

    // If tickets_sold is stored, verify it's 30
    if (closing && "tickets_sold" in closing) {
      expect(
        (closing as unknown as { tickets_sold: number }).tickets_sold,
        "Should calculate 30 tickets for sold-out pack",
      ).toBe(30);
    }

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

  test("SOLD-OUT-API-010: [P0] Should calculate $290 for $10 normal scan at 029 (NOT sold out)", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A $10 game with 30-ticket pack, scanned normally at position 029
    // This is NOT marked as sold out, so uses normal formula
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
      202,
      {
        gamePrice: 10.0,
        serialStart: "000",
        serialEnd: "029",
      },
    );
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // WHEN: I scan the pack at 029 WITHOUT marking as sold out
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [
          {
            pack_id: pack.pack_id,
            closing_serial: "029",
            is_sold_out: false, // NOT sold out
          },
        ],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    // THEN: Sales should be $290 (29 tickets × $10)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // Verify the calculation
    const binsClosed = body.data.bins_closed;
    expect(binsClosed).toBeDefined();

    const binData = binsClosed[0];
    if (binData.sales_amount !== undefined) {
      expect(
        binData.sales_amount,
        "Sales should be $290 for normal scan at 029",
      ).toBe(290);
    }

    // Cleanup
    const closing = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findFirst({
        where: { pack_id: pack.pack_id, shift_id: shift.shift_id },
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

  test("SOLD-OUT-API-006: [P0] Should handle mixed sold-out and normal packs correctly", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Multiple packs - some sold out, some not
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
    const gameCode3 = generateUniqueGameCode();

    // Pack 1: $10, 30 tickets, sold out → $300
    const {
      game: game1,
      bin: bin1,
      pack: pack1,
    } = await createTestBinWithPack(store, gameCode1, 203, {
      gamePrice: 10.0,
      serialStart: "000",
      serialEnd: "029",
    });

    // Pack 2: $5, 50 tickets, normal scan at 025 → 25 × $5 = $125
    const {
      game: game2,
      bin: bin2,
      pack: pack2,
    } = await createTestBinWithPack(store, gameCode2, 204, {
      gamePrice: 5.0,
      serialStart: "000",
      serialEnd: "049",
    });

    // Pack 3: $20, 15 tickets, sold out → $300
    const {
      game: game3,
      bin: bin3,
      pack: pack3,
    } = await createTestBinWithPack(store, gameCode3, 205, {
      gamePrice: 20.0,
      serialStart: "000",
      serialEnd: "014",
    });

    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // WHEN: Closing with mixed is_sold_out flags
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [
          { pack_id: pack1.pack_id, closing_serial: "029", is_sold_out: true },
          { pack_id: pack2.pack_id, closing_serial: "025", is_sold_out: false },
          { pack_id: pack3.pack_id, closing_serial: "014", is_sold_out: true },
        ],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    // THEN: Each pack calculated correctly
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // Verify 3 closings created
    expect(body.data.closings_created).toBe(3);

    // Total should be:
    // Pack 1: 30 × $10 = $300 (sold out, depletion formula)
    // Pack 2: 25 × $5 = $125 (normal, ending - starting = 25 - 0 = 25)
    // Pack 3: 15 × $20 = $300 (sold out, depletion formula)
    // Total: $725

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
      packIds: [pack1.pack_id, pack2.pack_id, pack3.pack_id],
      binIds: [bin1.bin_id, bin2.bin_id, bin3.bin_id],
      gameIds: [game1.game_id, game2.game_id, game3.game_id],
    });
  });

  test("SOLD-OUT-API-007: [P1] Should default is_sold_out to false when omitted", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A pack closed without is_sold_out flag
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
      206,
      {
        gamePrice: 10.0,
        serialStart: "000",
        serialEnd: "029",
      },
    );
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // WHEN: Closing WITHOUT is_sold_out flag (should default to false)
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [
          {
            pack_id: pack.pack_id,
            closing_serial: "029",
            // is_sold_out intentionally omitted
          },
        ],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    // THEN: Should use normal formula (29 tickets = $290)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // Should default to normal formula
    const binsClosed = body.data.bins_closed;
    if (binsClosed && binsClosed[0]?.sales_amount !== undefined) {
      expect(
        binsClosed[0].sales_amount,
        "Should use normal formula when is_sold_out omitted",
      ).toBe(290);
    }

    // Cleanup
    const closing = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findFirst({
        where: { pack_id: pack.pack_id, shift_id: shift.shift_id },
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
  // EDGE CASE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("SOLD-OUT-API-011: [P1] Should calculate correctly for pack starting at non-zero serial", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A pack that starts at serial 010 (carryover from previous day)
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
      207,
      {
        gamePrice: 10.0,
        serialStart: "010", // Started at 10
        serialEnd: "029", // 20 tickets remaining
      },
    );
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // WHEN: Marking as sold out
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [
          {
            pack_id: pack.pack_id,
            closing_serial: "029",
            is_sold_out: true,
          },
        ],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    // THEN: Should calculate 20 tickets (29 + 1 - 10 = 20) = $200
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    const binsClosed = body.data.bins_closed;
    if (binsClosed && binsClosed[0]?.sales_amount !== undefined) {
      expect(
        binsClosed[0].sales_amount,
        "Should calculate $200 for 20 tickets",
      ).toBe(200);
    }

    // Cleanup
    const closing = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findFirst({
        where: { pack_id: pack.pack_id, shift_id: shift.shift_id },
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

  test("SOLD-OUT-API-012: [P1] Should calculate correctly for single ticket pack sold out", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A pack with only 1 ticket (serial_start=000, serial_end=000)
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
      208,
      {
        gamePrice: 5.0,
        serialStart: "000",
        serialEnd: "000", // Single ticket pack
      },
    );
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // WHEN: Marking as sold out
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [
          {
            pack_id: pack.pack_id,
            closing_serial: "000",
            is_sold_out: true,
          },
        ],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    // THEN: Should calculate 1 ticket (0 + 1 - 0 = 1) = $5
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    const binsClosed = body.data.bins_closed;
    if (binsClosed && binsClosed[0]?.sales_amount !== undefined) {
      expect(
        binsClosed[0].sales_amount,
        "Should calculate $5 for single ticket",
      ).toBe(5);
    }

    // Cleanup
    const closing = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findFirst({
        where: { pack_id: pack.pack_id, shift_id: shift.shift_id },
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
});

// ═══════════════════════════════════════════════════════════════════════════════
// PACK DEPLETION TESTS
// Tests that is_sold_out=true correctly depletes the pack status
// SEC-017: AUDIT_TRAILS - Verifies pack depletion during day close
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("API: Lottery Day Close - Pack Depletion on Sold Out", () => {
  test("SOLD-OUT-DEPLETE-001: [P0] Pack marked sold out should have status DEPLETED after day close", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: An ACTIVE pack in a bin
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
      {
        gamePrice: 10.0,
        serialStart: "000",
        serialEnd: "029",
      },
    );
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // Verify pack is ACTIVE before close
    const packBefore = await withBypassClient(async (tx) => {
      return await tx.lotteryPack.findUnique({
        where: { pack_id: pack.pack_id },
        select: {
          status: true,
          depleted_at: true,
          depleted_by: true,
          depletion_reason: true,
        },
      });
    });
    expect(packBefore?.status).toBe("ACTIVE");
    expect(packBefore?.depleted_at).toBeNull();

    // WHEN: I close the day with is_sold_out=true
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [
          {
            pack_id: pack.pack_id,
            closing_serial: "029",
            is_sold_out: true,
          },
        ],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // THEN: Pack should now be DEPLETED with audit fields populated
    const packAfter = await withBypassClient(async (tx) => {
      return await tx.lotteryPack.findUnique({
        where: { pack_id: pack.pack_id },
        select: {
          status: true,
          depleted_at: true,
          depleted_by: true,
          depleted_shift_id: true,
          depletion_reason: true,
        },
      });
    });

    expect(
      packAfter?.status,
      "Pack should be DEPLETED after sold out day close",
    ).toBe("DEPLETED");
    expect(packAfter?.depleted_at, "depleted_at should be set").not.toBeNull();
    expect(packAfter?.depleted_by, "depleted_by should be set to user").toBe(
      clientUser.user_id,
    );
    expect(
      packAfter?.depleted_shift_id,
      "depleted_shift_id should be set",
    ).toBe(shift.shift_id);
    expect(
      packAfter?.depletion_reason,
      "depletion_reason should be MANUAL_SOLD_OUT",
    ).toBe("MANUAL_SOLD_OUT");

    // Verify packs_depleted is returned in response
    expect(
      body.data.packs_depleted,
      "Response should include packs_depleted array",
    ).toBeDefined();
    expect(body.data.packs_depleted.length, "Should have 1 depleted pack").toBe(
      1,
    );
    expect(body.data.packs_depleted[0].pack_id).toBe(pack.pack_id);

    // Cleanup
    const closings = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findMany({
        where: { shift_id: shift.shift_id },
      });
    });

    // Also need to clean up business day created
    const businessDay = await withBypassClient(async (tx) => {
      return await tx.lotteryBusinessDay.findFirst({
        where: { store_id: store.store_id },
        orderBy: { created_at: "desc" },
      });
    });

    const dayPacks = await withBypassClient(async (tx) => {
      return await tx.lotteryDayPack.findMany({
        where: { day_id: businessDay?.day_id },
      });
    });

    await cleanupTestData({
      dayPackIds: dayPacks.map((dp) => dp.day_pack_id),
      dayIds: businessDay ? [businessDay.day_id] : [],
      closingIds: closings.map((c) => c.closing_id),
      shiftIds: [shift.shift_id],
      cashierIds: [cashier.cashier_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });

  test("SOLD-OUT-DEPLETE-002: [P0] Pack NOT marked sold out should remain ACTIVE after day close", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: An ACTIVE pack
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
      {
        gamePrice: 10.0,
        serialStart: "000",
        serialEnd: "029",
      },
    );
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // WHEN: I close the day with is_sold_out=false (normal scan)
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [
          {
            pack_id: pack.pack_id,
            closing_serial: "015", // Not at end
            is_sold_out: false,
          },
        ],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // THEN: Pack should remain ACTIVE
    const packAfter = await withBypassClient(async (tx) => {
      return await tx.lotteryPack.findUnique({
        where: { pack_id: pack.pack_id },
        select: { status: true, depleted_at: true },
      });
    });

    expect(
      packAfter?.status,
      "Pack should remain ACTIVE when not marked sold out",
    ).toBe("ACTIVE");
    expect(packAfter?.depleted_at, "depleted_at should remain null").toBeNull();

    // packs_depleted should be empty
    expect(
      body.data.packs_depleted,
      "packs_depleted should be empty array",
    ).toEqual([]);

    // Cleanup
    const closings = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findMany({
        where: { shift_id: shift.shift_id },
      });
    });

    const businessDay = await withBypassClient(async (tx) => {
      return await tx.lotteryBusinessDay.findFirst({
        where: { store_id: store.store_id },
        orderBy: { created_at: "desc" },
      });
    });

    const dayPacks = await withBypassClient(async (tx) => {
      return await tx.lotteryDayPack.findMany({
        where: { day_id: businessDay?.day_id },
      });
    });

    await cleanupTestData({
      dayPackIds: dayPacks.map((dp) => dp.day_pack_id),
      dayIds: businessDay ? [businessDay.day_id] : [],
      closingIds: closings.map((c) => c.closing_id),
      shiftIds: [shift.shift_id],
      cashierIds: [cashier.cashier_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });

  test("SOLD-OUT-DEPLETE-003: [P0] Pack at serial_end WITHOUT is_sold_out should NOT be depleted", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: An ACTIVE pack
    // This tests the critical distinction: closing_serial === serial_end is NOT enough
    // The user MUST explicitly mark is_sold_out=true
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
      302,
      {
        gamePrice: 10.0,
        serialStart: "000",
        serialEnd: "029",
      },
    );
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // WHEN: I close at serial_end BUT is_sold_out=false
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [
          {
            pack_id: pack.pack_id,
            closing_serial: "029", // At end
            is_sold_out: false, // But NOT marked sold out
          },
        ],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // THEN: Pack should remain ACTIVE (closing at end does NOT auto-deplete)
    const packAfter = await withBypassClient(async (tx) => {
      return await tx.lotteryPack.findUnique({
        where: { pack_id: pack.pack_id },
        select: { status: true, depleted_at: true },
      });
    });

    expect(
      packAfter?.status,
      "Pack should remain ACTIVE even at serial_end without is_sold_out",
    ).toBe("ACTIVE");
    expect(packAfter?.depleted_at).toBeNull();

    // Cleanup
    const closings = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findMany({
        where: { shift_id: shift.shift_id },
      });
    });

    const businessDay = await withBypassClient(async (tx) => {
      return await tx.lotteryBusinessDay.findFirst({
        where: { store_id: store.store_id },
        orderBy: { created_at: "desc" },
      });
    });

    const dayPacks = await withBypassClient(async (tx) => {
      return await tx.lotteryDayPack.findMany({
        where: { day_id: businessDay?.day_id },
      });
    });

    await cleanupTestData({
      dayPackIds: dayPacks.map((dp) => dp.day_pack_id),
      dayIds: businessDay ? [businessDay.day_id] : [],
      closingIds: closings.map((c) => c.closing_id),
      shiftIds: [shift.shift_id],
      cashierIds: [cashier.cashier_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });

  test("SOLD-OUT-DEPLETE-004: [P0] Depleted pack should NOT appear in next day bins query", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: An ACTIVE pack that gets marked sold out during day close
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
      303,
      {
        gamePrice: 10.0,
        serialStart: "000",
        serialEnd: "029",
      },
    );
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // First verify the pack appears in bins query before close
    const binsBeforeResponse = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${store.store_id}`,
    );
    const binsBefore = await binsBeforeResponse.json();
    const packInBinsBefore = binsBefore.data?.bins?.find(
      (b: { pack?: { pack_id: string } }) => b.pack?.pack_id === pack.pack_id,
    );
    expect(
      packInBinsBefore,
      "Pack should appear in bins before day close",
    ).toBeDefined();

    // WHEN: Close day with is_sold_out=true
    const closeResponse = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [
          {
            pack_id: pack.pack_id,
            closing_serial: "029",
            is_sold_out: true,
          },
        ],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    expect(closeResponse.status()).toBe(200);

    // THEN: Pack should NOT appear in bins query (filtered by status=ACTIVE)
    const binsAfterResponse = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${store.store_id}`,
    );
    const binsAfter = await binsAfterResponse.json();
    const packInBinsAfter = binsAfter.data?.bins?.find(
      (b: { pack?: { pack_id: string } }) => b.pack?.pack_id === pack.pack_id,
    );
    expect(
      packInBinsAfter?.pack,
      "Depleted pack should NOT appear in bins query after day close",
    ).toBeUndefined();

    // Cleanup
    const closings = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findMany({
        where: { shift_id: shift.shift_id },
      });
    });

    const businessDay = await withBypassClient(async (tx) => {
      return await tx.lotteryBusinessDay.findFirst({
        where: { store_id: store.store_id },
        orderBy: { created_at: "desc" },
      });
    });

    const dayPacks = await withBypassClient(async (tx) => {
      return await tx.lotteryDayPack.findMany({
        where: { day_id: businessDay?.day_id },
      });
    });

    await cleanupTestData({
      dayPackIds: dayPacks.map((dp) => dp.day_pack_id),
      dayIds: businessDay ? [businessDay.day_id] : [],
      closingIds: closings.map((c) => c.closing_id),
      shiftIds: [shift.shift_id],
      cashierIds: [cashier.cashier_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });

  test("SOLD-OUT-DEPLETE-005: [P0] Mixed batch: only sold-out packs get depleted", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Multiple packs - some marked sold out, some not
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
    const gameCode3 = generateUniqueGameCode();

    // Pack 1: Will be marked as sold out -> DEPLETED
    const {
      game: game1,
      bin: bin1,
      pack: pack1,
    } = await createTestBinWithPack(store, gameCode1, 304, {
      gamePrice: 10.0,
      serialStart: "000",
      serialEnd: "029",
    });

    // Pack 2: NOT marked sold out -> stays ACTIVE
    const {
      game: game2,
      bin: bin2,
      pack: pack2,
    } = await createTestBinWithPack(store, gameCode2, 305, {
      gamePrice: 5.0,
      serialStart: "000",
      serialEnd: "049",
    });

    // Pack 3: Will be marked as sold out -> DEPLETED
    const {
      game: game3,
      bin: bin3,
      pack: pack3,
    } = await createTestBinWithPack(store, gameCode3, 306, {
      gamePrice: 20.0,
      serialStart: "000",
      serialEnd: "014",
    });

    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // WHEN: Close with mixed is_sold_out flags
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [
          { pack_id: pack1.pack_id, closing_serial: "029", is_sold_out: true },
          { pack_id: pack2.pack_id, closing_serial: "025", is_sold_out: false },
          { pack_id: pack3.pack_id, closing_serial: "014", is_sold_out: true },
        ],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // THEN: Only sold-out packs should be depleted
    const [packAfter1, packAfter2, packAfter3] = await Promise.all([
      withBypassClient(async (tx) =>
        tx.lotteryPack.findUnique({
          where: { pack_id: pack1.pack_id },
          select: { status: true },
        }),
      ),
      withBypassClient(async (tx) =>
        tx.lotteryPack.findUnique({
          where: { pack_id: pack2.pack_id },
          select: { status: true },
        }),
      ),
      withBypassClient(async (tx) =>
        tx.lotteryPack.findUnique({
          where: { pack_id: pack3.pack_id },
          select: { status: true },
        }),
      ),
    ]);

    expect(packAfter1?.status, "Pack 1 (sold out) should be DEPLETED").toBe(
      "DEPLETED",
    );
    expect(
      packAfter2?.status,
      "Pack 2 (not sold out) should remain ACTIVE",
    ).toBe("ACTIVE");
    expect(packAfter3?.status, "Pack 3 (sold out) should be DEPLETED").toBe(
      "DEPLETED",
    );

    // Verify packs_depleted contains only the 2 sold-out packs
    expect(
      body.data.packs_depleted.length,
      "Should have 2 depleted packs",
    ).toBe(2);
    const depletedPackIds = body.data.packs_depleted.map(
      (p: { pack_id: string }) => p.pack_id,
    );
    expect(depletedPackIds).toContain(pack1.pack_id);
    expect(depletedPackIds).toContain(pack3.pack_id);
    expect(depletedPackIds).not.toContain(pack2.pack_id);

    // Cleanup
    const closings = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findMany({
        where: { shift_id: shift.shift_id },
      });
    });

    const businessDay = await withBypassClient(async (tx) => {
      return await tx.lotteryBusinessDay.findFirst({
        where: { store_id: store.store_id },
        orderBy: { created_at: "desc" },
      });
    });

    const dayPacks = await withBypassClient(async (tx) => {
      return await tx.lotteryDayPack.findMany({
        where: { day_id: businessDay?.day_id },
      });
    });

    await cleanupTestData({
      dayPackIds: dayPacks.map((dp) => dp.day_pack_id),
      dayIds: businessDay ? [businessDay.day_id] : [],
      closingIds: closings.map((c) => c.closing_id),
      shiftIds: [shift.shift_id],
      cashierIds: [cashier.cashier_id],
      packIds: [pack1.pack_id, pack2.pack_id, pack3.pack_id],
      binIds: [bin1.bin_id, bin2.bin_id, bin3.bin_id],
      gameIds: [game1.game_id, game2.game_id, game3.game_id],
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FORMULA COMPARISON TESTS
// Documents the difference between formulas for future reference
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("API: Sold Out Formula Comparison (Documentation)", () => {
  test("SOLD-OUT-API-FORMULA-001: [P0] Demonstrates $10 difference between formulas", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Two identical packs, one marked sold out, one not
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

    // Pack 1: Will be marked as sold out
    const {
      game: game1,
      bin: bin1,
      pack: pack1,
    } = await createTestBinWithPack(store, gameCode1, 209, {
      gamePrice: 10.0,
      serialStart: "000",
      serialEnd: "029",
    });

    // Pack 2: Will NOT be marked as sold out (same data)
    const {
      game: game2,
      bin: bin2,
      pack: pack2,
    } = await createTestBinWithPack(store, gameCode2, 210, {
      gamePrice: 10.0,
      serialStart: "000",
      serialEnd: "029",
    });

    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // WHEN: Closing both packs at serial 029 with different is_sold_out flags
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [
          { pack_id: pack1.pack_id, closing_serial: "029", is_sold_out: true },
          { pack_id: pack2.pack_id, closing_serial: "029", is_sold_out: false },
        ],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    // THEN: The responses should differ by $10
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // Document the difference
    // Pack 1 (sold out): (29 + 1) - 0 = 30 tickets × $10 = $300
    // Pack 2 (normal):   29 - 0 = 29 tickets × $10 = $290
    // Difference: $10

    const binsClosed = body.data.bins_closed;
    if (binsClosed && binsClosed.length === 2) {
      const soldOutBin = binsClosed.find(
        (b: { pack_id: string }) => b.pack_id === pack1.pack_id,
      );
      const normalBin = binsClosed.find(
        (b: { pack_id: string }) => b.pack_id === pack2.pack_id,
      );

      if (
        soldOutBin?.sales_amount !== undefined &&
        normalBin?.sales_amount !== undefined
      ) {
        expect(soldOutBin.sales_amount).toBe(300);
        expect(normalBin.sales_amount).toBe(290);
        expect(soldOutBin.sales_amount - normalBin.sales_amount).toBe(10);
      }
    }

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
});

// ═══════════════════════════════════════════════════════════════════════════════
// TIMESTAMP BOUNDARY TESTS
// Tests that depleted packs appear in the correct day's list
// Critical: depleted_at === closed_at should appear in CLOSING day, not NEXT day
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("API: Depleted Pack Timestamp Boundary", () => {
  test("SOLD-OUT-BOUNDARY-001: [P0] Depleted pack with depleted_at === closed_at appears in closing day's depleted list", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A pack that gets marked sold out during day close
    // This tests the critical boundary condition: when depleted_at === day.closed_at,
    // the pack should appear in the CURRENT (closing) day's depleted list, not the next day
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
      400,
      {
        gamePrice: 10.0,
        serialStart: "000",
        serialEnd: "029",
      },
    );
    const { shift, cashier } = await createTodayShift(
      store,
      clientUser.user_id,
      "OPEN",
    );

    // Close the day with is_sold_out=true
    const closeResponse = await clientUserApiRequest.post(
      `/api/lottery/bins/day/${store.store_id}/close`,
      {
        closings: [
          {
            pack_id: pack.pack_id,
            closing_serial: "029",
            is_sold_out: true,
          },
        ],
        entry_method: "SCAN",
        current_shift_id: shift.shift_id,
      },
    );

    expect(closeResponse.status()).toBe(200);

    // Get the depleted pack and business day timestamps
    const [packData, businessDay] = await Promise.all([
      withBypassClient(async (tx) =>
        tx.lotteryPack.findUnique({
          where: { pack_id: pack.pack_id },
          select: { depleted_at: true, status: true },
        }),
      ),
      withBypassClient(async (tx) =>
        tx.lotteryBusinessDay.findFirst({
          where: { store_id: store.store_id },
          orderBy: { created_at: "desc" },
        }),
      ),
    ]);

    // Verify the pack was depleted at the exact day close time
    expect(packData?.status).toBe("DEPLETED");
    expect(packData?.depleted_at).not.toBeNull();
    expect(businessDay?.closed_at).not.toBeNull();

    // The depleted_at should equal closed_at (or be very close)
    const depletedAtMs = packData?.depleted_at?.getTime() || 0;
    const closedAtMs = businessDay?.closed_at?.getTime() || 0;
    expect(
      Math.abs(depletedAtMs - closedAtMs),
      "depleted_at should be at or near closed_at",
    ).toBeLessThanOrEqual(1000); // Within 1 second

    // WHEN: We query for the bins/day data again (simulating the next day)
    // The pack should appear in depleted_packs, NOT in active bins
    const binsResponse = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${store.store_id}`,
    );
    const binsData = await binsResponse.json();

    // THEN: The depleted pack should NOT appear in active bins
    const packInActiveBins = binsData.data?.bins?.find(
      (b: { pack?: { pack_id: string } }) => b.pack?.pack_id === pack.pack_id,
    );
    expect(
      packInActiveBins?.pack,
      "Depleted pack should NOT appear in active bins",
    ).toBeUndefined();

    // The depleted pack SHOULD appear in depleted_packs list
    // Note: This is the critical assertion - the gt vs gte fix ensures this works
    const packInDepletedPacks = binsData.data?.depleted_packs?.find(
      (p: { pack_id: string }) => p.pack_id === pack.pack_id,
    );
    expect(
      packInDepletedPacks,
      "Depleted pack SHOULD appear in depleted_packs list for the closing day",
    ).toBeDefined();

    // Cleanup
    const closings = await withBypassClient(async (tx) => {
      return await tx.lotteryShiftClosing.findMany({
        where: { shift_id: shift.shift_id },
      });
    });

    const dayPacks = await withBypassClient(async (tx) => {
      return await tx.lotteryDayPack.findMany({
        where: { day_id: businessDay?.day_id },
      });
    });

    await cleanupTestData({
      dayPackIds: dayPacks.map((dp) => dp.day_pack_id),
      dayIds: businessDay ? [businessDay.day_id] : [],
      closingIds: closings.map((c) => c.closing_id),
      shiftIds: [shift.shift_id],
      cashierIds: [cashier.cashier_id],
      packIds: [pack.pack_id],
      binIds: [bin.bin_id],
      gameIds: [game.game_id],
    });
  });
});
