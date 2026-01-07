/**
 * Unit Tests for Business Date Formatting Utilities
 *
 * ============================================================================
 * TRACEABILITY MATRIX
 * ============================================================================
 *
 * | Test Suite                      | Function Under Test              | Requirement                |
 * |---------------------------------|----------------------------------|----------------------------|
 * | isValidBusinessDate             | isValidBusinessDate()            | SEC-014: INPUT_VALIDATION  |
 * | formatBusinessDate              | formatBusinessDate()             | FE-005: UI_SECURITY        |
 * | formatBusinessDateFull          | formatBusinessDateFull()         | FE-005: UI_SECURITY        |
 * | formatBusinessDateShort         | formatBusinessDateShort()        | FE-005: UI_SECURITY        |
 * | formatBusinessDateCompact       | formatBusinessDateCompact()      | FE-005: UI_SECURITY        |
 * | extractDayFromBusinessDate      | extractDayFromBusinessDate()     | FE-005: UI_SECURITY        |
 * | getTodayBusinessDate            | getTodayBusinessDate()           | API-003: ERROR_HANDLING    |
 * | isBusinessDateToday             | isBusinessDateToday()            | SEC-014: INPUT_VALIDATION  |
 * | compareBusinessDates            | compareBusinessDates()           | SEC-014: INPUT_VALIDATION  |
 * | extractBusinessDateFromTimestamp| extractBusinessDateFromTimestamp()| DB-006: TENANT_ISOLATION  |
 * | Edge Cases                      | All functions                    | API-003: ERROR_HANDLING    |
 * | Security                        | All functions                    | SEC-004: XSS               |
 *
 * ============================================================================
 * TEST PYRAMID COMPLIANCE
 * ============================================================================
 *
 * This file implements UNIT TESTS (base of pyramid):
 * - Fast execution (< 1ms per test)
 * - No external dependencies (pure functions)
 * - High coverage of edge cases
 * - Isolated, deterministic, repeatable
 *
 * Integration tests for the useDateFormat hook are in a separate file.
 *
 * ============================================================================
 * BUG DOCUMENTATION
 * ============================================================================
 *
 * These tests document and prevent regression of the "off-by-one day" bug:
 *
 * PROBLEM:
 *   new Date("2026-01-06") → 2026-01-06T00:00:00.000Z (UTC midnight)
 *   When displayed in EST (UTC-5): January 5, 2026 at 7:00 PM
 *
 * SOLUTION:
 *   formatBusinessDate() treats input as local noon, not UTC midnight
 *   Result: "2026-01-06" always displays as "January 6, 2026"
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isValidBusinessDate,
  formatBusinessDate,
  formatBusinessDateFull,
  formatBusinessDateShort,
  formatBusinessDateCompact,
  getTodayBusinessDate,
  isBusinessDateToday,
  compareBusinessDates,
  extractBusinessDateFromTimestamp,
  extractDayFromBusinessDate,
} from "../../../src/utils/date-format.utils";

// ============================================================================
// TEST CONSTANTS
// ============================================================================

/**
 * Standard IANA timezone identifiers for testing
 * These represent common US store timezones
 */
const TIMEZONES = {
  NEW_YORK: "America/New_York", // UTC-5 (EST) / UTC-4 (EDT)
  CHICAGO: "America/Chicago", // UTC-6 (CST) / UTC-5 (CDT)
  DENVER: "America/Denver", // UTC-7 (MST) / UTC-6 (MDT)
  LOS_ANGELES: "America/Los_Angeles", // UTC-8 (PST) / UTC-7 (PDT)
  TOKYO: "Asia/Tokyo", // UTC+9 (no DST)
  UTC: "UTC",
} as const;

/**
 * Valid business date samples for testing
 * All in YYYY-MM-DD format as stored in database
 */
const VALID_DATES = {
  STANDARD: "2026-01-06",
  LEAP_DAY: "2024-02-29",
  YEAR_START: "2026-01-01",
  YEAR_END: "2025-12-31",
  MONTH_START: "2026-02-01",
  MONTH_END: "2026-01-31",
} as const;

/**
 * Invalid date inputs for security and validation testing
 */
const INVALID_INPUTS = {
  // Format violations
  WRONG_FORMAT_US: "01-06-2026",
  WRONG_FORMAT_EU: "06/01/2026",
  WRONG_FORMAT_UNPADDED: "2026-1-6",
  WRONG_FORMAT_PARTIAL: "2026-01",
  WRONG_FORMAT_TIMESTAMP: "2026-01-06T12:00:00Z",

  // Semantic violations (format OK, date doesn't exist)
  INVALID_MONTH: "2026-13-01",
  INVALID_DAY: "2026-01-32",
  INVALID_FEB_DAY: "2026-02-30",
  NON_LEAP_FEB29: "2025-02-29",

  // Type violations
  EMPTY: "",
  WHITESPACE: "   ",
  NULL: null as unknown as string,
  UNDEFINED: undefined as unknown as string,
  NUMBER: 20260106 as unknown as string,
  OBJECT: { date: "2026-01-06" } as unknown as string,

  // Security-related inputs
  XSS_SCRIPT: "<script>alert('xss')</script>",
  SQL_INJECTION: "2026-01-06'; DROP TABLE shifts;--",
  UNICODE: "2026-01-06\u0000",
} as const;

