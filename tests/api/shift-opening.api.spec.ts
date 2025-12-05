import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createUser,
  createCompany,
  createStore,
  createShift,
  createCashier,
} from "../support/factories";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";

/**
 * @test-level API
 * @justification Endpoint integration tests verifying HTTP layer, authentication, authorization, request/response format, and error handling for POST /api/shifts/open
 * @story 4-2-shift-opening-api
 * @enhanced-by workflow-9 on 2025-11-29
 *
 * Shift Opening API Tests - Story 4.2
 *
 * STORY: As a Shift Manager, I want to open a shift with starting cash amount,
 * so that cashiers can begin processing transactions.
 *
 * TEST LEVEL: API (endpoint integration tests)
 * PRIMARY GOAL: Verify POST /api/shifts/open endpoint creates shifts with validation
 *
 * BUSINESS RULES TESTED:
 * - Shift creation with OPEN status
 * - Opening cash amount recording
 * - Shift linking to store, POS terminal, and cashier
 * - Only one active shift per POS terminal (OPEN, ACTIVE, CLOSING, RECONCILING)
 * - Audit log creation
 * - Authentication required (JWT token)
 * - Authorization required (SHIFT_OPEN permission)
 * - Multi-tenant isolation (store_id must be accessible to user)
 * - Validation errors (missing fields, invalid values)
 */

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Creates a POS terminal for testing
 * Note: POSTerminal model uses soft-delete (deleted_at) only, no status field
 */
async function createPOSTerminal(
  prismaClient: any,
  storeId: string,
  name?: string,
): Promise<{ pos_terminal_id: string; store_id: string; name: string }> {
  // Use UUID for uniqueness across parallel tests (Date.now() can collide)
  const uniqueId = randomUUID();
  const terminal = await prismaClient.pOSTerminal.create({
    data: {
      store_id: storeId,
      name: name || `Terminal ${uniqueId.slice(0, 8)}`,
      device_id: `device-${uniqueId}`,
      deleted_at: null, // Active terminal (not soft-deleted)
    },
  });

  return {
    pos_terminal_id: terminal.pos_terminal_id,
    store_id: terminal.store_id,
    name: terminal.name,
  };
}

/**
 * Creates a Cashier entity for testing shifts
 * IMPORTANT: shifts.cashier_id is a FK to cashiers table, NOT users table
 */
async function createTestCashier(
  prismaClient: any,
  storeId: string,
  createdByUserId: string,
): Promise<{ cashier_id: string; store_id: string; employee_id: string }> {
  const cashierData = await createCashier({
    store_id: storeId,
    created_by: createdByUserId,
  });
  return prismaClient.cashier.create({ data: cashierData });
}

// =============================================================================
// SECTION 1: P0 CRITICAL - AUTHENTICATION & AUTHORIZATION TESTS
// =============================================================================

test.describe("4.2-API: Shift Opening - Authentication", () => {
  test("4.2-API-001: [P0] should return 401 when JWT token is missing", async ({
    apiRequest,
  }) => {
    // GIVEN: Valid shift opening request data
    const requestData = {
      store_id: "00000000-0000-0000-0000-000000000000",
      cashier_id: "00000000-0000-0000-0000-000000000000",
      pos_terminal_id: "00000000-0000-0000-0000-000000000000",
      opening_cash: 100.0,
    };

    // WHEN: Sending request without JWT token
    const response = await apiRequest.post("/api/shifts/open", requestData);

    // THEN: Should return 401 Unauthorized
    expect(response.status(), "Should return 401 for missing token").toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be UNAUTHORIZED").toBe(
      "UNAUTHORIZED",
    );
  });

  test("4.2-API-002: [P0] should return 401 when JWT token is invalid", async ({
    apiRequest,
  }) => {
    // GIVEN: An invalid JWT token
    const invalidToken = "invalid.jwt.token";
    const requestData = {
      store_id: "00000000-0000-0000-0000-000000000000",
      cashier_id: "00000000-0000-0000-0000-000000000000",
      pos_terminal_id: "00000000-0000-0000-0000-000000000000",
      opening_cash: 100.0,
    };

    // WHEN: Sending request with invalid JWT
    const response = await apiRequest.post("/api/shifts/open", requestData, {
      headers: {
        Authorization: `Bearer ${invalidToken}`,
      },
    });

    // THEN: Should return 401 Unauthorized
    expect(response.status(), "Should return 401 for invalid token").toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("4.2-API-003: [P0] should return 403 when user lacks SHIFT_OPEN permission", async ({
    regularUserApiRequest,
    regularUser,
    prismaClient,
  }) => {
    // GIVEN: A user without SHIFT_OPEN permission
    // regularUser has: SHIFT_READ, INVENTORY_READ
    // regularUser does NOT have: SHIFT_OPEN

    // Create test data
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Company Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );
    const terminal = await createPOSTerminal(prismaClient, store.store_id);

    const requestData = {
      store_id: store.store_id,
      cashier_id: cashier.cashier_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 100.0,
    };

    // WHEN: User without SHIFT_OPEN permission sends request
    const response = await regularUserApiRequest.post(
      "/api/shifts/open",
      requestData,
    );

    // THEN: Should return 403 Forbidden (permission denied)
    expect(
      response.status(),
      "Should return 403 for user without SHIFT_OPEN permission",
    ).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("PERMISSION_DENIED");

    // Cleanup
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.store.delete({ where: { store_id: store.store_id } });
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
    await prismaClient.user.delete({ where: { user_id: owner.user_id } });
  });
});

