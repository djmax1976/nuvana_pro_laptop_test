/**
 * Validate Summaries Script
 * Phase 5.3: Validation & Reconciliation
 *
 * This script validates that shift and day summaries match their source data
 * (transactions for shifts, shift summaries for days). It identifies
 * discrepancies that may indicate data integrity issues.
 *
 * Features:
 * - Validates shift summaries against transaction aggregates
 * - Validates day summaries against shift summary aggregates
 * - Identifies orphaned summaries (summaries without source data)
 * - Reports discrepancies with detailed diff information
 * - Generates JSON report for analysis
 *
 * Usage:
 *   npx ts-node backend/scripts/validate-summaries.ts [--store-id=xxx] [--date=YYYY-MM-DD] [--output=report.json]
 *
 * Enterprise coding standards applied:
 * - DB-001: ORM usage with Prisma
 * - DB-006: Tenant isolation through store_id scoping
 * - API-003: Centralized error handling
 * - LM-001: Structured logging
 */

import { PrismaClient } from "@prisma/client";
import { format } from "date-fns";
import * as fs from "fs";

const prisma = new PrismaClient();

// Tolerance for floating-point comparisons (0.01 = 1 cent)
const TOLERANCE = 0.01;

interface ValidationOptions {
  storeId?: string;
  date?: string;
  outputFile?: string;
  verbose: boolean;
}

interface ShiftDiscrepancy {
  shift_id: string;
  shift_summary_id: string;
  store_id: string;
  business_date: string;
  field: string;
  summary_value: number;
  calculated_value: number;
  difference: number;
}

interface DayDiscrepancy {
  day_summary_id: string;
  store_id: string;
  business_date: string;
  field: string;
  summary_value: number;
  calculated_value: number;
  difference: number;
}

interface ValidationReport {
  timestamp: string;
  options: ValidationOptions;
  summary: {
    shiftsValidated: number;
    shiftsWithDiscrepancies: number;
    daysValidated: number;
    daysWithDiscrepancies: number;
    orphanedShiftSummaries: number;
    orphanedDaySummaries: number;
    shiftsWithoutSummaries: number;
  };
  shiftDiscrepancies: ShiftDiscrepancy[];
  dayDiscrepancies: DayDiscrepancy[];
  orphanedShiftSummaries: string[];
  orphanedDaySummaries: string[];
  shiftsWithoutSummaries: string[];
}

/**
 * Parse command line arguments
 */
function parseArgs(): ValidationOptions {
  const args = process.argv.slice(2);
  const options: ValidationOptions = {
    verbose: false,
  };

  for (const arg of args) {
    if (arg === "--verbose" || arg === "-v") {
      options.verbose = true;
    } else if (arg.startsWith("--store-id=")) {
      options.storeId = arg.split("=")[1];
    } else if (arg.startsWith("--date=")) {
      options.date = arg.split("=")[1];
    } else if (arg.startsWith("--output=")) {
      options.outputFile = arg.split("=")[1];
    }
  }

  return options;
}

/**
 * Check if two numbers are approximately equal within tolerance
 */
function isClose(a: number, b: number, tolerance: number = TOLERANCE): boolean {
  return Math.abs(a - b) <= tolerance;
}

/**
 * Calculate transaction aggregates for a shift
 */
async function calculateShiftAggregates(
  shiftId: string,
): Promise<Record<string, number>> {
  const transactions = await prisma.transaction.findMany({
    where: { shift_id: shiftId },
    include: {
      line_items: true,
      payments: true,
    },
  });

  let gross_sales = 0;
  let returns_total = 0;
  let discounts_total = 0;
  let tax_collected = 0;
  let transaction_count = transactions.length;
  let refund_count = 0;
  let items_sold_count = 0;
  let items_returned_count = 0;

  for (const tx of transactions) {
    const txTotal = Number(tx.total);
    const txTax = Number(tx.tax);
    const txDiscount = Number(tx.discount);
    const txSubtotal = Number(tx.subtotal);

    if (txTotal < 0) {
      refund_count++;
      returns_total += Math.abs(txTotal);
    } else {
      gross_sales += txSubtotal;
    }

    discounts_total += txDiscount;
    tax_collected += txTax;

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
    transaction_count,
    refund_count,
    items_sold_count,
    items_returned_count,
  };
}

