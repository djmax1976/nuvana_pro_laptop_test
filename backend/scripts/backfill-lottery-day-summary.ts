/**
 * Backfill Script: Lottery Business Day to Day Summary Association
 *
 * Purpose: Populate day_summary_id for existing lottery_business_days that were created
 * before the day_summary_id FK was added.
 *
 * Business Rule: A lottery_business_day should be linked to the DaySummary that shares
 * the same store_id and business_date. This creates a 1:1 relationship for coordinated
 * day close operations.
 *
 * Algorithm:
 * 1. Find all lottery_business_days with NULL day_summary_id
 * 2. For each lottery_business_day, find the DaySummary where:
 *    a) store_id matches
 *    b) business_date matches
 * 3. Update the lottery_business_day with the correct day_summary_id
 * 4. Log orphans (lottery days without matching day summary)
 *
 * Enterprise Standards Applied:
 * - DB-001: ORM_USAGE - Using Prisma query builders with parameterized queries
 * - DB-006: TENANT_ISOLATION - All queries scoped by store_id
 * - LM-001: LOGGING - Structured logging with progress tracking
 * - API-003: ERROR_HANDLING - Comprehensive error handling with detailed reporting
 *
 * Usage:
 *   npx ts-node scripts/backfill-lottery-day-summary.ts [--dry-run] [--batch-size=100]
 *
 * Options:
 *   --dry-run      Show what would be updated without making changes
 *   --batch-size   Number of records to process per batch (default: 100)
 *   --store-id     Limit to specific store (optional)
 *   --create-missing  Create missing day summaries for orphan lottery days
 *
 * @security SEC-014: All inputs validated, no SQL injection vectors
 */

import { PrismaClient, DaySummaryStatus } from "@prisma/client";

const prisma = new PrismaClient();

interface BackfillOptions {
  dryRun: boolean;
  batchSize: number;
  storeId?: string;
  createMissing: boolean;
}

interface BackfillStats {
  totalLotteryDays: number;
  processedLotteryDays: number;
  updatedLotteryDays: number;
  skippedLotteryDays: number;
  createdDaySummaries: number;
  erroredLotteryDays: number;
  orphanedLotteryDays: Array<{
    dayId: string;
    storeId: string;
    businessDate: Date;
  }>;
  errors: Array<{ dayId: string; error: string }>;
}

/**
 * Parse command line arguments
 * SEC-014: Input validation with explicit type checking
 */
function parseArgs(): BackfillOptions {
  const args = process.argv.slice(2);
  const options: BackfillOptions = {
    dryRun: false,
    batchSize: 100,
    storeId: undefined,
    createMissing: false,
  };

  for (const arg of args) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--create-missing") {
      options.createMissing = true;
    } else if (arg.startsWith("--batch-size=")) {
      const size = parseInt(arg.split("=")[1], 10);
      if (!isNaN(size) && size > 0 && size <= 1000) {
        options.batchSize = size;
      } else {
        console.warn(`Invalid batch size, using default: ${options.batchSize}`);
      }
    } else if (arg.startsWith("--store-id=")) {
      const storeId = arg.split("=")[1];
      // UUID validation regex
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(storeId)) {
        options.storeId = storeId;
      } else {
        console.warn(`Invalid store ID format, ignoring filter`);
      }
    }
  }

  return options;
}

/**
 * Find the matching DaySummary for a lottery business day
 *
 * Business Logic:
 * Match by store_id + business_date since lottery_business_days
 * are directly tied to a specific business date.
 *
 * @param storeId - Store UUID
 * @param businessDate - Business date from lottery_business_day
 * @returns DaySummary ID if found, null otherwise
 *
 * DB-001: Using Prisma ORM with parameterized queries
 */
async function findDaySummaryForLotteryDay(
  storeId: string,
  businessDate: Date,
): Promise<string | null> {
  // Direct match: store_id + business_date
  // This is the expected 1:1 relationship
  const daySummary = await prisma.daySummary.findUnique({
    where: {
      store_id_business_date: {
        store_id: storeId,
        business_date: businessDate,
      },
    },
    select: {
      day_summary_id: true,
    },
  });

  return daySummary?.day_summary_id ?? null;
}

/**
 * Create a DaySummary for an orphan lottery business day
 *
 * This is used when --create-missing is specified and a lottery_business_day
 * exists without a corresponding DaySummary.
 *
 * Business Rule: The new DaySummary inherits the status from the lottery day:
 * - CLOSED lottery day -> CLOSED DaySummary
 * - OPEN lottery day -> OPEN DaySummary
 * - PENDING_CLOSE lottery day -> PENDING_CLOSE DaySummary
 *
 * @param lotteryDay - The lottery business day to create a DaySummary for
 * @returns Created DaySummary ID
 *
 * DB-006: TENANT_ISOLATION - DaySummary scoped to same store
 */
