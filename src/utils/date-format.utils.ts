/**
 * Frontend Date Formatting Utilities
 *
 * Provides timezone-aware date formatting for UI components.
 * All dates are received from API as ISO 8601 UTC strings and
 * converted to store timezone for display.
 */

import { format } from "date-fns";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";

/**
 * Format date in store timezone with custom format string
 *
 * @param date - Date object or ISO 8601 string
 * @param storeTimezone - IANA timezone string (e.g., "America/Denver")
 * @param formatString - date-fns format string
 * @returns Formatted date string
 *
 * @example
 * formatInStoreTime(
 *   '2025-11-26T05:00:00Z',
 *   'America/Denver',
 *   'MMM d, yyyy h:mm a zzz'
 * );
 * // Returns: "Nov 25, 2025 10:00 PM MST"
 */
export function formatInStoreTime(
  date: Date | string,
  storeTimezone: string,
  formatString: string,
): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return formatInTimeZone(dateObj, storeTimezone, formatString);
}

/**
 * Format date and time with timezone abbreviation
 *
 * @param date - Date object or ISO 8601 string
 * @param storeTimezone - IANA timezone string
 * @returns Formatted string: "Nov 25, 2025 10:30 PM MST"
 *
 * @example
 * formatDateTime('2025-11-26T05:30:00Z', 'America/Denver');
 * // Returns: "Nov 25, 2025 10:30 PM MST"
 */
export function formatDateTime(
  date: Date | string,
  storeTimezone: string,
): string {
  return formatInStoreTime(date, storeTimezone, "MMM d, yyyy h:mm a zzz");
}

/**
 * Format date only (no time)
 *
 * @param date - Date object or ISO 8601 string
 * @param storeTimezone - IANA timezone string
 * @returns Formatted string: "Nov 25, 2025"
 *
 * @example
 * formatDate('2025-11-26T05:00:00Z', 'America/Denver');
 * // Returns: "Nov 25, 2025"
 */
export function formatDate(date: Date | string, storeTimezone: string): string {
  return formatInStoreTime(date, storeTimezone, "MMM d, yyyy");
}

/**
 * Format date in full format
 *
 * @param date - Date object or ISO 8601 string
 * @param storeTimezone - IANA timezone string
 * @returns Formatted string: "Monday, November 25, 2025"
 *
 * @example
 * formatDateFull('2025-11-26T05:00:00Z', 'America/Denver');
 * // Returns: "Monday, November 25, 2025"
 */
export function formatDateFull(
  date: Date | string,
  storeTimezone: string,
): string {
  return formatInStoreTime(date, storeTimezone, "EEEE, MMMM d, yyyy");
}

/**
 * Format time only (no date)
 *
 * @param date - Date object or ISO 8601 string
 * @param storeTimezone - IANA timezone string
 * @returns Formatted string: "10:30 PM"
 *
 * @example
 * formatTime('2025-11-26T05:30:00Z', 'America/Denver');
 * // Returns: "10:30 PM"
 */
export function formatTime(date: Date | string, storeTimezone: string): string {
  return formatInStoreTime(date, storeTimezone, "h:mm a");
}

/**
 * Format time with seconds
 *
 * @param date - Date object or ISO 8601 string
 * @param storeTimezone - IANA timezone string
 * @returns Formatted string: "10:30:45 PM"
 *
 * @example
 * formatTimeWithSeconds('2025-11-26T05:30:45Z', 'America/Denver');
 * // Returns: "10:30:45 PM"
 */
export function formatTimeWithSeconds(
  date: Date | string,
  storeTimezone: string,
): string {
  return formatInStoreTime(date, storeTimezone, "h:mm:ss a");
}

/**
 * Format date for API (YYYY-MM-DD)
 *
 * @param date - Date object or ISO 8601 string
 * @param storeTimezone - IANA timezone string
 * @returns Formatted string: "2025-11-25"
 *
 * @example
 * formatDateISO('2025-11-26T05:00:00Z', 'America/Denver');
 * // Returns: "2025-11-25"
 */
export function formatDateISO(
  date: Date | string,
  storeTimezone: string,
): string {
  return formatInStoreTime(date, storeTimezone, "yyyy-MM-dd");
}

/**
 * Format date and time for API (ISO 8601 format in store timezone)
 *
 * @param date - Date object or ISO 8601 string
 * @param storeTimezone - IANA timezone string
 * @returns Formatted string: "2025-11-25T22:00:00"
 *
 * @example
 * formatDateTimeISO('2025-11-26T05:00:00Z', 'America/Denver');
 * // Returns: "2025-11-25T22:00:00"
 */
