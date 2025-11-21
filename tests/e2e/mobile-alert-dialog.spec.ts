import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";

const prisma = new PrismaClient();

/**
 * E2E Test Suite: Mobile Alert Dialog Responsiveness
 *
 * Tests that AlertDialog components (used for delete confirmations, etc.)
 * display properly on mobile screens without overflow issues.
 */

test.describe("Mobile Alert Dialog Responsiveness", () => {
  let superadminUser: any;
  let inactiveClient: any;

  test.beforeAll(async () => {
    // Clean up any existing test data
    await prisma.user.deleteMany({
      where: { email: "mobile-dialog-test@test.com" },
    });

    // Create superadmin user
    const hashedPassword = await bcrypt.hash("TestPassword123!", 10);
    superadminUser = await prisma.user.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        email: "mobile-dialog-test@test.com",
        name: "Mobile Dialog Tester",
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

    // Create an INACTIVE client for delete dialog testing
    inactiveClient = await prisma.client.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.CLIENT),
        email: `test-${Date.now()}@example.com`,
        name: "Mobile Test Client",
        status: "INACTIVE",
      },
    });
  });

  test.afterAll(async () => {
    // Cleanup
    if (inactiveClient) {
      await prisma.client.deleteMany({
        where: { client_id: inactiveClient.client_id },
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
    // Login
    await page.goto("http://localhost:3000/login");
    await page.fill('input[type="email"]', "mobile-dialog-test@test.com");
    await page.fill('input[type="password"]', "TestPassword123!");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard");
  });

  const mobileViewports = [
    { name: "iPhone SE", width: 375, height: 667 },
    { name: "iPhone 12 Pro", width: 390, height: 844 },
    { name: "Samsung Galaxy S20", width: 360, height: 800 },
    { name: "iPad Mini", width: 768, height: 1024 },
  ];

  for (const viewport of mobileViewports) {
    test(`[P0] Alert dialog should fit properly on ${viewport.name} (${viewport.width}x${viewport.height})`, async ({
      page,
    }) => {
      // GIVEN: I am on a mobile viewport
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });

      // AND: I navigate to the client edit page
      await page.goto(
        `http://localhost:3000/clients/${inactiveClient.client_id}`,
      );
      await page.waitForLoadState("networkidle");

      // WHEN: I click the delete button to open the AlertDialog
      const deleteButton = page.locator(
        'button[data-testid="client-delete-button"]',
      );
      await expect(deleteButton).toBeVisible();
      await expect(deleteButton).toBeEnabled();
      await deleteButton.click();

      // THEN: The dialog should be visible
      const dialog = page.locator('[role="alertdialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // AND: The dialog should not overflow the viewport
      const dialogBox = await dialog.boundingBox();
      expect(dialogBox).not.toBeNull();

      if (dialogBox) {
        // Dialog should have margin from screen edges (1rem = 16px, so 2rem = 32px total)
        const expectedMinMargin = 16; // 1rem on each side
        const expectedMaxWidth = viewport.width - 32; // Account for 1rem margin on each side

        // Check that dialog fits within viewport with proper margins
        expect(dialogBox.x).toBeGreaterThanOrEqual(expectedMinMargin);
        expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(
          viewport.width - expectedMinMargin,
        );

        // Check dialog width is reasonable
        expect(dialogBox.width).toBeLessThanOrEqual(expectedMaxWidth);

        // Check dialog is centered horizontally
        const centerX = dialogBox.x + dialogBox.width / 2;
        const viewportCenterX = viewport.width / 2;
        const centeringTolerance = 5; // Allow 5px tolerance for centering
        expect(Math.abs(centerX - viewportCenterX)).toBeLessThan(
          centeringTolerance,
        );
      }

      // AND: All dialog content should be visible
      await expect(
        page.locator('[role="alertdialog"] >> text="Are you sure?"'),
      ).toBeVisible();
      await expect(
        page.locator('[role="alertdialog"] >> text="Cancel"'),
      ).toBeVisible();
      await expect(
        page.locator('[role="alertdialog"] >> text="Delete"'),
      ).toBeVisible();

      // AND: The buttons should be properly stacked on mobile
      const cancelButton = page.locator(
        '[role="alertdialog"] >> button:has-text("Cancel")',
      );
      const deleteActionButton = page
        .locator('[role="alertdialog"] >> button:has-text("Delete")')
        .last();

      const cancelBox = await cancelButton.boundingBox();
      const deleteBox = await deleteActionButton.boundingBox();

      if (viewport.width < 640 && cancelBox && deleteBox) {
        // On mobile (< sm breakpoint), buttons should stack vertically
        // Cancel should be below Delete (reverse column)
        expect(cancelBox.y).toBeGreaterThan(deleteBox.y);
      }

      // Clean up: Close the dialog
      await page
        .locator('[role="alertdialog"] >> button:has-text("Cancel")')
        .click();
      await expect(dialog).not.toBeVisible();
    });
  }

  test("[P1] Alert dialog content should not get cut off on small screens", async ({
    page,
  }) => {
    // GIVEN: I am on the smallest common mobile viewport
    await page.setViewportSize({ width: 320, height: 568 }); // iPhone 5/SE (old)

    // AND: I navigate to the client edit page
    await page.goto(
      `http://localhost:3000/clients/${inactiveClient.client_id}`,
    );

    // WHEN: I open the delete dialog
    const deleteButton = page.locator(
      'button[data-testid="client-delete-button"]',
    );
    await deleteButton.click();

    // THEN: All text content should be readable (not cut off)
    const dialog = page.locator('[role="alertdialog"]');
    await expect(dialog).toBeVisible();

    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();

    if (dialogBox) {
      // Even on smallest screen, dialog should have minimum margins
      expect(dialogBox.x).toBeGreaterThanOrEqual(8); // At least 0.5rem margin
      expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(320 - 8);
    }

    // All interactive elements should be accessible
    await expect(
      page.locator('[role="alertdialog"] >> button:has-text("Cancel")'),
    ).toBeVisible();
    await expect(
      page.locator('[role="alertdialog"] >> button:has-text("Delete")').last(),
    ).toBeVisible();
  });

  test("[P1] Alert dialog should be scrollable if content is too tall", async ({
    page,
  }) => {
    // GIVEN: I am on a short mobile viewport
    await page.setViewportSize({ width: 375, height: 500 });

    // AND: I navigate to the client edit page
    await page.goto(
      `http://localhost:3000/clients/${inactiveClient.client_id}`,
    );

    // WHEN: I open the delete dialog
    const deleteButton = page.locator(
      'button[data-testid="client-delete-button"]',
    );
    await deleteButton.click();

    // THEN: The dialog should be visible and accessible
    const dialog = page.locator('[role="alertdialog"]');
    await expect(dialog).toBeVisible();

    // AND: Action buttons should always be accessible (not off-screen)
    const deleteActionButton = page
      .locator('[role="alertdialog"] >> button:has-text("Delete")')
      .last();
    await expect(deleteActionButton).toBeVisible();

    const buttonBox = await deleteActionButton.boundingBox();
    if (buttonBox) {
      // Button should be within viewport
      expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(500);
    }
  });
});
