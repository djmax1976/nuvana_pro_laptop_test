/**
 * @test-level API
 * @justification API integration tests for transaction query endpoints - validates HTTP contracts, RLS policies, and query logic
 * @story 3-4-transaction-query-api
 * @enhanced-by workflow-9 on 2025-11-28
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createTransaction,
  createTransactionLineItem,
  createTransactionPayment,
} from "../support/factories/transaction.factory";
import {
  createStore,
  createCompany,
  createClientUser,
  createUser,
  createCashier,
} from "../support/factories";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";

/**
 * Helper function to create a company with an owner
 * Creates an owner user first, then creates the company with that owner
 */
async function createCompanyWithOwner(
  prismaClient: PrismaClient,
  overrides: Record<string, unknown> = {},
) {
  const owner = await prismaClient.user.create({
    data: createUser({ name: "Company Owner" }),
  });
  const company = await prismaClient.company.create({
    data: createCompany({ owner_user_id: owner.user_id, ...overrides }),
  });
  return { owner, company };
}

/**
 * Helper function to create a test cashier
 * Creates a cashier entity with proper cashier_id
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
 * Transaction Query API Tests - Story 3.4
 *
 * STORY: As a user, I want to query transactions by store, shift, or date range,
 * so that I can view transaction history and details.
 *
 * TEST LEVEL: API (endpoint integration tests)
 * PRIMARY GOAL: Verify GET /api/transactions and GET /api/stores/:storeId/transactions endpoints
 *
 * BUSINESS RULES TESTED:
 * - Query transactions by store_id with pagination
 * - Query transactions by shift_id
 * - Query transactions by date range (from, to)
 * - Include line items and payments in response
 * - Combine multiple filters (AND logic)
 * - RLS policy enforcement (users only see accessible stores)
 * - Query performance (response time < 500ms p95)
 *
 * ACCEPTANCE CRITERIA COVERAGE:
 * - AC #1: Query by store_id with pagination and RLS
 * - AC #2: Query by shift_id with transaction details
 * - AC #3: Query by date range with validation and ordering
 * - AC #4: Include line items in response
 * - AC #5: Include payments in response
 * - AC #6: Combine filters (AND logic)
 * - AC #7: Query performance optimization
 */

// =============================================================================
// SECTION 1: P0 CRITICAL - QUERY BY STORE_ID (AC #1)
// =============================================================================

test.describe("3.4-API: Transaction Query by Store ID", () => {
  test("3.4-API-001: [P0] GET /api/transactions?store_id={uuid} - should return paginated list of transactions", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store exists with transactions
    const { owner, company } = await createCompanyWithOwner(prismaClient);
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: owner.user_id,
        cashier_id: cashier.cashier_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });

    // Create 5 transactions for the store
    const transactions = [];
    for (let i = 0; i < 5; i++) {
      const transaction = await prismaClient.transaction.create({
        data: createTransaction({
          store_id: store.store_id,
          shift_id: shift.shift_id,
          cashier_id: cashier.cashier_id,
        }),
      });
      transactions.push(transaction);
    }

    // WHEN: Querying transactions by store_id
    const response = await superadminApiRequest.get(
      `/api/transactions?store_id=${store.store_id}`,
    );

    // THEN: Should return paginated list of transactions
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data, "Response should have data object").toBeDefined();
    expect(
      body.data.transactions,
      "Should have transactions array",
    ).toBeDefined();
    expect(
      Array.isArray(body.data.transactions),
      "Transactions should be array",
    ).toBe(true);
    expect(body.data.meta, "Should have pagination meta").toBeDefined();
    expect(body.data.meta.total, "Should have total count").toBeGreaterThan(0);
    expect(body.data.meta.limit, "Should have default limit of 50").toBe(50);

    // Cleanup
    await prismaClient.transaction.deleteMany({
      where: { store_id: store.store_id },
    });
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.store.delete({ where: { store_id: store.store_id } });
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
    await prismaClient.user.delete({ where: { user_id: owner.user_id } });
  });

  test("3.4-API-002: [P0] GET /api/transactions?store_id={uuid} - should filter by RLS policies", async ({
    corporateAdminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Corporate Admin has access to Company A stores only
    // AND: Transactions exist in Company A and Company B stores
    const { owner: ownerA, company: companyA } =
      await createCompanyWithOwner(prismaClient);
    const { owner: ownerB, company: companyB } =
      await createCompanyWithOwner(prismaClient);
    const storeA = await prismaClient.store.create({
      data: createStore({ company_id: companyA.company_id }),
    });
    const storeB = await prismaClient.store.create({
      data: createStore({ company_id: companyB.company_id }),
    });
    const cashierA = await createTestCashier(
      prismaClient,
      storeA.store_id,
      ownerA.user_id,
    );
    const cashierB = await createTestCashier(
      prismaClient,
      storeB.store_id,
      ownerB.user_id,
    );
    const shiftA = await prismaClient.shift.create({
      data: {
        store_id: storeA.store_id,
        opened_by: ownerA.user_id,
        cashier_id: cashierA.cashier_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });
    const shiftB = await prismaClient.shift.create({
      data: {
        store_id: storeB.store_id,
        opened_by: ownerB.user_id,
        cashier_id: cashierB.cashier_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });

    // Create transactions in both stores
    await prismaClient.transaction.create({
      data: createTransaction({
        store_id: storeA.store_id,
        shift_id: shiftA.shift_id,
        cashier_id: cashierA.cashier_id,
      }),
    });
    await prismaClient.transaction.create({
      data: createTransaction({
        store_id: storeB.store_id,
        shift_id: shiftB.shift_id,
        cashier_id: cashierB.cashier_id,
      }),
    });

    // WHEN: Corporate Admin queries transactions
    const response = await corporateAdminApiRequest.get("/api/transactions");

    // THEN: Should only see transactions for Company A stores (RLS filtered)
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(
      body.data.transactions,
      "Should have transactions array",
    ).toBeDefined();
    // RLS should filter to only show Company A transactions
    const allFromCompanyA = body.data.transactions.every(
      (tx: any) => tx.store_id === storeA.store_id,
    );
    expect(
      allFromCompanyA,
      "Should only see transactions from accessible stores",
    ).toBe(true);

    // Cleanup
    await prismaClient.transaction.deleteMany({
      where: { store_id: { in: [storeA.store_id, storeB.store_id] } },
    });
    await prismaClient.shift.deleteMany({
      where: { shift_id: { in: [shiftA.shift_id, shiftB.shift_id] } },
    });
    await prismaClient.cashier.deleteMany({
      where: {
        cashier_id: { in: [cashierA.cashier_id, cashierB.cashier_id] },
      },
    });
    await prismaClient.store.deleteMany({
      where: { store_id: { in: [storeA.store_id, storeB.store_id] } },
    });
    await prismaClient.company.deleteMany({
      where: { company_id: { in: [companyA.company_id, companyB.company_id] } },
    });
    await prismaClient.user.delete({ where: { user_id: ownerA.user_id } });
    await prismaClient.user.delete({ where: { user_id: ownerB.user_id } });
  });

  test("3.4-API-003: [P1] GET /api/transactions - should use default pagination of 50 per page", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: More than 50 transactions exist
    const { owner, company } = await createCompanyWithOwner(prismaClient);
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: owner.user_id,
        cashier_id: cashier.cashier_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });

    // Create 60 transactions
    for (let i = 0; i < 60; i++) {
      await prismaClient.transaction.create({
        data: createTransaction({
          store_id: store.store_id,
          shift_id: shift.shift_id,
          cashier_id: cashier.cashier_id,
        }),
      });
    }

    // WHEN: Querying without limit parameter
    const response = await superadminApiRequest.get(
      `/api/transactions?store_id=${store.store_id}`,
    );

    // THEN: Should return default limit of 50
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.data.meta.limit, "Should have default limit of 50").toBe(50);
    expect(body.data.transactions.length, "Should return 50 transactions").toBe(
      50,
    );
    expect(
      body.data.meta.has_more,
      "Should indicate more results available",
    ).toBe(true);

    // Cleanup
    await prismaClient.transaction.deleteMany({
      where: { store_id: store.store_id },
    });
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.store.delete({ where: { store_id: store.store_id } });
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.user.delete({ where: { user_id: owner.user_id } });
  });

  test("3.4-API-004: [P1] GET /api/transactions - should support custom limit and offset", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: 20 transactions exist
    const { owner, company } = await createCompanyWithOwner(prismaClient);
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: owner.user_id,
        cashier_id: cashier.cashier_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });

    // Create 20 transactions
    for (let i = 0; i < 20; i++) {
      await prismaClient.transaction.create({
        data: createTransaction({
          store_id: store.store_id,
          shift_id: shift.shift_id,
          cashier_id: cashier.cashier_id,
        }),
      });
    }

    // WHEN: Querying with limit=10 and offset=5
    const response = await superadminApiRequest.get(
      `/api/transactions?store_id=${store.store_id}&limit=10&offset=5`,
    );

    // THEN: Should return 10 transactions starting from offset 5
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.data.meta.limit, "Should respect limit parameter").toBe(10);
    expect(body.data.meta.offset, "Should respect offset parameter").toBe(5);
    expect(body.data.transactions.length, "Should return 10 transactions").toBe(
      10,
    );

    // Cleanup
    await prismaClient.transaction.deleteMany({
      where: { store_id: store.store_id },
    });
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.store.delete({ where: { store_id: store.store_id } });
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.user.delete({ where: { user_id: owner.user_id } });
  });
});

