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
 * @justification Endpoint integration tests verifying HTTP layer, authentication, authorization, request/response format, and error handling for Z Report endpoints
 * @story phase-4-z-reports
 *
 * Z Report API Tests - Phase 4.2: End-of-Shift Final Snapshots
 *
 * STORY: As a Store Manager, I want to access Z Reports (end-of-shift reports),
 * so that I can review the official final record of closed shifts.
 *
 * TEST LEVEL: API (endpoint integration tests)
 * PRIMARY GOAL: Verify Z Report endpoints for retrieving and verifying end-of-shift reports
 *
 * BUSINESS RULES TESTED:
 * - Z Reports are generated automatically when shifts are closed
 * - One Z Report per shift (immutable)
 * - Sequential Z number per store for audit trail
 * - Signature hash for tamper detection
 * - Authentication required (JWT token)
 * - Authorization required (Z_REPORT_READ, Z_REPORT_VERIFY permissions)
 * - Multi-tenant isolation (store_id must be accessible to user)
 *
 * =============================================================================
 * REQUIREMENTS TRACEABILITY MATRIX (RTM)
 * =============================================================================
 *
 * | Test ID       | Section           | Requirement                                  | Priority | Type        |
 * |---------------|-------------------|----------------------------------------------|----------|-------------|
 * | Z-REPORT-001  | Authentication    | Return 401 when JWT token is missing         | P0       | Security    |
 * | Z-REPORT-002  | Authentication    | Return 401 when JWT token is expired         | P0       | Security    |
 * | Z-REPORT-003  | Authentication    | Return 401 when JWT token is invalid         | P0       | Security    |
 * | Z-REPORT-010  | Authorization     | Return 403 when lacking SHIFT_REPORT_VIEW    | P0       | Security    |
 * | Z-REPORT-020  | Happy Path        | Get Z Report by shift ID                     | P0       | Functional  |
 * | Z-REPORT-021  | Happy Path        | Get Z Report by ID                           | P0       | Functional  |
 * | Z-REPORT-022  | Happy Path        | List Z Reports for store                     | P0       | Functional  |
 * | Z-REPORT-023  | Happy Path        | Get Z Report by store and Z number           | P0       | Functional  |
 * | Z-REPORT-030  | Integrity         | Verify Z Report integrity with signature     | P1       | Functional  |
 * | Z-REPORT-040  | Validation        | Return 400 for invalid Z Report ID format    | P1       | Validation  |
 * | Z-REPORT-041  | Validation        | Return 404 for non-existent Z Report         | P1       | Validation  |
 * | Z-REPORT-042  | Validation        | Return 404 for shift without Z Report        | P1       | Validation  |
 * | Z-REPORT-050  | Multi-tenant      | Return 404 for Z Report from diff company    | P1       | Security    |
 * | Z-REPORT-060  | Print Tracking    | Mark Z Report as printed                     | P2       | Functional  |
 * | Z-REPORT-061  | Export Tracking   | Mark Z Report as exported with format        | P2       | Functional  |
 * | Z-REPORT-070  | Sequence Summary  | Get Z Report sequence summary for store      | P2       | Functional  |
 *
 * =============================================================================
 * PHASE COVERAGE SUMMARY
 * =============================================================================
 *
 * Phase 4.2 - Z Report Access (16 tests):
 *   Section 1 - Authentication (3 tests):
 *     - Z-REPORT-001: JWT token missing
 *     - Z-REPORT-002: JWT token expired
 *     - Z-REPORT-003: JWT token invalid
 *
 *   Section 2 - Authorization (1 test):
 *     - Z-REPORT-010: SHIFT_REPORT_VIEW permission required
 *
 *   Section 3 - Happy Path (4 tests):
 *     - Z-REPORT-020: Get Z Report by shift ID
 *     - Z-REPORT-021: Get Z Report by ID
 *     - Z-REPORT-022: List Z Reports for store with pagination
 *     - Z-REPORT-023: Get Z Report by store and Z number
 *
 *   Section 4 - Integrity Verification (1 test):
 *     - Z-REPORT-030: Verify signature hash integrity
 *
 *   Section 5 - Validation (3 tests):
 *     - Z-REPORT-040: Invalid UUID format
 *     - Z-REPORT-041: Non-existent Z Report
 *     - Z-REPORT-042: Active shift (no Z Report yet)
 *
 *   Section 6 - Multi-tenant Isolation (1 test):
 *     - Z-REPORT-050: Cross-company access blocked
 *
 *   Section 7 - Print/Export Tracking (2 tests):
 *     - Z-REPORT-060: Mark as printed
 *     - Z-REPORT-061: Mark as exported with format
 *
 *   Section 8 - Sequence Summary (1 test):
 *     - Z-REPORT-070: Get store Z Report sequence info
 *
 * =============================================================================
 * ENDPOINTS COVERED
 * =============================================================================
 *
 * | Method | Endpoint                                    | Permission           |
 * |--------|---------------------------------------------|----------------------|
 * | GET    | /api/shifts/:shiftId/z-report               | SHIFT_REPORT_VIEW    |
 * | GET    | /api/z-reports/:zReportId                   | SHIFT_REPORT_VIEW    |
 * | GET    | /api/z-reports/:zReportId/verify            | SHIFT_REPORT_VIEW    |
 * | GET    | /api/stores/:storeId/z-reports              | SHIFT_REPORT_VIEW    |
 * | GET    | /api/stores/:storeId/z-reports/:zNumber     | SHIFT_REPORT_VIEW    |
 * | GET    | /api/stores/:storeId/z-reports/sequence     | SHIFT_REPORT_VIEW    |
 * | POST   | /api/z-reports/:zReportId/printed           | SHIFT_REPORT_VIEW    |
 * | POST   | /api/z-reports/:zReportId/exported          | SHIFT_REPORT_VIEW    |
 *
 * =============================================================================
 * DATA INTEGRITY REQUIREMENTS
 * =============================================================================
 *
 * - Z Reports are IMMUTABLE once generated
 * - Each Z Report has SHA-256 signature_hash for tamper detection
 * - Z numbers are sequential per store (audit trail)
 * - report_data JSON contains complete shift summary snapshot
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
 * Creates a CLOSED shift with ShiftSummary and Z Report for testing
 */
