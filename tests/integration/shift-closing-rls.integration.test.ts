/**
 * Shift Closing RLS Integration Tests
 *
 * Integration tests for Row-Level Security (RLS) enforcement in shift closing data endpoint.
 * Tests multi-tenant data isolation to ensure users can only access data for their associated store.
 *
 * @test-level Integration
 * @justification Tests RLS enforcement across database queries and API endpoints
 * @story 10-1 - Lottery Shift Closing Page UI
 * @priority P0 (Critical - Security & Data Integrity)
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createLotteryGame,
  createLotteryPack,
  createLotteryBin,
  createLotteryShiftOpening,
} from "../support/factories/lottery.factory";
import { createShift } from "../support/helpers";
import { ShiftStatus, LotteryPackStatus } from "@prisma/client";

test.describe("10-1-INTEGRATION: Shift Closing RLS Enforcement", () => {
  test("10-1-INTEGRATION-001: should enforce RLS - store manager can only access their store's bins", async ({
    storeManagerApiRequest,
    storeManagerUser,
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: Two stores with bins and shifts
    // Store 1 (storeManagerUser's store)
    const shift1 = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        status: ShiftStatus.ACTIVE,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const bin1 = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      display_order: 0,
      name: "Store 1 Bin",
    });

    // Store 2 (corporateAdminUser's store)
    const shift2 = await createShift(
      {
        store_id: corporateAdminUser.store_id,
        opened_by: corporateAdminUser.user_id,
        status: ShiftStatus.ACTIVE,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const bin2 = await createLotteryBin(prismaClient, {
      store_id: corporateAdminUser.store_id,
      display_order: 0,
      name: "Store 2 Bin",
    });

    // WHEN: Store manager requests closing data for their own shift
    const response1 = await storeManagerApiRequest.get(
      `/api/shifts/${shift1.shift_id}/lottery/closing-data`,
    );

    // THEN: Only bins from their store are returned
    expect(response1.status()).toBe(200);
    const body1 = await response1.json();
    const bins1 = body1.data.bins;
    const store1Bin = bins1.find((b: any) => b.bin_id === bin1.bin_id);
    expect(store1Bin).toBeDefined();
    expect(store1Bin.name).toBe("Store 1 Bin");

    // Store 2's bin should NOT be in the response
    const store2Bin = bins1.find((b: any) => b.bin_id === bin2.bin_id);
    expect(store2Bin).toBeUndefined();

    // WHEN: Store manager tries to access shift from another store
    const response2 = await storeManagerApiRequest.get(
      `/api/shifts/${shift2.shift_id}/lottery/closing-data`,
    );

    // THEN: Returns 403 Forbidden (RLS enforced)
    expect(response2.status()).toBe(403);
    const body2 = await response2.json();
    expect(body2.success).toBe(false);
    expect(body2.error).toHaveProperty("code");
  });

  test("10-1-INTEGRATION-002: should enforce RLS - store manager can only access their store's packs", async ({
    storeManagerApiRequest,
    storeManagerUser,
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: Two stores with active packs
    const shift1 = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        status: ShiftStatus.ACTIVE,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const game1 = await createLotteryGame(prismaClient, {
      name: "Store 1 Game",
      price: 5.0,
    });

    const bin1 = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      display_order: 0,
      name: "Bin 1",
    });

    const pack1 = await createLotteryPack(prismaClient, {
      game_id: game1.game_id,
      store_id: storeManagerUser.store_id,
      current_bin_id: bin1.bin_id,
      status: LotteryPackStatus.ACTIVE,
      pack_number: "STORE1-PACK",
      serial_start: "001",
      serial_end: "100",
    });

    // Store 2 pack
    const shift2 = await createShift(
      {
        store_id: corporateAdminUser.store_id,
        opened_by: corporateAdminUser.user_id,
        status: ShiftStatus.ACTIVE,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const game2 = await createLotteryGame(prismaClient, {
      name: "Store 2 Game",
      price: 10.0,
    });

    const bin2 = await createLotteryBin(prismaClient, {
      store_id: corporateAdminUser.store_id,
      display_order: 0,
      name: "Bin 2",
    });

    const pack2 = await createLotteryPack(prismaClient, {
      game_id: game2.game_id,
      store_id: corporateAdminUser.store_id,
      current_bin_id: bin2.bin_id,
      status: LotteryPackStatus.ACTIVE,
      pack_number: "STORE2-PACK",
      serial_start: "001",
      serial_end: "100",
    });

    // WHEN: Store manager requests closing data
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift1.shift_id}/lottery/closing-data`,
    );

    // THEN: Only packs from their store are returned
    expect(response.status()).toBe(200);
    const body = await response.json();
    const bins = body.data.bins;

    // Store 1's pack should be in the response
    const binWithPack = bins.find((b: any) => b.bin_id === bin1.bin_id);
    expect(binWithPack).toBeDefined();
    expect(binWithPack.pack).toBeDefined();
    expect(binWithPack.pack.pack_number).toBe("STORE1-PACK");

    // Store 2's pack should NOT be in the response
    const store2Bin = bins.find((b: any) => b.bin_id === bin2.bin_id);
    expect(store2Bin).toBeUndefined();
  });

  test("10-1-INTEGRATION-003: should enforce RLS - store manager can only access their store's sold packs", async ({
    storeManagerApiRequest,
    storeManagerUser,
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: Two stores with depleted packs
    const shift1 = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        status: ShiftStatus.ACTIVE,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const game1 = await createLotteryGame(prismaClient, {
      name: "Store 1 Game",
      price: 5.0,
    });

    const bin1 = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      display_order: 0,
      name: "Bin 1",
    });

    // Create depleted pack for store 1
    const depletedPack1 = await createLotteryPack(prismaClient, {
      game_id: game1.game_id,
      store_id: storeManagerUser.store_id,
      current_bin_id: bin1.bin_id,
      status: LotteryPackStatus.DEPLETED,
      pack_number: "STORE1-DEPLETED",
      serial_start: "001",
      serial_end: "100",
      depleted_at: new Date(), // Depleted during this shift
    });

    await createLotteryShiftOpening(prismaClient, {
      shift_id: shift1.shift_id,
      pack_id: depletedPack1.pack_id,
      opening_serial: "001",
    });

    // Store 2 depleted pack
    const shift2 = await createShift(
      {
        store_id: corporateAdminUser.store_id,
        opened_by: corporateAdminUser.user_id,
        status: ShiftStatus.ACTIVE,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const game2 = await createLotteryGame(prismaClient, {
      name: "Store 2 Game",
      price: 10.0,
    });

    const bin2 = await createLotteryBin(prismaClient, {
      store_id: corporateAdminUser.store_id,
      display_order: 0,
      name: "Bin 2",
    });

    const depletedPack2 = await createLotteryPack(prismaClient, {
      game_id: game2.game_id,
      store_id: corporateAdminUser.store_id,
      current_bin_id: bin2.bin_id,
      status: LotteryPackStatus.DEPLETED,
      pack_number: "STORE2-DEPLETED",
      serial_start: "001",
      serial_end: "100",
      depleted_at: new Date(),
    });

    await createLotteryShiftOpening(prismaClient, {
      shift_id: shift2.shift_id,
      pack_id: depletedPack2.pack_id,
      opening_serial: "001",
    });

    // WHEN: Store manager requests closing data
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift1.shift_id}/lottery/closing-data`,
    );

    // THEN: Only sold packs from their store are returned
    expect(response.status()).toBe(200);
    const body = await response.json();
    const soldPacks = body.data.soldPacks;

    // Store 1's depleted pack should be in the response
    const store1SoldPack = soldPacks.find(
      (p: any) => p.pack_id === depletedPack1.pack_id,
    );
    expect(store1SoldPack).toBeDefined();
    expect(store1SoldPack.pack_number).toBe("STORE1-DEPLETED");

    // Store 2's depleted pack should NOT be in the response
    const store2SoldPack = soldPacks.find(
      (p: any) => p.pack_id === depletedPack2.pack_id,
    );
    expect(store2SoldPack).toBeUndefined();
  });

  test("10-1-INTEGRATION-004: should enforce RLS - corporate admin can access all stores in their company", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: Corporate admin with access to multiple stores in their company
    // (This test assumes corporateAdminUser has COMPANY scope access)
    const shift = await createShift(
      {
        store_id: corporateAdminUser.store_id,
        opened_by: corporateAdminUser.user_id,
        status: ShiftStatus.ACTIVE,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const bin = await createLotteryBin(prismaClient, {
      store_id: corporateAdminUser.store_id,
      display_order: 0,
      name: "Company Bin",
    });

    // WHEN: Corporate admin requests closing data
    const response = await corporateAdminApiRequest.get(
      `/api/shifts/${shift.shift_id}/lottery/closing-data`,
    );

    // THEN: Can access data from stores in their company
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.bins).toBeDefined();

    // Should be able to see bins from their company's stores
    const companyBin = body.data.bins.find((b: any) => b.bin_id === bin.bin_id);
    expect(companyBin).toBeDefined();
  });

  test("10-1-INTEGRATION-005: should enforce RLS - system admin can access all stores", async ({
    superadminApiRequest,
    superadminUser,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: System admin and a shift from another store
    const shift = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        status: ShiftStatus.ACTIVE,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const bin = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      display_order: 0,
      name: "Other Store Bin",
    });

    // WHEN: System admin requests closing data for another store's shift
    const response = await superadminApiRequest.get(
      `/api/shifts/${shift.shift_id}/lottery/closing-data`,
    );

    // THEN: Can access data from any store (SYSTEM scope bypasses RLS)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.bins).toBeDefined();

    // Should be able to see bins from any store
    const otherStoreBin = body.data.bins.find(
      (b: any) => b.bin_id === bin.bin_id,
    );
    expect(otherStoreBin).toBeDefined();
  });

  // ============ SECURITY TESTS (MANDATORY) ============

  test("10-1-INTEGRATION-SEC-001: should prevent privilege escalation via shiftId manipulation", async ({
    storeManagerApiRequest,
    storeManagerUser,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: Store manager and corporate admin with different stores
    const corporateShift = await createShift(
      {
        store_id: corporateAdminUser.store_id,
        opened_by: corporateAdminUser.user_id,
        status: ShiftStatus.ACTIVE,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    // WHEN: Store manager tries to access corporate admin's shift by manipulating shiftId
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${corporateShift.shift_id}/lottery/closing-data`,
    );

    // THEN: Returns 403 Forbidden (RLS prevents privilege escalation)
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toHaveProperty("code");
  });

  test("10-1-INTEGRATION-SEC-002: should prevent data leakage across stores", async ({
    storeManagerApiRequest,
    storeManagerUser,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: Two stores with sensitive data
    const shift1 = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        status: ShiftStatus.ACTIVE,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const game1 = await createLotteryGame(prismaClient, {
      name: "Store 1 Secret Game",
      price: 5.0,
    });

    const bin1 = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      display_order: 0,
      name: "Store 1 Bin",
    });

    const pack1 = await createLotteryPack(prismaClient, {
      game_id: game1.game_id,
      store_id: storeManagerUser.store_id,
      current_bin_id: bin1.bin_id,
      status: LotteryPackStatus.ACTIVE,
      pack_number: "STORE1-SECRET",
      serial_start: "001",
      serial_end: "100",
    });

    // Store 2 with different data
    const shift2 = await createShift(
      {
        store_id: corporateAdminUser.store_id,
        opened_by: corporateAdminUser.user_id,
        status: ShiftStatus.ACTIVE,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const game2 = await createLotteryGame(prismaClient, {
      name: "Store 2 Secret Game",
      price: 10.0,
    });

    const bin2 = await createLotteryBin(prismaClient, {
      store_id: corporateAdminUser.store_id,
      display_order: 0,
      name: "Store 2 Bin",
    });

    const pack2 = await createLotteryPack(prismaClient, {
      game_id: game2.game_id,
      store_id: corporateAdminUser.store_id,
      current_bin_id: bin2.bin_id,
      status: LotteryPackStatus.ACTIVE,
      pack_number: "STORE2-SECRET",
      serial_start: "001",
      serial_end: "100",
    });

    // WHEN: Store manager requests their own shift data
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift1.shift_id}/lottery/closing-data`,
    );

    // THEN: Only Store 1 data is returned (no Store 2 data leakage)
    expect(response.status()).toBe(200);
    const body = await response.json();
    const bins = body.data.bins;

    // Store 1 data should be present
    const store1Bin = bins.find((b: any) => b.bin_id === bin1.bin_id);
    expect(store1Bin).toBeDefined();
    expect(store1Bin.pack?.pack_number).toBe("STORE1-SECRET");

    // Store 2 data should NOT be present (data leakage prevention)
    const store2Bin = bins.find((b: any) => b.bin_id === bin2.bin_id);
    expect(store2Bin).toBeUndefined();

    // Verify no Store 2 game names leaked
    const store2GameName = bins.some((b: any) =>
      b.pack?.game_name?.includes("Store 2 Secret"),
    );
    expect(store2GameName).toBe(false);
  });

  test("10-1-INTEGRATION-SEC-003: should enforce RLS even with SQL injection attempts", async ({
    storeManagerApiRequest,
    storeManagerUser,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: Corporate admin's shift
    const corporateShift = await createShift(
      {
        store_id: corporateAdminUser.store_id,
        opened_by: corporateAdminUser.user_id,
        status: ShiftStatus.ACTIVE,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    // WHEN: Store manager tries SQL injection in shiftId to bypass RLS
    const sqlInjectionAttempts = [
      `${corporateShift.shift_id}' OR '1'='1`,
      `${corporateShift.shift_id}' UNION SELECT * FROM shifts --`,
      `'; DROP TABLE shifts; --`,
    ];

    for (const maliciousShiftId of sqlInjectionAttempts) {
      const response = await storeManagerApiRequest.get(
        `/api/shifts/${maliciousShiftId}/lottery/closing-data`,
      );

      // THEN: Request is rejected (404 for invalid UUID, or 403 for RLS)
      expect([400, 403, 404]).toContain(response.status());
      const body = await response.json();
      expect(body.success).toBe(false);
      // RLS should still be enforced even with injection attempts
    }
  });

  // ============ AUTOMATIC ASSERTIONS ============

  test("10-1-INTEGRATION-ASSERT-001: should verify RLS enforcement in response data", async ({
    storeManagerApiRequest,
    storeManagerUser,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: Two stores with bins
    const shift1 = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        status: ShiftStatus.ACTIVE,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const bin1 = await createLotteryBin(prismaClient, {
      store_id: storeManagerUser.store_id,
      display_order: 0,
      name: "Store 1 Bin",
    });

    const bin2 = await createLotteryBin(prismaClient, {
      store_id: corporateAdminUser.store_id,
      display_order: 0,
      name: "Store 2 Bin",
    });

    // WHEN: Store manager requests closing data
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift1.shift_id}/lottery/closing-data`,
    );

    // THEN: Response contains only Store 1 bins (RLS enforced)
    expect(response.status()).toBe(200);
    const body = await response.json();
    const bins = body.data.bins;

    // Verify all bins belong to Store 1
    bins.forEach((bin: any) => {
      // All bins should be from storeManagerUser's store
      expect(bin.bin_id).not.toBe(bin2.bin_id);
    });

    // Verify Store 1 bin is present
    const store1Bin = bins.find((b: any) => b.bin_id === bin1.bin_id);
    expect(store1Bin).toBeDefined();
  });

  // ============ EDGE CASES ============

  test("10-1-INTEGRATION-EDGE-001: should handle concurrent access from multiple stores", async ({
    storeManagerApiRequest,
    storeManagerUser,
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: Two stores with concurrent shifts
    const shift1 = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        status: ShiftStatus.ACTIVE,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    const shift2 = await createShift(
      {
        store_id: corporateAdminUser.store_id,
        opened_by: corporateAdminUser.user_id,
        status: ShiftStatus.ACTIVE,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    // WHEN: Both users request closing data concurrently
    const [response1, response2] = await Promise.all([
      storeManagerApiRequest.get(
        `/api/shifts/${shift1.shift_id}/lottery/closing-data`,
      ),
      corporateAdminApiRequest.get(
        `/api/shifts/${shift2.shift_id}/lottery/closing-data`,
      ),
    ]);

    // THEN: Each user only gets their own store's data
    expect(response1.status()).toBe(200);
    expect(response2.status()).toBe(200);

    const body1 = await response1.json();
    const body2 = await response2.json();

    // Verify data isolation (no cross-store data)
    const bins1 = body1.data.bins;
    const bins2 = body2.data.bins;

    // Store 1 bins should not appear in Store 2 response
    bins2.forEach((bin: any) => {
      expect(bin.bin_id).not.toBe(
        bins1.find((b: any) => b.bin_id === bin.bin_id)?.bin_id,
      );
    });
  });

  test("10-1-INTEGRATION-EDGE-002: should handle user with no store association", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: Shift from a store
    const shift = await createShift(
      {
        store_id: "some-store-id",
        opened_by: "some-user-id",
        status: ShiftStatus.ACTIVE,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    // WHEN: Unauthenticated or user without store association requests data
    const response = await apiRequest.get(
      `/api/shifts/${shift.shift_id}/lottery/closing-data`,
    );

    // THEN: Returns 401 Unauthorized or 403 Forbidden
    expect([401, 403]).toContain(response.status());
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("10-1-INTEGRATION-EDGE-003: should handle multiple bins across stores correctly", async ({
    storeManagerApiRequest,
    storeManagerUser,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: Store 1 with multiple bins, Store 2 with bins
    const shift1 = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        status: ShiftStatus.ACTIVE,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    // Create 10 bins for Store 1
    const store1Bins = [];
    for (let i = 0; i < 10; i++) {
      const bin = await createLotteryBin(prismaClient, {
        store_id: storeManagerUser.store_id,
        display_order: i,
        name: `Store 1 Bin ${i + 1}`,
      });
      store1Bins.push(bin);
    }

    // Create 5 bins for Store 2
    const store2Bins = [];
    for (let i = 0; i < 5; i++) {
      const bin = await createLotteryBin(prismaClient, {
        store_id: corporateAdminUser.store_id,
        display_order: i,
        name: `Store 2 Bin ${i + 1}`,
      });
      store2Bins.push(bin);
    }

    // WHEN: Store manager requests closing data
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift1.shift_id}/lottery/closing-data`,
    );

    // THEN: Only Store 1 bins are returned (10 bins)
    expect(response.status()).toBe(200);
    const body = await response.json();
    const bins = body.data.bins;

    // Verify all returned bins are from Store 1
    const returnedBinIds = bins.map((b: any) => b.bin_id);
    store1Bins.forEach((bin) => {
      expect(returnedBinIds).toContain(bin.bin_id);
    });

    // Verify no Store 2 bins are returned
    store2Bins.forEach((bin) => {
      expect(returnedBinIds).not.toContain(bin.bin_id);
    });
  });

  test("10-1-INTEGRATION-EDGE-004: should handle maximum 200 bins with RLS enforcement", async ({
    storeManagerApiRequest,
    storeManagerUser,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: Store 1 with 200 bins (maximum), Store 2 with bins
    const shift1 = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        status: ShiftStatus.ACTIVE,
        opening_cash: 100.0,
      },
      prismaClient,
    );

    // Create 200 bins for Store 1
    for (let i = 0; i < 200; i++) {
      await createLotteryBin(prismaClient, {
        store_id: storeManagerUser.store_id,
        display_order: i,
        name: `Store 1 Bin ${i + 1}`,
      });
    }

    // Create 50 bins for Store 2
    for (let i = 0; i < 50; i++) {
      await createLotteryBin(prismaClient, {
        store_id: corporateAdminUser.store_id,
        display_order: i,
        name: `Store 2 Bin ${i + 1}`,
      });
    }

    // WHEN: Store manager requests closing data
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift1.shift_id}/lottery/closing-data`,
    );

    // THEN: Exactly 200 bins are returned (only Store 1 bins)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.bins.length).toBe(200);
    // Verify no Store 2 bins leaked
    const store2BinNames = body.data.bins.filter((b: any) =>
      b.name?.includes("Store 2"),
    );
    expect(store2BinNames.length).toBe(0);
  });
});
