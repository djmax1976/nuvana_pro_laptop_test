/**
 * Add Bin API Tests - Bin Creation
 *
 * Tests for bin creation endpoint:
 * - POST /api/stores/:storeId/lottery/bins/create-with-pack
 * - Bin creation with pack activation in transaction
 * - Display order auto-assignment
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
    // AND: Existing bins exist (to test auto-assignment of display_order)
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
      game_code: "0001",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "1234567",
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

    // WHEN: Creating bin with pack activation
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 3",
        location: "Front Counter",
        pack_number: pack.pack_number,
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: "shift-123", // Mock shift ID
      },
    );

    // THEN: Bin is created with correct display_order (should be 2, next after existing bins)
    expect(response.status(), "Expected 201 Created status").toBe(201);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.bin, "Response should contain bin").toBeDefined();
    expect(
      body.data.bin.display_order,
      "Display order should be auto-assigned",
    ).toBe(2);
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
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
      game_code: "0001",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "1234567",
      serial_start: "000112345670123456789012",
      serial_end: "000112345670123456789680",
      status: "RECEIVED",
    });

    // WHEN: Creating bin with pack activation
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        pack_number: pack.pack_number,
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: "shift-123",
      },
    );

    // THEN: Pack status is updated to ACTIVE
    expect(response.status(), "Expected 201 Created status").toBe(201);
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
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
      game_code: "0001",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "1234567",
      serial_start: "000112345670123456789012",
      serial_end: "000112345670123456789680",
      status: "RECEIVED",
    });
    const shiftId = "shift-123";

    // WHEN: Creating bin with pack activation
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        pack_number: pack.pack_number,
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: shiftId,
      },
    );

    // THEN: Pack has activated_by and activated_shift_id set
    expect(response.status(), "Expected 201 Created status").toBe(201);
    const updatedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
    });
    expect(updatedPack?.activated_by, "activated_by should be set").toBe(
      storeManagerUser.user_id,
    );
    expect(
      updatedPack?.activated_shift_id,
      "activated_shift_id should be set",
    ).toBe(shiftId);
  });

  test("10-5-API-009: [P0] POST /api/stores/:storeId/lottery/bins/create-with-pack - should create LotteryShiftOpening record (AC #5)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists with RECEIVED status
    // AND: A shift exists
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
      game_code: "0001",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "1234567",
      serial_start: "000112345670123456789012",
      serial_end: "000112345670123456789680",
      status: "RECEIVED",
    });

    // Create a cashier first for the shift
    const cashier = await prismaClient.cashier.create({
      data: {
        store_id: storeManagerUser.store_id,
        name: "Test Cashier",
        employee_id: `EMP-${Date.now()}`,
        pin_hash: "hashed_pin",
        created_by: storeManagerUser.user_id,
        hired_on: new Date(),
      },
    });

    // Create a shift for testing
    const shift = await prismaClient.shift.create({
      data: {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        cashier_id: cashier.cashier_id,
        status: "OPEN",
        opening_cash: 100.0,
      },
    });

    // WHEN: Creating bin with pack activation
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        pack_number: pack.pack_number,
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: shift.shift_id,
      },
    );

    // THEN: LotteryShiftOpening record is created
    expect(response.status(), "Expected 201 Created status").toBe(201);
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
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
      game_code: "0001",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "1234567",
      serial_start: "000112345670123456789012",
      serial_end: "000112345670123456789680",
      status: "RECEIVED",
    });

    // WHEN: Creating bin with pack activation
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        pack_number: pack.pack_number,
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: "shift-123",
      },
    );

    // THEN: LotteryPackBinHistory record is created
    expect(response.status(), "Expected 201 Created status").toBe(201);
    const body = await response.json();
    const binId = body.data.bin.bin_id;

    const history = await prismaClient.lotteryPackBinHistory.findFirst({
      where: {
        pack_id: pack.pack_id,
        bin_id: binId,
      },
    });
    expect(history, "LotteryPackBinHistory should exist").toBeDefined();
  });

  test("10-5-API-011: [P0] POST /api/stores/:storeId/lottery/bins/create-with-pack - should create AuditLog entry (AC #5)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists with RECEIVED status
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
      game_code: "0001",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "1234567",
      serial_start: "000112345670123456789012",
      serial_end: "000112345670123456789680",
      status: "RECEIVED",
    });

    // WHEN: Creating bin with pack activation
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        pack_number: pack.pack_number,
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: "shift-123",
      },
    );

    // THEN: AuditLog entry is created
    expect(response.status(), "Expected 201 Created status").toBe(201);
    const body = await response.json();
    const binId = body.data.bin.bin_id;

    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        table_name: "lottery_bin",
        record_id: binId,
        action: "CREATE",
      },
    });
    expect(auditLog, "AuditLog should exist").toBeDefined();
    expect(auditLog?.user_id, "AuditLog user_id should match").toBe(
      storeManagerUser.user_id,
    );
  });

  test("10-5-API-012: [P0] POST /api/stores/:storeId/lottery/bins/create-with-pack - should rollback transaction on error (AC #5)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists but will cause error (e.g., invalid pack status)
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
      game_code: "0001",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "1234567",
      serial_start: "000112345670123456789012",
      serial_end: "000112345670123456789680",
      status: "ACTIVE", // Invalid status - should cause rollback
    });

    // Count existing bins
    const binCountBefore = await prismaClient.lotteryBin.count({
      where: { store_id: storeManagerUser.store_id },
    });

    // WHEN: Attempting to create bin with invalid pack status
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        pack_number: pack.pack_number,
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: "shift-123",
      },
    );

    // THEN: Request fails
    expect(response.status(), "Expected error status").toBeGreaterThanOrEqual(
      400,
    );

    // AND: No bin is created (transaction rolled back)
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
    // WHEN: Attempting to create bin
    const response = await apiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        pack_number: "1234567",
        serial_start: "001",
        activated_by: "user-123",
        activated_shift_id: "shift-123",
      },
    );

    // THEN: I receive 401 Unauthorized
    expect(response.status(), "Expected 401 Unauthorized").toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error object should be present").toBeDefined();
  });
});