// ============================================================================
// isValidBusinessDate() TESTS
// ============================================================================

describe("isValidBusinessDate", () => {
  describe("Valid Date Acceptance", () => {
    it("should accept standard YYYY-MM-DD format", () => {
      expect(isValidBusinessDate(VALID_DATES.STANDARD)).toBe(true);
    });

    it("should accept leap year Feb 29", () => {
      expect(isValidBusinessDate(VALID_DATES.LEAP_DAY)).toBe(true);
    });

    it("should accept year boundary dates", () => {
      expect(isValidBusinessDate(VALID_DATES.YEAR_START)).toBe(true);
      expect(isValidBusinessDate(VALID_DATES.YEAR_END)).toBe(true);
    });

    it("should accept month boundary dates", () => {
      expect(isValidBusinessDate(VALID_DATES.MONTH_START)).toBe(true);
      expect(isValidBusinessDate(VALID_DATES.MONTH_END)).toBe(true);
    });

    it("should accept all months", () => {
      for (let month = 1; month <= 12; month++) {
        const dateStr = `2026-${String(month).padStart(2, "0")}-15`;
        expect(isValidBusinessDate(dateStr)).toBe(true);
      }
    });

    it("should accept dates from different eras", () => {
      expect(isValidBusinessDate("2000-01-01")).toBe(true); // Y2K
      expect(isValidBusinessDate("1999-12-31")).toBe(true); // Pre-Y2K
      expect(isValidBusinessDate("2099-12-31")).toBe(true); // Future
    });
  });

  describe("Format Validation", () => {
    it("should reject US date format (MM-DD-YYYY)", () => {
      expect(isValidBusinessDate(INVALID_INPUTS.WRONG_FORMAT_US)).toBe(false);
    });

    it("should reject EU date format (DD/MM/YYYY)", () => {
      expect(isValidBusinessDate(INVALID_INPUTS.WRONG_FORMAT_EU)).toBe(false);
    });

    it("should reject unpadded dates (2026-1-6)", () => {
      expect(isValidBusinessDate(INVALID_INPUTS.WRONG_FORMAT_UNPADDED)).toBe(
        false,
      );
    });

    it("should reject partial dates (2026-01)", () => {
      expect(isValidBusinessDate(INVALID_INPUTS.WRONG_FORMAT_PARTIAL)).toBe(
        false,
      );
    });

    it("should reject ISO timestamps", () => {
      expect(isValidBusinessDate(INVALID_INPUTS.WRONG_FORMAT_TIMESTAMP)).toBe(
        false,
      );
    });
  });

  describe("Semantic Validation", () => {
    it("should reject invalid month (13)", () => {
      expect(isValidBusinessDate(INVALID_INPUTS.INVALID_MONTH)).toBe(false);
    });

    it("should reject invalid day (32)", () => {
      expect(isValidBusinessDate(INVALID_INPUTS.INVALID_DAY)).toBe(false);
    });

    it("should reject Feb 30 (impossible date)", () => {
      expect(isValidBusinessDate(INVALID_INPUTS.INVALID_FEB_DAY)).toBe(false);
    });

    it("should reject Feb 29 in non-leap year", () => {
      expect(isValidBusinessDate(INVALID_INPUTS.NON_LEAP_FEB29)).toBe(false);
    });

    it("should reject month 00", () => {
      expect(isValidBusinessDate("2026-00-15")).toBe(false);
    });

    it("should reject day 00", () => {
      expect(isValidBusinessDate("2026-01-00")).toBe(false);
    });
  });

  describe("Type Safety (SEC-014: INPUT_VALIDATION)", () => {
    it("should reject empty string", () => {
      expect(isValidBusinessDate(INVALID_INPUTS.EMPTY)).toBe(false);
    });

    it("should reject whitespace-only string", () => {
      expect(isValidBusinessDate(INVALID_INPUTS.WHITESPACE)).toBe(false);
    });

    it("should reject null", () => {
      expect(isValidBusinessDate(INVALID_INPUTS.NULL)).toBe(false);
    });

    it("should reject undefined", () => {
      expect(isValidBusinessDate(INVALID_INPUTS.UNDEFINED)).toBe(false);
    });

    it("should reject number", () => {
      expect(isValidBusinessDate(INVALID_INPUTS.NUMBER)).toBe(false);
    });

    it("should reject object", () => {
      expect(isValidBusinessDate(INVALID_INPUTS.OBJECT)).toBe(false);
    });
  });

  describe("Security Inputs (SEC-004: XSS Prevention)", () => {
    it("should reject XSS script tags", () => {
      expect(isValidBusinessDate(INVALID_INPUTS.XSS_SCRIPT)).toBe(false);
    });

    it("should reject SQL injection attempts", () => {
      expect(isValidBusinessDate(INVALID_INPUTS.SQL_INJECTION)).toBe(false);
    });

    it("should reject null byte injection", () => {
      expect(isValidBusinessDate(INVALID_INPUTS.UNICODE)).toBe(false);
    });
  });
});

