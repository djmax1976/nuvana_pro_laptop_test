/**
 * Unit Tests: Day Close Sold-Out Pack Calculation
 *
 * Tests the ticket calculation functions for sold-out (depleted) packs.
 * This is critical business logic where two different formulas are required:
 *
 * 1. Normal scan: tickets_sold = ending - starting
 * 2. Sold out (depletion): tickets_sold = (serial_end + 1) - starting
 *
 * @test-level UNIT
 * @justification Tests pure calculation logic - fast, isolated, deterministic
 * @story Lottery Day Close - Sold Out Pack Calculation Fix
 * @priority P0 (Critical - Financial Calculations)
 *
 * TRACEABILITY MATRIX:
 * ┌─────────────────────────────────────────────────────────────────────────────────┐
 * │ Test ID              │ Requirement                     │ MCP Rule   │ Priority │
 * ├─────────────────────────────────────────────────────────────────────────────────┤
 * │ SOLD-OUT-001         │ Normal formula: end - start     │ SEC-014    │ P0       │
 * │ SOLD-OUT-002         │ Depletion formula: end+1-start  │ SEC-014    │ P0       │
 * │ SOLD-OUT-003         │ Full pack depletion (30 tickets)│ SEC-014    │ P0       │
 * │ SOLD-OUT-004         │ Partial pack depletion          │ SEC-014    │ P0       │
 * │ SOLD-OUT-005         │ Edge: starting=0                │ SEC-014    │ P0       │
 * │ SOLD-OUT-006         │ Edge: single ticket remaining   │ SEC-014    │ P1       │
 * │ SOLD-OUT-007         │ Invalid input: NaN handling     │ SEC-014    │ P0       │
 * │ SOLD-OUT-008         │ Invalid input: negative serial  │ SEC-014    │ P0       │
 * │ SOLD-OUT-009         │ Invalid input: exceeds max      │ SEC-014    │ P1       │
 * │ SOLD-OUT-010         │ Sales amount calculation        │ SEC-014    │ P0       │
 * └─────────────────────────────────────────────────────────────────────────────────┘
 *
 * TESTING PYRAMID PLACEMENT:
 * ┌───────────────────────────────────────────────────────────────────────────────┐
 * │ Level        │ This File                  │ Related Files                     │
 * ├───────────────────────────────────────────────────────────────────────────────┤
 * │ Unit (here)  │ Calculation logic          │ lottery-day-close.service.ts      │
 * │ Component    │ UI sold-out selection      │ DayCloseModeScanner.test.tsx      │
 * │ API          │ is_sold_out flow           │ lottery-day-close-sold-out.api.ts │
 * │ E2E          │ Full day close workflow    │ lottery-management-flow.spec.ts   │
 * └───────────────────────────────────────────────────────────────────────────────┘
 *
 * SECURITY STANDARDS TESTED:
 * - SEC-014: INPUT_VALIDATION - Strict numeric validation with bounds checking
 * - API-003: ERROR_HANDLING - Returns 0 for invalid input (fail-safe)
 */

import { describe, it, expect } from "vitest";

// ============================================================================
// PURE CALCULATION FUNCTIONS (Mirroring backend logic for unit testing)
// These mirror the functions in lottery-day-close.service.ts
// ============================================================================

/**
 * Calculate tickets sold for NORMAL scans (not sold-out)
 * Formula: tickets_sold = ending - starting
 *
 * @param endingSerial - The ending serial position (3 digits)
 * @param startingSerial - The starting serial position (3 digits)
 * @returns Number of tickets sold (never negative)
 */
function calculateTicketsSold(
  endingSerial: string,
  startingSerial: string,
): number {
  if (typeof endingSerial !== "string" || typeof startingSerial !== "string") {
    return 0;
  }

  const endingNum = parseInt(endingSerial, 10);
  const startingNum = parseInt(startingSerial, 10);

  if (Number.isNaN(endingNum) || Number.isNaN(startingNum)) {
    return 0;
  }

  const MAX_SERIAL = 999;
  if (
    endingNum < 0 ||
    endingNum > MAX_SERIAL ||
    startingNum < 0 ||
    startingNum > MAX_SERIAL
  ) {
    return 0;
  }

  const ticketsSold = endingNum - startingNum;
  return Math.max(0, ticketsSold);
}

/**
 * Calculate tickets sold for DEPLETED packs (sold-out)
 * Formula: tickets_sold = (serial_end + 1) - starting
 *
 * The +1 is required because serial_end is the LAST ticket INDEX,
 * not the next position. For a 30-ticket pack, serial_end=029.
 *
 * @param serialEnd - The pack's last ticket INDEX (3 digits, e.g., "029")
 * @param startingSerial - The starting serial position (3 digits)
 * @returns Number of tickets sold (never negative)
 */
