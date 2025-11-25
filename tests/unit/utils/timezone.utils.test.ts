/**
 * Unit Tests for Timezone Utilities
 *
 * Tests the core timezone conversion and calculation functions
 * used throughout the backend for timezone-aware operations.
 */

import { describe, it, expect } from "vitest";
import {
  toStoreTime,
  toUTC,
  getBusinessDay,
  getBusinessDayBoundaries,
  isTransactionInShift,
  getShiftDuration,
  getStoreHour,
  getStoreDate,
  formatInStoreTimezone,
  isValidTimezone,
  getStoreDayOfWeek,
} from "../../../backend/src/utils/timezone.utils";

describe("timezone.utils", () => {
  describe("toStoreTime", () => {
    it("should convert UTC to store timezone", () => {
      const utc = new Date("2025-11-26T05:00:00Z"); // 5 AM UTC
      const denverTime = toStoreTime(utc, "America/Denver");

      // 5 AM UTC = 10 PM previous day in Denver (MST, UTC-7)
      expect(denverTime.getHours()).toBe(22); // 10 PM
      expect(denverTime.getDate()).toBe(25); // Previous day
    });

    it("should handle different timezones correctly", () => {
      const utc = new Date("2025-11-26T05:00:00Z");

      const tokyo = toStoreTime(utc, "Asia/Tokyo");
      expect(tokyo.getHours()).toBe(14); // 2 PM (UTC+9)

      const london = toStoreTime(utc, "Europe/London");
      expect(london.getHours()).toBe(5); // 5 AM (same as UTC in winter)

      const newYork = toStoreTime(utc, "America/New_York");
      expect(newYork.getHours()).toBe(0); // 12 AM (UTC-5)
    });
  });

  describe("toUTC", () => {
    it("should convert store time to UTC", () => {
      const utc = toUTC("2025-11-25 22:00:00", "America/Denver");

      expect(utc.toISOString()).toBe("2025-11-26T05:00:00.000Z");
    });

    it("should handle Date objects", () => {
      const denverTime = new Date("2025-11-25T22:00:00"); // Assumes Denver time
      const utc = toUTC(denverTime, "America/Denver");

      expect(utc.getUTCHours()).toBe(5); // Next day in UTC
    });

    it("should handle different timezones", () => {
      const tokyoUTC = toUTC("2025-11-26 14:00:00", "Asia/Tokyo");
      expect(tokyoUTC.toISOString()).toBe("2025-11-26T05:00:00.000Z");

      const nyUTC = toUTC("2025-11-26 00:00:00", "America/New_York");
      expect(nyUTC.toISOString()).toBe("2025-11-26T05:00:00.000Z");
    });
  });

  describe("getBusinessDay", () => {
    it("should return correct business day for time after cutoff", () => {
      // 10 PM Monday Denver (after 6 AM cutoff)
      const timestamp = new Date("2025-11-26T05:00:00Z");
      const businessDay = getBusinessDay(timestamp, "America/Denver", 6);

      expect(businessDay).toBe("2025-11-25"); // Monday
    });

    it("should return previous day for time before cutoff", () => {
      // 12:30 AM Tuesday Denver (before 6 AM cutoff)
      const timestamp = new Date("2025-11-26T07:30:00Z");
      const businessDay = getBusinessDay(timestamp, "America/Denver", 6);

      expect(businessDay).toBe("2025-11-25"); // Still Monday's business day
    });

    it("should return same day for time exactly at cutoff", () => {
      // 6:00 AM Tuesday Denver (exactly at cutoff)
      const timestamp = new Date("2025-11-26T13:00:00Z");
      const businessDay = getBusinessDay(timestamp, "America/Denver", 6);

      expect(businessDay).toBe("2025-11-26"); // Tuesday
    });

    it("should handle different cutoff hours", () => {
      // 3 AM Tuesday Denver
      const timestamp = new Date("2025-11-26T10:00:00Z");

      // With 6 AM cutoff
      expect(getBusinessDay(timestamp, "America/Denver", 6)).toBe("2025-11-25"); // Monday

      // With 2 AM cutoff
      expect(getBusinessDay(timestamp, "America/Denver", 2)).toBe("2025-11-26"); // Tuesday
    });
  });

  describe("getBusinessDayBoundaries", () => {
    it("should return correct UTC boundaries for business day", () => {
      const { startUTC, endUTC } = getBusinessDayBoundaries(
        "2025-11-25",
        "America/Denver",
        6,
      );

      // Business day: 6 AM Mon Denver - 6 AM Tue Denver
      expect(startUTC.toISOString()).toBe("2025-11-25T13:00:00.000Z"); // 6 AM MST = 1 PM UTC
      expect(endUTC.toISOString()).toBe("2025-11-26T13:00:00.000Z");
    });

    it("should handle different timezones", () => {
      const { startUTC, endUTC } = getBusinessDayBoundaries(
        "2025-11-25",
        "Asia/Tokyo",
        6,
      );

      // 6 AM Tokyo = 9 PM UTC previous day
      expect(startUTC.toISOString()).toBe("2025-11-24T21:00:00.000Z");
      expect(endUTC.toISOString()).toBe("2025-11-25T21:00:00.000Z");
    });

    it("should handle different cutoff hours", () => {
      const { startUTC, endUTC } = getBusinessDayBoundaries(
        "2025-11-25",
        "America/Denver",
        0, // Midnight cutoff
      );

      // Midnight Denver = 7 AM UTC
      expect(startUTC.toISOString()).toBe("2025-11-25T07:00:00.000Z");
      expect(endUTC.toISOString()).toBe("2025-11-26T07:00:00.000Z");
    });
  });

  describe("isTransactionInShift", () => {
    it("should return true for transaction within shift", () => {
      // Shift: 10 PM Mon - 6 AM Tue (Denver)
      const shiftStart = new Date("2025-11-26T05:00:00Z");
      const shiftEnd = new Date("2025-11-26T13:00:00Z");

      // Transaction: 12:30 AM Tuesday (Denver)
      const txTime = new Date("2025-11-26T07:30:00Z");

      const result = isTransactionInShift(
        txTime,
        shiftStart,
        shiftEnd,
        "America/Denver",
      );

      expect(result).toBe(true);
    });

    it("should return false for transaction before shift", () => {
      const shiftStart = new Date("2025-11-26T05:00:00Z"); // 10 PM Mon
      const shiftEnd = new Date("2025-11-26T13:00:00Z"); // 6 AM Tue

      // Transaction: 9 PM Monday (before shift)
      const txTime = new Date("2025-11-26T04:00:00Z");

      const result = isTransactionInShift(
        txTime,
        shiftStart,
        shiftEnd,
        "America/Denver",
      );

      expect(result).toBe(false);
    });

    it("should return false for transaction after shift", () => {
      const shiftStart = new Date("2025-11-26T05:00:00Z"); // 10 PM Mon
      const shiftEnd = new Date("2025-11-26T13:00:00Z"); // 6 AM Tue

      // Transaction: 7 AM Tuesday (after shift)
      const txTime = new Date("2025-11-26T14:00:00Z");

      const result = isTransactionInShift(
        txTime,
        shiftStart,
        shiftEnd,
        "America/Denver",
      );

      expect(result).toBe(false);
    });

    it("should return true for transaction exactly at shift boundaries", () => {
      const shiftStart = new Date("2025-11-26T05:00:00Z");
      const shiftEnd = new Date("2025-11-26T13:00:00Z");

      // Transaction at shift start
      expect(
        isTransactionInShift(
          shiftStart,
          shiftStart,
          shiftEnd,
          "America/Denver",
        ),
      ).toBe(true);

      // Transaction at shift end
      expect(
        isTransactionInShift(shiftEnd, shiftStart, shiftEnd, "America/Denver"),
      ).toBe(true);
    });
  });

  describe("getShiftDuration", () => {
    it("should calculate shift duration in hours", () => {
      // 8-hour shift: 10 PM - 6 AM
      const start = new Date("2025-11-26T05:00:00Z");
      const end = new Date("2025-11-26T13:00:00Z");

      const duration = getShiftDuration(start, end, "America/Denver", "hours");

      expect(duration).toBe(8);
    });

    it("should calculate shift duration in minutes", () => {
      const start = new Date("2025-11-26T05:00:00Z");
      const end = new Date("2025-11-26T13:00:00Z");

      const duration = getShiftDuration(
        start,
        end,
        "America/Denver",
        "minutes",
      );

      expect(duration).toBe(480); // 8 hours = 480 minutes
    });

    it("should handle DST fall back (9-hour shift)", () => {
      // DST ends Nov 3, 2024 at 2 AM (falls back to 1 AM)
      // Shift: 10 PM Sat - 6 AM Sun crosses DST boundary
      const start = new Date("2024-11-03T04:00:00Z"); // 10 PM MST
      const end = new Date("2024-11-03T13:00:00Z"); // 6 AM MST

      const duration = getShiftDuration(start, end, "America/Denver", "hours");

      // Should be 9 hours because 1-2 AM happens twice
      expect(duration).toBe(9);
    });

    it("should handle DST spring forward (7-hour shift)", () => {
      // DST begins Mar 10, 2024 at 2 AM (springs forward to 3 AM)
      // Shift: 10 PM Sat - 6 AM Sun crosses DST boundary
      const start = new Date("2024-03-10T05:00:00Z"); // 10 PM MST
      const end = new Date("2024-03-10T12:00:00Z"); // 6 AM MDT

      const duration = getShiftDuration(start, end, "America/Denver", "hours");

      // Should be 7 hours because 2-3 AM doesn't exist
      expect(duration).toBe(7);
    });
  });

  describe("getStoreHour", () => {
    it("should return correct hour in store timezone", () => {
      // 3 AM UTC = 8 PM previous day Denver
      const timestamp = new Date("2025-11-26T03:00:00Z");
      const hour = getStoreHour(timestamp, "America/Denver");

      expect(hour).toBe(20); // 8 PM
    });

    it("should return hour 0-23", () => {
      // Midnight UTC
      const midnight = new Date("2025-11-26T00:00:00Z");
      const denverHour = getStoreHour(midnight, "America/Denver");
      expect(denverHour).toBeGreaterThanOrEqual(0);
      expect(denverHour).toBeLessThan(24);

      // Noon UTC
      const noon = new Date("2025-11-26T12:00:00Z");
      const tokyoHour = getStoreHour(noon, "Asia/Tokyo");
      expect(tokyoHour).toBeGreaterThanOrEqual(0);
      expect(tokyoHour).toBeLessThan(24);
    });
  });

  describe("getStoreDate", () => {
    it("should return correct date in store timezone", () => {
      // 3 AM UTC Tuesday = 8 PM Monday Denver
      const timestamp = new Date("2025-11-26T03:00:00Z");
      const date = getStoreDate(timestamp, "America/Denver");

      expect(date).toBe("2025-11-25"); // Monday
    });

    it("should handle date boundary correctly", () => {
      // 6:59 AM UTC = 11:59 PM previous day Denver
      const justBeforeMidnight = new Date("2025-11-26T06:59:00Z");
      expect(getStoreDate(justBeforeMidnight, "America/Denver")).toBe(
        "2025-11-25",
      );

      // 7:00 AM UTC = 12:00 AM Denver
      const midnight = new Date("2025-11-26T07:00:00Z");
      expect(getStoreDate(midnight, "America/Denver")).toBe("2025-11-26");
    });
  });

  describe("formatInStoreTimezone", () => {
    it("should format date in store timezone", () => {
      const utc = new Date("2025-11-26T05:00:00Z"); // 10 PM Mon Denver

      const formatted = formatInStoreTimezone(
        utc,
        "America/Denver",
        "yyyy-MM-dd HH:mm:ss zzz",
      );

      expect(formatted).toBe("2025-11-25 22:00:00 MST");
    });

    it("should handle different format strings", () => {
      const utc = new Date("2025-11-26T05:00:00Z");

      expect(formatInStoreTimezone(utc, "America/Denver", "yyyy-MM-dd")).toBe(
        "2025-11-25",
      );

      expect(formatInStoreTimezone(utc, "America/Denver", "HH:mm")).toBe(
        "22:00",
      );

      expect(formatInStoreTimezone(utc, "America/Denver", "EEEE")).toBe(
        "Monday",
      );
    });
  });

  describe("isValidTimezone", () => {
    it("should return true for valid IANA timezones", () => {
      expect(isValidTimezone("America/Denver")).toBe(true);
      expect(isValidTimezone("America/New_York")).toBe(true);
      expect(isValidTimezone("Europe/London")).toBe(true);
      expect(isValidTimezone("Asia/Tokyo")).toBe(true);
      expect(isValidTimezone("UTC")).toBe(true);
    });

    it("should return false for invalid timezones", () => {
      expect(isValidTimezone("Invalid/Timezone")).toBe(false);
      expect(isValidTimezone("America/FakeCity")).toBe(false);
      expect(isValidTimezone("EST")).toBe(false); // Abbreviations not accepted
      expect(isValidTimezone("")).toBe(false);
    });
  });

  describe("getStoreDayOfWeek", () => {
    it("should return correct day of week in store timezone", () => {
      // Tuesday 3 AM UTC = Monday 8 PM Denver
      const timestamp = new Date("2025-11-26T03:00:00Z");
      const dayOfWeek = getStoreDayOfWeek(timestamp, "America/Denver");

      expect(dayOfWeek).toBe(1); // Monday (0 = Sunday, 1 = Monday)
    });

    it("should return 0-6 range", () => {
      const timestamp = new Date("2025-11-23T00:00:00Z"); // Sunday
      const day = getStoreDayOfWeek(timestamp, "UTC");

      expect(day).toBeGreaterThanOrEqual(0);
      expect(day).toBeLessThan(7);
    });
  });

  describe("Edge Cases", () => {
    it("should handle timezone with no DST (Asia/Tokyo)", () => {
      // Tokyo doesn't observe DST
      const start = new Date("2024-11-03T13:00:00Z"); // 10 PM Tokyo
      const end = new Date("2024-11-03T21:00:00Z"); // 6 AM Tokyo next day

      const duration = getShiftDuration(start, end, "Asia/Tokyo", "hours");

      expect(duration).toBe(8); // Always 8 hours (no DST)
    });

    it("should handle leap year dates", () => {
      const leapDay = new Date("2024-02-29T00:00:00Z");
      const date = getStoreDate(leapDay, "America/Denver");

      expect(date).toBe("2024-02-28"); // Feb 28 in Denver (UTC-7)
    });

    it("should handle year boundary", () => {
      // New Year's Eve at 11 PM Denver = Jan 1 at 6 AM UTC
      const newYearsEve = new Date("2025-01-01T06:00:00Z");
      const date = getStoreDate(newYearsEve, "America/Denver");

      expect(date).toBe("2024-12-31"); // Still Dec 31 in Denver
    });
  });
});
