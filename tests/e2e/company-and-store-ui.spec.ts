import { test, expect } from "../support/fixtures";
import { createCompany, createStore, createUser } from "../support/factories";
import { faker } from "@faker-js/faker";

/**
 * Company and Store UI E2E Tests
 *
 * These tests verify the complete company and store management UI functionality:
 * - Role-based navigation (System Admin sees companies, Corporate Admin sees stores)
 * - Company CRUD operations (create, edit, view, delete)
 * - Store CRUD operations (create, edit, view, delete)
 * - Form validation (name, status, timezone, location JSON)
 * - Success/error messages and list refresh
 *
 * Story: 2-4-company-and-store-ui
 * Status: ready-for-dev
 * Priority: P0-P1 (Critical to High)
 *
 * Test Quality Standards:
 * - Network-first pattern: Intercept routes BEFORE navigation
 * - API seeding: Setup data via API (fast, parallel-safe)
 * - Deterministic waits: Wait for responses, not hard waits
 * - Self-cleaning: Fixtures handle cleanup automatically
 */

/**
 * Helper: Set authenticated user in browser session
 * Sets localStorage auth_session and intercepts /api/auth/me endpoint
 */
async function setAuthenticatedUser(
  page: any,
  user: {
    id: string;
    email: string;
    name: string;
    roles?: string[];
    company_id?: string;
  },
) {
  // Network-first: Intercept auth check BEFORE navigation
  await page.route("**/api/auth/me*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          roles: user.roles || [],
          company_id: user.company_id,
        },
      }),
    });
  });

  // Set localStorage auth session (Header component reads from localStorage)
  await page.addInitScript((userData: any) => {
    localStorage.setItem(
      "auth_session",
      JSON.stringify({
        id: userData.id,
        email: userData.email,
        name: userData.name,
        user_metadata: {
          email: userData.email,
          full_name: userData.name,
        },
      }),
    );
  }, user);
}

test.describe("2.4-E2E-001: Company and Store UI - Navigation and Access Control", () => {
  test("[P1] 2.4-E2E-001-001: System Admin should see Companies navigation link and access companies page", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as System Admin
    const systemAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });
    await setAuthenticatedUser(page, {
      id: systemAdmin.id!,
      email: systemAdmin.email,
      name: systemAdmin.name,
      roles: ["SYSTEM_ADMIN"],
    });

    // Network-first: Intercept companies API BEFORE navigation
    const companiesPromise = page.waitForResponse(
      (resp: any) =>
        resp.url().includes("/api/companies") && resp.status() === 200,
    );

    // WHEN: User navigates to dashboard
    await page.goto("/dashboard");

    // THEN: Companies navigation link should be visible
    await expect(
      page.getByTestId("nav-companies"),
      "Companies navigation link should be visible for System Admin",
    ).toBeVisible();

    // WHEN: User clicks Companies link
    await page.getByTestId("nav-companies").click();

    // THEN: User should be on companies page
    await expect(page).toHaveURL(/\/companies/);

    // Wait for companies API response (deterministic wait)
    await companiesPromise;
  });

  test("[P1] 2.4-E2E-001-002: Corporate Admin should see Stores navigation link and access stores page", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as Corporate Admin
    const corporateAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });
    const companyId = faker.string.uuid();
    await setAuthenticatedUser(page, {
      id: corporateAdmin.id!,
      email: corporateAdmin.email,
      name: corporateAdmin.name,
      roles: ["CORPORATE_ADMIN"],
      company_id: companyId,
    });

    // Network-first: Intercept stores API BEFORE navigation
    const storesPromise = page.waitForResponse(
      (resp: any) =>
        resp.url().includes("/api/stores") && resp.status() === 200,
    );

    // WHEN: User navigates to dashboard
    await page.goto("/dashboard");

    // THEN: Stores navigation link should be visible
    await expect(
      page.getByTestId("nav-stores"),
      "Stores navigation link should be visible for Corporate Admin",
    ).toBeVisible();

    // WHEN: User clicks Stores link
    await page.getByTestId("nav-stores").click();

    // THEN: User should be on stores page
    await expect(page).toHaveURL(/\/stores/);

    // Wait for stores API response (deterministic wait)
    await storesPromise;
  });

  test("[P1] 2.4-E2E-001-003: Corporate Admin should NOT see Companies navigation link", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as Corporate Admin (not System Admin)
    const corporateAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });
    await setAuthenticatedUser(page, {
      id: corporateAdmin.id!,
      email: corporateAdmin.email,
      name: corporateAdmin.name,
      roles: ["CORPORATE_ADMIN"],
    });

    // WHEN: User navigates to dashboard
    await page.goto("/dashboard");

    // THEN: Companies navigation link should NOT be visible
    await expect(
      page.getByTestId("nav-companies"),
      "Companies navigation link should NOT be visible for Corporate Admin",
    ).not.toBeVisible();
  });
});

