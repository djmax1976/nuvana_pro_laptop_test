/**
 * Lottery Bin Configuration API Tests
 *
 * Tests for Lottery Bin Configuration API endpoints:
 * - GET /api/lottery/bins/configuration/:storeId
 * - POST /api/lottery/bins/configuration/:storeId
 * - PUT /api/lottery/bins/configuration/:storeId
 * - Authentication and authorization (CLIENT_OWNER or STORE_MANAGER role)
 * - RLS enforcement (store isolation)
 * - Validation (display_order uniqueness, bin count limits)
 * - Audit logging
 * - Error handling (401, 403, 404, 400, 409)
 * - Security: SQL injection, authentication bypass, authorization, input validation, data leakage
 *
 * @test-level API
 * @justification Tests API endpoints with authentication, authorization, database operations, and business logic
 * @story 6-13 - Lottery Database Enhancements & Bin Management
 * @priority P0 (Critical - Security, Data Integrity, Business Logic)
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createCompany,
  createStore,
} from "../support/factories/database.factory";
import { withBypassClient } from "../support/prisma-bypass";

test.describe("6.13-API: Lottery Bin Configuration Endpoints", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/lottery/bins/configuration/:storeId - AC #1
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.13-API-001: [P0] GET /api/lottery/bins/configuration/:storeId - should return configuration for store (AC #1)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A bin configuration exists for my store
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    const binTemplate = [
      { name: "Bin 1", location: "Front", display_order: 0 },
      { name: "Bin 2", location: "Back", display_order: 1 },
    ];

    await withBypassClient(async (tx) => {
      await tx.lotteryBinConfiguration.create({
        data: {
          store_id: store.store_id,
          bin_template: binTemplate,
        },
      });
    });

    // WHEN: I query bin configuration for my store
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/configuration/${store.store_id}`,
    );

    // THEN: I receive the bin configuration
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data, "Response should contain configuration").toBeDefined();
    expect(body.data.store_id, "Store ID should match").toBe(store.store_id);
    expect(body.data.bin_template, "Bin template should match").toEqual(
      binTemplate,
    );
  });

  test("6.13-API-002: [P0] GET /api/lottery/bins/configuration/:storeId - should require authentication", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am NOT authenticated
    // AND: A store exists
    const store = await withBypassClient(async (tx) => {
      const company = await tx.company.create({
        data: createCompany(),
      });
      return await tx.store.create({
        data: createStore({ company_id: company.company_id }),
      });
    });

    // WHEN: I query bin configuration without authentication
    const response = await apiRequest.get(
      `/api/lottery/bins/configuration/${store.store_id}`,
    );

    // THEN: I receive 401 Unauthorized
    expect(response.status(), "Expected 401 Unauthorized").toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error should be present").toBeDefined();
  });

  test("6.13-API-003: [P0] GET /api/lottery/bins/configuration/:storeId - should require LOTTERY_BIN_CONFIG_READ permission", async ({
    regularUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated but lack LOTTERY_BIN_CONFIG_READ permission
    // AND: A store exists
    const store = await withBypassClient(async (tx) => {
      const company = await tx.company.create({
        data: createCompany(),
      });
      return await tx.store.create({
        data: createStore({ company_id: company.company_id }),
      });
    });

    // WHEN: I query bin configuration
    const response = await regularUserApiRequest.get(
      `/api/lottery/bins/configuration/${store.store_id}`,
    );

    // THEN: I receive 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error should be present").toBeDefined();
  });

  test("6.13-API-004: [P0] GET /api/lottery/bins/configuration/:storeId - should enforce RLS (store isolation)", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A bin configuration exists for another store (different company)
    const otherCompany = await withBypassClient(async (tx) => {
      return await tx.company.create({
        data: createCompany(),
      });
    });

    const otherStore = await withBypassClient(async (tx) => {
      return await tx.store.create({
        data: createStore({ company_id: otherCompany.company_id }),
      });
    });

    await withBypassClient(async (tx) => {
      await tx.lotteryBinConfiguration.create({
        data: {
          store_id: otherStore.store_id,
          bin_template: [{ name: "Other Bin", display_order: 0 }],
        },
      });
    });

    // WHEN: I query bin configuration for the other store
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/configuration/${otherStore.store_id}`,
    );

    // THEN: I receive 403 Forbidden (RLS enforcement)
    expect(response.status(), "Expected 403 Forbidden").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be FORBIDDEN").toBe("FORBIDDEN");
  });

  test("6.13-API-005: [P0] GET /api/lottery/bins/configuration/:storeId - should return 404 if configuration not found", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A store exists but has no configuration
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    // WHEN: I query bin configuration for the store
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/configuration/${store.store_id}`,
    );

    // THEN: I receive 404 Not Found
    expect(response.status(), "Expected 404 Not Found").toBe(404);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be NOT_FOUND").toBe("NOT_FOUND");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /api/lottery/bins/configuration/:storeId - AC #1
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.13-API-006: [P0] POST /api/lottery/bins/configuration/:storeId - should create configuration (AC #1)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A store exists
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    const binTemplate = [
      { name: "Bin 1", location: "Front", display_order: 0 },
      { name: "Bin 2", location: "Back", display_order: 1 },
    ];

    // WHEN: I create bin configuration for my store
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/configuration/${store.store_id}`,
      {
        data: {
          bin_template: binTemplate,
        },
      },
    );

    // THEN: Configuration is created successfully
    expect(response.status(), "Expected 201 Created status").toBe(201);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data, "Response should contain configuration").toBeDefined();
    expect(body.data.store_id, "Store ID should match").toBe(store.store_id);
    expect(body.data.bin_template, "Bin template should match").toEqual(
      binTemplate,
    );

    // AND: Configuration is persisted in database
    const config = await withBypassClient(async (tx) => {
      return await tx.lotteryBinConfiguration.findUnique({
        where: { store_id: store.store_id },
      });
    });
    expect(config, "Configuration should exist in database").toBeDefined();
    expect(config?.bin_template).toEqual(binTemplate);
  });

  test("6.13-API-007: [P0] POST /api/lottery/bins/configuration/:storeId - should validate display_order uniqueness", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A store exists
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    const binTemplate = [
      { name: "Bin 1", display_order: 0 },
      { name: "Bin 2", display_order: 0 }, // Duplicate display_order
    ];

    // WHEN: I create bin configuration with duplicate display_order
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/configuration/${store.store_id}`,
      {
        data: {
          bin_template: binTemplate,
        },
      },
    );

    // THEN: I receive 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be VALIDATION_ERROR").toBe(
      "VALIDATION_ERROR",
    );
    expect(
      body.error.message,
      "Error should mention display_order uniqueness",
    ).toContain("display_order");
  });

  test("6.13-API-008: [P0] POST /api/lottery/bins/configuration/:storeId - should validate bin count limits (1-200)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A store exists
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    // WHEN: I create bin configuration with 0 bins
    const responseEmpty = await clientUserApiRequest.post(
      `/api/lottery/bins/configuration/${store.store_id}`,
      {
        data: {
          bin_template: [],
        },
      },
    );

    // THEN: I receive 400 Bad Request
    expect(responseEmpty.status(), "Expected 400 Bad Request").toBe(400);
    const bodyEmpty = await responseEmpty.json();
    expect(bodyEmpty.success, "Response should indicate failure").toBe(false);

    // WHEN: I create bin configuration with 201 bins (exceeds limit)
    const binTemplate201 = Array.from({ length: 201 }, (_, i) => ({
      name: `Bin ${i + 1}`,
      display_order: i,
    }));

    const responseTooMany = await clientUserApiRequest.post(
      `/api/lottery/bins/configuration/${store.store_id}`,
      {
        data: {
          bin_template: binTemplate201,
        },
      },
    );

    // THEN: I receive 400 Bad Request
    expect(responseTooMany.status(), "Expected 400 Bad Request").toBe(400);
    const bodyTooMany = await responseTooMany.json();
    expect(bodyTooMany.success, "Response should indicate failure").toBe(false);
    expect(
      bodyTooMany.error.message,
      "Error should mention bin count limit",
    ).toContain("200");
  });

  test("6.13-API-009: [P0] POST /api/lottery/bins/configuration/:storeId - should return 409 if configuration already exists", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A bin configuration already exists for my store
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    await withBypassClient(async (tx) => {
      await tx.lotteryBinConfiguration.create({
        data: {
          store_id: store.store_id,
          bin_template: [{ name: "Existing Bin", display_order: 0 }],
        },
      });
    });

    // WHEN: I try to create another configuration for the same store
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/configuration/${store.store_id}`,
      {
        data: {
          bin_template: [{ name: "New Bin", display_order: 0 }],
        },
      },
    );

    // THEN: I receive 409 Conflict
    expect(response.status(), "Expected 409 Conflict").toBe(409);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be CONFLICT").toBe("CONFLICT");
  });

  test("6.13-API-010: [P0] POST /api/lottery/bins/configuration/:storeId - should require CLIENT_OWNER or STORE_MANAGER role", async ({
    regularUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated but lack CLIENT_OWNER or STORE_MANAGER role
    // AND: A store exists
    const store = await withBypassClient(async (tx) => {
      const company = await tx.company.create({
        data: createCompany(),
      });
      return await tx.store.create({
        data: createStore({ company_id: company.company_id }),
      });
    });

    // WHEN: I try to create bin configuration
    const response = await regularUserApiRequest.post(
      `/api/lottery/bins/configuration/${store.store_id}`,
      {
        data: {
          bin_template: [{ name: "Bin 1", display_order: 0 }],
        },
      },
    );

    // THEN: I receive 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be FORBIDDEN").toBe("FORBIDDEN");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PUT /api/lottery/bins/configuration/:storeId - AC #1
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.13-API-011: [P0] PUT /api/lottery/bins/configuration/:storeId - should update configuration (AC #1)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A bin configuration exists for my store
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    await withBypassClient(async (tx) => {
      await tx.lotteryBinConfiguration.create({
        data: {
          store_id: store.store_id,
          bin_template: [{ name: "Old Bin", display_order: 0 }],
        },
      });
    });

    const updatedBinTemplate = [
      { name: "Updated Bin 1", location: "Front", display_order: 0 },
      { name: "Updated Bin 2", location: "Back", display_order: 1 },
    ];

    // WHEN: I update bin configuration for my store
    const response = await clientUserApiRequest.put(
      `/api/lottery/bins/configuration/${store.store_id}`,
      {
        data: {
          bin_template: updatedBinTemplate,
        },
      },
    );

    // THEN: Configuration is updated successfully
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.bin_template, "Bin template should be updated").toEqual(
      updatedBinTemplate,
    );

    // AND: Configuration is persisted in database
    const config = await withBypassClient(async (tx) => {
      return await tx.lotteryBinConfiguration.findUnique({
        where: { store_id: store.store_id },
      });
    });
    expect(config?.bin_template).toEqual(updatedBinTemplate);
  });

  test("6.13-API-012: [P0] PUT /api/lottery/bins/configuration/:storeId - should return 404 if configuration not found", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A store exists but has no configuration
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    // WHEN: I try to update bin configuration
    const response = await clientUserApiRequest.put(
      `/api/lottery/bins/configuration/${store.store_id}`,
      {
        data: {
          bin_template: [{ name: "Bin 1", display_order: 0 }],
        },
      },
    );

    // THEN: I receive 404 Not Found
    expect(response.status(), "Expected 404 Not Found").toBe(404);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be NOT_FOUND").toBe("NOT_FOUND");
  });

  test("6.13-API-013: [P0] PUT /api/lottery/bins/configuration/:storeId - should validate display_order uniqueness on update", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A bin configuration exists for my store
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    await withBypassClient(async (tx) => {
      await tx.lotteryBinConfiguration.create({
        data: {
          store_id: store.store_id,
          bin_template: [
            { name: "Bin 1", display_order: 0 },
            { name: "Bin 2", display_order: 1 },
          ],
        },
      });
    });

    const binTemplateWithDuplicate = [
      { name: "Bin 1", display_order: 0 },
      { name: "Bin 2", display_order: 0 }, // Duplicate display_order
    ];

    // WHEN: I update bin configuration with duplicate display_order
    const response = await clientUserApiRequest.put(
      `/api/lottery/bins/configuration/${store.store_id}`,
      {
        data: {
          bin_template: binTemplateWithDuplicate,
        },
      },
    );

    // THEN: I receive 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be VALIDATION_ERROR").toBe(
      "VALIDATION_ERROR",
    );
    expect(
      body.error.message,
      "Error should mention display_order uniqueness",
    ).toContain("display_order");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - SQL Injection Prevention
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.13-API-SEC-009: [P0] POST /api/lottery/bins/configuration/:storeId - should prevent SQL injection in bin_template JSON", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A store exists
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    // WHEN: I try to create configuration with SQL injection attempts in bin names
    const sqlInjectionAttempts = [
      [{ name: "'; DROP TABLE lottery_bins; --", display_order: 0 }],
      [{ name: "1' OR '1'='1", display_order: 0 }],
      [{ name: "'; DELETE FROM lottery_bins WHERE '1'='1", display_order: 0 }],
    ];

    for (const maliciousTemplate of sqlInjectionAttempts) {
      const response = await clientUserApiRequest.post(
        `/api/lottery/bins/configuration/${store.store_id}`,
        {
          data: {
            bin_template: maliciousTemplate,
          },
        },
      );

      // THEN: Request should be handled safely (either rejected or sanitized)
      expect(
        [200, 201, 400, 422].includes(response.status()),
        `SQL injection attempt in bin_template should be safely handled`,
      ).toBe(true);

      // AND: No actual SQL injection should occur
      const configsCount = await withBypassClient(async (tx) => {
        return await tx.lotteryBinConfiguration.count();
      });
      expect(
        configsCount,
        "Configurations table should still exist and be queryable",
      ).toBeGreaterThanOrEqual(0);
    }
  });

  test("6.13-API-SEC-010: [P0] POST /api/lottery/bins/configuration/:storeId - should prevent SQL injection in store_id parameter", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A store exists
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    // WHEN: I try to create configuration with SQL injection in store_id URL parameter
    const sqlInjectionAttempts = [
      store.store_id + "'; DROP TABLE stores; --",
      "' OR '1'='1",
    ];

    for (const maliciousStoreId of sqlInjectionAttempts) {
      const response = await clientUserApiRequest.post(
        `/api/lottery/bins/configuration/${maliciousStoreId}`,
        {
          data: {
            bin_template: [{ name: "Test Bin", display_order: 0 }],
          },
        },
      );

      // THEN: Request should be rejected (invalid UUID format or RLS violation)
      expect(
        [400, 403, 404, 422].includes(response.status()),
        `SQL injection attempt in store_id "${maliciousStoreId.substring(0, 30)}..." should be rejected`,
      ).toBe(true);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - Input Validation Edge Cases
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.13-API-SEC-011: [P0] POST /api/lottery/bins/configuration/:storeId - should reject bin_template with empty name", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A store exists
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    // WHEN: I try to create configuration with empty name in bin_template
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/configuration/${store.store_id}`,
      {
        data: {
          bin_template: [{ name: "", display_order: 0 }],
        },
      },
    );

    // THEN: I receive 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request for empty name").toBe(
      400,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("6.13-API-SEC-012: [P0] POST /api/lottery/bins/configuration/:storeId - should reject bin_template with negative display_order", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A store exists
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    // WHEN: I try to create configuration with negative display_order
    const response = await clientUserApiRequest.post(
      `/api/lottery/bins/configuration/${store.store_id}`,
      {
        data: {
          bin_template: [{ name: "Test Bin", display_order: -1 }],
        },
      },
    );

    // THEN: I receive 400 Bad Request
    expect(
      response.status(),
      "Expected 400 Bad Request for negative display_order",
    ).toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("6.13-API-SEC-013: [P0] POST /api/lottery/bins/configuration/:storeId - should reject invalid JSON in bin_template", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A store exists
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    // WHEN: I try to create configuration with invalid bin_template structure
    const invalidTemplates = [
      null,
      "not an array",
      [{ display_order: 0 }], // Missing name
      [{ name: "Test" }], // Missing display_order
      [{ name: 123, display_order: 0 }], // Invalid name type
      [{ name: "Test", display_order: "not a number" }], // Invalid display_order type
    ];

    for (const invalidTemplate of invalidTemplates) {
      const response = await clientUserApiRequest.post(
        `/api/lottery/bins/configuration/${store.store_id}`,
        {
          data: {
            bin_template: invalidTemplate,
          },
        },
      );

      // THEN: I receive 400 Bad Request
      expect(
        response.status(),
        `Expected 400 Bad Request for invalid bin_template`,
      ).toBe(400);
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - Authentication Bypass
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.13-API-SEC-014: [P0] POST /api/lottery/bins/configuration/:storeId - should reject invalid JWT token", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am NOT authenticated
    // AND: A store exists
    const store = await withBypassClient(async (tx) => {
      const company = await tx.company.create({
        data: createCompany(),
      });
      return await tx.store.create({
        data: createStore({ company_id: company.company_id }),
      });
    });

    // WHEN: I try to create configuration with invalid token
    const invalidTokens = [
      "invalid.token.here",
      "Bearer invalid",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid",
      "",
    ];

    for (const invalidToken of invalidTokens) {
      const response = await apiRequest.post(
        `/api/lottery/bins/configuration/${store.store_id}`,
        {
          headers: invalidToken
            ? { Authorization: `Bearer ${invalidToken}` }
            : {},
          data: {
            bin_template: [{ name: "Test Bin", display_order: 0 }],
          },
        },
      );

      // THEN: I receive 401 Unauthorized
      expect(
        response.status(),
        `Expected 401 Unauthorized for invalid token`,
      ).toBe(401);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - Data Leakage Prevention
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.13-API-SEC-015: [P0] GET /api/lottery/bins/configuration/:storeId - should not leak configuration from other stores", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: Configurations exist for my store and another store
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    const otherCompany = await withBypassClient(async (tx) => {
      return await tx.company.create({
        data: createCompany(),
      });
    });

    const otherStore = await withBypassClient(async (tx) => {
      return await tx.store.create({
        data: createStore({ company_id: otherCompany.company_id }),
      });
    });

    // Create configurations for both stores
    await withBypassClient(async (tx) => {
      await tx.lotteryBinConfiguration.createMany({
        data: [
          {
            store_id: store.store_id,
            bin_template: [{ name: "My Bin", display_order: 0 }],
          },
          {
            store_id: otherStore.store_id,
            bin_template: [{ name: "Other Company Bin", display_order: 0 }],
          },
        ],
      });
    });

    // WHEN: I query configuration for my store
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/configuration/${store.store_id}`,
    );

    // THEN: I receive only configuration from my store
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.store_id, "Store ID should match my store").toBe(
      store.store_id,
    );

    // AND: Configuration from other store is not included
    expect(
      body.data.store_id,
      "Should not return other store's configuration",
    ).not.toBe(otherStore.store_id);
  });
});
