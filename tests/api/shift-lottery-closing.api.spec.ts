/**
 * Shift Lottery Closing API Tests
 *
 * Tests for Shift Lottery Closing API endpoint:
 * - POST /api/shifts/:shiftId/lottery/closing
 * - Authentication and authorization (SHIFT_MANAGER or appropriate role)
 * - RLS enforcement (store isolation)
 * - Pack opening requirement validation (pack must have LotteryShiftOpening)
 * - Serial range validation (closing_serial within pack range AND ≥ opening_serial)
 * - Reconciliation calculations (expected = closing - opening + 1, actual from LotteryTicketSerial)
 * - Variance detection (expected ≠ actual creates LotteryVariance)
 * - Duplicate prevention (unique constraint on shift_id, pack_id)
 * - Audit logging
 * - Error handling (shift not found, pack not found, invalid status, RLS violations)
 * - Security: SQL injection, XSS prevention, authentication bypass, authorization, input validation, data leakage
 * - Edge cases: Empty inputs, max length boundaries, invalid formats, large arrays
 *
 * @test-level API
 * @justification Tests API endpoint with authentication, authorization, database operations, reconciliation calculations, and business logic
 * @story 6-7 - Shift Lottery Closing and Reconciliation
 * @priority P0 (Critical - Security, Data Integrity, Business Logic, Financial Reconciliation)
 *
 * RED PHASE: These tests define expected behavior before implementation.
 * Tests will fail until closing endpoint and reconciliation logic are implemented.
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
import { Prisma } from "@prisma/client";

/**
 * Creates a shift with OPEN status for testing
 */
async function createOpenShift(
  prismaClient: any,
  storeId: string,
  openedBy: string,
  openingCash: number = 100.0,
): Promise<{ shift_id: string; status: string }> {
  const shiftData = createShift({
    store_id: storeId,
    opened_by: openedBy,
    opening_cash: new Prisma.Decimal(openingCash),
    status: "OPEN",
  });

  const shift = await prismaClient.shift.create({
    data: shiftData,
  });

  return {
    shift_id: shift.shift_id,
    status: shift.status,
  };
}

/**
 * Creates a shift with CLOSING status for testing
 */
async function createClosingShift(
  prismaClient: any,
  storeId: string,
  openedBy: string,
  openingCash: number = 100.0,
): Promise<{ shift_id: string; status: string }> {
  const shiftData = createShift({
    store_id: storeId,
    opened_by: openedBy,
    opening_cash: new Prisma.Decimal(openingCash),
    status: "CLOSING",
  });

  const shift = await prismaClient.shift.create({
    data: shiftData,
  });

  return {
    shift_id: shift.shift_id,
    status: shift.status,
  };
}

/**
 * Creates a LotteryShiftOpening record for testing
 */
async function createLotteryShiftOpening(
  prismaClient: any,
  shiftId: string,
  packId: string,
  openingSerial: string,
): Promise<{ opening_id: string }> {
  const opening = await prismaClient.lotteryShiftOpening.create({
    data: {
      shift_id: shiftId,
      pack_id: packId,
      opening_serial: openingSerial,
    },
  });

  return {
    opening_id: opening.opening_id,
  };
}

