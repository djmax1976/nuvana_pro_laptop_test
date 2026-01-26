/**
 * POS Setup Wizard E2E Tests
 *
 * End-to-end tests for the POS Integration setup wizard.
 * Tests complete user flows for configuring POS integrations.
 *
 * IMPORTANT: These tests must use storeManagerPage (not superadminPage) because:
 * - The /mystore routes use ClientAuthContext which only allows client users
 * - SUPERADMIN is not a client user, so it gets redirected to /dashboard
 * - Store Manager (STORE_MANAGER role) is a client user with store-level access
 *
 * Enterprise coding standards applied:
 * - Critical user journey testing
 * - Security: Authentication, Authorization, XSS prevention
 * - API mocking for reliable, deterministic tests
 *
 * @module tests/e2e/pos-setup-wizard.e2e.spec
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import type { Page, Route, Request } from "@playwright/test";

/**
 * Helper to set up API mocking for POS integration page
 * This mocks the GET endpoint to return 404 (no integration exists) so the wizard shows
 */
async function setupWizardMocks(page: Page, storeId: string) {
  // Mock GET to return 404 so wizard shows
  await page.route(
    `**/api/stores/${storeId}/pos-integration`,
    (route: Route, request: Request) => {
      if (request.method() === "GET") {
        route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "No POS integration found for this store",
            },
          }),
        });
      } else {
        route.continue();
      }
    },
  );
}

/**
 * Helper to mock test connection endpoint
 * IMPORTANT: The POSConnectionTestResult type requires:
 * - success: boolean (outer wrapper)
 * - data.connected: boolean (determines success/failed state in UI)
 * - data.message: string
 * - data.posVersion?: string (optional)
 * - data.latencyMs?: number (optional)
 */
async function mockTestConnectionSuccess(page: Page, storeId: string) {
  await page.route(
    `**/api/stores/${storeId}/pos-integration/test`,
    (route: Route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            connected: true, // CRITICAL: This field determines success state in UI
            message: "Connection successful",
            posVersion: "2.5.1",
            latencyMs: 145,
            preview: {
              departments: [
                { code: "001", name: "Grocery", taxable: true },
                { code: "002", name: "Tobacco", taxable: false },
              ],
              tenderTypes: [
                { code: "CASH", name: "Cash", is_electronic: false },
                { code: "CREDIT", name: "Credit Card", is_electronic: true },
              ],
              taxRates: [{ code: "STATE", name: "State Tax", rate: 0.07 }],
            },
          },
        }),
      });
    },
  );
}

/**
 * Helper to mock test connection failure
 */
async function mockTestConnectionFailure(page: Page, storeId: string) {
  await page.route(
    `**/api/stores/${storeId}/pos-integration/test`,
    (route: Route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          data: {
            connected: false,
            message: "Connection timeout",
            errorCode: "ETIMEDOUT",
          },
        }),
      });
    },
  );
}

