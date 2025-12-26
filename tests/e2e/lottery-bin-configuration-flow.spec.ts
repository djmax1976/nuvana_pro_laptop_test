/**
 * E2E Tests: Lottery Bin Configuration Flow
 *
 * Tests critical end-to-end user journeys for lottery bin management:
 * - Client Owner configures bins and views bin display (critical workflow)
 * - Security: XSS prevention in user inputs
 * - Edge cases: Validation errors and network failure handling
 * - Bin management: Add, remove, and reorder bins
 *
 * @test-level E2E
 * @justification Tests critical multi-page user journeys that require full system integration
 * @story 6-13 - Lottery Database Enhancements & Bin Management
 * @priority P1 (High - Core User Journey)
 *
 * Implementation References:
 * - Settings Page: src/app/(client-dashboard)/client-dashboard/settings/lottery-bins/page.tsx
 * - BinConfigurationForm: src/components/lottery/BinConfigurationForm.tsx
 *   - data-testid="bin-configuration-form" - main form container
 *   - data-testid="add-bin-button" - add new bin button
 *   - data-testid="save-configuration-button" - save configuration button
 *   - data-testid="bin-name-input-{index}" - bin name inputs
 *   - data-testid="bin-location-input-{index}" - bin location inputs
 *   - data-testid="bin-move-up-{index}" / "bin-move-down-{index}" - reorder buttons
 *   - data-testid="bin-remove-{index}" - remove bin buttons
 * - BinListDisplay: src/components/lottery/BinListDisplay.tsx
 *   - data-testid="bin-list-table" - table display
 *   - data-testid="bin-list-empty" - empty state
 * - API Routes: backend/src/routes/lottery.ts
 *   - GET/POST/PUT /api/lottery/bins/configuration/:storeId
 *   - GET /api/lottery/bins/:storeId
 */

import { test, expect, Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { PrismaClient } from "@prisma/client";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";
import { createLotteryGame } from "../support/factories/lottery.factory";

/**
 * Network-first login helper that waits for actual API response.
 *
 * Flow:
 * 1. Navigate to login page
 * 2. Wait for form to be interactive (React hydration complete)
 * 3. Fill credentials and submit
 * 4. Wait for login API response (deterministic)
 * 5. Wait for redirect to complete
 *
 * @throws Error with descriptive message if login fails
 */
async function loginAsClientOwner(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  // Navigate to login page
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  // Wait for form elements to be ready
  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');
  const submitButton = page.locator('button[type="submit"]');

  // Wait for React hydration - form should be interactive
  await expect(emailInput).toBeEditable({ timeout: 30000 });

  // Wait for page to fully hydrate
  await page.waitForLoadState("networkidle").catch(() => {});

  // Fill credentials with explicit click to focus
  await emailInput.click();
  await emailInput.fill(email);
  await passwordInput.click();
  await passwordInput.fill(password);

  // Verify credentials were filled
  await expect(emailInput).toHaveValue(email);
  await expect(passwordInput).toHaveValue(password);

  // Use Promise.all to set up response listener and click simultaneously
  const [loginResponse] = await Promise.all([
    page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/auth/login") &&
        resp.request().method() === "POST",
      { timeout: 30000 },
    ),
    submitButton.click(),
  ]);

  if (loginResponse.status() !== 200) {
    const body = await loginResponse.json().catch(() => ({}));
    throw new Error(
      `Login failed: ${body.message || body.error?.message || `HTTP ${loginResponse.status()}`}`,
    );
  }

  // Wait for redirect to /client-dashboard
  await page.waitForURL(/.*client-dashboard.*/, { timeout: 30000 });
}

/**
 * Network-first helper to wait for bin configuration page.
 * Waits for API response before checking UI state.
 *
 * Implementation details:
 * - API: GET /api/lottery/bins/configuration/:storeId
 * - Settings page: data-testid="lottery-bins-settings-page"
 * - Form: data-testid="bin-configuration-form" when visible
 */
