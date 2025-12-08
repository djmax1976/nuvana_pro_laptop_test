/**
 * Integration Tests: Lottery Pack Movement Audit Trail
 *
 * Tests database operations for LotteryPackBinHistory model:
 * - Table creation via migration
 * - Model creation with all required fields
 * - Foreign key constraints (pack_id, bin_id, moved_by)
 * - Index performance for queries
 * - Cascade delete behavior
 * - Audit trail completeness (who, when, why)
 *
 * @test-level INTEGRATION
 * @justification Tests database operations, foreign key constraints, and Prisma Client queries that require database connection
 * @story 6-13 - Lottery Database Enhancements & Bin Management
 * @priority P1 (High - Database Constraints)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  createLotteryGame,
  createLotteryPack,
  createLotteryBin,
} from "../support/factories/lottery.factory";
import { movePackBetweenBins } from "../../backend/src/services/lottery.service";

const prisma = new PrismaClient();

// Test data - isolated per test suite
let testUser: any;
let testCompany: any;
let testStore: any;
let testGame: any;
let testPack: any;
let testBin1: any;
let testBin2: any;
let testMover: any;

// ═══════════════════════════════════════════════════════════════════════════
// TEST SETUP & TEARDOWN
// ═══════════════════════════════════════════════════════════════════════════

beforeAll(async () => {
  // GIVEN: Test infrastructure exists (company, store, game, pack, bins, mover)
  testUser = await prisma.user.create({
    data: {
      email: `test-movement-${Date.now()}@test.com`,
      name: "Test User",
      public_id: `USR${Date.now()}`,
    },
  });

  testCompany = await prisma.company.create({
    data: {
      name: "Test Company",
      owner_user_id: testUser.user_id,
      public_id: `COM${Date.now()}`,
    },
  });

  testStore = await prisma.store.create({
    data: {
      company_id: testCompany.company_id,
      name: "Test Store",
      public_id: `STR${Date.now()}`,
    },
  });

  testGame = await createLotteryGame(prisma, {
    name: "Test Game",
    price: 2.0,
    game_code: "1234",
  });

  testBin1 = await createLotteryBin(prisma, {
    store_id: testStore.store_id,
    name: "Bin 1",
    display_order: 1,
  });

  testBin2 = await createLotteryBin(prisma, {
    store_id: testStore.store_id,
    name: "Bin 2",
    display_order: 2,
  });

  testPack = await createLotteryPack(prisma, {
    game_id: testGame.game_id,
    store_id: testStore.store_id,
    pack_number: "MOVEMENT001",
    serial_start: "000000000000000000000001",
    serial_end: "000000000000000000000150",
    current_bin_id: testBin1.bin_id,
  });

  testMover = await prisma.user.create({
    data: {
      email: `test-mover-${Date.now()}@test.com`,
      name: "Test Mover",
      public_id: `MOV${Date.now()}`,
    },
  });
});

beforeEach(async () => {
  // Ensure test isolation - clean up history data before each test
  await prisma.lotteryPackBinHistory.deleteMany({});
});

afterAll(async () => {
  // Cleanup all test data
  await prisma.lotteryPackBinHistory.deleteMany({});
  await prisma.lotteryPack.deleteMany({});
  await prisma.lotteryBin.deleteMany({});
  await prisma.lotteryGame.deleteMany({});
  if (testMover)
    await prisma.user.delete({ where: { user_id: testMover.user_id } });
  if (testStore)
    await prisma.store.delete({ where: { store_id: testStore.store_id } });
  if (testCompany)
    await prisma.company.delete({
      where: { company_id: testCompany.company_id },
    });
  if (testUser)
    await prisma.user.delete({ where: { user_id: testUser.user_id } });
  await prisma.$disconnect();
});

// ═══════════════════════════════════════════════════════════════════════════
// LOTTERY PACK BIN HISTORY MODEL TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("6.13-INTEGRATION: Lottery Pack Movement Audit Trail", () => {
  describe("Model Creation", () => {
    it("6.13-INTEGRATION-012: should create history record with all required fields", async () => {
      // GIVEN: A pack, bin, and mover exist
      // WHEN: Creating a history record with required fields
      const history = await prisma.lotteryPackBinHistory.create({
        data: {
          pack_id: testPack.pack_id,
          bin_id: testBin1.bin_id,
          moved_by: testMover.user_id,
        },
      });

      // THEN: History record is created with all fields
      expect(history.history_id).toBeDefined();
      expect(history.pack_id).toBe(testPack.pack_id);
      expect(history.bin_id).toBe(testBin1.bin_id);
      expect(history.moved_by).toBe(testMover.user_id);
      expect(history.moved_at).toBeDefined();
      expect(history.created_at).toBeDefined();
      expect(history.updated_at).toBeDefined();
    });

    it("6.13-INTEGRATION-013: should create history record with optional reason", async () => {
      // GIVEN: A pack, bin, and mover exist
      // WHEN: Creating a history record with reason
      const reason = "Pack moved to front display for better visibility";
      const history = await prisma.lotteryPackBinHistory.create({
        data: {
          pack_id: testPack.pack_id,
          bin_id: testBin2.bin_id,
          moved_by: testMover.user_id,
          reason: reason,
        },
      });

      // THEN: History record is created with reason populated
      expect(history.history_id).toBeDefined();
      expect(history.reason).toBe(reason);
    });

    it("6.13-INTEGRATION-014: should set moved_at to current timestamp by default", async () => {
      // GIVEN: A pack, bin, and mover exist
      const beforeCreate = new Date();

      // WHEN: Creating a history record
      const history = await prisma.lotteryPackBinHistory.create({
        data: {
          pack_id: testPack.pack_id,
          bin_id: testBin1.bin_id,
          moved_by: testMover.user_id,
        },
      });

      const afterCreate = new Date();

      // THEN: moved_at is set to current timestamp
      expect(history.moved_at).toBeDefined();
      expect(history.moved_at.getTime()).toBeGreaterThanOrEqual(
        beforeCreate.getTime(),
      );
      expect(history.moved_at.getTime()).toBeLessThanOrEqual(
        afterCreate.getTime(),
      );
    });
  });

  describe("Foreign Key Constraints", () => {
    it("6.13-INTEGRATION-015: should enforce pack_id foreign key constraint", async () => {
      // GIVEN: An invalid pack_id
      // WHEN: Creating a history record with non-existent pack_id
      // THEN: Foreign key constraint error is raised
      await expect(
        prisma.lotteryPackBinHistory.create({
          data: {
            pack_id: "00000000-0000-0000-0000-000000000000",
            bin_id: testBin1.bin_id,
            moved_by: testMover.user_id,
          },
        }),
      ).rejects.toThrow();
    });

    it("6.13-INTEGRATION-016: should enforce bin_id foreign key constraint", async () => {
      // GIVEN: An invalid bin_id
      // WHEN: Creating a history record with non-existent bin_id
      // THEN: Foreign key constraint error is raised
      await expect(
        prisma.lotteryPackBinHistory.create({
          data: {
            pack_id: testPack.pack_id,
            bin_id: "00000000-0000-0000-0000-000000000000",
            moved_by: testMover.user_id,
          },
        }),
      ).rejects.toThrow();
    });

    it("6.13-INTEGRATION-017: should enforce moved_by foreign key constraint", async () => {
      // GIVEN: An invalid moved_by user_id
      // WHEN: Creating a history record with non-existent moved_by
      // THEN: Foreign key constraint error is raised
      await expect(
        prisma.lotteryPackBinHistory.create({
          data: {
            pack_id: testPack.pack_id,
            bin_id: testBin1.bin_id,
            moved_by: "00000000-0000-0000-0000-000000000000",
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe("Cascade Delete", () => {
    it("6.13-INTEGRATION-018: should cascade delete history when pack is deleted", async () => {
      // GIVEN: A pack with history records exists
      const pack = await createLotteryPack(prisma, {
        game_id: testGame.game_id,
        store_id: testStore.store_id,
        pack_number: "CASCADE002",
        serial_start: "000000000000000000000001",
        serial_end: "000000000000000000000150",
      });

      const history = await prisma.lotteryPackBinHistory.create({
        data: {
          pack_id: pack.pack_id,
          bin_id: testBin1.bin_id,
          moved_by: testMover.user_id,
        },
      });

      // WHEN: Deleting the pack
      await prisma.lotteryPack.delete({
        where: { pack_id: pack.pack_id },
      });

      // THEN: History record is also deleted (cascade)
      const deletedHistory = await prisma.lotteryPackBinHistory.findUnique({
        where: { history_id: history.history_id },
      });
      expect(deletedHistory).toBeNull();
    });

    it("6.13-INTEGRATION-019: should cascade delete history when bin is deleted", async () => {
      // GIVEN: A bin with history records exists
      const bin = await createLotteryBin(prisma, {
        store_id: testStore.store_id,
        name: "CASCADE_BIN",
      });

      const history = await prisma.lotteryPackBinHistory.create({
        data: {
          pack_id: testPack.pack_id,
          bin_id: bin.bin_id,
          moved_by: testMover.user_id,
        },
      });

      // WHEN: Deleting the bin
      await prisma.lotteryBin.delete({
        where: { bin_id: bin.bin_id },
      });

      // THEN: History record is also deleted (cascade)
      const deletedHistory = await prisma.lotteryPackBinHistory.findUnique({
        where: { history_id: history.history_id },
      });
      expect(deletedHistory).toBeNull();
    });

    it("6.13-INTEGRATION-020: should cascade delete history when mover is deleted", async () => {
      // GIVEN: A mover with history records exists
      const mover = await prisma.user.create({
        data: {
          email: `test-mover-del-${Date.now()}@test.com`,
          name: "Test Mover Del",
          public_id: `MOVD${Date.now()}`,
        },
      });

      const history = await prisma.lotteryPackBinHistory.create({
        data: {
          pack_id: testPack.pack_id,
          bin_id: testBin1.bin_id,
          moved_by: mover.user_id,
        },
      });

      // WHEN: Deleting the mover
      await prisma.user.delete({
        where: { user_id: mover.user_id },
      });

      // THEN: History record is also deleted (cascade)
      const deletedHistory = await prisma.lotteryPackBinHistory.findUnique({
        where: { history_id: history.history_id },
      });
      expect(deletedHistory).toBeNull();
    });
  });

  describe("Audit Trail Completeness", () => {
    it("6.13-INTEGRATION-021: should track complete audit trail (who, when, why)", async () => {
      // GIVEN: A pack movement occurs
      const reason = "Pack moved to front display for better visibility";
      const beforeMove = new Date();

      const history = await prisma.lotteryPackBinHistory.create({
        data: {
          pack_id: testPack.pack_id,
          bin_id: testBin2.bin_id,
          moved_by: testMover.user_id,
          reason: reason,
        },
      });

      const afterMove = new Date();

      // THEN: Audit trail includes who (moved_by), when (moved_at), and why (reason)
      expect(history.moved_by).toBe(testMover.user_id);
      expect(history.moved_at.getTime()).toBeGreaterThanOrEqual(
        beforeMove.getTime(),
      );
      expect(history.moved_at.getTime()).toBeLessThanOrEqual(
        afterMove.getTime(),
      );
      expect(history.reason).toBe(reason);
    });

    it("6.13-INTEGRATION-022: should track multiple movements for same pack", async () => {
      // GIVEN: A pack is moved multiple times
      const history1 = await prisma.lotteryPackBinHistory.create({
        data: {
          pack_id: testPack.pack_id,
          bin_id: testBin1.bin_id,
          moved_by: testMover.user_id,
          reason: "Initial placement",
        },
      });

      // Wait a bit to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      const history2 = await prisma.lotteryPackBinHistory.create({
        data: {
          pack_id: testPack.pack_id,
          bin_id: testBin2.bin_id,
          moved_by: testMover.user_id,
          reason: "Moved to front display",
        },
      });

      // THEN: Both movements are tracked with different timestamps
      expect(history1.pack_id).toBe(testPack.pack_id);
      expect(history2.pack_id).toBe(testPack.pack_id);
      expect(history1.bin_id).toBe(testBin1.bin_id);
      expect(history2.bin_id).toBe(testBin2.bin_id);
      expect(history2.moved_at.getTime()).toBeGreaterThan(
        history1.moved_at.getTime(),
      );
    });
  });

  describe("Index Performance", () => {
    it("6.13-INTEGRATION-023: should efficiently query by pack_id", async () => {
      // GIVEN: Multiple history records for different packs
      const pack2 = await createLotteryPack(prisma, {
        game_id: testGame.game_id,
        store_id: testStore.store_id,
        pack_number: "PACK003",
        serial_start: "000000000000000000000001",
        serial_end: "000000000000000000000150",
      });

      await prisma.lotteryPackBinHistory.createMany({
        data: [
          {
            pack_id: testPack.pack_id,
            bin_id: testBin1.bin_id,
            moved_by: testMover.user_id,
          },
          {
            pack_id: testPack.pack_id,
            bin_id: testBin2.bin_id,
            moved_by: testMover.user_id,
          },
          {
            pack_id: pack2.pack_id,
            bin_id: testBin1.bin_id,
            moved_by: testMover.user_id,
          },
        ],
      });

      // WHEN: Querying history by pack_id
      const history = await prisma.lotteryPackBinHistory.findMany({
        where: { pack_id: testPack.pack_id },
        orderBy: { moved_at: "asc" },
      });

      // THEN: Only history for the specified pack is returned
      expect(history.length).toBe(2);
      expect(history.every((h) => h.pack_id === testPack.pack_id)).toBe(true);
    });

    it("6.13-INTEGRATION-024: should efficiently query by pack_id and moved_at", async () => {
      // GIVEN: History records with different moved_at dates
      const history1 = await prisma.lotteryPackBinHistory.create({
        data: {
          pack_id: testPack.pack_id,
          bin_id: testBin1.bin_id,
          moved_by: testMover.user_id,
        },
      });

      // Wait a bit to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      const history2 = await prisma.lotteryPackBinHistory.create({
        data: {
          pack_id: testPack.pack_id,
          bin_id: testBin2.bin_id,
          moved_by: testMover.user_id,
        },
      });

      // WHEN: Querying history by pack_id and moved_at range
      const history = await prisma.lotteryPackBinHistory.findMany({
        where: {
          pack_id: testPack.pack_id,
          moved_at: {
            gte: history1.moved_at,
          },
        },
        orderBy: { moved_at: "asc" },
      });

      // THEN: History records are returned in chronological order
      expect(history.length).toBe(2);
      expect(history[0].history_id).toBe(history1.history_id);
      expect(history[1].history_id).toBe(history2.history_id);
    });
  });

  describe("Service Method Integration", () => {
    it("6.13-INTEGRATION-025: should move pack between bins using service method", async () => {
      // GIVEN: Pack exists in bin1
      const pack = await createLotteryPack(prisma, {
        game_id: testGame.game_id,
        store_id: testStore.store_id,
        pack_number: "SERVICE_TEST",
        serial_start: "000000000000000000000001",
        serial_end: "000000000000000000000150",
        current_bin_id: testBin1.bin_id,
      });

      // WHEN: Moving pack to bin2 using service method
      const result = await movePackBetweenBins(
        pack.pack_id,
        testBin2.bin_id,
        testMover.user_id,
        "Service method test",
      );

      // THEN: Pack is moved successfully
      expect(result.pack_id).toBe(pack.pack_id);
      expect(result.current_bin_id).toBe(testBin2.bin_id);
      expect(result.history_id).toBeDefined();

      // AND: Pack's current_bin_id is updated in database
      const updatedPack = await prisma.lotteryPack.findUnique({
        where: { pack_id: pack.pack_id },
      });
      expect(updatedPack?.current_bin_id).toBe(testBin2.bin_id);

      // AND: History record is created
      const history = await prisma.lotteryPackBinHistory.findUnique({
        where: { history_id: result.history_id },
      });
      expect(history).toBeDefined();
      expect(history?.pack_id).toBe(pack.pack_id);
      expect(history?.bin_id).toBe(testBin2.bin_id);
      expect(history?.moved_by).toBe(testMover.user_id);
      expect(history?.reason).toBe("Service method test");
    });

    it("6.13-INTEGRATION-026: should create audit log entry on pack movement", async () => {
      // GIVEN: Pack exists in bin1
      const pack = await createLotteryPack(prisma, {
        game_id: testGame.game_id,
        store_id: testStore.store_id,
        pack_number: "AUDIT_TEST",
        serial_start: "000000000000000000000001",
        serial_end: "000000000000000000000150",
        current_bin_id: testBin1.bin_id,
      });

      // WHEN: Moving pack using service method
      await movePackBetweenBins(
        pack.pack_id,
        testBin2.bin_id,
        testMover.user_id,
        "Audit test",
      );

      // THEN: Audit log entry is created
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          record_id: pack.pack_id,
          action: "LOTTERY_PACK_MOVED",
        },
        orderBy: { created_at: "desc" },
      });

      expect(auditLog).toBeDefined();
      expect(auditLog?.user_id).toBe(testMover.user_id);
      expect(auditLog?.table_name).toBe("lottery_packs");
      expect(auditLog?.old_values).toHaveProperty(
        "current_bin_id",
        testBin1.bin_id,
      );
      expect(auditLog?.new_values).toHaveProperty(
        "current_bin_id",
        testBin2.bin_id,
      );
    });

    it("6.13-INTEGRATION-027: should maintain audit trail accuracy across multiple movements", async () => {
      // GIVEN: Pack exists
      const pack = await createLotteryPack(prisma, {
        game_id: testGame.game_id,
        store_id: testStore.store_id,
        pack_number: "MULTI_MOVE_TEST",
        serial_start: "000000000000000000000001",
        serial_end: "000000000000000000000150",
        current_bin_id: testBin1.bin_id,
      });

      // WHEN: Moving pack multiple times
      const move1 = await movePackBetweenBins(
        pack.pack_id,
        testBin2.bin_id,
        testMover.user_id,
        "First move",
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
      const move2 = await movePackBetweenBins(
        pack.pack_id,
        testBin1.bin_id,
        testMover.user_id,
        "Second move",
      );

      // THEN: All movements are tracked in history
      const history = await prisma.lotteryPackBinHistory.findMany({
        where: { pack_id: pack.pack_id },
        orderBy: { moved_at: "asc" },
      });

      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history[history.length - 2].bin_id).toBe(testBin2.bin_id);
      expect(history[history.length - 2].reason).toBe("First move");
      expect(history[history.length - 1].bin_id).toBe(testBin1.bin_id);
      expect(history[history.length - 1].reason).toBe("Second move");

      // AND: Current bin is correct
      const finalPack = await prisma.lotteryPack.findUnique({
        where: { pack_id: pack.pack_id },
      });
      expect(finalPack?.current_bin_id).toBe(testBin1.bin_id);
    });
  });
});
