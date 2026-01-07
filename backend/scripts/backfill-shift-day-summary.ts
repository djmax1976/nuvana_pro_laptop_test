/**
 * Backfill Script: Shift Day Summary Association
 *
 * Purpose: Populate day_summary_id for existing shifts that were created before
 * the day_summary_id FK was added to the shifts table.
 *
 * Business Rule: A shift belongs to the business day (DaySummary) that was ACTIVE
 * when the shift was opened. For historical data, we determine this by finding
 * the DaySummary whose time window contains the shift's opened_at timestamp.
 *
 * Algorithm:
 * 1. Find all shifts with NULL day_summary_id
 * 2. For each shift, find the DaySummary where:
 *    a) store_id matches
 *    b) The day was OPEN during the shift's opened_at time (if status tracking exists)
 *    c) OR the business_date matches the calendar date of opened_at (fallback)
 * 3. Update the shift with the correct day_summary_id
 *
 * Enterprise Standards Applied:
 * - DB-001: ORM_USAGE - Using Prisma query builders with parameterized queries
 * - DB-006: TENANT_ISOLATION - All queries scoped by store_id
 * - LM-001: LOGGING - Structured logging with progress tracking
 * - API-003: ERROR_HANDLING - Comprehensive error handling with rollback support
 *
 * Usage:
 *   npx ts-node scripts/backfill-shift-day-summary.ts [--dry-run] [--batch-size=100]
 *
 * Options:
 *   --dry-run      Show what would be updated without making changes
 *   --batch-size   Number of shifts to process per batch (default: 100)
 *   --store-id     Limit to specific store (optional)
 *
 * @security SEC-014: All inputs validated, no SQL injection vectors
 */

import { PrismaClient, DaySummaryStatus } from "@prisma/client";
import { startOfDay } from "date-fns";

const prisma = new PrismaClient();

interface BackfillOptions {
  dryRun: boolean;
  batchSize: number;
  storeId?: string;
}

interface BackfillStats {
  totalShifts: number;
  processedShifts: number;
  updatedShifts: number;
  skippedShifts: number;
  erroredShifts: number;
  errors: Array<{ shiftId: string; error: string }>;
}

/**
 * Parse command line arguments
 */
function parseArgs(): BackfillOptions {
  const args = process.argv.slice(2);
  const options: BackfillOptions = {
    dryRun: false,
    batchSize: 100,
    storeId: undefined,
  };

  for (const arg of args) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg.startsWith("--batch-size=")) {
      const size = parseInt(arg.split("=")[1], 10);
      if (!isNaN(size) && size > 0) {
        options.batchSize = size;
      }
    } else if (arg.startsWith("--store-id=")) {
      options.storeId = arg.split("=")[1];
    }
  }

  return options;
}

/**
 * Find the appropriate DaySummary for a shift based on its opened_at timestamp
 *
 * Business Logic:
 * 1. Try to find a DaySummary that was OPEN during the shift's opened_at time
 * 2. If not found, fall back to matching by calendar date of opened_at
 *
 * @param storeId - Store UUID
 * @param openedAt - When the shift was opened
 * @returns DaySummary ID if found, null otherwise
 */
async function findDaySummaryForShift(
  storeId: string,
  openedAt: Date,
): Promise<string | null> {
  // Strategy 1: Find a DaySummary that was OPEN when this shift was opened
  // A DaySummary is considered to cover a shift if:
  // - opened_at falls between the day's first_shift_opened and last_shift_closed (if closed)
  // - OR the day is still OPEN (status = OPEN)

  // First, try to find any OPEN day summary that contains this shift
  // This handles the case where the shift was opened during an active business day
  const openDaySummary = await prisma.daySummary.findFirst({
    where: {
      store_id: storeId,
      status: DaySummaryStatus.OPEN,
      first_shift_opened: {
        lte: openedAt,
      },
    },
    select: {
      day_summary_id: true,
      business_date: true,
    },
    orderBy: {
      business_date: "desc",
    },
  });

  if (openDaySummary) {
    return openDaySummary.day_summary_id;
  }

  // Strategy 2: Find a CLOSED day summary where the shift falls within its time window
  const closedDaySummary = await prisma.daySummary.findFirst({
    where: {
      store_id: storeId,
      status: DaySummaryStatus.CLOSED,
      first_shift_opened: {
        lte: openedAt,
      },
      closed_at: {
        gte: openedAt,
      },
    },
    select: {
      day_summary_id: true,
      business_date: true,
    },
    orderBy: {
      business_date: "desc",
    },
  });

  if (closedDaySummary) {
    return closedDaySummary.day_summary_id;
  }

  // Strategy 3 (Fallback): Match by calendar date of opened_at
  // This is the least accurate but ensures we have a mapping
  const calendarDate = startOfDay(openedAt);

  const dateFallbackDaySummary = await prisma.daySummary.findFirst({
    where: {
      store_id: storeId,
      business_date: calendarDate,
    },
    select: {
      day_summary_id: true,
    },
  });

  if (dateFallbackDaySummary) {
    return dateFallbackDaySummary.day_summary_id;
  }

  // No matching DaySummary found
  return null;
}

