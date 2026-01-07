import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function check() {
  const dayPack = await prisma.lotteryDayPack.findFirst({
    where: {
      pack: { pack_number: "0112756" },
    },
    select: {
      starting_serial: true,
      ending_serial: true,
      tickets_sold: true,
      sales_amount: true,
      day: { select: { business_date: true, status: true } },
    },
  });
  console.log("LotteryDayPack for returned pack 0112756:");
  console.log(JSON.stringify(dayPack, null, 2));
  await prisma.$disconnect();
}

check().catch(console.error);
