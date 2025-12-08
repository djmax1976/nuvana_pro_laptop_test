/**
 * Lottery Count Maintenance Service
 *
 * Service for maintaining denormalized tickets_sold_count field
 * Story 6.13: Lottery Database Enhancements & Bin Management
 */

import { prisma } from "../utils/db";

/**
 * Increment denormalized ticket count
 *
 * @param currentCount - Current tickets_sold_count
 * @param _lastSoldAt - Current last_sold_at timestamp (unused, kept for API consistency)
 * @returns Updated count and timestamp
 */
export function incrementTicketCount(
  currentCount: number,
  _lastSoldAt: Date | null,
): { count: number; lastSoldAt: Date } {
  // GIVEN: Current count and timestamp
  // WHEN: Incrementing count
  const newCount = currentCount + 1;
  const newLastSoldAt = new Date();

  // THEN: Count is incremented and timestamp is updated
  return { count: newCount, lastSoldAt: newLastSoldAt };
}

/**
 * Update denormalized ticket count when a ticket is sold
 * This should be called whenever a LotteryTicketSerial record is created with sold_at set
 *
 * @param packId - Pack UUID
 * @returns Updated pack with new tickets_sold_count and last_sold_at
 * @throws Error if pack not found
 */
export async function updateTicketCountOnSale(packId: string): Promise<{
  pack_id: string;
  tickets_sold_count: number;
  last_sold_at: Date | null;
}> {
  // Get current pack state
  const pack = await prisma.lotteryPack.findUnique({
    where: { pack_id: packId },
    select: {
      pack_id: true,
      tickets_sold_count: true,
      last_sold_at: true,
    },
  });

  if (!pack) {
    throw new Error(`Pack ${packId} not found`);
  }

  // Increment count and update timestamp
  const { count, lastSoldAt } = incrementTicketCount(
    pack.tickets_sold_count,
    pack.last_sold_at,
  );

  // Update pack using Prisma ORM (prevents SQL injection)
  const updatedPack = await prisma.lotteryPack.update({
    where: { pack_id: packId },
    data: {
      tickets_sold_count: count,
      last_sold_at: lastSoldAt,
    },
    select: {
      pack_id: true,
      tickets_sold_count: true,
      last_sold_at: true,
    },
  });

  return updatedPack;
}

/**
 * Validate count accuracy (reconciliation)
 *
 * @param denormalizedCount - Denormalized tickets_sold_count
 * @param actualSoldCount - Actual count from LotteryTicketSerial table
 * @returns Validation result with difference if inaccurate
 */
export function validateCountAccuracy(
  denormalizedCount: number,
  actualSoldCount: number,
): { accurate: boolean; difference?: number } {
  // GIVEN: Denormalized count and actual count
  // WHEN: Comparing counts
  const difference = actualSoldCount - denormalizedCount;

  // THEN: Counts should match
  if (difference === 0) {
    return { accurate: true };
  }

  return { accurate: false, difference };
}

/**
 * Check if cache needs invalidation based on last_sold_at
 *
 * @param lastSoldAt - Last sold timestamp
 * @param cacheAgeThreshold - Cache age threshold in milliseconds
 * @returns Whether cache needs invalidation
 */
export function shouldInvalidateCache(
  lastSoldAt: Date | null,
  cacheAgeThreshold: number,
): boolean {
  // GIVEN: Last sold timestamp and cache threshold
  if (lastSoldAt === null) {
    return false; // No sales yet, no cache to invalidate
  }

  // WHEN: Checking cache age
  const now = new Date();
  const cacheAge = now.getTime() - lastSoldAt.getTime();

  // THEN: Cache needs invalidation if age exceeds threshold
  return cacheAge > cacheAgeThreshold;
}

/**
 * Reconcile denormalized ticket count for a specific pack
 * Compares tickets_sold_count with actual count from LotteryTicketSerial table
 * Updates pack if discrepancy found
 *
 * @param packId - Pack UUID
 * @returns Reconciliation result with accuracy status and any corrections made
 */
