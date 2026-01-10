/**
 * Tax Rate Seed Data
 *
 * NOTE: Tax rates are NOT seeded - they come exclusively from POS sync.
 * This is a back-office management system, not a POS. All tax rate data
 * is imported from the store's third-party POS system via POS integration.
 *
 * Phase 1.3: Shift & Day Summary Implementation Plan
 */

import { PrismaClient } from "@prisma/client";

/**
 * Seed tax rates into the database
 * No-op: Tax rates come from POS sync only
 *
 * @param _prisma - Prisma client instance (unused)
 */
export async function seedTaxRates(_prisma: PrismaClient): Promise<void> {
  console.log(
    "⏭️  Skipping tax rates seed - tax rates are imported from POS sync only",
  );
}

// Allow running directly for testing
if (require.main === module) {
  const prisma = new PrismaClient();
  seedTaxRates(prisma)
    .then(() => {
      console.log("Tax rates seed completed (no-op)");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Tax rates seed failed:", error);
      process.exit(1);
    })
    .finally(() => {
      prisma.$disconnect();
    });
}