function calculateTicketsSoldForDepletion(
  serialEnd: string,
  startingSerial: string,
): number {
  if (typeof serialEnd !== "string" || typeof startingSerial !== "string") {
    return 0;
  }

  const serialEndNum = parseInt(serialEnd, 10);
  const startingNum = parseInt(startingSerial, 10);

  if (Number.isNaN(serialEndNum) || Number.isNaN(startingNum)) {
    return 0;
  }

  const MAX_SERIAL = 999;
  if (
    serialEndNum < 0 ||
    serialEndNum > MAX_SERIAL ||
    startingNum < 0 ||
    startingNum > MAX_SERIAL
  ) {
    return 0;
  }

  // Depletion formula: (serial_end + 1) - starting
  const ticketsSold = serialEndNum + 1 - startingNum;
  return Math.max(0, ticketsSold);
}

// ============================================================================
// NORMAL FORMULA TESTS (ending - starting)
// ============================================================================

describe("Day Close Sold-Out Calculation - Normal Formula", () => {
  describe("calculateTicketsSold (Normal Scan)", () => {
    it("SOLD-OUT-001: [P0] should calculate zero tickets when opening equals closing", () => {
      // GIVEN: Starting at 0, ending at 0 (no tickets sold)
      // WHEN: Calculating tickets sold
      const result = calculateTicketsSold("000", "000");

      // THEN: Should be 0 tickets (not 1)
      expect(result).toBe(0);
    });

    it("SOLD-OUT-001a: [P0] should calculate correct tickets for normal scan", () => {
      // GIVEN: Started at 0, scanned at position 15
      // WHEN: Calculating tickets sold
      const result = calculateTicketsSold("015", "000");

      // THEN: Should be 15 tickets sold (tickets 0-14)
      expect(result).toBe(15);
    });

    it("SOLD-OUT-001b: [P0] should calculate correct tickets mid-pack", () => {
      // GIVEN: Started at 10, scanned at position 25
      // WHEN: Calculating tickets sold
      const result = calculateTicketsSold("025", "010");

      // THEN: Should be 15 tickets sold (tickets 10-24)
      expect(result).toBe(15);
    });
  });
});

// ============================================================================
// DEPLETION FORMULA TESTS ((serial_end + 1) - starting)
// ============================================================================

describe("Day Close Sold-Out Calculation - Depletion Formula", () => {
  describe("calculateTicketsSoldForDepletion (Sold Out Pack)", () => {
    it("SOLD-OUT-002: [P0] should use +1 formula for sold-out pack", () => {
      // GIVEN: 30-ticket pack (serial_end=029), started at 0, marked sold out
      // WHEN: Calculating tickets sold using depletion formula
      const result = calculateTicketsSoldForDepletion("029", "000");

      // THEN: Should be 30 tickets (029 + 1 - 0 = 30)
      expect(result).toBe(30);
    });

    it("SOLD-OUT-003: [P0] should calculate full pack depletion correctly", () => {
      // GIVEN: $10 pack with 30 tickets, starting at 0
      const serialEnd = "029"; // Last ticket index (0-29 = 30 tickets)
      const startingSerial = "000";
      const gamePrice = 10;

      // WHEN: Calculating tickets and sales
      const ticketsSold = calculateTicketsSoldForDepletion(
        serialEnd,
        startingSerial,
      );
      const salesAmount = ticketsSold * gamePrice;

      // THEN: Should be 30 tickets = $300
      expect(ticketsSold).toBe(30);
      expect(salesAmount).toBe(300);
    });

    it("SOLD-OUT-004: [P0] should calculate partial pack depletion correctly", () => {
      // GIVEN: Pack started at position 10, sold out (serial_end=029)
      const serialEnd = "029";
      const startingSerial = "010";

      // WHEN: Calculating tickets sold
      const result = calculateTicketsSoldForDepletion(
        serialEnd,
        startingSerial,
      );

      // THEN: Should be 20 tickets (029 + 1 - 10 = 20)
      expect(result).toBe(20);
    });

    it("SOLD-OUT-005: [P0] should handle starting at zero correctly", () => {
      // GIVEN: Fresh pack with 15 tickets (serial_end=014), starting at 0
      const result = calculateTicketsSoldForDepletion("014", "000");

      // THEN: Should be 15 tickets (014 + 1 - 0 = 15)
      expect(result).toBe(15);
    });

    it("SOLD-OUT-006: [P1] should handle single ticket remaining", () => {
      // GIVEN: Pack at position 29, only ticket 29 left (serial_end=029)
      const result = calculateTicketsSoldForDepletion("029", "029");

      // THEN: Should be 1 ticket (029 + 1 - 29 = 1)
      expect(result).toBe(1);
    });
  });
});

// ============================================================================
// FORMULA COMPARISON TESTS (Demonstrates the difference)
// ============================================================================

