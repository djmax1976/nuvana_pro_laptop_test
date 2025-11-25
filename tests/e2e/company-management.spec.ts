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

test.describe.configure({ mode: "serial" });

test.describe("Company Management E2E", () => {
  let superadminUser: any;
  let testClient: any;
  let testCompany: any;

  test.beforeAll(async () => {
    // Clean up existing test data (delete userRoles before users to avoid FK violations)
    const existingUsers = await prisma.user.findMany({
      where: { email: "company-e2e@test.com" },
      select: { user_id: true },
    });

    for (const user of existingUsers) {
      await prisma.userRole.deleteMany({
        where: { user_id: user.user_id },
      });
    }

    await prisma.user.deleteMany({
      where: { email: "company-e2e@test.com" },
    });

    // Create superadmin user
    const hashedPassword = await bcrypt.hash("TestPassword123!", 10);
    superadminUser = await prisma.user.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
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
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.CLIENT),
        email: `test-${Date.now()}@example.com`,
        name: "E2E Test Client for Companies",
        status: "ACTIVE",
      },
    });

    // Create test company
    testCompany = await prisma.company.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
        name: "E2E Test Company",
        status: "ACTIVE",
        client_id: testClient.client_id,
      },
    });
  });

  test.afterAll(async () => {
    // Cleanup: Delete test data using helper (respects FK constraints)
    await cleanupTestData(prisma, {
      companies: testCompany ? [testCompany.company_id] : [],
      clients: testClient ? [testClient.client_id] : [],
      users: superadminUser ? [superadminUser.user_id] : [],
    });

    await prisma.$disconnect();
  });

  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto("http://localhost:3000/login");

    // Wait for login form to be ready
    await page.waitForLoadState("networkidle");

    // Fill in credentials
    const emailInput = page.locator('input[type="email"]');
    await emailInput.waitFor({ state: "visible", timeout: 10000 });
    await emailInput.fill("company-e2e@test.com");

    const passwordInput = page.locator('input[type="password"]');
    await passwordInput.fill("TestPassword123!");

    // Submit login
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // Wait for redirect to dashboard - with longer timeout
    await page.waitForURL("**/dashboard", { timeout: 15000 });

    // Ensure we're actually logged in by waiting for dashboard to load
    await page.waitForLoadState("networkidle");
  });

  test("[P0] Should load companies list page", async ({ page }) => {
    await page.goto("http://localhost:3000/companies");

    // Wait for page to load
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/companies$/);

    // Verify companies table/list is visible
    await expect(page.locator("table, [role='table']")).toBeVisible({
      timeout: 10000,
    });
  });

  test("[P0] Should open edit modal when clicking Edit button", async ({
    page,
  }) => {
    await page.goto("http://localhost:3000/companies");
    const companyRow = page
      .locator(`tr:has-text("${testCompany.name}")`)
      .first();
    await expect(companyRow).toBeVisible({ timeout: 10000 });

    // Click the Edit button (Pencil icon) in the row - using getByRole with accessible name
    const editButton = companyRow.getByRole("button", { name: "Edit" });
    await editButton.click();

    // Verify the EditCompanyModal opens
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(modal.locator("text=Edit Company")).toBeVisible();
  });

  test("[P0] Should verify company name is read-only in edit modal", async ({
    page,
  }) => {
    await page.goto("http://localhost:3000/companies");

    // Click the Edit button to open modal
    const companyRow = page
      .locator(`tr:has-text("${testCompany.name}")`)
      .first();
    await expect(companyRow).toBeVisible({ timeout: 10000 });
    const editButton = companyRow.getByRole("button", { name: "Edit" });
    await editButton.click();

    // Wait for modal to open
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(modal.locator("text=Edit Company")).toBeVisible();

    // Verify company name is displayed as read-only with explanation text
    await expect(
      modal.locator("text=Company name cannot be changed"),
    ).toBeVisible();

    // Verify the name value is displayed (read-only, not an input)
    await expect(modal.locator(`text=${testCompany.name}`)).toBeVisible();

    // Verify there's no input field for name (it's truly read-only)
    const nameInputs = modal.locator('input[value="' + testCompany.name + '"]');
    await expect(nameInputs).toHaveCount(0);

    // Verify status field IS editable (has combobox role)
    const statusSelect = modal.locator('button[role="combobox"]');
    await expect(statusSelect).toBeVisible();

    // Close modal
    await modal.getByRole("button", { name: "Cancel" }).click();
  });

  test("[P0] Should verify company's client assignment is read-only", async ({
    page,
  }) => {
    await page.goto("http://localhost:3000/companies");

    // Click the Edit button to open modal
    const companyRow = page
      .locator(`tr:has-text("${testCompany.name}")`)
      .first();
    await expect(companyRow).toBeVisible({ timeout: 10000 });
    const editButton = companyRow.getByRole("button", { name: "Edit" });
    await editButton.click();

    // Wait for modal to open
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Verify client assignment is displayed as read-only with explanation text
    await expect(
      modal.locator("text=Client assignment cannot be changed").first(),
    ).toBeVisible();

    // Verify the client value is displayed (read-only, not a select)
    await expect(modal.locator(`text=${testClient.name}`)).toBeVisible();

    // Verify company still has correct client_id
    const company = await prisma.company.findUnique({
      where: { company_id: testCompany.company_id },
    });
    expect(company?.client_id).toBe(testClient.client_id);
  });

  test("[P0] Should create a new company", async ({ page }) => {
    await page.goto("http://localhost:3000/companies");

    //Click Create Company button
    const createButton = page.getByRole("link", {
      name: /create company/i,
    });
    await createButton.click();

    // Wait for navigation to create page
    await page.waitForURL(/\/companies\/new/);

    const newCompanyName = `New E2E Company ${Date.now()}`;

    // Fill in company name
    const nameInput = page.locator('input[name="name"]');
    await nameInput.fill(newCompanyName);

    // Select client
    const clientSelect = page.locator('button[role="combobox"]').first();
    await clientSelect.click();
    await page.locator('[role="option"]').first().click();

    // Select status
    await page.waitForTimeout(500);
    const statusSelect = page.locator('button[role="combobox"]').last();
    await statusSelect.click();
    await page.locator('[role="option"]:has-text("Active")').first().click();

    // Submit form
    await page.getByRole("button", { name: /create company/i }).click();
    await page.waitForTimeout(2000);

    // Verify company was created
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

  test("[P1] Should show validation error when creating company with empty name", async ({
    page,
  }) => {
    await page.goto("http://localhost:3000/companies");

    // Click "New Company" button
    const createButton = page.getByRole("button", {
      name: /new company|create company/i,
    });
    await createButton.click();

    // Wait for navigation to create page
    await page.waitForURL(/\/companies\/new/);

    // Try to submit without filling name
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // Verify validation error appears
    const errorMessage = page.locator("text=/company name is required/i");
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  test("[P0] Should prevent deletion of ACTIVE company", async ({ page }) => {
    await prisma.company.update({
      where: { company_id: testCompany.company_id },
      data: { status: "ACTIVE" },
    });

    await page.goto("http://localhost:3000/companies");

    // Find the company row
    const companyRow = page
      .locator(`tr:has-text("${testCompany.name}")`)
      .first();
    await expect(companyRow).toBeVisible({ timeout: 10000 });

    // Verify delete button (Trash icon) is disabled for ACTIVE company
    const deleteButton = companyRow.getByRole("button", { name: "Delete" });
    await expect(deleteButton).toBeDisabled();
  });

  test("[P1] Should successfully delete INACTIVE company", async ({ page }) => {
    const companyToDelete = await prisma.company.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
        name: "Company to Delete E2E",
        status: "INACTIVE",
        client_id: testClient.client_id,
      },
    });

    await page.goto("http://localhost:3000/companies");

    // Find the company row
    const companyRow = page
      .locator(`tr:has-text("${companyToDelete.name}")`)
      .first();
    await expect(companyRow).toBeVisible({ timeout: 10000 });

    // Click delete button (Trash icon) - should be enabled for INACTIVE company
    const deleteButton = companyRow.getByRole("button", { name: "Delete" });
    await expect(deleteButton).toBeEnabled();
    await deleteButton.click();

    // Wait for confirmation dialog to open
    const confirmDialog = page.locator('[role="alertdialog"]');
    await expect(confirmDialog).toBeVisible({ timeout: 5000 });

    // Type "DELETE" in the confirmation textbox
    const confirmInput = confirmDialog.getByPlaceholder("DELETE");
    await confirmInput.fill("DELETE");

    // Now the "Delete Permanently" button should be enabled
    const confirmButton = confirmDialog.getByRole("button", {
      name: /delete permanently/i,
    });
    await expect(confirmButton).toBeEnabled({ timeout: 2000 });
    await confirmButton.click();
    await page.waitForTimeout(1500);

    // Verify soft deletion occurred
    const deletedCompany = await prisma.company.findUnique({
      where: { company_id: companyToDelete.company_id },
    });
    expect(deletedCompany?.deleted_at).not.toBeNull();
  });

  test("[P1] Should display properly on mobile screens", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("http://localhost:3000/companies");
    await page.waitForLoadState("networkidle");

    // Verify companies list is visible on mobile
    const companiesList = page.locator("table, [role='table']");
    await expect(companiesList).toBeVisible();

    // Verify viewport is correctly set
    const viewport = page.viewportSize();
    expect(viewport?.width).toBe(375);

    // Verify we can interact with a company on mobile
    const companyRow = page
      .locator(`tr:has-text("${testCompany.name}")`)
      .first();
    await expect(companyRow).toBeVisible({ timeout: 10000 });
  });
});
