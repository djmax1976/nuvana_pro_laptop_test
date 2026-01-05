/**
 * Migration Script: Migrate Existing Data to Georgia State
 *
 * This script migrates existing stores and lottery games to the Georgia state.
 * Run after the geographic reference tables migration and seed.
 *
 * Run with: npx ts-node prisma/seeds/migrate-to-georgia-state.ts
 *
 * @enterprise-standards
 * - DB-006: TENANT_ISOLATION - Assigns stores to state for lottery scoping
 * - DB-001: ORM_USAGE - Uses Prisma for all database operations
 * - SEC-006: SQL_INJECTION - No raw SQL, parameterized via Prisma
 * - DB-003: MIGRATIONS - Idempotent (can be run multiple times safely)
 *
 * IMPORTANT: This is a one-time migration script. After running:
 * 1. All stores without state_id will be assigned to Georgia
 * 2. All global lottery games (store_id IS NULL) will be converted to GA state-scoped games
 * 3. The script will NOT modify stores/games that already have state assignments
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface MigrationSummary {
  storesUpdated: number;
  storesSkipped: number;
  gamesUpdated: number;
  gamesSkipped: number;
  errors: string[];
}

/**
 * Main migration function
 */
async function migrateToGeorgiaState(): Promise<void> {
  console.log("============================================================");
  console.log("Migration: Assign Existing Data to Georgia State");
  console.log("============================================================\n");

  const summary: MigrationSummary = {
    storesUpdated: 0,
    storesSkipped: 0,
    gamesUpdated: 0,
    gamesSkipped: 0,
    errors: [],
  };

  try {
    // Step 1: Get Georgia state ID
    console.log("Step 1: Looking up Georgia state...");
    const georgiaState = await prisma.uSState.findUnique({
      where: { code: "GA" },
      select: { state_id: true, name: true, code: true },
    });

    if (!georgiaState) {
      throw new Error(
        "Georgia state not found in database. Please run the geographic data seed first:\n" +
          "  npx ts-node prisma/seeds/seed-geographic-data.ts",
      );
    }
    console.log(`  ✓ Found Georgia (${georgiaState.state_id})\n`);

    // Step 2: Migrate stores without state_id
    console.log("Step 2: Migrating stores without state assignment...");
    const storesWithoutState = await prisma.store.findMany({
      where: { state_id: null },
      select: { store_id: true, name: true, public_id: true },
    });

    console.log(
      `  Found ${storesWithoutState.length} stores without state assignment`,
    );

    if (storesWithoutState.length > 0) {
      // Use transaction for atomic update
      await prisma.$transaction(async (tx) => {
        for (const store of storesWithoutState) {
          try {
            await tx.store.update({
              where: { store_id: store.store_id },
              data: { state_id: georgiaState.state_id },
            });
            console.log(
              `    ✓ Assigned store "${store.name}" (${store.public_id}) to Georgia`,
            );
            summary.storesUpdated++;
          } catch (error: any) {
            const errorMsg = `Failed to update store ${store.store_id}: ${error.message}`;
            console.error(`    ✗ ${errorMsg}`);
            summary.errors.push(errorMsg);
          }
        }
      });
    }

    // Count stores already with state
    const storesWithState = await prisma.store.count({
      where: { state_id: { not: null } },
    });
    summary.storesSkipped = storesWithState - summary.storesUpdated;
    console.log(
      `  ✓ ${summary.storesUpdated} stores updated, ${summary.storesSkipped} already had state\n`,
    );

    // Step 3: Migrate global lottery games to state-scoped
    console.log("Step 3: Migrating global lottery games to state-scoped...");
    const globalGames = await prisma.lotteryGame.findMany({
      where: {
        store_id: null,
        state_id: null,
      },
      select: { game_id: true, game_code: true, name: true },
    });

    console.log(`  Found ${globalGames.length} global games to migrate`);

    if (globalGames.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const game of globalGames) {
          try {
            // Check if a state-scoped game with this code already exists
            const existingStateGame = await tx.lotteryGame.findFirst({
              where: {
                game_code: game.game_code,
                state_id: georgiaState.state_id,
              },
            });

            if (existingStateGame) {
              console.log(
                `    ⚠ Skipped game ${game.game_code} (${game.name}) - state-scoped version already exists`,
              );
              summary.gamesSkipped++;
              continue;
            }

            await tx.lotteryGame.update({
              where: { game_id: game.game_id },
              data: { state_id: georgiaState.state_id },
            });
            console.log(
              `    ✓ Converted game ${game.game_code} (${game.name}) to Georgia state-scoped`,
            );
            summary.gamesUpdated++;
          } catch (error: any) {
            const errorMsg = `Failed to update game ${game.game_id}: ${error.message}`;
            console.error(`    ✗ ${errorMsg}`);
            summary.errors.push(errorMsg);
          }
        }
      });
    }

    // Count games already state-scoped
    const stateGames = await prisma.lotteryGame.count({
      where: { state_id: { not: null } },
    });
    console.log(
      `  ✓ ${summary.gamesUpdated} games converted, ${stateGames} total state-scoped games\n`,
    );

    // Step 4: Summary
    console.log("============================================================");
    console.log("Migration Summary");
    console.log("============================================================");
    console.log(`Stores updated:  ${summary.storesUpdated}`);
    console.log(`Stores skipped:  ${summary.storesSkipped}`);
    console.log(`Games updated:   ${summary.gamesUpdated}`);
    console.log(`Games skipped:   ${summary.gamesSkipped}`);
    console.log(`Errors:          ${summary.errors.length}`);

    if (summary.errors.length > 0) {
      console.log("\nErrors encountered:");
      summary.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }

    // Step 5: Verification
    console.log(
      "\n============================================================",
    );
    console.log("Verification");
    console.log("============================================================");

    const remainingStoresWithoutState = await prisma.store.count({
      where: { state_id: null },
    });
    const remainingGlobalGames = await prisma.lotteryGame.count({
      where: { store_id: null, state_id: null },
    });

    console.log(`Stores without state:    ${remainingStoresWithoutState}`);
    console.log(`Global games remaining:  ${remainingGlobalGames}`);

    if (remainingStoresWithoutState === 0 && remainingGlobalGames === 0) {
      console.log("\n✓ Migration completed successfully!");
    } else {
      console.log(
        "\n⚠ Some records were not migrated. Check the output above.",
      );
    }
  } catch (error) {
    console.error("\nMigration failed:", error);
    throw error;
  }
}

