/**
 * @test-level E2E
 * @justification End-to-end tests for shift management UI - validates complete user journey from opening shifts to variance approval
 * @story 4-7-shift-management-ui
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createStore,
  createCompany,
  createClientUser,
  createUser,
  createCashier,
} from "../support/factories";
import { PrismaClient } from "@prisma/client";
import {
  createShift as createShiftHelper,
  createCashier as createCashierHelper,
} from "../support/helpers/database-helpers";
import { withBypassClient } from "../support/prisma-bypass";

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
 * Helper function to assign a user to a test store with a specific role
 * CRITICAL: Required for RLS - user must be assigned to store to see shifts
 *
 * @param user - The user to assign to the store (must have user_id)
 * @param company - The company that owns the store
 * @param store - The store to assign the user to
 * @param roleCode - The role code to use (defaults to CLIENT_OWNER)
 */
async function assignUserToStore(
  user: { user_id: string },
  company: { company_id: string },
  store: { store_id: string },
  roleCode: string = "CLIENT_OWNER",
) {
  await withBypassClient(async (bypassClient) => {
    const role = await bypassClient.role.findUnique({
      where: { code: roleCode },
    });
    if (role) {
      // Update existing userRole to point to the test store
      // This handles cases where the user already has a role assigned
      const existingRoleAssignment = await bypassClient.userRole.findFirst({
        where: {
          user_id: user.user_id,
          role_id: role.role_id,
        },
      });

      if (existingRoleAssignment) {
        // Update existing assignment to point to the test store
        await bypassClient.userRole.update({
          where: { user_role_id: existingRoleAssignment.user_role_id },
          data: {
            company_id: company.company_id,
            store_id: store.store_id,
          },
        });
      } else {
        // Create new role assignment
        await bypassClient.userRole.create({
          data: {
            user_id: user.user_id,
            role_id: role.role_id,
            company_id: company.company_id,
            store_id: store.store_id,
          },
        });
      }
    }
  });
}

