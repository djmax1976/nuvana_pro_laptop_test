/**
 * Timezone Utility Functions
 *
 * Core principle: Store UTC everywhere, convert at boundaries.
 *
 * All dates in the database are stored as TIMESTAMPTZ (UTC internally).
 * All API requests/responses use ISO 8601 format (UTC).
 * Business logic converts to store timezone for calculations.
 * Display layer converts to store timezone for user-facing output.
 */

import { toZonedTime, fromZonedTime, formatInTimeZone } from "date-fns-tz";
import {
  differenceInHours,
  differenceInMinutes,
  parseISO,
  format,
  addDays,
} from "date-fns";

/**
 * Convert UTC date to store's local timezone
 *
 * @param utcDate - Date object in UTC
 * @param storeTimezone - IANA timezone string (e.g., "America/Denver")
 * @returns Date object representing the same moment in store's timezone
 *
 * @example
 * const utc = new Date('2025-11-26T05:00:00Z'); // 5 AM UTC
 * const denver = toStoreTime(utc, 'America/Denver'); // 10 PM previous day MST
 */
export function toStoreTime(utcDate: Date, storeTimezone: string): Date {
  return toZonedTime(utcDate, storeTimezone);
}

/**
 * Convert store's local time to UTC
 *
 * @param localDate - Date string or Date object in store's local time
 * @param storeTimezone - IANA timezone string
 * @returns Date object in UTC
 *
 * @example
 * const utc = toUTC('2025-11-25 22:00:00', 'America/Denver');
 * // Returns: 2025-11-26T05:00:00Z (10 PM Denver = 5 AM UTC next day)
 */
export function toUTC(localDate: Date | string, storeTimezone: string): Date {
  return fromZonedTime(localDate, storeTimezone);
}

/**
 * Format date in store's timezone
 *
 * @param date - Date to format
 * @param storeTimezone - IANA timezone string
 * @param formatString - date-fns format string
 * @returns Formatted date string in store timezone
 *
 * @example
 * formatInStoreTimezone(
 *   new Date('2025-11-26T05:00:00Z'),
 *   'America/Denver',
 *   'yyyy-MM-dd HH:mm:ss zzz'
 * );
 * // Returns: "2025-11-25 22:00:00 MST"
 */
export function formatInStoreTimezone(
  date: Date,
  storeTimezone: string,
  formatString: string,
): string {
  return formatInTimeZone(date, storeTimezone, formatString);
}

/**
 * Get the "business day" for a timestamp in store timezone
 *
 * Business day starts at a configurable hour (default 6 AM) and ends
 * at the same hour the next calendar day. This ensures night shifts
 * (e.g., 10 PM - 6 AM) belong to one business day.
 *
 * @param timestamp - UTC timestamp
 * @param storeTimezone - IANA timezone string
 * @param businessDayStartHour - Hour (0-23) when business day starts (default: 6)
 * @returns Business date in YYYY-MM-DD format
 *
 * @example
 * // Transaction at 12:30 AM Tuesday (Denver time)
 * const ts = new Date('2025-11-26T07:30:00Z'); // 12:30 AM Tue Denver
 * getBusinessDay(ts, 'America/Denver', 6);
 * // Returns: "2025-11-25" (belongs to Monday's business day)
 */
export function getBusinessDay(
  timestamp: Date,
  storeTimezone: string,
  businessDayStartHour: number = 6,
): string {
  const storeTime = toStoreTime(timestamp, storeTimezone);
  const hour = storeTime.getHours();

  // If before business day start hour, this belongs to previous day's business
  if (hour < businessDayStartHour) {
    const previousDay = new Date(storeTime);
    previousDay.setDate(previousDay.getDate() - 1);
    return format(previousDay, "yyyy-MM-dd");
  }

  return format(storeTime, "yyyy-MM-dd");
}

/**
 * Get start and end UTC timestamps for a business day
 *
 * @param businessDate - Business date in YYYY-MM-DD format
 * @param storeTimezone - IANA timezone string
 * @param businessDayStartHour - Hour (0-23) when business day starts (default: 6)
 * @returns Object with startUTC and endUTC Date objects
 *
 * @example
 * // Get boundaries for Monday Nov 25, 2025 in Denver
 * getBusinessDayBoundaries('2025-11-25', 'America/Denver', 6);
 * // Returns:
 * // {
 * //   startUTC: 2025-11-25T13:00:00Z (6 AM Mon Denver)
 * //   endUTC:   2025-11-26T13:00:00Z (6 AM Tue Denver)
 * // }
 */
