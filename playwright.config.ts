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

  // Parallel execution
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  // Timeouts
  timeout: 60 * 1000, // Test timeout: 60s
  expect: {
    timeout: 15 * 1000, // Assertion timeout: 15s
  },

  // Output directory for test artifacts
  outputDir: "test-results/artifacts",

  // Reporter configuration
  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["junit", { outputFile: "test-results/junit.xml" }],
    ["list"],
  ],

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
      testMatch: "**/e2e/**/*.spec.ts",
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

  // Web server configuration (for starting backend during tests)
  webServer: {
    command: "cd backend && npm run dev",
    url: (process.env.BACKEND_URL || "http://localhost:3001") + "/health",
    reuseExistingServer: true, // Always reuse existing server (CI starts it manually)
    timeout: 120000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
