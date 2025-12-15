/**
 * @test-level UNIT
 * @justification Tests pure validation logic - no dependencies, fast execution
 * @story 10-3
 *
 * Unit Tests: Lottery Closing Validation Service
 *
 * Tests ending serial validation logic:
 * - Serial number parsing using existing parseSerializedNumber()
 * - Level 1: Pack number match validation
 * - Level 2: Minimum check (ending >= starting)
 * - Level 3: Maximum check (ending <= serial_end)
 * - Validation result structure
 * - Error message generation
 *
 * Story: 10-3 - Ending Number Scanning & Validation
 * Priority: P0 (Critical - Data Integrity)
 */

import { describe, it, expect, vi } from "vitest";
import {
  validateEndingSerial,
  ValidationResult,
} from "@/lib/services/lottery-closing-validation";
import { parseSerializedNumber } from "@/lib/utils/lottery-serial-parser";

// Mock the parser to isolate validation logic
vi.mock("@/lib/utils/lottery-serial-parser", () => ({
  parseSerializedNumber: vi.fn(),
}));

describe("10-3-UNIT: validateEndingSerial", () => {
  const mockBinData = {
    pack_number: "1234567",
    starting_serial: "045",
    serial_end: "150",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("TEST-10.3-U1: Serial Number Parsing", () => {
    it("should parse 24-digit serial correctly", async () => {
      // GIVEN: Valid 24-digit serial and mocked parser
      const scannedSerial = "000112345670123456789012";
      const mockParsed = {
        game_code: "0001",
        pack_number: "1234567",
        serial_start: "067",
      };
      vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);

      // WHEN: Validating ending serial
      const result = await validateEndingSerial(scannedSerial, mockBinData);

      // THEN: Parser is called with scanned serial
      expect(parseSerializedNumber).toHaveBeenCalledWith(scannedSerial);
      expect(parseSerializedNumber).toHaveBeenCalledTimes(1);
    });
  });

  describe("TEST-10.3-U2: Validation Level 1 - Pack Match", () => {
    it("should fail validation when pack numbers don't match", async () => {
      // GIVEN: Scanned serial with different pack number
      const scannedSerial = "000198765430123456789012";
      const mockParsed = {
        game_code: "0001",
        pack_number: "9876543", // Different from bin's pack_number "1234567"
        serial_start: "067",
      };
      vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);

      // WHEN: Validating ending serial
      const result = await validateEndingSerial(scannedSerial, mockBinData);

      // THEN: Validation fails with pack mismatch error
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Wrong pack");
      expect(result.error).toContain("different lottery");
      expect(result.endingNumber).toBeUndefined();
    });

    it("should pass Level 1 when pack numbers match", async () => {
      // GIVEN: Scanned serial with matching pack number
      const scannedSerial = "000112345670123456789012";
      const mockParsed = {
        game_code: "0001",
        pack_number: "1234567", // Matches bin's pack_number
        serial_start: "067",
      };
      vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);

      // WHEN: Validating ending serial (will continue to Level 2)
      // Note: This test assumes Level 2 and 3 also pass
      // For full validation, we need starting_serial <= ending <= serial_end
      const binDataWithValidRange = {
        ...mockBinData,
        starting_serial: "045",
        serial_end: "150",
      };
      const result = await validateEndingSerial(
        scannedSerial,
        binDataWithValidRange,
      );

      // THEN: Level 1 passes (no pack mismatch error)
      expect(result.error).not.toContain("Wrong pack");
    });
  });

  describe("TEST-10.3-U3: Validation Level 2 - Minimum Check", () => {
    it("should fail validation when ending < starting", async () => {
      // GIVEN: Scanned serial with ending number less than starting
      const scannedSerial = "000112345670123456789012";
      const mockParsed = {
        game_code: "0001",
        pack_number: "1234567", // Matches
        serial_start: "030", // Less than starting_serial "045"
      };
      vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);

      // WHEN: Validating ending serial
      const result = await validateEndingSerial(scannedSerial, mockBinData);

      // THEN: Validation fails with minimum check error
      expect(result.valid).toBe(false);
      expect(result.error).toContain("cannot be less than starting");
      expect(result.error).toContain("045"); // Starting serial in error message
      expect(result.endingNumber).toBeUndefined();
    });

    it("should pass Level 2 when ending >= starting", async () => {
      // GIVEN: Scanned serial with ending number >= starting
      const scannedSerial = "000112345670123456789012";
      const mockParsed = {
        game_code: "0001",
        pack_number: "1234567", // Matches
        serial_start: "067", // >= starting_serial "045"
      };
      vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);

      // WHEN: Validating ending serial (will continue to Level 3)
      // Note: This test assumes Level 3 also passes
      const binDataWithValidMax = {
        ...mockBinData,
        serial_end: "150", // >= ending "067"
      };
      const result = await validateEndingSerial(
        scannedSerial,
        binDataWithValidMax,
      );

      // THEN: Level 2 passes (no minimum check error)
      expect(result.error).not.toContain("cannot be less than starting");
    });

    it("should pass Level 2 when ending equals starting", async () => {
      // GIVEN: Scanned serial with ending number equal to starting
      const scannedSerial = "000112345670123456789012";
      const mockParsed = {
        game_code: "0001",
        pack_number: "1234567",
        serial_start: "045", // Equal to starting_serial
      };
      vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);

      // WHEN: Validating ending serial (will continue to Level 3)
      const binDataWithValidMax = {
        ...mockBinData,
        serial_end: "150",
      };
      const result = await validateEndingSerial(
        scannedSerial,
        binDataWithValidMax,
      );

      // THEN: Level 2 passes (boundary case: ending == starting is valid)
      expect(result.error).not.toContain("cannot be less than starting");
    });
  });

  describe("TEST-10.3-U4: Validation Level 3 - Maximum Check", () => {
    it("should fail validation when ending > serial_end", async () => {
      // GIVEN: Scanned serial with ending number greater than pack maximum
      const scannedSerial = "000112345670123456789012";
      const mockParsed = {
        game_code: "0001",
        pack_number: "1234567", // Matches
        serial_start: "200", // Greater than serial_end "150"
      };
      vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);

      // WHEN: Validating ending serial
      const result = await validateEndingSerial(scannedSerial, mockBinData);

      // THEN: Validation fails with maximum check error
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exceeds pack maximum");
      expect(result.error).toContain("150"); // serial_end in error message
      expect(result.endingNumber).toBeUndefined();
    });

    it("should pass Level 3 when ending <= serial_end", async () => {
      // GIVEN: Scanned serial with ending number <= serial_end
      const scannedSerial = "000112345670123456789012";
      const mockParsed = {
        game_code: "0001",
        pack_number: "1234567", // Matches
        serial_start: "067", // <= serial_end "150"
      };
      vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);

      // WHEN: Validating ending serial
      const binDataWithValidRange = {
        ...mockBinData,
        starting_serial: "045", // <= ending "067"
        serial_end: "150", // >= ending "067"
      };
      const result = await validateEndingSerial(
        scannedSerial,
        binDataWithValidRange,
      );

      // THEN: Level 3 passes (no maximum check error)
      expect(result.error).not.toContain("exceeds pack maximum");
    });

    it("should pass Level 3 when ending equals serial_end", async () => {
      // GIVEN: Scanned serial with ending number equal to serial_end
      const scannedSerial = "000112345670123456789012";
      const mockParsed = {
        game_code: "0001",
        pack_number: "1234567",
        serial_start: "150", // Equal to serial_end
      };
      vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);

      // WHEN: Validating ending serial
      const binDataWithValidRange = {
        ...mockBinData,
        starting_serial: "045", // <= ending "150"
        serial_end: "150", // == ending "150"
      };
      const result = await validateEndingSerial(
        scannedSerial,
        binDataWithValidRange,
      );

      // THEN: Level 3 passes (boundary case: ending == serial_end is valid)
      expect(result.error).not.toContain("exceeds pack maximum");
    });
  });

  describe("TEST-10.3-U5: All Validations Pass", () => {
    it("should pass validation when all checks pass", async () => {
      // GIVEN: Scanned serial that passes all three validation levels
      const scannedSerial = "000112345670123456789012";
      const mockParsed = {
        game_code: "0001",
        pack_number: "1234567", // Matches bin's pack_number
        serial_start: "067", // >= starting "045" and <= serial_end "150"
      };
      vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);

      const binDataWithValidRange = {
        ...mockBinData,
        starting_serial: "045",
        serial_end: "150",
      };

      // WHEN: Validating ending serial
      const result = await validateEndingSerial(
        scannedSerial,
        binDataWithValidRange,
      );

      // THEN: Validation passes with ending number
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.endingNumber).toBe("067");
    });
  });

  describe("TEST-10.3-U6: Ending Number Extraction", () => {
    it("should return correct 3-digit ending number on success", async () => {
      // GIVEN: Valid scanned serial
      const scannedSerial = "000112345670123456789012";
      const mockParsed = {
        game_code: "0001",
        pack_number: "1234567",
        serial_start: "123", // 3-digit ending number
      };
      vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);

      const binDataWithValidRange = {
        ...mockBinData,
        starting_serial: "045",
        serial_end: "150",
      };

      // WHEN: Validating ending serial
      const result = await validateEndingSerial(
        scannedSerial,
        binDataWithValidRange,
      );

      // THEN: Ending number is correctly extracted and returned
      expect(result.valid).toBe(true);
      expect(result.endingNumber).toBe("123");
      expect(result.endingNumber?.length).toBe(3);
    });

    it("should preserve leading zeros in ending number", async () => {
      // GIVEN: Scanned serial with leading zeros in ticket number
      const scannedSerial = "000112345670123456789012";
      const mockParsed = {
        game_code: "0001",
        pack_number: "1234567",
        serial_start: "045", // Leading zero preserved
      };
      vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);

      const binDataWithValidRange = {
        ...mockBinData,
        starting_serial: "045",
        serial_end: "150",
      };

      // WHEN: Validating ending serial
      const result = await validateEndingSerial(
        scannedSerial,
        binDataWithValidRange,
      );

      // THEN: Leading zeros are preserved in ending number
      expect(result.endingNumber).toBe("045");
      expect(result.endingNumber).not.toBe("45"); // Must preserve leading zero
    });
  });

  describe("TEST-10.3-U7: Input Validation - Security & Edge Cases", () => {
    it("should reject non-string scannedSerial input", async () => {
      // GIVEN: Invalid input type (not a string)
      // WHEN: Validating with non-string input
      // @ts-expect-error - Testing invalid input type
      const result = await validateEndingSerial(null, mockBinData);

      // THEN: Validation fails with format error
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid serial number format");
      expect(result.endingNumber).toBeUndefined();
    });

    it("should reject empty string scannedSerial", async () => {
      // GIVEN: Empty string input
      // WHEN: Validating empty string
      const result = await validateEndingSerial("", mockBinData);

      // THEN: Validation fails with format error
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid serial number format");
      expect(result.endingNumber).toBeUndefined();
    });

    it("should reject scannedSerial with non-numeric characters", async () => {
      // GIVEN: Scanned serial with special characters (potential injection attempt)
      const scannedSerial = "00011234567012345678901X"; // Contains 'X'

      // WHEN: Validating (parser will handle, but format check should catch)
      const result = await validateEndingSerial(scannedSerial, mockBinData);

      // THEN: Validation fails (format validation should reject non-24-digit)
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should reject scannedSerial with exactly 23 digits (too short)", async () => {
      // GIVEN: Scanned serial with 23 digits (one short)
      const scannedSerial = "00011234567012345678901"; // 23 digits

      // WHEN: Validating
      const result = await validateEndingSerial(scannedSerial, mockBinData);

      // THEN: Validation fails with format error
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exactly 24 digits");
      expect(result.endingNumber).toBeUndefined();
    });

    it("should reject scannedSerial with exactly 25 digits (too long)", async () => {
      // GIVEN: Scanned serial with 25 digits (one too many)
      const scannedSerial = "0001123456701234567890123"; // 25 digits

      // WHEN: Validating
      const result = await validateEndingSerial(scannedSerial, mockBinData);

      // THEN: Validation fails with format error
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exactly 24 digits");
      expect(result.endingNumber).toBeUndefined();
    });

    it("should reject invalid binData structure (missing pack_number)", async () => {
      // GIVEN: Invalid binData (missing required field)
      const scannedSerial = "000112345670123456789012";
      // @ts-expect-error - Testing invalid binData structure
      const invalidBinData = {
        starting_serial: "045",
        serial_end: "150",
        // pack_number missing
      };

      // WHEN: Validating
      const result = await validateEndingSerial(scannedSerial, invalidBinData);

      // THEN: Validation fails with invalid bin data error
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid bin validation data");
      expect(result.endingNumber).toBeUndefined();
    });

    it("should reject invalid binData structure (missing starting_serial)", async () => {
      // GIVEN: Invalid binData (missing required field)
      const scannedSerial = "000112345670123456789012";
      // @ts-expect-error - Testing invalid binData structure
      const invalidBinData = {
        pack_number: "1234567",
        serial_end: "150",
        // starting_serial missing
      };

      // WHEN: Validating
      const result = await validateEndingSerial(scannedSerial, invalidBinData);

      // THEN: Validation fails with invalid bin data error
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid bin validation data");
      expect(result.endingNumber).toBeUndefined();
    });

    it("should reject invalid binData structure (missing serial_end)", async () => {
      // GIVEN: Invalid binData (missing required field)
      const scannedSerial = "000112345670123456789012";
      // @ts-expect-error - Testing invalid binData structure
      const invalidBinData = {
        pack_number: "1234567",
        starting_serial: "045",
        // serial_end missing
      };

      // WHEN: Validating
      const result = await validateEndingSerial(scannedSerial, invalidBinData);

      // THEN: Validation fails with invalid bin data error
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid bin validation data");
      expect(result.endingNumber).toBeUndefined();
    });
  });

  describe("TEST-10.3-U8: Enhanced Assertions - Error Message Quality", () => {
    it("should provide specific error message for pack mismatch", async () => {
      // GIVEN: Scanned serial with wrong pack number
      const scannedSerial = "000198765430123456789012";
      const mockParsed = {
        game_code: "0001",
        pack_number: "9876543", // Different pack
        serial_start: "067",
      };
      vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);

      // WHEN: Validating
      const result = await validateEndingSerial(scannedSerial, mockBinData);

      // THEN: Error message is specific and helpful
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain("Wrong pack");
      expect(result.error).toContain("different lottery");
      expect(typeof result.error).toBe("string");
      expect(result.error?.length).toBeGreaterThan(0);
    });

    it("should provide specific error message with starting serial value", async () => {
      // GIVEN: Scanned serial with ending < starting
      const scannedSerial = "000112345670123456789012";
      const mockParsed = {
        game_code: "0001",
        pack_number: "1234567",
        serial_start: "030", // Less than starting "045"
      };
      vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);

      // WHEN: Validating
      const result = await validateEndingSerial(scannedSerial, mockBinData);

      // THEN: Error message includes starting serial value
      expect(result.valid).toBe(false);
      expect(result.error).toContain("cannot be less than starting");
      expect(result.error).toContain("045"); // Starting serial value in message
    });

    it("should provide specific error message with serial_end value", async () => {
      // GIVEN: Scanned serial with ending > serial_end
      const scannedSerial = "000112345670123456789012";
      const mockParsed = {
        game_code: "0001",
        pack_number: "1234567",
        serial_start: "200", // Greater than serial_end "150"
      };
      vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);

      // WHEN: Validating
      const result = await validateEndingSerial(scannedSerial, mockBinData);

      // THEN: Error message includes serial_end value
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exceeds pack maximum");
      expect(result.error).toContain("150"); // serial_end value in message
    });
  });

  describe("TEST-10.3-U9: Business Logic - Closing Serial Greater Than Serial End", () => {
    it("should reject when ending > serial_end (business rule: closing_serial > serial_end is error)", async () => {
      // GIVEN: Scanned serial with ending number greater than pack's serial_end
      const scannedSerial = "000112345670123456789012";
      const mockParsed = {
        game_code: "0001",
        pack_number: "1234567", // Matches
        serial_start: "151", // Greater than serial_end "150" - THIS IS AN ERROR
      };
      vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);

      // WHEN: Validating ending serial
      const result = await validateEndingSerial(scannedSerial, mockBinData);

      // THEN: Validation fails with maximum check error (business rule violation)
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exceeds pack maximum");
      expect(result.error).toContain("150"); // serial_end value
      expect(result.endingNumber).toBeUndefined();

      // Business rule: closing_serial > serial_end is an error
      const endingNum = parseInt(mockParsed.serial_start, 10);
      const maxNum = parseInt(mockBinData.serial_end, 10);
      expect(
        endingNum > maxNum,
        "ending > serial_end should be true (error condition)",
      ).toBe(true);
    });

    it("should pass when ending equals serial_end (boundary case - valid)", async () => {
      // GIVEN: Scanned serial with ending number equal to serial_end (valid boundary)
      const scannedSerial = "000112345670123456789012";
      const mockParsed = {
        game_code: "0001",
        pack_number: "1234567",
        serial_start: "150", // Equal to serial_end (valid)
      };
      vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);

      // WHEN: Validating ending serial
      const binDataWithValidRange = {
        ...mockBinData,
        starting_serial: "045", // <= ending "150"
        serial_end: "150", // == ending "150" (boundary case - valid)
      };
      const result = await validateEndingSerial(
        scannedSerial,
        binDataWithValidRange,
      );

      // THEN: Validation passes (ending == serial_end is valid, only > is error)
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.endingNumber).toBe("150");
    });
  });
});
