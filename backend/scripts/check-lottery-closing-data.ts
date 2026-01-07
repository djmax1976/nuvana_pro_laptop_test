import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function check() {
  const shiftId = "0a191486-9190-4fd9-b162-9510c4f93b5b";

  // Check LotteryShiftClosing
  const closings = await prisma.lotteryShiftClosing.findMany({
    where: { shift_id: shiftId },
  });
  console.log("=== LOTTERY SHIFT CLOSINGS ===");
  console.log(JSON.stringify(closings, null, 2));

  // Check LotteryTicketSerial count
  const serialCount = await prisma.lotteryTicketSerial.count({
    where: { shift_id: shiftId },
  });
  console.log("\n=== LOTTERY TICKET SERIALS ===");
  console.log("Count:", serialCount);

  // Check LotteryDayPack for this store
  const dayPacks = await prisma.lotteryDayPack.findMany({
    where: {
      day: {
        store_id: "3a9c9d9d-9c81-4e62-b2f3-fdf5ba0b2fe4",
        // eslint-disable-next-line no-restricted-syntax -- Debug script uses hardcoded date
        business_date: new Date("2026-01-06"),
      },
    },
    select: {
      starting_serial: true,
      ending_serial: true,
      tickets_sold: true,
      sales_amount: true,
      pack: { select: { pack_number: true, game: { select: { name: true } } } },
    },
  });
  console.log("\n=== LOTTERY DAY PACKS (Jan 6) ===");
  console.log(JSON.stringify(dayPacks, null, 2));

  // Check what data exists in ShiftSummary for lottery
  const summary = await prisma.shiftSummary.findUnique({
    where: { shift_id: shiftId },
    select: {
      lottery_sales: true,
      lottery_cashes: true,
      lottery_net: true,
      lottery_packs_sold: true,
      lottery_tickets_sold: true,
    },
  });
  console.log("\n=== SHIFT SUMMARY LOTTERY DATA ===");
  console.log(JSON.stringify(summary, null, 2));

  await prisma.$disconnect();
}

check().catch(console.error);
