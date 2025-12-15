/**
 * Add Bin API Tests - Enhanced Assertions
 *
 * Tests for response structure validation:
 * - Response format validation
 * - Field type validation
 * - Data structure validation
 *
 * @test-level API
 * @justification Tests API contract and response structure
 * @story 10-5 - Add Bin Functionality
 * @priority P1 (High - API contract validation)
 */

import { test, expect } from "../../support/fixtures/rbac.fixture";
import {
  createLotteryGame,
  createLotteryPack,
} from "../../support/factories/lottery.factory";

test.describe("10-5-API: Enhanced Assertions", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // ENHANCED ASSERTIONS (Applied Automatically)
  // ═══════════════════════════════════════════════════════════════════════════

  test("10-5-API-ENH-001: [P1] GET /api/lottery/packs/validate-for-activation - should return correct response structure", async ({
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

    // WHEN: Validating pack
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs/validate-for-activation/${storeManagerUser.store_id}/${pack.pack_number}`,
    );

    // THEN: Response has correct structure
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body, "Response should be an object").toBeInstanceOf(Object);
    expect(body, "Response should have success field").toHaveProperty(
      "success",
    );
    expect(typeof body.success, "Success field should be boolean").toBe(
      "boolean",
    );
    expect(body.success, "Success should be true").toBe(true);
    expect(body, "Response should have data field").toHaveProperty("data");
    expect(body.data, "Data should be an object").toBeInstanceOf(Object);
    expect(body.data, "Data should have valid field").toHaveProperty("valid");
    expect(typeof body.data.valid, "Valid field should be boolean").toBe(
      "boolean",
    );
    expect(body.data.valid, "Valid should be true").toBe(true);
    expect(body.data, "Data should have game field").toHaveProperty("game");
    expect(body.data.game, "Game should be an object").toBeInstanceOf(Object);
    expect(body.data.game, "Game should have name field").toHaveProperty(
      "name",
    );
    expect(typeof body.data.game.name, "Game name should be string").toBe(
      "string",
    );
    expect(body.data.game, "Game should have price field").toHaveProperty(
      "price",
    );
    expect(typeof body.data.game.price, "Game price should be number").toBe(
      "number",
    );
    expect(body.data, "Data should have pack field").toHaveProperty("pack");
    expect(body.data.pack, "Pack should be an object").toBeInstanceOf(Object);
    expect(body.data.pack, "Pack should have pack_id field").toHaveProperty(
      "pack_id",
    );
    expect(typeof body.data.pack.pack_id, "Pack ID should be string").toBe(
      "string",
    );
  });

  test("10-5-API-ENH-002: [P1] POST /api/stores/:storeId/lottery/bins/create-with-pack - should return correct response structure", async ({
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

    const shift = await prismaClient.shift.create({
      data: {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        cashier_id: cashier.cashier_id,
        status: "OPEN",
        opening_cash: 100.0,
      },
    });

    // WHEN: Creating bin
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

    // THEN: Response has correct structure
    expect(response.status(), "Expected 201 Created status").toBe(201);
    const body = await response.json();
    expect(body, "Response should be an object").toBeInstanceOf(Object);
    expect(body, "Response should have success field").toHaveProperty(
      "success",
    );
    expect(typeof body.success, "Success field should be boolean").toBe(
      "boolean",
    );
    expect(body.success, "Success should be true").toBe(true);
    expect(body, "Response should have data field").toHaveProperty("data");
    expect(body.data, "Data should be an object").toBeInstanceOf(Object);
    expect(body.data, "Data should have bin field").toHaveProperty("bin");
    expect(body.data.bin, "Bin should be an object").toBeInstanceOf(Object);
    expect(body.data.bin, "Bin should have bin_id field").toHaveProperty(
      "bin_id",
    );
    expect(typeof body.data.bin.bin_id, "Bin ID should be string").toBe(
      "string",
    );
    expect(
      body.data.bin.bin_id.length,
      "Bin ID should be valid UUID length",
    ).toBeGreaterThan(0);
    expect(body.data.bin, "Bin should have name field").toHaveProperty("name");
    expect(typeof body.data.bin.name, "Bin name should be string").toBe(
      "string",
    );
    expect(
      body.data.bin.name.length,
      "Bin name should not be empty",
    ).toBeGreaterThan(0);
    expect(
      body.data.bin.name.length,
      "Bin name should not exceed 255 chars",
    ).toBeLessThanOrEqual(255);
    expect(body.data.bin, "Bin should have display_order field").toHaveProperty(
      "display_order",
    );
    expect(
      typeof body.data.bin.display_order,
      "Display order should be number",
    ).toBe("number");
    expect(
      body.data.bin.display_order,
      "Display order should be non-negative",
    ).toBeGreaterThanOrEqual(0);
    expect(body.data.bin, "Bin should have is_active field").toHaveProperty(
      "is_active",
    );
    expect(typeof body.data.bin.is_active, "Is active should be boolean").toBe(
      "boolean",
    );
  });
});
