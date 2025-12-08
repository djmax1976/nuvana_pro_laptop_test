const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function fixGameCodes() {
  try {
    console.log('Finding games without game codes...');
    const gamesWithoutCodes = await prisma.lotteryGame.findMany({
      where: {
        game_code: null
      },
      orderBy: {
        created_at: 'asc'
      }
    });

    console.log(`Found ${gamesWithoutCodes.length} games without game codes`);

    if (gamesWithoutCodes.length === 0) {
      console.log('All games already have game codes!');
      return;
    }

    let nextCode = 1000;

    for (const game of gamesWithoutCodes) {
      // Find next available code
      while (true) {
        const codeStr = String(nextCode).padStart(4, '0');
        const existing = await prisma.lotteryGame.findUnique({
          where: { game_code: codeStr }
        });

        if (!existing) {
          // Code is available, use it
          await prisma.lotteryGame.update({
            where: { game_id: game.game_id },
            data: { game_code: codeStr }
          });
          console.log(`Assigned code ${codeStr} to game: ${game.name}`);
          nextCode++;
          break;
        }

        nextCode++;
      }
    }

    // Verify
    const remaining = await prisma.lotteryGame.count({
      where: { game_code: null }
    });

    console.log(`\n✓ Fixed! Games without codes: ${remaining}`);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fixGameCodes();
