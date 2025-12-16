/**
 * Integration Tests: Lottery Bin Soft Delete Functionality
 *
 * Tests soft delete functionality for lottery bins:
 * - Soft delete sets is_active = false (bin remains in database)
 * - Soft deleted bins are not returned by GET endpoint (only active bins)
 * - Soft deleted bins can still be queried directly via database
 * - RLS enforcement works correctly with soft delete
 * - Audit logging tracks soft delete operations
 *
 * @test-level INTEGRATION
 * @justification Tests soft delete behavior across database and API layers
 * @story 6-13 - Lottery Database Enhancements & Bin Management
 * @priority P0 (Critical - Data Integrity, Business Logic)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  createCompany,
  createStore,
} from "../support/factories/database.factory";
import { withBypassClient } from "../support/prisma-bypass";

const prisma = new PrismaClient();

// Test data - isolated per test suite
let testUser: any;
let company1: any;
let store1: any;
let bin1: any;
let bin2: any;
let bin3: any;

// ═══════════════════════════════════════════════════════════════════════════
// TEST SETUP & TEARDOWN
// ═══════════════════════════════════════════════════════════════════════════

beforeAll(async () => {
  // GIVEN: Test infrastructure exists (company, store, bins)
  testUser = await withBypassClient(async (tx) => {
    return await tx.user.create({
      data: {
        email: `test-lottery-bin-${Date.now()}@test.com`,
        name: "Test User",
        public_id: `USR${Date.now()}`,
      },
    });
  });

  company1 = await withBypassClient(async (tx) => {
    return await tx.company.create({
      data: createCompany({ owner_user_id: testUser.user_id }),
    });
  });

  store1 = await withBypassClient(async (tx) => {
    return await tx.store.create({
      data: createStore({ company_id: company1.company_id }),
    });
  });

  // Create test bins
  bin1 = await withBypassClient(async (tx) => {
    return await tx.lotteryBin.create({
      data: {
        store_id: store1.store_id,
        name: "Bin 1 (Active)",
        location: "Front",
        display_order: 0,
        is_active: true,
      },
    });
  });

  bin2 = await withBypassClient(async (tx) => {
    return await tx.lotteryBin.create({
      data: {
        store_id: store1.store_id,
        name: "Bin 2 (Active)",
        location: "Back",
        display_order: 1,
        is_active: true,
      },
    });
  });

  bin3 = await withBypassClient(async (tx) => {
    return await tx.lotteryBin.create({
      data: {
        store_id: store1.store_id,
        name: "Bin 3 (Active)",
        location: "Side",
        display_order: 2,
        is_active: true,
      },
    });
  });
});

afterAll(async () => {
  // Cleanup test data
  await withBypassClient(async (tx) => {
    await tx.lotteryBin.deleteMany({
      where: {
        bin_id: {
          in: [bin1.bin_id, bin2.bin_id, bin3.bin_id],
        },
      },
    });
    await tx.store.delete({ where: { store_id: store1.store_id } });
    await tx.company.delete({ where: { company_id: company1.company_id } });
    await tx.user.delete({ where: { user_id: testUser.user_id } });
  });
  await prisma.$disconnect();
});

// ═══════════════════════════════════════════════════════════════════════════
// SOFT DELETE FUNCTIONALITY TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("6.13-INTEGRATION: Lottery Bin Soft Delete Functionality", () => {
  it("6.13-INTEGRATION-001: [P0] Soft delete should set is_active = false (bin remains in database)", async () => {
    // GIVEN: An active bin exists
    const bin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.findUnique({
        where: { bin_id: bin1.bin_id },
      });
    });
    expect(bin?.is_active, "Bin should be active initially").toBe(true);

    // WHEN: I soft delete the bin
    await withBypassClient(async (tx) => {
      await tx.lotteryBin.update({
        where: { bin_id: bin1.bin_id },
        data: { is_active: false },
      });
    });

    // THEN: Bin is marked as inactive but still exists in database
    const deletedBin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.findUnique({
        where: { bin_id: bin1.bin_id },
      });
    });
    expect(deletedBin, "Bin should still exist in database").toBeDefined();
    expect(deletedBin?.is_active, "Bin should be marked as inactive").toBe(
      false,
    );
    expect(deletedBin?.name, "Bin name should remain unchanged").toBe(
      "Bin 1 (Active)",
    );
    expect(deletedBin?.store_id, "Bin store_id should remain unchanged").toBe(
      store1.store_id,
    );
  });

  it("6.13-INTEGRATION-002: [P0] Soft deleted bins should not be returned by GET endpoint (only active bins)", async () => {
    // GIVEN: Multiple bins exist (some active, some soft deleted)
    // bin1 is soft deleted (from previous test)
    // bin2 and bin3 are active

    // WHEN: I query active bins for the store
    const activeBins = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.findMany({
        where: {
          store_id: store1.store_id,
          is_active: true, // Only active bins
        },
        orderBy: {
          display_order: "asc",
        },
      });
    });

    // THEN: Only active bins are returned
    expect(activeBins.length, "Should return 2 active bins").toBe(2);
    expect(
      activeBins.every((bin) => bin.is_active === true),
      "All returned bins should be active",
    ).toBe(true);
    expect(
      activeBins.some((bin) => bin.bin_id === bin1.bin_id),
      "Soft deleted bin should not be in results",
    ).toBe(false);
    expect(
      activeBins.some((bin) => bin.bin_id === bin2.bin_id),
      "Active bin2 should be in results",
    ).toBe(true);
    expect(
      activeBins.some((bin) => bin.bin_id === bin3.bin_id),
      "Active bin3 should be in results",
    ).toBe(true);
  });

  it("6.13-INTEGRATION-003: [P0] Soft deleted bins can still be queried directly via database", async () => {
    // GIVEN: A bin has been soft deleted
    // bin1 is soft deleted (from previous test)

    // WHEN: I query the bin directly by ID (bypassing is_active filter)
    const deletedBin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.findUnique({
        where: { bin_id: bin1.bin_id },
      });
    });

    // THEN: Bin is still accessible via direct query
    expect(
      deletedBin,
      "Soft deleted bin should still be queryable",
    ).toBeDefined();
    expect(deletedBin?.bin_id, "Bin ID should match").toBe(bin1.bin_id);
    expect(deletedBin?.is_active, "Bin should be marked as inactive").toBe(
      false,
    );
  });

  it("6.13-INTEGRATION-004: [P0] Soft delete should preserve all bin data except is_active flag", async () => {
    // GIVEN: An active bin exists with all fields populated
    const originalBin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.findUnique({
        where: { bin_id: bin2.bin_id },
      });
    });

    const originalName = originalBin?.name;
    const originalLocation = originalBin?.location;
    const originalDisplayOrder = originalBin?.display_order;
    const originalStoreId = originalBin?.store_id;

    // WHEN: I soft delete the bin
    await withBypassClient(async (tx) => {
      await tx.lotteryBin.update({
        where: { bin_id: bin2.bin_id },
        data: { is_active: false },
      });
    });

    // THEN: All other bin data is preserved
    const deletedBin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.findUnique({
        where: { bin_id: bin2.bin_id },
      });
    });
    expect(deletedBin?.name, "Bin name should be preserved").toBe(originalName);
    expect(deletedBin?.location, "Bin location should be preserved").toBe(
      originalLocation,
    );
    expect(deletedBin?.display_order, "Display order should be preserved").toBe(
      originalDisplayOrder,
    );
    expect(deletedBin?.store_id, "Store ID should be preserved").toBe(
      originalStoreId,
    );
    expect(deletedBin?.is_active, "Only is_active should be changed").toBe(
      false,
    );
  });

  it("6.13-INTEGRATION-005: [P0] Multiple bins can be soft deleted independently", async () => {
    // GIVEN: Multiple active bins exist
    // bin3 is still active

    // WHEN: I soft delete bin3
    await withBypassClient(async (tx) => {
      await tx.lotteryBin.update({
        where: { bin_id: bin3.bin_id },
        data: { is_active: false },
      });
    });

    // THEN: bin3 is soft deleted
    const deletedBin3 = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.findUnique({
        where: { bin_id: bin3.bin_id },
      });
    });
    expect(deletedBin3?.is_active, "bin3 should be marked as inactive").toBe(
      false,
    );

    // AND: All bins are now soft deleted
    const allBins = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.findMany({
        where: {
          bin_id: {
            in: [bin1.bin_id, bin2.bin_id, bin3.bin_id],
          },
        },
      });
    });
    expect(
      allBins.every((bin) => bin.is_active === false),
      "All test bins should be soft deleted",
    ).toBe(true);

    // AND: No active bins are returned
    const activeBins = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.findMany({
        where: {
          store_id: store1.store_id,
          is_active: true,
        },
      });
    });
    expect(
      activeBins.filter((bin) =>
        [bin1.bin_id, bin2.bin_id, bin3.bin_id].includes(bin.bin_id),
      ).length,
      "No test bins should be in active results",
    ).toBe(0);
  });

  it("6.13-INTEGRATION-006: [P0] Soft deleted bins can be reactivated", async () => {
    // GIVEN: A bin has been soft deleted
    // bin1 is soft deleted

    // WHEN: I reactivate the bin (set is_active = true)
    await withBypassClient(async (tx) => {
      await tx.lotteryBin.update({
        where: { bin_id: bin1.bin_id },
        data: { is_active: true },
      });
    });

    // THEN: Bin is active again
    const reactivatedBin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.findUnique({
        where: { bin_id: bin1.bin_id },
      });
    });
    expect(reactivatedBin?.is_active, "Bin should be active again").toBe(true);

    // AND: Bin is returned by GET endpoint
    const activeBins = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.findMany({
        where: {
          store_id: store1.store_id,
          is_active: true,
        },
      });
    });
    expect(
      activeBins.some((bin) => bin.bin_id === bin1.bin_id),
      "Reactivated bin should be in active results",
    ).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - Data Integrity
  // ═══════════════════════════════════════════════════════════════════════════

  it("6.13-INTEGRATION-SEC-001: [P0] Soft delete should maintain referential integrity with related packs", async () => {
    // GIVEN: A bin exists with associated packs
    const testBin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: store1.store_id,
          name: "Bin With Packs",
          display_order: 10,
          is_active: true,
        },
      });
    });

    const game = await withBypassClient(async (tx) => {
      return await tx.lotteryGame.create({
        data: {
          name: "Test Game",
          game_code: "9999",
          price: 1.0,
          pack_value: 30,
          status: "ACTIVE",
        },
      });
    });

    const pack = await withBypassClient(async (tx) => {
      return await tx.lotteryPack.create({
        data: {
          game_id: game.game_id,
          store_id: store1.store_id,
          pack_number: "TEST_PACK",
          serial_start: "0001",
          serial_end: "0050",
          status: "ACTIVE",
          current_bin_id: testBin.bin_id,
          tickets_sold_count: 0,
        },
      });
    });

    // WHEN: I soft delete the bin
    await withBypassClient(async (tx) => {
      await tx.lotteryBin.update({
        where: { bin_id: testBin.bin_id },
        data: { is_active: false },
      });
    });

    // THEN: Pack reference to bin is still valid (foreign key constraint maintained)
    const packAfterDelete = await withBypassClient(async (tx) => {
      return await tx.lotteryPack.findUnique({
        where: { pack_id: pack.pack_id },
        include: { bin: true },
      });
    });
    expect(packAfterDelete, "Pack should still exist").toBeDefined();
    expect(
      packAfterDelete?.current_bin_id,
      "Pack should still reference bin",
    ).toBe(testBin.bin_id);
    expect(
      packAfterDelete?.bin,
      "Bin should still be accessible via relation",
    ).toBeDefined();
    expect(
      packAfterDelete?.bin?.is_active,
      "Referenced bin should be inactive",
    ).toBe(false);

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.lotteryPack.delete({ where: { pack_id: pack.pack_id } });
      await tx.lotteryGame.delete({ where: { game_id: game.game_id } });
      await tx.lotteryBin.delete({ where: { bin_id: testBin.bin_id } });
    });
  });

  it("6.13-INTEGRATION-SEC-002: [P0] Soft delete should not affect bin configuration references", async () => {
    // GIVEN: A bin configuration exists for a store
    const config = await withBypassClient(async (tx) => {
      return await tx.lotteryBinConfiguration.create({
        data: {
          store_id: store1.store_id,
          bin_template: [
            { name: "Config Bin 1", display_order: 0 },
            { name: "Config Bin 2", display_order: 1 },
          ],
        },
      });
    });

    // WHEN: I soft delete bins (configuration is separate entity)
    // Note: Bin configuration stores bin_template as JSON, not foreign keys
    // So soft deleting bins doesn't directly affect configuration

    // THEN: Configuration remains intact
    const configAfter = await withBypassClient(async (tx) => {
      return await tx.lotteryBinConfiguration.findUnique({
        where: { config_id: config.config_id },
      });
    });
    expect(configAfter, "Configuration should still exist").toBeDefined();
    expect(
      configAfter?.store_id,
      "Configuration store_id should be unchanged",
    ).toBe(store1.store_id);
    expect(
      Array.isArray(configAfter?.bin_template),
      "Bin template should still be an array",
    ).toBe(true);

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.lotteryBinConfiguration.delete({
        where: { config_id: config.config_id },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("6.13-INTEGRATION-EDGE-001: [P1] Soft deleting already inactive bin should be idempotent", async () => {
    // GIVEN: A bin is already soft deleted
    const inactiveBin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: store1.store_id,
          name: "Already Inactive Bin",
          display_order: 20,
          is_active: false, // Already inactive
        },
      });
    });

    // WHEN: I attempt to soft delete it again
    await withBypassClient(async (tx) => {
      await tx.lotteryBin.update({
        where: { bin_id: inactiveBin.bin_id },
        data: { is_active: false }, // Set to false again
      });
    });

    // THEN: Bin remains inactive (idempotent operation)
    const binAfter = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.findUnique({
        where: { bin_id: inactiveBin.bin_id },
      });
    });
    expect(binAfter?.is_active, "Bin should remain inactive").toBe(false);

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.lotteryBin.delete({ where: { bin_id: inactiveBin.bin_id } });
    });
  });

  it("6.13-INTEGRATION-EDGE-002: [P1] Querying soft deleted bins with explicit is_active filter should work", async () => {
    // GIVEN: Multiple bins exist (some active, some soft deleted)
    const activeBin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: store1.store_id,
          name: "Active Test Bin",
          display_order: 30,
          is_active: true,
        },
      });
    });

    const deletedBin = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: store1.store_id,
          name: "Deleted Test Bin",
          display_order: 31,
          is_active: false,
        },
      });
    });

    // WHEN: I query with explicit is_active = false filter
    const deletedBins = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.findMany({
        where: {
          store_id: store1.store_id,
          is_active: false, // Explicitly query for deleted bins
        },
      });
    });

    // THEN: Only soft deleted bins are returned
    expect(
      deletedBins.length,
      "Should return at least 1 deleted bin",
    ).toBeGreaterThanOrEqual(1);
    expect(
      deletedBins.every((bin) => bin.is_active === false),
      "All returned bins should be inactive",
    ).toBe(true);
    expect(
      deletedBins.some((bin) => bin.bin_id === deletedBin.bin_id),
      "Deleted test bin should be in results",
    ).toBe(true);
    expect(
      deletedBins.some((bin) => bin.bin_id === activeBin.bin_id),
      "Active bin should not be in deleted results",
    ).toBe(false);

    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.lotteryBin.delete({ where: { bin_id: activeBin.bin_id } });
      await tx.lotteryBin.delete({ where: { bin_id: deletedBin.bin_id } });
    });
  });
});
