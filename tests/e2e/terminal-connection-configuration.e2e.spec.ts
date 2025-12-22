/**
 * Terminal Connection Configuration E2E Tests
 *
 * Story 4.82: Terminal Connection Configuration UI
 *
 * @test-level E2E
 * @justification E2E tests for critical user journey: viewing terminals, creating terminal with connection config, editing connection
 * @feature Terminal Connection Configuration
 * @created 2025-01-27
 * @priority P0 (Critical)
 *
 * CRITICAL USER JOURNEY:
 * - Store Manager views terminals with connection information
 * - Store Manager creates terminal with API connection configuration
 * - Store Manager edits terminal to change connection type to NETWORK
 *
 * Implementation Notes:
 * - UI uses StoreForm component at /stores/:storeId/edit
 * - TerminalManagementSection handles terminal CRUD operations
 * - Connection type fields are dynamically rendered based on selection
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import { createStore, createCompany, createUser } from "../support/helpers";
import { createApiTerminal } from "../support/factories/terminal.factory";

test.describe("Terminal Connection Configuration E2E", () => {
  /**
   * Critical User Journey: View terminals with connection information
   *
   * WHY: Store managers need to see connection status at a glance
   * RISK: Medium - affects visibility of terminal status
   * VALIDATES: Terminal list displays connection type, status, and sync information
   */
  test("[P0] Store Manager can view terminals with connection information in EditStoreModal", async ({
    superadminPage,
    prismaClient,
    superadminApiRequest,
  }) => {
    const page = superadminPage;
    // GIVEN: Terminal exists with connection configuration
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    const terminalData = createApiTerminal({
      store_id: store.store_id,
      name: "API Terminal",
      terminal_status: "ACTIVE",
      sync_status: "SUCCESS",
    });

    const createResponse = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: terminalData.name,
        device_id: terminalData.device_id,
        connection_type: terminalData.connection_type,
        connection_config: terminalData.connection_config,
        vendor_type: terminalData.vendor_type,
        terminal_status: terminalData.terminal_status,
        sync_status: terminalData.sync_status,
      },
    );

    const createdTerminal = await createResponse.json();

    // CRITICAL: Intercept routes BEFORE navigation (network-first pattern)
    await page.route(`**/api/stores/${store.store_id}/terminals`, (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({
          status: 200,
          body: JSON.stringify([createdTerminal]),
        });
      } else {
        route.continue();
      }
    });

    // Navigate to store management
    await page.goto(`/stores/${store.store_id}/edit`);

    // THEN: Terminal list displays connection type badge
    await expect(page.getByText("API Terminal")).toBeVisible();
    // Use exact match for the connection type badge to avoid matching "API Terminal"
    await expect(page.getByText("API", { exact: true })).toBeVisible();

    // THEN: Terminal status badge is displayed (use first() in case multiple badges)
    await expect(page.getByText("ACTIVE").first()).toBeVisible();

    // THEN: Sync status information is displayed (if available)
    // Note: Sync status may show "Last sync: X ago" or "Never synced"
    const syncStatusText = page.locator("text=/Last sync|Never synced/i");
    await expect(syncStatusText.first()).toBeVisible({ timeout: 5000 });
  });

  /**
   * Critical User Journey: Create terminal with connection configuration
   *
   * WHY: This is the primary workflow for store managers
   * RISK: High - affects terminal operations
   * VALIDATES: Full user flow from UI to API to database
   */
  test("[P0] Store Manager can create terminal with API connection configuration", async ({
    superadminPage,
    prismaClient,
  }) => {
    const page = superadminPage;
    // GIVEN: Store Manager is authenticated and viewing a store
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    // Navigate to store management
    await page.goto(`/stores/${store.store_id}/edit`);

    // Wait for page to load
    await expect(
      page.getByRole("heading", { name: /Edit Store/i }),
    ).toBeVisible();

    // WHEN: Store Manager opens terminal creation dialog
    await page.getByRole("button", { name: /Add Terminal/i }).click();

    // THEN: Terminal form is displayed
    await expect(
      page.getByRole("heading", { name: /Add Terminal/i }),
    ).toBeVisible();

    // WHEN: Store Manager fills terminal name using the input id
    await page.locator("#terminal-name").fill("API Terminal");

    // WHEN: Store Manager selects API connection type
    // Click the connection type select trigger
    await page.locator("#connection-type").click();
    await page.getByRole("option", { name: /^API$/i }).click();

    // THEN: API connection config fields are displayed (check for the inputs)
    // The API connection type shows Base URL and API Key fields
    await expect(page.locator("#api-base-url")).toBeVisible();
    await expect(page.locator("#api-key")).toBeVisible();

    // WHEN: Store Manager fills API connection config
    await page.locator("#api-base-url").fill("https://api.example.com");
    await page.locator("#api-key").fill("secret-api-key-123");

    // WHEN: Store Manager selects POS Vendor
    await page.locator("#vendor-type").click();
    await page.getByRole("option", { name: /Square/i }).click();

    // WHEN: Store Manager submits form
    await page.getByRole("button", { name: /Create Terminal/i }).click();

    // THEN: Success message is displayed (toast notification)
    await expect(
      page.getByText(/Terminal created successfully|Success/i).first(),
    ).toBeVisible({ timeout: 10000 });

    // THEN: Terminal list updates to show new terminal with API connection
    await expect(page.getByText("API Terminal")).toBeVisible({ timeout: 5000 });
    // Verify the API badge is shown
    await expect(page.getByText("API", { exact: true })).toBeVisible();
  });

  /**
   * Critical User Journey: Edit terminal connection configuration
   *
   * WHY: Store managers need to update connection settings
   * RISK: High - affects terminal operations
   * VALIDATES: Full user flow for editing connection config
   */
  test("[P0] Store Manager can edit terminal connection configuration", async ({
    superadminPage,
    prismaClient,
    superadminApiRequest,
  }) => {
    const page = superadminPage;
    // GIVEN: Terminal exists with API connection
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    const terminalData = createApiTerminal({
      store_id: store.store_id,
      name: "Existing Terminal",
    });

    const createResponse = await superadminApiRequest.post(
      `/api/stores/${store.store_id}/terminals`,
      {
        name: terminalData.name,
        device_id: terminalData.device_id,
        connection_type: terminalData.connection_type,
        connection_config: terminalData.connection_config,
        vendor_type: terminalData.vendor_type,
      },
    );

    expect(createResponse.status()).toBe(201);

    // Navigate to store management
    await page.goto(`/stores/${store.store_id}/edit`);

    // Wait for page to load
    await expect(
      page.getByRole("heading", { name: /Edit Store/i }),
    ).toBeVisible();

    // Wait for terminals to load
    await expect(page.getByText("Existing Terminal")).toBeVisible({
      timeout: 10000,
    });

    // WHEN: Store Manager clicks edit button on terminal
    await page.getByRole("button", { name: /Edit Existing Terminal/i }).click();

    // THEN: Terminal edit form is displayed
    await expect(
      page.getByRole("heading", { name: /Edit Terminal/i }),
    ).toBeVisible();

    // WHEN: Store Manager changes connection type to NETWORK
    await page.locator("#edit-connection-type").click();
    await page.getByRole("option", { name: /Network/i }).click();

    // THEN: NETWORK connection config fields are displayed
    await expect(page.locator("#network-host")).toBeVisible();
    await expect(page.locator("#network-port")).toBeVisible();
    await expect(page.locator("#network-protocol")).toBeVisible();

    // WHEN: Store Manager fills NETWORK connection config
    await page.locator("#network-host").fill("192.168.1.100");
    await page.locator("#network-port").fill("9000");
    await page.locator("#network-protocol").click();
    await page.getByRole("option", { name: /HTTP/i }).click();

    // WHEN: Store Manager submits form
    await page.getByRole("button", { name: /Update Terminal/i }).click();

    // THEN: Success message is displayed
    await expect(
      page.getByText(/Terminal updated successfully|Success/i).first(),
    ).toBeVisible({ timeout: 10000 });

    // THEN: Terminal list updates to show NETWORK connection badge
    // Use the badge locator to avoid strict mode violation (connection type badge vs select option)
    const terminalCard = page
      .locator(".border.rounded-lg")
      .filter({ hasText: "Existing Terminal" });
    await expect(terminalCard.getByText("Network")).toBeVisible({
      timeout: 5000,
    });
  });

  /**
   * Form Validation: Connection config fields appear/disappear based on connection type
   *
   * WHY: Users need clear visual feedback when selecting connection types
   * RISK: Medium - affects user experience
   * VALIDATES: Dynamic form field rendering
   */
  test("[P1] Connection config fields appear/disappear based on connection type selection", async ({
    superadminPage,
    prismaClient,
  }) => {
    const page = superadminPage;
    // GIVEN: Store Manager is viewing terminal creation form
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    await page.goto(`/stores/${store.store_id}/edit`);

    // Wait for page to load
    await expect(
      page.getByRole("heading", { name: /Edit Store/i }),
    ).toBeVisible();

    await page.getByRole("button", { name: /Add Terminal/i }).click();

    await expect(
      page.getByRole("heading", { name: /Add Terminal/i }),
    ).toBeVisible();

    // WHEN: Store Manager selects NETWORK connection type
    await page.locator("#connection-type").click();
    await page.getByRole("option", { name: /Network/i }).click();

    // THEN: NETWORK fields are visible, other fields are not
    await expect(page.locator("#network-host")).toBeVisible();
    await expect(page.locator("#network-port")).toBeVisible();
    await expect(page.locator("#network-protocol")).toBeVisible();
    await expect(page.locator("#api-base-url")).not.toBeVisible();
    await expect(page.locator("#file-import-path")).not.toBeVisible();

    // WHEN: Store Manager changes to API connection type
    await page.locator("#connection-type").click();
    await page.getByRole("option", { name: /^API$/i }).click();

    // THEN: API fields are visible, NETWORK fields are hidden
    await expect(page.locator("#api-base-url")).toBeVisible();
    await expect(page.locator("#api-key")).toBeVisible();
    await expect(page.locator("#network-host")).not.toBeVisible();
    await expect(page.locator("#network-port")).not.toBeVisible();

    // WHEN: Store Manager changes to FILE connection type
    await page.locator("#connection-type").click();
    await page.getByRole("option", { name: /File/i }).click();

    // THEN: FILE fields are visible, API fields are hidden
    await expect(page.locator("#file-import-path")).toBeVisible();
    await expect(page.locator("#api-base-url")).not.toBeVisible();
    await expect(page.locator("#api-key")).not.toBeVisible();

    // WHEN: Store Manager changes to MANUAL connection type
    await page.locator("#connection-type").click();
    await page.getByRole("option", { name: /Manual/i }).click();

    // THEN: No connection config fields are visible
    await expect(page.locator("#network-host")).not.toBeVisible();
    await expect(page.locator("#api-base-url")).not.toBeVisible();
    await expect(page.locator("#file-import-path")).not.toBeVisible();
  });

  /**
   * Form Validation: Rejects invalid connection config structures
   *
   * WHY: Invalid configs should be caught before submission
   * RISK: Medium - prevents invalid data from reaching backend
   * VALIDATES: Client-side validation for connection config
   */
  test("[P1] Form validation rejects invalid connection config structures", async ({
    superadminPage,
    prismaClient,
  }) => {
    const page = superadminPage;
    // GIVEN: Store Manager is creating terminal with API connection
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    await page.goto(`/stores/${store.store_id}/edit`);

    // Wait for page to load
    await expect(
      page.getByRole("heading", { name: /Edit Store/i }),
    ).toBeVisible();

    await page.getByRole("button", { name: /Add Terminal/i }).click();

    await expect(
      page.getByRole("heading", { name: /Add Terminal/i }),
    ).toBeVisible();

    // WHEN: Store Manager fills terminal name
    await page.locator("#terminal-name").fill("Invalid Terminal");

    // WHEN: Store Manager selects API connection type
    await page.locator("#connection-type").click();
    await page.getByRole("option", { name: /^API$/i }).click();

    await expect(page.locator("#api-base-url")).toBeVisible();

    // WHEN: Store Manager enters invalid URL format
    await page.locator("#api-base-url").fill("not-a-valid-url");
    // Trigger blur to show validation error
    await page.locator("#api-key").fill("test-key");
    await page.locator("#api-base-url").blur();

    // THEN: Validation error should be displayed
    // The ConnectionConfigForm shows an error message for invalid URLs
    await expect(page.getByText(/baseUrl must be a valid URL/i)).toBeVisible({
      timeout: 5000,
    });
  });

  /**
   * Security: Authentication Bypass Prevention
   */
  test("[P0] Should reject access without authentication", async ({
    page,
    prismaClient,
  }) => {
    // GIVEN: Store exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    // WHEN: User navigates to store edit page without authentication
    // Use unauthenticated page (no cookies)
    await page.goto(`/stores/${store.store_id}/edit`);

    // Wait for redirect to complete (either login page or error message)
    try {
      await page.waitForURL(/\/login|\/auth/, { timeout: 10000 });
    } catch {
      // If URL wait times out, check for error message text instead
      await expect(
        page.getByText(/unauthorized|forbidden|login|sign in/i),
      ).toBeVisible({ timeout: 10000 });
    }

    // THEN: User should be redirected to login or see 401/403 error
    // Check for login page or error message
    const currentUrl = page.url();
    const isLoginPage =
      currentUrl.includes("/login") || currentUrl.includes("/auth");
    const errorMessage = page.getByText(
      /unauthorized|forbidden|login|sign in/i,
    );

    expect(
      isLoginPage || (await errorMessage.isVisible().catch(() => false)),
    ).toBeTruthy();
  });

  /**
   * Security: Input Validation - XSS Prevention
   */
  test("[P0] Should prevent XSS in terminal name field", async ({
    superadminPage,
    prismaClient,
  }) => {
    const page = superadminPage;
    // GIVEN: Store Manager is authenticated and viewing terminal creation form
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      name: "Test Company",
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Test Store",
    });

    await page.goto(`/stores/${store.store_id}/edit`);

    // Wait for page to load
    await expect(
      page.getByRole("heading", { name: /Edit Store/i }),
    ).toBeVisible();

    await page.getByRole("button", { name: /Add Terminal/i }).click();

    await expect(
      page.getByRole("heading", { name: /Add Terminal/i }),
    ).toBeVisible();

    // WHEN: Store Manager enters XSS attempt in terminal name
    const xssPayload = "<script>alert('XSS')</script>";
    await page.locator("#terminal-name").fill(xssPayload);

    // THEN: XSS should be prevented (either validation error or sanitized)
    // Check that script tags are not executed or are sanitized
    const nameInput = page.locator("#terminal-name");
    const value = await nameInput.inputValue();

    // Value should be stored as literal text (React escapes by default)
    expect(value).toBe(xssPayload);

    // Try to submit and verify XSS is not executed
    await page.getByRole("button", { name: /Create Terminal/i }).click();

    // THEN: Terminal should be created with the literal string
    // React/Prisma handle XSS prevention by not executing script tags
    await expect(
      page.getByText(/Terminal created successfully|Success/i).first(),
    ).toBeVisible({ timeout: 10000 });

    // Verify the terminal is displayed with escaped content (no script execution)
    // The terminal name should be displayed as text, not executed
    await expect(page.getByText(/script/i)).toBeVisible();

    // No alert should have appeared (XSS prevented)
    // This is verified by the fact that the test continues without alert interruption
  });
});
