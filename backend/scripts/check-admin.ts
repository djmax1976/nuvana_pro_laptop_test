import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function check() {
  const user = await prisma.user.findUnique({
    where: { email: "admin@nuvana.com" },
    include: {
      user_roles: {
        include: {
          role: true,
        },
      },
    },
  });

  console.log("USER:", JSON.stringify(user, null, 2));

  const roles = await prisma.role.findMany();
  console.log("\nALL ROLES:", JSON.stringify(roles, null, 2));

  if (user) {
    const userRoles = await prisma.userRole.findMany({
      where: { user_id: user.user_id },
    });
    console.log("\nUSER_ROLES for admin:", JSON.stringify(userRoles, null, 2));
  }

  await prisma.$disconnect();
}

check();
