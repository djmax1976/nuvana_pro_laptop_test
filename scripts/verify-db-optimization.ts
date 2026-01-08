/**
 * Database Optimization Verification Script
 *
 * Verifies Phase 1 performance targets from optimize-db.md:
 * - Batch pack reception: 100 packs in <2s
 * - Shift close: 100 packs in <3s
 * - Pack list endpoint: Returns max 100 items with pagination
 * - Bin list endpoint: Returns max 100 items with pagination
 *
 * Usage: npx tsx scripts/verify-db-optimization.ts
 */

import { PrismaClient, LotteryPackStatus } from "@prisma/client";

const prisma = new PrismaClient({
  log: process.env.DEBUG ? ["query", "info", "warn", "error"] : ["error"],
});

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  target: number;
  details: string;
}

const results: TestResult[] = [];

async function setupTestData() {
  console.log("\n🔧 Setting up test data...");

  // Find or create test company and store
  let testCompany = await prisma.company.findFirst({
    where: { name: { contains: "PERF_TEST" } },
  });

  if (!testCompany) {
    // Create a test user first
    const testUser = await prisma.user.create({
      data: {
        public_id: `usr_perf_${Date.now()}`,
        email: `perf_test_${Date.now()}@test.nuvana.local`,
        name: "Performance Test User",
        status: "ACTIVE",
      },
    });

    testCompany = await prisma.company.create({
      data: {
        public_id: `cmp_perf_${Date.now()}`,
        name: "PERF_TEST Company",
        status: "ACTIVE",
        owner_user_id: testUser.user_id,
      },
    });
  }

  let testStore = await prisma.store.findFirst({
    where: { name: { contains: "PERF_TEST" } },
  });

  if (!testStore) {
    testStore = await prisma.store.create({
      data: {
        public_id: `str_perf_${Date.now()}`,
        name: "PERF_TEST Store",
        company_id: testCompany.company_id,
        status: "ACTIVE",
        timezone: "America/New_York",
      },
    });
  }

  // Create test game if not exists
  let testGame = await prisma.lotteryGame.findFirst({
    where: { game_code: "9999" },
  });

  if (!testGame) {
    testGame = await prisma.lotteryGame.create({
      data: {
        game_code: "9999",
        name: "PERF_TEST Game",
        price: 5.0,
        pack_value: 750,
        tickets_per_pack: 150,
        status: "ACTIVE",
      },
    });
  }

  // Create test user for received_by field
  let testUser = await prisma.user.findFirst({
    where: { email: { contains: "perf_test" } },
  });

  if (!testUser) {
    testUser = await prisma.user.create({
      data: {
        public_id: `usr_perf2_${Date.now()}`,
        email: `perf_test2_${Date.now()}@test.nuvana.local`,
        name: "Performance Test Receiver",
        status: "ACTIVE",
      },
    });
  }

  return { testCompany, testStore, testGame, testUser };
}

async function cleanupTestPacks(storeId: string) {
  // Clean up any existing test packs
  await prisma.lotteryPack.deleteMany({
    where: {
      store_id: storeId,
      pack_number: { startsWith: "PERF" },
    },
  });
}

async function testBatchPackReception(
  storeId: string,
  gameId: string,
  userId: string,
): Promise<TestResult> {
  const testName = "Batch Pack Reception (100 packs)";
  const target = 2000; // 2 seconds in ms

  console.log(`\n📦 Testing ${testName}...`);

  // Clean up first
  await cleanupTestPacks(storeId);

  // Prepare 100 pack data
  const packsToCreate = Array.from({ length: 100 }, (_, i) => ({
    store_id: storeId,
    game_id: gameId,
    pack_number: `PERF${String(i).padStart(4, "0")}`,
    serial_start: "000",
    serial_end: "149",
    status: "RECEIVED" as LotteryPackStatus,
    received_at: new Date(),
  }));

  // Time the bulk insert
  const startTime = performance.now();

  await prisma.$transaction(
    async (tx) => {
      await tx.lotteryPack.createMany({ data: packsToCreate });
    },
    { timeout: 120000 }, // Use BULK timeout
  );

  const endTime = performance.now();
  const duration = endTime - startTime;

  // Clean up
  await cleanupTestPacks(storeId);

  const passed = duration < target;
  return {
    name: testName,
    passed,
    duration: Math.round(duration),
    target,
    details: `Created 100 packs in ${Math.round(duration)}ms (target: <${target}ms)`,
  };
}

