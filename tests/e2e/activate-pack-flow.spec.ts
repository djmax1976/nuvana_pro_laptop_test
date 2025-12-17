/**
 * Activate Pack E2E Test
 *
 * Critical user journey: Activate pack during shift with cashier authentication
 * - Full end-to-end flow validation
 * - Error handling and edge cases
 * - Network-first pattern with route interception
 *
 * @test-level E2E
 * @justification Tests critical multi-step user journey that cannot be tested at lower levels
 * @story 10-6 - Activate Pack During Shift
 * @priority P0 (Critical - Core User Journey)
 * @enhanced-by workflow-9 on 2025-01-28
 * @updated 2025-12-16 - SKIPPED: Route /mystore/terminal/shift-closing/lottery was removed.
 *                       Lottery functionality moved to /mystore/lottery. Tests need update.
 */

import { test, expect, Page, Route, BrowserContext } from "@playwright/test";

// Create a minimal valid-looking JWT for middleware to pass
function createMockJwt(userId: string): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      email: "test@example.com",
      name: "Test User",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    }),
  ).toString("base64url");
  return `${header}.${payload}.mock_signature`;
}

// Route handler configuration type
interface RouteHandlerConfig {
  closingDataHandler?: (fetchCount: number) => object;
  verifyCashierResponse?: { status: number; body: object };
  validatePackResponse?: { status: number; body: object };
  activatePackResponse?: { status: number; body: object };
}

