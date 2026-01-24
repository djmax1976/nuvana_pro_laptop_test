/**
 * Address Utility Functions Unit Tests
 *
 * Phase 4: Data Migration & Backward Compatibility (TASK-4.3)
 * Tests the address utility functions for handling both structured and legacy formats.
 *
 * Test Coverage:
 * - ADDR-UTIL-001: getDisplayAddress with structured address
 * - ADDR-UTIL-002: getDisplayAddress with legacy address
 * - ADDR-UTIL-003: getDisplayAddress preference order
 * - ADDR-UTIL-004: hasStructuredAddress detection
 * - ADDR-UTIL-005: needsAddressMigration detection
 * - ADDR-UTIL-006: formatCityStateZip formatting
 *
 * @module tests/unit/utils/address.utils.test
 */

import { describe, it, expect } from "vitest";
import {
  getDisplayAddress,
  formatCityStateZip,
  hasStructuredAddress,
  needsAddressMigration,
  type CompanyAddressData,
} from "../../../src/utils/address.utils";

// =============================================================================
// Test Data Factories
// =============================================================================

function createCompanyWithStructuredAddress(
  overrides: Partial<CompanyAddressData> = {}
): CompanyAddressData {
  return {
    address_line1: "123 Main Street",
    address_line2: "Suite 100",
    city: "Atlanta",
    state_id: "test-state-uuid",
    county_id: "test-county-uuid",
    zip_code: "30301",
    address: "123 Main Street, Suite 100, Atlanta, GA 30301", // Legacy field populated too
    ...overrides,
  };
}

function createCompanyWithLegacyOnlyAddress(
  overrides: Partial<CompanyAddressData> = {}
): CompanyAddressData {
  return {
    address_line1: null,
    address_line2: null,
    city: null,
    state_id: null,
    county_id: null,
    zip_code: null,
    address: "456 Oak Avenue, Miami, FL 33101",
    ...overrides,
  };
}

function createCompanyWithNoAddress(): CompanyAddressData {
  return {
    address_line1: null,
    address_line2: null,
    city: null,
    state_id: null,
    county_id: null,
    zip_code: null,
    address: null,
  };
}

// =============================================================================
// getDisplayAddress Tests
// =============================================================================

describe("getDisplayAddress", () => {
  // ADDR-UTIL-001: Structured address display
  describe("ADDR-UTIL-001: Structured address formatting", () => {
    it("[P0] should format structured address with all fields", () => {
      const company = createCompanyWithStructuredAddress();
      const result = getDisplayAddress(company, "Georgia");

      expect(result.hasAddress).toBe(true);
      expect(result.isStructured).toBe(true);
      expect(result.displayString).toBe("123 Main Street, Suite 100, Atlanta, Georgia 30301");
    });

    it("[P0] should format structured address without address_line2", () => {
      const company = createCompanyWithStructuredAddress({ address_line2: null });
      const result = getDisplayAddress(company, "Georgia");

      expect(result.hasAddress).toBe(true);
      expect(result.isStructured).toBe(true);
      expect(result.displayString).toBe("123 Main Street, Atlanta, Georgia 30301");
    });

    it("[P0] should format structured address without state name", () => {
      const company = createCompanyWithStructuredAddress();
      const result = getDisplayAddress(company); // No state name provided

      expect(result.hasAddress).toBe(true);
      expect(result.isStructured).toBe(true);
      expect(result.displayString).toBe("123 Main Street, Suite 100, Atlanta 30301");
    });

    it("[P0] should trim whitespace from structured fields", () => {
      const company = createCompanyWithStructuredAddress({
        address_line1: "  123 Main Street  ",
        city: "  Atlanta  ",
      });
      const result = getDisplayAddress(company, "Georgia");

      expect(result.displayString).toBe("123 Main Street, Suite 100, Atlanta, Georgia 30301");
    });
  });

  // ADDR-UTIL-002: Legacy address display
  describe("ADDR-UTIL-002: Legacy address handling", () => {
    it("[P0] should return legacy address when no structured fields", () => {
      const company = createCompanyWithLegacyOnlyAddress();
      const result = getDisplayAddress(company);

      expect(result.hasAddress).toBe(true);
      expect(result.isStructured).toBe(false);
      expect(result.displayString).toBe("456 Oak Avenue, Miami, FL 33101");
    });

    it("[P0] should trim whitespace from legacy address", () => {
      const company = createCompanyWithLegacyOnlyAddress({
        address: "   Trimmed Address   ",
      });
      const result = getDisplayAddress(company);

      expect(result.displayString).toBe("Trimmed Address");
    });

    it("[P0] should return empty result when legacy address is whitespace only", () => {
      const company = createCompanyWithLegacyOnlyAddress({
        address: "   ",
      });
      const result = getDisplayAddress(company);

      expect(result.hasAddress).toBe(false);
      expect(result.displayString).toBe("");
    });
  });

  // ADDR-UTIL-003: Preference order
  describe("ADDR-UTIL-003: Preference order (structured over legacy)", () => {
    it("[P0] should prefer structured address over legacy when both exist", () => {
      const company = createCompanyWithStructuredAddress({
        address: "LEGACY: Should not be used",
      });
      const result = getDisplayAddress(company, "Georgia");

      expect(result.isStructured).toBe(true);
      expect(result.displayString).not.toContain("LEGACY");
      expect(result.displayString).toBe("123 Main Street, Suite 100, Atlanta, Georgia 30301");
    });

    it("[P0] should fall back to legacy when structured fields incomplete", () => {
      const company = {
        address_line1: "123 Main Street",
        address_line2: null,
        city: null, // Missing required field
        state_id: "test-state-uuid",
        county_id: null,
        zip_code: "30301",
        address: "123 Main Street, Atlanta, GA 30301",
      };
      const result = getDisplayAddress(company);

      expect(result.isStructured).toBe(false);
      expect(result.displayString).toBe("123 Main Street, Atlanta, GA 30301");
    });
  });

  // No address available
  describe("No address data", () => {
    it("[P0] should return empty result when no address data", () => {
      const company = createCompanyWithNoAddress();
      const result = getDisplayAddress(company);

      expect(result.hasAddress).toBe(false);
      expect(result.isStructured).toBe(false);
      expect(result.displayString).toBe("");
    });
  });
});