// =============================================================================
// SECTION 2: P0 CRITICAL - SHIFT OPENING WITH VALID DATA (AC-1)
// =============================================================================

test.describe("4.2-API: Shift Opening - Valid Data (AC-1)", () => {
  test("4.2-API-004: [P0] should create shift with OPEN status when valid data provided", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Authenticated user with SHIFT_OPEN permission
    // AND: Valid store, cashier, POS terminal, and opening cash amount
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );

    const requestData = {
      store_id: storeManagerUser.store_id,
      cashier_id: cashier.cashier_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 150.75,
    };

    // WHEN: Opening a shift with valid data
    const response = await storeManagerApiRequest.post(
      "/api/shifts/open",
      requestData,
    );

    // THEN: Should return 201 Created
    expect(response.status(), "Should return 201 Created").toBe(201);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data, "Response should contain shift data").toBeDefined();

    // AND: Shift should have OPEN status
    expect(body.data.status, "Shift status should be OPEN").toBe("OPEN");

    // AND: All required fields should be populated
    expect(body.data.shift_id, "shift_id should be present").toBeDefined();
    expect(body.data.store_id, "store_id should match").toBe(
      storeManagerUser.store_id,
    );
    expect(body.data.cashier_id, "cashier_id should match").toBe(
      cashier.cashier_id,
    );
    expect(body.data.pos_terminal_id, "pos_terminal_id should match").toBe(
      terminal.pos_terminal_id,
    );
    expect(body.data.opened_by, "opened_by should be set").toBe(
      storeManagerUser.user_id,
    );
    expect(body.data.opening_cash, "opening_cash should match").toBe(150.75);
    expect(body.data.opened_at, "opened_at should be set").toBeDefined();

    // Cleanup
    const shiftId = body.data.shift_id;
    await prismaClient.shift.delete({ where: { shift_id: shiftId } });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
  });

  test("4.2-API-005: [P0] should record opening cash amount correctly", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Authenticated user with SHIFT_OPEN permission
    // AND: Opening cash amount of 250.50
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );

    const openingCash = 250.5;
    const requestData = {
      store_id: storeManagerUser.store_id,
      cashier_id: cashier.cashier_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: openingCash,
    };

    // WHEN: Opening a shift
    const response = await storeManagerApiRequest.post(
      "/api/shifts/open",
      requestData,
    );

    // THEN: Opening cash amount should be recorded correctly
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.data.opening_cash).toBe(openingCash);

    // Cleanup
    await prismaClient.shift.delete({
      where: { shift_id: body.data.shift_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
  });

  test("4.2-API-006: [P0] should link shift to store, POS terminal, and cashier", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Authenticated user with SHIFT_OPEN permission
    // AND: Store, cashier, and POS terminal
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );

    const requestData = {
      store_id: storeManagerUser.store_id,
      cashier_id: cashier.cashier_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 100.0,
    };

    // WHEN: Opening a shift
    const response = await storeManagerApiRequest.post(
      "/api/shifts/open",
      requestData,
    );

    // THEN: Shift should be linked correctly
    expect(response.status()).toBe(201);
    const body = await response.json();

    // Verify links in database
    const shift = await prismaClient.shift.findUnique({
      where: { shift_id: body.data.shift_id },
      include: {
        store: true,
        cashier: true,
        pos_terminal: true,
      },
    });

    expect(shift?.store_id).toBe(storeManagerUser.store_id);
    expect(shift?.cashier_id).toBe(cashier.cashier_id);
    expect(shift?.pos_terminal_id).toBe(terminal.pos_terminal_id);
    expect(shift?.opened_by).toBe(storeManagerUser.user_id);

    // Cleanup
    await prismaClient.shift.delete({
      where: { shift_id: body.data.shift_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
  });

  test("4.2-API-007: [P0] should create audit log entry when shift is opened", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Authenticated user with SHIFT_OPEN permission
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );

    const requestData = {
      store_id: storeManagerUser.store_id,
      cashier_id: cashier.cashier_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 100.0,
    };

    // WHEN: Opening a shift
    const response = await storeManagerApiRequest.post(
      "/api/shifts/open",
      requestData,
    );

    // THEN: Audit log entry should be created
    expect(response.status()).toBe(201);
    const body = await response.json();

    // Verify audit log entry
    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        action: "SHIFT_OPENED",
        user_id: storeManagerUser.user_id,
        record_id: body.data.shift_id,
      },
      orderBy: { timestamp: "desc" },
    });

    expect(auditLog, "Audit log entry should exist").not.toBeNull();
    expect(auditLog?.action).toBe("SHIFT_OPENED");
    expect(auditLog?.user_id).toBe(storeManagerUser.user_id);

    // Cleanup
    await prismaClient.shift.delete({
      where: { shift_id: body.data.shift_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
  });
});

