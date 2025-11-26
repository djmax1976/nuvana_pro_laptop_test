import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";

const prisma = new PrismaClient();

/**
 * E2E Test Suite: Admin User Management
 *
 * Critical Path Tests:
 * - View users list
 * - Navigate to user detail/edit page
 * - Edit user information (name, email, status)
 * - Create new users
 * - Assign roles to users
 * - Remove roles from users
 * - Deactivate users
 * - Mobile responsiveness
 *
 * These tests ensure the complete user journey works end-to-end.
 */

test.describe.configure({ mode: "serial" });

/**
 * Helper function to clean up test users by email pattern
 * This ensures cleanup happens even if previous test runs failed
 */
async function cleanupTestUsersByEmail(emails: string[]): Promise<void> {
  try {
    const existingUsers = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { user_id: true },
    });

    for (const user of existingUsers) {
      // Delete related data in correct order
      await prisma.transaction.deleteMany({
        where: { cashier_id: user.user_id },
      });
      await prisma.shift.deleteMany({
        where: { cashier_id: user.user_id },
      });
      await prisma.userRole.deleteMany({
        where: { user_id: user.user_id },
      });
      await prisma.user.delete({
        where: { user_id: user.user_id },
      });
    }
  } catch (error) {
    console.error("Cleanup error:", error);
    // Don't throw - cleanup should be non-blocking
  }
}