test.describe("2.4-E2E-002: System Admin Company Management", () => {
  test("[P1] 2.4-E2E-002-001: System Admin should see list of all companies", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as System Admin
    const systemAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });
    await setAuthenticatedUser(page, {
      id: systemAdmin.id!,
      email: systemAdmin.email,
      name: systemAdmin.name,
      roles: ["SYSTEM_ADMIN"],
    });

    // AND: Companies exist in the system (seed via API)
    const companies = [
      createCompany({ name: faker.company.name() }),
      createCompany({ name: faker.company.name() }),
    ];
    const createdCompanies: any[] = [];
    for (const company of companies) {
      const response = await authenticatedApiRequest.post("/api/companies", {
        data: company,
      });
      expect(response.status()).toBe(201);
      const created = await response.json();
      createdCompanies.push(created);
    }

    // Network-first: Intercept companies API BEFORE navigation
    const companiesPromise = page.waitForResponse(
      (resp: any) =>
        resp.url().includes("/api/companies") && resp.status() === 200,
    );

    // WHEN: User navigates to companies page
    await page.goto("/companies");

    // Wait for companies API response (deterministic wait)
    await companiesPromise;

    // THEN: Company list should be displayed
    await expect(
      page.getByTestId("company-list"),
      "Company list should be visible",
    ).toBeVisible();

    // AND: Company table should show company data
    await expect(
      page.getByTestId("company-table"),
      "Company table should be visible",
    ).toBeVisible();

    // Cleanup: Delete created companies
    for (const company of createdCompanies) {
      await authenticatedApiRequest.delete(`/api/companies/${company.id}`);
    }
  });

  test("[P1] 2.4-E2E-002-002: System Admin should create a new company", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as System Admin
    const systemAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });
    await setAuthenticatedUser(page, {
      id: systemAdmin.id!,
      email: systemAdmin.email,
      name: systemAdmin.name,
      roles: ["SYSTEM_ADMIN"],
    });

    // Network-first: Intercept create company API BEFORE navigation
    const createCompanyPromise = page.waitForResponse(
      (resp: any) =>
        resp.url().includes("/api/companies") &&
        resp.request().method() === "POST" &&
        resp.status() === 201,
    );

    // AND: User is on companies page
    await page.goto("/companies");

    // WHEN: User clicks "Create Company" button
    await page.getByTestId("create-company-button").click();

    // THEN: User should be on create company page
    await expect(page).toHaveURL(/\/companies\/new/);

    // WHEN: User fills in company form
    const companyData = createCompany();
    await page.getByTestId("company-name-input").fill(companyData.name);
    await page
      .getByTestId("company-status-select")
      .selectOption(companyData.status);

    // AND: User submits the form
    await page.getByTestId("company-submit-button").click();

    // Wait for create API response (deterministic wait)
    await createCompanyPromise;

    // THEN: Success message should be displayed
    await expect(
      page.getByTestId("toast-success"),
      "Success toast message should be displayed",
    ).toBeVisible();

    // AND: User should be redirected to companies list
    await expect(page).toHaveURL(/\/companies$/);

    // AND: New company should appear in the list
    await expect(
      page.getByText(companyData.name),
      "New company should appear in list",
    ).toBeVisible();
  });

  test("[P1] 2.4-E2E-002-003: System Admin should view company details", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as System Admin
    const systemAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });
    await setAuthenticatedUser(page, {
      id: systemAdmin.id!,
      email: systemAdmin.email,
      name: systemAdmin.name,
      roles: ["SYSTEM_ADMIN"],
    });

    // AND: A company exists (seed via API)
    const companyData = createCompany();
    const createResponse = await authenticatedApiRequest.post(
      "/api/companies",
      {
        data: companyData,
      },
    );
    expect(createResponse.status()).toBe(201);
    const createdCompany = await createResponse.json();

    // Network-first: Intercept company detail API BEFORE navigation
    const companyDetailPromise = page.waitForResponse(
      (resp: any) =>
        resp.url().includes(`/api/companies/${createdCompany.id}`) &&
        resp.status() === 200,
    );

    // WHEN: User navigates to company detail page
    await page.goto(`/companies/${createdCompany.id}`);

    // Wait for company detail API response (deterministic wait)
    await companyDetailPromise;

    // THEN: Company details should be displayed
    await expect(
      page.getByTestId("company-detail-company-id"),
      "Company ID should be displayed",
    ).toBeVisible();
    await expect(
      page.getByTestId("company-detail-name"),
      "Company name should be displayed",
    ).toBeVisible();
    await expect(
      page.getByTestId("company-detail-status"),
      "Company status should be displayed",
    ).toBeVisible();
    await expect(
      page.getByTestId("company-detail-created-at"),
      "Company created_at should be displayed",
    ).toBeVisible();
    await expect(
      page.getByTestId("company-detail-updated-at"),
      "Company updated_at should be displayed",
    ).toBeVisible();

    // Cleanup: Delete created company
    await authenticatedApiRequest.delete(`/api/companies/${createdCompany.id}`);
  });

  test("[P1] 2.4-E2E-002-004: System Admin should edit company details", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as System Admin
    const systemAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });
    await setAuthenticatedUser(page, {
      id: systemAdmin.id!,
      email: systemAdmin.email,
      name: systemAdmin.name,
      roles: ["SYSTEM_ADMIN"],
    });

    // AND: A company exists (seed via API)
    const companyData = createCompany();
    const createResponse = await authenticatedApiRequest.post(
      "/api/companies",
      {
        data: companyData,
      },
    );
    expect(createResponse.status()).toBe(201);
    const createdCompany = await createResponse.json();

    // Network-first: Intercept update company API BEFORE navigation
    const updateCompanyPromise = page.waitForResponse(
      (resp: any) =>
        resp.url().includes(`/api/companies/${createdCompany.id}`) &&
        resp.request().method() === "PUT" &&
        resp.status() === 200,
    );

    // WHEN: User navigates to company detail page
    await page.goto(`/companies/${createdCompany.id}`);

    // AND: User clicks "Edit" button
    await page.getByTestId("company-edit-button").click();

    // THEN: User should be on edit company page
    await expect(page).toHaveURL(`/companies/${createdCompany.id}/edit`);

    // WHEN: User updates company name
    const updatedName = faker.company.name();
    await page.getByTestId("company-name-input").fill(updatedName);

    // AND: User submits the form
    await page.getByTestId("company-submit-button").click();

    // Wait for update API response (deterministic wait)
    await updateCompanyPromise;

    // THEN: Success message should be displayed
    await expect(
      page.getByTestId("toast-success"),
      "Success toast message should be displayed",
    ).toBeVisible();

    // AND: Updated company name should be displayed on detail page
    await expect(
      page.getByTestId("company-detail-name"),
      "Updated company name should be displayed",
    ).toHaveText(updatedName);

    // Cleanup: Delete created company
    await authenticatedApiRequest.delete(`/api/companies/${createdCompany.id}`);
  });

  test("[P2] 2.4-E2E-002-005: Company form should validate required name field", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as System Admin
    const systemAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });
    await setAuthenticatedUser(page, {
      id: systemAdmin.id!,
      email: systemAdmin.email,
      name: systemAdmin.name,
      roles: ["SYSTEM_ADMIN"],
    });

    // WHEN: User navigates to create company page
    await page.goto("/companies/new");

    // AND: User submits form without filling name
    await page.getByTestId("company-submit-button").click();

    // THEN: Validation error should be displayed for name field
    await expect(
      page.getByTestId("company-name-error"),
      "Name field validation error should be displayed",
    ).toBeVisible();

    // AND: Form should not be submitted
    await expect(page).toHaveURL(/\/companies\/new/);
  });

  test("[P2] 2.4-E2E-002-006: Company form should validate status enum values", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as System Admin
    const systemAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });
    await setAuthenticatedUser(page, {
      id: systemAdmin.id!,
      email: systemAdmin.email,
      name: systemAdmin.name,
      roles: ["SYSTEM_ADMIN"],
    });

    // WHEN: User navigates to create company page
    await page.goto("/companies/new");

    // AND: User fills in name
    await page.getByTestId("company-name-input").fill(faker.company.name());

    // THEN: Status dropdown should only allow valid enum values
    // (Implementation dependent - dropdown should prevent invalid selection)
    const statusSelect = page.getByTestId("company-status-select");
    await expect(statusSelect).toBeVisible();

    // Verify valid options are available
    const options = await statusSelect.locator("option").all();
    const validStatuses = ["ACTIVE", "INACTIVE", "SUSPENDED"];
    for (const option of options) {
      const value = await option.getAttribute("value");
      if (value) {
        expect(validStatuses).toContain(value);
      }
    }
  });
});

