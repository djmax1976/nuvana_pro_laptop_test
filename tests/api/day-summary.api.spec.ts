import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createUser,
  createCompany,
  createStore,
  createShift,
  createExpiredJWTAccessToken,
  createCashier,
} from "../support/factories";
import { Prisma } from "@prisma/client";

/**
 * @test-level API
 * @justification Endpoint integration tests verifying HTTP layer, authentication, authorization,
 *                request/response format, and error handling for Day Summary API endpoints
 * @story shift-day-summary-phase-3
 *
 * Day Summary API Tests - Phase 3.1 Shift & Day Summary Implementation
 *
 * STORY: As a Client Owner/Manager, I want to view daily summary reports,
 * so that I can review aggregated sales and cash data for business days.
 *
 * TEST LEVEL: API (endpoint integration tests)
 * PRIMARY GOAL: Verify Day Summary endpoints return correct aggregated data
 *
 * BUSINESS RULES TESTED:
 * - Day summaries aggregate all shifts for a business date
 * - Day close requires all shifts to be closed first
 * - Authentication required (JWT token)
 * - Authorization required (SHIFT_REPORT_VIEW, SHIFT_CLOSE permissions)
 * - Multi-tenant isolation (store_id must be accessible to user)
 * - Date validation (YYYY-MM-DD format)
 * - Status transitions (OPEN -> PENDING_CLOSE -> CLOSED)
 *
 * ================================================================================
 * TRACEABILITY MATRIX
 * ================================================================================
 *
 * | Test ID           | Requirement                          | API Endpoint                                    | Priority |
 * |-------------------|--------------------------------------|-------------------------------------------------|----------|
 * | DAY-SUMMARY-001   | AUTH-001: JWT Required               | GET /api/stores/:storeId/day-summaries          | P0       |
 * | DAY-SUMMARY-002   | AUTH-002: JWT Validation             | GET /api/stores/:storeId/day-summary/:date      | P0       |
 * | DAY-SUMMARY-003   | AUTH-003: Token Expiry               | GET /api/stores/:storeId/day-summaries          | P0       |
 * | DAY-SUMMARY-004   | AUTH-001: JWT Required               | POST /api/stores/:storeId/day-summary/:date/close| P0      |
 * | DAY-SUMMARY-010   | AUTHZ-001: SHIFT_REPORT_VIEW         | GET /api/stores/:storeId/day-summaries          | P0       |
 * | DAY-SUMMARY-011   | AUTHZ-002: SHIFT_CLOSE               | POST /api/stores/:storeId/day-summary/:date/close| P0      |
 * | DAY-SUMMARY-012   | AUTHZ-001: Permission Grant          | GET /api/stores/:storeId/day-summaries          | P0       |
 * | DAY-SUMMARY-020   | VAL-001: UUID Format                 | GET /api/stores/:storeId/day-summaries          | P0       |
 * | DAY-SUMMARY-021   | VAL-002: Date Format YYYY-MM-DD      | GET /api/stores/:storeId/day-summary/:date      | P0       |
 * | DAY-SUMMARY-022   | VAL-003: Date Value Validity         | GET /api/stores/:storeId/day-summary/:date      | P0       |
 * | DAY-SUMMARY-023   | VAL-004: Date Range Max 365 Days     | GET /api/stores/:storeId/day-summaries          | P0       |
 * | DAY-SUMMARY-024   | VAL-005: Date Range Order            | GET /api/stores/:storeId/day-summaries          | P0       |
 * | DAY-SUMMARY-030   | BIZ-001: Empty List Response         | GET /api/stores/:storeId/day-summaries          | P1       |
 * | DAY-SUMMARY-031   | BIZ-002: Sorted by Date DESC         | GET /api/stores/:storeId/day-summaries          | P1       |
 * | DAY-SUMMARY-032   | BIZ-003: Filter by Status            | GET /api/stores/:storeId/day-summaries          | P1       |
 * | DAY-SUMMARY-033   | BIZ-004: Filter by Date Range        | GET /api/stores/:storeId/day-summaries          | P1       |
 * | DAY-SUMMARY-040   | BIZ-005: 404 for Non-existent        | GET /api/stores/:storeId/day-summary/:date      | P1       |
 * | DAY-SUMMARY-041   | BIZ-006: Return All Fields           | GET /api/stores/:storeId/day-summary/:date      | P1       |
 * | DAY-SUMMARY-050   | BIZ-007: Block Close with Open Shifts| POST /api/stores/:storeId/day-summary/:date/close| P1      |
 * | DAY-SUMMARY-051   | BIZ-008: Block Double Close          | POST /api/stores/:storeId/day-summary/:date/close| P1      |
 * | DAY-SUMMARY-052   | BIZ-009: Successful Close            | POST /api/stores/:storeId/day-summary/:date/close| P1      |
 * | DAY-SUMMARY-060   | RPT-001: Weekly Report               | GET /api/stores/:storeId/reports/weekly         | P1       |
 * | DAY-SUMMARY-070   | RPT-002: Monthly Report              | GET /api/stores/:storeId/reports/monthly        | P1       |
 * | DAY-SUMMARY-071   | RPT-003: Month Validation            | GET /api/stores/:storeId/reports/monthly        | P1       |
 * | DAY-SUMMARY-080   | RPT-004: Date Range Report           | GET /api/stores/:storeId/reports/date-range     | P1       |
 * | DAY-SUMMARY-081   | RPT-005: Daily Breakdown Include     | GET /api/stores/:storeId/reports/date-range     | P1       |
 * | DAY-SUMMARY-090   | SEC-001: Tenant Isolation            | GET /api/stores/:storeId/day-summaries          | P2       |
 * | DAY-SUMMARY-100   | BIZ-010: Update Notes                | PATCH /api/stores/:storeId/day-summary/:date/notes| P2     |
 * | DAY-SUMMARY-101   | BIZ-011: Clear Notes                 | PATCH /api/stores/:storeId/day-summary/:date/notes| P2     |
 * | DAY-SUMMARY-102   | VAL-006: Notes Max Length            | PATCH /api/stores/:storeId/day-summary/:date/notes| P2     |
 * | DAY-SUMMARY-110   | BIZ-012: Get by ID                   | GET /api/day-summaries/:daySummaryId            | P2       |
 * | DAY-SUMMARY-111   | BIZ-013: 404 for Non-existent ID     | GET /api/day-summaries/:daySummaryId            | P2       |
 * | DAY-SUMMARY-112   | VAL-007: UUID Format for ID          | GET /api/day-summaries/:daySummaryId            | P2       |
 * | DAY-SUMMARY-120   | BIZ-014: Refresh Summary             | POST /api/stores/:storeId/day-summary/:date/refresh| P3    |
 *
 * REQUIREMENT COVERAGE:
 * - Authentication (AUTH-001 to AUTH-003): 4 tests
 * - Authorization (AUTHZ-001 to AUTHZ-002): 3 tests
 * - Validation (VAL-001 to VAL-007): 7 tests
 * - Business Logic (BIZ-001 to BIZ-014): 17 tests
 * - Reports (RPT-001 to RPT-005): 5 tests
 * - Security (SEC-001): 1 test
 * ================================================================================
 */

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Creates a POS terminal for testing
 */
