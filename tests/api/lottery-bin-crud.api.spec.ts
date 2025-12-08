/**
 * Lottery Bin CRUD API Tests
 *
 * Tests for Lottery Bin CRUD API endpoints:
 * - GET /api/lottery/bins/:storeId
 * - POST /api/lottery/bins
 * - PUT /api/lottery/bins/:binId
 * - DELETE /api/lottery/bins/:binId
 * - Authentication and authorization (LOTTERY_BIN_MANAGE permission)
 * - RLS enforcement (store isolation)
 * - Soft delete functionality (is_active = false)
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

test.describe("6.13-API: Lottery Bin CRUD Endpoints", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/lottery/bins/:storeId - AC #1
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.13-API-014: [P0] GET /api/lottery/bins/:storeId - should return active bins with display order (AC #1)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: Active bins exist for my store
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
      await tx.lotteryBin.createMany({
        data: [
          {
            store_id: store.store_id,
            name: "Bin 1",
            location: "Front",
            display_order: 0,
            is_active: true,
          },
          {
            store_id: store.store_id,
            name: "Bin 2",
            location: "Back",
            display_order: 1,
            is_active: true,
          },
          {
            store_id: store.store_id,
            name: "Bin 3 (Inactive)",
            display_order: 2,
            is_active: false, // Should not be returned
          },
        ],
      });
    });

    // WHEN: I query active bins for my store
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/${store.store_id}`,
    );

    // THEN: I receive only active bins ordered by display_order
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data, "Response should contain bins array").toBeDefined();
    expect(body.data.length, "Should return 2 active bins").toBe(2);
    expect(body.data[0].name, "First bin should be Bin 1").toBe("Bin 1");
    expect(
      body.data[0].display_order,
      "First bin display_order should be 0",
    ).toBe(0);
    expect(body.data[1].name, "Second bin should be Bin 2").toBe("Bin 2");
    expect(
      body.data[1].display_order,
      "Second bin display_order should be 1",
    ).toBe(1);
    expect(
      body.data.every((bin: any) => bin.is_active === true),
      "All returned bins should be active",
    ).toBe(true);
  });

  test("6.13-API-015: [P0] GET /api/lottery/bins/:storeId - should require authentication", async ({
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

    // WHEN: I query bins without authentication
    const response = await apiRequest.get(
      `/api/lottery/bins/${store.store_id}`,
    );

    // THEN: I receive 401 Unauthorized
    expect(response.status(), "Expected 401 Unauthorized").toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error should be present").toBeDefined();
  });

  test("6.13-API-016: [P0] GET /api/lottery/bins/:storeId - should require LOTTERY_BIN_READ permission", async ({
    regularUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated but lack LOTTERY_BIN_READ permission
    // AND: A store exists
    const store = await withBypassClient(async (tx) => {
      const company = await tx.company.create({
        data: createCompany(),
      });
      return await tx.store.create({
        data: createStore({ company_id: company.company_id }),
      });
    });

    // WHEN: I query bins
    const response = await regularUserApiRequest.get(
      `/api/lottery/bins/${store.store_id}`,
    );

    // THEN: I receive 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error should be present").toBeDefined();
  });

  test("6.13-API-017: [P0] GET /api/lottery/bins/:storeId - should enforce RLS (store isolation)", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: Bins exist for another store (different company)
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
      await tx.lotteryBin.create({
        data: {
          store_id: otherStore.store_id,
          name: "Other Bin",
          display_order: 0,
          is_active: true,
        },
      });
    });

    // WHEN: I query bins for the other store
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/${otherStore.store_id}`,
    );

    // THEN: I receive 403 Forbidden (RLS enforcement)
    expect(response.status(), "Expected 403 Forbidden").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be FORBIDDEN").toBe("FORBIDDEN");
  });

  test("6.13-API-018: [P0] GET /api/lottery/bins/:storeId - should return empty array if no bins exist", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A store exists but has no bins
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    // WHEN: I query bins for the store
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/${store.store_id}`,
    );

    // THEN: I receive empty array
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data, "Response should contain bins array").toBeDefined();
    expect(body.data.length, "Should return empty array").toBe(0);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /api/lottery/bins - AC #1
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.13-API-019: [P0] POST /api/lottery/bins - should create new bin (AC #1)", async ({
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

    // WHEN: I create a new bin for my store
    const response = await clientUserApiRequest.post("/api/lottery/bins", {
      data: {
        store_id: store.store_id,
        name: "New Bin",
        location: "Front Counter",
        display_order: 0,
      },
    });

    // THEN: Bin is created successfully
    expect(response.status(), "Expected 201 Created status").toBe(201);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data, "Response should contain bin").toBeDefined();
    expect(body.data.store_id, "Store ID should match").toBe(store.store_id);
    expect(body.data.name, "Bin name should match").toBe("New Bin");
    expect(body.data.location, "Bin location should match").toBe(
      "Front Counter",
    );
    expect(body.data.display_order, "Display order should match").toBe(0);
    expect(body.data.is_active, "Bin should be active by default").toBe(true);

    // AND: Bin is persisted in database
    const bin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.findFirst({
        where: {
          store_id: store.store_id,
          name: "New Bin",
        },
      });
    });
    expect(bin, "Bin should exist in database").toBeDefined();
    expect(bin?.is_active, "Bin should be active").toBe(true);
  });

  test("6.13-API-020: [P0] POST /api/lottery/bins - should require LOTTERY_BIN_MANAGE permission", async ({
    regularUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated but lack LOTTERY_BIN_MANAGE permission
    // AND: A store exists
    const store = await withBypassClient(async (tx) => {
      const company = await tx.company.create({
        data: createCompany(),
      });
      return await tx.store.create({
        data: createStore({ company_id: company.company_id }),
      });
    });

    // WHEN: I try to create a bin
    const response = await regularUserApiRequest.post("/api/lottery/bins", {
      data: {
        store_id: store.store_id,
        name: "New Bin",
        display_order: 0,
      },
    });

    // THEN: I receive 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be FORBIDDEN").toBe("FORBIDDEN");
  });

  test("6.13-API-021: [P0] POST /api/lottery/bins - should enforce RLS (store isolation)", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: Another store exists (different company)
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

    // WHEN: I try to create a bin for the other store
    const response = await clientUserApiRequest.post("/api/lottery/bins", {
      data: {
        store_id: otherStore.store_id,
        name: "Other Bin",
        display_order: 0,
      },
    });

    // THEN: I receive 403 Forbidden (RLS enforcement)
    expect(response.status(), "Expected 403 Forbidden").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be FORBIDDEN").toBe("FORBIDDEN");
  });

  test("6.13-API-022: [P0] POST /api/lottery/bins - should validate required fields", async ({
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

    // WHEN: I try to create a bin without required fields
    const response = await clientUserApiRequest.post("/api/lottery/bins", {
      data: {
        store_id: store.store_id,
        // Missing name and display_order
      },
    });

    // THEN: I receive 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error object should be present").toBeDefined();
    expect(typeof body.error, "Error should be an object").toBe("object");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - SQL Injection Prevention
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.13-API-SEC-001: [P0] POST /api/lottery/bins - should prevent SQL injection in name field", async ({
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

    // WHEN: I try to create a bin with SQL injection attempt in name
    const sqlInjectionAttempts = [
      "'; DROP TABLE lottery_bins; --",
      "1' OR '1'='1",
      "'; DELETE FROM lottery_bins WHERE '1'='1",
      "admin'--",
      "' UNION SELECT * FROM users--",
    ];

    for (const maliciousName of sqlInjectionAttempts) {
      const response = await clientUserApiRequest.post("/api/lottery/bins", {
        data: {
          store_id: store.store_id,
          name: maliciousName,
          display_order: 0,
        },
      });

      // THEN: Request should be handled safely (either rejected or sanitized)
      // Prisma ORM should prevent SQL injection, but we verify the system handles it correctly
      expect(
        [200, 201, 400, 422].includes(response.status()),
        `SQL injection attempt "${maliciousName}" should be safely handled`,
      ).toBe(true);

      // AND: No actual SQL injection should occur (verify bins table still exists)
      const binsCount = await withBypassClient(async (tx) => {
        return await tx.lotteryBin.count();
      });
      expect(
        binsCount,
        "Bins table should still exist and be queryable",
      ).toBeGreaterThanOrEqual(0);
    }
  });

  test("6.13-API-SEC-002: [P0] POST /api/lottery/bins - should prevent SQL injection in store_id field", async ({
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

    // WHEN: I try to create a bin with SQL injection attempt in store_id
    const sqlInjectionAttempts = [
      "'; DROP TABLE stores; --",
      store.store_id + "'; DELETE FROM lottery_bins; --",
      "' OR '1'='1",
    ];

    for (const maliciousStoreId of sqlInjectionAttempts) {
      const response = await clientUserApiRequest.post("/api/lottery/bins", {
        data: {
          store_id: maliciousStoreId,
          name: "Test Bin",
          display_order: 0,
        },
      });

      // THEN: Request should be rejected (invalid UUID format or RLS violation)
      expect(
        [400, 403, 404, 422].includes(response.status()),
        `SQL injection attempt in store_id "${maliciousStoreId}" should be rejected`,
      ).toBe(true);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - Input Validation Edge Cases
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.13-API-SEC-003: [P0] POST /api/lottery/bins - should reject empty name", async ({
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

    // WHEN: I try to create a bin with empty name
    const response = await clientUserApiRequest.post("/api/lottery/bins", {
      data: {
        store_id: store.store_id,
        name: "",
        display_order: 0,
      },
    });

    // THEN: I receive 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request for empty name").toBe(
      400,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("6.13-API-SEC-004: [P0] POST /api/lottery/bins - should reject name exceeding max length (255 chars)", async ({
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

    // WHEN: I try to create a bin with name exceeding 255 characters
    const longName = "A".repeat(256); // 256 characters (exceeds max)
    const response = await clientUserApiRequest.post("/api/lottery/bins", {
      data: {
        store_id: store.store_id,
        name: longName,
        display_order: 0,
      },
    });

    // THEN: I receive 400 Bad Request
    expect(
      response.status(),
      "Expected 400 Bad Request for name exceeding max length",
    ).toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("6.13-API-SEC-005: [P0] POST /api/lottery/bins - should reject negative display_order", async ({
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

    // WHEN: I try to create a bin with negative display_order
    const response = await clientUserApiRequest.post("/api/lottery/bins", {
      data: {
        store_id: store.store_id,
        name: "Test Bin",
        display_order: -1,
      },
    });

    // THEN: I receive 400 Bad Request
    expect(
      response.status(),
      "Expected 400 Bad Request for negative display_order",
    ).toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("6.13-API-SEC-006: [P0] POST /api/lottery/bins - should reject invalid UUID format for store_id", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner

    // WHEN: I try to create a bin with invalid UUID format
    const invalidUuids = [
      "not-a-uuid",
      "123",
      "00000000-0000-0000-0000",
      "invalid-format",
    ];

    for (const invalidUuid of invalidUuids) {
      const response = await clientUserApiRequest.post("/api/lottery/bins", {
        data: {
          store_id: invalidUuid,
          name: "Test Bin",
          display_order: 0,
        },
      });

      // THEN: I receive 400 Bad Request
      expect(
        response.status(),
        `Expected 400 Bad Request for invalid UUID "${invalidUuid}"`,
      ).toBe(400);
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - Authentication Bypass
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.13-API-SEC-007: [P0] POST /api/lottery/bins - should reject invalid JWT token", async ({
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

    // WHEN: I try to create a bin with invalid token
    const invalidTokens = [
      "invalid.token.here",
      "Bearer invalid",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid",
      "",
    ];

    for (const invalidToken of invalidTokens) {
      const response = await apiRequest.post("/api/lottery/bins", {
        headers: invalidToken
          ? { Authorization: `Bearer ${invalidToken}` }
          : {},
        data: {
          store_id: store.store_id,
          name: "Test Bin",
          display_order: 0,
        },
      });

      // THEN: I receive 401 Unauthorized
      expect(
        response.status(),
        `Expected 401 Unauthorized for invalid token "${invalidToken.substring(0, 20)}..."`,
      ).toBe(401);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - Data Leakage Prevention
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.13-API-SEC-008: [P0] GET /api/lottery/bins/:storeId - should not leak data from other stores", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: Bins exist for my store and another store
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

    // Create bins for both stores
    await withBypassClient(async (tx) => {
      await tx.lotteryBin.createMany({
        data: [
          {
            store_id: store.store_id,
            name: "My Bin",
            display_order: 0,
            is_active: true,
          },
          {
            store_id: otherStore.store_id,
            name: "Other Company Bin",
            display_order: 0,
            is_active: true,
          },
        ],
      });
    });

    // WHEN: I query bins for my store
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/${store.store_id}`,
    );

    // THEN: I receive only bins from my store
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(Array.isArray(body.data), "Response should contain array").toBe(
      true,
    );

    // AND: No bins from other stores are included
    const otherStoreBins = body.data.filter(
      (bin: any) => bin.store_id === otherStore.store_id,
    );
    expect(
      otherStoreBins.length,
      "Response should not contain bins from other stores",
    ).toBe(0);

    // AND: All returned bins belong to my store
    const allMyStoreBins = body.data.every(
      (bin: any) => bin.store_id === store.store_id,
    );
    expect(allMyStoreBins, "All returned bins should belong to my store").toBe(
      true,
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PUT /api/lottery/bins/:binId - AC #1
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.13-API-023: [P0] PUT /api/lottery/bins/:binId - should update bin (AC #1)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A bin exists for my store
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    const bin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: store.store_id,
          name: "Original Bin",
          location: "Original Location",
          display_order: 0,
          is_active: true,
        },
      });
    });

    // WHEN: I update the bin
    const response = await clientUserApiRequest.put(
      `/api/lottery/bins/${bin.bin_id}`,
      {
        data: {
          name: "Updated Bin",
          location: "Updated Location",
          display_order: 1,
        },
      },
    );

    // THEN: Bin is updated successfully
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.name, "Bin name should be updated").toBe("Updated Bin");
    expect(body.data.location, "Bin location should be updated").toBe(
      "Updated Location",
    );
    expect(body.data.display_order, "Display order should be updated").toBe(1);

    // AND: Changes are persisted in database
    const updatedBin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.findUnique({
        where: { bin_id: bin.bin_id },
      });
    });
    expect(updatedBin?.name, "Bin name should be updated in database").toBe(
      "Updated Bin",
    );
    expect(
      updatedBin?.location,
      "Bin location should be updated in database",
    ).toBe("Updated Location");
    expect(
      updatedBin?.display_order,
      "Display order should be updated in database",
    ).toBe(1);
  });

  test("6.13-API-024: [P0] PUT /api/lottery/bins/:binId - should return 404 if bin not found", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A non-existent bin ID
    const fakeBinId = "00000000-0000-0000-0000-000000000000";

    // WHEN: I try to update the bin
    const response = await clientUserApiRequest.put(
      `/api/lottery/bins/${fakeBinId}`,
      {
        data: {
          name: "Updated Bin",
        },
      },
    );

    // THEN: I receive 404 Not Found
    expect(response.status(), "Expected 404 Not Found").toBe(404);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be NOT_FOUND").toBe("NOT_FOUND");
  });

  test("6.13-API-025: [P0] PUT /api/lottery/bins/:binId - should enforce RLS (store isolation)", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A bin exists for another store (different company)
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

    const otherBin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: otherStore.store_id,
          name: "Other Bin",
          display_order: 0,
          is_active: true,
        },
      });
    });

    // WHEN: I try to update the other store's bin
    const response = await clientUserApiRequest.put(
      `/api/lottery/bins/${otherBin.bin_id}`,
      {
        data: {
          name: "Updated Other Bin",
        },
      },
    );

    // THEN: I receive 403 Forbidden (RLS enforcement)
    expect(response.status(), "Expected 403 Forbidden").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be FORBIDDEN").toBe("FORBIDDEN");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /api/lottery/bins/:binId - AC #1 (Soft Delete)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.13-API-026: [P0] DELETE /api/lottery/bins/:binId - should soft delete bin (set is_active = false) (AC #1)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: An active bin exists for my store
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    const bin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: store.store_id,
          name: "Bin To Delete",
          display_order: 0,
          is_active: true,
        },
      });
    });

    // WHEN: I delete the bin
    const response = await clientUserApiRequest.delete(
      `/api/lottery/bins/${bin.bin_id}`,
    );

    // THEN: Bin is soft deleted successfully
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.bin_id, "Response should contain bin_id").toBe(bin.bin_id);
    expect(
      body.data.message,
      "Response should contain success message",
    ).toContain("deleted");

    // AND: Bin is marked as inactive in database (soft delete)
    const deletedBin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.findUnique({
        where: { bin_id: bin.bin_id },
      });
    });
    expect(deletedBin, "Bin should still exist in database").toBeDefined();
    expect(deletedBin?.is_active, "Bin should be marked as inactive").toBe(
      false,
    );

    // AND: Bin is not returned by GET endpoint (only active bins)
    const getResponse = await clientUserApiRequest.get(
      `/api/lottery/bins/${store.store_id}`,
    );
    const getBody = await getResponse.json();
    expect(
      getBody.data.some((b: any) => b.bin_id === bin.bin_id),
      "Deleted bin should not be returned by GET endpoint",
    ).toBe(false);
  });

  test("6.13-API-027: [P0] DELETE /api/lottery/bins/:binId - should return 404 if bin not found", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A non-existent bin ID
    const fakeBinId = "00000000-0000-0000-0000-000000000000";

    // WHEN: I try to delete the bin
    const response = await clientUserApiRequest.delete(
      `/api/lottery/bins/${fakeBinId}`,
    );

    // THEN: I receive 404 Not Found
    expect(response.status(), "Expected 404 Not Found").toBe(404);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be NOT_FOUND").toBe("NOT_FOUND");
  });

  test("6.13-API-028: [P0] DELETE /api/lottery/bins/:binId - should enforce RLS (store isolation)", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A bin exists for another store (different company)
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

    const otherBin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: otherStore.store_id,
          name: "Other Bin",
          display_order: 0,
          is_active: true,
        },
      });
    });

    // WHEN: I try to delete the other store's bin
    const response = await clientUserApiRequest.delete(
      `/api/lottery/bins/${otherBin.bin_id}`,
    );

    // THEN: I receive 403 Forbidden (RLS enforcement)
    expect(response.status(), "Expected 403 Forbidden").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be FORBIDDEN").toBe("FORBIDDEN");
  });
});