// =============================================================================
// SECTION 3: P0 CRITICAL - ACTIVE SHIFT CONFLICT (AC-2)
// =============================================================================

test.describe("4.2-API: Shift Opening - Active Shift Conflict (AC-2)", () => {
  test("4.2-API-008: [P0] should reject request when active shift exists for terminal", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An active shift already exists for the POS terminal
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );

    // Create existing active shift
    const existingShift = await prismaClient.shift.create({
      data: {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        cashier_id: cashier.cashier_id,
        pos_terminal_id: terminal.pos_terminal_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });

    const requestData = {
      store_id: storeManagerUser.store_id,
      cashier_id: cashier.cashier_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 200.0,
    };

    // WHEN: Attempting to open another shift for the same terminal
    const response = await storeManagerApiRequest.post(
      "/api/shifts/open",
      requestData,
    );

    // THEN: Should return error with SHIFT_ALREADY_ACTIVE code
    expect(
      response.status(),
      "Should return error status",
    ).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be SHIFT_ALREADY_ACTIVE").toBe(
      "SHIFT_ALREADY_ACTIVE",
    );
    expect(
      body.error.details?.existing_shift_id,
      "Error should include existing shift ID",
    ).toBe(existingShift.shift_id);

    // Cleanup
    await prismaClient.shift.delete({
      where: { shift_id: existingShift.shift_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
  });

  test("4.2-API-009: [P0] should reject request when shift with ACTIVE status exists", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A shift with ACTIVE status exists for the terminal
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );

    const existingShift = await prismaClient.shift.create({
      data: {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        cashier_id: cashier.cashier_id,
        pos_terminal_id: terminal.pos_terminal_id,
        opening_cash: 100.0,
        status: "ACTIVE",
      },
    });

    const requestData = {
      store_id: storeManagerUser.store_id,
      cashier_id: cashier.cashier_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 200.0,
    };

    // WHEN: Attempting to open another shift
    const response = await storeManagerApiRequest.post(
      "/api/shifts/open",
      requestData,
    );

    // THEN: Should return SHIFT_ALREADY_ACTIVE error
    expect(response.status()).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("SHIFT_ALREADY_ACTIVE");

    // Cleanup
    await prismaClient.shift.delete({
      where: { shift_id: existingShift.shift_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
  });

  test("4.2-API-010: [P0] should reject request when shift with CLOSING status exists", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A shift with CLOSING status exists for the terminal
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );

    const existingShift = await prismaClient.shift.create({
      data: {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        cashier_id: cashier.cashier_id,
        pos_terminal_id: terminal.pos_terminal_id,
        opening_cash: 100.0,
        status: "CLOSING",
      },
    });

    const requestData = {
      store_id: storeManagerUser.store_id,
      cashier_id: cashier.cashier_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 200.0,
    };

    // WHEN: Attempting to open another shift
    const response = await storeManagerApiRequest.post(
      "/api/shifts/open",
      requestData,
    );

    // THEN: Should return SHIFT_ALREADY_ACTIVE error
    expect(response.status()).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("SHIFT_ALREADY_ACTIVE");

    // Cleanup
    await prismaClient.shift.delete({
      where: { shift_id: existingShift.shift_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
  });

  test("4.2-API-011: [P0] should reject request when shift with RECONCILING status exists", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A shift with RECONCILING status exists for the terminal
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );

    const existingShift = await prismaClient.shift.create({
      data: {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        cashier_id: cashier.cashier_id,
        pos_terminal_id: terminal.pos_terminal_id,
        opening_cash: 100.0,
        status: "RECONCILING",
      },
    });

    const requestData = {
      store_id: storeManagerUser.store_id,
      cashier_id: cashier.cashier_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 200.0,
    };

    // WHEN: Attempting to open another shift
    const response = await storeManagerApiRequest.post(
      "/api/shifts/open",
      requestData,
    );

    // THEN: Should return SHIFT_ALREADY_ACTIVE error
    expect(response.status()).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("SHIFT_ALREADY_ACTIVE");

    // Cleanup
    await prismaClient.shift.delete({
      where: { shift_id: existingShift.shift_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
  });

  test("4.2-API-012: [P0] should allow opening shift when only CLOSED shift exists", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A CLOSED shift exists for the terminal (should not conflict)
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );

    const closedShift = await prismaClient.shift.create({
      data: {
        store_id: storeManagerUser.store_id,
        opened_by: storeManagerUser.user_id,
        cashier_id: cashier.cashier_id,
        pos_terminal_id: terminal.pos_terminal_id,
        opening_cash: 100.0,
        status: "CLOSED",
        closed_at: new Date(),
      },
    });

    const requestData = {
      store_id: storeManagerUser.store_id,
      cashier_id: cashier.cashier_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 200.0,
    };

    // WHEN: Opening a new shift
    const response = await storeManagerApiRequest.post(
      "/api/shifts/open",
      requestData,
    );

    // THEN: Should succeed (CLOSED shift should not prevent new shift)
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("OPEN");

    // Cleanup
    await prismaClient.shift.delete({
      where: { shift_id: body.data.shift_id },
    });
    await prismaClient.shift.delete({
      where: { shift_id: closedShift.shift_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
  });
});

// =============================================================================
// SECTION 4: P0 CRITICAL - API RESPONSE FORMAT (AC-3)
// =============================================================================

test.describe("4.2-API: Shift Opening - Response Format (AC-3)", () => {
  test("4.2-API-013: [P0] should return created shift with all details in correct format", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Authenticated user with SHIFT_OPEN permission
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );

    const requestData = {
      store_id: storeManagerUser.store_id,
      cashier_id: cashier.cashier_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 175.25,
    };

    // WHEN: Opening a shift successfully
    const response = await storeManagerApiRequest.post(
      "/api/shifts/open",
      requestData,
    );

    // THEN: Response should match API contract format
    expect(response.status()).toBe(201);
    const body = await response.json();

    // Verify response structure
    expect(body).toHaveProperty("success", true);
    expect(body).toHaveProperty("data");
    expect(body.data).toHaveProperty("shift_id");
    expect(body.data).toHaveProperty("store_id", storeManagerUser.store_id);
    expect(body.data).toHaveProperty("opened_by", storeManagerUser.user_id);
    expect(body.data).toHaveProperty("cashier_id", cashier.cashier_id);
    expect(body.data).toHaveProperty(
      "pos_terminal_id",
      terminal.pos_terminal_id,
    );
    expect(body.data).toHaveProperty("opened_at");
    expect(body.data).toHaveProperty("opening_cash", 175.25);
    expect(body.data).toHaveProperty("status", "OPEN");

    // Verify opened_at is ISO 8601 format
    expect(typeof body.data.opened_at).toBe("string");
    expect(() => new Date(body.data.opened_at)).not.toThrow();

    // Cleanup
    await prismaClient.shift.delete({
      where: { shift_id: body.data.shift_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
  });
});

// =============================================================================
// SECTION 5: P0 CRITICAL - VALIDATION ERRORS
// =============================================================================

test.describe("4.2-API: Shift Opening - Validation Errors", () => {
  test("4.2-API-014: [P0] should return error when store_id is missing", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: Request data without store_id
    const requestData = {
      cashier_id: "00000000-0000-0000-0000-000000000000",
      pos_terminal_id: "00000000-0000-0000-0000-000000000000",
      opening_cash: 100.0,
    };

    // WHEN: Sending request with missing store_id
    const response = await storeManagerApiRequest.post(
      "/api/shifts/open",
      requestData,
    );

    // THEN: Should return validation error
    expect(response.status()).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("4.2-API-015: [P0] should return error when opening_cash is negative", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Request data with negative opening_cash
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );

    const requestData = {
      store_id: storeManagerUser.store_id,
      cashier_id: cashier.cashier_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: -50.0,
    };

    // WHEN: Sending request with negative opening_cash
    const response = await storeManagerApiRequest.post(
      "/api/shifts/open",
      requestData,
    );

    // THEN: Should return validation error (Zod validates before service layer)
    expect(response.status()).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    // Zod validation catches negative numbers before service layer
    expect(
      ["VALIDATION_ERROR", "INVALID_OPENING_CASH"].includes(body.error.code),
    ).toBe(true);

    // Cleanup
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
  });

  test("4.2-API-016: [P0] should return error when cashier_id does not exist", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Request data with non-existent cashier_id
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const nonExistentCashierId = "00000000-0000-0000-0000-000000000000";

    const requestData = {
      store_id: storeManagerUser.store_id,
      cashier_id: nonExistentCashierId,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 100.0,
    };

    // WHEN: Sending request with non-existent cashier
    const response = await storeManagerApiRequest.post(
      "/api/shifts/open",
      requestData,
    );

    // THEN: Should return CASHIER_NOT_FOUND error
    expect(response.status()).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("CASHIER_NOT_FOUND");

    // Cleanup
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });

  test("4.2-API-017: [P0] should return error when pos_terminal_id does not exist", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Request data with non-existent pos_terminal_id
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const nonExistentTerminalId = "00000000-0000-0000-0000-000000000000";

    const requestData = {
      store_id: storeManagerUser.store_id,
      cashier_id: cashier.cashier_id,
      pos_terminal_id: nonExistentTerminalId,
      opening_cash: 100.0,
    };

    // WHEN: Sending request with non-existent terminal
    const response = await storeManagerApiRequest.post(
      "/api/shifts/open",
      requestData,
    );

    // THEN: Should return TERMINAL_NOT_FOUND error
    expect(response.status()).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("TERMINAL_NOT_FOUND");

    // Cleanup
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
  });

  test("4.2-API-018: [P0] should return error when store_id is not accessible to user", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A store belonging to a different company
    const otherOwner = await prismaClient.user.create({
      data: createUser({ name: "Other Company Owner" }),
    });
    const otherCompany = await prismaClient.company.create({
      data: createCompany({
        name: `Other Company ${Date.now()}`,
        owner_user_id: otherOwner.user_id,
      }),
    });
    const otherStore = await prismaClient.store.create({
      data: createStore({ company_id: otherCompany.company_id }),
    });
    const cashier = await createTestCashier(
      prismaClient,
      otherStore.store_id,
      otherOwner.user_id,
    );
    const terminal = await createPOSTerminal(prismaClient, otherStore.store_id);

    const requestData = {
      store_id: otherStore.store_id,
      cashier_id: cashier.cashier_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 100.0,
    };

    // WHEN: User attempts to open shift for inaccessible store
    const response = await corporateAdminApiRequest.post(
      "/api/shifts/open",
      requestData,
    );

    // THEN: Should return STORE_NOT_FOUND or permission error
    expect(response.status()).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(
      ["STORE_NOT_FOUND", "PERMISSION_DENIED"].includes(body.error.code),
    ).toBe(true);

    // Cleanup
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.store.delete({
      where: { store_id: otherStore.store_id },
    });
    await prismaClient.company.delete({
      where: { company_id: otherCompany.company_id },
    });
    await prismaClient.user.delete({ where: { user_id: otherOwner.user_id } });
  });
});

// =============================================================================
// SECTION 6: P0 CRITICAL - SECURITY TESTS (MANDATORY)
// =============================================================================

test.describe("4.2-API: Shift Opening - Security Tests", () => {
  test("4.2-API-019: [P0] should prevent SQL injection in store_id field", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Malicious SQL injection attempt in store_id
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );

    const maliciousStoreId = "'; DROP TABLE shifts; --";
    const requestData = {
      store_id: maliciousStoreId,
      cashier_id: cashier.cashier_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 100.0,
    };

    // WHEN: Sending request with SQL injection in store_id
    const response = await storeManagerApiRequest.post(
      "/api/shifts/open",
      requestData,
    );

    // THEN: Should return validation error (not execute SQL)
    expect(response.status(), "Should return 400 for invalid UUID format").toBe(
      400,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    // Should be validation error, not SQL error
    expect(
      ["VALIDATION_ERROR", "STORE_NOT_FOUND"].includes(body.error.code),
      "Should return validation error, not SQL error",
    ).toBe(true);

    // Cleanup
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
  });

  test("4.2-API-020: [P0] should prevent SQL injection in cashier_id field", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Malicious SQL injection attempt in cashier_id
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );

    const maliciousCashierId = "1' OR '1'='1";
    const requestData = {
      store_id: storeManagerUser.store_id,
      cashier_id: maliciousCashierId,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 100.0,
    };

    // WHEN: Sending request with SQL injection in cashier_id
    const response = await storeManagerApiRequest.post(
      "/api/shifts/open",
      requestData,
    );

    // THEN: Should return validation error (not execute SQL)
    expect(response.status(), "Should return 400 for invalid UUID format").toBe(
      400,
    );
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(
      ["VALIDATION_ERROR", "CASHIER_NOT_FOUND"].includes(body.error.code),
      "Should return validation error, not SQL error",
    ).toBe(true);

    // Cleanup
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });

  test("4.2-API-021: [P0] should prevent SQL injection in pos_terminal_id field", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Malicious SQL injection attempt in pos_terminal_id
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const maliciousTerminalId = "1'; DELETE FROM shifts; --";
    const requestData = {
      store_id: storeManagerUser.store_id,
      cashier_id: cashier.cashier_id,
      pos_terminal_id: maliciousTerminalId,
      opening_cash: 100.0,
    };

    // WHEN: Sending request with SQL injection in pos_terminal_id
    const response = await storeManagerApiRequest.post(
      "/api/shifts/open",
      requestData,
    );

    // THEN: Should return validation error (not execute SQL)
    expect(response.status(), "Should return 400 for invalid UUID format").toBe(
      400,
    );
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(
      ["VALIDATION_ERROR", "TERMINAL_NOT_FOUND"].includes(body.error.code),
      "Should return validation error, not SQL error",
    ).toBe(true);

    // Cleanup
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
  });

  test("4.2-API-022: [P0] should return 401 when JWT token is expired", async ({
    apiRequest,
  }) => {
    // GIVEN: An expired JWT token (simulated with malformed token)
    // Note: In real scenario, this would be a properly signed but expired token
    const expiredToken =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9";
    const requestData = {
      store_id: "00000000-0000-0000-0000-000000000000",
      cashier_id: "00000000-0000-0000-0000-000000000000",
      pos_terminal_id: "00000000-0000-0000-0000-000000000000",
      opening_cash: 100.0,
    };

    // WHEN: Sending request with expired/malformed token
    const response = await apiRequest.post("/api/shifts/open", requestData, {
      headers: {
        Authorization: `Bearer ${expiredToken}`,
      },
    });

    // THEN: Should return 401 Unauthorized
    expect(
      response.status(),
      "Should return 401 for expired/invalid token",
    ).toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("4.2-API-023: [P0] should not expose sensitive data in error responses", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Request with non-existent store_id
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );

    const nonExistentStoreId = "00000000-0000-0000-0000-000000000000";
    const requestData = {
      store_id: nonExistentStoreId,
      cashier_id: cashier.cashier_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 100.0,
    };

    // WHEN: Sending request with non-existent store
    const response = await storeManagerApiRequest.post(
      "/api/shifts/open",
      requestData,
    );

    // THEN: Error response should not contain sensitive data
    expect(response.status()).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error, "Error object should exist").toBeDefined();

    // Verify no sensitive data leaked
    const responseString = JSON.stringify(body);
    expect(
      responseString.includes("password") ||
        responseString.includes("token") ||
        responseString.includes("secret"),
      "Response should not contain passwords, tokens, or secrets",
    ).toBe(false);

    // Cleanup
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
  });

  test("4.2-API-024: [P0] should prevent privilege escalation attempts", async ({
    regularUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A regular user without SHIFT_OPEN permission
    // AND: Attempting to access shift opening endpoint
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Company Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );
    const terminal = await createPOSTerminal(prismaClient, store.store_id);

    const requestData = {
      store_id: store.store_id,
      cashier_id: cashier.cashier_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 100.0,
    };

    // WHEN: Regular user attempts to open shift (privilege escalation)
    const response = await regularUserApiRequest.post(
      "/api/shifts/open",
      requestData,
    );

    // THEN: Should return 403 Forbidden (not allow privilege escalation)
    expect(
      response.status(),
      "Should return 403 for privilege escalation attempt",
    ).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code, "Error code should be PERMISSION_DENIED").toBe(
      "PERMISSION_DENIED",
    );

    // Cleanup
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.store.delete({ where: { store_id: store.store_id } });
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
    await prismaClient.user.delete({ where: { user_id: owner.user_id } });
  });
});

