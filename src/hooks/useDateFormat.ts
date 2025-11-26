/**
 * useDateFormat Hook
 *
 * Provides timezone-aware date formatting functions that automatically
 * use the current store's timezone from context.
 *
 * This hook simplifies date formatting in components by removing the need
 * to pass timezone explicitly to every formatting call.
 */

"use client";

import { useStoreTimezone } from "@/contexts/StoreContext";
import {
  formatDateTime,
  formatDate,
  formatDateFull,
  formatTime,
  formatTimeWithSeconds,
  formatDateISO,
  formatDateTimeISO,
  formatDateShort,
  formatRelative,
  formatInStoreTime,
  formatDateRange,
  formatDateTimeRange,
  getTimezoneAbbr,
  toStoreTimezone,
} from "@/utils/date-format.utils";

/**
 * Date formatting hook
 *
 * Returns formatting functions that automatically use the store's timezone.
 * All functions accept Date objects or ISO 8601 strings.
 *
 * **Note:** Functions like `formatDate` will throw `RangeError` for invalid date strings.
 * Wrap calls in try/catch blocks when dealing with potentially invalid input.
 *
 * @returns Object with formatting functions and timezone info
 *
 * @example
 * ```tsx
 * function TransactionRow({ transaction }: { transaction: Transaction }) {
 *   const { formatDateTime, formatDate, timezone } = useDateFormat();
 *
 *   return (
 *     <tr>
 *       <td>{formatDateTime(transaction.timestamp)}</td>
 *       <td>
 *         {(() => {
 *           try {
 *             return formatDate(transaction.created_at);
 *           } catch (error) {
 *             return 'Invalid date';
 *           }
 *         })()}
 *       </td>
 *       <td>Store Timezone: {timezone}</td>
 *     </tr>
 *   );
 * }
 * ```
 */
export function useDateFormat() {
  const timezone = useStoreTimezone();

  return {
    /**
     * Format date and time with timezone abbreviation
     * @example "Nov 25, 2025 10:30 PM MST"
     */
    formatDateTime: (date: Date | string) => formatDateTime(date, timezone),

    /**
     * Format date only (no time)
     * @example "Nov 25, 2025"
     * @throws {RangeError} If the date string is invalid or cannot be parsed
     */
    formatDate: (date: Date | string) => formatDate(date, timezone),

    /**
     * Format date in full format
     * @example "Monday, November 25, 2025"
     */
    formatDateFull: (date: Date | string) => formatDateFull(date, timezone),

    /**
     * Format time only (no date)
     * @example "10:30 PM"
     */
    formatTime: (date: Date | string) => formatTime(date, timezone),

    /**
     * Format time with seconds
     * @example "10:30:45 PM"
     */
    formatTimeWithSeconds: (date: Date | string) =>
      formatTimeWithSeconds(date, timezone),

    /**
     * Format date for API (YYYY-MM-DD)
     * @example "2025-11-25"
     */
    formatDateISO: (date: Date | string) => formatDateISO(date, timezone),

    /**
     * Format datetime for API (ISO 8601 in store timezone)
     * @example "2025-11-25T22:00:00"
     */
    formatDateTimeISO: (date: Date | string) =>
      formatDateTimeISO(date, timezone),

    /**
     * Format short date (MM/DD/YYYY)
     * @example "11/25/2025"
     */
    formatDateShort: (date: Date | string) => formatDateShort(date, timezone),

    /**
     * Format relative time
     * @example "2 hours ago" or absolute time if > 24 hours
     */
    formatRelative: (date: Date | string) => formatRelative(date, timezone),

    /**
     * Format with custom format string
     * @param date - Date to format
     * @param formatString - date-fns format string
     * @example formatCustom(date, 'yyyy-MM-dd HH:mm:ss')
     */
    formatCustom: (date: Date | string, formatString: string) =>
      formatInStoreTime(date, timezone, formatString),

    /**
     * Format date range
     * @example "Nov 25, 2025 - Nov 26, 2025"
     */
    formatDateRange: (startDate: Date | string, endDate: Date | string) =>
      formatDateRange(startDate, endDate, timezone),

    /**
     * Format datetime range
     * @example "Nov 25, 10:00 PM - Nov 26, 6:00 AM MST"
     */
    formatDateTimeRange: (startDate: Date | string, endDate: Date | string) =>
      formatDateTimeRange(startDate, endDate, timezone),

    /**
     * Convert UTC date to store timezone Date object
     */
    toStoreTimezone: (date: Date | string) => toStoreTimezone(date, timezone),

    /**
     * Get timezone abbreviation
     * @example "MST" or "MDT"
     */
    getTimezoneAbbr: (date?: Date) => getTimezoneAbbr(timezone, date),

    /**
     * Current store timezone (IANA format)
     * @example "America/Denver"
     */
    timezone,
  };
}