async function createPOSTerminal(
  prismaClient: any,
  storeId: string,
  name?: string,
): Promise<{ pos_terminal_id: string; store_id: string; name: string }> {
  const uniqueId = crypto.randomUUID();
  const terminal = await prismaClient.pOSTerminal.create({
    data: {
      store_id: storeId,
      name: name || `Terminal ${uniqueId.substring(0, 8)}`,
      device_id: `device-${uniqueId}`,
      deleted_at: null,
    },
  });

  return {
    pos_terminal_id: terminal.pos_terminal_id,
    store_id: terminal.store_id,
    name: terminal.name,
  };
}

/**
 * Creates a test Cashier for testing shifts
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

/**
 * Creates a CLOSED shift for a specific business date
 */
async function createClosedShift(
  prismaClient: any,
  storeId: string,
  openedBy: string,
  cashierId: string,
  posTerminalId: string,
  businessDate: Date,
  openingCash: number = 100.0,
  closingCash: number = 250.0,
): Promise<{ shift_id: string; status: string }> {
  // Set shift times within the business date
  const openedAt = new Date(businessDate);
  openedAt.setHours(8, 0, 0, 0);
  const closedAt = new Date(businessDate);
  closedAt.setHours(16, 0, 0, 0);

  const shift = await prismaClient.shift.create({
    data: {
      ...createShift({
        store_id: storeId,
        opened_by: openedBy,
        cashier_id: cashierId,
        pos_terminal_id: posTerminalId,
        opening_cash: new Prisma.Decimal(openingCash),
        closing_cash: new Prisma.Decimal(closingCash),
        expected_cash: new Prisma.Decimal(200.0),
        variance: new Prisma.Decimal(closingCash - 200.0),
        status: "CLOSED",
        opened_at: openedAt,
        closed_at: closedAt,
      }),
    },
  });

  return {
    shift_id: shift.shift_id,
    status: shift.status,
  };
}

/**
 * Creates an ACTIVE shift for testing
 */
async function createActiveShift(
  prismaClient: any,
  storeId: string,
  openedBy: string,
  cashierId: string,
  posTerminalId: string,
  businessDate: Date,
  openingCash: number = 100.0,
): Promise<{ shift_id: string; status: string }> {
  const openedAt = new Date(businessDate);
  openedAt.setHours(8, 0, 0, 0);

  const shift = await prismaClient.shift.create({
    data: {
      ...createShift({
        store_id: storeId,
        opened_by: openedBy,
        cashier_id: cashierId,
        pos_terminal_id: posTerminalId,
        opening_cash: new Prisma.Decimal(openingCash),
        status: "ACTIVE",
        opened_at: openedAt,
      }),
    },
  });

  return {
    shift_id: shift.shift_id,
    status: shift.status,
  };
}

/**
 * Creates a day summary for testing
 */
async function createDaySummary(
  prismaClient: any,
  storeId: string,
  businessDate: Date,
  status: "OPEN" | "PENDING_CLOSE" | "CLOSED" = "OPEN",
  closedBy?: string,
): Promise<{ day_summary_id: string; status: string }> {
  const normalizedDate = new Date(businessDate);
  normalizedDate.setHours(0, 0, 0, 0);

  const daySummary = await prismaClient.daySummary.create({
    data: {
      store_id: storeId,
      business_date: normalizedDate,
      status,
      shift_count: 1,
      gross_sales: new Prisma.Decimal(500.0),
      net_sales: new Prisma.Decimal(450.0),
      tax_collected: new Prisma.Decimal(40.0),
      transaction_count: 10,
      total_cash_variance: new Prisma.Decimal(5.0),
      closed_at: status === "CLOSED" ? new Date() : null,
      closed_by: closedBy || null,
    },
  });

  return {
    day_summary_id: daySummary.day_summary_id,
    status: daySummary.status,
  };
}

/**
 * Formats a date to YYYY-MM-DD string
 */
function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Cleans up test data for a store
 */
