import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function cleanupAllTestData() {
  try {
    console.log("🧹 Starting cleanup of all test data...");

    const SUPERADMIN_EMAIL = "admin@nuvana.com";

    // Get superadmin user
    const superadmin = await prisma.user.findUnique({
      where: { email: SUPERADMIN_EMAIL },
    });

    if (!superadmin) {
      console.error(`❌ Superadmin ${SUPERADMIN_EMAIL} not found!`);
      process.exit(1);
    }

    console.log(
      `✅ Found superadmin: ${superadmin.email} (${superadmin.user_id})`,
    );

    // Delete in order respecting foreign key constraints

    // 1. Delete all transactions and related data
    console.log("\n📊 Deleting transactions...");
    const deletedTransactions = await prisma.transaction.deleteMany({});
    console.log(`   Deleted ${deletedTransactions.count} transactions`);

    // 2. Delete all shifts
    console.log("\n⏰ Deleting shifts...");
    const deletedShifts = await prisma.shift.deleteMany({});
    console.log(`   Deleted ${deletedShifts.count} shifts`);

    // 3. Delete all POS terminals
    console.log("\n💻 Deleting POS terminals...");
    const deletedPOSTerminals = await prisma.pOSTerminal.deleteMany({});
    console.log(`   Deleted ${deletedPOSTerminals.count} POS terminals`);

    // 4. Delete all stores
    console.log("\n🏪 Deleting stores...");
    const deletedStores = await prisma.store.deleteMany({});
    console.log(`   Deleted ${deletedStores.count} stores`);

    // 5. Delete all companies
    console.log("\n🏢 Deleting companies...");
    const deletedCompanies = await prisma.company.deleteMany({});
    console.log(`   Deleted ${deletedCompanies.count} companies`);

    // 6. Delete all clients
    console.log("\n👥 Deleting clients...");
    const deletedClients = await prisma.client.deleteMany({});
    console.log(`   Deleted ${deletedClients.count} clients`);

    // 7. Delete all user roles except superadmin's roles
    console.log("\n🔐 Deleting user roles (except superadmin)...");
    const deletedUserRoles = await prisma.userRole.deleteMany({
      where: {
        user_id: {
          not: superadmin.user_id,
        },
      },
    });
    console.log(`   Deleted ${deletedUserRoles.count} user roles`);

    // 8. Delete all users except superadmin
    console.log("\n👤 Deleting users (except superadmin)...");
    const deletedUsers = await prisma.user.deleteMany({
      where: {
        email: {
          not: SUPERADMIN_EMAIL,
        },
      },
    });
    console.log(`   Deleted ${deletedUsers.count} users`);

    // 9. Delete audit logs (optional - except superadmin's)
    console.log("\n📝 Deleting audit logs (except superadmin)...");
    const deletedAuditLogs = await prisma.auditLog.deleteMany({
      where: {
        OR: [{ user_id: { not: superadmin.user_id } }, { user_id: null }],
      },
    });
    console.log(`   Deleted ${deletedAuditLogs.count} audit logs`);

    console.log("\n✅ Cleanup complete!");
    console.log(`\n📋 Summary:`);
    console.log(`   - Transactions: ${deletedTransactions.count}`);
    console.log(`   - Shifts: ${deletedShifts.count}`);
    console.log(`   - POS Terminals: ${deletedPOSTerminals.count}`);
    console.log(`   - Stores: ${deletedStores.count}`);
    console.log(`   - Companies: ${deletedCompanies.count}`);
    console.log(`   - Clients: ${deletedClients.count}`);
    console.log(`   - User Roles: ${deletedUserRoles.count}`);
    console.log(`   - Users: ${deletedUsers.count}`);
    console.log(`   - Audit Logs: ${deletedAuditLogs.count}`);
    console.log(`\n✅ Superadmin ${SUPERADMIN_EMAIL} preserved`);
  } catch (error) {
    console.error("❌ Error during cleanup:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

cleanupAllTestData().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
