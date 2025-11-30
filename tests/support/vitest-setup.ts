import "@testing-library/jest-dom";

// Require explicit DATABASE_URL for tests to prevent accidental mutations
// Tests must connect to a test-specific database (e.g., nuvana_test or nuvana_test_db)
// This ensures isolation from development data and prevents test failures from affecting dev
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL environment variable is required for tests. " +
      "Please set DATABASE_URL to a test-specific database (e.g., " +
      "postgresql://postgres:postgres@localhost:5432/nuvana_test). " +
      "This prevents tests from mutating development data.",
  );
}

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
