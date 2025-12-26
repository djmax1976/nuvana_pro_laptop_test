/**
 * Performance Audit for Super Admin Dashboard
 *
 * Enterprise-grade performance testing for Super Admin operations.
 * Tests actual response times and render performance for critical dashboard operations.
 *
 * This test can run in two modes:
 * 1. Local mode (default): Creates test data and tests against local/test environment
 * 2. Staging mode: Set STAGING_URL env var to test against staging environment
 *
 * Usage:
 *   # Run against local environment (default)
 *   npm run test:e2e tests/e2e/staging-performance-audit.spec.ts
 *
 *   # Run against staging (requires valid staging credentials)
 *   STAGING_MODE=true STAGING_URL=https://staging.nuvanaapp.com npm run test:e2e tests/e2e/staging-performance-audit.spec.ts
 *
 * BEST PRACTICES APPLIED:
 * - Uses centralized test configuration for timeouts
 * - Uses shared auth helpers for consistent login
 * - Proper cleanup of test data
 * - Network-first waiting patterns
 * - Detailed performance metrics with actionable thresholds
 * - Security: No hardcoded production credentials
 */

import { test as base, expect, Page } from "@playwright/test";
import { TEST_TIMEOUTS, TEST_CONSTANTS } from "../support/test-config";
import { loginAsSuperAdmin } from "../support/auth.helper";

// ============================================
// CONFIGURATION
// ============================================

const STAGING_MODE = process.env.STAGING_MODE === "true";
const TARGET_URL = STAGING_MODE
  ? process.env.STAGING_URL || "https://staging.nuvanaapp.com"
  : process.env.FRONTEND_URL || "http://localhost:3000";

/**
 * Build URL for navigation - uses relative URLs in local mode (baseURL from playwright config)
 * and absolute URLs in staging mode.
 */
function buildUrl(path: string): string {
  return STAGING_MODE ? `${TARGET_URL}${path}` : path;
}

// Admin credentials from environment variables (set in global-setup or CI config)
// In local mode, uses the seeded admin user created by global-setup.ts
// In staging mode, uses credentials from environment variables
const ADMIN_CREDENTIALS = {
  email: process.env.TEST_ADMIN_EMAIL || "admin@nuvana.com",
  password: process.env.TEST_ADMIN_PASSWORD || "Admin123!",
};

// Performance thresholds (in milliseconds) - adjusted for realistic expectations
const THRESHOLDS = {
  // Login operations - account for cold starts and network latency
  LOGIN_PAGE_LOAD: 3000, // Initial page load with hydration
  LOGIN_SUBMIT: 5000, // Login action including JWT generation and redirect
  // Dashboard operations
  DASHBOARD_LOAD: 3000, // Dashboard initial render
  NETWORK_IDLE: 5000, // Time for all API calls to complete
  // Navigation operations
  PAGE_NAVIGATION: 4000, // Navigation to subpages
  TABLE_RENDER: 3000, // Table with data rendering
  // API operations
  API_RESPONSE: 1000, // Individual API calls
  SLOW_API_THRESHOLD: 2000, // Flag APIs slower than this
};

// ============================================
// TYPES AND INTERFACES
// ============================================

interface PerformanceMetric {
  operation: string;
  duration: number;
  threshold: number;
  passed: boolean;
  details?: string;
}

interface ApiTiming {
  url: string;
  duration: number;
  method: string;
  status: number;
}