// ============================================================================
// formatBusinessDate() TESTS
// ============================================================================

describe("formatBusinessDate", () => {
  describe("Core Formatting (Bug Prevention)", () => {
    /**
     * CRITICAL: This test verifies the main bug fix.
     * Before fix: "2026-01-06" → "January 5, 2026" (wrong!)
     * After fix:  "2026-01-06" → "January 6, 2026" (correct!)
     */
    it("should format 2026-01-06 as January 6, 2026 (not January 5)", () => {
      const result = formatBusinessDate("2026-01-06");
      expect(result).toBe("January 6, 2026");
      expect(result).not.toContain("January 5"); // Explicit bug regression check
    });

    it("should format dates correctly regardless of local timezone", () => {
      // These tests run in any timezone and should produce consistent results
      expect(formatBusinessDate("2026-01-01")).toBe("January 1, 2026");
      expect(formatBusinessDate("2026-06-15")).toBe("June 15, 2026");
      expect(formatBusinessDate("2026-12-31")).toBe("December 31, 2026");
    });

    it("should format leap day correctly", () => {
      expect(formatBusinessDate("2024-02-29")).toBe("February 29, 2024");
    });
  });

  describe("Custom Format Strings", () => {
    it("should support MMM d, yyyy format", () => {
      expect(formatBusinessDate("2026-01-06", "MMM d, yyyy")).toBe(
        "Jan 6, 2026",
      );
    });

    it("should support MM/dd/yyyy format", () => {
      expect(formatBusinessDate("2026-01-06", "MM/dd/yyyy")).toBe("01/06/2026");
    });

    it("should support EEEE, MMMM d, yyyy format (full with day)", () => {
      expect(formatBusinessDate("2026-01-06", "EEEE, MMMM d, yyyy")).toBe(
        "Tuesday, January 6, 2026",
      );
    });

    it("should support yyyy-MM-dd format (ISO)", () => {
      expect(formatBusinessDate("2026-01-06", "yyyy-MM-dd")).toBe("2026-01-06");
    });
  });

  describe("Fallback Behavior (API-003: ERROR_HANDLING)", () => {
    it("should return em-dash for null", () => {
      expect(formatBusinessDate(null)).toBe("—");
    });

    it("should return em-dash for undefined", () => {
      expect(formatBusinessDate(undefined)).toBe("—");
    });

    it("should return em-dash for empty string", () => {
      expect(formatBusinessDate("")).toBe("—");
    });

    it("should return original string for invalid format", () => {
      // Preserves data visibility while indicating error
      expect(formatBusinessDate("invalid-date")).toBe("invalid-date");
    });

    it("should return original string for wrong date format", () => {
      expect(formatBusinessDate("01-06-2026")).toBe("01-06-2026");
    });

    it("should never throw (DoS prevention)", () => {
      // These should all return gracefully without throwing
      expect(() => formatBusinessDate(null)).not.toThrow();
      expect(() => formatBusinessDate(undefined)).not.toThrow();
      expect(() => formatBusinessDate("")).not.toThrow();
      expect(() => formatBusinessDate("garbage")).not.toThrow();
      expect(() => formatBusinessDate(123 as unknown as string)).not.toThrow();
    });
  });

  describe("Security (SEC-004: XSS Prevention)", () => {
    it("should safely handle XSS attempts", () => {
      // Returns original (invalid) string, which React will escape
      const result = formatBusinessDate("<script>alert('xss')</script>");
      expect(result).toBe("<script>alert('xss')</script>");
      // The key is that it doesn't execute or process this as a date
    });

    it("should safely handle SQL injection attempts", () => {
      const result = formatBusinessDate("2026-01-06'; DROP TABLE shifts;--");
      expect(result).toBe("2026-01-06'; DROP TABLE shifts;--");
    });
  });
});

// ============================================================================
// formatBusinessDateFull() TESTS
// ============================================================================

describe("formatBusinessDateFull", () => {
  it("should include day of week", () => {
    expect(formatBusinessDateFull("2026-01-06")).toBe(
      "Tuesday, January 6, 2026",
    );
  });

  it("should handle weekend dates", () => {
    expect(formatBusinessDateFull("2026-01-10")).toBe(
      "Saturday, January 10, 2026",
    );
    expect(formatBusinessDateFull("2026-01-11")).toBe(
      "Sunday, January 11, 2026",
    );
  });

  it("should return em-dash for null", () => {
    expect(formatBusinessDateFull(null)).toBe("—");
  });
});

// ============================================================================
// formatBusinessDateShort() TESTS
// ============================================================================

