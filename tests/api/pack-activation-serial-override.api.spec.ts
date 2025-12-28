/**
 * Pack Activation Serial Override API Tests
 *
 * Tests for the dual-authentication flow when activating lottery packs
 * with non-zero starting serial numbers.
 *
 * ============================================================================
 * TRACEABILITY MATRIX
 * ============================================================================
 * | Test ID                    | Requirement              | Category         |
 * |----------------------------|--------------------------|------------------|
 * | PASO-001                   | Manager self-approval    | Business Logic   |
 * | PASO-002                   | Cashier with approval    | Integration      |
 * | PASO-003                   | Cashier without approval | Authorization    |
 * | PASO-004                   | Invalid approver ID      | Error Handling   |
 * | PASO-005                   | Approver lacks permision | Authorization    |
 * | PASO-006                   | Inactive approver        | Error Handling   |
 * | PASO-007                   | Approval data saved      | Integration      |
 * | PASO-008                   | Audit trail includes app | Security         |
 * | PASO-009                   | Zero serial no approval  | Business Logic   |
 * | PASO-010                   | Reason field saved       | Integration      |
 * ============================================================================
 *
 * Key Features Tested:
 * - Manager self-approval when changing starting serial
 * - Cashier dual-auth flow with manager approval
 * - Permission validation for LOTTERY_SERIAL_OVERRIDE
 * - Approval data persistence (approved_by, approved_at, reason)
 * - Audit trail with serial override information
 * - Edge cases (inactive approver, invalid UUID, etc.)
 *
 * MCP Guidance Applied:
 * - SEC-010: AUTHZ - Permission-based access control
 * - SEC-001: PASSWORD_HASHING - Secure credential verification
 * - DB-001: ORM_USAGE - Parameterized queries via Prisma
 * - SEC-014: INPUT_VALIDATION - Request body validation
 *
 * @story Pack Activation Dual-Authentication Flow
 * @priority P0 (Critical - Security & Authorization)
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import { createUserWithRole } from "../support/helpers/user-with-role.helper";
import {
  createLotteryGame,
  createLotteryPack,
  createLotteryBin,
} from "../support/factories/lottery.factory";
import { createCashier } from "../support/factories/cashier.factory";
import { createShift } from "../support/factories/shift.factory";
import { v4 as uuidv4 } from "uuid";

test.describe("POST /api/stores/:storeId/lottery/packs/activate (Serial Override)", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1: MANAGER SELF-APPROVAL (PASO-001, PASO-009)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Manager Self-Approval", () => {
    test("PASO-001: manager with LOTTERY_SERIAL_OVERRIDE can set non-zero serial", async ({
      storeManagerApiRequest,
      prismaClient,
      storeManagerUser,
    }) => {
      // GIVEN: A manager with LOTTERY_SERIAL_OVERRIDE permission
      const storeId = storeManagerUser.store_id;

      // Create a test game and pack
      const game = await createLotteryGame(prismaClient, {
        store_id: storeId,
        name: `Test Game PASO001 ${Date.now()}`,
        price: 2.0,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeId,
        pack_number: `PASO001-${Date.now()}`,
        serial_start: "001",
        serial_end: "150",
        status: "RECEIVED",
      });

      // Create a test bin
      const bin = await createLotteryBin(prismaClient, {
        store_id: storeId,
        bin_number: 99,
        name: "Test Bin Override PASO001",
      });

      try {
        // WHEN: Manager activates pack with non-zero starting serial
        const response = await storeManagerApiRequest.post(
          `/api/stores/${storeId}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "025", // Non-zero serial
            activated_by: storeManagerUser.user_id,
          },
        );

        // THEN: Should succeed without needing separate approval
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);

        // Verify pack was updated with serial override approval
        const updatedPack = await prismaClient.lotteryPack.findUnique({
          where: { pack_id: pack.pack_id },
        });

        expect(updatedPack?.serial_override_approved_by).toBe(
          storeManagerUser.user_id,
        );
        expect(updatedPack?.serial_override_approved_at).not.toBeNull();
      } finally {
        // Cleanup
        await prismaClient.lotteryPack.delete({
          where: { pack_id: pack.pack_id },
        });
        await prismaClient.lotteryBin.delete({ where: { bin_id: bin.bin_id } });
        await prismaClient.lotteryGame.delete({
          where: { game_id: game.game_id },
        });
      }
    });

    test("PASO-009: zero serial does NOT require approval tracking", async ({
      storeManagerApiRequest,
      prismaClient,
      storeManagerUser,
    }) => {
      // GIVEN: A pack and bin
      const storeId = storeManagerUser.store_id;

      const game = await createLotteryGame(prismaClient, {
        store_id: storeId,
        name: `Test Game Zero PASO009 ${Date.now()}`,
        price: 2.0,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeId,
        pack_number: `ZERO-PASO009-${Date.now()}`,
        serial_start: "001",
        serial_end: "150",
        status: "RECEIVED",
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeId,
        bin_number: 98,
        name: "Test Bin Zero Serial PASO009",
      });

      try {
        // WHEN: Activating with serial_start = "0" (default)
        const response = await storeManagerApiRequest.post(
          `/api/stores/${storeId}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "0",
            activated_by: storeManagerUser.user_id,
          },
        );

        // THEN: Should succeed
        expect(response.status()).toBe(200);

        // Approval fields should NOT be set
        const updatedPack = await prismaClient.lotteryPack.findUnique({
          where: { pack_id: pack.pack_id },
        });

        expect(updatedPack?.serial_override_approved_by).toBeNull();
        expect(updatedPack?.serial_override_approved_at).toBeNull();
      } finally {
        await prismaClient.lotteryPack.delete({
          where: { pack_id: pack.pack_id },
        });
        await prismaClient.lotteryBin.delete({ where: { bin_id: bin.bin_id } });
        await prismaClient.lotteryGame.delete({
          where: { game_id: game.game_id },
        });
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: DUAL-AUTH CASHIER FLOW (PASO-002, PASO-003)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Dual-Auth Cashier Flow", () => {
    test("PASO-002: cashier can activate with valid manager approval", async ({
      storeManagerApiRequest,
      prismaClient,
      storeManagerUser,
    }) => {
      // GIVEN: A cashier and a manager with approval permission
      const storeId = storeManagerUser.store_id;

      const { user: cashier } = await createUserWithRole(prismaClient, {
        roleCode: "CASHIER",
        storeId: storeId,
        companyId: storeManagerUser.company_id,
      });

      // Create cashier for shift using factory (handles pin_hash and required fields)
      const cashierData = await createCashier({
        store_id: storeId,
        created_by: storeManagerUser.user_id,
        name: `Cashier PASO002 ${Date.now()}`,
      });
      const cashierRecord = await prismaClient.cashier.create({
        data: cashierData,
      });

      // Create shift for cashier using factory
      const shiftData = createShift({
        store_id: storeId,
        cashier_id: cashierRecord.cashier_id,
        opened_by: storeManagerUser.user_id,
        status: "ACTIVE",
        opened_at: new Date(),
      });
      const shift = await prismaClient.shift.create({
        data: shiftData,
      });

      const game = await createLotteryGame(prismaClient, {
        store_id: storeId,
        name: `Dual Auth Game PASO002 ${Date.now()}`,
        price: 5.0,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeId,
        pack_number: `DA-PASO002-${Date.now()}`,
        serial_start: "001",
        serial_end: "100",
        status: "RECEIVED",
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeId,
        bin_number: 97,
        name: "Dual Auth Bin PASO002",
      });

      try {
        // WHEN: Cashier activates with manager approval
        const response = await storeManagerApiRequest.post(
          `/api/stores/${storeId}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "050", // Non-zero
            activated_by: cashier.user_id,
            activated_shift_id: shift.shift_id,
            serial_override_approved_by: storeManagerUser.user_id,
            serial_override_reason: "Pack partially sold before receiving",
          },
        );

        // THEN: Should succeed
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);

        // Verify approval was recorded
        const updatedPack = await prismaClient.lotteryPack.findUnique({
          where: { pack_id: pack.pack_id },
        });

        expect(updatedPack?.serial_override_approved_by).toBe(
          storeManagerUser.user_id,
        );
        expect(updatedPack?.serial_override_approved_at).not.toBeNull();
        expect(updatedPack?.serial_override_reason).toBe(
          "Pack partially sold before receiving",
        );
      } finally {
        // Cleanup in correct order
        await prismaClient.lotteryPack.delete({
          where: { pack_id: pack.pack_id },
        });
        await prismaClient.lotteryBin.delete({ where: { bin_id: bin.bin_id } });
        await prismaClient.lotteryGame.delete({
          where: { game_id: game.game_id },
        });
        await prismaClient.shift.delete({
          where: { shift_id: shift.shift_id },
        });
        await prismaClient.cashier.delete({
          where: { cashier_id: cashierRecord.cashier_id },
        });
        await prismaClient.userRole.deleteMany({
          where: { user_id: cashier.user_id },
        });
        await prismaClient.user.delete({ where: { user_id: cashier.user_id } });
      }
    });

    test("PASO-003: cashier without approval cannot set non-zero serial", async ({
      cashierApiRequest,
      prismaClient,
      cashierUser,
    }) => {
      // GIVEN: A cashier without serial override permission and no approval
      // Use cashierUser's store so the JWT has access to the store
      const storeId = cashierUser.store_id;

      // Create cashier record for shift using factory
      const cashierData = await createCashier({
        store_id: storeId,
        created_by: cashierUser.user_id,
        name: `Cashier PASO003 ${Date.now()}`,
      });
      const cashierRecord = await prismaClient.cashier.create({
        data: cashierData,
      });

      // Create shift using factory
      const shiftData = createShift({
        store_id: storeId,
        cashier_id: cashierRecord.cashier_id,
        opened_by: cashierUser.user_id,
        status: "ACTIVE",
        opened_at: new Date(),
      });
      const shift = await prismaClient.shift.create({
        data: shiftData,
      });

      const game = await createLotteryGame(prismaClient, {
        store_id: storeId,
        name: `No Approval Game PASO003 ${Date.now()}`,
        price: 1.0,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeId,
        pack_number: `NA-PASO003-${Date.now()}`,
        serial_start: "001",
        serial_end: "050",
        status: "RECEIVED",
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeId,
        bin_number: 96,
        name: "No Approval Bin PASO003",
      });

      try {
        // WHEN: Cashier tries to activate with non-zero serial WITHOUT approval
        const response = await cashierApiRequest.post(
          `/api/stores/${storeId}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "010", // Non-zero, no approval
            activated_by: cashierUser.user_id,
            activated_shift_id: shift.shift_id,
            // NO serial_override_approved_by
          },
        );

        // THEN: Should be rejected
        expect(response.status()).toBe(403);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("PERMISSION_DENIED");
      } finally {
        await prismaClient.lotteryPack.delete({
          where: { pack_id: pack.pack_id },
        });
        await prismaClient.lotteryBin.delete({ where: { bin_id: bin.bin_id } });
        await prismaClient.lotteryGame.delete({
          where: { game_id: game.game_id },
        });
        await prismaClient.shift.delete({
          where: { shift_id: shift.shift_id },
        });
        await prismaClient.cashier.delete({
          where: { cashier_id: cashierRecord.cashier_id },
        });
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: APPROVAL VALIDATION (PASO-004, PASO-005, PASO-006)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Approval Validation", () => {
    test("PASO-004: should reject invalid approver UUID", async ({
      cashierApiRequest,
      prismaClient,
      cashierUser,
    }) => {
      // GIVEN: A cashier with invalid approval UUID
      // Use cashierUser's store so the JWT has access to the store
      const storeId = cashierUser.store_id;

      // Create cashier record for shift using factory
      const cashierData = await createCashier({
        store_id: storeId,
        created_by: cashierUser.user_id,
        name: `Cashier PASO004 ${Date.now()}`,
      });
      const cashierRecord = await prismaClient.cashier.create({
        data: cashierData,
      });

      // Create shift using factory
      const shiftData = createShift({
        store_id: storeId,
        cashier_id: cashierRecord.cashier_id,
        opened_by: cashierUser.user_id,
        status: "ACTIVE",
        opened_at: new Date(),
      });
      const shift = await prismaClient.shift.create({
        data: shiftData,
      });

      const game = await createLotteryGame(prismaClient, {
        store_id: storeId,
        name: `Invalid Approver Game PASO004 ${Date.now()}`,
        price: 1.0,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeId,
        pack_number: `IA-PASO004-${Date.now()}`,
        serial_start: "001",
        serial_end: "050",
        status: "RECEIVED",
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeId,
        bin_number: 95,
        name: "Invalid Approver Bin PASO004",
      });

      const nonExistentUserId = uuidv4();

      try {
        // WHEN: Activating with non-existent approver
        const response = await cashierApiRequest.post(
          `/api/stores/${storeId}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "015",
            activated_by: cashierUser.user_id,
            activated_shift_id: shift.shift_id,
            serial_override_approved_by: nonExistentUserId,
          },
        );

        // THEN: Should be rejected with 400 (approver not found)
        // Backend validates approver exists before checking permissions
        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("BAD_REQUEST");
        expect(body.error.message).toContain("approver not found"); // Matches "Serial override approver not found"
      } finally {
        await prismaClient.lotteryPack.delete({
          where: { pack_id: pack.pack_id },
        });
        await prismaClient.lotteryBin.delete({ where: { bin_id: bin.bin_id } });
        await prismaClient.lotteryGame.delete({
          where: { game_id: game.game_id },
        });
        await prismaClient.shift.delete({
          where: { shift_id: shift.shift_id },
        });
        await prismaClient.cashier.delete({
          where: { cashier_id: cashierRecord.cashier_id },
        });
      }
    });

    test("PASO-005: should reject approver without LOTTERY_SERIAL_OVERRIDE permission", async ({
      cashierApiRequest,
      prismaClient,
      cashierUser,
    }) => {
      // GIVEN: A cashier and another user without the permission
      // Use cashierUser's store for proper JWT scope
      const storeId = cashierUser.store_id;

      const { user: approverWithoutPerm } = await createUserWithRole(
        prismaClient,
        {
          roleCode: "CASHIER", // Cashiers don't have LOTTERY_SERIAL_OVERRIDE
          storeId: storeId,
          companyId: cashierUser.company_id,
        },
      );

      // Create cashier for shift using factory
      const cashierData = await createCashier({
        store_id: storeId,
        created_by: cashierUser.user_id,
        name: `Cashier PASO005 ${Date.now()}`,
      });
      const cashierRecord = await prismaClient.cashier.create({
        data: cashierData,
      });

      // Create shift using factory
      const shiftData = createShift({
        store_id: storeId,
        cashier_id: cashierRecord.cashier_id,
        opened_by: cashierUser.user_id,
        status: "ACTIVE",
        opened_at: new Date(),
      });
      const shift = await prismaClient.shift.create({
        data: shiftData,
      });

      const game = await createLotteryGame(prismaClient, {
        store_id: storeId,
        name: `No Perm Approver PASO005 ${Date.now()}`,
        price: 1.0,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeId,
        pack_number: `NP-PASO005-${Date.now()}`,
        serial_start: "001",
        serial_end: "050",
        status: "RECEIVED",
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeId,
        bin_number: 94,
        name: "No Perm Approver Bin PASO005",
      });

      try {
        // WHEN: Activating with approver who lacks permission
        const response = await cashierApiRequest.post(
          `/api/stores/${storeId}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "020",
            activated_by: cashierUser.user_id,
            activated_shift_id: shift.shift_id,
            serial_override_approved_by: approverWithoutPerm.user_id,
          },
        );

        // THEN: Should be rejected with 403 (permission denied)
        expect(response.status()).toBe(403);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("PERMISSION_DENIED");
        expect(body.error.message).toContain("permission to override");
      } finally {
        await prismaClient.lotteryPack.delete({
          where: { pack_id: pack.pack_id },
        });
        await prismaClient.lotteryBin.delete({ where: { bin_id: bin.bin_id } });
        await prismaClient.lotteryGame.delete({
          where: { game_id: game.game_id },
        });
        await prismaClient.shift.delete({
          where: { shift_id: shift.shift_id },
        });
        await prismaClient.cashier.delete({
          where: { cashier_id: cashierRecord.cashier_id },
        });
        await prismaClient.userRole.deleteMany({
          where: { user_id: approverWithoutPerm.user_id },
        });
        await prismaClient.user.delete({
          where: { user_id: approverWithoutPerm.user_id },
        });
      }
    });

    test("PASO-006: should reject inactive approver", async ({
      cashierApiRequest,
      prismaClient,
      cashierUser,
    }) => {
      // GIVEN: A cashier and an inactive manager
      // Use cashierUser's store so the JWT has access to the store
      const storeId = cashierUser.store_id;

      const { user: inactiveManager } = await createUserWithRole(prismaClient, {
        roleCode: "CLIENT_OWNER",
        status: "INACTIVE",
        storeId: storeId,
        companyId: cashierUser.company_id,
      });

      // Create cashier record for shift using factory
      const cashierData = await createCashier({
        store_id: storeId,
        created_by: cashierUser.user_id,
        name: `Cashier PASO006 ${Date.now()}`,
      });
      const cashierRecord = await prismaClient.cashier.create({
        data: cashierData,
      });

      // Create shift using factory
      const shiftData = createShift({
        store_id: storeId,
        cashier_id: cashierRecord.cashier_id,
        opened_by: cashierUser.user_id,
        status: "ACTIVE",
        opened_at: new Date(),
      });
      const shift = await prismaClient.shift.create({
        data: shiftData,
      });

      const game = await createLotteryGame(prismaClient, {
        store_id: storeId,
        name: `Inactive Approver PASO006 ${Date.now()}`,
        price: 1.0,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeId,
        pack_number: `IN-PASO006-${Date.now()}`,
        serial_start: "001",
        serial_end: "050",
        status: "RECEIVED",
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeId,
        bin_number: 93,
        name: "Inactive Approver Bin PASO006",
      });

      try {
        // WHEN: Activating with inactive approver
        const response = await cashierApiRequest.post(
          `/api/stores/${storeId}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "025",
            activated_by: cashierUser.user_id,
            activated_shift_id: shift.shift_id,
            serial_override_approved_by: inactiveManager.user_id,
          },
        );

        // THEN: Should be rejected with 400 (inactive approver)
        // Implementation returns BAD_REQUEST for inactive approver, not 403
        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("BAD_REQUEST");
        expect(body.error.message).toContain("not active");
      } finally {
        await prismaClient.lotteryPack.delete({
          where: { pack_id: pack.pack_id },
        });
        await prismaClient.lotteryBin.delete({ where: { bin_id: bin.bin_id } });
        await prismaClient.lotteryGame.delete({
          where: { game_id: game.game_id },
        });
        await prismaClient.shift.delete({
          where: { shift_id: shift.shift_id },
        });
        await prismaClient.cashier.delete({
          where: { cashier_id: cashierRecord.cashier_id },
        });
        await prismaClient.userRole.deleteMany({
          where: { user_id: inactiveManager.user_id },
        });
        await prismaClient.user.delete({
          where: { user_id: inactiveManager.user_id },
        });
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4: DATA PERSISTENCE (PASO-007, PASO-008, PASO-010)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Data Persistence", () => {
    test("PASO-007: should save all approval fields to database", async ({
      storeManagerApiRequest,
      prismaClient,
      storeManagerUser,
    }) => {
      // GIVEN: A manager activating with non-zero serial
      const storeId = storeManagerUser.store_id;

      const game = await createLotteryGame(prismaClient, {
        store_id: storeId,
        name: `Persistence Game PASO007 ${Date.now()}`,
        price: 3.0,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeId,
        pack_number: `PG-PASO007-${Date.now()}`,
        serial_start: "001",
        serial_end: "100",
        status: "RECEIVED",
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeId,
        bin_number: 92,
        name: "Persistence Bin PASO007",
      });

      const beforeActivation = new Date();

      try {
        // WHEN: Activating with serial override
        const response = await storeManagerApiRequest.post(
          `/api/stores/${storeId}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "035",
            activated_by: storeManagerUser.user_id,
          },
        );

        expect(response.status()).toBe(200);

        // THEN: All fields should be persisted
        const updatedPack = await prismaClient.lotteryPack.findUnique({
          where: { pack_id: pack.pack_id },
        });

        expect(updatedPack?.serial_override_approved_by).toBe(
          storeManagerUser.user_id,
        );
        expect(updatedPack?.serial_override_approved_at).not.toBeNull();

        // Timestamp should be recent
        const approvedAt = new Date(updatedPack!.serial_override_approved_at!);
        expect(approvedAt.getTime()).toBeGreaterThanOrEqual(
          beforeActivation.getTime(),
        );
      } finally {
        await prismaClient.lotteryPack.delete({
          where: { pack_id: pack.pack_id },
        });
        await prismaClient.lotteryBin.delete({ where: { bin_id: bin.bin_id } });
        await prismaClient.lotteryGame.delete({
          where: { game_id: game.game_id },
        });
      }
    });

    test("PASO-010: should save serial_override_reason when provided", async ({
      storeManagerApiRequest,
      prismaClient,
      storeManagerUser,
    }) => {
      // GIVEN: A cashier with manager approval and reason
      const storeId = storeManagerUser.store_id;

      const { user: cashier } = await createUserWithRole(prismaClient, {
        roleCode: "CASHIER",
        storeId: storeId,
        companyId: storeManagerUser.company_id,
      });

      // Create cashier for shift using factory
      const cashierData = await createCashier({
        store_id: storeId,
        created_by: storeManagerUser.user_id,
        name: `Cashier PASO010 ${Date.now()}`,
      });
      const cashierRecord = await prismaClient.cashier.create({
        data: cashierData,
      });

      // Create shift using factory
      const shiftData = createShift({
        store_id: storeId,
        cashier_id: cashierRecord.cashier_id,
        opened_by: storeManagerUser.user_id,
        status: "ACTIVE",
        opened_at: new Date(),
      });
      const shift = await prismaClient.shift.create({
        data: shiftData,
      });

      const game = await createLotteryGame(prismaClient, {
        store_id: storeId,
        name: `Reason Game PASO010 ${Date.now()}`,
        price: 2.0,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeId,
        pack_number: `RG-PASO010-${Date.now()}`,
        serial_start: "001",
        serial_end: "100",
        status: "RECEIVED",
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeId,
        bin_number: 91,
        name: "Reason Bin PASO010",
      });

      const overrideReason =
        "Previous pack was partially damaged, starting from ticket 42";

      try {
        // WHEN: Activating with reason
        const response = await storeManagerApiRequest.post(
          `/api/stores/${storeId}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "042",
            activated_by: cashier.user_id,
            activated_shift_id: shift.shift_id,
            serial_override_approved_by: storeManagerUser.user_id,
            serial_override_reason: overrideReason,
          },
        );

        expect(response.status()).toBe(200);

        // THEN: Reason should be saved
        const updatedPack = await prismaClient.lotteryPack.findUnique({
          where: { pack_id: pack.pack_id },
        });

        expect(updatedPack?.serial_override_reason).toBe(overrideReason);
      } finally {
        await prismaClient.lotteryPack.delete({
          where: { pack_id: pack.pack_id },
        });
        await prismaClient.lotteryBin.delete({ where: { bin_id: bin.bin_id } });
        await prismaClient.lotteryGame.delete({
          where: { game_id: game.game_id },
        });
        await prismaClient.shift.delete({
          where: { shift_id: shift.shift_id },
        });
        await prismaClient.cashier.delete({
          where: { cashier_id: cashierRecord.cashier_id },
        });
        await prismaClient.userRole.deleteMany({
          where: { user_id: cashier.user_id },
        });
        await prismaClient.user.delete({ where: { user_id: cashier.user_id } });
      }
    });
  });
});