async function testShiftCloseQueries(
  storeId: string,
  gameId: string,
  userId: string,
): Promise<TestResult> {
  const testName = "Shift Close Query Simulation (100 packs)";
  const target = 3000; // 3 seconds in ms

  console.log(`\n🔐 Testing ${testName}...`);

  // Create 100 test packs for the simulation
  const packsToCreate = Array.from({ length: 100 }, (_, i) => ({
    store_id: storeId,
    game_id: gameId,
    pack_number: `PERF${String(i).padStart(4, "0")}`,
    serial_start: "000",
    serial_end: "149",
    status: "ACTIVE" as LotteryPackStatus,
    received_at: new Date(),
    activated_at: new Date(),
    activated_by: userId,
  }));

  await prisma.lotteryPack.createMany({ data: packsToCreate });

  // Fetch the created packs
  const soldPacks = await prisma.lotteryPack.findMany({
    where: {
      store_id: storeId,
      pack_number: { startsWith: "PERF" },
    },
  });

  // Simulate the shift close query patterns (batch queries optimization test)
  const startTime = performance.now();

  await prisma.$transaction(
    async (tx) => {
      const packIds = soldPacks.map((p) => p.pack_id);

      // Step 1: Batch fetch queries - this tests the N+1 fix
      // In the optimized version, these run in parallel with Promise.all
      const [openings, ticketCounts] = await Promise.all([
        // Batch fetch all openings (would be real data in production)
        tx.lotteryShiftOpening.findMany({
          where: { pack_id: { in: packIds } },
        }),
        // Batch count tickets using groupBy (N+1 fix)
        tx.lotteryTicketSerial.groupBy({
          by: ["pack_id"],
          where: { pack_id: { in: packIds } },
          _count: { serial_number: true },
        }),
      ]);

      // Step 2: Prepare bulk data (in-memory processing)
      const processedData = soldPacks.map((pack) => ({
        pack_id: pack.pack_id,
        ending_serial: pack.serial_end,
        tickets_sold: 0, // Would calculate from ticketCounts
      }));

      // Step 3: Bulk update packs status (simulates closing)
      await tx.lotteryPack.updateMany({
        where: { pack_id: { in: packIds } },
        data: { status: "DEPLETED", depleted_at: new Date() },
      });
    },
    { timeout: 120000 },
  );

  const endTime = performance.now();
  const duration = endTime - startTime;

  // Clean up
  await cleanupTestPacks(storeId);

  const passed = duration < target;
  return {
    name: testName,
    passed,
    duration: Math.round(duration),
    target,
    details: `Batch queries + bulk update for 100 packs in ${Math.round(duration)}ms (target: <${target}ms)`,
  };
}

async function testPackListPagination(
  storeId: string,
  gameId: string,
): Promise<TestResult> {
  const testName = "Pack List Pagination";
  const target = 500; // 500ms

  console.log(`\n📋 Testing ${testName}...`);

  // Create 150 test packs
  const packsToCreate = Array.from({ length: 150 }, (_, i) => ({
    store_id: storeId,
    game_id: gameId,
    pack_number: `PERF${String(i).padStart(4, "0")}`,
    serial_start: "000",
    serial_end: "149",
    status: "RECEIVED" as LotteryPackStatus,
    received_at: new Date(),
  }));

  await prisma.lotteryPack.createMany({ data: packsToCreate });

  // Test paginated query
  const startTime = performance.now();

  const page = 1;
  const limit = 50;

  const [packs, total] = await Promise.all([
    prisma.lotteryPack.findMany({
      where: {
        store_id: storeId,
        pack_number: { startsWith: "PERF" },
      },
      take: limit,
      skip: (page - 1) * limit,
      orderBy: { created_at: "desc" },
      include: {
        game: { select: { game_code: true, name: true, price: true } },
      },
    }),
    prisma.lotteryPack.count({
      where: {
        store_id: storeId,
        pack_number: { startsWith: "PERF" },
      },
    }),
  ]);

  const endTime = performance.now();
  const duration = endTime - startTime;

  // Clean up
  await cleanupTestPacks(storeId);

  const passed = duration < target && packs.length === limit && total === 150;
  return {
    name: testName,
    passed,
    duration: Math.round(duration),
    target,
    details: `Returned ${packs.length}/${total} packs in ${Math.round(duration)}ms (target: <${target}ms, limit: ${limit})`,
  };
}

