/**
 * Department Seed Data
 *
 * NOTE: Departments are NOT seeded - they come exclusively from POS sync.
 * This is a back-office management system, not a POS. All department data
 * is imported from the store's third-party POS system via POS integration.
 *
 * Phase 1.2: Shift & Day Summary Implementation Plan
 */

import { PrismaClient } from "@prisma/client";

/**
 * Seed departments into the database
 * No-op: Departments come from POS sync only
 *
 * @param _prisma - Prisma client instance (unused)
 */
export async function seedDepartments(_prisma: PrismaClient): Promise<void> {
  console.log(
    "⏭️  Skipping departments seed - departments are imported from POS sync only",
  );
}

// Allow running directly for testing
if (require.main === module) {
  const prisma = new PrismaClient();
  seedDepartments(prisma)
    .then(() => {
      console.log("Departments seed completed (no-op)");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Departments seed failed:", error);
      process.exit(1);
    })
    .finally(() => {
      prisma.$disconnect();
    });
}
