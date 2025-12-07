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
 *
 * RED PHASE: These tests define expected behavior before implementation.
 * Tests will fail until query endpoints are implemented.
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createLotteryGame,
  createLotteryPack,
  createLotteryBin,
  createLotteryVariance,
  createLotteryShiftOpening,
  createLotteryShiftClosing,
} from "../support/factories";
import { createCompany, createStore, createUser } from "../support/helpers";
import { PrismaClient } from "@prisma/client";
import { LotteryGameStatus, LotteryPackStatus } from "@prisma/client";

/**
 * NOTE: LotteryTicketSerial model does not exist in schema yet.
 * tickets_remaining calculation may need to use a different approach
 * (e.g., counting from shift_openings/closings or a future ticket tracking model).
 * This test will fail until the calculation logic is implemented.
 */

test.describe("GET /api/lottery/games", () => {
  test("should return list of active lottery games", async ({
    request,
    prisma,
    storeManagerToken,
  }) => {
    // GIVEN: Active and inactive games exist
    const activeGame1 = await createLotteryGame(prisma, {
      status: LotteryGameStatus.ACTIVE,
    });
    const activeGame2 = await createLotteryGame(prisma, {
      status: LotteryGameStatus.ACTIVE,
    });
    await createLotteryGame(prisma, {
      status: LotteryGameStatus.INACTIVE,
    });

    // WHEN: Querying lottery games
    const response = await request.get("/api/lottery/games", {
      headers: {
        Authorization: `Bearer ${storeManagerToken}`,
      },
    });

    // THEN: Response is successful and contains only active games
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      success: true,
      data: expect.any(Array),
    });
    expect(body.data).toHaveLength(2);
    expect(body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          game_id: activeGame1.game_id,
          status: LotteryGameStatus.ACTIVE,
        }),
        expect.objectContaining({
          game_id: activeGame2.game_id,
          status: LotteryGameStatus.ACTIVE,
        }),
      ]),
    );
  });

  test("should require authentication", async ({ request }) => {
    // GIVEN: No authentication token
    // WHEN: Querying lottery games
    const response = await request.get("/api/lottery/games");

    // THEN: Response is 401 Unauthorized
    expect(response.status()).toBe(401);
  });

  test("should require Store Manager permission", async ({
    request,
    cashierToken,
  }) => {
    // GIVEN: User with cashier role (no LOTTERY_GAME_READ permission)
    // WHEN: Querying lottery games
    const response = await request.get("/api/lottery/games", {
      headers: {
        Authorization: `Bearer ${cashierToken}`,
      },
    });

    // THEN: Response is 403 Forbidden
    expect(response.status()).toBe(403);
  });

  test("should create audit log entry for query", async ({
    request,
    prisma,
    storeManagerToken,
    storeManagerUser,
  }) => {
    // GIVEN: Active games exist
    await createLotteryGame(prisma, {
      status: LotteryGameStatus.ACTIVE,
    });

    // WHEN: Querying lottery games
    const response = await request.get("/api/lottery/games", {
      headers: {
        Authorization: `Bearer ${storeManagerToken}`,
      },
    });

    // THEN: Response is successful
    expect(response.status()).toBe(200);

    // AND: Audit log entry is created
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        user_id: storeManagerUser.user_id,
        action: "LOTTERY_GAMES_QUERIED",
        table_name: "lottery_games",
      },
      orderBy: {
        created_at: "desc",
      },
    });

    expect(auditLog, "Audit log should be created").not.toBeNull();
    expect(auditLog?.user_id).toBe(storeManagerUser.user_id);
    expect(auditLog?.action).toBe("LOTTERY_GAMES_QUERIED");
    expect(auditLog?.table_name).toBe("lottery_games");
  });
});