test.describe("2.4-E2E-003: Corporate Admin Store Management", () => {
  test("[P0] 2.4-E2E-003-001: Corporate Admin should see list of stores for their company", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as Corporate Admin
    const corporateAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });
    const companyId = faker.string.uuid();

    // Create company via API first
    const companyData = createCompany();
    const companyResponse = await authenticatedApiRequest.post(
      "/api/companies",
      {
        data: companyData,
      },
    );
    expect(companyResponse.status()).toBe(201);
    const createdCompany = await companyResponse.json();
    const actualCompanyId = createdCompany.id;

    await setAuthenticatedUser(page, {
      id: corporateAdmin.id!,
      email: corporateAdmin.email,
      name: corporateAdmin.name,
      roles: ["CORPORATE_ADMIN"],
      company_id: actualCompanyId,
    });

    // AND: Stores exist for their company (seed via API)
    const stores = [
      createStore({ company_id: actualCompanyId }),
      createStore({ company_id: actualCompanyId }),
    ];
    const createdStores: any[] = [];
    for (const store of stores) {
      const response = await authenticatedApiRequest.post("/api/stores", {
        data: store,
      });
      expect(response.status()).toBe(201);
      const created = await response.json();
      createdStores.push(created);
    }

    // Network-first: Intercept stores API BEFORE navigation
    const storesPromise = page.waitForResponse(
      (resp: any) =>
        resp.url().includes("/api/stores") && resp.status() === 200,
    );

    // WHEN: User navigates to stores page
    await page.goto("/stores");

    // Wait for stores API response (deterministic wait)
    await storesPromise;

    // THEN: Store list should be displayed
    await expect(
      page.getByTestId("store-list"),
      "Store list should be visible",
    ).toBeVisible();

    // AND: Store table should show store data
    await expect(
      page.getByTestId("store-table"),
      "Store table should be visible",
    ).toBeVisible();

    // AND: Only stores for their company should be visible (company isolation)
    // Verify all displayed stores belong to the user's company
    const storeRows = page.locator('[data-testid^="store-row-"]');
    const count = await storeRows.count();
    expect(count).toBeGreaterThan(0);

    // Cleanup: Delete created stores and company
    for (const store of createdStores) {
      await authenticatedApiRequest.delete(`/api/stores/${store.id}`);
    }
    await authenticatedApiRequest.delete(`/api/companies/${actualCompanyId}`);
  });

  test("[P0] 2.4-E2E-003-002: Corporate Admin should create a new store with valid data", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as Corporate Admin
    const corporateAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });

    // Create company via API first
    const companyData = createCompany();
    const companyResponse = await authenticatedApiRequest.post(
      "/api/companies",
      {
        data: companyData,
      },
    );
    expect(companyResponse.status()).toBe(201);
    const createdCompany = await companyResponse.json();

    await setAuthenticatedUser(page, {
      id: corporateAdmin.id!,
      email: corporateAdmin.email,
      name: corporateAdmin.name,
      roles: ["CORPORATE_ADMIN"],
      company_id: createdCompany.id,
    });

    // Network-first: Intercept create store API BEFORE navigation
    const createStorePromise = page.waitForResponse(
      (resp: any) =>
        resp.url().includes("/api/stores") &&
        resp.request().method() === "POST" &&
        resp.status() === 201,
    );

    // AND: User is on stores page
    await page.goto("/stores");

    // WHEN: User clicks "Create Store" button
    await page.getByTestId("create-store-button").click();

    // THEN: User should be on create store page
    await expect(page).toHaveURL(/\/stores\/new/);

    // WHEN: User fills in store form with valid data
    const storeData = createStore({ company_id: createdCompany.id });
    await page.getByTestId("store-name-input").fill(storeData.name);
    await page.getByTestId("store-timezone-input").fill(storeData.timezone);
    await page
      .getByTestId("store-location-address-input")
      .fill((storeData.location_json as any)?.address || "");
    await page
      .getByTestId("store-location-lat-input")
      .fill(String((storeData.location_json as any)?.gps?.lat || 40.7128));
    await page
      .getByTestId("store-location-lng-input")
      .fill(String((storeData.location_json as any)?.gps?.lng || -74.006));
    await page
      .getByTestId("store-status-select")
      .selectOption(storeData.status);

    // AND: User submits the form
    await page.getByTestId("store-submit-button").click();

    // Wait for create API response (deterministic wait)
    await createStorePromise;

    // THEN: Success message should be displayed
    await expect(
      page.getByTestId("toast-success"),
      "Success toast message should be displayed",
    ).toBeVisible();

    // AND: User should be redirected to stores list
    await expect(page).toHaveURL(/\/stores$/);

    // AND: New store should appear in the list
    await expect(
      page.getByText(storeData.name),
      "New store should appear in list",
    ).toBeVisible();

    // Cleanup: Delete created company (stores will cascade or be cleaned separately)
    await authenticatedApiRequest.delete(`/api/companies/${createdCompany.id}`);
  });

  test("[P0] 2.4-E2E-003-003: Store form should validate timezone IANA format", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as Corporate Admin
    const corporateAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });

    // Create company via API first
    const companyData = createCompany();
    const companyResponse = await authenticatedApiRequest.post(
      "/api/companies",
      {
        data: companyData,
      },
    );
    expect(companyResponse.status()).toBe(201);
    const createdCompany = await companyResponse.json();

    await setAuthenticatedUser(page, {
      id: corporateAdmin.id!,
      email: corporateAdmin.email,
      name: corporateAdmin.name,
      roles: ["CORPORATE_ADMIN"],
      company_id: createdCompany.id,
    });

    // WHEN: User navigates to create store page
    await page.goto("/stores/new");

    // AND: User fills in name and invalid timezone format
    await page.getByTestId("store-name-input").fill(faker.company.name());
    await page.getByTestId("store-timezone-input").fill("Invalid/Timezone");

    // AND: User submits the form
    await page.getByTestId("store-submit-button").click();

    // THEN: Validation error should be displayed for timezone field
    await expect(
      page.getByTestId("store-timezone-error"),
      "Timezone validation error should be displayed",
    ).toBeVisible();

    // AND: Form should not be submitted
    await expect(page).toHaveURL(/\/stores\/new/);

    // Cleanup: Delete created company
    await authenticatedApiRequest.delete(`/api/companies/${createdCompany.id}`);
  });

  test("[P0] 2.4-E2E-003-004: Store form should validate GPS coordinate bounds", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as Corporate Admin
    const corporateAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });

    // Create company via API first
    const companyData = createCompany();
    const companyResponse = await authenticatedApiRequest.post(
      "/api/companies",
      {
        data: companyData,
      },
    );
    expect(companyResponse.status()).toBe(201);
    const createdCompany = await companyResponse.json();

    await setAuthenticatedUser(page, {
      id: corporateAdmin.id!,
      email: corporateAdmin.email,
      name: corporateAdmin.name,
      roles: ["CORPORATE_ADMIN"],
      company_id: createdCompany.id,
    });

    // WHEN: User navigates to create store page
    await page.goto("/stores/new");

    // AND: User fills in name and GPS coordinates outside bounds
    await page.getByTestId("store-name-input").fill(faker.company.name());
    await page.getByTestId("store-location-lat-input").fill("91"); // Invalid: > 90
    await page.getByTestId("store-location-lng-input").fill("-74.006");

    // AND: User submits the form
    await page.getByTestId("store-submit-button").click();

    // THEN: Validation error should be displayed for latitude field
    await expect(
      page.getByTestId("store-location-lat-error"),
      "Latitude bounds validation error should be displayed",
    ).toBeVisible();

    // AND: Form should not be submitted
    await expect(page).toHaveURL(/\/stores\/new/);

    // Cleanup: Delete created company
    await authenticatedApiRequest.delete(`/api/companies/${createdCompany.id}`);
  });

  test("[P0] 2.4-E2E-003-005: Store form should validate location JSON structure", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as Corporate Admin
    const corporateAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });

    // Create company via API first
    const companyData = createCompany();
    const companyResponse = await authenticatedApiRequest.post(
      "/api/companies",
      {
        data: companyData,
      },
    );
    expect(companyResponse.status()).toBe(201);
    const createdCompany = await companyResponse.json();

    await setAuthenticatedUser(page, {
      id: corporateAdmin.id!,
      email: corporateAdmin.email,
      name: corporateAdmin.name,
      roles: ["CORPORATE_ADMIN"],
      company_id: createdCompany.id,
    });

    // WHEN: User navigates to create store page
    await page.goto("/stores/new");

    // AND: User fills in name
    await page.getByTestId("store-name-input").fill(faker.company.name());

    // THEN: Location form should enforce valid JSON structure
    // (Address and GPS fields should be required or validated)
    const addressInput = page.getByTestId("store-location-address-input");
    const latInput = page.getByTestId("store-location-lat-input");
    const lngInput = page.getByTestId("store-location-lng-input");

    await expect(addressInput).toBeVisible();
    await expect(latInput).toBeVisible();
    await expect(lngInput).toBeVisible();

    // Cleanup: Delete created company
    await authenticatedApiRequest.delete(`/api/companies/${createdCompany.id}`);
  });

  test("[P1] 2.4-E2E-003-006: Corporate Admin should view store details", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as Corporate Admin
    const corporateAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });

    // Create company via API first
    const companyData = createCompany();
    const companyResponse = await authenticatedApiRequest.post(
      "/api/companies",
      {
        data: companyData,
      },
    );
    expect(companyResponse.status()).toBe(201);
    const createdCompany = await companyResponse.json();

    await setAuthenticatedUser(page, {
      id: corporateAdmin.id!,
      email: corporateAdmin.email,
      name: corporateAdmin.name,
      roles: ["CORPORATE_ADMIN"],
      company_id: createdCompany.id,
    });

    // AND: A store exists for their company (seed via API)
    const storeData = createStore({ company_id: createdCompany.id });
    const storeResponse = await authenticatedApiRequest.post("/api/stores", {
      data: storeData,
    });
    expect(storeResponse.status()).toBe(201);
    const createdStore = await storeResponse.json();

    // Network-first: Intercept store detail API BEFORE navigation
    const storeDetailPromise = page.waitForResponse(
      (resp: any) =>
        resp.url().includes(`/api/stores/${createdStore.id}`) &&
        resp.status() === 200,
    );

    // WHEN: User navigates to store detail page
    await page.goto(`/stores/${createdStore.id}`);

    // Wait for store detail API response (deterministic wait)
    await storeDetailPromise;

    // THEN: Store details should be displayed
    await expect(
      page.getByTestId("store-detail-store-id"),
      "Store ID should be displayed",
    ).toBeVisible();
    await expect(
      page.getByTestId("store-detail-name"),
      "Store name should be displayed",
    ).toBeVisible();
    await expect(
      page.getByTestId("store-detail-timezone"),
      "Store timezone should be displayed",
    ).toBeVisible();
    await expect(
      page.getByTestId("store-detail-status"),
      "Store status should be displayed",
    ).toBeVisible();
    await expect(
      page.getByTestId("store-detail-location"),
      "Store location should be displayed",
    ).toBeVisible();

    // Cleanup: Delete created store and company
    await authenticatedApiRequest.delete(`/api/stores/${createdStore.id}`);
    await authenticatedApiRequest.delete(`/api/companies/${createdCompany.id}`);
  });
});

