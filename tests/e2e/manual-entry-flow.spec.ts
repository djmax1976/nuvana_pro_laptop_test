/**
 * Manual Entry Flow E2E Test
 *
 * Critical user journey: Manual entry authorization → Manual entry mode → Enter numbers manually → Close shift
 *
 * @test-level E2E
 * @justification Tests critical multi-page user journey that cannot be tested at lower levels
 * @story 10-4 - Manual Entry Override
 * @priority P0 (Critical - Core User Journey)
 */

import { test, expect } from "@playwright/test";

test.describe("10-4-E2E: Manual Entry Flow (Critical Journey)", () => {
  test("10-4-E2E-001: Shift Manager can complete shift closing with manual entry", async ({
    page,
  }) => {
    const shiftId = "shift-123";
    const storeId = "store-123";

    // CRITICAL: Intercept routes BEFORE navigation (network-first)
    // Mock shift detail API (required for store_id)
    await page.route(`**/api/shifts/${shiftId}`, (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          data: {
            shift_id: shiftId,
            store_id: storeId,
            status: "ACTIVE",
          },
        }),
      }),
    );

    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill({
        status: 200,
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
                  game_name: "$5 Powerball",
                  game_price: 5,
                  starting_serial: "045",
                  serial_end: "150",
                  pack_number: "123456",
                },
              },
            ],
            soldPacks: [],
          },
        }),
      }),
    );

    await page.route(
      `**/api/stores/${storeId}/active-shift-cashiers`,
      (route) =>
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            success: true,
            data: [
              {
                id: "user-shift-manager",
                name: "Shift Manager",
                shiftId: shiftId,
              },
            ],
          }),
        }),
    );

    await page.route("**/api/auth/verify-cashier-permission", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          valid: true,
          userId: "user-shift-manager",
          name: "Shift Manager",
          hasPermission: true,
        }),
      }),
    );

    // Capture the close request to verify entry_method
    let closeRequest: any = null;
    await page.route("**/api/shifts/*/lottery/close", async (route) => {
      const request = route.request();
      closeRequest = await request.postDataJSON();
      await route.fulfill({
        status: 200,
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
      `/mystore/terminal/shift-closing/lottery?shiftId=${shiftId}`,
    );

    // Wait for page to load and verify title
    await expect(page.locator("h1")).toHaveText("Lottery Shift Closing", {
      timeout: 10000,
    });

    // WHEN: User clicks "Manual Entry" button
    await page.click('[data-testid="manual-entry-button"]');

    // THEN: Auth modal opens
    await expect(
      page.locator('[data-testid="manual-entry-auth-modal"]'),
    ).toBeVisible();

    // WHEN: User selects cashier and enters PIN
    await page.click('[data-testid="cashier-dropdown"]');
    // Wait for dropdown to open and select cashier
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    await page.click('text="Shift Manager"');
    await page.fill('[data-testid="pin-input"]', "1234");
    await page.click('[data-testid="verify-button"]');

    // THEN: Modal closes and manual entry mode activates
    await expect(
      page.locator('[data-testid="manual-entry-auth-modal"]'),
    ).not.toBeVisible({ timeout: 5000 });

    await expect(
      page.locator('[data-testid="manual-entry-indicator"]'),
    ).toBeVisible();

    // Verify indicator shows "Manual Entry Mode Active" title
    await expect(
      page.locator('[data-testid="manual-entry-indicator"]'),
    ).toContainText("Manual Entry Mode Active");

    // WHEN: User types ending number directly (manual entry)
    await page.fill('[data-testid="ending-number-input-bin-1"]', "100");

    // THEN: Input accepts the value (no pack validation error)
    await expect(
      page.locator('[data-testid="ending-number-input-bin-1"]'),
    ).toHaveValue("100");

    // Verify no error message is displayed (using correct test ID format)
    await expect(
      page.locator('[data-testid="error-message-bin-1"]'),
    ).not.toBeVisible();

    // WHEN: User clicks Next button
    await page.click('[data-testid="next-button"]');

    // THEN: Shift closing is saved with entry_method = 'MANUAL'
    // Wait for navigation or API call to complete
    await page.waitForTimeout(1000);

    // Verify the API was called with correct entry_method
    expect(closeRequest).not.toBeNull();
    expect(closeRequest.closings).toBeDefined();
    expect(closeRequest.closings.length).toBeGreaterThan(0);
    expect(closeRequest.closings[0].entry_method).toBe("MANUAL");
    expect(closeRequest.closings[0].manual_entry_authorized_by).toBe(
      "user-shift-manager",
    );
    expect(closeRequest.closings[0].manual_entry_authorized_at).toBeDefined();
  });

  // ============================================================================
  // 🔄 EDGE CASES (Standard Boundaries - Applied Automatically)
  // ============================================================================

  test("10-4-E2E-EDGE-001: should handle invalid PIN in manual entry flow", async ({
    page,
  }) => {
    const shiftId = "shift-123";
    const storeId = "store-123";

    // GIVEN: User is on Lottery Shift Closing page
    // Mock shift detail API (required for store_id)
    await page.route(`**/api/shifts/${shiftId}`, (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          data: {
            shift_id: shiftId,
            store_id: storeId,
            status: "ACTIVE",
          },
        }),
      }),
    );

    // Intercept API routes
    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill({
        status: 200,
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
                  game_name: "$5 Powerball",
                  game_price: 5,
                  starting_serial: "045",
                  serial_end: "150",
                  pack_number: "123456",
                },
              },
            ],
            soldPacks: [],
          },
        }),
      }),
    );

    await page.route(
      `**/api/stores/${storeId}/active-shift-cashiers`,
      (route) =>
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            success: true,
            data: [
              {
                id: "user-shift-manager",
                name: "Shift Manager",
                shiftId: shiftId,
              },
            ],
          }),
        }),
    );

    // Mock API to return invalid PIN error (set up before clicking verify)
    await page.route("**/api/auth/verify-cashier-permission", (route) =>
      route.fulfill({
        status: 401,
        body: JSON.stringify({
          valid: false,
          error: "Invalid PIN",
        }),
      }),
    );

    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${shiftId}`,
    );

    // Wait for page to load
    await expect(page.locator("h1")).toHaveText("Lottery Shift Closing", {
      timeout: 10000,
    });

    // WHEN: User attempts manual entry with invalid PIN
    await page.click('[data-testid="manual-entry-button"]');
    await expect(
      page.locator('[data-testid="manual-entry-auth-modal"]'),
    ).toBeVisible();

    await page.click('[data-testid="cashier-dropdown"]');
    // Wait for dropdown to open
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    await page.click('text="Shift Manager"');
    await page.fill('[data-testid="pin-input"]', "9999"); // Invalid PIN
    await page.click('[data-testid="verify-button"]');

    // THEN: Error message is displayed and modal stays open
    // Use first error message (there may be multiple with same test ID)
    await expect(
      page.locator('[data-testid="error-message"]').first(),
    ).toBeVisible({ timeout: 5000 });

    await expect(
      page.locator('[data-testid="error-message"]').first(),
    ).toContainText(/invalid.*pin/i);

    await expect(
      page.locator('[data-testid="manual-entry-auth-modal"]'),
    ).toBeVisible();

    await expect(
      page.locator('[data-testid="manual-entry-indicator"]'),
    ).not.toBeVisible();
  });

  test("10-4-E2E-EDGE-002: should handle unauthorized user in manual entry flow", async ({
    page,
  }) => {
    const shiftId = "shift-123";
    const storeId = "store-123";

    // GIVEN: User is on Lottery Shift Closing page
    // Mock shift detail API (required for store_id)
    await page.route(`**/api/shifts/${shiftId}`, (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          data: {
            shift_id: shiftId,
            store_id: storeId,
            status: "ACTIVE",
          },
        }),
      }),
    );

    // Intercept API routes
    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill({
        status: 200,
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
                  game_name: "$5 Powerball",
                  game_price: 5,
                  starting_serial: "045",
                  serial_end: "150",
                  pack_number: "123456",
                },
              },
            ],
            soldPacks: [],
          },
        }),
      }),
    );

    await page.route(
      `**/api/stores/${storeId}/active-shift-cashiers`,
      (route) =>
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            success: true,
            data: [
              {
                id: "user-cashier",
                name: "Regular Cashier",
                shiftId: shiftId,
              },
            ],
          }),
        }),
    );

    // Mock API to return no permission (set up before clicking verify)
    await page.route("**/api/auth/verify-cashier-permission", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          valid: true,
          userId: "user-cashier",
          name: "Regular Cashier",
          hasPermission: false, // No permission
        }),
      }),
    );

    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${shiftId}`,
    );

    // Wait for page to load
    await expect(page.locator("h1")).toHaveText("Lottery Shift Closing", {
      timeout: 10000,
    });

    // WHEN: User attempts manual entry without permission
    await page.click('[data-testid="manual-entry-button"]');
    await expect(
      page.locator('[data-testid="manual-entry-auth-modal"]'),
    ).toBeVisible();

    await page.click('[data-testid="cashier-dropdown"]');
    // Wait for dropdown to open
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    await page.click('text="Regular Cashier"');
    await page.fill('[data-testid="pin-input"]', "1234");
    await page.click('[data-testid="verify-button"]');

    // THEN: Authorization error is displayed and modal stays open
    // Use first error message (there may be multiple with same test ID)
    await expect(
      page.locator('[data-testid="error-message"]').first(),
    ).toBeVisible({ timeout: 5000 });

    await expect(
      page.locator('[data-testid="error-message"]').first(),
    ).toContainText(/not authorized.*manual entry/i);

    await expect(
      page.locator('[data-testid="manual-entry-auth-modal"]'),
    ).toBeVisible();

    await expect(
      page.locator('[data-testid="manual-entry-indicator"]'),
    ).not.toBeVisible();
  });

  // ============================================================================
  // ✅ ENHANCED ASSERTIONS (Best Practices - Applied Automatically)
  // ============================================================================

  test("10-4-E2E-ASSERT-001: should verify API response structure in manual entry flow", async ({
    page,
  }) => {
    const shiftId = "shift-123";
    const storeId = "store-123";

    // GIVEN: User is on Lottery Shift Closing page
    // Mock shift detail API (required for store_id)
    await page.route(`**/api/shifts/${shiftId}`, (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          data: {
            shift_id: shiftId,
            store_id: storeId,
            status: "ACTIVE",
          },
        }),
      }),
    );

    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill({
        status: 200,
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
                  game_name: "$5 Powerball",
                  game_price: 5,
                  starting_serial: "045",
                  serial_end: "150",
                  pack_number: "123456",
                },
              },
            ],
            soldPacks: [],
          },
        }),
      }),
    );

    await page.route(
      `**/api/stores/${storeId}/active-shift-cashiers`,
      (route) =>
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            success: true,
            data: [
              {
                id: "user-shift-manager",
                name: "Shift Manager",
                shiftId: shiftId,
              },
            ],
          }),
        }),
    );

    // Intercept and verify API request/response structure
    let verifyRequest: any = null;
    await page.route("**/api/auth/verify-cashier-permission", async (route) => {
      const request = route.request();
      verifyRequest = await request.postDataJSON();
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          valid: true,
          userId: "user-shift-manager",
          name: "Shift Manager",
          hasPermission: true,
        }),
      });
    });

    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${shiftId}`,
    );

    // Wait for page to load
    await expect(page.locator("h1")).toHaveText("Lottery Shift Closing", {
      timeout: 10000,
    });

    await page.click('[data-testid="manual-entry-button"]');
    await expect(
      page.locator('[data-testid="manual-entry-auth-modal"]'),
    ).toBeVisible();

    await page.click('[data-testid="cashier-dropdown"]');
    // Wait for dropdown to open
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    await page.click('text="Shift Manager"');
    await page.fill('[data-testid="pin-input"]', "1234");
    await page.click('[data-testid="verify-button"]');

    // THEN: API request has correct structure
    await page.waitForTimeout(1000); // Wait for API call to complete

    expect(verifyRequest).not.toBeNull();
    expect(verifyRequest.cashierId).toBe("user-shift-manager");
    expect(verifyRequest.pin).toBe("1234");
    expect(verifyRequest.permission).toBe("LOTTERY_MANUAL_ENTRY");
    expect(verifyRequest.storeId).toBe(storeId);

    // Verify modal closed and indicator appeared
    await expect(
      page.locator('[data-testid="manual-entry-auth-modal"]'),
    ).not.toBeVisible();

    await expect(
      page.locator('[data-testid="manual-entry-indicator"]'),
    ).toBeVisible();
  });
});
