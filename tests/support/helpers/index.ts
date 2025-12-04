/**
 * Test Helper Functions Index
 *
 * Central export point for all test helper functions.
 * Provides a clean entry point for importing helpers in tests.
 */

export {
  validateHealthCheckResponse,
  extractRateLimitInfo,
  validateCorsHeaders,
  validateSecurityHeaders,
  type HealthCheckResponse,
} from "./server-helpers";

export {
  createUser,
  createCompany,
  createStore,
  createCashier,
  createShift,
  createTransaction,
  getNextExpectedEmployeeId,
} from "./database-helpers";