async function cleanupStoreData(
  prismaClient: any,
  storeId: string,
): Promise<void> {
  // Delete child summaries first
  await prismaClient.dayTenderSummary.deleteMany({
    where: { day_summary: { store_id: storeId } },
  });
  await prismaClient.dayDepartmentSummary.deleteMany({
    where: { day_summary: { store_id: storeId } },
  });
  await prismaClient.dayTaxSummary.deleteMany({
    where: { day_summary: { store_id: storeId } },
  });
  await prismaClient.dayHourlySummary.deleteMany({
    where: { day_summary: { store_id: storeId } },
  });

  // Delete day summaries
  await prismaClient.daySummary.deleteMany({
    where: { store_id: storeId },
  });

  // Delete shifts
  await prismaClient.shift.deleteMany({
    where: { store_id: storeId },
  });
}

// =============================================================================
// SECTION 1: P0 CRITICAL - AUTHENTICATION TESTS
// =============================================================================

test.describe("DAY-SUMMARY-API: Authentication", () => {
  test("DAY-SUMMARY-001: [P0] should return 401 when JWT token is missing for list endpoint", async ({
    apiRequest,
  }) => {
    // GIVEN: Valid store ID format
    const storeId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Requesting day summaries without JWT token
    const response = await apiRequest.get(
      `/api/stores/${storeId}/day-summaries`,
    );

    // THEN: Should return 401 Unauthorized
    expect(response.status(), "Should return 401 for missing token").toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be UNAUTHORIZED").toBe(
      "UNAUTHORIZED",
    );
  });

  test("DAY-SUMMARY-002: [P0] should return 401 when JWT token is invalid", async ({
    apiRequest,
  }) => {
    // GIVEN: An invalid JWT token
    const invalidToken = "invalid.jwt.token";
    const storeId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Requesting day summary with invalid token
    const response = await apiRequest.get(
      `/api/stores/${storeId}/day-summary/2024-01-15`,
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

  test("DAY-SUMMARY-003: [P0] should return 401 when JWT token is expired", async ({
    apiRequest,
  }) => {
    // GIVEN: An expired JWT token
    const expiredToken = createExpiredJWTAccessToken();
    const storeId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Requesting day summary with expired token
    const response = await apiRequest.get(
      `/api/stores/${storeId}/day-summaries`,
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

  test("DAY-SUMMARY-004: [P0] should return 401 for close endpoint without token", async ({
    apiRequest,
  }) => {
    // GIVEN: Valid store ID and date
    const storeId = "00000000-0000-0000-0000-000000000000";
    const date = "2024-01-15";

    // WHEN: Closing day without JWT token
    const response = await apiRequest.post(
      `/api/stores/${storeId}/day-summary/${date}/close`,
    );

    // THEN: Should return 401 Unauthorized
    expect(response.status(), "Should return 401 for missing token").toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });
});

// =============================================================================
// SECTION 2: P0 CRITICAL - AUTHORIZATION TESTS
// =============================================================================

test.describe("DAY-SUMMARY-API: Authorization", () => {
  test("DAY-SUMMARY-010: [P0] should return 403 when user lacks SHIFT_REPORT_VIEW permission", async ({
    regularUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: User without SHIFT_REPORT_VIEW permission
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    try {
      // WHEN: Requesting day summaries without permission
      const response = await regularUserApiRequest.get(
        `/api/stores/${store.store_id}/day-summaries`,
      );

      // THEN: Should return 403 Forbidden
      expect(
        response.status(),
        "Should return 403 for missing permission",
      ).toBe(403);
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
      expect(body.error.code, "Error code should be PERMISSION_DENIED").toBe(
        "PERMISSION_DENIED",
      );
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });

  test("DAY-SUMMARY-011: [P0] should return 403 when user lacks SHIFT_CLOSE permission for close endpoint", async ({
    regularUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: User without SHIFT_CLOSE permission
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const today = formatDate(new Date());

    try {
      // WHEN: Attempting to close day without permission
      const response = await regularUserApiRequest.post(
        `/api/stores/${store.store_id}/day-summary/${today}/close`,
      );

      // THEN: Should return 403 Forbidden
      expect(
        response.status(),
        "Should return 403 for missing permission",
      ).toBe(403);
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
      expect(body.error.code, "Error code should be PERMISSION_DENIED").toBe(
        "PERMISSION_DENIED",
      );
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });

  test("DAY-SUMMARY-012: [P0] should allow access with valid SHIFT_REPORT_VIEW permission", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Store manager with SHIFT_REPORT_VIEW permission
    // Use the store from the fixture that the store manager already has access to
    const storeId = storeManagerUser.store_id;

    try {
      // Ensure no day summaries exist from previous tests
      await cleanupStoreData(prismaClient, storeId);

      // WHEN: Requesting day summaries with proper permission
      const response = await storeManagerApiRequest.get(
        `/api/stores/${storeId}/day-summaries`,
      );

      // THEN: Should return 200 OK
      expect(response.status(), "Should return 200 with valid permission").toBe(
        200,
      );
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(Array.isArray(body.data), "Data should be an array").toBe(true);
    } finally {
      await cleanupStoreData(prismaClient, storeId);
    }
  });
});

// =============================================================================
// SECTION 3: P0 CRITICAL - VALIDATION TESTS
// =============================================================================

test.describe("DAY-SUMMARY-API: Input Validation", () => {
  test("DAY-SUMMARY-020: [P0] should return 400 for invalid store ID format", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Invalid store ID format
    const invalidStoreId = "not-a-uuid";

    // WHEN: Requesting day summaries with invalid store ID
    const response = await superadminApiRequest.get(
      `/api/stores/${invalidStoreId}/day-summaries`,
    );

    // THEN: Should return 400 Bad Request
    expect(response.status(), "Should return 400 for invalid UUID").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be VALIDATION_ERROR").toBe(
      "VALIDATION_ERROR",
    );
  });

  test("DAY-SUMMARY-021: [P0] should return 400 for invalid date format", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Valid store but invalid date format
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    try {
      // WHEN: Requesting day summary with invalid date format
      const response = await superadminApiRequest.get(
        `/api/stores/${store.store_id}/day-summary/01-15-2024`,
      );

      // THEN: Should return 400 Bad Request
      expect(response.status(), "Should return 400 for invalid date").toBe(400);
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });

  test("DAY-SUMMARY-022: [P0] should return 400 for invalid date value", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Valid store but invalid date value
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    try {
      // WHEN: Requesting day summary with impossible date
      const response = await superadminApiRequest.get(
        `/api/stores/${store.store_id}/day-summary/2024-13-45`,
      );

      // THEN: Should return 400 Bad Request
      expect(response.status(), "Should return 400 for invalid date").toBe(400);
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });

  test("DAY-SUMMARY-023: [P0] should return 400 for date range exceeding 365 days", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Valid store with excessive date range
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    try {
      // WHEN: Requesting day summaries with range > 365 days
      const response = await superadminApiRequest.get(
        `/api/stores/${store.store_id}/day-summaries?start_date=2022-01-01&end_date=2024-01-01`,
      );

      // THEN: Should return 400 Bad Request
      expect(
        response.status(),
        "Should return 400 for excessive date range",
      ).toBe(400);
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });

  test("DAY-SUMMARY-024: [P0] should return 400 when start_date is after end_date", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Valid store with invalid date order
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    try {
      // WHEN: Requesting day summaries with reversed date range
      const response = await superadminApiRequest.get(
        `/api/stores/${store.store_id}/day-summaries?start_date=2024-12-01&end_date=2024-01-01`,
      );

      // THEN: Should return 400 Bad Request
      expect(
        response.status(),
        "Should return 400 for reversed date range",
      ).toBe(400);
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });
});

// =============================================================================
// SECTION 4: P1 HIGH - BUSINESS LOGIC TESTS
// =============================================================================

test.describe("DAY-SUMMARY-API: Business Logic - List Day Summaries", () => {
  test("DAY-SUMMARY-030: [P1] should return empty array when no day summaries exist", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store with no day summaries
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    try {
      // WHEN: Requesting day summaries
      const response = await superadminApiRequest.get(
        `/api/stores/${store.store_id}/day-summaries`,
      );

      // THEN: Should return empty array
      expect(response.status(), "Should return 200").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data, "Data should be empty array").toEqual([]);
      expect(body.meta.total, "Total should be 0").toBe(0);
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });

  test("DAY-SUMMARY-031: [P1] should return day summaries sorted by date descending", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store with multiple day summaries
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    const date1 = new Date("2024-01-10");
    const date2 = new Date("2024-01-15");
    const date3 = new Date("2024-01-20");

    await createDaySummary(prismaClient, store.store_id, date1);
    await createDaySummary(prismaClient, store.store_id, date2);
    await createDaySummary(prismaClient, store.store_id, date3);

    try {
      // WHEN: Requesting day summaries
      const response = await superadminApiRequest.get(
        `/api/stores/${store.store_id}/day-summaries`,
      );

      // THEN: Should return summaries sorted by date descending
      expect(response.status(), "Should return 200").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data.length, "Should return 3 summaries").toBe(3);
      expect(body.data[0].business_date, "First should be most recent").toBe(
        "2024-01-20",
      );
      expect(body.data[2].business_date, "Last should be oldest").toBe(
        "2024-01-10",
      );
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });

  test("DAY-SUMMARY-032: [P1] should filter by status", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store with day summaries in different statuses
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    await createDaySummary(
      prismaClient,
      store.store_id,
      new Date("2024-01-10"),
      "OPEN",
    );
    await createDaySummary(
      prismaClient,
      store.store_id,
      new Date("2024-01-11"),
      "CLOSED",
      owner.user_id,
    );
    await createDaySummary(
      prismaClient,
      store.store_id,
      new Date("2024-01-12"),
      "PENDING_CLOSE",
    );

    try {
      // WHEN: Filtering by CLOSED status
      const response = await superadminApiRequest.get(
        `/api/stores/${store.store_id}/day-summaries?status=CLOSED`,
      );

      // THEN: Should return only CLOSED summaries
      expect(response.status(), "Should return 200").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data.length, "Should return 1 summary").toBe(1);
      expect(body.data[0].status, "Status should be CLOSED").toBe("CLOSED");
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });

  test("DAY-SUMMARY-033: [P1] should filter by date range", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store with day summaries across a range
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    await createDaySummary(
      prismaClient,
      store.store_id,
      new Date("2024-01-05"),
    );
    await createDaySummary(
      prismaClient,
      store.store_id,
      new Date("2024-01-10"),
    );
    await createDaySummary(
      prismaClient,
      store.store_id,
      new Date("2024-01-15"),
    );
    await createDaySummary(
      prismaClient,
      store.store_id,
      new Date("2024-01-20"),
    );

    try {
      // WHEN: Filtering by date range
      const response = await superadminApiRequest.get(
        `/api/stores/${store.store_id}/day-summaries?start_date=2024-01-08&end_date=2024-01-17`,
      );

      // THEN: Should return only summaries within range
      expect(response.status(), "Should return 200").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data.length, "Should return 2 summaries").toBe(2);
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });
});

test.describe("DAY-SUMMARY-API: Business Logic - Get Day Summary", () => {
  test("DAY-SUMMARY-040: [P1] should return 404 for non-existent day summary", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store without a day summary for the date
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    try {
      // WHEN: Requesting non-existent day summary
      const response = await superadminApiRequest.get(
        `/api/stores/${store.store_id}/day-summary/2024-01-15`,
      );

      // THEN: Should return 404 Not Found
      expect(response.status(), "Should return 404").toBe(404);
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
      expect(body.error.code, "Error code should be NOT_FOUND").toBe(
        "NOT_FOUND",
      );
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });

  test("DAY-SUMMARY-041: [P1] should return day summary with all fields", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store with a day summary
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    const businessDate = new Date("2024-01-15");
    await createDaySummary(prismaClient, store.store_id, businessDate, "OPEN");

    try {
      // WHEN: Requesting day summary
      const response = await superadminApiRequest.get(
        `/api/stores/${store.store_id}/day-summary/2024-01-15`,
      );

      // THEN: Should return day summary with all expected fields
      expect(response.status(), "Should return 200").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(
        body.data.day_summary_id,
        "Should have day_summary_id",
      ).toBeDefined();
      expect(body.data.store_id, "Should have store_id").toBe(store.store_id);
      expect(body.data.business_date, "Should have business_date").toBe(
        "2024-01-15",
      );
      expect(body.data.status, "Should have status").toBe("OPEN");
      expect(body.data.gross_sales, "Should have gross_sales").toBeDefined();
      expect(body.data.net_sales, "Should have net_sales").toBeDefined();
      expect(
        body.data.tax_collected,
        "Should have tax_collected",
      ).toBeDefined();
      expect(
        body.data.transaction_count,
        "Should have transaction_count",
      ).toBeDefined();
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });
});

test.describe("DAY-SUMMARY-API: Business Logic - Close Day", () => {
  test("DAY-SUMMARY-050: [P1] should return 400 when closing day with open shifts", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store with an ACTIVE shift
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await createPOSTerminal(prismaClient, store.store_id);
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );

    const today = new Date();
    await createActiveShift(
      prismaClient,
      store.store_id,
      owner.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      today,
    );

    // Create day summary
    await createDaySummary(prismaClient, store.store_id, today, "OPEN");

    try {
      // WHEN: Attempting to close the day
      const response = await superadminApiRequest.post(
        `/api/stores/${store.store_id}/day-summary/${formatDate(today)}/close`,
        {}, // Empty body is valid - notes are optional
      );

      // THEN: Should return 400 Bad Request
      expect(response.status(), "Should return 400 for open shifts").toBe(400);
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
      expect(body.error.code, "Error code should be DAY_NOT_READY").toBe(
        "DAY_NOT_READY",
      );
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.cashier.delete({
        where: { cashier_id: cashier.cashier_id },
      });
      await prismaClient.pOSTerminal.delete({
        where: { pos_terminal_id: terminal.pos_terminal_id },
      });
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });

  test("DAY-SUMMARY-051: [P1] should return 409 when day is already closed", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store with a CLOSED day summary
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    const businessDate = new Date("2024-01-15");
    await createDaySummary(
      prismaClient,
      store.store_id,
      businessDate,
      "CLOSED",
      owner.user_id,
    );

    try {
      // WHEN: Attempting to close again
      const response = await superadminApiRequest.post(
        `/api/stores/${store.store_id}/day-summary/2024-01-15/close`,
        {}, // Empty body is valid - notes are optional
      );

      // THEN: Should return 409 Conflict
      expect(response.status(), "Should return 409 for already closed").toBe(
        409,
      );
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
      expect(body.error.code, "Error code should be DAY_ALREADY_CLOSED").toBe(
        "DAY_ALREADY_CLOSED",
      );
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });

  test("DAY-SUMMARY-052: [P1] should successfully close day when all shifts are closed", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store with all shifts closed
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await createPOSTerminal(prismaClient, store.store_id);
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );

    const businessDate = new Date("2024-01-15");
    await createClosedShift(
      prismaClient,
      store.store_id,
      owner.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      businessDate,
    );

    // Create day summary in PENDING_CLOSE status
    await createDaySummary(
      prismaClient,
      store.store_id,
      businessDate,
      "PENDING_CLOSE",
    );

    try {
      // WHEN: Closing the day
      const response = await superadminApiRequest.post(
        `/api/stores/${store.store_id}/day-summary/2024-01-15/close`,
        { notes: "Day closed successfully" },
      );

      // THEN: Should return 200 OK with closed summary
      expect(response.status(), "Should return 200").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data.status, "Status should be CLOSED").toBe("CLOSED");
      expect(body.data.closed_at, "Should have closed_at").toBeDefined();
      expect(body.data.closed_by, "Should have closed_by").toBeDefined();
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.cashier.delete({
        where: { cashier_id: cashier.cashier_id },
      });
      await prismaClient.pOSTerminal.delete({
        where: { pos_terminal_id: terminal.pos_terminal_id },
      });
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });

  test("DAY-SUMMARY-053: [P0] should return SHIFTS_STILL_OPEN with shift details when closing day with open shifts", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store with an OPEN shift (defense-in-depth validation)
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await createPOSTerminal(prismaClient, store.store_id);
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );

    const today = new Date();
    const shift = await prismaClient.shift.create({
      data: createShift({
        store_id: store.store_id,
        cashier_id: cashier.cashier_id,
        pos_terminal_id: terminal.pos_terminal_id,
        opened_by: owner.user_id,
        status: "OPEN", // Explicitly OPEN
        opened_at: today,
      }),
    });

    // Create day summary
    await createDaySummary(prismaClient, store.store_id, today, "OPEN");

    try {
      // WHEN: Attempting to close the day
      const response = await superadminApiRequest.post(
        `/api/stores/${store.store_id}/day-summary/${formatDate(today)}/close`,
        {},
      );

      // THEN: Should return 400 with SHIFTS_STILL_OPEN and open shift details
      expect(response.status(), "Should return 400 for open shifts").toBe(400);
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
      expect(body.error.code, "Error code should be SHIFTS_STILL_OPEN").toBe(
        "SHIFTS_STILL_OPEN",
      );
      expect(
        body.error.details?.open_shifts,
        "Should include open_shifts array",
      ).toBeDefined();
      expect(
        body.error.details.open_shifts.length,
        "Should have at least 1 open shift",
      ).toBeGreaterThan(0);

      // Verify shift details are included for actionable UX
      const openShift = body.error.details.open_shifts[0];
      expect(
        openShift.shift_id,
        "Open shift should have shift_id",
      ).toBeDefined();
      expect(openShift.status, "Open shift should have status").toBeDefined();
      expect(
        openShift.cashier_name,
        "Open shift should have cashier_name",
      ).toBeDefined();
      expect(
        openShift.opened_at,
        "Open shift should have opened_at",
      ).toBeDefined();
    } finally {
      await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.cashier.delete({
        where: { cashier_id: cashier.cashier_id },
      });
      await prismaClient.pOSTerminal.delete({
        where: { pos_terminal_id: terminal.pos_terminal_id },
      });
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });

  test("DAY-SUMMARY-054: [P0] should return LOTTERY_NOT_CLOSED when lottery day is open", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store with all shifts closed but lottery day NOT closed
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await createPOSTerminal(prismaClient, store.store_id);
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Create CLOSED shift
    const shift = await prismaClient.shift.create({
      data: createShift({
        store_id: store.store_id,
        cashier_id: cashier.cashier_id,
        pos_terminal_id: terminal.pos_terminal_id,
        opened_by: owner.user_id,
        status: "CLOSED",
        opened_at: today,
        closed_at: new Date(),
        closing_cash: new Prisma.Decimal(150),
      }),
    });

    // Create day summary
    await createDaySummary(prismaClient, store.store_id, today, "OPEN");

    // Create lottery business day that is NOT closed (status OPEN)
    const lotteryDay = await prismaClient.lotteryBusinessDay.create({
      data: {
        store_id: store.store_id,
        business_date: today,
        status: "OPEN", // Lottery NOT closed
      },
    });

    try {
      // WHEN: Attempting to close the day
      const response = await superadminApiRequest.post(
        `/api/stores/${store.store_id}/day-summary/${formatDate(today)}/close`,
        {},
      );

      // THEN: Should return 400 with LOTTERY_NOT_CLOSED
      expect(
        response.status(),
        "Should return 400 for lottery not closed",
      ).toBe(400);
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
      expect(body.error.code, "Error code should be LOTTERY_NOT_CLOSED").toBe(
        "LOTTERY_NOT_CLOSED",
      );
      expect(
        body.error.message,
        "Error message should mention lottery",
      ).toContain("Lottery");
    } finally {
      await prismaClient.lotteryBusinessDay.delete({
        where: { day_id: lotteryDay.day_id },
      });
      await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.cashier.delete({
        where: { cashier_id: cashier.cashier_id },
      });
      await prismaClient.pOSTerminal.delete({
        where: { pos_terminal_id: terminal.pos_terminal_id },
      });
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });

  test("DAY-SUMMARY-055: [P0] should allow close when lottery day is CLOSED", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store with all shifts closed AND lottery day closed
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await createPOSTerminal(prismaClient, store.store_id);
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );

    const businessDate = new Date("2024-01-15");
    businessDate.setHours(0, 0, 0, 0);

    // Create CLOSED shift
    const shift = await prismaClient.shift.create({
      data: createShift({
        store_id: store.store_id,
        cashier_id: cashier.cashier_id,
        pos_terminal_id: terminal.pos_terminal_id,
        opened_by: owner.user_id,
        status: "CLOSED",
        opened_at: businessDate,
        closed_at: new Date(),
        closing_cash: new Prisma.Decimal(150),
      }),
    });

    // Create day summary
    await createDaySummary(
      prismaClient,
      store.store_id,
      businessDate,
      "PENDING_CLOSE",
    );

    // Create lottery business day that IS closed
    const lotteryDay = await prismaClient.lotteryBusinessDay.create({
      data: {
        store_id: store.store_id,
        business_date: businessDate,
        status: "CLOSED", // Lottery IS closed
        closed_at: new Date(),
      },
    });

    try {
      // WHEN: Attempting to close the day
      const response = await superadminApiRequest.post(
        `/api/stores/${store.store_id}/day-summary/2024-01-15/close`,
        { notes: "Day closed with lottery completed" },
      );

      // THEN: Should return 200 success
      expect(response.status(), "Should return 200").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data.status, "Status should be CLOSED").toBe("CLOSED");
    } finally {
      await prismaClient.lotteryBusinessDay.delete({
        where: { day_id: lotteryDay.day_id },
      });
      await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.cashier.delete({
        where: { cashier_id: cashier.cashier_id },
      });
      await prismaClient.pOSTerminal.delete({
        where: { pos_terminal_id: terminal.pos_terminal_id },
      });
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });
});

