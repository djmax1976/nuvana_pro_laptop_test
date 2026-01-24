import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Get actual state ID from PA state
  const stateId = '7bcd61d6-5f0c-46e8-bc72-efa3cb3ae152';
  
  // Get a real store for this state
  const store = await prisma.store.findFirst({
    where: { state_id: stateId },
    select: { store_id: true, name: true }
  });
  console.log('Using store:', store);
  
  const storeId = store?.store_id || '00000000-0000-0000-0000-000000000000';
  
  // Build the where clause exactly like the service does for INITIAL SYNC
  const whereInitialSync: any = {
    OR: [
      { state_id: stateId },
      { store_id: storeId },
    ],
    status: 'ACTIVE', // Initial sync filter
  };
  
  console.log('\n=== INITIAL SYNC (status=ACTIVE filter) ===');
  const gamesInitialSync = await prisma.lotteryGame.findMany({
    where: whereInitialSync,
    select: { game_id: true, game_code: true, name: true, status: true }
  });
  console.log('Games returned:', gamesInitialSync.length);
  
  const game1868Initial = gamesInitialSync.find(g => g.game_code === '1868');
  console.log('Is game 1868 in results?', game1868Initial ? 'YES - BUG!' : 'NO - Correct');
  
  // Now test WITHOUT status filter (simulating include_inactive=true)
  console.log('\n=== WITH include_inactive=true (no status filter) ===');
  const whereAllGames: any = {
    OR: [
      { state_id: stateId },
      { store_id: storeId },
    ],
  };
  
  const gamesAll = await prisma.lotteryGame.findMany({
    where: whereAllGames,
    select: { game_id: true, game_code: true, name: true, status: true }
  });
  console.log('Games returned:', gamesAll.length);
  
  const game1868All = gamesAll.find(g => g.game_code === '1868');
  console.log('Is game 1868 in results?', game1868All ? 'YES' : 'NO');
  if (game1868All) {
    console.log('Game 1868 status in response:', game1868All.status);
  }
  
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
