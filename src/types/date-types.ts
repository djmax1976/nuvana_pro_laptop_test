/**
 * Date Type System - Branded Types for Type-Safe Date Handling
 *
 * This module provides TypeScript branded types to distinguish between:
 * - BusinessDate: Conceptual day identifiers (YYYY-MM-DD) - NO timezone conversion
 * - ISOTimestamp: Exact moments in time (ISO 8601) - REQUIRES timezone conversion
 *
 * Problem Solved:
 * JavaScript's `new Date("2026-01-06")` interprets date-only strings as UTC midnight,
 * which displays as the WRONG date when converted to local time (e.g., Jan 5 instead of Jan 6).
 *
 * Solution:
 * - Use `BusinessDate` type for database fields like `business_date`
 * - Use `ISOTimestamp` type for fields like `opened_at`, `closed_at`
 * - Type guards validate at runtime; branded types enforce at compile-time
 *
 * Enterprise Standards:
 * - SEC-014: INPUT_VALIDATION - All inputs validated before processing
 * - API-011: SCHEMA_VALIDATION - Strict type constraints with format validation
 * - FE-002: FORM_VALIDATION - Mirror validation on frontend
 *
 * @see nuvana_docs/plans/time-fix.md for full architecture documentation
 */

// =============================================================================
// BRANDED TYPE DEFINITIONS
// =============================================================================

/**
 * Unique symbol for BusinessDate brand.
 * Not exported to prevent external type manipulation.
 */
declare const BusinessDateBrand: unique symbol;

/**
 * Unique symbol for ISOTimestamp brand.
 * Not exported to prevent external type manipulation.
 */
declare const ISOTimestampBrand: unique symbol;

/**
 * Branded type for business dates (YYYY-MM-DD).
 *
 * Business dates represent conceptual day identifiers, NOT specific moments in time.
 * They should be displayed AS-IS without timezone conversion.
 *
 * Database fields using this type:
 * - `day_summaries.business_date`
 * - `lottery_day_close.business_date`
 * - Any `*_date` field representing a business day
 *
 * @example
 * const date: BusinessDate = assertBusinessDate("2026-01-06");
 * formatBusinessDate(date); // "January 6, 2026" - CORRECT!
 *
 * // This would be a type error without assertion:
 * const badDate: BusinessDate = "2026-01-06"; // Error: string is not BusinessDate
 */
export type BusinessDate = string & { readonly [BusinessDateBrand]: true };

/**
 * Branded type for ISO 8601 timestamps.
 *
 * ISO timestamps represent exact moments in time and MUST be converted
 * to the store's timezone before display.
 *
 * Database fields using this type:
 * - `shifts.opened_at`, `shifts.closed_at`
 * - `transactions.created_at`
 * - Any `*_at` field representing a point in time
 *
 * @example
 * const timestamp: ISOTimestamp = assertISOTimestamp("2026-01-06T22:05:45Z");
 * formatDateTime(timestamp, "America/New_York"); // "Jan 6, 2026 5:05 PM EST"
 */
export type ISOTimestamp = string & { readonly [ISOTimestampBrand]: true };

// =============================================================================
// VALIDATION PATTERNS
// =============================================================================

/**
 * Regular expression for YYYY-MM-DD business date format.
 *
 * Validates:
 * - 4-digit year (1000-9999)
 * - 2-digit month (01-12)
 * - 2-digit day (01-31)
 *
 * Note: Semantic validation (e.g., Feb 30 doesn't exist) is done separately.
 */
const BUSINESS_DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * Regular expression for ISO 8601 timestamp format.
 *
 * Validates common ISO 8601 formats:
 * - 2026-01-06T22:05:45Z (UTC)
 * - 2026-01-06T22:05:45.123Z (with milliseconds)
 * - 2026-01-06T22:05:45+05:00 (with timezone offset)
 * - 2026-01-06T22:05:45-05:00 (with negative offset)
 *
 * Does NOT validate semantic correctness (month/day ranges).
 */
