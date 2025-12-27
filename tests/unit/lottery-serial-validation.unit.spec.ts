/**
 * Lottery Serial Validation Unit Tests
 *
 * Comprehensive unit tests for the validateSerialWithinPackRange function
 * and related serial validation utilities.
 *
 * ============================================================================
 * TRACEABILITY MATRIX
 * ============================================================================
 * | Test ID                    | Requirement              | Category         |
 * |----------------------------|--------------------------|------------------|
 * | LSV-001                    | Valid serial in range    | Business Logic   |
 * | LSV-002                    | Serial at range start    | Edge Case        |
 * | LSV-003                    | Serial at range end      | Edge Case        |
 * | LSV-004                    | Serial below range       | Error Handling   |
 * | LSV-005                    | Serial above range       | Error Handling   |
 * | LSV-006                    | Empty serial             | Error Handling   |
 * | LSV-007                    | Non-numeric serial       | Security         |
 * | LSV-008                    | Serial exceeds length    | Security         |
 * | LSV-009                    | BigInt large numbers     | Edge Case        |
 * | LSV-010                    | Whitespace handling      | Edge Case        |
 * | LSV-011                    | Empty pack range         | Error Handling   |
 * | LSV-012                    | Invalid BigInt format    | Error Handling   |
 * | LSV-013                    | Leading zeros preserved  | Business Logic   |
 * | LSV-014                    | Single digit serials     | Edge Case        |
 * | LSV-015                    | Pack range at min/max    | Edge Case        |
 * | LSV-016                    | Length mismatch (short)  | Error Handling   |
 * | LSV-017                    | Length mismatch (long)   | Error Handling   |
 * | LSV-018                    | Length validation msg    | Error Handling   |
 * ============================================================================
 *
 * MCP Guidance Applied:
 * - SEC-014: INPUT_VALIDATION - Strict validation with clear error messages
 * - DB-001: ORM_USAGE - Pure function, no database operations
 * - FE-002: FORM_VALIDATION - Mirror backend validation logic
 *
 * @story Pack Activation Serial Range Validation
 * @priority P0 (Critical - Security & Data Integrity)
 */

import { describe, it, expect } from "vitest";
import {
  validateSerialWithinPackRange,
  validateSerialRange,
  validateSerialFormat,
} from "../../backend/src/services/lottery-validation.service";

