import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function check() {
  const pack = await prisma.lotteryPack.findFirst({
    where: { pack_number: "0170092" },
    select: {
      pack_number: true,
      status: true,
      depleted_at: true,
      depletion_reason: true,
      tickets_sold_count: true,
      last_sold_serial: true,
      serial_start: true,
      serial_end: true,
      game: { select: { name: true, price: true, tickets_per_pack: true } },
    },
  });
  console.log("Depleted pack:");
  console.log(JSON.stringify(pack, null, 2));

  // Also check what LotteryDayPack has for this pack
  const dayPack = await prisma.lotteryDayPack.findFirst({
    where: {
      pack: { pack_number: "0170092" },
    },
    select: {
      starting_serial: true,
      ending_serial: true,
      tickets_sold: true,
      sales_amount: true,
      day: { select: { business_date: true, status: true } },
    },
  });
  console.log("\nLotteryDayPack:");
  console.log(JSON.stringify(dayPack, null, 2));

  await prisma.$disconnect();
}

check().catch(console.error);
