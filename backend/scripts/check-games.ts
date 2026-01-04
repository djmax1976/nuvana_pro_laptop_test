import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkGames() {
  const storeId = "3a9c9d9d-9c81-4e62-b2f3-fdf5ba0b2fe4";

  // Get all lottery games for this store
  const games = await prisma.lotteryGame.findMany({
    where: { store_id: storeId },
    select: {
      game_id: true,
      game_code: true,
      name: true,
      price: true,
      created_at: true,
      _count: {
        select: { packs: true },
      },
    },
    orderBy: { created_at: "asc" },
  });

  console.log("Total games found:", games.length);
  console.log("");
  console.log("Games with NO packs (potential garbage):");
  const gamesNoPacks = games.filter((g) => g._count.packs === 0);
  gamesNoPacks.forEach((g) => {
    console.log(
      "  -",
      g.game_code,
      "|",
      g.name,
      "| $" + g.price,
      "| Created:",
      g.created_at.toISOString().split("T")[0],
    );
  });
  console.log("  Count:", gamesNoPacks.length);

  console.log("");
  console.log("Games WITH packs (real data):");
  const gamesWithPacks = games.filter((g) => g._count.packs > 0);
  gamesWithPacks.forEach((g) => {
    console.log(
      "  -",
      g.game_code,
      "|",
      g.name,
      "| $" + g.price,
      "| Packs:",
      g._count.packs,
    );
  });
  console.log("  Count:", gamesWithPacks.length);
}

checkGames()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
