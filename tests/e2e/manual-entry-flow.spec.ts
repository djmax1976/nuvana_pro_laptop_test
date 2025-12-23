/**
 * Manual Entry Flow E2E Test
 *
 * Critical user journey: Manual entry authorization → Manual entry mode → Enter numbers manually → Close shift
 *
 * @test-level E2E
 * @justification Tests critical multi-page user journey that cannot be tested at lower levels
 * @story 10-4 - Manual Entry Override
 * @priority P0 (Critical - Core User Journey)
 * @updated 2025-12-16 - SKIPPED: Route /mystore/terminal/shift-closing/lottery was removed.
 *                       Lottery functionality moved to /mystore/lottery. Tests need update.
 * @updated 2025-12-23 - Updated to use new email/password authentication flow instead of
 *                       cashier PIN verification. Now uses POST /api/auth/verify-user-permission.
 *
 * NOTE: These tests require a running frontend and backend with authentication.
 * Tests mock API responses but require valid session cookies for authenticated routes.
 * In CI, auth is typically handled via test fixtures or storage state.
 */

import { test, expect, Page, Route, BrowserContext } from "@playwright/test";

// Test data constants
const testShiftId = "test-shift-manual-entry-123";
const testStoreId = "test-store-manual-entry-123";
const testUserId = "test-user-manual-entry-123";
const testCashierId = "test-cashier-manual-entry-123";
const testBinId = "test-bin-manual-entry-001";
const testPackId = "test-pack-manual-entry-001";

/**
 * Helper to setup authenticated page with required API mocks
 * Sets up cookie-based auth that Next.js middleware can recognize
 */
async function setupAuthenticatedPage(page: Page, context: BrowserContext) {
  // Mock auth check endpoints
  await page.route("**/api/auth/me*", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: testUserId,
          email: "test@example.com",
          name: "Test User",
        },
      }),
    }),
  );

  // Mock session endpoint (used by Next.js auth)
  await page.route("**/api/auth/session*", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: testUserId,
          email: "test@example.com",
          name: "Test User",
        },
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }),
    }),
  );

  // Mock shift detail endpoint (required for storeId)
  await page.route(`**/api/shifts/${testShiftId}`, (route: Route) => {
    const url = route.request().url();
    // Don't intercept lottery endpoints
    if (url.includes("/lottery/")) {
      return route.continue();
    }
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
  });

  // Set auth session in localStorage (for client-side checks)
  await page.addInitScript((userId: string) => {
    localStorage.setItem(
      "auth_session",
      JSON.stringify({
        authenticated: true,
        user: {
          id: userId,
          email: "test@example.com",
          name: "Test User",
        },
        isClientUser: false,
      }),
    );
  }, testUserId);

  // Set mock auth cookie (for server-side middleware)
  await context.addCookies([
    {
      name: "auth-token",
      value: "test-jwt-token-for-manual-entry-e2e",
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
    {
      name: "session",
      value: JSON.stringify({
        user: { id: testUserId, email: "test@example.com" },
        authenticated: true,
      }),
      domain: "localhost",
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

/**
 * Helper to create mock closing data response
 */
function createMockClosingData(
  bins: Array<{
    bin_id: string;
    bin_number: number;
    name: string;
    is_active: boolean;
    pack: {
      pack_id: string;
      game_name: string;
      game_price: number;
      starting_serial: string;
      serial_end: string;
      pack_number: string;
    } | null;
  }>,
  soldPacks: Array<unknown> = [],
) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      data: {
        bins,
        soldPacks,
      },
    }),
  };
}

/**
 * Helper to check if page is on lottery closing (not redirected to login)
 * Returns false if redirected to auth pages or if login form is displayed
 */
async function isOnLotteryClosingPage(page: Page): Promise<boolean> {
  await page.waitForLoadState("networkidle");
  const currentUrl = page.url();

  // Check URL-based redirects
  if (currentUrl.includes("/login") || currentUrl.includes("/auth")) {
    return false;
  }

  // Check if login form is displayed (middleware may show login without URL change)
  const h1Text = await page.locator("h1").first().textContent();
  if (h1Text?.includes("Welcome back")) {
    return false;
  }

  return currentUrl.includes("/shift-closing/lottery");
}

