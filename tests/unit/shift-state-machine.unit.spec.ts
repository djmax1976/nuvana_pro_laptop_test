/**
 * Shift State Machine Unit Tests
 *
 * Pure unit tests for the ShiftStateMachine service.
 * Tests all state transition rules, guards, and helper methods.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TRACEABILITY MATRIX
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * | Test ID           | Requirement                        | Category      | Priority |
 * |-------------------|-----------------------------------|---------------|----------|
 * | SSM-U-001         | OPEN → ACTIVE transition allowed  | Transition    | P0       |
 * | SSM-U-002         | OPEN → CLOSING transition allowed | Transition    | P0       |
 * | SSM-U-003         | OPEN → CLOSED transition allowed  | Transition    | P0       |
 * | SSM-U-004         | ACTIVE → CLOSING allowed          | Transition    | P0       |
 * | SSM-U-005         | ACTIVE → CLOSED allowed           | Transition    | P0       |
 * | SSM-U-006         | CLOSING → CLOSED allowed          | Transition    | P0       |
 * | SSM-U-007         | CLOSING → VARIANCE_REVIEW allowed | Transition    | P0       |
 * | SSM-U-008         | VARIANCE_REVIEW → CLOSED allowed  | Transition    | P0       |
 * | SSM-U-009         | CLOSED is terminal state          | Transition    | P0       |
 * | SSM-U-010         | Backward transitions blocked      | Security      | P0       |
 * | SSM-U-011         | OPEN allows pack activation       | Business      | P0       |
 * | SSM-U-012         | ACTIVE allows pack activation     | Business      | P0       |
 * | SSM-U-013         | CLOSING blocks pack activation    | Business      | P0       |
 * | SSM-U-014         | CLOSED blocks pack activation     | Security      | P0       |
 * | SSM-U-015         | Error messages are descriptive    | UX            | P1       |
 * | SSM-U-016         | Working status detection          | Business      | P0       |
 * | SSM-U-017         | Unclosed status detection         | Business      | P0       |
 * | SSM-U-018         | Constants are consistent          | Integrity     | P0       |
 * | SSM-U-019         | Transition validation throws      | Error         | P0       |
 * | SSM-U-020         | Status descriptions available     | UX            | P2       |
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * @test-level Unit
 * @justification Pure unit tests for state machine logic - no I/O or dependencies
 * @story Enterprise Shift Status State Machine
 * @priority P0 (Critical - Core Business Logic)
 */

import { describe, it, expect } from "vitest";
import { ShiftStatus } from "@prisma/client";
import {
  shiftStateMachine,
  ShiftStateMachineError,
  ShiftStateMachineErrorCode,
  WORKING_SHIFT_STATUSES,
  UNCLOSED_SHIFT_STATUSES,
  PACK_ACTIVATION_ALLOWED_STATUSES,
  VALID_TRANSITIONS,
  STATUS_DESCRIPTIONS,
  type TransitionContext,
} from "../../backend/src/services/shift-state-machine";

