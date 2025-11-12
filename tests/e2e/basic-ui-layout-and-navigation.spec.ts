import { test, expect } from "@playwright/test";
import { createUser } from "../support/factories";

/**
 * Basic UI Layout and Navigation E2E Tests
 *
 * These tests verify the complete UI layout experience:
 * - Dashboard layout with sidebar navigation
 * - Header with user info and logout
 * - Route groups (auth) and (dashboard)
 * - Design system colors and typography
 * - Responsive behavior
 *
 * Story: 1-8-basic-ui-layout-and-navigation
 * Status: ready-for-dev
 * Priority: P0 (Critical - Core user experience foundation)
 */

// Helper to set authenticated user in localStorage
async function setAuthenticatedUser(
  page: any,
  user: { id: string; email: string; name: string },
) {
  await page.addInitScript((userData: any) => {
    localStorage.setItem(
      "auth_session",
      JSON.stringify({
        id: userData.id,
        email: userData.email,
        name: userData.name,
        user_metadata: {
          email: userData.email,
          full_name: userData.name,
        },
      }),
    );
  }, user);
}

test.describe("1.8-E2E-001: Dashboard Layout and Navigation", () => {
  test("[P0] 1.8-E2E-001-001: should display dashboard layout with sidebar navigation when user is authenticated", async ({
    page,
  }) => {
    // GIVEN: User is authenticated
    const user = createUser({
      id: "user-123", // Override with specific ID for consistent test behavior
      email: "user@example.com",
      name: "Test User",
    });
    await setAuthenticatedUser(page, {
      id: user.id!,
      email: user.email,
      name: user.name,
    });

    // Intercept auth check before navigation
    await page.route("**/api/auth/me*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            ...user,
            roles: [],
            permissions: [],
          },
        }),
      });
    });

    // WHEN: User accesses the application
    await page.goto("/dashboard");

    // THEN: Dashboard layout is displayed with sidebar navigation
    await expect(
      page.locator('[data-testid="dashboard-layout"]'),
    ).toBeVisible();

    // AND: Sidebar navigation is visible
    await expect(
      page.locator('[data-testid="sidebar-navigation"]'),
    ).toBeVisible();

    // AND: Sidebar contains navigation links (8 nav items: Dashboard, Companies, Stores, Shifts, Inventory, Lottery, Reports, AI Assistant)
    await expect(
      page.locator('[data-testid="sidebar-navigation"] a'),
    ).toHaveCount(8, { timeout: 5000 });
  });

  test("[P0] 1.8-E2E-001-002: should display header with user info and logout when user is authenticated", async ({
    page,
  }) => {
    // GIVEN: User is authenticated
    const user = createUser({
      id: "user-123",
      email: "user@example.com",
      name: "Test User",
    });
    await setAuthenticatedUser(page, {
      id: user.id!,
      email: user.email,
      name: user.name,
    });

    // Set desktop viewport (lg breakpoint is 1024px)
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.route("**/api/auth/me*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            ...user,
            roles: [],
            permissions: [],
          },
        }),
      });
    });

    // WHEN: User accesses the application
    // Network-first: Wait for auth check response before asserting
    const authResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/auth/me") && resp.status() === 200,
    );
    await page.goto("/dashboard");
    await authResponsePromise;

    // THEN: Header is displayed (check desktop header - second one is desktop)
    await expect(
      page.locator('header[data-testid="header"]').nth(1),
    ).toBeVisible({ timeout: 10000 });

    // AND: User menu trigger is visible (logout is in dropdown menu)
    await expect(
      page
        .locator('header[data-testid="header"]')
        .nth(1)
        .locator('[data-testid="user-menu-trigger"]'),
    ).toBeVisible();

    // Open dropdown to check user info
    await page
      .locator('header[data-testid="header"]')
      .nth(1)
      .locator('[data-testid="user-menu-trigger"]')
      .click();

    // AND: User name is displayed in dropdown menu
    await expect(
      page.locator('[data-testid="user-name"]').first(),
    ).toContainText("Test User");

    // AND: User email is displayed in dropdown menu
    await expect(
      page.locator('[data-testid="user-email"]').first(),
    ).toContainText("user@example.com");
  });

  test("[P0] 1.8-E2E-001-003: should route correctly when navigation links are clicked", async ({
    page,
  }) => {
    // GIVEN: User is authenticated and on dashboard
    const user = createUser({
      id: "user-123",
      email: "user@example.com",
      name: "Test User",
    });
    await setAuthenticatedUser(page, {
      id: user.id!,
      email: user.email,
      name: user.name,
    });

    await page.route("**/api/auth/me*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            ...user,
            roles: [],
            permissions: [],
          },
        }),
      });
    });

    await page.goto("/dashboard");
    await expect(
      page.locator('[data-testid="dashboard-layout"]'),
    ).toBeVisible();

    // WHEN: User clicks a navigation link (e.g., companies link when it exists)
    // Note: This test will fail until navigation links are implemented
    const navLink = page.locator('[data-testid="nav-link-companies"]');
    const linkExists = await navLink.isVisible().catch(() => false);

    if (linkExists) {
      await navLink.click();

      // THEN: User is routed to the correct page
      await page.waitForURL(/.*companies.*/, { timeout: 5000 });
    } else {
      // Test will fail - navigation links not implemented yet
      expect(linkExists).toBe(true);
    }
  });

  test("[P0] 1.8-E2E-001-004: should handle logout functionality correctly", async ({
    page,
    context,
  }) => {
    // GIVEN: User is authenticated and on dashboard
    const user = createUser({
      id: "user-123",
      email: "user@example.com",
      name: "Test User",
    });
    await setAuthenticatedUser(page, {
      id: user.id!,
      email: user.email,
      name: user.name,
    });

    // Set desktop viewport
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.route("**/api/auth/me*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            ...user,
            roles: [],
            permissions: [],
          },
        }),
      });
    });

    // Network-first: Intercept logout endpoint BEFORE navigation
    await page.route("**/api/auth/logout*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    // Network-first: Wait for auth check response
    const authResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/auth/me") && resp.status() === 200,
    );
    const logoutResponsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/auth/logout") && resp.status() === 200,
    );

    await page.goto("/dashboard");
    await authResponsePromise;
    await expect(
      page.locator('[data-testid="dashboard-layout"]'),
    ).toBeVisible();

    // Wait for header to be visible
    await expect(
      page.locator('header[data-testid="header"]').nth(1),
    ).toBeVisible({ timeout: 10000 });

    // WHEN: User clicks logout button (open menu first, then click logout)
    // Wait for user menu trigger to be visible (desktop header)
    await expect(
      page
        .locator('header[data-testid="header"]')
        .nth(1)
        .locator('[data-testid="user-menu-trigger"]'),
    ).toBeVisible({ timeout: 10000 });
    await page
      .locator('header[data-testid="header"]')
      .nth(1)
      .locator('[data-testid="user-menu-trigger"]')
      .click({ timeout: 15000 });
    await page.click('[data-testid="user-menu-logout"]');
    await logoutResponsePromise;

    // THEN: User is redirected to login page
    await page.waitForURL("/login", { timeout: 5000 });

    // AND: Auth cookies are cleared
    const cookies = await context.cookies();
    const authCookies = cookies.filter(
      (cookie) => cookie.name.includes("auth") || cookie.name.includes("token"),
    );
    expect(authCookies.length).toBe(0);
  });

  test("[P0] 1.8-E2E-001-005: should display responsive sidebar (collapsible on mobile)", async ({
    page,
  }) => {
    // GIVEN: User is authenticated
    const user = createUser({
      id: "user-123",
      email: "user@example.com",
      name: "Test User",
    });
    await setAuthenticatedUser(page, {
      id: user.id!,
      email: user.email,
      name: user.name,
    });

    await page.route("**/api/auth/me*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            ...user,
            roles: [],
            permissions: [],
          },
        }),
      });
    });

    // WHEN: User accesses application on mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/dashboard");

    // THEN: Sidebar is hidden by default on mobile (desktop sidebar is hidden, mobile uses Sheet)
    const desktopSidebar = page.locator(
      'aside:has([data-testid="sidebar-navigation"])',
    );
    const isDesktopSidebarHidden = await desktopSidebar
      .evaluate((el) => {
        return window.getComputedStyle(el).display === "none";
      })
      .catch(() => true);

    // Desktop sidebar should be hidden on mobile
    expect(isDesktopSidebarHidden).toBe(true);

    // AND: Sidebar toggle button is visible
    await expect(page.locator('[data-testid="sidebar-toggle"]')).toBeVisible();
  });

  test("[P0] 1.8-E2E-001-006: should apply design system colors correctly", async ({
    page,
  }) => {
    // GIVEN: User is authenticated
    const user = createUser({
      id: "user-123",
      email: "user@example.com",
      name: "Test User",
    });
    await setAuthenticatedUser(page, {
      id: user.id!,
      email: user.email,
      name: user.name,
    });

    await page.route("**/api/auth/me*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            ...user,
            roles: [],
            permissions: [],
          },
        }),
      });
    });

    // WHEN: User accesses the application
    await page.goto("/dashboard");

    // THEN: Primary color (#0066FF) is applied to primary elements (check active nav link)
    const activeNavLink = page
      .locator('[data-testid="sidebar-navigation"] a')
      .first();
    const activeNavLinkExists = await activeNavLink
      .isVisible()
      .catch(() => false);

    if (activeNavLinkExists) {
      const backgroundColor = await activeNavLink.evaluate((el) => {
        return window.getComputedStyle(el).backgroundColor;
      });
      // Verify primary color is used in active nav link (should have primary background)
      // Primary color #0066FF = rgb(0, 102, 255)
      expect(backgroundColor).toMatch(/rgb\(0, 102, 255\)|rgba\(0, 102, 255/i);
    } else {
      // Test will fail - sidebar navigation not visible
      expect(activeNavLinkExists).toBe(true);
    }
  });

  test("[P0] 1.8-E2E-001-007: should apply design system typography correctly", async ({
    page,
  }) => {
    // GIVEN: User is authenticated
    const user = createUser({
      id: "user-123",
      email: "user@example.com",
      name: "Test User",
    });
    await setAuthenticatedUser(page, {
      id: user.id!,
      email: user.email,
      name: user.name,
    });

    await page.route("**/api/auth/me*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            ...user,
            roles: [],
            permissions: [],
          },
        }),
      });
    });

    // WHEN: User accesses the application
    await page.goto("/dashboard");

    // THEN: Inter font is applied to headings and body text
    const heading = page.locator("h1, h2, h3").first();
    const headingExists = await heading.isVisible().catch(() => false);

    if (headingExists) {
      const fontFamily = await heading.evaluate((el) => {
        return window.getComputedStyle(el).fontFamily;
      });
      // Verify Inter font is used
      expect(fontFamily).toMatch(/Inter/i);
    } else {
      // Test will fail - typography not applied yet
      expect(headingExists).toBe(true);
    }
  });

  test("[P0] 1.8-E2E-001-008: should use (auth) route group layout for authentication pages", async ({
    page,
  }) => {
    // GIVEN: User is not authenticated (or on auth page)
    // WHEN: User accesses login page
    await page.goto("/login");

    // THEN: Auth layout is used (minimal, no sidebar)
    const dashboardLayout = page.locator('[data-testid="dashboard-layout"]');
    const dashboardLayoutExists = await dashboardLayout
      .isVisible()
      .catch(() => false);

    // Dashboard layout should NOT be visible on auth pages
    expect(dashboardLayoutExists).toBe(false);

    // AND: Auth layout is minimal (no sidebar)
    const sidebar = page.locator('[data-testid="sidebar-navigation"]');
    const sidebarExists = await sidebar.isVisible().catch(() => false);
    expect(sidebarExists).toBe(false);
  });

  test("[P0] 1.8-E2E-001-009: should use (dashboard) route group layout for dashboard pages", async ({
    page,
  }) => {
    // GIVEN: User is authenticated
    const user = createUser({
      id: "user-123",
      email: "user@example.com",
      name: "Test User",
    });
    await setAuthenticatedUser(page, {
      id: user.id!,
      email: user.email,
      name: user.name,
    });

    // Set desktop viewport
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.route("**/api/auth/me*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            ...user,
            roles: [],
            permissions: [],
          },
        }),
      });
    });

    // WHEN: User accesses dashboard page
    // Network-first: Wait for auth check response
    const authResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/auth/me") && resp.status() === 200,
    );
    await page.goto("/dashboard");
    await authResponsePromise;

    // THEN: Dashboard layout is used (with sidebar and header)
    await expect(
      page.locator('[data-testid="dashboard-layout"]'),
    ).toBeVisible();

    // AND: Sidebar is visible
    await expect(
      page.locator('[data-testid="sidebar-navigation"]'),
    ).toBeVisible();

    // AND: Header is visible (desktop header is second)
    await expect(
      page.locator('header[data-testid="header"]').nth(1),
    ).toBeVisible({ timeout: 10000 });
  });

  test("[P0] 1.8-E2E-001-010: should display user menu dropdown with profile and logout options", async ({
    page,
  }) => {
    // GIVEN: User is authenticated
    const user = createUser({
      id: "user-123",
      email: "user@example.com",
      name: "Test User",
    });
    await setAuthenticatedUser(page, {
      id: user.id!,
      email: user.email,
      name: user.name,
    });

    // Set desktop viewport
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.route("**/api/auth/me*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            ...user,
            roles: [],
            permissions: [],
          },
        }),
      });
    });

    // Network-first: Wait for auth check response
    const authResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/auth/me") && resp.status() === 200,
    );
    await page.goto("/dashboard");
    await authResponsePromise;

    // Wait for header to be visible
    await expect(
      page.locator('header[data-testid="header"]').nth(1),
    ).toBeVisible({ timeout: 10000 });

    // WHEN: User clicks user menu trigger (desktop header)
    await page
      .locator('header[data-testid="header"]')
      .nth(1)
      .locator('[data-testid="user-menu-trigger"]')
      .click({ timeout: 15000 });

    // THEN: User menu dropdown is displayed
    await expect(
      page.locator('[data-testid="user-menu-dropdown"]'),
    ).toBeVisible();

    // AND: Profile option is visible
    await expect(
      page.locator('[data-testid="user-menu-profile"]'),
    ).toBeVisible();

    // AND: Logout option is visible
    await expect(
      page.locator('[data-testid="user-menu-logout"]'),
    ).toBeVisible();
  });
});
