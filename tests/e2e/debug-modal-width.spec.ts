import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";

const prisma = new PrismaClient();

/**
 * Debug test to investigate modal width issue
 */

test.describe("Debug Modal Width", () => {
  let superadminUser: any;
  let testClient: any;
  let testCompany: any;

  test.beforeAll(async () => {
    // Clean up
    const existingUser = await prisma.user.findUnique({
      where: { email: "debug-modal@test.com" },
    });

    if (existingUser) {
      await prisma.userRole.deleteMany({
        where: { user_id: existingUser.user_id },
      });
      await prisma.user.delete({
        where: { user_id: existingUser.user_id },
      });
    }

    const existingClient = await prisma.client.findFirst({
      where: { email: "debug-client@test.com" },
    });

    if (existingClient) {
      await prisma.company.deleteMany({
        where: { client_id: existingClient.client_id },
      });
      await prisma.client.delete({
        where: { client_id: existingClient.client_id },
      });
    }

    // Create test data
    const hashedPassword = await bcrypt.hash("TestPassword123!", 10);

    superadminUser = await prisma.user.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        email: "debug-modal@test.com",
        name: "Debug Tester",
        password_hash: hashedPassword,
        status: "ACTIVE",
      },
    });

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

    testClient = await prisma.client.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.CLIENT),
        name: "Debug Client",
        email: "debug-client@test.com",
        status: "ACTIVE",
      },
    });

    testCompany = await prisma.company.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
        name: "Debug Company",
        client_id: testClient.client_id,
        status: "ACTIVE",
      },
    });
  });

  test.afterAll(async () => {
    if (testCompany) {
      await prisma.company.delete({
        where: { company_id: testCompany.company_id },
      });
    }
    if (testClient) {
      await prisma.client.delete({
        where: { client_id: testClient.client_id },
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

  test("Debug modal width and classes on 375px viewport", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Login
    await page.goto("http://localhost:3000/login");
    await page.fill('input[type="email"]', "debug-modal@test.com");
    await page.fill('input[type="password"]', "TestPassword123!");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard");

    // Navigate to clients
    await page.goto("http://localhost:3000/clients");
    await page.waitForSelector("table");

    // Click company count button
    const companyCountButton = page.locator(
      `[data-testid="client-company-count-button-${testClient.client_id}"]`,
    );
    await companyCountButton.click();

    // Wait for dialog
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Get computed styles
    const dialogElement = await dialog.elementHandle();
    const className = await dialog.getAttribute("class");
    const computedWidth = await dialogElement?.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        width: styles.width,
        maxWidth: styles.maxWidth,
        minWidth: styles.minWidth,
        boxSizing: styles.boxSizing,
        paddingLeft: styles.paddingLeft,
        paddingRight: styles.paddingRight,
        borderLeftWidth: styles.borderLeftWidth,
        borderRightWidth: styles.borderRightWidth,
      };
    });

    const boundingBox = await dialog.boundingBox();

    // Log everything
    console.log("=== MODAL DEBUG INFO ===");
    console.log("Viewport: 375x667");
    console.log("Dialog className:", className);
    console.log("Computed styles:", computedWidth);
    console.log("BoundingBox:", boundingBox);
    console.log("========================");

    // This test is just for debugging - don't fail
    expect(true).toBe(true);
  });
});