const ISO_TIMESTAMP_PATTERN =
  // eslint-disable-next-line security/detect-unsafe-regex -- Intentional complex regex for ISO 8601 validation
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,6})?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/;

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Type guard to check if a value is a valid BusinessDate format.
 *
 * Performs both format validation and semantic validation:
 * 1. Checks YYYY-MM-DD format
 * 2. Verifies the date actually exists (catches Feb 31, etc.)
 *
 * Security: Returns false for null/undefined/non-string - never throws.
 *
 * @param value - Value to validate
 * @returns True if value is a valid business date string
 *
 * @example
 * if (isBusinessDate(input)) {
 *   // TypeScript now knows `input` is BusinessDate
 *   const formatted = formatBusinessDate(input);
 * }
 *
 * @example
 * isBusinessDate("2026-01-06");   // true
 * isBusinessDate("2026-02-31");   // false (invalid day)
 * isBusinessDate("01-06-2026");   // false (wrong format)
 * isBusinessDate("2026-1-6");     // false (not zero-padded)
 * isBusinessDate(null);           // false
 * isBusinessDate(undefined);      // false
 * isBusinessDate(12345);          // false
 */
export function isBusinessDate(value: unknown): value is BusinessDate {
  // Null/undefined check
  if (value == null) {
    return false;
  }

  // Type check
  if (typeof value !== "string") {
    return false;
  }

  // Empty string check
  if (value.length === 0) {
    return false;
  }

  // Format validation (fast path rejection)
  if (!BUSINESS_DATE_PATTERN.test(value)) {
    return false;
  }

  // Semantic validation - verify the date actually exists
  // Parse with noon to avoid any timezone edge cases
  const parsed = new Date(value + "T12:00:00");

  // Check if parsing produced a valid date
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  // Reconstruct the date to verify it matches input
  // This catches invalid dates like 2026-02-31 (which would parse as 2026-03-03)
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const reconstructed = `${year}-${month}-${day}`;

  return reconstructed === value;
}

/**
 * Type guard to check if a value is a valid ISOTimestamp format.
 *
 * Validates ISO 8601 format with time component and timezone indicator.
 *
 * Security: Returns false for null/undefined/non-string - never throws.
 *
 * @param value - Value to validate
 * @returns True if value is a valid ISO timestamp string
 *
 * @example
 * if (isISOTimestamp(input)) {
 *   // TypeScript now knows `input` is ISOTimestamp
 *   const formatted = formatDateTime(input, timezone);
 * }
 *
 * @example
 * isISOTimestamp("2026-01-06T22:05:45Z");        // true
 * isISOTimestamp("2026-01-06T22:05:45.123Z");    // true
 * isISOTimestamp("2026-01-06T22:05:45+05:00");   // true
 * isISOTimestamp("2026-01-06T22:05:45-05:00");   // true
 * isISOTimestamp("2026-01-06");                  // false (no time)
 * isISOTimestamp("2026-01-06T22:05:45");         // false (no timezone)
 * isISOTimestamp(null);                          // false
 */
export function isISOTimestamp(value: unknown): value is ISOTimestamp {
  // Null/undefined check
  if (value == null) {
    return false;
  }

  // Type check
  if (typeof value !== "string") {
    return false;
  }

  // Empty string check
  if (value.length === 0) {
    return false;
  }

  // Format validation
  if (!ISO_TIMESTAMP_PATTERN.test(value)) {
    return false;
  }

  // Semantic validation - verify the timestamp is parseable
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return true;
}

// =============================================================================
// ASSERTION FUNCTIONS
// =============================================================================

/**
 * Error class for date type validation failures.
 *
 * Provides structured error information for debugging and logging.
 */
export class DateTypeValidationError extends Error {
  /** The invalid value that was provided */
  public readonly invalidValue: unknown;
  /** The expected type (BusinessDate or ISOTimestamp) */
  public readonly expectedType: "BusinessDate" | "ISOTimestamp";
  /** Timestamp when the error occurred */
  public readonly occurredAt: string;

