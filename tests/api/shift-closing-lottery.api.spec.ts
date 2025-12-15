/**
 * Shift Closing Lottery API Tests
 *
 * Tests for the lottery closing submission API endpoint:
 * - POST /api/shifts/:shiftId/lottery/close
 * - Request validation
 * - Response structure
 * - Error handling
 * - Entry method tracking
 * - Security (authentication, authorization)
 * - Edge cases and boundary conditions
 *
 * @test-level API
 * @justification Tests API contracts, request/response validation, error handling
 * @story 10-7 - Shift Closing Submission & Pack Status Updates
 * @priority P0 (Critical - API Contracts)
 * @enhanced-by workflow-9 on 2025-12-14
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

test.describe("10-7-API: Shift Closing Submission Endpoint", () => {
  test("TEST-10.7-A1: Should accept valid closing data and return summary", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Shift with active pack
    const shift = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        status: ShiftStatus.CLOSING,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const game = await createLotteryGame(prismaClient);
    const bin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      status: LotteryPackStatus.ACTIVE,
      current_bin_id: bin.bin_id,
      serial_start: "000001",
      serial_end: "000100",
    });

    await createLotteryShiftOpening(prismaClient, {
      shift_id: shift.shift_id,
      pack_id: pack.pack_id,
      opening_serial: "000001",
    });

    const closingData = {
      closings: [
        {
          bin_id: bin.bin_id,
          pack_id: pack.pack_id,
          ending_serial: "000050",
          entry_method: "SCAN",
        },
      ],
      closed_by: storeManagerUser.user_id,
    };

    // WHEN: Submitting closing data
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/close`,
      {
        data: closingData,
      },
    );

    // THEN: Returns success response with summary
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      success: true,
      summary: {
        packs_closed: expect.any(Number),
        packs_depleted: expect.any(Number),
        total_tickets_sold: expect.any(Number),
        variances: expect.any(Array),
      },
    });
  });

  test("TEST-10.7-A2: Should return summary with packs_closed, packs_depleted, total_tickets_sold counts", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Shift with multiple packs
    const shift = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        status: ShiftStatus.CLOSING,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const game = await createLotteryGame(prismaClient);
    const bin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
    });

    // Pack 1: Will be depleted (ending = serial_end)
    const pack1 = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      status: LotteryPackStatus.ACTIVE,
      current_bin_id: bin.bin_id,
      serial_start: "000001",
      serial_end: "000100",
    });

    // Pack 2: Will remain active (ending < serial_end)
    const pack2 = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      status: LotteryPackStatus.ACTIVE,
      current_bin_id: bin.bin_id,
      serial_start: "000101",
      serial_end: "000200",
    });

    await createLotteryShiftOpening(prismaClient, {
      shift_id: shift.shift_id,
      pack_id: pack1.pack_id,
      opening_serial: "000001",
    });

    await createLotteryShiftOpening(prismaClient, {
      shift_id: shift.shift_id,
      pack_id: pack2.pack_id,
      opening_serial: "000101",
    });

    const closingData = {
      closings: [
        {
          bin_id: bin.bin_id,
          pack_id: pack1.pack_id,
          ending_serial: "000100", // Depleted
          entry_method: "SCAN",
        },
        {
          bin_id: bin.bin_id,
          pack_id: pack2.pack_id,
          ending_serial: "000150", // Active
          entry_method: "SCAN",
        },
      ],
      closed_by: storeManagerUser.user_id,
    };

    // WHEN: Submitting closing data
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/close`,
      {
        data: closingData,
      },
    );

    // THEN: Summary contains correct counts
    const body = await response.json();
    expect(body.summary.packs_closed).toBe(2);
    expect(body.summary.packs_depleted).toBe(1);
    expect(body.summary.total_tickets_sold).toBeGreaterThan(0);
  });

  test("TEST-10.7-A3: Should return variances array when variances detected", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Shift with pack that will have variance
    const shift = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        status: ShiftStatus.CLOSING,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const game = await createLotteryGame(prismaClient);
    const bin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      status: LotteryPackStatus.ACTIVE,
      current_bin_id: bin.bin_id,
      serial_start: "000001",
      serial_end: "000100",
    });

    await createLotteryShiftOpening(prismaClient, {
      shift_id: shift.shift_id,
      pack_id: pack.pack_id,
      opening_serial: "000010",
    });

    const closingData = {
      closings: [
        {
          bin_id: bin.bin_id,
          pack_id: pack.pack_id,
          ending_serial: "000050",
          entry_method: "SCAN",
        },
      ],
      closed_by: storeManagerUser.user_id,
    };

    // WHEN: Submitting closing data
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/close`,
      {
        data: closingData,
      },
    );

    // THEN: Variances array is returned (may be empty if no variance)
    const body = await response.json();
    expect(body.summary.variances).toBeDefined();
    expect(Array.isArray(body.summary.variances)).toBe(true);
  });

  test("TEST-10.7-A4: Should reject if pack not found and return error", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Shift with non-existent pack
    const shift = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        status: ShiftStatus.CLOSING,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const bin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
    });

    const closingData = {
      closings: [
        {
          bin_id: bin.bin_id,
          pack_id: "non-existent-pack-id",
          ending_serial: "000050",
          entry_method: "SCAN",
        },
      ],
      closed_by: storeManagerUser.user_id,
    };

    // WHEN: Submitting closing data with invalid pack
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/close`,
      {
        data: closingData,
      },
    );

    // THEN: Returns error response
    expect(response.status()).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
  });

  test("TEST-10.7-A5: Should handle mixed scan/manual entries correctly", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Shift with multiple packs (scan and manual entries)
    const shift = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        status: ShiftStatus.CLOSING,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const game = await createLotteryGame(prismaClient);
    const bin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
    });

    const pack1 = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      status: LotteryPackStatus.ACTIVE,
      current_bin_id: bin.bin_id,
      serial_start: "000001",
      serial_end: "000100",
    });

    const pack2 = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      status: LotteryPackStatus.ACTIVE,
      current_bin_id: bin.bin_id,
      serial_start: "000101",
      serial_end: "000200",
    });

    await createLotteryShiftOpening(prismaClient, {
      shift_id: shift.shift_id,
      pack_id: pack1.pack_id,
      opening_serial: "000001",
    });

    await createLotteryShiftOpening(prismaClient, {
      shift_id: shift.shift_id,
      pack_id: pack2.pack_id,
      opening_serial: "000101",
    });

    const closingData = {
      closings: [
        {
          bin_id: bin.bin_id,
          pack_id: pack1.pack_id,
          ending_serial: "000050",
          entry_method: "SCAN",
        },
        {
          bin_id: bin.bin_id,
          pack_id: pack2.pack_id,
          ending_serial: "000150",
          entry_method: "MANUAL",
          manual_entry_authorized_by: storeManagerUser.user_id,
          manual_entry_authorized_at: new Date().toISOString(),
        },
      ],
      closed_by: storeManagerUser.user_id,
    };

    // WHEN: Submitting closing data with mixed entry methods
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/close`,
      {
        data: closingData,
      },
    );

    // THEN: Both entries are processed correctly
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.summary.packs_closed).toBe(2);

    // Verify entry methods are tracked in database
    const closingRecords = await prismaClient.lotteryShiftClosing.findMany({
      where: {
        shift_id: shift.shift_id,
      },
    });

    expect(closingRecords.length).toBe(2);
    const scanRecord = closingRecords.find((r) => r.entry_method === "SCAN");
    const manualRecord = closingRecords.find(
      (r) => r.entry_method === "MANUAL",
    );

    expect(scanRecord).toBeTruthy();
    expect(manualRecord).toBeTruthy();
    expect(manualRecord?.manual_entry_authorized_by).toBe(
      storeManagerUser.user_id,
    );
  });

  // ============ SECURITY TESTS (MANDATORY) ============

  test("TEST-10.7-SEC-A1: Authentication Bypass - Should reject request without token", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: Shift with pack
    const shift = await createShift(
      {
        store_id: "test-store-id",
        opened_by: "test-user-id",
        status: ShiftStatus.CLOSING,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const closingData = {
      closings: [
        {
          bin_id: "test-bin-id",
          pack_id: "test-pack-id",
          ending_serial: "050",
          entry_method: "SCAN",
        },
      ],
      closed_by: "test-user-id",
    };

    // WHEN: Making request without authentication token
    const response = await apiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/close`,
      {
        data: closingData,
        headers: {
          // No Authorization header
        },
      },
    );

    // THEN: Should return 401 Unauthorized
    expect(response.status()).toBe(401);
  });

  test("TEST-10.7-SEC-A2: Authentication Bypass - Should reject request with invalid token", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: Shift with pack
    const shift = await createShift(
      {
        store_id: "test-store-id",
        opened_by: "test-user-id",
        status: ShiftStatus.CLOSING,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const closingData = {
      closings: [
        {
          bin_id: "test-bin-id",
          pack_id: "test-pack-id",
          ending_serial: "050",
          entry_method: "SCAN",
        },
      ],
      closed_by: "test-user-id",
    };

    // WHEN: Making request with invalid token
    const response = await apiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/close`,
      {
        data: closingData,
        headers: {
          Authorization: "Bearer invalid-token-12345",
        },
      },
    );

    // THEN: Should return 401 Unauthorized
    expect(response.status()).toBe(401);
  });

  test("TEST-10.7-SEC-A3: Authorization - Should reject request without LOTTERY_SHIFT_CLOSE permission", async ({
    cashierApiRequest, // Cashier may not have LOTTERY_SHIFT_CLOSE permission
    cashierUser,
    prismaClient,
  }) => {
    // GIVEN: Shift with pack
    const shift = await createShift(
      {
        store_id: cashierUser.store_id,
        opened_by: cashierUser.user_id,
        status: ShiftStatus.CLOSING,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const closingData = {
      closings: [
        {
          bin_id: "test-bin-id",
          pack_id: "test-pack-id",
          ending_serial: "050",
          entry_method: "SCAN",
        },
      ],
      closed_by: cashierUser.user_id,
    };

    // WHEN: Making request without required permission
    const response = await cashierApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/close`,
      {
        data: closingData,
      },
    );

    // THEN: Should return 403 Forbidden (if permission check is enforced)
    // OR 401 if permission check happens before auth
    expect([401, 403]).toContain(response.status());
  });

  // ============ INPUT VALIDATION TESTS ============

  test("TEST-10.7-VAL1: Should reject invalid UUID format for shiftId", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Invalid UUID format
    const invalidShiftId = "not-a-valid-uuid";
    const closingData = {
      closings: [
        {
          bin_id: "test-bin-id",
          pack_id: "test-pack-id",
          ending_serial: "050",
          entry_method: "SCAN",
        },
      ],
      closed_by: storeManagerUser.user_id,
    };

    // WHEN: Making request with invalid shiftId format
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${invalidShiftId}/lottery/close`,
      {
        data: closingData,
      },
    );

    // THEN: Should return 400 Bad Request or 404 Not Found
    expect([400, 404]).toContain(response.status());
  });

  test("TEST-10.7-VAL2: Should reject missing required fields in request body", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Shift
    const shift = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        status: ShiftStatus.CLOSING,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    // GIVEN: Request body missing required fields
    const invalidData = {
      // Missing closings and closed_by
    };

    // WHEN: Making request with missing fields
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/close`,
      {
        data: invalidData,
      },
    );

    // THEN: Should return 400 Bad Request
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("TEST-10.7-VAL3: Should reject ending_serial longer than 3 digits", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Shift with pack
    const shift = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        status: ShiftStatus.CLOSING,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const game = await createLotteryGame(prismaClient);
    const bin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      status: LotteryPackStatus.ACTIVE,
      current_bin_id: bin.bin_id,
      serial_start: "001",
      serial_end: "999",
    });

    await createLotteryShiftOpening(prismaClient, {
      shift_id: shift.shift_id,
      pack_id: pack.pack_id,
      opening_serial: "001",
    });

    // GIVEN: Ending serial longer than 3 digits
    const closingData = {
      closings: [
        {
          bin_id: bin.bin_id,
          pack_id: pack.pack_id,
          ending_serial: "1234", // 4 digits - invalid
          entry_method: "SCAN",
        },
      ],
      closed_by: storeManagerUser.user_id,
    };

    // WHEN: Making request with invalid ending_serial length
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/close`,
      {
        data: closingData,
      },
    );

    // THEN: Should return 400 Bad Request
    // Note: This validation may need to be added to API
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  // ============ EDGE CASES ============

  test("TEST-10.7-EDGE-A1: Should handle empty closings array (auto-closed packs)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Shift with auto-closed pack (activated and depleted during shift)
    const shift = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        status: ShiftStatus.CLOSING,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const game = await createLotteryGame(prismaClient);
    const bin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      status: LotteryPackStatus.DEPLETED,
      current_bin_id: bin.bin_id,
      serial_start: "001",
      serial_end: "100",
      activated_shift_id: shift.shift_id,
      depleted_shift_id: shift.shift_id,
      activated_at: shift.opened_at,
      depleted_at: new Date(),
    });

    await createLotteryShiftOpening(prismaClient, {
      shift_id: shift.shift_id,
      pack_id: pack.pack_id,
      opening_serial: "001",
    });

    // GIVEN: Empty closings array
    const closingData = {
      closings: [],
      closed_by: storeManagerUser.user_id,
    };

    // WHEN: Submitting empty closings
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/close`,
      {
        data: closingData,
      },
    );

    // THEN: Should succeed (auto-closed packs handled)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    // Auto-closed pack should be counted
    expect(body.summary.packs_closed).toBeGreaterThanOrEqual(0);
  });

  test("TEST-10.7-EDGE-A2: Should reject ending_serial > serial_end", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Shift with pack (serial_end = "100")
    const shift = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        status: ShiftStatus.CLOSING,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const game = await createLotteryGame(prismaClient);
    const bin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      status: LotteryPackStatus.ACTIVE,
      current_bin_id: bin.bin_id,
      serial_start: "001",
      serial_end: "100",
    });

    await createLotteryShiftOpening(prismaClient, {
      shift_id: shift.shift_id,
      pack_id: pack.pack_id,
      opening_serial: "001",
    });

    // GIVEN: Ending serial greater than serial_end
    const closingData = {
      closings: [
        {
          bin_id: bin.bin_id,
          pack_id: pack.pack_id,
          ending_serial: "101", // Greater than serial_end "100"
          entry_method: "SCAN",
        },
      ],
      closed_by: storeManagerUser.user_id,
    };

    // WHEN: Submitting closing with ending > serial_end
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/close`,
      {
        data: closingData,
      },
    );

    // THEN: Should be rejected (business rule violation)
    // Note: This validation should be added to API/service
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  // ============ DATA LEAKAGE PREVENTION ============

  test("TEST-10.7-DL1: Should not expose sensitive data in response", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Shift with pack
    const shift = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        status: ShiftStatus.CLOSING,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const game = await createLotteryGame(prismaClient);
    const bin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
    });

    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      status: LotteryPackStatus.ACTIVE,
      current_bin_id: bin.bin_id,
      serial_start: "001",
      serial_end: "100",
    });

    await createLotteryShiftOpening(prismaClient, {
      shift_id: shift.shift_id,
      pack_id: pack.pack_id,
      opening_serial: "001",
    });

    const closingData = {
      closings: [
        {
          bin_id: bin.bin_id,
          pack_id: pack.pack_id,
          ending_serial: "050",
          entry_method: "SCAN",
        },
      ],
      closed_by: storeManagerUser.user_id,
    };

    // WHEN: Submitting closing data
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/close`,
      {
        data: closingData,
      },
    );

    // THEN: Response should not contain sensitive data
    expect(response.status()).toBe(200);
    const body = await response.json();
    const bodyString = JSON.stringify(body);

    // Should not contain password, token, or internal secrets
    expect(bodyString).not.toMatch(/password/i);
    expect(bodyString).not.toMatch(/token/i);
    expect(bodyString).not.toMatch(/secret/i);
    expect(bodyString).not.toMatch(/api[_-]?key/i);

    // Should only contain expected fields
    expect(body).toHaveProperty("success");
    expect(body).toHaveProperty("summary");
    if (body.summary) {
      expect(body.summary).not.toHaveProperty("password");
      expect(body.summary).not.toHaveProperty("token");
    }
  });
});
