/**
 * Lottery Serial Parser Unit Tests (Add Bin Story)
 *
 * Tests for parseSerializedNumber() function used in add bin pack scanning.
 * These are UNIT tests - testing pure function logic in isolation.
 *
 * @test-level Unit
 * @justification Tests pure function logic without external dependencies
 * @story 10-5 - Add Bin Functionality
 * @priority P1 (High - Core parsing logic)
 *
 * RED PHASE: These tests will fail until parseSerializedNumber() is implemented
 * or imported correctly.
 */

import { describe, it, expect } from "vitest";
import {
  parseSerializedNumber,
  isValidSerialNumber,
  extractGameCode,
  InvalidSerialNumberError,
} from "@/lib/utils/lottery-serial-parser";

describe("10-5-UNIT: Lottery Serial Parser (Add Bin)", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // HAPPY PATH TESTS (P1)
  // ═══════════════════════════════════════════════════════════════════════════

  it("10-5-UNIT-001: [P1] should parse valid 24-digit serial number correctly", () => {
    // GIVEN: A valid 24-digit serial number
    const serial = "000112345670123456789012";

    // WHEN: Parsing the serial number
    const result = parseSerializedNumber(serial);

    // THEN: Components are extracted correctly
    expect(result.game_code).toBe("0001");
    expect(result.pack_number).toBe("1234567");
    expect(result.serial_start).toBe("012");
  });

  it("10-5-UNIT-002: [P1] should parse serial with different game code", () => {
    // GIVEN: A serial number with game code "9999"
    const serial = "999912345670123456789012";

    // WHEN: Parsing the serial number
    const result = parseSerializedNumber(serial);

    // THEN: Game code is extracted correctly
    expect(result.game_code).toBe("9999");
    expect(result.pack_number).toBe("1234567");
    expect(result.serial_start).toBe("012");
  });

  it("10-5-UNIT-003: [P1] should parse serial with different pack number", () => {
    // GIVEN: A serial number with pack number "9999999"
    const serial = "000199999990123456789012";

    // WHEN: Parsing the serial number
    const result = parseSerializedNumber(serial);

    // THEN: Pack number is extracted correctly
    expect(result.game_code).toBe("0001");
    expect(result.pack_number).toBe("9999999");
    expect(result.serial_start).toBe("012");
  });

  it("10-5-UNIT-004: [P1] should parse serial with different starting serial", () => {
    // GIVEN: A serial number with starting serial "999"
    const serial = "00011234567999123456789012";

    // WHEN: Parsing the serial number
    const result = parseSerializedNumber(serial);

    // THEN: Starting serial is extracted correctly
    expect(result.game_code).toBe("0001");
    expect(result.pack_number).toBe("1234567");
    expect(result.serial_start).toBe("999");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ERROR CASES (P1)
  // ═══════════════════════════════════════════════════════════════════════════

  it("10-5-UNIT-005: [P1] should throw InvalidSerialNumberError for non-numeric input", () => {
    // GIVEN: A serial number with non-numeric characters
    const serial = "00011234567012345678901a";

    // WHEN: Parsing the serial number
    // THEN: InvalidSerialNumberError is thrown
    expect(() => parseSerializedNumber(serial)).toThrow(
      InvalidSerialNumberError,
    );
    expect(() => parseSerializedNumber(serial)).toThrow(
      "Invalid serial number format. Must be 24 digits.",
    );
  });

  it("10-5-UNIT-006: [P1] should throw InvalidSerialNumberError for too short input", () => {
    // GIVEN: A serial number with less than 24 digits
    const serial = "00011234567012345678901"; // 23 digits

    // WHEN: Parsing the serial number
    // THEN: InvalidSerialNumberError is thrown
    expect(() => parseSerializedNumber(serial)).toThrow(
      InvalidSerialNumberError,
    );
  });

  it("10-5-UNIT-007: [P1] should throw InvalidSerialNumberError for too long input", () => {
    // GIVEN: A serial number with more than 24 digits
    const serial = "0001123456701234567890123"; // 25 digits

    // WHEN: Parsing the serial number
    // THEN: InvalidSerialNumberError is thrown
    expect(() => parseSerializedNumber(serial)).toThrow(
      InvalidSerialNumberError,
    );
  });

  it("10-5-UNIT-008: [P1] should throw InvalidSerialNumberError for empty string", () => {
    // GIVEN: An empty string
    const serial = "";

    // WHEN: Parsing the serial number
    // THEN: InvalidSerialNumberError is thrown
    expect(() => parseSerializedNumber(serial)).toThrow(
      InvalidSerialNumberError,
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDATION HELPER TESTS (P1)
  // ═══════════════════════════════════════════════════════════════════════════

  it("10-5-UNIT-009: [P1] isValidSerialNumber should return true for valid 24-digit serial", () => {
    // GIVEN: A valid 24-digit serial number
    const serial = "000112345670123456789012";

    // WHEN: Validating the serial number
    const result = isValidSerialNumber(serial);

    // THEN: Validation returns true
    expect(result).toBe(true);
  });

  it("10-5-UNIT-010: [P1] isValidSerialNumber should return false for invalid serial", () => {
    // GIVEN: An invalid serial number (23 digits)
    const serial = "00011234567012345678901";

    // WHEN: Validating the serial number
    const result = isValidSerialNumber(serial);

    // THEN: Validation returns false
    expect(result).toBe(false);
  });

  it("10-5-UNIT-011: [P1] extractGameCode should return game code for valid serial", () => {
    // GIVEN: A valid 24-digit serial number
    const serial = "000112345670123456789012";

    // WHEN: Extracting game code
    const result = extractGameCode(serial);

    // THEN: Game code is extracted correctly
    expect(result).toBe("0001");
  });

  it("10-5-UNIT-012: [P1] extractGameCode should return null for invalid serial", () => {
    // GIVEN: An invalid serial number
    const serial = "123"; // Too short

    // WHEN: Extracting game code
    const result = extractGameCode(serial);

    // THEN: Returns null
    expect(result).toBeNull();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASES (P2)
  // ═══════════════════════════════════════════════════════════════════════════

  it("10-5-UNIT-013: [P2] should handle serial with all zeros", () => {
    // GIVEN: A serial number with all zeros
    const serial = "000000000000000000000000";

    // WHEN: Parsing the serial number
    const result = parseSerializedNumber(serial);

    // THEN: Components are extracted correctly (all zeros)
    expect(result.game_code).toBe("0000");
    expect(result.pack_number).toBe("0000000");
    expect(result.serial_start).toBe("000");
  });

  it("10-5-UNIT-014: [P2] should handle serial with all nines", () => {
    // GIVEN: A serial number with all nines
    const serial = "999999999999999999999999";

    // WHEN: Parsing the serial number
    const result = parseSerializedNumber(serial);

    // THEN: Components are extracted correctly (all nines)
    expect(result.game_code).toBe("9999");
    expect(result.pack_number).toBe("9999999");
    expect(result.serial_start).toBe("999");
  });

  it("10-5-UNIT-015: [P2] should handle serial with leading zeros in pack number", () => {
    // GIVEN: A serial number with leading zeros in pack number
    const serial = "000100012340123456789012";

    // WHEN: Parsing the serial number
    const result = parseSerializedNumber(serial);

    // THEN: Pack number preserves leading zeros
    expect(result.game_code).toBe("0001");
    expect(result.pack_number).toBe("0001234");
    expect(result.serial_start).toBe("012");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADDITIONAL EDGE CASES (Applied Automatically)
  // ═══════════════════════════════════════════════════════════════════════════

  it("10-5-UNIT-EDGE-001: [P2] should throw error for whitespace-only string", () => {
    // GIVEN: A string with only whitespace
    const serial = "   ";

    // WHEN: Parsing the serial number
    // THEN: InvalidSerialNumberError is thrown
    expect(() => parseSerializedNumber(serial)).toThrow(
      InvalidSerialNumberError,
    );
  });

  it("10-5-UNIT-EDGE-002: [P2] should throw error for string with whitespace", () => {
    // GIVEN: A serial number with whitespace
    const serial = "000112345670123456789 12"; // Space in middle

    // WHEN: Parsing the serial number
    // THEN: InvalidSerialNumberError is thrown
    expect(() => parseSerializedNumber(serial)).toThrow(
      InvalidSerialNumberError,
    );
  });

  it("10-5-UNIT-EDGE-003: [P2] should throw error for string with special characters", () => {
    // GIVEN: A serial number with special characters
    const specialChars = [
      "!",
      "@",
      "#",
      "$",
      "%",
      "&",
      "*",
      "(",
      ")",
      "-",
      "_",
      "+",
      "=",
    ];
    for (const char of specialChars) {
      const serial = `00011234567012345678901${char}`; // 23 digits + special char

      // WHEN: Parsing the serial number
      // THEN: InvalidSerialNumberError is thrown
      expect(
        () => parseSerializedNumber(serial),
        `Should reject special char: ${char}`,
      ).toThrow(InvalidSerialNumberError);
    }
  });

  it("10-5-UNIT-EDGE-004: [P2] should handle boundary values for each component", () => {
    // GIVEN: Serial with minimum values (all zeros)
    const minSerial = "000000000000000000000000";
    const minResult = parseSerializedNumber(minSerial);
    expect(minResult.game_code).toBe("0000");
    expect(minResult.pack_number).toBe("0000000");
    expect(minResult.serial_start).toBe("000");

    // GIVEN: Serial with maximum values (all nines)
    const maxSerial = "999999999999999999999999";
    const maxResult = parseSerializedNumber(maxSerial);
    expect(maxResult.game_code).toBe("9999");
    expect(maxResult.pack_number).toBe("9999999");
    expect(maxResult.serial_start).toBe("999");
  });

  it("10-5-UNIT-EDGE-005: [P2] should handle exactly 24 characters (boundary)", () => {
    // GIVEN: A serial number with exactly 24 digits (boundary condition)
    const serial = "123456789012345678901234"; // Exactly 24 digits

    // WHEN: Parsing the serial number
    const result = parseSerializedNumber(serial);

    // THEN: Parsing succeeds
    expect(result.game_code).toBe("1234");
    expect(result.pack_number).toBe("5678901");
    expect(result.serial_start).toBe("234");
    expect(result.game_code.length).toBe(4);
    expect(result.pack_number.length).toBe(7);
    expect(result.serial_start.length).toBe(3);
  });

  it("10-5-UNIT-EDGE-006: [P2] isValidSerialNumber should return false for whitespace", () => {
    // GIVEN: Strings with whitespace
    const whitespaceInputs = ["   ", "000112345670123456789 12", "\t", "\n"];

    for (const input of whitespaceInputs) {
      // WHEN: Validating
      const result = isValidSerialNumber(input);

      // THEN: Validation returns false
      expect(result, `Should reject whitespace input: "${input}"`).toBe(false);
    }
  });

  it("10-5-UNIT-EDGE-007: [P2] extractGameCode should handle boundary game codes", () => {
    // GIVEN: Serial with minimum game code (0000)
    const minSerial = "000012345670123456789012";
    expect(extractGameCode(minSerial)).toBe("0000");

    // GIVEN: Serial with maximum game code (9999)
    const maxSerial = "999912345670123456789012";
    expect(extractGameCode(maxSerial)).toBe("9999");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ENHANCED ASSERTIONS (Applied Automatically)
  // ═══════════════════════════════════════════════════════════════════════════

  it("10-5-UNIT-ENH-001: [P1] parseSerializedNumber should return object with correct types", () => {
    // GIVEN: A valid 24-digit serial number
    const serial = "000112345670123456789012";

    // WHEN: Parsing the serial number
    const result = parseSerializedNumber(serial);

    // THEN: Result is an object with correct types
    expect(result, "Result should be an object").toBeInstanceOf(Object);
    expect(result, "Result should have game_code property").toHaveProperty(
      "game_code",
    );
    expect(result, "Result should have pack_number property").toHaveProperty(
      "pack_number",
    );
    expect(result, "Result should have serial_start property").toHaveProperty(
      "serial_start",
    );
    expect(typeof result.game_code, "game_code should be string").toBe(
      "string",
    );
    expect(typeof result.pack_number, "pack_number should be string").toBe(
      "string",
    );
    expect(typeof result.serial_start, "serial_start should be string").toBe(
      "string",
    );
    expect(result.game_code.length, "game_code should be 4 characters").toBe(4);
    expect(
      result.pack_number.length,
      "pack_number should be 7 characters",
    ).toBe(7);
    expect(
      result.serial_start.length,
      "serial_start should be 3 characters",
    ).toBe(3);
  });

  it("10-5-UNIT-ENH-002: [P1] InvalidSerialNumberError should have correct properties", () => {
    // GIVEN: An invalid serial number
    const serial = "invalid";

    // WHEN: Parsing throws error
    let error: InvalidSerialNumberError | null = null;
    try {
      parseSerializedNumber(serial);
    } catch (e) {
      error = e as InvalidSerialNumberError;
    }

    // THEN: Error has correct properties
    expect(error, "Error should be thrown").not.toBeNull();
    expect(
      error,
      "Error should be InvalidSerialNumberError instance",
    ).toBeInstanceOf(InvalidSerialNumberError);
    expect(error?.name, "Error name should be InvalidSerialNumberError").toBe(
      "InvalidSerialNumberError",
    );
    expect(error?.message, "Error should have message").toBeTruthy();
    expect(typeof error?.message, "Error message should be string").toBe(
      "string",
    );
    expect(error?.message, "Error message should mention 24 digits").toContain(
      "24",
    );
  });

  it("10-5-UNIT-ENH-003: [P1] isValidSerialNumber should return boolean", () => {
    // GIVEN: Various inputs
    const validSerial = "000112345670123456789012";
    const invalidSerial = "123";

    // WHEN: Validating
    const validResult = isValidSerialNumber(validSerial);
    const invalidResult = isValidSerialNumber(invalidSerial);

    // THEN: Results are booleans
    expect(typeof validResult, "Valid result should be boolean").toBe(
      "boolean",
    );
    expect(typeof invalidResult, "Invalid result should be boolean").toBe(
      "boolean",
    );
    expect(validResult, "Valid serial should return true").toBe(true);
    expect(invalidResult, "Invalid serial should return false").toBe(false);
  });

  it("10-5-UNIT-ENH-004: [P1] extractGameCode should return string or null", () => {
    // GIVEN: Valid and invalid serials
    const validSerial = "000112345670123456789012";
    const invalidSerial = "123";

    // WHEN: Extracting game code
    const validResult = extractGameCode(validSerial);
    const invalidResult = extractGameCode(invalidSerial);

    // THEN: Results have correct types
    expect(typeof validResult, "Valid result should be string").toBe("string");
    expect(validResult, "Valid result should not be null").not.toBeNull();
    expect(validResult?.length, "Valid game code should be 4 characters").toBe(
      4,
    );
    expect(invalidResult, "Invalid result should be null").toBeNull();
  });
});
