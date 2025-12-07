/**
 * Shift Lottery Opening API Tests
 *
 * Tests for Shift Lottery Opening API endpoint:
 * - POST /api/shifts/:shiftId/lottery/opening
 * - Authentication and authorization (SHIFT_MANAGER or appropriate role)
 * - RLS enforcement (store isolation)
 * - Pack status validation (only ACTIVE packs can be opened)
 * - Serial range validation (opening_serial within pack range)
 * - Duplicate prevention (unique constraint on shift_id, pack_id)
 * - Audit logging
 * - Error handling (shift not found, pack not found, invalid status, RLS violations)
 * - Security: SQL injection, XSS prevention, authentication bypass, authorization, input validation, data leakage
 * - Edge cases: Empty inputs, max length boundaries, invalid formats, large arrays
 * - Business logic: Multiple packs of same game can be opened
 *
 * @test-level API
 * @justification Tests API endpoint with authentication, authorization, database operations, and business logic
 * @story 6-6 - Shift Lottery Opening
 * @priority P0 (Critical - Security, Data Integrity, Business Logic)
 * @enhanced-by workflow-9 on 2025-01-27
 *
 * GREEN PHASE: These tests validate the implemented endpoint.
 * ENHANCED: Production-grade tests with comprehensive security, edge cases, and assertions.
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createLotteryGame,
  createLotteryPack,
} from "../support/factories/lottery.factory";
import {
  createCompany,
  createStore,
  createUser,
  createShift,
} from "../support/helpers";
// Prisma import removed - using plain numbers for Decimal fields

/**
 * Creates a shift with OPEN status for testing
 * Uses the async createShift helper which handles cashier creation
 */
async function createOpenShift(
  prismaClient: any,
  storeId: string,
  openedBy: string,
  openingCash: number = 100.0,
): Promise<{ shift_id: string; status: string }> {
  // Use the async createShift helper which auto-creates cashier_id
  const shift = await createShift(
    {
      store_id: storeId,
      opened_by: openedBy,
      opening_cash: openingCash,
      status: "OPEN",
    },
    prismaClient,
  );

  return {
    shift_id: shift.shift_id,
    status: shift.status,
  };
}

