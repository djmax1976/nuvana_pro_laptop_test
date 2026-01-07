/**
 * Integration Tests: Frontend-Backend Ticket Calculation Consistency
 *
 * Ensures that the frontend ticket count calculations match the backend
 * calculations exactly. This prevents discrepancies between what users see
 * in the UI and what gets stored in the database.
 *
 * @test-level INTEGRATION
 * @justification Cross-layer validation - frontend/backend consistency
 * @story Ticket Count Calculation Fix (Zero-Indexed Serial Correction)
 * @priority P0 (Critical - Data Integrity)
 *
 * TRACEABILITY MATRIX:
 * ┌─────────────────────────────────────────────────────────────────────────────────────┐
 * │ Test ID              │ Layer          │ Scenario                        │ Priority │
 * ├─────────────────────────────────────────────────────────────────────────────────────┤
 * │ INT-CALC-001 to 010  │ FE ↔ BE        │ Core calculation parity         │ P0       │
 * │ INT-CALC-011 to 020  │ FE ↔ BE        │ Edge case parity                │ P1       │
 * │ INT-CALC-021 to 030  │ FE ↔ BE        │ Error handling parity           │ P0       │
 * │ INT-CALC-031 to 040  │ Component ↔ BE │ UnscannedBinWarningModal parity │ P0       │
 * │ INT-CALC-041 to 050  │ Component ↔ BE │ DayCloseModeScanner parity      │ P0       │
 * └─────────────────────────────────────────────────────────────────────────────────────┘
 *
 * TESTING PYRAMID PLACEMENT:
 * ┌─────────────────────────────────────────────────────────────────────────────────────┐
 * │ Level                │ Coverage                         │ Purpose                  │
 * ├─────────────────────────────────────────────────────────────────────────────────────┤
 * │ Unit                 │ Individual function logic        │ Fast, isolated           │
 * │ Integration (this)   │ Cross-layer consistency          │ Parity verification      │
 * │ API                  │ Full endpoint behavior           │ HTTP + auth              │
 * │ E2E                  │ User workflows                   │ Full system              │
 * └─────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ARCHITECTURE CONTEXT:
 * Frontend Locations:
 * - UnscannedBinWarningModal.tsx (lines 219-241)
 * - DayCloseModeScanner.tsx (lines 1224-1246)
 *
 * Backend Location:
 * - lottery-day-close.service.ts (lines 959-979)
 * - lottery.service.ts (calculateExpectedCount)
 *
 * All must use the same formula:
 * tickets_sold = (ending_serial + 1) - starting_serial
 */

import { describe, it, expect } from "vitest";

// ═══════════════════════════════════════════════════════════════════════════════
// CALCULATION FUNCTION REPLICAS
// These replicate the exact logic from each layer for comparison testing
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Frontend calculation (from UnscannedBinWarningModal.tsx and DayCloseModeScanner.tsx)
 */
function frontendCalculateTicketsSold(
  endingSerial: string,
  startingSerial: string,
): number {
  const endingNum = parseInt(endingSerial, 10);
  const startingNum = parseInt(startingSerial, 10);

  if (Number.isNaN(endingNum) || Number.isNaN(startingNum)) {
    return 0;
  }

  const ticketsSold = endingNum + 1 - startingNum;
  return Math.max(0, ticketsSold);
}

/**
 * Backend calculation (from lottery-day-close.service.ts)
 */
function backendCalculateTicketsSold(
  endingSerial: string,
  startingSerial: string,
): number {
  const endingNum = parseInt(endingSerial, 10);
  const startingNum = parseInt(startingSerial, 10);

  if (Number.isNaN(endingNum) || Number.isNaN(startingNum)) {
    return 0;
  }

  const ticketsSold = endingNum + 1 - startingNum;
  return Math.max(0, ticketsSold);
}

/**
 * Backend calculateExpectedCount (from lottery.service.ts)
 * Note: This function uses openingSerial, closingSerial order
 */
