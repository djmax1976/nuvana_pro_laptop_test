import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: "store-e2e@test.com" },
    include: {
      user_roles: {
        include: { role: true },
      },
    },
  });

  if (!user) {
    console.log("User NOT FOUND");
  } else {
    console.log("User:", {
      email: user.email,
      status: user.status,
      hasPassword: user.password_hash
        ? user.password_hash.substring(0, 10) + "..."
        : "NONE",
      roles: user.user_roles.map((ur) => ur.role.code),
    });
  }

  await prisma.$disconnect();
}

main().catch(console.error);
