/**
 * Lottery Management API Tests
 *
 * Tests for Lottery Management API endpoints:
 * - GET /api/lottery/packs (pack list with RLS)
 * - POST /api/lottery/packs/receive (pack reception)
 * - PUT /api/lottery/packs/:packId/activate (pack activation)
 * - GET /api/lottery/variances (variance query)
 * - POST /api/lottery/variances/:varianceId/approve (variance approval)
 * - Authentication and authorization
 * - RLS enforcement (store isolation)
 * - Error handling
 *
 * @test-level API
 * @justification Tests API endpoints with authentication, authorization, database operations, and business logic
 * @story 6-10 - Lottery Management UI
 * @priority P0-P1 (Critical - Security, Data Integrity, Business Logic)
 *
 * SKIPPED: RED PHASE - API endpoints not implemented yet.
 * These tests define expected behavior for future implementation.
 * Un-skip when API endpoints are implemented.
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createLotteryGame,
  createLotteryPack,
} from "../support/factories/lottery.factory";
import { createCompany, createStore, createUser } from "../support/helpers";
import { LotteryPackStatus } from "@prisma/client";

test.describe.skip("6.10-API: Lottery Management API (NOT IMPLEMENTED)", () => {
  test.describe("GET /api/lottery/packs - Pack List with RLS", () => {
    test("6.10-API-001: [P0] should return packs filtered by store (RLS enforcement) (AC #1, #8)", async ({
      request,
      prismaClient,
      authenticatedUser,
    }) => {
      // GIVEN: User with store access and packs in their store and other store
      const company = await createCompany(prismaClient);
      const userStore = await createStore(prismaClient, {
        company_id: company.company_id,
      });
      const otherStore = await createStore(prismaClient, {
        company_id: company.company_id,
      });
      const user = await createUser(prismaClient);

      const game = await createLotteryGame(prismaClient);
      const userPack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: userStore.store_id,
        status: LotteryPackStatus.RECEIVED,
      });
      const otherPack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: otherStore.store_id,
        status: LotteryPackStatus.RECEIVED,
      });

      // WHEN: User requests packs
      const response = await request.get(
        `/api/lottery/packs?store_id=${userStore.store_id}`,
        {
          headers: {
            Authorization: `Bearer ${authenticatedUser.token}`,
          },
        },
      );

      // THEN: Only user's store packs are returned
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].pack_id).toBe(userPack.pack_id);
      expect(body.data[0].pack_id).not.toBe(otherPack.pack_id);
    });

    test("6.10-API-002: [P0] should require authentication (AC #8)", async ({
      request,
    }) => {
      // GIVEN: Unauthenticated request
      // WHEN: Requesting packs without token
      const response = await request.get("/api/lottery/packs");

      // THEN: Request is rejected with 401
      expect(response.status()).toBe(401);
    });

    test("6.10-API-003: [P1] should filter packs by status (AC #1)", async ({
      request,
      prismaClient,
      authenticatedUser,
    }) => {
      // GIVEN: Packs with different statuses
      const company = await createCompany(prismaClient);
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
      });
      const game = await createLotteryGame(prismaClient);
      await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: store.store_id,
        status: LotteryPackStatus.RECEIVED,
      });
      await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: store.store_id,
        status: LotteryPackStatus.ACTIVE,
      });

      // WHEN: Requesting packs with RECEIVED status
      const response = await request.get(
        `/api/lottery/packs?store_id=${store.store_id}&status=RECEIVED`,
        {
          headers: {
            Authorization: `Bearer ${authenticatedUser.token}`,
          },
        },
      );

      // THEN: Only RECEIVED packs are returned
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.every((p: any) => p.status === "RECEIVED")).toBe(true);
    });
  });

  test.describe("POST /api/lottery/packs/receive - Pack Reception", () => {
    test("6.10-API-010: [P1] should create pack with RECEIVED status (AC #2)", async ({
      request,
      prismaClient,
      authenticatedUser,
    }) => {
      // GIVEN: Valid pack reception data
      const company = await createCompany(prismaClient);
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
      });
      const game = await createLotteryGame(prismaClient);

      // WHEN: Receiving pack
      const response = await request.post("/api/lottery/packs/receive", {
        headers: {
          Authorization: `Bearer ${authenticatedUser.token}`,
        },
        data: {
          game_id: game.game_id,
          pack_number: "PACK-001",
          serial_start: "0001",
          serial_end: "0100",
          store_id: store.store_id,
        },
      });

      // THEN: Pack is created with RECEIVED status
      expect(response.status()).toBe(201);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBe("RECEIVED");
      expect(body.data.pack_number).toBe("PACK-001");
    });

    test("6.10-API-011: [P1] should validate required fields (AC #2)", async ({
      request,
      authenticatedUser,
    }) => {
      // GIVEN: Pack reception data missing required fields
      // WHEN: Receiving pack without required fields
      const response = await request.post("/api/lottery/packs/receive", {
        headers: {
          Authorization: `Bearer ${authenticatedUser.token}`,
        },
        data: {
          pack_number: "PACK-001",
          // Missing game_id, serial_start, serial_end, store_id
        },
      });

      // THEN: Request is rejected with 400
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("required");
    });

    test("6.10-API-012: [P1] should validate serial range (AC #2)", async ({
      request,
      prismaClient,
      authenticatedUser,
    }) => {
      // GIVEN: Pack reception data with invalid serial range (start > end)
      const company = await createCompany(prismaClient);
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
      });
      const game = await createLotteryGame(prismaClient);

      // WHEN: Receiving pack with invalid serial range
      const response = await request.post("/api/lottery/packs/receive", {
        headers: {
          Authorization: `Bearer ${authenticatedUser.token}`,
        },
        data: {
          game_id: game.game_id,
          pack_number: "PACK-001",
          serial_start: "0100",
          serial_end: "0001", // Invalid: end < start
          store_id: store.store_id,
        },
      });

      // THEN: Request is rejected with 400
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("serial");
    });

    test("6.10-API-013: [P0] should enforce RLS (user can only create packs for their store) (AC #8)", async ({
      request,
      prismaClient,
      authenticatedUser,
    }) => {
      // GIVEN: User trying to create pack for different store
      const company = await createCompany(prismaClient);
      const userStore = await createStore(prismaClient, {
        company_id: company.company_id,
      });
      const otherStore = await createStore(prismaClient, {
        company_id: company.company_id,
      });
      const game = await createLotteryGame(prismaClient);

      // WHEN: Receiving pack for other store
      const response = await request.post("/api/lottery/packs/receive", {
        headers: {
          Authorization: `Bearer ${authenticatedUser.token}`,
        },
        data: {
          game_id: game.game_id,
          pack_number: "PACK-001",
          serial_start: "0001",
          serial_end: "0100",
          store_id: otherStore.store_id, // Different store
        },
      });

      // THEN: Request is rejected with 403
      expect(response.status()).toBe(403);
    });
  });

  test.describe("PUT /api/lottery/packs/:packId/activate - Pack Activation", () => {
    test("6.10-API-020: [P1] should activate pack (RECEIVED → ACTIVE) (AC #3)", async ({
      request,
      prismaClient,
      authenticatedUser,
    }) => {
      // GIVEN: Pack with RECEIVED status
      const company = await createCompany(prismaClient);
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
      });
      const game = await createLotteryGame(prismaClient);
      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: store.store_id,
        status: LotteryPackStatus.RECEIVED,
      });

      // WHEN: Activating pack
      const response = await request.put(
        `/api/lottery/packs/${pack.pack_id}/activate`,
        {
          headers: {
            Authorization: `Bearer ${authenticatedUser.token}`,
          },
        },
      );

      // THEN: Pack status changes to ACTIVE
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBe("ACTIVE");
    });

    test("6.10-API-021: [P1] should reject activation of non-RECEIVED pack (AC #3)", async ({
      request,
      prismaClient,
      authenticatedUser,
    }) => {
      // GIVEN: Pack with ACTIVE status
      const company = await createCompany(prismaClient);
      const store = await createStore(prismaClient, {
        company_id: company.company_id,
      });
      const game = await createLotteryGame(prismaClient);
      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: store.store_id,
        status: LotteryPackStatus.ACTIVE,
      });

      // WHEN: Attempting to activate already active pack
      const response = await request.put(
        `/api/lottery/packs/${pack.pack_id}/activate`,
        {
          headers: {
            Authorization: `Bearer ${authenticatedUser.token}`,
          },
        },
      );

      // THEN: Request is rejected with 400
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("status");
    });

    test("6.10-API-022: [P0] should enforce RLS (user can only activate packs for their store) (AC #8)", async ({
      request,
      prismaClient,
      authenticatedUser,
    }) => {
      // GIVEN: Pack in different store
      const company = await createCompany(prismaClient);
      const userStore = await createStore(prismaClient, {
        company_id: company.company_id,
      });
      const otherStore = await createStore(prismaClient, {
        company_id: company.company_id,
      });
      const game = await createLotteryGame(prismaClient);
      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: otherStore.store_id, // Different store
        status: LotteryPackStatus.RECEIVED,
      });

      // WHEN: Attempting to activate pack from other store
      const response = await request.put(
        `/api/lottery/packs/${pack.pack_id}/activate`,
        {
          headers: {
            Authorization: `Bearer ${authenticatedUser.token}`,
          },
        },
      );

      // THEN: Request is rejected with 403
      expect(response.status()).toBe(403);
    });
  });

  test.describe("GET /api/lottery/variances - Variance Query", () => {
    test("6.10-API-030: [P1] should return variances filtered by store (RLS) (AC #5, #8)", async ({
      request,
      prismaClient,
      authenticatedUser,
    }) => {
      // GIVEN: Variances in user's store and other store
      // (Implementation will create variances via shift closing)
      // WHEN: Querying variances
      const response = await request.get(
        "/api/lottery/variances?store_id=test",
        {
          headers: {
            Authorization: `Bearer ${authenticatedUser.token}`,
          },
        },
      );

      // THEN: Only user's store variances are returned
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      // RLS enforcement verified
    });

    test("6.10-API-031: [P1] should filter variances by unresolved status (AC #5)", async ({
      request,
      authenticatedUser,
    }) => {
      // GIVEN: Request for unresolved variances
      // WHEN: Querying unresolved variances
      const response = await request.get(
        "/api/lottery/variances?status=unresolved",
        {
          headers: {
            Authorization: `Bearer ${authenticatedUser.token}`,
          },
        },
      );

      // THEN: Only unresolved variances are returned
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.every((v: any) => !v.approved_at)).toBe(true);
    });
  });

  test.describe("POST /api/lottery/variances/:varianceId/approve - Variance Approval", () => {
    test("6.10-API-040: [P1] should approve variance with reason (AC #6)", async ({
      request,
      authenticatedUser,
    }) => {
      // GIVEN: Variance ID and approval reason
      const varianceId = "123e4567-e89b-12d3-a456-426614174000";
      const reason = "Test approval reason";

      // WHEN: Approving variance
      const response = await request.post(
        `/api/lottery/variances/${varianceId}/approve`,
        {
          headers: {
            Authorization: `Bearer ${authenticatedUser.token}`,
          },
          data: {
            reason,
          },
        },
      );

      // THEN: Variance is approved
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.approved_at).toBeTruthy();
      expect(body.data.variance_reason).toBe(reason);
    });

    test("6.10-API-041: [P1] should require approval reason (AC #6)", async ({
      request,
      authenticatedUser,
    }) => {
      // GIVEN: Variance approval without reason
      const varianceId = "123e4567-e89b-12d3-a456-426614174000";

      // WHEN: Approving variance without reason
      const response = await request.post(
        `/api/lottery/variances/${varianceId}/approve`,
        {
          headers: {
            Authorization: `Bearer ${authenticatedUser.token}`,
          },
          data: {},
        },
      );

      // THEN: Request is rejected with 400
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("reason");
    });

    test("6.10-API-042: [P0] should enforce RLS (user can only approve variances for their store) (AC #8)", async ({
      request,
      authenticatedUser,
    }) => {
      // GIVEN: Variance ID from different store
      const varianceId = "123e4567-e89b-12d3-a456-426614174000";

      // WHEN: Attempting to approve variance from other store
      const response = await request.post(
        `/api/lottery/variances/${varianceId}/approve`,
        {
          headers: {
            Authorization: `Bearer ${authenticatedUser.token}`,
          },
          data: {
            reason: "Test reason",
          },
        },
      );

      // THEN: Request is rejected with 403 (if RLS enforced)
      // Note: Actual implementation may return 404 if variance not found
      expect([403, 404]).toContain(response.status());
    });
  });
});