async function createClosedShiftWithZReport(
  prismaClient: any,
  storeId: string,
  openedBy: string,
  cashierId: string,
  posTerminalId: string,
  zNumber: number = 1,
): Promise<{
  shift_id: string;
  shift_summary_id: string;
  z_report_id: string;
  z_number: number;
}> {
  const shiftOpenedAt = new Date(Date.now() - 8 * 60 * 60 * 1000);
  const shiftClosedAt = new Date();
  const businessDate = new Date();
  businessDate.setHours(0, 0, 0, 0);

  // Create closed shift
  const shift = await prismaClient.shift.create({
    data: {
      ...createShift({
        store_id: storeId,
        opened_by: openedBy,
        cashier_id: cashierId,
        pos_terminal_id: posTerminalId,
        opening_cash: new Prisma.Decimal(100.0),
        closing_cash: new Prisma.Decimal(250.0),
        expected_cash: new Prisma.Decimal(200.0),
        variance: new Prisma.Decimal(50.0),
        status: "CLOSED",
        opened_at: shiftOpenedAt,
        closed_at: shiftClosedAt,
      }),
    },
  });

  // Create shift summary
  const shiftSummary = await prismaClient.shiftSummary.create({
    data: {
      shift_id: shift.shift_id,
      store_id: storeId,
      business_date: businessDate,
      shift_opened_at: shiftOpenedAt,
      shift_closed_at: shiftClosedAt,
      shift_duration_mins: 480,
      opened_by_user_id: openedBy,
      closed_by_user_id: openedBy,
      gross_sales: new Prisma.Decimal(500.0),
      returns_total: new Prisma.Decimal(0),
      discounts_total: new Prisma.Decimal(0),
      net_sales: new Prisma.Decimal(500.0),
      tax_collected: new Prisma.Decimal(40.0),
      tax_exempt_sales: new Prisma.Decimal(0),
      taxable_sales: new Prisma.Decimal(500.0),
      transaction_count: 10,
      void_count: 0,
      refund_count: 0,
      items_sold_count: 25,
      items_returned_count: 0,
      avg_transaction: new Prisma.Decimal(50.0),
      avg_items_per_txn: new Prisma.Decimal(2.5),
      opening_cash: new Prisma.Decimal(100.0),
      closing_cash: new Prisma.Decimal(250.0),
      expected_cash: new Prisma.Decimal(200.0),
      cash_variance: new Prisma.Decimal(50.0),
      variance_percentage: new Prisma.Decimal(25.0),
      variance_approved: false,
    },
  });

  // Create Z Report
  const reportData = {
    shift_opened_at: shiftOpenedAt.toISOString(),
    shift_closed_at: shiftClosedAt.toISOString(),
    shift_duration_mins: 480,
    opened_by_user_id: openedBy,
    closed_by_user_id: openedBy,
    cashier_user_id: null,
    gross_sales: 500.0,
    returns_total: 0,
    discounts_total: 0,
    net_sales: 500.0,
    tax_collected: 40.0,
    tax_exempt_sales: 0,
    taxable_sales: 500.0,
    transaction_count: 10,
    void_count: 0,
    refund_count: 0,
    no_sale_count: 0,
    items_sold_count: 25,
    items_returned_count: 0,
    avg_transaction: 50.0,
    avg_items_per_txn: 2.5,
    cash_reconciliation: {
      opening_cash: 100.0,
      closing_cash: 250.0,
      expected_cash: 200.0,
      cash_variance: 50.0,
      variance_percentage: 25.0,
      variance_approved: false,
      variance_approved_by: null,
      variance_approved_at: null,
      variance_reason: null,
    },
    tender_breakdown: [],
    department_breakdown: [],
    tax_breakdown: [],
    hourly_breakdown: [],
    lottery_sales: null,
    lottery_cashes: null,
    lottery_net: null,
    lottery_packs_sold: null,
    lottery_tickets_sold: null,
    fuel_gallons: null,
    fuel_sales: null,
    extra_data: null,
  };

  const zReport = await prismaClient.zReport.create({
    data: {
      shift_id: shift.shift_id,
      shift_summary_id: shiftSummary.shift_summary_id,
      store_id: storeId,
      business_date: businessDate,
      generated_at: new Date(),
      generated_by: openedBy,
      z_number: zNumber,
      report_data: reportData,
      signature_hash: "test-signature-hash-" + zNumber,
    },
  });

  return {
    shift_id: shift.shift_id,
    shift_summary_id: shiftSummary.shift_summary_id,
    z_report_id: zReport.z_report_id,
    z_number: zNumber,
  };
}

