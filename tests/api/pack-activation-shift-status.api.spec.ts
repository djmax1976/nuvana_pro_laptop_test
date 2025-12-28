/**
 * Pack Activation - Shift Status Enforcement Tests
 *
 * Integration tests verifying that pack activation correctly enforces
 * shift status requirements aligned with the ShiftStateMachine.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TRACEABILITY MATRIX
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * | Test ID           | Requirement                              | Category      | Priority |
 * |-------------------|------------------------------------------|---------------|----------|
 * | PKA-S-001         | Accept OPEN shift for pack activation    | Integration   | P0       |
 * | PKA-S-002         | Accept ACTIVE shift for pack activation  | Integration   | P0       |
 * | PKA-S-003         | Reject CLOSING shift for activation      | Integration   | P0       |
 * | PKA-S-004         | Reject RECONCILING shift                 | Integration   | P0       |
 * | PKA-S-005         | Reject VARIANCE_REVIEW shift             | Integration   | P0       |
 * | PKA-S-006         | Reject CLOSED shift for activation       | Security      | P0       |
 * | PKA-S-007         | Descriptive error for CLOSING status     | UX            | P1       |
 * | PKA-S-008         | Descriptive error for VARIANCE_REVIEW    | UX            | P1       |
 * | PKA-S-009         | Shift not found returns error            | Validation    | P0       |
 * | PKA-S-010         | Shift from wrong store rejected          | Security      | P0       |
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * @test-level Integration
 * @justification Tests API endpoint with database, authentication, state machine
 * @story Enterprise Shift Status State Machine
 * @priority P0 (Critical - Business Logic & Security)
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import { ShiftStatus, LotteryPackStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  createLotteryGame,
  createLotteryPack,
  createLotteryBin,
} from "../support/factories/lottery.factory";
import { createCompany, createStore } from "../support/helpers";

test.describe("Pack Activation - Shift Status Enforcement", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // WORKING STATUS ACCEPTANCE (P0) - Test IDs: PKA-S-001, PKA-S-002
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Working Status Acceptance", () => {
    test("PKA-S-001: [P0] should allow pack activation when shift is in OPEN status", async ({
      storeManagerApiRequest,
      storeManagerUser,
      prismaClient,
    }) => {
      // GIVEN: Store manager with a shift in OPEN status
      const pinHash = await bcrypt.hash("1234", 10);
      // Generate unique 4-digit employee ID (max 4 chars per schema)
      const uniqueId = String(Math.floor(Math.random() * 9999) + 1).padStart(
        4,
        "0",
      );
      const cashier = await prismaClient.cashier.create({
        data: {
          store_id: storeManagerUser.store_id,
          employee_id: uniqueId,
          name: "Test Cashier PKA-001",
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

      // Create lottery game, bin, and pack
      const game = await createLotteryGame(prismaClient, {
        store_id: storeManagerUser.store_id,
        name: `Test Game PKA-001 ${Date.now()}`,
        price: 2.0,
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeManagerUser.store_id,
        bin_number: Math.floor(Math.random() * 10000) + 1,
        name: `Bin PKA-001 ${Date.now()}`,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeManagerUser.store_id,
        pack_number: `PKA001-${Date.now()}`,
        serial_start: "001",
        serial_end: "150",
        status: LotteryPackStatus.RECEIVED,
      });

      try {
        // WHEN: Activating pack with OPEN shift
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
        expect(body.data.updatedBin).toBeDefined();
        expect(body.data.updatedBin.pack).toBeDefined();
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

    test("PKA-S-002: [P0] should allow pack activation when shift is in ACTIVE status", async ({
      storeManagerApiRequest,
      storeManagerUser,
      prismaClient,
    }) => {
      // GIVEN: Store manager with a shift in ACTIVE status
      const pinHash = await bcrypt.hash("5678", 10);
      const cashier = await prismaClient.cashier.create({
        data: {
          store_id: storeManagerUser.store_id,
          employee_id: String(Math.floor(Math.random() * 9999) + 1).padStart(
            4,
            "0",
          ),
          name: "Test Cashier PKA-002",
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
          status: ShiftStatus.ACTIVE, // ACTIVE status
          opening_cash: 100,
          opened_at: new Date(),
        },
      });

      const game = await createLotteryGame(prismaClient, {
        store_id: storeManagerUser.store_id,
        name: `Test Game PKA-002 ${Date.now()}`,
        price: 3.0,
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeManagerUser.store_id,
        bin_number: Math.floor(Math.random() * 10000) + 100,
        name: `Bin PKA-002 ${Date.now()}`,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeManagerUser.store_id,
        pack_number: `PKA002-${Date.now()}`,
        serial_start: "001",
        serial_end: "150",
        status: LotteryPackStatus.RECEIVED,
      });

      try {
        // WHEN: Activating pack with ACTIVE shift
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
        expect(body.data.updatedBin.pack).toBeDefined();
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
  // NON-WORKING STATUS REJECTION (P0) - Test IDs: PKA-S-003 through PKA-S-006
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Non-Working Status Rejection", () => {
    test("PKA-S-003: [P0] should reject pack activation when shift is in CLOSING status", async ({
      storeManagerApiRequest,
      storeManagerUser,
      prismaClient,
    }) => {
      // GIVEN: Store manager with a shift in CLOSING status
      const pinHash = await bcrypt.hash("9012", 10);
      const cashier = await prismaClient.cashier.create({
        data: {
          store_id: storeManagerUser.store_id,
          employee_id: String(Math.floor(Math.random() * 9999) + 1).padStart(
            4,
            "0",
          ),
          name: "Test Cashier PKA-003",
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
          status: ShiftStatus.CLOSING, // CLOSING status
          opening_cash: 100,
          opened_at: new Date(),
        },
      });

      const game = await createLotteryGame(prismaClient, {
        store_id: storeManagerUser.store_id,
        name: `Test Game PKA-003 ${Date.now()}`,
        price: 2.0,
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeManagerUser.store_id,
        bin_number: Math.floor(Math.random() * 10000) + 200,
        name: `Bin PKA-003 ${Date.now()}`,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeManagerUser.store_id,
        pack_number: `PKA003-${Date.now()}`,
        serial_start: "001",
        serial_end: "150",
        status: LotteryPackStatus.RECEIVED,
      });

      try {
        // WHEN: Attempting to activate pack with CLOSING shift
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

        // THEN: Pack activation is rejected with descriptive error
        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("BAD_REQUEST");
        expect(body.error.message.toLowerCase()).toContain("closing");
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

    test("PKA-S-004: [P0] should reject pack activation when shift is in RECONCILING status", async ({
      storeManagerApiRequest,
      storeManagerUser,
      prismaClient,
    }) => {
      // GIVEN: Store manager with a shift in RECONCILING status
      const pinHash = await bcrypt.hash("3456", 10);
      const cashier = await prismaClient.cashier.create({
        data: {
          store_id: storeManagerUser.store_id,
          employee_id: String(Math.floor(Math.random() * 9999) + 1).padStart(
            4,
            "0",
          ),
          name: "Test Cashier PKA-004",
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
          status: ShiftStatus.RECONCILING, // RECONCILING status
          opening_cash: 100,
          opened_at: new Date(),
        },
      });

      const game = await createLotteryGame(prismaClient, {
        store_id: storeManagerUser.store_id,
        name: `Test Game PKA-004 ${Date.now()}`,
        price: 2.0,
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeManagerUser.store_id,
        bin_number: Math.floor(Math.random() * 10000) + 300,
        name: `Bin PKA-004 ${Date.now()}`,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeManagerUser.store_id,
        pack_number: `PKA004-${Date.now()}`,
        serial_start: "001",
        serial_end: "150",
        status: LotteryPackStatus.RECEIVED,
      });

      try {
        // WHEN: Attempting to activate pack with RECONCILING shift
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

        // THEN: Pack activation is rejected
        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("BAD_REQUEST");
        expect(body.error.message.toLowerCase()).toContain("reconcil");
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

    test("PKA-S-005: [P0] should reject pack activation when shift is in VARIANCE_REVIEW status", async ({
      storeManagerApiRequest,
      storeManagerUser,
      prismaClient,
    }) => {
      // GIVEN: Store manager with a shift in VARIANCE_REVIEW status
      const pinHash = await bcrypt.hash("7890", 10);
      const cashier = await prismaClient.cashier.create({
        data: {
          store_id: storeManagerUser.store_id,
          employee_id: String(Math.floor(Math.random() * 9999) + 1).padStart(
            4,
            "0",
          ),
          name: "Test Cashier PKA-005",
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
          status: ShiftStatus.VARIANCE_REVIEW, // VARIANCE_REVIEW status
          opening_cash: 100,
          opened_at: new Date(),
        },
      });

      const game = await createLotteryGame(prismaClient, {
        store_id: storeManagerUser.store_id,
        name: `Test Game PKA-005 ${Date.now()}`,
        price: 2.0,
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeManagerUser.store_id,
        bin_number: Math.floor(Math.random() * 10000) + 400,
        name: `Bin PKA-005 ${Date.now()}`,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeManagerUser.store_id,
        pack_number: `PKA005-${Date.now()}`,
        serial_start: "001",
        serial_end: "150",
        status: LotteryPackStatus.RECEIVED,
      });

      try {
        // WHEN: Attempting to activate pack with VARIANCE_REVIEW shift
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

        // THEN: Pack activation is rejected with variance-specific message
        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("BAD_REQUEST");
        expect(body.error.message.toLowerCase()).toContain("variance");
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

    test("PKA-S-006: [P0] should reject pack activation when shift is in CLOSED status", async ({
      storeManagerApiRequest,
      storeManagerUser,
      prismaClient,
    }) => {
      // GIVEN: Store manager with a shift in CLOSED status
      const pinHash = await bcrypt.hash("1122", 10);
      const cashier = await prismaClient.cashier.create({
        data: {
          store_id: storeManagerUser.store_id,
          employee_id: String(Math.floor(Math.random() * 9999) + 1).padStart(
            4,
            "0",
          ),
          name: "Test Cashier PKA-006",
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
          status: ShiftStatus.CLOSED, // CLOSED status (terminal)
          opening_cash: 100,
          closing_cash: 100,
          opened_at: new Date(),
          closed_at: new Date(),
        },
      });

      const game = await createLotteryGame(prismaClient, {
        store_id: storeManagerUser.store_id,
        name: `Test Game PKA-006 ${Date.now()}`,
        price: 2.0,
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeManagerUser.store_id,
        bin_number: Math.floor(Math.random() * 10000) + 500,
        name: `Bin PKA-006 ${Date.now()}`,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeManagerUser.store_id,
        pack_number: `PKA006-${Date.now()}`,
        serial_start: "001",
        serial_end: "150",
        status: LotteryPackStatus.RECEIVED,
      });

      try {
        // WHEN: Attempting to activate pack with CLOSED shift
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

        // THEN: Pack activation is rejected - closed shifts cannot be used
        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("BAD_REQUEST");
        expect(body.error.message.toLowerCase()).toContain("closed");
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
  // ERROR MESSAGE QUALITY (P1) - Test IDs: PKA-S-007, PKA-S-008
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Error Message Quality", () => {
    test("PKA-S-007: [P1] should provide descriptive error message for CLOSING status", async ({
      storeManagerApiRequest,
      storeManagerUser,
      prismaClient,
    }) => {
      // GIVEN: Store manager with a shift in CLOSING status
      const pinHash = await bcrypt.hash("3344", 10);
      const cashier = await prismaClient.cashier.create({
        data: {
          store_id: storeManagerUser.store_id,
          employee_id: String(Math.floor(Math.random() * 9999) + 1).padStart(
            4,
            "0",
          ),
          name: "Test Cashier PKA-007",
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
          status: ShiftStatus.CLOSING,
          opening_cash: 100,
          opened_at: new Date(),
        },
      });

      const game = await createLotteryGame(prismaClient, {
        store_id: storeManagerUser.store_id,
        name: `Test Game PKA-007 ${Date.now()}`,
        price: 2.0,
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeManagerUser.store_id,
        bin_number: Math.floor(Math.random() * 10000) + 600,
        name: `Bin PKA-007 ${Date.now()}`,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeManagerUser.store_id,
        pack_number: `PKA007-${Date.now()}`,
        serial_start: "001",
        serial_end: "150",
        status: LotteryPackStatus.RECEIVED,
      });

      try {
        // WHEN: Attempting to activate pack with CLOSING shift
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

        // THEN: Error message is user-friendly and actionable
        const body = await response.json();
        expect(body.success).toBe(false);
        const errorMessage = body.error.message.toLowerCase();
        // Should mention closing process
        expect(errorMessage).toContain("closing");
        // Should suggest what to do (complete or cancel)
        expect(
          errorMessage.includes("complete") ||
            errorMessage.includes("cancel") ||
            errorMessage.includes("before") ||
            errorMessage.includes("cannot"),
        ).toBe(true);
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

    test("PKA-S-008: [P1] should provide descriptive error message for VARIANCE_REVIEW status", async ({
      storeManagerApiRequest,
      storeManagerUser,
      prismaClient,
    }) => {
      // GIVEN: Store manager with a shift in VARIANCE_REVIEW status
      const pinHash = await bcrypt.hash("5566", 10);
      const cashier = await prismaClient.cashier.create({
        data: {
          store_id: storeManagerUser.store_id,
          employee_id: String(Math.floor(Math.random() * 9999) + 1).padStart(
            4,
            "0",
          ),
          name: "Test Cashier PKA-008",
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
          status: ShiftStatus.VARIANCE_REVIEW,
          opening_cash: 100,
          opened_at: new Date(),
        },
      });

      const game = await createLotteryGame(prismaClient, {
        store_id: storeManagerUser.store_id,
        name: `Test Game PKA-008 ${Date.now()}`,
        price: 2.0,
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeManagerUser.store_id,
        bin_number: Math.floor(Math.random() * 10000) + 700,
        name: `Bin PKA-008 ${Date.now()}`,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeManagerUser.store_id,
        pack_number: `PKA008-${Date.now()}`,
        serial_start: "001",
        serial_end: "150",
        status: LotteryPackStatus.RECEIVED,
      });

      try {
        // WHEN: Attempting to activate pack with VARIANCE_REVIEW shift
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

        // THEN: Error message mentions variance and suggests resolution
        const body = await response.json();
        expect(body.success).toBe(false);
        const errorMessage = body.error.message.toLowerCase();
        // Should mention variance
        expect(errorMessage).toContain("variance");
        // Should suggest resolving variance
        expect(
          errorMessage.includes("resolve") ||
            errorMessage.includes("review") ||
            errorMessage.includes("pending") ||
            errorMessage.includes("cannot"),
        ).toBe(true);
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
  // SECURITY & VALIDATION (P0) - Test IDs: PKA-S-009, PKA-S-010
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Security and Validation", () => {
    test("PKA-S-009: [P0] should return error when shift_id not found", async ({
      storeManagerApiRequest,
      storeManagerUser,
      prismaClient,
    }) => {
      // GIVEN: Valid store and pack but non-existent shift_id
      const game = await createLotteryGame(prismaClient, {
        store_id: storeManagerUser.store_id,
        name: `Test Game PKA-009 ${Date.now()}`,
        price: 2.0,
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeManagerUser.store_id,
        bin_number: Math.floor(Math.random() * 10000) + 800,
        name: `Bin PKA-009 ${Date.now()}`,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeManagerUser.store_id,
        pack_number: `PKA009-${Date.now()}`,
        serial_start: "001",
        serial_end: "150",
        status: LotteryPackStatus.RECEIVED,
      });

      try {
        // WHEN: Using a non-existent shift_id
        const nonExistentShiftId = "00000000-0000-0000-0000-000000000000";
        const response = await storeManagerApiRequest.post(
          `/api/stores/${storeManagerUser.store_id}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "001",
            activated_by: storeManagerUser.user_id,
            activated_shift_id: nonExistentShiftId,
          },
        );

        // THEN: Request is rejected with appropriate error
        expect(response.status()).toBe(404);
        const body = await response.json();
        expect(body.success).toBe(false);
        // Should indicate shift not found
        expect(body.error.code).toBe("NOT_FOUND");
        expect(body.error.message.toLowerCase()).toContain("shift");
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
      }
    });

    test("PKA-S-010: [P0] should reject shift from different store (RLS enforcement)", async ({
      storeManagerApiRequest,
      storeManagerUser,
      prismaClient,
    }) => {
      // GIVEN: A shift belonging to a different store
      // Create another company and store using helpers
      const otherCompany = await createCompany(prismaClient, {
        name: `Other Company PKA-010 ${Date.now()}`,
      });

      const otherStore = await createStore(prismaClient, {
        name: `Other Store PKA-010 ${Date.now()}`,
        company_id: otherCompany.company_id,
      });

      const pinHash = await bcrypt.hash("7788", 10);
      const otherCashier = await prismaClient.cashier.create({
        data: {
          store_id: otherStore.store_id,
          employee_id: String(Math.floor(Math.random() * 9999) + 1).padStart(
            4,
            "0",
          ),
          name: "Other Store Cashier",
          pin_hash: pinHash,
          hired_on: new Date(),
          created_by: storeManagerUser.user_id, // Just for test
        },
      });

      // Create shift in OTHER store (not the manager's store)
      const otherStoreShift = await prismaClient.shift.create({
        data: {
          store_id: otherStore.store_id, // Different store!
          opened_by: storeManagerUser.user_id,
          cashier_id: otherCashier.cashier_id,
          status: ShiftStatus.OPEN,
          opening_cash: 100,
          opened_at: new Date(),
        },
      });

      // Create resources in manager's store
      const game = await createLotteryGame(prismaClient, {
        store_id: storeManagerUser.store_id,
        name: `Test Game PKA-010 ${Date.now()}`,
        price: 2.0,
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeManagerUser.store_id,
        bin_number: Math.floor(Math.random() * 10000) + 900,
        name: `Bin PKA-010 ${Date.now()}`,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeManagerUser.store_id,
        pack_number: `PKA010-${Date.now()}`,
        serial_start: "001",
        serial_end: "150",
        status: LotteryPackStatus.RECEIVED,
      });

      try {
        // WHEN: Trying to use shift from different store
        const response = await storeManagerApiRequest.post(
          `/api/stores/${storeManagerUser.store_id}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "001",
            activated_by: storeManagerUser.user_id,
            activated_shift_id: otherStoreShift.shift_id, // Shift from OTHER store
          },
        );

        // THEN: Request is rejected - store mismatch
        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("BAD_REQUEST");
        expect(body.error.message.toLowerCase()).toContain("store");
      } finally {
        // Cleanup in order
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
          .delete({ where: { shift_id: otherStoreShift.shift_id } })
          .catch(() => {});
        await prismaClient.cashier
          .delete({ where: { cashier_id: otherCashier.cashier_id } })
          .catch(() => {});
        await prismaClient.store
          .delete({ where: { store_id: otherStore.store_id } })
          .catch(() => {});
        await prismaClient.company
          .delete({ where: { company_id: otherCompany.company_id } })
          .catch(() => {});
      }
    });
  });
});