// SKIPPED: Route /mystore/terminal/shift-closing/lottery was removed.
// Lottery functionality has been moved to /mystore/lottery page.
// These tests need to be updated when shift-end page is implemented with lottery closing.
test.describe.skip("10-6-E2E: Activate Pack Flow (Critical Journey)", () => {
  // Test data constants - shared across tests
  const testShiftId = "shift-uuid-123";
  const testStoreId = "store-uuid-123";
  const testUserId = "user-uuid-123";
  const testCashierId = "cashier-uuid-123";
  const testBinId = "bin-uuid-1";
  const testPackId = "pack-uuid-123";

  /**
   * Setup authenticated page with cookie, localStorage, and route interception
   *
   * CRITICAL: All route handlers must be registered in a SINGLE catch-all handler
   * because Playwright processes routes in registration order. Routes registered
   * first take precedence, so we need one handler with conditional logic.
   *
   * The ClientAuthContext requires:
   * 1. localStorage.auth_session with isClientUser: true
   * 2. User roles including CLIENT_USER or STORE_MANAGER for /mystore access
   * 3. Backend validation via /api/auth/me
   */
  async function setupAuthenticatedPage(
    page: Page,
    context: BrowserContext,
    config: RouteHandlerConfig = {},
  ) {
    let closingDataFetchCount = 0;

    // Set auth cookie for middleware
    await context.addCookies([
      {
        name: "access_token",
        value: createMockJwt(testUserId),
        domain: "localhost",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);

    // CRITICAL: Single catch-all handler with all route logic inside
    // This ensures proper interception regardless of registration order
    await page.route("**/*", (route: Route) => {
      const url = route.request().url();

      // Mock auth/me endpoint - required by ClientAuthContext
      if (url.includes("/api/auth/me")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            user: {
              id: testUserId,
              email: "test@example.com",
              name: "Test User",
              role: "STORE_MANAGER",
              roles: ["CLIENT_USER", "STORE_MANAGER"],
              permissions: ["CLIENT_DASHBOARD_ACCESS", "LOTTERY_PACK_ACTIVATE"],
              is_client_user: true,
            },
          }),
        });
      }

      // Mock verify-cashier-permission endpoint
      if (url.includes("/api/auth/verify-cashier-permission")) {
        const response = config.verifyCashierResponse || {
          status: 200,
          body: {
            valid: true,
            userId: testUserId,
            name: "Cashier 1",
            hasPermission: true,
          },
        };
        return route.fulfill({
          status: response.status,
          contentType: "application/json",
          body: JSON.stringify(response.body),
        });
      }

      // Mock validate-for-activation endpoint
      if (url.includes("/api/lottery/packs/validate-for-activation/")) {
        const response = config.validatePackResponse || {
          status: 200,
          body: {
            success: true,
            data: {
              valid: true,
              game: { name: "$5 Powerball", price: 5 },
              pack: {
                pack_id: testPackId,
                serial_start: "001",
                serial_end: "100",
              },
            },
          },
        };
        return route.fulfill({
          status: response.status,
          contentType: "application/json",
          body: JSON.stringify(response.body),
        });
      }

      // Mock activate pack endpoint
      if (url.includes("/lottery/packs/activate")) {
        const response = config.activatePackResponse || {
          status: 200,
          body: {
            success: true,
            data: {
              updatedBin: {
                bin_id: testBinId,
                bin_number: 1,
                name: "Bin 1",
                is_active: true,
                pack: {
                  pack_id: testPackId,
                  pack_number: "1234567",
                  game_name: "$5 Powerball",
                  game_price: 5,
                  starting_serial: "012",
                  serial_end: "100",
                },
              },
              previousPack: null,
            },
          },
        };
        return route.fulfill({
          status: response.status,
          contentType: "application/json",
          body: JSON.stringify(response.body),
        });
      }

      // Let /api/client/dashboard pass through to real backend
      // (It's a background request that doesn't affect our test)

      // Mock shifts endpoint (required for storeId)
      if (
        url.includes(`/api/shifts/${testShiftId}`) &&
        !url.includes("/lottery/")
      ) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              shift_id: testShiftId,
              store_id: testStoreId,
              status: "OPEN",
            },
          }),
        });
      }

      // Mock closing-data endpoint
      if (url.includes("/lottery/closing-data")) {
        closingDataFetchCount++;
        const data = config.closingDataHandler
          ? config.closingDataHandler(closingDataFetchCount)
          : {
              bins: [
                {
                  bin_id: testBinId,
                  bin_number: 1,
                  name: "Bin 1",
                  is_active: true,
                  pack: null,
                },
              ],
              soldPacks: [],
            };
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, data }),
        });
      }

      // Mock active-shift-cashiers endpoint
      if (url.includes("/active-shift-cashiers")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: [
              { id: testCashierId, name: "Cashier 1", shiftId: testShiftId },
            ],
          }),
        });
      }

      // Let everything else through (CSS, JS, images, etc.)
      return route.continue();
    });

    // Set localStorage - CRITICAL: isClientUser must be true
    // Also set the client_auth_session for ClientAuthContext (used by /mystore layout)
    await page.addInitScript((userId: string) => {
      const sessionData = JSON.stringify({
        authenticated: true,
        user: {
          id: userId,
          email: "test@example.com",
          name: "Test User",
          is_client_user: true,
          user_role: "STORE_MANAGER",
          roles: ["CLIENT_USER", "STORE_MANAGER"],
        },
        isClientUser: true,
        isStoreUser: true,
        userRole: "STORE_MANAGER",
      });
      localStorage.setItem("auth_session", sessionData);
      // Also set client_auth_session for ClientAuthContext
      localStorage.setItem("client_auth_session", sessionData);
    }, testUserId);

    return { getClosingDataFetchCount: () => closingDataFetchCount };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HAPPY PATH TESTS (P0)
  // ═══════════════════════════════════════════════════════════════════════════
  test("10-6-E2E-001: [P0] user can activate pack during shift end-to-end", async ({
    page,
    context,
  }) => {
    // Custom closing data handler - returns pack after activation
    const closingDataHandler = (fetchCount: number) => ({
      bins: [
        {
          bin_id: testBinId,
          bin_number: 1,
          name: "Bin 1",
          is_active: true,
          pack:
            fetchCount > 1
              ? {
                  pack_id: testPackId,
                  pack_number: "1234567",
                  game_name: "$5 Powerball",
                  game_price: 5,
                  starting_serial: "012",
                  serial_end: "100",
                }
              : null,
        },
      ],
      soldPacks: [],
    });

    await setupAuthenticatedPage(page, context, { closingDataHandler });

    // Navigate to page
    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    // Wait for page to load
    await expect(
      page.locator('[data-testid="active-packs-table"]'),
    ).toBeVisible({ timeout: 10000 });

    // Click "Activate Pack" button
    await page.click('[data-testid="activate-pack-button"]');

    // Step 1: Cashier Authentication
    await expect(page.locator('[data-testid="step-1-auth"]')).toBeVisible({
      timeout: 5000,
    });

    // Select cashier
    await page.click('[data-testid="cashier-dropdown"]');
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    await page.click(`[data-testid="cashier-option-${testCashierId}"]`);

    // Enter PIN
    await page.fill('[data-testid="pin-input"]', "1234");

    // Click Verify
    await page.click('[data-testid="verify-button"]');

    // Step 2: Scan Pack
    await expect(page.locator('[data-testid="step-2-scan"]')).toBeVisible({
      timeout: 5000,
    });
    await expect(
      page.locator('[data-testid="verified-cashier-name"]'),
    ).toContainText("Cashier 1");

    // Enter serial number (24 digits)
    await page.fill('[data-testid="serial-input"]', "000112345670123456789012");
    await page.locator('[data-testid="serial-input"]').blur();

    // Wait for pack validation
    await expect(page.locator('[data-testid="pack-info"]')).toBeVisible({
      timeout: 5000,
    });

    // Select bin - use role selector since Radix Select doesn't pass testid to trigger
    await page.getByRole("combobox", { name: /assign to bin/i }).click();
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    await page.click(`[data-testid="bin-option-${testBinId}"]`);

    // Activate
    await page.click('[data-testid="activate-button"]');

    // Verify modal closes
    await expect(page.locator('[data-testid="step-2-scan"]')).not.toBeVisible({
      timeout: 5000,
    });

    // Verify success toast - use first() to avoid strict mode violation
    await expect(
      page.getByText("Pack Activated", { exact: true }).first(),
    ).toBeVisible({
      timeout: 5000,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ERROR HANDLING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("10-6-E2E-002: [P1] should handle invalid PIN gracefully", async ({
    page,
    context,
  }) => {
    await setupAuthenticatedPage(page, context, {
      verifyCashierResponse: {
        status: 401,
        body: { valid: false, error: "Invalid PIN" },
      },
    });

    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    await expect(
      page.locator('[data-testid="active-packs-table"]'),
    ).toBeVisible({ timeout: 10000 });

    await page.click('[data-testid="activate-pack-button"]');
    await page.click('[data-testid="cashier-dropdown"]');
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    await page.click(`[data-testid="cashier-option-${testCashierId}"]`);
    await page.fill('[data-testid="pin-input"]', "9999");
    await page.click('[data-testid="verify-button"]');

    // Should show error and stay on Step 1
    await expect(
      page
        .locator('[data-testid="error-message"]')
        .or(page.locator("text=/Invalid PIN/i")),
    ).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="step-1-auth"]')).toBeVisible();
    await expect(page.locator('[data-testid="step-2-scan"]')).not.toBeVisible();
  });

  test("10-6-E2E-003: [P1] should handle invalid pack serial gracefully", async ({
    page,
    context,
  }) => {
    await setupAuthenticatedPage(page, context, {
      validatePackResponse: {
        status: 200,
        body: {
          success: true,
          data: {
            valid: false,
            error: "Pack not found in inventory. Receive it first.",
          },
        },
      },
    });

    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    await expect(
      page.locator('[data-testid="active-packs-table"]'),
    ).toBeVisible({ timeout: 10000 });

    // Complete Step 1
    await page.click('[data-testid="activate-pack-button"]');
    await page.click('[data-testid="cashier-dropdown"]');
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    await page.click(`[data-testid="cashier-option-${testCashierId}"]`);
    await page.fill('[data-testid="pin-input"]', "1234");
    await page.click('[data-testid="verify-button"]');

    await expect(page.locator('[data-testid="step-2-scan"]')).toBeVisible({
      timeout: 5000,
    });

    // Enter invalid serial
    await page.fill('[data-testid="serial-input"]', "999912345670123456789012");
    await page.locator('[data-testid="serial-input"]').blur();

    // Should show error
    await expect(page.locator('[data-testid="scan-error"]')).toBeVisible({
      timeout: 5000,
    });
  });

  test("10-6-E2E-004: [P1] should show warning when activating pack in bin with existing pack", async ({
    page,
    context,
  }) => {
    // Mock closing data with existing pack in bin
    const closingDataHandler = () => ({
      bins: [
        {
          bin_id: testBinId,
          bin_number: 1,
          name: "Bin 1",
          is_active: true,
          pack: {
            pack_id: "existing-pack-id",
            pack_number: "7654321",
            game_name: "$1 Pick 3",
            game_price: 1,
            starting_serial: "001",
            serial_end: "100",
          },
        },
      ],
      soldPacks: [],
    });

    await setupAuthenticatedPage(page, context, { closingDataHandler });

    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    await expect(
      page.locator('[data-testid="active-packs-table"]'),
    ).toBeVisible({ timeout: 10000 });

    // Complete authentication
    await page.click('[data-testid="activate-pack-button"]');
    await page.click('[data-testid="cashier-dropdown"]');
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    await page.click(`[data-testid="cashier-option-${testCashierId}"]`);
    await page.fill('[data-testid="pin-input"]', "1234");
    await page.click('[data-testid="verify-button"]');

    await expect(page.locator('[data-testid="step-2-scan"]')).toBeVisible({
      timeout: 5000,
    });

    // Enter valid serial
    await page.fill('[data-testid="serial-input"]', "000112345670123456789012");
    await page.locator('[data-testid="serial-input"]').blur();
    await expect(page.locator('[data-testid="pack-info"]')).toBeVisible({
      timeout: 5000,
    });

    // Select bin with existing pack - use role selector since Radix Select doesn't pass testid to trigger
    await page.getByRole("combobox", { name: /assign to bin/i }).click();
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    await page.click(`[data-testid="bin-option-${testBinId}"]`);

    // Should show warning about replacing existing pack
    await expect(page.locator('[data-testid="bin-warning"]')).toBeVisible({
      timeout: 3000,
    });
    await expect(page.locator('[data-testid="bin-warning"]')).toContainText(
      "$1 Pick 3",
    );
  });

  test("10-6-E2E-005: [P2] should allow user to go back from Step 2 to Step 1", async ({
    page,
    context,
  }) => {
    await setupAuthenticatedPage(page, context);

    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    await expect(
      page.locator('[data-testid="active-packs-table"]'),
    ).toBeVisible({ timeout: 10000 });

    await page.click('[data-testid="activate-pack-button"]');
    await page.click('[data-testid="cashier-dropdown"]');
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    await page.click(`[data-testid="cashier-option-${testCashierId}"]`);
    await page.fill('[data-testid="pin-input"]', "1234");
    await page.click('[data-testid="verify-button"]');

    await expect(page.locator('[data-testid="step-2-scan"]')).toBeVisible({
      timeout: 5000,
    });

    // Click Back button
    await page.click('button:has-text("Back")');

    // Should go back to Step 1
    await expect(page.locator('[data-testid="step-1-auth"]')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator('[data-testid="step-2-scan"]')).not.toBeVisible();
  });

  test("10-6-E2E-006: [P2] should handle API failure during pack activation", async ({
    page,
    context,
  }) => {
    await setupAuthenticatedPage(page, context, {
      activatePackResponse: {
        status: 500,
        body: { success: false, error: "Internal server error" },
      },
    });

    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    await expect(
      page.locator('[data-testid="active-packs-table"]'),
    ).toBeVisible({ timeout: 10000 });

    // Complete full flow
    await page.click('[data-testid="activate-pack-button"]');
    await page.click('[data-testid="cashier-dropdown"]');
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    await page.click(`[data-testid="cashier-option-${testCashierId}"]`);
    await page.fill('[data-testid="pin-input"]', "1234");
    await page.click('[data-testid="verify-button"]');

    await expect(page.locator('[data-testid="step-2-scan"]')).toBeVisible({
      timeout: 5000,
    });

    await page.fill('[data-testid="serial-input"]', "000112345670123456789012");
    await page.locator('[data-testid="serial-input"]').blur();
    await expect(page.locator('[data-testid="pack-info"]')).toBeVisible({
      timeout: 5000,
    });

    await page.getByRole("combobox", { name: /assign to bin/i }).click();
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    await page.click(`[data-testid="bin-option-${testBinId}"]`);

    // Try to activate (API will fail)
    await page.click('[data-testid="activate-button"]');

    // Should show error, modal should stay open
    await expect(
      page.locator("text=/failed|error|Internal server error/i"),
    ).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="step-2-scan"]')).toBeVisible();
  });
});
