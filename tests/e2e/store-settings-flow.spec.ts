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
 * Architecture: Each test is fully isolated with its own test data to prevent
 * cascade failures and enable parallel execution in CI/CD pipelines.
 *
 * ENTERPRISE PATTERNS:
 * - Test isolation: Each test has own setup/teardown
 * - Network-first: Wait for API responses before UI assertions
 * - Resilient selectors: data-testid attributes
 * - Web-first assertions: Auto-waiting with increased CI timeouts
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

// ============================================================================
// TEST FIXTURE INTERFACE
// ============================================================================

interface StoreSettingsTestFixture {
  prisma: PrismaClient;
  clientOwner: {
    user_id: string;
    email: string;
    name: string;
  };
  company: {
    company_id: string;
    name: string;
  };
  store: {
    store_id: string;
    name: string;
  };
  employee?: {
    user_id: string;
    email: string;
    name: string;
  };
  cashier?: {
    cashier_id: string;
    name: string;
  };
  password: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Creates isolated test data for a single test.
 * Each test gets its own user, company, store to ensure complete isolation.
 */
async function createTestFixture(
  testId: string,
  options: { withEmployee?: boolean; withCashier?: boolean } = {},
): Promise<StoreSettingsTestFixture> {
  const prisma = new PrismaClient();
  await prisma.$connect();

  const password = "TestPassword123!";
  const passwordHash = await bcrypt.hash(password, 10);
  const timestamp = Date.now();
  const userId = uuidv4();
  const companyId = uuidv4();
  const storeId = uuidv4();

  // Create test user (Client Owner)
  const clientOwner = await prisma.user.create({
    data: {
      user_id: userId,
      email: `e2e-settings-${testId}-${timestamp}@test.com`,
      name: `E2E Settings ${testId} Owner`,
      status: "ACTIVE",
      password_hash: passwordHash,
      public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
      is_client_user: true,
    },
  });

  // Create company
  const company = await prisma.company.create({
    data: {
      company_id: companyId,
      public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
      name: `E2E Settings ${testId} Company`,
      status: "ACTIVE",
      owner_user_id: clientOwner.user_id,
    },
  });

  // Create store
  const store = await prisma.store.create({
    data: {
      store_id: storeId,
      public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
      company_id: company.company_id,
      name: `E2E Settings ${testId} Store`,
      timezone: "America/New_York",
      status: "ACTIVE",
      configuration: {
        contact_email: "store@test.com",
        timezone: "America/New_York",
      },
    },
  });

  // Assign CLIENT_OWNER role
  const clientOwnerRole = await prisma.role.findUnique({
    where: { code: "CLIENT_OWNER" },
  });

  if (!clientOwnerRole) {
    throw new Error("CLIENT_OWNER role not found - run RBAC seed first");
  }

  await prisma.userRole.create({
    data: {
      user_id: clientOwner.user_id,
      role_id: clientOwnerRole.role_id,
      company_id: company.company_id,
    },
  });

  const fixture: StoreSettingsTestFixture = {
    prisma,
    clientOwner: {
      user_id: clientOwner.user_id,
      email: clientOwner.email,
      name: clientOwner.name || "",
    },
    company: {
      company_id: company.company_id,
      name: company.name,
    },
    store: {
      store_id: store.store_id,
      name: store.name,
    },
    password,
  };

  // Optionally create employee
  if (options.withEmployee) {
    const storeRole = await prisma.role.findFirst({
      where: { scope: "STORE" },
    });

    if (!storeRole) {
      throw new Error("No STORE scope role found - run RBAC seed first");
    }

    const employeePassword = await bcrypt.hash("EmployeePassword123!", 10);
    const employeeUser = await prisma.user.create({
      data: {
        email: `e2e-employee-${testId}-${timestamp}@test.com`,
        name: `Test Employee ${testId}`,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        password_hash: employeePassword,
        status: "ACTIVE",
        is_client_user: true,
      },
    });

    await prisma.userRole.create({
      data: {
        user_id: employeeUser.user_id,
        role_id: storeRole.role_id,
        store_id: store.store_id,
        company_id: company.company_id,
        assigned_by: clientOwner.user_id,
      },
    });

    fixture.employee = {
      user_id: employeeUser.user_id,
      email: employeeUser.email,
      name: employeeUser.name || "",
    };
  }

  // Optionally create cashier
  if (options.withCashier) {
    const cashier = await createCashier(
      {
        store_id: store.store_id,
        created_by: clientOwner.user_id,
        name: `Test Cashier ${testId}`,
        pin: "1234",
      },
      prisma,
    );

    fixture.cashier = {
      cashier_id: cashier.cashier_id,
      name: cashier.name || "",
    };
  }

  return fixture;
}

/**
 * Cleans up test fixture data.
 */
async function cleanupTestFixture(
  fixture: StoreSettingsTestFixture,
): Promise<void> {
  const { prisma, clientOwner, company, store, employee, cashier } = fixture;

  try {
    // Delete in reverse order of creation
    if (cashier?.cashier_id) {
      await prisma.cashier
        .delete({ where: { cashier_id: cashier.cashier_id } })
        .catch(() => {});
    }

    if (employee?.user_id) {
      await prisma.userRole
        .deleteMany({ where: { user_id: employee.user_id } })
        .catch(() => {});
      await prisma.user
        .delete({ where: { user_id: employee.user_id } })
        .catch(() => {});
    }

    await prisma.store
      .delete({ where: { store_id: store.store_id } })
      .catch(() => {});
    await prisma.company
      .delete({ where: { company_id: company.company_id } })
      .catch(() => {});
    await prisma.userRole
      .deleteMany({ where: { user_id: clientOwner.user_id } })
      .catch(() => {});
    await prisma.auditLog
      .deleteMany({ where: { user_id: clientOwner.user_id } })
      .catch(() => {});
    await prisma.user
      .delete({ where: { user_id: clientOwner.user_id } })
      .catch(() => {});
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Network-first login helper that waits for actual API response.
 */
async function loginAsClientOwner(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');
  const submitButton = page.locator('button[type="submit"]');

  await expect(emailInput).toBeEditable({ timeout: 30000 });
  await page.waitForLoadState("networkidle").catch(() => {});

  await emailInput.click();
  await emailInput.fill(email);
  await passwordInput.click();
  await passwordInput.fill(password);

  await expect(emailInput).toHaveValue(email);
  await expect(passwordInput).toHaveValue(password);

  const [loginResponse] = await Promise.all([
    page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/auth/login") &&
        resp.request().method() === "POST",
      { timeout: 45000 },
    ),
    submitButton.click(),
  ]);

  if (loginResponse.status() !== 200) {
    const body = await loginResponse.json().catch(() => ({}));
    throw new Error(
      `Login failed: ${body.message || body.error?.message || `HTTP ${loginResponse.status()}`}`,
    );
  }

  await page.waitForURL(/.*client-dashboard.*/, { timeout: 45000 });
}

/**
 * Navigate to settings page and wait for it to load using network-first pattern.
 */
async function navigateToSettingsPage(page: Page): Promise<void> {
  const dashboardApiPromise = page.waitForResponse(
    (resp) =>
      resp.url().includes("/api/client/dashboard") && resp.status() === 200,
    { timeout: 30000 },
  );

  await page.goto("/client-dashboard/settings", {
    waitUntil: "domcontentloaded",
  });

  await dashboardApiPromise;

  await expect(page.locator('[data-testid="settings-page"]')).toBeVisible({
    timeout: 30000,
  });
}

// ============================================================================
// TEST SUITE
// ============================================================================

test.describe("Store Settings Flow (Critical Journey)", () => {
  // ---------------------------------------------------------------------------
  // CORE WORKFLOW TESTS
  // ---------------------------------------------------------------------------

  test("6.14-E2E-001: Client Owner can navigate to settings and view store info", async ({
    page,
  }) => {
    const fixture = await createTestFixture("001");

    try {
      // GIVEN: Client Owner is logged in
      await loginAsClientOwner(
        page,
        fixture.clientOwner.email,
        fixture.password,
      );

      // WHEN: User clicks "Settings" in sidebar navigation
      const settingsLink = page.locator(
        '[data-testid="client-nav-link-settings"]',
      );
      await expect(settingsLink).toBeVisible({ timeout: 20000 });

      await Promise.all([
        page.waitForURL(/.*\/client-dashboard\/settings.*/, { timeout: 30000 }),
        settingsLink.click(),
      ]);

      // THEN: User is navigated to /client-dashboard/settings
      await expect(page).toHaveURL(/.*\/client-dashboard\/settings.*/);

      // AND: Settings page is displayed
      await expect(page.locator('[data-testid="settings-page"]')).toBeVisible({
        timeout: 30000,
      });

      // AND: Store Info tab button is visible
      await expect(
        page.locator('button[data-testid="store-info-tab"]'),
      ).toBeVisible({
        timeout: 20000,
      });

      // AND: Store configuration is displayed
      await expect(page.locator('[data-testid="store-name"]')).toBeVisible({
        timeout: 15000,
      });
      await expect(
        page.locator('[data-testid="timezone-select"]'),
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="contact-email-input"]'),
      ).toBeVisible();
    } finally {
      await cleanupTestFixture(fixture);
    }
  });

  test("6.14-E2E-002: Client Owner can change employee email end-to-end", async ({
    page,
  }) => {
    const fixture = await createTestFixture("002", { withEmployee: true });

    try {
      // GIVEN: Client Owner is logged in and on settings page
      await loginAsClientOwner(
        page,
        fixture.clientOwner.email,
        fixture.password,
      );
      await navigateToSettingsPage(page);

      // WHEN: User selects Employees tab
      const employeesTab = page.locator('[data-testid="employees-tab"]');
      await expect(employeesTab).toBeVisible({ timeout: 15000 });

      const employeesApiPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/client/employees") && resp.status() === 200,
        { timeout: 30000 },
      );

      await employeesTab.click();
      await employeesApiPromise;

      // Wait for employee table to load
      await expect(page.locator('[data-testid="employee-table"]')).toBeVisible({
        timeout: 15000,
      });

      // Verify at least one employee exists
      const changeEmailButtons = page.locator(
        '[data-testid^="change-email-button-"]',
      );
      await expect(changeEmailButtons.first()).toBeVisible({ timeout: 10000 });

      // AND: User clicks "Change Email" for the first employee
      const changeEmailButton = page.locator(
        '[data-testid="change-email-button-0"]',
      );
      await expect(changeEmailButton).toBeEnabled({ timeout: 5000 });
      await changeEmailButton.click();

      // Wait for modal to open
      const emailInput = page.locator('[data-testid="email-input"]');
      await expect(emailInput).toBeVisible({ timeout: 10000 });
      await expect(emailInput).toBeEditable({ timeout: 5000 });

      // AND: User enters new email and saves
      const newEmail = `newemail-${Date.now()}@test.nuvana.local`;

      await emailInput.click();
      await emailInput.clear();
      await emailInput.fill(newEmail);
      await expect(emailInput).toHaveValue(newEmail, { timeout: 5000 });

      const updateEmailResponsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/client/employees/") &&
          resp.url().includes("/email") &&
          resp.request().method() === "PUT" &&
          resp.status() === 200,
        { timeout: 20000 },
      );

      const saveButton = page.locator('[data-testid="save-button"]');
      await expect(saveButton).toBeEnabled({ timeout: 5000 });
      await saveButton.click();

      await updateEmailResponsePromise;

      // THEN: Success notification is displayed
      await expect(
        page.getByText("Email updated", { exact: true }).first(),
      ).toBeVisible({
        timeout: 15000,
      });

      // Wait for modal to close
      await expect(emailInput).not.toBeVisible({ timeout: 10000 });

      // AND: Employee email is updated in the table
      await expect(page.locator('[data-testid="employee-email-0"]')).toHaveText(
        newEmail,
        { timeout: 20000 },
      );

      await expect(
        page.locator('[data-testid="employee-table"]'),
      ).toBeVisible();
    } finally {
      await cleanupTestFixture(fixture);
    }
  });

