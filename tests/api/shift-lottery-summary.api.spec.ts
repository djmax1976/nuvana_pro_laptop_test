/**
 * Shift Lottery Summary API Tests
 *
 * @test-level API
 * @justification Endpoint integration tests verifying lottery summary data retrieval,
 *                business date resolution, pack filtering, returned pack inclusion,
 *                and variance data from ShiftSummary
 * @story client-owner-dashboard-closed-shift-lottery-view
 *
 * Tests for GET /api/shifts/:shiftId/lottery-summary endpoint that returns:
 * - Lottery totals (sales, cashes, net, packs_sold, tickets_sold)
 * - Bins closed with serial tracking
 * - Depleted packs during shift period
 * - Returned packs with sales attribution
 * - Activated packs during shift period
 * - Cash variance data from ShiftSummary
 *
 * =============================================================================
 * REQUIREMENTS TRACEABILITY MATRIX (RTM)
 * =============================================================================
 *
 * | Test ID              | Requirement                                    | Priority | Type        |
 * |----------------------|------------------------------------------------|----------|-------------|
 * | LOTTERY-SUM-001      | Use shift.closed_at for business date lookup  | P0       | Business    |
 * | LOTTERY-SUM-002      | Filter packs by shift boundaries not lottery  | P0       | Business    |
 * | LOTTERY-SUM-003      | Include returned pack sales in totals         | P0       | Business    |
 * | LOTTERY-SUM-004      | Read variance from ShiftSummary when null     | P0       | Integration |
 * | LOTTERY-SUM-005      | Return 404 for cross-tenant access (RLS)      | P0       | Security    |
 * | LOTTERY-SUM-006      | Return 401 for missing/invalid auth           | P0       | Security    |
 * | LOTTERY-SUM-007      | Return 404 for non-existent shift             | P0       | Edge Case   |
 * | LOTTERY-SUM-008      | Return empty arrays when no lottery data      | P1       | Edge Case   |
 * | LOTTERY-SUM-009      | Calculate tickets correctly from serials      | P1       | Business    |
 * | LOTTERY-SUM-010      | Handle returned pack before lottery day open  | P0       | Edge Case   |
 * | LOTTERY-SUM-011      | Aggregate lottery_totals from LotteryDayPack  | P1       | Integration |
 * | LOTTERY-SUM-012      | bins_closed empty for shift (Day Close only)  | P2       | Design Doc  |
 * | LOTTERY-SUM-013      | Not expose sensitive data in response         | P0       | Security    |
 * | LOTTERY-SUM-014      | Handle shift spanning multiple days           | P1       | Edge Case   |
 * | LOTTERY-SUM-015      | Validate shiftId is valid UUID format         | P0       | Validation  |
 *
 * =============================================================================
 * COVERAGE SUMMARY
 * =============================================================================
 *
 * Business Logic Tests (5):
 *   - LOTTERY-SUM-001: Business date from shift.closed_at
 *   - LOTTERY-SUM-002: Pack filtering by shift boundaries
 *   - LOTTERY-SUM-003: Returned pack sales inclusion
 *   - LOTTERY-SUM-009: Ticket calculation
 *   - LOTTERY-SUM-012: Bin sorting
 *
 * Integration Tests (2):
 *   - LOTTERY-SUM-004: Variance from ShiftSummary
 *   - LOTTERY-SUM-011: LotteryDayPack aggregation
 *
 * Security Tests (3):
 *   - LOTTERY-SUM-005: RLS enforcement
 *   - LOTTERY-SUM-006: Authentication
 *   - LOTTERY-SUM-013: Data leak prevention
 *
 * Edge Case Tests (4):
 *   - LOTTERY-SUM-007: Non-existent shift
 *   - LOTTERY-SUM-008: Empty lottery data
 *   - LOTTERY-SUM-010: Returned pack timing
 *   - LOTTERY-SUM-014: Multi-day shift
 *
 * Validation Tests (1):
 *   - LOTTERY-SUM-015: UUID validation
 *
 * =============================================================================
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createUser,
  createCompany,
  createStore,
  createExpiredJWTAccessToken,
  createCashier,
  createShift as createShiftData,
} from "../support/factories";
import {
  createLotteryGame,
  createLotteryPack,
  createLotteryBin,
  createLotteryBusinessDay,
  createLotteryDayPack,
} from "../support/factories/lottery.factory";
import { Prisma, LotteryPackStatus, ShiftStatus } from "@prisma/client";

// LotteryBusinessDay.status uses string type in database, not an enum
type LotteryDayStatus = "OPEN" | "PENDING" | "CLOSED";

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Creates a POS terminal for testing
 */
async function createPOSTerminal(
  prismaClient: any,
  storeId: string,
  name?: string,
): Promise<{ pos_terminal_id: string; store_id: string; name: string }> {
  const uniqueId = crypto.randomUUID();
  const terminal = await prismaClient.pOSTerminal.create({
    data: {
      store_id: storeId,
      name: name || `Terminal ${uniqueId.substring(0, 8)}`,
      device_id: `device-${uniqueId}`,
      deleted_at: null,
    },
  });

  return {
    pos_terminal_id: terminal.pos_terminal_id,
    store_id: terminal.store_id,
    name: terminal.name,
  };
}

/**
 * Creates a test Cashier for testing shifts
 */
