/**
 * Lottery Pack Reception API Tests
 *
 * Tests for Lottery Pack Reception API endpoint:
 * - POST /api/lottery/packs/receive
 * - Authentication and authorization (STORE_MANAGER or ADMIN role)
 * - RLS enforcement (store isolation)
 * - Input validation (game_id, pack_number, serial_end, bin_id)
 * - Pack creation with status RECEIVED
 * - Bin assignment (optional)
 * - Audit logging
 * - Error handling (duplicate pack_number, invalid game_id, invalid bin_id)
 *
 * IMPORTANT IMPLEMENTATION NOTES:
 * - serial_start is ALWAYS forced to "000...0" (zeros) padded to match serial_end length
 * - serial_start provided in request is ignored
 * - serial_end validation: must be numeric, > 0
 * - pack_number: 1-50 characters, trimmed
 *
 * @test-level API
 * @justification Tests API endpoint with authentication, authorization, database operations, and business logic
 * @story 6.2 - Lottery Pack Reception
 * @priority P0 (Critical - Security, Data Integrity, Business Logic)
 * @enhanced-by workflow-9 on 2025-01-28
 * @updated 2025-12-16 - Aligned with implementation that forces serial_start to zeros
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createLotteryGame,
  createLotteryPack,
  createLotteryBin,
} from "../support/factories/lottery.factory";
import { createCompany, createStore, createUser } from "../support/helpers";
import { withBypassClient } from "../support/prisma-bypass";

test.describe("6.2-API: Lottery Pack Reception - Pack Creation", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // HAPPY PATH TESTS (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.2-API-001: [P0] POST /api/lottery/packs/receive - should create pack with valid data (AC #1)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with a store
    // (storeManagerUser fixture provides user with store)

    // Create a lottery game
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 2.0,
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "PACK-001",
      serial_end: "184303159650093783374680",
    };

    // Expected serial_start: implementation forces to zeros padded to match serial_end length
    const expectedSerialStart = "0".padStart(packData.serial_end.length, "0");

    // WHEN: Receiving a lottery pack via API
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Pack is created successfully
    expect(response.status(), "Expected 201 Created status").toBe(201);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data, "Response should contain pack data").toHaveProperty(
      "pack_id",
    );
    expect(body.data.game_id, "game_id should match").toBe(game.game_id);
    expect(body.data.pack_number, "pack_number should match").toBe(
      packData.pack_number,
    );
    // IMPORTANT: serial_start is always forced to zeros by the implementation
    expect(
      body.data.serial_start,
      "serial_start should be zeros (forced by implementation)",
    ).toBe(expectedSerialStart);
    expect(body.data.serial_end, "serial_end should match").toBe(
      packData.serial_end,
    );
    expect(body.data.status, "status should be RECEIVED").toBe("RECEIVED");
    expect(
      body.data.received_at,
      "received_at should be set",
    ).not.toBeUndefined();

    // AND: Pack record exists in database
    const pack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: body.data.pack_id },
      include: { game: true, store: true },
    });
    expect(pack, "Pack should exist in database").not.toBeNull();
    expect(pack?.status, "Pack status should be RECEIVED").toBe("RECEIVED");
    expect(pack?.store_id, "Pack should belong to store manager's store").toBe(
      storeManagerUser.store_id,
    );

    // AND: Audit log entry is created
    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        table_name: "lottery_packs",
        record_id: body.data.pack_id,
        action: "PACK_RECEIVED",
        user_id: storeManagerUser.user_id,
      },
    });
    expect(auditLog, "Audit log should be created").not.toBeNull();
    expect(auditLog?.action, "Audit action should be PACK_RECEIVED").toBe(
      "PACK_RECEIVED",
    );
  });

  test("6.2-API-002: [P0] POST /api/lottery/packs/receive - should create pack with bin assignment (AC #1)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with a store and bin
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 2.0,
    });
    const bin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      name: "Bin A",
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "PACK-002",
      serial_end: "184303159650093783374680",
      bin_id: bin.bin_id,
    };

    // WHEN: Receiving a pack with bin assignment
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Pack is created with bin assignment
    expect(response.status(), "Expected 201 Created status").toBe(201);
    const body = await response.json();
    expect(body.data.current_bin_id, "current_bin_id should be set").toBe(
      bin.bin_id,
    );
    expect(body.data.bin, "bin relationship should be included").toHaveProperty(
      "bin_id",
    );
    expect(body.data.bin.bin_id, "bin_id should match").toBe(bin.bin_id);

    // AND: Pack record has bin_id in database
    const pack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: body.data.pack_id },
    });
    expect(pack?.current_bin_id, "Pack should have bin_id").toBe(bin.bin_id);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHENTICATION TESTS (P0 - Security)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.2-API-003: [P0] SECURITY - should reject unauthenticated requests", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am NOT authenticated (no token)
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "PACK-003",
      serial_end: "184303159650093783374680",
    };

    // WHEN: Attempting to receive pack without authentication
    const response = await apiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Request is rejected with 401 Unauthorized
    expect(response.status(), "Should return 401 for missing token").toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be UNAUTHORIZED").toBe(
      "UNAUTHORIZED",
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHORIZATION TESTS (P0 - Security)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.2-API-004: [P0] SECURITY - should allow STORE_MANAGER role", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "PACK-004",
      serial_end: "184303159650093783374680",
    };

    // WHEN: Receiving pack as Store Manager
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Request succeeds
    expect(response.status(), "Store Manager should be allowed").toBe(201);
  });

  test("6.2-API-005: [P0] SECURITY - should allow ADMIN role", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as an Admin
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });

    // Create a store for the admin (admin can access any store)
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "PACK-005",
      serial_end: "184303159650093783374680",
      store_id: store.store_id, // Admin can specify store_id
    };

    // WHEN: Receiving pack as Admin
    const response = await superadminApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Request succeeds
    expect(response.status(), "Admin should be allowed").toBe(201);
  });

  test("6.2-API-006: [P0] SECURITY - should reject unauthorized roles", async ({
    regularUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a regular user (not STORE_MANAGER or ADMIN)
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "PACK-006",
      serial_end: "184303159650093783374680",
    };

    // WHEN: Attempting to receive pack without required role
    const response = await regularUserApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
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

  // ═══════════════════════════════════════════════════════════════════════════
  // RLS ENFORCEMENT TESTS (P0 - Security)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.2-API-007: [P0] SECURITY - should enforce store isolation (RLS)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager for Store A
    // AND: Another store (Store B) exists
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const otherStore = await createStore(prismaClient, {
      company_id: company.company_id,
      name: "Other Store",
    });

    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "PACK-007",
      serial_end: "184303159650093783374680",
      store_id: otherStore.store_id, // Attempting to create pack for other store
    };

    // WHEN: Attempting to receive pack for a different store
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Request is rejected with 403 Forbidden (RLS violation)
    expect(response.status(), "Should return 403 for RLS violation").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    // Permission middleware checks scope first and returns PERMISSION_DENIED
    // if user doesn't have permission for the requested store scope
    expect(body.error.code, "Error code should indicate RLS violation").toBe(
      "PERMISSION_DENIED",
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDATION TESTS (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.2-API-008: [P0] should reject missing game_id", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: Pack data without game_id
    const packData = {
      pack_number: "PACK-008",
      serial_end: "184303159650093783374680",
    };

    // WHEN: Attempting to receive pack without game_id
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Should return 400 for missing game_id").toBe(
      400,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should indicate validation error").toBe(
      "VALIDATION_ERROR",
    );
  });

  test("6.2-API-009: [P0] should reject invalid game_id (not found)", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: Pack data with non-existent game_id
    const packData = {
      game_id: "550e8400-e29b-41d4-a716-446655440000", // Non-existent UUID
      pack_number: "PACK-009",
      serial_end: "184303159650093783374680",
    };

    // WHEN: Attempting to receive pack with invalid game_id
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Request is rejected with 404 Not Found
    expect(response.status(), "Should return 404 for invalid game_id").toBe(
      404,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be GAME_NOT_FOUND").toBe(
      "GAME_NOT_FOUND",
    );
  });

  test("6.2-API-010: [P0] should reject duplicate pack_number (same store)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A pack with pack_number "PACK-010" already exists for this store
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-010",
      serial_start: "000000",
      serial_end: "184303",
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "PACK-010", // Duplicate
      serial_end: "184303159650093783374850",
    };

    // WHEN: Attempting to receive pack with duplicate pack_number
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Request is rejected with 409 Conflict
    expect(
      response.status(),
      "Should return 409 for duplicate pack_number",
    ).toBe(409);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be DUPLICATE_PACK_NUMBER").toBe(
      "DUPLICATE_PACK_NUMBER",
    );
  });

  test("6.2-API-011: [P0] should reject serial_end of zero (must be > 0)", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Pack data with serial_end of 0
    // NOTE: serial_start is always forced to zeros by the implementation
    // so we test that serial_end must be greater than zero
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "PACK-011",
      serial_end: "0", // Zero is invalid - must be > 0
    };

    // WHEN: Attempting to receive pack with serial_end of 0
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Should return 400 for serial_end of 0").toBe(
      400,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should indicate validation error").toBe(
      "VALIDATION_ERROR",
    );
    expect(
      body.error.message,
      "Error message should mention serial_end must be greater than zero",
    ).toContain("serial_end must be greater than zero");
  });

  test("6.2-API-012: [P0] should reject invalid bin_id (not found)", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Pack data with non-existent bin_id
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "PACK-012",
      serial_end: "184303159650093783374680",
      bin_id: "550e8400-e29b-41d4-a716-446655440000", // Non-existent UUID
    };

    // WHEN: Attempting to receive pack with invalid bin_id
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Request is rejected with 404 Not Found
    expect(response.status(), "Should return 404 for invalid bin_id").toBe(404);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be BIN_NOT_FOUND").toBe(
      "BIN_NOT_FOUND",
    );
  });

  test("6.2-API-013: [P0] should reject bin_id from different store (RLS)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A bin exists in a different store
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const otherStore = await createStore(prismaClient, {
      company_id: company.company_id,
    });
    const otherBin = await createLotteryBin(prismaClient, {
      store_id: otherStore.store_id,
    });

    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "PACK-013",
      serial_end: "184303159650093783374680",
      bin_id: otherBin.bin_id, // Bin from different store
    };

    // WHEN: Attempting to receive pack with bin from different store
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Request is rejected with 403 Forbidden (RLS violation)
    expect(
      response.status(),
      "Should return 403 for bin from different store",
    ).toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should indicate RLS violation").toBe(
      "FORBIDDEN",
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT LOGGING TESTS (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.2-API-014: [P0] should create audit log entry with correct metadata", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "PACK-014",
      serial_end: "184303159650093783374680",
    };

    // WHEN: Receiving a pack
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Pack is created
    expect(response.status()).toBe(201);
    const body = await response.json();

    // AND: Audit log entry contains correct metadata
    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        table_name: "lottery_packs",
        record_id: body.data.pack_id,
        action: "PACK_RECEIVED",
        user_id: storeManagerUser.user_id,
      },
    });

    expect(auditLog, "Audit log should exist").not.toBeNull();
    expect(auditLog?.table_name, "table_name should be lottery_packs").toBe(
      "lottery_packs",
    );
    expect(auditLog?.action, "action should be PACK_RECEIVED").toBe(
      "PACK_RECEIVED",
    );
    expect(auditLog?.user_id, "user_id should match").toBe(
      storeManagerUser.user_id,
    );

    // AND: Metadata contains pack details
    if (auditLog?.new_values) {
      const metadata = auditLog.new_values as Record<string, unknown>;
      expect(metadata.game_id, "Metadata should contain game_id").toBe(
        game.game_id,
      );
      expect(metadata.pack_number, "Metadata should contain pack_number").toBe(
        packData.pack_number,
      );
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - SQL INJECTION PREVENTION (P0 - Security)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.2-API-015: [P0] SECURITY - should prevent SQL injection in game_id", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Malicious SQL injection attempt in game_id
    const packData = {
      game_id: "'; DROP TABLE lottery_packs; --",
      pack_number: "PACK-015",
      serial_start: "184303159650093783374530",
      serial_end: "184303159650093783374680",
    };

    // WHEN: Attempting to receive pack with SQL injection in game_id
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Request is rejected (should fail UUID validation or return 404)
    const status = response.status();
    expect(
      status === 400 || status === 404,
      `Should reject SQL injection attempt, got ${status}`,
    ).toBe(true);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("6.2-API-016: [P0] SECURITY - should prevent SQL injection in pack_number", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Malicious SQL injection attempt in pack_number
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "'; DROP TABLE lottery_packs; --",
      serial_end: "184303159650093783374680",
    };

    // WHEN: Attempting to receive pack with SQL injection in pack_number
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Request is rejected or pack_number is sanitized (Prisma should handle safely)
    // If validation passes, pack should be created but SQL should not execute
    // This test verifies Prisma ORM protection
    if (response.status() === 201) {
      const body = await response.json();
      // Verify pack_number is stored as-is (Prisma escapes it)
      expect(body.data.pack_number, "Pack number should be stored safely").toBe(
        packData.pack_number,
      );
    } else {
      // If validation rejects it, that's also acceptable
      expect(response.status(), "Should reject or sanitize SQL injection").toBe(
        400,
      );
    }
  });

  test("6.2-API-017: [P0] SECURITY - should prevent SQL injection in serial_end", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Malicious SQL injection attempt in serial_end
    // NOTE: serial_start is ignored (always forced to zeros), so test serial_end
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "PACK-017",
      serial_end: "'; DROP TABLE lottery_packs; --",
    };

    // WHEN: Attempting to receive pack with SQL injection in serial_end
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Request should be rejected (serial format validation)
    // Serial validation should reject non-numeric values
    expect(response.status(), "Should reject invalid serial format").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - AUTHENTICATION BYPASS (P0 - Security)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.2-API-018: [P0] SECURITY - should reject malformed JWT token", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: Malformed JWT token
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "PACK-018",
      serial_end: "184303159650093783374680",
    };

    // WHEN: Attempting to receive pack with malformed token
    const response = await apiRequest.post(
      "/api/lottery/packs/receive",
      packData,
      {
        headers: {
          Cookie: "access_token=malformed.token.here",
        },
      },
    );

    // THEN: Request is rejected with 401 Unauthorized
    expect(response.status(), "Should return 401 for malformed token").toBe(
      401,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be UNAUTHORIZED").toBe(
      "UNAUTHORIZED",
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASE TESTS - INPUT VALIDATION (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.2-API-019: [P0] should reject empty pack_number", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Pack data with empty pack_number
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "", // Empty string
      serial_start: "184303159650093783374530",
      serial_end: "184303159650093783374680",
    };

    // WHEN: Attempting to receive pack with empty pack_number
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Should return 400 for empty pack_number").toBe(
      400,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should indicate validation error").toBe(
      "VALIDATION_ERROR",
    );
  });

  test("6.2-API-020: [P0] should reject pack_number exceeding max length (51 chars)", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Pack data with pack_number exceeding 50 characters
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "A".repeat(51), // 51 characters (exceeds max)
      serial_end: "184303159650093783374680",
    };

    // WHEN: Attempting to receive pack with pack_number exceeding max length
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(
      response.status(),
      "Should return 400 for pack_number exceeding max length",
    ).toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should indicate validation error").toBe(
      "VALIDATION_ERROR",
    );
  });

  test("6.2-API-021: [P0] should accept pack_number at max length (50 chars)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Pack data with pack_number at exactly 50 characters
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "A".repeat(50), // Exactly 50 characters
      serial_end: "184303159650093783374680",
    };

    // WHEN: Receiving pack with pack_number at max length
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Pack is created successfully
    expect(response.status(), "Should accept pack_number at max length").toBe(
      201,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.pack_number, "pack_number should match").toBe(
      packData.pack_number,
    );
  });

  test("6.2-API-022: [P0] serial_start is ignored - tests serial_end empty rejection", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // NOTE: serial_start is always forced to zeros by the implementation
    // This test validates that empty serial_end is rejected
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "PACK-022",
      serial_end: "", // Empty string - should fail validation
    };

    // WHEN: Attempting to receive pack with empty serial_end
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Should return 400 for empty serial_end").toBe(
      400,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should indicate validation error").toBe(
      "VALIDATION_ERROR",
    );
  });

  test("6.2-API-023: [P0] should reject empty serial_end", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Pack data with empty serial_end
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "PACK-023",
      serial_end: "", // Empty string
    };

    // WHEN: Attempting to receive pack with empty serial_end
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Should return 400 for empty serial_end").toBe(
      400,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should indicate validation error").toBe(
      "VALIDATION_ERROR",
    );
  });

  test("6.2-API-024: [P0] serial_start forced to zeros - validates serial_end must be positive", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: serial_start is always forced to zeros by the implementation
    // Test that serial_end being 0 (meaning start == end when start is 0) is rejected
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "PACK-024",
      serial_end: "0", // Zero - with serial_start forced to "0", this means start == end
    };

    // WHEN: Attempting to receive pack with serial_end of 0
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Should return 400 for serial_end of 0").toBe(
      400,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should indicate validation error").toBe(
      "VALIDATION_ERROR",
    );
  });

  test("6.2-API-025: [P0] should reject invalid UUID format for game_id", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: Pack data with invalid UUID format for game_id
    const packData = {
      game_id: "not-a-valid-uuid", // Invalid UUID format
      pack_number: "PACK-025",
      serial_end: "184303159650093783374680",
    };

    // WHEN: Attempting to receive pack with invalid UUID format
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Should return 400 for invalid UUID format").toBe(
      400,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should indicate validation error").toBe(
      "VALIDATION_ERROR",
    );
  });

  test("6.2-API-026: [P0] should reject invalid UUID format for bin_id", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Pack data with invalid UUID format for bin_id
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "PACK-026",
      serial_end: "184303159650093783374680",
      bin_id: "not-a-valid-uuid", // Invalid UUID format
    };

    // WHEN: Attempting to receive pack with invalid UUID format for bin_id
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(
      response.status(),
      "Should return 400 for invalid UUID format in bin_id",
    ).toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should indicate validation error").toBe(
      "VALIDATION_ERROR",
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BUSINESS LOGIC TESTS - SERIAL NUMBER FORMAT VALIDATION (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.2-API-027: [P0] should reject non-numeric serial_end", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Pack data with non-numeric serial_end
    // NOTE: serial_start is always forced to zeros by implementation
    // Business Rule: Serial numbers must be numeric-only
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "PACK-027",
      serial_end: "ABC123DEF456", // Non-numeric - should fail validation
    };

    // WHEN: Attempting to receive pack with non-numeric serial_end
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(
      response.status(),
      "Should return 400 for non-numeric serial_end",
    ).toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should indicate validation error").toBe(
      "VALIDATION_ERROR",
    );
  });

  test("6.2-API-028: [P0] should reject serial_end with mixed alphanumeric", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Pack data with mixed alphanumeric serial_end
    // Business Rule: Serial numbers must be numeric-only
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "PACK-028",
      serial_end: "XYZ789GHI012", // Non-numeric
    };

    // WHEN: Attempting to receive pack with non-numeric serial_end
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(
      response.status(),
      "Should return 400 for non-numeric serial_end",
    ).toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should indicate validation error").toBe(
      "VALIDATION_ERROR",
    );
  });

  test("6.2-API-029: [P0] should accept large serial_end values (BigInt support)", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Pack data with large serial_end values
    // NOTE: serial_start is always forced to zeros, so we test that large
    // serial_end values are properly handled with BigInt comparison
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });

    // Test case: Large serial_end value that exceeds JavaScript Number.MAX_SAFE_INTEGER
    // serial_start will be forced to all zeros
    const packData = {
      game_id: game.game_id,
      pack_number: "PACK-029",
      serial_end: "1000000000000000000000000", // Large number (25 digits)
    };

    // WHEN: Receiving pack with large serial_end
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Pack should be created successfully (BigInt comparison handles large numbers)
    expect(response.status(), "Should accept large serial_end values").toBe(
      201,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.serial_end, "serial_end should match").toBe(
      packData.serial_end,
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RESPONSE STRUCTURE ASSERTIONS - Enhanced existing tests
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.2-API-030: [P0] should return correct response structure for success", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Valid pack data
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "PACK-030",
      serial_end: "184303159650093783374680",
    };

    // WHEN: Receiving a pack
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Response has correct structure
    expect(response.status(), "Expected 201 Created status").toBe(201);
    const body = await response.json();

    // Response structure assertions
    expect(body, "Response should have success property").toHaveProperty(
      "success",
    );
    expect(body.success, "success should be true").toBe(true);
    expect(body, "Response should have data property").toHaveProperty("data");

    // Data structure assertions
    expect(body.data, "data should have pack_id").toHaveProperty("pack_id");
    expect(body.data, "data should have game_id").toHaveProperty("game_id");
    expect(body.data, "data should have pack_number").toHaveProperty(
      "pack_number",
    );
    expect(body.data, "data should have serial_start").toHaveProperty(
      "serial_start",
    );
    expect(body.data, "data should have serial_end").toHaveProperty(
      "serial_end",
    );
    expect(body.data, "data should have status").toHaveProperty("status");
    expect(body.data, "data should have received_at").toHaveProperty(
      "received_at",
    );
    expect(body.data, "data should have game").toHaveProperty("game");
    expect(body.data, "data should have store").toHaveProperty("store");

    // Data type assertions
    expect(typeof body.data.pack_id, "pack_id should be string").toBe("string");
    expect(typeof body.data.game_id, "game_id should be string").toBe("string");
    expect(typeof body.data.pack_number, "pack_number should be string").toBe(
      "string",
    );
    expect(typeof body.data.serial_start, "serial_start should be string").toBe(
      "string",
    );
    expect(typeof body.data.serial_end, "serial_end should be string").toBe(
      "string",
    );
    expect(typeof body.data.status, "status should be string").toBe("string");
    expect(typeof body.data.received_at, "received_at should be string").toBe(
      "string",
    );

    // Format assertions
    expect(body.data.pack_id, "pack_id should be valid UUID format").toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(body.data.game_id, "game_id should be valid UUID format").toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(body.data.status, "status should be RECEIVED").toBe("RECEIVED");
    expect(
      body.data.received_at,
      "received_at should be ISO date format",
    ).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

    // Validation rule assertions
    expect(
      body.data.pack_number.length,
      "pack_number length should be <= 50",
    ).toBeLessThanOrEqual(50);
    expect(
      body.data.serial_start.length,
      "serial_start should not be empty",
    ).toBeGreaterThan(0);
    expect(
      body.data.serial_end.length,
      "serial_end should not be empty",
    ).toBeGreaterThan(0);

    // Game relationship assertions
    expect(
      typeof body.data.game === "object" && body.data.game !== null,
      "game should be object",
    ).toBe(true);
    expect(body.data.game, "game should have game_id").toHaveProperty(
      "game_id",
    );
    expect(body.data.game, "game should have name").toHaveProperty("name");

    // Store relationship assertions
    expect(
      typeof body.data.store === "object" && body.data.store !== null,
      "store should be object",
    ).toBe(true);
    expect(body.data.store, "store should have store_id").toHaveProperty(
      "store_id",
    );
    expect(body.data.store, "store should have name").toHaveProperty("name");
  });

  test("6.2-API-031: [P0] should return correct error structure for validation errors", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: Invalid pack data (missing game_id)
    const packData = {
      pack_number: "PACK-031",
      serial_end: "184303159650093783374680",
    };

    // WHEN: Attempting to receive pack with invalid data
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Error response has correct structure
    expect(response.status(), "Should return 400 for validation error").toBe(
      400,
    );
    const body = await response.json();

    // Error structure assertions
    expect(body, "Response should have success property").toHaveProperty(
      "success",
    );
    expect(body.success, "success should be false").toBe(false);
    expect(body, "Response should have error property").toHaveProperty("error");
    expect(body.error, "error should have code property").toHaveProperty(
      "code",
    );
    expect(body.error, "error should have message property").toHaveProperty(
      "message",
    );

    // Error type assertions
    expect(typeof body.success, "success should be boolean").toBe("boolean");
    expect(typeof body.error.code, "error.code should be string").toBe(
      "string",
    );
    expect(typeof body.error.message, "error.message should be string").toBe(
      "string",
    );

    // Error code should indicate validation error
    expect(body.error.code, "Error code should indicate validation error").toBe(
      "VALIDATION_ERROR",
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STRING NORMALIZATION TESTS (P0 - Data Integrity)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.2-API-032: [P0] should trim whitespace from pack_number", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Pack data with whitespace in pack_number
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "  PACK-032  ", // Leading and trailing whitespace
      serial_end: "184303159650093783374680",
    };

    // WHEN: Receiving pack with whitespace in pack_number
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Pack is created with trimmed pack_number
    expect(response.status(), "Should accept pack with whitespace").toBe(201);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.pack_number, "pack_number should be trimmed").toBe(
      "PACK-032",
    );

    // AND: Pack in database has trimmed pack_number
    const pack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: body.data.pack_id },
    });
    expect(pack?.pack_number, "Database should store trimmed pack_number").toBe(
      "PACK-032",
    );
  });

  test("6.2-API-033: [P0] should trim whitespace from serial_end", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Pack data with whitespace in serial_end
    // NOTE: serial_start is always forced to zeros by implementation, so only test serial_end
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "PACK-033",
      serial_end: "  184303159650093783374680  ", // Leading and trailing whitespace
    };

    // Expected serial_start: zeros padded to match trimmed serial_end length
    const expectedSerialStart = "0".padStart(24, "0"); // 24 digits to match serial_end

    // WHEN: Receiving pack with whitespace in serial_end
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Pack is created with trimmed serial_end and zeros serial_start
    expect(response.status(), "Should accept pack with whitespace").toBe(201);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(
      body.data.serial_start,
      "serial_start should be zeros (forced by implementation)",
    ).toBe(expectedSerialStart);
    expect(body.data.serial_end, "serial_end should be trimmed").toBe(
      "184303159650093783374680",
    );
  });

  test("6.2-API-034: [P0] should use user's store when store_id is not provided", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Pack data without store_id (should use user's store)
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "PACK-034",
      serial_end: "184303159650093783374680",
      // store_id is not provided
    };

    // WHEN: Receiving pack without store_id
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Pack is created with user's store
    expect(response.status(), "Should create pack with user's store").toBe(201);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.store.store_id, "store_id should match user's store").toBe(
      storeManagerUser.store_id,
    );

    // AND: Pack in database belongs to user's store
    const pack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: body.data.pack_id },
      include: { store: true },
    });
    expect(pack?.store_id, "Pack should belong to user's store").toBe(
      storeManagerUser.store_id,
    );
  });

  test("6.2-API-035: [P0] serial_start provided is ignored - always forced to zeros", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Pack data with explicit serial_start provided
    // NOTE: serial_start is ALWAYS forced to zeros regardless of what is provided
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "PACK-035",
      serial_start: "184303159650093783374530", // This will be ignored
      serial_end: "184303159650093783374680",
    };

    // Expected serial_start: zeros padded to match serial_end length
    const expectedSerialStart = "0".padStart(packData.serial_end.length, "0");

    // WHEN: Receiving pack with explicit serial_start
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Pack is created with serial_start forced to zeros
    expect(response.status(), "Should create pack successfully").toBe(201);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(
      body.data.serial_start,
      "serial_start should be zeros (provided value ignored)",
    ).toBe(expectedSerialStart);
  });

  test("6.2-API-036: [P0] should reject serial_end exceeding max length (100 chars)", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Pack data with serial_end exceeding 100 characters
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "PACK-036",
      serial_end: "1".repeat(101), // 101 characters (exceeds max)
    };

    // WHEN: Attempting to receive pack with serial_end exceeding max length
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(
      response.status(),
      "Should return 400 for serial_end exceeding max length",
    ).toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should indicate validation error").toBe(
      "VALIDATION_ERROR",
    );
  });

  test("6.2-API-037: [P0] should accept serial_end at max length (100 chars)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Pack data with serial_end at exactly 100 characters
    // NOTE: serial_start is always forced to zeros
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });

    // serial_end at exactly 100 characters (all 2s to be > zeros)
    const serialEnd = "2".repeat(100);
    // Expected serial_start: zeros padded to 100 characters
    const expectedSerialStart = "0".repeat(100);

    const packData = {
      game_id: game.game_id,
      pack_number: "PACK-037",
      serial_end: serialEnd,
    };

    // WHEN: Receiving pack with serial_end at max length
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Pack is created successfully
    expect(response.status(), "Should accept serial_end at max length").toBe(
      201,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.serial_start, "serial_start should be zeros").toBe(
      expectedSerialStart,
    );
    expect(body.data.serial_end, "serial_end should match").toBe(serialEnd);
  });

  test("6.2-API-038: [P0] should allow SYSTEM scope users to specify any store_id", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a SYSTEM scope user (Super Admin)
    // AND: Multiple stores exist
    const owner1 = await createUser(prismaClient);
    const company1 = await createCompany(prismaClient, {
      owner_user_id: owner1.user_id,
    });
    const store1 = await createStore(prismaClient, {
      company_id: company1.company_id,
      name: "Test Store 1",
    });

    const owner2 = await createUser(prismaClient);
    const company2 = await createCompany(prismaClient, {
      owner_user_id: owner2.user_id,
    });
    const store2 = await createStore(prismaClient, {
      company_id: company2.company_id,
      name: "Test Store 2",
    });

    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });

    const packData = {
      game_id: game.game_id,
      pack_number: "PACK-038",
      serial_end: "184303159650093783374680",
      store_id: store2.store_id, // Different store than admin's default
    };

    // WHEN: Receiving pack for a different store as SYSTEM scope user
    const response = await superadminApiRequest.post(
      "/api/lottery/packs/receive",
      packData,
    );

    // THEN: Pack is created successfully (SYSTEM scope can access any store)
    expect(response.status(), "SYSTEM scope should access any store").toBe(201);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(
      body.data.store.store_id,
      "store_id should match specified store",
    ).toBe(store2.store_id);
  });
});
