/**
 * Add Bin API Tests - Pack Validation
 *
 * Tests for pack validation endpoint:
 * - GET /api/lottery/packs/validate-for-activation/:storeId/:packNumber
 * - Pack status validation (RECEIVED, ACTIVE, DEPLETED, RETURNED)
 * - Game code lookup and validation
 * - Pack existence validation
 *
 * API Design Pattern:
 * This endpoint uses a "validation result" pattern where validation failures
 * are returned as 200 OK with { success: true, data: { valid: false, error: string } }
 * rather than HTTP error codes. This is appropriate for validation endpoints
 * that need to convey detailed validation results to the client.
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
import { createCompany, createStore } from "../../support/factories";

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
    // Use dynamic game code to avoid unique constraint violations across parallel tests
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
      // No game_code override - let factory generate unique code
    });
    const packNumber = `VAL001${Date.now()}`;
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: packNumber,
      status: "RECEIVED",
    });

    // WHEN: Validating pack for activation
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs/validate-for-activation/${storeManagerUser.store_id}/${pack.pack_number}`,
    );

    // THEN: Validation succeeds with pack and game details
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.valid, "Pack should be valid for activation").toBe(true);
    expect(body.data.error, "No error should be present").toBeUndefined();
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
    // AND: A pack exists with ACTIVE status (already in use)
    const game = await createLotteryGame(prismaClient, {
      name: "$10 Mega Millions",
      price: 10.0,
    });
    const packNumber = `VAL002${Date.now()}`;
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: packNumber,
      status: "ACTIVE",
    });

    // WHEN: Validating pack for activation
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs/validate-for-activation/${storeManagerUser.store_id}/${pack.pack_number}`,
    );

    // THEN: Validation returns invalid result (not HTTP error - this is a validation endpoint)
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.valid, "Pack should NOT be valid for activation").toBe(
      false,
    );
    expect(body.data.error, "Error message should be present").toBeDefined();
    expect(typeof body.data.error, "Error should be a string").toBe("string");
    expect(
      body.data.error,
      "Error should indicate pack is already active",
    ).toContain("already active");
    expect(body.data.game, "Game info should NOT be present").toBeUndefined();
    expect(body.data.pack, "Pack info should NOT be present").toBeUndefined();
  });

  test("10-5-API-003: [P1] GET /api/lottery/packs/validate-for-activation/:storeId/:packNumber - should reject pack with DEPLETED status (AC #3)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists with DEPLETED status (all tickets sold)
    const game = await createLotteryGame(prismaClient, {
      name: "$2 Lucky Sevens",
      price: 2.0,
    });
    const packNumber = `VAL003${Date.now()}`;
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: packNumber,
      status: "DEPLETED",
    });

    // WHEN: Validating pack for activation
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs/validate-for-activation/${storeManagerUser.store_id}/${pack.pack_number}`,
    );

    // THEN: Validation returns invalid result
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.valid, "Pack should NOT be valid for activation").toBe(
      false,
    );
    expect(body.data.error, "Error message should be present").toBeDefined();
    expect(body.data.error, "Error should indicate pack is depleted").toContain(
      "depleted",
    );
  });

  test("10-5-API-004: [P1] GET /api/lottery/packs/validate-for-activation/:storeId/:packNumber - should reject pack not found in inventory (AC #3)", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: Pack does not exist in inventory
    const nonExistentPackNumber = `NONEXIST${Date.now()}`;

    // WHEN: Validating non-existent pack
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs/validate-for-activation/${storeManagerUser.store_id}/${nonExistentPackNumber}`,
    );

    // THEN: Validation returns invalid result with helpful message
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.valid, "Pack should NOT be valid for activation").toBe(
      false,
    );
    expect(body.data.error, "Error message should be present").toBeDefined();
    expect(body.data.error, "Error should indicate pack not found").toMatch(
      /not found|receive/i,
    );
  });

  test("10-5-API-005: [P1] GET /api/lottery/packs/validate-for-activation/:storeId/:packNumber - should return game price as number (type validation)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists with a game that has a decimal price
    // This tests that the API correctly serializes the Decimal type to a number
    const game = await createLotteryGame(prismaClient, {
      name: "$1.50 Scratch Off",
      price: 1.5, // Decimal price to test type conversion
    });
    const packNumber = `VAL005${Date.now()}`;
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: packNumber,
      status: "RECEIVED",
    });

    // WHEN: Validating pack for activation
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs/validate-for-activation/${storeManagerUser.store_id}/${pack.pack_number}`,
    );

    // THEN: Validation returns valid result with correct numeric price
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.valid, "Pack should be valid for activation").toBe(true);
    expect(body.data.game, "Game info should be present").toBeDefined();
    expect(body.data.game.price, "Game price should be 1.5").toBe(1.5);
    expect(typeof body.data.game.price, "Game price must be number type").toBe(
      "number",
    );
    // Ensure it's not returned as string "1.50"
    expect(body.data.game.price).not.toBe("1.5");
    expect(body.data.game.price).not.toBe("1.50");
  });

  test("10-5-API-006: [P1] GET /api/lottery/packs/validate-for-activation - should reject pack with RETURNED status", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists with RETURNED status (sent back to lottery commission)
    const game = await createLotteryGame(prismaClient, {
      name: "$20 Winner Takes All",
      price: 20.0,
    });
    const packNumber = `VAL006${Date.now()}`;
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: packNumber,
      status: "RETURNED",
    });

    // WHEN: Validating RETURNED pack
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs/validate-for-activation/${storeManagerUser.store_id}/${pack.pack_number}`,
    );

    // THEN: Validation returns invalid result
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.valid, "Pack should NOT be valid for activation").toBe(
      false,
    );
    expect(body.data.error, "Error message should be present").toBeDefined();
    expect(body.data.error, "Error should indicate pack returned").toContain(
      "returned",
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Authorization and Access Control Tests
  // ═══════════════════════════════════════════════════════════════════════════

  test("10-5-API-007: [P1] GET /api/lottery/packs/validate-for-activation - should require authentication", async ({
    apiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: I am NOT authenticated (apiRequest is the unauthenticated fixture)
    const packNumber = "1234567";

    // WHEN: Attempting to validate pack without authentication
    const response = await apiRequest.get(
      `/api/lottery/packs/validate-for-activation/${storeManagerUser.store_id}/${packNumber}`,
    );

    // THEN: Request is rejected with 401 Unauthorized
    expect(response.status(), "Expected 401 Unauthorized").toBe(401);
  });

  test("10-5-API-008: [P1] GET /api/lottery/packs/validate-for-activation - should reject access to other stores", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: Attempting to access a different store's pack validation
    // Create pack in a different store using proper factory pattern
    const otherCompany = await prismaClient.company.create({
      data: createCompany({ owner_user_id: storeManagerUser.user_id }),
    });
    const otherStore = await prismaClient.store.create({
      data: createStore({ company_id: otherCompany.company_id }),
    });

    // WHEN: Attempting to validate pack in unauthorized store
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs/validate-for-activation/${otherStore.store_id}/1234567`,
    );

    // THEN: Request is rejected with 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error should be present").toBeDefined();
    // API returns "Permission denied" or "Access denied" message
    expect(
      body.error.message,
      "Error should indicate permission/access denied",
    ).toMatch(/permission denied|access denied|forbidden/i);
  });

  test("10-5-API-009: [P1] GET /api/lottery/packs/validate-for-activation - should return 403 for non-existent store (security practice)", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // Note: The API returns 403 for non-existent stores because the user
    // doesn't have RBAC roles for that store. This is proper security practice -
    // don't reveal existence info to unauthorized users (prevents enumeration attacks)
    const nonExistentStoreId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Attempting to validate pack for non-existent store
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs/validate-for-activation/${nonExistentStoreId}/1234567`,
    );

    // THEN: Request returns 403 Forbidden (not 404) to prevent store enumeration
    // A user without permissions shouldn't be able to determine if a store exists
    expect(response.status(), "Expected 403 Forbidden").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Input Validation Tests
  // ═══════════════════════════════════════════════════════════════════════════

  test("10-5-API-010: [P2] GET /api/lottery/packs/validate-for-activation - should reject invalid storeId format", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    const invalidStoreId = "not-a-uuid";

    // WHEN: Attempting to validate with invalid storeId format
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs/validate-for-activation/${invalidStoreId}/1234567`,
    );

    // THEN: Request is rejected with 400 Bad Request (schema validation)
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
  });
});