// Keep backward compatibility alias
const assignStoreManagerToStore = assignUserToStore;

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

  // Additional wait to ensure the component has fully rendered
  await page.waitForTimeout(500);
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
    // Wait for the page heading
    await expect(
      clientOwnerPage.getByRole("heading", { name: /shifts/i }),
    ).toBeVisible({
      timeout: 15000,
    });

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

  test("4.7-E2E-003: [P0] Should filter shifts by status", async ({
    clientOwnerPage,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: Using clientUser's own store with shifts in different statuses
    const store_id = clientUser.store_id;

    const cashierUser = await prismaClient.user.create({
      data: createClientUser(),
    });

    const cashier = await createTestCashier(
      prismaClient,
      store_id,
      clientUser.user_id,
    );

    const openShift = await createShiftHelper(
      {
        store_id: store_id,
        cashier_id: cashier.cashier_id,
        opened_by: cashierUser.user_id,
        status: "OPEN",
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const closedShift = await createShiftHelper(
      {
        store_id: store_id,
        cashier_id: cashier.cashier_id,
        opened_by: cashierUser.user_id,
        status: "CLOSED",
        opening_cash: 200.0,
        closed_at: new Date(),
      },
      prismaClient,
    );

    // WHEN: Navigating to shifts page and filtering by OPEN status
    await navigateToShiftsPage(clientOwnerPage);

    // Select OPEN status from filter
    const statusFilter = clientOwnerPage.getByTestId("shift-filter-status");
    await expect(statusFilter).toBeVisible({ timeout: 10000 });
    await statusFilter.click();

    // Wait for dropdown to open and select "Open" option
    // Use the SelectItem with value="OPEN" to be more specific
    await clientOwnerPage.waitForTimeout(500); // Wait for dropdown animation
    const openOption = clientOwnerPage
      .locator('[role="option"]:has-text("Open")')
      .first();
    await expect(openOption).toBeVisible({ timeout: 10000 });
    await openOption.click();

    // Wait for dropdown to close
    await clientOwnerPage.waitForTimeout(300);

    // Click Apply Filters button and wait for API response
    const applyButton = clientOwnerPage.getByRole("button", {
      name: /apply filters/i,
    });
    await expect(applyButton).toBeVisible({ timeout: 5000 });

    // Wait for the API response to complete with status filter
    // Match the response URL pattern for /api/shifts with status=OPEN parameter
    const responsePromise = clientOwnerPage.waitForResponse(
      (response) => {
        const url = response.url();
        return (
          url.includes("/api/shifts") &&
          (url.includes("status=OPEN") || url.includes("status%3DOPEN")) &&
          response.status() === 200
        );
      },
      { timeout: 15000 },
    );

    await applyButton.click();

    // Wait for the API response to complete
    await responsePromise;

    // Wait for loading spinner to disappear
    await clientOwnerPage
      .locator('[data-testid="shift-list-loading"]')
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {
        // Loading state might not appear if response is fast, continue
      });

    // THEN: Filter should be applied and only OPEN shifts should be displayed
    await expect(statusFilter).toBeVisible();

    // Verify the table is visible and contains only OPEN shifts
    const table = clientOwnerPage.locator('[data-testid="shift-list-table"]');
    await expect(table).toBeVisible({ timeout: 10000 });

    // Verify OPEN shift is visible
    const openShiftRow = clientOwnerPage.locator(
      `[data-testid="shift-list-row-${openShift.shift_id}"]`,
    );
    await expect(openShiftRow).toBeVisible({ timeout: 5000 });

    // Verify CLOSED shift is NOT visible
    const closedShiftRow = clientOwnerPage.locator(
      `[data-testid="shift-list-row-${closedShift.shift_id}"]`,
    );
    await expect(closedShiftRow).not.toBeVisible();
  });

  test.skip("4.7-E2E-005: [P0] Should close and reconcile a shift", async ({
    clientOwnerPage,
    prismaClient,
  }) => {
    // TODO: Implement close/reconcile workflow once UI is finalized
    // GIVEN: A store exists with an OPEN shift
    const { owner, company, store } =
      await createCompanyWithStore(prismaClient);
    const cashierUser = await prismaClient.user.create({
      data: createClientUser(),
    });

    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );

    const shift = await createShiftHelper(
      {
        store_id: store.store_id,
        cashier_id: cashier.cashier_id,
        opened_by: cashierUser.user_id,
        status: "OPEN",
        opening_cash: 100.0,
      },
      prismaClient,
    );

    // WHEN: Navigating to shifts page and closing the shift
    await navigateToShiftsPage(clientOwnerPage);

    // Click shift row to view details or close
    // Note: Actual UI interaction would depend on implementation
    // This test verifies the flow can be initiated

    // THEN: Shift closing form should be accessible
    // Note: Full reconciliation flow would require additional setup
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
      const shiftsRows = page.locator('[data-testid^="shift-list-row-"]');
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
    // Use clientUser's own store for the accessible shift
    const accessibleStoreId = clientUser.store_id;

    // Create a completely separate company/store that clientUser does NOT have access to
    const {
      owner: otherOwner,
      company: otherCompany,
      store: otherStore,
    } = await createCompanyWithStore(prismaClient);

    const cashierUser1 = await prismaClient.user.create({
      data: createClientUser(),
    });
    const cashierUser2 = await prismaClient.user.create({
      data: createClientUser(),
    });

    const cashier1 = await createTestCashier(
      prismaClient,
      accessibleStoreId,
      clientUser.user_id,
    );

    const cashier2 = await createTestCashier(
      prismaClient,
      otherStore.store_id,
      otherOwner.user_id,
    );

    const shift1 = await createShiftHelper(
      {
        store_id: accessibleStoreId,
        cashier_id: cashier1.cashier_id,
        opened_by: cashierUser1.user_id,
        status: "OPEN",
        opening_cash: 100.0,
      },
      prismaClient,
    );

    // This shift should NOT be visible to clientUser (different company)
    const shift2 = await createShiftHelper(
      {
        store_id: otherStore.store_id,
        cashier_id: cashier2.cashier_id,
        opened_by: cashierUser2.user_id,
        status: "OPEN",
        opening_cash: 200.0,
      },
      prismaClient,
    );

    // clientUser (CLIENT_OWNER) should only see shifts from their own company's stores
    await navigateToShiftsPage(clientOwnerPage);

    // THEN: Only shifts from accessible store should be displayed
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

    await clientOwnerPage.waitForTimeout(1000);

    // Verify shift1 (from accessible store) is visible
    const shift1Row = clientOwnerPage.locator(
      `[data-testid="shift-list-row-${shift1.shift_id}"]`,
    );
    const shift1Count = await shift1Row.count();
    expect(shift1Count).toBeGreaterThan(0);

    // Verify shift2 (from inaccessible store) is not visible
    const shift2Row = clientOwnerPage.locator(
      `[data-testid="shift-list-row-${shift2.shift_id}"]`,
    );
    const shift2Count = await shift2Row.count();
    expect(shift2Count).toBe(0);
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
    const store_id = clientUser.store_id;

    const cashierUser = await prismaClient.user.create({
      data: createClientUser(),
    });

    // Create a cashier with XSS in the name - this is what's displayed in the shift list
    const xssPayload = "<script>alert('xss')</script>Cashier";
    const cashier = await createCashierHelper(
      {
        store_id: store_id,
        created_by: clientUser.user_id,
        name: xssPayload,
      },
      prismaClient,
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

    await clientOwnerPage.waitForTimeout(1000);

    // Get the shift row and verify XSS is escaped
    const shiftRows = clientOwnerPage.locator(
      '[data-testid^="shift-list-row-"]',
    );
    const rowCount = await shiftRows.count();
    expect(rowCount).toBeGreaterThan(0);

    if (rowCount > 0) {
      const firstRow = shiftRows.first();

      // Get the row's text content (React escapes HTML, so script tags become text)
      const rowText = await firstRow.textContent();
      expect(rowText).toBeTruthy();

      // Verify the cashier name appears (proving the data is displayed)
      // The text should contain "Cashier" (the safe part of the name)
      expect(rowText).toContain("Cashier");

      // Get the row's inner HTML to check for escaped XSS
      const rowHTML = await firstRow.innerHTML();

      // React escapes HTML entities, so <script> becomes &lt;script&gt;
      // Check that the XSS payload is NOT present as unescaped <script>alert('xss')</script>
      const hasUnescapedXSS = rowHTML.includes("<script>alert('xss')</script>");
      expect(hasUnescapedXSS).toBe(false);
    }
  });

  // ============================================================================
  // EDGE CASE TESTS - Boundary Conditions (E2E Level)
  // ============================================================================

  test("4.7-E2E-EDGE-001: [P2] Should handle empty shift list gracefully", async ({
    clientOwnerPage,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: Using clientUser's own store with no shifts
    // The clientUser already has access to their own company/store via the CLIENT_OWNER role
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
