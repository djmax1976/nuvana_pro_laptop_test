/**
 * Database Cleanup Utilities
 *
 * Provides functions to clean up test data from the database
 * to prevent pollution and ensure test isolation.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Delete all test data created during test runs
 * Identifies test data by common patterns (test-, demo-, etc.)
 */
export async function cleanupAllTestData() {
  console.log("🧹 Cleaning up test data...");

  try {
    // Delete in correct order to respect foreign key constraints

    // 1. Delete transactions and related data
    await prisma.transactionPayment.deleteMany({
      where: {
        transaction: {
          store: {
            OR: [
              { name: { contains: "test", mode: "insensitive" } },
              { name: { contains: "demo", mode: "insensitive" } },
            ],
          },
        },
      },
    });

    await prisma.transactionLineItem.deleteMany({
      where: {
        transaction: {
          store: {
            OR: [
              { name: { contains: "test", mode: "insensitive" } },
              { name: { contains: "demo", mode: "insensitive" } },
            ],
          },
        },
      },
    });

    await prisma.transaction.deleteMany({
      where: {
        store: {
          OR: [
            { name: { contains: "test", mode: "insensitive" } },
            { name: { contains: "demo", mode: "insensitive" } },
          ],
        },
      },
    });

    // 2. Delete lottery data (commented out - models not yet in schema)
    // await prisma.lotteryTicketSerial.deleteMany({...});
    // await prisma.lotteryShiftClosing.deleteMany({...});
    // await prisma.lotteryShiftOpening.deleteMany({...});
    // await prisma.lotteryPack.deleteMany({...});

    // 3. Delete shifts
    await prisma.shift.deleteMany({
      where: {
        store: {
          OR: [
            { name: { contains: "test", mode: "insensitive" } },
            { name: { contains: "demo", mode: "insensitive" } },
          ],
        },
      },
    });

    // 4. Delete inventory data (commented out - models not yet in schema)
    // await prisma.stockMovement.deleteMany({...});

    // 5. Delete stores
    const deletedStores = await prisma.store.deleteMany({
      where: {
        OR: [
          { name: { contains: "test", mode: "insensitive" } },
          { name: { contains: "demo", mode: "insensitive" } },
        ],
      },
    });

    // 6. Delete companies
    const deletedCompanies = await prisma.company.deleteMany({
      where: {
        OR: [
          { name: { contains: "test", mode: "insensitive" } },
          { name: { contains: "demo", mode: "insensitive" } },
        ],
      },
    });

    // 7. Delete test users
    const deletedUsers = await prisma.user.deleteMany({
      where: {
        OR: [
          { email: { contains: "test@", mode: "insensitive" } },
          { email: { contains: "demo@", mode: "insensitive" } },
          { name: { contains: "test", mode: "insensitive" } },
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

/**
 * Reset database to clean state (USE WITH CAUTION)
 * Only use in test environments
 */
export async function resetDatabase() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("❌ Cannot reset database in production!");
  }

  console.log("⚠️  RESETTING DATABASE - ALL DATA WILL BE DELETED");

  // Delete all data in correct order
  // Note: Lottery, stock, purchase, vendor, product, category, department models not yet in schema
  await prisma.$transaction([
    prisma.transactionPayment.deleteMany(),
    prisma.transactionLineItem.deleteMany(),
    prisma.transaction.deleteMany(),
    // prisma.lotteryTicketSerial.deleteMany(),
    // prisma.lotteryShiftClosing.deleteMany(),
    // prisma.lotteryShiftOpening.deleteMany(),
    // prisma.lotteryVariance.deleteMany(),
    // prisma.lotteryPack.deleteMany(),
    // prisma.lotteryBin.deleteMany(),
    // prisma.lotteryGame.deleteMany(),
    prisma.shift.deleteMany(),
    // prisma.stockMovement.deleteMany(),
    // prisma.inventorySnapshot.deleteMany(),
    // prisma.purchaseInvoiceLine.deleteMany(),
    // prisma.purchaseInvoice.deleteMany(),
    // prisma.purchaseOrderLine.deleteMany(),
    // prisma.purchaseOrder.deleteMany(),
    // prisma.vendorProduct.deleteMany(),
    // prisma.vendor.deleteMany(),
    // prisma.productBarcode.deleteMany(),
    // prisma.product.deleteMany(),
    // prisma.category.deleteMany(),
    // prisma.department.deleteMany(),
    prisma.store.deleteMany(),
    prisma.company.deleteMany(),
    prisma.userRole.deleteMany(),
    prisma.rolePermission.deleteMany(),
    prisma.user.deleteMany(),
    prisma.permission.deleteMany(),
    prisma.role.deleteMany(),
  ]);

  console.log("✅ Database reset complete");
}

/**
 * Get count of test data in database
 */
export async function getTestDataCount() {
  const [users, companies, stores] = await Promise.all([
    prisma.user.count({
      where: {
        OR: [
          { email: { contains: "test@" } },
          { email: { contains: "demo@" } },
        ],
      },
    }),
    prisma.company.count({
      where: {
        OR: [
          { name: { contains: "test", mode: "insensitive" } },
          { name: { contains: "demo", mode: "insensitive" } },
        ],
      },
    }),
    prisma.store.count({
      where: {
        OR: [
          { name: { contains: "test", mode: "insensitive" } },
          { name: { contains: "demo", mode: "insensitive" } },
        ],
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
