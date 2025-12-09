/**
 * Integration Tests: Lottery Ticket Serial Tracking
 *
 * Tests database operations for LotteryTicketSerial model:
 * - Table creation via migration
 * - Model creation with all required fields
 * - Foreign key constraints (pack_id, shift_id, cashier_id)
 * - Unique constraint on serial_number
 * - Index performance for queries
 * - Cascade delete behavior
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

const prisma = new PrismaClient();

// Test data - isolated per test suite
let testUser: any;
let testCompany: any;
let testStore: any;
let testGame: any;
let testPack: any;
let testBin: any;
let testShift: any;
let testCashier: any;

// ═══════════════════════════════════════════════════════════════════════════
// TEST SETUP & TEARDOWN
// ═══════════════════════════════════════════════════════════════════════════

beforeAll(async () => {
  // GIVEN: Test infrastructure exists (company, store, game, pack, bin, shift, cashier)
  testUser = await prisma.user.create({
    data: {
      email: `test-serial-${Date.now()}@test.com`,
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

  testBin = await createLotteryBin(prisma, {
    store_id: testStore.store_id,
    name: "Test Bin",
  });

  testPack = await createLotteryPack(prisma, {
    game_id: testGame.game_id,
    store_id: testStore.store_id,
    pack_number: "PACK001",
    serial_start: "000000000000000000000001",
    serial_end: "000000000000000000000150",
    current_bin_id: testBin.bin_id,
  });

  // Create a cashier for testing
  testCashier = await prisma.user.create({
    data: {
      email: `test-cashier-${Date.now()}@test.com`,
      name: "Test Cashier",
      public_id: `CSH${Date.now()}`,
    },
  });

  // Create a shift for testing
  testShift = await prisma.shift.create({
    data: {
      store_id: testStore.store_id,
      opened_by: testUser.user_id,
      cashier_id: testCashier.user_id,
      status: "OPEN",
    },
  });
});

beforeEach(async () => {
  // Ensure test isolation - clean up serial data before each test
  await prisma.lotteryTicketSerial.deleteMany({});
});

afterAll(async () => {
  // Cleanup all test data
  await prisma.lotteryTicketSerial.deleteMany({});
  await prisma.lotteryPack.deleteMany({});
  await prisma.lotteryBin.deleteMany({});
  await prisma.lotteryGame.deleteMany({});
  if (testShift)
    await prisma.shift.delete({ where: { shift_id: testShift.shift_id } });
  if (testCashier)
    await prisma.user.delete({ where: { user_id: testCashier.user_id } });
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
// LOTTERY TICKET SERIAL MODEL TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("6.13-INTEGRATION: Lottery Ticket Serial Tracking", () => {
  describe("Model Creation", () => {
    it("6.13-INTEGRATION-001: should create serial with all required fields", async () => {
      // GIVEN: A pack exists
      // WHEN: Creating a ticket serial with required fields
      const serial = await prisma.lotteryTicketSerial.create({
        data: {
          pack_id: testPack.pack_id,
          serial_number: "000000000000000000000001",
        },
      });

      // THEN: Serial is created with all fields
      expect(serial.serial_id).toBeDefined();
      expect(serial.pack_id).toBe(testPack.pack_id);
      expect(serial.serial_number).toBe("000000000000000000000001");
      expect(serial.created_at).toBeDefined();
      expect(serial.updated_at).toBeDefined();
    });

    it("6.13-INTEGRATION-002: should create serial with optional fields", async () => {
      // GIVEN: A pack, shift, and cashier exist
      // WHEN: Creating a ticket serial with all fields
      const soldAt = new Date();
      const serial = await prisma.lotteryTicketSerial.create({
        data: {
          pack_id: testPack.pack_id,
          serial_number: "000000000000000000000002",
          sold_at: soldAt,
          shift_id: testShift.shift_id,
          cashier_id: testCashier.user_id,
          transaction_id: "123e4567-e89b-12d3-a456-426614174000",
        },
      });

      // THEN: Serial is created with all fields populated
      expect(serial.serial_id).toBeDefined();
      expect(serial.pack_id).toBe(testPack.pack_id);
      expect(serial.serial_number).toBe("000000000000000000000002");
      expect(serial.sold_at).toBeDefined();
      expect(serial.shift_id).toBe(testShift.shift_id);
      expect(serial.cashier_id).toBe(testCashier.user_id);
      expect(serial.transaction_id).toBe(
        "123e4567-e89b-12d3-a456-426614174000",
      );
    });
  });

  describe("Foreign Key Constraints", () => {
    it("6.13-INTEGRATION-003: should enforce pack_id foreign key constraint", async () => {
      // GIVEN: An invalid pack_id
      // WHEN: Creating a serial with non-existent pack_id
      // THEN: Foreign key constraint error is raised
      await expect(
        prisma.lotteryTicketSerial.create({
          data: {
            pack_id: "00000000-0000-0000-0000-000000000000",
            serial_number: "INVALID001",
          },
        }),
      ).rejects.toThrow();
    });

    it("6.13-INTEGRATION-004: should enforce shift_id foreign key constraint", async () => {
      // GIVEN: An invalid shift_id
      // WHEN: Creating a serial with non-existent shift_id
      // THEN: Foreign key constraint error is raised
      await expect(
        prisma.lotteryTicketSerial.create({
          data: {
            pack_id: testPack.pack_id,
            serial_number: "INVALID002",
            shift_id: "00000000-0000-0000-0000-000000000000",
          },
        }),
      ).rejects.toThrow();
    });

    it("6.13-INTEGRATION-005: should enforce cashier_id foreign key constraint", async () => {
      // GIVEN: An invalid cashier_id
      // WHEN: Creating a serial with non-existent cashier_id
      // THEN: Foreign key constraint error is raised
      await expect(
        prisma.lotteryTicketSerial.create({
          data: {
            pack_id: testPack.pack_id,
            serial_number: "INVALID003",
            cashier_id: "00000000-0000-0000-0000-000000000000",
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe("Unique Constraint", () => {
    it("6.13-INTEGRATION-006: should enforce unique constraint on serial_number", async () => {
      // GIVEN: A serial with serial_number "UNIQUE001" exists
      await prisma.lotteryTicketSerial.create({
        data: {
          pack_id: testPack.pack_id,
          serial_number: "UNIQUE001",
        },
      });

      // WHEN: Creating another serial with the same serial_number
      // THEN: Unique constraint error is raised
      await expect(
        prisma.lotteryTicketSerial.create({
          data: {
            pack_id: testPack.pack_id,
            serial_number: "UNIQUE001",
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe("Cascade Delete", () => {
    it("6.13-INTEGRATION-007: should cascade delete serials when pack is deleted", async () => {
      // GIVEN: A pack with serials exists
      const pack = await createLotteryPack(prisma, {
        game_id: testGame.game_id,
        store_id: testStore.store_id,
        pack_number: "CASCADE001",
        serial_start: "000000000000000000000001",
        serial_end: "000000000000000000000150",
      });

      await prisma.lotteryTicketSerial.create({
        data: {
          pack_id: pack.pack_id,
          serial_number: "CASCADE001",
        },
      });

      // WHEN: Deleting the pack
      await prisma.lotteryPack.delete({
        where: { pack_id: pack.pack_id },
      });

      // THEN: Serial is also deleted (cascade)
      const serial = await prisma.lotteryTicketSerial.findUnique({
        where: { serial_number: "CASCADE001" },
      });
      expect(serial).toBeNull();
    });

    it("6.13-INTEGRATION-008: should set shift_id to NULL when shift is deleted", async () => {
      // GIVEN: A serial with shift_id exists
      const shift = await prisma.shift.create({
        data: {
          store_id: testStore.store_id,
          opened_by: testUser.user_id,
          cashier_id: testCashier.user_id,
          status: "OPEN",
        },
      });

      const serial = await prisma.lotteryTicketSerial.create({
        data: {
          pack_id: testPack.pack_id,
          serial_number: "SHIFT001",
          shift_id: shift.shift_id,
        },
      });

      // WHEN: Deleting the shift
      await prisma.shift.delete({
        where: { shift_id: shift.shift_id },
      });

      // THEN: Serial still exists but shift_id is NULL
      const updatedSerial = await prisma.lotteryTicketSerial.findUnique({
        where: { serial_id: serial.serial_id },
      });
      expect(updatedSerial).toBeDefined();
      expect(updatedSerial?.shift_id).toBeNull();
    });

    it("6.13-INTEGRATION-009: should set cashier_id to NULL when cashier is deleted", async () => {
      // GIVEN: A serial with cashier_id exists
      const cashier = await prisma.user.create({
        data: {
          email: `test-cashier-del-${Date.now()}@test.com`,
          name: "Test Cashier Del",
          public_id: `CSHD${Date.now()}`,
        },
      });

      const serial = await prisma.lotteryTicketSerial.create({
        data: {
          pack_id: testPack.pack_id,
          serial_number: "CASHIER001",
          cashier_id: cashier.user_id,
        },
      });

      // WHEN: Deleting the cashier
      await prisma.user.delete({
        where: { user_id: cashier.user_id },
      });

      // THEN: Serial still exists but cashier_id is NULL
      const updatedSerial = await prisma.lotteryTicketSerial.findUnique({
        where: { serial_id: serial.serial_id },
      });
      expect(updatedSerial).toBeDefined();
      expect(updatedSerial?.cashier_id).toBeNull();
    });
  });

  describe("Index Performance", () => {
    it("6.13-INTEGRATION-010: should efficiently query by pack_id", async () => {
      // GIVEN: Multiple serials for different packs
      const pack2 = await createLotteryPack(prisma, {
        game_id: testGame.game_id,
        store_id: testStore.store_id,
        pack_number: "PACK002",
        serial_start: "000000000000000000000001",
        serial_end: "000000000000000000000150",
      });

      await prisma.lotteryTicketSerial.createMany({
        data: [
          { pack_id: testPack.pack_id, serial_number: "PACK1-001" },
          { pack_id: testPack.pack_id, serial_number: "PACK1-002" },
          { pack_id: pack2.pack_id, serial_number: "PACK2-001" },
        ],
      });

      // WHEN: Querying serials by pack_id
      const serials = await prisma.lotteryTicketSerial.findMany({
        where: { pack_id: testPack.pack_id },
      });

      // THEN: Only serials for the specified pack are returned
      expect(serials.length).toBe(2);
      expect(serials.every((s) => s.pack_id === testPack.pack_id)).toBe(true);
    });

    it("6.13-INTEGRATION-011: should efficiently query by pack_id and sold_at", async () => {
      // GIVEN: Serials with different sold_at dates
      const soldAt1 = new Date("2025-01-01");
      const soldAt2 = new Date("2025-01-02");

      await prisma.lotteryTicketSerial.createMany({
        data: [
          {
            pack_id: testPack.pack_id,
            serial_number: "SOLD1-001",
            sold_at: soldAt1,
          },
          {
            pack_id: testPack.pack_id,
            serial_number: "SOLD1-002",
            sold_at: soldAt2,
          },
          {
            pack_id: testPack.pack_id,
            serial_number: "SOLD1-003",
            sold_at: null,
          },
        ],
      });

      // WHEN: Querying serials by pack_id and sold_at
      const serials = await prisma.lotteryTicketSerial.findMany({
        where: {
          pack_id: testPack.pack_id,
          sold_at: { not: null },
        },
        orderBy: { sold_at: "asc" },
      });

      // THEN: Only sold serials are returned, ordered by sold_at
      expect(serials.length).toBe(2);
      expect(serials[0].sold_at).toEqual(soldAt1);
      expect(serials[1].sold_at).toEqual(soldAt2);
    });
  });
});