test.describe("Admin User Management E2E", () => {
  let superadminUser: any;
  let testUser: any;
  let testRole: any;

  // Define test emails as constants for consistency
  const TEST_EMAILS = ["admin-e2e@test.com", "test-user-e2e@test.com"];

  test.beforeAll(async () => {
    // Clean up any leftover test data from previous runs
    await cleanupTestUsersByEmail(TEST_EMAILS);

    // Create superadmin user
    const hashedPassword = await bcrypt.hash("TestPassword123!", 10);
    superadminUser = await prisma.user.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        email: "admin-e2e@test.com",
        name: "Admin E2E Tester",
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

    // Create test user for editing
    testUser = await prisma.user.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        email: "test-user-e2e@test.com",
        name: "Test User E2E",
        password_hash: hashedPassword,
        status: "ACTIVE",
      },
    });

    // Get a role for assignment testing
    testRole = await prisma.role.findUnique({
      where: { code: "CORPORATE_ADMIN" },
    });
  });

  test.afterAll(async () => {
    // Cleanup: Delete test data by email (more reliable than by ID)
    await cleanupTestUsersByEmail(TEST_EMAILS);

    await prisma.$disconnect();
  });

  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto("http://localhost:3000/login");
    await page.fill('input[type="email"]', "admin-e2e@test.com");
    await page.fill('input[type="password"]', "TestPassword123!");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard");
  });

  test("[P0] Should load users list page", async ({ page }) => {
    await page.goto("http://localhost:3000/admin/users");
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(
      page.locator("h1, h2").filter({ hasText: /users/i }),
    ).toBeVisible();
  });

  test("[P0] Should navigate to user detail page directly", async ({
    page,
  }) => {
    // Navigate directly to user detail page via URL
    // Note: The user list doesn't have clickable row navigation; users access detail page via direct URL
    await page.goto(`http://localhost:3000/admin/users/${testUser.user_id}`);
    await expect(page).toHaveURL(
      new RegExp(`/admin/users/${testUser.user_id}`),
    );
    // Verify user details are displayed
    await expect(
      page.locator("h1").filter({ hasText: testUser.name }),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.locator(`text=${testUser.email}`)).toBeVisible();
  });

  test("[P0] Should successfully edit user name", async ({ page }) => {
    await page.goto(`http://localhost:3000/admin/users/${testUser.user_id}`);

    const newName = `Updated User ${Date.now()}`;
    const nameInput = page.locator('input[data-testid="user-name-input"]');
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    await nameInput.clear();
    await nameInput.fill(newName);

    const submitButton = page.locator(
      'button[data-testid="user-submit-button"]',
    );
    await submitButton.click();
    await page.waitForTimeout(1000);

    const updatedUser = await prisma.user.findUnique({
      where: { user_id: testUser.user_id },
    });
    expect(updatedUser?.name).toBe(newName);

    // Restore
    await prisma.user.update({
      where: { user_id: testUser.user_id },
      data: { name: testUser.name },
    });
  });

  test("[P0] Should successfully change user status", async ({ page }) => {
    await page.goto(`http://localhost:3000/admin/users/${testUser.user_id}`);

    // The user detail page has a "Deactivate" button to toggle status
    const deactivateButton = page.locator(
      `button[data-testid="deactivate-user-button-${testUser.user_id}"]`,
    );
    await expect(deactivateButton).toBeVisible({ timeout: 10000 });
    await expect(deactivateButton).toHaveText("Deactivate");
    await deactivateButton.click();

    // Wait for the status to update
    await page.waitForTimeout(1000);

    // Verify the button now shows "Activate" (status changed)
    await expect(deactivateButton).toHaveText("Activate", { timeout: 5000 });

    const updatedUser = await prisma.user.findUnique({
      where: { user_id: testUser.user_id },
    });
    expect(updatedUser?.status).toBe("INACTIVE");

    // Restore by clicking again
    await deactivateButton.click();
    await page.waitForTimeout(1000);

    const restoredUser = await prisma.user.findUnique({
      where: { user_id: testUser.user_id },
    });
    expect(restoredUser?.status).toBe("ACTIVE");
  });

  test("[P0] Should create a new user", async ({ page }) => {
    await page.goto("http://localhost:3000/admin/users");

    const createButton = page.getByRole("button", {
      name: /new user|create user/i,
    });
    await createButton.click();

    const newUserEmail = `new-user-${Date.now()}@test.com`;
    const newUserName = `New E2E User ${Date.now()}`;
    const newUserPassword = "TestPassword123!";

    await page
      .locator('input[data-testid="user-email-input"]')
      .fill(newUserEmail);
    await page
      .locator('input[data-testid="user-name-input"]')
      .fill(newUserName);
    await page
      .locator('input[data-testid="user-password-input"]')
      .fill(newUserPassword);

    // Select a role
    const roleSelect = page.locator('button[data-testid="user-role-select"]');
    await roleSelect.click();
    await page.waitForTimeout(500);
    // Select the first available role
    await page.locator('div[role="option"]').first().click();

    await page.locator('button[data-testid="user-form-submit"]').click();
    await page.waitForTimeout(1000);

    const createdUser = await prisma.user.findFirst({
      where: { email: newUserEmail },
    });
    expect(createdUser).not.toBeNull();
    expect(createdUser?.name).toBe(newUserName);
    expect(createdUser?.password_hash).not.toBeNull();

    // Verify user has at least one role
    const userRoles = await prisma.userRole.findMany({
      where: { user_id: createdUser!.user_id },
    });
    expect(userRoles.length).toBeGreaterThan(0);

    // Cleanup
    if (createdUser) {
      await prisma.userRole.deleteMany({
        where: { user_id: createdUser.user_id },
      });
      await prisma.user.delete({
        where: { user_id: createdUser.user_id },
      });
    }
  });

  test("[P0] Should assign role to user", async ({ page }) => {
    if (!testRole) {
      test.skip();
    }

    await page.goto(`http://localhost:3000/admin/users/${testUser.user_id}`);

    const assignRoleButton = page.locator(
      'button[data-testid="assign-role-button"]',
    );
    await expect(assignRoleButton).toBeVisible({ timeout: 10000 });
    await assignRoleButton.click();

    // Select role
    const roleSelect = page.locator('button[data-testid="role-select"]');
    await roleSelect.click();
    await page
      .locator(`div[role="option"]:has-text("${testRole.code}")`)
      .click();

    // Select scope type
    const scopeSelect = page.locator('button[data-testid="scope-type-select"]');
    await scopeSelect.click();
    await page.locator('div[role="option"]:has-text("SYSTEM")').click();

    const confirmButton = page.locator(
      'button[data-testid="confirm-role-assignment"]',
    );
    await confirmButton.click();
    await page.waitForTimeout(1000);

    const userRoles = await prisma.userRole.findMany({
      where: {
        user_id: testUser.user_id,
        role_id: testRole.role_id,
      },
    });
    expect(userRoles.length).toBeGreaterThan(0);

    // Cleanup
    await prisma.userRole.deleteMany({
      where: {
        user_id: testUser.user_id,
        role_id: testRole.role_id,
      },
    });
  });

  test("[P0] Should remove role from user", async ({ page }) => {
    if (!testRole) {
      test.skip();
    }

    // First assign a role
    await prisma.userRole.create({
      data: {
        user_id: testUser.user_id,
        role_id: testRole.role_id,
        assigned_by: superadminUser.user_id,
      },
    });

    await page.goto(`http://localhost:3000/admin/users/${testUser.user_id}`);

    const roleRow = page.locator(`tr:has-text("${testRole.code}")`).first();
    await expect(roleRow).toBeVisible({ timeout: 10000 });

    const removeButton = roleRow.locator(
      'button[data-testid="remove-role-button"]',
    );
    await removeButton.click();

    const confirmButton = page
      .getByRole("button", { name: /remove|confirm/i })
      .last();
    await confirmButton.click();
    await page.waitForTimeout(1000);

    const userRoles = await prisma.userRole.findMany({
      where: {
        user_id: testUser.user_id,
        role_id: testRole.role_id,
      },
    });
    expect(userRoles.length).toBe(0);
  });

  test("[P1] Should show validation error for empty user name", async ({
    page,
  }) => {
    await page.goto(`http://localhost:3000/admin/users/${testUser.user_id}`);

    const nameInput = page.locator('input[data-testid="user-name-input"]');
    await nameInput.clear();

    const submitButton = page.locator(
      'button[data-testid="user-submit-button"]',
    );
    await submitButton.click();

    const errorMessage = page.locator('[data-testid="form-error-message"]');
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  test("[P1] Should show validation error for invalid email format", async ({
    page,
  }) => {
    await page.goto("http://localhost:3000/admin/users/new");

    await page
      .locator('input[data-testid="user-email-input"]')
      .fill("invalid-email");
    await page
      .locator('input[data-testid="user-name-input"]')
      .fill("Test User");

    const submitButton = page.locator(
      'button[data-testid="user-submit-button"]',
    );
    await submitButton.click();

    const errorMessage = page.locator("text=/invalid.*email/i");
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  test("[P1] Should prevent duplicate email addresses", async ({ page }) => {
    await page.goto("http://localhost:3000/admin/users/new");

    // Try to create user with existing email
    await page
      .locator('input[data-testid="user-email-input"]')
      .fill(testUser.email);
    await page
      .locator('input[data-testid="user-name-input"]')
      .fill("Duplicate User");
    await page
      .locator('input[data-testid="user-password-input"]')
      .fill("TestPassword123!");

    // Select a role
    const roleSelect = page.locator('button[data-testid="user-role-select"]');
    await roleSelect.click();
    await page.waitForTimeout(500);
    await page.locator('div[role="option"]').first().click();

    const submitButton = page.locator('button[data-testid="user-form-submit"]');
    await submitButton.click();

    const errorMessage = page.locator("text=/email.*already.*exists/i");
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  test("[P1] Should show validation error for missing password", async ({
    page,
  }) => {
    await page.goto("http://localhost:3000/admin/users/new");

    await page
      .locator('input[data-testid="user-email-input"]')
      .fill("test@example.com");
    await page
      .locator('input[data-testid="user-name-input"]')
      .fill("Test User");
    // Don't fill password

    const submitButton = page.locator('button[data-testid="user-form-submit"]');
    await submitButton.click();

    const errorMessage = page.locator("text=/password.*required|password.*8/i");
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  test("[P1] Should show validation error for weak password", async ({
    page,
  }) => {
    await page.goto("http://localhost:3000/admin/users/new");

    await page
      .locator('input[data-testid="user-email-input"]')
      .fill("test@example.com");
    await page
      .locator('input[data-testid="user-name-input"]')
      .fill("Test User");
    await page.locator('input[data-testid="user-password-input"]').fill("weak"); // Too short and missing requirements

    const submitButton = page.locator('button[data-testid="user-form-submit"]');
    await submitButton.click();

    const errorMessage = page.locator(
      "text=/password.*8.*characters|password.*uppercase|password.*lowercase|password.*number|password.*special/i",
    );
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  test("[P1] Should show validation error for missing role", async ({
    page,
  }) => {
    await page.goto("http://localhost:3000/admin/users/new");

    await page
      .locator('input[data-testid="user-email-input"]')
      .fill("test@example.com");
    await page
      .locator('input[data-testid="user-name-input"]')
      .fill("Test User");
    await page
      .locator('input[data-testid="user-password-input"]')
      .fill("TestPassword123!");
    // Don't select a role

    const submitButton = page.locator('button[data-testid="user-form-submit"]');
    await submitButton.click();

    const errorMessage = page.locator("text=/role.*required/i");
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  test("[P1] Should display properly on mobile screens", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`http://localhost:3000/admin/users/${testUser.user_id}`);
    await page.waitForLoadState("networkidle");

    const userEditSection = page.locator('[data-testid="user-edit-section"]');
    await expect(userEditSection).toBeVisible();

    const viewport = page.viewportSize();
    expect(viewport?.width).toBe(375);
  });

  test("[P1] Should display users list properly on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("http://localhost:3000/admin/users");
    await page.waitForLoadState("networkidle");

    const usersList = page.locator('[data-testid="users-list"]');
    await expect(usersList).toBeVisible();

    // Verify list items are not overflowing
    const userRow = page.locator(`tr:has-text("${testUser.email}")`).first();
    const rowBox = await userRow.boundingBox();

    if (rowBox) {
      expect(rowBox.width).toBeLessThanOrEqual(375);
    }
  });

  test("[P1] Should display role assignment dialog properly on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`http://localhost:3000/admin/users/${testUser.user_id}`);

    const assignRoleButton = page.locator(
      'button[data-testid="assign-role-button"]',
    );
    await assignRoleButton.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();

    if (dialogBox) {
      // Dialog should have proper margins on mobile
      const expectedMinMargin = 16;
      expect(dialogBox.x).toBeGreaterThanOrEqual(expectedMinMargin);
      expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(
        375 - expectedMinMargin,
      );
    }
  });

  test("[P0] Should search users by name or email", async ({ page }) => {
    await page.goto("http://localhost:3000/admin/users");

    const searchInput = page.locator('input[data-testid="user-search-input"]');
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    await searchInput.fill(testUser.email);

    await page.waitForTimeout(500); // Wait for debounced search

    const userRow = page.locator(`tr:has-text("${testUser.email}")`).first();
    await expect(userRow).toBeVisible();

    // Verify other users are filtered out
    const otherUserRow = page
      .locator(`tr:has-text("${superadminUser.email}")`)
      .first();
    await expect(otherUserRow).not.toBeVisible();
  });

  test("[P1] Should filter users by status", async ({ page }) => {
    // Set test user to INACTIVE
    await prisma.user.update({
      where: { user_id: testUser.user_id },
      data: { status: "INACTIVE" },
    });

    await page.goto("http://localhost:3000/admin/users");

    // Wait for page to load
    await page.waitForLoadState("networkidle");

    const statusFilter = page.locator(
      'button[data-testid="user-status-filter"]',
    );
    await expect(statusFilter).toBeVisible({ timeout: 10000 });
    await statusFilter.click();
    await page.locator('div[role="option"]:has-text("Inactive")').click();

    await page.waitForTimeout(500);

    const inactiveUserRow = page
      .locator(`tr:has-text("${testUser.email}")`)
      .first();
    await expect(inactiveUserRow).toBeVisible();

    // Restore
    await prisma.user.update({
      where: { user_id: testUser.user_id },
      data: { status: "ACTIVE" },
    });
  });
});