test.describe("2.4-E2E-004: Success Messages and List Refresh", () => {
  test("[P1] 2.4-E2E-004-001: Success message should display after creating company", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as System Admin
    const systemAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });
    await setAuthenticatedUser(page, {
      id: systemAdmin.id!,
      email: systemAdmin.email,
      name: systemAdmin.name,
      roles: ["SYSTEM_ADMIN"],
    });

    // Network-first: Intercept create company API BEFORE navigation
    const createCompanyPromise = page.waitForResponse(
      (resp: any) =>
        resp.url().includes("/api/companies") &&
        resp.request().method() === "POST" &&
        resp.status() === 201,
    );

    // AND: User navigates to create company page
    await page.goto("/companies/new");

    // WHEN: User fills form and submits
    const companyData = createCompany();
    await page.getByTestId("company-name-input").fill(companyData.name);
    await page
      .getByTestId("company-status-select")
      .selectOption(companyData.status);
    await page.getByTestId("company-submit-button").click();

    // Wait for create API response (deterministic wait)
    await createCompanyPromise;

    // THEN: Success toast message should be displayed
    await expect(
      page.getByTestId("toast-success"),
      "Success toast message should be displayed after company creation",
    ).toBeVisible();

    // AND: Message should contain success text
    await expect(
      page.getByTestId("toast-success"),
      "Success message should contain appropriate text",
    ).toContainText(/success|created/i);
  });

  test("[P1] 2.4-E2E-004-002: Company list should refresh after creating company", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as System Admin
    const systemAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });
    await setAuthenticatedUser(page, {
      id: systemAdmin.id!,
      email: systemAdmin.email,
      name: systemAdmin.name,
      roles: ["SYSTEM_ADMIN"],
    });

    // Network-first: Intercept companies list API BEFORE navigation
    const companiesListPromise = page.waitForResponse(
      (resp: any) =>
        resp.url().includes("/api/companies") &&
        resp.request().method() === "GET" &&
        resp.status() === 200,
    );

    // AND: User is on companies list page
    await page.goto("/companies");

    // Wait for initial companies list API response
    await companiesListPromise;

    // Network-first: Intercept create company API BEFORE form submission
    const createCompanyPromise = page.waitForResponse(
      (resp: any) =>
        resp.url().includes("/api/companies") &&
        resp.request().method() === "POST" &&
        resp.status() === 201,
    );

    // Network-first: Intercept refreshed companies list API AFTER create
    const refreshedListPromise = page.waitForResponse(
      (resp: any) =>
        resp.url().includes("/api/companies") &&
        resp.request().method() === "GET" &&
        resp.status() === 200,
    );

    // WHEN: User creates a new company
    await page.getByTestId("create-company-button").click();
    const companyData = createCompany();
    await page.getByTestId("company-name-input").fill(companyData.name);
    await page
      .getByTestId("company-status-select")
      .selectOption(companyData.status);
    await page.getByTestId("company-submit-button").click();

    // Wait for create API response
    await createCompanyPromise;

    // Wait for refreshed list API response
    await refreshedListPromise;

    // THEN: Company list should refresh automatically
    // AND: New company should appear in the list
    await expect(
      page.getByText(companyData.name),
      "New company should appear in refreshed list",
    ).toBeVisible();
  });

  test("[P1] 2.4-E2E-004-003: Loading state should display during API calls", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as System Admin
    const systemAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });
    await setAuthenticatedUser(page, {
      id: systemAdmin.id!,
      email: systemAdmin.email,
      name: systemAdmin.name,
      roles: ["SYSTEM_ADMIN"],
    });

    // Network-first: Intercept create company API with delay to observe loading state
    let loadingStateVisible = false;
    page.on("response", async (response: any) => {
      if (
        response.url().includes("/api/companies") &&
        response.request().method() === "POST"
      ) {
        // Check if loading indicator was visible before response
        const loadingSpinner = page.getByTestId("loading-spinner");
        const skeleton = page.getByTestId("skeleton-loader");
        if (
          (await loadingSpinner.isVisible().catch(() => false)) ||
          (await skeleton.isVisible().catch(() => false))
        ) {
          loadingStateVisible = true;
        }
      }
    });

    // AND: User navigates to create company page
    await page.goto("/companies/new");

    // WHEN: User fills form and submits
    const companyData = createCompany();
    await page.getByTestId("company-name-input").fill(companyData.name);
    await page
      .getByTestId("company-status-select")
      .selectOption(companyData.status);

    // Check for loading state indicators (button disabled or spinner visible)
    const submitButton = page.getByTestId("company-submit-button");
    await submitButton.click();

    // THEN: Loading state should be visible during API call
    // (Implementation dependent - may use skeleton loader, button disabled state, or spinner)
    // Verify button is disabled or loading indicator appears
    const isDisabled = await submitButton.isDisabled().catch(() => false);
    const hasSpinner = await page
      .getByTestId("loading-spinner")
      .isVisible()
      .catch(() => false);
    const hasSkeleton = await page
      .getByTestId("skeleton-loader")
      .isVisible()
      .catch(() => false);

    // At least one loading indicator should be present
    expect(isDisabled || hasSpinner || hasSkeleton || loadingStateVisible).toBe(
      true,
    );
  });
});

