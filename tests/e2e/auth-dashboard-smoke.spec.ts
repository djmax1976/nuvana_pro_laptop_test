/**
 * Authentication & Dashboard Access Smoke Tests
 *
 * CRITICAL: These tests verify the FULL authentication and dashboard access flow.
 * They use the REAL login page/API - no fabricated tokens or mocked auth.
 *
 * This catches bugs where:
 * - Login works but JWT has no roles/permissions
 * - Dashboard pages fail with 403 errors
 * - Users can't access pages they should be able to access
 * - Role-based routing is broken
 *
 * These tests would have caught the empty user_roles table bug.
 *
 * Priority: P0 (Critical - Authentication smoke tests)
 *
 * Story: Cross-cutting - Authentication & Authorization
 *
 * BEST PRACTICES APPLIED:
 * - Real login flow (no fabricated tokens)
 * - Explicit assertions with Playwright's auto-waiting
 * - Proper cleanup with error handling
 * - API error monitoring for 403 detection
 * - Deterministic test behavior
 * - Serial execution to prevent database conflicts
 *
 * IMPORTANT: Uses bcryptjs (not bcrypt) for password hashing to match backend
 */

import { test as base, expect, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { withBypassClient } from "../support/prisma-bypass";
import { createUser } from "../support/factories";
import bcrypt from "bcryptjs";

/**
 * Generate a short unique ID for test data (max 30 chars for public_id columns)
 * Format: t{timestamp_base36}_{random} - all lowercase for email compatibility
 * e.g., "tlx5g3k_a7b2" (~15 chars)
 *
 * IMPORTANT: Must be lowercase because backend login does email.toLowerCase()
 */
function shortId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `t${timestamp}_${random}`;
}

// Extend base test with fixtures needed for real login testing
const test = base.extend<{
  prismaClient: PrismaClient;
  frontendUrl: string;
  backendUrl: string;
}>({
  prismaClient: async ({}, use) => {
    const prisma = new PrismaClient();
    await prisma.$connect();
    await use(prisma);
    await prisma.$disconnect();
  },
  frontendUrl: async ({}, use) => {
    await use(process.env.FRONTEND_URL || "http://localhost:3000");
  },
  backendUrl: async ({}, use) => {
    await use(process.env.BACKEND_URL || "http://localhost:3001");
  },
});

/**
 * Helper to perform real login via the login page
 * @param page - Playwright page object
 * @param frontendUrl - Base URL for frontend
 * @param email - User email
 * @param password - User password
 * @param isClientUser - Whether to use client login page
 */
async function performRealLogin(
  page: Page,
  frontendUrl: string,
  email: string,
  password: string,
  isClientUser: boolean = false,
): Promise<void> {
  // Navigate to login page
  // Note: /client-login redirects to /login, but we use it for clarity in tests
  // The unified login page handles both admin and client users
  const loginPath = isClientUser ? "/client-login" : "/login";
  await page.goto(`${frontendUrl}${loginPath}`, {
    waitUntil: "networkidle",
  });

  // If we navigated to /client-login, it redirects to /login, so wait for that
  if (isClientUser) {
    await page.waitForURL((url) => url.pathname === "/login", {
      timeout: 5000,
    });
  }

  // Wait for page to be fully loaded
  await page.waitForLoadState("domcontentloaded");

  // Wait for login form to be visible and enabled
  const emailInput = page.locator("#email");
  await expect(emailInput).toBeVisible({ timeout: 10000 });
  await expect(emailInput).toBeEnabled({ timeout: 5000 });

  // Fill in credentials
  await emailInput.click();
  await emailInput.fill(email);

  const passwordInput = page.locator("#password");
  await expect(passwordInput).toBeVisible({ timeout: 5000 });
  await passwordInput.click();
  await passwordInput.fill(password);

  // Verify fields are filled before submitting
  await expect(emailInput).toHaveValue(email);
  await expect(passwordInput).toHaveValue(password);

  // Submit form
  const submitButton = page.getByRole("button", { name: "Sign In" });
  await expect(submitButton).toBeEnabled({ timeout: 5000 });
  await submitButton.click();

  // Wait for navigation away from login page OR for an error to appear
  try {
    await page.waitForURL((url) => !url.pathname.includes("login"), {
      timeout: 15000,
    });
  } catch {
    // Check if there's an error message on the page (filter out route announcer)
    const errorAlert = page.locator(
      '[role="alert"]:not([id="__next-route-announcer__"])',
    );
    if ((await errorAlert.count()) > 0 && (await errorAlert.isVisible())) {
      const errorText = await errorAlert.textContent();
      throw new Error(`Login failed with error: ${errorText}`);
    }
    throw new Error("Login failed - page did not navigate away from login");
  }
}

