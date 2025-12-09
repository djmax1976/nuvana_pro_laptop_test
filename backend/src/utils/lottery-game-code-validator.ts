/**
 * Lottery Game Code Validation Utilities
 *
 * Validation functions for lottery game code format and price constraints
 * Story 6.13: Lottery Database Enhancements & Bin Management
 */

/**
 * Validate game code format (4 digits only)
 *
 * @param gameCode - Game code to validate
 * @returns Validation result with error message if invalid
 */
export function validateGameCodeFormat(gameCode: string | null): {
  valid: boolean;
  error?: string;
} {
  // GIVEN: Game code is provided
  if (gameCode === null || gameCode === undefined) {
    return { valid: false, error: "Game code is required (NOT NULL)" };
  }

  // WHEN: Validating format
  const fourDigitPattern = /^[0-9]{4}$/;

  // THEN: Game code must be exactly 4 digits
  if (!fourDigitPattern.test(gameCode)) {
    return {
      valid: false,
      error: "Game code must be exactly 4 digits (0-9)",
    };
  }

  return { valid: true };
}

/**
 * Validate game price (must be positive, NOT NULL)
 *
 * @param price - Price to validate
 * @returns Validation result with error message if invalid
 */
export function validateGamePrice(price: number | null): {
  valid: boolean;
  error?: string;
} {
  // GIVEN: Price is provided
  if (price === null || price === undefined) {
    return { valid: false, error: "Price is required (NOT NULL)" };
  }

  // WHEN: Validating price
  // THEN: Price must be positive
  if (price <= 0) {
    return { valid: false, error: "Price must be greater than 0" };
  }

  return { valid: true };
}