describe("formatBusinessDateShort", () => {
  it("should use abbreviated month", () => {
    expect(formatBusinessDateShort("2026-01-06")).toBe("Jan 6, 2026");
  });

  it("should handle all months", () => {
    expect(formatBusinessDateShort("2026-01-15")).toBe("Jan 15, 2026");
    expect(formatBusinessDateShort("2026-06-15")).toBe("Jun 15, 2026");
    expect(formatBusinessDateShort("2026-12-15")).toBe("Dec 15, 2026");
  });

  it("should return em-dash for null", () => {
    expect(formatBusinessDateShort(null)).toBe("—");
  });
});

// ============================================================================
// formatBusinessDateCompact() TESTS
// ============================================================================

describe("formatBusinessDateCompact", () => {
  it("should use MM/DD/YYYY format", () => {
    expect(formatBusinessDateCompact("2026-01-06")).toBe("01/06/2026");
  });

  it("should zero-pad month and day", () => {
    expect(formatBusinessDateCompact("2026-01-06")).toBe("01/06/2026");
    expect(formatBusinessDateCompact("2026-12-25")).toBe("12/25/2026");
  });

  it("should return em-dash for null", () => {
    expect(formatBusinessDateCompact(null)).toBe("—");
  });
});

// ============================================================================
// getTodayBusinessDate() TESTS
// ============================================================================

describe("getTodayBusinessDate", () => {
  describe("Timezone-Aware Today Detection", () => {
    beforeEach(() => {
      // Mock Date to a specific time for deterministic tests
      // 2026-01-06 at 11:00 PM UTC (06:00 PM EST, next day 08:00 AM Tokyo)
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-06T23:00:00.000Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should return today in store timezone (New York)", () => {
      // 11 PM UTC = 6 PM EST on Jan 6
      const result = getTodayBusinessDate(TIMEZONES.NEW_YORK);
      expect(result).toBe("2026-01-06");
    });

    it("should return tomorrow in Tokyo timezone", () => {
      // 11 PM UTC = 8 AM JST on Jan 7
      const result = getTodayBusinessDate(TIMEZONES.TOKYO);
      expect(result).toBe("2026-01-07");
    });

    it("should return same day in UTC", () => {
      const result = getTodayBusinessDate(TIMEZONES.UTC);
      expect(result).toBe("2026-01-06");
    });

    it("should handle all US timezones consistently", () => {
      // All US timezones are behind UTC, so at 11 PM UTC they're all still Jan 6
      expect(getTodayBusinessDate(TIMEZONES.NEW_YORK)).toBe("2026-01-06"); // 6 PM
      expect(getTodayBusinessDate(TIMEZONES.CHICAGO)).toBe("2026-01-06"); // 5 PM
      expect(getTodayBusinessDate(TIMEZONES.DENVER)).toBe("2026-01-06"); // 4 PM
      expect(getTodayBusinessDate(TIMEZONES.LOS_ANGELES)).toBe("2026-01-06"); // 3 PM
    });
  });

  describe("Error Handling (API-003)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-06T12:00:00.000Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should fallback to UTC for empty timezone", () => {
      const result = getTodayBusinessDate("");
      expect(result).toBe("2026-01-06");
    });

    it("should fallback to UTC for invalid timezone", () => {
      const result = getTodayBusinessDate("Invalid/Timezone");
      expect(result).toBe("2026-01-06");
    });

    it("should never throw for any input", () => {
      expect(() => getTodayBusinessDate("")).not.toThrow();
      expect(() =>
        getTodayBusinessDate(null as unknown as string),
      ).not.toThrow();
      expect(() => getTodayBusinessDate("Not/A/Timezone")).not.toThrow();
    });
  });

  describe("Output Format", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-06T12:00:00.000Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should return YYYY-MM-DD format", () => {
      const result = getTodayBusinessDate(TIMEZONES.UTC);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("should be a valid business date", () => {
      const result = getTodayBusinessDate(TIMEZONES.NEW_YORK);
      expect(isValidBusinessDate(result)).toBe(true);
    });
  });
});

// ============================================================================
// isBusinessDateToday() TESTS
// ============================================================================

describe("isBusinessDateToday", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-06T23:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Correct Today Detection", () => {
    it("should return true for today in New York", () => {
      // 11 PM UTC = 6 PM EST on Jan 6
      expect(isBusinessDateToday("2026-01-06", TIMEZONES.NEW_YORK)).toBe(true);
    });

    it("should return false for yesterday in New York", () => {
      expect(isBusinessDateToday("2026-01-05", TIMEZONES.NEW_YORK)).toBe(false);
    });

    it("should return false for tomorrow in New York", () => {
      expect(isBusinessDateToday("2026-01-07", TIMEZONES.NEW_YORK)).toBe(false);
    });

    it("should return true for tomorrow in Tokyo (different day)", () => {
      // 11 PM UTC = 8 AM JST on Jan 7
      expect(isBusinessDateToday("2026-01-07", TIMEZONES.TOKYO)).toBe(true);
    });
  });

  describe("Input Validation (SEC-014)", () => {
    it("should return false for null date", () => {
      expect(isBusinessDateToday(null, TIMEZONES.NEW_YORK)).toBe(false);
    });

    it("should return false for undefined date", () => {
      expect(isBusinessDateToday(undefined, TIMEZONES.NEW_YORK)).toBe(false);
    });

    it("should return false for invalid date format", () => {
      expect(isBusinessDateToday("01-06-2026", TIMEZONES.NEW_YORK)).toBe(false);
    });

    it("should return false for empty date", () => {
      expect(isBusinessDateToday("", TIMEZONES.NEW_YORK)).toBe(false);
    });
  });
});

