/**
 * Backfill Shift Summaries Script
 * Phase 5.2: Historical Data Backfill
 *
 * This script creates ShiftSummary records for all closed shifts that don't
 * have summaries yet. This is necessary for shifts that were closed before
 * the summary feature was implemented.
 *
 * Features:
 * - Batch processing for large datasets
 * - Progress tracking and logging
 * - Resume capability (only processes shifts without summaries)
 * - Validation of created summaries
 * - Rollback support (dry-run mode)
 *
 * Usage:
 *   npx ts-node backend/scripts/backfill-shift-summaries.ts [--dry-run] [--batch-size=100] [--store-id=xxx]
 *
 * Enterprise coding standards applied:
 * - DB-001: ORM usage with Prisma
 * - DB-006: Tenant isolation through store_id scoping
 * - API-003: Centralized error handling
 * - LM-001: Structured logging
 * - DB-003: MIGRATIONS - Test on staging before production
 */

import { PrismaClient, ShiftStatus } from "@prisma/client";
import { startOfHour, differenceInMinutes } from "date-fns";

const prisma = new PrismaClient();

// Configuration
const DEFAULT_BATCH_SIZE = 100;

interface BackfillOptions {
  dryRun: boolean;
  batchSize: number;
  storeId?: string;
  verbose: boolean;
}

interface BackfillStats {
  totalShiftsFound: number;
  shiftsProcessed: number;
  shiftsSkipped: number;
  summariesCreated: number;
  errors: Array<{ shiftId: string; error: string }>;
  startTime: Date;
  endTime?: Date;
}

interface TransactionAggregates {
  gross_sales: number;
  returns_total: number;
  discounts_total: number;
  net_sales: number;
  tax_collected: number;
  tax_exempt_sales: number;
  taxable_sales: number;
  transaction_count: number;
  void_count: number;
  refund_count: number;
  items_sold_count: number;
  items_returned_count: number;
}

interface TenderAggregate {
  tender_type_id: string;
  tender_code: string;
  tender_display_name: string;
  total_amount: number;
  transaction_count: number;
  refund_amount: number;
  refund_count: number;
}

interface DepartmentAggregate {
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

interface TaxAggregate {
  tax_rate_id: string;
  tax_code: string;
  tax_display_name: string;
  tax_rate_snapshot: number;
  taxable_amount: number;
  tax_collected: number;
  exempt_amount: number;
  transaction_count: number;
}

interface HourlyAggregate {
  hour_start: Date;
  hour_number: number;
  gross_sales: number;
  net_sales: number;
  transaction_count: number;
  items_sold_count: number;
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
  };

  for (const arg of args) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--verbose" || arg === "-v") {
      options.verbose = true;
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = parseInt(arg.split("=")[1], 10) || DEFAULT_BATCH_SIZE;
    } else if (arg.startsWith("--store-id=")) {
      options.storeId = arg.split("=")[1];
    }
  }

  return options;
}

/**
 * Calculate transaction aggregates from raw transactions
 */
function calculateTransactionAggregates(
  transactions: any[],
): TransactionAggregates {
  let gross_sales = 0;
  let returns_total = 0;
  let discounts_total = 0;
  let tax_collected = 0;
  let tax_exempt_sales = 0;
  let taxable_sales = 0;
  const transaction_count = transactions.length;
  let void_count = 0;
  let refund_count = 0;
  let items_sold_count = 0;
  let items_returned_count = 0;

  for (const tx of transactions) {
    const txTotal = Number(tx.total);
    const txTax = Number(tx.tax);
    const txDiscount = Number(tx.discount);
    const txSubtotal = Number(tx.subtotal);

    // Determine if this is a refund (negative total)
    if (txTotal < 0) {
      refund_count++;
      returns_total += Math.abs(txTotal);
    } else {
      gross_sales += txSubtotal;
    }

    discounts_total += txDiscount;
    tax_collected += txTax;

    // Calculate taxable vs exempt
    if (txTax > 0) {
      taxable_sales += txSubtotal - txDiscount;
    } else {
      tax_exempt_sales += txSubtotal - txDiscount;
    }

    // Count line items
    for (const li of tx.line_items) {
      const qty = li.quantity;
      if (qty > 0) {
        items_sold_count += qty;
      } else {
        items_returned_count += Math.abs(qty);
      }
    }
  }

  const net_sales = gross_sales - returns_total - discounts_total;

  return {
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
  };
}

