/**
 * Shift/Lottery Data Separation API Tests
 *
 * Tests to verify that shift API responses do NOT include lottery bins_closed data.
 * The bins_closed data now belongs exclusively to Day Close, not individual shifts.
 *
 * This prevents the bug where lottery data from a day close "leaks" into shifts
 * that happened on the same calendar date but weren't involved in the lottery close.
 *
 * @test-level API (Integration)
 * @justification Verifies architectural fix for shift/day-close data separation
 * @story shift-day-close-separation
 * @priority P0 (Critical - Data Integrity Fix)
 *
 * ================================================================================
 * TRACEABILITY MATRIX
 * ================================================================================
 *
 * | Test ID               | Requirement                      | API Endpoint                         | Priority |
 * |-----------------------|----------------------------------|--------------------------------------|----------|
 * | SHIFT-SEP-001         | BIZ-001: Empty bins_closed       | GET /api/shifts/:shiftId/lottery-summary | P0   |
 * | SHIFT-SEP-002         | BIZ-002: No lottery leak         | GET /api/shifts/:shiftId/lottery-summary | P0   |
 * | SHIFT-SEP-003         | BIZ-003: Lottery totals from SS  | GET /api/shifts/:shiftId/lottery-summary | P1   |
 * | SHIFT-SEP-004         | BIZ-004: Pack data still works   | GET /api/shifts/:shiftId/lottery-summary | P1   |
 * | SHIFT-SEP-010         | SEC-001: Cross-shift isolation   | GET /api/shifts/:shiftId/lottery-summary | P0   |
 *
 * REQUIREMENT COVERAGE:
 * - Business Logic (BIZ-001 to BIZ-004): 4 tests
 * - Security (SEC-001): 1 test
 * ================================================================================
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import { Prisma } from "@prisma/client";
import { withBypassClient } from "../support/prisma-bypass";
import { createShift, createCashier } from "../support/factories";

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Creates a POS terminal for testing
 */
async function createPOSTerminal(
  storeId: string,
  name?: string,
): Promise<{ pos_terminal_id: string }> {
  return await withBypassClient(async (tx) => {
    const uniqueId = crypto.randomUUID();
    const terminal = await tx.pOSTerminal.create({
      data: {
        store_id: storeId,
        name: name || `Terminal ${uniqueId.substring(0, 8)}`,
        device_id: `device-${uniqueId}`,
        deleted_at: null,
      },
    });
    return { pos_terminal_id: terminal.pos_terminal_id };
  });
}

/**
 * Creates a test Cashier
 */
async function createTestCashier(
  storeId: string,
  createdByUserId: string,
): Promise<{ cashier_id: string }> {
  return await withBypassClient(async (tx) => {
    const cashierData = await createCashier({
      store_id: storeId,
      created_by: createdByUserId,
    });
    const cashier = await tx.cashier.create({ data: cashierData });
    return { cashier_id: cashier.cashier_id };
  });
}

/**
 * Creates a CLOSED shift
 */
async function createClosedShift(
  storeId: string,
  openedBy: string,
  cashierId: string,
  posTerminalId: string,
  businessDate: Date,
): Promise<{ shift_id: string }> {
  return await withBypassClient(async (tx) => {
    const openedAt = new Date(businessDate);
    openedAt.setHours(8, 0, 0, 0);
    const closedAt = new Date(businessDate);
    closedAt.setHours(16, 0, 0, 0);

    const shift = await tx.shift.create({
      data: {
        ...createShift({
          store_id: storeId,
          opened_by: openedBy,
          cashier_id: cashierId,
          pos_terminal_id: posTerminalId,
          opening_cash: new Prisma.Decimal(100.0),
          closing_cash: new Prisma.Decimal(250.0),
          expected_cash: new Prisma.Decimal(200.0),
          variance: new Prisma.Decimal(50.0),
          status: "CLOSED",
          opened_at: openedAt,
          closed_at: closedAt,
        }),
      },
    });
    return { shift_id: shift.shift_id };
  });
}

/**
 * Creates a ShiftSummary for a shift
 */
