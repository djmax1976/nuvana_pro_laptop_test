/**
 * Pack Activation Validation Utility
 *
 * Story: 10-6 - Activate Pack During Shift
 *
 * Pure validation functions for pack activation business logic.
 * These functions contain no I/O operations and are designed for:
 * - Unit testing without mocking
 * - Reuse across components
 * - Consistent validation logic
 *
 * @security
 * - INPUT_VALIDATION: All inputs validated before processing
 * - DEFENSIVE_PROGRAMMING: Null checks and type guards throughout
 *
 * @architecture
 * - Pure functions (no side effects)
 * - Single responsibility
 * - Testable without dependencies
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Valid pack statuses in the system
 */
export type PackStatus =
  | "RECEIVED"
  | "ACTIVE"
  | "DEPLETED"
  | "RETURNED"
  | "DAMAGED"
  | "MISSING";

/**
 * Pack data required for activation validation
 */
export interface PackForValidation {
  pack_id: string;
  status: PackStatus;
  pack_number: string;
}

/**
 * Bin data for bin assignment validation
 */
export interface BinForValidation {
  bin_id: string;
  bin_number: number;
  name?: string;
  is_active?: boolean;
}

/**
 * Result of pack validation
 */
export interface PackValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Result of bin assignment validation
 */
