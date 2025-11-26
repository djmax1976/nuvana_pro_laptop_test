/**
 * Verify database cleanup - check only admin@nuvana.com remains
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function verifyCleanup() {
  const users = await prisma.user.findMany({
    select: { email: true, name: true, status: true },
  });

  console.log(`\n✨ Database verification:\n`);
  console.log(`Total users: ${users.length}\n`);

  if (users.length === 1 && users[0].email === "admin@nuvana.com") {
    console.log("✅ SUCCESS! Database is clean.");
    console.log(`Only user: ${users[0].email} (${users[0].name})\n`);
  } else {
    console.log("⚠️  WARNING: Found unexpected users:\n");
    users.forEach(
      (
        user: { email: string; name: string; status: string },
        index: number,
      ) => {
        console.log(
          `${index + 1}. ${user.email} (${user.name}) - ${user.status}`,
        );
      },
    );
    console.log("");
  }

  await prisma.$disconnect();
}

verifyCleanup();
