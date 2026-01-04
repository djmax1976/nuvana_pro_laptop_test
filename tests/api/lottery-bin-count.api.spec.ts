/**
 * Lottery Bin Count API Tests
 *
 * Tests for Lottery Bin Count Configuration endpoints:
 * - GET /api/stores/:storeId/lottery/bin-count
 * - PUT /api/stores/:storeId/lottery/bin-count
 * - GET /api/stores/:storeId/lottery/bin-count/validate
 * - Authentication and authorization (requires LOTTERY_BIN_CONFIG_READ/LOTTERY_BIN_CONFIG_WRITE)
 * - RLS enforcement (company/store isolation)
 * - Validation (bin count range 0-200)
 * - Bin sync logic (create, reactivate, soft-delete)
 *
 * @test-level API
 * @justification Tests API endpoints with authentication, authorization, database operations, and business logic
 * @story Lottery Bin Count Configuration
 * @priority P0 (Critical - Business Logic, Data Integrity)
 *
 * Fixtures Used:
 * - storeManagerApiRequest/storeManagerUser: Has LOTTERY_BIN_CONFIG_READ, LOTTERY_BIN_CONFIG_WRITE permissions
 * - regularUserApiRequest: Lacks lottery bin config permissions
 * - apiRequest: Unauthenticated requests
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createCompany,
  createStore,
  createUser,
} from "../support/factories/database.factory";

test.describe("Lottery Bin Count Configuration API", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/stores/:storeId/lottery/bin-count
  // ═══════════════════════════════════════════════════════════════════════════

  test("BIN-COUNT-001: [P0] GET /api/stores/:storeId/lottery/bin-count - should return bin count and statistics", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with lottery permissions
    // AND: My store has some lottery bins
    const storeId = storeManagerUser.store_id;

    // Create some bins for the store
    await prismaClient.lotteryBin.createMany({
      data: [
        { store_id: storeId, name: "Bin 1", display_order: 0, is_active: true },
        { store_id: storeId, name: "Bin 2", display_order: 1, is_active: true },
        { store_id: storeId, name: "Bin 3", display_order: 2, is_active: true },
      ],
    });

    try {
      // WHEN: I query the bin count for my store
      const response = await storeManagerApiRequest.get(
        `/api/stores/${storeId}/lottery/bin-count`,
      );

      // THEN: I receive the bin count statistics
      expect(response.status(), "Expected 200 OK status").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data, "Response should contain data").toBeDefined();
      expect(body.data.store_id, "Store ID should match").toBe(storeId);
      expect(body.data.active_bins, "Should have 3 active bins").toBe(3);
      expect(body.data.bins_with_packs, "No bins should have packs").toBe(0);
      expect(body.data.empty_bins, "All 3 bins should be empty").toBe(3);
    } finally {
      // Cleanup
      await prismaClient.lotteryBin.deleteMany({
        where: { store_id: storeId },
      });
    }
  });

  test("BIN-COUNT-002: [P0] GET /api/stores/:storeId/lottery/bin-count - should require authentication", async ({
    apiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: I am NOT authenticated
    // WHEN: I query bin count without authentication
    const response = await apiRequest.get(
      `/api/stores/${storeManagerUser.store_id}/lottery/bin-count`,
    );

    // THEN: I receive 401 Unauthorized
    expect(response.status(), "Expected 401 Unauthorized").toBe(401);
  });

  test("BIN-COUNT-003: [P0] GET /api/stores/:storeId/lottery/bin-count - should require LOTTERY_BIN_CONFIG_READ permission", async ({
    regularUserApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: I am authenticated but lack LOTTERY_BIN_CONFIG_READ permission
    // WHEN: I query bin count
    const response = await regularUserApiRequest.get(
      `/api/stores/${storeManagerUser.store_id}/lottery/bin-count`,
    );

    // THEN: I receive 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden").toBe(403);
  });

  test("BIN-COUNT-004: [P0] GET /api/stores/:storeId/lottery/bin-count - should enforce RLS (store isolation)", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // AND: Another store exists in a different company

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

    try {
      // WHEN: I query bin count for another company's store
      const response = await storeManagerApiRequest.get(
        `/api/stores/${otherStore.store_id}/lottery/bin-count`,
      );

      // THEN: I receive 403 Forbidden (access denied)
      expect(response.status(), "Expected 403 Forbidden").toBe(403);
    } finally {
      // Cleanup
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

  // ═══════════════════════════════════════════════════════════════════════════
  // PUT /api/stores/:storeId/lottery/bin-count
  // ═══════════════════════════════════════════════════════════════════════════

  test("BIN-COUNT-010: [P0] PUT /api/stores/:storeId/lottery/bin-count - should create bins when increasing count from 0", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    const storeId = storeManagerUser.store_id;

    // Ensure no bins exist initially
    await prismaClient.lotteryBin.deleteMany({
      where: { store_id: storeId },
    });

    try {
      // WHEN: I set bin count to 5
      const response = await storeManagerApiRequest.put(
        `/api/stores/${storeId}/lottery/bin-count`,
        { data: { bin_count: 5 } },
      );

      // THEN: I receive success response
      expect(response.status(), "Expected 200 OK status").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data.new_count, "New count should be 5").toBe(5);
      expect(body.data.bins_created, "Should create 5 bins").toBe(5);

      // AND: 5 active bins should exist in DB
      const binCount = await prismaClient.lotteryBin.count({
        where: { store_id: storeId, is_active: true },
      });
      expect(binCount, "Should have 5 active bins in DB").toBe(5);
    } finally {
      // Cleanup
      await prismaClient.lotteryBin.deleteMany({
        where: { store_id: storeId },
      });
      await prismaClient.store.update({
        where: { store_id: storeId },
        data: { lottery_bin_count: null },
      });
    }
  });

  test("BIN-COUNT-011: [P0] PUT /api/stores/:storeId/lottery/bin-count - should add bins when increasing count", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    const storeId = storeManagerUser.store_id;

    // Create 3 existing bins
    await prismaClient.lotteryBin.createMany({
      data: [
        { store_id: storeId, name: "Bin 1", display_order: 0, is_active: true },
        { store_id: storeId, name: "Bin 2", display_order: 1, is_active: true },
        { store_id: storeId, name: "Bin 3", display_order: 2, is_active: true },
      ],
    });

    try {
      // WHEN: I increase bin count from 3 to 5
      const response = await storeManagerApiRequest.put(
        `/api/stores/${storeId}/lottery/bin-count`,
        { data: { bin_count: 5 } },
      );

      // THEN: I receive success response
      expect(response.status(), "Expected 200 OK status").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data.new_count, "New count should be 5").toBe(5);
      expect(body.data.bins_created, "Should create 2 new bins").toBe(2);

      // AND: 5 active bins should exist in DB
      const binCount = await prismaClient.lotteryBin.count({
        where: { store_id: storeId, is_active: true },
      });
      expect(binCount, "Should have 5 active bins in DB").toBe(5);
    } finally {
      // Cleanup
      await prismaClient.lotteryBin.deleteMany({
        where: { store_id: storeId },
      });
      await prismaClient.store.update({
        where: { store_id: storeId },
        data: { lottery_bin_count: null },
      });
    }
  });

  test("BIN-COUNT-012: [P0] PUT /api/stores/:storeId/lottery/bin-count - should soft-delete empty bins when decreasing count", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    const storeId = storeManagerUser.store_id;

    // Create 5 existing bins
    await prismaClient.lotteryBin.createMany({
      data: [
        { store_id: storeId, name: "Bin 1", display_order: 0, is_active: true },
        { store_id: storeId, name: "Bin 2", display_order: 1, is_active: true },
        { store_id: storeId, name: "Bin 3", display_order: 2, is_active: true },
        { store_id: storeId, name: "Bin 4", display_order: 3, is_active: true },
        { store_id: storeId, name: "Bin 5", display_order: 4, is_active: true },
      ],
    });

    try {
      // WHEN: I decrease bin count from 5 to 3
      const response = await storeManagerApiRequest.put(
        `/api/stores/${storeId}/lottery/bin-count`,
        { data: { bin_count: 3 } },
      );

      // THEN: I receive success response
      expect(response.status(), "Expected 200 OK status").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data.new_count, "New count should be 3").toBe(3);
      expect(body.data.bins_deactivated, "Should deactivate 2 bins").toBe(2);

      // AND: Only 3 active bins should exist
      const activeBins = await prismaClient.lotteryBin.count({
        where: { store_id: storeId, is_active: true },
      });
      expect(activeBins, "Should have 3 active bins").toBe(3);

      // AND: 2 inactive bins should exist (soft-deleted)
      const inactiveBins = await prismaClient.lotteryBin.count({
        where: { store_id: storeId, is_active: false },
      });
      expect(inactiveBins, "Should have 2 inactive bins").toBe(2);
    } finally {
      // Cleanup
      await prismaClient.lotteryBin.deleteMany({
        where: { store_id: storeId },
      });
      await prismaClient.store.update({
        where: { store_id: storeId },
        data: { lottery_bin_count: null },
      });
    }
  });

  test("BIN-COUNT-013: [P0] PUT /api/stores/:storeId/lottery/bin-count - should reactivate soft-deleted bins when increasing", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    const storeId = storeManagerUser.store_id;

    // Create 3 active bins and 2 inactive bins
    await prismaClient.lotteryBin.createMany({
      data: [
        { store_id: storeId, name: "Bin 1", display_order: 0, is_active: true },
        { store_id: storeId, name: "Bin 2", display_order: 1, is_active: true },
        { store_id: storeId, name: "Bin 3", display_order: 2, is_active: true },
        {
          store_id: storeId,
          name: "Bin 4",
          display_order: 3,
          is_active: false,
        },
        {
          store_id: storeId,
          name: "Bin 5",
          display_order: 4,
          is_active: false,
        },
      ],
    });

    try {
      // WHEN: I increase bin count from 3 to 5
      const response = await storeManagerApiRequest.put(
        `/api/stores/${storeId}/lottery/bin-count`,
        { data: { bin_count: 5 } },
      );

      // THEN: I receive success response
      expect(response.status(), "Expected 200 OK status").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data.new_count, "New count should be 5").toBe(5);
      expect(body.data.bins_reactivated, "Should reactivate 2 bins").toBe(2);
      expect(body.data.bins_created, "Should not create new bins").toBe(0);

      // AND: 5 active bins should exist
      const activeBins = await prismaClient.lotteryBin.count({
        where: { store_id: storeId, is_active: true },
      });
      expect(activeBins, "Should have 5 active bins").toBe(5);
    } finally {
      // Cleanup
      await prismaClient.lotteryBin.deleteMany({
        where: { store_id: storeId },
      });
      await prismaClient.store.update({
        where: { store_id: storeId },
        data: { lottery_bin_count: null },
      });
    }
  });

  test("BIN-COUNT-014: [P0] PUT /api/stores/:storeId/lottery/bin-count - should reject invalid bin count (negative)", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // WHEN: I try to set bin count to a negative number
    const response = await storeManagerApiRequest.put(
      `/api/stores/${storeManagerUser.store_id}/lottery/bin-count`,
      { data: { bin_count: -1 } },
    );

    // THEN: I receive 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
  });

  test("BIN-COUNT-015: [P0] PUT /api/stores/:storeId/lottery/bin-count - should reject invalid bin count (exceeds max)", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // WHEN: I try to set bin count to 201 (max is 200)
    const response = await storeManagerApiRequest.put(
      `/api/stores/${storeManagerUser.store_id}/lottery/bin-count`,
      { data: { bin_count: 201 } },
    );

    // THEN: I receive 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
  });

  test("BIN-COUNT-016: [P0] PUT /api/stores/:storeId/lottery/bin-count - should require LOTTERY_BIN_CONFIG_WRITE permission", async ({
    regularUserApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: I am authenticated but lack LOTTERY_BIN_CONFIG_WRITE permission
    // WHEN: I try to update bin count
    const response = await regularUserApiRequest.put(
      `/api/stores/${storeManagerUser.store_id}/lottery/bin-count`,
      { data: { bin_count: 10 } },
    );

    // THEN: I receive 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden").toBe(403);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/stores/:storeId/lottery/bin-count/validate
  // ═══════════════════════════════════════════════════════════════════════════

  test("BIN-COUNT-020: [P0] GET /api/stores/:storeId/lottery/bin-count/validate - should allow adding bins", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    const storeId = storeManagerUser.store_id;

    // Create 3 existing bins
    await prismaClient.lotteryBin.createMany({
      data: [
        { store_id: storeId, name: "Bin 1", display_order: 0, is_active: true },
        { store_id: storeId, name: "Bin 2", display_order: 1, is_active: true },
        { store_id: storeId, name: "Bin 3", display_order: 2, is_active: true },
      ],
    });

    try {
      // WHEN: I validate increasing to 5 bins
      const response = await storeManagerApiRequest.get(
        `/api/stores/${storeId}/lottery/bin-count/validate?new_count=5`,
      );

      // THEN: I receive a validation result
      expect(response.status(), "Expected 200 OK status").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data.allowed, "Should be allowed").toBe(true);
      expect(body.data.bins_to_add, "Should add 2 bins").toBe(2);
      expect(body.data.bins_to_remove, "Should not remove bins").toBe(0);
    } finally {
      // Cleanup
      await prismaClient.lotteryBin.deleteMany({
        where: { store_id: storeId },
      });
    }
  });

  test("BIN-COUNT-021: [P0] GET /api/stores/:storeId/lottery/bin-count/validate - should allow removing empty bins", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    const storeId = storeManagerUser.store_id;

    // Create 5 empty bins
    await prismaClient.lotteryBin.createMany({
      data: [
        { store_id: storeId, name: "Bin 1", display_order: 0, is_active: true },
        { store_id: storeId, name: "Bin 2", display_order: 1, is_active: true },
        { store_id: storeId, name: "Bin 3", display_order: 2, is_active: true },
        { store_id: storeId, name: "Bin 4", display_order: 3, is_active: true },
        { store_id: storeId, name: "Bin 5", display_order: 4, is_active: true },
      ],
    });

    try {
      // WHEN: I validate decreasing to 3 bins
      const response = await storeManagerApiRequest.get(
        `/api/stores/${storeId}/lottery/bin-count/validate?new_count=3`,
      );

      // THEN: I receive a validation result
      expect(response.status(), "Expected 200 OK status").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data.allowed, "Should be allowed").toBe(true);
      expect(body.data.bins_to_add, "Should not add bins").toBe(0);
      expect(body.data.bins_to_remove, "Should remove 2 bins").toBe(2);
    } finally {
      // Cleanup
      await prismaClient.lotteryBin.deleteMany({
        where: { store_id: storeId },
      });
    }
  });

  test("BIN-COUNT-022: [P0] GET /api/stores/:storeId/lottery/bin-count/validate - should block removing bins with active packs", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    const storeId = storeManagerUser.store_id;

    // Create a game for the pack
    const game = await prismaClient.lotteryGame.create({
      data: {
        name: "Test Game",
        game_code: "TG001",
        price: 5,
        tickets_per_pack: 50,
        status: "ACTIVE",
      },
    });

    // Create bins - one will have a pack
    const bins = await prismaClient.lotteryBin.createMany({
      data: [
        { store_id: storeId, name: "Bin 1", display_order: 0, is_active: true },
        { store_id: storeId, name: "Bin 2", display_order: 1, is_active: true },
        { store_id: storeId, name: "Bin 3", display_order: 2, is_active: true },
        { store_id: storeId, name: "Bin 4", display_order: 3, is_active: true },
        { store_id: storeId, name: "Bin 5", display_order: 4, is_active: true },
      ],
    });

    // Get the highest display_order bin
    const highBin = await prismaClient.lotteryBin.findFirst({
      where: { store_id: storeId, display_order: 4 },
    });

    // Create an active pack in the highest bin
    await prismaClient.lotteryPack.create({
      data: {
        store_id: storeId,
        game_id: game.game_id,
        pack_number: "123456",
        serial_start: "001",
        serial_end: "050",
        status: "ACTIVE",
        current_bin_id: highBin!.bin_id,
      },
    });

    try {
      // WHEN: I validate decreasing to 3 bins (would remove bin 5 which has a pack)
      const response = await storeManagerApiRequest.get(
        `/api/stores/${storeId}/lottery/bin-count/validate?new_count=3`,
      );

      // THEN: I receive a validation result indicating it's not allowed
      expect(response.status(), "Expected 200 OK status").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data.allowed, "Should NOT be allowed").toBe(false);
      expect(
        body.data.bins_with_packs_blocking,
        "Should have 1 blocking bin",
      ).toBe(1);
    } finally {
      // Cleanup
      await prismaClient.lotteryPack.deleteMany({
        where: { store_id: storeId },
      });
      await prismaClient.lotteryBin.deleteMany({
        where: { store_id: storeId },
      });
      await prismaClient.lotteryGame.delete({
        where: { game_id: game.game_id },
      });
    }
  });

  test("BIN-COUNT-023: [P0] GET /api/stores/:storeId/lottery/bin-count/validate - should require new_count parameter", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // WHEN: I call validate without new_count parameter
    const response = await storeManagerApiRequest.get(
      `/api/stores/${storeManagerUser.store_id}/lottery/bin-count/validate`,
    );

    // THEN: I receive 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Edge Cases and Boundary Values
  // ═══════════════════════════════════════════════════════════════════════════

  test("BIN-COUNT-030: [P1] PUT /api/stores/:storeId/lottery/bin-count - should accept minimum boundary value (0)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    const storeId = storeManagerUser.store_id;

    // Create 3 empty bins
    await prismaClient.lotteryBin.createMany({
      data: [
        { store_id: storeId, name: "Bin 1", display_order: 0, is_active: true },
        { store_id: storeId, name: "Bin 2", display_order: 1, is_active: true },
        { store_id: storeId, name: "Bin 3", display_order: 2, is_active: true },
      ],
    });

    try {
      // WHEN: I set bin count to 0 (minimum boundary)
      const response = await storeManagerApiRequest.put(
        `/api/stores/${storeId}/lottery/bin-count`,
        { data: { bin_count: 0 } },
      );

      // THEN: I receive success and all bins are deactivated
      expect(response.status(), "Expected 200 OK").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data.new_count, "New count should be 0").toBe(0);
      expect(body.data.bins_deactivated, "Should deactivate 3 bins").toBe(3);

      // AND: No active bins should exist
      const activeBins = await prismaClient.lotteryBin.count({
        where: { store_id: storeId, is_active: true },
      });
      expect(activeBins, "Should have 0 active bins").toBe(0);
    } finally {
      await prismaClient.lotteryBin.deleteMany({
        where: { store_id: storeId },
      });
      await prismaClient.store.update({
        where: { store_id: storeId },
        data: { lottery_bin_count: null },
      });
    }
  });

  test("BIN-COUNT-031: [P1] PUT /api/stores/:storeId/lottery/bin-count - should accept maximum boundary value (200)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    const storeId = storeManagerUser.store_id;

    // Ensure no bins exist initially
    await prismaClient.lotteryBin.deleteMany({ where: { store_id: storeId } });

    try {
      // WHEN: I set bin count to 200 (maximum boundary)
      const response = await storeManagerApiRequest.put(
        `/api/stores/${storeId}/lottery/bin-count`,
        { data: { bin_count: 200 } },
      );

      // THEN: I receive success and 200 bins are created
      expect(response.status(), "Expected 200 OK").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data.new_count, "New count should be 200").toBe(200);
      expect(body.data.bins_created, "Should create 200 bins").toBe(200);

      // AND: 200 active bins should exist
      const activeBins = await prismaClient.lotteryBin.count({
        where: { store_id: storeId, is_active: true },
      });
      expect(activeBins, "Should have 200 active bins").toBe(200);
    } finally {
      await prismaClient.lotteryBin.deleteMany({
        where: { store_id: storeId },
      });
      await prismaClient.store.update({
        where: { store_id: storeId },
        data: { lottery_bin_count: null },
      });
    }
  });

  test("BIN-COUNT-032: [P0] PUT /api/stores/:storeId/lottery/bin-count - should reject invalid UUID format", async ({
    storeManagerApiRequest,
  }) => {
    // WHEN: I call with invalid UUID format
    const response = await storeManagerApiRequest.put(
      `/api/stores/invalid-uuid/lottery/bin-count`,
      { data: { bin_count: 10 } },
    );

    // THEN: I receive 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
  });

  test("BIN-COUNT-033: [P0] GET /api/stores/:storeId/lottery/bin-count - should reject invalid UUID format", async ({
    storeManagerApiRequest,
  }) => {
    // WHEN: I call with invalid UUID format
    const response = await storeManagerApiRequest.get(
      `/api/stores/not-a-valid-uuid/lottery/bin-count`,
    );

    // THEN: I receive 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
  });

  test("BIN-COUNT-034: [P0] PUT /api/stores/:storeId/lottery/bin-count - should reject non-integer bin count", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // WHEN: I try to set bin count to a non-integer
    const response = await storeManagerApiRequest.put(
      `/api/stores/${storeManagerUser.store_id}/lottery/bin-count`,
      { data: { bin_count: 5.5 } },
    );

    // THEN: I receive 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
  });

  test("BIN-COUNT-035: [P1] PUT /api/stores/:storeId/lottery/bin-count - should handle store with null lottery_bin_count", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    const storeId = storeManagerUser.store_id;

    // Ensure store has null bin_count and no bins
    await prismaClient.lotteryBin.deleteMany({ where: { store_id: storeId } });
    await prismaClient.store.update({
      where: { store_id: storeId },
      data: { lottery_bin_count: null },
    });

    try {
      // WHEN: I set bin count for a store that never had bins configured
      const response = await storeManagerApiRequest.put(
        `/api/stores/${storeId}/lottery/bin-count`,
        { data: { bin_count: 10 } },
      );

      // THEN: I receive success with 10 bins created
      expect(response.status(), "Expected 200 OK").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data.previous_count, "Previous count should be null").toBe(
        null,
      );
      expect(body.data.new_count, "New count should be 10").toBe(10);
      expect(body.data.bins_created, "Should create 10 bins").toBe(10);
    } finally {
      await prismaClient.lotteryBin.deleteMany({
        where: { store_id: storeId },
      });
      await prismaClient.store.update({
        where: { store_id: storeId },
        data: { lottery_bin_count: null },
      });
    }
  });

  test("BIN-COUNT-036: [P0] PUT /api/stores/:storeId/lottery/bin-count - should block decrease when ALL bins have packs", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    const storeId = storeManagerUser.store_id;

    // Create a game for the packs
    const game = await prismaClient.lotteryGame.create({
      data: {
        name: "Block Test Game",
        game_code: "BTG001",
        price: 5,
        tickets_per_pack: 50,
        status: "ACTIVE",
      },
    });

    // Create 3 bins
    await prismaClient.lotteryBin.createMany({
      data: [
        { store_id: storeId, name: "Bin 1", display_order: 0, is_active: true },
        { store_id: storeId, name: "Bin 2", display_order: 1, is_active: true },
        { store_id: storeId, name: "Bin 3", display_order: 2, is_active: true },
      ],
    });

    // Get all bins and add active packs to each
    const bins = await prismaClient.lotteryBin.findMany({
      where: { store_id: storeId, is_active: true },
      orderBy: { display_order: "asc" },
    });

    for (let i = 0; i < bins.length; i++) {
      await prismaClient.lotteryPack.create({
        data: {
          store_id: storeId,
          game_id: game.game_id,
          pack_number: `BLOCK${i + 1}`,
          serial_start: "001",
          serial_end: "050",
          status: "ACTIVE",
          current_bin_id: bins[i].bin_id,
        },
      });
    }

    try {
      // WHEN: I try to decrease bin count when all bins have packs
      const response = await storeManagerApiRequest.put(
        `/api/stores/${storeId}/lottery/bin-count`,
        { data: { bin_count: 1 } },
      );

      // THEN: I receive 400 Bad Request (cannot remove bins with packs)
      expect(response.status(), "Expected 400 Bad Request").toBe(400);
      const body = await response.json();
      expect(
        body.error?.message || body.message,
        "Should explain the error",
      ).toContain("active packs");
    } finally {
      await prismaClient.lotteryPack.deleteMany({
        where: { store_id: storeId },
      });
      await prismaClient.lotteryBin.deleteMany({
        where: { store_id: storeId },
      });
      await prismaClient.lotteryGame.delete({
        where: { game_id: game.game_id },
      });
      await prismaClient.store.update({
        where: { store_id: storeId },
        data: { lottery_bin_count: null },
      });
    }
  });

  test("BIN-COUNT-037: [P1] GET /api/stores/:storeId/lottery/bin-count - should return empty_bins correctly with mixed bin states", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    const storeId = storeManagerUser.store_id;

    // Create a game
    const game = await prismaClient.lotteryGame.create({
      data: {
        name: "Mixed Test Game",
        game_code: "MTG001",
        price: 5,
        tickets_per_pack: 50,
        status: "ACTIVE",
      },
    });

    // Create 5 bins
    await prismaClient.lotteryBin.createMany({
      data: [
        { store_id: storeId, name: "Bin 1", display_order: 0, is_active: true },
        { store_id: storeId, name: "Bin 2", display_order: 1, is_active: true },
        { store_id: storeId, name: "Bin 3", display_order: 2, is_active: true },
        { store_id: storeId, name: "Bin 4", display_order: 3, is_active: true },
        { store_id: storeId, name: "Bin 5", display_order: 4, is_active: true },
      ],
    });

    // Get first 2 bins and add packs
    const binsWithPacks = await prismaClient.lotteryBin.findMany({
      where: { store_id: storeId, is_active: true },
      orderBy: { display_order: "asc" },
      take: 2,
    });

    for (let i = 0; i < binsWithPacks.length; i++) {
      await prismaClient.lotteryPack.create({
        data: {
          store_id: storeId,
          game_id: game.game_id,
          pack_number: `MIX${i + 1}`,
          serial_start: "001",
          serial_end: "050",
          status: "ACTIVE",
          current_bin_id: binsWithPacks[i].bin_id,
        },
      });
    }

    try {
      // WHEN: I query the bin count
      const response = await storeManagerApiRequest.get(
        `/api/stores/${storeId}/lottery/bin-count`,
      );

      // THEN: I receive correct statistics
      expect(response.status(), "Expected 200 OK").toBe(200);
      const body = await response.json();
      expect(body.data.active_bins, "Should have 5 active bins").toBe(5);
      expect(body.data.bins_with_packs, "Should have 2 bins with packs").toBe(
        2,
      );
      expect(body.data.empty_bins, "Should have 3 empty bins").toBe(3);
    } finally {
      await prismaClient.lotteryPack.deleteMany({
        where: { store_id: storeId },
      });
      await prismaClient.lotteryBin.deleteMany({
        where: { store_id: storeId },
      });
      await prismaClient.lotteryGame.delete({
        where: { game_id: game.game_id },
      });
    }
  });

  test("BIN-COUNT-038: [P1] GET /api/stores/:storeId/lottery/bin-count/validate - should validate no change scenario", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    const storeId = storeManagerUser.store_id;

    // Create 5 bins
    await prismaClient.lotteryBin.createMany({
      data: [
        { store_id: storeId, name: "Bin 1", display_order: 0, is_active: true },
        { store_id: storeId, name: "Bin 2", display_order: 1, is_active: true },
        { store_id: storeId, name: "Bin 3", display_order: 2, is_active: true },
        { store_id: storeId, name: "Bin 4", display_order: 3, is_active: true },
        { store_id: storeId, name: "Bin 5", display_order: 4, is_active: true },
      ],
    });

    try {
      // WHEN: I validate with the same count as current
      const response = await storeManagerApiRequest.get(
        `/api/stores/${storeId}/lottery/bin-count/validate?new_count=5`,
      );

      // THEN: I receive validation result indicating no changes
      expect(response.status(), "Expected 200 OK").toBe(200);
      const body = await response.json();
      expect(body.data.allowed, "Should be allowed").toBe(true);
      expect(body.data.bins_to_add, "Should add 0 bins").toBe(0);
      expect(body.data.bins_to_remove, "Should remove 0 bins").toBe(0);
      expect(body.data.message, "Should indicate no changes").toContain(
        "No changes",
      );
    } finally {
      await prismaClient.lotteryBin.deleteMany({
        where: { store_id: storeId },
      });
    }
  });

  test("BIN-COUNT-039: [P1] PUT /api/stores/:storeId/lottery/bin-count - should handle mixed reactivate and create", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    const storeId = storeManagerUser.store_id;

    // Create 3 active bins and 2 inactive bins
    await prismaClient.lotteryBin.createMany({
      data: [
        { store_id: storeId, name: "Bin 1", display_order: 0, is_active: true },
        { store_id: storeId, name: "Bin 2", display_order: 1, is_active: true },
        { store_id: storeId, name: "Bin 3", display_order: 2, is_active: true },
        {
          store_id: storeId,
          name: "Bin 4",
          display_order: 3,
          is_active: false,
        },
        {
          store_id: storeId,
          name: "Bin 5",
          display_order: 4,
          is_active: false,
        },
      ],
    });

    try {
      // WHEN: I increase bin count from 3 to 8 (need 5 more, but only 2 can be reactivated)
      const response = await storeManagerApiRequest.put(
        `/api/stores/${storeId}/lottery/bin-count`,
        { data: { bin_count: 8 } },
      );

      // THEN: I receive success with both reactivations and creations
      expect(response.status(), "Expected 200 OK").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data.new_count, "New count should be 8").toBe(8);
      expect(body.data.bins_reactivated, "Should reactivate 2 bins").toBe(2);
      expect(body.data.bins_created, "Should create 3 new bins").toBe(3);

      // AND: 8 active bins should exist
      const activeBins = await prismaClient.lotteryBin.count({
        where: { store_id: storeId, is_active: true },
      });
      expect(activeBins, "Should have 8 active bins").toBe(8);
    } finally {
      await prismaClient.lotteryBin.deleteMany({
        where: { store_id: storeId },
      });
      await prismaClient.store.update({
        where: { store_id: storeId },
        data: { lottery_bin_count: null },
      });
    }
  });
});