/**
 * Dry run mode - shows what would be migrated without making changes
 */
async function dryRun(): Promise<void> {
  console.log("============================================================");
  console.log("DRY RUN: Migration Preview (no changes will be made)");
  console.log("============================================================\n");

  // Check Georgia state
  const georgiaState = await prisma.uSState.findUnique({
    where: { code: "GA" },
    select: { state_id: true },
  });

  if (!georgiaState) {
    console.log("⚠ Georgia state not found. Run seed first.");
    return;
  }

  // Stores without state
  const storesWithoutState = await prisma.store.findMany({
    where: { state_id: null },
    select: { store_id: true, name: true, public_id: true },
    take: 10,
  });

  const totalStoresWithoutState = await prisma.store.count({
    where: { state_id: null },
  });

  console.log(`Stores without state assignment: ${totalStoresWithoutState}`);
  if (storesWithoutState.length > 0) {
    console.log("  Sample stores that would be updated:");
    storesWithoutState.forEach((store) => {
      console.log(`    - ${store.name} (${store.public_id})`);
    });
    if (totalStoresWithoutState > 10) {
      console.log(`    ... and ${totalStoresWithoutState - 10} more`);
    }
  }

  // Global games
  const globalGames = await prisma.lotteryGame.findMany({
    where: { store_id: null, state_id: null },
    select: { game_id: true, game_code: true, name: true },
    take: 10,
  });

  const totalGlobalGames = await prisma.lotteryGame.count({
    where: { store_id: null, state_id: null },
  });

  console.log(`\nGlobal games to convert: ${totalGlobalGames}`);
  if (globalGames.length > 0) {
    console.log("  Sample games that would be updated:");
    globalGames.forEach((game) => {
      console.log(`    - ${game.game_code}: ${game.name}`);
    });
    if (totalGlobalGames > 10) {
      console.log(`    ... and ${totalGlobalGames - 10} more`);
    }
  }

  console.log("\n============================================================");
  console.log("To perform the actual migration, run without --dry-run flag");
  console.log("============================================================");
}

// Main execution
const isDryRun = process.argv.includes("--dry-run");

if (isDryRun) {
  dryRun()
    .then(() => {
      console.log("\nDry run completed.");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\nDry run failed:", error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
} else {
  migrateToGeorgiaState()
    .then(() => {
      console.log("\nMigration completed.");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\nMigration failed:", error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