// SKIPPED: Route /mystore/terminal/shift-closing/lottery was removed.
// Lottery functionality has been moved to /mystore/lottery page.
// These tests need to be updated when shift-end page is implemented with lottery closing.
test.describe.skip("10-4-E2E: Manual Entry Flow (Critical Journey)", () => {
  test.beforeEach(async ({ page, context }) => {
    // Set up authentication for all tests in this describe block
    await setupAuthenticatedPage(page, context);
  });

  test("10-4-E2E-001: Shift Manager can complete shift closing with manual entry", async ({
    page,
  }) => {
    // Mock lottery closing data
    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill(
        createMockClosingData([
          {
            bin_id: testBinId,
            bin_number: 1,
            name: "Bin 1",
            is_active: true,
            pack: {
              pack_id: testPackId,
              game_name: "$5 Powerball",
              game_price: 5,
              starting_serial: "045",
              serial_end: "150",
              pack_number: "1234567",
            },
          },
        ]),
      ),
    );

    // Mock active shift cashiers
    await page.route(
      `**/api/stores/${testStoreId}/active-shift-cashiers`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: [
              {
                id: testCashierId,
                name: "Shift Manager",
                shiftId: testShiftId,
              },
            ],
          }),
        }),
    );

    // Mock user permission verification (successful)
    // NOTE: Updated from verify-cashier-permission to verify-user-permission
    // Now uses email/password instead of cashier PIN
    await page.route("**/api/auth/verify-user-permission", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          valid: true,
          userId: testUserId,
          name: "Shift Manager",
          hasPermission: true,
        }),
      }),
    );

    // Capture the close request to verify entry_method
    let closeRequest: {
      closings: Array<{
        bin_id: string;
        pack_id: string;
        ending_serial: string;
        entry_method: string;
        manual_entry_authorized_by?: string;
        manual_entry_authorized_at?: string;
      }>;
      closed_by: string;
    } | null = null;

    await page.route("**/api/shifts/*/lottery/close", async (route) => {
      const request = route.request();
      closeRequest = await request.postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            summary: {
              packs_closed: 1,
              packs_depleted: 0,
              total_tickets_sold: 56,
              variances: [],
            },
          },
        }),
      });
    });

    // GIVEN: User is logged in and on Lottery Shift Closing page
    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    // Check if auth redirected us
    if (!(await isOnLotteryClosingPage(page))) {
      test.skip(true, "Test skipped: Auth not configured for E2E environment");
      return;
    }

    // Wait for page to load and verify title
    await expect(page.locator("h1")).toContainText("Lottery Shift Closing", {
      timeout: 10000,
    });

    // WHEN: User clicks "Manual Entry" button
    await page.click('[data-testid="manual-entry-button"]');

    // THEN: Auth modal opens
    await expect(
      page.locator('[data-testid="manual-entry-auth-modal"]'),
    ).toBeVisible({ timeout: 5000 });

    // WHEN: User enters email and password for authorization
    // NOTE: Updated from cashier/PIN to email/password
    await page.fill('[data-testid="email-input"]', "manager@example.com");
    await page.fill('[data-testid="password-input"]', "securePassword123");
    await page.click('[data-testid="verify-button"]');

    // THEN: Modal closes and manual entry mode activates
    await expect(
      page.locator('[data-testid="manual-entry-auth-modal"]'),
    ).not.toBeVisible({ timeout: 5000 });

    await expect(
      page.locator('[data-testid="manual-entry-indicator"]'),
    ).toBeVisible({ timeout: 5000 });

    // Verify indicator shows "Manual Entry Mode Active" title
    await expect(
      page.locator('[data-testid="manual-entry-indicator"]'),
    ).toContainText("Manual Entry Mode Active");

    // WHEN: User types ending number directly (manual entry)
    const endingInput = page.locator(
      `[data-testid="ending-number-input-${testBinId}"]`,
    );
    await expect(endingInput).toBeVisible();
    await endingInput.fill("100");

    // THEN: Input accepts the value (no pack validation error)
    await expect(endingInput).toHaveValue("100");

    // Verify no error message is displayed for this bin
    await expect(
      page.locator(`[data-testid="error-message-${testBinId}"]`),
    ).not.toBeVisible();

    // WHEN: User clicks Next button
    await page.click('[data-testid="next-button"]');

    // THEN: Shift closing is saved with entry_method = 'MANUAL'
    // Wait for navigation or API call to complete
    await page.waitForLoadState("networkidle");

    // Verify the API was called with correct entry_method
    expect(closeRequest).not.toBeNull();
    expect(closeRequest!.closings).toBeDefined();
    expect(closeRequest!.closings.length).toBeGreaterThan(0);
    expect(closeRequest!.closings[0].entry_method).toBe("MANUAL");
    expect(closeRequest!.closings[0].manual_entry_authorized_by).toBe(
      testUserId,
    );
    expect(closeRequest!.closings[0].manual_entry_authorized_at).toBeDefined();
    expect(closeRequest!.closed_by).toBe(testUserId);
  });

  // ============================================================================
  // 🔄 EDGE CASES (Standard Boundaries - Applied Automatically)
  // ============================================================================

  test("10-4-E2E-EDGE-001: should handle invalid PIN in manual entry flow", async ({
    page,
  }) => {
    // Mock lottery closing data
    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill(
        createMockClosingData([
          {
            bin_id: testBinId,
            bin_number: 1,
            name: "Bin 1",
            is_active: true,
            pack: {
              pack_id: testPackId,
              game_name: "$5 Powerball",
              game_price: 5,
              starting_serial: "045",
              serial_end: "150",
              pack_number: "1234567",
            },
          },
        ]),
      ),
    );

    // Mock active shift cashiers
    await page.route(
      `**/api/stores/${testStoreId}/active-shift-cashiers`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: [
              {
                id: testCashierId,
                name: "Shift Manager",
                shiftId: testShiftId,
              },
            ],
          }),
        }),
    );

    // Mock API to return invalid credentials error
    // NOTE: Updated from verify-cashier-permission to verify-user-permission
    await page.route("**/api/auth/verify-user-permission", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          valid: false,
          error: "Invalid email or password",
        }),
      }),
    );

    // GIVEN: User is on Lottery Shift Closing page
    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    // Check if auth redirected us
    if (!(await isOnLotteryClosingPage(page))) {
      test.skip(true, "Test skipped: Auth not configured for E2E environment");
      return;
    }

    // Wait for page to load
    await expect(page.locator("h1")).toContainText("Lottery Shift Closing", {
      timeout: 10000,
    });

    // WHEN: User attempts manual entry with invalid credentials
    // NOTE: Updated from cashier/PIN to email/password
    await page.click('[data-testid="manual-entry-button"]');
    await expect(
      page.locator('[data-testid="manual-entry-auth-modal"]'),
    ).toBeVisible({ timeout: 5000 });

    await page.fill('[data-testid="email-input"]', "wrong@example.com");
    await page.fill('[data-testid="password-input"]', "wrongpassword");
    await page.click('[data-testid="verify-button"]');

    // THEN: Error message is displayed and modal stays open
    // Use first error message (there may be multiple with same test ID)
    await expect(
      page.locator('[data-testid="error-message"]').first(),
    ).toBeVisible({ timeout: 5000 });

    await expect(
      page.locator('[data-testid="error-message"]').first(),
    ).toContainText(/invalid.*email.*password/i);

    // Modal should still be visible
    await expect(
      page.locator('[data-testid="manual-entry-auth-modal"]'),
    ).toBeVisible();

    // Manual entry indicator should NOT be visible
    await expect(
      page.locator('[data-testid="manual-entry-indicator"]'),
    ).not.toBeVisible();
  });

  test("10-4-E2E-EDGE-002: should handle unauthorized user in manual entry flow", async ({
    page,
  }) => {
    const regularCashierId = "test-regular-cashier-123";

    // Mock lottery closing data
    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill(
        createMockClosingData([
          {
            bin_id: testBinId,
            bin_number: 1,
            name: "Bin 1",
            is_active: true,
            pack: {
              pack_id: testPackId,
              game_name: "$5 Powerball",
              game_price: 5,
              starting_serial: "045",
              serial_end: "150",
              pack_number: "1234567",
            },
          },
        ]),
      ),
    );

    // Mock active shift cashiers (only regular cashier available)
    await page.route(
      `**/api/stores/${testStoreId}/active-shift-cashiers`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: [
              {
                id: regularCashierId,
                name: "Regular Cashier",
                shiftId: testShiftId,
              },
            ],
          }),
        }),
    );

    // Mock API to return no permission
    // NOTE: Updated from verify-cashier-permission to verify-user-permission
    await page.route("**/api/auth/verify-user-permission", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          valid: true,
          userId: "regular-user-id",
          name: "Regular User",
          hasPermission: false, // No permission for manual entry
        }),
      }),
    );

    // GIVEN: User is on Lottery Shift Closing page
    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    // Check if auth redirected us
    if (!(await isOnLotteryClosingPage(page))) {
      test.skip(true, "Test skipped: Auth not configured for E2E environment");
      return;
    }

    // Wait for page to load
    await expect(page.locator("h1")).toContainText("Lottery Shift Closing", {
      timeout: 10000,
    });

    // WHEN: User attempts manual entry without permission
    // NOTE: Updated from cashier/PIN to email/password
    await page.click('[data-testid="manual-entry-button"]');
    await expect(
      page.locator('[data-testid="manual-entry-auth-modal"]'),
    ).toBeVisible({ timeout: 5000 });

    await page.fill('[data-testid="email-input"]', "regular@example.com");
    await page.fill('[data-testid="password-input"]', "password123");
    await page.click('[data-testid="verify-button"]');

    // THEN: Authorization error is displayed and modal stays open
    // Use first error message (there may be multiple with same test ID)
    await expect(
      page.locator('[data-testid="error-message"]').first(),
    ).toBeVisible({ timeout: 5000 });

    await expect(
      page.locator('[data-testid="error-message"]').first(),
    ).toContainText(/not authorized.*manual entry/i);

    // Modal should still be visible
    await expect(
      page.locator('[data-testid="manual-entry-auth-modal"]'),
    ).toBeVisible();

    // Manual entry indicator should NOT be visible
    await expect(
      page.locator('[data-testid="manual-entry-indicator"]'),
    ).not.toBeVisible();
  });

  // ============================================================================
  // ✅ ENHANCED ASSERTIONS (Best Practices - Applied Automatically)
  // ============================================================================

  test("10-4-E2E-ASSERT-001: should verify API request structure in manual entry flow", async ({
    page,
  }) => {
    // Mock lottery closing data
    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill(
        createMockClosingData([
          {
            bin_id: testBinId,
            bin_number: 1,
            name: "Bin 1",
            is_active: true,
            pack: {
              pack_id: testPackId,
              game_name: "$5 Powerball",
              game_price: 5,
              starting_serial: "045",
              serial_end: "150",
              pack_number: "1234567",
            },
          },
        ]),
      ),
    );

    // Intercept and capture API request structure
    // NOTE: Updated from verify-cashier-permission to verify-user-permission
    // Now captures email/password instead of cashierId/pin
    let verifyRequest: {
      email: string;
      password: string;
      permission: string;
      storeId: string;
    } | null = null;

    await page.route("**/api/auth/verify-user-permission", async (route) => {
      const request = route.request();
      verifyRequest = await request.postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          valid: true,
          userId: testUserId,
          name: "Shift Manager",
          hasPermission: true,
        }),
      });
    });

    // GIVEN: User is on Lottery Shift Closing page
    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    // Check if auth redirected us
    if (!(await isOnLotteryClosingPage(page))) {
      test.skip(true, "Test skipped: Auth not configured for E2E environment");
      return;
    }

    // Wait for page to load
    await expect(page.locator("h1")).toContainText("Lottery Shift Closing", {
      timeout: 10000,
    });

    await page.click('[data-testid="manual-entry-button"]');
    await expect(
      page.locator('[data-testid="manual-entry-auth-modal"]'),
    ).toBeVisible({ timeout: 5000 });

    // NOTE: Updated from cashier/PIN to email/password
    await page.fill('[data-testid="email-input"]', "manager@example.com");
    await page.fill('[data-testid="password-input"]', "securePassword123");
    await page.click('[data-testid="verify-button"]');

    // THEN: API request has correct structure
    // Wait for the request to complete
    await expect(
      page.locator('[data-testid="manual-entry-auth-modal"]'),
    ).not.toBeVisible({ timeout: 5000 });

    expect(verifyRequest).not.toBeNull();
    expect(verifyRequest!.email).toBe("manager@example.com");
    expect(verifyRequest!.password).toBe("securePassword123");
    expect(verifyRequest!.permission).toBe("LOTTERY_MANUAL_ENTRY");
    expect(verifyRequest!.storeId).toBe(testStoreId);

    // Verify modal closed and indicator appeared
    await expect(
      page.locator('[data-testid="manual-entry-indicator"]'),
    ).toBeVisible({ timeout: 5000 });
  });

  // ============================================================================
  // 🔒 SECURITY TESTS (Mandatory for auth flows)
  // ============================================================================

  test("10-4-E2E-SEC-001: should not expose password in UI after entry", async ({
    page,
  }) => {
    // Mock lottery closing data
    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill(
        createMockClosingData([
          {
            bin_id: testBinId,
            bin_number: 1,
            name: "Bin 1",
            is_active: true,
            pack: {
              pack_id: testPackId,
              game_name: "$5 Powerball",
              game_price: 5,
              starting_serial: "045",
              serial_end: "150",
              pack_number: "1234567",
            },
          },
        ]),
      ),
    );

    // Mock successful verification
    // NOTE: Updated from verify-cashier-permission to verify-user-permission
    await page.route("**/api/auth/verify-user-permission", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          valid: true,
          userId: testUserId,
          name: "Shift Manager",
          hasPermission: true,
        }),
      }),
    );

    // GIVEN: User is on Lottery Shift Closing page
    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    // Check if auth redirected us
    if (!(await isOnLotteryClosingPage(page))) {
      test.skip(true, "Test skipped: Auth not configured for E2E environment");
      return;
    }

    await expect(page.locator("h1")).toContainText("Lottery Shift Closing", {
      timeout: 10000,
    });

    // Open manual entry modal
    await page.click('[data-testid="manual-entry-button"]');
    await expect(
      page.locator('[data-testid="manual-entry-auth-modal"]'),
    ).toBeVisible({ timeout: 5000 });

    // WHEN: User enters password
    // NOTE: Updated from PIN to password input
    const passwordInput = page.locator('[data-testid="password-input"]');
    await passwordInput.fill("securePassword123");

    // THEN: Password input should be masked (type="password")
    await expect(passwordInput).toHaveAttribute("type", "password");

    // AND: Password value should not be visible as plain text in the input's value display
    // The actual value attribute should contain the password, but it should be rendered as dots
    await expect(passwordInput).toHaveValue("securePassword123");
  });

  test("10-4-E2E-SEC-002: should clear form on modal cancel", async ({
    page,
  }) => {
    // Mock lottery closing data
    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill(
        createMockClosingData([
          {
            bin_id: testBinId,
            bin_number: 1,
            name: "Bin 1",
            is_active: true,
            pack: {
              pack_id: testPackId,
              game_name: "$5 Powerball",
              game_price: 5,
              starting_serial: "045",
              serial_end: "150",
              pack_number: "1234567",
            },
          },
        ]),
      ),
    );

    // GIVEN: User is on Lottery Shift Closing page
    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    // Check if auth redirected us
    if (!(await isOnLotteryClosingPage(page))) {
      test.skip(true, "Test skipped: Auth not configured for E2E environment");
      return;
    }

    await expect(page.locator("h1")).toContainText("Lottery Shift Closing", {
      timeout: 10000,
    });

    // Open manual entry modal and fill form
    await page.click('[data-testid="manual-entry-button"]');
    await expect(
      page.locator('[data-testid="manual-entry-auth-modal"]'),
    ).toBeVisible({ timeout: 5000 });

    // NOTE: Updated from cashier/PIN to email/password
    await page.fill('[data-testid="email-input"]', "manager@example.com");
    await page.fill('[data-testid="password-input"]', "securePassword123");

    // WHEN: User cancels
    await page.click('[data-testid="cancel-button"]');

    // THEN: Modal closes
    await expect(
      page.locator('[data-testid="manual-entry-auth-modal"]'),
    ).not.toBeVisible({ timeout: 5000 });

    // AND: When reopening, form should be cleared
    await page.click('[data-testid="manual-entry-button"]');
    await expect(
      page.locator('[data-testid="manual-entry-auth-modal"]'),
    ).toBeVisible({ timeout: 5000 });

    // Email and password should be empty
    await expect(page.locator('[data-testid="email-input"]')).toHaveValue("");
    await expect(page.locator('[data-testid="password-input"]')).toHaveValue(
      "",
    );
  });
});
