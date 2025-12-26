/**
 * E2E Test: Cashier Store Dropdown
 *
 * @test-level E2E
 * @story 4.9 - Cashier Management
 * @priority P0 (Critical - Core Cashier Creation Flow)
 *
 * Tests the cashier creation flow with store dropdown functionality:
 * - Verifies store dropdown auto-selects and displays store name when single store exists
 * - Verifies dropdown is disabled when only one store (as per implementation)
 * - Verifies successful cashier creation with auto-selected store
 * - Ensures form validation and submission work correctly
 *
 * Enterprise Patterns Used:
 * - Network-first waiting: Wait for specific API responses, not arbitrary timeouts
 * - Deterministic assertions: Verify API response before checking UI
 * - Test isolation: Each test creates/cleans its own data
 * - Centralized helpers: Reusable login and navigation utilities
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
 * - cashier-termination-date: Termination date input (optional)
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
 * Network-first login helper that waits for actual API response
 * instead of arbitrary timeouts.
 *
 * Flow:
 * 1. Navigate to login page
 * 2. Wait for form to be interactive (React hydration complete)
 * 3. Fill credentials and submit
 * 4. Wait for login API response (deterministic)
 * 5. Wait for redirect to complete
 *
 * @param page - Playwright page object
 * @param email - User email
 * @param password - User password
 * @throws Error with descriptive message if login fails
 */
async function performLogin(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  // Navigate to login page with networkidle to ensure page is fully loaded
  await page.goto("/login", { waitUntil: "networkidle" });

  // Wait for page to be fully loaded
  await page.waitForLoadState("domcontentloaded");

  // Get locators for form elements using ID selectors (matches LoginForm.tsx)
  const emailInput = page.locator("#email");
  const passwordInput = page.locator("#password");
  const submitButton = page.getByRole("button", { name: "Sign In" });

  // Wait for form to be visible and enabled
  await expect(emailInput).toBeVisible({ timeout: 30000 });
  await expect(emailInput).toBeEnabled({ timeout: 5000 });

  // Fill credentials with explicit click to focus (handles React controlled inputs)
  await emailInput.click();
  await emailInput.fill(email);

  await expect(passwordInput).toBeVisible({ timeout: 5000 });
  await passwordInput.click();
  await passwordInput.fill(password);

  // Verify credentials were filled
  await expect(emailInput).toHaveValue(email);
  await expect(passwordInput).toHaveValue(password);

  // Submit form
  await expect(submitButton).toBeEnabled({ timeout: 5000 });
  await submitButton.click();

  // Wait for navigation away from login page OR for an error to appear
  try {
    await page.waitForURL((url) => !url.pathname.includes("login"), {
      timeout: 30000,
    });
  } catch {
    // Check if there's an error message on the page (filter out route announcer)
    const errorAlert = page.locator(
      '[role="alert"]:not([id="__next-route-announcer__"])',
    );
    if ((await errorAlert.count()) > 0 && (await errorAlert.isVisible())) {
      const errorText = await errorAlert.textContent();
      throw new Error(
        `Login failed with error: ${errorText}. ` +
          `This may indicate the backend is connected to a different database than the test. ` +
          `Ensure both test and backend use DATABASE_URL=nuvana_test.`,
      );
    }
    throw new Error(
      "Login failed - page did not navigate away from login. " +
        "This may indicate the backend is connected to a different database than the test.",
    );
  }

  // Wait for client-dashboard URL pattern (CLIENT_OWNER redirect destination)
  await page.waitForURL(/.*client-dashboard.*/, {
    timeout: 15000,
  });

  // CRITICAL: Wait for authenticated content to render before returning
  // This ensures the React auth context is fully populated before navigating
  // to other pages. Without this, navigation to subpages may fail because
  // the auth context hasn't initialized yet.
  await page
    .locator('[data-testid="client-dashboard-page"]')
    .waitFor({ state: "visible", timeout: 30000 });

  // Wait for dashboard API call to complete (provides stores/user data)
  await page
    .waitForResponse(
      (resp) =>
        resp.url().includes("/api/client/dashboard") && resp.status() === 200,
      { timeout: 30000 },
    )
    .catch(() => {
      // API might already have completed before we started listening
    });

  // Wait for network idle to ensure all React context updates are complete
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {
    // networkidle might timeout if there are long-polling requests, that's OK
  });
}

/**
 * Navigate to cashiers page and open the add dialog.
 * Uses network-first pattern - waits for API responses that populate the page.
 *
 * @param page - Playwright page object
 * @throws Error with descriptive message if page fails to load
 */
async function navigateToCashiersAndOpenDialog(page: Page): Promise<void> {
  // Navigate to cashiers page
  await page.goto("/client-dashboard/cashiers", {
    waitUntil: "domcontentloaded",
  });

  // Wait for network idle to ensure API calls complete
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {
    // networkidle might timeout if there are long-polling requests
  });

  // Wait for the page to render based on API data
  // The CashierList component shows a skeleton during loading, then either:
  // 1. "No cashiers yet" state with create-cashier-btn
  // 2. Full list with cashier-search and create-cashier-btn
  // 3. Error state with "Failed to load cashiers"
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

  // Open Add Cashier dialog - use click action instead of separate waitFor
  const addButton = page.locator('[data-testid="create-cashier-btn"]').first();
  await expect(addButton).toBeVisible({ timeout: 10000 });
  await addButton.click();

  // Wait for dialog to be visible (name input is always present in the dialog form)
  await expect(page.locator('[data-testid="cashier-name"]')).toBeVisible({
    timeout: 15000,
  });
}

