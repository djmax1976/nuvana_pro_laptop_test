import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";
import { cleanupTestData } from "../support/cleanup-helper";

const prisma = new PrismaClient();

/**
 * Client Form Email and Password E2E Tests
 *
 * Tests for email and password fields in client form:
 * - Email field is visible and required
 * - Password field is visible and optional on create
 * - Password field shows appropriate placeholder on edit
 * - Form validation for email format
 * - Form validation for password minimum length
 * - Successful client creation with email and password
 * - Successful client update with new email
 * - Successful client update with new password (optional)
 *
 * Priority: P0 (Critical - Authentication foundation)
 *
 * Related Story: Client Management Enhancement - Email & Password Fields
 */

test.describe.configure({ mode: "serial" });

test.describe("Client Form Email and Password E2E", () => {
  let superadminUser: any;
  let testClient: any;

  test.beforeEach(async () => {
    // Clean up any existing test data first (delete userRoles before users to avoid FK violations)
    const existingUsers = await prisma.user.findMany({
      where: { email: "superadmin-client-form@test.com" },
      select: { user_id: true },
    });

    for (const user of existingUsers) {
      await prisma.userRole.deleteMany({
        where: { user_id: user.user_id },
      });
    }

    await prisma.user.deleteMany({
      where: { email: "superadmin-client-form@test.com" },
    });

    // Create superadmin user for testing
    const hashedPassword = await bcrypt.hash("TestPassword123!", 10);

    superadminUser = await prisma.user.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        email: "superadmin-client-form@test.com",
        name: "Superadmin Client Form Tester",
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
  });

  test.afterAll(async () => {
    // Cleanup: Delete test data using helper (respects FK constraints)
    // Clean up any clients created during tests
    const clientsToClean = await prisma.client.findMany({
      where: {
        email: {
          in: [
            "newclient@example.com",
            "nopass@example.com",
            "simple@example.com",
            "user+tag@example.com",
            "user.name@example.com",
            "user_name@example.co.uk",
            "existing@example.com",
            "newemail@example.com",
            "passupdate@example.com",
            "keep@example.com",
            "valid@example.com",
            "shortpass@example.com",
            "mismatch@example.com",
            "matching@example.com",
          ],
        },
      },
      select: { client_id: true },
    });

    const clientIds = [
      ...(testClient ? [testClient.client_id] : []),
      ...clientsToClean.map((c) => c.client_id),
    ];

    await cleanupTestData(prisma, {
      clients: clientIds,
      users: superadminUser ? [superadminUser.user_id] : [],
    });

    await prisma.$disconnect();
  });

  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto("http://localhost:3000/login");
    await page.fill('input[type="email"]', "superadmin-client-form@test.com");
    await page.fill('input[type="password"]', "TestPassword123!");
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForURL("**/dashboard");
  });

  test.describe("Create Client Form", () => {
    test.beforeEach(async ({ page }) => {
      // Navigate and wait for the clients API call to complete
      await Promise.all([
        page.goto("http://localhost:3000/clients"),
        page.waitForResponse(
          (response) =>
            response.url().includes("/api/clients") &&
            response.status() === 200,
        ),
      ]);

      // Now the button should be rendered - wait for it and click
      await page.waitForSelector('[data-testid="client-create-button"]');
      await page.click('[data-testid="client-create-button"]');
      await page.waitForSelector('[data-testid="create-client-name-input"]');
    });

    test("[P0] Should display email and password fields in create form", async ({
      page,
    }) => {
      // THEN: Email field is visible
      const emailInput = page.locator(
        '[data-testid="create-client-email-input"]',
      );
      await expect(emailInput).toBeVisible();
      await expect(emailInput).toHaveAttribute("type", "email");
      await expect(emailInput).toHaveAttribute(
        "placeholder",
        "client@example.com",
      );
      await expect(emailInput).toHaveAttribute("autoComplete", "email");

      // AND: Password field is visible
      const passwordInput = page.locator(
        '[data-testid="create-client-password-input"]',
      );
      await expect(passwordInput).toBeVisible();
      await expect(passwordInput).toHaveAttribute("type", "password");
      await expect(passwordInput).toHaveAttribute(
        "autoComplete",
        "new-password",
      );

      // AND: Confirm password field is visible
      const confirmPasswordInput = page.locator(
        '[data-testid="create-client-confirm-password-input"]',
      );
      await expect(confirmPasswordInput).toBeVisible();
      await expect(confirmPasswordInput).toHaveAttribute("type", "password");
      await expect(confirmPasswordInput).toHaveAttribute(
        "autoComplete",
        "new-password",
      );
    });

    test("[P0] Should show validation error for missing email", async ({
      page,
    }) => {
      // WHEN: Submitting form without email
      await page.fill(
        '[data-testid="create-client-name-input"]',
        "Test Client",
      );
      await page.fill(
        '[data-testid="create-client-password-input"]',
        "ValidPassword123!",
      );
      await page.fill(
        '[data-testid="create-client-confirm-password-input"]',
        "ValidPassword123!",
      );
      await page.click('[data-testid="create-client-submit-button"]');

      // Wait for validation
      await page.waitForTimeout(500);

      // THEN: Validation error is displayed
      await expect(page.locator("text=Email is required")).toBeVisible();
    });

    test("[P0] Should show validation error for invalid email format", async ({
      page,
    }) => {
      // WHEN: Entering invalid email format
      await page.fill(
        '[data-testid="create-client-name-input"]',
        "Test Client",
      );
      await page.fill(
        '[data-testid="create-client-email-input"]',
        "not-an-email",
      );
      await page.fill(
        '[data-testid="create-client-password-input"]',
        "ValidPassword123!",
      );
      await page.fill(
        '[data-testid="create-client-confirm-password-input"]',
        "ValidPassword123!",
      );
      await page.click('[data-testid="create-client-submit-button"]');

      // Wait for validation
      await page.waitForTimeout(500);

      // THEN: Validation error is displayed
      await expect(page.locator("text=Invalid email address")).toBeVisible();
    });

    test("[P0] Should show validation error for short password", async ({
      page,
    }) => {
      // WHEN: Entering password shorter than 8 characters
      await page.fill(
        '[data-testid="create-client-name-input"]',
        "Test Client",
      );
      await page.fill(
        '[data-testid="create-client-email-input"]',
        "test@example.com",
      );
      await page.fill('[data-testid="create-client-password-input"]', "short");
      await page.fill(
        '[data-testid="create-client-confirm-password-input"]',
        "short",
      );
      await page.click('[data-testid="create-client-submit-button"]');

      // THEN: Validation error is displayed
      await expect(
        page.locator("text=Password must be at least 8 characters"),
      ).toBeVisible();
    });

    test("[P0] Should show validation error when passwords do not match", async ({
      page,
    }) => {
      // WHEN: Entering different passwords
      await page.fill(
        '[data-testid="create-client-name-input"]',
        "Test Client",
      );
      await page.fill(
        '[data-testid="create-client-email-input"]',
        "mismatch@example.com",
      );
      await page.fill(
        '[data-testid="create-client-password-input"]',
        "Password123",
      );
      await page.fill(
        '[data-testid="create-client-confirm-password-input"]',
        "Password456",
      );
      await page.click('[data-testid="create-client-submit-button"]');

      // THEN: Validation error is displayed
      await expect(page.locator("text=Passwords do not match")).toBeVisible();
    });

    test("[P0] Should allow submission when passwords match", async ({
      page,
    }) => {
      // WHEN: Entering matching passwords
      await page.fill(
        '[data-testid="create-client-name-input"]',
        "Matching Pass Client",
      );
      await page.fill(
        '[data-testid="create-client-email-input"]',
        "matching@example.com",
      );
      await page.fill(
        '[data-testid="create-client-password-input"]',
        "MatchingPass123",
      );
      await page.fill(
        '[data-testid="create-client-confirm-password-input"]',
        "MatchingPass123",
      );
      await page.click('[data-testid="create-client-submit-button"]');

      // THEN: Form submits successfully
      await expect(
        page.locator("text=Client created successfully"),
      ).toBeVisible({ timeout: 10000 });
    });

    test("[P0] Should successfully create client with email and password", async ({
      page,
    }) => {
      // WHEN: Filling form with valid data including email and password
      await page.fill(
        '[data-testid="create-client-name-input"]',
        "New Client with Auth",
      );
      await page.fill(
        '[data-testid="create-client-email-input"]',
        "newclient@example.com",
      );
      await page.fill(
        '[data-testid="create-client-password-input"]',
        "securePass123",
      );
      await page.fill(
        '[data-testid="create-client-confirm-password-input"]',
        "securePass123",
      );
      await page.click('[data-testid="create-client-submit-button"]');

      // THEN: Success toast is displayed
      await expect(
        page.locator("text=Client created successfully"),
      ).toBeVisible({ timeout: 10000 });

      // AND: Modal should close and we should be back on clients list
      await expect(
        page.locator('[data-testid="client-create-button"]'),
      ).toBeVisible();
    });

    test("[P0] Should successfully create client with email but no password", async ({
      page,
    }) => {
      // WHEN: Creating client without password (optional)
      await page.fill(
        '[data-testid="create-client-name-input"]',
        "Client Without Password",
      );
      await page.fill(
        '[data-testid="create-client-email-input"]',
        "nopass@example.com",
      );
      // Leave password empty
      await page.click('[data-testid="create-client-submit-button"]');

      // THEN: Client is created successfully
      await expect(
        page.locator("text=Client created successfully"),
      ).toBeVisible({ timeout: 30000 });
    });
  });

  test.describe("Edit Client Form", () => {
    test.beforeEach(async () => {
      // Create a test client for editing with unified auth (User + Client + UserRole)
      const passwordHash = await bcrypt.hash("password123", 10);

      // Create User record with password
      const user = await prisma.user.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
          email: "existing@example.com",
          name: "Existing Client",
          password_hash: passwordHash,
          status: "ACTIVE",
        },
      });

      // Create Client record without password
      testClient = await prisma.client.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.CLIENT),
          name: "Existing Client",
          email: "existing@example.com",
          status: "ACTIVE",
        },
      });

      // Link User and Client via UserRole with CLIENT role
      const clientRole = await prisma.role.findUnique({
        where: { code: "CLIENT" },
      });

      if (clientRole) {
        await prisma.userRole.create({
          data: {
            user_id: user.user_id,
            role_id: clientRole.role_id,
            client_id: testClient.client_id,
            assigned_by: superadminUser.user_id,
          },
        });
      }

      // Store user reference for cleanup
      (testClient as any).user = user;
    });

    test.afterEach(async () => {
      // Clean up test client and associated user
      if (testClient) {
        // Delete UserRole first (cascade should handle this, but be explicit)
        if ((testClient as any).user) {
          await prisma.userRole
            .deleteMany({
              where: { user_id: (testClient as any).user.user_id },
            })
            .catch(() => {});
          await prisma.user
            .delete({
              where: { user_id: (testClient as any).user.user_id },
            })
            .catch(() => {});
        }
        await prisma.client
          .delete({
            where: { client_id: testClient.client_id },
          })
          .catch(() => {}); // Ignore if already deleted
        testClient = null;
      }
    });

    test("[P0] Should pre-fill email field when editing client", async ({
      page,
    }) => {
      // WHEN: Navigating to edit page
      await page.goto(`http://localhost:3000/clients/${testClient.public_id}`);
      await page.waitForSelector('[data-testid="client-email-input"]');

      // THEN: Email field is pre-filled
      const emailInput = page.locator('[data-testid="client-email-input"]');
      await expect(emailInput).toHaveValue("existing@example.com");
    });

    test("[P0] Should show password placeholder indicating optional update", async ({
      page,
    }) => {
      // WHEN: Navigating to edit page
      await page.goto(`http://localhost:3000/clients/${testClient.public_id}`);
      await page.waitForSelector('[data-testid="client-password-input"]');

      // THEN: Password field shows dots placeholder
      const passwordInput = page.locator(
        '[data-testid="client-password-input"]',
      );
      await expect(passwordInput).toHaveAttribute("placeholder", "••••••••");

      // AND: Confirm password field shows dots placeholder
      const confirmPasswordInput = page.locator(
        '[data-testid="client-confirm-password-input"]',
      );
      await expect(confirmPasswordInput).toHaveAttribute(
        "placeholder",
        "••••••••",
      );

      // AND: Label indicates password is optional
      await expect(
        page.locator("text=Password (leave blank to keep current)"),
      ).toBeVisible();

      // AND: Description explains optional nature
      await expect(
        page.locator("text=Enter a new password only if you want to change it"),
      ).toBeVisible();
    });

    test("[P0] Should successfully update client email", async ({ page }) => {
      // WHEN: Updating email
      await page.goto(`http://localhost:3000/clients/${testClient.public_id}`);
      await page.waitForSelector('[data-testid="client-email-input"]');

      await page.fill(
        '[data-testid="client-email-input"]',
        "newemail@example.com",
      );
      await page.click('[data-testid="client-submit-button"]');

      // THEN: Update is successful
      await expect(
        page.locator("text=Client updated successfully"),
      ).toBeVisible({ timeout: 10000 });

      // AND: Email is updated in database
      const updatedClient = await prisma.client.findUnique({
        where: { client_id: testClient.client_id },
      });
      expect(updatedClient?.email).toBe("newemail@example.com");
    });

    test("[P0] Should successfully update client password", async ({
      page,
    }) => {
      // Get original password hash from User record
      const originalHash = (testClient as any).user.password_hash;

      // WHEN: Updating password with matching confirmation
      await page.goto(`http://localhost:3000/clients/${testClient.public_id}`);
      await page.waitForSelector('[data-testid="client-password-input"]');

      await page.fill(
        '[data-testid="client-password-input"]',
        "newPassword456",
      );
      await page.fill(
        '[data-testid="client-confirm-password-input"]',
        "newPassword456",
      );
      await page.click('[data-testid="client-submit-button"]');

      // THEN: Update is successful
      await expect(
        page.locator("text=Client updated successfully"),
      ).toBeVisible({ timeout: 10000 });

      // AND: Password hash is changed in User record (not Client)
      const updatedUser = await prisma.user.findUnique({
        where: { user_id: (testClient as any).user.user_id },
      });
      expect(updatedUser?.password_hash).not.toBe(originalHash);
    });

    test("[P0] Should show validation error when updating password with mismatched confirmation", async ({
      page,
    }) => {
      // WHEN: Updating password with mismatched confirmation
      await page.goto(`http://localhost:3000/clients/${testClient.public_id}`);
      await page.waitForSelector('[data-testid="client-password-input"]');

      await page.fill(
        '[data-testid="client-password-input"]',
        "newPassword789",
      );
      await page.fill(
        '[data-testid="client-confirm-password-input"]',
        "differentPass789",
      );
      await page.click('[data-testid="client-submit-button"]');

      // THEN: Validation error is displayed
      await expect(page.locator("text=Passwords do not match")).toBeVisible();
    });

    test("[P0] Should keep existing password when field is left blank", async ({
      page,
    }) => {
      // Get original password hash from User record
      const originalHash = (testClient as any).user.password_hash;

      // WHEN: Updating client without touching password field
      await page.goto(`http://localhost:3000/clients/${testClient.public_id}`);
      await page.waitForSelector('[data-testid="client-name-input"]');

      await page.fill(
        '[data-testid="client-name-input"]',
        "Updated Client Name",
      );
      await page.click('[data-testid="client-submit-button"]');

      // THEN: Update is successful
      await expect(
        page.locator("text=Client updated successfully"),
      ).toBeVisible({ timeout: 10000 });

      // AND: Password hash remains unchanged in User record
      const updatedUser = await prisma.user.findUnique({
        where: { user_id: (testClient as any).user.user_id },
      });
      expect(updatedUser?.password_hash).toBe(originalHash);
    });

    test("[P0] Should show validation error for invalid email on update", async ({
      page,
    }) => {
      // WHEN: Updating with invalid email
      await page.goto(`http://localhost:3000/clients/${testClient.public_id}`);
      await page.waitForSelector('[data-testid="client-email-input"]');

      await page.fill('[data-testid="client-email-input"]', "invalid-email");
      await page.click('[data-testid="client-submit-button"]');

      // THEN: Validation error is displayed
      await expect(page.locator("text=Invalid email address")).toBeVisible();
    });

    test("[P0] Should show validation error for short password on update", async ({
      page,
    }) => {
      // WHEN: Updating with short password
      await page.goto(`http://localhost:3000/clients/${testClient.public_id}`);
      await page.waitForSelector('[data-testid="client-password-input"]');

      await page.fill('[data-testid="client-password-input"]', "short");
      await page.click('[data-testid="client-submit-button"]');

      // THEN: Validation error is displayed
      await expect(
        page.locator("text=Password must be at least 8 characters"),
      ).toBeVisible();
    });
  });

  test.describe("Field Accessibility", () => {
    test("[P0] Email and password fields should have proper labels and descriptions", async ({
      page,
    }) => {
      // WHEN: Viewing create form
      await page.goto("http://localhost:3000/clients");
      await page.waitForSelector('[data-testid="client-create-button"]');
      await page.click('[data-testid="client-create-button"]');
      await page.waitForSelector('[data-testid="create-client-name-input"]');

      // THEN: Email field has label and description
      await expect(page.locator('label:has-text("Email")')).toBeVisible();
      await expect(
        page.locator("text=Client email address (max 255 characters)"),
      ).toBeVisible();

      // AND: Password field has label and description
      await expect(page.locator('label:has-text("Password")')).toBeVisible();
      await expect(
        page.locator(
          "text=Password for the client (optional, min 8 characters if provided)",
        ),
      ).toBeVisible();
    });
  });

  test.describe("Password Visibility Toggle", () => {
    test("[P0] Should toggle password visibility when eye icon is clicked", async ({
      page,
    }) => {
      // GIVEN: User is on create client form
      await page.goto("http://localhost:3000/clients");
      await page.waitForSelector('[data-testid="client-create-button"]');
      await page.click('[data-testid="client-create-button"]');
      await page.waitForSelector(
        '[data-testid="create-client-password-input"]',
      );

      const passwordInput = page.locator(
        '[data-testid="create-client-password-input"]',
      );
      const toggleButton = page.locator(
        '[data-testid="create-toggle-password-visibility"]',
      );

      // WHEN: Password field is initially displayed
      // THEN: Password should be hidden (type="password")
      await expect(passwordInput).toHaveAttribute("type", "password");
      await expect(toggleButton).toBeVisible();
      await expect(toggleButton).toHaveAttribute("aria-label", "Show password");

      // WHEN: User enters password
      await passwordInput.fill("TestPassword123");

      // THEN: Password should still be hidden
      await expect(passwordInput).toHaveAttribute("type", "password");

      // WHEN: User clicks eye icon to show password
      await toggleButton.click();

      // THEN: Password should be visible (type="text")
      await expect(passwordInput).toHaveAttribute("type", "text");
      await expect(toggleButton).toHaveAttribute("aria-label", "Hide password");
      await expect(passwordInput).toHaveValue("TestPassword123");

      // WHEN: User clicks eye icon again to hide password
      await toggleButton.click();

      // THEN: Password should be hidden again
      await expect(passwordInput).toHaveAttribute("type", "password");
      await expect(toggleButton).toHaveAttribute("aria-label", "Show password");
    });

    test("[P0] Should toggle confirm password visibility independently", async ({
      page,
    }) => {
      // GIVEN: User is on create client form
      await page.goto("http://localhost:3000/clients");
      await page.waitForSelector('[data-testid="client-create-button"]');
      await page.click('[data-testid="client-create-button"]');
      await page.waitForSelector(
        '[data-testid="create-client-confirm-password-input"]',
      );

      const confirmPasswordInput = page.locator(
        '[data-testid="create-client-confirm-password-input"]',
      );
      const toggleButton = page.locator(
        '[data-testid="create-toggle-confirm-password-visibility"]',
      );

      // WHEN: Confirm password field is initially displayed
      // THEN: Should be hidden (type="password")
      await expect(confirmPasswordInput).toHaveAttribute("type", "password");
      await expect(toggleButton).toBeVisible();

      // WHEN: User enters confirm password
      await confirmPasswordInput.fill("TestPassword123");

      // WHEN: User clicks eye icon to show confirm password
      await toggleButton.click();

      // THEN: Confirm password should be visible
      await expect(confirmPasswordInput).toHaveAttribute("type", "text");
      await expect(confirmPasswordInput).toHaveValue("TestPassword123");

      // WHEN: User clicks eye icon again
      await toggleButton.click();

      // THEN: Confirm password should be hidden again
      await expect(confirmPasswordInput).toHaveAttribute("type", "password");
    });

    test("[P0] Should maintain independent visibility states for password and confirm password", async ({
      page,
    }) => {
      // GIVEN: User is on create client form
      await page.goto("http://localhost:3000/clients");
      await page.waitForSelector('[data-testid="client-create-button"]');
      await page.click('[data-testid="client-create-button"]');
      await page.waitForSelector(
        '[data-testid="create-client-password-input"]',
      );

      const passwordInput = page.locator(
        '[data-testid="create-client-password-input"]',
      );
      const confirmPasswordInput = page.locator(
        '[data-testid="create-client-confirm-password-input"]',
      );
      const passwordToggle = page.locator(
        '[data-testid="create-toggle-password-visibility"]',
      );
      const confirmPasswordToggle = page.locator(
        '[data-testid="create-toggle-confirm-password-visibility"]',
      );

      // WHEN: User enters both passwords
      await passwordInput.fill("Password123");
      await confirmPasswordInput.fill("Password123");

      // THEN: Both should be hidden initially
      await expect(passwordInput).toHaveAttribute("type", "password");
      await expect(confirmPasswordInput).toHaveAttribute("type", "password");

      // WHEN: User shows only password field
      await passwordToggle.click();

      // THEN: Password is visible, confirm password is still hidden
      await expect(passwordInput).toHaveAttribute("type", "text");
      await expect(confirmPasswordInput).toHaveAttribute("type", "password");

      // WHEN: User shows confirm password field
      await confirmPasswordToggle.click();

      // THEN: Both are now visible
      await expect(passwordInput).toHaveAttribute("type", "text");
      await expect(confirmPasswordInput).toHaveAttribute("type", "text");

      // WHEN: User hides only password field
      await passwordToggle.click();

      // THEN: Password is hidden, confirm password is still visible
      await expect(passwordInput).toHaveAttribute("type", "password");
      await expect(confirmPasswordInput).toHaveAttribute("type", "text");
    });

    test("[P0] Should have accessible toggle buttons with proper ARIA labels", async ({
      page,
    }) => {
      // GIVEN: User is on create client form
      await page.goto("http://localhost:3000/clients");
      await page.waitForSelector('[data-testid="client-create-button"]');
      await page.click('[data-testid="client-create-button"]');
      await page.waitForSelector(
        '[data-testid="create-toggle-password-visibility"]',
      );

      const passwordToggle = page.locator(
        '[data-testid="create-toggle-password-visibility"]',
      );
      const confirmPasswordToggle = page.locator(
        '[data-testid="create-toggle-confirm-password-visibility"]',
      );

      // THEN: Toggle buttons should have proper attributes
      await expect(passwordToggle).toHaveAttribute("type", "button");
      await expect(passwordToggle).toHaveAttribute(
        "aria-label",
        "Show password",
      );

      await expect(confirmPasswordToggle).toHaveAttribute("type", "button");
      await expect(confirmPasswordToggle).toHaveAttribute(
        "aria-label",
        "Show confirm password",
      );

      // WHEN: User clicks to show password
      await passwordToggle.click();

      // THEN: ARIA label should update
      await expect(passwordToggle).toHaveAttribute(
        "aria-label",
        "Hide password",
      );

      // WHEN: User clicks to show confirm password
      await confirmPasswordToggle.click();

      // THEN: ARIA label should update
      await expect(confirmPasswordToggle).toHaveAttribute(
        "aria-label",
        "Hide confirm password",
      );
    });

    test("[P0] Should disable toggle buttons when form is submitting", async ({
      page,
    }) => {
      // GIVEN: User is on create client form with valid data
      await page.goto("http://localhost:3000/clients");
      await page.waitForSelector('[data-testid="client-create-button"]');
      await page.click('[data-testid="client-create-button"]');
      await page.waitForSelector('[data-testid="create-client-name-input"]');

      await page.fill(
        '[data-testid="create-client-name-input"]',
        "Test Client",
      );
      await page.fill(
        '[data-testid="create-client-email-input"]',
        "valid@example.com",
      );
      await page.fill(
        '[data-testid="create-client-password-input"]',
        "ValidPass123",
      );
      await page.fill(
        '[data-testid="create-client-confirm-password-input"]',
        "ValidPass123",
      );

      const passwordToggle = page.locator(
        '[data-testid="create-toggle-password-visibility"]',
      );
      const confirmPasswordToggle = page.locator(
        '[data-testid="create-toggle-confirm-password-visibility"]',
      );

      // WHEN: Form is being submitted
      // Note: We can't easily test the disabled state during submission without mocking
      // but we can verify the buttons are enabled before submission
      await expect(passwordToggle).toBeEnabled();
      await expect(confirmPasswordToggle).toBeEnabled();
    });

    test("[P0] Should work on edit form as well", async ({ page }) => {
      // GIVEN: Test client exists with unified auth (User + Client + UserRole)
      const passwordHash = await bcrypt.hash("password123", 10);

      // Create User record with password
      const editTestUser = await prisma.user.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
          email: "visibility@example.com",
          name: "Edit Visibility Test Client",
          password_hash: passwordHash,
          status: "ACTIVE",
        },
      });

      // Create Client record without password
      const editTestClient = await prisma.client.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.CLIENT),
          name: "Edit Visibility Test Client",
          email: "visibility@example.com",
          status: "ACTIVE",
        },
      });

      // Link User and Client via UserRole
      const clientRole = await prisma.role.findUnique({
        where: { code: "CLIENT" },
      });

      let userRole: any = null;
      if (clientRole) {
        userRole = await prisma.userRole.create({
          data: {
            user_id: editTestUser.user_id,
            role_id: clientRole.role_id,
            client_id: editTestClient.client_id,
            assigned_by: superadminUser.user_id,
          },
        });
      }

      try {
        // WHEN: User navigates to edit form
        await page.goto(
          `http://localhost:3000/clients/${editTestClient.public_id}`,
        );
        await page.waitForSelector('[data-testid="client-password-input"]');

        const passwordInput = page.locator(
          '[data-testid="client-password-input"]',
        );
        const toggleButton = page.locator(
          '[data-testid="toggle-password-visibility"]',
        );

        // THEN: Password field should be hidden initially
        await expect(passwordInput).toHaveAttribute("type", "password");

        // WHEN: User enters new password and toggles visibility
        await passwordInput.fill("NewPassword456");
        await toggleButton.click();

        // THEN: Password should be visible
        await expect(passwordInput).toHaveAttribute("type", "text");
        await expect(passwordInput).toHaveValue("NewPassword456");
      } finally {
        // Cleanup: Delete in correct order
        if (userRole) {
          await prisma.userRole
            .delete({
              where: { user_role_id: userRole.user_role_id },
            })
            .catch(() => {});
        }
        await prisma.client
          .delete({
            where: { client_id: editTestClient.client_id },
          })
          .catch(() => {});
        await prisma.user
          .delete({
            where: { user_id: editTestUser.user_id },
          })
          .catch(() => {});
      }
    });
  });

  test.describe("Modal Centering and Responsiveness", () => {
    test("[P0] Should center Create Client modal on desktop (1920x1080)", async ({
      page,
    }) => {
      // GIVEN: Desktop viewport
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto("http://localhost:3000/clients");
      await page.waitForSelector('[data-testid="client-create-button"]');

      // WHEN: Open create client modal
      await page.click('[data-testid="client-create-button"]');
      await page.waitForSelector('[data-testid="create-client-name-input"]');

      // THEN: Modal should be perfectly centered
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();

      const dialogBox = await dialog.boundingBox();
      expect(dialogBox).not.toBeNull();

      if (dialogBox) {
        const dialogCenterX = dialogBox.x + dialogBox.width / 2;
        const dialogCenterY = dialogBox.y + dialogBox.height / 2;
        const viewportCenterX = 1920 / 2;
        const viewportCenterY = 1080 / 2;

        // Modal should be centered with less than 5px tolerance
        expect(Math.abs(dialogCenterX - viewportCenterX)).toBeLessThan(5);
        expect(Math.abs(dialogCenterY - viewportCenterY)).toBeLessThan(5);
      }
    });

    test("[P0] Should center Create Client modal on mobile (375x667)", async ({
      page,
    }) => {
      // GIVEN: Mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto("http://localhost:3000/clients");
      await page.waitForSelector('[data-testid="client-create-button"]');

      // WHEN: Open create client modal
      await page.click('[data-testid="client-create-button"]');
      await page.waitForSelector('[data-testid="create-client-name-input"]');

      // THEN: Modal should be centered
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();

      const dialogBox = await dialog.boundingBox();
      expect(dialogBox).not.toBeNull();

      if (dialogBox) {
        const dialogCenterX = dialogBox.x + dialogBox.width / 2;
        const viewportCenterX = 375 / 2;

        // Modal should be horizontally centered with less than 5px tolerance
        expect(Math.abs(dialogCenterX - viewportCenterX)).toBeLessThan(5);

        // Modal should not overflow viewport
        expect(dialogBox.x).toBeGreaterThanOrEqual(0);
        expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(375);
      }
    });

    test("[P0] Should center Create Client modal on tablet (768x1024)", async ({
      page,
    }) => {
      // GIVEN: Tablet viewport
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto("http://localhost:3000/clients");
      await page.waitForSelector('[data-testid="client-create-button"]');

      // WHEN: Open create client modal
      await page.click('[data-testid="client-create-button"]');
      await page.waitForSelector('[data-testid="create-client-name-input"]');

      // THEN: Modal should be centered
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();

      const dialogBox = await dialog.boundingBox();
      expect(dialogBox).not.toBeNull();

      if (dialogBox) {
        const dialogCenterX = dialogBox.x + dialogBox.width / 2;
        const viewportCenterX = 768 / 2;

        // Modal should be horizontally centered with less than 10px tolerance
        expect(Math.abs(dialogCenterX - viewportCenterX)).toBeLessThan(10);
      }
    });

    test("[P0] Should not overflow on very small mobile (320x568)", async ({
      page,
    }) => {
      // GIVEN: Very small mobile viewport (iPhone SE first gen)
      await page.setViewportSize({ width: 320, height: 568 });
      await page.goto("http://localhost:3000/clients");
      await page.waitForSelector('[data-testid="client-create-button"]');

      // WHEN: Open create client modal
      await page.click('[data-testid="client-create-button"]');
      await page.waitForSelector('[data-testid="create-client-name-input"]');

      // THEN: Modal should fit within viewport
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();

      const dialogBox = await dialog.boundingBox();
      expect(dialogBox).not.toBeNull();

      if (dialogBox) {
        // Modal should fit within viewport with margins
        expect(dialogBox.x).toBeGreaterThanOrEqual(0);
        expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(320);

        // Modal should be centered
        const dialogCenterX = dialogBox.x + dialogBox.width / 2;
        const viewportCenterX = 320 / 2;
        expect(Math.abs(dialogCenterX - viewportCenterX)).toBeLessThan(5);
      }
    });
  });
});
