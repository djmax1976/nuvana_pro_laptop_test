/**
 * Database Cleanup Utilities
 *
 * Provides functions to clean up test data from the database
 * to prevent pollution and ensure test isolation.
 *
 * IMPORTANT: Only deletes data that matches TEST MARKERS to avoid
 * accidentally deleting manually created data.
 *
 * Test data markers:
 * - Users: email ends with @test.nuvana.local, @test.com, or starts with test_, e2e-
 * - Companies: name starts with "Test " or "E2E "
 * - Stores: name starts with "Test " or "E2E "
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Test email patterns - ONLY users matching these will be deleted
const TEST_EMAIL_PATTERNS = {
  domains: ["@test.nuvana.local", "@test.com"],
  prefixes: ["test_", "e2e-", "e2e_"],
};

// Test name patterns - ONLY entities matching these will be deleted
const TEST_NAME_PATTERNS = {
  prefixes: ["Test ", "E2E ", "test_", "e2e_"],
};

/**
 * Delete all test data created during test runs
 * Identifies test data by TEST MARKERS (not general patterns)
 */
export async function cleanupAllTestData() {
  console.log("🧹 Cleaning up test data...");
  console.log("   ℹ️  Only data with test markers will be deleted");

  try {
    // Build store filter for test stores only
    const storeFilter = {
      OR: TEST_NAME_PATTERNS.prefixes.map((prefix) => ({
        name: { startsWith: prefix },
      })),
    };

    // Delete in correct order to respect foreign key constraints

    // 1. Delete transactions and related data for test stores
    await prisma.transactionPayment.deleteMany({
      where: {
        transaction: {
          store: storeFilter,
        },
      },
    });

    await prisma.transactionLineItem.deleteMany({
      where: {
        transaction: {
          store: storeFilter,
        },
      },
    });

    await prisma.transaction.deleteMany({
      where: {
        store: storeFilter,
      },
    });

    // 2. Delete lottery data (commented out - models not yet in schema)
    // await prisma.lotteryTicketSerial.deleteMany({...});
    // await prisma.lotteryShiftClosing.deleteMany({...});
    // await prisma.lotteryShiftOpening.deleteMany({...});
    // await prisma.lotteryPack.deleteMany({...});

    // 3. Delete shifts for test stores
    await prisma.shift.deleteMany({
      where: {
        store: storeFilter,
      },
    });

    // 4. Delete inventory data (commented out - models not yet in schema)
    // await prisma.stockMovement.deleteMany({...});

    // 5. Delete test stores (name starts with "Test " or "E2E ")
    const deletedStores = await prisma.store.deleteMany({
      where: storeFilter,
    });

    // 6. Delete test companies (name starts with "Test " or "E2E ")
    const deletedCompanies = await prisma.company.deleteMany({
      where: {
        OR: TEST_NAME_PATTERNS.prefixes.map((prefix) => ({
          name: { startsWith: prefix },
        })),
      },
    });

    // 7. Delete test users (email matches test patterns)
    const deletedUsers = await prisma.user.deleteMany({
      where: {
        OR: [
          // Match test email domains
          ...TEST_EMAIL_PATTERNS.domains.map((domain) => ({
            email: { endsWith: domain },
          })),
          // Match test email prefixes
          ...TEST_EMAIL_PATTERNS.prefixes.map((prefix) => ({
            email: { startsWith: prefix },
          })),
        ],
      },
    });

    console.log(`✅ Cleanup complete:
      - ${deletedUsers.count} test users
      - ${deletedCompanies.count} test companies
      - ${deletedStores.count} test stores
    `);

    return {
      users: deletedUsers.count,
      companies: deletedCompanies.count,
      stores: deletedStores.count,
    };
  } catch (error) {
    console.error("❌ Cleanup failed:", error);
    throw error;
  }
}

/**
 * Delete test data by specific store IDs
 */
export async function cleanupByStoreIds(storeIds: string[]) {
  if (storeIds.length === 0) return;

  console.log(`🧹 Cleaning up data for ${storeIds.length} stores...`);

  // Delete in correct order
  await prisma.transactionPayment.deleteMany({
    where: { transaction: { store_id: { in: storeIds } } },
  });

  await prisma.transactionLineItem.deleteMany({
    where: { transaction: { store_id: { in: storeIds } } },
  });

  await prisma.transaction.deleteMany({
    where: { store_id: { in: storeIds } },
  });

  // Lottery models not yet in schema
  // await prisma.lotteryTicketSerial.deleteMany({...});
  // await prisma.lotteryShiftClosing.deleteMany({...});
  // await prisma.lotteryShiftOpening.deleteMany({...});
  // await prisma.lotteryPack.deleteMany({...});

  await prisma.shift.deleteMany({
    where: { store_id: { in: storeIds } },
  });

  // Stock models not yet in schema
  // await prisma.stockMovement.deleteMany({...});

  await prisma.store.deleteMany({
    where: { store_id: { in: storeIds } },
  });

  console.log("✅ Store cleanup complete");
}

/**
 * Delete test data by company IDs
 */
export async function cleanupByCompanyIds(companyIds: string[]) {
  if (companyIds.length === 0) return;

  console.log(`🧹 Cleaning up data for ${companyIds.length} companies...`);

  // Get store IDs for these companies
  const stores = await prisma.store.findMany({
    where: { company_id: { in: companyIds } },
    select: { store_id: true },
  });

  const storeIds = stores.map((s) => s.store_id);

  // Clean up stores first
  if (storeIds.length > 0) {
    await cleanupByStoreIds(storeIds);
  }

  // Then delete companies
  await prisma.company.deleteMany({
    where: { company_id: { in: companyIds } },
  });

  console.log("✅ Company cleanup complete");
}

/**
 * Delete test data by user IDs
 */
export async function cleanupByUserIds(userIds: string[]) {
  if (userIds.length === 0) return;

  console.log(`🧹 Cleaning up data for ${userIds.length} users...`);

  // Delete user roles
  await prisma.userRole.deleteMany({
    where: { user_id: { in: userIds } },
  });

  // Delete users
  await prisma.user.deleteMany({
    where: { user_id: { in: userIds } },
  });

  console.log("✅ User cleanup complete");
}

// NOTE: resetDatabase() function was REMOVED because it deleted ALL data
// without filtering by test markers, which caused data loss.
// Use cleanupAllTestData() instead for safe test data cleanup.

/**
 * Get count of test data in database (data matching test markers)
 */
export async function getTestDataCount() {
  const [users, companies, stores] = await Promise.all([
    prisma.user.count({
      where: {
        OR: [
          // Match test email domains
          ...TEST_EMAIL_PATTERNS.domains.map((domain) => ({
            email: { endsWith: domain },
          })),
          // Match test email prefixes
          ...TEST_EMAIL_PATTERNS.prefixes.map((prefix) => ({
            email: { startsWith: prefix },
          })),
        ],
      },
    }),
    prisma.company.count({
      where: {
        OR: TEST_NAME_PATTERNS.prefixes.map((prefix) => ({
          name: { startsWith: prefix },
        })),
      },
    }),
    prisma.store.count({
      where: {
        OR: TEST_NAME_PATTERNS.prefixes.map((prefix) => ({
          name: { startsWith: prefix },
        })),
      },
    }),
  ]);

  return { users, companies, stores };
}

/**
 * Close Prisma connection
 */
export async function disconnectPrisma() {
  await prisma.$disconnect();
}