async function createDaySummaryForLotteryDay(lotteryDay: {
  store_id: string;
  business_date: Date;
  status: string;
  opened_at: Date;
  closed_at: Date | null;
  closed_by: string | null;
}): Promise<string> {
  // Map lottery day status to DaySummary status
  const statusMap: Record<string, DaySummaryStatus> = {
    OPEN: DaySummaryStatus.OPEN,
    PENDING_CLOSE: DaySummaryStatus.PENDING_CLOSE,
    CLOSED: DaySummaryStatus.CLOSED,
  };

  const status = statusMap[lotteryDay.status] ?? DaySummaryStatus.OPEN;

  const daySummary = await prisma.daySummary.create({
    data: {
      store_id: lotteryDay.store_id,
      business_date: lotteryDay.business_date,
      status: status,
      first_shift_opened: lotteryDay.opened_at,
      closed_at: lotteryDay.closed_at,
      closed_by: lotteryDay.closed_by,
      // Initialize all numeric fields to 0 (required by schema)
      shift_count: 0,
      gross_sales: 0,
      returns_total: 0,
      discounts_total: 0,
      net_sales: 0,
      tax_collected: 0,
      tax_exempt_sales: 0,
      taxable_sales: 0,
      transaction_count: 0,
      void_count: 0,
      refund_count: 0,
      customer_count: 0,
      items_sold_count: 0,
      items_returned_count: 0,
      avg_transaction: 0,
      avg_items_per_txn: 0,
      total_opening_cash: 0,
      total_closing_cash: 0,
      total_expected_cash: 0,
      total_cash_variance: 0,
    },
    select: {
      day_summary_id: true,
    },
  });

  return daySummary.day_summary_id;
}

/**
 * Main backfill function
 *
 * Processes all lottery_business_days without a day_summary_id and attempts
 * to link them to their corresponding DaySummary.
 *
 * API-003: ERROR_HANDLING - Comprehensive try/catch with detailed error tracking
 */
async function backfillLotteryDaySummary(
  options: BackfillOptions,
): Promise<BackfillStats> {
  const stats: BackfillStats = {
    totalLotteryDays: 0,
    processedLotteryDays: 0,
    updatedLotteryDays: 0,
    skippedLotteryDays: 0,
    createdDaySummaries: 0,
    erroredLotteryDays: 0,
    orphanedLotteryDays: [],
    errors: [],
  };

  console.log("=".repeat(70));
  console.log("BACKFILL: Lottery Business Day to Day Summary Association");
  console.log("=".repeat(70));
  console.log(`Mode: ${options.dryRun ? "DRY RUN (no changes)" : "LIVE"}`);
  console.log(`Batch Size: ${options.batchSize}`);
  console.log(`Create Missing Day Summaries: ${options.createMissing}`);
  if (options.storeId) {
    console.log(`Store Filter: ${options.storeId}`);
  }
  console.log("=".repeat(70));

  // Build where clause with type safety
  // DB-006: TENANT_ISOLATION - Optional store filter
  interface WhereClause {
    day_summary_id: null;
    store_id?: string;
  }

  const whereClause: WhereClause = {
    day_summary_id: null, // Only records without day_summary_id
  };

  if (options.storeId) {
    whereClause.store_id = options.storeId;
  }

  // Count total records to process
  stats.totalLotteryDays = await prisma.lotteryBusinessDay.count({
    where: whereClause,
  });

  console.log(
    `\nFound ${stats.totalLotteryDays} lottery_business_days without day_summary_id`,
  );

  if (stats.totalLotteryDays === 0) {
    console.log("\nNo records to process. Exiting.");
    return stats;
  }

  // Process in batches for memory efficiency
  let offset = 0;

  while (offset < stats.totalLotteryDays) {
    const lotteryDays = await prisma.lotteryBusinessDay.findMany({
      where: whereClause,
      select: {
        day_id: true,
        store_id: true,
        business_date: true,
        status: true,
        opened_at: true,
        closed_at: true,
        closed_by: true,
      },
      orderBy: {
        business_date: "asc",
      },
      take: options.batchSize,
      skip: offset,
    });

    if (lotteryDays.length === 0) {
      break;
    }

    const batchNumber = Math.floor(offset / options.batchSize) + 1;
    console.log(
      `\nProcessing batch ${batchNumber} (${lotteryDays.length} records)...`,
    );

    for (const lotteryDay of lotteryDays) {
      stats.processedLotteryDays++;

      try {
        // Try to find existing DaySummary
        let daySummaryId = await findDaySummaryForLotteryDay(
          lotteryDay.store_id,
          lotteryDay.business_date,
        );

        // If no match found and --create-missing is set, create one
        if (!daySummaryId && options.createMissing) {
          if (options.dryRun) {
            console.log(
              `  [DRY-RUN] Would create DaySummary for store ${lotteryDay.store_id}, ` +
                `date ${lotteryDay.business_date.toISOString().split("T")[0]}`,
            );
            daySummaryId = "DRY-RUN-ID"; // Placeholder for dry run
            stats.createdDaySummaries++;
          } else {
            daySummaryId = await createDaySummaryForLotteryDay(lotteryDay);
            console.log(
              `  [CREATED] DaySummary ${daySummaryId} for store ${lotteryDay.store_id}, ` +
                `date ${lotteryDay.business_date.toISOString().split("T")[0]}`,
            );
            stats.createdDaySummaries++;
          }
        }

        // If still no match, track as orphan
        if (!daySummaryId) {
          console.log(
            `  [ORPHAN] Lottery day ${lotteryDay.day_id}: No matching DaySummary for ` +
              `store ${lotteryDay.store_id}, date ${lotteryDay.business_date.toISOString().split("T")[0]}`,
          );
          stats.skippedLotteryDays++;
          stats.orphanedLotteryDays.push({
            dayId: lotteryDay.day_id,
            storeId: lotteryDay.store_id,
            businessDate: lotteryDay.business_date,
          });
          continue;
        }

        // Update the lottery_business_day
        if (options.dryRun) {
          console.log(
            `  [DRY-RUN] Would update lottery_business_day ${lotteryDay.day_id} ` +
              `-> day_summary_id: ${daySummaryId}`,
          );
          stats.updatedLotteryDays++;
        } else {
          await prisma.lotteryBusinessDay.update({
            where: { day_id: lotteryDay.day_id },
            data: { day_summary_id: daySummaryId },
          });
          console.log(
            `  [UPDATED] lottery_business_day ${lotteryDay.day_id} ` +
              `-> day_summary_id: ${daySummaryId}`,
          );
          stats.updatedLotteryDays++;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `  [ERROR] lottery_business_day ${lotteryDay.day_id}: ${errorMessage}`,
        );
        stats.erroredLotteryDays++;
        stats.errors.push({
          dayId: lotteryDay.day_id,
          error: errorMessage,
        });
      }
    }

    offset += options.batchSize;

    // Progress update
    const progress = Math.round(
      (stats.processedLotteryDays / stats.totalLotteryDays) * 100,
    );
    console.log(
      `\nProgress: ${progress}% (${stats.processedLotteryDays}/${stats.totalLotteryDays})`,
    );
  }

  return stats;
}