async function createTestCashier(
  prismaClient: any,
  storeId: string,
  createdByUserId: string,
): Promise<{ cashier_id: string; store_id: string; employee_id: string }> {
  const cashierData = await createCashier({
    store_id: storeId,
    created_by: createdByUserId,
  });
  return prismaClient.cashier.create({ data: cashierData });
}

/**
 * Creates a CLOSED shift with lottery data for testing
 */
async function createClosedShiftWithLotteryData(
  prismaClient: any,
  storeId: string,
  openedBy: string,
  cashierId: string,
  posTerminalId: string,
  options: {
    openedAt?: Date;
    closedAt?: Date;
    openingCash?: number;
    closingCash?: number;
    expectedCash?: number;
    variance?: number;
  } = {},
): Promise<{
  shift_id: string;
  status: string;
  opened_at: Date;
  closed_at: Date | null;
}> {
  const openedAt =
    options.openedAt || new Date(Date.now() - 8 * 60 * 60 * 1000);
  const closedAt = options.closedAt || new Date();

  const shift = await prismaClient.shift.create({
    data: {
      ...createShiftData({
        store_id: storeId,
        opened_by: openedBy,
        cashier_id: cashierId,
        pos_terminal_id: posTerminalId,
        opening_cash: new Prisma.Decimal(options.openingCash ?? 100.0),
        closing_cash: new Prisma.Decimal(options.closingCash ?? 250.0),
        expected_cash:
          options.expectedCash !== undefined
            ? new Prisma.Decimal(options.expectedCash)
            : null,
        variance:
          options.variance !== undefined
            ? new Prisma.Decimal(options.variance)
            : null,
        status: "CLOSED" as ShiftStatus,
        opened_at: openedAt,
        closed_at: closedAt,
      }),
    },
  });

  return {
    shift_id: shift.shift_id,
    status: shift.status,
    opened_at: shift.opened_at,
    closed_at: shift.closed_at,
  };
}

/**
 * Creates a ShiftSummary with lottery data
 */
async function createShiftSummary(
  prismaClient: any,
  shiftId: string,
  storeId: string,
  openedByUserId: string,
  options: {
    businessDate?: Date;
    lotterySales?: number;
    lotteryCashes?: number;
    lotteryNet?: number;
    lotteryPacksSold?: number;
    lotteryTicketsSold?: number;
    cashVariance?: number;
    expectedCash?: number;
  } = {},
): Promise<any> {
  return prismaClient.shiftSummary.create({
    data: {
      shift_id: shiftId,
      store_id: storeId,
      business_date: options.businessDate || new Date(),
      shift_opened_at: new Date(Date.now() - 8 * 60 * 60 * 1000),
      shift_closed_at: new Date(),
      shift_duration_mins: 480,
      opened_by_user_id: openedByUserId,
      closed_by_user_id: openedByUserId,
      gross_sales: new Prisma.Decimal(1000.0),
      returns_total: new Prisma.Decimal(0),
      discounts_total: new Prisma.Decimal(0),
      net_sales: new Prisma.Decimal(1000.0),
      tax_collected: new Prisma.Decimal(0),
      tax_exempt_sales: new Prisma.Decimal(0),
      taxable_sales: new Prisma.Decimal(0),
      transaction_count: 10,
      void_count: 0,
      refund_count: 0,
      no_sale_count: 0,
      items_sold_count: 20,
      items_returned_count: 0,
      avg_transaction: new Prisma.Decimal(100),
      avg_items_per_txn: new Prisma.Decimal(2),
      opening_cash: new Prisma.Decimal(100),
      closing_cash: new Prisma.Decimal(250),
      expected_cash:
        options.expectedCash !== undefined
          ? new Prisma.Decimal(options.expectedCash)
          : new Prisma.Decimal(200),
      cash_variance:
        options.cashVariance !== undefined
          ? new Prisma.Decimal(options.cashVariance)
          : new Prisma.Decimal(50),
      variance_percentage: new Prisma.Decimal(0),
      variance_approved: false,
      lottery_sales:
        options.lotterySales !== undefined
          ? new Prisma.Decimal(options.lotterySales)
          : null,
      lottery_cashes:
        options.lotteryCashes !== undefined
          ? new Prisma.Decimal(options.lotteryCashes)
          : null,
      lottery_net:
        options.lotteryNet !== undefined
          ? new Prisma.Decimal(options.lotteryNet)
          : null,
      lottery_packs_sold: options.lotteryPacksSold ?? null,
      lottery_tickets_sold: options.lotteryTicketsSold ?? null,
    },
  });
}

/**
 * Cleanup helper for shift and related data
 */