// =============================================================================
// SECTION 2: P0 CRITICAL - QUERY BY SHIFT_ID (AC #2)
// =============================================================================

test.describe("3.4-API: Transaction Query by Shift ID", () => {
  test("3.4-API-005: [P0] GET /api/transactions?shift_id={uuid} - should return all transactions for shift", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A shift exists with 3 transactions
    const { owner, company } = await createCompanyWithOwner(prismaClient);
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: owner.user_id,
        cashier_id: cashier.cashier_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });

    // Create 3 transactions for the shift
    const transactions = [];
    for (let i = 0; i < 3; i++) {
      const transaction = await prismaClient.transaction.create({
        data: createTransaction({
          store_id: store.store_id,
          shift_id: shift.shift_id,
          cashier_id: cashier.cashier_id,
        }),
      });
      transactions.push(transaction);
    }

    // WHEN: Querying transactions by shift_id
    const response = await superadminApiRequest.get(
      `/api/transactions?shift_id=${shift.shift_id}`,
    );

    // THEN: Should return all transactions for that shift
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(
      body.data.transactions.length,
      "Should return all 3 transactions",
    ).toBe(3);
    // Verify all transactions belong to the shift
    const allFromShift = body.data.transactions.every(
      (tx: any) => tx.shift_id === shift.shift_id,
    );
    expect(allFromShift, "All transactions should belong to the shift").toBe(
      true,
    );

    // Cleanup
    await prismaClient.transaction.deleteMany({
      where: { shift_id: shift.shift_id },
    });
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.store.delete({ where: { store_id: store.store_id } });
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.user.delete({ where: { user_id: owner.user_id } });
  });

  test("3.4-API-006: [P0] GET /api/transactions?shift_id={uuid} - should include transaction details", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A transaction exists with known details
    const { owner, company } = await createCompanyWithOwner(prismaClient);
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: owner.user_id,
        cashier_id: cashier.cashier_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });
    const transaction = await prismaClient.transaction.create({
      data: createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: cashier.cashier_id,
        total: 100.0,
      }),
    });

    // WHEN: Querying transactions by shift_id
    const response = await superadminApiRequest.get(
      `/api/transactions?shift_id=${shift.shift_id}`,
    );

    // THEN: Should include transaction details (transaction_id, timestamp, total, cashier)
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    const tx = body.data.transactions[0];
    expect(tx.transaction_id, "Should include transaction_id").toBeDefined();
    expect(tx.timestamp, "Should include timestamp").toBeDefined();
    expect(tx.total, "Should include total").toBe(100.0);
    expect(tx.cashier_id, "Should include cashier_id").toBe(cashier.cashier_id);

    // Cleanup
    await prismaClient.transaction.delete({
      where: { transaction_id: transaction.transaction_id },
    });
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.store.delete({ where: { store_id: store.store_id } });
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.user.delete({ where: { user_id: owner.user_id } });
  });

  test("3.4-API-007: [P0] GET /api/transactions?shift_id={uuid} - should enforce RLS policies", async ({
    storeManagerApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store Manager has access to Store A only
    // AND: Transactions exist in Store A and Store B shifts
    const { owner, company } = await createCompanyWithOwner(prismaClient);
    const storeA = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const storeB = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const cashierA = await createTestCashier(
      prismaClient,
      storeA.store_id,
      owner.user_id,
    );
    const cashierB = await createTestCashier(
      prismaClient,
      storeB.store_id,
      owner.user_id,
    );
    const shiftA = await prismaClient.shift.create({
      data: {
        store_id: storeA.store_id,
        opened_by: owner.user_id,
        cashier_id: cashierA.cashier_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });
    const shiftB = await prismaClient.shift.create({
      data: {
        store_id: storeB.store_id,
        opened_by: owner.user_id,
        cashier_id: cashierB.cashier_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });

    // Create transactions in both shifts
    await prismaClient.transaction.create({
      data: createTransaction({
        store_id: storeA.store_id,
        shift_id: shiftA.shift_id,
        cashier_id: cashierA.cashier_id,
      }),
    });
    await prismaClient.transaction.create({
      data: createTransaction({
        store_id: storeB.store_id,
        shift_id: shiftB.shift_id,
        cashier_id: cashierB.cashier_id,
      }),
    });

    // WHEN: Store Manager queries transactions by shift_id (Store B shift)
    const response = await storeManagerApiRequest.get(
      `/api/transactions?shift_id=${shiftB.shift_id}`,
    );

    // THEN: Should return 200 with empty results (RLS filters out unauthorized data silently)
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(
      body.data.transactions,
      "Should have transactions array",
    ).toBeDefined();
    expect(
      body.data.transactions.length,
      "Should return 0 transactions (RLS filtered)",
    ).toBe(0);
    expect(body.data.meta.total, "Total should be 0").toBe(0);

    // Cleanup
    await prismaClient.transaction.deleteMany({
      where: { shift_id: { in: [shiftA.shift_id, shiftB.shift_id] } },
    });
    await prismaClient.shift.deleteMany({
      where: { shift_id: { in: [shiftA.shift_id, shiftB.shift_id] } },
    });
    await prismaClient.cashier.deleteMany({
      where: {
        cashier_id: { in: [cashierA.cashier_id, cashierB.cashier_id] },
      },
    });
    await prismaClient.store.deleteMany({
      where: { store_id: { in: [storeA.store_id, storeB.store_id] } },
    });
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
    await prismaClient.user.delete({ where: { user_id: owner.user_id } });
  });
});

// =============================================================================
// SECTION 3: P0 CRITICAL - QUERY BY DATE RANGE (AC #3)
// =============================================================================

test.describe("3.4-API: Transaction Query by Date Range", () => {
  test("3.4-API-008: [P0] GET /api/transactions?from={date}&to={date} - should return transactions within date range", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Transactions exist at different timestamps
    const { owner, company } = await createCompanyWithOwner(prismaClient);
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: owner.user_id,
        cashier_id: cashier.cashier_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Create transaction yesterday
    await prismaClient.transaction.create({
      data: createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: cashier.cashier_id,
        timestamp: yesterday,
      }),
    });

    // Create transaction today
    await prismaClient.transaction.create({
      data: createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: cashier.cashier_id,
        timestamp: now,
      }),
    });

    // Create transaction tomorrow
    await prismaClient.transaction.create({
      data: createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: cashier.cashier_id,
        timestamp: tomorrow,
      }),
    });

    // WHEN: Querying transactions from yesterday to today
    const from = yesterday.toISOString();
    const to = now.toISOString();
    const response = await superadminApiRequest.get(
      `/api/transactions?store_id=${store.store_id}&from=${from}&to=${to}`,
    );

    // THEN: Should return only transactions within date range
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.data.transactions.length, "Should return 2 transactions").toBe(
      2,
    );
    // Verify all transactions are within range
    const allInRange = body.data.transactions.every((tx: any) => {
      const txDate = new Date(tx.timestamp);
      return txDate >= yesterday && txDate <= now;
    });
    expect(allInRange, "All transactions should be within date range").toBe(
      true,
    );

    // Cleanup
    await prismaClient.transaction.deleteMany({
      where: { store_id: store.store_id },
    });
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.store.delete({ where: { store_id: store.store_id } });
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.user.delete({ where: { user_id: owner.user_id } });
  });

  test("3.4-API-009: [P0] GET /api/transactions?from={date}&to={date} - should validate date range (from <= to)", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Invalid date range (from > to)
    const from = new Date().toISOString();
    const to = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // Yesterday

    // WHEN: Querying with invalid date range
    const response = await superadminApiRequest.get(
      `/api/transactions?from=${from}&to=${to}`,
    );

    // THEN: Should return 400 Bad Request
    expect(response.status(), "Should return 400 Bad Request").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Should have error code").toBeDefined();
  });

  test("3.4-API-010: [P0] GET /api/transactions?from={date}&to={date} - should reject date range exceeding 90 days", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Date range exceeding 90 days
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 91 * 24 * 60 * 60 * 1000).toISOString(); // 91 days from now

    // WHEN: Querying with date range > 90 days
    const response = await superadminApiRequest.get(
      `/api/transactions?from=${from}&to=${to}`,
    );

    // THEN: Should return 400 Bad Request
    expect(response.status(), "Should return 400 Bad Request").toBe(400);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Should have error code").toBeDefined();
  });

  test("3.4-API-011: [P0] GET /api/transactions?from={date}&to={date} - should order by timestamp descending", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Transactions exist at different timestamps
    const { owner, company } = await createCompanyWithOwner(prismaClient);
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: owner.user_id,
        cashier_id: cashier.cashier_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    // Create transactions at different times
    await prismaClient.transaction.create({
      data: createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: cashier.cashier_id,
        timestamp: twoHoursAgo,
      }),
    });
    await prismaClient.transaction.create({
      data: createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: cashier.cashier_id,
        timestamp: now,
      }),
    });
    await prismaClient.transaction.create({
      data: createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: cashier.cashier_id,
        timestamp: oneHourAgo,
      }),
    });

    // WHEN: Querying transactions
    const response = await superadminApiRequest.get(
      `/api/transactions?store_id=${store.store_id}`,
    );

    // THEN: Should be ordered by timestamp descending (most recent first)
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    const timestamps = body.data.transactions.map((tx: any) =>
      new Date(tx.timestamp).getTime(),
    );
    const isDescending = timestamps.every((ts: number, i: number) => {
      return i === 0 || timestamps[i - 1] >= ts;
    });
    expect(
      isDescending,
      "Transactions should be ordered by timestamp descending",
    ).toBe(true);

    // Cleanup
    await prismaClient.transaction.deleteMany({
      where: { store_id: store.store_id },
    });
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.store.delete({ where: { store_id: store.store_id } });
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.user.delete({ where: { user_id: owner.user_id } });
  });
});

