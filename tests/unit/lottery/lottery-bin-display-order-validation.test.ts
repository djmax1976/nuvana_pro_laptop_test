/**
 * Lottery Bin Display Order Validation Unit Tests
 *
 * Tests for display_order validation logic:
 * - Non-negative constraint
 * - Uniqueness per store (application-level)
 *
 * @test-level Unit
 * @justification Tests pure validation logic without external dependencies
 * @story 6-13 - Lottery Database Enhancements & Bin Management
 * @priority P1 (High - Data Integrity)
 */

import { describe, it, expect } from "vitest";
import {
  validateDisplayOrder,
  validateDisplayOrderUniqueness,
} from "../../../backend/src/utils/lottery-bin-validator";

describe("6.13-UNIT: Lottery Bin Display Order Validation", () => {
  describe("validateDisplayOrder", () => {
    it("6.13-UNIT-011: should accept valid non-negative display order", () => {
      // GIVEN: A valid non-negative display order
      const displayOrder = 5;

      // WHEN: Validating display order
      const result = validateDisplayOrder(displayOrder);

      // THEN: Validation passes
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("6.13-UNIT-012: should accept zero display order", () => {
      // GIVEN: A zero display order
      const displayOrder = 0;

      // WHEN: Validating display order
      const result = validateDisplayOrder(displayOrder);

      // THEN: Validation passes
      expect(result.valid).toBe(true);
    });

    it("6.13-UNIT-013: should reject negative display order", () => {
      // GIVEN: A negative display order
      const displayOrder = -1;

      // WHEN: Validating display order
      const result = validateDisplayOrder(displayOrder);

      // THEN: Validation fails
      expect(result.valid).toBe(false);
      expect(result.error).toContain("non-negative");
    });
  });

  describe("validateDisplayOrderUniqueness", () => {
    it("6.13-UNIT-014: should accept unique display order", () => {
      // GIVEN: A unique display order and existing orders
      const displayOrder = 5;
      const existingOrders = [0, 1, 2, 3, 4];

      // WHEN: Validating uniqueness
      const result = validateDisplayOrderUniqueness(
        displayOrder,
        existingOrders,
      );

      // THEN: Validation passes
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("6.13-UNIT-015: should reject duplicate display order", () => {
      // GIVEN: A duplicate display order and existing orders
      const displayOrder = 3;
      const existingOrders = [0, 1, 2, 3, 4];

      // WHEN: Validating uniqueness
      const result = validateDisplayOrderUniqueness(
        displayOrder,
        existingOrders,
      );

      // THEN: Validation fails
      expect(result.valid).toBe(false);
      expect(result.error).toContain("already exists");
    });

    it("6.13-UNIT-016: should accept display order when no existing orders", () => {
      // GIVEN: A display order and empty existing orders
      const displayOrder = 0;
      const existingOrders: number[] = [];

      // WHEN: Validating uniqueness
      const result = validateDisplayOrderUniqueness(
        displayOrder,
        existingOrders,
      );

      // THEN: Validation passes
      expect(result.valid).toBe(true);
    });

    it("6.13-UNIT-017: should reject duplicate display order in large array", () => {
      // GIVEN: A duplicate display order in large existing orders array
      const displayOrder = 50;
      const existingOrders = Array.from({ length: 100 }, (_, i) => i); // 0-99

      // WHEN: Validating uniqueness
      const result = validateDisplayOrderUniqueness(
        displayOrder,
        existingOrders,
      );

      // THEN: Validation fails
      expect(result.valid).toBe(false);
      expect(result.error).toContain("already exists");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Edge Cases", () => {
    it("6.13-UNIT-EDGE-007: should handle very large display_order values", () => {
      // GIVEN: A very large display order
      const displayOrder = 999999;

      // WHEN: Validating display order
      const result = validateDisplayOrder(displayOrder);

      // THEN: Validation passes (large but valid non-negative integer)
      expect(result.valid).toBe(true);
    });

    it("6.13-UNIT-EDGE-008: should handle zero display_order in uniqueness check", () => {
      // GIVEN: Zero display order with existing zero
      const displayOrder = 0;
      const existingOrders = [0, 1, 2];

      // WHEN: Validating uniqueness
      const result = validateDisplayOrderUniqueness(
        displayOrder,
        existingOrders,
      );

      // THEN: Validation fails (duplicate zero)
      expect(result.valid).toBe(false);
      expect(result.error).toContain("already exists");
    });

    it("6.13-UNIT-EDGE-009: should handle multiple duplicate display orders", () => {
      // GIVEN: Display order that appears multiple times in existing orders
      const displayOrder = 5;
      const existingOrders = [0, 1, 2, 5, 3, 4, 5, 6]; // 5 appears twice

      // WHEN: Validating uniqueness
      const result = validateDisplayOrderUniqueness(
        displayOrder,
        existingOrders,
      );

      // THEN: Validation fails (duplicate detected)
      expect(result.valid).toBe(false);
      expect(result.error).toContain("already exists");
    });

    it("6.13-UNIT-EDGE-010: should handle edge case negative values", () => {
      // GIVEN: Edge case negative values
      // NOTE: Lottery data only uses integers (no decimals for game code, pack number,
      // serial number, display order, etc.). TypeScript ensures type safety at compile time.
      // This test verifies the validation rejects negative edge cases.

      // -Infinity is negative, so it should fail validation
      const negInfResult = validateDisplayOrder(-Infinity);
      expect(negInfResult.valid, "Should reject -Infinity as negative").toBe(
        false,
      );

      // Very large negative number
      const largeNegResult = validateDisplayOrder(-999999);
      expect(largeNegResult.valid, "Should reject large negative numbers").toBe(
        false,
      );

      // Just below zero
      const justBelowZeroResult = validateDisplayOrder(-1);
      expect(justBelowZeroResult.valid, "Should reject -1").toBe(false);
    });
  });
});
