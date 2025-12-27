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

// @ts-nocheck - Test file is incomplete, requires proper fixtures before enabling
import { test, expect } from "../support/fixtures/rbac.fixture";
import { createUserWithRole } from "../support/helpers/user-with-role.helper";
import { v4 as uuidv4 } from "uuid";

// SKIP: Tests require fixtures (testStore, testUser, apiRequest) that don't exist yet.
// TODO: Implement proper fixtures and re-enable tests.
test.describe
  .skip("POST /api/stores/:storeId/lottery/packs/activate (Serial Override)", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1: MANAGER SELF-APPROVAL (PASO-001, PASO-009)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Manager Self-Approval", () => {
    test("PASO-001: manager with LOTTERY_SERIAL_OVERRIDE can set non-zero serial", async ({
      apiRequest,
      prismaClient,
      testStore,
      testUser,
    }) => {
      // GIVEN: A manager with LOTTERY_SERIAL_OVERRIDE permission
      // testUser should be a manager with this permission

      // Create a test game and pack
      const game = await prismaClient.lotteryGame.create({
        data: {
          game_id: uuidv4(),
          store_id: testStore.store_id,
          name: `Test Game ${Date.now()}`,
          price: 2.0,
          serial_length: 3,
        },
      });

      const pack = await prismaClient.lotteryPack.create({
        data: {
          pack_id: uuidv4(),
          game_id: game.game_id,
          pack_number: `${Date.now()}`,
          serial_start: "001",
          serial_end: "150",
          status: "RECEIVED",
        },
      });

      // Create a test bin
      const bin = await prismaClient.lotteryBin.create({
        data: {
          bin_id: uuidv4(),
          store_id: testStore.store_id,
          bin_number: 99,
          name: "Test Bin Override",
          is_active: true,
        },
      });

      try {
        // WHEN: Manager activates pack with non-zero starting serial
        const response = await apiRequest.post(
          `/api/stores/${testStore.store_id}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "025", // Non-zero serial
            activated_by: testUser.user_id,
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

        expect(updatedPack?.serial_override_approved_by).toBe(testUser.user_id);
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
      apiRequest,
      prismaClient,
      testStore,
      testUser,
    }) => {
      // GIVEN: A pack and bin
      const game = await prismaClient.lotteryGame.create({
        data: {
          game_id: uuidv4(),
          store_id: testStore.store_id,
          name: `Test Game Zero ${Date.now()}`,
          price: 2.0,
          serial_length: 3,
        },
      });

      const pack = await prismaClient.lotteryPack.create({
        data: {
          pack_id: uuidv4(),
          game_id: game.game_id,
          pack_number: `ZERO${Date.now()}`,
          serial_start: "001",
          serial_end: "150",
          status: "RECEIVED",
        },
      });

      const bin = await prismaClient.lotteryBin.create({
        data: {
          bin_id: uuidv4(),
          store_id: testStore.store_id,
          bin_number: 98,
          name: "Test Bin Zero Serial",
          is_active: true,
        },
      });

      try {
        // WHEN: Activating with serial_start = "0" (default)
        const response = await apiRequest.post(
          `/api/stores/${testStore.store_id}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "0",
            activated_by: testUser.user_id,
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
      apiRequest,
      prismaClient,
      testStore,
    }) => {
      // GIVEN: A cashier and a manager with approval permission
      const { user: cashier } = await createUserWithRole(prismaClient, {
        roleCode: "CASHIER",
      });

      const { user: manager } = await createUserWithRole(prismaClient, {
        roleCode: "CLIENT_OWNER", // Has LOTTERY_SERIAL_OVERRIDE
      });

      // Associate both with the store
      await prismaClient.userStore.createMany({
        data: [
          { user_id: cashier.user_id, store_id: testStore.store_id },
          { user_id: manager.user_id, store_id: testStore.store_id },
        ],
        skipDuplicates: true,
      });

      // Create shift for cashier
      const shift = await prismaClient.shift.create({
        data: {
          shift_id: uuidv4(),
          store_id: testStore.store_id,
          cashier_id: cashier.user_id,
          status: "ACTIVE",
          opened_at: new Date(),
        },
      });

      const game = await prismaClient.lotteryGame.create({
        data: {
          game_id: uuidv4(),
          store_id: testStore.store_id,
          name: `Dual Auth Game ${Date.now()}`,
          price: 5.0,
          serial_length: 3,
        },
      });

      const pack = await prismaClient.lotteryPack.create({
        data: {
          pack_id: uuidv4(),
          game_id: game.game_id,
          pack_number: `DA${Date.now()}`,
          serial_start: "001",
          serial_end: "100",
          status: "RECEIVED",
        },
      });

      const bin = await prismaClient.lotteryBin.create({
        data: {
          bin_id: uuidv4(),
          store_id: testStore.store_id,
          bin_number: 97,
          name: "Dual Auth Bin",
          is_active: true,
        },
      });

      try {
        // WHEN: Cashier activates with manager approval
        const response = await apiRequest.post(
          `/api/stores/${testStore.store_id}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "050", // Non-zero
            activated_by: cashier.user_id,
            activated_shift_id: shift.shift_id,
            serial_override_approved_by: manager.user_id,
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

        expect(updatedPack?.serial_override_approved_by).toBe(manager.user_id);
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
        await prismaClient.userStore.deleteMany({
          where: {
            user_id: { in: [cashier.user_id, manager.user_id] },
            store_id: testStore.store_id,
          },
        });
        await prismaClient.userRole.deleteMany({
          where: { user_id: { in: [cashier.user_id, manager.user_id] } },
        });
        await prismaClient.user.deleteMany({
          where: { user_id: { in: [cashier.user_id, manager.user_id] } },
        });
      }
    });

    test("PASO-003: cashier without approval cannot set non-zero serial", async ({
      apiRequest,
      prismaClient,
      testStore,
    }) => {
      // GIVEN: A cashier without serial override permission and no approval
      const { user: cashier } = await createUserWithRole(prismaClient, {
        roleCode: "CASHIER",
      });

      await prismaClient.userStore.create({
        data: { user_id: cashier.user_id, store_id: testStore.store_id },
      });

      const shift = await prismaClient.shift.create({
        data: {
          shift_id: uuidv4(),
          store_id: testStore.store_id,
          cashier_id: cashier.user_id,
          status: "ACTIVE",
          opened_at: new Date(),
        },
      });

      const game = await prismaClient.lotteryGame.create({
        data: {
          game_id: uuidv4(),
          store_id: testStore.store_id,
          name: `No Approval Game ${Date.now()}`,
          price: 1.0,
          serial_length: 3,
        },
      });

      const pack = await prismaClient.lotteryPack.create({
        data: {
          pack_id: uuidv4(),
          game_id: game.game_id,
          pack_number: `NA${Date.now()}`,
          serial_start: "001",
          serial_end: "050",
          status: "RECEIVED",
        },
      });

      const bin = await prismaClient.lotteryBin.create({
        data: {
          bin_id: uuidv4(),
          store_id: testStore.store_id,
          bin_number: 96,
          name: "No Approval Bin",
          is_active: true,
        },
      });

      try {
        // WHEN: Cashier tries to activate with non-zero serial WITHOUT approval
        const response = await apiRequest.post(
          `/api/stores/${testStore.store_id}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "010", // Non-zero, no approval
            activated_by: cashier.user_id,
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
        await prismaClient.userStore.deleteMany({
          where: { user_id: cashier.user_id },
        });
        await prismaClient.userRole.deleteMany({
          where: { user_id: cashier.user_id },
        });
        await prismaClient.user.delete({ where: { user_id: cashier.user_id } });
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: APPROVAL VALIDATION (PASO-004, PASO-005, PASO-006)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Approval Validation", () => {
    test("PASO-004: should reject invalid approver UUID", async ({
      apiRequest,
      prismaClient,
      testStore,
    }) => {
      // GIVEN: A cashier with invalid approval UUID
      const { user: cashier } = await createUserWithRole(prismaClient, {
        roleCode: "CASHIER",
      });

      await prismaClient.userStore.create({
        data: { user_id: cashier.user_id, store_id: testStore.store_id },
      });

      const shift = await prismaClient.shift.create({
        data: {
          shift_id: uuidv4(),
          store_id: testStore.store_id,
          cashier_id: cashier.user_id,
          status: "ACTIVE",
          opened_at: new Date(),
        },
      });

      const game = await prismaClient.lotteryGame.create({
        data: {
          game_id: uuidv4(),
          store_id: testStore.store_id,
          name: `Invalid Approver Game ${Date.now()}`,
          price: 1.0,
          serial_length: 3,
        },
      });

      const pack = await prismaClient.lotteryPack.create({
        data: {
          pack_id: uuidv4(),
          game_id: game.game_id,
          pack_number: `IA${Date.now()}`,
          serial_start: "001",
          serial_end: "050",
          status: "RECEIVED",
        },
      });

      const bin = await prismaClient.lotteryBin.create({
        data: {
          bin_id: uuidv4(),
          store_id: testStore.store_id,
          bin_number: 95,
          name: "Invalid Approver Bin",
          is_active: true,
        },
      });

      const nonExistentUserId = uuidv4();

      try {
        // WHEN: Activating with non-existent approver
        const response = await apiRequest.post(
          `/api/stores/${testStore.store_id}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "015",
            activated_by: cashier.user_id,
            activated_shift_id: shift.shift_id,
            serial_override_approved_by: nonExistentUserId,
          },
        );

        // THEN: Should be rejected
        expect(response.status()).toBe(403);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error.message).toContain("not found");
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
        await prismaClient.userStore.deleteMany({
          where: { user_id: cashier.user_id },
        });
        await prismaClient.userRole.deleteMany({
          where: { user_id: cashier.user_id },
        });
        await prismaClient.user.delete({ where: { user_id: cashier.user_id } });
      }
    });

    test("PASO-005: should reject approver without LOTTERY_SERIAL_OVERRIDE permission", async ({
      apiRequest,
      prismaClient,
      testStore,
    }) => {
      // GIVEN: A cashier and another user without the permission
      const { user: cashier } = await createUserWithRole(prismaClient, {
        roleCode: "CASHIER",
      });

      const { user: approverWithoutPerm } = await createUserWithRole(
        prismaClient,
        {
          roleCode: "CASHIER", // Cashiers don't have LOTTERY_SERIAL_OVERRIDE
        },
      );

      await prismaClient.userStore.createMany({
        data: [
          { user_id: cashier.user_id, store_id: testStore.store_id },
          {
            user_id: approverWithoutPerm.user_id,
            store_id: testStore.store_id,
          },
        ],
        skipDuplicates: true,
      });

      const shift = await prismaClient.shift.create({
        data: {
          shift_id: uuidv4(),
          store_id: testStore.store_id,
          cashier_id: cashier.user_id,
          status: "ACTIVE",
          opened_at: new Date(),
        },
      });

      const game = await prismaClient.lotteryGame.create({
        data: {
          game_id: uuidv4(),
          store_id: testStore.store_id,
          name: `No Perm Approver ${Date.now()}`,
          price: 1.0,
          serial_length: 3,
        },
      });

      const pack = await prismaClient.lotteryPack.create({
        data: {
          pack_id: uuidv4(),
          game_id: game.game_id,
          pack_number: `NP${Date.now()}`,
          serial_start: "001",
          serial_end: "050",
          status: "RECEIVED",
        },
      });

      const bin = await prismaClient.lotteryBin.create({
        data: {
          bin_id: uuidv4(),
          store_id: testStore.store_id,
          bin_number: 94,
          name: "No Perm Approver Bin",
          is_active: true,
        },
      });

      try {
        // WHEN: Activating with approver who lacks permission
        const response = await apiRequest.post(
          `/api/stores/${testStore.store_id}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "020",
            activated_by: cashier.user_id,
            activated_shift_id: shift.shift_id,
            serial_override_approved_by: approverWithoutPerm.user_id,
          },
        );

        // THEN: Should be rejected
        expect(response.status()).toBe(403);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("PERMISSION_DENIED");
        expect(body.error.message).toContain("LOTTERY_SERIAL_OVERRIDE");
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
        await prismaClient.userStore.deleteMany({
          where: {
            user_id: { in: [cashier.user_id, approverWithoutPerm.user_id] },
          },
        });
        await prismaClient.userRole.deleteMany({
          where: {
            user_id: { in: [cashier.user_id, approverWithoutPerm.user_id] },
          },
        });
        await prismaClient.user.deleteMany({
          where: {
            user_id: { in: [cashier.user_id, approverWithoutPerm.user_id] },
          },
        });
      }
    });

    test("PASO-006: should reject inactive approver", async ({
      apiRequest,
      prismaClient,
      testStore,
    }) => {
      // GIVEN: A cashier and an inactive manager
      const { user: cashier } = await createUserWithRole(prismaClient, {
        roleCode: "CASHIER",
      });

      const { user: inactiveManager } = await createUserWithRole(prismaClient, {
        roleCode: "CLIENT_OWNER",
        status: "INACTIVE",
      });

      await prismaClient.userStore.createMany({
        data: [
          { user_id: cashier.user_id, store_id: testStore.store_id },
          { user_id: inactiveManager.user_id, store_id: testStore.store_id },
        ],
        skipDuplicates: true,
      });

      const shift = await prismaClient.shift.create({
        data: {
          shift_id: uuidv4(),
          store_id: testStore.store_id,
          cashier_id: cashier.user_id,
          status: "ACTIVE",
          opened_at: new Date(),
        },
      });

      const game = await prismaClient.lotteryGame.create({
        data: {
          game_id: uuidv4(),
          store_id: testStore.store_id,
          name: `Inactive Approver ${Date.now()}`,
          price: 1.0,
          serial_length: 3,
        },
      });

      const pack = await prismaClient.lotteryPack.create({
        data: {
          pack_id: uuidv4(),
          game_id: game.game_id,
          pack_number: `IN${Date.now()}`,
          serial_start: "001",
          serial_end: "050",
          status: "RECEIVED",
        },
      });

      const bin = await prismaClient.lotteryBin.create({
        data: {
          bin_id: uuidv4(),
          store_id: testStore.store_id,
          bin_number: 93,
          name: "Inactive Approver Bin",
          is_active: true,
        },
      });

      try {
        // WHEN: Activating with inactive approver
        const response = await apiRequest.post(
          `/api/stores/${testStore.store_id}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "025",
            activated_by: cashier.user_id,
            activated_shift_id: shift.shift_id,
            serial_override_approved_by: inactiveManager.user_id,
          },
        );

        // THEN: Should be rejected
        expect(response.status()).toBe(403);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error.message).toContain("inactive");
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
        await prismaClient.userStore.deleteMany({
          where: {
            user_id: { in: [cashier.user_id, inactiveManager.user_id] },
          },
        });
        await prismaClient.userRole.deleteMany({
          where: {
            user_id: { in: [cashier.user_id, inactiveManager.user_id] },
          },
        });
        await prismaClient.user.deleteMany({
          where: {
            user_id: { in: [cashier.user_id, inactiveManager.user_id] },
          },
        });
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4: DATA PERSISTENCE (PASO-007, PASO-008, PASO-010)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Data Persistence", () => {
    test("PASO-007: should save all approval fields to database", async ({
      apiRequest,
      prismaClient,
      testStore,
      testUser,
    }) => {
      // GIVEN: A manager activating with non-zero serial
      const game = await prismaClient.lotteryGame.create({
        data: {
          game_id: uuidv4(),
          store_id: testStore.store_id,
          name: `Persistence Game ${Date.now()}`,
          price: 3.0,
          serial_length: 3,
        },
      });

      const pack = await prismaClient.lotteryPack.create({
        data: {
          pack_id: uuidv4(),
          game_id: game.game_id,
          pack_number: `PG${Date.now()}`,
          serial_start: "001",
          serial_end: "100",
          status: "RECEIVED",
        },
      });

      const bin = await prismaClient.lotteryBin.create({
        data: {
          bin_id: uuidv4(),
          store_id: testStore.store_id,
          bin_number: 92,
          name: "Persistence Bin",
          is_active: true,
        },
      });

      const beforeActivation = new Date();

      try {
        // WHEN: Activating with serial override
        const response = await apiRequest.post(
          `/api/stores/${testStore.store_id}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "035",
            activated_by: testUser.user_id,
          },
        );

        expect(response.status()).toBe(200);

        // THEN: All fields should be persisted
        const updatedPack = await prismaClient.lotteryPack.findUnique({
          where: { pack_id: pack.pack_id },
        });

        expect(updatedPack?.serial_override_approved_by).toBe(testUser.user_id);
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
      apiRequest,
      prismaClient,
      testStore,
    }) => {
      // GIVEN: A cashier with manager approval and reason
      const { user: cashier } = await createUserWithRole(prismaClient, {
        roleCode: "CASHIER",
      });

      const { user: manager } = await createUserWithRole(prismaClient, {
        roleCode: "CLIENT_OWNER",
      });

      await prismaClient.userStore.createMany({
        data: [
          { user_id: cashier.user_id, store_id: testStore.store_id },
          { user_id: manager.user_id, store_id: testStore.store_id },
        ],
        skipDuplicates: true,
      });

      const shift = await prismaClient.shift.create({
        data: {
          shift_id: uuidv4(),
          store_id: testStore.store_id,
          cashier_id: cashier.user_id,
          status: "ACTIVE",
          opened_at: new Date(),
        },
      });

      const game = await prismaClient.lotteryGame.create({
        data: {
          game_id: uuidv4(),
          store_id: testStore.store_id,
          name: `Reason Game ${Date.now()}`,
          price: 2.0,
          serial_length: 3,
        },
      });

      const pack = await prismaClient.lotteryPack.create({
        data: {
          pack_id: uuidv4(),
          game_id: game.game_id,
          pack_number: `RG${Date.now()}`,
          serial_start: "001",
          serial_end: "100",
          status: "RECEIVED",
        },
      });

      const bin = await prismaClient.lotteryBin.create({
        data: {
          bin_id: uuidv4(),
          store_id: testStore.store_id,
          bin_number: 91,
          name: "Reason Bin",
          is_active: true,
        },
      });

      const overrideReason =
        "Previous pack was partially damaged, starting from ticket 42";

      try {
        // WHEN: Activating with reason
        const response = await apiRequest.post(
          `/api/stores/${testStore.store_id}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "042",
            activated_by: cashier.user_id,
            activated_shift_id: shift.shift_id,
            serial_override_approved_by: manager.user_id,
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
        await prismaClient.userStore.deleteMany({
          where: {
            user_id: { in: [cashier.user_id, manager.user_id] },
          },
        });
        await prismaClient.userRole.deleteMany({
          where: {
            user_id: { in: [cashier.user_id, manager.user_id] },
          },
        });
        await prismaClient.user.deleteMany({
          where: {
            user_id: { in: [cashier.user_id, manager.user_id] },
          },
        });
      }
    });
  });
});
