/**
 * @test-level API
 * @justification Tests API endpoints for batch pack reception - requires database and auth infrastructure
 * @story 6.12
 * @enhanced-by workflow-9 on 2025-01-28
 *
 * Lottery Pack Reception Batch API Tests
 *
 * Tests for Lottery Pack Reception Batch API endpoint:
 * - POST /api/lottery/packs/receive/batch
 * - Authentication and authorization (LOTTERY_PACK_RECEIVE permission)
 * - RLS enforcement (store isolation)
 * - Batch processing with serialized numbers
 * - Atomic transaction behavior
 * - Duplicate detection (within batch and database)
 * - Partial failure handling with games_not_found separation
 * - Error handling and validation
 * - Audit logging
 *
 * RESPONSE STRUCTURE:
 * - created: Array of successfully created packs
 * - duplicates: Array of serial numbers that were duplicates
 * - errors: Array of processing errors (format errors, unexpected failures)
 * - games_not_found: Array of serials with game codes not in database
 *   (separated from errors to allow frontend to prompt user to create games)
 *
 * SECURITY TEST COVERAGE:
 * - Authentication bypass attempts (missing/invalid/expired tokens)
 * - Authorization enforcement (LOTTERY_PACK_RECEIVE permission required)
 * - Input validation (Zod schema enforcement, array validation)
 * - Tenant isolation (store_id RLS enforcement prevents cross-tenant access)
 * - SQL injection prevention (Prisma ORM usage)
 * - Data leakage prevention (response structure validation)
 *
 * Story: 6.12 - Serialized Pack Reception with Batch Processing
 * Priority: P0 (Critical - Security, Data Integrity, Business Logic)
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createLotteryGame,
  createLotteryPack,
} from "../support/factories/lottery.factory";
import { createCompany, createStore } from "../support/helpers";

/**
 * Helper to build a 24-digit serialized number from components
 * Format: [game_code:4][pack_number:7][serial_start:3][identifier:10]
 */
function buildSerialNumber(
  gameCode: string,
  packNumber: string,
  serialStart: string = "012",
  identifier: string = "3456789012",
): string {
  return `${gameCode.padStart(4, "0")}${packNumber.padStart(7, "0")}${serialStart.padStart(3, "0")}${identifier}`;
}

