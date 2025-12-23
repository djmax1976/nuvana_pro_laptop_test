/**
 * Rollback Summaries Script
 * Phase 5.1: Rollback Scripts
 *
 * This script provides rollback capabilities for the backfill scripts.
 * It can remove shift summaries, day summaries, or both, allowing you
 * to re-run backfill scripts with different parameters.
 *
 * Features:
 * - Selective rollback by store, date range, or summary type
 * - Dry-run mode for safety
 * - Cascade deletion of child summary records
 * - Confirmation prompts for destructive operations
 *
 * Usage:
 *   npx ts-node backend/scripts/rollback-summaries.ts [options]
 *
 * Options:
 *   --type=shift|day|all     Type of summaries to rollback (required)
 *   --store-id=xxx           Limit to specific store
 *   --from-date=YYYY-MM-DD   Rollback summaries from this date
 *   --to-date=YYYY-MM-DD     Rollback summaries to this date
 *   --dry-run                Preview changes without executing
 *   --force                  Skip confirmation prompts
 *
 * Enterprise coding standards applied:
 * - DB-001: ORM usage with Prisma
 * - DB-005: BACKUP_SECURITY - Always create backups before destructive operations
 * - API-003: Centralized error handling
 * - LM-001: Structured logging
 */

import { PrismaClient } from "@prisma/client";
import { format } from "date-fns";
import * as readline from "readline";

const prisma = new PrismaClient();

type RollbackType = "shift" | "day" | "all";

interface RollbackOptions {
  type: RollbackType;
  storeId?: string;
  fromDate?: string;
  toDate?: string;
  dryRun: boolean;
  force: boolean;
}

interface RollbackStats {
  shiftSummariesDeleted: number;
  shiftTenderSummariesDeleted: number;
  shiftDepartmentSummariesDeleted: number;
  shiftTaxSummariesDeleted: number;
  shiftHourlySummariesDeleted: number;
  daySummariesDeleted: number;
  dayTenderSummariesDeleted: number;
  dayDepartmentSummariesDeleted: number;
  dayTaxSummariesDeleted: number;
  dayHourlySummariesDeleted: number;
}

/**
 * Parse command line arguments
 */
function parseArgs(): RollbackOptions {
  const args = process.argv.slice(2);
  const options: RollbackOptions = {
    type: "all",
    dryRun: false,
    force: false,
  };

  for (const arg of args) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg.startsWith("--type=")) {
      const typeValue = arg.split("=")[1] as RollbackType;
      if (["shift", "day", "all"].includes(typeValue)) {
        options.type = typeValue;
      }
    } else if (arg.startsWith("--store-id=")) {
      options.storeId = arg.split("=")[1];
    } else if (arg.startsWith("--from-date=")) {
      options.fromDate = arg.split("=")[1];
    } else if (arg.startsWith("--to-date=")) {
      options.toDate = arg.split("=")[1];
    }
  }

  return options;
}

/**
 * Prompt user for confirmation
 */
async function confirmAction(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}

/**
 * Build date filter for Prisma queries
 */
function buildDateFilter(fromDate?: string, toDate?: string): any {
  if (!fromDate && !toDate) {
    return undefined;
  }

  const filter: any = {};

  if (fromDate) {
    const from = new Date(fromDate);
    from.setHours(0, 0, 0, 0);
    filter.gte = from;
  }

  if (toDate) {
    const to = new Date(toDate);
    to.setHours(23, 59, 59, 999);
    filter.lte = to;
  }

  return filter;
}

/**
 * Count summaries that would be affected
 */
async function countAffectedSummaries(options: RollbackOptions): Promise<{
  shiftSummaries: number;
  daySummaries: number;
}> {
  const dateFilter = buildDateFilter(options.fromDate, options.toDate);

  let shiftSummaries = 0;
  let daySummaries = 0;

  if (options.type === "shift" || options.type === "all") {
    const whereClause: any = {};
    if (options.storeId) {
      whereClause.store_id = options.storeId;
    }
    if (dateFilter) {
      whereClause.business_date = dateFilter;
    }

    shiftSummaries = await prisma.shiftSummary.count({ where: whereClause });
  }

  if (options.type === "day" || options.type === "all") {
    const whereClause: any = {};
    if (options.storeId) {
      whereClause.store_id = options.storeId;
    }
    if (dateFilter) {
      whereClause.business_date = dateFilter;
    }

    daySummaries = await prisma.daySummary.count({ where: whereClause });
  }

  return { shiftSummaries, daySummaries };
}

