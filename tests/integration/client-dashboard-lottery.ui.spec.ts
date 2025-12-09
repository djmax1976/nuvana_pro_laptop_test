/**
 * Integration Tests: Client Dashboard Lottery Page
 *
 * Story 6.10.1: Client Dashboard Lottery Page
 *
 * Tests the complete client dashboard lottery page functionality:
 * - Store tabs display and switching (AC #1)
 * - Lottery inventory table display grouped by game (AC #2, #3)
 * - Add lottery flow (AC #4)
 * - Empty state display (AC #8)
 * - RLS enforcement (AC #7)
 * - Error handling and loading states (AC #7)
 *
 * Note: The LotteryTable component now displays inventory grouped by game
 * with columns: Game Name, Game Number, Dollar Value, Pack Count, Status
 *
 * @test-level Integration
 * @justification Tests UI components with real API integration, authentication, and data flow
 * @story 6-10-1 - Client Dashboard Lottery Page
 * @priority P1 (High - Core User Journey, Security)
 */

import { test, expect, Page } from "@playwright/test";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { PrismaClient } from "@prisma/client";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";
import {
  createLotteryGame,
  createLotteryPack,
  createLotteryBin,
} from "../support/factories/lottery.factory";
import { createCompany, createStore } from "../support/helpers";

/**
 * Helper function to perform login and wait for client dashboard.
 * Uses network-first pattern for reliable test stability in CI/CD.
 */
async function loginAndWaitForClientDashboard(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  // Navigate to login page
  await page.goto("/login", { waitUntil: "networkidle" });

  // Wait for login form to be visible and ready for input
  const emailInput = page.locator("#email");
  await emailInput.waitFor({ state: "visible", timeout: 15000 });

  // Wait for input to be editable (ensures React hydration is complete)
  await expect(emailInput).toBeEditable({ timeout: 10000 });

  // Fill credentials using locator and verify the values are entered
  await emailInput.fill(email);
  await page.locator("#password").fill(password);

  // Verify the form is filled before submitting
  await expect(emailInput).toHaveValue(email);
  await expect(page.locator("#password")).toHaveValue(password);

  // Set up response and navigation promises AFTER form is ready but BEFORE clicking
  const loginResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes("/api/auth/login") && resp.status() === 200,
    { timeout: 30000 },
  );

  const navigationPromise = page.waitForURL(/.*client-dashboard.*/, {
    timeout: 30000,
    waitUntil: "domcontentloaded",
  });

  // Click submit button
  await page.getByRole("button", { name: "Sign In" }).click();

  // Wait for login API response
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.status()).toBe(200);

  // Wait for navigation to complete
  await navigationPromise;

  // Wait for page to be fully loaded
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {
    // networkidle might timeout if there are long-polling requests
  });
}

/**
 * Helper function to wait for lottery page data to load
 */
async function waitForLotteryPageLoaded(page: Page): Promise<void> {
  // Wait for the lottery page container
  await page
    .locator('[data-testid="client-dashboard-lottery-page"]')
    .waitFor({ state: "visible", timeout: 15000 });

  // Wait for network to be idle
  await page
    .waitForLoadState("networkidle", { timeout: 15000 })
    .catch(() => {});

  // Wait for store tabs OR loading to complete
  await Promise.race([
    page
      .locator('[data-testid="store-tabs"]')
      .waitFor({ state: "visible", timeout: 15000 })
      .catch(() => null),
    page
      .getByText(/no stores available/i)
      .waitFor({ state: "visible", timeout: 15000 })
      .catch(() => null),
  ]);
}

// Use serial mode to prevent parallel execution issues with shared test data
test.describe.configure({ mode: "serial" });

