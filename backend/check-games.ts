import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const totalGames = await prisma.lotteryGame.count();
  console.log('Total games:', totalGames);

  const activeGames = await prisma.lotteryGame.count({ where: { status: 'ACTIVE' } });
  const inactiveGames = await prisma.lotteryGame.count({ where: { status: 'INACTIVE' } });
  console.log('ACTIVE games:', activeGames);
  console.log('INACTIVE games:', inactiveGames);

  const game1868 = await prisma.lotteryGame.findMany({
    where: { game_code: '1868' },
    select: { game_id: true, game_code: true, name: true, status: true, state_id: true, store_id: true, updated_at: true }
  });
  console.log('\nGame 1868 records:', JSON.stringify(game1868, null, 2));

  const inactiveList = await prisma.lotteryGame.findMany({
    where: { status: 'INACTIVE' },
    select: { game_id: true, game_code: true, name: true, status: true }
  });
  console.log('\nAll INACTIVE games:', JSON.stringify(inactiveList, null, 2));

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
