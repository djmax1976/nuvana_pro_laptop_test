/**
 * Address Utility Functions
 *
 * Phase 4: Data Migration & Backward Compatibility (TASK-4.3)
 *
 * Provides helper functions for working with company addresses, supporting
 * both structured (preferred) and legacy (deprecated) address formats.
 *
 * @module utils/address.utils
 *
 * @enterprise-standards
 * - API-003: ERROR_HANDLING - Graceful fallback behavior
 * - SEC-014: INPUT_VALIDATION - Safe handling of nullable fields
 */

/**
 * Structured address data from Company entity
 * All fields are nullable to support legacy records
 */
export interface StructuredAddressData {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state_id?: string | null;
  county_id?: string | null;
  zip_code?: string | null;
}

/**
 * Company address data including both legacy and structured fields
 */
export interface CompanyAddressData extends StructuredAddressData {
  /** @deprecated Legacy address string - use structured fields instead */
  address?: string | null;
}

/**
 * Result of getDisplayAddress function
 */
export interface DisplayAddressResult {
  /** The formatted display string */
  displayString: string;
  /** Whether the address comes from structured fields (true) or legacy field (false) */
  isStructured: boolean;
  /** Whether any address data was available */
  hasAddress: boolean;
}

/**
 * Get the best available display address from a company record
 *
 * Phase 4: TASK-4.3 - Prefer structured address over legacy
 *
 * Priority:
 * 1. If structured fields are populated, format from them (preferred)
 * 2. If only legacy address field exists, use it (deprecated)
 * 3. If no address data, return empty result
 *
 * @param company - Company data with address fields
 * @param stateName - Optional state name for display (used with structured format)
 * @returns Display address result with metadata
 *
 * @example
 * ```typescript
 * const company = await prisma.company.findUnique({ where: { company_id } });
 * const result = getDisplayAddress(company, "Georgia");
 * if (result.hasAddress) {
 *   console.log(result.displayString);
 *   if (!result.isStructured) {
 *     console.warn("Company uses legacy address format");
 *   }
 * }
 * ```
 */
export function getDisplayAddress(
  company: CompanyAddressData,
  stateName?: string
): DisplayAddressResult {
  // Check if structured address fields are populated
  const hasStructuredAddress = Boolean(
    company.address_line1 &&
    company.city &&
    company.zip_code
  );

  if (hasStructuredAddress) {
    // Build display string from structured fields
    const parts: string[] = [];

    // Address line 1 (required for structured)
    parts.push(company.address_line1!.trim());

    // Address line 2 (optional)
    if (company.address_line2) {
      parts.push(company.address_line2.trim());
    }

    // City, State ZIP format
    const cityStateZip = formatCityStateZip(
      company.city!,
      stateName,
      company.zip_code!
    );
    parts.push(cityStateZip);

    return {
      displayString: parts.join(", "),
      isStructured: true,
      hasAddress: true,
    };
  }

  // Fall back to legacy address field
  if (company.address && company.address.trim().length > 0) {
    return {
      displayString: company.address.trim(),
      isStructured: false,
      hasAddress: true,
    };
  }

  // No address data available
  return {
    displayString: "",
    isStructured: false,
    hasAddress: false,
  };
}

/**
 * Format city, state, and ZIP into standard display format
 *
 * @param city - City name
 * @param stateName - State name or code (optional)
 * @param zipCode - ZIP code
 * @returns Formatted string (e.g., "Atlanta, Georgia 30301")
 */
export function formatCityStateZip(
  city: string,
  stateName: string | undefined | null,
  zipCode: string
): string {
  const parts: string[] = [city.trim()];

  if (stateName) {
    parts.push(stateName.trim());
  }

  if (parts.length > 0 && zipCode) {
    // Join city and state with comma, then append ZIP with space
    return `${parts.join(", ")} ${zipCode.trim()}`;
  }

  return parts.join(", ");
}

/**
 * Check if a company has migrated to structured address format
 *
 * @param company - Company data with address fields
 * @returns true if structured address fields are populated
 */
export function hasStructuredAddress(company: CompanyAddressData): boolean {
  return Boolean(
    company.address_line1 &&
    company.city &&
    company.state_id &&
    company.zip_code
  );
}

/**
 * Check if a company still uses only legacy address format
 *
 * @param company - Company data with address fields
 * @returns true if only legacy address field is populated (needs migration)
 */
export function needsAddressMigration(company: CompanyAddressData): boolean {
  const hasLegacy = Boolean(company.address && company.address.trim().length > 0);
  const hasStructured = hasStructuredAddress(company);

  return hasLegacy && !hasStructured;
}
