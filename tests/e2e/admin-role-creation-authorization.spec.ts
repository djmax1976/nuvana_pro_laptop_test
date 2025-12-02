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
    storeManagerUser,
  }) => {
    // GIVEN: I am authenticated as a Store Manager (not Super Admin)
    // Store Manager does not have ADMIN_SYSTEM_CONFIG permission

    // Set up localStorage auth session (AuthContext reads from localStorage)
    await page.addInitScript(
      (userData: any) => {
        localStorage.setItem(
          "auth_session",
          JSON.stringify({
            authenticated: true,
            user: {
              id: userData.user_id,
              email: userData.email,
              name: userData.name,
            },
            isClientUser: false,
          }),
        );
      },
      {
        user_id: storeManagerUser.user_id,
        email: storeManagerUser.email,
        name: storeManagerUser.name,
      },
    );

    // Set up cookie for server-side auth check
    await page.context().addCookies([
      {
        name: "access_token",
        value: storeManagerUser.token,
        domain: "localhost",
        path: "/",
      },
    ]);

    // WHEN: Attempting to navigate to the role creation page
    await page.goto(
      `${process.env.FRONTEND_URL || "http://localhost:3000"}/admin/roles/new`,
    );

    // THEN: User is redirected to roles list with error=unauthorized
    // The server-side auth check sees the user doesn't have ADMIN_SYSTEM_CONFIG permission
    // Wait for the redirect to complete
    await page.waitForURL(/\/admin\/roles\?error=unauthorized/, {
      timeout: 10000,
    });
    const finalUrl = page.url();
    expect(finalUrl).not.toContain("/admin/roles/new");
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
    );

    // THEN: User is redirected to login page
    // The dashboard layout redirects unauthenticated users via client-side router.push
    // Wait for the URL to change to /login
    await page.waitForURL(/\/login/, { timeout: 10000 });
    const finalUrl = page.url();
    expect(finalUrl).toMatch(/\/login/);
  });

  test("2.93-E2E-004: [P0] Client Owner should be redirected from role creation page", async ({
    page,
    clientUser,
  }) => {
    // GIVEN: I am authenticated as a Client Owner (not Super Admin)
    // Client Owner does not have ADMIN_SYSTEM_CONFIG permission

    // Set up localStorage auth session with isClientUser: true
    // The dashboard layout redirects client users to /client-dashboard
    await page.addInitScript(
      (userData: any) => {
        localStorage.setItem(
          "auth_session",
          JSON.stringify({
            authenticated: true,
            user: {
              id: userData.user_id,
              email: userData.email,
              name: userData.name,
            },
            isClientUser: true, // Client users get redirected by layout
          }),
        );
      },
      {
        user_id: clientUser.user_id,
        email: clientUser.email,
        name: clientUser.name,
      },
    );

    // Set up cookie for server-side auth check
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
    );

    // THEN: User is redirected to client dashboard
    // The dashboard layout redirects client users before the server-side auth check runs
    await page.waitForURL(/\/client-dashboard/, { timeout: 10000 });
    const finalUrl = page.url();
    expect(finalUrl).not.toContain("/admin/roles/new");
    expect(finalUrl).toContain("/client-dashboard");
  });
});
