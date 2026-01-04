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
 * - Filter functionality (game name, status, date range)
 * - Expandable rows with pack details
 * - Total Bins and Total Remaining Packs badges
 *
 * Note: The LotteryTable component now displays inventory grouped by game
 * with columns: Game Name, Game Number, Dollar Value, Pack Count, Status
 * Rows are expandable to show pack details (sub-list)
 *
 * @test-level Integration
 * @justification Tests UI components with real API integration, authentication, and data flow
 * @story 6-10-1 - Client Dashboard Lottery Page
 * @priority P1 (High - Core User Journey, Security)
 *
 * IMPORTANT: Uses bcryptjs (not bcrypt) for password hashing to match backend
 * Uses withBypassClient for role creation to avoid RLS restrictions
 *
 * Enterprise Best Practices Applied:
 * - ISOLATED TEST FIXTURES: Each test creates and cleans up its own data
 * - Network-first wait patterns for CI/CD reliability
 * - Retry patterns for flaky network conditions
 * - Comprehensive cleanup in finally blocks
 * - ARIA and accessibility attribute verification
 * - Security-conscious test patterns (RLS verification)
 * - NO SERIAL MODE: Tests run in parallel without cascade failures
 */

import { config } from "dotenv";
// Load environment variables from .env.local as defaults
// IMPORTANT: Do NOT use override: true - the test script's DATABASE_URL
// (e.g., nuvana_test) must take precedence over .env.local's DATABASE_URL
config({ path: ".env.local" });

import { test, expect, Page } from "@playwright/test";
import bcrypt from "bcryptjs";
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
 * Test fixture data structure for isolated test execution
 * Each test creates its own complete set of test data
 */
interface LotteryTestFixture {
  prisma: PrismaClient;
  clientOwner: { user_id: string; email: string; name: string };
  company: { company_id: string; name: string };
  store1: { store_id: string; name: string };
  store2: { store_id: string; name: string };
  game: { game_id: string; name: string };
  bin1?: { bin_id: string; name: string };
  bin2?: { bin_id: string; name: string };
  password: string;
}

/**
 * Creates an isolated test fixture with its own user, company, stores, and lottery data.
 * Each test gets completely independent data to prevent cross-test interference.
 *
 * @param testId - Unique identifier for this test's data
 * @param options - Configuration options for the fixture
 */
async function createTestFixture(
  testId: string,
  options: {
    withBins?: boolean;
    singleStore?: boolean;
  } = {},
): Promise<LotteryTestFixture> {
  // Add random delay (0-3s) to prevent thundering herd when tests run in parallel
  // With 4 workers running 199 tests, we need more spread to avoid database and
  // Next.js server contention in CI environments
  const staggerDelay = Math.floor(Math.random() * 3000);
  await new Promise((resolve) => setTimeout(resolve, staggerDelay));

  const prisma = new PrismaClient();
  await prisma.$connect();

  const password = "TestPassword123!";
  const passwordHash = await bcrypt.hash(password, 10);
  const timestamp = Date.now();

  // Create unique user for this test
  const userId = uuidv4();
  const clientOwner = await prisma.user.create({
    data: {
      user_id: userId,
      email: `lottery-ui-${testId}-${timestamp}@test.com`,
      name: `Lottery UI Test ${testId}`,
      status: "ACTIVE",
      password_hash: passwordHash,
      public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
      is_client_user: true,
    },
  });

  // Create unique company for this test
  const companyId = uuidv4();
  const company = await prisma.company.create({
    data: {
      company_id: companyId,
      public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
      name: `Lottery UI Test Company ${testId}`,
      address: `${testId} Lottery Test Street`,
      status: "ACTIVE",
      owner_user_id: clientOwner.user_id,
    },
  });

  // Create store 1
  const store1Id = uuidv4();
  const store1 = await prisma.store.create({
    data: {
      store_id: store1Id,
      public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
      company_id: company.company_id,
      name: `Lottery Store 1 - ${testId}`,
      timezone: "America/New_York",
      status: "ACTIVE",
      location_json: { address: `${testId} Store 1 Ave` },
    },
  });

  // Create store 2 (unless single store mode)
  let store2: { store_id: string; name: string };
  if (!options.singleStore) {
    const store2Id = uuidv4();
    const store2Record = await prisma.store.create({
      data: {
        store_id: store2Id,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
        company_id: company.company_id,
        name: `Lottery Store 2 - ${testId}`,
        timezone: "America/New_York",
        status: "ACTIVE",
        location_json: { address: `${testId} Store 2 Ave` },
      },
    });
    store2 = { store_id: store2Record.store_id, name: store2Record.name };
  } else {
    // For single store tests, create a placeholder that won't be used
    store2 = { store_id: "", name: "" };
  }

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
  const game = await createLotteryGame(prisma, {
    name: `Test Game ${testId}`,
    price: 5.0,
  });

  // Create bins if requested
  let bin1, bin2;
  if (options.withBins) {
    bin1 = await createLotteryBin(prisma, {
      store_id: store1.store_id,
      name: `Bin 1 - ${testId}`,
    });

    bin2 = await createLotteryBin(prisma, {
      store_id: store1.store_id,
      name: `Bin 2 - ${testId}`,
    });
  }

  return {
    prisma,
    clientOwner: {
      user_id: clientOwner.user_id,
      email: clientOwner.email,
      name: clientOwner.name,
    },
    company: { company_id: company.company_id, name: company.name },
    store1: { store_id: store1.store_id, name: store1.name },
    store2,
    game: { game_id: game.game_id, name: game.name },
    bin1: bin1 ? { bin_id: bin1.bin_id, name: bin1.name } : undefined,
    bin2: bin2 ? { bin_id: bin2.bin_id, name: bin2.name } : undefined,
    password,
  };
}

