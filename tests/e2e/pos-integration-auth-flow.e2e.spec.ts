/**
 * POS Integration Authentication Flow E2E Tests
 *
 * Tests the step-up authentication flow for POS Integration:
 * 1. CLIENT_USER logs in
 * 2. Clicks POS Integration link (always visible)
 * 3. Auth modal appears
 * 4. User authenticates as someone with POS_SYNC_TRIGGER permission
 * 5. Access granted to POS Integration page
 *
 * Test credentials:
 * - CLIENT_USER: kfpuser@kfp.com / Milkey27#
 * - SUPERADMIN: admin@nuvana.com / Admin123!
 *
 * @module tests/e2e/pos-integration-auth-flow.e2e.spec
 */

import { test, expect, Page } from "@playwright/test";

// Test credentials
const CLIENT_USER = {
  email: "kfpuser@kfp.com",
  password: "Milkey27#",
};

const SUPERADMIN = {
  email: "admin@nuvana.com",
  password: "Admin123!",
};

// Store ID from user's test
const TEST_STORE_ID = "3a9c9d9d-9c81-4e62-b2f3-fdf5ba0b2fe4";

// File paths for Gilbarco test
const GILBARCO_PATH = "c:\\bmad\\my-files\\GILBARCO";

/**
 * Helper: Login as a user
 */
async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  // Fill login form
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();

  // Wait for redirect to dashboard
  await page.waitForURL(/client-dashboard|mystore/, { timeout: 15000 });
}

