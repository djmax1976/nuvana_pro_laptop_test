/**
 * Timezone Test Utilities
 *
 * Helper functions for testing timezone-aware features.
 * Provides utilities to create dates in specific timezones and
 * test scenarios like cross-midnight shifts and DST transitions.
 */

import { fromZonedTime } from "date-fns-tz";

/**
 * Create a UTC Date from a date/time string in a specific timezone
 *
 * @param dateTimeString - Date and time in "YYYY-MM-DD HH:mm:ss" format
 * @param timezone - IANA timezone string
 * @returns Date object in UTC
 *
 * @example
 * createDateInTimezone('2025-11-25 22:00:00', 'America/Denver');
 * // Returns Date representing 2025-11-26T05:00:00Z (10 PM Denver = 5 AM UTC next day)
 */
export function createDateInTimezone(
  dateTimeString: string,
  timezone: string,
): Date {
  return fromZonedTime(dateTimeString, timezone);
}

/**
 * Create test data for a cross-midnight shift scenario
 *
 * @param storeTimezone - Store's IANA timezone
 * @param date - Optional base date (YYYY-MM-DD), defaults to 2025-11-25
 * @returns Shift start and end times that cross midnight
 *
 * @example
 * const shift = createCrossMidnightShift('America/Denver');
 * // Returns:
 * // {
 * //   start_time: 2025-11-26T05:00:00Z (10 PM Mon Denver)
 * //   end_time: 2025-11-26T13:00:00Z (6 AM Tue Denver)
 * // }
 */
export function createCrossMidnightShift(
  storeTimezone: string,
  date: string = "2025-11-25",
): { start_time: Date; end_time: Date } {
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDayStr = nextDay.toISOString().split("T")[0];

  return {
    start_time: createDateInTimezone(`${date} 22:00:00`, storeTimezone),
    end_time: createDateInTimezone(`${nextDayStr} 06:00:00`, storeTimezone),
  };
}

/**
 * Create test data for a DST "fall back" scenario
 *
 * DST ends at 2:00 AM when clocks "fall back" to 1:00 AM.
 * This means the hour from 1:00-2:00 AM happens twice.
 *
 * @param storeTimezone - Store's IANA timezone (must observe DST)
 * @returns Shift that crosses DST boundary
 *
 * @example
 * const shift = createDSTFallBackShift('America/Denver');
 * // Returns shift on Nov 3, 2024 (DST ends)
 * // Shift duration is 9 hours (not 8) due to extra hour
 */
export function createDSTFallBackShift(storeTimezone: string): {
  start_time: Date;
  end_time: Date;
  dstDate: string;
} {
  // DST ends on November 3, 2024 at 2:00 AM (falls back to 1:00 AM)
  const dstDate = "2024-11-03";

  return {
    start_time: createDateInTimezone(`${dstDate} 22:00:00`, storeTimezone),
    end_time: createDateInTimezone(`2024-11-04 06:00:00`, storeTimezone),
    dstDate,
  };
}

/**
 * Create test data for a DST "spring forward" scenario
 *
 * DST begins at 2:00 AM when clocks "spring forward" to 3:00 AM.
 * This means the hour from 2:00-3:00 AM does not exist.
 *
 * @param storeTimezone - Store's IANA timezone (must observe DST)
 * @returns Shift that crosses DST boundary
 *
 * @example
 * const shift = createDSTSpringForwardShift('America/Denver');
 * // Returns shift on March 10, 2024 (DST begins)
 * // Shift duration is 7 hours (not 8) due to missing hour
 */
export function createDSTSpringForwardShift(storeTimezone: string): {
  start_time: Date;
  end_time: Date;
  dstDate: string;
} {
  // DST begins on March 10, 2024 at 2:00 AM (springs forward to 3:00 AM)
  const dstDate = "2024-03-10";

  return {
    start_time: createDateInTimezone(`${dstDate} 22:00:00`, storeTimezone),
    end_time: createDateInTimezone(`2024-03-11 06:00:00`, storeTimezone),
    dstDate,
  };
}

/**
 * Create transaction at specific time in store timezone
 *
 * @param date - Date in YYYY-MM-DD format
 * @param time - Time in HH:mm:ss format
 * @param storeTimezone - IANA timezone string
 * @returns Transaction timestamp in UTC
 *
 * @example
 * createTransactionTime('2025-11-26', '00:30:00', 'America/Denver');
 * // Returns: 2025-11-26T07:30:00Z (12:30 AM Tue Denver = 7:30 AM Tue UTC)
 */
export function createTransactionTime(
  date: string,
  time: string,
  storeTimezone: string,
): Date {
  return createDateInTimezone(`${date} ${time}`, storeTimezone);
}

/**
 * Common test timezones
 */
export const TEST_TIMEZONES = {
  DENVER: "America/Denver", // Mountain Time (UTC-7/-6)
  NEW_YORK: "America/New_York", // Eastern Time (UTC-5/-4)
  LOS_ANGELES: "America/Los_Angeles", // Pacific Time (UTC-8/-7)
  CHICAGO: "America/Chicago", // Central Time (UTC-6/-5)
  LONDON: "Europe/London", // GMT/BST (UTC+0/+1)
  TOKYO: "Asia/Tokyo", // JST (UTC+9, no DST)
  UTC: "UTC", // UTC (baseline)
};

/**
 * Create multiple stores with different timezones for multi-store testing
 *
 * @returns Array of store objects with different timezones
 */
export function createMultiTimezoneStores() {
  return [
    {
      store_id: "test-store-denver",
      name: "Denver Store",
      timezone: TEST_TIMEZONES.DENVER,
    },
    {
      store_id: "test-store-ny",
      name: "New York Store",
      timezone: TEST_TIMEZONES.NEW_YORK,
    },
    {
      store_id: "test-store-la",
      name: "Los Angeles Store",
      timezone: TEST_TIMEZONES.LOS_ANGELES,
    },
    {
      store_id: "test-store-tokyo",
      name: "Tokyo Store",
      timezone: TEST_TIMEZONES.TOKYO,
    },
  ];
}