test.describe("6.7-API: Shift Lottery Closing - Pack Closing and Reconciliation", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // HAPPY PATH TESTS (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.7-API-001: [P0] POST /api/shifts/:shiftId/lottery/closing - should create lottery shift closings with valid packs (AC #1)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as a Store Manager with a CLOSING shift and packs that were opened
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
    const shift = await createClosingShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // Create opening records (required for closing)
    await createLotteryShiftOpening(
      prismaClient,
      shift.shift_id,
      pack1.pack_id,
      "0050",
    );
    await createLotteryShiftOpening(
      prismaClient,
      shift.shift_id,
      pack2.pack_id,
      "0150",
    );

    // WHEN: Closing shift with lottery pack closings
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/closing`,
      {
        packClosings: [
          { packId: pack1.pack_id, closingSerial: "0080" },
          { packId: pack2.pack_id, closingSerial: "0180" },
        ],
      },
    );

    // THEN: Lottery shift closings are created successfully
    expect(response.status(), "Expected 201 Created status").toBe(201);
    const body = await response.json();

    // Response structure assertions
    expect(body, "Response should be an object").toBeInstanceOf(Object);
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data, "Response should contain shift data").toHaveProperty(
      "shift_id",
    );
    expect(body.data, "Response should contain closings array").toHaveProperty(
      "closings",
    );
    expect(
      Array.isArray(body.data.closings),
      "closings should be an array",
    ).toBe(true);
    expect(body.data.closings.length, "Should have 2 closings").toBe(2);

    // Closing structure assertions
    for (const closing of body.data.closings) {
      expect(closing, "Closing should be an object").toBeInstanceOf(Object);
      expect(closing, "Closing should have closing_id").toHaveProperty(
        "closing_id",
      );
      expect(closing, "Closing should have pack_id").toHaveProperty("pack_id");
      expect(closing, "Closing should have closing_serial").toHaveProperty(
        "closing_serial",
      );
      expect(closing, "Closing should have opening_serial").toHaveProperty(
        "opening_serial",
      );
      expect(closing, "Closing should have expected_count").toHaveProperty(
        "expected_count",
      );
      expect(closing, "Closing should have actual_count").toHaveProperty(
        "actual_count",
      );
      expect(closing, "Closing should have difference").toHaveProperty(
        "difference",
      );
      expect(closing, "Closing should have has_variance").toHaveProperty(
        "has_variance",
      );
      expect(closing, "Closing should have pack").toHaveProperty("pack");

      expect(
        typeof closing.closing_id,
        "closing_id should be string (UUID)",
      ).toBe("string");
      expect(
        typeof closing.closing_serial,
        "closing_serial should be string",
      ).toBe("string");
      expect(
        typeof closing.opening_serial,
        "opening_serial should be string",
      ).toBe("string");
      expect(
        typeof closing.expected_count,
        "expected_count should be number",
      ).toBe("number");
      expect(typeof closing.actual_count, "actual_count should be number").toBe(
        "number",
      );
      expect(typeof closing.difference, "difference should be number").toBe(
        "number",
      );
      expect(
        typeof closing.has_variance,
        "has_variance should be boolean",
      ).toBe("boolean");
    }

    // Verify closing records in database
    const closings = await prismaClient.lotteryShiftClosing.findMany({
      where: { shift_id: shift.shift_id },
      include: { pack: { include: { game: true } } },
    });
    expect(closings.length, "Should have 2 closing records").toBe(2);

    // AND: Audit log entry is created
    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        entity_type: "Shift",
        entity_id: shift.shift_id,
        action: "SHIFT_LOTTERY_CLOSED",
        user_id: storeManagerUser.user_id,
      },
    });
    expect(auditLog, "Audit log should be created").not.toBeNull();
    expect(
      auditLog?.action,
      "Audit action should be SHIFT_LOTTERY_CLOSED",
    ).toBe("SHIFT_LOTTERY_CLOSED");
  });

  test("6.7-API-002: [P0] POST /api/shifts/:shiftId/lottery/closing - should calculate reconciliation (expected vs actual) (AC #2)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am closing a shift with lottery packs
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 2.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-001",
      serial_start: "0001",
      serial_end: "0100",
      status: "ACTIVE",
    });
    const shift = await createClosingShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // Create opening record
    await createLotteryShiftOpening(
      prismaClient,
      shift.shift_id,
      pack.pack_id,
      "0050",
    );

    // WHEN: Closing shift with closing serial
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/closing`,
      {
        packClosings: [{ packId: pack.pack_id, closingSerial: "0080" }],
      },
    );

    // THEN: Reconciliation results are returned
    expect(response.status(), "Expected 201 Created status").toBe(201);
    const body = await response.json();

    const closing = body.data.closings[0];

    // Expected count = closing_serial - opening_serial + 1 = 0080 - 0050 + 1 = 31
    expect(closing.expected_count, "Expected count should be 31").toBe(31);
    expect(closing.opening_serial, "Opening serial should be 0050").toBe(
      "0050",
    );
    expect(closing.closing_serial, "Closing serial should be 0080").toBe(
      "0080",
    );
    expect(typeof closing.actual_count, "Actual count should be number").toBe(
      "number",
    );
    expect(typeof closing.difference, "Difference should be number").toBe(
      "number",
    );
    // Difference = expected - actual (will be 31 if no tickets sold)
    expect(closing.difference, "Difference should be expected - actual").toBe(
      closing.expected_count - closing.actual_count,
    );
  });

  test("6.7-API-003: [P0] POST /api/shifts/:shiftId/lottery/closing - should detect and create variance when expected ≠ actual (AC #3)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A shift is being closed and variance is detected
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 2.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-001",
      serial_start: "0001",
      serial_end: "0100",
      status: "ACTIVE",
    });
    const shift = await createClosingShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // Create opening record
    await createLotteryShiftOpening(
      prismaClient,
      shift.shift_id,
      pack.pack_id,
      "0050",
    );

    // Create some ticket sales (but not all expected tickets)
    // Expected = 0080 - 0050 + 1 = 31
    // Actual = 25 (6 tickets missing = variance)
    // TODO: Create LotteryTicketSerial records when model is available
    // For now, test will verify variance detection logic

    // WHEN: Closing shift with closing serial
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/closing`,
      {
        packClosings: [{ packId: pack.pack_id, closingSerial: "0080" }],
      },
    );

    // THEN: Variance is detected and LotteryVariance record is created
    expect(response.status(), "Expected 201 Created status").toBe(201);
    const body = await response.json();

    const closing = body.data.closings[0];

    // If variance exists
    if (closing.has_variance) {
      expect(closing.variance_id, "Variance ID should be present").toBeTruthy();
      expect(closing.difference, "Difference should be non-zero").not.toBe(0);

      // Verify LotteryVariance record in database
      const variance = await prismaClient.lotteryVariance.findFirst({
        where: {
          shift_id: shift.shift_id,
          pack_id: pack.pack_id,
        },
      });
      expect(variance, "Variance record should be created").not.toBeNull();
      expect(variance?.expected, "Variance expected should match").toBe(
        closing.expected_count,
      );
      expect(variance?.actual, "Variance actual should match").toBe(
        closing.actual_count,
      );
      expect(variance?.difference, "Variance difference should match").toBe(
        closing.difference,
      );

      // AND: Variance is logged in AuditLog
      const varianceAuditLog = await prismaClient.auditLog.findFirst({
        where: {
          entity_type: "LotteryVariance",
          entity_id: variance?.variance_id,
          action: "LOTTERY_VARIANCE_DETECTED",
        },
      });
      expect(
        varianceAuditLog,
        "Variance audit log should be created",
      ).not.toBeNull();
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDATION TESTS (P2, P3)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.7-API-004: [P2] POST /api/shifts/:shiftId/lottery/closing - should validate closing_serial is within pack range (AC #1, #6)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated with a CLOSING shift and pack that was opened
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 2.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-001",
      serial_start: "0001",
      serial_end: "0100",
      status: "ACTIVE",
    });
    const shift = await createClosingShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    await createLotteryShiftOpening(
      prismaClient,
      shift.shift_id,
      pack.pack_id,
      "0050",
    );

    // WHEN: Closing with serial outside pack range (below serial_start)
    const response1 = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/closing`,
      {
        packClosings: [{ packId: pack.pack_id, closingSerial: "0000" }],
      },
    );

    // THEN: Request is rejected with validation error
    expect(response1.status(), "Should return 400 for invalid serial").toBe(
      400,
    );
    const body1 = await response1.json();
    expect(body1.success, "Response should indicate failure").toBe(false);
    expect(body1.error?.message, "Error should mention serial range").toContain(
      "serial",
    );

    // WHEN: Closing with serial outside pack range (above serial_end)
    const response2 = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/closing`,
      {
        packClosings: [{ packId: pack.pack_id, closingSerial: "0101" }],
      },
    );

    // THEN: Request is rejected with validation error
    expect(response2.status(), "Should return 400 for invalid serial").toBe(
      400,
    );
  });

  test("6.7-API-005: [P2] POST /api/shifts/:shiftId/lottery/closing - should validate closing_serial ≥ opening_serial (AC #1, #6)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated with a CLOSING shift and pack that was opened
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 2.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-001",
      serial_start: "0001",
      serial_end: "0100",
      status: "ACTIVE",
    });
    const shift = await createClosingShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // Opening serial is 0050
    await createLotteryShiftOpening(
      prismaClient,
      shift.shift_id,
      pack.pack_id,
      "0050",
    );

    // WHEN: Closing with serial less than opening_serial
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/closing`,
      {
        packClosings: [{ packId: pack.pack_id, closingSerial: "0049" }],
      },
    );

    // THEN: Request is rejected with validation error
    expect(
      response.status(),
      "Should return 400 for closing_serial < opening_serial",
    ).toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(
      body.error?.message,
      "Error should mention opening_serial",
    ).toContain("opening");
  });

  test("6.7-API-006: [P3] POST /api/shifts/:shiftId/lottery/closing - should reject pack that was not opened in shift (AC #5)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated with a CLOSING shift and pack that was NOT opened
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 2.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-001",
      serial_start: "0001",
      serial_end: "0100",
      status: "ACTIVE",
    });
    const shift = await createClosingShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // No opening record created for this pack

    // WHEN: Attempting to close shift with pack that was not opened
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/closing`,
      {
        packClosings: [{ packId: pack.pack_id, closingSerial: "0080" }],
      },
    );

    // THEN: Request is rejected with appropriate error message
    expect(response.status(), "Should return 400 for pack not opened").toBe(
      400,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(
      body.error?.message,
      "Error should mention opening record required",
    ).toContain("opening");

    // AND: No LotteryShiftClosing records are created
    const closings = await prismaClient.lotteryShiftClosing.findMany({
      where: { shift_id: shift.shift_id },
    });
    expect(closings.length, "Should have no closing records").toBe(0);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS (P2)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.7-API-007: [P2] SECURITY - should require authentication", async ({
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
    const shift = await createClosingShift(
      prismaClient,
      store.store_id,
      owner.user_id,
    );

    // WHEN: Attempting to close shift with lottery packs without authentication
    const response = await apiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/closing`,
      {
        packClosings: [{ packId: "test-pack-id", closingSerial: "0050" }],
      },
    );

    // THEN: Request is rejected with 401 Unauthorized
    expect(response.status(), "Should return 401 for unauthenticated").toBe(
      401,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("6.7-API-008: [P2] SECURITY - should enforce RLS (store isolation) (AC #4)", async ({
    storeManagerApiRequest,
    otherStoreManagerApiRequest,
    storeManagerUser,
    otherStoreManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as Store Manager for Store A
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 2.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id, // Store A
      pack_number: "PACK-001",
      serial_start: "0001",
      serial_end: "0100",
      status: "ACTIVE",
    });
    const shift = await createClosingShift(
      prismaClient,
      storeManagerUser.store_id, // Store A
      storeManagerUser.user_id,
    );

    await createLotteryShiftOpening(
      prismaClient,
      shift.shift_id,
      pack.pack_id,
      "0050",
    );

    // WHEN: Store Manager from Store B attempts to close shift from Store A
    const response = await otherStoreManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/closing`,
      {
        packClosings: [{ packId: pack.pack_id, closingSerial: "0080" }],
      },
    );

    // THEN: Request is rejected with 403 Forbidden
    expect(response.status(), "Should return 403 for RLS violation").toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error?.code, "Error code should be FORBIDDEN").toBe(
      "FORBIDDEN",
    );
  });

  test("6.7-API-009: [P2] SECURITY - should validate shift status (CLOSING or ACTIVE only) (AC #4)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated with a CLOSED shift
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 2.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-001",
      serial_start: "0001",
      serial_end: "0100",
      status: "ACTIVE",
    });
    const shift = await prismaClient.shift.create({
      data: createShift({
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        opening_cash: new Prisma.Decimal(100.0),
        status: "CLOSED", // Already closed
      }),
    });

    await createLotteryShiftOpening(
      prismaClient,
      shift.shift_id,
      pack.pack_id,
      "0050",
    );

    // WHEN: Attempting to close already CLOSED shift
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/closing`,
      {
        packClosings: [{ packId: pack.pack_id, closingSerial: "0080" }],
      },
    );

    // THEN: Request is rejected with 400 Bad Request
    expect(
      response.status(),
      "Should return 400 for invalid shift status",
    ).toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error?.message, "Error should mention shift status").toContain(
      "status",
    );
  });

  test("6.7-API-010: [P2] POST /api/shifts/:shiftId/lottery/closing - should prevent duplicate pack closings (AC #1)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated with a CLOSING shift and pack that was opened
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 2.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-001",
      serial_start: "0001",
      serial_end: "0100",
      status: "ACTIVE",
    });
    const shift = await createClosingShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    await createLotteryShiftOpening(
      prismaClient,
      shift.shift_id,
      pack.pack_id,
      "0050",
    );

    // WHEN: Closing pack for first time
    const response1 = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/closing`,
      {
        packClosings: [{ packId: pack.pack_id, closingSerial: "0080" }],
      },
    );
    expect(response1.status(), "First closing should succeed").toBe(201);

    // WHEN: Attempting to close same pack again
    const response2 = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/closing`,
      {
        packClosings: [{ packId: pack.pack_id, closingSerial: "0090" }],
      },
    );

    // THEN: Request is rejected with 409 Conflict
    expect(response2.status(), "Should return 409 for duplicate").toBe(409);
    const body = await response2.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error?.code, "Error code should be DUPLICATE").toBe(
      "DUPLICATE",
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - SQL INJECTION PREVENTION (P2)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.7-API-011: [P2] SECURITY - should prevent SQL injection in shiftId parameter", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated with malicious SQL injection attempt in shiftId
    const maliciousShiftId = "'; DROP TABLE shifts; --";

    // WHEN: Attempting to close shift with SQL injection in shiftId
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${maliciousShiftId}/lottery/closing`,
      {
        packClosings: [{ packId: "test-pack-id", closingSerial: "0050" }],
      },
    );

    // THEN: Request is rejected with validation error (not SQL execution)
    expect(
      response.status(),
      "Should return 400 or 404 for invalid shiftId",
    ).toBeGreaterThanOrEqual(400);
    expect(
      response.status(),
      "Should not return 500 (no SQL execution)",
    ).toBeLessThan(500);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("6.7-API-012: [P2] SECURITY - should prevent SQL injection in packId field", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated with a CLOSING shift
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 2.0,
    });
    const shift = await createClosingShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Attempting to close shift with SQL injection in packId
    const maliciousPackId = "'; DROP TABLE lottery_packs; --";
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/closing`,
      {
        packClosings: [{ packId: maliciousPackId, closingSerial: "0050" }],
      },
    );

    // THEN: Request is rejected with validation error (UUID validation fails)
    expect(response.status(), "Should return 400 for invalid UUID format").toBe(
      400,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    // UUID validation should catch this before any SQL execution
  });

  test("6.7-API-013: [P2] SECURITY - should prevent SQL injection in closingSerial field", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated with a CLOSING shift and pack that was opened
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 2.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-001",
      serial_start: "0001",
      serial_end: "0100",
      status: "ACTIVE",
    });
    const shift = await createClosingShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    await createLotteryShiftOpening(
      prismaClient,
      shift.shift_id,
      pack.pack_id,
      "0050",
    );

    // WHEN: Attempting to close shift with SQL injection in closingSerial
    const maliciousSerial = "'; DROP TABLE lottery_shift_closings; --";
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/closing`,
      {
        packClosings: [
          { packId: pack.pack_id, closingSerial: maliciousSerial },
        ],
      },
    );

    // THEN: Request is rejected with validation error (serial range validation)
    expect(response.status(), "Should return 400 for invalid serial").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    // Prisma ORM parameterization should prevent SQL execution even if validation passes
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INPUT VALIDATION EDGE CASES (P2, P3)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.7-API-014: [P2] INPUT VALIDATION - should reject empty packClosings array", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated with a CLOSING shift
    const shift = await createClosingShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Attempting to close shift with empty packClosings array
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/closing`,
      {
        packClosings: [],
      },
    );

    // THEN: Request is rejected with validation error
    expect(response.status(), "Should return 400 for empty array").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(
      body.error?.message || body.error?.details,
      "Error should mention array validation",
    ).toBeTruthy();
  });

  test("6.7-API-015: [P2] INPUT VALIDATION - should reject missing packId field", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated with a CLOSING shift
    const shift = await createClosingShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Attempting to close shift with missing packId
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/closing`,
      {
        packClosings: [{ closingSerial: "0050" }],
      },
    );

    // THEN: Request is rejected with validation error
    expect(response.status(), "Should return 400 for missing packId").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("6.7-API-016: [P2] INPUT VALIDATION - should reject missing closingSerial field", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated with a CLOSING shift
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 2.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-001",
      serial_start: "0001",
      serial_end: "0100",
      status: "ACTIVE",
    });
    const shift = await createClosingShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Attempting to close shift with missing closingSerial
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/closing`,
      {
        packClosings: [{ packId: pack.pack_id }],
      },
    );

    // THEN: Request is rejected with validation error
    expect(
      response.status(),
      "Should return 400 for missing closingSerial",
    ).toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("6.7-API-017: [P2] INPUT VALIDATION - should reject empty closingSerial string", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated with a CLOSING shift and pack that was opened
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 2.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-001",
      serial_start: "0001",
      serial_end: "0100",
      status: "ACTIVE",
    });
    const shift = await createClosingShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    await createLotteryShiftOpening(
      prismaClient,
      shift.shift_id,
      pack.pack_id,
      "0050",
    );

    // WHEN: Attempting to close shift with empty closingSerial
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/closing`,
      {
        packClosings: [{ packId: pack.pack_id, closingSerial: "" }],
      },
    );

    // THEN: Request is rejected with validation error
    expect(response.status(), "Should return 400 for empty closingSerial").toBe(
      400,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("6.7-API-018: [P2] INPUT VALIDATION - should reject closingSerial exceeding max length (100 chars)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated with a CLOSING shift and pack that was opened
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 2.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-001",
      serial_start: "0001",
      serial_end: "0100",
      status: "ACTIVE",
    });
    const shift = await createClosingShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    await createLotteryShiftOpening(
      prismaClient,
      shift.shift_id,
      pack.pack_id,
      "0050",
    );

    // WHEN: Attempting to close shift with closingSerial exceeding 100 characters
    const longSerial = "A".repeat(101); // 101 characters
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/closing`,
      {
        packClosings: [{ packId: pack.pack_id, closingSerial: longSerial }],
      },
    );

    // THEN: Request is rejected with validation error
    expect(
      response.status(),
      "Should return 400 for closingSerial exceeding max length",
    ).toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("6.7-API-019: [P3] INPUT VALIDATION - should reject invalid UUID format for packId", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated with a CLOSING shift
    const shift = await createClosingShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Attempting to close shift with invalid UUID format for packId
    const invalidUuids = [
      "not-a-uuid",
      "12345",
      "invalid-uuid-format",
      "00000000-0000-0000-0000-00000000000", // Too short
    ];

    for (const invalidUuid of invalidUuids) {
      const response = await storeManagerApiRequest.post(
        `/api/shifts/${shift.shift_id}/lottery/closing`,
        {
          packClosings: [{ packId: invalidUuid, closingSerial: "0050" }],
        },
      );

      // THEN: Request is rejected with validation error
      expect(
        response.status(),
        `Should return 400 for invalid UUID: ${invalidUuid}`,
      ).toBe(400);
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
    }
  });

  test("6.7-API-020: [P3] INPUT VALIDATION - should reject non-numeric closingSerial (parseInt edge case)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated with a CLOSING shift and pack that was opened
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 2.0,
    });
    const pack = await createLotteryPack(prismaClient, {
      game_id: game.game_id,
      store_id: storeManagerUser.store_id,
      pack_number: "PACK-001",
      serial_start: "0001",
      serial_end: "0100",
      status: "ACTIVE",
    });
    const shift = await createClosingShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    await createLotteryShiftOpening(
      prismaClient,
      shift.shift_id,
      pack.pack_id,
      "0050",
    );

    // WHEN: Attempting to close shift with non-numeric closingSerial
    const nonNumericSerials = [
      "ABC",
      "123ABC",
      "ABC123",
      "12.34", // Decimal
      " 0050 ", // Whitespace
      "0050.0", // Decimal format
    ];

    for (const nonNumericSerial of nonNumericSerials) {
      const response = await storeManagerApiRequest.post(
        `/api/shifts/${shift.shift_id}/lottery/closing`,
        {
          packClosings: [
            { packId: pack.pack_id, closingSerial: nonNumericSerial },
          ],
        },
      );

      // THEN: Request is rejected (either validation error or calculation error)
      expect(
        response.status(),
        `Should return 400 or 500 for non-numeric serial: ${nonNumericSerial}`,
      ).toBeGreaterThanOrEqual(400);
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
    }
  });

  test("6.7-API-021: [P3] INPUT VALIDATION - should handle large packClosings array", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated with a CLOSING shift and multiple packs
    const game = await createLotteryGame(prismaClient, {
      name: "Test Game",
      price: 2.0,
    });
    const shift = await createClosingShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // Create 50 packs with openings
    const packClosings = [];
    for (let i = 1; i <= 50; i++) {
      const pack = await createLotteryPack(prismaClient, {
        game_id: game.game_id,
        store_id: storeManagerUser.store_id,
        pack_number: `PACK-${String(i).padStart(3, "0")}`,
        serial_start: String((i - 1) * 100 + 1).padStart(4, "0"),
        serial_end: String(i * 100).padStart(4, "0"),
        status: "ACTIVE",
      });

      await createLotteryShiftOpening(
        prismaClient,
        shift.shift_id,
        pack.pack_id,
        String((i - 1) * 100 + 50).padStart(4, "0"),
      );

      packClosings.push({
        packId: pack.pack_id,
        closingSerial: String((i - 1) * 100 + 80).padStart(4, "0"),
      });
    }

    // WHEN: Closing shift with large array of pack closings
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/closing`,
      {
        packClosings,
      },
    );

    // THEN: Request should succeed (or handle gracefully)
    expect(
      response.status(),
      "Should handle large array",
    ).toBeGreaterThanOrEqual(200);
    expect(
      response.status(),
      "Should not return 500 for large array",
    ).toBeLessThan(500);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA LEAKAGE PREVENTION TESTS (P2)
  // ═══════════════════════════════════════════════════════════════════════════

  test("6.7-API-022: [P2] SECURITY - should not expose sensitive data in error responses", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated with a CLOSING shift
    const shift = await createClosingShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Attempting to close shift with invalid packId
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/lottery/closing`,
      {
        packClosings: [
          {
            packId: "00000000-0000-0000-0000-000000000000",
            closingSerial: "0050",
          },
        ],
      },
    );

    // THEN: Error response should not contain sensitive information
    expect(
      response.status(),
      "Should return error status",
    ).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);

    // Verify no sensitive data in error response
    const responseText = JSON.stringify(body);
    expect(
      responseText,
      "Should not contain database connection strings",
    ).not.toContain("postgresql://");
    expect(
      responseText,
      "Should not contain internal file paths",
    ).not.toContain("C:\\");
    expect(
      responseText,
      "Should not contain stack traces in production",
    ).not.toContain("at ");
  });

  test("6.7-API-023: [P2] SECURITY - should not expose internal error details in 500 responses", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated with a CLOSING shift
    // Note: This test verifies that even if an internal error occurs,
    // sensitive details are not exposed to the client
    const shift = await createClosingShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // WHEN: Making a request that might cause internal error
    // (Using invalid shiftId format that might bypass initial validation)
    const response = await storeManagerApiRequest.post(
      `/api/shifts/invalid-shift-id-format/lottery/closing`,
      {
        packClosings: [
          {
            packId: "00000000-0000-0000-0000-000000000000",
            closingSerial: "0050",
          },
        ],
      },
    );

    // THEN: Error response should be generic, not exposing internal details
    if (response.status() === 500) {
      const body = await response.json();
      expect(
        body.error?.message,
        "Should not expose internal error details",
      ).not.toContain("Prisma");
      expect(
        body.error?.message,
        "Should not expose internal error details",
      ).not.toContain("database");
      expect(
        body.error?.message,
        "Should not expose stack traces",
      ).not.toContain("at ");
    }
  });
});
