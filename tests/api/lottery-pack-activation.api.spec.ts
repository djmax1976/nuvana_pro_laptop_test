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
import { createJWTAccessToken } from "../support/factories";
import { createCompany, createStore, createUser } from "../support/helpers";
import { withBypassClient } from "../support/prisma-bypass";

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
    // Verify activated_at is a valid ISO date string
    const activatedDate = new Date(body.data.activated_at);
    expect(
      activatedDate.getTime(),
      "activated_at should be a valid date",
    ).not.toBeNaN();

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
    const now = new Date();
    const timeDiff = Math.abs(now.getTime() - activatedAt.getTime());
    expect(timeDiff, "activated_at should be a recent timestamp").toBeLessThan(
      5000,
    ); // 5 seconds

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
    expect(
      body.data.bin,
      "bin should be null when pack has no bin assigned",
    ).toBeNull();
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

  test("6.3-API-006: [P0] SECURITY - should reject unauthorized roles", async ({
    regularUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a regular user (not STORE_MANAGER or ADMIN)
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
      pack_number: "PACK-006",
      serial_start: "184303159650093783374530",
      serial_end: "184303159650093783374680",
      status: "RECEIVED",
    });

    // WHEN: Attempting to activate pack without required role
    const response = await regularUserApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}/activate`,
    );

    // THEN: Request is rejected with 403 Forbidden
    expect(response.status(), "Should return 403 for unauthorized role").toBe(
      403,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be PERMISSION_DENIED").toBe(
      "PERMISSION_DENIED",
    );
  });

  test("6.3-API-006a: [P0] SECURITY - should reject user without LOTTERY_PACK_ACTIVATE permission", async ({
    request,
    backendUrl,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated with a role that doesn't have LOTTERY_PACK_ACTIVATE permission
    // Use CORPORATE_ADMIN which has company-level permissions but not lottery permissions
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
    const user = await createUser(prismaClient);

    // Assign CORPORATE_ADMIN role to user (without LOTTERY_PACK_ACTIVATE permission)
    const role = await prismaClient.role.findUnique({
      where: { code: "CORPORATE_ADMIN" },
    });
    if (!role) {
      throw new Error(
        "CORPORATE_ADMIN role not found in database. Run database seed first.",
      );
    }

    await withBypassClient(async (bypassClient) => {
      await bypassClient.userRole.create({
        data: {
          user_id: user.user_id,
          role_id: role.role_id,
          company_id: company.company_id,
          // CORPORATE_ADMIN has COMPANY scope, so store_id is null
          store_id: null,
        },
      });
    });

    // Create JWT token with CORPORATE_ADMIN role (without LOTTERY_PACK_ACTIVATE permission)
    const token = createJWTAccessToken({
      user_id: user.user_id,
      email: user.email,
      roles: ["CORPORATE_ADMIN"],
      permissions: [
        "USER_READ",
        "STORE_CREATE",
        "STORE_READ",
        "STORE_UPDATE",
        "STORE_DELETE",
        // Note: LOTTERY_PACK_ACTIVATE is intentionally omitted
      ],
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: store.store_id,
      pack_number: "PACK-006a",
      serial_start: "184303159650093783374530",
      serial_end: "184303159650093783374680",
      status: "RECEIVED",
    });

    // WHEN: Attempting to activate pack without required permission
    const response = await request.put(
      `${backendUrl}/api/lottery/packs/${pack.pack_id}/activate`,
      {
        headers: {
          Cookie: `access_token=${token}`,
        },
      },
    );

    // THEN: Request is rejected with 403 Forbidden
    expect(
      response.status(),
      "Should return 403 for user without LOTTERY_PACK_ACTIVATE permission",
    ).toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be PERMISSION_DENIED").toBe(
      "PERMISSION_DENIED",
    );
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
      "Error message should mention store access or RLS violation",
    ).toMatch(/store|RLS violation/i);

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
      "Error message should mention RECEIVED status requirement",
    ).toMatch(/RECEIVED/i);
    expect(
      body.error.message,
      "Error message should mention current ACTIVE status",
    ).toMatch(/ACTIVE/i);

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
      "Error message should mention DEPLETED status",
    ).toMatch(/DEPLETED/i);

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
      "Error message should mention RETURNED status",
    ).toMatch(/RETURNED/i);

    // AND: Pack status remains unchanged
    const unchangedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
    });
    expect(unchangedPack?.status, "Pack status should remain RETURNED").toBe(
      "RETURNED",
    );
  });

  test("6.3-API-010a: [P0] CONCURRENCY - should reject activating already-active pack", async ({
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

    // WHEN: Making two concurrent activation requests
    const [response1, response2] = await Promise.all([
      storeManagerApiRequest.put(`/api/lottery/packs/${pack.pack_id}/activate`),
      storeManagerApiRequest.put(`/api/lottery/packs/${pack.pack_id}/activate`),
    ]);

    // THEN: One request succeeds, the other fails with INVALID_PACK_STATUS
    const responses = [response1, response2];
    const statuses = responses.map((r) => r.status());
    expect(
      statuses.filter((s) => s === 200).length,
      "Exactly one request should succeed",
    ).toBe(1);
    expect(
      statuses.filter((s) => s === 400).length,
      "Exactly one request should fail with 400",
    ).toBe(1);

    // Validate successful response
    const successfulResponse = responses.find((r) => r.status() === 200);
    const successBody = await successfulResponse!.json();
    expect(
      successBody.success,
      "Successful response should indicate success",
    ).toBe(true);
    expect(successBody.data.status, "Pack status should be ACTIVE").toBe(
      "ACTIVE",
    );

    // Validate failed response
    const failedResponse = responses.find((r) => r.status() === 400);
    const failedBody = await failedResponse!.json();
    expect(failedBody.success, "Failed response should indicate failure").toBe(
      false,
    );
    expect(
      failedBody.error.code,
      "Error code should be INVALID_PACK_STATUS",
    ).toBe("INVALID_PACK_STATUS");

    // AND: Pack is ACTIVE (only activated once)
    const updatedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
    });
    expect(updatedPack?.status, "Pack status should be ACTIVE").toBe("ACTIVE");
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
    expect(auditLog?.reason, "reason should contain user email").toContain(
      storeManagerUser.email,
    );

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
