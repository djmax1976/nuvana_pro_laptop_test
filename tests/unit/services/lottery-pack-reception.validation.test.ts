/**
 * Unit Tests: Lottery Pack Reception Validation
 *
 * Tests validation logic for lottery pack reception:
 * - Serial range validation (serial_start < serial_end) using BigInt for numeric comparison
 * - Pack number format validation
 * - Serial number format validation (numeric-only)
 * - Game ID validation (UUID format)
 * - Bin ID validation (optional, UUID format)
 *
 * @test-level UNIT
 * @justification Pure validation logic without database operations - business rules validation
 * @story 6.2 - Lottery Pack Reception
 * @priority P0 (Critical - Business Logic Validation)
 *
 * Business Rules:
 * - Serial numbers must be numeric-only (digits 0-9)
 * - Serial range comparison must use BigInt for accurate numeric comparison (24-digit numbers)
 * - Pack numbers: 1-50 characters (any format)
 * - Game ID: required, valid UUID
 * - Bin ID: optional, valid UUID if provided
 */

import { describe, it, expect } from "vitest";
import {
  validateSerialRange,
  validateSerialFormat,
  validatePackNumber,
  validateGameIdFormat,
  validateBinIdFormat,
  validatePackReceptionData,
} from "../../../backend/src/services/lottery-validation.service";

