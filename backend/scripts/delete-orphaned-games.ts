import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function deleteOrphanedGames() {
  // Delete all games with null store_id
  const deleted = await prisma.lotteryGame.deleteMany({
    where: { store_id: null },
  });

  console.log("Deleted orphaned games (store_id = null):", deleted.count);

  // Verify remaining
  const remaining = await prisma.lotteryGame.count();
  console.log("Remaining games:", remaining);
}

deleteOrphanedGames()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
