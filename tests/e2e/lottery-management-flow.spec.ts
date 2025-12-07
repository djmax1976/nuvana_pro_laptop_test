/**
 * E2E Tests: Lottery Management Flow
 *
 * Tests critical end-to-end user journeys:
 * - Pack reception → activation flow (critical workflow)
 * - Variance detection → approval flow (critical workflow)
 *
 * @test-level E2E
 * @justification Tests critical multi-page user journeys that require full system integration
 * @story 6-10 - Lottery Management UI
 * @priority P0 (Critical - Core User Journey)
 *
 * RED PHASE: These tests define expected behavior before implementation.
 * Tests will fail until full UI and API integration is implemented.
 */

import { test, expect } from "@playwright/test";

test.describe("6.10-E2E: Lottery Management Flow", () => {
  test.beforeEach(async ({ page }) => {
    // CRITICAL: Intercept routes BEFORE navigation (network-first pattern)
    await page.route("**/api/auth/login", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          token: "mock-jwt-token",
          user: {
            user_id: "123e4567-e89b-12d3-a456-426614174000",
            email: "storemanager@example.com",
            role: "STORE_MANAGER",
          },
        }),
      }),
    );

    await page.route("**/api/lottery/packs**", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          data: [],
        }),
      }),
    );

    await page.route("**/api/lottery/games**", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          data: [
            {
              game_id: "223e4567-e89b-12d3-a456-426614174001",
              name: "Scratch-Off Game 1",
            },
          ],
        }),
      }),
    );
  });

  test("6.10-E2E-001: [P0] user can receive and activate pack end-to-end (AC #2, #3)", async ({
    page,
  }) => {
    // CRITICAL: Intercept routes BEFORE navigation
    let packReceived = false;
    await page.route("**/api/lottery/packs/receive", (route) => {
      packReceived = true;
      route.fulfill({
        status: 201,
        body: JSON.stringify({
          success: true,
          data: {
            pack_id: "323e4567-e89b-12d3-a456-426614174002",
            pack_number: "PACK-001",
            status: "RECEIVED",
          },
        }),
      });
    });

    await page.route(
      "**/api/lottery/packs/323e4567-e89b-12d3-a456-426614174002/activate",
      (route) =>
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            success: true,
            data: {
              pack_id: "323e4567-e89b-12d3-a456-426614174002",
              status: "ACTIVE",
            },
          }),
        }),
    );

    // GIVEN: User is logged in and navigates to lottery section
    await page.goto("/login");
    await page.fill('[data-testid="email-input"]', "storemanager@example.com");
    await page.fill('[data-testid="password-input"]', "password123");
    await page.click('[data-testid="login-button"]');
    await page.waitForURL("/dashboard");

    await page.goto("/companies/test-company/stores/test-store/lottery");

    // WHEN: User receives a new pack
    await page.click('[data-testid="receive-pack-button"]');
    await page.fill('[data-testid="pack-number-input"]', "PACK-001");
    await page.fill('[data-testid="serial-start-input"]', "0001");
    await page.fill('[data-testid="serial-end-input"]', "0100");
    await page.selectOption(
      '[data-testid="game-select"]',
      "223e4567-e89b-12d3-a456-426614174001",
    );
    await page.click('[data-testid="submit-pack-reception"]');

    // THEN: Pack is created with RECEIVED status
    await expect(page.locator('[data-testid="success-message"]')).toContainText(
      /success|received/i,
    );
    expect(packReceived).toBe(true);

    // WHEN: User activates the pack
    await page.click('[data-testid="activate-pack-button"]');
    await page.selectOption(
      '[data-testid="pack-select"]',
      "323e4567-e89b-12d3-a456-426614174002",
    );
    await page.click('[data-testid="submit-pack-activation"]');

    // THEN: Pack status changes to ACTIVE
    await expect(page.locator('[data-testid="success-message"]')).toContainText(
      /success|activated/i,
    );
    await expect(
      page.locator('[data-testid="pack-status-badge"]'),
    ).toContainText("ACTIVE");
  });

  test("6.10-E2E-002: [P0] user can view and approve variance end-to-end (AC #5, #6)", async ({
    page,
  }) => {
    // CRITICAL: Intercept routes BEFORE navigation
    await page.route("**/api/lottery/variances**", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          data: [
            {
              variance_id: "423e4567-e89b-12d3-a456-426614174003",
              shift_id: "523e4567-e89b-12d3-a456-426614174004",
              pack_id: "323e4567-e89b-12d3-a456-426614174002",
              expected_count: 100,
              actual_count: 95,
              difference: -5,
              approved_at: null,
              pack: {
                pack_number: "PACK-001",
                game: { name: "Scratch-Off Game 1" },
              },
            },
          ],
        }),
      }),
    );

    let varianceApproved = false;
    await page.route(
      "**/api/lottery/variances/423e4567-e89b-12d3-a456-426614174003/approve",
      (route) => {
        varianceApproved = true;
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            success: true,
            data: {
              variance_id: "423e4567-e89b-12d3-a456-426614174003",
              approved_at: "2024-01-01T12:00:00Z",
            },
          }),
        });
      },
    );

    // GIVEN: User is logged in and navigates to lottery section with variances
    await page.goto("/login");
    await page.fill('[data-testid="email-input"]', "storemanager@example.com");
    await page.fill('[data-testid="password-input"]', "password123");
    await page.click('[data-testid="login-button"]');
    await page.waitForURL("/dashboard");

    await page.goto("/companies/test-company/stores/test-store/lottery");

    // WHEN: User views variance alert
    await expect(page.locator('[data-testid="variance-alert"]')).toBeVisible();
    await expect(page.locator('[data-testid="variance-alert"]')).toContainText(
      /expected.*100|actual.*95/i,
    );

    // WHEN: User approves variance
    await page.click('[data-testid="approve-variance-button"]');
    await page.fill(
      '[data-testid="variance-reason-input"]',
      "Test approval reason",
    );
    await page.click('[data-testid="submit-variance-approval"]');

    // THEN: Variance is approved and alert is updated
    await expect(page.locator('[data-testid="success-message"]')).toContainText(
      /success|approved/i,
    );
    expect(varianceApproved).toBe(true);
    await expect(
      page.locator('[data-testid="variance-alert"]'),
    ).not.toBeVisible();
  });
});
