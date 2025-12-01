const { PrismaClient } = require('../../backend/node_modules/@prisma/client');

async function checkRoles() {
  const prisma = new PrismaClient();
  try {
    const clientOwner = await prisma.role.findUnique({ where: { code: 'CLIENT_OWNER' } });
    console.log('CLIENT_OWNER:', clientOwner ? 'EXISTS' : 'NOT FOUND');

    const clientUser = await prisma.role.findUnique({ where: { code: 'CLIENT_USER' } });
    console.log('CLIENT_USER:', clientUser ? 'EXISTS' : 'NOT FOUND');
  } finally {
    await prisma.$disconnect();
  }
}

checkRoles();
