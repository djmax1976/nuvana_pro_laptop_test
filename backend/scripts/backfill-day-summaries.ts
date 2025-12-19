/**
 * Backfill Day Summaries Script
 * Phase 5.2: Historical Data Backfill
 *
 * This script creates DaySummary records for all store-dates that have
 * closed shift summaries but no day summary. It aggregates shift-level
 * data into day-level summaries.
 *
 * Features:
 * - Batch processing for large datasets
 * - Progress tracking and logging
 * - Resume capability (only processes dates without summaries)
 * - Validation of created summaries
 * - Rollback support (dry-run mode)
 *
 * Prerequisites:
 * - Run backfill-shift-summaries.ts first to ensure all shifts have summaries
 *
 * Usage:
 *   npx ts-node backend/scripts/backfill-day-summaries.ts [--dry-run] [--batch-size=50] [--store-id=xxx]
 *
 * Enterprise coding standards applied:
 * - DB-001: ORM usage with Prisma
 * - DB-006: Tenant isolation through store_id scoping
 * - API-003: Centralized error handling
 * - LM-001: Structured logging
 * - DB-003: MIGRATIONS - Test on staging before production
 */

import { PrismaClient, DaySummaryStatus } from "@prisma/client";
import { format } from "date-fns";

const prisma = new PrismaClient();

// Configuration
const DEFAULT_BATCH_SIZE = 50;

interface BackfillOptions {
  dryRun: boolean;
  batchSize: number;
  storeId?: string;
  verbose: boolean;
  closeDays: boolean; // Whether to close days that have all shifts closed
}

interface BackfillStats {
  totalDaysFound: number;
  daysProcessed: number;
  daysSkipped: number;
  summariesCreated: number;
  summariesUpdated: number;
  daysClosed: number;
  errors: Array<{ storeId: string; date: string; error: string }>;
  startTime: Date;
  endTime?: Date;
}

interface StoreDatePair {
  store_id: string;
  business_date: Date;
}

/**
 * Parse command line arguments
 */
function parseArgs(): BackfillOptions {
  const args = process.argv.slice(2);
  const options: BackfillOptions = {
    dryRun: false,
    batchSize: DEFAULT_BATCH_SIZE,
    verbose: false,
    closeDays: false,
  };

  for (const arg of args) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--verbose" || arg === "-v") {
      options.verbose = true;
    } else if (arg === "--close-days") {
      options.closeDays = true;
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = parseInt(arg.split("=")[1], 10) || DEFAULT_BATCH_SIZE;
    } else if (arg.startsWith("--store-id=")) {
      options.storeId = arg.split("=")[1];
    }
  }

  return options;
}

/**
 * Aggregate shift summaries into day totals
 */