// =============================================================================
// SECTION 4: P1 HIGH - INCLUDE LINE ITEMS (AC #4)
// =============================================================================

test.describe("3.4-API: Transaction Query with Line Items", () => {
  test("3.4-API-012: [P1] GET /api/transactions?include_line_items=true - should include TransactionLineItem records", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A transaction exists with line items
    const { owner, company } = await createCompanyWithOwner(prismaClient);
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: owner.user_id,
        cashier_id: cashier.cashier_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });
    const transaction = await prismaClient.transaction.create({
      data: createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: cashier.cashier_id,
      }),
    });

    // Create 2 line items
    await prismaClient.transactionLineItem.create({
      data: createTransactionLineItem({
        transaction_id: transaction.transaction_id,
        product_id: faker.string.uuid(),
        sku: "SKU-001",
        name: "Test Product",
        quantity: 2,
        unit_price: 10.0,
        line_total: 20.0,
      }),
    });
    await prismaClient.transactionLineItem.create({
      data: createTransactionLineItem({
        transaction_id: transaction.transaction_id,
        product_id: faker.string.uuid(),
        sku: "SKU-002",
        name: "Another Product",
        quantity: 1,
        unit_price: 15.0,
        line_total: 15.0,
      }),
    });

    // WHEN: Querying transactions with include_line_items=true
    const response = await superadminApiRequest.get(
      `/api/transactions?store_id=${store.store_id}&include_line_items=true`,
    );

    // THEN: Should include TransactionLineItem records
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    const tx = body.data.transactions[0];
    expect(tx.line_items, "Should include line_items array").toBeDefined();
    expect(Array.isArray(tx.line_items), "Line items should be array").toBe(
      true,
    );
    expect(tx.line_items.length, "Should have 2 line items").toBe(2);

    // Cleanup
    await prismaClient.transactionLineItem.deleteMany({
      where: { transaction_id: transaction.transaction_id },
    });
    await prismaClient.transaction.delete({
      where: { transaction_id: transaction.transaction_id },
    });
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.store.delete({ where: { store_id: store.store_id } });
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.user.delete({ where: { user_id: owner.user_id } });
  });

  test("3.4-API-013: [P1] GET /api/transactions?include_line_items=true - should include all required line item fields", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A transaction exists with a line item
    const { owner, company } = await createCompanyWithOwner(prismaClient);
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: owner.user_id,
        cashier_id: cashier.cashier_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });
    const transaction = await prismaClient.transaction.create({
      data: createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: cashier.cashier_id,
      }),
    });
    const productId = faker.string.uuid();
    await prismaClient.transactionLineItem.create({
      data: createTransactionLineItem({
        transaction_id: transaction.transaction_id,
        product_id: productId,
        sku: "SKU-001",
        name: "Test Product",
        quantity: 2,
        unit_price: 10.0,
        line_total: 20.0,
      }),
    });

    // WHEN: Querying transactions with include_line_items=true
    const response = await superadminApiRequest.get(
      `/api/transactions?store_id=${store.store_id}&include_line_items=true`,
    );

    // THEN: Should include all required fields (product_id, sku, name, quantity, unit_price, line_total)
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    const lineItem = body.data.transactions[0].line_items[0];
    expect(lineItem.product_id, "Should include product_id").toBe(productId);
    expect(lineItem.sku, "Should include sku").toBe("SKU-001");
    expect(lineItem.name, "Should include name").toBe("Test Product");
    expect(lineItem.quantity, "Should include quantity").toBe(2);
    expect(lineItem.unit_price, "Should include unit_price").toBe(10.0);
    expect(lineItem.line_total, "Should include line_total").toBe(20.0);

    // Cleanup
    await prismaClient.transactionLineItem.deleteMany({
      where: { transaction_id: transaction.transaction_id },
    });
    await prismaClient.transaction.delete({
      where: { transaction_id: transaction.transaction_id },
    });
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.store.delete({ where: { store_id: store.store_id } });
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.user.delete({ where: { user_id: owner.user_id } });
  });
});