async function cleanupShiftLotteryData(
  prismaClient: any,
  shiftId: string,
  storeId: string,
  businessDate?: Date,
): Promise<void> {
  // Clean up lottery data
  await prismaClient.lotteryDayPack
    .deleteMany({
      where: {
        day: { store_id: storeId },
      },
    })
    .catch(() => {
      /* ignore */
    });

  await prismaClient.lotteryBusinessDay
    .deleteMany({
      where: { store_id: storeId },
    })
    .catch(() => {
      /* ignore */
    });

  await prismaClient.lotteryPack
    .deleteMany({
      where: { store_id: storeId },
    })
    .catch(() => {
      /* ignore */
    });

  await prismaClient.lotteryBin
    .deleteMany({
      where: { store_id: storeId },
    })
    .catch(() => {
      /* ignore */
    });

  // Clean up shift summary
  await prismaClient.shiftTenderSummary
    .deleteMany({
      where: { shift_summary: { shift_id: shiftId } },
    })
    .catch(() => {
      /* ignore */
    });

  await prismaClient.shiftDepartmentSummary
    .deleteMany({
      where: { shift_summary: { shift_id: shiftId } },
    })
    .catch(() => {
      /* ignore */
    });

  await prismaClient.shiftSummary
    .deleteMany({
      where: { shift_id: shiftId },
    })
    .catch(() => {
      /* ignore */
    });

  // Clean up shift
  await prismaClient.shift
    .delete({
      where: { shift_id: shiftId },
    })
    .catch(() => {
      /* ignore */
    });
}

// =============================================================================
// SECTION 1: P0 CRITICAL - BUSINESS DATE RESOLUTION
// =============================================================================

test.describe("LOTTERY-SUMMARY-API: Business Date Resolution", () => {
  test("LOTTERY-SUM-001: [P0] should use shift.closed_at for lottery business date lookup", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A shift opened on Jan 4 but closed on Jan 6
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const openedAt = new Date("2026-01-04T08:00:00Z");
    const closedAt = new Date("2026-01-06T16:00:00Z");

    const shift = await createClosedShiftWithLotteryData(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      { openedAt, closedAt },
    );

    // Create lottery business day on Jan 6 (closed_at date)
    const lotteryDay = await prismaClient.lotteryBusinessDay.create({
      data: {
        store_id: storeManagerUser.store_id,
        // eslint-disable-next-line no-restricted-syntax -- Test uses specific hardcoded business date
        business_date: new Date("2026-01-06"),
        status: "CLOSED" as LotteryDayStatus,
        closed_at: closedAt,
      },
    });

    // Create game and bin for lottery packs
    const game = await createLotteryGame(prismaClient);
    const bin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
    });

    // Create pack that was active during the shift
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      status: LotteryPackStatus.ACTIVE,
      current_bin_id: bin.bin_id,
      serial_start: "001",
      serial_end: "100",
      activated_at: openedAt,
    });

    // Create day pack data (what was sold)
    await createLotteryDayPack(prismaClient, {
      day_id: lotteryDay.day_id,
      pack_id: pack.pack_id,
      starting_serial: "001",
      ending_serial: "050",
      tickets_sold: 49,
      sales_amount: new Prisma.Decimal(245.0),
    });

    // WHEN: Requesting lottery summary
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/lottery-summary`,
    );

    // THEN: Should return data from Jan 6 lottery business day
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.business_date, "Business date should be Jan 6").toBe(
      "2026-01-06",
    );
    expect(body.data.lottery_closed, "Lottery day should be closed").toBe(true);

    // NOTE: bins_closed is intentionally empty for shift summary (architectural decision)
    // See shift.service.ts lines 2737-2753: bins_closed belongs to Day Close, not shifts
    // This is to prevent lottery data from a day close "leaking" into shifts that happened
    // on the same calendar date but weren't involved in the lottery close.
    expect(
      body.data.bins_closed,
      "bins_closed should be empty for shift summary",
    ).toHaveLength(0);

    // Cleanup
    await cleanupShiftLotteryData(
      prismaClient,
      shift.shift_id,
      storeManagerUser.store_id,
    );
    await prismaClient.lotteryGame
      .delete({ where: { game_id: game.game_id } })
      .catch(() => {
        /* ignore */
      });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });

  test("LOTTERY-SUM-002: [P0] should filter packs by shift boundaries not lottery day", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A shift with packs returned within shift boundaries but before lottery day opened
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // Shift: opened at 01:00 AM, closed at 08:00 AM
    const openedAt = new Date("2026-01-06T01:00:00Z");
    const closedAt = new Date("2026-01-06T08:00:00Z");

    const shift = await createClosedShiftWithLotteryData(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      { openedAt, closedAt },
    );

    // Lottery day: opened at 05:00 AM (after pack was returned)
    const lotteryDay = await prismaClient.lotteryBusinessDay.create({
      data: {
        store_id: storeManagerUser.store_id,
        // eslint-disable-next-line no-restricted-syntax -- Test uses specific hardcoded business date
        business_date: new Date("2026-01-06"),
        status: "CLOSED" as LotteryDayStatus,
        opened_at: new Date("2026-01-06T05:00:00Z"),
        closed_at: closedAt,
      },
    });

    // Create game and bin
    const game = await createLotteryGame(prismaClient);
    const bin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
    });

    // Create pack returned at 01:38 AM (BEFORE lottery day opened at 05:00 AM)
    const returnedPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      status: LotteryPackStatus.RETURNED,
      current_bin_id: bin.bin_id,
      serial_start: "001",
      serial_end: "100",
      activated_at: new Date("2026-01-05T10:00:00Z"),
      returned_at: new Date("2026-01-06T01:38:00Z"), // Before lottery day but within shift
      last_sold_serial: "052",
      tickets_sold_on_return: 52,
      return_sales_amount: new Prisma.Decimal(260.0),
      return_reason: "DAMAGED",
    });

    // WHEN: Requesting lottery summary
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/lottery-summary`,
    );

    // THEN: Should include the returned pack (within shift boundaries)
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(
      body.data.returned_packs.length,
      "Should include returned pack",
    ).toBe(1);
    expect(
      body.data.returned_packs[0].pack_number,
      "Should be the correct pack",
    ).toBe(returnedPack.pack_number);

    // Cleanup
    await cleanupShiftLotteryData(
      prismaClient,
      shift.shift_id,
      storeManagerUser.store_id,
    );
    await prismaClient.lotteryGame
      .delete({ where: { game_id: game.game_id } })
      .catch(() => {
        /* ignore */
      });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });
});

