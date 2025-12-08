/**
 * E2E Tests: Lottery Bin Configuration Flow
 *
 * Tests critical end-to-end user journey:
 * - Client Owner configures bins → views bin display (critical workflow)
 *
 * @test-level E2E
 * @justification Tests critical multi-page user journey that requires full system integration
 * @story 6-13 - Lottery Database Enhancements & Bin Management
 * @priority P1 (High - Core User Journey)
 */

import { test, expect, Page } from "@playwright/test";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { PrismaClient } from "@prisma/client";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";
import { createLotteryGame } from "../support/factories/lottery.factory";

/**
 * Helper function to perform login and wait for redirect.
 */
async function loginAsClientOwner(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await page.fill('input[name="email"], input[type="email"]', email);
  await page.fill('input[name="password"], input[type="password"]', password);

  // Wait for navigation after form submission
  await Promise.all([
    page.waitForURL(/.*(client-dashboard|mystore).*/, { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
}

test.describe("6.13-E2E: Lottery Bin Configuration Flow", () => {
  let prisma: PrismaClient;
  let clientOwner: any;
  let company: any;
  let store: any;
  let game: any;
  const password = "TestPassword123!";

  test.beforeAll(async () => {
    prisma = new PrismaClient();
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
        address: "456 Bin Config Avenue",
        status: "ACTIVE",
      },
    });

    // Link user to store
    await prisma.userStore.create({
      data: {
        user_id: clientOwner.user_id,
        store_id: store.store_id,
      },
    });

    // Create lottery game
    game = await createLotteryGame(prisma, {
      name: "E2E Test Game",
      game_code: "1234",
    });
  });

  test.afterAll(async () => {
    // Cleanup
    if (prisma) {
      await prisma.userStore.deleteMany({
        where: { user_id: clientOwner.user_id },
      });
      await prisma.store.delete({ where: { store_id: store.store_id } });
      await prisma.company.delete({
        where: { company_id: company.company_id },
      });
      await prisma.user.delete({ where: { user_id: clientOwner.user_id } });
      await prisma.lotteryGame.delete({ where: { game_id: game.game_id } });
      await prisma.$disconnect();
    }
  });

  test("6.13-E2E-001: [P1] Client Owner can configure bins and view bin display (AC #1, #2)", async ({
    page,
  }) => {
    // CRITICAL: Intercept routes BEFORE navigation (network-first)
    await page.route("**/api/lottery/bins/configuration/*", (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            success: true,
            data: { bin_template: [] },
          }),
        });
      } else {
        route.continue();
      }
    });

    await page.route("**/api/lottery/bins/display/*", (route) => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          data: [
            {
              bin_id: "bin-1",
              bin_name: "Bin 1",
              display_order: 0,
              game_code: "1234",
              game_name: "E2E Test Game",
              pack_number: "000001",
              serial_start: "000001",
              serial_end: "000100",
              total_sold: 0,
              status: "ACTIVE",
            },
          ],
        }),
      });
    });

    // GIVEN: I am authenticated as a Client Owner
    await loginAsClientOwner(page, clientOwner.email, password);

    // WHEN: I navigate to bin configuration settings page
    await page.goto("/client-dashboard/settings/lottery-bins");
    await page.waitForLoadState("networkidle");

    // THEN: Bin configuration form is displayed
    await expect(
      page.getByRole("button", { name: /add new bin/i }),
    ).toBeVisible();

    // WHEN: I add a new bin
    await page.getByRole("button", { name: /add new bin/i }).click();
    await page.fill('[data-testid="bin-name-input"]', "Bin 1");
    await page.fill('[data-testid="bin-location-input"]', "Front");
    await page.fill('[data-testid="bin-display-order-input"]', "0");

    // AND: I save the configuration
    await page.getByRole("button", { name: /save configuration/i }).click();

    // THEN: Success message is displayed
    await expect(page.getByText(/saved|success/i)).toBeVisible();

    // WHEN: I navigate to lottery bin display page
    await page.goto("/client-dashboard/lottery");
    await page.waitForLoadState("networkidle");

    // THEN: Bin display grid is displayed with configured bins
    await expect(page.getByTestId("bin-display-grid")).toBeVisible();
    await expect(page.getByText("Bin 1")).toBeVisible();
    await expect(page.getByText("E2E Test Game")).toBeVisible();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - XSS Prevention
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.13-E2E-SEC-001: [P0] Should prevent XSS in bin name field", async ({
    page,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    await loginAsClientOwner(page, clientOwner.email, password);

    // WHEN: I navigate to bin configuration page
    await page.goto("/client-dashboard/settings/lottery-bins");
    await page.waitForLoadState("networkidle");

    // AND: I attempt to enter XSS payload in bin name
    const xssPayload = "<script>alert('xss')</script>";
    await page.getByRole("button", { name: /add new bin/i }).click();
    await page.fill('[data-testid="bin-name-input"]', xssPayload);

    // THEN: XSS payload is displayed as text (not executed)
    const nameInput = page.locator('[data-testid="bin-name-input"]');
    await expect(nameInput).toHaveValue(xssPayload);

    // AND: No script execution occurs (verify page doesn't show alert)
    // Note: Playwright would catch alerts, but we verify input value is escaped
    const pageContent = await page.content();
    expect(
      pageContent.includes("<script>"),
      "Script tag should not be in page HTML",
    ).toBe(false);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.13-E2E-EDGE-001: [P1] Should handle validation errors gracefully", async ({
    page,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    await loginAsClientOwner(page, clientOwner.email, password);

    // WHEN: I navigate to bin configuration page
    await page.goto("/client-dashboard/settings/lottery-bins");
    await page.waitForLoadState("networkidle");

    // AND: I attempt to save without required fields
    await page.getByRole("button", { name: /add new bin/i }).click();
    await page.getByRole("button", { name: /save configuration/i }).click();

    // THEN: Validation error is displayed
    await expect(
      page.getByText(/name.*required|display.*order.*required/i),
    ).toBeVisible({ timeout: 5000 });
  });

  test("6.13-E2E-EDGE-002: [P1] Should handle network errors gracefully", async ({
    page,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    await loginAsClientOwner(page, clientOwner.email, password);

    // WHEN: I navigate to bin configuration page with network error
    await page.route("**/api/lottery/bins/configuration/*", (route) => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Server error" },
        }),
      });
    });

    await page.goto("/client-dashboard/settings/lottery-bins");
    await page.waitForLoadState("networkidle");

    // THEN: Error message is displayed
    await expect(page.getByText(/error|failed|unable/i)).toBeVisible({
      timeout: 5000,
    });
  });
});
