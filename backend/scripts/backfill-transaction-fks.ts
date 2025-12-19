/**
 * Backfill Transaction Foreign Keys Script
 * Phase 1.5: Populates tender_type_id/tender_code and department_id/department_code
 * for existing transactions that were created before FK resolution was implemented.
 *
 * Usage: npx ts-node backend/scripts/backfill-transaction-fks.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BATCH_SIZE = 1000;

interface BackfillStats {
  paymentsProcessed: number;
  paymentsUpdated: number;
  paymentsSkipped: number;
  lineItemsProcessed: number;
  lineItemsUpdated: number;
  lineItemsSkipped: number;
  errors: string[];
}

/**
 * Backfill tender_type_id and tender_code for transaction payments
 */
async function backfillTenderTypes(stats: BackfillStats): Promise<void> {
  console.log("\n=== Backfilling Tender Types for Transaction Payments ===\n");

  // First, get all unique payment methods in use
  const methods = await prisma.transactionPayment.groupBy({
    by: ["method"],
  });
  console.log(
    `Found ${methods.length} unique payment methods: ${methods.map((m) => m.method).join(", ")}`,
  );

  // Cache tender types by code for efficient lookup
  const tenderTypeCache = new Map<
    string,
    { tender_type_id: string; code: string }
  >();
  const tenderTypes = await prisma.tenderType.findMany({
    where: { is_active: true },
    select: { tender_type_id: true, code: true },
  });
  for (const tt of tenderTypes) {
    tenderTypeCache.set(tt.code.toUpperCase(), tt);
  }
  console.log(`Loaded ${tenderTypeCache.size} tender types into cache`);

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    // Fetch batch of payments without tender_type_id
    const payments = await prisma.transactionPayment.findMany({
      where: { tender_type_id: null },
      select: { payment_id: true, method: true },
      take: BATCH_SIZE,
      skip: offset,
    });

    if (payments.length === 0) {
      hasMore = false;
      break;
    }

    console.log(
      `Processing batch of ${payments.length} payments (offset: ${offset})...`,
    );

    for (const payment of payments) {
      stats.paymentsProcessed++;

      // Try to resolve tender type from method
      const tenderType = tenderTypeCache.get(payment.method.toUpperCase());

      if (tenderType) {
        try {
          await prisma.transactionPayment.update({
            where: { payment_id: payment.payment_id },
            data: {
              tender_type_id: tenderType.tender_type_id,
              tender_code: tenderType.code,
            },
          });
          stats.paymentsUpdated++;
        } catch (error) {
          const errMsg = `Failed to update payment ${payment.payment_id}: ${error}`;
          stats.errors.push(errMsg);
          console.error(errMsg);
        }
      } else {
        stats.paymentsSkipped++;
        if (stats.paymentsSkipped <= 10) {
          console.log(
            `  No tender type found for method: ${payment.method} (payment_id: ${payment.payment_id})`,
          );
        }
      }
    }

    if (payments.length < BATCH_SIZE) {
      hasMore = false;
    } else {
      offset += BATCH_SIZE;
    }

    console.log(
      `  Progress: ${stats.paymentsProcessed} processed, ${stats.paymentsUpdated} updated, ${stats.paymentsSkipped} skipped`,
    );
  }
}

/**
 * Backfill department_id and department_code for transaction line items
 * Note: This can only backfill if we can determine department from product_id or other data
 * For now, we'll just report on line items without department
 */
async function backfillDepartments(stats: BackfillStats): Promise<void> {
  console.log(
    "\n=== Checking Department Data for Transaction Line Items ===\n",
  );

  // Count line items without department
  const countWithoutDept = await prisma.transactionLineItem.count({
    where: { department_id: null },
  });

  const countTotal = await prisma.transactionLineItem.count();

  console.log(`Total line items: ${countTotal}`);
  console.log(`Line items without department: ${countWithoutDept}`);

  if (countWithoutDept === countTotal) {
    console.log(
      "\nNote: All line items lack department data. This is expected if departments",
    );
    console.log(
      "were not included in transaction imports. Future imports should include department_code.",
    );
  }

  stats.lineItemsProcessed = countTotal;
  stats.lineItemsSkipped = countWithoutDept;

  // If there's a Product table with department mappings, we could backfill from there
  // For now, just log the status since we don't have product-department mappings
  console.log(
    "\nDepartment backfill skipped - no product-department mapping available.",
  );
  console.log(
    "To add department data, re-import transactions with department_code field.",
  );
}

/**
 * Main backfill function
 */
async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("Phase 1.5: Transaction FK Backfill Script");
  console.log("=".repeat(60));

  const stats: BackfillStats = {
    paymentsProcessed: 0,
    paymentsUpdated: 0,
    paymentsSkipped: 0,
    lineItemsProcessed: 0,
    lineItemsUpdated: 0,
    lineItemsSkipped: 0,
    errors: [],
  };

  try {
    // Verify database connection
    await prisma.$connect();
    console.log("\nDatabase connection established.");

    // Check if there are any tender types seeded
    const tenderTypeCount = await prisma.tenderType.count();
    if (tenderTypeCount === 0) {
      console.error(
        "\nERROR: No tender types found in database. Please run seeds first:",
      );
      console.error("  npx prisma db seed");
      process.exit(1);
    }
    console.log(`Found ${tenderTypeCount} tender types in database.`);

    // Run backfills
    await backfillTenderTypes(stats);
    await backfillDepartments(stats);

    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("BACKFILL SUMMARY");
    console.log("=".repeat(60));
    console.log("\nPayments:");
    console.log(`  Processed: ${stats.paymentsProcessed}`);
    console.log(`  Updated:   ${stats.paymentsUpdated}`);
    console.log(`  Skipped:   ${stats.paymentsSkipped}`);
    console.log("\nLine Items:");
    console.log(`  Total:     ${stats.lineItemsProcessed}`);
    console.log(`  Without Department: ${stats.lineItemsSkipped}`);
    console.log(`  (Department backfill requires product mapping)`);

    if (stats.errors.length > 0) {
      console.log(`\nErrors (${stats.errors.length}):`);
      stats.errors.slice(0, 10).forEach((err) => console.log(`  - ${err}`));
      if (stats.errors.length > 10) {
        console.log(`  ... and ${stats.errors.length - 10} more`);
      }
    }

    console.log("\nBackfill complete!");
  } catch (error) {
    console.error("\nFATAL ERROR:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
