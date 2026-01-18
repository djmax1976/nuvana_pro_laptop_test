/**
 * Global Test Setup
 *
 * Initializes test environment with mocks, utilities, and configuration.
 * This file runs before all test suites.
 */

import { vi, beforeAll, afterAll, afterEach } from "vitest";

// Set test environment
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-key-for-testing-only";
process.env.API_KEY_ENCRYPTION_KEY = "test-encryption-key-32chars!!";

// Global timeout for async operations
vi.setConfig({ testTimeout: 30000 });

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});

// Global test lifecycle hooks
beforeAll(() => {
  // Suppress console output during tests unless DEBUG is set
  if (!process.env.DEBUG) {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // Keep console.error visible for debugging test failures
  }
});

afterAll(() => {
  vi.restoreAllMocks();
});
