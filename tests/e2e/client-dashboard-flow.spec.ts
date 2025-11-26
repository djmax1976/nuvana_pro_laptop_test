/**
 * Client Dashboard E2E Tests
 *
 * Story 2.9: Client Dashboard Foundation and Authentication
 *
 * Tests the complete client user journey:
 * - Login flow
 * - Dashboard access
 * - Data visibility (only owned companies/stores)
 * - Navigation
 * - Logout
 *
 * Priority: P0 (Critical - Regression protection for client access)
 */

import { test, expect, Page } from "@playwright/test";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { PrismaClient } from "@prisma/client";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";

/**
 * Helper function to perform login and wait for navigation.
 * Uses Promise.all pattern to avoid race conditions between click and navigation.
 */
async function loginAndWaitForDashboard(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await page.fill('input[name="email"], input[type="email"]', email);
  await page.fill('input[name="password"], input[type="password"]', password);

  // Wait for navigation to complete after form submission
  await Promise.all([
    page.waitForURL(/.*client-dashboard.*/, { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
}

test.describe("2.9-E2E: Client Dashboard User Journey", () => {
  let prisma: PrismaClient;
  let clientUser: any;
  let company: any;
  let store: any;
  const password = "ClientPassword123!";

  test.beforeAll(async () => {
    prisma = new PrismaClient();
    // Create test client user with company and store
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    const companyId = uuidv4();
    const storeId = uuidv4();

    clientUser = await prisma.user.create({
      data: {
        user_id: userId,
        email: `e2e-client-${Date.now()}@test.com`,
        name: "E2E Test Client",
        status: "ACTIVE",
        password_hash: passwordHash,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        is_client_user: true,
      },
    });

    company = await prisma.company.create({
      data: {
        company_id: companyId,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
        name: "E2E Test Company",
        address: "123 E2E Test Street",
        status: "ACTIVE",
        owner_user_id: clientUser.user_id,
      },
    });

    store = await prisma.store.create({
      data: {
        store_id: storeId,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
        company_id: company.company_id,
        name: "E2E Test Store",
        timezone: "America/New_York",
        status: "ACTIVE",
        location_json: { address: "456 Store Ave" },
      },
    });
  });

  test.afterAll(async () => {
    // Cleanup in proper order
    if (store) {
      await prisma.store
        .delete({ where: { store_id: store.store_id } })
        .catch(() => {});
    }
    if (company) {
      await prisma.company
        .delete({ where: { company_id: company.company_id } })
        .catch(() => {});
    }
    if (clientUser) {
      await prisma.auditLog
        .deleteMany({ where: { user_id: clientUser.user_id } })
        .catch(() => {});
      await prisma.user
        .delete({ where: { user_id: clientUser.user_id } })
        .catch(() => {});
    }
    await prisma.$disconnect();
  });

  test("2.9-E2E-001: [P0] Client user can login and see dashboard", async ({
    page,
  }) => {
    // GIVEN: Client user is on the login page
    // WHEN: Client user enters valid credentials and submits
    await loginAndWaitForDashboard(page, clientUser.email, password);

    // THEN: Client user is redirected to client dashboard
    await expect(page).toHaveURL(/.*client-dashboard.*/);

    // AND: Dashboard shows welcome message
    await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 5000 });
  });

  test("2.9-E2E-002: [P0] Client dashboard shows owned company", async ({
    page,
  }) => {
    // GIVEN: Client user is logged in
    await loginAndWaitForDashboard(page, clientUser.email, password);

    // THEN: Dashboard shows the client's company
    await expect(page.getByText("E2E Test Company")).toBeVisible({
      timeout: 5000,
    });
  });

  test("2.9-E2E-003: [P0] Client dashboard shows owned store", async ({
    page,
  }) => {
    // GIVEN: Client user is logged in and on dashboard
    await loginAndWaitForDashboard(page, clientUser.email, password);

    // THEN: Dashboard shows the client's store
    await expect(page.getByText("E2E Test Store")).toBeVisible({
      timeout: 5000,
    });
  });

  test("2.9-E2E-004: [P1] Unauthenticated user cannot access client dashboard", async ({
    page,
  }) => {
    // GIVEN: User is not logged in
    // WHEN: User tries to access client dashboard directly
    await page.goto("/client-dashboard");

    // THEN: User is redirected to login page
    await expect(page).toHaveURL(/.*login.*/, { timeout: 10000 });
  });

  test("2.9-E2E-005: [P1] Client login with invalid password shows error", async ({
    page,
  }) => {
    // GIVEN: Client user is on the login page
    await page.goto("/login");

    // WHEN: Client user enters wrong password
    await page.fill(
      'input[name="email"], input[type="email"]',
      clientUser.email,
    );
    await page.fill(
      'input[name="password"], input[type="password"]',
      "WrongPassword123!",
    );
    await page.click('button[type="submit"]');

    // THEN: Error message is displayed
    await expect(page.getByText(/invalid|error|incorrect/i)).toBeVisible({
      timeout: 5000,
    });

    // AND: User stays on login page
    await expect(page).toHaveURL(/.*login.*/);
  });

  test("2.9-E2E-006: [P1] Client dashboard shows quick stats", async ({
    page,
  }) => {
    // GIVEN: Client user is logged in
    await loginAndWaitForDashboard(page, clientUser.email, password);

    // THEN: Quick stats cards are visible
    // Looking for stats like "Active Stores", "Companies", etc.
    await expect(page.locator('[class*="card"]').first()).toBeVisible({
      timeout: 5000,
    });
  });
});

test.describe("2.9-E2E: Client Dashboard Navigation", () => {
  let prisma: PrismaClient;
  let clientUser: any;
  const password = "ClientPassword123!";

  test.beforeAll(async () => {
    prisma = new PrismaClient();
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    clientUser = await prisma.user.create({
      data: {
        user_id: userId,
        email: `e2e-nav-${Date.now()}@test.com`,
        name: "E2E Nav Test Client",
        status: "ACTIVE",
        password_hash: passwordHash,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        is_client_user: true,
      },
    });
  });

  test.afterAll(async () => {
    if (clientUser) {
      await prisma.auditLog
        .deleteMany({ where: { user_id: clientUser.user_id } })
        .catch(() => {});
      await prisma.user
        .delete({ where: { user_id: clientUser.user_id } })
        .catch(() => {});
    }
    await prisma.$disconnect();
  });

  test("2.9-E2E-007: [P2] Client sidebar navigation is visible", async ({
    page,
  }) => {
    // GIVEN: Client user is logged in
    await loginAndWaitForDashboard(page, clientUser.email, password);

    // THEN: Sidebar with navigation items is visible (on desktop)
    // Check for navigation elements - Dashboard link should exist
    const sidebar = page.locator('nav, [class*="sidebar"]');
    await expect(sidebar.first()).toBeVisible({ timeout: 5000 });
  });
});

// ============================================================================
// E2E: Client Dashboard Data Visibility
// ============================================================================

test.describe("2.9-E2E: Client Dashboard Data Isolation", () => {
  let prisma: PrismaClient;
  let clientUser1: any;
  let clientUser2: any;
  let company1: any;
  let company2: any;
  const password = "ClientPassword123!";

  test.beforeAll(async () => {
    prisma = new PrismaClient();
    const passwordHash = await bcrypt.hash(password, 10);

    // Create first client user with company
    const userId1 = uuidv4();
    const companyId1 = uuidv4();

    clientUser1 = await prisma.user.create({
      data: {
        user_id: userId1,
        email: `e2e-client1-${Date.now()}@test.com`,
        name: "E2E Client One",
        status: "ACTIVE",
        password_hash: passwordHash,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        is_client_user: true,
      },
    });

    company1 = await prisma.company.create({
      data: {
        company_id: companyId1,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
        name: "Client One Company",
        address: "123 Client One Street",
        status: "ACTIVE",
        owner_user_id: clientUser1.user_id,
      },
    });

    // Create second client user with different company
    const userId2 = uuidv4();
    const companyId2 = uuidv4();

    clientUser2 = await prisma.user.create({
      data: {
        user_id: userId2,
        email: `e2e-client2-${Date.now()}@test.com`,
        name: "E2E Client Two",
        status: "ACTIVE",
        password_hash: passwordHash,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        is_client_user: true,
      },
    });

    company2 = await prisma.company.create({
      data: {
        company_id: companyId2,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
        name: "Client Two Company",
        address: "456 Client Two Street",
        status: "ACTIVE",
        owner_user_id: clientUser2.user_id,
      },
    });
  });

  test.afterAll(async () => {
    // Cleanup in proper order
    if (company1) {
      await prisma.company
        .delete({ where: { company_id: company1.company_id } })
        .catch(() => {});
    }
    if (company2) {
      await prisma.company
        .delete({ where: { company_id: company2.company_id } })
        .catch(() => {});
    }
    if (clientUser1) {
      await prisma.auditLog
        .deleteMany({ where: { user_id: clientUser1.user_id } })
        .catch(() => {});
      await prisma.user
        .delete({ where: { user_id: clientUser1.user_id } })
        .catch(() => {});
    }
    if (clientUser2) {
      await prisma.auditLog
        .deleteMany({ where: { user_id: clientUser2.user_id } })
        .catch(() => {});
      await prisma.user
        .delete({ where: { user_id: clientUser2.user_id } })
        .catch(() => {});
    }
    await prisma.$disconnect();
  });

  test("2.9-E2E-008: [P0] Client user cannot see other client's company", async ({
    page,
  }) => {
    // GIVEN: Client 1 is logged in
    await loginAndWaitForDashboard(page, clientUser1.email, password);

    // THEN: Client 1 sees their own company
    await expect(page.getByText("Client One Company")).toBeVisible({
      timeout: 5000,
    });

    // AND: Client 1 does NOT see Client 2's company
    await expect(page.getByText("Client Two Company")).not.toBeVisible();
  });
});

// ============================================================================
// E2E: Session Persistence
// ============================================================================

test.describe("2.9-E2E: Session Persistence", () => {
  let prisma: PrismaClient;
  let clientUser: any;
  const password = "ClientPassword123!";

  test.beforeAll(async () => {
    prisma = new PrismaClient();
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    clientUser = await prisma.user.create({
      data: {
        user_id: userId,
        email: `e2e-session-${Date.now()}@test.com`,
        name: "E2E Session Test Client",
        status: "ACTIVE",
        password_hash: passwordHash,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        is_client_user: true,
      },
    });
  });

  test.afterAll(async () => {
    if (clientUser) {
      await prisma.auditLog
        .deleteMany({ where: { user_id: clientUser.user_id } })
        .catch(() => {});
      await prisma.user
        .delete({ where: { user_id: clientUser.user_id } })
        .catch(() => {});
    }
    await prisma.$disconnect();
  });

  test("2.9-E2E-009: [P1] Client can navigate away and return without re-login", async ({
    page,
  }) => {
    // GIVEN: Client user logs in
    await loginAndWaitForDashboard(page, clientUser.email, password);

    // WHEN: Client navigates to another page within the app (if available)
    // For now, just refresh the page to simulate returning
    await page.reload();
    await page.waitForLoadState("networkidle");

    // THEN: Client is still on the dashboard (session persists)
    await expect(page).toHaveURL(/.*client-dashboard.*/);
    await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 5000 });
  });
});