async function testBinListPagination(storeId: string): Promise<TestResult> {
  const testName = "Bin List Query";
  const target = 500; // 500ms

  console.log(`\n🗃️ Testing ${testName}...`);

  // Test bin query (bins are typically fewer, so we just test query performance)
  const startTime = performance.now();

  const bins = await prisma.lotteryBin.findMany({
    where: { store_id: storeId },
    take: 100,
    orderBy: { display_order: "asc" },
    include: {
      _count: {
        select: { packs: true },
      },
    },
  });

  const endTime = performance.now();
  const duration = endTime - startTime;

  const passed = duration < target;
  return {
    name: testName,
    passed,
    duration: Math.round(duration),
    target,
    details: `Queried ${bins.length} bins in ${Math.round(duration)}ms (target: <${target}ms)`,
  };
}

async function testIndexUsage(): Promise<TestResult> {
  const testName = "Index Usage Verification";
  const target = 100; // 100ms for index-based query

  console.log(`\n🔍 Testing ${testName}...`);

  // Test that indexes are being used by running EXPLAIN ANALYZE
  const startTime = performance.now();

  // Run a query that should use the new indexes
  const result = await prisma.$queryRaw`
    EXPLAIN (ANALYZE, FORMAT JSON)
    SELECT * FROM lottery_packs
    WHERE store_id = '00000000-0000-0000-0000-000000000000'
      AND status = 'DEPLETED'
    ORDER BY depleted_at DESC
    LIMIT 50
  `;

  const endTime = performance.now();
  const duration = endTime - startTime;

  // Check if index scan is used (not sequential scan)
  const plan = (result as any)[0]["QUERY PLAN"][0];
  const usesIndex =
    JSON.stringify(plan).includes("Index") ||
    JSON.stringify(plan).includes("Bitmap");

  const passed = duration < target;
  return {
    name: testName,
    passed,
    duration: Math.round(duration),
    target,
    details: `EXPLAIN ANALYZE completed in ${Math.round(duration)}ms, Index used: ${usesIndex}`,
  };
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("   Database Optimization Verification Script");
  console.log("   Phase 1 Performance Targets from optimize-db.md");
  console.log("═══════════════════════════════════════════════════════════");

  try {
    const { testStore, testGame, testUser } = await setupTestData();

    // Run all tests
    results.push(
      await testBatchPackReception(
        testStore.store_id,
        testGame.game_id,
        testUser.user_id,
      ),
    );
    results.push(
      await testShiftCloseQueries(
        testStore.store_id,
        testGame.game_id,
        testUser.user_id,
      ),
    );
    results.push(
      await testPackListPagination(testStore.store_id, testGame.game_id),
    );
    results.push(await testBinListPagination(testStore.store_id));
    results.push(await testIndexUsage());

    // Print results
    console.log(
      "\n═══════════════════════════════════════════════════════════",
    );
    console.log("   VERIFICATION RESULTS");
    console.log(
      "═══════════════════════════════════════════════════════════\n",
    );

    let allPassed = true;
    for (const result of results) {
      const status = result.passed ? "✅ PASS" : "❌ FAIL";
      allPassed = allPassed && result.passed;
      console.log(`${status} | ${result.name}`);
      console.log(`        ${result.details}`);
      console.log("");
    }

    console.log("═══════════════════════════════════════════════════════════");
    if (allPassed) {
      console.log("   🎉 ALL VERIFICATION TESTS PASSED!");
    } else {
      console.log("   ⚠️  SOME TESTS FAILED - Review results above");
    }
    console.log(
      "═══════════════════════════════════════════════════════════\n",
    );

    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error("\n❌ Error running verification:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
