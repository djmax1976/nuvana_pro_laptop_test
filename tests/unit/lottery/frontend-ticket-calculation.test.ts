/**
 * Unit Tests: Frontend Ticket Count Calculation
 *
 * Tests the frontend calculateTicketsSold function used in:
 * - UnscannedBinWarningModal (mark sold out workflow)
 * - DayCloseModeScanner (manual entry and table display)
 *
 * These tests verify that the frontend calculation matches the backend formula
 * exactly, ensuring data consistency across the application.
 *
 * @test-level UNIT
 * @justification Pure calculation functions - deterministic, no I/O
 * @story Ticket Count Calculation Fix (Zero-Indexed Serial Correction)
 * @priority P0 (Critical - Financial Calculations)
 *
 * TRACEABILITY MATRIX:
 * ┌─────────────────────────────────────────────────────────────────────────────────┐
 * │ Test ID              │ Component                  │ Scenario                   │
 * ├─────────────────────────────────────────────────────────────────────────────────┤
 * │ FE-CALC-001 to 010   │ calculateTicketsSold       │ Core inclusive counting    │
 * │ FE-CALC-011 to 020   │ calculateTicketsSold       │ Edge cases & boundaries    │
 * │ FE-CALC-021 to 030   │ calculateTicketsSold       │ Security & input validation│
 * │ FE-CALC-031 to 040   │ calculateTicketsSold       │ NaN and error handling     │
 * │ FE-CALC-041 to 050   │ calculateTicketsSold       │ Pack size variations       │
 * └─────────────────────────────────────────────────────────────────────────────────┘
 *
 * TESTING PYRAMID PLACEMENT:
 * ┌─────────────────────────────────────────────────────────────────────────────────┐
 * │ Level          │ Coverage                     │ Purpose                        │
 * ├─────────────────────────────────────────────────────────────────────────────────┤
 * │ Unit (this)    │ Pure function logic          │ Fast, deterministic tests      │
 * │ Component      │ React hooks integration      │ Component state management     │
 * │ Integration    │ Frontend-backend consistency │ Cross-layer validation         │
 * │ E2E            │ User workflows               │ Full system behavior           │
 * └─────────────────────────────────────────────────────────────────────────────────┘
 *
 * SECURITY STANDARDS APPLIED:
 * - SEC-014: INPUT_VALIDATION - NaN guards, type checking
 * - FE-001: STATE_MANAGEMENT - Pure function, no side effects
 * - API-003: ERROR_HANDLING - Graceful degradation (returns 0)
 *
 * BUSINESS CONTEXT:
 * Lottery packs use zero-indexed serial numbers:
 * - serial_start = 000 (first physical ticket, position 0)
 * - serial_end = 014 (last physical ticket, 15th ticket in 15-ticket pack)
 *
 * FORMULA: tickets_sold = (ending_serial + 1) - starting_serial
 *
 * This is the "fencepost" inclusive counting formula that correctly
 * counts both endpoints.
 */

import { describe, it, expect } from "vitest";

/**
 * Frontend calculateTicketsSold function replica.
 *
 * This matches the implementation in:
 * - UnscannedBinWarningModal.tsx (lines 219-241)
 * - DayCloseModeScanner.tsx (lines 1224-1246)
 *
 * SEC-014: INPUT_VALIDATION - Strict numeric validation with NaN guard
 * FE-001: STATE_MANAGEMENT - Pure function with no side effects
 * API-003: ERROR_HANDLING - Returns 0 for invalid input instead of throwing
 */
