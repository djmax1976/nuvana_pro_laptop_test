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
    // Enable console logging for debugging
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") {
        console.log(`Browser ${msg.type()}: ${msg.text()}`);
      }
    });

    // Step 1: Navigate to client login
    await page.goto(`${FRONTEND_URL}/client-login`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "test-results/01-login-page.png" });

    // Step 2: Login
    const emailInput = page
      .locator(
        'input[type="email"], input[name="email"], input[placeholder*="email" i]',
      )
      .first();
    await emailInput.waitFor({ state: "visible", timeout: 10000 });
    await emailInput.fill(testEmail);

    const passwordInput = page
      .locator('input[type="password"], input[name="password"]')
      .first();
    await passwordInput.fill(TEST_PASSWORD);

    await page.screenshot({ path: "test-results/02-login-filled.png" });

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
    await page.screenshot({ path: "test-results/03-after-login.png" });

    // Step 3: Navigate to cashiers page
    await page.goto(`${FRONTEND_URL}/client-dashboard/cashiers`);

    // Wait for the page to load and dashboard API to complete
    await page.waitForLoadState("networkidle");

    // Wait for the cashier list to be visible (ensures page is fully loaded)
    await page.waitForSelector(
      '[data-testid="create-cashier-btn"], [data-testid="cashier-search"]',
      {
        timeout: 10000,
      },
    );

    await page.screenshot({ path: "test-results/04-cashiers-page.png" });

    // Step 4: Open Add Cashier dialog
    const addButton = page
      .locator('[data-testid="create-cashier-btn"]')
      .first();
    await addButton.waitFor({ state: "visible", timeout: 10000 });
    await addButton.click();

    // Wait for dialog to be visible and form to be ready
    // The form shows a loading state while fetching stores, so wait for it to disappear
    await page.waitForSelector('[data-testid="cashier-store"]', {
      state: "visible",
      timeout: 10000,
    });

    // Wait for form to be fully loaded (not in loading state)
    // The loading spinner is removed when stores are loaded
    await page.waitForSelector("text=Add New Cashier", { state: "visible" });

    // Additional wait to ensure form state is ready
    await page.waitForFunction(
      () => {
        const storeDropdown = document.querySelector(
          '[data-testid="cashier-store"]',
        );
        return storeDropdown !== null;
      },
      { timeout: 5000 },
    );

    await page.screenshot({ path: "test-results/05-add-cashier-form.png" });

    // Step 5: Verify store dropdown behavior
    const storeDropdown = page.locator('[data-testid="cashier-store"]');

    // Assert dropdown is visible
    await expect(storeDropdown).toBeVisible({ timeout: 5000 });

    // When there's only one store, the dropdown should be disabled (per implementation)
    const isDisabled = await storeDropdown.isDisabled();
    expect(isDisabled).toBe(true);

    // Get the displayed text - should show the store name, not placeholder
    const dropdownText = await storeDropdown.textContent();
    expect(dropdownText).toBeTruthy();
    expect(dropdownText).not.toContain("Select a store");
    expect(dropdownText).toContain(testStore.name);

    // Verify the hidden select has the correct value
    const hiddenSelectValue = await page.evaluate(() => {
      const hiddenSelect = document.querySelector(
        'select[aria-hidden="true"]',
      ) as HTMLSelectElement | null;
      return hiddenSelect?.value || null;
    });

    expect(hiddenSelectValue).toBe(testStore.store_id);

    await page.screenshot({
      path: "test-results/06-store-dropdown-verified.png",
    });

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
    // Step 1: Login
    await page.goto(`${FRONTEND_URL}/client-login`);
    await page.waitForLoadState("networkidle");

    const emailInput = page
      .locator(
        'input[type="email"], input[name="email"], input[placeholder*="email" i]',
      )
      .first();
    await emailInput.waitFor({ state: "visible", timeout: 10000 });
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
    await page.goto(`${FRONTEND_URL}/client-dashboard/cashiers`);
    await page.waitForLoadState("networkidle");

    // Wait for page to be fully loaded
    await page.waitForSelector(
      '[data-testid="create-cashier-btn"], [data-testid="cashier-search"]',
      {
        timeout: 10000,
      },
    );

    // Step 3: Open Add Cashier dialog
    const addButton = page
      .locator('[data-testid="create-cashier-btn"]')
      .first();
    await addButton.waitFor({ state: "visible", timeout: 10000 });
    await addButton.click();

    // Wait for dialog and form to be ready (form shows loading state initially)
    await page.waitForSelector('[data-testid="cashier-store"]', {
      state: "visible",
      timeout: 10000,
    });

    // Wait for form to be fully loaded (not in loading state)
    await page.waitForSelector("text=Add New Cashier", { state: "visible" });

    // Wait for store dropdown to have the correct value set
    await page.waitForFunction(
      (storeId) => {
        const hiddenSelect = document.querySelector(
          'select[aria-hidden="true"]',
        ) as HTMLSelectElement | null;
        return hiddenSelect?.value === storeId;
      },
      testStore.store_id,
      { timeout: 5000 },
    );

    // Step 4: Verify store is auto-selected and displayed
    const storeDropdown = page.locator('[data-testid="cashier-store"]');
    await expect(storeDropdown).toBeVisible();

    const storeText = await storeDropdown.textContent();
    expect(storeText).toContain(testStore.name);
    expect(storeText).not.toContain("Select a store");

    // Verify dropdown is disabled (single store behavior)
    expect(await storeDropdown.isDisabled()).toBe(true);

    // Verify hidden select has correct value
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
    await nameInput.waitFor({ state: "visible", timeout: 5000 });
    await nameInput.fill(cashierName);

    const pinInput = page.locator('[data-testid="cashier-pin"]');
    await pinInput.waitFor({ state: "visible", timeout: 5000 });
    await pinInput.fill("1234");

    // Verify store value is still set after filling other fields
    const hiddenSelectValueAfter = await page.evaluate(() => {
      const hiddenSelect = document.querySelector(
        'select[aria-hidden="true"]',
      ) as HTMLSelectElement | null;
      return hiddenSelect?.value || null;
    });
    expect(hiddenSelectValueAfter).toBe(testStore.store_id);

    await page.screenshot({ path: "test-results/cashier-form-filled.png" });

    // Step 6: Submit the form
    const createButton = page.locator('[data-testid="submit-cashier"]');
    await createButton.waitFor({ state: "visible", timeout: 5000 });
    await createButton.click();

    // Step 7: Wait for success - either toast message appears or dialog closes
    // The toast has title "Cashier created" and description "{name} has been added successfully."
    const toastTitle = page.locator("text=Cashier created");
    const toastDescription = page.locator(
      `text=${cashierName} has been added successfully.`,
    );

    // Wait for either toast to appear or dialog to close
    // Using Promise.any so the first successful wait wins
    // If all conditions fail, the test will fail with an AggregateError
    try {
      await Promise.any([
        toastTitle.waitFor({ state: "visible", timeout: 5000 }),
        toastDescription.waitFor({ state: "visible", timeout: 5000 }),
        page.waitForSelector('[data-testid="cashier-name"]', {
          state: "hidden",
          timeout: 5000,
        }),
      ]);
    } catch (error) {
      throw new Error(
        `None of the expected success conditions occurred: toast title, toast description, or dialog closure. Original error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await page.screenshot({ path: "test-results/cashier-after-submit.png" });

    // Verify success - check for toast or dialog closure
    let toastTitleVisible = false;
    try {
      await toastTitle.waitFor({ state: "visible", timeout: 2000 });
      toastTitleVisible = true;
    } catch {
      toastTitleVisible = false;
    }

    let toastDescVisible = false;
    try {
      await toastDescription.waitFor({ state: "visible", timeout: 2000 });
      toastDescVisible = true;
    } catch {
      toastDescVisible = false;
    }

    let dialogClosed = false;
    try {
      await page
        .locator('[data-testid="cashier-name"]')
        .waitFor({ state: "hidden", timeout: 2000 });
      dialogClosed = true;
    } catch {
      dialogClosed = false;
    }

    // At least one success indicator should be present
    expect(toastTitleVisible || toastDescVisible || dialogClosed).toBe(true);

    // Ensure there's no validation error for store
    const storeError = page.locator("text=Store is required");
    let hasStoreError = false;
    try {
      await storeError.waitFor({ state: "visible", timeout: 1000 });
      hasStoreError = true;
    } catch {
      hasStoreError = false;
    }
    expect(hasStoreError).toBe(false);

    // Verify the form submission was successful by checking the store value was preserved
    // If dialog is still open, verify store is still selected
    if (!dialogClosed) {
      const finalStoreValue = await page.evaluate(() => {
        const hiddenSelect = document.querySelector(
          'select[aria-hidden="true"]',
        ) as HTMLSelectElement | null;
        return hiddenSelect?.value || null;
      });
      expect(finalStoreValue).toBe(testStore.store_id);
    }
  });
});
