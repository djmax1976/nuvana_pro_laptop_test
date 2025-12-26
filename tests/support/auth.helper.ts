/**
 * Shared Authentication Helpers for E2E Tests
 *
 * Enterprise-grade authentication utilities providing:
 * - Single source of truth for login logic
 * - Network-first waiting pattern for auth context
 * - Environment-aware timeouts via centralized config
 * - Proper error handling with actionable messages
 *
 * Usage:
 *   import { loginAsClientOwner, loginAsClientUser } from '../support/auth.helper';
 *   await loginAsClientOwner(page, email, password);
 */

import { expect, type Page } from "@playwright/test";
import {
  TEST_TIMEOUTS,
  TEST_SELECTORS,
  TEST_API_ENDPOINTS,
} from "./test-config";

/**
 * Login as a CLIENT_OWNER and wait for auth context to be fully populated.
 *
 * This function implements the network-first authentication pattern:
 * 1. Navigate to login page and wait for form
 * 2. Fill credentials and submit
 * 3. Wait for redirect to /client-dashboard
 * 4. CRITICAL: Wait for authenticated content to render
 * 5. Wait for dashboard API to complete (populates stores/user data)
 * 6. Wait for network idle to ensure React context is ready
 *
 * @param page - Playwright Page instance
 * @param email - User email address
 * @param password - User password
 * @throws Error with actionable message if login fails
 */
export async function loginAsClientOwner(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  // Navigate to login page
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("domcontentloaded");

  // Wait for login form to be visible and interactive
  const emailInput = page.locator('input[name="email"], input[type="email"]');
  await emailInput.waitFor({
    state: "visible",
    timeout: TEST_TIMEOUTS.LOGIN_FORM_VISIBLE,
  });
  await expect(emailInput).toBeEditable({
    timeout: TEST_TIMEOUTS.LOGIN_FORM_EDITABLE,
  });

  // Fill credentials
  await emailInput.fill(email);
  await page.fill('input[name="password"], input[type="password"]', password);

  // Submit form and wait for redirect
  const submitButton = page.locator('button[type="submit"]');
  await submitButton.waitFor({
    state: "visible",
    timeout: TEST_TIMEOUTS.BUTTON_ENABLED,
  });

  await Promise.all([
    page.waitForURL(/.*client-dashboard.*/, {
      timeout: TEST_TIMEOUTS.URL_CHANGE,
    }),
    submitButton.click(),
  ]);

  // CRITICAL: Wait for authenticated content to render before returning
  // This ensures the React auth context is fully populated before navigating
  // to other pages. Without this, navigation to subpages may fail because
  // the auth context hasn't initialized yet.
  await page
    .locator(TEST_SELECTORS.CLIENT_DASHBOARD_PAGE)
    .waitFor({ state: "visible", timeout: TEST_TIMEOUTS.AUTH_CONTEXT_READY });

  // Wait for dashboard API call to complete (provides stores/user data)
  await page
    .waitForResponse(
      (resp) =>
        resp.url().includes(TEST_API_ENDPOINTS.CLIENT_DASHBOARD) &&
        resp.status() === 200,
      { timeout: TEST_TIMEOUTS.DASHBOARD_API_RESPONSE },
    )
    .catch(() => {
      // API might already have completed before we started listening
    });

  // Wait for network idle to ensure all React context updates are complete
  await page
    .waitForLoadState("networkidle", { timeout: TEST_TIMEOUTS.NETWORK_IDLE })
    .catch(() => {
      // networkidle might timeout if there are long-polling requests
    });
}

/**
 * Login as a CLIENT_USER (store employee) and wait for auth context.
 *
 * CLIENT_USER users are redirected to /mystore after login.
 *
 * @param page - Playwright Page instance
 * @param email - User email address
 * @param password - User password
 */
export async function loginAsClientUser(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("domcontentloaded");

  const emailInput = page.locator('input[name="email"], input[type="email"]');
  await emailInput.waitFor({
    state: "visible",
    timeout: TEST_TIMEOUTS.LOGIN_FORM_VISIBLE,
  });
  await expect(emailInput).toBeEditable({
    timeout: TEST_TIMEOUTS.LOGIN_FORM_EDITABLE,
  });

  await emailInput.fill(email);
  await page.fill('input[name="password"], input[type="password"]', password);

  const submitButton = page.locator('button[type="submit"]');
  await submitButton.waitFor({
    state: "visible",
    timeout: TEST_TIMEOUTS.BUTTON_ENABLED,
  });

  await Promise.all([
    page.waitForURL(/.*mystore.*/, { timeout: TEST_TIMEOUTS.URL_CHANGE }),
    submitButton.click(),
  ]);

  // Wait for mystore page to be visible
  await page
    .locator('[data-testid="mystore-dashboard-page"]')
    .waitFor({ state: "visible", timeout: TEST_TIMEOUTS.AUTH_CONTEXT_READY });

  await page
    .waitForLoadState("networkidle", { timeout: TEST_TIMEOUTS.NETWORK_IDLE })
    .catch(() => {});
}

