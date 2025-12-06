/**
 * Unit Tests: Lottery Pack Activation Validation
 *
 * Tests validation logic for lottery pack activation:
 * - Status transition validation (RECEIVED → ACTIVE only)
 * - Status validation (reject ACTIVE, DEPLETED, RETURNED)
 * - Pack ID format validation (UUID)
 *
 * @test-level UNIT
 * @justification Pure validation logic without database operations - business rules validation
 * @story 6.3 - Lottery Pack Activation
 * @priority P0 (Critical - Business Logic Validation)
 *
 * Business Rules:
 * - Only RECEIVED status packs can be activated
 * - Status transition: RECEIVED → ACTIVE (only valid transition)
 * - ACTIVE, DEPLETED, RETURNED packs cannot be activated
 * - Pack ID must be valid UUID format
 */

import { describe, it, expect } from "vitest";
import {
  validatePackStatusForActivation,
  validateStatusTransition,
  validatePackIdFormat,
} from "../../../backend/src/services/lottery-activation-validation.service";
import { LotteryPackStatus } from "@prisma/client";

// ═══════════════════════════════════════════════════════════════════════════
// STATUS VALIDATION TESTS (AC #2)
// ═══════════════════════════════════════════════════════════════════════════

describe("6.3-UNIT: Pack Status Validation for Activation", () => {
  it("6.3-UNIT-001: [P0] should validate RECEIVED status is valid for activation", () => {
    // GIVEN: Pack status is RECEIVED
    const status = LotteryPackStatus.RECEIVED;

    // WHEN: Validating status for activation
    const result = validatePackStatusForActivation(status);

    // THEN: Validation passes
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("6.3-UNIT-002: [P0] should reject ACTIVE status (already activated)", () => {
    // GIVEN: Pack status is ACTIVE
    const status = LotteryPackStatus.ACTIVE;

    // WHEN: Validating status for activation
    const result = validatePackStatusForActivation(status);

    // THEN: Validation fails with appropriate error
    expect(result.valid).toBe(false);
    expect(result.error).toContain("ACTIVE");
    expect(result.error).toContain("already activated");
  });

  it("6.3-UNIT-003: [P0] should reject DEPLETED status", () => {
    // GIVEN: Pack status is DEPLETED
    const status = LotteryPackStatus.DEPLETED;

    // WHEN: Validating status for activation
    const result = validatePackStatusForActivation(status);

    // THEN: Validation fails with appropriate error
    expect(result.valid).toBe(false);
    expect(result.error).toContain("DEPLETED");
    expect(result.error).toContain("cannot be activated");
  });

  it("6.3-UNIT-004: [P0] should reject RETURNED status", () => {
    // GIVEN: Pack status is RETURNED
    const status = LotteryPackStatus.RETURNED;

    // WHEN: Validating status for activation
    const result = validatePackStatusForActivation(status);

    // THEN: Validation fails with appropriate error
    expect(result.valid).toBe(false);
    expect(result.error).toContain("RETURNED");
    expect(result.error).toContain("cannot be activated");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STATUS TRANSITION VALIDATION TESTS (AC #1)
// ═══════════════════════════════════════════════════════════════════════════

describe("6.3-UNIT: Status Transition Validation", () => {
  it("6.3-UNIT-005: [P0] should validate RECEIVED → ACTIVE transition", () => {
    // GIVEN: Pack status is RECEIVED
    const previousStatus = LotteryPackStatus.RECEIVED;
    const newStatus = LotteryPackStatus.ACTIVE;

    // WHEN: Validating status transition
    const result = validateStatusTransition(previousStatus, newStatus);

    // THEN: Transition is valid
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("6.3-UNIT-006: [P0] should reject ACTIVE → ACTIVE transition (no change)", () => {
    // GIVEN: Pack status is already ACTIVE
    const previousStatus = LotteryPackStatus.ACTIVE;
    const newStatus = LotteryPackStatus.ACTIVE;

    // WHEN: Validating status transition
    const result = validateStatusTransition(previousStatus, newStatus);

    // THEN: Transition is invalid
    expect(result.valid).toBe(false);
    expect(result.error).toContain("already ACTIVE");
  });

  it("6.3-UNIT-007: [P0] should reject DEPLETED → ACTIVE transition", () => {
    // GIVEN: Pack status is DEPLETED
    const previousStatus = LotteryPackStatus.DEPLETED;
    const newStatus = LotteryPackStatus.ACTIVE;

    // WHEN: Validating status transition
    const result = validateStatusTransition(previousStatus, newStatus);

    // THEN: Transition is invalid
    expect(result.valid).toBe(false);
    expect(result.error).toContain("DEPLETED");
    expect(result.error).toContain("cannot be activated");
  });

  it("6.3-UNIT-008: [P0] should reject RETURNED → ACTIVE transition", () => {
    // GIVEN: Pack status is RETURNED
    const previousStatus = LotteryPackStatus.RETURNED;
    const newStatus = LotteryPackStatus.ACTIVE;

    // WHEN: Validating status transition
    const result = validateStatusTransition(previousStatus, newStatus);

    // THEN: Transition is invalid
    expect(result.valid).toBe(false);
    expect(result.error).toContain("RETURNED");
    expect(result.error).toContain("cannot be activated");
  });

  it("6.3-UNIT-009: [P0] should reject RECEIVED → DEPLETED transition (invalid)", () => {
    // GIVEN: Pack status is RECEIVED
    const previousStatus = LotteryPackStatus.RECEIVED;
    const newStatus = LotteryPackStatus.DEPLETED;

    // WHEN: Validating status transition
    const result = validateStatusTransition(previousStatus, newStatus);

    // THEN: Transition is invalid (only RECEIVED → ACTIVE allowed)
    expect(result.valid).toBe(false);
    expect(result.error).toContain("invalid transition");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PACK ID FORMAT VALIDATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("6.3-UNIT: Pack ID Format Validation", () => {
  it("6.3-UNIT-010: [P0] should validate valid UUID format", () => {
    // GIVEN: Valid UUID pack ID
    const packId = "550e8400-e29b-41d4-a716-446655440000";

    // WHEN: Validating pack ID format
    const result = validatePackIdFormat(packId);

    // THEN: Validation passes
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("6.3-UNIT-011: [P0] should reject invalid UUID format", () => {
    // GIVEN: Invalid UUID format
    const packId = "not-a-uuid";

    // WHEN: Validating pack ID format
    const result = validatePackIdFormat(packId);

    // THEN: Validation fails
    expect(result.valid).toBe(false);
    expect(result.error).toContain("invalid UUID");
  });

  it("6.3-UNIT-012: [P0] should reject empty pack ID", () => {
    // GIVEN: Empty pack ID
    const packId = "";

    // WHEN: Validating pack ID format
    const result = validatePackIdFormat(packId);

    // THEN: Validation fails
    expect(result.valid).toBe(false);
    expect(result.error).toContain("required");
  });

  it("6.3-UNIT-013: [P0] should reject null pack ID", () => {
    // GIVEN: Null pack ID
    const packId = null as any;

    // WHEN: Validating pack ID format
    const result = validatePackIdFormat(packId);

    // THEN: Validation fails
    expect(result.valid).toBe(false);
    expect(result.error).toContain("required");
  });
});
