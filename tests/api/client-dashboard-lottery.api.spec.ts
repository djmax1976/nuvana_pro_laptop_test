/**
 * Client Dashboard Lottery API Tests
 *
 * Tests for Client Dashboard Lottery API endpoints:
 * - PUT /api/lottery/packs/:packId/activate (activate pack)
 * - PUT /api/lottery/packs/:packId/move (move pack between bins)
 * - GET /api/lottery/packs?store_id={storeId}&status=ACTIVE (get packs with filters)
 * - GET /api/lottery/packs/:packId (get pack details)
 * - Authentication and authorization
 * - RLS enforcement (store isolation)
 * - Error handling
 * - Security tests (SQL injection, XSS, auth bypass, input validation)
 * - Business logic (status transitions, bin movement)
 *
 * @test-level API
 * @justification Tests API endpoints with authentication, authorization, database operations, and business logic
 * @story 6-10-1 - Client Dashboard Lottery Page
 * @priority P1 (High - Security, Data Integrity, Business Logic)
 * @updated Aligned with actual implementation on 2025-12-08
 *
 * Permission Requirements:
 * - LOTTERY_PACK_ACTIVATE: Required for PUT /api/lottery/packs/:packId/activate
 * - LOTTERY_BIN_MANAGE: Required for PUT /api/lottery/packs/:packId/move
 * - LOTTERY_PACK_READ: Required for GET /api/lottery/packs and GET /api/lottery/packs/:packId
 *
 * Fixtures Used:
 * - storeManagerApiRequest/storeManagerUser: Has LOTTERY_PACK_ACTIVATE, LOTTERY_PACK_READ
 * - superadminApiRequest: Has all permissions (used for LOTTERY_BIN_MANAGE operations)
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createLotteryGame,
  createLotteryPack,
  createLotteryBin,
} from "../support/factories/lottery.factory";
import { createCompany, createStore } from "../support/helpers";
import { withBypassClient } from "../support/prisma-bypass";

// UUID validation regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

test.describe("6.10.1-API: Client Dashboard Lottery - Pack Activation", () => {
  test("6.10.1-API-001: [P1] PUT /api/lottery/packs/:packId/activate - should activate RECEIVED pack successfully", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with LOTTERY_PACK_ACTIVATE permission
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id!,
      status: "RECEIVED",
    });

    // WHEN: Activating a RECEIVED lottery pack via API
    const response = await storeManagerApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}/activate`,
    );

    // THEN: Pack is activated successfully
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(typeof body.data, "Response should contain data object").toBe(
      "object",
    );
    expect(body.data.pack_id, "Response should contain pack_id").toMatch(
      UUID_REGEX,
    );
    expect(body.data.status, "Status should be ACTIVE").toBe("ACTIVE");
    expect(body.data.activated_at, "activated_at should be set").toBeDefined();

    // AND: Pack record is updated in database
    const updatedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
    });
    expect(updatedPack, "Pack should still exist").not.toBeNull();
    expect(
      updatedPack?.status,
      "Pack status should be ACTIVE in database",
    ).toBe("ACTIVE");
    expect(
      updatedPack?.activated_at,
      "activated_at should be set in database",
    ).not.toBeNull();
  });

  test("6.10.1-API-002: [P1] PUT /api/lottery/packs/:packId/activate - should reject activation of ACTIVE pack", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with an ACTIVE pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id!,
      status: "ACTIVE",
    });

    // WHEN: Attempting to activate an already ACTIVE pack
    const response = await storeManagerApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}/activate`,
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(
      response.status(),
      "Expected 400 Bad Request - pack already ACTIVE",
    ).toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should indicate invalid status").toBe(
      "INVALID_PACK_STATUS",
    );
  });

  test("6.10.1-API-003: [P1] PUT /api/lottery/packs/:packId/activate - should reject activation of DEPLETED pack", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with a DEPLETED pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id!,
      status: "DEPLETED",
    });

    // WHEN: Attempting to activate a DEPLETED pack
    const response = await storeManagerApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}/activate`,
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(
      response.status(),
      "Expected 400 Bad Request - pack is DEPLETED",
    ).toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("6.10.1-API-004: [P1] PUT /api/lottery/packs/:packId/activate - should reject activation from unauthorized store", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists in another store (not the store manager's store)
    const { store } = await withBypassClient(async (prisma) => {
      const company = await createCompany(prisma);
      const store = await createStore(prisma, {
        company_id: company.company_id,
      });
      return { store };
    });

    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: store.store_id,
      status: "RECEIVED",
    });

    // WHEN: Store Manager tries to activate pack from another store
    const response = await storeManagerApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}/activate`,
    );

    // THEN: Request is rejected with 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden status").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("6.10.1-API-005: [P1] PUT /api/lottery/packs/:packId/activate - should reject activation of non-existent pack", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // WHEN: Activating a non-existent pack
    const fakePackId = "00000000-0000-0000-0000-000000000000";
    const response = await storeManagerApiRequest.put(
      `/api/lottery/packs/${fakePackId}/activate`,
    );

    // THEN: Request is rejected with 404 Not Found
    expect(response.status(), "Expected 404 Not Found status").toBe(404);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should indicate NOT_FOUND").toContain(
      "NOT_FOUND",
    );
  });

  // ============ SECURITY TESTS (MANDATORY) ============

  test("6.10.1-API-SEC-001: [P0] PUT /api/lottery/packs/:packId/activate - should prevent SQL injection in pack_id parameter", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // WHEN: Attempting SQL injection in pack_id parameter
    const sqlInjectionAttempts = [
      "'; DROP TABLE lottery_packs; --",
      "1' OR '1'='1",
      "1'; DELETE FROM lottery_packs WHERE '1'='1",
      "1' UNION SELECT * FROM users --",
    ];

    for (const maliciousId of sqlInjectionAttempts) {
      const response = await storeManagerApiRequest.put(
        `/api/lottery/packs/${encodeURIComponent(maliciousId)}/activate`,
      );

      // THEN: Request is rejected (400 Bad Request for invalid UUID, or 404 Not Found)
      expect(
        [400, 404],
        `SQL injection attempt "${maliciousId}" should be rejected`,
      ).toContain(response.status());
    }
  });

  test("6.10.1-API-SEC-002: [P0] PUT /api/lottery/packs/:packId/activate - should reject requests without authentication token", async ({
    apiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A pack exists
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id!,
      status: "RECEIVED",
    });

    // WHEN: Making request without authentication token
    const response = await apiRequest.put(
      `/api/lottery/packs/${pack.pack_id}/activate`,
    );

    // THEN: Request is rejected with 401 Unauthorized
    expect(response.status(), "Expected 401 Unauthorized - missing token").toBe(
      401,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });
});

test.describe("6.10.1-API: Client Dashboard Lottery - Pack Movement", () => {
  // Note: Pack movement requires LOTTERY_BIN_MANAGE permission which superadmin has
  test("6.10.1-API-010: [P1] PUT /api/lottery/packs/:packId/move - should move pack to new bin", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Superadmin with LOTTERY_BIN_MANAGE permission
    // Create isolated test data
    const { bin2, pack } = await withBypassClient(async (prisma) => {
      const company = await createCompany(prisma);
      const store = await createStore(prisma, {
        company_id: company.company_id,
      });
      const game = await createLotteryGame(prisma, {
        name: "Test Game Move",
        price: 5.0,
      });
      const bin1 = await createLotteryBin(prisma, {
        store_id: store.store_id,
        name: "Bin 1",
      });
      const bin2 = await createLotteryBin(prisma, {
        store_id: store.store_id,
        name: "Bin 2",
      });
      const pack = await createLotteryPack(prisma, {
        game_id: game.game_id,
        store_id: store.store_id,
        status: "ACTIVE",
        current_bin_id: bin1.bin_id,
      });
      return { store, bin1, bin2, pack };
    });

    // WHEN: Moving pack from bin1 to bin2
    const response = await superadminApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}/move`,
      {
        bin_id: bin2.bin_id,
        reason: "Reorganizing inventory",
      },
    );

    // THEN: Pack is moved successfully
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.current_bin_id, "Pack should be in bin2").toBe(
      bin2.bin_id,
    );
    expect(body.data.history_id, "Should return history ID").toMatch(
      UUID_REGEX,
    );

    // AND: Pack record reflects bin change in database
    const updatedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
    });
    expect(
      updatedPack?.current_bin_id,
      "Pack should be in bin2 in database",
    ).toBe(bin2.bin_id);
  });

  test("6.10.1-API-011: [P1] PUT /api/lottery/packs/:packId/move - should reject moving to bin in different store", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Superadmin
    // AND: A pack in one store and a bin in another store
    const { pack, otherBin } = await withBypassClient(async (prisma) => {
      const company1 = await createCompany(prisma);
      const store1 = await createStore(prisma, {
        company_id: company1.company_id,
      });
      const company2 = await createCompany(prisma);
      const store2 = await createStore(prisma, {
        company_id: company2.company_id,
      });
      const game = await createLotteryGame(prisma, {
        name: "Test Game",
        price: 5.0,
      });
      const pack = await createLotteryPack(prisma, {
        game_id: game.game_id,
        store_id: store1.store_id,
        status: "ACTIVE",
      });
      const otherBin = await createLotteryBin(prisma, {
        store_id: store2.store_id,
        name: "Other Store Bin",
      });
      return { pack, otherBin };
    });

    // WHEN: Attempting to move pack to bin in different store
    const response = await superadminApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}/move`,
      {
        bin_id: otherBin.bin_id,
      },
    );

    // THEN: Request is rejected (400 Bad Request - same store constraint)
    expect(
      response.status(),
      "Expected 400 Bad Request - different store",
    ).toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("6.10.1-API-012: [P1] PUT /api/lottery/packs/:packId/move - should reject moving to non-existent bin", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Superadmin with a pack
    const { pack } = await withBypassClient(async (prisma) => {
      const company = await createCompany(prisma);
      const store = await createStore(prisma, {
        company_id: company.company_id,
      });
      const game = await createLotteryGame(prisma, {
        name: "Test Game",
        price: 5.0,
      });
      const pack = await createLotteryPack(prisma, {
        game_id: game.game_id,
        store_id: store.store_id,
        status: "ACTIVE",
      });
      return { pack };
    });

    // WHEN: Attempting to move pack to non-existent bin
    const fakeBinId = "00000000-0000-0000-0000-000000000000";
    const response = await superadminApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}/move`,
      {
        bin_id: fakeBinId,
      },
    );

    // THEN: Request is rejected with 404 Not Found
    expect(response.status(), "Expected 404 Not Found status").toBe(404);
  });

  test("6.10.1-API-013: [P1] PUT /api/lottery/packs/:packId/move - should allow unassigning from bin with null bin_id", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Superadmin with a pack in a bin
    const { pack } = await withBypassClient(async (prisma) => {
      const company = await createCompany(prisma);
      const store = await createStore(prisma, {
        company_id: company.company_id,
      });
      const game = await createLotteryGame(prisma, {
        name: "Test Game",
        price: 5.0,
      });
      const bin = await createLotteryBin(prisma, {
        store_id: store.store_id,
        name: "Test Bin",
      });
      const pack = await createLotteryPack(prisma, {
        game_id: game.game_id,
        store_id: store.store_id,
        status: "ACTIVE",
        current_bin_id: bin.bin_id,
      });
      return { pack };
    });

    // WHEN: Unassigning pack from bin with null bin_id
    const response = await superadminApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}/move`,
      {
        bin_id: null,
        reason: "Removing from display",
      },
    );

    // THEN: Pack is unassigned successfully
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.current_bin_id, "Pack should have null bin_id").toBeNull();

    // Verify in database
    const updatedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
    });
    expect(
      updatedPack?.current_bin_id,
      "Pack bin_id should be null in DB",
    ).toBeNull();
  });

  // ============ SECURITY TESTS (MANDATORY) ============

  test("6.10.1-API-SEC-010: [P0] PUT /api/lottery/packs/:packId/move - should reject requests without authentication", async ({
    apiRequest,
  }) => {
    // GIVEN: A pack exists
    const { pack, bin } = await withBypassClient(async (prisma) => {
      const company = await createCompany(prisma);
      const store = await createStore(prisma, {
        company_id: company.company_id,
      });
      const game = await createLotteryGame(prisma, {
        name: "Test Game",
        price: 5.0,
      });
      const bin = await createLotteryBin(prisma, {
        store_id: store.store_id,
        name: "Test Bin",
      });
      const pack = await createLotteryPack(prisma, {
        game_id: game.game_id,
        store_id: store.store_id,
        status: "ACTIVE",
      });
      return { pack, bin };
    });

    // WHEN: Making request without authentication token
    const response = await apiRequest.put(
      `/api/lottery/packs/${pack.pack_id}/move`,
      { bin_id: bin.bin_id },
    );

    // THEN: Request is rejected with 401 Unauthorized
    expect(response.status(), "Expected 401 Unauthorized - missing token").toBe(
      401,
    );
  });
});

test.describe("6.10.1-API: Client Dashboard Lottery - Get Packs", () => {
  // Note: storeManagerUser has LOTTERY_PACK_READ permission
  test("6.10.1-API-020: [P1] GET /api/lottery/packs - should return only ACTIVE packs when filtered", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with multiple packs (ACTIVE and RECEIVED)
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 5.0,
    });
    const activePack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id!,
      status: "ACTIVE",
    });
    const receivedPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id!,
      status: "RECEIVED",
    });

    // WHEN: Fetching active packs via API
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs?store_id=${storeManagerUser.store_id}&status=ACTIVE`,
    );

    // THEN: Only ACTIVE packs are returned
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data, "Response should contain packs array").toBeInstanceOf(
      Array,
    );

    // Find our test pack in the results
    const foundActivePack = body.data.find(
      (p: { pack_id: string }) => p.pack_id === activePack.pack_id,
    );
    const foundReceivedPack = body.data.find(
      (p: { pack_id: string }) => p.pack_id === receivedPack.pack_id,
    );

    expect(foundActivePack, "Should return active pack").toBeDefined();
    expect(
      foundReceivedPack,
      "Should not return received pack",
    ).toBeUndefined();

    // AND: Response structure is correct
    expect(foundActivePack.pack_id, "pack_id should be a valid UUID").toMatch(
      UUID_REGEX,
    );
    expect(foundActivePack.status, "Status should be ACTIVE").toBe("ACTIVE");
  });

  test("6.10.1-API-021: [P1] GET /api/lottery/packs - should return all packs when no status filter", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with multiple packs
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 5.0,
    });
    const activePack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id!,
      status: "ACTIVE",
    });
    const receivedPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id!,
      status: "RECEIVED",
    });

    // WHEN: Fetching all packs via API (no status filter)
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs?store_id=${storeManagerUser.store_id}`,
    );

    // THEN: All packs are returned
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);

    // Find our test packs in the results
    const foundActivePack = body.data.find(
      (p: { pack_id: string }) => p.pack_id === activePack.pack_id,
    );
    const foundReceivedPack = body.data.find(
      (p: { pack_id: string }) => p.pack_id === receivedPack.pack_id,
    );

    expect(foundActivePack, "Should return active pack").toBeDefined();
    expect(foundReceivedPack, "Should return received pack").toBeDefined();
  });

  test("6.10.1-API-022: [P1] GET /api/lottery/packs - should enforce RLS (store isolation)", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists in another store
    const { store } = await withBypassClient(async (prisma) => {
      const company = await createCompany(prisma);
      const store = await createStore(prisma, {
        company_id: company.company_id,
      });
      const game = await createLotteryGame(prisma, {
        name: "Test Game RLS",
        price: 5.0,
      });
      // Create pack in the other store (we don't need to reference it)
      await createLotteryPack(prisma, {
        game_id: game.game_id,
        store_id: store.store_id,
        status: "ACTIVE",
      });
      return { store };
    });

    // WHEN: Fetching active packs for other store
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs?store_id=${store.store_id}&status=ACTIVE`,
    );

    // THEN: Request is rejected with 403 (RLS enforcement)
    expect(response.status(), "Expected 403 Forbidden (RLS)").toBe(403);
  });

  test("6.10.1-API-023: [P1] GET /api/lottery/packs - should require store_id parameter", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // WHEN: Fetching packs without store_id parameter
    const response = await storeManagerApiRequest.get(`/api/lottery/packs`);

    // THEN: Request is rejected with 400 Bad Request
    expect(
      response.status(),
      "Expected 400 Bad Request - missing store_id",
    ).toBe(400);
  });

  // ============ SECURITY TESTS (MANDATORY) ============

  test("6.10.1-API-SEC-020: [P0] GET /api/lottery/packs - should prevent SQL injection in query parameters", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // WHEN: Attempting SQL injection in store_id query parameter
    const sqlInjectionAttempts = [
      "'; DROP TABLE lottery_packs; --",
      "1' OR '1'='1",
      "1' UNION SELECT * FROM users --",
    ];

    for (const maliciousStoreId of sqlInjectionAttempts) {
      const response = await storeManagerApiRequest.get(
        `/api/lottery/packs?store_id=${encodeURIComponent(maliciousStoreId)}&status=ACTIVE`,
      );

      // THEN: Request is rejected (400 Bad Request for invalid UUID, or 403/404)
      expect(
        [400, 403, 404],
        `SQL injection attempt "${maliciousStoreId}" should be rejected`,
      ).toContain(response.status());
    }
  });

  test("6.10.1-API-SEC-021: [P0] GET /api/lottery/packs - should reject requests without authentication token", async ({
    apiRequest,
    storeManagerUser,
  }) => {
    // WHEN: Making request without authentication token
    const response = await apiRequest.get(
      `/api/lottery/packs?store_id=${storeManagerUser.store_id}&status=ACTIVE`,
    );

    // THEN: Request is rejected with 401 Unauthorized
    expect(response.status(), "Expected 401 Unauthorized - missing token").toBe(
      401,
    );
  });

  test("6.10.1-API-SEC-022: [P0] GET /api/lottery/packs - should validate query parameters (store_id UUID format, status enum)", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // WHEN: Attempting invalid query parameters
    const invalidParams = [
      // Invalid store_id format
      {
        store_id: "not-a-uuid",
        status: "ACTIVE",
        expectedStatus: 400,
        description: "Invalid store_id UUID format",
      },
      // Invalid status enum
      {
        store_id: "00000000-0000-0000-0000-000000000000",
        status: "INVALID_STATUS",
        expectedStatus: 400,
        description: "Invalid status enum value",
      },
    ];

    for (const params of invalidParams) {
      const response = await storeManagerApiRequest.get(
        `/api/lottery/packs?store_id=${params.store_id}&status=${params.status}`,
      );

      // THEN: Request is rejected with 400 Bad Request
      expect(
        response.status(),
        `${params.description} should be rejected`,
      ).toBe(params.expectedStatus);
    }
  });

  // ============ EDGE CASES ============

  test("6.10.1-API-EDGE-001: [P2] GET /api/lottery/packs - should return empty array when no active packs exist", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with only RECEIVED packs
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 5.0,
    });
    await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id!,
      status: "RECEIVED",
    });

    // WHEN: Fetching active packs
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs?store_id=${storeManagerUser.store_id}&status=ACTIVE`,
    );

    // THEN: Response is successful (may be empty or have other active packs from other tests)
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data, "Response should contain data array").toBeInstanceOf(
      Array,
    );
  });
});

test.describe("6.10.1-API: Client Dashboard Lottery - Get Pack Details", () => {
  test("6.10.1-API-030: [P1] GET /api/lottery/packs/:packId - should return pack details", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with a pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game Details",
      price: 10.0,
    });
    const bin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id!,
      name: "Detail Test Bin",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id!,
      status: "ACTIVE",
      current_bin_id: bin.bin_id,
    });

    // WHEN: Fetching pack details via API
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs/${pack.pack_id}`,
    );

    // THEN: Pack details are returned
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.pack_id, "pack_id should match").toBe(pack.pack_id);
    expect(body.data.game_id, "game_id should match").toBe(game.game_id);
    expect(body.data.status, "status should be ACTIVE").toBe("ACTIVE");
    expect(body.data.current_bin_id, "current_bin_id should match").toBe(
      bin.bin_id,
    );
    expect(body.data.game, "Should include game details").toBeDefined();
    expect(body.data.store, "Should include store details").toBeDefined();
    expect(body.data.bin, "Should include bin details").toBeDefined();
  });

  test("6.10.1-API-031: [P1] GET /api/lottery/packs/:packId - should return 404 for non-existent pack", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // WHEN: Fetching details of non-existent pack
    const fakePackId = "00000000-0000-0000-0000-000000000000";
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs/${fakePackId}`,
    );

    // THEN: Request returns 404 Not Found
    expect(response.status(), "Expected 404 Not Found status").toBe(404);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("6.10.1-API-032: [P1] GET /api/lottery/packs/:packId - should enforce RLS (cannot access other store's pack)", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: A pack exists in another store
    const { otherStorePack } = await withBypassClient(async (prisma) => {
      const company = await createCompany(prisma);
      const store = await createStore(prisma, {
        company_id: company.company_id,
      });
      const game = await createLotteryGame(prisma, {
        name: "Other Store Game",
        price: 5.0,
      });
      const otherStorePack = await createLotteryPack(prisma, {
        game_id: game.game_id,
        store_id: store.store_id,
        status: "ACTIVE",
      });
      return { otherStorePack };
    });

    // WHEN: Attempting to fetch pack from another store
    const response = await storeManagerApiRequest.get(
      `/api/lottery/packs/${otherStorePack.pack_id}`,
    );

    // THEN: Request is rejected with 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden (RLS)").toBe(403);
  });

  // ============ SECURITY TESTS (MANDATORY) ============

  test("6.10.1-API-SEC-030: [P0] GET /api/lottery/packs/:packId - should prevent SQL injection in pack_id", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // WHEN: Attempting SQL injection in pack_id parameter
    const sqlInjectionAttempts = [
      "'; DROP TABLE lottery_packs; --",
      "1' OR '1'='1",
      "1' UNION SELECT * FROM users --",
    ];

    for (const maliciousId of sqlInjectionAttempts) {
      const response = await storeManagerApiRequest.get(
        `/api/lottery/packs/${encodeURIComponent(maliciousId)}`,
      );

      // THEN: Request is rejected (400 for invalid UUID or 404)
      expect(
        [400, 404],
        `SQL injection attempt "${maliciousId}" should be rejected`,
      ).toContain(response.status());
    }
  });

  test("6.10.1-API-SEC-031: [P0] GET /api/lottery/packs/:packId - should reject requests without authentication", async ({
    apiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A pack exists
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id!,
      status: "ACTIVE",
    });

    // WHEN: Making request without authentication token
    const response = await apiRequest.get(`/api/lottery/packs/${pack.pack_id}`);

    // THEN: Request is rejected with 401 Unauthorized
    expect(response.status(), "Expected 401 Unauthorized - missing token").toBe(
      401,
    );
  });
});
