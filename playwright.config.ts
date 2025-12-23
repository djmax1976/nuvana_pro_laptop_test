import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright Configuration for API Testing
 *
 * This configuration is optimized for backend API testing using Playwright's
 * APIRequestContext. Tests are organized by level (e2e, api, component, unit).
 */

export default defineConfig({
  // Test directory structure
  testDir: "./tests",

  // Global setup/teardown - cleans test data before and after all tests
  globalSetup: "./tests/support/global-setup.ts",
  globalTeardown: "./tests/support/global-teardown.ts",

  // Parallel execution
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0, // Reduced retries to 1 in CI
  workers: process.env.CI ? 4 : undefined, // Run 4 workers in parallel in CI

  // Timeouts
  timeout: 120 * 1000, // Test timeout: 120s (increased for CI)
  expect: {
    timeout: 30 * 1000, // Assertion timeout: 30s (increased for CI)
  },

  // Output directory for test artifacts
  outputDir: "test-results/artifacts",

  // Reporter configuration - includes slow test detection
  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["junit", { outputFile: "test-results/junit.xml" }],
    ["json", { outputFile: "test-results/playwright-results.json" }],
    ["list", { printSteps: true }],
  ],

  // Slow test threshold - tests exceeding this are flagged in reports
  reportSlowTests: {
    max: 10, // Report up to 10 slowest tests
    threshold: 30000, // Flag tests taking longer than 30 seconds
  },

  // Global test configuration
  use: {
    // Base URL for API requests
    baseURL: process.env.BACKEND_URL || "http://localhost:3001",

    // Artifacts
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",

    // Timeouts
    actionTimeout: 15 * 1000, // Action timeout: 15s
    navigationTimeout: 30 * 1000, // Navigation timeout: 30s
  },

  // Projects for different test levels
  projects: [
    {
      name: "e2e",
      testMatch: "**/{e2e,integration}/**/*.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: process.env.FRONTEND_URL || "http://localhost:3000",
      },
    },
    {
      name: "api",
      testMatch: "**/api/**/*.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],

  // Web server configuration (for starting servers during tests)
  // Disabled in CI since servers are started manually in CI/CD pipeline
  ...(process.env.CI
    ? {}
    : {
        webServer: [
          {
            command: "npm run dev",
            url: process.env.FRONTEND_URL || "http://localhost:3000",
            reuseExistingServer: true,
            timeout: 120000,
            stdout: "ignore",
            stderr: "pipe",
          },
          {
            // IMPORTANT: Tests should be run via npm scripts (e.g., `npm run test:api`)
            // which use cross-env to set DATABASE_URL=nuvana_test
            // This ensures both the test fixtures AND the webServer connect to test DB
            command: "cd backend && npm run dev:test",
            url:
              (process.env.BACKEND_URL || "http://localhost:3001") + "/health",
            reuseExistingServer: !process.env.CI,
            timeout: 120000,
            stdout: "pipe",
            stderr: "pipe",
          },
        ],
      }),
});
