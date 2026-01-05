/**
 * Script: Remove store_id from all lottery games
 *
 * Makes all lottery games purely STATE-scoped by removing store_id.
 *
 * Run with: npx ts-node prisma/seeds/remove-store-ids-from-games.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function removeStoreIds(): Promise<void> {
  console.log("============================================================");
  console.log("Removing store_id from all lottery games");
  console.log("============================================================\n");

  try {
    // Get games with store_id before update
    const gamesWithStoreId = await prisma.lotteryGame.findMany({
      where: { store_id: { not: null } },
      select: { game_id: true, game_code: true, name: true, store_id: true },
      orderBy: { game_code: "asc" },
    });

    console.log(`Found ${gamesWithStoreId.length} games with store_id\n`);

    if (gamesWithStoreId.length === 0) {
      console.log("No games with store_id found. Nothing to update.");
      return;
    }

    // List games that will be updated
    console.log("Games to update:");
    gamesWithStoreId.forEach((game) => {
      console.log(`  - ${game.game_code}: ${game.name}`);
    });

    // Update all games to remove store_id
    console.log("\nUpdating games...");
    const result = await prisma.lotteryGame.updateMany({
      where: { store_id: { not: null } },
      data: { store_id: null },
    });

    console.log(`\n✓ Updated ${result.count} games to remove store_id`);

    // Verification
    console.log(
      "\n============================================================",
    );
    console.log("Verification");
    console.log("============================================================");

    const remaining = await prisma.lotteryGame.count({
      where: { store_id: { not: null } },
    });
    const withState = await prisma.lotteryGame.count({
      where: { state_id: { not: null } },
    });
    const total = await prisma.lotteryGame.count();

    console.log(`Total games:              ${total}`);
    console.log(`Games with state_id:      ${withState}`);
    console.log(`Games with store_id:      ${remaining}`);

    if (remaining === 0 && withState === total) {
      console.log("\n✓ All games are now purely state-scoped!");
    } else if (remaining === 0) {
      console.log("\n✓ All store_id values removed successfully!");
    } else {
      console.log(
        "\n⚠ Some games still have store_id. Check the output above.",
      );
    }
  } catch (error) {
    console.error("\nFailed:", error);
    throw error;
  }
}

removeStoreIds()
  .then(() => {
    console.log("\nDone.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nScript failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
