/**
 * Integration Tests: Lottery Bin Ordering and Active Status
 *
 * Tests bin ordering and active status filtering:
 * - Display order sorting
 * - Active status filtering
 * - Composite queries with store_id, is_active, display_order
 *
 * @test-level INTEGRATION
 * @justification Tests database operations with Prisma Client queries that require database connection
 * @story 6-13 - Lottery Database Enhancements & Bin Management
 * @priority P1 (High - Data Integrity)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  createLotteryGame,
  createLotteryBin,
} from "../../support/factories/lottery.factory";

const prisma = new PrismaClient();

// Test data - isolated per test suite
let testUser: any;
let testCompany: any;
let testStore: any;
let testGame: any;
let testBins: any[] = [];

// ═══════════════════════════════════════════════════════════════════════════
// TEST SETUP & TEARDOWN
// ═══════════════════════════════════════════════════════════════════════════

beforeAll(async () => {
  // Create test user first
  testUser = await prisma.user.create({
    data: {
      email: `test-bin-order-${Date.now()}@test.com`,
      name: "Test User",
      public_id: `USR${Date.now()}`,
    },
  });

  // Create test company
  testCompany = await prisma.company.create({
    data: {
      name: "Test Bin Order Company",
      owner_user_id: testUser.user_id,
      public_id: `COM${Date.now()}`,
    },
  });

  // Create test store
  testStore = await prisma.store.create({
    data: {
      company_id: testCompany.company_id,
      name: "Test Bin Order Store",
      public_id: `STR${Date.now()}`,
    },
  });

  // Create test game
  testGame = await createLotteryGame(prisma, {
    game_code: "1234",
    price: 5.0,
  });
});

afterAll(async () => {
  // Clean up test data
  await prisma.lotteryBin.deleteMany({
    where: { bin_id: { in: testBins.map((b) => b.bin_id) } },
  });
  await prisma.lotteryGame.deleteMany({
    where: { game_id: testGame.game_id },
  });
  await prisma.store.deleteMany({
    where: { store_id: testStore.store_id },
  });
  await prisma.company.deleteMany({
    where: { company_id: testCompany.company_id },
  });
  await prisma.user.deleteMany({
    where: { user_id: testUser.user_id },
  });
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Clean up bins before each test
  await prisma.lotteryBin.deleteMany({
    where: { store_id: testStore.store_id },
  });
  testBins = [];
});

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("6.13-INTEGRATION: Lottery Bin Ordering and Active Status", () => {
  describe("Display Order Sorting", () => {
    it("6.13-INTEGRATION-001: should return bins sorted by display_order", async () => {
      // GIVEN: Multiple bins with different display orders
      const bin1 = await createLotteryBin(prisma, {
        store_id: testStore.store_id,
        name: "Bin 1",
        display_order: 3,
        is_active: true,
      });
      const bin2 = await createLotteryBin(prisma, {
        store_id: testStore.store_id,
        name: "Bin 2",
        display_order: 1,
        is_active: true,
      });
      const bin3 = await createLotteryBin(prisma, {
        store_id: testStore.store_id,
        name: "Bin 3",
        display_order: 2,
        is_active: true,
      });
      testBins = [bin1, bin2, bin3];

      // WHEN: Querying bins ordered by display_order
      const bins = await prisma.lotteryBin.findMany({
        where: { store_id: testStore.store_id, is_active: true },
        orderBy: { display_order: "asc" },
      });

      // THEN: Bins are returned in display_order sequence
      expect(bins).toHaveLength(3);
      expect(bins[0].display_order).toBe(1);
      expect(bins[1].display_order).toBe(2);
      expect(bins[2].display_order).toBe(3);
      expect(bins[0].name).toBe("Bin 2");
      expect(bins[1].name).toBe("Bin 3");
      expect(bins[2].name).toBe("Bin 1");
    });

    it("6.13-INTEGRATION-002: should handle bins with same display_order", async () => {
      // GIVEN: Multiple bins with same display_order
      const bin1 = await createLotteryBin(prisma, {
        store_id: testStore.store_id,
        name: "Bin A",
        display_order: 1,
        is_active: true,
      });
      const bin2 = await createLotteryBin(prisma, {
        store_id: testStore.store_id,
        name: "Bin B",
        display_order: 1,
        is_active: true,
      });
      testBins = [bin1, bin2];

      // WHEN: Querying bins ordered by display_order
      const bins = await prisma.lotteryBin.findMany({
        where: { store_id: testStore.store_id, is_active: true },
        orderBy: { display_order: "asc" },
      });

      // THEN: Both bins are returned (uniqueness handled at application level)
      expect(bins).toHaveLength(2);
      expect(bins.every((b) => b.display_order === 1)).toBe(true);
    });
  });

  describe("Active Status Filtering", () => {
    it("6.13-INTEGRATION-003: should return only active bins when filtering by is_active=true", async () => {
      // GIVEN: Mix of active and inactive bins
      const activeBin1 = await createLotteryBin(prisma, {
        store_id: testStore.store_id,
        name: "Active Bin 1",
        display_order: 1,
        is_active: true,
      });
      const activeBin2 = await createLotteryBin(prisma, {
        store_id: testStore.store_id,
        name: "Active Bin 2",
        display_order: 2,
        is_active: true,
      });
      const inactiveBin = await createLotteryBin(prisma, {
        store_id: testStore.store_id,
        name: "Inactive Bin",
        display_order: 3,
        is_active: false,
      });
      testBins = [activeBin1, activeBin2, inactiveBin];

      // WHEN: Querying only active bins
      const activeBins = await prisma.lotteryBin.findMany({
        where: { store_id: testStore.store_id, is_active: true },
        orderBy: { display_order: "asc" },
      });

      // THEN: Only active bins are returned
      expect(activeBins).toHaveLength(2);
      expect(activeBins.every((b) => b.is_active === true)).toBe(true);
      expect(activeBins.map((b) => b.name)).toEqual([
        "Active Bin 1",
        "Active Bin 2",
      ]);
    });

    it("6.13-INTEGRATION-004: should return only inactive bins when filtering by is_active=false", async () => {
      // GIVEN: Mix of active and inactive bins
      const activeBin = await createLotteryBin(prisma, {
        store_id: testStore.store_id,
        name: "Active Bin",
        display_order: 1,
        is_active: true,
      });
      const inactiveBin1 = await createLotteryBin(prisma, {
        store_id: testStore.store_id,
        name: "Inactive Bin 1",
        display_order: 2,
        is_active: false,
      });
      const inactiveBin2 = await createLotteryBin(prisma, {
        store_id: testStore.store_id,
        name: "Inactive Bin 2",
        display_order: 3,
        is_active: false,
      });
      testBins = [activeBin, inactiveBin1, inactiveBin2];

      // WHEN: Querying only inactive bins
      const inactiveBins = await prisma.lotteryBin.findMany({
        where: { store_id: testStore.store_id, is_active: false },
        orderBy: { display_order: "asc" },
      });

      // THEN: Only inactive bins are returned
      expect(inactiveBins).toHaveLength(2);
      expect(inactiveBins.every((b) => b.is_active === false)).toBe(true);
      expect(inactiveBins.map((b) => b.name)).toEqual([
        "Inactive Bin 1",
        "Inactive Bin 2",
      ]);
    });
  });

  describe("Composite Queries", () => {
    it("6.13-INTEGRATION-005: should filter by store_id and is_active, ordered by display_order", async () => {
      // GIVEN: Bins in different stores with different active statuses
      const otherStore = await prisma.store.create({
        data: {
          company_id: testCompany.company_id,
          name: "Other Test Store",
          public_id: `STRO${Date.now()}`,
        },
      });
      const bin1 = await createLotteryBin(prisma, {
        store_id: testStore.store_id,
        name: "Store 1 Bin 1",
        display_order: 2,
        is_active: true,
      });
      const bin2 = await createLotteryBin(prisma, {
        store_id: testStore.store_id,
        name: "Store 1 Bin 2",
        display_order: 1,
        is_active: true,
      });
      const bin3 = await createLotteryBin(prisma, {
        store_id: testStore.store_id,
        name: "Store 1 Inactive",
        display_order: 3,
        is_active: false,
      });
      const otherStoreBin = await createLotteryBin(prisma, {
        store_id: otherStore.store_id,
        name: "Store 2 Bin",
        display_order: 1,
        is_active: true,
      });
      testBins = [bin1, bin2, bin3, otherStoreBin];

      // WHEN: Querying active bins for specific store, ordered by display_order
      const bins = await prisma.lotteryBin.findMany({
        where: { store_id: testStore.store_id, is_active: true },
        orderBy: { display_order: "asc" },
      });

      // THEN: Only active bins for the specified store are returned, in display_order
      expect(bins).toHaveLength(2);
      expect(bins.every((b) => b.store_id === testStore.store_id)).toBe(true);
      expect(bins.every((b) => b.is_active === true)).toBe(true);
      expect(bins[0].display_order).toBe(1);
      expect(bins[1].display_order).toBe(2);
      expect(bins.map((b) => b.name)).toEqual([
        "Store 1 Bin 2",
        "Store 1 Bin 1",
      ]);

      // Clean up other store
      await prisma.lotteryBin.deleteMany({
        where: { store_id: otherStore.store_id },
      });
      await prisma.store.deleteMany({
        where: { store_id: otherStore.store_id },
      });
    });
  });
});
