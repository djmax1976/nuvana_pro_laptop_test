/**
 * Add Bin API Tests - Pack Validation
 *
 * Tests for pack validation endpoint:
 * - GET /api/lottery/packs/validate-for-activation/:storeId/:packNumber
 * - Pack status validation (RECEIVED, ACTIVE, DEPLETED, RETURNED)
 * - Game code lookup and validation
 * - Pack existence validation
 *
 * @test-level API
 * @justification Tests pack validation logic for bin creation
 * @story 10-5 - Add Bin Functionality
 * @priority P1 (High - Core validation logic)
 */

import { test, expect } from "../../support/fixtures/rbac.fixture";
import {
  createLotteryGame,
  createLotteryPack,
} from "../../support/factories/lottery.factory";

test.describe("10-5-API: Pack Validation", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/lottery/packs/validate-for-activation/:storeId/:packNumber - AC #3, #4
  // ═══════════════════════════════════════════════════════════════════════════

  test("10-5-API-001: [P1] GET /api/lottery/packs/validate-for-activation/:storeId/:packNumber - should validate pack exists and status is RECEIVED (AC #3)", async ({
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

    // WHEN: Validating pack for activation
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs/validate-for-activation/${storeManagerUser.store_id}/${pack.pack_number}`,
    );

    // THEN: Validation succeeds
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.valid, "Pack should be valid").toBe(true);
    expect(body.data.game, "Game info should be present").toBeDefined();
    expect(body.data.game.name, "Game name should match").toBe("$5 Powerball");
    expect(body.data.game.price, "Game price should match").toBe(5.0);
    expect(typeof body.data.game.price, "Game price should be number").toBe(
      "number",
    );
    expect(body.data.pack, "Pack info should be present").toBeDefined();
    expect(body.data.pack.pack_id, "Pack ID should match").toBe(pack.pack_id);
    expect(body.data.pack, "Pack should have serial_start").toHaveProperty(
      "serial_start",
    );
    expect(body.data.pack, "Pack should have serial_end").toHaveProperty(
      "serial_end",
    );
  });

  test("10-5-API-002: [P1] GET /api/lottery/packs/validate-for-activation/:storeId/:packNumber - should reject pack with ACTIVE status (AC #3)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists with ACTIVE status
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
      status: "ACTIVE",
    });

    // WHEN: Validating pack for activation
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs/validate-for-activation/${storeManagerUser.store_id}/${pack.pack_number}`,
    );

    // THEN: Validation fails with appropriate error
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body, "Response should have error field").toHaveProperty("error");
    expect(body.error, "Error should be an object").toBeInstanceOf(Object);
    expect(body.error, "Error should have message field").toHaveProperty(
      "message",
    );
    expect(typeof body.error.message, "Error message should be string").toBe(
      "string",
    );
    expect(
      body.error.message,
      "Error should mention pack already active",
    ).toContain("already active");
  });

  test("10-5-API-003: [P1] GET /api/lottery/packs/validate-for-activation/:storeId/:packNumber - should reject pack with DEPLETED status (AC #3)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists with DEPLETED status
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
      status: "DEPLETED",
    });

    // WHEN: Validating pack for activation
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs/validate-for-activation/${storeManagerUser.store_id}/${pack.pack_number}`,
    );

    // THEN: Validation fails with appropriate error
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(
      body.error.message,
      "Error should mention pack not available",
    ).toContain("not available");
  });

  test("10-5-API-004: [P1] GET /api/lottery/packs/validate-for-activation/:storeId/:packNumber - should reject pack not found in inventory (AC #3)", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: Pack does not exist in inventory
    const nonExistentPackNumber = "9999999";

    // WHEN: Validating non-existent pack
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs/validate-for-activation/${storeManagerUser.store_id}/${nonExistentPackNumber}`,
    );

    // THEN: Validation fails with pack not found error
    expect(response.status(), "Expected 404 Not Found").toBe(404);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.message, "Error should mention pack not found").toContain(
      "not found",
    );
  });

  test("10-5-API-005: [P1] GET /api/lottery/packs/validate-for-activation/:storeId/:packNumber - should reject pack with unknown game code (AC #3)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists with game code that doesn't match any game
    // Note: This scenario requires pack with invalid game_code or game deleted
    // For this test, we'll create a pack and then delete the game
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
      game_code: "9999", // Unknown game code
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "1234567",
      serial_start: "999912345670123456789012",
      serial_end: "999912345670123456789680",
      status: "RECEIVED",
    });

    // Delete the game to simulate unknown game code scenario
    await prismaClient.lotteryGame.delete({
      where: { game_id: game.game_id },
    });

    // WHEN: Validating pack with unknown game code
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs/validate-for-activation/${storeManagerUser.store_id}/${pack.pack_number}`,
    );

    // THEN: Validation fails with unknown game code error
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(
      body.error.message,
      "Error should mention unknown game code",
    ).toContain("Unknown game code");
  });

  test("10-5-API-EDGE-007: [P1] GET /api/lottery/packs/validate-for-activation - should reject pack with RETURNED status", async ({
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

    // WHEN: Validating RETURNED pack
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs/validate-for-activation/${storeManagerUser.store_id}/${pack.pack_number}`,
    );

    // THEN: Validation fails with appropriate error
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(
      body.error.message,
      "Error should mention pack not available",
    ).toContain("not available");
  });
});