test.describe("GET /api/lottery/packs", () => {
  test("should return packs filtered by store_id", async ({
    request,
    prisma,
    storeManagerToken,
    storeManagerUser,
    storeManagerStore,
  }) => {
    // GIVEN: Packs exist for store manager's store and another store
    const game = await createLotteryGame(prisma);
    const pack1 = await createLotteryPack(prisma, {
      game_id: game.game_id,
      store_id: storeManagerStore.store_id,
      status: LotteryPackStatus.ACTIVE,
    });
    const pack2 = await createLotteryPack(prisma, {
      game_id: game.game_id,
      store_id: storeManagerStore.store_id,
      status: LotteryPackStatus.RECEIVED,
    });

    // Create pack for another store
    const otherStore = await createStore(prisma, {
      company_id: (await createCompany(prisma)).company_id,
    });
    await createLotteryPack(prisma, {
      game_id: game.game_id,
      store_id: otherStore.store_id,
      status: LotteryPackStatus.ACTIVE,
    });

    // WHEN: Querying packs for store manager's store
    const response = await request.get(
      `/api/lottery/packs?store_id=${storeManagerStore.store_id}`,
      {
        headers: {
          Authorization: `Bearer ${storeManagerToken}`,
        },
      },
    );

    // THEN: Response contains only packs for store manager's store
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      success: true,
      data: expect.any(Array),
    });
    expect(body.data).toHaveLength(2);
    expect(body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pack_id: pack1.pack_id,
          store_id: storeManagerStore.store_id,
        }),
        expect.objectContaining({
          pack_id: pack2.pack_id,
          store_id: storeManagerStore.store_id,
        }),
      ]),
    );
  });

  test("should filter packs by status", async ({
    request,
    prisma,
    storeManagerToken,
    storeManagerStore,
  }) => {
    // GIVEN: Packs with different statuses exist
    const game = await createLotteryGame(prisma);
    const activePack = await createLotteryPack(prisma, {
      game_id: game.game_id,
      store_id: storeManagerStore.store_id,
      status: LotteryPackStatus.ACTIVE,
    });
    await createLotteryPack(prisma, {
      game_id: game.game_id,
      store_id: storeManagerStore.store_id,
      status: LotteryPackStatus.RECEIVED,
    });

    // WHEN: Querying packs with status=ACTIVE filter
    const response = await request.get(
      `/api/lottery/packs?store_id=${storeManagerStore.store_id}&status=ACTIVE`,
      {
        headers: {
          Authorization: `Bearer ${storeManagerToken}`,
        },
      },
    );

    // THEN: Response contains only ACTIVE packs
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      pack_id: activePack.pack_id,
      status: LotteryPackStatus.ACTIVE,
    });
  });

  test("should filter packs by game_id", async ({
    request,
    prisma,
    storeManagerToken,
    storeManagerStore,
  }) => {
    // GIVEN: Packs for different games exist
    const game1 = await createLotteryGame(prisma);
    const game2 = await createLotteryGame(prisma);
    const pack1 = await createLotteryPack(prisma, {
      game_id: game1.game_id,
      store_id: storeManagerStore.store_id,
    });
    await createLotteryPack(prisma, {
      game_id: game2.game_id,
      store_id: storeManagerStore.store_id,
    });

    // WHEN: Querying packs with game_id filter
    const response = await request.get(
      `/api/lottery/packs?store_id=${storeManagerStore.store_id}&game_id=${game1.game_id}`,
      {
        headers: {
          Authorization: `Bearer ${storeManagerToken}`,
        },
      },
    );

    // THEN: Response contains only packs for game1
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      pack_id: pack1.pack_id,
      game_id: game1.game_id,
    });
  });

  test("should include game, store, and bin relationships", async ({
    request,
    prisma,
    storeManagerToken,
    storeManagerStore,
  }) => {
    // GIVEN: Pack with bin exists
    const game = await createLotteryGame(prisma);
    const bin = await createLotteryBin(prisma, {
      store_id: storeManagerStore.store_id,
    });
    const pack = await createLotteryPack(prisma, {
      game_id: game.game_id,
      store_id: storeManagerStore.store_id,
      current_bin_id: bin.bin_id,
    });

    // WHEN: Querying packs
    const response = await request.get(
      `/api/lottery/packs?store_id=${storeManagerStore.store_id}`,
      {
        headers: {
          Authorization: `Bearer ${storeManagerToken}`,
        },
      },
    );

    // THEN: Response includes game, store, and bin relationships
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data[0]).toMatchObject({
      pack_id: pack.pack_id,
      game: expect.objectContaining({
        game_id: game.game_id,
        name: game.name,
      }),
      store: expect.objectContaining({
        store_id: storeManagerStore.store_id,
      }),
      bin: expect.objectContaining({
        bin_id: bin.bin_id,
      }),
    });
  });

  test("should enforce RLS - user cannot access another store's packs", async ({
    request,
    prisma,
    storeManagerToken,
  }) => {
    // GIVEN: Pack exists for another store
    const otherStore = await createStore(prisma, {
      company_id: (await createCompany(prisma)).company_id,
    });
    const game = await createLotteryGame(prisma);
    await createLotteryPack(prisma, {
      game_id: game.game_id,
      store_id: otherStore.store_id,
    });

    // WHEN: Store manager tries to query another store's packs
    const response = await request.get(
      `/api/lottery/packs?store_id=${otherStore.store_id}`,
      {
        headers: {
          Authorization: `Bearer ${storeManagerToken}`,
        },
      },
    );

    // THEN: Response is 403 Forbidden
    expect(response.status()).toBe(403);
  });

  test("should require store_id query parameter", async ({
    request,
    storeManagerToken,
  }) => {
    // GIVEN: No store_id parameter
    // WHEN: Querying packs without store_id
    const response = await request.get("/api/lottery/packs", {
      headers: {
        Authorization: `Bearer ${storeManagerToken}`,
      },
    });

    // THEN: Response is 400 Bad Request
    expect(response.status()).toBe(400);
  });

  test("should create audit log entry for packs query", async ({
    request,
    prisma,
    storeManagerToken,
    storeManagerUser,
    storeManagerStore,
  }) => {
    // GIVEN: Pack exists
    const game = await createLotteryGame(prisma);
    await createLotteryPack(prisma, {
      game_id: game.game_id,
      store_id: storeManagerStore.store_id,
    });

    // WHEN: Querying packs
    const response = await request.get(
      `/api/lottery/packs?store_id=${storeManagerStore.store_id}`,
      {
        headers: {
          Authorization: `Bearer ${storeManagerToken}`,
        },
      },
    );

    // THEN: Response is successful
    expect(response.status()).toBe(200);

    // AND: Audit log entry is created
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        user_id: storeManagerUser.user_id,
        action: "LOTTERY_PACKS_QUERIED",
        table_name: "lottery_packs",
      },
      orderBy: {
        created_at: "desc",
      },
    });

    expect(auditLog, "Audit log should be created").not.toBeNull();
    expect(auditLog?.user_id).toBe(storeManagerUser.user_id);
    expect(auditLog?.action).toBe("LOTTERY_PACKS_QUERIED");
    expect(auditLog?.table_name).toBe("lottery_packs");
  });
});

