const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Data Migration Script: Link Existing Store Logins
 *
 * This script finds stores without store_login_user_id and links them
 * to existing CLIENT_USER users that have UserRole entries for those stores.
 *
 * Run with: node scripts/link-existing-store-logins.js
 *
 * Use --dry-run to preview changes without applying them
 */

async function main() {
  const isDryRun = process.argv.includes('--dry-run');

  if (isDryRun) {
    console.log('=== DRY RUN MODE - No changes will be made ===\n');
  }

  // Find stores without store_login_user_id
  const storesWithoutLogin = await prisma.store.findMany({
    where: { store_login_user_id: null },
    select: {
      store_id: true,
      name: true,
      company_id: true,
    }
  });

  console.log(`Found ${storesWithoutLogin.length} stores without store_login_user_id\n`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const store of storesWithoutLogin) {
    // Find CLIENT_USER with UserRole pointing to this store
    const matchingUserRole = await prisma.userRole.findFirst({
      where: {
        store_id: store.store_id,
        role: { code: 'CLIENT_USER' }
      },
      include: {
        user: { select: { user_id: true, email: true, name: true } },
        role: { select: { code: true } }
      }
    });

    if (matchingUserRole) {
      console.log(`Store: "${store.name}" (${store.store_id})`);
      console.log(`  → Linking to user: ${matchingUserRole.user.email} (${matchingUserRole.user.user_id})`);

      if (!isDryRun) {
        await prisma.store.update({
          where: { store_id: store.store_id },
          data: { store_login_user_id: matchingUserRole.user.user_id }
        });
        console.log(`  ✓ Updated successfully`);
      } else {
        console.log(`  [DRY RUN] Would update store_login_user_id`);
      }
      updatedCount++;
    } else {
      console.log(`Store: "${store.name}" (${store.store_id})`);
      console.log(`  → No matching CLIENT_USER found - skipping`);
      skippedCount++;
    }
    console.log('');
  }

  console.log('=== Summary ===');
  console.log(`Updated: ${updatedCount} stores`);
  console.log(`Skipped: ${skippedCount} stores (no matching user)`);

  if (isDryRun && updatedCount > 0) {
    console.log('\nRun without --dry-run to apply these changes.');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
