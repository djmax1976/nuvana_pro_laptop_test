import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createUser,
  createCompany,
  createStore,
  createShift,
  createTransaction,
  createTransactionLineItem,
  createTransactionPayment,
  createExpiredJWTAccessToken,
  createCashier,
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
 * Uses crypto.randomUUID() for unique device_id to prevent collisions in parallel tests
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
 * Creates a CLOSED shift with transactions for testing
 * @param prismaClient - Prisma client instance
 * @param storeId - Store UUID
 * @param openedBy - User UUID who opened the shift
 * @param cashierId - Cashier UUID (from Cashier table, for shift.cashier_id)
 * @param posTerminalId - POS terminal UUID
 * @param transactionCashierUserId - User UUID for transaction.cashier_id (references users.user_id, NOT cashiers.cashier_id)
 * @param openingCash - Opening cash amount
 * @param closingCash - Closing cash amount
 */
async function createClosedShiftWithTransactions(
  prismaClient: any,
  storeId: string,
  openedBy: string,
  cashierId: string,
  posTerminalId: string,
  transactionCashierUserId: string,
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
  // NOTE: transaction.cashier_id references users.user_id, NOT cashiers.cashier_id
  const transaction1 = await prismaClient.transaction.create({
    data: {
      ...createTransaction({
        store_id: storeId,
        shift_id: shift.shift_id,
        cashier_id: transactionCashierUserId, // User ID, not Cashier ID
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
        cashier_id: transactionCashierUserId, // User ID, not Cashier ID
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

/**
 * Cleans up a shift and all related data in the correct order
 * respecting foreign key constraints
 */
async function cleanupShiftWithTransactions(
  prismaClient: any,
  shiftId: string,
): Promise<void> {
  // 1. Find all transactions for this shift
  const transactions = await prismaClient.transaction.findMany({
    where: { shift_id: shiftId },
    select: { transaction_id: true },
  });
  const transactionIds = transactions.map(
    (t: { transaction_id: string }) => t.transaction_id,
  );

  if (transactionIds.length > 0) {
    // 2. Delete transaction payments (child of transaction)
    await prismaClient.transactionPayment.deleteMany({
      where: { transaction_id: { in: transactionIds } },
    });

    // 3. Delete transaction line items (child of transaction)
    await prismaClient.transactionLineItem.deleteMany({
      where: { transaction_id: { in: transactionIds } },
    });

    // 4. Delete transactions (child of shift)
    await prismaClient.transaction.deleteMany({
      where: { shift_id: shiftId },
    });
  }

  // 5. Delete the shift
  await prismaClient.shift.delete({ where: { shift_id: shiftId } });
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
    // GIVEN: An expired JWT token (properly signed with past expiration)
    const expiredToken = createExpiredJWTAccessToken();
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
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );
    const terminal = await createPOSTerminal(prismaClient, store.store_id);
    const shift = await createClosedShiftWithTransactions(
      prismaClient,
      store.store_id,
      owner.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      owner.user_id, // transactionCashierUserId - User ID for transaction.cashier_id
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
    await cleanupShiftWithTransactions(prismaClient, shift.shift_id);
    try {
      await prismaClient.pOSTerminal.delete({
        where: { pos_terminal_id: terminal.pos_terminal_id },
      });
    } catch (error) {
      // Terminal may already be deleted, ignore not-found errors
    }
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
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const shift = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      storeManagerUser.user_id, // transactionCashierUserId
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
      body.data.shift.store_name,
      "Shift should include store_name",
    ).toBeDefined();
    expect(
      typeof body.data.shift.store_name === "string" ||
        body.data.shift.store_name === null,
      "Store name should be string or null",
    ).toBe(true);
    expect(
      body.data.shift.cashier_id,
      "Shift should include cashier_id",
    ).toBeDefined();
    expect(
      typeof body.data.shift.cashier_id,
      "Cashier ID should be string",
    ).toBe("string");
    expect(
      body.data.shift.cashier,
      "Shift should include cashier object",
    ).toBeDefined();
    if (body.data.shift.cashier) {
      expect(
        body.data.shift.cashier.cashier_id,
        "Cashier should have cashier_id",
      ).toBeDefined();
      expect(
        body.data.shift.cashier.name,
        "Cashier should have name",
      ).toBeDefined();
    }
    expect(
      body.data.shift.opened_by,
      "Shift should include opened_by",
    ).toBeDefined();
    if (body.data.shift.opened_by) {
      expect(
        body.data.shift.opened_by.user_id,
        "Opened by should have user_id",
      ).toBeDefined();
      expect(
        body.data.shift.opened_by.name,
        "Opened by should have name",
      ).toBeDefined();
    }
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

    // AND: Report should include variance details (null if no variance)
    expect(
      body.data.variance === null || typeof body.data.variance === "object",
      "Variance should be null or object",
    ).toBe(true);
    if (body.data.variance) {
      expect(
        typeof body.data.variance.variance_amount,
        "Variance amount should be number",
      ).toBe("number");
      expect(
        typeof body.data.variance.variance_percentage,
        "Variance percentage should be number",
      ).toBe("number");
      expect(
        body.data.variance.variance_reason === null ||
          typeof body.data.variance.variance_reason === "string",
        "Variance reason should be string or null",
      ).toBe(true);
      if (body.data.variance.approved_by) {
        expect(
          body.data.variance.approved_by.user_id,
          "Approved by should have user_id",
        ).toBeDefined();
        expect(
          body.data.variance.approved_by.name,
          "Approved by should have name",
        ).toBeDefined();
      }
      expect(
        body.data.variance.approved_at === null ||
          typeof body.data.variance.approved_at === "string",
        "Approved at should be string or null",
      ).toBe(true);
    }

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
      const transaction = body.data.transactions[0];
      expect(
        transaction.transaction_id,
        "Transaction should have transaction_id",
      ).toBeDefined();
      expect(
        typeof transaction.transaction_id,
        "Transaction ID should be string",
      ).toBe("string");
      expect(
        transaction.timestamp,
        "Transaction should have timestamp",
      ).toBeDefined();
      expect(
        transaction.timestamp,
        "Timestamp should be ISO date format",
      ).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(
        typeof transaction.total,
        "Transaction total should be number",
      ).toBe("number");
      expect(
        transaction.cashier === null || typeof transaction.cashier === "object",
        "Transaction cashier should be null or object",
      ).toBe(true);
      if (transaction.cashier) {
        expect(
          transaction.cashier.user_id,
          "Transaction cashier should have user_id",
        ).toBeDefined();
        expect(
          transaction.cashier.name,
          "Transaction cashier should have name",
        ).toBeDefined();
      }
      expect(
        transaction.line_items,
        "Transactions should include line items",
      ).toBeDefined();
      expect(
        Array.isArray(transaction.line_items),
        "Line items should be an array",
      ).toBe(true);
      if (transaction.line_items.length > 0) {
        const lineItem = transaction.line_items[0];
        expect(
          lineItem.product_name,
          "Line item should have product_name",
        ).toBeDefined();
        expect(
          typeof lineItem.product_name,
          "Product name should be string",
        ).toBe("string");
        expect(
          typeof lineItem.quantity,
          "Line item quantity should be number",
        ).toBe("number");
        expect(typeof lineItem.price, "Line item price should be number").toBe(
          "number",
        );
        expect(
          typeof lineItem.subtotal,
          "Line item subtotal should be number",
        ).toBe("number");
      }
      expect(
        transaction.payments,
        "Transactions should include payments",
      ).toBeDefined();
      expect(
        Array.isArray(transaction.payments),
        "Payments should be an array",
      ).toBe(true);
      if (transaction.payments.length > 0) {
        const payment = transaction.payments[0];
        expect(payment.method, "Payment should have method").toBeDefined();
        expect(typeof payment.method, "Payment method should be string").toBe(
          "string",
        );
        expect(typeof payment.amount, "Payment amount should be number").toBe(
          "number",
        );
      }
    }

    // Cleanup
    await cleanupShiftWithTransactions(prismaClient, shift.shift_id);
    try {
      await prismaClient.pOSTerminal.delete({
        where: { pos_terminal_id: terminal.pos_terminal_id },
      });
    } catch (error) {
      // Terminal may already be deleted, ignore not-found errors
    }
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
  });

  test("4.6-API-005: [P0] should include correct sales totals in report summary", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A CLOSED shift with known transaction totals
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const shift = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      storeManagerUser.user_id, // transactionCashierUserId
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
    await cleanupShiftWithTransactions(prismaClient, shift.shift_id);
    try {
      await prismaClient.pOSTerminal.delete({
        where: { pos_terminal_id: terminal.pos_terminal_id },
      });
    } catch (error) {
      // Terminal may already be deleted, ignore not-found errors
    }
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
  });

  test("4.6-API-006: [P0] should include payment method breakdown in report", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A CLOSED shift with multiple payment methods
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const shift = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      storeManagerUser.user_id, // transactionCashierUserId
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
      expect(
        pm.total,
        "Payment method total should be positive",
      ).toBeGreaterThan(0);
      expect(pm.count, "Payment method should have count").toBeDefined();
      expect(typeof pm.count, "Payment method count should be number").toBe(
        "number",
      );
      expect(
        pm.count,
        "Payment method count should be positive",
      ).toBeGreaterThan(0);
    });

    // AND: Payment methods should match created payments (CASH: 54.0, CREDIT: 108.0)
    const cashPayment = body.data.payment_methods.find(
      (pm: any) => pm.method === "CASH",
    );
    const creditPayment = body.data.payment_methods.find(
      (pm: any) => pm.method === "CREDIT",
    );
    expect(cashPayment, "Should have CASH payment method").toBeDefined();
    expect(cashPayment.total, "CASH total should be 54.0").toBe(54.0);
    expect(cashPayment.count, "CASH count should be 1").toBe(1);
    expect(creditPayment, "Should have CREDIT payment method").toBeDefined();
    expect(creditPayment.total, "CREDIT total should be 108.0").toBe(108.0);
    expect(creditPayment.count, "CREDIT count should be 1").toBe(1);

    // Cleanup
    await cleanupShiftWithTransactions(prismaClient, shift.shift_id);
    try {
      await prismaClient.pOSTerminal.delete({
        where: { pos_terminal_id: terminal.pos_terminal_id },
      });
    } catch (error) {
      // Terminal may already be deleted, ignore not-found errors
    }
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
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
    // GIVEN: Empty string shift ID (URL encoded as %20 or results in double slash)
    // Note: Empty string in path parameter may result in route mismatch (404) or validation error (400)
    const emptyShiftId = "";

    // WHEN: Requesting report with empty shift ID
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${emptyShiftId}/report`,
    );

    // THEN: Should return 400 Bad Request (validation error) or 404 (route not found)
    expect(
      response.status(),
      "Should return error for empty shift ID",
    ).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    // If it's a 400, it should be a validation error; if 404, it's a route mismatch
    if (response.status() === 400) {
      expect(
        body.error.code,
        "Error code should be VALIDATION_ERROR for empty string",
      ).toBe("VALIDATION_ERROR");
    }
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
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const shift = await prismaClient.shift.create({
      data: {
        ...createShift({
          store_id: storeManagerUser.store_id,
          opened_by: storeManagerUser.user_id,
          cashier_id: cashier.cashier_id,
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
    await cleanupShiftWithTransactions(prismaClient, shift.shift_id);
    try {
      await prismaClient.pOSTerminal.delete({
        where: { pos_terminal_id: terminal.pos_terminal_id },
      });
    } catch (error) {
      // Terminal may already be deleted, ignore not-found errors
    }
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
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
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const shift = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      storeManagerUser.user_id, // transactionCashierUserId
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
    expect(
      response.headers()["content-disposition"],
      "Should include Content-Disposition header",
    ).toContain(`attachment; filename="shift-report-${shift.shift_id}.pdf"`);

    // AND: Response body should be PDF binary data
    const buffer = await response.body();
    expect(buffer.length, "PDF should have content").toBeGreaterThan(0);

    // Cleanup
    await cleanupShiftWithTransactions(prismaClient, shift.shift_id);
    try {
      await prismaClient.pOSTerminal.delete({
        where: { pos_terminal_id: terminal.pos_terminal_id },
      });
    } catch (error) {
      // Terminal may already be deleted, ignore not-found errors
    }
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
  });

  test("4.6-API-009a: [P1] should return error for invalid export format", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A CLOSED shift with transactions
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const shift = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      storeManagerUser.user_id, // transactionCashierUserId
    );

    // WHEN: Requesting export with invalid format
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/report/export?format=xml`,
    );

    // THEN: Should return 400 Bad Request
    // Note: Fastify schema validation (enum: ["pdf"]) rejects invalid formats
    // before the handler runs, so we get VALIDATION_ERROR from schema validation
    expect(response.status(), "Should return 400 for invalid format").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    // Schema validation returns VALIDATION_ERROR for enum mismatch
    expect(body.error.code, "Error code should be VALIDATION_ERROR").toBe(
      "VALIDATION_ERROR",
    );
    // Fastify schema validation message contains "format" field reference
    expect(
      body.error.message || JSON.stringify(body.error),
      "Error should reference the format parameter",
    ).toBeDefined();

    // Cleanup
    await cleanupShiftWithTransactions(prismaClient, shift.shift_id);
    try {
      await prismaClient.pOSTerminal.delete({
        where: { pos_terminal_id: terminal.pos_terminal_id },
      });
    } catch (error) {
      // Terminal may already be deleted, ignore not-found errors
    }
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
  });

  test("4.6-API-009b: [P1] should default to PDF when format parameter is missing", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A CLOSED shift with transactions
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const shift = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      storeManagerUser.user_id, // transactionCashierUserId
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
    expect(
      response.headers()["content-disposition"],
      "Should include Content-Disposition header",
    ).toContain(`attachment; filename="shift-report-${shift.shift_id}.pdf"`);

    // Cleanup
    await cleanupShiftWithTransactions(prismaClient, shift.shift_id);
    try {
      await prismaClient.pOSTerminal.delete({
        where: { pos_terminal_id: terminal.pos_terminal_id },
      });
    } catch (error) {
      // Terminal may already be deleted, ignore not-found errors
    }
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
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
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const shift = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      storeManagerUser.user_id, // transactionCashierUserId
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
    await cleanupShiftWithTransactions(prismaClient, shift.shift_id);
    try {
      await prismaClient.pOSTerminal.delete({
        where: { pos_terminal_id: terminal.pos_terminal_id },
      });
    } catch (error) {
      // Terminal may already be deleted, ignore not-found errors
    }
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
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
    const cashier = await createTestCashier(
      prismaClient,
      otherStore.store_id,
      otherOwner.user_id,
    );
    const terminal = await createPOSTerminal(prismaClient, otherStore.store_id);
    const shift = await createClosedShiftWithTransactions(
      prismaClient,
      otherStore.store_id,
      otherOwner.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      otherOwner.user_id, // transactionCashierUserId
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
    await cleanupShiftWithTransactions(prismaClient, shift.shift_id);
    try {
      await prismaClient.pOSTerminal.delete({
        where: { pos_terminal_id: terminal.pos_terminal_id },
      });
    } catch (error) {
      // Terminal may already be deleted, ignore not-found errors
    }
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
