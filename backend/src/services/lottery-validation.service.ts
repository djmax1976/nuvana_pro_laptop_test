/**
 * Lottery Pack Validation Service
 *
 * Pure validation functions for lottery pack reception.
 * These functions contain no database operations - only business rule validation.
 *
 * Business Rules:
 * - Serial numbers must be numeric-only (digits 0-9)
 * - Serial range comparison uses BigInt for accurate numeric comparison (24-digit numbers)
 * - Pack numbers: 1-50 characters
 * - Game ID and Bin ID must be valid UUID format when provided
 */

// UUID v4 regex pattern
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Numeric-only regex (for serial numbers)
const NUMERIC_REGEX = /^\d+$/;

// Maximum reasonable length for serial numbers
const MAX_SERIAL_LENGTH = 100;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface CompositeValidationResult {
  valid: boolean;
  errors: Array<{ field: string; error: string }>;
}

/**
 * Validates that serial_start is less than serial_end using BigInt comparison.
 * This is necessary because serial numbers can be 24+ digits, exceeding Number.MAX_SAFE_INTEGER.
 */
export function validateSerialRange(
  serialStart: string,
  serialEnd: string,
): ValidationResult {
  // Trim whitespace
  const start = serialStart.trim();
  const end = serialEnd.trim();

  // Check for empty values
  if (!start || !end) {
    return {
      valid: false,
      error: "serial_start and serial_end are required",
    };
  }

  // Check numeric format
  if (!NUMERIC_REGEX.test(start) || !NUMERIC_REGEX.test(end)) {
    return {
      valid: false,
      error: "Serial numbers must be numeric",
    };
  }

  // Use BigInt for comparison (handles numbers > Number.MAX_SAFE_INTEGER)
  try {
    const startBigInt = BigInt(start);
    const endBigInt = BigInt(end);

    if (startBigInt >= endBigInt) {
      return {
        valid: false,
        error: "serial_start must be less than serial_end",
      };
    }

    return { valid: true };
  } catch {
    return {
      valid: false,
      error: "Invalid serial number format",
    };
  }
}

/**
 * Validates serial number format (numeric-only, reasonable length).
 */
export function validateSerialFormat(
  serialStart: string,
  serialEnd: string,
): ValidationResult {
  const start = serialStart.trim();
  const end = serialEnd.trim();

  // Check for empty values
  if (!start) {
    return {
      valid: false,
      error: "serial_start is required",
    };
  }

  if (!end) {
    return {
      valid: false,
      error: "serial_end is required",
    };
  }

  // Check length limits
  if (start.length > MAX_SERIAL_LENGTH) {
    return {
      valid: false,
      error: `serial_start exceeds maximum length of ${MAX_SERIAL_LENGTH} characters`,
    };
  }

  if (end.length > MAX_SERIAL_LENGTH) {
    return {
      valid: false,
      error: `serial_end exceeds maximum length of ${MAX_SERIAL_LENGTH} characters`,
    };
  }

  // Check numeric format
  if (!NUMERIC_REGEX.test(start)) {
    return {
      valid: false,
      error: "serial_start must be numeric",
    };
  }

  if (!NUMERIC_REGEX.test(end)) {
    return {
      valid: false,
      error: "serial_end must be numeric",
    };
  }

  return { valid: true };
}

/**
 * Validates pack number format (1-50 characters, non-empty).
 */
export function validatePackNumber(packNumber: string): ValidationResult {
  const trimmed = packNumber.trim();

  if (!trimmed) {
    return {
      valid: false,
      error: "pack_number is required",
    };
  }

  if (trimmed.length > 50) {
    return {
      valid: false,
      error: "pack_number exceeds maximum of 50 characters",
    };
  }

  return { valid: true };
}

/**
 * Validates game_id format (required, valid UUID).
 */
export function validateGameIdFormat(gameId: string): ValidationResult {
  const trimmed = gameId.trim();

  if (!trimmed) {
    return {
      valid: false,
      error: "game_id is required",
    };
  }

  if (!UUID_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: "game_id must be a valid UUID",
    };
  }

  return { valid: true };
}

/**
 * Validates bin_id format (optional, but if provided must be valid UUID).
 */
export function validateBinIdFormat(binId?: string): ValidationResult {
  // bin_id is optional
  if (binId === undefined || binId === null) {
    return { valid: true };
  }

  const trimmed = binId.trim();

  if (!trimmed) {
    return { valid: true }; // Empty string treated as not provided
  }

  if (!UUID_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: "bin_id must be a valid UUID",
    };
  }

  return { valid: true };
}

/**
 * Validates all pack reception data fields together.
 * Returns all validation errors at once for better UX.
 */
export function validatePackReceptionData(packData: {
  game_id: string;
  pack_number: string;
  serial_start: string;
  serial_end: string;
  bin_id?: string;
}): CompositeValidationResult {
  const errors: Array<{ field: string; error: string }> = [];

  // Validate game_id
  const gameIdResult = validateGameIdFormat(packData.game_id);
  if (!gameIdResult.valid && gameIdResult.error) {
    errors.push({ field: "game_id", error: gameIdResult.error });
  }

  // Validate pack_number
  const packNumberResult = validatePackNumber(packData.pack_number);
  if (!packNumberResult.valid && packNumberResult.error) {
    errors.push({ field: "pack_number", error: packNumberResult.error });
  }

  // Validate serial format first
  const serialFormatResult = validateSerialFormat(
    packData.serial_start,
    packData.serial_end,
  );
  if (!serialFormatResult.valid && serialFormatResult.error) {
    // Determine which field has the error
    if (serialFormatResult.error.includes("serial_start")) {
      errors.push({ field: "serial_start", error: serialFormatResult.error });
    } else if (serialFormatResult.error.includes("serial_end")) {
      errors.push({ field: "serial_end", error: serialFormatResult.error });
    } else {
      errors.push({ field: "serial_start", error: serialFormatResult.error });
    }
  }

  // If serial format is valid, also validate range
  if (serialFormatResult.valid) {
    const serialRangeResult = validateSerialRange(
      packData.serial_start,
      packData.serial_end,
    );
    if (!serialRangeResult.valid && serialRangeResult.error) {
      errors.push({ field: "serial_range", error: serialRangeResult.error });
    }
  }

  // Validate bin_id (optional)
  const binIdResult = validateBinIdFormat(packData.bin_id);
  if (!binIdResult.valid && binIdResult.error) {
    errors.push({ field: "bin_id", error: binIdResult.error });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
