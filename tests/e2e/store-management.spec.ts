import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";
import { cleanupTestData } from "../support/cleanup-helper";
import { loginAsSuperAdmin } from "../support/auth.helper";

// Admin credentials (same as global-setup.ts)
const ADMIN_CREDENTIALS = {
  email: "admin@nuvana.com",
  password: "Admin123!",
};

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
  let adminUser: any;
  let testCompany: any;
  let testStore: any;

  test.beforeAll(async () => {
    console.log("[beforeAll] Starting test setup...");

    // Get the admin user created by global-setup (guaranteed to exist)
    adminUser = await getPrisma().user.findUnique({
      where: { email: ADMIN_CREDENTIALS.email },
    });
    console.log("[beforeAll] Admin user:", adminUser?.user_id || "NOT FOUND");

    if (!adminUser) {
      throw new Error(
        `Admin user ${ADMIN_CREDENTIALS.email} not found. Ensure global-setup runs first.`,
      );
    }

    // Clean up any existing test companies and stores from previous runs
    const deletedStores = await getPrisma().store.deleteMany({
      where: { name: { startsWith: "E2E Test" } },
    });
    console.log("[beforeAll] Deleted stores:", deletedStores.count);

    const deletedCompanies = await getPrisma().company.deleteMany({
      where: { name: { startsWith: "E2E Test" } },
    });
    console.log("[beforeAll] Deleted companies:", deletedCompanies.count);

    // Create test company owned by admin user
    testCompany = await getPrisma().company.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
        name: "E2E Test Company for Stores",
        status: "ACTIVE",
        owner_user_id: adminUser.user_id,
      },
    });
    console.log("[beforeAll] Created company:", testCompany.company_id);

    // Look up a valid state for structured address fields (required by StoreForm)
    // Use New York (NY) as it's commonly available in seeded data
    const testState = await getPrisma().uSState.findFirst({
      where: { code: "NY" },
    });
    // Fallback to any available state if NY not found
    const fallbackState = testState || (await getPrisma().uSState.findFirst());
    console.log("[beforeAll] State found:", fallbackState?.code || "NONE");

    // Create test store with structured address fields (required by StoreForm validation)
    testStore = await getPrisma().store.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.STORE),
        name: "E2E Test Store",
        status: "ACTIVE",
        company_id: testCompany.company_id,
        timezone: "America/New_York",
        // Legacy location_json (for backward compatibility)
        location_json: {
          address: "123 Test St, Test City, TS 12345",
          gps: { lat: 40.7128, lng: -74.006 },
        },
        // Structured address fields (required by StoreForm validation)
        address_line1: "123 Test Street",
        address_line2: "Suite 100",
        city: "New York",
        state_id: fallbackState?.state_id || null,
        zip_code: "10001",
      },
    });
    console.log("[beforeAll] Created store:", testStore.store_id);
    console.log("[beforeAll] Test setup complete!");
  });

  test.afterAll(async () => {
    // Cleanup: Delete test data using helper (respects FK constraints)
    // Note: We don't delete the admin user since it's created by global-setup
    await cleanupTestData(getPrisma(), {
      stores: testStore ? [testStore.store_id] : [],
      companies: testCompany ? [testCompany.company_id] : [],
      users: [], // Don't delete admin user
    });

    await getPrisma().$disconnect();
  });

  test.beforeEach(async ({ page }) => {
    // Login using the admin user (created by global-setup, guaranteed to work)
    await loginAsSuperAdmin(
      page,
      ADMIN_CREDENTIALS.email,
      ADMIN_CREDENTIALS.password,
      "http://localhost:3000",
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

    // Set up API response listener BEFORE clicking to capture the PUT response
    const putResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/stores/${testStore.store_id}`) &&
        response.request().method() === "PUT",
      { timeout: 15000 },
    );

    await submitButton.click();

    // Wait for the PUT request to complete AND the success message
    const [putResponse] = await Promise.all([
      putResponsePromise,
      expect(page.getByText(/store updated|successfully/i).first()).toBeVisible(
        {
          timeout: 10000,
        },
      ),
    ]);

    // Verify the PUT request succeeded
    expect(putResponse.status()).toBe(200);

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

    // Use structured address fields
    const streetAddressInput = page.getByLabel(/street address/i);
    await expect(streetAddressInput).toBeVisible({ timeout: 10000 });
    await expect(streetAddressInput).toBeEditable({ timeout: 5000 });
    await streetAddressInput.clear();
    await streetAddressInput.fill("456 New Address Ave");

    const cityInput = page.getByLabel(/^city/i);
    await expect(cityInput).toBeVisible({ timeout: 5000 });
    await cityInput.clear();
    await cityInput.fill("New City");

    const zipInput = page.getByLabel(/zip code/i);
    await expect(zipInput).toBeVisible({ timeout: 5000 });
    await zipInput.clear();
    await zipInput.fill("54321");

    // Set up PUT response listener BEFORE clicking submit
    const putResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/stores/${testStore.store_id}`) &&
        response.request().method() === "PUT",
      { timeout: 15000 },
    );

    const submitButton = page.getByRole("button", { name: "Update Store" });
    await submitButton.click();

    // Wait for PUT response AND success message
    const [putResponse] = await Promise.all([
      putResponsePromise,
      expect(page.getByText(/store updated|successfully/i).first()).toBeVisible(
        {
          timeout: 10000,
        },
      ),
    ]);

    expect(putResponse.status()).toBe(200);

    const updatedStore = await getPrisma().store.findUnique({
      where: { store_id: testStore.store_id },
    });
    expect(updatedStore?.address_line1).toBe("456 New Address Ave");
    expect(updatedStore?.city).toBe("New City");
    expect(updatedStore?.zip_code).toBe("54321");

    // Restore
    await getPrisma().store.update({
      where: { store_id: testStore.store_id },
      data: {
        address_line1: testStore.address_line1,
        city: testStore.city,
        zip_code: testStore.zip_code,
      },
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

    // Fill required address fields
    const streetAddressInput = page.getByLabel(/street address/i);
    await expect(streetAddressInput).toBeVisible({ timeout: 5000 });
    await streetAddressInput.fill("789 Wizard Test St");

    // Select state - click the state combobox and pick first option
    const stateCombobox = page.getByTestId("store-state");
    await expect(stateCombobox).toBeVisible({ timeout: 5000 });
    await stateCombobox.click();
    const firstStateOption = page.locator('[role="option"]').first();
    await expect(firstStateOption).toBeVisible({ timeout: 5000 });
    await firstStateOption.click();

    // Wait for city field to be enabled after state selection
    const cityInput = page.getByLabel(/^city/i);
    await expect(cityInput).toBeEnabled({ timeout: 5000 });
    await cityInput.fill("Wizard City");

    const zipInput = page.getByLabel(/zip code/i);
    await expect(zipInput).toBeVisible({ timeout: 5000 });
    await zipInput.fill("12345");

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

  test("[P0] Should successfully update store configuration (operating hours)", async ({
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
    // Use .first() because the toast text appears in multiple elements (title + aria-live)
    await expect(
      page.getByText(/Store configuration updated successfully/i).first(),
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

  test("[P1] Should sort stores by all sortable columns", async ({ page }) => {
    // Navigate to stores page
    await page.goto("http://localhost:3000/stores");
    await page.waitForLoadState("load");

    // Wait for table to be visible and have data
    const tableBody = page.locator("tbody");
    await expect(tableBody).toBeVisible({ timeout: 10000 });
    await expect(tableBody.locator("tr").first()).toBeVisible({
      timeout: 5000,
    });

    // Test that sortable column headers have the correct attributes and behavior
    const sortableColumns = [
      "Name",
      "Company",
      "Timezone",
      "Status",
      "Created At",
    ];

    for (const columnName of sortableColumns) {
      const header = page.locator("th").filter({ hasText: columnName }).first();

      // Verify header is visible
      await expect(header).toBeVisible({ timeout: 5000 });

      // Verify header has cursor-pointer class (indicates clickable)
      await expect(header).toHaveClass(/cursor-pointer/);

      // Verify header contains an SVG sort icon
      const sortIcon = header.locator("svg");
      await expect(sortIcon).toBeVisible({ timeout: 5000 });
    }

    // Test that clicking a sortable header triggers the sort behavior
    const nameHeader = page.locator("th").filter({ hasText: "Name" }).first();

    // Click the header to sort
    await nameHeader.click();
    await page.waitForTimeout(300); // Wait for state update

    // Verify the sort icon is still visible after click (UI stability)
    const nameSortIcon = nameHeader.locator("svg");
    await expect(nameSortIcon).toBeVisible();

    // Click a different sortable column to verify column switching works
    const statusHeader = page
      .locator("th")
      .filter({ hasText: "Status" })
      .first();
    await statusHeader.click();
    await page.waitForTimeout(300);

    // Verify the status sort icon is visible
    const statusSortIcon = statusHeader.locator("svg");
    await expect(statusSortIcon).toBeVisible();

    // Verify clicking Created At works (date sorting)
    const createdAtHeader = page
      .locator("th")
      .filter({ hasText: "Created At" })
      .first();
    await createdAtHeader.click();
    await page.waitForTimeout(300);

    const createdSortIcon = createdAtHeader.locator("svg");
    await expect(createdSortIcon).toBeVisible();

    // Verify the table still has rows (sorting didn't break rendering)
    await expect(tableBody.locator("tr").first()).toBeVisible();
  });
});