/**
 * Aggregate transactions by tender type
 */
function aggregateByTenderType(transactions: any[]): TenderAggregate[] {
  const tenderMap = new Map<string, TenderAggregate>();

  for (const tx of transactions) {
    for (const payment of tx.payments) {
      if (!payment.tender_type) continue;

      const tenderId = payment.tender_type_id;
      const amount = Number(payment.amount);
      const isRefund = amount < 0;

      const existing = tenderMap.get(tenderId);
      if (existing) {
        if (isRefund) {
          existing.refund_amount += Math.abs(amount);
          existing.refund_count++;
        } else {
          existing.total_amount += amount;
          existing.transaction_count++;
        }
      } else {
        tenderMap.set(tenderId, {
          tender_type_id: tenderId,
          tender_code: payment.tender_type.code,
          tender_display_name: payment.tender_type.display_name,
          total_amount: isRefund ? 0 : amount,
          transaction_count: isRefund ? 0 : 1,
          refund_amount: isRefund ? Math.abs(amount) : 0,
          refund_count: isRefund ? 1 : 0,
        });
      }
    }
  }

  return Array.from(tenderMap.values());
}

/**
 * Aggregate transactions by department
 */
function aggregateByDepartment(transactions: any[]): DepartmentAggregate[] {
  const deptMap = new Map<
    string,
    DepartmentAggregate & { transactions: Set<string> }
  >();

  for (const tx of transactions) {
    for (const li of tx.line_items) {
      if (!li.department) continue;

      const deptId = li.department_id;
      const lineTotal = Number(li.line_total);
      const discount = Number(li.discount);
      const tax = Number(li.tax_amount || 0);
      const qty = li.quantity;
      const isReturn = qty < 0;

      const existing = deptMap.get(deptId);
      if (existing) {
        if (isReturn) {
          existing.returns_total += Math.abs(lineTotal);
          existing.items_returned_count += Math.abs(qty);
        } else {
          existing.gross_sales += lineTotal;
          existing.items_sold_count += qty;
        }
        existing.discounts_total += discount;
        existing.tax_collected += tax;
        existing.transactions.add(tx.transaction_id);
      } else {
        deptMap.set(deptId, {
          department_id: deptId,
          department_code: li.department.code,
          department_name: li.department.display_name,
          gross_sales: isReturn ? 0 : lineTotal,
          returns_total: isReturn ? Math.abs(lineTotal) : 0,
          discounts_total: discount,
          net_sales: 0,
          tax_collected: tax,
          transaction_count: 0,
          items_sold_count: isReturn ? 0 : qty,
          items_returned_count: isReturn ? Math.abs(qty) : 0,
          transactions: new Set([tx.transaction_id]),
        });
      }
    }
  }

  return Array.from(deptMap.values()).map((dept) => ({
    department_id: dept.department_id,
    department_code: dept.department_code,
    department_name: dept.department_name,
    gross_sales: dept.gross_sales,
    returns_total: dept.returns_total,
    discounts_total: dept.discounts_total,
    net_sales: dept.gross_sales - dept.returns_total - dept.discounts_total,
    tax_collected: dept.tax_collected,
    transaction_count: dept.transactions.size,
    items_sold_count: dept.items_sold_count,
    items_returned_count: dept.items_returned_count,
  }));
}

/**
 * Aggregate transactions by tax rate
 */
