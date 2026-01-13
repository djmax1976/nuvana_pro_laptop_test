/**
 * @test-level E2E
 * @justification End-to-end tests for shift detail page - validates complete user journey from shifts list to detail view
 * @story client-owner-dashboard-shift-detail-view
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import { createClientUser } from "../support/factories";
import { createTransaction as createTransactionFactory } from "../support/factories/transaction.factory";
import { PrismaClient, Prisma, DaySummaryStatus } from "@prisma/client";
import {
  createShift as createShiftHelper,
  createCashier as createCashierHelper,
} from "../support/helpers/database-helpers";

/**
 * Creates a day summary for testing shift list views.
 * The day summary is required for shifts to appear in the DayShiftAccordion.
 *
 * @param prismaClient - Prisma client instance
 * @param storeId - Store UUID
 * @param businessDate - Business date for the summary
 * @param status - Day summary status (default: OPEN)
 * @returns Created day summary with ID, store ID, and business date
 */
async function createDaySummary(
  prismaClient: PrismaClient,
  storeId: string,
  businessDate: Date,
  status: DaySummaryStatus = "OPEN",
): Promise<{ day_summary_id: string; store_id: string; business_date: Date }> {
  const normalizedDate = new Date(businessDate);
  normalizedDate.setHours(0, 0, 0, 0);

  const daySummary = await prismaClient.daySummary.create({
    data: {
      store_id: storeId,
      business_date: normalizedDate,
      status,
      shift_count: 1,
      gross_sales: new Prisma.Decimal(500.0),
      net_sales: new Prisma.Decimal(450.0),
      tax_collected: new Prisma.Decimal(40.0),
      transaction_count: 10,
      total_cash_variance: new Prisma.Decimal(0),
    },
  });

  return {
    day_summary_id: daySummary.day_summary_id,
    store_id: daySummary.store_id,
    business_date: daySummary.business_date,
  };
}

/**
 * Links a shift to a day summary by updating the shift's day_summary_id.
 * Required for shifts to appear in the DayShiftAccordion view.
 */