async function createShiftSummary(
  shiftId: string,
  storeId: string,
  userId: string,
  businessDate: Date,
  options: {
    lotterySales?: number;
    lotteryTicketsSold?: number;
  } = {},
): Promise<{ shift_summary_id: string }> {
  return await withBypassClient(async (tx) => {
    const normalizedDate = new Date(businessDate);
    normalizedDate.setHours(0, 0, 0, 0);

    const openedAt = new Date(businessDate);
    openedAt.setHours(8, 0, 0, 0);
    const closedAt = new Date(businessDate);
    closedAt.setHours(16, 0, 0, 0);
    const durationMins = Math.floor(
      (closedAt.getTime() - openedAt.getTime()) / (60 * 1000),
    );

    const summary = await tx.shiftSummary.create({
      data: {
        shift_id: shiftId,
        store_id: storeId,
        business_date: normalizedDate,
        // Timing fields
        shift_opened_at: openedAt,
        shift_closed_at: closedAt,
        shift_duration_mins: durationMins,
        // Personnel fields
        opened_by_user_id: userId,
        closed_by_user_id: userId,
        // Sales totals
        gross_sales: new Prisma.Decimal(165.0),
        returns_total: new Prisma.Decimal(0),
        discounts_total: new Prisma.Decimal(0),
        net_sales: new Prisma.Decimal(150.0),
        // Tax fields
        tax_collected: new Prisma.Decimal(12.0),
        tax_exempt_sales: new Prisma.Decimal(0),
        taxable_sales: new Prisma.Decimal(150.0),
        // Transaction counts
        transaction_count: 10,
        void_count: 0,
        refund_count: 0,
        no_sale_count: 0,
        // Item counts
        items_sold_count: 20,
        items_returned_count: 0,
        // Averages
        avg_transaction: new Prisma.Decimal(15.0),
        avg_items_per_txn: new Prisma.Decimal(2.0),
        // Cash drawer reconciliation
        opening_cash: new Prisma.Decimal(100.0),
        closing_cash: new Prisma.Decimal(250.0),
        expected_cash: new Prisma.Decimal(200.0),
        cash_variance: new Prisma.Decimal(50.0),
        variance_percentage: new Prisma.Decimal(0),
        variance_approved: true,
        // Lottery fields
        lottery_sales:
          options.lotterySales !== undefined
            ? new Prisma.Decimal(options.lotterySales)
            : null,
        lottery_tickets_sold: options.lotteryTicketsSold ?? null,
      },
    });
    return { shift_summary_id: summary.shift_summary_id };
  });
}

/**
 * Creates a LotteryBusinessDay with day packs (closed lottery)
 */
async function createClosedLotteryDay(
  storeId: string,
  businessDate: Date,
  closedByUserId: string,
): Promise<{ day_id: string }> {
  return await withBypassClient(async (tx) => {
    const normalizedDate = new Date(businessDate);
    normalizedDate.setHours(0, 0, 0, 0);

    // Create game for the packs
    const game = await tx.lotteryGame.create({
      data: {
        name: `Test Game ${Date.now()}`,
        game_code: `${Math.floor(1000 + Math.random() * 9000)}`,
        price: 5.0,
        pack_value: 150,
        status: "ACTIVE",
        store_id: storeId,
      },
    });

    // Create bin
    const bin = await tx.lotteryBin.create({
      data: {
        store_id: storeId,
        name: `Test Bin ${Date.now()}`,
        display_order: 0,
        is_active: true,
      },
    });

    // Create pack
    const pack = await tx.lotteryPack.create({
      data: {
        game_id: game.game_id,
        store_id: storeId,
        pack_number: `SHIFTTEST-${Date.now()}`,
        serial_start: "001",
        serial_end: "050",
        status: "ACTIVE",
        activated_at: new Date(),
        current_bin_id: bin.bin_id,
        tickets_sold_count: 15,
      },
    });

    // Create LotteryBusinessDay (CLOSED)
    const lotteryDay = await tx.lotteryBusinessDay.create({
      data: {
        store_id: storeId,
        business_date: normalizedDate,
        status: "CLOSED",
        opened_at: new Date(),
        closed_at: new Date(),
        closed_by: closedByUserId,
      },
    });

    // Create LotteryDayPack
    await tx.lotteryDayPack.create({
      data: {
        day_id: lotteryDay.day_id,
        pack_id: pack.pack_id,
        starting_serial: "001",
        ending_serial: "015",
        tickets_sold: 15,
        sales_amount: new Prisma.Decimal(75.0),
      },
    });

    return { day_id: lotteryDay.day_id };
  });
}

/**
 * Cleans up test data for a store
 */
async function cleanupStoreData(storeId: string): Promise<void> {
  await withBypassClient(async (tx) => {
    await tx.lotteryDayPack.deleteMany({
      where: { day: { store_id: storeId } },
    });
    await tx.lotteryBusinessDay.deleteMany({ where: { store_id: storeId } });
    await tx.shiftSummary.deleteMany({ where: { store_id: storeId } });
    await tx.shift.deleteMany({ where: { store_id: storeId } });
    await tx.lotteryPack.deleteMany({ where: { store_id: storeId } });
    await tx.lotteryBin.deleteMany({ where: { store_id: storeId } });
    await tx.lotteryGame.deleteMany({ where: { store_id: storeId } });
    await tx.cashier.deleteMany({ where: { store_id: storeId } });
    await tx.pOSTerminal.deleteMany({ where: { store_id: storeId } });
  });
}

// =============================================================================
// TESTS
// =============================================================================

