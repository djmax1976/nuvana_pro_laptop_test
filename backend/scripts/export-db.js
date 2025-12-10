/**
 * Database Export Script
 * 
 * Exports all data from the local database to a JSON backup file.
 * This can be used to migrate data from local Docker database to AWS RDS.
 * 
 * Usage:
 *   DATABASE_URL=postgresql://user:pass@localhost:5432/nuvana_dev node scripts/export-db.js
 * 
 * Output: db-backup.json in the backend directory
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function exportData() {
  console.log('📦 Starting database export...\n');

  try {
    const backup = {};

    // Export in order (no dependencies first)
    console.log('Exporting permissions...');
    backup.permissions = await prisma.permission.findMany();
    console.log(`  ✓ Exported ${backup.permissions.length} permissions`);

    console.log('Exporting roles...');
    backup.roles = await prisma.role.findMany();
    console.log(`  ✓ Exported ${backup.roles.length} roles`);

    console.log('Exporting role permissions...');
    backup.rolePermissions = await prisma.rolePermission.findMany();
    console.log(`  ✓ Exported ${backup.rolePermissions.length} role permissions`);

    console.log('Exporting users...');
    backup.users = await prisma.user.findMany();
    console.log(`  ✓ Exported ${backup.users.length} users`);

    console.log('Exporting user roles...');
    backup.userRoles = await prisma.userRole.findMany();
    console.log(`  ✓ Exported ${backup.userRoles.length} user roles`);

    console.log('Exporting companies...');
    backup.companies = await prisma.company.findMany();
    console.log(`  ✓ Exported ${backup.companies.length} companies`);

    console.log('Exporting stores...');
    backup.stores = await prisma.store.findMany();
    console.log(`  ✓ Exported ${backup.stores.length} stores`);

    console.log('Exporting terminals...');
    backup.terminals = await prisma.pOSTerminal.findMany();
    console.log(`  ✓ Exported ${backup.terminals.length} terminals`);

    console.log('Exporting cashiers...');
    backup.cashiers = await prisma.cashier.findMany();
    console.log(`  ✓ Exported ${backup.cashiers.length} cashiers`);

    console.log('Exporting shifts...');
    backup.shifts = await prisma.shift.findMany();
    console.log(`  ✓ Exported ${backup.shifts.length} shifts`);

    console.log('Exporting transactions...');
    backup.transactions = await prisma.transaction.findMany();
    console.log(`  ✓ Exported ${backup.transactions.length} transactions`);

    console.log('Exporting lottery games...');
    backup.lotteryGames = await prisma.lotteryGame.findMany();
    console.log(`  ✓ Exported ${backup.lotteryGames.length} lottery games`);

    console.log('Exporting lottery packs...');
    backup.lotteryPacks = await prisma.lotteryPack.findMany();
    console.log(`  ✓ Exported ${backup.lotteryPacks.length} lottery packs`);

    console.log('Exporting lottery variances...');
    backup.lotteryVariances = await prisma.lotteryVariance.findMany();
    console.log(`  ✓ Exported ${backup.lotteryVariances.length} lottery variances`);

    console.log('Exporting company allowed roles...');
    backup.companyAllowedRoles = await prisma.companyAllowedRole.findMany();
    console.log(`  ✓ Exported ${backup.companyAllowedRoles.length} company allowed roles`);

    // ClientRole model doesn't exist - only ClientRolePermission
    console.log('Exporting client role permissions...');
    backup.clientRolePermissions = await prisma.clientRolePermission.findMany();
    console.log(`  ✓ Exported ${backup.clientRolePermissions.length} client role permissions`);

    console.log('Exporting bulk import jobs...');
    backup.bulkImportJobs = await prisma.bulkImportJob.findMany();
    console.log(`  ✓ Exported ${backup.bulkImportJobs.length} bulk import jobs`);

    // Export transaction line items
    console.log('Exporting transaction line items...');
    backup.transactionLineItems = await prisma.transactionLineItem.findMany();
    console.log(`  ✓ Exported ${backup.transactionLineItems.length} transaction line items`);

    // Export transaction payments
    console.log('Exporting transaction payments...');
    backup.transactionPayments = await prisma.transactionPayment.findMany();
    console.log(`  ✓ Exported ${backup.transactionPayments.length} transaction payments`);

    // Save to file
    const backupPath = path.join(__dirname, '..', 'db-backup.json');
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
    
    console.log(`\n✅ Export complete!`);
    console.log(`📁 Backup saved to: ${backupPath}`);
    console.log(`\nTotal records exported:`);
    console.log(`  - Users: ${backup.users.length}`);
    console.log(`  - Companies: ${backup.companies.length}`);
    console.log(`  - Stores: ${backup.stores.length}`);
    console.log(`  - Transactions: ${backup.transactions.length}`);
    console.log(`  - Shifts: ${backup.shifts.length}`);
    console.log(`  - And ${Object.keys(backup).length - 5} other table types`);

  } catch (error) {
    console.error('❌ Export error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

exportData();

