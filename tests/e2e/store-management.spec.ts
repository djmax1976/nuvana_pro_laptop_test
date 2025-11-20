import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

/**
 * E2E Test Suite: Store Management
 *
 * Critical Path Tests:
 * - View stores list
 * - Navigate to store detail/edit page
 * - Edit store information (name, status, location, timezone)
 * - Create new stores
 * - Delete stores
 * - Store configuration (operating hours)
 * - Mobile responsiveness
 *
 * These tests ensure the complete user journey works end-to-end.
 */

test.describe("Store Management E2E", () => {
  let superadminUser: any;
  let testClient: any;
  let testCompany: any;
  let testStore: any;

  test.beforeAll(async () => {
    // Clean up existing test data
    await prisma.user.deleteMany({
      where: { email: "store-e2e@test.com" },
    });

    // Create superadmin user
    const hashedPassword = await bcrypt.hash("TestPassword123!", 10);
    superadminUser = await prisma.user.create({
      data: {
        email: "store-e2e@test.com",
        name: "Store E2E Tester",
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

    // Create test client
    testClient = await prisma.client.create({
      data: {
        name: "E2E Test Client for Stores",
        status: "ACTIVE",
      },
    });

    // Create test company
    testCompany = await prisma.company.create({
      data: {
        name: "E2E Test Company for Stores",
        status: "ACTIVE",
        client_id: testClient.client_id,
      },
    });

    // Create test store
    testStore = await prisma.store.create({
      data: {
        name: "E2E Test Store",
        status: "ACTIVE",
        company_id: testCompany.company_id,
        timezone: "America/New_York",
        location_json: {
          address: "123 Test St, Test City, TS 12345",
          gps: { lat: 40.7128, lng: -74.006 },
        },
      },
    });
  });

  test.afterAll(async () => {
    // Cleanup
    if (testStore) {
      await prisma.store.deleteMany({
        where: { store_id: testStore.store_id },
      });
    }
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
    await page.fill('input[type="email"]', "store-e2e@test.com");
    await page.fill('input[type="password"]', "TestPassword123!");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard");
  });

  test("[P0] Should load stores list page", async ({ page }) => {
    await page.goto("http://localhost:3000/stores");
    await expect(page).toHaveURL(/\/stores$/);
    await expect(
      page.locator("h1, h2").filter({ hasText: /stores/i }),
    ).toBeVisible();
  });

  test("[P0] Should navigate to store detail page from stores list", async ({
    page,
  }) => {
    await page.goto("http://localhost:3000/stores");
    const storeRow = page.locator(`tr:has-text("${testStore.name}")`).first();
    await expect(storeRow).toBeVisible({ timeout: 10000 });
    await storeRow.click();
    await expect(page).toHaveURL(new RegExp(`/stores/${testStore.store_id}`));
  });

  test("[P0] Should successfully edit store name and status", async ({
    page,
  }) => {
    await page.goto(`http://localhost:3000/stores/${testStore.store_id}/edit`);

    const newName = `Updated Store ${Date.now()}`;
    const nameInput = page.locator('input[data-testid="store-name-input"]');
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    await nameInput.clear();
    await nameInput.fill(newName);

    const statusSelect = page.locator(
      'button[data-testid="store-status-select"]',
    );
    await statusSelect.click();
    await page.locator('div[role="option"]:has-text("Inactive")').click();

    const submitButton = page.locator(
      'button[data-testid="store-submit-button"]',
    );
    await submitButton.click();
    await page.waitForTimeout(1000);

    const updatedStore = await prisma.store.findUnique({
      where: { store_id: testStore.store_id },
    });
    expect(updatedStore?.name).toBe(newName);
    expect(updatedStore?.status).toBe("INACTIVE");

    // Restore
    await prisma.store.update({
      where: { store_id: testStore.store_id },
      data: { name: testStore.name, status: testStore.status },
    });
  });

  test("[P0] Should successfully edit store location", async ({ page }) => {
    await page.goto(`http://localhost:3000/stores/${testStore.store_id}/edit`);

    const addressInput = page.locator(
      'input[data-testid="store-address-input"]',
    );
    await expect(addressInput).toBeVisible({ timeout: 10000 });
    await addressInput.clear();
    await addressInput.fill("456 New Address Ave, New City, NC 54321");

    const submitButton = page.locator(
      'button[data-testid="store-submit-button"]',
    );
    await submitButton.click();
    await page.waitForTimeout(1000);

    const updatedStore = await prisma.store.findUnique({
      where: { store_id: testStore.store_id },
    });
    expect(updatedStore?.location_json).toMatchObject({
      address: "456 New Address Ave, New City, NC 54321",
    });

    // Restore
    await prisma.store.update({
      where: { store_id: testStore.store_id },
      data: { location_json: testStore.location_json },
    });
  });

  test("[P0] Should successfully change store timezone", async ({ page }) => {
    await page.goto(`http://localhost:3000/stores/${testStore.store_id}/edit`);

    const timezoneSelect = page.locator(
      'button[data-testid="store-timezone-select"]',
    );
    await expect(timezoneSelect).toBeVisible({ timeout: 10000 });
    await timezoneSelect.click();
    await page
      .locator('div[role="option"]:has-text("America/Los_Angeles")')
      .click();

    const submitButton = page.locator(
      'button[data-testid="store-submit-button"]',
    );
    await submitButton.click();
    await page.waitForTimeout(1000);

    const updatedStore = await prisma.store.findUnique({
      where: { store_id: testStore.store_id },
    });
    expect(updatedStore?.timezone).toBe("America/Los_Angeles");

    // Restore
    await prisma.store.update({
      where: { store_id: testStore.store_id },
      data: { timezone: testStore.timezone },
    });
  });

  test("[P0] Should create a new store", async ({ page }) => {
    await page.goto("http://localhost:3000/stores");

    const createButton = page.getByRole("button", {
      name: /new store|create store/i,
    });
    await createButton.click();

    const newStoreName = `New E2E Store ${Date.now()}`;
    await page
      .locator('input[data-testid="store-name-input"]')
      .fill(newStoreName);

    // Select company
    const companySelect = page.locator(
      'button[data-testid="store-company-select"]',
    );
    await companySelect.click();
    await page
      .locator(`div[role="option"]:has-text("${testCompany.name}")`)
      .click();

    const statusSelect = page.locator(
      'button[data-testid="store-status-select"]',
    );
    await statusSelect.click();
    await page.locator('div[role="option"]:has-text("Active")').click();

    await page.locator('button[data-testid="store-submit-button"]').click();
    await page.waitForTimeout(1000);

    const createdStore = await prisma.store.findFirst({
      where: { name: newStoreName },
    });
    expect(createdStore).not.toBeNull();

    // Cleanup
    if (createdStore) {
      await prisma.store.delete({
        where: { store_id: createdStore.store_id },
      });
    }
  });

  test("[P0] Should successfully update store configuration (operating hours)", async ({
    page,
  }) => {
    await page.goto(
      `http://localhost:3000/stores/${testStore.store_id}/configuration`,
    );

    // Set Monday hours
    const mondayOpenInput = page.locator(
      'input[data-testid="operating-hours-monday-open"]',
    );
    await expect(mondayOpenInput).toBeVisible({ timeout: 10000 });
    await mondayOpenInput.clear();
    await mondayOpenInput.fill("09:00");

    const mondayCloseInput = page.locator(
      'input[data-testid="operating-hours-monday-close"]',
    );
    await mondayCloseInput.clear();
    await mondayCloseInput.fill("17:00");

    const submitButton = page.locator(
      'button[data-testid="configuration-submit-button"]',
    );
    await submitButton.click();
    await page.waitForTimeout(1000);

    const updatedStore = await prisma.store.findUnique({
      where: { store_id: testStore.store_id },
    });
    expect(updatedStore?.configuration).toMatchObject({
      operating_hours: {
        monday: {
          open: "09:00",
          close: "17:00",
        },
      },
    });
  });

  test("[P1] Should show validation error for empty store name", async ({
    page,
  }) => {
    await page.goto(`http://localhost:3000/stores/${testStore.store_id}/edit`);

    const nameInput = page.locator('input[data-testid="store-name-input"]');
    await nameInput.clear();

    const submitButton = page.locator(
      'button[data-testid="store-submit-button"]',
    );
    await submitButton.click();

    const errorMessage = page.locator('[data-testid="form-error-message"]');
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  test("[P1] Should show validation error for invalid timezone", async ({
    page,
  }) => {
    await page.goto(`http://localhost:3000/stores/${testStore.store_id}/edit`);

    const timezoneSelect = page.locator(
      'button[data-testid="store-timezone-select"]',
    );
    await timezoneSelect.click();
    await page
      .locator('div[role="option"]:has-text("Invalid/Timezone")')
      .click();

    const submitButton = page.locator(
      'button[data-testid="store-submit-button"]',
    );
    await submitButton.click();

    const errorMessage = page.locator("text=/invalid.*timezone/i");
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  test("[P1] Should prevent deletion of ACTIVE store", async ({ page }) => {
    await prisma.store.update({
      where: { store_id: testStore.store_id },
      data: { status: "ACTIVE" },
    });

    await page.goto(`http://localhost:3000/stores/${testStore.store_id}/edit`);

    const deleteButton = page.locator(
      'button[data-testid="store-delete-button"]',
    );
    await expect(deleteButton).toBeDisabled();
  });

  test("[P1] Should successfully delete INACTIVE store", async ({ page }) => {
    const storeToDelete = await prisma.store.create({
      data: {
        name: "Store to Delete E2E",
        status: "INACTIVE",
        company_id: testCompany.company_id,
        timezone: "America/New_York",
      },
    });

    await page.goto(
      `http://localhost:3000/stores/${storeToDelete.store_id}/edit`,
    );

    const deleteButton = page.locator(
      'button[data-testid="store-delete-button"]',
    );
    await expect(deleteButton).toBeEnabled();
    await deleteButton.click();

    const confirmButton = page
      .getByRole("button", { name: /delete|confirm/i })
      .last();
    await confirmButton.click();
    await page.waitForTimeout(1000);

    const deletedStore = await prisma.store.findUnique({
      where: { store_id: storeToDelete.store_id },
    });
    expect(deletedStore?.status).toBe("CLOSED");
  });

  test("[P1] Should display properly on mobile screens", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`http://localhost:3000/stores/${testStore.store_id}/edit`);
    await page.waitForLoadState("networkidle");

    const storeEditSection = page.locator('[data-testid="store-edit-section"]');
    await expect(storeEditSection).toBeVisible();

    const viewport = page.viewportSize();
    expect(viewport?.width).toBe(375);
  });

  test("[P1] Should display store configuration form properly on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(
      `http://localhost:3000/stores/${testStore.store_id}/configuration`,
    );
    await page.waitForLoadState("networkidle");

    const configForm = page.locator('[data-testid="store-configuration-form"]');
    await expect(configForm).toBeVisible();

    // Verify operating hours inputs are accessible
    const mondayOpenInput = page.locator(
      'input[data-testid="operating-hours-monday-open"]',
    );
    await expect(mondayOpenInput).toBeVisible();
  });
});
