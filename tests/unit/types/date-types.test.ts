/**
 * Unit Tests for Date Type System - Branded Types
 *
 * Tests the TypeScript branded types, type guards, and assertion functions
 * for BusinessDate and ISOTimestamp.
 *
 * Enterprise Standards:
 * - SEC-014: INPUT_VALIDATION - Tests validate all edge cases
 * - API-011: SCHEMA_VALIDATION - Tests verify format constraints
 *
 * @see src/types/date-types.ts
 * @see nuvana_docs/plans/time-fix.md
 */

import { describe, it, expect } from "vitest";
import {
  isBusinessDate,
  isISOTimestamp,
  assertBusinessDate,
  assertISOTimestamp,
  toBusinessDate,
  toISOTimestamp,
  createBusinessDate,
  detectDateType,
  looksLikeDateString,
  DateTypeValidationError,
  type BusinessDate,
  type ISOTimestamp,
} from "../../../src/types/date-types";

describe("date-types", () => {
  // ==========================================================================
  // isBusinessDate Type Guard
  // ==========================================================================
  describe("isBusinessDate", () => {
    describe("valid business dates", () => {
      it("should accept valid YYYY-MM-DD format", () => {
        expect(isBusinessDate("2026-01-06")).toBe(true);
        expect(isBusinessDate("2025-12-31")).toBe(true);
        expect(isBusinessDate("2000-01-01")).toBe(true);
        expect(isBusinessDate("1999-06-15")).toBe(true);
      });

      it("should accept boundary dates", () => {
        // First day of months
        expect(isBusinessDate("2026-01-01")).toBe(true);
        expect(isBusinessDate("2026-02-01")).toBe(true);
        expect(isBusinessDate("2026-12-01")).toBe(true);

        // Last day of months
        expect(isBusinessDate("2026-01-31")).toBe(true);
        expect(isBusinessDate("2026-04-30")).toBe(true);
        expect(isBusinessDate("2026-12-31")).toBe(true);
      });

      it("should accept leap year Feb 29", () => {
        expect(isBusinessDate("2024-02-29")).toBe(true);
        expect(isBusinessDate("2028-02-29")).toBe(true);
        expect(isBusinessDate("2000-02-29")).toBe(true);
      });
    });

    describe("invalid dates - wrong format", () => {
      it("should reject non-zero-padded dates", () => {
        expect(isBusinessDate("2026-1-06")).toBe(false);
        expect(isBusinessDate("2026-01-6")).toBe(false);
        expect(isBusinessDate("2026-1-6")).toBe(false);
      });

      it("should reject different date formats", () => {
        expect(isBusinessDate("01-06-2026")).toBe(false); // MM-DD-YYYY
        expect(isBusinessDate("06/01/2026")).toBe(false); // DD/MM/YYYY
        expect(isBusinessDate("2026/01/06")).toBe(false); // YYYY/MM/DD
        expect(isBusinessDate("Jan 6, 2026")).toBe(false); // Human readable
        expect(isBusinessDate("January 6, 2026")).toBe(false);
      });

      it("should reject dates with time components", () => {
        expect(isBusinessDate("2026-01-06T00:00:00")).toBe(false);
        expect(isBusinessDate("2026-01-06T00:00:00Z")).toBe(false);
        expect(isBusinessDate("2026-01-06T12:00:00+05:00")).toBe(false);
        expect(isBusinessDate("2026-01-06 00:00:00")).toBe(false);
      });

      it("should reject ISO timestamps", () => {
        expect(isBusinessDate("2026-01-06T22:05:45Z")).toBe(false);
        expect(isBusinessDate("2026-01-06T22:05:45.123Z")).toBe(false);
      });
    });

    describe("invalid dates - semantically wrong", () => {
      it("should reject invalid day of month", () => {
        expect(isBusinessDate("2026-01-32")).toBe(false);
        expect(isBusinessDate("2026-04-31")).toBe(false);
        expect(isBusinessDate("2026-06-31")).toBe(false);
        expect(isBusinessDate("2026-09-31")).toBe(false);
        expect(isBusinessDate("2026-11-31")).toBe(false);
      });

      it("should reject Feb 29 on non-leap years", () => {
        expect(isBusinessDate("2026-02-29")).toBe(false);
        expect(isBusinessDate("2025-02-29")).toBe(false);
        expect(isBusinessDate("2023-02-29")).toBe(false);
        expect(isBusinessDate("1900-02-29")).toBe(false); // Century rule
      });

      it("should reject Feb 30 and 31", () => {
        expect(isBusinessDate("2026-02-30")).toBe(false);
        expect(isBusinessDate("2026-02-31")).toBe(false);
        expect(isBusinessDate("2024-02-30")).toBe(false);
      });

      it("should reject invalid month", () => {
        expect(isBusinessDate("2026-00-15")).toBe(false);
        expect(isBusinessDate("2026-13-15")).toBe(false);
        expect(isBusinessDate("2026-99-15")).toBe(false);
      });

      it("should reject day 00", () => {
        expect(isBusinessDate("2026-01-00")).toBe(false);
      });
    });

    describe("invalid inputs - type errors", () => {
      it("should reject null and undefined", () => {
        expect(isBusinessDate(null)).toBe(false);
        expect(isBusinessDate(undefined)).toBe(false);
      });

      it("should reject non-string types", () => {
        expect(isBusinessDate(12345)).toBe(false);
        expect(isBusinessDate(20260106)).toBe(false);
        // eslint-disable-next-line no-restricted-syntax -- Testing type guard rejects Date objects
        expect(isBusinessDate(new Date("2026-01-06"))).toBe(false);
        expect(isBusinessDate({ date: "2026-01-06" })).toBe(false);
        expect(isBusinessDate(["2026-01-06"])).toBe(false);
        expect(isBusinessDate(true)).toBe(false);
      });

      it("should reject empty string", () => {
        expect(isBusinessDate("")).toBe(false);
      });

      it("should reject random strings", () => {
        expect(isBusinessDate("not-a-date")).toBe(false);
        expect(isBusinessDate("hello")).toBe(false);
        expect(isBusinessDate("2026")).toBe(false);
        expect(isBusinessDate("2026-01")).toBe(false);
      });
    });

    describe("type narrowing", () => {
      it("should narrow type to BusinessDate", () => {
        const input: unknown = "2026-01-06";

        if (isBusinessDate(input)) {
          // TypeScript should now know input is BusinessDate
          const businessDate: BusinessDate = input;
          expect(businessDate).toBe("2026-01-06");
        } else {
          // Should not reach here
          expect.fail("Should have been a valid business date");
        }
      });
    });
  });

  // ==========================================================================
  // isISOTimestamp Type Guard
  // ==========================================================================
  describe("isISOTimestamp", () => {
    describe("valid ISO timestamps", () => {
      it("should accept UTC timestamps (Z suffix)", () => {
        expect(isISOTimestamp("2026-01-06T22:05:45Z")).toBe(true);
        expect(isISOTimestamp("2026-01-06T00:00:00Z")).toBe(true);
        expect(isISOTimestamp("2026-12-31T23:59:59Z")).toBe(true);
      });

      it("should accept timestamps with milliseconds", () => {
        expect(isISOTimestamp("2026-01-06T22:05:45.123Z")).toBe(true);
        expect(isISOTimestamp("2026-01-06T22:05:45.1Z")).toBe(true);
        expect(isISOTimestamp("2026-01-06T22:05:45.123456Z")).toBe(true);
      });

      it("should accept positive timezone offsets", () => {
        expect(isISOTimestamp("2026-01-06T22:05:45+00:00")).toBe(true);
        expect(isISOTimestamp("2026-01-06T22:05:45+05:30")).toBe(true);
        expect(isISOTimestamp("2026-01-06T22:05:45+09:00")).toBe(true);
        expect(isISOTimestamp("2026-01-06T22:05:45+14:00")).toBe(true);
      });

      it("should accept negative timezone offsets", () => {
        expect(isISOTimestamp("2026-01-06T22:05:45-05:00")).toBe(true);
        expect(isISOTimestamp("2026-01-06T22:05:45-08:00")).toBe(true);
        expect(isISOTimestamp("2026-01-06T22:05:45-12:00")).toBe(true);
      });

      it("should accept boundary times", () => {
        expect(isISOTimestamp("2026-01-06T00:00:00Z")).toBe(true);
        expect(isISOTimestamp("2026-01-06T23:59:59Z")).toBe(true);
        expect(isISOTimestamp("2026-01-06T12:00:00Z")).toBe(true);
      });
    });

    describe("invalid timestamps - missing components", () => {
      it("should reject date-only strings", () => {
        expect(isISOTimestamp("2026-01-06")).toBe(false);
      });

      it("should reject timestamps without timezone", () => {
        expect(isISOTimestamp("2026-01-06T22:05:45")).toBe(false);
      });

      it("should reject timestamps with only date and T", () => {
        expect(isISOTimestamp("2026-01-06T")).toBe(false);
      });
    });

    describe("invalid timestamps - wrong format", () => {
      it("should reject space separator instead of T", () => {
        expect(isISOTimestamp("2026-01-06 22:05:45Z")).toBe(false);
      });

      it("should reject lowercase t", () => {
        expect(isISOTimestamp("2026-01-06t22:05:45Z")).toBe(false);
      });

      it("should reject lowercase z", () => {
        expect(isISOTimestamp("2026-01-06T22:05:45z")).toBe(false);
      });

      it("should reject invalid hours", () => {
        expect(isISOTimestamp("2026-01-06T24:00:00Z")).toBe(false);
        expect(isISOTimestamp("2026-01-06T25:05:45Z")).toBe(false);
      });

      it("should reject invalid minutes", () => {
        expect(isISOTimestamp("2026-01-06T22:60:00Z")).toBe(false);
        expect(isISOTimestamp("2026-01-06T22:99:45Z")).toBe(false);
      });

      it("should reject invalid seconds", () => {
        expect(isISOTimestamp("2026-01-06T22:05:60Z")).toBe(false);
        expect(isISOTimestamp("2026-01-06T22:05:99Z")).toBe(false);
      });
    });

    describe("invalid inputs - type errors", () => {
      it("should reject null and undefined", () => {
        expect(isISOTimestamp(null)).toBe(false);
        expect(isISOTimestamp(undefined)).toBe(false);
      });

      it("should reject non-string types", () => {
        expect(isISOTimestamp(12345)).toBe(false);
        expect(isISOTimestamp(new Date())).toBe(false);
        expect(isISOTimestamp({ timestamp: "2026-01-06T22:05:45Z" })).toBe(
          false,
        );
      });

      it("should reject empty string", () => {
        expect(isISOTimestamp("")).toBe(false);
      });
    });

    describe("type narrowing", () => {
      it("should narrow type to ISOTimestamp", () => {
        const input: unknown = "2026-01-06T22:05:45Z";

        if (isISOTimestamp(input)) {
          // TypeScript should now know input is ISOTimestamp
          const timestamp: ISOTimestamp = input;
          expect(timestamp).toBe("2026-01-06T22:05:45Z");
        } else {
          expect.fail("Should have been a valid ISO timestamp");
        }
      });
    });
  });

  // ==========================================================================
  // assertBusinessDate
  // ==========================================================================
  describe("assertBusinessDate", () => {
    describe("valid inputs", () => {
      it("should return BusinessDate for valid input", () => {
        const result = assertBusinessDate("2026-01-06");
        expect(result).toBe("2026-01-06");
      });

      it("should return the same string reference", () => {
        const input = "2026-01-06";
        const result = assertBusinessDate(input);
        expect(result).toBe(input);
      });
    });

    describe("invalid inputs", () => {
      it("should throw DateTypeValidationError for invalid format", () => {
        expect(() => assertBusinessDate("01-06-2026")).toThrow(
          DateTypeValidationError,
        );
        expect(() => assertBusinessDate("2026-01-06T00:00:00Z")).toThrow(
          DateTypeValidationError,
        );
      });

      it("should throw DateTypeValidationError for invalid date", () => {
        expect(() => assertBusinessDate("2026-02-30")).toThrow(
          DateTypeValidationError,
        );
      });

      it("should throw DateTypeValidationError for null", () => {
        expect(() => assertBusinessDate(null)).toThrow(DateTypeValidationError);
      });

      it("should throw DateTypeValidationError for undefined", () => {
        expect(() => assertBusinessDate(undefined)).toThrow(
          DateTypeValidationError,
        );
      });

      it("should throw DateTypeValidationError for non-string", () => {
        expect(() => assertBusinessDate(12345)).toThrow(
          DateTypeValidationError,
        );
      });

      it("should include field name in error message", () => {
        try {
          assertBusinessDate("invalid", "business_date");
          expect.fail("Should have thrown");
        } catch (error) {
          expect(error).toBeInstanceOf(DateTypeValidationError);
          expect((error as DateTypeValidationError).message).toContain(
            "business_date",
          );
        }
      });

      it("should include expected format in error message", () => {
        try {
          assertBusinessDate("invalid");
          expect.fail("Should have thrown");
        } catch (error) {
          expect(error).toBeInstanceOf(DateTypeValidationError);
          expect((error as DateTypeValidationError).message).toContain(
            "YYYY-MM-DD",
          );
        }
      });

      it("should truncate long invalid values in error message", () => {
        const longValue = "a".repeat(100);
        try {
          assertBusinessDate(longValue);
          expect.fail("Should have thrown");
        } catch (error) {
          expect(error).toBeInstanceOf(DateTypeValidationError);
          expect((error as DateTypeValidationError).message).toContain("...");
          expect(
            (error as DateTypeValidationError).message.length,
          ).toBeLessThan(200);
        }
      });
    });

    describe("error object properties", () => {
      it("should have correct error properties", () => {
        try {
          assertBusinessDate("invalid", "test_field");
          expect.fail("Should have thrown");
        } catch (error) {
          expect(error).toBeInstanceOf(DateTypeValidationError);
          const validationError = error as DateTypeValidationError;
          expect(validationError.invalidValue).toBe("invalid");
          expect(validationError.expectedType).toBe("BusinessDate");
          expect(validationError.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
          expect(validationError.name).toBe("DateTypeValidationError");
        }
      });
    });
  });

  // ==========================================================================
  // assertISOTimestamp
  // ==========================================================================
  describe("assertISOTimestamp", () => {
    describe("valid inputs", () => {
      it("should return ISOTimestamp for valid input", () => {
        const result = assertISOTimestamp("2026-01-06T22:05:45Z");
        expect(result).toBe("2026-01-06T22:05:45Z");
      });

      it("should accept various valid formats", () => {
        expect(assertISOTimestamp("2026-01-06T22:05:45.123Z")).toBe(
          "2026-01-06T22:05:45.123Z",
        );
        expect(assertISOTimestamp("2026-01-06T22:05:45+05:00")).toBe(
          "2026-01-06T22:05:45+05:00",
        );
      });
    });

    describe("invalid inputs", () => {
      it("should throw for date-only strings", () => {
        expect(() => assertISOTimestamp("2026-01-06")).toThrow(
          DateTypeValidationError,
        );
      });

      it("should throw for missing timezone", () => {
        expect(() => assertISOTimestamp("2026-01-06T22:05:45")).toThrow(
          DateTypeValidationError,
        );
      });

      it("should include field name in error message", () => {
        try {
          assertISOTimestamp("invalid", "opened_at");
          expect.fail("Should have thrown");
        } catch (error) {
          expect((error as DateTypeValidationError).message).toContain(
            "opened_at",
          );
        }
      });

      it("should have correct error properties", () => {
        try {
          assertISOTimestamp("invalid");
          expect.fail("Should have thrown");
        } catch (error) {
          const validationError = error as DateTypeValidationError;
          expect(validationError.expectedType).toBe("ISOTimestamp");
        }
      });
    });
  });

  // ==========================================================================
  // toBusinessDate (safe conversion)
  // ==========================================================================
  describe("toBusinessDate", () => {
    it("should return BusinessDate for valid input", () => {
      const result = toBusinessDate("2026-01-06");
      expect(result).toBe("2026-01-06");
    });

    it("should return null for invalid input", () => {
      expect(toBusinessDate("invalid")).toBeNull();
      expect(toBusinessDate("2026-01-06T00:00:00Z")).toBeNull();
      expect(toBusinessDate(null)).toBeNull();
      expect(toBusinessDate(undefined)).toBeNull();
      expect(toBusinessDate(12345)).toBeNull();
    });

    it("should never throw", () => {
      // These should all return null, not throw
      expect(() => toBusinessDate("invalid")).not.toThrow();
      expect(() => toBusinessDate(null)).not.toThrow();
      expect(() => toBusinessDate(undefined)).not.toThrow();
      expect(() => toBusinessDate({})).not.toThrow();
    });
  });

  // ==========================================================================
  // toISOTimestamp (safe conversion)
  // ==========================================================================
  describe("toISOTimestamp", () => {
    it("should return ISOTimestamp for valid input", () => {
      const result = toISOTimestamp("2026-01-06T22:05:45Z");
      expect(result).toBe("2026-01-06T22:05:45Z");
    });

    it("should return null for invalid input", () => {
      expect(toISOTimestamp("invalid")).toBeNull();
      expect(toISOTimestamp("2026-01-06")).toBeNull();
      expect(toISOTimestamp(null)).toBeNull();
    });

    it("should never throw", () => {
      expect(() => toISOTimestamp("invalid")).not.toThrow();
      expect(() => toISOTimestamp(null)).not.toThrow();
    });
  });

  // ==========================================================================
  // createBusinessDate
  // ==========================================================================
  describe("createBusinessDate", () => {
    it("should create valid business date from components", () => {
      expect(createBusinessDate(2026, 1, 6)).toBe("2026-01-06");
      expect(createBusinessDate(2026, 12, 31)).toBe("2026-12-31");
      expect(createBusinessDate(2000, 1, 1)).toBe("2000-01-01");
    });

    it("should zero-pad month and day", () => {
      expect(createBusinessDate(2026, 1, 1)).toBe("2026-01-01");
      expect(createBusinessDate(2026, 9, 5)).toBe("2026-09-05");
    });

    it("should throw for invalid year", () => {
      expect(() => createBusinessDate(999, 1, 1)).toThrow(
        DateTypeValidationError,
      );
      expect(() => createBusinessDate(10000, 1, 1)).toThrow(
        DateTypeValidationError,
      );
      expect(() => createBusinessDate(NaN, 1, 1)).toThrow(
        DateTypeValidationError,
      );
      expect(() => createBusinessDate(2026.5, 1, 1)).toThrow(
        DateTypeValidationError,
      );
    });

    it("should throw for invalid month", () => {
      expect(() => createBusinessDate(2026, 0, 1)).toThrow(
        DateTypeValidationError,
      );
      expect(() => createBusinessDate(2026, 13, 1)).toThrow(
        DateTypeValidationError,
      );
      expect(() => createBusinessDate(2026, -1, 1)).toThrow(
        DateTypeValidationError,
      );
    });

    it("should throw for invalid day", () => {
      expect(() => createBusinessDate(2026, 1, 0)).toThrow(
        DateTypeValidationError,
      );
      expect(() => createBusinessDate(2026, 1, 32)).toThrow(
        DateTypeValidationError,
      );
      expect(() => createBusinessDate(2026, 2, 30)).toThrow(
        DateTypeValidationError,
      );
    });

    it("should handle leap years correctly", () => {
      expect(createBusinessDate(2024, 2, 29)).toBe("2024-02-29");
      expect(() => createBusinessDate(2026, 2, 29)).toThrow(
        DateTypeValidationError,
      );
    });
  });

  // ==========================================================================
  // detectDateType
  // ==========================================================================
  describe("detectDateType", () => {
    it("should detect BusinessDate", () => {
      expect(detectDateType("2026-01-06")).toBe("BusinessDate");
      expect(detectDateType("2025-12-31")).toBe("BusinessDate");
    });

    it("should detect ISOTimestamp", () => {
      expect(detectDateType("2026-01-06T22:05:45Z")).toBe("ISOTimestamp");
      expect(detectDateType("2026-01-06T22:05:45+05:00")).toBe("ISOTimestamp");
    });

    it("should return unknown for invalid strings", () => {
      expect(detectDateType("invalid")).toBe("unknown");
      expect(detectDateType("2026")).toBe("unknown");
      expect(detectDateType("01-06-2026")).toBe("unknown");
    });

    it("should prioritize BusinessDate for exact matches", () => {
      // Both type guards should handle their own format
      const dateOnly = "2026-01-06";
      expect(isBusinessDate(dateOnly)).toBe(true);
      expect(isISOTimestamp(dateOnly)).toBe(false);
      expect(detectDateType(dateOnly)).toBe("BusinessDate");
    });
  });

  // ==========================================================================
  // looksLikeDateString
  // ==========================================================================
  describe("looksLikeDateString", () => {
    it("should return true for date-like strings", () => {
      expect(looksLikeDateString("2026-01-06")).toBe(true);
      expect(looksLikeDateString("2026-01-06T22:05:45Z")).toBe(true);
      expect(looksLikeDateString("2026-12-31")).toBe(true);
    });

    it("should return false for non-date strings", () => {
      expect(looksLikeDateString("hello")).toBe(false);
      expect(looksLikeDateString("12345")).toBe(false);
      expect(looksLikeDateString("")).toBe(false);
    });

    it("should return false for strings too short", () => {
      expect(looksLikeDateString("2026-01")).toBe(false);
      expect(looksLikeDateString("2026")).toBe(false);
    });

    it("should return false for non-strings", () => {
      expect(looksLikeDateString(null)).toBe(false);
      expect(looksLikeDateString(undefined)).toBe(false);
      expect(looksLikeDateString(12345)).toBe(false);
      expect(looksLikeDateString({})).toBe(false);
    });
  });

  // ==========================================================================
  // Integration: Type Safety
  // ==========================================================================
  describe("type safety integration", () => {
    it("should allow BusinessDate in business date contexts", () => {
      // This is primarily a compile-time check
      const businessDate = assertBusinessDate("2026-01-06");

      // Should be usable as a string
      expect(businessDate.startsWith("2026")).toBe(true);
      expect(businessDate.length).toBe(10);
    });

    it("should allow ISOTimestamp in timestamp contexts", () => {
      const timestamp = assertISOTimestamp("2026-01-06T22:05:45Z");

      // Should be usable as a string
      expect(timestamp.includes("T")).toBe(true);
      expect(timestamp.endsWith("Z")).toBe(true);
    });

    it("should maintain string operations", () => {
      const businessDate = assertBusinessDate("2026-01-06");

      // All string methods should work
      expect(businessDate.split("-")).toEqual(["2026", "01", "06"]);
      expect(businessDate.substring(0, 4)).toBe("2026");
    });
  });

  // ==========================================================================
  // Security: Malicious Input
  // ==========================================================================
  describe("security - malicious input handling", () => {
    it("should reject potential injection attempts", () => {
      expect(isBusinessDate("2026-01-06; DROP TABLE users;")).toBe(false);
      expect(isBusinessDate("2026-01-06<script>alert(1)</script>")).toBe(false);
      expect(isBusinessDate("2026-01-06\n2026-01-07")).toBe(false);
    });

    it("should handle extremely long strings safely", () => {
      const longString = "2026-01-06" + "x".repeat(10000);
      expect(isBusinessDate(longString)).toBe(false);
      // Should not hang or crash
    });

    it("should handle unicode safely", () => {
      expect(isBusinessDate("2026-01-06\u0000")).toBe(false);
      expect(isBusinessDate("２０２６-０１-０６")).toBe(false); // Full-width
      expect(isBusinessDate("2026‐01‐06")).toBe(false); // Unicode hyphen
    });

    it("should reject prototype pollution attempts", () => {
      const maliciousInput = {
        __proto__: { isBusinessDate: true },
        toString: () => "2026-01-06",
      };
      expect(isBusinessDate(maliciousInput)).toBe(false);
    });
  });
});