/**
 * Calculate day aggregates from shift summaries
 */
async function calculateDayAggregates(
  storeId: string,
  businessDate: Date,
): Promise<Record<string, number>> {
  const shiftSummaries = await prisma.shiftSummary.findMany({
    where: {
      store_id: storeId,
      business_date: businessDate,
    },
  });

  let gross_sales = 0;
  let returns_total = 0;
  let discounts_total = 0;
  let net_sales = 0;
  let tax_collected = 0;
  let transaction_count = 0;
  let refund_count = 0;
  let items_sold_count = 0;
  let items_returned_count = 0;
  let shift_count = shiftSummaries.length;

  for (const shift of shiftSummaries) {
    gross_sales += Number(shift.gross_sales);
    returns_total += Number(shift.returns_total);
    discounts_total += Number(shift.discounts_total);
    net_sales += Number(shift.net_sales);
    tax_collected += Number(shift.tax_collected);
    transaction_count += shift.transaction_count;
    refund_count += shift.refund_count;
    items_sold_count += shift.items_sold_count;
    items_returned_count += shift.items_returned_count;
  }

  return {
    shift_count,
    gross_sales,
    returns_total,
    discounts_total,
    net_sales,
    tax_collected,
    transaction_count,
    refund_count,
    items_sold_count,
    items_returned_count,
  };
}

/**
 * Validate a single shift summary against its transactions
 */
async function validateShiftSummary(
  summary: any,
  options: ValidationOptions,
): Promise<ShiftDiscrepancy[]> {
  const discrepancies: ShiftDiscrepancy[] = [];

  const calculated = await calculateShiftAggregates(summary.shift_id);

  const fieldsToCheck: Array<{ field: string; summaryKey: string }> = [
    { field: "gross_sales", summaryKey: "gross_sales" },
    { field: "returns_total", summaryKey: "returns_total" },
    { field: "discounts_total", summaryKey: "discounts_total" },
    { field: "net_sales", summaryKey: "net_sales" },
    { field: "tax_collected", summaryKey: "tax_collected" },
    { field: "transaction_count", summaryKey: "transaction_count" },
    { field: "refund_count", summaryKey: "refund_count" },
    { field: "items_sold_count", summaryKey: "items_sold_count" },
    { field: "items_returned_count", summaryKey: "items_returned_count" },
  ];

  for (const { field, summaryKey } of fieldsToCheck) {
    const summaryValue = Number(summary[summaryKey]);
    const calculatedValue = calculated[field];

    if (!isClose(summaryValue, calculatedValue)) {
      discrepancies.push({
        shift_id: summary.shift_id,
        shift_summary_id: summary.shift_summary_id,
        store_id: summary.store_id,
        business_date: format(summary.business_date, "yyyy-MM-dd"),
        field,
        summary_value: summaryValue,
        calculated_value: calculatedValue,
        difference: summaryValue - calculatedValue,
      });

      if (options.verbose) {
        console.log(
          `  ⚠ Discrepancy in shift ${summary.shift_id}: ${field} ` +
            `(summary: ${summaryValue.toFixed(2)}, calculated: ${calculatedValue.toFixed(2)})`,
        );
      }
    }
  }

  return discrepancies;
}

/**
 * Validate a single day summary against its shift summaries
 */
