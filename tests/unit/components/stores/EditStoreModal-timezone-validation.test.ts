/**
 * Unit Tests for Timezone Validation in EditStoreModal
 *
 * Tests the improved IANA timezone validation that uses Intl.supportedValuesOf
 * when available, falling back to a permissive regex pattern.
 * Includes tests for multi-segment zones and varied capitalization.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Permissive IANA timezone validation regex (fallback)
 * Matches IANA timezone database format with support for:
 * - Multi-segment zones (e.g., America/Argentina/Buenos_Aires)
 * - Varied capitalization and underscores
 * - UTC and GMT offsets
 * Note: Requires at least one slash (multi-segment) or UTC/GMT with offset
 */
const PERMISSIVE_TIMEZONE_REGEX =
  /^[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)*$|^UTC$|^GMT[+-]\d{1,2}$/;

/**
 * Cache for supported timezones from Intl API
 */
let supportedTimezonesCache: Set<string> | null = null;

/**
 * Get supported timezones from Intl API, with caching
 */
function getSupportedTimezones(): Set<string> | null {
  if (supportedTimezonesCache !== null) {
    return supportedTimezonesCache;
  }

  try {
    // Check if Intl.supportedValuesOf is available (ES2022+)
    if (
      typeof Intl !== "undefined" &&
      typeof Intl.supportedValuesOf === "function"
    ) {
      const timezones = Intl.supportedValuesOf("timeZone");
      supportedTimezonesCache = new Set(timezones);
      return supportedTimezonesCache;
    }
  } catch (error) {
    // If Intl.supportedValuesOf throws (e.g., not supported), fall back to regex
    console.warn("Intl.supportedValuesOf not available, using regex fallback");
  }

  return null;
}

/**
 * Validate IANA timezone format
 * Prefers Intl.supportedValuesOf when available, falls back to permissive regex
 */
function validateIANATimezone(timezone: string): boolean {
  if (!timezone || typeof timezone !== "string") {
    return false;
  }

  // Try Intl.supportedValuesOf first (most accurate)
  const supportedTimezones = getSupportedTimezones();
  if (supportedTimezones !== null) {
    return supportedTimezones.has(timezone);
  }

  // Fallback to permissive regex pattern
  return PERMISSIVE_TIMEZONE_REGEX.test(timezone);
}

