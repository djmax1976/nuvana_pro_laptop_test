import { test as base } from "@playwright/test";

/**
 * Layout Test Fixtures
 *
 * Provides fixtures for UI layout testing:
 * - Authenticated page state (with user info)
 * - Dashboard page navigation
 * - Auth page navigation
 * - Auto-cleanup of session state
 *
 * Follows fixture architecture pattern: pure functions wrapped in fixtures
 */

type LayoutFixture = {
  authenticatedPage: {
    goto: (path?: string) => Promise<void>;
    user: {
      id: string;
      email: string;
      name: string;
    };
  };
};

export const test = base.extend<LayoutFixture>({
  authenticatedPage: async ({ page }, use) => {
    // Setup: Configure authenticated user state
    const user = {
      id: "user-123",
      email: "user@example.com",
      name: "Test User",
    };

    // Intercept auth check endpoint
    await page.route("**/api/auth/me*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            roles: [],
            permissions: [],
          },
        }),
      });
    });

    // Set localStorage auth session (Header component reads from localStorage)
    // Format must match what AuthContext expects: { authenticated: true, user: {...}, isClientUser: boolean }
    await page.addInitScript((userData) => {
      localStorage.setItem(
        "auth_session",
        JSON.stringify({
          authenticated: true,
          user: {
            id: userData.id,
            email: userData.email,
            name: userData.name,
          },
          isClientUser: false,
        }),
      );
    }, user);

    // Provide authenticated page helper
    await use({
      goto: async (path = "/dashboard") => {
        await page.goto(path);
      },
      user,
    });

    // Cleanup: Clear any session state (cookies, localStorage)
    await page.context().clearCookies();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  },
});

export { expect } from "@playwright/test";