/**
 * Cleans up all test data created by createTestFixture.
 * MUST be called in a finally block to ensure cleanup happens even on test failure.
 */
async function cleanupTestFixture(fixture: LotteryTestFixture): Promise<void> {
  const { prisma, clientOwner, company, store1, store2, game } = fixture;

  try {
    // Delete in reverse order of creation (respect foreign keys)
    await prisma.lotteryPack
      .deleteMany({
        where: {
          store_id: {
            in: [store1.store_id, store2.store_id].filter(Boolean),
          },
        },
      })
      .catch(() => {});

    await prisma.lotteryBin
      .deleteMany({
        where: {
          store_id: {
            in: [store1.store_id, store2.store_id].filter(Boolean),
          },
        },
      })
      .catch(() => {});

    await prisma.userRole
      .deleteMany({ where: { user_id: clientOwner.user_id } })
      .catch(() => {});

    if (store1.store_id) {
      await prisma.store
        .delete({ where: { store_id: store1.store_id } })
        .catch(() => {});
    }

    if (store2.store_id) {
      await prisma.store
        .delete({ where: { store_id: store2.store_id } })
        .catch(() => {});
    }

    await prisma.company
      .delete({ where: { company_id: company.company_id } })
      .catch(() => {});

    await prisma.user
      .delete({ where: { user_id: clientOwner.user_id } })
      .catch(() => {});

    if (game.game_id) {
      await prisma.lotteryGame
        .delete({ where: { game_id: game.game_id } })
        .catch(() => {});
    }
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Helper function to perform login and wait for client dashboard.
 * Uses network-first pattern for reliable test stability in CI/CD.
 * Handles backend restarts by retrying on connection errors.
 *
 * Enterprise-grade implementation with:
 * - Configurable retry logic for resilience
 * - Network response validation before proceeding
 * - Proper timeout management for slow CI environments
 * - Detailed error messages for debugging
 */
async function loginAndWaitForClientDashboard(
  page: Page,
  email: string,
  password: string,
  retryCount = 0,
): Promise<void> {
  const MAX_RETRIES = 2;
  const FORM_VISIBILITY_TIMEOUT = 30000; // Increased for slow CI
  const INPUT_EDITABLE_TIMEOUT = 15000;
  const LOGIN_API_TIMEOUT = 45000;
  const NAVIGATION_TIMEOUT = 45000;

  try {
    // Navigate to login page
    await page.goto("/login", { waitUntil: "networkidle" });

    // Wait for login form to be visible and ready for input
    const emailInput = page.locator("#email");
    await emailInput.waitFor({
      state: "visible",
      timeout: FORM_VISIBILITY_TIMEOUT,
    });

    // Wait for input to be editable (ensures React hydration is complete)
    await expect(emailInput).toBeEditable({ timeout: INPUT_EDITABLE_TIMEOUT });

    // Fill credentials using locator and verify the values are entered
    await emailInput.fill(email);
    await page.locator("#password").fill(password);

    // Verify the form is filled before submitting
    await expect(emailInput).toHaveValue(email);
    await expect(page.locator("#password")).toHaveValue(password);

    // Set up response promise BEFORE clicking to avoid race conditions
    const loginResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/auth/login"),
      { timeout: LOGIN_API_TIMEOUT },
    );

    // Click submit button
    await page.getByRole("button", { name: "Sign In" }).click();

    // Wait for login API response
    const loginResponse = await loginResponsePromise;

    // Check for error response
    if (loginResponse.status() === 401) {
      const body = await loginResponse.json().catch(() => ({}));
      throw new Error(`Login failed: ${body.message || "Invalid credentials"}`);
    }

    if (loginResponse.status() !== 200) {
      throw new Error(`Login failed with status ${loginResponse.status()}`);
    }

    // Wait for navigation to client dashboard
    await page.waitForURL(/.*client-dashboard.*/, {
      timeout: NAVIGATION_TIMEOUT,
      waitUntil: "domcontentloaded",
    });

    // CRITICAL: Wait for authenticated content to render before returning
    // This ensures the React auth context is fully populated before navigating
    // to other pages. Without this, navigation to subpages may fail because
    // the auth context hasn't initialized yet.
    await page
      .locator('[data-testid="client-dashboard-page"]')
      .waitFor({ state: "visible", timeout: 30000 });

    // Wait for dashboard API call to complete (provides stores/user data)
    await page
      .waitForResponse(
        (resp) =>
          resp.url().includes("/api/client/dashboard") && resp.status() === 200,
        { timeout: 30000 },
      )
      .catch(() => {
        // API might already have completed before we started listening
      });

    // Wait for network idle to ensure all React context updates are complete
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {
      // networkidle might timeout if there are long-polling requests
    });
  } catch (error) {
    // Retry on connection errors (backend restart)
    if (
      retryCount < MAX_RETRIES &&
      error instanceof Error &&
      (error.message.includes("ERR_CONNECTION_REFUSED") ||
        error.message.includes("net::"))
    ) {
      console.log(
        `Connection error, retrying login (attempt ${retryCount + 2}/${MAX_RETRIES + 1})...`,
      );
      await page.waitForTimeout(2000); // Wait for backend to restart
      return loginAndWaitForClientDashboard(
        page,
        email,
        password,
        retryCount + 1,
      );
    }
    throw error;
  }
}

/**
 * Helper function to wait for lottery page data to load
 * Implements network-first wait strategy for stable CI execution
 *
 * Strategy:
 * 1. Wait for dashboard API call (provides stores data) - network-first
 * 2. Wait for page container to be visible
 * 3. Wait for store tabs or empty state
 */
