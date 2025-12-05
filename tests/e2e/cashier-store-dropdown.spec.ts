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
 * - Store dropdown is disabled when stores.length === 1 (line 252 in CashierForm.tsx)
 * - Store is auto-selected when stores.length === 1 (line 109 in CashierForm.tsx)
 * - Form shows loading state while fetching stores (lines 147-153)
 * - Toast message: title "Cashier created", description "{name} has been added successfully."
 */

import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import * as path from "path";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";
import { cleanupTestData } from "../support/cleanup-helper";
import { createStore, createCompany } from "../support/factories";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

const prisma = new PrismaClient();
const TEST_PASSWORD = "TestPassword123!";

let testUser: any;
let testCompany: any;
let testStore: any;
let testEmail: string;

/**
 * Helper function to ensure screenshot directory exists
 */
function ensureScreenshotDir() {
  const screenshotDir = path.join(process.cwd(), "test-results");
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }
}

/**
 * Helper function to wait for stores to load in the form
 * The form shows a loading spinner while isLoadingStores is true
 */
async function waitForStoresLoaded(page: any) {
  // Wait for the loading spinner to disappear (if it exists)
  // The form shows a Loader2 spinner while fetching stores
  await page
    .locator('[data-testid="cashier-store"]')
    .waitFor({ state: "visible", timeout: 15000 });

  // Wait for network to be idle to ensure API calls completed
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {
    // networkidle might timeout, continue with selector-based waiting
  });

  // Wait for the hidden select to have a value (indicates form is initialized)
  await page.waitForFunction(
    () => {
      const hiddenSelect = document.querySelector(
        'select[aria-hidden="true"]',
      ) as HTMLSelectElement | null;
      return hiddenSelect !== null && hiddenSelect.value !== "";
    },
    { timeout: 10000 },
  );
}

