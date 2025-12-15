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
 * - Client Owner navigates to settings → views store info → manages employee credentials
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
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { createCashier } from "../support/helpers/database-helpers";

/**
 * Helper function to perform login and wait for redirect.
 * Uses network-first pattern for reliability.
 */
async function loginAsClientOwner(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  // Network-first pattern: Intercept API calls BEFORE navigation
  const loginResponsePromise = page.waitForResponse(
    (resp) =>
      (resp.url().includes("/api/auth/login") ||
        resp.url().includes("/api/client/auth/login")) &&
      resp.status() === 200,
    { timeout: 30000 },
  );

  // Navigate to login page
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  // Wait for login form
  await page.waitForSelector('input[type="email"]', {
    state: "visible",
    timeout: 15000,
  });

  // Fill credentials
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);

  // Set up navigation promise BEFORE clicking submit
  const navigationPromise = page.waitForURL(/.*client-dashboard.*/, {
    timeout: 30000,
    waitUntil: "domcontentloaded",
  });

  // Click submit
  await page.click('button[type="submit"]');

  // Wait for login response
  await loginResponsePromise;

  // Wait for navigation
  await navigationPromise;
}

test.describe("Store Settings Flow (Critical Journey)", () => {
  let prisma: PrismaClient;
  let clientOwnerEmail: string;
  let clientOwnerPassword: string;
  let storeId: string;
  let companyId: string;
  let employeeUserId: string;
  let cashierId: string;
  let storeRoleId: string;

  test.beforeAll(async () => {
    prisma = new PrismaClient();
    // Setup test data
    // GIVEN: A client owner with a store for testing
    const hashedPassword = await bcrypt.hash("TestPassword123!", 10);

    const testOwner = await prisma.user.create({
      data: {
        email: `clientowner-${Date.now()}@test.com`,
        name: "Test Client Owner",
        public_id: `USR${Date.now()}`,
        password_hash: hashedPassword,
        status: "ACTIVE",
        is_client_user: true,
      },
    });
    clientOwnerEmail = testOwner.email;
    clientOwnerPassword = "TestPassword123!";

    const testCompany = await prisma.company.create({
      data: {
        name: `Test Company ${Date.now()}`,
        owner_user_id: testOwner.user_id,
        public_id: `COM${Date.now()}`,
      },
    });
    companyId = testCompany.company_id;

    const testStore = await prisma.store.create({
      data: {
        company_id: testCompany.company_id,
        name: `Test Store ${Date.now()}`,
        public_id: `STR${Date.now()}`,
        configuration: {
          contact_email: "store@test.com",
          timezone: "America/New_York",
        },
      },
    });
    storeId = testStore.store_id;

    // Get a STORE scope role for employee assignment
    const storeRole = await prisma.role.findFirst({
      where: { scope: "STORE" },
    });

    if (!storeRole) {
      throw new Error("No STORE scope role found - run RBAC seed first");
    }
    storeRoleId = storeRole.role_id;

    // Create an employee for testing email change functionality
    const employeePassword = await bcrypt.hash("EmployeePassword123!", 10);
    const employeeUser = await prisma.user.create({
      data: {
        email: `employee-${Date.now()}@test.com`,
        name: "Test Employee",
        public_id: `USR${Date.now()}-EMP`,
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
    if (cashierId) {
      try {
        await prisma.cashier.delete({ where: { cashier_id: cashierId } });
      } catch (error) {
        // Ignore if already deleted
      }
    }
    if (employeeUserId) {
      // Delete user roles first
      await prisma.userRole.deleteMany({
        where: { user_id: employeeUserId },
      });
      // Then delete user
      try {
        await prisma.user.delete({ where: { user_id: employeeUserId } });
      } catch (error) {
        // Ignore if already deleted
      }
    }
    if (storeId) {
      const store = await prisma.store.findUnique({
        where: { store_id: storeId },
        include: { company: true },
      });
      if (store) {
        await prisma.store.delete({ where: { store_id: storeId } });
        if (store.company) {
          await prisma.company.delete({
            where: { company_id: store.company.company_id },
          });
        }
      }
    }
    if (clientOwnerEmail) {
      const owner = await prisma.user.findUnique({
        where: { email: clientOwnerEmail },
      });
      if (owner) {
        // Delete user roles first
        await prisma.userRole.deleteMany({
          where: { user_id: owner.user_id },
        });
        // Then delete user
        await prisma.user.delete({ where: { user_id: owner.user_id } });
      }
    }
    await prisma.$disconnect();
  });

  test("6.14-E2E-001: Client Owner can navigate to settings and view store info", async ({
    page,
  }) => {
    // GIVEN: Client Owner is logged in
    await loginAsClientOwner(page, clientOwnerEmail, clientOwnerPassword);

    // WHEN: User clicks "Settings" in sidebar navigation
    // Note: ClientSidebar uses generateTestId("Settings") which converts to "settings"
    await page.click('[data-testid="client-nav-link-settings"]');

    // THEN: User is navigated to /client-dashboard/settings
    await expect(page).toHaveURL(/.*\/client-dashboard\/settings.*/, {
      timeout: 10000,
    });

    // AND: Settings page is displayed
    await expect(page.locator('[data-testid="settings-page"]')).toBeVisible();

    // AND: Store tabs are displayed (if multiple stores exist)
    // Note: Store tabs only show if stores.length > 1, but we check for the container
    const storeTabs = page.locator('[data-testid="store-tabs"]');
    const storeTabsCount = await storeTabs.count();
    if (storeTabsCount > 0) {
      await expect(storeTabs.first()).toBeVisible();
    }

    // AND: Store Info tab is selected by default
    await expect(page.locator('[data-testid="store-info-tab"]')).toBeVisible();

    // AND: Store configuration is displayed
    await expect(page.locator('[data-testid="store-name"]')).toBeVisible({
      timeout: 5000,
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
    await page.click('[data-testid="employees-tab"]');

    // Wait for employee table to load
    await expect(page.locator('[data-testid="employee-table"]')).toBeVisible({
      timeout: 5000,
    });

    // Verify at least one employee exists
    const changeEmailButtons = page.locator(
      '[data-testid^="change-email-button-"]',
    );
    await expect(changeEmailButtons.first()).toBeVisible({ timeout: 5000 });

    // AND: User clicks "Change Email" for the first employee
    await page.click('[data-testid="change-email-button-0"]');

    // Wait for modal to open
    await expect(page.locator('[data-testid="email-input"]')).toBeVisible({
      timeout: 3000,
    });

    // AND: User enters new email and saves
    const newEmail = `newemail-${Date.now()}@test.nuvana.local`;
    await page.fill('[data-testid="email-input"]', newEmail);

    // Set up network interception to wait for API call
    const updateEmailResponsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/client/employees/") &&
        resp.url().includes("/email") &&
        resp.request().method() === "PUT" &&
        resp.status() === 200,
      { timeout: 10000 },
    );

    // Click save button
    await page.click('[data-testid="save-button"]');

    // Wait for API response
    await updateEmailResponsePromise;

    // Wait for modal to close
    await expect(page.locator('[data-testid="email-input"]')).not.toBeVisible({
      timeout: 3000,
    });

    // THEN: Success notification is displayed
    // Toasts don't have test IDs, check by text content instead
    await expect(
      page.locator("text=/Email updated|successfully/i"),
    ).toBeVisible({ timeout: 5000 });

    // AND: Employee email is updated in the table
    // Wait for table to refresh after update
    await page.waitForTimeout(1000);
    await expect(page.locator('[data-testid="employee-email-0"]')).toHaveText(
      newEmail,
      { timeout: 5000 },
    );
  });

  // ============================================================================
  // 🔒 SECURITY TESTS (Mandatory - Applied Automatically)
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
  // ✅ ADDITIONAL ASSERTIONS (Best Practices - Applied Automatically)
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
      // Verify it's read-only (disabled or readonly attribute)
      const isDisabled = await storeNameField.isDisabled();
      const isReadOnly = await storeNameField.getAttribute("readonly");
      expect(isDisabled || isReadOnly !== null).toBe(true);
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
      await page.click('[data-testid="employees-tab"]');

      // THEN: Employee table is displayed with correct columns
      await expect(page.locator('[data-testid="employee-table"]')).toBeVisible({
        timeout: 5000,
      });
      await expect(page.locator("text=Name")).toBeVisible();
      await expect(page.locator("text=Email")).toBeVisible();
      await expect(page.locator("text=Role")).toBeVisible();
      await expect(page.locator("text=Status")).toBeVisible();
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

      await page.click('[data-testid="employees-tab"]');
      await expect(page.locator('[data-testid="employee-table"]')).toBeVisible({
        timeout: 5000,
      });

      // WHEN: Employee data loads
      // THEN: Each row has "Change Email" and "Reset Password" action buttons
      const changeEmailButtons = page.locator(
        'button:has-text("Change Email")',
      );
      const resetPasswordButtons = page.locator(
        'button:has-text("Reset Password")',
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
      await page.click('[data-testid="cashiers-tab"]');

      // THEN: Cashier table is displayed with correct columns
      await expect(page.locator('[data-testid="cashier-table"]')).toBeVisible({
        timeout: 5000,
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

      await page.click('[data-testid="cashiers-tab"]');
      await expect(page.locator('[data-testid="cashier-table"]')).toBeVisible({
        timeout: 5000,
      });

      // WHEN: Cashier data loads
      // THEN: Each row has a "Reset PIN" action button
      const resetPINButtons = page.locator('button:has-text("Reset PIN")');

      // Wait for at least one button to appear
      await expect(resetPINButtons.first()).toBeVisible({ timeout: 5000 });

      const resetPINCount = await resetPINButtons.count();

      // Verify buttons exist (at least one if cashiers exist)
      expect(resetPINCount).toBeGreaterThan(0);
    });
  });
});