async function waitForLotteryPageLoaded(page: Page): Promise<void> {
  const API_TIMEOUT = 45000; // Increased for CI load
  const PAGE_CONTAINER_TIMEOUT = 30000; // Increased for CI load
  const STORE_TABS_TIMEOUT = 30000; // Increased for CI load

  // Network-first: Wait for dashboard API call to complete (provides store list)
  // This API populates the stores for the lottery page
  await page
    .waitForResponse(
      (resp) =>
        resp.url().includes("/api/client/dashboard") && resp.status() === 200,
      { timeout: API_TIMEOUT },
    )
    .catch(() => {
      // API might already have completed - continue
    });

  // Wait for the lottery page container
  await page
    .locator('[data-testid="client-dashboard-lottery-page"]')
    .waitFor({ state: "visible", timeout: PAGE_CONTAINER_TIMEOUT });

  // Wait for store tabs OR loading/error/empty state to complete
  await Promise.race([
    page
      .locator('[data-testid="store-tabs"]')
      .waitFor({ state: "visible", timeout: STORE_TABS_TIMEOUT })
      .catch(() => null),
    page
      .getByText(/no stores available/i)
      .waitFor({ state: "visible", timeout: STORE_TABS_TIMEOUT })
      .catch(() => null),
    page
      .getByText(/failed to load/i)
      .waitFor({ state: "visible", timeout: STORE_TABS_TIMEOUT })
      .catch(() => null),
  ]);
}

// REMOVED: test.describe.configure({ mode: "serial" });
// Each test now has isolated fixtures - no need for serial mode