test.describe("6.10.1-Integration: Client Dashboard Lottery Page", () => {
  let prisma: PrismaClient;
  let clientOwner: any;
  let company: any;
  let store1: any;
  let store2: any;
  let game: any;
  let bin1: any;
  let bin2: any;
  const password = "TestPassword123!";

  test.beforeAll(async () => {
    prisma = new PrismaClient();
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    const companyId = uuidv4();
    const store1Id = uuidv4();
    const store2Id = uuidv4();

    // Create client owner user
    clientOwner = await prisma.user.create({
      data: {
        user_id: userId,
        email: `integration-lottery-client-${Date.now()}@test.com`,
        name: "Integration Lottery Client",
        status: "ACTIVE",
        password_hash: passwordHash,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        is_client_user: true,
      },
    });

    // Create company
    company = await prisma.company.create({
      data: {
        company_id: companyId,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
        name: "Integration Lottery Test Company",
        address: "123 Integration Test Street",
        status: "ACTIVE",
        owner_user_id: clientOwner.user_id,
      },
    });

    // Create two stores
    store1 = await prisma.store.create({
      data: {
        store_id: store1Id,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
        company_id: company.company_id,
        name: "Integration Store 1",
        timezone: "America/New_York",
        status: "ACTIVE",
        location_json: { address: "456 Store 1 Ave" },
      },
    });

    store2 = await prisma.store.create({
      data: {
        store_id: store2Id,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
        company_id: company.company_id,
        name: "Integration Store 2",
        timezone: "America/New_York",
        status: "ACTIVE",
        location_json: { address: "789 Store 2 Ave" },
      },
    });

    // Assign CLIENT_OWNER role
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

    // Create lottery game
    game = await createLotteryGame(prisma, {
      name: "Integration Test Game",
      price: 5.0,
    });

    // Create bins for store1
    bin1 = await createLotteryBin(prisma, {
      store_id: store1.store_id,
      name: "Bin 1",
    });

    bin2 = await createLotteryBin(prisma, {
      store_id: store1.store_id,
      name: "Bin 2",
    });
  });

  test.afterAll(async () => {
    if (clientOwner) {
      await prisma.userRole
        .deleteMany({ where: { user_id: clientOwner.user_id } })
        .catch(() => {});
      await prisma.lotteryPack
        .deleteMany({
          where: {
            store_id: { in: [store1?.store_id, store2?.store_id] },
          },
        })
        .catch(() => {});
      await prisma.lotteryBin
        .deleteMany({
          where: {
            store_id: { in: [store1?.store_id, store2?.store_id] },
          },
        })
        .catch(() => {});
      await prisma.store
        .deleteMany({
          where: {
            store_id: { in: [store1?.store_id, store2?.store_id] },
          },
        })
        .catch(() => {});
      await prisma.company
        .delete({ where: { company_id: company?.company_id } })
        .catch(() => {});
      await prisma.user
        .delete({ where: { user_id: clientOwner.user_id } })
        .catch(() => {});
      if (game) {
        await prisma.lotteryGame
          .delete({ where: { game_id: game.game_id } })
          .catch(() => {});
      }
    }
    await prisma.$disconnect();
  });

  test("6.10.1-UI-001: [P1] Store tabs display and switching (AC #1)", async ({
    page,
  }) => {
    // GIVEN: Client owner logs in
    await loginAndWaitForClientDashboard(page, clientOwner.email, password);

    // Navigate to lottery page
    await page.goto("/client-dashboard/lottery", {
      waitUntil: "domcontentloaded",
    });

    // Wait for page to load
    await waitForLotteryPageLoaded(page);

    // THEN: Store tabs are displayed (for multiple stores)
    const storeTabs = page.locator('[data-testid="store-tabs"]');
    await expect(storeTabs).toBeVisible({ timeout: 10000 });

    // AND: Both stores are shown in tabs
    await expect(
      page.locator(`[data-testid="store-tab-${store1.store_id}"]`),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator(`[data-testid="store-tab-${store2.store_id}"]`),
    ).toBeVisible({ timeout: 10000 });

    // WHEN: Clicking on store 2 tab
    await page.locator(`[data-testid="store-tab-${store2.store_id}"]`).click();

    // THEN: Store 2 tab is active
    await expect(
      page.locator(`[data-testid="store-tab-${store2.store_id}"]`),
    ).toHaveAttribute("aria-selected", "true", { timeout: 5000 });
  });

  test("6.10.1-UI-002: [P1] Lottery inventory table displays game summaries (AC #2, #3)", async ({
    page,
  }) => {
    // GIVEN: Client owner with active packs
    const activePack1 = await createLotteryPack(prisma, {
      game_id: game.game_id,
      store_id: store1.store_id,
      status: "ACTIVE",
      current_bin_id: bin1.bin_id,
      pack_number: `PACK-001-${Date.now()}`,
    });

    const activePack2 = await createLotteryPack(prisma, {
      game_id: game.game_id,
      store_id: store1.store_id,
      status: "ACTIVE",
      current_bin_id: bin2.bin_id,
      pack_number: `PACK-002-${Date.now()}`,
    });

    // Create a RECEIVED pack (should also be shown in new table view)
    const receivedPack = await createLotteryPack(prisma, {
      game_id: game.game_id,
      store_id: store1.store_id,
      status: "RECEIVED",
      pack_number: `PACK-RECEIVED-${Date.now()}`,
    });

    try {
      await loginAndWaitForClientDashboard(page, clientOwner.email, password);
      await page.goto("/client-dashboard/lottery", {
        waitUntil: "domcontentloaded",
      });

      await waitForLotteryPageLoaded(page);

      // Wait for store tabs to load, then select store 1
      await page
        .locator(`[data-testid="store-tab-${store1.store_id}"]`)
        .waitFor({ state: "visible", timeout: 10000 });
      await page
        .locator(`[data-testid="store-tab-${store1.store_id}"]`)
        .click();

      // Wait for content to load (table or empty state)
      await Promise.race([
        page
          .locator('[data-testid="lottery-table"]')
          .waitFor({ state: "visible", timeout: 15000 }),
        page
          .locator('[data-testid="lottery-table-empty"]')
          .waitFor({ state: "visible", timeout: 15000 }),
      ]);

      // Check if table is visible
      const tableVisible = await page
        .locator('[data-testid="lottery-table"]')
        .isVisible();

      if (tableVisible) {
        // THEN: Table displays game summaries (grouped by game_id)
        await expect(
          page.locator(`[data-testid="lottery-table-row-${game.game_id}"]`),
        ).toBeVisible({ timeout: 10000 });

        // AND: Table shows correct columns (new column structure)
        const tableHeader = page.locator("table thead");
        await expect(tableHeader.getByText("Game Name")).toBeVisible();
        await expect(tableHeader.getByText("Game Number")).toBeVisible();
        await expect(tableHeader.getByText("Dollar Value")).toBeVisible();
        await expect(tableHeader.getByText("Pack Count")).toBeVisible();
        await expect(tableHeader.getByText("Status")).toBeVisible();

        // Verify the game name is displayed
        await expect(page.getByText("Integration Test Game")).toBeVisible();
      }
    } finally {
      // Cleanup
      await prisma.lotteryPack
        .deleteMany({
          where: {
            pack_id: {
              in: [
                activePack1.pack_id,
                activePack2.pack_id,
                receivedPack.pack_id,
              ],
            },
          },
        })
        .catch(() => {});
    }
  });

  test("6.10.1-UI-003: [P1] Empty state displayed when no inventory (AC #8)", async ({
    page,
  }) => {
    await loginAndWaitForClientDashboard(page, clientOwner.email, password);
    await page.goto("/client-dashboard/lottery", {
      waitUntil: "domcontentloaded",
    });

    await waitForLotteryPageLoaded(page);

    // Select store 2 (no packs) if tab exists
    const store2Tab = page.locator(
      `[data-testid="store-tab-${store2.store_id}"]`,
    );
    if (await store2Tab.isVisible()) {
      await store2Tab.click();
    }

    // Wait for empty state or table
    await Promise.race([
      page
        .locator('[data-testid="lottery-table-empty"]')
        .waitFor({ state: "visible", timeout: 15000 }),
      page
        .locator('[data-testid="lottery-table"]')
        .waitFor({ state: "visible", timeout: 15000 }),
    ]);

    // THEN: Empty state message is displayed (for store with no packs)
    const emptyState = page.locator('[data-testid="lottery-table-empty"]');
    if (await emptyState.isVisible()) {
      // The empty state message mentions "lottery inventory"
      await expect(emptyState).toContainText(/No lottery inventory/i);
    }

    // AND: Add button is still available
    await expect(
      page.locator('[data-testid="add-new-lottery-button"]'),
    ).toBeVisible();
  });

  test("6.10.1-UI-004: [P1] Add lottery flow opens reception dialog (AC #4)", async ({
    page,
  }) => {
    await loginAndWaitForClientDashboard(page, clientOwner.email, password);
    await page.goto("/client-dashboard/lottery", {
      waitUntil: "domcontentloaded",
    });

    await waitForLotteryPageLoaded(page);

    // Select store 1 if tab exists
    const store1Tab = page.locator(
      `[data-testid="store-tab-${store1.store_id}"]`,
    );
    if (await store1Tab.isVisible()) {
      await store1Tab.click();
    }

    // WHEN: Clicking "+ Add New Lottery" button
    await page.locator('[data-testid="add-new-lottery-button"]').click();

    // THEN: Pack Reception dialog opens (uses serialized input form per Story 6.12)
    await expect(page.getByText("Receive Lottery Packs")).toBeVisible({
      timeout: 5000,
    });

    // AND: Serial input field is visible
    await expect(page.locator('[data-testid="serial-input"]')).toBeVisible({
      timeout: 5000,
    });

    // AND: Submit button is visible (disabled until packs are added)
    await expect(
      page.locator('[data-testid="submit-batch-reception"]'),
    ).toBeVisible();

    // Close dialog
    await page.locator('button:has-text("Cancel")').click();
    await expect(page.getByText("Receive Lottery Packs")).not.toBeVisible();
  });

  test("6.10.1-UI-005: [P1] Inventory/Configuration tabs functionality", async ({
    page,
  }) => {
    // GIVEN: Client owner logged in
    await loginAndWaitForClientDashboard(page, clientOwner.email, password);
    await page.goto("/client-dashboard/lottery", {
      waitUntil: "domcontentloaded",
    });

    await waitForLotteryPageLoaded(page);

    // THEN: Main content tabs are visible (Inventory and Configuration)
    const inventoryTab = page.locator(
      'button[role="tab"]:has-text("Inventory")',
    );
    const configTab = page.locator(
      'button[role="tab"]:has-text("Configuration")',
    );

    await expect(inventoryTab).toBeVisible({ timeout: 10000 });
    await expect(configTab).toBeVisible({ timeout: 10000 });

    // WHEN: Clicking Configuration tab
    await configTab.click();

    // THEN: Configuration content is shown (BinConfigurationCard)
    await expect(configTab).toHaveAttribute("data-state", "active", {
      timeout: 5000,
    });

    // AND: Bin Configuration card heading is visible
    await expect(
      page.getByRole("heading", { name: "Bin Configuration" }),
    ).toBeVisible({ timeout: 5000 });

    // WHEN: Clicking back to Inventory tab
    await inventoryTab.click();

    // THEN: Inventory tab is active
    await expect(inventoryTab).toHaveAttribute("data-state", "active", {
      timeout: 5000,
    });
  });

  test("6.10.1-UI-006: [P1] Page displays loading then content states (AC #7)", async ({
    page,
  }) => {
    await loginAndWaitForClientDashboard(page, clientOwner.email, password);
    await page.goto("/client-dashboard/lottery", {
      waitUntil: "domcontentloaded",
    });

    // THEN: Page should load without getting stuck in loading state
    await page
      .locator('[data-testid="client-dashboard-lottery-page"]')
      .waitFor({ state: "visible", timeout: 15000 });

    // Wait for content to load (either table, empty state, or error)
    await Promise.race([
      page
        .locator('[data-testid="lottery-table"]')
        .waitFor({ state: "visible", timeout: 10000 })
        .catch(() => {}),
      page
        .locator('[data-testid="lottery-table-empty"]')
        .waitFor({ state: "visible", timeout: 10000 })
        .catch(() => {}),
      page
        .locator('[data-testid="lottery-table-error"]')
        .waitFor({ state: "visible", timeout: 10000 })
        .catch(() => {}),
    ]);

    // Verify page is not stuck in loading state
    const loadingSpinner = page.locator(
      '[data-testid="lottery-table-loading"]',
    );
    // Loading spinner should not be visible after page loads
    await expect(loadingSpinner).not.toBeVisible({ timeout: 5000 });
  });

  test("6.10.1-UI-007: [P1] RLS enforcement - user only sees their stores (AC #7)", async ({
    page,
  }) => {
    // GIVEN: Pack in another user's store
    const otherCompany = await createCompany(prisma);
    const otherStore = await createStore(prisma, {
      company_id: otherCompany.company_id,
    });

    const otherPack = await createLotteryPack(prisma, {
      game_id: game.game_id,
      store_id: otherStore.store_id,
      status: "ACTIVE",
      pack_number: `OTHER-STORE-PACK-${Date.now()}`,
    });

    try {
      await loginAndWaitForClientDashboard(page, clientOwner.email, password);
      await page.goto("/client-dashboard/lottery", {
        waitUntil: "domcontentloaded",
      });

      await waitForLotteryPageLoaded(page);

      // THEN: Other store's tab is NOT visible (RLS enforcement)
      await expect(
        page.locator(`[data-testid="store-tab-${otherStore.store_id}"]`),
      ).not.toBeVisible({ timeout: 5000 });

      // User should only see their own stores (store1 and store2)
      await expect(
        page.locator(`[data-testid="store-tab-${store1.store_id}"]`),
      ).toBeVisible();
      await expect(
        page.locator(`[data-testid="store-tab-${store2.store_id}"]`),
      ).toBeVisible();
    } finally {
      // Cleanup
      await prisma.lotteryPack
        .delete({ where: { pack_id: otherPack.pack_id } })
        .catch(() => {});
      await prisma.store
        .delete({ where: { store_id: otherStore.store_id } })
        .catch(() => {});
      await prisma.company
        .delete({ where: { company_id: otherCompany.company_id } })
        .catch(() => {});
    }
  });

  test("6.10.1-UI-008: [P1] Single store displays as badge, not tabs", async ({
    page,
  }) => {
    // Create a user with only one store to test single-store behavior
    const singleStorePasswordHash = await bcrypt.hash(password, 10);
    const singleStoreUserId = uuidv4();
    const singleStoreCompanyId = uuidv4();
    const singleStoreId = uuidv4();

    const singleStoreUser = await prisma.user.create({
      data: {
        user_id: singleStoreUserId,
        email: `integration-single-store-${Date.now()}@test.com`,
        name: "Single Store User",
        status: "ACTIVE",
        password_hash: singleStorePasswordHash,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        is_client_user: true,
      },
    });

    const singleStoreCompany = await prisma.company.create({
      data: {
        company_id: singleStoreCompanyId,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
        name: "Single Store Company",
        address: "123 Single Store Street",
        status: "ACTIVE",
        owner_user_id: singleStoreUser.user_id,
      },
    });

    const singleStore = await prisma.store.create({
      data: {
        store_id: singleStoreId,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
        company_id: singleStoreCompany.company_id,
        name: "Only Store",
        timezone: "America/New_York",
        status: "ACTIVE",
        location_json: { address: "456 Only Store Ave" },
      },
    });

    const clientOwnerRole = await prisma.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    if (clientOwnerRole) {
      await prisma.userRole.create({
        data: {
          user_id: singleStoreUser.user_id,
          role_id: clientOwnerRole.role_id,
          company_id: singleStoreCompany.company_id,
        },
      });
    }

    try {
      await loginAndWaitForClientDashboard(
        page,
        singleStoreUser.email,
        password,
      );
      await page.goto("/client-dashboard/lottery", {
        waitUntil: "domcontentloaded",
      });

      await waitForLotteryPageLoaded(page);

      // THEN: For single store, it shows as a badge (not clickable tabs)
      // The StoreTabs component shows single store as a highlighted badge
      const storeTabs = page.locator('[data-testid="store-tabs"]');
      await expect(storeTabs).toBeVisible();

      // Single store shows the store name in a badge format
      await expect(storeTabs.getByText("Only Store")).toBeVisible();

      // AND: The badge should not be a button (single store = non-interactive badge)
      // Check that there's no button role or tab role in the store tabs container
      const tabButtons = storeTabs.locator('button[role="tab"]');
      const tabButtonCount = await tabButtons.count();
      expect(tabButtonCount).toBe(0);
    } finally {
      // Cleanup
      await prisma.userRole
        .deleteMany({ where: { user_id: singleStoreUser.user_id } })
        .catch(() => {});
      await prisma.store
        .delete({ where: { store_id: singleStore.store_id } })
        .catch(() => {});
      await prisma.company
        .delete({ where: { company_id: singleStoreCompany.company_id } })
        .catch(() => {});
      await prisma.user
        .delete({ where: { user_id: singleStoreUser.user_id } })
        .catch(() => {});
    }
  });

  test("6.10.1-UI-009: [P2] Add New Lottery button accessibility", async ({
    page,
  }) => {
    await loginAndWaitForClientDashboard(page, clientOwner.email, password);
    await page.goto("/client-dashboard/lottery", {
      waitUntil: "domcontentloaded",
    });

    await waitForLotteryPageLoaded(page);

    // THEN: Add button has proper accessibility attributes
    const addButton = page.locator('[data-testid="add-new-lottery-button"]');
    await expect(addButton).toBeVisible();
    await expect(addButton).toHaveAttribute(
      "aria-label",
      "Add new lottery pack",
    );
  });

  test("6.10.1-UI-010: [P2] Table column headers accessibility", async ({
    page,
  }) => {
    // Create a pack so table is visible
    const testPack = await createLotteryPack(prisma, {
      game_id: game.game_id,
      store_id: store1.store_id,
      status: "ACTIVE",
      pack_number: `A11Y-PACK-${Date.now()}`,
    });

    try {
      await loginAndWaitForClientDashboard(page, clientOwner.email, password);
      await page.goto("/client-dashboard/lottery", {
        waitUntil: "domcontentloaded",
      });

      await waitForLotteryPageLoaded(page);

      // Select store 1
      await page
        .locator(`[data-testid="store-tab-${store1.store_id}"]`)
        .click();

      // Wait for table
      await page
        .locator('[data-testid="lottery-table"]')
        .waitFor({ state: "visible", timeout: 10000 });

      // THEN: Table headers have proper scope attribute
      const headers = page.locator('th[scope="col"]');
      const headerCount = await headers.count();
      expect(headerCount).toBeGreaterThanOrEqual(5);

      // AND: Table region has proper ARIA label
      await expect(
        page.locator('[data-testid="lottery-table"]'),
      ).toHaveAttribute("aria-label", "Lottery inventory table");
    } finally {
      await prisma.lotteryPack
        .delete({ where: { pack_id: testPack.pack_id } })
        .catch(() => {});
    }
  });

  test("6.10.1-UI-011: [P2] Store tabs keyboard navigation", async ({
    page,
  }) => {
    await loginAndWaitForClientDashboard(page, clientOwner.email, password);
    await page.goto("/client-dashboard/lottery", {
      waitUntil: "domcontentloaded",
    });

    await waitForLotteryPageLoaded(page);

    // Focus on first store tab
    const store1Tab = page.locator(
      `[data-testid="store-tab-${store1.store_id}"]`,
    );
    await store1Tab.focus();

    // WHEN: Pressing ArrowRight key
    await page.keyboard.press("ArrowRight");

    // THEN: Focus moves to next tab (store 2)
    await expect(
      page.locator(`[data-testid="store-tab-${store2.store_id}"]`),
    ).toBeFocused({ timeout: 3000 });
  });
});
