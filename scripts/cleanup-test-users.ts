/**
 * Database Cleanup Script
 * Removes all test users and keeps only admin@nuvana.com
 *
 * Usage: npx tsx scripts/cleanup-test-users.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function cleanupTestUsers() {
  console.log("🧹 Starting database cleanup...\n");

  try {
    // Step 1: Get the production admin user
    const adminUser = await prisma.user.findUnique({
      where: { email: "admin@nuvana.com" },
      select: { user_id: true, email: true, name: true },
    });

    if (!adminUser) {
      console.error("❌ ERROR: admin@nuvana.com not found in database!");
      console.error("   Please create the production admin user first.");
      process.exit(1);
    }

    console.log(
      `✅ Found production admin: ${adminUser.email} (${adminUser.name})`,
    );
    console.log(`   User ID: ${adminUser.user_id}\n`);

    // Step 2: Count current database state
    const totalUsers = await prisma.user.count();
    const totalUserRoles = await prisma.userRole.count();
    const totalCompanies = await prisma.company.count();
    const totalStores = await prisma.store.count();

    console.log("📊 Current database state:");
    console.log(`   Users: ${totalUsers}`);
    console.log(`   User Roles: ${totalUserRoles}`);
    console.log(`   Companies: ${totalCompanies}`);
    console.log(`   Stores: ${totalStores}\n`);

    // Step 3: Get all test users (everyone except admin@nuvana.com)
    const testUsers = await prisma.user.findMany({
      where: {
        email: { not: "admin@nuvana.com" },
      },
      select: { user_id: true, email: true, name: true },
    });

    let deletedRoles = 0;
    let deletedUsers = 0;
    let deletedShifts = 0;
    let deletedTransactions = 0;

    if (testUsers.length === 0) {
      console.log(
        "✨ No test users to delete. Only admin@nuvana.com exists.\n",
      );
    } else {
      console.log(`🗑️  Found ${testUsers.length} test users to delete:`);
      testUsers.forEach(
        (
          user: { user_id: string; email: string; name: string | null },
          index: number,
        ) => {
          console.log(
            `   ${index + 1}. ${user.email} (${user.name || "No name"})`,
          );
        },
      );
      console.log("");

      // Step 4: Delete in correct order (respect foreign key constraints)
      console.log("🔄 Starting cleanup process...\n");

      for (const user of testUsers) {
        try {
          // Get all shifts for this user first
          const userShifts = await prisma.shift.findMany({
            where: { cashier_id: user.user_id },
            select: { shift_id: true },
          });

          // Step 1: Delete transactions FIRST (FK: transactions.shift_id -> shifts.shift_id AND transactions.cashier_id -> users.user_id)
          if (userShifts.length > 0) {
            const transactionsForShifts = await prisma.transaction.deleteMany({
              where: {
                shift_id: {
                  in: userShifts.map((s: { shift_id: string }) => s.shift_id),
                },
              },
            });
            deletedTransactions += transactionsForShifts.count;
          }

          // Also delete transactions directly linked to this cashier
          const transactionsForCashier = await prisma.transaction.deleteMany({
            where: {
              cashier_id: user.user_id,
            },
          });
          deletedTransactions += transactionsForCashier.count;

          // Step 2: Delete shifts (FK: shifts.cashier_id -> users.user_id)
          const shiftsResult = await prisma.shift.deleteMany({
            where: { cashier_id: user.user_id },
          });
          deletedShifts += shiftsResult.count;

          // Step 3: Delete user roles (FK: user_roles.user_id -> users.user_id)
          const rolesResult = await prisma.userRole.deleteMany({
            where: { user_id: user.user_id },
          });
          deletedRoles += rolesResult.count;

          // Step 4: Finally delete the user
          await prisma.user.delete({
            where: { user_id: user.user_id },
          });
          deletedUsers++;

          console.log(`   ✓ Deleted user: ${user.email}`);
        } catch (error) {
          console.warn(
            `   ⚠️  Error deleting user ${user.email}:`,
            error instanceof Error ? error.message : "Unknown error",
          );
        }
      }
    }

    // Step 5: Delete all stores (FK: stores.company_id -> companies)
    console.log("\n🗑️  Cleaning up all stores...");
    const storesResult = await prisma.store.deleteMany({});
    const deletedStores = storesResult.count;

    // Step 6: Delete all companies
    console.log("🗑️  Cleaning up all companies...");
    const companiesResult = await prisma.company.deleteMany({});
    const deletedCompanies = companiesResult.count;

    // Step 7: Final verification
    console.log("\n📊 Cleanup completed!");
    console.log(`   Deleted ${deletedShifts} shifts`);
    console.log(`   Deleted ${deletedTransactions} transactions`);
    console.log(`   Deleted ${deletedRoles} user roles`);
    console.log(`   Deleted ${deletedUsers} users`);
    console.log(`   Deleted ${deletedStores} stores`);
    console.log(`   Deleted ${deletedCompanies} companies\n`);

    const remainingUsers = await prisma.user.count();
    const remainingUserRoles = await prisma.userRole.count();
    const remainingCompanies = await prisma.company.count();
    const remainingStores = await prisma.store.count();

    console.log("✨ Final database state:");
    console.log(
      `   Users: ${remainingUsers} (should be 1 - admin@nuvana.com only)`,
    );
    console.log(`   User Roles: ${remainingUserRoles}`);
    console.log(`   Companies: ${remainingCompanies} (should be 0)`);
    console.log(`   Stores: ${remainingStores} (should be 0)`);

    if (remainingUsers === 1) {
      console.log(
        "\n✅ SUCCESS: Database cleaned! Only admin@nuvana.com remains.",
      );
    } else {
      console.log(
        `\n⚠️  WARNING: Expected 1 user, but found ${remainingUsers}`,
      );
    }
  } catch (error) {
    console.error("\n❌ Cleanup failed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run cleanup
cleanupTestUsers().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
