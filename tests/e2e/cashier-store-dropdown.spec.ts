/**
 * E2E Test: Cashier Store Dropdown
 *
 * Tests the cashier creation flow with store dropdown functionality.
 * Optimized for speed: single login, consolidated assertions, no redundant tests.
 *
 * @test-level E2E
 * @story 4.9 - Cashier Management
 * @priority P0 (Critical - Core Cashier Creation Flow)
 */

import {
  test,
  expect,
  type Page,
  type BrowserContext,
  type Response,
} from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";
import { cleanupTestData } from "../support/cleanup-helper";
import { createStore, createCompany } from "../support/factories";
import { TEST_CONSTANTS } from "../support/test-config";

const prisma = new PrismaClient();
const TEST_PASSWORD = TEST_CONSTANTS.TEST_PASSWORD;

// Lean timeouts - fail fast, don't pad for slow infra
const TIMEOUTS = {
  ELEMENT: 10000,
  API: 15000,
  NAVIGATION: 15000,
} as const;

let testUser: { user_id: string; email: string };
let testCompany: { company_id: string };
let testStore: { store_id: string; name: string };
let testEmail: string;
let authContext: BrowserContext;
const createdCashierIds: string[] = [];

/**
 * Login once and save browser context for reuse across all tests.
 * This eliminates redundant login overhead.
 */
async function loginAndSaveContext(browser: any): Promise<BrowserContext> {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("/login", { waitUntil: "networkidle" });

  // Wait for form to be interactive (React hydration complete)
  const emailInput = page.locator('input[name="email"], input[type="email"]');
  await emailInput.waitFor({ state: "visible", timeout: TIMEOUTS.ELEMENT });
  await expect(emailInput).toBeEditable({ timeout: TIMEOUTS.ELEMENT });

  // Fill credentials - use type() for more reliable React form handling
  await emailInput.click();
  await emailInput.pressSequentially(testEmail, { delay: 10 });

  const passwordInput = page.locator(
    'input[name="password"], input[type="password"]',
  );
  await passwordInput.click();
  await passwordInput.pressSequentially(TEST_PASSWORD, { delay: 10 });

  // Verify fields were filled (guards against hydration reset)
  await expect(emailInput).toHaveValue(testEmail, { timeout: 5000 });
  await expect(passwordInput).toHaveValue(TEST_PASSWORD, { timeout: 5000 });

  // Submit and wait for redirect
  const [loginResponse] = await Promise.all([
    page.waitForResponse(
      (resp: Response) =>
        resp.url().includes("/api/auth/login") &&
        resp.request().method() === "POST",
      { timeout: TIMEOUTS.API },
    ),
    page.locator('button[type="submit"]').click(),
  ]);

  if (loginResponse.status() !== 200) {
    throw new Error(`Login failed: ${loginResponse.status()}`);
  }

  await page.waitForURL(/.*client-dashboard.*/, {
    timeout: TIMEOUTS.NAVIGATION,
  });

  // Wait for dashboard to render (auth context populated)
  await page.locator('[data-testid="client-dashboard-page"]').waitFor({
    state: "visible",
    timeout: TIMEOUTS.ELEMENT,
  });

  await page.close();
  return context;
}

/**
 * Navigate to cashiers page and open add dialog.
 * Lean implementation - no defensive catches or networkidle waits.
 */
async function openAddCashierDialog(page: Page): Promise<void> {
  await page.goto("/client-dashboard/cashiers", {
    waitUntil: "domcontentloaded",
  });

  // Wait for page to render
  const addButton = page.locator('[data-testid="create-cashier-btn"]').first();
  await addButton.waitFor({ state: "visible", timeout: TIMEOUTS.ELEMENT });
  await addButton.click();

  // Wait for dialog
  await page.locator('[data-testid="cashier-name"]').waitFor({
    state: "visible",
    timeout: TIMEOUTS.ELEMENT,
  });
}

