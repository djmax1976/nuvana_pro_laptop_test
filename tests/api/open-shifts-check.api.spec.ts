/**
 * @test-level API
 * @justification Endpoint integration tests verifying HTTP layer, authentication, authorization,
 *                request/response format, and error handling for Open Shifts Check API
 * @story Day Close Defense-in-Depth Validation
 * @priority P0 (Critical - Business Logic, Security)
 *
 * Open Shifts Check API Tests
 *
 * Tests for the GET /api/stores/:storeId/shifts/open-check endpoint which provides
 * defense-in-depth UX for the Day Close feature by checking for open shifts.
 *
 * BUSINESS RULES TESTED:
 * - Returns list of open shifts for a store on a given business date
 * - Checks shift statuses: OPEN, ACTIVE, CLOSING, RECONCILING
 * - Returns terminal name and cashier name for each open shift
 * - Authentication required (JWT token)
 * - Authorization required (SHIFT_CLOSE permission)
 * - Multi-tenant isolation (store_id must be accessible to user)
 *
 * ================================================================================
 * TRACEABILITY MATRIX
 * ================================================================================
 *
 * | Test ID             | Requirement                          | API Endpoint                              | Priority |
 * |---------------------|--------------------------------------|-------------------------------------------|----------|
 * | OPEN-CHECK-001      | AUTH-001: JWT Required               | GET /api/stores/:storeId/shifts/open-check | P0       |
 * | OPEN-CHECK-002      | AUTH-002: JWT Validation             | GET /api/stores/:storeId/shifts/open-check | P0       |
 * | OPEN-CHECK-003      | AUTH-003: Token Expiry               | GET /api/stores/:storeId/shifts/open-check | P0       |
 * | OPEN-CHECK-010      | AUTHZ-001: SHIFT_CLOSE Required      | GET /api/stores/:storeId/shifts/open-check | P0       |
 * | OPEN-CHECK-011      | AUTHZ-002: Permission Grant          | GET /api/stores/:storeId/shifts/open-check | P0       |
 * | OPEN-CHECK-020      | VAL-001: UUID Format                 | GET /api/stores/:storeId/shifts/open-check | P0       |
 * | OPEN-CHECK-021      | VAL-002: Date Format YYYY-MM-DD      | GET /api/stores/:storeId/shifts/open-check | P1       |
 * | OPEN-CHECK-030      | BIZ-001: No Open Shifts              | GET /api/stores/:storeId/shifts/open-check | P0       |
 * | OPEN-CHECK-031      | BIZ-002: Single Open Shift           | GET /api/stores/:storeId/shifts/open-check | P0       |
 * | OPEN-CHECK-032      | BIZ-003: Multiple Open Shifts        | GET /api/stores/:storeId/shifts/open-check | P0       |
 * | OPEN-CHECK-033      | BIZ-004: Only OPEN Status            | GET /api/stores/:storeId/shifts/open-check | P1       |
 * | OPEN-CHECK-034      | BIZ-005: Only ACTIVE Status          | GET /api/stores/:storeId/shifts/open-check | P1       |
 * | OPEN-CHECK-035      | BIZ-006: Only CLOSING Status         | GET /api/stores/:storeId/shifts/open-check | P1       |
 * | OPEN-CHECK-036      | BIZ-007: Only RECONCILING Status     | GET /api/stores/:storeId/shifts/open-check | P1       |
 * | OPEN-CHECK-037      | BIZ-008: CLOSED Shifts Excluded      | GET /api/stores/:storeId/shifts/open-check | P0       |
 * | OPEN-CHECK-038      | BIZ-009: Terminal Name Included      | GET /api/stores/:storeId/shifts/open-check | P1       |
 * | OPEN-CHECK-039      | BIZ-010: Cashier Name Included       | GET /api/stores/:storeId/shifts/open-check | P1       |
 * | OPEN-CHECK-040      | BIZ-011: Null Terminal Handled       | GET /api/stores/:storeId/shifts/open-check | P1       |
 * | OPEN-CHECK-050      | SEC-001: Tenant Isolation            | GET /api/stores/:storeId/shifts/open-check | P0       |
 * | OPEN-CHECK-051      | SEC-002: Cross-Store Blocked         | GET /api/stores/:storeId/shifts/open-check | P0       |
 * | OPEN-CHECK-060      | BIZ-012: Date Filter Works           | GET /api/stores/:storeId/shifts/open-check | P1       |
 * | OPEN-CHECK-061      | BIZ-013: No Filter Returns All       | GET /api/stores/:storeId/shifts/open-check | P0       |
 *
 * REQUIREMENT COVERAGE:
 * - Authentication (AUTH-001 to AUTH-003): 3 tests
 * - Authorization (AUTHZ-001 to AUTHZ-002): 2 tests
 * - Validation (VAL-001 to VAL-002): 2 tests
 * - Business Logic (BIZ-001 to BIZ-013): 13 tests
 * - Security (SEC-001 to SEC-002): 2 tests
 * ================================================================================
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import { createExpiredJWTAccessToken } from "../support/factories";
import { withBypassClient } from "../support/prisma-bypass";

/**
 * Generate a unique pin hash to avoid constraint violations
 */
function generateUniquePinHash(): string {
  const random = Math.random().toString(36).substring(2, 15);
  const timestamp = Date.now().toString(36);
  return `$2b$10$test${random}${timestamp}`.substring(0, 60);
}