// =============================================================================
// SECTION 5: P1 HIGH - REPORT ENDPOINT TESTS
// =============================================================================

test.describe("DAY-SUMMARY-API: Weekly Report", () => {
  test("DAY-SUMMARY-060: [P1] should return weekly report with aggregated data", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store with day summaries for a week
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    // Create summaries for multiple days
    await createDaySummary(
      prismaClient,
      store.store_id,
      new Date("2024-01-15"),
    );
    await createDaySummary(
      prismaClient,
      store.store_id,
      new Date("2024-01-16"),
    );
    await createDaySummary(
      prismaClient,
      store.store_id,
      new Date("2024-01-17"),
    );

    try {
      // WHEN: Requesting weekly report
      const response = await superadminApiRequest.get(
        `/api/stores/${store.store_id}/reports/weekly?week_of=2024-01-16`,
      );

      // THEN: Should return weekly report
      expect(response.status(), "Should return 200").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data.period_type, "Should be weekly").toBe("week");
      expect(body.data.store_id, "Should have store_id").toBe(store.store_id);
      expect(
        body.data.day_count,
        "Should have day_count",
      ).toBeGreaterThanOrEqual(0);
      expect(
        body.data.totals?.gross_sales,
        "Should have gross_sales",
      ).toBeDefined();
      expect(
        body.data.totals?.net_sales,
        "Should have net_sales",
      ).toBeDefined();
      expect(
        Array.isArray(body.data.daily_breakdown),
        "Should have daily_breakdown",
      ).toBe(true);
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });
});

