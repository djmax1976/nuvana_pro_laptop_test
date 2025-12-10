/**
 * Restore Database to AWS RDS
 * 
 * Restores data from db-backup.json to AWS RDS production database.
 * 
 * Prerequisites:
 *   1. Run migrations on AWS database first (prisma migrate deploy)
 *   2. Seed RBAC data (npx tsx src/db/seeds/rbac.seed.ts)
 *   3. Export local database (node scripts/export-db.js)
 *   4. Set DATABASE_URL environment variable to AWS RDS connection string
 * 
 * Usage:
 *   DATABASE_URL=postgresql://user:pass@aws-rds-endpoint:5432/nuvana node scripts/restore-to-aws.js
 * 
 * Or with AWS Secrets Manager:
 *   DATABASE_URL=$(aws secretsmanager get-secret-value --secret-id /nuvana-prod/database/url --query 'SecretString' --output text) node scripts/restore-to-aws.js
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function restoreData() {
  console.log('📥 Starting database restore to AWS RDS...\n');

  // Verify DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    console.error('❌ ERROR: DATABASE_URL environment variable is not set!');
    console.error('   Set it to your AWS RDS connection string');
    process.exit(1);
  }

  // Check if it looks like AWS RDS (not localhost)
  if (process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1')) {
    console.error('❌ ERROR: DATABASE_URL appears to be pointing to localhost!');
    console.error('   This script should restore to AWS RDS, not local database');
    console.error('   Current DATABASE_URL:', process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@'));
    process.exit(1);
  }

  console.log('✓ DATABASE_URL is set (AWS RDS endpoint detected)');
  console.log('⚠️  WARNING: This will restore data to PRODUCTION database!\n');

  try {
    // Load backup
    const backupPath = path.join(__dirname, '..', 'db-backup.json');
    if (!fs.existsSync(backupPath)) {
      console.error('❌ Backup file not found:', backupPath);
      console.error('   Run "node scripts/export-db.js" first to create a backup');
      process.exit(1);
    }

    const backup = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
    console.log('✓ Loaded backup from:', backupPath);
    console.log('');

    // Verify database has schema (check if _prisma_migrations table exists)
    try {
      const migrationsCheck = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = '_prisma_migrations'
        ) as exists
      `;
      
      if (!migrationsCheck[0].exists) {
        console.error('❌ ERROR: Database schema not found!');
        console.error('   Run migrations first: npx prisma migrate deploy');
        process.exit(1);
      }
      console.log('✓ Database schema verified (migrations have been run)');
    } catch (error) {
      console.error('❌ ERROR: Cannot connect to database or schema missing');
      console.error('   Error:', error.message);
      process.exit(1);
    }

    // Restore in order of dependencies (same as restore-db.js)
    console.log('\n📦 Restoring data...\n');

    // 1. Permissions (no dependencies)
    if (backup.permissions?.length > 0) {
      console.log(`Restoring ${backup.permissions.length} permissions...`);
      for (const perm of backup.permissions) {
        try {
          await prisma.permission.upsert({
            where: { permission_id: perm.permission_id },
            update: perm,
            create: perm,
          });
        } catch (e) {
          if (!e.message.includes('Unique constraint')) {
            console.error('  Error restoring permission:', perm.code, e.message);
          }
        }
      }
      console.log('  ✓ Permissions restored');
    }

    // 2. Roles (no dependencies)
    if (backup.roles?.length > 0) {
      console.log(`Restoring ${backup.roles.length} roles...`);
      for (const role of backup.roles) {
        try {
          await prisma.role.upsert({
            where: { role_id: role.role_id },
            update: role,
            create: role,
          });
        } catch (e) {
          if (!e.message.includes('Unique constraint')) {
            console.error('  Error restoring role:', role.code, e.message);
          }
        }
      }
      console.log('  ✓ Roles restored');
    }

    // 3. Role Permissions (depends on roles and permissions)
    if (backup.rolePermissions?.length > 0) {
      console.log(`Restoring ${backup.rolePermissions.length} role permissions...`);
      for (const rp of backup.rolePermissions) {
        try {
          await prisma.rolePermission.upsert({
            where: { 
              role_id_permission_id: {
                role_id: rp.role_id,
                permission_id: rp.permission_id,
              }
            },
            update: rp,
            create: rp,
          });
        } catch (e) {
          if (!e.message.includes('Unique constraint')) {
            console.error('  Error restoring role permission:', e.message);
          }
        }
      }
      console.log('  ✓ Role permissions restored');
    }

    // 4. Users (no dependencies)
    if (backup.users?.length > 0) {
      console.log(`Restoring ${backup.users.length} users...`);
      for (const user of backup.users) {
        try {
          await prisma.user.upsert({
            where: { user_id: user.user_id },
            update: user,
            create: user,
          });
        } catch (e) {
          if (!e.message.includes('Unique constraint')) {
            console.error('  Error restoring user:', user.email, e.message);
          }
        }
      }
      console.log('  ✓ Users restored');
    }

    // 5. User Roles (depends on users and roles)
    if (backup.userRoles?.length > 0) {
      console.log(`Restoring ${backup.userRoles.length} user roles...`);
      for (const ur of backup.userRoles) {
        try {
          await prisma.userRole.upsert({
            where: { user_role_id: ur.user_role_id },
            update: ur,
            create: ur,
          });
        } catch (e) {
          if (!e.message.includes('Unique constraint')) {
            console.error('  Error restoring user role:', e.message);
          }
        }
      }
      console.log('  ✓ User roles restored');
    }

    // 6. Companies (depends on users)
    if (backup.companies?.length > 0) {
      console.log(`Restoring ${backup.companies.length} companies...`);
      for (const company of backup.companies) {
        try {
          await prisma.company.upsert({
            where: { company_id: company.company_id },
            update: company,
            create: company,
          });
        } catch (e) {
          if (!e.message.includes('Unique constraint')) {
            console.error('  Error restoring company:', company.name, e.message);
          }
        }
      }
      console.log('  ✓ Companies restored');
    }

    // 7. Stores (depends on companies)
    if (backup.stores?.length > 0) {
      console.log(`Restoring ${backup.stores.length} stores...`);
      for (const store of backup.stores) {
        try {
          await prisma.store.upsert({
            where: { store_id: store.store_id },
            update: store,
            create: store,
          });
        } catch (e) {
          if (!e.message.includes('Unique constraint')) {
            console.error('  Error restoring store:', store.name, e.message);
          }
        }
      }
      console.log('  ✓ Stores restored');
    }

    // 8. Terminals (depends on stores)
    // Handle both 'terminals' and 'posTerminals' keys for compatibility
    const terminals = backup.terminals || backup.posTerminals || [];
    if (terminals.length > 0) {
      console.log(`Restoring ${terminals.length} terminals...`);
      for (const terminal of terminals) {
        try {
          await prisma.pOSTerminal.upsert({
            where: { pos_terminal_id: terminal.pos_terminal_id },
            update: terminal,
            create: terminal,
          });
        } catch (e) {
          if (!e.message.includes('Unique constraint')) {
            console.error('  Error restoring terminal:', terminal.name || terminal.device_id, e.message);
          }
        }
      }
      console.log('  ✓ Terminals restored');
    }

    // 9. Cashiers (depends on stores, users)
    if (backup.cashiers?.length > 0) {
      console.log(`Restoring ${backup.cashiers.length} cashiers...`);
      for (const cashier of backup.cashiers) {
        try {
          await prisma.cashier.upsert({
            where: { cashier_id: cashier.cashier_id },
            update: cashier,
            create: cashier,
          });
        } catch (e) {
          if (!e.message.includes('Unique constraint')) {
            console.error('  Error restoring cashier:', cashier.name, e.message);
          }
        }
      }
      console.log('  ✓ Cashiers restored');
    }

    // 10. Shifts (depends on stores, users, cashiers, terminals)
    if (backup.shifts?.length > 0) {
      console.log(`Restoring ${backup.shifts.length} shifts...`);
      for (const shift of backup.shifts) {
        try {
          await prisma.shift.upsert({
            where: { shift_id: shift.shift_id },
            update: shift,
            create: shift,
          });
        } catch (e) {
          if (!e.message.includes('Unique constraint')) {
            console.error('  Error restoring shift:', e.message);
          }
        }
      }
      console.log('  ✓ Shifts restored');
    }

    // 11. Transactions (depends on stores, shifts, users, terminals)
    if (backup.transactions?.length > 0) {
      console.log(`Restoring ${backup.transactions.length} transactions...`);
      for (const tx of backup.transactions) {
        try {
          await prisma.transaction.upsert({
            where: { transaction_id: tx.transaction_id },
            update: tx,
            create: tx,
          });
        } catch (e) {
          if (!e.message.includes('Unique constraint')) {
            console.error('  Error restoring transaction:', e.message);
          }
        }
      }
      console.log('  ✓ Transactions restored');
    }

    // 12. Transaction Line Items (depends on transactions)
    if (backup.transactionLineItems?.length > 0) {
      console.log(`Restoring ${backup.transactionLineItems.length} transaction line items...`);
      for (const item of backup.transactionLineItems) {
        try {
          await prisma.transactionLineItem.upsert({
            where: { line_item_id: item.line_item_id },
            update: item,
            create: item,
          });
        } catch (e) {
          if (!e.message.includes('Unique constraint')) {
            console.error('  Error restoring transaction line item:', e.message);
          }
        }
      }
      console.log('  ✓ Transaction line items restored');
    }

    // 13. Transaction Payments (depends on transactions)
    if (backup.transactionPayments?.length > 0) {
      console.log(`Restoring ${backup.transactionPayments.length} transaction payments...`);
      for (const payment of backup.transactionPayments) {
        try {
          await prisma.transactionPayment.upsert({
            where: { payment_id: payment.payment_id },
            update: payment,
            create: payment,
          });
        } catch (e) {
          if (!e.message.includes('Unique constraint')) {
            console.error('  Error restoring transaction payment:', e.message);
          }
        }
      }
      console.log('  ✓ Transaction payments restored');
    }

    // 14. Lottery Games
    if (backup.lotteryGames?.length > 0) {
      console.log(`Restoring ${backup.lotteryGames.length} lottery games...`);
      for (const game of backup.lotteryGames) {
        try {
          await prisma.lotteryGame.upsert({
            where: { game_id: game.game_id },
            update: game,
            create: game,
          });
        } catch (e) {
          if (!e.message.includes('Unique constraint')) {
            console.error('  Error restoring lottery game:', e.message);
          }
        }
      }
      console.log('  ✓ Lottery games restored');
    }

    // 15. Lottery Packs
    if (backup.lotteryPacks?.length > 0) {
      console.log(`Restoring ${backup.lotteryPacks.length} lottery packs...`);
      for (const pack of backup.lotteryPacks) {
        try {
          await prisma.lotteryPack.upsert({
            where: { pack_id: pack.pack_id },
            update: pack,
            create: pack,
          });
        } catch (e) {
          if (!e.message.includes('Unique constraint')) {
            console.error('  Error restoring lottery pack:', e.message);
          }
        }
      }
      console.log('  ✓ Lottery packs restored');
    }

    // 16. Lottery Variances
    if (backup.lotteryVariances?.length > 0) {
      console.log(`Restoring ${backup.lotteryVariances.length} lottery variances...`);
      for (const variance of backup.lotteryVariances) {
        try {
          await prisma.lotteryVariance.upsert({
            where: { variance_id: variance.variance_id },
            update: variance,
            create: variance,
          });
        } catch (e) {
          if (!e.message.includes('Unique constraint')) {
            console.error('  Error restoring lottery variance:', e.message);
          }
        }
      }
      console.log('  ✓ Lottery variances restored');
    }

    // 17. Company Allowed Roles
    if (backup.companyAllowedRoles?.length > 0) {
      console.log(`Restoring ${backup.companyAllowedRoles.length} company allowed roles...`);
      for (const car of backup.companyAllowedRoles) {
        try {
          await prisma.companyAllowedRole.upsert({
            where: { 
              company_id_role_id: {
                company_id: car.company_id,
                role_id: car.role_id,
              }
            },
            update: car,
            create: car,
          });
        } catch (e) {
          if (!e.message.includes('Unique constraint')) {
            console.error('  Error restoring company allowed role:', e.message);
          }
        }
      }
      console.log('  ✓ Company allowed roles restored');
    }

    // 18. Client Role Permissions (no separate ClientRole model exists)
    if (backup.clientRolePermissions?.length > 0) {
      console.log(`Restoring ${backup.clientRolePermissions.length} client role permissions...`);
      for (const crp of backup.clientRolePermissions) {
        try {
          await prisma.clientRolePermission.upsert({
            where: { 
              client_role_permission_id: crp.client_role_permission_id
            },
            update: crp,
            create: crp,
          });
        } catch (e) {
          if (!e.message.includes('Unique constraint')) {
            console.error('  Error restoring client role permission:', e.message);
          }
        }
      }
      console.log('  ✓ Client role permissions restored');
    }

    // 19. Bulk Import Jobs
    if (backup.bulkImportJobs?.length > 0) {
      console.log(`Restoring ${backup.bulkImportJobs.length} bulk import jobs...`);
      for (const job of backup.bulkImportJobs) {
        try {
          await prisma.bulkImportJob.upsert({
            where: { job_id: job.job_id },
            update: job,
            create: job,
          });
        } catch (e) {
          if (!e.message.includes('Unique constraint')) {
            console.error('  Error restoring bulk import job:', e.message);
          }
        }
      }
      console.log('  ✓ Bulk import jobs restored');
    }

    console.log('\n✅ Restore complete!');
    console.log('\n📊 Summary:');
    console.log(`  - Users: ${backup.users?.length || 0}`);
    console.log(`  - Companies: ${backup.companies?.length || 0}`);
    console.log(`  - Stores: ${backup.stores?.length || 0}`);
    console.log(`  - Transactions: ${backup.transactions?.length || 0}`);
    console.log(`  - Shifts: ${backup.shifts?.length || 0}`);

  } catch (error) {
    console.error('❌ Restore error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

restoreData();