// =============================================================================
// SECTION 5: P1 HIGH - INCLUDE PAYMENTS (AC #5)
// =============================================================================

test.describe("3.4-API: Transaction Query with Payments", () => {
  test("3.4-API-014: [P1] GET /api/transactions?include_payments=true - should include TransactionPayment records", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A transaction exists with payments
    const { owner, company } = await createCompanyWithOwner(prismaClient);
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: owner.user_id,
        cashier_id: cashier.cashier_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });
    const transaction = await prismaClient.transaction.create({
      data: createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: cashier.cashier_id,
        total: 100.0,
      }),
    });

    // Create 2 payments
    await prismaClient.transactionPayment.create({
      data: createTransactionPayment({
        transaction_id: transaction.transaction_id,
        method: "CASH",
        amount: 50.0,
      }),
    });
    await prismaClient.transactionPayment.create({
      data: createTransactionPayment({
        transaction_id: transaction.transaction_id,
        method: "CREDIT",
        amount: 50.0,
        reference: "1234",
      }),
    });

    // WHEN: Querying transactions with include_payments=true
    const response = await superadminApiRequest.get(
      `/api/transactions?store_id=${store.store_id}&include_payments=true`,
    );

    // THEN: Should include TransactionPayment records
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    const tx = body.data.transactions[0];
    expect(tx.payments, "Should include payments array").toBeDefined();
    expect(Array.isArray(tx.payments), "Payments should be array").toBe(true);
    expect(tx.payments.length, "Should have 2 payments").toBe(2);

    // Cleanup
    await prismaClient.transactionPayment.deleteMany({
      where: { transaction_id: transaction.transaction_id },
    });
    await prismaClient.transaction.delete({
      where: { transaction_id: transaction.transaction_id },
    });
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.store.delete({ where: { store_id: store.store_id } });
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.user.delete({ where: { user_id: owner.user_id } });
  });

  test("3.4-API-015: [P1] GET /api/transactions?include_payments=true - should include all required payment fields", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A transaction exists with a payment
    const { owner, company } = await createCompanyWithOwner(prismaClient);
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: owner.user_id,
        cashier_id: cashier.cashier_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });
    const transaction = await prismaClient.transaction.create({
      data: createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: cashier.cashier_id,
        total: 100.0,
      }),
    });
    await prismaClient.transactionPayment.create({
      data: createTransactionPayment({
        transaction_id: transaction.transaction_id,
        method: "CREDIT",
        amount: 100.0,
        reference: "1234",
      }),
    });

    // WHEN: Querying transactions with include_payments=true
    const response = await superadminApiRequest.get(
      `/api/transactions?store_id=${store.store_id}&include_payments=true`,
    );

    // THEN: Should include all required fields (method, amount, reference)
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    const payment = body.data.transactions[0].payments[0];
    expect(payment.method, "Should include method").toBe("CREDIT");
    expect(payment.amount, "Should include amount").toBe(100.0);
    expect(payment.reference, "Should include reference").toBe("1234");

    // Cleanup
    await prismaClient.transactionPayment.deleteMany({
      where: { transaction_id: transaction.transaction_id },
    });
    await prismaClient.transaction.delete({
      where: { transaction_id: transaction.transaction_id },
    });
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.store.delete({ where: { store_id: store.store_id } });
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.user.delete({ where: { user_id: owner.user_id } });
  });
});