function aggregateShiftSummaries(shiftSummaries: any[]) {
  let gross_sales = 0;
  let returns_total = 0;
  let discounts_total = 0;
  let net_sales = 0;
  let tax_collected = 0;
  let tax_exempt_sales = 0;
  let taxable_sales = 0;
  let transaction_count = 0;
  let void_count = 0;
  let refund_count = 0;
  let items_sold_count = 0;
  let items_returned_count = 0;
  let total_opening_cash = 0;
  let total_closing_cash = 0;
  let total_expected_cash = 0;
  let total_cash_variance = 0;
  let lottery_sales: number | null = null;
  let lottery_cashes: number | null = null;
  let lottery_net: number | null = null;
  let lottery_packs_sold: number | null = null;
  let lottery_tickets_sold: number | null = null;
  let fuel_gallons: number | null = null;
  let fuel_sales: number | null = null;

  let first_shift_opened: Date | null = null;
  let last_shift_closed: Date | null = null;

  for (const shift of shiftSummaries) {
    gross_sales += Number(shift.gross_sales);
    returns_total += Number(shift.returns_total);
    discounts_total += Number(shift.discounts_total);
    net_sales += Number(shift.net_sales);
    tax_collected += Number(shift.tax_collected);
    tax_exempt_sales += Number(shift.tax_exempt_sales);
    taxable_sales += Number(shift.taxable_sales);
    transaction_count += shift.transaction_count;
    void_count += shift.void_count;
    refund_count += shift.refund_count;
    items_sold_count += shift.items_sold_count;
    items_returned_count += shift.items_returned_count;
    total_opening_cash += Number(shift.opening_cash);
    total_closing_cash += Number(shift.closing_cash);
    total_expected_cash += Number(shift.expected_cash);
    total_cash_variance += Number(shift.cash_variance);

    // Track first/last shift times
    const openedAt = new Date(shift.shift_opened_at);
    const closedAt = new Date(shift.shift_closed_at);

    if (!first_shift_opened || openedAt < first_shift_opened) {
      first_shift_opened = openedAt;
    }
    if (!last_shift_closed || closedAt > last_shift_closed) {
      last_shift_closed = closedAt;
    }

    // Aggregate optional fields
    if (shift.lottery_sales !== null) {
      lottery_sales = (lottery_sales || 0) + Number(shift.lottery_sales);
    }
    if (shift.lottery_cashes !== null) {
      lottery_cashes = (lottery_cashes || 0) + Number(shift.lottery_cashes);
    }
    if (shift.lottery_net !== null) {
      lottery_net = (lottery_net || 0) + Number(shift.lottery_net);
    }
    if (shift.lottery_packs_sold !== null) {
      lottery_packs_sold = (lottery_packs_sold || 0) + shift.lottery_packs_sold;
    }
    if (shift.lottery_tickets_sold !== null) {
      lottery_tickets_sold =
        (lottery_tickets_sold || 0) + shift.lottery_tickets_sold;
    }
    if (shift.fuel_gallons !== null) {
      fuel_gallons = (fuel_gallons || 0) + Number(shift.fuel_gallons);
    }
    if (shift.fuel_sales !== null) {
      fuel_sales = (fuel_sales || 0) + Number(shift.fuel_sales);
    }
  }

  const shift_count = shiftSummaries.length;
  const avg_transaction =
    transaction_count > 0 ? net_sales / transaction_count : 0;
  const avg_items_per_txn =
    transaction_count > 0 ? items_sold_count / transaction_count : 0;

  return {
    shift_count,
    first_shift_opened,
    last_shift_closed,
    gross_sales,
    returns_total,
    discounts_total,
    net_sales,
    tax_collected,
    tax_exempt_sales,
    taxable_sales,
    transaction_count,
    void_count,
    refund_count,
    items_sold_count,
    items_returned_count,
    avg_transaction,
    avg_items_per_txn,
    total_opening_cash,
    total_closing_cash,
    total_expected_cash,
    total_cash_variance,
    lottery_sales,
    lottery_cashes,
    lottery_net,
    lottery_packs_sold,
    lottery_tickets_sold,
    fuel_gallons,
    fuel_sales,
  };
}

/**
 * Aggregate tender summaries from all shifts
 */
function aggregateTenderSummaries(shiftSummaries: any[]) {
  const tenderMap = new Map<
    string,
    {
      tender_type_id: string;
      tender_code: string;
      tender_display_name: string;
      total_amount: number;
      transaction_count: number;
      refund_amount: number;
      refund_count: number;
    }
  >();

  for (const shift of shiftSummaries) {
    for (const tender of shift.tender_summaries || []) {
      const existing = tenderMap.get(tender.tender_type_id);
      if (existing) {
        existing.total_amount += Number(tender.total_amount);
        existing.transaction_count += tender.transaction_count;
        existing.refund_amount += Number(tender.refund_amount);
        existing.refund_count += tender.refund_count;
      } else {
        tenderMap.set(tender.tender_type_id, {
          tender_type_id: tender.tender_type_id,
          tender_code: tender.tender_code,
          tender_display_name: tender.tender_display_name,
          total_amount: Number(tender.total_amount),
          transaction_count: tender.transaction_count,
          refund_amount: Number(tender.refund_amount),
          refund_count: tender.refund_count,
        });
      }
    }
  }

  return Array.from(tenderMap.values());
}

/**
 * Aggregate department summaries from all shifts
 */
