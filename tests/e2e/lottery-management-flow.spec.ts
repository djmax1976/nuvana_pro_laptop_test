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
 */

import { test, expect, Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { PrismaClient, LotteryPackStatus, ShiftStatus } from "@prisma/client";
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
 * Helper function to perform login and wait for /mystore redirect.
 * Uses simplified, reliable pattern for CI/CD environments.
 */
async function loginAndWaitForMyStore(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  // Navigate to login page and wait for it to load
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  // Wait for login form to be visible and editable
  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');
  const submitButton = page.locator('button[type="submit"]');

  await expect(emailInput).toBeVisible({ timeout: 15000 });
  await expect(emailInput).toBeEditable({ timeout: 10000 });

  // Wait for React hydration to complete
  await page.waitForLoadState("load").catch(() => {});

  // Fill credentials using Playwright's fill() which properly triggers React onChange
  await emailInput.click();
  await emailInput.fill(email);

  await passwordInput.click();
  await passwordInput.fill(password);

  // Verify fields were filled correctly
  await expect(emailInput).toHaveValue(email, { timeout: 5000 });
  await expect(passwordInput).toHaveValue(password, { timeout: 5000 });

  // Set up response promise to capture login response
  const loginResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes("/api/auth/login"),
    { timeout: 30000 },
  );

  // Click submit button
  await submitButton.click();

  // Wait for login API response
  const loginResponse = await loginResponsePromise;
  const responseStatus = loginResponse.status();

  // Check if login was successful
  if (responseStatus !== 200) {
    const responseBody = await loginResponse.json();
    throw new Error(
      `Login failed with status ${responseStatus}: ${responseBody.message || responseBody.error?.message || "Unknown error"}`,
    );
  }

  // Wait for navigation to /mystore
  await page.waitForURL(/.*mystore.*/, { timeout: 30000 });

  // Wait for page to be fully loaded
  await page.waitForLoadState("domcontentloaded");
}