describe("Day Close Sold-Out Calculation - Formula Comparison", () => {
  it("SOLD-OUT-COMPARE-001: [P0] should show difference between formulas for full pack", () => {
    // GIVEN: 30-ticket pack (serial_end=029), starting at 0
    const serialEnd = "029";
    const startingSerial = "000";

    // WHEN: Using both formulas
    const normalResult = calculateTicketsSold(serialEnd, startingSerial);
    const depletionResult = calculateTicketsSoldForDepletion(
      serialEnd,
      startingSerial,
    );

    // THEN: Depletion should be 1 more (the +1 adjustment)
    expect(normalResult).toBe(29); // Wrong for sold-out: 029 - 000 = 29
    expect(depletionResult).toBe(30); // Correct: (029 + 1) - 000 = 30
    expect(depletionResult - normalResult).toBe(1);
  });

  it("SOLD-OUT-COMPARE-002: [P0] should show $10 difference for $10 game", () => {
    // GIVEN: $10 game, 30-ticket pack, sold out from start
    const gamePrice = 10;
    const serialEnd = "029";
    const startingSerial = "000";

    // WHEN: Calculating sales with both formulas
    const normalSales =
      calculateTicketsSold(serialEnd, startingSerial) * gamePrice;
    const depletionSales =
      calculateTicketsSoldForDepletion(serialEnd, startingSerial) * gamePrice;

    // THEN: Depletion should be $10 more
    expect(normalSales).toBe(290); // Wrong: 29 * $10 = $290
    expect(depletionSales).toBe(300); // Correct: 30 * $10 = $300
    expect(depletionSales - normalSales).toBe(10);
  });
});

// ============================================================================
// INPUT VALIDATION TESTS (SEC-014)
// ============================================================================

describe("Day Close Sold-Out Calculation - Input Validation (SEC-014)", () => {
  describe("NaN Handling", () => {
    it("SOLD-OUT-007: [P0] should return 0 for non-numeric ending serial", () => {
      expect(calculateTicketsSold("abc", "000")).toBe(0);
      expect(calculateTicketsSoldForDepletion("abc", "000")).toBe(0);
    });

    it("SOLD-OUT-007a: [P0] should return 0 for non-numeric starting serial", () => {
      expect(calculateTicketsSold("029", "xyz")).toBe(0);
      expect(calculateTicketsSoldForDepletion("029", "xyz")).toBe(0);
    });

    it("SOLD-OUT-007b: [P0] should return 0 for empty strings", () => {
      expect(calculateTicketsSold("", "000")).toBe(0);
      expect(calculateTicketsSold("029", "")).toBe(0);
      expect(calculateTicketsSoldForDepletion("", "000")).toBe(0);
      expect(calculateTicketsSoldForDepletion("029", "")).toBe(0);
    });
  });

  describe("Bounds Checking", () => {
    it("SOLD-OUT-008: [P0] should return 0 for negative serial values", () => {
      // Note: parseInt("-01", 10) = -1, which should be rejected
      expect(calculateTicketsSold("-01", "000")).toBe(0);
      expect(calculateTicketsSoldForDepletion("-01", "000")).toBe(0);
    });

    it("SOLD-OUT-009: [P1] should return 0 for serial exceeding max (999)", () => {
      expect(calculateTicketsSold("1000", "000")).toBe(0);
      expect(calculateTicketsSoldForDepletion("1000", "000")).toBe(0);
    });

    it("SOLD-OUT-009a: [P1] should accept max valid serial (999)", () => {
      expect(calculateTicketsSold("999", "000")).toBe(999);
      expect(calculateTicketsSoldForDepletion("999", "000")).toBe(1000);
    });
  });

  describe("Type Validation", () => {
    it("SOLD-OUT-TYPE-001: [P0] should return 0 for non-string input", () => {
      // TypeScript would catch this, but runtime validation is defense-in-depth
      expect(calculateTicketsSold(29 as unknown as string, "000")).toBe(0);
      expect(
        calculateTicketsSoldForDepletion(29 as unknown as string, "000"),
      ).toBe(0);
    });

    it("SOLD-OUT-TYPE-002: [P0] should return 0 for null input", () => {
      expect(calculateTicketsSold(null as unknown as string, "000")).toBe(0);
      expect(
        calculateTicketsSoldForDepletion(null as unknown as string, "000"),
      ).toBe(0);
    });

    it("SOLD-OUT-TYPE-003: [P0] should return 0 for undefined input", () => {
      expect(calculateTicketsSold(undefined as unknown as string, "000")).toBe(
        0,
      );
      expect(
        calculateTicketsSoldForDepletion(undefined as unknown as string, "000"),
      ).toBe(0);
    });
  });
});

// ============================================================================
// SALES AMOUNT CALCULATION TESTS
// ============================================================================

