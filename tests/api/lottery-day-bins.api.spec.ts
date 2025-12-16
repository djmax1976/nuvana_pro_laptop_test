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
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    // Create test data: game, bins, packs
    const gameCode = generateUniqueGameCode();
    const game = await withBypassClient(async (tx) => {
      return await tx.lotteryGame.create({
        data: {
          name: "Day Bins Test Game",
          game_code: gameCode,
          price: 5.0,
          pack_value: 150,
          status: "ACTIVE",
        },
      });
    });

    const bin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: store.store_id,
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
          store_id: store.store_id,
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
      `/api/lottery/bins/day/${store.store_id}`,
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
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    const emptyBin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: store.store_id,
          name: "Empty Test Bin",
          display_order: 99,
          is_active: true,
        },
      });
    });

    // WHEN: I query day bins
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${store.store_id}`,
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

  test("DAY-BINS-003: [P0] Starting serial should use today's opening serial when shift opened today", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A pack with a shift opening today
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    // Create test data
    const gameCode = generateUniqueGameCode();
    const { game, bin, pack, shift, opening } = await withBypassClient(
      async (tx) => {
        const game = await tx.lotteryGame.create({
          data: {
            name: "Opening Test Game",
            game_code: gameCode,
            price: 2.0,
            pack_value: 60,
            status: "ACTIVE",
          },
        });

        const bin = await tx.lotteryBin.create({
          data: {
            store_id: store.store_id,
            name: "Opening Test Bin",
            display_order: 50,
            is_active: true,
          },
        });

        const pack = await tx.lotteryPack.create({
          data: {
            game_id: game.game_id,
            store_id: store.store_id,
            pack_number: `OPEN-${Date.now()}`,
            serial_start: "001",
            serial_end: "030",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin.bin_id,
          },
        });

        // Create a shift that opened today
        const shift = await tx.shift.create({
          data: {
            store_id: store.store_id,
            cashier_id: clientUser.user_id,
            status: "OPEN",
            opened_at: new Date(),
            opening_cash: 100.0,
          },
        });

        // Create a shift opening with starting serial "015"
        const opening = await tx.lotteryShiftOpening.create({
          data: {
            shift_id: shift.shift_id,
            pack_id: pack.pack_id,
            opening_serial: "015",
          },
        });

        return { game, bin, pack, shift, opening };
      },
    );

    // WHEN: I query day bins
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${store.store_id}`,
    );

    // THEN: Starting serial should be today's opening serial
    expect(response.status()).toBe(200);
    const body = await response.json();
    const testBin = body.data.bins.find((b: any) => b.bin_id === bin.bin_id);
    expect(testBin, "Test bin should be present").toBeDefined();
    expect(
      testBin.pack.starting_serial,
      "Starting serial should be today's opening",
    ).toBe("015");

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.lotteryShiftOpening.delete({
        where: { opening_id: opening.opening_id },
      });
      await tx.shift.delete({ where: { shift_id: shift.shift_id } });
      await tx.lotteryPack.delete({ where: { pack_id: pack.pack_id } });
      await tx.lotteryBin.delete({ where: { bin_id: bin.bin_id } });
      await tx.lotteryGame.delete({ where: { game_id: game.game_id } });
    });
  });

  test("DAY-BINS-004: [P0] Starting serial should use serial_start for newly activated pack (no history)", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A newly activated pack with no shift history
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    const gameCode = generateUniqueGameCode();
    const { game, bin, pack } = await withBypassClient(async (tx) => {
      const game = await tx.lotteryGame.create({
        data: {
          name: "New Pack Test Game",
          game_code: gameCode,
          price: 3.0,
          pack_value: 90,
          status: "ACTIVE",
        },
      });

      const bin = await tx.lotteryBin.create({
        data: {
          store_id: store.store_id,
          name: "New Pack Test Bin",
          display_order: 60,
          is_active: true,
        },
      });

      const pack = await tx.lotteryPack.create({
        data: {
          game_id: game.game_id,
          store_id: store.store_id,
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
      `/api/lottery/bins/day/${store.store_id}`,
    );

    // THEN: Starting serial should be pack's serial_start
    expect(response.status()).toBe(200);
    const body = await response.json();
    const testBin = body.data.bins.find((b: any) => b.bin_id === bin.bin_id);
    expect(testBin, "Test bin should be present").toBeDefined();
    expect(
      testBin.pack.starting_serial,
      "Starting serial should be pack's serial_start",
    ).toBe("001");

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.lotteryPack.delete({ where: { pack_id: pack.pack_id } });
      await tx.lotteryBin.delete({ where: { bin_id: bin.bin_id } });
      await tx.lotteryGame.delete({ where: { game_id: game.game_id } });
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
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    const gameCode = generateUniqueGameCode();
    const { game, bin, pack } = await withBypassClient(async (tx) => {
      const game = await tx.lotteryGame.create({
        data: {
          name: "No Closing Test Game",
          game_code: gameCode,
          price: 1.0,
          pack_value: 30,
          status: "ACTIVE",
        },
      });

      const bin = await tx.lotteryBin.create({
        data: {
          store_id: store.store_id,
          name: "No Closing Test Bin",
          display_order: 70,
          is_active: true,
        },
      });

      const pack = await tx.lotteryPack.create({
        data: {
          game_id: game.game_id,
          store_id: store.store_id,
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
      `/api/lottery/bins/day/${store.store_id}`,
    );

    // THEN: Ending serial should be null
    expect(response.status()).toBe(200);
    const body = await response.json();
    const testBin = body.data.bins.find((b: any) => b.bin_id === bin.bin_id);
    expect(testBin, "Test bin should be present").toBeDefined();
    expect(
      testBin.pack.ending_serial,
      "Ending serial should be null when no closing",
    ).toBeNull();

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.lotteryPack.delete({ where: { pack_id: pack.pack_id } });
      await tx.lotteryBin.delete({ where: { bin_id: bin.bin_id } });
      await tx.lotteryGame.delete({ where: { game_id: game.game_id } });
    });
  });

  test("DAY-BINS-006: [P0] Ending serial should show today's closing serial", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: A pack with a shift closing today
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    const gameCode = generateUniqueGameCode();
    const { game, bin, pack, shift, closing } = await withBypassClient(
      async (tx) => {
        const game = await tx.lotteryGame.create({
          data: {
            name: "Closing Test Game",
            game_code: gameCode,
            price: 2.0,
            pack_value: 60,
            status: "ACTIVE",
          },
        });

        const bin = await tx.lotteryBin.create({
          data: {
            store_id: store.store_id,
            name: "Closing Test Bin",
            display_order: 80,
            is_active: true,
          },
        });

        const pack = await tx.lotteryPack.create({
          data: {
            game_id: game.game_id,
            store_id: store.store_id,
            pack_number: `CLOSE-${Date.now()}`,
            serial_start: "001",
            serial_end: "030",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin.bin_id,
          },
        });

        // Create a shift that opened today
        const shift = await tx.shift.create({
          data: {
            store_id: store.store_id,
            cashier_id: clientUser.user_id,
            status: "CLOSED",
            opened_at: new Date(),
            closed_at: new Date(),
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

        return { game, bin, pack, shift, closing };
      },
    );

    // WHEN: I query day bins
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${store.store_id}`,
    );

    // THEN: Ending serial should be the closing serial
    expect(response.status()).toBe(200);
    const body = await response.json();
    const testBin = body.data.bins.find((b: any) => b.bin_id === bin.bin_id);
    expect(testBin, "Test bin should be present").toBeDefined();
    expect(
      testBin.pack.ending_serial,
      "Ending serial should be today's closing",
    ).toBe("020");

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.lotteryShiftClosing.delete({
        where: { closing_id: closing.closing_id },
      });
      await tx.shift.delete({ where: { shift_id: shift.shift_id } });
      await tx.lotteryPack.delete({ where: { pack_id: pack.pack_id } });
      await tx.lotteryBin.delete({ where: { bin_id: bin.bin_id } });
      await tx.lotteryGame.delete({ where: { game_id: game.game_id } });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Business Day Information Tests
  // ═══════════════════════════════════════════════════════════════════════════

  test("DAY-BINS-007: [P1] Should return business day information with shift counts", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: Shifts exist for today
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    // WHEN: I query day bins
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${store.store_id}`,
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
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    const gameCode = generateUniqueGameCode();
    const { game, bin, pack } = await withBypassClient(async (tx) => {
      const game = await tx.lotteryGame.create({
        data: {
          name: "Depleted Test Game",
          game_code: gameCode,
          price: 5.0,
          pack_value: 150,
          status: "ACTIVE",
        },
      });

      const bin = await tx.lotteryBin.create({
        data: {
          store_id: store.store_id,
          name: "Depleted Test Bin",
          display_order: 90,
          is_active: true,
        },
      });

      const pack = await tx.lotteryPack.create({
        data: {
          game_id: game.game_id,
          store_id: store.store_id,
          pack_number: `DEPLETED-${Date.now()}`,
          serial_start: "001",
          serial_end: "030",
          status: "DEPLETED",
          activated_at: new Date(Date.now() - 86400000), // Yesterday
          depleted_at: new Date(), // Today
          current_bin_id: bin.bin_id,
        },
      });

      return { game, bin, pack };
    });

    // WHEN: I query day bins
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${store.store_id}`,
    );

    // THEN: Depleted pack should be in depleted_packs array
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(
      body.data.depleted_packs,
      "Should have depleted_packs array",
    ).toBeDefined();

    const depletedPack = body.data.depleted_packs.find(
      (p: any) => p.pack_id === pack.pack_id,
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
      await tx.lotteryPack.delete({ where: { pack_id: pack.pack_id } });
      await tx.lotteryBin.delete({ where: { bin_id: bin.bin_id } });
      await tx.lotteryGame.delete({ where: { game_id: game.game_id } });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Date Parameter Tests
  // ═══════════════════════════════════════════════════════════════════════════

  test("DAY-BINS-009: [P1] Should accept optional date parameter", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    const dateParam = getTodayDateString();

    // WHEN: I query with a date parameter
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${store.store_id}?date=${dateParam}`,
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
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    // WHEN: I query with invalid date format
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${store.store_id}?date=invalid-date`,
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
    const otherStore = await withBypassClient(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: "Other Company",
          status: "ACTIVE",
        },
      });
      return await tx.store.create({
        data: {
          company_id: company.company_id,
          name: "Other Store",
          status: "ACTIVE",
          timezone: "America/New_York",
        },
      });
    });

    // WHEN: I try to query bins for unauthorized store
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/day/${otherStore.store_id}`,
    );

    // THEN: Should return 403 Forbidden
    expect(response.status(), "Should return 403 for unauthorized access").toBe(
      403,
    );

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.store.delete({ where: { store_id: otherStore.store_id } });
      await tx.company.delete({ where: { company_id: otherStore.company_id } });
    });
  });

  test("DAY-BINS-012: [P0] Should return 401 for unauthenticated requests", async ({
    request,
  }) => {
    // WHEN: I make an unauthenticated request
    const response = await request.get(
      `http://localhost:3001/api/lottery/bins/day/some-store-id`,
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

    // THEN: Should return 404 Not Found
    expect(response.status(), "Should return 404 for non-existent store").toBe(
      404,
    );
  });
});
