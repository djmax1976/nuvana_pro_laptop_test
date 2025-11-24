import { test, expect, Page } from "@playwright/test";
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
 * Rewritten from scratch for reliability in CI/CD environments
 *
 * Key improvements:
 * - Proper page load detection
 * - Reliable waits for data fetching
 * - Clear test isolation
 * - Better error messages
 *
 * Priority: P0 (Critical - Authentication foundation)
 */

test.describe.configure({ mode: "serial" });

// Helper functions for reliable page interactions
class ClientDetailPage {
  constructor(private page: Page) {}

  async goto(clientPublicId: string) {
    await this.page.goto(`http://localhost:3000/clients/${clientPublicId}`);
  }

  async waitForPageLoad() {
    // Wait for page to be fully loaded with data
    await this.page.waitForSelector(
      '[data-testid="client-detail-page-loaded"]',
      {
        state: "visible",
        timeout: 45000, // Increased for CI/CD
      },
    );
  }

  async waitForFormReady() {
    // Wait for form inputs to be interactive
    await this.page.waitForSelector('[data-testid="client-email-input"]', {
      state: "visible",
      timeout: 15000,
    });
  }

  async fillPassword(password: string) {
    const input = this.page.locator('[data-testid="client-password-input"]');
    await input.waitFor({ state: "visible", timeout: 10000 });
    await input.clear();
    await input.fill(password);
  }

  async fillConfirmPassword(password: string) {
    const input = this.page.locator(
      '[data-testid="client-confirm-password-input"]',
    );
    await input.waitFor({ state: "visible", timeout: 10000 });
    await input.clear();
    await input.fill(password);
  }

  async submit() {
    const button = this.page.locator('[data-testid="client-submit-button"]');
    await button.waitFor({ state: "visible" });
    await expect(button).toBeEnabled();
    await button.click();
  }

  async waitForSubmitComplete() {
    // Wait for network to settle after submission
    await this.page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});
    // Extra wait for database transaction
    await this.page.waitForTimeout(2000);
  }
}