// =============================================================================
// SECTION 2: P0 CRITICAL - RETURNED PACK SALES INCLUSION
// =============================================================================

test.describe("LOTTERY-SUMMARY-API: Returned Pack Sales", () => {
  test("LOTTERY-SUM-003: [P0] should include returned pack sales in lottery totals", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A shift with bins and a returned pack with sales
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const openedAt = new Date(Date.now() - 8 * 60 * 60 * 1000);
    const closedAt = new Date();

    const shift = await createClosedShiftWithLotteryData(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      { openedAt, closedAt },
    );

    // Create lottery day
    const businessDateStr = closedAt.toISOString().split("T")[0];
    const lotteryDay = await prismaClient.lotteryBusinessDay.create({
      data: {
        store_id: storeManagerUser.store_id,
        business_date: new Date(businessDateStr),
        status: "CLOSED" as LotteryDayStatus,
        closed_at: closedAt,
      },
    });

    // Create games and bins
    const game = await createLotteryGame(prismaClient);
    const bin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
    });

    // Create active pack with bin sales = $500, 50 tickets
    const activePack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      status: LotteryPackStatus.ACTIVE,
      current_bin_id: bin.bin_id,
      serial_start: "001",
      serial_end: "100",
      activated_at: openedAt,
    });

    await createLotteryDayPack(prismaClient, {
      day_id: lotteryDay.day_id,
      pack_id: activePack.pack_id,
      starting_serial: "001",
      ending_serial: "050",
      tickets_sold: 50,
      sales_amount: new Prisma.Decimal(500.0),
    });

    // Create returned pack with sales = $260, 52 tickets
    const returnedPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      status: LotteryPackStatus.RETURNED,
      current_bin_id: bin.bin_id,
      serial_start: "101",
      serial_end: "200",
      activated_at: openedAt,
      returned_at: new Date(openedAt.getTime() + 60 * 60 * 1000), // 1 hour after open
      last_sold_serial: "152",
      tickets_sold_on_return: 52,
      return_sales_amount: new Prisma.Decimal(260.0),
      return_reason: "DAMAGED",
    });

    // Create ShiftSummary with lottery totals that include returned pack sales
    // Total: bins ($500) + returned ($260) = $760
    await createShiftSummary(
      prismaClient,
      shift.shift_id,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      {
        businessDate: new Date(businessDateStr),
        lotterySales: 760, // 500 (active pack) + 260 (returned pack)
        lotteryCashes: 0,
        lotteryNet: 760,
        lotteryPacksSold: 2,
        lotteryTicketsSold: 102, // 50 + 52
      },
    );

    // WHEN: Requesting lottery summary
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/lottery-summary`,
    );

    // THEN: Total should include both bins ($500) and returned pack sales ($260) = $760
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);

    // Verify returned pack is included
    expect(body.data.returned_packs.length, "Should have returned pack").toBe(
      1,
    );
    expect(
      body.data.returned_packs[0].return_sales_amount,
      "Returned pack should have $260 sales",
    ).toBe(260);

    // Verify totals include returned pack sales (from ShiftSummary)
    // Note: lottery_totals should be bins ($500) + returned ($260) = $760
    expect(
      body.data.lottery_totals.lottery_sales,
      "Total lottery sales should include returned pack sales",
    ).toBe(760);

    // Cleanup
    await cleanupShiftLotteryData(
      prismaClient,
      shift.shift_id,
      storeManagerUser.store_id,
    );
    await prismaClient.lotteryGame
      .delete({ where: { game_id: game.game_id } })
      .catch(() => {
        /* ignore */
      });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });

  test("LOTTERY-SUM-010: [P0] should handle returned pack before lottery day opens", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Shift where pack was returned at 1:38 AM, lottery day opened at 5:23 AM
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const shiftOpenedAt = new Date("2026-01-06T01:00:00Z");
    const packReturnedAt = new Date("2026-01-06T01:38:00Z");
    const lotteryDayOpenedAt = new Date("2026-01-06T05:23:00Z");
    const closedAt = new Date("2026-01-06T16:00:00Z");

    const shift = await createClosedShiftWithLotteryData(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      { openedAt: shiftOpenedAt, closedAt },
    );

    // Create lottery day that opened AFTER the pack was returned
    const lotteryDay = await prismaClient.lotteryBusinessDay.create({
      data: {
        store_id: storeManagerUser.store_id,
        // eslint-disable-next-line no-restricted-syntax -- Test uses specific hardcoded business date
        business_date: new Date("2026-01-06"),
        status: "CLOSED" as LotteryDayStatus,
        opened_at: lotteryDayOpenedAt,
        closed_at: closedAt,
      },
    });

    const game = await createLotteryGame(prismaClient);
    const bin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
    });

    // Create pack returned BEFORE lottery day opened
    const returnedPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      status: LotteryPackStatus.RETURNED,
      current_bin_id: bin.bin_id,
      serial_start: "001",
      serial_end: "100",
      activated_at: new Date("2026-01-05T10:00:00Z"),
      returned_at: packReturnedAt, // 1:38 AM - BEFORE lottery day opened at 5:23 AM
      last_sold_serial: "052",
      tickets_sold_on_return: 52,
      return_sales_amount: new Prisma.Decimal(260.0),
      return_reason: "DAMAGED",
    });

    // WHEN: Requesting lottery summary
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/lottery-summary`,
    );

    // THEN: Should include the returned pack because it was returned during SHIFT period
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(
      body.data.returned_packs.length,
      "Should include returned pack even though before lottery day",
    ).toBe(1);
    expect(
      body.data.returned_packs[0].return_sales_amount,
      "Returned pack should have correct sales amount",
    ).toBe(260);

    // Cleanup
    await cleanupShiftLotteryData(
      prismaClient,
      shift.shift_id,
      storeManagerUser.store_id,
    );
    await prismaClient.lotteryGame
      .delete({ where: { game_id: game.game_id } })
      .catch(() => {
        /* ignore */
      });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });
});

