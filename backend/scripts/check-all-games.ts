import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkAllGames() {
  // Get ALL lottery games (no store filter)
  const games = await prisma.lotteryGame.findMany({
    select: {
      game_id: true,
      game_code: true,
      name: true,
      price: true,
      store_id: true,
      created_at: true,
      _count: {
        select: { packs: true },
      },
    },
    orderBy: { name: "asc" },
  });

  console.log("Total games in database:", games.length);
  console.log("");

  // Find test/garbage games
  const testGames = games.filter(
    (g) =>
      g.name.toLowerCase().includes("test") ||
      g.game_code?.toLowerCase().includes("test"),
  );

  if (testGames.length > 0) {
    console.log("TEST/GARBAGE GAMES FOUND:");
    testGames.forEach((g) => {
      console.log("  - ID:", g.game_id);
      console.log("    Code:", g.game_code, "| Name:", g.name, "| $" + g.price);
      console.log("    Store:", g.store_id, "| Packs:", g._count.packs);
      console.log("");
    });
    console.log("Count:", testGames.length);
  } else {
    console.log("No test games found.");
  }

  console.log("");
  console.log("All games by store:");
  const byStore = new Map<string, typeof games>();
  games.forEach((g) => {
    const list = byStore.get(g.store_id) || [];
    list.push(g);
    byStore.set(g.store_id, list);
  });

  byStore.forEach((storeGames, storeId) => {
    console.log("  Store:", storeId, "- Games:", storeGames.length);
  });
}

checkAllGames()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
