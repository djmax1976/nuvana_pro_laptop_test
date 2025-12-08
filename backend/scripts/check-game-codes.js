const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkGameCodes() {
  try {
    console.log('Checking lottery_games table structure...');

    // Use raw query to check column existence
    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'lottery_games'
      AND column_name = 'game_code'
    `;

    if (columns.length === 0) {
      console.log('❌ game_code column does NOT exist in lottery_games table');
      console.log('   Migration 20250128000000_add_game_code_to_lottery_game needs to be applied');
    } else {
      console.log('✓ game_code column exists');
      console.log('  Type:', columns[0].data_type);
      console.log('  Nullable:', columns[0].is_nullable);

      // Count games without codes
      const counts = await prisma.$queryRaw`
        SELECT
          COUNT(*) as total,
          COUNT(game_code) as with_codes,
          COUNT(*) - COUNT(game_code) as without_codes
        FROM lottery_games
      `;

      console.log('\nGame code status:');
      console.log('  Total games:', Number(counts[0].total));
      console.log('  With codes:', Number(counts[0].with_codes));
      console.log('  Without codes:', Number(counts[0].without_codes));
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkGameCodes();
