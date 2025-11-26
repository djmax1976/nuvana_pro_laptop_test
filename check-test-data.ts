import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkTestData() {
  const testUsers = await prisma.user.findMany({
    where: {
      email: {
        contains: "test.local",
      },
    },
    select: {
      email: true,
      name: true,
      created_at: true,
    },
    orderBy: {
      created_at: "desc",
    },
  });

  console.log(`\nFound ${testUsers.length} test users in database:`);
  testUsers.forEach((user) => {
    console.log(
      `  - ${user.email} (${user.name}) - Created: ${user.created_at}`,
    );
  });

  // Check for test companies
  const testCompanies = await prisma.company.findMany({
    where: {
      name: {
        contains: "Test Company",
      },
    },
    select: {
      name: true,
      owner_user_id: true,
    },
  });

  console.log(`\nFound ${testCompanies.length} test companies in database:`);
  for (const company of testCompanies) {
    const owner = await prisma.user.findUnique({
      where: { user_id: company.owner_user_id },
      select: { email: true, name: true },
    });
    console.log(`  - ${company.name} (Owner: ${owner?.email || "DELETED"})`);
  }

  // Check for orphaned user_roles with test data
  const orphanedRoles = await prisma.userRole.findMany({
    where: {
      user: {
        email: {
          contains: "test.local",
        },
      },
    },
    select: {
      user_role_id: true,
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  console.log(`\nFound ${orphanedRoles.length} orphaned test user roles:`);
  orphanedRoles.forEach((role) => {
    console.log(`  - Role ${role.user_role_id} for ${role.user.email}`);
  });

  await prisma.$disconnect();
}

checkTestData().catch(console.error);