async function validateDaySummary(
  summary: any,
  options: ValidationOptions,
): Promise<DayDiscrepancy[]> {
  const discrepancies: DayDiscrepancy[] = [];

  const calculated = await calculateDayAggregates(
    summary.store_id,
    summary.business_date,
  );

  const fieldsToCheck: Array<{ field: string; summaryKey: string }> = [
    { field: "shift_count", summaryKey: "shift_count" },
    { field: "gross_sales", summaryKey: "gross_sales" },
    { field: "returns_total", summaryKey: "returns_total" },
    { field: "discounts_total", summaryKey: "discounts_total" },
    { field: "net_sales", summaryKey: "net_sales" },
    { field: "tax_collected", summaryKey: "tax_collected" },
    { field: "transaction_count", summaryKey: "transaction_count" },
    { field: "refund_count", summaryKey: "refund_count" },
    { field: "items_sold_count", summaryKey: "items_sold_count" },
    { field: "items_returned_count", summaryKey: "items_returned_count" },
  ];

  for (const { field, summaryKey } of fieldsToCheck) {
    const summaryValue = Number(summary[summaryKey]);
    const calculatedValue = calculated[field];

    if (!isClose(summaryValue, calculatedValue)) {
      discrepancies.push({
        day_summary_id: summary.day_summary_id,
        store_id: summary.store_id,
        business_date: format(summary.business_date, "yyyy-MM-dd"),
        field,
        summary_value: summaryValue,
        calculated_value: calculatedValue,
        difference: summaryValue - calculatedValue,
      });

      if (options.verbose) {
        const dateStr = format(summary.business_date, "yyyy-MM-dd");
        console.log(
          `  ⚠ Discrepancy in day ${summary.store_id}/${dateStr}: ${field} ` +
            `(summary: ${summaryValue.toFixed(2)}, calculated: ${calculatedValue.toFixed(2)})`,
        );
      }
    }
  }

  return discrepancies;
}

/**
 * Find orphaned shift summaries (summaries without corresponding shifts)
 */
async function findOrphanedShiftSummaries(
  options: ValidationOptions,
): Promise<string[]> {
  const whereClause: any = {};
  if (options.storeId) {
    whereClause.store_id = options.storeId;
  }

  const shiftSummaries = await prisma.shiftSummary.findMany({
    where: whereClause,
    select: {
      shift_summary_id: true,
      shift_id: true,
    },
  });

  const orphaned: string[] = [];

  for (const summary of shiftSummaries) {
    const shift = await prisma.shift.findUnique({
      where: { shift_id: summary.shift_id },
      select: { shift_id: true },
    });

    if (!shift) {
      orphaned.push(summary.shift_summary_id);
    }
  }

  return orphaned;
}

/**
 * Find orphaned day summaries (summaries without any shift summaries)
 */
async function findOrphanedDaySummaries(
  options: ValidationOptions,
): Promise<string[]> {
  const whereClause: any = {};
  if (options.storeId) {
    whereClause.store_id = options.storeId;
  }

  const daySummaries = await prisma.daySummary.findMany({
    where: whereClause,
    select: {
      day_summary_id: true,
      store_id: true,
      business_date: true,
    },
  });

  const orphaned: string[] = [];

  for (const summary of daySummaries) {
    const shiftCount = await prisma.shiftSummary.count({
      where: {
        store_id: summary.store_id,
        business_date: summary.business_date,
      },
    });

    if (shiftCount === 0) {
      orphaned.push(summary.day_summary_id);
    }
  }

  return orphaned;
}

/**
 * Find closed shifts without summaries
 */
async function findShiftsWithoutSummaries(
  options: ValidationOptions,
): Promise<string[]> {
  const whereClause: any = {
    status: "CLOSED",
    closed_at: { not: null },
    shift_summary: null,
  };

  if (options.storeId) {
    whereClause.store_id = options.storeId;
  }

  const shifts = await prisma.shift.findMany({
    where: whereClause,
    select: { shift_id: true },
  });

  return shifts.map((s) => s.shift_id);
}

/**
 * Main validation function
 */
