/**
 * Add Bin API Tests - Edge Cases
 *
 * Tests for input validation edge cases:
 * - Empty inputs
 * - Maximum length inputs
 * - Invalid formats (UUIDs, negative numbers)
 * - Invalid pack statuses
 *
 * @test-level API
 * @justification Tests input validation and boundary conditions
 * @story 10-5 - Add Bin Functionality
 * @priority P1 (High - Input validation)
 */

import { test, expect } from "../../support/fixtures/rbac.fixture";
import {
  createLotteryGame,
  createLotteryPack,
} from "../../support/factories/lottery.factory";

test.describe("10-5-API: Edge Cases", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // INPUT VALIDATION EDGE CASES (Applied Automatically)
  // ═══════════════════════════════════════════════════════════════════════════

  test("10-5-API-EDGE-001: [P1] POST /api/stores/:storeId/lottery/bins/create-with-pack - should reject empty bin_name", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists
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

    // WHEN: Creating bin with empty bin_name
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "",
        pack_number: pack.pack_number,
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: "shift-123",
      },
    );

    // THEN: Request fails with validation error
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error object should be present").toBeDefined();
  });

  test("10-5-API-EDGE-002: [P1] POST /api/stores/:storeId/lottery/bins/create-with-pack - should reject bin_name exceeding max length (255)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists
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

    // WHEN: Creating bin with bin_name exceeding 255 characters
    const longBinName = "A".repeat(256);
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: longBinName,
        pack_number: pack.pack_number,
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: "shift-123",
      },
    );

    // THEN: Request fails with validation error
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("10-5-API-EDGE-003: [P1] POST /api/stores/:storeId/lottery/bins/create-with-pack - should reject location exceeding max length (255)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists
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

    // WHEN: Creating bin with location exceeding 255 characters
    const longLocation = "A".repeat(256);
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        location: longLocation,
        pack_number: pack.pack_number,
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: "shift-123",
      },
    );

    // THEN: Request fails with validation error
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("10-5-API-EDGE-004: [P1] POST /api/stores/:storeId/lottery/bins/create-with-pack - should reject negative display_order", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists
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

    // WHEN: Creating bin with negative display_order
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        display_order: -1,
        pack_number: pack.pack_number,
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: "shift-123",
      },
    );

    // THEN: Request fails with validation error
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("10-5-API-EDGE-005: [P1] POST /api/stores/:storeId/lottery/bins/create-with-pack - should reject invalid UUID in activated_by", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists
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

    // WHEN: Creating bin with invalid UUID
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        pack_number: pack.pack_number,
        serial_start: "001",
        activated_by: "not-a-valid-uuid",
        activated_shift_id: "shift-123",
      },
    );

    // THEN: Request fails with validation error
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("10-5-API-EDGE-006: [P1] POST /api/stores/:storeId/lottery/bins/create-with-pack - should reject pack with RETURNED status", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists with RETURNED status
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
      status: "RETURNED",
    });

    // WHEN: Attempting to create bin with RETURNED pack
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

    // THEN: Request fails with appropriate error
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.message, "Error should mention pack status").toContain(
      "RECEIVED",
    );
  });
});