test.describe("DAY-SUMMARY-API: Monthly Report", () => {
  test("DAY-SUMMARY-070: [P1] should return monthly report with aggregated data", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store with day summaries
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    await createDaySummary(
      prismaClient,
      store.store_id,
      new Date("2024-01-10"),
    );
    await createDaySummary(
      prismaClient,
      store.store_id,
      new Date("2024-01-20"),
    );

    try {
      // WHEN: Requesting monthly report
      const response = await superadminApiRequest.get(
        `/api/stores/${store.store_id}/reports/monthly?year=2024&month=1`,
      );

      // THEN: Should return monthly report
      expect(response.status(), "Should return 200").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data.period_type, "Should be monthly").toBe("month");
      expect(
        body.data.day_count,
        "Should have day_count",
      ).toBeGreaterThanOrEqual(0);
      expect(
        body.data.totals?.gross_sales,
        "Should have gross_sales",
      ).toBeDefined();
      expect(
        body.data.totals?.net_sales,
        "Should have net_sales",
      ).toBeDefined();
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });

  test("DAY-SUMMARY-071: [P1] should validate month parameter", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    try {
      // WHEN: Requesting with invalid month
      const response = await superadminApiRequest.get(
        `/api/stores/${store.store_id}/reports/monthly?year=2024&month=13`,
      );

      // THEN: Should return 400 Bad Request
      expect(response.status(), "Should return 400 for invalid month").toBe(
        400,
      );
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });
});