// =============================================================================
// SECTION 6: P1 HIGH - COMBINE FILTERS (AC #6)
// =============================================================================

test.describe("3.4-API: Transaction Query with Combined Filters", () => {
  test("3.4-API-016: [P1] GET /api/transactions - should apply all filters together (AND logic)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Multiple transactions exist with different attributes
    const { owner, company } = await createCompanyWithOwner(prismaClient);
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );
    const shift1 = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: owner.user_id,
        cashier_id: cashier.cashier_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });
    const shift2 = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: owner.user_id,
        cashier_id: cashier.cashier_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Create transaction matching all filters (store_id, shift_id, date range)
    await prismaClient.transaction.create({
      data: createTransaction({
        store_id: store.store_id,
        shift_id: shift1.shift_id,
        cashier_id: cashier.cashier_id,
        timestamp: now,
      }),
    });

    // Create transaction matching store_id and date range, but filtered out by shift_id (wrong shift, correct date)
    await prismaClient.transaction.create({
      data: createTransaction({
        store_id: store.store_id,
        shift_id: shift2.shift_id,
        cashier_id: cashier.cashier_id,
        timestamp: oneHourAgo,
      }),
    });

    // WHEN: Querying with combined filters (store_id, shift_id, date range)
    const from = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const to = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    const response = await superadminApiRequest.get(
      `/api/transactions?store_id=${store.store_id}&shift_id=${shift1.shift_id}&from=${from}&to=${to}`,
    );

    // THEN: Should return only transactions matching ALL criteria
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.data.transactions.length, "Should return 1 transaction").toBe(
      1,
    );
    const tx = body.data.transactions[0];
    expect(tx.store_id, "Should match store_id").toBe(store.store_id);
    expect(tx.shift_id, "Should match shift_id").toBe(shift1.shift_id);
    const txDate = new Date(tx.timestamp);
    expect(txDate >= new Date(from), "Should be within date range").toBe(true);
    expect(txDate <= new Date(to), "Should be within date range").toBe(true);

    // Cleanup
    await prismaClient.transaction.deleteMany({
      where: { store_id: store.store_id },
    });
    await prismaClient.shift.deleteMany({
      where: { shift_id: { in: [shift1.shift_id, shift2.shift_id] } },
    });
    await prismaClient.store.delete({ where: { store_id: store.store_id } });
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.user.delete({ where: { user_id: owner.user_id } });
  });

  test("3.4-API-017: [P1] GET /api/transactions - should support pagination with combined filters", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: 15 transactions matching combined filters
    const { owner, company } = await createCompanyWithOwner(prismaClient);
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: owner.user_id,
        cashier_id: cashier.cashier_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });

    const now = new Date();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    // Create 15 transactions
    for (let i = 0; i < 15; i++) {
      await prismaClient.transaction.create({
        data: createTransaction({
          store_id: store.store_id,
          shift_id: shift.shift_id,
          cashier_id: cashier.cashier_id,
          timestamp: now,
        }),
      });
    }

    // WHEN: Querying with combined filters and pagination
    const response = await superadminApiRequest.get(
      `/api/transactions?store_id=${store.store_id}&shift_id=${shift.shift_id}&from=${from}&to=${to}&limit=10&offset=5`,
    );

    // THEN: Should return paginated results
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.data.meta.limit, "Should respect limit").toBe(10);
    expect(body.data.meta.offset, "Should respect offset").toBe(5);
    expect(body.data.transactions.length, "Should return 10 transactions").toBe(
      10,
    );
    expect(body.data.meta.total, "Should have total count").toBe(15);

    // Cleanup
    await prismaClient.transaction.deleteMany({
      where: { store_id: store.store_id },
    });
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.store.delete({ where: { store_id: store.store_id } });
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.user.delete({ where: { user_id: owner.user_id } });
  });
});

// =============================================================================
// SECTION 7: P2 MEDIUM - STORE-SPECIFIC ENDPOINT
// =============================================================================

