/**
 * Date Range Preset Calculations
 *
 * Enterprise-grade utility functions for calculating date ranges based on presets.
 * Used by the unified Shift & Day report filtering system.
 *
 * Security Standards Applied:
 * - SEC-014: INPUT_VALIDATION - All date calculations are deterministic and safe
 * - FE-002: FORM_VALIDATION - Consistent date handling for form state
 *
 * Business Rules:
 * - "Current" presets end at the last closed shift/day (calculated dynamically)
 * - "Previous" presets use fixed calendar boundaries
 * - Week starts on Monday (ISO standard)
 * - All dates are in local timezone for business date consistency
 */

import type { RangePreset } from "@/lib/schemas/shift-day-filters.schema";

/**
 * Date range result with from and to dates
 */
export interface DateRange {
  /** Start date in YYYY-MM-DD format */
  fromDate: string;
  /** End date in YYYY-MM-DD format */
  toDate: string;
}

/**
 * Format a Date object to YYYY-MM-DD string (local timezone)
 * SEC-014: Consistent date formatting prevents injection and parsing issues
 *
 * @param date - Date object to format
 * @returns Date string in YYYY-MM-DD format
 */
export function formatDateToISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse a YYYY-MM-DD string to a Date object (local timezone)
 * SEC-014: Safe date parsing with validation
 *
 * @param dateStr - Date string in YYYY-MM-DD format
 * @returns Date object or null if invalid
 */
export function parseDateString(dateStr: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return null;
  }

  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  // Validate the date is real (handles invalid dates like 2024-02-30)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

/**
 * Get the Monday of the week containing the given date (ISO week standard)
 *
 * @param date - Reference date
 * @returns Date object for Monday of that week
 */
export function getWeekStart(date: Date): Date {
  const result = new Date(date);
  const dayOfWeek = result.getDay();
  // Sunday is 0, we want Monday as start (1)
  // If Sunday, go back 6 days; otherwise go back (dayOfWeek - 1) days
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  result.setDate(result.getDate() - daysToSubtract);
  return result;
}

/**
 * Get the Sunday of the week containing the given date
 *
 * @param date - Reference date
 * @returns Date object for Sunday of that week
 */
export function getWeekEnd(date: Date): Date {
  const monday = getWeekStart(date);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday;
}

/**
 * Get the first day of the month containing the given date
 *
 * @param date - Reference date
 * @returns Date object for first day of that month
 */
export function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Get the last day of the month containing the given date
 *
 * @param date - Reference date
 * @returns Date object for last day of that month
 */
export function getMonthEnd(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

/**
 * Get the first day of the year containing the given date
 *
 * @param date - Reference date
 * @returns Date object for January 1st of that year
 */
export function getYearStart(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1);
}

/**
 * Get the last day of the year containing the given date
 *
 * @param date - Reference date
 * @returns Date object for December 31st of that year
 */
export function getYearEnd(date: Date): Date {
  return new Date(date.getFullYear(), 11, 31);
}

/**
 * Calculate date range based on preset selection
 *
 * Business Rules:
 * - "current": No date filter - shows current/active data (DEFAULT)
 * - "custom": Returns null (user provides dates manually)
 * - "day": Returns null (user picks single date)
 * - "current_*": From start of period to lastClosedDate (or today if not provided)
 * - "previous_*": Full previous period boundaries
 *
 * @param preset - Range preset selection
 * @param lastClosedDate - Last closed shift/day date for "current" calculations
 * @param referenceDate - Reference date for calculations (defaults to today)
 * @returns DateRange object or null for current/custom/day presets
 */
export function calculateDateRange(
  preset: RangePreset,
  lastClosedDate?: string | null,
  referenceDate?: Date,
): DateRange | null {
  const today = referenceDate || new Date();

  // For "current_*" presets, use lastClosedDate if provided, otherwise today
  const endDate = lastClosedDate
    ? parseDateString(lastClosedDate) || today
    : today;

  switch (preset) {
    case "current":
      // No date filter - shows current/active data
      return null;

    case "custom":
      // User provides dates manually via From/To inputs
      return null;

    case "day":
      // User picks single date - handled by UI (disable To date)
      return null;

    case "current_week": {
      const weekStart = getWeekStart(today);
      return {
        fromDate: formatDateToISO(weekStart),
        toDate: formatDateToISO(endDate),
      };
    }

    case "previous_week": {
      // Get Monday of previous week
      const lastWeek = new Date(today);
      lastWeek.setDate(today.getDate() - 7);
      const prevWeekStart = getWeekStart(lastWeek);
      const prevWeekEnd = getWeekEnd(lastWeek);
      return {
        fromDate: formatDateToISO(prevWeekStart),
        toDate: formatDateToISO(prevWeekEnd),
      };
    }

    case "current_month": {
      const monthStart = getMonthStart(today);
      return {
        fromDate: formatDateToISO(monthStart),
        toDate: formatDateToISO(endDate),
      };
    }

    case "previous_month": {
      const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const prevMonthStart = getMonthStart(prevMonth);
      const prevMonthEnd = getMonthEnd(prevMonth);
      return {
        fromDate: formatDateToISO(prevMonthStart),
        toDate: formatDateToISO(prevMonthEnd),
      };
    }

    case "current_year": {
      const yearStart = getYearStart(today);
      return {
        fromDate: formatDateToISO(yearStart),
        toDate: formatDateToISO(endDate),
      };
    }

    case "previous_year": {
      const prevYear = new Date(today.getFullYear() - 1, 0, 1);
      const prevYearStart = getYearStart(prevYear);
      const prevYearEnd = getYearEnd(prevYear);
      return {
        fromDate: formatDateToISO(prevYearStart),
        toDate: formatDateToISO(prevYearEnd),
      };
    }

    default: {
      // Exhaustive check - should never reach here
      const _exhaustive: never = preset;
      console.warn(`Unknown preset: ${_exhaustive}`);
      return null;
    }
  }
}

/**
 * Labels for range presets - static mapping
 */
const RANGE_PRESET_LABELS: Readonly<Record<RangePreset, string>> = {
  current: "Current",
  custom: "Custom",
  day: "Day",
  current_week: "Current Week",
  previous_week: "Previous Week",
  current_month: "Current Month",
  previous_month: "Previous Month",
  current_year: "Current Year",
  previous_year: "Previous Year",
} as const;

/**
 * Get human-readable label for a range preset
 *
 * @param preset - Range preset
 * @returns Display label
 */
export function getRangePresetLabel(preset: RangePreset): string {
  // eslint-disable-next-line security/detect-object-injection -- Safe: preset is validated RangePreset enum
  return RANGE_PRESET_LABELS[preset];
}

/**
 * All range preset options in display order
 * "Current" is first (default - shows active data), then Custom, Day, then time periods
 */
export const RANGE_PRESET_OPTIONS: {
  value: RangePreset;
  label: string;
}[] = [
  { value: "current", label: "Current" },
  { value: "custom", label: "Custom" },
  { value: "day", label: "Day" },
  { value: "current_week", label: "Current Week" },
  { value: "previous_week", label: "Previous Week" },
  { value: "current_month", label: "Current Month" },
  { value: "previous_month", label: "Previous Month" },
  { value: "current_year", label: "Current Year" },
  { value: "previous_year", label: "Previous Year" },
];