  constructor(
    message: string,
    invalidValue: unknown,
    expectedType: "BusinessDate" | "ISOTimestamp",
  ) {
    super(message);
    this.name = "DateTypeValidationError";
    this.invalidValue = invalidValue;
    this.expectedType = expectedType;
    this.occurredAt = new Date().toISOString();

    // Maintains proper stack trace for where error was thrown (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DateTypeValidationError);
    }
  }
}

/**
 * Asserts that a value is a valid BusinessDate and returns it as a branded type.
 *
 * Use this at API boundaries and data entry points to convert raw strings
 * to type-safe BusinessDate values.
 *
 * Security: Throws DateTypeValidationError for invalid input - handle appropriately.
 *
 * @param value - Value to validate and convert
 * @param fieldName - Optional field name for error messages
 * @returns The value as a BusinessDate branded type
 * @throws DateTypeValidationError if validation fails
 *
 * @example
 * // At API boundary
 * const businessDate = assertBusinessDate(req.query.date, "date");
 *
 * // In component
 * const businessDate = assertBusinessDate(daySummary.business_date);
 */
export function assertBusinessDate(
  value: unknown,
  fieldName: string = "value",
): BusinessDate {
  if (!isBusinessDate(value)) {
    const displayValue =
      value === null
        ? "null"
        : value === undefined
          ? "undefined"
          : typeof value === "string"
            ? `"${value.slice(0, 50)}${value.length > 50 ? "..." : ""}"`
            : String(value);

    throw new DateTypeValidationError(
      `Invalid BusinessDate for ${fieldName}: ${displayValue}. Expected format: YYYY-MM-DD (e.g., "2026-01-06")`,
      value,
      "BusinessDate",
    );
  }

  return value;
}

/**
 * Asserts that a value is a valid ISOTimestamp and returns it as a branded type.
 *
 * Use this at API boundaries and data entry points to convert raw strings
 * to type-safe ISOTimestamp values.
 *
 * Security: Throws DateTypeValidationError for invalid input - handle appropriately.
 *
 * @param value - Value to validate and convert
 * @param fieldName - Optional field name for error messages
 * @returns The value as an ISOTimestamp branded type
 * @throws DateTypeValidationError if validation fails
 *
 * @example
 * // At API boundary
 * const timestamp = assertISOTimestamp(req.body.opened_at, "opened_at");
 *
 * // In component
 * const timestamp = assertISOTimestamp(shift.opened_at);
 */
export function assertISOTimestamp(
  value: unknown,
  fieldName: string = "value",
): ISOTimestamp {
  if (!isISOTimestamp(value)) {
    const displayValue =
      value === null
        ? "null"
        : value === undefined
          ? "undefined"
          : typeof value === "string"
            ? `"${value.slice(0, 50)}${value.length > 50 ? "..." : ""}"`
            : String(value);

    throw new DateTypeValidationError(
      `Invalid ISOTimestamp for ${fieldName}: ${displayValue}. Expected ISO 8601 format with timezone (e.g., "2026-01-06T22:05:45Z")`,
      value,
      "ISOTimestamp",
    );
  }

  return value;
}

// =============================================================================
// SAFE CONVERSION FUNCTIONS (Return null instead of throwing)
// =============================================================================

/**
 * Safely converts a value to BusinessDate, returning null if invalid.
 *
 * Use this when you need to handle potentially invalid input gracefully
 * without try/catch blocks.
 *
 * @param value - Value to validate and convert
 * @returns BusinessDate if valid, null otherwise
 *
 * @example
 * const date = toBusinessDate(userInput);
 * if (date) {
 *   // Safe to use as BusinessDate
 *   formatBusinessDate(date);
 * } else {
 *   // Handle invalid input
 *   showError("Invalid date format");
 * }
 */
export function toBusinessDate(value: unknown): BusinessDate | null {
  return isBusinessDate(value) ? value : null;
}

