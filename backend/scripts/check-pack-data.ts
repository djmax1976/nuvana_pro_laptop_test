import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkData() {
  const shiftId = "0a191486-9190-4fd9-b162-9510c4f93b5b";

  const shift = await prisma.shift.findUnique({
    where: { shift_id: shiftId },
    select: {
      shift_id: true,
      store_id: true,
      opened_at: true,
      closed_at: true,
      status: true,
    },
  });
  console.log("=== SHIFT ===");
  console.log(JSON.stringify(shift, null, 2));

  if (!shift) {
    console.log("Shift not found");
    await prisma.$disconnect();
    return;
  }

  const lotteryDay = await prisma.lotteryBusinessDay.findFirst({
    where: {
      store_id: shift.store_id,
      // eslint-disable-next-line no-restricted-syntax -- Script uses hardcoded date for debugging
      business_date: new Date("2026-01-06"),
    },
    select: {
      day_id: true,
      business_date: true,
      status: true,
      opened_at: true,
      closed_at: true,
    },
  });
  console.log("\n=== LOTTERY BUSINESS DAY (Jan 6) ===");
  console.log(JSON.stringify(lotteryDay, null, 2));

  const depletedPacks = await prisma.lotteryPack.findMany({
    where: {
      store_id: shift.store_id,
      status: "DEPLETED",
    },
    select: {
      pack_id: true,
      pack_number: true,
      status: true,
      depleted_at: true,
      depleted_by: true,
      depleted_shift_id: true,
      depletion_reason: true,
      game: { select: { name: true } },
    },
  });
  console.log("\n=== DEPLETED PACKS ===");
  console.log(JSON.stringify(depletedPacks, null, 2));

  const returnedPacks = await prisma.lotteryPack.findMany({
    where: {
      store_id: shift.store_id,
      status: "RETURNED",
    },
    select: {
      pack_id: true,
      pack_number: true,
      status: true,
      returned_at: true,
      returned_by: true,
      returned_shift_id: true,
      returned_day_id: true,
      return_reason: true,
      return_notes: true,
      last_sold_serial: true,
      tickets_sold_on_return: true,
      return_sales_amount: true,
      game: { select: { name: true } },
    },
  });
  console.log("\n=== RETURNED PACKS ===");
  console.log(JSON.stringify(returnedPacks, null, 2));

  // Get activated packs ordered by date
  const activatedPacks = await prisma.lotteryPack.findMany({
    where: {
      store_id: shift.store_id,
      activated_at: { not: null },
    },
    orderBy: { activated_at: "desc" },
    take: 10,
    select: {
      pack_id: true,
      pack_number: true,
      status: true,
      activated_at: true,
      game: { select: { name: true, game_number: true } },
    },
  });
  console.log("\n=== RECENTLY ACTIVATED PACKS ===");
  console.log(JSON.stringify(activatedPacks, null, 2));

  await prisma.$disconnect();
}

checkData().catch(console.error);