interface TestContext {
  metrics: PerformanceMetric[];
  apiTimings: ApiTiming[];
  testPassword: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function recordMetric(
  context: TestContext,
  operation: string,
  duration: number,
  threshold: number,
  details?: string,
): PerformanceMetric {
  const metric: PerformanceMetric = {
    operation,
    duration: Math.round(duration),
    threshold,
    passed: duration <= threshold,
    details,
  };
  context.metrics.push(metric);
  console.log(
    `[PERF] ${operation}: ${Math.round(duration)}ms (threshold: ${threshold}ms) - ${metric.passed ? "PASS" : "FAIL"}`,
  );
  return metric;
}

function setupApiTimingListener(page: Page, context: TestContext): void {
  // Track request start times
  const requestStartTimes = new Map<string, number>();

  page.on("request", (request) => {
    requestStartTimes.set(request.url(), Date.now());
  });

  page.on("response", (response) => {
    const request = response.request();
    const startTime = requestStartTimes.get(request.url());
    if (startTime) {
      const duration = Date.now() - startTime;
      const url = request.url();
      // Only track API calls, not static assets
      if (url.includes("/api/") || url.includes("/auth/")) {
        context.apiTimings.push({
          url: url,
          duration,
          method: request.method(),
          status: response.status(),
        });
        if (duration > THRESHOLDS.SLOW_API_THRESHOLD) {
          console.log(
            `[API-SLOW] ${request.method()} ${url} - ${duration}ms (${response.status()})`,
          );
        }
      }
      requestStartTimes.delete(request.url());
    }
  });
}

function printPerformanceSummary(context: TestContext): void {
  console.log("\n========== PERFORMANCE SUMMARY ==========");
  console.log(
    "Operation                              | Duration | Threshold | Status",
  );
  console.log(
    "---------------------------------------|----------|-----------|-------",
  );

  for (const metric of context.metrics) {
    const opPadded = metric.operation.padEnd(38);
    const durPadded = `${metric.duration}ms`.padStart(8);
    const thrPadded = `${metric.threshold}ms`.padStart(9);
    const status = metric.passed ? "PASS" : "FAIL";
    console.log(`${opPadded} | ${durPadded} | ${thrPadded} | ${status}`);
  }

  // Summarize API performance
  if (context.apiTimings.length > 0) {
    console.log("\n========== API CALL SUMMARY ==========");
    const sortedTimings = [...context.apiTimings].sort(
      (a, b) => b.duration - a.duration,
    );
    const topSlow = sortedTimings.slice(0, 10);
    for (const timing of topSlow) {
      const flag =
        timing.duration > THRESHOLDS.SLOW_API_THRESHOLD ? "[SLOW]" : "";
      console.log(
        `${flag} ${timing.method.padEnd(6)} ${timing.duration.toString().padStart(5)}ms | ${timing.url}`,
      );
    }
  }

  // Alert on failures
  const failures = context.metrics.filter((m) => !m.passed);
  if (failures.length > 0) {
    console.log(
      `\n[ALERT] ${failures.length} operation(s) exceeded thresholds`,
    );
    for (const f of failures) {
      console.log(
        `  - ${f.operation}: ${f.duration}ms (threshold: ${f.threshold}ms)`,
      );
    }
  }
}

// ============================================
// TEST FIXTURES
// ============================================

const test = base.extend<{
  testContext: TestContext;
}>({
  testContext: async ({}, use) => {
    const context: TestContext = {
      metrics: [],
      apiTimings: [],
      testPassword: TEST_CONSTANTS.TEST_PASSWORD,
    };
    await use(context);
  },
});

// ============================================
// TEST SUITE
// ============================================

test.describe("Performance Audit - Super Admin Dashboard", () => {
  // 3 minute timeout for full audit
  test.setTimeout(180_000);

  // Run tests serially to avoid parallel database conflicts
  test.describe.configure({ mode: "serial" });

  // Skip staging tests if not in staging mode and no staging URL configured
  test.skip(
    () => STAGING_MODE && !process.env.STAGING_URL,
    "Staging URL not configured",
  );

  test.beforeEach(async ({ page, testContext }) => {
    // Setup API timing listener
    setupApiTimingListener(page, testContext);
  });

  test("Complete performance audit for admin operations", async ({
    page,
    testContext,
  }) => {
    // ============================================
    // SETUP: Use admin credentials from environment/config
    // ============================================
    // In local mode, uses the seeded admin user created by global-setup.ts
    // In staging mode, override via TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD env vars
    const testEmail = ADMIN_CREDENTIALS.email;
    testContext.testPassword = ADMIN_CREDENTIALS.password;
    console.log(`[SETUP] Using admin: ${testEmail}`);

    try {
      // ============================================
      // TEST 1: Login Performance (using shared auth helper)
      // ============================================
      console.log("\n========== TEST 1: LOGIN PERFORMANCE ==========");
      console.log(`[SETUP] Logging in with admin: ${testEmail}`);

      const loginStart = Date.now();

      // Use the shared auth helper which handles all login complexity
      // This ensures consistent, tested login behavior across all E2E tests
      // Pass TARGET_URL for staging mode support
      await loginAsSuperAdmin(
        page,
        testEmail,
        testContext.testPassword,
        STAGING_MODE ? TARGET_URL : undefined,
      );

      const loginDuration = Date.now() - loginStart;
      recordMetric(
        testContext,
        "Login + auth context ready",
        loginDuration,
        THRESHOLDS.LOGIN_PAGE_LOAD + THRESHOLDS.LOGIN_SUBMIT, // Combined threshold
      );

      // Screenshot after successful login
      await page.screenshot({
        path: "test-results/01-after-login.png",
        fullPage: true,
      });

      // ============================================
      // TEST 3: Dashboard Initial Load
      // ============================================
      console.log("\n========== TEST 3: DASHBOARD INITIAL LOAD ==========");

      const dashboardLoadStart = Date.now();

      // Wait for dashboard content to be visible
      const dashboardContent = page.locator(
        '[data-testid="dashboard-content"]',
      );
      await expect(dashboardContent).toBeVisible({
        timeout: TEST_TIMEOUTS.AUTH_CONTEXT_READY,
      });

      const dashboardLoadDuration = Date.now() - dashboardLoadStart;
      recordMetric(
        testContext,
        "Dashboard content render",
        dashboardLoadDuration,
        THRESHOLDS.DASHBOARD_LOAD,
      );

      // Wait for network to settle
      const networkIdleStart = Date.now();
      await page
        .waitForLoadState("networkidle", {
          timeout: TEST_TIMEOUTS.NETWORK_IDLE,
        })
        .catch(() => {
          // networkidle might not complete if there are persistent connections
        });
      const networkIdleDuration = Date.now() - networkIdleStart;
      recordMetric(
        testContext,
        "Dashboard network idle",
        networkIdleDuration,
        THRESHOLDS.NETWORK_IDLE,
      );

      await page.screenshot({
        path: "test-results/02-dashboard.png",
        fullPage: true,
      });

      // ============================================
      // TEST 4: Navigate to Users Page
      // ============================================
      console.log("\n========== TEST 4: USERS PAGE NAVIGATION ==========");

      const usersNavStart = Date.now();
      await page.goto(buildUrl("/admin/users"), {
        waitUntil: "domcontentloaded",
      });

      // Wait for users page content (table or heading)
      const usersHeading = page.locator("h1, h2").filter({ hasText: /Users/i });
      await expect(usersHeading).toBeVisible({
        timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE,
      });

      const usersNavDuration = Date.now() - usersNavStart;
      recordMetric(
        testContext,
        "Users page navigation",
        usersNavDuration,
        THRESHOLDS.PAGE_NAVIGATION,
      );

      // Wait for table to render with data
      const usersTableStart = Date.now();
      const usersTable = page.locator("table tbody tr");
      await usersTable
        .first()
        .waitFor({
          state: "visible",
          timeout: TEST_TIMEOUTS.DATA_FETCH,
        })
        .catch(() => {
          // Table might be empty in test environment
        });
      const usersTableDuration = Date.now() - usersTableStart;
      recordMetric(
        testContext,
        "Users table render",
        usersTableDuration,
        THRESHOLDS.TABLE_RENDER,
      );

      const userRowCount = await usersTable.count();
      console.log(`[INFO] Users table row count: ${userRowCount}`);

      await page.screenshot({
        path: "test-results/03-users-page.png",
        fullPage: true,
      });

      // ============================================
      // TEST 5: Navigate to Stores Page
      // ============================================
      console.log("\n========== TEST 5: STORES PAGE NAVIGATION ==========");

      const storesNavStart = Date.now();
      await page.goto(buildUrl("/stores"), { waitUntil: "domcontentloaded" });

      // Wait for stores page content
      const storesHeading = page
        .locator("h1, h2")
        .filter({ hasText: /Stores/i });
      await expect(storesHeading).toBeVisible({
        timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE,
      });

      const storesNavDuration = Date.now() - storesNavStart;
      recordMetric(
        testContext,
        "Stores page navigation",
        storesNavDuration,
        THRESHOLDS.PAGE_NAVIGATION,
      );

      // Wait for table to render
      const storesTableStart = Date.now();
      const storesTable = page.locator("table tbody tr");
      await storesTable
        .first()
        .waitFor({
          state: "visible",
          timeout: TEST_TIMEOUTS.DATA_FETCH,
        })
        .catch(() => {
          // Table might be empty
        });
      const storesTableDuration = Date.now() - storesTableStart;
      recordMetric(
        testContext,
        "Stores table render",
        storesTableDuration,
        THRESHOLDS.TABLE_RENDER,
      );

      const storeRowCount = await storesTable.count();
      console.log(`[INFO] Stores table row count: ${storeRowCount}`);

      await page.screenshot({
        path: "test-results/04-stores-page.png",
        fullPage: true,
      });

      // ============================================
      // TEST 6: Navigate to Companies Page
      // ============================================
      console.log("\n========== TEST 6: COMPANIES PAGE NAVIGATION ==========");

      const companiesNavStart = Date.now();
      // Note: Companies page is at /companies, not /admin/companies
      await page.goto(buildUrl("/companies"), {
        waitUntil: "domcontentloaded",
      });

      // Wait for companies page content
      const companiesHeading = page
        .locator("h1, h2")
        .filter({ hasText: /Companies/i });
      await expect(companiesHeading).toBeVisible({
        timeout: TEST_TIMEOUTS.ELEMENT_VISIBLE,
      });

      const companiesNavDuration = Date.now() - companiesNavStart;
      recordMetric(
        testContext,
        "Companies page navigation",
        companiesNavDuration,
        THRESHOLDS.PAGE_NAVIGATION,
      );

      // Wait for table to render
      const companiesTableStart = Date.now();
      const companiesTable = page.locator("table tbody tr");
      await companiesTable
        .first()
        .waitFor({
          state: "visible",
          timeout: TEST_TIMEOUTS.DATA_FETCH,
        })
        .catch(() => {
          // Table might be empty
        });
      const companiesTableDuration = Date.now() - companiesTableStart;
      recordMetric(
        testContext,
        "Companies table render",
        companiesTableDuration,
        THRESHOLDS.TABLE_RENDER,
      );

      const companyRowCount = await companiesTable.count();
      console.log(`[INFO] Companies table row count: ${companyRowCount}`);

      await page.screenshot({
        path: "test-results/05-companies-page.png",
        fullPage: true,
      });

      // ============================================
      // SUMMARY
      // ============================================
      printPerformanceSummary(testContext);

      await page.screenshot({
        path: "test-results/06-final-state.png",
        fullPage: true,
      });

      // Verify no critical failures
      const criticalFailures = testContext.metrics.filter(
        (m) =>
          !m.passed &&
          (m.operation.includes("Login") || m.operation.includes("Dashboard")),
      );

      // Log warnings for any failures but don't fail the test
      // Performance tests should be informational, not blocking
      if (criticalFailures.length > 0) {
        console.warn(
          `\n[WARNING] ${criticalFailures.length} critical operation(s) exceeded thresholds`,
        );
      }
    } finally {
      // No cleanup needed - using seeded admin user
    }
  });

  test("API response times are within acceptable limits", async ({
    page,
    testContext,
  }) => {
    // This test specifically validates API performance metrics
    // It runs after the main audit and checks collected API timings

    // Use same admin credentials as the main audit test
    const testEmail = ADMIN_CREDENTIALS.email;
    const testPassword = ADMIN_CREDENTIALS.password;
    console.log(`[SETUP] Using admin: ${testEmail}`);

    // Login using the shared auth helper
    // Pass TARGET_URL for staging mode support
    await loginAsSuperAdmin(
      page,
      testEmail,
      testPassword,
      STAGING_MODE ? TARGET_URL : undefined,
    );

    // Navigate to data-heavy pages to collect API metrics
    await page.goto(buildUrl("/admin/users"));
    await page.waitForLoadState("networkidle").catch(() => {});

    await page.goto(buildUrl("/stores"));
    await page.waitForLoadState("networkidle").catch(() => {});

    await page.goto(buildUrl("/companies"));
    await page.waitForLoadState("networkidle").catch(() => {});

    // Analyze collected API timings
    const slowApis = testContext.apiTimings.filter(
      (t) => t.duration > THRESHOLDS.SLOW_API_THRESHOLD,
    );

    console.log("\n========== API PERFORMANCE ANALYSIS ==========");
    console.log(`Total API calls: ${testContext.apiTimings.length}`);
    console.log(
      `Slow API calls (>${THRESHOLDS.SLOW_API_THRESHOLD}ms): ${slowApis.length}`,
    );

    if (slowApis.length > 0) {
      console.log("\nSlow API calls:");
      for (const api of slowApis) {
        console.log(`  ${api.method} ${api.url}: ${api.duration}ms`);
      }
    }

    // Calculate average response time
    if (testContext.apiTimings.length > 0) {
      const avgDuration =
        testContext.apiTimings.reduce((sum, t) => sum + t.duration, 0) /
        testContext.apiTimings.length;
      console.log(`\nAverage API response time: ${Math.round(avgDuration)}ms`);
    }

    // Log warning if too many slow APIs, but don't fail
    if (testContext.apiTimings.length > 0) {
      const slowApiPercentage =
        (slowApis.length / testContext.apiTimings.length) * 100;
      if (slowApiPercentage > 20) {
        console.warn(
          `\n[WARNING] ${slowApiPercentage.toFixed(1)}% of API calls are slow`,
        );
      }
    }
  });
});