test.describe("Cashier Store Dropdown", () => {
  // Serial mode ensures tests share the same worker and thus the same beforeAll context
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ browser }) => {
    // Clean up stale test data
    const existingUsers = await prisma.user.findMany({
      where: { email: { startsWith: "cashier-e2e-" } },
      select: { user_id: true },
    });

    for (const user of existingUsers) {
      await prisma.userRole.deleteMany({ where: { user_id: user.user_id } });
    }
    await prisma.user.deleteMany({
      where: { email: { startsWith: "cashier-e2e-" } },
    });

    // Create test fixtures
    testEmail = `cashier-e2e-${Date.now()}@test.com`;
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

    testUser = await prisma.user.create({
      data: {
        user_id: uuidv4(),
        email: testEmail,
        name: "E2E Cashier Test Client",
        status: "ACTIVE",
        password_hash: passwordHash,
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        is_client_user: true,
      },
    });

    testCompany = await prisma.company.create({
      data: createCompany({
        name: "E2E Test Company for Cashiers",
        status: "ACTIVE",
        owner_user_id: testUser.user_id,
      }),
    });

    testStore = await prisma.store.create({
      data: createStore({
        company_id: testCompany.company_id,
        name: "E2E Cashier Test Store",
        status: "ACTIVE",
      }),
    });

    const clientOwnerRole = await prisma.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    if (clientOwnerRole) {
      await prisma.userRole.create({
        data: {
          user_id: testUser.user_id,
          role_id: clientOwnerRole.role_id,
          company_id: testCompany.company_id,
        },
      });
    }

    // Login ONCE and save context for all tests
    authContext = await loginAndSaveContext(browser);
  });

  test.afterAll(async () => {
    // Cleanup created cashiers
    for (const cashierId of createdCashierIds) {
      await prisma.cashier
        .delete({ where: { cashier_id: cashierId } })
        .catch(() => {});
    }

    if (testStore) {
      await prisma.cashier
        .deleteMany({ where: { store_id: testStore.store_id } })
        .catch(() => {});
    }

    await cleanupTestData(prisma, {
      stores: testStore ? [testStore.store_id] : [],
      companies: testCompany ? [testCompany.company_id] : [],
      users: testUser ? [testUser.user_id] : [],
    });

    await authContext?.close();
    await prisma.$disconnect();
  });

  test("store dropdown shows auto-selected store and is disabled for single store", async () => {
    // Use pre-authenticated context
    const page = await authContext.newPage();

    try {
      await openAddCashierDialog(page);

      const storeDropdown = page.locator('[data-testid="cashier-store"]');

      // Verify dropdown state
      await expect(storeDropdown).toBeVisible({ timeout: TIMEOUTS.ELEMENT });
      await expect(storeDropdown).toBeDisabled();
      await expect(storeDropdown).toContainText(testStore.name);

      // Verify hidden select has correct value (form will submit correctly)
      await expect(async () => {
        const hasValue = await page.evaluate((storeId) => {
          const select = document.querySelector(
            'select[aria-hidden="true"]',
          ) as HTMLSelectElement;
          return select?.value === storeId;
        }, testStore.store_id);
        expect(hasValue).toBe(true);
      }).toPass({ timeout: TIMEOUTS.ELEMENT });
    } finally {
      await page.close();
    }
  });

  test("creates cashier with auto-selected store without validation errors", async () => {
    // Use pre-authenticated context
    const page = await authContext.newPage();

    try {
      await openAddCashierDialog(page);

      // Verify store is pre-selected
      const storeDropdown = page.locator('[data-testid="cashier-store"]');
      await expect(storeDropdown).toContainText(testStore.name);
      await expect(storeDropdown).toBeDisabled();

      // Fill form
      const cashierName = `E2E Test Cashier ${Date.now()}`;
      await page.locator('[data-testid="cashier-name"]').fill(cashierName);
      await page.locator('[data-testid="cashier-pin"]').fill("1234");

      // Submit and verify API response
      const [createResponse] = await Promise.all([
        page.waitForResponse(
          (resp) =>
            resp.url().includes(`/api/stores/${testStore.store_id}/cashiers`) &&
            resp.request().method() === "POST",
          { timeout: TIMEOUTS.API },
        ),
        page.locator('[data-testid="submit-cashier"]').click(),
      ]);

      // Verify success
      expect(createResponse.status()).toBe(201);
      const body = await createResponse.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe(cashierName);
      expect(body.data.store_id).toBe(testStore.store_id);

      createdCashierIds.push(body.data.cashier_id);

      // Verify UI updates
      await expect(page.locator('[data-testid="cashier-name"]')).toBeHidden({
        timeout: TIMEOUTS.ELEMENT,
      });
      await expect(
        page.getByText("Cashier created", { exact: true }),
      ).toBeVisible({
        timeout: TIMEOUTS.ELEMENT,
      });

      // Key assertion: no store validation error
      await expect(page.locator("text=Store is required")).not.toBeVisible();

      // Verify in database
      const created = await prisma.cashier.findUnique({
        where: { cashier_id: body.data.cashier_id },
      });
      expect(created).not.toBeNull();
      expect(created?.store_id).toBe(testStore.store_id);
    } finally {
      await page.close();
    }
  });
});