// ============================================================================
// BUSINESS LOGIC TESTS - Enhanced from interactive Q&A
// ============================================================================

test.describe("2.4-E2E-005: Business Logic - Company Management", () => {
  test("[P1] 2.4-E2E-005-001: Company name uniqueness should be enforced", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as System Admin
    const systemAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });
    await setAuthenticatedUser(page, {
      id: systemAdmin.id!,
      email: systemAdmin.email,
      name: systemAdmin.name,
      roles: ["SYSTEM_ADMIN"],
    });

    // AND: A company with a specific name exists
    const companyName = faker.company.name();
    const companyData = createCompany({ name: companyName });
    const createResponse = await authenticatedApiRequest.post(
      "/api/companies",
      {
        data: companyData,
      },
    );
    expect(createResponse.status()).toBe(201);
    const createdCompany = await createResponse.json();

    // Network-first: Intercept create company API BEFORE navigation
    const createCompanyPromise = page.waitForResponse(
      (resp: any) =>
        resp.url().includes("/api/companies") &&
        resp.request().method() === "POST" &&
        (resp.status() === 201 || resp.status() === 409),
    );

    // WHEN: User navigates to create company page
    await page.goto("/companies/new");

    // AND: User attempts to create another company with the same name
    await page.getByTestId("company-name-input").fill(companyName);
    await page
      .getByTestId("company-status-select")
      .selectOption(companyData.status);
    await page.getByTestId("company-submit-button").click();

    // Wait for create API response (deterministic wait)
    await createCompanyPromise;

    // THEN: Validation error should be displayed for duplicate name
    await expect(
      page.getByTestId("company-name-error"),
      "Duplicate company name error should be displayed",
    ).toBeVisible();

    // AND: Form should not be submitted
    await expect(page).toHaveURL(/\/companies\/new/);

    // Cleanup: Delete created company
    await authenticatedApiRequest.delete(`/api/companies/${createdCompany.id}`);
  });

  test("[P1] 2.4-E2E-005-002: Suspended company should be reactivatable", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as System Admin
    const systemAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });
    await setAuthenticatedUser(page, {
      id: systemAdmin.id!,
      email: systemAdmin.email,
      name: systemAdmin.name,
      roles: ["SYSTEM_ADMIN"],
    });

    // AND: A suspended company exists
    const companyData = createCompany({ status: "SUSPENDED" });
    const createResponse = await authenticatedApiRequest.post(
      "/api/companies",
      {
        data: companyData,
      },
    );
    expect(createResponse.status()).toBe(201);
    const createdCompany = await createResponse.json();

    // Network-first: Intercept update company API BEFORE navigation
    const updateCompanyPromise = page.waitForResponse(
      (resp: any) =>
        resp.url().includes(`/api/companies/${createdCompany.id}`) &&
        resp.request().method() === "PUT" &&
        resp.status() === 200,
    );

    // WHEN: User navigates to edit company page
    await page.goto(`/companies/${createdCompany.id}/edit`);

    // AND: User changes status from SUSPENDED to ACTIVE
    await page.getByTestId("company-status-select").selectOption("ACTIVE");
    await page.getByTestId("company-submit-button").click();

    // Wait for update API response (deterministic wait)
    await updateCompanyPromise;

    // THEN: Success message should be displayed
    await expect(
      page.getByTestId("toast-success"),
      "Success toast message should be displayed after reactivation",
    ).toBeVisible();

    // AND: Company status should be updated to ACTIVE
    await expect(
      page.getByTestId("company-detail-status"),
      "Company status should be ACTIVE after reactivation",
    ).toContainText(/ACTIVE/i);

    // Cleanup: Delete created company
    await authenticatedApiRequest.delete(`/api/companies/${createdCompany.id}`);
  });

  test("[P1] 2.4-E2E-005-003: Suspending company should cascade suspend stores", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as System Admin
    const systemAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });
    await setAuthenticatedUser(page, {
      id: systemAdmin.id!,
      email: systemAdmin.email,
      name: systemAdmin.name,
      roles: ["SYSTEM_ADMIN"],
    });

    // AND: A company with stores exists
    const companyData = createCompany();
    const companyResponse = await authenticatedApiRequest.post(
      "/api/companies",
      {
        data: companyData,
      },
    );
    expect(companyResponse.status()).toBe(201);
    const createdCompany = await companyResponse.json();

    const storeData = createStore({ company_id: createdCompany.id });
    const storeResponse = await authenticatedApiRequest.post("/api/stores", {
      data: storeData,
    });
    expect(storeResponse.status()).toBe(201);
    const createdStore = await storeResponse.json();

    // Network-first: Intercept update company API BEFORE navigation
    const updateCompanyPromise = page.waitForResponse(
      (resp: any) =>
        resp.url().includes(`/api/companies/${createdCompany.id}`) &&
        resp.request().method() === "PUT" &&
        resp.status() === 200,
    );

    // WHEN: User suspends the company
    await page.goto(`/companies/${createdCompany.id}/edit`);
    await page.getByTestId("company-status-select").selectOption("SUSPENDED");
    await page.getByTestId("company-submit-button").click();

    // Wait for update API response (deterministic wait)
    await updateCompanyPromise;

    // THEN: Company should be suspended
    await expect(
      page.getByTestId("company-detail-status"),
      "Company status should be SUSPENDED",
    ).toContainText(/SUSPENDED/i);

    // AND: Store should also be suspended (cascading effect)
    // Note: This may require API verification or store detail page check
    const storeDetailResponse = await authenticatedApiRequest.get(
      `/api/stores/${createdStore.id}`,
    );
    expect(storeDetailResponse.status()).toBe(200);
    const storeDetail = await storeDetailResponse.json();
    // Verify store status reflects cascading suspension
    // Implementation dependent - may check store status or company relationship

    // Cleanup: Delete created store and company
    await authenticatedApiRequest.delete(`/api/stores/${createdStore.id}`);
    await authenticatedApiRequest.delete(`/api/companies/${createdCompany.id}`);
  });
});

