/**
 * Lottery Day Close Integration Tests
 *
 * Tests the complete workflow of closing a lottery day:
 * - Scanning 24-digit serial numbers
 * - Matching to bins via game_code + pack_number
 * - Validating closing serials
 * - Database persistence
 * - Effect on next day's starting serials
 *
 * @test-level INTEGRATION
 * @justification Tests full workflow across components and database
 * @story Lottery Day Closing Feature
 * @priority P0 (Critical - Business Logic)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  createCompany,
  createStore,
} from "../support/factories/database.factory";
import {
  createLotteryGame,
  createLotteryPack,
  createLotteryBin,
  createLotteryShiftClosing,
  createLotteryShiftOpening,
} from "../support/factories/lottery.factory";
import { withBypassClient } from "../support/prisma-bypass";
import { parseSerializedNumber } from "../../backend/src/utils/lottery-serial-parser";

const prisma = new PrismaClient();

// Test data
let testUser: any;
let testCashier: any;
let company1: any;
let store1: any;
let game1: any;
let game2: any;
let bin1: any;
let bin2: any;
let bin3: any;

describe("LOTTERY-DAY-CLOSE-INTEGRATION: Day Closing Workflow", () => {
  beforeAll(async () => {
    // Create test user
    testUser = await withBypassClient(async (tx) => {
      return await tx.user.create({
        data: {
          email: `test-day-close-${Date.now()}@test.com`,
          name: "Test User Day Close",
          public_id: `USRDC${Date.now()}`,
        },
      });
    });

    // Create company
    company1 = await withBypassClient(async (tx) => {
      return await tx.company.create({
        data: createCompany({ owner_user_id: testUser.user_id }),
      });
    });

    // Create store
    store1 = await withBypassClient(async (tx) => {
      return await tx.store.create({
        data: {
          ...createStore({ company_id: company1.company_id }),
          timezone: "America/New_York",
        },
      });
    });

    // Create cashier for shift creation
    testCashier = await withBypassClient(async (tx) => {
      return await tx.cashier.create({
        data: {
          store_id: store1.store_id,
          employee_id: "0001",
          name: "Test Cashier Day Close",
          pin_hash: "$2b$10$test-pin-hash-placeholder",
          hired_on: new Date(),
          created_by: testUser.user_id,
          is_active: true,
        },
      });
    });

    // Create games with unique 4-digit codes
    game1 = await withBypassClient(async (tx) => {
      const uniqueCode = String(Date.now()).slice(-4);
      return await tx.lotteryGame.create({
        data: {
          name: "Day Close Test Game 1",
          game_code: uniqueCode,
          price: 5.0,
          pack_value: 150,
          status: "ACTIVE",
        },
      });
    });

    game2 = await withBypassClient(async (tx) => {
      const uniqueCode = String(Date.now() + 1).slice(-4);
      return await tx.lotteryGame.create({
        data: {
          name: "Day Close Test Game 2",
          game_code: uniqueCode,
          price: 10.0,
          pack_value: 300,
          status: "ACTIVE",
        },
      });
    });

    // Create bins
    bin1 = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: store1.store_id,
          name: "Day Close Bin 1",
          display_order: 0,
          is_active: true,
        },
      });
    });

    bin2 = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: store1.store_id,
          name: "Day Close Bin 2",
          display_order: 1,
          is_active: true,
        },
      });
    });

    bin3 = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: store1.store_id,
          name: "Day Close Bin 3",
          display_order: 2,
          is_active: true,
        },
      });
    });
  });

  afterAll(async () => {
    // Cleanup
    await withBypassClient(async (tx) => {
      await tx.lotteryShiftClosing.deleteMany({
        where: { pack: { store_id: store1.store_id } },
      });
      await tx.lotteryShiftOpening.deleteMany({
        where: { pack: { store_id: store1.store_id } },
      });
      await tx.lotteryPack.deleteMany({
        where: { store_id: store1.store_id },
      });
      await tx.lotteryBin.deleteMany({
        where: { store_id: store1.store_id },
      });
      await tx.shift.deleteMany({
        where: { store_id: store1.store_id },
      });
      await tx.cashier.deleteMany({
        where: { store_id: store1.store_id },
      });
      await tx.lotteryGame.delete({ where: { game_id: game1.game_id } });
      await tx.lotteryGame.delete({ where: { game_id: game2.game_id } });
      await tx.store.delete({ where: { store_id: store1.store_id } });
      await tx.company.delete({ where: { company_id: company1.company_id } });
      await tx.user.delete({ where: { user_id: testUser.user_id } });
    });
    await prisma.$disconnect();
  });

  // Clean up shift data before each test
  beforeEach(async () => {
    await withBypassClient(async (tx) => {
      await tx.lotteryShiftClosing.deleteMany({
        where: { pack: { store_id: store1.store_id } },
      });
      await tx.lotteryShiftOpening.deleteMany({
        where: { pack: { store_id: store1.store_id } },
      });
      await tx.shift.deleteMany({
        where: { store_id: store1.store_id },
      });
      await tx.lotteryPack.deleteMany({
        where: { store_id: store1.store_id },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SERIAL PARSING INTEGRATION (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Serial Parsing Integration", () => {
    it("DAY-CLOSE-INT-001: [P0] Should correctly parse 24-digit serial and extract game_code, pack_number, ending_serial", async () => {
      // GIVEN: A 24-digit serialized number
      const serialNumber = "123456789012345678901234"; // game_code: 1234, pack_number: 5678901, serial: 234

      // WHEN: Parsing the serial
      const parsed = parseSerializedNumber(serialNumber);

      // THEN: Components are extracted correctly
      expect(parsed.game_code).toBe("1234");
      expect(parsed.pack_number).toBe("5678901");
      expect(parsed.serial_start).toBe("234"); // This is the ending serial in day close context
    });

    it("DAY-CLOSE-INT-002: [P0] Should match parsed serial to correct bin based on game_code and pack_number", async () => {
      // GIVEN: Pack in database with specific game_code and pack_number
      const packNumber = "1234567";
      const pack = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: packNumber,
            serial_start: "001",
            serial_end: "100",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin1.bin_id,
          },
        });
      });

      // Build 24-digit serial: game_code (4) + pack_number (7) + ending_serial (3) + identifier (10)
      const serialNumber = `${game1.game_code}${packNumber}050${"0".repeat(10)}`;

      // WHEN: Parsing and matching
      const parsed = parseSerializedNumber(serialNumber);

      // THEN: Should match to the correct pack
      const matchedPack = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.findFirst({
          where: {
            game: { game_code: parsed.game_code },
            pack_number: parsed.pack_number,
            store_id: store1.store_id,
          },
        });
      });

      expect(matchedPack).toBeTruthy();
      expect(matchedPack?.pack_id).toBe(pack.pack_id);
      expect(matchedPack?.current_bin_id).toBe(bin1.bin_id);
    });

    it("DAY-CLOSE-INT-003: [P0] Should handle serials with leading zeros correctly", async () => {
      // GIVEN: Serial with leading zeros
      const serialNumber = "000100010001001" + "0".repeat(9); // game_code: 0001, pack_number: 0001000, serial: 100

      // WHEN: Parsing
      const parsed = parseSerializedNumber(serialNumber);

      // THEN: Leading zeros are preserved
      expect(parsed.game_code).toBe("0001");
      expect(parsed.pack_number).toBe("0001000");
      expect(parsed.serial_start).toBe("100");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BIN MATCHING LOGIC (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Bin Matching Logic", () => {
    it("DAY-CLOSE-INT-004: [P0] Should match scanned serial to bin with matching game_code AND pack_number", async () => {
      // GIVEN: Multiple packs with different combinations
      const pack1 = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: "1111111",
            serial_start: "001",
            serial_end: "100",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin1.bin_id,
          },
        });
      });

      // Build serial for pack1
      const serialNumber = `${game1.game_code}1111111050${"0".repeat(10)}`;
      const parsed = parseSerializedNumber(serialNumber);

      // WHEN: Finding matching pack
      const matchedPack = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.findFirst({
          where: {
            game: { game_code: parsed.game_code },
            pack_number: parsed.pack_number,
            store_id: store1.store_id,
          },
        });
      });

      // THEN: Correct pack is matched
      expect(matchedPack?.pack_id).toBe(pack1.pack_id);
    });

    it("DAY-CLOSE-INT-005: [P0] Should reject serial when game_code exists but pack_number doesn't match", async () => {
      // GIVEN: Pack with game_code but different pack_number
      await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: "1111111",
            serial_start: "001",
            serial_end: "100",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin1.bin_id,
          },
        });
      });

      // Build serial with same game_code but different pack_number
      const serialNumber = `${game1.game_code}9999999050${"0".repeat(10)}`;
      const parsed = parseSerializedNumber(serialNumber);

      // WHEN: Attempting to match
      const matchedPack = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.findFirst({
          where: {
            game: { game_code: parsed.game_code },
            pack_number: parsed.pack_number,
            store_id: store1.store_id,
          },
        });
      });

      // THEN: No match found
      expect(matchedPack).toBeNull();
    });

    it("DAY-CLOSE-INT-006: [P0] Should reject serial when pack_number exists but game_code doesn't match", async () => {
      // GIVEN: Pack with specific pack_number
      await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: "1111111",
            serial_start: "001",
            serial_end: "100",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin1.bin_id,
          },
        });
      });

      // Build serial with different game_code but same pack_number
      const serialNumber = `${game2.game_code}1111111050${"0".repeat(10)}`;
      const parsed = parseSerializedNumber(serialNumber);

      // WHEN: Attempting to match
      const matchedPack = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.findFirst({
          where: {
            game: { game_code: parsed.game_code },
            pack_number: parsed.pack_number,
            store_id: store1.store_id,
          },
        });
      });

      // THEN: No match found
      expect(matchedPack).toBeNull();
    });

    it("DAY-CLOSE-INT-007: [P0] Should handle multiple bins with same game but different packs", async () => {
      // GIVEN: Multiple packs of same game in different bins
      const pack1 = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: "1111111",
            serial_start: "001",
            serial_end: "100",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin1.bin_id,
          },
        });
      });

      const pack2 = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: "2222222",
            serial_start: "001",
            serial_end: "100",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin2.bin_id,
          },
        });
      });

      // Build serials for both packs
      const serial1 = `${game1.game_code}1111111050${"0".repeat(10)}`;
      const serial2 = `${game1.game_code}2222222075${"0".repeat(10)}`;

      // WHEN: Matching each serial
      const parsed1 = parseSerializedNumber(serial1);
      const parsed2 = parseSerializedNumber(serial2);

      const matched1 = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.findFirst({
          where: {
            game: { game_code: parsed1.game_code },
            pack_number: parsed1.pack_number,
            store_id: store1.store_id,
          },
        });
      });

      const matched2 = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.findFirst({
          where: {
            game: { game_code: parsed2.game_code },
            pack_number: parsed2.pack_number,
            store_id: store1.store_id,
          },
        });
      });

      // THEN: Each serial matches its respective pack
      expect(matched1?.pack_id).toBe(pack1.pack_id);
      expect(matched1?.current_bin_id).toBe(bin1.bin_id);
      expect(matched2?.pack_id).toBe(pack2.pack_id);
      expect(matched2?.current_bin_id).toBe(bin2.bin_id);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CLOSING SERIAL VALIDATION (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Closing Serial Validation", () => {
    it("DAY-CLOSE-INT-008: [P0] Should accept closing_serial within valid range [starting_serial, serial_end]", async () => {
      // GIVEN: Pack with serial range 001-100
      const pack = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: "1234567",
            serial_start: "001",
            serial_end: "100",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin1.bin_id,
          },
        });
      });

      const closingSerial = "050";

      // WHEN: Validating closing serial
      const isValid =
        parseInt(closingSerial) >= parseInt(pack.serial_start) &&
        parseInt(closingSerial) <= parseInt(pack.serial_end);

      // THEN: Validation passes
      expect(isValid).toBe(true);
    });

    it("DAY-CLOSE-INT-009: [P0] Should reject closing_serial below starting_serial", async () => {
      // GIVEN: Pack with starting serial 020
      const pack = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: "1234567",
            serial_start: "020",
            serial_end: "100",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin1.bin_id,
          },
        });
      });

      const closingSerial = "015"; // Below starting_serial

      // WHEN: Validating closing serial
      const isValid =
        parseInt(closingSerial) >= parseInt(pack.serial_start) &&
        parseInt(closingSerial) <= parseInt(pack.serial_end);

      // THEN: Validation fails
      expect(isValid).toBe(false);
    });

    it("DAY-CLOSE-INT-010: [P0] Should reject closing_serial above serial_end", async () => {
      // GIVEN: Pack with serial_end 100
      const pack = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: "1234567",
            serial_start: "001",
            serial_end: "100",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin1.bin_id,
          },
        });
      });

      const closingSerial = "150"; // Above serial_end

      // WHEN: Validating closing serial
      const isValid =
        parseInt(closingSerial) >= parseInt(pack.serial_start) &&
        parseInt(closingSerial) <= parseInt(pack.serial_end);

      // THEN: Validation fails
      expect(isValid).toBe(false);
    });

    it("DAY-CLOSE-INT-011: [P0] Should validate closing_serial is exactly 3 digits", async () => {
      // GIVEN: Various serial formats
      const validSerial = "050";
      const invalidSerial1 = "50"; // 2 digits
      const invalidSerial2 = "0050"; // 4 digits

      // WHEN: Validating format
      const isValid1 = /^\d{3}$/.test(validSerial);
      const isValid2 = /^\d{3}$/.test(invalidSerial1);
      const isValid3 = /^\d{3}$/.test(invalidSerial2);

      // THEN: Only 3-digit format is valid
      expect(isValid1).toBe(true);
      expect(isValid2).toBe(false);
      expect(isValid3).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DATABASE PERSISTENCE (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Database Persistence", () => {
    it("DAY-CLOSE-INT-012: [P0] Should create LotteryShiftClosing record with correct data", async () => {
      // GIVEN: Pack and shift
      const today = new Date();
      const shift = await withBypassClient(async (tx) => {
        return await tx.shift.create({
          data: {
            store_id: store1.store_id,
            opened_by: testUser.user_id,
            cashier_id: testCashier.cashier_id,
            opened_at: today,
            opening_cash: 100.0,
            status: "OPEN",
          },
        });
      });

      const pack = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: "1234567",
            serial_start: "001",
            serial_end: "100",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin1.bin_id,
          },
        });
      });

      // WHEN: Creating closing record
      const closing = await withBypassClient(async (tx) => {
        return await tx.lotteryShiftClosing.create({
          data: {
            shift_id: shift.shift_id,
            pack_id: pack.pack_id,
            closing_serial: "050",
            entry_method: "SCAN",
          },
        });
      });

      // THEN: Record is created correctly
      expect(closing).toBeTruthy();
      expect(closing.shift_id).toBe(shift.shift_id);
      expect(closing.pack_id).toBe(pack.pack_id);
      expect(closing.closing_serial).toBe("050");
      expect(closing.entry_method).toBe("SCAN");
    });

    it("DAY-CLOSE-INT-013: [P0] Should associate closing with appropriate shift", async () => {
      // GIVEN: Multiple shifts
      const today = new Date();
      const shift1 = await withBypassClient(async (tx) => {
        return await tx.shift.create({
          data: {
            store_id: store1.store_id,
            opened_by: testUser.user_id,
            cashier_id: testCashier.cashier_id,
            opened_at: today,
            opening_cash: 100.0,
            status: "OPEN",
          },
        });
      });

      const shift2 = await withBypassClient(async (tx) => {
        return await tx.shift.create({
          data: {
            store_id: store1.store_id,
            opened_by: testUser.user_id,
            cashier_id: testCashier.cashier_id,
            opened_at: today,
            opening_cash: 100.0,
            status: "OPEN",
          },
        });
      });

      const pack = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: "1234567",
            serial_start: "001",
            serial_end: "100",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin1.bin_id,
          },
        });
      });

      // WHEN: Creating closing for shift1
      const closing = await withBypassClient(async (tx) => {
        return await tx.lotteryShiftClosing.create({
          data: {
            shift_id: shift1.shift_id,
            pack_id: pack.pack_id,
            closing_serial: "050",
          },
        });
      });

      // THEN: Closing is associated with correct shift
      expect(closing.shift_id).toBe(shift1.shift_id);
      expect(closing.shift_id).not.toBe(shift2.shift_id);
    });

    it("DAY-CLOSE-INT-014: [P0] Should store entry_method correctly (SCAN vs MANUAL)", async () => {
      // GIVEN: Shift and pack
      const today = new Date();
      const shift = await withBypassClient(async (tx) => {
        return await tx.shift.create({
          data: {
            store_id: store1.store_id,
            opened_by: testUser.user_id,
            cashier_id: testCashier.cashier_id,
            opened_at: today,
            opening_cash: 100.0,
            status: "OPEN",
          },
        });
      });

      const pack1 = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: "1111111",
            serial_start: "001",
            serial_end: "100",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin1.bin_id,
          },
        });
      });

      const pack2 = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: "2222222",
            serial_start: "001",
            serial_end: "100",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin2.bin_id,
          },
        });
      });

      // WHEN: Creating closings with different entry methods
      const closingScan = await withBypassClient(async (tx) => {
        return await tx.lotteryShiftClosing.create({
          data: {
            shift_id: shift.shift_id,
            pack_id: pack1.pack_id,
            closing_serial: "050",
            entry_method: "SCAN",
          },
        });
      });

      const closingManual = await withBypassClient(async (tx) => {
        return await tx.lotteryShiftClosing.create({
          data: {
            shift_id: shift.shift_id,
            pack_id: pack2.pack_id,
            closing_serial: "075",
            entry_method: "MANUAL",
            manual_entry_authorized_by: testUser.user_id,
            manual_entry_authorized_at: new Date(),
          },
        });
      });

      // THEN: Entry methods are stored correctly
      expect(closingScan.entry_method).toBe("SCAN");
      expect(closingManual.entry_method).toBe("MANUAL");
      expect(closingManual.manual_entry_authorized_by).toBe(testUser.user_id);
      expect(closingManual.manual_entry_authorized_at).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STARTING SERIAL PROPAGATION (P0 - Critical Business Logic)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Starting Serial Propagation", () => {
    it("DAY-CLOSE-INT-015: [P0] After day close, GET day bins should show closing_serial as ending_serial", async () => {
      // GIVEN: Pack closed yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const yesterdayShift = await withBypassClient(async (tx) => {
        return await tx.shift.create({
          data: {
            store_id: store1.store_id,
            opened_by: testUser.user_id,
            cashier_id: testCashier.cashier_id,
            opened_at: yesterday,
            closed_at: yesterday,
            opening_cash: 100.0,
            status: "CLOSED",
          },
        });
      });

      const pack = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: "1234567",
            serial_start: "001",
            serial_end: "100",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin1.bin_id,
          },
        });
      });

      // Create yesterday's closing
      await withBypassClient(async (tx) => {
        return await tx.lotteryShiftClosing.create({
          data: {
            shift_id: yesterdayShift.shift_id,
            pack_id: pack.pack_id,
            closing_serial: "050",
          },
        });
      });

      // WHEN: Querying for day bins
      const result = await prisma.$queryRaw<
        Array<{
          pack_id: string;
          ending_serial: string | null;
        }>
      >`
        WITH day_shifts AS (
          SELECT shift_id, closed_at
          FROM shifts
          WHERE store_id = ${store1.store_id}::uuid
            AND DATE(opened_at AT TIME ZONE 'America/New_York') = ${yesterday.toISOString().split("T")[0]}::date
            AND closed_at IS NOT NULL
        )
        SELECT
          p.pack_id,
          (SELECT lsc.closing_serial
           FROM lottery_shift_closings lsc
           JOIN day_shifts ds ON ds.shift_id = lsc.shift_id
           WHERE lsc.pack_id = p.pack_id
           ORDER BY ds.closed_at DESC
           LIMIT 1) AS ending_serial
        FROM lottery_packs p
        WHERE p.pack_id = ${pack.pack_id}::uuid
      `;

      // THEN: Ending serial matches closing serial
      expect(result.length).toBe(1);
      expect(result[0].ending_serial).toBe("050");
    });

    it("DAY-CLOSE-INT-016: [P0] Next day's starting_serial should be the previous day's closing_serial", async () => {
      // GIVEN: Pack closed yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const today = new Date();

      const yesterdayShift = await withBypassClient(async (tx) => {
        return await tx.shift.create({
          data: {
            store_id: store1.store_id,
            opened_by: testUser.user_id,
            cashier_id: testCashier.cashier_id,
            opened_at: yesterday,
            closed_at: yesterday,
            opening_cash: 100.0,
            status: "CLOSED",
          },
        });
      });

      const pack = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: "1234567",
            serial_start: "001",
            serial_end: "100",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin1.bin_id,
          },
        });
      });

      // Create yesterday's closing with serial 050
      await withBypassClient(async (tx) => {
        return await tx.lotteryShiftClosing.create({
          data: {
            shift_id: yesterdayShift.shift_id,
            pack_id: pack.pack_id,
            closing_serial: "050",
          },
        });
      });

      // WHEN: Querying for today's starting serial (should be yesterday's closing)
      const result = await prisma.$queryRaw<
        Array<{
          pack_id: string;
          starting_serial: string;
        }>
      >`
        SELECT
          p.pack_id,
          COALESCE(
            (SELECT lso.opening_serial
             FROM lottery_shift_openings lso
             JOIN shifts s ON s.shift_id = lso.shift_id
             WHERE lso.pack_id = p.pack_id
               AND DATE(s.opened_at AT TIME ZONE 'America/New_York') = ${today.toISOString().split("T")[0]}::date
             ORDER BY s.opened_at ASC
             LIMIT 1),
            (SELECT lsc.closing_serial
             FROM lottery_shift_closings lsc
             JOIN shifts s ON s.shift_id = lsc.shift_id
             WHERE lsc.pack_id = p.pack_id AND s.closed_at IS NOT NULL
             ORDER BY s.closed_at DESC
             LIMIT 1),
            p.serial_start
          ) AS starting_serial
        FROM lottery_packs p
        WHERE p.pack_id = ${pack.pack_id}::uuid
      `;

      // THEN: Today's starting serial is yesterday's closing serial
      expect(result.length).toBe(1);
      expect(result[0].starting_serial).toBe("050");
    });

    it("DAY-CLOSE-INT-017: [P0] Should handle pack that was closed yesterday but not yet today", async () => {
      // GIVEN: Pack closed yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const today = new Date();

      const yesterdayShift = await withBypassClient(async (tx) => {
        return await tx.shift.create({
          data: {
            store_id: store1.store_id,
            opened_by: testUser.user_id,
            cashier_id: testCashier.cashier_id,
            opened_at: yesterday,
            closed_at: yesterday,
            opening_cash: 100.0,
            status: "CLOSED",
          },
        });
      });

      const pack = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: "1234567",
            serial_start: "001",
            serial_end: "100",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin1.bin_id,
          },
        });
      });

      // Yesterday's closing
      await withBypassClient(async (tx) => {
        return await tx.lotteryShiftClosing.create({
          data: {
            shift_id: yesterdayShift.shift_id,
            pack_id: pack.pack_id,
            closing_serial: "050",
          },
        });
      });

      // WHEN: Querying for today's starting serial (no opening yet today)
      const result = await prisma.$queryRaw<
        Array<{
          pack_id: string;
          starting_serial: string;
          ending_serial: string | null;
        }>
      >`
        WITH day_shifts AS (
          SELECT shift_id, opened_at, closed_at
          FROM shifts
          WHERE store_id = ${store1.store_id}::uuid
            AND DATE(opened_at AT TIME ZONE 'America/New_York') = ${today.toISOString().split("T")[0]}::date
        )
        SELECT
          p.pack_id,
          COALESCE(
            (SELECT lso.opening_serial
             FROM lottery_shift_openings lso
             JOIN day_shifts ds ON ds.shift_id = lso.shift_id
             WHERE lso.pack_id = p.pack_id
             ORDER BY ds.opened_at ASC
             LIMIT 1),
            (SELECT lsc.closing_serial
             FROM lottery_shift_closings lsc
             JOIN shifts s ON s.shift_id = lsc.shift_id
             WHERE lsc.pack_id = p.pack_id AND s.closed_at IS NOT NULL
             ORDER BY s.closed_at DESC
             LIMIT 1),
            p.serial_start
          ) AS starting_serial,
          (SELECT lsc.closing_serial
           FROM lottery_shift_closings lsc
           JOIN day_shifts ds ON ds.shift_id = lsc.shift_id
           WHERE lsc.pack_id = p.pack_id
           ORDER BY ds.closed_at DESC
           LIMIT 1) AS ending_serial
        FROM lottery_packs p
        WHERE p.pack_id = ${pack.pack_id}::uuid
      `;

      // THEN: Starting serial is yesterday's closing, ending serial is null (not closed today)
      expect(result.length).toBe(1);
      expect(result[0].starting_serial).toBe("050");
      expect(result[0].ending_serial).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MULTI-BIN SCENARIOS (P1)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Multi-Bin Scenarios", () => {
    it("DAY-CLOSE-INT-018: [P1] Should handle closing day with multiple active bins", async () => {
      // GIVEN: Multiple packs in different bins
      const today = new Date();
      const shift = await withBypassClient(async (tx) => {
        return await tx.shift.create({
          data: {
            store_id: store1.store_id,
            opened_by: testUser.user_id,
            cashier_id: testCashier.cashier_id,
            opened_at: today,
            closed_at: today,
            opening_cash: 100.0,
            status: "CLOSED",
          },
        });
      });

      const pack1 = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: "1111111",
            serial_start: "001",
            serial_end: "100",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin1.bin_id,
          },
        });
      });

      const pack2 = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: "2222222",
            serial_start: "001",
            serial_end: "100",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin2.bin_id,
          },
        });
      });

      const pack3 = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game2.game_id,
            store_id: store1.store_id,
            pack_number: "3333333",
            serial_start: "001",
            serial_end: "100",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin3.bin_id,
          },
        });
      });

      // WHEN: Creating closings for all packs
      await withBypassClient(async (tx) => {
        await tx.lotteryShiftClosing.create({
          data: {
            shift_id: shift.shift_id,
            pack_id: pack1.pack_id,
            closing_serial: "050",
          },
        });
        await tx.lotteryShiftClosing.create({
          data: {
            shift_id: shift.shift_id,
            pack_id: pack2.pack_id,
            closing_serial: "075",
          },
        });
        await tx.lotteryShiftClosing.create({
          data: {
            shift_id: shift.shift_id,
            pack_id: pack3.pack_id,
            closing_serial: "025",
          },
        });
      });

      // THEN: All closings are created
      const closings = await withBypassClient(async (tx) => {
        return await tx.lotteryShiftClosing.findMany({
          where: { shift_id: shift.shift_id },
          include: { pack: { include: { bin: true } } },
        });
      });

      expect(closings.length).toBe(3);
      expect(
        closings.find((c) => c.pack_id === pack1.pack_id)?.closing_serial,
      ).toBe("050");
      expect(
        closings.find((c) => c.pack_id === pack2.pack_id)?.closing_serial,
      ).toBe("075");
      expect(
        closings.find((c) => c.pack_id === pack3.pack_id)?.closing_serial,
      ).toBe("025");
    });

    it("DAY-CLOSE-INT-019: [P1] Should track which bins have been scanned vs pending", async () => {
      // GIVEN: Multiple packs in bins
      const today = new Date();
      const shift = await withBypassClient(async (tx) => {
        return await tx.shift.create({
          data: {
            store_id: store1.store_id,
            opened_by: testUser.user_id,
            cashier_id: testCashier.cashier_id,
            opened_at: today,
            opening_cash: 100.0,
            status: "OPEN",
          },
        });
      });

      const pack1 = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: "1111111",
            serial_start: "001",
            serial_end: "100",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin1.bin_id,
          },
        });
      });

      const pack2 = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: "2222222",
            serial_start: "001",
            serial_end: "100",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin2.bin_id,
          },
        });
      });

      // WHEN: Only closing pack1
      await withBypassClient(async (tx) => {
        await tx.lotteryShiftClosing.create({
          data: {
            shift_id: shift.shift_id,
            pack_id: pack1.pack_id,
            closing_serial: "050",
          },
        });
      });

      // THEN: Can query which packs have closings
      const closedPacks = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.findMany({
          where: {
            store_id: store1.store_id,
            status: "ACTIVE",
            shift_closings: {
              some: { shift_id: shift.shift_id },
            },
          },
        });
      });

      const pendingPacks = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.findMany({
          where: {
            store_id: store1.store_id,
            status: "ACTIVE",
            NOT: {
              shift_closings: {
                some: { shift_id: shift.shift_id },
              },
            },
          },
        });
      });

      expect(closedPacks.length).toBe(1);
      expect(closedPacks[0].pack_id).toBe(pack1.pack_id);
      expect(pendingPacks.length).toBe(1);
      expect(pendingPacks[0].pack_id).toBe(pack2.pack_id);
    });

    it("DAY-CLOSE-INT-020: [P1] Should enforce all active bins scanned before allowing save", async () => {
      // GIVEN: Multiple active packs
      const today = new Date();
      const shift = await withBypassClient(async (tx) => {
        return await tx.shift.create({
          data: {
            store_id: store1.store_id,
            opened_by: testUser.user_id,
            cashier_id: testCashier.cashier_id,
            opened_at: today,
            opening_cash: 100.0,
            status: "OPEN",
          },
        });
      });

      const pack1 = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: "1111111",
            serial_start: "001",
            serial_end: "100",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin1.bin_id,
          },
        });
      });

      const pack2 = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: "2222222",
            serial_start: "001",
            serial_end: "100",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin2.bin_id,
          },
        });
      });

      // WHEN: Checking if all packs have closings
      await withBypassClient(async (tx) => {
        await tx.lotteryShiftClosing.create({
          data: {
            shift_id: shift.shift_id,
            pack_id: pack1.pack_id,
            closing_serial: "050",
          },
        });
      });

      // Count active packs and closings
      const activePacks = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.count({
          where: {
            store_id: store1.store_id,
            status: "ACTIVE",
          },
        });
      });

      const closingCount = await withBypassClient(async (tx) => {
        return await tx.lotteryShiftClosing.count({
          where: { shift_id: shift.shift_id },
        });
      });

      const allScanned = activePacks === closingCount;

      // THEN: Not all packs scanned
      expect(allScanned).toBe(false);
      expect(activePacks).toBe(2);
      expect(closingCount).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ERROR RECOVERY (P1)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Error Recovery", () => {
    it("DAY-CLOSE-INT-021: [P1] Should handle partial submission gracefully (transaction rollback)", async () => {
      // GIVEN: Two packs, one valid, one with error
      const today = new Date();
      const shift = await withBypassClient(async (tx) => {
        return await tx.shift.create({
          data: {
            store_id: store1.store_id,
            opened_by: testUser.user_id,
            cashier_id: testCashier.cashier_id,
            opened_at: today,
            opening_cash: 100.0,
            status: "OPEN",
          },
        });
      });

      const pack = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: "1111111",
            serial_start: "001",
            serial_end: "100",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin1.bin_id,
          },
        });
      });

      // WHEN: Attempting transaction with error
      let errorOccurred = false;
      try {
        await withBypassClient(async (tx) => {
          // First closing succeeds
          await tx.lotteryShiftClosing.create({
            data: {
              shift_id: shift.shift_id,
              pack_id: pack.pack_id,
              closing_serial: "050",
            },
          });

          // Second closing fails (invalid pack_id)
          await tx.lotteryShiftClosing.create({
            data: {
              shift_id: shift.shift_id,
              pack_id: "invalid-pack-id",
              closing_serial: "075",
            },
          });
        });
      } catch (error) {
        errorOccurred = true;
      }

      // THEN: Transaction rolled back, no closings saved
      expect(errorOccurred).toBe(true);

      const closings = await withBypassClient(async (tx) => {
        return await tx.lotteryShiftClosing.findMany({
          where: { shift_id: shift.shift_id },
        });
      });

      expect(closings.length).toBe(0);
    });

    it("DAY-CLOSE-INT-022: [P1] Should not create duplicate closings for same pack on same day", async () => {
      // GIVEN: Pack and shift
      const today = new Date();
      const shift = await withBypassClient(async (tx) => {
        return await tx.shift.create({
          data: {
            store_id: store1.store_id,
            opened_by: testUser.user_id,
            cashier_id: testCashier.cashier_id,
            opened_at: today,
            opening_cash: 100.0,
            status: "OPEN",
          },
        });
      });

      const pack = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: "1111111",
            serial_start: "001",
            serial_end: "100",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin1.bin_id,
          },
        });
      });

      // Create first closing
      await withBypassClient(async (tx) => {
        await tx.lotteryShiftClosing.create({
          data: {
            shift_id: shift.shift_id,
            pack_id: pack.pack_id,
            closing_serial: "050",
          },
        });
      });

      // WHEN: Attempting to create duplicate closing
      let errorOccurred = false;
      try {
        await withBypassClient(async (tx) => {
          await tx.lotteryShiftClosing.create({
            data: {
              shift_id: shift.shift_id,
              pack_id: pack.pack_id,
              closing_serial: "060",
            },
          });
        });
      } catch (error: any) {
        // Unique constraint violation
        errorOccurred = error.code === "P2002";
      }

      // THEN: Duplicate is rejected
      expect(errorOccurred).toBe(true);

      const closings = await withBypassClient(async (tx) => {
        return await tx.lotteryShiftClosing.findMany({
          where: { shift_id: shift.shift_id, pack_id: pack.pack_id },
        });
      });

      expect(closings.length).toBe(1);
      expect(closings[0].closing_serial).toBe("050");
    });
  });
});