export function formatDateTimeISO(
  date: Date | string,
  storeTimezone: string,
): string {
  return formatInStoreTime(date, storeTimezone, "yyyy-MM-dd'T'HH:mm:ss");
}

/**
 * Format short date (MM/DD/YYYY)
 *
 * @param date - Date object or ISO 8601 string
 * @param storeTimezone - IANA timezone string
 * @returns Formatted string: "11/25/2025"
 *
 * @example
 * formatDateShort('2025-11-26T05:00:00Z', 'America/Denver');
 * // Returns: "11/25/2025"
 */
export function formatDateShort(
  date: Date | string,
  storeTimezone: string,
): string {
  return formatInStoreTime(date, storeTimezone, "MM/dd/yyyy");
}

/**
 * Format relative time (e.g., "2 hours ago")
 *
 * Note: This uses browser's local time for relative calculation,
 * but formats the absolute time in store timezone for display.
 *
 * @param date - Date object or ISO 8601 string
 * @param storeTimezone - IANA timezone string
 * @returns Formatted string: "2 hours ago" or absolute time if > 24 hours
 *
 * @example
 * formatRelative(new Date(Date.now() - 2 * 60 * 60 * 1000), 'America/Denver');
 * // Returns: "2 hours ago"
 */
export function formatRelative(
  date: Date | string,
  storeTimezone: string,
): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) {
    return "Just now";
  } else if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  } else {
    // For older dates, show absolute time in store timezone
    return formatDateTime(dateObj, storeTimezone);
  }
}

/**
 * Convert UTC date to store timezone Date object
 *
 * @param date - Date object or ISO 8601 string
 * @param storeTimezone - IANA timezone string
 * @returns Date object in store timezone
 *
 * @example
 * const storeDate = toStoreTimezone('2025-11-26T05:00:00Z', 'America/Denver');
 * // storeDate represents 10 PM on Nov 25 in Denver
 */
export function toStoreTimezone(
  date: Date | string,
  storeTimezone: string,
): Date {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return toZonedTime(dateObj, storeTimezone);
}

/**
 * Format date range
 *
 * @param startDate - Start date
 * @param endDate - End date
 * @param storeTimezone - IANA timezone string
 * @returns Formatted string: "Nov 25, 2025 - Nov 26, 2025"
 *
 * @example
 * formatDateRange(
 *   '2025-11-25T13:00:00Z',
 *   '2025-11-26T13:00:00Z',
 *   'America/Denver'
 * );
 * // Returns: "Nov 25, 2025 - Nov 26, 2025"
 */
export function formatDateRange(
  startDate: Date | string,
  endDate: Date | string,
  storeTimezone: string,
): string {
  const start = formatDate(startDate, storeTimezone);
  const end = formatDate(endDate, storeTimezone);

  // If same date, only show once
  if (start === end) {
    return start;
  }

  return `${start} - ${end}`;
}

/**
 * Format datetime range
 *
 * @param startDate - Start date
 * @param endDate - End date
 * @param storeTimezone - IANA timezone string
 * @returns Formatted string: "Nov 25, 10:00 PM - Nov 26, 6:00 AM MST"
 *
 * @example
 * formatDateTimeRange(
 *   '2025-11-26T05:00:00Z',
 *   '2025-11-26T13:00:00Z',
 *   'America/Denver'
 * );
 * // Returns: "Nov 25, 10:00 PM - Nov 26, 6:00 AM MST"
 */
export function formatDateTimeRange(
  startDate: Date | string,
  endDate: Date | string,
  storeTimezone: string,
): string {
  const startFormatted = formatInStoreTime(
    startDate,
    storeTimezone,
    "MMM d, h:mm a",
  );
  const endFormatted = formatDateTime(endDate, storeTimezone);

  return `${startFormatted} - ${endFormatted}`;
}

/**
 * Get timezone abbreviation for display
 *
 * @param storeTimezone - IANA timezone string
 * @param date - Optional date to get abbreviation for (handles DST)
 * @returns Timezone abbreviation (e.g., "MST", "MDT")
 *
 * @example
 * getTimezoneAbbr('America/Denver', new Date('2025-11-25'));
 * // Returns: "MST" (winter)
 *
 * getTimezoneAbbr('America/Denver', new Date('2025-07-25'));
 * // Returns: "MDT" (summer, daylight saving)
 */
export function getTimezoneAbbr(
  storeTimezone: string,
  date: Date = new Date(),
): string {
  return formatInTimeZone(date, storeTimezone, "zzz");
}
