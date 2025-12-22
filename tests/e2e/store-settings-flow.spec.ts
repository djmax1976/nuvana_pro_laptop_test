/**
 * @test-level E2E
 * @justification Tests critical multi-page user journey requiring full system integration
 * @story 6-14-store-settings-page
 * @enhanced-by workflow-9 on 2025-01-28
 */
/**
 * E2E Tests: Store Settings Flow
 *
 * Tests critical end-to-end user journey:
 * - Client Owner navigates to settings -> views store info -> manages employee credentials
 *
 * @test-level E2E
 * @justification Tests critical multi-page user journey requiring full system integration
 * @story 6-14 - Store Settings Page with Employee/Cashier Management
 * @priority P0 (Critical - Core User Journey)
 *
 * E2E tests are LAST in pyramid order (5-10% MAX - sparingly!)
 *
 * ENHANCEMENTS APPLIED (Workflow 9):
 * - Test isolation: Proper setup/teardown
 * - Resilient selectors: data-testid attributes
 * - Web-first assertions: Auto-waiting assertions
 * - Network-first pattern: Already implemented
 * - Clear descriptions: Meaningful test names
 */

import { test, expect, Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import { createCashier } from "../support/helpers/database-helpers";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";

/**
 * Helper function to perform login and wait for redirect to client-dashboard.
 * Uses simplified pattern that waits for navigation after form submission.
 */
async function loginAsClientOwner(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  // Navigate to login page and wait for full load
  await page.goto("/login", { waitUntil: "networkidle" });

  // Wait for login form to be visible and ready for input
  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');

  await emailInput.waitFor({ state: "visible", timeout: 15000 });

  // Wait for input to be editable (ensures React hydration is complete)
  await expect(emailInput).toBeEditable({ timeout: 10000 });

  // Fill credentials
  await emailInput.fill(email);
  await passwordInput.fill(password);

  // Verify credentials were filled before submitting
  await expect(emailInput).toHaveValue(email, { timeout: 5000 });
  await expect(passwordInput).toHaveValue(password, { timeout: 5000 });

  // Click submit and wait for navigation to /client-dashboard
  await Promise.all([
    page.waitForURL(/.*client-dashboard.*/, { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);

  // Wait for page to be fully loaded
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {
    // networkidle might timeout if there are long-polling requests, that's OK
  });
}

test.describe.serial("Store Settings Flow (Critical Journey)", () => {
  let prisma: PrismaClient;
  let clientOwnerEmail: string;
  let clientOwnerPassword: string;
  let storeId: string;
  let testCompanyId: string;
  let employeeUserId: string;
  let cashierId: string;
  let testOwnerId: string;

  test.beforeAll(async () => {
    prisma = new PrismaClient();
    // Setup test data
    // GIVEN: A client owner with a store for testing
    const hashedPassword = await bcrypt.hash("TestPassword123!", 10);
    const userId = uuidv4();
    const companyId = uuidv4();
    const storeIdGen = uuidv4();

    const testOwner = await prisma.user.create({
      data: {
        user_id: userId,
        email: `e2e-settings-owner-${Date.now()}@test.com`,
        name: "Test Client Owner",
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        password_hash: hashedPassword,
        status: "ACTIVE",
        is_client_user: true,
      },
    });
    clientOwnerEmail = testOwner.email;
    clientOwnerPassword = "TestPassword123!";
    testOwnerId = testOwner.user_id;

    const testCompany = await prisma.company.create({
      data: {
        company_id: companyId,
        name: `Test Company ${Date.now()}`,
        owner_user_id: testOwner.user_id,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
        status: "ACTIVE",
      },
    });
    testCompanyId = testCompany.company_id;

    const testStore = await prisma.store.create({
      data: {
        store_id: storeIdGen,
        company_id: testCompany.company_id,
        name: `Test Store ${Date.now()}`,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
        timezone: "America/New_York",
        status: "ACTIVE",
        configuration: {
          contact_email: "store@test.com",
          timezone: "America/New_York",
        },
      },
    });
    storeId = testStore.store_id;

    // CRITICAL: Assign CLIENT_OWNER role to the user for the company
    // CLIENT_OWNER is required to access /client-dashboard
    const clientOwnerRole = await prisma.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });
    if (!clientOwnerRole) {
      throw new Error("CLIENT_OWNER role not found - run RBAC seed first");
    }
    await prisma.userRole.create({
      data: {
        user_id: testOwner.user_id,
        role_id: clientOwnerRole.role_id,
        company_id: testCompany.company_id,
      },
    });

    // Get a STORE scope role for employee assignment
    const storeRole = await prisma.role.findFirst({
      where: { scope: "STORE" },
    });

    if (!storeRole) {
      throw new Error("No STORE scope role found - run RBAC seed first");
    }

    // Create an employee for testing email change functionality
    const employeePassword = await bcrypt.hash("EmployeePassword123!", 10);
    const employeeUser = await prisma.user.create({
      data: {
        email: `e2e-employee-${Date.now()}@test.com`,
        name: "Test Employee",
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        password_hash: employeePassword,
        status: "ACTIVE",
        is_client_user: true,
      },
    });
    employeeUserId = employeeUser.user_id;

    // Assign STORE scope role to employee
    await prisma.userRole.create({
      data: {
        user_id: employeeUser.user_id,
        role_id: storeRole.role_id,
        store_id: testStore.store_id,
        company_id: testCompany.company_id,
        assigned_by: testOwner.user_id,
      },
    });

    // Create a cashier for testing cashier tab
    const cashier = await createCashier(
      {
        store_id: testStore.store_id,
        created_by: testOwner.user_id,
        name: "Test Cashier",
        pin: "1234",
      },
      prisma,
    );
    cashierId = cashier.cashier_id;
  });

  test.afterAll(async () => {
    // Cleanup test data in reverse order of dependencies
    // Use try-catch for each deletion to ensure cleanup continues even if one fails
    try {
      // Delete cashier first
      if (cashierId) {
        await prisma.cashier
          .delete({ where: { cashier_id: cashierId } })
          .catch(() => {});
      }

      // Delete employee user roles and user
      if (employeeUserId) {
        await prisma.userRole
          .deleteMany({ where: { user_id: employeeUserId } })
          .catch(() => {});
        await prisma.user
          .delete({ where: { user_id: employeeUserId } })
          .catch(() => {});
      }

      // Delete store
      if (storeId) {
        await prisma.store
          .delete({ where: { store_id: storeId } })
          .catch(() => {});
      }

      // Delete company
      if (testCompanyId) {
        await prisma.company
          .delete({ where: { company_id: testCompanyId } })
          .catch(() => {});
      }

      // Delete client owner user roles and user
      if (testOwnerId) {
        await prisma.userRole
          .deleteMany({ where: { user_id: testOwnerId } })
          .catch(() => {});
        await prisma.auditLog
          .deleteMany({ where: { user_id: testOwnerId } })
          .catch(() => {});
        await prisma.user
          .delete({ where: { user_id: testOwnerId } })
          .catch(() => {});
      }
    } finally {
      // Always disconnect Prisma client
      await prisma.$disconnect();
    }
  });

  test("6.14-E2E-001: Client Owner can navigate to settings and view store info", async ({
    page,
  }) => {
    // GIVEN: Client Owner is logged in
    await loginAsClientOwner(page, clientOwnerEmail, clientOwnerPassword);

    // WHEN: User clicks "Settings" in sidebar navigation
    // Note: ClientSidebar uses generateTestId("Settings") which converts to "settings"
    const settingsLink = page.locator(
      '[data-testid="client-nav-link-settings"]',
    );
    await expect(settingsLink).toBeVisible({ timeout: 10000 });

    // Use Promise.all to ensure we wait for navigation after click
    await Promise.all([
      page.waitForURL(/.*\/client-dashboard\/settings.*/, { timeout: 15000 }),
      settingsLink.click(),
    ]);

    // THEN: User is navigated to /client-dashboard/settings
    await expect(page).toHaveURL(/.*\/client-dashboard\/settings.*/, {
      timeout: 5000,
    });

    // AND: Settings page is displayed
    await expect(page.locator('[data-testid="settings-page"]')).toBeVisible();

    // NOTE: StoreTabs component only renders when stores.length > 1 (per page.tsx:119)
    // For a single store, no store tabs are shown - the store is auto-selected
    // This is correct behavior - we verify the internal tabs instead

    // AND: Store Info tab button is visible and selected by default
    // Note: There are two elements with store-info-tab testid - the TabsTrigger button and the content div
    // We specifically check for the button using role="tab"
    await expect(
      page.locator('button[data-testid="store-info-tab"]'),
    ).toBeVisible({
      timeout: 10000,
    });

    // AND: Store configuration is displayed within StoreInfoTab component
    await expect(page.locator('[data-testid="store-name"]')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator('[data-testid="timezone-select"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="contact-email-input"]'),
    ).toBeVisible();
  });

  test("6.14-E2E-002: Client Owner can change employee email end-to-end", async ({
    page,
  }) => {
    // GIVEN: Client Owner is logged in and on settings page
    await loginAsClientOwner(page, clientOwnerEmail, clientOwnerPassword);
    await page.goto("/client-dashboard/settings", {
      waitUntil: "domcontentloaded",
    });

    // Wait for settings page to load
    await expect(page.locator('[data-testid="settings-page"]')).toBeVisible();

    // WHEN: User selects Employees tab
    const employeesTab = page.locator('[data-testid="employees-tab"]');
    await expect(employeesTab).toBeVisible({ timeout: 5000 });
    await employeesTab.click();

    // Wait for employee table to load
    await expect(page.locator('[data-testid="employee-table"]')).toBeVisible({
      timeout: 10000,
    });

    // Verify at least one employee exists
    const changeEmailButtons = page.locator(
      '[data-testid^="change-email-button-"]',
    );
    await expect(changeEmailButtons.first()).toBeVisible({ timeout: 5000 });

    // AND: User clicks "Change Email" for the first employee
    // Wait for button to be clickable before clicking
    const changeEmailButton = page.locator(
      '[data-testid="change-email-button-0"]',
    );
    await expect(changeEmailButton).toBeVisible({ timeout: 5000 });
    await changeEmailButton.click();

    // Wait for modal to open and email input to be visible
    await expect(page.locator('[data-testid="email-input"]')).toBeVisible({
      timeout: 5000,
    });

    // AND: User enters new email and saves
    const newEmail = `newemail-${Date.now()}@test.nuvana.local`;
    const emailInput = page.locator('[data-testid="email-input"]');

    // Clear existing email and enter new one
    await emailInput.clear();
    await emailInput.fill(newEmail);

    // Verify the input has the new value
    await expect(emailInput).toHaveValue(newEmail);

    // Set up network interception to wait for API call BEFORE clicking save
    const updateEmailResponsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/client/employees/") &&
        resp.url().includes("/email") &&
        resp.request().method() === "PUT" &&
        resp.status() === 200,
      { timeout: 15000 },
    );

    // Click save button
    const saveButton = page.locator('[data-testid="save-button"]');
    await expect(saveButton).toBeEnabled({ timeout: 3000 });
    await saveButton.click();

    // Wait for API response
    await updateEmailResponsePromise;

    // THEN: Success notification is displayed
    // Toast message: "Email updated" (title) with description "Employee email has been updated successfully."
    // Use .first() to handle case where toast content appears in multiple elements
    // Wait for toast to appear - it may take a moment to render in the portal
    await expect(
      page.getByText("Email updated", { exact: true }).first(),
    ).toBeVisible({
      timeout: 10000,
    });

    // Wait for modal to close (modal closes after successful save)
    // The modal closes after successful mutation, verify the email input is no longer visible
    await expect(page.locator('[data-testid="email-input"]')).not.toBeVisible({
      timeout: 5000,
    });

    // AND: Employee email is updated in the table
    // Wait for query invalidation and table refresh after mutation
    // The mutation invalidates the employee list query, so we wait for the table to update
    // Use a more specific wait to ensure the table has refreshed with the new data
    await expect(page.locator('[data-testid="employee-email-0"]')).toHaveText(
      newEmail,
      { timeout: 15000 },
    );

    // Verify the table still shows the employee (ensures the update didn't break the list)
    await expect(page.locator('[data-testid="employee-table"]')).toBeVisible();
  });

  // ============================================================================
  // SECURITY TESTS (Mandatory - Applied Automatically)
  // ============================================================================

  test.describe("Security: Authentication Bypass", () => {
    test("6.14-E2E-003: should redirect unauthenticated users to login", async ({
      page,
    }) => {
      // GIVEN: User is not logged in
      // WHEN: Attempting to access settings page directly
      await page.goto("/client-dashboard/settings", {
        waitUntil: "domcontentloaded",
      });

      // THEN: User is redirected to login page
      await expect(page).toHaveURL(/.*\/login.*/);
    });
  });

  // ============================================================================
  // ADDITIONAL ASSERTIONS (Best Practices - Applied Automatically)
  // ============================================================================

  test.describe("Response Structure Assertions", () => {
    test("6.14-E2E-004: should display store name as read-only field", async ({
      page,
    }) => {
      // GIVEN: Client Owner is logged in
      await loginAsClientOwner(page, clientOwnerEmail, clientOwnerPassword);

      // WHEN: Navigating to settings page
      await page.goto("/client-dashboard/settings", {
        waitUntil: "domcontentloaded",
      });

      // Wait for settings page to load
      await expect(page.locator('[data-testid="settings-page"]')).toBeVisible();

      // THEN: Store name field is visible and read-only
      const storeNameField = page.locator('[data-testid="store-name"]');
      await expect(storeNameField).toBeVisible({ timeout: 5000 });
      // Verify it's read-only (disabled attribute is set in the implementation)
      const isDisabled = await storeNameField.isDisabled();
      expect(isDisabled).toBe(true);
    });
  });

  test.describe("AC-4: Employees Tab Display", () => {
    test("6.14-E2E-005: [P1-AC-4] should display employee table with columns (Name, Email, Role, Status)", async ({
      page,
    }) => {
      // GIVEN: Client Owner is logged in and on settings page
      await loginAsClientOwner(page, clientOwnerEmail, clientOwnerPassword);
      await page.goto("/client-dashboard/settings", {
        waitUntil: "domcontentloaded",
      });

      // Wait for settings page to load
      await expect(page.locator('[data-testid="settings-page"]')).toBeVisible();

      // WHEN: User selects Employees tab
      const employeesTab = page.locator('[data-testid="employees-tab"]');
      await expect(employeesTab).toBeVisible({ timeout: 5000 });
      await employeesTab.click();

      // THEN: Employee table is displayed with correct columns
      const employeeTable = page.locator('[data-testid="employee-table"]');
      await expect(employeeTable).toBeVisible({ timeout: 10000 });

      // Verify column headers exist within the table header
      const tableHeader = employeeTable.locator("thead");
      await expect(tableHeader.locator("text=Name")).toBeVisible();
      await expect(tableHeader.locator("text=Email")).toBeVisible();
      await expect(tableHeader.locator("text=Role")).toBeVisible();
      await expect(tableHeader.locator("text=Status")).toBeVisible();
    });

    test("6.14-E2E-006: [P1-AC-4] should display Change Email and Reset Password buttons for each employee", async ({
      page,
    }) => {
      // GIVEN: Client Owner is logged in and on Employees tab
      await loginAsClientOwner(page, clientOwnerEmail, clientOwnerPassword);
      await page.goto("/client-dashboard/settings", {
        waitUntil: "domcontentloaded",
      });

      // Wait for settings page to load
      await expect(page.locator('[data-testid="settings-page"]')).toBeVisible();

      const employeesTab = page.locator('[data-testid="employees-tab"]');
      await expect(employeesTab).toBeVisible({ timeout: 5000 });
      await employeesTab.click();
      await expect(page.locator('[data-testid="employee-table"]')).toBeVisible({
        timeout: 10000,
      });

      // WHEN: Employee data loads
      // THEN: Each row has "Change Email" and "Reset Password" action buttons
      // Use data-testid selectors for more reliable testing
      const changeEmailButtons = page.locator(
        '[data-testid^="change-email-button-"]',
      );
      const resetPasswordButtons = page.locator(
        '[data-testid^="reset-password-button-"]',
      );

      // Wait for buttons to appear
      await expect(changeEmailButtons.first()).toBeVisible({ timeout: 5000 });

      const changeEmailCount = await changeEmailButtons.count();
      const resetPasswordCount = await resetPasswordButtons.count();

      // Verify buttons exist (at least one if employees exist)
      expect(changeEmailCount).toBeGreaterThan(0);
      expect(resetPasswordCount).toBeGreaterThan(0);
      expect(changeEmailCount).toBe(resetPasswordCount); // Same count as employees
    });
  });

  test.describe("AC-7: Cashiers Tab Display", () => {
    test("6.14-E2E-007: [P1-AC-7] should display cashier table with columns (Employee ID, Name, Hired On, Status)", async ({
      page,
    }) => {
      // GIVEN: Client Owner is logged in and on settings page
      await loginAsClientOwner(page, clientOwnerEmail, clientOwnerPassword);
      await page.goto("/client-dashboard/settings", {
        waitUntil: "domcontentloaded",
      });

      // Wait for settings page to load
      await expect(page.locator('[data-testid="settings-page"]')).toBeVisible();

      // WHEN: User selects Cashiers tab
      const cashiersTab = page.locator('[data-testid="cashiers-tab"]');
      await expect(cashiersTab).toBeVisible({ timeout: 5000 });
      await cashiersTab.click();

      // THEN: Cashier table is displayed with correct columns
      await expect(page.locator('[data-testid="cashier-table"]')).toBeVisible({
        timeout: 10000,
      });
      await expect(page.locator("text=Employee ID")).toBeVisible();
      await expect(page.locator("text=Name")).toBeVisible();
      await expect(page.locator("text=Hired On")).toBeVisible();
      await expect(page.locator("text=Status")).toBeVisible();
    });

    test("6.14-E2E-008: [P1-AC-7] should display Reset PIN button for each cashier row", async ({
      page,
    }) => {
      // GIVEN: Client Owner is logged in and on Cashiers tab
      await loginAsClientOwner(page, clientOwnerEmail, clientOwnerPassword);
      await page.goto("/client-dashboard/settings", {
        waitUntil: "domcontentloaded",
      });

      // Wait for settings page to load
      await expect(page.locator('[data-testid="settings-page"]')).toBeVisible();

      const cashiersTab = page.locator('[data-testid="cashiers-tab"]');
      await expect(cashiersTab).toBeVisible({ timeout: 5000 });
      await cashiersTab.click();
      await expect(page.locator('[data-testid="cashier-table"]')).toBeVisible({
        timeout: 10000,
      });

      // WHEN: Cashier data loads
      // THEN: Each row has a "Reset PIN" action button
      // Use data-testid selector for more reliable testing
      const resetPINButtons = page.locator(
        '[data-testid^="reset-pin-button-"]',
      );

      // Wait for at least one button to appear
      await expect(resetPINButtons.first()).toBeVisible({ timeout: 5000 });

      const resetPINCount = await resetPINButtons.count();

      // Verify buttons exist (at least one if cashiers exist)
      expect(resetPINCount).toBeGreaterThan(0);
    });
  });
});
