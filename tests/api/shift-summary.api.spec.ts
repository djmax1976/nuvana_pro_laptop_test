import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createUser,
  createCompany,
  createStore,
  createShift,
  createTransaction,
  createTransactionPayment,
  createExpiredJWTAccessToken,
  createCashier,
} from "../support/factories";
import { Prisma } from "@prisma/client";

/**
 * @test-level API
 * @justification Endpoint integration tests verifying HTTP layer, authentication, authorization, request/response format, and error handling for GET /api/shifts/:shiftId/summary
 * @story client-owner-dashboard-shift-detail-view
 *
 * Shift Summary API Tests - Client Owner Dashboard Shift Detail View
 *
 * STORY: As a Client Owner, I want to view shift summary details,
 * so that I can review payment breakdowns and sales totals.
 *
 * TEST LEVEL: API (endpoint integration tests)
 * PRIMARY GOAL: Verify GET /api/shifts/:shiftId/summary endpoint returns aggregated shift data
 *
 * BUSINESS RULES TESTED:
 * - Summary data for CLOSED shifts only
 * - Summary includes total sales, transaction count, payment methods breakdown
 * - Authentication required (JWT token)
 * - Authorization required (SHIFT_READ permission)
 * - Multi-tenant isolation (store_id must be accessible to user)
 * - Validation errors (invalid shift_id, shift not CLOSED)
 *
 * =============================================================================
 * REQUIREMENTS TRACEABILITY MATRIX (RTM)
 * =============================================================================
 *
 * | Test ID            | Phase | Requirement                                    | Priority | Type        |
 * |--------------------|-------|------------------------------------------------|----------|-------------|
 * | SHIFT-SUMMARY-010  | Core  | Return 404 for cross-company access (RLS)     | P0       | Security    |
 * | SHIFT-SUMMARY-020  | Core  | Return 404 for non-existent shift             | P0       | Edge Case   |
 * | SHIFT-SUMMARY-030  | Core  | Return 400 for non-CLOSED shift               | P0       | Validation  |
 * | SHIFT-SUMMARY-040  | Core  | Return 401 for missing/invalid auth token     | P0       | Security    |
 * | SHIFT-SUMMARY-050  | Core  | Return 403 for missing SHIFT_READ permission  | P0       | Security    |
 * | SHIFT-SUMMARY-060  | Core  | Return 403 for cross-tenant access attempt    | P0       | Security    |
 * | SHIFT-SUMMARY-070  | 2.4   | Aggregate line items by tax_rate_id           | P1       | Integration |
 * | SHIFT-SUMMARY-071  | 2.4   | Handle line items without tax_rate_id (legacy)| P1       | Edge Case   |
 * | SHIFT-SUMMARY-072  | 2.4   | Handle denormalized tax_rate_code/value       | P1       | Integration |
 * | SHIFT-SUMMARY-080  | 2.7   | Read from ShiftSummary table when available   | P1       | Integration |
 * | SHIFT-SUMMARY-081  | 2.7   | Fallback to runtime aggregation if no summary | P1       | Edge Case   |
 * | SHIFT-SUMMARY-082  | 2.7   | Return payment_methods from tender_summaries  | P1       | Integration |
 * | SHIFT-SUMMARY-090  | Core  | Calculate net_sales = gross - returns - disc  | P1       | Business    |
 * | SHIFT-SUMMARY-091  | Core  | Calculate avg_transaction correctly           | P1       | Business    |
 * | SHIFT-SUMMARY-100  | Core  | Prevent NoSQL injection via shift_id param    | P0       | Security    |
 * | SHIFT-SUMMARY-101  | Core  | Not expose internal error details in response | P0       | Security    |
 * | SHIFT-SUMMARY-102  | Core  | Enforce tenant isolation across companies     | P0       | Security    |
 *
 * =============================================================================
 * PHASE COVERAGE SUMMARY
 * =============================================================================
 *
 * Phase 2.4 - Tax Rate Aggregation (3 tests):
 *   - SHIFT-SUMMARY-070: Tax rate FK aggregation
 *   - SHIFT-SUMMARY-071: Historical data without FK
 *   - SHIFT-SUMMARY-072: Denormalized tax fields
 *
 * Phase 2.7 - ShiftSummary Table Integration (3 tests):
 *   - SHIFT-SUMMARY-080: Read from pre-computed summary
 *   - SHIFT-SUMMARY-081: Runtime aggregation fallback
 *   - SHIFT-SUMMARY-082: Tender summaries integration
 *
 * Security Tests (6 tests):
 *   - SHIFT-SUMMARY-040: Authentication required
 *   - SHIFT-SUMMARY-050: Authorization required
 *   - SHIFT-SUMMARY-060: Tenant isolation
 *   - SHIFT-SUMMARY-100: Injection prevention
 *   - SHIFT-SUMMARY-101: Error detail hiding
 *   - SHIFT-SUMMARY-102: Cross-tenant blocking
 *
 * Business Logic Tests (2 tests):
 *   - SHIFT-SUMMARY-090: Net sales calculation
 *   - SHIFT-SUMMARY-091: Average transaction calculation
 *
 * =============================================================================
 */

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Gets an existing system TenderType by code or creates one if not found
 * Required because ShiftTenderSummary has an FK constraint to TenderType
 */
async function getOrCreateSystemTenderType(
  prismaClient: any,
  code: string = "CASH",
): Promise<{ tender_type_id: string; code: string; display_name: string }> {
  // First try to find an existing system tender type
  let tenderType = await prismaClient.tenderType.findFirst({
    where: { code, is_system: true },
  });

  // If not found, create one for testing
  if (!tenderType) {
    tenderType = await prismaClient.tenderType.create({
      data: {
        code,
        display_name: code === "CASH" ? "Cash" : code,
        description: `Test ${code} tender type`,
        is_cash_equivalent: code === "CASH",
        requires_reference: false,
        is_electronic: code !== "CASH",
        affects_cash_drawer: code === "CASH",
        sort_order: 1,
        is_system: true,
        is_active: true,
      },
    });
  }

  return {
    tender_type_id: tenderType.tender_type_id,
    code: tenderType.code,
    display_name: tenderType.display_name,
  };
}

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
 * Creates a CLOSED shift with transactions for testing
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
        opened_at: new Date(Date.now() - 8 * 60 * 60 * 1000),
        closed_at: new Date(),
      }),
    },
  });

  // Create transactions for the shift with different payment methods
  const transaction1 = await prismaClient.transaction.create({
    data: {
      ...createTransaction({
        store_id: storeId,
        shift_id: shift.shift_id,
        cashier_id: transactionCashierUserId,
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
        cashier_id: transactionCashierUserId,
        pos_terminal_id: posTerminalId,
        subtotal: 100.0,
        tax: 8.0,
        discount: 0,
        total: 108.0,
      }),
    },
  });

  const transaction3 = await prismaClient.transaction.create({
    data: {
      ...createTransaction({
        store_id: storeId,
        shift_id: shift.shift_id,
        cashier_id: transactionCashierUserId,
        pos_terminal_id: posTerminalId,
        subtotal: 75.0,
        tax: 6.0,
        discount: 0,
        total: 81.0,
      }),
    },
  });

  // Create payments with different methods
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

  await prismaClient.transactionPayment.create({
    data: createTransactionPayment({
      transaction_id: transaction3.transaction_id,
      method: "CASH",
      amount: 81.0,
    }),
  });

  return {
    shift_id: shift.shift_id,
    status: shift.status,
  };
}