// =============================================================================
// formatCityStateZip Tests
// =============================================================================

describe("formatCityStateZip", () => {
  // ADDR-UTIL-006: City, State, ZIP formatting
  it("[P0] should format city, state, and ZIP correctly", () => {
    const result = formatCityStateZip("Atlanta", "Georgia", "30301");
    expect(result).toBe("Atlanta, Georgia 30301");
  });

  it("[P0] should format city and ZIP when state is null", () => {
    const result = formatCityStateZip("Atlanta", null, "30301");
    expect(result).toBe("Atlanta 30301");
  });

  it("[P0] should format city and ZIP when state is undefined", () => {
    const result = formatCityStateZip("Atlanta", undefined, "30301");
    expect(result).toBe("Atlanta 30301");
  });

  it("[P1] should trim whitespace from all parts", () => {
    const result = formatCityStateZip("  Atlanta  ", "  Georgia  ", "  30301  ");
    expect(result).toBe("Atlanta, Georgia 30301");
  });

  it("[P1] should handle empty state string", () => {
    const result = formatCityStateZip("Atlanta", "", "30301");
    expect(result).toBe("Atlanta 30301");
  });
});

// =============================================================================
// hasStructuredAddress Tests
// =============================================================================

describe("hasStructuredAddress", () => {
  // ADDR-UTIL-004: Structured address detection
  it("[P0] should return true when all required structured fields exist", () => {
    const company = createCompanyWithStructuredAddress();
    expect(hasStructuredAddress(company)).toBe(true);
  });

  it("[P0] should return false when address_line1 is missing", () => {
    const company = createCompanyWithStructuredAddress({ address_line1: null });
    expect(hasStructuredAddress(company)).toBe(false);
  });

  it("[P0] should return false when city is missing", () => {
    const company = createCompanyWithStructuredAddress({ city: null });
    expect(hasStructuredAddress(company)).toBe(false);
  });

  it("[P0] should return false when state_id is missing", () => {
    const company = createCompanyWithStructuredAddress({ state_id: null });
    expect(hasStructuredAddress(company)).toBe(false);
  });

  it("[P0] should return false when zip_code is missing", () => {
    const company = createCompanyWithStructuredAddress({ zip_code: null });
    expect(hasStructuredAddress(company)).toBe(false);
  });

  it("[P0] should return true even if county_id is missing (optional)", () => {
    const company = createCompanyWithStructuredAddress({ county_id: null });
    expect(hasStructuredAddress(company)).toBe(true);
  });

  it("[P0] should return true even if address_line2 is missing (optional)", () => {
    const company = createCompanyWithStructuredAddress({ address_line2: null });
    expect(hasStructuredAddress(company)).toBe(true);
  });
});

// =============================================================================
// needsAddressMigration Tests
// =============================================================================

describe("needsAddressMigration", () => {
  // ADDR-UTIL-005: Migration detection
  it("[P0] should return true when only legacy address exists", () => {
    const company = createCompanyWithLegacyOnlyAddress();
    expect(needsAddressMigration(company)).toBe(true);
  });

  it("[P0] should return false when structured address exists", () => {
    const company = createCompanyWithStructuredAddress();
    expect(needsAddressMigration(company)).toBe(false);
  });

  it("[P0] should return false when no address exists at all", () => {
    const company = createCompanyWithNoAddress();
    expect(needsAddressMigration(company)).toBe(false);
  });

  it("[P0] should return false when legacy address is empty string", () => {
    const company = createCompanyWithLegacyOnlyAddress({ address: "" });
    expect(needsAddressMigration(company)).toBe(false);
  });

  it("[P0] should return false when legacy address is whitespace only", () => {
    const company = createCompanyWithLegacyOnlyAddress({ address: "   " });
    expect(needsAddressMigration(company)).toBe(false);
  });

  it("[P1] should return false when both formats exist (already migrated)", () => {
    const company = createCompanyWithStructuredAddress({
      address: "Legacy address still exists",
    });
    expect(needsAddressMigration(company)).toBe(false);
  });
});
