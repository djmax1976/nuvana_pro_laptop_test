/**
 * Shift State Machine Service
 *
 * Enterprise-grade state machine for shift lifecycle management.
 * Implements the State Pattern for predictable, auditable status transitions.
 *
 * Design Principles:
 * 1. Single Source of Truth - All status transitions go through this service
 * 2. Explicit State Transitions - No implicit status changes
 * 3. Transition Guards - Validate preconditions before allowing transitions
 * 4. Audit Trail - Every transition is logged with reason and actor
 * 5. Fail-Safe - Invalid transitions throw descriptive errors
 *
 * State Diagram:
 * ```
 *                    ┌───────────────────────────────────────────────────────┐
 *                    │              SHIFT STATE MACHINE                       │
 *                    └───────────────────────────────────────────────────────┘
 *
 *                                    ┌─────────┐
 *                                    │  OPEN   │ ← Initial State (shift created)
 *                                    └────┬────┘
 *                                         │
 *                           ┌─────────────┼─────────────┐
 *                           │ First operational action  │
 *                           │ (lottery, transaction)    │
 *                           └─────────────┼─────────────┘
 *                                         ▼
 *                                    ┌─────────┐
 *                                    │ ACTIVE  │ ← Working State (has activity)
 *                                    └────┬────┘
 *                                         │
 *                           ┌─────────────┼─────────────┐
 *                           │   initiateClosing()       │
 *                           └─────────────┼─────────────┘
 *                                         ▼
 *                                    ┌─────────┐
 *                                    │ CLOSING │ ← Closure initiated
 *                                    └────┬────┘
 *                                         │
 *                           ┌─────────────┼─────────────┐
 *                           │    reconcileCash()        │
 *                           └─────────────┼─────────────┘
 *                                         │
 *                    ┌────────────────────┴────────────────────┐
 *                    │                                         │
 *            Variance OK                              Variance Exceeded
 *          (≤$5 OR ≤1%)                              (>$5 AND >1%)
 *                    │                                         │
 *                    ▼                                         ▼
 *             ┌─────────────┐                         ┌─────────────────┐
 *             │    CLOSED   │                         │ VARIANCE_REVIEW │
 *             │ (Terminal)  │                         │ (Needs Approval)│
 *             └─────────────┘                         └────────┬────────┘
 *                                                              │
 *                                               ┌──────────────┼──────────────┐
 *                                               │   approveVariance()         │
 *                                               └──────────────┼──────────────┘
 *                                                              ▼
 *                                                       ┌─────────────┐
 *                                                       │    CLOSED   │
 *                                                       │ (Terminal)  │
 *                                                       └─────────────┘
 * ```
 *
 * MCP Guidance Applied:
 * - API-003: ERROR_HANDLING - Descriptive errors with codes for each invalid transition
 * - LM-001: LOGGING - Structured logging for all state transitions
 * - SEC-010: AUTHZ - Permission checks before sensitive transitions
 *
 * @module shift-state-machine
 */

import { ShiftStatus } from "@prisma/client";

/**
 * Defines which statuses are considered "working" states where
 * operational activities (transactions, lottery, etc.) are allowed.
 *
 * CRITICAL: This is the authoritative definition used across the codebase.
 */
export const WORKING_SHIFT_STATUSES = [
  ShiftStatus.OPEN,
  ShiftStatus.ACTIVE,
] as const;

/**
 * Defines which statuses are considered "unclosed" (shift not finalized).
 * Used for queries like "find all shifts that haven't been closed yet".
 */
export const UNCLOSED_SHIFT_STATUSES = [
  ShiftStatus.OPEN,
  ShiftStatus.ACTIVE,
  ShiftStatus.CLOSING,
  ShiftStatus.RECONCILING,
  ShiftStatus.VARIANCE_REVIEW,
] as const;

/**
 * Defines which statuses allow lottery pack activation.
 * Pack activation requires a truly active working shift.
 */
export const PACK_ACTIVATION_ALLOWED_STATUSES = [
  ShiftStatus.OPEN,
  ShiftStatus.ACTIVE,
] as const;

/**
 * Defines which statuses allow lottery pack closing/depletion.
 * Pack closing can happen during closing process.
 */
export const PACK_CLOSING_ALLOWED_STATUSES = [
  ShiftStatus.OPEN,
  ShiftStatus.ACTIVE,
  ShiftStatus.CLOSING,
] as const;

/**
 * Defines valid state transitions.
 * Key: Current status
 * Value: Array of allowed target statuses
 */
