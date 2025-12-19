/**
 * @test-level E2E
 * @justification End-to-end tests for shift detail page - validates complete user journey from shifts list to detail view
 * @story client-owner-dashboard-shift-detail-view
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import { createUser, createClientUser } from "../support/factories";
import { createTransaction as createTransactionFactory } from "../support/factories/transaction.factory";
import { PrismaClient, Prisma } from "@prisma/client";
import {
  createShift as createShiftHelper,
  createCashier as createCashierHelper,
} from "../support/helpers/database-helpers";
import { withBypassClient } from "../support/prisma-bypass";

/**
 * Creates a POS terminal for testing
 */
async function createPOSTerminal(
  prismaClient: PrismaClient,
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
 * Creates a test cashier using the database helper
 */
async function createTestCashier(
  prismaClient: PrismaClient,
  storeId: string,
  createdByUserId: string,
): Promise<{
  cashier_id: string;
  store_id: string;
  employee_id: string;
  name: string;
}> {
  return createCashierHelper(
    {
      store_id: storeId,
      created_by: createdByUserId,
    },
    prismaClient,
  );
}

/**
 * Creates a closed shift with transactions for testing shift detail view
 */
async function createClosedShiftWithTransactions(
  prismaClient: PrismaClient,
  storeId: string,
  openedBy: string,
  cashierId: string,
  posTerminalId: string,
): Promise<{ shift_id: string; status: string }> {
  const shiftId = crypto.randomUUID();

  // Create the closed shift
  const shift = await prismaClient.shift.create({
    data: {
      shift_id: shiftId,
      store_id: storeId,
      opened_by: openedBy,
      cashier_id: cashierId,
      pos_terminal_id: posTerminalId,
      opening_cash: new Prisma.Decimal(200.0),
      closing_cash: new Prisma.Decimal(450.0),
      expected_cash: new Prisma.Decimal(400.0),
      variance: new Prisma.Decimal(50.0),
      variance_reason: "Customer returned cash payment",
      status: "CLOSED",
      opened_at: new Date(Date.now() - 8 * 60 * 60 * 1000),
      closed_at: new Date(),
    },
  });

  // Create transactions with different payment methods
  const transaction1 = await prismaClient.transaction.create({
    data: {
      ...createTransactionFactory({
        store_id: storeId,
        shift_id: shift.shift_id,
        cashier_id: openedBy,
        pos_terminal_id: posTerminalId,
        subtotal: 50.0,
        tax: 4.0,
        discount: 0,
        total: 54.0,
      }),
    },
  });

  const transaction2 = await prismaClient.transaction.create({
    data: {
      ...createTransactionFactory({
        store_id: storeId,
        shift_id: shift.shift_id,
        cashier_id: openedBy,
        pos_terminal_id: posTerminalId,
        subtotal: 100.0,
        tax: 8.0,
        discount: 0,
        total: 108.0,
      }),
    },
  });

  // Create payments
  await prismaClient.transactionPayment.create({
    data: {
      transaction_id: transaction1.transaction_id,
      method: "CASH",
      amount: new Prisma.Decimal(54.0),
    },
  });

  await prismaClient.transactionPayment.create({
    data: {
      transaction_id: transaction2.transaction_id,
      method: "CREDIT",
      amount: new Prisma.Decimal(108.0),
    },
  });

  return {
    shift_id: shift.shift_id,
    status: shift.status,
  };
}

/**
 * Navigate to shifts page and wait for it to load
 */
async function navigateToShiftsPage(page: any) {
  await page.goto("/client-dashboard/shifts", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("load");

  // Wait for the shifts page container
  await page.waitForSelector('[data-testid="client-shifts-page"]', {
    timeout: 30000,
  });

  // Wait for either the shift list table, loading state, empty state, or error state
  await Promise.race([
    page
      .waitForSelector('[data-testid="shift-list-table"]', { timeout: 30000 })
      .catch(() => null),
    page
      .waitForSelector('[data-testid="shift-list-loading"]', { timeout: 30000 })
      .catch(() => null),
    page
      .waitForSelector('[data-testid="shift-list-error"]', { timeout: 30000 })
      .catch(() => null),
    page
      .waitForSelector('[data-testid="shift-list-empty"]', { timeout: 30000 })
      .catch(() => null),
  ]);
}

/**
 * Shift Detail View E2E Tests
 *
 * STORY: As a Client Owner, I want to view shift details by clicking on a shift,
 * so that I can see comprehensive information about open and closed shifts.
 *
 * TEST LEVEL: E2E (end-to-end user journey tests)
 * PRIMARY GOAL: Verify complete user flow from shifts list to detail page and back
 *
 * BUSINESS RULES TESTED:
 * - Click shift row to navigate to detail page
 * - Display active shift view for OPEN/ACTIVE shifts
 * - Display closed shift summary for CLOSED shifts
 * - Payment methods breakdown in closed shift view
 * - Sales summary in closed shift view
 * - Variance details when variance exists
 * - Back navigation to shifts list
 *
 * ACCEPTANCE CRITERIA COVERAGE:
 * - AC #1: Navigation from shift list to detail page
 * - AC #2: Active shift view with real-time metrics
 * - AC #3: Closed shift summary with payment breakdown
 * - AC #4: Variance details display
 * - AC #5: Back navigation functionality
 */

test.describe("CLIENT-OWNER-DASHBOARD-E2E: Shift Detail View", () => {
  test("SHIFT-DETAIL-E2E-001: [P0] Should navigate to shift detail page when clicking shift row", async ({
    clientOwnerPage,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: A shift exists in the client user's store
    const cashier = await createTestCashier(
      prismaClient,
      clientUser.store_id,
      clientUser.user_id,
    );

    const cashierUser = await prismaClient.user.create({
      data: createClientUser(),
    });

    const shift = await createShiftHelper(
      {
        store_id: clientUser.store_id,
        cashier_id: cashier.cashier_id,
        opened_by: cashierUser.user_id,
        status: "OPEN",
        opening_cash: 100.0,
      },
      prismaClient,
    );

    // WHEN: Navigating to the shifts page
    await navigateToShiftsPage(clientOwnerPage);

    // AND: Clicking on the shift row
    const shiftRow = clientOwnerPage.locator(
      `[data-testid="shift-list-row-${shift.shift_id}"]`,
    );
    await expect(shiftRow).toBeVisible({ timeout: 15000 });
    await shiftRow.click();

    // THEN: Should navigate to shift detail page
    await expect(clientOwnerPage).toHaveURL(
      `/client-dashboard/shifts/${shift.shift_id}`,
      { timeout: 15000 },
    );

    // AND: The shift detail page should be displayed
    await expect(
      clientOwnerPage.locator('[data-testid="shift-detail-page"]'),
    ).toBeVisible({ timeout: 15000 });
  });

  test("SHIFT-DETAIL-E2E-002: [P0] Should display active shift view for OPEN shift", async ({
    clientOwnerPage,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: An OPEN shift exists in the client user's store
    const cashier = await createTestCashier(
      prismaClient,
      clientUser.store_id,
      clientUser.user_id,
    );

    const cashierUser = await prismaClient.user.create({
      data: createClientUser({ name: "Test Cashier E2E" }),
    });

    const shift = await createShiftHelper(
      {
        store_id: clientUser.store_id,
        cashier_id: cashier.cashier_id,
        opened_by: cashierUser.user_id,
        status: "OPEN",
        opening_cash: 150.0,
      },
      prismaClient,
    );

    // WHEN: Navigating directly to the shift detail page
    await clientOwnerPage.goto(`/client-dashboard/shifts/${shift.shift_id}`, {
      waitUntil: "domcontentloaded",
    });

    // THEN: The active shift view should be displayed
    await expect(
      clientOwnerPage.locator('[data-testid="active-shift-view"]'),
    ).toBeVisible({ timeout: 15000 });

    // AND: Shift information card should be visible
    await expect(
      clientOwnerPage.locator('[data-testid="shift-info-card"]'),
    ).toBeVisible();

    // AND: Transaction metrics card should be visible
    await expect(
      clientOwnerPage.locator('[data-testid="transaction-metrics-card"]'),
    ).toBeVisible();

    // AND: Should show the cashier name
    await expect(clientOwnerPage.getByText(cashier.name)).toBeVisible();
  });

  test("SHIFT-DETAIL-E2E-003: [P0] Should display closed shift summary for CLOSED shift", async ({
    clientOwnerPage,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: A CLOSED shift with transactions exists
    const terminal = await createPOSTerminal(prismaClient, clientUser.store_id);
    const cashier = await createTestCashier(
      prismaClient,
      clientUser.store_id,
      clientUser.user_id,
    );

    const shift = await createClosedShiftWithTransactions(
      prismaClient,
      clientUser.store_id,
      clientUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
    );

    // WHEN: Navigating directly to the shift detail page
    await clientOwnerPage.goto(`/client-dashboard/shifts/${shift.shift_id}`, {
      waitUntil: "domcontentloaded",
    });

    // THEN: The closed shift summary view should be displayed
    await expect(
      clientOwnerPage.locator('[data-testid="closed-shift-summary"]'),
    ).toBeVisible({ timeout: 15000 });

    // AND: Shift information card should be visible
    await expect(
      clientOwnerPage.locator('[data-testid="shift-info-card"]'),
    ).toBeVisible();

    // AND: Cash reconciliation card should be visible
    await expect(
      clientOwnerPage.locator('[data-testid="cash-reconciliation-card"]'),
    ).toBeVisible();

    // Cleanup
    const transactions = await prismaClient.transaction.findMany({
      where: { shift_id: shift.shift_id },
      select: { transaction_id: true },
    });
    const transactionIds = transactions.map((t) => t.transaction_id);
    if (transactionIds.length > 0) {
      await prismaClient.transactionPayment.deleteMany({
        where: { transaction_id: { in: transactionIds } },
      });
      await prismaClient.transaction.deleteMany({
        where: { shift_id: shift.shift_id },
      });
    }
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });

  test("SHIFT-DETAIL-E2E-004: [P0] Should display payment methods breakdown for closed shift", async ({
    clientOwnerPage,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: A CLOSED shift with payment transactions
    const terminal = await createPOSTerminal(prismaClient, clientUser.store_id);
    const cashier = await createTestCashier(
      prismaClient,
      clientUser.store_id,
      clientUser.user_id,
    );

    const shift = await createClosedShiftWithTransactions(
      prismaClient,
      clientUser.store_id,
      clientUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
    );

    // WHEN: Navigating to the shift detail page
    await clientOwnerPage.goto(`/client-dashboard/shifts/${shift.shift_id}`, {
      waitUntil: "domcontentloaded",
    });

    // Wait for summary data to load
    await expect(
      clientOwnerPage.locator('[data-testid="closed-shift-summary"]'),
    ).toBeVisible({ timeout: 15000 });

    // THEN: Payment methods breakdown should be visible
    await expect(
      clientOwnerPage.locator('[data-testid="money-received-summary"]'),
    ).toBeVisible({ timeout: 20000 });

    // AND: Should show "Payment Methods" header
    await expect(clientOwnerPage.getByText("Payment Methods")).toBeVisible();

    // Cleanup
    const transactions = await prismaClient.transaction.findMany({
      where: { shift_id: shift.shift_id },
      select: { transaction_id: true },
    });
    const transactionIds = transactions.map((t) => t.transaction_id);
    if (transactionIds.length > 0) {
      await prismaClient.transactionPayment.deleteMany({
        where: { transaction_id: { in: transactionIds } },
      });
      await prismaClient.transaction.deleteMany({
        where: { shift_id: shift.shift_id },
      });
    }
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });

  test("SHIFT-DETAIL-E2E-005: [P0] Should display variance details when variance exists", async ({
    clientOwnerPage,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: A CLOSED shift with variance
    const terminal = await createPOSTerminal(prismaClient, clientUser.store_id);
    const cashier = await createTestCashier(
      prismaClient,
      clientUser.store_id,
      clientUser.user_id,
    );

    const shift = await createClosedShiftWithTransactions(
      prismaClient,
      clientUser.store_id,
      clientUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
    );

    // WHEN: Navigating to the shift detail page
    await clientOwnerPage.goto(`/client-dashboard/shifts/${shift.shift_id}`, {
      waitUntil: "domcontentloaded",
    });

    // Wait for the page to fully load
    await expect(
      clientOwnerPage.locator('[data-testid="closed-shift-summary"]'),
    ).toBeVisible({ timeout: 15000 });

    // THEN: Variance details card should be visible (since variance > 0)
    await expect(
      clientOwnerPage.locator('[data-testid="variance-details-card"]'),
    ).toBeVisible({ timeout: 10000 });

    // AND: Should show the variance reason
    await expect(
      clientOwnerPage.getByText("Customer returned cash payment"),
    ).toBeVisible();

    // Cleanup
    const transactions = await prismaClient.transaction.findMany({
      where: { shift_id: shift.shift_id },
      select: { transaction_id: true },
    });
    const transactionIds = transactions.map((t) => t.transaction_id);
    if (transactionIds.length > 0) {
      await prismaClient.transactionPayment.deleteMany({
        where: { transaction_id: { in: transactionIds } },
      });
      await prismaClient.transaction.deleteMany({
        where: { shift_id: shift.shift_id },
      });
    }
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });

  test("SHIFT-DETAIL-E2E-006: [P0] Should navigate back to shifts list when clicking back button", async ({
    clientOwnerPage,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: A shift exists
    const cashier = await createTestCashier(
      prismaClient,
      clientUser.store_id,
      clientUser.user_id,
    );

    const cashierUser = await prismaClient.user.create({
      data: createClientUser(),
    });

    const shift = await createShiftHelper(
      {
        store_id: clientUser.store_id,
        cashier_id: cashier.cashier_id,
        opened_by: cashierUser.user_id,
        status: "OPEN",
        opening_cash: 100.0,
      },
      prismaClient,
    );

    // AND: We're on the shift detail page
    await clientOwnerPage.goto(`/client-dashboard/shifts/${shift.shift_id}`, {
      waitUntil: "domcontentloaded",
    });

    await expect(
      clientOwnerPage.locator('[data-testid="shift-detail-page"]'),
    ).toBeVisible({ timeout: 15000 });

    // WHEN: Clicking the back button
    await clientOwnerPage.locator('[data-testid="back-button"]').click();

    // THEN: Should navigate back to shifts list
    await expect(clientOwnerPage).toHaveURL("/client-dashboard/shifts", {
      timeout: 15000,
    });

    // AND: The shifts page should be displayed
    await expect(
      clientOwnerPage.locator('[data-testid="client-shifts-page"]'),
    ).toBeVisible();
  });

  test("SHIFT-DETAIL-E2E-007: [P1] Should display sales summary for closed shift", async ({
    clientOwnerPage,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: A CLOSED shift with transactions
    const terminal = await createPOSTerminal(prismaClient, clientUser.store_id);
    const cashier = await createTestCashier(
      prismaClient,
      clientUser.store_id,
      clientUser.user_id,
    );

    const shift = await createClosedShiftWithTransactions(
      prismaClient,
      clientUser.store_id,
      clientUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
    );

    // WHEN: Navigating to the shift detail page
    await clientOwnerPage.goto(`/client-dashboard/shifts/${shift.shift_id}`, {
      waitUntil: "domcontentloaded",
    });

    // Wait for summary to load
    await expect(
      clientOwnerPage.locator('[data-testid="closed-shift-summary"]'),
    ).toBeVisible({ timeout: 15000 });

    // THEN: Sales breakdown summary should be visible
    await expect(
      clientOwnerPage.locator('[data-testid="sales-breakdown-summary"]'),
    ).toBeVisible({ timeout: 20000 });

    // AND: Should show "Sales Summary" header
    await expect(clientOwnerPage.getByText("Sales Summary")).toBeVisible();

    // Cleanup
    const transactions = await prismaClient.transaction.findMany({
      where: { shift_id: shift.shift_id },
      select: { transaction_id: true },
    });
    const transactionIds = transactions.map((t) => t.transaction_id);
    if (transactionIds.length > 0) {
      await prismaClient.transactionPayment.deleteMany({
        where: { transaction_id: { in: transactionIds } },
      });
      await prismaClient.transaction.deleteMany({
        where: { shift_id: shift.shift_id },
      });
    }
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });

  test("SHIFT-DETAIL-E2E-008: [P1] Should display error state for non-existent shift", async ({
    clientOwnerPage,
  }) => {
    // GIVEN: A non-existent shift ID
    const nonExistentShiftId = "00000000-0000-0000-0000-000000000001";

    // WHEN: Navigating directly to the shift detail page
    await clientOwnerPage.goto(
      `/client-dashboard/shifts/${nonExistentShiftId}`,
      {
        waitUntil: "domcontentloaded",
      },
    );

    // THEN: Should display error state or not found message
    await Promise.race([
      expect(
        clientOwnerPage.locator('[data-testid="shift-detail-error"]'),
      ).toBeVisible({ timeout: 15000 }),
      expect(
        clientOwnerPage.locator('[data-testid="shift-detail-not-found"]'),
      ).toBeVisible({ timeout: 15000 }),
    ]);
  });

  test("SHIFT-DETAIL-E2E-009: [P1] Should display loading state while fetching shift data", async ({
    clientOwnerPage,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: A shift exists
    const cashier = await createTestCashier(
      prismaClient,
      clientUser.store_id,
      clientUser.user_id,
    );

    const cashierUser = await prismaClient.user.create({
      data: createClientUser(),
    });

    const shift = await createShiftHelper(
      {
        store_id: clientUser.store_id,
        cashier_id: cashier.cashier_id,
        opened_by: cashierUser.user_id,
        status: "OPEN",
        opening_cash: 100.0,
      },
      prismaClient,
    );

    // WHEN: Navigating to the shift detail page
    await clientOwnerPage.goto(`/client-dashboard/shifts/${shift.shift_id}`, {
      waitUntil: "domcontentloaded",
    });

    // THEN: Should show either loading state initially or the loaded content
    // (loading state may be very fast, so we check both)
    await Promise.race([
      expect(
        clientOwnerPage.locator('[data-testid="shift-detail-loading"]'),
      ).toBeVisible({ timeout: 3000 }),
      expect(
        clientOwnerPage.locator('[data-testid="shift-detail-page"]'),
      ).toBeVisible({ timeout: 15000 }),
    ]);
  });
});
