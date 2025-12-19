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
 * @justification Endpoint integration tests verifying HTTP layer, authentication, authorization, request/response format, and error handling for X Report endpoints
 * @story phase-4-x-reports
 *
 * X Report API Tests - Phase 4.1: Mid-Shift Snapshots
 *
 * STORY: As a Store Manager, I want to generate mid-shift X Reports,
 * so that I can review interim shift data without closing the shift.
 *
 * TEST LEVEL: API (endpoint integration tests)
 * PRIMARY GOAL: Verify X Report endpoints for generating and retrieving mid-shift snapshots
 *
 * BUSINESS RULES TESTED:
 * - X Reports can only be generated for ACTIVE shifts
 * - Multiple X Reports can be generated per shift
 * - Each X Report has a sequential report_number within the shift
 * - Authentication required (JWT token)
 * - Authorization required (X_REPORT_GENERATE, X_REPORT_READ permissions)
 * - Multi-tenant isolation (store_id must be accessible to user)
 *
 * =============================================================================
 * REQUIREMENTS TRACEABILITY MATRIX (RTM)
 * =============================================================================
 *
 * | Test ID       | Section         | Requirement                                    | Priority | Type        |
 * |---------------|-----------------|------------------------------------------------|----------|-------------|
 * | X-REPORT-001  | Authentication  | Return 401 when JWT token is missing (generate)| P0       | Security    |
 * | X-REPORT-002  | Authentication  | Return 401 when JWT token is expired           | P0       | Security    |
 * | X-REPORT-003  | Authentication  | Return 401 when JWT token is missing (list)    | P0       | Security    |
 * | X-REPORT-010  | Authorization   | Return 403 when lacking X_REPORT_GENERATE perm | P0       | Security    |
 * | X-REPORT-020  | Happy Path      | Generate X Report for ACTIVE shift             | P0       | Functional  |
 * | X-REPORT-021  | Happy Path      | Generate multiple X Reports with seq. numbers  | P0       | Functional  |
 * | X-REPORT-022  | Happy Path      | List X Reports for a shift                     | P0       | Functional  |
 * | X-REPORT-023  | Happy Path      | Get X Report by ID                             | P0       | Functional  |
 * | X-REPORT-030  | Validation      | Return 400 for invalid shift ID format         | P1       | Validation  |
 * | X-REPORT-031  | Validation      | Return 404 for non-existent shift              | P1       | Validation  |
 * | X-REPORT-032  | Validation      | Return 400 for CLOSED shift                    | P1       | Validation  |
 * | X-REPORT-040  | Multi-tenant    | Return 404 for X Report from different company | P1       | Security    |
 * | X-REPORT-050  | Print Tracking  | Mark X Report as printed                       | P2       | Functional  |
 * | X-REPORT-051  | Print Tracking  | Increment print count on subsequent prints     | P2       | Functional  |
 *
 * =============================================================================
 * PHASE COVERAGE SUMMARY
 * =============================================================================
 *
 * Phase 4.1 - X Report Generation (14 tests):
 *   Section 1 - Authentication (3 tests):
 *     - X-REPORT-001: JWT token missing for generate endpoint
 *     - X-REPORT-002: JWT token expired
 *     - X-REPORT-003: JWT token missing for list endpoint
 *
 *   Section 2 - Authorization (1 test):
 *     - X-REPORT-010: X_REPORT_GENERATE permission required
 *
 *   Section 3 - Happy Path (4 tests):
 *     - X-REPORT-020: Generate X Report for active shift
 *     - X-REPORT-021: Sequential report numbers
 *     - X-REPORT-022: List X Reports for shift
 *     - X-REPORT-023: Get X Report by ID
 *
 *   Section 4 - Validation (3 tests):
 *     - X-REPORT-030: Invalid UUID format
 *     - X-REPORT-031: Non-existent shift
 *     - X-REPORT-032: CLOSED shift (not ACTIVE)
 *
 *   Section 5 - Multi-tenant Isolation (1 test):
 *     - X-REPORT-040: Cross-company access blocked
 *
 *   Section 6 - Print Tracking (2 tests):
 *     - X-REPORT-050: Mark as printed
 *     - X-REPORT-051: Increment print count
 *
 * =============================================================================
 * ENDPOINTS COVERED
 * =============================================================================
 *
 * | Method | Endpoint                              | Permission           |
 * |--------|---------------------------------------|----------------------|
 * | POST   | /api/shifts/:shiftId/x-reports        | X_REPORT_GENERATE    |
 * | GET    | /api/shifts/:shiftId/x-reports        | X_REPORT_READ        |
 * | GET    | /api/x-reports/:xReportId             | X_REPORT_READ        |
 * | POST   | /api/x-reports/:xReportId/printed     | X_REPORT_GENERATE    |
 *
 * =============================================================================
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
 * Creates an ACTIVE shift for testing X Reports
 */