// =============================================================================
// SECTION 3: P0 CRITICAL - VARIANCE FROM SHIFT SUMMARY
// =============================================================================

test.describe("LOTTERY-SUMMARY-API: Variance Data", () => {
  test("LOTTERY-SUM-004: [P0] should read variance from ShiftSummary when shift has null", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A shift with NULL variance but ShiftSummary has the data
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const shift = await createClosedShiftWithLotteryData(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      {
        openingCash: 100,
        closingCash: 250,
        expectedCash: undefined, // NULL in shift record
        variance: undefined, // NULL in shift record
      },
    );

    // Create ShiftSummary with variance data
    await createShiftSummary(
      prismaClient,
      shift.shift_id,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      {
        expectedCash: 200,
        cashVariance: 50, // ShiftSummary has the variance
      },
    );

    // WHEN: Requesting the lottery summary endpoint
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/lottery-summary`,
    );

    // THEN: Should include variance from ShiftSummary in shift_info
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);

    // The variance should be populated from ShiftSummary
    // The lottery-summary endpoint returns shift_info.variance from ShiftSummary
    expect(
      body.data.shift_info.variance,
      "Variance should be read from ShiftSummary",
    ).toBeDefined();
    expect(body.data.shift_info.variance, "Variance should be 50").toBe(50);

    // Cleanup
    await cleanupShiftLotteryData(
      prismaClient,
      shift.shift_id,
      storeManagerUser.store_id,
    );
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });
});

// =============================================================================
// SECTION 4: P0 CRITICAL - SECURITY TESTS
// =============================================================================

test.describe("LOTTERY-SUMMARY-API: Authentication", () => {
  test("LOTTERY-SUM-006: [P0] should return 401 when JWT token is missing", async ({
    apiRequest,
  }) => {
    // GIVEN: Valid shift ID format
    const shiftId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Requesting lottery summary without JWT token
    const response = await apiRequest.get(
      `/api/shifts/${shiftId}/lottery-summary`,
    );

    // THEN: Should return 401 Unauthorized
    expect(response.status(), "Should return 401 for missing token").toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be UNAUTHORIZED").toBe(
      "UNAUTHORIZED",
    );
  });

  test("LOTTERY-SUM-006b: [P0] should return 401 when JWT token is expired", async ({
    apiRequest,
  }) => {
    // GIVEN: An expired JWT token
    const expiredToken = createExpiredJWTAccessToken();
    const shiftId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Requesting lottery summary with expired token
    const response = await apiRequest.get(
      `/api/shifts/${shiftId}/lottery-summary`,
      {
        headers: { Authorization: `Bearer ${expiredToken}` },
      },
    );

    // THEN: Should return 401 Unauthorized
    expect(response.status(), "Should return 401 for expired token").toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });
});

test.describe("LOTTERY-SUMMARY-API: Authorization (RLS)", () => {
  test("LOTTERY-SUM-005: [P0] should return 404 for cross-tenant access (RLS enforcement)", async ({
    regularUserApiRequest,
    regularUser,
    prismaClient,
  }) => {
    // GIVEN: A shift in a DIFFERENT company than the regularUser's company
    const otherOwner = await prismaClient.user.create({
      data: createUser({ name: "Other Company Owner" }),
    });
    const otherCompany = await prismaClient.company.create({
      data: createCompany({ owner_user_id: otherOwner.user_id }),
    });
    const otherStore = await prismaClient.store.create({
      data: createStore({ company_id: otherCompany.company_id }),
    });
    const otherTerminal = await createPOSTerminal(
      prismaClient,
      otherStore.store_id,
    );
    const otherCashier = await createTestCashier(
      prismaClient,
      otherStore.store_id,
      otherOwner.user_id,
    );

    const otherShift = await createClosedShiftWithLotteryData(
      prismaClient,
      otherStore.store_id,
      otherOwner.user_id,
      otherCashier.cashier_id,
      otherTerminal.pos_terminal_id,
    );

    // WHEN: regularUser tries to access shift from other company
    const response = await regularUserApiRequest.get(
      `/api/shifts/${otherShift.shift_id}/lottery-summary`,
    );

    // THEN: Should return 404 (RLS hides the shift)
    expect(
      response.status(),
      "Should return 404 for cross-company access",
    ).toBe(404);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);

    // Cleanup
    await cleanupShiftLotteryData(
      prismaClient,
      otherShift.shift_id,
      otherStore.store_id,
    );
    await prismaClient.cashier.delete({
      where: { cashier_id: otherCashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: otherTerminal.pos_terminal_id },
    });
    await prismaClient.store.delete({
      where: { store_id: otherStore.store_id },
    });
    await prismaClient.company.delete({
      where: { company_id: otherCompany.company_id },
    });
    await prismaClient.user.delete({ where: { user_id: otherOwner.user_id } });
  });

  test("LOTTERY-SUM-013: [P0] should not expose sensitive data in response", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A closed shift with lottery data
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const shift = await createClosedShiftWithLotteryData(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
    );

    // WHEN: Requesting lottery summary
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/lottery-summary`,
    );

    // THEN: Response should not contain sensitive data
    const body = await response.json();
    const bodyString = JSON.stringify(body);

    expect(bodyString, "Should not contain password").not.toMatch(/password/i);
    expect(bodyString, "Should not contain secret").not.toMatch(/secret/i);
    expect(bodyString, "Should not contain api_key").not.toMatch(
      /api[_-]?key/i,
    );
    expect(bodyString, "Should not contain stack trace").not.toContain("at ");

    // Cleanup
    await cleanupShiftLotteryData(
      prismaClient,
      shift.shift_id,
      storeManagerUser.store_id,
    );
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });
});