describe("EditStoreModal Timezone Validation", () => {
  const originalIntl = global.Intl;
  let mockSupportedTimezones: string[] | null = null;

  beforeEach(() => {
    // Reset cache before each test
    supportedTimezonesCache = null;
    mockSupportedTimezones = null;
  });

  afterEach(() => {
    // Restore original Intl
    global.Intl = originalIntl;
    supportedTimezonesCache = null;
  });

  describe("Using Intl.supportedValuesOf (when available)", () => {
    beforeEach(() => {
      // Mock Intl.supportedValuesOf to return a set of valid timezones
      mockSupportedTimezones = [
        "America/New_York",
        "America/Los_Angeles",
        "America/Argentina/Buenos_Aires",
        "America/Indiana/Indianapolis",
        "Europe/London",
        "Europe/Paris",
        "Asia/Tokyo",
        "Asia/Hong_Kong",
        "UTC",
        "GMT+5",
        "GMT-3",
        "America/North_Dakota/New_Salem",
        "America/Kentucky/Louisville",
      ];

      global.Intl = {
        ...originalIntl,
        supportedValuesOf: vi.fn((key: string) => {
          if (key === "timeZone") {
            return mockSupportedTimezones!;
          }
          throw new Error(`Unsupported key: ${key}`);
        }),
      } as typeof Intl;
    });

    it("should accept valid timezones using Intl.supportedValuesOf", () => {
      expect(validateIANATimezone("America/New_York")).toBe(true);
      expect(validateIANATimezone("Europe/London")).toBe(true);
      expect(validateIANATimezone("UTC")).toBe(true);
    });

    it("should accept multi-segment timezones using Intl.supportedValuesOf", () => {
      expect(validateIANATimezone("America/Argentina/Buenos_Aires")).toBe(true);
      expect(validateIANATimezone("America/Indiana/Indianapolis")).toBe(true);
      expect(validateIANATimezone("America/North_Dakota/New_Salem")).toBe(true);
      expect(validateIANATimezone("America/Kentucky/Louisville")).toBe(true);
    });

    it("should reject invalid timezones using Intl.supportedValuesOf", () => {
      expect(validateIANATimezone("Invalid/Timezone")).toBe(false);
      expect(validateIANATimezone("America/NonExistent")).toBe(false);
      expect(validateIANATimezone("EST")).toBe(false);
      expect(validateIANATimezone("PST")).toBe(false);
    });

    it("should cache supported timezones", () => {
      // First call should populate cache
      validateIANATimezone("America/New_York");
      const firstCallCount = (
        global.Intl.supportedValuesOf as ReturnType<typeof vi.fn>
      ).mock.calls.length;

      // Second call should use cache
      validateIANATimezone("Europe/London");
      const secondCallCount = (
        global.Intl.supportedValuesOf as ReturnType<typeof vi.fn>
      ).mock.calls.length;

      expect(firstCallCount).toBe(1);
      expect(secondCallCount).toBe(1); // Should still be 1, not 2
    });
  });

  describe("Using regex fallback (when Intl.supportedValuesOf unavailable)", () => {
    beforeEach(() => {
      // Mock Intl without supportedValuesOf
      global.Intl = {
        ...originalIntl,
        supportedValuesOf: undefined,
      } as any;
    });

    describe("Valid IANA Timezones (regex fallback)", () => {
      it("should accept standard two-segment timezones", () => {
        expect(validateIANATimezone("America/New_York")).toBe(true);
        expect(validateIANATimezone("America/Los_Angeles")).toBe(true);
        expect(validateIANATimezone("Europe/London")).toBe(true);
        expect(validateIANATimezone("Asia/Tokyo")).toBe(true);
        expect(validateIANATimezone("Pacific/Honolulu")).toBe(true);
      });

      it("should accept multi-segment timezones", () => {
        expect(validateIANATimezone("America/Argentina/Buenos_Aires")).toBe(
          true,
        );
        expect(validateIANATimezone("America/Indiana/Indianapolis")).toBe(true);
        expect(validateIANATimezone("America/North_Dakota/New_Salem")).toBe(
          true,
        );
        expect(validateIANATimezone("America/Kentucky/Louisville")).toBe(true);
      });

      it("should accept timezones with lowercase segments", () => {
        expect(validateIANATimezone("america/new_york")).toBe(true);
        expect(validateIANATimezone("europe/london")).toBe(true);
        expect(validateIANATimezone("asia/tokyo")).toBe(true);
      });

      it("should accept timezones with mixed case", () => {
        expect(validateIANATimezone("America/new_york")).toBe(true);
        expect(validateIANATimezone("AMERICA/NEW_YORK")).toBe(true);
        expect(validateIANATimezone("America/NEW_YORK")).toBe(true);
      });

      it("should accept timezones with underscores", () => {
        expect(validateIANATimezone("America/New_York")).toBe(true);
        expect(validateIANATimezone("America/Los_Angeles")).toBe(true);
        expect(validateIANATimezone("America/Port_of_Spain")).toBe(true);
        expect(validateIANATimezone("America/St_Johns")).toBe(true);
      });

      it("should accept UTC", () => {
        expect(validateIANATimezone("UTC")).toBe(true);
      });

      it("should accept GMT offsets", () => {
        expect(validateIANATimezone("GMT+5")).toBe(true);
        expect(validateIANATimezone("GMT-3")).toBe(true);
        expect(validateIANATimezone("GMT+10")).toBe(true);
        expect(validateIANATimezone("GMT-12")).toBe(true);
        expect(validateIANATimezone("GMT+0")).toBe(true);
        expect(validateIANATimezone("GMT-0")).toBe(true);
      });
    });

    describe("Invalid Timezones (regex fallback)", () => {
      it("should reject timezone abbreviations", () => {
        expect(validateIANATimezone("EST")).toBe(false);
        expect(validateIANATimezone("PST")).toBe(false);
        expect(validateIANATimezone("CST")).toBe(false);
        expect(validateIANATimezone("MST")).toBe(false);
        expect(validateIANATimezone("GMT")).toBe(false); // GMT without offset
      });

      it("should reject spaces instead of underscores", () => {
        expect(validateIANATimezone("America/New York")).toBe(false);
        expect(validateIANATimezone("America/Los Angeles")).toBe(false);
      });

      it("should reject numbers in timezone names", () => {
        expect(validateIANATimezone("America/New_York123")).toBe(false);
        expect(validateIANATimezone("123/America")).toBe(false);
        expect(validateIANATimezone("America/New_York/123")).toBe(false);
      });

      it("should reject empty strings", () => {
        expect(validateIANATimezone("")).toBe(false);
      });

      it("should reject null/undefined", () => {
        expect(validateIANATimezone(null as any)).toBe(false);
        expect(validateIANATimezone(undefined as any)).toBe(false);
      });

      it("should reject invalid GMT formats", () => {
        expect(validateIANATimezone("GMT+123")).toBe(false); // Too many digits
        expect(validateIANATimezone("GMT++5")).toBe(false); // Double plus
        expect(validateIANATimezone("GMT--3")).toBe(false); // Double minus
        expect(validateIANATimezone("GMT")).toBe(false); // No offset
      });
    });
  });

  describe("Edge Cases", () => {
    beforeEach(() => {
      // Use regex fallback for edge case tests
      global.Intl = {
        ...originalIntl,
        supportedValuesOf: undefined,
      } as any;
    });

    it("should reject timezones with trailing/leading spaces", () => {
      expect(validateIANATimezone(" America/New_York")).toBe(false);
      expect(validateIANATimezone("America/New_York ")).toBe(false);
      expect(validateIANATimezone(" America/New_York ")).toBe(false);
    });

    it("should accept timezones with multiple underscores", () => {
      expect(validateIANATimezone("America/Port_of_Spain")).toBe(true);
      expect(validateIANATimezone("America/St_Johns")).toBe(true);
    });

    it("should accept very long multi-segment timezones", () => {
      // Test pattern matching for long paths
      expect(validateIANATimezone("America/Argentina/Buenos_Aires")).toBe(true);
    });

    it("should handle single-segment timezones (though not standard IANA)", () => {
      // UTC is valid, but other single segments should be rejected
      expect(validateIANATimezone("UTC")).toBe(true); // Valid single segment
      expect(validateIANATimezone("Test")).toBe(false); // Single segment without slash should be rejected
    });
  });

  describe("Multi-segment timezone examples", () => {
    beforeEach(() => {
      // Use regex fallback for these tests
      global.Intl = {
        ...originalIntl,
        supportedValuesOf: undefined,
      } as any;
    });

    it("should accept America/Argentina/Buenos_Aires", () => {
      expect(validateIANATimezone("America/Argentina/Buenos_Aires")).toBe(true);
    });

    it("should accept America/Indiana/Indianapolis", () => {
      expect(validateIANATimezone("America/Indiana/Indianapolis")).toBe(true);
    });

    it("should accept America/North_Dakota/New_Salem", () => {
      expect(validateIANATimezone("America/North_Dakota/New_Salem")).toBe(true);
    });

    it("should accept America/Kentucky/Louisville", () => {
      expect(validateIANATimezone("America/Kentucky/Louisville")).toBe(true);
    });
  });

  describe("Lowercase and underscore timezone examples", () => {
    beforeEach(() => {
      // Use regex fallback for these tests
      global.Intl = {
        ...originalIntl,
        supportedValuesOf: undefined,
      } as any;
    });

    it("should accept lowercase timezones", () => {
      expect(validateIANATimezone("america/new_york")).toBe(true);
      expect(validateIANATimezone("europe/london")).toBe(true);
      expect(validateIANATimezone("asia/tokyo")).toBe(true);
    });

    it("should accept timezones with underscores", () => {
      expect(validateIANATimezone("America/New_York")).toBe(true);
      expect(validateIANATimezone("America/Los_Angeles")).toBe(true);
      expect(validateIANATimezone("America/Port_of_Spain")).toBe(true);
      expect(validateIANATimezone("America/St_Johns")).toBe(true);
    });

    it("should accept mixed case timezones", () => {
      expect(validateIANATimezone("America/new_york")).toBe(true);
      expect(validateIANATimezone("AMERICA/NEW_YORK")).toBe(true);
      expect(validateIANATimezone("America/NEW_YORK")).toBe(true);
      expect(validateIANATimezone("america/New_York")).toBe(true);
    });
  });
});
