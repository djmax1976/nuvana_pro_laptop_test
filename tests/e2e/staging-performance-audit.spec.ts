import { test, expect, Page } from "@playwright/test";

/**
 * Performance Audit for Staging Environment
 * Tests actual response times for Super Admin dashboard operations
 */

const STAGING_URL = "https://staging.nuvanaapp.com";
const ADMIN_EMAIL = "admin@nuvana.com";
const ADMIN_PASSWORD = "Admin123!";

// Performance thresholds (in milliseconds)
const THRESHOLDS = {
  LOGIN: 2000, // Login should complete within 2 seconds
  PAGE_LOAD: 1500, // Page navigation should be under 1.5 seconds
  API_RESPONSE: 500, // API calls should respond within 500ms
  LIST_RENDER: 1000, // List rendering should be under 1 second
};

interface PerformanceMetric {
  operation: string;
  duration: number;
  threshold: number;
  passed: boolean;
  details?: string;
}

const metrics: PerformanceMetric[] = [];
const apiTimings: {
  url: string;
  duration: number;
  method: string;
  status: number;
}[] = [];

function recordMetric(
  operation: string,
  duration: number,
  threshold: number,
  details?: string,
) {
  const metric = {
    operation,
    duration: Math.round(duration),
    threshold,
    passed: duration <= threshold,
    details,
  };
  metrics.push(metric);
  console.log(
    `[PERF] ${operation}: ${Math.round(duration)}ms (threshold: ${threshold}ms) - ${metric.passed ? "PASS" : "FAIL"}`,
  );
  return metric;
}

