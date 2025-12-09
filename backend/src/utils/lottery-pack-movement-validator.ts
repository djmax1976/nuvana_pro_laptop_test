/**
 * Lottery Pack Movement Validation Utilities
 *
 * Validation functions for lottery pack movement tracking constraints
 * Story 6.13: Lottery Database Enhancements & Bin Management
 */

/**
 * Validate pack movement reason (optional, max 500 characters)
 *
 * @param reason - Movement reason to validate
 * @returns Validation result with error message if invalid
 */
export function validateMovementReason(reason: string | null | undefined): {
  valid: boolean;
  error?: string;
} {
  // GIVEN: Reason is provided (optional field)
  if (reason === null || reason === undefined) {
    return { valid: true }; // Reason is optional
  }

  // WHEN: Validating format
  // THEN: Reason must not exceed 500 characters
  if (reason.length > 500) {
    return {
      valid: false,
      error: "Movement reason must not exceed 500 characters",
    };
  }

  return { valid: true };
}

/**
 * Validate pack_id is provided (required FK)
 *
 * @param packId - Pack ID to validate
 * @returns Validation result with error message if invalid
 */
export function validatePackIdForMovement(packId: string | null): {
  valid: boolean;
  error?: string;
} {
  // GIVEN: Pack ID is provided
  if (packId === null || packId === undefined) {
    return { valid: false, error: "Pack ID is required (NOT NULL)" };
  }

  // WHEN: Validating format (UUID)
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // THEN: Pack ID must be a valid UUID
  if (!uuidPattern.test(packId)) {
    return {
      valid: false,
      error: "Pack ID must be a valid UUID",
    };
  }

  return { valid: true };
}

/**
 * Validate bin_id is provided (required FK)
 *
 * @param binId - Bin ID to validate
 * @returns Validation result with error message if invalid
 */
export function validateBinId(binId: string | null): {
  valid: boolean;
  error?: string;
} {
  // GIVEN: Bin ID is provided
  if (binId === null || binId === undefined) {
    return { valid: false, error: "Bin ID is required (NOT NULL)" };
  }

  // WHEN: Validating format (UUID)
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // THEN: Bin ID must be a valid UUID
  if (!uuidPattern.test(binId)) {
    return {
      valid: false,
      error: "Bin ID must be a valid UUID",
    };
  }

  return { valid: true };
}

/**
 * Validate moved_by is provided (required FK)
 *
 * @param movedBy - User ID who moved the pack
 * @returns Validation result with error message if invalid
 */
export function validateMovedBy(movedBy: string | null): {
  valid: boolean;
  error?: string;
} {
  // GIVEN: Moved by user ID is provided
  if (movedBy === null || movedBy === undefined) {
    return { valid: false, error: "Moved by user ID is required (NOT NULL)" };
  }

  // WHEN: Validating format (UUID)
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // THEN: Moved by must be a valid UUID
  if (!uuidPattern.test(movedBy)) {
    return {
      valid: false,
      error: "Moved by user ID must be a valid UUID",
    };
  }

  return { valid: true };
}
