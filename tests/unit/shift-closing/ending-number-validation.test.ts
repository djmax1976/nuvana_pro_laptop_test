/**
 * Ending Number Input Validation Unit Tests
 *
 * Tests for 3-digit numeric input validation logic:
 * - Numeric-only validation (0-9)
 * - Exactly 3 digits (not less, not more)
 * - Input formatting and constraints
 *
 * @test-level Unit
 * @justification Tests pure validation logic without external dependencies
 * @story 10-1 - Lottery Shift Closing Page UI
 * @priority P1 (High - Input Validation)
 */

import { describe, it, expect } from "vitest";

/**
 * Validates ending number input
 * - Only accepts numeric characters (0-9)
 * - Must be exactly 3 digits
 * - Returns validation result with error message if invalid
 */
function validateEndingNumber(input: string): {
  valid: boolean;
  error?: string;
} {
  // GIVEN: Input string
  // WHEN: Validating format
  if (!input) {
    return { valid: false, error: "Ending number is required" };
  }

  // Check numeric only
  if (!/^\d+$/.test(input)) {
    return { valid: false, error: "Only numeric characters (0-9) are allowed" };
  }

  // Check exactly 3 digits
  if (input.length !== 3) {
    return {
      valid: false,
      error: `Ending number must be exactly 3 digits (got ${input.length})`,
    };
  }

  // THEN: Validation passes
  return { valid: true };
}

/**
 * Finds next active bin in display_order sequence
 * - Skips empty bins (pack === null)
 * - Traverses in display_order
 * - Returns null if last bin
 */
function findNextActiveBin(
  bins: Array<{
    bin_id: string;
    display_order: number;
    pack: { pack_id: string } | null;
  }>,
  currentBinId: string,
): string | null {
  // GIVEN: Current bin ID and bins array
  const currentBin = bins.find((b) => b.bin_id === currentBinId);
  if (!currentBin) {
    return null;
  }

  // WHEN: Finding next active bin
  const sortedBins = [...bins].sort(
    (a, b) => a.display_order - b.display_order,
  );
  const currentIndex = sortedBins.findIndex((b) => b.bin_id === currentBinId);

  // Find next bin with active pack
  for (let i = currentIndex + 1; i < sortedBins.length; i++) {
    if (sortedBins[i].pack !== null) {
      return sortedBins[i].bin_id;
    }
  }

  // THEN: No next active bin (last bin)
  return null;
}

/**
 * Validates all active bins have valid 3-digit ending numbers
 * - Checks only bins with active packs (pack !== null)
 * - Empty bins do not count toward requirement
 * - Returns true only when all active bins have valid entries
 */
function validateAllActiveBinsComplete(
  bins: Array<{ bin_id: string; pack: { pack_id: string } | null }>,
  endingNumbers: Record<string, string>,
): boolean {
  // GIVEN: Bins array and ending numbers map
  // WHEN: Checking all active bins
  const activeBins = bins.filter((b) => b.pack !== null);

  for (const bin of activeBins) {
    const endingNumber = endingNumbers[bin.bin_id];
    const validation = validateEndingNumber(endingNumber || "");

    // THEN: All active bins must have valid entries
    if (!validation.valid) {
      return false;
    }
  }

  return true;
}

