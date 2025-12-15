/**
 * Shift Closing Lottery E2E Tests
 *
 * Tests for the complete lottery closing user flow:
 * - Complete lottery closing flow from End Shift to Next button submission
 * - Closing with pack activation during flow
 * - Closing with manual entry override
 * - Edge cases and error handling
 *
 * @test-level E2E
 * @justification Tests critical user journeys end-to-end across full application
 * @story 10-7 - Shift Closing Submission & Pack Status Updates
 * @priority P0 (Critical - User Journey)
 * @enhanced-by workflow-9 on 2025-12-14
 */

import { test, expect, Page, Route } from "@playwright/test";

test.describe("10-7-E2E: Lottery Shift Closing Flow", () => {
  const testShiftId = "test-shift-id-123";
  const testStoreId = "test-store-id-123";
  const testUserId = "test-user-id-123";

  // Helper to setup authenticated page with required API mocks
  async function setupAuthenticatedPage(page: Page) {
    // Mock auth check
    await page.route("**/api/auth/me*", (route: Route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          user: {
            id: testUserId,
            email: "test@example.com",
            name: "Test User",
          },
        }),
      }),
    );

    // Mock shift detail endpoint (required for storeId)
    await page.route(`**/api/shifts/${testShiftId}*`, (route: Route) =>
      route.fulfill({
        status: 200,
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

    // Set auth session in localStorage
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
  }

  test("TEST-10.7-E1: Complete lottery closing flow from End Shift to Next button submission", async ({
    page,
  }) => {
    await setupAuthenticatedPage(page);

    // CRITICAL: Intercept routes BEFORE navigation (network-first pattern)
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

    await page.route("**/api/shifts/*/lottery/close", (route) =>
      route.fulfill({
        status: 200,
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

    // Wait for page to load
    await expect(
      page.locator('[data-testid="active-packs-table"]'),
    ).toBeVisible();

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

  test("TEST-10.7-E2: Closing with pack activation during flow (verify sold packs section)", async ({
    page,
  }) => {
    await setupAuthenticatedPage(page);

    // CRITICAL: Intercept routes BEFORE navigation
    await page.route("**/api/shifts/*/lottery/closing-data", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          data: {
            bins: [],
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

    await page.route("**/api/shifts/*/lottery/close", (route) =>
      route.fulfill({
        status: 200,
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

    // Wait for page to load
    await expect(
      page.locator('[data-testid="sold-packs-section"]'),
    ).toBeVisible();

    // THEN: Sold packs section displays correctly with pack information
    const soldPacksSection = page.locator('[data-testid="sold-packs-section"]');
    await expect(soldPacksSection).toBeVisible();
    await expect(soldPacksSection).toContainText("Test Game");
    await expect(soldPacksSection).toContainText("123456");

    // WHEN: User clicks Next (no manual entries needed since no active bins)
    await page.click('[data-testid="next-button"]');

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
  }) => {
    await setupAuthenticatedPage(page);

    // Mock active shift cashiers for manual entry auth
    await page.route(
      `**/api/stores/${testStoreId}/active-shift-cashiers`,
      (route) =>
        route.fulfill({
          status: 200,
          body: JSON.stringify([
            {
              id: testUserId,
              name: "Test User",
              shiftId: testShiftId,
            },
          ]),
        }),
    );

    // Mock cashier permission verification
    await page.route("**/api/auth/verify-cashier-permission", (route) =>
      route.fulfill({
        status: 200,
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
    await page.route("**/api/shifts/*/lottery/close", (route) => {
      const requestBody = route.request().postDataJSON();
      // Verify entry_method is MANUAL
      expect(requestBody.closings[0].entry_method).toBe("MANUAL");
      expect(requestBody.closings[0].manual_entry_authorized_by).toBeDefined();
      expect(requestBody.closings[0].manual_entry_authorized_at).toBeDefined();
      closeRequestCaptured = true;

      route.fulfill({
        status: 200,
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

    // Wait for page to load
    await expect(
      page.locator('[data-testid="active-packs-table"]'),
    ).toBeVisible();

    // WHEN: User clicks Manual Entry button to open auth modal
    await page.click('[data-testid="manual-entry-button"]');

    // Wait for modal to open
    await expect(
      page.locator('[data-testid="manual-entry-auth-modal"]'),
    ).toBeVisible();

    // Fill in manual entry authorization form
    await page.click('[data-testid="cashier-dropdown"]');
    // Select first cashier option (wait for dropdown to open)
    await page.waitForTimeout(200);
    await page.keyboard.press("Enter"); // Select first option

    // Enter PIN
    await page.fill('[data-testid="pin-input"]', "1234");

    // Click Verify button to authorize
    await page.click('[data-testid="verify-button"]');

    // Wait for modal to close and manual entry indicator to appear
    await expect(
      page.locator('[data-testid="manual-entry-indicator"]'),
    ).toBeVisible();

    // Enter ending number manually
    await page.fill('[data-testid="ending-number-input-bin-1"]', "050");

    // Click Next to submit
    await page.click('[data-testid="next-button"]');

    // THEN: Closing data is submitted with MANUAL entry_method
    // Verify the request was captured with correct entry_method
    expect(closeRequestCaptured).toBe(true);

    // Verify navigation to next page (indicates success)
    await expect(page).toHaveURL(
      new RegExp(
        `/mystore/terminal/shift-closing/cash\\?shiftId=${testShiftId}`,
      ),
      { timeout: 10000 },
    );
  });

  // ============ EDGE CASES ============

  test("TEST-10.7-EDGE-E1: Should limit ending_serial to 3 digits", async ({
    page,
  }) => {
    await setupAuthenticatedPage(page);

    // CRITICAL: Intercept routes BEFORE navigation
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

    // Wait for page to load
    await expect(
      page.locator('[data-testid="active-packs-table"]'),
    ).toBeVisible();

    // WHEN: User attempts to enter ending number longer than 3 digits
    const input = page.locator('[data-testid="ending-number-input-bin-1"]');
    await input.fill("1234");

    // THEN: Input should be limited to 3 digits (client-side validation)
    // The input component only accepts 3 digits max, so "1234" becomes "123"
    await expect(input).toHaveValue("123");

    // Verify Next button is enabled (3 digits is valid)
    await expect(page.locator('[data-testid="next-button"]')).toBeEnabled();
  });

  test("TEST-10.7-EDGE-E2: Should handle network error gracefully", async ({
    page,
  }) => {
    await setupAuthenticatedPage(page);

    // CRITICAL: Intercept routes BEFORE navigation
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

    // Simulate network error
    await page.route("**/api/shifts/*/lottery/close", (route) =>
      route.abort("failed"),
    );

    // GIVEN: User is on shift closing page
    await page.goto(
      `/mystore/terminal/shift-closing/lottery?shiftId=${testShiftId}`,
    );

    // Wait for page to load
    await expect(
      page.locator('[data-testid="active-packs-table"]'),
    ).toBeVisible();

    // WHEN: User enters ending number and clicks Next (network error occurs)
    await page.fill('[data-testid="ending-number-input-bin-1"]', "050");
    await page.click('[data-testid="next-button"]');

    // THEN: Should display error toast and preserve user data
    // Error is shown via toast notification, check for error text in toast
    // Toast appears briefly, so we check for the error message text
    await expect(
      page.locator("text=/Submission Failed|Failed to submit/i"),
    ).toBeVisible({ timeout: 5000 });

    // User's entered data should not be lost
    await expect(
      page.locator('[data-testid="ending-number-input-bin-1"]'),
    ).toHaveValue("050");

    // Verify we're still on the same page (navigation didn't occur)
    await expect(page).toHaveURL(
      new RegExp(
        `/mystore/terminal/shift-closing/lottery\\?shiftId=${testShiftId}`,
      ),
    );
  });
});