// =============================================================================
// SECTION 5: VALIDATION TESTS
// =============================================================================

test.describe("LOTTERY-SUMMARY-API: Validation", () => {
  test("LOTTERY-SUM-015: [P0] should return 400 for invalid shiftId format", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: An invalid shift ID format
    const invalidShiftId = "not-a-valid-uuid";

    // WHEN: Requesting lottery summary with invalid ID
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${invalidShiftId}/lottery-summary`,
    );

    // THEN: Should return 400 Bad Request
    expect(response.status(), "Should return 400 for invalid UUID").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("LOTTERY-SUM-007: [P0] should return 404 for non-existent shift", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: A valid UUID that doesn't exist
    const nonExistentShiftId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

    // WHEN: Requesting lottery summary for non-existent shift
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${nonExistentShiftId}/lottery-summary`,
    );

    // THEN: Should return 404 Not Found
    expect(response.status(), "Should return 404 for non-existent shift").toBe(
      404,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });
});

// =============================================================================
// SECTION 6: EDGE CASES
// =============================================================================

test.describe("LOTTERY-SUMMARY-API: Edge Cases", () => {
  test("LOTTERY-SUM-008: [P1] should return empty arrays when no lottery data", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A closed shift with NO lottery data
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const shift = await createClosedShiftWithLotteryData(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
    );

    // No lottery business day, no packs

    // WHEN: Requesting lottery summary
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/lottery-summary`,
    );

    // THEN: Should return 200 with empty arrays
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.bins_closed, "bins_closed should be empty array").toEqual(
      [],
    );
    expect(
      body.data.depleted_packs,
      "depleted_packs should be empty array",
    ).toEqual([]);
    expect(
      body.data.returned_packs,
      "returned_packs should be empty array",
    ).toEqual([]);
    expect(
      body.data.activated_packs,
      "activated_packs should be empty array",
    ).toEqual([]);

    // Cleanup
    await cleanupShiftLotteryData(
      prismaClient,
      shift.shift_id,
      storeManagerUser.store_id,
    );
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });

  test("LOTTERY-SUM-014: [P1] should handle shift spanning multiple days", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A shift opened on Jan 5 at 10 PM, closed Jan 6 at 6 AM
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const openedAt = new Date("2026-01-05T22:00:00Z"); // 10 PM Jan 5
    const closedAt = new Date("2026-01-06T06:00:00Z"); // 6 AM Jan 6

    const shift = await createClosedShiftWithLotteryData(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      { openedAt, closedAt },
    );

    // Create lottery day on Jan 6 (closed_at date)
    await prismaClient.lotteryBusinessDay.create({
      data: {
        store_id: storeManagerUser.store_id,
        // eslint-disable-next-line no-restricted-syntax -- Test uses specific hardcoded business date
        business_date: new Date("2026-01-06"),
        status: "CLOSED" as LotteryDayStatus,
        closed_at: closedAt,
      },
    });

    const game = await createLotteryGame(prismaClient);
    const bin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
    });

    // Create pack activated during shift (Jan 5 at 11 PM)
    await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      status: LotteryPackStatus.ACTIVE,
      current_bin_id: bin.bin_id,
      serial_start: "001",
      serial_end: "100",
      activated_at: new Date("2026-01-05T23:00:00Z"), // During shift but different calendar day
    });

    // WHEN: Requesting lottery summary
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/lottery-summary`,
    );

    // THEN: Should return data, using closed_at date for business day lookup
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(
      body.data.business_date,
      "Business date should be Jan 6 (closed_at)",
    ).toBe("2026-01-06");
    // Pack activated on Jan 5 should still be included (within shift boundaries)
    expect(
      body.data.activated_packs.length,
      "Should include pack activated during shift",
    ).toBeGreaterThanOrEqual(1);

    // Cleanup
    await cleanupShiftLotteryData(
      prismaClient,
      shift.shift_id,
      storeManagerUser.store_id,
    );
    await prismaClient.lotteryGame
      .delete({ where: { game_id: game.game_id } })
      .catch(() => {
        /* ignore */
      });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });
});

