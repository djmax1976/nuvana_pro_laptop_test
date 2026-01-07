import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Find the Kanta store
  const store = await prisma.store.findFirst({
    where: { name: { contains: "Kanta", mode: "insensitive" } },
    include: { company: true },
  });

  console.log("=== STORE ===");
  console.log("Store ID:", store?.store_id);
  console.log("Store Name:", store?.store_name);
  console.log("Timezone:", store?.timezone);

  if (!store) {
    console.log("No Kanta store found");
    return;
  }

  // Get ALL shifts
  const shifts = await prisma.shift.findMany({
    where: { store_id: store.store_id },
    orderBy: { opened_at: "desc" },
    take: 10,
    include: {
      shift_summary: true,
      lottery_closings: { include: { pack: { include: { game: true } } } },
      cashier: true,
    },
  });

  console.log("\n=== ALL SHIFTS ===");
  for (const s of shifts) {
    console.log("\n-------------------------------------------");
    console.log("Shift ID:", s.shift_id);
    console.log("Cashier:", s.cashier?.first_name, s.cashier?.last_name);
    console.log("Status:", s.status);
    console.log("Opened At:", s.opened_at?.toISOString());
    console.log("Closed At:", s.closed_at?.toISOString());
    console.log(
      "Lottery Closings in this shift:",
      s.lottery_closings?.length || 0,
    );

    if (s.lottery_closings && s.lottery_closings.length > 0) {
      console.log("  LOTTERY CLOSINGS (directly linked to this shift):");
      for (const c of s.lottery_closings) {
        console.log(
          "    Pack:",
          c.pack?.pack_number,
          "Game:",
          c.pack?.game?.game_name,
          "Serial:",
          c.closing_serial,
        );
      }
    }

    if (s.shift_summary) {
      console.log("  SHIFT SUMMARY:");
      console.log("    Summary ID:", s.shift_summary.summary_id);
      console.log("    Business Date:", s.shift_summary.business_date);
      console.log("    Lottery Sales:", s.shift_summary.lottery_sales);
      console.log(
        "    Lottery Tickets Sold:",
        s.shift_summary.lottery_tickets_sold,
      );
      console.log(
        "    Lottery Packs Sold:",
        s.shift_summary.lottery_packs_sold,
      );
    } else {
      console.log("  NO SHIFT SUMMARY RECORD");
    }
  }

  // Get lottery business days
  const days = await prisma.lotteryBusinessDay.findMany({
    where: { store_id: store.store_id },
    orderBy: { business_date: "desc" },
    take: 5,
    include: {
      day_packs: { include: { pack: { include: { game: true } } } },
    },
  });

  console.log("\n\n=== LOTTERY BUSINESS DAYS ===");
  for (const d of days) {
    console.log("\n-------------------------------------------");
    console.log("Day ID:", d.day_id);
    console.log("Business Date:", d.business_date);
    console.log("Status:", d.status);
    console.log("Opened At:", d.opened_at?.toISOString());
    console.log("Closed At:", d.closed_at?.toISOString());
    console.log("Day Packs Count:", d.day_packs?.length || 0);
    for (const dp of d.day_packs || []) {
      console.log(
        "  Pack:",
        dp.pack?.pack_number,
        "Game:",
        dp.pack?.game?.game_name,
      );
      console.log(
        "    Starting:",
        dp.starting_serial,
        "Ending:",
        dp.ending_serial,
      );
      console.log(
        "    Tickets Sold:",
        dp.tickets_sold,
        "Sales Amount:",
        dp.sales_amount,
      );
    }
  }

  // Check if any LotteryShiftClosing records are linked to the wrong shift
  console.log("\n\n=== LOTTERY SHIFT CLOSINGS (ALL) ===");
  const allClosings = await prisma.lotteryShiftClosing.findMany({
    where: {
      shift: { store_id: store.store_id },
    },
    include: {
      pack: { include: { game: true } },
      shift: {
        select: {
          shift_id: true,
          opened_at: true,
          closed_at: true,
          status: true,
        },
      },
    },
    orderBy: { created_at: "desc" },
  });

  for (const c of allClosings) {
    console.log("\n---");
    console.log("Closing ID:", c.closing_id);
    console.log("Pack:", c.pack?.pack_number, "Game:", c.pack?.game?.game_name);
    console.log(
      "Closing Serial:",
      c.closing_serial,
      "Entry Method:",
      c.entry_method,
    );
    console.log("Created At:", c.created_at?.toISOString());
    console.log("LINKED TO SHIFT:", c.shift_id);
    console.log("  Shift Status:", c.shift?.status);
    console.log("  Shift Opened:", c.shift?.opened_at?.toISOString());
    console.log("  Shift Closed:", c.shift?.closed_at?.toISOString());
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
