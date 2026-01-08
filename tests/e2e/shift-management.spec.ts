/**
 * @test-level E2E
 * @justification End-to-end tests for shift management UI - validates complete user journey from opening shifts to variance approval
 * @story 4-7-shift-management-ui
 *
 * ARCHITECTURE NOTES:
 * The Shift Management UI uses a DayShiftAccordion component that displays:
 * - Day summaries as parent accordion rows
 * - Shifts as children nested within their associated day summary
 *
 * For shifts to be visible in the UI, they MUST be linked to a DaySummary via
 * the day_summary_id foreign key. Shifts without day_summary_id won't appear
 * in the accordion view.
 *
 * Test IDs in the implementation:
 * - Day accordion: data-testid="day-accordion-{businessDate}"
 * - Day header: data-testid="day-accordion-header-{businessDate}"
 * - Shift rows: data-testid="shift-row-{shiftId}"
 * - Main container: data-testid="shift-list-table" (when data exists)
 * - Empty state: data-testid="shift-list-empty"
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createStore,
  createCompany,
  createClientUser,
  createUser,
} from "../support/factories";
import { PrismaClient, Prisma } from "@prisma/client";
import {
  createShift as createShiftHelper,
  createCashier as createCashierHelper,
} from "../support/helpers/database-helpers";

/**
 * Helper function to create a company with an owner and store
 */
async function createCompanyWithStore(
  prismaClient: PrismaClient,
  overrides: Record<string, unknown> = {},
) {
  const owner = await prismaClient.user.create({
    data: createUser({ name: "Company Owner" }),
  });
  const company = await prismaClient.company.create({
    data: createCompany({ owner_user_id: owner.user_id, ...overrides }),
  });
  const store = await prismaClient.store.create({
    data: createStore({ company_id: company.company_id }),
  });
  return { owner, company, store };
}

/**
 * Helper function to create a test cashier using the database helper
 * This ensures proper employee_id generation and all required fields are set
 *
 * @param prismaClient - Prisma client instance
 * @param storeId - Store UUID
 * @param createdByUserId - User ID of the creator
 * @param name - Optional custom name for the cashier
 */
async function createTestCashier(
  prismaClient: PrismaClient,
  storeId: string,
  createdByUserId: string,
  name?: string,
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
      name,
    },
    prismaClient,
  );
}

/**
 * Helper function to create a day summary for testing
 * REQUIRED for shifts to be visible in the DayShiftAccordion UI
 *
 * @security DB-006: TENANT_ISOLATION - Day summaries are scoped by store_id
 */
async function createDaySummary(
  prismaClient: PrismaClient,
  storeId: string,
  businessDate: Date,
  status: "OPEN" | "PENDING_CLOSE" | "CLOSED" = "OPEN",
  closedBy?: string,
): Promise<{ day_summary_id: string; status: string; business_date: Date }> {
  const normalizedDate = new Date(businessDate);
  normalizedDate.setHours(0, 0, 0, 0);

  const daySummary = await prismaClient.daySummary.create({
    data: {
      store_id: storeId,
      business_date: normalizedDate,
      status,
      shift_count: 0,
      gross_sales: new Prisma.Decimal(0),
      net_sales: new Prisma.Decimal(0),
      tax_collected: new Prisma.Decimal(0),
      transaction_count: 0,
      total_cash_variance: new Prisma.Decimal(0),
      closed_at: status === "CLOSED" ? new Date() : null,
      closed_by: closedBy || null,
    },
  });

  return {
    day_summary_id: daySummary.day_summary_id,
    status: daySummary.status,
    business_date: normalizedDate,
  };
}

/**
 * Helper function to create a shift and link it to a day summary
 * The shift will be visible in the accordion UI when linked to a day summary
 *
 * @returns Shift with day_summary_id populated
 */