export function getBusinessDayBoundaries(
  businessDate: string,
  storeTimezone: string,
  businessDayStartHour: number = 6,
): { startUTC: Date; endUTC: Date } {
  // Business day starts at configured hour on businessDate
  const startLocal = `${businessDate} ${businessDayStartHour.toString().padStart(2, "0")}:00:00`;
  const startUTC = toUTC(startLocal, storeTimezone);

  // Business day ends at same hour next calendar day
  // Convert start to store timezone, add one day, then format to get next day's date string
  const startInStoreTz = toStoreTime(startUTC, storeTimezone);
  const nextDayInStoreTz = addDays(startInStoreTz, 1);
  const endDateStr = format(nextDayInStoreTz, "yyyy-MM-dd");
  const endLocal = `${endDateStr} ${businessDayStartHour.toString().padStart(2, "0")}:00:00`;
  const endUTC = toUTC(endLocal, storeTimezone);

  return { startUTC, endUTC };
}

/**
 * Check if transaction timestamp falls within shift boundaries
 *
 * Compares timestamps in store timezone to handle cross-midnight shifts correctly.
 *
 * @param transactionTime - Transaction timestamp (UTC)
 * @param shiftStart - Shift start time (UTC)
 * @param shiftEnd - Shift end time (UTC)
 * @param storeTimezone - IANA timezone string
 * @returns True if transaction belongs to shift
 *
 * @example
 * // Shift: 10 PM Mon - 6 AM Tue (Denver)
 * // Transaction: 12:30 AM Tue (Denver)
 * const shiftStart = new Date('2025-11-26T05:00:00Z'); // 10 PM Mon Denver
 * const shiftEnd = new Date('2025-11-26T13:00:00Z');   // 6 AM Tue Denver
 * const txTime = new Date('2025-11-26T07:30:00Z');     // 12:30 AM Tue Denver
 *
 * isTransactionInShift(txTime, shiftStart, shiftEnd, 'America/Denver');
 * // Returns: true (transaction is within shift)
 */
export function isTransactionInShift(
  transactionTime: Date,
  shiftStart: Date,
  shiftEnd: Date,
  storeTimezone: string,
): boolean {
  const txInStoreTime = toStoreTime(transactionTime, storeTimezone);
  const startInStoreTime = toStoreTime(shiftStart, storeTimezone);
  const endInStoreTime = toStoreTime(shiftEnd, storeTimezone);

  return txInStoreTime >= startInStoreTime && txInStoreTime <= endInStoreTime;
}

/**
 * Calculate shift duration accounting for DST transitions
 *
 * Returns the actual elapsed time between two UTC timestamps.
 * This correctly handles DST transitions because the calculation is done
 * in UTC, which doesn't observe daylight saving time.
 *
 * @param shiftStart - Shift start time (UTC)
 * @param shiftEnd - Shift end time (UTC)
 * @param storeTimezone - IANA timezone string (kept for API compatibility)
 * @param unit - Return duration in 'hours' or 'minutes' (default: 'hours')
 * @returns Duration as number
 *
 * @example
 * // DST "fall back" night: 1 AM - 2 AM happens twice
 * // Shift: 10 PM Sat - 6 AM Sun (crosses DST boundary)
 * const start = new Date('2024-11-03T04:00:00Z'); // 10 PM Sat MDT
 * const end = new Date('2024-11-03T13:00:00Z');   // 6 AM Sun MST
 *
 * getShiftDuration(start, end, 'America/Denver', 'hours');
 * // Returns: 9 (the actual elapsed hours, accounting for DST "fall back")
 */
export function getShiftDuration(
  shiftStart: Date,
  shiftEnd: Date,
  _storeTimezone: string,
  unit: "hours" | "minutes" = "hours",
): number {
  // Calculate actual elapsed time using UTC timestamps directly
  // This correctly handles DST transitions because UTC doesn't observe DST
  if (unit === "hours") {
    return differenceInHours(shiftEnd, shiftStart);
  }
  return differenceInMinutes(shiftEnd, shiftStart);
}

/**
 * Get hour of day in store timezone (0-23)
 *
 * Used for hourly trend reports and time-of-day analysis.
 *
 * @param timestamp - UTC timestamp
 * @param storeTimezone - IANA timezone string
 * @returns Hour (0-23) in store timezone
 *
 * @example
 * const utc = new Date('2025-11-26T03:00:00Z'); // 3 AM UTC
 * getStoreHour(utc, 'America/Denver');
 * // Returns: 20 (8 PM Denver time)
 */
export function getStoreHour(timestamp: Date, storeTimezone: string): number {
  const storeTime = toStoreTime(timestamp, storeTimezone);
  return storeTime.getHours();
}

/**
 * Get calendar date in store timezone (YYYY-MM-DD)
 *
 * @param timestamp - UTC timestamp
 * @param storeTimezone - IANA timezone string
 * @returns Date string in YYYY-MM-DD format
 *
 * @example
 * const utc = new Date('2025-11-26T03:00:00Z'); // 3 AM UTC Tuesday
 * getStoreDate(utc, 'America/Denver');
 * // Returns: "2025-11-25" (still Monday in Denver)
 */
