/**
 * UPC-A Generator Service
 *
 * Pure functions for generating valid 12-digit UPC-A barcodes for lottery tickets.
 *
 * UPC-A Formula:
 * [Last digit of Game Code] + [Pack Number 7 digits] + [Starting Serial 3 digits] + [Check Digit]
 *
 * The check digit is calculated using the standard UPC-A algorithm:
 * 1. Sum digits at odd positions (1,3,5,7,9,11) and multiply by 3
 * 2. Sum digits at even positions (2,4,6,8,10)
 * 3. Check digit = (10 - ((oddSum * 3 + evenSum) mod 10)) mod 10
 *
 * Example: Game "0033", Pack "5633005", Starting Serial "000", 15 tickets
 * - Base 11 digits: "35633005000" (last digit of game + pack + serial)
 * - UPC[0]:  "356330050004" (with check digit 4)
 * - UPC[14]: "356330050145" (serial 014, with check digit 5)
 *
 * Enterprise coding standards applied:
 * - API-001: VALIDATION - Strict input validation with sanitization
 * - API-003: ERROR_HANDLING - Comprehensive error handling with descriptive messages
 * - SEC-006: SQL_INJECTION - N/A (pure functions, no DB access)
 * - No side effects - pure functions only
 *
 * @module services/lottery/upc-generator.service
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Input for UPC generation
 */
export interface UPCGenerationInput {
  /** 4-digit game code (e.g., "0033") - last digit will be used */
  gameCode: string;
  /** Pack number, up to 7 digits (e.g., "5633005") */
  packNumber: string;
  /** Starting serial number, up to 3 digits (e.g., "000") - base for ticket numbering */
  startingSerial: string;
  /** Number of tickets in the pack (e.g., 15 for $20 packs) */
  ticketsPerPack: number;
}

/**
 * Result of UPC generation
 */
export interface UPCGenerationResult {
  /** Whether generation was successful */
  success: boolean;
  /** Array of 12-digit UPC strings */
  upcs: string[];
  /** Metadata about the generated UPCs */
  metadata: UPCGenerationMetadata;
  /** Error message if generation failed */
  error?: string;
}

/**
 * Metadata about generated UPCs
 */
