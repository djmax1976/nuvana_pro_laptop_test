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

/**
 * Generate valid scan metrics for a barcode
 * Simulates a barcode scanner with ~10ms between keystrokes
 * This is required for server-side scan validation
 */
function generateScanMetrics(serial: string): {
  totalInputTimeMs: number;
  avgInterKeyDelayMs: number;
  maxInterKeyDelayMs: number;
  minInterKeyDelayMs: number;
  interKeyStdDevMs: number;
  charCount: number;
  keystrokeTimestamps: number[];
  inputMethod: "SCANNED";
  confidence: number;
  analyzedAt: string;
} {
  const charCount = serial.length;
  const baseTime = Date.now();
  const intervalMs = 10; // Scanner timing: ~10ms between characters

  // Generate timestamps simulating scanner input
  const keystrokeTimestamps: number[] = [];
  for (let i = 0; i < charCount; i++) {
    keystrokeTimestamps.push(baseTime + i * intervalMs);
  }

  const totalInputTimeMs = (charCount - 1) * intervalMs;

  return {
    totalInputTimeMs,
    avgInterKeyDelayMs: intervalMs,
    maxInterKeyDelayMs: intervalMs,
    minInterKeyDelayMs: intervalMs,
    interKeyStdDevMs: 0, // Perfect consistency for scanner
    charCount,
    keystrokeTimestamps,
    inputMethod: "SCANNED",
    confidence: 1.0,
    analyzedAt: new Date().toISOString(),
  };
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
    // Generate valid scan metrics for each serial (simulates barcode scanner)
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: serializedNumbers,
        scan_metrics: serializedNumbers.map((s) => generateScanMetrics(s)),
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
    // Generate valid scan metrics for each serial (simulates barcode scanner)
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: serializedNumbers,
        scan_metrics: serializedNumbers.map((s) => generateScanMetrics(s)),
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
    // Generate valid scan metrics for each serial (simulates barcode scanner)
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: serializedNumbers,
        scan_metrics: serializedNumbers.map((s) => generateScanMetrics(s)),
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
    // Generate valid scan metrics for each serial (simulates barcode scanner)
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: serializedNumbers,
        scan_metrics: serializedNumbers.map((s) => generateScanMetrics(s)),
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

    // Create a non-existent game code that cannot be randomly generated
    // Use "0000" which is explicitly excluded from the lottery.factory random generation
    // This prevents race conditions with parallel test execution
    const invalidGameCode = "0000";
    const validSerial = buildSerialNumber(gameCode, "1234567", "012");
    const invalidSerial = buildSerialNumber(invalidGameCode, "7654321", "045");

    // AND: Batch contains serial with invalid game code
    const serializedNumbers = [
      validSerial, // Valid game_code
      invalidSerial, // Invalid game_code: 8888 (not in database)
    ];

    // WHEN: Receiving packs via batch API
    // Generate valid scan metrics for each serial (simulates barcode scanner)
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: serializedNumbers,
        scan_metrics: serializedNumbers.map((s) => generateScanMetrics(s)),
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
    // Use "0000" which is explicitly excluded from the lottery.factory random generation
    // This prevents race conditions with parallel test execution
    const invalidGameCodeSerial = buildSerialNumber("0000", "7890123", "078");

    // AND: Batch contains mix of valid serials and one with invalid game code
    // Note: Invalid format serials are caught by schema validation (400), so we only test game code errors
    const serializedNumbers = [
      validSerial1, // Valid
      validSerial2, // Valid
      invalidGameCodeSerial, // Invalid game code
      validSerial3, // Valid
    ];

    // WHEN: Receiving packs via batch API
    // Generate valid scan metrics for each serial (simulates barcode scanner)
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: serializedNumbers,
        scan_metrics: serializedNumbers.map((s) => generateScanMetrics(s)),
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
    // Generate valid scan metrics for each serial (simulates barcode scanner)
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: serializedNumbers,
        scan_metrics: serializedNumbers.map((s) => generateScanMetrics(s)),
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
    // Generate valid scan metrics for each serial (simulates barcode scanner)
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: serializedNumbers,
        scan_metrics: serializedNumbers.map((s) => generateScanMetrics(s)),
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
    const testSerial = "000112345670123456789012";
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: [testSerial],
        store_id: otherStore.store_id, // Attempting to use other store's ID
        scan_metrics: [generateScanMetrics(testSerial)],
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
    // GIVEN: Non-existent store_id (valid UUID format but doesn't exist in database)
    // WHEN: Attempting to receive packs for non-existent store
    const testSerial = "000112345670123456789012";
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: [testSerial],
        store_id: "00000000-0000-0000-0000-000000000000", // Non-existent UUID
        scan_metrics: [generateScanMetrics(testSerial)],
      },
    );

    // THEN: Request is rejected with 404 (store not found)
    // The implementation checks store existence first, then access control
    // So non-existent stores return 404, while existing stores with no access return 403
    expect(response.status(), "Non-existent store should return 404").toBe(404);
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
        scan_metrics: [generateScanMetrics(serial)],
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
        scan_metrics: maxBatch.map((s) => generateScanMetrics(s)),
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
        scan_metrics: [generateScanMetrics(serial)],
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
    // Use "0000" which is explicitly excluded from the lottery.factory random generation
    // This prevents race conditions with parallel test execution
    const invalidSerial1 = buildSerialNumber("0000", "1234567", "012");
    const invalidSerial2 = buildSerialNumber("0000", "2345678", "012");
    const invalidSerial3 = buildSerialNumber("0000", "3456789", "012");

    // WHEN: Attempting to receive all invalid game code serials
    const invalidSerials = [invalidSerial1, invalidSerial2, invalidSerial3];
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: invalidSerials,
        scan_metrics: invalidSerials.map((s) => generateScanMetrics(s)),
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
        scan_metrics: [generateScanMetrics(serial)],
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

  test("6.12-EDGE-006: [P1] should validate serial_end calculation based on tickets_per_pack", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Pack with explicit tickets_per_pack configuration
    // Create game with 150 tickets ($2.00 price, $300 pack_value = 150 tickets)
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game Edge 006",
      price: 2.0,
      pack_value: 300, // $300 / $2.00 = 150 tickets
      tickets_per_pack: 150,
    });
    const gameCode = game.game_code;

    // Build serial with serial_start "000" (note: API ignores scanned serial_start and always uses "000")
    const serial = buildSerialNumber(gameCode, "1234567", "000");

    // WHEN: Receiving pack with serial_start "000"
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: [serial],
        scan_metrics: [generateScanMetrics(serial)],
      },
    );

    // THEN: serial_end should be calculated as tickets_per_pack - 1 = 149
    // (serial range is 0 to 149 for 150 tickets)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.created.length).toBe(1);
    const pack = body.data.created[0];
    // API always forces serial_start to "000" regardless of scanned value
    expect(pack.serial_start, "serial_start should always be 000").toBe("000");
    expect(
      pack.serial_end,
      "serial_end should be tickets_per_pack - 1 = 149",
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

  test("6.12-EDGE-008: [P1] should normalize serial_start to 000 regardless of scanned value", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A game with known tickets_per_pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game Edge 008",
      price: 2.0,
      pack_value: 60, // $60 / $2.00 = 30 tickets (serial 000-029)
      tickets_per_pack: 30,
    });
    const gameCode = game.game_code;

    // AND: A serial with non-zero serial_start (e.g., "045" which indicates mid-pack scan)
    // The barcode has serial_start "045" but API should normalize to "000"
    const serial = buildSerialNumber(gameCode, "1234567", "045");

    // WHEN: Receiving pack via batch API
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: [serial],
        scan_metrics: [generateScanMetrics(serial)],
      },
    );

    // THEN: Pack is created with normalized serial_start = "000"
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.created.length).toBe(1);
    const pack = body.data.created[0];

    // CRITICAL: API always sets serial_start to "000" regardless of scanned value
    // This ensures consistent pack tracking from first ticket to last
    expect(
      pack.serial_start,
      "serial_start should be normalized to 000 regardless of scanned barcode",
    ).toBe("000");

    // serial_end is tickets_per_pack - 1 = 29
    expect(
      pack.serial_end,
      "serial_end should be tickets_per_pack - 1 = 029",
    ).toBe("029");
  });

  test("6.12-EDGE-009: [P1] should correctly calculate serial_end for various ticket counts", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // Test different ticket counts to ensure formula is correct
    // Formula: serial_end = tickets_per_pack - 1 (since serial_start is always 0)

    // Create game with 50 tickets ($1.00 price, $50 pack_value)
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game Edge 009",
      price: 1.0,
      pack_value: 50,
      tickets_per_pack: 50,
    });
    const gameCode = game.game_code;

    const serial = buildSerialNumber(gameCode, "7777777", "000");

    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: [serial],
        scan_metrics: [generateScanMetrics(serial)],
      },
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.created.length).toBe(1);
    const pack = body.data.created[0];

    // For 50 tickets: serial range is 000-049 (50 tickets total)
    expect(pack.serial_start).toBe("000");
    expect(pack.serial_end, "serial_end for 50 tickets should be 049").toBe(
      "049",
    );
  });

  test("6.12-EDGE-010: [P1] should prioritize store-scoped game over global game", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A global game exists (no store_id = global)
    const globalGame = await createLotteryGame(prismaClient, {
      name: "Global Game",
      price: 2.0,
      // No store_id means global game
    });
    const gameCode = globalGame.game_code;

    // AND: A store-scoped game exists with the SAME game_code
    const storeScopedGame = await createLotteryGame(prismaClient, {
      name: "Store-Scoped Game (Override)",
      price: 5.0,
      game_code: gameCode, // Same game code
      store_id: storeManagerUser.store_id, // Store-scoped
    });

    // WHEN: Receiving a pack with this game code
    const serial = buildSerialNumber(gameCode, "1234567", "012");
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: [serial],
        scan_metrics: [generateScanMetrics(serial)],
      },
    );

    // THEN: The store-scoped game is used (not the global one)
    // Implementation: lookupGameByCode() checks store-scoped first, then falls back to global
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.created.length).toBe(1);
    const pack = body.data.created[0];

    // Verify the pack uses the store-scoped game, not the global game
    expect(pack.game_id, "Should use store-scoped game ID").toBe(
      storeScopedGame.game_id,
    );
    expect(pack.game.name, "Should use store-scoped game name").toBe(
      "Store-Scoped Game (Override)",
    );
  });

  test("6.12-EDGE-011: [P1] should use global game when store-scoped game doesn't exist", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Only a global game exists (no store-scoped override)
    const globalGame = await createLotteryGame(prismaClient, {
      name: "Global Game Only",
      price: 3.0,
      // No store_id means global game
    });
    const gameCode = globalGame.game_code;

    // WHEN: Receiving a pack with this game code
    const serial = buildSerialNumber(gameCode, "9999999", "012");
    const response = await storeManagerApiRequest.post(
      "/api/lottery/packs/receive/batch",
      {
        serialized_numbers: [serial],
        scan_metrics: [generateScanMetrics(serial)],
      },
    );

    // THEN: The global game is used (fallback behavior)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.created.length).toBe(1);
    const pack = body.data.created[0];

    // Verify the pack uses the global game
    expect(pack.game_id, "Should use global game ID").toBe(globalGame.game_id);
    expect(pack.game.name, "Should use global game name").toBe(
      "Global Game Only",
    );
  });
});
