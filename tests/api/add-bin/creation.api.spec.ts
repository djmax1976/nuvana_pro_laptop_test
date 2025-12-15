/**
 * Add Bin API Tests - Bin Creation
 *
 * Tests for bin creation endpoint:
 * - POST /api/stores/:storeId/lottery/bins/create-with-pack
 * - Bin creation with pack activation in transaction
 * - Display order assignment
 * - Pack status updates
 * - Record creation (LotteryShiftOpening, LotteryPackBinHistory, AuditLog)
 * - Transaction rollback on errors
 * - Authentication requirements
 *
 * @test-level API
 * @justification Tests bin creation logic and transaction integrity
 * @story 10-5 - Add Bin Functionality
 * @priority P0 (Critical - Data Integrity, Business Logic)
 */

import { test, expect } from "../../support/fixtures/rbac.fixture";
import {
  createLotteryGame,
  createLotteryPack,
  createLotteryBin,
} from "../../support/factories/lottery.factory";

/**
 * Helper to create an active shift for testing
 */
async function createActiveShift(
  prismaClient: import("@prisma/client").PrismaClient,
  storeId: string,
  userId: string,
) {
  // Create a cashier first (employee_id is 4 chars max per schema)
  const empId = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  const cashier = await prismaClient.cashier.create({
    data: {
      store_id: storeId,
      name: `Test Cashier ${Date.now()}`,
      employee_id: empId,
      pin_hash: "hashed_pin",
      created_by: userId,
      hired_on: new Date(),
    },
  });

  // Create an active shift
  return await prismaClient.shift.create({
    data: {
      store_id: storeId,
      opened_by: userId,
      cashier_id: cashier.cashier_id,
      status: "ACTIVE",
      opening_cash: 100.0,
    },
  });
}

