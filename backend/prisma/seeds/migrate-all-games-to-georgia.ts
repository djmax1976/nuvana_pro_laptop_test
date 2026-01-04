/**
 * Migration Script: Migrate ALL Existing Lottery Games to Georgia State
 *
 * This script migrates ALL existing lottery games to the Georgia state,
 * regardless of their current state_id or store_id.
 *
 * Run with: npx ts-node prisma/seeds/migrate-all-games-to-georgia.ts
 * Dry run:  npx ts-node prisma/seeds/migrate-all-games-to-georgia.ts --dry-run
 *
 * @enterprise-standards
 * - DB-006: TENANT_ISOLATION - Assigns all games to Georgia state
 * - DB-001: ORM_USAGE - Uses Prisma for all database operations
 * - SEC-006: SQL_INJECTION - No raw SQL, parameterized via Prisma
 * - DB-003: MIGRATIONS - Idempotent (can be run multiple times safely)
 *
 * IMPORTANT: This is a one-time migration script. After running:
 * 1. All lottery games will be assigned to Georgia state
 * 2. Games that already have state_id = Georgia will be skipped
 * 3. The script preserves store_id for store-scoped games (they become
 *    both state AND store scoped, which is valid for fallback behavior)
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface MigrationSummary {
  gamesUpdated: number;
  gamesSkipped: number;
  gamesAlreadyGeorgia: number;
  errors: string[];
}

/**
 * Main migration function
 */
