import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const storeId = "3a9c9d9d-9c81-4e62-b2f3-fdf5ba0b2fe4"; // Kanta Food Products Store #1

  console.log("=".repeat(70));
  console.log("ANALYSIS: What Data Exists When Day Is Closed?");
  console.log("=".repeat(70));

  // 1. Check DaySummary records
  console.log("\n### 1. DAY SUMMARY RECORDS ###");
  const daySummaries = await prisma.daySummary.findMany({
    where: { store_id: storeId },
    orderBy: { business_date: "desc" },
    include: {
      closed_by_user: { select: { email: true, name: true } },
      tender_summaries: true,
      department_summaries: true,
    },
  });

  if (daySummaries.length === 0) {
    console.log("  NO DaySummary records found!");
  } else {
    for (const ds of daySummaries) {
      console.log("\n  ---");
      console.log("  Day Summary ID:", ds.day_summary_id);
      console.log("  Business Date:", ds.business_date);
      console.log("  Status:", ds.status);
      console.log("  Shift Count:", ds.shift_count);
      console.log(
        "  First Shift Opened:",
        ds.first_shift_opened?.toISOString(),
      );
      console.log("  Last Shift Closed:", ds.last_shift_closed?.toISOString());
      console.log("  Closed At:", ds.closed_at?.toISOString());
      console.log("  Closed By:", ds.closed_by_user?.email || "N/A");
      console.log("  Lottery Sales:", ds.lottery_sales);
      console.log("  Lottery Tickets Sold:", ds.lottery_tickets_sold);
      console.log("  Tender Summaries:", ds.tender_summaries.length);
      console.log("  Department Summaries:", ds.department_summaries.length);
    }
  }

  // 2. Check LotteryBusinessDay records
  console.log("\n\n### 2. LOTTERY BUSINESS DAY RECORDS ###");
  const lotteryDays = await prisma.lotteryBusinessDay.findMany({
    where: { store_id: storeId },
    orderBy: { business_date: "desc" },
    include: {
      closedByUser: { select: { email: true, name: true } },
      day_packs: { include: { pack: { include: { game: true } } } },
    },
  });

  if (lotteryDays.length === 0) {
    console.log("  NO LotteryBusinessDay records found!");
  } else {
    for (const ld of lotteryDays) {
      console.log("\n  ---");
      console.log("  Lottery Day ID:", ld.day_id);
      console.log("  Business Date:", ld.business_date);
      console.log("  Status:", ld.status);
      console.log("  Opened At:", ld.opened_at?.toISOString());
      console.log("  Closed At:", ld.closed_at?.toISOString());
      console.log("  Closed By:", ld.closedByUser?.email || "N/A");
      console.log("  Day Packs:", ld.day_packs.length);
      let totalTickets = 0;
      let totalSales = 0;
      for (const dp of ld.day_packs) {
        totalTickets += dp.tickets_sold || 0;
        totalSales += Number(dp.sales_amount || 0);
        console.log(
          `    - Pack ${dp.pack.pack_number}: ${dp.starting_serial} -> ${dp.ending_serial} = ${dp.tickets_sold} tickets`,
        );
      }
      console.log("  TOTAL Tickets:", totalTickets, "Sales:", totalSales);
    }
  }

  // 3. Check ShiftSummary records
  console.log("\n\n### 3. SHIFT SUMMARY RECORDS ###");
  const shiftSummaries = await prisma.shiftSummary.findMany({
    where: { store_id: storeId },
    orderBy: { business_date: "desc" },
    include: {
      shift: {
        select: {
          shift_id: true,
          opened_at: true,
          closed_at: true,
          status: true,
          cashier: { select: { name: true } },
        },
      },
      tender_summaries: true,
      department_summaries: true,
    },
  });

  if (shiftSummaries.length === 0) {
    console.log("  NO ShiftSummary records found!");
  } else {
    for (const ss of shiftSummaries) {
      console.log("\n  ---");
      console.log("  Shift Summary ID:", ss.summary_id);
      console.log("  Business Date:", ss.business_date);
      console.log("  Shift ID:", ss.shift_id);
      console.log("  Cashier:", ss.shift?.cashier?.name);
      console.log("  Shift Opened:", ss.shift?.opened_at?.toISOString());
      console.log("  Shift Closed:", ss.shift?.closed_at?.toISOString());
      console.log("  Lottery Sales:", ss.lottery_sales);
      console.log("  Lottery Tickets Sold:", ss.lottery_tickets_sold);
      console.log("  Tender Summaries:", ss.tender_summaries.length);
      console.log("  Department Summaries:", ss.department_summaries.length);
    }
  }

  // 4. Check if there's any relationship between them
  console.log("\n\n### 4. RELATIONSHIP ANALYSIS ###");
  console.log("Can we link these records by business_date?");

  const dateMap = new Map<
    string,
    { daySummary: any; lotteryDay: any; shifts: any[] }
  >();

  for (const ds of daySummaries) {
    const dateStr = ds.business_date.toISOString().split("T")[0];
    if (!dateMap.has(dateStr))
      dateMap.set(dateStr, { daySummary: null, lotteryDay: null, shifts: [] });
    dateMap.get(dateStr)!.daySummary = ds;
  }

  for (const ld of lotteryDays) {
    const dateStr = ld.business_date.toISOString().split("T")[0];
    if (!dateMap.has(dateStr))
      dateMap.set(dateStr, { daySummary: null, lotteryDay: null, shifts: [] });
    dateMap.get(dateStr)!.lotteryDay = ld;
  }

  for (const ss of shiftSummaries) {
    const dateStr = ss.business_date.toISOString().split("T")[0];
    if (!dateMap.has(dateStr))
      dateMap.set(dateStr, { daySummary: null, lotteryDay: null, shifts: [] });
    dateMap.get(dateStr)!.shifts.push(ss);
  }

  for (const [date, data] of dateMap) {
    console.log(`\n  ${date}:`);
    console.log(
      `    DaySummary: ${data.daySummary ? "EXISTS (status=" + data.daySummary.status + ")" : "MISSING"}`,
    );
    console.log(
      `    LotteryBusinessDay: ${data.lotteryDay ? "EXISTS (status=" + data.lotteryDay.status + ")" : "MISSING"}`,
    );
    console.log(`    ShiftSummaries: ${data.shifts.length} shifts`);
    for (const ss of data.shifts) {
      console.log(
        `      - Shift ${ss.shift_id.slice(0, 8)}... (lottery_sales: ${ss.lottery_sales})`,
      );
    }
  }

  console.log("\n\n### 5. CONCLUSION ###");
  console.log("The system already saves:");
  console.log(
    "  - LotteryBusinessDay: Lottery data per day (bins closed, tickets sold)",
  );
  console.log("  - DaySummary: Aggregated sales/cash data per day");
  console.log("  - ShiftSummary: Per-shift sales/cash data");
  console.log(
    "\nBoth DaySummary and LotteryBusinessDay use business_date as key.",
  );
  console.log(
    "They can be joined by (store_id + business_date) to show combined Day Close data.",
  );
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