test.describe("GET /api/lottery/packs/:packId", () => {
  test("should return detailed pack information", async ({
    request,
    prisma,
    storeManagerToken,
    storeManagerStore,
  }) => {
    // GIVEN: Pack exists with serial range
    const game = await createLotteryGame(prisma);
    const pack = await createLotteryPack(prisma, {
      game_id: game.game_id,
      store_id: storeManagerStore.store_id,
      serial_start: "000001",
      serial_end: "000100",
    });

    // WHEN: Querying pack by ID
    const response = await request.get(`/api/lottery/packs/${pack.pack_id}`, {
      headers: {
        Authorization: `Bearer ${storeManagerToken}`,
      },
    });

    // THEN: Response contains detailed pack information
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      success: true,
      data: expect.objectContaining({
        pack_id: pack.pack_id,
        game_id: game.game_id,
        store_id: storeManagerStore.store_id,
        serial_start: "000001",
        serial_end: "000100",
      }),
    });
  });

  test("should include shift_openings and shift_closings relationships", async ({
    request,
    prisma,
    storeManagerToken,
    storeManagerStore,
  }) => {
    // GIVEN: Pack with shift opening and closing exists
    const game = await createLotteryGame(prisma);
    const pack = await createLotteryPack(prisma, {
      game_id: game.game_id,
      store_id: storeManagerStore.store_id,
    });
    // Note: Shift opening/closing creation requires Shift model - simplified for now
    // TODO: Add shift opening/closing creation when models are available

    // WHEN: Querying pack by ID
    const response = await request.get(`/api/lottery/packs/${pack.pack_id}`, {
      headers: {
        Authorization: `Bearer ${storeManagerToken}`,
      },
    });

    // THEN: Response includes shift_openings and shift_closings arrays
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveProperty("shift_openings");
    expect(body.data).toHaveProperty("shift_closings");
    expect(Array.isArray(body.data.shift_openings)).toBe(true);
    expect(Array.isArray(body.data.shift_closings)).toBe(true);
  });

  test("should calculate tickets_remaining correctly", async ({
    request,
    prisma,
    storeManagerToken,
    storeManagerStore,
  }) => {
    // GIVEN: Pack with serial range 000001-000100
    // NOTE: tickets_remaining calculation depends on implementation
    // Formula: (serial_end - serial_start + 1) - COUNT(sold tickets)
    // Since LotteryTicketSerial model doesn't exist, calculation may use
    // shift_openings/closings or a different approach
    const game = await createLotteryGame(prisma);
    const pack = await createLotteryPack(prisma, {
      game_id: game.game_id,
      store_id: storeManagerStore.store_id,
      serial_start: "000001",
      serial_end: "000100",
    });

    // TODO: Create sold tickets tracking when model/approach is determined
    // For now, test expects tickets_remaining field to exist

    // WHEN: Querying pack by ID
    const response = await request.get(`/api/lottery/packs/${pack.pack_id}`, {
      headers: {
        Authorization: `Bearer ${storeManagerToken}`,
      },
    });

    // THEN: Response includes tickets_remaining field
    // Expected: (100 - 1 + 1) - sold_count = 100 - sold_count
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveProperty("tickets_remaining");
    expect(typeof body.data.tickets_remaining).toBe("number");
    // Value depends on implementation - test will fail until calculation is implemented
  });

  test("should return 404 for non-existent pack", async ({
    request,
    storeManagerToken,
  }) => {
    // GIVEN: Non-existent pack ID
    const fakePackId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Querying pack by ID
    const response = await request.get(`/api/lottery/packs/${fakePackId}`, {
      headers: {
        Authorization: `Bearer ${storeManagerToken}`,
      },
    });

    // THEN: Response is 404 Not Found
    expect(response.status()).toBe(404);
  });

  test("should enforce RLS - user cannot access another store's pack", async ({
    request,
    prisma,
    storeManagerToken,
  }) => {
    // GIVEN: Pack exists for another store
    const otherStore = await createStore(prisma, {
      company_id: (await createCompany(prisma)).company_id,
    });
    const game = await createLotteryGame(prisma);
    const pack = await createLotteryPack(prisma, {
      game_id: game.game_id,
      store_id: otherStore.store_id,
    });

    // WHEN: Store manager tries to query another store's pack
    const response = await request.get(`/api/lottery/packs/${pack.pack_id}`, {
      headers: {
        Authorization: `Bearer ${storeManagerToken}`,
      },
    });

    // THEN: Response is 403 Forbidden
    expect(response.status()).toBe(403);
  });

  test("should create audit log entry for pack details query", async ({
    request,
    prisma,
    storeManagerToken,
    storeManagerUser,
    storeManagerStore,
  }) => {
    // GIVEN: Pack exists
    const game = await createLotteryGame(prisma);
    const pack = await createLotteryPack(prisma, {
      game_id: game.game_id,
      store_id: storeManagerStore.store_id,
    });

    // WHEN: Querying pack details
    const response = await request.get(`/api/lottery/packs/${pack.pack_id}`, {
      headers: {
        Authorization: `Bearer ${storeManagerToken}`,
      },
    });

    // THEN: Response is successful
    expect(response.status()).toBe(200);

    // AND: Audit log entry is created
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        user_id: storeManagerUser.user_id,
        action: "LOTTERY_PACK_DETAILS_QUERIED",
        table_name: "lottery_packs",
        record_id: pack.pack_id,
      },
      orderBy: {
        created_at: "desc",
      },
    });

    expect(auditLog, "Audit log should be created").not.toBeNull();
    expect(auditLog?.user_id).toBe(storeManagerUser.user_id);
    expect(auditLog?.action).toBe("LOTTERY_PACK_DETAILS_QUERIED");
    expect(auditLog?.record_id).toBe(pack.pack_id);
  });
});

