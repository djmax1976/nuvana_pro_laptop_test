/**
 * Manual Entry Tracking API Tests
 *
 * Tests for entry method tracking in shift closing:
 * - POST /api/shifts/:shiftId/lottery/close with entry_method
 * - Manual entry authorization tracking
 * - Audit log entry method recording
 *
 * @test-level API
 * @justification Tests API contracts and audit trail
 * @story 10-4 - Manual Entry Override
 * @priority P0 (Critical - Audit Trail)
 * @enhanced-by comprehensive-analysis on 2025-12-15
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createLotteryGame,
  createLotteryPack,
  createLotteryBin,
  createLotteryShiftOpening,
} from "../support/factories/lottery.factory";
import { createShift } from "../support/helpers";
import { ShiftStatus, LotteryPackStatus } from "@prisma/client";

/**
 * Helper to generate unique pack numbers to avoid constraint conflicts
 */
function generateUniquePackNumber(): string {
  return `PACK${Date.now()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

test.describe("10-4-API: Manual Entry Tracking", () => {
  test("10-4-API-006: should save entry_method as SCAN for scanned entries", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Open shift with pack (API requires ShiftStatus.OPEN)
    const shift = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
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
      store_id: storeManagerUser.store_id,
      display_order: 0,
      name: "Bin 1",
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
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
    const response = await storeManagerApiRequest.post(
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
        closed_by: storeManagerUser.user_id,
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
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Open shift with pack and authorized user (API requires ShiftStatus.OPEN)
    const shift = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
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
      store_id: storeManagerUser.store_id,
      display_order: 0,
      name: "Bin 1",
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
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

    const authorizedBy = storeManagerUser.user_id; // Shift Manager with permission
    const authorizedAt = new Date().toISOString();

    // WHEN: Closing shift with manual entry (data passed directly)
    const response = await storeManagerApiRequest.post(
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
        closed_by: storeManagerUser.user_id,
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
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Open shift with pack (API requires ShiftStatus.OPEN)
    const shift = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
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
      store_id: storeManagerUser.store_id,
      display_order: 0,
      name: "Bin 1",
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
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
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/close`,
      {
        closings: [
          {
            bin_id: bin.bin_id,
            pack_id: pack.pack_id,
            ending_serial: "100",
            entry_method: "MANUAL",
            manual_entry_authorized_by: storeManagerUser.user_id,
            manual_entry_authorized_at: new Date().toISOString(),
          },
        ],
        closed_by: storeManagerUser.user_id,
      },
    );

    // THEN: Audit log includes entry method
    expect(response.status()).toBe(200);

    // AND: Audit log entry has entry_method field in new_values
    // The implementation uses action: "LOTTERY_SHIFT_CLOSING_CREATED" (not "CREATE")
    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        table_name: "lottery_shift_closings",
        action: "LOTTERY_SHIFT_CLOSING_CREATED",
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
    expect(newValues?.manual_entry_authorized_by).toBe(
      storeManagerUser.user_id,
    );
  });

  // ============================================================================
  // 🔒 SECURITY TESTS (Mandatory - Applied Automatically)
  // ============================================================================

  test("10-4-API-SEC-009: should reject invalid entry_method enum value", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Open shift with pack (API requires ShiftStatus.OPEN)
    const shift = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
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
      store_id: storeManagerUser.store_id,
      display_order: 0,
      name: "Bin 1",
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
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
      const response = await storeManagerApiRequest.post(
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
          closed_by: storeManagerUser.user_id,
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
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Open shift with pack (API requires ShiftStatus.OPEN)
    const shift = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
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
      store_id: storeManagerUser.store_id,
      display_order: 0,
      name: "Bin 1",
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
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
    const response = await storeManagerApiRequest.post(
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
        closed_by: storeManagerUser.user_id,
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
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Open shift with pack (API requires ShiftStatus.OPEN)
    const shift = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
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
      store_id: storeManagerUser.store_id,
      display_order: 0,
      name: "Bin 1",
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
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
    const response = await storeManagerApiRequest.post(
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
        closed_by: storeManagerUser.user_id,
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
});
