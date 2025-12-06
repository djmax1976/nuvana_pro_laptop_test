/**
 * Lottery Pack Activation Validation Service
 *
 * Pure validation functions for lottery pack activation.
 * These functions contain no database operations - only business rule validation.
 *
 * Business Rules:
 * - Only RECEIVED status packs can be activated
 * - Status transition: RECEIVED → ACTIVE (only valid transition)
 * - ACTIVE, DEPLETED, RETURNED packs cannot be activated
 * - Pack ID must be valid UUID format
 */

import { LotteryPackStatus } from "@prisma/client";

// UUID v4 regex pattern
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates that a pack status is valid for activation.
 * Only RECEIVED status packs can be activated.
 */
export function validatePackStatusForActivation(
  status: LotteryPackStatus,
): ValidationResult {
  if (status === LotteryPackStatus.RECEIVED) {
    return { valid: true };
  }

  if (status === LotteryPackStatus.ACTIVE) {
    return {
      valid: false,
      error: "Pack with status ACTIVE is already activated",
    };
  }

  if (status === LotteryPackStatus.DEPLETED) {
    return {
      valid: false,
      error: "Pack with status DEPLETED cannot be activated",
    };
  }

  if (status === LotteryPackStatus.RETURNED) {
    return {
      valid: false,
      error: "Pack with status RETURNED cannot be activated",
    };
  }

  return {
    valid: false,
    error: `Pack with status ${status} cannot be activated`,
  };
}

/**
 * Validates a status transition for activation.
 * Only RECEIVED → ACTIVE transition is valid.
 */
export function validateStatusTransition(
  previousStatus: LotteryPackStatus,
  newStatus: LotteryPackStatus,
): ValidationResult {
  // Only validate transitions to ACTIVE
  if (newStatus !== LotteryPackStatus.ACTIVE) {
    return {
      valid: false,
      error: `Status transition to ${newStatus} is an invalid transition for activation`,
    };
  }

  // RECEIVED → ACTIVE is the only valid transition
  if (previousStatus === LotteryPackStatus.RECEIVED) {
    return { valid: true };
  }

  if (previousStatus === LotteryPackStatus.ACTIVE) {
    return {
      valid: false,
      error: "Pack is already ACTIVE",
    };
  }

  if (previousStatus === LotteryPackStatus.DEPLETED) {
    return {
      valid: false,
      error: "Pack with status DEPLETED cannot be activated",
    };
  }

  if (previousStatus === LotteryPackStatus.RETURNED) {
    return {
      valid: false,
      error: "Pack with status RETURNED cannot be activated",
    };
  }

  return {
    valid: false,
    error: `Status transition from ${previousStatus} to ${newStatus} is an invalid transition`,
  };
}

/**
 * Validates pack ID format (must be valid UUID).
 */
export function validatePackIdFormat(packId: string | null): ValidationResult {
  if (!packId) {
    return {
      valid: false,
      error: "Pack ID is required",
    };
  }

  if (!UUID_REGEX.test(packId)) {
    return {
      valid: false,
      error: "Pack ID must be a valid UUID format (invalid UUID)",
    };
  }

  return { valid: true };
}
