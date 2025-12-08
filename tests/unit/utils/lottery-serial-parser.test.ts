/**
 * @test-level UNIT
 * @justification Tests pure serial parsing logic - no dependencies, fast execution
 * @story 6.12
 * @enhanced-by workflow-9 on 2025-01-28
 *
 * Unit Tests: Lottery Serial Parser Utility
 *
 * Tests serial number parsing logic:
 * - Parse 24-digit serial into components (game_code, pack_number, serial_start)
 * - Validate serial format (exactly 24 digits, numeric only)
 * - Error handling for invalid formats
 * - Edge cases (boundaries, special characters, whitespace)
 *
 * Story: 6.12 - Serialized Pack Reception with Batch Processing
 * Priority: P0 (Foundation - Serial Parsing)
 */

import { describe, it, expect } from "vitest";
import {
  parseSerializedNumber,
  isValidSerialNumber,
  extractGameCode,
  InvalidSerialNumberError,
  ParsedSerialNumber,
} from "../../../backend/src/utils/lottery-serial-parser";

// ═══════════════════════════════════════════════════════════════════════════
// SERIAL PARSING TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("6.12-UNIT: parseSerializedNumber", () => {
  it("6.12-UNIT-004: should parse valid 24-digit serial correctly", () => {
    // GIVEN: Valid 24-digit serial number
    const serial = "000112345670123456789012";

    // WHEN: Parsing the serial
    const parsed = parseSerializedNumber(serial);

    // THEN: Components are extracted correctly
    expect(parsed.game_code, "game_code should be positions 1-4").toBe("0001");
    expect(parsed.pack_number, "pack_number should be positions 5-11").toBe(
      "1234567",
    );
    expect(parsed.serial_start, "serial_start should be positions 12-14").toBe(
      "012",
    );
  });

  it("6.12-UNIT-005: should throw error for serial shorter than 24 digits", () => {
    // GIVEN: Serial number shorter than 24 digits
    const serial = "12345678901234567890"; // 20 digits

    // WHEN: Attempting to parse
    // THEN: InvalidSerialNumberError is thrown
    expect(() => parseSerializedNumber(serial)).toThrow(
      InvalidSerialNumberError,
    );
    expect(() => parseSerializedNumber(serial)).toThrow(
      "Invalid serial number format. Must be 24 digits.",
    );
  });

  it("6.12-UNIT-006: should throw error for serial longer than 24 digits", () => {
    // GIVEN: Serial number longer than 24 digits
    const serial = "1234567890123456789012345"; // 25 digits

    // WHEN: Attempting to parse
    // THEN: InvalidSerialNumberError is thrown
    expect(() => parseSerializedNumber(serial)).toThrow(
      InvalidSerialNumberError,
    );
  });

  it("6.12-UNIT-007: should throw error for non-numeric characters", () => {
    // GIVEN: Serial number with non-numeric characters
    const serial = "00011234567012345678901a"; // Contains 'a'

    // WHEN: Attempting to parse
    // THEN: InvalidSerialNumberError is thrown
    expect(() => parseSerializedNumber(serial)).toThrow(
      InvalidSerialNumberError,
    );
  });

  it("6.12-UNIT-008: should parse serial with leading zeros correctly", () => {
    // GIVEN: Serial number with leading zeros in pack_number
    // Serial format: 4-digit game_code + 7-digit pack_number + 3-digit serial_start + 10-digit identifier
    // To get pack_number "0000007", we need positions 5-11 to be "0000007"
    const serial = "000100000070012345678901";

    // WHEN: Parsing the serial
    const parsed = parseSerializedNumber(serial);

    // THEN: Leading zeros are preserved
    expect(parsed.game_code).toBe("0001");
    expect(parsed.pack_number).toBe("0000007");
    expect(parsed.serial_start).toBe("001");
  });

  it("6.12-UNIT-009: should return correct type (ParsedSerialNumber)", () => {
    // GIVEN: Valid serial number
    const serial = "000112345670123456789012";

    // WHEN: Parsing the serial
    const parsed = parseSerializedNumber(serial);

    // THEN: Return type matches ParsedSerialNumber interface
    expect(parsed).toHaveProperty("game_code");
    expect(parsed).toHaveProperty("pack_number");
    expect(parsed).toHaveProperty("serial_start");
    expect(typeof parsed.game_code).toBe("string");
    expect(typeof parsed.pack_number).toBe("string");
    expect(typeof parsed.serial_start).toBe("string");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("6.12-UNIT: isValidSerialNumber", () => {
  it("6.12-UNIT-010: should return true for valid 24-digit serial", () => {
    // GIVEN: Valid 24-digit serial
    const serial = "000112345670123456789012";

    // WHEN: Validating
    // THEN: Returns true
    expect(isValidSerialNumber(serial)).toBe(true);
  });

  it("6.12-UNIT-011: should return false for serial shorter than 24 digits", () => {
    // GIVEN: Serial shorter than 24 digits
    const serial = "12345678901234567890"; // 20 digits

    // WHEN: Validating
    // THEN: Returns false
    expect(isValidSerialNumber(serial)).toBe(false);
  });

  it("6.12-UNIT-012: should return false for serial longer than 24 digits", () => {
    // GIVEN: Serial longer than 24 digits
    const serial = "1234567890123456789012345"; // 25 digits

    // WHEN: Validating
    // THEN: Returns false
    expect(isValidSerialNumber(serial)).toBe(false);
  });

  it("6.12-UNIT-013: should return false for non-numeric characters", () => {
    // GIVEN: Serial with non-numeric characters
    const serial = "00011234567012345678901a";

    // WHEN: Validating
    // THEN: Returns false
    expect(isValidSerialNumber(serial)).toBe(false);
  });

  it("6.12-UNIT-014: should return false for empty string", () => {
    // GIVEN: Empty string
    const serial = "";

    // WHEN: Validating
    // THEN: Returns false
    expect(isValidSerialNumber(serial)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GAME CODE EXTRACTION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("6.12-UNIT: extractGameCode", () => {
  it("6.12-UNIT-015: should extract game code from valid serial", () => {
    // GIVEN: Valid 24-digit serial
    const serial = "000112345670123456789012";

    // WHEN: Extracting game code
    const gameCode = extractGameCode(serial);

    // THEN: Game code is extracted correctly (positions 1-4)
    expect(gameCode).toBe("0001");
  });

  it("6.12-UNIT-016: should return null for invalid serial format", () => {
    // GIVEN: Invalid serial (too short)
    const serial = "123";

    // WHEN: Extracting game code
    const gameCode = extractGameCode(serial);

    // THEN: Returns null
    expect(gameCode).toBeNull();
  });

  it("6.12-UNIT-017: should return null for non-numeric serial", () => {
    // GIVEN: Serial with non-numeric characters
    const serial = "00011234567012345678901a";

    // WHEN: Extracting game code
    const gameCode = extractGameCode(serial);

    // THEN: Returns null
    expect(gameCode).toBeNull();
  });

  it("6.12-UNIT-018: should preserve leading zeros in game code", () => {
    // GIVEN: Serial with leading zeros in game code
    const serial = "000112345670123456789012";

    // WHEN: Extracting game code
    const gameCode = extractGameCode(serial);

    // THEN: Leading zeros are preserved
    expect(gameCode).toBe("0001");
    expect(gameCode?.length).toBe(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EDGE CASE TESTS (P1)
// ═══════════════════════════════════════════════════════════════════════════

describe("6.12-UNIT: parseSerializedNumber - Edge Cases", () => {
  it("6.12-UNIT-019: should handle serial with all zeros", () => {
    // GIVEN: Serial with all zeros
    const serial = "000000000000000000000000";

    // WHEN: Parsing the serial
    const parsed = parseSerializedNumber(serial);

    // THEN: All components are zeros
    expect(parsed.game_code, "game_code should be all zeros").toBe("0000");
    expect(parsed.pack_number, "pack_number should be all zeros").toBe(
      "0000000",
    );
    expect(parsed.serial_start, "serial_start should be all zeros").toBe("000");
  });

  it("6.12-UNIT-020: should handle serial with all nines", () => {
    // GIVEN: Serial with all nines
    const serial = "999999999999999999999999";

    // WHEN: Parsing the serial
    const parsed = parseSerializedNumber(serial);

    // THEN: All components are nines
    expect(parsed.game_code, "game_code should be all nines").toBe("9999");
    expect(parsed.pack_number, "pack_number should be all nines").toBe(
      "9999999",
    );
    expect(parsed.serial_start, "serial_start should be all nines").toBe("999");
  });

  it("6.12-UNIT-021: should reject serial with whitespace", () => {
    // GIVEN: Serial with whitespace
    const serials = [
      " 000112345670123456789012", // Leading space
      "000112345670123456789012 ", // Trailing space
      "000112345670123456789 012", // Middle space
      "000112345670123456789012\n", // Newline
      "\t000112345670123456789012", // Tab
    ];

    // WHEN: Attempting to parse each
    // THEN: All should throw InvalidSerialNumberError
    serials.forEach((serial) => {
      expect(
        () => parseSerializedNumber(serial),
        `Serial with whitespace should be rejected: ${JSON.stringify(serial)}`,
      ).toThrow(InvalidSerialNumberError);
    });
  });

  it("6.12-UNIT-022: should reject serial with special characters", () => {
    // GIVEN: Serials with various special characters
    const serials = [
      "00011234567012345678901-", // Hyphen
      "00011234567012345678901.", // Period
      "00011234567012345678901_", // Underscore
      "00011234567012345678901+", // Plus
      "00011234567012345678901@", // At symbol
    ];

    // WHEN: Attempting to parse each
    // THEN: All should throw InvalidSerialNumberError
    serials.forEach((serial) => {
      expect(
        () => parseSerializedNumber(serial),
        `Serial with special character should be rejected: ${serial}`,
      ).toThrow(InvalidSerialNumberError);
    });
  });

  it("6.12-UNIT-023: should handle boundary values correctly", () => {
    // GIVEN: Serial at boundaries (minimum valid length)
    const serial = "000000000000000000000001"; // 24 digits, minimum value

    // WHEN: Parsing the serial
    const parsed = parseSerializedNumber(serial);

    // THEN: Components are extracted correctly
    expect(parsed.game_code, "game_code should be extracted").toBe("0000");
    expect(parsed.pack_number, "pack_number should be extracted").toBe(
      "0000000",
    );
    expect(parsed.serial_start, "serial_start should be extracted").toBe("000");
  });

  it("6.12-UNIT-024: should preserve string type (not convert to number)", () => {
    // GIVEN: Serial that could be misinterpreted as number
    // Serial format: 4-digit game_code + 7-digit pack_number + 3-digit serial_start + 10-digit identifier
    // To get pack_number "0000007", positions 5-11 must be "0000007"
    const serial = "000100000070012345678901";

    // WHEN: Parsing the serial
    const parsed = parseSerializedNumber(serial);

    // THEN: All components remain as strings (preserving leading zeros)
    expect(typeof parsed.game_code, "game_code should be string").toBe(
      "string",
    );
    expect(typeof parsed.pack_number, "pack_number should be string").toBe(
      "string",
    );
    expect(typeof parsed.serial_start, "serial_start should be string").toBe(
      "string",
    );
    expect(parsed.game_code, "Leading zeros should be preserved").toBe("0001");
    expect(parsed.pack_number, "Leading zeros should be preserved").toBe(
      "0000007",
    );
  });
});

describe("6.12-UNIT: isValidSerialNumber - Edge Cases", () => {
  it("6.12-UNIT-025: should return false for null", () => {
    // GIVEN: Null value
    // WHEN: Validating
    // THEN: Returns false
    expect(isValidSerialNumber(null as any), "null should return false").toBe(
      false,
    );
  });

  it("6.12-UNIT-026: should return false for undefined", () => {
    // GIVEN: Undefined value
    // WHEN: Validating
    // THEN: Returns false
    expect(
      isValidSerialNumber(undefined as any),
      "undefined should return false",
    ).toBe(false);
  });

  it("6.12-UNIT-027: should return false for number type", () => {
    // GIVEN: Number instead of string
    const serial = 123456789012345678901234 as any;

    // WHEN: Validating
    // THEN: Returns false (must be string)
    expect(isValidSerialNumber(serial), "number should return false").toBe(
      false,
    );
  });

  it("6.12-UNIT-028: should return false for whitespace-only string", () => {
    // GIVEN: Whitespace-only string
    const serial = "                        "; // 24 spaces

    // WHEN: Validating
    // THEN: Returns false
    expect(
      isValidSerialNumber(serial),
      "whitespace-only should return false",
    ).toBe(false);
  });
});

describe("6.12-UNIT: extractGameCode - Edge Cases", () => {
  it("6.12-UNIT-029: should return null for null input", () => {
    // GIVEN: Null value
    // WHEN: Extracting game code
    const gameCode = extractGameCode(null as any);

    // THEN: Returns null
    expect(gameCode, "null should return null").toBeNull();
  });

  it("6.12-UNIT-030: should return null for undefined input", () => {
    // GIVEN: Undefined value
    // WHEN: Extracting game code
    const gameCode = extractGameCode(undefined as any);

    // THEN: Returns null
    expect(gameCode, "undefined should return null").toBeNull();
  });

  it("6.12-UNIT-031: should handle maximum game code value", () => {
    // GIVEN: Serial with maximum game code (9999)
    const serial = "999912345670123456789012";

    // WHEN: Extracting game code
    const gameCode = extractGameCode(serial);

    // THEN: Game code is extracted correctly
    expect(gameCode, "Maximum game code should be extracted").toBe("9999");
  });

  it("6.12-UNIT-032: should handle minimum game code value", () => {
    // GIVEN: Serial with minimum game code (0000)
    const serial = "000012345670123456789012";

    // WHEN: Extracting game code
    const gameCode = extractGameCode(serial);

    // THEN: Game code is extracted correctly (preserving zeros)
    expect(gameCode, "Minimum game code should be extracted").toBe("0000");
    expect(gameCode?.length, "Game code should be 4 digits").toBe(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SECURITY TESTS (P0 - Mandatory)
// ═══════════════════════════════════════════════════════════════════════════

describe("6.12-UNIT: Security - Input Sanitization", () => {
  it("6.12-UNIT-SEC-001: [P0] should reject SQL injection patterns", () => {
    // GIVEN: Serials with SQL injection patterns
    const sqlInjectionPatterns = [
      "'; DROP TABLE packs; --",
      "1' OR '1'='1",
      "1'; INSERT INTO packs VALUES ('xss'); --",
      "0001' UNION SELECT * FROM packs --",
    ];

    // WHEN: Attempting to parse each
    // THEN: All should throw InvalidSerialNumberError
    sqlInjectionPatterns.forEach((serial) => {
      expect(
        () => parseSerializedNumber(serial),
        `SQL injection pattern should be rejected: ${serial}`,
      ).toThrow(InvalidSerialNumberError);
      expect(
        isValidSerialNumber(serial),
        `SQL injection pattern should be invalid: ${serial}`,
      ).toBe(false);
    });
  });

  it("6.12-UNIT-SEC-002: [P0] should reject XSS attack patterns", () => {
    // GIVEN: Serials with XSS patterns
    const xssPatterns = [
      "<script>alert('xss')</script>",
      "javascript:alert('xss')",
      "onerror=alert('xss')",
      "<img src=x onerror=alert('xss')>",
      "&#60;script&#62;",
    ];

    // WHEN: Attempting to parse each
    // THEN: All should throw InvalidSerialNumberError
    xssPatterns.forEach((serial) => {
      expect(
        () => parseSerializedNumber(serial),
        `XSS pattern should be rejected: ${serial}`,
      ).toThrow(InvalidSerialNumberError);
      expect(
        isValidSerialNumber(serial),
        `XSS pattern should be invalid: ${serial}`,
      ).toBe(false);
    });
  });

  it("6.12-UNIT-SEC-003: [P0] should reject command injection patterns", () => {
    // GIVEN: Serials with command injection patterns
    const commandInjectionPatterns = [
      "; rm -rf /",
      "| cat /etc/passwd",
      "&& echo 'hacked'",
      "`whoami`",
      "$(ls -la)",
    ];

    // WHEN: Attempting to parse each
    // THEN: All should throw InvalidSerialNumberError
    commandInjectionPatterns.forEach((serial) => {
      expect(
        () => parseSerializedNumber(serial),
        `Command injection pattern should be rejected: ${serial}`,
      ).toThrow(InvalidSerialNumberError);
    });
  });

  it("6.12-UNIT-SEC-004: [P0] should reject path traversal patterns", () => {
    // GIVEN: Serials with path traversal patterns
    const pathTraversalPatterns = [
      "../../../etc/passwd",
      "..\\..\\..\\windows\\system32",
      "/etc/passwd",
      "C:\\Windows\\System32",
    ];

    // WHEN: Attempting to parse each
    // THEN: All should throw InvalidSerialNumberError
    pathTraversalPatterns.forEach((serial) => {
      expect(
        () => parseSerializedNumber(serial),
        `Path traversal pattern should be rejected: ${serial}`,
      ).toThrow(InvalidSerialNumberError);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PERFORMANCE & STRESS TESTS (P2)
// ═══════════════════════════════════════════════════════════════════════════

describe("6.12-UNIT: Performance - Large Input Handling", () => {
  it("6.12-UNIT-PERF-001: [P2] should handle very long invalid input efficiently", () => {
    // GIVEN: Very long invalid input (1000 characters)
    const longInvalidInput = "a".repeat(1000);

    // WHEN: Validating
    const startTime = performance.now();
    const isValid = isValidSerialNumber(longInvalidInput);
    const endTime = performance.now();

    // THEN: Should reject quickly (performance check)
    expect(isValid, "Long invalid input should be rejected").toBe(false);
    expect(
      endTime - startTime,
      "Validation should complete quickly (< 10ms)",
    ).toBeLessThan(10);
  });

  it("6.12-UNIT-PERF-002: [P2] should handle valid serial parsing efficiently", () => {
    // GIVEN: Valid serial
    const serial = "000112345670123456789012";

    // WHEN: Parsing multiple times
    const iterations = 1000;
    const startTime = performance.now();
    for (let i = 0; i < iterations; i++) {
      parseSerializedNumber(serial);
    }
    const endTime = performance.now();

    // THEN: Should complete quickly
    const avgTime = (endTime - startTime) / iterations;
    expect(
      avgTime,
      `Average parse time should be < 0.1ms (actual: ${avgTime.toFixed(3)}ms)`,
    ).toBeLessThan(0.1);
  });
});
