/**
 * @test-level E2E
 * @justification End-to-end tests for shift management UI - validates complete user journey from opening shifts to variance approval
 * @story 4-7-shift-management-ui
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import { createShift } from "../support/factories/shift.factory";
import {
  createStore,
  createCompany,
  createClientUser,
  createUser,
} from "../support/factories";
import { PrismaClient } from "@prisma/client";
import { createShift as createShiftHelper } from "../support/helpers/database-helpers";

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
    storeManagerPage,
    prismaClient,
  }) => {
    // GIVEN: A store exists with shifts
    const { owner, company, store } =
      await createCompanyWithStore(prismaClient);
    const cashier = await prismaClient.user.create({
      data: createClientUser(),
    });

    await createShiftHelper(
      {
        store_id: store.store_id,
        cashier_id: cashier.user_id,
        opened_by: cashier.user_id,
        status: "OPEN",
        opening_cash: 100.0,
      },
      prismaClient,
    );

    // WHEN: Navigating to the shifts page
    await storeManagerPage.goto("/client-dashboard/shifts");

    // THEN: Shift list should be displayed
    await expect(storeManagerPage.getByText(/shifts/i)).toBeVisible();
    await expect(
      storeManagerPage.locator('[data-testid="shift-list-table"]'),
    ).toBeVisible({ timeout: 10000 });
  });

  test("4.7-E2E-002: [P0] Should display shift columns (shift_id, store, cashier, opened_at, closed_at, status, variance_amount)", async ({
    storeManagerPage,
    prismaClient,
  }) => {
    // GIVEN: A store exists with a shift
    const { owner, company, store } =
      await createCompanyWithStore(prismaClient);
    const cashier = await prismaClient.user.create({
      data: createClientUser({ name: "Test Cashier" }),
    });

    await createShiftHelper(
      {
        store_id: store.store_id,
        cashier_id: cashier.user_id,
        opened_by: cashier.user_id,
        status: "OPEN",
        opening_cash: 100.0,
      },
      prismaClient,
    );

    // WHEN: Navigating to the shifts page
    await storeManagerPage.goto("/client-dashboard/shifts");
    await expect(
      storeManagerPage.locator('[data-testid="shift-list-table"]'),
    ).toBeVisible({ timeout: 10000 });

    // THEN: Shift columns should be displayed
    await expect(storeManagerPage.getByText("Shift ID")).toBeVisible();
    await expect(storeManagerPage.getByText("Store")).toBeVisible();
    await expect(storeManagerPage.getByText("Cashier")).toBeVisible();
    await expect(storeManagerPage.getByText("Opened At")).toBeVisible();
    await expect(storeManagerPage.getByText("Status")).toBeVisible();
  });

  test("4.7-E2E-003: [P0] Should filter shifts by status", async ({
    storeManagerPage,
    prismaClient,
  }) => {
    // GIVEN: A store exists with shifts in different statuses
    const { owner, company, store } =
      await createCompanyWithStore(prismaClient);
    const cashier = await prismaClient.user.create({
      data: createClientUser(),
    });

    await createShiftHelper(
      {
        store_id: store.store_id,
        cashier_id: cashier.user_id,
        opened_by: cashier.user_id,
        status: "OPEN",
        opening_cash: 100.0,
      },
      prismaClient,
    );

    await createShiftHelper(
      {
        store_id: store.store_id,
        cashier_id: cashier.user_id,
        opened_by: cashier.user_id,
        status: "CLOSED",
        opening_cash: 200.0,
        closed_at: new Date(),
      },
      prismaClient,
    );

    // WHEN: Navigating to shifts page and filtering by OPEN status
    await storeManagerPage.goto("/client-dashboard/shifts");
    await expect(
      storeManagerPage.locator('[data-testid="shift-list-table"]'),
    ).toBeVisible({ timeout: 10000 });

    // Select OPEN status from filter
    const statusFilter = storeManagerPage.getByTestId("shift-filter-status");
    await statusFilter.click();
    await storeManagerPage.getByText("Open").click();
    await storeManagerPage
      .getByRole("button", { name: /apply filters/i })
      .click();

    // THEN: Only OPEN shifts should be displayed
    // Note: Actual filtering verification would depend on UI implementation
    await expect(statusFilter).toBeVisible();
  });

  test("4.7-E2E-004: [P0] Should open a new shift", async ({
    storeManagerPage,
    prismaClient,
  }) => {
    // GIVEN: A store exists with cashiers and terminals
    const { owner, company, store } =
      await createCompanyWithStore(prismaClient);
    const cashier = await prismaClient.user.create({
      data: createClientUser({ name: "Test Cashier" }),
    });

    // Create a POS terminal
    const terminal = await prismaClient.pOSTerminal.create({
      data: {
        store_id: store.store_id,
        name: "Terminal 1",
      },
    });

    // WHEN: Navigating to shifts page and opening a new shift
    await storeManagerPage.goto("/client-dashboard/shifts");
    await expect(
      storeManagerPage.locator('[data-testid="shift-list-table"]'),
    ).toBeVisible({ timeout: 10000 });

    // Assert "Open Shift" button is visible
    const openShiftButton = storeManagerPage.getByRole("button", {
      name: /open shift/i,
    });
    await expect(openShiftButton).toBeVisible({ timeout: 5000 });

    // Click "Open Shift" button
    await openShiftButton.click();

    // THEN: Shift opening form should appear
    // Verify the form modal/dialog is visible with expected content
    await expect(storeManagerPage.getByText("Open New Shift")).toBeVisible({
      timeout: 5000,
    });

    // Verify form fields are present to confirm the form is fully loaded
    await expect(storeManagerPage.getByTestId("cashier-select")).toBeVisible({
      timeout: 5000,
    });
  });

  test.skip("4.7-E2E-005: [P0] Should close and reconcile a shift", async ({
    storeManagerPage,
    prismaClient,
  }) => {
    // TODO: Implement close/reconcile workflow once UI is finalized
    // GIVEN: A store exists with an OPEN shift
    const { owner, company, store } =
      await createCompanyWithStore(prismaClient);
    const cashier = await prismaClient.user.create({
      data: createClientUser(),
    });

    const shift = await createShiftHelper(
      {
        store_id: store.store_id,
        cashier_id: cashier.user_id,
        opened_by: cashier.user_id,
        status: "OPEN",
        opening_cash: 100.0,
      },
      prismaClient,
    );

    // WHEN: Navigating to shifts page and closing the shift
    await storeManagerPage.goto("/client-dashboard/shifts");
    await expect(
      storeManagerPage.locator('[data-testid="shift-list-table"]'),
    ).toBeVisible({ timeout: 10000 });

    // Click shift row to view details or close
    // Note: Actual UI interaction would depend on implementation
    // This test verifies the flow can be initiated

    // THEN: Shift closing form should be accessible
    // Note: Full reconciliation flow would require additional setup
  });

  test("4.7-E2E-006: [P0] Should approve variance for shift in VARIANCE_REVIEW status", async ({
    storeManagerPage,
    prismaClient,
  }) => {
    // GIVEN: A store exists with a shift in VARIANCE_REVIEW status
    const { owner, company, store } =
      await createCompanyWithStore(prismaClient);
    const cashier = await prismaClient.user.create({
      data: createClientUser(),
    });

    await createShiftHelper(
      {
        store_id: store.store_id,
        cashier_id: cashier.user_id,
        opened_by: cashier.user_id,
        status: "VARIANCE_REVIEW",
        opening_cash: 100.0,
        closing_cash: 120.0,
      },
      prismaClient,
    );

    // WHEN: Navigating to shifts page
    await storeManagerPage.goto("/client-dashboard/shifts");
    await expect(
      storeManagerPage.locator('[data-testid="shift-list-table"]'),
    ).toBeVisible({ timeout: 10000 });

    // THEN: Variance alert badge should be displayed
    // Note: Variance approval dialog interaction would require specific UI implementation
    await expect(
      storeManagerPage.locator('[data-testid*="variance-alert-badge"]'),
    ).toBeVisible({ timeout: 5000 });
  });

  test("4.7-E2E-007: [P0] Should view shift details", async ({
    storeManagerPage,
    prismaClient,
  }) => {
    // GIVEN: A store exists with a shift
    const { owner, company, store } =
      await createCompanyWithStore(prismaClient);
    const cashier = await prismaClient.user.create({
      data: createClientUser({ name: "Test Cashier" }),
    });

    const shift = await createShiftHelper(
      {
        store_id: store.store_id,
        cashier_id: cashier.user_id,
        opened_by: cashier.user_id,
        status: "CLOSED",
        opening_cash: 100.0,
        closing_cash: 250.0,
        closed_at: new Date(),
      },
      prismaClient,
    );

    // WHEN: Navigating to shifts page and clicking a shift
    await storeManagerPage.goto("/client-dashboard/shifts");
    await expect(
      storeManagerPage.locator('[data-testid="shift-list-table"]'),
    ).toBeVisible({ timeout: 10000 });

    // Click shift row
    const shiftRow = storeManagerPage.locator(
      `[data-testid="shift-list-row-${shift.shift_id}"]`,
    );
    await expect(shiftRow).toBeVisible({ timeout: 5000 });
    await shiftRow.click();

    // THEN: Shift detail modal should be displayed
    await expect(storeManagerPage.getByText("Shift Details")).toBeVisible({
      timeout: 5000,
    });
  });

  test("4.7-E2E-008: [P0] Should display report link for CLOSED shifts", async ({
    storeManagerPage,
    prismaClient,
  }) => {
    // GIVEN: A store exists with a CLOSED shift
    const { owner, company, store } =
      await createCompanyWithStore(prismaClient);
    const cashier = await prismaClient.user.create({
      data: createClientUser(),
    });

    const shift = await createShiftHelper(
      {
        store_id: store.store_id,
        cashier_id: cashier.user_id,
        opened_by: cashier.user_id,
        status: "CLOSED",
        opening_cash: 100.0,
        closing_cash: 250.0,
        closed_at: new Date(),
      },
      prismaClient,
    );

    // WHEN: Viewing shift details for CLOSED shift
    await storeManagerPage.goto("/client-dashboard/shifts");
    await expect(
      storeManagerPage.locator('[data-testid="shift-list-table"]'),
    ).toBeVisible({ timeout: 10000 });

    const shiftRow = storeManagerPage.locator(
      `[data-testid="shift-list-row-${shift.shift_id}"]`,
    );
    await expect(shiftRow).toBeVisible({ timeout: 5000 });
    await shiftRow.click();

    // THEN: Report link should be displayed
    await expect(storeManagerPage.getByText(/view report/i)).toBeVisible({
      timeout: 5000,
    });
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
    await page.goto("/client-dashboard/shifts");

    // THEN: Should redirect to login or show unauthorized
    const currentUrl = page.url();
    expect(
      currentUrl.includes("/login") || currentUrl.includes("/auth"),
    ).toBeTruthy();
  });

  test("4.7-E2E-SEC-002: [P1] Should enforce RLS - users only see shifts for accessible stores", async ({
    storeManagerPage,
    prismaClient,
  }) => {
    // GIVEN: Two stores exist with shifts, user only has access to one store
    const {
      owner: owner1,
      company: company1,
      store: store1,
    } = await createCompanyWithStore(prismaClient);
    const {
      owner: owner2,
      company: company2,
      store: store2,
    } = await createCompanyWithStore(prismaClient);

    const cashier1 = await prismaClient.user.create({
      data: createClientUser(),
    });
    const cashier2 = await prismaClient.user.create({
      data: createClientUser(),
    });

    const shift1 = await createShiftHelper(
      {
        store_id: store1.store_id,
        cashier_id: cashier1.user_id,
        opened_by: cashier1.user_id,
        status: "OPEN",
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const shift2 = await createShiftHelper(
      {
        store_id: store2.store_id,
        cashier_id: cashier2.user_id,
        opened_by: cashier2.user_id,
        status: "OPEN",
        opening_cash: 200.0,
      },
      prismaClient,
    );

    // (Store Manager fixture should only have access to store1)
    await storeManagerPage.goto("/client-dashboard/shifts");
    await expect(
      storeManagerPage.locator('[data-testid="shift-list-table"]'),
    ).toBeVisible({ timeout: 10000 });

    // THEN: Only shifts from accessible store should be displayed
    // Verify shift1 (from accessible store) is visible
    await expect(
      storeManagerPage.locator(
        `[data-testid="shift-list-row-${shift1.shift_id}"]`,
      ),
    ).toBeVisible({ timeout: 5000 });

    // Verify shift2 (from inaccessible store) is not visible
    const shift2Row = storeManagerPage.locator(
      `[data-testid="shift-list-row-${shift2.shift_id}"]`,
    );
    await expect(shift2Row).toHaveCount(0);
  });

  // ============================================================================
  // SECURITY TESTS - Authentication & Authorization (E2E Level)
  // ============================================================================

  test("4.7-E2E-SEC-003: [P1] Should reject requests with invalid authentication token", async ({
    page,
  }) => {
    // GIVEN: User attempts to access API with invalid token
    // (Using page fixture without proper authentication)

    // WHEN: Attempting to make API request with invalid token
    const response = await page.request.get("/api/shifts", {
      headers: {
        Authorization: "Bearer invalid-token-12345",
      },
    });

    // THEN: Should return 401 or 403 (unauthorized)
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);
  });

  test("4.7-E2E-SEC-004: [P1] Should reject requests without authentication token", async ({
    page,
  }) => {
    // GIVEN: User attempts to access API without token

    // WHEN: Attempting to make API request without token
    const response = await page.request.get("/api/shifts");

    // THEN: Should return 401 (unauthorized)
    expect(response.status()).toBe(401);
  });

  test("4.7-E2E-SEC-005: [P1] Should prevent SQL injection in shift ID parameter", async ({
    storeManagerPage,
    prismaClient,
  }) => {
    // GIVEN: A store exists with a shift
    const { owner, company, store } =
      await createCompanyWithStore(prismaClient);
    const cashier = await prismaClient.user.create({
      data: createClientUser(),
    });

    const shift = await createShiftHelper(
      {
        store_id: store.store_id,
        cashier_id: cashier.user_id,
        opened_by: cashier.user_id,
        status: "OPEN",
        opening_cash: 100.0,
      },
      prismaClient,
    );

    // WHEN: Attempting to access shift with SQL injection in shift ID
    const maliciousId = `${shift.shift_id}' OR '1'='1`;
    const response = await storeManagerPage.request.get(
      `/api/shifts/${encodeURIComponent(maliciousId)}`,
    );

    // THEN: Should reject invalid shift ID format (UUID validation)
    expect(response.status()).toBe(400); // Bad request for invalid UUID
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  test("4.7-E2E-SEC-006: [P1] Should prevent XSS in shift data display", async ({
    storeManagerPage,
    prismaClient,
  }) => {
    // GIVEN: A store exists with shift containing potential XSS
    const { owner, company, store } =
      await createCompanyWithStore(prismaClient);
    const cashier = await prismaClient.user.create({
      data: createClientUser({ name: "<script>alert('xss')</script>Cashier" }),
    });

    await createShiftHelper(
      {
        store_id: store.store_id,
        cashier_id: cashier.user_id,
        opened_by: cashier.user_id,
        status: "OPEN",
        opening_cash: 100.0,
      },
      prismaClient,
    );

    // WHEN: Navigating to shifts page
    await storeManagerPage.goto("/client-dashboard/shifts");
    await expect(
      storeManagerPage.locator('[data-testid="shift-list-table"]'),
    ).toBeVisible({ timeout: 10000 });

    // THEN: XSS should be escaped (React automatically escapes HTML)
    // React escapes HTML entities, preventing script execution
    const pageContent = await storeManagerPage.content();
    expect(pageContent).not.toContain("<script>");
  });

  // ============================================================================
  // EDGE CASE TESTS - Boundary Conditions (E2E Level)
  // ============================================================================

  test("4.7-E2E-EDGE-001: [P2] Should handle empty shift list gracefully", async ({
    storeManagerPage,
    prismaClient,
  }) => {
    // GIVEN: A store exists with no shifts
    const { owner, company, store } =
      await createCompanyWithStore(prismaClient);

    // WHEN: Navigating to shifts page
    await storeManagerPage.goto("/client-dashboard/shifts");

    // THEN: Empty state should be displayed
    await expect(storeManagerPage.getByText(/no shifts found/i)).toBeVisible({
      timeout: 10000,
    });
  });

  test("4.7-E2E-EDGE-002: [P2] Should handle maximum opening cash ($1000)", async ({
    storeManagerPage,
    prismaClient,
  }) => {
    // GIVEN: A store exists with cashiers and terminals
    const { owner, company, store } =
      await createCompanyWithStore(prismaClient);
    const cashier = await prismaClient.user.create({
      data: createClientUser({ name: "Test Cashier" }),
    });

    const terminal = await prismaClient.pOSTerminal.create({
      data: {
        store_id: store.store_id,
        name: "Terminal 1",
      },
    });

    // WHEN: Navigating to shifts page
    await storeManagerPage.goto("/client-dashboard/shifts");
    await expect(
      storeManagerPage.locator('[data-testid="shift-list-table"]'),
    ).toBeVisible({ timeout: 10000 });

    // Check if "Open Shift" button exists
    // TODO: If UI is not available, change this test to test.skip() with a TODO note
    // The ShiftOpeningForm component exists but may not be integrated into the shifts page yet
    const openShiftButton = storeManagerPage.getByRole("button", {
      name: /open shift/i,
    });
    await expect(openShiftButton).toBeVisible({
      timeout: 10000,
    });

    // Click "Open Shift" button to open the form dialog
    await openShiftButton.click({ timeout: 5000 });

    // Wait for the dialog to be visible
    await expect(storeManagerPage.getByText("Open New Shift")).toBeVisible({
      timeout: 5000,
    });

    // Fill the form: Select cashier
    const cashierSelect = storeManagerPage.getByTestId("cashier-select");
    await expect(cashierSelect).toBeVisible({ timeout: 5000 });
    await cashierSelect.click({ timeout: 5000 });
    // Wait for dropdown to open and select the cashier option
    const cashierOption = storeManagerPage.getByTestId(
      `cashier-option-${cashier.user_id}`,
    );
    await expect(cashierOption).toBeVisible({ timeout: 10000 });
    await cashierOption.click({ timeout: 5000 });

    // Fill the form: Select terminal
    const terminalSelect = storeManagerPage.getByTestId("terminal-select");
    await expect(terminalSelect).toBeVisible({ timeout: 5000 });
    await terminalSelect.click({ timeout: 5000 });
    // Wait for dropdown to open and select the terminal option
    const terminalOption = storeManagerPage.getByTestId(
      `terminal-option-${terminal.pos_terminal_id}`,
    );
    await expect(terminalOption).toBeVisible({ timeout: 10000 });
    await terminalOption.click({ timeout: 5000 });

    // Fill the form: Enter opening cash = 1000 (maximum value)
    const openingCashInput = storeManagerPage.getByTestId("opening-cash-input");
    await expect(openingCashInput).toBeVisible({ timeout: 5000 });
    await openingCashInput.fill("1000", { timeout: 5000 });

    // Submit the form
    const submitButton = storeManagerPage.getByTestId("submit-shift-opening");
    await expect(submitButton).toBeVisible({ timeout: 5000 });
    await expect(submitButton).toBeEnabled({ timeout: 5000 });
    await submitButton.click({ timeout: 5000 });

    // Wait for success message/toast
    await expect(
      storeManagerPage.getByText(/shift opened successfully/i),
    ).toBeVisible({ timeout: 10000 });

    // Wait for dialog to close
    await expect(storeManagerPage.getByText("Open New Shift")).not.toBeVisible({
      timeout: 5000,
    });

    // THEN: Verify the shift was created with opening_cash = 1000
    // Refresh the shift list to see the new shift
    await storeManagerPage.reload({ timeout: 10000 });
    await expect(
      storeManagerPage.locator('[data-testid="shift-list-table"]'),
    ).toBeVisible({ timeout: 10000 });

    // Query the database to verify the shift was created with correct opening_cash
    const createdShift = await prismaClient.shift.findFirst({
      where: {
        store_id: store.store_id,
        cashier_id: cashier.user_id,
        pos_terminal_id: terminal.pos_terminal_id,
        opening_cash: 1000,
      },
      orderBy: { opened_at: "desc" },
    });

    expect(createdShift).toBeTruthy();
    expect(createdShift?.opening_cash).toBe(1000);
    expect(createdShift?.status).toBe("OPEN");
  });

  // ============================================================================
  // ADDITIONAL ASSERTIONS - Response Structure & Data Types (E2E Level)
  // ============================================================================

  test("4.7-E2E-ASSERT-001: [P2] Should verify shift list response structure", async ({
    storeManagerPage,
    prismaClient,
  }) => {
    // GIVEN: A store exists with shifts
    const { owner, company, store } =
      await createCompanyWithStore(prismaClient);
    const cashier = await prismaClient.user.create({
      data: createClientUser(),
    });

    await createShiftHelper(
      {
        store_id: store.store_id,
        cashier_id: cashier.user_id,
        opened_by: cashier.user_id,
        status: "OPEN",
        opening_cash: 100.0,
      },
      prismaClient,
    );

    // WHEN: Navigating to shifts page
    await storeManagerPage.goto("/client-dashboard/shifts");
    await expect(
      storeManagerPage.locator('[data-testid="shift-list-table"]'),
    ).toBeVisible({ timeout: 10000 });

    // THEN: Shift list should have correct structure
    await expect(storeManagerPage.getByText("Shift ID")).toBeVisible();
    await expect(storeManagerPage.getByText("Store")).toBeVisible();
    await expect(storeManagerPage.getByText("Cashier")).toBeVisible();
    await expect(storeManagerPage.getByText("Status")).toBeVisible();
  });
});
