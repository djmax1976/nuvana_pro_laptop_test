/**
 * PIN Authentication - Shift Status Enforcement Tests
 *
 * Integration tests verifying that PIN authentication correctly enforces
 * shift status requirements aligned with the ShiftStateMachine.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TRACEABILITY MATRIX
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * | Test ID           | Requirement                           | Category      | Priority |
 * |-------------------|---------------------------------------|---------------|----------|
 * | PIN-I-001         | Accept OPEN shift for PIN auth        | Integration   | P0       |
 * | PIN-I-002         | Accept ACTIVE shift for PIN auth      | Integration   | P0       |
 * | PIN-I-003         | Reject CLOSING shift for PIN auth     | Integration   | P0       |
 * | PIN-I-004         | Reject RECONCILING shift              | Integration   | P0       |
 * | PIN-I-005         | Reject VARIANCE_REVIEW shift          | Integration   | P0       |
 * | PIN-I-006         | Reject CLOSED shift for PIN auth      | Security      | P0       |
 * | PIN-I-007         | Descriptive error for CLOSING         | UX            | P1       |
 * | PIN-I-008         | No shift returns helpful message      | UX            | P1       |
 * | PIN-I-009         | Invalid PIN still rejected            | Security      | P0       |
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * @test-level Integration
 * @justification Tests API endpoint with database, authentication, state machine
 * @story Enterprise Shift Status State Machine
 * @priority P0 (Critical - Authentication & Security)
 *
 * IMPORTANT: Uses cashierApiRequest/cashierUser which has CLIENT_DASHBOARD_ACCESS
 * permission required by the /authenticate-pin endpoint.
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import { ShiftStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

test.describe("PIN Authentication - Shift Status Enforcement", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // WORKING STATUS ACCEPTANCE (P0) - Test IDs: PIN-I-001, PIN-I-002
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Working Status Acceptance", () => {
    test("PIN-I-001: [P0] should accept PIN auth when shift is in OPEN status", async ({
      cashierApiRequest,
      cashierUser,
      prismaClient,
    }) => {
      // GIVEN: Cashier with an OPEN shift
      const pinHash = await bcrypt.hash("1234", 10);
      const uniqueId = String(Math.floor(Math.random() * 9999) + 1).padStart(
        4,
        "0",
      );

      const cashier = await prismaClient.cashier.create({
        data: {
          store_id: cashierUser.store_id,
          employee_id: uniqueId,
          name: "Test Cashier OPEN",
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
          status: ShiftStatus.OPEN,
          opening_cash: 100,
          opened_at: new Date(),
        },
      });

      try {
        // WHEN: Authenticating with PIN
        const response = await cashierApiRequest.post(
          `/api/stores/${cashierUser.store_id}/cashiers/authenticate-pin`,
          { pin: "1234" },
        );

        // THEN: Authentication succeeds
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.data.shift_id).toBe(shift.shift_id);
        expect(body.data.cashier_id).toBe(cashier.cashier_id);
        expect(body.data.cashier_name).toBe("Test Cashier OPEN");
      } finally {
        // Cleanup
        await prismaClient.shift.delete({
          where: { shift_id: shift.shift_id },
        });
        await prismaClient.cashier.delete({
          where: { cashier_id: cashier.cashier_id },
        });
      }
    });

    test("PIN-I-002: [P0] should accept PIN auth when shift is in ACTIVE status", async ({
      cashierApiRequest,
      cashierUser,
      prismaClient,
    }) => {
      // GIVEN: Cashier with an ACTIVE shift
      const pinHash = await bcrypt.hash("5678", 10);
      const uniqueId = String(Math.floor(Math.random() * 9999) + 1).padStart(
        4,
        "0",
      );

      const cashier = await prismaClient.cashier.create({
        data: {
          store_id: cashierUser.store_id,
          employee_id: uniqueId,
          name: "Test Cashier ACTIVE",
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

      try {
        // WHEN: Authenticating with PIN
        const response = await cashierApiRequest.post(
          `/api/stores/${cashierUser.store_id}/cashiers/authenticate-pin`,
          { pin: "5678" },
        );

        // THEN: Authentication succeeds
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.data.shift_id).toBe(shift.shift_id);
      } finally {
        await prismaClient.shift.delete({
          where: { shift_id: shift.shift_id },
        });
        await prismaClient.cashier.delete({
          where: { cashier_id: cashier.cashier_id },
        });
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NON-WORKING STATUS REJECTION (P0) - Test IDs: PIN-I-003 to PIN-I-006
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Non-Working Status Rejection", () => {
    test("PIN-I-003: [P0] should reject PIN auth when shift is in CLOSING status", async ({
      cashierApiRequest,
      cashierUser,
      prismaClient,
    }) => {
      // GIVEN: Cashier with a CLOSING shift
      const pinHash = await bcrypt.hash("1111", 10);
      const uniqueId = String(Math.floor(Math.random() * 9999) + 1).padStart(
        4,
        "0",
      );

      const cashier = await prismaClient.cashier.create({
        data: {
          store_id: cashierUser.store_id,
          employee_id: uniqueId,
          name: "Test Cashier CLOSING",
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
          status: ShiftStatus.CLOSING,
          opening_cash: 100,
          opened_at: new Date(),
        },
      });

      try {
        // WHEN: Authenticating with PIN
        const response = await cashierApiRequest.post(
          `/api/stores/${cashierUser.store_id}/cashiers/authenticate-pin`,
          { pin: "1111" },
        );

        // THEN: Authentication fails with NO_ACTIVE_SHIFT error
        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("NO_ACTIVE_SHIFT");
      } finally {
        await prismaClient.shift.delete({
          where: { shift_id: shift.shift_id },
        });
        await prismaClient.cashier.delete({
          where: { cashier_id: cashier.cashier_id },
        });
      }
    });

    test("PIN-I-004: [P0] should reject PIN auth when shift is in RECONCILING status", async ({
      cashierApiRequest,
      cashierUser,
      prismaClient,
    }) => {
      // GIVEN: Cashier with a RECONCILING shift
      const pinHash = await bcrypt.hash("2222", 10);
      const uniqueId = String(Math.floor(Math.random() * 9999) + 1).padStart(
        4,
        "0",
      );

      const cashier = await prismaClient.cashier.create({
        data: {
          store_id: cashierUser.store_id,
          employee_id: uniqueId,
          name: "Test Cashier RECONCILING",
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
          status: ShiftStatus.RECONCILING,
          opening_cash: 100,
          opened_at: new Date(),
        },
      });

      try {
        // WHEN: Authenticating with PIN
        const response = await cashierApiRequest.post(
          `/api/stores/${cashierUser.store_id}/cashiers/authenticate-pin`,
          { pin: "2222" },
        );

        // THEN: Authentication fails
        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("NO_ACTIVE_SHIFT");
      } finally {
        await prismaClient.shift.delete({
          where: { shift_id: shift.shift_id },
        });
        await prismaClient.cashier.delete({
          where: { cashier_id: cashier.cashier_id },
        });
      }
    });

    test("PIN-I-005: [P0] should reject PIN auth when shift is in VARIANCE_REVIEW status", async ({
      cashierApiRequest,
      cashierUser,
      prismaClient,
    }) => {
      // GIVEN: Cashier with a VARIANCE_REVIEW shift
      const pinHash = await bcrypt.hash("3333", 10);
      const uniqueId = String(Math.floor(Math.random() * 9999) + 1).padStart(
        4,
        "0",
      );

      const cashier = await prismaClient.cashier.create({
        data: {
          store_id: cashierUser.store_id,
          employee_id: uniqueId,
          name: "Test Cashier VARIANCE",
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
          status: ShiftStatus.VARIANCE_REVIEW,
          opening_cash: 100,
          opened_at: new Date(),
        },
      });

      try {
        // WHEN: Authenticating with PIN
        const response = await cashierApiRequest.post(
          `/api/stores/${cashierUser.store_id}/cashiers/authenticate-pin`,
          { pin: "3333" },
        );

        // THEN: Authentication fails
        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("NO_ACTIVE_SHIFT");
      } finally {
        await prismaClient.shift.delete({
          where: { shift_id: shift.shift_id },
        });
        await prismaClient.cashier.delete({
          where: { cashier_id: cashier.cashier_id },
        });
      }
    });

    test("PIN-I-006: [P0] should reject PIN auth when shift is CLOSED (security)", async ({
      cashierApiRequest,
      cashierUser,
      prismaClient,
    }) => {
      // GIVEN: Cashier with only a CLOSED shift
      const pinHash = await bcrypt.hash("4444", 10);
      const uniqueId = String(Math.floor(Math.random() * 9999) + 1).padStart(
        4,
        "0",
      );

      const cashier = await prismaClient.cashier.create({
        data: {
          store_id: cashierUser.store_id,
          employee_id: uniqueId,
          name: "Test Cashier CLOSED",
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
          status: ShiftStatus.CLOSED,
          opening_cash: 100,
          closing_cash: 100,
          opened_at: new Date(),
          closed_at: new Date(),
        },
      });

      try {
        // WHEN: Authenticating with PIN
        const response = await cashierApiRequest.post(
          `/api/stores/${cashierUser.store_id}/cashiers/authenticate-pin`,
          { pin: "4444" },
        );

        // THEN: Authentication fails - no working shift found
        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("NO_ACTIVE_SHIFT");
      } finally {
        await prismaClient.shift.delete({
          where: { shift_id: shift.shift_id },
        });
        await prismaClient.cashier.delete({
          where: { cashier_id: cashier.cashier_id },
        });
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DESCRIPTIVE ERROR MESSAGES (P1) - Test IDs: PIN-I-007, PIN-I-008
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Descriptive Error Messages", () => {
    test("PIN-I-007: [P1] should provide descriptive error for CLOSING shift", async ({
      cashierApiRequest,
      cashierUser,
      prismaClient,
    }) => {
      // GIVEN: Cashier with a CLOSING shift
      const pinHash = await bcrypt.hash("5555", 10);
      const uniqueId = String(Math.floor(Math.random() * 9999) + 1).padStart(
        4,
        "0",
      );

      const cashier = await prismaClient.cashier.create({
        data: {
          store_id: cashierUser.store_id,
          employee_id: uniqueId,
          name: "Test Cashier Descriptive",
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
          status: ShiftStatus.CLOSING,
          opening_cash: 100,
          opened_at: new Date(),
        },
      });

      try {
        // WHEN: Authenticating with PIN
        const response = await cashierApiRequest.post(
          `/api/stores/${cashierUser.store_id}/cashiers/authenticate-pin`,
          { pin: "5555" },
        );

        // THEN: Error message mentions closing
        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.error.message.toLowerCase()).toContain("closing");
      } finally {
        await prismaClient.shift.delete({
          where: { shift_id: shift.shift_id },
        });
        await prismaClient.cashier.delete({
          where: { cashier_id: cashier.cashier_id },
        });
      }
    });

    test("PIN-I-008: [P1] should provide helpful message when no shift exists", async ({
      cashierApiRequest,
      cashierUser,
      prismaClient,
    }) => {
      // GIVEN: Cashier with no shift at all
      const pinHash = await bcrypt.hash("6666", 10);
      const uniqueId = String(Math.floor(Math.random() * 9999) + 1).padStart(
        4,
        "0",
      );

      const cashier = await prismaClient.cashier.create({
        data: {
          store_id: cashierUser.store_id,
          employee_id: uniqueId,
          name: "Test Cashier No Shift",
          pin_hash: pinHash,
          hired_on: new Date(),
          created_by: cashierUser.user_id,
        },
      });

      try {
        // WHEN: Authenticating with PIN
        const response = await cashierApiRequest.post(
          `/api/stores/${cashierUser.store_id}/cashiers/authenticate-pin`,
          { pin: "6666" },
        );

        // THEN: Error message suggests opening a shift
        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.error.message.toLowerCase()).toMatch(/open|active/);
      } finally {
        await prismaClient.cashier.delete({
          where: { cashier_id: cashier.cashier_id },
        });
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS (P0) - Test ID: PIN-I-009
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Security", () => {
    test("PIN-I-009: [P0] should reject invalid PIN regardless of shift status", async ({
      cashierApiRequest,
      cashierUser,
      prismaClient,
    }) => {
      // GIVEN: Cashier with valid OPEN shift but wrong PIN
      const pinHash = await bcrypt.hash("9999", 10);
      const uniqueId = String(Math.floor(Math.random() * 9999) + 1).padStart(
        4,
        "0",
      );

      const cashier = await prismaClient.cashier.create({
        data: {
          store_id: cashierUser.store_id,
          employee_id: uniqueId,
          name: "Test Cashier Security",
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
          status: ShiftStatus.OPEN,
          opening_cash: 100,
          opened_at: new Date(),
        },
      });

      try {
        // WHEN: Authenticating with WRONG PIN
        const response = await cashierApiRequest.post(
          `/api/stores/${cashierUser.store_id}/cashiers/authenticate-pin`,
          { pin: "0000" }, // Wrong PIN
        );

        // THEN: Authentication fails
        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("AUTHENTICATION_FAILED");
      } finally {
        await prismaClient.shift.delete({
          where: { shift_id: shift.shift_id },
        });
        await prismaClient.cashier.delete({
          where: { cashier_id: cashier.cashier_id },
        });
      }
    });

    test("should reject malformed PIN (SQL injection attempt)", async ({
      cashierApiRequest,
      cashierUser,
    }) => {
      // WHEN: Attempting SQL injection via PIN
      const response = await cashierApiRequest.post(
        `/api/stores/${cashierUser.store_id}/cashiers/authenticate-pin`,
        { pin: "1234' OR '1'='1" },
      );

      // THEN: Request is rejected with validation error
      expect(response.status()).toBe(400);
    });

    test("should reject PIN that is not 4 digits", async ({
      cashierApiRequest,
      cashierUser,
    }) => {
      // WHEN: PIN is wrong length
      const response = await cashierApiRequest.post(
        `/api/stores/${cashierUser.store_id}/cashiers/authenticate-pin`,
        { pin: "123" }, // Only 3 digits
      );

      // THEN: Request is rejected
      expect(response.status()).toBe(400);
    });
  });
});
