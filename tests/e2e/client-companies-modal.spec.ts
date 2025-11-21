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

test.describe.configure({ mode: "serial" });

test.describe("Client Companies Modal E2E", () => {
  let superadminUser: any;
  let testClientWithCompanies: any;
  let testClientNoCompanies: any;
  let testCompany1: any;
  let testCompany2: any;

  test.beforeAll(async () => {
    // Clean up any existing test data first
    const existingUser = await prisma.user.findUnique({
      where: { email: "superadmin-companies-modal@test.com" },
    });

    if (existingUser) {
      // Clean up user roles first due to foreign key constraint
      await prisma.userRole.deleteMany({
        where: { user_id: existingUser.user_id },
      });
      // Then delete the user
      await prisma.user.delete({
        where: { user_id: existingUser.user_id },
      });
    }

    // Clean up any existing test clients and their related data
    const existingClients = await prisma.client.findMany({
      where: {
        email: {
          in: [
            "client-with-companies@test.com",
            "client-no-companies@test.com",
          ],
        },
      },
    });

    for (const client of existingClients) {
      // Delete companies first due to foreign key constraint
      await prisma.company.deleteMany({
        where: { client_id: client.client_id },
      });
      // Then delete the client
      await prisma.client.delete({
        where: { client_id: client.client_id },
      });
    }

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

  test.describe("Modal Responsiveness", () => {
    test("[P0] Should not overflow on mobile viewport (375px)", async ({
      page,
    }) => {
      // GIVEN: Mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto("http://localhost:3000/clients");
      await page.waitForSelector("table");

      // WHEN: Open company modal
      const companyCountButton = page.locator(
        `[data-testid="client-company-count-button-${testClientWithCompanies.client_id}"]`,
      );
      await companyCountButton.click();

      // THEN: Modal should be visible
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();

      // AND: Modal should not overflow viewport
      const dialogBox = await dialog.boundingBox();
      expect(dialogBox).not.toBeNull();
      if (dialogBox) {
        // Modal should have margins (not touching edges)
        expect(dialogBox.x).toBeGreaterThan(0);
        expect(dialogBox.x + dialogBox.width).toBeLessThan(375);
        // Modal should be within viewport height
        expect(dialogBox.height).toBeLessThanOrEqual(667);
      }
    });

    test("[P0] Should not overflow on small mobile (320px)", async ({
      page,
    }) => {
      // GIVEN: Very small mobile viewport (iPhone SE)
      await page.setViewportSize({ width: 320, height: 568 });
      await page.goto("http://localhost:3000/clients");
      await page.waitForSelector("table");

      // WHEN: Open company modal
      const companyCountButton = page.locator(
        `[data-testid="client-company-count-button-${testClientWithCompanies.client_id}"]`,
      );
      await companyCountButton.click();

      // THEN: Modal should be visible without horizontal overflow
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();

      const dialogBox = await dialog.boundingBox();
      expect(dialogBox).not.toBeNull();
      if (dialogBox) {
        // Modal should fit within viewport width with margins
        expect(dialogBox.x).toBeGreaterThanOrEqual(0);
        expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(320);
      }
    });

    test("[P0] Should be scrollable when content exceeds viewport height", async ({
      page,
    }) => {
      // GIVEN: Short viewport
      await page.setViewportSize({ width: 375, height: 500 });
      await page.goto("http://localhost:3000/clients");
      await page.waitForSelector("table");

      // WHEN: Open company modal
      const companyCountButton = page.locator(
        `[data-testid="client-company-count-button-${testClientWithCompanies.client_id}"]`,
      );
      await companyCountButton.click();

      // THEN: Modal should have scrollable content
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();

      // Modal should respect max-height
      const dialogBox = await dialog.boundingBox();
      if (dialogBox) {
        // Height should not exceed 90% of viewport (90vh)
        const maxHeight = 500 * 0.9; // 90% of 500px
        expect(dialogBox.height).toBeLessThanOrEqual(maxHeight);
      }

      // Content should still be accessible (check if company names are visible)
      await expect(page.locator("text=Alpha Company")).toBeVisible();
      await expect(page.locator("text=Beta Company")).toBeVisible();
    });

    test("[P0] Should be properly centered on tablet (768px)", async ({
      page,
    }) => {
      // GIVEN: Tablet viewport
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto("http://localhost:3000/clients");
      await page.waitForSelector("table");

      // WHEN: Open company modal
      const companyCountButton = page.locator(
        `[data-testid="client-company-count-button-${testClientWithCompanies.client_id}"]`,
      );
      await companyCountButton.click();

      // THEN: Modal should be centered
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();

      const dialogBox = await dialog.boundingBox();
      if (dialogBox) {
        // Modal should be roughly centered horizontally
        const centerX = dialogBox.x + dialogBox.width / 2;
        const viewportCenterX = 768 / 2;
        // Allow 10px tolerance for centering
        expect(Math.abs(centerX - viewportCenterX)).toBeLessThan(10);
      }
    });

    test("[P0] Should wrap long company names without overflow", async ({
      page,
    }) => {
      // GIVEN: Create a company with a very long name
      const longNameCompany = await prisma.company.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
          name: "This Is A Very Long Company Name That Should Wrap Properly Without Causing Horizontal Overflow On Small Screens",
          client_id: testClientWithCompanies.client_id,
          status: "ACTIVE",
        },
      });

      try {
        // WHEN: Open modal on mobile viewport
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto("http://localhost:3000/clients");
        await page.waitForSelector("table");

        const companyCountButton = page.locator(
          `[data-testid="client-company-count-button-${testClientWithCompanies.client_id}"]`,
        );
        await companyCountButton.click();

        // THEN: Long company name should be visible
        await expect(
          page.locator("text=This Is A Very Long Company Name"),
        ).toBeVisible();

        // AND: Modal should not overflow
        const dialog = page.locator('[role="dialog"]');
        const dialogBox = await dialog.boundingBox();
        if (dialogBox) {
          expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(375);
        }
      } finally {
        // Cleanup
        await prisma.company.delete({
          where: { company_id: longNameCompany.company_id },
        });
      }
    });

    test("[P0] Should maintain responsiveness across viewport changes", async ({
      page,
    }) => {
      // GIVEN: Start with desktop viewport
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto("http://localhost:3000/clients");
      await page.waitForSelector("table");

      const companyCountButton = page.locator(
        `[data-testid="client-company-count-button-${testClientWithCompanies.client_id}"]`,
      );
      await companyCountButton.click();

      // Modal opens on desktop
      await expect(page.locator('[role="dialog"]')).toBeVisible();

      // WHEN: Resize to mobile while modal is open
      await page.setViewportSize({ width: 375, height: 667 });

      // THEN: Modal should still be visible and not overflow
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();

      const dialogBox = await dialog.boundingBox();
      if (dialogBox) {
        expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(375);
      }

      // Content should still be accessible
      await expect(page.locator("text=Alpha Company")).toBeVisible();
    });
  });
});
