import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function check() {
  console.log("=== Checking Georgia State ===");
  const ga = await prisma.uSState.findUnique({ where: { code: "GA" } });
  console.log("Georgia state:", JSON.stringify(ga, null, 2));

  console.log("\n=== Checking Lottery Games ===");
  const games = await prisma.lotteryGame.findMany({
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
  console.log("Total games:", games.length);
  console.log("Games:", JSON.stringify(games, null, 2));

  if (ga) {
    console.log("\n=== Games with Georgia state_id ===");
    const gamesWithGa = await prisma.lotteryGame.count({
      where: { state_id: ga.state_id },
    });
    console.log("Count:", gamesWithGa);

    // Check if state_id actually matches
    const matching = games.filter((g) => g.state_id === ga.state_id);
    console.log("Matching games:", matching.length);

    if (games.length > 0 && matching.length === 0) {
      console.log("\n!!! STATE ID MISMATCH !!!");
      console.log("Georgia state_id:", ga.state_id);
      console.log("Game state_ids:", [
        ...new Set(games.map((g) => g.state_id)),
      ]);
    }
  }
}

check()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