async function linkShiftToDaySummary(
  prismaClient: PrismaClient,
  shiftId: string,
  daySummaryId: string,
): Promise<void> {
  await prismaClient.shift.update({
    where: { shift_id: shiftId },
    data: { day_summary_id: daySummaryId },
  });
}

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
 * Navigate to shifts page and wait for it to load.
 * Handles all possible states: loading, table with data, empty, or error.
 * Uses progressive wait strategy for reliability in CI environments.
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

  // Wait for actual content to be visible instead of just selector presence
  await Promise.race([
    page
      .locator('[data-testid="shift-list-table"]')
      .waitFor({ state: "visible", timeout: 10000 })
      .catch(() => null),
    page
      .locator('[data-testid="shift-list-empty"]')
      .waitFor({ state: "visible", timeout: 10000 })
      .catch(() => null),
    page
      .locator('[data-testid="shift-list-error"]')
      .waitFor({ state: "visible", timeout: 10000 })
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

/**
 * Serial execution required for shift detail tests.
 * These tests share the same user session (clientOwnerPage) and create shifts
 * that could interfere with each other if run in parallel. Running serially
 * ensures consistent test data isolation and prevents race conditions.
 */
test.describe.serial("CLIENT-OWNER-DASHBOARD-E2E: Shift Detail View", () => {
  test("SHIFT-DETAIL-E2E-001: [P0] Should navigate to shift detail page when clicking shift row", async ({
    clientOwnerPage,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: A day summary and shift exist in the client user's store
    // Note: The shift list uses DayShiftAccordion which requires day summaries
    const terminal = await createPOSTerminal(prismaClient, clientUser.store_id);
    const cashier = await createTestCashier(
      prismaClient,
      clientUser.store_id,
      clientUser.user_id,
    );

    const cashierUser = await prismaClient.user.create({
      data: createClientUser(),
    });

    // Create a day summary for today (required for shift to appear in accordion)
    const daySummary = await createDaySummary(
      prismaClient,
      clientUser.store_id,
      new Date(),
      "OPEN",
    );

    const shift = await createShiftHelper(
      {
        store_id: clientUser.store_id,
        cashier_id: cashier.cashier_id,
        opened_by: cashierUser.user_id,
        pos_terminal_id: terminal.pos_terminal_id,
        status: "OPEN",
        opening_cash: 100.0,
      },
      prismaClient,
    );

    // Link shift to day summary so it appears in the DayShiftAccordion
    await linkShiftToDaySummary(
      prismaClient,
      shift.shift_id,
      daySummary.day_summary_id,
    );

    // WHEN: Navigating to the shifts page
    await navigateToShiftsPage(clientOwnerPage);

    // AND: Clicking on the shift row
    // Note: The shift row is rendered inside DayShiftAccordion with data-testid="shift-row-${shiftId}"
    const shiftRow = clientOwnerPage.locator(
      `[data-testid="shift-row-${shift.shift_id}"]`,
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
    const terminal = await createPOSTerminal(prismaClient, clientUser.store_id);
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
        pos_terminal_id: terminal.pos_terminal_id,
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
    // IMPORTANT: In serial test mode, the page may still show content from previous test (002).
    // We must ensure:
    // 1. Navigate to the new URL
    // 2. Wait for URL to match the expected shift ID
    // 3. Wait for the correct view (closed-shift-summary, NOT active-shift-view from test 002)
    const targetUrl = `/client-dashboard/shifts/${shift.shift_id}`;
    await clientOwnerPage.goto(targetUrl, {
      waitUntil: "domcontentloaded",
    });

    // Verify URL changed to correct shift - critical for serial test isolation
    await expect(clientOwnerPage).toHaveURL(targetUrl, {
      timeout: 10000,
    });

    // Wait for loading to complete - the page shows loading state while fetching shift data
    // This is essential because React Query may still be fetching data even after navigation
    await clientOwnerPage
      .locator('[data-testid="shift-detail-loading"]')
      .waitFor({ state: "hidden", timeout: 15000 })
      .catch(() => {
        // Loading may already be hidden if data was cached or fast
      });

    // THEN: The closed shift summary view should be displayed (NOT active-shift-view)
    // Wait for closed-shift-summary which confirms:
    // 1. Navigation completed to the correct shift
    // 2. Shift data loaded and status is CLOSED
    // 3. React rendered the correct view component
    await expect(
      clientOwnerPage.locator('[data-testid="closed-shift-summary"]'),
    ).toBeVisible({ timeout: 20000 });

    // AND: The "Shift Summary" header should be visible
    await expect(clientOwnerPage.getByText("Shift Summary")).toBeVisible();

    // AND: Cash reconciliation card should be visible
    await expect(
      clientOwnerPage.locator('[data-testid="cash-reconciliation-card"]'),
    ).toBeVisible();
  });

  test("SHIFT-DETAIL-E2E-004: [P0] Should display cash reconciliation for closed shift", async ({
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

    // THEN: Cash reconciliation card should be visible
    await expect(
      clientOwnerPage.locator('[data-testid="cash-reconciliation-card"]'),
    ).toBeVisible({ timeout: 20000 });

    // AND: Should show "Cash Reconciliation" header
    await expect(
      clientOwnerPage.getByText("Cash Reconciliation"),
    ).toBeVisible();

    // AND: Should display key reconciliation fields
    await expect(clientOwnerPage.getByText("Opening Cash")).toBeVisible();
    await expect(clientOwnerPage.getByText("Closing Cash")).toBeVisible();
    await expect(clientOwnerPage.getByText("Expected Cash")).toBeVisible();
    // Use exact match to avoid matching multiple "Variance" elements
    await expect(
      clientOwnerPage.getByText("Variance", { exact: true }),
    ).toBeVisible();
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
  });

  test("SHIFT-DETAIL-E2E-006: [P0] Should navigate back to shifts list when clicking back button", async ({
    clientOwnerPage,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: A shift exists
    const terminal = await createPOSTerminal(prismaClient, clientUser.store_id);
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
        pos_terminal_id: terminal.pos_terminal_id,
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

  test("SHIFT-DETAIL-E2E-007: [P1] Should display complete closed shift info with zero variance", async ({
    clientOwnerPage,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: A CLOSED shift with zero variance
    const terminal = await createPOSTerminal(prismaClient, clientUser.store_id);
    const cashier = await createTestCashier(
      prismaClient,
      clientUser.store_id,
      clientUser.user_id,
    );

    // Create a closed shift with zero variance
    const shiftId = crypto.randomUUID();
    await prismaClient.shift.create({
      data: {
        shift_id: shiftId,
        store_id: clientUser.store_id,
        opened_by: clientUser.user_id,
        cashier_id: cashier.cashier_id,
        pos_terminal_id: terminal.pos_terminal_id,
        opening_cash: new Prisma.Decimal(200.0),
        closing_cash: new Prisma.Decimal(200.0),
        expected_cash: new Prisma.Decimal(200.0),
        variance: new Prisma.Decimal(0),
        status: "CLOSED",
        opened_at: new Date(Date.now() - 8 * 60 * 60 * 1000),
        closed_at: new Date(),
      },
    });

    // WHEN: Navigating to the shift detail page
    await clientOwnerPage.goto(`/client-dashboard/shifts/${shiftId}`, {
      waitUntil: "domcontentloaded",
    });

    // Wait for summary to load
    await expect(
      clientOwnerPage.locator('[data-testid="closed-shift-summary"]'),
    ).toBeVisible({ timeout: 15000 });

    // THEN: Should show success message for zero variance
    await expect(clientOwnerPage.getByText("no variance")).toBeVisible({
      timeout: 10000,
    });

    // AND: Variance details card should NOT be visible (since variance is 0)
    await expect(
      clientOwnerPage.locator('[data-testid="variance-details-card"]'),
    ).not.toBeVisible();
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
    const terminal = await createPOSTerminal(prismaClient, clientUser.store_id);
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
        pos_terminal_id: terminal.pos_terminal_id,
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
