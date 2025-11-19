import { test, expect } from "@playwright/test";

/**
 * Supabase OAuth Login E2E Tests
 *
 * These tests verify the complete OAuth authentication flow:
 * - OAuth login button interaction
 * - OAuth provider redirect
 * - Callback handling
 * - User session management
 *
 * Story: 1-5-supabase-oauth-integration
 * Status: ready-for-dev
 * Priority: P0 (Critical - Authentication)
 *
 * NOTE: OAuth authentication is DISABLED in this application.
 * These tests are skipped as OAuth functionality has been removed.
 */

test.describe.skip(
  "1.5-E2E-001: OAuth Login Flow [DISABLED - OAuth not supported]",
  () => {
    test("[P0] 1.5-E2E-001-001: should redirect to OAuth provider when login button is clicked", async ({
      page,
    }) => {
      // GIVEN: User is on login page
      await page.goto("/login");

      // WHEN: User clicks OAuth login button
      await page.click('[data-testid="oauth-login-button"]');

      // THEN: User is redirected to OAuth provider
      // Wait for navigation to OAuth provider (Supabase or Google/GitHub)
      await page.waitForURL(/.*supabase.*|.*google.*|.*github.*/, {
        timeout: 10000,
      });

      // AND: Current URL contains OAuth provider domain
      const currentUrl = page.url();
      expect(currentUrl).toMatch(/supabase|google|github/);
    });

    test("[P0] 1.5-E2E-001-002: should handle OAuth callback and redirect to dashboard after successful login", async ({
      page,
    }) => {
      // GIVEN: User completes OAuth authentication (mocked)
      // Intercept OAuth callback before navigation
      await page.route("**/api/auth/callback*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            user: {
              email: "user@example.com",
              name: "Test User",
              auth_provider_id: "supabase_user_id_123",
            },
          }),
        });
      });

      // Navigate to callback URL (simulating OAuth redirect)
      await page.goto(
        "/api/auth/callback?code=valid_oauth_code&state=random_state",
      );

      // THEN: User is redirected to dashboard
      await page.waitForURL("/dashboard", { timeout: 10000 });

      // AND: Dashboard page is displayed
      await expect(
        page.locator('[data-testid="dashboard-content"]'),
      ).toBeVisible();
    });

    test("[P0] 1.5-E2E-001-003: should display error message for failed OAuth authentication", async ({
      page,
    }) => {
      // GIVEN: OAuth authentication fails
      // Intercept OAuth callback with error
      await page.route("**/api/auth/callback*", async (route) => {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Authentication failed",
          }),
        });
      });

      // WHEN: User is redirected to callback with invalid code
      await page.goto(
        "/api/auth/callback?code=invalid_code&state=random_state",
      );

      // THEN: Error message is displayed
      await expect(
        page.locator('[data-testid="auth-error-message"]'),
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="auth-error-message"]'),
      ).toContainText("authentication");
    });

    test("[P0] 1.5-E2E-001-004: should store user session after successful OAuth login", async ({
      page,
      context,
    }) => {
      // GIVEN: User completes OAuth authentication
      await page.route("**/api/auth/callback*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            user: {
              email: "user@example.com",
              name: "Test User",
              auth_provider_id: "supabase_user_id_123",
            },
          }),
        });
      });

      // WHEN: User successfully logs in via OAuth
      await page.goto(
        "/api/auth/callback?code=valid_oauth_code&state=random_state",
      );
      await page.waitForURL("/dashboard");

      // THEN: User session is stored (check localStorage or cookies)
      const cookies = await context.cookies();
      const hasAuthCookie = cookies.some(
        (cookie) =>
          cookie.name.includes("auth") || cookie.name.includes("session"),
      );

      // OR: Check localStorage
      const sessionData = await page.evaluate(() => {
        return (
          localStorage.getItem("auth_session") ||
          localStorage.getItem("user_session")
        );
      });

      // Session should be stored (either in cookie or localStorage)
      expect(hasAuthCookie || sessionData).toBeTruthy();
    });

    test("[P1] 1.5-E2E-001-005: should handle network timeout during OAuth callback", async ({
      page,
    }) => {
      // GIVEN: OAuth callback endpoint times out
      await page.route("**/api/auth/callback*", async (route) => {
        // Simulate timeout by aborting the route immediately
        await route.abort("failed");
      });

      // WHEN: User is redirected to callback URL
      await page
        .goto("/api/auth/callback?code=valid_oauth_code&state=random_state", {
          waitUntil: "domcontentloaded",
          timeout: 10000, // Use Playwright's timeout mechanism
        })
        .catch(() => {
          // Expected timeout or network failure
        });

      // THEN: Error message or timeout handling is displayed
      // Check for either error message or timeout indicator
      const errorVisible = await page
        .locator(
          '[data-testid="auth-error-message"], [data-testid="timeout-message"]',
        )
        .isVisible()
        .catch(() => false);
      expect(errorVisible).toBeTruthy();
    });

    test("[P1] 1.5-E2E-001-006: should prevent multiple simultaneous login attempts", async ({
      page,
    }) => {
      // GIVEN: User is on login page
      await page.goto("/login");

      // WHEN: User clicks OAuth login button (first click)
      const firstClick = page.click('[data-testid="oauth-login-button"]');
      await firstClick;

      // THEN: Button should be disabled after first click
      await expect(
        page.locator('[data-testid="oauth-login-button"]'),
      ).toBeDisabled({ timeout: 2000 });

      // AND: Attempting second click should not trigger another navigation
      const secondClick = page
        .click('[data-testid="oauth-login-button"]', { timeout: 1000 })
        .catch(() => {
          // Expected - button is disabled
          return null;
        });
      await secondClick;

      // AND: Only one OAuth redirect should occur
      await page.waitForURL(/.*supabase.*|.*google.*|.*github.*/, {
        timeout: 10000,
      });
      const currentUrl = page.url();
      const redirectCount = (currentUrl.match(/supabase|google|github/g) || [])
        .length;
      expect(redirectCount).toBeGreaterThanOrEqual(1);
      expect(redirectCount).toBeLessThanOrEqual(1);
    });

    test("[P1] 1.5-E2E-001-007: should maintain session after page reload", async ({
      page,
      context,
    }) => {
      // GIVEN: User successfully logs in via OAuth
      await page.route("**/api/auth/callback*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            user: {
              email: "user@example.com",
              name: "Test User",
              auth_provider_id: "supabase_user_id_123",
            },
          }),
        });
      });

      await page.goto(
        "/api/auth/callback?code=valid_oauth_code&state=random_state",
      );
      await page.waitForURL("/dashboard");

      // WHEN: User reloads the page
      await page.reload();

      // THEN: User remains logged in (session persists)
      await expect(
        page.locator('[data-testid="dashboard-content"]'),
      ).toBeVisible();

      // AND: Session data is still present
      const cookies = await context.cookies();
      const hasAuthCookie = cookies.some(
        (cookie) =>
          cookie.name.includes("auth") || cookie.name.includes("session"),
      );

      const sessionData = await page.evaluate(() => {
        return (
          localStorage.getItem("auth_session") ||
          localStorage.getItem("user_session")
        );
      });

      expect(hasAuthCookie || sessionData).toBeTruthy();
    });
  },
);
