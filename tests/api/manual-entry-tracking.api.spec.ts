/**
 * Manual Entry Tracking API Tests
 *
 * Tests for entry method tracking in shift closing:
 * - POST /api/shifts/:shiftId/lottery/close with entry_method
 * - Manual entry authorization tracking
 * - Audit log entry method recording
 * - Security validation (invalid entry methods, missing authorization fields)
 * - Authorization (requires LOTTERY_SHIFT_CLOSE permission)
 *
 * Permission Requirements:
 * - LOTTERY_SHIFT_CLOSE permission required (CLIENT_OWNER role via clientUser fixture)
 * - STORE_MANAGER role does NOT have this permission
 *
 * @test-level API
 * @justification Tests API contracts and audit trail for lottery shift closing
 * @story 10-4 - Manual Entry Override
 * @priority P0 (Critical - Audit Trail, Financial Reconciliation)
 * @enhanced-by comprehensive-analysis on 2025-12-16
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createLotteryGame,
  createLotteryPack,
  createLotteryBin,
  createLotteryShiftOpening,
} from "../support/factories/lottery.factory";
import { createShift } from "../support/helpers";
import { ShiftStatus, LotteryPackStatus, PrismaClient } from "@prisma/client";

/**
 * Helper to generate unique pack numbers to avoid constraint conflicts in parallel tests
 */
