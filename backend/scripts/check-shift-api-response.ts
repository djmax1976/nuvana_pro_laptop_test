import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function check() {
  const shiftId = "0a191486-9190-4fd9-b162-9510c4f93b5b";

  // Get shift with all relevant fields
  const shift = await prisma.shift.findUnique({
    where: { shift_id: shiftId },
    select: {
      shift_id: true,
      opening_cash: true,
      closing_cash: true,
      expected_cash: true,
      variance: true,
      variance_reason: true,
      status: true,
    },
  });
  console.log("=== SHIFT RECORD ===");
  console.log(JSON.stringify(shift, null, 2));

  // Get shift summary with cash fields
  const summary = await prisma.shiftSummary.findUnique({
    where: { shift_id: shiftId },
    select: {
      shift_id: true,
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

  await prisma.$disconnect();
}

check().catch(console.error);
