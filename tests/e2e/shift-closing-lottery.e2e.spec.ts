/**
 * Shift Closing Lottery E2E Tests
 *
 * Tests for the complete lottery closing user flow:
 * - Complete lottery closing flow from End Shift to Next button submission
 * - Closing with sold packs section display
 * - Closing with manual entry override
 * - Edge cases and error handling
 *
 * @test-level E2E
 * @justification Tests critical user journeys end-to-end across full application
 * @story 10-7 - Shift Closing Submission & Pack Status Updates
 * @priority P0 (Critical - User Journey)
 * @enhanced-by workflow-9 on 2025-12-14
 * @updated 2025-12-15 - Aligned with implemented code and proper auth pattern
 *
 * NOTE: These tests require a running frontend and backend with authentication.
 * Tests mock API responses but require valid session cookies for authenticated routes.
 * In CI, auth is typically handled via test fixtures or storage state.
 */

import { test, expect, Page, Route, BrowserContext } from "@playwright/test";

/**
 * Create a minimal valid-looking JWT for middleware to pass
 * The middleware validates JWT structure (header.payload.signature) and expiration
 */
function createMockJwt(userId: string): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      email: "test@example.com",
      name: "Test User",
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      iat: Math.floor(Date.now() / 1000),
    }),
  ).toString("base64url");
  return `${header}.${payload}.mock_signature`;
}