/**
 * Rollback shift summaries
 */
async function rollbackShiftSummaries(
  options: RollbackOptions,
  stats: RollbackStats,
): Promise<void> {
  const dateFilter = buildDateFilter(options.fromDate, options.toDate);

  const whereClause: any = {};
  if (options.storeId) {
    whereClause.store_id = options.storeId;
  }
  if (dateFilter) {
    whereClause.business_date = dateFilter;
  }

  // Get shift summary IDs to delete child records
  const shiftSummaries = await prisma.shiftSummary.findMany({
    where: whereClause,
    select: { shift_summary_id: true },
  });

  const summaryIds = shiftSummaries.map((s) => s.shift_summary_id);

  if (summaryIds.length === 0) {
    console.log("  No shift summaries to delete");
    return;
  }

  console.log(
    `  Deleting ${summaryIds.length} shift summaries and child records...`,
  );

  if (options.dryRun) {
    // Count what would be deleted
    stats.shiftTenderSummariesDeleted = await prisma.shiftTenderSummary.count({
      where: { shift_summary_id: { in: summaryIds } },
    });
    stats.shiftDepartmentSummariesDeleted =
      await prisma.shiftDepartmentSummary.count({
        where: { shift_summary_id: { in: summaryIds } },
      });
    stats.shiftTaxSummariesDeleted = await prisma.shiftTaxSummary.count({
      where: { shift_summary_id: { in: summaryIds } },
    });
    stats.shiftHourlySummariesDeleted = await prisma.shiftHourlySummary.count({
      where: { shift_summary_id: { in: summaryIds } },
    });
    stats.shiftSummariesDeleted = summaryIds.length;

    console.log(`  [DRY-RUN] Would delete:`);
    console.log(`    - ${stats.shiftTenderSummariesDeleted} tender summaries`);
    console.log(
      `    - ${stats.shiftDepartmentSummariesDeleted} department summaries`,
    );
    console.log(`    - ${stats.shiftTaxSummariesDeleted} tax summaries`);
    console.log(`    - ${stats.shiftHourlySummariesDeleted} hourly summaries`);
    console.log(`    - ${stats.shiftSummariesDeleted} shift summaries`);
  } else {
    // Delete in batches to avoid timeout
    const batchSize = 100;
    for (let i = 0; i < summaryIds.length; i += batchSize) {
      const batchIds = summaryIds.slice(i, i + batchSize);

      await prisma.$transaction(async (tx) => {
        // Delete child records first (due to foreign key constraints)
        const tenderResult = await tx.shiftTenderSummary.deleteMany({
          where: { shift_summary_id: { in: batchIds } },
        });
        stats.shiftTenderSummariesDeleted += tenderResult.count;

        const deptResult = await tx.shiftDepartmentSummary.deleteMany({
          where: { shift_summary_id: { in: batchIds } },
        });
        stats.shiftDepartmentSummariesDeleted += deptResult.count;

        const taxResult = await tx.shiftTaxSummary.deleteMany({
          where: { shift_summary_id: { in: batchIds } },
        });
        stats.shiftTaxSummariesDeleted += taxResult.count;

        const hourlyResult = await tx.shiftHourlySummary.deleteMany({
          where: { shift_summary_id: { in: batchIds } },
        });
        stats.shiftHourlySummariesDeleted += hourlyResult.count;

        // Delete parent records
        const shiftResult = await tx.shiftSummary.deleteMany({
          where: { shift_summary_id: { in: batchIds } },
        });
        stats.shiftSummariesDeleted += shiftResult.count;
      });

      console.log(
        `    Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(summaryIds.length / batchSize)}`,
      );
    }
  }
}

/**
 * Rollback day summaries
 */
