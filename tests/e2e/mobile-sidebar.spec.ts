import { test, expect } from "@playwright/test";
import { createUser } from "../support/factories";

test.describe("Mobile Sidebar [P0]", () => {
  test.beforeEach(async ({ page }) => {
    // Set up authenticated user in localStorage
    // Format must match what AuthContext expects: { authenticated: true, user: {...} }
    const user = createUser();
    await page.addInitScript((userData: any) => {
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

    // Mock the auth API endpoint
    await page.route("**/api/auth/me*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            roles: ["SYSTEM_ADMIN"],
            permissions: ["*"],
          },
        }),
      });
    });

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/dashboard");
  });

  test("[P0] should open sidebar when hamburger menu is clicked", async ({
    page,
  }) => {
    // Click hamburger menu
    await page.getByTestId("sidebar-toggle").click();

    // Sidebar should be visible (use first() to handle mobile sheet duplication)
    await expect(page.getByTestId("sidebar-navigation").first()).toBeVisible();
  });

  test("[P0] should close sidebar when overlay is clicked", async ({
    page,
  }) => {
    // Open sidebar
    await page.getByTestId("sidebar-toggle").click();
    await expect(page.getByTestId("sidebar-navigation").first()).toBeVisible();

    // Click overlay (the dimmed background)
    // The overlay is rendered by Radix Dialog, usually has data-state attribute
    await page
      .locator("[data-radix-dialog-overlay]")
      .first()
      .click({ position: { x: 300, y: 300 } });

    // Sidebar should close
    await expect(
      page.getByTestId("sidebar-navigation").first(),
    ).not.toBeVisible();
  });

  test("[P0] should allow content interaction when sidebar is closed", async ({
    page,
  }) => {
    // Ensure sidebar is closed
    const sidebar = page.locator('[data-testid="sidebar-navigation"]');
    if (await sidebar.isVisible()) {
      await page.locator("[data-radix-dialog-overlay]").click();
    }

    // Try to interact with main content
    const mainContent = page.locator("main");
    await expect(mainContent).toBeVisible();

    // Content should be clickable (not blocked by invisible overlay)
    const isClickable = await mainContent.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const elementAtPoint = document.elementFromPoint(centerX, centerY);
      return el.contains(elementAtPoint);
    });

    expect(isClickable).toBe(true);
  });

  test("[P0] should have accessible title and description", async ({
    page,
  }) => {
    // Open sidebar
    await page.getByTestId("sidebar-toggle").click();

    // Check for accessible dialog
    const dialog = page.getByRole("dialog", { name: /navigation menu/i });
    await expect(dialog).toBeVisible();

    // Should have description (even if visually hidden)
    const description = dialog.locator(
      "text=Main navigation menu for the application",
    );
    await expect(description).toBeInViewport();
  });

  test("[P1] should close sidebar when navigation link is clicked", async ({
    page,
  }) => {
    // Open sidebar
    await page.getByTestId("sidebar-toggle").click();

    // Click a navigation link (use first() since mobile sheet may show duplicate nav)
    const dashboardLink = page.getByTestId("nav-link-dashboard").first();
    await dashboardLink.click();

    // Sidebar should auto-close on mobile after navigation
    await expect(
      page.getByTestId("sidebar-navigation").first(),
    ).not.toBeVisible();
  });

  test("[P1] should not block pointer events on content when closed", async ({
    page,
  }) => {
    // Verify no overlay exists when sidebar is closed
    const overlay = page.locator("[data-radix-dialog-overlay]");
    await expect(overlay).not.toBeVisible();
  });
});

test.describe("Desktop Sidebar [P1]", () => {
  test.beforeEach(async ({ page }) => {
    // Set up authenticated user in localStorage
    // Format must match what AuthContext expects: { authenticated: true, user: {...} }
    const user = createUser();
    await page.addInitScript((userData: any) => {
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

    // Mock the auth API endpoint
    await page.route("**/api/auth/me*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            roles: ["SYSTEM_ADMIN"],
            permissions: ["*"],
          },
        }),
      });
    });

    // Set desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/dashboard");
  });

  test("[P1] should always show sidebar on desktop", async ({ page }) => {
    const sidebar = page.locator('[data-testid="sidebar-navigation"]');
    await expect(sidebar).toBeVisible();
  });

  test("[P1] should not show hamburger menu on desktop", async ({ page }) => {
    const hamburger = page.locator('[data-testid="sidebar-toggle"]');
    await expect(hamburger).not.toBeVisible();
  });
});
