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

import { test, expect } from "@playwright/test";

test.describe("10-7-E2E: Lottery Shift Closing Flow", () => {
  test("TEST-10.7-E1: Complete lottery closing flow from End Shift to Next button submission", async ({
    page,
  }) => {
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
                name: "Bin 1",
                pack: {
                  pack_id: "pack-1",
                  pack_number: "123456",
                  game_name: "Test Game",
                  opening_serial: "000001",
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
          summary: {
            packs_closed: 1,
            packs_depleted: 0,
            total_tickets_sold: 50,
            variances: [],
          },
        }),
      }),
    );

    // GIVEN: User is logged in and on shift closing page
    await page.goto("/mystore/terminal/shift-closing/lottery");

    // WHEN: User enters ending number and clicks Next
    await page.fill('[data-testid="ending-number-input-bin-1"]', "000050");
    await page.click('[data-testid="next-button"]');

    // THEN: Closing data is submitted successfully
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    expect(page.locator('[data-testid="success-message"]')).toContainText(
      "1 pack closed",
    );
  });

  test("TEST-10.7-E2: Closing with pack activation during flow (verify sold packs section)", async ({
    page,
  }) => {
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
                pack_id: "pack-1",
                pack_number: "123456",
                game_name: "Test Game",
                status: "DEPLETED",
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
          summary: {
            packs_closed: 0,
            packs_depleted: 0,
            total_tickets_sold: 0,
            variances: [],
          },
        }),
      }),
    );

    // GIVEN: User is on shift closing page with sold packs
    await page.goto("/mystore/terminal/shift-closing/lottery");

    // THEN: Sold packs section displays correctly
    await expect(
      page.locator('[data-testid="sold-packs-section"]'),
    ).toBeVisible();
    expect(page.locator('[data-testid="sold-pack-123456"]')).toContainText(
      "Test Game",
    );

    // WHEN: User clicks Next (no manual entries needed)
    await page.click('[data-testid="next-button"]');

    // THEN: Closing completes successfully
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
  });

  test("TEST-10.7-E3: Closing with manual entry override (verify entry_method tracking)", async ({
    page,
  }) => {
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
                name: "Bin 1",
                pack: {
                  pack_id: "pack-1",
                  pack_number: "123456",
                  game_name: "Test Game",
                  opening_serial: "000001",
                },
              },
            ],
            soldPacks: [],
          },
        }),
      }),
    );

    await page.route("**/api/shifts/*/lottery/close", (route) => {
      const requestBody = route.request().postDataJSON();
      // Verify entry_method is MANUAL
      expect(requestBody.closings[0].entry_method).toBe("MANUAL");
      expect(requestBody.closings[0].manual_entry_authorized_by).toBeDefined();

      route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          summary: {
            packs_closed: 1,
            packs_depleted: 0,
            total_tickets_sold: 50,
            variances: [],
          },
        }),
      });
    });

    // GIVEN: User is on shift closing page
    await page.goto("/mystore/terminal/shift-closing/lottery");

    // WHEN: User enters ending number manually and authorizes manual entry
    await page.fill('[data-testid="ending-number-input-bin-1"]', "000050");
    await page.click('[data-testid="manual-entry-toggle-bin-1"]');
    await page.click('[data-testid="authorize-manual-entry-button"]');
    await page.click('[data-testid="next-button"]');

    // THEN: Closing data is submitted with MANUAL entry_method
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
  });

  // ============ EDGE CASES ============

  test("TEST-10.7-EDGE-E1: Should reject ending_serial longer than 3 digits", async ({
    page,
  }) => {
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
                name: "Bin 1",
                pack: {
                  pack_id: "pack-1",
                  pack_number: "123456",
                  game_name: "Test Game",
                  opening_serial: "001",
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
        status: 400,
        body: JSON.stringify({
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: "Ending serial must be 3 digits or less",
          },
        }),
      }),
    );

    // GIVEN: User is on shift closing page
    await page.goto("/mystore/terminal/shift-closing/lottery");

    // WHEN: User enters ending number longer than 3 digits
    await page.fill('[data-testid="ending-number-input-bin-1"]', "1234");

    // THEN: Should show validation error or reject on submit
    await page.click('[data-testid="next-button"]');
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible({
      timeout: 5000,
    });
  });

  test("TEST-10.7-EDGE-E2: Should handle network error gracefully", async ({
    page,
  }) => {
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
                name: "Bin 1",
                pack: {
                  pack_id: "pack-1",
                  pack_number: "123456",
                  game_name: "Test Game",
                  opening_serial: "001",
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
    await page.goto("/mystore/terminal/shift-closing/lottery");

    // WHEN: User enters ending number and clicks Next (network error occurs)
    await page.fill('[data-testid="ending-number-input-bin-1"]', "050");
    await page.click('[data-testid="next-button"]');

    // THEN: Should display error message and preserve user data
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible({
      timeout: 5000,
    });
    // User's entered data should not be lost
    await expect(
      page.locator('[data-testid="ending-number-input-bin-1"]'),
    ).toHaveValue("050");
  });
});
