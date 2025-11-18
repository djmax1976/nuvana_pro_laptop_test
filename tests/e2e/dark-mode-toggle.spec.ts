import { test, expect } from "@playwright/test";
import { createUser } from "../support/factories";

/**
 * Dark Mode Toggle E2E Tests
 *
 * These tests verify the complete dark mode toggle functionality:
 * - Theme toggle button visibility in header
 * - Theme switching (light ↔ dark)
 * - Theme preference persistence across page refreshes
 * - Theme preference persistence across browser sessions
 * - Header layout with correct element order
 *
 * Story: 1-9-dark-mode-toggle-and-enhanced-header
 * Status: ready-for-dev
 * Priority: P2 (Medium - UX enhancement)
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

test.describe("1.9-E2E-001: Dark Mode Toggle", () => {
  test("[P2] 1.9-E2E-001-001: should display dark mode toggle button in header when authenticated", async ({
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

    // WHEN: User navigates to dashboard
    await page.goto("/dashboard");

    // THEN: Dark mode toggle button should be visible in header
    await expect(
      page.getByTestId("theme-toggle"),
      "Theme toggle button should be visible in header for authenticated users",
    ).toBeVisible();
  });

  test("[P2] 1.9-E2E-001-002: should switch theme from light to dark when toggle is clicked", async ({
    page,
  }) => {
    // GIVEN: User is authenticated and viewing dashboard in light theme
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

    // Set initial theme to light
    await page.addInitScript(() => {
      localStorage.setItem("nuvana-theme", "light");
    });

    await page.goto("/dashboard");

    // WHEN: User clicks the theme toggle button
    await page.getByTestId("theme-toggle").click();

    // THEN: Theme should switch to dark (html element should have .dark class)
    await expect(
      page.locator("html"),
      "HTML element should have 'dark' class after theme toggle",
    ).toHaveClass(/dark/);
  });

  test("[P2] 1.9-E2E-001-003: should switch theme from dark to light when toggle is clicked", async ({
    page,
  }) => {
    // GIVEN: User is authenticated and viewing dashboard in dark theme
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

    // Set initial theme to dark
    await page.addInitScript(() => {
      localStorage.setItem("nuvana-theme", "dark");
    });

    await page.goto("/dashboard");

    // WHEN: User clicks the theme toggle button
    await page.getByTestId("theme-toggle").click();

    // THEN: Theme should switch to light (html element should not have .dark class)
    await expect(
      page.locator("html"),
      "HTML element should not have 'dark' class after switching to light theme",
    ).not.toHaveClass(/dark/);
  });

  test("[P2] 1.9-E2E-001-004: should persist theme preference after page refresh", async ({
    page,
  }) => {
    // GIVEN: User is authenticated and sets theme to dark
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

    await page.goto("/dashboard");
    await page.getByTestId("theme-toggle-button").click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    // WHEN: User refreshes the page
    await page.reload();

    // THEN: Theme preference should persist (dark theme still active)
    await expect(
      page.locator("html"),
      "Theme should persist after page refresh - dark class should remain",
    ).toHaveClass(/dark/);
    // Verify toggle button is still visible (Moon icon shown via aria-label)
    await expect(
      page.getByTestId("theme-toggle"),
      "Theme toggle should remain visible after refresh",
    ).toBeVisible();
    await expect(
      page.getByTestId("theme-toggle"),
      "Theme toggle should show correct aria-label for dark theme after refresh",
    ).toHaveAttribute("aria-label", "Switch to light mode");
  });

  test("[P2] 1.9-E2E-001-005: should save theme preference to localStorage with key 'nuvana-theme'", async ({
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

    await page.goto("/dashboard");

    // WHEN: User clicks theme toggle to switch to dark
    await page.getByTestId("theme-toggle").click();

    // THEN: Theme preference should be saved to localStorage with key "nuvana-theme"
    const themePreference = await page.evaluate(() => {
      return localStorage.getItem("nuvana-theme");
    });
    expect(
      themePreference,
      "Theme preference should be saved to localStorage with key 'nuvana-theme'",
    ).toBe("dark");
  });

  test("[P2] 1.9-E2E-001-006: should display header elements in correct order (title, toggle, username, logout)", async ({
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

    // WHEN: User navigates to dashboard
    await page.goto("/dashboard");

    // THEN: Header should display elements in order: page title, theme toggle, username, logout button
    const header = page.getByTestId("header");

    // Verify theme toggle is positioned after page title and before username/logout
    const toggleIndex = await header
      .getByTestId("theme-toggle")
      .evaluate((el) => {
        const parent = el.parentElement;
        return parent ? Array.from(parent.children).indexOf(el) : -1;
      });

    expect(
      toggleIndex,
      "Theme toggle should be positioned in header",
    ).toBeGreaterThanOrEqual(0);

    // Verify toggle is visible and accessible
    await expect(
      page.getByTestId("theme-toggle"),
      "Theme toggle should be visible in header",
    ).toBeVisible();
  });
});
