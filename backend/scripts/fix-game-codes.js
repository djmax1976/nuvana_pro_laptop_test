const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function fixGameCodes() {
  try {
    console.log('Reading SQL script...');
    const sqlPath = path.join(__dirname, '../prisma/migrations/fix_game_codes.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executing SQL to fix game codes...');
    await prisma.$executeRawUnsafe(sql);

    console.log('Verifying results...');
    const results = await prisma.$queryRaw`
      SELECT
        COUNT(*) as total_games,
        COUNT(game_code) as games_with_codes,
        COUNT(*) FILTER (WHERE game_code IS NULL) as games_without_codes
      FROM lottery_games
    `;

    console.log('Results:', results[0]);

    console.log('\n✓ Game codes fixed successfully!');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fixGameCodes();