test.describe("DAY-SUMMARY-API: Date Range Report", () => {
  test("DAY-SUMMARY-080: [P1] should return date range report with aggregated data", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store with day summaries
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    await createDaySummary(
      prismaClient,
      store.store_id,
      new Date("2024-01-10"),
    );
    await createDaySummary(
      prismaClient,
      store.store_id,
      new Date("2024-01-15"),
    );
    await createDaySummary(
      prismaClient,
      store.store_id,
      new Date("2024-01-20"),
    );

    try {
      // WHEN: Requesting date range report
      const response = await superadminApiRequest.get(
        `/api/stores/${store.store_id}/reports/date-range?start_date=2024-01-01&end_date=2024-01-31`,
      );

      // THEN: Should return date range report
      expect(response.status(), "Should return 200").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data.start_date, "Should have start_date").toBe("2024-01-01");
      expect(body.data.end_date, "Should have end_date").toBe("2024-01-31");
      expect(body.data.day_count, "Should have day_count").toBe(3);
      expect(
        body.data.gross_sales,
        "Should have aggregated gross_sales",
      ).toBeDefined();
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });

  test("DAY-SUMMARY-081: [P1] should include daily breakdown when requested", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store with day summaries
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    await createDaySummary(
      prismaClient,
      store.store_id,
      new Date("2024-01-10"),
    );
    await createDaySummary(
      prismaClient,
      store.store_id,
      new Date("2024-01-15"),
    );

    try {
      // WHEN: Requesting with daily breakdown
      const response = await superadminApiRequest.get(
        `/api/stores/${store.store_id}/reports/date-range?start_date=2024-01-01&end_date=2024-01-31&include_daily_breakdown=true`,
      );

      // THEN: Should include daily breakdown
      expect(response.status(), "Should return 200").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(
        Array.isArray(body.data.daily_breakdown),
        "Should have daily_breakdown array",
      ).toBe(true);
      expect(body.data.daily_breakdown.length, "Should have 2 days").toBe(2);
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });
});

