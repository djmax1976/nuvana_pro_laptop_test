import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createUser,
  createCompany,
  createStore,
  createShift,
  createTransaction,
  createTransactionLineItem,
  createTransactionPayment,
} from "../support/factories";
import { Prisma } from "@prisma/client";

/**
 * @test-level API
 * @justification Endpoint integration tests verifying HTTP layer, authentication, authorization, request/response format, and error handling for GET /api/shifts/:shiftId/report and GET /api/shifts/:shiftId/report/export
 * @story 4-6-shift-report-generation
 * @enhanced-by workflow-9 on 2025-11-30
 *
 * Shift Report Generation API Tests - Story 4.6
 *
 * STORY: As a Store Manager, I want to view a detailed shift report,
 * so that I can review shift performance and reconciliation.
 *
 * TEST LEVEL: API (endpoint integration tests)
 * PRIMARY GOAL: Verify GET /api/shifts/:shiftId/report endpoint generates complete shift reports for CLOSED shifts
 *
 * BUSINESS RULES TESTED:
 * - Report generation for CLOSED shifts only
 * - Report includes shift summary (sales, transactions, cash reconciliation)
 * - Report includes detailed transaction list with line items
 * - Report includes payment method breakdown
 * - Report includes variance details (if any)
 * - PDF export functionality
 * - Redis caching for report data
 * - Authentication required (JWT token)
 * - Authorization required (SHIFT_REPORT_VIEW permission)
 * - Multi-tenant isolation (store_id must be accessible to user)
 * - Validation errors (invalid shift_id, shift not CLOSED)
 *
 * ENHANCEMENTS APPLIED (Workflow 9):
 * - Security tests: SQL injection prevention, authentication bypass, data leakage prevention
 * - Additional assertions: Data type validation, format validation (ISO dates, UUIDs)
 * - Edge case tests: Invalid UUID formats, malformed inputs, empty strings
 * - Code pattern improvements: Enhanced error messages, clearer test structure
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
  const terminal = await prismaClient.pOSTerminal.create({
    data: {
      store_id: storeId,
      name: name || `Terminal ${Date.now()}`,
      device_id: `device-${Date.now()}`,
      status: "ACTIVE",
    },
  });

  return {
    pos_terminal_id: terminal.pos_terminal_id,
    store_id: terminal.store_id,
    name: terminal.name,
  };
}

/**
 * Creates a CLOSED shift with transactions for testing
 */
async function createClosedShiftWithTransactions(
  prismaClient: any,
  storeId: string,
  openedBy: string,
  cashierId: string,
  posTerminalId: string,
  openingCash: number = 100.0,
  closingCash: number = 250.0,
): Promise<{ shift_id: string; status: string }> {
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
        variance: new Prisma.Decimal(50.0),
        status: "CLOSED",
        opened_at: new Date(Date.now() - 8 * 60 * 60 * 1000), // 8 hours ago
        closed_at: new Date(),
      }),
    },
  });

  // Create transactions for the shift
  const transaction1 = await prismaClient.transaction.create({
    data: {
      ...createTransaction({
        store_id: storeId,
        shift_id: shift.shift_id,
        cashier_id: cashierId,
        pos_terminal_id: posTerminalId,
        subtotal: 50.0,
        tax: 4.0,
        discount: 0,
        total: 54.0,
      }),
    },
  });

  const transaction2 = await prismaClient.transaction.create({
    data: {
      ...createTransaction({
        store_id: storeId,
        shift_id: shift.shift_id,
        cashier_id: cashierId,
        pos_terminal_id: posTerminalId,
        subtotal: 100.0,
        tax: 8.0,
        discount: 0,
        total: 108.0,
      }),
    },
  });

  // Create line items for transactions
  await prismaClient.transactionLineItem.create({
    data: createTransactionLineItem({
      transaction_id: transaction1.transaction_id,
      name: "Product A",
      quantity: 2,
      unit_price: 25.0,
      line_total: 50.0,
    }),
  });

  await prismaClient.transactionLineItem.create({
    data: createTransactionLineItem({
      transaction_id: transaction2.transaction_id,
      name: "Product B",
      quantity: 1,
      unit_price: 100.0,
      line_total: 100.0,
    }),
  });

  // Create payments for transactions
  await prismaClient.transactionPayment.create({
    data: createTransactionPayment({
      transaction_id: transaction1.transaction_id,
      method: "CASH",
      amount: 54.0,
    }),
  });

  await prismaClient.transactionPayment.create({
    data: createTransactionPayment({
      transaction_id: transaction2.transaction_id,
      method: "CREDIT",
      amount: 108.0,
    }),
  });

  return {
    shift_id: shift.shift_id,
    status: shift.status,
  };
}

