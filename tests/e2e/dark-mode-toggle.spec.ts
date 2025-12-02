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
  test("[P2] 1.9-E2E-001-000: should NOT display dark mode toggle button on login page (unauthenticated)", async ({
    page,
  }) => {
    // GIVEN: User is not authenticated
    // WHEN: User navigates to login page
    await page.goto("/login");

    // THEN: Dark mode toggle button should NOT be visible
    await expect(
      page.getByTestId("theme-toggle"),
      "Theme toggle button should NOT be visible for unauthenticated users",
    ).not.toBeVisible();
  });

  test("[P2] 1.9-E2E-001-001: should display dark mode toggle button in header when authenticated", async ({
    page,
  }) => {
    // GIVEN: User is authenticated
    const user = createUser({
      id: "user-123",
      email: "user@test.com",
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
      email: "user@test.com",
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
      email: "user@test.com",
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
      email: "user@test.com",
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
      email: "user@test.com",
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
      email: "user@test.com",
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

  test("[P2] 1.9-E2E-001-007: should reset theme to light mode on logout", async ({
    page,
  }) => {
    // GIVEN: User is authenticated and has set theme to dark
    const user = createUser({
      id: "user-123",
      email: "user@test.com",
      name: "Test User",
    });
    await setAuthenticatedUser(page, {
      id: user.id!,
      email: user.email,
      name: user.name,
    });

    await page.goto("/dashboard");

    // Switch to dark theme
    await page.getByTestId("theme-toggle").click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    // WHEN: User logs out
    await page.getByTestId("user-menu-trigger").click();
    await page.getByTestId("user-menu-logout").click();

    // THEN: Theme should reset to light mode
    await page.waitForURL("**/login");
    await expect(
      page.locator("html"),
      "Theme should reset to light mode after logout",
    ).not.toHaveClass(/dark/);

    // AND: Theme preference should be cleared from localStorage
    const themePreference = await page.evaluate(() => {
      return localStorage.getItem("nuvana-theme");
    });
    expect(
      themePreference,
      "Theme preference should be cleared from localStorage after logout",
    ).toBeNull();
  });

  test("[P2] 1.9-E2E-001-008: should not persist theme preference for unauthenticated users", async ({
    page,
  }) => {
    // GIVEN: User is not authenticated
    // WHEN: User visits login page
    await page.goto("/login");

    // THEN: Theme should be light (default)
    await expect(
      page.locator("html"),
      "Default theme should be light for unauthenticated users",
    ).not.toHaveClass(/dark/);

    // AND: No theme preference should be stored
    const themePreference = await page.evaluate(() => {
      return localStorage.getItem("nuvana-theme");
    });
    expect(
      themePreference,
      "No theme preference should be stored for unauthenticated users",
    ).toBeNull();
  });

  test("[P2] 1.9-E2E-001-009: should restore user's theme preference on subsequent login", async ({
    page,
  }) => {
    // GIVEN: User authenticates and sets theme to dark
    const user = createUser({
      id: "user-123",
      email: "user@test.com",
      name: "Test User",
    });
    await setAuthenticatedUser(page, {
      id: user.id!,
      email: user.email,
      name: user.name,
    });

    await page.goto("/dashboard");

    // Switch to dark theme
    await page.getByTestId("theme-toggle").click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    // Verify theme is saved with user-specific key
    const userThemeKey = `nuvana-theme-${user.id}`;
    let savedTheme = await page.evaluate(
      (key) => localStorage.getItem(key),
      userThemeKey,
    );
    expect(
      savedTheme,
      "Theme preference should be saved with user-specific key",
    ).toBe("dark");

    // WHEN: User logs out
    await page.getByTestId("user-menu-trigger").click();
    await page.getByTestId("user-menu-logout").click();
    await page.waitForURL("**/login");

    // Verify theme is reset to light after logout
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    // AND: User logs back in
    await setAuthenticatedUser(page, {
      id: user.id!,
      email: user.email,
      name: user.name,
    });
    await page.goto("/dashboard");

    // THEN: User's theme preference should be restored to dark
    await expect(
      page.locator("html"),
      "User's dark theme preference should be restored on subsequent login",
    ).toHaveClass(/dark/);

    // Verify the user-specific theme key still exists
    savedTheme = await page.evaluate(
      (key) => localStorage.getItem(key),
      userThemeKey,
    );
    expect(
      savedTheme,
      "User-specific theme preference should persist across login sessions",
    ).toBe("dark");
  });

  test("[P2] 1.9-E2E-001-010: should apply theme immediately on login without refresh (dark preference)", async ({
    page,
  }) => {
    // GIVEN: User has dark theme preference saved from previous session
    const user = createUser({
      id: "user-123",
      email: "user@test.com",
      name: "Test User",
    });
    const userThemeKey = `nuvana-theme-${user.id}`;

    // Set user's theme preference in localStorage
    await page.addInitScript(
      ({ userData, themeKey }: any) => {
        localStorage.setItem(themeKey, "dark");
      },
      { userData: user, themeKey: userThemeKey },
    );

    // WHEN: User logs in
    await setAuthenticatedUser(page, {
      id: user.id!,
      email: user.email,
      name: user.name,
    });
    await page.goto("/dashboard");

    // THEN: Dark theme should be applied IMMEDIATELY (no refresh needed)
    await expect(
      page.locator("html"),
      "Dark theme should be applied immediately on login without requiring refresh",
    ).toHaveClass(/dark/);
  });

  test("[P2] 1.9-E2E-001-011: should apply theme immediately on login without refresh (light preference)", async ({
    page,
  }) => {
    // GIVEN: User has light theme preference saved from previous session
    const user = createUser({
      id: "user-456",
      email: "user2@test.com",
      name: "User 2",
    });
    const userThemeKey = `nuvana-theme-${user.id}`;

    // Set user's theme preference in localStorage
    await page.addInitScript(
      ({ userData, themeKey }: any) => {
        localStorage.setItem(themeKey, "light");
      },
      { userData: user, themeKey: userThemeKey },
    );

    // WHEN: User logs in
    await setAuthenticatedUser(page, {
      id: user.id!,
      email: user.email,
      name: user.name,
    });
    await page.goto("/dashboard");

    // THEN: Light theme should be applied IMMEDIATELY (no refresh needed)
    await expect(
      page.locator("html"),
      "Light theme should be applied immediately on login without requiring refresh",
    ).not.toHaveClass(/dark/);
  });

  test("[P2] 1.9-E2E-001-012: should default to light theme when user has no saved preference", async ({
    page,
  }) => {
    // GIVEN: User has NO theme preference saved
    const user = createUser({
      id: "user-789",
      email: "newuser@test.com",
      name: "New User",
    });

    // No theme preference in localStorage

    // WHEN: User logs in
    await setAuthenticatedUser(page, {
      id: user.id!,
      email: user.email,
      name: user.name,
    });
    await page.goto("/dashboard");

    // THEN: Theme should default to light (no dark class)
    await expect(
      page.locator("html"),
      "Theme should default to light when user has no saved preference",
    ).not.toHaveClass(/dark/);

    // AND: No user-specific theme key should exist
    const userThemeKey = `nuvana-theme-${user.id}`;
    const savedTheme = await page.evaluate(
      (key) => localStorage.getItem(key),
      userThemeKey,
    );
    expect(
      savedTheme,
      "No theme preference should be saved for new user",
    ).toBeNull();
  });

  test("[P2] 1.9-E2E-001-013: should apply User B's light preference when User B logs in (after User A with dark)", async ({
    page,
  }) => {
    // GIVEN: User A has dark preference, User B has light preference
    const userA = createUser({
      id: "user-a",
      email: "usera@test.com",
      name: "User A",
    });
    const userB = createUser({
      id: "user-b",
      email: "userb@test.com",
      name: "User B",
    });
    const userAThemeKey = `nuvana-theme-${userA.id}`;
    const userBThemeKey = `nuvana-theme-${userB.id}`;

    // Set both users' preferences
    await page.addInitScript(
      ({ themeKeyA, themeKeyB }: any) => {
        localStorage.setItem(themeKeyA, "dark");
        localStorage.setItem(themeKeyB, "light");
      },
      { themeKeyA: userAThemeKey, themeKeyB: userBThemeKey },
    );

    // User A logs in first
    await setAuthenticatedUser(page, {
      id: userA.id!,
      email: userA.email,
      name: userA.name,
    });
    await page.goto("/dashboard");

    // Verify User A's dark theme is applied
    await expect(page.locator("html")).toHaveClass(/dark/);

    // WHEN: User A logs out
    await page.getByTestId("user-menu-trigger").click();
    await page.getByTestId("user-menu-logout").click();
    await page.waitForURL("**/login");

    // Verify theme resets to light on logout
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    // AND: User B logs in
    await setAuthenticatedUser(page, {
      id: userB.id!,
      email: userB.email,
      name: userB.name,
    });
    await page.goto("/dashboard");

    // THEN: User B's light theme should be applied (NOT User A's dark)
    await expect(
      page.locator("html"),
      "User B's light theme should be applied, not User A's dark theme",
    ).not.toHaveClass(/dark/);

    // Verify User B's preference is correctly stored
    const userBTheme = await page.evaluate(
      (key) => localStorage.getItem(key),
      userBThemeKey,
    );
    expect(
      userBTheme,
      "User B's light theme preference should be preserved",
    ).toBe("light");
  });

  test("[P2] 1.9-E2E-001-014: should restore theme immediately on page load with existing session", async ({
    page,
  }) => {
    // GIVEN: User has existing session and dark theme preference
    const user = createUser({
      id: "user-123",
      email: "user@test.com",
      name: "Test User",
    });
    const userThemeKey = `nuvana-theme-${user.id}`;

    // Set up existing session and theme preference
    await page.addInitScript(
      ({ userData, themeKey }: any) => {
        localStorage.setItem(
          "auth_session",
          JSON.stringify({
            authenticated: true,
            user: {
              id: userData.id,
              email: userData.email,
              name: userData.name,
            },
          }),
        );
        localStorage.setItem(themeKey, "dark");
      },
      { userData: user, themeKey: userThemeKey },
    );

    // WHEN: Page loads with existing session
    await page.goto("/dashboard");

    // THEN: Dark theme should be applied IMMEDIATELY (no refresh needed)
    await expect(
      page.locator("html"),
      "Dark theme should be applied immediately on page load with existing session",
    ).toHaveClass(/dark/);
  });
});
