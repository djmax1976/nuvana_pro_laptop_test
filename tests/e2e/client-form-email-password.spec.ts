import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";

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

test.describe("Client Form Email and Password E2E", () => {
  let superadminUser: any;
  let testClient: any;

  test.beforeAll(async () => {
    // Clean up any existing test data first
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
    // Cleanup: Delete test data
    if (testClient) {
      await prisma.client
        .delete({
          where: { client_id: testClient.client_id },
        })
        .catch(() => {}); // Ignore if already deleted
    }

    // Clean up any clients created during tests
    await prisma.client.deleteMany({
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
          ],
        },
      },
    });

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
    await page.fill('input[type="email"]', "superadmin-client-form@test.com");
    await page.fill('input[type="password"]', "TestPassword123!");
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForURL("**/dashboard");
  });

  test.describe("Create Client Form", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("http://localhost:3000/clients/new");
      await page.waitForSelector('[data-testid="client-name-input"]');
    });

    test("[P0] Should display email and password fields in create form", async ({
      page,
    }) => {
      // THEN: Email field is visible
      const emailInput = page.locator('[data-testid="client-email-input"]');
      await expect(emailInput).toBeVisible();
      await expect(emailInput).toHaveAttribute("type", "email");
      await expect(emailInput).toHaveAttribute(
        "placeholder",
        "client@example.com",
      );
      await expect(emailInput).toHaveAttribute("autoComplete", "email");

      // AND: Password field is visible
      const passwordInput = page.locator(
        '[data-testid="client-password-input"]',
      );
      await expect(passwordInput).toBeVisible();
      await expect(passwordInput).toHaveAttribute("type", "password");
      await expect(passwordInput).toHaveAttribute(
        "autoComplete",
        "new-password",
      );
    });

    test("[P0] Should show validation error for missing email", async ({
      page,
    }) => {
      // WHEN: Submitting form without email
      await page.fill('[data-testid="client-name-input"]', "Test Client");
      await page.click('[data-testid="client-submit-button"]');

      // THEN: Validation error is displayed
      await expect(page.locator("text=Invalid email address")).toBeVisible();
    });

    test("[P0] Should show validation error for invalid email format", async ({
      page,
    }) => {
      // WHEN: Entering invalid email format
      await page.fill('[data-testid="client-name-input"]', "Test Client");
      await page.fill('[data-testid="client-email-input"]', "not-an-email");
      await page.click('[data-testid="client-submit-button"]');

      // THEN: Validation error is displayed
      await expect(page.locator("text=Invalid email address")).toBeVisible();
    });

    test("[P0] Should show validation error for short password", async ({
      page,
    }) => {
      // WHEN: Entering password shorter than 8 characters
      await page.fill('[data-testid="client-name-input"]', "Test Client");
      await page.fill('[data-testid="client-email-input"]', "test@example.com");
      await page.fill('[data-testid="client-password-input"]', "short");
      await page.click('[data-testid="client-submit-button"]');

      // THEN: Validation error is displayed
      await expect(
        page.locator("text=Password must be at least 8 characters"),
      ).toBeVisible();
    });

    test("[P0] Should successfully create client with email and password", async ({
      page,
    }) => {
      // WHEN: Filling form with valid data including email and password
      await page.fill(
        '[data-testid="client-name-input"]',
        "New Client with Auth",
      );
      await page.fill(
        '[data-testid="client-email-input"]',
        "newclient@example.com",
      );
      await page.fill('[data-testid="client-password-input"]', "securePass123");
      await page.click('[data-testid="client-submit-button"]');

      // THEN: Success toast is displayed
      await expect(
        page.locator("text=Client created successfully"),
      ).toBeVisible({ timeout: 10000 });

      // AND: Form is reset for next entry
      await expect(
        page.locator('[data-testid="client-name-input"]'),
      ).toHaveValue("");
      await expect(
        page.locator('[data-testid="client-email-input"]'),
      ).toHaveValue("");
      await expect(
        page.locator('[data-testid="client-password-input"]'),
      ).toHaveValue("");
    });

    test("[P0] Should successfully create client with email but no password", async ({
      page,
    }) => {
      // WHEN: Creating client without password (optional)
      await page.fill(
        '[data-testid="client-name-input"]',
        "Client Without Password",
      );
      await page.fill(
        '[data-testid="client-email-input"]',
        "nopass@example.com",
      );
      // Leave password empty
      await page.click('[data-testid="client-submit-button"]');

      // THEN: Client is created successfully
      await expect(
        page.locator("text=Client created successfully"),
      ).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe("Edit Client Form", () => {
    test.beforeEach(async () => {
      // Create a test client for editing
      const passwordHash = await bcrypt.hash("password123", 10);
      testClient = await prisma.client.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.CLIENT),
          name: "Existing Client",
          email: "existing@example.com",
          password_hash: passwordHash,
          status: "ACTIVE",
        },
      });
    });

    test.afterEach(async () => {
      // Clean up test client
      if (testClient) {
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
      // Get original password hash
      const originalHash = testClient.password_hash;

      // WHEN: Updating password
      await page.goto(`http://localhost:3000/clients/${testClient.public_id}`);
      await page.waitForSelector('[data-testid="client-password-input"]');

      await page.fill(
        '[data-testid="client-password-input"]',
        "newPassword456",
      );
      await page.click('[data-testid="client-submit-button"]');

      // THEN: Update is successful
      await expect(
        page.locator("text=Client updated successfully"),
      ).toBeVisible({ timeout: 10000 });

      // AND: Password hash is changed in database
      const updatedClient = await prisma.client.findUnique({
        where: { client_id: testClient.client_id },
      });
      expect(updatedClient?.password_hash).not.toBe(originalHash);
    });

    test("[P0] Should keep existing password when field is left blank", async ({
      page,
    }) => {
      // Get original password hash
      const originalHash = testClient.password_hash;

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

      // AND: Password hash remains unchanged
      const updatedClient = await prisma.client.findUnique({
        where: { client_id: testClient.client_id },
      });
      expect(updatedClient?.password_hash).toBe(originalHash);
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
      await page.goto("http://localhost:3000/clients/new");
      await page.waitForSelector('[data-testid="client-name-input"]');

      // THEN: Email field has label and description
      await expect(page.locator('label:has-text("Email")')).toBeVisible();
      await expect(
        page.locator(
          "text=Client email address (required, max 255 characters)",
        ),
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
});