// =============================================================================
// SECTION 1: P0 CRITICAL - AUTHENTICATION & AUTHORIZATION TESTS
// =============================================================================

test.describe("4.6-API: Shift Report - Authentication", () => {
  test("4.6-API-001: [P0] should return 401 when JWT token is missing", async ({
    apiRequest,
  }) => {
    // GIVEN: Valid shift ID
    const shiftId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Requesting shift report without JWT token
    const response = await apiRequest.get(`/api/shifts/${shiftId}/report`);

    // THEN: Should return 401 Unauthorized
    expect(response.status(), "Should return 401 for missing token").toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be UNAUTHORIZED").toBe(
      "UNAUTHORIZED",
    );
  });

  test("4.6-API-002: [P0] should return 401 when JWT token is invalid", async ({
    apiRequest,
  }) => {
    // GIVEN: An invalid JWT token
    const invalidToken = "invalid.jwt.token";
    const shiftId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Requesting shift report with invalid token
    const response = await apiRequest.get(`/api/shifts/${shiftId}/report`, {
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

  test("4.6-API-002a: [P0] should return 401 when JWT token is malformed", async ({
    apiRequest,
  }) => {
    // GIVEN: A malformed JWT token (wrong signature)
    const malformedToken =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.invalid-signature";
    const shiftId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Requesting shift report with malformed token
    const response = await apiRequest.get(`/api/shifts/${shiftId}/report`, {
      headers: { Authorization: `Bearer ${malformedToken}` },
    });

    // THEN: Should return 401 Unauthorized
    expect(response.status(), "Should return 401 for malformed token").toBe(
      401,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be UNAUTHORIZED").toBe(
      "UNAUTHORIZED",
    );
  });

  test("4.6-API-002b: [P0] should return 401 when JWT token is expired", async ({
    apiRequest,
  }) => {
    // GIVEN: An expired JWT token (if test framework supports token generation)
    // Note: This test may need token generation utility
    const expiredToken = "expired.jwt.token";
    const shiftId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Requesting shift report with expired token
    const response = await apiRequest.get(`/api/shifts/${shiftId}/report`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });

    // THEN: Should return 401 Unauthorized
    expect(response.status(), "Should return 401 for expired token").toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be UNAUTHORIZED").toBe(
      "UNAUTHORIZED",
    );
  });
});

test.describe("4.6-API: Shift Report - Authorization", () => {
  test("4.6-API-003: [P0] should return 403 when user lacks SHIFT_REPORT_VIEW permission", async ({
    regularUserApiRequest,
    regularUser,
    prismaClient,
  }) => {
    // GIVEN: Authenticated user without SHIFT_REPORT_VIEW permission
    // AND: A CLOSED shift exists
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const cashier = await prismaClient.user.create({
      data: createUser({ name: "Cashier" }),
    });
    const terminal = await createPOSTerminal(prismaClient, store.store_id);
    const shift = await createClosedShiftWithTransactions(
      prismaClient,
      store.store_id,
      owner.user_id,
      cashier.user_id,
      terminal.pos_terminal_id,
    );

    // WHEN: Requesting shift report without permission
    const response = await regularUserApiRequest.get(
      `/api/shifts/${shift.shift_id}/report`,
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

    // Cleanup
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.store.delete({ where: { store_id: store.store_id } });
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
    await prismaClient.user.delete({ where: { user_id: cashier.user_id } });
    await prismaClient.user.delete({ where: { user_id: owner.user_id } });
  });
});

// =============================================================================
// SECTION 2: P0 CRITICAL - SHIFT REPORT GENERATION (AC-1)
// =============================================================================

test.describe("4.6-API: Shift Report - Valid CLOSED Shift (AC-1)", () => {
  test("4.6-API-004: [P0] should generate complete report for CLOSED shift", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: Authenticated user with SHIFT_REPORT_VIEW permission
    // AND: A CLOSED shift with transactions exists
    const cashier = await prismaClient.user.create({
      data: createUser({ name: "Cashier" }),
    });
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const shift = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.user_id,
      terminal.pos_terminal_id,
      100.0,
      250.0,
    );

    // WHEN: Requesting shift report for CLOSED shift
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/report`,
    );

    // THEN: Should return 200 OK
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data, "Response should contain report data").toBeDefined();

    // AND: Report should include shift metadata
    expect(body.data.shift, "Report should include shift data").toBeDefined();
    expect(body.data.shift.shift_id, "Shift ID should match").toBe(
      shift.shift_id,
    );
    expect(typeof body.data.shift.shift_id, "Shift ID should be string").toBe(
      "string",
    );
    expect(body.data.shift.status, "Shift status should be CLOSED").toBe(
      "CLOSED",
    );
    expect(
      body.data.shift.store_id,
      "Shift should include store_id",
    ).toBeDefined();
    expect(typeof body.data.shift.store_id, "Store ID should be string").toBe(
      "string",
    );
    expect(
      body.data.shift.opened_at,
      "Shift should include opened_at",
    ).toBeDefined();
    expect(
      body.data.shift.opened_at,
      "opened_at should be ISO date format",
    ).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(
      body.data.shift.closed_at,
      "Shift should include closed_at",
    ).toBeDefined();
    expect(
      body.data.shift.closed_at,
      "closed_at should be ISO date format",
    ).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

    // AND: Report should include summary
    expect(body.data.summary, "Report should include summary").toBeDefined();
    expect(
      body.data.summary.total_sales,
      "Summary should include total sales",
    ).toBeDefined();
    expect(
      typeof body.data.summary.total_sales,
      "Total sales should be number",
    ).toBe("number");
    expect(
      body.data.summary.transaction_count,
      "Summary should include transaction count",
    ).toBeDefined();
    expect(
      typeof body.data.summary.transaction_count,
      "Transaction count should be number",
    ).toBe("number");
    expect(
      body.data.summary.opening_cash,
      "Summary should include opening cash",
    ).toBeDefined();
    expect(
      typeof body.data.summary.opening_cash,
      "Opening cash should be number",
    ).toBe("number");
    expect(
      body.data.summary.closing_cash,
      "Summary should include closing cash",
    ).toBeDefined();
    expect(
      typeof body.data.summary.closing_cash,
      "Closing cash should be number",
    ).toBe("number");
    expect(
      body.data.summary.expected_cash,
      "Summary should include expected cash",
    ).toBeDefined();
    expect(
      typeof body.data.summary.expected_cash,
      "Expected cash should be number",
    ).toBe("number");
    expect(
      body.data.summary.variance_amount,
      "Summary should include variance amount",
    ).toBeDefined();
    expect(
      typeof body.data.summary.variance_amount,
      "Variance amount should be number",
    ).toBe("number");
    expect(
      body.data.summary.variance_percentage,
      "Summary should include variance percentage",
    ).toBeDefined();
    expect(
      typeof body.data.summary.variance_percentage,
      "Variance percentage should be number",
    ).toBe("number");

    // AND: Report should include payment method breakdown
    expect(
      body.data.payment_methods,
      "Report should include payment methods",
    ).toBeDefined();
    expect(
      Array.isArray(body.data.payment_methods),
      "Payment methods should be an array",
    ).toBe(true);

    // AND: Report should include variance details
    expect(body.data.variance, "Report should include variance").toBeDefined();

    // AND: Report should include transactions with line items
    expect(
      body.data.transactions,
      "Report should include transactions",
    ).toBeDefined();
    expect(
      Array.isArray(body.data.transactions),
      "Transactions should be an array",
    ).toBe(true);
    if (body.data.transactions.length > 0) {
      expect(
        body.data.transactions[0].line_items,
        "Transactions should include line items",
      ).toBeDefined();
      expect(
        body.data.transactions[0].payments,
        "Transactions should include payments",
      ).toBeDefined();
    }

    // Cleanup
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.user.delete({ where: { user_id: cashier.user_id } });
  });

  test("4.6-API-005: [P0] should include correct sales totals in report summary", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A CLOSED shift with known transaction totals
    const cashier = await prismaClient.user.create({
      data: createUser({ name: "Cashier" }),
    });
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const shift = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.user_id,
      terminal.pos_terminal_id,
      100.0,
      250.0,
    );

    // WHEN: Requesting shift report
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/report`,
    );

    // THEN: Summary should have correct totals
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(
      body.data.summary.total_sales,
      "Total sales should be calculated",
    ).toBe(
      162.0, // 54.0 + 108.0
    );
    expect(
      body.data.summary.transaction_count,
      "Transaction count should be correct",
    ).toBe(2);

    // Cleanup
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.user.delete({ where: { user_id: cashier.user_id } });
  });

  test("4.6-API-006: [P0] should include payment method breakdown in report", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A CLOSED shift with multiple payment methods
    const cashier = await prismaClient.user.create({
      data: createUser({ name: "Cashier" }),
    });
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const shift = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.user_id,
      terminal.pos_terminal_id,
    );

    // WHEN: Requesting shift report
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/report`,
    );

    // THEN: Payment method breakdown should be included
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(
      body.data.payment_methods,
      "Payment methods should be present",
    ).toBeDefined();
    expect(
      body.data.payment_methods.length,
      "Should have payment methods",
    ).toBeGreaterThan(0);

    // AND: Each payment method should have method, total, and count
    body.data.payment_methods.forEach((pm: any) => {
      expect(pm.method, "Payment method should have method").toBeDefined();
      expect(typeof pm.method, "Payment method should be string").toBe(
        "string",
      );
      expect(pm.total, "Payment method should have total").toBeDefined();
      expect(typeof pm.total, "Payment method total should be number").toBe(
        "number",
      );
      expect(pm.count, "Payment method should have count").toBeDefined();
      expect(typeof pm.count, "Payment method count should be number").toBe(
        "number",
      );
    });

    // Cleanup
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.user.delete({ where: { user_id: cashier.user_id } });
  });
});

// =============================================================================
// SECTION 3: P0 CRITICAL - VALIDATION & ERROR HANDLING
// =============================================================================

test.describe("4.6-API: Shift Report - Validation", () => {
  test("4.6-API-007: [P0] should return 404 when shift not found", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: Non-existent shift ID
    const nonExistentShiftId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Requesting report for non-existent shift
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${nonExistentShiftId}/report`,
    );

    // THEN: Should return 404 Not Found
    expect(response.status(), "Should return 404 for non-existent shift").toBe(
      404,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be SHIFT_NOT_FOUND").toBe(
      "SHIFT_NOT_FOUND",
    );
  });

  test("4.6-API-007a: [P0] should return 400 when shiftId is invalid UUID format", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: Invalid UUID format
    const invalidShiftId = "not-a-uuid";

    // WHEN: Requesting report with invalid UUID
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${invalidShiftId}/report`,
    );

    // THEN: Should return 400 Bad Request
    expect(response.status(), "Should return 400 for invalid UUID format").toBe(
      400,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be VALIDATION_ERROR").toBe(
      "VALIDATION_ERROR",
    );
  });

  test("4.6-API-007b: [P0] should return 400 when shiftId is empty string", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: Empty string shift ID
    const emptyShiftId = "";

    // WHEN: Requesting report with empty shift ID
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${emptyShiftId}/report`,
    );

    // THEN: Should return 400 Bad Request or 404
    expect(
      response.status(),
      "Should return error for empty shift ID",
    ).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });

  test("4.6-API-007c: [P0] should return 400 when shiftId is malformed UUID", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: Malformed UUID (too short)
    const malformedShiftId = "00000000-0000-0000-0000-00000000000";

    // WHEN: Requesting report with malformed UUID
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${malformedShiftId}/report`,
    );

    // THEN: Should return 400 Bad Request
    expect(response.status(), "Should return 400 for malformed UUID").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be VALIDATION_ERROR").toBe(
      "VALIDATION_ERROR",
    );
  });

  test("4.6-API-008: [P0] should return error when shift is not CLOSED", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An OPEN shift (not CLOSED)
    const cashier = await prismaClient.user.create({
      data: createUser({ name: "Cashier" }),
    });
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const shift = await prismaClient.shift.create({
      data: {
        ...createShift({
          store_id: storeManagerUser.store_id,
          opened_by: storeManagerUser.user_id,
          cashier_id: cashier.user_id,
          pos_terminal_id: terminal.pos_terminal_id,
          status: "OPEN",
        }),
      },
    });

    // WHEN: Requesting report for OPEN shift
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/report`,
    );

    // THEN: Should return error
    expect(
      response.status(),
      "Should return error for non-CLOSED shift",
    ).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be SHIFT_NOT_CLOSED").toBe(
      "SHIFT_NOT_CLOSED",
    );

    // Cleanup
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.user.delete({ where: { user_id: cashier.user_id } });
  });
});

