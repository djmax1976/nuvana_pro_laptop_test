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
 * This function implements the network-first authentication pattern with retry:
 * 1. Navigate to login page and wait for form
 * 2. Fill credentials and verify they're entered correctly
 * 3. Submit and wait for login API response
 * 4. Wait for redirect to /client-dashboard
 * 5. CRITICAL: Wait for authenticated content to render
 * 6. Wait for dashboard API to complete (populates stores/user data)
 * 7. Wait for network idle to ensure React context is ready
 *
 * @param page - Playwright Page instance
 * @param email - User email address
 * @param password - User password
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @throws Error with actionable message if login fails after all retries
 */
export async function loginAsClientOwner(
  page: Page,
  email: string,
  password: string,
  maxRetries: number = 3,
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Navigate to login page
      await page.goto("/login", { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("domcontentloaded");

      // Enterprise Pattern: Wait for React hydration
      // Form may render but not be interactive until hydration completes
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(300);

      // Wait for login form to be visible and interactive
      const emailInput = page.locator(
        'input[name="email"], input[type="email"]',
      );
      await emailInput.waitFor({
        state: "visible",
        timeout: TEST_TIMEOUTS.LOGIN_FORM_VISIBLE,
      });
      await expect(emailInput).toBeEditable({
        timeout: TEST_TIMEOUTS.LOGIN_FORM_EDITABLE,
      });

      // Enterprise Pattern: Click before fill for more reliable React form handling
      await emailInput.click();
      await emailInput.clear();
      await emailInput.fill(email);

      const passwordInput = page.locator(
        'input[name="password"], input[type="password"]',
      );
      await passwordInput.click();
      await passwordInput.clear();
      await passwordInput.fill(password);

      // Enterprise Pattern: Verify credentials were entered correctly
      // React forms may have reset issues during hydration
      await expect(emailInput).toHaveValue(email, {
        timeout: TEST_TIMEOUTS.ASSERTION_VALUE,
      });
      await expect(passwordInput).toHaveValue(password, {
        timeout: TEST_TIMEOUTS.ASSERTION_VALUE,
      });

      // Submit form and wait for redirect
      const submitButton = page.locator('button[type="submit"]');
      await submitButton.waitFor({
        state: "visible",
        timeout: TEST_TIMEOUTS.BUTTON_ENABLED,
      });

      // Enterprise Pattern: Set up login API listener before clicking
      // This ensures we capture the response even if it's fast
      const loginResponsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/auth/login") &&
          resp.request().method() === "POST",
        { timeout: TEST_TIMEOUTS.LOGIN_API_RESPONSE },
      );

      // Click submit
      await submitButton.click();

      // Wait for login API response
      const loginResponse = await loginResponsePromise;
      if (loginResponse.status() !== 200) {
        const body = await loginResponse.json().catch(() => ({}));
        throw new Error(
          `Login API failed with status ${loginResponse.status()}: ${body.message || body.error?.message || "Unknown error"}`,
        );
      }

      // Wait for redirect to client-dashboard
      await page.waitForURL(/.*client-dashboard.*/, {
        timeout: TEST_TIMEOUTS.URL_CHANGE,
      });

      // CRITICAL: Wait for authenticated content to render before returning
      // This ensures the React auth context is fully populated before navigating
      // to other pages. Without this, navigation to subpages may fail because
      // the auth context hasn't initialized yet.
      await page.locator(TEST_SELECTORS.CLIENT_DASHBOARD_PAGE).waitFor({
        state: "visible",
        timeout: TEST_TIMEOUTS.AUTH_CONTEXT_READY,
      });

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
        .waitForLoadState("networkidle", {
          timeout: TEST_TIMEOUTS.NETWORK_IDLE,
        })
        .catch(() => {
          // networkidle might timeout if there are long-polling requests
        });

      // Success - exit retry loop
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        // Log retry attempt (useful for debugging)
        console.log(
          `[AUTH] Login attempt ${attempt} failed for ${email}: ${lastError.message}. Retrying...`,
        );
        // Longer pause before retry to allow backend to stabilize
        await page.waitForTimeout(2000);
      }
    }
  }

  // All retries exhausted
  throw new Error(
    `Login failed for ${email} after ${maxRetries} attempts: ${lastError?.message}`,
  );
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

  // Enterprise Pattern: Wait for React hydration
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(200);

  const emailInput = page.locator('input[name="email"], input[type="email"]');
  await emailInput.waitFor({
    state: "visible",
    timeout: TEST_TIMEOUTS.LOGIN_FORM_VISIBLE,
  });
  await expect(emailInput).toBeEditable({
    timeout: TEST_TIMEOUTS.LOGIN_FORM_EDITABLE,
  });

  // Enterprise Pattern: Click before fill for more reliable React form handling
  await emailInput.click();
  await emailInput.clear();
  await emailInput.fill(email);

  const passwordInput = page.locator(
    'input[name="password"], input[type="password"]',
  );
  await passwordInput.click();
  await passwordInput.clear();
  await passwordInput.fill(password);

  // Enterprise Pattern: Verify credentials were entered correctly
  await expect(emailInput).toHaveValue(email, {
    timeout: TEST_TIMEOUTS.ASSERTION_VALUE,
  });
  await expect(passwordInput).toHaveValue(password, {
    timeout: TEST_TIMEOUTS.ASSERTION_VALUE,
  });

  const submitButton = page.locator('button[type="submit"]');
  await submitButton.waitFor({
    state: "visible",
    timeout: TEST_TIMEOUTS.BUTTON_ENABLED,
  });

  // Enterprise Pattern: Set up login API listener before clicking
  const loginResponsePromise = page.waitForResponse(
    (resp) =>
      resp.url().includes("/api/auth/login") &&
      resp.request().method() === "POST",
    { timeout: TEST_TIMEOUTS.LOGIN_API_RESPONSE },
  );

  await submitButton.click();

  // Wait for login API response
  const loginResponse = await loginResponsePromise;
  if (loginResponse.status() !== 200) {
    const body = await loginResponse.json().catch(() => ({}));
    throw new Error(
      `Login API failed with status ${loginResponse.status()}: ${body.message || body.error?.message || "Unknown error"}`,
    );
  }

  // Wait for redirect to mystore
  await page.waitForURL(/.*mystore.*/, { timeout: TEST_TIMEOUTS.URL_CHANGE });

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
 * @param baseUrl - Optional base URL for staging/production testing
 */
