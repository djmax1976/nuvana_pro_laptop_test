import { test, expect } from "../support/fixtures";

/**
 * E2E Tests - Homepage Marketing Page
 *
 * These tests validate the marketing homepage user experience.
 * Focus on critical paths that must always work (P0 priority).
 */

test.describe("E2E-002: Homepage - Marketing Page", () => {
  test("[P0] should load homepage and display hero section", async ({
    page,
  }) => {
    // GIVEN: User navigates to homepage
    await page.goto("/");

    // WHEN: Page loads
    // THEN: Hero section is visible with main headline
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("h1")).toContainText(
      "Effortless Store Management",
    );
    await expect(page.locator("h1")).toContainText("Made Simple");
  });

  test("[P0] should display all four pain point cards", async ({ page }) => {
    // GIVEN: User navigates to homepage
    await page.goto("/");

    // WHEN: User scrolls to pain points section
    // THEN: All four pain point cards are visible
    await expect(
      page.getByRole("heading", { name: /Your Pain Points/i }),
    ).toBeVisible();

    // Verify all four pain points are present
    await expect(
      page.getByRole("heading", { name: /Effortless Inventory Management/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: /Effortless Shift & Day Reconciliations/i,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Effortless Lottery Tracking/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Effortless Price Updates/i }),
    ).toBeVisible();
  });

  test("[P1] should scroll to contact form when clicking Get Started button", async ({
    page,
  }) => {
    // GIVEN: User is on homepage
    await page.goto("/");

    // WHEN: User clicks "Get Started" button in hero section
    await page
      .getByRole("button", { name: /Get Started/i })
      .first()
      .click();

    // THEN: Page scrolls to contact form section
    await expect(
      page.getByRole("heading", {
        name: /Ready to Transform Your Operations/i,
      }),
    ).toBeVisible();
    await expect(page.locator("form")).toBeVisible();
  });

  test("[P1] should display contact form with all required fields", async ({
    page,
  }) => {
    // GIVEN: User navigates to homepage
    await page.goto("/");

    // WHEN: User scrolls to contact form section
    await page
      .getByRole("button", { name: /Get Started/i })
      .first()
      .click();

    // THEN: Contact form displays with Name, Email, and Message fields
    await expect(page.locator('label:has-text("Name")')).toBeVisible();
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('label:has-text("Email")')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('label:has-text("Message")')).toBeVisible();
    await expect(page.locator('textarea[name="message"]')).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Send Message/i }),
    ).toBeVisible();
  });

  test("[P1] should display benefits section with key features", async ({
    page,
  }) => {
    // GIVEN: User navigates to homepage
    await page.goto("/");

    // WHEN: User scrolls through page
    // THEN: Benefits section displays enterprise features
    await expect(
      page.getByRole("heading", { name: /Enterprise-Grade Platform/i }),
    ).toBeVisible();

    // Verify key benefits are displayed
    await expect(
      page.getByRole("heading", { name: /AI-Powered Operations/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Multi-Tenant Architecture/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /High Performance/i }),
    ).toBeVisible();
  });

  test("[P2] should display key statistics in benefits section", async ({
    page,
  }) => {
    // GIVEN: User navigates to homepage
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");

    // WHEN: User scrolls to benefits section
    // THEN: Key statistics are displayed
    // Use more specific selectors to avoid strict mode violations
    await expect(page.getByText(/1000\+/i).first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/100K\+/i).first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/99\.9%/i).first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/<500ms/i).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("[P1] should navigate to dashboard when clicking View Dashboard button", async ({
    page,
  }) => {
    // GIVEN: User is on homepage
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");

    // WHEN: User clicks "View Dashboard" button
    const dashboardLink = page
      .getByRole("link", { name: /View Dashboard/i })
      .first();
    await expect(dashboardLink).toBeVisible({ timeout: 10000 });

    // Click and wait for navigation
    await Promise.all([
      page.waitForURL(/\/dashboard/, { timeout: 10000 }).catch(() => {
        // If redirect doesn't happen, check if we're on login page (unauthenticated)
        return page.waitForURL(/\/login/, { timeout: 5000 }).catch(() => null);
      }),
      dashboardLink.click(),
    ]);

    // THEN: User is redirected to dashboard page or login (if not authenticated)
    const currentUrl = page.url();
    const isOnDashboard = currentUrl.includes("/dashboard");
    const isOnLogin = currentUrl.includes("/login");
    expect(isOnDashboard || isOnLogin).toBeTruthy();
  });

  test("[P2] should have responsive layout on mobile viewport", async ({
    page,
  }) => {
    // GIVEN: User accesses homepage on mobile device
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    // WHEN: Page loads
    // THEN: Content is visible and properly laid out
    await expect(page.locator("h1")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Your Pain Points/i }),
    ).toBeVisible();
  });
});
