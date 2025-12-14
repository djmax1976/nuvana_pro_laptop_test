/**
 * E2E Test: Cashier List Refresh After Create
 *
 * Tests that the cashier list properly refreshes after creating a new cashier.
 * This test uses the actual user account to reproduce the reported bug.
 *
 * Bug: After adding a cashier in client dashboard, the page doesn't refresh
 * and show the new cashier - user has to manually refresh the page.
 */

import { test, expect } from "@playwright/test";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// Test credentials from user
const TEST_EMAIL = "kfpllcusa@gmail.com";
const TEST_PASSWORD = "Milkey27#";

test.describe("4.9-E2E: Cashier List Refresh After Create", () => {
  test("should show new cashier in list immediately after creation without page refresh", async ({
    page,
  }) => {
    // Enable console logging for debugging
    page.on("console", (msg) => {
      console.log(`Browser ${msg.type()}: ${msg.text()}`);
    });

    // Track network requests to see cache invalidation
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

    console.log("Login successful, navigating to cashiers page...");

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
    console.log(`Initial cashier count: ${initialRows}`);

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
    console.log("Store dropdown text:", storeDropdownText);

    // If store shows "Select a store" placeholder, we need to select one
    if (storeDropdownText?.includes("Select a store")) {
      console.log("Store not auto-selected, clicking to select first store...");
      await storeDropdown.click();

      // Wait for dropdown content to appear
      await page.waitForSelector('[role="option"]', {
        state: "visible",
        timeout: 5000,
      });

      // Select the first store
      const firstOption = page.locator('[role="option"]').first();
      const firstOptionText = await firstOption.textContent();
      console.log("Selecting store:", firstOptionText);
      await firstOption.click();

      // Wait for dropdown to close
      await page.waitForTimeout(500);
    } else {
      console.log("Store already selected:", storeDropdownText);
    }

    // Step 5: Fill in form - "cashier 4" with PIN "0829"
    const cashierName = "cashier 4";
    const nameInput = page.locator('[data-testid="cashier-name"]');
    await nameInput.fill(cashierName);

    const pinInput = page.locator('[data-testid="cashier-pin"]');
    await pinInput.fill("0829");

    console.log("Form filled, submitting...");
    console.log("API requests before submit:", apiRequests);
    apiRequests.length = 0;

    // Step 6: Submit the form
    const createButton = page.locator('[data-testid="submit-cashier"]');

    // Debug: Check if there are any validation errors before submitting
    const formErrors = await page
      .locator('[class*="text-destructive"], [class*="FormMessage"], .text-red')
      .allTextContents();
    console.log("Form validation errors before submit:", formErrors);

    // Debug: Get the store dropdown value
    const storeValue = await page.evaluate(() => {
      const hiddenSelect = document.querySelector(
        'select[aria-hidden="true"]',
      ) as HTMLSelectElement | null;
      return hiddenSelect?.value || "NOT_FOUND";
    });
    console.log("Store dropdown value:", storeValue);

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

    console.log("Clicking submit button...");
    await createButton.click();
    console.log("Submit button clicked");

    // Wait a moment for any validation errors to appear
    await page.waitForTimeout(1000);

    // Check for validation errors after submit
    const formErrorsAfter = await page
      .locator('[class*="text-destructive"], [class*="FormMessage"], .text-red')
      .allTextContents();
    console.log("Form validation errors after submit:", formErrorsAfter);

    // Check if POST was successful
    const createResponse = await createResponsePromise;
    if (createResponse) {
      console.log("Create POST response status:", createResponse.status());
      const responseBody = await createResponse.json().catch(() => null);
      console.log(
        "Create POST response body:",
        JSON.stringify(responseBody, null, 2),
      );
    } else {
      console.log("Create POST response: NOT received");
    }

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

    console.log("Form submitted, API requests after submit:", apiRequests);

    // Wait for list refetch
    const refetchResponse = await listRefetchPromise;
    console.log(
      "List refetch response:",
      refetchResponse ? "received" : "NOT received",
    );

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

    console.log(`New cashier "${cashierName}" visible in list: ${isVisible}`);
    console.log("All API requests during test:", apiRequests);

    // Get final cashier count
    const finalRows = await page
      .locator('tr[data-testid^="cashier-row-"]')
      .count();
    console.log(`Final cashier count: ${finalRows}`);

    // The assertion - this should pass if the fix works
    expect(isVisible).toBe(true);
    expect(finalRows).toBeGreaterThan(initialRows);
  });
});
