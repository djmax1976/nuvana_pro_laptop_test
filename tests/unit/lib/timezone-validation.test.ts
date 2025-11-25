/**
 * Unit Tests for Timezone Validation in Frontend API Layer
 *
 * Tests the IANA timezone regex validation to ensure it correctly
 * accepts valid timezones and rejects invalid ones.
 */

import { describe, it, expect } from "vitest";

/**
 * IANA timezone validation regex (from src/lib/api/stores.ts)
 * This should match the actual regex used in the application
 */
const IANA_TIMEZONE_REGEX =
  /^[A-Z][a-z]+(\/[A-Z][a-zA-Z_]+)+$|^UTC$|^GMT(\+|-)\d+$/;

function validateTimezone(timezone: string): boolean {
  return IANA_TIMEZONE_REGEX.test(timezone);
}

describe("Frontend Timezone Validation", () => {
  describe("Valid IANA Timezones", () => {
    it("should accept America/New_York (mixed case with underscore)", () => {
      expect(validateTimezone("America/New_York")).toBe(true);
    });

    it("should accept America/Los_Angeles (mixed case with underscore)", () => {
      expect(validateTimezone("America/Los_Angeles")).toBe(true);
    });

    it("should accept common US timezones", () => {
      expect(validateTimezone("America/Chicago")).toBe(true);
      expect(validateTimezone("America/Denver")).toBe(true);
      expect(validateTimezone("America/Phoenix")).toBe(true);
      expect(validateTimezone("America/Anchorage")).toBe(true);
      expect(validateTimezone("Pacific/Honolulu")).toBe(true);
    });

    it("should accept European timezones", () => {
      expect(validateTimezone("Europe/London")).toBe(true);
      expect(validateTimezone("Europe/Paris")).toBe(true);
      expect(validateTimezone("Europe/Berlin")).toBe(true);
    });

    it("should accept Asian timezones", () => {
      expect(validateTimezone("Asia/Tokyo")).toBe(true);
      expect(validateTimezone("Asia/Shanghai")).toBe(true);
      expect(validateTimezone("Asia/Dubai")).toBe(true);
      expect(validateTimezone("Asia/Hong_Kong")).toBe(true);
    });

    it("should accept timezones with subdivisions", () => {
      expect(validateTimezone("America/Kentucky/Louisville")).toBe(true);
      expect(validateTimezone("America/Indiana/Indianapolis")).toBe(true);
    });

    it("should accept UTC", () => {
      expect(validateTimezone("UTC")).toBe(true);
    });

    it("should accept GMT offsets", () => {
      expect(validateTimezone("GMT+5")).toBe(true);
      expect(validateTimezone("GMT-3")).toBe(true);
      expect(validateTimezone("GMT+10")).toBe(true);
    });
  });

  describe("Invalid Timezones", () => {
    it("should reject timezone abbreviations", () => {
      expect(validateTimezone("EST")).toBe(false);
      expect(validateTimezone("PST")).toBe(false);
      expect(validateTimezone("CST")).toBe(false);
      expect(validateTimezone("MST")).toBe(false);
      expect(validateTimezone("GMT")).toBe(false);
    });

    it("should reject incorrect capitalization", () => {
      expect(validateTimezone("america/new_york")).toBe(false);
      expect(validateTimezone("AMERICA/NEW_YORK")).toBe(false);
      expect(validateTimezone("America/new_york")).toBe(false);
    });

    it("should reject spaces instead of underscores", () => {
      expect(validateTimezone("America/New York")).toBe(false);
      expect(validateTimezone("America/Los Angeles")).toBe(false);
    });

    it("should reject missing continent", () => {
      expect(validateTimezone("New_York")).toBe(false);
      expect(validateTimezone("London")).toBe(false);
    });

    it("should reject empty strings", () => {
      expect(validateTimezone("")).toBe(false);
    });

    it("should reject invalid formats", () => {
      // Note: This regex validates FORMAT, not whether timezone exists in IANA database
      // So 'Invalid/Timezone' matches the pattern (Continent/City format)
      // To truly validate, we'd need to check against the full IANA database
      expect(validateTimezone("123/456")).toBe(false); // Numbers not allowed
      expect(validateTimezone("test/test")).toBe(false); // Lowercase start
      expect(validateTimezone("INVALID/TIMEZONE")).toBe(false); // All caps not allowed
    });
  });

  describe("Edge Cases", () => {
    it("should accept timezones with multiple capital letters", () => {
      // This is the bug we fixed - capital letters after first letter in city
      expect(validateTimezone("America/New_York")).toBe(true); // N and Y
      expect(validateTimezone("America/Los_Angeles")).toBe(true); // L and A
      expect(validateTimezone("America/Port_of_Spain")).toBe(true); // P, S
    });

    it("should accept timezones with mixed case words", () => {
      expect(validateTimezone("America/North_Dakota/New_Salem")).toBe(true);
      expect(validateTimezone("America/Argentina/Buenos_Aires")).toBe(true);
    });

    it("should reject timezone with trailing/leading spaces", () => {
      expect(validateTimezone(" America/New_York")).toBe(false);
      expect(validateTimezone("America/New_York ")).toBe(false);
      expect(validateTimezone(" America/New_York ")).toBe(false);
    });
  });

  describe("Regression Tests", () => {
    it("BUG FIX: should accept America/New_York (was failing due to capital Y)", () => {
      // This test documents the bug we fixed in stores.ts
      // The regex was /[A-Z][a-z_]+/ which only allowed lowercase
      // Should be /[A-Z][a-zA-Z_]+/ to allow mixed case
      expect(validateTimezone("America/New_York")).toBe(true);
    });

    it("BUG FIX: should accept any IANA timezone with capital letters in city name", () => {
      // Many timezones have capital letters in the city name
      expect(validateTimezone("America/Los_Angeles")).toBe(true); // Capital A
      expect(validateTimezone("America/St_Johns")).toBe(true); // Capital J
      expect(validateTimezone("America/Port_of_Spain")).toBe(true); // Capital S
    });
  });
});