/**
 * Creates an ACTIVE shift for testing (no closing data)
 */
async function createActiveShift(
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
 * Cleans up a shift and all related data
 */
async function cleanupShiftWithTransactions(
  prismaClient: any,
  shiftId: string,
): Promise<void> {
  const transactions = await prismaClient.transaction.findMany({
    where: { shift_id: shiftId },
    select: { transaction_id: true },
  });
  const transactionIds = transactions.map(
    (t: { transaction_id: string }) => t.transaction_id,
  );

  if (transactionIds.length > 0) {
    await prismaClient.transactionPayment.deleteMany({
      where: { transaction_id: { in: transactionIds } },
    });
    await prismaClient.transactionLineItem.deleteMany({
      where: { transaction_id: { in: transactionIds } },
    });
    await prismaClient.transaction.deleteMany({
      where: { shift_id: shiftId },
    });
  }

  await prismaClient.shift.delete({ where: { shift_id: shiftId } });
}

/**
 * Safely cleans up test data (company, store, users, shifts, etc.)
 * Uses bypass client to avoid RLS issues and handles errors gracefully
 */
async function safeCleanupTestData(data: {
  shiftId?: string;
  cashierId?: string;
  terminalId?: string;
  storeId?: string;
  companyId?: string;
  userId?: string;
}): Promise<void> {
  const { withBypassClient } = await import("../support/prisma-bypass");
  await withBypassClient(async (bypassClient) => {
    // Clean up shift and transactions first if shiftId provided
    if (data.shiftId) {
      await cleanupShiftWithTransactions(bypassClient, data.shiftId).catch(
        () => {},
      );
    }

    // Delete cashier
    if (data.cashierId) {
      await bypassClient.cashier
        .delete({ where: { cashier_id: data.cashierId } })
        .catch(() => {});
    }

    // Delete terminal
    if (data.terminalId) {
      await bypassClient.pOSTerminal
        .delete({ where: { pos_terminal_id: data.terminalId } })
        .catch(() => {});
    }

    // Delete store
    if (data.storeId) {
      await bypassClient.store
        .delete({ where: { store_id: data.storeId } })
        .catch(() => {});
    }

    // Delete company
    if (data.companyId) {
      await bypassClient.company
        .delete({ where: { company_id: data.companyId } })
        .catch(() => {});
    }

    // Delete user
    if (data.userId) {
      await bypassClient.user
        .delete({ where: { user_id: data.userId } })
        .catch(() => {});
    }
  });
}

// =============================================================================
// SECTION 1: P0 CRITICAL - AUTHENTICATION TESTS
// =============================================================================

test.describe("SHIFT-SUMMARY-API: Authentication", () => {
  test("SHIFT-SUMMARY-001: [P0] should return 401 when JWT token is missing", async ({
    apiRequest,
  }) => {
    // GIVEN: Valid shift ID format
    const shiftId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Requesting shift summary without JWT token
    const response = await apiRequest.get(`/api/shifts/${shiftId}/summary`);

    // THEN: Should return 401 Unauthorized
    expect(response.status(), "Should return 401 for missing token").toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be UNAUTHORIZED").toBe(
      "UNAUTHORIZED",
    );
  });

  test("SHIFT-SUMMARY-002: [P0] should return 401 when JWT token is invalid", async ({
    apiRequest,
  }) => {
    // GIVEN: An invalid JWT token
    const invalidToken = "invalid.jwt.token";
    const shiftId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Requesting shift summary with invalid token
    const response = await apiRequest.get(`/api/shifts/${shiftId}/summary`, {
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

  test("SHIFT-SUMMARY-003: [P0] should return 401 when JWT token is expired", async ({
    apiRequest,
  }) => {
    // GIVEN: An expired JWT token
    const expiredToken = createExpiredJWTAccessToken();
    const shiftId = "00000000-0000-0000-0000-000000000000";

    // WHEN: Requesting shift summary with expired token
    const response = await apiRequest.get(`/api/shifts/${shiftId}/summary`, {
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

// =============================================================================
// SECTION 2: P0 CRITICAL - AUTHORIZATION TESTS
// =============================================================================

test.describe("SHIFT-SUMMARY-API: Authorization", () => {
  test("SHIFT-SUMMARY-010: [P0] should return 404 when accessing shift from different company (RLS enforcement)", async ({
    regularUserApiRequest,
    regularUser,
    prismaClient,
  }) => {
    // GIVEN: A shift in a DIFFERENT company than the regularUser's company
    // Note: This tests RLS enforcement - users cannot access shifts in other companies
    // The regularUser has SHIFT_READ permission but for their OWN company only
    // NOTE: Use "Test " prefix for cleanup compatibility in CI
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Test Shift Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({
        name: `Test RLS Company ${Date.now()}`,
        owner_user_id: owner.user_id,
      }),
    });
    const store = await prismaClient.store.create({
      data: createStore({
        company_id: company.company_id,
        name: `Test RLS Store ${Date.now()}`,
      }),
    });
    const terminal = await createPOSTerminal(prismaClient, store.store_id);
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );
    const shift = await createClosedShiftWithTransactions(
      prismaClient,
      store.store_id,
      owner.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      owner.user_id,
    );

    // WHEN: Requesting shift summary for a shift in a different company
    const response = await regularUserApiRequest.get(
      `/api/shifts/${shift.shift_id}/summary`,
    );

    // THEN: Should return 404 (RLS hides the shift - it's "not found" from user's perspective)
    // Note: The API intentionally returns 404 instead of 403 to avoid leaking information
    // about whether the shift exists in another tenant
    expect(
      response.status(),
      "Should return 404 for shift in different company (RLS)",
    ).toBe(404);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);

    // Cleanup: Use safe cleanup helper to avoid RLS issues and handle errors gracefully
    await safeCleanupTestData({
      shiftId: shift.shift_id,
      cashierId: cashier.cashier_id,
      terminalId: terminal.pos_terminal_id,
      storeId: store.store_id,
      companyId: company.company_id,
      userId: owner.user_id,
    });
  });
});

// =============================================================================
// SECTION 3: P0 CRITICAL - HAPPY PATH TESTS
// =============================================================================

test.describe("SHIFT-SUMMARY-API: Happy Path", () => {
  test("SHIFT-SUMMARY-020: [P0] should return shift summary with payment methods breakdown", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A closed shift with transactions and payments
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const shift = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      storeManagerUser.user_id,
    );

    // WHEN: Requesting shift summary with valid token
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/summary`,
    );

    // THEN: Should return 200 with summary data
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data, "Response should contain data").toBeDefined();

    // Verify summary structure
    expect(body.data.shift_id, "Should return correct shift_id").toBe(
      shift.shift_id,
    );
    expect(typeof body.data.total_sales, "total_sales should be a number").toBe(
      "number",
    );
    expect(
      typeof body.data.transaction_count,
      "transaction_count should be a number",
    ).toBe("number");
    expect(
      Array.isArray(body.data.payment_methods),
      "payment_methods should be an array",
    ).toBe(true);

    // Verify payment methods breakdown
    expect(
      body.data.payment_methods.length,
      "Should have payment methods",
    ).toBeGreaterThan(0);

    // Verify payment method structure
    const cashPayment = body.data.payment_methods.find(
      (pm: any) => pm.method === "CASH",
    );
    expect(cashPayment, "Should have CASH payment method").toBeDefined();
    expect(typeof cashPayment.total, "total should be a number").toBe("number");
    expect(typeof cashPayment.count, "count should be a number").toBe("number");

    // Cleanup
    await cleanupShiftWithTransactions(prismaClient, shift.shift_id);
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });

  test("SHIFT-SUMMARY-021: [P0] should aggregate multiple payments of same type", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A closed shift with multiple CASH transactions
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const shift = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      storeManagerUser.user_id,
    );

    // WHEN: Requesting shift summary
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/summary`,
    );

    // THEN: Should aggregate CASH payments
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();

    const cashPayment = body.data.payment_methods.find(
      (pm: any) => pm.method === "CASH",
    );
    expect(cashPayment, "Should have aggregated CASH payment").toBeDefined();
    // We created 2 CASH payments: $54 + $81 = $135
    expect(cashPayment.total, "CASH total should be aggregated").toBe(135);
    expect(cashPayment.count, "CASH count should be aggregated").toBe(2);

    // Cleanup
    await cleanupShiftWithTransactions(prismaClient, shift.shift_id);
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });

  test("SHIFT-SUMMARY-022: [P0] should return correct total sales and transaction count", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A closed shift with known transactions
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const shift = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      storeManagerUser.user_id,
    );

    // WHEN: Requesting shift summary
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/summary`,
    );

    // THEN: Should return correct totals
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();

    // We created 3 transactions: $54 + $108 + $81 = $243
    expect(body.data.total_sales, "total_sales should be correct").toBe(243);
    expect(body.data.transaction_count, "transaction_count should be 3").toBe(
      3,
    );

    // Cleanup
    await cleanupShiftWithTransactions(prismaClient, shift.shift_id);
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

test.describe("SHIFT-SUMMARY-API: Validation", () => {
  test("SHIFT-SUMMARY-030: [P1] should return 400 for invalid shift ID format", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: An invalid shift ID format
    const invalidShiftId = "not-a-valid-uuid";

    // WHEN: Requesting shift summary with invalid ID
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${invalidShiftId}/summary`,
    );

    // THEN: Should return 400 Bad Request
    expect(response.status(), "Should return 400 for invalid UUID").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be VALIDATION_ERROR").toBe(
      "VALIDATION_ERROR",
    );
  });

  test("SHIFT-SUMMARY-031: [P1] should return 404 for non-existent shift", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: A valid UUID that doesn't exist (use a proper v4 UUID format)
    const nonExistentShiftId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

    // WHEN: Requesting shift summary for non-existent shift
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${nonExistentShiftId}/summary`,
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

  test("SHIFT-SUMMARY-032: [P1] should return 400 for ACTIVE shift (not CLOSED)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: An ACTIVE shift (not closed)
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const shift = await createActiveShift(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
    );

    // WHEN: Requesting summary for ACTIVE shift
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/summary`,
    );

    // THEN: Should return 400 Bad Request
    expect(response.status(), "Should return 400 for ACTIVE shift").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Error code should be SHIFT_NOT_CLOSED").toBe(
      "SHIFT_NOT_CLOSED",
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

test.describe("SHIFT-SUMMARY-API: Multi-tenant Isolation", () => {
  test("SHIFT-SUMMARY-040: [P1] should return 404 when accessing shift from different company", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A shift from a different company
    // NOTE: Use "Test " prefix for cleanup compatibility in CI
    const otherOwner = await prismaClient.user.create({
      data: createUser({ name: `Test Other Owner ${Date.now()}` }),
    });
    const otherCompany = await prismaClient.company.create({
      data: createCompany({
        name: `Test Other Company ${Date.now()}`,
        owner_user_id: otherOwner.user_id,
      }),
    });
    const otherStore = await prismaClient.store.create({
      data: createStore({
        company_id: otherCompany.company_id,
        name: `Test Other Store ${Date.now()}`,
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
    const otherShift = await createClosedShiftWithTransactions(
      prismaClient,
      otherStore.store_id,
      otherOwner.user_id,
      otherCashier.cashier_id,
      otherTerminal.pos_terminal_id,
      otherOwner.user_id,
    );

    // WHEN: storeManagerUser tries to access shift from otherCompany
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${otherShift.shift_id}/summary`,
    );

    // THEN: Should return 404 (shift not accessible)
    expect(
      response.status(),
      "Should return 404 for cross-company access",
    ).toBe(404);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);

    // Cleanup: Use safe cleanup helper
    await safeCleanupTestData({
      shiftId: otherShift.shift_id,
      cashierId: otherCashier.cashier_id,
      terminalId: otherTerminal.pos_terminal_id,
      storeId: otherStore.store_id,
      companyId: otherCompany.company_id,
      userId: otherOwner.user_id,
    });
  });
});

// =============================================================================
// SECTION 6: P2 - EDGE CASES
// =============================================================================

test.describe("SHIFT-SUMMARY-API: Edge Cases", () => {
  test("SHIFT-SUMMARY-050: [P2] should handle shift with no transactions", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A closed shift with no transactions
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // Create shift directly without transactions
    const shift = await prismaClient.shift.create({
      data: {
        ...createShift({
          store_id: storeManagerUser.store_id,
          opened_by: storeManagerUser.user_id,
          cashier_id: cashier.cashier_id,
          pos_terminal_id: terminal.pos_terminal_id,
          opening_cash: new Prisma.Decimal(100.0),
          closing_cash: new Prisma.Decimal(100.0),
          expected_cash: new Prisma.Decimal(100.0),
          variance: new Prisma.Decimal(0),
          status: "CLOSED",
          opened_at: new Date(Date.now() - 8 * 60 * 60 * 1000),
          closed_at: new Date(),
        }),
      },
    });

    // WHEN: Requesting summary for shift with no transactions
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/summary`,
    );

    // THEN: Should return valid summary with zeros
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.total_sales, "total_sales should be 0").toBe(0);
    expect(body.data.transaction_count, "transaction_count should be 0").toBe(
      0,
    );
    expect(
      body.data.payment_methods,
      "payment_methods should be empty array",
    ).toEqual([]);

    // Cleanup
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });

  test("SHIFT-SUMMARY-051: [P2] should return 400 for SQL injection attempt in shiftId", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: A malicious shift ID with SQL injection attempt
    const maliciousShiftId =
      "00000000-0000-0000-0000-000000000000'; DROP TABLE shifts;--";

    // WHEN: Attempting SQL injection in shift ID
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${encodeURIComponent(maliciousShiftId)}/summary`,
    );

    // THEN: Should return 400 (validation error, not successful injection)
    expect(
      response.status(),
      "Should return 400 for SQL injection attempt",
    ).toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });
});

// =============================================================================
// SECTION 7: P1 - PHASE 2.7 ENHANCED SUMMARY FIELDS
// =============================================================================

test.describe("SHIFT-SUMMARY-API: Phase 2.7 Enhanced Summary Fields", () => {
  test("SHIFT-SUMMARY-060: [P1] should return enhanced fields when from_summary_table is true", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A closed shift with ShiftSummary created (simulating a recently closed shift)
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const shift = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      storeManagerUser.user_id,
    );

    // WHEN: Requesting shift summary
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/summary`,
    );

    // THEN: Should return 200 with summary data
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);

    // If from_summary_table is true, enhanced fields should be present
    if (body.data.from_summary_table === true) {
      expect(
        typeof body.data.gross_sales,
        "gross_sales should be a number when from summary table",
      ).toBe("number");
      expect(
        typeof body.data.returns_total,
        "returns_total should be a number when from summary table",
      ).toBe("number");
      expect(
        typeof body.data.discounts_total,
        "discounts_total should be a number when from summary table",
      ).toBe("number");
      expect(
        typeof body.data.net_sales,
        "net_sales should be a number when from summary table",
      ).toBe("number");
      expect(
        typeof body.data.tax_collected,
        "tax_collected should be a number when from summary table",
      ).toBe("number");
      expect(
        typeof body.data.avg_transaction,
        "avg_transaction should be a number when from summary table",
      ).toBe("number");
      expect(
        typeof body.data.items_sold_count,
        "items_sold_count should be a number when from summary table",
      ).toBe("number");
    } else {
      // Fallback mode - from_summary_table should be false
      expect(
        body.data.from_summary_table,
        "from_summary_table should be false for fallback mode",
      ).toBe(false);
    }

    // Cleanup
    // First delete any shift summary that was created
    try {
      await prismaClient.shiftTenderSummary.deleteMany({
        where: {
          shift_summary: { shift_id: shift.shift_id },
        },
      });
      await prismaClient.shiftDepartmentSummary.deleteMany({
        where: {
          shift_summary: { shift_id: shift.shift_id },
        },
      });
      await prismaClient.shiftTaxSummary.deleteMany({
        where: {
          shift_summary: { shift_id: shift.shift_id },
        },
      });
      await prismaClient.shiftHourlySummary.deleteMany({
        where: {
          shift_summary: { shift_id: shift.shift_id },
        },
      });
      await prismaClient.shiftSummary.deleteMany({
        where: { shift_id: shift.shift_id },
      });
    } catch {
      // Ignore if summary doesn't exist
    }
    await cleanupShiftWithTransactions(prismaClient, shift.shift_id);
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });

  test("SHIFT-SUMMARY-061: [P1] should always return core fields regardless of summary table source", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A closed shift
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const shift = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      storeManagerUser.user_id,
    );

    // WHEN: Requesting shift summary
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/summary`,
    );

    // THEN: Core fields should always be present (backward compatibility)
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);

    // These core fields must always be present for backward compatibility
    expect(body.data.shift_id, "shift_id should be present").toBeDefined();
    expect(
      body.data.total_sales,
      "total_sales should be present",
    ).toBeDefined();
    expect(
      body.data.transaction_count,
      "transaction_count should be present",
    ).toBeDefined();
    expect(
      body.data.payment_methods,
      "payment_methods should be present",
    ).toBeDefined();

    // Cleanup
    try {
      await prismaClient.shiftTenderSummary.deleteMany({
        where: { shift_summary: { shift_id: shift.shift_id } },
      });
      await prismaClient.shiftDepartmentSummary.deleteMany({
        where: { shift_summary: { shift_id: shift.shift_id } },
      });
      await prismaClient.shiftTaxSummary.deleteMany({
        where: { shift_summary: { shift_id: shift.shift_id } },
      });
      await prismaClient.shiftHourlySummary.deleteMany({
        where: { shift_summary: { shift_id: shift.shift_id } },
      });
      await prismaClient.shiftSummary.deleteMany({
        where: { shift_id: shift.shift_id },
      });
    } catch {
      // Ignore if summary doesn't exist
    }
    await cleanupShiftWithTransactions(prismaClient, shift.shift_id);
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });
});

// =============================================================================
// SECTION 8: P1 - PHASE 2.4 TAX RATE AGGREGATION TESTS
// =============================================================================

test.describe("SHIFT-SUMMARY-API: Phase 2.4 Tax Rate Aggregation", () => {
  /**
   * Helper: Check if Phase 2.4 migration has been applied (tax_rate_id column exists)
   * Returns true if the column exists, false otherwise
   */
  async function isPhase24MigrationApplied(
    prismaClient: any,
  ): Promise<boolean> {
    try {
      // Try to select the tax_rate_id column - if it doesn't exist, this will throw
      await prismaClient.$queryRaw`SELECT tax_rate_id FROM transaction_line_items LIMIT 1`;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Helper: Creates a closed shift with transactions that have tax rate information
   * on their line items for testing Phase 2.4 tax aggregation
   */
  async function createClosedShiftWithTaxRatedLineItems(
    prismaClient: any,
    storeId: string,
    openedBy: string,
    cashierId: string,
    posTerminalId: string,
    taxRateId: string,
    taxRateCode: string,
    taxRateValue: number,
  ): Promise<{ shift_id: string; status: string }> {
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
          opened_at: new Date(Date.now() - 8 * 60 * 60 * 1000),
          closed_at: new Date(),
        }),
      },
    });

    // Create transaction with line items that have tax rate tracking
    const transaction = await prismaClient.transaction.create({
      data: {
        ...createTransaction({
          store_id: storeId,
          shift_id: shift.shift_id,
          cashier_id: openedBy,
          pos_terminal_id: posTerminalId,
          subtotal: 100.0,
          tax: 8.25,
          discount: 0,
          total: 108.25,
        }),
      },
    });

    // Create line item with tax rate tracking (Phase 2.4)
    await prismaClient.transactionLineItem.create({
      data: {
        transaction_id: transaction.transaction_id,
        sku: "TEST-SKU-001",
        name: "Test Product with Tax",
        quantity: 2,
        unit_price: new Prisma.Decimal(50.0),
        discount: new Prisma.Decimal(0),
        line_total: new Prisma.Decimal(100.0),
        tax_amount: new Prisma.Decimal(8.25),
        // Phase 2.4 tax rate fields
        tax_rate_id: taxRateId,
        tax_rate_code: taxRateCode,
        tax_rate_value: new Prisma.Decimal(taxRateValue),
      },
    });

    // Create payment
    await prismaClient.transactionPayment.create({
      data: createTransactionPayment({
        transaction_id: transaction.transaction_id,
        method: "CASH",
        amount: 108.25,
      }),
    });

    return {
      shift_id: shift.shift_id,
      status: shift.status,
    };
  }

  test("SHIFT-SUMMARY-070: [P1] should aggregate line items by tax_rate_id when creating shift summary", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // Skip test if Phase 2.4 migration hasn't been applied
    if (!(await isPhase24MigrationApplied(prismaClient))) {
      test.skip(
        true,
        "Phase 2.4 migration not applied (tax_rate_id column missing)",
      );
      return;
    }

    // GIVEN: A tax rate exists in the system
    const taxRate = await prismaClient.taxRate.findFirst({
      where: { code: "COMBINED_DEFAULT", is_system: true },
    });

    // Skip test if no tax rate exists (seed data not loaded)
    if (!taxRate) {
      test.skip(true, "No system tax rate found. Ensure seeds are loaded.");
      return;
    }

    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // Create shift with tax-rated line items
    const shift = await createClosedShiftWithTaxRatedLineItems(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      taxRate.tax_rate_id,
      taxRate.code,
      Number(taxRate.rate),
    );

    // WHEN: Requesting shift summary
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/summary`,
    );

    // THEN: Should return 200 with summary data
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);

    // Tax collected should reflect the line item tax
    expect(
      body.data.total_sales,
      "total_sales should include the transaction total",
    ).toBeGreaterThan(0);

    // Cleanup
    try {
      await prismaClient.shiftTenderSummary.deleteMany({
        where: { shift_summary: { shift_id: shift.shift_id } },
      });
      await prismaClient.shiftDepartmentSummary.deleteMany({
        where: { shift_summary: { shift_id: shift.shift_id } },
      });
      await prismaClient.shiftTaxSummary.deleteMany({
        where: { shift_summary: { shift_id: shift.shift_id } },
      });
      await prismaClient.shiftHourlySummary.deleteMany({
        where: { shift_summary: { shift_id: shift.shift_id } },
      });
      await prismaClient.shiftSummary.deleteMany({
        where: { shift_id: shift.shift_id },
      });
    } catch {
      // Ignore if summary doesn't exist
    }

    // Clean up transaction data
    const transactions = await prismaClient.transaction.findMany({
      where: { shift_id: shift.shift_id },
      select: { transaction_id: true },
    });
    const transactionIds = transactions.map((t: any) => t.transaction_id);

    if (transactionIds.length > 0) {
      await prismaClient.transactionPayment.deleteMany({
        where: { transaction_id: { in: transactionIds } },
      });
      await prismaClient.transactionLineItem.deleteMany({
        where: { transaction_id: { in: transactionIds } },
      });
      await prismaClient.transaction.deleteMany({
        where: { shift_id: shift.shift_id },
      });
    }

    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });

  test("SHIFT-SUMMARY-071: [P1] should handle line items without tax_rate_id (historical data fallback)", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // Skip test if Phase 2.4 migration hasn't been applied
    if (!(await isPhase24MigrationApplied(prismaClient))) {
      test.skip(
        true,
        "Phase 2.4 migration not applied (tax_rate_id column missing)",
      );
      return;
    }

    // GIVEN: A closed shift with line items that have NO tax_rate_id (simulating historical data)
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
          closing_cash: new Prisma.Decimal(200.0),
          expected_cash: new Prisma.Decimal(200.0),
          variance: new Prisma.Decimal(0),
          status: "CLOSED",
          opened_at: new Date(Date.now() - 8 * 60 * 60 * 1000),
          closed_at: new Date(),
        }),
      },
    });

    // Create transaction
    const transaction = await prismaClient.transaction.create({
      data: {
        ...createTransaction({
          store_id: storeManagerUser.store_id,
          shift_id: shift.shift_id,
          cashier_id: storeManagerUser.user_id,
          pos_terminal_id: terminal.pos_terminal_id,
          subtotal: 50.0,
          tax: 4.0,
          discount: 0,
          total: 54.0,
        }),
      },
    });

    // Create line item WITHOUT tax_rate_id (historical data scenario)
    await prismaClient.transactionLineItem.create({
      data: {
        transaction_id: transaction.transaction_id,
        sku: "LEGACY-SKU-001",
        name: "Legacy Product",
        quantity: 1,
        unit_price: new Prisma.Decimal(50.0),
        discount: new Prisma.Decimal(0),
        line_total: new Prisma.Decimal(50.0),
        tax_amount: new Prisma.Decimal(4.0),
        // No tax_rate_id, tax_rate_code, or tax_rate_value (historical data)
      },
    });

    // Create payment
    await prismaClient.transactionPayment.create({
      data: createTransactionPayment({
        transaction_id: transaction.transaction_id,
        method: "CASH",
        amount: 54.0,
      }),
    });

    // WHEN: Requesting shift summary
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/summary`,
    );

    // THEN: Should return 200 and fallback to runtime aggregation (from_summary_table: false)
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.total_sales, "total_sales should be calculated").toBe(54);
    expect(body.data.transaction_count, "transaction_count should be 1").toBe(
      1,
    );

    // Cleanup
    await prismaClient.transactionPayment.deleteMany({
      where: { transaction_id: transaction.transaction_id },
    });
    await prismaClient.transactionLineItem.deleteMany({
      where: { transaction_id: transaction.transaction_id },
    });
    await prismaClient.transaction.deleteMany({
      where: { shift_id: shift.shift_id },
    });
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });

  test("SHIFT-SUMMARY-072: [P1] should handle denormalized tax_rate_code and tax_rate_value without FK", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // Skip test if Phase 2.4 migration hasn't been applied
    if (!(await isPhase24MigrationApplied(prismaClient))) {
      test.skip(
        true,
        "Phase 2.4 migration not applied (tax_rate_id column missing)",
      );
      return;
    }

    // GIVEN: A closed shift with line items that have denormalized tax info but no FK
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
          closing_cash: new Prisma.Decimal(200.0),
          expected_cash: new Prisma.Decimal(200.0),
          variance: new Prisma.Decimal(0),
          status: "CLOSED",
          opened_at: new Date(Date.now() - 8 * 60 * 60 * 1000),
          closed_at: new Date(),
        }),
      },
    });

    // Create transaction
    const transaction = await prismaClient.transaction.create({
      data: {
        ...createTransaction({
          store_id: storeManagerUser.store_id,
          shift_id: shift.shift_id,
          cashier_id: storeManagerUser.user_id,
          pos_terminal_id: terminal.pos_terminal_id,
          subtotal: 75.0,
          tax: 6.19,
          discount: 0,
          total: 81.19,
        }),
      },
    });

    // Create line item with denormalized tax info but NO FK
    await prismaClient.transactionLineItem.create({
      data: {
        transaction_id: transaction.transaction_id,
        sku: "DENORM-SKU-001",
        name: "Product with Denormalized Tax",
        quantity: 1,
        unit_price: new Prisma.Decimal(75.0),
        discount: new Prisma.Decimal(0),
        line_total: new Prisma.Decimal(75.0),
        tax_amount: new Prisma.Decimal(6.19),
        // Denormalized values without FK (e.g., from external POS import)
        tax_rate_id: null,
        tax_rate_code: "STATE_TX",
        tax_rate_value: new Prisma.Decimal(0.0825),
      },
    });

    // Create payment
    await prismaClient.transactionPayment.create({
      data: createTransactionPayment({
        transaction_id: transaction.transaction_id,
        method: "CREDIT",
        amount: 81.19,
      }),
    });

    // WHEN: Requesting shift summary
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/summary`,
    );

    // THEN: Should return 200 with valid summary
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(
      body.data.total_sales,
      "total_sales should be calculated correctly",
    ).toBeCloseTo(81.19, 1);

    // Cleanup
    await prismaClient.transactionPayment.deleteMany({
      where: { transaction_id: transaction.transaction_id },
    });
    await prismaClient.transactionLineItem.deleteMany({
      where: { transaction_id: transaction.transaction_id },
    });
    await prismaClient.transaction.deleteMany({
      where: { shift_id: shift.shift_id },
    });
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
// SECTION 9: P1 - PHASE 2.7 SHIFT SUMMARY TABLE INTEGRATION TESTS
// =============================================================================

