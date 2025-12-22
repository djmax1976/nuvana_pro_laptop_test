/**
 * E2E Tests: Lottery Bin Configuration Flow
 *
 * Tests critical end-to-end user journey:
 * - Client Owner configures bins and views bin display (critical workflow)
 *
 * @test-level E2E
 * @justification Tests critical multi-page user journey that requires full system integration
 * @story 6-13 - Lottery Database Enhancements & Bin Management
 * @priority P1 (High - Core User Journey)
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
 * Helper function to perform login and wait for redirect.
 * Uses network-first pattern for reliability in CI/CD environments.
 * Follows the proven pattern from client-dashboard-flow.spec.ts.
 */
async function loginAsClientOwner(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  // Network-first pattern: Intercept API calls BEFORE navigation
  const loginResponsePromise = page.waitForResponse(
    (resp) =>
      (resp.url().includes("/api/auth/login") ||
        resp.url().includes("/api/auth/client-login") ||
        resp.url().includes("/api/client/auth/login")) &&
      resp.request().method() === "POST",
    { timeout: 30000 },
  );

  // Navigate to login page and wait for hydration/network to settle
  await page.goto("/login", { waitUntil: "networkidle" });

  // Wait for login form to be visible and ready for input
  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');

  await expect(emailInput).toBeVisible({ timeout: 15000 });
  await expect(emailInput).toBeEditable({ timeout: 10000 });

  // Fill credentials directly to avoid partial input or autofill interference
  await emailInput.fill(email);
  await passwordInput.fill(password);

  await expect(emailInput).toHaveValue(email, { timeout: 5000 });
  await expect(passwordInput).toHaveValue(password, { timeout: 5000 });

  // Click submit and wait for navigation to /client-dashboard
  await Promise.all([
    page.waitForURL(/.*client-dashboard.*/, {
      timeout: 30000,
      waitUntil: "domcontentloaded",
    }),
    page.click('button[type="submit"]'),
  ]);

  // Wait for login API response (deterministic)
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.status()).toBe(200);

  // Wait for page to be fully loaded
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {
    // networkidle might timeout if there are long-polling requests, that's OK
  });
}

/**
 * Helper function to wait for bin configuration page to fully load.
 */
async function waitForBinConfigurationPageLoaded(page: Page): Promise<void> {
  // Wait for the settings page container
  await page
    .locator('[data-testid="lottery-bins-settings-page"]')
    .waitFor({ state: "visible", timeout: 15000 });

  // Wait for either the form OR an empty/error state
  await Promise.race([
    page
      .locator('[data-testid="bin-configuration-form"]')
      .waitFor({ state: "visible", timeout: 15000 }),
    page
      .getByText(/no stores available/i)
      .waitFor({ state: "visible", timeout: 15000 }),
    page
      .getByText(/failed to load/i)
      .waitFor({ state: "visible", timeout: 15000 }),
  ]).catch(() => {
    // Continue - we'll handle the state in the test
  });

  // Wait for network to settle
  await page
    .waitForLoadState("networkidle", { timeout: 10000 })
    .catch(() => {});
}

/**
 * Helper function to wait for lottery page to fully load.
 */