// =============================================================================
// SECTION 6: P2 MEDIUM - TENANT ISOLATION TESTS
// =============================================================================

test.describe("DAY-SUMMARY-API: Tenant Isolation", () => {
  test("DAY-SUMMARY-090: [P2] should not return day summaries from other companies", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Store manager's store (from fixture) and another company's store
    // Use the store from the fixture that the store manager already has access to
    const store1Id = storeManagerUser.store_id;

    // Create a separate company and store that the manager should NOT have access to
    const otherOwner = await prismaClient.user.create({
      data: createUser({ name: "Other Owner" }),
    });
    const company2 = await prismaClient.company.create({
      data: createCompany({ owner_user_id: otherOwner.user_id }),
    });
    const store2 = await prismaClient.store.create({
      data: createStore({ company_id: company2.company_id }),
    });

    // Clean up any existing day summaries first
    await cleanupStoreData(prismaClient, store1Id);

    await createDaySummary(prismaClient, store1Id, new Date("2024-01-15"));
    await createDaySummary(
      prismaClient,
      store2.store_id,
      new Date("2024-01-15"),
    );

    try {
      // WHEN: Requesting day summaries for store manager's store
      const response = await storeManagerApiRequest.get(
        `/api/stores/${store1Id}/day-summaries`,
      );

      // THEN: Should only return store manager's company summaries
      expect(response.status(), "Should return 200").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data.length, "Should return 1 summary").toBe(1);
      expect(body.data[0].store_id, "Should be from correct store").toBe(
        store1Id,
      );

      // WHEN: Trying to access other company's store
      const otherResponse = await storeManagerApiRequest.get(
        `/api/stores/${store2.store_id}/day-summaries`,
      );

      // THEN: Should return 403 Forbidden
      expect(
        otherResponse.status(),
        "Should return 403 for other company",
      ).toBe(403);
    } finally {
      await cleanupStoreData(prismaClient, store1Id);
      await cleanupStoreData(prismaClient, store2.store_id);
      await prismaClient.store.delete({ where: { store_id: store2.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company2.company_id },
      });
      await prismaClient.user.delete({
        where: { user_id: otherOwner.user_id },
      });
    }
  });
});