test.describe("6.6-API: Shift Lottery Opening - Pack Opening", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // HAPPY PATH TESTS (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.6-API-001: [P0] POST /api/shifts/:shiftId/lottery/opening - should create lottery shift openings with valid ACTIVE packs (AC #1)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with an OPEN shift and ACTIVE packs
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 2.0,
    });
    const pack1 = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-001",
      serial_start: "0001",
      serial_end: "0100",
      status: "ACTIVE",
    });
    const pack2 = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-002",
      serial_start: "0101",
      serial_end: "0200",
      status: "ACTIVE",
    });
    const shift = await createOpenShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Opening shift with lottery pack openings
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/opening`,
      {
        packOpenings: [
          { packId: pack1.pack_id, openingSerial: "0050" },
          { packId: pack2.pack_id, openingSerial: "0150" },
        ],
      },
    );

    // THEN: Lottery shift openings are created successfully
    expect(response.status(), "Expected 201 Created status").toBe(201);
    const body = await response.json();

    // Response structure assertions
    expect(body, "Response should be an object").toBeInstanceOf(Object);
    expect(body.success, "Response should indicate success").toBe(true);
    expect(typeof body.success, "success should be boolean").toBe("boolean");
    expect(body.data, "Response should contain shift data").toHaveProperty(
      "shift_id",
    );
    expect(body.data, "Response should contain openings array").toHaveProperty(
      "openings",
    );
    expect(
      Array.isArray(body.data.openings),
      "openings should be an array",
    ).toBe(true);
    expect(body.data.openings.length, "Should have 2 openings").toBe(2);

    // Data type assertions
    expect(typeof body.data.shift_id, "shift_id should be string (UUID)").toBe(
      "string",
    );
    expect(
      body.data.shift_id.length,
      "shift_id should be valid UUID length",
    ).toBeGreaterThan(30);

    // Opening structure assertions
    for (const opening of body.data.openings) {
      expect(opening, "Opening should be an object").toBeInstanceOf(Object);
      expect(opening, "Opening should have opening_id").toHaveProperty(
        "opening_id",
      );
      expect(opening, "Opening should have pack_id").toHaveProperty("pack_id");
      expect(opening, "Opening should have opening_serial").toHaveProperty(
        "opening_serial",
      );
      expect(opening, "Opening should have pack").toHaveProperty("pack");

      expect(
        typeof opening.opening_id,
        "opening_id should be string (UUID)",
      ).toBe("string");
      expect(typeof opening.pack_id, "pack_id should be string (UUID)").toBe(
        "string",
      );
      expect(
        typeof opening.opening_serial,
        "opening_serial should be string",
      ).toBe("string");
      expect(
        opening.opening_serial.length,
        "opening_serial should be within 1-100 chars",
      ).toBeGreaterThan(0);
      expect(
        opening.opening_serial.length,
        "opening_serial should be within 1-100 chars",
      ).toBeLessThanOrEqual(100);

      // Pack structure assertions
      expect(opening.pack, "Pack should be an object").toBeInstanceOf(Object);
      expect(opening.pack, "Pack should have pack_id").toHaveProperty(
        "pack_id",
      );
      expect(opening.pack, "Pack should have pack_number").toHaveProperty(
        "pack_number",
      );
      expect(opening.pack, "Pack should have serial_start").toHaveProperty(
        "serial_start",
      );
      expect(opening.pack, "Pack should have serial_end").toHaveProperty(
        "serial_end",
      );
      expect(opening.pack, "Pack should have game").toHaveProperty("game");

      expect(
        typeof opening.pack.pack_id,
        "pack.pack_id should be string (UUID)",
      ).toBe("string");
      expect(
        typeof opening.pack.pack_number,
        "pack.pack_number should be string",
      ).toBe("string");
      expect(
        typeof opening.pack.serial_start,
        "pack.serial_start should be string",
      ).toBe("string");
      expect(
        typeof opening.pack.serial_end,
        "pack.serial_end should be string",
      ).toBe("string");

      // Game structure assertions
      expect(opening.pack.game, "Game should be an object").toBeInstanceOf(
        Object,
      );
      expect(opening.pack.game, "Game should have game_id").toHaveProperty(
        "game_id",
      );
      expect(opening.pack.game, "Game should have name").toHaveProperty("name");

      expect(
        typeof opening.pack.game.game_id,
        "game.game_id should be string (UUID)",
      ).toBe("string");
      expect(typeof opening.pack.game.name, "game.name should be string").toBe(
        "string",
      );
    }

    // Verify opening records in database
    const openings = await prismaClient.lotteryShiftOpening.findMany({
      where: { shift_id: shift.shift_id },
      include: { pack: { include: { game: true } } },
    });
    expect(openings.length, "Should have 2 opening records").toBe(2);

    // Verify first opening
    const opening1 = openings.find(
      (o: { pack_id: string }) => o.pack_id === pack1.pack_id,
    );
    expect(opening1, "First opening should exist").not.toBeUndefined();
    expect(opening1?.opening_serial, "opening_serial should match").toBe(
      "0050",
    );
    expect(opening1?.shift_id, "shift_id should match").toBe(shift.shift_id);

    // Verify second opening
    const opening2 = openings.find(
      (o: { pack_id: string }) => o.pack_id === pack2.pack_id,
    );
    expect(opening2, "Second opening should exist").not.toBeUndefined();
    expect(opening2?.opening_serial, "opening_serial should match").toBe(
      "0150",
    );
    expect(opening2?.shift_id, "shift_id should match").toBe(shift.shift_id);

    // AND: Audit log entry is created
    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        table_name: "shifts",
        record_id: shift.shift_id,
        action: "SHIFT_LOTTERY_OPENED",
        user_id: storeManagerUser.user_id,
      },
    });
    expect(auditLog, "Audit log should be created").not.toBeNull();
    expect(
      auditLog?.action,
      "Audit action should be SHIFT_LOTTERY_OPENED",
    ).toBe("SHIFT_LOTTERY_OPENED");
    // Note: metadata stored in new_values field as JSON
    expect(
      auditLog?.new_values,
      "Audit log should contain new_values with pack_openings",
    ).toBeTruthy();
  });

  test("6.6-API-002: [P0] POST /api/shifts/:shiftId/lottery/opening - should validate opening serial is within pack range (AC #1, #3)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with an OPEN shift and ACTIVE pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 2.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-002",
      serial_start: "0001",
      serial_end: "0100",
      status: "ACTIVE",
    });
    const shift = await createOpenShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Opening shift with opening serial at pack boundary (serial_start)
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/opening`,
      {
        packOpenings: [{ packId: pack.pack_id, openingSerial: "0001" }],
      },
    );

    // THEN: Opening is created successfully
    expect(response.status(), "Expected 201 Created status").toBe(201);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);

    // AND: Opening serial at upper boundary also works
    const pack2 = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-002b",
      serial_start: "0001",
      serial_end: "0100",
      status: "ACTIVE",
    });
    const response2 = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/opening`,
      {
        packOpenings: [{ packId: pack2.pack_id, openingSerial: "0100" }],
      },
    );
    expect(response2.status(), "Expected 201 Created status").toBe(201);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHENTICATION & AUTHORIZATION TESTS (P0 - Security)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.6-API-003: [P0] SECURITY - should require authentication", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am not authenticated
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });
    const shift = await createOpenShift(
      prismaClient,
      store.store_id,
      owner.user_id,
    );

    // WHEN: Attempting to open shift with lottery packs without authentication
    const response = await apiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/opening`,
      {
        packOpenings: [{ packId: "test-pack-id", openingSerial: "0050" }],
      },
    );

    // THEN: Request is rejected with 401 Unauthorized
    expect(response.status(), "Should return 401 for unauthenticated").toBe(
      401,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error object should be present").toHaveProperty("code");
    expect(body.error.code, "Error code should be UNAUTHORIZED").toBe(
      "UNAUTHORIZED",
    );
  });

  test("6.6-API-004: [P0] SECURITY - should require LOTTERY_SHIFT_OPEN or SHIFT_OPEN permission", async ({
    regularUserApiRequest,
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a regular user without LOTTERY_SHIFT_OPEN permission
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-004",
      serial_start: "0001",
      serial_end: "0100",
      status: "ACTIVE",
    });
    const shift = await createOpenShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Attempting to open shift with lottery packs without permission
    const response = await regularUserApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/opening`,
      {
        packOpenings: [{ packId: pack.pack_id, openingSerial: "0050" }],
      },
    );

    // THEN: Request is rejected with 403 Forbidden
    expect(response.status(), "Should return 403 for missing permission").toBe(
      403,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("6.6-API-004a: [P0] SECURITY - should allow SHIFT_MANAGER role", async ({
    authenticatedShiftManager,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Shift Manager
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: authenticatedShiftManager.store.store_id,
      pack_number: "PACK-004",
      serial_start: "0001",
      serial_end: "0100",
      status: "ACTIVE",
    });
    const shift = await createOpenShift(
      prismaClient,
      authenticatedShiftManager.store.store_id,
      authenticatedShiftManager.user.user_id,
    );

    // WHEN: Opening shift with lottery packs as Shift Manager
    const response = await authenticatedShiftManager.post(
      `/api/shifts/${shift.shift_id}/lottery/opening`,
      {
        packOpenings: [{ packId: pack.pack_id, openingSerial: "0050" }],
      },
    );

    // THEN: Request succeeds
    expect(response.status(), "Shift Manager should be allowed").toBe(201);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RLS ENFORCEMENT TESTS (P0 - Security)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.6-API-007: [P0] SECURITY - should enforce store isolation (RLS) (AC #4)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with a shift from a different store
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    const otherOwner = await createUser(prismaClient);
    const otherCompany = await createCompany(prismaClient, {
      owner_user_id: otherOwner.user_id,
    });
    const otherStore = await createStore(prismaClient, {
      company_id: otherCompany.company_id,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: otherStore.store_id, // Different store
      pack_number: "PACK-007",
      serial_start: "0001",
      serial_end: "0100",
      status: "ACTIVE",
    });
    const shift = await createOpenShift(
      prismaClient,
      otherStore.store_id, // Different store
      otherOwner.user_id,
    );

    // WHEN: Attempting to open shift with pack from different store
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/opening`,
      {
        packOpenings: [{ packId: pack.pack_id, openingSerial: "0050" }],
      },
    );

    // THEN: Request is rejected with 403 Forbidden
    expect(response.status(), "Should return 403 for RLS violation").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be FORBIDDEN").toBe("FORBIDDEN");
  });

  test("6.6-API-007a: [P0] SECURITY - should reject pack from different store than shift (AC #4)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with a shift and pack from different stores
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    const otherOwner = await createUser(prismaClient);
    const otherCompany = await createCompany(prismaClient, {
      owner_user_id: otherOwner.user_id,
    });
    const otherStore = await createStore(prismaClient, {
      company_id: otherCompany.company_id,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: otherStore.store_id, // Different store than shift
      pack_number: "PACK-007a",
      serial_start: "0001",
      serial_end: "0100",
      status: "ACTIVE",
    });
    const shift = await createOpenShift(
      prismaClient,
      storeManagerUser.store_id, // User's store
      storeManagerUser.user_id,
    );

    // WHEN: Attempting to open shift with pack from different store
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/opening`,
      {
        packOpenings: [{ packId: pack.pack_id, openingSerial: "0050" }],
      },
    );

    // THEN: Request is rejected with 400 or 403 (store mismatch)
    expect([400, 403], "Should return 400 or 403 for store mismatch").toContain(
      response.status(),
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STATUS VALIDATION TESTS (P0 - Business Logic)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.6-API-008: [P0] VALIDATION - should reject pack with RECEIVED status (AC #2)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with a pack in RECEIVED status
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-008",
      serial_start: "0001",
      serial_end: "0100",
      status: "RECEIVED", // Not ACTIVE
    });
    const shift = await createOpenShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Attempting to open shift with non-ACTIVE pack
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/opening`,
      {
        packOpenings: [{ packId: pack.pack_id, openingSerial: "0050" }],
      },
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Should return 400 for invalid status").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(
      body.error.code,
      "Error code should indicate invalid pack status",
    ).toBeDefined();

    // AND: No LotteryShiftOpening records are created
    const openings = await prismaClient.lotteryShiftOpening.findMany({
      where: { shift_id: shift.shift_id },
    });
    expect(openings.length, "No openings should be created").toBe(0);
  });

  test("6.6-API-009: [P0] VALIDATION - should reject pack with DEPLETED status (AC #2)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with a pack in DEPLETED status
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-009",
      serial_start: "0001",
      serial_end: "0100",
      status: "DEPLETED",
    });
    const shift = await createOpenShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Attempting to open shift with DEPLETED pack
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/opening`,
      {
        packOpenings: [{ packId: pack.pack_id, openingSerial: "0050" }],
      },
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Should return 400 for invalid status").toBe(400);
    const body = await response.json();
    expect(
      body.error.code,
      "Error code should indicate invalid pack status",
    ).toBeDefined();
  });

  test("6.6-API-010: [P0] VALIDATION - should reject opening serial outside pack range (AC #3)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with an OPEN shift and ACTIVE pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-010",
      serial_start: "0001",
      serial_end: "0100",
      status: "ACTIVE",
    });
    const shift = await createOpenShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Attempting to open shift with serial below pack range
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/opening`,
      {
        packOpenings: [{ packId: pack.pack_id, openingSerial: "0000" }], // Below range
      },
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Should return 400 for invalid serial").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(
      body.error.message,
      "Error message should indicate serial must be within pack range",
    ).toMatch(/serial.*range|range.*serial/i);

    // AND: Attempting with serial above pack range also fails
    const response2 = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/opening`,
      {
        packOpenings: [{ packId: pack.pack_id, openingSerial: "0101" }], // Above range
      },
    );
    expect(response2.status(), "Should return 400 for invalid serial").toBe(
      400,
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DUPLICATE PREVENTION TESTS (P0 - Data Integrity)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.6-API-011: [P0] VALIDATION - should reject duplicate pack opening for same shift (AC #1, #5)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with an OPEN shift and ACTIVE pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-011",
      serial_start: "0001",
      serial_end: "0100",
      status: "ACTIVE",
    });
    const shift = await createOpenShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Opening shift with pack for the first time
    const response1 = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/opening`,
      {
        packOpenings: [{ packId: pack.pack_id, openingSerial: "0050" }],
      },
    );

    // THEN: First request succeeds
    expect(response1.status(), "First request should succeed").toBe(201);

    // WHEN: Attempting to open same pack again for same shift
    const response2 = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/opening`,
      {
        packOpenings: [{ packId: pack.pack_id, openingSerial: "0060" }],
      },
    );

    // THEN: Second request is rejected with 409 Conflict
    expect(response2.status(), "Should return 409 for duplicate").toBe(409);
    const body = await response2.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(
      body.error.code,
      "Error code should indicate duplicate",
    ).toBeDefined();
  });

  test("6.6-API-012: [P0] VALIDATION - should allow adding additional pack openings to existing shift (AC #5)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with an OPEN shift and multiple ACTIVE packs
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    const pack1 = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-012a",
      serial_start: "0001",
      serial_end: "0100",
      status: "ACTIVE",
    });
    const pack2 = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-012b",
      serial_start: "0101",
      serial_end: "0200",
      status: "ACTIVE",
    });
    const shift = await createOpenShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Opening shift with first pack
    const response1 = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/opening`,
      {
        packOpenings: [{ packId: pack1.pack_id, openingSerial: "0050" }],
      },
    );

    // THEN: First request succeeds
    expect(response1.status(), "First request should succeed").toBe(201);

    // WHEN: Adding second pack to same shift
    const response2 = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/opening`,
      {
        packOpenings: [{ packId: pack2.pack_id, openingSerial: "0150" }],
      },
    );

    // THEN: Second request succeeds
    expect(response2.status(), "Second request should succeed").toBe(201);

    // AND: Both openings exist in database
    const openings = await prismaClient.lotteryShiftOpening.findMany({
      where: { shift_id: shift.shift_id },
    });
    expect(openings.length, "Should have 2 openings").toBe(2);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INPUT VALIDATION & EDGE CASES (P0 - Security)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.6-API-013: [P0] ERROR - should return 404 for non-existent shift", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with a valid but non-existent UUID
    const nonExistentShiftId = "123e4567-e89b-12d3-a456-426614174000";

    // WHEN: Attempting to open non-existent shift
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${nonExistentShiftId}/lottery/opening`,
      {
        packOpenings: [{ packId: "test-pack-id", openingSerial: "0050" }],
      },
    );

    // THEN: Request is rejected with 404 Not Found
    expect(response.status(), "Should return 404 for non-existent shift").toBe(
      404,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be SHIFT_NOT_FOUND").toBe(
      "SHIFT_NOT_FOUND",
    );
  });

  test("6.6-API-014: [P0] ERROR - should return 404 for non-existent pack", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with an OPEN shift
    const shift = await createOpenShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const nonExistentPackId = "123e4567-e89b-12d3-a456-426614174000";

    // WHEN: Attempting to open shift with non-existent pack
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/opening`,
      {
        packOpenings: [{ packId: nonExistentPackId, openingSerial: "0050" }],
      },
    );

    // THEN: Request is rejected with 400 Bad Request (validation error)
    expect(response.status(), "Should return 400 for non-existent pack").toBe(
      400,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be VALIDATION_ERROR").toBe(
      "VALIDATION_ERROR",
    );
    expect(
      body.error.details,
      "Error should contain details with errors array",
    ).toHaveProperty("errors");
    expect(
      Array.isArray(body.error.details.errors),
      "Errors should be an array",
    ).toBe(true);
    expect(
      body.error.details.errors.length,
      "Should have at least one error",
    ).toBeGreaterThan(0);
  });

  test("6.6-API-015: [P0] VALIDATION - should reject shift not in OPEN status", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with a shift in CLOSED status
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-015",
      serial_start: "0001",
      serial_end: "0100",
      status: "ACTIVE",
    });
    const shift = await createShift(
      {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        status: "CLOSED", // Not OPEN
      },
      prismaClient,
    );

    // WHEN: Attempting to open shift with lottery packs
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/opening`,
      {
        packOpenings: [{ packId: pack.pack_id, openingSerial: "0050" }],
      },
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(
      response.status(),
      "Should return 400 for invalid shift status",
    ).toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(
      body.error.code,
      "Error code should indicate invalid shift status",
    ).toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - SQL INJECTION (P0 - Critical Security)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.6-API-016: [P0] SECURITY - should prevent SQL injection in packId", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with an OPEN shift
    const shift = await createOpenShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Attempting SQL injection in packId
    const sqlInjectionAttempts = [
      "'; DROP TABLE lottery_shift_openings; --",
      "1' OR '1'='1",
      "'; SELECT * FROM users; --",
      "1' UNION SELECT NULL--",
    ];

    for (const maliciousInput of sqlInjectionAttempts) {
      const response = await storeManagerApiRequest.post(
        `/api/shifts/${shift.shift_id}/lottery/opening`,
        {
          packOpenings: [{ packId: maliciousInput, openingSerial: "0050" }],
        },
      );

      // THEN: Request is rejected (either 400 validation error or 404 not found)
      expect([400, 404], "Should reject SQL injection attempt").toContain(
        response.status(),
      );
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
    }
  });

  test("6.6-API-017: [P0] SECURITY - should prevent SQL injection in shiftId", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // WHEN: Attempting SQL injection in shiftId URL parameter
    const sqlInjectionAttempts = [
      "'; DROP TABLE shifts; --",
      "1' OR '1'='1",
      "123e4567-e89b-12d3-a456-426614174000'; DELETE FROM shifts; --",
    ];

    for (const maliciousInput of sqlInjectionAttempts) {
      const response = await storeManagerApiRequest.post(
        `/api/shifts/${maliciousInput}/lottery/opening`,
        {
          packOpenings: [
            {
              packId: "123e4567-e89b-12d3-a456-426614174000",
              openingSerial: "0050",
            },
          ],
        },
      );

      // THEN: Request is rejected (400 or 404)
      expect([400, 404], "Should reject SQL injection attempt").toContain(
        response.status(),
      );
    }
  });

  test("6.6-API-018: [P0] SECURITY - should prevent SQL injection in openingSerial", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with an OPEN shift and ACTIVE pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-018",
      serial_start: "0001",
      serial_end: "0100",
      status: "ACTIVE",
    });
    const shift = await createOpenShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Attempting SQL injection in openingSerial
    const sqlInjectionAttempts = [
      "'; DROP TABLE lottery_shift_openings; --",
      "0050'; DELETE FROM shifts; --",
      "1' OR '1'='1",
    ];

    for (const maliciousInput of sqlInjectionAttempts) {
      const response = await storeManagerApiRequest.post(
        `/api/shifts/${shift.shift_id}/lottery/opening`,
        {
          packOpenings: [
            { packId: pack.pack_id, openingSerial: maliciousInput },
          ],
        },
      );

      // THEN: Request is rejected with 400 (validation error or range error)
      expect(response.status(), "Should reject SQL injection attempt").toBe(
        400,
      );
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - XSS PREVENTION (P0 - Critical Security)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.6-API-019: [P0] SECURITY - should prevent XSS in openingSerial", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with an OPEN shift and ACTIVE pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-019",
      serial_start: "0001",
      serial_end: "9999",
      status: "ACTIVE",
    });
    const shift = await createOpenShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Attempting XSS in openingSerial
    const xssAttempts = [
      "<script>alert('XSS')</script>",
      "<img src=x onerror=alert('XSS')>",
      "javascript:alert('XSS')",
      "<svg onload=alert('XSS')>",
      "0050<script>alert(1)</script>",
    ];

    for (const maliciousInput of xssAttempts) {
      const response = await storeManagerApiRequest.post(
        `/api/shifts/${shift.shift_id}/lottery/opening`,
        {
          packOpenings: [
            { packId: pack.pack_id, openingSerial: maliciousInput },
          ],
        },
      );

      // THEN: Request is rejected with 400 (validation error or range error)
      // OR if it succeeds, verify response doesn't contain executable script
      if (response.status() === 201) {
        const body = await response.json();
        const responseText = JSON.stringify(body);
        // Verify no script tags in response
        expect(
          responseText,
          "Response should not contain script tags",
        ).not.toContain("<script>");
        expect(
          responseText,
          "Response should not contain onerror",
        ).not.toContain("onerror");
      } else {
        expect(response.status(), "Should reject XSS attempt").toBe(400);
      }
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - AUTHENTICATION BYPASS (P0 - Critical Security)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.6-API-020: [P0] SECURITY - should reject malformed token", async ({
    apiRequest,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated with a malformed token
    const owner = await createUser(prismaClient);
    const company = await createCompany(prismaClient, {
      owner_user_id: owner.user_id,
    });
    const store = await createStore(prismaClient, {
      company_id: company.company_id,
    });
    const shift = await createOpenShift(
      prismaClient,
      store.store_id,
      owner.user_id,
    );

    // WHEN: Attempting request with malformed token
    const response = await apiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/opening`,
      {
        packOpenings: [{ packId: "test-pack-id", openingSerial: "0050" }],
      },
      {
        headers: {
          Authorization: "Bearer invalid.token.format",
        },
      },
    );

    // THEN: Request is rejected with 401 Unauthorized
    expect(response.status(), "Should return 401 for malformed token").toBe(
      401,
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - AUTHORIZATION (P0 - Critical Security)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.6-API-021: [P0] SECURITY - should reject user without SHIFT_OPEN permission when also missing LOTTERY_SHIFT_OPEN", async ({
    regularUserApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a regular user without both permissions
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-021",
      serial_start: "0001",
      serial_end: "0100",
      status: "ACTIVE",
    });
    const shift = await createOpenShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Attempting to open shift without required permissions
    const response = await regularUserApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/opening`,
      {
        packOpenings: [{ packId: pack.pack_id, openingSerial: "0050" }],
      },
    );

    // THEN: Request is rejected with 403 Forbidden
    expect(response.status(), "Should return 403 for missing permissions").toBe(
      403,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error, "Error object should be present").toHaveProperty("code");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INPUT VALIDATION - EDGE CASES (P0 - Security & Data Integrity)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.6-API-022: [P0] VALIDATION - should reject empty packOpenings array", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with an OPEN shift
    const shift = await createOpenShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Attempting to open shift with empty packOpenings array
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/opening`,
      {
        packOpenings: [],
      },
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Should return 400 for empty array").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be VALIDATION_ERROR").toBe(
      "VALIDATION_ERROR",
    );
  });

  test("6.6-API-023: [P0] VALIDATION - should reject missing packOpenings field", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with an OPEN shift
    const shift = await createOpenShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Attempting to open shift without packOpenings field
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/opening`,
      {},
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Should return 400 for missing field").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("6.6-API-024: [P0] VALIDATION - should reject empty openingSerial", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with an OPEN shift and ACTIVE pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-024",
      serial_start: "0001",
      serial_end: "0100",
      status: "ACTIVE",
    });
    const shift = await createOpenShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Attempting to open shift with empty openingSerial
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/opening`,
      {
        packOpenings: [{ packId: pack.pack_id, openingSerial: "" }],
      },
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(response.status(), "Should return 400 for empty openingSerial").toBe(
      400,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("6.6-API-025: [P0] VALIDATION - should reject openingSerial exceeding max length (100 chars)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with an OPEN shift and ACTIVE pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-025",
      serial_start: "0001",
      serial_end: "9999",
      status: "ACTIVE",
    });
    const shift = await createOpenShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Attempting to open shift with openingSerial exceeding 100 characters
    const longSerial = "0".repeat(101); // 101 characters
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/opening`,
      {
        packOpenings: [{ packId: pack.pack_id, openingSerial: longSerial }],
      },
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(
      response.status(),
      "Should return 400 for openingSerial exceeding max length",
    ).toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("6.6-API-026: [P0] VALIDATION - should accept openingSerial at max length boundary (100 chars)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with an OPEN shift and ACTIVE pack with large range
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    const maxSerial = "9".repeat(100); // 100 characters (boundary)
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-026",
      serial_start: "0".repeat(100),
      serial_end: maxSerial,
      status: "ACTIVE",
    });
    const shift = await createOpenShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Opening shift with openingSerial at max length boundary
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/opening`,
      {
        packOpenings: [{ packId: pack.pack_id, openingSerial: maxSerial }],
      },
    );

    // THEN: Request succeeds (boundary value is valid)
    expect(
      response.status(),
      "Should accept openingSerial at max length boundary",
    ).toBe(201);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
  });

  test("6.6-API-027: [P0] VALIDATION - should reject invalid UUID format for packId", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with an OPEN shift
    const shift = await createOpenShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Attempting to open shift with invalid UUID format for packId
    const invalidUuids = [
      "not-a-uuid",
      "123",
      "123e4567-e89b-12d3-a456", // Incomplete UUID
      "123e4567e89b12d3a456426614174000", // Missing hyphens
    ];

    for (const invalidUuid of invalidUuids) {
      const response = await storeManagerApiRequest.post(
        `/api/shifts/${shift.shift_id}/lottery/opening`,
        {
          packOpenings: [{ packId: invalidUuid, openingSerial: "0050" }],
        },
      );

      // THEN: Request is rejected with 400 Bad Request
      expect(
        response.status(),
        "Should return 400 for invalid UUID format",
      ).toBe(400);
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
    }
  });

  test("6.6-API-028: [P0] VALIDATION - should reject invalid UUID format for shiftId", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: I am authenticated as a Store Manager
    // WHEN: Attempting to open shift with invalid UUID format in URL
    const invalidUuids = [
      "not-a-uuid",
      "123",
      "123e4567-e89b-12d3-a456", // Incomplete UUID
    ];

    for (const invalidUuid of invalidUuids) {
      const response = await storeManagerApiRequest.post(
        `/api/shifts/${invalidUuid}/lottery/opening`,
        {
          packOpenings: [
            {
              packId: "123e4567-e89b-12d3-a456-426614174000",
              openingSerial: "0050",
            },
          ],
        },
      );

      // THEN: Request is rejected with 400 Bad Request
      expect(
        response.status(),
        "Should return 400 for invalid UUID format",
      ).toBe(400);
    }
  });

  test("6.6-API-029: [P0] VALIDATION - should handle large array of pack openings", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with an OPEN shift and multiple ACTIVE packs
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    const shift = await createOpenShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // Create 10 packs for same game (user confirmed multiple packs of same game can be opened)
    const packs = [];
    for (let i = 0; i < 10; i++) {
      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeManagerUser.store_id,
        pack_number: `PACK-029-${i}`,
        serial_start: String(i * 1000 + 1).padStart(4, "0"),
        serial_end: String((i + 1) * 1000).padStart(4, "0"),
        status: "ACTIVE",
      });
      packs.push(pack);
    }

    // WHEN: Opening shift with large array of pack openings (10 packs)
    const packOpenings = packs.map((pack, index) => ({
      packId: pack.pack_id,
      openingSerial: String(index * 1000 + 500).padStart(4, "0"),
    }));

    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/opening`,
      {
        packOpenings,
      },
    );

    // THEN: All pack openings are created successfully
    expect(response.status(), "Should return 201 for large array").toBe(201);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.openings.length, "Should have 10 openings").toBe(10);

    // AND: Verify all openings exist in database
    const openings = await prismaClient.lotteryShiftOpening.findMany({
      where: { shift_id: shift.shift_id },
    });
    expect(openings.length, "Should have 10 opening records").toBe(10);
  });

  test("6.6-API-030: [P0] VALIDATION - should reject duplicate packIds in same request", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with an OPEN shift and ACTIVE pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-030",
      serial_start: "0001",
      serial_end: "0100",
      status: "ACTIVE",
    });
    const shift = await createOpenShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Attempting to open shift with duplicate packId in same request
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/opening`,
      {
        packOpenings: [
          { packId: pack.pack_id, openingSerial: "0050" },
          { packId: pack.pack_id, openingSerial: "0060" }, // Same pack, different serial
        ],
      },
    );

    // THEN: Request is rejected with 400 or 409 (duplicate detection)
    expect(
      [400, 409],
      "Should reject duplicate packId in same request",
    ).toContain(response.status());
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA LEAKAGE PREVENTION TESTS (P0 - Security)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.6-API-031: [P0] SECURITY - should not expose sensitive data in response", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with an OPEN shift and ACTIVE pack
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 2.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-031",
      serial_start: "0001",
      serial_end: "0100",
      status: "ACTIVE",
    });
    const shift = await createOpenShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Opening shift with lottery pack
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/opening`,
      {
        packOpenings: [{ packId: pack.pack_id, openingSerial: "0050" }],
      },
    );

    // THEN: Response does not contain sensitive data
    expect(response.status(), "Request should succeed").toBe(201);
    const body = await response.json();
    const responseText = JSON.stringify(body);

    // Verify no password fields
    expect(responseText, "Should not contain password").not.toContain(
      "password",
    );
    // Verify no internal database IDs beyond necessary
    // (opening_id, pack_id, shift_id are necessary for API contract)
    // Verify no user tokens or secrets
    expect(responseText, "Should not contain token").not.toContain("token");
    expect(responseText, "Should not contain secret").not.toContain("secret");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MULTIPLE PACKS SAME GAME TESTS (Business Logic - User Confirmed)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.6-API-032: [P0] BUSINESS - should allow multiple packs of same game to be opened (user confirmed)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with an OPEN shift and multiple ACTIVE packs of same game
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 2.0,
    });
    const pack1 = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-032a",
      serial_start: "0001",
      serial_end: "0100",
      status: "ACTIVE",
    });
    const pack2 = await createLotteryPack(prismaClient, {
      game_id: game.game_id, // Same game
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-032b",
      serial_start: "0101",
      serial_end: "0200",
      status: "ACTIVE",
    });
    const pack3 = await createLotteryPack(prismaClient, {
      game_id: game.game_id, // Same game
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-032c",
      serial_start: "0201",
      serial_end: "0300",
      status: "ACTIVE",
    });
    const shift = await createOpenShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Opening shift with multiple packs of same game
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/opening`,
      {
        packOpenings: [
          { packId: pack1.pack_id, openingSerial: "0050" },
          { packId: pack2.pack_id, openingSerial: "0150" },
          { packId: pack3.pack_id, openingSerial: "0250" },
        ],
      },
    );

    // THEN: All pack openings are created successfully
    expect(
      response.status(),
      "Should return 201 for multiple packs same game",
    ).toBe(201);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.openings.length, "Should have 3 openings").toBe(3);

    // AND: Verify all openings exist in database
    const openings = await prismaClient.lotteryShiftOpening.findMany({
      where: { shift_id: shift.shift_id },
      include: { pack: { include: { game: true } } },
    });
    expect(openings.length, "Should have 3 opening records").toBe(3);

    // AND: Verify all packs belong to same game
    const gameIds = openings.map(
      (o: { pack: { game: { game_id: string } } }) => o.pack.game.game_id,
    );
    const uniqueGameIds = new Set(gameIds);
    expect(uniqueGameIds.size, "All packs should belong to same game").toBe(1);
    expect(Array.from(uniqueGameIds)[0], "Game ID should match").toBe(
      game.game_id,
    );
  });
});
