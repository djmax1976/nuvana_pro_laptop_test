import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function resetPacks() {
  const storeId = "3a9c9d9d-9c81-4e62-b2f3-fdf5ba0b2fe4";

  console.log("Resetting LotteryPack records for store:", storeId);
  console.log("");

  // Show current state
  const before = await prisma.lotteryPack.findMany({
    where: { store_id: storeId },
    select: {
      pack_id: true,
      pack_number: true,
      status: true,
      current_bin_id: true,
      tickets_sold_count: true,
      activated_at: true,
      depleted_at: true,
    },
  });

  console.log("Before reset:");
  const activated = before.filter((p) => p.activated_at !== null);
  const depleted = before.filter((p) => p.depleted_at !== null);
  const inBins = before.filter((p) => p.current_bin_id !== null);
  const withSales = before.filter(
    (p) => p.tickets_sold_count && p.tickets_sold_count > 0,
  );

  console.log("  Activated:", activated.length);
  console.log("  Depleted:", depleted.length);
  console.log("  In bins:", inBins.length);
  console.log("  With tickets_sold_count > 0:", withSales.length);
  console.log("");

  // Reset all packs to RECEIVED status
  const result = await prisma.lotteryPack.updateMany({
    where: { store_id: storeId },
    data: {
      status: "RECEIVED",
      activated_at: null,
      activated_by: null,
      activated_shift_id: null,
      depleted_at: null,
      depleted_by: null,
      depleted_shift_id: null,
      depletion_reason: null,
      tickets_sold_count: 0,
      last_sold_at: null,
      current_bin_id: null,
    },
  });

  console.log("Reset", result.count, "packs to RECEIVED status");
  console.log("");
  console.log("All packs now show as received but not activated.");
}

resetPacks()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