test.describe("3.4-API: Store-Specific Transaction Query", () => {
  test("3.4-API-018: [P1] GET /api/stores/:storeId/transactions - should return transactions for specific store", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store exists with transactions
    const { owner, company } = await createCompanyWithOwner(prismaClient);
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: owner.user_id,
        cashier_id: cashier.cashier_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });

    // Create 3 transactions
    for (let i = 0; i < 3; i++) {
      await prismaClient.transaction.create({
        data: createTransaction({
          store_id: store.store_id,
          shift_id: shift.shift_id,
          cashier_id: cashier.cashier_id,
        }),
      });
    }

    // WHEN: Querying transactions for the store
    const response = await superadminApiRequest.get(
      `/api/stores/${store.store_id}/transactions`,
    );

    // THEN: Should return transactions for that store
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.data.transactions.length, "Should return 3 transactions").toBe(
      3,
    );
    const allFromStore = body.data.transactions.every(
      (tx: any) => tx.store_id === store.store_id,
    );
    expect(allFromStore, "All transactions should belong to the store").toBe(
      true,
    );

    // Cleanup
    await prismaClient.transaction.deleteMany({
      where: { store_id: store.store_id },
    });
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.store.delete({ where: { store_id: store.store_id } });
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.user.delete({ where: { user_id: owner.user_id } });
  });
});

// =============================================================================
// SECTION 8: P0 CRITICAL - AUTHENTICATION & AUTHORIZATION
// =============================================================================

test.describe("3.4-API: Authentication & Authorization", () => {
  test("3.4-API-019: [P0] GET /api/transactions - should require authentication", async ({
    request,
    backendUrl,
  }) => {
    // GIVEN: No authentication token is provided

    // WHEN: Attempting to query transactions
    const response = await request.get(`${backendUrl}/api/transactions`);

    // THEN: Should return 401 Unauthorized
    expect(response.status(), "Should return 401 Unauthorized").toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Should have UNAUTHORIZED error code").toBe(
      "UNAUTHORIZED",
    );
  });

  test("3.4-API-020a: [P0] GET /api/transactions - should grant access with TRANSACTION_READ permission", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: User has TRANSACTION_READ permission (superadmin has all permissions)

    // WHEN: Querying transactions
    const response = await superadminApiRequest.get("/api/transactions");

    // THEN: Should return 200 OK
    expect(response.status(), "Should return 200 OK").toBe(200);

    // Cleanup handled by fixtures
  });

  test("3.4-API-020b: [P0] GET /api/transactions - should deny access without TRANSACTION_READ permission", async ({
    regularUserApiRequest,
  }) => {
    // GIVEN: User does not have TRANSACTION_READ permission (regularUser has only SHIFT_READ and INVENTORY_READ)

    // WHEN: Querying transactions
    const response = await regularUserApiRequest.get("/api/transactions");

    // THEN: Should return 403 Forbidden
    expect(response.status(), "Should return 403 Forbidden").toBe(403);

    // Cleanup handled by fixtures
  });
});

// =============================================================================
// SECTION 9: P2 MEDIUM - QUERY PERFORMANCE (AC #7)
// =============================================================================

test.describe("3.4-API: Query Performance", () => {
  test("3.4-API-021: [P2] GET /api/transactions - should respond within 500ms (p95)", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store with transactions exists
    const { owner, company } = await createCompanyWithOwner(prismaClient);
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: owner.user_id,
        cashier_id: cashier.cashier_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });

    // Create 100 transactions for performance testing
    for (let i = 0; i < 100; i++) {
      await prismaClient.transaction.create({
        data: createTransaction({
          store_id: store.store_id,
          shift_id: shift.shift_id,
          cashier_id: cashier.cashier_id,
        }),
      });
    }

    // WHEN: Querying transactions
    const startTime = Date.now();
    const response = await superadminApiRequest.get(
      `/api/transactions?store_id=${store.store_id}`,
    );
    const endTime = Date.now();
    const responseTime = endTime - startTime;

    // THEN: Should respond within 500ms
    expect(response.status(), "Should return 200 OK").toBe(200);
    expect(responseTime, "Response time should be under 500ms").toBeLessThan(
      500,
    );

    // Cleanup
    await prismaClient.transaction.deleteMany({
      where: { store_id: store.store_id },
    });
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.store.delete({ where: { store_id: store.store_id } });
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.user.delete({ where: { user_id: owner.user_id } });
  });
});

// =============================================================================
// SECTION 10: P0 CRITICAL - SECURITY TESTS (MANDATORY)
// Enhanced by Workflow 9 - These tests are automatically applied
// =============================================================================

test.describe("3.4-API: Security - SQL Injection Prevention", () => {
  test("3.4-API-SEC-001: [P0] GET /api/transactions - should reject SQL injection in store_id", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Malicious SQL injection attempt in store_id
    const maliciousInputs = [
      "'; DROP TABLE transactions; --",
      "1 OR 1=1",
      "1; SELECT * FROM users --",
      "' UNION SELECT * FROM users --",
    ];

    for (const maliciousInput of maliciousInputs) {
      // WHEN: Attempting SQL injection via store_id
      const response = await superadminApiRequest.get(
        `/api/transactions?store_id=${encodeURIComponent(maliciousInput)}`,
      );

      // THEN: Should return 400 Bad Request (invalid UUID format)
      expect(
        response.status(),
        `SQL injection attempt should be rejected: ${maliciousInput}`,
      ).toBe(400);
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
    }
  });

  test("3.4-API-SEC-002: [P0] GET /api/transactions - should reject SQL injection in shift_id", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Malicious SQL injection attempt in shift_id
    const maliciousInputs = [
      "'; DROP TABLE shifts; --",
      "1 OR 1=1",
      "' UNION SELECT password FROM users --",
    ];

    for (const maliciousInput of maliciousInputs) {
      // WHEN: Attempting SQL injection via shift_id
      const response = await superadminApiRequest.get(
        `/api/transactions?shift_id=${encodeURIComponent(maliciousInput)}`,
      );

      // THEN: Should return 400 Bad Request (invalid UUID format)
      expect(
        response.status(),
        `SQL injection attempt should be rejected: ${maliciousInput}`,
      ).toBe(400);
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
    }
  });
});