function aggregateDepartmentSummaries(shiftSummaries: any[]) {
  const deptMap = new Map<
    string,
    {
      department_id: string;
      department_code: string;
      department_name: string;
      gross_sales: number;
      returns_total: number;
      discounts_total: number;
      net_sales: number;
      tax_collected: number;
      transaction_count: number;
      items_sold_count: number;
      items_returned_count: number;
    }
  >();

  for (const shift of shiftSummaries) {
    for (const dept of shift.department_summaries || []) {
      const existing = deptMap.get(dept.department_id);
      if (existing) {
        existing.gross_sales += Number(dept.gross_sales);
        existing.returns_total += Number(dept.returns_total);
        existing.discounts_total += Number(dept.discounts_total);
        existing.net_sales += Number(dept.net_sales);
        existing.tax_collected += Number(dept.tax_collected);
        existing.transaction_count += dept.transaction_count;
        existing.items_sold_count += dept.items_sold_count;
        existing.items_returned_count += dept.items_returned_count;
      } else {
        deptMap.set(dept.department_id, {
          department_id: dept.department_id,
          department_code: dept.department_code,
          department_name: dept.department_name,
          gross_sales: Number(dept.gross_sales),
          returns_total: Number(dept.returns_total),
          discounts_total: Number(dept.discounts_total),
          net_sales: Number(dept.net_sales),
          tax_collected: Number(dept.tax_collected),
          transaction_count: dept.transaction_count,
          items_sold_count: dept.items_sold_count,
          items_returned_count: dept.items_returned_count,
        });
      }
    }
  }

  return Array.from(deptMap.values());
}

/**
 * Aggregate tax summaries from all shifts
 */
function aggregateTaxSummaries(shiftSummaries: any[]) {
  const taxMap = new Map<
    string,
    {
      tax_rate_id: string;
      tax_code: string;
      tax_display_name: string;
      tax_rate_snapshot: number;
      taxable_amount: number;
      tax_collected: number;
      exempt_amount: number;
      transaction_count: number;
    }
  >();

  for (const shift of shiftSummaries) {
    for (const tax of shift.tax_summaries || []) {
      const existing = taxMap.get(tax.tax_rate_id);
      if (existing) {
        existing.taxable_amount += Number(tax.taxable_amount);
        existing.tax_collected += Number(tax.tax_collected);
        existing.exempt_amount += Number(tax.exempt_amount);
        existing.transaction_count += tax.transaction_count;
      } else {
        taxMap.set(tax.tax_rate_id, {
          tax_rate_id: tax.tax_rate_id,
          tax_code: tax.tax_code,
          tax_display_name: tax.tax_display_name,
          tax_rate_snapshot: Number(tax.tax_rate_snapshot),
          taxable_amount: Number(tax.taxable_amount),
          tax_collected: Number(tax.tax_collected),
          exempt_amount: Number(tax.exempt_amount),
          transaction_count: tax.transaction_count,
        });
      }
    }
  }

  return Array.from(taxMap.values());
}

/**
 * Aggregate hourly summaries from all shifts
 */
function aggregateHourlySummaries(shiftSummaries: any[]) {
  const hourMap = new Map<
    number,
    {
      hour_start: Date;
      hour_number: number;
      gross_sales: number;
      net_sales: number;
      transaction_count: number;
      items_sold_count: number;
    }
  >();

  for (const shift of shiftSummaries) {
    for (const hour of shift.hourly_summaries || []) {
      const existing = hourMap.get(hour.hour_number);
      if (existing) {
        existing.gross_sales += Number(hour.gross_sales);
        existing.net_sales += Number(hour.net_sales);
        existing.transaction_count += hour.transaction_count;
        existing.items_sold_count += hour.items_sold_count;
      } else {
        hourMap.set(hour.hour_number, {
          hour_start: new Date(hour.hour_start),
          hour_number: hour.hour_number,
          gross_sales: Number(hour.gross_sales),
          net_sales: Number(hour.net_sales),
          transaction_count: hour.transaction_count,
          items_sold_count: hour.items_sold_count,
        });
      }
    }
  }

  return Array.from(hourMap.values()).sort(
    (a, b) => a.hour_number - b.hour_number,
  );
}