export interface BinValidationResult {
  valid: boolean;
  error?: string;
  bin?: BinForValidation;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pack statuses that allow activation
 */
const ACTIVATABLE_STATUSES: PackStatus[] = ["RECEIVED"];

/**
 * Error messages for consistent user feedback
 */
const ERROR_MESSAGES = {
  PACK_ALREADY_ACTIVE: "Pack is already active in another bin",
  PACK_DEPLETED: "Pack is not available (depleted)",
  PACK_RETURNED: "Pack is not available (returned)",
  PACK_DAMAGED: "Pack is not available (damaged)",
  PACK_MISSING: "Pack is not available (missing)",
  PACK_INVALID_STATUS: "Pack is not available for activation",
  PACK_INVALID_DATA: "Invalid pack data provided",
  BIN_NOT_FOUND: "Bin not found",
  BIN_INVALID_DATA: "Invalid bin data provided",
  BIN_INACTIVE: "Bin is not active",
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// PACK VALIDATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate pack can be activated
 *
 * Business rules:
 * - Pack must exist and have required fields
 * - Pack status must be RECEIVED (not already active, depleted, etc.)
 *
 * @param pack - Pack object with status to validate
 * @returns PackValidationResult with valid flag and optional error message
 *
 * @example
 * const result = validatePackForActivation({
 *   pack_id: "pack-123",
 *   status: "RECEIVED",
 *   pack_number: "1234567"
 * });
 * // Returns: { valid: true }
 *
 * @example
 * const result = validatePackForActivation({
 *   pack_id: "pack-456",
 *   status: "ACTIVE",
 *   pack_number: "7654321"
 * });
 * // Returns: { valid: false, error: "Pack is already active in another bin" }
 */
export function validatePackForActivation(
  pack: PackForValidation | null | undefined,
): PackValidationResult {
  // INPUT_VALIDATION: Guard against null/undefined
  if (!pack) {
    return {
      valid: false,
      error: ERROR_MESSAGES.PACK_INVALID_DATA,
    };
  }

  // INPUT_VALIDATION: Verify required fields exist
  if (
    typeof pack.pack_id !== "string" ||
    typeof pack.status !== "string" ||
    typeof pack.pack_number !== "string"
  ) {
    return {
      valid: false,
      error: ERROR_MESSAGES.PACK_INVALID_DATA,
    };
  }

  // BUSINESS_LOGIC: Check if pack status allows activation
  if (ACTIVATABLE_STATUSES.includes(pack.status)) {
    return { valid: true };
  }

  // BUSINESS_LOGIC: Return specific error based on status
  switch (pack.status) {
    case "ACTIVE":
      return {
        valid: false,
        error: ERROR_MESSAGES.PACK_ALREADY_ACTIVE,
      };
    case "DEPLETED":
      return {
        valid: false,
        error: ERROR_MESSAGES.PACK_DEPLETED,
      };
    case "RETURNED":
      return {
        valid: false,
        error: ERROR_MESSAGES.PACK_RETURNED,
      };
    case "DAMAGED":
      return {
        valid: false,
        error: ERROR_MESSAGES.PACK_DAMAGED,
      };
    case "MISSING":
      return {
        valid: false,
        error: ERROR_MESSAGES.PACK_MISSING,
      };
    default:
      return {
        valid: false,
        error: ERROR_MESSAGES.PACK_INVALID_STATUS,
      };
  }
}

/**
 * Check if a pack status indicates the pack is activatable
 *
 * @param status - Pack status string
 * @returns true if pack can be activated
 */
export function isActivatableStatus(status: string): boolean {
  return ACTIVATABLE_STATUSES.includes(status as PackStatus);
}

// ═══════════════════════════════════════════════════════════════════════════
// BIN VALIDATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate bin exists and can have a pack assigned
 *
 * Business rules:
 * - Bin must exist in the provided bins array
 * - Bin should be active (if is_active field exists)
 *
 * @param binId - ID of the bin to validate
 * @param bins - Array of available bins
 * @returns BinValidationResult with valid flag, optional error, and found bin
 *
 * @example
 * const result = validateBinAssignment("bin-123", [
 *   { bin_id: "bin-123", bin_number: 1 },
 *   { bin_id: "bin-456", bin_number: 2 }
 * ]);
 * // Returns: { valid: true, bin: { bin_id: "bin-123", bin_number: 1 } }
 *
 * @example
 * const result = validateBinAssignment("bin-invalid", [
 *   { bin_id: "bin-123", bin_number: 1 }
 * ]);
 * // Returns: { valid: false, error: "Bin not found" }
 */
export function validateBinAssignment(
  binId: string | null | undefined,
  bins: BinForValidation[] | null | undefined,
): BinValidationResult {
  // INPUT_VALIDATION: Guard against null/undefined binId
  if (!binId || typeof binId !== "string") {
    return {
      valid: false,
      error: ERROR_MESSAGES.BIN_INVALID_DATA,
    };
  }

  // INPUT_VALIDATION: Guard against null/undefined/empty bins array
  if (!bins || !Array.isArray(bins) || bins.length === 0) {
    return {
      valid: false,
      error: ERROR_MESSAGES.BIN_NOT_FOUND,
    };
  }

  // Find bin in array
  const bin = bins.find((b) => b && b.bin_id === binId);

  if (!bin) {
    return {
      valid: false,
      error: ERROR_MESSAGES.BIN_NOT_FOUND,
    };
  }

  // Check if bin is active (if field exists and is explicitly false)
  if (bin.is_active === false) {
    return {
      valid: false,
      error: ERROR_MESSAGES.BIN_INACTIVE,
    };
  }

  return {
    valid: true,
    bin,
  };
}

/**
 * Check if a bin has an active pack assigned
 *
 * @param bin - Bin to check
 * @param activePacks - Map of bin_id to pack_id for active packs
 * @returns true if bin has an active pack
 */
export function binHasActivePack(
  bin: BinForValidation,
  activePacks: Map<string, string> | Record<string, string>,
): boolean {
  if (!bin || !bin.bin_id) return false;

  if (activePacks instanceof Map) {
    return activePacks.has(bin.bin_id);
  }

  return bin.bin_id in activePacks;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Combined validation for pack activation in a specific bin
 *
 * Validates both pack and bin in a single call for convenience.
 *
 * @param pack - Pack to activate
 * @param binId - ID of target bin
 * @param bins - Available bins array
 * @returns Combined validation result
 */
export function validatePackActivationInBin(
  pack: PackForValidation | null | undefined,
  binId: string | null | undefined,
  bins: BinForValidation[] | null | undefined,
): {
  valid: boolean;
  packError?: string;
  binError?: string;
  bin?: BinForValidation;
} {
  const packResult = validatePackForActivation(pack);
  const binResult = validateBinAssignment(binId, bins);

  return {
    valid: packResult.valid && binResult.valid,
    packError: packResult.error,
    binError: binResult.error,
    bin: binResult.bin,
  };
}
