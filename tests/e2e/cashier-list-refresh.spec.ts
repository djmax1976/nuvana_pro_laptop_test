/**
 * E2E Test: Cashier List Refresh After Create
 *
 * Tests that the cashier list properly refreshes after creating a new cashier.
 * This test uses the actual user account to reproduce the reported bug.
 *
 * Bug: After adding a cashier in client dashboard, the page doesn't refresh
 * and show the new cashier - user has to manually refresh the page.
 *
 * IMPORTANT: This test requires a real user account with stores and cashier access.
 * It is SKIPPED by default in CI. To run locally:
 *
 *   CASHIER_REFRESH_TEST=true npm run test:e2e -- tests/e2e/cashier-list-refresh.spec.ts
 *
 * You can also override credentials via environment variables:
 *   TEST_CLIENT_EMAIL=your@email.com TEST_CLIENT_PASSWORD=yourpassword CASHIER_REFRESH_TEST=true npm run test:e2e -- tests/e2e/cashier-list-refresh.spec.ts
 */

import { test, expect } from "@playwright/test";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// Test credentials - use environment variables or defaults for manual testing
const TEST_EMAIL = process.env.TEST_CLIENT_EMAIL || "kfpllcusa@gmail.com";
const TEST_PASSWORD = process.env.TEST_CLIENT_PASSWORD || "Milkey27#";

// Skip this test unless CASHIER_REFRESH_TEST=true is set
// This test requires a real user account that doesn't exist in the test database
const shouldRunTest = process.env.CASHIER_REFRESH_TEST === "true";

test.describe("4.9-E2E: Cashier List Refresh After Create", () => {
  // Skip entire suite unless explicitly enabled
  test.skip(
    !shouldRunTest,
    "Skipped: Set CASHIER_REFRESH_TEST=true to run this test with real credentials",
  );

  test("should show new cashier in list immediately after creation without page refresh", async ({
    page,
  }) => {
    // Track network requests for cache invalidation verification
    const apiRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/api/") && !url.includes("_next")) {
        apiRequests.push(`${request.method()} ${url}`);
      }
    });

    // Step 1: Navigate to client login
    await page.goto(`${FRONTEND_URL}/client-login`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});

    // Step 2: Login
    const emailInput = page
      .locator('input[type="email"], input[name="email"]')
      .first();
    await emailInput.waitFor({ state: "visible", timeout: 15000 });
    await emailInput.fill(TEST_EMAIL);

    const passwordInput = page
      .locator('input[type="password"], input[name="password"]')
      .first();
    await passwordInput.fill(TEST_PASSWORD);

    // Set up navigation promise before clicking submit
    const navigationPromise = page.waitForURL(/.*client-dashboard.*/, {
      timeout: 30000,
      waitUntil: "domcontentloaded",
    });

    const submitButton = page.locator('button[type="submit"]').first();
    await submitButton.click();

    await navigationPromise;
    await page
      .waitForLoadState("networkidle", { timeout: 15000 })
      .catch(() => {});

    // Step 3: Navigate to cashiers page
    await page.goto(`${FRONTEND_URL}/client-dashboard/cashiers`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .waitForLoadState("networkidle", { timeout: 15000 })
      .catch(() => {});

    // Wait for page to be fully loaded
    await page.waitForSelector(
      '[data-testid="create-cashier-btn"], [data-testid="cashier-search"]',
      { timeout: 15000, state: "visible" },
    );

    // Take screenshot before creating cashier
    await page.screenshot({ path: "test-results/cashier-list-before.png" });

    // Get current cashier count
    const initialRows = await page
      .locator('tr[data-testid^="cashier-row-"]')
      .count();

    // Clear API request log before opening dialog
    apiRequests.length = 0;

    // Step 4: Open Add Cashier dialog
    const addButton = page
      .locator('[data-testid="create-cashier-btn"]')
      .first();
    await addButton.click();

    // Wait for dialog
    await page.waitForSelector("text=Add New Cashier", {
      state: "visible",
      timeout: 10000,
    });

    // Wait for form to be ready
    await page
      .locator('[data-testid="cashier-store"]')
      .waitFor({ state: "visible", timeout: 15000 });

    // Wait for stores to load and check if store is auto-selected
    // The form shows a loading spinner while fetching stores
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});

    // Check if store dropdown has a value or shows placeholder
    const storeDropdown = page.locator('[data-testid="cashier-store"]');
    const storeDropdownText = await storeDropdown.textContent();

    // If store shows "Select a store" placeholder, we need to select one
    if (storeDropdownText?.includes("Select a store")) {
      await storeDropdown.click();

      // Wait for dropdown content to appear
      await page.waitForSelector('[role="option"]', {
        state: "visible",
        timeout: 5000,
      });

      // Select the first store
      const firstOption = page.locator('[role="option"]').first();
      await firstOption.click();

      // Wait for dropdown to close
      await page.waitForTimeout(500);
    }

    // Step 5: Fill in form - "cashier 4" with PIN "0829"
    const cashierName = "cashier 4";
    const nameInput = page.locator('[data-testid="cashier-name"]');
    await nameInput.fill(cashierName);

    const pinInput = page.locator('[data-testid="cashier-pin"]');
    await pinInput.fill("0829");

    apiRequests.length = 0;

    // Step 6: Submit the form
    const createButton = page.locator('[data-testid="submit-cashier"]');

    // Watch for the cashier create POST request
    const createResponsePromise = page
      .waitForResponse(
        (response) =>
          response.url().includes("/api/stores/") &&
          response.url().includes("/cashiers") &&
          response.request().method() === "POST",
        { timeout: 15000 },
      )
      .catch(() => null);

    // Watch for the cashier list to update (GET after POST)
    const listRefetchPromise = page
      .waitForResponse(
        (response) =>
          response.url().includes("/api/stores/") &&
          response.url().includes("/cashiers") &&
          response.request().method() === "GET",
        { timeout: 15000 },
      )
      .catch(() => null);

    await createButton.click();

    // Wait a moment for any validation errors to appear
    await page.waitForTimeout(1000);

    // Wait for POST to complete
    await createResponsePromise;

    // Wait for success toast
    await page
      .waitForSelector("text=Cashier created", {
        state: "visible",
        timeout: 10000,
      })
      .catch(() => {});

    // Wait for dialog to close
    await page
      .waitForSelector('[data-testid="cashier-name"]', {
        state: "hidden",
        timeout: 10000,
      })
      .catch(() => {});

    // Wait for list refetch
    await listRefetchPromise;

    // Give React a moment to update the UI
    await page.waitForTimeout(2000);

    // Take screenshot after creating cashier
    await page.screenshot({ path: "test-results/cashier-list-after.png" });

    // Step 7: CRITICAL - Verify the new cashier appears WITHOUT manual refresh
    // Look for the new cashier in the list
    const newCashierRow = page.locator(`text=${cashierName}`).first();

    // This is the bug: the new cashier should be visible without refresh
    const isVisible = await newCashierRow
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    // Get final cashier count
    const finalRows = await page
      .locator('tr[data-testid^="cashier-row-"]')
      .count();

    // The assertion - this should pass if the fix works
    expect(isVisible).toBe(true);
    expect(finalRows).toBeGreaterThan(initialRows);
  });
});
