import "@testing-library/jest-dom";
import {
  assertDatabaseSafeForTests,
  logDatabaseValidation,
} from "./config/database-protection";

// =============================================================================
// DATABASE PROTECTION - Uses centralized config
// =============================================================================
// Validation logic is centralized in ./config/database-protection.ts
// This ensures consistency across Vitest, Playwright, and all test infrastructure.
// Only nuvana_test is allowed for testing to protect development data.
// =============================================================================

assertDatabaseSafeForTests();
logDatabaseValidation();

// JSDOM polyfills for Radix UI components
// Radix Select and other components use browser APIs not available in JSDOM
// Force override even if methods exist but are broken in JSDOM

// Polyfill for Element.scrollIntoView
Element.prototype.scrollIntoView = function () {
  // No-op implementation for tests
};

// Polyfill for pointer capture (used by Radix Select)
Element.prototype.hasPointerCapture = function () {
  return false;
};

Element.prototype.setPointerCapture = function () {
  // No-op
};

Element.prototype.releasePointerCapture = function () {
  // No-op
};