// =============================================================================
// SECTION 7: P2 MEDIUM - UPDATE NOTES ENDPOINT TESTS
// =============================================================================

test.describe("DAY-SUMMARY-API: Update Notes", () => {
  test("DAY-SUMMARY-100: [P2] should update day summary notes", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store with a day summary
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    await createDaySummary(
      prismaClient,
      store.store_id,
      new Date("2024-01-15"),
    );

    try {
      // WHEN: Updating notes
      const response = await superadminApiRequest.patch(
        `/api/stores/${store.store_id}/day-summary/2024-01-15/notes`,
        { notes: "Manager notes for the day" },
      );

      // THEN: Should return updated summary
      expect(response.status(), "Should return 200").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data.notes, "Notes should be updated").toBe(
        "Manager notes for the day",
      );
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });

  test("DAY-SUMMARY-101: [P2] should clear notes when set to null", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store with a day summary with notes
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    const daySummary = await createDaySummary(
      prismaClient,
      store.store_id,
      new Date("2024-01-15"),
    );
    await prismaClient.daySummary.update({
      where: { day_summary_id: daySummary.day_summary_id },
      data: { notes: "Some existing notes" },
    });

    try {
      // WHEN: Clearing notes
      const response = await superadminApiRequest.patch(
        `/api/stores/${store.store_id}/day-summary/2024-01-15/notes`,
        { notes: null },
      );

      // THEN: Should return summary with cleared notes
      expect(response.status(), "Should return 200").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data.notes, "Notes should be null").toBeNull();
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });

  test("DAY-SUMMARY-102: [P2] should reject notes exceeding 2000 characters", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store with a day summary
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    await createDaySummary(
      prismaClient,
      store.store_id,
      new Date("2024-01-15"),
    );

    try {
      // WHEN: Updating with too long notes
      const longNotes = "x".repeat(2001);
      const response = await superadminApiRequest.patch(
        `/api/stores/${store.store_id}/day-summary/2024-01-15/notes`,
        { notes: longNotes },
      );

      // THEN: Should return 400 Bad Request
      expect(response.status(), "Should return 400 for too long notes").toBe(
        400,
      );
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });
});

// =============================================================================
// SECTION 8: P2 MEDIUM - GET BY ID ENDPOINT TESTS
// =============================================================================

test.describe("DAY-SUMMARY-API: Get By ID", () => {
  test("DAY-SUMMARY-110: [P2] should return day summary by ID", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store with a day summary
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    const daySummary = await createDaySummary(
      prismaClient,
      store.store_id,
      new Date("2024-01-15"),
    );

    try {
      // WHEN: Requesting by ID
      const response = await superadminApiRequest.get(
        `/api/day-summaries/${daySummary.day_summary_id}`,
      );

      // THEN: Should return the day summary
      expect(response.status(), "Should return 200").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.data.day_summary_id, "Should match ID").toBe(
        daySummary.day_summary_id,
      );
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });

  test("DAY-SUMMARY-111: [P2] should return 404 for non-existent ID", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Non-existent day summary ID
    const nonExistentId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Requesting non-existent ID
    const response = await superadminApiRequest.get(
      `/api/day-summaries/${nonExistentId}`,
    );

    // THEN: Should return 404 Not Found
    expect(response.status(), "Should return 404").toBe(404);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be NOT_FOUND").toBe("NOT_FOUND");
  });

  test("DAY-SUMMARY-112: [P2] should return 400 for invalid ID format", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Invalid ID format
    const invalidId = "not-a-uuid";

    // WHEN: Requesting with invalid ID
    const response = await superadminApiRequest.get(
      `/api/day-summaries/${invalidId}`,
    );

    // THEN: Should return 400 Bad Request
    expect(response.status(), "Should return 400 for invalid UUID").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });
});

// =============================================================================
// SECTION 9: P3 LOW - REFRESH ENDPOINT TESTS
// =============================================================================

test.describe("DAY-SUMMARY-API: Refresh Endpoint", () => {
  test("DAY-SUMMARY-120: [P3] should refresh day summary from shift summaries", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store with a day summary
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    await createDaySummary(
      prismaClient,
      store.store_id,
      new Date("2024-01-15"),
    );

    try {
      // WHEN: Refreshing the day summary
      // Note: Empty object {} is required as server validates JSON body format
      const response = await superadminApiRequest.post(
        `/api/stores/${store.store_id}/day-summary/2024-01-15/refresh`,
        {},
      );

      // THEN: Should return refreshed summary
      expect(response.status(), "Should return 200").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);
      expect(body.message, "Should have success message").toContain(
        "refreshed",
      );
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });
});
