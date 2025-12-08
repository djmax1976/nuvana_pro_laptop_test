/**
 * Client Dashboard Lottery API Tests
 *
 * Tests for Client Dashboard Lottery API endpoints:
 * - PUT /api/lottery/packs/:packId (update pack)
 * - DELETE /api/lottery/packs/:packId (delete pack)
 * - GET /api/lottery/packs?store_id={storeId}&status=ACTIVE (get active packs)
 * - Authentication and authorization (CLIENT_OWNER role)
 * - RLS enforcement (store isolation)
 * - Error handling
 * - Security tests (SQL injection, XSS, auth bypass, input validation)
 * - Business logic (status restrictions, pack number uniqueness, bin movement)
 *
 * @test-level API
 * @justification Tests API endpoints with authentication, authorization, database operations, and business logic
 * @story 6-10-1 - Client Dashboard Lottery Page
 * @priority P1 (High - Security, Data Integrity, Business Logic)
 * @enhanced-by workflow-9 on 2025-01-28
 *
 * RED PHASE: These tests will fail until endpoints are implemented.
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createLotteryGame,
  createLotteryPack,
  createLotteryBin,
} from "../support/factories/lottery.factory";
import { createCompany, createStore, createUser } from "../support/helpers";
import { withBypassClient } from "../support/prisma-bypass";

// UUID validation regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

test.describe("6.10.1-API: Client Dashboard Lottery - Pack Update", () => {
  test("6.10.1-API-001: [P1] PUT /api/lottery/packs/:packId - should update RECEIVED pack with valid data (AC #5)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner with a store and RECEIVED pack
    // (Active packs can only change status, not other fields)
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 5.0,
    });
    const bin = await createLotteryBin(prismaClient, {
      store_id: clientUser.store_id!,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: clientUser.store_id!,
      status: "RECEIVED", // Only RECEIVED packs can be updated
      current_bin_id: bin.bin_id,
    });

    const updateData = {
      pack_number: "PACK-UPDATED",
      serial_start: "2000",
      serial_end: "3000",
      bin_id: bin.bin_id,
    };

    // WHEN: Updating a RECEIVED lottery pack via API
    const response = await clientUserApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}`,
      updateData,
    );

    // THEN: Pack is updated successfully
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(typeof body.data, "Response should contain data object").toBe(
      "object",
    );
    expect(body.data.pack_id, "Response should contain pack_id").toMatch(
      UUID_REGEX,
    );
    expect(body.data.pack_number, "pack_number should be updated").toBe(
      updateData.pack_number,
    );
    expect(body.data.serial_start, "serial_start should be updated").toBe(
      updateData.serial_start,
    );
    expect(body.data.serial_end, "serial_end should be updated").toBe(
      updateData.serial_end,
    );

    // AND: Pack record is updated in database
    const updatedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
    });
    expect(updatedPack, "Pack should still exist").not.toBeNull();
    expect(
      updatedPack?.pack_number,
      "Pack number should be updated in database",
    ).toBe(updateData.pack_number);
    expect(
      updatedPack?.serial_start,
      "Serial start should be updated in database",
    ).toBe(updateData.serial_start);
    expect(
      updatedPack?.serial_end,
      "Serial end should be updated in database",
    ).toBe(updateData.serial_end);
  });

  test("6.10.1-API-001b: [P1] PUT /api/lottery/packs/:packId - should reject update of ACTIVE pack (only status changes allowed)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner with an ACTIVE pack
    // Business Rule: Active packs can only be depleted or returned (status changes only)
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: clientUser.store_id!,
      status: "ACTIVE",
    });

    // WHEN: Attempting to update ACTIVE pack with pack_number change
    const response = await clientUserApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}`,
      {
        pack_number: "PACK-UPDATED", // Should be rejected for ACTIVE packs
      },
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(
      response.status(),
      "Expected 400 Bad Request - ACTIVE packs cannot be updated",
    ).toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(
      body.error,
      "Error message should explain ACTIVE pack restriction",
    ).toBeDefined();
  });

  test("6.10.1-API-001c: [P1] PUT /api/lottery/packs/:packId - should allow moving pack between bins (AC #5)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner with a RECEIVED pack in bin1
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 5.0,
    });
    const bin1 = await createLotteryBin(prismaClient, {
      store_id: clientUser.store_id!,
      name: "Bin 1",
    });
    const bin2 = await createLotteryBin(prismaClient, {
      store_id: clientUser.store_id!,
      name: "Bin 2",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: clientUser.store_id!,
      status: "RECEIVED",
      current_bin_id: bin1.bin_id,
    });

    // WHEN: Moving pack from bin1 to bin2
    const response = await clientUserApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}`,
      {
        bin_id: bin2.bin_id,
      },
    );

    // THEN: Pack is updated successfully
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.current_bin_id, "Pack should be moved to bin2").toBe(
      bin2.bin_id,
    );

    // AND: Pack record reflects bin change in database
    const updatedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
      include: { bin: true },
    });
    expect(
      updatedPack?.current_bin_id,
      "Pack should be in bin2 in database",
    ).toBe(bin2.bin_id);
    expect(updatedPack?.bin?.name, "Bin name should be Bin 2").toBe("Bin 2");
  });

  test("6.10.1-API-002: [P1] PUT /api/lottery/packs/:packId - should reject update from unauthorized user (AC #7)", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager (not Client Owner)
    // AND: A pack exists owned by another user
    const { company, store, user } = await withBypassClient(async (prisma) => {
      const company = await createCompany(prisma);
      const store = await createStore(prisma, {
        company_id: company.company_id,
      });
      const user = await createUser(prisma);
      return { company, store, user };
    });

    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: store.store_id,
      status: "RECEIVED",
    });

    // WHEN: Store Manager tries to update pack
    const response = await storeManagerApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}`,
      { pack_number: "UNAUTHORIZED" },
    );

    // THEN: Request is rejected with 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden status").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(
      body.error,
      "Error should indicate authorization failure",
    ).toBeDefined();
  });

  test("6.10.1-API-003: [P1] PUT /api/lottery/packs/:packId - should reject update with invalid data (AC #5)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner with a RECEIVED pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: clientUser.store_id!,
      status: "RECEIVED",
    });

    // WHEN: Updating pack with invalid serial range (end < start)
    const response = await clientUserApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}`,
      {
        serial_start: "3000",
        serial_end: "2000", // Invalid: end < start
      },
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Expected 400 Bad Request status").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error message should be present").toBeDefined();
    expect(
      typeof body.error === "object" ? body.error.message : body.error,
      "Error should mention serial range validation",
    ).toContain("serial");
  });

  test("6.10.1-API-003b: [P1] PUT /api/lottery/packs/:packId - should reject duplicate pack_number across all stores", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner with a pack
    // AND: Another pack with the same pack_number exists in a different store
    // Business Rule: Pack numbers must be unique across ALL stores
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 5.0,
    });

    // Create pack in another store with pack_number "DUPLICATE-PACK"
    const { store: otherStore } = await withBypassClient(async (prisma) => {
      const company = await createCompany(prisma);
      const store = await createStore(prisma, {
        company_id: company.company_id,
      });
      return { store };
    });

    await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: otherStore.store_id,
      pack_number: "DUPLICATE-PACK",
      status: "RECEIVED",
    });

    // Create pack in current user's store
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: clientUser.store_id!,
      pack_number: "ORIGINAL-PACK",
      status: "RECEIVED",
    });

    // WHEN: Attempting to update pack_number to duplicate value
    const response = await clientUserApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}`,
      {
        pack_number: "DUPLICATE-PACK", // Already exists in another store
      },
    );

    // THEN: Request is rejected with 409 Conflict
    expect(
      response.status(),
      "Expected 409 Conflict - duplicate pack_number",
    ).toBe(409);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(
      typeof body.error === "object" ? body.error.code : "",
      "Error code should indicate duplicate",
    ).toContain("DUPLICATE");
  });

  // ============ SECURITY TESTS (MANDATORY) ============

  test("6.10.1-API-SEC-001: [P0] PUT /api/lottery/packs/:packId - should prevent SQL injection in pack_id parameter", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // WHEN: Attempting SQL injection in pack_id parameter
    const sqlInjectionAttempts = [
      "'; DROP TABLE lottery_packs; --",
      "1' OR '1'='1",
      "1'; DELETE FROM lottery_packs WHERE '1'='1",
      "1' UNION SELECT * FROM users --",
    ];

    for (const maliciousId of sqlInjectionAttempts) {
      const response = await clientUserApiRequest.put(
        `/api/lottery/packs/${encodeURIComponent(maliciousId)}`,
        { pack_number: "TEST" },
      );

      // THEN: Request is rejected (400 Bad Request for invalid UUID, or 404 Not Found)
      expect(
        response.status(),
        `SQL injection attempt "${maliciousId}" should be rejected`,
      ).toBeOneOf([400, 404]);
    }
  });

  test("6.10.1-API-SEC-002: [P0] PUT /api/lottery/packs/:packId - should prevent XSS in pack_number field", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner with a RECEIVED pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: clientUser.store_id!,
      status: "RECEIVED",
    });

    // WHEN: Attempting XSS injection in pack_number
    const xssAttempts = [
      "<script>alert('XSS')</script>",
      "<img src=x onerror=alert('XSS')>",
      "javascript:alert('XSS')",
      "<svg onload=alert('XSS')>",
      "';alert('XSS');//",
    ];

    for (const maliciousInput of xssAttempts) {
      const response = await clientUserApiRequest.put(
        `/api/lottery/packs/${pack.pack_id}`,
        {
          pack_number: maliciousInput,
        },
      );

      // THEN: Input is sanitized or rejected
      // If accepted, verify it's stored as plain text (not executed)
      if (response.status() === 200) {
        const body = await response.json();
        // Verify no script tags in response (should be escaped/sanitized)
        expect(
          JSON.stringify(body),
          "Response should not contain executable script",
        ).not.toContain("<script>");
      } else {
        // Or validation rejects it
        expect(
          response.status(),
          `XSS attempt "${maliciousInput}" should be rejected or sanitized`,
        ).toBeOneOf([400, 422]);
      }
    }
  });

  test("6.10.1-API-SEC-003: [P0] PUT /api/lottery/packs/:packId - should reject requests without authentication token", async ({
    apiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: A pack exists
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: clientUser.store_id!,
      status: "RECEIVED",
    });

    // WHEN: Making request without authentication token
    const response = await apiRequest.put(
      `/api/lottery/packs/${pack.pack_id}`,
      { pack_number: "UNAUTHORIZED" },
    );

    // THEN: Request is rejected with 401 Unauthorized
    expect(response.status(), "Expected 401 Unauthorized - missing token").toBe(
      401,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("6.10.1-API-SEC-004: [P0] PUT /api/lottery/packs/:packId - should reject requests with invalid authentication token", async ({
    apiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: A pack exists
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: clientUser.store_id!,
      status: "RECEIVED",
    });

    // WHEN: Making request with invalid token
    const invalidTokens = [
      "invalid-token",
      "Bearer invalid.jwt.token",
      "expired-token",
      "",
    ];

    for (const invalidToken of invalidTokens) {
      const response = await apiRequest.put(
        `/api/lottery/packs/${pack.pack_id}`,
        { pack_number: "UNAUTHORIZED" },
        {
          headers: invalidToken
            ? { Authorization: `Bearer ${invalidToken}` }
            : {},
        },
      );

      // THEN: Request is rejected with 401 Unauthorized
      expect(
        response.status(),
        `Invalid token "${invalidToken}" should be rejected`,
      ).toBe(401);
    }
  });

  test("6.10.1-API-SEC-005: [P0] PUT /api/lottery/packs/:packId - should enforce input validation (maxLength, format, required)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner with a RECEIVED pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: clientUser.store_id!,
      status: "RECEIVED",
    });

    // WHEN: Attempting invalid inputs
    const invalidInputs = [
      // pack_number too long (> 50 chars)
      {
        pack_number: "A".repeat(51),
        expectedStatus: 400,
        description: "pack_number exceeds maxLength",
      },
      // serial_start non-numeric
      {
        serial_start: "ABC123",
        expectedStatus: 400,
        description: "serial_start contains non-numeric characters",
      },
      // serial_end non-numeric
      {
        serial_end: "XYZ789",
        expectedStatus: 400,
        description: "serial_end contains non-numeric characters",
      },
      // Invalid UUID for game_id
      {
        game_id: "not-a-uuid",
        expectedStatus: 400,
        description: "game_id is not a valid UUID",
      },
      // Invalid UUID for bin_id
      {
        bin_id: "invalid-uuid-format",
        expectedStatus: 400,
        description: "bin_id is not a valid UUID",
      },
    ];

    for (const invalidInput of invalidInputs) {
      const response = await clientUserApiRequest.put(
        `/api/lottery/packs/${pack.pack_id}`,
        invalidInput,
      );

      // THEN: Request is rejected with 400 Bad Request
      expect(
        response.status(),
        `${invalidInput.description} should be rejected`,
      ).toBe(invalidInput.expectedStatus);
    }
  });

  // ============ EDGE CASES ============

  test("6.10.1-API-EDGE-001: [P2] PUT /api/lottery/packs/:packId - should handle empty pack_number string", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner with a RECEIVED pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: clientUser.store_id!,
      status: "RECEIVED",
    });

    // WHEN: Attempting to update with empty pack_number
    const response = await clientUserApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}`,
      { pack_number: "" },
    );

    // THEN: Request is rejected (pack_number is required, minLength: 1)
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
  });

  test("6.10.1-API-EDGE-002: [P2] PUT /api/lottery/packs/:packId - should handle very long serial numbers", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner with a RECEIVED pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: clientUser.store_id!,
      status: "RECEIVED",
    });

    // WHEN: Attempting to update with very long serial (101+ digits)
    const veryLongSerial = "1".repeat(101);
    const response = await clientUserApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}`,
      {
        serial_start: veryLongSerial,
        serial_end: veryLongSerial + "0",
      },
    );

    // THEN: Request is rejected (maxLength: 100)
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
  });

  test("6.10.1-API-EDGE-003: [P2] PUT /api/lottery/packs/:packId - should handle equal serial_start and serial_end", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner with a RECEIVED pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: clientUser.store_id!,
      status: "RECEIVED",
    });

    // WHEN: Attempting to update with equal start and end
    const response = await clientUserApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}`,
      {
        serial_start: "1000",
        serial_end: "1000", // Invalid: end must be > start
      },
    );

    // THEN: Request is rejected (end must be > start)
    expect(response.status(), "Expected 400 Bad Request").toBe(400);
  });

  test("6.10.1-API-EDGE-004: [P2] PUT /api/lottery/packs/:packId - should handle whitespace trimming in pack_number", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner with a RECEIVED pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: clientUser.store_id!,
      status: "RECEIVED",
    });

    // WHEN: Updating with pack_number containing leading/trailing whitespace
    const response = await clientUserApiRequest.put(
      `/api/lottery/packs/${pack.pack_id}`,
      {
        pack_number: "  PACK-WITH-SPACES  ",
      },
    );

    // THEN: Whitespace is trimmed (backend normalizes by trimming)
    if (response.status() === 200) {
      const body = await response.json();
      expect(body.data.pack_number, "pack_number should be trimmed").toBe(
        "PACK-WITH-SPACES",
      );
    }
  });
});

test.describe("6.10.1-API: Client Dashboard Lottery - Pack Deletion", () => {
  test("6.10.1-API-004: [P1] DELETE /api/lottery/packs/:packId - should delete RECEIVED pack successfully (AC #6)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner with a RECEIVED pack
    // Business Rule: Only non-active packs can be deleted
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: clientUser.store_id!,
      status: "RECEIVED", // Non-active pack can be deleted
    });

    // WHEN: Deleting a RECEIVED lottery pack via API
    const response = await clientUserApiRequest.delete(
      `/api/lottery/packs/${pack.pack_id}`,
    );

    // THEN: Pack is deleted successfully
    expect(
      response.status(),
      "Expected 200 OK or 204 No Content status",
    ).toBeOneOf([200, 204]);

    // AND: Pack record is deleted from database
    const deletedPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
    });
    expect(deletedPack, "Pack should be deleted from database").toBeNull();
  });

  test("6.10.1-API-004b: [P1] DELETE /api/lottery/packs/:packId - should reject deletion of ACTIVE pack (AC #6)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner with an ACTIVE pack
    // Business Rule: Active packs cannot be deleted
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: clientUser.store_id!,
      status: "ACTIVE", // Active pack cannot be deleted
    });

    // WHEN: Attempting to delete an ACTIVE pack
    const response = await clientUserApiRequest.delete(
      `/api/lottery/packs/${pack.pack_id}`,
    );

    // THEN: Request is rejected with 400 Bad Request or 409 Conflict
    expect(
      response.status(),
      "Expected 400 or 409 - ACTIVE packs cannot be deleted",
    ).toBeOneOf([400, 409]);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(
      typeof body.error === "object" ? body.error.message : body.error,
      "Error should explain ACTIVE pack deletion restriction",
    ).toContain("ACTIVE");

    // AND: Pack still exists in database
    const existingPack = await prismaClient.lotteryPack.findUnique({
      where: { pack_id: pack.pack_id },
    });
    expect(existingPack, "Pack should still exist").not.toBeNull();
    expect(existingPack?.status, "Pack status should remain ACTIVE").toBe(
      "ACTIVE",
    );
  });

  test("6.10.1-API-005: [P1] DELETE /api/lottery/packs/:packId - should reject deletion from unauthorized user (AC #7)", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager (not Client Owner)
    // AND: A pack exists owned by another user
    const { store } = await withBypassClient(async (prisma) => {
      const company = await createCompany(prisma);
      const store = await createStore(prisma, {
        company_id: company.company_id,
      });
      return { store };
    });

    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: store.store_id,
      status: "RECEIVED",
    });

    // WHEN: Store Manager tries to delete pack
    const response = await storeManagerApiRequest.delete(
      `/api/lottery/packs/${pack.pack_id}`,
    );

    // THEN: Request is rejected with 403 Forbidden
    expect(response.status(), "Expected 403 Forbidden status").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("6.10.1-API-006: [P1] DELETE /api/lottery/packs/:packId - should reject deletion of non-existent pack (AC #6)", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // WHEN: Deleting a non-existent pack
    const fakePackId = "00000000-0000-0000-0000-000000000000";
    const response = await clientUserApiRequest.delete(
      `/api/lottery/packs/${fakePackId}`,
    );

    // THEN: Request is rejected with 404 Not Found
    expect(response.status(), "Expected 404 Not Found status").toBe(404);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(
      typeof body.error === "object" ? body.error.code : "",
      "Error code should indicate NOT_FOUND",
    ).toContain("NOT_FOUND");
  });

  // ============ SECURITY TESTS (MANDATORY) ============

  test("6.10.1-API-SEC-006: [P0] DELETE /api/lottery/packs/:packId - should prevent SQL injection in pack_id parameter", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // WHEN: Attempting SQL injection in pack_id parameter
    const sqlInjectionAttempts = [
      "'; DROP TABLE lottery_packs; --",
      "1' OR '1'='1",
      "1'; DELETE FROM lottery_packs WHERE '1'='1",
    ];

    for (const maliciousId of sqlInjectionAttempts) {
      const response = await clientUserApiRequest.delete(
        `/api/lottery/packs/${encodeURIComponent(maliciousId)}`,
      );

      // THEN: Request is rejected (400 Bad Request for invalid UUID, or 404 Not Found)
      expect(
        response.status(),
        `SQL injection attempt "${maliciousId}" should be rejected`,
      ).toBeOneOf([400, 404]);
    }
  });

  test("6.10.1-API-SEC-007: [P0] DELETE /api/lottery/packs/:packId - should reject requests without authentication token", async ({
    apiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: A pack exists
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 5.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: clientUser.store_id!,
      status: "RECEIVED",
    });

    // WHEN: Making request without authentication token
    const response = await apiRequest.delete(
      `/api/lottery/packs/${pack.pack_id}`,
    );

    // THEN: Request is rejected with 401 Unauthorized
    expect(response.status(), "Expected 401 Unauthorized - missing token").toBe(
      401,
    );
  });
});

test.describe("6.10.1-API: Client Dashboard Lottery - Get Active Packs", () => {
  test("6.10.1-API-007: [P1] GET /api/lottery/packs?store_id={storeId}&status=ACTIVE - should return only ACTIVE packs (AC #2, #3)", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner with multiple packs (ACTIVE and RECEIVED)
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 5.0,
    });
    const activePack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: clientUser.store_id!,
      status: "ACTIVE",
    });
    const receivedPack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: clientUser.store_id!,
      status: "RECEIVED",
    });

    // WHEN: Fetching active packs via API
    const response = await clientUserApiRequest.get(
      `/api/lottery/packs?store_id=${clientUser.store_id}&status=ACTIVE`,
    );

    // THEN: Only ACTIVE packs are returned
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data, "Response should contain packs array").toBeInstanceOf(
      Array,
    );
    expect(body.data.length, "Should return 1 active pack").toBe(1);
    expect(body.data[0].pack_id, "Should return active pack").toBe(
      activePack.pack_id,
    );
    expect(
      body.data.find(
        (p: { pack_id: string }) => p.pack_id === receivedPack.pack_id,
      ),
      "Should not return received pack",
    ).toBeUndefined();

    // AND: Response structure is correct
    expect(typeof body.data[0].pack_id, "pack_id should be a string").toBe(
      "string",
    );
    expect(body.data[0].pack_id, "pack_id should be a valid UUID").toMatch(
      UUID_REGEX,
    );
    expect(body.data[0].status, "Status should be ACTIVE").toBe("ACTIVE");
  });

  test("6.10.1-API-008: [P1] GET /api/lottery/packs?store_id={storeId}&status=ACTIVE - should enforce RLS (AC #7)", async ({
    clientUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // AND: A pack exists in another user's store
    const { store } = await withBypassClient(async (prisma) => {
      const company = await createCompany(prisma);
      const store = await createStore(prisma, {
        company_id: company.company_id,
      });
      return { store };
    });

    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 5.0,
    });
    const otherStorePack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: store.store_id,
      status: "ACTIVE",
    });

    // WHEN: Fetching active packs for other store
    const response = await clientUserApiRequest.get(
      `/api/lottery/packs?store_id=${store.store_id}&status=ACTIVE`,
    );

    // THEN: Request is rejected or returns empty array (RLS enforcement)
    expect(
      response.status(),
      "Expected 200 OK or 403 Forbidden status",
    ).toBeOneOf([200, 403]);
    if (response.status() === 200) {
      const body = await response.json();
      expect(
        body.data.find(
          (p: { pack_id: string }) => p.pack_id === otherStorePack.pack_id,
        ),
        "Should not return pack from other store",
      ).toBeUndefined();
    }
  });

  // ============ SECURITY TESTS (MANDATORY) ============

  test("6.10.1-API-SEC-008: [P0] GET /api/lottery/packs - should prevent SQL injection in query parameters", async ({
    clientUserApiRequest,
    clientUser,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // WHEN: Attempting SQL injection in store_id query parameter
    const sqlInjectionAttempts = [
      "'; DROP TABLE lottery_packs; --",
      "1' OR '1'='1",
      "1' UNION SELECT * FROM users --",
    ];

    for (const maliciousStoreId of sqlInjectionAttempts) {
      const response = await clientUserApiRequest.get(
        `/api/lottery/packs?store_id=${encodeURIComponent(maliciousStoreId)}&status=ACTIVE`,
      );

      // THEN: Request is rejected (400 Bad Request for invalid UUID, or 403 Forbidden)
      expect(
        response.status(),
        `SQL injection attempt "${maliciousStoreId}" should be rejected`,
      ).toBeOneOf([400, 403, 404]);
    }
  });

  test("6.10.1-API-SEC-009: [P0] GET /api/lottery/packs - should reject requests without authentication token", async ({
    apiRequest,
    clientUser,
  }) => {
    // WHEN: Making request without authentication token
    const response = await apiRequest.get(
      `/api/lottery/packs?store_id=${clientUser.store_id}&status=ACTIVE`,
    );

    // THEN: Request is rejected with 401 Unauthorized
    expect(response.status(), "Expected 401 Unauthorized - missing token").toBe(
      401,
    );
  });

  test("6.10.1-API-SEC-010: [P0] GET /api/lottery/packs - should validate query parameters (store_id UUID format, status enum)", async ({
    clientUserApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Client Owner
    // WHEN: Attempting invalid query parameters
    const invalidParams = [
      // Invalid store_id format
      {
        store_id: "not-a-uuid",
        status: "ACTIVE",
        expectedStatus: 400,
        description: "Invalid store_id UUID format",
      },
      // Invalid status enum
      {
        store_id: "00000000-0000-0000-0000-000000000000",
        status: "INVALID_STATUS",
        expectedStatus: 400,
        description: "Invalid status enum value",
      },
    ];

    for (const params of invalidParams) {
      const response = await clientUserApiRequest.get(
        `/api/lottery/packs?store_id=${params.store_id}&status=${params.status}`,
      );

      // THEN: Request is rejected with 400 Bad Request
      expect(
        response.status(),
        `${params.description} should be rejected`,
      ).toBe(params.expectedStatus);
    }
  });

  // ============ EDGE CASES ============

  test("6.10.1-API-EDGE-005: [P2] GET /api/lottery/packs - should return empty array when no active packs exist", async ({
    clientUserApiRequest,
    clientUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Client Owner with no active packs
    // (Only RECEIVED packs exist)
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 5.0,
    });
    await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: clientUser.store_id!,
      status: "RECEIVED",
    });

    // WHEN: Fetching active packs
    const response = await clientUserApiRequest.get(
      `/api/lottery/packs?store_id=${clientUser.store_id}&status=ACTIVE`,
    );

    // THEN: Empty array is returned
    expect(response.status(), "Expected 200 OK status").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data, "Response should contain data array").toBeInstanceOf(
      Array,
    );
    expect(body.data.length, "Should return empty array").toBe(0);
  });
});
