import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    take: 10,
    orderBy: { created_at: "desc" },
    select: { email: true, created_at: true, status: true },
  });
  console.log("Recent users:", JSON.stringify(users, null, 2));

  await prisma.$disconnect();
}

main().catch(console.error);
