"use client";

/**
 * TimezoneSelector Component
 *
 * Reusable dropdown component for selecting US timezones.
 * Pre-populated with common US timezones for convenience.
 *
 * @enterprise-standards
 * - FE-002: FORM_VALIDATION - Provides validated timezone options
 * - SEC-014: INPUT_VALIDATION - Strict allowlist of valid IANA timezones
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * US timezone options with display labels
 * Organized by region for better UX
 *
 * SEC-014: INPUT_VALIDATION - Allowlist of valid IANA timezone identifiers
 */
export const US_TIMEZONE_OPTIONS = [
  // Eastern Time
  { value: "America/New_York", label: "Eastern Time (ET) - New York" },
  { value: "America/Detroit", label: "Eastern Time (ET) - Detroit" },
  {
    value: "America/Indiana/Indianapolis",
    label: "Eastern Time (ET) - Indianapolis",
  },

  // Central Time
  { value: "America/Chicago", label: "Central Time (CT) - Chicago" },
  { value: "America/Indiana/Knox", label: "Central Time (CT) - Knox, IN" },
  { value: "America/Menominee", label: "Central Time (CT) - Menominee" },

  // Mountain Time
  { value: "America/Denver", label: "Mountain Time (MT) - Denver" },
  { value: "America/Phoenix", label: "Mountain Time (MT) - Phoenix (No DST)" },
  { value: "America/Boise", label: "Mountain Time (MT) - Boise" },

  // Pacific Time
  { value: "America/Los_Angeles", label: "Pacific Time (PT) - Los Angeles" },

  // Alaska Time
  { value: "America/Anchorage", label: "Alaska Time (AKT) - Anchorage" },
  { value: "America/Juneau", label: "Alaska Time (AKT) - Juneau" },

  // Hawaii Time
  { value: "Pacific/Honolulu", label: "Hawaii Time (HST) - Honolulu (No DST)" },

  // Atlantic Time (US Territories)
  { value: "America/Puerto_Rico", label: "Atlantic Time (AST) - Puerto Rico" },
  { value: "Pacific/Guam", label: "Chamorro Time (ChST) - Guam" },
] as const;

/**
 * Default timezone for the platform (Eastern US)
 */
export const DEFAULT_TIMEZONE = "America/New_York";

/**
 * Get timezone display label from value
 */
export function getTimezoneLabel(value: string): string {
  const option = US_TIMEZONE_OPTIONS.find((tz) => tz.value === value);
  return option?.label || value;
}

/**
 * Validate if timezone is in allowed list
 */
export function isValidUSTimezone(timezone: string): boolean {
  return US_TIMEZONE_OPTIONS.some((tz) => tz.value === timezone);
}

interface TimezoneSelectorProps {
  /** Current selected timezone value */
  value: string;
  /** Callback when timezone changes */
  onChange: (value: string) => void;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Test ID for testing */
  "data-testid"?: string;
}

/**
 * TimezoneSelector Component
 *
 * Dropdown selector for US timezones with pre-populated options.
 * Displays timezone name with region for clarity.
 */
export function TimezoneSelector({
  value,
  onChange,
  disabled = false,
  placeholder = "Select timezone",
  "data-testid": testId,
}: TimezoneSelectorProps) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger data-testid={testId}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {US_TIMEZONE_OPTIONS.map((tz) => (
          <SelectItem key={tz.value} value={tz.value}>
            {tz.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default TimezoneSelector;
