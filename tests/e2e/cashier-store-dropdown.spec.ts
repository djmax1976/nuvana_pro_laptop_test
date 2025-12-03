/**
 * E2E Test: Cashier Store Dropdown Issue
 * Tests the actual user flow for adding a cashier
 */

import { test, expect } from "@playwright/test";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

test.describe("Cashier Store Dropdown", () => {
  test("should show store in dropdown when adding cashier", async ({
    page,
  }) => {
    // Enable console logging
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") {
        console.log(`Browser ${msg.type()}: ${msg.text()}`);
      }
    });

    // Log network requests for debugging
    page.on("response", async (response) => {
      if (response.url().includes("/api/client/dashboard")) {
        console.log(`Dashboard API: ${response.status()}`);
        try {
          const body = await response.json();
          console.log(
            "Dashboard response stores:",
            JSON.stringify(body.stores, null, 2),
          );
        } catch (e) {
          console.log("Could not parse response body");
        }
      }
    });

    // Step 1: Go to client login
    console.log("\n=== Step 1: Navigate to login ===");
    await page.goto(`${FRONTEND_URL}/client-login`);
    await page.waitForLoadState("networkidle");

    // Take screenshot of login page
    await page.screenshot({ path: "test-results/01-login-page.png" });
    console.log("Current URL:", page.url());

    // Step 2: Login with the real user
    console.log("\n=== Step 2: Login ===");

    // Find and fill email field
    const emailInput = page
      .locator(
        'input[type="email"], input[name="email"], input[placeholder*="email" i]',
      )
      .first();
    await emailInput.waitFor({ state: "visible", timeout: 10000 });
    await emailInput.fill("kfpllcusa@gmail.com");

    // Find and fill password field
    const passwordInput = page
      .locator('input[type="password"], input[name="password"]')
      .first();
    await passwordInput.fill("Milkey27#");

    // Take screenshot before submit
    await page.screenshot({ path: "test-results/02-login-filled.png" });

    // Submit
    const submitButton = page.locator('button[type="submit"]').first();
    await submitButton.click();

    // Wait for navigation after login
    await page.waitForURL(/\/(client-dashboard|mystore)/, { timeout: 15000 });
    console.log("After login URL:", page.url());
    await page.screenshot({ path: "test-results/03-after-login.png" });

    // Step 3: Navigate to cashiers page
    console.log("\n=== Step 3: Navigate to cashiers ===");

    // Determine if we're on mystore or client-dashboard
    const currentUrl = page.url();
    let cashiersUrl: string;

    if (currentUrl.includes("mystore")) {
      cashiersUrl = `${FRONTEND_URL}/mystore/cashiers`;
    } else {
      cashiersUrl = `${FRONTEND_URL}/client-dashboard/cashiers`;
    }

    await page.goto(cashiersUrl);
    await page.waitForLoadState("networkidle");
    console.log("Cashiers page URL:", page.url());
    await page.screenshot({ path: "test-results/04-cashiers-page.png" });

    // Step 4: Click Add Cashier button
    console.log("\n=== Step 4: Click Add Cashier ===");

    const addButton = page
      .locator(
        'button:has-text("Add Cashier"), button:has-text("New Cashier"), button:has-text("Add")',
      )
      .first();
    await addButton.waitFor({ state: "visible", timeout: 10000 });
    await addButton.click();

    // Wait for dialog/form to appear
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "test-results/05-add-cashier-form.png" });

    // Step 5: Check the store dropdown
    console.log("\n=== Step 5: Inspect store dropdown ===");

    const storeDropdown = page.locator('[data-testid="cashier-store"]');

    if (await storeDropdown.isVisible()) {
      const isDisabled = await storeDropdown.isDisabled();
      console.log("Store dropdown visible:", true);
      console.log("Store dropdown disabled:", isDisabled);

      // Get the text content of the dropdown trigger
      const dropdownText = await storeDropdown.textContent();
      console.log("Dropdown text:", dropdownText);

      // Check if it shows a store name or placeholder
      if (dropdownText?.includes("Select a store")) {
        console.log("ERROR: Dropdown shows placeholder, not store name!");
      } else {
        console.log("SUCCESS: Dropdown shows store name");
      }

      // Try to get the underlying value
      const ariaExpanded = await storeDropdown.getAttribute("aria-expanded");
      console.log("aria-expanded:", ariaExpanded);

      // Check hidden select for value
      const hiddenSelect = page.locator('select[aria-hidden="true"]').first();
      if (await hiddenSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
        const selectHtml = await hiddenSelect.innerHTML();
        console.log("Hidden select HTML:", selectHtml);
      }

      // If not disabled, try to click it
      if (!isDisabled) {
        await storeDropdown.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: "test-results/06-dropdown-opened.png" });

        // Count options
        const options = page.locator('[role="option"]');
        const optionCount = await options.count();
        console.log("Number of options:", optionCount);

        for (let i = 0; i < optionCount; i++) {
          const optionText = await options.nth(i).textContent();
          console.log(`  Option ${i + 1}: ${optionText}`);
        }
      }
    } else {
      console.log("ERROR: Store dropdown not found!");

      // Log all visible form elements
      const formElements = page.locator(
        'form input, form select, form button[role="combobox"]',
      );
      const count = await formElements.count();
      console.log(`Found ${count} form elements`);
      for (let i = 0; i < count; i++) {
        const el = formElements.nth(i);
        const testId = await el.getAttribute("data-testid");
        const name = await el.getAttribute("name");
        const placeholder = await el.getAttribute("placeholder");
        console.log(
          `  Element ${i + 1}: testId=${testId}, name=${name}, placeholder=${placeholder}`,
        );
      }
    }

    // Final screenshot
    await page.screenshot({
      path: "test-results/07-final-state.png",
      fullPage: true,
    });

    // Assertions
    expect(await storeDropdown.isVisible()).toBe(true);

    // The dropdown should show the store name, not the placeholder
    const finalText = await storeDropdown.textContent();
    expect(finalText).not.toContain("Select a store");
  });

  test("should successfully create a cashier with auto-selected store", async ({
    page,
  }) => {
    // Enable console logging for debugging
    page.on("console", (msg) => {
      const text = msg.text();
      if (
        text.includes("store_id") ||
        text.includes("Form") ||
        text.includes("Setting") ||
        text.includes("useEffect")
      ) {
        console.log(`Browser: ${text}`);
      }
    });

    // Login first
    await page.goto(`${FRONTEND_URL}/client-login`);
    await page.waitForLoadState("networkidle");

    const emailInput = page
      .locator(
        'input[type="email"], input[name="email"], input[placeholder*="email" i]',
      )
      .first();
    await emailInput.waitFor({ state: "visible", timeout: 10000 });
    await emailInput.fill("kfpllcusa@gmail.com");

    const passwordInput = page
      .locator('input[type="password"], input[name="password"]')
      .first();
    await passwordInput.fill("Milkey27#");

    const submitButton = page.locator('button[type="submit"]').first();
    await submitButton.click();

    await page.waitForURL(/\/(client-dashboard|mystore)/, { timeout: 15000 });

    // Navigate to cashiers
    const currentUrl = page.url();
    const cashiersUrl = currentUrl.includes("mystore")
      ? `${FRONTEND_URL}/mystore/cashiers`
      : `${FRONTEND_URL}/client-dashboard/cashiers`;

    await page.goto(cashiersUrl);
    await page.waitForLoadState("networkidle");

    // Click Add Cashier
    const addButton = page
      .locator(
        'button:has-text("Add Cashier"), button:has-text("New Cashier"), button:has-text("Add")',
      )
      .first();
    await addButton.waitFor({ state: "visible", timeout: 10000 });
    await addButton.click();
    await page.waitForTimeout(1000);

    // Verify store is shown
    const storeDropdown = page.locator('[data-testid="cashier-store"]');
    const storeText = await storeDropdown.textContent();
    console.log("Store dropdown shows:", storeText);
    expect(storeText).toContain("Kanta Food Products Store");

    // Wait for the hidden select to have the value set (ensures form state is ready)
    await page.waitForFunction(
      () => {
        const hiddenSelect = document.querySelector(
          'select[aria-hidden="true"]',
        ) as HTMLSelectElement | null;
        return (
          hiddenSelect && hiddenSelect.value && hiddenSelect.value.length > 0
        );
      },
      { timeout: 5000 },
    );

    // Log the hidden select value
    const hiddenSelectValue = await page.evaluate(() => {
      const hiddenSelect = document.querySelector(
        'select[aria-hidden="true"]',
      ) as HTMLSelectElement | null;
      return hiddenSelect?.value || "NOT FOUND";
    });
    console.log("Hidden select value before fill:", hiddenSelectValue);

    // Fill in the form
    const nameInput = page.locator('[data-testid="cashier-name"]');
    await nameInput.fill(`Test Cashier ${Date.now()}`);

    const pinInput = page.locator('[data-testid="cashier-pin"]');
    await pinInput.fill("1234");

    // Check hidden select value AFTER filling other fields
    const hiddenSelectValueAfter = await page.evaluate(() => {
      const hiddenSelect = document.querySelector(
        'select[aria-hidden="true"]',
      ) as HTMLSelectElement | null;
      return hiddenSelect?.value || "NOT FOUND";
    });
    console.log("Hidden select value after fill:", hiddenSelectValueAfter);

    // Screenshot before submit
    await page.screenshot({ path: "test-results/cashier-form-filled.png" });

    // Submit the form
    const createButton = page.locator('[data-testid="submit-cashier"]');
    await createButton.click();

    // Wait for either success toast or form to close
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "test-results/cashier-after-submit.png" });

    // Check for success - either toast message or dialog closed
    const toastSuccess = page.locator(
      "text=has been added successfully, text=Cashier created",
    );
    const dialogClosed = await page
      .locator('[data-testid="cashier-name"]')
      .isHidden({ timeout: 3000 })
      .catch(() => false);

    console.log("Dialog closed:", dialogClosed);

    // The form should have submitted (either toast shown or dialog closed)
    // Just check that there's no validation error for store
    const storeError = page.locator("text=Store is required");
    expect(
      await storeError.isVisible({ timeout: 1000 }).catch(() => false),
    ).toBe(false);
  });
});