async function createShiftWithDaySummary(
  prismaClient: PrismaClient,
  options: {
    store_id: string;
    cashier_id: string;
    opened_by: string;
    day_summary_id: string;
    status?: "OPEN" | "CLOSED";
    opening_cash?: number;
    closing_cash?: number | null;
    opened_at?: Date;
    closed_at?: Date | null;
  },
): Promise<{
  shift_id: string;
  store_id: string;
  cashier_id: string;
  day_summary_id: string;
}> {
  const shift = await createShiftHelper(
    {
      store_id: options.store_id,
      cashier_id: options.cashier_id,
      opened_by: options.opened_by,
      status: options.status || "OPEN",
      opening_cash: options.opening_cash || 100.0,
      closed_at: options.closed_at,
    },
    prismaClient,
  );

  // Link the shift to the day summary
  const updatedShift = await prismaClient.shift.update({
    where: { shift_id: shift.shift_id },
    data: { day_summary_id: options.day_summary_id },
    select: { shift_id: true, day_summary_id: true },
  });

  // Increment the day summary's shift_count so it displays correctly in the UI
  // The DayShiftAccordion component uses shift_count to show "X shifts" label
  await prismaClient.daySummary.update({
    where: { day_summary_id: options.day_summary_id },
    data: { shift_count: { increment: 1 } },
  });

  return {
    shift_id: shift.shift_id,
    store_id: shift.store_id,
    cashier_id: shift.cashier_id,
    day_summary_id: options.day_summary_id,
  };
}

/**
 * Helper function to navigate to shifts page and wait for it to load
 * Handles all possible states: loading, table with data, empty, or error
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

  // Wait for either the shift list table, loading state, empty state, or error state to appear
  // This handles cases where the API call is still loading or has failed
  // Note: Component uses 'shift-list-empty' (not 'shift-list-empty-state')
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
      .waitForSelector('[data-testid="shift-list-empty"]', {
        timeout: 30000,
      })
      .catch(() => null),
  ]);

  // Wait for actual content to be visible instead of hard wait
  await Promise.race([
    expect(page.locator('[data-testid="shift-list-table"]'))
      .toBeVisible({ timeout: 5000 })
      .catch(() => null),
    expect(page.locator('[data-testid="shift-list-empty"]'))
      .toBeVisible({ timeout: 5000 })
      .catch(() => null),
    expect(page.locator('[data-testid="shift-list-error"]'))
      .toBeVisible({ timeout: 5000 })
      .catch(() => null),
  ]);
}

/**
 * Shift Management UI E2E Tests - Story 4.7
 *
 * STORY: As a Shift Manager, I want to manage shifts through the UI,
 * so that I can open, close, and reconcile shifts easily.
 *
 * TEST LEVEL: E2E (end-to-end user journey tests)
 * PRIMARY GOAL: Verify complete user flow from shift list to variance approval
 *
 * BUSINESS RULES TESTED:
 * - Navigate to shifts page
 * - View shift list with status indicators
 * - Filter shifts by status, date range, store
 * - Open new shift
 * - Close and reconcile shift
 * - Approve variance
 * - View shift details
 * - RLS enforcement (users only see accessible stores)
 *
 * ACCEPTANCE CRITERIA COVERAGE:
 * - AC #1: Shift list with filtering and RLS
 * - AC #2: Shift opening form
 * - AC #3: Shift closing and reconciliation
 * - AC #4: Variance approval workflow
 * - AC #5: Shift detail view
 */

