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
  const endDate = new Date(businessDate);
  endDate.setDate(endDate.getDate() + 1);
  const endDateStr = format(endDate, "yyyy-MM-dd");
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
 * Properly handles Daylight Saving Time by using timezone-aware calculations.
 *
 * @param shiftStart - Shift start time (UTC)
 * @param shiftEnd - Shift end time (UTC)
 * @param storeTimezone - IANA timezone string
 * @param unit - Return duration in 'hours' or 'minutes' (default: 'hours')
 * @returns Duration as number
 *
 * @example
 * // DST "fall back" night: 1 AM - 2 AM happens twice
 * // Shift: 10 PM Sat - 6 AM Sun (crosses DST boundary)
 * const start = new Date('2024-11-03T05:00:00Z'); // 10 PM Sat MDT
 * const end = new Date('2024-11-03T13:00:00Z');   // 6 AM Sun MST
 *
 * getShiftDuration(start, end, 'America/Denver', 'hours');
 * // Returns: 9 (not 8, because of DST "fall back" extra hour)
 */
export function getShiftDuration(
  shiftStart: Date,
  shiftEnd: Date,
  storeTimezone: string,
  unit: "hours" | "minutes" = "hours",
): number {
  const startInStoreTime = toStoreTime(shiftStart, storeTimezone);
  const endInStoreTime = toStoreTime(shiftEnd, storeTimezone);

  if (unit === "hours") {
    return differenceInHours(endInStoreTime, startInStoreTime);
  }
  return differenceInMinutes(endInStoreTime, startInStoreTime);
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