test.describe("SHIFT-SEP-API: Shift/Lottery Data Separation", () => {
  test("SHIFT-SEP-001: [P0] bins_closed should always be empty in shift lottery summary", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: A closed shift on a day that also has closed lottery data
    const businessDate = new Date();
    const terminal = await createPOSTerminal(storeManagerUser.store_id);
    const cashier = await createTestCashier(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const shift = await createClosedShift(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      businessDate,
    );

    // Create closed lottery day with bins
    await createClosedLotteryDay(
      storeManagerUser.store_id,
      businessDate,
      storeManagerUser.user_id,
    );

    // WHEN: Requesting shift lottery summary
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/lottery-summary`,
    );

    // THEN: bins_closed should be empty array (lottery data belongs to Day Close)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // CRITICAL: bins_closed must be empty - this is the architectural fix
    expect(body.data.bins_closed).toEqual([]);

    // Cleanup
    await cleanupStoreData(storeManagerUser.store_id);
  });

  test("SHIFT-SEP-002: [P0] shift should not leak lottery data from day close on same date", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: A shift opened on one day but closed on another day
    // This was the original bug - shift.closed_at was used to look up lottery day
    const businessDate = new Date();
    const terminal = await createPOSTerminal(storeManagerUser.store_id);
    const cashier = await createTestCashier(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const shift = await createClosedShift(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      businessDate,
    );

    // Create lottery day with closed bins
    await createClosedLotteryDay(
      storeManagerUser.store_id,
      businessDate,
      storeManagerUser.user_id,
    );

    // WHEN: Requesting shift lottery summary
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/lottery-summary`,
    );

    // THEN: Should not contain any bins_closed data
    expect(response.status()).toBe(200);
    const body = await response.json();

    // The shift should NOT show the lottery data from the day close
    expect(body.data.bins_closed).toHaveLength(0);

    // But lottery_closed flag should still reflect the day status (for display purposes)
    // The lottery_totals should come from ShiftSummary, not from bins calculation

    // Cleanup
    await cleanupStoreData(storeManagerUser.store_id);
  });

  test("SHIFT-SEP-003: [P1] lottery_totals should come from ShiftSummary", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: A shift with ShiftSummary that has lottery data
    const businessDate = new Date();
    const terminal = await createPOSTerminal(storeManagerUser.store_id);
    const cashier = await createTestCashier(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const shift = await createClosedShift(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      businessDate,
    );

    // Create ShiftSummary with known lottery values
    await createShiftSummary(
      shift.shift_id,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      businessDate,
      {
        lotterySales: 75.0,
        lotteryTicketsSold: 15,
      },
    );

    // WHEN: Requesting shift lottery summary
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/lottery-summary`,
    );

    // THEN: lottery_totals should reflect ShiftSummary values
    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(body.data.lottery_totals).toBeDefined();
    expect(body.data.lottery_totals.lottery_sales).toBe(75.0);
    expect(body.data.lottery_totals.tickets_sold).toBe(15);

    // Cleanup
    await cleanupStoreData(storeManagerUser.store_id);
  });

  test("SHIFT-SEP-004: [P1] pack lists (activated, depleted, returned) should still work", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: A closed shift
    const businessDate = new Date();
    const terminal = await createPOSTerminal(storeManagerUser.store_id);
    const cashier = await createTestCashier(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const shift = await createClosedShift(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      businessDate,
    );

    // WHEN: Requesting shift lottery summary
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/lottery-summary`,
    );

    // THEN: Pack lists should be present (even if empty)
    expect(response.status()).toBe(200);
    const body = await response.json();

    // These arrays should exist (pack tracking still works)
    expect(body.data).toHaveProperty("activated_packs");
    expect(body.data).toHaveProperty("depleted_packs");
    expect(body.data).toHaveProperty("returned_packs");
    expect(Array.isArray(body.data.activated_packs)).toBe(true);
    expect(Array.isArray(body.data.depleted_packs)).toBe(true);
    expect(Array.isArray(body.data.returned_packs)).toBe(true);

    // Cleanup
    await cleanupStoreData(storeManagerUser.store_id);
  });

  test("SHIFT-SEP-010: [P0] shift A should not see lottery data from shift B's day close", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: Two shifts on the same day, lottery closed after both
    const businessDate = new Date();
    const terminal = await createPOSTerminal(storeManagerUser.store_id);
    const cashier1 = await createTestCashier(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const cashier2 = await createTestCashier(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // Shift A (earlier in day)
    const shiftA = await createClosedShift(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier1.cashier_id,
      terminal.pos_terminal_id,
      businessDate,
    );

    // Shift B (later in day)
    const shiftB = await createClosedShift(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier2.cashier_id,
      terminal.pos_terminal_id,
      businessDate,
    );

    // Day close happens after shift B
    await createClosedLotteryDay(
      storeManagerUser.store_id,
      businessDate,
      storeManagerUser.user_id,
    );

    // WHEN: Requesting lottery summary for shift A
    const responseA = await storeManagerApiRequest.get(
      `/api/shifts/${shiftA.shift_id}/lottery-summary`,
    );

    // THEN: Shift A should NOT see the lottery bins_closed data
    expect(responseA.status()).toBe(200);
    const bodyA = await responseA.json();
    expect(bodyA.data.bins_closed).toEqual([]);

    // WHEN: Requesting lottery summary for shift B
    const responseB = await storeManagerApiRequest.get(
      `/api/shifts/${shiftB.shift_id}/lottery-summary`,
    );

    // THEN: Shift B should also NOT see the lottery bins_closed data
    expect(responseB.status()).toBe(200);
    const bodyB = await responseB.json();
    expect(bodyB.data.bins_closed).toEqual([]);

    // Cleanup
    await cleanupStoreData(storeManagerUser.store_id);
  });
});
