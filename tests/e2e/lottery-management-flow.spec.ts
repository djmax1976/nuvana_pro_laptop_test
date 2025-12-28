/**
 * E2E Tests: Lottery Management Flow
 *
 * Tests critical end-to-end user journeys:
 * - Pack reception → activation flow (critical workflow)
 * - Variance detection → approval flow (critical workflow)
 *
 * @test-level E2E
 * @justification Tests critical multi-page user journeys that require full system integration
 * @story 6-10 - Lottery Management UI
 * @priority P0 (Critical - Core User Journey)
 *
 * Enterprise Patterns Used:
 * - Network-first waiting: Wait for specific API responses, not arbitrary timeouts
 * - Deterministic assertions: Verify API response before checking UI
 * - Test isolation: Each test creates/cleans its own data
 * - Centralized helpers: Reusable login and navigation utilities
 */

import { test, expect, Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { PrismaClient, LotteryPackStatus } from "@prisma/client";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";
import {
  createLotteryGame,
  createLotteryPack,
  createLotteryBin,
} from "../support/factories/lottery.factory";

/**
 * Network-first login helper that waits for actual API response
 * instead of arbitrary timeouts.
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
async function loginAndWaitForMyStore(
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

  // Wait for page to fully hydrate (ensures React has attached event handlers)
  await page.waitForLoadState("networkidle").catch(() => {});

  // Fill credentials with explicit click to focus (handles React controlled inputs)
  await emailInput.click();
  await emailInput.fill(email);
  await passwordInput.click();
  await passwordInput.fill(password);

  // Verify credentials were filled
  await expect(emailInput).toHaveValue(email);
  await expect(passwordInput).toHaveValue(password);

  // Use Promise.all to set up response listener and click simultaneously
  // This ensures we don't miss the response if click triggers immediate navigation
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

  // Wait for redirect to /mystore (indicates successful auth)
  await page.waitForURL(/.*mystore.*/, { timeout: 30000 });
}

/**
 * Navigate to lottery page and wait for it to be fully loaded.
 * Uses network-first pattern - waits for API responses that populate the page.
 *
 * @returns Promise resolving when page is ready for interaction
 */
async function navigateToLotteryPage(page: Page): Promise<void> {
  // Set up API listeners BEFORE navigation (network-first pattern)
  // The lottery page makes these API calls on mount:
  // 1. /api/lottery/packs?store_id=... - list of packs
  // 2. /api/lottery/bins/day/:storeId - day bins data
  const packsResponsePromise = page.waitForResponse(
    (resp) =>
      /\/api\/lottery\/packs(\?|$)/.test(resp.url()) && resp.status() === 200,
    { timeout: 30000 },
  );

  // Navigate to lottery page
  await page.goto("/mystore/lottery", { waitUntil: "domcontentloaded" });

  // Wait for the lottery page container to be in DOM
  await expect(
    page.locator('[data-testid="lottery-management-page"]'),
  ).toBeVisible({
    timeout: 15000,
  });

  // Wait for packs API to complete (this populates the buttons' enabled/disabled state)
  await packsResponsePromise;
}

// CRITICAL: Configure this describe block to run in a SINGLE worker
// This ensures beforeAll runs once and all tests share the same fixtures.
// Without this, parallel workers would each run beforeAll separately,
// but the user created by one worker wouldn't exist for another worker.
test.describe.configure({ mode: "serial" });