// ═══════════════════════════════════════════════════════════════════════════
// SERIAL RANGE VALIDATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("6.2-UNIT: Serial Range Validation", () => {
  it("6.2-UNIT-001: [P0] should validate serial_start < serial_end for numeric serials", () => {
    const result = validateSerialRange(
      "184303159650093783374530",
      "184303159650093783374680",
    );

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("6.2-UNIT-002: [P0] should reject serial_start > serial_end", () => {
    const result = validateSerialRange(
      "184303159650093783374680",
      "184303159650093783374530",
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain("serial_start must be less than serial_end");
  });

  it("6.2-UNIT-003: [P0] should reject serial_start equal to serial_end", () => {
    const result = validateSerialRange(
      "184303159650093783374530",
      "184303159650093783374530",
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain("serial_start must be less than serial_end");
  });

  it("6.2-UNIT-020: [P0] should use BigInt for numeric comparison of large serial numbers", () => {
    // These numbers exceed Number.MAX_SAFE_INTEGER
    const result = validateSerialRange(
      "999999999999999999999999",
      "1000000000000000000000000",
    );

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("6.2-UNIT-021: [P0] should correctly compare serial numbers where string comparison would fail", () => {
    // String comparison: "9" > "10" is true (wrong)
    // BigInt comparison: 9n < 10n is true (correct)
    const result = validateSerialRange(
      "999999999999999999999999",
      "1000000000000000000000000",
    );

    expect(result.valid).toBe(true);
  });

  it("should reject non-numeric serial numbers in range validation", () => {
    const result = validateSerialRange("ABC123", "XYZ789");

    expect(result.valid).toBe(false);
    expect(result.error).toContain("numeric");
  });

  it("should reject empty serial_start in range validation", () => {
    const result = validateSerialRange("", "184303159650093783374680");

    expect(result.valid).toBe(false);
    expect(result.error).toContain("required");
  });

  it("should reject empty serial_end in range validation", () => {
    const result = validateSerialRange("184303159650093783374530", "");

    expect(result.valid).toBe(false);
    expect(result.error).toContain("required");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SERIAL FORMAT VALIDATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("6.2-UNIT: Serial Format Validation", () => {
  it("6.2-UNIT-004: [P0] should reject non-numeric serial numbers", () => {
    const result = validateSerialFormat("ABC123DEF456", "XYZ789GHI012");

    expect(result.valid).toBe(false);
    expect(result.error).toContain("numeric");
  });

  it("6.2-UNIT-005: [P0] should accept valid numeric serial numbers", () => {
    const result = validateSerialFormat(
      "184303159650093783374530",
      "184303159650093783374680",
    );

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("6.2-UNIT-006: [P0] should reject empty serial_start", () => {
    const result = validateSerialFormat("", "184303159650093783374680");

    expect(result.valid).toBe(false);
    expect(result.error).toContain("required");
  });

  it("6.2-UNIT-007: [P0] should reject empty serial_end", () => {
    const result = validateSerialFormat("184303159650093783374530", "");

    expect(result.valid).toBe(false);
    expect(result.error).toContain("required");
  });

  it("6.2-UNIT-022: [P0] should handle serial_start with leading/trailing whitespace", () => {
    // Whitespace should be trimmed before validation
    const result = validateSerialFormat(
      "  184303159650093783374530  ",
      "184303159650093783374680",
    );

    expect(result.valid).toBe(true);
  });

  it("6.2-UNIT-023: [P0] should reject very long serial numbers (1000+ chars)", () => {
    const result = validateSerialFormat("1".repeat(1000), "2".repeat(1000));

    expect(result.valid).toBe(false);
    expect(result.error).toContain("exceeds maximum length");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PACK NUMBER VALIDATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("6.2-UNIT: Pack Number Validation", () => {
  it("6.2-UNIT-008: [P0] should reject empty pack_number", () => {
    const result = validatePackNumber("");

    expect(result.valid).toBe(false);
    expect(result.error).toContain("required");
  });

  it("6.2-UNIT-009: [P0] should reject pack_number exceeding 50 characters", () => {
    const result = validatePackNumber("A".repeat(51));

    expect(result.valid).toBe(false);
    expect(result.error).toContain("50 characters");
  });

  it("6.2-UNIT-010: [P0] should accept valid pack_number", () => {
    const result = validatePackNumber("PACK-12345");

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("6.2-UNIT-011: [P0] should accept pack_number at max length (50 characters)", () => {
    const result = validatePackNumber("A".repeat(50));

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("6.2-UNIT-024: [P0] should accept pack_number with special characters", () => {
    // Special characters are allowed - XSS prevention is at rendering layer
    const result = validatePackNumber("PACK-001<script>alert('xss')</script>");

    expect(result.valid).toBe(true);
  });

  it("6.2-UNIT-025: [P0] should accept pack_number with unicode/emoji characters", () => {
    const result = validatePackNumber("PACK-😀-测试-001");

    expect(result.valid).toBe(true);
  });

  it("should handle whitespace-only pack_number as empty", () => {
    const result = validatePackNumber("   ");

    expect(result.valid).toBe(false);
    expect(result.error).toContain("required");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GAME ID VALIDATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("6.2-UNIT: Game ID Validation", () => {
  it("6.2-UNIT-012: [P0] should reject empty game_id", () => {
    const result = validateGameIdFormat("");

    expect(result.valid).toBe(false);
    expect(result.error).toContain("required");
  });

  it("6.2-UNIT-013: [P0] should reject invalid UUID format", () => {
    const result = validateGameIdFormat("not-a-valid-uuid");

    expect(result.valid).toBe(false);
    expect(result.error).toContain("UUID");
  });

  it("6.2-UNIT-014: [P0] should accept valid UUID format", () => {
    const result = validateGameIdFormat("550e8400-e29b-41d4-a716-446655440000");

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("should reject UUID with wrong version", () => {
    // Version 6 is not commonly used
    const result = validateGameIdFormat("550e8400-e29b-61d4-a716-446655440000");

    expect(result.valid).toBe(false);
  });

  it("should accept UUID v4 format", () => {
    const result = validateGameIdFormat("f47ac10b-58cc-4372-a567-0e02b2c3d479");

    expect(result.valid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BIN ID VALIDATION TESTS (OPTIONAL FIELD)
// ═══════════════════════════════════════════════════════════════════════════

describe("6.2-UNIT: Bin ID Validation (Optional)", () => {
  it("6.2-UNIT-015: [P0] should accept undefined bin_id", () => {
    const result = validateBinIdFormat(undefined);

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("6.2-UNIT-016: [P0] should reject invalid UUID format when provided", () => {
    const result = validateBinIdFormat("not-a-valid-uuid");

    expect(result.valid).toBe(false);
    expect(result.error).toContain("UUID");
  });

  it("6.2-UNIT-017: [P0] should accept valid UUID format when provided", () => {
    const result = validateBinIdFormat("550e8400-e29b-41d4-a716-446655440000");

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("should treat empty string as not provided", () => {
    const result = validateBinIdFormat("");

    expect(result.valid).toBe(true);
  });

  it("should treat whitespace-only as not provided", () => {
    const result = validateBinIdFormat("   ");

    expect(result.valid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPOSITE VALIDATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("6.2-UNIT: Composite Pack Reception Validation", () => {
  it("6.2-UNIT-018: [P0] should validate all required fields together", () => {
    const result = validatePackReceptionData({
      game_id: "550e8400-e29b-41d4-a716-446655440000",
      pack_number: "PACK-12345",
      serial_start: "184303159650093783374530",
      serial_end: "184303159650093783374680",
      bin_id: undefined,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("6.2-UNIT-019: [P0] should collect all validation errors for invalid data", () => {
    const result = validatePackReceptionData({
      game_id: "",
      pack_number: "",
      serial_start: "ABC123",
      serial_end: "XYZ789",
      bin_id: "not-uuid",
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);

    // Check that errors have proper structure
    result.errors.forEach((error) => {
      expect(error).toHaveProperty("field");
      expect(error).toHaveProperty("error");
      expect(typeof error.field).toBe("string");
      expect(typeof error.error).toBe("string");
    });

    // Verify specific errors are present
    const fieldNames = result.errors.map((e) => e.field);
    expect(fieldNames).toContain("game_id");
    expect(fieldNames).toContain("pack_number");
    expect(fieldNames).toContain("bin_id");
  });

  it("should validate with optional bin_id provided", () => {
    const result = validatePackReceptionData({
      game_id: "550e8400-e29b-41d4-a716-446655440000",
      pack_number: "PACK-12345",
      serial_start: "184303159650093783374530",
      serial_end: "184303159650093783374680",
      bin_id: "660e8400-e29b-41d4-a716-446655440000",
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("should catch serial range errors when format is valid", () => {
    const result = validatePackReceptionData({
      game_id: "550e8400-e29b-41d4-a716-446655440000",
      pack_number: "PACK-12345",
      serial_start: "184303159650093783374680", // start > end
      serial_end: "184303159650093783374530",
      bin_id: undefined,
    });

    expect(result.valid).toBe(false);
    const rangeError = result.errors.find((e) => e.field === "serial_range");
    expect(rangeError).toBeDefined();
    expect(rangeError?.error).toContain("less than");
  });
});
