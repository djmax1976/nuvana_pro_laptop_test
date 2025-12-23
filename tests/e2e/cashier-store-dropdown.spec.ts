/**
 * E2E Test: Cashier Store Dropdown
 *
 * Tests the cashier creation flow with store dropdown functionality:
 * - Verifies store dropdown auto-selects and displays store name when single store exists
 * - Verifies dropdown is disabled when only one store (as per implementation)
 * - Verifies successful cashier creation with auto-selected store
 * - Ensures form validation and submission work correctly
 *
 * Implementation Details (CashierForm.tsx):
 * - CLIENT_OWNER users are redirected to /client-dashboard after login
 * - Cashiers management page is at /client-dashboard/cashiers
 * - Store dropdown is disabled when stores.length === 1 (line 252)
 * - Store is auto-selected when stores.length === 1 via useEffect (lines 133-143)
 * - Form shows loading spinner while fetching stores (lines 147-153)
 * - Toast message: title "Cashier created", description "{name} has been added successfully." (lines 216-219)
 *
 * Data-testid Mapping:
 * - cashier-store: Store dropdown trigger (SelectTrigger)
 * - cashier-name: Name input field
 * - cashier-pin: PIN input field (type=password, maxLength=4)
 * - cashier-hired-on: Hired date input (defaults to today)
 * - submit-cashier: Submit button
 * - create-cashier-btn: "Add Cashier" button in CashierList
 * - cashier-search: Search input in CashierList
 */

import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";
import { cleanupTestData } from "../support/cleanup-helper";
import { createStore, createCompany } from "../support/factories";

const prisma = new PrismaClient();
const TEST_PASSWORD = "TestPassword123!";

let testUser: any;
let testCompany: any;
let testStore: any;
let testEmail: string;
const createdCashierIds: string[] = [];

/**
 * Helper function to perform client login and wait for navigation.
 *
 * CLIENT_OWNER users are redirected directly to /client-dashboard after login.
 *
 * @param page - Playwright page object
 * @param email - User email
 * @param password - User password
 */
async function performLogin(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  // Navigate to login page (use unified /login, not /client-login which redirects)
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  // Wait for login form to be visible and ready for input
  await page.waitForSelector('input[type="email"]', {
    state: "visible",
    timeout: 15000,
  });

  // Wait for input to be editable (ensures React hydration is complete)
  await expect(page.locator('input[type="email"]')).toBeEditable({
    timeout: 10000,
  });

  // Wait for network to settle after page load (React hydration)
  await page
    .waitForLoadState("networkidle", { timeout: 10000 })
    .catch(() => {});

  // Get locators for the input fields
  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');

  // Click on each field before filling to ensure focus and React event binding
  await emailInput.click();
  await emailInput.fill(email);

  await passwordInput.click();
  await passwordInput.fill(password);

  // Verify fields were filled by checking the DOM value attribute
  await expect(emailInput).toHaveValue(email, { timeout: 5000 });
  await expect(passwordInput).toHaveValue(password, { timeout: 5000 });

  // Set up response promise that captures any login response (success or failure)
  const loginResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes("/api/auth/login"),
    { timeout: 30000 },
  );

  // Click submit button (triggers login API request)
  await page.click('button[type="submit"]');

  // Wait for login API response
  const loginResponse = await loginResponsePromise;
  const responseStatus = loginResponse.status();

  // If login failed, provide detailed error message
  if (responseStatus !== 200) {
    const responseBody = await loginResponse.json().catch(() => ({}));
    const errorMessage =
      responseBody?.error?.message || responseBody?.message || "Unknown error";
    throw new Error(
      `Login failed with status ${responseStatus}: ${errorMessage}. ` +
        `This may indicate the backend is connected to a different database than the test. ` +
        `Ensure both test and backend use DATABASE_URL=nuvana_test.`,
    );
  }

  // Wait for navigation to client-dashboard
  await page.waitForURL(/.*client-dashboard.*/, {
    timeout: 30000,
    waitUntil: "domcontentloaded",
  });

  // Wait for page to be fully loaded (including auth context validation)
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {
    // networkidle might timeout if there are long-polling requests, that's OK
  });
}

/**
 * Helper function to navigate to cashiers page and open the add dialog
 * @param page - Playwright page object
 */