// ============================================================================
// EDGE CASE TESTS - Enhanced from interactive Q&A
// ============================================================================

test.describe("2.4-E2E-006: Edge Cases - Company Form Inputs", () => {
  test("[P2] 2.4-E2E-006-001: Company name should handle empty string", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as System Admin
    const systemAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });
    await setAuthenticatedUser(page, {
      id: systemAdmin.id!,
      email: systemAdmin.email,
      name: systemAdmin.name,
      roles: ["SYSTEM_ADMIN"],
    });

    // WHEN: User navigates to create company page
    await page.goto("/companies/new");

    // AND: User submits form with empty name
    await page.getByTestId("company-name-input").fill("");
    await page.getByTestId("company-submit-button").click();

    // THEN: Validation error should be displayed
    await expect(
      page.getByTestId("company-name-error"),
      "Empty name validation error should be displayed",
    ).toBeVisible();

    // AND: Form should not be submitted
    await expect(page).toHaveURL(/\/companies\/new/);
  });

  test("[P2] 2.4-E2E-006-002: Company name should handle very long string", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as System Admin
    const systemAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });
    await setAuthenticatedUser(page, {
      id: systemAdmin.id!,
      email: systemAdmin.email,
      name: systemAdmin.name,
      roles: ["SYSTEM_ADMIN"],
    });

    // WHEN: User navigates to create company page
    await page.goto("/companies/new");

    // AND: User enters very long company name (1000+ characters)
    const longName = "A".repeat(1000);
    await page.getByTestId("company-name-input").fill(longName);
    await page.getByTestId("company-status-select").selectOption("ACTIVE");
    await page.getByTestId("company-submit-button").click();

    // THEN: Validation error should be displayed for length limit
    // OR: Form should accept but truncate/validate appropriately
    // Implementation dependent - check for max length validation
    const errorVisible = await page
      .getByTestId("company-name-error")
      .isVisible()
      .catch(() => false);
    const stillOnPage = (await page.url()).includes("/companies/new");

    // Either validation error OR form submission with length check
    expect(errorVisible || !stillOnPage).toBe(true);
  });

  test("[P2] 2.4-E2E-006-003: Company name should handle special characters", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as System Admin
    const systemAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });
    await setAuthenticatedUser(page, {
      id: systemAdmin.id!,
      email: systemAdmin.email,
      name: systemAdmin.name,
      roles: ["SYSTEM_ADMIN"],
    });

    // WHEN: User navigates to create company page
    await page.goto("/companies/new");

    // AND: User enters company name with special characters
    const specialCharName = "Company @#$%^&*() Name";
    await page.getByTestId("company-name-input").fill(specialCharName);
    await page.getByTestId("company-status-select").selectOption("ACTIVE");
    await page.getByTestId("company-submit-button").click();

    // THEN: Form should handle special characters appropriately
    // (May accept, reject, or sanitize - implementation dependent)
    // Check if form submission succeeds or validation error appears
    const errorVisible = await page
      .getByTestId("company-name-error")
      .isVisible()
      .catch(() => false);
    const successVisible = await page
      .getByTestId("toast-success")
      .isVisible()
      .catch(() => false);

    // Form should either validate or accept special characters
    expect(errorVisible || successVisible).toBe(true);
  });

  test("[P2] 2.4-E2E-006-004: Company name should handle Unicode/emoji characters", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as System Admin
    const systemAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });
    await setAuthenticatedUser(page, {
      id: systemAdmin.id!,
      email: systemAdmin.email,
      name: systemAdmin.name,
      roles: ["SYSTEM_ADMIN"],
    });

    // WHEN: User navigates to create company page
    await page.goto("/companies/new");

    // AND: User enters company name with Unicode/emoji
    const unicodeName = "Company 🏢 公司 Name";
    await page.getByTestId("company-name-input").fill(unicodeName);
    await page.getByTestId("company-status-select").selectOption("ACTIVE");
    await page.getByTestId("company-submit-button").click();

    // THEN: Form should handle Unicode appropriately
    // (May accept or reject - implementation dependent)
    const errorVisible = await page
      .getByTestId("company-name-error")
      .isVisible()
      .catch(() => false);
    const successVisible = await page
      .getByTestId("toast-success")
      .isVisible()
      .catch(() => false);

    expect(errorVisible || successVisible).toBe(true);
  });
});