export function getStoreDate(timestamp: Date, storeTimezone: string): string {
  return formatInStoreTimezone(timestamp, storeTimezone, "yyyy-MM-dd");
}

/**
 * Parse ISO 8601 date string safely
 *
 * @param dateString - ISO 8601 date string
 * @returns Date object
 *
 * @example
 * parseISOSafe('2025-11-25T05:00:00Z');
 * // Returns: Date object for 2025-11-26T05:00:00.000Z
 */
export function parseISOSafe(dateString: string): Date {
  return parseISO(dateString);
}

/**
 * Check if a date is valid
 *
 * @param date - Date to check
 * @returns True if valid date
 */
export function isValidDate(date: Date): boolean {
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Get day of week in store timezone (0 = Sunday, 6 = Saturday)
 *
 * @param timestamp - UTC timestamp
 * @param storeTimezone - IANA timezone string
 * @returns Day of week (0-6)
 */
export function getStoreDayOfWeek(
  timestamp: Date,
  storeTimezone: string,
): number {
  const storeTime = toStoreTime(timestamp, storeTimezone);
  return storeTime.getDay();
}

/**
 * Validate IANA timezone string
 *
 * @param timezone - Timezone string to validate
 * @returns True if valid IANA timezone
 *
 * @example
 * isValidTimezone('America/Denver'); // true
 * isValidTimezone('Invalid/Zone');   // false
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current calendar date in store's timezone
 *
 * Returns today's date string (YYYY-MM-DD) according to the store's local timezone.
 * This is essential for day-close operations where "today" must match the store's
 * wall clock, not the server's timezone.
 *
 * @param storeTimezone - IANA timezone string (e.g., "America/New_York")
 * @returns Date string in YYYY-MM-DD format
 *
 * @example
 * // At 11 PM EST on Dec 24:
 * // Server in UTC sees Dec 25 04:00 UTC
 * // But store in EST should see Dec 24
 * getCurrentStoreDate('America/New_York');
 * // Returns: "2024-12-24" (correct store date)
 */
export function getCurrentStoreDate(storeTimezone: string): string {
  const now = new Date();
  return getStoreDate(now, storeTimezone);
}

/**
 * Get calendar day boundaries (midnight to midnight) in UTC
 *
 * Unlike getBusinessDayBoundaries which uses a configurable business day start hour,
 * this function returns simple calendar day boundaries (00:00:00 to 23:59:59.999)
 * in the store's timezone, converted to UTC.
 *
 * Use this for queries that need to find all shifts opened on a specific calendar date
 * in the store's local timezone.
 *
 * DB-006: Used for tenant-scoped date range queries
 *
 * @param dateString - Date string in YYYY-MM-DD format (in store timezone)
 * @param storeTimezone - IANA timezone string
 * @returns Object with startUTC (midnight) and endUTC (end of day) Date objects
 *
 * @example
 * // Get boundaries for Dec 24, 2024 in New York (EST = UTC-5)
 * getCalendarDayBoundaries('2024-12-24', 'America/New_York');
 * // Returns:
 * // {
 * //   startUTC: 2024-12-24T05:00:00.000Z (midnight EST in UTC)
 * //   endUTC:   2024-12-25T04:59:59.999Z (11:59:59.999 PM EST in UTC)
 * // }
 *
 * @example
 * // Get boundaries for Dec 24, 2024 in Los Angeles (PST = UTC-8)
 * getCalendarDayBoundaries('2024-12-24', 'America/Los_Angeles');
 * // Returns:
 * // {
 * //   startUTC: 2024-12-24T08:00:00.000Z (midnight PST in UTC)
 * //   endUTC:   2024-12-25T07:59:59.999Z (11:59:59.999 PM PST in UTC)
 * // }
 */
export function getCalendarDayBoundaries(
  dateString: string,
  storeTimezone: string,
): { startUTC: Date; endUTC: Date } {
  // Midnight (00:00:00) on the given date in store timezone
  const startLocal = `${dateString} 00:00:00`;
  const startUTC = toUTC(startLocal, storeTimezone);

  // End of day (23:59:59.999) on the given date in store timezone
  const endLocal = `${dateString} 23:59:59`;
  const endUTC = toUTC(endLocal, storeTimezone);
  // Add 999ms to get 23:59:59.999
  endUTC.setMilliseconds(999);

  return { startUTC, endUTC };
}

/**
 * Default timezone constant
 *
 * Used when store timezone is not configured. Eastern Time is the default
 * because most US convenience stores operate in Eastern timezone.
 *
 * SEC-014: Documented default to avoid ambiguity
 */
export const DEFAULT_STORE_TIMEZONE = "America/New_York";
