/**
 * Tender Type Seed Data
 *
 * NOTE: Tender types are NOT seeded - they come exclusively from POS sync.
 * This is a back-office management system, not a POS. All tender type data
 * is imported from the store's third-party POS system via POS integration.
 *
 * Phase 1.1: Shift & Day Summary Implementation Plan
 */

import { PrismaClient } from "@prisma/client";

/**
 * Seed tender types into the database
 * No-op: Tender types come from POS sync only
 *
 * @param _prisma - Prisma client instance (unused)
 */
export async function seedTenderTypes(_prisma: PrismaClient): Promise<void> {
  console.log(
    "⏭️  Skipping tender types seed - tender types are imported from POS sync only",
  );
}

// Allow running directly for testing
if (require.main === module) {
  const prisma = new PrismaClient();
  seedTenderTypes(prisma)
    .then(() => {
      console.log("Tender types seed completed (no-op)");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Tender types seed failed:", error);
      process.exit(1);
    })
    .finally(() => {
      prisma.$disconnect();
    });
}
