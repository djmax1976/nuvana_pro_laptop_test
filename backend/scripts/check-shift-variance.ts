import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function check() {
  const shiftId = "0a191486-9190-4fd9-b162-9510c4f93b5b";

  // Get shift data
  const shift = await prisma.shift.findUnique({
    where: { shift_id: shiftId },
    select: {
      shift_id: true,
      opening_cash: true,
      closing_cash: true,
      expected_cash: true,
      variance: true,
      status: true,
    },
  });
  console.log("=== SHIFT DATA ===");
  console.log(JSON.stringify(shift, null, 2));

  // Get shift summary with correct field names
  const summary = await prisma.shiftSummary.findUnique({
    where: { shift_id: shiftId },
    select: {
      shift_id: true,
      business_date: true,
      lottery_sales: true,
      lottery_cashes: true,
      lottery_net: true,
      lottery_packs_sold: true,
      lottery_tickets_sold: true,
      gross_sales: true,
      returns_total: true,
      opening_cash: true,
      closing_cash: true,
      expected_cash: true,
      cash_variance: true,
      variance_percentage: true,
      variance_reason: true,
    },
  });
  console.log("\n=== SHIFT SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));

  // Get tender summaries
  if (summary) {
    const tenders = await prisma.tenderSummary.findMany({
      where: { shift_summary_id: summary.shift_id },
      select: {
        tender_code: true,
        tender_name: true,
        total_amount: true,
        transaction_count: true,
      },
    });
    console.log("\n=== TENDER SUMMARIES ===");
    console.log(JSON.stringify(tenders, null, 2));

    // Get department summaries
    const departments = await prisma.departmentSummary.findMany({
      where: { shift_summary_id: summary.shift_id },
      select: {
        department_code: true,
        department_name: true,
        total_sales: true,
        total_refunds: true,
        net_sales: true,
      },
    });
    console.log("\n=== DEPARTMENT SUMMARIES ===");
    console.log(JSON.stringify(departments, null, 2));
  }

  // Get lottery shift closing
  const lotteryClosing = await prisma.lotteryShiftClosing.findFirst({
    where: { shift_id: shiftId },
    select: {
      closing_id: true,
      shift_id: true,
      total_sales: true,
      total_cashes: true,
      net_sales: true,
      variance: true,
      notes: true,
      closed_at: true,
    },
  });
  console.log("\n=== LOTTERY SHIFT CLOSING ===");
  console.log(JSON.stringify(lotteryClosing, null, 2));

  // Get lottery variances
  const variances = await prisma.lotteryVariance.findMany({
    where: { shift_id: shiftId },
    select: {
      variance_id: true,
      pack_id: true,
      expected_serial: true,
      actual_serial: true,
      variance_amount: true,
      variance_reason: true,
      recorded_at: true,
    },
  });
  console.log("\n=== LOTTERY VARIANCES ===");
  console.log(JSON.stringify(variances, null, 2));

  await prisma.$disconnect();
}

check().catch(console.error);