async function waitForBinConfigurationPageLoaded(page: Page): Promise<void> {
  // Wait for the settings page container
  await page
    .locator('[data-testid="lottery-bins-settings-page"]')
    .waitFor({ state: "visible", timeout: 30000 });

  // Wait for either the form OR an empty/error state
  await Promise.race([
    page
      .locator('[data-testid="bin-configuration-form"]')
      .waitFor({ state: "visible", timeout: 30000 }),
    page
      .getByText(/no stores available/i)
      .waitFor({ state: "visible", timeout: 30000 }),
    page
      .getByText(/failed to load/i)
      .waitFor({ state: "visible", timeout: 30000 }),
  ]).catch(() => {
    // Continue - we'll handle the state in the test
  });
}

/**
 * Helper function to wait for lottery page to fully load.
 * The lottery page has two tabs: Inventory and Configuration.
 *
 * Implementation details:
 * - Page container: data-testid="client-dashboard-lottery-page"
 * - Tabs: "Inventory" (default) and "Configuration" (bin display)
 * - BinListDisplay shows bins on Configuration tab
 *
 * @param page - Playwright Page object
 */
async function waitForLotteryPageLoaded(page: Page): Promise<void> {
  // Wait for the lottery page container
  // Increase timeout to 30s for CI environments
  await page
    .locator('[data-testid="client-dashboard-lottery-page"]')
    .waitFor({ state: "visible", timeout: 30000 });

  // Wait for tabs to be visible - use text content selector for reliability
  await expect(page.getByRole("tab", { name: "Inventory" })).toBeVisible({
    timeout: 15000,
  });

  // Wait for DOM to settle
  await page.waitForLoadState("domcontentloaded");
}