// ============================================================================
// compareBusinessDates() TESTS
// ============================================================================

describe("compareBusinessDates", () => {
  describe("Comparison Logic", () => {
    it("should return -1 when first date is earlier", () => {
      expect(compareBusinessDates("2026-01-05", "2026-01-06")).toBe(-1);
    });

    it("should return 0 when dates are equal", () => {
      expect(compareBusinessDates("2026-01-06", "2026-01-06")).toBe(0);
    });

    it("should return 1 when first date is later", () => {
      expect(compareBusinessDates("2026-01-07", "2026-01-06")).toBe(1);
    });

    it("should handle year boundaries", () => {
      expect(compareBusinessDates("2025-12-31", "2026-01-01")).toBe(-1);
      expect(compareBusinessDates("2026-01-01", "2025-12-31")).toBe(1);
    });

    it("should handle month boundaries", () => {
      expect(compareBusinessDates("2026-01-31", "2026-02-01")).toBe(-1);
      expect(compareBusinessDates("2026-02-01", "2026-01-31")).toBe(1);
    });
  });

  describe("Input Validation (SEC-014)", () => {
    it("should return null for null first date", () => {
      expect(compareBusinessDates(null, "2026-01-06")).toBe(null);
    });

    it("should return null for null second date", () => {
      expect(compareBusinessDates("2026-01-06", null)).toBe(null);
    });

    it("should return null for both dates null", () => {
      expect(compareBusinessDates(null, null)).toBe(null);
    });

    it("should return null for invalid first date", () => {
      expect(compareBusinessDates("invalid", "2026-01-06")).toBe(null);
    });

    it("should return null for invalid second date", () => {
      expect(compareBusinessDates("2026-01-06", "invalid")).toBe(null);
    });

    it("should return null for undefined dates", () => {
      expect(compareBusinessDates(undefined, "2026-01-06")).toBe(null);
      expect(compareBusinessDates("2026-01-06", undefined)).toBe(null);
    });
  });
});

// ============================================================================
// extractBusinessDateFromTimestamp() TESTS
// ============================================================================