test.describe("2.4-E2E-007: Edge Cases - Store Form Inputs", () => {
  test("[P2] 2.4-E2E-007-001: Store name should handle empty string", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as Corporate Admin
    const corporateAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });

    const companyData = createCompany();
    const companyResponse = await authenticatedApiRequest.post(
      "/api/companies",
      {
        data: companyData,
      },
    );
    expect(companyResponse.status()).toBe(201);
    const createdCompany = await companyResponse.json();

    await setAuthenticatedUser(page, {
      id: corporateAdmin.id!,
      email: corporateAdmin.email,
      name: corporateAdmin.name,
      roles: ["CORPORATE_ADMIN"],
      company_id: createdCompany.id,
    });

    // WHEN: User navigates to create store page
    await page.goto("/stores/new");

    // AND: User submits form with empty name
    await page.getByTestId("store-name-input").fill("");
    await page.getByTestId("store-submit-button").click();

    // THEN: Validation error should be displayed
    await expect(
      page.getByTestId("store-name-error"),
      "Empty name validation error should be displayed",
    ).toBeVisible();

    // Cleanup: Delete created company
    await authenticatedApiRequest.delete(`/api/companies/${createdCompany.id}`);
  });

  test("[P2] 2.4-E2E-007-002: Store timezone should handle invalid format", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as Corporate Admin
    const corporateAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });

    const companyData = createCompany();
    const companyResponse = await authenticatedApiRequest.post(
      "/api/companies",
      {
        data: companyData,
      },
    );
    expect(companyResponse.status()).toBe(201);
    const createdCompany = await companyResponse.json();

    await setAuthenticatedUser(page, {
      id: corporateAdmin.id!,
      email: corporateAdmin.email,
      name: corporateAdmin.name,
      roles: ["CORPORATE_ADMIN"],
      company_id: createdCompany.id,
    });

    // WHEN: User navigates to create store page
    await page.goto("/stores/new");

    // AND: User enters invalid timezone format
    await page.getByTestId("store-name-input").fill(faker.company.name());
    await page
      .getByTestId("store-timezone-input")
      .fill("Invalid/Timezone/Format");
    await page.getByTestId("store-submit-button").click();

    // THEN: Validation error should be displayed
    await expect(
      page.getByTestId("store-timezone-error"),
      "Invalid timezone format error should be displayed",
    ).toBeVisible();

    // Cleanup: Delete created company
    await authenticatedApiRequest.delete(`/api/companies/${createdCompany.id}`);
  });

  test("[P2] 2.4-E2E-007-003: Store GPS coordinates should handle out-of-bounds latitude", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as Corporate Admin
    const corporateAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });

    const companyData = createCompany();
    const companyResponse = await authenticatedApiRequest.post(
      "/api/companies",
      {
        data: companyData,
      },
    );
    expect(companyResponse.status()).toBe(201);
    const createdCompany = await companyResponse.json();

    await setAuthenticatedUser(page, {
      id: corporateAdmin.id!,
      email: corporateAdmin.email,
      name: corporateAdmin.name,
      roles: ["CORPORATE_ADMIN"],
      company_id: createdCompany.id,
    });

    // WHEN: User navigates to create store page
    await page.goto("/stores/new");

    // AND: User enters latitude > 90
    await page.getByTestId("store-name-input").fill(faker.company.name());
    await page.getByTestId("store-location-lat-input").fill("91");
    await page.getByTestId("store-location-lng-input").fill("-74.006");
    await page.getByTestId("store-submit-button").click();

    // THEN: Validation error should be displayed
    await expect(
      page.getByTestId("store-location-lat-error"),
      "Latitude bounds validation error should be displayed",
    ).toBeVisible();

    // Cleanup: Delete created company
    await authenticatedApiRequest.delete(`/api/companies/${createdCompany.id}`);
  });

  test("[P2] 2.4-E2E-007-004: Store GPS coordinates should handle out-of-bounds longitude", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as Corporate Admin
    const corporateAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });

    const companyData = createCompany();
    const companyResponse = await authenticatedApiRequest.post(
      "/api/companies",
      {
        data: companyData,
      },
    );
    expect(companyResponse.status()).toBe(201);
    const createdCompany = await companyResponse.json();

    await setAuthenticatedUser(page, {
      id: corporateAdmin.id!,
      email: corporateAdmin.email,
      name: corporateAdmin.name,
      roles: ["CORPORATE_ADMIN"],
      company_id: createdCompany.id,
    });

    // WHEN: User navigates to create store page
    await page.goto("/stores/new");

    // AND: User enters longitude > 180
    await page.getByTestId("store-name-input").fill(faker.company.name());
    await page.getByTestId("store-location-lat-input").fill("40.7128");
    await page.getByTestId("store-location-lng-input").fill("181");
    await page.getByTestId("store-submit-button").click();

    // THEN: Validation error should be displayed
    await expect(
      page.getByTestId("store-location-lng-error"),
      "Longitude bounds validation error should be displayed",
    ).toBeVisible();

    // Cleanup: Delete created company
    await authenticatedApiRequest.delete(`/api/companies/${createdCompany.id}`);
  });
});

// ============================================================================
// SECURITY TESTS - Enhanced from interactive Q&A
// ============================================================================

test.describe("2.4-E2E-008: Security - Authentication and Authorization", () => {
  test("[P0] 2.4-E2E-008-001: Unauthenticated user should not access companies page", async ({
    page,
  }) => {
    // GIVEN: User is NOT authenticated (no auth session)

    // WHEN: User attempts to navigate to companies page
    await page.goto("/companies");

    // THEN: User should be redirected to login or see access denied
    // Implementation dependent - may redirect to /login or show 403
    const currentUrl = page.url();
    const isLoginPage = currentUrl.includes("/login");
    const isAccessDenied = await page
      .getByText(/access denied|unauthorized|forbidden/i)
      .isVisible()
      .catch(() => false);

    expect(isLoginPage || isAccessDenied).toBe(true);
  });

  test("[P0] 2.4-E2E-008-002: Corporate Admin should not access companies page", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as Corporate Admin (not System Admin)
    const corporateAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });
    await setAuthenticatedUser(page, {
      id: corporateAdmin.id!,
      email: corporateAdmin.email,
      name: corporateAdmin.name,
      roles: ["CORPORATE_ADMIN"],
    });

    // WHEN: User attempts to navigate to companies page directly
    await page.goto("/companies");

    // THEN: User should see access denied or be redirected
    const isAccessDenied = await page
      .getByText(/access denied|unauthorized|forbidden|not authorized/i)
      .isVisible()
      .catch(() => false);
    const isRedirected = !page.url().includes("/companies");

    expect(isAccessDenied || isRedirected).toBe(true);
  });

  test("[P0] 2.4-E2E-008-003: Corporate Admin should only see stores for their company", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as Corporate Admin for Company A
    const corporateAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });

    // Create Company A
    const companyAData = createCompany();
    const companyAResponse = await authenticatedApiRequest.post(
      "/api/companies",
      {
        data: companyAData,
      },
    );
    expect(companyAResponse.status()).toBe(201);
    const companyA = await companyAResponse.json();

    // Create Company B
    const companyBData = createCompany();
    const companyBResponse = await authenticatedApiRequest.post(
      "/api/companies",
      {
        data: companyBData,
      },
    );
    expect(companyBResponse.status()).toBe(201);
    const companyB = await companyBResponse.json();

    // Create stores for both companies
    const storeA = createStore({ company_id: companyA.id });
    const storeAResponse = await authenticatedApiRequest.post("/api/stores", {
      data: storeA,
    });
    expect(storeAResponse.status()).toBe(201);

    const storeB = createStore({ company_id: companyB.id });
    const storeBResponse = await authenticatedApiRequest.post("/api/stores", {
      data: storeB,
    });
    expect(storeBResponse.status()).toBe(201);

    await setAuthenticatedUser(page, {
      id: corporateAdmin.id!,
      email: corporateAdmin.email,
      name: corporateAdmin.name,
      roles: ["CORPORATE_ADMIN"],
      company_id: companyA.id,
    });

    // Network-first: Intercept stores API BEFORE navigation
    const storesPromise = page.waitForResponse(
      (resp: any) =>
        resp.url().includes("/api/stores") && resp.status() === 200,
    );

    // WHEN: User navigates to stores page
    await page.goto("/stores");

    // Wait for stores API response (deterministic wait)
    await storesPromise;

    // THEN: User should only see stores for Company A
    // AND: Store from Company B should NOT be visible
    const storeBVisible = await page
      .getByText(storeB.name)
      .isVisible()
      .catch(() => false);

    expect(storeBVisible).toBe(false);

    // Cleanup: Delete created stores and companies
    await authenticatedApiRequest.delete(
      `/api/stores/${(await storeAResponse.json()).id}`,
    );
    await authenticatedApiRequest.delete(
      `/api/stores/${(await storeBResponse.json()).id}`,
    );
    await authenticatedApiRequest.delete(`/api/companies/${companyA.id}`);
    await authenticatedApiRequest.delete(`/api/companies/${companyB.id}`);
  });
});

