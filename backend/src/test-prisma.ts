/**
 * Test script to verify Prisma Client setup and database connection
 * Run with: npx ts-node src/test-prisma.ts
 */

import { PrismaClient } from "@prisma/client";
import { generatePublicId, PUBLIC_ID_PREFIXES } from "./utils/public-id";

const prisma = new PrismaClient();

async function testPrismaClient() {
  try {
    console.log("Testing Prisma Client connection...");

    // Test database connection
    await prisma.$connect();
    console.log("✅ Database connection successful");

    // Test creating a Company record
    console.log("Testing Company creation...");
    const company = await prisma.company.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.COMPANY),
        name: "Test Company",
        status: "ACTIVE",
      },
    });
    console.log("✅ Company created:", company);

    // Test querying the Company record
    console.log("Testing Company query...");
    const foundCompany = await prisma.company.findUnique({
      where: { company_id: company.company_id },
    });
    console.log("✅ Company found:", foundCompany);

    // Clean up test data
    await prisma.company.delete({
      where: { company_id: company.company_id },
    });
    console.log("✅ Test data cleaned up");

    console.log("\n✅ All Prisma Client tests passed!");
  } catch (error) {
    console.error("❌ Error testing Prisma Client:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testPrismaClient()
  .then(() => {
    console.log("Test completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Test failed:", error);
    process.exit(1);
  });
