/**
 * Lottery Day Bins Query API Tests
 *
 * Tests for day-based bin tracking API endpoint:
 * - GET /api/lottery/bins/day/:storeId
 * - Day-based tracking with starting/ending serials
 * - Business day logic (first/last shift of day)
 * - Starting serial logic: today's opening OR last closing OR serial_start
 * - Ending serial logic: last closing of the day (null if none)
 * - Depleted packs for the day
 * - Store timezone support
 * - Authentication and authorization (LOTTERY_PACK_READ permission)
 * - RLS enforcement (store isolation)
 *
 * @test-level API
 * @justification Tests day-based bin tracking for MyStore lottery page
 * @story MyStore Lottery Page Redesign
 * @priority P0 (Critical - Business Logic, Data Integrity)
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import { withBypassClient } from "../support/prisma-bypass";

/**
 * Generate a unique 4-digit game code for test isolation
 */
function generateUniqueGameCode(): string {
  const random = Math.floor(1000 + Math.random() * 9000);
  return random.toString();
}

/**
 * Get today's date string in YYYY-MM-DD format
 */
function getTodayDateString(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

/**
 * Get a timestamp that falls within "today" for a given timezone.
 * This is crucial for tests because the API filters by date in the store's timezone.
 *
 * @param timezone - The IANA timezone string (e.g., "America/New_York")
 * @returns A Date object representing noon today in the given timezone (converted to UTC)
 */
function getTodayNoonInTimezone(timezone: string = "America/New_York"): Date {
  // Get current date string in the target timezone
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayStr = formatter.format(new Date()); // YYYY-MM-DD

  // Create a date at noon in the target timezone
  // We use noon to avoid any edge cases around midnight
  const noonLocal = new Date(`${todayStr}T12:00:00`);

  // Calculate the timezone offset
  const utcFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const localParts = utcFormatter.formatToParts(noonLocal);
  const localHour = parseInt(
    localParts.find((p) => p.type === "hour")?.value || "12",
  );

  // Get UTC hour at the same instant
  const utcHour = noonLocal.getUTCHours();

  // Calculate offset: if local shows 12 and UTC shows 17, offset is -5 hours
  // For America/New_York: EST is UTC-5, EDT is UTC-4
  const offsetHours = localHour - utcHour;

  // Adjust to get actual noon in the target timezone as UTC
  return new Date(noonLocal.getTime() - offsetHours * 60 * 60 * 1000);
}

test.describe("MyStore-API: Lottery Day Bins Query Endpoint", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/lottery/bins/day/:storeId - Basic Functionality
  // ═══════════════════════════════════════════════════════════════════════════

  test("DAY-BINS-001: [P0] GET /api/lottery/bins/day/:storeId - should return bins with active packs", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: Bins with active packs exist for my store
    // Use clientUser.store_id directly - it's the store created by the fixture
    const storeId = clientUser.store_id;

    // Create test data: game (store-scoped), bins, packs
    const gameCode = generateUniqueGameCode();
    const game = await withBypassClient(async (tx) => {
      return await tx.lotteryGame.create({
        data: {
          name: "Day Bins Test Game",
          game_code: gameCode,
          price: 5.0,
          pack_value: 150,
          status: "ACTIVE",
          store_id: storeId, // Store-scoped game
        },
      });
    });

    const bin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: storeId,
          name: "Day Test Bin 1",
          display_order: 0,
          is_active: true,
        },
      });
    });

    const pack = await withBypassClient(async (tx) => {
      return await tx.lotteryPack.create({
        data: {
          game_id: game.game_id,
          store_id: storeId,
          pack_number: `DAYTEST-${Date.now()}`,
          serial_start: "001",
          serial_end: "050",
          status: "ACTIVE",
          activated_at: new Date(),
          current_bin_id: bin.bin_id,
          tickets_sold_count: 0,
        },
      });
    });

    // WHEN: I query day bins for my store
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${storeId}`,
    );

    // THEN: I receive bins with pack data
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data, "Response should contain data").toBeDefined();
    expect(body.data.bins, "Response should contain bins array").toBeDefined();
    expect(
      body.data.business_day,
      "Response should contain business_day",
    ).toBeDefined();
    expect(
      body.data.depleted_packs,
      "Response should contain depleted_packs",
    ).toBeDefined();

    // Find our test bin
    const testBin = body.data.bins.find((b: any) => b.bin_id === bin.bin_id);
    expect(testBin, "Test bin should be present").toBeDefined();
    expect(testBin.pack, "Bin should have pack data").toBeDefined();
    expect(testBin.pack.pack_id, "Pack should have pack_id").toBe(pack.pack_id);
    expect(testBin.pack.game_name, "Pack should have game_name").toBe(
      "Day Bins Test Game",
    );
    expect(testBin.pack.game_price, "Pack should have game_price").toBe(5.0);
    expect(
      testBin.pack.starting_serial,
      "Pack should have starting_serial",
    ).toBe("001");
    expect(testBin.bin_number, "Bin number should be display_order + 1").toBe(
      1,
    );

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.lotteryPack.delete({ where: { pack_id: pack.pack_id } });
      await tx.lotteryBin.delete({ where: { bin_id: bin.bin_id } });
      await tx.lotteryGame.delete({ where: { game_id: game.game_id } });
    });
  });

  test("DAY-BINS-002: [P0] Should return empty bins with pack: null", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: An empty bin exists (no active pack)
    const storeId = clientUser.store_id;

    const emptyBin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: storeId,
          name: "Empty Test Bin",
          display_order: 99,
          is_active: true,
        },
      });
    });

    // WHEN: I query day bins
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${storeId}`,
    );

    // THEN: Empty bin should have pack: null
    expect(response.status()).toBe(200);
    const body = await response.json();
    const emptyBinData = body.data.bins.find(
      (b: any) => b.bin_id === emptyBin.bin_id,
    );
    expect(emptyBinData, "Empty bin should be present").toBeDefined();
    expect(emptyBinData.pack, "Empty bin should have null pack").toBeNull();

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.lotteryBin.delete({ where: { bin_id: emptyBin.bin_id } });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Starting Serial Logic Tests
  // ═══════════════════════════════════════════════════════════════════════════

  test("DAY-BINS-003: [P0] Starting serial should use LotteryDayPack starting_serial when business day is OPEN", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A pack with a LotteryBusinessDay in OPEN status and LotteryDayPack tracking
    //
    // Enterprise Business Day Model (Close-to-Close):
    // Starting serial determination prioritizes:
    // 1. Previous closed day's ending serial (carry-forward)
    // 2. LotteryDayPack.starting_serial when business day is OPEN
    // 3. pack.serial_start for new packs (never through day close)
    //
    // This test validates Priority 2: day-based tracking via LotteryDayPack
    const storeId = clientUser.store_id;

    // Create test data
    const gameCode = generateUniqueGameCode();
    const testData = await withBypassClient(async (tx) => {
      const game = await tx.lotteryGame.create({
        data: {
          name: "Day Tracking Test Game",
          game_code: gameCode,
          price: 2.0,
          pack_value: 60,
          status: "ACTIVE",
          store_id: storeId,
        },
      });

      const bin = await tx.lotteryBin.create({
        data: {
          store_id: storeId,
          name: "Day Tracking Test Bin",
          display_order: 50,
          is_active: true,
        },
      });

      const pack = await tx.lotteryPack.create({
        data: {
          game_id: game.game_id,
          store_id: storeId,
          pack_number: `DAYTRACK-${Date.now()}`,
          serial_start: "001",
          serial_end: "030",
          status: "ACTIVE",
          activated_at: new Date(),
          current_bin_id: bin.bin_id,
        },
      });

      // Create a LotteryBusinessDay in OPEN status with a specific starting serial
      // This simulates a day that has been initialized but not yet closed
      // The API uses LotteryDayPack.starting_serial when business day status is OPEN
      const todayNoon = getTodayNoonInTimezone("America/New_York");
      const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const todayStr = formatter.format(new Date());
      const businessDate = new Date(todayStr + "T00:00:00");

      const businessDay = await tx.lotteryBusinessDay.create({
        data: {
          store_id: storeId,
          business_date: businessDate,
          status: "OPEN",
          opened_at: todayNoon,
          opened_by: clientUser.user_id,
        },
      });

      // Create LotteryDayPack with starting_serial = "015" (simulating carry-forward from prior close)
      const dayPack = await tx.lotteryDayPack.create({
        data: {
          day_id: businessDay.day_id,
          pack_id: pack.pack_id,
          bin_id: bin.bin_id,
          starting_serial: "015",
          ending_serial: null, // Not yet closed
          tickets_sold: 0,
          sales_amount: 0,
        },
      });

      return { game, bin, pack, businessDay, dayPack };
    });

    // WHEN: I query day bins for today in store timezone
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const todayInStoreTimezone = formatter.format(new Date());

    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${storeId}?date=${todayInStoreTimezone}`,
    );

    // THEN: Starting serial should be from LotteryDayPack.starting_serial
    expect(response.status()).toBe(200);
    const body = await response.json();
    const testBin = body.data.bins.find(
      (b: any) => b.bin_id === testData.bin.bin_id,
    );
    expect(testBin, "Test bin should be present").toBeDefined();
    expect(testBin.pack, "Pack should be present in bin").toBeDefined();

    expect(
      testBin.pack.starting_serial,
      "Starting serial should be from LotteryDayPack (day-based tracking)",
    ).toBe("015");
    // is_first_period is determined by historicalClosingByPack, which checks for
    // previous LotteryShiftClosing records (not LotteryDayPack records).
    // Since this is a newly created pack with no historical shift closings,
    // is_first_period will be true (first ticket is inclusive in counting).
    expect(
      testBin.pack.is_first_period,
      "Should be first period (new pack, no historical shift closings)",
    ).toBe(true);

    // Cleanup in correct order (FK constraints)
    await withBypassClient(async (tx) => {
      await tx.lotteryDayPack.delete({
        where: { day_pack_id: testData.dayPack.day_pack_id },
      });
      await tx.lotteryBusinessDay.delete({
        where: { day_id: testData.businessDay.day_id },
      });
      await tx.lotteryPack.delete({
        where: { pack_id: testData.pack.pack_id },
      });
      await tx.lotteryBin.delete({ where: { bin_id: testData.bin.bin_id } });
      await tx.lotteryGame.delete({
        where: { game_id: testData.game.game_id },
      });
    });
  });

  test("DAY-BINS-004: [P0] Starting serial should use serial_start for newly activated pack (no history)", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A newly activated pack with no shift history
    const storeId = clientUser.store_id;

    const gameCode = generateUniqueGameCode();
    const testData = await withBypassClient(async (tx) => {
      const game = await tx.lotteryGame.create({
        data: {
          name: "New Pack Test Game",
          game_code: gameCode,
          price: 3.0,
          pack_value: 90,
          status: "ACTIVE",
          store_id: storeId, // Store-scoped game
        },
      });

      const bin = await tx.lotteryBin.create({
        data: {
          store_id: storeId,
          name: "New Pack Test Bin",
          display_order: 60,
          is_active: true,
        },
      });

      const pack = await tx.lotteryPack.create({
        data: {
          game_id: game.game_id,
          store_id: storeId,
          pack_number: `NEWPACK-${Date.now()}`,
          serial_start: "001",
          serial_end: "030",
          status: "ACTIVE",
          activated_at: new Date(),
          current_bin_id: bin.bin_id,
        },
      });

      return { game, bin, pack };
    });

    // WHEN: I query day bins
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${storeId}`,
    );

    // THEN: Starting serial should be pack's serial_start
    expect(response.status()).toBe(200);
    const body = await response.json();
    const testBin = body.data.bins.find(
      (b: any) => b.bin_id === testData.bin.bin_id,
    );
    expect(testBin, "Test bin should be present").toBeDefined();
    expect(
      testBin.pack.starting_serial,
      "Starting serial should be pack's serial_start",
    ).toBe("001");

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.lotteryPack.delete({
        where: { pack_id: testData.pack.pack_id },
      });
      await tx.lotteryBin.delete({ where: { bin_id: testData.bin.bin_id } });
      await tx.lotteryGame.delete({
        where: { game_id: testData.game.game_id },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Ending Serial Logic Tests
  // ═══════════════════════════════════════════════════════════════════════════

  test("DAY-BINS-005: [P0] Ending serial should be null when no closing exists today", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A pack with no shift closing today
    const storeId = clientUser.store_id;

    const gameCode = generateUniqueGameCode();
    const testData = await withBypassClient(async (tx) => {
      const game = await tx.lotteryGame.create({
        data: {
          name: "No Closing Test Game",
          game_code: gameCode,
          price: 1.0,
          pack_value: 30,
          status: "ACTIVE",
          store_id: storeId, // Store-scoped game
        },
      });

      const bin = await tx.lotteryBin.create({
        data: {
          store_id: storeId,
          name: "No Closing Test Bin",
          display_order: 70,
          is_active: true,
        },
      });

      const pack = await tx.lotteryPack.create({
        data: {
          game_id: game.game_id,
          store_id: storeId,
          pack_number: `NOCLS-${Date.now()}`,
          serial_start: "001",
          serial_end: "030",
          status: "ACTIVE",
          activated_at: new Date(),
          current_bin_id: bin.bin_id,
        },
      });

      return { game, bin, pack };
    });

    // WHEN: I query day bins
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${storeId}`,
    );

    // THEN: Ending serial should be null
    expect(response.status()).toBe(200);
    const body = await response.json();
    const testBin = body.data.bins.find(
      (b: any) => b.bin_id === testData.bin.bin_id,
    );
    expect(testBin, "Test bin should be present").toBeDefined();
    expect(
      testBin.pack.ending_serial,
      "Ending serial should be null when no closing",
    ).toBeNull();

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.lotteryPack.delete({
        where: { pack_id: testData.pack.pack_id },
      });
      await tx.lotteryBin.delete({ where: { bin_id: testData.bin.bin_id } });
      await tx.lotteryGame.delete({
        where: { game_id: testData.game.game_id },
      });
    });
  });

  test("DAY-BINS-006: [P0] Ending serial should show today's closing serial", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A pack with a shift closing today
    const storeId = clientUser.store_id;

    const gameCode = generateUniqueGameCode();
    const testData = await withBypassClient(async (tx) => {
      const game = await tx.lotteryGame.create({
        data: {
          name: "Closing Test Game",
          game_code: gameCode,
          price: 2.0,
          pack_value: 60,
          status: "ACTIVE",
          store_id: storeId, // Store-scoped game
        },
      });

      const bin = await tx.lotteryBin.create({
        data: {
          store_id: storeId,
          name: "Closing Test Bin",
          display_order: 80,
          is_active: true,
        },
      });

      const pack = await tx.lotteryPack.create({
        data: {
          game_id: game.game_id,
          store_id: storeId,
          pack_number: `CLOSE-${Date.now()}`,
          serial_start: "001",
          serial_end: "030",
          status: "ACTIVE",
          activated_at: new Date(),
          current_bin_id: bin.bin_id,
        },
      });

      // Create a cashier for the shift
      const cashier = await tx.cashier.create({
        data: {
          store_id: storeId,
          employee_id: `${Math.floor(1000 + Math.random() * 9000)}`,
          name: "Test Cashier",
          pin_hash: "$2b$10$abcdefghijklmnopqrstuvwxyz1234567890",
          hired_on: new Date(),
          created_by: clientUser.user_id,
        },
      });

      // Create a shift that opened today - use timezone-aware timestamp
      // The API filters shifts by opened_at within the store's timezone "today"
      const todayNoon = getTodayNoonInTimezone("America/New_York");
      const shift = await tx.shift.create({
        data: {
          store_id: storeId,
          cashier_id: cashier.cashier_id,
          opened_by: clientUser.user_id,
          status: "CLOSED",
          opened_at: todayNoon,
          closed_at: todayNoon,
          opening_cash: 100.0,
          closing_cash: 150.0,
        },
      });

      // Create a shift closing
      const closing = await tx.lotteryShiftClosing.create({
        data: {
          shift_id: shift.shift_id,
          pack_id: pack.pack_id,
          closing_serial: "020",
          entry_method: "SCAN",
        },
      });

      return { game, bin, pack, shift, closing, cashier };
    });

    // WHEN: I query day bins for today in store timezone
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const todayInStoreTimezone = formatter.format(new Date());

    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${storeId}?date=${todayInStoreTimezone}`,
    );

    // THEN: Ending serial should be the closing serial
    expect(response.status()).toBe(200);
    const body = await response.json();
    const testBin = body.data.bins.find(
      (b: any) => b.bin_id === testData.bin.bin_id,
    );
    expect(testBin, "Test bin should be present").toBeDefined();
    expect(
      testBin.pack.ending_serial,
      "Ending serial should be today's closing",
    ).toBe("020");

    // Cleanup in correct order (FK constraints)
    await withBypassClient(async (tx) => {
      await tx.lotteryShiftClosing.delete({
        where: { closing_id: testData.closing.closing_id },
      });
      await tx.shift.delete({ where: { shift_id: testData.shift.shift_id } });
      await tx.cashier.delete({
        where: { cashier_id: testData.cashier.cashier_id },
      });
      await tx.lotteryPack.delete({
        where: { pack_id: testData.pack.pack_id },
      });
      await tx.lotteryBin.delete({ where: { bin_id: testData.bin.bin_id } });
      await tx.lotteryGame.delete({
        where: { game_id: testData.game.game_id },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Business Day Information Tests
  // ═══════════════════════════════════════════════════════════════════════════

  test("DAY-BINS-007: [P1] Should return business day information with shift counts", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: I am authenticated as a Client Owner with a store
    const storeId = clientUser.store_id;

    // WHEN: I query day bins
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${storeId}`,
    );

    // THEN: Business day info should be present
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.business_day, "Should have business_day").toBeDefined();
    expect(body.data.business_day.date, "Should have date").toBeDefined();
    expect(
      typeof body.data.business_day.shifts_count,
      "shifts_count should be number",
    ).toBe("number");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Depleted Packs Tests
  // ═══════════════════════════════════════════════════════════════════════════

  test("DAY-BINS-008: [P1] Should return depleted packs for the day", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A depleted pack exists for today
    const storeId = clientUser.store_id;

    const gameCode = generateUniqueGameCode();
    const testData = await withBypassClient(async (tx) => {
      const game = await tx.lotteryGame.create({
        data: {
          name: "Depleted Test Game",
          game_code: gameCode,
          price: 5.0,
          pack_value: 150,
          status: "ACTIVE",
          store_id: storeId, // Store-scoped game
        },
      });

      const bin = await tx.lotteryBin.create({
        data: {
          store_id: storeId,
          name: "Depleted Test Bin",
          display_order: 90,
          is_active: true,
        },
      });

      // Use timezone-aware timestamp for depleted_at
      // The API filters depleted packs by depleted_at within the store's timezone "today"
      const todayNoon = getTodayNoonInTimezone("America/New_York");
      const pack = await tx.lotteryPack.create({
        data: {
          game_id: game.game_id,
          store_id: storeId,
          pack_number: `DEPLETED-${Date.now()}`,
          serial_start: "001",
          serial_end: "030",
          status: "DEPLETED",
          activated_at: new Date(todayNoon.getTime() - 86400000), // Yesterday
          depleted_at: todayNoon, // Today (at noon in store timezone)
          current_bin_id: bin.bin_id,
        },
      });

      return { game, bin, pack };
    });

    // WHEN: I query day bins for today in store timezone
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const todayInStoreTimezone = formatter.format(new Date());

    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${storeId}?date=${todayInStoreTimezone}`,
    );

    // THEN: Depleted pack should be in depleted_packs array
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(
      body.data.depleted_packs,
      "Should have depleted_packs array",
    ).toBeDefined();

    const depletedPack = body.data.depleted_packs.find(
      (p: any) => p.pack_id === testData.pack.pack_id,
    );
    expect(depletedPack, "Depleted pack should be present").toBeDefined();
    expect(depletedPack.game_name, "Should have game_name").toBe(
      "Depleted Test Game",
    );
    expect(depletedPack.pack_number, "Should have pack_number").toContain(
      "DEPLETED-",
    );

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.lotteryPack.delete({
        where: { pack_id: testData.pack.pack_id },
      });
      await tx.lotteryBin.delete({ where: { bin_id: testData.bin.bin_id } });
      await tx.lotteryGame.delete({
        where: { game_id: testData.game.game_id },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Date Parameter Tests
  // ═══════════════════════════════════════════════════════════════════════════

  test("DAY-BINS-009: [P1] Should accept optional date parameter", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    const storeId = clientUser.store_id;
    const dateParam = getTodayDateString();

    // WHEN: I query with a date parameter
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${storeId}?date=${dateParam}`,
    );

    // THEN: Should succeed and return data for that date
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.business_day.date, "Date should match parameter").toBe(
      dateParam,
    );
  });

  test("DAY-BINS-010: [P1] Should reject invalid date format", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    const storeId = clientUser.store_id;

    // WHEN: I query with invalid date format
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${storeId}?date=invalid-date`,
    );

    // THEN: Should return 400 error
    expect(response.status(), "Should return 400 for invalid date").toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Authorization Tests
  // ═══════════════════════════════════════════════════════════════════════════

  test("DAY-BINS-011: [P0] Should return 403 for unauthorized store access", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: A store that does not belong to the user's company
    const testData = await withBypassClient(async (tx) => {
      // Create a user to own the other company
      const user = await tx.user.create({
        data: {
          public_id: `usr_${Date.now()}`,
          email: `test_other_${Date.now()}@test.nuvana.local`,
          name: "Test Other Owner",
          status: "ACTIVE",
        },
      });

      const company = await tx.company.create({
        data: {
          public_id: `cmp_${Date.now()}`,
          name: "Test Other Company",
          status: "ACTIVE",
          owner_user_id: user.user_id,
        },
      });

      const store = await tx.store.create({
        data: {
          public_id: `str_${Date.now()}`,
          company_id: company.company_id,
          name: "Test Other Store",
          status: "ACTIVE",
          timezone: "America/New_York",
        },
      });

      return { otherStore: store, otherCompany: company, otherUser: user };
    });

    // WHEN: I try to query bins for unauthorized store
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${testData.otherStore.store_id}`,
    );

    // THEN: Should return 403 Forbidden
    expect(response.status(), "Should return 403 for unauthorized access").toBe(
      403,
    );
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("PERMISSION_DENIED");

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.store.delete({
        where: { store_id: testData.otherStore.store_id },
      });
      await tx.company.delete({
        where: { company_id: testData.otherCompany.company_id },
      });
      await tx.user.delete({ where: { user_id: testData.otherUser.user_id } });
    });
  });

  test("DAY-BINS-012: [P0] Should return 401 for unauthenticated requests", async ({
    request,
  }) => {
    // WHEN: I make an unauthenticated request
    // Note: Must use valid UUID format to avoid 400 validation error
    const response = await request.get(
      `http://localhost:3001/api/lottery/bins/day/00000000-0000-0000-0000-000000000001`,
    );

    // THEN: Should return 401 Unauthorized
    expect(response.status(), "Should return 401 for unauthenticated").toBe(
      401,
    );
  });

  test("DAY-BINS-013: [P0] Should return 404 for non-existent store", async ({
    clientUserApiRequest,
  }) => {
    // WHEN: I query a non-existent store
    const fakeStoreId = "00000000-0000-0000-0000-000000000000";
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${fakeStoreId}`,
    );

    // THEN: Should return 404 Not Found for unknown store
    expect(response.status(), "Should return 404 for non-existent store").toBe(
      404,
    );
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Enterprise Close-to-Close Business Day Model Tests
  // ═══════════════════════════════════════════════════════════════════════════
  // In enterprise POS systems, a "business day" is defined as the period from
  // the last day close to the next day close - NOT calendar midnight-to-midnight.
  // This ensures no transactions are orphaned when a day close is missed.
  // ═══════════════════════════════════════════════════════════════════════════

  test("DAY-BINS-014: [P0] Should return open_business_period metadata", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    const storeId = clientUser.store_id;

    // WHEN: I query day bins
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${storeId}`,
    );

    // THEN: Response should include open_business_period metadata
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(
      body.data.open_business_period,
      "Should have open_business_period",
    ).toBeDefined();
    expect(
      typeof body.data.open_business_period.is_first_period,
      "is_first_period should be boolean",
    ).toBe("boolean");
  });

  test("DAY-BINS-015: [P0] Should show depleted packs from multiple days when day close is missed", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A store with no closed LotteryBusinessDay and packs depleted over multiple calendar days
    // This simulates the scenario where a cashier forgets to close the day
    const storeId = clientUser.store_id;

    const gameCode = generateUniqueGameCode();
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const testData = await withBypassClient(async (tx) => {
      const game = await tx.lotteryGame.create({
        data: {
          name: "Multi-Day Depleted Test Game",
          game_code: gameCode,
          price: 5.0,
          pack_value: 150,
          status: "ACTIVE",
          store_id: storeId,
        },
      });

      const bin = await tx.lotteryBin.create({
        data: {
          store_id: storeId,
          name: "Multi-Day Test Bin",
          display_order: 95,
          is_active: true,
        },
      });

      // Pack depleted 2 days ago (should be visible with close-to-close model)
      const pack1 = await tx.lotteryPack.create({
        data: {
          game_id: game.game_id,
          store_id: storeId,
          pack_number: `MULTI-2DAYS-${Date.now()}`,
          serial_start: "001",
          serial_end: "030",
          status: "DEPLETED",
          activated_at: new Date(twoDaysAgo.getTime() - 86400000),
          depleted_at: twoDaysAgo,
          current_bin_id: bin.bin_id,
        },
      });

      // Pack depleted yesterday (should be visible with close-to-close model)
      const pack2 = await tx.lotteryPack.create({
        data: {
          game_id: game.game_id,
          store_id: storeId,
          pack_number: `MULTI-1DAY-${Date.now()}`,
          serial_start: "001",
          serial_end: "030",
          status: "DEPLETED",
          activated_at: new Date(yesterday.getTime() - 86400000),
          depleted_at: yesterday,
          current_bin_id: bin.bin_id,
        },
      });

      // Pack depleted today (should definitely be visible)
      const todayNoon = getTodayNoonInTimezone("America/New_York");
      const pack3 = await tx.lotteryPack.create({
        data: {
          game_id: game.game_id,
          store_id: storeId,
          pack_number: `MULTI-TODAY-${Date.now()}`,
          serial_start: "001",
          serial_end: "030",
          status: "DEPLETED",
          activated_at: new Date(todayNoon.getTime() - 86400000),
          depleted_at: todayNoon,
          current_bin_id: bin.bin_id,
        },
      });

      return { game, bin, pack1, pack2, pack3 };
    });

    // WHEN: I query day bins (no LotteryBusinessDay has been closed for this store)
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${storeId}`,
    );

    // THEN: All depleted packs since the epoch should be visible (no closed day = beginning of time)
    expect(response.status()).toBe(200);
    const body = await response.json();

    // All 3 packs should be in depleted_packs (close-to-close model shows all since last close)
    const depletedPackIds = body.data.depleted_packs.map((p: any) => p.pack_id);
    expect(
      depletedPackIds,
      "Pack depleted 2 days ago should be visible",
    ).toContain(testData.pack1.pack_id);
    expect(
      depletedPackIds,
      "Pack depleted yesterday should be visible",
    ).toContain(testData.pack2.pack_id);
    expect(depletedPackIds, "Pack depleted today should be visible").toContain(
      testData.pack3.pack_id,
    );

    // open_business_period should indicate this is the first period (no prior closed days)
    expect(
      body.data.open_business_period.is_first_period,
      "Should be first period when no day has been closed",
    ).toBe(true);
    expect(
      body.data.open_business_period.last_closed_date,
      "last_closed_date should be null for first period",
    ).toBeNull();

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.lotteryPack.deleteMany({
        where: {
          pack_id: {
            in: [
              testData.pack1.pack_id,
              testData.pack2.pack_id,
              testData.pack3.pack_id,
            ],
          },
        },
      });
      await tx.lotteryBin.delete({ where: { bin_id: testData.bin.bin_id } });
      await tx.lotteryGame.delete({
        where: { game_id: testData.game.game_id },
      });
    });
  });

  test("DAY-BINS-016: [P0] Should show days_since_last_close when day close is missed", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A store with a LotteryBusinessDay closed 3 days ago
    const storeId = clientUser.store_id;
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    const testData = await withBypassClient(async (tx) => {
      // Create a closed LotteryBusinessDay from 3 days ago
      const closedDay = await tx.lotteryBusinessDay.create({
        data: {
          store_id: storeId,
          business_date: threeDaysAgo,
          status: "CLOSED",
          opened_at: threeDaysAgo,
          closed_at: threeDaysAgo,
          opened_by: clientUser.user_id,
          closed_by: clientUser.user_id,
        },
      });

      return { closedDay };
    });

    // WHEN: I query day bins
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${storeId}`,
    );

    // THEN: days_since_last_close should be approximately 3
    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(
      body.data.open_business_period.is_first_period,
      "Should not be first period when a day has been closed",
    ).toBe(false);
    expect(
      body.data.open_business_period.days_since_last_close,
      "days_since_last_close should be >= 2",
    ).toBeGreaterThanOrEqual(2); // Allow for timezone edge cases
    expect(
      body.data.open_business_period.last_closed_date,
      "Should have last_closed_date",
    ).toBeDefined();

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.lotteryBusinessDay.delete({
        where: { day_id: testData.closedDay.day_id },
      });
    });
  });

  test("DAY-BINS-017: [P0] Should only show depleted packs after last closed day", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A store with a closed LotteryBusinessDay and packs depleted before/after close
    const storeId = clientUser.store_id;

    const gameCode = generateUniqueGameCode();
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const testData = await withBypassClient(async (tx) => {
      const game = await tx.lotteryGame.create({
        data: {
          name: "Close Boundary Test Game",
          game_code: gameCode,
          price: 5.0,
          pack_value: 150,
          status: "ACTIVE",
          store_id: storeId,
        },
      });

      const bin = await tx.lotteryBin.create({
        data: {
          store_id: storeId,
          name: "Close Boundary Test Bin",
          display_order: 96,
          is_active: true,
        },
      });

      // Pack depleted BEFORE the day close (should NOT be visible in current period)
      const packBeforeClose = await tx.lotteryPack.create({
        data: {
          game_id: game.game_id,
          store_id: storeId,
          pack_number: `BEFORE-CLOSE-${Date.now()}`,
          serial_start: "001",
          serial_end: "030",
          status: "DEPLETED",
          activated_at: new Date(twoDaysAgo.getTime() - 86400000),
          depleted_at: twoDaysAgo, // 2 days ago
          current_bin_id: bin.bin_id,
        },
      });

      // Day closed 1.5 days ago (between the two packs)
      const closeTime = new Date(now.getTime() - 36 * 60 * 60 * 1000);
      const closedDay = await tx.lotteryBusinessDay.create({
        data: {
          store_id: storeId,
          business_date: new Date(closeTime.toISOString().split("T")[0]),
          status: "CLOSED",
          opened_at: closeTime,
          closed_at: closeTime,
          opened_by: clientUser.user_id,
          closed_by: clientUser.user_id,
        },
      });

      // Pack depleted AFTER the day close (should be visible in current period)
      const packAfterClose = await tx.lotteryPack.create({
        data: {
          game_id: game.game_id,
          store_id: storeId,
          pack_number: `AFTER-CLOSE-${Date.now()}`,
          serial_start: "001",
          serial_end: "030",
          status: "DEPLETED",
          activated_at: new Date(oneDayAgo.getTime() - 86400000),
          depleted_at: oneDayAgo, // 1 day ago (after close)
          current_bin_id: bin.bin_id,
        },
      });

      return { game, bin, packBeforeClose, packAfterClose, closedDay };
    });

    // WHEN: I query day bins
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${storeId}`,
    );

    // THEN: Only pack depleted AFTER the day close should be visible
    expect(response.status()).toBe(200);
    const body = await response.json();

    const depletedPackIds = body.data.depleted_packs.map((p: any) => p.pack_id);

    // Pack depleted before close should NOT be in the list
    expect(
      depletedPackIds,
      "Pack depleted before close should NOT be visible",
    ).not.toContain(testData.packBeforeClose.pack_id);

    // Pack depleted after close should be in the list
    expect(
      depletedPackIds,
      "Pack depleted after close should be visible",
    ).toContain(testData.packAfterClose.pack_id);

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.lotteryPack.deleteMany({
        where: {
          pack_id: {
            in: [
              testData.packBeforeClose.pack_id,
              testData.packAfterClose.pack_id,
            ],
          },
        },
      });
      await tx.lotteryBusinessDay.delete({
        where: { day_id: testData.closedDay.day_id },
      });
      await tx.lotteryBin.delete({ where: { bin_id: testData.bin.bin_id } });
      await tx.lotteryGame.delete({
        where: { game_id: testData.game.game_id },
      });
    });
  });
});