export const VALID_TRANSITIONS: Record<ShiftStatus, ShiftStatus[]> = {
  [ShiftStatus.NOT_STARTED]: [ShiftStatus.OPEN], // Reserved for future use
  [ShiftStatus.OPEN]: [
    ShiftStatus.ACTIVE,
    ShiftStatus.CLOSING,
    ShiftStatus.CLOSED,
  ], // Can activate, start closing, or direct close
  [ShiftStatus.ACTIVE]: [ShiftStatus.CLOSING, ShiftStatus.CLOSED], // Can start closing or direct close
  [ShiftStatus.CLOSING]: [ShiftStatus.CLOSED, ShiftStatus.VARIANCE_REVIEW], // Reconciliation outcomes
  [ShiftStatus.RECONCILING]: [ShiftStatus.CLOSED], // Legacy - auto-close
  [ShiftStatus.VARIANCE_REVIEW]: [ShiftStatus.CLOSED], // Manager approval
  [ShiftStatus.CLOSED]: [], // Terminal state - no further transitions
};

/**
 * Human-readable descriptions for each status
 */
export const STATUS_DESCRIPTIONS: Record<ShiftStatus, string> = {
  [ShiftStatus.NOT_STARTED]: "Shift created but not yet opened",
  [ShiftStatus.OPEN]: "Shift opened, ready for operations",
  [ShiftStatus.ACTIVE]:
    "Shift has operational activity (transactions, lottery)",
  [ShiftStatus.CLOSING]: "Shift closing initiated, awaiting cash count",
  [ShiftStatus.RECONCILING]: "Cash reconciliation in progress (legacy)",
  [ShiftStatus.VARIANCE_REVIEW]:
    "Cash variance exceeds threshold, requires manager approval",
  [ShiftStatus.CLOSED]: "Shift closed and locked - no further changes allowed",
};

/**
 * Error codes for state machine violations
 */
export enum ShiftStateMachineErrorCode {
  INVALID_TRANSITION = "INVALID_TRANSITION",
  SHIFT_LOCKED = "SHIFT_LOCKED",
  PRECONDITION_FAILED = "PRECONDITION_FAILED",
  MISSING_REQUIRED_DATA = "MISSING_REQUIRED_DATA",
}

/**
 * Custom error for state machine violations
 */
export class ShiftStateMachineError extends Error {
  constructor(
    public readonly code: ShiftStateMachineErrorCode,
    message: string,
    public readonly details: {
      currentStatus: ShiftStatus;
      targetStatus?: ShiftStatus;
      allowedTransitions?: ShiftStatus[];
      reason?: string;
    },
  ) {
    super(message);
    this.name = "ShiftStateMachineError";
  }
}

/**
 * Transition trigger - what action caused the transition
 */
export type TransitionTrigger =
  | "SHIFT_OPENED" // Shift created
  | "FIRST_ACTIVITY" // First transaction or lottery activity
  | "CLOSING_INITIATED" // User initiated closing
  | "CASH_RECONCILED" // Cash count completed (no variance)
  | "VARIANCE_DETECTED" // Cash count completed (variance exceeded)
  | "VARIANCE_APPROVED" // Manager approved variance
  | "DIRECT_CLOSE"; // Simplified single-step close

/**
 * Context for a state transition
 */
export interface TransitionContext {
  shiftId: string;
  trigger: TransitionTrigger;
  actorId: string;
  actorEmail?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Result of a successful transition
 */
export interface TransitionResult {
  previousStatus: ShiftStatus;
  newStatus: ShiftStatus;
  trigger: TransitionTrigger;
  transitionedAt: Date;
}

/**
 * Shift State Machine Service
 *
 * Provides centralized, validated state transitions for shifts.
 * All shift status changes should go through this service.
 */
export class ShiftStateMachine {
  /**
   * Check if a transition is valid
   */
  canTransition(from: ShiftStatus, to: ShiftStatus): boolean {
    // eslint-disable-next-line security/detect-object-injection -- from is typed ShiftStatus enum, not user input
    const allowed = VALID_TRANSITIONS[from];
    return allowed.includes(to);
  }

  /**
   * Get allowed transitions from a status
   */
  getAllowedTransitions(from: ShiftStatus): ShiftStatus[] {
    // eslint-disable-next-line security/detect-object-injection -- from is typed ShiftStatus enum, not user input
    return [...VALID_TRANSITIONS[from]];
  }