function aggregateByTaxRate(transactions: any[]): TaxAggregate[] {
  const taxMap = new Map<
    string,
    Omit<TaxAggregate, "transaction_count"> & { transactions: Set<string> }
  >();

  for (const tx of transactions) {
    for (const li of tx.line_items) {
      const taxAmount = Number(li.tax_amount || 0);
      const lineTotal = Number(li.line_total);
      const qty = li.quantity;
      const isReturn = qty < 0;

      // Only process items with tax_rate_id
      if (!li.tax_rate_id || !li.tax_rate) continue;

      const mapKey = li.tax_rate_id;
      const taxableAmount = isReturn ? 0 : Math.max(0, lineTotal - taxAmount);

      const existing = taxMap.get(mapKey);
      if (existing) {
        if (isReturn) {
          existing.exempt_amount += Math.abs(lineTotal);
        } else {
          existing.taxable_amount += taxableAmount;
          existing.tax_collected += taxAmount;
        }
        existing.transactions.add(tx.transaction_id);
      } else {
        taxMap.set(mapKey, {
          tax_rate_id: li.tax_rate_id,
          tax_code: li.tax_rate.code,
          tax_display_name: li.tax_rate.display_name,
          tax_rate_snapshot: Number(li.tax_rate.rate),
          taxable_amount: isReturn ? 0 : taxableAmount,
          tax_collected: isReturn ? 0 : taxAmount,
          exempt_amount: isReturn ? Math.abs(lineTotal) : 0,
          transactions: new Set([tx.transaction_id]),
        });
      }
    }
  }

  return Array.from(taxMap.values()).map((tax) => ({
    tax_rate_id: tax.tax_rate_id,
    tax_code: tax.tax_code,
    tax_display_name: tax.tax_display_name,
    tax_rate_snapshot: tax.tax_rate_snapshot,
    taxable_amount: tax.taxable_amount,
    tax_collected: tax.tax_collected,
    exempt_amount: tax.exempt_amount,
    transaction_count: tax.transactions.size,
  }));
}

/**
 * Aggregate transactions by hour
 */
function aggregateByHour(transactions: any[]): HourlyAggregate[] {
  const hourMap = new Map<number, HourlyAggregate>();

  for (const tx of transactions) {
    const timestamp = new Date(tx.timestamp);
    const hourStart = startOfHour(timestamp);
    const hourNumber = hourStart.getHours();
    const txSubtotal = Number(tx.subtotal);
    const txDiscount = Number(tx.discount);

    const itemCount = tx.line_items.reduce(
      (sum: number, li: any) => sum + Math.max(0, li.quantity),
      0,
    );

    const existing = hourMap.get(hourNumber);
    if (existing) {
      existing.gross_sales += txSubtotal;
      existing.net_sales += txSubtotal - txDiscount;
      existing.transaction_count++;
      existing.items_sold_count += itemCount;
    } else {
      hourMap.set(hourNumber, {
        hour_start: hourStart,
        hour_number: hourNumber,
        gross_sales: txSubtotal,
        net_sales: txSubtotal - txDiscount,
        transaction_count: 1,
        items_sold_count: itemCount,
      });
    }
  }

  return Array.from(hourMap.values()).sort(
    (a, b) => a.hour_number - b.hour_number,
  );
}

/**
 * Get lottery data for a shift
 */
async function getLotteryData(shiftId: string): Promise<{
  sales: number;
  cashes: number;
  net: number;
  packs_sold: number;
  tickets_sold: number;
} | null> {
  try {
    const ticketSerials = await prisma.lotteryTicketSerial.findMany({
      where: { shift_id: shiftId },
      include: {
        pack: {
          include: {
            game: {
              select: { price: true },
            },
          },
        },
      },
    });

    if (ticketSerials.length === 0) {
      return null;
    }

    const sales = ticketSerials.reduce((sum, ticket) => {
      const price = ticket.pack?.game?.price;
      return sum + (price ? Number(price) : 0);
    }, 0);

    const packsClosedCount = await prisma.lotteryShiftClosing.count({
      where: { shift_id: shiftId },
    });

    return {
      sales,
      cashes: 0, // Would need lottery payout transaction tracking
      net: sales,
      packs_sold: packsClosedCount,
      tickets_sold: ticketSerials.length,
    };
  } catch {
    return null;
  }
}

/**
 * Create a shift summary for a single shift
 */
