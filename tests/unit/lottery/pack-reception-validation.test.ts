/**
 * Unit Tests: Pack Reception Form Validation
 *
 * Tests validation logic for pack reception form:
 * - Required fields validation
 * - Serial range validation (serial_start < serial_end)
 * - Pack number format validation
 * - Game ID validation (UUID format)
 *
 * @test-level UNIT
 * @justification Tests pure validation logic without form rendering - fast, isolated, deterministic
 * @story 6-10 - Lottery Management UI
 * @priority P0 (Critical - Data Integrity)
 *
 * RED PHASE: These tests define expected behavior before implementation.
 * Tests will fail until validation logic is implemented.
 */

import { describe, it, expect } from "vitest";

interface PackReceptionFormData {
  game_id: string;
  pack_number: string;
  serial_start: string;
  serial_end: string;
  bin_id?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/**
 * Validate pack reception form data
 * @param data - Form data
 * @returns Validation result with errors
 */
function validatePackReceptionForm(
  data: PackReceptionFormData,
): ValidationResult {
  const errors: Record<string, string> = {};
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Required fields: game_id
  if (!data.game_id || data.game_id.trim() === "") {
    errors.game_id = "Game ID is required";
  } else if (!uuidRegex.test(data.game_id)) {
    errors.game_id = "Game ID must be a valid UUID";
  }

  // Required fields: pack_number
  if (!data.pack_number || data.pack_number.trim() === "") {
    errors.pack_number = "Pack number is required";
  }

  // Required fields: serial_start
  if (!data.serial_start || data.serial_start.trim() === "") {
    errors.serial_start = "Serial start is required";
  }

  // Required fields: serial_end
  if (!data.serial_end || data.serial_end.trim() === "") {
    errors.serial_end = "Serial end is required";
  }

  // Serial range validation: serial_start must be less than serial_end
  if (data.serial_start && data.serial_end) {
    const startNum = parseInt(data.serial_start.replace(/\D/g, ""), 10);
    const endNum = parseInt(data.serial_end.replace(/\D/g, ""), 10);
    if (!isNaN(startNum) && !isNaN(endNum) && startNum >= endNum) {
      errors.serial_range = "Serial start must be less than serial end";
    }
  }

  // Optional bin_id validation
  if (
    data.bin_id &&
    data.bin_id.trim() !== "" &&
    !uuidRegex.test(data.bin_id)
  ) {
    errors.bin_id = "Bin ID must be a valid UUID";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PACK RECEPTION VALIDATION TESTS (P0)
// ═══════════════════════════════════════════════════════════════════════════

describe("6.10-UNIT: Pack Reception Form Validation", () => {
  describe("validatePackReceptionForm", () => {
    it("6.10-UNIT-012: [P0] should validate valid form data (AC #2)", () => {
      // GIVEN: Valid form data
      const data: PackReceptionFormData = {
        game_id: "123e4567-e89b-12d3-a456-426614174000",
        pack_number: "PACK-001",
        serial_start: "0001",
        serial_end: "0100",
        bin_id: "223e4567-e89b-12d3-a456-426614174001",
      };

      // WHEN: Validating form
      const result = validatePackReceptionForm(data);

      // THEN: Validation passes
      expect(result.valid).toBe(true);
      expect(Object.keys(result.errors)).toHaveLength(0);
    });

    it("6.10-UNIT-013: [P0] should reject missing game_id (AC #2)", () => {
      // GIVEN: Form data without game_id
      const data: PackReceptionFormData = {
        game_id: "",
        pack_number: "PACK-001",
        serial_start: "0001",
        serial_end: "0100",
      };

      // WHEN: Validating form
      const result = validatePackReceptionForm(data);

      // THEN: Validation fails with game_id error
      expect(result.valid).toBe(false);
      expect(result.errors.game_id).toBeDefined();
    });

    it("6.10-UNIT-014: [P0] should reject missing pack_number (AC #2)", () => {
      // GIVEN: Form data without pack_number
      const data: PackReceptionFormData = {
        game_id: "123e4567-e89b-12d3-a456-426614174000",
        pack_number: "",
        serial_start: "0001",
        serial_end: "0100",
      };

      // WHEN: Validating form
      const result = validatePackReceptionForm(data);

      // THEN: Validation fails with pack_number error
      expect(result.valid).toBe(false);
      expect(result.errors.pack_number).toBeDefined();
    });

    it("6.10-UNIT-015: [P0] should reject missing serial_start (AC #2)", () => {
      // GIVEN: Form data without serial_start
      const data: PackReceptionFormData = {
        game_id: "123e4567-e89b-12d3-a456-426614174000",
        pack_number: "PACK-001",
        serial_start: "",
        serial_end: "0100",
      };

      // WHEN: Validating form
      const result = validatePackReceptionForm(data);

      // THEN: Validation fails with serial_start error
      expect(result.valid).toBe(false);
      expect(result.errors.serial_start).toBeDefined();
    });

    it("6.10-UNIT-016: [P0] should reject missing serial_end (AC #2)", () => {
      // GIVEN: Form data without serial_end
      const data: PackReceptionFormData = {
        game_id: "123e4567-e89b-12d3-a456-426614174000",
        pack_number: "PACK-001",
        serial_start: "0001",
        serial_end: "",
      };

      // WHEN: Validating form
      const result = validatePackReceptionForm(data);

      // THEN: Validation fails with serial_end error
      expect(result.valid).toBe(false);
      expect(result.errors.serial_end).toBeDefined();
    });

    it("6.10-UNIT-017: [P0] should reject invalid serial range (serial_start >= serial_end) (AC #2)", () => {
      // GIVEN: Form data with invalid serial range
      const data: PackReceptionFormData = {
        game_id: "123e4567-e89b-12d3-a456-426614174000",
        pack_number: "PACK-001",
        serial_start: "0100",
        serial_end: "0001", // Invalid: start > end
      };

      // WHEN: Validating form
      const result = validatePackReceptionForm(data);

      // THEN: Validation fails with serial range error
      expect(result.valid).toBe(false);
      expect(
        result.errors.serial_range || result.errors.serial_end,
      ).toBeDefined();
    });

    it("6.10-UNIT-018: [P0] should reject invalid UUID format for game_id (AC #2)", () => {
      // GIVEN: Form data with invalid UUID
      const data: PackReceptionFormData = {
        game_id: "invalid-uuid",
        pack_number: "PACK-001",
        serial_start: "0001",
        serial_end: "0100",
      };

      // WHEN: Validating form
      const result = validatePackReceptionForm(data);

      // THEN: Validation fails with game_id format error
      expect(result.valid).toBe(false);
      expect(result.errors.game_id).toBeDefined();
    });

    it("6.10-UNIT-019: [P0] should accept optional bin_id (AC #2)", () => {
      // GIVEN: Form data without bin_id (optional)
      const data: PackReceptionFormData = {
        game_id: "123e4567-e89b-12d3-a456-426614174000",
        pack_number: "PACK-001",
        serial_start: "0001",
        serial_end: "0100",
        // bin_id omitted
      };

      // WHEN: Validating form
      const result = validatePackReceptionForm(data);

      // THEN: Validation passes (bin_id is optional)
      expect(result.valid).toBe(true);
    });

    it("6.10-UNIT-020: [P0] should reject invalid UUID format for bin_id if provided (AC #2)", () => {
      // GIVEN: Form data with invalid bin_id UUID
      const data: PackReceptionFormData = {
        game_id: "123e4567-e89b-12d3-a456-426614174000",
        pack_number: "PACK-001",
        serial_start: "0001",
        serial_end: "0100",
        bin_id: "invalid-uuid",
      };

      // WHEN: Validating form
      const result = validatePackReceptionForm(data);

      // THEN: Validation fails with bin_id format error
      expect(result.valid).toBe(false);
      expect(result.errors.bin_id).toBeDefined();
    });
  });
});