function generateUniquePackNumber(): string {
  return `PACK${Date.now()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

/**
 * Test data interface for lottery closing test setup
 */
interface LotteryClosingTestData {
  shift: { shift_id: string };
  game: { game_id: string };
  bin: { bin_id: string };
  pack: { pack_id: string };
}

/**
 * Helper to create common test data for lottery closing tests
 * Reduces code duplication across test cases
 */
async function createLotteryClosingTestData(
  prismaClient: PrismaClient,
  storeId: string,
  userId: string,
): Promise<LotteryClosingTestData> {
  const shift = await createShift(
    {
      store_id: storeId,
      opened_by: userId,
      status: ShiftStatus.OPEN,
      opening_cash: 100.0,
    },
    prismaClient,
  );

  const game = await createLotteryGame(prismaClient, {
    name: "$5 Powerball",
    price: 5.0,
  });

  const bin = await createLotteryBin(prismaClient, {
    store_id: storeId,
    display_order: 0,
    name: "Bin 1",
  });

  const pack = await createLotteryPack(prismaClient, {
    game_id: game.game_id,
    store_id: storeId,
    current_bin_id: bin.bin_id,
    status: LotteryPackStatus.ACTIVE,
    pack_number: generateUniquePackNumber(),
    serial_start: "001",
    serial_end: "150",
  });

  await createLotteryShiftOpening(prismaClient, {
    shift_id: shift.shift_id,
    pack_id: pack.pack_id,
    opening_serial: "045",
  });

  return { shift, game, bin, pack };
}

test.describe("10-4-API: Manual Entry Tracking", () => {
  test("10-4-API-006: should save entry_method as SCAN for scanned entries", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: Open shift with pack (API requires ShiftStatus.OPEN)
    // NOTE: Using clientUser fixture which has CLIENT_OWNER role with LOTTERY_SHIFT_CLOSE permission
    const shift = await createShift(
      {
        store_id: clientUser.store_id,
        opened_by: clientUser.user_id,
        status: ShiftStatus.OPEN,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
    });

    const bin = await createLotteryBin(prismaClient, {
      store_id: clientUser.store_id,
      display_order: 0,
      name: "Bin 1",
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: clientUser.store_id,
      current_bin_id: bin.bin_id,
      status: LotteryPackStatus.ACTIVE,
      pack_number: generateUniquePackNumber(),
      serial_start: "001",
      serial_end: "150",
    });

    await createLotteryShiftOpening(prismaClient, {
      shift_id: shift.shift_id,
      pack_id: pack.pack_id,
      opening_serial: "045",
    });

    // WHEN: Closing shift with scanned entry (data passed directly, not wrapped)
    const response = await clientUserApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/close`,
      {
        closings: [
          {
            bin_id: bin.bin_id,
            pack_id: pack.pack_id,
            ending_serial: "100",
            entry_method: "SCAN",
          },
        ],
        closed_by: clientUser.user_id,
      },
    );

    // THEN: Entry method is saved as SCAN
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      success: true,
      summary: expect.objectContaining({
        packs_closed: expect.any(Number),
        packs_depleted: expect.any(Number),
        total_tickets_sold: expect.any(Number),
        variances: expect.any(Array),
      }),
    });

    // AND: Database record has entry_method = 'SCAN'
    const closing = await prismaClient.lotteryShiftClosing.findFirst({
      where: {
        shift_id: shift.shift_id,
        pack_id: pack.pack_id,
      },
    });

    expect(closing?.entry_method).toBe("SCAN");
    expect(closing?.manual_entry_authorized_by).toBeNull();
    expect(closing?.manual_entry_authorized_at).toBeNull();
  });

  test("10-4-API-007: should save entry_method as MANUAL with authorization tracking", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: Open shift with pack and authorized user (API requires ShiftStatus.OPEN)
    // NOTE: Using clientUser fixture which has CLIENT_OWNER role with LOTTERY_SHIFT_CLOSE permission
    const shift = await createShift(
      {
        store_id: clientUser.store_id,
        opened_by: clientUser.user_id,
        status: ShiftStatus.OPEN,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
    });

    const bin = await createLotteryBin(prismaClient, {
      store_id: clientUser.store_id,
      display_order: 0,
      name: "Bin 1",
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: clientUser.store_id,
      current_bin_id: bin.bin_id,
      status: LotteryPackStatus.ACTIVE,
      pack_number: generateUniquePackNumber(),
      serial_start: "001",
      serial_end: "150",
    });

    await createLotteryShiftOpening(prismaClient, {
      shift_id: shift.shift_id,
      pack_id: pack.pack_id,
      opening_serial: "045",
    });

    const authorizedBy = clientUser.user_id; // Client Owner with permission
    const authorizedAt = new Date().toISOString();

    // WHEN: Closing shift with manual entry (data passed directly)
    const response = await clientUserApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/close`,
      {
        closings: [
          {
            bin_id: bin.bin_id,
            pack_id: pack.pack_id,
            ending_serial: "100",
            entry_method: "MANUAL",
            manual_entry_authorized_by: authorizedBy,
            manual_entry_authorized_at: authorizedAt,
          },
        ],
        closed_by: clientUser.user_id,
      },
    );

    // THEN: Entry method is saved as MANUAL with authorization
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      success: true,
      summary: expect.objectContaining({
        packs_closed: expect.any(Number),
      }),
    });

    // AND: Database record has entry_method = 'MANUAL' with authorization
    const closing = await prismaClient.lotteryShiftClosing.findFirst({
      where: {
        shift_id: shift.shift_id,
        pack_id: pack.pack_id,
      },
    });

    expect(closing?.entry_method).toBe("MANUAL");
    expect(closing?.manual_entry_authorized_by).toBe(authorizedBy);
    expect(closing?.manual_entry_authorized_at).not.toBeNull();
  });

  test("10-4-API-008: should include entry method in audit log", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: Open shift with pack (API requires ShiftStatus.OPEN)
    // NOTE: Using clientUser fixture which has CLIENT_OWNER role with LOTTERY_SHIFT_CLOSE permission
    const shift = await createShift(
      {
        store_id: clientUser.store_id,
        opened_by: clientUser.user_id,
        status: ShiftStatus.OPEN,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
    });

    const bin = await createLotteryBin(prismaClient, {
      store_id: clientUser.store_id,
      display_order: 0,
      name: "Bin 1",
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: clientUser.store_id,
      current_bin_id: bin.bin_id,
      status: LotteryPackStatus.ACTIVE,
      pack_number: generateUniquePackNumber(),
      serial_start: "001",
      serial_end: "150",
    });

    await createLotteryShiftOpening(prismaClient, {
      shift_id: shift.shift_id,
      pack_id: pack.pack_id,
      opening_serial: "045",
    });

    // WHEN: Closing shift with manual entry (data passed directly)
    const response = await clientUserApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/close`,
      {
        closings: [
          {
            bin_id: bin.bin_id,
            pack_id: pack.pack_id,
            ending_serial: "100",
            entry_method: "MANUAL",
            manual_entry_authorized_by: clientUser.user_id,
            manual_entry_authorized_at: new Date().toISOString(),
          },
        ],
        closed_by: clientUser.user_id,
      },
    );

    // THEN: Audit log includes entry method
    expect(response.status()).toBe(200);

    // Verify the closing record was created
    const closingRecord = await prismaClient.lotteryShiftClosing.findFirst({
      where: {
        shift_id: shift.shift_id,
        pack_id: pack.pack_id,
      },
    });
    expect(closingRecord).toBeDefined();

    // AND: Audit log entry has entry_method field in new_values
    // The implementation uses action: "LOTTERY_SHIFT_CLOSING_CREATED" (not "CREATE")
    // IMPORTANT: The implementation stores record_id as pack_id (not closing_id)
    // because pack_id is the business-relevant identifier for lottery closings
    // Filter by user_id and record_id to ensure we get the correct audit log in parallel test runs
    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        table_name: "lottery_shift_closings",
        action: "LOTTERY_SHIFT_CLOSING_CREATED",
        user_id: clientUser.user_id,
        record_id: pack.pack_id, // Implementation uses pack_id as record_id
      },
      orderBy: {
        timestamp: "desc",
      },
    });

    // Verify audit log exists and has required structure
    expect(auditLog).toBeDefined();
    expect(auditLog).toHaveProperty("table_name");
    expect(auditLog).toHaveProperty("action");
    expect(auditLog).toHaveProperty("timestamp");
    expect(auditLog).toHaveProperty("new_values");

    // Assertion: table_name should match
    expect(auditLog?.table_name).toBe("lottery_shift_closings");

    // Assertion: Action should be the custom action
    expect(auditLog?.action).toBe("LOTTERY_SHIFT_CLOSING_CREATED");

    // Verify entry method is recorded in new_values
    const newValues = auditLog?.new_values as Record<string, unknown> | null;
    expect(newValues).toBeDefined();
    expect(newValues?.entry_method).toBe("MANUAL");
    expect(newValues?.manual_entry_authorized_by).toBe(clientUser.user_id);
  });

  // ============================================================================
  // 🔒 SECURITY TESTS (Mandatory - Applied Automatically)
  // ============================================================================

  test("10-4-API-SEC-009: should reject invalid entry_method enum value", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: Open shift with pack (API requires ShiftStatus.OPEN)
    // NOTE: Using clientUser fixture which has CLIENT_OWNER role with LOTTERY_SHIFT_CLOSE permission
    const shift = await createShift(
      {
        store_id: clientUser.store_id,
        opened_by: clientUser.user_id,
        status: ShiftStatus.OPEN,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
    });

    const bin = await createLotteryBin(prismaClient, {
      store_id: clientUser.store_id,
      display_order: 0,
      name: "Bin 1",
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: clientUser.store_id,
      current_bin_id: bin.bin_id,
      status: LotteryPackStatus.ACTIVE,
      pack_number: generateUniquePackNumber(),
      serial_start: "001",
      serial_end: "150",
    });

    await createLotteryShiftOpening(prismaClient, {
      shift_id: shift.shift_id,
      pack_id: pack.pack_id,
      opening_serial: "045",
    });

    // GIVEN: Invalid entry_method values (strings that are not "SCAN" or "MANUAL")
    // Note: The API schema requires entry_method, and only accepts "SCAN" or "MANUAL"
    const invalidEntryMethods = ["INVALID", "SCANNED", "MANUAL_ENTRY", ""];

    for (const invalidMethod of invalidEntryMethods) {
      // WHEN: Attempting to close shift with invalid entry_method (data passed directly)
      const response = await clientUserApiRequest.post(
        `/api/shifts/${shift.shift_id}/lottery/close`,
        {
          closings: [
            {
              bin_id: bin.bin_id,
              pack_id: pack.pack_id,
              ending_serial: "100",
              entry_method: invalidMethod,
            },
          ],
          closed_by: clientUser.user_id,
        },
      );

      // THEN: Invalid string values should be rejected with 400 (schema validation)
      // or 500 (service-level validation)
      expect([400, 500]).toContain(response.status());
      const body = await response.json();
      expect(body).toHaveProperty("success", false);
      expect(body).toHaveProperty("error");
    }
  });

  test("10-4-API-SEC-010: should validate manual entry authorization fields", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: Open shift with pack (API requires ShiftStatus.OPEN)
    // NOTE: Using clientUser fixture which has CLIENT_OWNER role with LOTTERY_SHIFT_CLOSE permission
    const shift = await createShift(
      {
        store_id: clientUser.store_id,
        opened_by: clientUser.user_id,
        status: ShiftStatus.OPEN,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
    });

    const bin = await createLotteryBin(prismaClient, {
      store_id: clientUser.store_id,
      display_order: 0,
      name: "Bin 1",
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: clientUser.store_id,
      current_bin_id: bin.bin_id,
      status: LotteryPackStatus.ACTIVE,
      pack_number: generateUniquePackNumber(),
      serial_start: "001",
      serial_end: "150",
    });

    await createLotteryShiftOpening(prismaClient, {
      shift_id: shift.shift_id,
      pack_id: pack.pack_id,
      opening_serial: "045",
    });

    // WHEN: MANUAL entry_method without authorization fields (data passed directly)
    const response = await clientUserApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/close`,
      {
        closings: [
          {
            bin_id: bin.bin_id,
            pack_id: pack.pack_id,
            ending_serial: "100",
            entry_method: "MANUAL",
            // Missing: manual_entry_authorized_by
            // Missing: manual_entry_authorized_at
          },
        ],
        closed_by: clientUser.user_id,
      },
    );

    // THEN: Request should be rejected with 400 (BAD_REQUEST)
    // The route validation explicitly checks for these fields when entry_method is MANUAL
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty("success", false);
    expect(body).toHaveProperty("error");
    // Verify error message mentions the missing authorization fields
    expect(body.error.message).toContain("manual_entry_authorized");
  });

  // ============================================================================
  // ✅ ENHANCED ASSERTIONS (Best Practices - Applied Automatically)
  // ============================================================================

  test("10-4-API-ASSERT-002: should return correct response structure for shift closing", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: Open shift with pack (API requires ShiftStatus.OPEN)
    // NOTE: Using clientUser fixture which has CLIENT_OWNER role with LOTTERY_SHIFT_CLOSE permission
    const shift = await createShift(
      {
        store_id: clientUser.store_id,
        opened_by: clientUser.user_id,
        status: ShiftStatus.OPEN,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
    });

    const bin = await createLotteryBin(prismaClient, {
      store_id: clientUser.store_id,
      display_order: 0,
      name: "Bin 1",
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: clientUser.store_id,
      current_bin_id: bin.bin_id,
      status: LotteryPackStatus.ACTIVE,
      pack_number: generateUniquePackNumber(),
      serial_start: "001",
      serial_end: "150",
    });

    await createLotteryShiftOpening(prismaClient, {
      shift_id: shift.shift_id,
      pack_id: pack.pack_id,
      opening_serial: "045",
    });

    // WHEN: Closing shift (data passed directly)
    const response = await clientUserApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/close`,
      {
        closings: [
          {
            bin_id: bin.bin_id,
            pack_id: pack.pack_id,
            ending_serial: "100",
            entry_method: "SCAN",
          },
        ],
        closed_by: clientUser.user_id,
      },
    );

    // THEN: Response has correct structure and types
    expect(response.status()).toBe(200);
    const body = await response.json();

    // Assertion: Response has success property (boolean)
    expect(body).toHaveProperty("success");
    expect(typeof body.success).toBe("boolean");
    expect(body.success).toBe(true);

    // Assertion: Response has summary with correct structure
    expect(body).toHaveProperty("summary");
    expect(body.summary).toHaveProperty("packs_closed");
    expect(body.summary).toHaveProperty("packs_depleted");
    expect(body.summary).toHaveProperty("total_tickets_sold");
    expect(body.summary).toHaveProperty("variances");

    // Assertion: Summary fields have correct types
    expect(typeof body.summary.packs_closed).toBe("number");
    expect(typeof body.summary.packs_depleted).toBe("number");
    expect(typeof body.summary.total_tickets_sold).toBe("number");
    expect(Array.isArray(body.summary.variances)).toBe(true);

    // Assertion: Response should not contain sensitive data
    expect(JSON.stringify(body)).not.toContain("pin_hash");
    expect(JSON.stringify(body)).not.toContain("password");
  });

  // ============================================================================
  // 📊 BUSINESS LOGIC TESTS (Pack Status During Shift Closing)
  // ============================================================================
  // DESIGN NOTE: Pack depletion is NOT automatically triggered during shift close.
  // Packs are only marked as DEPLETED through explicit user actions:
  // 1. Manual "Mark Sold Out" button
  // 2. "Bins Need Attention" modal → Sold Out checkbox
  // 3. Auto-replace when new pack is activated in the same bin
  // This prevents accidental depletion when ending serial happens to match serial_end.
  // ============================================================================

  test("10-4-API-BIZ-001: should NOT auto-deplete pack when ending_serial equals serial_end (by design)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: Open shift with pack that has serial_end = "150"
    const testData = await createLotteryClosingTestData(
      prismaClient,
      clientUser.store_id,
      clientUser.user_id,
    );

    // WHEN: Closing shift with ending_serial = "150" (matches serial_end)
    // NOTE: Per implementation design, this should NOT auto-deplete the pack.
    // Depletion requires explicit user action (Mark Sold Out, Bins Attention modal, etc.)
    const response = await clientUserApiRequest.post(
      `/api/shifts/${testData.shift.shift_id}/lottery/close`,
      {
        closings: [
          {
            bin_id: testData.bin.bin_id,
            pack_id: testData.pack.pack_id,
            ending_serial: "150", // Equals serial_end - but should NOT trigger auto-depletion
            entry_method: "SCAN",
          },
        ],
        closed_by: clientUser.user_id,
      },
    );

    // THEN: Response indicates successful close but NO auto-depletion
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    // packs_depleted only counts packs that were ALREADY depleted via explicit action
    expect(body.summary.packs_depleted).toBe(0);
    expect(body.summary.packs_closed).toBe(1);

    // AND: Pack status remains ACTIVE (depletion requires explicit user action)
    const updatedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: testData.pack.pack_id },
    });
    expect(updatedPack?.status).toBe("ACTIVE");
    expect(updatedPack?.depleted_at).toBeNull();

    // AND: Closing record is created correctly
    const closingRecord = await prismaClient.lotteryShiftClosing.findFirst({
      where: {
        shift_id: testData.shift.shift_id,
        pack_id: testData.pack.pack_id,
      },
    });
    expect(closingRecord).not.toBeNull();
    expect(closingRecord?.closing_serial).toBe("150");
    expect(closingRecord?.entry_method).toBe("SCAN");
  });

  test("10-4-API-BIZ-002: should keep pack ACTIVE when ending_serial is less than serial_end", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: Open shift with pack that has serial_end = "150"
    const testData = await createLotteryClosingTestData(
      prismaClient,
      clientUser.store_id,
      clientUser.user_id,
    );

    // WHEN: Closing shift with ending_serial = "100" (less than serial_end)
    const response = await clientUserApiRequest.post(
      `/api/shifts/${testData.shift.shift_id}/lottery/close`,
      {
        closings: [
          {
            bin_id: testData.bin.bin_id,
            pack_id: testData.pack.pack_id,
            ending_serial: "100", // Less than serial_end - pack remains ACTIVE
            entry_method: "SCAN",
          },
        ],
        closed_by: clientUser.user_id,
      },
    );

    // THEN: Response indicates successful close with no depletions
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.summary.packs_depleted).toBe(0);
    expect(body.summary.packs_closed).toBe(1);

    // AND: Pack status remains ACTIVE in database
    const updatedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: testData.pack.pack_id },
    });
    expect(updatedPack?.status).toBe("ACTIVE");
    expect(updatedPack?.depleted_at).toBeNull();

    // AND: Closing record is created with correct ending serial
    const closingRecord = await prismaClient.lotteryShiftClosing.findFirst({
      where: {
        shift_id: testData.shift.shift_id,
        pack_id: testData.pack.pack_id,
      },
    });
    expect(closingRecord).not.toBeNull();
    expect(closingRecord?.closing_serial).toBe("100");
  });

  test("10-4-API-BIZ-003: should count pre-depleted sold packs in packs_depleted summary along with active pack closings", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: A shift with TWO packs:
    // - Pack A: ALREADY DEPLETED during this shift (sold out via "Mark Sold Out")
    // - Pack B: Still ACTIVE and needs manual closing
    const shift = await createShift(
      {
        store_id: clientUser.store_id,
        opened_by: clientUser.user_id,
        status: ShiftStatus.OPEN,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
    });

    const bin1 = await createLotteryBin(prismaClient, {
      store_id: clientUser.store_id,
      display_order: 0,
      name: "Bin 1",
    });

    const bin2 = await createLotteryBin(prismaClient, {
      store_id: clientUser.store_id,
      display_order: 1,
      name: "Bin 2",
    });

    // Get the shift's opened_at time for proper timestamp ordering
    const shiftRecord = await prismaClient.shift.findUnique({
      where: { shift_id: shift.shift_id },
      select: { opened_at: true },
    });
    const shiftOpenedAt = shiftRecord!.opened_at;

    // Create Pack A: ALREADY DEPLETED (simulating explicit Mark Sold Out during shift)
    // Must have: activated_at >= shift.opened_at AND depleted_at >= shift.opened_at
    const activatedAt = new Date(shiftOpenedAt.getTime() + 1000); // 1 second after shift opened
    const depletedAt = new Date(activatedAt.getTime() + 60000); // 1 minute after activation

    const depletedPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: clientUser.store_id,
      current_bin_id: bin1.bin_id,
      status: LotteryPackStatus.DEPLETED,
      pack_number: generateUniquePackNumber(),
      serial_start: "001",
      serial_end: "150",
      activated_at: activatedAt,
      activated_shift_id: shift.shift_id,
      depleted_at: depletedAt,
      depleted_shift_id: shift.shift_id,
      depleted_by: clientUser.user_id,
    });

    await createLotteryShiftOpening(prismaClient, {
      shift_id: shift.shift_id,
      pack_id: depletedPack.pack_id,
      opening_serial: "001", // Started at 001
    });

    // Create Pack B: ACTIVE pack that needs manual closing
    const activePack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: clientUser.store_id,
      current_bin_id: bin2.bin_id,
      status: LotteryPackStatus.ACTIVE,
      pack_number: generateUniquePackNumber(),
      serial_start: "001",
      serial_end: "150",
      activated_at: activatedAt,
      activated_shift_id: shift.shift_id,
    });

    await createLotteryShiftOpening(prismaClient, {
      shift_id: shift.shift_id,
      pack_id: activePack.pack_id,
      opening_serial: "045",
    });

    // WHEN: Closing shift with Pack B closure (Pack A is auto-closed)
    const response = await clientUserApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/close`,
      {
        closings: [
          {
            bin_id: bin2.bin_id,
            pack_id: activePack.pack_id,
            ending_serial: "100", // Partial - not depleted
            entry_method: "SCAN",
          },
        ],
        closed_by: clientUser.user_id,
      },
    );

    // THEN: Response counts both packs
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // Pack A (auto-closed sold pack) counts as depleted
    // Pack B (manual close) does NOT count as depleted (ending < serial_end)
    expect(body.summary.packs_depleted).toBe(1);
    // Both packs are closed: auto-close + manual close
    expect(body.summary.packs_closed).toBe(2);

    // Verify Pack A status remains DEPLETED
    const packA = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: depletedPack.pack_id },
    });
    expect(packA?.status).toBe("DEPLETED");

    // Verify Pack B status remains ACTIVE (not auto-depleted)
    const packB = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: activePack.pack_id },
    });
    expect(packB?.status).toBe("ACTIVE");

    // Verify closing records were created for both packs
    const closings = await prismaClient.lotteryShiftClosing.findMany({
      where: { shift_id: shift.shift_id },
    });
    expect(closings.length).toBe(2);
  });
});
