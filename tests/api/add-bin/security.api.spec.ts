/* eslint-disable security/detect-object-injection */
/**
 * Add Bin API Tests - Security
 *
 * Tests for security vulnerabilities:
 * - SQL injection prevention (Prisma parameterized queries)
 * - XSS prevention (stored XSS - API accepts but client sanitizes)
 * - Authorization enforcement (RBAC permissions)
 * - Store isolation (tenant data leakage prevention)
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
import type { PrismaClient } from "@prisma/client";

/**
 * Create an active shift for testing bin creation
 * Requires creating a cashier first since shifts reference cashiers
 */
async function createActiveShift(
  prismaClient: PrismaClient,
  storeId: string,
  userId: string,
) {
  // Generate a 4-digit employee_id (required by schema VarChar(4))
  const empId = String(Math.floor(1000 + Math.random() * 9000));

  // Create a cashier first
  const cashier = await prismaClient.cashier.create({
    data: {
      store_id: storeId,
      name: `Cashier ${empId}`,
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

test.describe("10-5-API: Security", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // SQL INJECTION PREVENTION TESTS
  // ═══════════════════════════════════════════════════════════════════════════
  // Prisma ORM uses parameterized queries which prevents SQL injection.
  // The security test verifies that:
  // 1. Malicious input doesn't cause 500 errors (SQL execution)
  // 2. API handles malicious input gracefully (treats as literal string)
  // 3. Malicious input doesn't return unexpected data
  // ═══════════════════════════════════════════════════════════════════════════

  test("10-5-API-SEC-001: [P0] GET /api/lottery/packs/validate-for-activation - should prevent SQL injection in packNumber parameter", async ({
    storeManagerApiRequest,
    storeManagerUser,
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

      // THEN: Request should NOT cause server error (SQL injection would cause 500)
      // Prisma uses parameterized queries so the malicious input is treated as a literal string
      // The API returns 200 with valid=false because no pack exists with that literal pack_number
      expect(
        response.status(),
        `SQL injection attempt "${maliciousInput}" should not cause 500 error`,
      ).not.toBe(500);

      // API should return 200 with valid=false (pack not found) since injection string is treated literally
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(
        body.data.valid,
        "Pack should not be found (injection treated as literal)",
      ).toBe(false);
      expect(body.data.error, "Should have not found error").toBeDefined();
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
      // Fastify schema validation enforces UUID format on storeId parameter
      expect(
        response.status(),
        `SQL injection attempt in storeId should be rejected by schema validation`,
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
    // AND: An active shift exists
    const shift = await createActiveShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const sqlInjectionAttempts = [
      "Bin 1'; DROP TABLE lottery_bins;--",
      "Bin 1' OR '1'='1",
      "'; DELETE FROM lottery_bins WHERE '1'='1",
    ];

    for (let index = 0; index < sqlInjectionAttempts.length; index++) {
      const maliciousInput = sqlInjectionAttempts[index];
      // Create a fresh pack for each SQL injection attempt
      const game = await createLotteryGame(prismaClient, {
        name: `$5 Powerball SEC-003-${index}`,
        price: 5.0,
      });
      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeManagerUser.store_id,
        pack_number: `SEC003-${Date.now()}-${index}`,
        serial_start: "000112345670123456789012",
        serial_end: "000112345670123456789680",
        status: "RECEIVED",
      });

      // WHEN: Attempting SQL injection in bin_name
      const response = await storeManagerApiRequest.post(
        `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
        {
          bin_name: maliciousInput,
          display_order: index,
          pack_number: pack.pack_number,
          serial_start: "001",
          activated_by: storeManagerUser.user_id,
          activated_shift_id: shift.shift_id,
        },
      );

      // THEN: Request should NOT cause server error (SQL injection would cause 500)
      // Prisma uses parameterized queries so the malicious string is stored as the literal bin name
      expect(
        response.status(),
        `SQL injection attempt "${maliciousInput}" should not cause 500 error`,
      ).not.toBe(500);

      // Request should succeed - the malicious string is stored as literal text
      expect(response.status(), "Request should succeed").toBe(200);
      const body = await response.json();
      // Verify the malicious string was stored as literal (not executed)
      expect(body.data.bin.name, "Bin name should be stored literally").toBe(
        maliciousInput,
      );
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // XSS PREVENTION TESTS
  // ═══════════════════════════════════════════════════════════════════════════
  // XSS prevention is a client-side concern. The API stores data as-is.
  // Security is enforced by:
  // 1. React's automatic HTML escaping in JSX
  // 2. Content-Security-Policy headers
  // 3. Never using dangerouslySetInnerHTML with user data
  // ═══════════════════════════════════════════════════════════════════════════

  test("10-5-API-SEC-004: [P0] POST /api/stores/:storeId/lottery/bins/create-with-pack - should store XSS attempts literally (sanitization happens on display)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: An active shift exists
    const shift = await createActiveShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const xssAttempts = [
      "<script>alert('xss')</script>",
      "<img src=x onerror=alert('xss')>",
      "javascript:alert('xss')",
      "<svg onload=alert('xss')>",
    ];

    for (let index = 0; index < xssAttempts.length; index++) {
      const maliciousInput = xssAttempts[index];
      // Create a fresh pack for each XSS attempt
      const game = await createLotteryGame(prismaClient, {
        name: `$5 Powerball SEC-004-${index}`,
        price: 5.0,
      });
      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeManagerUser.store_id,
        pack_number: `SEC004-${Date.now()}-${index}`,
        serial_start: "000112345670123456789012",
        serial_end: "000112345670123456789680",
        status: "RECEIVED",
      });

      // WHEN: Attempting XSS in location field
      const response = await storeManagerApiRequest.post(
        `/api/stores/${storeManagerUser.store_id}/lottery/bins/create-with-pack`,
        {
          bin_name: `Bin XSS Test ${index}`,
          location: maliciousInput,
          display_order: index,
          pack_number: pack.pack_number,
          serial_start: "001",
          activated_by: storeManagerUser.user_id,
          activated_shift_id: shift.shift_id,
        },
      );

      // THEN: Request should succeed (XSS prevention is client-side)
      // API stores data as-is, sanitization happens on display via React
      expect(response.status(), "XSS attempt should not break API").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(
        body.data.bin.location,
        "Location should be stored literally",
      ).toBe(maliciousInput);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHORIZATION ENFORCEMENT TESTS (RBAC)
  // ═══════════════════════════════════════════════════════════════════════════

  test("10-5-API-SEC-005: [P0] GET /api/lottery/packs/validate-for-activation - should enforce authorization (LOTTERY_PACK_READ permission)", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: An unauthenticated request (no token)
    // AND: A store and pack exist
    // Note: Do not override game_code to allow factory to generate unique one
    const company = await createCompany(prismaClient);
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball SEC-005",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: store.store_id,
      pack_number: `SEC005-${Date.now()}`,
      serial_start: "000112345670123456789012",
      serial_end: "000112345670123456789680",
      status: "RECEIVED",
    });

    // WHEN: Attempting to validate pack without authentication
    const response = await apiRequest.get(
      `/api/lottery/packs/validate-for-activation/${store.store_id}/${pack.pack_number}`,
    );

    // THEN: I receive 401 Unauthorized (authentication required)
    expect(response.status(), "Expected 401 Unauthorized").toBe(401);
    const body = await response.json();
    expect(body.error, "Error should be present").toBeDefined();
  });

  test("10-5-API-SEC-006: [P0] POST /api/stores/:storeId/lottery/bins/create-with-pack - should enforce authorization (LOTTERY_BIN_MANAGE permission)", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: An unauthenticated request (no token)
    // AND: A store and pack exist
    // Note: Do not override game_code to allow factory to generate unique one
    const company = await createCompany(prismaClient);
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball SEC-006",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: store.store_id,
      pack_number: `SEC006-${Date.now()}`,
      serial_start: "000112345670123456789012",
      serial_end: "000112345670123456789680",
      status: "RECEIVED",
    });

    // WHEN: Attempting to create bin without authentication
    const response = await apiRequest.post(
      `/api/stores/${store.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        display_order: 0,
        pack_number: pack.pack_number,
        serial_start: "001",
        activated_by: "00000000-0000-0000-0000-000000000000",
        activated_shift_id: "00000000-0000-0000-0000-000000000000",
      },
    );

    // THEN: I receive 401 Unauthorized (authentication required)
    expect(response.status(), "Expected 401 Unauthorized").toBe(401);
    const body = await response.json();
    expect(body.error, "Error should be present").toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STORE ISOLATION (TENANT DATA LEAKAGE PREVENTION) TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  test("10-5-API-SEC-007: [P0] GET /api/lottery/packs/validate-for-activation - should prevent data leakage (store isolation)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists in a DIFFERENT store (different company)
    const otherCompany = await createCompany(prismaClient);
    const otherStore = await createStore(prismaClient, {
      company_id: otherCompany.company_id,
    });
    // Note: Do not override game_code to allow factory to generate unique one
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball SEC-007",
      price: 5.0,
    });
    const otherStorePack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: otherStore.store_id,
      pack_number: `SEC007-${Date.now()}`,
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
    // Error message varies based on where access is denied:
    // - validate-for-activation route: "Access denied to this store"
    // - Permission middleware: "You do not have permission to access this feature"
    expect(
      body.error.message,
      "Error should indicate access/permission denied",
    ).toMatch(/[Aa]ccess denied|[Pp]ermission|[Nn]ot have permission/);
  });

  test("10-5-API-SEC-008: [P0] POST /api/stores/:storeId/lottery/bins/create-with-pack - should prevent data leakage (store isolation)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists in a DIFFERENT store (different company)
    const otherCompany = await createCompany(prismaClient);
    const otherStore = await createStore(prismaClient, {
      company_id: otherCompany.company_id,
    });
    // Note: Do not override game_code to allow factory to generate unique one
    const game = await createLotteryGame(prismaClient, {
      name: "$5 Powerball SEC-008",
      price: 5.0,
    });
    const otherStorePack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: otherStore.store_id,
      pack_number: `SEC008-${Date.now()}`,
      serial_start: "000112345670123456789012",
      serial_end: "000112345670123456789680",
      status: "RECEIVED",
    });

    // WHEN: Attempting to create bin in different store
    const response = await storeManagerApiRequest.post(
      `/api/stores/${otherStore.store_id}/lottery/bins/create-with-pack`,
      {
        bin_name: "Bin 1",
        display_order: 0,
        pack_number: otherStorePack.pack_number,
        serial_start: "001",
        activated_by: storeManagerUser.user_id,
        activated_shift_id: "00000000-0000-0000-0000-000000000000", // Dummy UUID
      },
    );

    // THEN: I receive 403 Forbidden (store access denied)
    expect(response.status(), "Expected 403 Forbidden").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    // Error message varies based on where access is denied:
    // - Route handler: "Access denied" / "Permission denied"
    // - Permission middleware: "You do not have permission to access this feature"
    expect(
      body.error.message,
      "Error should indicate access/permission denied",
    ).toMatch(/[Aa]ccess denied|[Pp]ermission|[Nn]ot have permission/);
  });
});