/**
 * Helper to setup API error listener for 401/403 detection
 * Monitors API responses for authentication/authorization failures
 */
function setupApiErrorListener(page: Page): {
  errors: string[];
  has401: () => boolean;
  has403: () => boolean;
} {
  const errors: string[] = [];
  page.on("response", (response) => {
    const status = response.status();
    if (
      (status === 401 || status === 403) &&
      response.url().includes("/api/")
    ) {
      errors.push(`${status} on ${response.url()}`);
    }
  });
  return {
    errors,
    has401: () => errors.some((e) => e.startsWith("401")),
    has403: () => errors.some((e) => e.startsWith("403")),
  };
}

/**
 * Helper to safely cleanup test user
 */
async function cleanupTestUser(
  userId: string | undefined,
  companyId?: string,
): Promise<void> {
  if (!userId) return;

  try {
    await withBypassClient(async (bypassClient) => {
      // Delete user roles first (foreign key constraint)
      await bypassClient.userRole.deleteMany({
        where: { user_id: userId },
      });

      // Delete stores if company exists
      if (companyId) {
        await bypassClient.store.deleteMany({
          where: { company_id: companyId },
        });
        await bypassClient.company.delete({
          where: { company_id: companyId },
        });
      }

      // Delete user
      await bypassClient.user.delete({
        where: { user_id: userId },
      });
    });
  } catch (error) {
    // Log but don't fail - cleanup errors shouldn't mask test failures
    console.warn(`Cleanup warning for user ${userId}:`, error);
  }
}