test.describe("POS Integration Auth Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Clear cookies before each test
    await page.context().clearCookies();
  });

  test("Complete flow: CLIENT_USER → Auth Modal → SUPERADMIN → POS Page → Test Connection", async ({
    page,
  }) => {
    // Enable request/response logging for debugging
    page.on("request", (request) => {
      if (request.url().includes("/api/")) {
        console.log(`>> ${request.method()} ${request.url()}`);
        // Log headers for elevation token debugging
        if (request.url().includes("/pos-integration")) {
          const headers = request.headers();
          console.log(
            `   X-Elevation-Token: ${headers["x-elevation-token"] ? "PRESENT" : "MISSING"}`,
          );
        }
      }
    });
    page.on("response", async (response) => {
      if (
        response.url().includes("/api/") ||
        response.url().includes("localhost:3001")
      ) {
        const status = response.status();
        console.log(`<< ${status} ${response.url()}`);
      }
    });
    page.on("requestfailed", (request) => {
      console.log(
        `!! FAILED ${request.url()}: ${request.failure()?.errorText}`,
      );
    });
    // Log browser console
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        console.log(`[BROWSER ERROR]: ${msg.text()}`);
      }
    });

    // STEP 1: Login as CLIENT_USER
    console.log("\n=== STEP 1: Login as CLIENT_USER ===");
    await loginAs(page, CLIENT_USER.email, CLIENT_USER.password);

    // Verify we're on the dashboard
    await expect(page).toHaveURL(/client-dashboard|mystore/, {
      timeout: 10000,
    });
    console.log("Logged in as CLIENT_USER");

    // STEP 2: Click POS Integration in sidebar
    console.log("\n=== STEP 2: Click POS Integration ===");

    // Wait for sidebar to load
    await page
      .waitForSelector('[data-testid="mystore-sidebar"]', { timeout: 10000 })
      .catch(() => {
        console.log("No sidebar testid, looking for nav");
      });

    // Find and click POS Integration button (it's a button, not a link - opens modal)
    const posButton = page.getByTestId("pos-integration-link");
    await expect(posButton).toBeVisible({ timeout: 10000 });
    console.log("POS Integration button is visible");

    await posButton.click();
    console.log("Clicked POS Integration button");

    // STEP 3: Auth modal should appear
    console.log("\n=== STEP 3: Verify Auth Modal ===");

    // Wait for modal to appear
    const authModal = page
      .getByRole("dialog")
      .or(page.locator('[data-testid="pos-auth-modal"]'));
    await expect(authModal).toBeVisible({ timeout: 10000 });
    console.log("Auth modal appeared");

    // STEP 4: Enter SUPERADMIN credentials
    console.log("\n=== STEP 4: Enter SUPERADMIN credentials ===");

    // Fill email
    const emailInput = authModal
      .getByLabel(/email/i)
      .or(authModal.locator('input[type="email"]'));
    await emailInput.fill(SUPERADMIN.email);
    console.log(`Entered email: ${SUPERADMIN.email}`);

    // Fill password
    const passwordInput = authModal
      .getByLabel(/password/i)
      .or(authModal.locator('input[type="password"]'));
    await passwordInput.fill(SUPERADMIN.password);
    console.log("Entered password");

    // Click authenticate button
    const authButton = authModal.getByRole("button", {
      name: /authenticate|confirm|submit/i,
    });
    await authButton.click();
    console.log("Clicked authenticate button");

    // STEP 5: Should navigate to POS Integration page
    console.log("\n=== STEP 5: Verify POS Integration page loads ===");

    // Set up a promise to capture the BACKEND POS integration API response (localhost:3001)
    const posIntegrationResponsePromise = page
      .waitForResponse(
        (response) => {
          const url = response.url();
          return (
            url.includes("localhost:3001") &&
            url.includes("/pos-integration") &&
            !url.includes("/test")
          );
        },
        { timeout: 20000 },
      )
      .catch(() => null);

    // Wait for navigation to POS integration page
    await page.waitForURL(/pos-integration|pos-setup/, { timeout: 15000 });
    console.log(`Navigated to: ${page.url()}`);

    // Modal should close
    await expect(authModal).not.toBeVisible({ timeout: 5000 });
    console.log("Auth modal closed");

    // Wait for the API response and log it
    const posIntegrationResponse = await posIntegrationResponsePromise;
    if (posIntegrationResponse) {
      const status = posIntegrationResponse.status();
      const url = posIntegrationResponse.url();
      console.log(`POS Integration API Response: ${status} from ${url}`);
    } else {
      console.log("No POS Integration API response captured");
    }

    // Wait for React to finish processing - use network idle instead of fixed timeout
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {
      console.log("Network not idle within timeout");
    });

    // Wait for loading to finish - the page shows "Loading POS Integration..." initially
    // Wait for either the setup wizard or an error/access denied message
    // The actual text is "Select Your POS System" in the wizard
    const setupWizard = page.getByText(/select your pos system/i);
    const accessDenied = page.getByText(/access denied/i);
    const errorLoading = page.getByText(/error loading/i);

    // Wait for page to fully load - try to find one of the expected elements
    const pageLoaded = await Promise.race([
      setupWizard
        .waitFor({ state: "visible", timeout: 10000 })
        .then(() => "wizard"),
      accessDenied
        .waitFor({ state: "visible", timeout: 10000 })
        .then(() => "denied"),
      errorLoading
        .waitFor({ state: "visible", timeout: 10000 })
        .then(() => "error"),
    ]).catch(() => "timeout");

    console.log(`Page loaded state: ${pageLoaded}`);

    // Check which state we're in
    const hasSetupWizard =
      pageLoaded === "wizard" ||
      (await setupWizard.isVisible().catch(() => false));
    const hasAccessDenied =
      pageLoaded === "denied" ||
      (await accessDenied.isVisible().catch(() => false));
    const hasError =
      pageLoaded === "error" ||
      (await errorLoading.isVisible().catch(() => false));

    console.log(`Setup wizard visible: ${hasSetupWizard}`);
    console.log(`Access denied visible: ${hasAccessDenied}`);
    console.log(`Error visible: ${hasError}`);

    // Should show setup wizard (success case)
    if (hasError) {
      // Take screenshot to debug
      await page.screenshot({
        path: "test-results/pos-auth-step5-debug.png",
        fullPage: true,
      });
    }

    // For this test, we expect the setup wizard to be visible (SUPERADMIN has access)
    // If we see an error, fail the test with details
    if (hasError) {
      throw new Error(
        "Page shows 'Error Loading POS Integration' - check API response above",
      );
    }

    expect(hasSetupWizard).toBe(true);
    console.log("POS Integration page content visible");

    // STEP 6: Select Gilbarco NAXML
    console.log("\n=== STEP 6: Select Gilbarco NAXML ===");

    // Find POS selector dropdown
    const posSelector = page
      .getByRole("combobox")
      .or(page.locator('[data-testid="pos-selector"]'));
    await posSelector.click();

    // Select Gilbarco NAXML
    await page.getByText(/gilbarco.*naxml/i).click();
    console.log("Selected Gilbarco NAXML");

    // Click Next (use test id to avoid matching Next.js dev tools button)
    await page.getByTestId("step1-next-button").click();
    console.log("Clicked Next");

    // STEP 7: Fill in file paths
    console.log("\n=== STEP 7: Fill in file paths ===");

    // Wait for step 2 to load - look for the heading "Connection Details"
    await expect(
      page.getByRole("heading", { name: /connection details/i }),
    ).toBeVisible({ timeout: 5000 });

    // Fill export path (files FROM POS) - use test id for reliability
    const exportPathInput = page
      .locator('[data-testid="file-export-path"]')
      .or(page.getByLabel(/export path.*from pos/i));
    await exportPathInput.fill(GILBARCO_PATH);
    console.log(`Filled export path: ${GILBARCO_PATH}`);

    // Fill import path (files TO POS) - use test id for reliability
    const importPathInput = page
      .locator('[data-testid="file-import-path"]')
      .or(page.getByLabel(/import path.*to pos/i));
    await importPathInput.fill(GILBARCO_PATH);
    console.log(`Filled import path: ${GILBARCO_PATH}`);

    // STEP 8: Click Test Connection
    console.log("\n=== STEP 8: Test Connection ===");

    // Use test id for reliability
    const testButton = page.getByTestId("test-connection-button");
    await expect(testButton).toBeVisible();
    await testButton.click();
    console.log("Clicked Test Connection");

    // Wait for test result
    await page.waitForTimeout(2000); // Give time for API call

    // Check for success or failure
    const successMessage = page.getByText(/connection successful/i);
    const failureMessage = page.getByText(/connection failed|error/i);

    // Wait for either result
    const result = await Promise.race([
      successMessage.waitFor({ timeout: 15000 }).then(() => "success"),
      failureMessage.waitFor({ timeout: 15000 }).then(() => "failure"),
    ]).catch(() => "timeout");

    console.log(`\n=== TEST RESULT: ${result} ===`);

    // Take screenshot of result
    await page.screenshot({
      path: "test-results/pos-auth-flow-result.png",
      fullPage: true,
    });

    // Log any visible error messages
    const errorText = await failureMessage.textContent().catch(() => null);
    if (errorText) {
      console.log(`Error message: ${errorText}`);
    }

    // Check for error code
    const errorCode = await page
      .getByText(/code:/i)
      .textContent()
      .catch(() => null);
    if (errorCode) {
      console.log(`Error code: ${errorCode}`);
    }
  });

  test("Verify CLIENT_USER cannot access POS page without re-auth", async ({
    page,
  }) => {
    // Login as CLIENT_USER
    await loginAs(page, CLIENT_USER.email, CLIENT_USER.password);

    // Try to navigate directly to POS integration page
    await page.goto(`/mystore/pos-integration?storeId=${TEST_STORE_ID}`);

    // Wait for page to load (loading spinner to disappear)
    await page
      .waitForSelector('[class*="animate-spin"]', {
        state: "hidden",
        timeout: 15000,
      })
      .catch(() => {
        console.log("No loading spinner or already hidden");
      });

    // Should show "Access Denied" because CLIENT_USER doesn't have POS_CONNECTION_READ permission
    // and no elevation token was provided
    const accessDenied = page.getByText(/access denied/i);
    const noStoreSelected = page.getByText(/no store selected/i);
    const errorLoading = page.getByText(/error loading/i);

    const hasAccessDenied = await accessDenied.isVisible().catch(() => false);
    const hasNoStore = await noStoreSelected.isVisible().catch(() => false);
    const hasError = await errorLoading.isVisible().catch(() => false);

    console.log(`Access denied visible: ${hasAccessDenied}`);
    console.log(`No store visible: ${hasNoStore}`);
    console.log(`Error visible: ${hasError}`);

    // Take screenshot for debugging
    await page.screenshot({
      path: "test-results/pos-direct-access-debug.png",
      fullPage: true,
    });

    // User should NOT see the setup wizard without elevation token
    const setupWizard = page.getByText(
      /select your pos system|pos integration setup/i,
    );
    const hasSetupWizard = await setupWizard.isVisible().catch(() => false);
    console.log(`Setup wizard visible (should be false): ${hasSetupWizard}`);

    // Either access denied, no store, or error should be shown (NOT the setup wizard)
    expect(hasAccessDenied || hasNoStore || hasError).toBe(true);
    expect(hasSetupWizard).toBe(false);
  });

  test("Verify elevation token is included in API requests", async ({
    page,
  }) => {
    // Track API requests
    const apiRequests: { url: string; headers: Record<string, string> }[] = [];

    page.on("request", (request) => {
      if (
        request.url().includes("/api/stores/") &&
        request.url().includes("/pos-integration")
      ) {
        apiRequests.push({
          url: request.url(),
          headers: request.headers(),
        });
      }
    });

    // Login as CLIENT_USER
    await loginAs(page, CLIENT_USER.email, CLIENT_USER.password);

    // Click POS Integration button
    await page.getByTestId("pos-integration-link").click();

    // Auth modal should appear - authenticate
    const authModal = page.getByRole("dialog");
    await expect(authModal).toBeVisible({ timeout: 10000 });

    await authModal.getByLabel(/email/i).fill(SUPERADMIN.email);
    await authModal.getByLabel(/password/i).fill(SUPERADMIN.password);
    await authModal
      .getByRole("button", { name: /authenticate|confirm/i })
      .click();

    // Wait for page to load and make API call
    await page.waitForURL(/pos-integration/, { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Check if elevation token was included in requests
    console.log("\n=== API Requests ===");
    for (const req of apiRequests) {
      console.log(`URL: ${req.url}`);
      console.log(
        `X-Elevation-Token: ${req.headers["x-elevation-token"] ? "PRESENT" : "MISSING"}`,
      );
    }

    // At least one request should have the elevation token
    const hasElevationToken = apiRequests.some(
      (req) => req.headers["x-elevation-token"],
    );

    expect(hasElevationToken).toBe(true);
  });

  test("Step 3 should show preview data after successful connection test", async ({
    page,
  }) => {
    // STEP 1: Login as CLIENT_USER
    console.log("\n=== STEP 1: Login as CLIENT_USER ===");
    await loginAs(page, CLIENT_USER.email, CLIENT_USER.password);
    console.log("Logged in as CLIENT_USER");

    // STEP 2: Click POS Integration
    console.log("\n=== STEP 2: Click POS Integration ===");
    await page.getByTestId("pos-integration-link").click();
    console.log("Clicked POS Integration button");

    // STEP 3: Auth Modal
    console.log("\n=== STEP 3: Authenticate with SUPERADMIN ===");
    const authModal = page.getByRole("dialog");
    await expect(authModal).toBeVisible({ timeout: 10000 });

    await authModal.getByLabel(/email/i).fill(SUPERADMIN.email);
    await authModal.getByLabel(/password/i).fill(SUPERADMIN.password);
    await authModal
      .getByRole("button", { name: /authenticate|confirm/i })
      .click();
    console.log("Authenticated as SUPERADMIN");

    // STEP 4: Wait for POS Integration page
    await page.waitForURL(/pos-integration/, { timeout: 15000 });
    await page.waitForTimeout(1000);

    // STEP 5: Select Gilbarco NAXML
    console.log("\n=== STEP 5: Select Gilbarco NAXML ===");
    const posSelector = page
      .getByRole("combobox")
      .or(page.locator('[data-testid="pos-selector"]'));
    await posSelector.click();
    await page.getByText(/gilbarco.*naxml/i).click();
    console.log("Selected Gilbarco NAXML");

    await page.getByTestId("step1-next-button").click();
    console.log("Clicked Next");

    // STEP 6: Fill in file paths
    console.log("\n=== STEP 6: Fill in file paths ===");
    await expect(
      page.getByRole("heading", { name: /connection details/i }),
    ).toBeVisible({ timeout: 5000 });

    const exportPathInput = page
      .locator('[data-testid="file-export-path"]')
      .or(page.getByLabel(/export path.*from pos/i));
    await exportPathInput.fill(GILBARCO_PATH);

    const importPathInput = page
      .locator('[data-testid="file-import-path"]')
      .or(page.getByLabel(/import path.*to pos/i));
    await importPathInput.fill(GILBARCO_PATH);
    console.log(`Filled file paths: ${GILBARCO_PATH}`);

    // STEP 7: Test Connection
    console.log("\n=== STEP 7: Test Connection ===");
    const testButton = page.getByTestId("test-connection-button");
    await testButton.click();

    // Wait for success
    await expect(page.getByText(/connection successful/i)).toBeVisible({
      timeout: 15000,
    });
    console.log("Connection test successful");

    // STEP 8: Click Next to go to Step 3
    console.log("\n=== STEP 8: Navigate to Step 3 ===");
    await page.getByTestId("step2-next-button").click();

    // Wait for Step 3 to load - new heading is "Select Data to Import"
    await expect(
      page.getByRole("heading", { name: /select data to import/i }),
    ).toBeVisible({ timeout: 5000 });
    console.log("Step 3 loaded");

    // Take screenshot of Step 3
    await page.screenshot({
      path: "test-results/pos-step3-preview.png",
      fullPage: true,
    });

    // STEP 9: Verify preview data sections are showing with items
    console.log("\n=== STEP 9: Verify preview data sections ===");

    // Check for departments section - new component uses sync-section-departments
    const deptSection = page.locator(
      '[data-testid="sync-section-departments"]',
    );
    await expect(deptSection).toBeVisible();
    console.log("Departments section visible");

    // Check for tender types section
    const tenderSection = page.locator(
      '[data-testid="sync-section-tenderTypes"]',
    );
    await expect(tenderSection).toBeVisible();
    console.log("Tender Types section visible");

    // Check for tax rates section
    const taxSection = page.locator('[data-testid="sync-section-taxRates"]');
    await expect(taxSection).toBeVisible();
    console.log("Tax Rates section visible");

    // STEP 10: Verify items are displayed (new component shows all items with checkboxes)
    console.log("\n=== STEP 10: Verify item lists ===");

    // Count department items (checkboxes within section)
    const deptItems = deptSection
      .locator("label")
      .filter({ has: page.locator('[role="checkbox"]') });
    const deptCount = await deptItems.count();
    console.log(`Departments items count: ${deptCount}`);

    // Count tender items
    const tenderItems = tenderSection
      .locator("label")
      .filter({ has: page.locator('[role="checkbox"]') });
    const tenderCount = await tenderItems.count();
    console.log(`Tender Types items count: ${tenderCount}`);

    // Count tax rate items
    const taxItems = taxSection
      .locator("label")
      .filter({ has: page.locator('[role="checkbox"]') });
    const taxCount = await taxItems.count();
    console.log(`Tax Rates items count: ${taxCount}`);

    // Check selection summary shows correct counts (use text to distinguish from interval button)
    const selectionSummary = page.getByText(/Selection Summary/i);
    await expect(selectionSummary).toBeVisible();
    console.log("Selection summary visible");

    // Verify at least one category has items
    const totalItems = deptCount + tenderCount + taxCount;
    console.log(`Total items found across all categories: ${totalItems}`);

    // Take final screenshot
    await page.screenshot({
      path: "test-results/pos-step3-items.png",
      fullPage: true,
    });

    // At least one category should have items from the sample files
    const hasAnyItems = totalItems > 0;
    console.log(`\n=== Has any items: ${hasAnyItems} ===`);

    // This test verifies the full item list feature works
    if (!hasAnyItems) {
      console.log(
        "NOTE: No items found. Check that sample maintenance XML files exist in BOOutBox.",
      );
      console.log(
        "Expected files: DeptMaint*.xml, TenderMaint*.xml, TaxMaint*.xml",
      );
    }

    // All items should be displayed with checkboxes
    expect(hasAnyItems).toBe(true);

    console.log("\n=== TEST RESULT: success ===");
  });
});