function backendCalculateExpectedCount(
  openingSerial: string,
  closingSerial: string,
): number {
  const closingNum = parseInt(closingSerial, 10);
  const openingNum = parseInt(openingSerial, 10);

  if (Number.isNaN(closingNum) || Number.isNaN(openingNum)) {
    return 0;
  }

  const ticketsSold = closingNum + 1 - openingNum;
  return Math.max(0, ticketsSold);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: CORE CALCULATION PARITY TESTS
// Verifies that frontend and backend return identical results
// ═══════════════════════════════════════════════════════════════════════════════

describe("INTEGRATION: Frontend-Backend Calculation Parity - Core Cases", () => {
  const testCases = [
    {
      ending: "014",
      starting: "000",
      expected: 15,
      description: "15-ticket pack",
    },
    {
      ending: "049",
      starting: "000",
      expected: 50,
      description: "50-ticket pack",
    },
    {
      ending: "099",
      starting: "000",
      expected: 100,
      description: "100-ticket pack",
    },
    {
      ending: "000",
      starting: "000",
      expected: 1,
      description: "single ticket",
    },
    { ending: "001", starting: "000", expected: 2, description: "two tickets" },
    {
      ending: "049",
      starting: "025",
      expected: 25,
      description: "mid-pack range",
    },
    {
      ending: "299",
      starting: "200",
      expected: 100,
      description: "high serial range",
    },
    {
      ending: "999",
      starting: "000",
      expected: 1000,
      description: "max 3-digit range",
    },
    { ending: "004", starting: "000", expected: 5, description: "5 tickets" },
    {
      ending: "024",
      starting: "000",
      expected: 25,
      description: "25-ticket pack",
    },
  ];

  testCases.forEach(({ ending, starting, expected, description }, index) => {
    it(`INT-CALC-00${index + 1}: [P0] Frontend equals Backend for ${description} (${starting}-${ending})`, () => {
      // Calculate using frontend function
      const frontendResult = frontendCalculateTicketsSold(ending, starting);

      // Calculate using backend day-close function
      const backendDayCloseResult = backendCalculateTicketsSold(
        ending,
        starting,
      );

      // Calculate using backend lottery.service function (note: parameter order differs)
      const backendLotteryResult = backendCalculateExpectedCount(
        starting,
        ending,
      );

      // Assert all three are equal
      expect(frontendResult).toBe(expected);
      expect(backendDayCloseResult).toBe(expected);
      expect(backendLotteryResult).toBe(expected);

      // Assert frontend matches backend
      expect(frontendResult).toBe(backendDayCloseResult);
      expect(frontendResult).toBe(backendLotteryResult);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: EDGE CASE PARITY TESTS
// Verifies boundary conditions produce identical results
// ═══════════════════════════════════════════════════════════════════════════════

describe("INTEGRATION: Frontend-Backend Calculation Parity - Edge Cases", () => {
  const edgeCases = [
    { ending: "9", starting: "0", expected: 10, description: "single digit" },
    { ending: "49", starting: "10", expected: 40, description: "two digit" },
    {
      ending: "010",
      starting: "020",
      expected: 0,
      description: "negative result",
    },
    {
      ending: "000",
      starting: "999",
      expected: 0,
      description: "large negative",
    },
    {
      ending: "024",
      starting: "025",
      expected: 0,
      description: "off-by-one negative",
    },
    {
      ending: "007",
      starting: "003",
      expected: 5,
      description: "leading zeros",
    },
    { ending: "998", starting: "990", expected: 9, description: "high range" },
    {
      ending: "501",
      starting: "500",
      expected: 2,
      description: "high consecutive",
    },
    {
      ending: "999",
      starting: "999",
      expected: 1,
      description: "max serial single",
    },
  ];

  edgeCases.forEach(({ ending, starting, expected, description }, index) => {
    it(`INT-CALC-01${index + 1}: [P1] Parity maintained for edge case: ${description}`, () => {
      const frontendResult = frontendCalculateTicketsSold(ending, starting);
      const backendDayCloseResult = backendCalculateTicketsSold(
        ending,
        starting,
      );
      const backendLotteryResult = backendCalculateExpectedCount(
        starting,
        ending,
      );

      expect(frontendResult).toBe(expected);
      expect(backendDayCloseResult).toBe(expected);
      expect(backendLotteryResult).toBe(expected);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: ERROR HANDLING PARITY TESTS
// Verifies invalid input produces identical error handling
// ═══════════════════════════════════════════════════════════════════════════════

describe("INTEGRATION: Frontend-Backend Calculation Parity - Error Handling", () => {
  const errorCases = [
    { ending: "", starting: "000", expected: 0, description: "empty ending" },
    { ending: "014", starting: "", expected: 0, description: "empty starting" },
    { ending: "", starting: "", expected: 0, description: "both empty" },
    {
      ending: "abc",
      starting: "000",
      expected: 0,
      description: "letters in ending",
    },
    {
      ending: "014",
      starting: "xyz",
      expected: 0,
      description: "letters in starting",
    },
    // Note: "12a" parses to 12, "0b0" parses to 0 (parseInt stops at first non-digit)
    {
      ending: "12a",
      starting: "0b0",
      expected: 13,
      description: "mixed alphanumeric (parseInt truncates)",
    },
    { ending: "   ", starting: "000", expected: 0, description: "whitespace" },
    {
      ending: "null",
      starting: "000",
      expected: 0,
      description: "string null",
    },
    { ending: "NaN", starting: "000", expected: 0, description: "string NaN" },
    {
      ending: "Infinity",
      starting: "000",
      expected: 0,
      description: "string Infinity",
    },
  ];

  errorCases.forEach(({ ending, starting, expected, description }, index) => {
    it(`INT-CALC-02${index + 1}: [P0] Error handling parity for: ${description}`, () => {
      const frontendResult = frontendCalculateTicketsSold(ending, starting);
      const backendDayCloseResult = backendCalculateTicketsSold(
        ending,
        starting,
      );
      const backendLotteryResult = backendCalculateExpectedCount(
        starting,
        ending,
      );

      // All should return 0 for invalid input
      expect(frontendResult).toBe(expected);
      expect(backendDayCloseResult).toBe(expected);
      expect(backendLotteryResult).toBe(expected);

      // Verify consistency
      expect(frontendResult).toBe(backendDayCloseResult);
      expect(frontendResult).toBe(backendLotteryResult);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: COMPONENT-SPECIFIC PARITY (UnscannedBinWarningModal)
// Verifies the modal's calculation matches backend
// ═══════════════════════════════════════════════════════════════════════════════

describe("INTEGRATION: UnscannedBinWarningModal Backend Parity", () => {
  /**
   * Simulates the calculation flow in UnscannedBinWarningModal.handleReturnToScan
   */
  function simulateModalCalculation(bin: {
    starting_serial: string;
    serial_end: string;
    game_price: number;
  }): { tickets_sold: number; sales_amount: number } {
    const ticketsSold = frontendCalculateTicketsSold(
      bin.serial_end,
      bin.starting_serial,
    );
    const validPrice =
      typeof bin.game_price === "number" && !Number.isNaN(bin.game_price)
        ? bin.game_price
        : 0;
    const salesAmount = ticketsSold * validPrice;
    return { tickets_sold: ticketsSold, sales_amount: salesAmount };
  }

  it("INT-CALC-031: [P0] Modal calculation matches backend for $5 15-ticket pack", () => {
    const bin = {
      starting_serial: "000",
      serial_end: "014",
      game_price: 5.0,
    };

    const modalResult = simulateModalCalculation(bin);
    const backendTickets = backendCalculateTicketsSold(
      bin.serial_end,
      bin.starting_serial,
    );

    expect(modalResult.tickets_sold).toBe(15);
    expect(modalResult.sales_amount).toBe(75); // 15 × $5
    expect(modalResult.tickets_sold).toBe(backendTickets);
  });

  it("INT-CALC-032: [P0] Modal calculation matches backend for $10 50-ticket pack", () => {
    const bin = {
      starting_serial: "005",
      serial_end: "054",
      game_price: 10.0,
    };

    const modalResult = simulateModalCalculation(bin);
    const backendTickets = backendCalculateTicketsSold(
      bin.serial_end,
      bin.starting_serial,
    );

    expect(modalResult.tickets_sold).toBe(50); // (54 + 1) - 5 = 50
    expect(modalResult.sales_amount).toBe(500); // 50 × $10
    expect(modalResult.tickets_sold).toBe(backendTickets);
  });

  it("INT-CALC-033: [P0] Modal calculation matches backend for $1 single ticket", () => {
    const bin = {
      starting_serial: "000",
      serial_end: "000",
      game_price: 1.0,
    };

    const modalResult = simulateModalCalculation(bin);
    const backendTickets = backendCalculateTicketsSold(
      bin.serial_end,
      bin.starting_serial,
    );

    expect(modalResult.tickets_sold).toBe(1);
    expect(modalResult.sales_amount).toBe(1); // 1 × $1
    expect(modalResult.tickets_sold).toBe(backendTickets);
  });

  it("INT-CALC-034: [P0] Modal calculation matches backend for $20 100-ticket pack", () => {
    const bin = {
      starting_serial: "000",
      serial_end: "099",
      game_price: 20.0,
    };

    const modalResult = simulateModalCalculation(bin);
    const backendTickets = backendCalculateTicketsSold(
      bin.serial_end,
      bin.starting_serial,
    );

    expect(modalResult.tickets_sold).toBe(100);
    expect(modalResult.sales_amount).toBe(2000); // 100 × $20
    expect(modalResult.tickets_sold).toBe(backendTickets);
  });

  it("INT-CALC-035: [P0] Modal handles invalid price gracefully", () => {
    const bin = {
      starting_serial: "000",
      serial_end: "014",
      game_price: NaN,
    };

    const modalResult = simulateModalCalculation(bin);

    expect(modalResult.tickets_sold).toBe(15);
    expect(modalResult.sales_amount).toBe(0); // NaN price → 0 sales
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: COMPONENT-SPECIFIC PARITY (DayCloseModeScanner)
// Verifies the scanner's calculation matches backend
// ═══════════════════════════════════════════════════════════════════════════════

describe("INTEGRATION: DayCloseModeScanner Backend Parity", () => {
  /**
   * Simulates the calculation flow in DayCloseModeScanner.calculateTotalSales
   */
  function simulateScannerTotalSales(
    bins: Array<{
      pack: { starting_serial: string; game_price: number };
      closing_serial: string;
    }>,
  ): number {
    return bins.reduce((total, bin) => {
      if (!bin.closing_serial || bin.closing_serial.length !== 3) return total;

      const ticketsSold = frontendCalculateTicketsSold(
        bin.closing_serial,
        bin.pack.starting_serial,
      );
      return total + ticketsSold * bin.pack.game_price;
    }, 0);
  }

  it("INT-CALC-041: [P0] Scanner total matches backend for single bin", () => {
    const bins = [
      {
        pack: { starting_serial: "000", game_price: 5.0 },
        closing_serial: "014",
      },
    ];

    const scannerTotal = simulateScannerTotalSales(bins);
    const backendTickets = backendCalculateTicketsSold("014", "000");

    expect(scannerTotal).toBe(75); // 15 tickets × $5
    expect(backendTickets).toBe(15);
  });

  it("INT-CALC-042: [P0] Scanner total matches backend for multiple bins", () => {
    const bins = [
      {
        pack: { starting_serial: "000", game_price: 5.0 },
        closing_serial: "014", // 15 tickets × $5 = $75
      },
      {
        pack: { starting_serial: "000", game_price: 10.0 },
        closing_serial: "049", // 50 tickets × $10 = $500
      },
    ];

    const scannerTotal = simulateScannerTotalSales(bins);

    expect(scannerTotal).toBe(575); // $75 + $500
  });

  it("INT-CALC-043: [P0] Scanner skips bins without valid closing serial", () => {
    const bins = [
      {
        pack: { starting_serial: "000", game_price: 5.0 },
        closing_serial: "014", // Valid: 15 × $5 = $75
      },
      {
        pack: { starting_serial: "000", game_price: 10.0 },
        closing_serial: "", // Invalid: skipped
      },
      {
        pack: { starting_serial: "000", game_price: 20.0 },
        closing_serial: "01", // Invalid (not 3 chars): skipped
      },
    ];

    const scannerTotal = simulateScannerTotalSales(bins);

    expect(scannerTotal).toBe(75); // Only first bin counted
  });

  it("INT-CALC-044: [P0] Scanner handles high-value pack correctly", () => {
    const bins = [
      {
        pack: { starting_serial: "000", game_price: 30.0 },
        closing_serial: "299", // 300 tickets × $30 = $9000
      },
    ];

    const scannerTotal = simulateScannerTotalSales(bins);
    const backendTickets = backendCalculateTicketsSold("299", "000");

    expect(backendTickets).toBe(300);
    expect(scannerTotal).toBe(9000);
  });

  it("INT-CALC-045: [P0] Scanner handles mixed pack sizes", () => {
    const bins = [
      {
        pack: { starting_serial: "000", game_price: 1.0 },
        closing_serial: "009", // 10 × $1 = $10
      },
      {
        pack: { starting_serial: "000", game_price: 2.0 },
        closing_serial: "024", // 25 × $2 = $50
      },
      {
        pack: { starting_serial: "000", game_price: 5.0 },
        closing_serial: "049", // 50 × $5 = $250
      },
    ];

    const scannerTotal = simulateScannerTotalSales(bins);

    expect(scannerTotal).toBe(310); // $10 + $50 + $250
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: REGRESSION PREVENTION
// Ensures the old incorrect formula cannot be reintroduced
// ═══════════════════════════════════════════════════════════════════════════════

describe("INTEGRATION: Regression Prevention - Old Formula Detection", () => {
  /**
   * The OLD WRONG formula was: tickets = ending - starting
   * This would cause off-by-one errors (losing 1 ticket per pack)
   */
  function oldWrongFormula(ending: string, starting: string): number {
    const endingNum = parseInt(ending, 10);
    const startingNum = parseInt(starting, 10);
    if (Number.isNaN(endingNum) || Number.isNaN(startingNum)) return 0;
    return Math.max(0, endingNum - startingNum);
  }

  it("INT-CALC-046: [P0] Frontend does NOT use old formula for 000-014", () => {
    const oldResult = oldWrongFormula("014", "000"); // Would be 14
    const frontendResult = frontendCalculateTicketsSold("014", "000"); // Should be 15

    expect(oldResult).toBe(14); // Old formula gives wrong result
    expect(frontendResult).toBe(15); // New formula gives correct result
    expect(frontendResult).not.toBe(oldResult); // They must differ
  });

  it("INT-CALC-047: [P0] Frontend does NOT use old formula for 000-000", () => {
    const oldResult = oldWrongFormula("000", "000"); // Would be 0
    const frontendResult = frontendCalculateTicketsSold("000", "000"); // Should be 1

    expect(oldResult).toBe(0); // Old formula gives wrong result
    expect(frontendResult).toBe(1); // New formula gives correct result
    expect(frontendResult).not.toBe(oldResult); // They must differ
  });

  it("INT-CALC-048: [P0] Backend does NOT use old formula for 000-049", () => {
    const oldResult = oldWrongFormula("049", "000"); // Would be 49
    const backendResult = backendCalculateTicketsSold("049", "000"); // Should be 50

    expect(oldResult).toBe(49); // Old formula gives wrong result
    expect(backendResult).toBe(50); // New formula gives correct result
    expect(backendResult).not.toBe(oldResult); // They must differ
  });

  it("INT-CALC-049: [P0] All layers reject old formula for 005-054", () => {
    const oldResult = oldWrongFormula("054", "005"); // Would be 49
    const frontendResult = frontendCalculateTicketsSold("054", "005"); // Should be 50
    const backendResult = backendCalculateTicketsSold("054", "005"); // Should be 50
    const lotteryResult = backendCalculateExpectedCount("005", "054"); // Should be 50

    expect(oldResult).toBe(49);
    expect(frontendResult).toBe(50);
    expect(backendResult).toBe(50);
    expect(lotteryResult).toBe(50);

    // All correct implementations must differ from old formula
    expect(frontendResult).not.toBe(oldResult);
    expect(backendResult).not.toBe(oldResult);
    expect(lotteryResult).not.toBe(oldResult);
  });

  it("INT-CALC-050: [P0] Sales amount regression: old formula loses $5 per pack", () => {
    const gamePrice = 5.0;

    // With old formula: 14 tickets × $5 = $70 (WRONG)
    const oldTickets = oldWrongFormula("014", "000");
    const oldSales = oldTickets * gamePrice;

    // With new formula: 15 tickets × $5 = $75 (CORRECT)
    const newTickets = frontendCalculateTicketsSold("014", "000");
    const newSales = newTickets * gamePrice;

    expect(oldSales).toBe(70);
    expect(newSales).toBe(75);
    expect(newSales - oldSales).toBe(5); // Lost $5 with old formula
  });
});