describe("ShiftStateMachine Unit Tests", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // VALID TRANSITIONS (P0) - Test IDs: SSM-U-001 to SSM-U-008
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Valid Transitions", () => {
    it("SSM-U-001: should allow OPEN → ACTIVE transition", () => {
      // GIVEN: Shift in OPEN status
      const from = ShiftStatus.OPEN;
      const to = ShiftStatus.ACTIVE;

      // WHEN: Checking if transition is allowed
      const result = shiftStateMachine.canTransition(from, to);

      // THEN: Transition is allowed
      expect(result).toBe(true);
    });

    it("SSM-U-002: should allow OPEN → CLOSING transition", () => {
      expect(
        shiftStateMachine.canTransition(ShiftStatus.OPEN, ShiftStatus.CLOSING),
      ).toBe(true);
    });

    it("SSM-U-003: should allow OPEN → CLOSED transition (direct close)", () => {
      expect(
        shiftStateMachine.canTransition(ShiftStatus.OPEN, ShiftStatus.CLOSED),
      ).toBe(true);
    });

    it("SSM-U-004: should allow ACTIVE → CLOSING transition", () => {
      expect(
        shiftStateMachine.canTransition(
          ShiftStatus.ACTIVE,
          ShiftStatus.CLOSING,
        ),
      ).toBe(true);
    });

    it("SSM-U-005: should allow ACTIVE → CLOSED transition (direct close)", () => {
      expect(
        shiftStateMachine.canTransition(ShiftStatus.ACTIVE, ShiftStatus.CLOSED),
      ).toBe(true);
    });

    it("SSM-U-006: should allow CLOSING → CLOSED transition", () => {
      expect(
        shiftStateMachine.canTransition(
          ShiftStatus.CLOSING,
          ShiftStatus.CLOSED,
        ),
      ).toBe(true);
    });

    it("SSM-U-007: should allow CLOSING → VARIANCE_REVIEW transition", () => {
      expect(
        shiftStateMachine.canTransition(
          ShiftStatus.CLOSING,
          ShiftStatus.VARIANCE_REVIEW,
        ),
      ).toBe(true);
    });

    it("SSM-U-008: should allow VARIANCE_REVIEW → CLOSED transition", () => {
      expect(
        shiftStateMachine.canTransition(
          ShiftStatus.VARIANCE_REVIEW,
          ShiftStatus.CLOSED,
        ),
      ).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TERMINAL STATE (P0) - Test ID: SSM-U-009
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Terminal State", () => {
    it("SSM-U-009: CLOSED should be terminal state with no outgoing transitions", () => {
      // GIVEN: All possible target statuses
      const allStatuses = Object.values(ShiftStatus);

      // WHEN/THEN: No transition from CLOSED to any status should be allowed
      for (const targetStatus of allStatuses) {
        expect(
          shiftStateMachine.canTransition(ShiftStatus.CLOSED, targetStatus),
          `CLOSED → ${targetStatus} should not be allowed`,
        ).toBe(false);
      }

      // VERIFY: VALID_TRANSITIONS confirms empty array
      expect(VALID_TRANSITIONS[ShiftStatus.CLOSED]).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BACKWARD TRANSITIONS BLOCKED (P0) - Test ID: SSM-U-010
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Backward Transitions Blocked", () => {
    it("SSM-U-010: should block all backward/invalid transitions", () => {
      // CLOSING cannot go backwards
      expect(
        shiftStateMachine.canTransition(ShiftStatus.CLOSING, ShiftStatus.OPEN),
      ).toBe(false);
      expect(
        shiftStateMachine.canTransition(
          ShiftStatus.CLOSING,
          ShiftStatus.ACTIVE,
        ),
      ).toBe(false);

      // VARIANCE_REVIEW cannot go anywhere except CLOSED
      expect(
        shiftStateMachine.canTransition(
          ShiftStatus.VARIANCE_REVIEW,
          ShiftStatus.OPEN,
        ),
      ).toBe(false);
      expect(
        shiftStateMachine.canTransition(
          ShiftStatus.VARIANCE_REVIEW,
          ShiftStatus.ACTIVE,
        ),
      ).toBe(false);
      expect(
        shiftStateMachine.canTransition(
          ShiftStatus.VARIANCE_REVIEW,
          ShiftStatus.CLOSING,
        ),
      ).toBe(false);

      // ACTIVE cannot go back to OPEN
      expect(
        shiftStateMachine.canTransition(ShiftStatus.ACTIVE, ShiftStatus.OPEN),
      ).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PACK ACTIVATION RULES (P0) - Test IDs: SSM-U-011 to SSM-U-014
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Pack Activation Rules", () => {
    it("SSM-U-011: OPEN status should allow pack activation", () => {
      expect(shiftStateMachine.canActivatePack(ShiftStatus.OPEN)).toBe(true);
    });

    it("SSM-U-012: ACTIVE status should allow pack activation", () => {
      expect(shiftStateMachine.canActivatePack(ShiftStatus.ACTIVE)).toBe(true);
    });

    it("SSM-U-013: CLOSING status should block pack activation", () => {
      expect(shiftStateMachine.canActivatePack(ShiftStatus.CLOSING)).toBe(
        false,
      );
    });

    it("SSM-U-014: CLOSED status should block pack activation (security)", () => {
      expect(shiftStateMachine.canActivatePack(ShiftStatus.CLOSED)).toBe(false);
    });

    it("should block pack activation for RECONCILING status", () => {
      expect(shiftStateMachine.canActivatePack(ShiftStatus.RECONCILING)).toBe(
        false,
      );
    });

    it("should block pack activation for VARIANCE_REVIEW status", () => {
      expect(
        shiftStateMachine.canActivatePack(ShiftStatus.VARIANCE_REVIEW),
      ).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ERROR MESSAGES (P1) - Test ID: SSM-U-015
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Error Messages", () => {
    it("SSM-U-015: should provide descriptive error messages for each status", () => {
      // CLOSED error
      const closedError = shiftStateMachine.getPackActivationError(
        ShiftStatus.CLOSED,
      );
      expect(closedError).toContain("closed");
      expect(closedError.length).toBeGreaterThan(20); // Meaningful message

      // CLOSING error
      const closingError = shiftStateMachine.getPackActivationError(
        ShiftStatus.CLOSING,
      );
      expect(closingError).toContain("closing");

      // VARIANCE_REVIEW error
      const varianceError = shiftStateMachine.getPackActivationError(
        ShiftStatus.VARIANCE_REVIEW,
      );
      expect(varianceError).toContain("variance");

      // RECONCILING error
      const reconcilingError = shiftStateMachine.getPackActivationError(
        ShiftStatus.RECONCILING,
      );
      expect(reconcilingError.length).toBeGreaterThan(10);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // WORKING STATUS DETECTION (P0) - Test ID: SSM-U-016
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Working Status Detection", () => {
    it("SSM-U-016: should correctly identify working statuses", () => {
      // Working statuses
      expect(shiftStateMachine.isWorkingStatus(ShiftStatus.OPEN)).toBe(true);
      expect(shiftStateMachine.isWorkingStatus(ShiftStatus.ACTIVE)).toBe(true);

      // Non-working statuses
      expect(shiftStateMachine.isWorkingStatus(ShiftStatus.CLOSING)).toBe(
        false,
      );
      expect(shiftStateMachine.isWorkingStatus(ShiftStatus.RECONCILING)).toBe(
        false,
      );
      expect(
        shiftStateMachine.isWorkingStatus(ShiftStatus.VARIANCE_REVIEW),
      ).toBe(false);
      expect(shiftStateMachine.isWorkingStatus(ShiftStatus.CLOSED)).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // UNCLOSED STATUS DETECTION (P0) - Test ID: SSM-U-017
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Unclosed Status Detection", () => {
    it("SSM-U-017: should correctly identify unclosed statuses", () => {
      // Unclosed statuses
      expect(shiftStateMachine.isUnclosedStatus(ShiftStatus.OPEN)).toBe(true);
      expect(shiftStateMachine.isUnclosedStatus(ShiftStatus.ACTIVE)).toBe(true);
      expect(shiftStateMachine.isUnclosedStatus(ShiftStatus.CLOSING)).toBe(
        true,
      );
      expect(shiftStateMachine.isUnclosedStatus(ShiftStatus.RECONCILING)).toBe(
        true,
      );
      expect(
        shiftStateMachine.isUnclosedStatus(ShiftStatus.VARIANCE_REVIEW),
      ).toBe(true);

      // Closed status
      expect(shiftStateMachine.isUnclosedStatus(ShiftStatus.CLOSED)).toBe(
        false,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSTANTS CONSISTENCY (P0) - Test ID: SSM-U-018
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Constants Consistency", () => {
    it("SSM-U-018: WORKING_SHIFT_STATUSES should be subset of UNCLOSED_SHIFT_STATUSES", () => {
      for (const status of WORKING_SHIFT_STATUSES) {
        expect(
          (UNCLOSED_SHIFT_STATUSES as readonly ShiftStatus[]).includes(status),
          `${status} should be in UNCLOSED_SHIFT_STATUSES`,
        ).toBe(true);
      }
    });

    it("PACK_ACTIVATION_ALLOWED_STATUSES should match WORKING_SHIFT_STATUSES", () => {
      expect([...PACK_ACTIVATION_ALLOWED_STATUSES].sort()).toEqual(
        [...WORKING_SHIFT_STATUSES].sort(),
      );
    });

    it("CLOSED should not be in any active/working status list", () => {
      expect(WORKING_SHIFT_STATUSES).not.toContain(ShiftStatus.CLOSED);
      expect(UNCLOSED_SHIFT_STATUSES).not.toContain(ShiftStatus.CLOSED);
      expect(PACK_ACTIVATION_ALLOWED_STATUSES).not.toContain(
        ShiftStatus.CLOSED,
      );
    });

    it("all ShiftStatus values should be accounted for in VALID_TRANSITIONS", () => {
      const allStatuses = Object.values(ShiftStatus);
      for (const status of allStatuses) {
        expect(VALID_TRANSITIONS).toHaveProperty(status);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSITION VALIDATION (P0) - Test ID: SSM-U-019
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Transition Validation", () => {
    const mockContext: TransitionContext = {
      shiftId: "test-shift-123",
      trigger: "FIRST_ACTIVITY",
      actorId: "test-user-456",
      reason: "Test transition",
    };

    it("SSM-U-019: should throw ShiftStateMachineError for invalid transitions", () => {
      // GIVEN: Invalid transition
      const from = ShiftStatus.CLOSING;
      const to = ShiftStatus.OPEN;

      // WHEN/THEN: Validation throws
      expect(() => {
        shiftStateMachine.validateTransition(from, to, mockContext);
      }).toThrow(ShiftStateMachineError);
    });

    it("should throw SHIFT_LOCKED error when transitioning from CLOSED", () => {
      try {
        shiftStateMachine.validateTransition(
          ShiftStatus.CLOSED,
          ShiftStatus.OPEN,
          mockContext,
        );
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ShiftStateMachineError);
        expect((error as ShiftStateMachineError).code).toBe(
          ShiftStateMachineErrorCode.SHIFT_LOCKED,
        );
      }
    });

    it("should throw INVALID_TRANSITION error for disallowed transitions", () => {
      try {
        shiftStateMachine.validateTransition(
          ShiftStatus.CLOSING,
          ShiftStatus.ACTIVE,
          mockContext,
        );
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ShiftStateMachineError);
        expect((error as ShiftStateMachineError).code).toBe(
          ShiftStateMachineErrorCode.INVALID_TRANSITION,
        );
      }
    });

    it("should not throw for valid transitions", () => {
      // Should not throw
      expect(() => {
        shiftStateMachine.validateTransition(
          ShiftStatus.OPEN,
          ShiftStatus.ACTIVE,
          mockContext,
        );
      }).not.toThrow();

      expect(() => {
        shiftStateMachine.validateTransition(
          ShiftStatus.ACTIVE,
          ShiftStatus.CLOSING,
          mockContext,
        );
      }).not.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STATUS DESCRIPTIONS (P2) - Test ID: SSM-U-020
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Status Descriptions", () => {
    it("SSM-U-020: should have descriptions for all statuses", () => {
      const allStatuses = Object.values(ShiftStatus);
      for (const status of allStatuses) {
        const description = shiftStateMachine.getStatusDescription(status);
        expect(description.length).toBeGreaterThan(10);
        expect(STATUS_DESCRIPTIONS[status]).toBeDefined();
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ALLOWED TRANSITIONS HELPER
  // ═══════════════════════════════════════════════════════════════════════════

  describe("getAllowedTransitions", () => {
    it("should return correct allowed transitions for each status", () => {
      expect(
        shiftStateMachine.getAllowedTransitions(ShiftStatus.OPEN),
      ).toContain(ShiftStatus.ACTIVE);
      expect(
        shiftStateMachine.getAllowedTransitions(ShiftStatus.OPEN),
      ).toContain(ShiftStatus.CLOSING);
      expect(
        shiftStateMachine.getAllowedTransitions(ShiftStatus.CLOSED),
      ).toEqual([]);
    });

    it("should return a copy, not the original array", () => {
      const allowed = shiftStateMachine.getAllowedTransitions(ShiftStatus.OPEN);
      allowed.push(ShiftStatus.VARIANCE_REVIEW);

      // Original should be unchanged
      expect(
        shiftStateMachine.getAllowedTransitions(ShiftStatus.OPEN),
      ).not.toContain(ShiftStatus.VARIANCE_REVIEW);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DETERMINE NEXT STATUS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("determineNextStatus", () => {
    it("should transition OPEN → ACTIVE on FIRST_ACTIVITY", () => {
      const next = shiftStateMachine.determineNextStatus(
        ShiftStatus.OPEN,
        "FIRST_ACTIVITY",
      );
      expect(next).toBe(ShiftStatus.ACTIVE);
    });

    it("should keep ACTIVE unchanged on FIRST_ACTIVITY (idempotent)", () => {
      const next = shiftStateMachine.determineNextStatus(
        ShiftStatus.ACTIVE,
        "FIRST_ACTIVITY",
      );
      expect(next).toBe(ShiftStatus.ACTIVE);
    });

    it("should transition to VARIANCE_REVIEW when variance exceeded", () => {
      const next = shiftStateMachine.determineNextStatus(
        ShiftStatus.CLOSING,
        "CASH_RECONCILED",
        {
          varianceExceeded: true,
        },
      );
      expect(next).toBe(ShiftStatus.VARIANCE_REVIEW);
    });

    it("should transition to CLOSED when variance not exceeded", () => {
      const next = shiftStateMachine.determineNextStatus(
        ShiftStatus.CLOSING,
        "CASH_RECONCILED",
        {
          varianceExceeded: false,
        },
      );
      expect(next).toBe(ShiftStatus.CLOSED);
    });

    it("should transition VARIANCE_REVIEW → CLOSED on VARIANCE_APPROVED", () => {
      const next = shiftStateMachine.determineNextStatus(
        ShiftStatus.VARIANCE_REVIEW,
        "VARIANCE_APPROVED",
      );
      expect(next).toBe(ShiftStatus.CLOSED);
    });

    it("should allow DIRECT_CLOSE from OPEN or ACTIVE", () => {
      expect(
        shiftStateMachine.determineNextStatus(ShiftStatus.OPEN, "DIRECT_CLOSE"),
      ).toBe(ShiftStatus.CLOSED);
      expect(
        shiftStateMachine.determineNextStatus(
          ShiftStatus.ACTIVE,
          "DIRECT_CLOSE",
        ),
      ).toBe(ShiftStatus.CLOSED);
    });
  });
});