test.describe("6.10-E2E: Lottery Management Flow", () => {
  let prisma: PrismaClient;
  let storeManager: { user_id: string; email: string };
  let company: { company_id: string };
  let store: { store_id: string };
  let game: { game_id: string };
  const password = "TestPassword123!";

  test.beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    // Create test store manager with company and store
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    const companyId = uuidv4();
    const storeId = uuidv4();

    storeManager = await prisma.user.create({
      data: {
        user_id: userId,
        email: `e2e-lottery-manager-${Date.now()}@test.com`,
        name: "E2E Lottery Manager",
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
        name: "E2E Lottery Test Company",
        address: "123 Lottery Test Street",
        status: "ACTIVE",
        owner_user_id: storeManager.user_id,
      },
    });

    store = await prisma.store.create({
      data: {
        store_id: storeId,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
        company_id: company.company_id,
        name: "E2E Lottery Test Store",
        timezone: "America/New_York",
        status: "ACTIVE",
        location_json: { address: "456 Lottery Store Ave" },
      },
    });

    // Assign STORE_MANAGER role to the user for the store
    const storeManagerRole = await prisma.role.findUnique({
      where: { code: "STORE_MANAGER" },
    });

    if (storeManagerRole) {
      await prisma.userRole.create({
        data: {
          user_id: storeManager.user_id,
          role_id: storeManagerRole.role_id,
          company_id: company.company_id,
          store_id: store.store_id,
        },
      });
    }

    // Create a lottery game for testing
    game = await createLotteryGame(prisma, {
      name: "E2E Test Scratch-Off Game",
      price: 5.0,
    });
  });

  test.afterAll(async () => {
    if (!prisma) return;

    // Clean up test data in reverse dependency order
    const cleanup = async (fn: () => Promise<unknown>) => fn().catch(() => {});

    if (store) {
      await cleanup(() =>
        prisma.lotteryPack.deleteMany({ where: { store_id: store.store_id } }),
      );
      await cleanup(() =>
        prisma.lotteryBin.deleteMany({ where: { store_id: store.store_id } }),
      );
    }

    if (storeManager) {
      await cleanup(() =>
        prisma.userRole.deleteMany({
          where: { user_id: storeManager.user_id },
        }),
      );
    }

    if (store) {
      await cleanup(() =>
        prisma.store.delete({ where: { store_id: store.store_id } }),
      );
    }

    if (company) {
      await cleanup(() =>
        prisma.company.delete({ where: { company_id: company.company_id } }),
      );
    }

    if (storeManager) {
      await cleanup(() =>
        prisma.user.delete({ where: { user_id: storeManager.user_id } }),
      );
    }

    if (game) {
      await cleanup(() =>
        prisma.lotteryGame.delete({ where: { game_id: game.game_id } }),
      );
    }

    await prisma.$disconnect();
  });

  test("6.10-E2E-001: [P0] user can view lottery management page (AC #1)", async ({
    page,
  }) => {
    // GIVEN: Store Manager logs in
    await loginAndWaitForMyStore(page, storeManager.email, password);

    // WHEN: User navigates to lottery page (with network-first waiting)
    await navigateToLotteryPage(page);

    // THEN: Page structure is correct
    await expect(
      page.locator('[data-testid="lottery-management-page"]'),
    ).toBeVisible();

    // AND: Action buttons are visible (state depends on API data)
    await expect(
      page.locator('[data-testid="receive-pack-button"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="activate-pack-button"]'),
    ).toBeVisible();
  });

  test("6.10-E2E-002: [P0] user can open pack reception form (AC #2)", async ({
    page,
  }) => {
    // GIVEN: Store Manager is on lottery page
    await loginAndWaitForMyStore(page, storeManager.email, password);
    await navigateToLotteryPage(page);

    // WHEN: User clicks Receive Pack button
    const receivePackButton = page.locator(
      '[data-testid="receive-pack-button"]',
    );
    await expect(receivePackButton).toBeEnabled();
    await receivePackButton.click();

    // THEN: Pack reception dialog opens with serialized number input
    const serialInput = page.locator('[data-testid="serial-input"]');
    await expect(serialInput).toBeVisible();
    await expect(serialInput).toBeEditable();

    // AND: Serial input has correct attributes (Story 6.12 - 24-digit serial)
    await expect(serialInput).toHaveAttribute(
      "placeholder",
      "000000000000000000000000",
    );
    await expect(serialInput).toHaveAttribute("maxlength", "24");

    // AND: Submit button is visible but disabled (no packs added yet)
    const submitButton = page.locator('[data-testid="submit-batch-reception"]');
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeDisabled();
  });

  test("6.10-E2E-003: [P1] user can view bins with packs in day bins table (AC #1)", async ({
    page,
  }) => {
    // GIVEN: A bin exists for the store with an ACTIVE pack assigned
    const bin = await createLotteryBin(prisma, {
      store_id: store.store_id,
      bin_number: 1,
      name: "Bin 1",
    });

    const pack = await createLotteryPack(prisma, {
      game_id: game.game_id,
      store_id: store.store_id,
      pack_number: `E2E-PACK-${Date.now()}`,
      serial_start: "0001",
      serial_end: "0100",
      status: LotteryPackStatus.ACTIVE,
      current_bin_id: bin.bin_id,
    });

    try {
      // WHEN: Store Manager navigates to lottery page
      await loginAndWaitForMyStore(page, storeManager.email, password);

      // Set up day bins API listener BEFORE navigation (network-first pattern)
      const dayBinsResponsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/lottery/bins/day/${store.store_id}`) &&
          resp.status() === 200,
        { timeout: 30000 },
      );

      await page.goto("/mystore/lottery", { waitUntil: "domcontentloaded" });

      // Wait for lottery page container
      await expect(
        page.locator('[data-testid="lottery-management-page"]'),
      ).toBeVisible();

      // Wait for day bins API to complete (deterministic)
      const dayBinsResponse = await dayBinsResponsePromise;
      const dayBinsData = await dayBinsResponse.json();

      // Verify API returned our pack data
      expect(dayBinsData.success).toBe(true);

      // THEN: Day bins table displays with our pack
      const table = page.locator('[data-testid="day-bins-table"]');
      await expect(table).toBeVisible();
      await expect(table).toContainText(pack.pack_number);
    } finally {
      // Cleanup in correct order
      await prisma.lotteryPack
        .delete({ where: { pack_id: pack.pack_id } })
        .catch(() => {});
      await prisma.lotteryBin
        .delete({ where: { bin_id: bin.bin_id } })
        .catch(() => {});
    }
  });

  test("6.10-E2E-004: [P1] user can open pack activation form when received packs exist (AC #3)", async ({
    page,
  }) => {
    // GIVEN: A RECEIVED pack exists for the store
    const pack = await createLotteryPack(prisma, {
      game_id: game.game_id,
      store_id: store.store_id,
      pack_number: `E2E-RECEIVED-${Date.now()}`,
      serial_start: "001",
      serial_end: "100",
      status: LotteryPackStatus.RECEIVED,
    });

    try {
      // WHEN: Store Manager navigates to lottery page
      await loginAndWaitForMyStore(page, storeManager.email, password);

      // Set up packs API listener BEFORE navigation (network-first pattern)
      const packsResponsePromise = page.waitForResponse(
        (resp) => {
          const url = resp.url();
          return (
            /\/api\/lottery\/packs(\?|$)/.test(url) && resp.status() === 200
          );
        },
        { timeout: 30000 },
      );

      await page.goto("/mystore/lottery", { waitUntil: "domcontentloaded" });

      // Wait for lottery page container
      await expect(
        page.locator('[data-testid="lottery-management-page"]'),
      ).toBeVisible();

      // Wait for packs API to complete (deterministic)
      const packsResponse = await packsResponsePromise;
      const packsData = await packsResponse.json();

      // Verify API returned success
      expect(packsData.success).toBe(true);

      // THEN: Activate Pack button should be enabled (we have a RECEIVED pack)
      const activateButton = page.locator(
        '[data-testid="activate-pack-button"]',
      );
      await expect(activateButton).toBeVisible();
      await expect(activateButton).toBeEnabled();

      // WHEN: User clicks Activate Pack button
      await activateButton.click();

      // THEN: Pack activation dialog opens (EnhancedPackActivationForm)
      // Verify the dialog container is visible
      await expect(
        page.locator('[data-testid="pack-activation-form"]'),
      ).toBeVisible({ timeout: 10000 });

      // Verify the pack search combobox is visible
      const packSearchInput = page.locator('[data-testid="pack-search"]');
      await expect(packSearchInput).toBeVisible();

      // Verify the submit button is visible (disabled until pack is selected)
      await expect(
        page.locator('[data-testid="submit-activation"]'),
      ).toBeVisible();

      // AND: The combobox dropdown shows our RECEIVED pack when focused
      // Click the input to open the dropdown showing recent received packs
      await packSearchInput.click();

      // Wait for the dropdown to appear and contain pack options
      const packDropdown = page.locator('[data-testid="pack-search-dropdown"]');
      await expect(packDropdown).toBeVisible({ timeout: 10000 });

      // Verify at least one pack option is visible (our created pack)
      // The combobox uses indexed options (pack-search-option-0, option-1, etc.)
      const firstPackOption = page.locator(
        '[data-testid="pack-search-option-0"]',
      );
      await expect(firstPackOption).toBeVisible({ timeout: 5000 });

      // Verify the option contains our pack's information
      // The option displays: Game Name, Pack #<number>, Serials <start>-<end>
      await expect(firstPackOption).toContainText(pack.pack_number);
    } finally {
      await prisma.lotteryPack
        .delete({ where: { pack_id: pack.pack_id } })
        .catch(() => {});
    }
  });
});