/**
 * Safely converts a value to ISOTimestamp, returning null if invalid.
 *
 * Use this when you need to handle potentially invalid input gracefully
 * without try/catch blocks.
 *
 * @param value - Value to validate and convert
 * @returns ISOTimestamp if valid, null otherwise
 *
 * @example
 * const timestamp = toISOTimestamp(apiResponse.created_at);
 * if (timestamp) {
 *   // Safe to use as ISOTimestamp
 *   formatDateTime(timestamp, timezone);
 * } else {
 *   // Handle invalid input
 *   console.error("Invalid timestamp received from API");
 * }
 */
export function toISOTimestamp(value: unknown): ISOTimestamp | null {
  return isISOTimestamp(value) ? value : null;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Creates a BusinessDate from year, month, and day components.
 *
 * Validates the resulting date is real (catches Feb 31, etc.).
 *
 * @param year - 4-digit year
 * @param month - Month (1-12)
 * @param day - Day of month (1-31)
 * @returns BusinessDate if valid
 * @throws DateTypeValidationError if the date is invalid
 *
 * @example
 * const date = createBusinessDate(2026, 1, 6);
 * // Returns BusinessDate "2026-01-06"
 */
export function createBusinessDate(
  year: number,
  month: number,
  day: number,
): BusinessDate {
  // Validate numeric ranges first
  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    throw new DateTypeValidationError(
      `Invalid year: ${year}. Must be a 4-digit integer.`,
      { year, month, day },
      "BusinessDate",
    );
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new DateTypeValidationError(
      `Invalid month: ${month}. Must be 1-12.`,
      { year, month, day },
      "BusinessDate",
    );
  }

  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new DateTypeValidationError(
      `Invalid day: ${day}. Must be 1-31.`,
      { year, month, day },
      "BusinessDate",
    );
  }

  // Format the date string
  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  // Validate using our standard function (catches Feb 31, etc.)
  return assertBusinessDate(
    dateStr,
    `createBusinessDate(${year}, ${month}, ${day})`,
  );
}

/**
 * Gets today's date as a BusinessDate in the specified timezone.
 *
 * This is the correct way to determine "today" for business operations,
 * as it accounts for overnight shifts that span calendar days.
 *
 * @param timezone - IANA timezone string (e.g., "America/New_York")
 * @returns Today's BusinessDate in the specified timezone
 *
 * @example
 * // At 11 PM UTC on Jan 5, 2026:
 * getTodayAsBusinessDate("America/New_York");
 * // Returns "2026-01-05" (6 PM in NYC)
 *
 * getTodayAsBusinessDate("Asia/Tokyo");
 * // Returns "2026-01-06" (8 AM in Tokyo)
 */
export function getTodayAsBusinessDate(timezone: string): BusinessDate {
  // Import dynamically to avoid circular dependencies
  const { formatInTimeZone } = require("date-fns-tz");

  const dateStr = formatInTimeZone(new Date(), timezone, "yyyy-MM-dd");

  // This should always succeed since we're formatting a valid Date
  return assertBusinessDate(dateStr, "getTodayAsBusinessDate");
}

// =============================================================================
// TYPE NARROWING HELPERS
// =============================================================================

/**
 * Checks if a value looks like it might be a date string (either format).
 *
 * Useful for preliminary filtering before more expensive validation.
 *
 * @param value - Value to check
 * @returns True if the value looks like a date string
 */
export function looksLikeDateString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 10 &&
    value.length <= 30 &&
    /^\d{4}-/.test(value)
  );
}

/**
 * Determines the likely type of a date string.
 *
 * @param value - String to analyze
 * @returns The detected date type or "unknown"
 *
 * @example
 * detectDateType("2026-01-06");           // "BusinessDate"
 * detectDateType("2026-01-06T22:05:45Z"); // "ISOTimestamp"
 * detectDateType("not-a-date");           // "unknown"
 */
export function detectDateType(
  value: string,
): "BusinessDate" | "ISOTimestamp" | "unknown" {
  if (isBusinessDate(value)) {
    return "BusinessDate";
  }

  if (isISOTimestamp(value)) {
    return "ISOTimestamp";
  }

  return "unknown";
}