describe("10-1-UNIT: Ending Number Input Validation", () => {
  describe("validateEndingNumber", () => {
    it("10-1-UNIT-001: should accept valid 3-digit number", () => {
      // GIVEN: A valid 3-digit number
      const input = "045";

      // WHEN: Validating format
      const result = validateEndingNumber(input);

      // THEN: Validation passes
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("10-1-UNIT-002: should reject empty input", () => {
      // GIVEN: An empty string
      const input = "";

      // WHEN: Validating format
      const result = validateEndingNumber(input);

      // THEN: Validation fails
      expect(result.valid).toBe(false);
      expect(result.error).toContain("required");
    });

    it("10-1-UNIT-003: should reject non-numeric characters", () => {
      // GIVEN: Input with non-numeric characters
      const input = "abc";

      // WHEN: Validating format
      const result = validateEndingNumber(input);

      // THEN: Validation fails
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Only numeric characters");
    });

    it("10-1-UNIT-004: should reject input with less than 3 digits", () => {
      // GIVEN: Input with 2 digits
      const input = "45";

      // WHEN: Validating format
      const result = validateEndingNumber(input);

      // THEN: Validation fails
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exactly 3 digits");
    });

    it("10-1-UNIT-005: should reject input with more than 3 digits", () => {
      // GIVEN: Input with 4 digits
      const input = "0456";

      // WHEN: Validating format
      const result = validateEndingNumber(input);

      // THEN: Validation fails
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exactly 3 digits");
    });

    it("10-1-UNIT-006: should accept edge case '000'", () => {
      // GIVEN: Minimum valid value
      const input = "000";

      // WHEN: Validating format
      const result = validateEndingNumber(input);

      // THEN: Validation passes
      expect(result.valid).toBe(true);
    });

    it("10-1-UNIT-007: should accept edge case '999'", () => {
      // GIVEN: Maximum valid value
      const input = "999";

      // WHEN: Validating format
      const result = validateEndingNumber(input);

      // THEN: Validation passes
      expect(result.valid).toBe(true);
    });

    it("10-1-UNIT-008: should reject mixed alphanumeric input", () => {
      // GIVEN: Input with numbers and letters
      const input = "12a";

      // WHEN: Validating format
      const result = validateEndingNumber(input);

      // THEN: Validation fails
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Only numeric characters");
    });
  });

  describe("findNextActiveBin", () => {
    it("10-1-UNIT-009: should find next active bin in display_order", () => {
      // GIVEN: Bins with active packs in display_order
      const bins = [
        { bin_id: "bin-1", display_order: 1, pack: { pack_id: "pack-1" } },
        { bin_id: "bin-2", display_order: 2, pack: { pack_id: "pack-2" } },
        { bin_id: "bin-3", display_order: 3, pack: null },
        { bin_id: "bin-4", display_order: 4, pack: { pack_id: "pack-4" } },
      ];

      // WHEN: Finding next active bin from bin-1
      const result = findNextActiveBin(bins, "bin-1");

      // THEN: Returns bin-2 (skips empty bin-3)
      expect(result).toBe("bin-2");
    });

    it("10-1-UNIT-010: should skip empty bins in sequence", () => {
      // GIVEN: Bins with empty bins in between
      const bins = [
        { bin_id: "bin-1", display_order: 1, pack: { pack_id: "pack-1" } },
        { bin_id: "bin-2", display_order: 2, pack: null },
        { bin_id: "bin-3", display_order: 3, pack: null },
        { bin_id: "bin-4", display_order: 4, pack: { pack_id: "pack-4" } },
      ];

      // WHEN: Finding next active bin from bin-1
      const result = findNextActiveBin(bins, "bin-1");

      // THEN: Returns bin-4 (skips empty bins)
      expect(result).toBe("bin-4");
    });

    it("10-1-UNIT-011: should return null for last active bin", () => {
      // GIVEN: Last active bin in sequence
      const bins = [
        { bin_id: "bin-1", display_order: 1, pack: { pack_id: "pack-1" } },
        { bin_id: "bin-2", display_order: 2, pack: null },
        { bin_id: "bin-3", display_order: 3, pack: { pack_id: "pack-3" } },
      ];

      // WHEN: Finding next active bin from bin-3
      const result = findNextActiveBin(bins, "bin-3");

      // THEN: Returns null (last active bin)
      expect(result).toBeNull();
    });

    it("10-1-UNIT-012: should handle bins not in order", () => {
      // GIVEN: Bins with display_order not sequential
      const bins = [
        { bin_id: "bin-3", display_order: 3, pack: { pack_id: "pack-3" } },
        { bin_id: "bin-1", display_order: 1, pack: { pack_id: "pack-1" } },
        { bin_id: "bin-2", display_order: 2, pack: { pack_id: "pack-2" } },
      ];

      // WHEN: Finding next active bin from bin-1
      const result = findNextActiveBin(bins, "bin-1");

      // THEN: Returns bin-2 (sorted by display_order)
      expect(result).toBe("bin-2");
    });
  });

  describe("validateAllActiveBinsComplete", () => {
    it("10-1-UNIT-013: should return true when all active bins have valid entries", () => {
      // GIVEN: All active bins have valid 3-digit entries
      const bins = [
        { bin_id: "bin-1", pack: { pack_id: "pack-1" } },
        { bin_id: "bin-2", pack: { pack_id: "pack-2" } },
        { bin_id: "bin-3", pack: null }, // Empty bin (ignored)
      ];
      const endingNumbers = {
        "bin-1": "045",
        "bin-2": "123",
      };

      // WHEN: Validating all active bins
      const result = validateAllActiveBinsComplete(bins, endingNumbers);

      // THEN: Validation passes
      expect(result).toBe(true);
    });

    it("10-1-UNIT-014: should return false when any active bin missing entry", () => {
      // GIVEN: One active bin missing entry
      const bins = [
        { bin_id: "bin-1", pack: { pack_id: "pack-1" } },
        { bin_id: "bin-2", pack: { pack_id: "pack-2" } },
      ];
      const endingNumbers = {
        "bin-1": "045",
        // bin-2 missing
      };

      // WHEN: Validating all active bins
      const result = validateAllActiveBinsComplete(bins, endingNumbers);

      // THEN: Validation fails
      expect(result).toBe(false);
    });

    it("10-1-UNIT-015: should return false when any active bin has invalid entry", () => {
      // GIVEN: One active bin has invalid entry (2 digits)
      const bins = [
        { bin_id: "bin-1", pack: { pack_id: "pack-1" } },
        { bin_id: "bin-2", pack: { pack_id: "pack-2" } },
      ];
      const endingNumbers = {
        "bin-1": "045",
        "bin-2": "12", // Invalid: only 2 digits
      };

      // WHEN: Validating all active bins
      const result = validateAllActiveBinsComplete(bins, endingNumbers);

      // THEN: Validation fails
      expect(result).toBe(false);
    });

    it("10-1-UNIT-016: should ignore empty bins in validation", () => {
      // GIVEN: Empty bins do not need entries
      const bins = [
        { bin_id: "bin-1", pack: { pack_id: "pack-1" } },
        { bin_id: "bin-2", pack: null }, // Empty bin (ignored)
        { bin_id: "bin-3", pack: { pack_id: "pack-3" } },
      ];
      const endingNumbers = {
        "bin-1": "045",
        "bin-3": "123",
        // bin-2 not required (empty bin)
      };

      // WHEN: Validating all active bins
      const result = validateAllActiveBinsComplete(bins, endingNumbers);

      // THEN: Validation passes (empty bins ignored)
      expect(result).toBe(true);
    });

    it("10-1-UNIT-017: should return true when all bins are empty", () => {
      // GIVEN: All bins are empty
      const bins = [
        { bin_id: "bin-1", pack: null },
        { bin_id: "bin-2", pack: null },
      ];
      const endingNumbers = {};

      // WHEN: Validating all active bins
      const result = validateAllActiveBinsComplete(bins, endingNumbers);

      // THEN: Validation passes (no active bins to validate)
      expect(result).toBe(true);
    });
  });

  // ============ BUSINESS LOGIC VALIDATION ============

  /**
   * Validates ending serial against business rules:
   * - Ending serial must be >= starting_serial
   * - Ending serial must be <= serial_end
   * - Starting serial for brand new pack is "000"
   */
  function validateEndingSerialRange(
    endingSerial: string,
    startingSerial: string,
    serialEnd: string,
  ): { valid: boolean; error?: string } {
    // GIVEN: Ending serial, starting serial, and serial end
    // WHEN: Validating range constraints

    // First validate format (3 digits)
    const formatValidation = validateEndingNumber(endingSerial);
    if (!formatValidation.valid) {
      return formatValidation;
    }

    // Convert to numbers for comparison
    const ending = parseInt(endingSerial, 10);
    const starting = parseInt(startingSerial, 10);
    const end = parseInt(serialEnd, 10);

    // Business rule: ending >= starting
    if (ending < starting) {
      return {
        valid: false,
        error: `Ending serial (${endingSerial}) must be >= starting serial (${startingSerial})`,
      };
    }

    // Business rule: ending <= serial_end
    if (ending > end) {
      return {
        valid: false,
        error: `Ending serial (${endingSerial}) must be <= serial_end (${serialEnd})`,
      };
    }

    // THEN: Validation passes
    return { valid: true };
  }

  describe("validateEndingSerialRange (Business Logic)", () => {
    it("10-1-UNIT-BUSINESS-001: should accept ending serial >= starting serial", () => {
      // GIVEN: Ending serial is greater than starting serial
      const endingSerial = "100";
      const startingSerial = "045";
      const serialEnd = "200";

      // WHEN: Validating range
      const result = validateEndingSerialRange(
        endingSerial,
        startingSerial,
        serialEnd,
      );

      // THEN: Validation passes
      expect(result.valid).toBe(true);
    });

    it("10-1-UNIT-BUSINESS-002: should accept ending serial equal to starting serial", () => {
      // GIVEN: Ending serial equals starting serial (pack not sold)
      const endingSerial = "045";
      const startingSerial = "045";
      const serialEnd = "200";

      // WHEN: Validating range
      const result = validateEndingSerialRange(
        endingSerial,
        startingSerial,
        serialEnd,
      );

      // THEN: Validation passes
      expect(result.valid).toBe(true);
    });

    it("10-1-UNIT-BUSINESS-003: should reject ending serial < starting serial", () => {
      // GIVEN: Ending serial is less than starting serial (invalid)
      const endingSerial = "030";
      const startingSerial = "045";
      const serialEnd = "200";

      // WHEN: Validating range
      const result = validateEndingSerialRange(
        endingSerial,
        startingSerial,
        serialEnd,
      );

      // THEN: Validation fails
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must be >=");
    });

    it("10-1-UNIT-BUSINESS-004: should accept ending serial <= serial_end", () => {
      // GIVEN: Ending serial is less than or equal to serial_end
      const endingSerial = "100";
      const startingSerial = "045";
      const serialEnd = "100";

      // WHEN: Validating range
      const result = validateEndingSerialRange(
        endingSerial,
        startingSerial,
        serialEnd,
      );

      // THEN: Validation passes
      expect(result.valid).toBe(true);
    });

    it("10-1-UNIT-BUSINESS-005: should reject ending serial > serial_end", () => {
      // GIVEN: Ending serial exceeds pack's maximum serial_end
      const endingSerial = "201";
      const startingSerial = "045";
      const serialEnd = "200";

      // WHEN: Validating range
      const result = validateEndingSerialRange(
        endingSerial,
        startingSerial,
        serialEnd,
      );

      // THEN: Validation fails
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must be <=");
    });

    it("10-1-UNIT-BUSINESS-006: should accept ending serial for brand new pack (starting = '000')", () => {
      // GIVEN: Brand new pack with starting serial "000"
      const endingSerial = "050";
      const startingSerial = "000"; // Brand new pack
      const serialEnd = "100";

      // WHEN: Validating range
      const result = validateEndingSerialRange(
        endingSerial,
        startingSerial,
        serialEnd,
      );

      // THEN: Validation passes
      expect(result.valid).toBe(true);
    });

    it("10-1-UNIT-BUSINESS-007: should accept ending serial '000' for brand new pack", () => {
      // GIVEN: Brand new pack with ending serial "000" (pack not sold)
      const endingSerial = "000";
      const startingSerial = "000"; // Brand new pack
      const serialEnd = "100";

      // WHEN: Validating range
      const result = validateEndingSerialRange(
        endingSerial,
        startingSerial,
        serialEnd,
      );

      // THEN: Validation passes
      expect(result.valid).toBe(true);
    });

    it("10-1-UNIT-BUSINESS-008: should validate ending serial within full range", () => {
      // GIVEN: Ending serial within valid range [starting, serial_end]
      const endingSerial = "075";
      const startingSerial = "045";
      const serialEnd = "100";

      // WHEN: Validating range
      const result = validateEndingSerialRange(
        endingSerial,
        startingSerial,
        serialEnd,
      );

      // THEN: Validation passes
      expect(result.valid).toBe(true);
    });

    it("10-1-UNIT-BUSINESS-009: should reject ending serial outside valid range", () => {
      // GIVEN: Ending serial outside valid range
      const testCases = [
        {
          ending: "030",
          starting: "045",
          end: "100",
          reason: "below starting",
        },
        {
          ending: "101",
          starting: "045",
          end: "100",
          reason: "above serial_end",
        },
      ];

      for (const testCase of testCases) {
        // WHEN: Validating range
        const result = validateEndingSerialRange(
          testCase.ending,
          testCase.starting,
          testCase.end,
        );

        // THEN: Validation fails
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }
    });
  });
});
