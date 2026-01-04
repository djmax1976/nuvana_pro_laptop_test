import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkAllPacks() {
  // All packs in database
  const allPacks = await prisma.lotteryPack.count();
  console.log("Total packs in entire database:", allPacks);

  // Packs by store
  const packsByStore = await prisma.lotteryPack.groupBy({
    by: ["store_id"],
    _count: { pack_id: true },
  });

  console.log("");
  console.log("Packs by store_id:");
  packsByStore.forEach((g) => {
    console.log("  Store:", g.store_id, "- Packs:", g._count.pack_id);
  });

  // Check for orphaned packs (null store_id)
  const orphanedPacks = await prisma.lotteryPack.count({
    where: { store_id: null },
  });
  console.log("");
  console.log("Orphaned packs (store_id = null):", orphanedPacks);
}

checkAllPacks()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