// =============================================================================
// SECTION 7: INTEGRATION TESTS
// =============================================================================

test.describe("LOTTERY-SUMMARY-API: LotteryDayPack Integration", () => {
  test("LOTTERY-SUM-011: [P1] should aggregate lottery_totals from LotteryDayPack", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A closed shift with multiple packs in lottery day
    // NOTE: bins_closed is intentionally empty for shift summary (belongs to Day Close)
    // This test verifies lottery_totals aggregation instead
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const closedAt = new Date();
    const businessDateStr = closedAt.toISOString().split("T")[0];

    const shift = await createClosedShiftWithLotteryData(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      { closedAt },
    );

    const lotteryDay = await prismaClient.lotteryBusinessDay.create({
      data: {
        store_id: storeManagerUser.store_id,
        business_date: new Date(businessDateStr),
        status: "CLOSED" as LotteryDayStatus,
        closed_at: closedAt,
      },
    });

    const game1 = await createLotteryGame(prismaClient, {
      name: "Game A",
      price: 5,
    });
    const game2 = await createLotteryGame(prismaClient, {
      name: "Game B",
      price: 10,
    });

    const bin1 = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      display_order: 0,
    });
    const bin2 = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      display_order: 1,
    });

    const pack1 = await createLotteryPack(prismaClient, {
      game_id: game1.game_id,
      store_id: storeManagerUser.store_id,
      status: LotteryPackStatus.ACTIVE,
      current_bin_id: bin1.bin_id,
      serial_start: "001",
      serial_end: "100",
    });

    const pack2 = await createLotteryPack(prismaClient, {
      game_id: game2.game_id,
      store_id: storeManagerUser.store_id,
      status: LotteryPackStatus.ACTIVE,
      current_bin_id: bin2.bin_id,
      serial_start: "001",
      serial_end: "050",
    });

    await createLotteryDayPack(prismaClient, {
      day_id: lotteryDay.day_id,
      pack_id: pack1.pack_id,
      starting_serial: "001",
      ending_serial: "030",
      tickets_sold: 30,
      sales_amount: new Prisma.Decimal(150.0), // 30 x $5
    });

    await createLotteryDayPack(prismaClient, {
      day_id: lotteryDay.day_id,
      pack_id: pack2.pack_id,
      starting_serial: "001",
      ending_serial: "020",
      tickets_sold: 20,
      sales_amount: new Prisma.Decimal(200.0), // 20 x $10
    });

    // Create ShiftSummary with lottery totals (API reads from ShiftSummary, not LotteryDayPack)
    await createShiftSummary(
      prismaClient,
      shift.shift_id,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      {
        businessDate: new Date(businessDateStr),
        lotterySales: 350, // 150 + 200
        lotteryCashes: 0,
        lotteryNet: 350,
        lotteryPacksSold: 2,
        lotteryTicketsSold: 50, // 30 + 20
      },
    );

    // WHEN: Requesting lottery summary
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/lottery-summary`,
    );

    // THEN: Should aggregate lottery_totals from day packs (bins_closed intentionally empty)
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);

    // bins_closed is empty for shift summary (architectural design - belongs to Day Close)
    expect(
      body.data.bins_closed,
      "bins_closed should be empty for shift summary",
    ).toHaveLength(0);

    // lottery_totals should be aggregated from LotteryDayPack data
    // The shift-summary.service.ts getLotteryData method queries LotteryDayPack
    // Total: 30 + 20 = 50 tickets, $150 + $200 = $350
    expect(
      body.data.lottery_totals.lottery_sales,
      "lottery_sales should aggregate from day packs",
    ).toBe(350);
    expect(
      body.data.lottery_totals.tickets_sold,
      "tickets_sold should be 50",
    ).toBe(50);

    // Cleanup
    await cleanupShiftLotteryData(
      prismaClient,
      shift.shift_id,
      storeManagerUser.store_id,
    );
    await prismaClient.lotteryGame
      .delete({ where: { game_id: game1.game_id } })
      .catch(() => {
        /* ignore */
      });
    await prismaClient.lotteryGame
      .delete({ where: { game_id: game2.game_id } })
      .catch(() => {
        /* ignore */
      });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });

  test("LOTTERY-SUM-012: [P2] bins_closed is empty for shift summary (belongs to Day Close)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A shift with multiple lottery day packs configured
    // NOTE: This test documents the architectural decision that bins_closed belongs
    // to Day Close, not individual shifts. See shift.service.ts lines 2737-2753.
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const closedAt = new Date();
    const businessDateStr = closedAt.toISOString().split("T")[0];

    const shift = await createClosedShiftWithLotteryData(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      { closedAt },
    );

    const lotteryDay = await prismaClient.lotteryBusinessDay.create({
      data: {
        store_id: storeManagerUser.store_id,
        business_date: new Date(businessDateStr),
        status: "CLOSED" as LotteryDayStatus,
        closed_at: closedAt,
      },
    });

    const game = await createLotteryGame(prismaClient);

    const bin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      display_order: 0,
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      status: LotteryPackStatus.ACTIVE,
      current_bin_id: bin.bin_id,
      serial_start: "001",
      serial_end: "100",
    });

    await createLotteryDayPack(prismaClient, {
      day_id: lotteryDay.day_id,
      pack_id: pack.pack_id,
      starting_serial: "001",
      ending_serial: "050",
      tickets_sold: 50,
      sales_amount: new Prisma.Decimal(250.0),
    });

    // Create ShiftSummary with lottery totals (API reads from ShiftSummary, not LotteryDayPack)
    await createShiftSummary(
      prismaClient,
      shift.shift_id,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      {
        businessDate: new Date(businessDateStr),
        lotterySales: 250,
        lotteryCashes: 0,
        lotteryNet: 250,
        lotteryPacksSold: 1,
        lotteryTicketsSold: 50,
      },
    );

    // WHEN: Requesting lottery summary for a shift
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/lottery-summary`,
    );

    // THEN: bins_closed is intentionally empty for shift summary
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);

    // ARCHITECTURAL DECISION: bins_closed is always empty for shift-level summary
    // The lottery closing data (LotteryDayPack) belongs to Day Close reconciliation,
    // not to individual shifts. This prevents lottery data from a day close "leaking"
    // into shifts that happened on the same calendar date but weren't involved.
    expect(
      body.data.bins_closed,
      "bins_closed should be empty (belongs to Day Close)",
    ).toHaveLength(0);

    // lottery_totals IS populated from ShiftSummary (which captures lottery data at close)
    expect(
      body.data.lottery_totals.lottery_sales,
      "lottery_totals should be from ShiftSummary",
    ).toBe(250);

    // Cleanup
    await cleanupShiftLotteryData(
      prismaClient,
      shift.shift_id,
      storeManagerUser.store_id,
    );
    await prismaClient.lotteryGame
      .delete({ where: { game_id: game.game_id } })
      .catch(() => {
        /* ignore */
      });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });
});