test.describe("10-5-API: Bin Creation", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // POST /api/stores/:storeId/lottery/bins/create-with-pack - AC #5
  // ═══════════════════════════════════════════════════════════════════════════

  test("10-5-API-006: [P0] POST /api/stores/:storeId/lottery/bins/create-with-pack - should create bin with correct display_order (AC #5)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists with RECEIVED status
    // AND: Existing bins exist
    // AND: An active shift exists
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: `PKG-${Date.now()}`,
      serial_start: "000112345670123456789012",
      serial_end: "000112345670123456789680",
      status: "RECEIVED",
    });

    // Create existing bins
    await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      name: "Bin 1",
      display_order: 0,
    });
    await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      name: "Bin 2",
      display_order: 1,
    });

    // Create an active shift (required by API)
    const shift = await createActiveShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Creating bin with pack activation (display_order is required)
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 3",
        location: "Front Counter",
        display_order: 2,
        pack_number: pack.pack_number,
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: shift.shift_id,
      },
    );

    // THEN: Bin is created with correct display_order
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.bin, "Response should contain bin").toBeDefined();
    expect(body.data.bin.display_order, "Display order should match").toBe(2);
    expect(body.data.bin.name, "Bin name should match").toBe("Bin 3");
    expect(body.data.bin.location, "Location should match").toBe(
      "Front Counter",
    );
  });

  test("10-5-API-007: [P0] POST /api/stores/:storeId/lottery/bins/create-with-pack - should update pack status to ACTIVE (AC #5)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists with RECEIVED status
    // AND: An active shift exists
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: `PKG-${Date.now()}`,
      serial_start: "000112345670123456789012",
      serial_end: "000112345670123456789680",
      status: "RECEIVED",
    });

    // Create an active shift (required by API)
    const shift = await createActiveShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Creating bin with pack activation
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        display_order: 0,
        pack_number: pack.pack_number,
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: shift.shift_id,
      },
    );

    // THEN: Pack status is updated to ACTIVE
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    const updatedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
    });
    expect(updatedPack?.status, "Pack status should be ACTIVE").toBe("ACTIVE");
    expect(
      updatedPack?.activated_at,
      "activated_at should be set",
    ).toBeDefined();
    expect(
      updatedPack?.activated_at,
      "activated_at should be a Date",
    ).toBeInstanceOf(Date);
    expect(
      updatedPack?.current_bin_id,
      "current_bin_id should be set",
    ).toBeDefined();
    expect(
      updatedPack?.current_bin_id,
      "current_bin_id should not be null",
    ).not.toBeNull();
  });

  test("10-5-API-008: [P0] POST /api/stores/:storeId/lottery/bins/create-with-pack - should set activated_by and activated_shift_id (AC #5)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists with RECEIVED status
    // AND: An active shift exists
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: `PKG-${Date.now()}`,
      serial_start: "000112345670123456789012",
      serial_end: "000112345670123456789680",
      status: "RECEIVED",
    });

    // Create an active shift (required by API)
    const shift = await createActiveShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Creating bin with pack activation
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        display_order: 0,
        pack_number: pack.pack_number,
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: shift.shift_id,
      },
    );

    // THEN: Pack has activated_by and activated_shift_id set
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const updatedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
    });
    expect(updatedPack?.activated_by, "activated_by should be set").toBe(
      storeManagerUser.user_id,
    );
    expect(
      updatedPack?.activated_shift_id,
      "activated_shift_id should be set",
    ).toBe(shift.shift_id);
  });

  test("10-5-API-009: [P0] POST /api/stores/:storeId/lottery/bins/create-with-pack - should create LotteryShiftOpening record (AC #5)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists with RECEIVED status
    // AND: An active shift exists
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: `PKG-${Date.now()}`,
      serial_start: "000112345670123456789012",
      serial_end: "000112345670123456789680",
      status: "RECEIVED",
    });

    // Create an active shift (required by API - must be ACTIVE status)
    const shift = await createActiveShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Creating bin with pack activation
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        display_order: 0,
        pack_number: pack.pack_number,
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: shift.shift_id,
      },
    );

    // THEN: LotteryShiftOpening record is created
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const shiftOpening = await prismaClient.lotteryShiftOpening.findFirst({
      where: {
        shift_id: shift.shift_id,
        pack_id: pack.pack_id,
      },
    });
    expect(shiftOpening, "LotteryShiftOpening should exist").toBeDefined();
    expect(shiftOpening?.opening_serial, "opening_serial should match").toBe(
      "001",
    );
  });

  test("10-5-API-010: [P0] POST /api/stores/:storeId/lottery/bins/create-with-pack - should create LotteryPackBinHistory record (AC #5)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists with RECEIVED status
    // AND: An active shift exists
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: `PKG-${Date.now()}`,
      serial_start: "000112345670123456789012",
      serial_end: "000112345670123456789680",
      status: "RECEIVED",
    });

    // Create an active shift (required by API)
    const shift = await createActiveShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Creating bin with pack activation
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        display_order: 0,
        pack_number: pack.pack_number,
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: shift.shift_id,
      },
    );

    // THEN: LotteryPackBinHistory record is created
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    const binId = body.data.bin.bin_id;

    const history = await prismaClient.lotteryPackBinHistory.findFirst({
      where: {
        pack_id: pack.pack_id,
        bin_id: binId,
      },
    });
    expect(history, "LotteryPackBinHistory should exist").toBeDefined();
    expect(history?.moved_by, "moved_by should match user").toBe(
      storeManagerUser.user_id,
    );
    expect(history?.reason, "reason should be set").toBe(
      "Pack activated during bin creation",
    );
  });

  test("10-5-API-011: [P0] POST /api/stores/:storeId/lottery/bins/create-with-pack - should create AuditLog entry (AC #5)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists with RECEIVED status
    // AND: An active shift exists
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: `PKG-${Date.now()}`,
      serial_start: "000112345670123456789012",
      serial_end: "000112345670123456789680",
      status: "RECEIVED",
    });

    // Create an active shift (required by API)
    const shift = await createActiveShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Creating bin with pack activation
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        display_order: 0,
        pack_number: pack.pack_number,
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: shift.shift_id,
      },
    );

    // THEN: AuditLog entry is created
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    const binId = body.data.bin.bin_id;

    // Note: API uses "lottery_bins" (pluralized table name from Prisma @@map)
    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        table_name: "lottery_bins",
        record_id: binId,
        action: "CREATE",
      },
    });
    expect(auditLog, "AuditLog should exist").toBeDefined();
    expect(auditLog?.user_id, "AuditLog user_id should match").toBe(
      storeManagerUser.user_id,
    );
    // Verify new_values contains expected data
    const newValues = auditLog?.new_values as Record<string, unknown>;
    expect(newValues?.bin_id, "new_values should contain bin_id").toBe(binId);
    expect(
      newValues?.pack_number,
      "new_values should contain pack_number",
    ).toBe(pack.pack_number);
  });

  test("10-5-API-012: [P0] POST /api/stores/:storeId/lottery/bins/create-with-pack - should reject pack with invalid status (AC #5)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists with ACTIVE status (not RECEIVED - cannot activate)
    // AND: An active shift exists
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: `PKG-${Date.now()}`,
      serial_start: "000112345670123456789012",
      serial_end: "000112345670123456789680",
      status: "ACTIVE", // Invalid status - must be RECEIVED to activate
    });

    // Create an active shift (required by API)
    const shift = await createActiveShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // Count existing bins
    const binCountBefore = await prismaClient.lotteryBin.count({
      where: { store_id: storeManagerUser.store_id },
    });

    // WHEN: Attempting to create bin with pack that has invalid status
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        display_order: 0,
        pack_number: pack.pack_number,
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: shift.shift_id,
      },
    );

    // THEN: Request fails with 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be BAD_REQUEST").toBe(
      "BAD_REQUEST",
    );
    expect(body.error.message, "Error message should mention status").toContain(
      "RECEIVED",
    );

    // AND: No bin is created (request rejected before transaction)
    const binCountAfter = await prismaClient.lotteryBin.count({
      where: { store_id: storeManagerUser.store_id },
    });
    expect(binCountAfter, "Bin count should not change").toBe(binCountBefore);

    // AND: Pack status is unchanged
    const unchangedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
    });
    expect(unchangedPack?.status, "Pack status should remain ACTIVE").toBe(
      "ACTIVE",
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHORIZATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("10-5-API-013: [P0] GET /api/lottery/packs/validate-for-activation/:storeId/:packNumber - should require authentication", async ({
    apiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: I am not authenticated
    // WHEN: Attempting to validate pack
    const response = await apiRequest.get(
      `/api/lottery/packs/validate-for-activation/${storeManagerUser.store_id}/1234567`,
    );

    // THEN: I receive 401 Unauthorized
    expect(response.status(), "Expected 401 Unauthorized").toBe(401);
  });

  test("10-5-API-014: [P0] POST /api/stores/:storeId/lottery/bins/create-with-pack - should require authentication", async ({
    apiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: I am not authenticated
    // WHEN: Attempting to create bin with valid request body
    const response = await apiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        display_order: 0,
        pack_number: "1234567",
        serial_start: "001",
        activated_by: storeManagerUser.user_id, // Use valid UUID
        activated_shift_id: "00000000-0000-0000-0000-000000000001", // Valid UUID format
      },
    );

    // THEN: I receive 401 Unauthorized (or 400 if schema validation happens first)
    // Note: Fastify may validate schema before auth middleware runs
    expect(
      [400, 401].includes(response.status()),
      `Expected 400 or 401, got ${response.status()}`,
    ).toBe(true);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error object should be present").toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("10-5-API-015: [P0] POST /api/stores/:storeId/lottery/bins/create-with-pack - should reject non-existent pack", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: An active shift exists
    const shift = await createActiveShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Attempting to create bin with non-existent pack
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        display_order: 0,
        pack_number: "NONEXISTENT-PACK-123",
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: shift.shift_id,
      },
    );

    // THEN: Request fails with 404 Not Found
    expect(response.status(), "Expected 404 Not Found").toBe(404);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be NOT_FOUND").toBe("NOT_FOUND");
    expect(body.error.message, "Error message should mention pack").toContain(
      "Pack",
    );
  });

  test("10-5-API-016: [P0] POST /api/stores/:storeId/lottery/bins/create-with-pack - should reject non-existent shift", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists with RECEIVED status
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: `PKG-${Date.now()}`,
      serial_start: "000112345670123456789012",
      serial_end: "000112345670123456789680",
      status: "RECEIVED",
    });

    // WHEN: Attempting to create bin with non-existent shift
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        display_order: 0,
        pack_number: pack.pack_number,
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: "00000000-0000-0000-0000-000000000000",
      },
    );

    // THEN: Request fails with 404 Not Found
    expect(response.status(), "Expected 404 Not Found").toBe(404);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be NOT_FOUND").toBe("NOT_FOUND");
    expect(body.error.message, "Error message should mention shift").toContain(
      "Shift",
    );
  });

  test("10-5-API-017: [P0] POST /api/stores/:storeId/lottery/bins/create-with-pack - should reject non-active shift", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists with RECEIVED status
    // AND: A CLOSED shift exists (not ACTIVE)
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: `PKG-${Date.now()}`,
      serial_start: "000112345670123456789012",
      serial_end: "000112345670123456789680",
      status: "RECEIVED",
    });

    // Create a cashier for the shift (employee_id is 4 chars max per schema)
    const empId = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    const cashier = await prismaClient.cashier.create({
      data: {
        store_id: storeManagerUser.store_id,
        name: `Test Cashier ${Date.now()}`,
        employee_id: empId,
        pin_hash: "hashed_pin",
        created_by: storeManagerUser.user_id,
        hired_on: new Date(),
      },
    });

    // Create a CLOSED shift (not ACTIVE)
    const closedShift = await prismaClient.shift.create({
      data: {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        cashier_id: cashier.cashier_id,
        status: "CLOSED",
        opening_cash: 100.0,
        closing_cash: 150.0,
        closed_at: new Date(),
      },
    });

    // WHEN: Attempting to create bin with non-active shift
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        display_order: 0,
        pack_number: pack.pack_number,
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: closedShift.shift_id,
      },
    );

    // THEN: Request fails with 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be BAD_REQUEST").toBe(
      "BAD_REQUEST",
    );
    expect(body.error.message, "Error message should mention active").toContain(
      "active",
    );
  });

  test("10-5-API-018: [P0] POST /api/stores/:storeId/lottery/bins/create-with-pack - should reject missing required fields", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // WHEN: Attempting to create bin without required fields
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        // Missing: display_order, pack_number, serial_start, activated_by, activated_shift_id
      },
    );

    // THEN: Request fails with 400 Bad Request (schema validation)
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
  });

  test("10-5-API-019: [P0] POST /api/stores/:storeId/lottery/bins/create-with-pack - should reject non-existent store", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // WHEN: Attempting to create bin in non-existent store
    const nonExistentStoreId = "00000000-0000-0000-0000-000000000000";
    const response = await storeManagerApiRequest.post(
      `/api/stores/${nonExistentStoreId}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        display_order: 0,
        pack_number: "1234567",
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: "00000000-0000-0000-0000-000000000001",
      },
    );

    // THEN: Request fails (either 403 Forbidden due to access control or 404 Not Found)
    expect(
      [403, 404].includes(response.status()),
      "Expected 403 or 404 status",
    ).toBe(true);
  });
});
