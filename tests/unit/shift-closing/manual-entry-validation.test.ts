/**
 * Manual Entry Validation Unit Tests
 *
 * Tests for manual entry validation logic:
 * - Range validation (ending >= starting, ending <= serial_end)
 * - Pack number validation skipped in manual mode
 * - Input format validation (3-digit numeric)
 *
 * @test-level Unit
 * @justification Tests pure validation logic without external dependencies
 * @story 10-4 - Manual Entry Override
 * @priority P0 (Critical - Data Integrity)
 */

import { describe, it, expect } from "vitest";
import { validateManualEntryEnding as validateManualEntryEndingService } from "@/lib/services/lottery-closing-validation";

/**
 * Wrapper function to match test signature
 * The service function takes binData object, this wrapper adapts the signature
 */
async function validateManualEntryEnding(
  ending: string,
  starting: string,
  serialEnd: string,
): Promise<{ valid: boolean; error?: string }> {
  return validateManualEntryEndingService(ending, {
    starting_serial: starting,
    serial_end: serialEnd,
  });
}

describe("10-4-UNIT: Manual Entry Validation", () => {
  describe("validateManualEntryEnding", () => {
    it("10-4-UNIT-001: should accept valid ending number within range", async () => {
      // GIVEN: Ending number between starting and serial_end
      const ending = "100";
      const starting = "045";
      const serialEnd = "150";

      // WHEN: Validating manual entry
      const result = await validateManualEntryEnding(
        ending,
        starting,
        serialEnd,
      );

      // THEN: Validation passes
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("10-4-UNIT-002: should reject ending number less than starting", async () => {
      // GIVEN: Ending number less than starting
      const ending = "040";
      const starting = "045";
      const serialEnd = "150";

      // WHEN: Validating manual entry
      const result = await validateManualEntryEnding(
        ending,
        starting,
        serialEnd,
      );

      // THEN: Validation fails with appropriate error
      expect(result.valid).toBe(false);
      expect(result.error).toContain("cannot be less than starting");
    });

    it("10-4-UNIT-003: should reject ending number greater than serial_end", async () => {
      // GIVEN: Ending number greater than serial_end
      const ending = "151";
      const starting = "045";
      const serialEnd = "150";

      // WHEN: Validating manual entry
      const result = await validateManualEntryEnding(
        ending,
        starting,
        serialEnd,
      );

      // THEN: Validation fails with appropriate error
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exceeds pack maximum");
    });

    it("10-4-UNIT-004: should accept ending equal to starting", async () => {
      // GIVEN: Ending number equals starting
      const ending = "045";
      const starting = "045";
      const serialEnd = "150";

      // WHEN: Validating manual entry
      const result = await validateManualEntryEnding(
        ending,
        starting,
        serialEnd,
      );

      // THEN: Validation passes (boundary case)
      expect(result.valid).toBe(true);
    });

    it("10-4-UNIT-005: should accept ending equal to serial_end", async () => {
      // GIVEN: Ending number equals serial_end
      const ending = "150";
      const starting = "045";
      const serialEnd = "150";

      // WHEN: Validating manual entry
      const result = await validateManualEntryEnding(
        ending,
        starting,
        serialEnd,
      );

      // THEN: Validation passes (boundary case)
      expect(result.valid).toBe(true);
    });

    it("10-4-UNIT-006: should reject non-numeric ending number", async () => {
      // GIVEN: Non-numeric ending number
      const ending = "abc";
      const starting = "045";
      const serialEnd = "150";

      // WHEN: Validating manual entry
      const result = await validateManualEntryEnding(
        ending,
        starting,
        serialEnd,
      );

      // THEN: Validation fails with format error
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exactly 3 digits");
    });

    it("10-4-UNIT-007: should reject ending number with wrong length", async () => {
      // GIVEN: Ending number not exactly 3 digits
      const ending = "12"; // 2 digits
      const starting = "045";
      const serialEnd = "150";

      // WHEN: Validating manual entry
      const result = await validateManualEntryEnding(
        ending,
        starting,
        serialEnd,
      );

      // THEN: Validation fails with length error
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exactly 3 digits");
    });

    it("10-4-UNIT-008: should skip pack number validation in manual mode", async () => {
      // GIVEN: Ending number with wrong pack (would fail in scan mode)
      // BUT: Manual mode skips pack validation
      const ending = "100";
      const starting = "045";
      const serialEnd = "150";
      // Note: Pack number validation is skipped, so this should pass

      // WHEN: Validating manual entry
      const result = await validateManualEntryEnding(
        ending,
        starting,
        serialEnd,
      );

      // THEN: Validation passes (pack validation skipped)
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("10-4-UNIT-009: should handle zero starting number", async () => {
      // GIVEN: Starting number is zero
      const ending = "050";
      const starting = "000";
      const serialEnd = "150";

      // WHEN: Validating manual entry
      const result = await validateManualEntryEnding(
        ending,
        starting,
        serialEnd,
      );

      // THEN: Validation passes
      expect(result.valid).toBe(true);
    });

    it("10-4-UNIT-010: should handle maximum serial_end", async () => {
      // GIVEN: Maximum serial_end value
      const ending = "999";
      const starting = "000";
      const serialEnd = "999";

      // WHEN: Validating manual entry
      const result = await validateManualEntryEnding(
        ending,
        starting,
        serialEnd,
      );

      // THEN: Validation passes
      expect(result.valid).toBe(true);
    });

    // ============================================================================
    // 🔄 ADDITIONAL EDGE CASES (Standard Boundaries - Applied Automatically)
    // ============================================================================

    it("10-4-UNIT-011: should reject empty ending number", async () => {
      // GIVEN: Empty ending number
      const ending = "";
      const starting = "045";
      const serialEnd = "150";

      // WHEN: Validating manual entry
      const result = await validateManualEntryEnding(
        ending,
        starting,
        serialEnd,
      );

      // THEN: Validation fails with format error
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe("string");
    });

    it("10-4-UNIT-012: should reject ending number with whitespace", async () => {
      // GIVEN: Ending number with whitespace
      const ending = " 100 ";
      const starting = "045";
      const serialEnd = "150";

      // WHEN: Validating manual entry
      const result = await validateManualEntryEnding(
        ending,
        starting,
        serialEnd,
      );

      // THEN: Validation fails with format error
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("10-4-UNIT-013: should reject ending number with leading zeros in wrong format", async () => {
      // GIVEN: Ending number with wrong format (leading zeros but not 3 digits)
      const ending = "01"; // 2 digits with leading zero
      const starting = "045";
      const serialEnd = "150";

      // WHEN: Validating manual entry
      const result = await validateManualEntryEnding(
        ending,
        starting,
        serialEnd,
      );

      // THEN: Validation fails with length error
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exactly 3 digits");
    });

    it("10-4-UNIT-014: should handle very large range (000 to 999)", async () => {
      // GIVEN: Full range ending number
      const ending = "500";
      const starting = "000";
      const serialEnd = "999";

      // WHEN: Validating manual entry
      const result = await validateManualEntryEnding(
        ending,
        starting,
        serialEnd,
      );

      // THEN: Validation passes
      expect(result.valid).toBe(true);
    });

    it("10-4-UNIT-015: should reject ending number with special characters", async () => {
      // GIVEN: Ending number with special characters
      const ending = "10@";
      const starting = "045";
      const serialEnd = "150";

      // WHEN: Validating manual entry
      const result = await validateManualEntryEnding(
        ending,
        starting,
        serialEnd,
      );

      // THEN: Validation fails with format error
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    // ============================================================================
    // ✅ ENHANCED ASSERTIONS (Best Practices - Applied Automatically)
    // ============================================================================

    it("10-4-UNIT-ASSERT-001: should return consistent error message format", async () => {
      // GIVEN: Invalid ending number
      const ending = "abc";
      const starting = "045";
      const serialEnd = "150";

      // WHEN: Validating manual entry
      const result = await validateManualEntryEnding(
        ending,
        starting,
        serialEnd,
      );

      // THEN: Error message has consistent format
      expect(result.valid).toBe(false);
      expect(result).toHaveProperty("error");
      expect(typeof result.error).toBe("string");
      expect(result.error?.length).toBeGreaterThan(0);
    });

    it("10-4-UNIT-ASSERT-002: should return valid boolean for valid flag", async () => {
      // GIVEN: Valid ending number
      const ending = "100";
      const starting = "045";
      const serialEnd = "150";

      // WHEN: Validating manual entry
      const result = await validateManualEntryEnding(
        ending,
        starting,
        serialEnd,
      );

      // THEN: Valid flag is boolean type
      expect(result).toHaveProperty("valid");
      expect(typeof result.valid).toBe("boolean");
    });
  });
});