export async function reconcilePackTicketCount(packId: string): Promise<{
  pack_id: string;
  accurate: boolean;
  denormalized_count: number;
  actual_count: number;
  difference?: number;
  corrected: boolean;
}> {
  // Get pack with current denormalized count
  const pack = await prisma.lotteryPack.findUnique({
    where: { pack_id: packId },
    select: {
      pack_id: true,
      tickets_sold_count: true,
    },
  });

  if (!pack) {
    throw new Error(`Pack ${packId} not found`);
  }

  // Get actual count from LotteryTicketSerial table using Prisma ORM
  const actualCount = await prisma.lotteryTicketSerial.count({
    where: {
      pack_id: packId,
      sold_at: { not: null }, // Only count tickets that were actually sold
    },
  });

  // Validate accuracy
  const validation = validateCountAccuracy(
    pack.tickets_sold_count,
    actualCount,
  );

  let corrected = false;

  // If inaccurate, correct the denormalized count
  if (!validation.accurate && validation.difference !== undefined) {
    // Get most recent sale timestamp if any tickets were sold
    let lastSoldAt: Date | null = null;
    if (actualCount > 0) {
      const latestSale = await prisma.lotteryTicketSerial.findFirst({
        where: {
          pack_id: packId,
          sold_at: { not: null },
        },
        orderBy: { sold_at: "desc" },
        select: { sold_at: true },
      });
      lastSoldAt = latestSale?.sold_at || null;
    }

    await prisma.lotteryPack.update({
      where: { pack_id: packId },
      data: {
        tickets_sold_count: actualCount,
        last_sold_at: lastSoldAt,
      },
    });
    corrected = true;
  }

  return {
    pack_id: pack.pack_id,
    accurate: validation.accurate,
    denormalized_count: pack.tickets_sold_count,
    actual_count: actualCount,
    difference: validation.difference,
    corrected,
  };
}

/**
 * Reconcile denormalized ticket counts for all active packs
 * Background job function for periodic reconciliation
 *
 * @param batchSize - Number of packs to process per batch (default: 100)
 * @returns Reconciliation summary with total processed, corrected, and accurate counts
 */
export async function reconcileAllPackTicketCounts(
  batchSize: number = 100,
): Promise<{
  total_processed: number;
  total_corrected: number;
  total_accurate: number;
  discrepancies: Array<{
    pack_id: string;
    difference: number;
  }>;
}> {
  let totalProcessed = 0;
  let totalCorrected = 0;
  let totalAccurate = 0;
  const discrepancies: Array<{ pack_id: string; difference: number }> = [];

  // Process packs in batches to avoid memory issues
  let skip = 0;
  let hasMore = true;

  while (hasMore) {
    // Get batch of active packs using Prisma ORM
    const packs = await prisma.lotteryPack.findMany({
      where: {
        status: "ACTIVE", // Only reconcile active packs
      },
      select: {
        pack_id: true,
      },
      take: batchSize,
      skip: skip,
    });

    if (packs.length === 0) {
      hasMore = false;
      break;
    }

    // Reconcile each pack in the batch
    for (const pack of packs) {
      try {
        const result = await reconcilePackTicketCount(pack.pack_id);
        totalProcessed++;

        if (result.accurate) {
          totalAccurate++;
        } else {
          if (result.corrected) {
            totalCorrected++;
          }
          if (result.difference !== undefined) {
            discrepancies.push({
              pack_id: result.pack_id,
              difference: result.difference,
            });
          }
        }
      } catch (error) {
        // Log error but continue with other packs
        console.error(
          `Error reconciling pack ${pack.pack_id}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    skip += batchSize;
    hasMore = packs.length === batchSize;
  }

  return {
    total_processed: totalProcessed,
    total_corrected: totalCorrected,
    total_accurate: totalAccurate,
    discrepancies,
  };
}
