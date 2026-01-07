import { PrismaClient } from "@prisma/client";
import { ShiftService } from "../src/services/shift.service";

const prisma = new PrismaClient();

async function main() {
  const storeId = "3a9c9d9d-9c81-4e62-b2f3-fdf5ba0b2fe4"; // Kanta Food Products Store #1

  // Get all shifts for this store
  const shifts = await prisma.shift.findMany({
    where: { store_id: storeId },
    orderBy: { opened_at: "desc" },
    include: {
      shift_summary: true,
      lottery_closings: true,
      cashier: true,
    },
  });

  console.log("=== SHIFT ANALYSIS ===\n");

  for (const shift of shifts) {
    console.log("=".repeat(60));
    console.log("SHIFT:", shift.shift_id);
    console.log("Status:", shift.status);
    console.log("Opened:", shift.opened_at?.toISOString());
    console.log("Closed:", shift.closed_at?.toISOString());
    console.log(
      "Direct Lottery Closings in lottery_shift_closing table:",
      shift.lottery_closings.length,
    );

    if (shift.shift_summary) {
      console.log("\nSHIFT SUMMARY:");
      console.log("  Business Date:", shift.shift_summary.business_date);
      console.log("  Lottery Sales:", shift.shift_summary.lottery_sales);
      console.log(
        "  Lottery Tickets:",
        shift.shift_summary.lottery_tickets_sold,
      );
    }

    // Now let's see what the API would return for lottery business day
    if (shift.closed_at || shift.opened_at) {
      const shiftDate = shift.closed_at || shift.opened_at;
      const businessDateStr = shiftDate!.toISOString().split("T")[0];
      console.log("\n  LOTTERY LOOKUP (using shift.closed_at):");
      console.log("    shift.closed_at:", shift.closed_at?.toISOString());
      console.log("    Calculated business_date:", businessDateStr);

      const lotteryDay = await prisma.lotteryBusinessDay.findUnique({
        where: {
          store_id_business_date: {
            store_id: storeId,
            business_date: new Date(businessDateStr),
          },
        },
        include: {
          day_packs: { include: { pack: { include: { game: true } } } },
        },
      });

      if (lotteryDay) {
        console.log("    FOUND LotteryBusinessDay:", lotteryDay.day_id);
        console.log("    LotteryDay status:", lotteryDay.status);
        console.log(
          "    LotteryDay closed_at:",
          lotteryDay.closed_at?.toISOString(),
        );
        console.log("    Day Packs:", lotteryDay.day_packs.length);
        for (const dp of lotteryDay.day_packs) {
          console.log(
            "      -",
            dp.pack.pack_number,
            dp.pack.game.game_name,
            "tickets:",
            dp.tickets_sold,
          );
        }
      } else {
        console.log("    NO LotteryBusinessDay found for", businessDateStr);
      }
    }

    console.log("\n");
  }

  // Also show all lottery business days
  console.log("=".repeat(60));
  console.log("ALL LOTTERY BUSINESS DAYS:");
  const allDays = await prisma.lotteryBusinessDay.findMany({
    where: { store_id: storeId },
    orderBy: { business_date: "desc" },
    include: {
      day_packs: { include: { pack: { include: { game: true } } } },
    },
  });

  for (const day of allDays) {
    console.log(
      "\nDay:",
      day.business_date,
      "Status:",
      day.status,
      "Closed:",
      day.closed_at?.toISOString(),
    );
    for (const dp of day.day_packs) {
      console.log(
        "  -",
        dp.pack.pack_number,
        dp.pack.game.game_name,
        "tickets:",
        dp.tickets_sold,
      );
    }
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
