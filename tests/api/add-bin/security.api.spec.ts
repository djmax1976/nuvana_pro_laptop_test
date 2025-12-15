/**
 * Add Bin API Tests - Security
 *
 * Tests for security vulnerabilities:
 * - SQL injection prevention
 * - XSS prevention
 * - Authorization enforcement
 * - Store isolation (data leakage prevention)
 *
 * @test-level API
 * @justification Tests security controls for API endpoints
 * @story 10-5 - Add Bin Functionality
 * @priority P0 (Critical - Security)
 */

import { test, expect } from "../../support/fixtures/rbac.fixture";
import {
  createLotteryGame,
  createLotteryPack,
} from "../../support/factories/lottery.factory";
import { createCompany, createStore } from "../../support/helpers";

test.describe("10-5-API: Security", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS (Mandatory - Applied Automatically)
  // ═══════════════════════════════════════════════════════════════════════════

  test("10-5-API-SEC-001: [P0] GET /api/lottery/packs/validate-for-activation - should prevent SQL injection in packNumber parameter", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: Attempting SQL injection in packNumber
    const sqlInjectionAttempts = [
      "1234567' OR '1'='1",
      "1234567'; DROP TABLE lottery_packs;--",
      "1234567' UNION SELECT * FROM users--",
      "'; DELETE FROM lottery_packs WHERE '1'='1",
    ];

    for (const maliciousInput of sqlInjectionAttempts) {
      // WHEN: Attempting SQL injection
      const response = await storeManagerApiRequest.get(
        `/api/lottery/packs/validate-for-activation/${storeManagerUser.store_id}/${encodeURIComponent(maliciousInput)}`,
      );

      // THEN: Request should be rejected (not execute SQL)
      // Should return 400 or 404, not 500 (which would indicate SQL execution)
      expect(
        response.status(),
        `SQL injection attempt "${maliciousInput}" should be rejected`,
      ).not.toBe(500);
      expect(
        response.status(),
        `SQL injection attempt "${maliciousInput}" should return error status`,
      ).toBeGreaterThanOrEqual(400);

      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
    }
  });

  test("10-5-API-SEC-002: [P0] GET /api/lottery/packs/validate-for-activation - should prevent SQL injection in storeId parameter", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: Attempting SQL injection in storeId
    const sqlInjectionAttempts = [
      `${storeManagerUser.store_id}' OR '1'='1`,
      `${storeManagerUser.store_id}'; DROP TABLE stores;--`,
    ];

    for (const maliciousInput of sqlInjectionAttempts) {
      // WHEN: Attempting SQL injection
      const response = await storeManagerApiRequest.get(
        `/api/lottery/packs/validate-for-activation/${encodeURIComponent(maliciousInput)}/1234567`,
      );

      // THEN: Request should be rejected (400 Bad Request - invalid UUID format)
      expect(
        response.status(),
        `SQL injection attempt in storeId should be rejected`,
      ).toBeGreaterThanOrEqual(400);
      expect(response.status(), "Should not be 500 (SQL execution)").not.toBe(
        500,
      );
    }
  });

  test("10-5-API-SEC-003: [P0] POST /api/stores/:storeId/lottery/bins/create-with-pack - should prevent SQL injection in bin_name", async ({
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

    const sqlInjectionAttempts = [
      "Bin 1'; DROP TABLE lottery_bins;--",
      "Bin 1' OR '1'='1",
      "'; DELETE FROM lottery_bins WHERE '1'='1",
    ];

    for (const maliciousInput of sqlInjectionAttempts) {
      // WHEN: Attempting SQL injection in bin_name
      const response = await storeManagerApiRequest.post(
        `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
        {
          bin_name: maliciousInput,
          pack_number: pack.pack_number,
          serial_start: "001",
          activated_by: storeManagerUser.user_id,
          activated_shift_id: "shift-123",
        },
      );

      // THEN: Request should be rejected (400 Bad Request - validation error)
      expect(
        response.status(),
        `SQL injection attempt "${maliciousInput}" should be rejected`,
      ).toBeGreaterThanOrEqual(400);
      expect(response.status(), "Should not be 500 (SQL execution)").not.toBe(
        500,
      );
    }
  });

  test("10-5-API-SEC-004: [P0] POST /api/stores/:storeId/lottery/bins/create-with-pack - should prevent XSS in location field", async ({
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

    const xssAttempts = [
      "<script>alert('xss')</script>",
      "<img src=x onerror=alert('xss')>",
      "javascript:alert('xss')",
      "<svg onload=alert('xss')>",
    ];

    for (const maliciousInput of xssAttempts) {
      // WHEN: Attempting XSS in location field
      const response = await storeManagerApiRequest.post(
        `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
        {
          bin_name: "Bin 1",
          location: maliciousInput,
          pack_number: pack.pack_number,
          serial_start: "001",
          activated_by: storeManagerUser.user_id,
          activated_shift_id: "shift-123",
        },
      );

      // THEN: Request should succeed (XSS prevention is client-side)
      // BUT: Location should be stored as-is (sanitization happens on display)
      expect(response.status(), "XSS attempt should not break API").toBe(201);
      const body = await response.json();
      expect(body.data.bin.location, "Location should be stored").toBe(
        maliciousInput,
      );
    }
  });

  test("10-5-API-SEC-005: [P0] GET /api/lottery/packs/validate-for-activation - should enforce authorization (LOTTERY_PACK_READ permission)", async ({
    cashierApiRequest,
    cashierUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Cashier (without LOTTERY_PACK_READ permission)
    // AND: A pack exists
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
      game_code: "0001",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: cashierUser.store_id,
      pack_number: "1234567",
      serial_start: "000112345670123456789012",
      serial_end: "000112345670123456789680",
      status: "RECEIVED",
    });

    // WHEN: Attempting to validate pack without permission
    const response = await cashierApiRequest.get(
      `/api/lottery/packs/validate-for-activation/${cashierUser.store_id}/${pack.pack_number}`,
    );

    // THEN: I receive 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error object should be present").toBeDefined();
  });

  test("10-5-API-SEC-006: [P0] POST /api/stores/:storeId/lottery/bins/create-with-pack - should enforce authorization (LOTTERY_BIN_MANAGE permission)", async ({
    cashierApiRequest,
    cashierUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Cashier (without LOTTERY_BIN_MANAGE permission)
    // AND: A pack exists
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
      game_code: "0001",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: cashierUser.store_id,
      pack_number: "1234567",
      serial_start: "000112345670123456789012",
      serial_end: "000112345670123456789680",
      status: "RECEIVED",
    });

    // WHEN: Attempting to create bin without permission
    const response = await cashierApiRequest.post(
      `/api/stores/${cashierUser.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        pack_number: pack.pack_number,
        serial_start: "001",
        activated_by: cashierUser.user_id,
        activated_shift_id: "shift-123",
      },
    );

    // THEN: I receive 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error object should be present").toBeDefined();
  });

  test("10-5-API-SEC-007: [P0] GET /api/lottery/packs/validate-for-activation - should prevent data leakage (store isolation)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists in a DIFFERENT store
    const otherCompany = await createCompany(prismaClient);
    const otherStore = await createStore(prismaClient, {
      company_id: otherCompany.company_id,
    });
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
      game_code: "0001",
    });
    const otherStorePack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: otherStore.store_id,
      pack_number: "1234567",
      serial_start: "000112345670123456789012",
      serial_end: "000112345670123456789680",
      status: "RECEIVED",
    });

    // WHEN: Attempting to validate pack from different store
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs/validate-for-activation/${otherStore.store_id}/${otherStorePack.pack_number}`,
    );

    // THEN: I receive 403 Forbidden (store access denied)
    expect(response.status(), "Expected 403 Forbidden").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.message, "Error should mention access denied").toContain(
      "Access denied",
    );
  });

  test("10-5-API-SEC-008: [P0] POST /api/stores/:storeId/lottery/bins/create-with-pack - should prevent data leakage (store isolation)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists in a DIFFERENT store
    const otherCompany = await createCompany(prismaClient);
    const otherStore = await createStore(prismaClient, {
      company_id: otherCompany.company_id,
    });
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball",
      price: 5.0,
      game_code: "0001",
    });
    const otherStorePack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: otherStore.store_id,
      pack_number: "1234567",
      serial_start: "000112345670123456789012",
      serial_end: "000112345670123456789680",
      status: "RECEIVED",
    });

    // WHEN: Attempting to create bin in different store
    const response = await storeManagerApiRequest.post(
      `/api/stores/${otherStore.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        pack_number: otherStorePack.pack_number,
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: "shift-123",
      },
    );

    // THEN: I receive 403 Forbidden (store access denied)
    expect(response.status(), "Expected 403 Forbidden").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.message, "Error should mention access denied").toContain(
      "Access denied",
    );
  });
});