test.describe
  .serial("AUTH-E2E: Real Login & Dashboard Access Smoke Tests", () => {
  test.describe.serial("AUTH-E2E-SA: Superadmin Dashboard Access", () => {
    test("AUTH-E2E-SA-001: [P0] superadmin can login and access dashboard without 403 errors", async ({
      page,
      frontendUrl,
      prismaClient,
    }) => {
      // GIVEN: Create a test superadmin user
      const password = "TestSuperAdmin123!";
      const passwordHash = await bcrypt.hash(password, 10);
      const userData = createUser({
        email: `test-sa1-${shortId()}@test.nuvana.local`,
        password_hash: passwordHash,
        auth_provider_id: null, // Local auth user (not OAuth)
      });
      const user = await prismaClient.user.create({ data: userData });

      const role = await prismaClient.role.findUnique({
        where: { code: "SUPERADMIN" },
      });
      expect(role, "SUPERADMIN role must exist").not.toBeNull();

      await withBypassClient(async (bypassClient) => {
        await bypassClient.userRole.create({
          data: { user_id: user.user_id, role_id: role!.role_id },
        });
      });

      const apiErrorListener = setupApiErrorListener(page);

      try {
        // WHEN: Performing real login
        await performRealLogin(page, frontendUrl, user.email, password);

        // THEN: Should land on dashboard
        await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

        // THEN: Dashboard should load without errors
        await expect(
          page.getByRole("heading", { name: /dashboard/i }),
        ).toBeVisible({ timeout: 10000 });

        // THEN: No 401/403 errors should occur
        expect(
          apiErrorListener.errors,
          "No API auth errors expected",
        ).toHaveLength(0);
      } finally {
        await cleanupTestUser(user.user_id);
      }
    });

    test("AUTH-E2E-SA-002: [P0] superadmin can access companies page without 403 errors", async ({
      page,
      frontendUrl,
      prismaClient,
    }) => {
      // GIVEN: Create a test superadmin user
      const password = "TestSuperAdmin123!";
      const passwordHash = await bcrypt.hash(password, 10);
      const userData = createUser({
        email: `test-sa2-${shortId()}@test.nuvana.local`,
        password_hash: passwordHash,
        auth_provider_id: null, // Local auth user (not OAuth)
      });
      const user = await prismaClient.user.create({ data: userData });

      const role = await prismaClient.role.findUnique({
        where: { code: "SUPERADMIN" },
      });
      expect(role, "SUPERADMIN role must exist").not.toBeNull();

      await withBypassClient(async (bypassClient) => {
        await bypassClient.userRole.create({
          data: { user_id: user.user_id, role_id: role!.role_id },
        });
      });

      const apiErrorListener = setupApiErrorListener(page);

      try {
        // WHEN: Login and navigate to companies
        await performRealLogin(page, frontendUrl, user.email, password);
        await page.goto(`${frontendUrl}/companies`, {
          waitUntil: "domcontentloaded",
        });

        // THEN: Page should load
        await expect(
          page.getByRole("heading", { name: /companies/i }),
        ).toBeVisible({ timeout: 10000 });

        // Wait for API requests to complete
        await page.waitForLoadState("networkidle");

        // THEN: No 401/403 errors should occur
        expect(
          apiErrorListener.errors,
          `API returned auth errors: ${apiErrorListener.errors.join(", ")}`,
        ).toHaveLength(0);
      } finally {
        await cleanupTestUser(user.user_id);
      }
    });

    test("AUTH-E2E-SA-003: [P0] superadmin can access users page without 403 errors", async ({
      page,
      frontendUrl,
      prismaClient,
    }) => {
      // GIVEN: Create a test superadmin user
      const password = "TestSuperAdmin123!";
      const passwordHash = await bcrypt.hash(password, 10);
      const userData = createUser({
        email: `test-sa3-${shortId()}@test.nuvana.local`,
        password_hash: passwordHash,
        auth_provider_id: null, // Local auth user (not OAuth)
      });
      const user = await prismaClient.user.create({ data: userData });

      const role = await prismaClient.role.findUnique({
        where: { code: "SUPERADMIN" },
      });
      expect(role, "SUPERADMIN role must exist").not.toBeNull();

      await withBypassClient(async (bypassClient) => {
        await bypassClient.userRole.create({
          data: { user_id: user.user_id, role_id: role!.role_id },
        });
      });

      const apiErrorListener = setupApiErrorListener(page);

      try {
        // WHEN: Login and navigate to admin users page
        await performRealLogin(page, frontendUrl, user.email, password);
        await page.goto(`${frontendUrl}/admin/users`, {
          waitUntil: "domcontentloaded",
        });

        // THEN: Page should load (check for Users header or table)
        await expect(
          page.getByRole("heading", { name: /user/i }).first(),
        ).toBeVisible({ timeout: 10000 });

        // Wait for API requests to complete
        await page.waitForLoadState("networkidle");

        // THEN: No 401/403 errors should occur
        expect(
          apiErrorListener.errors,
          `API returned auth errors: ${apiErrorListener.errors.join(", ")}`,
        ).toHaveLength(0);
      } finally {
        await cleanupTestUser(user.user_id);
      }
    });

    test("AUTH-E2E-SA-004: [P0] superadmin can access stores page without 403 errors", async ({
      page,
      frontendUrl,
      prismaClient,
    }) => {
      // GIVEN: Create a test superadmin user
      const password = "TestSuperAdmin123!";
      const passwordHash = await bcrypt.hash(password, 10);
      const userData = createUser({
        email: `test-sa4-${shortId()}@test.nuvana.local`,
        password_hash: passwordHash,
        auth_provider_id: null, // Local auth user (not OAuth)
      });
      const user = await prismaClient.user.create({ data: userData });

      const role = await prismaClient.role.findUnique({
        where: { code: "SUPERADMIN" },
      });
      expect(role, "SUPERADMIN role must exist").not.toBeNull();

      await withBypassClient(async (bypassClient) => {
        await bypassClient.userRole.create({
          data: { user_id: user.user_id, role_id: role!.role_id },
        });
      });

      const apiErrorListener = setupApiErrorListener(page);

      try {
        // WHEN: Login and navigate to stores
        await performRealLogin(page, frontendUrl, user.email, password);
        await page.goto(`${frontendUrl}/stores`, {
          waitUntil: "domcontentloaded",
        });

        // THEN: Page should load
        await expect(page.getByRole("heading", { name: /store/i })).toBeVisible(
          { timeout: 10000 },
        );

        // Wait for API requests to complete
        await page.waitForLoadState("networkidle");

        // THEN: No 401/403 errors should occur
        expect(
          apiErrorListener.errors,
          `API returned auth errors: ${apiErrorListener.errors.join(", ")}`,
        ).toHaveLength(0);
      } finally {
        await cleanupTestUser(user.user_id);
      }
    });
  });

  test.describe.serial("AUTH-E2E-CO: Client Owner Dashboard Access", () => {
    test("AUTH-E2E-CO-001: [P0] client owner can login and access client dashboard without 403 errors", async ({
      page,
      frontendUrl,
      prismaClient,
    }) => {
      // GIVEN: Create a test client owner user with company
      const password = "TestClientOwner123!";
      const passwordHash = await bcrypt.hash(password, 10);
      const testId = shortId();
      const userData = createUser({
        email: `test-co1-${testId}@test.nuvana.local`,
        password_hash: passwordHash,
        auth_provider_id: null, // Local auth user (not OAuth)
        is_client_user: true, // Mark as client user
      });
      const user = await prismaClient.user.create({
        data: userData as Parameters<
          typeof prismaClient.user.create
        >[0]["data"],
      });

      const company = await prismaClient.company.create({
        data: {
          name: `Test Co ${testId}`,
          public_id: `TCO1${testId}`.substring(0, 30), // Max 30 chars
          owner_user_id: user.user_id,
          status: "ACTIVE",
        },
      });

      const role = await prismaClient.role.findUnique({
        where: { code: "CLIENT_OWNER" },
      });
      expect(role, "CLIENT_OWNER role must exist").not.toBeNull();

      await withBypassClient(async (bypassClient) => {
        await bypassClient.userRole.create({
          data: {
            user_id: user.user_id,
            role_id: role!.role_id,
            company_id: company.company_id,
          },
        });
      });

      const apiErrorListener = setupApiErrorListener(page);

      try {
        // WHEN: Performing real login via client login
        await performRealLogin(page, frontendUrl, user.email, password, true);

        // THEN: Should land on client dashboard
        await expect(page).toHaveURL(/\/client-dashboard/, { timeout: 15000 });

        // THEN: Client dashboard should load without errors
        // Check for the dashboard page container and KPI section
        await expect(
          page.locator('[data-testid="client-dashboard-page"]'),
        ).toBeVisible({ timeout: 10000 });

        // AND: KPI section should be visible (indicates successful data load)
        await expect(page.locator('[data-testid="kpi-section"]')).toBeVisible({
          timeout: 10000,
        });

        // Wait for API requests to complete
        await page.waitForLoadState("networkidle");

        // THEN: No 401/403 errors should occur
        expect(
          apiErrorListener.errors,
          `API returned auth errors: ${apiErrorListener.errors.join(", ")}`,
        ).toHaveLength(0);
      } finally {
        await cleanupTestUser(user.user_id, company.company_id);
      }
    });

    test("AUTH-E2E-CO-002: [P1] client owner should NOT access superadmin dashboard", async ({
      page,
      frontendUrl,
      prismaClient,
    }) => {
      // GIVEN: Create a test client owner user
      const password = "TestClientOwner123!";
      const passwordHash = await bcrypt.hash(password, 10);
      const testId = shortId();
      const userData = createUser({
        email: `test-co2-${testId}@test.nuvana.local`,
        password_hash: passwordHash,
        auth_provider_id: null, // Local auth user (not OAuth)
        is_client_user: true, // Mark as client user
      });
      const user = await prismaClient.user.create({
        data: userData as Parameters<
          typeof prismaClient.user.create
        >[0]["data"],
      });

      const company = await prismaClient.company.create({
        data: {
          name: `Test Co ${testId}`,
          public_id: `TCO2${testId}`.substring(0, 30), // Max 30 chars
          owner_user_id: user.user_id,
          status: "ACTIVE",
        },
      });

      const role = await prismaClient.role.findUnique({
        where: { code: "CLIENT_OWNER" },
      });
      expect(role, "CLIENT_OWNER role must exist").not.toBeNull();

      await withBypassClient(async (bypassClient) => {
        await bypassClient.userRole.create({
          data: {
            user_id: user.user_id,
            role_id: role!.role_id,
            company_id: company.company_id,
          },
        });
      });

      try {
        // WHEN: Login and try to access superadmin dashboard
        await performRealLogin(page, frontendUrl, user.email, password, true);
        await page.goto(`${frontendUrl}/dashboard`, {
          waitUntil: "domcontentloaded",
        });

        // Wait for potential redirect (dashboard layout redirects CLIENT_OWNER to client-dashboard)
        // The redirect happens in a useEffect, so we use waitForURL with a pattern that accepts any redirect
        // CLIENT_OWNER should be redirected to /client-dashboard
        try {
          // Wait for redirect to client-dashboard, login, or an error page
          await page.waitForURL(
            (url) =>
              url.pathname.includes("client-dashboard") ||
              url.pathname.includes("login") ||
              !url.pathname.startsWith("/dashboard"),
            { timeout: 10000 },
          );
        } catch {
          // If timeout, check current state - might still be on /dashboard with error shown
        }

        // THEN: Should be redirected away or show access denied
        // The dashboard layout should redirect CLIENT_OWNER users to /client-dashboard
        const currentUrl = page.url();
        const url = new URL(currentUrl);
        // Check if redirected: either to /client-dashboard, /login, or away from /dashboard entirely
        // Note: /client-dashboard pathname is "/client-dashboard", /dashboard pathname is "/dashboard"
        const isAtClientDashboard =
          url.pathname.startsWith("/client-dashboard");
        const isAtLogin = url.pathname.includes("login");
        const isNotAtSuperadminDashboard =
          !url.pathname.startsWith("/dashboard");
        const redirectedAway =
          isAtClientDashboard || isAtLogin || isNotAtSuperadminDashboard;
        const hasError = await page.getByText(/denied|forbidden|403/i).count();

        expect(
          redirectedAway || hasError > 0,
          `Client owner should not access superadmin dashboard. Current URL: ${currentUrl}, pathname: ${url.pathname}`,
        ).toBeTruthy();
      } finally {
        await cleanupTestUser(user.user_id, company.company_id);
      }
    });
  });

  test.describe.serial("AUTH-E2E-NR: User Without Roles", () => {
    test("AUTH-E2E-NR-001: [P0] user with no roles should be denied access to protected pages", async ({
      page,
      frontendUrl,
      prismaClient,
    }) => {
      // GIVEN: Create a user with NO role assignments
      const password = "TestNoRole123!";
      const passwordHash = await bcrypt.hash(password, 10);
      const userData = createUser({
        email: `test-nr-${shortId()}@test.nuvana.local`,
        password_hash: passwordHash,
        auth_provider_id: null, // Local auth user (not OAuth)
      });
      const user = await prismaClient.user.create({ data: userData });

      // Deliberately NOT assigning any role
      const apiErrorListener = setupApiErrorListener(page);

      try {
        // WHEN: Login and access protected page
        await performRealLogin(page, frontendUrl, user.email, password);
        await page.goto(`${frontendUrl}/companies`, {
          waitUntil: "domcontentloaded",
        });

        // Wait for API requests to complete
        await page.waitForLoadState("networkidle");

        // THEN: Should either get 401/403 from API OR be redirected to login
        // (Frontend may redirect unauthorized users instead of showing errors)
        const currentUrl = page.url();
        const redirectedToLogin = currentUrl.includes("login");
        const gotAuthErrors = apiErrorListener.errors.length > 0;

        expect(
          redirectedToLogin || gotAuthErrors,
          `User without roles should be denied access - got auth errors: ${gotAuthErrors}, redirected: ${redirectedToLogin}`,
        ).toBeTruthy();
      } finally {
        await cleanupTestUser(user.user_id);
      }
    });
  });
});

