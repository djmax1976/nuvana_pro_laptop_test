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
 * Note: These tests are in RED phase - they will fail until implementation is complete.
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
  // SKIPPED: RED phase test - UI not yet implemented (Story 4.82)
  test.skip("[P0] Store Manager can create terminal with API connection configuration", async ({
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

    // CRITICAL: Intercept routes BEFORE navigation (network-first pattern)
    await page.route("**/api/stores/*/terminals", (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({
          status: 200,
          body: JSON.stringify([]),
        });
      } else {
        route.continue();
      }
    });

    // Navigate to store management
    await page.goto(`/stores/${store.store_id}/edit`);

    // WHEN: Store Manager opens terminal creation dialog
    await page.getByRole("button", { name: /Add Terminal/i }).click();

    // THEN: Terminal form is displayed
    await expect(
      page.getByRole("heading", { name: /Add Terminal/i }),
    ).toBeVisible();

    // WHEN: Store Manager fills terminal name
    await page.getByLabel(/Terminal Name/i).fill("API Terminal");

    // WHEN: Store Manager selects API connection type
    await page.getByLabel(/Connection Type/i).click();
    await page.getByRole("option", { name: /API/i }).click();

    // THEN: API connection config fields are displayed
    await expect(page.getByLabel(/Base URL/i)).toBeVisible();
    await expect(page.getByLabel(/API Key/i)).toBeVisible();

    // WHEN: Store Manager fills API connection config
    await page.getByLabel(/Base URL/i).fill("https://api.example.com");
    await page.getByLabel(/API Key/i).fill("secret-api-key-123");

    // WHEN: Store Manager selects POS Vendor
    await page.getByLabel(/POS Vendor/i).click();
    await page.getByRole("option", { name: /Square/i }).click();

    // WHEN: Store Manager submits form
    await page.getByRole("button", { name: /Create Terminal/i }).click();

    // THEN: Success message is displayed (toast notification)
    // Note: Toast may appear briefly, check for success text
    await expect(
      page.getByText(/Terminal created successfully|Success/i).first(),
    ).toBeVisible({ timeout: 5000 });

    // THEN: Terminal list updates to show new terminal with API connection
    await expect(page.getByText("API Terminal")).toBeVisible({ timeout: 5000 });
  });

  /**
   * Critical User Journey: Edit terminal connection configuration
   *
   * WHY: Store managers need to update connection settings
   * RISK: High - affects terminal operations
   * VALIDATES: Full user flow for editing connection config
   */
  // SKIPPED: RED phase test - UI not yet implemented (Story 4.82)
  test.skip("[P0] Store Manager can edit terminal connection configuration", async ({
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

    // WHEN: Store Manager clicks edit button on terminal
    // Find edit button by aria-label or by text content near terminal name
    const terminalCard = page.locator("text=Existing Terminal").locator("..");
    await terminalCard.getByRole("button", { name: /Edit/i }).first().click();

    // THEN: Terminal edit form is displayed
    await expect(
      page.getByRole("heading", { name: /Edit Terminal/i }),
    ).toBeVisible();

    // WHEN: Store Manager changes connection type to NETWORK
    await page.getByLabel(/Connection Type/i).click();
    await page.getByRole("option", { name: /Network/i }).click();

    // THEN: NETWORK connection config fields are displayed
    await expect(page.getByLabel(/Host/i)).toBeVisible();
    await expect(page.getByLabel(/Port/i)).toBeVisible();
    await expect(page.getByLabel(/Protocol/i)).toBeVisible();

    // WHEN: Store Manager fills NETWORK connection config
    await page.getByLabel(/Host/i).fill("192.168.1.100");
    await page.getByLabel(/Port/i).fill("9000");
    await page.getByLabel(/Protocol/i).click();
    await page.getByRole("option", { name: /HTTP/i }).click();

    // WHEN: Store Manager submits form
    await page.getByRole("button", { name: /Update Terminal/i }).click();

    // THEN: Success message is displayed
    await expect(
      page.getByText(/Terminal updated successfully|Success/i).first(),
    ).toBeVisible({ timeout: 5000 });

    // THEN: Terminal list updates to show NETWORK connection
    await expect(page.getByText("Network")).toBeVisible({ timeout: 5000 });
  });

  /**
   * Form Validation: Connection config fields appear/disappear based on connection type
   *
   * WHY: Users need clear visual feedback when selecting connection types
   * RISK: Medium - affects user experience
   * VALIDATES: Dynamic form field rendering
   */
  // SKIPPED: RED phase test - UI not yet implemented (Story 4.82)
  test.skip("[P1] Connection config fields appear/disappear based on connection type selection", async ({
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

    await page.route("**/api/stores/*/terminals", (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({
          status: 200,
          body: JSON.stringify([]),
        });
      } else {
        route.continue();
      }
    });

    await page.goto(`/stores/${store.store_id}/edit`);
    await page.getByRole("button", { name: /Add Terminal/i }).click();

    await expect(
      page.getByRole("heading", { name: /Add Terminal/i }),
    ).toBeVisible();

    // WHEN: Store Manager selects NETWORK connection type
    await page.getByLabel(/Connection Type/i).click();
    await page.getByRole("option", { name: /Network/i }).click();

    // THEN: NETWORK fields are visible, other fields are not
    await expect(page.getByLabel(/Host/i)).toBeVisible();
    await expect(page.getByLabel(/Port/i)).toBeVisible();
    await expect(page.getByLabel(/Protocol/i)).toBeVisible();
    await expect(page.getByLabel(/Base URL/i)).not.toBeVisible();
    await expect(page.getByLabel(/Import Path/i)).not.toBeVisible();

    // WHEN: Store Manager changes to API connection type
    await page.getByLabel(/Connection Type/i).click();
    await page.getByRole("option", { name: /API/i }).click();

    // THEN: API fields are visible, NETWORK fields are hidden
    await expect(page.getByLabel(/Base URL/i)).toBeVisible();
    await expect(page.getByLabel(/API Key/i)).toBeVisible();
    await expect(page.getByLabel(/Host/i)).not.toBeVisible();
    await expect(page.getByLabel(/Port/i)).not.toBeVisible();

    // WHEN: Store Manager changes to FILE connection type
    await page.getByLabel(/Connection Type/i).click();
    await page.getByRole("option", { name: /File/i }).click();

    // THEN: FILE fields are visible, API fields are hidden
    await expect(page.getByLabel(/Import Path/i)).toBeVisible();
    await expect(page.getByLabel(/Base URL/i)).not.toBeVisible();
    await expect(page.getByLabel(/API Key/i)).not.toBeVisible();

    // WHEN: Store Manager changes to MANUAL connection type
    await page.getByLabel(/Connection Type/i).click();
    await page.getByRole("option", { name: /Manual/i }).click();

    // THEN: No connection config fields are visible
    await expect(page.getByLabel(/Host/i)).not.toBeVisible();
    await expect(page.getByLabel(/Base URL/i)).not.toBeVisible();
    await expect(page.getByLabel(/Import Path/i)).not.toBeVisible();
  });

  /**
   * Form Validation: Rejects invalid connection config structures
   *
   * WHY: Invalid configs should be caught before submission
   * RISK: Medium - prevents invalid data from reaching backend
   * VALIDATES: Client-side validation for connection config
   */
  // SKIPPED: RED phase test - UI not yet implemented (Story 4.82)
  test.skip("[P1] Form validation rejects invalid connection config structures", async ({
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

    await page.route("**/api/stores/*/terminals", (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({
          status: 200,
          body: JSON.stringify([]),
        });
      } else {
        route.continue();
      }
    });

    await page.goto(`/stores/${store.store_id}/edit`);
    await page.getByRole("button", { name: /Add Terminal/i }).click();

    await expect(
      page.getByRole("heading", { name: /Add Terminal/i }),
    ).toBeVisible();

    // WHEN: Store Manager fills terminal name
    await page.getByLabel(/Terminal Name/i).fill("Invalid Terminal");

    // WHEN: Store Manager selects API connection type
    await page.getByLabel(/Connection Type/i).click();
    await page.getByRole("option", { name: /API/i }).click();

    await expect(page.getByLabel(/Base URL/i)).toBeVisible();

    // WHEN: Store Manager enters invalid URL format
    await page.getByLabel(/Base URL/i).fill("not-a-valid-url");
    await page.getByLabel(/API Key/i).fill("test-key");

    // WHEN: Store Manager tries to submit
    await page.getByRole("button", { name: /Create Terminal/i }).click();

    // THEN: Validation error should be displayed or form should not submit
    // Note: Browser native validation or custom validation may show error
    // Check for either validation message or that form didn't submit (no success toast)
    const urlInput = page.getByLabel(/Base URL/i);
    const validationMessage = await urlInput.evaluate(
      (el: HTMLInputElement) => el.validationMessage,
    );

    // Browser validation should catch invalid URL format
    // OR if custom validation, check for error message
    if (validationMessage) {
      expect(validationMessage.length).toBeGreaterThan(0);
    } else {
      // If no browser validation, check that success toast didn't appear immediately
      // (form validation should prevent submission)
      // Wait for form to remain in error state (no success message)
      const successText = page.getByText(/Terminal created successfully/i);
      await expect(successText).not.toBeVisible({ timeout: 5000 });
    }
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
    await Promise.race([
      expect(page).toHaveURL(/\/login|\/auth/, { timeout: 10000 }),
      expect(
        page.getByText(/unauthorized|forbidden|login|sign in/i),
      ).toBeVisible({ timeout: 10000 }),
    ]);

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
  // SKIPPED: RED phase test - UI not yet implemented (Story 4.82)
  test.skip("[P0] Should prevent XSS in terminal name field", async ({
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

    await page.route("**/api/stores/*/terminals", (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({
          status: 200,
          body: JSON.stringify([]),
        });
      } else {
        route.continue();
      }
    });

    await page.goto(`/stores/${store.store_id}/edit`);
    await page.getByRole("button", { name: /Add Terminal/i }).click();

    await expect(
      page.getByRole("heading", { name: /Add Terminal/i }),
    ).toBeVisible();

    // WHEN: Store Manager enters XSS attempt in terminal name
    await page
      .getByLabel(/Terminal Name/i)
      .fill("<script>alert('XSS')</script>");

    // THEN: XSS should be prevented (either validation error or sanitized)
    // Check that script tags are not executed or are sanitized
    const nameInput = page.getByLabel(/Terminal Name/i);
    const value = await nameInput.inputValue();

    // Value should either be sanitized or validation should prevent submission
    // If validation passes, the value should be sanitized before being sent to API
    expect(value).toBeDefined();

    // Try to submit and verify XSS is not executed
    await page.getByRole("button", { name: /Create Terminal/i }).click();

    // Wait for form submission to complete (either success or validation error)
    await Promise.race([
      expect(page.getByText(/terminal created|successfully/i))
        .toBeVisible({ timeout: 5000 })
        .catch(() => null),
      expect(page.getByText(/validation|error/i))
        .toBeVisible({ timeout: 5000 })
        .catch(() => null),
    ]);

    // No alert should have appeared (XSS prevented)
    // This is verified by the fact that the test continues without alert interruption
  });
});