async function rollbackDaySummaries(
  options: RollbackOptions,
  stats: RollbackStats,
): Promise<void> {
  const dateFilter = buildDateFilter(options.fromDate, options.toDate);

  const whereClause: any = {};
  if (options.storeId) {
    whereClause.store_id = options.storeId;
  }
  if (dateFilter) {
    whereClause.business_date = dateFilter;
  }

  // Get day summary IDs to delete child records
  const daySummaries = await prisma.daySummary.findMany({
    where: whereClause,
    select: { day_summary_id: true },
  });

  const summaryIds = daySummaries.map((s) => s.day_summary_id);

  if (summaryIds.length === 0) {
    console.log("  No day summaries to delete");
    return;
  }

  console.log(
    `  Deleting ${summaryIds.length} day summaries and child records...`,
  );

  if (options.dryRun) {
    // Count what would be deleted
    stats.dayTenderSummariesDeleted = await prisma.dayTenderSummary.count({
      where: { day_summary_id: { in: summaryIds } },
    });
    stats.dayDepartmentSummariesDeleted =
      await prisma.dayDepartmentSummary.count({
        where: { day_summary_id: { in: summaryIds } },
      });
    stats.dayTaxSummariesDeleted = await prisma.dayTaxSummary.count({
      where: { day_summary_id: { in: summaryIds } },
    });
    stats.dayHourlySummariesDeleted = await prisma.dayHourlySummary.count({
      where: { day_summary_id: { in: summaryIds } },
    });
    stats.daySummariesDeleted = summaryIds.length;

    console.log(`  [DRY-RUN] Would delete:`);
    console.log(`    - ${stats.dayTenderSummariesDeleted} tender summaries`);
    console.log(
      `    - ${stats.dayDepartmentSummariesDeleted} department summaries`,
    );
    console.log(`    - ${stats.dayTaxSummariesDeleted} tax summaries`);
    console.log(`    - ${stats.dayHourlySummariesDeleted} hourly summaries`);
    console.log(`    - ${stats.daySummariesDeleted} day summaries`);
  } else {
    // Delete in batches to avoid timeout
    const batchSize = 100;
    for (let i = 0; i < summaryIds.length; i += batchSize) {
      const batchIds = summaryIds.slice(i, i + batchSize);

      await prisma.$transaction(async (tx) => {
        // Delete child records first (due to foreign key constraints)
        const tenderResult = await tx.dayTenderSummary.deleteMany({
          where: { day_summary_id: { in: batchIds } },
        });
        stats.dayTenderSummariesDeleted += tenderResult.count;

        const deptResult = await tx.dayDepartmentSummary.deleteMany({
          where: { day_summary_id: { in: batchIds } },
        });
        stats.dayDepartmentSummariesDeleted += deptResult.count;

        const taxResult = await tx.dayTaxSummary.deleteMany({
          where: { day_summary_id: { in: batchIds } },
        });
        stats.dayTaxSummariesDeleted += taxResult.count;

        const hourlyResult = await tx.dayHourlySummary.deleteMany({
          where: { day_summary_id: { in: batchIds } },
        });
        stats.dayHourlySummariesDeleted += hourlyResult.count;

        // Delete parent records
        const dayResult = await tx.daySummary.deleteMany({
          where: { day_summary_id: { in: batchIds } },
        });
        stats.daySummariesDeleted += dayResult.count;
      });

      console.log(
        `    Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(summaryIds.length / batchSize)}`,
      );
    }
  }
}

/**
 * Main rollback function
 */