test.describe("10-7-E2E: Lottery Shift Closing Flow", () => {
  const testShiftId = "test-shift-id-123";
  const testStoreId = "test-store-id-123";
  const testUserId = "test-user-id-123";

  /**
   * Helper to setup authenticated page with required API mocks
   *
   * The /mystore route requires:
   * 1. localStorage.auth_session with isClientUser: true (for ClientAuthContext)
   * 2. access_token cookie with valid JWT structure (for middleware, if needed)
   * 3. Mock /api/auth/me endpoint (ClientAuthContext validates session with backend)
   */
  async function setupAuthenticatedPage(page: Page, context: BrowserContext) {
    // Set auth cookie (access_token) for middleware validation
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

    // Set auth session in localStorage BEFORE navigation (for ClientAuthContext)
    // CRITICAL: isClientUser must be true for /mystore routes
    await page.addInitScript((userId: string) => {
      localStorage.setItem(
        "auth_session",
        JSON.stringify({
          authenticated: true,
          user: {
            id: userId,
            email: "test@example.com",
            name: "Test User",
            is_client_user: true,
            roles: ["CLIENT_USER", "STORE_MANAGER"],
          },
          isClientUser: true,
        }),
      );
    }, testUserId);

    // Mock auth/me endpoint - required by ClientAuthContext for session validation
    await page.route("**/api/auth/me*", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: testUserId,
            email: "test@example.com",
            name: "Test User",
            is_client_user: true,
            user_role: "STORE_MANAGER",
            roles: ["CLIENT_USER", "STORE_MANAGER"],
            permissions: ["CLIENT_DASHBOARD_ACCESS", "LOTTERY_SHIFT_CLOSE"],
          },
        }),
      }),
    );

    // Mock session endpoint (used by Next.js auth if needed)
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
    await page.route(`**/api/shifts/${testShiftId}*`, (route: Route) => {
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
  }

  test("TEST-10.7-E1: Complete lottery closing flow from End Shift to Next button submission", async ({
    page,
    context,
  }) => {
    await setupAuthenticatedPage(page, context);

    // CRITICAL: Intercept routes BEFORE navigation (network-first pattern)
    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            bins: [
              {
                bin_id: "bin-1",
                bin_number: 1,
                name: "Bin 1",
                is_active: true,
                pack: {
                  pack_id: "pack-1",
                  pack_number: "123456",
                  game_name: "Test Game",
                  game_price: 2.0,
                  starting_serial: "001",
                  serial_end: "100",
                },
              },
            ],
            soldPacks: [],
          },
        }),
      }),
    );

    // The frontend expects { success, data: { summary } } structure
    await page.route("**/api/shifts/*/lottery/close", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            summary: {
              packs_closed: 1,
              packs_depleted: 0,
              total_tickets_sold: 50,
              variances: [],
            },
          },
        }),
      }),
    );

    // GIVEN: User is logged in and on shift closing page
    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    // Wait for page load and check for auth redirect
    await page.waitForLoadState("networkidle");

    // Skip if redirected to login
    if (page.url().includes("/login") || page.url().includes("/auth")) {
      test.skip(true, "Test skipped: Auth not configured for E2E environment");
      return;
    }

    // Wait for page to load
    await expect(
      page.locator('[data-testid="active-packs-table"]'),
    ).toBeVisible({ timeout: 10000 });

    // WHEN: User enters ending number (3 digits) and clicks Next
    await page.fill('[data-testid="ending-number-input-bin-1"]', "050");
    await page.click('[data-testid="next-button"]');

    // THEN: Page navigates to cash closing page (indicates success)
    await expect(page).toHaveURL(
      new RegExp(
        `/mystore/terminal/shift-closing/cash\\?shiftId=${testShiftId}`,
      ),
      { timeout: 10000 },
    );
  });

  test("TEST-10.7-E2: Closing with sold packs section displays correctly", async ({
    page,
    context,
  }) => {
    await setupAuthenticatedPage(page, context);

    // CRITICAL: Intercept routes BEFORE navigation
    // Setup mock data with an empty bin (no active pack) but with sold packs
    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            bins: [
              {
                bin_id: "bin-1",
                bin_number: 1,
                name: "Bin 1",
                is_active: true,
                pack: null, // Empty bin - no active pack
              },
            ],
            soldPacks: [
              {
                bin_id: "bin-1",
                bin_number: 1,
                pack_id: "pack-1",
                pack_number: "123456",
                game_name: "Test Game",
                game_price: 2.0,
                starting_serial: "001",
                ending_serial: "100",
              },
            ],
          },
        }),
      }),
    );

    // The frontend expects { success, data: { summary } } structure
    await page.route("**/api/shifts/*/lottery/close", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            summary: {
              packs_closed: 0,
              packs_depleted: 0,
              total_tickets_sold: 0,
              variances: [],
            },
          },
        }),
      }),
    );

    // GIVEN: User is on shift closing page with sold packs
    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    // Wait for page load and check for auth redirect
    await page.waitForLoadState("networkidle");
    if (page.url().includes("/login") || page.url().includes("/auth")) {
      test.skip(true, "Test skipped: Auth not configured for E2E environment");
      return;
    }

    // Wait for page to load - the active packs table should be visible
    await expect(
      page.locator('[data-testid="active-packs-table"]'),
    ).toBeVisible({ timeout: 10000 });

    // THEN: Sold packs section displays correctly with pack information
    // Note: SoldPacksTable shows bin_number, game_name, game_price, starting_serial, ending_serial
    // It does NOT show pack_number
    const soldPacksSection = page.locator('[data-testid="sold-packs-section"]');
    await expect(soldPacksSection).toBeVisible();
    await expect(soldPacksSection).toContainText("Test Game");
    await expect(soldPacksSection).toContainText("$2"); // game_price
    await expect(soldPacksSection).toContainText("001"); // starting_serial
    await expect(soldPacksSection).toContainText("100"); // ending_serial

    // WHEN: User clicks Next (no manual entries needed since bin has no active pack)
    // Next button should be enabled since there are no active packs requiring entries
    const nextButton = page.locator('[data-testid="next-button"]');
    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    // THEN: Page navigates to cash closing page (indicates success)
    await expect(page).toHaveURL(
      new RegExp(
        `/mystore/terminal/shift-closing/cash\\?shiftId=${testShiftId}`,
      ),
      { timeout: 10000 },
    );
  });

  test("TEST-10.7-E3: Closing with manual entry override (verify entry_method tracking)", async ({
    page,
    context,
  }) => {
    await setupAuthenticatedPage(page, context);

    // Mock active shift cashiers for manual entry auth
    // Note: The endpoint returns { data: [...] } wrapper
    await page.route(
      `**/api/stores/${testStoreId}/active-shift-cashiers`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: [
              {
                id: testUserId,
                name: "Test User",
                shiftId: testShiftId,
              },
            ],
          }),
        }),
    );

    // Mock cashier permission verification
    await page.route("**/api/auth/verify-cashier-permission", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          valid: true,
          userId: testUserId,
          name: "Test User",
          hasPermission: true,
        }),
      }),
    );

    // CRITICAL: Intercept routes BEFORE navigation
    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            bins: [
              {
                bin_id: "bin-1",
                bin_number: 1,
                name: "Bin 1",
                is_active: true,
                pack: {
                  pack_id: "pack-1",
                  pack_number: "123456",
                  game_name: "Test Game",
                  game_price: 2.0,
                  starting_serial: "001",
                  serial_end: "100",
                },
              },
            ],
            soldPacks: [],
          },
        }),
      }),
    );

    let closeRequestCaptured = false;
    let capturedRequestBody: any = null;
    // The frontend expects { success, data: { summary } } structure
    await page.route("**/api/shifts/*/lottery/close", (route) => {
      capturedRequestBody = route.request().postDataJSON();
      closeRequestCaptured = true;

      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            summary: {
              packs_closed: 1,
              packs_depleted: 0,
              total_tickets_sold: 50,
              variances: [],
            },
          },
        }),
      });
    });

    // GIVEN: User is on shift closing page
    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    // Wait for page load and check for auth redirect
    await page.waitForLoadState("networkidle");
    if (page.url().includes("/login") || page.url().includes("/auth")) {
      test.skip(true, "Test skipped: Auth not configured for E2E environment");
      return;
    }

    // Wait for page to load
    await expect(
      page.locator('[data-testid="active-packs-table"]'),
    ).toBeVisible({ timeout: 10000 });

    // WHEN: User clicks Manual Entry button to open auth modal
    await page.click('[data-testid="manual-entry-button"]');

    // Wait for modal to open
    await expect(
      page.locator('[data-testid="manual-entry-auth-modal"]'),
    ).toBeVisible();

    // Fill in manual entry authorization form
    // Click on the cashier dropdown trigger to open it
    const cashierDropdown = page.locator('[data-testid="cashier-dropdown"]');
    await cashierDropdown.click();

    // Wait for dropdown content to appear and select the option using role-based selector
    // Radix UI Select uses a portal, so we use getByRole to find the option
    const selectOption = page.getByRole("option", { name: "Test User" });
    await expect(selectOption).toBeVisible({ timeout: 5000 });
    await selectOption.click();

    // Enter PIN (4 digits)
    const pinInput = page.locator('[data-testid="pin-input"]');
    await pinInput.fill("1234");

    // Click Verify button to authorize
    const verifyButton = page.locator('[data-testid="verify-button"]');
    await expect(verifyButton).toBeEnabled();
    await verifyButton.click();

    // Wait for modal to close and manual entry indicator to appear
    await expect(
      page.locator('[data-testid="manual-entry-auth-modal"]'),
    ).not.toBeVisible({ timeout: 5000 });
    await expect(
      page.locator('[data-testid="manual-entry-indicator"]'),
    ).toBeVisible({ timeout: 5000 });

    // Enter ending number manually
    await page.fill('[data-testid="ending-number-input-bin-1"]', "050");

    // Click Next to submit
    const nextButton = page.locator('[data-testid="next-button"]');
    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    // THEN: Closing data is submitted with MANUAL entry_method
    // Wait for navigation which indicates the request was made
    await expect(page).toHaveURL(
      new RegExp(
        `/mystore/terminal/shift-closing/cash\\?shiftId=${testShiftId}`,
      ),
      { timeout: 15000 },
    );

    // Verify the request was captured with correct entry_method
    expect(closeRequestCaptured).toBe(true);
    expect(capturedRequestBody).toBeDefined();
    expect(capturedRequestBody.closings).toBeDefined();
    expect(capturedRequestBody.closings.length).toBeGreaterThan(0);
    expect(capturedRequestBody.closings[0].entry_method).toBe("MANUAL");
    expect(
      capturedRequestBody.closings[0].manual_entry_authorized_by,
    ).toBeDefined();
    expect(
      capturedRequestBody.closings[0].manual_entry_authorized_at,
    ).toBeDefined();
  });

  // ============ EDGE CASES ============

  test("TEST-10.7-EDGE-E1: Should limit manual ending_serial input to 3 digits", async ({
    page,
    context,
  }) => {
    await setupAuthenticatedPage(page, context);

    // CRITICAL: Intercept routes BEFORE navigation
    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            bins: [
              {
                bin_id: "bin-1",
                bin_number: 1,
                name: "Bin 1",
                is_active: true,
                pack: {
                  pack_id: "pack-1",
                  pack_number: "123456",
                  game_name: "Test Game",
                  game_price: 2.0,
                  starting_serial: "001",
                  serial_end: "100",
                },
              },
            ],
            soldPacks: [],
          },
        }),
      }),
    );

    // GIVEN: User is on shift closing page
    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    // Wait for page load and check for auth redirect
    await page.waitForLoadState("networkidle");
    if (page.url().includes("/login") || page.url().includes("/auth")) {
      test.skip(true, "Test skipped: Auth not configured for E2E environment");
      return;
    }

    // Wait for page to load
    await expect(
      page.locator('[data-testid="active-packs-table"]'),
    ).toBeVisible({ timeout: 10000 });

    // WHEN: User types digits one at a time (simulating manual keyboard entry)
    const input = page.locator('[data-testid="ending-number-input-bin-1"]');
    await expect(input).toBeVisible();

    // Clear the input first
    await input.clear();

    // Type digits one by one using pressSequentially to simulate manual typing
    // This triggers the handleChange logic that limits non-barcode input to 3 digits
    await input.pressSequentially("1234");

    // THEN: Input should be limited to 3 digits (client-side validation)
    // The handleChange function limits manual input to 3 digits max
    await expect(input).toHaveValue("123");

    // Verify Next button is enabled (3 digits is valid)
    await expect(page.locator('[data-testid="next-button"]')).toBeEnabled();
  });

  test("TEST-10.7-EDGE-E2: Should handle network error gracefully", async ({
    page,
    context,
  }) => {
    await setupAuthenticatedPage(page, context);

    // CRITICAL: Intercept routes BEFORE navigation
    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            bins: [
              {
                bin_id: "bin-1",
                bin_number: 1,
                name: "Bin 1",
                is_active: true,
                pack: {
                  pack_id: "pack-1",
                  pack_number: "123456",
                  game_name: "Test Game",
                  game_price: 2.0,
                  starting_serial: "001",
                  serial_end: "100",
                },
              },
            ],
            soldPacks: [],
          },
        }),
      }),
    );

    // Simulate network error on the close endpoint
    await page.route("**/api/shifts/*/lottery/close", (route) =>
      route.abort("failed"),
    );

    // GIVEN: User is on shift closing page
    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    // Wait for page load and check for auth redirect
    await page.waitForLoadState("networkidle");
    if (page.url().includes("/login") || page.url().includes("/auth")) {
      test.skip(true, "Test skipped: Auth not configured for E2E environment");
      return;
    }

    // Wait for page to load
    await expect(
      page.locator('[data-testid="active-packs-table"]'),
    ).toBeVisible({ timeout: 10000 });

    // WHEN: User enters ending number and clicks Next (network error occurs)
    const endingInput = page.locator(
      '[data-testid="ending-number-input-bin-1"]',
    );
    await endingInput.fill("050");

    const nextButton = page.locator('[data-testid="next-button"]');
    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    // THEN: Should display error toast
    // The toast component displays "Submission Failed" as the title in a div
    // Use more specific selector to avoid matching multiple elements
    await expect(
      page.locator('div.text-sm.font-semibold:has-text("Submission Failed")'),
    ).toBeVisible({ timeout: 10000 });

    // User's entered data should not be lost
    await expect(endingInput).toHaveValue("050");

    // Verify we're still on the same page (navigation didn't occur)
    await expect(page).toHaveURL(
      new RegExp(
        `/mystore/terminal/shift-closing/lottery\\?shiftId=${testShiftId}`,
      ),
    );
  });

  test("TEST-10.7-EDGE-E3: Next button disabled until all active bins have 3-digit entries", async ({
    page,
    context,
  }) => {
    await setupAuthenticatedPage(page, context);

    // Setup mock data with multiple active bins
    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            bins: [
              {
                bin_id: "bin-1",
                bin_number: 1,
                name: "Bin 1",
                is_active: true,
                pack: {
                  pack_id: "pack-1",
                  pack_number: "1234567",
                  game_name: "Test Game 1",
                  game_price: 2.0,
                  starting_serial: "001",
                  serial_end: "100",
                },
              },
              {
                bin_id: "bin-2",
                bin_number: 2,
                name: "Bin 2",
                is_active: true,
                pack: {
                  pack_id: "pack-2",
                  pack_number: "7654321",
                  game_name: "Test Game 2",
                  game_price: 5.0,
                  starting_serial: "001",
                  serial_end: "050",
                },
              },
            ],
            soldPacks: [],
          },
        }),
      }),
    );

    // GIVEN: User is on shift closing page with multiple active bins
    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    // Wait for page load and check for auth redirect
    await page.waitForLoadState("networkidle");
    if (page.url().includes("/login") || page.url().includes("/auth")) {
      test.skip(true, "Test skipped: Auth not configured for E2E environment");
      return;
    }

    // Wait for page to load
    await expect(
      page.locator('[data-testid="active-packs-table"]'),
    ).toBeVisible({ timeout: 10000 });

    const nextButton = page.locator('[data-testid="next-button"]');
    const input1 = page.locator('[data-testid="ending-number-input-bin-1"]');
    const input2 = page.locator('[data-testid="ending-number-input-bin-2"]');

    // THEN: Next button should be disabled initially (no entries)
    await expect(nextButton).toBeDisabled();

    // WHEN: User enters ending number for first bin only
    await input1.fill("050");

    // THEN: Next button should still be disabled (not all bins have entries)
    await expect(nextButton).toBeDisabled();

    // WHEN: User enters ending number for second bin
    await input2.fill("025");

    // THEN: Next button should now be enabled (all active bins have 3-digit entries)
    await expect(nextButton).toBeEnabled();

    // WHEN: User clears one input
    await input1.clear();

    // THEN: Next button should be disabled again
    await expect(nextButton).toBeDisabled();
  });

  test("TEST-10.7-EDGE-E4: Empty bins should be displayed but not require input", async ({
    page,
    context,
  }) => {
    await setupAuthenticatedPage(page, context);

    // Setup mock data with one active bin and one empty bin
    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            bins: [
              {
                bin_id: "bin-1",
                bin_number: 1,
                name: "Bin 1",
                is_active: true,
                pack: {
                  pack_id: "pack-1",
                  pack_number: "1234567",
                  game_name: "Test Game",
                  game_price: 2.0,
                  starting_serial: "001",
                  serial_end: "100",
                },
              },
              {
                bin_id: "bin-2",
                bin_number: 2,
                name: "Bin 2",
                is_active: true,
                pack: null, // Empty bin
              },
            ],
            soldPacks: [],
          },
        }),
      }),
    );

    // The frontend expects { success, data: { summary } } structure
    await page.route("**/api/shifts/*/lottery/close", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            summary: {
              packs_closed: 1,
              packs_depleted: 0,
              total_tickets_sold: 50,
              variances: [],
            },
          },
        }),
      }),
    );

    // GIVEN: User is on shift closing page
    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    // Wait for page load and check for auth redirect
    await page.waitForLoadState("networkidle");
    if (page.url().includes("/login") || page.url().includes("/auth")) {
      test.skip(true, "Test skipped: Auth not configured for E2E environment");
      return;
    }

    // Wait for page to load
    await expect(
      page.locator('[data-testid="active-packs-table"]'),
    ).toBeVisible({ timeout: 10000 });

    // THEN: Both bins should be displayed
    const row1 = page.locator('[data-testid="active-packs-row-bin-1"]');
    const row2 = page.locator('[data-testid="active-packs-row-bin-2"]');
    await expect(row1).toBeVisible();
    await expect(row2).toBeVisible();

    // Empty bin row should have greyed out styling (opacity-50)
    await expect(row2).toHaveClass(/opacity-50/);

    // Input should exist for bin-1 but not for bin-2 (empty bin shows "--")
    await expect(
      page.locator('[data-testid="ending-number-input-bin-1"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="ending-number-input-bin-2"]'),
    ).not.toBeVisible();

    // WHEN: User enters ending number for the active bin only
    await page.locator('[data-testid="ending-number-input-bin-1"]').fill("050");

    // THEN: Next button should be enabled (empty bins don't block submission)
    await expect(page.locator('[data-testid="next-button"]')).toBeEnabled();

    // Click Next and verify navigation
    await page.locator('[data-testid="next-button"]').click();
    await expect(page).toHaveURL(
      new RegExp(
        `/mystore/terminal/shift-closing/cash\\?shiftId=${testShiftId}`,
      ),
      { timeout: 15000 },
    );
  });

  test("TEST-10.7-EDGE-E5: Action buttons should be visible and functional", async ({
    page,
    context,
  }) => {
    await setupAuthenticatedPage(page, context);

    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            bins: [
              {
                bin_id: "bin-1",
                bin_number: 1,
                name: "Bin 1",
                is_active: true,
                pack: {
                  pack_id: "pack-1",
                  pack_number: "1234567",
                  game_name: "Test Game",
                  game_price: 2.0,
                  starting_serial: "001",
                  serial_end: "100",
                },
              },
            ],
            soldPacks: [],
          },
        }),
      }),
    );

    // GIVEN: User is on shift closing page
    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    // Wait for page load and check for auth redirect
    await page.waitForLoadState("networkidle");
    if (page.url().includes("/login") || page.url().includes("/auth")) {
      test.skip(true, "Test skipped: Auth not configured for E2E environment");
      return;
    }

    // Wait for page to load
    await expect(
      page.locator('[data-testid="active-packs-table"]'),
    ).toBeVisible({ timeout: 10000 });

    // THEN: All action buttons should be visible
    const actionsContainer = page.locator(
      '[data-testid="shift-closing-actions"]',
    );
    await expect(actionsContainer).toBeVisible();

    await expect(page.locator('[data-testid="add-bin-button"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="activate-pack-button"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="manual-entry-button"]'),
    ).toBeVisible();
    await expect(page.locator('[data-testid="next-button"]')).toBeVisible();

    // Next button should be disabled initially (no entries)
    await expect(page.locator('[data-testid="next-button"]')).toBeDisabled();
  });
});
