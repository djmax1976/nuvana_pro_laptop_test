/**
 * Pack Activation Serial Range Validation API Tests
 *
 * Integration tests for the serial range validation when activating lottery packs.
 * Tests the backend validation that ensures serial_start is within the pack's
 * valid serial range (pack.serial_start <= body.serial_start <= pack.serial_end).
 *
 * ============================================================================
 * TRACEABILITY MATRIX
 * ============================================================================
 * | Test ID                    | Requirement              | Category         |
 * |----------------------------|--------------------------|------------------|
 * | PASR-001                   | Valid serial in range    | Business Logic   |
 * | PASR-002                   | Serial at range start    | Edge Case        |
 * | PASR-003                   | Serial at range end      | Edge Case        |
 * | PASR-004                   | Serial below range       | Error Handling   |
 * | PASR-005                   | Serial above range       | Error Handling   |
 * | PASR-006                   | Default "0" bypasses     | Business Logic   |
 * | PASR-007                   | Error includes range     | Error Handling   |
 * | PASR-008                   | Non-numeric rejected     | Security         |
 * | PASR-009                   | Large serial BigInt      | Edge Case        |
 * | PASR-010                   | Audit log on failure     | Security         |
 * | PASR-011                   | Length mismatch short    | Error Handling   |
 * | PASR-012                   | Length mismatch long     | Error Handling   |
 * ============================================================================
 *
 * MCP Guidance Applied:
 * - SEC-014: INPUT_VALIDATION - Backend validates all serial inputs
 * - API-003: ERROR_HANDLING - Clear error responses with field info
 * - DB-001: ORM_USAGE - Uses Prisma ORM for all database operations
 * - SEC-010: AUTHZ - Permission checks for serial override
 *
 * @story Pack Activation Serial Range Validation
 * @priority P0 (Critical - Data Integrity)
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createLotteryGame,
  createLotteryPack,
  createLotteryBin,
} from "../support/factories/lottery.factory";

test.describe("POST /api/stores/:storeId/lottery/packs/activate (Serial Range Validation)", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1: VALID SERIAL RANGE (PASR-001, PASR-002, PASR-003, PASR-006)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Valid Serial Range", () => {
    test("PASR-001: should accept serial in middle of valid range", async ({
      storeManagerApiRequest,
      prismaClient,
      storeManagerUser,
    }) => {
      const storeId = storeManagerUser.store_id;

      // GIVEN: A pack with serial range 001-150
      const game = await createLotteryGame(prismaClient, {
        store_id: storeId,
        name: `Test Game PASR001 ${Date.now()}`,
        price: 2.0,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeId,
        pack_number: `PASR001-${Date.now()}`,
        serial_start: "001",
        serial_end: "150",
        status: "RECEIVED",
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeId,
        bin_number: Math.floor(Math.random() * 1000) + 100,
        name: `Test Bin PASR001 ${Date.now()}`,
      });

      try {
        // WHEN: Manager activates pack with serial 050 (middle of range)
        const response = await storeManagerApiRequest.post(
          `/api/stores/${storeId}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "050", // Middle of 001-150 range
            activated_by: storeManagerUser.user_id,
          },
        );

        // THEN: Activation should succeed
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
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

    test("PASR-002: should accept serial at exact range start (inclusive)", async ({
      storeManagerApiRequest,
      prismaClient,
      storeManagerUser,
    }) => {
      const storeId = storeManagerUser.store_id;

      const game = await createLotteryGame(prismaClient, {
        store_id: storeId,
        name: `Test Game PASR002 ${Date.now()}`,
        price: 2.0,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeId,
        pack_number: `PASR002-${Date.now()}`,
        serial_start: "001",
        serial_end: "150",
        status: "RECEIVED",
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeId,
        bin_number: Math.floor(Math.random() * 1000) + 200,
        name: `Test Bin PASR002 ${Date.now()}`,
      });

      try {
        // WHEN: Activate with serial at exact start of range
        const response = await storeManagerApiRequest.post(
          `/api/stores/${storeId}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "001", // Exact start of range
            activated_by: storeManagerUser.user_id,
          },
        );

        // THEN: Should succeed (start is inclusive)
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
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

    test("PASR-003: should accept serial at exact range end (inclusive)", async ({
      storeManagerApiRequest,
      prismaClient,
      storeManagerUser,
    }) => {
      const storeId = storeManagerUser.store_id;

      const game = await createLotteryGame(prismaClient, {
        store_id: storeId,
        name: `Test Game PASR003 ${Date.now()}`,
        price: 2.0,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeId,
        pack_number: `PASR003-${Date.now()}`,
        serial_start: "001",
        serial_end: "150",
        status: "RECEIVED",
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeId,
        bin_number: Math.floor(Math.random() * 1000) + 300,
        name: `Test Bin PASR003 ${Date.now()}`,
      });

      try {
        // WHEN: Activate with serial at exact end of range
        const response = await storeManagerApiRequest.post(
          `/api/stores/${storeId}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "150", // Exact end of range
            activated_by: storeManagerUser.user_id,
          },
        );

        // THEN: Should succeed (end is inclusive)
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
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

    test("PASR-006: should bypass validation for default '0' serial", async ({
      storeManagerApiRequest,
      prismaClient,
      storeManagerUser,
    }) => {
      const storeId = storeManagerUser.store_id;

      const game = await createLotteryGame(prismaClient, {
        store_id: storeId,
        name: `Test Game PASR006 ${Date.now()}`,
        price: 2.0,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeId,
        pack_number: `PASR006-${Date.now()}`,
        serial_start: "001",
        serial_end: "150",
        status: "RECEIVED",
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeId,
        bin_number: Math.floor(Math.random() * 1000) + 400,
        name: `Test Bin PASR006 ${Date.now()}`,
      });

      try {
        // WHEN: Activate with default "0" serial (no validation needed)
        const response = await storeManagerApiRequest.post(
          `/api/stores/${storeId}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "0", // Default value - bypasses range validation
            activated_by: storeManagerUser.user_id,
          },
        );

        // THEN: Should succeed without range validation
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
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
  // SECTION 2: OUT OF RANGE ERRORS (PASR-004, PASR-005, PASR-007)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Out of Range Errors", () => {
    test("PASR-004: should reject serial below pack's starting serial", async ({
      storeManagerApiRequest,
      prismaClient,
      storeManagerUser,
    }) => {
      const storeId = storeManagerUser.store_id;

      const game = await createLotteryGame(prismaClient, {
        store_id: storeId,
        name: `Test Game PASR004 ${Date.now()}`,
        price: 2.0,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeId,
        pack_number: `PASR004-${Date.now()}`,
        serial_start: "050", // Pack starts at 050
        serial_end: "150",
        status: "RECEIVED",
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeId,
        bin_number: Math.floor(Math.random() * 1000) + 500,
        name: `Test Bin PASR004 ${Date.now()}`,
      });

      try {
        // WHEN: Try to activate with serial below range
        const response = await storeManagerApiRequest.post(
          `/api/stores/${storeId}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "001", // Below range start of 050
            activated_by: storeManagerUser.user_id,
          },
        );

        // THEN: Should fail with validation error
        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("VALIDATION_ERROR");
        // Error message contains "below" and the valid range
        expect(body.error.message).toContain("below");
        expect(body.error.message).toContain("050"); // Valid range start
        expect(body.error.message).toContain("150"); // Valid range end
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

    test("PASR-005: should reject serial above pack's ending serial", async ({
      storeManagerApiRequest,
      prismaClient,
      storeManagerUser,
    }) => {
      const storeId = storeManagerUser.store_id;

      const game = await createLotteryGame(prismaClient, {
        store_id: storeId,
        name: `Test Game PASR005 ${Date.now()}`,
        price: 2.0,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeId,
        pack_number: `PASR005-${Date.now()}`,
        serial_start: "001",
        serial_end: "100", // Pack ends at 100
        status: "RECEIVED",
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeId,
        bin_number: Math.floor(Math.random() * 1000) + 600,
        name: `Test Bin PASR005 ${Date.now()}`,
      });

      try {
        // WHEN: Try to activate with serial above range
        const response = await storeManagerApiRequest.post(
          `/api/stores/${storeId}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "150", // Above range end of 100
            activated_by: storeManagerUser.user_id,
          },
        );

        // THEN: Should fail with validation error
        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("VALIDATION_ERROR");
        // Error message contains "exceeds" and the valid range
        expect(body.error.message).toContain("exceeds");
        expect(body.error.message).toContain("001"); // Valid range start
        expect(body.error.message).toContain("100"); // Valid range end
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

    test("PASR-007: should include valid range in error response", async ({
      storeManagerApiRequest,
      prismaClient,
      storeManagerUser,
    }) => {
      const storeId = storeManagerUser.store_id;

      const game = await createLotteryGame(prismaClient, {
        store_id: storeId,
        name: `Test Game PASR007 ${Date.now()}`,
        price: 2.0,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeId,
        pack_number: `PASR007-${Date.now()}`,
        serial_start: "025",
        serial_end: "175",
        status: "RECEIVED",
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeId,
        bin_number: Math.floor(Math.random() * 1000) + 700,
        name: `Test Bin PASR007 ${Date.now()}`,
      });

      try {
        // WHEN: Try to activate with invalid serial
        const response = await storeManagerApiRequest.post(
          `/api/stores/${storeId}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "200", // Above range
            activated_by: storeManagerUser.user_id,
          },
        );

        // THEN: Error should include the valid range in the message
        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("VALIDATION_ERROR");
        // The error message includes the valid range
        expect(body.error.message).toContain("025"); // Valid range start
        expect(body.error.message).toContain("175"); // Valid range end
        expect(body.error.message).toContain("Valid range");
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
  // SECTION 3: SECURITY TESTS (PASR-008)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Security Tests", () => {
    test("PASR-008: should reject non-numeric serial_start", async ({
      storeManagerApiRequest,
      prismaClient,
      storeManagerUser,
    }) => {
      const storeId = storeManagerUser.store_id;

      const game = await createLotteryGame(prismaClient, {
        store_id: storeId,
        name: `Test Game PASR008 ${Date.now()}`,
        price: 2.0,
      });

      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeId,
        pack_number: `PASR008-${Date.now()}`,
        serial_start: "001",
        serial_end: "150",
        status: "RECEIVED",
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeId,
        bin_number: Math.floor(Math.random() * 1000) + 800,
        name: `Test Bin PASR008 ${Date.now()}`,
      });

      try {
        // WHEN: Try to activate with non-numeric serial (injection attempt)
        const response = await storeManagerApiRequest.post(
          `/api/stores/${storeId}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "abc; DROP TABLE--",
            activated_by: storeManagerUser.user_id,
          },
        );

        // THEN: Should fail with validation error
        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("VALIDATION_ERROR");
        expect(body.error.message).toContain("numeric");
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
  // SECTION 4: LENGTH VALIDATION (PASR-011, PASR-012)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("Serial Length Validation", () => {
    test("PASR-011: should reject serial with fewer digits than pack format", async ({
      storeManagerApiRequest,
      prismaClient,
      storeManagerUser,
    }) => {
      const storeId = storeManagerUser.store_id;

      const game = await createLotteryGame(prismaClient, {
        store_id: storeId,
        name: `Test Game PASR011 ${Date.now()}`,
        price: 2.0,
      });

      // Pack uses 3-digit serial format (001-150)
      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeId,
        pack_number: `PASR011-${Date.now()}`,
        serial_start: "001",
        serial_end: "150",
        status: "RECEIVED",
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeId,
        bin_number: Math.floor(Math.random() * 1000) + 1100,
        name: `Test Bin PASR011 ${Date.now()}`,
      });

      try {
        // WHEN: Try to activate with 2-digit serial (should be 3)
        const response = await storeManagerApiRequest.post(
          `/api/stores/${storeId}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "50", // Wrong: 2 digits, should be 3
            activated_by: storeManagerUser.user_id,
          },
        );

        // THEN: Should fail with length validation error
        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("VALIDATION_ERROR");
        // Error message indicates exact digit requirement
        expect(body.error.message).toContain("exactly 3 digits");
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

    test("PASR-012: should reject serial with more digits than pack format", async ({
      storeManagerApiRequest,
      prismaClient,
      storeManagerUser,
    }) => {
      const storeId = storeManagerUser.store_id;

      const game = await createLotteryGame(prismaClient, {
        store_id: storeId,
        name: `Test Game PASR012 ${Date.now()}`,
        price: 2.0,
      });

      // Pack uses 3-digit serial format (001-150)
      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeId,
        pack_number: `PASR012-${Date.now()}`,
        serial_start: "001",
        serial_end: "150",
        status: "RECEIVED",
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeId,
        bin_number: Math.floor(Math.random() * 1000) + 1200,
        name: `Test Bin PASR012 ${Date.now()}`,
      });

      try {
        // WHEN: Try to activate with 4-digit serial (should be 3)
        const response = await storeManagerApiRequest.post(
          `/api/stores/${storeId}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "0050", // Wrong: 4 digits, should be 3
            activated_by: storeManagerUser.user_id,
          },
        );

        // THEN: Should fail with length validation error
        expect(response.status()).toBe(400);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("VALIDATION_ERROR");
        // Error message indicates exact digit requirement
        expect(body.error.message).toContain("exactly 3 digits");
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
  // SECTION 5: BIGINT EDGE CASES (PASR-009)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe("BigInt Edge Cases", () => {
    test("PASR-009: should correctly handle large serial numbers with BigInt", async ({
      storeManagerApiRequest,
      prismaClient,
      storeManagerUser,
    }) => {
      const storeId = storeManagerUser.store_id;

      const game = await createLotteryGame(prismaClient, {
        store_id: storeId,
        name: `Test Game PASR009 ${Date.now()}`,
        price: 2.0,
      });

      // Use numbers larger than Number.MAX_SAFE_INTEGER
      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeId,
        pack_number: `PASR009-${Date.now()}`,
        serial_start: "100000000000000000000000", // 24 digits
        serial_end: "200000000000000000000000",
        status: "RECEIVED",
      });

      const bin = await createLotteryBin(prismaClient, {
        store_id: storeId,
        bin_number: Math.floor(Math.random() * 1000) + 900,
        name: `Test Bin PASR009 ${Date.now()}`,
      });

      try {
        // WHEN: Activate with large serial in range
        const response = await storeManagerApiRequest.post(
          `/api/stores/${storeId}/lottery/packs/activate`,
          {
            pack_id: pack.pack_id,
            bin_id: bin.bin_id,
            serial_start: "150000000000000000000000", // In range
            activated_by: storeManagerUser.user_id,
          },
        );

        // THEN: Should succeed with BigInt comparison
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
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
});
