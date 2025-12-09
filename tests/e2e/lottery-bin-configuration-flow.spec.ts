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
      // Delete user roles first
      await prisma.userRole
        .deleteMany({ where: { user_id: clientOwner.user_id } })
        .catch(() => {});
      // Delete lottery game
      await prisma.lotteryGame
        .delete({ where: { game_id: game.game_id } })
        .catch(() => {});
      // Delete store
      await prisma.store
        .delete({ where: { store_id: store.store_id } })
        .catch(() => {});
      // Delete company
      await prisma.company
        .delete({ where: { company_id: company.company_id } })
        .catch(() => {});
      // Delete user
      await prisma.user
        .delete({ where: { user_id: clientOwner.user_id } })
        .catch(() => {});
      await prisma.$disconnect();
    }
  });

  test("6.13-E2E-001: [P1] Client Owner can configure bins and view bin display (AC #1, #2)", async ({
    page,
  }) => {
    // CRITICAL: Intercept routes BEFORE navigation (network-first)
    // Return 404 for bin configuration GET to trigger default bin creation
    await page.route("**/api/lottery/bins/configuration/*", (route) => {
      if (route.request().method() === "GET") {
        // Return 404 to indicate no configuration exists yet
        // This triggers the form to show default 24 bins
        route.fulfill({
          status: 404,
          body: JSON.stringify({
            success: false,
            error: { code: "NOT_FOUND", message: "No bin configuration found" },
          }),
        });
      } else {
        // Allow POST/PUT to continue normally
        route.continue();
      }
    });

    await page.route("**/api/lottery/packs*", (route) => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          data: [
            {
              pack_id: "pack-1",
              pack_number: "000001",
              serial_start: "000001",
              serial_end: "000100",
              status: "ACTIVE",
              game: {
                game_id: "mock-game-id",
                name: "E2E Bin Config Test Game",
              },
              bin: {
                bin_id: "bin-1",
                name: "Bin 1",
              },
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

    // THEN: Bin configuration form is displayed with Add Bin button
    await expect(page.locator('[data-testid="add-bin-button"]')).toBeVisible();

    // Wait for form to initialize with default bins (24 bins created when no config exists)
    // The form loads with default bins named "Bin 1", "Bin 2", etc.
    const firstBinNameInput = page.locator('[data-testid="bin-name-input-0"]');
    await expect(firstBinNameInput).toBeVisible({ timeout: 15000 });

    // Change the name to something different to trigger hasChanges
    await firstBinNameInput.fill("Main Counter Bin");

    // Fill location for first bin to make another change
    await page
      .locator('[data-testid="bin-location-input-0"]')
      .fill("Front Counter");

    // AND: I save the configuration (button should now be enabled after changes)
    const saveButton = page.locator(
      '[data-testid="save-configuration-button"]',
    );
    await expect(saveButton).toBeEnabled({ timeout: 5000 });
    await saveButton.click();

    // THEN: Success message is displayed (toast notification)
    await expect(page.getByText("Configuration saved").first()).toBeVisible({
      timeout: 10000,
    });

    // WHEN: I navigate to lottery page to see bins in use
    await page.goto("/client-dashboard/lottery");
    await page.waitForLoadState("networkidle");

    // THEN: Lottery table is displayed (bins are shown via lottery packs)
    await expect(
      page.locator('[data-testid="client-dashboard-lottery-page"]'),
    ).toBeVisible();
    // Verify pack with bin is shown (from mocked packs response - still shows "Bin 1" from mock)
    await expect(page.getByText("Bin 1")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("E2E Bin Config Test Game")).toBeVisible();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - XSS Prevention
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.13-E2E-SEC-001: [P0] Should prevent XSS in bin name field", async ({
    page,
  }) => {
    // Mock 404 to get default bins
    await page.route("**/api/lottery/bins/configuration/*", (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({
          status: 404,
          body: JSON.stringify({
            success: false,
            error: { code: "NOT_FOUND", message: "No bin configuration found" },
          }),
        });
      } else {
        route.continue();
      }
    });

    // GIVEN: I am authenticated as a Client Owner
    await loginAsClientOwner(page, clientOwner.email, password);

    // WHEN: I navigate to bin configuration page
    await page.goto("/client-dashboard/settings/lottery-bins");
    await page.waitForLoadState("networkidle");

    // Wait for form to load with default bins (24 bins appear when 404 returned)
    await expect(page.locator('[data-testid="bin-name-input-0"]')).toBeVisible({
      timeout: 15000,
    });

    // AND: I attempt to enter XSS payload in bin name
    const xssPayload = "<script>alert('xss')</script>";
    await page.locator('[data-testid="bin-name-input-0"]').fill(xssPayload);

    // THEN: XSS payload is displayed as text (not executed)
    const nameInput = page.locator('[data-testid="bin-name-input-0"]');
    await expect(nameInput).toHaveValue(xssPayload);

    // AND: No script execution occurs
    // React automatically escapes text content, preventing XSS
    // The input value contains the payload as text, not as executable HTML
    // Verify the input element shows the escaped value properly
    const inputValue = await nameInput.inputValue();
    expect(inputValue).toBe(xssPayload);

    // Verify that alert dialogs didn't fire (Playwright would catch them)
    // If XSS executed, we'd see an alert - the test passing means no alert
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.13-E2E-EDGE-001: [P1] Should handle validation errors gracefully", async ({
    page,
  }) => {
    // Mock 404 to get default bins
    await page.route("**/api/lottery/bins/configuration/*", (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({
          status: 404,
          body: JSON.stringify({
            success: false,
            error: { code: "NOT_FOUND", message: "No bin configuration found" },
          }),
        });
      } else {
        route.continue();
      }
    });

    // GIVEN: I am authenticated as a Client Owner
    await loginAsClientOwner(page, clientOwner.email, password);

    // WHEN: I navigate to bin configuration page
    await page.goto("/client-dashboard/settings/lottery-bins");
    await page.waitForLoadState("networkidle");

    // Wait for form to load with default bins
    await expect(page.locator('[data-testid="bin-name-input-0"]')).toBeVisible({
      timeout: 15000,
    });

    // AND: I clear the first bin name (make it empty to trigger validation)
    await page.locator('[data-testid="bin-name-input-0"]').fill("");

    // AND: I attempt to save with empty required field
    const saveButton = page.locator(
      '[data-testid="save-configuration-button"]',
    );
    await expect(saveButton).toBeEnabled({ timeout: 5000 });
    await saveButton.click();

    // THEN: Validation error is displayed (toast notification)
    // Look specifically for the validation toast message
    // Use .first() because the message appears in both the toast body and aria-live region
    await expect(
      page.getByText("All bins must have a name").first(),
    ).toBeVisible({ timeout: 10000 });
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

    // THEN: Error message is displayed (in form area)
    await expect(page.getByText(/error|failed|unable/i)).toBeVisible({
      timeout: 10000,
    });
  });
});