test.describe("6.10.1-Integration: Client Dashboard Lottery Page", () => {
  test("6.10.1-UI-001: [P1] Store tabs display and switching (AC #1)", async ({
    page,
  }) => {
    const fixture = await createTestFixture("001");

    try {
      // GIVEN: Client owner logs in
      await loginAndWaitForClientDashboard(
        page,
        fixture.clientOwner.email,
        fixture.password,
      );

      // Navigate to lottery page
      await page.goto("/client-dashboard/lottery", {
        waitUntil: "domcontentloaded",
      });

      // Wait for page to load
      await waitForLotteryPageLoaded(page);

      // THEN: Store tabs are displayed (for multiple stores)
      const storeTabs = page.locator('[data-testid="store-tabs"]');
      await expect(storeTabs).toBeVisible({ timeout: 30000 });

      // AND: Both stores are shown in tabs
      await expect(
        page.locator(`[data-testid="store-tab-${fixture.store1.store_id}"]`),
      ).toBeVisible({ timeout: 30000 });
      await expect(
        page.locator(`[data-testid="store-tab-${fixture.store2.store_id}"]`),
      ).toBeVisible({ timeout: 30000 });

      // WHEN: Clicking on store 2 tab
      await page
        .locator(`[data-testid="store-tab-${fixture.store2.store_id}"]`)
        .click();

      // THEN: Store 2 tab is active
      await expect(
        page.locator(`[data-testid="store-tab-${fixture.store2.store_id}"]`),
      ).toHaveAttribute("aria-selected", "true", { timeout: 5000 });
    } finally {
      await cleanupTestFixture(fixture);
    }
  });

  test("6.10.1-UI-002: [P1] Lottery inventory table displays game summaries (AC #2, #3)", async ({
    page,
  }) => {
    const fixture = await createTestFixture("002", { withBins: true });
    let activePack1: any, activePack2: any, receivedPack: any;

    try {
      // Create packs for testing
      activePack1 = await createLotteryPack(fixture.prisma, {
        game_id: fixture.game.game_id,
        store_id: fixture.store1.store_id,
        status: "ACTIVE",
        current_bin_id: fixture.bin1!.bin_id,
        pack_number: `PACK-001-${Date.now()}`,
      });

      activePack2 = await createLotteryPack(fixture.prisma, {
        game_id: fixture.game.game_id,
        store_id: fixture.store1.store_id,
        status: "ACTIVE",
        current_bin_id: fixture.bin2!.bin_id,
        pack_number: `PACK-002-${Date.now()}`,
      });

      receivedPack = await createLotteryPack(fixture.prisma, {
        game_id: fixture.game.game_id,
        store_id: fixture.store1.store_id,
        status: "RECEIVED",
        pack_number: `PACK-RECEIVED-${Date.now()}`,
      });

      await loginAndWaitForClientDashboard(
        page,
        fixture.clientOwner.email,
        fixture.password,
      );
      await page.goto("/client-dashboard/lottery", {
        waitUntil: "domcontentloaded",
      });

      await waitForLotteryPageLoaded(page);

      // Wait for store tabs to load, then select store 1
      await page
        .locator(`[data-testid="store-tab-${fixture.store1.store_id}"]`)
        .waitFor({ state: "visible", timeout: 30000 });
      await page
        .locator(`[data-testid="store-tab-${fixture.store1.store_id}"]`)
        .click();

      // Wait for content to load (table or empty state)
      await Promise.race([
        page
          .locator('[data-testid="lottery-table"]')
          .waitFor({ state: "visible", timeout: 30000 }),
        page
          .locator('[data-testid="lottery-table-empty"]')
          .waitFor({ state: "visible", timeout: 30000 }),
      ]);

      // Wait for table to be visible (we created packs, so table should show)
      await expect(page.locator('[data-testid="lottery-table"]')).toBeVisible({
        timeout: 30000,
      });

      // THEN: Table displays game summaries (grouped by game_id)
      await expect(
        page.locator(
          `[data-testid="lottery-table-row-${fixture.game.game_id}"]`,
        ),
      ).toBeVisible({ timeout: 30000 });

      // AND: Table shows correct columns (new column structure)
      const tableHeader = page.locator("table thead");
      await expect(tableHeader.getByText("Game Name")).toBeVisible();
      await expect(tableHeader.getByText("Game Number")).toBeVisible();
      await expect(tableHeader.getByText("Dollar Value")).toBeVisible();
      await expect(tableHeader.getByText("Pack Count")).toBeVisible();
      await expect(tableHeader.getByText("Status")).toBeVisible();

      // Verify the game name is displayed
      await expect(page.getByText(fixture.game.name)).toBeVisible();
    } finally {
      // Cleanup packs first
      if (activePack1) {
        await fixture.prisma.lotteryPack
          .delete({ where: { pack_id: activePack1.pack_id } })
          .catch(() => {});
      }
      if (activePack2) {
        await fixture.prisma.lotteryPack
          .delete({ where: { pack_id: activePack2.pack_id } })
          .catch(() => {});
      }
      if (receivedPack) {
        await fixture.prisma.lotteryPack
          .delete({ where: { pack_id: receivedPack.pack_id } })
          .catch(() => {});
      }
      await cleanupTestFixture(fixture);
    }
  });

  test("6.10.1-UI-003: [P1] Empty state displayed when no inventory (AC #8)", async ({
    page,
  }) => {
    const fixture = await createTestFixture("003");

    try {
      await loginAndWaitForClientDashboard(
        page,
        fixture.clientOwner.email,
        fixture.password,
      );
      await page.goto("/client-dashboard/lottery", {
        waitUntil: "domcontentloaded",
      });

      await waitForLotteryPageLoaded(page);

      // Select store 2 (no packs) if tab exists
      const store2Tab = page.locator(
        `[data-testid="store-tab-${fixture.store2.store_id}"]`,
      );
      if (await store2Tab.isVisible()) {
        await store2Tab.click();
        // Wait for store selection to be reflected in aria-selected
        await expect(store2Tab).toHaveAttribute("aria-selected", "true", {
          timeout: 5000,
        });
      }

      // Wait for empty state or table (store 2 has no packs, so should show empty state)
      await Promise.race([
        page
          .locator('[data-testid="lottery-table-empty"]')
          .waitFor({ state: "visible", timeout: 30000 }),
        page
          .locator('[data-testid="lottery-table"]')
          .waitFor({ state: "visible", timeout: 30000 }),
      ]);

      // THEN: Empty state message is displayed (for store with no packs)
      const emptyState = page.locator('[data-testid="lottery-table-empty"]');
      // Store 2 has no packs, so empty state should be visible
      await expect(emptyState).toBeVisible({ timeout: 30000 });
      // The empty state message mentions "lottery inventory"
      await expect(emptyState).toContainText(/No lottery inventory/i);

      // AND: Receive Packs button is still available
      await expect(
        page.locator('[data-testid="receive-packs-button"]'),
      ).toBeVisible();
    } finally {
      await cleanupTestFixture(fixture);
    }
  });

  test("6.10.1-UI-004: [P1] Add lottery flow opens reception dialog (AC #4)", async ({
    page,
  }) => {
    const fixture = await createTestFixture("004");

    try {
      await loginAndWaitForClientDashboard(
        page,
        fixture.clientOwner.email,
        fixture.password,
      );
      await page.goto("/client-dashboard/lottery", {
        waitUntil: "domcontentloaded",
      });

      await waitForLotteryPageLoaded(page);

      // Select store 1 if tab exists
      const store1Tab = page.locator(
        `[data-testid="store-tab-${fixture.store1.store_id}"]`,
      );
      if (await store1Tab.isVisible()) {
        await store1Tab.click();
      }

      // WHEN: Clicking "+ Receive Packs" button
      await page.locator('[data-testid="receive-packs-button"]').click();

      // THEN: Pack Reception dialog opens (uses serialized input form per Story 6.12)
      // Use getByRole to target the heading specifically, avoiding the sr-only description
      await expect(
        page.getByRole("heading", { name: "Receive Lottery Packs" }),
      ).toBeVisible({
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
      await expect(
        page.getByRole("heading", { name: "Receive Lottery Packs" }),
      ).not.toBeVisible();
    } finally {
      await cleanupTestFixture(fixture);
    }
  });

  test("6.10.1-UI-005: [P1] Inventory/Configuration tabs functionality", async ({
    page,
  }) => {
    const fixture = await createTestFixture("005");

    try {
      // GIVEN: Client owner logged in
      await loginAndWaitForClientDashboard(
        page,
        fixture.clientOwner.email,
        fixture.password,
      );
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

      await expect(inventoryTab).toBeVisible({ timeout: 30000 });
      await expect(configTab).toBeVisible({ timeout: 30000 });

      // WHEN: Clicking Configuration tab
      await configTab.click();

      // THEN: Configuration tab becomes active
      await expect(configTab).toHaveAttribute("data-state", "active", {
        timeout: 5000,
      });

      // WHEN: Clicking back to Inventory tab
      await inventoryTab.click();

      // THEN: Inventory tab is active
      await expect(inventoryTab).toHaveAttribute("data-state", "active", {
        timeout: 5000,
      });
    } finally {
      await cleanupTestFixture(fixture);
    }
  });

  test("6.10.1-UI-006: [P1] Page displays loading then content states (AC #7)", async ({
    page,
  }) => {
    const fixture = await createTestFixture("006");

    try {
      await loginAndWaitForClientDashboard(
        page,
        fixture.clientOwner.email,
        fixture.password,
      );
      await page.goto("/client-dashboard/lottery", {
        waitUntil: "domcontentloaded",
      });

      // Wait for dashboard API to provide store list (network-first)
      await page
        .waitForResponse(
          (resp) =>
            resp.url().includes("/api/client/dashboard") &&
            resp.status() === 200,
          { timeout: 45000 },
        )
        .catch(() => {});

      // THEN: Page should load without getting stuck in loading state
      await page
        .locator('[data-testid="client-dashboard-lottery-page"]')
        .waitFor({ state: "visible", timeout: 30000 });

      // Wait for content to load (either table, empty state, or error)
      await Promise.race([
        page
          .locator('[data-testid="lottery-table"]')
          .waitFor({ state: "visible", timeout: 30000 })
          .catch(() => {}),
        page
          .locator('[data-testid="lottery-table-empty"]')
          .waitFor({ state: "visible", timeout: 30000 })
          .catch(() => {}),
        page
          .locator('[data-testid="lottery-table-error"]')
          .waitFor({ state: "visible", timeout: 30000 })
          .catch(() => {}),
      ]);

      // Verify page is not stuck in loading state
      const loadingSpinner = page.locator(
        '[data-testid="lottery-table-loading"]',
      );
      // Loading spinner should not be visible after page loads
      await expect(loadingSpinner).not.toBeVisible({ timeout: 5000 });

      // AND: Verify that some content is actually displayed (not stuck in loading)
      // Wait for one of the content states to be visible
      await Promise.race([
        page
          .locator('[data-testid="lottery-table"]')
          .waitFor({ state: "visible", timeout: 10000 }),
        page
          .locator('[data-testid="lottery-table-empty"]')
          .waitFor({ state: "visible", timeout: 10000 }),
        page
          .locator('[data-testid="lottery-table-error"]')
          .waitFor({ state: "visible", timeout: 10000 }),
      ]).catch(() => {
        // If none became visible, that's what we're testing for
      });

      // Now check if any content is visible
      const isTableVisible = await page
        .locator('[data-testid="lottery-table"]')
        .isVisible();
      const isEmptyVisible = await page
        .locator('[data-testid="lottery-table-empty"]')
        .isVisible();
      const isErrorVisible = await page
        .locator('[data-testid="lottery-table-error"]')
        .isVisible();

      const hasContent = isTableVisible || isEmptyVisible || isErrorVisible;
      expect(hasContent).toBe(true);
    } finally {
      await cleanupTestFixture(fixture);
    }
  });

  test("6.10.1-UI-007: [P1] RLS enforcement - user only sees their stores (AC #7)", async ({
    page,
  }) => {
    const fixture = await createTestFixture("007");
    let otherCompany: any, otherStore: any, otherPack: any;

    try {
      // GIVEN: Pack in another user's store
      otherCompany = await createCompany(fixture.prisma);
      otherStore = await createStore(fixture.prisma, {
        company_id: otherCompany.company_id,
      });

      otherPack = await createLotteryPack(fixture.prisma, {
        game_id: fixture.game.game_id,
        store_id: otherStore.store_id,
        status: "ACTIVE",
        pack_number: `OTHER-STORE-PACK-${Date.now()}`,
      });

      await loginAndWaitForClientDashboard(
        page,
        fixture.clientOwner.email,
        fixture.password,
      );
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
        page.locator(`[data-testid="store-tab-${fixture.store1.store_id}"]`),
      ).toBeVisible();
      await expect(
        page.locator(`[data-testid="store-tab-${fixture.store2.store_id}"]`),
      ).toBeVisible();
    } finally {
      // Cleanup other company's data
      if (otherPack) {
        await fixture.prisma.lotteryPack
          .delete({ where: { pack_id: otherPack.pack_id } })
          .catch(() => {});
      }
      if (otherStore) {
        await fixture.prisma.store
          .delete({ where: { store_id: otherStore.store_id } })
          .catch(() => {});
      }
      if (otherCompany) {
        await fixture.prisma.company
          .delete({ where: { company_id: otherCompany.company_id } })
          .catch(() => {});
      }
      await cleanupTestFixture(fixture);
    }
  });

  test("6.10.1-UI-008: [P1] Single store displays as badge, not tabs", async ({
    page,
  }) => {
    // Create a fixture with single store mode
    const fixture = await createTestFixture("008", { singleStore: true });

    try {
      await loginAndWaitForClientDashboard(
        page,
        fixture.clientOwner.email,
        fixture.password,
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
      await expect(storeTabs.getByText(fixture.store1.name)).toBeVisible();

      // AND: The badge should not be a button (single store = non-interactive badge)
      // Check that there's no button role or tab role in the store tabs container
      const tabButtons = storeTabs.locator('button[role="tab"]');
      const tabButtonCount = await tabButtons.count();
      expect(tabButtonCount).toBe(0);
    } finally {
      await cleanupTestFixture(fixture);
    }
  });

  test("6.10.1-UI-009: [P2] Receive Packs button accessibility", async ({
    page,
  }) => {
    const fixture = await createTestFixture("009");

    try {
      await loginAndWaitForClientDashboard(
        page,
        fixture.clientOwner.email,
        fixture.password,
      );
      await page.goto("/client-dashboard/lottery", {
        waitUntil: "domcontentloaded",
      });

      await waitForLotteryPageLoaded(page);

      // THEN: Receive Packs button has proper accessibility attributes
      const receiveButton = page.locator(
        '[data-testid="receive-packs-button"]',
      );
      await expect(receiveButton).toBeVisible();
      await expect(receiveButton).toHaveAttribute(
        "aria-label",
        "Receive lottery packs",
      );
    } finally {
      await cleanupTestFixture(fixture);
    }
  });

  test("6.10.1-UI-010: [P2] Table column headers accessibility", async ({
    page,
  }) => {
    const fixture = await createTestFixture("010", { withBins: true });
    let testPack: any;

    try {
      // Create a pack so table is visible
      testPack = await createLotteryPack(fixture.prisma, {
        game_id: fixture.game.game_id,
        store_id: fixture.store1.store_id,
        status: "ACTIVE",
        pack_number: `A11Y-PACK-${Date.now()}`,
      });

      await loginAndWaitForClientDashboard(
        page,
        fixture.clientOwner.email,
        fixture.password,
      );
      await page.goto("/client-dashboard/lottery", {
        waitUntil: "domcontentloaded",
      });

      await waitForLotteryPageLoaded(page);

      // Select store 1
      await page
        .locator(`[data-testid="store-tab-${fixture.store1.store_id}"]`)
        .click();

      // Wait for table
      await page
        .locator('[data-testid="lottery-table"]')
        .waitFor({ state: "visible", timeout: 30000 });

      // THEN: Table headers have proper scope attribute
      const headers = page.locator('th[scope="col"]');
      const headerCount = await headers.count();
      expect(headerCount).toBeGreaterThanOrEqual(5);

      // AND: Table region has proper ARIA label
      await expect(
        page.locator('[data-testid="lottery-table"]'),
      ).toHaveAttribute("aria-label", "Lottery inventory table");
    } finally {
      if (testPack) {
        await fixture.prisma.lotteryPack
          .delete({ where: { pack_id: testPack.pack_id } })
          .catch(() => {});
      }
      await cleanupTestFixture(fixture);
    }
  });

  test("6.10.1-UI-011: [P2] Store tabs keyboard navigation", async ({
    page,
  }) => {
    const fixture = await createTestFixture("011");

    try {
      await loginAndWaitForClientDashboard(
        page,
        fixture.clientOwner.email,
        fixture.password,
      );
      await page.goto("/client-dashboard/lottery", {
        waitUntil: "domcontentloaded",
      });

      await waitForLotteryPageLoaded(page);

      // Focus on first store tab
      const store1Tab = page.locator(
        `[data-testid="store-tab-${fixture.store1.store_id}"]`,
      );
      await store1Tab.waitFor({ state: "visible", timeout: 30000 });
      await store1Tab.focus();

      // Verify first tab is focused
      await expect(store1Tab).toBeFocused({ timeout: 5000 });

      // WHEN: Pressing ArrowRight key
      await page.keyboard.press("ArrowRight");

      // THEN: Focus moves to next tab (store 2) and it becomes selected
      // The StoreTabs component uses onStoreSelect which triggers a useEffect
      // that focuses the new tab after React state update
      const store2Tab = page.locator(
        `[data-testid="store-tab-${fixture.store2.store_id}"]`,
      );

      // Wait for the aria-selected attribute to change first (state update)
      await expect(store2Tab).toHaveAttribute("aria-selected", "true", {
        timeout: 5000,
      });

      // Then verify focus moved (happens after state update via useEffect)
      await expect(store2Tab).toBeFocused({ timeout: 5000 });
    } finally {
      await cleanupTestFixture(fixture);
    }
  });

  test("6.10.1-UI-012: [P2] Filter bar displays all filter controls", async ({
    page,
  }) => {
    const fixture = await createTestFixture("012", { withBins: true });
    let testPack: any;

    try {
      // Create a pack so table is visible
      testPack = await createLotteryPack(fixture.prisma, {
        game_id: fixture.game.game_id,
        store_id: fixture.store1.store_id,
        status: "ACTIVE",
        pack_number: `FILTER-PACK-${Date.now()}`,
      });

      await loginAndWaitForClientDashboard(
        page,
        fixture.clientOwner.email,
        fixture.password,
      );
      await page.goto("/client-dashboard/lottery", {
        waitUntil: "domcontentloaded",
      });

      await waitForLotteryPageLoaded(page);

      // Select store 1
      await page
        .locator(`[data-testid="store-tab-${fixture.store1.store_id}"]`)
        .click();

      // Wait for filter section
      await page
        .locator('[data-testid="lottery-filters"]')
        .waitFor({ state: "visible", timeout: 30000 });

      // THEN: Filter controls are visible
      await expect(
        page.locator('[data-testid="filter-game-name"]'),
      ).toBeVisible();
      await expect(page.locator('[data-testid="filter-status"]')).toBeVisible();
      await expect(
        page.locator('[data-testid="filter-date-from"]'),
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="filter-date-to"]'),
      ).toBeVisible();

      // AND: Total badges are visible
      await expect(
        page.locator('[data-testid="total-bins-badge"]'),
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="total-remaining-packs-badge"]'),
      ).toBeVisible();

      // AND: Receive Packs button is visible
      await expect(
        page.locator('[data-testid="receive-packs-button"]'),
      ).toBeVisible();
    } finally {
      if (testPack) {
        await fixture.prisma.lotteryPack
          .delete({ where: { pack_id: testPack.pack_id } })
          .catch(() => {});
      }
      await cleanupTestFixture(fixture);
    }
  });

  test("6.10.1-UI-013: [P2] Game name filter filters inventory table", async ({
    page,
  }) => {
    const fixture = await createTestFixture("013", { withBins: true });
    let testPack1: any, testPack2: any, game2: any;

    try {
      // Create second game
      game2 = await createLotteryGame(fixture.prisma, {
        name: `Other Game ${Date.now()}`,
        price: 10.0,
      });

      // Create packs for different games
      testPack1 = await createLotteryPack(fixture.prisma, {
        game_id: fixture.game.game_id,
        store_id: fixture.store1.store_id,
        status: "ACTIVE",
        pack_number: `GAME1-PACK-${Date.now()}`,
      });

      testPack2 = await createLotteryPack(fixture.prisma, {
        game_id: game2.game_id,
        store_id: fixture.store1.store_id,
        status: "ACTIVE",
        pack_number: `GAME2-PACK-${Date.now()}`,
      });

      await loginAndWaitForClientDashboard(
        page,
        fixture.clientOwner.email,
        fixture.password,
      );
      await page.goto("/client-dashboard/lottery", {
        waitUntil: "domcontentloaded",
      });

      await waitForLotteryPageLoaded(page);

      // Select store 1
      await page
        .locator(`[data-testid="store-tab-${fixture.store1.store_id}"]`)
        .click();

      // Wait for table
      await page
        .locator('[data-testid="lottery-table"]')
        .waitFor({ state: "visible", timeout: 30000 });

      // Initially both games should be visible
      await expect(page.getByText(fixture.game.name)).toBeVisible();
      await expect(page.getByText(game2.name)).toBeVisible();

      // WHEN: Filtering by first game name
      await page
        .locator('[data-testid="filter-game-name"]')
        .fill(fixture.game.name.substring(0, 5));

      // THEN: Only first game is visible
      await expect(page.getByText(fixture.game.name)).toBeVisible();
      await expect(page.getByText(game2.name)).not.toBeVisible({
        timeout: 5000,
      });
    } finally {
      if (testPack1) {
        await fixture.prisma.lotteryPack
          .delete({ where: { pack_id: testPack1.pack_id } })
          .catch(() => {});
      }
      if (testPack2) {
        await fixture.prisma.lotteryPack
          .delete({ where: { pack_id: testPack2.pack_id } })
          .catch(() => {});
      }
      if (game2) {
        await fixture.prisma.lotteryGame
          .delete({ where: { game_id: game2.game_id } })
          .catch(() => {});
      }
      await cleanupTestFixture(fixture);
    }
  });

  test("6.10.1-UI-014: [P2] Expandable rows show pack details", async ({
    page,
  }) => {
    const fixture = await createTestFixture("014", { withBins: true });
    let testPack1: any, testPack2: any;

    try {
      // Create multiple packs for same game
      testPack1 = await createLotteryPack(fixture.prisma, {
        game_id: fixture.game.game_id,
        store_id: fixture.store1.store_id,
        status: "ACTIVE",
        current_bin_id: fixture.bin1!.bin_id,
        pack_number: `EXPAND-PACK-001-${Date.now()}`,
        serial_start: "1001",
        serial_end: "1999",
      });

      testPack2 = await createLotteryPack(fixture.prisma, {
        game_id: fixture.game.game_id,
        store_id: fixture.store1.store_id,
        status: "ACTIVE",
        current_bin_id: fixture.bin2!.bin_id,
        pack_number: `EXPAND-PACK-002-${Date.now()}`,
        serial_start: "2001",
        serial_end: "2999",
      });

      await loginAndWaitForClientDashboard(
        page,
        fixture.clientOwner.email,
        fixture.password,
      );
      await page.goto("/client-dashboard/lottery", {
        waitUntil: "domcontentloaded",
      });

      await waitForLotteryPageLoaded(page);

      // Select store 1
      await page
        .locator(`[data-testid="store-tab-${fixture.store1.store_id}"]`)
        .click();

      // Wait for table
      await page
        .locator('[data-testid="lottery-table"]')
        .waitFor({ state: "visible", timeout: 30000 });

      // WHEN: Clicking on a game row to expand
      const gameRow = page.locator(
        `[data-testid="lottery-table-row-${fixture.game.game_id}"]`,
      );
      await gameRow.click();

      // THEN: Pack details are expanded
      const packDetails = page.locator(
        `[data-testid="pack-details-${fixture.game.game_id}"]`,
      );
      await expect(packDetails).toBeVisible({ timeout: 5000 });

      // AND: Pack information is displayed
      await expect(packDetails.getByText("Pack #")).toBeVisible();
      await expect(packDetails.getByText("Serial Range")).toBeVisible();
      await expect(packDetails.getByText("Bin")).toBeVisible();

      // AND: Individual pack rows are visible
      await expect(packDetails.getByText(testPack1.pack_number)).toBeVisible();
      await expect(packDetails.getByText(testPack2.pack_number)).toBeVisible();
      await expect(packDetails.getByText("1001 - 1999")).toBeVisible();
      await expect(packDetails.getByText("2001 - 2999")).toBeVisible();

      // WHEN: Clicking row again to collapse
      await gameRow.click();

      // THEN: Pack details are hidden
      await expect(packDetails).not.toBeVisible({ timeout: 5000 });
    } finally {
      if (testPack1) {
        await fixture.prisma.lotteryPack
          .delete({ where: { pack_id: testPack1.pack_id } })
          .catch(() => {});
      }
      if (testPack2) {
        await fixture.prisma.lotteryPack
          .delete({ where: { pack_id: testPack2.pack_id } })
          .catch(() => {});
      }
      await cleanupTestFixture(fixture);
    }
  });

  test("6.10.1-UI-015: [P2] Total Bins badge shows correct count", async ({
    page,
  }) => {
    const fixture = await createTestFixture("015", { withBins: true });
    let testPack: any;

    try {
      // Create a pack so table is visible
      testPack = await createLotteryPack(fixture.prisma, {
        game_id: fixture.game.game_id,
        store_id: fixture.store1.store_id,
        status: "ACTIVE",
        pack_number: `BINS-PACK-${Date.now()}`,
      });

      await loginAndWaitForClientDashboard(
        page,
        fixture.clientOwner.email,
        fixture.password,
      );
      await page.goto("/client-dashboard/lottery", {
        waitUntil: "domcontentloaded",
      });

      await waitForLotteryPageLoaded(page);

      // Select store 1
      await page
        .locator(`[data-testid="store-tab-${fixture.store1.store_id}"]`)
        .click();

      // Wait for filter section to load
      await page
        .locator('[data-testid="lottery-filters"]')
        .waitFor({ state: "visible", timeout: 30000 });

      // THEN: Total Bins badge shows correct count (fixture creates 2 bins)
      const binsBadge = page.locator('[data-testid="total-bins-count"]');
      await expect(binsBadge).toBeVisible({ timeout: 10000 });
      await expect(binsBadge).toHaveText("2");
    } finally {
      if (testPack) {
        await fixture.prisma.lotteryPack
          .delete({ where: { pack_id: testPack.pack_id } })
          .catch(() => {});
      }
      await cleanupTestFixture(fixture);
    }
  });

  test("6.10.1-UI-016: [P2] Total Remaining Packs badge shows correct count", async ({
    page,
  }) => {
    const fixture = await createTestFixture("016", { withBins: true });
    let activePack1: any, activePack2: any, depletedPack: any;

    try {
      // Create mix of active and depleted packs
      activePack1 = await createLotteryPack(fixture.prisma, {
        game_id: fixture.game.game_id,
        store_id: fixture.store1.store_id,
        status: "ACTIVE",
        pack_number: `REMAINING-001-${Date.now()}`,
      });

      activePack2 = await createLotteryPack(fixture.prisma, {
        game_id: fixture.game.game_id,
        store_id: fixture.store1.store_id,
        status: "RECEIVED",
        pack_number: `REMAINING-002-${Date.now()}`,
      });

      depletedPack = await createLotteryPack(fixture.prisma, {
        game_id: fixture.game.game_id,
        store_id: fixture.store1.store_id,
        status: "DEPLETED",
        pack_number: `DEPLETED-001-${Date.now()}`,
      });

      await loginAndWaitForClientDashboard(
        page,
        fixture.clientOwner.email,
        fixture.password,
      );
      await page.goto("/client-dashboard/lottery", {
        waitUntil: "domcontentloaded",
      });

      await waitForLotteryPageLoaded(page);

      // Select store 1
      await page
        .locator(`[data-testid="store-tab-${fixture.store1.store_id}"]`)
        .click();

      // Wait for filter section to load
      await page
        .locator('[data-testid="lottery-filters"]')
        .waitFor({ state: "visible", timeout: 30000 });

      // THEN: Total Remaining Packs shows 2 (excludes DEPLETED)
      const packsBadge = page.locator(
        '[data-testid="total-remaining-packs-count"]',
      );
      await expect(packsBadge).toBeVisible({ timeout: 10000 });
      await expect(packsBadge).toHaveText("2");
    } finally {
      if (activePack1) {
        await fixture.prisma.lotteryPack
          .delete({ where: { pack_id: activePack1.pack_id } })
          .catch(() => {});
      }
      if (activePack2) {
        await fixture.prisma.lotteryPack
          .delete({ where: { pack_id: activePack2.pack_id } })
          .catch(() => {});
      }
      if (depletedPack) {
        await fixture.prisma.lotteryPack
          .delete({ where: { pack_id: depletedPack.pack_id } })
          .catch(() => {});
      }
      await cleanupTestFixture(fixture);
    }
  });

  test("6.10.1-UI-017: [P2] Status filter shows sold packs when selected", async ({
    page,
  }) => {
    const fixture = await createTestFixture("017", { withBins: true });
    let activePack: any, depletedPack: any;

    try {
      // Create active and depleted packs
      activePack = await createLotteryPack(fixture.prisma, {
        game_id: fixture.game.game_id,
        store_id: fixture.store1.store_id,
        status: "ACTIVE",
        pack_number: `ACTIVE-STATUS-${Date.now()}`,
      });

      depletedPack = await createLotteryPack(fixture.prisma, {
        game_id: fixture.game.game_id,
        store_id: fixture.store1.store_id,
        status: "DEPLETED",
        pack_number: `DEPLETED-STATUS-${Date.now()}`,
      });

      await loginAndWaitForClientDashboard(
        page,
        fixture.clientOwner.email,
        fixture.password,
      );
      await page.goto("/client-dashboard/lottery", {
        waitUntil: "domcontentloaded",
      });

      await waitForLotteryPageLoaded(page);

      // Select store 1
      await page
        .locator(`[data-testid="store-tab-${fixture.store1.store_id}"]`)
        .click();

      // Wait for table (shows active packs by default)
      await page
        .locator('[data-testid="lottery-table"]')
        .waitFor({ state: "visible", timeout: 30000 });

      // Initially in default view (all = ACTIVE + RECEIVED)
      // Game should be visible with 1 active pack
      await expect(page.getByText(fixture.game.name)).toBeVisible();

      // WHEN: Selecting "Sold" status filter
      await page.locator('[data-testid="filter-status"]').click();
      await page.getByRole("option", { name: "Sold" }).click();

      // THEN: Table shows only depleted (sold) packs
      // Wait for table update
      await page.waitForTimeout(500);

      // Game should still be visible (has depleted pack)
      await expect(page.getByText(fixture.game.name)).toBeVisible();
    } finally {
      if (activePack) {
        await fixture.prisma.lotteryPack
          .delete({ where: { pack_id: activePack.pack_id } })
          .catch(() => {});
      }
      if (depletedPack) {
        await fixture.prisma.lotteryPack
          .delete({ where: { pack_id: depletedPack.pack_id } })
          .catch(() => {});
      }
      await cleanupTestFixture(fixture);
    }
  });
});
