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
    // AND: A pack exists in RECEIVED status
    // AND: An active shift exists
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: `PKG-${Date.now()}-1`,
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

    // WHEN: Creating bin with empty bin_name
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "",
        display_order: 0,
        pack_number: pack.pack_number,
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: shift.shift_id,
      },
    );

    // THEN: Request fails with validation error (Fastify schema validation)
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
    // AND: A pack exists in RECEIVED status
    // AND: An active shift exists
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: `PKG-${Date.now()}-2`,
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

    // WHEN: Creating bin with bin_name exceeding 255 characters
    const longBinName = "A".repeat(256);
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: longBinName,
        display_order: 0,
        pack_number: pack.pack_number,
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: shift.shift_id,
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
    // AND: A pack exists in RECEIVED status
    // AND: An active shift exists
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: `PKG-${Date.now()}-3`,
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

    // WHEN: Creating bin with location exceeding 255 characters
    const longLocation = "A".repeat(256);
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        location: longLocation,
        display_order: 0,
        pack_number: pack.pack_number,
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: shift.shift_id,
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
    // AND: A pack exists in RECEIVED status
    // AND: An active shift exists
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: `PKG-${Date.now()}-4`,
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

    // WHEN: Creating bin with negative display_order
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        display_order: -1,
        pack_number: pack.pack_number,
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: shift.shift_id,
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
    // AND: A pack exists in RECEIVED status
    // AND: An active shift exists
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: `PKG-${Date.now()}-5`,
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

    // WHEN: Creating bin with invalid UUID for activated_by
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        display_order: 0,
        pack_number: pack.pack_number,
        serial_start: "001",
        activated_by: "not-a-valid-uuid",
        activated_shift_id: shift.shift_id,
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
    // AND: A pack exists with RETURNED status (invalid for activation)
    // AND: An active shift exists
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: `PKG-${Date.now()}-6`,
      serial_start: "000112345670123456789012",
      serial_end: "000112345670123456789680",
      status: "RETURNED",
    });

    // Create an active shift (required by API)
    const shift = await createActiveShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Attempting to create bin with RETURNED pack
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

    // THEN: Request fails with appropriate error (pack must be RECEIVED)
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.message, "Error should mention pack status").toContain(
      "RECEIVED",
    );
  });

  test("10-5-API-EDGE-007: [P1] POST /api/stores/:storeId/lottery/bins/create-with-pack - should reject invalid UUID in activated_shift_id", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists in RECEIVED status
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: `PKG-${Date.now()}-7`,
      serial_start: "000112345670123456789012",
      serial_end: "000112345670123456789680",
      status: "RECEIVED",
    });

    // WHEN: Creating bin with invalid UUID for activated_shift_id
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        display_order: 0,
        pack_number: pack.pack_number,
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: "not-a-valid-uuid",
      },
    );

    // THEN: Request fails with validation error (schema validation)
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("10-5-API-EDGE-008: [P1] POST /api/stores/:storeId/lottery/bins/create-with-pack - should reject pack with ACTIVE status", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists with ACTIVE status (already activated, cannot re-activate)
    // AND: An active shift exists
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: `PKG-${Date.now()}-8`,
      serial_start: "000112345670123456789012",
      serial_end: "000112345670123456789680",
      status: "ACTIVE",
    });

    // Create an active shift (required by API)
    const shift = await createActiveShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Attempting to create bin with ACTIVE pack
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

    // THEN: Request fails with appropriate error (pack must be RECEIVED)
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.message, "Error should mention pack status").toContain(
      "RECEIVED",
    );
  });

  test("10-5-API-EDGE-009: [P1] POST /api/stores/:storeId/lottery/bins/create-with-pack - should reject pack with DEPLETED status", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists with DEPLETED status (cannot activate a depleted pack)
    // AND: An active shift exists
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: `PKG-${Date.now()}-9`,
      serial_start: "000112345670123456789012",
      serial_end: "000112345670123456789680",
      status: "DEPLETED",
    });

    // Create an active shift (required by API)
    const shift = await createActiveShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Attempting to create bin with DEPLETED pack
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

    // THEN: Request fails with appropriate error (pack must be RECEIVED)
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.message, "Error should mention pack status").toContain(
      "RECEIVED",
    );
  });

  test("10-5-API-EDGE-010: [P1] POST /api/stores/:storeId/lottery/bins/create-with-pack - should reject missing display_order", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists in RECEIVED status
    // AND: An active shift exists
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: `PKG-${Date.now()}-10`,
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

    // WHEN: Creating bin without display_order (required field)
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        // display_order is missing (required by schema)
        pack_number: pack.pack_number,
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: shift.shift_id,
      },
    );

    // THEN: Request fails with validation error (missing required field)
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RACE CONDITION / CONFLICT TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("10-5-API-EDGE-011: [P1] POST /api/stores/:storeId/lottery/bins/create-with-pack - should return 409 Conflict when bin already has an active pack", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A bin already exists at display_order 0 with an ACTIVE pack
    // AND: I have a new pack in RECEIVED status I want to activate
    // AND: An active shift exists
    const game = await createLotteryGame(prismaClient, {
      name: "$10 MegaMillions",
      price: 10.0,
    });

    // Create an active shift first (needed for both pack activations)
    const shift = await createActiveShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // Create an existing bin with an ACTIVE pack (simulates race condition)
    const existingBin = await prismaClient.lotteryBin.create({
      data: {
        store_id: storeManagerUser.store_id,
        name: "Bin 1",
        display_order: 0,
        is_active: true,
      },
    });

    const existingActivePack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: `PKG-${Date.now()}-ACTIVE`,
      serial_start: "000112345670123456789012",
      serial_end: "000112345670123456789680",
      status: "ACTIVE",
      current_bin_id: existingBin.bin_id,
    });

    // Create a new pack in RECEIVED status that we want to activate
    const newPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: `PKG-${Date.now()}-NEW`,
      serial_start: "000212345670123456789012",
      serial_end: "000212345670123456789680",
      status: "RECEIVED",
    });

    // WHEN: Attempting to create a bin with pack at the same display_order
    // (simulating race condition where user selected an available bin but it became occupied)
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1 Duplicate",
        display_order: 0, // Same display_order as existing bin with active pack
        pack_number: newPack.pack_number,
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: shift.shift_id,
      },
    );

    // THEN: Request fails with 409 Conflict (bin already occupied)
    expect(response.status(), "Expected 409 Conflict").toBe(409);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be CONFLICT").toBe("CONFLICT");
    expect(
      body.error.message,
      "Error message should indicate bin is occupied",
    ).toContain("already an active pack");
    expect(
      body.error.message,
      "Error message should mention bin number",
    ).toContain("Bin 1");
    expect(
      body.error.message,
      "Error message should suggest selecting empty bin",
    ).toContain("select an empty bin");
  });

  test("10-5-API-EDGE-012: [P1] POST /api/stores/:storeId/lottery/bins/create-with-pack - should allow creating bin when display_order has no active pack", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A bin exists at display_order 0 but its pack is DEPLETED (not active)
    // AND: I have a new pack in RECEIVED status I want to activate
    // AND: An active shift exists
    const game = await createLotteryGame(prismaClient, {
      name: "$20 Scratch",
      price: 20.0,
    });

    // Create an active shift
    const shift = await createActiveShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // Create an existing bin with a DEPLETED pack (not blocking)
    const existingBin = await prismaClient.lotteryBin.create({
      data: {
        store_id: storeManagerUser.store_id,
        name: "Bin 5",
        display_order: 4, // Using display_order 4 (bin number 5)
        is_active: true,
      },
    });

    await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: `PKG-${Date.now()}-DEPLETED`,
      serial_start: "000312345670123456789012",
      serial_end: "000312345670123456789680",
      status: "DEPLETED", // Pack is depleted, not active
      current_bin_id: existingBin.bin_id,
    });

    // Create a new pack in RECEIVED status that we want to activate
    const newPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: `PKG-${Date.now()}-NEWPACK`,
      serial_start: "000412345670123456789012",
      serial_end: "000412345670123456789680",
      status: "RECEIVED",
    });

    // WHEN: Creating a new bin at display_order 4 (same as depleted bin)
    // This should succeed because the existing pack is DEPLETED, not ACTIVE
    const response = await storeManagerApiRequest.post(
      `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 5 New",
        display_order: 4, // Same display_order as existing bin with DEPLETED pack
        pack_number: newPack.pack_number,
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: shift.shift_id,
      },
    );

    // THEN: Request succeeds (depleted packs don't block new bin creation)
    // Note: The exact behavior depends on business logic - if we want to prevent
    // creating bins at the same display_order regardless of pack status, this test
    // should expect 409. Current implementation only blocks ACTIVE packs.
    expect(
      [200, 201].includes(response.status()),
      `Expected 200/201 but got ${response.status()}`,
    ).toBe(true);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
  });
});
