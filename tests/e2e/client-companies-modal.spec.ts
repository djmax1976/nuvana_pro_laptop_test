import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";

const prisma = new PrismaClient();

/**
 * Client Companies Modal E2E Tests
 *
 * Tests for the company list modal functionality:
 * - Company count display and clickability in client list
 * - Company count display and clickability in client detail page
 * - Modal shows correct company names
 * - Modal handles empty state (no companies)
 * - Modal can be closed
 *
 * Priority: P1 (Important - UX enhancement)
 *
 * Related Story: Client Management Enhancement - Company List Modal
 */

test.describe("Client Companies Modal E2E", () => {
  let superadminUser: any;
  let testClientWithCompanies: any;
  let testClientNoCompanies: any;
  let testCompany1: any;
  let testCompany2: any;

  test.beforeAll(async () => {
    // Clean up any existing test data first
    await prisma.user.deleteMany({
      where: { email: "superadmin-companies-modal@test.com" },
    });

    // Create superadmin user for testing
    const hashedPassword = await bcrypt.hash("TestPassword123!", 10);

    superadminUser = await prisma.user.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        email: "superadmin-companies-modal@test.com",
        name: "Superadmin Companies Modal Tester",
        password_hash: hashedPassword,
        status: "ACTIVE",
      },
    });

    // Assign SUPERADMIN role
    const superadminRole = await prisma.role.findUnique({
      where: { code: "SUPERADMIN" },
    });

    if (superadminRole) {
      await prisma.userRole.create({
        data: {
          user_id: superadminUser.user_id,
          role_id: superadminRole.role_id,
          assigned_by: superadminUser.user_id,
        },
      });
    }

    // Create test client with companies
    testClientWithCompanies = await prisma.client.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.CLIENT),
        name: "Client With Companies",
        email: "client-with-companies@test.com",
        status: "ACTIVE",
      },
    });

    // Create test client without companies
    testClientNoCompanies = await prisma.client.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.CLIENT),
        name: "Client No Companies",
        email: "client-no-companies@test.com",
        status: "ACTIVE",
      },
    });

    // Create test companies for the first client
    testCompany1 = await prisma.company.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
        name: "Alpha Company",
        client_id: testClientWithCompanies.client_id,
        status: "ACTIVE",
      },
    });

    testCompany2 = await prisma.company.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
        name: "Beta Company",
        client_id: testClientWithCompanies.client_id,
        status: "ACTIVE",
      },
    });
  });

  test.afterAll(async () => {
    // Cleanup: Delete test data
    if (testCompany1) {
      await prisma.company.delete({
        where: { company_id: testCompany1.company_id },
      });
    }
    if (testCompany2) {
      await prisma.company.delete({
        where: { company_id: testCompany2.company_id },
      });
    }
    if (testClientWithCompanies) {
      await prisma.client.delete({
        where: { client_id: testClientWithCompanies.client_id },
      });
    }
    if (testClientNoCompanies) {
      await prisma.client.delete({
        where: { client_id: testClientNoCompanies.client_id },
      });
    }
    if (superadminUser) {
      await prisma.userRole.deleteMany({
        where: { user_id: superadminUser.user_id },
      });
      await prisma.user.delete({
        where: { user_id: superadminUser.user_id },
      });
    }

    await prisma.$disconnect();
  });

  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto("http://localhost:3000/login");
    await page.fill(
      'input[type="email"]',
      "superadmin-companies-modal@test.com",
    );
    await page.fill('input[type="password"]', "TestPassword123!");
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForURL("**/dashboard");
  });

  test("[P0] Should display clickable company count in client list", async ({
    page,
  }) => {
    // WHEN: Navigate to clients page
    await page.goto("http://localhost:3000/clients");
    await page.waitForSelector("table");

    // THEN: Company count button should be visible and clickable
    const companyCountButton = page.locator(
      `[data-testid="client-company-count-button-${testClientWithCompanies.client_id}"]`,
    );
    await expect(companyCountButton).toBeVisible();
    await expect(companyCountButton).toHaveText("2");
  });

  test("[P0] Should open modal when clicking company count in list", async ({
    page,
  }) => {
    // GIVEN: On clients page
    await page.goto("http://localhost:3000/clients");
    await page.waitForSelector("table");

    // WHEN: Click company count button
    const companyCountButton = page.locator(
      `[data-testid="client-company-count-button-${testClientWithCompanies.client_id}"]`,
    );
    await companyCountButton.click();

    // THEN: Modal should be visible with company list
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await expect(
      page.locator("text=Companies - Client With Companies"),
    ).toBeVisible();
    await expect(
      page.locator("text=2 companies associated with this client"),
    ).toBeVisible();
  });

  test("[P0] Should display company names in modal", async ({ page }) => {
    // GIVEN: On clients page
    await page.goto("http://localhost:3000/clients");
    await page.waitForSelector("table");

    // WHEN: Click company count and modal opens
    const companyCountButton = page.locator(
      `[data-testid="client-company-count-button-${testClientWithCompanies.client_id}"]`,
    );
    await companyCountButton.click();

    // THEN: Both company names should be visible
    await expect(page.locator("text=Alpha Company")).toBeVisible();
    await expect(page.locator("text=Beta Company")).toBeVisible();
  });

  test("[P0] Should close modal when clicking outside or close button", async ({
    page,
  }) => {
    // GIVEN: Modal is open
    await page.goto("http://localhost:3000/clients");
    await page.waitForSelector("table");
    const companyCountButton = page.locator(
      `[data-testid="client-company-count-button-${testClientWithCompanies.client_id}"]`,
    );
    await companyCountButton.click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // WHEN: Press Escape key
    await page.keyboard.press("Escape");

    // THEN: Modal should be closed
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  });

  test("[P0] Should show empty state for client with no companies", async ({
    page,
  }) => {
    // GIVEN: On clients page
    await page.goto("http://localhost:3000/clients");
    await page.waitForSelector("table");

    // WHEN: Click company count for client with no companies
    const companyCountButton = page.locator(
      `[data-testid="client-company-count-button-${testClientNoCompanies.client_id}"]`,
    );
    await expect(companyCountButton).toHaveText("0");
    await companyCountButton.click();

    // THEN: Modal should show empty state
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await expect(
      page.locator("text=No companies associated with this client"),
    ).toBeVisible();
    await expect(page.locator("text=No companies found")).toBeVisible();
  });

  test("[P0] Should display company count on client detail page", async ({
    page,
  }) => {
    // WHEN: Navigate to client detail page
    await page.goto(
      `http://localhost:3000/clients/${testClientWithCompanies.public_id}`,
    );

    // THEN: Company count should be visible and clickable
    const companiesButton = page.locator(
      '[data-testid="client-companies-list"]',
    );
    await expect(companiesButton).toBeVisible();
    await expect(companiesButton).toContainText("2 companies");
  });

  test("[P0] Should open modal from client detail page", async ({ page }) => {
    // GIVEN: On client detail page
    await page.goto(
      `http://localhost:3000/clients/${testClientWithCompanies.public_id}`,
    );

    // WHEN: Click company count
    const companiesButton = page.locator(
      '[data-testid="client-companies-list"]',
    );
    await companiesButton.click();

    // THEN: Modal should open with companies
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await expect(page.locator("text=Alpha Company")).toBeVisible();
    await expect(page.locator("text=Beta Company")).toBeVisible();
  });
});
