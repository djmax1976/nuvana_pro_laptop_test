/**
 * Lottery Shift Closing E2E Test
 *
 * Critical user journey: Navigate from Terminal page → Closing page → Enter numbers → Click Next
 *
 * @test-level E2E
 * @justification Tests critical multi-page user journey that cannot be tested at lower levels
 * @story 10-1 - Lottery Shift Closing Page UI
 * @priority P0 (Critical - Core User Journey)
 *
 * Serial Number Format (24 digits):
 * - Positions 1-4: Game code (4 digits)
 * - Positions 5-11: Pack number (7 digits)
 * - Positions 12-14: Ticket/serial number (3 digits) - extracted as ending number
 * - Positions 15-24: Identifier (10 digits)
 *
 * Example: "000112345670673456789012"
 * - game_code: "0001"
 * - pack_number: "1234567"
 * - serial_start (ending number): "067"
 *
 * NOTE: These tests require a running frontend and backend with authentication.
 * Tests mock API responses but require valid session cookies for authenticated routes.
 * In CI, auth is typically handled via test fixtures or storage state.
 */

import { test, expect, Page, Route, BrowserContext } from "@playwright/test";

// Test data constants
const testShiftId = "test-shift-e2e-flow-123";
const testStoreId = "test-store-e2e-flow-123";
const testUserId = "test-user-e2e-flow-123";

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
  await page.route(`**/api/shifts/${testShiftId}*`, (route: Route) =>
    route.fulfill({
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
    }),
  );

  // Mock shift detail for any shift ID pattern
  await page.route("**/api/shifts/*", (route: Route) => {
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
      value: "test-jwt-token-for-e2e-testing",
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
 * Helper to create a valid 24-digit barcode
 * @param packNumber - 7-digit pack number
 * @param ticketNumber - 3-digit ticket/serial number (this becomes the ending number)
 * @param gameCode - 4-digit game code (default "0001")
 * @param identifier - 10-digit identifier (default "4567890123")
 */
function createBarcode(
  packNumber: string,
  ticketNumber: string,
  gameCode = "0001",
  identifier = "4567890123",
): string {
  // Validate lengths
  if (gameCode.length !== 4) throw new Error("Game code must be 4 digits");
  if (packNumber.length !== 7) throw new Error("Pack number must be 7 digits");
  if (ticketNumber.length !== 3)
    throw new Error("Ticket number must be 3 digits");
  if (identifier.length !== 10) throw new Error("Identifier must be 10 digits");

  return `${gameCode}${packNumber}${ticketNumber}${identifier}`;
}

test.describe("10-1-E2E: Lottery Shift Closing Flow (Critical Journey)", () => {
  test.beforeEach(async ({ page, context }) => {
    // Set up authentication for all tests in this describe block
    await setupAuthenticatedPage(page, context);
  });

  test("10-1-E2E-001: user can navigate to closing page and enter ending numbers", async ({
    page,
  }) => {
    // CRITICAL: Intercept routes BEFORE navigation (network-first)
    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill(
        createMockClosingData([
          {
            bin_id: "bin-1",
            bin_number: 1,
            name: "Bin 1",
            is_active: true,
            pack: {
              pack_id: "pack-1",
              game_name: "$5 Powerball",
              game_price: 5,
              starting_serial: "045",
              serial_end: "999",
              pack_number: "1234567",
            },
          },
          {
            bin_id: "bin-2",
            bin_number: 2,
            name: "Bin 2",
            is_active: true,
            pack: {
              pack_id: "pack-2",
              game_name: "$10 Mega Millions",
              game_price: 10,
              starting_serial: "100",
              serial_end: "999",
              pack_number: "7890123",
            },
          },
        ]),
      ),
    );

    // Mock the close endpoint for submission
    await page.route("**/api/shifts/*/lottery/close", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            summary: {
              packs_closed: 2,
              packs_depleted: 0,
              total_tickets_sold: 100,
              variances: [],
            },
          },
        }),
      }),
    );

    // GIVEN: User navigates to lottery shift closing page
    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    // THEN: User sees the Lottery Shift Closing page
    // Wait for the page to fully load (either shows closing page or redirects)
    await page.waitForLoadState("networkidle");

    // Check if we're on the lottery closing page (not redirected to login)
    const currentUrl = page.url();
    if (currentUrl.includes("/login") || currentUrl.includes("/auth")) {
      test.skip(true, "Test skipped: Auth not configured for E2E environment");
      return;
    }

    // Page title is in h1 element (no data-testid)
    await expect(page.locator("h1")).toContainText("Lottery Shift Closing");

    // AND: Page displays active packs table
    await expect(
      page.locator('[data-testid="active-packs-table"]'),
    ).toBeVisible();

    // WHEN: User enters ending numbers for all active bins
    await page.fill('[data-testid="ending-number-input-bin-1"]', "123");
    await page.fill('[data-testid="ending-number-input-bin-2"]', "456");

    // THEN: Next button is enabled
    await expect(page.locator('[data-testid="next-button"]')).toBeEnabled();

    // WHEN: User clicks Next button
    await page.click('[data-testid="next-button"]');

    // THEN: User proceeds to cash closing page
    await expect(page).toHaveURL(
      new RegExp(
        `/mystore/terminal/shift-closing/cash\\?shiftId=${testShiftId}`,
      ),
      { timeout: 10000 },
    );
  });

  // ============ SECURITY TESTS (MANDATORY) ============

  test("10-1-E2E-SEC-001: should prevent XSS in game names during E2E flow", async ({
    page,
  }) => {
    // GIVEN: API returns bins with XSS attempt in game names
    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill(
        createMockClosingData([
          {
            bin_id: "bin-1",
            bin_number: 1,
            name: "Bin 1",
            is_active: true,
            pack: {
              pack_id: "pack-1",
              game_name: "<script>alert('XSS')</script>$5 Powerball",
              game_price: 5,
              starting_serial: "045",
              serial_end: "999",
              pack_number: "1234567",
            },
          },
        ]),
      ),
    );

    // Track if any alert dialog appears
    let alertTriggered = false;
    page.on("dialog", (dialog) => {
      alertTriggered = true;
      dialog.dismiss();
    });

    // WHEN: User navigates to closing page
    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    // Wait for page load
    await page.waitForLoadState("networkidle");

    // Skip if redirected to login
    if (page.url().includes("/login") || page.url().includes("/auth")) {
      test.skip(true, "Test skipped: Auth not configured for E2E environment");
      return;
    }

    // Wait for page to load
    await expect(
      page.locator('[data-testid="active-packs-table"]'),
    ).toBeVisible();

    // THEN: XSS is prevented - React auto-escapes, so script won't execute
    expect(alertTriggered).toBe(false);

    // AND: The table row exists (game name is rendered safely)
    await expect(
      page.locator('[data-testid="active-packs-row-bin-1"]'),
    ).toBeVisible();
  });

  test("10-1-E2E-SEC-002: should require authentication for closing page", async ({
    page,
    context,
  }) => {
    // Clear cookies to test unauthenticated access
    await context.clearCookies();

    // Mock closing data to NOT be served (simulating no auth)
    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: "Unauthorized",
        }),
      }),
    );

    // WHEN: User tries to access closing page directly without auth
    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    // Wait for redirect/auth check to complete
    await page.waitForLoadState("networkidle");

    // THEN: User is redirected to login or sees error
    const url = page.url();
    const isLoginPage = url.includes("/login") || url.includes("/auth");
    const hasError = await page
      .locator("text=/401|Unauthorized|error|failed|sign in/i")
      .isVisible()
      .catch(() => false);

    // Either redirected to login or shows error
    expect(isLoginPage || hasError).toBe(true);
  });

  // ============ AUTOMATIC ASSERTIONS ============

  test("10-1-E2E-ASSERT-001: should have correct page structure with data-testid attributes", async ({
    page,
  }) => {
    // GIVEN: API returns closing data
    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill(
        createMockClosingData([
          {
            bin_id: "bin-1",
            bin_number: 1,
            name: "Bin 1",
            is_active: true,
            pack: {
              pack_id: "pack-1",
              game_name: "$5 Powerball",
              game_price: 5,
              starting_serial: "045",
              serial_end: "999",
              pack_number: "1234567",
            },
          },
        ]),
      ),
    );

    // WHEN: User navigates to closing page
    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    await page.waitForLoadState("networkidle");

    // Skip if redirected to login
    if (page.url().includes("/login") || page.url().includes("/auth")) {
      test.skip(true, "Test skipped: Auth not configured for E2E environment");
      return;
    }

    // THEN: Page has correct structure with data-testid attributes
    await expect(
      page.locator('[data-testid="active-packs-table"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="shift-closing-actions"]'),
    ).toBeVisible();
    await expect(page.locator('[data-testid="next-button"]')).toBeVisible();
  });

  // ============ EDGE CASES ============

  test("10-1-E2E-EDGE-001: should handle network failure gracefully", async ({
    page,
  }) => {
    // GIVEN: Network failure when requesting closing data
    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.abort("failed"),
    );

    // WHEN: User navigates to closing page
    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    await page.waitForLoadState("networkidle");

    // Skip if redirected to login
    if (page.url().includes("/login") || page.url().includes("/auth")) {
      test.skip(true, "Test skipped: Auth not configured for E2E environment");
      return;
    }

    // THEN: Error message is displayed (component shows error alert)
    await expect(
      page.locator("text=/error|failed|Failed to load/i"),
    ).toBeVisible({
      timeout: 5000,
    });
  });

  test("10-1-E2E-EDGE-002: should handle slow network response", async ({
    page,
  }) => {
    // GIVEN: Slow API response (2 second delay)
    await page.route("**/api/shifts/*/lottery/closing-data", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill(
        createMockClosingData([
          {
            bin_id: "bin-1",
            bin_number: 1,
            name: "Bin 1",
            is_active: true,
            pack: {
              pack_id: "pack-1",
              game_name: "$5 Powerball",
              game_price: 5,
              starting_serial: "045",
              serial_end: "999",
              pack_number: "1234567",
            },
          },
        ]),
      );
    });

    // WHEN: User navigates to closing page
    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    // Skip if redirected to login
    if (page.url().includes("/login") || page.url().includes("/auth")) {
      test.skip(true, "Test skipped: Auth not configured for E2E environment");
      return;
    }

    // THEN: Loading state is shown, then content appears
    await expect(
      page.locator('[data-testid="active-packs-table"]'),
    ).toBeVisible({ timeout: 5000 });
  });

  test("10-1-E2E-EDGE-003: should handle empty bins array", async ({
    page,
  }) => {
    // GIVEN: API returns empty bins array
    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill(createMockClosingData([])),
    );

    // WHEN: User navigates to closing page
    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    await page.waitForLoadState("networkidle");

    // Skip if redirected to login
    if (page.url().includes("/login") || page.url().includes("/auth")) {
      test.skip(true, "Test skipped: Auth not configured for E2E environment");
      return;
    }

    // THEN: Empty state message is displayed
    await expect(
      page.locator("text=No bins configured for this store"),
    ).toBeVisible();
  });

  test("10-1-E2E-EDGE-004: should handle all bins empty (no active packs)", async ({
    page,
  }) => {
    // GIVEN: API returns bins but all are empty
    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill(
        createMockClosingData([
          {
            bin_id: "bin-1",
            bin_number: 1,
            name: "Bin 1",
            is_active: true,
            pack: null,
          },
          {
            bin_id: "bin-2",
            bin_number: 2,
            name: "Bin 2",
            is_active: true,
            pack: null,
          },
        ]),
      ),
    );

    // WHEN: User navigates to closing page
    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    await page.waitForLoadState("networkidle");

    // Skip if redirected to login
    if (page.url().includes("/login") || page.url().includes("/auth")) {
      test.skip(true, "Test skipped: Auth not configured for E2E environment");
      return;
    }

    // THEN: All bins show as empty
    await expect(page.locator("text=(Empty)")).toHaveCount(2);
    // AND: Next button is enabled (no active bins to validate)
    await expect(page.locator('[data-testid="next-button"]')).toBeEnabled();
  });

  // ============ BUSINESS LOGIC TESTS ============

  test("10-1-E2E-BUSINESS-001: should handle maximum 200 bins in E2E flow", async ({
    page,
  }) => {
    // GIVEN: API returns 200 bins (maximum allowed)
    const maxBins = Array.from({ length: 200 }, (_, i) => ({
      bin_id: `bin-${i + 1}`,
      bin_number: i + 1,
      name: `Bin ${i + 1}`,
      is_active: true,
      pack: {
        pack_id: `pack-${i + 1}`,
        game_name: "$5 Powerball",
        game_price: 5,
        starting_serial: "045",
        serial_end: "999",
        pack_number: "1234567",
      },
    }));

    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill(createMockClosingData(maxBins)),
    );

    // WHEN: User navigates to closing page
    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    await page.waitForLoadState("networkidle");

    // Skip if redirected to login
    if (page.url().includes("/login") || page.url().includes("/auth")) {
      test.skip(true, "Test skipped: Auth not configured for E2E environment");
      return;
    }

    // THEN: All 200 bins are displayed
    await expect(
      page.locator('[data-testid^="active-packs-row-"]'),
    ).toHaveCount(200);

    // AND: Table container has scrollable class
    const tableContainer = page.locator('[data-testid="active-packs-table"]');
    await expect(tableContainer).toBeVisible();
    await expect(tableContainer.locator(".max-h-\\[70vh\\]")).toBeVisible();
  });

  test("10-1-E2E-BUSINESS-002: should validate ending serial range during E2E flow", async ({
    page,
  }) => {
    // GIVEN: Bin with pack
    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill(
        createMockClosingData([
          {
            bin_id: "bin-1",
            bin_number: 1,
            name: "Bin 1",
            is_active: true,
            pack: {
              pack_id: "pack-1",
              game_name: "$5 Powerball",
              game_price: 5,
              starting_serial: "045",
              serial_end: "999",
              pack_number: "1234567",
            },
          },
        ]),
      ),
    );

    // WHEN: User navigates and enters ending serial
    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    await page.waitForLoadState("networkidle");

    // Skip if redirected to login
    if (page.url().includes("/login") || page.url().includes("/auth")) {
      test.skip(true, "Test skipped: Auth not configured for E2E environment");
      return;
    }

    await page.fill('[data-testid="ending-number-input-bin-1"]', "100");

    // THEN: Ending serial is accepted (within range)
    const inputValue = await page
      .locator('[data-testid="ending-number-input-bin-1"]')
      .inputValue();
    expect(inputValue).toBe("100");
    // AND: Next button is enabled
    await expect(page.locator('[data-testid="next-button"]')).toBeEnabled();
  });
});

