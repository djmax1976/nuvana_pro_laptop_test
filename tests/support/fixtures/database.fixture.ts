import { test as base } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// =============================================================================
// DATABASE PROTECTION - Block prod/staging databases in test code
// =============================================================================
const dbUrl = process.env.DATABASE_URL || "";
// Only block production/staging - allow nuvana_dev and nuvana_test for local development
if (/nuvana_prod|nuvana_production|nuvana_staging|_prod$/i.test(dbUrl)) {
  throw new Error(
    `🚨 BLOCKED: Cannot use database.fixture with production database: ${dbUrl}`,
  );
}

/**
 * Database Test Fixtures
 *
 * Provides fixtures for database testing including:
 * - Prisma Client with auto-cleanup
 * - Test data setup/cleanup helpers
 *
 * Follows fixture architecture pattern: pure functions wrapped in fixtures
 */

type DatabaseFixture = {
  prisma: PrismaClient;
  cleanup: {
    users: string[];
    companies: string[];
    stores: string[];
  };
};

export const test = base.extend<DatabaseFixture>({
  prisma: async ({}, use: (prisma: PrismaClient) => Promise<void>) => {
    // Setup: Create Prisma Client instance
    const prisma = new PrismaClient();
    await prisma.$connect();

    // Provide to test
    await use(prisma);

    // Cleanup: Disconnect Prisma Client
    await prisma.$disconnect();
  },

  cleanup: async ({ prisma }, use) => {
    // Setup: Initialize cleanup tracking
    const cleanup = {
      users: [] as string[],
      companies: [] as string[],
      stores: [] as string[],
    };

    // Provide to test
    await use(cleanup);

    // Cleanup: Delete all test data in reverse order (stores first, then companies, then users)
    for (const storeId of cleanup.stores) {
      try {
        await prisma.store.delete({ where: { store_id: storeId } });
      } catch (error) {
        // Ignore errors (might already be deleted via cascade)
      }
    }

    for (const companyId of cleanup.companies) {
      try {
        await prisma.company.delete({ where: { company_id: companyId } });
      } catch (error) {
        // Ignore errors (might already be deleted)
      }
    }

    for (const userId of cleanup.users) {
      try {
        await prisma.user.delete({ where: { user_id: userId } });
      } catch (error) {
        // Ignore errors (might already be deleted)
      }
    }
  },
});

export { expect } from "@playwright/test";