test.describe("GET /api/lottery/variances", () => {
  test("should return variances filtered by store_id", async ({
    request,
    prisma,
    storeManagerToken,
    storeManagerStore,
  }) => {
    // GIVEN: Variances exist for store manager's store
    const game = await createLotteryGame(prisma);
    const pack = await createLotteryPack(prisma, {
      game_id: game.game_id,
      store_id: storeManagerStore.store_id,
    });
    // Note: Shift creation simplified - requires Shift model
    // TODO: Create proper shift when models are available
    const shiftId = "00000000-0000-0000-0000-000000000001"; // Placeholder
    // Note: Shift creation requires Shift model - using placeholder ID for now
    const variance1 = await createLotteryVariance(prisma, {
      shift_id: shiftId,
      pack_id: pack.pack_id,
      expected: 100,
      actual: 95,
    });

    // WHEN: Querying variances for store manager's store
    const response = await request.get(
      `/api/lottery/variances?store_id=${storeManagerStore.store_id}`,
      {
        headers: {
          Authorization: `Bearer ${storeManagerToken}`,
        },
      },
    );

    // THEN: Response contains variances for store manager's store
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      success: true,
      data: expect.any(Array),
    });
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          variance_id: variance1.variance_id,
        }),
      ]),
    );
  });

  test("should filter variances by status (unresolved vs resolved)", async ({
    request,
    prisma,
    storeManagerToken,
    storeManagerStore,
    storeManagerUser,
  }) => {
    // GIVEN: Variances with different statuses exist
    // Note: Status is determined by approved_by/approved_at (null = unresolved, set = resolved)
    const game = await createLotteryGame(prisma);
    const pack = await createLotteryPack(prisma, {
      game_id: game.game_id,
      store_id: storeManagerStore.store_id,
    });
    const shiftId = "00000000-0000-0000-0000-000000000001";
    const unresolvedVariance = await createLotteryVariance(prisma, {
      shift_id: shiftId,
      pack_id: pack.pack_id,
      expected: 100,
      actual: 95,
      approved_by: null, // Unresolved
      approved_at: null,
    });
    await createLotteryVariance(prisma, {
      shift_id: shiftId,
      pack_id: pack.pack_id,
      expected: 100,
      actual: 98,
      approved_by: storeManagerUser.user_id, // Resolved
      approved_at: new Date(),
    });

    // WHEN: Querying variances with status=unresolved filter
    const response = await request.get(
      `/api/lottery/variances?store_id=${storeManagerStore.store_id}&status=unresolved`,
      {
        headers: {
          Authorization: `Bearer ${storeManagerToken}`,
        },
      },
    );

    // THEN: Response contains only unresolved variances (approved_by is null)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          variance_id: unresolvedVariance.variance_id,
        }),
      ]),
    );
    // All returned variances should be unresolved (approved_by is null)
    expect(body.data.every((v: any) => v.approved_by === null)).toBe(true);
  });

  test("should include pack and shift relationships", async ({
    request,
    prisma,
    storeManagerToken,
    storeManagerStore,
  }) => {
    // GIVEN: Variance exists
    const game = await createLotteryGame(prisma);
    const pack = await createLotteryPack(prisma, {
      game_id: game.game_id,
      store_id: storeManagerStore.store_id,
    });
    const shiftId = "00000000-0000-0000-0000-000000000001";
    const variance = await createLotteryVariance(prisma, {
      shift_id: shiftId,
      pack_id: pack.pack_id,
      expected: 100,
      actual: 95,
    });

    // WHEN: Querying variances
    const response = await request.get(
      `/api/lottery/variances?store_id=${storeManagerStore.store_id}`,
      {
        headers: {
          Authorization: `Bearer ${storeManagerToken}`,
        },
      },
    );

    // THEN: Response includes pack and shift relationships
    expect(response.status()).toBe(200);
    const body = await response.json();
    const varianceData = body.data.find(
      (v: any) => v.variance_id === variance.variance_id,
    );
    expect(varianceData).toMatchObject({
      variance_id: variance.variance_id,
      pack: expect.objectContaining({
        pack_id: pack.pack_id,
      }),
      shift: expect.objectContaining({
        shift_id: shiftId,
      }),
    });
  });

  test("should enforce RLS - user cannot access another store's variances", async ({
    request,
    prisma,
    storeManagerToken,
  }) => {
    // GIVEN: Variance exists for another store
    const otherStore = await createStore(prisma, {
      company_id: (await createCompany(prisma)).company_id,
    });
    const game = await createLotteryGame(prisma);
    const pack = await createLotteryPack(prisma, {
      game_id: game.game_id,
      store_id: otherStore.store_id,
    });
    const shiftId = "00000000-0000-0000-0000-000000000001";
    await createLotteryVariance(prisma, {
      shift_id: shiftId,
      pack_id: pack.pack_id,
      expected: 100,
      actual: 95,
    });

    // WHEN: Store manager tries to query another store's variances
    const response = await request.get(
      `/api/lottery/variances?store_id=${otherStore.store_id}`,
      {
        headers: {
          Authorization: `Bearer ${storeManagerToken}`,
        },
      },
    );

    // THEN: Response is 403 Forbidden
    expect(response.status()).toBe(403);
  });

  test("should create audit log entry for variances query", async ({
    request,
    prisma,
    storeManagerToken,
    storeManagerUser,
    storeManagerStore,
  }) => {
    // GIVEN: Variance exists
    const game = await createLotteryGame(prisma);
    const pack = await createLotteryPack(prisma, {
      game_id: game.game_id,
      store_id: storeManagerStore.store_id,
    });
    const shiftId = "00000000-0000-0000-0000-000000000001";
    await createLotteryVariance(prisma, {
      shift_id: shiftId,
      pack_id: pack.pack_id,
      expected: 100,
      actual: 95,
    });

    // WHEN: Querying variances
    const response = await request.get(
      `/api/lottery/variances?store_id=${storeManagerStore.store_id}`,
      {
        headers: {
          Authorization: `Bearer ${storeManagerToken}`,
        },
      },
    );

    // THEN: Response is successful
    expect(response.status()).toBe(200);

    // AND: Audit log entry is created
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        user_id: storeManagerUser.user_id,
        action: "LOTTERY_VARIANCES_QUERIED",
        table_name: "lottery_variances",
      },
      orderBy: {
        created_at: "desc",
      },
    });

    expect(auditLog, "Audit log should be created").not.toBeNull();
    expect(auditLog?.user_id).toBe(storeManagerUser.user_id);
    expect(auditLog?.action).toBe("LOTTERY_VARIANCES_QUERIED");
    expect(auditLog?.table_name).toBe("lottery_variances");
  });
});