test.describe("Staging Performance Audit - Super Admin Dashboard", () => {
  test.setTimeout(180000); // 3 minute timeout for full audit

  test("Complete performance audit", async ({ page }) => {
    // Enable request/response timing
    page.on("request", (request) => {
      (request as any)._startTime = Date.now();
    });

    page.on("response", async (response) => {
      const request = response.request();
      const startTime = (request as any)._startTime;
      if (startTime) {
        const duration = Date.now() - startTime;
        const url = request.url();
        // Only track API calls, not static assets
        if (url.includes("/api/") || url.includes("/auth/")) {
          apiTimings.push({
            url: url,
            duration,
            method: request.method(),
            status: response.status(),
          });
          console.log(
            `[API] ${request.method()} ${url} - ${duration}ms (${response.status()})`,
          );
        }
      }
    });

    // ============================================
    // TEST 1: Login Performance
    // ============================================
    console.log("\n========== TEST 1: LOGIN PERFORMANCE ==========");

    const loginStart = Date.now();
    await page.goto(`${STAGING_URL}/login`);
    const pageLoadDuration = Date.now() - loginStart;
    recordMetric("Login page load", pageLoadDuration, THRESHOLDS.PAGE_LOAD);

    // Take screenshot of login page
    await page.screenshot({
      path: "test-results/01-login-page.png",
      fullPage: true,
    });

    // Fill login form
    await page.fill('input[name="email"], input[type="email"]', ADMIN_EMAIL);
    await page.fill(
      'input[name="password"], input[type="password"]',
      ADMIN_PASSWORD,
    );

    // Click login and measure
    const loginActionStart = Date.now();
    await page.click('button[type="submit"]');

    // Wait for navigation to dashboard
    await page.waitForURL("**/dashboard**", { timeout: 30000 });
    const loginActionDuration = Date.now() - loginActionStart;
    recordMetric(
      "Login action (submit to dashboard)",
      loginActionDuration,
      THRESHOLDS.LOGIN,
    );

    // ============================================
    // TEST 2: Dashboard Initial Load
    // ============================================
    console.log("\n========== TEST 2: DASHBOARD LOAD ==========");

    // Wait for dashboard content to be visible
    const dashboardLoadStart = Date.now();
    await page.waitForLoadState("networkidle");
    const dashboardLoadDuration = Date.now() - dashboardLoadStart;
    recordMetric(
      "Dashboard network idle",
      dashboardLoadDuration,
      THRESHOLDS.PAGE_LOAD,
    );

    // Take screenshot of dashboard
    await page.screenshot({
      path: "test-results/02-dashboard.png",
      fullPage: true,
    });

    // Explore the sidebar/navigation structure
    console.log("\n========== EXPLORING NAVIGATION ==========");
    const currentUrl = page.url();
    console.log(`[INFO] Current URL: ${currentUrl}`);

    // Log all navigation links we can find
    const allLinks = await page.locator("a").all();
    console.log(`[INFO] Found ${allLinks.length} total links`);

    for (const link of allLinks.slice(0, 30)) {
      const href = await link.getAttribute("href");
      const text = await link.textContent();
      if (
        href &&
        (href.includes("user") ||
          href.includes("company") ||
          href.includes("store") ||
          href.includes("dashboard"))
      ) {
        console.log(`[NAV] Link: "${text?.trim()}" -> ${href}`);
      }
    }

    // ============================================
    // TEST 3: Navigate to Users (found at /admin/users)
    // ============================================
    console.log("\n========== TEST 3: USERS LIST ==========");

    // Navigate using discovered path
    const usersNavStart = Date.now();
    await page.goto(`${STAGING_URL}/admin/users`);
    await page.waitForLoadState("networkidle");
    const usersNavDuration = Date.now() - usersNavStart;
    recordMetric(
      "Users page load (/admin/users)",
      usersNavDuration,
      THRESHOLDS.PAGE_LOAD * 2,
    );

    // Wait for any lazy-loaded content
    await page.waitForTimeout(3000);

    await page.screenshot({
      path: "test-results/03-users-page.png",
      fullPage: true,
    });

    // Check what's on the page
    const pageContent = await page.content();
    const userTableExists =
      pageContent.includes("table") || pageContent.includes("tbody");
    console.log(`[INFO] Table element found: ${userTableExists}`);

    // Count rows in any table
    const tableRows = await page.locator("table tbody tr").count();
    console.log(`[INFO] Table rows found: ${tableRows}`);

    // Check for card/grid layouts too
    const userCards = await page
      .locator("[data-testid*='user'], .user-card, .user-item")
      .count();
    console.log(`[INFO] User card elements: ${userCards}`);

    // Log page title/heading
    const pageHeading = await page.locator("h1, h2").first().textContent();
    console.log(`[INFO] Page heading: ${pageHeading}`);

    // ============================================
    // TEST 4: Navigate to Stores (found at /stores)
    // ============================================
    console.log("\n========== TEST 4: STORES LIST ==========");

    const storesNavStart = Date.now();
    await page.goto(`${STAGING_URL}/stores`);
    await page.waitForLoadState("networkidle");
    const storesNavDuration = Date.now() - storesNavStart;
    recordMetric(
      "Stores page load (/stores)",
      storesNavDuration,
      THRESHOLDS.PAGE_LOAD * 2,
    );

    await page.waitForTimeout(3000);

    await page.screenshot({
      path: "test-results/04-stores-page.png",
      fullPage: true,
    });

    const storeRows = await page.locator("table tbody tr").count();
    console.log(`[INFO] Store table rows found: ${storeRows}`);

    const storeCards = await page
      .locator("[data-testid*='store'], .store-card, .store-item")
      .count();
    console.log(`[INFO] Store card elements: ${storeCards}`);

    const storesHeading = await page.locator("h1, h2").first().textContent();
    console.log(`[INFO] Page heading: ${storesHeading}`);

    // ============================================
    // TEST 5: Navigate to Companies (try /admin/companies or /companies)
    // ============================================
    console.log("\n========== TEST 5: COMPANIES LIST ==========");

    const companiesNavStart = Date.now();
    // Try /admin/companies first (following the /admin/users pattern)
    await page.goto(`${STAGING_URL}/admin/companies`);
    await page.waitForLoadState("networkidle");
    const companiesNavDuration = Date.now() - companiesNavStart;
    recordMetric(
      "Companies page load (/admin/companies)",
      companiesNavDuration,
      THRESHOLDS.PAGE_LOAD * 2,
    );

    await page.waitForTimeout(3000);

    await page.screenshot({
      path: "test-results/05-companies-page.png",
      fullPage: true,
    });

    const companyRows = await page.locator("table tbody tr").count();
    console.log(`[INFO] Company table rows found: ${companyRows}`);

    const companyCards = await page
      .locator("[data-testid*='company'], .company-card, .company-item")
      .count();
    console.log(`[INFO] Company card elements: ${companyCards}`);

    const companiesHeading = await page.locator("h1, h2").first().textContent();
    console.log(`[INFO] Page heading: ${companiesHeading}`);

    // ============================================
    // SUMMARY REPORT
    // ============================================
    console.log("\n========== PERFORMANCE SUMMARY ==========");
    console.log(
      "Operation                              | Duration | Threshold | Status",
    );
    console.log(
      "---------------------------------------|----------|-----------|-------",
    );

    for (const metric of metrics) {
      const opPadded = metric.operation.padEnd(38);
      const durPadded = `${metric.duration}ms`.padStart(8);
      const thrPadded = `${metric.threshold}ms`.padStart(9);
      const status = metric.passed ? "PASS" : "FAIL";
      console.log(`${opPadded} | ${durPadded} | ${thrPadded} | ${status}`);
    }

    console.log("\n========== ALL API CALLS (sorted by duration) ==========");

    // Sort by duration descending
    apiTimings.sort((a, b) => b.duration - a.duration);
    for (const timing of apiTimings) {
      console.log(
        `[API] ${timing.method.padEnd(6)} ${timing.duration.toString().padStart(5)}ms | ${timing.url}`,
      );
    }

    // Identify the slowest API calls
    const slowApis = apiTimings.filter(
      (t) => t.duration > THRESHOLDS.API_RESPONSE,
    );
    if (slowApis.length > 0) {
      console.log(
        `\n========== SLOW API CALLS (>${THRESHOLDS.API_RESPONSE}ms) ==========`,
      );
      for (const slow of slowApis) {
        console.log(`  - ${slow.method} ${slow.url}: ${slow.duration}ms`);
      }
    }

    // Check for failures
    const failures = metrics.filter((m) => !m.passed);
    if (failures.length > 0) {
      console.log(
        `\n[ALERT] ${failures.length} operations exceeded thresholds`,
      );
    }

    // Final screenshot
    await page.screenshot({
      path: "test-results/06-final-state.png",
      fullPage: true,
    });
  });
});
