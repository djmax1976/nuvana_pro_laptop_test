/**
 * Lottery Pack Activation API Tests
 *
 * Tests for Lottery Pack Activation API endpoint:
 * - PUT /api/lottery/packs/:packId/activate
 * - Authentication and authorization (STORE_MANAGER or ADMIN role)
 * - RLS enforcement (store isolation)
 * - Status validation (only RECEIVED packs can be activated)
 * - Pack activation with status change to ACTIVE
 * - activated_at timestamp recording
 * - Audit logging
 * - Error handling (pack not found, invalid status, RLS violations)
 * - Security: SQL injection, authentication bypass, authorization, input validation, data leakage
 *
 * @test-level API
 * @justification Tests API endpoint with authentication, authorization, database operations, and business logic
 * @story 6.3 - Lottery Pack Activation
 * @priority P0 (Critical - Security, Data Integrity, Business Logic)
 * @enhanced-by workflow-9 on 2025-01-28
 *
 * GREEN PHASE: These tests validate the implemented endpoint.
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createLotteryGame,
  createLotteryPack,
  createLotteryBin,
} from "../support/factories/lottery.factory";
import { createCompany, createStore, createUser } from "../support/helpers";

test.describe("6.3-API: Lottery Pack Activation - Pack Activation", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // HAPPY PATH TESTS (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.3-API-001: [P0] PUT /api/lottery/packs/:packId/activate - should activate pack with RECEIVED status (AC #1)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with a pack in RECEIVED status
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 2.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-001",
      serial_start: "184303159650093783374530",
      serial_end: "184303159650093783374680",
      status: "RECEIVED",
    });

    // WHEN: Activating the pack via API
    const response = await storeManagerApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}/activate`,
    );

    // THEN: Pack is activated successfully
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();

    // Response structure assertions
    expect(body, "Response should be an object").toBeInstanceOf(Object);
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data, "Response should contain pack data").toHaveProperty(
      "pack_id",
    );

    // Data type assertions
    expect(typeof body.data.pack_id, "pack_id should be a string").toBe(
      "string",
    );
    expect(typeof body.data.game_id, "game_id should be a string").toBe(
      "string",
    );
    expect(typeof body.data.pack_number, "pack_number should be a string").toBe(
      "string",
    );
    expect(
      typeof body.data.serial_start,
      "serial_start should be a string",
    ).toBe("string");
    expect(typeof body.data.serial_end, "serial_end should be a string").toBe(
      "string",
    );
    expect(typeof body.data.status, "status should be a string").toBe("string");
    expect(
      typeof body.data.activated_at,
      "activated_at should be a string",
    ).toBe("string");

    // Value assertions
    expect(body.data.pack_id, "pack_id should match").toBe(pack.pack_id);
    expect(body.data.status, "status should be ACTIVE").toBe("ACTIVE");
    expect(
      body.data.activated_at,
      "activated_at should be set",
    ).not.toBeUndefined();
    expect(body.data.activated_at, "activated_at should not be empty").not.toBe(
      "",
    );
    // Verify activated_at is a valid ISO date string (implementation returns toISOString())
    const activatedDate = new Date(body.data.activated_at);
    expect(
      activatedDate.getTime(),
      "activated_at should be a valid date",
    ).not.toBeNaN();
    // Verify it's a recent timestamp (within last 5 seconds)
    const now = new Date();
    const timeDiff = Math.abs(now.getTime() - activatedDate.getTime());
    expect(timeDiff, "activated_at should be a recent timestamp").toBeLessThan(
      5000,
    ); // 5 seconds

    // Relationship assertions
    expect(
      body.data.game,
      "game relationship should be included",
    ).toBeInstanceOf(Object);
    expect(
      body.data.game,
      "game relationship should be included",
    ).toHaveProperty("game_id");
    expect(
      typeof body.data.game.game_id,
      "game.game_id should be a string",
    ).toBe("string");
    expect(typeof body.data.game.name, "game.name should be a string").toBe(
      "string",
    );

    expect(
      body.data.store,
      "store relationship should be included",
    ).toBeInstanceOf(Object);
    expect(
      body.data.store,
      "store relationship should be included",
    ).toHaveProperty("store_id");
    expect(
      typeof body.data.store.store_id,
      "store.store_id should be a string",
    ).toBe("string");
    expect(typeof body.data.store.name, "store.name should be a string").toBe(
      "string",
    );

    // AND: Pack record is updated in database
    const updatedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
    });
    expect(updatedPack, "Pack should exist in database").not.toBeNull();
    expect(updatedPack?.status, "Pack status should be ACTIVE").toBe("ACTIVE");
    expect(
      updatedPack?.activated_at,
      "activated_at should be set",
    ).not.toBeNull();
    // Verify activated_at is a recent timestamp (within last 5 seconds)
    const activatedAt = updatedPack?.activated_at as Date;
    const dbNow = new Date();
    const dbTimeDiff = Math.abs(dbNow.getTime() - activatedAt.getTime());
    expect(
      dbTimeDiff,
      "activated_at should be a recent timestamp",
    ).toBeLessThan(5000); // 5 seconds

    // AND: Audit log entry is created
    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        table_name: "lottery_packs",
        record_id: pack.pack_id,
        action: "PACK_ACTIVATED",
        user_id: storeManagerUser.user_id,
      },
    });
    expect(auditLog, "Audit log should be created").not.toBeNull();
    expect(auditLog?.action, "Audit action should be PACK_ACTIVATED").toBe(
      "PACK_ACTIVATED",
    );
    expect(
      auditLog?.new_values,
      "Audit log should contain new_values",
    ).toHaveProperty("status", "ACTIVE");
    expect(
      auditLog?.new_values,
      "Audit log should contain previous_status",
    ).toHaveProperty("previous_status", "RECEIVED");
  });

  test("6.3-API-002: [P0] PUT /api/lottery/packs/:packId/activate - should activate pack with bin relationship (AC #1)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with a pack in RECEIVED status with bin
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 2.0,
    });
    const bin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      name: "Bin A",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-002",
      serial_start: "184303159650093783374530",
      serial_end: "184303159650093783374680",
      status: "RECEIVED",
      current_bin_id: bin.bin_id,
    });

    // WHEN: Activating the pack
    const response = await storeManagerApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}/activate`,
    );

    // THEN: Pack is activated with bin relationship included
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.data.bin, "bin relationship should be included").toBeInstanceOf(
      Object,
    );
    expect(body.data.bin, "bin relationship should be included").toHaveProperty(
      "bin_id",
    );
    expect(typeof body.data.bin.bin_id, "bin.bin_id should be a string").toBe(
      "string",
    );
    expect(typeof body.data.bin.name, "bin.name should be a string").toBe(
      "string",
    );
    expect(body.data.bin.bin_id, "bin_id should match").toBe(bin.bin_id);
  });

  test("6.3-API-002a: [P0] PUT /api/lottery/packs/:packId/activate - should handle pack without bin (null bin)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with a pack in RECEIVED status without bin
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 2.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-002a",
      serial_start: "184303159650093783374530",
      serial_end: "184303159650093783374680",
      status: "RECEIVED",
      // No current_bin_id - defaults to no bin assigned
    });

    // WHEN: Activating the pack
    const response = await storeManagerApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}/activate`,
    );

    // THEN: Pack is activated successfully with null bin
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    // Implementation returns bin as null when not assigned (line 887: bin: updatedPack.bin || null)
    expect(
      body.data.bin,
      "bin should be null when pack has no bin assigned",
    ).toBeNull();
    // Verify bin is explicitly null, not undefined
    expect(
      body.data.bin === null,
      "bin should be explicitly null, not undefined",
    ).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHENTICATION & AUTHORIZATION TESTS (P0 - Security)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.3-API-003: [P0] SECURITY - should require authentication", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am not authenticated
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: store.store_id,
      pack_number: "PACK-003",
      serial_start: "184303159650093783374530",
      serial_end: "184303159650093783374680",
      status: "RECEIVED",
    });

    // WHEN: Attempting to activate pack without authentication
    const response = await apiRequest.put(
      `/api/lottery/packs/${pack.pack_id}/activate`,
    );

    // THEN: Request is rejected with 401 Unauthorized
    expect(response.status(), "Should return 401 for unauthenticated").toBe(
      401,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error object should be present").toHaveProperty("code");
    expect(body.error.code, "Error code should be UNAUTHORIZED").toBe(
      "UNAUTHORIZED",
    );
  });

  test("6.3-API-003a: [P0] SECURITY - should reject request with missing access token cookie", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am making a request without access_token cookie
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: store.store_id,
      pack_number: "PACK-003a",
      serial_start: "184303159650093783374530",
      serial_end: "184303159650093783374680",
      status: "RECEIVED",
    });

    // WHEN: Attempting to activate pack without access_token cookie
    const response = await apiRequest.put(
      `/api/lottery/packs/${pack.pack_id}/activate`,
      {
        headers: {
          Cookie: "", // Explicitly empty cookie
        },
      },
    );

    // THEN: Request is rejected with 401 Unauthorized
    expect(response.status(), "Should return 401 for missing token").toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be UNAUTHORIZED").toBe(
      "UNAUTHORIZED",
    );
    expect(
      body.error.message,
      "Error message should mention missing token",
    ).toContain("token");
  });

  test("6.3-API-003b: [P0] SECURITY - should reject request with invalid JWT token format", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am making a request with malformed JWT token
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: store.store_id,
      pack_number: "PACK-003b",
      serial_start: "184303159650093783374530",
      serial_end: "184303159650093783374680",
      status: "RECEIVED",
    });

    // WHEN: Attempting to activate pack with invalid token format
    const response = await apiRequest.put(
      `/api/lottery/packs/${pack.pack_id}/activate`,
      {
        headers: {
          Cookie: "access_token=not-a-valid-jwt-token",
        },
      },
    );

    // THEN: Request is rejected with 401 Unauthorized
    expect(
      response.status(),
      "Should return 401 for invalid token format",
    ).toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be UNAUTHORIZED").toBe(
      "UNAUTHORIZED",
    );
  });

  test("6.3-API-004: [P0] SECURITY - should allow STORE_MANAGER role", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-004",
      serial_start: "184303159650093783374530",
      serial_end: "184303159650093783374680",
      status: "RECEIVED",
    });

    // WHEN: Activating pack as Store Manager
    const response = await storeManagerApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}/activate`,
    );

    // THEN: Request succeeds
    expect(response.status(), "Store Manager should be allowed").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
  });

  test("6.3-API-005: [P0] SECURITY - should allow ADMIN role", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as an Admin
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: store.store_id,
      pack_number: "PACK-005",
      serial_start: "184303159650093783374530",
      serial_end: "184303159650093783374680",
      status: "RECEIVED",
    });

    // WHEN: Activating pack as Admin
    const response = await superadminApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}/activate`,
    );

    // THEN: Request succeeds
    expect(response.status(), "Admin should be allowed").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RLS ENFORCEMENT TESTS (P0 - Security)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.3-API-007: [P0] SECURITY - should enforce store isolation (RLS) (AC #3)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with a pack from a different store
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    const otherOwner = await createUser(prismaClient);
    const otherCompany = await createCompany(prismaClient, {
      owner_user_id: otherOwner.user_id,
    });
    const otherStore = await createStore(prismaClient, {
      company_id: otherCompany.company_id,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: otherStore.store_id, // Different store
      pack_number: "PACK-007",
      serial_start: "184303159650093783374530",
      serial_end: "184303159650093783374680",
      status: "RECEIVED",
    });

    // WHEN: Attempting to activate pack from different store
    const response = await storeManagerApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}/activate`,
    );

    // THEN: Request is rejected with 403 Forbidden
    expect(response.status(), "Should return 403 for RLS violation").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be FORBIDDEN").toBe("FORBIDDEN");
    expect(
      body.error.message,
      "Error message should match implementation exactly",
    ).toBe(
      "You can only activate packs for your assigned store. Pack belongs to a different store (RLS violation)",
    );

    // AND: Pack status remains unchanged
    const unchangedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
    });
    expect(unchangedPack?.status, "Pack status should remain RECEIVED").toBe(
      "RECEIVED",
    );
  });

  test("6.3-API-007a: [P0] SECURITY - should allow SYSTEM scope admin to activate packs from any store", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a SYSTEM scope admin with a pack from any store
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: store.store_id,
      pack_number: "PACK-007a",
      serial_start: "184303159650093783374530",
      serial_end: "184303159650093783374680",
      status: "RECEIVED",
    });

    // WHEN: Activating pack as SYSTEM scope admin
    const response = await superadminApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}/activate`,
    );

    // THEN: Request succeeds (SYSTEM scope bypasses RLS)
    expect(response.status(), "SYSTEM scope should bypass RLS").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STATUS VALIDATION TESTS (P0 - Business Logic)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.3-API-008: [P0] VALIDATION - should reject pack with ACTIVE status (AC #2)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with a pack in ACTIVE status
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-008",
      serial_start: "184303159650093783374530",
      serial_end: "184303159650093783374680",
      status: "ACTIVE",
    });

    // WHEN: Attempting to activate an already active pack
    const response = await storeManagerApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}/activate`,
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Should return 400 for invalid status").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be INVALID_PACK_STATUS").toBe(
      "INVALID_PACK_STATUS",
    );
    expect(
      body.error.message,
      "Error message should match implementation format",
    ).toMatch(/Only packs with RECEIVED status can be activated/i);
    expect(
      body.error.message,
      "Error message should mention current ACTIVE status",
    ).toMatch(/Current status is ACTIVE/i);

    // AND: Pack status remains unchanged
    const unchangedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
    });
    expect(unchangedPack?.status, "Pack status should remain ACTIVE").toBe(
      "ACTIVE",
    );
  });

  test("6.3-API-009: [P0] VALIDATION - should reject pack with DEPLETED status (AC #2)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with a pack in DEPLETED status
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-009",
      serial_start: "184303159650093783374530",
      serial_end: "184303159650093783374680",
      status: "DEPLETED",
    });

    // WHEN: Attempting to activate a depleted pack
    const response = await storeManagerApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}/activate`,
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Should return 400 for invalid status").toBe(400);
    const body = await response.json();
    expect(body.error.code, "Error code should be INVALID_PACK_STATUS").toBe(
      "INVALID_PACK_STATUS",
    );
    expect(
      body.error.message,
      "Error message should match implementation format",
    ).toMatch(/Only packs with RECEIVED status can be activated/i);
    expect(
      body.error.message,
      "Error message should mention current DEPLETED status",
    ).toMatch(/Current status is DEPLETED/i);

    // AND: Pack status remains unchanged
    const unchangedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
    });
    expect(unchangedPack?.status, "Pack status should remain DEPLETED").toBe(
      "DEPLETED",
    );
  });

  test("6.3-API-010: [P0] VALIDATION - should reject pack with RETURNED status (AC #2)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with a pack in RETURNED status
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-010",
      serial_start: "184303159650093783374530",
      serial_end: "184303159650093783374680",
      status: "RETURNED",
    });

    // WHEN: Attempting to activate a returned pack
    const response = await storeManagerApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}/activate`,
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Should return 400 for invalid status").toBe(400);
    const body = await response.json();
    expect(body.error.code, "Error code should be INVALID_PACK_STATUS").toBe(
      "INVALID_PACK_STATUS",
    );
    expect(
      body.error.message,
      "Error message should match implementation format",
    ).toMatch(/Only packs with RECEIVED status can be activated/i);
    expect(
      body.error.message,
      "Error message should mention current RETURNED status",
    ).toMatch(/Current status is RETURNED/i);

    // AND: Pack status remains unchanged
    const unchangedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
    });
    expect(unchangedPack?.status, "Pack status should remain RETURNED").toBe(
      "RETURNED",
    );
  });

  test("6.3-API-010a: [P0] CONCURRENCY - should handle concurrent activation requests correctly", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with a pack in RECEIVED status
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-010a",
      serial_start: "184303159650093783374530",
      serial_end: "184303159650093783374680",
      status: "RECEIVED",
    });

    // Verify initial state
    const initialPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
    });
    expect(initialPack?.status, "Pack should start in RECEIVED status").toBe(
      "RECEIVED",
    );

    // WHEN: Making two concurrent activation requests
    // Using Promise.all to ensure both requests start simultaneously
    const [response1, response2] = await Promise.all([
      storeManagerApiRequest.put(`/api/lottery/packs/${pack.pack_id}/activate`),
      storeManagerApiRequest.put(`/api/lottery/packs/${pack.pack_id}/activate`),
    ]);

    // THEN: One request succeeds, the other fails with CONCURRENT_MODIFICATION
    // The implementation uses atomic updateMany with status condition, so when
    // two requests concurrently try to activate the same RECEIVED pack:
    // - First request: updateMany succeeds (count=1), returns 200
    // - Second request: updateMany fails (count=0), detects initialPackStatus was RECEIVED,
    //   returns 409 CONCURRENT_MODIFICATION (not 400, since pack was valid but changed concurrently)
    const responses = [response1, response2];
    const statuses = responses.map((r) => r.status());

    // Verify exactly one success and one failure
    const successCount = statuses.filter((s) => s === 200).length;
    const conflictCount = statuses.filter((s) => s === 409).length;
    const errorCount = statuses.filter((s) => s === 400).length;

    expect(
      successCount,
      `Exactly one request should succeed (200). Got: ${statuses.join(", ")}`,
    ).toBe(1);
    expect(
      conflictCount,
      `Exactly one request should fail with 409 (concurrent modification). Got: ${statuses.join(", ")}`,
    ).toBe(1);
    expect(
      errorCount,
      `No requests should fail with 400 (invalid status). Got: ${statuses.join(", ")}`,
    ).toBe(0);

    // Validate successful response
    const successfulResponse = responses.find((r) => r.status() === 200);
    expect(
      successfulResponse,
      "Should have a successful response with status 200",
    ).not.toBeUndefined();
    const successBody = await successfulResponse!.json();
    expect(
      successBody.success,
      "Successful response should indicate success",
    ).toBe(true);
    expect(successBody.data.status, "Pack status should be ACTIVE").toBe(
      "ACTIVE",
    );
    expect(
      successBody.data.activated_at,
      "Successful response should include activated_at timestamp",
    ).toBeDefined();
    expect(
      typeof successBody.data.activated_at,
      "activated_at should be a string",
    ).toBe("string");
    // Verify activated_at is a valid ISO date string (implementation returns toISOString())
    const activatedDate = new Date(successBody.data.activated_at);
    expect(
      activatedDate.getTime(),
      "activated_at should be a valid date",
    ).not.toBeNaN();
    // Verify it's a recent timestamp (within last 5 seconds)
    const now = new Date();
    const timeDiff = Math.abs(now.getTime() - activatedDate.getTime());
    expect(timeDiff, "activated_at should be a recent timestamp").toBeLessThan(
      5000,
    ); // 5 seconds

    // Validate failed response (concurrent modification)
    const failedResponse = responses.find((r) => r.status() === 409);
    expect(
      failedResponse,
      "Should have a failed response with status 409",
    ).not.toBeUndefined();
    const failedBody = await failedResponse!.json();
    expect(failedBody.success, "Failed response should indicate failure").toBe(
      false,
    );
    expect(
      failedBody.error.code,
      "Error code should be CONCURRENT_MODIFICATION for race condition",
    ).toBe("CONCURRENT_MODIFICATION");
    expect(
      failedBody.error.message,
      "Error message should match implementation format",
    ).toMatch(/Pack status was changed concurrently/i);
    expect(
      failedBody.error.message,
      "Error message should mention pack was RECEIVED",
    ).toMatch(/Pack was RECEIVED but is now ACTIVE/i);
    expect(
      failedBody.error.message,
      "Error message should mention retry instruction",
    ).toMatch(/Please retry the operation/i);

    // AND: Pack is ACTIVE (only activated once, not twice)
    const updatedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
    });
    expect(updatedPack?.status, "Pack status should be ACTIVE").toBe("ACTIVE");
    expect(
      updatedPack?.activated_at,
      "Pack should have activated_at timestamp set",
    ).not.toBeNull();
    // Verify only one activation occurred by checking activated_at matches successful response
    const packActivatedAt = updatedPack!.activated_at!.toISOString();
    expect(
      packActivatedAt,
      "Pack activated_at should match successful response",
    ).toBe(successBody.data.activated_at);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INPUT VALIDATION & EDGE CASES (P0 - Security)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.3-API-011: [P0] ERROR - should return 404 for non-existent pack", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with a valid but non-existent UUID
    const nonExistentPackId = "123e4567-e89b-12d3-a456-426614174000";

    // WHEN: Attempting to activate a non-existent pack
    const response = await storeManagerApiRequest.put(
      `/api/lottery/packs/${nonExistentPackId}/activate`,
    );

    // THEN: Request is rejected with 404 Not Found
    expect(response.status(), "Should return 404 for non-existent pack").toBe(
      404,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be PACK_NOT_FOUND").toBe(
      "PACK_NOT_FOUND",
    );
    expect(
      body.error.message,
      "Error message should match implementation",
    ).toBe("Lottery pack not found");
  });

  test("6.3-API-012: [P0] VALIDATION - should reject invalid UUID format", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    const invalidPackId = "invalid-uuid";

    // WHEN: Attempting to activate pack with invalid UUID
    const response = await storeManagerApiRequest.put(
      `/api/lottery/packs/${invalidPackId}/activate`,
    );

    // THEN: Request is rejected with 400 Bad Request (Fastify schema validation)
    expect(response.status(), "Should return 400 for invalid UUID").toBe(400);
  });

  test("6.3-API-012a: [P0] SECURITY - should reject empty string packId", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    const emptyPackId = "";

    // WHEN: Attempting to activate pack with empty string
    const response = await storeManagerApiRequest.put(
      `/api/lottery/packs/${emptyPackId}/activate`,
    );

    // THEN: Request is rejected (route may not match or validation fails)
    expect([400, 404], "Should return 400 or 404 for empty packId").toContain(
      response.status(),
    );
  });

  test("6.3-API-012b: [P0] SECURITY - should reject malformed UUID (missing characters)", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    const malformedPackId = "123e4567-e89b-12d3-a456-42661417400"; // Missing last character

    // WHEN: Attempting to activate pack with malformed UUID
    const response = await storeManagerApiRequest.put(
      `/api/lottery/packs/${malformedPackId}/activate`,
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Should return 400 for malformed UUID").toBe(400);
  });

  test("6.3-API-012c: [P0] SECURITY - should reject SQL injection attempt in packId", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // Note: Prisma parameterizes queries, but we test that malicious input is rejected
    const sqlInjectionPackId = "'; DROP TABLE lottery_packs; --";

    // WHEN: Attempting to activate pack with SQL injection attempt
    const response = await storeManagerApiRequest.put(
      `/api/lottery/packs/${encodeURIComponent(sqlInjectionPackId)}/activate`,
    );

    // THEN: Request is rejected (should be caught by UUID validation)
    expect(
      [400, 404],
      "Should return 400 or 404 for SQL injection attempt",
    ).toContain(response.status());
  });

  test("6.3-API-012d: [P0] SECURITY - should reject XSS attempt in packId", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    const xssPackId = "<script>alert('xss')</script>";

    // WHEN: Attempting to activate pack with XSS attempt
    const response = await storeManagerApiRequest.put(
      `/api/lottery/packs/${encodeURIComponent(xssPackId)}/activate`,
    );

    // THEN: Request is rejected (should be caught by UUID validation)
    expect([400, 404], "Should return 400 or 404 for XSS attempt").toContain(
      response.status(),
    );
  });

  test("6.3-API-012e: [P0] SECURITY - should reject very long string in packId", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    const longPackId = "a".repeat(1000);

    // WHEN: Attempting to activate pack with very long string
    const response = await storeManagerApiRequest.put(
      `/api/lottery/packs/${longPackId}/activate`,
    );

    // THEN: Request is rejected (should be caught by UUID validation)
    expect(
      [400, 404],
      "Should return 400 or 404 for very long string",
    ).toContain(response.status());
  });

  test("6.3-API-012f: [P0] SECURITY - should reject nil UUID (all zeros)", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    const nilPackId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Attempting to activate pack with nil UUID
    const response = await storeManagerApiRequest.put(
      `/api/lottery/packs/${nilPackId}/activate`,
    );

    // THEN: Request is rejected with 404 Not Found (pack doesn't exist)
    expect(response.status(), "Should return 404 for nil UUID").toBe(404);
    const body = await response.json();
    expect(body.error.code, "Error code should be PACK_NOT_FOUND").toBe(
      "PACK_NOT_FOUND",
    );
    expect(
      body.error.message,
      "Error message should match implementation",
    ).toBe("Lottery pack not found");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA LEAKAGE PREVENTION TESTS (P0 - Security)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.3-API-013: [P0] SECURITY - should not expose sensitive data in response", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with a pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 2.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-013",
      serial_start: "184303159650093783374530",
      serial_end: "184303159650093783374680",
      status: "RECEIVED",
    });

    // WHEN: Activating the pack
    const response = await storeManagerApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}/activate`,
    );

    // THEN: Response should not contain sensitive fields
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();

    // Verify response structure is correct (no unexpected fields)
    const allowedFields = [
      "pack_id",
      "game_id",
      "pack_number",
      "serial_start",
      "serial_end",
      "status",
      "activated_at",
      "game",
      "store",
      "bin",
    ];
    const allowedUnderscoreFields: string[] = [];
    const responseFields = Object.keys(body.data);

    // All fields in response should be in allowed list or explicitly whitelisted underscore fields
    responseFields.forEach((field) => {
      expect(
        allowedFields.includes(field) ||
          allowedUnderscoreFields.includes(field),
        `Field ${field} should be in allowed list or explicitly whitelisted in allowedUnderscoreFields`,
      ).toBe(true);
    });

    // Verify all required fields are present
    expect(
      body.data,
      "Response should contain all required fields",
    ).toHaveProperty("pack_id");
    expect(body.data, "Response should contain game_id").toHaveProperty(
      "game_id",
    );
    expect(body.data, "Response should contain pack_number").toHaveProperty(
      "pack_number",
    );
    expect(body.data, "Response should contain serial_start").toHaveProperty(
      "serial_start",
    );
    expect(body.data, "Response should contain serial_end").toHaveProperty(
      "serial_end",
    );
    expect(body.data, "Response should contain status").toHaveProperty(
      "status",
    );
    expect(body.data, "Response should contain activated_at").toHaveProperty(
      "activated_at",
    );
    expect(body.data, "Response should contain game").toHaveProperty("game");
    expect(body.data, "Response should contain store").toHaveProperty("store");

    // Verify no password-like fields are exposed
    expect(
      body.data,
      "Response should not contain password field",
    ).not.toHaveProperty("password");
    expect(
      body.data,
      "Response should not contain token field",
    ).not.toHaveProperty("token");
    expect(
      body.data,
      "Response should not contain secret field",
    ).not.toHaveProperty("secret");

    // Verify relationships don't expose sensitive data
    if (body.data.game) {
      expect(
        body.data.game,
        "Game should not contain sensitive fields",
      ).not.toHaveProperty("password");
    }
    if (body.data.store) {
      expect(
        body.data.store,
        "Store should not contain sensitive fields",
      ).not.toHaveProperty("password");
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT LOGGING TESTS (P0 - Compliance)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.3-API-014: [P0] AUDIT - should create audit log entry with correct metadata (AC #1)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with a pack in RECEIVED status
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-014",
      serial_start: "184303159650093783374530",
      serial_end: "184303159650093783374680",
      status: "RECEIVED",
    });

    // WHEN: Activating the pack
    const response = await storeManagerApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}/activate`,
    );

    // THEN: Request succeeds
    expect(response.status(), "Expected 200 OK status").toBe(200);

    // AND: Audit log entry is created with correct metadata
    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        table_name: "lottery_packs",
        record_id: pack.pack_id,
        action: "PACK_ACTIVATED",
        user_id: storeManagerUser.user_id,
      },
    });
    expect(auditLog, "Audit log should be created").not.toBeNull();
    expect(auditLog?.user_id, "user_id should match").toBe(
      storeManagerUser.user_id,
    );
    expect(auditLog?.action, "action should be PACK_ACTIVATED").toBe(
      "PACK_ACTIVATED",
    );
    expect(auditLog?.table_name, "table_name should be lottery_packs").toBe(
      "lottery_packs",
    );
    expect(auditLog?.record_id, "record_id should match pack_id").toBe(
      pack.pack_id,
    );
    expect(
      auditLog?.new_values,
      "new_values should contain status",
    ).toHaveProperty("status", "ACTIVE");
    expect(
      auditLog?.new_values,
      "new_values should contain previous_status",
    ).toHaveProperty("previous_status", "RECEIVED");
    expect(
      auditLog?.new_values,
      "new_values should contain activated_at",
    ).toHaveProperty("activated_at");
    // Verify new_values contains all expected fields from implementation (line 849-856)
    expect(
      auditLog?.new_values,
      "new_values should contain pack_id",
    ).toHaveProperty("pack_id");
    expect(
      auditLog?.new_values,
      "new_values should contain game_id",
    ).toHaveProperty("game_id");
    expect(
      auditLog?.new_values,
      "new_values should contain store_id",
    ).toHaveProperty("store_id");
    expect(
      auditLog?.new_values,
      "new_values should contain pack_number",
    ).toHaveProperty("pack_number");
    // Verify activated_at is a valid ISO string
    const activatedAtValue = (auditLog?.new_values as any)?.activated_at;
    expect(
      typeof activatedAtValue,
      "activated_at in audit log should be a string",
    ).toBe("string");
    const activatedAtDate = new Date(activatedAtValue);
    expect(
      activatedAtDate.getTime(),
      "activated_at should be a valid ISO date string",
    ).not.toBeNaN();
    // Verify reason format matches implementation (line 860)
    expect(auditLog?.reason, "reason should contain user email").toContain(
      storeManagerUser.email,
    );
    expect(auditLog?.reason, "reason should contain pack number").toContain(
      pack.pack_number,
    );
    expect(
      auditLog?.reason,
      "reason should contain action description",
    ).toMatch(/Lottery pack activated by/i);

    // Verify audit log data types
    expect(typeof auditLog?.user_id, "user_id should be a string").toBe(
      "string",
    );
    expect(typeof auditLog?.action, "action should be a string").toBe("string");
    expect(typeof auditLog?.table_name, "table_name should be a string").toBe(
      "string",
    );
    expect(typeof auditLog?.record_id, "record_id should be a string").toBe(
      "string",
    );
    expect(auditLog?.timestamp, "timestamp should be a Date").toBeInstanceOf(
      Date,
    );
  });
});