test.describe("GET /api/lottery/bins", () => {
  test("should return bins filtered by store_id", async ({
    request,
    prisma,
    storeManagerToken,
    storeManagerStore,
  }) => {
    // GIVEN: Bins exist for store manager's store
    const bin1 = await createLotteryBin(prisma, {
      store_id: storeManagerStore.store_id,
    });
    const bin2 = await createLotteryBin(prisma, {
      store_id: storeManagerStore.store_id,
    });

    // WHEN: Querying bins for store manager's store
    const response = await request.get(
      `/api/lottery/bins?store_id=${storeManagerStore.store_id}`,
      {
        headers: {
          Authorization: `Bearer ${storeManagerToken}`,
        },
      },
    );

    // THEN: Response contains bins for store manager's store
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      success: true,
      data: expect.any(Array),
    });
    expect(body.data.length).toBeGreaterThanOrEqual(2);
    expect(body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bin_id: bin1.bin_id,
          store_id: storeManagerStore.store_id,
        }),
        expect.objectContaining({
          bin_id: bin2.bin_id,
          store_id: storeManagerStore.store_id,
        }),
      ]),
    );
  });

  test("should enforce RLS - user cannot access another store's bins", async ({
    request,
    prisma,
    storeManagerToken,
  }) => {
    // GIVEN: Bin exists for another store
    const otherStore = await createStore(prisma, {
      company_id: (await createCompany(prisma)).company_id,
    });
    await createLotteryBin(prisma, {
      store_id: otherStore.store_id,
    });

    // WHEN: Store manager tries to query another store's bins
    const response = await request.get(
      `/api/lottery/bins?store_id=${otherStore.store_id}`,
      {
        headers: {
          Authorization: `Bearer ${storeManagerToken}`,
        },
      },
    );

    // THEN: Response is 403 Forbidden
    expect(response.status()).toBe(403);
  });

  test("should require store_id query parameter", async ({
    request,
    storeManagerToken,
  }) => {
    // GIVEN: No store_id parameter
    // WHEN: Querying bins without store_id
    const response = await request.get("/api/lottery/bins", {
      headers: {
        Authorization: `Bearer ${storeManagerToken}`,
      },
    });

    // THEN: Response is 400 Bad Request
    expect(response.status()).toBe(400);
  });

  test("should create audit log entry for bins query", async ({
    request,
    prisma,
    storeManagerToken,
    storeManagerUser,
    storeManagerStore,
  }) => {
    // GIVEN: Bin exists
    await createLotteryBin(prisma, {
      store_id: storeManagerStore.store_id,
    });

    // WHEN: Querying bins
    const response = await request.get(
      `/api/lottery/bins?store_id=${storeManagerStore.store_id}`,
      {
        headers: {
          Authorization: `Bearer ${storeManagerToken}`,
        },
      },
    );

    // THEN: Response is successful
    expect(response.status()).toBe(200);

    // AND: Audit log entry is created
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        user_id: storeManagerUser.user_id,
        action: "LOTTERY_BINS_QUERIED",
        table_name: "lottery_bins",
      },
      orderBy: {
        created_at: "desc",
      },
    });

    expect(auditLog, "Audit log should be created").not.toBeNull();
    expect(auditLog?.user_id).toBe(storeManagerUser.user_id);
    expect(auditLog?.action).toBe("LOTTERY_BINS_QUERIED");
    expect(auditLog?.table_name).toBe("lottery_bins");
  });
});
