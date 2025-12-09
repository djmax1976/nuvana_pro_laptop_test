/**
 * Lottery Ticket Serial Validation Unit Tests
 *
 * Tests for serial number validation logic:
 * - Serial number format validation
 * - Pack ID validation (FK constraint)
 * - NOT NULL constraint enforcement
 *
 * @test-level Unit
 * @justification Tests pure validation logic without external dependencies
 * @story 6-13 - Lottery Database Enhancements & Bin Management
 * @priority P1 (High - Database Constraints)
 */

import { describe, it, expect } from "vitest";
import {
  validateSerialNumber,
  validatePackId,
} from "../../../backend/src/utils/lottery-ticket-serial-validator";

describe("6.13-UNIT: Lottery Ticket Serial Validation", () => {
  describe("validateSerialNumber", () => {
    it("6.13-UNIT-031: should accept valid serial number", () => {
      // GIVEN: A valid serial number
      const serialNumber = "123456789012345678901234";

      // WHEN: Validating format
      const result = validateSerialNumber(serialNumber);

      // THEN: Validation passes
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("6.13-UNIT-032: should reject null serial number", () => {
      // GIVEN: A null serial number
      const serialNumber = null;

      // WHEN: Validating format
      const result = validateSerialNumber(serialNumber);

      // THEN: Validation fails with NOT NULL error
      expect(result.valid).toBe(false);
      expect(result.error).toContain("required (NOT NULL)");
    });

    it("6.13-UNIT-033: should reject empty serial number", () => {
      // GIVEN: An empty serial number
      const serialNumber = "";

      // WHEN: Validating format
      const result = validateSerialNumber(serialNumber);

      // THEN: Validation fails
      expect(result.valid).toBe(false);
      expect(result.error).toContain("cannot be empty");
    });

    it("6.13-UNIT-034: should reject serial number exceeding 100 characters", () => {
      // GIVEN: A serial number with 101 characters
      const serialNumber = "a".repeat(101);

      // WHEN: Validating format
      const result = validateSerialNumber(serialNumber);

      // THEN: Validation fails
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must not exceed 100 characters");
    });

    it("6.13-UNIT-035: should accept serial number with exactly 100 characters", () => {
      // GIVEN: A serial number with exactly 100 characters
      const serialNumber = "a".repeat(100);

      // WHEN: Validating format
      const result = validateSerialNumber(serialNumber);

      // THEN: Validation passes
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe("validatePackId", () => {
    it("6.13-UNIT-036: should accept valid UUID pack ID", () => {
      // GIVEN: A valid UUID pack ID
      const packId = "123e4567-e89b-12d3-a456-426614174000";

      // WHEN: Validating format
      const result = validatePackId(packId);

      // THEN: Validation passes
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("6.13-UNIT-037: should reject null pack ID", () => {
      // GIVEN: A null pack ID
      const packId = null;

      // WHEN: Validating format
      const result = validatePackId(packId);

      // THEN: Validation fails with NOT NULL error
      expect(result.valid).toBe(false);
      expect(result.error).toContain("required (NOT NULL)");
    });

    it("6.13-UNIT-038: should reject invalid UUID format", () => {
      // GIVEN: An invalid UUID format
      const packId = "not-a-uuid";

      // WHEN: Validating format
      const result = validatePackId(packId);

      // THEN: Validation fails
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must be a valid UUID");
    });

    it("6.13-UNIT-039: should reject empty string pack ID", () => {
      // GIVEN: An empty string pack ID
      const packId = "";

      // WHEN: Validating format
      const result = validatePackId(packId);

      // THEN: Validation fails
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must be a valid UUID");
    });
  });
});
