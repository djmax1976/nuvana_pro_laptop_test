import { test, expect } from "../support/fixtures/rbac.fixture";
import { createUser } from "../support/factories";
import { withBypassClient } from "../support/prisma-bypass";

/**
 * Admin Role Creation Authorization E2E Tests
 *
 * Tests server-side authorization enforcement for the role creation page.
 * Validates that only Super Admins (users with ADMIN_SYSTEM_CONFIG permission)
 * can access the /admin/roles/new page.
 *
 * SECURITY: These tests verify that authorization checks run server-side
 * and cannot be bypassed by client-side manipulation.
 *
 * Priority: P0 (Critical - Security feature)
 *
 * Story: 2.93 - Super Admin Role Management
 */

test.describe("2.93-E2E: Admin Role Creation - Authorization Enforcement", () => {
  test("2.93-E2E-001: [P0] Super Admin should be able to access role creation page", async ({
    superadminPage,
  }) => {
    // GIVEN: I am authenticated as a Super Admin with ADMIN_SYSTEM_CONFIG permission

    // WHEN: Navigating to the role creation page
    await superadminPage.goto("/admin/roles/new");

    // THEN: The page loads successfully (not redirected)
    await expect(superadminPage).toHaveURL(/\/admin\/roles\/new/);

    // AND: The Create Role form is visible
    // The form should contain elements like role code input, scope selector, etc.
    await expect(
      superadminPage.getByRole("heading", { name: /create.*role/i }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("2.93-E2E-002: [P0] Non-Super Admin user should be redirected from role creation page", async ({
    page,
    prismaClient,
    storeManagerUser,
  }) => {
    // GIVEN: I am authenticated as a Store Manager (not Super Admin)
    // Store Manager does not have ADMIN_SYSTEM_CONFIG permission

    // Set up authenticated session with store manager token
    await page.goto(
      `${process.env.FRONTEND_URL || "http://localhost:3000"}/login`,
    );
    await page.context().addCookies([
      {
        name: "access_token",
        value: storeManagerUser.token,
        domain: "localhost",
        path: "/",
      },
    ]);

    // WHEN: Attempting to navigate to the role creation page
    const response = await page.goto(
      `${process.env.FRONTEND_URL || "http://localhost:3000"}/admin/roles/new`,
      { waitUntil: "networkidle" },
    );

    // THEN: User is redirected (status should be 307/308 for redirect, or page should redirect)
    // The redirect happens server-side, so we check the final URL
    const finalUrl = page.url();
    expect(finalUrl).not.toContain("/admin/roles/new");

    // AND: User is redirected to the roles list page with error parameter
    expect(finalUrl).toMatch(/\/admin\/roles/);
    expect(finalUrl).toContain("error=unauthorized");
  });

  test("2.93-E2E-003: [P0] Unauthenticated user should be redirected to login", async ({
    page,
  }) => {
    // GIVEN: I am not authenticated (no access token cookie)

    // WHEN: Attempting to navigate to the role creation page
    await page.goto(
      `${process.env.FRONTEND_URL || "http://localhost:3000"}/admin/roles/new`,
      { waitUntil: "networkidle" },
    );

    // THEN: User is redirected to login page
    // The dashboard layout should redirect unauthenticated users
    const finalUrl = page.url();
    expect(finalUrl).toMatch(/\/login/);
  });

  test("2.93-E2E-004: [P0] Client Owner should be redirected from role creation page", async ({
    page,
    prismaClient,
    clientUser,
  }) => {
    // GIVEN: I am authenticated as a Client Owner (not Super Admin)
    // Client Owner does not have ADMIN_SYSTEM_CONFIG permission

    // Set up authenticated session with client user token
    await page.goto(
      `${process.env.FRONTEND_URL || "http://localhost:3000"}/login`,
    );
    await page.context().addCookies([
      {
        name: "access_token",
        value: clientUser.token,
        domain: "localhost",
        path: "/",
      },
    ]);

    // WHEN: Attempting to navigate to the role creation page
    await page.goto(
      `${process.env.FRONTEND_URL || "http://localhost:3000"}/admin/roles/new`,
      { waitUntil: "networkidle" },
    );

    // THEN: User is redirected (not on the role creation page)
    const finalUrl = page.url();
    expect(finalUrl).not.toContain("/admin/roles/new");

    // AND: User is redirected (either to roles list or client dashboard)
    // Client users are typically redirected to client dashboard by the layout
    expect(
      finalUrl.includes("/admin/roles") ||
        finalUrl.includes("/client-dashboard"),
    ).toBe(true);
  });
});