export async function loginAsSuperAdmin(
  page: Page,
  email: string,
  password: string,
  baseUrl?: string,
): Promise<void> {
  const loginUrl = baseUrl ? `${baseUrl}/login` : "/login";
  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });

  // CRITICAL: Wait for React hydration to complete before interacting
  // The form has server-rendered HTML, but JavaScript event handlers are attached
  // during hydration. Without this wait, the form submits as a traditional GET request.

  // First wait for network idle (catches most hydration)
  await page
    .waitForLoadState("networkidle", { timeout: TEST_TIMEOUTS.NETWORK_IDLE })
    .catch(() => {
      // networkidle might timeout if there are persistent connections, continue anyway
    });

  // Then add a small delay to ensure React has finished hydrating the form
  // This is necessary because networkidle fires when network is quiet, but
  // React may still be processing and attaching event handlers
  await page.waitForTimeout(500);

  // Use #email selector which matches the actual form input id
  const emailInput = page.locator("#email");
  await emailInput.waitFor({
    state: "visible",
    timeout: TEST_TIMEOUTS.LOGIN_FORM_VISIBLE,
  });
  await expect(emailInput).toBeEditable({
    timeout: TEST_TIMEOUTS.LOGIN_FORM_EDITABLE,
  });

  // Click first, then fill - more reliable with React hydration
  await emailInput.click();
  await emailInput.fill(email);

  const passwordInput = page.locator("#password");
  await expect(passwordInput).toBeVisible({
    timeout: TEST_TIMEOUTS.LOGIN_FORM_EDITABLE,
  });
  await passwordInput.click();
  await passwordInput.fill(password);

  // Verify fields are filled before submitting (guards against hydration reset)
  await expect(emailInput).toHaveValue(email, {
    timeout: TEST_TIMEOUTS.ASSERTION_VALUE,
  });
  await expect(passwordInput).toHaveValue(password, {
    timeout: TEST_TIMEOUTS.ASSERTION_VALUE,
  });

  const submitButton = page.locator('button[type="submit"]');
  await submitButton.waitFor({
    state: "visible",
    timeout: TEST_TIMEOUTS.BUTTON_ENABLED,
  });

  // Setup response listener before clicking
  const loginResponsePromise = page
    .waitForResponse((response) => response.url().includes("/api/auth/login"), {
      timeout: TEST_TIMEOUTS.LOGIN_API_RESPONSE,
    })
    .catch((e) => {
      console.error("[AUTH] No login API response received:", e.message);
      return null;
    });

  // Click and wait for URL change
  await Promise.all([
    page.waitForURL(/.*dashboard.*/, { timeout: TEST_TIMEOUTS.URL_CHANGE }),
    submitButton.click(),
  ]);

  // Log API response for debugging
  const loginResponse = await loginResponsePromise;
  if (loginResponse) {
    console.log(`[AUTH] Login API response: ${loginResponse.status()}`);
  }

  // Wait for admin dashboard to be visible
  // The admin dashboard uses data-testid="dashboard-content" within "dashboard-layout"
  await page
    .locator('[data-testid="dashboard-content"]')
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
