import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";
import { cleanupTestData } from "../support/cleanup-helper";

// Initialize Prisma client lazily to ensure DATABASE_URL from test environment is used
let prisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url:
            process.env.DATABASE_URL ||
            "postgresql://postgres:postgres@localhost:5432/nuvana_test",
        },
      },
    });
  }
  return prisma;
}

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

test.describe.configure({ mode: "serial" });

test.describe("Store Management E2E", () => {
  let superadminUser: any;
  let testCompany: any;
  let testStore: any;

  test.beforeAll(async () => {
    console.log("[beforeAll] Starting test setup...");
    console.log(
      "[beforeAll] DATABASE_URL:",
      process.env.DATABASE_URL || "not set",
    );

    // Clean up existing test data (delete userRoles before users to avoid FK violations)
    const existingUsers = await getPrisma().user.findMany({
      where: { email: "store-e2e@test.com" },
      select: { user_id: true },
    });
    console.log("[beforeAll] Found existing users:", existingUsers.length);

    for (const user of existingUsers) {
      await getPrisma().userRole.deleteMany({
        where: { user_id: user.user_id },
      });
    }

    await getPrisma().user.deleteMany({
      where: { email: "store-e2e@test.com" },
    });

    // Create superadmin user
    const hashedPassword = await bcrypt.hash("TestPassword123!", 10);
    console.log(
      "[beforeAll] Creating user with password hash:",
      hashedPassword.substring(0, 20) + "...",
    );
    try {
      superadminUser = await getPrisma().user.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
          email: "store-e2e@test.com",
          name: "Store E2E Tester",
          password_hash: hashedPassword,
          status: "ACTIVE",
        },
      });
      console.log("[beforeAll] Created user:", superadminUser.user_id);
    } catch (err) {
      console.error("[beforeAll] Failed to create user:", err);
      throw err;
    }

    // Assign SUPERADMIN role
    const superadminRole = await getPrisma().role.findUnique({
      where: { code: "SUPERADMIN" },
    });
    console.log("[beforeAll] Found superadmin role:", superadminRole?.code);

    if (superadminRole) {
      await getPrisma().userRole.create({
        data: {
          user_id: superadminUser.user_id,
          role_id: superadminRole.role_id,
          assigned_by: superadminUser.user_id,
        },
      });
    }

    // Create test company owned by superadmin
    testCompany = await getPrisma().company.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
        name: "E2E Test Company for Stores",
        status: "ACTIVE",
        owner_user_id: superadminUser.user_id,
      },
    });

    // Create test store
    testStore = await getPrisma().store.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),

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
    // Cleanup: Delete test data using helper (respects FK constraints)
    await cleanupTestData(getPrisma(), {
      stores: testStore ? [testStore.store_id] : [],
      companies: testCompany ? [testCompany.company_id] : [],
      users: superadminUser ? [superadminUser.user_id] : [],
    });

    await getPrisma().$disconnect();
  });

  test.beforeEach(async ({ page }) => {
    // Login - use domcontentloaded for better CI reliability
    await page.goto("http://localhost:3000/login", {
      waitUntil: "domcontentloaded",
    });
    // Wait for login form to be ready
    await page.waitForLoadState("load");
    const emailInput = page.locator('input[type="email"]');
    await emailInput.waitFor({ state: "visible", timeout: 15000 });
    await emailInput.fill("store-e2e@test.com");
    await page.fill('input[type="password"]', "TestPassword123!");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 30000 });

    // Wait for auth session to be set in localStorage
    await page.waitForFunction(
      () => {
        const authSession = localStorage.getItem("auth_session");
        if (!authSession) return false;
        try {
          const data = JSON.parse(authSession);
          return data.authenticated === true && data.user != null;
        } catch {
          return false;
        }
      },
      { timeout: 30000 },
    );
  });

  test("[P0] Should load stores list page", async ({ page }) => {
    // WHEN: Navigating to stores page - use domcontentloaded for CI reliability
    await page.goto("http://localhost:3000/stores", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("load");

    // THEN: Should be on stores URL
    await expect(page).toHaveURL(/\/stores$/, { timeout: 15000 });

    // THEN: Page heading should be visible
    const heading = page.locator("h1, h2").filter({ hasText: /stores/i });
    await expect(heading).toBeVisible({ timeout: 15000 });

    // THEN: Either table OR empty state should be visible (exactly one)
    const table = page.locator("table");
    const emptyState = page.locator("text=No stores found");

    // Wait for at least one to appear
    await expect(table.or(emptyState)).toBeVisible({ timeout: 15000 });

    // Verify exactly one is visible (not both, not neither)
    const isTableVisible = await table.isVisible().catch(() => false);
    const isEmptyVisible = await emptyState.isVisible().catch(() => false);
    expect(isTableVisible || isEmptyVisible).toBe(true);
    expect(isTableVisible && isEmptyVisible).toBe(false);
  });

  test("[P0] Should open edit modal when clicking edit button in stores list", async ({
    page,
  }) => {
    await page.goto("http://localhost:3000/stores", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("load");

    const storeRow = page.locator(`tr:has-text("${testStore.name}")`).first();
    await expect(storeRow).toBeVisible({ timeout: 10000 });

    // Click the Edit button in the store row
    const editButton = storeRow.locator('button:has-text("Edit")');
    await expect(editButton).toBeVisible({ timeout: 5000 });
    await editButton.click();

    // Wait for edit modal to appear
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Verify the modal title or content indicates we're editing the store
    await expect(dialog.locator("h2, h3").first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("[P0] Should successfully edit store name and status", async ({
    page,
  }) => {
    // Set up API response listener BEFORE navigation (network-first pattern)
    const storeApiPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/stores/${testStore.store_id}`) &&
        resp.request().method() === "GET" &&
        resp.status() === 200,
      { timeout: 30000 },
    );

    await page.goto(`http://localhost:3000/stores/${testStore.store_id}/edit`);
    await page.waitForLoadState("load");

    // Wait for store API to complete - ensures form is populated with data
    await storeApiPromise;

    const newName = `Updated Store ${Date.now()}`;
    // Use form-specific selector to avoid conflict with Header loading skeleton
    // The header has aria-label="Loading store name" which matches getByLabel("Store Name")
    // Use input[name="name"] within the form context for precision
    const nameInput = page.locator('form input[name="name"]');
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    await expect(nameInput).toBeEditable({ timeout: 5000 });
    await nameInput.clear();
    await nameInput.fill(newName);

    // Enterprise Pattern: Use form context + label text for reliable selection
    // The Shadcn Select trigger is inside FormItem with FormLabel "Status"
    // Using parent context ensures we get the correct combobox
    const statusFormItem = page
      .locator("form")
      .getByText("Status")
      .locator("..");
    const statusTrigger = statusFormItem.locator('button[role="combobox"]');
    await expect(statusTrigger).toBeVisible({ timeout: 10000 });
    await statusTrigger.click();

    // Wait for select content to be visible then click option
    const inactiveOption = page
      .locator('[role="option"]')
      .filter({ hasText: "Inactive" });
    await expect(inactiveOption).toBeVisible({ timeout: 5000 });
    await inactiveOption.click();

    // Use accessible selector for submit button
    const submitButton = page.getByRole("button", { name: "Update Store" });
    await expect(submitButton).toBeEnabled({ timeout: 5000 });
    await submitButton.click();

    // Wait for success message or navigation instead of hard wait
    // Use first() to avoid strict mode violation when toast renders in multiple elements
    await Promise.any([
      expect(page.getByText(/store updated|successfully/i).first()).toBeVisible(
        {
          timeout: 10000,
        },
      ),
      expect(page).toHaveURL(/\/stores/, { timeout: 10000 }),
    ]);

    const updatedStore = await getPrisma().store.findUnique({
      where: { store_id: testStore.store_id },
    });
    expect(updatedStore?.name).toBe(newName);
    expect(updatedStore?.status).toBe("INACTIVE");

    // Restore
    await getPrisma().store.update({
      where: { store_id: testStore.store_id },
      data: { name: testStore.name, status: testStore.status },
    });
  });

  test("[P0] Should successfully edit store location", async ({ page }) => {
    // Set up API response listener BEFORE navigation (network-first pattern)
    const storeApiPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/stores/${testStore.store_id}`) &&
        resp.request().method() === "GET" &&
        resp.status() === 200,
      { timeout: 30000 },
    );

    await page.goto(`http://localhost:3000/stores/${testStore.store_id}/edit`);
    await page.waitForLoadState("load");

    // Wait for store API to complete - ensures form is populated with data
    await storeApiPromise;

    // Use form-specific selector for Address textarea
    const addressInput = page.locator('form textarea[name="address"]');
    await expect(addressInput).toBeVisible({ timeout: 10000 });
    await expect(addressInput).toBeEditable({ timeout: 5000 });
    await addressInput.clear();
    await addressInput.fill("456 New Address Ave, New City, NC 54321");

    const submitButton = page.getByRole("button", { name: "Update Store" });
    await submitButton.click();

    // Wait for success message or navigation instead of hard wait
    // Use first() to avoid strict mode violation when toast renders in multiple elements
    const result = await Promise.race([
      expect(page.getByText(/store updated|successfully/i).first())
        .toBeVisible({ timeout: 10000 })
        .then(() => true),
      expect(page)
        .toHaveURL(/\/stores/, { timeout: 10000 })
        .then(() => true),
    ]);
    expect(result).toBeTruthy();

    const updatedStore = await getPrisma().store.findUnique({
      where: { store_id: testStore.store_id },
    });
    expect(updatedStore?.location_json).toMatchObject({
      address: "456 New Address Ave, New City, NC 54321",
    });

    // Restore
    await getPrisma().store.update({
      where: { store_id: testStore.store_id },
      data: { location_json: testStore.location_json },
    });
  });

  test("[P0] Should successfully change store timezone", async ({ page }) => {
    // Set up API response listener BEFORE navigation (network-first pattern)
    const storeApiPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/stores/${testStore.store_id}`) &&
        resp.request().method() === "GET" &&
        resp.status() === 200,
      { timeout: 30000 },
    );

    await page.goto(`http://localhost:3000/stores/${testStore.store_id}/edit`);
    await page.waitForLoadState("load");

    // Wait for store API to complete - ensures form is populated with data
    await storeApiPromise;

    // Use form-specific selector for Timezone input
    const timezoneInput = page.locator('form input[name="timezone"]');
    await expect(timezoneInput).toBeVisible({ timeout: 10000 });
    await expect(timezoneInput).toBeEditable({ timeout: 5000 });

    // Clear and fill with triple-click to select all, then type
    await timezoneInput.click({ clickCount: 3 });
    await timezoneInput.fill("America/Los_Angeles");

    // Verify the value was set correctly before submitting
    await expect(timezoneInput).toHaveValue("America/Los_Angeles", {
      timeout: 5000,
    });

    const submitButton = page.getByRole("button", { name: "Update Store" });
    await expect(submitButton).toBeEnabled({ timeout: 5000 });

    // Set up response promise to capture the update response
    const updateResponsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/stores/") &&
        resp.request().method() === "PUT" &&
        (resp.status() === 200 || resp.status() === 201),
      { timeout: 15000 },
    );

    await submitButton.click();

    // Wait for API response
    await updateResponsePromise;

    // Wait for success message or navigation
    await Promise.any([
      expect(page.getByText(/store updated|successfully/i).first()).toBeVisible(
        {
          timeout: 10000,
        },
      ),
      expect(page).toHaveURL(/\/stores/, { timeout: 10000 }),
    ]);

    const updatedStore = await getPrisma().store.findUnique({
      where: { store_id: testStore.store_id },
    });
    expect(updatedStore?.timezone).toBe("America/Los_Angeles");

    // Restore
    await getPrisma().store.update({
      where: { store_id: testStore.store_id },
      data: { timezone: testStore.timezone },
    });
  });

  test("[P0] Should create a new store with login via wizard", async ({
    page,
  }) => {
    // Navigate directly to create store with companyId to skip company selection
    await page.goto(
      `http://localhost:3000/stores/new?companyId=${testCompany.company_id}`,
    );
    await page.waitForLoadState("load");

    // Step 1: Store Information
    const newStoreName = `New E2E Store ${Date.now()}`;
    const nameInput = page.getByLabel("Store Name");
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    await nameInput.fill(newStoreName);

    // Status defaults to ACTIVE, timezone defaults to America/New_York

    // Click Next to go to Step 2 (using data-testid to avoid matching Next.js Dev Tools button)
    const nextButton = page.getByTestId("next-button");
    await expect(nextButton).toBeVisible({ timeout: 5000 });
    await nextButton.click();

    // Step 2: Store Login and Terminals
    // Wait for login email field to be visible
    const loginEmailInput = page.getByLabel("Login Email");
    await expect(loginEmailInput).toBeVisible({ timeout: 10000 });

    const uniqueEmail = `storelogin-${Date.now()}@e2e-test.com`;
    await loginEmailInput.fill(uniqueEmail);

    const loginPasswordInput = page.getByLabel("Login Password");
    await expect(loginPasswordInput).toBeVisible({ timeout: 5000 });
    await loginPasswordInput.fill("SecureE2EPassword123!");

    // Submit the wizard
    const createButton = page.getByRole("button", { name: "Create Store" });
    await createButton.click();

    // Wait for success message or navigation instead of hard wait
    await Promise.any([
      expect(page.getByText(/store created|successfully/i)).toBeVisible({
        timeout: 10000,
      }),
      expect(page).toHaveURL(/\/stores/, { timeout: 10000 }),
    ]);

    // Poll database until store is created (with timeout and interval)
    const pollForStore = async (
      timeout: number = 10000,
      interval: number = 200,
    ) => {
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        const store = await getPrisma().store.findFirst({
          where: { name: newStoreName },
        });
        if (store) {
          return store;
        }
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
      throw new Error(
        `Store with name "${newStoreName}" not found in database after ${timeout}ms`,
      );
    };

    // Verify store was created (with polling for eventual consistency)
    const createdStore = await pollForStore(10000, 200);
    expect(createdStore).not.toBeNull();

    // Verify store login was created (with polling)
    if (createdStore) {
      const pollForStoreLogin = async (
        timeout: number = 10000,
        interval: number = 200,
      ) => {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
          const login = await getPrisma().user.findFirst({
            where: { email: uniqueEmail.toLowerCase() },
          });
          if (login) {
            return login;
          }
          await new Promise((resolve) => setTimeout(resolve, interval));
        }
        throw new Error(
          `Store login with email "${uniqueEmail.toLowerCase()}" not found in database after ${timeout}ms`,
        );
      };

      const storeLogin = await pollForStoreLogin(10000, 200);
      expect(storeLogin).not.toBeNull();

      // Re-fetch the store to get the updated store_login_user_id
      // (the initial createdStore was fetched before the login was linked)
      const updatedStore = await getPrisma().store.findUnique({
        where: { store_id: createdStore.store_id },
      });

      // Verify store has login linked
      expect(updatedStore?.store_login_user_id).toBe(storeLogin.user_id);

      // Cleanup: Delete login's user roles, login user, and store
      if (storeLogin) {
        await getPrisma().userRole.deleteMany({
          where: { user_id: storeLogin.user_id },
        });
        await getPrisma().store.update({
          where: { store_id: createdStore.store_id },
          data: { store_login_user_id: null },
        });
        await getPrisma().user.delete({
          where: { user_id: storeLogin.user_id },
        });
      }
      await getPrisma().store.delete({
        where: { store_id: createdStore.store_id },
      });
    }
  });

  // TODO: This test needs investigation - the API call for configuration update
  // may have permission issues or the form submission isn't completing correctly
  test.skip("[P0] Should successfully update store configuration (operating hours)", async ({
    page,
  }) => {
    await page.goto(
      `http://localhost:3000/stores/${testStore.store_id}/configuration`,
    );
    await page.waitForLoadState("load");

    // Wait for page to load
    const heading = page.getByRole("heading", { name: "Store Configuration" });
    await expect(heading).toBeVisible({ timeout: 10000 });

    // Monday is the first day section - get the first Open Time and Close Time inputs
    // Note: There are 7 days with Open/Close inputs, we want the first ones (Monday)
    const openTimeInputs = page.getByLabel("Open Time");
    const closeTimeInputs = page.getByLabel("Close Time");

    // Wait for inputs to be available
    await expect(openTimeInputs.first()).toBeVisible({ timeout: 10000 });

    // Fill Monday's Open Time (first input)
    await openTimeInputs.first().fill("09:00");

    // Fill Monday's Close Time (first input)
    await closeTimeInputs.first().fill("17:00");

    const submitButton = page.getByRole("button", {
      name: "Update Configuration",
    });
    await submitButton.click();

    // Wait for success toast to appear - this confirms the API call completed
    await expect(
      page.getByText(/Store configuration updated successfully/i),
    ).toBeVisible({
      timeout: 10000,
    });

    const updatedStore = await getPrisma().store.findUnique({
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
    // Set up API response listener BEFORE navigation (network-first pattern)
    const storeApiPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/stores/${testStore.store_id}`) &&
        resp.request().method() === "GET" &&
        resp.status() === 200,
      { timeout: 30000 },
    );

    await page.goto(`http://localhost:3000/stores/${testStore.store_id}/edit`);
    await page.waitForLoadState("load");

    // Wait for store API to complete - ensures form is populated with data
    await storeApiPromise;

    // Use form-specific selector to avoid conflict with Header loading skeleton
    const nameInput = page.locator('form input[name="name"]');
    await expect(nameInput).toBeVisible({ timeout: 10000 });
    await expect(nameInput).toBeEditable({ timeout: 5000 });
    await nameInput.clear();

    const submitButton = page.getByRole("button", { name: "Update Store" });
    await submitButton.click();

    // The form uses zod validation with FormMessage component
    const errorMessage = page.locator("text=/store name is required/i");
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  test("[P1] Should show validation error for invalid timezone", async ({
    page,
  }) => {
    // Set up API response listener BEFORE navigation (network-first pattern)
    const storeApiPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/stores/${testStore.store_id}`) &&
        resp.request().method() === "GET" &&
        resp.status() === 200,
      { timeout: 30000 },
    );

    await page.goto(`http://localhost:3000/stores/${testStore.store_id}/edit`);
    await page.waitForLoadState("load");

    // Wait for store API to complete - ensures form is populated with data
    await storeApiPromise;

    // Use form-specific selector for Timezone input
    const timezoneInput = page.locator('form input[name="timezone"]');
    await expect(timezoneInput).toBeVisible({ timeout: 10000 });
    await expect(timezoneInput).toBeEditable({ timeout: 5000 });
    await timezoneInput.clear();
    await timezoneInput.fill("Invalid/Bad/Timezone/Format");

    const submitButton = page.getByRole("button", { name: "Update Store" });
    await submitButton.click();

    // The form uses zod validation with FormMessage component
    const errorMessage = page.locator("text=/IANA format/i");
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  test("[P1] Should prevent deletion of ACTIVE store", async ({ page }) => {
    await getPrisma().store.update({
      where: { store_id: testStore.store_id },
      data: { status: "ACTIVE" },
    });

    await page.goto("http://localhost:3000/stores");
    await page.waitForLoadState("load");

    // Find the row for our test store
    const storeRow = page.locator(`tr:has-text("${testStore.name}")`).first();
    await expect(storeRow).toBeVisible({ timeout: 10000 });

    // The Delete button should be disabled for ACTIVE stores
    const deleteButton = storeRow.getByRole("button", { name: "Delete" });
    await expect(deleteButton).toBeDisabled();
  });

  test("[P1] Should successfully delete INACTIVE store", async ({ page }) => {
    const storeToDelete = await getPrisma().store.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),

        name: "Store to Delete E2E",
        status: "INACTIVE",
        company_id: testCompany.company_id,
        timezone: "America/New_York",
      },
    });

    await page.goto("http://localhost:3000/stores");
    await page.waitForLoadState("load");

    // Find the row for our test store
    const storeRow = page
      .locator(`tr:has-text("${storeToDelete.name}")`)
      .first();
    await expect(storeRow).toBeVisible({ timeout: 10000 });

    // Click the Delete button (should be enabled for INACTIVE stores)
    const deleteButton = storeRow.getByRole("button", { name: "Delete" });
    await expect(deleteButton).toBeEnabled({ timeout: 5000 });
    await deleteButton.click();

    // Wait for dialog to open
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Dialog appears with text input for confirmation
    // The label shows: Type "DELETE" to confirm
    const confirmInput = dialog.getByRole("textbox");
    await expect(confirmInput).toBeVisible({ timeout: 5000 });
    await confirmInput.fill("DELETE");

    const confirmButton = dialog.getByRole("button", {
      name: /delete permanently/i,
    });
    await confirmButton.click();

    // Wait for dialog to close and API to complete
    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    // Verify the store no longer exists (hard delete)
    const deletedStore = await getPrisma().store.findUnique({
      where: { store_id: storeToDelete.store_id },
    });
    expect(deletedStore).toBeNull();
  });

  test("[P1] Should display properly on mobile screens", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    // Set up API response listener BEFORE navigation (network-first pattern)
    const storeApiPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/stores/${testStore.store_id}`) &&
        resp.request().method() === "GET" &&
        resp.status() === 200,
      { timeout: 30000 },
    );

    await page.goto(`http://localhost:3000/stores/${testStore.store_id}/edit`);
    await page.waitForLoadState("load");

    // Wait for store API to complete - ensures form is populated with data
    await storeApiPromise;

    // Verify the edit page renders correctly on mobile
    const heading = page.getByRole("heading", { name: "Edit Store" });
    await expect(heading).toBeVisible({ timeout: 10000 });

    // Verify form elements are visible - use form-specific selector
    const nameInput = page.locator('form input[name="name"]');
    await expect(nameInput).toBeVisible();

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
    await page.waitForLoadState("load");

    // Verify the configuration page renders correctly on mobile
    const heading = page.getByRole("heading", { name: "Store Configuration" });
    await expect(heading).toBeVisible({ timeout: 10000 });

    // Verify operating hours heading is visible
    const mondayHeading = page.getByRole("heading", {
      name: "Monday",
      level: 3,
    });
    await expect(mondayHeading).toBeVisible();

    // Verify time inputs are accessible
    const mondayOpenInput = page.getByLabel("Open Time").first();
    await expect(mondayOpenInput).toBeVisible();
  });

  // TODO: This test has data isolation issues when run with the full suite.
  // The table contains stores from multiple sources (seeded data, other test data)
  // and the sorting assertion fails because the expected sort order doesn't match
  // the actual data. Consider filtering to only test stores or using mock data.
  test.skip("[P1] Should sort stores by all sortable columns", async ({
    page,
  }) => {
    // Create additional test stores with known values for sorting tests
    const testStores = await Promise.all([
      getPrisma().store.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
          name: "Alpha Store",
          status: "ACTIVE",
          company_id: testCompany.company_id,
          timezone: "America/New_York",
          location_json: { address: "123 Alpha St" },
        },
      }),
      getPrisma().store.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
          name: "Beta Store",
          status: "INACTIVE",
          company_id: testCompany.company_id,
          timezone: "America/Los_Angeles",
          location_json: { address: "456 Beta St" },
        },
      }),
      getPrisma().store.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
          name: "Gamma Store",
          status: "CLOSED",
          company_id: testCompany.company_id,
          timezone: "America/Chicago",
          location_json: { address: "789 Gamma St" },
        },
      }),
    ]);

    try {
      await page.goto("http://localhost:3000/stores");
      await page.waitForLoadState("load");

      // Wait for table to be visible and have data
      const tableBody = page.locator("tbody");
      await expect(tableBody).toBeVisible({ timeout: 10000 });
      // Wait for at least one row to be visible
      await expect(tableBody.locator("tr").first()).toBeVisible({
        timeout: 5000,
      });

      // Map column names to their CSS nth-child indices (1-indexed)
      // Table structure: Checkbox(1), Name(2), Company(3), Address(4), Timezone(5), Status(6), Created At(7), Actions(8)
      const columnIndexMap: Record<string, number> = {
        Name: 2,
        Company: 3,
        Timezone: 5, // Skip Address column (4)
        Status: 6,
        "Created At": 7,
      };

      // Get initial/default order for comparison
      const getColumnCellValues = async (
        columnName: string,
      ): Promise<string[]> => {
        // Use Object.hasOwn for safe property access (avoids object injection lint warning)
        if (!Object.hasOwn(columnIndexMap, columnName)) {
          throw new Error(`Unknown column: ${columnName}`);
        }
        const nthChildIndex =
          columnIndexMap[columnName as keyof typeof columnIndexMap];

        // Wait for table rows to be stable
        const rows = tableBody.locator("tr");
        const rowCount = await rows.count();

        // Wait for first cell in column to be visible (ensures table has rendered)
        const firstCell = rows
          .first()
          .locator(`td:nth-child(${nthChildIndex})`);
        await expect(firstCell).toBeVisible({ timeout: 5000 });

        // Get all cell values for this column
        const values: string[] = [];
        for (let i = 0; i < rowCount; i++) {
          const cell = rows.nth(i).locator(`td:nth-child(${nthChildIndex})`);
          const text = await cell.textContent();
          if (text) {
            // Trim whitespace and normalize
            values.push(text.trim());
          }
        }
        return values;
      };

      // Helper to parse formatted date (MMM d, yyyy format from date-fns)
      const parseFormattedDate = (dateStr: string): number => {
        // Try parsing with Date constructor (handles many formats)
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          return date.getTime();
        }
        // Fallback: try parsing "MMM d, yyyy" format manually
        const months: Record<string, number> = {
          Jan: 0,
          Feb: 1,
          Mar: 2,
          Apr: 3,
          May: 4,
          Jun: 5,
          Jul: 6,
          Aug: 7,
          Sep: 8,
          Oct: 9,
          Nov: 10,
          Dec: 11,
        };
        const match = dateStr.match(/(\w+)\s+(\d+),\s+(\d+)/);
        if (match) {
          const [, month, day, year] = match;
          // Use Object.hasOwn for safe property access (avoids object injection lint warning)
          if (Object.hasOwn(months, month)) {
            const monthIndex = months[month as keyof typeof months];
            return new Date(
              parseInt(year),
              monthIndex,
              parseInt(day),
            ).getTime();
          }
        }
        return 0;
      };

      // Helper to assert ascending order
      const assertAscending = (values: string[], columnName: string) => {
        const sorted = [...values].sort((a, b) => {
          // Handle date strings (Created At column)
          if (columnName === "Created At") {
            const aDate = parseFormattedDate(a);
            const bDate = parseFormattedDate(b);
            if (aDate !== 0 && bDate !== 0) {
              return aDate - bDate;
            }
          }
          // Case-insensitive string comparison
          return a.toLowerCase().localeCompare(b.toLowerCase());
        });
        expect(values).toEqual(sorted);
      };

      // Helper to assert descending order
      const assertDescending = (values: string[], columnName: string) => {
        const sorted = [...values].sort((a, b) => {
          // Handle date strings (Created At column)
          if (columnName === "Created At") {
            const aDate = parseFormattedDate(a);
            const bDate = parseFormattedDate(b);
            if (aDate !== 0 && bDate !== 0) {
              return bDate - aDate;
            }
          }
          // Case-insensitive string comparison (reversed)
          return b.toLowerCase().localeCompare(a.toLowerCase());
        });
        expect(values).toEqual(sorted);
      };

      // Test sorting for ALL sortable columns on the Stores page
      const columnsToTest = [
        "Name",
        "Company",
        "Timezone",
        "Status",
        "Created At",
      ];

      // Get default order for all columns for comparison
      const defaultOrders = new Map<string, string[]>();
      for (const columnName of columnsToTest) {
        defaultOrders.set(columnName, await getColumnCellValues(columnName));
      }

      for (const columnName of columnsToTest) {
        const header = page.locator("th").filter({ hasText: columnName });
        await expect(header).toBeVisible({ timeout: 10000 });

        // Verify header is clickable (has cursor-pointer class)
        await expect(header).toHaveClass(/cursor-pointer/);

        // Verify an SVG sort icon exists in header
        const sortIcon = header.locator("svg");
        await expect(sortIcon).toBeVisible({ timeout: 5000 });

        // Click to sort ascending
        await header.click();

        // Wait for table to update by waiting for first cell to be visible
        // Use auto-waiting: wait for a stable locator
        const nthChildIndex =
          columnIndexMap[columnName as keyof typeof columnIndexMap];
        const firstCellAfterAsc = tableBody
          .locator("tr")
          .first()
          .locator(`td:nth-child(${nthChildIndex})`);
        await expect(firstCellAfterAsc).toBeVisible({ timeout: 5000 });

        // Capture and assert ascending order
        const ascendingValues = await getColumnCellValues(columnName);
        assertAscending(ascendingValues, columnName);

        // Verify sort icon still visible after click
        await expect(sortIcon).toBeVisible();

        // Click again to sort descending
        await header.click();

        // Wait for table to update
        const firstCellAfterDesc = tableBody
          .locator("tr")
          .first()
          .locator(`td:nth-child(${nthChildIndex})`);
        await expect(firstCellAfterDesc).toBeVisible({ timeout: 5000 });

        // Capture and assert descending order
        const descendingValues = await getColumnCellValues(columnName);
        assertDescending(descendingValues, columnName);

        // Verify sort icon still visible
        await expect(sortIcon).toBeVisible();

        // Click again to clear sort (return to default)
        await header.click();

        // Wait for table to update
        const firstCellAfterDefault = tableBody
          .locator("tr")
          .first()
          .locator(`td:nth-child(${nthChildIndex})`);
        await expect(firstCellAfterDefault).toBeVisible({ timeout: 5000 });

        // Capture and assert default order (should match original order)
        const defaultValues = await getColumnCellValues(columnName);

        // Verify the order returned to the original default order
        expect(defaultValues).toEqual(defaultOrders.get(columnName));

        // Verify sort icon still visible (neutral state)
        await expect(sortIcon).toBeVisible();
      }
    } finally {
      // Cleanup test stores
      await getPrisma().store.deleteMany({
        where: {
          store_id: { in: testStores.map((s) => s.store_id) },
        },
      });
    }
  });
});
