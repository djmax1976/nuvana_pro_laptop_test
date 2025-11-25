/**
 * Global Test Setup
 *
 * This file runs ONCE before all tests start.
 * It cleans the database of any leftover test data from previous runs.
 */

import { PrismaClient } from "@prisma/client";

// Protected emails that should NEVER be deleted (seed users)
const PROTECTED_EMAILS = [
  "superadmin@nuvana.com",
  "admin@nuvana.com",
  "corporate@nuvana.com",
  "manager@nuvana.com",
];

async function globalSetup() {
  console.log("\n🧹 Global Setup: Cleaning database before tests...\n");

  const prisma = new PrismaClient();

  try {
    await prisma.$connect();

    // Clean in correct order respecting foreign keys
    // 1. Transaction line items and payments (via cascade, but be explicit)
    // 2. Transactions
    // 3. Shifts
    // 4. POS Terminals
    // 5. User Roles
    // 6. Stores
    // 7. Companies
    // 8. Users (except seed users)

    // Find ALL users except protected seed users
    // This catches all test data regardless of email pattern
    const testUsers = await prisma.user.findMany({
      where: {
        NOT: {
          email: { in: PROTECTED_EMAILS },
        },
      },
      select: { user_id: true, email: true },
    });

    // Find ALL companies (all companies in test db are test data)
    const testCompanies = await prisma.company.findMany({
      select: { company_id: true, name: true },
    });

    // Find ALL stores (all stores in test db are test data)
    const testStores = await prisma.store.findMany({
      select: { store_id: true, name: true },
    });

    const userIds = testUsers.map((u) => u.user_id);
    const companyIds = testCompanies.map((c) => c.company_id);
    const storeIds = testStores.map((s) => s.store_id);

    console.log(`   Found ${userIds.length} test users to clean`);
    console.log(`   Found ${companyIds.length} test companies to clean`);
    console.log(`   Found ${storeIds.length} test stores to clean`);

    if (
      userIds.length === 0 &&
      companyIds.length === 0 &&
      storeIds.length === 0
    ) {
      console.log("\n✅ Database already clean\n");
      return;
    }

    // Delete in correct FK order using a transaction
    await prisma.$transaction(async (tx) => {
      // 1. Delete transactions for test stores/users
      if (storeIds.length > 0 || userIds.length > 0) {
        const txResult = await tx.transaction.deleteMany({
          where: {
            OR: [
              ...(storeIds.length > 0 ? [{ store_id: { in: storeIds } }] : []),
              ...(userIds.length > 0 ? [{ cashier_id: { in: userIds } }] : []),
            ],
          },
        });
        if (txResult.count > 0)
          console.log(`   Deleted ${txResult.count} transactions`);
      }

      // 2. Delete shifts for test stores/users
      if (storeIds.length > 0 || userIds.length > 0) {
        const shiftResult = await tx.shift.deleteMany({
          where: {
            OR: [
              ...(storeIds.length > 0 ? [{ store_id: { in: storeIds } }] : []),
              ...(userIds.length > 0 ? [{ cashier_id: { in: userIds } }] : []),
            ],
          },
        });
        if (shiftResult.count > 0)
          console.log(`   Deleted ${shiftResult.count} shifts`);
      }

      // 3. Delete POS terminals for test stores
      if (storeIds.length > 0) {
        const posResult = await tx.pOSTerminal.deleteMany({
          where: { store_id: { in: storeIds } },
        });
        if (posResult.count > 0)
          console.log(`   Deleted ${posResult.count} POS terminals`);
      }

      // 4. Delete user roles for test users/companies/stores
      const userRoleResult = await tx.userRole.deleteMany({
        where: {
          OR: [
            ...(userIds.length > 0 ? [{ user_id: { in: userIds } }] : []),
            ...(companyIds.length > 0
              ? [{ company_id: { in: companyIds } }]
              : []),
            ...(storeIds.length > 0 ? [{ store_id: { in: storeIds } }] : []),
          ],
        },
      });
      if (userRoleResult.count > 0)
        console.log(`   Deleted ${userRoleResult.count} user roles`);

      // 5. Delete test stores
      if (storeIds.length > 0) {
        const storeResult = await tx.store.deleteMany({
          where: { store_id: { in: storeIds } },
        });
        if (storeResult.count > 0)
          console.log(`   Deleted ${storeResult.count} stores`);
      }

      // 6. Delete test companies
      if (companyIds.length > 0) {
        const companyResult = await tx.company.deleteMany({
          where: { company_id: { in: companyIds } },
        });
        if (companyResult.count > 0)
          console.log(`   Deleted ${companyResult.count} companies`);
      }

      // 7. Delete test users
      if (userIds.length > 0) {
        const userResult = await tx.user.deleteMany({
          where: { user_id: { in: userIds } },
        });
        if (userResult.count > 0)
          console.log(`   Deleted ${userResult.count} users`);
      }

      // 8. Clean up orphaned audit logs (optional, for test data)
      const auditResult = await tx.auditLog.deleteMany({
        where: {
          OR: [
            { user_id: { in: userIds } },
            { reason: { contains: "test", mode: "insensitive" } },
          ],
        },
      });
      if (auditResult.count > 0)
        console.log(`   Deleted ${auditResult.count} audit logs`);
    });

    console.log("\n✅ Database cleanup complete\n");
  } catch (error) {
    console.error("❌ Global setup error:", error);
    // Don't throw - let tests run even if cleanup fails
  } finally {
    await prisma.$disconnect();
  }
}

export default globalSetup;