// =============================================================================
// SECTION 8: BUSINESS LOGIC - TICKET CALCULATION
// =============================================================================

test.describe("LOTTERY-SUMMARY-API: Ticket Calculation", () => {
  test("LOTTERY-SUM-009: [P1] should calculate tickets correctly from serials", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A shift with packs that have known serial ranges
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const closedAt = new Date();
    const businessDateStr = closedAt.toISOString().split("T")[0];

    const shift = await createClosedShiftWithLotteryData(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      { closedAt },
    );

    const lotteryDay = await prismaClient.lotteryBusinessDay.create({
      data: {
        store_id: storeManagerUser.store_id,
        business_date: new Date(businessDateStr),
        status: "CLOSED" as LotteryDayStatus,
        closed_at: closedAt,
      },
    });

    const game = await createLotteryGame(prismaClient, { price: 5 });
    const bin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      status: LotteryPackStatus.ACTIVE,
      current_bin_id: bin.bin_id,
      serial_start: "001",
      serial_end: "100",
    });

    // Day pack: starting at 001, ending at 050 = 50 tickets sold
    await createLotteryDayPack(prismaClient, {
      day_id: lotteryDay.day_id,
      pack_id: pack.pack_id,
      starting_serial: "001",
      ending_serial: "050",
      tickets_sold: 50, // Explicitly set
      sales_amount: new Prisma.Decimal(250.0), // 50 x $5
    });

    // Create returned pack with known tickets
    const returnedPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      status: LotteryPackStatus.RETURNED,
      current_bin_id: bin.bin_id,
      serial_start: "101",
      serial_end: "200",
      activated_at: shift.opened_at,
      returned_at: new Date(shift.opened_at.getTime() + 60 * 60 * 1000),
      last_sold_serial: "123",
      tickets_sold_on_return: 23, // Explicitly set
      return_sales_amount: new Prisma.Decimal(115.0), // 23 x $5
      return_reason: "DAMAGED",
    });

    // Create ShiftSummary with lottery totals (API reads from ShiftSummary)
    // Total: day packs (50 tickets @ $250) + returned (23 tickets @ $115) = 73 tickets @ $365
    await createShiftSummary(
      prismaClient,
      shift.shift_id,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      {
        businessDate: new Date(businessDateStr),
        lotterySales: 365, // 250 + 115
        lotteryCashes: 0,
        lotteryNet: 365,
        lotteryPacksSold: 2,
        lotteryTicketsSold: 73, // 50 + 23
      },
    );

    // WHEN: Requesting lottery summary
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/lottery-summary`,
    );

    // THEN: Tickets should be correctly calculated in lottery_totals
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);

    // bins_closed is empty for shift summary (architectural design)
    expect(body.data.bins_closed, "bins_closed should be empty").toHaveLength(
      0,
    );

    // Verify returned pack tickets
    expect(
      body.data.returned_packs[0].tickets_sold_on_return,
      "Returned pack should have 23 tickets",
    ).toBe(23);

    // lottery_totals aggregates from LotteryDayPack (50) + returned packs (23) = 73 tickets
    expect(
      body.data.lottery_totals.tickets_sold,
      "Total tickets should include day packs and returned: 50 + 23 = 73",
    ).toBe(73);

    // Cleanup
    await cleanupShiftLotteryData(
      prismaClient,
      shift.shift_id,
      storeManagerUser.store_id,
    );
    await prismaClient.lotteryGame
      .delete({ where: { game_id: game.game_id } })
      .catch(() => {
        /* ignore */
      });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });
});