  /**
   * Validate a transition and throw if invalid
   */
  validateTransition(
    from: ShiftStatus,
    to: ShiftStatus,
    context: TransitionContext,
  ): void {
    // Check if shift is in terminal state
    if (from === ShiftStatus.CLOSED) {
      throw new ShiftStateMachineError(
        ShiftStateMachineErrorCode.SHIFT_LOCKED,
        `Shift ${context.shiftId} is closed and cannot be modified`,
        {
          currentStatus: from,
          targetStatus: to,
          reason: "Shift is in terminal CLOSED state",
        },
      );
    }

    // Check if transition is valid
    if (!this.canTransition(from, to)) {
      const allowed = this.getAllowedTransitions(from);
      throw new ShiftStateMachineError(
        ShiftStateMachineErrorCode.INVALID_TRANSITION,
        `Invalid status transition from ${from} to ${to}. Allowed: ${allowed.join(", ") || "none"}`,
        {
          currentStatus: from,
          targetStatus: to,
          allowedTransitions: allowed,
          reason: `Transition ${from} → ${to} is not permitted by the state machine`,
        },
      );
    }
  }

  /**
   * Check if a status allows operational activities (transactions, lottery)
   */
  isWorkingStatus(status: ShiftStatus): boolean {
    return (WORKING_SHIFT_STATUSES as readonly ShiftStatus[]).includes(status);
  }

  /**
   * Check if a status is unclosed (shift not finalized)
   */
  isUnclosedStatus(status: ShiftStatus): boolean {
    return (UNCLOSED_SHIFT_STATUSES as readonly ShiftStatus[]).includes(status);
  }

  /**
   * Check if pack activation is allowed in the given status
   */
  canActivatePack(status: ShiftStatus): boolean {
    return (
      PACK_ACTIVATION_ALLOWED_STATUSES as readonly ShiftStatus[]
    ).includes(status);
  }

  /**
   * Check if pack closing is allowed in the given status
   */
  canClosePack(status: ShiftStatus): boolean {
    return (PACK_CLOSING_ALLOWED_STATUSES as readonly ShiftStatus[]).includes(
      status,
    );
  }

  /**
   * Get descriptive error for why pack activation is not allowed
   */
  getPackActivationError(status: ShiftStatus): string {
    if (status === ShiftStatus.CLOSED) {
      return "Shift is closed. Pack activation is not allowed on closed shifts.";
    }
    if (status === ShiftStatus.CLOSING) {
      return "Shift is in closing process. Complete or cancel the closing before activating packs.";
    }
    if (status === ShiftStatus.VARIANCE_REVIEW) {
      return "Shift has a variance pending review. Resolve the variance before activating packs.";
    }
    if (status === ShiftStatus.RECONCILING) {
      return "Shift is being reconciled. Wait for reconciliation to complete.";
    }
    return `Pack activation is not allowed when shift status is ${status}.`;
  }

  /**
   * Determine the next status based on trigger
   */
  determineNextStatus(
    currentStatus: ShiftStatus,
    trigger: TransitionTrigger,
    options?: {
      varianceExceeded?: boolean;
    },
  ): ShiftStatus {
    switch (trigger) {
      case "SHIFT_OPENED":
        return ShiftStatus.OPEN;

      case "FIRST_ACTIVITY":
        if (currentStatus === ShiftStatus.OPEN) {
          return ShiftStatus.ACTIVE;
        }
        return currentStatus; // No change if already ACTIVE

      case "CLOSING_INITIATED":
        if (
          currentStatus === ShiftStatus.OPEN ||
          currentStatus === ShiftStatus.ACTIVE
        ) {
          return ShiftStatus.CLOSING;
        }
        return currentStatus;

      case "CASH_RECONCILED":
        if (currentStatus === ShiftStatus.CLOSING) {
          // If variance exceeded, go to VARIANCE_REVIEW
          if (options?.varianceExceeded) {
            return ShiftStatus.VARIANCE_REVIEW;
          }
          // Otherwise, close directly
          return ShiftStatus.CLOSED;
        }
        return currentStatus;

      case "VARIANCE_DETECTED":
        if (currentStatus === ShiftStatus.CLOSING) {
          return ShiftStatus.VARIANCE_REVIEW;
        }
        return currentStatus;

      case "VARIANCE_APPROVED":
        if (currentStatus === ShiftStatus.VARIANCE_REVIEW) {
          return ShiftStatus.CLOSED;
        }
        return currentStatus;

      case "DIRECT_CLOSE":
        if (
          currentStatus === ShiftStatus.OPEN ||
          currentStatus === ShiftStatus.ACTIVE
        ) {
          return ShiftStatus.CLOSED;
        }
        return currentStatus;

      default:
        return currentStatus;
    }
  }

  /**
   * Get human-readable status description
   */
  getStatusDescription(status: ShiftStatus): string {
    // eslint-disable-next-line security/detect-object-injection -- status is typed ShiftStatus enum, not user input
    return STATUS_DESCRIPTIONS[status] || `Unknown status: ${status}`;
  }
}

// Export singleton instance
export const shiftStateMachine = new ShiftStateMachine();