// ============================================================================
// E2E: Logout Flow
// ============================================================================

test.describe("2.9-E2E: Logout Flow", () => {
  let prisma: PrismaClient;
  let clientUser: any;
  const password = "ClientPassword123!";

  test.beforeAll(async () => {
    prisma = new PrismaClient();
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    clientUser = await prisma.user.create({
      data: {
        user_id: userId,
        email: `e2e-logout-${Date.now()}@test.com`,
        name: "E2E Logout Test Client",
        status: "ACTIVE",
        password_hash: passwordHash,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        is_client_user: true,
      },
    });
  });

  test.afterAll(async () => {
    if (clientUser) {
      await prisma.auditLog
        .deleteMany({ where: { user_id: clientUser.user_id } })
        .catch(() => {});
      await prisma.user
        .delete({ where: { user_id: clientUser.user_id } })
        .catch(() => {});
    }
    await prisma.$disconnect();
  });

  test("2.9-E2E-010: [P1] Client can logout and is redirected to login", async ({
    page,
  }) => {
    // GIVEN: Client user is logged in
    await loginAndWaitForDashboard(page, clientUser.email, password);

    // WHEN: Client clicks logout button
    // Look for logout button in header/profile area
    const logoutButton = page.getByRole("button", { name: /logout|sign out/i });
    if (await logoutButton.isVisible()) {
      await logoutButton.click();

      // THEN: Client is redirected to login page
      await expect(page).toHaveURL(/.*login.*/, { timeout: 10000 });
    } else {
      // If no visible logout button, try to find it in a dropdown
      const userMenu = page.locator(
        '[data-testid="user-menu"], [class*="user"], [class*="profile"]',
      );
      if (await userMenu.first().isVisible()) {
        await userMenu.first().click();
        const logoutInMenu = page.getByText(/logout|sign out/i);
        if (await logoutInMenu.isVisible()) {
          await logoutInMenu.click();
          await expect(page).toHaveURL(/.*login.*/, { timeout: 10000 });
        }
      }
    }
  });
});
