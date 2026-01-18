/**
 * Vitest Configuration
 *
 * Enterprise-grade test configuration for the backend application.
 * Configured for unit testing, integration testing, and code coverage.
 */

import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Test environment
    environment: "node",

    // Global test setup
    globals: true,

    // Test file patterns
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["node_modules", "dist"],

    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: [
        "src/services/**/*.ts",
        "src/routes/**/*.ts",
        "src/schemas/**/*.ts",
        "src/middleware/**/*.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.d.ts",
        "**/index.ts",
        "src/app.ts",
        "src/workers/**",
      ],
      // Coverage thresholds are set per-file for targeted testing
      // When running full test suite, enable global thresholds
      // thresholds: {
      //   statements: 80,
      //   branches: 75,
      //   functions: 80,
      //   lines: 80,
      // },
    },

    // Test timeout (increased for integration tests)
    testTimeout: 30000,

    // Hook timeout
    hookTimeout: 30000,

    // Retry failed tests once
    retry: 1,

    // Reporter
    reporters: ["verbose"],

    // Mock reset between tests
    mockReset: true,
    clearMocks: true,
    restoreMocks: true,

    // Setup files
    setupFiles: ["./tests/setup.ts"],

    // Sequence for deterministic test order
    sequence: {
      shuffle: false,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
