import { test, expect } from "@playwright/test";

test.describe("Mobile Sidebar [P0]", () => {
  test.beforeEach(async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/dashboard");
  });

  test("[P0] should open sidebar when hamburger menu is clicked", async ({
    page,
  }) => {
    // Click hamburger menu
    await page.click('[data-testid="sidebar-toggle"]');

    // Sidebar should be visible
    await expect(
      page.locator('[data-testid="sidebar-navigation"]'),
    ).toBeVisible();
  });

  test("[P0] should close sidebar when overlay is clicked", async ({
    page,
  }) => {
    // Open sidebar
    await page.click('[data-testid="sidebar-toggle"]');
    await expect(
      page.locator('[data-testid="sidebar-navigation"]'),
    ).toBeVisible();

    // Click overlay (the dimmed background)
    // The overlay is rendered by Radix Dialog, usually has data-state attribute
    await page
      .locator("[data-radix-dialog-overlay]")
      .click({ position: { x: 300, y: 300 } });

    // Sidebar should close
    await expect(
      page.locator('[data-testid="sidebar-navigation"]'),
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
    await page.click('[data-testid="sidebar-toggle"]');

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
    await page.click('[data-testid="sidebar-toggle"]');

    // Click a navigation link
    const dashboardLink = page.locator('[data-testid="nav-link-dashboard"]');
    await dashboardLink.click();

    // Sidebar should auto-close on mobile after navigation
    await expect(
      page.locator('[data-testid="sidebar-navigation"]'),
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
