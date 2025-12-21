import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://postgres:postgres@localhost:5432/nuvana_test'
    }
  }
});

async function main() {
  try {
    const role = await prisma.role.findUnique({
      where: { code: 'CLIENT_OWNER' }
    });
    console.log('CLIENT_OWNER role:', role ? 'FOUND' : 'NOT FOUND');

    const roleCount = await prisma.role.count();
    console.log('Total roles in DB:', roleCount);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