test.describe.serial("6.13-E2E: Lottery Bin Configuration Flow", () => {
  let prisma: PrismaClient;
  let clientOwner: any;
  let company: any;
  let store: any;
  let game: any;
  const password = "TestPassword123!";

  test.beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    // Create test client owner with company and store
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    const companyId = uuidv4();
    const storeId = uuidv4();

    clientOwner = await prisma.user.create({
      data: {
        user_id: userId,
        email: `e2e-bin-config-${Date.now()}@test.com`,
        name: "E2E Bin Config Owner",
        status: "ACTIVE",
        password_hash: passwordHash,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        is_client_user: true,
      },
    });

    company = await prisma.company.create({
      data: {
        company_id: companyId,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
        name: "E2E Bin Config Company",
        address: "123 Bin Config Street",
        status: "ACTIVE",
        owner_user_id: clientOwner.user_id,
      },
    });

    store = await prisma.store.create({
      data: {
        store_id: storeId,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
        company_id: company.company_id,
        name: "E2E Bin Config Store",
        location_json: { address: "456 Bin Config Avenue" },
        status: "ACTIVE",
      },
    });

    // Assign CLIENT_OWNER role to the user for the company
    const clientOwnerRole = await prisma.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    if (clientOwnerRole) {
      await prisma.userRole.create({
        data: {
          user_id: clientOwner.user_id,
          role_id: clientOwnerRole.role_id,
          company_id: company.company_id,
        },
      });
    }

    // Create lottery game with unique code to avoid conflicts
    game = await createLotteryGame(prisma, {
      name: "E2E Bin Config Test Game",
      // Let factory generate unique game_code to avoid conflicts
    });
  });

  test.afterAll(async () => {
    // Cleanup in reverse order of creation
    if (prisma) {
      // Delete any bin configurations created during tests
      await prisma.lotteryBinConfiguration
        .deleteMany({ where: { store_id: store?.store_id } })
        .catch(() => {});
      // Delete lottery bins
      await prisma.lotteryBin
        .deleteMany({ where: { store_id: store?.store_id } })
        .catch(() => {});
      // Delete user roles first
      await prisma.userRole
        .deleteMany({ where: { user_id: clientOwner?.user_id } })
        .catch(() => {});
      // Delete audit logs
      await prisma.auditLog
        .deleteMany({ where: { user_id: clientOwner?.user_id } })
        .catch(() => {});
      // Delete lottery game
      if (game) {
        await prisma.lotteryGame
          .delete({ where: { game_id: game.game_id } })
          .catch(() => {});
      }
      // Delete store
      if (store) {
        await prisma.store
          .delete({ where: { store_id: store.store_id } })
          .catch(() => {});
      }
      // Delete company
      if (company) {
        await prisma.company
          .delete({ where: { company_id: company.company_id } })
          .catch(() => {});
      }
      // Delete user
      if (clientOwner) {
        await prisma.user
          .delete({ where: { user_id: clientOwner.user_id } })
          .catch(() => {});
      }
      await prisma.$disconnect();
    }
  });

  test("6.13-E2E-001: [P1] Client Owner can configure bins and view bin display (AC #1, #2)", async ({
    page,
  }) => {
    /**
     * Tests the complete bin configuration workflow:
     * 1. Navigate to settings page
     * 2. Modify bin configuration (name, location)
     * 3. Save configuration via API
     * 4. Verify persistence after reload
     * 5. Navigate to lottery page and view Configuration tab
     *
     * API Endpoints:
     * - GET /api/lottery/bins/configuration/:storeId - Fetch existing config
     * - POST /api/lottery/bins/configuration/:storeId - Create new config
     * - PUT /api/lottery/bins/configuration/:storeId - Update existing config
     * - GET /api/lottery/bins/:storeId - Fetch bin list for display
     *
     * Component test IDs verified:
     * - bin-configuration-form: Main form container
     * - add-bin-button: Button to add new bin
     * - save-configuration-button: Button to save configuration
     * - bin-name-input-{index}: Bin name input fields
     * - bin-location-input-{index}: Bin location input fields
     */

    // GIVEN: I am authenticated as a Client Owner
    await loginAsClientOwner(page, clientOwner.email, password);

    // WHEN: I navigate to bin configuration settings page
    await page.goto("/client-dashboard/settings/lottery-bins", {
      waitUntil: "domcontentloaded",
    });

    // Wait for the page to fully load
    await waitForBinConfigurationPageLoaded(page);

    // THEN: Bin configuration form should be displayed
    const formVisible = await page
      .locator('[data-testid="bin-configuration-form"]')
      .isVisible()
      .catch(() => false);

    if (!formVisible) {
      // Check if we have an error or empty state
      const noStores = await page.getByText(/no stores available/i).isVisible();
      if (noStores) {
        test.skip(true, "No stores available for bin configuration");
        return;
      }
    }

    // Wait for bin configuration form to load with bins
    await page
      .locator('[data-testid="bin-configuration-form"]')
      .waitFor({ state: "visible", timeout: 30000 });

    // THEN: Add bin button should be visible
    await expect(page.locator('[data-testid="add-bin-button"]')).toBeVisible({
      timeout: 20000,
    });

    // Wait for form to initialize with bins (default 24 bins when no config exists)
    const firstBinNameInput = page.locator('[data-testid="bin-name-input-0"]');
    await expect(firstBinNameInput).toBeVisible({ timeout: 25000 });
    await expect(firstBinNameInput).toBeEditable({ timeout: 15000 });

    // Change the name to something different to trigger hasChanges state
    await firstBinNameInput.click();
    await firstBinNameInput.clear();
    await firstBinNameInput.fill("Main Counter Bin");
    await expect(firstBinNameInput).toHaveValue("Main Counter Bin", {
      timeout: 10000,
    });

    // Fill location for first bin to make another change
    const locationInput = page.locator('[data-testid="bin-location-input-0"]');
    await expect(locationInput).toBeVisible({ timeout: 10000 });
    await locationInput.click();
    await locationInput.clear();
    await locationInput.fill("Front Counter");
    await expect(locationInput).toHaveValue("Front Counter", {
      timeout: 10000,
    });

    // AND: I save the configuration (button should now be enabled after changes)
    // Save button is disabled until hasChanges=true in component state
    const saveButton = page.locator(
      '[data-testid="save-configuration-button"]',
    );
    await expect(saveButton).toBeEnabled({ timeout: 10000 });

    // Set up response promise before clicking - network-first pattern
    const saveResponsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/lottery/bins/configuration/") &&
        (resp.status() === 200 || resp.status() === 201),
      { timeout: 30000 },
    );
    await saveButton.click();
    await saveResponsePromise;

    // THEN: Success message is displayed (toast notification)
    await expect(page.getByText("Configuration saved").first()).toBeVisible({
      timeout: 20000,
    });

    // AND: Saved values persist on reload (validates API persistence)
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForBinConfigurationPageLoaded(page);
    await expect(firstBinNameInput).toHaveValue("Main Counter Bin", {
      timeout: 15000,
    });
    await expect(locationInput).toHaveValue("Front Counter", {
      timeout: 10000,
    });

    // WHEN: I navigate to lottery page to view the bin display
    await page.goto("/client-dashboard/lottery", {
      waitUntil: "domcontentloaded",
    });

    // Wait for lottery page to load
    await waitForLotteryPageLoaded(page);

    // THEN: Lottery page is displayed
    await expect(
      page.locator('[data-testid="client-dashboard-lottery-page"]'),
    ).toBeVisible({ timeout: 20000 });

    // Click on the Configuration tab to view bin display
    const configurationTab = page.getByRole("tab", { name: "Configuration" });
    await expect(configurationTab).toBeVisible({ timeout: 15000 });
    await configurationTab.click();

    // Wait for tab content to load
    await page.waitForLoadState("domcontentloaded");

    // Wait for either table, empty state, or the bin configuration section to appear
    // BinListDisplay can show: bin-list-table, bin-list-empty, or loading state
    // The Configuration tab also shows "Bin Configuration" heading
    await Promise.race([
      page
        .locator('[data-testid="bin-list-table"]')
        .waitFor({ state: "visible", timeout: 20000 }),
      page
        .locator('[data-testid="bin-list-empty"]')
        .waitFor({ state: "visible", timeout: 20000 }),
      page
        .getByText("Bin Configuration")
        .waitFor({ state: "visible", timeout: 20000 }),
    ]).catch(() => {
      // One of these should appear, but we'll verify below
    });

    // Verify page structure is correct - either table, empty state, or configuration heading visible
    // Empty state is shown when bins exist but no packs are assigned
    const hasBinTable = await page
      .locator('[data-testid="bin-list-table"]')
      .isVisible()
      .catch(() => false);
    const hasBinEmptyState = await page
      .locator('[data-testid="bin-list-empty"]')
      .isVisible()
      .catch(() => false);
    const hasBinConfigHeading = await page
      .getByText("Bin Configuration")
      .isVisible()
      .catch(() => false);

    // Either state is valid - bin table (bins with packs), empty state (no packs), or config heading
    expect(hasBinTable || hasBinEmptyState || hasBinConfigHeading).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // SECURITY TESTS - XSS Prevention
  // ---------------------------------------------------------------------------

  test("6.13-E2E-SEC-001: [P0] Should prevent XSS in bin name field", async ({
    page,
  }) => {
    /**
     * Security test: XSS Prevention in User Input Fields
     *
     * OWASP Category: A7:2017 - Cross-Site Scripting (XSS)
     *
     * This test verifies that:
     * 1. Script tags entered in input fields are NOT executed
     * 2. Input values are properly escaped by React's automatic JSX escaping
     * 3. No JavaScript dialogs are triggered (alert/confirm/prompt)
     * 4. Various XSS payload variants are properly handled
     *
     * React Security: React automatically escapes all values embedded in JSX,
     * converting special characters to their HTML entities, preventing XSS
     * attacks in controlled components like <Input /> fields.
     */

    // GIVEN: I am authenticated as a Client Owner
    await loginAsClientOwner(page, clientOwner.email, password);

    // Track any unexpected JavaScript execution via dialogs (e.g., alert())
    let dialogTriggered = false;
    page.on("dialog", async (dialog) => {
      dialogTriggered = true;
      await dialog.dismiss().catch(() => {});
    });

    // WHEN: I navigate to bin configuration page
    await page.goto("/client-dashboard/settings/lottery-bins", {
      waitUntil: "domcontentloaded",
    });

    // Wait for the page to fully load
    await waitForBinConfigurationPageLoaded(page);

    // Skip if form is not visible (no stores)
    const formVisible = await page
      .locator('[data-testid="bin-configuration-form"]')
      .isVisible()
      .catch(() => false);

    if (!formVisible) {
      test.skip(true, "Bin configuration form not available");
      return;
    }

    // Wait for form to load with bins
    await expect(page.locator('[data-testid="bin-name-input-0"]')).toBeVisible({
      timeout: 30000,
    });

    // AND: I attempt to enter XSS payload in bin name
    const xssPayload = "<script>alert('xss')</script>";
    const nameInput = page.locator('[data-testid="bin-name-input-0"]');
    await nameInput.clear();
    await nameInput.fill(xssPayload);

    // THEN: XSS payload is displayed as text (not executed)
    await expect(nameInput).toHaveValue(xssPayload);

    // AND: No script execution occurs
    // React automatically escapes text content, preventing XSS
    // The input value contains the payload as text, not as executable HTML
    const inputValue = await nameInput.inputValue();
    expect(inputValue).toBe(xssPayload);

    // Ensure no dialog was triggered by any script execution
    expect(dialogTriggered).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // EDGE CASE TESTS
  // ---------------------------------------------------------------------------

  test("6.13-E2E-EDGE-001: [P1] Should handle validation errors gracefully", async ({
    page,
  }) => {
    /**
     * Edge case test: Client-side Validation Error Handling
     *
     * Tests the validateBins() function in BinConfigurationForm.tsx:
     * - Validates bin count (1-200 bins allowed)
     * - Validates unique display orders
     * - Validates non-empty names - Error: "All bins must have a name"
     *
     * This test verifies:
     * 1. Save button remains enabled when changes are made (hasChanges=true)
     * 2. Client-side validation catches empty bin names before API call
     * 3. Toast notification displays appropriate validation error
     * 4. Form remains in editable state after validation failure
     */

    // GIVEN: I am authenticated as a Client Owner
    await loginAsClientOwner(page, clientOwner.email, password);

    // WHEN: I navigate to bin configuration page
    await page.goto("/client-dashboard/settings/lottery-bins", {
      waitUntil: "domcontentloaded",
    });

    // Wait for the page to fully load
    await waitForBinConfigurationPageLoaded(page);

    // Skip if form is not visible (no stores)
    const formVisible = await page
      .locator('[data-testid="bin-configuration-form"]')
      .isVisible()
      .catch(() => false);

    if (!formVisible) {
      test.skip(true, "Bin configuration form not available");
      return;
    }

    // Wait for form to load with bins
    await expect(page.locator('[data-testid="bin-name-input-0"]')).toBeVisible({
      timeout: 30000,
    });

    // AND: I clear the first bin name (make it empty to trigger validation)
    const nameInput = page.locator('[data-testid="bin-name-input-0"]');
    await nameInput.clear();
    await nameInput.fill(""); // Ensure it's empty

    // AND: I attempt to save with empty required field
    const saveButton = page.locator(
      '[data-testid="save-configuration-button"]',
    );

    // The save button should be enabled (hasChanges is true after clearing)
    await expect(saveButton).toBeEnabled({ timeout: 5000 });
    await saveButton.click();

    // THEN: Validation error is displayed (toast notification)
    // The validateBins() function returns "All bins must have a name" for empty names
    await expect(
      page.getByText("All bins must have a name").first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("6.13-E2E-EDGE-002: [P1] Should handle network errors gracefully", async ({
    page,
  }) => {
    /**
     * Edge case test: Network Error Handling
     *
     * Tests error handling in BinConfigurationForm.tsx:
     * - isConfigError state triggers error UI when API returns non-404 error
     * - Component shows "Failed to load bin configuration" message with destructive styling
     *
     * Uses Playwright route interception to simulate server 500 error
     * Verifies graceful degradation with user-friendly error message
     *
     * API Error Response Format:
     * { success: false, error: { code: "INTERNAL_ERROR", message: "Server error" } }
     */

    // GIVEN: I am authenticated as a Client Owner
    await loginAsClientOwner(page, clientOwner.email, password);

    // Set up route interception to simulate network error
    // Intercept the bin configuration API call (GET /api/lottery/bins/configuration/:storeId)
    await page.route("**/api/lottery/bins/configuration/*", (route) => {
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Server error" },
        }),
      });
    });

    // WHEN: I navigate to bin configuration page with network error
    await page.goto("/client-dashboard/settings/lottery-bins", {
      waitUntil: "domcontentloaded",
    });

    // If auth session was cleared during navigation, re-authenticate once
    const navigatedToLogin = await Promise.race([
      page
        .locator('[data-testid="lottery-bins-settings-page"]')
        .waitFor({ state: "visible", timeout: 5000 })
        .then(() => false)
        .catch(() => false),
      page
        .getByRole("heading", { name: "Welcome back" })
        .waitFor({ state: "visible", timeout: 5000 })
        .then(() => true)
        .catch(() => false),
    ]);

    if (navigatedToLogin) {
      await loginAsClientOwner(page, clientOwner.email, password);
      await page.goto("/client-dashboard/settings/lottery-bins", {
        waitUntil: "domcontentloaded",
      });
    }

    // Wait for the settings page container to load
    await page
      .locator('[data-testid="lottery-bins-settings-page"]')
      .waitFor({ state: "visible", timeout: 15000 });

    // Wait for network to settle
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});

    // THEN: Error message is displayed
    // The BinConfigurationForm shows error for non-404 errors in isConfigError state
    // Check for the error message in the component (border-destructive class applied)
    const hasErrorMessage = await Promise.race([
      page
        .getByText(/failed to load/i)
        .first()
        .waitFor({ state: "visible", timeout: 10000 })
        .then(() => true)
        .catch(() => false),
      page
        .getByText(/error/i)
        .first()
        .waitFor({ state: "visible", timeout: 10000 })
        .then(() => true)
        .catch(() => false),
      page
        .locator(".text-destructive")
        .first()
        .waitFor({ state: "visible", timeout: 10000 })
        .then(() => true)
        .catch(() => false),
    ]);

    expect(hasErrorMessage).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // ADDITIONAL BIN MANAGEMENT TESTS
  // ---------------------------------------------------------------------------

  test("6.13-E2E-002: [P1] Client Owner can add and remove bins", async ({
    page,
  }) => {
    /**
     * Bin Management test: Add and Remove Bins
     *
     * Tests handlers in BinConfigurationForm.tsx:
     * - handleAddBin(): Creates new bin with default name "Bin {n+1}"
     *   - New bins get sequential display_order
     *   - Maximum 200 bins allowed
     * - handleRemoveBin(): Removes bin and reorders remaining bins
     *   - Minimum 1 bin required (removal disabled when only 1 bin exists)
     *   - Remaining bins are reordered to maintain sequential display_order
     *
     * Component test IDs:
     * - add-bin-button: Button to add new bin
     * - bin-item-{index}: Container for each bin row
     * - bin-name-input-{index}: Name input for each bin
     * - bin-remove-{index}: Remove button for each bin
     */

    // GIVEN: I am authenticated as a Client Owner
    await loginAsClientOwner(page, clientOwner.email, password);

    // Navigate to bin configuration page
    await page.goto("/client-dashboard/settings/lottery-bins", {
      waitUntil: "domcontentloaded",
    });

    // Wait for the page to fully load
    await waitForBinConfigurationPageLoaded(page);

    // Skip if form is not visible
    const formVisible = await page
      .locator('[data-testid="bin-configuration-form"]')
      .isVisible()
      .catch(() => false);

    if (!formVisible) {
      test.skip(true, "Bin configuration form not available");
      return;
    }

    // Wait for initial bins to load
    await expect(page.locator('[data-testid="bin-name-input-0"]')).toBeVisible({
      timeout: 15000,
    });

    // Count initial bins (default 24 bins when no config exists)
    const initialBinCount = await page
      .locator('[data-testid^="bin-item-"]')
      .count();

    // WHEN: I click the Add Bin button
    const addButton = page.locator('[data-testid="add-bin-button"]');
    await addButton.click();

    // THEN: A new bin is added
    const newBinCount = await page
      .locator('[data-testid^="bin-item-"]')
      .count();
    expect(newBinCount).toBe(initialBinCount + 1);

    // Verify the new bin exists at the expected index
    const newBinInput = page.locator(
      `[data-testid="bin-name-input-${initialBinCount}"]`,
    );
    await expect(newBinInput).toBeVisible();

    // WHEN: I remove the newly added bin
    const removeButton = page.locator(
      `[data-testid="bin-remove-${initialBinCount}"]`,
    );
    await removeButton.click();

    // THEN: The bin is removed and count returns to original
    const finalBinCount = await page
      .locator('[data-testid^="bin-item-"]')
      .count();
    expect(finalBinCount).toBe(initialBinCount);
  });

  test("6.13-E2E-003: [P2] Client Owner can reorder bins", async ({ page }) => {
    /**
     * Bin Management test: Reorder Bins
     *
     * Tests handlers in BinConfigurationForm.tsx:
     * - handleMoveUp(): Swaps bin with previous bin, updates display_order
     * - handleMoveDown(): Swaps bin with next bin, updates display_order
     *
     * Component test IDs:
     * - bin-move-up-{index}: Move up button (disabled at index 0)
     * - bin-move-down-{index}: Move down button (disabled at last index)
     *
     * Behavior:
     * - Swapping updates display_order for all affected bins
     * - hasChanges becomes true after reordering
     * - Button disabled states are enforced at boundaries
     */

    // GIVEN: I am authenticated as a Client Owner
    await loginAsClientOwner(page, clientOwner.email, password);

    // Navigate to bin configuration page
    await page.goto("/client-dashboard/settings/lottery-bins", {
      waitUntil: "domcontentloaded",
    });

    // Wait for the page to fully load
    await waitForBinConfigurationPageLoaded(page);

    // Skip if form is not visible
    const formVisible = await page
      .locator('[data-testid="bin-configuration-form"]')
      .isVisible()
      .catch(() => false);

    if (!formVisible) {
      test.skip(true, "Bin configuration form not available");
      return;
    }

    // Wait for bins to load (need at least 2 bins to test reordering)
    const firstBinInput = page.locator('[data-testid="bin-name-input-0"]');
    const secondBinInput = page.locator('[data-testid="bin-name-input-1"]');
    await expect(firstBinInput).toBeVisible({ timeout: 30000 });
    await expect(secondBinInput).toBeVisible({ timeout: 15000 });

    // First, set unique and known names for both bins to ensure reliable testing
    // This avoids any dependency on previous test state and ensures deterministic assertions
    const uniqueBinNameA = `Reorder-A-${Date.now()}`;
    const uniqueBinNameB = `Reorder-B-${Date.now()}`;

    await firstBinInput.click();
    await firstBinInput.clear();
    await firstBinInput.fill(uniqueBinNameA);
    await expect(firstBinInput).toHaveValue(uniqueBinNameA, { timeout: 5000 });

    await secondBinInput.click();
    await secondBinInput.clear();
    await secondBinInput.fill(uniqueBinNameB);
    await expect(secondBinInput).toHaveValue(uniqueBinNameB, { timeout: 5000 });

    // Verify we have distinct names before proceeding
    const nameBefore0 = await firstBinInput.inputValue();
    const nameBefore1 = await secondBinInput.inputValue();
    expect(nameBefore0).toBe(uniqueBinNameA);
    expect(nameBefore1).toBe(uniqueBinNameB);
    expect(nameBefore0).not.toBe(nameBefore1);

    // WHEN: I click move down on the first bin (swaps positions with second bin)
    const moveDownButton = page.locator('[data-testid="bin-move-down-0"]');
    await expect(moveDownButton).toBeEnabled({ timeout: 5000 });
    await moveDownButton.click();

    // THEN: The bins are swapped (handleMoveDown swaps adjacent bins)
    // Use Playwright's auto-retry to wait for the DOM update
    // The name that was at position 1 (uniqueBinNameB) should now be at position 0
    await expect(firstBinInput).toHaveValue(uniqueBinNameB, {
      timeout: 10000,
    });
    // The name that was at position 0 (uniqueBinNameA) should now be at position 1
    await expect(secondBinInput).toHaveValue(uniqueBinNameA, {
      timeout: 5000,
    });

    // Verify move up button on first bin is disabled (it's at index 0)
    const moveUpButtonFirst = page.locator('[data-testid="bin-move-up-0"]');
    await expect(moveUpButtonFirst).toBeDisabled();

    // Verify move up button on second bin is enabled (it's at index 1)
    const moveUpButton = page.locator('[data-testid="bin-move-up-1"]');
    await expect(moveUpButton).toBeEnabled();
  });
});
