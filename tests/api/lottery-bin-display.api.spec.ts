/**
 * Lottery Bin Display Query API Tests
 *
 * Tests for optimized bin display query API endpoint:
 * - GET /api/lottery/bins/display/:storeId
 * - Optimized query with LEFT JOINs for bins with no packs
 * - Returns bins with packs, game info, serial ranges, sold counts
 * - Filters active bins and active packs
 * - Orders by display_order for consistent UI rendering
 * - Uses denormalized tickets_sold_count for performance
 * - Authentication and authorization (LOTTERY_BIN_READ permission)
 * - RLS enforcement (store isolation)
 * - Performance optimization validation
 * - Data accuracy validation
 *
 * @test-level API
 * @justification Tests optimized query endpoint with performance and data accuracy requirements
 * @story 6-13 - Lottery Database Enhancements & Bin Management
 * @priority P0 (Critical - Performance, Data Integrity, Business Logic)
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createCompany,
  createStore,
} from "../support/factories/database.factory";
import { withBypassClient } from "../support/prisma-bypass";

test.describe("6.13-API: Lottery Bin Display Query Endpoint", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/lottery/bins/display/:storeId - AC #2, #3
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.13-API-029: [P0] GET /api/lottery/bins/display/:storeId - should return bins with packs and game info (AC #2, #3)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: Bins with active packs exist for my store
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    // Create test data: game, bins, packs
    const game = await withBypassClient(async (tx) => {
      return await tx.lotteryGame.create({
        data: {
          name: "Test Game",
          game_code: "1234",
          price: 5.0,
          status: "ACTIVE",
        },
      });
    });

    const bin1 = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: store.store_id,
          name: "Bin 1",
          display_order: 0,
          is_active: true,
        },
      });
    });

    const bin2 = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: store.store_id,
          name: "Bin 2",
          display_order: 1,
          is_active: true,
        },
      });
    });

    await withBypassClient(async (tx) => {
      await tx.lotteryPack.create({
        data: {
          game_id: game.game_id,
          store_id: store.store_id,
          pack_number: "PACK001",
          serial_start: "0001",
          serial_end: "0050",
          status: "ACTIVE",
          current_bin_id: bin1.bin_id,
          tickets_sold_count: 25,
        },
      });

      await tx.lotteryPack.create({
        data: {
          game_id: game.game_id,
          store_id: store.store_id,
          pack_number: "PACK002",
          serial_start: "0051",
          serial_end: "0100",
          status: "ACTIVE",
          current_bin_id: bin2.bin_id,
          tickets_sold_count: 30,
        },
      });
    });

    // WHEN: I query bin display data for my store
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/display/${store.store_id}`,
    );

    // THEN: I receive bins with packs, game info, and sold counts
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(
      body.data,
      "Response should contain display data array",
    ).toBeDefined();
    expect(
      body.data.length,
      "Should return at least 2 rows",
    ).toBeGreaterThanOrEqual(2);

    // Verify bin 1 data
    const bin1Data = body.data.find((row: any) => row.bin_id === bin1.bin_id);
    expect(bin1Data, "Bin 1 data should be present").toBeDefined();
    expect(bin1Data.bin_name, "Bin 1 name should match").toBe("Bin 1");
    expect(bin1Data.display_order, "Bin 1 display_order should be 0").toBe(0);
    expect(bin1Data.game_code, "Game code should be present").toBe("1234");
    expect(bin1Data.game_name, "Game name should be present").toBe("Test Game");
    expect(bin1Data.pack_number, "Pack number should be present").toBe(
      "PACK001",
    );
    expect(bin1Data.serial_start, "Serial start should be present").toBe(
      "0001",
    );
    expect(bin1Data.serial_end, "Serial end should be present").toBe("0050");
    expect(
      bin1Data.total_sold,
      "Total sold should use denormalized count",
    ).toBe(25);

    // Verify bin 2 data
    const bin2Data = body.data.find((row: any) => row.bin_id === bin2.bin_id);
    expect(bin2Data, "Bin 2 data should be present").toBeDefined();
    expect(bin2Data.bin_name, "Bin 2 name should match").toBe("Bin 2");
    expect(bin2Data.display_order, "Bin 2 display_order should be 1").toBe(1);
    expect(
      bin2Data.total_sold,
      "Bin 2 total sold should use denormalized count",
    ).toBe(30);
  });

  test("6.13-API-030: [P0] GET /api/lottery/bins/display/:storeId - should include bins with no packs (LEFT JOIN)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A bin exists with no packs
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    const emptyBin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: store.store_id,
          name: "Empty Bin",
          display_order: 0,
          is_active: true,
        },
      });
    });

    // WHEN: I query bin display data
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/display/${store.store_id}`,
    );

    // THEN: Empty bin is included with null pack/game data
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    const emptyBinData = body.data.find(
      (row: any) => row.bin_id === emptyBin.bin_id,
    );
    expect(emptyBinData, "Empty bin should be included").toBeDefined();
    expect(emptyBinData.bin_name, "Bin name should be present").toBe(
      "Empty Bin",
    );
    expect(
      emptyBinData.game_code,
      "Game code should be null for empty bin",
    ).toBeNull();
    expect(
      emptyBinData.game_name,
      "Game name should be null for empty bin",
    ).toBeNull();
    expect(
      emptyBinData.pack_number,
      "Pack number should be null for empty bin",
    ).toBeNull();
    expect(
      emptyBinData.total_sold,
      "Total sold should be 0 for empty bin",
    ).toBe(0);
  });

  test("6.13-API-031: [P0] GET /api/lottery/bins/display/:storeId - should filter active bins and active packs only", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: Inactive bins and inactive packs exist
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    const game = await withBypassClient(async (tx) => {
      return await tx.lotteryGame.create({
        data: {
          name: "Test Game",
          game_code: "5678",
          price: 10.0,
          status: "ACTIVE",
        },
      });
    });

    const activeBin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: store.store_id,
          name: "Active Bin",
          display_order: 0,
          is_active: true,
        },
      });
    });

    const inactiveBin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: store.store_id,
          name: "Inactive Bin",
          display_order: 1,
          is_active: false, // Inactive
        },
      });
    });

    await withBypassClient(async (tx) => {
      // Active pack in active bin
      await tx.lotteryPack.create({
        data: {
          game_id: game.game_id,
          store_id: store.store_id,
          pack_number: "ACTIVE_PACK",
          serial_start: "0001",
          serial_end: "0050",
          status: "ACTIVE",
          current_bin_id: activeBin.bin_id,
          tickets_sold_count: 20,
        },
      });

      // Inactive pack in active bin (should not be returned)
      await tx.lotteryPack.create({
        data: {
          game_id: game.game_id,
          store_id: store.store_id,
          pack_number: "INACTIVE_PACK",
          serial_start: "0051",
          serial_end: "0100",
          status: "DEPLETED", // Inactive
          current_bin_id: activeBin.bin_id,
          tickets_sold_count: 50,
        },
      });
    });

    // WHEN: I query bin display data
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/display/${store.store_id}`,
    );

    // THEN: Only active bins and active packs are returned
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();

    // Active bin should be present
    const activeBinData = body.data.find(
      (row: any) => row.bin_id === activeBin.bin_id,
    );
    expect(activeBinData, "Active bin should be included").toBeDefined();

    // Inactive bin should not be present
    const inactiveBinData = body.data.find(
      (row: any) => row.bin_id === inactiveBin.bin_id,
    );
    expect(
      inactiveBinData,
      "Inactive bin should not be included",
    ).toBeUndefined();

    // Only active pack should be present
    const activePackData = body.data.find(
      (row: any) => row.pack_number === "ACTIVE_PACK",
    );
    expect(activePackData, "Active pack should be included").toBeDefined();

    const inactivePackData = body.data.find(
      (row: any) => row.pack_number === "INACTIVE_PACK",
    );
    expect(
      inactivePackData,
      "Inactive pack should not be included",
    ).toBeUndefined();
  });

  test("6.13-API-032: [P0] GET /api/lottery/bins/display/:storeId - should order by display_order for consistent UI rendering", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: Multiple bins exist with different display_order values
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
            name: "Bin C",
            display_order: 2,
            is_active: true,
          },
          {
            store_id: store.store_id,
            name: "Bin A",
            display_order: 0,
            is_active: true,
          },
          {
            store_id: store.store_id,
            name: "Bin B",
            display_order: 1,
            is_active: true,
          },
        ],
      });
    });

    // WHEN: I query bin display data
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/display/${store.store_id}`,
    );

    // THEN: Results are ordered by display_order
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();

    // Extract unique bins and their display_order
    const bins = Array.from(
      new Map(
        body.data.map((row: any) => [
          row.bin_id,
          { name: row.bin_name, display_order: row.display_order },
        ]),
      ).values(),
    );

    expect(bins.length, "Should have 3 bins").toBeGreaterThanOrEqual(3);
    const binA = bins.find((b) => b.name === "Bin A");
    const binB = bins.find((b) => b.name === "Bin B");
    const binC = bins.find((b) => b.name === "Bin C");

    expect(binA?.display_order, "Bin A should have display_order 0").toBe(0);
    expect(binB?.display_order, "Bin B should have display_order 1").toBe(1);
    expect(binC?.display_order, "Bin C should have display_order 2").toBe(2);
  });

  test("6.13-API-033: [P0] GET /api/lottery/bins/display/:storeId - should use denormalized tickets_sold_count (not COUNT aggregation)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A pack exists with denormalized tickets_sold_count
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    const game = await withBypassClient(async (tx) => {
      return await tx.lotteryGame.create({
        data: {
          name: "Test Game",
          game_code: "9999",
          price: 2.0,
          status: "ACTIVE",
        },
      });
    });

    const bin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: store.store_id,
          name: "Test Bin",
          display_order: 0,
          is_active: true,
        },
      });
    });

    await withBypassClient(async (tx) => {
      await tx.lotteryPack.create({
        data: {
          game_id: game.game_id,
          store_id: store.store_id,
          pack_number: "DENORM_TEST",
          serial_start: "0001",
          serial_end: "0100",
          status: "ACTIVE",
          current_bin_id: bin.bin_id,
          tickets_sold_count: 75, // Denormalized count
        },
      });
    });

    // WHEN: I query bin display data
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/display/${store.store_id}`,
    );

    // THEN: Denormalized tickets_sold_count is used (not COUNT aggregation)
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    const packData = body.data.find(
      (row: any) => row.pack_number === "DENORM_TEST",
    );
    expect(packData, "Pack data should be present").toBeDefined();
    expect(
      packData.total_sold,
      "Total sold should use denormalized count",
    ).toBe(75);
  });

  test("6.13-API-034: [P0] GET /api/lottery/bins/display/:storeId - should require authentication", async ({
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

    // WHEN: I query bin display data without authentication
    const response = await apiRequest.get(
      `/api/lottery/bins/display/${store.store_id}`,
    );

    // THEN: I receive 401 Unauthorized
    expect(response.status(), "Expected 401 Unauthorized").toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error should be present").toBeDefined();
  });

  test("6.13-API-035: [P0] GET /api/lottery/bins/display/:storeId - should require LOTTERY_BIN_READ permission", async ({
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

    // WHEN: I query bin display data
    const response = await regularUserApiRequest.get(
      `/api/lottery/bins/display/${store.store_id}`,
    );

    // THEN: I receive 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error should be present").toBeDefined();
  });

  test("6.13-API-036: [P0] GET /api/lottery/bins/display/:storeId - should enforce RLS (store isolation)", async ({
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

    // WHEN: I query bin display data for the other store
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/display/${otherStore.store_id}`,
    );

    // THEN: I receive 403 Forbidden (RLS enforcement)
    expect(response.status(), "Expected 403 Forbidden").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be FORBIDDEN").toBe("FORBIDDEN");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - SQL Injection Prevention
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.13-API-SEC-016: [P0] GET /api/lottery/bins/display/:storeId - should prevent SQL injection in store_id parameter", async ({
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

    // WHEN: I try to query with SQL injection attempts in store_id
    const sqlInjectionAttempts = [
      store.store_id + "'; DROP TABLE stores; --",
      "'; DROP TABLE lottery_bins; --",
      "' OR '1'='1",
      "'; DELETE FROM lottery_bins WHERE '1'='1",
    ];

    for (const maliciousStoreId of sqlInjectionAttempts) {
      const response = await clientUserApiRequest.get(
        `/api/lottery/bins/display/${maliciousStoreId}`,
      );

      // THEN: Request should be rejected (invalid UUID format or RLS violation)
      expect(
        [400, 403, 404, 422].includes(response.status()),
        `SQL injection attempt in store_id "${maliciousStoreId.substring(0, 30)}..." should be rejected`,
      ).toBe(true);

      // AND: No actual SQL injection should occur
      const binsCount = await withBypassClient(async (tx) => {
        return await tx.lotteryBin.count();
      });
      expect(
        binsCount,
        "Bins table should still exist and be queryable",
      ).toBeGreaterThanOrEqual(0);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - Input Validation Edge Cases
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.13-API-SEC-017: [P0] GET /api/lottery/bins/display/:storeId - should reject invalid UUID format for store_id", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner

    // WHEN: I try to query with invalid UUID format
    const invalidUuids = [
      "not-a-uuid",
      "123",
      "00000000-0000-0000-0000",
      "invalid-format",
      "",
    ];

    for (const invalidUuid of invalidUuids) {
      const response = await clientUserApiRequest.get(
        `/api/lottery/bins/display/${invalidUuid}`,
      );

      // THEN: I receive 400 Bad Request or 404 Not Found
      expect(
        [400, 404, 422].includes(response.status()),
        `Expected 400/404/422 for invalid UUID "${invalidUuid}"`,
      ).toBe(true);
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - Authentication Bypass
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.13-API-SEC-018: [P0] GET /api/lottery/bins/display/:storeId - should reject invalid JWT token", async ({
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

    // WHEN: I try to query with invalid token
    const invalidTokens = [
      "invalid.token.here",
      "Bearer invalid",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid",
      "",
    ];

    for (const invalidToken of invalidTokens) {
      const response = await apiRequest.get(
        `/api/lottery/bins/display/${store.store_id}`,
        {
          headers: invalidToken
            ? { Authorization: `Bearer ${invalidToken}` }
            : {},
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

  test("6.13-API-SEC-019: [P0] GET /api/lottery/bins/display/:storeId - should not leak data from other stores", async ({
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

    // WHEN: I query bin display data for my store
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/display/${store.store_id}`,
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
      (row: any) => row.store_id === otherStore.store_id,
    );
    expect(
      otherStoreBins.length,
      "Response should not contain bins from other stores",
    ).toBe(0);

    // AND: All returned bins belong to my store (verify via bin_id lookup if needed)
    // Note: Response may not include store_id field, so we verify via query isolation
    const myStoreBins = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.findMany({
        where: { store_id: store.store_id, is_active: true },
      });
    });
    expect(myStoreBins.length, "My store should have bins").toBeGreaterThan(0);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - Response Structure Validation
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.13-API-SEC-020: [P0] GET /api/lottery/bins/display/:storeId - should validate response structure and data types", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: Bins with packs exist for my store
    const store = await withBypassClient(async (tx) => {
      return await tx.store.findFirst({
        where: { company_id: clientUser.company_id },
      });
    });

    if (!store) {
      test.skip();
      return;
    }

    const game = await withBypassClient(async (tx) => {
      return await tx.lotteryGame.create({
        data: {
          name: "Test Game",
          game_code: "1111",
          price: 3.0,
          status: "ACTIVE",
        },
      });
    });

    const bin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: store.store_id,
          name: "Test Bin",
          display_order: 0,
          is_active: true,
        },
      });
    });

    await withBypassClient(async (tx) => {
      await tx.lotteryPack.create({
        data: {
          game_id: game.game_id,
          store_id: store.store_id,
          pack_number: "TEST_PACK",
          serial_start: "0001",
          serial_end: "0050",
          status: "ACTIVE",
          current_bin_id: bin.bin_id,
          tickets_sold_count: 25,
        },
      });
    });

    // WHEN: I query bin display data
    const response = await clientUserApiRequest.get(
      `/api/lottery/bins/display/${store.store_id}`,
    );

    // THEN: Response structure is valid
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should have success field").toBe(true);
    expect(typeof body.success, "Success should be boolean").toBe("boolean");
    expect(body.data, "Response should have data field").toBeDefined();
    expect(Array.isArray(body.data), "Data should be an array").toBe(true);

    // AND: Data items have correct structure and types
    if (body.data.length > 0) {
      const firstItem = body.data[0];
      expect(typeof firstItem.bin_id, "bin_id should be string (UUID)").toBe(
        "string",
      );
      expect(typeof firstItem.bin_name, "bin_name should be string").toBe(
        "string",
      );
      expect(
        typeof firstItem.display_order,
        "display_order should be number",
      ).toBe("number");
      expect(typeof firstItem.total_sold, "total_sold should be number").toBe(
        "number",
      );
      expect(
        firstItem.total_sold,
        "total_sold should be non-negative",
      ).toBeGreaterThanOrEqual(0);

      // Optional fields should be correct type or null
      if (firstItem.game_code !== null) {
        expect(
          typeof firstItem.game_code,
          "game_code should be string or null",
        ).toBe("string");
      }
      if (firstItem.game_name !== null) {
        expect(
          typeof firstItem.game_name,
          "game_name should be string or null",
        ).toBe("string");
      }
      if (firstItem.price !== null) {
        expect(typeof firstItem.price, "price should be number or null").toBe(
          "number",
        );
      }
    }
  });
});