/**
 * Login as a SUPERADMIN and wait for auth context.
 *
 * SUPERADMIN users are redirected to /dashboard after login.
 *
 * @param page - Playwright Page instance
 * @param email - User email address
 * @param password - User password
 */
export async function loginAsSuperAdmin(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("domcontentloaded");

  const emailInput = page.locator('input[name="email"], input[type="email"]');
  await emailInput.waitFor({
    state: "visible",
    timeout: TEST_TIMEOUTS.LOGIN_FORM_VISIBLE,
  });
  await expect(emailInput).toBeEditable({
    timeout: TEST_TIMEOUTS.LOGIN_FORM_EDITABLE,
  });

  await emailInput.fill(email);
  await page.fill('input[name="password"], input[type="password"]', password);

  const submitButton = page.locator('button[type="submit"]');
  await submitButton.waitFor({
    state: "visible",
    timeout: TEST_TIMEOUTS.BUTTON_ENABLED,
  });

  await Promise.all([
    page.waitForURL(/.*dashboard.*/, { timeout: TEST_TIMEOUTS.URL_CHANGE }),
    submitButton.click(),
  ]);

  // Wait for admin dashboard to be visible
  await page
    .locator(
      '[data-testid="admin-dashboard-page"], [data-testid="dashboard-page"]',
    )
    .waitFor({ state: "visible", timeout: TEST_TIMEOUTS.AUTH_CONTEXT_READY });

  await page
    .waitForLoadState("networkidle", { timeout: TEST_TIMEOUTS.NETWORK_IDLE })
    .catch(() => {});
}

/**
 * Perform login with custom redirect URL pattern.
 *
 * Use this when testing users with non-standard redirect behavior.
 *
 * @param page - Playwright Page instance
 * @param email - User email address
 * @param password - User password
 * @param expectedUrlPattern - Regex pattern for expected redirect URL
 * @param pageSelector - data-testid selector for the landing page
 */
export async function loginWithRedirect(
  page: Page,
  email: string,
  password: string,
  expectedUrlPattern: RegExp,
  pageSelector: string,
): Promise<void> {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("domcontentloaded");

  const emailInput = page.locator('input[name="email"], input[type="email"]');
  await emailInput.waitFor({
    state: "visible",
    timeout: TEST_TIMEOUTS.LOGIN_FORM_VISIBLE,
  });
  await expect(emailInput).toBeEditable({
    timeout: TEST_TIMEOUTS.LOGIN_FORM_EDITABLE,
  });

  await emailInput.fill(email);
  await page.fill('input[name="password"], input[type="password"]', password);

  const submitButton = page.locator('button[type="submit"]');
  await submitButton.waitFor({
    state: "visible",
    timeout: TEST_TIMEOUTS.BUTTON_ENABLED,
  });

  await Promise.all([
    page.waitForURL(expectedUrlPattern, { timeout: TEST_TIMEOUTS.URL_CHANGE }),
    submitButton.click(),
  ]);

  await page
    .locator(pageSelector)
    .waitFor({ state: "visible", timeout: TEST_TIMEOUTS.AUTH_CONTEXT_READY });

  await page
    .waitForLoadState("networkidle", { timeout: TEST_TIMEOUTS.NETWORK_IDLE })
    .catch(() => {});
}

/**
 * Helper to add stagger delay for parallel test isolation.
 *
 * Use this at the beginning of test fixture creation to prevent
 * thundering herd when multiple workers create data simultaneously.
 *
 * @param maxDelayMs - Maximum delay in milliseconds (default from config)
 */
export async function addStaggerDelay(maxDelayMs?: number): Promise<void> {
  const { TEST_CONSTANTS } = await import("./test-config");
  const delay = Math.floor(
    Math.random() * (maxDelayMs ?? TEST_CONSTANTS.STAGGER_DELAY_MAX),
  );
  await new Promise((resolve) => setTimeout(resolve, delay));
}
