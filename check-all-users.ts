import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const allUsers = await prisma.user.findMany({
    select: { email: true, name: true },
    orderBy: { email: "asc" },
  });

  console.log(`\nTotal users in database: ${allUsers.length}`);
  console.log("\nAll users:");
  allUsers.forEach((u: { email: string; name: string }) =>
    console.log(`  ${u.email}`),
  );

  const testLocalUsers = allUsers.filter((u: { email: string }) =>
    u.email.includes("test.local"),
  );
  console.log(`\n@test.local users: ${testLocalUsers.length}`);

  const testNuvanaUsers = allUsers.filter((u: { email: string }) =>
    u.email.includes("test.nuvana.local"),
  );
  console.log(`@test.nuvana.local users: ${testNuvanaUsers.length}`);

  await prisma.$disconnect();
}

main();