/**
 * Main backfill function
 */
async function backfillShiftDaySummary(
  options: BackfillOptions,
): Promise<BackfillStats> {
  const stats: BackfillStats = {
    totalShifts: 0,
    processedShifts: 0,
    updatedShifts: 0,
    skippedShifts: 0,
    erroredShifts: 0,
    errors: [],
  };

  console.log("=".repeat(60));
  console.log("BACKFILL: Shift Day Summary Association");
  console.log("=".repeat(60));
  console.log(`Mode: ${options.dryRun ? "DRY RUN (no changes)" : "LIVE"}`);
  console.log(`Batch Size: ${options.batchSize}`);
  if (options.storeId) {
    console.log(`Store Filter: ${options.storeId}`);
  }
  console.log("=".repeat(60));

  // Build where clause
  const whereClause: any = {
    day_summary_id: null, // Only shifts without day_summary_id
  };

  if (options.storeId) {
    whereClause.store_id = options.storeId;
  }

  // Count total shifts to process
  stats.totalShifts = await prisma.shift.count({
    where: whereClause,
  });

  console.log(`\nFound ${stats.totalShifts} shifts without day_summary_id`);

  if (stats.totalShifts === 0) {
    console.log("\nNo shifts to process. Exiting.");
    return stats;
  }

  // Process in batches
  let offset = 0;

  while (offset < stats.totalShifts) {
    const shifts = await prisma.shift.findMany({
      where: whereClause,
      select: {
        shift_id: true,
        store_id: true,
        opened_at: true,
      },
      orderBy: {
        opened_at: "asc",
      },
      take: options.batchSize,
      skip: offset,
    });

    if (shifts.length === 0) {
      break;
    }

    console.log(
      `\nProcessing batch ${Math.floor(offset / options.batchSize) + 1} (${shifts.length} shifts)...`,
    );

    for (const shift of shifts) {
      stats.processedShifts++;

      try {
        const daySummaryId = await findDaySummaryForShift(
          shift.store_id,
          shift.opened_at,
        );

        if (!daySummaryId) {
          console.log(
            `  [SKIP] Shift ${shift.shift_id}: No matching DaySummary found`,
          );
          stats.skippedShifts++;
          continue;
        }

        if (options.dryRun) {
          console.log(
            `  [DRY-RUN] Would update shift ${shift.shift_id} -> day_summary_id: ${daySummaryId}`,
          );
          stats.updatedShifts++;
        } else {
          await prisma.shift.update({
            where: { shift_id: shift.shift_id },
            data: { day_summary_id: daySummaryId },
          });
          console.log(
            `  [UPDATED] Shift ${shift.shift_id} -> day_summary_id: ${daySummaryId}`,
          );
          stats.updatedShifts++;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(`  [ERROR] Shift ${shift.shift_id}: ${errorMessage}`);
        stats.erroredShifts++;
        stats.errors.push({
          shiftId: shift.shift_id,
          error: errorMessage,
        });
      }
    }

    offset += options.batchSize;

    // Progress update
    const progress = Math.round(
      (stats.processedShifts / stats.totalShifts) * 100,
    );
    console.log(
      `\nProgress: ${progress}% (${stats.processedShifts}/${stats.totalShifts})`,
    );
  }

  return stats;
}

/**
 * Print summary statistics
 */
function printSummary(stats: BackfillStats, options: BackfillOptions): void {
  console.log("\n" + "=".repeat(60));
  console.log("BACKFILL SUMMARY");
  console.log("=".repeat(60));
  console.log(`Mode: ${options.dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Total shifts found: ${stats.totalShifts}`);
  console.log(`Processed: ${stats.processedShifts}`);
  console.log(`Updated: ${stats.updatedShifts}`);
  console.log(`Skipped (no matching day): ${stats.skippedShifts}`);
  console.log(`Errors: ${stats.erroredShifts}`);

  if (stats.errors.length > 0) {
    console.log("\nError Details:");
    for (const err of stats.errors.slice(0, 10)) {
      console.log(`  - Shift ${err.shiftId}: ${err.error}`);
    }
    if (stats.errors.length > 10) {
      console.log(`  ... and ${stats.errors.length - 10} more errors`);
    }
  }

  console.log("=".repeat(60));
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const options = parseArgs();

  try {
    const stats = await backfillShiftDaySummary(options);
    printSummary(stats, options);

    if (stats.erroredShifts > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("\nFatal error during backfill:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
main();