test.describe.serial("AUTH-E2E-SEED: Seeded User Login Verification", () => {
  // These tests verify that the actual seeded users can log in and access their dashboards
  // This catches issues where seed data is incorrect or roles weren't properly assigned

  test("AUTH-E2E-SEED-001: [P0] admin@nuvana.com can login and access superadmin dashboard", async ({
    page,
  }) => {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const apiErrorListener = setupApiErrorListener(page);

    // WHEN: Login as the seeded admin user
    await performRealLogin(page, frontendUrl, "admin@nuvana.com", "Admin123!");

    // THEN: Should land on dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    // THEN: Dashboard should show correct heading
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible(
      { timeout: 10000 },
    );

    // Navigate to companies to verify access
    await page.goto(`${frontendUrl}/companies`, {
      waitUntil: "domcontentloaded",
    });

    // Wait for API requests to complete
    await page.waitForLoadState("networkidle");

    // THEN: No 401/403 errors should occur
    expect(
      apiErrorListener.errors,
      `Seeded admin user got auth errors: ${apiErrorListener.errors.join(", ")}`,
    ).toHaveLength(0);
  });

  // Skip: Password for seeded client user is unknown
  // Dynamic client owner tests above cover this scenario
  test.skip("AUTH-E2E-SEED-002: [P0] seeded CLIENT_OWNER can login and access client dashboard", async ({
    page,
  }) => {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const apiErrorListener = setupApiErrorListener(page);

    await performRealLogin(
      page,
      frontendUrl,
      "kfpllcusa@gmail.com",
      "Client123!", // Password unknown - test skipped
      true,
    );

    await expect(page).toHaveURL(/\/client-dashboard/, { timeout: 15000 });

    // THEN: Client dashboard should load with welcome heading
    await expect(
      page.getByRole("heading", { name: /welcome back/i }),
    ).toBeVisible({ timeout: 10000 });

    // Wait for API requests to complete
    await page.waitForLoadState("networkidle");

    expect(
      apiErrorListener.errors,
      `Seeded client owner got auth errors: ${apiErrorListener.errors.join(", ")}`,
    ).toHaveLength(0);
  });
});
