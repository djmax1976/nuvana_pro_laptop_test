import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PROTECTED_EMAILS = [
  "superadmin@nuvana.com",
  "admin@nuvana.com",
  "corporate@nuvana.com",
  "manager@nuvana.com",
];

async function checkTestData() {
  console.log("🔍 Checking for test data in database...\n");

  try {
    // Get non-protected users
    const users = await prisma.user.findMany({
      where: {
        email: {
          notIn: PROTECTED_EMAILS,
        },
      },
      select: {
        email: true,
        name: true,
      },
    });

    // Get all companies
    const companies = await prisma.company.findMany({
      select: {
        name: true,
        company_id: true,
      },
    });

    // Get all stores
    const stores = await prisma.store.findMany({
      select: {
        name: true,
        store_id: true,
      },
    });

    console.log(`📊 Current Test Data:\n`);
    console.log(`👥 Users (${users.length} non-protected):`);
    if (users.length > 0) {
      users.forEach((u) => console.log(`   - ${u.email} (${u.name})`));
    } else {
      console.log("   (none)");
    }

    console.log(`\n🏢 Companies (${companies.length}):`);
    if (companies.length > 0) {
      companies.forEach((c) => console.log(`   - ${c.name}`));
    } else {
      console.log("   (none)");
    }

    console.log(`\n🏪 Stores (${stores.length}):`);
    if (stores.length > 0) {
      stores.forEach((s: { name: string; store_id: string }) =>
        console.log(`   - ${s.name} (${s.store_id})`),
      );
    } else {
      console.log("   (none)");
    }

    console.log("\n✅ Check complete");
  } catch (error) {
    console.error("❌ Error checking test data:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkTestData();