describe("extractBusinessDateFromTimestamp", () => {
  describe("Timezone-Aware Extraction (DB-006: TENANT_ISOLATION)", () => {
    /**
     * This function is critical for multi-tenant isolation.
     * Each store sees dates in their local timezone.
     */
    it("should extract date in New York timezone", () => {
      // 10 PM UTC on Jan 6 = 5 PM EST on Jan 6
      const result = extractBusinessDateFromTimestamp(
        "2026-01-06T22:00:00Z",
        TIMEZONES.NEW_YORK,
      );
      expect(result).toBe("2026-01-06");
    });

    it("should extract next day for Tokyo timezone", () => {
      // 10 PM UTC on Jan 6 = 7 AM JST on Jan 7
      const result = extractBusinessDateFromTimestamp(
        "2026-01-06T22:00:00Z",
        TIMEZONES.TOKYO,
      );
      expect(result).toBe("2026-01-07");
    });

    it("should handle midnight boundary (just before)", () => {
      // 4:59 AM UTC = 11:59 PM EST (still Jan 5 in NY)
      const result = extractBusinessDateFromTimestamp(
        "2026-01-06T04:59:00Z",
        TIMEZONES.NEW_YORK,
      );
      expect(result).toBe("2026-01-05");
    });

    it("should handle midnight boundary (just after)", () => {
      // 5:00 AM UTC = 12:00 AM EST (now Jan 6 in NY)
      const result = extractBusinessDateFromTimestamp(
        "2026-01-06T05:00:00Z",
        TIMEZONES.NEW_YORK,
      );
      expect(result).toBe("2026-01-06");
    });

    it("should handle timestamps with milliseconds", () => {
      const result = extractBusinessDateFromTimestamp(
        "2026-01-06T22:00:00.123Z",
        TIMEZONES.NEW_YORK,
      );
      expect(result).toBe("2026-01-06");
    });

    it("should handle timestamps with timezone offset", () => {
      // 5 PM EST expressed with offset
      const result = extractBusinessDateFromTimestamp(
        "2026-01-06T17:00:00-05:00",
        TIMEZONES.NEW_YORK,
      );
      expect(result).toBe("2026-01-06");
    });
  });

  describe("Error Handling (API-003)", () => {
    it("should return null for null timestamp", () => {
      expect(extractBusinessDateFromTimestamp(null, TIMEZONES.NEW_YORK)).toBe(
        null,
      );
    });

    it("should return null for undefined timestamp", () => {
      expect(
        extractBusinessDateFromTimestamp(undefined, TIMEZONES.NEW_YORK),
      ).toBe(null);
    });

    it("should return null for empty timestamp", () => {
      expect(extractBusinessDateFromTimestamp("", TIMEZONES.NEW_YORK)).toBe(
        null,
      );
    });

    it("should return null for invalid timestamp", () => {
      expect(
        extractBusinessDateFromTimestamp("not-a-date", TIMEZONES.NEW_YORK),
      ).toBe(null);
    });

    it("should return null for empty timezone", () => {
      expect(extractBusinessDateFromTimestamp("2026-01-06T22:00:00Z", "")).toBe(
        null,
      );
    });

    it("should return null for invalid timezone", () => {
      // Invalid timezone should fail gracefully
      expect(
        extractBusinessDateFromTimestamp("2026-01-06T22:00:00Z", "Not/Valid"),
      ).toBe(null);
    });

    it("should never throw for any input", () => {
      expect(() =>
        extractBusinessDateFromTimestamp(null, TIMEZONES.NEW_YORK),
      ).not.toThrow();
      expect(() =>
        extractBusinessDateFromTimestamp("bad", "bad"),
      ).not.toThrow();
      expect(() =>
        extractBusinessDateFromTimestamp(
          123 as unknown as string,
          TIMEZONES.NEW_YORK,
        ),
      ).not.toThrow();
    });
  });

  describe("Output Format", () => {
    it("should return YYYY-MM-DD format", () => {
      const result = extractBusinessDateFromTimestamp(
        "2026-01-06T22:00:00Z",
        TIMEZONES.NEW_YORK,
      );
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("should return a valid business date", () => {
      const result = extractBusinessDateFromTimestamp(
        "2026-01-06T22:00:00Z",
        TIMEZONES.NEW_YORK,
      );
      expect(isValidBusinessDate(result!)).toBe(true);
    });
  });
});

// ============================================================================
// INTEGRATION BETWEEN FUNCTIONS
// ============================================================================

describe("Function Integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-06T22:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Round-Trip Consistency", () => {
    it("should maintain date consistency through format/validate cycle", () => {
      const original = "2026-01-06";

      // Validate
      expect(isValidBusinessDate(original)).toBe(true);

      // Format and verify still represents same date
      const formatted = formatBusinessDate(original, "yyyy-MM-dd");
      expect(formatted).toBe(original);
    });

    it("should produce consistent results between getTodayBusinessDate and isBusinessDateToday", () => {
      const today = getTodayBusinessDate(TIMEZONES.NEW_YORK);
      expect(isBusinessDateToday(today, TIMEZONES.NEW_YORK)).toBe(true);
    });

    it("should produce valid dates from extractBusinessDateFromTimestamp", () => {
      const extracted = extractBusinessDateFromTimestamp(
        "2026-01-06T22:00:00Z",
        TIMEZONES.NEW_YORK,
      );
      expect(isValidBusinessDate(extracted!)).toBe(true);

      // Formatting should work on extracted date
      const formatted = formatBusinessDate(extracted);
      expect(formatted).toBe("January 6, 2026");
    });
  });

  describe("Cross-Timezone Consistency", () => {
    it("should format the same date identically regardless of extraction timezone", () => {
      // Same timestamp, different timezones produce different dates
      const nyDate = extractBusinessDateFromTimestamp(
        "2026-01-06T22:00:00Z",
        TIMEZONES.NEW_YORK,
      );
      const tokyoDate = extractBusinessDateFromTimestamp(
        "2026-01-06T22:00:00Z",
        TIMEZONES.TOKYO,
      );

      // Different dates extracted
      expect(nyDate).toBe("2026-01-06");
      expect(tokyoDate).toBe("2026-01-07");

      // But formatting is consistent per date
      expect(formatBusinessDate(nyDate)).toBe("January 6, 2026");
      expect(formatBusinessDate(tokyoDate)).toBe("January 7, 2026");
    });
  });
});

// ============================================================================
// REGRESSION TESTS
// ============================================================================

