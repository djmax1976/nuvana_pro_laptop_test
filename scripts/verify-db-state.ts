import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function verifyCleanup() {
  try {
    const users = await prisma.user.findMany();
    const companies = await prisma.company.findMany();
    const stores = await prisma.store.findMany();
    const userRoles = await prisma.userRole.findMany();

    console.log("\n=== Database Status After Cleanup ===");
    console.log(`\n👤 Users: ${users.length}`);
    users.forEach((u: { email: string; name: string }) =>
      console.log(`   - ${u.email} (${u.name})`),
    );

    console.log(`\n🏢 Companies: ${companies.length}`);
    console.log(`🏪 Stores: ${stores.length}`);
    console.log(`🔐 User Roles: ${userRoles.length}`);

    if (users.length === 1 && users[0].email === "admin@nuvana.com") {
      console.log("\n✅ SUCCESS: Only superadmin remains!");
    } else {
      console.log("\n⚠️  WARNING: Unexpected state detected!");
    }
  } catch (error) {
    console.error("❌ Error during verification:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

verifyCleanup();