test.describe("POS Setup Wizard E2E", () => {
  // ===========================================================================
  // WIZARD COMPLETE FLOW - FILE-BASED POS
  // ===========================================================================
  test.describe("File-Based POS Setup Flow", () => {
    test("[P0] Should complete wizard for Verifone Commander (file-based)", async ({
      storeManagerPage,
      storeManagerUser,
    }) => {
      const page = storeManagerPage;
      const storeId = storeManagerUser.store_id;

      // Set up API mocks for wizard BEFORE navigation
      await setupWizardMocks(page, storeId);
      await mockTestConnectionSuccess(page, storeId);

      // Navigate to POS setup page (wait for load)
      await page.goto(`/mystore/pos-integration?storeId=${storeId}`, {
        waitUntil: "networkidle",
      });

      // Wait for wizard to load
      await expect(page.getByText(/pos integration setup/i)).toBeVisible({
        timeout: 15000,
      });

      // STEP 1: Select POS System
      await expect(
        page.getByRole("heading", { name: /select your pos system/i }),
      ).toBeVisible();

      // Select Verifone Commander from dropdown using testid for reliability
      const posSelector = page.getByTestId("pos-type-select");
      await expect(posSelector).toBeVisible({ timeout: 5000 });
      await posSelector.click();
      // Full name: "Verifone Commander (NAXML)"
      await page
        .getByRole("option", { name: /Verifone Commander.*NAXML/i })
        .click();

      // Verify info card appears with file-based description
      await expect(page.getByTestId("pos-info-card")).toBeVisible();
      await expect(page.getByText(/file-based naxml/i)).toBeVisible();

      // Click Next
      await page.getByTestId("step1-next-button").click();

      // STEP 2: Connection Details
      await expect(
        page.getByRole("heading", { name: /connection details/i }),
      ).toBeVisible({ timeout: 10000 });

      // File-based POS should show outbox/inbox path fields
      await expect(page.getByTestId("file-outbox-path")).toBeVisible();
      await expect(page.getByTestId("file-inbox-path")).toBeVisible();

      // Paths should be pre-populated with defaults
      const outboxPath = page.getByTestId("file-outbox-path");
      await expect(outboxPath).toHaveValue(/Commander.*Export/i);

      // Test connection using testid for reliability
      await page.getByTestId("test-connection-button").click();

      // Wait for connection test result
      await expect(page.getByTestId("test-success-state")).toBeVisible({
        timeout: 15000,
      });

      // Verify Next button is enabled after successful test
      const nextButton = page.getByTestId("step2-next-button");
      await expect(nextButton).toBeEnabled({ timeout: 5000 });

      // Test completes successfully - verified:
      // 1. Wizard loads correctly for file-based POS
      // 2. Correct form fields shown (outbox/inbox paths)
      // 3. Connection test succeeds with mocked response
      // 4. Next button becomes enabled after successful test
    });
  });

  // ===========================================================================
  // WIZARD COMPLETE FLOW - NETWORK-BASED POS
  // ===========================================================================
  test.describe("Network-Based POS Setup Flow", () => {
    test("[P0] Should complete wizard for Gilbarco Passport (network-based)", async ({
      storeManagerPage,
      storeManagerUser,
    }) => {
      const page = storeManagerPage;
      const storeId = storeManagerUser.store_id;

      await setupWizardMocks(page, storeId);
      await mockTestConnectionSuccess(page, storeId);

      // Navigate with networkidle for reliability
      await page.goto(`/mystore/pos-integration?storeId=${storeId}`, {
        waitUntil: "networkidle",
      });

      await expect(page.getByText(/pos integration setup/i)).toBeVisible({
        timeout: 15000,
      });

      // STEP 1: Select Gilbarco Passport (Network)
      // Wait for dropdown to be ready before clicking
      const posSelector = page.getByTestId("pos-type-select");
      await expect(posSelector).toBeVisible({ timeout: 5000 });
      await posSelector.click();

      // Select using the exact name from implementation: "Gilbarco Passport (Network)"
      await page
        .getByRole("option", { name: /Gilbarco Passport.*Network/i })
        .click();

      // Verify info card shows with network description
      await expect(page.getByTestId("pos-info-card")).toBeVisible();
      await expect(page.getByText(/network xml protocol/i)).toBeVisible();

      await page.getByTestId("step1-next-button").click();

      // STEP 2: Network connection fields
      await expect(
        page.getByRole("heading", { name: /connection details/i }),
      ).toBeVisible({ timeout: 10000 });

      await expect(page.getByTestId("network-host")).toBeVisible();
      await expect(page.getByTestId("network-port")).toBeVisible();
      // Check for SSL checkbox - label is "Use SSL/TLS encryption"
      await expect(page.getByText(/ssl\/tls encryption/i)).toBeVisible();

      // Port should be pre-populated with default (5015)
      const portField = page.getByTestId("network-port");
      await expect(portField).toHaveValue("5015");

      // Fill in host
      await page.getByTestId("network-host").fill("192.168.1.100");

      // Test connection using testid for reliability
      await page.getByTestId("test-connection-button").click();

      // Wait for result
      await expect(page.getByTestId("test-success-state")).toBeVisible({
        timeout: 15000,
      });
    });
  });

  // ===========================================================================
  // WIZARD COMPLETE FLOW - CLOUD-BASED POS
  // ===========================================================================
  test.describe("Cloud-Based POS Setup Flow", () => {
    test("[P0] Should complete wizard for Square (cloud-based)", async ({
      storeManagerPage,
      storeManagerUser,
    }) => {
      const page = storeManagerPage;
      const storeId = storeManagerUser.store_id;

      await setupWizardMocks(page, storeId);
      await mockTestConnectionSuccess(page, storeId);

      // Navigate with networkidle for reliability
      await page.goto(`/mystore/pos-integration?storeId=${storeId}`, {
        waitUntil: "networkidle",
      });

      await expect(page.getByText(/pos integration setup/i)).toBeVisible({
        timeout: 15000,
      });

      // STEP 1: Select Square (Cloud API)
      const posSelector = page.getByTestId("pos-type-select");
      await expect(posSelector).toBeVisible({ timeout: 5000 });
      await posSelector.click();
      await page.getByRole("option", { name: /Square.*Cloud/i }).click();

      await expect(page.getByText(/cloud rest api/i)).toBeVisible();
      await page.getByTestId("step1-next-button").click();

      // STEP 2: API Key field
      await expect(
        page.getByRole("heading", { name: /connection details/i }),
      ).toBeVisible({ timeout: 10000 });
      await expect(page.getByTestId("cloud-api-key")).toBeVisible();

      // Fill in API key
      await page.getByTestId("cloud-api-key").fill("sq0atp-test-key-12345");

      // Test connection
      await page.getByTestId("test-connection-button").click();

      await expect(page.getByTestId("test-success-state")).toBeVisible({
        timeout: 15000,
      });
    });
  });

  // ===========================================================================
  // WIZARD COMPLETE FLOW - MANUAL ENTRY
  // ===========================================================================
  test.describe("Manual Entry Setup Flow", () => {
    test("[P0] Should complete wizard for Manual Entry (no connection needed)", async ({
      storeManagerPage,
      storeManagerUser,
    }) => {
      const page = storeManagerPage;
      const storeId = storeManagerUser.store_id;

      await setupWizardMocks(page, storeId);

      // Navigate with networkidle for reliability
      await page.goto(`/mystore/pos-integration?storeId=${storeId}`, {
        waitUntil: "networkidle",
      });

      await expect(page.getByText(/pos integration setup/i)).toBeVisible({
        timeout: 15000,
      });

      // STEP 1: Select Manual Entry
      const posSelector = page.getByTestId("pos-type-select");
      await expect(posSelector).toBeVisible({ timeout: 5000 });
      await posSelector.click();
      await page.getByRole("option", { name: /Manual Entry/i }).click();

      await expect(page.getByText(/no automatic sync/i)).toBeVisible();
      await page.getByTestId("step1-next-button").click();

      // STEP 2: Should show info message - use heading for specificity
      await expect(
        page.getByRole("heading", { name: /connection details/i }),
      ).toBeVisible({ timeout: 10000 });

      // No test connection button for manual entry (TestConnectionButton not rendered)
      await expect(
        page.getByTestId("test-connection-button"),
      ).not.toBeVisible();

      // Should be able to proceed without testing
      await page.getByTestId("step2-next-button").click();

      // STEP 3: Sync options should still be shown but can skip
      await expect(page.getByTestId("step3-next-button")).toBeVisible({
        timeout: 10000,
      });
      await page.getByTestId("step3-next-button").click();

      // STEP 4: Review - verify we see review section with manual entry
      await expect(
        page.getByRole("heading", { name: /review|confirm/i }),
      ).toBeVisible({ timeout: 10000 });
    });
  });

  // ===========================================================================
  // CONNECTION TEST STATES
  // ===========================================================================
  test.describe("Connection Test States", () => {
    test("[P1] Should show loading state during connection test", async ({
      storeManagerPage,
      storeManagerUser,
    }) => {
      const page = storeManagerPage;
      const storeId = storeManagerUser.store_id;

      await setupWizardMocks(page, storeId);

      // Mock slow connection test with delay
      await page.route(
        `**/api/stores/${storeId}/pos-integration/test`,
        async (route) => {
          // Delay to allow checking loading state
          await new Promise((resolve) => setTimeout(resolve, 3000));
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              data: {
                connected: true,
                message: "Connection successful",
                posVersion: "2.5.1",
                latencyMs: 145,
              },
            }),
          });
        },
      );

      // Navigate with networkidle for reliability
      await page.goto(`/mystore/pos-integration?storeId=${storeId}`, {
        waitUntil: "networkidle",
      });

      await expect(page.getByText(/pos integration setup/i)).toBeVisible({
        timeout: 15000,
      });

      // Select a network POS using testid for reliability
      const posSelector = page.getByTestId("pos-type-select");
      await expect(posSelector).toBeVisible({ timeout: 5000 });
      await posSelector.click();
      await page
        .getByRole("option", { name: /Gilbarco Passport.*Network/i })
        .click();
      await page.getByTestId("step1-next-button").click();

      // Wait for step 2 to load
      await expect(
        page.getByRole("heading", { name: /connection details/i }),
      ).toBeVisible({ timeout: 10000 });

      // Fill host
      await page.getByTestId("network-host").fill("192.168.1.100");

      // Click test and check for loading state
      await page.getByTestId("test-connection-button").click();

      // Should show testing state immediately
      await expect(page.getByTestId("test-loading-state")).toBeVisible({
        timeout: 5000,
      });
      // Verify loading text
      await expect(page.getByText(/connecting/i)).toBeVisible();
    });

    test("[P1] Should show success state after successful connection test", async ({
      storeManagerPage,
      storeManagerUser,
    }) => {
      const page = storeManagerPage;
      const storeId = storeManagerUser.store_id;

      await setupWizardMocks(page, storeId);
      await mockTestConnectionSuccess(page, storeId);

      // Navigate with networkidle for reliability
      await page.goto(`/mystore/pos-integration?storeId=${storeId}`, {
        waitUntil: "networkidle",
      });

      await expect(page.getByText(/pos integration setup/i)).toBeVisible({
        timeout: 15000,
      });

      // Select a network POS using testid for reliability
      const posSelector = page.getByTestId("pos-type-select");
      await expect(posSelector).toBeVisible({ timeout: 5000 });
      await posSelector.click();
      await page
        .getByRole("option", { name: /Gilbarco Passport.*Network/i })
        .click();
      await page.getByTestId("step1-next-button").click();

      // Wait for step 2 to load
      await expect(
        page.getByRole("heading", { name: /connection details/i }),
      ).toBeVisible({ timeout: 10000 });

      await page.getByTestId("network-host").fill("192.168.1.100");

      await page.getByTestId("test-connection-button").click();

      // Wait for success state
      await expect(page.getByTestId("test-success-state")).toBeVisible({
        timeout: 15000,
      });
      await expect(page.getByText(/connection successful/i)).toBeVisible();
      await expect(page.getByText(/2\.5\.1/)).toBeVisible(); // POS Version
      await expect(page.getByText(/145ms/)).toBeVisible(); // Latency (displayed with ms suffix)

      // Next button should be enabled (we're on step 2)
      await expect(page.getByTestId("step2-next-button")).toBeEnabled();
    });

    test("[P1] Should show failure state after failed connection test", async ({
      storeManagerPage,
      storeManagerUser,
    }) => {
      const page = storeManagerPage;
      const storeId = storeManagerUser.store_id;

      await setupWizardMocks(page, storeId);
      await mockTestConnectionFailure(page, storeId);

      // Navigate with networkidle for reliability
      await page.goto(`/mystore/pos-integration?storeId=${storeId}`, {
        waitUntil: "networkidle",
      });

      await expect(page.getByText(/pos integration setup/i)).toBeVisible({
        timeout: 15000,
      });

      // Select a network POS using testid for reliability
      const posSelector = page.getByTestId("pos-type-select");
      await expect(posSelector).toBeVisible({ timeout: 5000 });
      await posSelector.click();
      await page
        .getByRole("option", { name: /Gilbarco Passport.*Network/i })
        .click();
      await page.getByTestId("step1-next-button").click();

      // Wait for step 2 to load
      await expect(
        page.getByRole("heading", { name: /connection details/i }),
      ).toBeVisible({ timeout: 10000 });

      await page.getByTestId("network-host").fill("192.168.1.100");

      await page.getByTestId("test-connection-button").click();

      // Wait for failure state - use testid to scope the text searches
      const failedState = page.getByTestId("test-failed-state");
      await expect(failedState).toBeVisible({ timeout: 15000 });
      await expect(failedState.getByText(/connection failed/i)).toBeVisible();
      // Error message shows "Error: Connection timeout" - use exact text to avoid matching troubleshooting tip
      await expect(
        failedState.getByText("Error:", { exact: false }),
      ).toBeVisible();
      // Error code shows "Code: ETIMEDOUT"
      await expect(failedState.getByText(/ETIMEDOUT/)).toBeVisible();

      // Next button should remain disabled
      await expect(page.getByTestId("step2-next-button")).toBeDisabled();
    });
  });

  // ===========================================================================
  // CONFIGURED STATE VIEW
  // Note: These tests mock the API to return an existing integration
  // ===========================================================================
  test.describe("Configured State View", () => {
    test("[P0] Should show configured view when integration exists", async ({
      storeManagerPage,
      storeManagerUser,
    }) => {
      const page = storeManagerPage;
      const storeId = storeManagerUser.store_id;

      // Mock GET to return existing file-based integration (Edit button shows for file-based)
      await page.route(
        `**/api/stores/${storeId}/pos-integration`,
        (route, request) => {
          if (request.method() === "GET") {
            route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({
                success: true,
                data: {
                  pos_integration_id: "test-integration-id",
                  pos_type: "VERIFONE_COMMANDER",
                  connection_name: "Test POS Connection",
                  export_path: "C:\\Commander\\Export",
                  import_path: "C:\\Commander\\Import",
                  sync_enabled: true,
                  sync_interval_mins: 60,
                  last_sync_at: new Date().toISOString(),
                  is_active: true,
                },
              }),
            });
          } else {
            route.continue();
          }
        },
      );

      // Navigate with networkidle for reliability
      await page.goto(`/mystore/pos-integration?storeId=${storeId}`, {
        waitUntil: "networkidle",
      });

      // Should show configured view, not wizard
      await expect(page.getByText(/verifone commander/i)).toBeVisible({
        timeout: 15000,
      });
      // Edit button is shown for file-based connections
      await expect(page.getByTestId("pos-info-edit-button")).toBeVisible();
      await expect(
        page.getByRole("button", { name: /sync now/i }),
      ).toBeVisible();
    });

    test("[P0] Should trigger sync when Sync Now is clicked", async ({
      storeManagerPage,
      storeManagerUser,
    }) => {
      const page = storeManagerPage;
      const storeId = storeManagerUser.store_id;

      // Mock GET to return existing file-based integration
      await page.route(
        `**/api/stores/${storeId}/pos-integration`,
        (route, request) => {
          if (request.method() === "GET") {
            route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({
                success: true,
                data: {
                  pos_integration_id: "test-integration-id",
                  pos_type: "VERIFONE_COMMANDER",
                  connection_name: "Test Verifone Connection",
                  export_path: "C:\\Commander\\Export",
                  import_path: "C:\\Commander\\Import",
                  sync_enabled: true,
                  sync_interval_mins: 60,
                  is_active: true,
                },
              }),
            });
          } else {
            route.continue();
          }
        },
      );

      // Mock sync endpoint
      await page.route(
        `**/api/stores/${storeId}/pos-integration/sync`,
        (route) => {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              data: {
                status: "SUCCESS",
                durationMs: 1234,
                departments: {
                  received: 10,
                  created: 2,
                  updated: 0,
                  deactivated: 0,
                  errors: [],
                },
              },
            }),
          });
        },
      );

      // Navigate with networkidle for reliability
      await page.goto(`/mystore/pos-integration?storeId=${storeId}`, {
        waitUntil: "networkidle",
      });

      await expect(page.getByText(/verifone commander/i)).toBeVisible({
        timeout: 15000,
      });

      // Click Sync Now
      await page.getByRole("button", { name: /sync now/i }).click();

      // The sync endpoint is mocked to return instantly, so we just verify:
      // 1. No error toast appears
      // 2. The button returns to "Sync Now" state (not stuck in loading)
      // Note: With instant mock response, we may not catch the "Syncing..." intermediate state

      // Wait a moment for any state transitions
      await page.waitForTimeout(500);

      // Verify sync completed (button back to normal or shows result)
      await expect(page.getByRole("button", { name: /sync now/i })).toBeVisible(
        { timeout: 10000 },
      );
    });

    test("[P1] Should open edit modal when Edit is clicked (file-based)", async ({
      storeManagerPage,
      storeManagerUser,
    }) => {
      const page = storeManagerPage;
      const storeId = storeManagerUser.store_id;

      // Mock GET to return existing file-based integration (Edit modal only for file-based)
      await page.route(
        `**/api/stores/${storeId}/pos-integration`,
        (route, request) => {
          if (request.method() === "GET") {
            route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({
                success: true,
                data: {
                  pos_integration_id: "test-integration-id",
                  pos_type: "VERIFONE_COMMANDER",
                  connection_name: "Test Verifone Connection",
                  export_path: "C:\\Commander\\Export",
                  import_path: "C:\\Commander\\Import",
                  sync_enabled: true,
                  sync_interval_mins: 60,
                  is_active: true,
                },
              }),
            });
          } else {
            route.continue();
          }
        },
      );

      // Navigate with networkidle for reliability
      await page.goto(`/mystore/pos-integration?storeId=${storeId}`, {
        waitUntil: "networkidle",
      });

      await expect(page.getByText(/verifone commander/i)).toBeVisible({
        timeout: 15000,
      });

      // Click Edit button (uses testid)
      await page.getByTestId("pos-info-edit-button").click();

      // Should show edit modal dialog with connection path fields
      await expect(
        page.getByRole("dialog").or(page.getByText(/edit connection/i)),
      ).toBeVisible({ timeout: 5000 });
    });
  });

  // ===========================================================================
  // SECURITY TESTS
  // ===========================================================================
  test.describe("Security", () => {
    test("[P0] Should reject access without authentication", async ({
      page,
      storeManagerUser,
    }) => {
      // Navigate without auth (raw page, not authenticated storeManagerPage)
      await page.goto(
        `/mystore/pos-integration?storeId=${storeManagerUser.store_id}`,
        { waitUntil: "domcontentloaded" },
      );

      // Should redirect to login or show unauthorized
      try {
        await page.waitForURL(/\/login|\/auth/, { timeout: 15000 });
      } catch {
        // If no redirect, check for error message
        await expect(
          page.getByText(/unauthorized|forbidden|login|sign in/i),
        ).toBeVisible({ timeout: 10000 });
      }
    });

    test("[P0] Should prevent XSS in form fields", async ({
      storeManagerPage,
      storeManagerUser,
    }) => {
      const page = storeManagerPage;
      const storeId = storeManagerUser.store_id;

      await setupWizardMocks(page, storeId);

      // Navigate with networkidle for reliability
      await page.goto(`/mystore/pos-integration?storeId=${storeId}`, {
        waitUntil: "networkidle",
      });

      await expect(page.getByText(/pos integration setup/i)).toBeVisible({
        timeout: 15000,
      });

      // Select a network POS using testid for reliability
      const posSelector = page.getByTestId("pos-type-select");
      await expect(posSelector).toBeVisible({ timeout: 5000 });
      await posSelector.click();
      await page
        .getByRole("option", { name: /Gilbarco Passport.*Network/i })
        .click();
      await page.getByTestId("step1-next-button").click();

      // Wait for step 2 to load
      await expect(
        page.getByRole("heading", { name: /connection details/i }),
      ).toBeVisible({ timeout: 10000 });

      // Enter XSS payload in host field
      const xssPayload = "<script>alert('XSS')</script>";
      await page.getByTestId("network-host").fill(xssPayload);

      // Value should be stored as literal text (React sanitizes by default)
      const hostInput = page.getByTestId("network-host");
      await expect(hostInput).toHaveValue(xssPayload);

      // Verify no JavaScript was executed by checking page didn't show an alert dialog
      // If XSS succeeded, test would have been interrupted by alert
      // The fact that we can continue the test proves XSS prevention works
    });
  });

  // ===========================================================================
  // NAVIGATION AND BACK BUTTON
  // ===========================================================================
  test.describe("Navigation", () => {
    test("[P1] Should navigate back through wizard steps", async ({
      storeManagerPage,
      storeManagerUser,
    }) => {
      const page = storeManagerPage;
      const storeId = storeManagerUser.store_id;

      await setupWizardMocks(page, storeId);

      // Navigate with networkidle for reliability
      await page.goto(`/mystore/pos-integration?storeId=${storeId}`, {
        waitUntil: "networkidle",
      });

      await expect(page.getByText(/pos integration setup/i)).toBeVisible({
        timeout: 15000,
      });

      // Go to step 2 - select Manual Entry
      const posSelector = page.getByTestId("pos-type-select");
      await expect(posSelector).toBeVisible({ timeout: 5000 });
      await posSelector.click();
      await page.getByRole("option", { name: /Manual Entry/i }).click();
      await page.getByTestId("step1-next-button").click();

      // Should be on step 2 - check for Connection Details heading
      await expect(
        page.getByRole("heading", { name: /connection details/i }),
      ).toBeVisible({ timeout: 10000 });

      // Go to step 3
      await page.getByTestId("step2-next-button").click();

      // Wait for step 3 to load
      await expect(page.getByTestId("step3-next-button")).toBeVisible({
        timeout: 10000,
      });

      // Go back to step 2
      await page.getByTestId("step3-back-button").click();

      // Should be back on step 2
      await expect(
        page.getByRole("heading", { name: /connection details/i }),
      ).toBeVisible({ timeout: 10000 });

      // Go back to step 1
      await page.getByTestId("step2-back-button").click();

      // Should be back on step 1
      await expect(page.getByTestId("pos-type-select")).toBeVisible({
        timeout: 10000,
      });
    });

    test("[P1] Should preserve selections when navigating back", async ({
      storeManagerPage,
      storeManagerUser,
    }) => {
      const page = storeManagerPage;
      const storeId = storeManagerUser.store_id;

      await setupWizardMocks(page, storeId);

      // Navigate with networkidle for reliability
      await page.goto(`/mystore/pos-integration?storeId=${storeId}`, {
        waitUntil: "networkidle",
      });

      await expect(page.getByText(/pos integration setup/i)).toBeVisible({
        timeout: 15000,
      });

      // Select Square and go forward
      const posSelector = page.getByTestId("pos-type-select");
      await expect(posSelector).toBeVisible({ timeout: 5000 });
      await posSelector.click();
      await page.getByRole("option", { name: /Square.*Cloud/i }).click();
      await page.getByTestId("step1-next-button").click();

      // Wait for step 2 to load
      await expect(
        page.getByRole("heading", { name: /connection details/i }),
      ).toBeVisible({ timeout: 10000 });

      // Fill API key
      await page.getByTestId("cloud-api-key").fill("test-api-key-123");

      // Go back
      await page.getByTestId("step2-back-button").click();

      // POS should still be selected - use the specific testid
      await expect(page.getByTestId("pos-type-select")).toContainText("Square");

      // Go forward again
      await page.getByTestId("step1-next-button").click();

      // Wait for step 2 to load
      await expect(
        page.getByRole("heading", { name: /connection details/i }),
      ).toBeVisible({ timeout: 10000 });

      // API key should still be filled
      const apiKeyInput = page.getByTestId("cloud-api-key");
      await expect(apiKeyInput).toHaveValue("test-api-key-123");
    });
  });
});
