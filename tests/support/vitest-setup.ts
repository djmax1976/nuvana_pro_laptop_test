import "@testing-library/jest-dom";

// Set default DATABASE_URL for tests if not already set
// This allows unit tests that use Prisma to work without requiring
// DATABASE_URL to be set in the environment
if (!process.env.DATABASE_URL) {
  // Default to dev database matching docker-compose setup
  // Can be overridden by setting DATABASE_URL in environment
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@localhost:5432/nuvana_dev";
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
