import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SUPER_ADMIN_EMAIL = "admin@nuvana.com";

async function cleanupTestData() {
  try {
    console.log("Starting database cleanup...");
    console.log(`Preserving super admin: ${SUPER_ADMIN_EMAIL}`);

    // Get the super admin user ID to preserve
    const superAdmin = await prisma.user.findUnique({
      where: { email: SUPER_ADMIN_EMAIL },
      select: { user_id: true, email: true, name: true },
    });

    if (!superAdmin) {
      console.error(`ERROR: Super admin user ${SUPER_ADMIN_EMAIL} not found!`);
      console.log("Aborting cleanup to prevent accidental data loss.");
      return;
    }

    console.log(`Found super admin: ${superAdmin.name} (${superAdmin.email})`);
    console.log("");

    // Start cleanup in a transaction
    await prisma.$transaction(async (tx) => {
      // 1. Delete audit logs (except those for super admin)
      const auditLogsDeleted = await tx.auditLog.deleteMany({
        where: {
          user_id: {
            not: superAdmin.user_id,
          },
        },
      });
      console.log(`✓ Deleted ${auditLogsDeleted.count} audit logs`);

      // 2. Delete transaction-related data (cascades through relationships)
      const transactionPaymentsDeleted = await tx.transactionPayment.deleteMany(
        {},
      );
      console.log(
        `✓ Deleted ${transactionPaymentsDeleted.count} transaction payments`,
      );

      const transactionLineItemsDeleted =
        await tx.transactionLineItem.deleteMany({});
      console.log(
        `✓ Deleted ${transactionLineItemsDeleted.count} transaction line items`,
      );

      const transactionsDeleted = await tx.transaction.deleteMany({});
      console.log(`✓ Deleted ${transactionsDeleted.count} transactions`);

      // 3. Delete shifts
      const shiftsDeleted = await tx.shift.deleteMany({});
      console.log(`✓ Deleted ${shiftsDeleted.count} shifts`);

      // 4. Delete POS terminals
      const posTerminalsDeleted = await tx.pOSTerminal.deleteMany({});
      console.log(`✓ Deleted ${posTerminalsDeleted.count} POS terminals`);

      // 5. Delete stores (this will cascade to user_roles for stores)
      const storesDeleted = await tx.store.deleteMany({});
      console.log(`✓ Deleted ${storesDeleted.count} stores`);

      // 6. Delete companies (this will cascade to user_roles for companies)
      const companiesDeleted = await tx.company.deleteMany({});
      console.log(`✓ Deleted ${companiesDeleted.count} companies`);

      // 7. Delete clients (this will cascade to user_roles for clients)
      const clientsDeleted = await tx.client.deleteMany({});
      console.log(`✓ Deleted ${clientsDeleted.count} clients`);

      // 8. Delete user roles for all users except super admin
      const userRolesDeleted = await tx.userRole.deleteMany({
        where: {
          user_id: {
            not: superAdmin.user_id,
          },
        },
      });
      console.log(
        `✓ Deleted ${userRolesDeleted.count} user roles (preserving super admin roles)`,
      );

      // 9. Delete users except super admin
      const usersDeleted = await tx.user.deleteMany({
        where: {
          user_id: {
            not: superAdmin.user_id,
          },
        },
      });
      console.log(
        `✓ Deleted ${usersDeleted.count} users (preserved super admin)`,
      );
    });

    console.log("");
    console.log("✅ Database cleanup completed successfully!");
    console.log("");

    // Verify super admin still exists
    const verifyAdmin = await prisma.user.findUnique({
      where: { email: SUPER_ADMIN_EMAIL },
      select: {
        email: true,
        name: true,
        status: true,
        _count: {
          select: { user_roles: true },
        },
      },
    });

    if (verifyAdmin) {
      console.log("✓ Super admin verified:");
      console.log(`  Email: ${verifyAdmin.email}`);
      console.log(`  Name: ${verifyAdmin.name}`);
      console.log(`  Status: ${verifyAdmin.status}`);
      console.log(`  Roles: ${verifyAdmin._count.user_roles}`);
    }
  } catch (error) {
    console.error("Error during cleanup:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the cleanup
cleanupTestData()
  .then(() => {
    console.log("\nCleanup script finished.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nCleanup script failed:", error);
    process.exit(1);
  });