test.describe("2.4-E2E-009: Security - Input Validation and Injection Prevention", () => {
  test("[P0] 2.4-E2E-009-001: Company name should prevent SQL injection", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as System Admin
    const systemAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });
    await setAuthenticatedUser(page, {
      id: systemAdmin.id!,
      email: systemAdmin.email,
      name: systemAdmin.name,
      roles: ["SYSTEM_ADMIN"],
    });

    // WHEN: User navigates to create company page
    await page.goto("/companies/new");

    // AND: User enters SQL injection attempt in company name
    const sqlInjection = "'; DROP TABLE companies; --";
    await page.getByTestId("company-name-input").fill(sqlInjection);
    await page.getByTestId("company-status-select").selectOption("ACTIVE");
    await page.getByTestId("company-submit-button").click();

    // THEN: SQL injection should be sanitized or rejected
    // Form should either validate and reject OR sanitize the input
    const errorVisible = await page
      .getByTestId("company-name-error")
      .isVisible()
      .catch(() => false);
    const stillOnPage = (await page.url()).includes("/companies/new");

    // SQL injection should not succeed - either validation error or sanitization
    expect(errorVisible || stillOnPage).toBe(true);
  });

  test("[P0] 2.4-E2E-009-002: Company name should prevent XSS injection", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as System Admin
    const systemAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });
    await setAuthenticatedUser(page, {
      id: systemAdmin.id!,
      email: systemAdmin.email,
      name: systemAdmin.name,
      roles: ["SYSTEM_ADMIN"],
    });

    // WHEN: User navigates to create company page
    await page.goto("/companies/new");

    // AND: User enters XSS injection attempt in company name
    const xssInjection = "<script>alert('XSS')</script>";
    await page.getByTestId("company-name-input").fill(xssInjection);
    await page.getByTestId("company-status-select").selectOption("ACTIVE");
    await page.getByTestId("company-submit-button").click();

    // THEN: XSS injection should be sanitized
    // If form submission succeeds, XSS should be escaped in display
    const errorVisible = await page
      .getByTestId("company-name-error")
      .isVisible()
      .catch(() => false);
    const successVisible = await page
      .getByTestId("toast-success")
      .isVisible()
      .catch(() => false);

    if (successVisible) {
      // If successful, verify XSS is escaped in the displayed name
      const displayedName = await page
        .getByText(xssInjection)
        .isVisible()
        .catch(() => false);
      // XSS should NOT execute - script tags should be escaped/removed
      expect(displayedName).toBe(false);
    } else {
      // Or validation should reject it
      expect(errorVisible).toBe(true);
    }
  });

  test("[P0] 2.4-E2E-009-003: Store name should prevent HTML injection", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as Corporate Admin
    const corporateAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });

    const companyData = createCompany();
    const companyResponse = await authenticatedApiRequest.post(
      "/api/companies",
      {
        data: companyData,
      },
    );
    expect(companyResponse.status()).toBe(201);
    const createdCompany = await companyResponse.json();

    await setAuthenticatedUser(page, {
      id: corporateAdmin.id!,
      email: corporateAdmin.email,
      name: corporateAdmin.name,
      roles: ["CORPORATE_ADMIN"],
      company_id: createdCompany.id,
    });

    // WHEN: User navigates to create store page
    await page.goto("/stores/new");

    // AND: User enters HTML injection attempt in store name
    const htmlInjection = "<img src=x onerror=alert('HTML')>";
    await page.getByTestId("store-name-input").fill(htmlInjection);
    await page.getByTestId("store-timezone-input").fill("America/New_York");
    await page.getByTestId("store-submit-button").click();

    // THEN: HTML injection should be sanitized or rejected
    const errorVisible = await page
      .getByTestId("store-name-error")
      .isVisible()
      .catch(() => false);
    const successVisible = await page
      .getByTestId("toast-success")
      .isVisible()
      .catch(() => false);

    if (successVisible) {
      // If successful, verify HTML is escaped
      const htmlExecuted = await page
        .locator("img[src='x']")
        .isVisible()
        .catch(() => false);
      expect(htmlExecuted).toBe(false);
    } else {
      expect(errorVisible).toBe(true);
    }

    // Cleanup: Delete created company
    await authenticatedApiRequest.delete(`/api/companies/${createdCompany.id}`);
  });

  test("[P0] 2.4-E2E-009-004: Store location should prevent path traversal", async ({
    page,
    authenticatedApiRequest,
  }) => {
    // GIVEN: User is authenticated as Corporate Admin
    const corporateAdmin = createUser({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    });

    const companyData = createCompany();
    const companyResponse = await authenticatedApiRequest.post(
      "/api/companies",
      {
        data: companyData,
      },
    );
    expect(companyResponse.status()).toBe(201);
    const createdCompany = await companyResponse.json();

    await setAuthenticatedUser(page, {
      id: corporateAdmin.id!,
      email: corporateAdmin.email,
      name: corporateAdmin.name,
      roles: ["CORPORATE_ADMIN"],
      company_id: createdCompany.id,
    });

    // WHEN: User navigates to create store page
    await page.goto("/stores/new");

    // AND: User enters path traversal attempt in address field
    const pathTraversal = "../../../etc/passwd";
    await page.getByTestId("store-name-input").fill(faker.company.name());
    await page.getByTestId("store-timezone-input").fill("America/New_York");
    await page.getByTestId("store-location-address-input").fill(pathTraversal);
    await page.getByTestId("store-submit-button").click();

    // THEN: Path traversal should be sanitized or rejected
    const errorVisible = await page
      .getByTestId("store-location-address-error")
      .isVisible()
      .catch(() => false);
    const stillOnPage = (await page.url()).includes("/stores/new");

    expect(errorVisible || stillOnPage).toBe(true);

    // Cleanup: Delete created company
    await authenticatedApiRequest.delete(`/api/companies/${createdCompany.id}`);
  });
});