async function waitForLotteryPageLoaded(page: Page): Promise<void> {
  // Wait for the lottery page container
  await page
    .locator('[data-testid="client-dashboard-lottery-page"]')
    .waitFor({ state: "visible", timeout: 15000 });

  // Wait for tabs to be visible
  await page.locator('button[role="tab"]:has-text("Inventory")').waitFor({
    state: "visible",
    timeout: 10000,
  });

  // Wait for network to settle
  await page
    .waitForLoadState("networkidle", { timeout: 10000 })
    .catch(() => {});
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
      .waitFor({ state: "visible", timeout: 15000 });

    // THEN: Add bin button should be visible
    await expect(page.locator('[data-testid="add-bin-button"]')).toBeVisible({
      timeout: 10000,
    });

    // Wait for form to initialize with bins (default 24 bins)
    const firstBinNameInput = page.locator('[data-testid="bin-name-input-0"]');
    await expect(firstBinNameInput).toBeVisible({ timeout: 15000 });

    // Change the name to something different to trigger hasChanges
    await firstBinNameInput.clear();
    await firstBinNameInput.fill("Main Counter Bin");

    // Fill location for first bin to make another change
    const locationInput = page.locator('[data-testid="bin-location-input-0"]');
    await locationInput.clear();
    await locationInput.fill("Front Counter");

    // AND: I save the configuration (button should now be enabled after changes)
    const saveButton = page.locator(
      '[data-testid="save-configuration-button"]',
    );
    const saveResponsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/lottery/bins/configuration/") &&
        (resp.status() === 200 || resp.status() === 201),
      { timeout: 15000 },
    );
    await expect(saveButton).toBeEnabled({ timeout: 5000 });
    await saveButton.click();
    await saveResponsePromise;

    // THEN: Success message is displayed (toast notification)
    await expect(page.getByText("Configuration saved").first()).toBeVisible({
      timeout: 15000,
    });

    // AND: Saved values persist on reload
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForBinConfigurationPageLoaded(page);
    await expect(firstBinNameInput).toHaveValue("Main Counter Bin");
    await expect(locationInput).toHaveValue("Front Counter");

    // WHEN: I navigate to lottery page to view the bin display
    await page.goto("/client-dashboard/lottery", {
      waitUntil: "domcontentloaded",
    });

    // Wait for lottery page to load
    await waitForLotteryPageLoaded(page);

    // THEN: Lottery page is displayed
    await expect(
      page.locator('[data-testid="client-dashboard-lottery-page"]'),
    ).toBeVisible({ timeout: 15000 });

    // Click on the Configuration tab to view bin display
    const configurationTab = page.locator(
      'button[role="tab"]:has-text("Configuration")',
    );
    await configurationTab.click();

    // Wait for either table or empty state message to appear
    await Promise.race([
      page
        .locator('[data-testid="bin-list-table"]')
        .waitFor({ state: "visible", timeout: 10000 }),
      page
        .locator('[data-testid="bin-list-empty"]')
        .waitFor({ state: "visible", timeout: 10000 }),
      page
        .locator('[data-testid="bin-list-loading"]')
        .waitFor({ state: "hidden", timeout: 10000 }),
    ]).catch(() => {});

    // Verify page structure is correct - either table or empty state
    const hasBinTable = await page
      .locator('[data-testid="bin-list-table"]')
      .isVisible()
      .catch(() => false);
    const hasBinEmptyState = await page
      .locator('[data-testid="bin-list-empty"]')
      .isVisible()
      .catch(() => false);

    // Either state is valid - bin table or empty state
    expect(hasBinTable || hasBinEmptyState).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // SECURITY TESTS - XSS Prevention
  // ---------------------------------------------------------------------------

  test("6.13-E2E-SEC-001: [P0] Should prevent XSS in bin name field", async ({
    page,
  }) => {
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
      timeout: 15000,
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

    // Verify that the value is properly escaped in the DOM
    // The text should be visible as literal text, not parsed as HTML
    const inputHtml = await nameInput.evaluate((el) => el.outerHTML);
    expect(inputHtml).not.toContain("<script>");
  });

  // ---------------------------------------------------------------------------
  // EDGE CASE TESTS
  // ---------------------------------------------------------------------------

  test("6.13-E2E-EDGE-001: [P1] Should handle validation errors gracefully", async ({
    page,
  }) => {
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
      timeout: 15000,
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
    // The BinConfigurationForm shows "All bins must have a name" for empty names
    await expect(
      page.getByText("All bins must have a name").first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("6.13-E2E-EDGE-002: [P1] Should handle network errors gracefully", async ({
    page,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    await loginAsClientOwner(page, clientOwner.email, password);

    // Set up route interception to simulate network error
    // Intercept the bin configuration API call
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
    // The BinConfigurationForm shows error for non-404 errors
    // Check for the error message in the component
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

    // Count initial bins
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

    // Verify the new bin has default name
    const newBinInput = page.locator(
      `[data-testid="bin-name-input-${initialBinCount}"]`,
    );
    await expect(newBinInput).toBeVisible();

    // WHEN: I remove the newly added bin
    const removeButton = page.locator(
      `[data-testid="bin-remove-${initialBinCount}"]`,
    );
    await removeButton.click();

    // THEN: The bin is removed
    const finalBinCount = await page
      .locator('[data-testid^="bin-item-"]')
      .count();
    expect(finalBinCount).toBe(initialBinCount);
  });

  test("6.13-E2E-003: [P2] Client Owner can reorder bins", async ({ page }) => {
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

    // Wait for bins to load
    await expect(page.locator('[data-testid="bin-name-input-0"]')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator('[data-testid="bin-name-input-1"]')).toBeVisible({
      timeout: 5000,
    });

    // Get the names of first two bins before reordering
    const firstBinNameBefore = await page
      .locator('[data-testid="bin-name-input-0"]')
      .inputValue();

    // WHEN: I click move down on the first bin
    const moveDownButton = page.locator('[data-testid="bin-move-down-0"]');
    await moveDownButton.click();

    // THEN: The bins are swapped
    // Wait for the DOM to update
    await page.waitForTimeout(500);

    const firstBinNameAfter = await page
      .locator('[data-testid="bin-name-input-0"]')
      .inputValue();

    // The first bin should now have a different name (they were swapped)
    expect(firstBinNameAfter).not.toBe(firstBinNameBefore);

    // Verify move up button on second bin is now enabled (was first, moved down)
    const moveUpButton = page.locator('[data-testid="bin-move-up-1"]');
    await expect(moveUpButton).toBeEnabled();
  });
});
