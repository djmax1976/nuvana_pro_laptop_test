import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkAndClearBinHistory() {
  const storeId = "3a9c9d9d-9c81-4e62-b2f3-fdf5ba0b2fe4";

  // Get pack IDs for this store
  const packs = await prisma.lotteryPack.findMany({
    where: { store_id: storeId },
    select: { pack_id: true },
  });
  const packIds = packs.map((p) => p.pack_id);

  // Check bin history
  const binHistory = await prisma.lotteryPackBinHistory.findMany({
    where: { pack_id: { in: packIds } },
  });

  console.log("Bin history records found:", binHistory.length);

  if (binHistory.length > 0) {
    const deleted = await prisma.lotteryPackBinHistory.deleteMany({
      where: { pack_id: { in: packIds } },
    });
    console.log("Deleted bin history records:", deleted.count);
  } else {
    console.log("No bin history to delete.");
  }
}

checkAndClearBinHistory()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