describe("Day Close Sold-Out Calculation - Sales Amount", () => {
  it("SOLD-OUT-010: [P0] should calculate correct sales for $5 game sold out", () => {
    // GIVEN: $5 game, 50-ticket pack (serial_end=049), started at 0
    const gamePrice = 5;
    const serialEnd = "049";
    const startingSerial = "000";

    // WHEN: Calculating with depletion formula
    const ticketsSold = calculateTicketsSoldForDepletion(
      serialEnd,
      startingSerial,
    );
    const salesAmount = ticketsSold * gamePrice;

    // THEN: Should be 50 tickets = $250
    expect(ticketsSold).toBe(50);
    expect(salesAmount).toBe(250);
  });

  it("SOLD-OUT-010a: [P0] should calculate correct sales for $20 game sold out", () => {
    // GIVEN: $20 game, 15-ticket pack (serial_end=014), started at position 5
    const gamePrice = 20;
    const serialEnd = "014";
    const startingSerial = "005";

    // WHEN: Calculating with depletion formula
    const ticketsSold = calculateTicketsSoldForDepletion(
      serialEnd,
      startingSerial,
    );
    const salesAmount = ticketsSold * gamePrice;

    // THEN: Should be 10 tickets = $200
    expect(ticketsSold).toBe(10);
    expect(salesAmount).toBe(200);
  });

  it("SOLD-OUT-010b: [P0] should calculate correct sales for $1 game sold out", () => {
    // GIVEN: $1 game, 100-ticket pack (serial_end=099), started at 0
    const gamePrice = 1;
    const serialEnd = "099";
    const startingSerial = "000";

    // WHEN: Calculating with depletion formula
    const ticketsSold = calculateTicketsSoldForDepletion(
      serialEnd,
      startingSerial,
    );
    const salesAmount = ticketsSold * gamePrice;

    // THEN: Should be 100 tickets = $100
    expect(ticketsSold).toBe(100);
    expect(salesAmount).toBe(100);
  });
});

// ============================================================================
// REAL-WORLD SCENARIO TESTS
// ============================================================================

describe("Day Close Sold-Out Calculation - Real-World Scenarios", () => {
  it("SCENARIO-001: [P0] Day close with mixed scanned and sold-out packs", () => {
    // GIVEN: 3 bins with different states
    const bins = [
      {
        name: "Lucky 7s",
        gamePrice: 5,
        startingSerial: "000",
        closingSerial: "015", // Normal scan at position 15
        isSoldOut: false,
        serialEnd: "049",
      },
      {
        name: "Cash Bonanza",
        gamePrice: 10,
        startingSerial: "000",
        closingSerial: "029", // Marked sold out (serial_end=029)
        isSoldOut: true,
        serialEnd: "029",
      },
      {
        name: "Money Bags",
        gamePrice: 20,
        startingSerial: "010",
        closingSerial: "025", // Normal scan at position 25
        isSoldOut: false,
        serialEnd: "099",
      },
    ];

    // WHEN: Calculating total lottery sales
    let totalSales = 0;
    for (const bin of bins) {
      const ticketsSold = bin.isSoldOut
        ? calculateTicketsSoldForDepletion(
            bin.closingSerial,
            bin.startingSerial,
          )
        : calculateTicketsSold(bin.closingSerial, bin.startingSerial);
      totalSales += ticketsSold * bin.gamePrice;
    }

    // THEN: Total should be correct
    // Bin 1: 15 * $5 = $75 (normal: 015 - 000 = 15)
    // Bin 2: 30 * $10 = $300 (depletion: 029 + 1 - 000 = 30)
    // Bin 3: 15 * $20 = $300 (normal: 025 - 010 = 15)
    // Total: $675
    expect(totalSales).toBe(675);
  });

  it("SCENARIO-002: [P0] Multiple sold-out packs in single day close", () => {
    // GIVEN: All packs marked as sold out
    const soldOutPacks = [
      { gamePrice: 5, startingSerial: "000", serialEnd: "049" }, // 50 tickets
      { gamePrice: 10, startingSerial: "000", serialEnd: "029" }, // 30 tickets
      { gamePrice: 20, startingSerial: "000", serialEnd: "014" }, // 15 tickets
    ];

    // WHEN: Calculating total sales
    let totalSales = 0;
    for (const pack of soldOutPacks) {
      const ticketsSold = calculateTicketsSoldForDepletion(
        pack.serialEnd,
        pack.startingSerial,
      );
      totalSales += ticketsSold * pack.gamePrice;
    }

    // THEN: Total should be correct
    // Pack 1: 50 * $5 = $250
    // Pack 2: 30 * $10 = $300
    // Pack 3: 15 * $20 = $300
    // Total: $850
    expect(totalSales).toBe(850);
  });
});