  // ---------------------------------------------------------------------------
  // SECURITY TESTS
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // RESPONSE STRUCTURE ASSERTIONS
  // ---------------------------------------------------------------------------

  test("6.14-E2E-004: should display store name as read-only field", async ({
    page,
  }) => {
    const fixture = await createTestFixture("004");

    try {
      // GIVEN: Client Owner is logged in
      await loginAsClientOwner(
        page,
        fixture.clientOwner.email,
        fixture.password,
      );

      // WHEN: Navigating to settings page
      await navigateToSettingsPage(page);

      // THEN: Store name field is visible and read-only
      const storeNameField = page.locator('[data-testid="store-name"]');
      await expect(storeNameField).toBeVisible({ timeout: 10000 });
      const isDisabled = await storeNameField.isDisabled();
      expect(isDisabled).toBe(true);
    } finally {
      await cleanupTestFixture(fixture);
    }
  });

  // ---------------------------------------------------------------------------
  // EMPLOYEES TAB TESTS
  // ---------------------------------------------------------------------------

  test("6.14-E2E-005: [P1-AC-4] should display employee table with columns", async ({
    page,
  }) => {
    const fixture = await createTestFixture("005", { withEmployee: true });

    try {
      // GIVEN: Client Owner is logged in and on settings page
      await loginAsClientOwner(
        page,
        fixture.clientOwner.email,
        fixture.password,
      );
      await navigateToSettingsPage(page);

      // WHEN: User selects Employees tab
      const employeesTab = page.locator('[data-testid="employees-tab"]');
      await expect(employeesTab).toBeVisible({ timeout: 15000 });

      const employeesApiPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/client/employees") && resp.status() === 200,
        { timeout: 30000 },
      );

      await employeesTab.click();
      await employeesApiPromise;

      // THEN: Employee table is displayed with correct columns
      const employeeTable = page.locator('[data-testid="employee-table"]');
      await expect(employeeTable).toBeVisible({ timeout: 15000 });

      const tableHeader = employeeTable.locator("thead");
      await expect(tableHeader.locator("text=Name")).toBeVisible();
      await expect(tableHeader.locator("text=Email")).toBeVisible();
      await expect(tableHeader.locator("text=Role")).toBeVisible();
      await expect(tableHeader.locator("text=Status")).toBeVisible();
    } finally {
      await cleanupTestFixture(fixture);
    }
  });

  test("6.14-E2E-006: [P1-AC-4] should display action buttons for each employee", async ({
    page,
  }) => {
    const fixture = await createTestFixture("006", { withEmployee: true });

    try {
      // GIVEN: Client Owner is logged in and on Employees tab
      await loginAsClientOwner(
        page,
        fixture.clientOwner.email,
        fixture.password,
      );
      await navigateToSettingsPage(page);

      const employeesTab = page.locator('[data-testid="employees-tab"]');
      await expect(employeesTab).toBeVisible({ timeout: 15000 });

      const employeesApiPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/client/employees") && resp.status() === 200,
        { timeout: 30000 },
      );

      await employeesTab.click();
      await employeesApiPromise;

      await expect(page.locator('[data-testid="employee-table"]')).toBeVisible({
        timeout: 15000,
      });

      // THEN: Each row has action buttons
      const changeEmailButtons = page.locator(
        '[data-testid^="change-email-button-"]',
      );
      const resetPasswordButtons = page.locator(
        '[data-testid^="reset-password-button-"]',
      );

      await expect(changeEmailButtons.first()).toBeVisible({ timeout: 15000 });
      await expect(resetPasswordButtons.first()).toBeVisible({
        timeout: 10000,
      });

      const changeEmailCount = await changeEmailButtons.count();
      const resetPasswordCount = await resetPasswordButtons.count();

      expect(changeEmailCount).toBeGreaterThan(0);
      expect(resetPasswordCount).toBeGreaterThan(0);
      expect(changeEmailCount).toBe(resetPasswordCount);
    } finally {
      await cleanupTestFixture(fixture);
    }
  });

  // ---------------------------------------------------------------------------
  // CASHIERS TAB TESTS
  // ---------------------------------------------------------------------------

  test("6.14-E2E-007: [P1-AC-7] should display cashier table with columns", async ({
    page,
  }) => {
    const fixture = await createTestFixture("007", { withCashier: true });

    try {
      // GIVEN: Client Owner is logged in and on settings page
      await loginAsClientOwner(
        page,
        fixture.clientOwner.email,
        fixture.password,
      );
      await navigateToSettingsPage(page);

      // WHEN: User selects Cashiers tab
      const cashiersTab = page.locator('[data-testid="cashiers-tab"]');
      await expect(cashiersTab).toBeVisible({ timeout: 15000 });

      const cashiersApiPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/stores/") &&
          resp.url().includes("/cashiers") &&
          resp.status() === 200,
        { timeout: 30000 },
      );

      await cashiersTab.click();
      await cashiersApiPromise;

      // THEN: Cashier table is displayed with correct columns
      const cashierTable = page.locator('[data-testid="cashier-table"]');
      await expect(cashierTable).toBeVisible({ timeout: 15000 });

      const tableHeader = cashierTable.locator("thead");
      await expect(tableHeader.getByText("Employee ID")).toBeVisible({
        timeout: 5000,
      });
      await expect(tableHeader.getByText("Name")).toBeVisible();
      await expect(tableHeader.getByText("Hired On")).toBeVisible();
      await expect(tableHeader.getByText("Status")).toBeVisible();
    } finally {
      await cleanupTestFixture(fixture);
    }
  });

  test("6.14-E2E-008: [P1-AC-7] should display Reset PIN button for each cashier", async ({
    page,
  }) => {
    const fixture = await createTestFixture("008", { withCashier: true });

    try {
      // GIVEN: Client Owner is logged in and on Cashiers tab
      await loginAsClientOwner(
        page,
        fixture.clientOwner.email,
        fixture.password,
      );
      await navigateToSettingsPage(page);

      const cashiersTab = page.locator('[data-testid="cashiers-tab"]');
      await expect(cashiersTab).toBeVisible({ timeout: 15000 });

      const cashiersApiPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/stores/") &&
          resp.url().includes("/cashiers") &&
          resp.status() === 200,
        { timeout: 30000 },
      );

      await cashiersTab.click();
      await cashiersApiPromise;

      await expect(page.locator('[data-testid="cashier-table"]')).toBeVisible({
        timeout: 15000,
      });

      // THEN: Each row has a Reset PIN button
      const resetPINButtons = page.locator(
        '[data-testid^="reset-pin-button-"]',
      );
      await expect(resetPINButtons.first()).toBeVisible({ timeout: 10000 });

      const resetPINCount = await resetPINButtons.count();
      expect(resetPINCount).toBeGreaterThan(0);
    } finally {
      await cleanupTestFixture(fixture);
    }
  });
});