test.describe("3.4-API: Security - Authentication Bypass Prevention", () => {
  test("3.4-API-SEC-003: [P0] GET /api/transactions - should reject missing Authorization header", async ({
    request,
    backendUrl,
  }) => {
    // GIVEN: No Authorization header

    // WHEN: Attempting to access without auth
    const response = await request.get(`${backendUrl}/api/transactions`);

    // THEN: Should return 401 Unauthorized
    expect(response.status(), "Missing auth should return 401").toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
    expect(body.error.code, "Should have UNAUTHORIZED error code").toBe(
      "UNAUTHORIZED",
    );
  });

  test("3.4-API-SEC-004: [P0] GET /api/transactions - should reject invalid JWT token", async ({
    request,
    backendUrl,
  }) => {
    // GIVEN: Invalid/malformed JWT token
    const invalidTokens = [
      "Bearer invalid-token",
      "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature",
      "NotBearer validtoken",
      "Bearer ",
      "",
    ];

    for (const token of invalidTokens) {
      // WHEN: Attempting to access with invalid token
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = token;
      }

      const response = await request.get(`${backendUrl}/api/transactions`, {
        headers,
      });

      // THEN: Should return 401 Unauthorized
      expect(
        response.status(),
        `Invalid token should be rejected: ${token || "(empty)"}`,
      ).toBe(401);
    }
  });

  test("3.4-API-SEC-005: [P0] GET /api/stores/:storeId/transactions - should reject missing auth", async ({
    request,
    backendUrl,
  }) => {
    // GIVEN: Valid store ID but no auth
    const fakeStoreId = faker.string.uuid();

    // WHEN: Attempting to access store transactions without auth
    const response = await request.get(
      `${backendUrl}/api/stores/${fakeStoreId}/transactions`,
    );

    // THEN: Should return 401 Unauthorized
    expect(response.status(), "Missing auth should return 401").toBe(401);
    const body = await response.json();
    expect(body.success, "Response should indicate failure").toBe(false);
  });
});

test.describe("3.4-API: Security - Authorization & RLS Enforcement", () => {
  test("3.4-API-SEC-006: [P0] GET /api/transactions - should not leak transactions from other companies", async ({
    corporateAdminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Corporate Admin for Company A, transactions exist in Company B
    const { owner: ownerB, company: companyB } =
      await createCompanyWithOwner(prismaClient);
    const storeB = await prismaClient.store.create({
      data: createStore({ company_id: companyB.company_id }),
    });
    const cashier = await createTestCashier(
      prismaClient,
      storeB.store_id,
      ownerB.user_id,
    );
    const shiftB = await prismaClient.shift.create({
      data: {
        store_id: storeB.store_id,
        opened_by: ownerB.user_id,
        cashier_id: cashier.cashier_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });
    const transactionB = await prismaClient.transaction.create({
      data: createTransaction({
        store_id: storeB.store_id,
        shift_id: shiftB.shift_id,
        cashier_id: cashier.cashier_id,
      }),
    });

    // WHEN: Corporate Admin queries all transactions
    const response = await corporateAdminApiRequest.get("/api/transactions");

    // THEN: Should NOT include Company B's transactions (RLS enforcement)
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    const transactionIds = body.data.transactions.map(
      (tx: any) => tx.transaction_id,
    );
    expect(
      transactionIds,
      "Should NOT include other company's transactions",
    ).not.toContain(transactionB.transaction_id);

    // Cleanup
    await prismaClient.transaction.delete({
      where: { transaction_id: transactionB.transaction_id },
    });
    await prismaClient.shift.delete({ where: { shift_id: shiftB.shift_id } });
    await prismaClient.store.delete({ where: { store_id: storeB.store_id } });
    await prismaClient.company.delete({
      where: { company_id: companyB.company_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.user.delete({ where: { user_id: ownerB.user_id } });
  });

  test("3.4-API-SEC-007: [P0] GET /api/transactions - should return empty for inaccessible store_id filter", async ({
    corporateAdminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Corporate Admin tries to filter by another company's store
    const { owner: ownerB, company: companyB } =
      await createCompanyWithOwner(prismaClient);
    const storeB = await prismaClient.store.create({
      data: createStore({ company_id: companyB.company_id }),
    });

    // WHEN: Filtering by inaccessible store_id
    const response = await corporateAdminApiRequest.get(
      `/api/transactions?store_id=${storeB.store_id}`,
    );

    // THEN: Should return 200 with empty results (RLS silently filters)
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.data.transactions.length, "Should return 0 transactions").toBe(
      0,
    );
    expect(body.data.meta.total, "Total should be 0").toBe(0);

    // Cleanup
    await prismaClient.store.delete({ where: { store_id: storeB.store_id } });
    await prismaClient.company.delete({
      where: { company_id: companyB.company_id },
    });
    await prismaClient.user.delete({ where: { user_id: ownerB.user_id } });
  });
});

test.describe("3.4-API: Security - Data Leakage Prevention", () => {
  test("3.4-API-SEC-008: [P0] GET /api/transactions - should not expose internal database fields", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A transaction exists
    const { owner, company } = await createCompanyWithOwner(prismaClient);
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: owner.user_id,
        cashier_id: cashier.cashier_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });
    const transaction = await prismaClient.transaction.create({
      data: createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: cashier.cashier_id,
      }),
    });

    // WHEN: Querying transactions
    const response = await superadminApiRequest.get(
      `/api/transactions?store_id=${store.store_id}`,
    );

    // THEN: Should NOT expose internal/sensitive fields
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    const tx = body.data.transactions[0];

    // Verify no internal database fields are exposed
    expect(tx, "Should not expose created_at directly").not.toHaveProperty(
      "created_at",
    );
    expect(tx, "Should not expose updated_at directly").not.toHaveProperty(
      "updated_at",
    );
    expect(tx, "Should not expose deleted_at").not.toHaveProperty("deleted_at");
    expect(tx, "Should not expose internal _count").not.toHaveProperty(
      "_count",
    );

    // Verify expected fields ARE present
    expect(tx, "Should have transaction_id").toHaveProperty("transaction_id");
    expect(tx, "Should have store_id").toHaveProperty("store_id");
    expect(tx, "Should have total").toHaveProperty("total");

    // Cleanup
    await prismaClient.transaction.delete({
      where: { transaction_id: transaction.transaction_id },
    });
    await prismaClient.shift.delete({ where: { shift_id: shift.shift_id } });
    await prismaClient.store.delete({ where: { store_id: store.store_id } });
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
    await prismaClient.cashier.delete({
      where: { cashier_id: cashier.cashier_id },
    });
    await prismaClient.user.delete({ where: { user_id: owner.user_id } });
  });
});

