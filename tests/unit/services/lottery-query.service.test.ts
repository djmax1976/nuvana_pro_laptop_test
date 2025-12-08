/**
 * Lottery Query Service Unit Tests
 *
 * Tests for lottery query business logic:
 * - tickets_remaining calculation
 * - RLS validation helpers (if extracted)
 *
 * @test-level Unit
 * @justification Tests pure business logic functions without external dependencies
 * @story 6-11 - Lottery Query API Endpoints
 * @priority P0 (Critical - Business Logic)
 */

import { describe, it, expect } from "vitest";

/**
 * Calculate tickets remaining in a pack
 * Formula: (serial_end - serial_start + 1) - COUNT(sold tickets)
 *
 * @param serialStart - Starting serial number (string, e.g., "000001")
 * @param serialEnd - Ending serial number (string, e.g., "000100")
 * @param soldCount - Number of tickets sold (from LotteryTicketSerial WHERE sold_at IS NOT NULL)
 * @returns Number of tickets remaining
 */
function calculateTicketsRemaining(
  serialStart: string,
  serialEnd: string,
  soldCount: number,
): number {
  // Parse serial numbers as BigInt to handle large numbers
  let serialStartBigInt: bigint;
  let serialEndBigInt: bigint;

  try {
    serialStartBigInt = BigInt(serialStart);
    serialEndBigInt = BigInt(serialEnd);
  } catch (error) {
    throw new Error("Invalid serial format: serial numbers must be numeric");
  }

  // Validate serial range
  if (serialEndBigInt < serialStartBigInt) {
    throw new Error("Invalid serial range: serial_end must be >= serial_start");
  }

  // Calculate total tickets: (serial_end - serial_start + 1)
  const totalTickets = Number(serialEndBigInt - serialStartBigInt + BigInt(1));

  // Calculate remaining: total - sold
  const remaining = totalTickets - soldCount;

  // Ensure non-negative result
  if (remaining < 0) {
    throw new Error("Invalid calculation: sold count exceeds total tickets");
  }

  return remaining;
}

describe("6.11-UNIT: Lottery Query Service - tickets_remaining Calculation", () => {
  describe("calculateTicketsRemaining", () => {
    it("6.11-UNIT-001: should calculate remaining tickets correctly when some tickets are sold", () => {
      // GIVEN: A pack with serial range 000001-000100 and 25 tickets sold
      const serialStart = "000001";
      const serialEnd = "000100";
      const soldCount = 25;

      // WHEN: Calculating tickets remaining
      const result = calculateTicketsRemaining(
        serialStart,
        serialEnd,
        soldCount,
      );

      // THEN: Remaining tickets = (100 - 1 + 1) - 25 = 75
      expect(result).toBe(75);
    });

    it("6.11-UNIT-002: should return total tickets when no tickets are sold", () => {
      // GIVEN: A pack with serial range 000001-000100 and 0 tickets sold
      const serialStart = "000001";
      const serialEnd = "000100";
      const soldCount = 0;

      // WHEN: Calculating tickets remaining
      const result = calculateTicketsRemaining(
        serialStart,
        serialEnd,
        soldCount,
      );

      // THEN: Remaining tickets = (100 - 1 + 1) - 0 = 100
      expect(result).toBe(100);
    });

    it("6.11-UNIT-003: should return 0 when all tickets are sold", () => {
      // GIVEN: A pack with serial range 000001-000100 and 100 tickets sold
      const serialStart = "000001";
      const serialEnd = "000100";
      const soldCount = 100;

      // WHEN: Calculating tickets remaining
      const result = calculateTicketsRemaining(
        serialStart,
        serialEnd,
        soldCount,
      );

      // THEN: Remaining tickets = (100 - 1 + 1) - 100 = 0
      expect(result).toBe(0);
    });

    it("6.11-UNIT-004: should handle single ticket pack correctly", () => {
      // GIVEN: A pack with serial range 000001-000001 (single ticket)
      const serialStart = "000001";
      const serialEnd = "000001";
      const soldCount = 0;

      // WHEN: Calculating tickets remaining
      const result = calculateTicketsRemaining(
        serialStart,
        serialEnd,
        soldCount,
      );

      // THEN: Remaining tickets = (1 - 1 + 1) - 0 = 1
      expect(result).toBe(1);
    });

    it("6.11-UNIT-005: should handle large serial ranges correctly", () => {
      // GIVEN: A pack with serial range 000001-999999
      const serialStart = "000001";
      const serialEnd = "999999";
      const soldCount = 500000;

      // WHEN: Calculating tickets remaining
      const result = calculateTicketsRemaining(
        serialStart,
        serialEnd,
        soldCount,
      );

      // THEN: Remaining tickets = (999999 - 1 + 1) - 500000 = 499999
      expect(result).toBe(499999);
    });

    it("6.11-UNIT-006: should throw error for invalid serial format (non-numeric)", () => {
      // GIVEN: Invalid serial format
      const serialStart = "ABC001";
      const serialEnd = "000100";
      const soldCount = 25;

      // WHEN: Calculating tickets remaining
      // THEN: Should throw error
      expect(() => {
        calculateTicketsRemaining(serialStart, serialEnd, soldCount);
      }).toThrow("Invalid serial format");
    });

    it("6.11-UNIT-007: should throw error when serial_end < serial_start", () => {
      // GIVEN: Invalid range (end < start)
      const serialStart = "000100";
      const serialEnd = "000001";
      const soldCount = 0;

      // WHEN: Calculating tickets remaining
      // THEN: Should throw error
      expect(() => {
        calculateTicketsRemaining(serialStart, serialEnd, soldCount);
      }).toThrow("serial_end must be >= serial_start");
    });

    it("6.11-UNIT-008: should handle null serial ranges gracefully", () => {
      // GIVEN: Null serial ranges (edge case)
      const serialStart = null as any;
      const serialEnd = "000100";
      const soldCount = 0;

      // WHEN: Calculating tickets remaining
      // THEN: Should throw error
      expect(() => {
        calculateTicketsRemaining(serialStart, serialEnd, soldCount);
      }).toThrow();
    });

    it("6.11-UNIT-009: should throw error when sold count exceeds total tickets", () => {
      // GIVEN: A pack with serial range 000001-000100 and 150 tickets sold (impossible)
      const serialStart = "000001";
      const serialEnd = "000100";
      const soldCount = 150;

      // WHEN: Calculating tickets remaining
      // THEN: Should throw error
      expect(() => {
        calculateTicketsRemaining(serialStart, serialEnd, soldCount);
      }).toThrow("sold count exceeds total tickets");
    });

    it("6.11-UNIT-010: should handle very large serial numbers", () => {
      // GIVEN: A pack with very large serial range
      const serialStart = "184303159650093783374530";
      const serialEnd = "184303159650093783374680";
      const soldCount = 50;

      // WHEN: Calculating tickets remaining
      const result = calculateTicketsRemaining(
        serialStart,
        serialEnd,
        soldCount,
      );

      // THEN: Remaining tickets = (184303159650093783374680 - 184303159650093783374530 + 1) - 50 = 101
      expect(result).toBe(101);
    });
  });
});
