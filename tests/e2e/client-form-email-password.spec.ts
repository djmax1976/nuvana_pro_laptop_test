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
    // Navigate and wait for the page to fully load (not just HTML, but network too)
    await this.page.goto(`http://localhost:3000/clients/${clientPublicId}`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    // Extra safety: wait a bit for React hydration
    await this.page.waitForTimeout(1000);
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

    // CRITICAL FIX: Wait for any ongoing data fetches to complete
    // This ensures form has fresh data, not stale cache
    await this.page.waitForSelector('[data-is-fetching="false"]', {
      timeout: 10000,
    });

    // Extra safety: wait for network to be idle
    await this.page
      .waitForLoadState("networkidle", { timeout: 5000 })
      .catch(() => {});

    // Small buffer for React rendering and form state sync
    await this.page.waitForTimeout(500);
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

    // CRITICAL FIX: Wait for React Query to refetch fresh data after mutation
    // This ensures the form has synced with server state before test assertions
    await this.page.waitForSelector('[data-is-fetching="false"]', {
      timeout: 10000,
    });

    // Extra wait for database transaction and form state sync
    await this.page.waitForTimeout(2000);
  }
}

test.describe("Client Form Email and Password E2E", () => {
  let testClient: any;
  let testUser: any;
  let superadminUser: any;

  test.beforeAll(async () => {
    // Clean up any existing superadmin user
    const existingUsers = await prisma.user.findMany({
      where: { email: "superadmin-client-form-e2e@test.com" },
      select: { user_id: true },
    });

    for (const user of existingUsers) {
      await prisma.userRole.deleteMany({
        where: { user_id: user.user_id },
      });
    }

    await prisma.user.deleteMany({
      where: { email: "superadmin-client-form-e2e@test.com" },
    });

    // Create superadmin user for testing
    const hashedPassword = await bcrypt.hash("TestPassword123!", 10);

    const superadminRole = await prisma.role.findUnique({
      where: { code: "SUPERADMIN" },
    });

    if (!superadminRole) {
      throw new Error(
        "SUPERADMIN role not found - run: npx ts-node tests/support/seed-roles.ts",
      );
    }

    superadminUser = await prisma.user.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
        email: "superadmin-client-form-e2e@test.com",
        name: "Superadmin Client Form E2E",
        password_hash: hashedPassword,
        status: "ACTIVE",
      },
    });

    await prisma.userRole.create({
      data: {
        user_id: superadminUser.user_id,
        role_id: superadminRole.role_id,
        assigned_by: superadminUser.user_id,
      },
    });
  });

  test.beforeEach(async ({ page }) => {
    // CRITICAL FIX: Recreate test client before each test
    // This ensures the client exists even after database cleanup between burn-in iterations
    const passwordHash = await bcrypt.hash("password123", 10);

    // Get CLIENT_OWNER role
    const clientOwnerRole = await prisma.role.findUnique({
      where: { code: "CLIENT_OWNER" },
    });

    if (!clientOwnerRole) {
      throw new Error("CLIENT_OWNER role not found - run RBAC seed first");
    }

    // Clean up any existing test client/user
    const existingTestUser = await prisma.user.findUnique({
      where: { email: "test-client-edit@example.com" },
    });

    if (existingTestUser) {
      await prisma.userRole.deleteMany({
        where: { user_id: existingTestUser.user_id },
      });
      await prisma.user.delete({
        where: { user_id: existingTestUser.user_id },
      });
    }

    const existingTestClient = await prisma.client.findFirst({
      where: { email: "test-client-edit@example.com" },
    });

    if (existingTestClient) {
      await prisma.client.delete({
        where: { client_id: existingTestClient.client_id },
      });
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

    // CRITICAL: Ensure database operations are fully committed
    // Small delay to prevent race conditions where API reads before commit completes
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Login before each test as superadmin
    await page.goto("http://localhost:3000/login");
    await page.fill(
      'input[type="email"]',
      "superadmin-client-form-e2e@test.com",
    );
    await page.fill('input[type="password"]', "TestPassword123!");
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForURL("**/dashboard");
  });

  test.afterEach(async () => {
    // Clean up test client and user after each test
    // This keeps the database clean between tests
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
  });

  test.afterAll(async () => {
    // Clean up superadmin user
    if (superadminUser) {
      await prisma.userRole
        .deleteMany({
          where: { user_id: superadminUser.user_id },
        })
        .catch(() => {});

      await prisma.user
        .delete({
          where: { user_id: superadminUser.user_id },
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