test.describe("6.12-API: Lottery Pack Reception Batch", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // HAPPY PATH TESTS (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.12-API-001: [P0] POST /api/lottery/packs/receive/batch - should create multiple packs from serialized numbers (AC #4)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with a store
    // AND: A lottery game exists with unique game_code (let factory generate)
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game Batch 001",
      price: 2.0,
    });
    const gameCode = game.game_code;

    const serializedNumbers = [
      buildSerialNumber(gameCode, "1234567", "012"), // pack: 1234567, serial_start: 012
      buildSerialNumber(gameCode, "9876543", "045"), // pack: 9876543, serial_start: 045
      buildSerialNumber(gameCode, "5555555", "078"), // pack: 5555555, serial_start: 078
    ];

    // WHEN: Receiving multiple packs via batch API
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: serializedNumbers,
      },
    );

    // THEN: Response indicates success
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data, "Response should contain batch data").toBeDefined();

    // AND: All packs are created
    expect(body.data.created.length, "All packs should be created").toBe(3);
    expect(body.data.duplicates.length, "No duplicates expected").toBe(0);
    expect(body.data.errors.length, "No errors expected").toBe(0);

    // AND: Each created pack has correct data
    body.data.created.forEach((pack: any, index: number) => {
      expect(pack.game_id, `Pack ${index} game_id should match`).toBe(
        game.game_id,
      );
      expect(pack.status, `Pack ${index} status should be RECEIVED`).toBe(
        "RECEIVED",
      );
      expect(pack.pack_id, `Pack ${index} should have pack_id`).toBeDefined();
      expect(pack.game, `Pack ${index} should have game info`).toBeDefined();
      expect(pack.game.name, `Pack ${index} game name should match`).toBe(
        "Test Game Batch 001",
      );
    });

    // AND: Packs exist in database
    const packs = await prismaClient.lotteryPack.findMany({
      where: {
        store_id: storeManagerUser.store_id,
        game_id: game.game_id,
      },
    });
    expect(packs.length, "All packs should exist in database").toBe(3);
  });

  test("6.12-API-002: [P0] should handle duplicate pack numbers within batch", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A lottery game exists with unique game_code (let factory generate)
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game Batch 002",
      price: 2.0,
    });
    const gameCode = game.game_code;

    // AND: Batch contains duplicate pack numbers (same pack_number in different serials)
    const serializedNumbers = [
      buildSerialNumber(gameCode, "1234567", "012"), // pack: 1234567
      buildSerialNumber(gameCode, "1234567", "045"), // pack: 1234567 (duplicate within batch)
      buildSerialNumber(gameCode, "9876543", "078"), // pack: 9876543
    ];

    // WHEN: Receiving packs via batch API
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: serializedNumbers,
      },
    );

    // THEN: Duplicate is detected and not created
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(
      body.data.created.length,
      "Only unique packs should be created",
    ).toBe(2);
    expect(
      body.data.duplicates.length,
      "Duplicate should be detected",
    ).toBeGreaterThan(0);
  });

  test("6.12-API-003: [P0] should handle duplicate pack numbers in database", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A lottery game exists with unique game_code (let factory generate)
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game Batch 003",
      price: 2.0,
    });
    const gameCode = game.game_code;

    // AND: A pack already exists in database
    await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "1234567",
      serial_start: "000",
      serial_end: "149",
    });

    // Build serial numbers using the game code
    const duplicateSerial = buildSerialNumber(gameCode, "1234567", "012");
    const newSerial = buildSerialNumber(gameCode, "9876543", "045");

    // AND: Batch contains serial for same pack number
    const serializedNumbers = [
      duplicateSerial, // pack: 1234567 (already exists)
      newSerial, // pack: 9876543 (new)
    ];

    // WHEN: Receiving packs via batch API
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: serializedNumbers,
      },
    );

    // THEN: Duplicate is detected and not created
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.created.length, "Only new pack should be created").toBe(1);
    expect(body.data.duplicates.length, "Duplicate should be detected").toBe(1);
    expect(body.data.duplicates[0], "Duplicate serial should be listed").toBe(
      duplicateSerial,
    );
  });

  test("6.12-API-004: [P0] should handle invalid serial format errors", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A lottery game exists with unique game_code (let factory generate)
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game Batch 004",
      price: 2.0,
    });
    const gameCode = game.game_code;

    const validSerial = buildSerialNumber(gameCode, "1234567", "012");

    // AND: Batch contains invalid serial formats
    // Note: Fastify schema validation rejects invalid formats at the request level
    // So we test with valid format but expect schema validation to catch these
    const serializedNumbers = [
      validSerial, // Valid
      "123", // Too short - will fail schema validation
      "0001123456701234567890123", // Too long - will fail schema validation
      "00011234567012345678901a", // Non-numeric - will fail schema validation
    ];

    // WHEN: Receiving packs via batch API
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: serializedNumbers,
      },
    );

    // THEN: Schema validation rejects invalid formats with 400
    // The Fastify schema requires each item to be exactly 24 digits
    expect(response.status()).toBe(400);
  });

  test("6.12-API-005: [P0] should handle invalid game code errors", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A lottery game exists with unique game_code (let factory generate)
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game Batch 005",
      price: 2.0,
    });
    const gameCode = game.game_code;

    // Create a non-existent game code using a very unlikely code
    // Use "8888" which doesn't exist in seed data or performance tests
    const invalidGameCode = "8888";
    const validSerial = buildSerialNumber(gameCode, "1234567", "012");
    const invalidSerial = buildSerialNumber(invalidGameCode, "7654321", "045");

    // AND: Batch contains serial with invalid game code
    const serializedNumbers = [
      validSerial, // Valid game_code
      invalidSerial, // Invalid game_code: 8888 (not in database)
    ];

    // WHEN: Receiving packs via batch API
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: serializedNumbers,
      },
    );

    // THEN: Invalid game code is tracked in games_not_found (not errors)
    // The API separates "game not found" from other errors so frontend can prompt user to create games
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.created.length, "Only valid pack should be created").toBe(
      1,
    );
    expect(
      body.data.games_not_found.length,
      "Invalid game code should be in games_not_found",
    ).toBe(1);
    expect(
      body.data.games_not_found[0].game_code,
      "games_not_found should include the invalid game code",
    ).toBe(invalidGameCode);
    expect(
      body.data.games_not_found[0].serial,
      "games_not_found should include the serial",
    ).toBe(invalidSerial);
  });

  test("6.12-API-006: [P0] should handle partial failures gracefully", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A lottery game exists with unique game_code (let factory generate)
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game Batch 006",
      price: 2.0,
    });
    const gameCode = game.game_code;

    // Build valid serials with the game code
    const validSerial1 = buildSerialNumber(gameCode, "1234567", "012");
    const validSerial2 = buildSerialNumber(gameCode, "9876543", "045");
    const validSerial3 = buildSerialNumber(gameCode, "5555555", "012");
    // Use "8888" which doesn't exist in seed data or performance tests
    const invalidGameCodeSerial = buildSerialNumber("8888", "7890123", "078");

    // AND: Batch contains mix of valid serials and one with invalid game code
    // Note: Invalid format serials are caught by schema validation (400), so we only test game code errors
    const serializedNumbers = [
      validSerial1, // Valid
      validSerial2, // Valid
      invalidGameCodeSerial, // Invalid game code
      validSerial3, // Valid
    ];

    // WHEN: Receiving packs via batch API
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: serializedNumbers,
      },
    );

    // THEN: Valid packs are created, invalid game code is in games_not_found
    // The API separates "game not found" from other errors so frontend can prompt user to create games
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.created.length, "Valid packs should be created").toBe(3);
    expect(
      body.data.games_not_found.length,
      "Invalid game code should be in games_not_found",
    ).toBe(1);
    expect(body.data.duplicates.length, "No duplicates expected").toBe(0);
    expect(body.data.errors.length, "No processing errors expected").toBe(0);
  });

  test("6.12-API-007: [P0] should enforce RLS (store isolation)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Two different stores
    const company = await createCompany(prismaClient);
    const otherStore = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // AND: A lottery game exists with unique game_code (let factory generate)
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game Batch 007",
      price: 2.0,
    });
    const gameCode = game.game_code;

    // AND: Pack exists in other store
    await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: otherStore.store_id,
      pack_number: "1234567",
      serial_start: "000",
      serial_end: "149",
    });

    // Build serial number using the game code
    const serial = buildSerialNumber(gameCode, "1234567", "012");

    // AND: Batch contains serial for same pack number but different store
    const serializedNumbers = [
      serial, // pack: 1234567 (exists in other store, not this one)
    ];

    // WHEN: Receiving packs via batch API (should use authenticated user's store)
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: serializedNumbers,
      },
    );

    // THEN: Pack is created (different store, so not a duplicate)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.created.length, "Pack should be created").toBe(1);
    expect(body.data.created[0].pack_number, "Pack number should match").toBe(
      "1234567",
    );
  });

  test("6.12-API-008: [P0] should require authentication", async ({
    request,
    prismaClient,
  }) => {
    // GIVEN: No authentication token
    // WHEN: Attempting to receive packs via batch API
    const response = await request.post("/api/lottery/packs/receive/batch", {
      data: {
        serialized_numbers: ["000112345670123456789012"],
      },
    });

    // THEN: Request is rejected with 401
    expect(response.status()).toBe(401);
  });

  test("6.12-API-009: [P0] should require LOTTERY_PACK_RECEIVE permission", async ({
    regularUser,
    request,
    backendUrl,
  }) => {
    // GIVEN: User without LOTTERY_PACK_RECEIVE permission
    // (regularUser fixture has only SHIFT_READ and INVENTORY_READ permissions)
    // WHEN: Attempting to receive packs via batch API
    const response = await request.post(
      `${backendUrl}/api/lottery/packs/receive/batch`,
      {
        headers: {
          Cookie: `access_token=${regularUser.token}`,
        },
        data: {
          serialized_numbers: ["000112345670123456789012"],
        },
      },
    );

    // THEN: Request is rejected with 403 (permission denied)
    // The regularUser fixture creates a user without LOTTERY_PACK_RECEIVE permission
    expect(response.status()).toBe(403);
  });

  test("6.12-API-010: [P0] should validate batch size limit", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Batch exceeds size limit (100 packs)
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game Batch 010",
      price: 2.0,
    });
    const gameCode = game.game_code;

    // Create batch of 101 serials (exceeds limit of 100)
    const largeBatch = Array.from({ length: 101 }, (_, i) =>
      buildSerialNumber(gameCode, String(i).padStart(7, "0"), "012"),
    );

    // WHEN: Attempting to receive large batch
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: largeBatch,
      },
    );

    // THEN: Request is rejected with 400 (schema validation rejects > 100 items)
    expect(response.status()).toBe(400);
  });

  test("6.12-API-011: [P0] should create audit log entries", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A lottery game exists with unique game_code (let factory generate)
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game Batch 011",
      price: 2.0,
    });
    const gameCode = game.game_code;

    const serializedNumbers = [
      buildSerialNumber(gameCode, "1234567", "012"),
      buildSerialNumber(gameCode, "9876543", "045"),
    ];

    // Record timestamp before the API call for more precise audit log lookup
    const beforeTimestamp = new Date();

    // WHEN: Receiving packs via batch API
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: serializedNumbers,
      },
    );

    // THEN: Batch audit log entry is created
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.created.length, "Packs should be created").toBe(2);

    // Query audit log - first find ANY batch audit log to verify they're being created
    // The batch audit log includes store_id in new_values
    const batchAuditLog = await prismaClient.auditLog.findFirst({
      where: {
        action: "BATCH_PACK_RECEIVED",
        timestamp: {
          gte: beforeTimestamp,
        },
      },
      orderBy: {
        timestamp: "desc",
      },
    });

    // If we found an audit log, verify it has the expected content
    // Note: In parallel test execution, multiple users may create audit logs
    // so we don't filter by user_id initially
    expect(batchAuditLog, "Batch audit log should exist").not.toBeNull();
    expect(
      batchAuditLog?.new_values,
      "Audit log should contain batch metadata",
    ).toHaveProperty("created_count");

    // Verify the audit log has the expected store_id in new_values
    const newValues = batchAuditLog?.new_values as Record<string, unknown>;
    expect(
      newValues?.store_id,
      "Audit log should be for the correct store",
    ).toBe(storeManagerUser.store_id);
    expect(
      newValues?.created_count,
      "Audit log should record 2 created packs",
    ).toBe(2);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS (P0 - Mandatory)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.12-SEC-001: [P0] should reject request with invalid authentication token", async ({
    request,
  }) => {
    // GIVEN: Invalid authentication token
    // WHEN: Attempting to receive packs with invalid token
    const response = await request.post("/api/lottery/packs/receive/batch", {
      headers: {
        Authorization: "Bearer invalid-token-12345",
      },
      data: {
        serialized_numbers: ["000112345670123456789012"],
      },
    });

    // THEN: Request is rejected with 401
    expect(response.status(), "Invalid token should be rejected").toBe(401);
  });

  test("6.12-SEC-002: [P0] should reject request with malformed authentication token", async ({
    request,
  }) => {
    // GIVEN: Malformed authentication token (not Bearer format)
    // WHEN: Attempting to receive packs with malformed token
    const response = await request.post("/api/lottery/packs/receive/batch", {
      headers: {
        Authorization: "InvalidFormat token-12345",
      },
      data: {
        serialized_numbers: ["000112345670123456789012"],
      },
    });

    // THEN: Request is rejected with 401
    expect(response.status(), "Malformed token should be rejected").toBe(401);
  });

  test("6.12-SEC-003: [P0] should reject empty serialized_numbers array", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: Empty serialized_numbers array
    // WHEN: Attempting to receive packs with empty array
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: [],
      },
    );

    // THEN: Request is rejected with 400
    expect(response.status(), "Empty array should be rejected").toBe(400);
  });

  test("6.12-SEC-004: [P0] should reject null serialized_numbers", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: Null serialized_numbers

    // WHEN: Attempting to receive packs with null array
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: null,
      },
    );

    // THEN: Request is rejected with 400
    expect(response.status(), "Null array should be rejected").toBe(400);
  });

  test("6.12-SEC-005: [P0] should reject non-array serialized_numbers", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: Non-array serialized_numbers (object instead of array)
    // Note: Fastify may coerce a single string to array, so we use an object
    // WHEN: Attempting to receive packs with object instead of array
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: { invalid: "object" },
      },
    );

    // THEN: Request is rejected with 400 (schema validation)
    expect(response.status(), "Non-array should be rejected").toBe(400);
  });

  test("6.12-SEC-006: [P0] should reject store_id manipulation attempt (unauthorized store)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: User authenticated for one store
    // AND: Another store exists
    const company = await createCompany(prismaClient);
    const otherStore = await createStore(prismaClient, {
      company_id: company.company_id,
    });

    // WHEN: Attempting to receive packs for unauthorized store
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: ["000112345670123456789012"],
        store_id: otherStore.store_id, // Attempting to use other store's ID
      },
    );

    // THEN: Request is rejected with 403
    // Note: The permission check happens before store validation in middleware,
    // so users without LOTTERY_PACK_RECEIVE on the target store get permission error
    expect(response.status(), "Unauthorized store_id should be rejected").toBe(
      403,
    );
  });

  test("6.12-SEC-007: [P0] should reject invalid store_id format (non-UUID)", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: Invalid store_id format (not UUID)
    // WHEN: Attempting to receive packs with invalid store_id
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: ["000112345670123456789012"],
        store_id: "not-a-valid-uuid",
      },
    );

    // THEN: Request is rejected with 400 (schema validation)
    expect(response.status(), "Invalid UUID should be rejected").toBe(400);
  });

  test("6.12-SEC-008: [P0] should reject non-existent store_id", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: Non-existent store_id
    // Note: Store managers cannot access other stores, so this returns 403 (not 404)
    // The RLS check happens before the store existence check
    // WHEN: Attempting to receive packs for non-existent store
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: ["000112345670123456789012"],
        store_id: "00000000-0000-0000-0000-000000000000", // Non-existent UUID
      },
    );

    // THEN: Request is rejected with 403 (user doesn't have access to this store_id)
    // The RLS check rejects before the store existence check
    expect(response.status(), "Non-existent store should be rejected").toBe(
      403,
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASE TESTS (P1)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.12-EDGE-001: [P1] should handle single pack batch", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Single pack in batch with unique game code (let factory generate)
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game Edge 001",
      price: 2.0,
    });
    const gameCode = game.game_code;

    const serial = buildSerialNumber(gameCode, "1234567", "012");

    // WHEN: Receiving single pack via batch API
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: [serial],
      },
    );

    // THEN: Pack is created successfully
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.created.length, "Single pack should be created").toBe(1);
    expect(body.data.duplicates.length, "No duplicates").toBe(0);
    expect(body.data.errors.length, "No errors").toBe(0);
  });

  test("6.12-EDGE-002: [P1] should handle maximum batch size (100 packs)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Maximum batch size (100 packs) with unique game code (let factory generate)
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game Edge 002",
      price: 2.0,
    });
    const gameCode = game.game_code;

    // Create 100 unique serial numbers
    const maxBatch = Array.from({ length: 100 }, (_, i) =>
      buildSerialNumber(gameCode, String(i).padStart(7, "0"), "012"),
    );

    // WHEN: Receiving maximum batch
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: maxBatch,
      },
    );

    // THEN: All packs are created
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.created.length, "All 100 packs should be created").toBe(
      100,
    );
  });

  test("6.12-EDGE-003: [P1] should handle all duplicates scenario", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: All packs in batch are duplicates with unique game code (let factory generate)
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game Edge 003",
      price: 2.0,
    });
    const gameCode = game.game_code;

    // AND: Pack already exists in database
    await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "1234567",
      serial_start: "000",
      serial_end: "149",
    });

    const serial = buildSerialNumber(gameCode, "1234567", "012");

    // WHEN: Attempting to receive duplicate pack
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: [serial],
      },
    );

    // THEN: No packs created, duplicate reported
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.created.length, "No packs should be created").toBe(0);
    expect(body.data.duplicates.length, "Duplicate should be reported").toBe(1);
  });

  test("6.12-EDGE-004: [P1] should handle all games_not_found scenario (invalid game codes)", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A game exists but we'll send serials with non-existent game codes
    // (let factory generate, we don't actually use this game code in the request)
    await createLotteryGame(prismaClient, {
      name: "Test Game Edge 004",
      price: 2.0,
    });

    // Build serials with invalid/non-existent game codes
    // Use "8888" which doesn't exist in seed data or performance tests
    const invalidSerial1 = buildSerialNumber("8888", "1234567", "012");
    const invalidSerial2 = buildSerialNumber("8888", "2345678", "012");
    const invalidSerial3 = buildSerialNumber("8888", "3456789", "012");

    // WHEN: Attempting to receive all invalid game code serials
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: [invalidSerial1, invalidSerial2, invalidSerial3],
      },
    );

    // THEN: No packs created, all invalid game codes in games_not_found
    // The API separates "game not found" from other errors so frontend can prompt user to create games
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.created.length, "No packs should be created").toBe(0);
    expect(
      body.data.games_not_found.length,
      "All invalid game codes should be in games_not_found",
    ).toBe(3);
    expect(body.data.errors.length, "No processing errors expected").toBe(0);
    expect(body.data.duplicates.length, "No duplicates expected").toBe(0);
  });

  test("6.12-EDGE-005: [P1] should validate response structure and data types", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Valid batch request with unique game code (let factory generate)
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game Edge 005",
      price: 2.0,
    });
    const gameCode = game.game_code;

    const serial = buildSerialNumber(gameCode, "1234567", "012");

    // WHEN: Receiving packs via batch API
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: [serial],
      },
    );

    // THEN: Response structure is correct
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body, "Response should have success field").toHaveProperty(
      "success",
    );
    expect(typeof body.success, "success should be boolean").toBe("boolean");
    expect(body, "Response should have data field").toHaveProperty("data");
    expect(body.data, "data should have created array").toHaveProperty(
      "created",
    );
    expect(body.data, "data should have duplicates array").toHaveProperty(
      "duplicates",
    );
    expect(body.data, "data should have errors array").toHaveProperty("errors");
    expect(body.data, "data should have games_not_found array").toHaveProperty(
      "games_not_found",
    );
    expect(Array.isArray(body.data.created), "created should be array").toBe(
      true,
    );
    expect(
      Array.isArray(body.data.duplicates),
      "duplicates should be array",
    ).toBe(true);
    expect(Array.isArray(body.data.errors), "errors should be array").toBe(
      true,
    );
    expect(
      Array.isArray(body.data.games_not_found),
      "games_not_found should be array",
    ).toBe(true);

    // AND: Created pack has correct structure and types
    if (body.data.created.length > 0) {
      const pack = body.data.created[0];
      expect(pack, "Pack should have pack_id").toHaveProperty("pack_id");
      expect(typeof pack.pack_id, "pack_id should be string").toBe("string");
      expect(pack, "Pack should have game_id").toHaveProperty("game_id");
      expect(typeof pack.game_id, "game_id should be string").toBe("string");
      expect(pack, "Pack should have pack_number").toHaveProperty(
        "pack_number",
      );
      expect(typeof pack.pack_number, "pack_number should be string").toBe(
        "string",
      );
      expect(pack, "Pack should have serial_start").toHaveProperty(
        "serial_start",
      );
      expect(typeof pack.serial_start, "serial_start should be string").toBe(
        "string",
      );
      expect(pack, "Pack should have serial_end").toHaveProperty("serial_end");
      expect(typeof pack.serial_end, "serial_end should be string").toBe(
        "string",
      );
      expect(pack, "Pack should have status").toHaveProperty("status");
      expect(pack.status, "status should be RECEIVED").toBe("RECEIVED");
      expect(pack, "Pack should have game object").toHaveProperty("game");
      expect(pack.game, "game should have game_id").toHaveProperty("game_id");
      expect(pack.game, "game should have name").toHaveProperty("name");
    }
  });

  test("6.12-EDGE-006: [P1] should validate serial_end calculation (150 tickets per pack)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Pack with serial_start = "000" with unique game code (let factory generate)
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game Edge 006",
      price: 2.0,
    });
    const gameCode = game.game_code;

    // Build serial with serial_start "000"
    const serial = buildSerialNumber(gameCode, "1234567", "000");

    // WHEN: Receiving pack with serial_start "000"
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: [serial],
      },
    );

    // THEN: serial_end should be calculated as 000 + 149 = 149
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.created.length).toBe(1);
    const pack = body.data.created[0];
    expect(
      pack.serial_end,
      "serial_end should be calculated as serial_start + 149",
    ).toBe("149");
  });

  test("6.12-EDGE-007: [P1] should handle array with null values - schema rejects", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Array containing null values (let factory generate unique game code)
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game Edge 007",
      price: 2.0,
    });
    const gameCode = game.game_code;

    const validSerial1 = buildSerialNumber(gameCode, "1234567", "012");
    const validSerial2 = buildSerialNumber(gameCode, "9876543", "045");

    // WHEN: Attempting to receive packs with null in array
    // Note: Fastify schema validation rejects null values in array items
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: [validSerial1, null as any, validSerial2],
      },
    );

    // THEN: Schema validation rejects the request with 400
    // Because each item must be a string matching the pattern
    expect(response.status()).toBe(400);
  });
});
