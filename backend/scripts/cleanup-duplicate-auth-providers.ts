/**
 * Cleanup Script: Remove Duplicate auth_provider_id Values
 *
 * This script identifies and removes duplicate users with the same auth_provider_id.
 * Strategy: Keep the OLDEST user (earliest created_at), delete newer duplicates.
 *
 * Run with: npx tsx scripts/cleanup-duplicate-auth-providers.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔍 Scanning for duplicate auth_provider_id values...\n");

  // Find all duplicates
  const duplicates = await prisma.$queryRaw<
    Array<{ auth_provider_id: string; count: bigint }>
  >`
    SELECT auth_provider_id, COUNT(*) as count
    FROM users
    WHERE auth_provider_id IS NOT NULL
    GROUP BY auth_provider_id
    HAVING COUNT(*) > 1
  `;

  if (duplicates.length === 0) {
    console.log("✅ No duplicates found. Database is clean!");
    return;
  }

  console.log(
    `⚠️  Found ${duplicates.length} duplicate auth_provider_id value(s):\n`,
  );

  let totalDeleted = 0;

  for (const dup of duplicates) {
    const authProviderId = dup.auth_provider_id;
    const count = Number(dup.count);

    console.log(`📋 auth_provider_id: ${authProviderId} (${count} users)`);

    // Get all users with this auth_provider_id, ordered by created_at
    const users = await prisma.user.findMany({
      where: { auth_provider_id: authProviderId },
      orderBy: { created_at: "asc" },
    });

    // Keep the first (oldest) user, delete the rest
    const [keepUser, ...deleteUsers] = users;

    console.log(
      `   ✅ KEEP: ${keepUser.email} (created ${keepUser.created_at})`,
    );

    for (const delUser of deleteUsers) {
      console.log(
        `   ❌ DELETE: ${delUser.email} (created ${delUser.created_at})`,
      );

      await prisma.user.delete({
        where: { user_id: delUser.user_id },
      });

      totalDeleted++;
    }

    console.log();
  }

  console.log(
    `\n✅ Cleanup complete! Deleted ${totalDeleted} duplicate user(s).`,
  );
  console.log(
    "🔄 You can now run: npx prisma migrate deploy to apply the unique constraint.\n",
  );
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
