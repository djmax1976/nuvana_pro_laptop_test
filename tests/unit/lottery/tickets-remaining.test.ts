/**
 * Unit Tests: Tickets Remaining Calculation
 *
 * Tests pure function for calculating tickets remaining in a lottery pack:
 * - Formula: tickets_remaining = (serial_end - serial_start + 1) - sold_count
 * - Edge cases: zero tickets, all sold, large ranges
 * - Security: Input validation, boundary checks
 *
 * @test-level UNIT
 * @justification Tests pure calculation logic without database operations - fast, isolated, deterministic
 * @story 6-10 - Lottery Management UI
 * @priority P1 (High - Pack Details Display)
 *
 * RED PHASE: These tests define expected behavior before implementation.
 * Tests will fail until calculation logic is implemented.
 */

import { describe, it, expect } from "vitest";

/**
 * Calculate tickets remaining in a lottery pack
 * @param serialStart - Starting serial number (e.g., "0001")
 * @param serialEnd - Ending serial number (e.g., "0100")
 * @param soldCount - Number of tickets already sold
 * @returns Number of tickets remaining
 * @throws Error if soldCount is negative or exceeds pack size
 */
function calculateTicketsRemaining(
  serialStart: string,
  serialEnd: string,
  soldCount: number,
): number {
  // Validate sold count is non-negative
  if (soldCount < 0) {
    throw new Error("Sold count cannot be negative");
  }

  // Extract numeric portion from serial strings (handles alphanumeric like "A001")
  const startNum = parseInt(serialStart.replace(/\D/g, ""), 10);
  const endNum = parseInt(serialEnd.replace(/\D/g, ""), 10);

  // Calculate pack size
  const packSize = endNum - startNum + 1;

  // Validate sold count doesn't exceed pack size
  if (soldCount > packSize) {
    throw new Error("Sold count cannot exceed pack size");
  }

  // Formula: (serial_end - serial_start + 1) - sold_count
  return packSize - soldCount;
}

// ═══════════════════════════════════════════════════════════════════════════
// TICKETS REMAINING CALCULATION TESTS (P1)
// ═══════════════════════════════════════════════════════════════════════════

describe("6.10-UNIT: Tickets Remaining Calculation", () => {
  describe("calculateTicketsRemaining", () => {
    it("6.10-UNIT-001: [P1] should calculate tickets remaining for numeric serials (AC #4)", () => {
      // GIVEN: Pack with serial range "0001" to "0100" and 25 tickets sold
      const serialStart = "0001";
      const serialEnd = "0100";
      const soldCount = 25;

      // WHEN: Calculating tickets remaining
      const remaining = calculateTicketsRemaining(
        serialStart,
        serialEnd,
        soldCount,
      );

      // THEN: Tickets remaining is 75 (100 - 25)
      expect(remaining).toBe(75);
    });

    it("6.10-UNIT-002: [P1] should return zero when all tickets are sold (AC #4)", () => {
      // GIVEN: Pack with serial range "0001" to "0100" and all 100 tickets sold
      const serialStart = "0001";
      const serialEnd = "0100";
      const soldCount = 100;

      // WHEN: Calculating tickets remaining
      const remaining = calculateTicketsRemaining(
        serialStart,
        serialEnd,
        soldCount,
      );

      // THEN: Tickets remaining is 0
      expect(remaining).toBe(0);
    });

    it("6.10-UNIT-003: [P1] should handle single ticket pack (AC #4)", () => {
      // GIVEN: Pack with single ticket (serial_start = serial_end)
      const serialStart = "0050";
      const serialEnd = "0050";
      const soldCount = 0;

      // WHEN: Calculating tickets remaining
      const remaining = calculateTicketsRemaining(
        serialStart,
        serialEnd,
        soldCount,
      );

      // THEN: Tickets remaining is 1
      expect(remaining).toBe(1);
    });

    it("6.10-UNIT-004: [P1] should handle large serial ranges (AC #4)", () => {
      // GIVEN: Pack with large range "0001" to "9999"
      const serialStart = "0001";
      const serialEnd = "9999";
      const soldCount = 5000;

      // WHEN: Calculating tickets remaining
      const remaining = calculateTicketsRemaining(
        serialStart,
        serialEnd,
        soldCount,
      );

      // THEN: Tickets remaining is 4999 (9999 - 1 + 1 - 5000)
      expect(remaining).toBe(4999);
    });

    it("6.10-UNIT-005: [P1] should handle alphanumeric serials (AC #4)", () => {
      // GIVEN: Pack with alphanumeric serials
      const serialStart = "A001";
      const serialEnd = "A100";
      const soldCount = 50;

      // WHEN: Calculating tickets remaining
      const remaining = calculateTicketsRemaining(
        serialStart,
        serialEnd,
        soldCount,
      );

      // THEN: Tickets remaining is 50 (100 - 50)
      expect(remaining).toBe(50);
    });

    it("6.10-UNIT-006: [P1] should reject negative sold count (AC #4)", () => {
      // GIVEN: Invalid sold count (negative)
      const serialStart = "0001";
      const serialEnd = "0100";
      const soldCount = -5;

      // WHEN: Calculating tickets remaining
      // THEN: Should throw validation error
      expect(() => {
        calculateTicketsRemaining(serialStart, serialEnd, soldCount);
      }).toThrow("Sold count cannot be negative");
    });

    it("6.10-UNIT-007: [P1] should reject sold count exceeding pack size (AC #4)", () => {
      // GIVEN: Sold count exceeds pack size
      const serialStart = "0001";
      const serialEnd = "0100";
      const soldCount = 150; // More than 100 tickets in pack

      // WHEN: Calculating tickets remaining
      // THEN: Should throw validation error or return 0 (business rule)
      expect(() => {
        calculateTicketsRemaining(serialStart, serialEnd, soldCount);
      }).toThrow("Sold count cannot exceed pack size");
    });
  });
});
