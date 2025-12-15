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
 */

import { test, expect } from "@playwright/test";

test.describe("10-6-E2E: Activate Pack Flow (Critical Journey)", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // HAPPY PATH TESTS (P0)
  // ═══════════════════════════════════════════════════════════════════════════
  test("10-6-E2E-001: [P0] user can activate pack during shift end-to-end", async ({
    page,
  }) => {
    // CRITICAL: Intercept routes BEFORE navigation (network-first)
    await page.route("**/api/auth/verify-cashier-permission", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          valid: true,
          userId: "cashier-123",
          name: "Cashier 1",
          hasPermission: true,
        }),
      }),
    );

    await page.route(
      "**/api/lottery/packs/validate-for-activation/*/*",
      (route) =>
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            valid: true,
            game: {
              name: "$5 Powerball",
              price: 5,
            },
            pack: {
              pack_id: "pack-123",
              serial_start: "001",
              serial_end: "100",
            },
          }),
        }),
    );

    await page.route("**/api/stores/*/lottery/packs/activate", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          data: {
            updatedBin: {
              bin_id: "bin-1",
              bin_number: 1,
              pack: {
                pack_id: "pack-123",
                game_name: "$5 Powerball",
                game_price: 5,
              },
            },
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
                pack: null, // Empty bin
              },
            ],
            soldPacks: [],
          },
        }),
      }),
    );

    // GIVEN: User is logged in and on Lottery Shift Closing page
    await page.goto("/mystore/terminal/shift-closing/lottery");
    // Note: Authentication and shift setup will be handled by fixtures in actual implementation

    // WHEN: User clicks "Activate Pack" button
    await page.click('[data-testid="activate-pack-button"]');

    // THEN: Modal opens showing Step 1 (Cashier Authentication)
    await expect(page.locator('[data-testid="step-1-auth"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="cashier-dropdown"]'),
    ).toBeVisible();
    await expect(page.locator('[data-testid="pin-input"]')).toBeVisible();

    // WHEN: User selects cashier and enters PIN
    await page.click('[data-testid="cashier-dropdown"]');
    await page.click('[data-testid="cashier-option-1"]');
    await page.fill('[data-testid="pin-input"]', "1234");
    await page.click('[data-testid="verify-button"]');

    // THEN: Step 2 (Scan Pack) is displayed
    await expect(page.locator('[data-testid="step-2-scan"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="verified-cashier-name"]'),
    ).toHaveText("Cashier 1");

    // WHEN: User scans 24-digit pack barcode
    await page.fill('[data-testid="serial-input"]', "000112345670123456789012");

    // THEN: Pack info is displayed
    await expect(page.locator('[data-testid="pack-info"]')).toBeVisible();
    await expect(page.locator('[data-testid="pack-info"]')).toContainText(
      "$5 Powerball",
    );

    // WHEN: User selects bin and clicks Activate
    await page.click('[data-testid="bin-dropdown"]');
    await page.click('[data-testid="bin-option-1"]');
    await page.click('[data-testid="activate-button"]');

    // THEN: Pack is activated and modal closes
    await expect(page.locator('[data-testid="step-2-scan"]')).not.toBeVisible();

    // AND: Success toast is displayed
    await expect(page.locator('[data-testid="success-toast"]')).toBeVisible();
    await expect(page.locator('[data-testid="success-toast"]')).toContainText(
      "Pack activated",
    );

    // AND: Bin in Active Packs table updates to show new pack
    await expect(
      page.locator('[data-testid="active-packs-table"]'),
    ).toContainText("$5 Powerball");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ERROR HANDLING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("10-6-E2E-002: [P1] should handle invalid PIN gracefully", async ({
    page,
  }) => {
    // CRITICAL: Intercept routes BEFORE navigation (network-first)
    await page.route("**/api/auth/verify-cashier-permission", (route) =>
      route.fulfill({
        status: 401,
        body: JSON.stringify({
          valid: false,
          error: "Invalid PIN",
        }),
      }),
    );

    // GIVEN: User is logged in and on Lottery Shift Closing page
    await page.goto("/mystore/terminal/shift-closing/lottery");

    // WHEN: User clicks "Activate Pack" button
    await page.click('[data-testid="activate-pack-button"]');

    // AND: User enters invalid PIN
    await page.click('[data-testid="cashier-dropdown"]');
    await page.click('[data-testid="cashier-option-1"]');
    await page.fill('[data-testid="pin-input"]', "9999"); // Invalid PIN
    await page.click('[data-testid="verify-button"]');

    // THEN: Error message is displayed and stays on Step 1
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).toContainText(
      "Invalid PIN",
    );
    await expect(page.locator('[data-testid="step-1-auth"]')).toBeVisible();
    await expect(page.locator('[data-testid="step-2-scan"]')).not.toBeVisible();
  });

  test("10-6-E2E-003: [P1] should handle invalid pack serial gracefully", async ({
    page,
  }) => {
    // CRITICAL: Intercept routes BEFORE navigation (network-first)
    await page.route("**/api/auth/verify-cashier-permission", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          valid: true,
          userId: "cashier-123",
          name: "Cashier 1",
          hasPermission: true,
        }),
      }),
    );

    await page.route(
      "**/api/lottery/packs/validate-for-activation/*/*",
      (route) =>
        route.fulfill({
          status: 400,
          body: JSON.stringify({
            valid: false,
            error: "Pack not found or not available",
          }),
        }),
    );

    // GIVEN: User is logged in and on Lottery Shift Closing page
    await page.goto("/mystore/terminal/shift-closing/lottery");

    // WHEN: User completes Step 1 and enters invalid serial
    await page.click('[data-testid="activate-pack-button"]');
    await page.click('[data-testid="cashier-dropdown"]');
    await page.click('[data-testid="cashier-option-1"]');
    await page.fill('[data-testid="pin-input"]', "1234");
    await page.click('[data-testid="verify-button"]');

    // THEN: Step 2 is displayed
    await expect(page.locator('[data-testid="step-2-scan"]')).toBeVisible();

    // WHEN: User enters invalid serial
    await page.fill('[data-testid="serial-input"]', "999912345670123456789012");
    await page.blur('[data-testid="serial-input"]'); // Trigger validation

    // THEN: Error message is displayed
    await expect(page.locator('[data-testid="scan-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="scan-error"]')).toContainText(
      "not available",
    );
  });
});