async function validateSummaries(
  options: ValidationOptions,
): Promise<ValidationReport> {
  console.log("=".repeat(60));
  console.log("Phase 5.3: Summary Validation Script");
  console.log("=".repeat(60));
  if (options.storeId) {
    console.log(`Filtering by store: ${options.storeId}`);
  }
  if (options.date) {
    console.log(`Filtering by date: ${options.date}`);
  }
  console.log("");

  const report: ValidationReport = {
    timestamp: new Date().toISOString(),
    options,
    summary: {
      shiftsValidated: 0,
      shiftsWithDiscrepancies: 0,
      daysValidated: 0,
      daysWithDiscrepancies: 0,
      orphanedShiftSummaries: 0,
      orphanedDaySummaries: 0,
      shiftsWithoutSummaries: 0,
    },
    shiftDiscrepancies: [],
    dayDiscrepancies: [],
    orphanedShiftSummaries: [],
    orphanedDaySummaries: [],
    shiftsWithoutSummaries: [],
  };

  // Build where clause
  const shiftWhereClause: any = {};
  const dayWhereClause: any = {};

  if (options.storeId) {
    shiftWhereClause.store_id = options.storeId;
    dayWhereClause.store_id = options.storeId;
  }

  if (options.date) {
    const targetDate = new Date(options.date);
    targetDate.setHours(0, 0, 0, 0);
    shiftWhereClause.business_date = targetDate;
    dayWhereClause.business_date = targetDate;
  }

  // 1. Validate shift summaries
  console.log("Validating shift summaries...");
  const shiftSummaries = await prisma.shiftSummary.findMany({
    where: shiftWhereClause,
  });
  report.summary.shiftsValidated = shiftSummaries.length;

  const shiftsWithDiscrepancies = new Set<string>();
  for (const summary of shiftSummaries) {
    const discrepancies = await validateShiftSummary(summary, options);
    if (discrepancies.length > 0) {
      shiftsWithDiscrepancies.add(summary.shift_summary_id);
      report.shiftDiscrepancies.push(...discrepancies);
    }
  }
  report.summary.shiftsWithDiscrepancies = shiftsWithDiscrepancies.size;
  console.log(
    `  ✓ Validated ${shiftSummaries.length} shift summaries, ` +
      `${shiftsWithDiscrepancies.size} with discrepancies`,
  );

  // 2. Validate day summaries
  console.log("\nValidating day summaries...");
  const daySummaries = await prisma.daySummary.findMany({
    where: dayWhereClause,
  });
  report.summary.daysValidated = daySummaries.length;

  const daysWithDiscrepancies = new Set<string>();
  for (const summary of daySummaries) {
    const discrepancies = await validateDaySummary(summary, options);
    if (discrepancies.length > 0) {
      daysWithDiscrepancies.add(summary.day_summary_id);
      report.dayDiscrepancies.push(...discrepancies);
    }
  }
  report.summary.daysWithDiscrepancies = daysWithDiscrepancies.size;
  console.log(
    `  ✓ Validated ${daySummaries.length} day summaries, ` +
      `${daysWithDiscrepancies.size} with discrepancies`,
  );

  // 3. Find orphaned shift summaries
  console.log("\nChecking for orphaned shift summaries...");
  report.orphanedShiftSummaries = await findOrphanedShiftSummaries(options);
  report.summary.orphanedShiftSummaries = report.orphanedShiftSummaries.length;
  console.log(
    `  ✓ Found ${report.orphanedShiftSummaries.length} orphaned shift summaries`,
  );

  // 4. Find orphaned day summaries
  console.log("\nChecking for orphaned day summaries...");
  report.orphanedDaySummaries = await findOrphanedDaySummaries(options);
  report.summary.orphanedDaySummaries = report.orphanedDaySummaries.length;
  console.log(
    `  ✓ Found ${report.orphanedDaySummaries.length} orphaned day summaries`,
  );

  // 5. Find shifts without summaries
  console.log("\nChecking for shifts without summaries...");
  report.shiftsWithoutSummaries = await findShiftsWithoutSummaries(options);
  report.summary.shiftsWithoutSummaries = report.shiftsWithoutSummaries.length;
  console.log(
    `  ✓ Found ${report.shiftsWithoutSummaries.length} closed shifts without summaries`,
  );

  return report;
}