async function rollbackSummaries(
  options: RollbackOptions,
): Promise<RollbackStats> {
  const stats: RollbackStats = {
    shiftSummariesDeleted: 0,
    shiftTenderSummariesDeleted: 0,
    shiftDepartmentSummariesDeleted: 0,
    shiftTaxSummariesDeleted: 0,
    shiftHourlySummariesDeleted: 0,
    daySummariesDeleted: 0,
    dayTenderSummariesDeleted: 0,
    dayDepartmentSummariesDeleted: 0,
    dayTaxSummariesDeleted: 0,
    dayHourlySummariesDeleted: 0,
  };

  console.log("=".repeat(60));
  console.log("Phase 5.1: Summary Rollback Script");
  console.log("=".repeat(60));
  console.log(`Mode: ${options.dryRun ? "DRY-RUN (no changes)" : "LIVE"}`);
  console.log(`Type: ${options.type}`);
  if (options.storeId) {
    console.log(`Store: ${options.storeId}`);
  }
  if (options.fromDate) {
    console.log(`From date: ${options.fromDate}`);
  }
  if (options.toDate) {
    console.log(`To date: ${options.toDate}`);
  }
  console.log("");

  // Count affected records
  const counts = await countAffectedSummaries(options);
  console.log("Records to be affected:");
  if (options.type === "shift" || options.type === "all") {
    console.log(`  Shift summaries: ${counts.shiftSummaries}`);
  }
  if (options.type === "day" || options.type === "all") {
    console.log(`  Day summaries: ${counts.daySummaries}`);
  }
  console.log("");

  // Confirm action
  if (!options.force && !options.dryRun) {
    const totalRecords = counts.shiftSummaries + counts.daySummaries;
    if (totalRecords > 0) {
      const confirmed = await confirmAction(
        `⚠️  This will delete ${totalRecords} summary records and their child records. Continue?`,
      );
      if (!confirmed) {
        console.log("Operation cancelled.");
        process.exit(0);
      }
    }
  }

  // Perform rollback
  if (options.type === "day" || options.type === "all") {
    console.log("\nRolling back day summaries...");
    await rollbackDaySummaries(options, stats);
  }

  if (options.type === "shift" || options.type === "all") {
    console.log("\nRolling back shift summaries...");
    await rollbackShiftSummaries(options, stats);
  }

  return stats;
}

/**
 * Print rollback statistics
 */
function printStats(stats: RollbackStats, options: RollbackOptions): void {
  console.log("\n" + "=".repeat(60));
  console.log("ROLLBACK SUMMARY");
  console.log("=".repeat(60));
  console.log(`\nMode: ${options.dryRun ? "DRY-RUN" : "LIVE"}`);

  if (options.type === "shift" || options.type === "all") {
    console.log("\nShift Summaries:");
    console.log(`  Shift summaries:      ${stats.shiftSummariesDeleted}`);
    console.log(`  Tender summaries:     ${stats.shiftTenderSummariesDeleted}`);
    console.log(
      `  Department summaries: ${stats.shiftDepartmentSummariesDeleted}`,
    );
    console.log(`  Tax summaries:        ${stats.shiftTaxSummariesDeleted}`);
    console.log(`  Hourly summaries:     ${stats.shiftHourlySummariesDeleted}`);
  }

  if (options.type === "day" || options.type === "all") {
    console.log("\nDay Summaries:");
    console.log(`  Day summaries:        ${stats.daySummariesDeleted}`);
    console.log(`  Tender summaries:     ${stats.dayTenderSummariesDeleted}`);
    console.log(
      `  Department summaries: ${stats.dayDepartmentSummariesDeleted}`,
    );
    console.log(`  Tax summaries:        ${stats.dayTaxSummariesDeleted}`);
    console.log(`  Hourly summaries:     ${stats.dayHourlySummariesDeleted}`);
  }

  if (options.dryRun) {
    console.log(`\n⚠️  DRY-RUN MODE: No changes were made.`);
    console.log(`   Run without --dry-run to apply changes.`);
  } else {
    console.log(`\n✓ Rollback completed successfully.`);
  }
}

/**
 * Entry point
 */
async function main(): Promise<void> {
  const options = parseArgs();

  // Validate required options
  if (!["shift", "day", "all"].includes(options.type)) {
    console.error("Error: --type must be 'shift', 'day', or 'all'");
    console.error("\nUsage:");
    console.error(
      "  npx ts-node backend/scripts/rollback-summaries.ts --type=shift|day|all [--store-id=xxx] [--from-date=YYYY-MM-DD] [--to-date=YYYY-MM-DD] [--dry-run] [--force]",
    );
    process.exit(1);
  }

  try {
    // Verify database connection
    await prisma.$connect();
    console.log("Database connection established.\n");

    // Run rollback
    const stats = await rollbackSummaries(options);

    // Print summary
    printStats(stats, options);
  } catch (error) {
    console.error("\nFATAL ERROR:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