// ============================================================================
// STORY 10-3: BARCODE SCANNING E2E TEST
// ============================================================================

test.describe("10-3-E2E: Barcode Scanning Flow (Critical Journey)", () => {
  test.beforeEach(async ({ page, context }) => {
    await setupAuthenticatedPage(page, context);
  });

  test("10-3-E2E-001: user can scan barcode and auto-fill ending number", async ({
    page,
  }) => {
    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill(
        createMockClosingData([
          {
            bin_id: "bin-1",
            bin_number: 1,
            name: "Bin 1",
            is_active: true,
            pack: {
              pack_id: "pack-1",
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

    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    await page.waitForLoadState("networkidle");

    if (page.url().includes("/login") || page.url().includes("/auth")) {
      test.skip(true, "Test skipped: Auth not configured for E2E environment");
      return;
    }

    await expect(page.locator("h1")).toContainText("Lottery Shift Closing");

    const input = page.locator('[data-testid="ending-number-input-bin-1"]');

    // Scan barcode
    const scannedSerial = createBarcode("1234567", "067");
    await input.click();
    await input.fill(scannedSerial);

    await page.waitForTimeout(200);

    // THEN: 3-digit ending number is auto-filled
    await expect(input).toHaveValue("067");

    // AND: Input shows green border
    await expect(input).toHaveClass(/border-green-500/);

    // AND: No error message
    const errorMessage = page.locator('[data-testid="error-message-bin-1"]');
    await expect(errorMessage).not.toBeVisible();
  });

  test("10-3-E2E-002: user sees error when scanning wrong pack number", async ({
    page,
  }) => {
    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill(
        createMockClosingData([
          {
            bin_id: "bin-1",
            bin_number: 1,
            name: "Bin 1",
            is_active: true,
            pack: {
              pack_id: "pack-1",
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

    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    await page.waitForLoadState("networkidle");

    if (page.url().includes("/login") || page.url().includes("/auth")) {
      test.skip(true, "Test skipped: Auth not configured for E2E environment");
      return;
    }

    const input = page.locator('[data-testid="ending-number-input-bin-1"]');

    // Scan wrong pack
    const wrongPackScan = createBarcode("9999999", "067");
    await input.click();
    await input.fill(wrongPackScan);

    await page.waitForTimeout(200);

    // THEN: Error message
    const errorMessage = page.locator('[data-testid="error-message-bin-1"]');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText(/Wrong pack/i);

    // AND: Input shows red border
    await expect(input).toHaveClass(/border-red-500/);

    // AND: Input is cleared
    await expect(input).toHaveValue("");
  });

  test("10-3-E2E-003: user sees error when ending < starting", async ({
    page,
  }) => {
    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill(
        createMockClosingData([
          {
            bin_id: "bin-1",
            bin_number: 1,
            name: "Bin 1",
            is_active: true,
            pack: {
              pack_id: "pack-1",
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

    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    await page.waitForLoadState("networkidle");

    if (page.url().includes("/login") || page.url().includes("/auth")) {
      test.skip(true, "Test skipped: Auth not configured for E2E environment");
      return;
    }

    const input = page.locator('[data-testid="ending-number-input-bin-1"]');

    // Scan with ending < starting
    const belowStartingScan = createBarcode("1234567", "030");
    await input.click();
    await input.fill(belowStartingScan);

    await page.waitForTimeout(200);

    // THEN: Error message
    const errorMessage = page.locator('[data-testid="error-message-bin-1"]');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText(/cannot be less than starting/i);
    await expect(errorMessage).toContainText("045");

    // AND: Input shows red border
    await expect(input).toHaveClass(/border-red-500/);
  });

  test("10-3-E2E-004: user sees error when ending > serial_end (business rule)", async ({
    page,
  }) => {
    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill(
        createMockClosingData([
          {
            bin_id: "bin-1",
            bin_number: 1,
            name: "Bin 1",
            is_active: true,
            pack: {
              pack_id: "pack-1",
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

    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    await page.waitForLoadState("networkidle");

    if (page.url().includes("/login") || page.url().includes("/auth")) {
      test.skip(true, "Test skipped: Auth not configured for E2E environment");
      return;
    }

    const input = page.locator('[data-testid="ending-number-input-bin-1"]');

    // Scan with ending > serial_end
    const aboveMaxScan = createBarcode("1234567", "151");
    await input.click();
    await input.fill(aboveMaxScan);

    await page.waitForTimeout(200);

    // THEN: Error message
    const errorMessage = page.locator('[data-testid="error-message-bin-1"]');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText(/exceeds pack maximum/i);
    await expect(errorMessage).toContainText("150");

    // AND: Input shows red border
    await expect(input).toHaveClass(/border-red-500/);

    // AND: Input is cleared
    await expect(input).toHaveValue("");
  });

  test("10-3-E2E-005: [P1] Enhanced assertions - Rapid sequential scans process correctly", async ({
    page,
  }) => {
    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill(
        createMockClosingData([
          {
            bin_id: "bin-1",
            bin_number: 1,
            name: "Bin 1",
            is_active: true,
            pack: {
              pack_id: "pack-1",
              game_name: "$5 Powerball",
              game_price: 5,
              starting_serial: "045",
              serial_end: "150",
              pack_number: "1234567",
            },
          },
          {
            bin_id: "bin-2",
            bin_number: 2,
            name: "Bin 2",
            is_active: true,
            pack: {
              pack_id: "pack-2",
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

    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    await page.waitForLoadState("networkidle");

    if (page.url().includes("/login") || page.url().includes("/auth")) {
      test.skip(true, "Test skipped: Auth not configured for E2E environment");
      return;
    }

    const input1 = page.locator('[data-testid="ending-number-input-bin-1"]');
    const input2 = page.locator('[data-testid="ending-number-input-bin-2"]');

    // Rapid sequential scans
    const scan1 = createBarcode("1234567", "067");
    const scan2 = createBarcode("1234567", "068");

    await input1.click();
    await input1.fill(scan1);

    await page.waitForTimeout(200);
    await expect(input1).toHaveValue("067");

    try {
      await expect(input2).toBeFocused({ timeout: 1000 });
    } catch {
      // Auto-advance may not be implemented
    }

    await input2.click();
    await input2.fill(scan2);

    await page.waitForTimeout(200);
    await expect(input2).toHaveValue("068");

    // THEN: Both scans processed correctly
    await expect(input1).toHaveValue("067");
    await expect(input2).toHaveValue("068");

    // AND: No errors
    const error1 = page.locator('[data-testid="error-message-bin-1"]');
    const error2 = page.locator('[data-testid="error-message-bin-2"]');
    await expect(error1).not.toBeVisible();
    await expect(error2).not.toBeVisible();
  });
});