async function createActiveShiftForXReport(
  prismaClient: any,
  storeId: string,
  openedBy: string,
  cashierId: string,
  posTerminalId: string,
  openingCash: number = 100.0,
): Promise<{ shift_id: string; status: string }> {
  const shift = await prismaClient.shift.create({
    data: {
      ...createShift({
        store_id: storeId,
        opened_by: openedBy,
        cashier_id: cashierId,
        pos_terminal_id: posTerminalId,
        opening_cash: new Prisma.Decimal(openingCash),
        status: "ACTIVE",
        opened_at: new Date(),
      }),
    },
  });

  return {
    shift_id: shift.shift_id,
    status: shift.status,
  };
}

/**
 * Cleans up test data
 */
async function cleanupXReportTestData(
  prismaClient: any,
  shiftId: string,
): Promise<void> {
  // Delete X Reports first
  await prismaClient.xReport.deleteMany({
    where: { shift_id: shiftId },
  });

  // Delete shift
  await prismaClient.shift.delete({ where: { shift_id: shiftId } });
}

// =============================================================================
// SECTION 1: P0 CRITICAL - AUTHENTICATION TESTS
// =============================================================================

test.describe("X-REPORT-API: Authentication", () => {
  test("X-REPORT-001: [P0] should return 401 when JWT token is missing for generate", async ({
    apiRequest,
  }) => {
    // GIVEN: Valid shift ID format
    const shiftId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Requesting X Report generation without JWT token
    // NOTE: Must send empty body {} to avoid JSON parsing error before auth check
    const response = await apiRequest.post(
      `/api/shifts/${shiftId}/x-reports`,
      {},
    );

    // THEN: Should return 401 Unauthorized
    expect(response.status(), "Should return 401 for missing token").toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be UNAUTHORIZED").toBe(
      "UNAUTHORIZED",
    );
  });

  test("X-REPORT-002: [P0] should return 401 when JWT token is expired", async ({
    apiRequest,
  }) => {
    // GIVEN: An expired JWT token
    const expiredToken = createExpiredJWTAccessToken();
    const shiftId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Requesting X Report generation with expired token
    // NOTE: Must send empty body {} to avoid JSON parsing error before auth check
    const response = await apiRequest.post(
      `/api/shifts/${shiftId}/x-reports`,
      {},
      {
        headers: { Authorization: `Bearer ${expiredToken}` },
      },
    );

    // THEN: Should return 401 Unauthorized
    expect(response.status(), "Should return 401 for expired token").toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("X-REPORT-003: [P0] should return 401 when JWT token is missing for list", async ({
    apiRequest,
  }) => {
    // GIVEN: Valid shift ID format
    const shiftId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Requesting X Report list without JWT token
    const response = await apiRequest.get(`/api/shifts/${shiftId}/x-reports`);

    // THEN: Should return 401 Unauthorized
    expect(response.status(), "Should return 401 for missing token").toBe(401);
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

test.describe("X-REPORT-API: Authorization", () => {
  test("X-REPORT-010: [P0] should return 403 when user lacks SHIFT_REPORT_VIEW permission", async ({
    regularUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: User without SHIFT_REPORT_VIEW permission and an active shift
    // Note: regularUser doesn't have SHIFT_REPORT_VIEW permission by default
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Test X Report Owner" }),
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
    const shift = await createActiveShiftForXReport(
      prismaClient,
      store.store_id,
      owner.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
    );

    // WHEN: Requesting X Report generation without permission
    // NOTE: Must send empty body {} to avoid JSON parsing error before auth check
    const response = await regularUserApiRequest.post(
      `/api/shifts/${shift.shift_id}/x-reports`,
      {},
    );

    // THEN: Should return 403 Forbidden (user is authenticated but lacks permission)
    expect(
      response.status(),
      "Should return 403 for missing SHIFT_REPORT_VIEW permission",
    ).toBe(403);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be PERMISSION_DENIED").toBe(
      "PERMISSION_DENIED",
    );

    // Cleanup
    await cleanupXReportTestData(prismaClient, shift.shift_id);
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
  });
});

// =============================================================================
// SECTION 3: P0 CRITICAL - HAPPY PATH TESTS
// =============================================================================

test.describe("X-REPORT-API: Happy Path", () => {
  test("X-REPORT-020: [P0] should generate X Report for active shift", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An active shift
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const shift = await createActiveShiftForXReport(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
    );

    // WHEN: Generating X Report for the shift
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/x-reports`,
      {},
    );

    // THEN: Should return 201 with X Report data
    expect(response.status(), "Should return 201 Created").toBe(201);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data, "Response should contain data").toBeDefined();

    // Verify X Report structure
    expect(body.data.x_report_id, "Should have x_report_id").toBeDefined();
    expect(body.data.shift_id, "Should have correct shift_id").toBe(
      shift.shift_id,
    );
    expect(body.data.report_number, "First report should be #1").toBe(1);
    expect(
      body.data.generated_at,
      "Should have generated_at timestamp",
    ).toBeDefined();
    expect(typeof body.data.gross_sales, "gross_sales should be a number").toBe(
      "number",
    );
    expect(typeof body.data.net_sales, "net_sales should be a number").toBe(
      "number",
    );
    expect(
      typeof body.data.transaction_count,
      "transaction_count should be a number",
    ).toBe("number");

    // Cleanup
    await cleanupXReportTestData(prismaClient, shift.shift_id);
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });

  test("X-REPORT-021: [P0] should generate multiple X Reports with sequential numbers", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An active shift
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const shift = await createActiveShiftForXReport(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
    );

    // WHEN: Generating multiple X Reports
    const response1 = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/x-reports`,
      {},
    );
    const response2 = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/x-reports`,
      {},
    );
    const response3 = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/x-reports`,
      {},
    );

    // THEN: Should have sequential report numbers
    expect(response1.status(), "First report should return 201").toBe(201);
    expect(response2.status(), "Second report should return 201").toBe(201);
    expect(response3.status(), "Third report should return 201").toBe(201);

    const body1 = await response1.json();
    const body2 = await response2.json();
    const body3 = await response3.json();

    expect(body1.data.report_number, "First report should be #1").toBe(1);
    expect(body2.data.report_number, "Second report should be #2").toBe(2);
    expect(body3.data.report_number, "Third report should be #3").toBe(3);

    // Cleanup
    await cleanupXReportTestData(prismaClient, shift.shift_id);
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });

  test("X-REPORT-022: [P0] should list X Reports for a shift", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An active shift with X Reports
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const shift = await createActiveShiftForXReport(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
    );

    // Generate 2 X Reports
    await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/x-reports`,
      {},
    );
    await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/x-reports`,
      {},
    );

    // WHEN: Listing X Reports for the shift
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/x-reports`,
    );

    // THEN: Should return list of X Reports
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(Array.isArray(body.data), "data should be an array").toBe(true);
    expect(body.data.length, "Should have 2 X Reports").toBe(2);

    // Verify ordering (by report_number ascending)
    expect(body.data[0].report_number, "First should be #1").toBe(1);
    expect(body.data[1].report_number, "Second should be #2").toBe(2);

    // Cleanup
    await cleanupXReportTestData(prismaClient, shift.shift_id);
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });

  test("X-REPORT-023: [P0] should get X Report by ID", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An X Report exists
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const shift = await createActiveShiftForXReport(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
    );

    const createResponse = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/x-reports`,
      {},
    );
    const created = await createResponse.json();

    // WHEN: Getting X Report by ID
    const response = await storeManagerApiRequest.get(
      `/api/x-reports/${created.data.x_report_id}`,
    );

    // THEN: Should return the X Report
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.x_report_id, "Should return correct ID").toBe(
      created.data.x_report_id,
    );

    // Cleanup
    await cleanupXReportTestData(prismaClient, shift.shift_id);
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });
});