/**
 * Cleans up Z Report test data
 */
async function cleanupZReportTestData(
  prismaClient: any,
  shiftId: string,
): Promise<void> {
  // Delete Z Report
  await prismaClient.zReport.deleteMany({
    where: { shift_id: shiftId },
  });

  // Delete shift summary child tables first
  await prismaClient.shiftTenderSummary.deleteMany({
    where: { shift_summary: { shift_id: shiftId } },
  });
  await prismaClient.shiftDepartmentSummary.deleteMany({
    where: { shift_summary: { shift_id: shiftId } },
  });
  await prismaClient.shiftTaxSummary.deleteMany({
    where: { shift_summary: { shift_id: shiftId } },
  });
  await prismaClient.shiftHourlySummary.deleteMany({
    where: { shift_summary: { shift_id: shiftId } },
  });

  // Delete shift summary
  await prismaClient.shiftSummary.deleteMany({
    where: { shift_id: shiftId },
  });

  // Delete shift
  await prismaClient.shift.delete({ where: { shift_id: shiftId } });
}

// =============================================================================
// SECTION 1: P0 CRITICAL - AUTHENTICATION TESTS
// =============================================================================

test.describe("Z-REPORT-API: Authentication", () => {
  test("Z-REPORT-001: [P0] should return 401 when JWT token is missing", async ({
    apiRequest,
  }) => {
    // GIVEN: Valid shift ID format
    const shiftId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Requesting Z Report without JWT token
    const response = await apiRequest.get(`/api/shifts/${shiftId}/z-report`);

    // THEN: Should return 401 Unauthorized
    expect(response.status(), "Should return 401 for missing token").toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be UNAUTHORIZED").toBe(
      "UNAUTHORIZED",
    );
  });

  test("Z-REPORT-002: [P0] should return 401 when JWT token is expired", async ({
    apiRequest,
  }) => {
    // GIVEN: An expired JWT token
    const expiredToken = createExpiredJWTAccessToken();
    const zReportId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Requesting Z Report with expired token
    const response = await apiRequest.get(`/api/z-reports/${zReportId}`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });

    // THEN: Should return 401 Unauthorized
    expect(response.status(), "Should return 401 for expired token").toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("Z-REPORT-003: [P0] should return 401 when JWT token is invalid", async ({
    apiRequest,
  }) => {
    // GIVEN: An invalid JWT token
    const invalidToken = "invalid.jwt.token";
    const storeId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Requesting Z Report list with invalid token
    const response = await apiRequest.get(`/api/stores/${storeId}/z-reports`, {
      headers: { Authorization: `Bearer ${invalidToken}` },
    });

    // THEN: Should return 401 Unauthorized
    expect(response.status(), "Should return 401 for invalid token").toBe(401);
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

test.describe("Z-REPORT-API: Authorization", () => {
  test("Z-REPORT-010: [P0] should return 403 when user lacks SHIFT_REPORT_VIEW permission", async ({
    regularUserApiRequest,
    prismaClient,
  }) => {
    // GIVEN: User without permission and a Z Report
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Z Report Test Owner" }),
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
    const testData = await createClosedShiftWithZReport(
      prismaClient,
      store.store_id,
      owner.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
    );

    // WHEN: Requesting Z Report without permission
    const response = await regularUserApiRequest.get(
      `/api/z-reports/${testData.z_report_id}`,
    );

    // THEN: Should return 403 Forbidden
    expect(response.status(), "Should return 403 for missing permission").toBe(
      403,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);

    // Cleanup
    await cleanupZReportTestData(prismaClient, testData.shift_id);
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

test.describe("Z-REPORT-API: Happy Path", () => {
  test("Z-REPORT-020: [P0] should get Z Report by shift ID", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A Z Report exists for a closed shift
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const testData = await createClosedShiftWithZReport(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
    );

    // WHEN: Getting Z Report by shift ID
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${testData.shift_id}/z-report`,
    );

    // THEN: Should return 200 with Z Report data
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data, "Response should contain data").toBeDefined();

    // Verify Z Report structure
    expect(body.data.z_report_id, "Should have z_report_id").toBeDefined();
    expect(body.data.shift_id, "Should have correct shift_id").toBe(
      testData.shift_id,
    );
    expect(body.data.z_number, "Should have z_number").toBe(1);
    expect(body.data.report_data, "Should have report_data").toBeDefined();
    expect(
      body.data.signature_hash,
      "Should have signature_hash",
    ).toBeDefined();

    // Cleanup
    await cleanupZReportTestData(prismaClient, testData.shift_id);
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });

  test("Z-REPORT-021: [P0] should get Z Report by ID", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A Z Report exists
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const testData = await createClosedShiftWithZReport(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
    );

    // WHEN: Getting Z Report by ID
    const response = await storeManagerApiRequest.get(
      `/api/z-reports/${testData.z_report_id}`,
    );

    // THEN: Should return the Z Report
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.z_report_id, "Should return correct ID").toBe(
      testData.z_report_id,
    );

    // Cleanup
    await cleanupZReportTestData(prismaClient, testData.shift_id);
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });

  test("Z-REPORT-022: [P0] should list Z Reports for store", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Multiple Z Reports exist for a store
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const testData1 = await createClosedShiftWithZReport(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      1,
    );

    // Create second shift and Z Report
    const terminal2 = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const testData2 = await createClosedShiftWithZReport(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal2.pos_terminal_id,
      2,
    );

    // WHEN: Listing Z Reports for store
    const response = await storeManagerApiRequest.get(
      `/api/stores/${storeManagerUser.store_id}/z-reports`,
    );

    // THEN: Should return list of Z Reports
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(Array.isArray(body.data), "data should be an array").toBe(true);
    expect(
      body.data.length,
      "Should have at least 2 Z Reports",
    ).toBeGreaterThanOrEqual(2);
    expect(body.meta, "Should have meta object").toBeDefined();
    expect(typeof body.meta.total, "total should be a number").toBe("number");

    // Cleanup
    await cleanupZReportTestData(prismaClient, testData2.shift_id);
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal2.pos_terminal_id },
    });
    await cleanupZReportTestData(prismaClient, testData1.shift_id);
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });

  test("Z-REPORT-023: [P0] should get Z Report by store and Z number", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A Z Report exists
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const testData = await createClosedShiftWithZReport(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      99, // Use a unique Z number
    );

    // WHEN: Getting Z Report by store and Z number
    const response = await storeManagerApiRequest.get(
      `/api/stores/${storeManagerUser.store_id}/z-reports/99`,
    );

    // THEN: Should return the Z Report
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.z_number, "Should have correct Z number").toBe(99);

    // Cleanup
    await cleanupZReportTestData(prismaClient, testData.shift_id);
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });
});

// =============================================================================
// SECTION 4: P1 - INTEGRITY VERIFICATION TESTS
// =============================================================================

test.describe("Z-REPORT-API: Integrity Verification", () => {
  test("Z-REPORT-030: [P1] should verify Z Report integrity", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A Z Report exists
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const testData = await createClosedShiftWithZReport(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
    );

    // WHEN: Verifying Z Report integrity
    const response = await storeManagerApiRequest.get(
      `/api/z-reports/${testData.z_report_id}/verify`,
    );

    // THEN: Should return verification result
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.z_report_id, "Should have z_report_id").toBe(
      testData.z_report_id,
    );
    expect(
      typeof body.data.integrity_valid,
      "integrity_valid should be boolean",
    ).toBe("boolean");
    expect(
      body.data.verified_at,
      "Should have verified_at timestamp",
    ).toBeDefined();

    // Cleanup
    await cleanupZReportTestData(prismaClient, testData.shift_id);
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });
});

// =============================================================================
// SECTION 5: P1 - VALIDATION TESTS
// =============================================================================

test.describe("Z-REPORT-API: Validation", () => {
  test("Z-REPORT-040: [P1] should return 400 for invalid Z Report ID format", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: An invalid Z Report ID format
    const invalidId = "not-a-valid-uuid";

    // WHEN: Requesting Z Report with invalid ID
    const response = await storeManagerApiRequest.get(
      `/api/z-reports/${invalidId}`,
    );

    // THEN: Should return 400 Bad Request
    expect(response.status(), "Should return 400 for invalid UUID").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be VALIDATION_ERROR").toBe(
      "VALIDATION_ERROR",
    );
  });

  test("Z-REPORT-041: [P1] should return 404 for non-existent Z Report", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: A valid UUID v4 that doesn't exist in the database
    // Using a proper UUID v4 format (random but valid)
    const nonExistentId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

    // WHEN: Requesting non-existent Z Report
    const response = await storeManagerApiRequest.get(
      `/api/z-reports/${nonExistentId}`,
    );

    // THEN: Should return 404 Not Found
    const body = await response.json();
    expect(response.status(), "Should return 404 for non-existent").toBe(404);
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be NOT_FOUND").toBe("NOT_FOUND");
  });

  test("Z-REPORT-042: [P1] should return 404 for shift without Z Report", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An active shift without Z Report
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
          status: "ACTIVE",
          opened_at: new Date(),
        }),
      },
    });

    // WHEN: Getting Z Report for active shift
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/z-report`,
    );

    // THEN: Should return 404 Not Found
    expect(
      response.status(),
      "Should return 404 for shift without Z Report",
    ).toBe(404);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);

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
// SECTION 6: P1 - MULTI-TENANT ISOLATION TESTS
// =============================================================================

test.describe("Z-REPORT-API: Multi-tenant Isolation", () => {
  test("Z-REPORT-050: [P1] should return 404 when accessing Z Report from different company", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A Z Report from a different company
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
    const testData = await createClosedShiftWithZReport(
      prismaClient,
      otherStore.store_id,
      otherOwner.user_id,
      otherCashier.cashier_id,
      otherTerminal.pos_terminal_id,
    );

    // WHEN: storeManagerUser tries to access Z Report from otherCompany
    const response = await storeManagerApiRequest.get(
      `/api/z-reports/${testData.z_report_id}`,
    );

    // THEN: Should return 404 (Z Report not accessible)
    expect(
      response.status(),
      "Should return 404 for cross-company access",
    ).toBe(404);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);

    // Cleanup
    await cleanupZReportTestData(prismaClient, testData.shift_id);
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
// SECTION 7: P2 - MARK AS PRINTED/EXPORTED TESTS
// =============================================================================

test.describe("Z-REPORT-API: Print and Export Tracking", () => {
  test("Z-REPORT-060: [P2] should mark Z Report as printed", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A Z Report exists
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const testData = await createClosedShiftWithZReport(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
    );

    // WHEN: Marking Z Report as printed
    const response = await storeManagerApiRequest.post(
      `/api/z-reports/${testData.z_report_id}/printed`,
      {},
    );

    // THEN: Should return updated Z Report
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.was_printed, "was_printed should be true").toBe(true);
    expect(body.data.print_count, "print_count should be 1").toBe(1);

    // Cleanup
    await cleanupZReportTestData(prismaClient, testData.shift_id);
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });

  test("Z-REPORT-061: [P2] should mark Z Report as exported", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A Z Report exists
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const testData = await createClosedShiftWithZReport(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
    );

    // WHEN: Marking Z Report as exported
    const response = await storeManagerApiRequest.post(
      `/api/z-reports/${testData.z_report_id}/exported`,
      { export_format: "PDF" },
    );

    // THEN: Should return updated Z Report
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.was_exported, "was_exported should be true").toBe(true);
    expect(body.data.export_format, "export_format should be PDF").toBe("PDF");

    // Cleanup
    await cleanupZReportTestData(prismaClient, testData.shift_id);
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });
});

// =============================================================================
// SECTION 8: P2 - SEQUENCE SUMMARY TESTS
// =============================================================================

test.describe("Z-REPORT-API: Sequence Summary", () => {
  test("Z-REPORT-070: [P2] should get Z Report sequence summary for store", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Z Reports exist for store
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const testData = await createClosedShiftWithZReport(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      100,
    );

    // WHEN: Getting sequence summary
    const response = await storeManagerApiRequest.get(
      `/api/stores/${storeManagerUser.store_id}/z-reports/sequence`,
    );

    // THEN: Should return sequence summary
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.store_id, "Should have store_id").toBe(
      storeManagerUser.store_id,
    );
    expect(
      typeof body.data.total_z_reports,
      "total_z_reports should be number",
    ).toBe("number");
    expect(
      typeof body.data.latest_z_number,
      "latest_z_number should be number",
    ).toBe("number");

    // Cleanup
    await cleanupZReportTestData(prismaClient, testData.shift_id);
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });
});
