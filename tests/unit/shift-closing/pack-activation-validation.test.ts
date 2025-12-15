/**
 * @test-level UNIT
 * @justification Tests pure pack validation business logic - no dependencies, fast execution
 * @story 10-6
 * @priority P0 (Critical - Pack Validation)
 *
 * Unit Tests: Pack Activation Validation Logic
 *
 * Tests pack validation business logic:
 * - Pack status validation (RECEIVED vs ACTIVE vs DEPLETED)
 * - Pack availability checks
 * - Bin assignment validation
 *
 * Story: 10-6 - Activate Pack During Shift
 * Priority: P0 (Foundation - Business Logic)
 */

import { describe, it, expect } from "vitest";
import {
  validatePackForActivation,
  validateBinAssignment,
  type PackForValidation,
  type BinForValidation,
} from "@/lib/utils/pack-activation-validation";

// ═══════════════════════════════════════════════════════════════════════════
// PACK STATUS VALIDATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("10-6-UNIT: Pack Status Validation", () => {
  it("10-6-UNIT-001: [P0] should validate pack status is RECEIVED for activation", () => {
    // GIVEN: Pack with status RECEIVED
    const pack: PackForValidation = {
      pack_id: "pack-123",
      status: "RECEIVED",
      pack_number: "1234567",
    };

    // WHEN: Validating pack for activation
    const result = validatePackForActivation(pack);

    // THEN: Pack is valid for activation
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("10-6-UNIT-002: [P0] should reject pack with status ACTIVE", () => {
    // GIVEN: Pack with status ACTIVE
    const pack: PackForValidation = {
      pack_id: "pack-123",
      status: "ACTIVE",
      pack_number: "1234567",
    };

    // WHEN: Validating pack for activation
    const result = validatePackForActivation(pack);

    // THEN: Pack is rejected with appropriate error
    expect(result.valid).toBe(false);
    expect(result.error).toContain("already active");
  });

  it("10-6-UNIT-003: [P0] should reject pack with status DEPLETED", () => {
    // GIVEN: Pack with status DEPLETED
    const pack: PackForValidation = {
      pack_id: "pack-123",
      status: "DEPLETED",
      pack_number: "1234567",
    };

    // WHEN: Validating pack for activation
    const result = validatePackForActivation(pack);

    // THEN: Pack is rejected with appropriate error
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not available");
  });

  it("10-6-UNIT-004: [P0] should reject pack with status RETURNED", () => {
    // GIVEN: Pack with status RETURNED
    const pack: PackForValidation = {
      pack_id: "pack-123",
      status: "RETURNED",
      pack_number: "1234567",
    };

    // WHEN: Validating pack for activation
    const result = validatePackForActivation(pack);

    // THEN: Pack is rejected with appropriate error
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not available");
  });

  it("10-6-UNIT-007: [P1] should reject null pack", () => {
    // GIVEN: Null pack
    const pack = null;

    // WHEN: Validating pack for activation
    const result = validatePackForActivation(pack);

    // THEN: Pack is rejected
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("10-6-UNIT-008: [P1] should reject undefined pack", () => {
    // GIVEN: Undefined pack
    const pack = undefined;

    // WHEN: Validating pack for activation
    const result = validatePackForActivation(pack);

    // THEN: Pack is rejected
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BIN ASSIGNMENT VALIDATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("10-6-UNIT: Bin Assignment Validation", () => {
  it("10-6-UNIT-005: [P1] should validate bin exists", () => {
    // GIVEN: Valid bin ID
    const binId = "bin-123";
    const bins: BinForValidation[] = [{ bin_id: "bin-123", bin_number: 1 }];

    // WHEN: Validating bin assignment
    const result = validateBinAssignment(binId, bins);

    // THEN: Bin is valid
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.bin).toEqual({ bin_id: "bin-123", bin_number: 1 });
  });

  it("10-6-UNIT-006: [P1] should reject invalid bin ID", () => {
    // GIVEN: Invalid bin ID
    const binId = "bin-invalid";
    const bins: BinForValidation[] = [{ bin_id: "bin-123", bin_number: 1 }];

    // WHEN: Validating bin assignment
    const result = validateBinAssignment(binId, bins);

    // THEN: Bin is rejected
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("10-6-UNIT-009: [P1] should reject null bin ID", () => {
    // GIVEN: Null bin ID
    const binId = null;
    const bins: BinForValidation[] = [{ bin_id: "bin-123", bin_number: 1 }];

    // WHEN: Validating bin assignment
    const result = validateBinAssignment(binId, bins);

    // THEN: Bin is rejected
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("10-6-UNIT-010: [P1] should reject empty bins array", () => {
    // GIVEN: Empty bins array
    const binId = "bin-123";
    const bins: BinForValidation[] = [];

    // WHEN: Validating bin assignment
    const result = validateBinAssignment(binId, bins);

    // THEN: Bin is rejected
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("10-6-UNIT-011: [P2] should reject inactive bin", () => {
    // GIVEN: Inactive bin
    const binId = "bin-123";
    const bins: BinForValidation[] = [
      { bin_id: "bin-123", bin_number: 1, is_active: false },
    ];

    // WHEN: Validating bin assignment
    const result = validateBinAssignment(binId, bins);

    // THEN: Bin is rejected
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not active");
  });
});