async function navigateToCashiersAndOpenDialog(page: Page): Promise<void> {
  await page.goto("/client-dashboard/cashiers", {
    waitUntil: "domcontentloaded",
  });

  // Wait for the page to load and dashboard API to complete
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {
    // Continue if networkidle times out - CI can be slow
  });

  // The CashierList component shows a skeleton during loading, then either:
  // 1. "No cashiers yet" state with create-cashier-btn
  // 2. Full list with cashier-search and create-cashier-btn
  // 3. Error state with "Failed to load cashiers"
  //
  // Wait for ANY of these states to appear (loading to complete)
  // Increase timeout to 30s for CI environments
  await Promise.race([
    // Success state: either the Add Cashier button or search field
    page
      .locator('[data-testid="create-cashier-btn"]')
      .first()
      .waitFor({ state: "visible", timeout: 30000 }),
    // Error state
    page
      .getByText("Failed to load cashiers")
      .waitFor({ state: "visible", timeout: 30000 }),
    // No stores state
    page
      .getByText("No stores available")
      .waitFor({ state: "visible", timeout: 30000 }),
  ]);

  // Check for error states and fail early with meaningful message
  const hasError = await page.getByText("Failed to load cashiers").isVisible();
  if (hasError) {
    throw new Error(
      "CashierList failed to load - check backend connectivity and store data",
    );
  }

  const hasNoStores = await page.getByText("No stores available").isVisible();
  if (hasNoStores) {
    throw new Error(
      "No stores available - test setup may have failed to create store",
    );
  }

  // Open Add Cashier dialog
  const addButton = page.locator('[data-testid="create-cashier-btn"]').first();
  await addButton.waitFor({ state: "visible", timeout: 10000 });
  await addButton.click();

  // Wait for dialog to be visible - the dialog shows "Add New Cashier" or just the form
  // Wait for the name input which is always present in the dialog
  await page.waitForSelector('[data-testid="cashier-name"]', {
    state: "visible",
    timeout: 15000,
  });
}

/**
 * Helper function to wait for stores to load in the form
 * The form shows a loading spinner while isLoadingStores is true
 * Uses Playwright's built-in locator assertions for reliability.
 *
 * @param page - Playwright page object
 * @param expectedStoreName - Expected store name to be displayed in the dropdown
 */
async function waitForStoresLoaded(
  page: Page,
  expectedStoreName: string,
): Promise<void> {
  const storeDropdown = page.locator('[data-testid="cashier-store"]');

  // Wait for the store dropdown to be visible (form has loaded, not showing spinner)
  await expect(storeDropdown).toBeVisible({ timeout: 15000 });

  // Wait for the dropdown to contain the store name (not placeholder text)
  // This confirms the store data has loaded and auto-selection has occurred
  await expect(storeDropdown).toContainText(expectedStoreName, {
    timeout: 10000,
  });

  // Verify it's not showing the placeholder
  await expect(storeDropdown).not.toContainText("Select a store");
}