async function migrateAllGamesToGeorgia(): Promise<void> {
  console.log("============================================================");
  console.log("Migration: Assign ALL Lottery Games to Georgia State");
  console.log("============================================================\n");

  const summary: MigrationSummary = {
    gamesUpdated: 0,
    gamesSkipped: 0,
    gamesAlreadyGeorgia: 0,
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

    // Step 2: Get all lottery games
    console.log("Step 2: Fetching all lottery games...");
    const allGames = await prisma.lotteryGame.findMany({
      select: {
        game_id: true,
        game_code: true,
        name: true,
        state_id: true,
        store_id: true,
        status: true,
      },
      orderBy: { game_code: "asc" },
    });

    console.log(`  Found ${allGames.length} total lottery games\n`);

    if (allGames.length === 0) {
      console.log("  No lottery games found in database. Nothing to migrate.");
      return;
    }

    // Step 3: Categorize games
    const gamesWithoutState = allGames.filter((g) => g.state_id === null);
    const gamesWithGeorgia = allGames.filter(
      (g) => g.state_id === georgiaState.state_id,
    );
    const gamesWithOtherState = allGames.filter(
      (g) => g.state_id !== null && g.state_id !== georgiaState.state_id,
    );

    console.log("Step 3: Game categories:");
    console.log(`  - Games without state_id:     ${gamesWithoutState.length}`);
    console.log(`  - Games already Georgia:      ${gamesWithGeorgia.length}`);
    console.log(
      `  - Games with other state_id:  ${gamesWithOtherState.length}\n`,
    );

    summary.gamesAlreadyGeorgia = gamesWithGeorgia.length;

    // Step 4: Migrate games without state_id
    if (gamesWithoutState.length > 0) {
      console.log("Step 4: Migrating games without state assignment...");
      await prisma.$transaction(async (tx) => {
        for (const game of gamesWithoutState) {
          try {
            await tx.lotteryGame.update({
              where: { game_id: game.game_id },
              data: { state_id: georgiaState.state_id },
            });
            const scopeInfo = game.store_id ? "(store-scoped)" : "(global)";
            console.log(
              `    ✓ Updated ${game.game_code}: ${game.name} ${scopeInfo}`,
            );
            summary.gamesUpdated++;
          } catch (error: any) {
            const errorMsg = `Failed to update game ${game.game_id}: ${error.message}`;
            console.error(`    ✗ ${errorMsg}`);
            summary.errors.push(errorMsg);
          }
        }
      });
    } else {
      console.log("Step 4: No games without state_id to migrate.");
    }

    // Step 5: Migrate games with other state_id (if any)
    if (gamesWithOtherState.length > 0) {
      console.log("\nStep 5: Migrating games from other states to Georgia...");
      await prisma.$transaction(async (tx) => {
        for (const game of gamesWithOtherState) {
          try {
            // Get the old state name for logging
            const oldState = await tx.uSState.findUnique({
              where: { state_id: game.state_id! },
              select: { code: true },
            });
            const oldStateCode = oldState?.code || "Unknown";

            await tx.lotteryGame.update({
              where: { game_id: game.game_id },
              data: { state_id: georgiaState.state_id },
            });
            console.log(
              `    ✓ Moved ${game.game_code}: ${game.name} from ${oldStateCode} to GA`,
            );
            summary.gamesUpdated++;
          } catch (error: any) {
            const errorMsg = `Failed to update game ${game.game_id}: ${error.message}`;
            console.error(`    ✗ ${errorMsg}`);
            summary.errors.push(errorMsg);
          }
        }
      });
    } else {
      console.log("\nStep 5: No games with other state_id to migrate.");
    }

    // Step 6: Summary
    console.log(
      "\n============================================================",
    );
    console.log("Migration Summary");
    console.log("============================================================");
    console.log(`Games updated to Georgia:   ${summary.gamesUpdated}`);
    console.log(`Games already Georgia:      ${summary.gamesAlreadyGeorgia}`);
    console.log(`Errors:                     ${summary.errors.length}`);

    if (summary.errors.length > 0) {
      console.log("\nErrors encountered:");
      summary.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }

    // Step 7: Verification
    console.log(
      "\n============================================================",
    );
    console.log("Verification");
    console.log("============================================================");

    const gamesWithGeorgiaAfter = await prisma.lotteryGame.count({
      where: { state_id: georgiaState.state_id },
    });
    const gamesWithoutStateAfter = await prisma.lotteryGame.count({
      where: { state_id: null },
    });
    const totalGames = await prisma.lotteryGame.count();

    console.log(`Total games:               ${totalGames}`);
    console.log(`Games with Georgia state:  ${gamesWithGeorgiaAfter}`);
    console.log(`Games without state:       ${gamesWithoutStateAfter}`);

    if (gamesWithoutStateAfter === 0 && gamesWithGeorgiaAfter === totalGames) {
      console.log(
        "\n✓ Migration completed successfully! All games are now Georgia-scoped.",
      );
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

  // Get all games
  const allGames = await prisma.lotteryGame.findMany({
    select: {
      game_id: true,
      game_code: true,
      name: true,
      state_id: true,
      store_id: true,
      status: true,
    },
    orderBy: { game_code: "asc" },
  });

  console.log(`Total lottery games in database: ${allGames.length}\n`);

  // Categorize
  const gamesWithoutState = allGames.filter((g) => g.state_id === null);
  const gamesWithGeorgia = allGames.filter(
    (g) => g.state_id === georgiaState.state_id,
  );
  const gamesWithOtherState = allGames.filter(
    (g) => g.state_id !== null && g.state_id !== georgiaState.state_id,
  );

  console.log("Games that would be updated:");
  console.log("----------------------------");

  if (gamesWithoutState.length > 0) {
    console.log("\nGames without state (will be assigned to Georgia):");
    gamesWithoutState.forEach((game) => {
      const scopeInfo = game.store_id ? "[store-scoped]" : "[global]";
      console.log(`  - ${game.game_code}: ${game.name} ${scopeInfo}`);
    });
  }

  if (gamesWithOtherState.length > 0) {
    console.log("\nGames with other state (will be moved to Georgia):");
    for (const game of gamesWithOtherState) {
      const oldState = await prisma.uSState.findUnique({
        where: { state_id: game.state_id! },
        select: { code: true },
      });
      console.log(
        `  - ${game.game_code}: ${game.name} [currently: ${oldState?.code || "Unknown"}]`,
      );
    }
  }

  if (gamesWithGeorgia.length > 0) {
    console.log("\nGames already assigned to Georgia (will be skipped):");
    gamesWithGeorgia.forEach((game) => {
      console.log(`  - ${game.game_code}: ${game.name}`);
    });
  }

  console.log("\n============================================================");
  console.log("Summary");
  console.log("============================================================");
  console.log(
    `Games to update:          ${gamesWithoutState.length + gamesWithOtherState.length}`,
  );
  console.log(`Games already Georgia:    ${gamesWithGeorgia.length}`);
  console.log(`Total games:              ${allGames.length}`);
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
  migrateAllGamesToGeorgia()
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