/**
 * Print summary statistics
 * LM-001: LOGGING - Structured summary output
 */
function printSummary(stats: BackfillStats, options: BackfillOptions): void {
  console.log("\n" + "=".repeat(70));
  console.log("BACKFILL SUMMARY");
  console.log("=".repeat(70));
  console.log(`Mode: ${options.dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Total lottery_business_days found: ${stats.totalLotteryDays}`);
  console.log(`Processed: ${stats.processedLotteryDays}`);
  console.log(`Updated: ${stats.updatedLotteryDays}`);
  console.log(`DaySummaries created: ${stats.createdDaySummaries}`);
  console.log(`Skipped (orphaned): ${stats.skippedLotteryDays}`);
  console.log(`Errors: ${stats.erroredLotteryDays}`);

  // Print orphan details if any
  if (stats.orphanedLotteryDays.length > 0) {
    console.log("\nOrphaned Lottery Days (no matching DaySummary):");
    console.log(
      "Consider running with --create-missing to create DaySummaries for these",
    );
    for (const orphan of stats.orphanedLotteryDays.slice(0, 10)) {
      console.log(
        `  - Day ${orphan.dayId}: Store ${orphan.storeId}, ` +
          `Date ${orphan.businessDate.toISOString().split("T")[0]}`,
      );
    }
    if (stats.orphanedLotteryDays.length > 10) {
      console.log(
        `  ... and ${stats.orphanedLotteryDays.length - 10} more orphans`,
      );
    }
  }

  // Print error details if any
  if (stats.errors.length > 0) {
    console.log("\nError Details:");
    for (const err of stats.errors.slice(0, 10)) {
      console.log(`  - Day ${err.dayId}: ${err.error}`);
    }
    if (stats.errors.length > 10) {
      console.log(`  ... and ${stats.errors.length - 10} more errors`);
    }
  }

  console.log("=".repeat(70));

  // Suggest next steps
  if (stats.orphanedLotteryDays.length > 0 && !options.createMissing) {
    console.log("\nNext Steps:");
    console.log(
      "  Run with --create-missing to create DaySummaries for orphaned lottery days:",
    );
    console.log(
      `  npx ts-node scripts/backfill-lottery-day-summary.ts --create-missing`,
    );
  }
}

/**
 * Main entry point
 *
 * @returns Exit code (0 = success, 1 = errors occurred)
 */
async function main(): Promise<void> {
  const options = parseArgs();

  try {
    const stats = await backfillLotteryDaySummary(options);
    printSummary(stats, options);

    if (stats.erroredLotteryDays > 0) {
      console.log("\nBackfill completed with errors. Exit code: 1");
      process.exit(1);
    }

    console.log("\nBackfill completed successfully. Exit code: 0");
  } catch (error) {
    console.error("\nFatal error during backfill:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
main();