/**
 * Print validation report
 */
function printReport(report: ValidationReport): void {
  console.log("\n" + "=".repeat(60));
  console.log("VALIDATION SUMMARY");
  console.log("=".repeat(60));

  console.log("\nShift Summaries:");
  console.log(`  Validated:       ${report.summary.shiftsValidated}`);
  console.log(`  With issues:     ${report.summary.shiftsWithDiscrepancies}`);
  console.log(`  Orphaned:        ${report.summary.orphanedShiftSummaries}`);
  console.log(`  Missing:         ${report.summary.shiftsWithoutSummaries}`);

  console.log("\nDay Summaries:");
  console.log(`  Validated:       ${report.summary.daysValidated}`);
  console.log(`  With issues:     ${report.summary.daysWithDiscrepancies}`);
  console.log(`  Orphaned:        ${report.summary.orphanedDaySummaries}`);

  // Overall status
  const hasIssues =
    report.summary.shiftsWithDiscrepancies > 0 ||
    report.summary.daysWithDiscrepancies > 0 ||
    report.summary.orphanedShiftSummaries > 0 ||
    report.summary.orphanedDaySummaries > 0 ||
    report.summary.shiftsWithoutSummaries > 0;

  if (hasIssues) {
    console.log("\n⚠️  VALIDATION FOUND ISSUES:");

    if (report.shiftDiscrepancies.length > 0) {
      console.log(
        `\n  Shift Discrepancies (${report.shiftDiscrepancies.length}):`,
      );
      report.shiftDiscrepancies.slice(0, 5).forEach((d) => {
        console.log(
          `    - ${d.shift_id}/${d.field}: ${d.summary_value.toFixed(2)} vs ${d.calculated_value.toFixed(2)} (diff: ${d.difference.toFixed(2)})`,
        );
      });
      if (report.shiftDiscrepancies.length > 5) {
        console.log(`    ... and ${report.shiftDiscrepancies.length - 5} more`);
      }
    }

    if (report.dayDiscrepancies.length > 0) {
      console.log(`\n  Day Discrepancies (${report.dayDiscrepancies.length}):`);
      report.dayDiscrepancies.slice(0, 5).forEach((d) => {
        console.log(
          `    - ${d.store_id}/${d.business_date}/${d.field}: ${d.summary_value.toFixed(2)} vs ${d.calculated_value.toFixed(2)} (diff: ${d.difference.toFixed(2)})`,
        );
      });
      if (report.dayDiscrepancies.length > 5) {
        console.log(`    ... and ${report.dayDiscrepancies.length - 5} more`);
      }
    }

    if (report.shiftsWithoutSummaries.length > 0) {
      console.log(
        `\n  Shifts Without Summaries (${report.shiftsWithoutSummaries.length}):`,
      );
      report.shiftsWithoutSummaries.slice(0, 5).forEach((id) => {
        console.log(`    - ${id}`);
      });
      if (report.shiftsWithoutSummaries.length > 5) {
        console.log(
          `    ... and ${report.shiftsWithoutSummaries.length - 5} more`,
        );
      }
      console.log(
        "\n  → Run backfill-shift-summaries.ts to create missing summaries",
      );
    }
  } else {
    console.log("\n✓ All summaries validated successfully!");
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

    // Run validation
    const report = await validateSummaries(options);

    // Print report
    printReport(report);

    // Save report to file if requested
    if (options.outputFile) {
      fs.writeFileSync(options.outputFile, JSON.stringify(report, null, 2));
      console.log(`\nReport saved to: ${options.outputFile}`);
    }

    // Exit with error code if there were issues
    const hasIssues =
      report.summary.shiftsWithDiscrepancies > 0 ||
      report.summary.daysWithDiscrepancies > 0 ||
      report.summary.orphanedShiftSummaries > 0 ||
      report.summary.orphanedDaySummaries > 0 ||
      report.summary.shiftsWithoutSummaries > 0;

    if (hasIssues) {
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
