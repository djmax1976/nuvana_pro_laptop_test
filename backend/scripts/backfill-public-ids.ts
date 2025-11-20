/**
 * Backfill script for public_id fields
 *
 * This script generates and populates public_id fields for all existing records
 * in the database. It should be run once after the migration adds the columns.
 *
 * Usage:
 *   npx tsx scripts/backfill-public-ids.ts
 *
 * Safety:
 *   - Updates in batches to avoid long-running transactions
 *   - Idempotent - safe to run multiple times
 *   - Skips records that already have public_ids
 */

import { PrismaClient } from "@prisma/client";
import { generatePublicId, PUBLIC_ID_PREFIXES } from "../src/utils/public-id";

const prisma = new PrismaClient();

interface BackfillResult {
  entity: string;
  total: number;
  updated: number;
  skipped: number;
}

async function backfillEntity<T extends { public_id: string | null }>(
  entityName: string,
  prefix: string,
  findMany: () => Promise<T[]>,
  update: (record: T, publicId: string) => Promise<unknown>,
): Promise<BackfillResult> {
  console.log(`\n🔄 Backfilling ${entityName}...`);

  const records = await findMany();
  const total = records.length;
  let updated = 0;
  let skipped = 0;

  for (const record of records) {
    if (record.public_id) {
      skipped++;
      continue;
    }

    const publicId = generatePublicId(prefix as any);
    await update(record, publicId);
    updated++;

    if (updated % 100 === 0) {
      console.log(`  ✓ Updated ${updated}/${total - skipped} ${entityName}`);
    }
  }

  console.log(
    `✅ ${entityName}: ${updated} updated, ${skipped} skipped, ${total} total`,
  );

  return { entity: entityName, total, updated, skipped };
}

async function main() {
  console.log("🚀 Starting public_id backfill...\n");
  console.log("This will generate public IDs for all existing records.");
  console.log("Safe to run multiple times (idempotent).\n");

  const results: BackfillResult[] = [];

  try {
    // Backfill Clients
    results.push(
      await backfillEntity(
        "clients",
        PUBLIC_ID_PREFIXES.CLIENT,
        () => prisma.client.findMany(),
        (record, publicId) =>
          prisma.client.update({
            where: { client_id: (record as any).client_id },
            data: { public_id: publicId },
          }),
      ),
    );

    // Backfill Companies
    results.push(
      await backfillEntity(
        "companies",
        PUBLIC_ID_PREFIXES.COMPANY,
        () => prisma.company.findMany(),
        (record, publicId) =>
          prisma.company.update({
            where: { company_id: (record as any).company_id },
            data: { public_id: publicId },
          }),
      ),
    );

    // Backfill Stores
    results.push(
      await backfillEntity(
        "stores",
        PUBLIC_ID_PREFIXES.STORE,
        () => prisma.store.findMany(),
        (record, publicId) =>
          prisma.store.update({
            where: { store_id: (record as any).store_id },
            data: { public_id: publicId },
          }),
      ),
    );

    // Backfill Users
    results.push(
      await backfillEntity(
        "users",
        PUBLIC_ID_PREFIXES.USER,
        () => prisma.user.findMany(),
        (record, publicId) =>
          prisma.user.update({
            where: { user_id: (record as any).user_id },
            data: { public_id: publicId },
          }),
      ),
    );

    // Backfill Transactions
    results.push(
      await backfillEntity(
        "transactions",
        PUBLIC_ID_PREFIXES.TRANSACTION,
        () => prisma.transaction.findMany(),
        (record, publicId) =>
          prisma.transaction.update({
            where: { transaction_id: (record as any).transaction_id },
            data: { public_id: publicId },
          }),
      ),
    );

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 Backfill Summary:");
    console.log("=".repeat(60));

    const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);
    const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);
    const totalRecords = results.reduce((sum, r) => sum + r.total, 0);

    results.forEach((r) => {
      console.log(
        `  ${r.entity.padEnd(15)} → ${r.updated.toString().padStart(5)} updated`,
      );
    });

    console.log("=".repeat(60));
    console.log(
      `  Total: ${totalUpdated} updated, ${totalSkipped} skipped, ${totalRecords} total`,
    );
    console.log("=".repeat(60));

    if (totalUpdated > 0) {
      console.log("\n✅ Backfill completed successfully!");
      console.log("\n📝 Next steps:");
      console.log("1. Verify the public_ids are correct");
      console.log("2. Run migration to make public_id NOT NULL:");
      console.log("   npx prisma migrate dev --name make_public_ids_required");
    } else {
      console.log("\n✅ All records already have public_ids. No changes made.");
    }
  } catch (error) {
    console.error("\n❌ Error during backfill:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
