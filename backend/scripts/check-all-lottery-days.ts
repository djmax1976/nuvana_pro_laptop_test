import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkLotteryDays() {
  const storeId = "3a9c9d9d-9c81-4e62-b2f3-fdf5ba0b2fe4";

  const lotteryDays = await prisma.lotteryBusinessDay.findMany({
    where: { store_id: storeId },
    orderBy: { business_date: "desc" },
    select: {
      day_id: true,
      business_date: true,
      status: true,
      opened_at: true,
      closed_at: true,
    },
  });

  console.log("=== ALL LOTTERY BUSINESS DAYS ===");
  for (const day of lotteryDays) {
    console.log(`\nDay: ${day.business_date.toISOString().split("T")[0]}`);
    console.log(`  Status: ${day.status}`);
    console.log(`  Opened: ${day.opened_at?.toISOString()}`);
    console.log(`  Closed: ${day.closed_at?.toISOString()}`);
  }

  // Check the returned pack timing
  const returnedPack = await prisma.lotteryPack.findFirst({
    where: { pack_number: "0112756" },
    select: {
      pack_number: true,
      returned_at: true,
      game: { select: { name: true } },
    },
  });
  console.log("\n=== RETURNED PACK TIMING ===");
  console.log(JSON.stringify(returnedPack, null, 2));

  // Check if the return falls within Jan 6 boundaries
  const jan6Day = lotteryDays.find(
    (d) => d.business_date.toISOString().split("T")[0] === "2026-01-06",
  );
  if (jan6Day && returnedPack?.returned_at) {
    const returnTime = returnedPack.returned_at.getTime();
    const dayStart = jan6Day.opened_at?.getTime() || 0;
    const dayEnd = jan6Day.closed_at?.getTime() || Infinity;

    console.log("\n=== TIMING CHECK ===");
    console.log(`Return at: ${returnedPack.returned_at.toISOString()}`);
    console.log(`Day opened at: ${jan6Day.opened_at?.toISOString()}`);
    console.log(`Day closed at: ${jan6Day.closed_at?.toISOString()}`);
    console.log(`Return >= Day Start? ${returnTime >= dayStart}`);
    console.log(`Return <= Day End? ${returnTime <= dayEnd}`);
    console.log(
      `Return is within day? ${returnTime >= dayStart && returnTime <= dayEnd}`,
    );
  }

  await prisma.$disconnect();
}

checkLotteryDays().catch(console.error);