// =============================================================================
// SECTION 4: P1 - VALIDATION TESTS
// =============================================================================

test.describe("X-REPORT-API: Validation", () => {
  test("X-REPORT-030: [P1] should return 400 for invalid shift ID format", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: An invalid shift ID format
    const invalidShiftId = "not-a-valid-uuid";

    // WHEN: Requesting X Report generation with invalid ID
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${invalidShiftId}/x-reports`,
      {},
    );

    // THEN: Should return 400 Bad Request
    expect(response.status(), "Should return 400 for invalid UUID").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be VALIDATION_ERROR").toBe(
      "VALIDATION_ERROR",
    );
  });

  test("X-REPORT-031: [P1] should return 404 for non-existent shift", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: A valid UUID v4 that doesn't exist in the database
    // Using a proper UUID v4 format (random but valid)
    const nonExistentShiftId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

    // WHEN: Requesting X Report generation for non-existent shift
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${nonExistentShiftId}/x-reports`,
      {},
    );

    // THEN: Should return 404 Not Found
    const body = await response.json();
    expect(response.status(), "Should return 404 for non-existent shift").toBe(
      404,
    );
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be SHIFT_NOT_FOUND").toBe(
      "SHIFT_NOT_FOUND",
    );
  });

  test("X-REPORT-032: [P1] should return 400 for CLOSED shift", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A CLOSED shift
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const shift = await prismaClient.shift.create({
      data: {
        ...createShift({
          store_id: storeManagerUser.store_id,
          opened_by: storeManagerUser.user_id,
          cashier_id: cashier.cashier_id,
          pos_terminal_id: terminal.pos_terminal_id,
          opening_cash: new Prisma.Decimal(100.0),
          closing_cash: new Prisma.Decimal(150.0),
          status: "CLOSED",
          opened_at: new Date(Date.now() - 8 * 60 * 60 * 1000),
          closed_at: new Date(),
        }),
      },
    });

    // WHEN: Requesting X Report generation for CLOSED shift
    const response = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/x-reports`,
      {},
    );

    // THEN: Should return 400 Bad Request
    expect(response.status(), "Should return 400 for CLOSED shift").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be SHIFT_NOT_ACTIVE").toBe(
      "SHIFT_NOT_ACTIVE",
    );

    // Cleanup
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });
});

// =============================================================================
// SECTION 5: P1 - MULTI-TENANT ISOLATION TESTS
// =============================================================================

test.describe("X-REPORT-API: Multi-tenant Isolation", () => {
  test("X-REPORT-040: [P1] should return 404 when accessing X Report from different company", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: An X Report from a different company
    const otherOwner = await prismaClient.user.create({
      data: createUser({ name: `Other Owner ${Date.now()}` }),
    });
    const otherCompany = await prismaClient.company.create({
      data: createCompany({
        name: `Other Company ${Date.now()}`,
        owner_user_id: otherOwner.user_id,
      }),
    });
    const otherStore = await prismaClient.store.create({
      data: createStore({
        company_id: otherCompany.company_id,
        name: `Other Store ${Date.now()}`,
      }),
    });
    const otherTerminal = await createPOSTerminal(
      prismaClient,
      otherStore.store_id,
    );
    const otherCashier = await createTestCashier(
      prismaClient,
      otherStore.store_id,
      otherOwner.user_id,
    );
    const otherShift = await createActiveShiftForXReport(
      prismaClient,
      otherStore.store_id,
      otherOwner.user_id,
      otherCashier.cashier_id,
      otherTerminal.pos_terminal_id,
    );

    // Create X Report in other company
    const xReport = await prismaClient.xReport.create({
      data: {
        shift_id: otherShift.shift_id,
        store_id: otherStore.store_id,
        report_number: 1,
        generated_at: new Date(),
        generated_by: otherOwner.user_id,
        gross_sales: new Prisma.Decimal(0),
        returns_total: new Prisma.Decimal(0),
        discounts_total: new Prisma.Decimal(0),
        net_sales: new Prisma.Decimal(0),
        tax_collected: new Prisma.Decimal(0),
        transaction_count: 0,
        items_sold_count: 0,
        items_returned_count: 0,
        opening_cash: new Prisma.Decimal(100),
        expected_cash: new Prisma.Decimal(100),
        tender_breakdown: [],
        department_breakdown: [],
      },
    });

    // WHEN: storeManagerUser tries to access X Report from otherCompany
    const response = await storeManagerApiRequest.get(
      `/api/x-reports/${xReport.x_report_id}`,
    );

    // THEN: Should return 404 (X Report not accessible)
    expect(
      response.status(),
      "Should return 404 for cross-company access",
    ).toBe(404);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);

    // Cleanup
    await prismaClient.xReport.delete({
      where: { x_report_id: xReport.x_report_id },
    });
    await prismaClient.shift.delete({
      where: { shift_id: otherShift.shift_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: otherCashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: otherTerminal.pos_terminal_id },
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
// SECTION 6: P2 - MARK AS PRINTED TESTS
// =============================================================================

test.describe("X-REPORT-API: Mark as Printed", () => {
  test("X-REPORT-050: [P2] should mark X Report as printed", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An X Report exists
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const shift = await createActiveShiftForXReport(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
    );

    const createResponse = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/x-reports`,
      {},
    );
    const created = await createResponse.json();

    // WHEN: Marking X Report as printed
    const response = await storeManagerApiRequest.post(
      `/api/x-reports/${created.data.x_report_id}/printed`,
      {},
    );

    // THEN: Should return updated X Report with print tracking
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.was_printed, "was_printed should be true").toBe(true);
    expect(body.data.print_count, "print_count should be 1").toBe(1);

    // Cleanup
    await cleanupXReportTestData(prismaClient, shift.shift_id);
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });

  test("X-REPORT-051: [P2] should increment print count on subsequent prints", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An X Report exists
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const shift = await createActiveShiftForXReport(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
    );

    const createResponse = await storeManagerApiRequest.post(
      `/api/shifts/${shift.shift_id}/x-reports`,
      {},
    );
    const created = await createResponse.json();

    // WHEN: Marking X Report as printed multiple times
    await storeManagerApiRequest.post(
      `/api/x-reports/${created.data.x_report_id}/printed`,
      {},
    );
    await storeManagerApiRequest.post(
      `/api/x-reports/${created.data.x_report_id}/printed`,
      {},
    );
    const response = await storeManagerApiRequest.post(
      `/api/x-reports/${created.data.x_report_id}/printed`,
      {},
    );

    // THEN: Print count should be 3
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.data.print_count, "print_count should be 3").toBe(3);

    // Cleanup
    await cleanupXReportTestData(prismaClient, shift.shift_id);
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });
});