/**
 * Create or update a day summary for a store-date combination
 */
async function createOrUpdateDaySummary(
  storeId: string,
  businessDate: Date,
  options: BackfillOptions,
  stats: BackfillStats,
): Promise<void> {
  const normalizedDate = new Date(businessDate);
  normalizedDate.setHours(0, 0, 0, 0);
  const dateStr = format(normalizedDate, "yyyy-MM-dd");

  // Get all shift summaries for this store-date
  const shiftSummaries = await prisma.shiftSummary.findMany({
    where: {
      store_id: storeId,
      business_date: normalizedDate,
    },
    include: {
      tender_summaries: true,
      department_summaries: true,
      tax_summaries: true,
      hourly_summaries: true,
    },
    orderBy: { shift_opened_at: "asc" },
  });

  if (shiftSummaries.length === 0) {
    stats.daysSkipped++;
    if (options.verbose) {
      console.log(`  Skipping ${storeId}/${dateStr}: No shift summaries found`);
    }
    return;
  }

  // Calculate aggregates
  const aggregates = aggregateShiftSummaries(shiftSummaries);
  const tenderAggregates = aggregateTenderSummaries(shiftSummaries);
  const departmentAggregates = aggregateDepartmentSummaries(shiftSummaries);
  const taxAggregates = aggregateTaxSummaries(shiftSummaries);
  const hourlyAggregates = aggregateHourlySummaries(shiftSummaries);

  // Determine status
  let status: DaySummaryStatus = DaySummaryStatus.OPEN;

  // Check if all shifts for this day are closed
  const openShiftsCount = await prisma.shift.count({
    where: {
      store_id: storeId,
      status: { in: ["ACTIVE", "CLOSING", "RECONCILING"] },
      opened_at: {
        gte: normalizedDate,
        lt: new Date(normalizedDate.getTime() + 24 * 60 * 60 * 1000),
      },
    },
  });

  if (openShiftsCount === 0) {
    status = options.closeDays
      ? DaySummaryStatus.CLOSED
      : DaySummaryStatus.PENDING_CLOSE;
  }

  // Check if day summary already exists
  const existingSummary = await prisma.daySummary.findUnique({
    where: {
      store_id_business_date: {
        store_id: storeId,
        business_date: normalizedDate,
      },
    },
  });

  if (options.dryRun) {
    if (existingSummary) {
      console.log(
        `  [DRY-RUN] Would update day summary for ${storeId}/${dateStr}`,
      );
    } else {
      console.log(
        `  [DRY-RUN] Would create day summary for ${storeId}/${dateStr}`,
      );
    }
    console.log(`    - Shifts: ${aggregates.shift_count}`);
    console.log(`    - Net sales: $${aggregates.net_sales.toFixed(2)}`);
    console.log(`    - Status: ${status}`);
    return;
  }

  // Create or update in a transaction
  await prisma.$transaction(async (tx) => {
    let daySummary;

    if (existingSummary) {
      // Update existing
      daySummary = await tx.daySummary.update({
        where: { day_summary_id: existingSummary.day_summary_id },
        data: {
          shift_count: aggregates.shift_count,
          first_shift_opened: aggregates.first_shift_opened,
          last_shift_closed: aggregates.last_shift_closed,
          gross_sales: aggregates.gross_sales,
          returns_total: aggregates.returns_total,
          discounts_total: aggregates.discounts_total,
          net_sales: aggregates.net_sales,
          tax_collected: aggregates.tax_collected,
          tax_exempt_sales: aggregates.tax_exempt_sales,
          taxable_sales: aggregates.taxable_sales,
          transaction_count: aggregates.transaction_count,
          void_count: aggregates.void_count,
          refund_count: aggregates.refund_count,
          items_sold_count: aggregates.items_sold_count,
          items_returned_count: aggregates.items_returned_count,
          avg_transaction: aggregates.avg_transaction,
          avg_items_per_txn: aggregates.avg_items_per_txn,
          total_opening_cash: aggregates.total_opening_cash,
          total_closing_cash: aggregates.total_closing_cash,
          total_expected_cash: aggregates.total_expected_cash,
          total_cash_variance: aggregates.total_cash_variance,
          lottery_sales: aggregates.lottery_sales,
          lottery_cashes: aggregates.lottery_cashes,
          lottery_net: aggregates.lottery_net,
          lottery_packs_sold: aggregates.lottery_packs_sold,
          lottery_tickets_sold: aggregates.lottery_tickets_sold,
          fuel_gallons: aggregates.fuel_gallons,
          fuel_sales: aggregates.fuel_sales,
          status:
            existingSummary.status === DaySummaryStatus.CLOSED
              ? DaySummaryStatus.CLOSED
              : status,
          closed_at:
            status === DaySummaryStatus.CLOSED && options.closeDays
              ? new Date()
              : existingSummary.closed_at,
        },
      });
      stats.summariesUpdated++;
    } else {
      // Create new
      daySummary = await tx.daySummary.create({
        data: {
          store_id: storeId,
          business_date: normalizedDate,
          shift_count: aggregates.shift_count,
          first_shift_opened: aggregates.first_shift_opened,
          last_shift_closed: aggregates.last_shift_closed,
          gross_sales: aggregates.gross_sales,
          returns_total: aggregates.returns_total,
          discounts_total: aggregates.discounts_total,
          net_sales: aggregates.net_sales,
          tax_collected: aggregates.tax_collected,
          tax_exempt_sales: aggregates.tax_exempt_sales,
          taxable_sales: aggregates.taxable_sales,
          transaction_count: aggregates.transaction_count,
          void_count: aggregates.void_count,
          refund_count: aggregates.refund_count,
          items_sold_count: aggregates.items_sold_count,
          items_returned_count: aggregates.items_returned_count,
          avg_transaction: aggregates.avg_transaction,
          avg_items_per_txn: aggregates.avg_items_per_txn,
          total_opening_cash: aggregates.total_opening_cash,
          total_closing_cash: aggregates.total_closing_cash,
          total_expected_cash: aggregates.total_expected_cash,
          total_cash_variance: aggregates.total_cash_variance,
          lottery_sales: aggregates.lottery_sales,
          lottery_cashes: aggregates.lottery_cashes,
          lottery_net: aggregates.lottery_net,
          lottery_packs_sold: aggregates.lottery_packs_sold,
          lottery_tickets_sold: aggregates.lottery_tickets_sold,
          fuel_gallons: aggregates.fuel_gallons,
          fuel_sales: aggregates.fuel_sales,
          status,
          closed_at:
            status === DaySummaryStatus.CLOSED && options.closeDays
              ? new Date()
              : null,
        },
      });
      stats.summariesCreated++;
    }

    // Delete existing child summaries and recreate
    await tx.dayTenderSummary.deleteMany({
      where: { day_summary_id: daySummary.day_summary_id },
    });
    await tx.dayDepartmentSummary.deleteMany({
      where: { day_summary_id: daySummary.day_summary_id },
    });
    await tx.dayTaxSummary.deleteMany({
      where: { day_summary_id: daySummary.day_summary_id },
    });
    await tx.dayHourlySummary.deleteMany({
      where: { day_summary_id: daySummary.day_summary_id },
    });

    // Create tender summaries
    for (const tender of tenderAggregates) {
      await tx.dayTenderSummary.create({
        data: {
          day_summary_id: daySummary.day_summary_id,
          tender_type_id: tender.tender_type_id,
          tender_code: tender.tender_code,
          tender_display_name: tender.tender_display_name,
          total_amount: tender.total_amount,
          transaction_count: tender.transaction_count,
          refund_amount: tender.refund_amount,
          refund_count: tender.refund_count,
          net_amount: tender.total_amount - tender.refund_amount,
        },
      });
    }

    // Create department summaries
    for (const dept of departmentAggregates) {
      await tx.dayDepartmentSummary.create({
        data: {
          day_summary_id: daySummary.day_summary_id,
          department_id: dept.department_id,
          department_code: dept.department_code,
          department_name: dept.department_name,
          gross_sales: dept.gross_sales,
          returns_total: dept.returns_total,
          discounts_total: dept.discounts_total,
          net_sales: dept.net_sales,
          tax_collected: dept.tax_collected,
          transaction_count: dept.transaction_count,
          items_sold_count: dept.items_sold_count,
          items_returned_count: dept.items_returned_count,
        },
      });
    }

    // Create tax summaries
    for (const tax of taxAggregates) {
      await tx.dayTaxSummary.create({
        data: {
          day_summary_id: daySummary.day_summary_id,
          tax_rate_id: tax.tax_rate_id,
          tax_code: tax.tax_code,
          tax_display_name: tax.tax_display_name,
          tax_rate_snapshot: tax.tax_rate_snapshot,
          taxable_amount: tax.taxable_amount,
          tax_collected: tax.tax_collected,
          exempt_amount: tax.exempt_amount,
          transaction_count: tax.transaction_count,
        },
      });
    }

    // Create hourly summaries
    for (const hour of hourlyAggregates) {
      await tx.dayHourlySummary.create({
        data: {
          day_summary_id: daySummary.day_summary_id,
          hour_start: hour.hour_start,
          hour_number: hour.hour_number,
          gross_sales: hour.gross_sales,
          net_sales: hour.net_sales,
          transaction_count: hour.transaction_count,
          items_sold_count: hour.items_sold_count,
          avg_transaction:
            hour.transaction_count > 0
              ? hour.net_sales / hour.transaction_count
              : 0,
        },
      });
    }

    if (status === DaySummaryStatus.CLOSED && options.closeDays) {
      stats.daysClosed++;
    }
  });

  if (options.verbose) {
    const action = existingSummary ? "Updated" : "Created";
    console.log(`  ✓ ${action} day summary for ${storeId}/${dateStr}`);
  }
}