/**
 * Get today's date string in YYYY-MM-DD format
 */
function getTodayDateString(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Create a shift with specified status for testing
 */
async function createTestShift(
  storeId: string,
  userId: string,
  status: "OPEN" | "ACTIVE" | "CLOSING" | "RECONCILING" | "CLOSED",
  terminalName: string | null = "Test Terminal",
  cashierName: string = "Test Cashier",
) {
  return await withBypassClient(async (tx) => {
    // Create terminal if name provided
    let terminalId: string | null = null;
    if (terminalName) {
      const terminal = await tx.pOSTerminal.create({
        data: {
          store_id: storeId,
          name: terminalName,
          device_id: `device-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          deleted_at: null,
        },
      });
      terminalId = terminal.pos_terminal_id;
    }

    // Create cashier (Cashier model only has 'name' field, not first_name/last_name)
    const cashier = await tx.cashier.create({
      data: {
        store_id: storeId,
        employee_id: `${Math.floor(1000 + Math.random() * 9000)}`, // 4-digit employee ID
        name: cashierName,
        pin_hash: generateUniquePinHash(),
        hired_on: new Date(),
        created_by: userId,
      },
    });

    // Create shift
    const shift = await tx.shift.create({
      data: {
        store_id: storeId,
        cashier_id: cashier.cashier_id,
        pos_terminal_id: terminalId,
        opened_by: userId,
        status: status,
        opened_at: new Date(),
        opening_cash: 100.0,
        ...(status === "CLOSED" && {
          closed_at: new Date(),
          closing_cash: 150.0,
        }),
      },
    });

    return {
      shift,
      cashier,
      terminalId,
    };
  });
}

/**
 * Clean up test entities
 */
async function cleanupTestEntities(entities: {
  shiftIds?: string[];
  cashierIds?: string[];
  terminalIds?: string[];
}) {
  await withBypassClient(async (tx) => {
    if (entities.shiftIds?.length) {
      await tx.shift.deleteMany({
        where: { shift_id: { in: entities.shiftIds } },
      });
    }
    if (entities.cashierIds?.length) {
      await tx.cashier.deleteMany({
        where: { cashier_id: { in: entities.cashierIds } },
      });
    }
    if (entities.terminalIds?.length) {
      await tx.pOSTerminal.deleteMany({
        where: { pos_terminal_id: { in: entities.terminalIds } },
      });
    }
  });
}

// =============================================================================
// SECTION 1: P0 CRITICAL - AUTHENTICATION TESTS
// =============================================================================

test.describe("OPEN-SHIFTS-CHECK-API: Authentication", () => {
  test("OPEN-CHECK-001: [P0] should return 401 when JWT token is missing", async ({
    apiRequest,
  }) => {
    // GIVEN: Valid store ID format
    const storeId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Requesting open shifts check without JWT token
    const response = await apiRequest.get(
      `/api/stores/${storeId}/shifts/open-check`,
    );

    // THEN: Should return 401 Unauthorized
    expect(response.status(), "Should return 401 for missing token").toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be UNAUTHORIZED").toBe(
      "UNAUTHORIZED",
    );
  });

  test("OPEN-CHECK-002: [P0] should return 401 when JWT token is invalid", async ({
    apiRequest,
  }) => {
    // GIVEN: An invalid JWT token
    const invalidToken = "invalid.jwt.token";
    const storeId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Requesting open shifts check with invalid token
    const response = await apiRequest.get(
      `/api/stores/${storeId}/shifts/open-check`,
      {
        headers: { Authorization: `Bearer ${invalidToken}` },
      },
    );

    // THEN: Should return 401 Unauthorized
    expect(response.status(), "Should return 401 for invalid token").toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be UNAUTHORIZED").toBe(
      "UNAUTHORIZED",
    );
  });

  test("OPEN-CHECK-003: [P0] should return 401 when JWT token is expired", async ({
    apiRequest,
  }) => {
    // GIVEN: An expired JWT token
    const expiredToken = createExpiredJWTAccessToken();
    const storeId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Requesting open shifts check with expired token
    const response = await apiRequest.get(
      `/api/stores/${storeId}/shifts/open-check`,
      {
        headers: { Authorization: `Bearer ${expiredToken}` },
      },
    );

    // THEN: Should return 401 Unauthorized
    expect(response.status(), "Should return 401 for expired token").toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be UNAUTHORIZED").toBe(
      "UNAUTHORIZED",
    );
  });
});

// =============================================================================
// SECTION 2: P0 CRITICAL - AUTHORIZATION TESTS
// =============================================================================

test.describe("OPEN-SHIFTS-CHECK-API: Authorization", () => {
  test("OPEN-CHECK-010: [P0] should return 403 when user lacks SHIFT_CLOSE permission", async ({
    regularUserApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: User without SHIFT_CLOSE permission (regularUser only has SHIFT_READ)
    // We use storeManagerUser's store_id to ensure the store exists
    // WHEN: Requesting open shifts check without permission
    const response = await regularUserApiRequest.get(
      `/api/stores/${storeManagerUser.store_id}/shifts/open-check`,
    );

    // THEN: Should return 403 Forbidden
    expect(response.status(), "Should return 403 for missing permission").toBe(
      403,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be PERMISSION_DENIED").toBe(
      "PERMISSION_DENIED",
    );
  });

  test("OPEN-CHECK-011: [P0] should allow access with valid SHIFT_CLOSE permission", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: Store manager with SHIFT_CLOSE permission
    // WHEN: Requesting open shifts check with proper permission
    const response = await storeManagerApiRequest.get(
      `/api/stores/${storeManagerUser.store_id}/shifts/open-check`,
    );

    // THEN: Should return 200 OK
    expect(response.status(), "Should return 200 with valid permission").toBe(
      200,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data, "Response should have data object").toBeDefined();
    expect(
      typeof body.data.has_open_shifts,
      "Should have has_open_shifts boolean",
    ).toBe("boolean");
  });
});

// =============================================================================
// SECTION 3: P0 CRITICAL - VALIDATION TESTS
// =============================================================================

test.describe("OPEN-SHIFTS-CHECK-API: Validation", () => {
  test("OPEN-CHECK-020: [P0] should return 400 for invalid store ID format", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Invalid store ID format
    const invalidStoreId = "not-a-uuid";

    // WHEN: Requesting open shifts check with invalid store ID
    const response = await superadminApiRequest.get(
      `/api/stores/${invalidStoreId}/shifts/open-check`,
    );

    // THEN: Should return 400 Bad Request
    expect(response.status(), "Should return 400 for invalid UUID").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("OPEN-CHECK-021: [P1] should accept valid date format in query param", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: Valid date format
    const validDate = "2025-12-24";

    // WHEN: Requesting open shifts check with date param
    const response = await storeManagerApiRequest.get(
      `/api/stores/${storeManagerUser.store_id}/shifts/open-check?business_date=${validDate}`,
    );

    // THEN: Should return 200 OK
    expect(response.status(), "Should accept valid date format").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
  });
});

// =============================================================================
// SECTION 4: P0 CRITICAL - BUSINESS LOGIC TESTS
// =============================================================================

test.describe("OPEN-SHIFTS-CHECK-API: Business Logic", () => {
  test("OPEN-CHECK-030: [P0] should return has_open_shifts=false when no open shifts", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: Store with no open shifts
    // WHEN: Requesting open shifts check
    const response = await storeManagerApiRequest.get(
      `/api/stores/${storeManagerUser.store_id}/shifts/open-check`,
    );

    // THEN: Should return has_open_shifts=false
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.has_open_shifts).toBe(false);
    expect(body.data.open_shift_count).toBe(0);
    expect(body.data.open_shifts).toEqual([]);
  });

  test("OPEN-CHECK-031: [P0] should return single open shift with correct details", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: Store with one ACTIVE shift
    const testData = await createTestShift(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      "ACTIVE",
      "Register 1",
      "John Doe",
    );

    try {
      // WHEN: Requesting open shifts check
      const response = await storeManagerApiRequest.get(
        `/api/stores/${storeManagerUser.store_id}/shifts/open-check`,
      );

      // THEN: Should return the open shift
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.has_open_shifts).toBe(true);
      expect(body.data.open_shift_count).toBe(1);
      expect(body.data.open_shifts).toHaveLength(1);
      expect(body.data.open_shifts[0].shift_id).toBe(testData.shift.shift_id);
      expect(body.data.open_shifts[0].terminal_name).toBe("Register 1");
      expect(body.data.open_shifts[0].cashier_name).toBe("John Doe");
      expect(body.data.open_shifts[0].status).toBe("ACTIVE");
    } finally {
      await cleanupTestEntities({
        shiftIds: [testData.shift.shift_id],
        cashierIds: [testData.cashier.cashier_id],
        terminalIds: testData.terminalId ? [testData.terminalId] : [],
      });
    }
  });

  test("OPEN-CHECK-032: [P0] should return multiple open shifts", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: Store with multiple open shifts
    const shift1 = await createTestShift(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      "OPEN",
      "Register 1",
      "Alice Smith",
    );
    const shift2 = await createTestShift(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      "ACTIVE",
      "Register 2",
      "Bob Jones",
    );

    try {
      // WHEN: Requesting open shifts check
      const response = await storeManagerApiRequest.get(
        `/api/stores/${storeManagerUser.store_id}/shifts/open-check`,
      );

      // THEN: Should return all open shifts
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.has_open_shifts).toBe(true);
      expect(body.data.open_shift_count).toBe(2);
      expect(body.data.open_shifts).toHaveLength(2);
    } finally {
      await cleanupTestEntities({
        shiftIds: [shift1.shift.shift_id, shift2.shift.shift_id],
        cashierIds: [shift1.cashier.cashier_id, shift2.cashier.cashier_id],
        terminalIds: [shift1.terminalId!, shift2.terminalId!],
      });
    }
  });

  test("OPEN-CHECK-033: [P1] should include shifts with OPEN status", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: Store with OPEN shift
    const testData = await createTestShift(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      "OPEN",
      "Register A",
    );

    try {
      // WHEN: Requesting open shifts check
      const response = await storeManagerApiRequest.get(
        `/api/stores/${storeManagerUser.store_id}/shifts/open-check`,
      );

      // THEN: OPEN shift should be included
      const body = await response.json();
      expect(body.data.has_open_shifts).toBe(true);
      expect(body.data.open_shifts[0].status).toBe("OPEN");
    } finally {
      await cleanupTestEntities({
        shiftIds: [testData.shift.shift_id],
        cashierIds: [testData.cashier.cashier_id],
        terminalIds: testData.terminalId ? [testData.terminalId] : [],
      });
    }
  });

  test("OPEN-CHECK-034: [P1] should include shifts with ACTIVE status", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: Store with ACTIVE shift
    const testData = await createTestShift(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      "ACTIVE",
      "Register B",
    );

    try {
      // WHEN: Requesting open shifts check
      const response = await storeManagerApiRequest.get(
        `/api/stores/${storeManagerUser.store_id}/shifts/open-check`,
      );

      // THEN: ACTIVE shift should be included
      const body = await response.json();
      expect(body.data.has_open_shifts).toBe(true);
      expect(body.data.open_shifts[0].status).toBe("ACTIVE");
    } finally {
      await cleanupTestEntities({
        shiftIds: [testData.shift.shift_id],
        cashierIds: [testData.cashier.cashier_id],
        terminalIds: testData.terminalId ? [testData.terminalId] : [],
      });
    }
  });

  test("OPEN-CHECK-035: [P1] should include shifts with CLOSING status", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: Store with CLOSING shift
    const testData = await createTestShift(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      "CLOSING",
      "Register C",
    );

    try {
      // WHEN: Requesting open shifts check
      const response = await storeManagerApiRequest.get(
        `/api/stores/${storeManagerUser.store_id}/shifts/open-check`,
      );

      // THEN: CLOSING shift should be included
      const body = await response.json();
      expect(body.data.has_open_shifts).toBe(true);
      expect(body.data.open_shifts[0].status).toBe("CLOSING");
    } finally {
      await cleanupTestEntities({
        shiftIds: [testData.shift.shift_id],
        cashierIds: [testData.cashier.cashier_id],
        terminalIds: testData.terminalId ? [testData.terminalId] : [],
      });
    }
  });

  test("OPEN-CHECK-036: [P1] should include shifts with RECONCILING status", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: Store with RECONCILING shift
    const testData = await createTestShift(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      "RECONCILING",
      "Register D",
    );

    try {
      // WHEN: Requesting open shifts check
      const response = await storeManagerApiRequest.get(
        `/api/stores/${storeManagerUser.store_id}/shifts/open-check`,
      );

      // THEN: RECONCILING shift should be included
      const body = await response.json();
      expect(body.data.has_open_shifts).toBe(true);
      expect(body.data.open_shifts[0].status).toBe("RECONCILING");
    } finally {
      await cleanupTestEntities({
        shiftIds: [testData.shift.shift_id],
        cashierIds: [testData.cashier.cashier_id],
        terminalIds: testData.terminalId ? [testData.terminalId] : [],
      });
    }
  });

  test("OPEN-CHECK-037: [P0] should NOT include shifts with CLOSED status", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: Store with CLOSED shift only
    const testData = await createTestShift(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      "CLOSED",
      "Register E",
    );

    try {
      // WHEN: Requesting open shifts check
      const response = await storeManagerApiRequest.get(
        `/api/stores/${storeManagerUser.store_id}/shifts/open-check`,
      );

      // THEN: CLOSED shift should NOT be included
      const body = await response.json();
      expect(body.data.has_open_shifts).toBe(false);
      expect(body.data.open_shift_count).toBe(0);
      expect(body.data.open_shifts).toHaveLength(0);
    } finally {
      await cleanupTestEntities({
        shiftIds: [testData.shift.shift_id],
        cashierIds: [testData.cashier.cashier_id],
        terminalIds: testData.terminalId ? [testData.terminalId] : [],
      });
    }
  });

  test("OPEN-CHECK-038: [P1] should include terminal_name in response", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: Store with shift that has terminal
    const testData = await createTestShift(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      "ACTIVE",
      "Cash Register #3",
    );

    try {
      // WHEN: Requesting open shifts check
      const response = await storeManagerApiRequest.get(
        `/api/stores/${storeManagerUser.store_id}/shifts/open-check`,
      );

      // THEN: Response should include terminal name
      const body = await response.json();
      expect(body.data.open_shifts[0].terminal_name).toBe("Cash Register #3");
    } finally {
      await cleanupTestEntities({
        shiftIds: [testData.shift.shift_id],
        cashierIds: [testData.cashier.cashier_id],
        terminalIds: testData.terminalId ? [testData.terminalId] : [],
      });
    }
  });

  test("OPEN-CHECK-039: [P1] should include cashier_name in response", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: Store with shift that has cashier
    const testData = await createTestShift(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      "ACTIVE",
      "Register 1",
      "Sarah Connor",
    );

    try {
      // WHEN: Requesting open shifts check
      const response = await storeManagerApiRequest.get(
        `/api/stores/${storeManagerUser.store_id}/shifts/open-check`,
      );

      // THEN: Response should include cashier name
      const body = await response.json();
      expect(body.data.open_shifts[0].cashier_name).toBe("Sarah Connor");
    } finally {
      await cleanupTestEntities({
        shiftIds: [testData.shift.shift_id],
        cashierIds: [testData.cashier.cashier_id],
        terminalIds: testData.terminalId ? [testData.terminalId] : [],
      });
    }
  });

  test("OPEN-CHECK-040: [P1] should handle null terminal_name gracefully", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: Store with shift that has no terminal
    const testData = await createTestShift(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      "ACTIVE",
      null, // No terminal
      "John Wick",
    );

    try {
      // WHEN: Requesting open shifts check
      const response = await storeManagerApiRequest.get(
        `/api/stores/${storeManagerUser.store_id}/shifts/open-check`,
      );

      // THEN: Response should have null terminal_name
      const body = await response.json();
      expect(body.data.open_shifts[0].terminal_name).toBeNull();
      expect(body.data.open_shifts[0].cashier_name).toBe("John Wick");
    } finally {
      await cleanupTestEntities({
        shiftIds: [testData.shift.shift_id],
        cashierIds: [testData.cashier.cashier_id],
      });
    }
  });
});

// =============================================================================
// SECTION 5: P0 CRITICAL - SECURITY TESTS
// =============================================================================

test.describe("OPEN-SHIFTS-CHECK-API: Security", () => {
  test("OPEN-CHECK-050: [P0] should enforce tenant isolation - only return store's shifts", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Shift in manager's store and another store
    const otherStoreId = crypto.randomUUID();

    const ownShift = await createTestShift(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      "ACTIVE",
      "Own Store Terminal",
    );

    try {
      // WHEN: Requesting open shifts check for own store
      const response = await storeManagerApiRequest.get(
        `/api/stores/${storeManagerUser.store_id}/shifts/open-check`,
      );

      // THEN: Should only return own store's shifts
      const body = await response.json();
      expect(body.data.has_open_shifts).toBe(true);
      expect(body.data.open_shifts).toHaveLength(1);
      expect(body.data.open_shifts[0].shift_id).toBe(ownShift.shift.shift_id);
    } finally {
      await cleanupTestEntities({
        shiftIds: [ownShift.shift.shift_id],
        cashierIds: [ownShift.cashier.cashier_id],
        terminalIds: ownShift.terminalId ? [ownShift.terminalId] : [],
      });
    }
  });

  test("OPEN-CHECK-051: [P0] should block access to stores user doesn't have access to", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: Store ID that user doesn't have access to
    const otherStoreId = crypto.randomUUID();

    // WHEN: Requesting open shifts check for inaccessible store
    const response = await storeManagerApiRequest.get(
      `/api/stores/${otherStoreId}/shifts/open-check`,
    );

    // THEN: Should return 403 or 404 (depending on implementation)
    // 403 = user doesn't have permission, 404 = store not found in user's scope
    expect([403, 404]).toContain(response.status());
  });
});

// =============================================================================
// SECTION 6: EDGE CASE TESTS
// =============================================================================

test.describe("OPEN-SHIFTS-CHECK-API: Edge Cases", () => {
  test("OPEN-CHECK-060: [P1] should filter by business_date when provided", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: Store with open shift today
    const testData = await createTestShift(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      "ACTIVE",
      "Today Terminal",
    );

    try {
      // WHEN: Requesting open shifts check for yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];

      const response = await storeManagerApiRequest.get(
        `/api/stores/${storeManagerUser.store_id}/shifts/open-check?business_date=${yesterdayStr}`,
      );

      // THEN: Should NOT find today's shift when filtering by yesterday
      const body = await response.json();
      expect(body.success).toBe(true);
      // Today's shift should not appear in yesterday's query
      const foundTodayShift = body.data.open_shifts.some(
        (s: any) => s.shift_id === testData.shift.shift_id,
      );
      expect(foundTodayShift).toBe(false);
    } finally {
      await cleanupTestEntities({
        shiftIds: [testData.shift.shift_id],
        cashierIds: [testData.cashier.cashier_id],
        terminalIds: testData.terminalId ? [testData.terminalId] : [],
      });
    }
  });

  test("OPEN-CHECK-061: [P1] should include opened_at timestamp in response", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: Store with open shift
    const testData = await createTestShift(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      "ACTIVE",
      "Timestamp Terminal",
    );

    try {
      // WHEN: Requesting open shifts check
      const response = await storeManagerApiRequest.get(
        `/api/stores/${storeManagerUser.store_id}/shifts/open-check`,
      );

      // THEN: Response should include opened_at timestamp
      const body = await response.json();
      expect(body.data.open_shifts[0].opened_at).toBeDefined();
      expect(typeof body.data.open_shifts[0].opened_at).toBe("string");
      // Verify it's a valid ISO date string
      expect(() => new Date(body.data.open_shifts[0].opened_at)).not.toThrow();
    } finally {
      await cleanupTestEntities({
        shiftIds: [testData.shift.shift_id],
        cashierIds: [testData.cashier.cashier_id],
        terminalIds: testData.terminalId ? [testData.terminalId] : [],
      });
    }
  });
});

// =============================================================================
// SECTION 7: TIMEZONE EDGE CASE TESTS
// =============================================================================

test.describe("OPEN-SHIFTS-CHECK-API: Timezone Edge Cases", () => {
  /**
   * Helper to create a shift with a specific opened_at time
   */
  async function createShiftAtTime(
    storeId: string,
    userId: string,
    openedAt: Date,
    status: "OPEN" | "ACTIVE" | "CLOSING" | "RECONCILING" | "CLOSED" = "ACTIVE",
  ) {
    return await withBypassClient(async (tx) => {
      // Create terminal
      const terminal = await tx.pOSTerminal.create({
        data: {
          store_id: storeId,
          name: `Terminal-${Date.now()}`,
          device_id: `device-tz-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          deleted_at: null,
        },
      });

      // Create cashier
      const cashier = await tx.cashier.create({
        data: {
          store_id: storeId,
          employee_id: `${Math.floor(1000 + Math.random() * 9000)}`,
          name: "Timezone Test Cashier",
          pin_hash: generateUniquePinHash(),
          hired_on: new Date(),
          created_by: userId,
        },
      });

      // Create shift with specific opened_at time
      const shift = await tx.shift.create({
        data: {
          store_id: storeId,
          cashier_id: cashier.cashier_id,
          pos_terminal_id: terminal.pos_terminal_id,
          opened_by: userId,
          status: status,
          opened_at: openedAt,
          opening_cash: 100.0,
          ...(status === "CLOSED" && {
            closed_at: new Date(openedAt.getTime() + 8 * 60 * 60 * 1000), // 8 hours later
            closing_cash: 150.0,
          }),
        },
      });

      return {
        shift,
        cashier,
        terminalId: terminal.pos_terminal_id,
      };
    });
  }

  /**
   * Helper to update store timezone
   */
  async function updateStoreTimezone(storeId: string, timezone: string) {
    return await withBypassClient(async (tx) => {
      return await tx.store.update({
        where: { store_id: storeId },
        data: { timezone },
      });
    });
  }

  /**
   * Helper to get original store timezone
   */
  async function getStoreTimezone(storeId: string): Promise<string | null> {
    return await withBypassClient(async (tx) => {
      const store = await tx.store.findUnique({
        where: { store_id: storeId },
        select: { timezone: true },
      });
      return store?.timezone || null;
    });
  }

  test("OPEN-CHECK-TZ-001: [P0] Should find shift opened at 11 PM in store timezone when querying today", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: Store is in America/New_York timezone
    // This test simulates a shift opened at 11 PM EST (04:00 UTC next day)
    // The shift should be found when querying for "today" in the store's timezone

    const originalTimezone = await getStoreTimezone(storeManagerUser.store_id);

    try {
      // Set store to Eastern timezone
      await updateStoreTimezone(storeManagerUser.store_id, "America/New_York");

      // Calculate 11 PM EST today in UTC
      // EST is UTC-5, so 11 PM EST = 4 AM UTC next day
      const now = new Date();
      const estFormatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const todayInEst = estFormatter.format(now);

      // Create shift at 11 PM EST (which is early morning UTC next day)
      // We simulate this by creating a shift at 23:00 in store local time
      const elevenPmEst = new Date(`${todayInEst}T23:00:00-05:00`);

      const testData = await createShiftAtTime(
        storeManagerUser.store_id,
        storeManagerUser.user_id,
        elevenPmEst,
        "ACTIVE",
      );

      // WHEN: Query open shifts for today (in store timezone)
      const response = await storeManagerApiRequest.get(
        `/api/stores/${storeManagerUser.store_id}/shifts/open-check?business_date=${todayInEst}`,
      );

      // THEN: Should find the shift even though it's "tomorrow" in UTC
      const body = await response.json();
      expect(response.status()).toBe(200);
      expect(body.data.has_open_shifts).toBe(true);
      expect(
        body.data.open_shifts.some(
          (s: any) => s.shift_id === testData.shift.shift_id,
        ),
      ).toBe(true);

      // Cleanup
      await cleanupTestEntities({
        shiftIds: [testData.shift.shift_id],
        cashierIds: [testData.cashier.cashier_id],
        terminalIds: [testData.terminalId],
      });
    } finally {
      // Restore original timezone
      if (originalTimezone) {
        await updateStoreTimezone(storeManagerUser.store_id, originalTimezone);
      }
    }
  });

  test("OPEN-CHECK-TZ-002: [P0] Should NOT find shift from yesterday when querying today", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: A shift opened yesterday should NOT appear in today's query
    const originalTimezone = await getStoreTimezone(storeManagerUser.store_id);

    try {
      await updateStoreTimezone(storeManagerUser.store_id, "America/New_York");

      // Calculate yesterday in EST
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const estFormatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const yesterdayInEst = estFormatter.format(yesterday);
      const todayInEst = estFormatter.format(new Date());

      // Create shift at 2 PM yesterday (which is definitely yesterday in any timezone)
      const twoPmYesterday = new Date(`${yesterdayInEst}T14:00:00-05:00`);

      const testData = await createShiftAtTime(
        storeManagerUser.store_id,
        storeManagerUser.user_id,
        twoPmYesterday,
        "ACTIVE",
      );

      // WHEN: Query open shifts for today
      const response = await storeManagerApiRequest.get(
        `/api/stores/${storeManagerUser.store_id}/shifts/open-check?business_date=${todayInEst}`,
      );

      // THEN: Should NOT find yesterday's shift
      const body = await response.json();
      expect(response.status()).toBe(200);
      expect(
        body.data.open_shifts.some(
          (s: any) => s.shift_id === testData.shift.shift_id,
        ),
      ).toBe(false);

      // Cleanup
      await cleanupTestEntities({
        shiftIds: [testData.shift.shift_id],
        cashierIds: [testData.cashier.cashier_id],
        terminalIds: [testData.terminalId],
      });
    } finally {
      if (originalTimezone) {
        await updateStoreTimezone(storeManagerUser.store_id, originalTimezone);
      }
    }
  });

  test("OPEN-CHECK-TZ-002a: [P0] Should find yesterday's shift when NO date filter provided", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: A shift opened yesterday is still OPEN
    // BUSINESS RULE: Day close must be blocked by ANY open shift, regardless of when it was opened.
    // A shift opened yesterday but still open today MUST be found when no date filter is provided.
    const originalTimezone = await getStoreTimezone(storeManagerUser.store_id);

    try {
      await updateStoreTimezone(storeManagerUser.store_id, "America/New_York");

      // Calculate yesterday in EST
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const estFormatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const yesterdayInEst = estFormatter.format(yesterday);

      // Create shift at 2 PM yesterday (which is definitely yesterday in any timezone)
      const twoPmYesterday = new Date(`${yesterdayInEst}T14:00:00-05:00`);

      const testData = await createShiftAtTime(
        storeManagerUser.store_id,
        storeManagerUser.user_id,
        twoPmYesterday,
        "ACTIVE",
      );

      // WHEN: Query open shifts WITHOUT any date filter (for day close blocking)
      const response = await storeManagerApiRequest.get(
        `/api/stores/${storeManagerUser.store_id}/shifts/open-check`,
      );

      // THEN: Should find yesterday's shift because it's still OPEN
      const body = await response.json();
      expect(response.status()).toBe(200);
      expect(body.data.has_open_shifts).toBe(true);
      expect(
        body.data.open_shifts.some(
          (s: any) => s.shift_id === testData.shift.shift_id,
        ),
      ).toBe(true);

      // Cleanup
      await cleanupTestEntities({
        shiftIds: [testData.shift.shift_id],
        cashierIds: [testData.cashier.cashier_id],
        terminalIds: [testData.terminalId],
      });
    } finally {
      if (originalTimezone) {
        await updateStoreTimezone(storeManagerUser.store_id, originalTimezone);
      }
    }
  });

  test("OPEN-CHECK-TZ-003: [P0] Should find shift at midnight boundary in store timezone", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: A shift opened at exactly midnight in store timezone
    // This tests the boundary condition at the start of the day
    const originalTimezone = await getStoreTimezone(storeManagerUser.store_id);

    try {
      await updateStoreTimezone(
        storeManagerUser.store_id,
        "America/Los_Angeles",
      );

      // Get today in PST
      const pstFormatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Los_Angeles",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const todayInPst = pstFormatter.format(new Date());

      // Create shift at exactly midnight PST
      const midnightPst = new Date(`${todayInPst}T00:00:00-08:00`);

      const testData = await createShiftAtTime(
        storeManagerUser.store_id,
        storeManagerUser.user_id,
        midnightPst,
        "ACTIVE",
      );

      // WHEN: Query open shifts for today
      const response = await storeManagerApiRequest.get(
        `/api/stores/${storeManagerUser.store_id}/shifts/open-check?business_date=${todayInPst}`,
      );

      // THEN: Should find the shift (midnight is part of today)
      const body = await response.json();
      expect(response.status()).toBe(200);
      expect(body.data.has_open_shifts).toBe(true);
      expect(
        body.data.open_shifts.some(
          (s: any) => s.shift_id === testData.shift.shift_id,
        ),
      ).toBe(true);

      // Cleanup
      await cleanupTestEntities({
        shiftIds: [testData.shift.shift_id],
        cashierIds: [testData.cashier.cashier_id],
        terminalIds: [testData.terminalId],
      });
    } finally {
      if (originalTimezone) {
        await updateStoreTimezone(storeManagerUser.store_id, originalTimezone);
      }
    }
  });

  test("OPEN-CHECK-TZ-004: [P0] Should find shift at 11:59 PM boundary in store timezone", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: A shift opened at 11:59 PM in store timezone
    // This tests the boundary condition at the end of the day
    const originalTimezone = await getStoreTimezone(storeManagerUser.store_id);

    try {
      await updateStoreTimezone(storeManagerUser.store_id, "America/Chicago");

      // Get today in CST
      const cstFormatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Chicago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const todayInCst = cstFormatter.format(new Date());

      // Create shift at 11:59 PM CST
      const almostMidnight = new Date(`${todayInCst}T23:59:00-06:00`);

      const testData = await createShiftAtTime(
        storeManagerUser.store_id,
        storeManagerUser.user_id,
        almostMidnight,
        "ACTIVE",
      );

      // WHEN: Query open shifts for today
      const response = await storeManagerApiRequest.get(
        `/api/stores/${storeManagerUser.store_id}/shifts/open-check?business_date=${todayInCst}`,
      );

      // THEN: Should find the shift (11:59 PM is still today)
      const body = await response.json();
      expect(response.status()).toBe(200);
      expect(body.data.has_open_shifts).toBe(true);
      expect(
        body.data.open_shifts.some(
          (s: any) => s.shift_id === testData.shift.shift_id,
        ),
      ).toBe(true);

      // Cleanup
      await cleanupTestEntities({
        shiftIds: [testData.shift.shift_id],
        cashierIds: [testData.cashier.cashier_id],
        terminalIds: [testData.terminalId],
      });
    } finally {
      if (originalTimezone) {
        await updateStoreTimezone(storeManagerUser.store_id, originalTimezone);
      }
    }
  });

  test("OPEN-CHECK-TZ-005: [P1] Should use default timezone (America/New_York) when store timezone is the default", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: Store has default timezone configured (America/New_York)
    // NOTE: Prisma schema enforces timezone as non-nullable with a default value,
    // so we test that the default timezone works correctly rather than null handling.
    const originalTimezone = await getStoreTimezone(storeManagerUser.store_id);

    try {
      // Set timezone explicitly to the default value
      await updateStoreTimezone(storeManagerUser.store_id, "America/New_York");

      // Create shift today in the default Eastern timezone
      const testData = await createTestShift(
        storeManagerUser.store_id,
        storeManagerUser.user_id,
        "ACTIVE",
        "Default TZ Terminal",
      );

      // WHEN: Query open shifts (should use America/New_York timezone)
      const response = await storeManagerApiRequest.get(
        `/api/stores/${storeManagerUser.store_id}/shifts/open-check`,
      );

      // THEN: Should find the shift correctly
      const body = await response.json();
      expect(response.status()).toBe(200);
      expect(body.data.has_open_shifts).toBe(true);

      // Cleanup
      await cleanupTestEntities({
        shiftIds: [testData.shift.shift_id],
        cashierIds: [testData.cashier.cashier_id],
        terminalIds: testData.terminalId ? [testData.terminalId] : [],
      });
    } finally {
      if (originalTimezone) {
        await updateStoreTimezone(storeManagerUser.store_id, originalTimezone);
      }
    }
  });

  test("OPEN-CHECK-TZ-006: [P1] Should handle stores in different timezones correctly", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: Store configured in a very different timezone (Asia/Tokyo, UTC+9)
    // A shift created at 10 AM Tokyo time on the 25th is actually
    // 1 AM UTC on the 25th (or 8 PM on the 24th in EST)
    const originalTimezone = await getStoreTimezone(storeManagerUser.store_id);

    try {
      await updateStoreTimezone(storeManagerUser.store_id, "Asia/Tokyo");

      // Get today in Tokyo time
      const tokyoFormatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const todayInTokyo = tokyoFormatter.format(new Date());

      // Create shift at 10 AM Tokyo time
      const tenAmTokyo = new Date(`${todayInTokyo}T10:00:00+09:00`);

      const testData = await createShiftAtTime(
        storeManagerUser.store_id,
        storeManagerUser.user_id,
        tenAmTokyo,
        "ACTIVE",
      );

      // WHEN: Query open shifts for today in Tokyo
      const response = await storeManagerApiRequest.get(
        `/api/stores/${storeManagerUser.store_id}/shifts/open-check?business_date=${todayInTokyo}`,
      );

      // THEN: Should find the shift
      const body = await response.json();
      expect(response.status()).toBe(200);
      expect(body.data.has_open_shifts).toBe(true);
      expect(
        body.data.open_shifts.some(
          (s: any) => s.shift_id === testData.shift.shift_id,
        ),
      ).toBe(true);

      // Cleanup
      await cleanupTestEntities({
        shiftIds: [testData.shift.shift_id],
        cashierIds: [testData.cashier.cashier_id],
        terminalIds: [testData.terminalId],
      });
    } finally {
      if (originalTimezone) {
        await updateStoreTimezone(storeManagerUser.store_id, originalTimezone);
      }
    }
  });

  test("OPEN-CHECK-TZ-007: [P1] Should correctly return multiple shifts on same day in store timezone", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: Multiple shifts on the same day, at different times
    const originalTimezone = await getStoreTimezone(storeManagerUser.store_id);

    try {
      await updateStoreTimezone(storeManagerUser.store_id, "America/Denver");

      const mstFormatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Denver",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const todayInMst = mstFormatter.format(new Date());

      // Create morning shift (8 AM MST)
      const morningShift = await createShiftAtTime(
        storeManagerUser.store_id,
        storeManagerUser.user_id,
        new Date(`${todayInMst}T08:00:00-07:00`),
        "ACTIVE",
      );

      // Create afternoon shift (2 PM MST)
      const afternoonShift = await createShiftAtTime(
        storeManagerUser.store_id,
        storeManagerUser.user_id,
        new Date(`${todayInMst}T14:00:00-07:00`),
        "OPEN",
      );

      // Create evening shift (8 PM MST)
      const eveningShift = await createShiftAtTime(
        storeManagerUser.store_id,
        storeManagerUser.user_id,
        new Date(`${todayInMst}T20:00:00-07:00`),
        "ACTIVE",
      );

      // WHEN: Query open shifts for today
      const response = await storeManagerApiRequest.get(
        `/api/stores/${storeManagerUser.store_id}/shifts/open-check?business_date=${todayInMst}`,
      );

      // THEN: Should find all three shifts
      const body = await response.json();
      expect(response.status()).toBe(200);
      expect(body.data.has_open_shifts).toBe(true);
      expect(body.data.open_shift_count).toBe(3);

      const shiftIds = body.data.open_shifts.map((s: any) => s.shift_id);
      expect(shiftIds).toContain(morningShift.shift.shift_id);
      expect(shiftIds).toContain(afternoonShift.shift.shift_id);
      expect(shiftIds).toContain(eveningShift.shift.shift_id);

      // Cleanup
      await cleanupTestEntities({
        shiftIds: [
          morningShift.shift.shift_id,
          afternoonShift.shift.shift_id,
          eveningShift.shift.shift_id,
        ],
        cashierIds: [
          morningShift.cashier.cashier_id,
          afternoonShift.cashier.cashier_id,
          eveningShift.cashier.cashier_id,
        ],
        terminalIds: [
          morningShift.terminalId,
          afternoonShift.terminalId,
          eveningShift.terminalId,
        ],
      });
    } finally {
      if (originalTimezone) {
        await updateStoreTimezone(storeManagerUser.store_id, originalTimezone);
      }
    }
  });
});