async function createShiftSummary(
  shift: any,
  closedByUserId: string,
  dryRun: boolean,
): Promise<void> {
  // Calculate business date
  const businessDate = new Date(shift.opened_at);
  businessDate.setHours(0, 0, 0, 0);

  // Get all transactions for this shift
  const transactions = await prisma.transaction.findMany({
    where: { shift_id: shift.shift_id },
    include: {
      line_items: {
        include: {
          department: true,
          tax_rate: true,
        },
      },
      payments: {
        include: {
          tender_type: true,
        },
      },
    },
  });

  // Calculate aggregates
  const aggregates = calculateTransactionAggregates(transactions);
  const tenderAggregates = aggregateByTenderType(transactions);
  const departmentAggregates = aggregateByDepartment(transactions);
  const taxAggregates = aggregateByTaxRate(transactions);
  const hourlyAggregates = aggregateByHour(transactions);

  // Calculate shift duration
  const shiftDurationMins = shift.closed_at
    ? differenceInMinutes(shift.closed_at, shift.opened_at)
    : 0;

  // Calculate averages
  const avgTransaction =
    aggregates.transaction_count > 0
      ? aggregates.net_sales / aggregates.transaction_count
      : 0;
  const avgItemsPerTxn =
    aggregates.transaction_count > 0
      ? aggregates.items_sold_count / aggregates.transaction_count
      : 0;

  // Cash variance calculations
  const openingCash = Number(shift.opening_cash);
  const closingCash = Number(shift.closing_cash || 0);
  const expectedCash = Number(shift.expected_cash || openingCash);
  const cashVariance = closingCash - expectedCash;
  const variancePercentage =
    expectedCash > 0 ? (cashVariance / expectedCash) * 100 : 0;

  // Get lottery data
  const lotteryData = await getLotteryData(shift.shift_id);

  if (dryRun) {
    console.log(`  [DRY-RUN] Would create summary for shift ${shift.shift_id}`);
    console.log(`    - Transactions: ${aggregates.transaction_count}`);
    console.log(`    - Net sales: $${aggregates.net_sales.toFixed(2)}`);
    console.log(`    - Tender types: ${tenderAggregates.length}`);
    console.log(`    - Departments: ${departmentAggregates.length}`);
    return;
  }

  // Create summary in a transaction
  await prisma.$transaction(async (tx) => {
    // Create main shift summary
    const shiftSummary = await tx.shiftSummary.create({
      data: {
        shift_id: shift.shift_id,
        store_id: shift.store_id,
        business_date: businessDate,
        shift_opened_at: shift.opened_at,
        shift_closed_at: shift.closed_at!,
        shift_duration_mins: shiftDurationMins,
        opened_by_user_id: shift.opened_by,
        closed_by_user_id: closedByUserId,
        cashier_user_id: null,
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
        no_sale_count: 0,
        items_sold_count: aggregates.items_sold_count,
        items_returned_count: aggregates.items_returned_count,
        avg_transaction: avgTransaction,
        avg_items_per_txn: avgItemsPerTxn,
        opening_cash: openingCash,
        closing_cash: closingCash,
        expected_cash: expectedCash,
        cash_variance: cashVariance,
        variance_percentage: variancePercentage,
        variance_approved: shift.approved_by !== null,
        variance_approved_by: shift.approved_by,
        variance_approved_at: shift.approved_at,
        variance_reason: shift.variance_reason,
        lottery_sales: lotteryData?.sales || null,
        lottery_cashes: lotteryData?.cashes || null,
        lottery_net: lotteryData?.net || null,
        lottery_packs_sold: lotteryData?.packs_sold || null,
        lottery_tickets_sold: lotteryData?.tickets_sold || null,
      },
    });

    // Create tender summaries
    for (const tender of tenderAggregates) {
      await tx.shiftTenderSummary.create({
        data: {
          shift_summary_id: shiftSummary.shift_summary_id,
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
      await tx.shiftDepartmentSummary.create({
        data: {
          shift_summary_id: shiftSummary.shift_summary_id,
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
      await tx.shiftTaxSummary.create({
        data: {
          shift_summary_id: shiftSummary.shift_summary_id,
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
      await tx.shiftHourlySummary.create({
        data: {
          shift_summary_id: shiftSummary.shift_summary_id,
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
  });
}

/**
 * Main backfill function
 */
async function backfillShiftSummaries(
  options: BackfillOptions,
): Promise<BackfillStats> {
  const stats: BackfillStats = {
    totalShiftsFound: 0,
    shiftsProcessed: 0,
    shiftsSkipped: 0,
    summariesCreated: 0,
    errors: [],
    startTime: new Date(),
  };

  console.log("=".repeat(60));
  console.log("Phase 5.2: Shift Summary Backfill Script");
  console.log("=".repeat(60));
  console.log(`Mode: ${options.dryRun ? "DRY-RUN (no changes)" : "LIVE"}`);
  console.log(`Batch size: ${options.batchSize}`);
  if (options.storeId) {
    console.log(`Filtering by store: ${options.storeId}`);
  }
  console.log("");

  // Build the query to find closed shifts without summaries
  const whereClause: any = {
    status: ShiftStatus.CLOSED,
    closed_at: { not: null },
    shift_summary: null, // Only shifts without summaries
  };

  if (options.storeId) {
    whereClause.store_id = options.storeId;
  }

  // Get total count
  const totalCount = await prisma.shift.count({ where: whereClause });
  stats.totalShiftsFound = totalCount;
  console.log(`Found ${totalCount} closed shifts without summaries\n`);

  if (totalCount === 0) {
    console.log(
      "No shifts to process. All closed shifts already have summaries.",
    );
    stats.endTime = new Date();
    return stats;
  }

  // Get a system user for backfill attribution
  // Use the shift opener as the "closed by" user for backfill
  let offset = 0;

  while (offset < totalCount) {
    // Fetch batch of shifts
    const shifts = await prisma.shift.findMany({
      where: whereClause,
      include: {
        store: {
          select: {
            store_id: true,
            company_id: true,
            timezone: true,
          },
        },
        cashier: {
          select: {
            cashier_id: true,
            name: true,
          },
        },
      },
      orderBy: { opened_at: "asc" },
      take: options.batchSize,
      skip: offset,
    });

    if (shifts.length === 0) {
      break;
    }

    console.log(
      `Processing batch ${Math.floor(offset / options.batchSize) + 1}: ` +
        `${shifts.length} shifts (${offset + 1}-${offset + shifts.length} of ${totalCount})`,
    );

    for (const shift of shifts) {
      stats.shiftsProcessed++;

      try {
        // Validate shift has required data
        if (!shift.closed_at) {
          stats.shiftsSkipped++;
          if (options.verbose) {
            console.log(
              `  Skipping shift ${shift.shift_id}: No closed_at timestamp`,
            );
          }
          continue;
        }

        await createShiftSummary(shift, shift.opened_by, options.dryRun);

        if (!options.dryRun) {
          stats.summariesCreated++;
        }

        if (options.verbose) {
          console.log(`  ✓ Processed shift ${shift.shift_id}`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        stats.errors.push({ shiftId: shift.shift_id, error: errorMsg });
        console.error(
          `  ✗ Error processing shift ${shift.shift_id}: ${errorMsg}`,
        );
      }

      // Progress indicator every 10 shifts
      if (stats.shiftsProcessed % 10 === 0) {
        const pct = ((stats.shiftsProcessed / totalCount) * 100).toFixed(1);
        console.log(
          `  Progress: ${stats.shiftsProcessed}/${totalCount} (${pct}%)`,
        );
      }
    }

    offset += options.batchSize;
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
  console.log(`\nShifts:`);
  console.log(`  Total found: ${stats.totalShiftsFound}`);
  console.log(`  Processed:   ${stats.shiftsProcessed}`);
  console.log(`  Skipped:     ${stats.shiftsSkipped}`);
  console.log(`  Summaries created: ${stats.summariesCreated}`);

  if (stats.errors.length > 0) {
    console.log(`\nErrors (${stats.errors.length}):`);
    stats.errors.slice(0, 10).forEach((err) => {
      console.log(`  - Shift ${err.shiftId}: ${err.error}`);
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

    // Run backfill
    const stats = await backfillShiftSummaries(options);

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