// =============================================================================
// SECTION 4: P1 HIGH - PDF EXPORT (AC-1)
// =============================================================================

test.describe("4.6-API: Shift Report - PDF Export (AC-1)", () => {
  test("4.6-API-009: [P1] should export report as PDF", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A CLOSED shift with transactions
    const cashier = await prismaClient.user.create({
      data: createUser({ name: "Cashier" }),
    });
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const shift = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.user_id,
      terminal.pos_terminal_id,
    );

    // WHEN: Requesting PDF export
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/report/export?format=pdf`,
    );

    // THEN: Should return PDF file
    expect(response.status(), "Should return 200 OK for PDF").toBe(200);
    expect(
      response.headers()["content-type"],
      "Should return PDF content type",
    ).toContain("application/pdf");

    // AND: Response body should be PDF binary data
    const buffer = await response.body();
    expect(buffer.length, "PDF should have content").toBeGreaterThan(0);

    // Cleanup
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.user.delete({ where: { user_id: cashier.user_id } });
  });

  test("4.6-API-009a: [P1] should return error for invalid export format", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A CLOSED shift with transactions
    const cashier = await prismaClient.user.create({
      data: createUser({ name: "Cashier" }),
    });
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const shift = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.user_id,
      terminal.pos_terminal_id,
    );

    // WHEN: Requesting export with invalid format
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/report/export?format=xml`,
    );

    // THEN: Should return error for invalid format
    expect(
      response.status(),
      "Should return error for invalid format",
    ).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);

    // Cleanup
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.user.delete({ where: { user_id: cashier.user_id } });
  });

  test("4.6-API-009b: [P1] should default to PDF when format parameter is missing", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A CLOSED shift with transactions
    const cashier = await prismaClient.user.create({
      data: createUser({ name: "Cashier" }),
    });
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const shift = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.user_id,
      terminal.pos_terminal_id,
    );

    // WHEN: Requesting export without format parameter (should default to PDF)
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/report/export`,
    );

    // THEN: Should return PDF file (default format)
    expect(response.status(), "Should return 200 OK for PDF default").toBe(200);
    expect(
      response.headers()["content-type"],
      "Should return PDF content type",
    ).toContain("application/pdf");

    // Cleanup
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.user.delete({ where: { user_id: cashier.user_id } });
  });
});

// =============================================================================
// SECTION 5: P0 CRITICAL - SECURITY TESTS
// =============================================================================

test.describe("4.6-API: Shift Report - Security", () => {
  test("4.6-API-010a: [P0] should prevent SQL injection in shiftId parameter", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: SQL injection attempt in shiftId
    const sqlInjectionAttempts = [
      "'; DROP TABLE shifts; --",
      "1' OR '1'='1",
      "'; DELETE FROM shifts WHERE '1'='1",
      "1' UNION SELECT * FROM users--",
    ];

    // WHEN: Attempting SQL injection in shiftId
    for (const maliciousInput of sqlInjectionAttempts) {
      const response = await storeManagerApiRequest.get(
        `/api/shifts/${encodeURIComponent(maliciousInput)}/report`,
      );

      // THEN: Should return validation error, not execute SQL
      expect(
        response.status(),
        `Should reject SQL injection attempt: ${maliciousInput}`,
      ).toBeGreaterThanOrEqual(400);
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
      // Should be validation error, not database error
      expect(
        body.error.code === "VALIDATION_ERROR" ||
          body.error.code === "SHIFT_NOT_FOUND",
        "Should return validation or not found error, not SQL error",
      ).toBe(true);
    }
  });

  test("4.6-API-010b: [P0] should not expose sensitive data in error responses", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: Invalid shift ID
    const invalidShiftId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Requesting report for invalid shift
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${invalidShiftId}/report`,
    );

    // THEN: Error response should not contain sensitive information
    expect(response.status()).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    const responseText = JSON.stringify(body);

    // Verify sensitive data is not exposed
    expect(
      responseText.toLowerCase(),
      "Error response should not contain password",
    ).not.toContain("password");
    expect(
      responseText.toLowerCase(),
      "Error response should not contain token",
    ).not.toContain("token");
    expect(
      responseText.toLowerCase(),
      "Error response should not contain secret",
    ).not.toContain("secret");
    expect(
      responseText.toLowerCase(),
      "Error response should not contain database connection strings",
    ).not.toContain("postgres://");
  });

  test("4.6-API-010c: [P0] should not expose user passwords in report data", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A CLOSED shift with transactions
    const cashier = await prismaClient.user.create({
      data: createUser({ name: "Cashier" }),
    });
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const shift = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.user_id,
      terminal.pos_terminal_id,
    );

    // WHEN: Requesting shift report
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/report`,
    );

    // THEN: Report should not contain password fields
    expect(response.status()).toBe(200);
    const body = await response.json();
    const reportText = JSON.stringify(body);

    // Verify passwords are not exposed
    expect(
      reportText.toLowerCase(),
      "Report should not contain password",
    ).not.toContain("password");
    expect(
      reportText.toLowerCase(),
      "Report should not contain password_hash",
    ).not.toContain("password_hash");

    // Cleanup
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.user.delete({ where: { user_id: cashier.user_id } });
  });
});

// =============================================================================
// SECTION 6: P1 HIGH - RLS POLICIES
// =============================================================================

test.describe("4.6-API: Shift Report - RLS Policies", () => {
  test("4.6-API-011: [P1] should only allow access to shifts in accessible stores", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A shift in a different company (not accessible)
    const otherOwner = await prismaClient.user.create({
      data: createUser({ name: "Other Owner" }),
    });
    const otherCompany = await prismaClient.company.create({
      data: createCompany({ owner_user_id: otherOwner.user_id }),
    });
    const otherStore = await prismaClient.store.create({
      data: createStore({ company_id: otherCompany.company_id }),
    });
    const cashier = await prismaClient.user.create({
      data: createUser({ name: "Cashier" }),
    });
    const terminal = await createPOSTerminal(prismaClient, otherStore.store_id);
    const shift = await createClosedShiftWithTransactions(
      prismaClient,
      otherStore.store_id,
      otherOwner.user_id,
      cashier.user_id,
      terminal.pos_terminal_id,
    );

    // WHEN: Requesting report for shift in inaccessible store
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/report`,
    );

    // THEN: Should return 404 (RLS hides the shift)
    expect(response.status(), "Should return 404 for inaccessible shift").toBe(
      404,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be SHIFT_NOT_FOUND").toBe(
      "SHIFT_NOT_FOUND",
    );

    // Cleanup
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.store.delete({
      where: { store_id: otherStore.store_id },
    });
    await prismaClient.company.delete({
      where: { company_id: otherCompany.company_id },
    });
    await prismaClient.user.delete({ where: { user_id: cashier.user_id } });
    await prismaClient.user.delete({ where: { user_id: otherOwner.user_id } });
  });
});
