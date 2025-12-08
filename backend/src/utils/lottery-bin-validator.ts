/**
 * Lottery Bin Validation Utilities
 *
 * Validation functions for lottery bin display order and active status
 * Story 6.13: Lottery Database Enhancements & Bin Management
 */

/**
 * Validate display order (must be non-negative)
 *
 * @param displayOrder - Display order to validate
 * @returns Validation result with error message if invalid
 */
export function validateDisplayOrder(displayOrder: number): {
  valid: boolean;
  error?: string;
} {
  // GIVEN: Display order is provided
  // WHEN: Validating display order
  // THEN: Display order must be non-negative
  if (displayOrder < 0) {
    return {
      valid: false,
      error: "Display order must be non-negative (>= 0)",
    };
  }

  return { valid: true };
}

/**
 * Validate display order uniqueness within a store
 *
 * @param displayOrder - Display order to check
 * @param existingOrders - Array of existing display orders for the store
 * @returns Validation result with error message if invalid
 */
export function validateDisplayOrderUniqueness(
  displayOrder: number,
  existingOrders: number[],
): { valid: boolean; error?: string } {
  // GIVEN: Display order and existing orders for a store
  // WHEN: Checking uniqueness
  // THEN: Display order must be unique within the store
  if (existingOrders.includes(displayOrder)) {
    return {
      valid: false,
      error: `Display order ${displayOrder} already exists for this store`,
    };
  }

  return { valid: true };
}
