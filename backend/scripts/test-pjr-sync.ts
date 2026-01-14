/**
 * Test PJR Transaction Sync
 *
 * Tests the PJR transaction extraction and sync using our actual implementation.
 * Filters to only process today's transactions for testing.
 *
 * Usage: npx ts-node scripts/test-pjr-sync.ts
 */

import { PrismaClient } from "@prisma/client";
import { posSyncService } from "../src/services/pos/pos-sync.service";
import { createGilbarcoNAXMLAdapter } from "../src/services/pos/adapters/gilbarco-naxml.adapter";

const prisma = new PrismaClient();
const TODAY = "2026-01-10";

async function testPJRSync() {
  console.log("=".repeat(60));
  console.log("Testing PJR Transaction Sync");
  console.log("Target Date:", TODAY);
  console.log("=".repeat(60));

  // Step 1: Find the Gilbarco integration
  const integration = await prisma.pOSIntegration.findFirst({
    where: { pos_type: "GILBARCO_NAXML" },
    include: { store: true },
  });

  if (!integration) {
    console.error("ERROR: No Gilbarco NAXML integration found");
    process.exit(1);
  }

  console.log("\n[1] Found POS Integration:");
  console.log("   - ID:", integration.pos_integration_id);
  console.log("   - Store:", integration.store.name);
  console.log("   - Type:", integration.pos_type);
  console.log("   - Host:", integration.host);

  // Step 2: Create adapter and extract PJR transactions
  console.log("\n[2] Extracting PJR Transactions...");
  const adapter = createGilbarcoNAXMLAdapter();

  const config = {
    host: integration.host,
    port: integration.port,
    useSsl: integration.use_ssl,
    timeout: integration.timeout,
    posType: integration.pos_type,
  };

  const transactions = await adapter.extractPJRTransactions(
    config as any,
    TODAY, // Only today's transactions
  );

  console.log("   - Found", transactions.length, "transactions for", TODAY);

  if (transactions.length === 0) {
    console.log("\n   No transactions found for today. Checking all dates...");
    const allTransactions = await adapter.extractPJRTransactions(config as any);
    console.log("   - Total PJR files processed:", allTransactions.length);

    // Show unique business dates
    const dates = [
      ...new Set(allTransactions.map((t) => t.businessDate)),
    ].sort();
    console.log("   - Business dates found:", dates.join(", "));

    if (!dates.includes(TODAY)) {
      console.log("\n   WARNING: No transactions for", TODAY, "in PJR files");
    }
  }

  // Step 3: Show sample transaction details
  if (transactions.length > 0) {
    console.log("\n[3] Sample Transaction Details:");
    const sample = transactions[0];
    console.log("   - POS Transaction ID:", sample.posTransactionId);
    console.log("   - Business Date:", sample.businessDate);
    console.log("   - Timestamp:", sample.timestamp);
    console.log("   - Grand Total: $" + sample.grandTotal.toFixed(2));
    console.log("   - Line Items:", sample.lineItems.length);
    console.log("   - Payments:", sample.payments.length);

    // Show line item types
    const itemTypes = sample.lineItems.reduce(
      (acc, li) => {
        acc[li.itemType] = (acc[li.itemType] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    console.log("   - Item Types:", JSON.stringify(itemTypes));
  }

  // Step 4: Sync transactions to database
  console.log("\n[4] Syncing Transactions to Database...");
  const syncResult = await posSyncService.syncTransactions(
    transactions,
    integration.store_id,
    integration.pos_integration_id,
  );

  console.log("   - Inserted:", syncResult.inserted);
  console.log("   - Skipped:", syncResult.skipped);
  console.log("   - Errors:", syncResult.errors);

  if (syncResult.errorDetails.length > 0) {
    console.log("   - Error Details:");
    syncResult.errorDetails
      .slice(0, 5)
      .forEach((e) => console.log("     *", e));
  }

  // Step 5: Verify database state
  console.log("\n[5] Verifying Database State...");

  const txCount = await prisma.transaction.count({
    where: {
      store_id: integration.store_id,
      business_date: new Date(TODAY),
    },
  });
  console.log("   - Transactions in DB for", TODAY + ":", txCount);

  const fuelData = await prisma.transactionLineItem.aggregate({
    where: {
      transaction: {
        store_id: integration.store_id,
        business_date: new Date(TODAY),
        is_training_mode: false,
      },
      item_type: "FUEL",
      line_status: "normal",
    },
    _sum: { line_total: true, quantity: true },
    _count: true,
  });

  console.log(
    "   - Fuel Sales: $" + (fuelData._sum.line_total?.toString() || "0"),
  );
  console.log("   - Fuel Gallons:", fuelData._sum.quantity?.toString() || "0");
  console.log("   - Fuel Transactions:", fuelData._count);

  const merchData = await prisma.transactionLineItem.aggregate({
    where: {
      transaction: {
        store_id: integration.store_id,
        business_date: new Date(TODAY),
        is_training_mode: false,
      },
      item_type: "MERCHANDISE",
      line_status: "normal",
    },
    _sum: { line_total: true },
    _count: true,
  });

  console.log(
    "   - Merchandise Sales: $" +
      (merchData._sum.line_total?.toString() || "0"),
  );
  console.log("   - Merchandise Items:", merchData._count);

  console.log("\n" + "=".repeat(60));
  console.log("Test Complete!");
  console.log("=".repeat(60));

  await prisma.$disconnect();
}

testPJRSync().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