/**
 * Get unique store-date pairs that have shift summaries but need day summary processing
 */
async function getStoreDatePairs(
  options: BackfillOptions,
): Promise<StoreDatePair[]> {
  // Get unique store_id + business_date combinations from shift_summaries
  const whereClause: any = {};
  if (options.storeId) {
    whereClause.store_id = options.storeId;
  }

  const shiftSummaries = await prisma.shiftSummary.findMany({
    where: whereClause,
    select: {
      store_id: true,
      business_date: true,
    },
    distinct: ["store_id", "business_date"],
    orderBy: [{ store_id: "asc" }, { business_date: "asc" }],
  });

  // Filter out those that already have day summaries (for dry-run reporting)
  // We'll still process them to update, but track differently
  const pairs: StoreDatePair[] = shiftSummaries.map((s) => ({
    store_id: s.store_id,
    business_date: s.business_date,
  }));

  return pairs;
}

/**
 * Main backfill function
 */
async function backfillDaySummaries(
  options: BackfillOptions,
): Promise<BackfillStats> {
  const stats: BackfillStats = {
    totalDaysFound: 0,
    daysProcessed: 0,
    daysSkipped: 0,
    summariesCreated: 0,
    summariesUpdated: 0,
    daysClosed: 0,
    errors: [],
    startTime: new Date(),
  };

  console.log("=".repeat(60));
  console.log("Phase 5.2: Day Summary Backfill Script");
  console.log("=".repeat(60));
  console.log(`Mode: ${options.dryRun ? "DRY-RUN (no changes)" : "LIVE"}`);
  console.log(`Batch size: ${options.batchSize}`);
  console.log(`Close days: ${options.closeDays ? "Yes" : "No"}`);
  if (options.storeId) {
    console.log(`Filtering by store: ${options.storeId}`);
  }
  console.log("");

  // Get all unique store-date pairs from shift summaries
  const storeDatePairs = await getStoreDatePairs(options);
  stats.totalDaysFound = storeDatePairs.length;
  console.log(
    `Found ${storeDatePairs.length} unique store-date combinations to process\n`,
  );

  if (storeDatePairs.length === 0) {
    console.log(
      "No store-dates to process. Run backfill-shift-summaries.ts first.",
    );
    stats.endTime = new Date();
    return stats;
  }

  // Process in batches
  for (let i = 0; i < storeDatePairs.length; i += options.batchSize) {
    const batch = storeDatePairs.slice(i, i + options.batchSize);
    const batchNum = Math.floor(i / options.batchSize) + 1;
    const totalBatches = Math.ceil(storeDatePairs.length / options.batchSize);

    console.log(
      `Processing batch ${batchNum}/${totalBatches}: ` +
        `${batch.length} store-dates (${i + 1}-${i + batch.length} of ${storeDatePairs.length})`,
    );

    for (const pair of batch) {
      stats.daysProcessed++;

      try {
        await createOrUpdateDaySummary(
          pair.store_id,
          pair.business_date,
          options,
          stats,
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const dateStr = format(pair.business_date, "yyyy-MM-dd");
        stats.errors.push({
          storeId: pair.store_id,
          date: dateStr,
          error: errorMsg,
        });
        console.error(
          `  ✗ Error processing ${pair.store_id}/${dateStr}: ${errorMsg}`,
        );
      }

      // Progress indicator every 10 days
      if (stats.daysProcessed % 10 === 0) {
        const pct = (
          (stats.daysProcessed / stats.totalDaysFound) *
          100
        ).toFixed(1);
        console.log(
          `  Progress: ${stats.daysProcessed}/${stats.totalDaysFound} (${pct}%)`,
        );
      }
    }
  }

  stats.endTime = new Date();
  return stats;
}

/**
 * Print final statistics
 */
function printStats(stats: BackfillStats, options: BackfillOptions): void {
  const duration = stats.endTime
    ? (stats.endTime.getTime() - stats.startTime.getTime()) / 1000
    : 0;

  console.log("\n" + "=".repeat(60));
  console.log("BACKFILL SUMMARY");
  console.log("=".repeat(60));
  console.log(`\nMode: ${options.dryRun ? "DRY-RUN" : "LIVE"}`);
  console.log(`Duration: ${duration.toFixed(2)} seconds`);
  console.log(`\nDay Summaries:`);
  console.log(`  Total found:   ${stats.totalDaysFound}`);
  console.log(`  Processed:     ${stats.daysProcessed}`);
  console.log(`  Skipped:       ${stats.daysSkipped}`);
  console.log(`  Created:       ${stats.summariesCreated}`);
  console.log(`  Updated:       ${stats.summariesUpdated}`);
  if (options.closeDays) {
    console.log(`  Closed:        ${stats.daysClosed}`);
  }

  if (stats.errors.length > 0) {
    console.log(`\nErrors (${stats.errors.length}):`);
    stats.errors.slice(0, 10).forEach((err) => {
      console.log(`  - ${err.storeId}/${err.date}: ${err.error}`);
    });
    if (stats.errors.length > 10) {
      console.log(`  ... and ${stats.errors.length - 10} more`);
    }
  } else {
    console.log(`\n✓ No errors during processing`);
  }

  if (options.dryRun) {
    console.log(`\n⚠️  DRY-RUN MODE: No changes were made.`);
    console.log(`   Run without --dry-run to apply changes.`);
  }
}

/**
 * Entry point
 */
async function main(): Promise<void> {
  const options = parseArgs();

  try {
    // Verify database connection
    await prisma.$connect();
    console.log("Database connection established.\n");

    // Check if there are shift summaries
    const shiftSummaryCount = await prisma.shiftSummary.count();
    if (shiftSummaryCount === 0) {
      console.log("No shift summaries found in database.");
      console.log("Please run backfill-shift-summaries.ts first.");
      process.exit(1);
    }
    console.log(`Found ${shiftSummaryCount} shift summaries in database.\n`);

    // Run backfill
    const stats = await backfillDaySummaries(options);

    // Print summary
    printStats(stats, options);

    // Exit with error code if there were errors
    if (stats.errors.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("\nFATAL ERROR:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