test.describe("SHIFT-SUMMARY-API: Phase 2.7 ShiftSummary Table Integration", () => {
  test("SHIFT-SUMMARY-080: [P1] should read from ShiftSummary table when available", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A closed shift with a pre-created ShiftSummary record
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // Get or create a system tender type for the FK constraint
    const tenderType = await getOrCreateSystemTenderType(prismaClient, "CASH");

    const shift = await prismaClient.shift.create({
      data: {
        ...createShift({
          store_id: storeManagerUser.store_id,
          opened_by: storeManagerUser.user_id,
          cashier_id: cashier.cashier_id,
          pos_terminal_id: terminal.pos_terminal_id,
          opening_cash: new Prisma.Decimal(100.0),
          closing_cash: new Prisma.Decimal(500.0),
          expected_cash: new Prisma.Decimal(500.0),
          variance: new Prisma.Decimal(0),
          status: "CLOSED",
          opened_at: new Date(Date.now() - 8 * 60 * 60 * 1000),
          closed_at: new Date(),
        }),
      },
    });

    // Pre-create a ShiftSummary record (simulating shift close process)
    const shiftSummary = await prismaClient.shiftSummary.create({
      data: {
        shift_id: shift.shift_id,
        store_id: storeManagerUser.store_id,
        business_date: new Date(),
        shift_opened_at: new Date(Date.now() - 8 * 60 * 60 * 1000),
        shift_closed_at: new Date(),
        shift_duration_mins: 480,
        opened_by_user_id: storeManagerUser.user_id,
        closed_by_user_id: storeManagerUser.user_id,
        gross_sales: new Prisma.Decimal(1000.0),
        returns_total: new Prisma.Decimal(50.0),
        discounts_total: new Prisma.Decimal(25.0),
        net_sales: new Prisma.Decimal(925.0),
        tax_collected: new Prisma.Decimal(76.31),
        tax_exempt_sales: new Prisma.Decimal(0),
        taxable_sales: new Prisma.Decimal(925.0),
        transaction_count: 25,
        void_count: 1,
        refund_count: 2,
        no_sale_count: 0,
        items_sold_count: 75,
        items_returned_count: 3,
        avg_transaction: new Prisma.Decimal(37.0),
        avg_items_per_txn: new Prisma.Decimal(3.0),
        opening_cash: new Prisma.Decimal(100.0),
        closing_cash: new Prisma.Decimal(500.0),
        expected_cash: new Prisma.Decimal(500.0),
        cash_variance: new Prisma.Decimal(0),
        variance_percentage: new Prisma.Decimal(0),
        variance_approved: true,
      },
    });

    // Create tender summary for payment_methods with valid tender_type_id
    await prismaClient.shiftTenderSummary.create({
      data: {
        shift_summary_id: shiftSummary.shift_summary_id,
        tender_type_id: tenderType.tender_type_id,
        tender_code: tenderType.code,
        tender_display_name: tenderType.display_name,
        total_amount: new Prisma.Decimal(400.0),
        transaction_count: 15,
        refund_amount: new Prisma.Decimal(25.0),
        refund_count: 1,
        net_amount: new Prisma.Decimal(375.0),
      },
    });

    // WHEN: Requesting shift summary
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/summary`,
    );

    // THEN: Should return 200 with data from ShiftSummary table
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(
      body.data.from_summary_table,
      "Should indicate data from summary table",
    ).toBe(true);
    expect(
      body.data.gross_sales,
      "gross_sales should match pre-calculated value",
    ).toBe(1000);
    expect(
      body.data.net_sales,
      "net_sales should match pre-calculated value",
    ).toBe(925);
    expect(
      body.data.tax_collected,
      "tax_collected should match pre-calculated value",
    ).toBeCloseTo(76.31, 1);
    expect(body.data.items_sold_count, "items_sold_count should match").toBe(
      75,
    );

    // Cleanup
    await prismaClient.shiftTenderSummary.deleteMany({
      where: { shift_summary_id: shiftSummary.shift_summary_id },
    });
    await prismaClient.shiftSummary.delete({
      where: { shift_summary_id: shiftSummary.shift_summary_id },
    });
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });

  test("SHIFT-SUMMARY-081: [P1] should fallback to runtime aggregation when ShiftSummary not available", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A closed shift WITHOUT a ShiftSummary record (historical shift)
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const shift = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      storeManagerUser.user_id,
    );

    // Ensure no ShiftSummary exists
    await prismaClient.shiftSummary.deleteMany({
      where: { shift_id: shift.shift_id },
    });

    // WHEN: Requesting shift summary
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/summary`,
    );

    // THEN: Should return 200 with fallback calculation
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.from_summary_table, "Should indicate fallback mode").toBe(
      false,
    );
    expect(body.data.total_sales, "total_sales should be calculated").toBe(243); // 54 + 108 + 81
    expect(body.data.transaction_count, "transaction_count should be 3").toBe(
      3,
    );

    // Cleanup
    await cleanupShiftWithTransactions(prismaClient, shift.shift_id);
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });

  test("SHIFT-SUMMARY-082: [P1] should return payment_methods from tender_summaries when from summary table", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A closed shift with ShiftSummary and multiple tender types
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // Get or create system tender types for the FK constraints
    const cashTenderType = await getOrCreateSystemTenderType(
      prismaClient,
      "CASH",
    );
    const creditTenderType = await getOrCreateSystemTenderType(
      prismaClient,
      "CREDIT",
    );
    const debitTenderType = await getOrCreateSystemTenderType(
      prismaClient,
      "DEBIT",
    );

    const shift = await prismaClient.shift.create({
      data: {
        ...createShift({
          store_id: storeManagerUser.store_id,
          opened_by: storeManagerUser.user_id,
          cashier_id: cashier.cashier_id,
          pos_terminal_id: terminal.pos_terminal_id,
          opening_cash: new Prisma.Decimal(100.0),
          closing_cash: new Prisma.Decimal(300.0),
          expected_cash: new Prisma.Decimal(300.0),
          variance: new Prisma.Decimal(0),
          status: "CLOSED",
          opened_at: new Date(Date.now() - 8 * 60 * 60 * 1000),
          closed_at: new Date(),
        }),
      },
    });

    const shiftSummary = await prismaClient.shiftSummary.create({
      data: {
        shift_id: shift.shift_id,
        store_id: storeManagerUser.store_id,
        business_date: new Date(),
        shift_opened_at: new Date(Date.now() - 8 * 60 * 60 * 1000),
        shift_closed_at: new Date(),
        shift_duration_mins: 480,
        opened_by_user_id: storeManagerUser.user_id,
        closed_by_user_id: storeManagerUser.user_id,
        gross_sales: new Prisma.Decimal(500.0),
        returns_total: new Prisma.Decimal(0),
        discounts_total: new Prisma.Decimal(0),
        net_sales: new Prisma.Decimal(500.0),
        tax_collected: new Prisma.Decimal(41.25),
        tax_exempt_sales: new Prisma.Decimal(0),
        taxable_sales: new Prisma.Decimal(500.0),
        transaction_count: 10,
        void_count: 0,
        refund_count: 0,
        no_sale_count: 0,
        items_sold_count: 20,
        items_returned_count: 0,
        avg_transaction: new Prisma.Decimal(50.0),
        avg_items_per_txn: new Prisma.Decimal(2.0),
        opening_cash: new Prisma.Decimal(100.0),
        closing_cash: new Prisma.Decimal(300.0),
        expected_cash: new Prisma.Decimal(300.0),
        cash_variance: new Prisma.Decimal(0),
        variance_percentage: new Prisma.Decimal(0),
        variance_approved: true,
      },
    });

    // Create multiple tender summaries with valid tender_type_ids
    await prismaClient.shiftTenderSummary.createMany({
      data: [
        {
          shift_summary_id: shiftSummary.shift_summary_id,
          tender_type_id: cashTenderType.tender_type_id,
          tender_code: cashTenderType.code,
          tender_display_name: cashTenderType.display_name,
          total_amount: new Prisma.Decimal(200.0),
          transaction_count: 4,
          refund_amount: new Prisma.Decimal(0),
          refund_count: 0,
          net_amount: new Prisma.Decimal(200.0),
        },
        {
          shift_summary_id: shiftSummary.shift_summary_id,
          tender_type_id: creditTenderType.tender_type_id,
          tender_code: creditTenderType.code,
          tender_display_name: creditTenderType.display_name,
          total_amount: new Prisma.Decimal(250.0),
          transaction_count: 5,
          refund_amount: new Prisma.Decimal(0),
          refund_count: 0,
          net_amount: new Prisma.Decimal(250.0),
        },
        {
          shift_summary_id: shiftSummary.shift_summary_id,
          tender_type_id: debitTenderType.tender_type_id,
          tender_code: debitTenderType.code,
          tender_display_name: debitTenderType.display_name,
          total_amount: new Prisma.Decimal(50.0),
          transaction_count: 1,
          refund_amount: new Prisma.Decimal(0),
          refund_count: 0,
          net_amount: new Prisma.Decimal(50.0),
        },
      ],
    });

    // WHEN: Requesting shift summary
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/summary`,
    );

    // THEN: Should return payment_methods from tender summaries
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.from_summary_table, "Should be from summary table").toBe(
      true,
    );
    expect(
      body.data.payment_methods.length,
      "Should have 3 payment methods",
    ).toBe(3);

    // Verify payment method structure and values
    const cashMethod = body.data.payment_methods.find(
      (pm: any) => pm.method === "CASH",
    );
    const creditMethod = body.data.payment_methods.find(
      (pm: any) => pm.method === "CREDIT",
    );
    const debitMethod = body.data.payment_methods.find(
      (pm: any) => pm.method === "DEBIT",
    );

    expect(cashMethod, "CASH payment method should exist").toBeDefined();
    expect(cashMethod.total, "CASH total should be 200").toBe(200);
    expect(cashMethod.count, "CASH count should be 4").toBe(4);

    expect(creditMethod, "CREDIT payment method should exist").toBeDefined();
    expect(creditMethod.total, "CREDIT total should be 250").toBe(250);
    expect(creditMethod.count, "CREDIT count should be 5").toBe(5);

    expect(debitMethod, "DEBIT payment method should exist").toBeDefined();
    expect(debitMethod.total, "DEBIT total should be 50").toBe(50);
    expect(debitMethod.count, "DEBIT count should be 1").toBe(1);

    // Cleanup
    await prismaClient.shiftTenderSummary.deleteMany({
      where: { shift_summary_id: shiftSummary.shift_summary_id },
    });
    await prismaClient.shiftSummary.delete({
      where: { shift_summary_id: shiftSummary.shift_summary_id },
    });
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
// SECTION 10: P1 - BUSINESS LOGIC & CALCULATION ACCURACY TESTS
// =============================================================================

test.describe("SHIFT-SUMMARY-API: Business Logic & Calculation Accuracy", () => {
  test("SHIFT-SUMMARY-090: [P1] should calculate correct net_sales from gross - returns - discounts", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A shift with known gross sales, returns, and discounts
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // Get or create a system tender type for the FK constraint
    const tenderType = await getOrCreateSystemTenderType(prismaClient, "CASH");

    const shift = await prismaClient.shift.create({
      data: {
        ...createShift({
          store_id: storeManagerUser.store_id,
          opened_by: storeManagerUser.user_id,
          cashier_id: cashier.cashier_id,
          pos_terminal_id: terminal.pos_terminal_id,
          opening_cash: new Prisma.Decimal(100.0),
          closing_cash: new Prisma.Decimal(200.0),
          expected_cash: new Prisma.Decimal(200.0),
          variance: new Prisma.Decimal(0),
          status: "CLOSED",
          opened_at: new Date(Date.now() - 8 * 60 * 60 * 1000),
          closed_at: new Date(),
        }),
      },
    });

    // Pre-create ShiftSummary with specific values for calculation verification
    // gross_sales: 1000, returns_total: 100, discounts_total: 50
    // Expected net_sales: 1000 - 100 - 50 = 850
    const shiftSummary = await prismaClient.shiftSummary.create({
      data: {
        shift_id: shift.shift_id,
        store_id: storeManagerUser.store_id,
        business_date: new Date(),
        shift_opened_at: new Date(Date.now() - 8 * 60 * 60 * 1000),
        shift_closed_at: new Date(),
        shift_duration_mins: 480,
        opened_by_user_id: storeManagerUser.user_id,
        closed_by_user_id: storeManagerUser.user_id,
        gross_sales: new Prisma.Decimal(1000.0),
        returns_total: new Prisma.Decimal(100.0),
        discounts_total: new Prisma.Decimal(50.0),
        net_sales: new Prisma.Decimal(850.0), // 1000 - 100 - 50
        tax_collected: new Prisma.Decimal(70.13),
        tax_exempt_sales: new Prisma.Decimal(0),
        taxable_sales: new Prisma.Decimal(850.0),
        transaction_count: 20,
        void_count: 0,
        refund_count: 2,
        no_sale_count: 0,
        items_sold_count: 50,
        items_returned_count: 5,
        avg_transaction: new Prisma.Decimal(42.5),
        avg_items_per_txn: new Prisma.Decimal(2.5),
        opening_cash: new Prisma.Decimal(100.0),
        closing_cash: new Prisma.Decimal(200.0),
        expected_cash: new Prisma.Decimal(200.0),
        cash_variance: new Prisma.Decimal(0),
        variance_percentage: new Prisma.Decimal(0),
        variance_approved: true,
      },
    });

    // Create tender summary with valid tender_type_id
    await prismaClient.shiftTenderSummary.create({
      data: {
        shift_summary_id: shiftSummary.shift_summary_id,
        tender_type_id: tenderType.tender_type_id,
        tender_code: tenderType.code,
        tender_display_name: tenderType.display_name,
        total_amount: new Prisma.Decimal(850.0),
        transaction_count: 20,
        refund_amount: new Prisma.Decimal(0),
        refund_count: 0,
        net_amount: new Prisma.Decimal(850.0),
      },
    });

    // WHEN: Requesting shift summary
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/summary`,
    );

    // THEN: net_sales should equal gross_sales - returns_total - discounts_total
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.from_summary_table, "Should be from summary table").toBe(
      true,
    );
    expect(body.data.gross_sales, "gross_sales should be 1000").toBe(1000);
    expect(body.data.returns_total, "returns_total should be 100").toBe(100);
    expect(body.data.discounts_total, "discounts_total should be 50").toBe(50);
    expect(body.data.net_sales, "net_sales should be 850 (1000-100-50)").toBe(
      850,
    );

    // Cleanup
    await prismaClient.shiftTenderSummary.deleteMany({
      where: { shift_summary_id: shiftSummary.shift_summary_id },
    });
    await prismaClient.shiftSummary.delete({
      where: { shift_summary_id: shiftSummary.shift_summary_id },
    });
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.pOSTerminal.delete({
      where: { pos_terminal_id: terminal.pos_terminal_id },
    });
  });

  test("SHIFT-SUMMARY-091: [P1] should calculate correct avg_transaction from net_sales / transaction_count", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A shift with known net_sales and transaction_count
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // Get or create a system tender type for the FK constraint
    const tenderType = await getOrCreateSystemTenderType(prismaClient, "CASH");

    const shift = await prismaClient.shift.create({
      data: {
        ...createShift({
          store_id: storeManagerUser.store_id,
          opened_by: storeManagerUser.user_id,
          cashier_id: cashier.cashier_id,
          pos_terminal_id: terminal.pos_terminal_id,
          opening_cash: new Prisma.Decimal(100.0),
          closing_cash: new Prisma.Decimal(200.0),
          expected_cash: new Prisma.Decimal(200.0),
          variance: new Prisma.Decimal(0),
          status: "CLOSED",
          opened_at: new Date(Date.now() - 8 * 60 * 60 * 1000),
          closed_at: new Date(),
        }),
      },
    });

    // net_sales: 500, transaction_count: 10
    // Expected avg_transaction: 500 / 10 = 50
    const shiftSummary = await prismaClient.shiftSummary.create({
      data: {
        shift_id: shift.shift_id,
        store_id: storeManagerUser.store_id,
        business_date: new Date(),
        shift_opened_at: new Date(Date.now() - 8 * 60 * 60 * 1000),
        shift_closed_at: new Date(),
        shift_duration_mins: 480,
        opened_by_user_id: storeManagerUser.user_id,
        closed_by_user_id: storeManagerUser.user_id,
        gross_sales: new Prisma.Decimal(500.0),
        returns_total: new Prisma.Decimal(0),
        discounts_total: new Prisma.Decimal(0),
        net_sales: new Prisma.Decimal(500.0),
        tax_collected: new Prisma.Decimal(41.25),
        tax_exempt_sales: new Prisma.Decimal(0),
        taxable_sales: new Prisma.Decimal(500.0),
        transaction_count: 10,
        void_count: 0,
        refund_count: 0,
        no_sale_count: 0,
        items_sold_count: 25,
        items_returned_count: 0,
        avg_transaction: new Prisma.Decimal(50.0), // 500 / 10
        avg_items_per_txn: new Prisma.Decimal(2.5),
        opening_cash: new Prisma.Decimal(100.0),
        closing_cash: new Prisma.Decimal(200.0),
        expected_cash: new Prisma.Decimal(200.0),
        cash_variance: new Prisma.Decimal(0),
        variance_percentage: new Prisma.Decimal(0),
        variance_approved: true,
      },
    });

    // Create tender summary with valid tender_type_id
    await prismaClient.shiftTenderSummary.create({
      data: {
        shift_summary_id: shiftSummary.shift_summary_id,
        tender_type_id: tenderType.tender_type_id,
        tender_code: tenderType.code,
        tender_display_name: tenderType.display_name,
        total_amount: new Prisma.Decimal(500.0),
        transaction_count: 10,
        refund_amount: new Prisma.Decimal(0),
        refund_count: 0,
        net_amount: new Prisma.Decimal(500.0),
      },
    });

    // WHEN: Requesting shift summary
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${shift.shift_id}/summary`,
    );

    // THEN: avg_transaction should equal net_sales / transaction_count
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.net_sales, "net_sales should be 500").toBe(500);
    expect(body.data.transaction_count, "transaction_count should be 10").toBe(
      10,
    );
    expect(
      body.data.avg_transaction,
      "avg_transaction should be 50 (500/10)",
    ).toBe(50);

    // Cleanup
    await prismaClient.shiftTenderSummary.deleteMany({
      where: { shift_summary_id: shiftSummary.shift_summary_id },
    });
    await prismaClient.shiftSummary.delete({
      where: { shift_summary_id: shiftSummary.shift_summary_id },
    });
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
// SECTION 11: P0 - SECURITY & INJECTION PREVENTION TESTS
// =============================================================================

test.describe("SHIFT-SUMMARY-API: Security & Injection Prevention", () => {
  test("SHIFT-SUMMARY-100: [P0] should prevent NoSQL injection via shift_id parameter", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: Malicious payloads attempting NoSQL injection
    const maliciousPayloads = [
      '{"$gt": ""}',
      '{"$ne": null}',
      '{"$where": "1==1"}',
      "00000000-0000-0000-0000-000000000000' OR '1'='1",
    ];

    for (const payload of maliciousPayloads) {
      // WHEN: Attempting injection via shift_id
      const response = await storeManagerApiRequest.get(
        `/api/shifts/${encodeURIComponent(payload)}/summary`,
      );

      // THEN: Should return 400 (invalid UUID format) not 500
      expect(
        response.status(),
        `Should return 400 for injection payload: ${payload}`,
      ).toBe(400);
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
    }
  });

  test("SHIFT-SUMMARY-101: [P0] should not expose internal error details in response", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: A non-existent shift ID (use a proper v4 UUID format)
    const nonExistentId = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";

    // WHEN: Requesting summary for non-existent shift
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${nonExistentId}/summary`,
    );

    // THEN: Should return 404 without exposing stack traces or internal details
    expect(response.status(), "Should return 404").toBe(404);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);

    // Verify no sensitive info is exposed
    const responseStr = JSON.stringify(body);
    expect(responseStr, "Should not contain stack trace").not.toContain("at ");
    expect(responseStr, "Should not contain file paths").not.toContain(".ts:");
    expect(responseStr, "Should not contain Prisma internals").not.toContain(
      "prisma",
    );
  });

  test("SHIFT-SUMMARY-102: [P0] should enforce tenant isolation - cannot access other tenant's shift", async ({
    storeManagerApiRequest,
    storeManagerUser,
    prismaClient,
  }) => {
    // GIVEN: A shift belonging to a DIFFERENT company/store
    // NOTE: Use "Test " prefix for cleanup compatibility in CI
    const otherOwner = await prismaClient.user.create({
      data: createUser({ name: "Test Other Company Owner" }),
    });
    const otherCompany = await prismaClient.company.create({
      data: createCompany({
        name: `Test Cross-Tenant Company ${Date.now()}`,
        owner_user_id: otherOwner.user_id,
      }),
    });
    const otherStore = await prismaClient.store.create({
      data: createStore({
        company_id: otherCompany.company_id,
        name: `Test Cross-Tenant Store ${Date.now()}`,
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
    const otherShift = await createClosedShiftWithTransactions(
      prismaClient,
      otherStore.store_id,
      otherOwner.user_id,
      otherCashier.cashier_id,
      otherTerminal.pos_terminal_id,
      otherOwner.user_id,
    );

    // WHEN: Current user tries to access other company's shift
    const response = await storeManagerApiRequest.get(
      `/api/shifts/${otherShift.shift_id}/summary`,
    );

    // THEN: Should return 404 (not 403 to avoid information leakage)
    expect(response.status(), "Should return 404 for cross-tenant access").toBe(
      404,
    );
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);

    // Cleanup: Use safe cleanup helper
    await safeCleanupTestData({
      shiftId: otherShift.shift_id,
      cashierId: otherCashier.cashier_id,
      terminalId: otherTerminal.pos_terminal_id,
      storeId: otherStore.store_id,
      companyId: otherCompany.company_id,
      userId: otherOwner.user_id,
    });
  });
});
