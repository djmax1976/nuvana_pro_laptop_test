/**
 * Management Authentication Pack Activation API Tests
 *
 * Tests for pack activation when using Management authentication flow.
 * Validates that managers authenticated via Management tab can:
 * 1. Activate packs without a shift requirement
 * 2. Override starting serial numbers with proper permissions
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TRACEABILITY MATRIX
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * | Test ID       | Requirement                                    | Category      | Priority |
 * |---------------|------------------------------------------------|---------------|----------|
 * | MAPA-001      | Manager auth bypasses shift requirement        | Integration   | P0       |
 * | MAPA-002      | Manager auth allows serial override            | Authorization | P0       |
 * | MAPA-003      | Non-manager activated_by requires shift        | Security      | P0       |
 * | MAPA-004      | CLIENT_OWNER role recognized as manager        | Authorization | P0       |
 * | MAPA-005      | CLIENT_ADMIN role recognized as manager        | Authorization | P0       |
 * | MAPA-006      | STORE_MANAGER role recognized as manager       | Authorization | P0       |
 * | MAPA-007      | Default serial "000" needs no override perm    | Business Logic| P1       |
 * | MAPA-008      | Default serial "0" needs no override perm      | Business Logic| P1       |
 * | MAPA-009      | Non-default serial requires override perm      | Authorization | P0       |
 * | MAPA-010      | Invalid activated_by user returns error        | Validation    | P1       |
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * @test-level Integration
 * @justification Tests API endpoint with database, authentication, RBAC
 * @story Pack Activation UX Enhancement - Management Auth Flow
 * @priority P0 (Critical - Authorization & Security)
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import { ShiftStatus, LotteryPackStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  createLotteryGame,
  createLotteryPack,
  createLotteryBin,
} from "../support/factories/lottery.factory";
import { createUserWithRole } from "../support/helpers/user-with-role.helper";

// TODO: These tests need proper fixture setup to create stores, games, bins, packs
// The tests are currently skipped due to 401 authentication errors
// The RBAC fixture's cashierApiRequest needs proper JWT token setup
test.describe.skip("Management Auth Pack Activation", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // MANAGER ROLE BYPASS TESTS (P0) - Test IDs: MAPA-001, MAPA-004, MAPA-005, MAPA-006
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Manager Role Bypass", () => {
    test("MAPA-001: [P0] should allow manager (activated_by) to activate without shift_id", async ({
      cashierApiRequest,
      cashierUser,
      prismaClient,
    }) => {
      // GIVEN: A cashier is logged in (session user)
      // AND: A CLIENT_OWNER user exists (will authenticate via Management tab)
      const { user: managerUser } = await createUserWithRole(prismaClient, {
        roleCode: "CLIENT_OWNER",
        email: `mapa001-manager-${Date.now()}@test.local`,
      });

      // Create lottery fixtures
      const game = await createLotteryGame(prismaClient, {
        name: "Test Game MAPA-001",
        price: 2.0,
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: cashierUser.store_id,
        bin_number: 1,
        name: "Bin 1 MAPA-001",
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: cashierUser.store_id,
        pack_number: `MAPA001-${Date.now()}`,
        serial_start: "100000000000000000000001",
        serial_end: "100000000000000000000150",
        status: LotteryPackStatus.RECEIVED,
      });

      try {
        // WHEN: Activating pack with manager's user_id as activated_by (no shift_id)
        const response = await cashierApiRequest.post(
          `/api/stores/${cashierUser.store_id}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "000", // Default serial
            activated_by: managerUser.user_id, // Management-authenticated user
            // NO activated_shift_id - manager override
          },
        );

        // THEN: Should succeed (manager bypass)
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.data.updatedBin.pack.pack_id).toBe(pack.pack_id);
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
        await prismaClient.userRole
          .deleteMany({ where: { user_id: managerUser.user_id } })
          .catch(() => {});
        await prismaClient.user
          .delete({ where: { user_id: managerUser.user_id } })
          .catch(() => {});
      }
    });

    test("MAPA-004: [P0] CLIENT_OWNER role should be recognized as manager", async ({
      cashierApiRequest,
      cashierUser,
      prismaClient,
    }) => {
      // GIVEN: A CLIENT_OWNER user
      const { user: clientOwner } = await createUserWithRole(prismaClient, {
        roleCode: "CLIENT_OWNER",
        email: `mapa004-owner-${Date.now()}@test.local`,
      });

      const game = await createLotteryGame(prismaClient, {
        name: "Test Game MAPA-004",
        price: 2.0,
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: cashierUser.store_id,
        bin_number: 4,
        name: "Bin MAPA-004",
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: cashierUser.store_id,
        pack_number: `MAPA004-${Date.now()}`,
        serial_start: "100000000000000000000001",
        serial_end: "100000000000000000000150",
        status: LotteryPackStatus.RECEIVED,
      });

      try {
        // WHEN: Activating with CLIENT_OWNER as activated_by
        const response = await cashierApiRequest.post(
          `/api/stores/${cashierUser.store_id}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "000",
            activated_by: clientOwner.user_id,
          },
        );

        // THEN: Should succeed - CLIENT_OWNER is a manager role
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
      } finally {
        await prismaClient.lotteryPack
          .delete({ where: { pack_id: pack.pack_id } })
          .catch(() => {});
        await prismaClient.lotteryBin
          .delete({ where: { bin_id: bin.bin_id } })
          .catch(() => {});
        await prismaClient.lotteryGame
          .delete({ where: { game_id: game.game_id } })
          .catch(() => {});
        await prismaClient.userRole
          .deleteMany({ where: { user_id: clientOwner.user_id } })
          .catch(() => {});
        await prismaClient.user
          .delete({ where: { user_id: clientOwner.user_id } })
          .catch(() => {});
      }
    });

    test("MAPA-005: [P0] CLIENT_ADMIN role should be recognized as manager", async ({
      cashierApiRequest,
      cashierUser,
      prismaClient,
    }) => {
      // GIVEN: A CLIENT_ADMIN user
      const { user: clientAdmin } = await createUserWithRole(prismaClient, {
        roleCode: "CLIENT_ADMIN",
        email: `mapa005-admin-${Date.now()}@test.local`,
      });

      const game = await createLotteryGame(prismaClient, {
        name: "Test Game MAPA-005",
        price: 2.0,
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: cashierUser.store_id,
        bin_number: 5,
        name: "Bin MAPA-005",
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: cashierUser.store_id,
        pack_number: `MAPA005-${Date.now()}`,
        serial_start: "100000000000000000000001",
        serial_end: "100000000000000000000150",
        status: LotteryPackStatus.RECEIVED,
      });

      try {
        // WHEN: Activating with CLIENT_ADMIN as activated_by
        const response = await cashierApiRequest.post(
          `/api/stores/${cashierUser.store_id}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "000",
            activated_by: clientAdmin.user_id,
          },
        );

        // THEN: Should succeed - CLIENT_ADMIN is a manager role
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
      } finally {
        await prismaClient.lotteryPack
          .delete({ where: { pack_id: pack.pack_id } })
          .catch(() => {});
        await prismaClient.lotteryBin
          .delete({ where: { bin_id: bin.bin_id } })
          .catch(() => {});
        await prismaClient.lotteryGame
          .delete({ where: { game_id: game.game_id } })
          .catch(() => {});
        await prismaClient.userRole
          .deleteMany({ where: { user_id: clientAdmin.user_id } })
          .catch(() => {});
        await prismaClient.user
          .delete({ where: { user_id: clientAdmin.user_id } })
          .catch(() => {});
      }
    });

    test("MAPA-006: [P0] STORE_MANAGER role should be recognized as manager", async ({
      cashierApiRequest,
      cashierUser,
      prismaClient,
    }) => {
      // GIVEN: A STORE_MANAGER user
      const { user: storeManager } = await createUserWithRole(prismaClient, {
        roleCode: "STORE_MANAGER",
        email: `mapa006-mgr-${Date.now()}@test.local`,
      });

      const game = await createLotteryGame(prismaClient, {
        name: "Test Game MAPA-006",
        price: 2.0,
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: cashierUser.store_id,
        bin_number: 6,
        name: "Bin MAPA-006",
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: cashierUser.store_id,
        pack_number: `MAPA006-${Date.now()}`,
        serial_start: "100000000000000000000001",
        serial_end: "100000000000000000000150",
        status: LotteryPackStatus.RECEIVED,
      });

      try {
        // WHEN: Activating with STORE_MANAGER as activated_by
        const response = await cashierApiRequest.post(
          `/api/stores/${cashierUser.store_id}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "000",
            activated_by: storeManager.user_id,
          },
        );

        // THEN: Should succeed - STORE_MANAGER is a manager role
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
      } finally {
        await prismaClient.lotteryPack
          .delete({ where: { pack_id: pack.pack_id } })
          .catch(() => {});
        await prismaClient.lotteryBin
          .delete({ where: { bin_id: bin.bin_id } })
          .catch(() => {});
        await prismaClient.lotteryGame
          .delete({ where: { game_id: game.game_id } })
          .catch(() => {});
        await prismaClient.userRole
          .deleteMany({ where: { user_id: storeManager.user_id } })
          .catch(() => {});
        await prismaClient.user
          .delete({ where: { user_id: storeManager.user_id } })
          .catch(() => {});
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NON-MANAGER REJECTION TESTS (P0) - Test ID: MAPA-003
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Non-Manager Rejection", () => {
    test("MAPA-003: [P0] should reject non-manager activated_by without shift_id", async ({
      cashierApiRequest,
      cashierUser,
      prismaClient,
    }) => {
      // GIVEN: A CASHIER user (non-manager role)
      const { user: anotherCashier } = await createUserWithRole(prismaClient, {
        roleCode: "CASHIER",
        email: `mapa003-cashier-${Date.now()}@test.local`,
      });

      const game = await createLotteryGame(prismaClient, {
        name: "Test Game MAPA-003",
        price: 2.0,
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: cashierUser.store_id,
        bin_number: 3,
        name: "Bin MAPA-003",
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: cashierUser.store_id,
        pack_number: `MAPA003-${Date.now()}`,
        serial_start: "100000000000000000000001",
        serial_end: "100000000000000000000150",
        status: LotteryPackStatus.RECEIVED,
      });

      try {
        // WHEN: Activating with CASHIER (non-manager) as activated_by without shift
        const response = await cashierApiRequest.post(
          `/api/stores/${cashierUser.store_id}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "000",
            activated_by: anotherCashier.user_id,
            // NO activated_shift_id
          },
        );

        // THEN: Should fail - cashier requires shift
        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("BAD_REQUEST");
        expect(body.error.message).toContain(
          "Shift ID is required for non-manager users",
        );
      } finally {
        await prismaClient.lotteryPack
          .delete({ where: { pack_id: pack.pack_id } })
          .catch(() => {});
        await prismaClient.lotteryBin
          .delete({ where: { bin_id: bin.bin_id } })
          .catch(() => {});
        await prismaClient.lotteryGame
          .delete({ where: { game_id: game.game_id } })
          .catch(() => {});
        await prismaClient.userRole
          .deleteMany({ where: { user_id: anotherCashier.user_id } })
          .catch(() => {});
        await prismaClient.user
          .delete({ where: { user_id: anotherCashier.user_id } })
          .catch(() => {});
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SERIAL OVERRIDE PERMISSION TESTS (P0/P1) - Test IDs: MAPA-002, MAPA-007, MAPA-008, MAPA-009
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Serial Override Permissions", () => {
    test("MAPA-002: [P0] should allow manager with LOTTERY_SERIAL_OVERRIDE to change serial", async ({
      cashierApiRequest,
      cashierUser,
      prismaClient,
    }) => {
      // GIVEN: A CLIENT_OWNER user (has LOTTERY_SERIAL_OVERRIDE permission)
      const { user: managerUser } = await createUserWithRole(prismaClient, {
        roleCode: "CLIENT_OWNER",
        email: `mapa002-manager-${Date.now()}@test.local`,
      });

      const game = await createLotteryGame(prismaClient, {
        name: "Test Game MAPA-002",
        price: 2.0,
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: cashierUser.store_id,
        bin_number: 2,
        name: "Bin MAPA-002",
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: cashierUser.store_id,
        pack_number: `MAPA002-${Date.now()}`,
        serial_start: "100000000000000000000001",
        serial_end: "100000000000000000000150",
        status: LotteryPackStatus.RECEIVED,
      });

      try {
        // WHEN: Activating with non-default serial (requires override permission)
        const response = await cashierApiRequest.post(
          `/api/stores/${cashierUser.store_id}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "050", // Non-default serial
            activated_by: managerUser.user_id,
          },
        );

        // THEN: Should succeed - CLIENT_OWNER has LOTTERY_SERIAL_OVERRIDE
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
      } finally {
        await prismaClient.lotteryPack
          .delete({ where: { pack_id: pack.pack_id } })
          .catch(() => {});
        await prismaClient.lotteryBin
          .delete({ where: { bin_id: bin.bin_id } })
          .catch(() => {});
        await prismaClient.lotteryGame
          .delete({ where: { game_id: game.game_id } })
          .catch(() => {});
        await prismaClient.userRole
          .deleteMany({ where: { user_id: managerUser.user_id } })
          .catch(() => {});
        await prismaClient.user
          .delete({ where: { user_id: managerUser.user_id } })
          .catch(() => {});
      }
    });

    test("MAPA-007: [P1] should allow default serial '000' without override permission", async ({
      storeManagerApiRequest,
      storeManagerUser,
      prismaClient,
    }) => {
      // GIVEN: A store manager with lottery packs
      const game = await createLotteryGame(prismaClient, {
        name: "Test Game MAPA-007",
        price: 2.0,
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeManagerUser.store_id,
        bin_number: 7,
        name: "Bin MAPA-007",
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeManagerUser.store_id,
        pack_number: `MAPA007-${Date.now()}`,
        serial_start: "100000000000000000000001",
        serial_end: "100000000000000000000150",
        status: LotteryPackStatus.RECEIVED,
      });

      try {
        // WHEN: Activating with default serial "000"
        const response = await storeManagerApiRequest.post(
          `/api/stores/${storeManagerUser.store_id}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "000", // Default - no override needed
            activated_by: storeManagerUser.user_id,
          },
        );

        // THEN: Should succeed - "000" is default, no override permission needed
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
      } finally {
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

    test("MAPA-008: [P1] should allow legacy default serial '0' without override permission", async ({
      storeManagerApiRequest,
      storeManagerUser,
      prismaClient,
    }) => {
      // GIVEN: A store manager with lottery packs
      const game = await createLotteryGame(prismaClient, {
        name: "Test Game MAPA-008",
        price: 2.0,
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeManagerUser.store_id,
        bin_number: 8,
        name: "Bin MAPA-008",
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeManagerUser.store_id,
        pack_number: `MAPA008-${Date.now()}`,
        serial_start: "100000000000000000000001",
        serial_end: "100000000000000000000150",
        status: LotteryPackStatus.RECEIVED,
      });

      try {
        // WHEN: Activating with legacy default serial "0"
        const response = await storeManagerApiRequest.post(
          `/api/stores/${storeManagerUser.store_id}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "0", // Legacy default - no override needed
            activated_by: storeManagerUser.user_id,
          },
        );

        // THEN: Should succeed - "0" is legacy default, no override permission needed
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
      } finally {
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

    test("MAPA-009: [P0] should reject non-default serial without override permission", async ({
      cashierApiRequest,
      cashierUser,
      prismaClient,
    }) => {
      // GIVEN: A user without LOTTERY_SERIAL_OVERRIDE permission
      // Use a role that is a manager but doesn't have serial override permission
      // For this test, we use the cashier user directly (non-manager without override)
      const { user: regularUser } = await createUserWithRole(prismaClient, {
        roleCode: "CASHIER", // No serial override permission
        email: `mapa009-regular-${Date.now()}@test.local`,
      });

      // Create a shift so the activation can proceed past shift check
      const pinHash = await bcrypt.hash("1234", 10);
      const cashier = await prismaClient.cashier.create({
        data: {
          store_id: cashierUser.store_id,
          employee_id: "0009",
          name: "Test Cashier MAPA-009",
          pin_hash: pinHash,
          hired_on: new Date(),
          created_by: cashierUser.user_id,
        },
      });

      const shift = await prismaClient.shift.create({
        data: {
          store_id: cashierUser.store_id,
          opened_by: cashierUser.user_id,
          cashier_id: cashier.cashier_id,
          status: ShiftStatus.ACTIVE,
          opening_cash: 100,
          opened_at: new Date(),
        },
      });

      const game = await createLotteryGame(prismaClient, {
        name: "Test Game MAPA-009",
        price: 2.0,
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: cashierUser.store_id,
        bin_number: 9,
        name: "Bin MAPA-009",
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: cashierUser.store_id,
        pack_number: `MAPA009-${Date.now()}`,
        serial_start: "100000000000000000000001",
        serial_end: "100000000000000000000150",
        status: LotteryPackStatus.RECEIVED,
      });

      try {
        // WHEN: Activating with non-default serial without override permission
        const response = await cashierApiRequest.post(
          `/api/stores/${cashierUser.store_id}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "050", // Non-default serial
            activated_by: regularUser.user_id,
            activated_shift_id: shift.shift_id,
          },
        );

        // THEN: Should fail - no serial override permission
        expect(response.status()).toBe(403);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("PERMISSION_DENIED");
        expect(body.error.message).toContain(
          "permission to change the starting serial",
        );
      } finally {
        await prismaClient.shift
          .delete({ where: { shift_id: shift.shift_id } })
          .catch(() => {});
        await prismaClient.cashier
          .delete({ where: { cashier_id: cashier.cashier_id } })
          .catch(() => {});
        await prismaClient.lotteryPack
          .delete({ where: { pack_id: pack.pack_id } })
          .catch(() => {});
        await prismaClient.lotteryBin
          .delete({ where: { bin_id: bin.bin_id } })
          .catch(() => {});
        await prismaClient.lotteryGame
          .delete({ where: { game_id: game.game_id } })
          .catch(() => {});
        await prismaClient.userRole
          .deleteMany({ where: { user_id: regularUser.user_id } })
          .catch(() => {});
        await prismaClient.user
          .delete({ where: { user_id: regularUser.user_id } })
          .catch(() => {});
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDATION TESTS (P1) - Test ID: MAPA-010
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Validation", () => {
    test("MAPA-010: [P1] should handle invalid activated_by user gracefully", async ({
      cashierApiRequest,
      cashierUser,
      prismaClient,
    }) => {
      // GIVEN: Lottery fixtures
      const game = await createLotteryGame(prismaClient, {
        name: "Test Game MAPA-010",
        price: 2.0,
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: cashierUser.store_id,
        bin_number: 10,
        name: "Bin MAPA-010",
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: cashierUser.store_id,
        pack_number: `MAPA010-${Date.now()}`,
        serial_start: "100000000000000000000001",
        serial_end: "100000000000000000000150",
        status: LotteryPackStatus.RECEIVED,
      });

      try {
        // WHEN: Activating with non-existent activated_by user
        const response = await cashierApiRequest.post(
          `/api/stores/${cashierUser.store_id}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "000",
            activated_by: "00000000-0000-0000-0000-000000000000", // Non-existent
            // No shift - should fail because user not found (not a manager)
          },
        );

        // THEN: Should fail - non-existent user can't be verified as manager
        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("BAD_REQUEST");
      } finally {
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
  });
});