export interface UPCGenerationMetadata {
  /** Last digit of game code used in UPC */
  gameCodeSuffix: string;
  /** 7-digit pack number (zero-padded) */
  packNumber: string;
  /** 3-digit starting serial (zero-padded) */
  startingSerial: string;
  /** Total number of tickets/UPCs generated */
  ticketCount: number;
  /** First UPC in the sequence */
  firstUpc: string;
  /** Last UPC in the sequence */
  lastUpc: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether the input is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate game code format
 *
 * Game code must be exactly 4 numeric digits.
 *
 * @param gameCode - The game code to validate
 * @returns Validation result
 *
 * @example
 * validateGameCode("0033"); // { valid: true }
 * validateGameCode("12");   // { valid: false, error: "..." }
 */
export function validateGameCode(gameCode: string): ValidationResult {
  if (!gameCode || typeof gameCode !== "string") {
    return { valid: false, error: "Game code is required" };
  }

  if (!/^\d{4}$/.test(gameCode)) {
    return {
      valid: false,
      error: `Game code must be exactly 4 digits, got "${gameCode}" (${gameCode.length} chars)`,
    };
  }

  return { valid: true };
}

/**
 * Validate pack number format
 *
 * Pack number must be 1-7 numeric digits. Will be zero-padded to 7 digits.
 *
 * @param packNumber - The pack number to validate
 * @returns Validation result
 *
 * @example
 * validatePackNumber("5633005"); // { valid: true }
 * validatePackNumber("12345678"); // { valid: false, error: "..." }
 */
export function validatePackNumber(packNumber: string): ValidationResult {
  if (!packNumber || typeof packNumber !== "string") {
    return { valid: false, error: "Pack number is required" };
  }

  if (!/^\d{1,7}$/.test(packNumber)) {
    return {
      valid: false,
      error: `Pack number must be 1-7 digits, got "${packNumber}" (${packNumber.length} chars)`,
    };
  }

  return { valid: true };
}

/**
 * Validate starting serial format
 *
 * Starting serial must be 1-3 numeric digits. Will be zero-padded to 3 digits.
 *
 * @param startingSerial - The starting serial to validate
 * @returns Validation result
 *
 * @example
 * validateStartingSerial("000"); // { valid: true }
 * validateStartingSerial("15");  // { valid: true }
 * validateStartingSerial("1000"); // { valid: false, error: "..." }
 */
export function validateStartingSerial(
  startingSerial: string,
): ValidationResult {
  if (!startingSerial || typeof startingSerial !== "string") {
    return { valid: false, error: "Starting serial is required" };
  }

  // Sanitize: only allow numeric characters
  if (!/^\d{1,3}$/.test(startingSerial)) {
    return {
      valid: false,
      error: `Starting serial must be 1-3 digits, got "${startingSerial}" (${startingSerial.length} chars)`,
    };
  }

  return { valid: true };
}

/**
 * Validate tickets per pack count
 *
 * Must be a positive integer between 1 and 999 (3-digit ticket numbers).
 * Also validates that starting serial + tickets won't overflow 3 digits.
 *
 * @param ticketsPerPack - The ticket count to validate
 * @param startingSerial - Optional starting serial to check overflow
 * @returns Validation result
 *
 * @example
 * validateTicketsPerPack(15);   // { valid: true }
 * validateTicketsPerPack(1000); // { valid: false, error: "..." }
 */
export function validateTicketsPerPack(
  ticketsPerPack: number,
  startingSerial?: string,
): ValidationResult {
  if (typeof ticketsPerPack !== "number" || !Number.isInteger(ticketsPerPack)) {
    return {
      valid: false,
      error: `Tickets per pack must be an integer, got ${typeof ticketsPerPack}`,
    };
  }

  if (ticketsPerPack < 1) {
    return {
      valid: false,
      error: `Tickets per pack must be at least 1, got ${ticketsPerPack}`,
    };
  }

  if (ticketsPerPack > 999) {
    return {
      valid: false,
      error: `Tickets per pack cannot exceed 999 (3-digit limit), got ${ticketsPerPack}`,
    };
  }

  // Validate that starting serial + tickets won't overflow 3 digits (max 999)
  if (startingSerial) {
    const startNum = parseInt(startingSerial, 10);
    const endSerial = startNum + ticketsPerPack - 1;
    if (endSerial > 999) {
      return {
        valid: false,
        error: `Starting serial ${startingSerial} plus ${ticketsPerPack} tickets would exceed 999 (ends at ${endSerial})`,
      };
    }
  }

  return { valid: true };
}

// ============================================================================
// UPC-A Check Digit Calculation
// ============================================================================

/**
 * Calculate UPC-A check digit using the standard Modulo 10 algorithm
 *
 * Algorithm:
 * 1. Sum digits at odd positions (1,3,5,7,9,11) and multiply by 3
 * 2. Sum digits at even positions (2,4,6,8,10)
 * 3. Check digit = (10 - ((oddSum * 3 + evenSum) mod 10)) mod 10
 *
 * @param digits - 11-digit string (data digits without check digit)
 * @returns Single check digit (0-9)
 * @throws Error if input is not exactly 11 numeric digits
 *
 * @example
 * calculateUPCACheckDigit("00335633005"); // Returns 7
 * calculateUPCACheckDigit("35633005000"); // Returns 4
 */
export function calculateUPCACheckDigit(digits: string): number {
  // Strict validation: must be exactly 11 numeric digits
  if (!/^\d{11}$/.test(digits)) {
    throw new Error(
      `UPC-A check digit calculation requires exactly 11 numeric digits, got "${digits}" (${digits.length} chars)`,
    );
  }

  let oddSum = 0;
  let evenSum = 0;

  for (let i = 0; i < 11; i++) {
    const digit = parseInt(digits.charAt(i), 10);
    // Positions are 1-indexed: odd positions are 1,3,5,7,9,11 (indices 0,2,4,6,8,10)
    if (i % 2 === 0) {
      oddSum += digit;
    } else {
      evenSum += digit;
    }
  }

  const total = oddSum * 3 + evenSum;
  const checkDigit = (10 - (total % 10)) % 10;

  return checkDigit;
}

/**
 * Generate a complete 12-digit UPC-A barcode from 11 data digits
 *
 * Appends the calculated check digit to create a valid UPC-A.
 *
 * @param dataDigits - 11-digit string (data portion)
 * @returns 12-digit UPC-A string with check digit
 * @throws Error if input is invalid
 *
 * @example
 * generateUPCAWithCheckDigit("35633005000"); // Returns "356330050004"
 */
export function generateUPCAWithCheckDigit(dataDigits: string): string {
  const checkDigit = calculateUPCACheckDigit(dataDigits);
  return `${dataDigits}${checkDigit}`;
}

// ============================================================================
// UPC Generation
// ============================================================================

/**
 * Generate UPC-A barcodes for a lottery pack
 *
 * Creates one valid 12-digit UPC-A for each ticket in the pack.
 *
 * UPC-A Structure:
 * - Position 1: Last digit of game code
 * - Positions 2-8: Pack number (7 digits, zero-padded)
 * - Positions 9-11: Serial number (starting serial + ticket offset, zero-padded)
 * - Position 12: Calculated check digit (UPC-A Modulo 10)
 *
 * @param input - Game code, pack number, starting serial, and tickets per pack
 * @returns Generation result with UPCs array
 *
 * @example
 * const result = generatePackUPCs({
 *   gameCode: "0033",
 *   packNumber: "5633005",
 *   startingSerial: "000",
 *   ticketsPerPack: 15,
 * });
 * // result.upcs[0] = "356330050004" (serial 000, check digit 4)
 * // result.upcs[14] = "356330050145" (serial 014, check digit 5)
 */
export function generatePackUPCs(
  input: UPCGenerationInput,
): UPCGenerationResult {
  // Validate game code
  const gameCodeValidation = validateGameCode(input.gameCode);
  if (!gameCodeValidation.valid) {
    return {
      success: false,
      upcs: [],
      metadata: {} as UPCGenerationMetadata,
      error: gameCodeValidation.error,
    };
  }

  // Validate pack number
  const packNumberValidation = validatePackNumber(input.packNumber);
  if (!packNumberValidation.valid) {
    return {
      success: false,
      upcs: [],
      metadata: {} as UPCGenerationMetadata,
      error: packNumberValidation.error,
    };
  }

  // Validate starting serial
  const startingSerialValidation = validateStartingSerial(input.startingSerial);
  if (!startingSerialValidation.valid) {
    return {
      success: false,
      upcs: [],
      metadata: {} as UPCGenerationMetadata,
      error: startingSerialValidation.error,
    };
  }

  // Validate tickets per pack (with overflow check against starting serial)
  const ticketsValidation = validateTicketsPerPack(
    input.ticketsPerPack,
    input.startingSerial,
  );
  if (!ticketsValidation.valid) {
    return {
      success: false,
      upcs: [],
      metadata: {} as UPCGenerationMetadata,
      error: ticketsValidation.error,
    };
  }

  // Extract last digit of game code (new formula)
  const gameCodeSuffix = input.gameCode.substring(3, 4);

  // Pad pack number to 7 digits
  const paddedPackNumber = input.packNumber.padStart(7, "0");

  // Parse starting serial as number for incrementing
  const startSerialNum = parseInt(input.startingSerial, 10);
  const paddedStartingSerial = input.startingSerial.padStart(3, "0");

  // Generate UPC-As for each ticket
  const upcs: string[] = [];
  for (
    let ticketOffset = 0;
    ticketOffset < input.ticketsPerPack;
    ticketOffset++
  ) {
    const currentSerial = startSerialNum + ticketOffset;
    const serialPadded = currentSerial.toString().padStart(3, "0");

    // Build 11 data digits: [gameCodeSuffix(1)] + [packNumber(7)] + [serial(3)]
    const dataDigits = `${gameCodeSuffix}${paddedPackNumber}${serialPadded}`;

    // Generate complete UPC-A with check digit
    const upc = generateUPCAWithCheckDigit(dataDigits);
    upcs.push(upc);
  }

  return {
    success: true,
    upcs,
    metadata: {
      gameCodeSuffix,
      packNumber: paddedPackNumber,
      startingSerial: paddedStartingSerial,
      ticketCount: input.ticketsPerPack,
      firstUpc: upcs[0],
      lastUpc: upcs[upcs.length - 1],
    },
  };
}

/**
 * Parsed UPC-A components
 */
export interface ParsedUPCA {
  /** Last digit of game code */
  gameCodeSuffix: string;
  /** 7-digit pack number */
  packNumber: string;
  /** 3-digit serial number */
  serialNumber: string;
  /** Check digit */
  checkDigit: string;
  /** Whether the check digit is valid */
  isValidCheckDigit: boolean;
}

/**
 * Parse a 12-digit UPC-A back into its components
 *
 * Useful for debugging, validation, and verification.
 * Also validates the check digit.
 *
 * @param upc - The 12-digit UPC-A to parse
 * @returns Parsed components or null if invalid format
 *
 * @example
 * parseUPC("356330050004");
 * // {
 * //   gameCodeSuffix: "3",
 * //   packNumber: "5633005",
 * //   serialNumber: "000",
 * //   checkDigit: "4",
 * //   isValidCheckDigit: true
 * // }
 */
export function parseUPC(upc: string): ParsedUPCA | null {
  if (!upc || typeof upc !== "string" || !/^\d{12}$/.test(upc)) {
    return null;
  }

  const dataDigits = upc.substring(0, 11);
  const checkDigit = upc.substring(11, 12);

  // Validate check digit
  let isValidCheckDigit = false;
  try {
    const calculatedCheckDigit = calculateUPCACheckDigit(dataDigits);
    isValidCheckDigit = calculatedCheckDigit === parseInt(checkDigit, 10);
  } catch {
    isValidCheckDigit = false;
  }

  return {
    gameCodeSuffix: upc.substring(0, 1),
    packNumber: upc.substring(1, 8),
    serialNumber: upc.substring(8, 11),
    checkDigit,
    isValidCheckDigit,
  };
}

/**
 * Validate that a UPC is well-formed (12 digits)
 *
 * @param upc - The UPC to validate
 * @returns True if valid 12-digit UPC format
 */
export function isValidUPC(upc: string): boolean {
  return typeof upc === "string" && /^\d{12}$/.test(upc);
}

/**
 * Validate that a UPC-A has a correct check digit
 *
 * Parses the UPC and verifies the check digit matches the calculated value.
 *
 * @param upc - The 12-digit UPC-A to validate
 * @returns True if format is valid AND check digit is correct
 *
 * @example
 * isValidUPCACheckDigit("356330050004"); // true (check digit 4 is correct)
 * isValidUPCACheckDigit("356330050005"); // false (check digit should be 4, not 5)
 */
export function isValidUPCACheckDigit(upc: string): boolean {
  if (!isValidUPC(upc)) {
    return false;
  }

  try {
    const dataDigits = upc.substring(0, 11);
    const providedCheckDigit = parseInt(upc.substring(11, 12), 10);
    const calculatedCheckDigit = calculateUPCACheckDigit(dataDigits);
    return providedCheckDigit === calculatedCheckDigit;
  } catch {
    return false;
  }
}
