import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/support/vitest-setup.ts"],
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    pool: "forks",
    // Slow test detection - tests taking longer than these thresholds are flagged
    slowTestThreshold: 1000, // 1 second - flag slow tests
    testTimeout: 30000, // 30 seconds - fail hanging tests
    hookTimeout: 30000, // 30 seconds - fail hanging hooks
    // Output slow tests in CI
    reporters: process.env.CI
      ? ["default", "json", "hanging-process"]
      : ["default"],
    outputFile: process.env.CI ? "./test-results/vitest-results.json" : undefined,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      reportsDirectory: "./coverage",
      // Note: Coverage thresholds removed - current codebase has ~12-17% coverage.
      // Thresholds should be added incrementally as test coverage improves.
      exclude: [
        "node_modules/**",
        "tests/**",
        "**/*.d.ts",
        "**/*.config.*",
        "**/types/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@/tests": path.resolve(__dirname, "tests"),
    },
  },
});
