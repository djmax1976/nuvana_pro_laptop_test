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
    // Test data constants
    const cashierId = "cashier-uuid-123";
    const binId = "bin-uuid-1";
    const packId = "pack-uuid-123";
    const userId = "user-uuid-123";

    // CRITICAL: Intercept routes BEFORE navigation (network-first)
    // Mock active shift cashiers endpoint (called when modal opens)
    await page.route("**/api/stores/*/active-shift-cashiers", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: cashierId, // API returns 'id' (matches component interface)
              name: "Cashier 1",
              shiftId: "shift-uuid-123",
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
          userId: userId,
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
            success: true,
            data: {
              valid: true,
              game: {
                name: "$5 Powerball",
                price: 5,
              },
              pack: {
                pack_id: packId,
                serial_start: "001",
                serial_end: "100",
              },
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
              bin_id: binId,
              bin_number: 1,
              name: "Bin 1",
              is_active: true,
              pack: {
                pack_id: packId,
                pack_number: "1234567",
                game_name: "$5 Powerball",
                game_price: 5,
                starting_serial: "001",
                serial_end: "100",
              },
            },
            previousPack: null,
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
                bin_id: binId,
                bin_number: 1,
                name: "Bin 1",
                is_active: true,
                pack: null, // Empty bin initially
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
    // Use actual cashier ID from mocked response
    await page.click(`[data-testid="cashier-option-${cashierId}"]`);
    await page.fill('[data-testid="pin-input"]', "1234");
    await page.click('[data-testid="verify-button"]');

    // THEN: Step 2 (Scan Pack) is displayed
    await expect(page.locator('[data-testid="step-2-scan"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="verified-cashier-name"]'),
    ).toContainText("Cashier 1");

    // WHEN: User scans 24-digit pack barcode
    await page.fill('[data-testid="serial-input"]', "000112345670123456789012");
    // Trigger validation by blurring the input
    await page.locator('[data-testid="serial-input"]').blur();

    // THEN: Pack info is displayed (wait for validation to complete)
    await expect(page.locator('[data-testid="pack-info"]')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator('[data-testid="pack-info"]')).toContainText(
      "$5 Powerball",
    );

    // WHEN: User selects bin and clicks Activate
    await page.click('[data-testid="bin-dropdown"]');
    // Use actual bin ID from mocked response
    await page.click(`[data-testid="bin-option-${binId}"]`);
    await page.click('[data-testid="activate-button"]');

    // THEN: Pack is activated and modal closes
    await expect(page.locator('[data-testid="step-2-scan"]')).not.toBeVisible();

    // AND: Success toast is displayed (toasts don't have test IDs, check by text content)
    await expect(page.locator("text=/Pack.*activated.*Bin.*1/i")).toBeVisible({
      timeout: 3000,
    });

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
    // Test data constants
    const cashierId = "cashier-uuid-123";

    // CRITICAL: Intercept routes BEFORE navigation (network-first)
    // Mock active shift cashiers endpoint (called when modal opens)
    await page.route("**/api/stores/*/active-shift-cashiers", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: cashierId,
              name: "Cashier 1",
              shiftId: "shift-uuid-123",
            },
          ],
        }),
      }),
    );

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
    // Use actual cashier ID from mocked response
    await page.click(`[data-testid="cashier-option-${cashierId}"]`);
    await page.fill('[data-testid="pin-input"]', "9999"); // Invalid PIN
    await page.click('[data-testid="verify-button"]');

    // THEN: Error message is displayed and stays on Step 1
    // Error can appear in either pin field error or root error
    await expect(
      page
        .locator('[data-testid="error-message"]')
        .or(page.locator("text=/Invalid PIN/i")),
    ).toBeVisible({ timeout: 3000 });
    await expect(page.locator('[data-testid="step-1-auth"]')).toBeVisible();
    await expect(page.locator('[data-testid="step-2-scan"]')).not.toBeVisible();
  });

  test("10-6-E2E-003: [P1] should handle invalid pack serial gracefully", async ({
    page,
  }) => {
    // Test data constants
    const cashierId = "cashier-uuid-123";
    const userId = "user-uuid-123";

    // CRITICAL: Intercept routes BEFORE navigation (network-first)
    // Mock active shift cashiers endpoint (called when modal opens)
    await page.route("**/api/stores/*/active-shift-cashiers", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: cashierId,
              name: "Cashier 1",
              shiftId: "shift-uuid-123",
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
          userId: userId,
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
            success: true,
            data: {
              valid: false,
              error: "Pack not found in inventory. Receive it first.",
            },
          }),
        }),
    );

    // GIVEN: User is logged in and on Lottery Shift Closing page
    await page.goto("/mystore/terminal/shift-closing/lottery");

    // WHEN: User completes Step 1 and enters invalid serial
    await page.click('[data-testid="activate-pack-button"]');
    await page.click('[data-testid="cashier-dropdown"]');
    // Use actual cashier ID from mocked response
    await page.click(`[data-testid="cashier-option-${cashierId}"]`);
    await page.fill('[data-testid="pin-input"]', "1234");
    await page.click('[data-testid="verify-button"]');

    // THEN: Step 2 is displayed
    await expect(page.locator('[data-testid="step-2-scan"]')).toBeVisible();

    // WHEN: User enters invalid serial
    await page.fill('[data-testid="serial-input"]', "999912345670123456789012");
    await page.locator('[data-testid="serial-input"]').blur(); // Trigger validation

    // THEN: Error message is displayed (wait for validation to complete)
    await expect(page.locator('[data-testid="scan-error"]')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator('[data-testid="scan-error"]')).toContainText(
      /not found|not available|Receive it first/i,
    );
  });
});
