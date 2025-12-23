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
    // Add GILBARCO_NAXML to the POSSystemType enum
    await prisma.$executeRaw`
      ALTER TYPE "POSSystemType" ADD VALUE IF NOT EXISTS 'GILBARCO_NAXML'
    `;
    console.log('Successfully added GILBARCO_NAXML to POSSystemType enum');

    // Verify
    const result = await prisma.$queryRaw`
      SELECT enumlabel
      FROM pg_enum
      WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'POSSystemType')
      ORDER BY enumsortorder
    `;
    console.log('Updated POSSystemType enum values:', result);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
