import "@testing-library/jest-dom";

// =============================================================================
// DATABASE PROTECTION - ENTERPRISE BEST PRACTICE
// =============================================================================
// Tests MUST run against an isolated test database to prevent data loss.
// This guard prevents accidental deletion of development/production data.
// =============================================================================

const PROTECTED_DATABASE_PATTERNS = [
  /nuvana_dev/i,
  /nuvana_prod/i,
  /nuvana_production/i,
  /nuvana_staging/i,
  /_dev$/i,
  /_prod$/i,
  /_production$/i,
];

const ALLOWED_TEST_DATABASE_PATTERNS = [
  /nuvana_test/i,
  /_test$/i,
  /_test_/i,
  /test_db/i,
];

function validateDatabaseUrl(): void {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    throw new Error(
      "\n" +
        "╔══════════════════════════════════════════════════════════════════════╗\n" +
        "║  DATABASE_URL REQUIRED                                               ║\n" +
        "╠══════════════════════════════════════════════════════════════════════╣\n" +
        "║  Tests require DATABASE_URL pointing to a TEST database.             ║\n" +
        "║                                                                      ║\n" +
        "║  Example:                                                            ║\n" +
        "║  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nuvana_test\n" +
        "║                                                                      ║\n" +
        "║  Run tests with:                                                     ║\n" +
        "║  DATABASE_URL=...nuvana_test npm run test:unit                       ║\n" +
        "╚══════════════════════════════════════════════════════════════════════╝\n",
    );
  }

  // Check if URL matches protected patterns (dev/prod/staging)
  const isProtectedDb = PROTECTED_DATABASE_PATTERNS.some((pattern) =>
    pattern.test(dbUrl),
  );
  const isAllowedTestDb = ALLOWED_TEST_DATABASE_PATTERNS.some((pattern) =>
    pattern.test(dbUrl),
  );

  if (isProtectedDb && !isAllowedTestDb) {
    throw new Error(
      "\n" +
        "╔══════════════════════════════════════════════════════════════════════╗\n" +
        "║  🚨 PROTECTED DATABASE DETECTED - TESTS BLOCKED 🚨                   ║\n" +
        "╠══════════════════════════════════════════════════════════════════════╣\n" +
        "║  Your DATABASE_URL points to a protected database:                   ║\n" +
        `║  ${dbUrl.substring(0, 60)}...\n` +
        "║                                                                      ║\n" +
        "║  Tests can DELETE ALL DATA. This protection prevents data loss.     ║\n" +
        "║                                                                      ║\n" +
        "║  SOLUTION: Use a dedicated test database:                            ║\n" +
        "║  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nuvana_test\n" +
        "║                                                                      ║\n" +
        "║  To create the test database:                                        ║\n" +
        "║  docker exec nuvana-postgres-1 createdb -U postgres nuvana_test      ║\n" +
        "╚══════════════════════════════════════════════════════════════════════╝\n",
    );
  }

  if (!isAllowedTestDb) {
    throw new Error(
      "\n" +
        "╔══════════════════════════════════════════════════════════════════════╗\n" +
        "║  ⚠️  UNRECOGNIZED DATABASE - TESTS BLOCKED ⚠️                        ║\n" +
        "╠══════════════════════════════════════════════════════════════════════╣\n" +
        "║  DATABASE_URL must contain 'test' to confirm it's a test database.  ║\n" +
        "║                                                                      ║\n" +
        "║  Current: " +
        dbUrl.substring(0, 55) +
        "...\n" +
        "║                                                                      ║\n" +
        "║  Allowed patterns: nuvana_test, *_test, *_test_*, test_db            ║\n" +
        "╚══════════════════════════════════════════════════════════════════════╝\n",
    );
  }

  // Log confirmation for visibility
  console.log(
    `✅ Test database validated: ${dbUrl.replace(/:[^:@]+@/, ":****@")}`,
  );
}

validateDatabaseUrl();

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
