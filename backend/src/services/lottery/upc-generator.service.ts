/**
 * UPC Generator Service
 *
 * Pure functions for generating 12-digit lottery ticket UPCs from pack data.
 *
 * UPC Formula:
 * [Game Code first 2 digits] + [Pack Number 7 digits] + [Ticket Number 3 digits]
 *
 * Example: Game "0033", Pack "5633005", 15 tickets
 * - UPC[0]:  "035633005000"
 * - UPC[14]: "035633005014"
 *
 * Enterprise coding standards applied:
 * - API-001: VALIDATION - Strict input validation
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
  /** 4-digit game code (e.g., "0033") */
  gameCode: string;
  /** Pack number, up to 7 digits (e.g., "5633005") */
  packNumber: string;
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
  /** First 2 digits of game code used in UPC */
  gameCodePrefix: string;
  /** 7-digit pack number (zero-padded) */
  packNumber: string;
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
 * Validate tickets per pack count
 *
 * Must be a positive integer between 1 and 999 (3-digit ticket numbers).
 *
 * @param ticketsPerPack - The ticket count to validate
 * @returns Validation result
 *
 * @example
 * validateTicketsPerPack(15);   // { valid: true }
 * validateTicketsPerPack(1000); // { valid: false, error: "..." }
 */
export function validateTicketsPerPack(
  ticketsPerPack: number,
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

  return { valid: true };
}

// ============================================================================
// UPC Generation
// ============================================================================

/**
 * Generate UPCs for a lottery pack
 *
 * Creates one 12-digit UPC for each ticket in the pack.
 *
 * UPC Structure:
 * - Positions 1-2: First 2 digits of game code
 * - Positions 3-9: Pack number (7 digits, zero-padded)
 * - Positions 10-12: Ticket number (000 to ticketsPerPack-1)
 *
 * @param input - Game code, pack number, and tickets per pack
 * @returns Generation result with UPCs array
 *
 * @example
 * const result = generatePackUPCs({
 *   gameCode: "0033",
 *   packNumber: "5633005",
 *   ticketsPerPack: 15,
 * });
 * // result.upcs[0] = "035633005000"
 * // result.upcs[14] = "035633005014"
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

  // Validate tickets per pack
  const ticketsValidation = validateTicketsPerPack(input.ticketsPerPack);
  if (!ticketsValidation.valid) {
    return {
      success: false,
      upcs: [],
      metadata: {} as UPCGenerationMetadata,
      error: ticketsValidation.error,
    };
  }

  // Extract first 2 digits of game code
  const gameCodePrefix = input.gameCode.substring(0, 2);

  // Pad pack number to 7 digits
  const paddedPackNumber = input.packNumber.padStart(7, "0");

  // Generate UPCs for each ticket (0 to ticketsPerPack - 1)
  const upcs: string[] = [];
  for (let ticketNum = 0; ticketNum < input.ticketsPerPack; ticketNum++) {
    const ticketNumberPadded = ticketNum.toString().padStart(3, "0");
    const upc = `${gameCodePrefix}${paddedPackNumber}${ticketNumberPadded}`;
    upcs.push(upc);
  }

  return {
    success: true,
    upcs,
    metadata: {
      gameCodePrefix,
      packNumber: paddedPackNumber,
      ticketCount: input.ticketsPerPack,
      firstUpc: upcs[0],
      lastUpc: upcs[upcs.length - 1],
    },
  };
}

/**
 * Parse a 12-digit UPC back into its components
 *
 * Useful for debugging and validation.
 *
 * @param upc - The 12-digit UPC to parse
 * @returns Parsed components or null if invalid
 *
 * @example
 * parseUPC("035633005014");
 * // { gameCodePrefix: "03", packNumber: "5633005", ticketNumber: "014" }
 */
export function parseUPC(
  upc: string,
): { gameCodePrefix: string; packNumber: string; ticketNumber: string } | null {
  if (!upc || typeof upc !== "string" || !/^\d{12}$/.test(upc)) {
    return null;
  }

  return {
    gameCodePrefix: upc.substring(0, 2),
    packNumber: upc.substring(2, 9),
    ticketNumber: upc.substring(9, 12),
  };
}

/**
 * Validate that a UPC is well-formed (12 digits)
 *
 * @param upc - The UPC to validate
 * @returns True if valid 12-digit UPC
 */
export function isValidUPC(upc: string): boolean {
  return typeof upc === "string" && /^\d{12}$/.test(upc);
}
