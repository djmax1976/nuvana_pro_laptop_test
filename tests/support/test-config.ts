/**
 * Centralized Test Configuration
 *
 * Enterprise-grade test configuration with:
 * - Environment-aware timeouts (CI vs local)
 * - Semantic timeout names for self-documenting tests
 * - Single source of truth for all test constants
 *
 * Usage:
 *   import { TEST_TIMEOUTS, TEST_CONSTANTS } from '../support/test-config';
 *   await page.waitForURL(/dashboard/, { timeout: TEST_TIMEOUTS.URL_CHANGE });
 */

const isCI = process.env.CI === "true";

/**
 * Environment-aware timeout configuration.
 * CI environments get longer timeouts due to:
 * - Shared resources with parallel workers
 * - Cold start latency for services
 * - Network variability in containerized environments
 */
export const TEST_TIMEOUTS = {
  // ============================================
  // AUTHENTICATION TIMEOUTS
  // ============================================
  /** Time to wait for login form to become visible */
  LOGIN_FORM_VISIBLE: isCI ? 30000 : 10000,
  /** Time to wait for login form inputs to become editable */
  LOGIN_FORM_EDITABLE: isCI ? 15000 : 5000,
  /** Time to wait for login API response */
  LOGIN_API_RESPONSE: isCI ? 45000 : 15000,
  /** Time to wait for auth context to be fully populated after login */
  AUTH_CONTEXT_READY: isCI ? 30000 : 10000,
  /** Time to wait for dashboard API that populates auth context */
  DASHBOARD_API_RESPONSE: isCI ? 30000 : 10000,

  // ============================================
  // NAVIGATION TIMEOUTS
  // ============================================
  /** Time to wait for URL to change after navigation/redirect */
  URL_CHANGE: isCI ? 45000 : 15000,
  /** Time to wait for page to reach domcontentloaded state */
  PAGE_LOAD: isCI ? 30000 : 10000,
  /** Time to wait for network to become idle */
  NETWORK_IDLE: isCI ? 15000 : 5000,

  // ============================================
  // UI ELEMENT TIMEOUTS
  // ============================================
  /** Time to wait for a UI element to become visible */
  ELEMENT_VISIBLE: isCI ? 30000 : 10000,
  /** Time to wait for form inputs to become editable */
  ELEMENT_EDITABLE: isCI ? 15000 : 5000,
  /** Time to wait for buttons to become enabled */
  BUTTON_ENABLED: isCI ? 10000 : 5000,
  /** Time to wait for dialog/modal to appear */
  DIALOG_VISIBLE: isCI ? 15000 : 5000,

  // ============================================
  // API RESPONSE TIMEOUTS
  // ============================================
  /** Time to wait for form submission API response */
  FORM_SUBMIT: isCI ? 30000 : 10000,
  /** Time to wait for data fetch API response */
  DATA_FETCH: isCI ? 30000 : 10000,
  /** Time to wait for any generic API response */
  API_RESPONSE: isCI ? 30000 : 10000,

  // ============================================
  // ASSERTION TIMEOUTS
  // ============================================
  /** Time to wait for text content assertions */
  ASSERTION_TEXT: isCI ? 20000 : 5000,
  /** Time to wait for value assertions */
  ASSERTION_VALUE: isCI ? 10000 : 3000,
} as const;

/**
 * Test constants that don't vary by environment.
 */
export const TEST_CONSTANTS = {
  /** Standard test password meeting security requirements */
  TEST_PASSWORD: "TestPassword123!",
  /** Stagger delay range (ms) for parallel test isolation */
  STAGGER_DELAY_MAX: isCI ? 3000 : 1000,
} as const;

/**
 * Data-testid selectors for common UI elements.
 * Centralizing these prevents typos and makes refactoring easier.
 */
export const TEST_SELECTORS = {
  // Dashboard pages
  CLIENT_DASHBOARD_PAGE: '[data-testid="client-dashboard-page"]',
  LOTTERY_PAGE: '[data-testid="client-dashboard-lottery-page"]',
  SETTINGS_PAGE: '[data-testid="store-settings-page"]',
  LOTTERY_BINS_PAGE: '[data-testid="lottery-bins-settings-page"]',

  // Navigation
  NAV_SETTINGS: '[data-testid="client-nav-link-settings"]',
  NAV_LOTTERY: '[data-testid="client-nav-link-lottery"]',

  // Forms
  CASHIER_FORM: {
    NAME: '[data-testid="cashier-name"]',
    PIN: '[data-testid="cashier-pin"]',
    STORE: '[data-testid="cashier-store"]',
    SUBMIT: '[data-testid="submit-cashier"]',
  },
} as const;

/**
 * API endpoints for network-first waiting patterns.
 */
export const TEST_API_ENDPOINTS = {
  CLIENT_DASHBOARD: "/api/client/dashboard",
  LOGIN: "/api/auth/login",
  CLIENT_EMPLOYEES: "/api/client/employees",
  LOTTERY_BINS: "/api/lottery/bins",
} as const;

// Export type for TypeScript consumers
export type TestTimeouts = typeof TEST_TIMEOUTS;
export type TestConstants = typeof TEST_CONSTANTS;