test.describe("Cashier Store Dropdown", () => {
  test.beforeAll(async () => {
    // Clean up any existing test data
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

    // Create test client user
    testEmail = `cashier-e2e-${Date.now()}@test.com`;
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

    testUser = await prisma.user.create({
      data: {
        user_id: uuidv4(),
        email: testEmail,
        name: "Cashier E2E Test Client",
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

    // Create test store
    testStore = await prisma.store.create({
      data: createStore({
        company_id: testCompany.company_id,
        name: "Kanta Food Products Store",
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
  });

  test.afterAll(async () => {
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
    ensureScreenshotDir();

    // Enable console logging for debugging
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") {
        console.log(`Browser ${msg.type()}: ${msg.text()}`);
      }
    });

    // Step 1: Navigate to client login
    await page.goto(`${FRONTEND_URL}/client-login`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {
      // Continue if networkidle times out
    });

    // Step 2: Login
    const emailInput = page
      .locator(
        'input[type="email"], input[name="email"], input[placeholder*="email" i]',
      )
      .first();
    await emailInput.waitFor({ state: "visible", timeout: 15000 });
    await emailInput.fill(testEmail);

    const passwordInput = page
      .locator('input[type="password"], input[name="password"]')
      .first();
    await passwordInput.fill(TEST_PASSWORD);

    // Set up navigation promise BEFORE clicking submit (order matters)
    const navigationPromise = page.waitForURL(/.*client-dashboard.*/, {
      timeout: 30000,
      waitUntil: "domcontentloaded",
    });

    const submitButton = page.locator('button[type="submit"]').first();
    await submitButton.click();

    // Wait for navigation to complete
    await navigationPromise;

    // Wait for page to be fully loaded (including auth context validation)
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {
      // networkidle might timeout if there are long-polling requests, that's OK
    });

    // Step 3: Navigate to cashiers page
    await page.goto(`${FRONTEND_URL}/client-dashboard/cashiers`, {
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

    // Step 4: Open Add Cashier dialog
    const addButton = page
      .locator('[data-testid="create-cashier-btn"]')
      .first();
    await addButton.waitFor({ state: "visible", timeout: 15000 });
    await addButton.click();

    // Wait for dialog to be visible
    await page.waitForSelector("text=Add New Cashier", {
      state: "visible",
      timeout: 10000,
    });

    // Wait for stores to load - this ensures the form is fully initialized
    await waitForStoresLoaded(page);

    // Step 5: Verify store dropdown behavior
    const storeDropdown = page.locator('[data-testid="cashier-store"]');

    // Assert dropdown is visible
    await expect(storeDropdown).toBeVisible({ timeout: 10000 });

    // When there's only one store, the dropdown should be disabled (per implementation)
    const isDisabled = await storeDropdown.isDisabled();
    expect(isDisabled).toBe(true);

    // Get the displayed text - should show the store name, not placeholder
    // Wait for the text to contain the store name (form might still be initializing)
    await expect(storeDropdown).toContainText(testStore.name, {
      timeout: 10000,
    });

    const dropdownText = await storeDropdown.textContent();
    expect(dropdownText).toBeTruthy();
    expect(dropdownText).not.toContain("Select a store");
    expect(dropdownText).toContain(testStore.name);

    // Verify the hidden select has the correct value
    // Wait for the value to be set (form initialization might be async)
    await page.waitForFunction(
      (expectedStoreId) => {
        const hiddenSelect = document.querySelector(
          'select[aria-hidden="true"]',
        ) as HTMLSelectElement | null;
        return hiddenSelect?.value === expectedStoreId;
      },
      testStore.store_id,
      { timeout: 10000 },
    );

    const hiddenSelectValue = await page.evaluate(() => {
      const hiddenSelect = document.querySelector(
        'select[aria-hidden="true"]',
      ) as HTMLSelectElement | null;
      return hiddenSelect?.value || null;
    });

    expect(hiddenSelectValue).toBe(testStore.store_id);

    // Final assertions
    expect(await storeDropdown.isVisible()).toBe(true);
    expect(await storeDropdown.isDisabled()).toBe(true);

    const finalText = await storeDropdown.textContent();
    expect(finalText).toContain(testStore.name);
    expect(finalText).not.toContain("Select a store");
  });

  test("should successfully create a cashier with auto-selected store", async ({
    page,
  }) => {
    ensureScreenshotDir();

    // Step 1: Login
    await page.goto(`${FRONTEND_URL}/client-login`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {
      // Continue if networkidle times out
    });

    const emailInput = page
      .locator(
        'input[type="email"], input[name="email"], input[placeholder*="email" i]',
      )
      .first();
    await emailInput.waitFor({ state: "visible", timeout: 15000 });
    await emailInput.fill(testEmail);

    const passwordInput = page
      .locator('input[type="password"], input[name="password"]')
      .first();
    await passwordInput.fill(TEST_PASSWORD);

    // Set up navigation promise BEFORE clicking submit (order matters)
    const navigationPromise = page.waitForURL(/.*client-dashboard.*/, {
      timeout: 30000,
      waitUntil: "domcontentloaded",
    });

    const submitButton = page.locator('button[type="submit"]').first();
    await submitButton.click();

    // Wait for navigation to complete
    await navigationPromise;

    // Wait for page to be fully loaded (including auth context validation)
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {
      // networkidle might timeout if there are long-polling requests, that's OK
    });

    // Step 2: Navigate to cashiers page
    await page.goto(`${FRONTEND_URL}/client-dashboard/cashiers`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {
      // Continue if networkidle times out
    });

    // Wait for page to be fully loaded
    await page.waitForSelector(
      '[data-testid="create-cashier-btn"], [data-testid="cashier-search"]',
      {
        timeout: 15000,
        state: "visible",
      },
    );

    // Step 3: Open Add Cashier dialog
    const addButton = page
      .locator('[data-testid="create-cashier-btn"]')
      .first();
    await addButton.waitFor({ state: "visible", timeout: 15000 });
    await addButton.click();

    // Wait for dialog to be visible
    await page.waitForSelector("text=Add New Cashier", {
      state: "visible",
      timeout: 10000,
    });

    // Wait for stores to load - this ensures the form is fully initialized
    await waitForStoresLoaded(page);

    // Step 4: Verify store is auto-selected and displayed
    const storeDropdown = page.locator('[data-testid="cashier-store"]');
    await expect(storeDropdown).toBeVisible({ timeout: 10000 });

    // Wait for the store name to appear in the dropdown
    await expect(storeDropdown).toContainText(testStore.name, {
      timeout: 10000,
    });

    const storeText = await storeDropdown.textContent();
    expect(storeText).toContain(testStore.name);
    expect(storeText).not.toContain("Select a store");

    // Verify dropdown is disabled (single store behavior)
    expect(await storeDropdown.isDisabled()).toBe(true);

    // Verify hidden select has correct value
    await page.waitForFunction(
      (expectedStoreId) => {
        const hiddenSelect = document.querySelector(
          'select[aria-hidden="true"]',
        ) as HTMLSelectElement | null;
        return hiddenSelect?.value === expectedStoreId;
      },
      testStore.store_id,
      { timeout: 10000 },
    );

    const hiddenSelectValue = await page.evaluate(() => {
      const hiddenSelect = document.querySelector(
        'select[aria-hidden="true"]',
      ) as HTMLSelectElement | null;
      return hiddenSelect?.value || null;
    });
    expect(hiddenSelectValue).toBe(testStore.store_id);

    // Step 5: Fill in the form
    const cashierName = `Test Cashier ${Date.now()}`;
    const nameInput = page.locator('[data-testid="cashier-name"]');
    await nameInput.waitFor({ state: "visible", timeout: 10000 });
    await nameInput.fill(cashierName);

    const pinInput = page.locator('[data-testid="cashier-pin"]');
    await pinInput.waitFor({ state: "visible", timeout: 10000 });
    await pinInput.fill("1234");

    // Verify store value is still set after filling other fields
    const hiddenSelectValueAfter = await page.evaluate(() => {
      const hiddenSelect = document.querySelector(
        'select[aria-hidden="true"]',
      ) as HTMLSelectElement | null;
      return hiddenSelect?.value || null;
    });
    expect(hiddenSelectValueAfter).toBe(testStore.store_id);

    // Step 6: Submit the form
    const createButton = page.locator('[data-testid="submit-cashier"]');
    await createButton.waitFor({ state: "visible", timeout: 10000 });

    // Set up promise to wait for dialog closure BEFORE clicking (order matters)
    // The form calls onSuccess() which closes the dialog after successful creation
    const dialogClosePromise = page
      .locator('[data-testid="cashier-name"]')
      .waitFor({ state: "hidden", timeout: 20000 })
      .catch(() => null);

    await createButton.click();

    // Step 7: Wait for success - dialog closure is the primary indicator
    // The toast appears first, then onSuccess() is called which closes the dialog
    // Waiting for dialog closure is more reliable than waiting for toast in CI/CD

    // Wait for dialog to close (primary success indicator)
    await dialogClosePromise;

    // Also check for toast message (may appear briefly before dialog closes)
    const toastTitle = page.locator("text=Cashier created");
    const toastDescription = page.locator(
      `text=${cashierName} has been added successfully.`,
    );

    // Verify success - check for toast or confirm dialog closure
    let toastTitleVisible = false;
    try {
      await toastTitle.waitFor({ state: "visible", timeout: 3000 });
      toastTitleVisible = true;
    } catch {
      // Toast might have already disappeared, that's OK
    }

    let toastDescVisible = false;
    try {
      await toastDescription.waitFor({ state: "visible", timeout: 3000 });
      toastDescVisible = true;
    } catch {
      // Toast might have already disappeared, that's OK
    }

    // Verify dialog is closed (primary success indicator)
    const dialogClosed = await page
      .locator('[data-testid="cashier-name"]')
      .isHidden()
      .catch(() => false);

    // At least one success indicator should be present
    // Dialog closure is the most reliable indicator since onSuccess() is called after toast
    expect(dialogClosed || toastTitleVisible || toastDescVisible).toBe(true);

    // Ensure there's no validation error for store
    const storeError = page.locator("text=Store is required");
    const hasStoreError = await storeError.isVisible().catch(() => false);
    expect(hasStoreError).toBe(false);

    // Verify the page is still in a valid state after dialog closes
    // The dialog closing is the primary success indicator - onSuccess() is only called
    // after successful creation. The cashier list may be refetching, so we just verify
    // the page didn't error out by checking we're still on the cashiers page
    const currentUrl = page.url();
    expect(currentUrl).toContain("/client-dashboard/cashiers");

    // Optional: Verify the page header is visible (indicates page is loaded)
    const pageHeader = page.locator("text=Cashiers").first();
    const headerVisible = await pageHeader.isVisible().catch(() => false);
    expect(headerVisible).toBe(true);
  });
});
