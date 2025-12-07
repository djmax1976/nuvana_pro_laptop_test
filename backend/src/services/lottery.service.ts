/**
 * Lottery Service
 *
 * Service for lottery-related business logic including:
 * - Variance detection and reconciliation calculations
 * - Expected count calculations
 *
 * Story 6.7: Shift Lottery Closing and Reconciliation
 */

import { prisma } from "../utils/db";

/**
 * Calculate expected ticket count based on opening and closing serials
 * Formula: expected = closing_serial - opening_serial + 1
 *
 * @param openingSerial - Opening serial number (string, e.g., "0001")
 * @param closingSerial - Closing serial number (string, e.g., "0050")
 * @returns Expected count of tickets that should have been sold
 * @throws Error if serials are not numeric
 */
export function calculateExpectedCount(
  openingSerial: string,
  closingSerial: string,
): number {
  // Parse serials as integers (assumes numeric serials, common for lottery tickets)
  const openingSerialNum = parseInt(openingSerial, 10);
  const closingSerialNum = parseInt(closingSerial, 10);

  if (isNaN(openingSerialNum) || isNaN(closingSerialNum)) {
    throw new Error(
      `Invalid serial format: opening=${openingSerial}, closing=${closingSerial}. Serials must be numeric.`,
    );
  }

  return closingSerialNum - openingSerialNum + 1;
}

/**
 * Detect if variance exists between expected and actual counts
 *
 * @param expected - Expected ticket count
 * @param actual - Actual ticket count from database
 * @returns true if variance exists (expected ≠ actual), false otherwise
 */
export function hasVariance(expected: number, actual: number): boolean {
  return expected !== actual;
}

/**
 * Calculate variance difference
 *
 * @param expected - Expected ticket count
 * @param actual - Actual ticket count from database
 * @returns Difference: expected - actual (positive = shortage, negative = surplus)
 */
export function calculateVarianceDifference(
  expected: number,
  actual: number,
): number {
  return expected - actual;
}

/**
 * Detect variance for a shift and pack, creating LotteryVariance record if variance exists
 *
 * @param shiftId - Shift UUID
 * @param packId - Pack UUID
 * @param openingSerial - Opening serial number
 * @param closingSerial - Closing serial number
 * @param shiftOpenedAt - Shift opened timestamp (for filtering actual count)
 * @returns LotteryVariance record if variance exists, null otherwise
 */
export async function detectVariance(
  shiftId: string,
  packId: string,
  openingSerial: string,
  closingSerial: string,
  shiftOpenedAt: Date,
): Promise<{
  variance: any;
  expected: number;
  actual: number;
  difference: number;
} | null> {
  // Calculate expected count
  const expected = calculateExpectedCount(openingSerial, closingSerial);

  // Query actual count from LotteryTicketSerial for this shift and pack
  const actual = await prisma.lotteryTicketSerial.count({
    where: {
      shift_id: shiftId,
      pack_id: packId,
      sold_at: {
        gte: shiftOpenedAt,
      },
    },
  });

  // Calculate difference
  const difference = calculateVarianceDifference(expected, actual);

  // Create LotteryVariance if difference exists
  if (hasVariance(expected, actual)) {
    const variance = await prisma.lotteryVariance.create({
      data: {
        shift_id: shiftId,
        pack_id: packId,
        expected: expected,
        actual: actual,
        difference: difference,
      },
    });

    return {
      variance,
      expected,
      actual,
      difference,
    };
  }

  return null;
}
