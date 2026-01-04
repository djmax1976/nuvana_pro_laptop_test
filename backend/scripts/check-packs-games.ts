import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkPacksAndGames() {
  const storeId = "3a9c9d9d-9c81-4e62-b2f3-fdf5ba0b2fe4";

  // Get all packs for this store with their game info
  const packs = await prisma.lotteryPack.findMany({
    where: { store_id: storeId },
    include: {
      game: {
        select: { game_id: true, game_code: true, name: true },
      },
    },
  });

  console.log("Total packs:", packs.length);
  console.log("");

  // Check for packs with missing games
  const packsWithMissingGames = packs.filter((p) => !p.game);
  console.log("Packs with missing games:", packsWithMissingGames.length);
  if (packsWithMissingGames.length > 0) {
    packsWithMissingGames.forEach((p) => {
      console.log("  - Pack ID:", p.pack_id, "| Game ID:", p.game_id);
    });
  }

  // Unique games from packs
  const uniqueGameIds = [...new Set(packs.map((p) => p.game_id))];
  console.log("");
  console.log("Unique game IDs referenced by packs:", uniqueGameIds.length);

  // Games in database
  const gamesInDb = await prisma.lotteryGame.count({
    where: { store_id: storeId },
  });
  console.log("Games in database for store:", gamesInDb);
}

checkPacksAndGames()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
