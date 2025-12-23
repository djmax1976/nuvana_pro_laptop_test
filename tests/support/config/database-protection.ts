/**
 * Centralized Database Protection Configuration
 *
 * SINGLE SOURCE OF TRUTH for database validation across all test infrastructure.
 * This prevents inconsistencies between different test frameworks (Vitest, Playwright).
 *
 * POLICY:
 * - Production/staging databases are ALWAYS blocked (tests will crash immediately)
 * - Test database (nuvana_test) is the PRIMARY test database
 * - Dev database (nuvana_dev) is ALLOWED for local development testing
 *
 * This file is imported by:
 * - vitest-setup.ts (unit/component tests)
 * - global-setup.ts (Playwright global setup)
 * - global-teardown.ts (Playwright global teardown)
 * - All fixture files
 * - prisma-bypass.ts
 * - database-helpers.ts
 */

// =============================================================================
// BLOCKED DATABASES - Tests will CRASH if these are detected
// =============================================================================
// These patterns match production/staging databases that should NEVER be used
// for testing. If detected, tests fail immediately with a clear error message.
export const BLOCKED_DATABASE_PATTERNS: RegExp[] = [
  // Explicit production database names
  /nuvana_prod/i,
  /nuvana_production/i,
  /nuvana_staging/i,

  // Generic production patterns (suffix-based)
  /_prod$/i,
  /_production$/i,
  /_staging$/i,

  // Cloud provider production indicators
  /\.railway\.app/i, // Railway production URLs
  /supabase\.co/i, // Supabase production (if not local)
  /neon\.tech/i, // Neon production
  /\.rds\.amazonaws\.com/i, // AWS RDS
  /\.postgres\.database\.azure\.com/i, // Azure PostgreSQL
];

// =============================================================================
// ALLOWED TEST DATABASES - Safe for running tests
// =============================================================================
// These patterns match databases that are safe for testing.
// Tests can run destructive operations (cleanup, truncate, etc.) on these.
//
// STRICT: Only nuvana_test is allowed for testing.
// This protects both production AND development data.
export const ALLOWED_TEST_DATABASE_PATTERNS: RegExp[] = [
  // Primary test database - the ONLY allowed database
  /nuvana_test/i,
];

// =============================================================================
// VALIDATION RESULT TYPE
// =============================================================================
export type DatabaseValidationResult = {
  isValid: boolean;
  isBlocked: boolean;
  isAllowed: boolean;
  databaseUrl: string;
  maskedUrl: string;
  error?: string;
};

// =============================================================================
// VALIDATION FUNCTION
// =============================================================================
/**
 * Validates a database URL for test safety.
 *
 * @param dbUrl - The DATABASE_URL to validate (defaults to process.env.DATABASE_URL)
 * @returns Validation result with detailed information
 *
 * @example
 * const result = validateDatabaseForTests();
 * if (!result.isValid) {
 *   throw new Error(result.error);
 * }
 */
export function validateDatabaseForTests(
  dbUrl?: string,
): DatabaseValidationResult {
  const url = dbUrl ?? process.env.DATABASE_URL ?? "";
  const maskedUrl = url.replace(/:[^:@]+@/, ":****@");

  // Check if URL is empty
  if (!url) {
    return {
      isValid: false,
      isBlocked: false,
      isAllowed: false,
      databaseUrl: url,
      maskedUrl: "",
      error: formatMissingDatabaseError(),
    };
  }

  // Check if URL matches blocked patterns
  const isBlocked = BLOCKED_DATABASE_PATTERNS.some((pattern) =>
    pattern.test(url),
  );

  // Check if URL matches allowed patterns
  const isAllowed = ALLOWED_TEST_DATABASE_PATTERNS.some((pattern) =>
    pattern.test(url),
  );

  // Blocked databases are never valid, even if they match allowed patterns
  // (e.g., "nuvana_prod_test" matches both - blocked wins)
  if (isBlocked && !isAllowed) {
    return {
      isValid: false,
      isBlocked: true,
      isAllowed: false,
      databaseUrl: url,
      maskedUrl,
      error: formatBlockedDatabaseError(maskedUrl),
    };
  }

  // Must match at least one allowed pattern
  if (!isAllowed) {
    return {
      isValid: false,
      isBlocked: false,
      isAllowed: false,
      databaseUrl: url,
      maskedUrl,
      error: formatUnrecognizedDatabaseError(maskedUrl),
    };
  }

  // Valid - matches allowed pattern and not blocked
  return {
    isValid: true,
    isBlocked: false,
    isAllowed: true,
    databaseUrl: url,
    maskedUrl,
  };
}

