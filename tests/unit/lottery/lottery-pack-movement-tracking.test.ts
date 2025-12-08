/**
 * Lottery Pack Movement Tracking Unit Tests
 *
 * Tests for pack movement validation logic:
 * - Movement reason validation (optional, max 500 chars)
 * - Pack ID validation (FK constraint)
 * - Bin ID validation (FK constraint)
 * - Moved by user ID validation (FK constraint)
 *
 * @test-level Unit
 * @justification Tests pure validation logic without external dependencies
 * @story 6-13 - Lottery Database Enhancements & Bin Management
 * @priority P1 (High - Database Constraints)
 */

import { describe, it, expect } from "vitest";
import {
  validateMovementReason,
  validatePackIdForMovement,
  validateBinId,
  validateMovedBy,
} from "../../../backend/src/utils/lottery-pack-movement-validator";

describe("6.13-UNIT: Lottery Pack Movement Tracking", () => {
  describe("validateMovementReason", () => {
    it("6.13-UNIT-040: should accept valid reason", () => {
      // GIVEN: A valid reason
      const reason = "Pack moved to front display bin";

      // WHEN: Validating format
      const result = validateMovementReason(reason);

      // THEN: Validation passes
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("6.13-UNIT-041: should accept null reason (optional field)", () => {
      // GIVEN: A null reason (optional)
      const reason = null;

      // WHEN: Validating format
      const result = validateMovementReason(reason);

      // THEN: Validation passes (reason is optional)
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("6.13-UNIT-042: should accept undefined reason (optional field)", () => {
      // GIVEN: An undefined reason (optional)
      const reason = undefined;

      // WHEN: Validating format
      const result = validateMovementReason(reason);

      // THEN: Validation passes (reason is optional)
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("6.13-UNIT-043: should reject reason exceeding 500 characters", () => {
      // GIVEN: A reason with 501 characters
      const reason = "a".repeat(501);

      // WHEN: Validating format
      const result = validateMovementReason(reason);

      // THEN: Validation fails
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must not exceed 500 characters");
    });

    it("6.13-UNIT-044: should accept reason with exactly 500 characters", () => {
      // GIVEN: A reason with exactly 500 characters
      const reason = "a".repeat(500);

      // WHEN: Validating format
      const result = validateMovementReason(reason);

      // THEN: Validation passes
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe("validatePackIdForMovement", () => {
    it("6.13-UNIT-045: should accept valid UUID pack ID", () => {
      // GIVEN: A valid UUID pack ID
      const packId = "123e4567-e89b-12d3-a456-426614174000";

      // WHEN: Validating format
      const result = validatePackIdForMovement(packId);

      // THEN: Validation passes
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("6.13-UNIT-046: should reject null pack ID", () => {
      // GIVEN: A null pack ID
      const packId = null;

      // WHEN: Validating format
      const result = validatePackIdForMovement(packId);

      // THEN: Validation fails with NOT NULL error
      expect(result.valid).toBe(false);
      expect(result.error).toContain("required (NOT NULL)");
    });

    it("6.13-UNIT-047: should reject invalid UUID format", () => {
      // GIVEN: An invalid UUID format
      const packId = "not-a-uuid";

      // WHEN: Validating format
      const result = validatePackIdForMovement(packId);

      // THEN: Validation fails
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must be a valid UUID");
    });
  });

  describe("validateBinId", () => {
    it("6.13-UNIT-048: should accept valid UUID bin ID", () => {
      // GIVEN: A valid UUID bin ID
      const binId = "123e4567-e89b-12d3-a456-426614174000";

      // WHEN: Validating format
      const result = validateBinId(binId);

      // THEN: Validation passes
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("6.13-UNIT-049: should reject null bin ID", () => {
      // GIVEN: A null bin ID
      const binId = null;

      // WHEN: Validating format
      const result = validateBinId(binId);

      // THEN: Validation fails with NOT NULL error
      expect(result.valid).toBe(false);
      expect(result.error).toContain("required (NOT NULL)");
    });

    it("6.13-UNIT-050: should reject invalid UUID format", () => {
      // GIVEN: An invalid UUID format
      const binId = "not-a-uuid";

      // WHEN: Validating format
      const result = validateBinId(binId);

      // THEN: Validation fails
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must be a valid UUID");
    });
  });

  describe("validateMovedBy", () => {
    it("6.13-UNIT-051: should accept valid UUID user ID", () => {
      // GIVEN: A valid UUID user ID
      const movedBy = "123e4567-e89b-12d3-a456-426614174000";

      // WHEN: Validating format
      const result = validateMovedBy(movedBy);

      // THEN: Validation passes
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("6.13-UNIT-052: should reject null moved by user ID", () => {
      // GIVEN: A null moved by user ID
      const movedBy = null;

      // WHEN: Validating format
      const result = validateMovedBy(movedBy);

      // THEN: Validation fails with NOT NULL error
      expect(result.valid).toBe(false);
      expect(result.error).toContain("required (NOT NULL)");
    });

    it("6.13-UNIT-053: should reject invalid UUID format", () => {
      // GIVEN: An invalid UUID format
      const movedBy = "not-a-uuid";

      // WHEN: Validating format
      const result = validateMovedBy(movedBy);

      // THEN: Validation fails
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must be a valid UUID");
    });
  });
});