/**
 * Wait for stores to load in the CashierForm.
 *
 * The form shows a loading spinner while isLoadingStores is true.
 * When stores load and there's only one store, it auto-selects and disables the dropdown.
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
  await expect(storeDropdown).toBeVisible({ timeout: 30000 });

  // Wait for the dropdown to contain the store name (not placeholder text)
  // This confirms the store data has loaded and auto-selection has occurred
  await expect(storeDropdown).toContainText(expectedStoreName, {
    timeout: 20000,
  });

  // Verify it's not showing the placeholder (auto-selection worked)
  await expect(storeDropdown).not.toContainText("Select a store");
}

/**
 * Verify the hidden Radix select has the correct store value.
 * Radix UI Select creates a hidden <select> element for form submission.
 *
 * @param page - Playwright page object
 * @param expectedStoreId - Expected store ID to be set
 */
async function verifyHiddenSelectValue(
  page: Page,
  expectedStoreId: string,
): Promise<void> {
  // Use a retry pattern for the hidden select check as it may not be immediately available
  await expect(async () => {
    const hasValidStoreValue = await page.evaluate((storeId) => {
      // Radix Select creates a hidden native select for form values
      const hiddenSelect = document.querySelector(
        'select[aria-hidden="true"]',
      ) as HTMLSelectElement | null;
      // Check both that the select exists and has the expected value
      return hiddenSelect?.value === storeId;
    }, expectedStoreId);
    expect(hasValidStoreValue).toBe(true);
  }).toPass({ timeout: 10000 });
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
    await verifyHiddenSelectValue(page, testStore.store_id);
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
    await nameInput.click();
    await nameInput.fill(cashierName);

    const pinInput = page.locator('[data-testid="cashier-pin"]');
    await expect(pinInput).toBeVisible({ timeout: 10000 });
    await pinInput.click();
    await pinInput.fill("1234");

    // Verify store value is still set after filling other fields (no race condition)
    await verifyHiddenSelectValue(page, testStore.store_id);

    // Step 6: Submit form using Promise.all pattern (network-first)
    // Set up API listener BEFORE clicking to avoid race conditions
    const createButton = page.locator('[data-testid="submit-cashier"]');
    await expect(createButton).toBeVisible({ timeout: 10000 });

    const [createResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response
            .url()
            .includes(`/api/stores/${testStore.store_id}/cashiers`) &&
          response.request().method() === "POST",
        { timeout: 15000 },
      ),
      createButton.click(),
    ]);

    // Step 7: Verify API response (deterministic assertion)
    expect(createResponse.status()).toBe(201);
    const responseBody = await createResponse.json();
    expect(responseBody.success).toBe(true);
    expect(responseBody.data).toHaveProperty("cashier_id");
    expect(responseBody.data.name).toBe(cashierName);
    expect(responseBody.data.store_id).toBe(testStore.store_id);

    // Track the created cashier ID for cleanup
    if (responseBody.data.cashier_id) {
      createdCashierIds.push(responseBody.data.cashier_id);
    }

    // Step 8: Verify UI updates after successful API response
    // Dialog should close (onSuccess() callback)
    await expect(page.locator('[data-testid="cashier-name"]')).toBeHidden({
      timeout: 20000,
    });

    // Toast notification should appear (use exact match to avoid matching screen reader text)
    await expect(
      page.getByText("Cashier created", { exact: true }),
    ).toBeVisible({
      timeout: 10000,
    });

    // Ensure there's no validation error for store
    await expect(page.locator("text=Store is required")).not.toBeVisible();

    // Verify we're still on the cashiers page
    expect(page.url()).toContain("/client-dashboard/cashiers");

    // Verify the page header is visible (indicates page is in valid state)
    await expect(page.locator("text=Cashiers").first()).toBeVisible();

    // Step 9: Verify cashier was actually created in the database
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
    const cashierName = `E2E Validation Test ${Date.now()}`;
    const nameInput = page.locator('[data-testid="cashier-name"]');
    await nameInput.click();
    await nameInput.fill(cashierName);

    const pinInput = page.locator('[data-testid="cashier-pin"]');
    await pinInput.click();
    await pinInput.fill("5678");

    // Step 5: Submit form using Promise.all pattern (network-first)
    const createButton = page.locator('[data-testid="submit-cashier"]');
    await expect(createButton).toBeVisible({ timeout: 5000 });

    const [createResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response
            .url()
            .includes(`/api/stores/${testStore.store_id}/cashiers`) &&
          response.request().method() === "POST",
        { timeout: 15000 },
      ),
      createButton.click(),
    ]);

    // Step 6: Verify no store validation error appears
    // The key assertion: store should NOT show validation error
    await expect(page.locator("text=Store is required")).not.toBeVisible({
      timeout: 5000,
    });

    // Step 7: Verify API response (201 means store value was properly submitted)
    expect(createResponse.status()).toBe(201);
    const responseBody = await createResponse.json();
    expect(responseBody.success).toBe(true);
    expect(responseBody.data.store_id).toBe(testStore.store_id);

    // Track for cleanup
    if (responseBody.data.cashier_id) {
      createdCashierIds.push(responseBody.data.cashier_id);
    }

    // Step 8: Verify dialog closes (success state)
    await expect(page.locator('[data-testid="cashier-name"]')).toBeHidden({
      timeout: 20000,
    });
  });
});