// =============================================================================
// ASSERTION FUNCTION (throws on invalid)
// =============================================================================
/**
 * Asserts that the database URL is safe for testing.
 * Throws an error with a detailed message if validation fails.
 *
 * @param dbUrl - The DATABASE_URL to validate (defaults to process.env.DATABASE_URL)
 * @throws Error if database is not safe for testing
 *
 * @example
 * // At the top of test setup files:
 * assertDatabaseSafeForTests();
 */
export function assertDatabaseSafeForTests(dbUrl?: string): void {
  const result = validateDatabaseForTests(dbUrl);
  if (!result.isValid) {
    throw new Error(result.error);
  }
}

// =============================================================================
// SIMPLE CHECK FUNCTION (for guards/conditionals)
// =============================================================================
/**
 * Quick check if a database URL is safe for testing.
 * Does not throw - returns boolean.
 *
 * @param dbUrl - The DATABASE_URL to check (defaults to process.env.DATABASE_URL)
 * @returns true if safe for testing, false otherwise
 *
 * @example
 * if (!isDatabaseSafeForTests()) {
 *   console.warn('Skipping database cleanup - not a test database');
 *   return;
 * }
 */
export function isDatabaseSafeForTests(dbUrl?: string): boolean {
  return validateDatabaseForTests(dbUrl).isValid;
}

// =============================================================================
// LOGGING HELPER
// =============================================================================
/**
 * Logs confirmation that database is validated for testing.
 * Use this after successful validation for visibility in test output.
 *
 * @param dbUrl - The DATABASE_URL to log (defaults to process.env.DATABASE_URL)
 */
export function logDatabaseValidation(dbUrl?: string): void {
  const result = validateDatabaseForTests(dbUrl);
  if (result.isValid) {
    console.log(`✅ Test database validated: ${result.maskedUrl}`);
  }
}

// =============================================================================
// ERROR MESSAGE FORMATTERS
// =============================================================================
function formatMissingDatabaseError(): string {
  return `
╔══════════════════════════════════════════════════════════════════════╗
║  DATABASE_URL REQUIRED                                               ║
╠══════════════════════════════════════════════════════════════════════╣
║  Tests require DATABASE_URL pointing to a test database.             ║
║                                                                      ║
║  For local development, use one of:                                  ║
║  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nuvana_test
║  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nuvana_dev
║                                                                      ║
║  Run tests with npm scripts (DATABASE_URL is set automatically):    ║
║  npm run test:api                                                    ║
║  npm run test:unit                                                   ║
╚══════════════════════════════════════════════════════════════════════╝
`;
}

function formatBlockedDatabaseError(maskedUrl: string): string {
  return `
╔══════════════════════════════════════════════════════════════════════╗
║  🚨 PRODUCTION DATABASE DETECTED - TESTS BLOCKED 🚨                  ║
╠══════════════════════════════════════════════════════════════════════╣
║  DATABASE_URL points to a production/staging database:               ║
║  ${maskedUrl.substring(0, 60).padEnd(60)}...
║                                                                      ║
║  Tests can DELETE ALL DATA. This protection prevents data loss.     ║
║                                                                      ║
║  Use a test database instead:                                        ║
║  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nuvana_test
╚══════════════════════════════════════════════════════════════════════╝
`;
}

function formatUnrecognizedDatabaseError(maskedUrl: string): string {
  return `
╔══════════════════════════════════════════════════════════════════════╗
║  ⚠️  UNRECOGNIZED DATABASE - TESTS BLOCKED ⚠️                        ║
╠══════════════════════════════════════════════════════════════════════╣
║  DATABASE_URL does not match the allowed test database.              ║
║                                                                      ║
║  Current: ${maskedUrl.substring(0, 55).padEnd(55)}...
║                                                                      ║
║  ONLY ALLOWED DATABASE: nuvana_test                                  ║
║                                                                      ║
║  Set DATABASE_URL to:                                                ║
║  postgresql://postgres:postgres@localhost:5432/nuvana_test           ║
╚══════════════════════════════════════════════════════════════════════╝
`;
}
