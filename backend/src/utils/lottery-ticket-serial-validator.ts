/**
 * Lottery Ticket Serial Validation Utilities
 *
 * Validation functions for lottery ticket serial constraints
 * Story 6.13: Lottery Database Enhancements & Bin Management
 */

/**
 * Validate serial number format
 *
 * @param serialNumber - Serial number to validate
 * @returns Validation result with error message if invalid
 */
export function validateSerialNumber(serialNumber: string | null): {
  valid: boolean;
  error?: string;
} {
  // GIVEN: Serial number is provided
  if (serialNumber === null || serialNumber === undefined) {
    return { valid: false, error: "Serial number is required (NOT NULL)" };
  }

  // WHEN: Validating format
  // THEN: Serial number must not be empty
  if (serialNumber.trim().length === 0) {
    return {
      valid: false,
      error: "Serial number cannot be empty",
    };
  }

  // THEN: Serial number must not exceed 100 characters
  if (serialNumber.length > 100) {
    return {
      valid: false,
      error: "Serial number must not exceed 100 characters",
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
export function validatePackId(packId: string | null): {
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