// =============================================================================
// SECTION 11: P1 HIGH - INPUT VALIDATION EDGE CASES
// Enhanced by Workflow 9 - Edge case tests for input validation
// =============================================================================

test.describe("3.4-API: Input Validation Edge Cases", () => {
  test("3.4-API-EDGE-001: [P1] GET /api/transactions - should reject malformed UUID in store_id", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Malformed UUID values
    const malformedUUIDs = [
      "not-a-uuid",
      "12345",
      "123e4567-e89b-12d3-a456", // incomplete UUID
      "123e4567-e89b-12d3-a456-426614174000-extra", // too long
      "null",
      "undefined",
    ];

    for (const badUuid of malformedUUIDs) {
      // WHEN: Querying with malformed store_id
      const response = await superadminApiRequest.get(
        `/api/transactions?store_id=${badUuid}`,
      );

      // THEN: Should return 400 Bad Request
      expect(
        response.status(),
        `Malformed UUID should be rejected: ${badUuid}`,
      ).toBe(400);
      const body = await response.json();
      expect(body.success, "Response should indicate failure").toBe(false);
    }
  });

  test("3.4-API-EDGE-002: [P1] GET /api/transactions - should reject invalid limit values", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Invalid limit values
    const invalidLimits = [
      { value: "0", description: "zero" },
      { value: "-1", description: "negative" },
      { value: "201", description: "exceeds max (200)" },
      { value: "abc", description: "non-numeric" },
      { value: "10.5", description: "decimal" },
    ];

    for (const { value, description } of invalidLimits) {
      // WHEN: Querying with invalid limit
      const response = await superadminApiRequest.get(
        `/api/transactions?limit=${value}`,
      );

      // THEN: Should return 400 Bad Request
      expect(
        response.status(),
        `Invalid limit (${description}) should be rejected`,
      ).toBe(400);
    }
  });

  test("3.4-API-EDGE-003: [P1] GET /api/transactions - should reject invalid offset values", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Invalid offset values
    const invalidOffsets = [
      { value: "-1", description: "negative" },
      { value: "abc", description: "non-numeric" },
      { value: "-100", description: "large negative" },
    ];

    for (const { value, description } of invalidOffsets) {
      // WHEN: Querying with invalid offset
      const response = await superadminApiRequest.get(
        `/api/transactions?offset=${value}`,
      );

      // THEN: Should return 400 Bad Request
      expect(
        response.status(),
        `Invalid offset (${description}) should be rejected`,
      ).toBe(400);
    }
  });

  test("3.4-API-EDGE-004: [P1] GET /api/transactions - should reject invalid datetime format", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Invalid datetime formats
    const invalidDates = [
      "not-a-date",
      "2024-13-01T00:00:00Z", // invalid month
      "2024-01-32T00:00:00Z", // invalid day
      "01/01/2024", // wrong format
      "2024-01-01", // missing time component
    ];

    for (const invalidDate of invalidDates) {
      // WHEN: Querying with invalid from date
      const response = await superadminApiRequest.get(
        `/api/transactions?from=${encodeURIComponent(invalidDate)}`,
      );

      // THEN: Should return 400 Bad Request
      expect(
        response.status(),
        `Invalid date format should be rejected: ${invalidDate}`,
      ).toBe(400);
    }
  });

  test("3.4-API-EDGE-005: [P1] GET /api/transactions - should handle empty query parameters gracefully", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Empty query parameters

    // WHEN: Querying with no filters
    const response = await superadminApiRequest.get("/api/transactions");

    // THEN: Should return 200 OK with default pagination
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.meta.limit, "Should use default limit of 50").toBe(50);
    expect(body.data.meta.offset, "Should use default offset of 0").toBe(0);
  });

  test("3.4-API-EDGE-006: [P1] GET /api/transactions - should handle non-existent UUID gracefully", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Valid UUID format but non-existent store
    const nonExistentStoreId = faker.string.uuid();

    // WHEN: Querying with non-existent store_id
    const response = await superadminApiRequest.get(
      `/api/transactions?store_id=${nonExistentStoreId}`,
    );

    // THEN: Should return 200 OK with empty results (not 404)
    expect(response.status(), "Should return 200 OK").toBe(200);
    const body = await response.json();
    expect(body.success, "Response should indicate success").toBe(true);
    expect(body.data.transactions.length, "Should return 0 transactions").toBe(
      0,
    );
    expect(body.data.meta.total, "Total should be 0").toBe(0);
  });

  test("3.4-API-EDGE-007: [P1] GET /api/transactions - should validate include_line_items accepts only true/false", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Invalid boolean values for include_line_items
    const invalidBooleans = ["TRUE", "1", "yes", "on"];

    for (const value of invalidBooleans) {
      // WHEN: Querying with invalid boolean value
      const response = await superadminApiRequest.get(
        `/api/transactions?include_line_items=${value}`,
      );

      // THEN: Should return 400 Bad Request (schema only accepts "true" or "false")
      expect(
        response.status(),
        `Invalid boolean value should be rejected: ${value}`,
      ).toBe(400);
    }
  });

  test("3.4-API-EDGE-008: [P1] GET /api/stores/:storeId/transactions - should reject malformed storeId in path", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Malformed store ID in URL path
    const malformedIds = ["not-a-uuid", "12345", "../etc/passwd"];

    for (const badId of malformedIds) {
      // WHEN: Accessing with malformed storeId
      const response = await superadminApiRequest.get(
        `/api/stores/${encodeURIComponent(badId)}/transactions`,
      );

      // THEN: Should return 400 Bad Request
      expect(
        response.status(),
        `Malformed storeId should be rejected: ${badId}`,
      ).toBe(400);
    }
  });
});
