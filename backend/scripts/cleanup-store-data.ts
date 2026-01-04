import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function cleanup() {
  const storeId = "3a9c9d9d-9c81-4e62-b2f3-fdf5ba0b2fe4";

  console.log("Starting cleanup for store:", storeId);
  console.log("");

  // Get business day IDs first for LotteryDayPack deletion
  const businessDays = await prisma.lotteryBusinessDay.findMany({
    where: { store_id: storeId },
    select: { day_id: true },
  });
  const dayIds = businessDays.map((d) => d.day_id);

  // Get shift IDs for LotteryShiftClosing deletion
  const shifts = await prisma.shift.findMany({
    where: { store_id: storeId },
    select: { shift_id: true },
  });
  const shiftIds = shifts.map((s) => s.shift_id);

  // Get day summary IDs for related table cleanup
  const daySummaries = await prisma.daySummary.findMany({
    where: { store_id: storeId },
    select: { day_summary_id: true },
  });
  const daySummaryIds = daySummaries.map((d) => d.day_summary_id);

  // Get shift summary IDs for related table cleanup
  const shiftSummaries = await prisma.shiftSummary.findMany({
    where: { shift_id: { in: shiftIds } },
    select: { shift_summary_id: true },
  });
  const shiftSummaryIds = shiftSummaries.map((s) => s.shift_summary_id);

  // 1. Delete LotteryDayPack
  const d1 = await prisma.lotteryDayPack.deleteMany({
    where: { day_id: { in: dayIds } },
  });
  console.log("Deleted LotteryDayPack:", d1.count);

  // 2. Delete LotteryShiftClosing (via shift_id relation)
  const d2 = await prisma.lotteryShiftClosing.deleteMany({
    where: { shift_id: { in: shiftIds } },
  });
  console.log("Deleted LotteryShiftClosing:", d2.count);

  // 3. Delete LotteryBusinessDay
  const d3 = await prisma.lotteryBusinessDay.deleteMany({
    where: { store_id: storeId },
  });
  console.log("Deleted LotteryBusinessDay:", d3.count);

  // 4. Delete ShiftSummary related tables first
  const d4a = await prisma.shiftTenderSummary.deleteMany({
    where: { shift_summary_id: { in: shiftSummaryIds } },
  });
  console.log("Deleted ShiftTenderSummary:", d4a.count);

  const d4b = await prisma.shiftDepartmentSummary.deleteMany({
    where: { shift_summary_id: { in: shiftSummaryIds } },
  });
  console.log("Deleted ShiftDepartmentSummary:", d4b.count);

  const d4c = await prisma.shiftTaxSummary.deleteMany({
    where: { shift_summary_id: { in: shiftSummaryIds } },
  });
  console.log("Deleted ShiftTaxSummary:", d4c.count);

  const d4d = await prisma.shiftHourlySummary.deleteMany({
    where: { shift_summary_id: { in: shiftSummaryIds } },
  });
  console.log("Deleted ShiftHourlySummary:", d4d.count);

  // 5. Delete ShiftSummary
  const d5 = await prisma.shiftSummary.deleteMany({
    where: { shift_id: { in: shiftIds } },
  });
  console.log("Deleted ShiftSummary:", d5.count);

  // 6. Delete DaySummary related tables first
  const d6a = await prisma.dayTenderSummary.deleteMany({
    where: { day_summary_id: { in: daySummaryIds } },
  });
  console.log("Deleted DayTenderSummary:", d6a.count);

  const d6b = await prisma.dayDepartmentSummary.deleteMany({
    where: { day_summary_id: { in: daySummaryIds } },
  });
  console.log("Deleted DayDepartmentSummary:", d6b.count);

  const d6c = await prisma.dayTaxSummary.deleteMany({
    where: { day_summary_id: { in: daySummaryIds } },
  });
  console.log("Deleted DayTaxSummary:", d6c.count);

  const d6d = await prisma.dayHourlySummary.deleteMany({
    where: { day_summary_id: { in: daySummaryIds } },
  });
  console.log("Deleted DayHourlySummary:", d6d.count);

  // 7. Delete DaySummary
  const d7 = await prisma.daySummary.deleteMany({
    where: { store_id: storeId },
  });
  console.log("Deleted DaySummary:", d7.count);

  // 8. Delete Shift
  const d8 = await prisma.shift.deleteMany({
    where: { store_id: storeId },
  });
  console.log("Deleted Shift:", d8.count);

  console.log("");

  // Verify LotteryPack records remain
  const remaining = await prisma.lotteryPack.count({
    where: { store_id: storeId },
  });
  console.log("Remaining LotteryPack (inventory):", remaining);

  console.log("");
  console.log("Cleanup complete!");
}

cleanup()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