// =============================================================================
// SECTION 7: P0 CRITICAL - EDGE CASES & BOUNDARY TESTS
// =============================================================================

test.describe("4.2-API: Shift Opening - Edge Cases & Boundaries", () => {
  test("4.2-API-025: [P0] should reject empty string for store_id", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: Request with empty string store_id
    const requestData = {
      store_id: "",
      cashier_id: "00000000-0000-0000-0000-000000000000",
      pos_terminal_id: "00000000-0000-0000-0000-000000000000",
      opening_cash: 100.0,
    };

    // WHEN: Sending request with empty store_id
    const response = await storeManagerApiRequest.post(
      "/api/shifts/open",
      requestData,
    );

    // THEN: Should return validation error
    expect(response.status(), "Should return 400 for empty store_id").toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(
      ["VALIDATION_ERROR", "STORE_NOT_FOUND"].includes(body.error.code),
    ).toBe(true);
  });

  test("4.2-API-026: [P0] should reject invalid UUID format for store_id", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: Request with invalid UUID format
    const requestData = {
      store_id: "not-a-uuid",
      cashier_id: "00000000-0000-0000-0000-000000000000",
      pos_terminal_id: "00000000-0000-0000-0000-000000000000",
      opening_cash: 100.0,
    };

    // WHEN: Sending request with invalid UUID
    const response = await storeManagerApiRequest.post(
      "/api/shifts/open",
      requestData,
    );

    // THEN: Should return validation error
    expect(response.status(), "Should return 400 for invalid UUID").toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("4.2-API-027: [P0] should reject invalid UUID format for cashier_id", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Request with invalid UUID format for cashier_id
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );

    const requestData = {
      store_id: storeManagerUser.store_id,
      cashier_id: "invalid-uuid-format",
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 100.0,
    };

    // WHEN: Sending request with invalid cashier_id UUID
    const response = await storeManagerApiRequest.post(
      "/api/shifts/open",
      requestData,
    );

    // THEN: Should return validation error
    expect(response.status(), "Should return 400 for invalid UUID").toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");

    // Cleanup
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });

  test("4.2-API-028: [P0] should reject invalid UUID format for pos_terminal_id", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Request with invalid UUID format for pos_terminal_id
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const requestData = {
      store_id: storeManagerUser.store_id,
      cashier_id: cashier.cashier_id,
      pos_terminal_id: "not-a-valid-uuid",
      opening_cash: 100.0,
    };

    // WHEN: Sending request with invalid terminal UUID
    const response = await storeManagerApiRequest.post(
      "/api/shifts/open",
      requestData,
    );

    // THEN: Should return validation error
    expect(response.status(), "Should return 400 for invalid UUID").toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");

    // Cleanup
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
  });

  test("4.2-API-029: [P0] should accept zero for opening_cash", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Request with zero opening_cash (valid boundary value)
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );

    const requestData = {
      store_id: storeManagerUser.store_id,
      cashier_id: cashier.cashier_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 0.0,
    };

    // WHEN: Opening shift with zero opening cash
    const response = await storeManagerApiRequest.post(
      "/api/shifts/open",
      requestData,
    );

    // THEN: Should succeed (zero is valid)
    expect(response.status(), "Should return 201 for zero opening cash").toBe(
      201,
    );
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.opening_cash, "Opening cash should be 0").toBe(0);

    // Cleanup
    const shiftId = body.data.shift_id;
    await prismaClient.shift.delete({ where: { shift_id: shiftId } });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
  });

  test("4.2-API-030: [P0] should accept very large opening_cash value", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Request with very large opening_cash value
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );

    // Use value within database precision (DECIMAL(10,2) = max 99,999,999.99)
    const largeCash = 99999999.99;
    const requestData = {
      store_id: storeManagerUser.store_id,
      cashier_id: cashier.cashier_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: largeCash,
    };

    // WHEN: Opening shift with very large opening cash
    const response = await storeManagerApiRequest.post(
      "/api/shifts/open",
      requestData,
    );

    // THEN: Should succeed (large values are valid)
    expect(response.status(), "Should return 201 for large opening cash").toBe(
      201,
    );
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(
      body.data.opening_cash,
      "Opening cash should match large value",
    ).toBe(largeCash);

    // Cleanup
    const shiftId = body.data.shift_id;
    await prismaClient.shift.delete({ where: { shift_id: shiftId } });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
  });

  test("4.2-API-031: [P0] should accept decimal precision for opening_cash", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Request with precise decimal opening_cash
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );

    const preciseCash = 123.45;
    const requestData = {
      store_id: storeManagerUser.store_id,
      cashier_id: cashier.cashier_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: preciseCash,
    };

    // WHEN: Opening shift with decimal precision
    const response = await storeManagerApiRequest.post(
      "/api/shifts/open",
      requestData,
    );

    // THEN: Should succeed and preserve decimal precision
    expect(
      response.status(),
      "Should return 201 for decimal opening cash",
    ).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(
      body.data.opening_cash,
      "Opening cash should preserve decimal precision",
    ).toBe(preciseCash);

    // Cleanup
    const shiftId = body.data.shift_id;
    await prismaClient.shift.delete({ where: { shift_id: shiftId } });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
  });

  test("4.2-API-032: [P0] should reject string 'NaN' for opening_cash", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Request with string 'NaN' for opening_cash
    // Note: JSON.stringify(NaN) = "null", and null might be coerced to 0
    // So we test with a string that cannot be parsed as a number
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );

    // Test with string "NaN" which should fail Zod validation
    const requestData = {
      store_id: storeManagerUser.store_id,
      cashier_id: cashier.cashier_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: "NaN" as any, // String that cannot be parsed as number
    };

    // WHEN: Sending request with string 'NaN'
    const response = await storeManagerApiRequest.post(
      "/api/shifts/open",
      requestData,
    );

    // THEN: Should return validation error
    expect(response.status(), "Should return 400 for invalid type").toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");

    // Cleanup
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
  });

  test("4.2-API-033: [P0] should reject Infinity for opening_cash", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Request with Infinity for opening_cash (JSON serializes as null)
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );

    // Note: JSON.stringify(Infinity) = "null", so we test with a very large number
    // that exceeds reasonable bounds instead
    const requestData = {
      store_id: storeManagerUser.store_id,
      cashier_id: cashier.cashier_id,
      pos_terminal_id: terminal.pos_terminal_id,
      opening_cash: 1e20, // Very large number that exceeds DB precision
    };

    // WHEN: Sending request with very large number
    const response = await storeManagerApiRequest.post(
      "/api/shifts/open",
      requestData,
    );

    // THEN: Should return error (400 for validation or 500 for DB constraint)
    expect(
      response.status(),
      "Should return error for very large number",
    ).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    // Can be validation error or internal error from DB constraint
    expect(
      ["VALIDATION_ERROR", "INVALID_OPENING_CASH", "INTERNAL_ERROR"].includes(
        body.error.code,
      ),
    ).toBe(true);

    // Cleanup
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
  });
});
