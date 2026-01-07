/**
 * Fix ShiftSummary lottery data for a specific shift
 *
 * This script updates the ShiftSummary with correct lottery data from LotteryDayPack
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function fixShiftSummaryLottery(shiftId: string) {
  console.log(`Fixing lottery data for shift: ${shiftId}`);

  // Get shift details
  const shift = await prisma.shift.findUnique({
    where: { shift_id: shiftId },
    select: {
      shift_id: true,
      store_id: true,
      opened_at: true,
      closed_at: true,
    },
  });

  if (!shift) {
    console.error("Shift not found");
    return;
  }

  // Determine business date from closed_at
  const businessDate = shift.closed_at || shift.opened_at;
  const businessDateStr = businessDate.toISOString().split("T")[0];
  console.log(`Business date: ${businessDateStr}`);

  // Get lottery day data
  const lotteryDay = await prisma.lotteryBusinessDay.findUnique({
    where: {
      store_id_business_date: {
        store_id: shift.store_id,
        business_date: new Date(businessDateStr),
      },
    },
    include: {
      day_packs: {
        select: {
          tickets_sold: true,
          sales_amount: true,
        },
      },
    },
  });

  if (!lotteryDay) {
    console.log("No lottery business day found");
    return;
  }

  console.log(`Lottery day status: ${lotteryDay.status}`);
  console.log(`Day packs count: ${lotteryDay.day_packs.length}`);

  // Calculate totals from day packs
  const binsales = lotteryDay.day_packs.reduce(
    (sum, pack) => sum + Number(pack.sales_amount || 0),
    0,
  );
  const binTickets = lotteryDay.day_packs.reduce(
    (sum, pack) => sum + (pack.tickets_sold || 0),
    0,
  );

  console.log(`Bin sales: $${binsales}, tickets: ${binTickets}`);

  // Get returned packs
  const returnedPacks = await prisma.lotteryPack.findMany({
    where: {
      store_id: shift.store_id,
      status: "RETURNED",
      returned_at: {
        gte: shift.opened_at,
        lte: shift.closed_at || new Date(),
      },
    },
    select: {
      pack_number: true,
      return_sales_amount: true,
      tickets_sold_on_return: true,
    },
  });

  const returnedSales = returnedPacks.reduce(
    (sum, pack) => sum + Number(pack.return_sales_amount || 0),
    0,
  );
  const returnedTickets = returnedPacks.reduce(
    (sum, pack) => sum + (pack.tickets_sold_on_return || 0),
    0,
  );

  console.log(
    `Returned pack sales: $${returnedSales}, tickets: ${returnedTickets}`,
  );
  console.log(
    `Returned packs:`,
    returnedPacks.map((p) => p.pack_number),
  );

  const totalSales = binsales + returnedSales;
  const totalTickets = binTickets + returnedTickets;
  const cashes = 0; // Not tracked yet

  console.log(`\nTotal lottery sales: $${totalSales}`);
  console.log(`Total tickets sold: ${totalTickets}`);
  console.log(`Packs sold: ${lotteryDay.day_packs.length}`);

  // Update ShiftSummary
  const updated = await prisma.shiftSummary.update({
    where: { shift_id: shiftId },
    data: {
      lottery_sales: totalSales,
      lottery_cashes: cashes,
      lottery_net: totalSales - cashes,
      lottery_packs_sold: lotteryDay.day_packs.length,
      lottery_tickets_sold: totalTickets,
    },
  });

  console.log("\n=== UPDATED SHIFT SUMMARY ===");
  console.log(`lottery_sales: $${updated.lottery_sales}`);
  console.log(`lottery_cashes: $${updated.lottery_cashes}`);
  console.log(`lottery_net: $${updated.lottery_net}`);
  console.log(`lottery_packs_sold: ${updated.lottery_packs_sold}`);
  console.log(`lottery_tickets_sold: ${updated.lottery_tickets_sold}`);

  await prisma.$disconnect();
}

// Run for the specific shift
fixShiftSummaryLottery("0a191486-9190-4fd9-b162-9510c4f93b5b").catch(
  console.error,
);
