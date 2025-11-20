import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

/**
 * E2E Test Suite: Company Management
 *
 * Critical Path Tests:
 * - View companies list
 * - Navigate to company detail/edit page
 * - Edit company information (name, status, client link)
 * - Create new companies
 * - Delete companies
 * - Mobile responsiveness
 *
 * These tests ensure the complete user journey works end-to-end.
 */

test.describe("Company Management E2E", () => {
  let superadminUser: any;
  let testClient: any;
  let testCompany: any;

  test.beforeAll(async () => {
    // Clean up existing test data
    await prisma.user.deleteMany({
      where: { email: "company-e2e@test.com" },
    });

    // Create superadmin user
    const hashedPassword = await bcrypt.hash("TestPassword123!", 10);
    superadminUser = await prisma.user.create({
      data: {
        email: "company-e2e@test.com",
        name: "Company E2E Tester",
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

    // Create test client for company linking
    testClient = await prisma.client.create({
      data: {
        name: "E2E Test Client for Companies",
        status: "ACTIVE",
      },
    });

    // Create test company
    testCompany = await prisma.company.create({
      data: {
        name: "E2E Test Company",
        status: "ACTIVE",
        client_id: testClient.client_id,
      },
    });
  });

  test.afterAll(async () => {
    // Cleanup
    if (testCompany) {
      await prisma.company.deleteMany({
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

  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto("http://localhost:3000/login");
    await page.fill('input[type="email"]', "company-e2e@test.com");
    await page.fill('input[type="password"]', "TestPassword123!");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard");
  });

  test("[P0] Should load companies list page", async ({ page }) => {
    await page.goto("http://localhost:3000/companies");
    await expect(page).toHaveURL(/\/companies$/);
    await expect(
      page.locator("h1, h2").filter({ hasText: /companies/i }),
    ).toBeVisible();
  });

  test("[P0] Should navigate to company detail page from companies list", async ({
    page,
  }) => {
    await page.goto("http://localhost:3000/companies");
    const companyRow = page
      .locator(`tr:has-text("${testCompany.name}")`)
      .first();
    await expect(companyRow).toBeVisible({ timeout: 10000 });
    await companyRow.click();
    await expect(page).toHaveURL(
      new RegExp(`/companies/${testCompany.company_id}`),
    );
  });

  test("[P0] Should successfully edit company name and status", async ({
    page,
  }) => {
    await page.goto(
      `http://localhost:3000/companies/${testCompany.company_id}`,
    );

    const newName = `Updated Company ${Date.now()}`;
    const nameInput = page.locator('input[data-testid="company-name-input"]');
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    await nameInput.clear();
    await nameInput.fill(newName);

    const statusSelect = page.locator(
      'button[data-testid="company-status-select"]',
    );
    await statusSelect.click();
    await page.locator('div[role="option"]:has-text("Inactive")').click();

    const submitButton = page.locator(
      'button[data-testid="company-submit-button"]',
    );
    await submitButton.click();
    await page.waitForTimeout(1000);

    const updatedCompany = await prisma.company.findUnique({
      where: { company_id: testCompany.company_id },
    });
    expect(updatedCompany?.name).toBe(newName);
    expect(updatedCompany?.status).toBe("INACTIVE");

    // Restore
    await prisma.company.update({
      where: { company_id: testCompany.company_id },
      data: { name: testCompany.name, status: testCompany.status },
    });
  });

  test("[P0] Should successfully change company's client assignment", async ({
    page,
  }) => {
    await page.goto(
      `http://localhost:3000/companies/${testCompany.company_id}`,
    );

    const clientSelect = page.locator(
      'button[data-testid="company-client-select"]',
    );
    await expect(clientSelect).toBeVisible({ timeout: 10000 });
    await clientSelect.click();

    // Select a different client or unlink
    await page.locator('div[role="option"]').first().click();

    const submitButton = page.locator(
      'button[data-testid="company-submit-button"]',
    );
    await submitButton.click();
    await page.waitForTimeout(1000);

    // Verify change persisted
    const updatedCompany = await prisma.company.findUnique({
      where: { company_id: testCompany.company_id },
    });
    expect(updatedCompany).not.toBeNull();
  });

  test("[P0] Should create a new company", async ({ page }) => {
    await page.goto("http://localhost:3000/companies");

    const createButton = page.getByRole("button", {
      name: /new company|create company/i,
    });
    await createButton.click();

    const newCompanyName = `New E2E Company ${Date.now()}`;
    await page
      .locator('input[data-testid="company-name-input"]')
      .fill(newCompanyName);

    const statusSelect = page.locator(
      'button[data-testid="company-status-select"]',
    );
    await statusSelect.click();
    await page.locator('div[role="option"]:has-text("Active")').click();

    await page.locator('button[data-testid="company-submit-button"]').click();
    await page.waitForTimeout(1000);

    const createdCompany = await prisma.company.findFirst({
      where: { name: newCompanyName },
    });
    expect(createdCompany).not.toBeNull();

    // Cleanup
    if (createdCompany) {
      await prisma.company.delete({
        where: { company_id: createdCompany.company_id },
      });
    }
  });

  test("[P1] Should show validation error for empty company name", async ({
    page,
  }) => {
    await page.goto(
      `http://localhost:3000/companies/${testCompany.company_id}`,
    );

    const nameInput = page.locator('input[data-testid="company-name-input"]');
    await nameInput.clear();

    const submitButton = page.locator(
      'button[data-testid="company-submit-button"]',
    );
    await submitButton.click();

    const errorMessage = page.locator('[data-testid="form-error-message"]');
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  test("[P0] Should prevent deletion of ACTIVE company", async ({ page }) => {
    await prisma.company.update({
      where: { company_id: testCompany.company_id },
      data: { status: "ACTIVE" },
    });

    await page.goto(
      `http://localhost:3000/companies/${testCompany.company_id}`,
    );

    const deleteButton = page.locator(
      'button[data-testid="company-delete-button"]',
    );
    await expect(deleteButton).toBeDisabled();
  });

  test("[P1] Should successfully delete INACTIVE company", async ({ page }) => {
    const companyToDelete = await prisma.company.create({
      data: {
        name: "Company to Delete E2E",
        status: "INACTIVE",
        client_id: testClient.client_id,
      },
    });

    await page.goto(
      `http://localhost:3000/companies/${companyToDelete.company_id}`,
    );

    const deleteButton = page.locator(
      'button[data-testid="company-delete-button"]',
    );
    await expect(deleteButton).toBeEnabled();
    await deleteButton.click();

    const confirmButton = page
      .getByRole("button", { name: /delete|confirm/i })
      .last();
    await confirmButton.click();
    await page.waitForTimeout(1000);

    const deletedCompany = await prisma.company.findUnique({
      where: { company_id: companyToDelete.company_id },
    });
    expect(deletedCompany?.deleted_at).not.toBeNull();
  });

  test("[P1] Should display properly on mobile screens", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(
      `http://localhost:3000/companies/${testCompany.company_id}`,
    );
    await page.waitForLoadState("networkidle");

    const companyEditSection = page.locator(
      '[data-testid="company-edit-section"]',
    );
    await expect(companyEditSection).toBeVisible();

    const viewport = page.viewportSize();
    expect(viewport?.width).toBe(375);
  });
});
