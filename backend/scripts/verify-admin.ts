import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    const admin = await prisma.user.findUnique({
      where: { email: "admin@nuvana.com" },
      include: {
        user_roles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (admin) {
      console.log("✅ Admin user found in database:");
      console.log(`   Email: ${admin.email}`);
      console.log(`   Name: ${admin.name}`);
      console.log(`   Status: ${admin.status}`);
      console.log(`   User ID: ${admin.user_id}`);
      console.log(`\n   Roles:`);
      admin.user_roles.forEach((ur) => {
        console.log(`     - ${ur.role.code} (${ur.role.scope})`);
      });
    } else {
      console.log("❌ Admin user not found");
    }
  } catch (error) {
    console.error("❌ Database connection error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
