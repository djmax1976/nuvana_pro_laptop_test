const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanupTestData() {
  console.log('Starting cleanup...');

  try {
    // Find the super admin user
    const superAdmin = await prisma.user.findUnique({
      where: { email: 'admin@nuvana.com' }
    });

    if (!superAdmin) {
      console.log('❌ Super admin not found! Expected admin@nuvana.com');
      process.exit(1);
    }

    console.log('✓ Found super admin:', superAdmin.email);

    // Get super admin's user_role_ids to preserve
    const superAdminRoles = await prisma.userRole.findMany({
      where: { user_id: superAdmin.user_id },
      select: { user_role_id: true }
    });

    const preserveRoleIds = superAdminRoles.map(r => r.user_role_id);
    console.log(`✓ Preserving ${preserveRoleIds.length} super admin roles`);

    // Delete in correct order (thanks to CASCADE, this is easier now)

    // 1. Delete all user_roles EXCEPT super admin's roles
    const deletedUserRoles = await prisma.userRole.deleteMany({
      where: {
        user_role_id: { notIn: preserveRoleIds }
      }
    });
    console.log(`✓ Deleted ${deletedUserRoles.count} user roles`);

    // 2. Delete all stores (CASCADE will handle dependent records)
    const deletedStores = await prisma.store.deleteMany({});
    console.log(`✓ Deleted ${deletedStores.count} stores`);

    // 3. Delete all companies
    const deletedCompanies = await prisma.company.deleteMany({});
    console.log(`✓ Deleted ${deletedCompanies.count} companies`);

    // 4. Delete all clients
    const deletedClients = await prisma.client.deleteMany({});
    console.log(`✓ Deleted ${deletedClients.count} clients`);

    // 5. Delete all users EXCEPT super admin
    const deletedUsers = await prisma.user.deleteMany({
      where: {
        user_id: { not: superAdmin.user_id }
      }
    });
    console.log(`✓ Deleted ${deletedUsers.count} users`);

    // 6. Delete all audit logs except super admin related
    const deletedAuditLogs = await prisma.auditLog.deleteMany({
      where: {
        user_id: { not: superAdmin.user_id }
      }
    });
    console.log(`✓ Deleted ${deletedAuditLogs.count} audit logs`);

    // 7. Delete orphaned transactions, shifts, POS terminals
    const deletedTransactions = await prisma.transaction.deleteMany({});
    console.log(`✓ Deleted ${deletedTransactions.count} transactions`);

    const deletedShifts = await prisma.shift.deleteMany({});
    console.log(`✓ Deleted ${deletedShifts.count} shifts`);

    const deletedPOSTerminals = await prisma.pOSTerminal.deleteMany({});
    console.log(`✓ Deleted ${deletedPOSTerminals.count} POS terminals`);

    console.log('\n✅ Cleanup complete! Only super admin remains.');
    console.log(`   Email: ${superAdmin.email}`);
    console.log(`   ID: ${superAdmin.user_id}`);

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupTestData();
