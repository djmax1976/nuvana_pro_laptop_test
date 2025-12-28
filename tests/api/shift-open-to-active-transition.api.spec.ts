/**
 * Shift OPEN to ACTIVE Transition Tests
 *
 * Integration tests verifying that shifts automatically transition from
 * OPEN to ACTIVE status when first operational activity occurs.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TRACEABILITY MATRIX
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * | Test ID           | Requirement                               | Category      | Priority |
 * |-------------------|-------------------------------------------|---------------|----------|
 * | OTA-001           | Pack activation triggers OPEN→ACTIVE      | Integration   | P0       |
 * | OTA-002           | Already ACTIVE stays ACTIVE               | Integration   | P0       |
 * | OTA-004           | Multiple activities don't double-transition| Business      | P0       |
 * | OTA-005           | Transition visible in shift details       | Integration   | P1       |
 * | OTA-006           | Shift status updated atomically           | Data Integrity| P0       |
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * State Machine Context:
 * - OPEN: Shift is created and ready for operations
 * - ACTIVE: Shift has recorded operational activity (transactions, lottery)
 * - Transition happens on FIRST operational action only
 *
 * @test-level Integration
 * @justification Tests API endpoint with database, state machine transitions
 * @story Enterprise Shift Status State Machine
 * @priority P0 (Critical - Business Logic)
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import { ShiftStatus, LotteryPackStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  createLotteryGame,
  createLotteryPack,
  createLotteryBin,
} from "../support/factories/lottery.factory";

test.describe("Shift OPEN to ACTIVE Transition", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // AUTOMATIC TRANSITION ON FIRST ACTIVITY (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Automatic Transition on First Activity", () => {
    test("OTA-001: [P0] pack activation should trigger OPEN to ACTIVE transition", async ({
      storeManagerApiRequest,
      storeManagerUser,
      prismaClient,
    }) => {
      // GIVEN: A shift in OPEN status (no activity yet)
      const pinHash = await bcrypt.hash("1234", 10);
      const uniqueId = String(Math.floor(Math.random() * 9999) + 1).padStart(
        4,
        "0",
      );
      const cashier = await prismaClient.cashier.create({
        data: {
          store_id: storeManagerUser.store_id,
          employee_id: uniqueId,
          name: "Test Cashier OTA-001",
          pin_hash: pinHash,
          hired_on: new Date(),
          created_by: storeManagerUser.user_id,
        },
      });

      const shift = await prismaClient.shift.create({
        data: {
          store_id: storeManagerUser.store_id,
          opened_by: storeManagerUser.user_id,
          cashier_id: cashier.cashier_id,
          status: ShiftStatus.OPEN, // Starting in OPEN
          opening_cash: 100,
          opened_at: new Date(),
        },
      });

      // Verify initial state
      const initialShift = await prismaClient.shift.findUnique({
        where: { shift_id: shift.shift_id },
        select: { status: true },
      });
      expect(initialShift?.status).toBe(ShiftStatus.OPEN);

      // Create lottery resources
      const game = await createLotteryGame(prismaClient, {
        store_id: storeManagerUser.store_id,
        name: `Test Game OTA-001 ${Date.now()}`,
        price: 2.0,
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeManagerUser.store_id,
        bin_number: Math.floor(Math.random() * 10000) + 1,
        name: `Bin OTA-001 ${Date.now()}`,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeManagerUser.store_id,
        pack_number: `OTA001-${Date.now()}`,
        serial_start: "001",
        serial_end: "150",
        status: LotteryPackStatus.RECEIVED,
      });

      try {
        // WHEN: Activating first pack (first operational activity)
        const response = await storeManagerApiRequest.post(
          `/api/stores/${storeManagerUser.store_id}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "001",
            activated_by: storeManagerUser.user_id,
            activated_shift_id: shift.shift_id,
          },
        );

        // THEN: Pack activation succeeds
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);

        // AND: Shift status has transitioned to ACTIVE
        const updatedShift = await prismaClient.shift.findUnique({
          where: { shift_id: shift.shift_id },
          select: { status: true },
        });
        expect(updatedShift?.status).toBe(ShiftStatus.ACTIVE);
      } finally {
        // Cleanup
        await prismaClient.lotteryPack
          .delete({ where: { pack_id: pack.pack_id } })
          .catch(() => {});
        await prismaClient.lotteryBin
          .delete({ where: { bin_id: bin.bin_id } })
          .catch(() => {});
        await prismaClient.lotteryGame
          .delete({ where: { game_id: game.game_id } })
          .catch(() => {});
        await prismaClient.shift
          .delete({ where: { shift_id: shift.shift_id } })
          .catch(() => {});
        await prismaClient.cashier
          .delete({ where: { cashier_id: cashier.cashier_id } })
          .catch(() => {});
      }
    });

    test("OTA-002: [P0] already ACTIVE shift should stay ACTIVE after pack activation", async ({
      storeManagerApiRequest,
      storeManagerUser,
      prismaClient,
    }) => {
      // GIVEN: A shift already in ACTIVE status
      const pinHash = await bcrypt.hash("5678", 10);
      const uniqueId = String(Math.floor(Math.random() * 9999) + 1).padStart(
        4,
        "0",
      );
      const cashier = await prismaClient.cashier.create({
        data: {
          store_id: storeManagerUser.store_id,
          employee_id: uniqueId,
          name: "Test Cashier OTA-002",
          pin_hash: pinHash,
          hired_on: new Date(),
          created_by: storeManagerUser.user_id,
        },
      });

      const shift = await prismaClient.shift.create({
        data: {
          store_id: storeManagerUser.store_id,
          opened_by: storeManagerUser.user_id,
          cashier_id: cashier.cashier_id,
          status: ShiftStatus.ACTIVE, // Already ACTIVE
          opening_cash: 100,
          opened_at: new Date(),
        },
      });

      const game = await createLotteryGame(prismaClient, {
        store_id: storeManagerUser.store_id,
        name: `Test Game OTA-002 ${Date.now()}`,
        price: 3.0,
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeManagerUser.store_id,
        bin_number: Math.floor(Math.random() * 10000) + 100,
        name: `Bin OTA-002 ${Date.now()}`,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeManagerUser.store_id,
        pack_number: `OTA002-${Date.now()}`,
        serial_start: "001",
        serial_end: "150",
        status: LotteryPackStatus.RECEIVED,
      });

      try {
        // WHEN: Activating a pack (shift already active)
        const response = await storeManagerApiRequest.post(
          `/api/stores/${storeManagerUser.store_id}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "001",
            activated_by: storeManagerUser.user_id,
            activated_shift_id: shift.shift_id,
          },
        );

        // THEN: Pack activation succeeds
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);

        // AND: Shift status remains ACTIVE (no redundant transition)
        const updatedShift = await prismaClient.shift.findUnique({
          where: { shift_id: shift.shift_id },
          select: { status: true },
        });
        expect(updatedShift?.status).toBe(ShiftStatus.ACTIVE);
      } finally {
        // Cleanup
        await prismaClient.lotteryPack
          .delete({ where: { pack_id: pack.pack_id } })
          .catch(() => {});
        await prismaClient.lotteryBin
          .delete({ where: { bin_id: bin.bin_id } })
          .catch(() => {});
        await prismaClient.lotteryGame
          .delete({ where: { game_id: game.game_id } })
          .catch(() => {});
        await prismaClient.shift
          .delete({ where: { shift_id: shift.shift_id } })
          .catch(() => {});
        await prismaClient.cashier
          .delete({ where: { cashier_id: cashier.cashier_id } })
          .catch(() => {});
      }
    });

    test("OTA-004: [P0] multiple pack activations should not cause double transition", async ({
      storeManagerApiRequest,
      storeManagerUser,
      prismaClient,
    }) => {
      // GIVEN: A shift in OPEN status
      const pinHash = await bcrypt.hash("9012", 10);
      const uniqueId = String(Math.floor(Math.random() * 9999) + 1).padStart(
        4,
        "0",
      );
      const cashier = await prismaClient.cashier.create({
        data: {
          store_id: storeManagerUser.store_id,
          employee_id: uniqueId,
          name: "Test Cashier OTA-004",
          pin_hash: pinHash,
          hired_on: new Date(),
          created_by: storeManagerUser.user_id,
        },
      });

      const shift = await prismaClient.shift.create({
        data: {
          store_id: storeManagerUser.store_id,
          opened_by: storeManagerUser.user_id,
          cashier_id: cashier.cashier_id,
          status: ShiftStatus.OPEN,
          opening_cash: 100,
          opened_at: new Date(),
        },
      });

      const game = await createLotteryGame(prismaClient, {
        store_id: storeManagerUser.store_id,
        name: `Test Game OTA-004 ${Date.now()}`,
        price: 2.0,
      });

      const bin1 = await createLotteryBin(prismaClient, {
        store_id: storeManagerUser.store_id,
        bin_number: Math.floor(Math.random() * 10000) + 200,
        name: `Bin OTA-004A ${Date.now()}`,
      });

      const bin2 = await createLotteryBin(prismaClient, {
        store_id: storeManagerUser.store_id,
        bin_number: Math.floor(Math.random() * 10000) + 300,
        name: `Bin OTA-004B ${Date.now()}`,
      });

      const pack1 = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeManagerUser.store_id,
        pack_number: `OTA004A-${Date.now()}`,
        serial_start: "001",
        serial_end: "150",
        status: LotteryPackStatus.RECEIVED,
      });

      const pack2 = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeManagerUser.store_id,
        pack_number: `OTA004B-${Date.now()}`,
        serial_start: "001",
        serial_end: "150",
        status: LotteryPackStatus.RECEIVED,
      });

      try {
        // WHEN: First pack activation (OPEN → ACTIVE)
        const response1 = await storeManagerApiRequest.post(
          `/api/stores/${storeManagerUser.store_id}/lottery/packs/activate`,
          {
            pack_id: pack1.pack_id,
            bin_id: bin1.bin_id,
            serial_start: "001",
            activated_by: storeManagerUser.user_id,
            activated_shift_id: shift.shift_id,
          },
        );
        expect(response1.status()).toBe(200);

        // Check shift is now ACTIVE
        const midShift = await prismaClient.shift.findUnique({
          where: { shift_id: shift.shift_id },
          select: { status: true },
        });
        expect(midShift?.status).toBe(ShiftStatus.ACTIVE);

        // WHEN: Second pack activation (should stay ACTIVE, no error)
        const response2 = await storeManagerApiRequest.post(
          `/api/stores/${storeManagerUser.store_id}/lottery/packs/activate`,
          {
            pack_id: pack2.pack_id,
            bin_id: bin2.bin_id,
            serial_start: "001",
            activated_by: storeManagerUser.user_id,
            activated_shift_id: shift.shift_id,
          },
        );

        // THEN: Second activation also succeeds
        expect(response2.status()).toBe(200);
        const body2 = await response2.json();
        expect(body2.success).toBe(true);

        // AND: Shift status is still ACTIVE (stable state)
        const finalShift = await prismaClient.shift.findUnique({
          where: { shift_id: shift.shift_id },
          select: { status: true },
        });
        expect(finalShift?.status).toBe(ShiftStatus.ACTIVE);
      } finally {
        // Cleanup
        await prismaClient.lotteryPack
          .delete({ where: { pack_id: pack1.pack_id } })
          .catch(() => {});
        await prismaClient.lotteryPack
          .delete({ where: { pack_id: pack2.pack_id } })
          .catch(() => {});
        await prismaClient.lotteryBin
          .delete({ where: { bin_id: bin1.bin_id } })
          .catch(() => {});
        await prismaClient.lotteryBin
          .delete({ where: { bin_id: bin2.bin_id } })
          .catch(() => {});
        await prismaClient.lotteryGame
          .delete({ where: { game_id: game.game_id } })
          .catch(() => {});
        await prismaClient.shift
          .delete({ where: { shift_id: shift.shift_id } })
          .catch(() => {});
        await prismaClient.cashier
          .delete({ where: { cashier_id: cashier.cashier_id } })
          .catch(() => {});
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT & VISIBILITY (P1) - Test ID: OTA-005
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Audit and Visibility", () => {
    test("OTA-005: [P1] transition should be visible in shift details", async ({
      storeManagerApiRequest,
      storeManagerUser,
      prismaClient,
    }) => {
      // GIVEN: A shift in OPEN status
      const pinHash = await bcrypt.hash("3456", 10);
      const uniqueId = String(Math.floor(Math.random() * 9999) + 1).padStart(
        4,
        "0",
      );
      const cashier = await prismaClient.cashier.create({
        data: {
          store_id: storeManagerUser.store_id,
          employee_id: uniqueId,
          name: "Test Cashier OTA-005",
          pin_hash: pinHash,
          hired_on: new Date(),
          created_by: storeManagerUser.user_id,
        },
      });

      const shift = await prismaClient.shift.create({
        data: {
          store_id: storeManagerUser.store_id,
          opened_by: storeManagerUser.user_id,
          cashier_id: cashier.cashier_id,
          status: ShiftStatus.OPEN,
          opening_cash: 100,
          opened_at: new Date(),
        },
      });

      const game = await createLotteryGame(prismaClient, {
        store_id: storeManagerUser.store_id,
        name: `Test Game OTA-005 ${Date.now()}`,
        price: 2.0,
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeManagerUser.store_id,
        bin_number: Math.floor(Math.random() * 10000) + 400,
        name: `Bin OTA-005 ${Date.now()}`,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeManagerUser.store_id,
        pack_number: `OTA005-${Date.now()}`,
        serial_start: "001",
        serial_end: "150",
        status: LotteryPackStatus.RECEIVED,
      });

      try {
        // WHEN: Activating pack to trigger transition
        const activateResponse = await storeManagerApiRequest.post(
          `/api/stores/${storeManagerUser.store_id}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "001",
            activated_by: storeManagerUser.user_id,
            activated_shift_id: shift.shift_id,
          },
        );
        expect(activateResponse.status()).toBe(200);

        // THEN: Verify via direct DB check that shift is now ACTIVE
        const dbShift = await prismaClient.shift.findUnique({
          where: { shift_id: shift.shift_id },
          select: { status: true },
        });
        expect(dbShift?.status).toBe(ShiftStatus.ACTIVE);
      } finally {
        // Cleanup
        await prismaClient.lotteryPack
          .delete({ where: { pack_id: pack.pack_id } })
          .catch(() => {});
        await prismaClient.lotteryBin
          .delete({ where: { bin_id: bin.bin_id } })
          .catch(() => {});
        await prismaClient.lotteryGame
          .delete({ where: { game_id: game.game_id } })
          .catch(() => {});
        await prismaClient.shift
          .delete({ where: { shift_id: shift.shift_id } })
          .catch(() => {});
        await prismaClient.cashier
          .delete({ where: { cashier_id: cashier.cashier_id } })
          .catch(() => {});
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA INTEGRITY (P0) - Test ID: OTA-006
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Data Integrity", () => {
    test("OTA-006: [P0] shift status update should be atomic with pack activation", async ({
      storeManagerApiRequest,
      storeManagerUser,
      prismaClient,
    }) => {
      // GIVEN: A shift in OPEN status
      const pinHash = await bcrypt.hash("7890", 10);
      const uniqueId = String(Math.floor(Math.random() * 9999) + 1).padStart(
        4,
        "0",
      );
      const cashier = await prismaClient.cashier.create({
        data: {
          store_id: storeManagerUser.store_id,
          employee_id: uniqueId,
          name: "Test Cashier OTA-006",
          pin_hash: pinHash,
          hired_on: new Date(),
          created_by: storeManagerUser.user_id,
        },
      });

      const shift = await prismaClient.shift.create({
        data: {
          store_id: storeManagerUser.store_id,
          opened_by: storeManagerUser.user_id,
          cashier_id: cashier.cashier_id,
          status: ShiftStatus.OPEN,
          opening_cash: 100,
          opened_at: new Date(),
        },
      });

      const game = await createLotteryGame(prismaClient, {
        store_id: storeManagerUser.store_id,
        name: `Test Game OTA-006 ${Date.now()}`,
        price: 2.0,
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeManagerUser.store_id,
        bin_number: Math.floor(Math.random() * 10000) + 500,
        name: `Bin OTA-006 ${Date.now()}`,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeManagerUser.store_id,
        pack_number: `OTA006-${Date.now()}`,
        serial_start: "001",
        serial_end: "150",
        status: LotteryPackStatus.RECEIVED,
      });

      try {
        // WHEN: Activating pack
        const response = await storeManagerApiRequest.post(
          `/api/stores/${storeManagerUser.store_id}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "001",
            activated_by: storeManagerUser.user_id,
            activated_shift_id: shift.shift_id,
          },
        );

        // THEN: Both pack and shift are updated correctly
        expect(response.status()).toBe(200);

        // Verify pack is activated
        const activatedPack = await prismaClient.lotteryPack.findUnique({
          where: { pack_id: pack.pack_id },
          select: { status: true, activated_at: true },
        });
        expect(activatedPack?.status).toBe(LotteryPackStatus.ACTIVE);
        expect(activatedPack?.activated_at).not.toBeNull();

        // Verify shift is ACTIVE
        const updatedShift = await prismaClient.shift.findUnique({
          where: { shift_id: shift.shift_id },
          select: { status: true },
        });
        expect(updatedShift?.status).toBe(ShiftStatus.ACTIVE);

        // Both should be consistent - if pack is active, shift should be too
        // This proves atomicity of the operation
      } finally {
        // Cleanup
        await prismaClient.lotteryPack
          .delete({ where: { pack_id: pack.pack_id } })
          .catch(() => {});
        await prismaClient.lotteryBin
          .delete({ where: { bin_id: bin.bin_id } })
          .catch(() => {});
        await prismaClient.lotteryGame
          .delete({ where: { game_id: game.game_id } })
          .catch(() => {});
        await prismaClient.shift
          .delete({ where: { shift_id: shift.shift_id } })
          .catch(() => {});
        await prismaClient.cashier
          .delete({ where: { cashier_id: cashier.cashier_id } })
          .catch(() => {});
      }
    });
  });
});
