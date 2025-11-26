/**
 * Unit Tests for Frontend Date Formatting Utilities
 *
 * Tests date formatting functions used in React components
 * for timezone-aware display.
 */

import { describe, it, expect } from "vitest";
import {
  formatInStoreTime,
  formatDateTime,
  formatDate,
  formatDateFull,
  formatTime,
  formatTimeWithSeconds,
  formatDateISO,
  formatDateTimeISO,
  formatDateShort,
  formatDateRange,
  formatDateTimeRange,
  getTimezoneAbbr,
  toStoreTimezone,
} from "../../../src/utils/date-format.utils";

describe("date-format.utils", () => {
  const denverTZ = "America/Denver";
  const tokyoTZ = "Asia/Tokyo";
  const utcTZ = "UTC";

  describe("formatInStoreTime", () => {
    it("should format date with custom format string", () => {
      const date = "2025-11-26T05:00:00Z"; // 10 PM Mon Denver

      const result = formatInStoreTime(
        date,
        denverTZ,
        "yyyy-MM-dd HH:mm:ss zzz",
      );

      expect(result).toBe("2025-11-25 22:00:00 MST");
    });

    it("should accept Date objects", () => {
      const date = new Date("2025-11-26T05:00:00Z");

      const result = formatInStoreTime(date, denverTZ, "yyyy-MM-dd");

      expect(result).toBe("2025-11-25");
    });

    it("should accept ISO strings", () => {
      const result = formatInStoreTime(
        "2025-11-26T05:00:00Z",
        denverTZ,
        "HH:mm",
      );

      expect(result).toBe("22:00");
    });
  });

  describe("formatDateTime", () => {
    it("should format date and time with timezone", () => {
      const date = "2025-11-26T05:30:00Z";

      const result = formatDateTime(date, denverTZ);

      expect(result).toBe("Nov 25, 2025 10:30 PM MST");
    });

    it("should handle different timezones", () => {
      const date = "2025-11-26T05:30:00Z";

      const tokyo = formatDateTime(date, tokyoTZ);
      expect(tokyo).toContain("Nov 26"); // Next day in Tokyo
      expect(tokyo).toContain("2:30 PM"); // Afternoon in Tokyo

      const utc = formatDateTime(date, utcTZ);
      expect(utc).toContain("5:30 AM"); // Morning in UTC
    });
  });

  describe("formatDate", () => {
    it("should format date only (no time)", () => {
      const date = "2025-11-26T05:00:00Z";

      const result = formatDate(date, denverTZ);

      expect(result).toBe("Nov 25, 2025");
    });

    it("should handle date boundaries correctly", () => {
      // Just before midnight Denver
      const beforeMidnight = "2025-11-26T06:59:00Z";
      expect(formatDate(beforeMidnight, denverTZ)).toBe("Nov 25, 2025");

      // At midnight Denver
      const atMidnight = "2025-11-26T07:00:00Z";
      expect(formatDate(atMidnight, denverTZ)).toBe("Nov 26, 2025");
    });
  });

  describe("formatDateFull", () => {
    it("should format full date with day of week", () => {
      const date = "2025-11-26T05:00:00Z"; // Wednesday UTC, Tuesday Denver

      const result = formatDateFull(date, denverTZ);

      expect(result).toBe("Tuesday, November 25, 2025");
    });
  });

  describe("formatTime", () => {
    it("should format time only (no date)", () => {
      const date = "2025-11-26T05:30:00Z";

      const result = formatTime(date, denverTZ);

      expect(result).toBe("10:30 PM");
    });

    it("should handle AM/PM correctly", () => {
      const morning = "2025-11-26T15:00:00Z"; // 8 AM Denver
      expect(formatTime(morning, denverTZ)).toBe("8:00 AM");

      const evening = "2025-11-26T05:00:00Z"; // 10 PM Denver
      expect(formatTime(evening, denverTZ)).toBe("10:00 PM");

      const noon = "2025-11-26T19:00:00Z"; // 12 PM Denver
      expect(formatTime(noon, denverTZ)).toBe("12:00 PM");

      const midnight = "2025-11-26T07:00:00Z"; // 12 AM Denver
      expect(formatTime(midnight, denverTZ)).toBe("12:00 AM");
    });
  });

  describe("formatTimeWithSeconds", () => {
    it("should format time with seconds", () => {
      const date = "2025-11-26T05:30:45Z";

      const result = formatTimeWithSeconds(date, denverTZ);

      expect(result).toBe("10:30:45 PM");
    });
  });

  describe("formatDateISO", () => {
    it("should format date as YYYY-MM-DD", () => {
      const date = "2025-11-26T05:00:00Z";

      const result = formatDateISO(date, denverTZ);

      expect(result).toBe("2025-11-25");
    });

    it("should be suitable for API requests", () => {
      const date = new Date("2025-11-26T05:00:00Z");
      const result = formatDateISO(date, denverTZ);

      // Should match YYYY-MM-DD pattern
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("formatDateTimeISO", () => {
    it("should format datetime in ISO format", () => {
      const date = "2025-11-26T05:30:00Z";

      const result = formatDateTimeISO(date, denverTZ);

      expect(result).toBe("2025-11-25T22:30:00");
    });
  });

  describe("formatDateShort", () => {
    it("should format date as MM/DD/YYYY", () => {
      const date = "2025-11-26T05:00:00Z";

      const result = formatDateShort(date, denverTZ);

      expect(result).toBe("11/25/2025");
    });
  });

  describe("formatDateRange", () => {
    it("should format date range", () => {
      const start = "2025-11-25T13:00:00Z"; // Nov 25 Denver
      const end = "2025-11-26T13:00:00Z"; // Nov 26 Denver

      const result = formatDateRange(start, end, denverTZ);

      expect(result).toBe("Nov 25, 2025 - Nov 26, 2025");
    });

    it("should show single date when range is same day", () => {
      const start = "2025-11-25T13:00:00Z"; // Nov 25 6 AM Denver
      const end = "2025-11-25T23:00:00Z"; // Nov 25 4 PM Denver

      const result = formatDateRange(start, end, denverTZ);

      expect(result).toBe("Nov 25, 2025");
    });
  });

  describe("formatDateTimeRange", () => {
    it("should format datetime range", () => {
      const start = "2025-11-26T05:00:00Z"; // Nov 25 10 PM Denver
      const end = "2025-11-26T13:00:00Z"; // Nov 26 6 AM Denver

      const result = formatDateTimeRange(start, end, denverTZ);

      expect(result).toBe("Nov 25, 10:00 PM - Nov 26, 2025 6:00 AM MST");
    });

    it("should handle same-day range", () => {
      const start = "2025-11-25T14:00:00Z"; // Nov 25 7 AM Denver
      const end = "2025-11-25T22:00:00Z"; // Nov 25 3 PM Denver

      const result = formatDateTimeRange(start, end, denverTZ);

      expect(result).toContain("Nov 25");
      expect(result).toContain("7:00 AM");
      expect(result).toContain("3:00 PM");
    });
  });

  describe("getTimezoneAbbr", () => {
    it("should return timezone abbreviation", () => {
      const winterDate = new Date("2025-11-25T00:00:00Z");
      const result = getTimezoneAbbr(denverTZ, winterDate);

      expect(result).toBe("MST"); // Mountain Standard Time (winter)
    });

    it("should handle DST correctly", () => {
      const summerDate = new Date("2025-07-25T00:00:00Z");
      const result = getTimezoneAbbr(denverTZ, summerDate);

      expect(result).toBe("MDT"); // Mountain Daylight Time (summer)
    });

    it("should default to current date if not provided", () => {
      const result = getTimezoneAbbr(denverTZ);

      expect(result).toMatch(/^M[SD]T$/); // MST or MDT depending on current date
    });

    it("should handle timezone without DST", () => {
      const result = getTimezoneAbbr(tokyoTZ);

      expect(result).toBe("GMT+9"); // Japan timezone (date-fns-tz may use GMT offset)
    });
  });

  describe("toStoreTimezone", () => {
    it("should convert UTC to store timezone Date object", () => {
      const utcDate = "2025-11-26T05:00:00Z";

      const storeDate = toStoreTimezone(utcDate, denverTZ);

      expect(storeDate.getHours()).toBe(22); // 10 PM
      expect(storeDate.getDate()).toBe(25); // Previous day
    });

    it("should accept Date objects", () => {
      const utcDate = new Date("2025-11-26T05:00:00Z");

      const storeDate = toStoreTimezone(utcDate, denverTZ);

      expect(storeDate.getHours()).toBe(22);
    });

    it("should return Date object in store timezone", () => {
      const utcDate = "2025-11-26T05:00:00Z";
      const storeDate = toStoreTimezone(utcDate, tokyoTZ);

      expect(storeDate).toBeInstanceOf(Date);
      expect(storeDate.getHours()).toBe(14); // 2 PM Tokyo
    });
  });

  describe("Edge Cases", () => {
    it("should throw RangeError for invalid date strings", () => {
      // Invalid dates will throw RangeError from date-fns
      // This is the expected behavior - consumers must handle errors explicitly
      expect(() => formatDate("invalid", denverTZ)).toThrow(RangeError);
    });

    it("should handle leap year dates", () => {
      const leapDay = "2024-02-29T06:00:00Z";
      const result = formatDate(leapDay, denverTZ);

      expect(result).toContain("Feb 28"); // Feb 28 in Denver (UTC-7)
    });

    it("should handle year boundary", () => {
      const newYearsEve = "2025-01-01T06:00:00Z"; // 11 PM Dec 31 Denver
      const result = formatDateTime(newYearsEve, denverTZ);

      expect(result).toContain("Dec 31, 2024");
      expect(result).toContain("11:00 PM");
    });

    it("should handle DST transition dates", () => {
      // DST ends Nov 3, 2024 at 2 AM
      const beforeDST = "2024-11-03T08:00:00Z"; // 1:00 AM MST (before fall back)
      const afterDST = "2024-11-03T09:00:00Z"; // 2:00 AM MST (after fall back)

      const before = formatTime(beforeDST, denverTZ);
      const after = formatTime(afterDST, denverTZ);

      // Both should format correctly
      expect(before).toBe("1:00 AM");
      expect(after).toBe("2:00 AM");
    });
  });

  describe("Consistency Across Functions", () => {
    it("should maintain date consistency across different format functions", () => {
      const utcDate = "2025-11-26T05:30:45Z";

      const dateOnly = formatDate(utcDate, denverTZ);
      const timeOnly = formatTime(utcDate, denverTZ);
      const dateTime = formatDateTime(utcDate, denverTZ);

      expect(dateTime).toContain(dateOnly.split(",")[0]); // "Nov 25"
      expect(dateTime).toContain(timeOnly); // "10:30 PM"
    });

    it("should produce ISO dates compatible with backend", () => {
      const utcDate = new Date("2025-11-26T05:00:00Z");
      const isoDate = formatDateISO(utcDate, denverTZ);

      // Should be able to use in API request
      expect(isoDate).toBe("2025-11-25");

      // Should be parseable
      const parsed = new Date(isoDate);
      expect(parsed).toBeInstanceOf(Date);
    });
  });
});