describe("validateSerialWithinPackRange", () => {
  // ============================================================================
  // SECTION 1: VALID SERIAL NUMBERS (LSV-001, LSV-002, LSV-003)
  // ============================================================================

  describe("Valid Serial Numbers", () => {
    it("LSV-001: should accept serial in middle of valid range", () => {
      const result = validateSerialWithinPackRange("050", "001", "100");

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("LSV-002: should accept serial at exact range start (inclusive)", () => {
      const result = validateSerialWithinPackRange("001", "001", "100");

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("LSV-003: should accept serial at exact range end (inclusive)", () => {
      const result = validateSerialWithinPackRange("100", "001", "100");

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should accept serial matching pack's single-digit format", () => {
      // Serial "5" should be valid in range 1-9 (single digit format)
      const result = validateSerialWithinPackRange("5", "1", "9");

      expect(result.valid).toBe(true);
    });

    it("should accept serial matching pack's 4-digit format", () => {
      // Serial "0500" should be valid in range 0001-1000 (4-digit format)
      const result = validateSerialWithinPackRange("0500", "0001", "1000");

      expect(result.valid).toBe(true);
    });
  });

  // ============================================================================
  // SECTION 2: OUT OF RANGE ERRORS (LSV-004, LSV-005)
  // ============================================================================

  describe("Out of Range Errors", () => {
    it("LSV-004: should reject serial below pack's starting serial", () => {
      const result = validateSerialWithinPackRange("000", "001", "100");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("below");
      expect(result.error).toContain("001");
      expect(result.error).toContain("100");
    });

    it("LSV-005: should reject serial above pack's ending serial", () => {
      const result = validateSerialWithinPackRange("150", "001", "100");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("exceeds");
      expect(result.error).toContain("100");
    });

    it("should include valid range in error message for below range", () => {
      const result = validateSerialWithinPackRange("000", "050", "150");

      expect(result.error).toContain("Valid range: 050 - 150");
    });

    it("should include valid range in error message for above range", () => {
      const result = validateSerialWithinPackRange("200", "050", "150");

      expect(result.error).toContain("Valid range: 050 - 150");
    });
  });

  // ============================================================================
  // SECTION 3: INPUT VALIDATION (LSV-006, LSV-007, LSV-008)
  // ============================================================================

  describe("Input Validation", () => {
    it("LSV-006: should reject empty serial", () => {
      const result = validateSerialWithinPackRange("", "001", "100");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("required");
    });

    it("LSV-007: should reject non-numeric serial (letters)", () => {
      const result = validateSerialWithinPackRange("abc", "001", "100");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("numeric");
    });

    it("should reject non-numeric serial (special characters)", () => {
      const result = validateSerialWithinPackRange("12-34", "001", "100");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("numeric");
    });

    it("should reject non-numeric serial (mixed alphanumeric)", () => {
      const result = validateSerialWithinPackRange("12a34", "001", "100");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("numeric");
    });

    it("LSV-008: should reject serial exceeding max length (100 chars)", () => {
      const longSerial = "1".repeat(101);
      const result = validateSerialWithinPackRange(
        longSerial,
        "001",
        "999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999",
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain("maximum length");
      expect(result.error).toContain("100");
    });

    it("should accept serial at exactly max length (100 chars)", () => {
      const maxSerial = "1".repeat(100);
      const packStart = "0".repeat(100);
      const packEnd = "9".repeat(100);
      // Serial length must match pack format length
      const result = validateSerialWithinPackRange(
        maxSerial,
        packStart,
        packEnd,
      );

      expect(result.valid).toBe(true);
    });
  });

  // ============================================================================
  // SECTION 4: BIGINT EDGE CASES (LSV-009)
  // ============================================================================

  describe("BigInt Large Number Handling", () => {
    it("LSV-009: should correctly compare 24-digit serial numbers", () => {
      // Numbers larger than Number.MAX_SAFE_INTEGER (9007199254740991)
      const largeSerial = "123456789012345678901234";
      const rangeStart = "100000000000000000000000";
      const rangeEnd = "200000000000000000000000";

      const result = validateSerialWithinPackRange(
        largeSerial,
        rangeStart,
        rangeEnd,
      );

      expect(result.valid).toBe(true);
    });

    it("should reject large serial below range using BigInt comparison", () => {
      const largeSerial = "099999999999999999999999";
      const rangeStart = "100000000000000000000000";
      const rangeEnd = "200000000000000000000000";

      const result = validateSerialWithinPackRange(
        largeSerial,
        rangeStart,
        rangeEnd,
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain("below");
    });

    it("should reject large serial above range using BigInt comparison", () => {
      const largeSerial = "300000000000000000000000";
      const rangeStart = "100000000000000000000000";
      const rangeEnd = "200000000000000000000000";

      const result = validateSerialWithinPackRange(
        largeSerial,
        rangeStart,
        rangeEnd,
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain("exceeds");
    });

    it("should handle numbers at Number.MAX_SAFE_INTEGER boundary", () => {
      // Just above MAX_SAFE_INTEGER
      const serial = "9007199254740992";
      const rangeStart = "9007199254740990";
      const rangeEnd = "9007199254740999";

      const result = validateSerialWithinPackRange(
        serial,
        rangeStart,
        rangeEnd,
      );

      expect(result.valid).toBe(true);
    });
  });

  // ============================================================================
  // SECTION 5: WHITESPACE AND FORMATTING (LSV-010, LSV-013, LSV-014)
  // ============================================================================

  describe("Whitespace and Formatting", () => {
    it("LSV-010: should trim whitespace from serial", () => {
      const result = validateSerialWithinPackRange("  050  ", "001", "100");

      expect(result.valid).toBe(true);
    });

    it("should trim whitespace from pack range values", () => {
      const result = validateSerialWithinPackRange("050", "  001  ", "  100  ");

      expect(result.valid).toBe(true);
    });

    it("LSV-013: should preserve leading zeros in comparison", () => {
      // "001" should be treated as 1 numerically
      const result = validateSerialWithinPackRange("001", "001", "100");

      expect(result.valid).toBe(true);
    });

    it("LSV-014: should handle single digit serials", () => {
      const result = validateSerialWithinPackRange("5", "1", "9");

      expect(result.valid).toBe(true);
    });

    it("should reject whitespace-only serial", () => {
      const result = validateSerialWithinPackRange("   ", "001", "100");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("required");
    });
  });

  // ============================================================================
  // SECTION 6: PACK RANGE VALIDATION (LSV-011, LSV-012, LSV-015)
  // ============================================================================

  describe("Pack Range Validation", () => {
    it("LSV-011: should reject when pack range start is empty", () => {
      const result = validateSerialWithinPackRange("050", "", "100");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("range is not defined");
    });

    it("should reject when pack range end is empty", () => {
      const result = validateSerialWithinPackRange("050", "001", "");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("range is not defined");
    });

    it("LSV-012: should handle invalid BigInt format gracefully", () => {
      // This shouldn't happen with proper pack data, but test defense in depth
      const result = validateSerialWithinPackRange("abc", "001", "100");

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("LSV-015: should handle pack with single valid serial (start === end)", () => {
      const result = validateSerialWithinPackRange("050", "050", "050");

      expect(result.valid).toBe(true);
    });

    it("should reject serial when pack has single valid serial and serial doesn't match", () => {
      const result = validateSerialWithinPackRange("051", "050", "050");

      expect(result.valid).toBe(false);
    });
  });

  // ============================================================================
  // SECTION 7: SECURITY-FOCUSED TESTS
  // ============================================================================

  describe("Security Tests", () => {
    it("should reject negative numbers (represented as strings)", () => {
      const result = validateSerialWithinPackRange("-1", "001", "100");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("numeric");
    });

    it("should reject decimal numbers", () => {
      const result = validateSerialWithinPackRange("50.5", "001", "100");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("numeric");
    });

    it("should reject scientific notation", () => {
      const result = validateSerialWithinPackRange("1e5", "001", "999999");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("numeric");
    });

    it("should reject hexadecimal notation", () => {
      const result = validateSerialWithinPackRange("0xFF", "001", "999");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("numeric");
    });

    it("should reject SQL injection attempt", () => {
      const result = validateSerialWithinPackRange(
        "1; DROP TABLE--",
        "001",
        "100",
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain("numeric");
    });

    it("should reject script injection attempt", () => {
      const result = validateSerialWithinPackRange(
        "<script>alert(1)</script>",
        "001",
        "100",
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain("numeric");
    });
  });

  // ============================================================================
  // SECTION 8: LENGTH VALIDATION (LSV-016, LSV-017, LSV-018)
  // ============================================================================

  describe("Serial Length Validation", () => {
    it("LSV-016: should reject serial with fewer digits than pack format", () => {
      // Pack uses 3-digit format (001-150), serial "50" is only 2 digits
      const result = validateSerialWithinPackRange("50", "001", "150");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("exactly 3 digits");
    });

    it("LSV-017: should reject serial with more digits than pack format", () => {
      // Pack uses 3-digit format (001-150), serial "0050" is 4 digits
      const result = validateSerialWithinPackRange("0050", "001", "150");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("exactly 3 digits");
    });

    it("LSV-018: should include expected length in error message", () => {
      const result = validateSerialWithinPackRange("5", "001", "150");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("3 digits");
      expect(result.error).toContain("match pack format");
    });

    it("should validate length before checking range", () => {
      // "1" would be in range numerically (1 < 150), but wrong length
      const result = validateSerialWithinPackRange("1", "001", "150");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("exactly 3 digits");
      // Should NOT contain range error since length check happens first
      expect(result.error).not.toContain("below");
      expect(result.error).not.toContain("exceeds");
    });

    it("should accept serial with correct length at range boundary", () => {
      // 3-digit format, testing edge of valid range
      const result = validateSerialWithinPackRange("001", "001", "150");

      expect(result.valid).toBe(true);
    });

    it("should reject wrong length even if numeric value would be valid", () => {
      // "99" is numerically in range 001-150, but wrong format
      const result = validateSerialWithinPackRange("99", "001", "150");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("exactly 3 digits");
    });

    it("should handle 2-digit pack format correctly", () => {
      const result = validateSerialWithinPackRange("05", "01", "50");

      expect(result.valid).toBe(true);
    });

    it("should reject 3-digit serial for 2-digit pack format", () => {
      const result = validateSerialWithinPackRange("005", "01", "50");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("exactly 2 digits");
    });

    it("should handle 5-digit pack format correctly", () => {
      const result = validateSerialWithinPackRange("00500", "00001", "99999");

      expect(result.valid).toBe(true);
    });
  });
});

// ============================================================================
// ADDITIONAL TESTS FOR EXISTING VALIDATION FUNCTIONS
// ============================================================================

describe("validateSerialRange", () => {
  it("should validate that start is less than end", () => {
    const result = validateSerialRange("001", "100");
    expect(result.valid).toBe(true);
  });

  it("should reject when start equals end", () => {
    const result = validateSerialRange("100", "100");
    expect(result.valid).toBe(false);
  });

  it("should reject when start is greater than end", () => {
    const result = validateSerialRange("100", "001");
    expect(result.valid).toBe(false);
  });
});

describe("validateSerialFormat", () => {
  it("should accept valid numeric format", () => {
    const result = validateSerialFormat("001", "100");
    expect(result.valid).toBe(true);
  });

  it("should reject non-numeric start", () => {
    const result = validateSerialFormat("abc", "100");
    expect(result.valid).toBe(false);
  });

  it("should reject non-numeric end", () => {
    const result = validateSerialFormat("001", "abc");
    expect(result.valid).toBe(false);
  });
});
