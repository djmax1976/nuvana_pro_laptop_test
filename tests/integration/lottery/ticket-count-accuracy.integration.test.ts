/**
 * Integration Tests: Lottery Ticket Count Accuracy
 *
 * Tests denormalized tickets_sold_count accuracy:
 * - Count updates on ticket sales
 * - Reconciliation with actual ticket serial records
 * - last_sold_at timestamp updates
 *
 * @test-level INTEGRATION
 * @justification Tests database operations and denormalized field maintenance
 * @story 6-13 - Lottery Database Enhancements & Bin Management
 * @priority P0 (Critical - Data Integrity)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  createLotteryGame,
  createLotteryPack,
  createStore,
  createCompany,
  createUser,
} from "../../support/factories/lottery.factory";
import {
  incrementTicketCount,
  validateCountAccuracy,
  updateTicketCountOnSale,
  reconcilePackTicketCount,
} from "../../../backend/src/services/lottery-count.service";

const prisma = new PrismaClient();

// Test data - isolated per test suite
let testUser: any;
let testCompany: any;
let testStore: any;
let testGame: any;
let testPack: any;

// ═══════════════════════════════════════════════════════════════════════════
// TEST SETUP & TEARDOWN
// ═══════════════════════════════════════════════════════════════════════════

beforeAll(async () => {
  // Create test company, store, game, and pack
  testCompany = await createCompany(prisma);
  testStore = await createStore(prisma, testCompany.company_id);
  testUser = await createUser(prisma, testCompany.company_id);
  testGame = await createLotteryGame(prisma, {
    game_code: "1234",
    price: 5.0,
  });
  testPack = await createLotteryPack(prisma, {
    game_id: testGame.game_id,
    store_id: testStore.store_id,
    pack_number: "PACK-001",
    serial_start: "000000000000000000000001",
    serial_end: "000000000000000000000100",
  });
});

afterAll(async () => {
  // Clean up test data
  await prisma.lotteryPack.deleteMany({
    where: { pack_id: testPack.pack_id },
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
  // Reset pack count before each test
  await prisma.lotteryPack.update({
    where: { pack_id: testPack.pack_id },
    data: {
      tickets_sold_count: 0,
      last_sold_at: null,
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("6.13-INTEGRATION: Lottery Ticket Count Accuracy", () => {
  describe("Denormalized Count Updates", () => {
    it("6.13-INTEGRATION-013: should update tickets_sold_count when incrementing", async () => {
      // GIVEN: Pack with initial count of 0
      let pack = await prisma.lotteryPack.findUnique({
        where: { pack_id: testPack.pack_id },
      });
      expect(pack?.tickets_sold_count).toBe(0);

      // WHEN: Incrementing count
      const { count, lastSoldAt } = incrementTicketCount(
        pack!.tickets_sold_count,
        pack!.last_sold_at,
      );
      await prisma.lotteryPack.update({
        where: { pack_id: testPack.pack_id },
        data: {
          tickets_sold_count: count,
          last_sold_at: lastSoldAt,
        },
      });

      // THEN: Count is updated in database
      pack = await prisma.lotteryPack.findUnique({
        where: { pack_id: testPack.pack_id },
      });
      expect(pack?.tickets_sold_count).toBe(1);
      expect(pack?.last_sold_at).not.toBeNull();
    });

    it("6.13-INTEGRATION-014: should update last_sold_at timestamp on increment", async () => {
      // GIVEN: Pack with no sales yet
      let pack = await prisma.lotteryPack.findUnique({
        where: { pack_id: testPack.pack_id },
      });
      expect(pack?.last_sold_at).toBeNull();

      // WHEN: Incrementing count
      const { count, lastSoldAt } = incrementTicketCount(
        pack!.tickets_sold_count,
        pack!.last_sold_at,
      );
      await prisma.lotteryPack.update({
        where: { pack_id: testPack.pack_id },
        data: {
          tickets_sold_count: count,
          last_sold_at: lastSoldAt,
        },
      });

      // THEN: last_sold_at is set
      pack = await prisma.lotteryPack.findUnique({
        where: { pack_id: testPack.pack_id },
      });
      expect(pack?.last_sold_at).not.toBeNull();
      expect(pack?.last_sold_at!.getTime()).toBeGreaterThan(0);
    });
  });

  describe("Count Accuracy Validation", () => {
    it("6.13-INTEGRATION-015: should validate accurate count", async () => {
      // GIVEN: Denormalized count matches actual count
      await prisma.lotteryPack.update({
        where: { pack_id: testPack.pack_id },
        data: { tickets_sold_count: 50 },
      });
      const denormalizedCount = 50;
      const actualSoldCount = 50; // Would come from LotteryTicketSerial count

      // WHEN: Validating accuracy
      const result = validateCountAccuracy(denormalizedCount, actualSoldCount);

      // THEN: Counts are accurate
      expect(result.accurate).toBe(true);
      expect(result.difference).toBeUndefined();
    });

    it("6.13-INTEGRATION-016: should detect inaccurate count", async () => {
      // GIVEN: Denormalized count differs from actual count
      await prisma.lotteryPack.update({
        where: { pack_id: testPack.pack_id },
        data: { tickets_sold_count: 45 },
      });
      const denormalizedCount = 45;
      const actualSoldCount = 50; // Would come from LotteryTicketSerial count

      // WHEN: Validating accuracy
      const result = validateCountAccuracy(denormalizedCount, actualSoldCount);

      // THEN: Counts are inaccurate with difference
      expect(result.accurate).toBe(false);
      expect(result.difference).toBe(5);
    });
  });

  describe("updateTicketCountOnSale", () => {
    it("6.13-INTEGRATION-017: should update pack count when called", async () => {
      // GIVEN: Pack with initial count
      let pack = await prisma.lotteryPack.findUnique({
        where: { pack_id: testPack.pack_id },
      });
      expect(pack?.tickets_sold_count).toBe(0);

      // WHEN: Updating count on sale
      const result = await updateTicketCountOnSale(testPack.pack_id);

      // THEN: Count is incremented and timestamp updated
      expect(result.tickets_sold_count).toBe(1);
      expect(result.last_sold_at).not.toBeNull();

      // Verify in database
      pack = await prisma.lotteryPack.findUnique({
        where: { pack_id: testPack.pack_id },
      });
      expect(pack?.tickets_sold_count).toBe(1);
      expect(pack?.last_sold_at).not.toBeNull();
    });

    it("6.13-INTEGRATION-018: should throw error if pack not found", async () => {
      // GIVEN: Non-existent pack ID
      const nonExistentPackId = "00000000-0000-0000-0000-000000000000";

      // WHEN: Updating count on sale
      // THEN: Error is thrown
      await expect(updateTicketCountOnSale(nonExistentPackId)).rejects.toThrow(
        "Pack",
      );
    });
  });

  describe("reconcilePackTicketCount", () => {
    it("6.13-INTEGRATION-019: should reconcile accurate count", async () => {
      // GIVEN: Pack with matching counts
      await prisma.lotteryPack.update({
        where: { pack_id: testPack.pack_id },
        data: { tickets_sold_count: 0 },
      });

      // Create some ticket serials (not sold yet)
      await prisma.lotteryTicketSerial.createMany({
        data: [
          {
            pack_id: testPack.pack_id,
            serial_number: "SERIAL-001",
            sold_at: null,
          },
          {
            pack_id: testPack.pack_id,
            serial_number: "SERIAL-002",
            sold_at: null,
          },
        ],
      });

      // WHEN: Reconciling count
      const result = await reconcilePackTicketCount(testPack.pack_id);

      // THEN: Counts are accurate (no sold tickets)
      expect(result.accurate).toBe(true);
      expect(result.corrected).toBe(false);
      expect(result.denormalized_count).toBe(0);
      expect(result.actual_count).toBe(0);
    });

    it("6.13-INTEGRATION-020: should correct count when discrepancy found", async () => {
      // GIVEN: Pack with incorrect denormalized count
      await prisma.lotteryPack.update({
        where: { pack_id: testPack.pack_id },
        data: { tickets_sold_count: 5 }, // Incorrect count
      });

      // Create sold ticket serials
      const soldAt = new Date();
      await prisma.lotteryTicketSerial.createMany({
        data: [
          {
            pack_id: testPack.pack_id,
            serial_number: "SERIAL-003",
            sold_at: soldAt,
          },
          {
            pack_id: testPack.pack_id,
            serial_number: "SERIAL-004",
            sold_at: soldAt,
          },
          {
            pack_id: testPack.pack_id,
            serial_number: "SERIAL-005",
            sold_at: soldAt,
          },
        ],
      });

      // WHEN: Reconciling count
      const result = await reconcilePackTicketCount(testPack.pack_id);

      // THEN: Count is corrected
      expect(result.accurate).toBe(false);
      expect(result.corrected).toBe(true);
      expect(result.denormalized_count).toBe(5);
      expect(result.actual_count).toBe(3);
      expect(result.difference).toBe(-2); // Actual is 2 less than denormalized

      // Verify pack was updated
      const pack = await prisma.lotteryPack.findUnique({
        where: { pack_id: testPack.pack_id },
      });
      expect(pack?.tickets_sold_count).toBe(3);
    });
  });
});
