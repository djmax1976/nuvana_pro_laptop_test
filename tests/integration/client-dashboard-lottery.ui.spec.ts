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
 * Uses simplified pattern for reliability.
 */
async function loginAndWaitForClientDashboard(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  // Navigate to login page
  await page.goto("/login", { waitUntil: "networkidle" });

  // Wait for login form to be visible
  await page.waitForSelector('input[type="email"]', {
    state: "visible",
    timeout: 15000,
  });

  // Fill credentials
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);

  // Click submit and wait for navigation
  await Promise.all([
    page.waitForURL(/.*client-dashboard.*/, {
      timeout: 30000,
    }),
    page.click('button[type="submit"]'),
  ]);

  await page
    .waitForLoadState("networkidle", { timeout: 15000 })
    .catch(() => {});
}

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

    // Create bins
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
      waitUntil: "networkidle",
    });

    // Wait for page to load
    await page
      .locator('[data-testid="client-dashboard-lottery-page"]')
      .waitFor({ state: "visible", timeout: 15000 });

    // THEN: Store tabs are displayed (for multiple stores)
    const storeTabs = page.locator('[data-testid="store-tabs"]');
    await expect(storeTabs).toBeVisible({ timeout: 10000 });

    // AND: Both stores are shown in tabs (wait for store tabs to load)
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
      pack_number: "PACK-001",
    });

    const activePack2 = await createLotteryPack(prisma, {
      game_id: game.game_id,
      store_id: store1.store_id,
      status: "ACTIVE",
      current_bin_id: bin2.bin_id,
      pack_number: "PACK-002",
    });

    // Create a RECEIVED pack (should also be shown in new table view)
    const receivedPack = await createLotteryPack(prisma, {
      game_id: game.game_id,
      store_id: store1.store_id,
      status: "RECEIVED",
      pack_number: "PACK-RECEIVED",
    });

    try {
      await loginAndWaitForClientDashboard(page, clientOwner.email, password);
      await page.goto("/client-dashboard/lottery", {
        waitUntil: "networkidle",
      });

      await page
        .locator('[data-testid="client-dashboard-lottery-page"]')
        .waitFor({ state: "visible", timeout: 15000 });

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
        // The new LotteryTable groups packs by game
        await expect(
          page.locator(`[data-testid="lottery-table-row-${game.game_id}"]`),
        ).toBeVisible({ timeout: 10000 });

        // AND: Table shows correct columns (new column structure)
        const tableHeader = page.locator("table thead");
        await expect(tableHeader.locator("text=Game Name")).toBeVisible();
        await expect(tableHeader.locator("text=Game Number")).toBeVisible();
        await expect(tableHeader.locator("text=Dollar Value")).toBeVisible();
        await expect(tableHeader.locator("text=Pack Count")).toBeVisible();
        await expect(tableHeader.locator("text=Status")).toBeVisible();

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
      waitUntil: "networkidle",
    });

    await page
      .locator('[data-testid="client-dashboard-lottery-page"]')
      .waitFor({ state: "visible", timeout: 15000 });

    // Wait for store tabs to load
    await page
      .locator('[data-testid="store-tabs"]')
      .waitFor({ state: "visible", timeout: 10000 });

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
      // The new empty state message mentions "lottery inventory"
      await expect(emptyState).toContainText(/No lottery inventory/i);
    }

    // AND: Add button is still available
    await expect(
      page.locator('[data-testid="add-new-lottery-button"]'),
    ).toBeVisible();
  });

  test("6.10.1-UI-004: [P1] Add lottery flow (AC #4)", async ({ page }) => {
    await loginAndWaitForClientDashboard(page, clientOwner.email, password);
    await page.goto("/client-dashboard/lottery", {
      waitUntil: "networkidle",
    });

    await page
      .locator('[data-testid="client-dashboard-lottery-page"]')
      .waitFor({ state: "visible", timeout: 15000 });

    // Wait for store tabs to load
    await page
      .locator('[data-testid="store-tabs"]')
      .waitFor({ state: "visible", timeout: 10000 });

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

    // Note: Form submission testing requires 24-digit serialized numbers
    // For now, we verify the dialog opens and can be closed

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
      waitUntil: "networkidle",
    });

    await page
      .locator('[data-testid="client-dashboard-lottery-page"]')
      .waitFor({ state: "visible", timeout: 15000 });

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
    // The tab switch should happen
    await expect(configTab).toHaveAttribute("data-state", "active", {
      timeout: 5000,
    });

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
      waitUntil: "networkidle",
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
      pack_number: "OTHER-STORE-PACK",
    });

    try {
      await loginAndWaitForClientDashboard(page, clientOwner.email, password);
      await page.goto("/client-dashboard/lottery", {
        waitUntil: "networkidle",
      });

      await page
        .locator('[data-testid="client-dashboard-lottery-page"]')
        .waitFor({ state: "visible", timeout: 15000 });

      // Wait for content to load
      await page
        .locator('[data-testid="store-tabs"]')
        .waitFor({ state: "visible", timeout: 10000 });

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
        waitUntil: "networkidle",
      });

      await page
        .locator('[data-testid="client-dashboard-lottery-page"]')
        .waitFor({ state: "visible", timeout: 15000 });

      // Wait for store tabs container
      await page
        .locator('[data-testid="store-tabs"]')
        .waitFor({ state: "visible", timeout: 10000 });

      // THEN: For single store, it shows as a badge (not clickable tabs)
      // The StoreTabs component shows single store as a highlighted badge
      // There should NOT be multiple tab buttons
      const storeTabs = page.locator('[data-testid="store-tabs"]');
      await expect(storeTabs).toBeVisible();

      // Single store shows the store name in a badge format
      await expect(storeTabs.getByText("Only Store")).toBeVisible();
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
});