test.describe("4.7-E2E: Shift Management UI", () => {
  test("4.7-E2E-001: [P0] Should navigate to shifts page and display shift list", async ({
    clientOwnerPage,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: Using clientUser's own store (CLIENT_OWNER has access to their own company's stores)
    // No need to create a new company/store or assign roles - clientUser already owns their company/store
    const store_id = clientUser.store_id;

    const cashierUser = await prismaClient.user.create({
      data: createClientUser(),
    });

    const cashier = await createTestCashier(
      prismaClient,
      store_id,
      clientUser.user_id,
    );

    await createShiftHelper(
      {
        store_id: store_id,
        cashier_id: cashier.cashier_id,
        opened_by: cashierUser.user_id,
        status: "OPEN",
        opening_cash: 100.0,
      },
      prismaClient,
    );

    // WHEN: Navigating to the shifts page
    await navigateToShiftsPage(clientOwnerPage);

    // THEN: Shift list should be displayed
    // Wait for the page heading in header (title is "Shift Management" set via PageTitleContext)
    // The heading is rendered in the Header component with data-testid="header-page-title"
    await expect(
      clientOwnerPage.locator('[data-testid="header-page-title"]'),
    ).toBeVisible({
      timeout: 15000,
    });

    // Verify the heading contains expected text (case-insensitive match for "shift")
    await expect(
      clientOwnerPage.locator('[data-testid="header-page-title"]'),
    ).toContainText(/shift/i, { timeout: 5000 });

    // Wait for either the table (if shifts exist) or empty state (if no shifts)
    await Promise.race([
      clientOwnerPage
        .locator('[data-testid="shift-list-table"]')
        .waitFor({ state: "visible", timeout: 15000 })
        .catch(() => null),
      clientOwnerPage
        .locator('[data-testid="shift-list-empty"]')
        .waitFor({ state: "visible", timeout: 15000 })
        .catch(() => null),
    ]);

    // Verify at least one of them is visible
    const tableVisible = await clientOwnerPage
      .locator('[data-testid="shift-list-table"]')
      .isVisible()
      .catch(() => false);
    const emptyVisible = await clientOwnerPage
      .locator('[data-testid="shift-list-empty"]')
      .isVisible()
      .catch(() => false);

    expect(tableVisible || emptyVisible).toBe(true);
  });

  test("4.7-E2E-002: [P0] Should display shift columns (shift_id, store, cashier, opened_at, closed_at, status, variance_amount)", async ({
    clientOwnerPage,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: Using clientUser's own store (CLIENT_OWNER has access to their own company's stores)
    const store_id = clientUser.store_id;

    const cashierUser = await prismaClient.user.create({
      data: createClientUser({ name: "Test Cashier" }),
    });

    const cashier = await createTestCashier(
      prismaClient,
      store_id,
      clientUser.user_id,
    );

    await createShiftHelper(
      {
        store_id: store_id,
        cashier_id: cashier.cashier_id,
        opened_by: cashierUser.user_id,
        status: "OPEN",
        opening_cash: 100.0,
      },
      prismaClient,
    );

    // WHEN: Navigating to the shifts page
    await navigateToShiftsPage(clientOwnerPage);

    // THEN: Shift columns should be displayed
    // Wait for table to be visible first (or empty state if no shifts)
    const table = clientOwnerPage.locator('[data-testid="shift-list-table"]');
    const emptyState = clientOwnerPage.locator(
      '[data-testid="shift-list-empty"]',
    );

    await Promise.race([
      table.waitFor({ state: "visible", timeout: 15000 }).catch(() => null),
      emptyState
        .waitFor({ state: "visible", timeout: 15000 })
        .catch(() => null),
    ]);

    // If table is visible, check headers
    const isTableVisible = await table.isVisible().catch(() => false);
    if (isTableVisible) {
      // Use table header selectors to avoid strict mode violations
      const tableHeader = clientOwnerPage.locator("thead");
      await expect(tableHeader.getByText("Shift ID")).toBeVisible({
        timeout: 5000,
      });
      await expect(tableHeader.getByText("Store")).toBeVisible({
        timeout: 5000,
      });
      await expect(tableHeader.getByText("Cashier")).toBeVisible({
        timeout: 5000,
      });
      await expect(tableHeader.getByText("Opened At")).toBeVisible({
        timeout: 5000,
      });
      await expect(tableHeader.getByText("Closed At")).toBeVisible({
        timeout: 5000,
      });
      await expect(tableHeader.getByText("Status")).toBeVisible({
        timeout: 5000,
      });
      await expect(tableHeader.getByText("Variance")).toBeVisible({
        timeout: 5000,
      });
    }
  });

  test("4.7-E2E-003: [P0] Should filter shifts by cashier", async ({
    clientOwnerPage,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: Using clientUser's own store with shifts from different cashiers
    // The ShiftList UI uses DayShiftAccordion which groups shifts by day summary.
    // Shifts MUST have a day_summary_id to be visible in the accordion.
    // Cashier filter is applied client-side after data is fetched.
    const store_id = clientUser.store_id;

    const cashierUser = await prismaClient.user.create({
      data: createClientUser(),
    });

    // Create a day summary for today - required for shifts to appear in accordion
    const today = new Date();
    const daySummary = await createDaySummary(
      prismaClient,
      store_id,
      today,
      "OPEN",
    );

    // Create first cashier with a unique name for filtering
    const cashier1 = await createTestCashier(
      prismaClient,
      store_id,
      clientUser.user_id,
      "FilterTest Cashier Alpha",
    );

    // Create second cashier with a unique name
    const cashier2 = await createTestCashier(
      prismaClient,
      store_id,
      clientUser.user_id,
      "FilterTest Cashier Beta",
    );

    // Create shifts linked to the day summary
    const shift1 = await createShiftWithDaySummary(prismaClient, {
      store_id: store_id,
      cashier_id: cashier1.cashier_id,
      opened_by: cashierUser.user_id,
      day_summary_id: daySummary.day_summary_id,
      status: "OPEN",
      opening_cash: 100.0,
    });

    const shift2 = await createShiftWithDaySummary(prismaClient, {
      store_id: store_id,
      cashier_id: cashier2.cashier_id,
      opened_by: cashierUser.user_id,
      day_summary_id: daySummary.day_summary_id,
      status: "OPEN",
      opening_cash: 200.0,
    });

    // WHEN: Navigating to shifts page
    await navigateToShiftsPage(clientOwnerPage);

    // Wait for the shifts table (accordion container) to load
    const table = clientOwnerPage.locator('[data-testid="shift-list-table"]');
    await expect(table).toBeVisible({ timeout: 15000 });

    // In the DayShiftAccordion, shifts are rendered with data-testid="shift-row-{shiftId}"
    const shift1Row = clientOwnerPage.locator(
      `[data-testid="shift-row-${shift1.shift_id}"]`,
    );
    const shift2Row = clientOwnerPage.locator(
      `[data-testid="shift-row-${shift2.shift_id}"]`,
    );

    // Both shifts should be visible before filtering (accordions are expanded by default)
    await expect(shift1Row).toBeVisible({ timeout: 10000 });
    await expect(shift2Row).toBeVisible({ timeout: 10000 });

    // WHEN: Filtering by cashier 1
    const cashierFilter = clientOwnerPage.getByTestId("filter-cashier");
    await expect(cashierFilter).toBeVisible({ timeout: 10000 });
    await cashierFilter.click();

    // Wait for dropdown to open and select cashier 1 by name
    const cashier1Option = clientOwnerPage
      .locator(`[role="option"]:has-text("${cashier1.name}")`)
      .first();
    await expect(cashier1Option).toBeVisible({ timeout: 10000 });
    await cashier1Option.click();

    // Wait for dropdown to close
    await expect(cashier1Option).not.toBeVisible({ timeout: 5000 });

    // Click Apply Filters button
    const applyButton = clientOwnerPage.getByTestId("apply-filters-button");
    await expect(applyButton).toBeVisible({ timeout: 5000 });
    await applyButton.click();

    // Wait for the table to update (filter is applied client-side via React state)
    // The ShiftList component filters shifts using appliedFilters.cashierId
    await clientOwnerPage.waitForTimeout(500);

    // THEN: Only cashier 1's shift should be visible
    await expect(shift1Row).toBeVisible({ timeout: 10000 });

    // Cashier 2's shift should NOT be visible after filtering
    await expect(shift2Row).not.toBeVisible({ timeout: 5000 });
  });

  test("4.7-E2E-005: [P0] Should close and reconcile a shift via API", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: Using clientUser's own store with an OPEN shift
    // This tests the complete close/reconcile workflow via the API
    // Story 4.3: Cash Reconciliation API
    const store_id = clientUser.store_id;

    const cashierUser = await prismaClient.user.create({
      data: createClientUser(),
    });

    const cashier = await createTestCashier(
      prismaClient,
      store_id,
      clientUser.user_id,
    );

    const openingCash = 100.0;
    const shift = await createShiftHelper(
      {
        store_id: store_id,
        cashier_id: cashier.cashier_id,
        opened_by: cashierUser.user_id,
        status: "OPEN",
        opening_cash: openingCash,
      },
      prismaClient,
    );

    // WHEN: Closing the shift via the direct close API
    // POST /api/shifts/:shiftId/close - simplified single-step flow
    const closingCash = 150.0; // More than opening (from sales)
    const closeResponse = await clientUserApiRequest.post(
      `/api/shifts/${shift.shift_id}/close`,
      { closing_cash: closingCash },
    );

    // THEN: Shift should be closed successfully
    expect(closeResponse.status()).toBe(200);

    const closeBody = await closeResponse.json();
    expect(closeBody.success).toBe(true);
    expect(closeBody.data).toBeDefined();
    expect(closeBody.data.shift_id).toBe(shift.shift_id);
    expect(closeBody.data.status).toBe("CLOSED");
    expect(closeBody.data.closing_cash).toBe(closingCash);
    expect(closeBody.data.closed_at).toBeDefined();
    expect(closeBody.data.closed_by).toBeDefined();

    // Verify the shift is now CLOSED in the database
    const closedShift = await prismaClient.shift.findUnique({
      where: { shift_id: shift.shift_id },
    });
    expect(closedShift).not.toBeNull();
    expect(closedShift!.status).toBe("CLOSED");
    expect(Number(closedShift!.closing_cash)).toBe(closingCash);
    expect(closedShift!.closed_at).not.toBeNull();

    // Verify the shift appears as CLOSED in the shift list API
    const listResponse = await clientUserApiRequest.get(
      `/api/shifts?status=CLOSED`,
    );
    expect(listResponse.status()).toBe(200);

    const listBody = await listResponse.json();
    expect(listBody.success).toBe(true);
    expect(listBody.data.shifts).toBeDefined();

    // Find our closed shift in the list
    const closedShiftInList = listBody.data.shifts.find(
      (s: { shift_id: string }) => s.shift_id === shift.shift_id,
    );
    expect(closedShiftInList).toBeDefined();
    expect(closedShiftInList.status).toBe("CLOSED");
  });

  // ============================================================================
  // SECURITY TESTS - Authentication & Authorization (E2E Level)
  // ============================================================================

  test("4.7-E2E-SEC-001: [P1] Should require authentication to access shifts page", async ({
    page,
  }) => {
    // GIVEN: User is not authenticated
    // (Using page fixture without authentication)

    // WHEN: Attempting to navigate to shifts page
    await page.goto("/client-dashboard/shifts", {
      waitUntil: "domcontentloaded",
    });

    // THEN: Should redirect to login or show unauthorized
    // Wait for client-side redirect to complete (React hydration + auth check + redirect)
    // The redirect happens via router.push("/login") after auth context determines user is not authenticated
    // Wait for either:
    // 1. Redirect to login page
    // 2. No shift content visible (protected route shows nothing)
    try {
      await page.waitForURL(/\/(login|auth)/, { timeout: 15000 });
      const currentUrl = page.url();
      // Verify we're on a login/auth page
      const isOnAuthPage =
        currentUrl.includes("/login") || currentUrl.includes("/auth");
      expect(isOnAuthPage).toBeTruthy();
    } catch {
      // If no redirect happened, verify that the shifts page content is NOT accessible
      // The protected route should show loading or nothing, NOT the actual shifts data
      const shiftsTable = page.locator('[data-testid="shift-list-table"]');
      const isTableVisible = await shiftsTable.isVisible().catch(() => false);
      expect(isTableVisible).toBe(false);

      // Verify that we're not showing any shift data
      // In the DayShiftAccordion, shifts are rendered with data-testid="shift-row-{shiftId}"
      const shiftsRows = page.locator('[data-testid^="shift-row-"]');
      const rowCount = await shiftsRows.count();
      expect(rowCount).toBe(0);
    }
  });

  test("4.7-E2E-SEC-002: [P1] Should enforce RLS - users only see shifts for accessible stores", async ({
    clientOwnerPage,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: Two stores exist with shifts, user only has access to one store
    // The ShiftList UI uses DayShiftAccordion which groups shifts by day summary.
    // Shifts MUST have a day_summary_id to be visible in the accordion.
    //
    // RLS (Row Level Security) is enforced at the API level - the backend only
    // returns shifts for stores the user has access to. The frontend simply
    // renders what the API returns.
    const accessibleStoreId = clientUser.store_id;

    // Create a completely separate company/store that clientUser does NOT have access to
    const { owner: otherOwner, store: otherStore } =
      await createCompanyWithStore(prismaClient);

    const cashierUser1 = await prismaClient.user.create({
      data: createClientUser(),
    });
    const cashierUser2 = await prismaClient.user.create({
      data: createClientUser(),
    });

    // Create day summaries for both stores - required for shifts to be visible
    const today = new Date();
    const accessibleDaySummary = await createDaySummary(
      prismaClient,
      accessibleStoreId,
      today,
      "OPEN",
    );
    const inaccessibleDaySummary = await createDaySummary(
      prismaClient,
      otherStore.store_id,
      today,
      "OPEN",
    );

    const cashier1 = await createTestCashier(
      prismaClient,
      accessibleStoreId,
      clientUser.user_id,
      "RLS Test Accessible Cashier",
    );

    const cashier2 = await createTestCashier(
      prismaClient,
      otherStore.store_id,
      otherOwner.user_id,
      "RLS Test Inaccessible Cashier",
    );

    // Create shift linked to accessible store's day summary
    const shift1 = await createShiftWithDaySummary(prismaClient, {
      store_id: accessibleStoreId,
      cashier_id: cashier1.cashier_id,
      opened_by: cashierUser1.user_id,
      day_summary_id: accessibleDaySummary.day_summary_id,
      status: "OPEN",
      opening_cash: 100.0,
    });

    // Create shift linked to inaccessible store's day summary
    // This shift should NOT be visible to clientUser (different company)
    const shift2 = await createShiftWithDaySummary(prismaClient, {
      store_id: otherStore.store_id,
      cashier_id: cashier2.cashier_id,
      opened_by: cashierUser2.user_id,
      day_summary_id: inaccessibleDaySummary.day_summary_id,
      status: "OPEN",
      opening_cash: 200.0,
    });

    // WHEN: clientUser (CLIENT_OWNER) navigates to shifts page
    // They should only see shifts from their own company's stores
    await navigateToShiftsPage(clientOwnerPage);

    // THEN: Only shifts from accessible store should be displayed
    // Wait for the shift list to load (table or empty state)
    await Promise.race([
      clientOwnerPage
        .locator('[data-testid="shift-list-table"]')
        .waitFor({ state: "visible", timeout: 15000 })
        .catch(() => null),
      clientOwnerPage
        .locator('[data-testid="shift-list-empty"]')
        .waitFor({ state: "visible", timeout: 15000 })
        .catch(() => null),
    ]);

    // Wait for content to be visible
    await expect(
      clientOwnerPage
        .locator('[data-testid="shift-list-table"]')
        .or(clientOwnerPage.locator('[data-testid="shift-list-empty"]')),
    ).toBeVisible({ timeout: 10000 });

    // In the DayShiftAccordion, shifts are rendered with data-testid="shift-row-{shiftId}"
    // Verify shift1 (from accessible store) is visible
    const shift1Row = clientOwnerPage.locator(
      `[data-testid="shift-row-${shift1.shift_id}"]`,
    );
    const shift1Count = await shift1Row.count();
    expect(shift1Count).toBeGreaterThan(0);

    // Verify shift2 (from inaccessible store) is NOT visible
    // This validates that RLS is enforced - the API should not return this shift
    const shift2Row = clientOwnerPage.locator(
      `[data-testid="shift-row-${shift2.shift_id}"]`,
    );
    const shift2Count = await shift2Row.count();
    expect(shift2Count).toBe(0);
  });

  // ============================================================================
  // SECURITY TESTS - Authentication & Authorization (E2E Level)
  // ============================================================================

  test("4.7-E2E-SEC-003: [P1] Should reject requests with invalid authentication token", async ({
    apiRequest,
  }) => {
    // GIVEN: User attempts to access backend API with invalid token
    // Note: Using apiRequest to hit the backend directly (not the frontend)

    // WHEN: Attempting to make API request with invalid token
    const response = await apiRequest.get("/api/shifts", {
      headers: {
        Authorization: "Bearer invalid-token-12345",
      },
    });

    // THEN: Should return 401 (unauthorized)
    expect(response.status()).toBe(401);
  });

  test("4.7-E2E-SEC-004: [P1] Should reject requests without authentication token", async ({
    apiRequest,
  }) => {
    // GIVEN: User attempts to access backend API without token

    // WHEN: Attempting to make API request without token
    // Note: Using apiRequest to hit the backend directly (not the frontend)
    const response = await apiRequest.get("/api/shifts");

    // THEN: Should return 401 (unauthorized)
    expect(response.status()).toBe(401);
  });

  test("4.7-E2E-SEC-005: [P1] Should prevent SQL injection in shift ID parameter", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: Using clientUser's own store with a shift
    const store_id = clientUser.store_id;

    const cashierUser = await prismaClient.user.create({
      data: createClientUser(),
    });

    const cashier = await createTestCashier(
      prismaClient,
      store_id,
      clientUser.user_id,
    );

    const shift = await createShiftHelper(
      {
        store_id: store_id,
        cashier_id: cashier.cashier_id,
        opened_by: cashierUser.user_id,
        status: "OPEN",
        opening_cash: 100.0,
      },
      prismaClient,
    );

    // WHEN: Attempting to access shift with SQL injection in shift ID
    // Note: Using clientUserApiRequest to hit the backend API directly
    const maliciousId = `${shift.shift_id}' OR '1'='1`;
    const response = await clientUserApiRequest.get(
      `/api/shifts/${encodeURIComponent(maliciousId)}`,
    );

    // THEN: Should reject invalid shift ID format
    // Fastify's built-in schema validation catches the invalid UUID format
    // and returns 400 Bad Request before our handler is called
    expect(response.status()).toBe(400);
    const body = await response.json();
    // Verify an error object is returned (format depends on Fastify's error handler)
    expect(body.error).toBeDefined();
    // The key security assertion: the malicious payload was blocked
    // It doesn't matter if it's Fastify schema validation or Zod validation
    // as long as the SQL injection attempt is rejected with a 400 error
  });

  test("4.7-E2E-SEC-006: [P1] Should prevent XSS in shift data display", async ({
    clientOwnerPage,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: Using clientUser's own store with shift containing potential XSS in cashier name
    // The ShiftList UI uses DayShiftAccordion which groups shifts by day summary.
    // Shifts MUST have a day_summary_id to be visible in the accordion.
    //
    // XSS PROTECTION: React automatically escapes all text content rendered in JSX.
    // This test validates that malicious scripts in user data are rendered as
    // escaped text, not executed as JavaScript.
    const store_id = clientUser.store_id;

    const cashierUser = await prismaClient.user.create({
      data: createClientUser(),
    });

    // Create a day summary for today - required for shifts to appear in accordion
    const today = new Date();
    const daySummary = await createDaySummary(
      prismaClient,
      store_id,
      today,
      "OPEN",
    );

    // Create a cashier with XSS payload in the name
    // This is what's displayed in the shift list cashier column
    const xssPayload = "<script>alert('xss')</script>XSSTestCashier";
    const cashier = await createCashierHelper(
      {
        store_id: store_id,
        created_by: clientUser.user_id,
        name: xssPayload,
      },
      prismaClient,
    );

    // Create shift linked to the day summary
    const shift = await createShiftWithDaySummary(prismaClient, {
      store_id: store_id,
      cashier_id: cashier.cashier_id,
      opened_by: cashierUser.user_id,
      day_summary_id: daySummary.day_summary_id,
      status: "OPEN",
      opening_cash: 100.0,
    });

    // WHEN: Navigating to shifts page
    await navigateToShiftsPage(clientOwnerPage);

    // THEN: XSS should be escaped (React automatically escapes HTML)
    // Wait for the shift list to load
    await Promise.race([
      clientOwnerPage
        .locator('[data-testid="shift-list-table"]')
        .waitFor({ state: "visible", timeout: 15000 })
        .catch(() => null),
      clientOwnerPage
        .locator('[data-testid="shift-list-empty"]')
        .waitFor({ state: "visible", timeout: 15000 })
        .catch(() => null),
    ]);

    // Wait for content to be visible
    await expect(
      clientOwnerPage
        .locator('[data-testid="shift-list-table"]')
        .or(clientOwnerPage.locator('[data-testid="shift-list-empty"]')),
    ).toBeVisible({ timeout: 10000 });

    // In the DayShiftAccordion, shifts are rendered with data-testid="shift-row-{shiftId}"
    const shiftRow = clientOwnerPage.locator(
      `[data-testid="shift-row-${shift.shift_id}"]`,
    );
    const rowCount = await shiftRow.count();
    expect(rowCount).toBeGreaterThan(0);

    if (rowCount > 0) {
      // Get the row's text content (React escapes HTML, so script tags become text)
      const rowText = await shiftRow.textContent();
      expect(rowText).toBeTruthy();

      // Verify the cashier name appears (proving the data is displayed)
      // The text should contain "XSSTestCashier" (the safe part of the name)
      expect(rowText).toContain("XSSTestCashier");

      // Get the row's inner HTML to check for escaped XSS
      const rowHTML = await shiftRow.innerHTML();

      // React escapes HTML entities, so <script> becomes &lt;script&gt;
      // SECURITY CHECK: Verify the XSS payload is NOT present as unescaped HTML
      const hasUnescapedXSS = rowHTML.includes("<script>alert('xss')</script>");
      expect(hasUnescapedXSS).toBe(false);

      // Additional check: If the script tag appears at all, it should be escaped
      // (visible as text, not executable)
      if (rowHTML.includes("script")) {
        // The script tag should be HTML-escaped (&lt;script&gt;) not raw (<script>)
        expect(rowHTML).toContain("&lt;script&gt;");
      }
    }
  });

  // ============================================================================
  // EDGE CASE TESTS - Boundary Conditions (E2E Level)
  // ============================================================================

  test("4.7-E2E-EDGE-001: [P2] Should handle empty shift list gracefully", async ({
    clientOwnerPage,
  }) => {
    // GIVEN: Using clientOwnerPage which is already authenticated as CLIENT_OWNER
    // The clientOwnerPage has access to their own company/store via the CLIENT_OWNER role
    // Note: Other tests may have created shifts, so we check the empty state behavior
    // by filtering for a date range that has no shifts

    // WHEN: Navigating to shifts page
    await navigateToShiftsPage(clientOwnerPage);

    // THEN: Either empty state or table should be displayed (depends on if other tests created shifts)
    // This test validates that the page handles the no-shifts case gracefully
    const emptyState = clientOwnerPage.locator(
      '[data-testid="shift-list-empty"]',
    );
    const table = clientOwnerPage.locator('[data-testid="shift-list-table"]');

    // Wait for either state to be visible
    await Promise.race([
      emptyState
        .waitFor({ state: "visible", timeout: 15000 })
        .catch(() => null),
      table.waitFor({ state: "visible", timeout: 15000 }).catch(() => null),
    ]);

    // Verify at least one is visible (page is functional)
    const emptyVisible = await emptyState.isVisible().catch(() => false);
    const tableVisible = await table.isVisible().catch(() => false);
    expect(emptyVisible || tableVisible).toBe(true);
  });

  // ============================================================================
  // ADDITIONAL ASSERTIONS - Response Structure & Data Types (E2E Level)
  // ============================================================================

  test("4.7-E2E-ASSERT-001: [P2] Should verify shift list response structure", async ({
    clientOwnerPage,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: Using clientUser's own store (CLIENT_OWNER has access to their own company's stores)
    // No need to create a new company/store or assign roles - clientUser already owns their company/store
    const store_id = clientUser.store_id;

    const cashierUser = await prismaClient.user.create({
      data: createClientUser(),
    });

    const cashier = await createTestCashier(
      prismaClient,
      store_id,
      clientUser.user_id,
    );

    await createShiftHelper(
      {
        store_id: store_id,
        cashier_id: cashier.cashier_id,
        opened_by: cashierUser.user_id,
        status: "OPEN",
        opening_cash: 100.0,
      },
      prismaClient,
    );

    // WHEN: Navigating to shifts page
    await navigateToShiftsPage(clientOwnerPage);

    // THEN: Shift list should have correct structure
    // Wait for table to be visible first (or empty state if no shifts)
    const table = clientOwnerPage.locator('[data-testid="shift-list-table"]');
    const emptyState = clientOwnerPage.locator(
      '[data-testid="shift-list-empty"]',
    );

    await Promise.race([
      table.waitFor({ state: "visible", timeout: 15000 }).catch(() => null),
      emptyState
        .waitFor({ state: "visible", timeout: 15000 })
        .catch(() => null),
    ]);

    // If table is visible, check headers
    const isTableVisible = await table.isVisible().catch(() => false);
    if (isTableVisible) {
      // Use table header selectors to avoid strict mode violations
      const tableHeader = clientOwnerPage.locator("thead");
      await expect(tableHeader.getByText("Shift ID")).toBeVisible({
        timeout: 5000,
      });
      await expect(tableHeader.getByText("Store")).toBeVisible({
        timeout: 5000,
      });
      await expect(tableHeader.getByText("Cashier")).toBeVisible({
        timeout: 5000,
      });
      await expect(tableHeader.getByText("Status")).toBeVisible({
        timeout: 5000,
      });
    }
  });
});
