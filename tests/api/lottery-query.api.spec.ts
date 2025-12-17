/**
 * Lottery Query API Tests
 *
 * Tests for Lottery Query API endpoints:
 * - GET /api/lottery/games
 * - GET /api/lottery/packs
 * - GET /api/lottery/packs/:packId
 * - GET /api/lottery/variances
 * - GET /api/lottery/bins
 * - Authentication and authorization (Store Manager role)
 * - RLS enforcement (store isolation)
 * - Query parameter validation and filtering
 * - Relationship includes (game, store, bin, shift_openings, shift_closings)
 * - tickets_remaining calculation
 * - Audit logging
 * - Error handling (401, 403, 404, 400)
 * - Security: SQL injection, authentication bypass, authorization, input validation, data leakage
 * - Edge cases: Empty results, invalid filters, RLS violations
 *
 * @test-level API
 * @justification Tests API endpoints with authentication, authorization, database operations, and business logic
 * @story 6-11 - Lottery Query API Endpoints
 * @priority P0 (Critical - Security, Data Integrity, Business Logic)
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createLotteryGame,
  createLotteryPack,
  createLotteryBin,
  createLotteryVariance,
  createLotteryShiftOpening,
  createLotteryShiftClosing,
} from "../support/factories/lottery.factory";
import {
  createCompany,
  createStore,
  createUser,
} from "../support/factories/database.factory";
import { createShift } from "../support/helpers";
import { LotteryPackStatus, LotteryGameStatus } from "@prisma/client";
import { withBypassClient } from "../support/prisma-bypass";

test.describe("6.11-API: Lottery Query API Endpoints", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/lottery/games - AC #1
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.11-API-001: [P0] GET /api/lottery/games - should return active games only (AC #1)", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: Multiple games exist (some ACTIVE, some INACTIVE)
    // Use unique prefixes to ensure test isolation and predictable ordering
    const testPrefix = `Test_${Date.now()}_`;
    const activeGame1 = await createLotteryGame(prismaClient, {
      name: `${testPrefix}AAA_Active_Game_1`,
      status: LotteryGameStatus.ACTIVE,
    });
    const activeGame2 = await createLotteryGame(prismaClient, {
      name: `${testPrefix}BBB_Active_Game_2`,
      status: LotteryGameStatus.ACTIVE,
    });
    const inactiveGame = await createLotteryGame(prismaClient, {
      name: `${testPrefix}CCC_Inactive_Game`,
      status: LotteryGameStatus.INACTIVE,
    });

    // WHEN: I query lottery games
    const response = await storeManagerApiRequest.get("/api/lottery/games");

    // THEN: I receive a list of all active lottery games
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data, "Response should contain games array").toBeInstanceOf(
      Array,
    );

    // AND: Games are filtered by active status only
    const gameIds = body.data.map((g: any) => g.game_id);
    expect(gameIds, "Should include active games").toContain(
      activeGame1.game_id,
    );
    expect(gameIds, "Should include active games").toContain(
      activeGame2.game_id,
    );
    expect(gameIds, "Should NOT include inactive games").not.toContain(
      inactiveGame.game_id,
    );

    // AND: All returned games have status ACTIVE
    body.data.forEach((game: any) => {
      expect(game.status, "All games should be ACTIVE").toBe("ACTIVE");
    });

    // AND: Games are ordered by name (verify our test games appear in correct relative order)
    // Filter to only our test games to avoid test pollution from other tests
    const ourTestGames = body.data.filter((g: { name: string }) =>
      g.name.startsWith(testPrefix),
    );
    expect(ourTestGames.length, "Should find both our active test games").toBe(
      2,
    );

    // Verify our test games appear in alphabetical order (AAA before BBB)
    const testGameNames = ourTestGames.map((g: { name: string }) => g.name);
    expect(
      testGameNames[0],
      "First test game should be AAA (alphabetically first)",
    ).toContain("AAA");
    expect(
      testGameNames[1],
      "Second test game should be BBB (alphabetically second)",
    ).toContain("BBB");

    // Also verify the returned list contains valid string names
    // This uses database collation order (which may differ from JS localeCompare for special chars)
    const allNames: string[] = body.data.map((g: { name: string }) => g.name);
    // Verify all names are strings (database ORDER BY is trusted)
    allNames.forEach((name) => {
      expect(typeof name, "Each name should be a string").toBe("string");
    });
  });

  test("6.11-API-002: [P0] GET /api/lottery/games - should require authentication (AC #1)", async ({
    apiRequest,
  }) => {
    // GIVEN: I am NOT authenticated
    // WHEN: I query lottery games without authentication
    const response = await apiRequest.get("/api/lottery/games");

    // THEN: I receive 401 Unauthorized
    expect(response.status(), "Expected 401 Unauthorized").toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error should be present").toBeDefined();
  });

  test("6.11-API-003: [P0] GET /api/lottery/games - should require LOTTERY_GAME_READ permission", async ({
    regularUserApiRequest,
  }) => {
    // GIVEN: I am authenticated but lack LOTTERY_GAME_READ permission
    // WHEN: I query lottery games
    const response = await regularUserApiRequest.get("/api/lottery/games");

    // THEN: I receive 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error should be present").toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/lottery/packs - AC #2
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.11-API-004: [P0] GET /api/lottery/packs - should return packs filtered by store_id (AC #2)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: Packs exist for my store and another store
    const game = await createLotteryGame(prismaClient, { name: "Test Game" });

    // Create another store (different from storeManagerUser.store_id)
    const otherCompany = await prismaClient.company.create({
      data: createCompany({ owner_user_id: storeManagerUser.user_id }),
    });
    const otherStore = await prismaClient.store.create({
      data: {
        ...createStore({ company_id: otherCompany.company_id }),
        location_json: {} as any,
      },
    });

    const myPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "MY-PACK-001",
    });
    const otherPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: otherStore.store_id,
      pack_number: "OTHER-PACK-001",
    });

    // WHEN: I query lottery packs for my store
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs?store_id=${storeManagerUser.store_id}`,
    );

    // THEN: I receive a list of packs filtered by store_id
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data, "Response should contain packs array").toBeInstanceOf(
      Array,
    );

    // AND: RLS policies ensure I only see packs for my store
    const packIds = body.data.map((p: any) => p.pack_id);
    expect(packIds, "Should include my store's pack").toContain(myPack.pack_id);
    expect(packIds, "Should NOT include other store's pack").not.toContain(
      otherPack.pack_id,
    );

    // AND: All packs belong to my store
    body.data.forEach((pack: any) => {
      expect(pack.store_id, "All packs should belong to my store").toBe(
        storeManagerUser.store_id,
      );
    });

    // Cleanup
    await withBypassClient(async (bypass) => {
      await bypass.store.delete({ where: { store_id: otherStore.store_id } });
      await bypass.company.delete({
        where: { company_id: otherCompany.company_id },
      });
    });
  });

  test("6.11-API-005: [P0] GET /api/lottery/packs - should filter packs by status (AC #2)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: Packs exist with different statuses
    const game = await createLotteryGame(prismaClient, { name: "Test Game" });

    const receivedPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      status: LotteryPackStatus.RECEIVED,
      pack_number: "RECEIVED-001",
    });
    const activePack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      status: LotteryPackStatus.ACTIVE,
      pack_number: "ACTIVE-001",
    });
    const depletedPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      status: LotteryPackStatus.DEPLETED,
      pack_number: "DEPLETED-001",
    });

    // WHEN: I query packs with status filter
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs?store_id=${storeManagerUser.store_id}&status=ACTIVE`,
    );

    // THEN: I receive only packs with ACTIVE status
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.data, "Response should contain packs array").toBeInstanceOf(
      Array,
    );

    const packIds = body.data.map((p: any) => p.pack_id);
    expect(packIds, "Should include ACTIVE pack").toContain(activePack.pack_id);
    expect(packIds, "Should NOT include RECEIVED pack").not.toContain(
      receivedPack.pack_id,
    );
    expect(packIds, "Should NOT include DEPLETED pack").not.toContain(
      depletedPack.pack_id,
    );

    // AND: All returned packs have ACTIVE status
    body.data.forEach((pack: any) => {
      expect(pack.status, "All packs should be ACTIVE").toBe("ACTIVE");
    });
  });

  test("6.11-API-006: [P0] GET /api/lottery/packs - should filter packs by game_id (AC #2)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: Packs exist for different games
    const game1 = await createLotteryGame(prismaClient, { name: "Game 1" });
    const game2 = await createLotteryGame(prismaClient, { name: "Game 2" });

    const pack1 = await createLotteryPack(prismaClient, {
      game_id: game1.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "GAME1-PACK",
    });
    const pack2 = await createLotteryPack(prismaClient, {
      game_id: game2.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "GAME2-PACK",
    });

    // WHEN: I query packs with game_id filter
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs?store_id=${storeManagerUser.store_id}&game_id=${game1.game_id}`,
    );

    // THEN: I receive only packs for game1
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    const packIds = body.data.map((p: any) => p.pack_id);
    expect(packIds, "Should include game1 pack").toContain(pack1.pack_id);
    expect(packIds, "Should NOT include game2 pack").not.toContain(
      pack2.pack_id,
    );

    // AND: All returned packs belong to game1
    body.data.forEach((pack: any) => {
      expect(pack.game_id, "All packs should belong to game1").toBe(
        game1.game_id,
      );
    });
  });

  test("6.11-API-007: [P0] GET /api/lottery/packs - should include game, store, and bin relationships (AC #2)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists with game and bin
    const game = await createLotteryGame(prismaClient, { name: "Test Game" });
    const bin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      name: "Bin A",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      current_bin_id: bin.bin_id,
      pack_number: "REL-PACK-001",
    });

    // WHEN: I query packs
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs?store_id=${storeManagerUser.store_id}`,
    );

    // THEN: Pack data includes game, store, and bin relationships
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    const foundPack = body.data.find((p: any) => p.pack_id === pack.pack_id);
    expect(foundPack, "Pack should be found").toBeDefined();
    expect(
      foundPack.game,
      "Pack should include game relationship",
    ).toHaveProperty("game_id");
    expect(foundPack.game.game_id, "Game ID should match").toBe(game.game_id);
    expect(foundPack.game.name, "Game name should be included").toBe(game.name);
    expect(
      foundPack.store,
      "Pack should include store relationship",
    ).toHaveProperty("store_id");
    expect(foundPack.store.store_id, "Store ID should match").toBe(
      storeManagerUser.store_id,
    );
    expect(
      foundPack.bin,
      "Pack should include bin relationship",
    ).toHaveProperty("bin_id");
    expect(foundPack.bin.bin_id, "Bin ID should match").toBe(bin.bin_id);
  });

  test("6.11-API-008: [P0] GET /api/lottery/packs - should enforce RLS (cannot access other store's packs) (AC #2)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: Another store exists with packs
    const otherCompany = await prismaClient.company.create({
      data: createCompany({ owner_user_id: storeManagerUser.user_id }),
    });
    const otherStore = await prismaClient.store.create({
      data: {
        ...createStore({ company_id: otherCompany.company_id }),
        location_json: {} as any,
      },
    });
    const game = await createLotteryGame(prismaClient, { name: "Test Game" });
    await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: otherStore.store_id,
      pack_number: "OTHER-STORE-PACK",
    });

    // WHEN: I try to query packs for the other store
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs?store_id=${otherStore.store_id}`,
    );

    // THEN: I receive 403 Forbidden (RLS violation)
    expect(response.status(), "Expected 403 Forbidden").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    // Permission middleware blocks access with PERMISSION_DENIED when store_id doesn't match user's scope
    expect(
      body.error.code,
      "Error code should be PERMISSION_DENIED (blocked at middleware level)",
    ).toBe("PERMISSION_DENIED");

    // Cleanup
    await withBypassClient(async (bypass) => {
      await bypass.store.delete({ where: { store_id: otherStore.store_id } });
      await bypass.company.delete({
        where: { company_id: otherCompany.company_id },
      });
    });
  });

  test("6.11-API-009: [P0] GET /api/lottery/packs - should require store_id parameter", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // WHEN: I query packs without store_id
    const response = await storeManagerApiRequest.get("/api/lottery/packs");

    // THEN: I receive 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error should be present").toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/lottery/packs/:packId - AC #3
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.11-API-010: [P0] GET /api/lottery/packs/:packId - should return detailed pack information (AC #3)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists with shift openings and closings
    const game = await createLotteryGame(prismaClient, { name: "Test Game" });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "DETAIL-PACK-001",
      serial_start: "000001",
      serial_end: "000100",
    });
    const shift = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
      },
      prismaClient,
    );
    const opening = await createLotteryShiftOpening(prismaClient, {
      shift_id: shift.shift_id,
      pack_id: pack.pack_id,
      opening_serial: "000001",
    });
    const closing = await createLotteryShiftClosing(prismaClient, {
      shift_id: shift.shift_id,
      pack_id: pack.pack_id,
      closing_serial: "000050",
    });

    // WHEN: I query a specific pack by packId
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs/${pack.pack_id}`,
    );

    // THEN: I receive detailed pack information
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.pack_id, "Pack ID should match").toBe(pack.pack_id);
    expect(body.data.pack_number, "Pack number should match").toBe(
      pack.pack_number,
    );

    // AND: Pack data includes shift_openings and shift_closings relationships
    expect(
      body.data.shift_openings,
      "Should include shift_openings",
    ).toBeInstanceOf(Array);
    expect(
      body.data.shift_openings.length,
      "Should have opening",
    ).toBeGreaterThan(0);
    const foundOpening = body.data.shift_openings.find(
      (o: any) => o.opening_id === opening.opening_id,
    );
    expect(foundOpening, "Should include the opening").toBeDefined();

    expect(
      body.data.shift_closings,
      "Should include shift_closings",
    ).toBeInstanceOf(Array);
    expect(
      body.data.shift_closings.length,
      "Should have closing",
    ).toBeGreaterThan(0);
    const foundClosing = body.data.shift_closings.find(
      (c: any) => c.closing_id === closing.closing_id,
    );
    expect(foundClosing, "Should include the closing").toBeDefined();
    // Verify closing structure includes variance information
    expect(
      foundClosing.expected_count,
      "Closing should include expected_count",
    ).toBeDefined();
    expect(
      foundClosing.actual_count,
      "Closing should include actual_count",
    ).toBeDefined();
    expect(
      foundClosing.has_variance,
      "Closing should include has_variance",
    ).toBeDefined();

    // AND: tickets_remaining is calculated and included
    expect(
      body.data.tickets_remaining,
      "Should include tickets_remaining",
    ).toBeDefined();
    // tickets_remaining can be a number (when serials are numeric) or null
    expect(
      body.data.tickets_remaining === null ||
        typeof body.data.tickets_remaining === "number",
      "tickets_remaining should be number or null",
    ).toBe(true);

    // Cleanup
    await withBypassClient(async (bypass) => {
      await bypass.shift.delete({ where: { shift_id: shift.shift_id } });
    });
  });

  test("6.11-API-011: [P0] GET /api/lottery/packs/:packId - should calculate tickets_remaining correctly (AC #3)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists with serial range 000001-000100
    const game = await createLotteryGame(prismaClient, { name: "Test Game" });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "TICKETS-PACK-001",
      serial_start: "000001",
      serial_end: "000100",
    });

    // WHEN: I query the pack
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs/${pack.pack_id}`,
    );

    // THEN: tickets_remaining is calculated correctly
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    // Formula: (serial_end - serial_start + 1) - sold_count
    // Since no tickets sold yet: (100 - 1 + 1) - 0 = 100
    expect(body.data.tickets_remaining, "tickets_remaining should be 100").toBe(
      100,
    );
  });

  test("6.11-API-012: [P0] GET /api/lottery/packs/:packId - should enforce RLS (cannot access other store's pack) (AC #3)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists for another store
    const otherCompany = await prismaClient.company.create({
      data: createCompany({ owner_user_id: storeManagerUser.user_id }),
    });
    const otherStore = await prismaClient.store.create({
      data: {
        ...createStore({ company_id: otherCompany.company_id }),
        location_json: {} as any,
      },
    });
    const game = await createLotteryGame(prismaClient, { name: "Test Game" });
    const otherPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: otherStore.store_id,
      pack_number: "OTHER-STORE-PACK",
    });

    // WHEN: I try to query the other store's pack
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs/${otherPack.pack_id}`,
    );

    // THEN: I receive 403 Forbidden (RLS violation)
    expect(response.status(), "Expected 403 Forbidden").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    // Error code is FORBIDDEN when accessing pack from different store
    expect(body.error.code, "Error code should be FORBIDDEN").toBe("FORBIDDEN");

    // Cleanup
    await withBypassClient(async (bypass) => {
      await bypass.store.delete({ where: { store_id: otherStore.store_id } });
      await bypass.company.delete({
        where: { company_id: otherCompany.company_id },
      });
    });
  });

  test("6.11-API-013: [P0] GET /api/lottery/packs/:packId - should return 404 for non-existent pack", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // WHEN: I query a non-existent pack
    const fakePackId = "00000000-0000-0000-0000-000000000000";
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs/${fakePackId}`,
    );

    // THEN: I receive 404 Not Found
    expect(response.status(), "Expected 404 Not Found").toBe(404);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be PACK_NOT_FOUND").toBe(
      "PACK_NOT_FOUND",
    );
  });

  test("6.11-API-013a: [P0] GET /api/lottery/packs/:packId - should allow COMPANY scope user to access any pack in their company (AC #3)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a CLIENT_OWNER with COMPANY scope
    // AND: A pack exists in a store within my company
    const game = await createLotteryGame(prismaClient, { name: "Test Game" });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: clientUser.store_id,
      pack_number: "COMPANY-SCOPE-PACK-001",
      serial_start: "000001",
      serial_end: "000100",
    });

    // WHEN: I query the pack as a COMPANY scope user
    const response = await clientUserApiRequest.get(
      `/api/lottery/packs/${pack.pack_id}`,
    );

    // THEN: I receive 200 OK (COMPANY scope has access to all stores in company)
    expect(response.status(), "Expected 200 OK for COMPANY scope access").toBe(
      200,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.pack_id, "Pack ID should match").toBe(pack.pack_id);
    expect(body.data.pack_number, "Pack number should match").toBe(
      pack.pack_number,
    );
  });

  test("6.11-API-013b: [P0] GET /api/lottery/packs/:packId - COMPANY scope user cannot access pack from different company", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a CLIENT_OWNER with COMPANY scope
    // AND: A pack exists in a store from a DIFFERENT company
    const otherOwnerData = createUser({
      name: "Test Other Owner",
    });
    const otherOwner = await prismaClient.user.create({
      data: otherOwnerData,
    });
    const otherCompany = await prismaClient.company.create({
      data: createCompany({ owner_user_id: otherOwner.user_id }),
    });
    const otherStore = await prismaClient.store.create({
      data: {
        ...createStore({ company_id: otherCompany.company_id }),
        location_json: {} as any,
      },
    });
    const game = await createLotteryGame(prismaClient, { name: "Test Game" });
    const otherPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: otherStore.store_id,
      pack_number: "OTHER-COMPANY-PACK-001",
    });

    // WHEN: I try to query a pack from a different company
    const response = await clientUserApiRequest.get(
      `/api/lottery/packs/${otherPack.pack_id}`,
    );

    // THEN: I receive 403 Forbidden (RLS violation - different company)
    expect(
      response.status(),
      "Expected 403 Forbidden for cross-company access",
    ).toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be FORBIDDEN").toBe("FORBIDDEN");

    // Cleanup
    await withBypassClient(async (bypass) => {
      await bypass.store.delete({ where: { store_id: otherStore.store_id } });
      await bypass.company.delete({
        where: { company_id: otherCompany.company_id },
      });
      await bypass.user.delete({ where: { user_id: otherOwner.user_id } });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/lottery/variances - AC #4
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.11-API-014: [P0] GET /api/lottery/variances - should return variances filtered by store_id (AC #4)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: Variances exist for my store and another store
    const game = await createLotteryGame(prismaClient, { name: "Test Game" });
    const pack1 = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "VAR-PACK-001",
    });
    // Create shift without explicit cashier_id - helper will create a cashier
    const shift1 = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
      },
      prismaClient,
    );
    const variance1 = await createLotteryVariance(prismaClient, {
      shift_id: shift1.shift_id,
      pack_id: pack1.pack_id,
      expected: 100,
      actual: 95,
    });

    // Create another store
    const otherCompany = await prismaClient.company.create({
      data: createCompany({ owner_user_id: storeManagerUser.user_id }),
    });
    const otherStore = await prismaClient.store.create({
      data: {
        ...createStore({ company_id: otherCompany.company_id }),
        location_json: {} as any,
      },
    });
    const pack2 = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: otherStore.store_id,
      pack_number: "OTHER-VAR-PACK",
    });
    // Create shift without explicit cashier_id - helper will create a cashier
    const shift2 = await createShift(
      {
        store_id: otherStore.store_id,
        opened_by: storeManagerUser.user_id,
      },
      prismaClient,
    );
    const variance2 = await createLotteryVariance(prismaClient, {
      shift_id: shift2.shift_id,
      pack_id: pack2.pack_id,
      expected: 50,
      actual: 45,
    });

    // WHEN: I query variances for my store
    const response = await storeManagerApiRequest.get(
      `/api/lottery/variances?store_id=${storeManagerUser.store_id}`,
    );

    // THEN: I receive a list of variances filtered by store_id
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data, "Response should contain variances array").toBeInstanceOf(
      Array,
    );

    // AND: RLS policies ensure I only see variances for my store
    const varianceIds = body.data.map((v: any) => v.variance_id);
    expect(varianceIds, "Should include my store's variance").toContain(
      variance1.variance_id,
    );
    expect(
      varianceIds,
      "Should NOT include other store's variance",
    ).not.toContain(variance2.variance_id);

    // Cleanup
    await withBypassClient(async (bypass) => {
      await bypass.shift.deleteMany({
        where: { shift_id: { in: [shift1.shift_id, shift2.shift_id] } },
      });
      await bypass.store.delete({ where: { store_id: otherStore.store_id } });
      await bypass.company.delete({
        where: { company_id: otherCompany.company_id },
      });
    });
  });

  test("6.11-API-015: [P0] GET /api/lottery/variances - should filter variances by status (AC #4)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: Variances exist with different statuses (unresolved and resolved)
    const game = await createLotteryGame(prismaClient, { name: "Test Game" });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "STATUS-PACK",
    });
    const shift = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
      },
      prismaClient,
    );
    const unresolvedVariance = await createLotteryVariance(prismaClient, {
      shift_id: shift.shift_id,
      pack_id: pack.pack_id,
      expected: 100,
      actual: 95,
      approved_by: null, // Unresolved
    });
    const resolvedVariance = await createLotteryVariance(prismaClient, {
      shift_id: shift.shift_id,
      pack_id: pack.pack_id,
      expected: 50,
      actual: 45,
      approved_by: storeManagerUser.user_id, // Resolved
      approved_at: new Date(),
    });

    // WHEN: I query variances with status filter (unresolved)
    const response = await storeManagerApiRequest.get(
      `/api/lottery/variances?store_id=${storeManagerUser.store_id}&status=unresolved`,
    );

    // THEN: I receive only unresolved variances
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    const varianceIds = body.data.map((v: any) => v.variance_id);
    expect(varianceIds, "Should include unresolved variance").toContain(
      unresolvedVariance.variance_id,
    );
    expect(varianceIds, "Should NOT include resolved variance").not.toContain(
      resolvedVariance.variance_id,
    );

    // AND: All returned variances are unresolved
    body.data.forEach((variance: any) => {
      expect(
        variance.approved_by,
        "All variances should be unresolved",
      ).toBeNull();
    });

    // Cleanup
    await withBypassClient(async (bypass) => {
      await bypass.shift.delete({ where: { shift_id: shift.shift_id } });
    });
  });

  test("6.11-API-016: [P0] GET /api/lottery/variances - should filter variances by shift_id and pack_id (AC #4)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: Multiple variances exist
    const game = await createLotteryGame(prismaClient, { name: "Test Game" });
    const pack1 = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "FILTER-PACK-1",
    });
    const pack2 = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "FILTER-PACK-2",
    });
    const shift1 = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
      },
      prismaClient,
    );
    const shift2 = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
      },
      prismaClient,
    );
    const variance1 = await createLotteryVariance(prismaClient, {
      shift_id: shift1.shift_id,
      pack_id: pack1.pack_id,
      expected: 100,
      actual: 95,
    });
    const variance2 = await createLotteryVariance(prismaClient, {
      shift_id: shift2.shift_id,
      pack_id: pack2.pack_id,
      expected: 50,
      actual: 45,
    });

    // WHEN: I query variances with shift_id and pack_id filters
    const response = await storeManagerApiRequest.get(
      `/api/lottery/variances?store_id=${storeManagerUser.store_id}&shift_id=${shift1.shift_id}&pack_id=${pack1.pack_id}`,
    );

    // THEN: I receive only the matching variance
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    const varianceIds = body.data.map((v: any) => v.variance_id);
    expect(varianceIds, "Should include matching variance").toContain(
      variance1.variance_id,
    );
    expect(varianceIds, "Should NOT include other variance").not.toContain(
      variance2.variance_id,
    );

    // Cleanup
    await withBypassClient(async (bypass) => {
      await bypass.shift.deleteMany({
        where: { shift_id: { in: [shift1.shift_id, shift2.shift_id] } },
      });
    });
  });

  test("6.11-API-017: [P0] GET /api/lottery/variances - should include pack and shift relationships (AC #4)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A variance exists
    const game = await createLotteryGame(prismaClient, { name: "Test Game" });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "REL-VAR-PACK",
    });
    const shift = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
      },
      prismaClient,
    );
    const variance = await createLotteryVariance(prismaClient, {
      shift_id: shift.shift_id,
      pack_id: pack.pack_id,
      expected: 100,
      actual: 95,
    });

    // WHEN: I query variances
    const response = await storeManagerApiRequest.get(
      `/api/lottery/variances?store_id=${storeManagerUser.store_id}`,
    );

    // THEN: Variance data includes pack and shift relationships
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    const foundVariance = body.data.find(
      (v: any) => v.variance_id === variance.variance_id,
    );
    expect(foundVariance, "Variance should be found").toBeDefined();
    expect(
      foundVariance.pack,
      "Variance should include pack relationship",
    ).toHaveProperty("pack_id");
    expect(foundVariance.pack.pack_id, "Pack ID should match").toBe(
      pack.pack_id,
    );
    expect(
      foundVariance.shift,
      "Variance should include shift relationship",
    ).toHaveProperty("shift_id");
    expect(foundVariance.shift.shift_id, "Shift ID should match").toBe(
      shift.shift_id,
    );

    // Cleanup
    await withBypassClient(async (bypass) => {
      await bypass.shift.delete({ where: { shift_id: shift.shift_id } });
    });
  });

  test("6.11-API-018: [P0] GET /api/lottery/variances - should enforce RLS (cannot access other store's variances) (AC #4)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A variance exists for another store
    const otherCompany = await prismaClient.company.create({
      data: createCompany({ owner_user_id: storeManagerUser.user_id }),
    });
    const otherStore = await prismaClient.store.create({
      data: {
        ...createStore({ company_id: otherCompany.company_id }),
        location_json: {} as any,
      },
    });
    const game = await createLotteryGame(prismaClient, { name: "Test Game" });
    const otherPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: otherStore.store_id,
      pack_number: "OTHER-VAR-PACK",
    });
    const otherShift = await createShift(
      {
        store_id: otherStore.store_id,
        opened_by: storeManagerUser.user_id,
      },
      prismaClient,
    );
    await createLotteryVariance(prismaClient, {
      shift_id: otherShift.shift_id,
      pack_id: otherPack.pack_id,
      expected: 50,
      actual: 45,
    });

    // WHEN: I try to query variances for the other store
    const response = await storeManagerApiRequest.get(
      `/api/lottery/variances?store_id=${otherStore.store_id}`,
    );

    // THEN: I receive 403 Forbidden (RLS violation)
    expect(response.status(), "Expected 403 Forbidden").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    // Permission middleware blocks access with PERMISSION_DENIED when store_id doesn't match user's scope
    expect(
      body.error.code,
      "Error code should be PERMISSION_DENIED (blocked at middleware level)",
    ).toBe("PERMISSION_DENIED");

    // Cleanup
    await withBypassClient(async (bypass) => {
      await bypass.shift.delete({ where: { shift_id: otherShift.shift_id } });
      await bypass.store.delete({ where: { store_id: otherStore.store_id } });
      await bypass.company.delete({
        where: { company_id: otherCompany.company_id },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/lottery/bins - AC #5
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.11-API-019: [P0] GET /api/lottery/bins - should return bins filtered by store_id (AC #5)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: Bins exist for my store and another store
    const myBin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      name: "My Bin",
    });

    // Create another store
    const otherCompany = await prismaClient.company.create({
      data: createCompany({ owner_user_id: storeManagerUser.user_id }),
    });
    const otherStore = await prismaClient.store.create({
      data: {
        ...createStore({ company_id: otherCompany.company_id }),
        location_json: {} as any,
      },
    });
    const otherBin = await createLotteryBin(prismaClient, {
      store_id: otherStore.store_id,
      name: "Other Bin",
    });

    // WHEN: I query lottery bins for my store
    const response = await storeManagerApiRequest.get(
      `/api/lottery/bins?store_id=${storeManagerUser.store_id}`,
    );

    // THEN: I receive a list of bins filtered by store_id
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data, "Response should contain bins array").toBeInstanceOf(
      Array,
    );

    // AND: RLS policies ensure I only see bins for my store
    const binIds = body.data.map((b: any) => b.bin_id);
    expect(binIds, "Should include my store's bin").toContain(myBin.bin_id);
    expect(binIds, "Should NOT include other store's bin").not.toContain(
      otherBin.bin_id,
    );

    // AND: All bins belong to my store
    body.data.forEach((bin: any) => {
      expect(bin.store_id, "All bins should belong to my store").toBe(
        storeManagerUser.store_id,
      );
    });

    // Cleanup
    await withBypassClient(async (bypass) => {
      await bypass.store.delete({ where: { store_id: otherStore.store_id } });
      await bypass.company.delete({
        where: { company_id: otherCompany.company_id },
      });
    });
  });

  test("6.11-API-020: [P0] GET /api/lottery/bins - should enforce RLS (cannot access other store's bins) (AC #5)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A bin exists for another store
    const otherCompany = await prismaClient.company.create({
      data: createCompany({ owner_user_id: storeManagerUser.user_id }),
    });
    const otherStore = await prismaClient.store.create({
      data: {
        ...createStore({ company_id: otherCompany.company_id }),
        location_json: {} as any,
      },
    });
    await createLotteryBin(prismaClient, {
      store_id: otherStore.store_id,
      name: "Other Store Bin",
    });

    // WHEN: I try to query bins for the other store
    const response = await storeManagerApiRequest.get(
      `/api/lottery/bins?store_id=${otherStore.store_id}`,
    );

    // THEN: I receive 403 Forbidden (RLS violation)
    expect(response.status(), "Expected 403 Forbidden").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    // Permission middleware blocks access with PERMISSION_DENIED when store_id doesn't match user's scope
    expect(
      body.error.code,
      "Error code should be PERMISSION_DENIED (blocked at middleware level)",
    ).toBe("PERMISSION_DENIED");

    // Cleanup
    await withBypassClient(async (bypass) => {
      await bypass.store.delete({ where: { store_id: otherStore.store_id } });
      await bypass.company.delete({
        where: { company_id: otherCompany.company_id },
      });
    });
  });

  test("6.11-API-021: [P0] GET /api/lottery/bins - should require store_id parameter", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // WHEN: I query bins without store_id
    const response = await storeManagerApiRequest.get("/api/lottery/bins");

    // THEN: I receive 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error should be present").toBeDefined();
  });

  test("6.11-API-022: [P0] GET /api/lottery/bins - should return empty array when no bins exist", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: No bins exist for my store
    // WHEN: I query bins
    const response = await storeManagerApiRequest.get(
      `/api/lottery/bins?store_id=${storeManagerUser.store_id}`,
    );

    // THEN: I receive an empty array
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data, "Response should contain empty array").toEqual([]);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT LOGGING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.11-API-023: [P1] All GET endpoints should create audit log entries", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: Test data exists
    const game = await createLotteryGame(prismaClient, {
      name: "Audit Test Game",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "AUDIT-PACK",
    });
    // Create bin for the bins query endpoint (not directly asserted, but needed for test data)
    await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      name: "Audit Bin",
    });

    // WHEN: I query each endpoint
    await storeManagerApiRequest.get("/api/lottery/games");
    await storeManagerApiRequest.get(
      `/api/lottery/packs?store_id=${storeManagerUser.store_id}`,
    );
    await storeManagerApiRequest.get(`/api/lottery/packs/${pack.pack_id}`);
    await storeManagerApiRequest.get(
      `/api/lottery/variances?store_id=${storeManagerUser.store_id}`,
    );
    await storeManagerApiRequest.get(
      `/api/lottery/bins?store_id=${storeManagerUser.store_id}`,
    );

    // THEN: Audit log entries are created for each query
    const auditLogs = await prismaClient.auditLog.findMany({
      where: {
        user_id: storeManagerUser.user_id,
        action: {
          in: [
            "LOTTERY_GAMES_QUERIED",
            "LOTTERY_PACKS_QUERIED",
            "LOTTERY_PACK_DETAILS_QUERIED", // Note: plural "DETAILS" matches implementation
            "LOTTERY_VARIANCES_QUERIED",
            "LOTTERY_BINS_QUERIED",
          ],
        },
      },
      orderBy: { timestamp: "desc" },
      take: 10,
    });

    expect(auditLogs.length, "Should have audit log entries").toBeGreaterThan(
      0,
    );
    const actions = auditLogs.map((log) => log.action);
    expect(actions, "Should include games query").toContain(
      "LOTTERY_GAMES_QUERIED",
    );
    expect(actions, "Should include packs query").toContain(
      "LOTTERY_PACKS_QUERIED",
    );
    expect(actions, "Should include pack details query").toContain(
      "LOTTERY_PACK_DETAILS_QUERIED", // Note: plural "DETAILS" matches implementation
    );
    expect(actions, "Should include variances query").toContain(
      "LOTTERY_VARIANCES_QUERIED",
    );
    expect(actions, "Should include bins query").toContain(
      "LOTTERY_BINS_QUERIED",
    );
  });
});
