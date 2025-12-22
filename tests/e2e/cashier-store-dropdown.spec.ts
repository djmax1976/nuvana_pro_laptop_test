/**
 * E2E Test: Cashier Store Dropdown
 *
 * Tests the cashier creation flow with store dropdown functionality:
 * - Verifies store dropdown auto-selects and displays store name when single store exists
 * - Verifies dropdown is disabled when only one store (as per implementation)
 * - Verifies successful cashier creation with auto-selected store
 * - Ensures form validation and submission work correctly
 *
 * Implementation Details:
 * - CLIENT_OWNER users are redirected to /client-dashboard after login
 * - CLIENT_USER users are redirected to /mystore (terminal dashboard)
 * - Cashiers management page is at /client-dashboard/cashiers
 * - Store dropdown is disabled when stores.length === 1 (CashierForm.tsx)
 * - Store is auto-selected when stores.length === 1 (CashierForm.tsx)
 * - Form shows loading state while fetching stores
 * - Toast message: title "Cashier created", description "{name} has been added successfully."
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
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {
    // Continue if networkidle times out
  });

  // Wait for the cashier list to be visible (ensures page is fully loaded)
  await page.waitForSelector(
    '[data-testid="create-cashier-btn"], [data-testid="cashier-search"]',
    {
      timeout: 15000,
      state: "visible",
    },
  );

  // Open Add Cashier dialog
  const addButton = page.locator('[data-testid="create-cashier-btn"]').first();
  await addButton.waitFor({ state: "visible", timeout: 15000 });
  await addButton.click();

  // Wait for dialog to be visible - the dialog shows "Add New Cashier" or just the form
  // Wait for the name input which is always present in the dialog
  await page.waitForSelector('[data-testid="cashier-name"]', {
    state: "visible",
    timeout: 10000,
  });
}

/**
 * Helper function to wait for stores to load in the form
 * The form shows a loading spinner while isLoadingStores is true
 * @param page - Playwright page object
 * @param expectedStoreId - Expected store ID to be auto-selected
 * @param expectedStoreName - Expected store name to be displayed
 */
async function waitForStoresLoaded(
  page: Page,
  expectedStoreId?: string,
  expectedStoreName?: string,
): Promise<void> {
  // Wait for the store dropdown to be visible (form has loaded)
  await page
    .locator('[data-testid="cashier-store"]')
    .waitFor({ state: "visible", timeout: 15000 });

  // Wait for network to be idle to ensure API calls completed
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {
    // networkidle might timeout, continue with selector-based waiting
  });

  // Wait for the form to initialize and store to be auto-selected
  // We check both the visible text (store name) and the hidden select value
  await page.waitForFunction(
    ({ storeId, storeName }) => {
      // Find the store field container
      const storeField = document.querySelector(
        '[data-testid="cashier-store"]',
      );
      if (!storeField) return false;

      // Check if the trigger shows the store name (not placeholder)
      const triggerText = storeField.textContent || "";
      const hasStoreName =
        storeName && triggerText.includes(storeName) && triggerText.length > 0;
      const hasNoPlaceholder = !triggerText.includes("Select a store");

      // Also verify the hidden select has the correct value
      // Radix UI Select creates a hidden native select for form submission
      const hiddenSelect = document.querySelector(
        'select[aria-hidden="true"]',
      ) as HTMLSelectElement | null;

      const hasCorrectValue =
        !storeId || (hiddenSelect?.value === storeId && hiddenSelect.value);

      // Both conditions must be true: visible text shows store name AND hidden select has value
      return (
        (hasStoreName || hasNoPlaceholder) && (hasCorrectValue || !hiddenSelect) // hidden select might not exist yet
      );
    },
    { storeId: expectedStoreId, storeName: expectedStoreName },
    { timeout: 10000 },
  );
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
    // Clean up any cashiers created during tests
    if (createdCashierIds.length > 0 && testStore) {
      for (const cashierId of createdCashierIds) {
        await prisma.cashier
          .delete({ where: { cashier_id: cashierId } })
          .catch(() => {
            // Ignore errors - cashier may have already been deleted
          });
      }
    }

    // Also clean up any cashiers in the test store (fallback cleanup)
    if (testStore) {
      await prisma.cashier
        .deleteMany({ where: { store_id: testStore.store_id } })
        .catch(() => {
          // Ignore errors
        });
    }

    // Cleanup test data
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
    // Enable console logging for debugging
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") {
        console.log(`Browser ${msg.type()}: ${msg.text()}`);
      }
    });

    // Step 1: Login as the test client owner
    await performLogin(page, testEmail, TEST_PASSWORD);

    // Step 2: Navigate to cashiers page and open the add dialog
    await navigateToCashiersAndOpenDialog(page);

    // Step 3: Wait for stores to load in the form
    await waitForStoresLoaded(page, testStore.store_id, testStore.name);

    // Step 4: Verify store dropdown behavior
    const storeDropdown = page.locator('[data-testid="cashier-store"]');

    // Assert dropdown is visible and disabled (single store auto-selection)
    await expect(storeDropdown).toBeVisible({ timeout: 10000 });
    await expect(storeDropdown).toBeDisabled();

    // Verify the dropdown displays the store name, not the placeholder
    await expect(storeDropdown).toContainText(testStore.name, {
      timeout: 10000,
    });
    await expect(storeDropdown).not.toContainText("Select a store");

    // Verify the underlying form has the correct store_id value
    // Radix UI Select creates a hidden native select for form submission
    const hiddenSelectValue = await page.evaluate(() => {
      const hiddenSelect = document.querySelector(
        'select[aria-hidden="true"]',
      ) as HTMLSelectElement | null;
      return hiddenSelect?.value || null;
    });
    expect(hiddenSelectValue).toBe(testStore.store_id);
  });

  test("should successfully create a cashier with auto-selected store", async ({
    page,
  }) => {
    // Step 1: Login as the test client owner
    await performLogin(page, testEmail, TEST_PASSWORD);

    // Step 2: Navigate to cashiers page and open the add dialog
    await navigateToCashiersAndOpenDialog(page);

    // Step 3: Wait for stores to load in the form
    await waitForStoresLoaded(page, testStore.store_id, testStore.name);

    // Step 4: Verify store is auto-selected before filling other fields
    const storeDropdown = page.locator('[data-testid="cashier-store"]');
    await expect(storeDropdown).toBeVisible({ timeout: 10000 });
    await expect(storeDropdown).toBeDisabled();
    await expect(storeDropdown).toContainText(testStore.name, {
      timeout: 10000,
    });

    // Step 5: Fill in the cashier form
    const cashierName = `E2E Test Cashier ${Date.now()}`;

    const nameInput = page.locator('[data-testid="cashier-name"]');
    await nameInput.waitFor({ state: "visible", timeout: 10000 });
    await nameInput.fill(cashierName);

    const pinInput = page.locator('[data-testid="cashier-pin"]');
    await pinInput.waitFor({ state: "visible", timeout: 10000 });
    await pinInput.fill("1234");

    // Verify store value is still set after filling other fields (no race condition)
    const hiddenSelectValue = await page.evaluate(() => {
      const hiddenSelect = document.querySelector(
        'select[aria-hidden="true"]',
      ) as HTMLSelectElement | null;
      return hiddenSelect?.value || null;
    });
    expect(hiddenSelectValue).toBe(testStore.store_id);

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
    await waitForStoresLoaded(page, testStore.store_id, testStore.name);

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