test.describe("Cashier Store Dropdown", () => {
  // Use serial mode to prevent parallel worker race conditions on shared test data
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    // Clean up any existing test data from previous runs
    const existingUsers = await prisma.user.findMany({
      where: { email: { startsWith: "cashier-e2e-" } },
      select: { user_id: true },
    });

    for (const user of existingUsers) {
      await prisma.userRole.deleteMany({
        where: { user_id: user.user_id },
      });
    }

    await prisma.user.deleteMany({
      where: { email: { startsWith: "cashier-e2e-" } },
    });

    // Create test client user with identifiable email
    // Using uuidv4() suffix ensures uniqueness even with parallel workers
    testEmail = `cashier-e2e-${Date.now()}-${uuidv4().slice(0, 8)}@test.com`;
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

    testUser = await prisma.user.create({
      data: {
        user_id: uuidv4(),
        email: testEmail,
        name: "E2E Cashier Test Client",
        status: "ACTIVE",
        password_hash: passwordHash,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        is_client_user: true,
      },
    });

    // Create test company owned by the user
    testCompany = await prisma.company.create({
      data: createCompany({
        name: "E2E Test Company for Cashiers",
        status: "ACTIVE",
        owner_user_id: testUser.user_id,
      }),
    });

    // Create test store with proper test marker naming
    testStore = await prisma.store.create({
      data: createStore({
        company_id: testCompany.company_id,
        name: "E2E Cashier Test Store",
        status: "ACTIVE",
      }),
    });

    // Assign CLIENT_OWNER role to the user for the company
    // CLIENT_OWNER users are redirected to /client-dashboard after login
    // CLIENT_USER users are redirected to /mystore, but cashiers page is under /client-dashboard
    const clientOwnerRole = await prisma.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    if (clientOwnerRole) {
      await prisma.userRole.create({
        data: {
          user_id: testUser.user_id,
          role_id: clientOwnerRole.role_id,
          company_id: testCompany.company_id,
        },
      });
    }

    // Verify the user can be found in the database (sanity check)
    const verifyUser = await prisma.user.findUnique({
      where: { email: testEmail },
      select: { email: true, status: true, is_client_user: true },
    });
    if (!verifyUser) {
      throw new Error(
        `Test setup failed: User ${testEmail} was not found in database after creation. ` +
          `DATABASE_URL: ${process.env.DATABASE_URL}`,
      );
    }
    console.log(
      `[Setup] Created test user: ${testEmail} (status: ${verifyUser.status})`,
    );
  });

  test.afterAll(async () => {
    // Clean up in correct order to respect FK constraints:
    // 1. Cashiers (references stores via store_id)
    // 2. Stores (references companies via company_id)
    // 3. User roles (references users + companies)
    // 4. Companies
    // 5. Users

    // Step 1: Clean up any cashiers created during tests (by ID)
    if (createdCashierIds.length > 0) {
      for (const cashierId of createdCashierIds) {
        await prisma.cashier
          .delete({ where: { cashier_id: cashierId } })
          .catch(() => {
            // Ignore errors - cashier may have already been deleted
          });
      }
    }

    // Step 2: Clean up ALL cashiers in the test store (fallback for any missed)
    if (testStore) {
      await prisma.cashier
        .deleteMany({ where: { store_id: testStore.store_id } })
        .catch(() => {
          // Ignore errors - store may not exist or no cashiers
        });
    }

    // Step 3: Use the cleanup helper for remaining entities
    // cleanupTestData handles: stores -> user roles -> companies -> users
    await cleanupTestData(prisma, {
      stores: testStore ? [testStore.store_id] : [],
      companies: testCompany ? [testCompany.company_id] : [],
      users: testUser ? [testUser.user_id] : [],
    });

    await prisma.$disconnect();
  });

  test("should show store in dropdown when adding cashier", async ({
    page,
  }) => {
    // Step 1: Login as the test client owner
    await performLogin(page, testEmail, TEST_PASSWORD);

    // Step 2: Navigate to cashiers page and open the add dialog
    await navigateToCashiersAndOpenDialog(page);

    // Step 3: Wait for stores to load in the form
    await waitForStoresLoaded(page, testStore.name);

    // Step 4: Verify store dropdown behavior
    const storeDropdown = page.locator('[data-testid="cashier-store"]');

    // Assert dropdown is visible and disabled (single store auto-selection)
    await expect(storeDropdown).toBeVisible({ timeout: 10000 });
    await expect(storeDropdown).toBeDisabled({ timeout: 5000 });

    // Verify the dropdown displays the store name (already confirmed by waitForStoresLoaded)
    await expect(storeDropdown).toContainText(testStore.name, {
      timeout: 5000,
    });

    // Verify form has a valid store value by checking the hidden native select
    // Note: Radix UI Select creates a hidden <select> element for form submission
    // We verify the option exists and is selected
    // Use a retry pattern for the hidden select check as it may not be immediately available
    await expect(async () => {
      const hasValidStoreValue = await page.evaluate((expectedStoreId) => {
        // Radix Select creates a hidden native select for form values
        const hiddenSelect = document.querySelector(
          'select[aria-hidden="true"]',
        ) as HTMLSelectElement | null;
        // Check both that the select exists and has the expected value
        return hiddenSelect?.value === expectedStoreId;
      }, testStore.store_id);
      expect(hasValidStoreValue).toBe(true);
    }).toPass({ timeout: 10000 });
  });

  test("should successfully create a cashier with auto-selected store", async ({
    page,
  }) => {
    // Step 1: Login as the test client owner
    await performLogin(page, testEmail, TEST_PASSWORD);

    // Step 2: Navigate to cashiers page and open the add dialog
    await navigateToCashiersAndOpenDialog(page);

    // Step 3: Wait for stores to load in the form
    await waitForStoresLoaded(page, testStore.name);

    // Step 4: Verify store is auto-selected before filling other fields
    const storeDropdown = page.locator('[data-testid="cashier-store"]');
    await expect(storeDropdown).toBeVisible({ timeout: 10000 });
    await expect(storeDropdown).toBeDisabled();
    await expect(storeDropdown).toContainText(testStore.name);

    // Step 5: Fill in the cashier form
    const cashierName = `E2E Test Cashier ${Date.now()}`;

    const nameInput = page.locator('[data-testid="cashier-name"]');
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    await nameInput.fill(cashierName);

    const pinInput = page.locator('[data-testid="cashier-pin"]');
    await expect(pinInput).toBeVisible({ timeout: 10000 });
    await pinInput.fill("1234");

    // Verify store value is still set after filling other fields (no race condition)
    const storeValueStillSet = await page.evaluate((expectedStoreId) => {
      const hiddenSelect = document.querySelector(
        'select[aria-hidden="true"]',
      ) as HTMLSelectElement | null;
      return hiddenSelect?.value === expectedStoreId;
    }, testStore.store_id);
    expect(storeValueStillSet).toBe(true);

    // Step 6: Set up promises to wait for success indicators BEFORE clicking
    // The form calls onSuccess() which closes the dialog after successful creation
    const dialogClosePromise = page
      .locator('[data-testid="cashier-name"]')
      .waitFor({ state: "hidden", timeout: 20000 });

    // Wait for toast notification (title "Cashier created")
    const toastPromise = page
      .waitForSelector("text=Cashier created", {
        state: "visible",
        timeout: 10000,
      })
      .catch(() => null); // Toast might disappear quickly, don't fail if not found

    // Wait for the API response to verify creation was successful
    const createResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/stores/${testStore.store_id}/cashiers`) &&
        response.request().method() === "POST" &&
        response.status() === 201,
      { timeout: 15000 },
    );

    // Step 7: Submit the form
    const createButton = page.locator('[data-testid="submit-cashier"]');
    await createButton.waitFor({ state: "visible", timeout: 10000 });
    await createButton.click();

    // Step 8: Wait for success indicators
    // Primary: API response with 201 status
    const createResponse = await createResponsePromise;
    const responseBody = await createResponse.json();
    expect(responseBody.success).toBe(true);
    expect(responseBody.data).toHaveProperty("cashier_id");
    expect(responseBody.data.name).toBe(cashierName);
    expect(responseBody.data.store_id).toBe(testStore.store_id);

    // Track the created cashier ID for cleanup
    if (responseBody.data.cashier_id) {
      createdCashierIds.push(responseBody.data.cashier_id);
    }

    // Secondary: Dialog closes (onSuccess() is called after API success)
    await dialogClosePromise;

    // Tertiary: Toast notification (may have already disappeared)
    await toastPromise;

    // Step 9: Verify success state
    // Verify dialog is closed (primary success indicator)
    await expect(page.locator('[data-testid="cashier-name"]')).toBeHidden();

    // Ensure there's no validation error for store
    await expect(page.locator("text=Store is required")).not.toBeVisible();

    // Verify we're still on the cashiers page
    expect(page.url()).toContain("/client-dashboard/cashiers");

    // Verify the page header is visible (indicates page is in valid state)
    await expect(page.locator("text=Cashiers").first()).toBeVisible();

    // Step 10: Verify cashier was actually created in the database
    const createdCashier = await prisma.cashier.findUnique({
      where: { cashier_id: responseBody.data.cashier_id },
      select: {
        cashier_id: true,
        name: true,
        store_id: true,
        employee_id: true,
        is_active: true,
      },
    });
    expect(createdCashier).not.toBeNull();
    expect(createdCashier?.name).toBe(cashierName);
    expect(createdCashier?.store_id).toBe(testStore.store_id);
    expect(createdCashier?.is_active).toBe(true);
  });

  test("should not show store validation error when store is auto-selected", async ({
    page,
  }) => {
    // This test specifically validates that the auto-selected store
    // passes form validation when submitting (no "Store is required" error)

    // Step 1: Login
    await performLogin(page, testEmail, TEST_PASSWORD);

    // Step 2: Navigate to cashiers page and open the add dialog
    await navigateToCashiersAndOpenDialog(page);

    // Step 3: Wait for stores to load
    await waitForStoresLoaded(page, testStore.name);

    // Step 4: Fill only required fields (name and pin)
    const nameInput = page.locator('[data-testid="cashier-name"]');
    await nameInput.fill(`E2E Validation Test ${Date.now()}`);

    const pinInput = page.locator('[data-testid="cashier-pin"]');
    await pinInput.fill("5678");

    // Step 5: Attempt to submit
    const createButton = page.locator('[data-testid="submit-cashier"]');
    await createButton.click();

    // Step 6: Verify no store validation error appears
    // Wait for either form submission to complete (dialog closes) or validation errors to appear
    // Using expect with polling instead of fixed timeout for more reliable test execution
    await expect(page.locator("text=Store is required")).not.toBeVisible({
      timeout: 5000,
    });

    // The form should either succeed (dialog closes) or show other errors
    // but NOT a store validation error since store was auto-selected
    const dialogStillOpen = await page
      .locator('[data-testid="cashier-name"]')
      .isVisible();

    if (dialogStillOpen) {
      // If dialog is still open, verify it's not due to store validation
      const storeError = page.locator("text=Store is required");
      await expect(storeError).not.toBeVisible();
    }
  });
});
