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
 * - Error handling (401, 403, 404, 400, 409)
 * - Security: SQL injection, authentication bypass, authorization, input validation, data leakage
 *
 * @test-level API
 * @justification Tests API endpoints with authentication, authorization, database operations, and business logic
 * @story 6-13 - Lottery Database Enhancements & Bin Management
 * @priority P0 (Critical - Security, Data Integrity, Business Logic)
 *
 * Fixtures Used:
 * - storeManagerApiRequest/storeManagerUser: Has LOTTERY_BIN_CONFIG_READ, LOTTERY_BIN_CONFIG_WRITE, STORE_MANAGER role
 * - regularUserApiRequest: Lacks lottery bin config permissions
 * - apiRequest: Unauthenticated requests
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createCompany,
  createStore,
  createUser,
} from "../support/factories/database.factory";
import { withBypassClient } from "../support/prisma-bypass";

test.describe("6.13-API: Lottery Bin Configuration Endpoints", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/lottery/bins/configuration/:storeId - AC #1
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.13-API-001: [P0] GET /api/lottery/bins/configuration/:storeId - should return configuration for store (AC #1)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with lottery bin config permissions
    // AND: A bin configuration exists for my store
    const binTemplate = [
      { name: "Bin 1", location: "Front", display_order: 0 },
      { name: "Bin 2", location: "Back", display_order: 1 },
    ];

    await prismaClient.lotteryBinConfiguration.create({
      data: {
        store_id: storeManagerUser.store_id,
        bin_template: binTemplate,
      },
    });

    try {
      // WHEN: I query bin configuration for my store
      const response = await storeManagerApiRequest.get(
        `/api/lottery/bins/configuration/${storeManagerUser.store_id}`,
      );

      // THEN: I receive the bin configuration
      expect(response.status(), "Expected 200 OK status").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data, "Response should contain configuration").toBeDefined();
      expect(body.data.store_id, "Store ID should match").toBe(
        storeManagerUser.store_id,
      );
      expect(body.data.bin_template, "Bin template should match").toEqual(
        binTemplate,
      );
    } finally {
      // Cleanup
      await prismaClient.lotteryBinConfiguration.deleteMany({
        where: { store_id: storeManagerUser.store_id },
      });
    }
  });

  test("6.13-API-002: [P0] GET /api/lottery/bins/configuration/:storeId - should require authentication", async ({
    apiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: I am NOT authenticated
    // AND: A store exists
    // WHEN: I query bin configuration without authentication
    const response = await apiRequest.get(
      `/api/lottery/bins/configuration/${storeManagerUser.store_id}`,
    );

    // THEN: I receive 401 Unauthorized
    expect(response.status(), "Expected 401 Unauthorized").toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error should be present").toBeDefined();
  });

  test("6.13-API-003: [P0] GET /api/lottery/bins/configuration/:storeId - should require LOTTERY_BIN_CONFIG_READ permission", async ({
    regularUserApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: I am authenticated but lack LOTTERY_BIN_CONFIG_READ permission
    // WHEN: I query bin configuration
    const response = await regularUserApiRequest.get(
      `/api/lottery/bins/configuration/${storeManagerUser.store_id}`,
    );

    // THEN: I receive 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error should be present").toBeDefined();
  });

  test("6.13-API-004: [P0] GET /api/lottery/bins/configuration/:storeId - should enforce RLS (store isolation)", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A bin configuration exists for another store (different company)

    // Create another company and store (not owned by store manager's company)
    const otherOwnerUser = await prismaClient.user.create({
      data: createUser(),
    });

    const otherCompany = await prismaClient.company.create({
      data: createCompany({ owner_user_id: otherOwnerUser.user_id }),
    });

    const storeData = createStore({ company_id: otherCompany.company_id });
    const otherStore = await prismaClient.store.create({
      data: {
        ...storeData,
        location_json: storeData.location_json as any,
      },
    });

    await prismaClient.lotteryBinConfiguration.create({
      data: {
        store_id: otherStore.store_id,
        bin_template: [{ name: "Other Bin", display_order: 0 }],
      },
    });

    try {
      // WHEN: I query bin configuration for the other store
      const response = await storeManagerApiRequest.get(
        `/api/lottery/bins/configuration/${otherStore.store_id}`,
      );

      // THEN: I receive 403 Forbidden (RLS enforcement via permission middleware)
      // Note: Permission middleware returns PERMISSION_DENIED because store manager
      // has STORE scope for their own store only, not for other stores
      expect(response.status(), "Expected 403 Forbidden").toBe(403);
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
      expect(body.error.code, "Error code should be PERMISSION_DENIED").toBe(
        "PERMISSION_DENIED",
      );
    } finally {
      // Cleanup
      await prismaClient.lotteryBinConfiguration.deleteMany({
        where: { store_id: otherStore.store_id },
      });
      await prismaClient.store.delete({
        where: { store_id: otherStore.store_id },
      });
      await prismaClient.company.delete({
        where: { company_id: otherCompany.company_id },
      });
      await prismaClient.user.delete({
        where: { user_id: otherOwnerUser.user_id },
      });
    }
  });

  test("6.13-API-005: [P0] GET /api/lottery/bins/configuration/:storeId - should return 404 if configuration not found", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A store exists but has no configuration

    // Ensure no configuration exists (clean state)
    await prismaClient.lotteryBinConfiguration.deleteMany({
      where: { store_id: storeManagerUser.store_id },
    });

    // WHEN: I query bin configuration for the store
    const response = await storeManagerApiRequest.get(
      `/api/lottery/bins/configuration/${storeManagerUser.store_id}`,
    );

    // THEN: I receive 404 Not Found
    const body = await response.json();
    expect(response.status(), "Expected 404 Not Found").toBe(404);
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error object should be present").toBeDefined();
    expect(body.error.code, "Error code should be NOT_FOUND").toBe("NOT_FOUND");
    expect(body.error.message, "Error message should be present").toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /api/lottery/bins/configuration/:storeId - AC #1
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.13-API-006: [P0] POST /api/lottery/bins/configuration/:storeId - should create configuration (AC #1)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A store exists

    const binTemplate = [
      { name: "Bin 1", location: "Front", display_order: 0 },
      { name: "Bin 2", location: "Back", display_order: 1 },
    ];

    try {
      // WHEN: I create bin configuration for my store
      const response = await storeManagerApiRequest.post(
        `/api/lottery/bins/configuration/${storeManagerUser.store_id}`,
        {
          bin_template: binTemplate,
        },
      );

      // THEN: Configuration is created successfully
      expect(response.status(), "Expected 201 Created status").toBe(201);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data, "Response should contain configuration").toBeDefined();
      expect(body.data.store_id, "Store ID should match").toBe(
        storeManagerUser.store_id,
      );
      expect(body.data.bin_template, "Bin template should match").toEqual(
        binTemplate,
      );

      // AND: Configuration is persisted in database
      const config = await prismaClient.lotteryBinConfiguration.findUnique({
        where: { store_id: storeManagerUser.store_id },
      });
      expect(config, "Configuration should exist in database").toBeDefined();
      expect(config?.bin_template).toEqual(binTemplate);
    } finally {
      // Cleanup
      await prismaClient.lotteryBinConfiguration.deleteMany({
        where: { store_id: storeManagerUser.store_id },
      });
    }
  });

  test("6.13-API-007: [P0] POST /api/lottery/bins/configuration/:storeId - should validate display_order uniqueness", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A store exists

    const binTemplate = [
      { name: "Bin 1", display_order: 0 },
      { name: "Bin 2", display_order: 0 }, // Duplicate display_order
    ];

    // WHEN: I create bin configuration with duplicate display_order
    const response = await storeManagerApiRequest.post(
      `/api/lottery/bins/configuration/${storeManagerUser.store_id}`,
      {
        bin_template: binTemplate,
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
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A store exists

    // WHEN: I create bin configuration with 0 bins
    const responseEmpty = await storeManagerApiRequest.post(
      `/api/lottery/bins/configuration/${storeManagerUser.store_id}`,
      {
        bin_template: [],
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

    const responseTooMany = await storeManagerApiRequest.post(
      `/api/lottery/bins/configuration/${storeManagerUser.store_id}`,
      {
        bin_template: binTemplate201,
      },
    );

    // THEN: I receive 400 Bad Request
    expect(responseTooMany.status(), "Expected 400 Bad Request").toBe(400);
    const bodyTooMany = await responseTooMany.json();
    expect(bodyTooMany.success, "Response should indicate failure").toBe(false);
  });

  test("6.13-API-009: [P0] POST /api/lottery/bins/configuration/:storeId - should return 409 if configuration already exists", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A bin configuration already exists for my store

    await prismaClient.lotteryBinConfiguration.create({
      data: {
        store_id: storeManagerUser.store_id,
        bin_template: [{ name: "Existing Bin", display_order: 0 }],
      },
    });

    try {
      // WHEN: I try to create another configuration for the same store
      const response = await storeManagerApiRequest.post(
        `/api/lottery/bins/configuration/${storeManagerUser.store_id}`,
        {
          bin_template: [{ name: "New Bin", display_order: 0 }],
        },
      );

      // THEN: I receive 409 Conflict
      expect(response.status(), "Expected 409 Conflict").toBe(409);
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
      expect(body.error.code, "Error code should be CONFLICT").toBe("CONFLICT");
    } finally {
      // Cleanup
      await prismaClient.lotteryBinConfiguration.deleteMany({
        where: { store_id: storeManagerUser.store_id },
      });
    }
  });

  test("6.13-API-010: [P0] POST /api/lottery/bins/configuration/:storeId - should require CLIENT_OWNER or STORE_MANAGER role", async ({
    regularUserApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: I am authenticated but lack CLIENT_OWNER or STORE_MANAGER role
    // WHEN: I try to create bin configuration
    const response = await regularUserApiRequest.post(
      `/api/lottery/bins/configuration/${storeManagerUser.store_id}`,
      {
        bin_template: [{ name: "Bin 1", display_order: 0 }],
      },
    );

    // THEN: I receive 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PUT /api/lottery/bins/configuration/:storeId - AC #1
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.13-API-011: [P0] PUT /api/lottery/bins/configuration/:storeId - should update configuration (AC #1)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A bin configuration exists for my store

    await prismaClient.lotteryBinConfiguration.create({
      data: {
        store_id: storeManagerUser.store_id,
        bin_template: [{ name: "Old Bin", display_order: 0 }],
      },
    });

    const updatedBinTemplate = [
      { name: "Updated Bin 1", location: "Front", display_order: 0 },
      { name: "Updated Bin 2", location: "Back", display_order: 1 },
    ];

    try {
      // WHEN: I update bin configuration for my store
      const response = await storeManagerApiRequest.put(
        `/api/lottery/bins/configuration/${storeManagerUser.store_id}`,
        {
          bin_template: updatedBinTemplate,
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
      const config = await prismaClient.lotteryBinConfiguration.findUnique({
        where: { store_id: storeManagerUser.store_id },
      });
      expect(config?.bin_template).toEqual(updatedBinTemplate);
    } finally {
      // Cleanup
      await prismaClient.lotteryBinConfiguration.deleteMany({
        where: { store_id: storeManagerUser.store_id },
      });
    }
  });

  test("6.13-API-012: [P0] PUT /api/lottery/bins/configuration/:storeId - should return 404 if configuration not found", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A store exists but has no configuration

    // WHEN: I try to update bin configuration
    const response = await storeManagerApiRequest.put(
      `/api/lottery/bins/configuration/${storeManagerUser.store_id}`,
      {
        bin_template: [{ name: "Bin 1", display_order: 0 }],
      },
    );

    // THEN: I receive 404 Not Found
    expect(response.status(), "Expected 404 Not Found").toBe(404);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be NOT_FOUND").toBe("NOT_FOUND");
  });

  test("6.13-API-013: [P0] PUT /api/lottery/bins/configuration/:storeId - should validate display_order uniqueness on update", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A bin configuration exists for my store

    await prismaClient.lotteryBinConfiguration.create({
      data: {
        store_id: storeManagerUser.store_id,
        bin_template: [
          { name: "Bin 1", display_order: 0 },
          { name: "Bin 2", display_order: 1 },
        ],
      },
    });

    const binTemplateWithDuplicate = [
      { name: "Bin 1", display_order: 0 },
      { name: "Bin 2", display_order: 0 }, // Duplicate display_order
    ];

    try {
      // WHEN: I update bin configuration with duplicate display_order
      const response = await storeManagerApiRequest.put(
        `/api/lottery/bins/configuration/${storeManagerUser.store_id}`,
        {
          bin_template: binTemplateWithDuplicate,
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
    } finally {
      // Cleanup
      await prismaClient.lotteryBinConfiguration.deleteMany({
        where: { store_id: storeManagerUser.store_id },
      });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - SQL Injection Prevention
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.13-API-SEC-009: [P0] POST /api/lottery/bins/configuration/:storeId - should prevent SQL injection in bin_template JSON", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager

    try {
      // WHEN: I try to create configuration with SQL injection attempts in bin names
      const sqlInjectionAttempts = [
        [{ name: "'; DROP TABLE lottery_bins; --", display_order: 0 }],
        [{ name: "1' OR '1'='1", display_order: 0 }],
        [
          {
            name: "'; DELETE FROM lottery_bins WHERE '1'='1",
            display_order: 0,
          },
        ],
      ];

      for (const maliciousTemplate of sqlInjectionAttempts) {
        const response = await storeManagerApiRequest.post(
          `/api/lottery/bins/configuration/${storeManagerUser.store_id}`,
          {
            bin_template: maliciousTemplate,
          },
        );

        // THEN: Request should be handled safely (either rejected or sanitized)
        expect(
          [200, 201, 400, 409, 422].includes(response.status()),
          `SQL injection attempt in bin_template should be safely handled`,
        ).toBe(true);

        // Clean up for next iteration
        if (response.status() === 201) {
          await prismaClient.lotteryBinConfiguration.deleteMany({
            where: { store_id: storeManagerUser.store_id },
          });
        }
      }

      // AND: No actual SQL injection should occur
      const configsCount = await prismaClient.lotteryBinConfiguration.count();
      expect(
        configsCount,
        "Configurations table should still exist and be queryable",
      ).toBeGreaterThanOrEqual(0);
    } finally {
      // Cleanup
      await prismaClient.lotteryBinConfiguration.deleteMany({
        where: { store_id: storeManagerUser.store_id },
      });
    }
  });

  test("6.13-API-SEC-010: [P0] POST /api/lottery/bins/configuration/:storeId - should prevent SQL injection in store_id parameter", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: I am authenticated as a Store Manager

    // WHEN: I try to create configuration with SQL injection in store_id URL parameter
    const sqlInjectionAttempts = [
      storeManagerUser.store_id + "'; DROP TABLE stores; --",
      "' OR '1'='1",
    ];

    for (const maliciousStoreId of sqlInjectionAttempts) {
      const response = await storeManagerApiRequest.post(
        `/api/lottery/bins/configuration/${maliciousStoreId}`,
        {
          bin_template: [{ name: "Test Bin", display_order: 0 }],
        },
      );

      // THEN: Request should be rejected (invalid UUID format or RLS violation)
      expect(
        [400, 403, 404, 422].includes(response.status()),
        `SQL injection attempt in store_id should be rejected`,
      ).toBe(true);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - Input Validation Edge Cases
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.13-API-SEC-011: [P0] POST /api/lottery/bins/configuration/:storeId - should reject bin_template with empty name", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: I am authenticated as a Store Manager

    // WHEN: I try to create configuration with empty name in bin_template
    const response = await storeManagerApiRequest.post(
      `/api/lottery/bins/configuration/${storeManagerUser.store_id}`,
      {
        bin_template: [{ name: "", display_order: 0 }],
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
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: I am authenticated as a Store Manager

    // WHEN: I try to create configuration with negative display_order
    const response = await storeManagerApiRequest.post(
      `/api/lottery/bins/configuration/${storeManagerUser.store_id}`,
      {
        bin_template: [{ name: "Test Bin", display_order: -1 }],
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
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager

    // Ensure no configuration exists (prevents 409 Conflict masking validation errors)
    await prismaClient.lotteryBinConfiguration.deleteMany({
      where: { store_id: storeManagerUser.store_id },
    });

    // WHEN: I try to create configuration with invalid bin_template structure
    // These should all be rejected by Fastify's JSON schema validation
    // Note: Fastify with ajv coerceTypes may convert some values (e.g., 123 -> "123")
    // so we test cases that cannot be coerced
    const invalidTemplates: { template: any; description: string }[] = [
      { template: null, description: "null value" },
      { template: "not an array", description: "string instead of array" },
      { template: [{ display_order: 0 }], description: "missing name" },
      { template: [{ name: "Test" }], description: "missing display_order" },
      // Note: { name: 123 } may be coerced to "123" by Fastify - not testing as invalid
      {
        template: [{ name: "Test", display_order: "abc" }],
        description: "display_order is non-numeric string",
      },
      { template: [], description: "empty array (minItems: 1 required)" },
    ];

    for (const { template, description } of invalidTemplates) {
      const response = await storeManagerApiRequest.post(
        `/api/lottery/bins/configuration/${storeManagerUser.store_id}`,
        {
          bin_template: template,
        },
      );

      // THEN: I receive 400 Bad Request
      expect(
        response.status(),
        `Expected 400 Bad Request for invalid bin_template (${description}), got ${response.status()}`,
      ).toBe(400);
      const body = await response.json();
      expect(
        body.success,
        `Response should indicate failure for ${description}`,
      ).toBe(false);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - Authentication Bypass
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.13-API-SEC-014: [P0] POST /api/lottery/bins/configuration/:storeId - should reject invalid JWT token", async ({
    request,
    backendUrl,
    storeManagerUser,
  }) => {
    // GIVEN: I am NOT properly authenticated
    // WHEN: I try to create configuration with invalid token
    const invalidTokens = [
      "invalid.token.here",
      "Bearer invalid",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid",
      "",
    ];

    for (const invalidToken of invalidTokens) {
      const response = await request.post(
        `${backendUrl}/api/lottery/bins/configuration/${storeManagerUser.store_id}`,
        {
          data: {
            bin_template: [{ name: "Test Bin", display_order: 0 }],
          },
          headers: invalidToken
            ? {
                Cookie: `access_token=${invalidToken}`,
                "Content-Type": "application/json",
              }
            : { "Content-Type": "application/json" },
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
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: Configurations exist for my store and another store

    // Create another company and store (not owned by store manager's company)
    const otherOwnerUser = await prismaClient.user.create({
      data: createUser(),
    });

    const otherCompany = await prismaClient.company.create({
      data: createCompany({ owner_user_id: otherOwnerUser.user_id }),
    });

    const storeData = createStore({ company_id: otherCompany.company_id });
    const otherStore = await prismaClient.store.create({
      data: {
        ...storeData,
        location_json: storeData.location_json as any,
      },
    });

    // Create configurations for both stores
    await prismaClient.lotteryBinConfiguration.createMany({
      data: [
        {
          store_id: storeManagerUser.store_id,
          bin_template: [{ name: "My Bin", display_order: 0 }],
        },
        {
          store_id: otherStore.store_id,
          bin_template: [{ name: "Other Company Bin", display_order: 0 }],
        },
      ],
    });

    try {
      // WHEN: I query configuration for my store
      const response = await storeManagerApiRequest.get(
        `/api/lottery/bins/configuration/${storeManagerUser.store_id}`,
      );

      // THEN: I receive only configuration from my store
      expect(response.status(), "Expected 200 OK status").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data.store_id, "Store ID should match my store").toBe(
        storeManagerUser.store_id,
      );

      // AND: Configuration from other store is not included
      expect(
        body.data.store_id,
        "Should not return other store's configuration",
      ).not.toBe(otherStore.store_id);
    } finally {
      // Cleanup
      await prismaClient.lotteryBinConfiguration.deleteMany({
        where: {
          store_id: { in: [storeManagerUser.store_id, otherStore.store_id] },
        },
      });
      await prismaClient.store.delete({
        where: { store_id: otherStore.store_id },
      });
      await prismaClient.company.delete({
        where: { company_id: otherCompany.company_id },
      });
      await prismaClient.user.delete({
        where: { user_id: otherOwnerUser.user_id },
      });
    }
  });
});