test.describe("Client Form Email and Password E2E", () => {
  let testClient: any;
  let testUser: any;

  test.beforeAll(async () => {
    // Create a test client with user for editing tests
    const passwordHash = await bcrypt.hash("password123", 10);

    // Get CLIENT_OWNER role
    const clientOwnerRole = await prisma.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    if (!clientOwnerRole) {
      throw new Error("CLIENT_OWNER role not found - run RBAC seed first");
    }

    // Create User
    testUser = await prisma.user.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        email: "test-client-edit@example.com",
        name: "Test Client User",
        password_hash: passwordHash,
        status: "ACTIVE",
      },
    });

    // Create Client
    testClient = await prisma.client.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.CLIENT),
        name: "Test Client User",
        email: "test-client-edit@example.com",
        status: "ACTIVE",
      },
    });

    // Link via UserRole
    await prisma.userRole.create({
      data: {
        user_id: testUser.user_id,
        role_id: clientOwnerRole.role_id,
        client_id: testClient.client_id,
        assigned_by: testUser.user_id,
      },
    });
  });

  test.afterAll(async () => {
    // Clean up test data
    if (testClient) {
      await prisma.userRole
        .deleteMany({
          where: { user_id: testUser.user_id },
        })
        .catch(() => {});

      await prisma.user
        .delete({
          where: { user_id: testUser.user_id },
        })
        .catch(() => {});

      await prisma.client
        .delete({
          where: { client_id: testClient.client_id },
        })
        .catch(() => {});
    }

    await prisma.$disconnect();
  });

  test.describe("Edit Client Form", () => {
    test("[P0] Should pre-fill email field when editing client", async ({
      page,
    }) => {
      const clientPage = new ClientDetailPage(page);

      await clientPage.goto(testClient.public_id);
      await clientPage.waitForPageLoad();
      await clientPage.waitForFormReady();

      // Verify email is pre-filled
      const emailInput = page.locator('[data-testid="client-email-input"]');
      await expect(emailInput).toHaveValue("test-client-edit@example.com");
    });

    test("[P0] Should show password placeholder indicating optional update", async ({
      page,
    }) => {
      const clientPage = new ClientDetailPage(page);

      await clientPage.goto(testClient.public_id);
      await clientPage.waitForPageLoad();
      await clientPage.waitForFormReady();

      // Check password field has dots placeholder
      const passwordInput = page.locator(
        '[data-testid="client-password-input"]',
      );
      await expect(passwordInput).toHaveAttribute("placeholder", "••••••••");

      // Check confirm password field
      const confirmInput = page.locator(
        '[data-testid="client-confirm-password-input"]',
      );
      await expect(confirmInput).toHaveAttribute("placeholder", "••••••••");

      // Check label indicates optional
      await expect(
        page.locator("text=Password (leave blank to keep current)").first(),
      ).toBeVisible();
    });

    test("[P0] Should successfully update client password", async ({
      page,
    }) => {
      const clientPage = new ClientDetailPage(page);
      const uniquePassword = `newPassword${Date.now()}`;

      // Get current password hash
      const currentUser = await prisma.user.findUnique({
        where: { user_id: testUser.user_id },
      });
      const originalHash = currentUser!.password_hash;

      // Navigate and wait for page to load
      await clientPage.goto(testClient.public_id);
      await clientPage.waitForPageLoad();
      await clientPage.waitForFormReady();

      // Fill password fields
      await clientPage.fillPassword(uniquePassword);
      await clientPage.fillConfirmPassword(uniquePassword);

      // Submit form
      await clientPage.submit();
      await clientPage.waitForSubmitComplete();

      // Verify password was updated in database
      await prisma.$disconnect();
      await prisma.$connect();

      const updatedUser = await prisma.user.findUnique({
        where: { user_id: testUser.user_id },
      });

      expect(updatedUser).toBeDefined();
      expect(updatedUser?.password_hash).not.toBe(originalHash);

      // Verify new password works
      if (updatedUser?.password_hash) {
        const passwordMatch = await bcrypt.compare(
          uniquePassword,
          updatedUser.password_hash,
        );
        expect(passwordMatch).toBe(true);
      }
    });

    test("[P0] Should show validation error when passwords do not match", async ({
      page,
    }) => {
      const clientPage = new ClientDetailPage(page);

      await clientPage.goto(testClient.public_id);
      await clientPage.waitForPageLoad();
      await clientPage.waitForFormReady();

      // Fill with mismatched passwords
      await clientPage.fillPassword("newPassword123");
      await clientPage.fillConfirmPassword("differentPassword123");

      // Try to submit
      await clientPage.submit();

      // Should see validation error
      await expect(page.locator("text=Passwords do not match")).toBeVisible();
    });

    test("[P0] Should keep existing password when field is left blank", async ({
      page,
    }) => {
      const clientPage = new ClientDetailPage(page);

      // Get current password hash
      const currentUser = await prisma.user.findUnique({
        where: { user_id: testUser.user_id },
      });
      const originalHash = currentUser!.password_hash;

      // Navigate and wait
      await clientPage.goto(testClient.public_id);
      await clientPage.waitForPageLoad();
      await clientPage.waitForFormReady();

      // Change name but leave password blank
      const nameInput = page.locator('[data-testid="client-name-input"]');
      await nameInput.waitFor({ state: "visible", timeout: 10000 });
      await nameInput.clear();
      await nameInput.fill("Updated Name");

      // Submit without touching password fields
      await clientPage.submit();
      await clientPage.waitForSubmitComplete();

      // Verify password DID NOT change
      await prisma.$disconnect();
      await prisma.$connect();

      const updatedUser = await prisma.user.findUnique({
        where: { user_id: testUser.user_id },
      });

      expect(updatedUser?.password_hash).toBe(originalHash);
    });
  });
});
