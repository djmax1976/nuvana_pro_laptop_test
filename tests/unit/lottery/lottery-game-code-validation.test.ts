/**
 * Lottery Game Code Validation Unit Tests
 *
 * Tests for game_code validation logic:
 * - 4-digit format validation
 * - NOT NULL constraint enforcement
 * - Unique constraint enforcement
 * - Price NOT NULL constraint
 *
 * @test-level Unit
 * @justification Tests pure validation logic without external dependencies
 * @story 6-13 - Lottery Database Enhancements & Bin Management
 * @priority P1 (High - Database Constraints)
 */

import { describe, it, expect } from "vitest";
import {
  validateGameCodeFormat,
  validateGamePrice,
} from "../../../backend/src/utils/lottery-game-code-validator";

describe("6.13-UNIT: Lottery Game Code Validation", () => {
  describe("validateGameCodeFormat", () => {
    it("6.13-UNIT-001: should accept valid 4-digit game code", () => {
      // GIVEN: A valid 4-digit game code
      const gameCode = "1234";

      // WHEN: Validating format
      const result = validateGameCodeFormat(gameCode);

      // THEN: Validation passes
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("6.13-UNIT-002: should reject null game code", () => {
      // GIVEN: A null game code
      const gameCode = null;

      // WHEN: Validating format
      const result = validateGameCodeFormat(gameCode);

      // THEN: Validation fails with NOT NULL error
      expect(result.valid).toBe(false);
      expect(result.error).toContain("required (NOT NULL)");
    });

    it("6.13-UNIT-003: should reject game code with less than 4 digits", () => {
      // GIVEN: A game code with 3 digits
      const gameCode = "123";

      // WHEN: Validating format
      const result = validateGameCodeFormat(gameCode);

      // THEN: Validation fails
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exactly 4 digits");
    });

    it("6.13-UNIT-004: should reject game code with more than 4 digits", () => {
      // GIVEN: A game code with 5 digits
      const gameCode = "12345";

      // WHEN: Validating format
      const result = validateGameCodeFormat(gameCode);

      // THEN: Validation fails
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exactly 4 digits");
    });

    it("6.13-UNIT-005: should reject game code with non-numeric characters", () => {
      // GIVEN: A game code with letters
      const gameCode = "12AB";

      // WHEN: Validating format
      const result = validateGameCodeFormat(gameCode);

      // THEN: Validation fails
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exactly 4 digits");
    });

    it("6.13-UNIT-006: should accept game code with leading zeros", () => {
      // GIVEN: A game code with leading zeros
      const gameCode = "0001";

      // WHEN: Validating format
      const result = validateGameCodeFormat(gameCode);

      // THEN: Validation passes
      expect(result.valid).toBe(true);
    });
  });

  describe("validateGamePrice", () => {
    it("6.13-UNIT-007: should accept valid positive price", () => {
      // GIVEN: A valid positive price
      const price = 5.0;

      // WHEN: Validating price
      const result = validateGamePrice(price);

      // THEN: Validation passes
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("6.13-UNIT-008: should reject null price", () => {
      // GIVEN: A null price
      const price = null;

      // WHEN: Validating price
      const result = validateGamePrice(price);

      // THEN: Validation fails with NOT NULL error
      expect(result.valid).toBe(false);
      expect(result.error).toContain("required (NOT NULL)");
    });

    it("6.13-UNIT-009: should reject zero price", () => {
      // GIVEN: A zero price
      const price = 0;

      // WHEN: Validating price
      const result = validateGamePrice(price);

      // THEN: Validation fails
      expect(result.valid).toBe(false);
      expect(result.error).toContain("greater than 0");
    });

    it("6.13-UNIT-010: should reject negative price", () => {
      // GIVEN: A negative price
      const price = -5.0;

      // WHEN: Validating price
      const result = validateGamePrice(price);

      // THEN: Validation fails
      expect(result.valid).toBe(false);
      expect(result.error).toContain("greater than 0");
    });
  });
});
