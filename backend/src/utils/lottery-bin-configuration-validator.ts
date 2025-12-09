/**
 * Lottery Bin Configuration Validation Utilities
 *
 * Validation functions for lottery bin configuration constraints
 * Story 6.13: Lottery Database Enhancements & Bin Management
 */

/**
 * Validate bin template JSON structure
 *
 * @param binTemplate - Bin template JSON to validate
 * @returns Validation result with error message if invalid
 */
export function validateBinTemplate(binTemplate: any): {
  valid: boolean;
  error?: string;
} {
  // GIVEN: Bin template is provided
  if (binTemplate === null || binTemplate === undefined) {
    return { valid: false, error: "Bin template is required (NOT NULL)" };
  }

  // WHEN: Validating structure
  // THEN: Bin template must be an array
  if (!Array.isArray(binTemplate)) {
    return {
      valid: false,
      error: "Bin template must be an array of bin definitions",
    };
  }

  // THEN: Validate each bin definition
  for (let i = 0; i < binTemplate.length; i++) {
    // eslint-disable-next-line security/detect-object-injection
    const bin = binTemplate[i];
    if (typeof bin !== "object" || bin === null) {
      return {
        valid: false,
        error: `Bin definition at index ${i} must be an object`,
      };
    }

    // Required fields: name, display_order
    if (typeof bin.name !== "string" || bin.name.trim().length === 0) {
      return {
        valid: false,
        error: `Bin definition at index ${i} must have a non-empty name`,
      };
    }

    // Validate name length (max 255 characters per DB constraint)
    if (bin.name.length > 255) {
      return {
        valid: false,
        error: `Bin definition at index ${i} name exceeds maximum length of 255 characters`,
      };
    }

    if (
      typeof bin.display_order !== "number" ||
      bin.display_order < 0 ||
      !Number.isInteger(bin.display_order)
    ) {
      return {
        valid: false,
        error: `Bin definition at index ${i} must have a non-negative integer display_order`,
      };
    }

    // Optional field: location
    if (bin.location !== undefined && typeof bin.location !== "string") {
      return {
        valid: false,
        error: `Bin definition at index ${i} location must be a string if provided`,
      };
    }
  }

  // THEN: Validate bin count limits (1-200 bins per store)
  if (binTemplate.length < 1) {
    return {
      valid: false,
      error: "Bin template must contain at least 1 bin",
    };
  }

  if (binTemplate.length > 200) {
    return {
      valid: false,
      error: "Bin template must not exceed 200 bins per store",
    };
  }

  return { valid: true };
}

/**
 * Validate store_id is provided (required FK)
 *
 * @param storeId - Store ID to validate
 * @returns Validation result with error message if invalid
 */
export function validateStoreId(storeId: string | null): {
  valid: boolean;
  error?: string;
} {
  // GIVEN: Store ID is provided
  if (storeId === null || storeId === undefined) {
    return { valid: false, error: "Store ID is required (NOT NULL)" };
  }

  // WHEN: Validating format (UUID)
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // THEN: Store ID must be a valid UUID
  if (!uuidPattern.test(storeId)) {
    return {
      valid: false,
      error: "Store ID must be a valid UUID",
    };
  }

  return { valid: true };
}