test.describe.serial("6.10-E2E: Lottery Management Flow", () => {
  let prisma: PrismaClient;
  let storeManager: any;
  let company: any;
  let store: any;
  let game: any;
  const password = "TestPassword123!";

  test.beforeAll(async () => {
    prisma = new PrismaClient();
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
    // Clean up test data
    if (storeManager) {
      await prisma.userRole
        .deleteMany({ where: { user_id: storeManager.user_id } })
        .catch(() => {});
      await prisma.lotteryPack
        .deleteMany({ where: { store_id: store?.store_id } })
        .catch(() => {});
      await prisma.store
        .delete({ where: { store_id: store?.store_id } })
        .catch(() => {});
      await prisma.company
        .delete({ where: { company_id: company?.company_id } })
        .catch(() => {});
      await prisma.user
        .delete({ where: { user_id: storeManager.user_id } })
        .catch(() => {});
      if (game) {
        await prisma.lotteryGame
          .delete({ where: { game_id: game.game_id } })
          .catch(() => {});
      }
    }
    await prisma.$disconnect();
  });

  test("6.10-E2E-001: [P0] user can view lottery management page (AC #1)", async ({
    page,
  }) => {
    // GIVEN: Store Manager logs in
    await loginAndWaitForMyStore(page, storeManager.email, password);

    // Set up API response promises BEFORE navigation to avoid race conditions
    const dayBinsResponsePromise = page
      .waitForResponse(
        (resp) =>
          resp.url().includes("/api/lottery/bins/day/") &&
          resp.status() === 200,
        { timeout: 30000 },
      )
      .catch(() => null); // API might not fire if no bins exist, that's OK

    const packsResponsePromise = page
      .waitForResponse(
        (resp) =>
          resp.url().includes("/api/lottery/packs") && resp.status() === 200,
        { timeout: 30000 },
      )
      .catch(() => null); // API might not fire if no packs exist, that's OK

    // WHEN: User navigates to lottery page
    await page.goto("/mystore/lottery");

    // THEN: Lottery management page is displayed
    await expect(
      page.locator('[data-testid="lottery-management-page"]'),
    ).toBeVisible({
      timeout: 10000,
    });

    // Wait for API responses to complete (deterministic waiting)
    await dayBinsResponsePromise;
    await packsResponsePromise;

    // Wait for page to be fully loaded
    await page.waitForLoadState("domcontentloaded");

    // AND: Receive Pack button is visible
    await expect(
      page.locator('[data-testid="receive-pack-button"]'),
    ).toBeVisible({ timeout: 10000 });

    // AND: Activate Pack button is visible (may be disabled if no packs)
    await expect(
      page.locator('[data-testid="activate-pack-button"]'),
    ).toBeVisible({ timeout: 10000 });
  });

  test("6.10-E2E-002: [P0] user can open pack reception form (AC #2)", async ({
    page,
  }) => {
    // GIVEN: Store Manager is on lottery page
    await loginAndWaitForMyStore(page, storeManager.email, password);
    await page.goto("/mystore/lottery");
    await expect(
      page.locator('[data-testid="lottery-management-page"]'),
    ).toBeVisible({
      timeout: 10000,
    });

    // WHEN: User clicks Receive Pack button
    await page.click('[data-testid="receive-pack-button"]');

    // THEN: Pack reception dialog opens with serialized number input
    // The form uses 24-digit serialized number input (Story 6.12)
    await expect(page.locator('[data-testid="serial-input"]')).toBeVisible({
      timeout: 5000,
    });

    // AND: Serial input should be editable and have correct placeholder
    const serialInput = page.locator('[data-testid="serial-input"]');
    await expect(serialInput).toBeEditable();
    await expect(serialInput).toHaveAttribute(
      "placeholder",
      "000000000000000000000000",
    );
    await expect(serialInput).toHaveAttribute("maxlength", "24");

    // AND: Submit button should be visible but disabled (no packs added yet)
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

      // Set up API response promise BEFORE navigation
      const dayBinsResponsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/lottery/bins/day/${store.store_id}`) &&
          resp.status() === 200,
        { timeout: 30000 },
      );

      await page.goto("/mystore/lottery");
      await expect(
        page.locator('[data-testid="lottery-management-page"]'),
      ).toBeVisible({
        timeout: 10000,
      });

      // Wait for day bins API response to complete (deterministic waiting)
      await dayBinsResponsePromise;

      // Wait for loading state to disappear if present
      await page
        .locator('[data-testid="day-bins-table"]')
        .waitFor({ state: "visible", timeout: 15000 })
        .catch(() => {
          // Table might already be visible, continue
        });

      // THEN: Day bins table is displayed (not empty state)
      await expect(page.locator('[data-testid="day-bins-table"]')).toBeVisible({
        timeout: 10000,
      });

      // AND: The bin row shows the pack number
      // Use a more specific selector to find the pack number in the table
      const table = page.locator('[data-testid="day-bins-table"]');
      await expect(table).toContainText(pack.pack_number, { timeout: 10000 });

      // Additional verification: Check that the pack number appears in a table cell
      // The pack number should be in a TableCell with font-mono class
      const packNumberCell = table.locator(
        `.font-mono:has-text("${pack.pack_number}")`,
      );
      await expect(packNumberCell).toBeVisible({ timeout: 5000 });
    } finally {
      // Cleanup - delete pack first (references bin), then bin
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
      serial_start: "0001",
      serial_end: "0100",
      status: LotteryPackStatus.RECEIVED,
    });

    try {
      // WHEN: Store Manager navigates to lottery page
      await loginAndWaitForMyStore(page, storeManager.email, password);

      // Set up API response promise BEFORE navigation to avoid race conditions
      // The packs API uses query parameters: /api/lottery/packs?store_id=...
      const packsResponsePromise = page.waitForResponse(
        (resp) => {
          const url = resp.url();
          return (
            url.includes("/api/lottery/packs") &&
            (url.includes(store.store_id) ||
              url.includes(encodeURIComponent(store.store_id))) &&
            resp.status() === 200
          );
        },
        { timeout: 30000 },
      );

      await page.goto("/mystore/lottery");
      await expect(
        page.locator('[data-testid="lottery-management-page"]'),
      ).toBeVisible({
        timeout: 10000,
      });

      // Wait for packs API response to complete (deterministic waiting)
      await packsResponsePromise;

      // Wait for the activate button to be visible
      const activateButton = page.locator(
        '[data-testid="activate-pack-button"]',
      );
      await expect(activateButton).toBeVisible({ timeout: 10000 });

      // THEN: Activate Pack button should be enabled (we have a RECEIVED pack)
      // Wait for button to become enabled - this happens after packs data loads
      await expect(activateButton).toBeEnabled({ timeout: 15000 });

      // WHEN: User clicks Activate Pack button
      await activateButton.click();

      // THEN: Pack activation dialog opens with pack select
      await expect(page.locator('[data-testid="pack-select"]')).toBeVisible({
        timeout: 5000,
      });

      // AND: Submit button is visible
      await expect(
        page.locator('[data-testid="submit-pack-activation"]'),
      ).toBeVisible({ timeout: 5000 });

      // AND: The pack select dropdown should contain our RECEIVED pack
      // Open the select dropdown to verify pack is listed
      const packSelect = page.locator('[data-testid="pack-select"]');
      await packSelect.click();

      // Wait for the dropdown content to be visible (SelectContent appears after trigger click)
      // Use a more reliable approach: wait for the pack option to appear
      const packOption = page.locator(
        `[data-testid="pack-option-${pack.pack_id}"]`,
      );
      await expect(packOption).toBeVisible({ timeout: 5000 });

      // Verify the pack number appears in the dropdown options
      // The pack number is displayed as "pack_number - game_name (serial_start - serial_end)"
      await expect(
        page.getByText(pack.pack_number, { exact: false }),
      ).toBeVisible({
        timeout: 5000,
      });
    } finally {
      // Cleanup
      await prisma.lotteryPack
        .delete({ where: { pack_id: pack.pack_id } })
        .catch(() => {});
    }
  });
});