describe("Regression Tests", () => {
  describe("BUG: Off-by-one day display", () => {
    /**
     * Documents the original bug that this utility fixes.
     * The bug occurred because new Date("YYYY-MM-DD") interprets
     * the date as UTC midnight, which when displayed in US timezones
     * shifts back to the previous day.
     */
    it("should display correct date for 2026-01-06 (the bug case)", () => {
      const result = formatBusinessDate("2026-01-06");
      expect(result).toBe("January 6, 2026");
      expect(result).not.toContain("5"); // No "5" anywhere in output
    });

    it("should display correct date for dates near year boundary", () => {
      // Jan 1 should not show as Dec 31
      expect(formatBusinessDate("2026-01-01")).toBe("January 1, 2026");
      expect(formatBusinessDate("2026-01-01")).not.toContain("December");
    });

    it("should display correct date for leap day", () => {
      // Feb 29 should not show as Feb 28
      expect(formatBusinessDate("2024-02-29")).toBe("February 29, 2024");
      expect(formatBusinessDate("2024-02-29")).not.toContain("28");
    });
  });

  describe("BUG: Today detection in store timezone", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // Set to a time where UTC and EST have different dates
      vi.setSystemTime(new Date("2026-01-07T03:00:00.000Z")); // 3 AM UTC = 10 PM EST Jan 6
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should detect today correctly in store timezone, not UTC", () => {
      // At 3 AM UTC on Jan 7, it's still 10 PM on Jan 6 in New York
      expect(getTodayBusinessDate(TIMEZONES.NEW_YORK)).toBe("2026-01-06");
      expect(getTodayBusinessDate(TIMEZONES.UTC)).toBe("2026-01-07");

      // isBusinessDateToday should use store timezone
      expect(isBusinessDateToday("2026-01-06", TIMEZONES.NEW_YORK)).toBe(true);
      expect(isBusinessDateToday("2026-01-07", TIMEZONES.NEW_YORK)).toBe(false);
    });
  });

  describe("BUG: Calendar day extraction in daily reports (Fixed 2026-01-06)", () => {
    /**
     * Documents the bug in reports/daily/page.tsx line 194.
     *
     * PROBLEM:
     *   const dayNumber = new Date("2026-01-06").getDate();
     *   → Returns 5 in US timezones (wrong!)
     *
     * SOLUTION:
     *   const dayNumber = extractDayFromBusinessDate("2026-01-06") ?? 1;
     *   → Returns 6 (correct!)
     */
    it("should extract correct day for 2026-01-06 (the bug case)", () => {
      const result = extractDayFromBusinessDate("2026-01-06");
      expect(result).toBe(6);
      expect(result).not.toBe(5); // Explicit bug regression check
    });

    it("should extract correct day for dates near year boundary", () => {
      // Jan 1 should not extract as 31
      expect(extractDayFromBusinessDate("2026-01-01")).toBe(1);
      expect(extractDayFromBusinessDate("2025-12-31")).toBe(31);
    });

    it("should extract correct day for leap day", () => {
      // Feb 29 should not extract as 28
      expect(extractDayFromBusinessDate("2024-02-29")).toBe(29);
    });
  });
});

// ============================================================================
// extractDayFromBusinessDate() TESTS
// ============================================================================

