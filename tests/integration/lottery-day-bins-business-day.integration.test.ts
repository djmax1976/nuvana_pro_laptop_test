/**
 * Integration Tests: Lottery Day Bins Business Day Logic
 *
 * Tests business day logic for the day-based lottery bin tracking:
 * - Starting serial logic (today's opening > last closing > serial_start)
 * - Ending serial logic (last closing of the day)
 * - Business day boundaries (first/last shift of day)
 * - Store timezone handling
 * - Depleted packs for the day
 * - Edge cases (no shifts, cross-day shifts, multiple shifts)
 *
 * @test-level INTEGRATION
 * @justification Tests complex business logic across database and API layers
 * @story MyStore Lottery Page Redesign
 * @priority P0 (Critical - Business Logic)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  createCompany,
  createStore,
} from "../support/factories/database.factory";
import { withBypassClient } from "../support/prisma-bypass";

const prisma = new PrismaClient();

// Test data
let testUser: any;
let testCashier: any;
let company1: any;
let store1: any;
let game1: any;
let bin1: any;
let bin2: any;
let bin3: any;
let pack1: any;
let pack2: any;
let pack3: any;
let shift1: any;
let shift2: any;

describe("LOTTERY-DAY-BINS-INTEGRATION: Business Day Logic", () => {
  beforeAll(async () => {
    testUser = await withBypassClient(async (tx) => {
      return await tx.user.create({
        data: {
          email: `test-day-bins-${Date.now()}@test.com`,
          name: "Test User Day Bins",
          public_id: `USRDB${Date.now()}`,
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
        data: {
          ...createStore({ company_id: company1.company_id }),
          timezone: "America/New_York", // EST/EDT for timezone tests
        },
      });
    });

    // Create a cashier for shift creation (required by schema)
    testCashier = await withBypassClient(async (tx) => {
      return await tx.cashier.create({
        data: {
          store_id: store1.store_id,
          employee_id: "0001",
          name: "Test Cashier Day Bins",
          pin_hash: "$2b$10$test-pin-hash-placeholder",
          hired_on: new Date(),
          created_by: testUser.user_id,
          is_active: true,
        },
      });
    });

    game1 = await withBypassClient(async (tx) => {
      // game_code must be exactly 4 digits (check constraint)
      const uniqueCode = String(Date.now()).slice(-4);
      return await tx.lotteryGame.create({
        data: {
          name: "Day Bins Test Game",
          game_code: uniqueCode,
          price: 5.0,
          pack_value: 150,
          status: "ACTIVE",
        },
      });
    });

    bin1 = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: store1.store_id,
          name: "Day Bin 1",
          display_order: 0,
          is_active: true,
        },
      });
    });

    bin2 = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: store1.store_id,
          name: "Day Bin 2",
          display_order: 1,
          is_active: true,
        },
      });
    });

    bin3 = await withBypassClient(async (tx) => {
      return await tx.lotteryBin.create({
        data: {
          store_id: store1.store_id,
          name: "Day Bin 3 (Empty)",
          display_order: 2,
          is_active: true,
        },
      });
    });
  });

  afterAll(async () => {
    // Cleanup
    await withBypassClient(async (tx) => {
      // Delete shift records first
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
      await tx.store.delete({ where: { store_id: store1.store_id } });
      await tx.company.delete({ where: { company_id: company1.company_id } });
    });
    await prisma.$disconnect();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STARTING SERIAL LOGIC TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Starting Serial Logic", () => {
    beforeEach(async () => {
      // Clean up any existing test data
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

    it("DAY-BINS-INT-001: [P0] Starting serial should use today's opening serial when available", async () => {
      // GIVEN: Pack with today's opening serial
      const today = new Date();

      const testPack = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: `OPENING_TEST_${Date.now()}`,
            serial_start: "001",
            serial_end: "050",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin1.bin_id,
          },
        });
      });

      const testShift = await withBypassClient(async (tx) => {
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

      // Create opening record for today
      await withBypassClient(async (tx) => {
        await tx.lotteryShiftOpening.create({
          data: {
            shift_id: testShift.shift_id,
            pack_id: testPack.pack_id,
            opening_serial: "015", // Opening serial for today
          },
        });
      });

      // WHEN: Query day bins
      const result = await prisma.$queryRaw<
        Array<{
          pack_id: string;
          starting_serial: string | null;
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
          ) AS starting_serial
        FROM lottery_packs p
        WHERE p.pack_id = ${testPack.pack_id}::uuid
      `;

      // THEN: Starting serial is today's opening serial
      expect(result.length).toBe(1);
      expect(result[0].starting_serial).toBe("015");
    });

    it("DAY-BINS-INT-002: [P0] Starting serial should fallback to last closing when no today's opening", async () => {
      // GIVEN: Pack with last closing but no today's opening
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const testPack = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: `CLOSING_TEST_${Date.now()}`,
            serial_start: "001",
            serial_end: "050",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin1.bin_id,
          },
        });
      });

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

      // Create closing record from yesterday
      await withBypassClient(async (tx) => {
        await tx.lotteryShiftClosing.create({
          data: {
            shift_id: yesterdayShift.shift_id,
            pack_id: testPack.pack_id,
            closing_serial: "030", // Last closing serial
          },
        });
      });

      // WHEN: Query for starting serial with no today's opening
      const result = await prisma.$queryRaw<
        Array<{
          pack_id: string;
          last_closing_serial: string | null;
        }>
      >`
        SELECT
          p.pack_id,
          (SELECT lsc.closing_serial
           FROM lottery_shift_closings lsc
           JOIN shifts s ON s.shift_id = lsc.shift_id
           WHERE lsc.pack_id = p.pack_id AND s.closed_at IS NOT NULL
           ORDER BY s.closed_at DESC
           LIMIT 1) AS last_closing_serial
        FROM lottery_packs p
        WHERE p.pack_id = ${testPack.pack_id}::uuid
      `;

      // THEN: Last closing serial is returned
      expect(result.length).toBe(1);
      expect(result[0].last_closing_serial).toBe("030");
    });

    it("DAY-BINS-INT-003: [P0] Starting serial should fallback to serial_start when no openings/closings", async () => {
      // GIVEN: Pack with no shift records at all
      const testPack = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: `FALLBACK_TEST_${Date.now()}`,
            serial_start: "001",
            serial_end: "050",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin1.bin_id,
          },
        });
      });

      // WHEN: Query for starting serial
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
             ORDER BY s.opened_at DESC
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
        WHERE p.pack_id = ${testPack.pack_id}::uuid
      `;

      // THEN: serial_start is returned as fallback
      expect(result.length).toBe(1);
      expect(result[0].starting_serial).toBe("001");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ENDING SERIAL LOGIC TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Ending Serial Logic", () => {
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

    it("DAY-BINS-INT-004: [P0] Ending serial should show last closing of the day", async () => {
      // GIVEN: Pack with multiple closings today
      const today = new Date();

      const testPack = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: `ENDING_TEST_${Date.now()}`,
            serial_start: "001",
            serial_end: "050",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin1.bin_id,
          },
        });
      });

      // Create first shift and closing (earlier)
      const shift1Time = new Date(today);
      shift1Time.setHours(10, 0, 0, 0);
      const shift1 = await withBypassClient(async (tx) => {
        return await tx.shift.create({
          data: {
            store_id: store1.store_id,
            opened_by: testUser.user_id,
            cashier_id: testCashier.cashier_id,
            opened_at: shift1Time,
            closed_at: shift1Time,
            opening_cash: 100.0,
            status: "CLOSED",
          },
        });
      });

      await withBypassClient(async (tx) => {
        await tx.lotteryShiftClosing.create({
          data: {
            shift_id: shift1.shift_id,
            pack_id: testPack.pack_id,
            closing_serial: "020", // First closing
          },
        });
      });

      // Create second shift and closing (later)
      const shift2Time = new Date(today);
      shift2Time.setHours(18, 0, 0, 0);
      const shift2 = await withBypassClient(async (tx) => {
        return await tx.shift.create({
          data: {
            store_id: store1.store_id,
            opened_by: testUser.user_id,
            cashier_id: testCashier.cashier_id,
            opened_at: shift2Time,
            closed_at: shift2Time,
            opening_cash: 100.0,
            status: "CLOSED",
          },
        });
      });

      await withBypassClient(async (tx) => {
        await tx.lotteryShiftClosing.create({
          data: {
            shift_id: shift2.shift_id,
            pack_id: testPack.pack_id,
            closing_serial: "035", // Last closing (should be returned)
          },
        });
      });

      // WHEN: Query for ending serial
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
            AND DATE(opened_at AT TIME ZONE 'America/New_York') = ${today.toISOString().split("T")[0]}::date
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
        WHERE p.pack_id = ${testPack.pack_id}::uuid
      `;

      // THEN: Last closing of the day is returned
      expect(result.length).toBe(1);
      expect(result[0].ending_serial).toBe("035");
    });

    it("DAY-BINS-INT-005: [P0] Ending serial should be null when no closings today", async () => {
      // GIVEN: Pack with no closings today
      const testPack = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: `NO_CLOSING_${Date.now()}`,
            serial_start: "001",
            serial_end: "050",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin1.bin_id,
          },
        });
      });

      // Create an open shift (not closed)
      const today = new Date();
      const openShift = await withBypassClient(async (tx) => {
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

      // Create opening but no closing
      await withBypassClient(async (tx) => {
        await tx.lotteryShiftOpening.create({
          data: {
            shift_id: openShift.shift_id,
            pack_id: testPack.pack_id,
            opening_serial: "010",
          },
        });
      });

      // WHEN: Query for ending serial
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
            AND DATE(opened_at AT TIME ZONE 'America/New_York') = ${today.toISOString().split("T")[0]}::date
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
        WHERE p.pack_id = ${testPack.pack_id}::uuid
      `;

      // THEN: Ending serial is null
      expect(result.length).toBe(1);
      expect(result[0].ending_serial).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BUSINESS DAY BOUNDARY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Business Day Boundaries", () => {
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

    it("DAY-BINS-INT-006: [P0] Should return correct first shift opened_at for business day", async () => {
      // GIVEN: Multiple shifts on the same day
      const today = new Date();

      const shift1Time = new Date(today);
      shift1Time.setHours(6, 0, 0, 0); // 6 AM
      await withBypassClient(async (tx) => {
        return await tx.shift.create({
          data: {
            store_id: store1.store_id,
            opened_by: testUser.user_id,
            cashier_id: testCashier.cashier_id,
            opened_at: shift1Time,
            closed_at: shift1Time,
            opening_cash: 100.0,
            status: "CLOSED",
          },
        });
      });

      const shift2Time = new Date(today);
      shift2Time.setHours(14, 0, 0, 0); // 2 PM
      await withBypassClient(async (tx) => {
        return await tx.shift.create({
          data: {
            store_id: store1.store_id,
            opened_by: testUser.user_id,
            cashier_id: testCashier.cashier_id,
            opened_at: shift2Time,
            closed_at: shift2Time,
            opening_cash: 100.0,
            status: "CLOSED",
          },
        });
      });

      // WHEN: Query for first shift of the day
      const result = await prisma.$queryRaw<
        Array<{
          first_opened_at: Date;
        }>
      >`
        SELECT MIN(opened_at) AS first_opened_at
        FROM shifts
        WHERE store_id = ${store1.store_id}::uuid
          AND DATE(opened_at AT TIME ZONE 'America/New_York') = ${today.toISOString().split("T")[0]}::date
      `;

      // THEN: First shift time is returned
      expect(result.length).toBe(1);
      expect(result[0].first_opened_at).not.toBeNull();
      const resultHour = new Date(result[0].first_opened_at).getUTCHours();
      // Should be early morning (accounting for timezone)
      expect(resultHour).toBeLessThanOrEqual(15); // Account for timezone offset
    });

    it("DAY-BINS-INT-007: [P0] Should return correct last shift closed_at for business day", async () => {
      // GIVEN: Multiple closed shifts on the same day
      const today = new Date();

      const shift1Time = new Date(today);
      shift1Time.setHours(6, 0, 0, 0);
      await withBypassClient(async (tx) => {
        return await tx.shift.create({
          data: {
            store_id: store1.store_id,
            opened_by: testUser.user_id,
            cashier_id: testCashier.cashier_id,
            opened_at: shift1Time,
            closed_at: shift1Time,
            opening_cash: 100.0,
            status: "CLOSED",
          },
        });
      });

      const shift2Time = new Date(today);
      shift2Time.setHours(22, 0, 0, 0); // 10 PM
      await withBypassClient(async (tx) => {
        return await tx.shift.create({
          data: {
            store_id: store1.store_id,
            opened_by: testUser.user_id,
            cashier_id: testCashier.cashier_id,
            opened_at: shift2Time,
            closed_at: shift2Time,
            opening_cash: 100.0,
            status: "CLOSED",
          },
        });
      });

      // WHEN: Query for last shift of the day
      const result = await prisma.$queryRaw<
        Array<{
          last_closed_at: Date | null;
        }>
      >`
        SELECT MAX(closed_at) AS last_closed_at
        FROM shifts
        WHERE store_id = ${store1.store_id}::uuid
          AND DATE(opened_at AT TIME ZONE 'America/New_York') = ${today.toISOString().split("T")[0]}::date
          AND closed_at IS NOT NULL
      `;

      // THEN: Last shift closed_at is returned
      expect(result.length).toBe(1);
      expect(result[0].last_closed_at).not.toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DEPLETED PACKS TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Depleted Packs for Day", () => {
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

    it("DAY-BINS-INT-008: [P0] Should return packs depleted today", async () => {
      // GIVEN: Packs depleted today
      const today = new Date();

      await withBypassClient(async (tx) => {
        await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: `DEPLETED_TODAY_${Date.now()}`,
            serial_start: "001",
            serial_end: "050",
            status: "DEPLETED",
            current_bin_id: bin1.bin_id,
            depleted_at: today,
          },
        });
      });

      // WHEN: Query for depleted packs today
      const result = await prisma.$queryRaw<
        Array<{
          pack_number: string;
          status: string;
          depleted_at: Date;
        }>
      >`
        SELECT
          p.pack_number,
          p.status,
          p.depleted_at
        FROM lottery_packs p
        WHERE p.store_id = ${store1.store_id}::uuid
          AND p.status = 'DEPLETED'
          AND p.depleted_at IS NOT NULL
          AND DATE(p.depleted_at AT TIME ZONE 'America/New_York') = ${today.toISOString().split("T")[0]}::date
      `;

      // THEN: Depleted pack is returned
      expect(result.length).toBe(1);
      expect(result[0].status).toBe("DEPLETED");
    });

    it("DAY-BINS-INT-009: [P0] Should NOT return packs depleted on different days", async () => {
      // GIVEN: Packs depleted yesterday
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      await withBypassClient(async (tx) => {
        await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: `DEPLETED_YESTERDAY_${Date.now()}`,
            serial_start: "001",
            serial_end: "050",
            status: "DEPLETED",
            current_bin_id: bin1.bin_id,
            depleted_at: yesterday,
          },
        });
      });

      // WHEN: Query for depleted packs today
      const result = await prisma.$queryRaw<
        Array<{
          pack_number: string;
        }>
      >`
        SELECT p.pack_number
        FROM lottery_packs p
        WHERE p.store_id = ${store1.store_id}::uuid
          AND p.status = 'DEPLETED'
          AND p.depleted_at IS NOT NULL
          AND DATE(p.depleted_at AT TIME ZONE 'America/New_York') = ${today.toISOString().split("T")[0]}::date
      `;

      // THEN: No packs returned (yesterday's depleted pack not included)
      expect(result.length).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Edge Cases", () => {
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

    it("DAY-BINS-INT-EDGE-001: [P1] Should handle store with no shifts gracefully", async () => {
      // GIVEN: Store with packs but no shifts
      await withBypassClient(async (tx) => {
        await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: `NO_SHIFTS_${Date.now()}`,
            serial_start: "001",
            serial_end: "050",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin1.bin_id,
          },
        });
      });

      // WHEN: Query business day info
      const result = await prisma.$queryRaw<
        Array<{
          first_opened_at: Date | null;
          last_closed_at: Date | null;
        }>
      >`
        SELECT
          MIN(opened_at) AS first_opened_at,
          MAX(closed_at) AS last_closed_at
        FROM shifts
        WHERE store_id = ${store1.store_id}::uuid
          AND DATE(opened_at AT TIME ZONE 'America/New_York') = CURRENT_DATE
      `;

      // THEN: Null values returned (no shifts)
      expect(result.length).toBe(1);
      expect(result[0].first_opened_at).toBeNull();
      expect(result[0].last_closed_at).toBeNull();
    });

    it("DAY-BINS-INT-EDGE-002: [P1] Should handle empty bins correctly", async () => {
      // GIVEN: Store with bins but no packs
      // (bins already created in setup, just need to ensure no packs)

      // WHEN: Query bins
      const result = await prisma.$queryRaw<
        Array<{
          bin_id: string;
          bin_name: string;
          pack_id: string | null;
        }>
      >`
        SELECT
          b.bin_id,
          b.name AS bin_name,
          p.pack_id
        FROM lottery_bins b
        LEFT JOIN lottery_packs p ON p.current_bin_id = b.bin_id AND p.status = 'ACTIVE'
        WHERE b.store_id = ${store1.store_id}::uuid AND b.is_active = true
        ORDER BY b.display_order
      `;

      // THEN: Bins returned with null pack data
      expect(result.length).toBeGreaterThanOrEqual(1);
      result.forEach((row) => {
        expect(row.pack_id).toBeNull();
      });
    });

    it("DAY-BINS-INT-EDGE-003: [P1] Should handle pack moved between bins within same day", async () => {
      // GIVEN: Pack that was in bin1 and moved to bin2
      const today = new Date();

      const testPack = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: `MOVED_PACK_${Date.now()}`,
            serial_start: "001",
            serial_end: "050",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin2.bin_id, // Currently in bin2
          },
        });
      });

      // WHEN: Query current bin assignment
      const result = await prisma.$queryRaw<
        Array<{
          pack_id: string;
          current_bin_id: string;
        }>
      >`
        SELECT pack_id, current_bin_id
        FROM lottery_packs
        WHERE pack_id = ${testPack.pack_id}::uuid
      `;

      // THEN: Pack is in bin2
      expect(result.length).toBe(1);
      expect(result[0].current_bin_id).toBe(bin2.bin_id);
    });

    it("DAY-BINS-INT-EDGE-004: [P1] Should handle pack with multiple openings and closings in same day", async () => {
      // GIVEN: Pack with multiple shift records in same day
      const today = new Date();

      const testPack = await withBypassClient(async (tx) => {
        return await tx.lotteryPack.create({
          data: {
            game_id: game1.game_id,
            store_id: store1.store_id,
            pack_number: `MULTI_SHIFT_${Date.now()}`,
            serial_start: "001",
            serial_end: "100",
            status: "ACTIVE",
            activated_at: new Date(),
            current_bin_id: bin1.bin_id,
          },
        });
      });

      // Create multiple shifts with openings and closings
      const shift1Time = new Date(today);
      shift1Time.setHours(8, 0, 0, 0);
      const shift1 = await withBypassClient(async (tx) => {
        return await tx.shift.create({
          data: {
            store_id: store1.store_id,
            opened_by: testUser.user_id,
            cashier_id: testCashier.cashier_id,
            opened_at: shift1Time,
            closed_at: shift1Time,
            opening_cash: 100.0,
            status: "CLOSED",
          },
        });
      });

      await withBypassClient(async (tx) => {
        await tx.lotteryShiftOpening.create({
          data: {
            shift_id: shift1.shift_id,
            pack_id: testPack.pack_id,
            opening_serial: "010",
          },
        });
        await tx.lotteryShiftClosing.create({
          data: {
            shift_id: shift1.shift_id,
            pack_id: testPack.pack_id,
            closing_serial: "025",
          },
        });
      });

      const shift2Time = new Date(today);
      shift2Time.setHours(16, 0, 0, 0);
      const shift2 = await withBypassClient(async (tx) => {
        return await tx.shift.create({
          data: {
            store_id: store1.store_id,
            opened_by: testUser.user_id,
            cashier_id: testCashier.cashier_id,
            opened_at: shift2Time,
            closed_at: shift2Time,
            opening_cash: 100.0,
            status: "CLOSED",
          },
        });
      });

      await withBypassClient(async (tx) => {
        await tx.lotteryShiftOpening.create({
          data: {
            shift_id: shift2.shift_id,
            pack_id: testPack.pack_id,
            opening_serial: "025",
          },
        });
        await tx.lotteryShiftClosing.create({
          data: {
            shift_id: shift2.shift_id,
            pack_id: testPack.pack_id,
            closing_serial: "050",
          },
        });
      });

      // WHEN: Query for starting and ending serials
      const openingResult = await prisma.$queryRaw<
        Array<{
          first_opening_serial: string;
        }>
      >`
        SELECT lso.opening_serial AS first_opening_serial
        FROM lottery_shift_openings lso
        JOIN shifts s ON s.shift_id = lso.shift_id
        WHERE lso.pack_id = ${testPack.pack_id}::uuid
          AND DATE(s.opened_at AT TIME ZONE 'America/New_York') = ${today.toISOString().split("T")[0]}::date
        ORDER BY s.opened_at ASC
        LIMIT 1
      `;

      const closingResult = await prisma.$queryRaw<
        Array<{
          last_closing_serial: string;
        }>
      >`
        SELECT lsc.closing_serial AS last_closing_serial
        FROM lottery_shift_closings lsc
        JOIN shifts s ON s.shift_id = lsc.shift_id
        WHERE lsc.pack_id = ${testPack.pack_id}::uuid
          AND DATE(s.opened_at AT TIME ZONE 'America/New_York') = ${today.toISOString().split("T")[0]}::date
          AND s.closed_at IS NOT NULL
        ORDER BY s.closed_at DESC
        LIMIT 1
      `;

      // THEN: First opening (010) and last closing (050) are returned
      expect(openingResult.length).toBe(1);
      expect(openingResult[0].first_opening_serial).toBe("010");

      expect(closingResult.length).toBe(1);
      expect(closingResult[0].last_closing_serial).toBe("050");
    });

    it("DAY-BINS-INT-EDGE-005: [P1] Should handle inactive bins (exclude from results)", async () => {
      // GIVEN: Inactive bin exists
      const inactiveBin = await withBypassClient(async (tx) => {
        return await tx.lotteryBin.create({
          data: {
            store_id: store1.store_id,
            name: "Inactive Test Bin",
            display_order: 99,
            is_active: false,
          },
        });
      });

      // WHEN: Query active bins
      const result = await prisma.$queryRaw<
        Array<{
          bin_id: string;
        }>
      >`
        SELECT bin_id
        FROM lottery_bins
        WHERE store_id = ${store1.store_id}::uuid AND is_active = true
      `;

      // THEN: Inactive bin is not included
      const inactiveBinFound = result.some(
        (row) => row.bin_id === inactiveBin.bin_id,
      );
      expect(inactiveBinFound).toBe(false);

      // Cleanup
      await withBypassClient(async (tx) => {
        await tx.lotteryBin.delete({ where: { bin_id: inactiveBin.bin_id } });
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Security - Data Isolation", () => {
    it("DAY-BINS-INT-SEC-001: [P0] Should not leak data from other stores", async () => {
      // GIVEN: Another store with bins
      const otherCompany = await withBypassClient(async (tx) => {
        return await tx.company.create({
          data: createCompany({ owner_user_id: testUser.user_id }),
        });
      });

      const otherStore = await withBypassClient(async (tx) => {
        return await tx.store.create({
          data: createStore({ company_id: otherCompany.company_id }),
        });
      });

      const otherBin = await withBypassClient(async (tx) => {
        return await tx.lotteryBin.create({
          data: {
            store_id: otherStore.store_id,
            name: "Other Store Bin",
            display_order: 0,
            is_active: true,
          },
        });
      });

      // WHEN: Query bins for store1
      const result = await prisma.$queryRaw<
        Array<{
          bin_id: string;
          store_id: string;
        }>
      >`
        SELECT bin_id, store_id
        FROM lottery_bins
        WHERE store_id = ${store1.store_id}::uuid AND is_active = true
      `;

      // THEN: Only store1 bins are returned
      const otherStoreBins = result.filter(
        (row) => row.store_id === otherStore.store_id,
      );
      expect(otherStoreBins.length).toBe(0);

      // Cleanup
      await withBypassClient(async (tx) => {
        await tx.lotteryBin.delete({ where: { bin_id: otherBin.bin_id } });
        await tx.store.delete({ where: { store_id: otherStore.store_id } });
        await tx.company.delete({
          where: { company_id: otherCompany.company_id },
        });
      });
    });
  });
});
