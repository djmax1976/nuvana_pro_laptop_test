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

import { test, expect } from "@playwright/test";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { PrismaClient } from "@prisma/client";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";

const prisma = new PrismaClient();

test.describe("2.9-E2E: Client Dashboard User Journey", () => {
  let clientUser: any;
  let company: any;
  let store: any;
  const password = "ClientPassword123!";

  test.beforeAll(async () => {
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
    await page.goto("/login");

    // WHEN: Client user enters valid credentials
    await page.fill(
      'input[name="email"], input[type="email"]',
      clientUser.email,
    );
    await page.fill('input[name="password"], input[type="password"]', password);
    await page.click('button[type="submit"]');

    // THEN: Client user is redirected to client dashboard
    await expect(page).toHaveURL(/.*client-dashboard.*/, { timeout: 10000 });

    // AND: Dashboard shows welcome message
    await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 5000 });
  });

  test("2.9-E2E-002: [P0] Client dashboard shows owned company", async ({
    page,
  }) => {
    // GIVEN: Client user is logged in
    await page.goto("/login");
    await page.fill(
      'input[name="email"], input[type="email"]',
      clientUser.email,
    );
    await page.fill('input[name="password"], input[type="password"]', password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*client-dashboard.*/, { timeout: 10000 });

    // THEN: Dashboard shows the client's company
    await expect(page.getByText("E2E Test Company")).toBeVisible({
      timeout: 5000,
    });
  });

  test("2.9-E2E-003: [P0] Client dashboard shows owned store", async ({
    page,
  }) => {
    // GIVEN: Client user is logged in and on dashboard
    await page.goto("/login");
    await page.fill(
      'input[name="email"], input[type="email"]',
      clientUser.email,
    );
    await page.fill('input[name="password"], input[type="password"]', password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*client-dashboard.*/, { timeout: 10000 });

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
    await page.goto("/login");
    await page.fill(
      'input[name="email"], input[type="email"]',
      clientUser.email,
    );
    await page.fill('input[name="password"], input[type="password"]', password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*client-dashboard.*/, { timeout: 10000 });

    // THEN: Quick stats cards are visible
    // Looking for stats like "Active Stores", "Companies", etc.
    await expect(page.locator('[class*="card"]').first()).toBeVisible({
      timeout: 5000,
    });
  });
});

test.describe("2.9-E2E: Client Dashboard Navigation", () => {
  let clientUser: any;
  const password = "ClientPassword123!";

  test.beforeAll(async () => {
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
    await page.goto("/login");
    await page.fill(
      'input[name="email"], input[type="email"]',
      clientUser.email,
    );
    await page.fill('input[name="password"], input[type="password"]', password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*client-dashboard.*/, { timeout: 10000 });

    // THEN: Sidebar with navigation items is visible (on desktop)
    // Check for navigation elements - Dashboard link should exist
    const sidebar = page.locator('nav, [class*="sidebar"]');
    await expect(sidebar.first()).toBeVisible({ timeout: 5000 });
  });
});