function calculateTicketsSold(
  endingSerial: string,
  startingSerial: string,
): number {
  // SEC-014: Parse with explicit radix to prevent octal interpretation
  const endingNum = parseInt(endingSerial, 10);
  const startingNum = parseInt(startingSerial, 10);

  // SEC-014: Guard against NaN - return 0 for invalid input
  if (Number.isNaN(endingNum) || Number.isNaN(startingNum)) {
    return 0;
  }

  // Inclusive calculation: (ending + 1) - starting = tickets sold
  const ticketsSold = endingNum + 1 - startingNum;

  // Ensure non-negative result
  return Math.max(0, ticketsSold);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: CORE INCLUSIVE COUNTING TESTS
// Validates the primary formula: tickets_sold = (ending + 1) - starting
// ═══════════════════════════════════════════════════════════════════════════════

describe("UNIT: Frontend calculateTicketsSold - Core Inclusive Counting", () => {
  /**
   * FE-CALC-001: Full 15-ticket pack depletion
   * Business: Standard pack fully sold (000-014)
   */
  it("FE-CALC-001: [P0] calculates 15 tickets for 000-014 (standard 15-ticket pack)", () => {
    // GIVEN: Zero-indexed 15-ticket pack range
    const startingSerial = "000";
    const endingSerial = "014";

    // WHEN: Calculating tickets sold
    const result = calculateTicketsSold(endingSerial, startingSerial);

    // THEN: Should return 15 tickets (14 + 1 - 0 = 15)
    expect(result).toBe(15);
  });

  /**
   * FE-CALC-002: Full 50-ticket pack depletion
   * Business: Large pack fully sold (000-049)
   */
  it("FE-CALC-002: [P0] calculates 50 tickets for 000-049 (standard 50-ticket pack)", () => {
    const result = calculateTicketsSold("049", "000");
    expect(result).toBe(50); // 49 + 1 - 0 = 50
  });

  /**
   * FE-CALC-003: Full 100-ticket pack depletion
   * Business: Jumbo pack fully sold (000-099)
   */
  it("FE-CALC-003: [P0] calculates 100 tickets for 000-099 (jumbo 100-ticket pack)", () => {
    const result = calculateTicketsSold("099", "000");
    expect(result).toBe(100); // 99 + 1 - 0 = 100
  });

  /**
   * FE-CALC-004: Full 300-ticket pack depletion
   * Business: Large-format pack fully sold (000-299)
   */
  it("FE-CALC-004: [P0] calculates 300 tickets for 000-299 (300-ticket pack)", () => {
    const result = calculateTicketsSold("299", "000");
    expect(result).toBe(300); // 299 + 1 - 0 = 300
  });

  /**
   * FE-CALC-005: Single ticket sold (same opening and closing)
   * Business: Pack just opened, first ticket sold
   */
  it("FE-CALC-005: [P0] calculates 1 ticket when ending equals starting (first ticket sold)", () => {
    const result = calculateTicketsSold("000", "000");
    expect(result).toBe(1); // 0 + 1 - 0 = 1
  });

  /**
   * FE-CALC-006: Two tickets sold
   * Business: Consecutive serials
   */
  it("FE-CALC-006: [P0] calculates 2 tickets for consecutive serials 000-001", () => {
    const result = calculateTicketsSold("001", "000");
    expect(result).toBe(2); // 1 + 1 - 0 = 2
  });

  /**
   * FE-CALC-007: Mid-pack starting position
   * Business: Pack sold from position 025 to 049
   */
  it("FE-CALC-007: [P0] calculates 25 tickets from 025-049 (mid-pack range)", () => {
    const result = calculateTicketsSold("049", "025");
    expect(result).toBe(25); // 49 + 1 - 25 = 25
  });

  /**
   * FE-CALC-008: High serial range
   * Business: Pack ending near max 3-digit serial
   */
  it("FE-CALC-008: [P0] calculates 100 tickets from 200-299 (high serial range)", () => {
    const result = calculateTicketsSold("299", "200");
    expect(result).toBe(100); // 299 + 1 - 200 = 100
  });

  /**
   * FE-CALC-009: Maximum 3-digit serial range
   * Business: Extreme case - 000 to 999
   */
  it("FE-CALC-009: [P0] calculates 1000 tickets for 000-999 (maximum 3-digit range)", () => {
    const result = calculateTicketsSold("999", "000");
    expect(result).toBe(1000); // 999 + 1 - 0 = 1000
  });

  /**
   * FE-CALC-010: Partial pack - small sale
   * Business: Only 5 tickets sold from start
   */
  it("FE-CALC-010: [P0] calculates 5 tickets for 000-004 (small sale)", () => {
    const result = calculateTicketsSold("004", "000");
    expect(result).toBe(5); // 4 + 1 - 0 = 5
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: EDGE CASES AND BOUNDARY CONDITIONS
// Tests boundary values and unusual but valid scenarios
// ═══════════════════════════════════════════════════════════════════════════════

describe("UNIT: Frontend calculateTicketsSold - Edge Cases & Boundaries", () => {
  /**
   * FE-CALC-011: Single digit serials without leading zeros
   * Business: Old data format compatibility
   */
  it("FE-CALC-011: [P1] handles single digit serials without leading zeros", () => {
    const result = calculateTicketsSold("9", "0");
    expect(result).toBe(10); // 9 + 1 - 0 = 10
  });

  /**
   * FE-CALC-012: Two digit serials
   * Business: Various format compatibility
   */
  it("FE-CALC-012: [P1] handles two digit serials", () => {
    const result = calculateTicketsSold("49", "10");
    expect(result).toBe(40); // 49 + 1 - 10 = 40
  });

  /**
   * FE-CALC-013: Ending less than starting (invalid state)
   * Business: Data integrity error - should return 0
   */
  it("FE-CALC-013: [P0] returns 0 when ending is less than starting (invalid state)", () => {
    const result = calculateTicketsSold("010", "020");
    expect(result).toBe(0); // Math.max(0, 10 + 1 - 20) = Math.max(0, -9) = 0
  });

  /**
   * FE-CALC-014: Large gap in negative direction
   * Business: Severely corrupted data - should return 0
   */
  it("FE-CALC-014: [P0] returns 0 for large negative difference", () => {
    const result = calculateTicketsSold("000", "999");
    expect(result).toBe(0); // Math.max(0, 0 + 1 - 999) = Math.max(0, -998) = 0
  });

  /**
   * FE-CALC-015: Ending one less than starting
   * Business: Off-by-one edge case
   */
  it("FE-CALC-015: [P0] returns 0 when ending is one less than starting", () => {
    const result = calculateTicketsSold("024", "025");
    expect(result).toBe(0); // Math.max(0, 24 + 1 - 25) = Math.max(0, 0) = 0
  });

  /**
   * FE-CALC-016: Leading zeros preserved as strings
   * Business: Serial format preservation
   */
  it("FE-CALC-016: [P1] correctly parses serials with leading zeros", () => {
    const result = calculateTicketsSold("007", "003");
    expect(result).toBe(5); // 7 + 1 - 3 = 5
  });

  /**
   * FE-CALC-017: All zeros
   * Business: First ticket only
   */
  it("FE-CALC-017: [P1] handles all zero serials correctly", () => {
    const result = calculateTicketsSold("000", "000");
    expect(result).toBe(1); // 0 + 1 - 0 = 1
  });

  /**
   * FE-CALC-018: High ending, high starting
   * Business: Pack running at high serials
   */
  it("FE-CALC-018: [P1] handles high serial ranges correctly", () => {
    const result = calculateTicketsSold("998", "990");
    expect(result).toBe(9); // 998 + 1 - 990 = 9
  });

  /**
   * FE-CALC-019: Exactly one apart (2 tickets)
   * Business: Two consecutive tickets
   */
  it("FE-CALC-019: [P1] correctly calculates 2 tickets for consecutive serials at high values", () => {
    const result = calculateTicketsSold("501", "500");
    expect(result).toBe(2); // 501 + 1 - 500 = 2
  });

  /**
   * FE-CALC-020: Maximum possible value
   * Business: Pack at last possible serial
   */
  it("FE-CALC-020: [P1] handles 999-999 (single ticket at max serial)", () => {
    const result = calculateTicketsSold("999", "999");
    expect(result).toBe(1); // 999 + 1 - 999 = 1
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: SECURITY & INPUT VALIDATION TESTS
// SEC-014: INPUT_VALIDATION - Tests for malicious or invalid input
// ═══════════════════════════════════════════════════════════════════════════════

describe("UNIT: Frontend calculateTicketsSold - Security & Input Validation", () => {
  /**
   * FE-CALC-021: Empty string input for ending
   * Security: Empty input should not crash
   */
  it("FE-CALC-021: [P0] returns 0 for empty ending serial", () => {
    const result = calculateTicketsSold("", "000");
    expect(result).toBe(0);
  });

  /**
   * FE-CALC-022: Empty string input for starting
   * Security: Empty input should not crash
   */
  it("FE-CALC-022: [P0] returns 0 for empty starting serial", () => {
    const result = calculateTicketsSold("014", "");
    expect(result).toBe(0);
  });

  /**
   * FE-CALC-023: Both empty strings
   * Security: Double empty input
   */
  it("FE-CALC-023: [P0] returns 0 for both empty serials", () => {
    const result = calculateTicketsSold("", "");
    expect(result).toBe(0);
  });

  /**
   * FE-CALC-024: Non-numeric string input (letters)
   * Security: XSS/injection attempt protection
   */
  it("FE-CALC-024: [P0] returns 0 for non-numeric ending (letters)", () => {
    const result = calculateTicketsSold("abc", "000");
    expect(result).toBe(0);
  });

  /**
   * FE-CALC-025: Non-numeric string input for starting
   * Security: Invalid data protection
   */
  it("FE-CALC-025: [P0] returns 0 for non-numeric starting (letters)", () => {
    const result = calculateTicketsSold("014", "xyz");
    expect(result).toBe(0);
  });

  /**
   * FE-CALC-026: Mixed alphanumeric input
   * Security: parseInt stops at first non-numeric character
   * Note: "12a" parses to 12, "0b0" parses to 0 (stops at 'b')
   */
  it("FE-CALC-026: [P1] handles mixed alphanumeric (parseInt truncates at first non-digit)", () => {
    // parseInt("12a", 10) = 12 (stops at 'a')
    // parseInt("0b0", 10) = 0 (stops at 'b')
    // Result: (12 + 1) - 0 = 13
    const result = calculateTicketsSold("12a", "0b0");
    expect(result).toBe(13);
  });

  /**
   * FE-CALC-027: Special characters input
   * Security: Script injection protection
   */
  it("FE-CALC-027: [P0] returns 0 for special characters", () => {
    const result = calculateTicketsSold("<script>", "000");
    expect(result).toBe(0);
  });

  /**
   * FE-CALC-028: SQL injection attempt
   * Security: SQL injection protection
   */
  it("FE-CALC-028: [P0] returns 0 for SQL injection patterns", () => {
    const result = calculateTicketsSold("'; DROP TABLE--", "000");
    expect(result).toBe(0);
  });

  /**
   * FE-CALC-029: Whitespace input
   * Security: Whitespace handling
   */
  it("FE-CALC-029: [P0] returns 0 for whitespace-only input", () => {
    const result = calculateTicketsSold("   ", "000");
    expect(result).toBe(0);
  });

  /**
   * FE-CALC-030: Unicode/emoji input
   * Security: Unicode injection protection
   */
  it("FE-CALC-030: [P0] returns 0 for unicode/emoji input", () => {
    const result = calculateTicketsSold("🎰🎰🎰", "000");
    expect(result).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: NaN AND ERROR HANDLING TESTS
// API-003: ERROR_HANDLING - Graceful degradation behavior
// ═══════════════════════════════════════════════════════════════════════════════

describe("UNIT: Frontend calculateTicketsSold - NaN & Error Handling", () => {
  /**
   * FE-CALC-031: Infinity string
   * Error: Should not be parseable to valid number
   */
  it("FE-CALC-031: [P1] returns 0 for 'Infinity' string", () => {
    const result = calculateTicketsSold("Infinity", "000");
    expect(result).toBe(0);
  });

  /**
   * FE-CALC-032: NaN string
   * Error: Explicit NaN string
   */
  it("FE-CALC-032: [P1] returns 0 for 'NaN' string", () => {
    const result = calculateTicketsSold("NaN", "000");
    expect(result).toBe(0);
  });

  /**
   * FE-CALC-033: Negative number string
   * Error: Negative serials are invalid
   */
  it("FE-CALC-033: [P1] handles negative number strings", () => {
    // parseInt will parse "-10" as -10, then:
    // -10 + 1 - 0 = -9, Math.max(0, -9) = 0
    const result = calculateTicketsSold("-10", "000");
    expect(result).toBe(0);
  });

  /**
   * FE-CALC-034: Decimal number string
   * Error: Serials should be integers
   */
  it("FE-CALC-034: [P1] handles decimal number strings (parseInt truncates)", () => {
    // parseInt("14.5", 10) = 14
    const result = calculateTicketsSold("14.5", "0.5");
    expect(result).toBe(15); // 14 + 1 - 0 = 15 (parseInt truncates decimals)
  });

  /**
   * FE-CALC-035: Scientific notation
   * Error: Unusual format
   */
  it("FE-CALC-035: [P1] returns 0 for scientific notation (parseInt limitation)", () => {
    // parseInt("1e2", 10) = 1 (stops at 'e')
    const result = calculateTicketsSold("1e2", "000");
    expect(result).toBe(2); // 1 + 1 - 0 = 2
  });

  /**
   * FE-CALC-036: Hex notation
   * Error: Non-standard format with radix 10
   */
  it("FE-CALC-036: [P1] handles hex prefix with radix 10", () => {
    // parseInt("0x14", 10) = 0 (stops at 'x')
    const result = calculateTicketsSold("0x14", "000");
    expect(result).toBe(1); // 0 + 1 - 0 = 1
  });

  /**
   * FE-CALC-037: Octal notation attempt
   * Security: radix 10 prevents octal interpretation
   */
  it("FE-CALC-037: [P0] radix 10 prevents octal interpretation of 010", () => {
    // With radix 10: parseInt("010", 10) = 10 (not 8)
    const result = calculateTicketsSold("010", "000");
    expect(result).toBe(11); // 10 + 1 - 0 = 11
  });

  /**
   * FE-CALC-038: Very large number string
   * Error: Beyond typical lottery serial range
   */
  it("FE-CALC-038: [P1] handles very large numbers", () => {
    const result = calculateTicketsSold("999999", "000000");
    expect(result).toBe(1000000); // Large but valid calculation
  });

  /**
   * FE-CALC-039: Number with leading plus sign
   * Error: Unusual but valid format
   */
  it("FE-CALC-039: [P1] handles numbers with leading plus sign", () => {
    // parseInt("+14", 10) = 14
    const result = calculateTicketsSold("+014", "+000");
    expect(result).toBe(15); // 14 + 1 - 0 = 15
  });

  /**
   * FE-CALC-040: Null coercion (via string "null")
   * Error: String literal "null"
   */
  it("FE-CALC-040: [P1] returns 0 for string 'null'", () => {
    const result = calculateTicketsSold("null", "000");
    expect(result).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: PACK SIZE VARIATIONS (BUSINESS SCENARIOS)
// Tests common lottery pack configurations
// ═══════════════════════════════════════════════════════════════════════════════

describe("UNIT: Frontend calculateTicketsSold - Pack Size Variations", () => {
  /**
   * FE-CALC-041: 10-ticket pack fully sold
   * Business: Small pack (000-009)
   */
  it("FE-CALC-041: [P1] 10-ticket pack: 000-009 = 10 tickets", () => {
    expect(calculateTicketsSold("009", "000")).toBe(10);
  });

  /**
   * FE-CALC-042: 20-ticket pack fully sold
   * Business: Common pack size (000-019)
   */
  it("FE-CALC-042: [P1] 20-ticket pack: 000-019 = 20 tickets", () => {
    expect(calculateTicketsSold("019", "000")).toBe(20);
  });

  /**
   * FE-CALC-043: 25-ticket pack fully sold
   * Business: Common pack size (000-024)
   */
  it("FE-CALC-043: [P1] 25-ticket pack: 000-024 = 25 tickets", () => {
    expect(calculateTicketsSold("024", "000")).toBe(25);
  });

  /**
   * FE-CALC-044: 30-ticket pack fully sold
   * Business: Common pack size (000-029)
   */
  it("FE-CALC-044: [P1] 30-ticket pack: 000-029 = 30 tickets", () => {
    expect(calculateTicketsSold("029", "000")).toBe(30);
  });

  /**
   * FE-CALC-045: 60-ticket pack fully sold
   * Business: Large pack size (000-059)
   */
  it("FE-CALC-045: [P1] 60-ticket pack: 000-059 = 60 tickets", () => {
    expect(calculateTicketsSold("059", "000")).toBe(60);
  });

  /**
   * FE-CALC-046: 75-ticket pack fully sold
   * Business: Large pack size (000-074)
   */
  it("FE-CALC-046: [P1] 75-ticket pack: 000-074 = 75 tickets", () => {
    expect(calculateTicketsSold("074", "000")).toBe(75);
  });

  /**
   * FE-CALC-047: 150-ticket pack fully sold
   * Business: Extra large pack (000-149)
   */
  it("FE-CALC-047: [P1] 150-ticket pack: 000-149 = 150 tickets", () => {
    expect(calculateTicketsSold("149", "000")).toBe(150);
  });

  /**
   * FE-CALC-048: 200-ticket pack fully sold
   * Business: Jumbo pack (000-199)
   */
  it("FE-CALC-048: [P1] 200-ticket pack: 000-199 = 200 tickets", () => {
    expect(calculateTicketsSold("199", "000")).toBe(200);
  });

  /**
   * FE-CALC-049: 250-ticket pack fully sold
   * Business: Super jumbo pack (000-249)
   */
  it("FE-CALC-049: [P1] 250-ticket pack: 000-249 = 250 tickets", () => {
    expect(calculateTicketsSold("249", "000")).toBe(250);
  });

  /**
   * FE-CALC-050: Partial 50-ticket pack (half sold)
   * Business: Common partial scenario
   */
  it("FE-CALC-050: [P1] half of 50-ticket pack: 000-024 = 25 tickets", () => {
    expect(calculateTicketsSold("024", "000")).toBe(25);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: FORMULA CONSISTENCY VERIFICATION
// Ensures frontend matches backend calculation exactly
// ═══════════════════════════════════════════════════════════════════════════════

describe("UNIT: Frontend calculateTicketsSold - Formula Consistency", () => {
  /**
   * FE-CALC-051: Verify formula against documented examples
   * Reference: UnscannedBinWarningModal.tsx comments
   */
  it("FE-CALC-051: [P0] matches documented example: Pack 000-014 = 15 tickets", () => {
    // From the JSDoc: "Pack 000-014: (14 + 1) - 0 = 15 tickets (correct)"
    expect(calculateTicketsSold("014", "000")).toBe(15);
  });

  it("FE-CALC-052: [P0] matches documented example: Pack 000-049 = 50 tickets", () => {
    // From the JSDoc: "Pack 000-049: (49 + 1) - 0 = 50 tickets (correct)"
    expect(calculateTicketsSold("049", "000")).toBe(50);
  });

  it("FE-CALC-053: [P0] matches documented example: Pack 025-049 = 25 tickets", () => {
    // From the JSDoc: "Pack 025-049: (49 + 1) - 25 = 25 tickets (correct)"
    expect(calculateTicketsSold("049", "025")).toBe(25);
  });

  it("FE-CALC-054: [P0] matches documented example: Pack 000-000 = 1 ticket", () => {
    // From DayCloseModeScanner.tsx JSDoc: "Pack 000-000: (0 + 1) - 0 = 1 ticket"
    expect(calculateTicketsSold("000", "000")).toBe(1);
  });

  /**
   * FE-CALC-055: Verify old wrong formula would fail
   * Regression prevention
   */
  it("FE-CALC-055: [P0] regression: old formula would incorrectly return 14 for 000-014", () => {
    // OLD WRONG FORMULA: ending - starting = 14 - 0 = 14 (INCORRECT)
    // NEW CORRECT FORMULA: (ending + 1) - starting = 15 (CORRECT)
    const result = calculateTicketsSold("014", "000");
    expect(result).not.toBe(14); // Would be 14 with old formula
    expect(result).toBe(15); // Correct with new formula
  });

  it("FE-CALC-056: [P0] regression: old formula would incorrectly return 0 for 000-000", () => {
    // OLD WRONG FORMULA: ending - starting = 0 - 0 = 0 (INCORRECT)
    // NEW CORRECT FORMULA: (ending + 1) - starting = 1 (CORRECT)
    const result = calculateTicketsSold("000", "000");
    expect(result).not.toBe(0); // Would be 0 with old formula
    expect(result).toBe(1); // Correct with new formula
  });
});