describe("extractDayFromBusinessDate", () => {
  describe("Core Day Extraction (Bug Prevention)", () => {
    /**
     * CRITICAL: This test verifies the main bug fix for daily/page.tsx.
     * Before fix: new Date("2026-01-06").getDate() → 5 (wrong in US timezones!)
     * After fix:  extractDayFromBusinessDate("2026-01-06") → 6 (correct!)
     */
    it("should extract day 6 from 2026-01-06 (not day 5)", () => {
      const result = extractDayFromBusinessDate("2026-01-06");
      expect(result).toBe(6);
      expect(result).not.toBe(5); // Explicit bug regression check
    });

    it("should extract days correctly regardless of local timezone", () => {
      // These tests run in any timezone and should produce consistent results
      expect(extractDayFromBusinessDate("2026-01-01")).toBe(1);
      expect(extractDayFromBusinessDate("2026-01-15")).toBe(15);
      expect(extractDayFromBusinessDate("2026-01-31")).toBe(31);
    });

    it("should extract day from first of month correctly", () => {
      expect(extractDayFromBusinessDate("2026-01-01")).toBe(1);
      expect(extractDayFromBusinessDate("2026-06-01")).toBe(1);
      expect(extractDayFromBusinessDate("2026-12-01")).toBe(1);
    });

    it("should extract day from last of month correctly", () => {
      expect(extractDayFromBusinessDate("2026-01-31")).toBe(31);
      expect(extractDayFromBusinessDate("2026-02-28")).toBe(28);
      expect(extractDayFromBusinessDate("2024-02-29")).toBe(29); // Leap year
      expect(extractDayFromBusinessDate("2026-04-30")).toBe(30);
    });

    it("should extract all days of a month correctly", () => {
      // Test every day in January 2026
      for (let day = 1; day <= 31; day++) {
        const dateStr = `2026-01-${String(day).padStart(2, "0")}`;
        expect(extractDayFromBusinessDate(dateStr)).toBe(day);
      }
    });
  });

  describe("Edge Cases (API-003: ERROR_HANDLING)", () => {
    it("should return null for null input", () => {
      expect(extractDayFromBusinessDate(null)).toBe(null);
    });

    it("should return null for undefined input", () => {
      expect(extractDayFromBusinessDate(undefined)).toBe(null);
    });

    it("should return null for empty string", () => {
      expect(extractDayFromBusinessDate("")).toBe(null);
    });

    it("should return null for invalid format (US date)", () => {
      expect(extractDayFromBusinessDate("01-06-2026")).toBe(null);
    });

    it("should return null for invalid format (EU date)", () => {
      expect(extractDayFromBusinessDate("06/01/2026")).toBe(null);
    });

    it("should return null for unpadded dates", () => {
      expect(extractDayFromBusinessDate("2026-1-6")).toBe(null);
    });

    it("should return null for ISO timestamp (not business date)", () => {
      expect(extractDayFromBusinessDate("2026-01-06T12:00:00Z")).toBe(null);
    });

    it("should return null for invalid semantic date (Feb 30)", () => {
      expect(extractDayFromBusinessDate("2026-02-30")).toBe(null);
    });

    it("should return null for non-leap year Feb 29", () => {
      expect(extractDayFromBusinessDate("2025-02-29")).toBe(null);
    });

    it("should never throw for any input (DoS prevention)", () => {
      expect(() => extractDayFromBusinessDate(null)).not.toThrow();
      expect(() => extractDayFromBusinessDate(undefined)).not.toThrow();
      expect(() => extractDayFromBusinessDate("")).not.toThrow();
      expect(() => extractDayFromBusinessDate("garbage")).not.toThrow();
      expect(() =>
        extractDayFromBusinessDate(123 as unknown as string),
      ).not.toThrow();
      expect(() =>
        extractDayFromBusinessDate({} as unknown as string),
      ).not.toThrow();
    });
  });

  describe("Type Safety (SEC-014: INPUT_VALIDATION)", () => {
    it("should return null for number input", () => {
      expect(extractDayFromBusinessDate(20260106 as unknown as string)).toBe(
        null,
      );
    });

    it("should return null for object input", () => {
      expect(
        extractDayFromBusinessDate({ date: "2026-01-06" } as unknown as string),
      ).toBe(null);
    });

    it("should return null for array input", () => {
      expect(
        extractDayFromBusinessDate(["2026-01-06"] as unknown as string),
      ).toBe(null);
    });

    it("should return null for boolean input", () => {
      expect(extractDayFromBusinessDate(true as unknown as string)).toBe(null);
    });
  });

  describe("Security (SEC-004: XSS Prevention)", () => {
    it("should return null for XSS script tags", () => {
      expect(extractDayFromBusinessDate("<script>alert('xss')</script>")).toBe(
        null,
      );
    });

    it("should return null for SQL injection attempts", () => {
      expect(
        extractDayFromBusinessDate("2026-01-06'; DROP TABLE shifts;--"),
      ).toBe(null);
    });

    it("should return null for null byte injection", () => {
      expect(extractDayFromBusinessDate("2026-01-06\u0000")).toBe(null);
    });

    it("should return null for Unicode manipulation attempts", () => {
      expect(extractDayFromBusinessDate("2026\u200B-01-06")).toBe(null);
    });
  });

  describe("Timezone Invariance (Critical for Calendar Display)", () => {
    /**
     * The extractDayFromBusinessDate function must return the same day
     * regardless of the browser's timezone setting. This is critical for
     * calendar displays where day 6 must always show as "6" in the grid.
     */
    it("should return consistent day for dates near midnight boundaries", () => {
      // These are the problematic dates when using new Date()
      const problematicDates = [
        "2026-01-01", // Year start (often shifts to Dec 31)
        "2026-01-06", // The original bug case
        "2026-06-01", // Summer (DST may affect)
        "2026-12-31", // Year end
      ];

      const expectedDays = [1, 6, 1, 31];

      problematicDates.forEach((date, index) => {
        expect(extractDayFromBusinessDate(date)).toBe(expectedDays[index]);
      });
    });

    it("should handle all days correctly for business date sequence", () => {
      // Simulate a week of business dates
      const weekDates = [
        "2026-01-05", // Monday
        "2026-01-06", // Tuesday
        "2026-01-07", // Wednesday
        "2026-01-08", // Thursday
        "2026-01-09", // Friday
        "2026-01-10", // Saturday
        "2026-01-11", // Sunday
      ];

      weekDates.forEach((date, index) => {
        expect(extractDayFromBusinessDate(date)).toBe(5 + index);
      });
    });
  });

  describe("Calendar Display Integration", () => {
    /**
     * Tests that simulate how the function is used in daily/page.tsx
     * for rendering calendar day numbers.
     */
    it("should support fallback pattern used in daily/page.tsx", () => {
      // The pattern: extractDayFromBusinessDate(date) ?? 1
      const validDate = extractDayFromBusinessDate("2026-01-15") ?? 1;
      expect(validDate).toBe(15);

      const invalidDate = extractDayFromBusinessDate("invalid") ?? 1;
      expect(invalidDate).toBe(1); // Fallback to 1
    });

    it("should work with calendar grid date strings", () => {
      // Simulate generating calendar grid dates as done in daily/page.tsx
      const generateCalendarDates = (year: number, month: number) => {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        return Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        });
      };

      // Test January 2026
      const janDates = generateCalendarDates(2026, 0);
      expect(janDates.length).toBe(31);

      janDates.forEach((date, index) => {
        const dayNumber = extractDayFromBusinessDate(date);
        expect(dayNumber).toBe(index + 1);
      });
    });
  });
});
