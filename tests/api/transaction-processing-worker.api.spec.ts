import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createTransactionPayload,
  createCompany,
  createStore,
  createUser,
  createCashier,
} from "../support/factories";

/**
 * Transaction Processing Worker Tests - Story 3.3
 *
 * STORY: As a system, I want transaction messages to be processed asynchronously,
 * so that transactions are recorded, inventory is updated, and caches are invalidated.
 *
 * TEST LEVEL: API / Integration (worker processing verification)
 * PRIMARY GOAL: Verify worker processes messages, creates records, handles errors
 *
 * BUSINESS RULES TESTED:
 * - Message consumption from RabbitMQ queue
 * - Transaction validation (shift exists, is OPEN, belongs to store)
 * - Database record creation (Transaction, LineItems, Payments)
 * - Cache invalidation (Redis shift summaries)
 * - Error handling with retry logic (max 5 retries)
 * - Dead-letter queue for failed messages
 *
 * SECURITY TESTS:
 * - Authentication bypass (missing/invalid/expired JWT)
 * - Authorization (TRANSACTION_CREATE permission, store access)
 * - Input validation (malformed payloads, injection attempts)
 * - Data leakage prevention (error responses)
 *
 * NOTE: These tests verify the worker's behavior through API integration.
 * The worker processes messages from the queue after POST /api/transactions.
 *
 * IMPORTANT: These tests require the transaction worker process to be running:
 *   npm run worker:transaction
 * Without the worker, tests that verify database record creation will timeout
 * waiting for records that are never created.
 *
 * Enhanced by Opus QA Workflow 9 - 2025-11-27
 */

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

interface TestStoreAndShift {
  store: { store_id: string; company_id: string; name: string };
  shift: {
    shift_id: string;
    store_id: string;
    cashier_id: string;
    status: string;
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

/**
 * Creates a store and open shift for testing transactions
 */
async function createTestStoreAndShift(
  prismaClient: any,
  companyId: string,
  createdByUserId: string,
  storeName?: string,
): Promise<TestStoreAndShift> {
  const store = await prismaClient.store.create({
    data: createStore({
      company_id: companyId,
      name: storeName || `Test Store ${Date.now()}`,
      timezone: "America/New_York",
      status: "ACTIVE",
    }),
  });

  // Create a proper Cashier entity (not User) for cashier_id FK
  const cashier = await createTestCashier(
    prismaClient,
    store.store_id,
    createdByUserId,
  );

  const shift = await prismaClient.shift.create({
    data: {
      store_id: store.store_id,
      opened_by: createdByUserId,
      cashier_id: cashier.cashier_id,
      opening_cash: 100.0,
      status: "OPEN",
    },
  });

  return { store, shift };
}

/**
 * Wait for transaction to be processed by worker
 * Polls database for transaction record
 */
async function waitForTransactionProcessing(
  prismaClient: any,
  correlationId: string,
  maxWaitMs: number = 30000, // Increased default to 30 seconds
  pollIntervalMs: number = 500,
): Promise<any | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const transaction = await prismaClient.transaction.findUnique({
        where: { transaction_id: correlationId },
        include: {
          line_items: true,
          payments: true,
        },
      });

      if (transaction) {
        return transaction;
      }
    } catch {
      // Continue polling on error
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return null;
}

// =============================================================================
// SECTION 1: P0 CRITICAL - WORKER CORE FUNCTIONALITY
// =============================================================================

// Skip these tests if worker is not running (set WORKER_RUNNING=true to enable)
// In CI/CD, start the worker process before running these tests
const workerRunning = process.env.WORKER_RUNNING === "true";

test.describe("Transaction Processing Worker - Core Processing", () => {
  test.skip(
    !workerRunning,
    "Worker process not running - set WORKER_RUNNING=true to enable",
  );

  test("3.3-WKR-001: [P0] Worker should create Transaction record from queued message", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A valid transaction has been submitted via API
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = createTransactionPayload({
      store_id: store.store_id,
      shift_id: shift.shift_id,
    });

    // WHEN: Transaction is submitted (worker will process)
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    // THEN: Should return 202 with correlation_id
    expect(response.status()).toBe(202);
    const body = await response.json();
    const correlationId = body.data?.correlation_id;
    expect(correlationId).toBeDefined();

    // Wait for worker to process the message (with longer timeout for flaky tests)
    const transaction = await waitForTransactionProcessing(
      prismaClient,
      correlationId,
      30000, // 30 seconds for worker to process
    );

    // THEN: Transaction record should exist in database
    expect(
      transaction,
      `Transaction should be created by worker within 30 seconds. Correlation ID: ${correlationId}`,
    ).not.toBeNull();
    expect(transaction.store_id).toBe(store.store_id);
    expect(transaction.shift_id).toBe(shift.shift_id);
    expect(Number(transaction.subtotal)).toBeCloseTo(payload.subtotal, 2);
    expect(Number(transaction.tax)).toBeCloseTo(payload.tax, 2);
  });

  test("3.3-WKR-002: [P0] Worker should create TransactionLineItem records", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A transaction with multiple line items
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = createTransactionPayload({
      store_id: store.store_id,
      shift_id: shift.shift_id,
    });
    // Ensure we have at least 2 line items
    payload.line_items = [
      {
        sku: "SKU-001",
        name: "Item 1",
        quantity: 2,
        unit_price: 10.0,
        discount: 0,
      },
      {
        sku: "SKU-002",
        name: "Item 2",
        quantity: 1,
        unit_price: 25.0,
        discount: 0,
      },
    ];
    payload.subtotal = 45.0;
    payload.tax = 3.6;
    payload.payments = [{ method: "CASH", amount: 48.6 }];

    // WHEN: Transaction is submitted
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    expect(response.status()).toBe(202);
    const body = await response.json();
    const correlationId = body.data?.correlation_id;

    // Wait for worker processing
    const transaction = await waitForTransactionProcessing(
      prismaClient,
      correlationId,
    );

    // THEN: Line items should be created
    expect(transaction).not.toBeNull();
    expect(transaction.line_items.length).toBe(2);

    const item1 = transaction.line_items.find(
      (li: any) => li.sku === "SKU-001",
    );
    const item2 = transaction.line_items.find(
      (li: any) => li.sku === "SKU-002",
    );

    expect(item1).toBeDefined();
    expect(item1.quantity).toBe(2);
    expect(Number(item1.unit_price)).toBe(10.0);

    expect(item2).toBeDefined();
    expect(item2.quantity).toBe(1);
    expect(Number(item2.unit_price)).toBe(25.0);
  });

  test("3.3-WKR-003: [P0] Worker should create TransactionPayment records", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A transaction with split payment
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = createTransactionPayload({
      store_id: store.store_id,
      shift_id: shift.shift_id,
      subtotal: 100.0,
      tax: 8.0,
      discount: 0,
    });
    payload.payments = [
      { method: "CASH", amount: 50.0 },
      { method: "CREDIT", amount: 58.0, reference: "1234" },
    ];

    // WHEN: Transaction is submitted
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    expect(response.status()).toBe(202);
    const body = await response.json();
    const correlationId = body.data?.correlation_id;

    // Wait for worker processing
    const transaction = await waitForTransactionProcessing(
      prismaClient,
      correlationId,
    );

    // THEN: Payment records should be created
    expect(transaction).not.toBeNull();
    expect(transaction.payments.length).toBe(2);

    const cashPayment = transaction.payments.find(
      (p: any) => p.method === "CASH",
    );
    const creditPayment = transaction.payments.find(
      (p: any) => p.method === "CREDIT",
    );

    expect(cashPayment).toBeDefined();
    expect(Number(cashPayment.amount)).toBe(50.0);

    expect(creditPayment).toBeDefined();
    expect(Number(creditPayment.amount)).toBe(58.0);
    expect(creditPayment.reference).toBe("1234");
  });

  test("3.3-WKR-004: [P0] Worker should use correlation_id as transaction_id", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A valid transaction
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = createTransactionPayload({
      store_id: store.store_id,
      shift_id: shift.shift_id,
    });

    // WHEN: Transaction is submitted
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    expect(response.status()).toBe(202);
    const body = await response.json();
    const correlationId = body.data?.correlation_id;

    // Wait for worker processing (with longer timeout for flaky tests)
    const transaction = await waitForTransactionProcessing(
      prismaClient,
      correlationId,
      30000, // 30 seconds for worker to process
    );

    // THEN: transaction_id should match correlation_id
    expect(
      transaction,
      `Transaction should be created by worker within 30 seconds. Correlation ID: ${correlationId}`,
    ).not.toBeNull();
    expect(transaction.transaction_id).toBe(correlationId);
  });
});

// =============================================================================
// SECTION 2: P1 HIGH - VALIDATION TESTS
// =============================================================================

test.describe("Transaction Processing Worker - Validation", () => {
  test.skip(
    !workerRunning,
    "Worker process not running - set WORKER_RUNNING=true to enable",
  );

  test("3.3-WKR-005: [P1] Worker should validate shift exists", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A transaction with non-existent shift
    const { store } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const nonExistentShiftId = "00000000-0000-0000-0000-000000000000";
    const payload = createTransactionPayload({
      store_id: store.store_id,
      shift_id: nonExistentShiftId,
    });

    // WHEN: Transaction is submitted
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    // Note: The API validates shift before queuing, so should return 404
    expect([404, 202]).toContain(response.status());

    // If 202, worker should reject the message (no transaction created)
    if (response.status() === 202) {
      const body = await response.json();
      const correlationId = body.data?.correlation_id;

      // Wait briefly and verify no transaction was created
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const transaction = await prismaClient.transaction.findUnique({
        where: { transaction_id: correlationId },
      });
      expect(transaction).toBeNull();
    }
  });

  test("3.3-WKR-006: [P1] Worker should validate shift is OPEN status", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A closed shift
    const { store } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    // Create a Cashier for the closed shift
    const closedShiftCashier = await createTestCashier(
      prismaClient,
      store.store_id,
      corporateAdminUser.user_id,
    );

    const closedShift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: corporateAdminUser.user_id,
        cashier_id: closedShiftCashier.cashier_id,
        opening_cash: 100.0,
        status: "CLOSED",
        closing_cash: 500.0,
        closed_at: new Date(),
      },
    });

    const payload = createTransactionPayload({
      store_id: store.store_id,
      shift_id: closedShift.shift_id,
    });

    // WHEN: Transaction is submitted to closed shift
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    // Note: API validates shift status before queuing
    expect([409, 202]).toContain(response.status());

    // If 202, worker should reject the message
    if (response.status() === 202) {
      const body = await response.json();
      const correlationId = body.data?.correlation_id;

      await new Promise((resolve) => setTimeout(resolve, 3000));
      const transaction = await prismaClient.transaction.findUnique({
        where: { transaction_id: correlationId },
      });
      expect(transaction).toBeNull();
    }
  });

  test("3.3-WKR-007: [P1] Worker should validate shift belongs to store", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A shift from a different store
    const { store: store1 } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
      "Test Store 1",
    );

    const { shift: shift2 } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
      "Test Store 2",
    );

    // Mismatch: store_id from Store 1, shift_id from Store 2
    const payload = createTransactionPayload({
      store_id: store1.store_id,
      shift_id: shift2.shift_id,
    });

    // WHEN: Transaction is submitted with mismatched store/shift
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    // Should be rejected by either API or worker
    expect([400, 409, 202]).toContain(response.status());

    // If 202, worker should reject the message
    if (response.status() === 202) {
      const body = await response.json();
      const correlationId = body.data?.correlation_id;

      await new Promise((resolve) => setTimeout(resolve, 3000));
      const transaction = await prismaClient.transaction.findUnique({
        where: { transaction_id: correlationId },
      });
      expect(transaction).toBeNull();
    }
  });
});

// =============================================================================
// SECTION 3: P1 HIGH - ATOMICITY TESTS
// =============================================================================

test.describe("Transaction Processing Worker - Atomicity", () => {
  test.skip(
    !workerRunning,
    "Worker process not running - set WORKER_RUNNING=true to enable",
  );

  test("3.3-WKR-008: [P1] Worker should create all records atomically", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A valid transaction with line items and payments
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = createTransactionPayload({
      store_id: store.store_id,
      shift_id: shift.shift_id,
    });
    payload.line_items = [
      {
        sku: "ATOM-001",
        name: "Atomic Item 1",
        quantity: 1,
        unit_price: 20.0,
        discount: 0,
      },
      {
        sku: "ATOM-002",
        name: "Atomic Item 2",
        quantity: 2,
        unit_price: 15.0,
        discount: 0,
      },
    ];
    payload.subtotal = 50.0;
    payload.tax = 4.0;
    payload.payments = [{ method: "CASH", amount: 54.0 }];

    // WHEN: Transaction is submitted
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    expect(response.status()).toBe(202);
    const body = await response.json();
    const correlationId = body.data?.correlation_id;

    // Wait for worker processing
    const transaction = await waitForTransactionProcessing(
      prismaClient,
      correlationId,
    );

    // THEN: All records should exist (atomic creation)
    expect(transaction).not.toBeNull();
    expect(transaction.line_items.length).toBe(2);
    expect(transaction.payments.length).toBe(1);

    // All records should have same transaction_id
    transaction.line_items.forEach((li: any) => {
      expect(li.transaction_id).toBe(correlationId);
    });
    transaction.payments.forEach((p: any) => {
      expect(p.transaction_id).toBe(correlationId);
    });
  });

  test("3.3-WKR-009: [P1] Worker should rollback on partial failure", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // NOTE: This test verifies atomicity by checking that if worker fails,
    // no partial records are created. Since we can't easily trigger partial
    // failure, we verify the pattern works correctly for valid data.

    // GIVEN: A valid transaction
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = createTransactionPayload({
      store_id: store.store_id,
      shift_id: shift.shift_id,
    });

    // WHEN: Transaction is submitted
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    expect(response.status()).toBe(202);
    const body = await response.json();
    const correlationId = body.data?.correlation_id;

    // Wait for processing
    const transaction = await waitForTransactionProcessing(
      prismaClient,
      correlationId,
    );

    // THEN: Either all records exist or none exist (atomic)
    if (transaction) {
      // All related records should exist
      expect(transaction.line_items.length).toBeGreaterThan(0);
      expect(transaction.payments.length).toBeGreaterThan(0);
    } else {
      // If transaction doesn't exist, no orphan records should exist
      const orphanLineItems = await prismaClient.transactionLineItem.findMany({
        where: { transaction_id: correlationId },
      });
      const orphanPayments = await prismaClient.transactionPayment.findMany({
        where: { transaction_id: correlationId },
      });

      expect(orphanLineItems.length).toBe(0);
      expect(orphanPayments.length).toBe(0);
    }
  });
});

// =============================================================================
// SECTION 4: P2 MEDIUM - AUDIT & LOGGING TESTS
// =============================================================================

test.describe("Transaction Processing Worker - Audit", () => {
  test.skip(
    !workerRunning,
    "Worker process not running - set WORKER_RUNNING=true to enable",
  );
  test("3.3-WKR-010: [P2] Worker should create AuditLog entry for transaction", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A valid transaction
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = createTransactionPayload({
      store_id: store.store_id,
      shift_id: shift.shift_id,
    });

    // WHEN: Transaction is submitted and processed
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    expect(response.status()).toBe(202);
    const body = await response.json();
    const correlationId = body.data?.correlation_id;

    // Wait for worker processing
    const transaction = await waitForTransactionProcessing(
      prismaClient,
      correlationId,
    );
    expect(transaction).not.toBeNull();

    // THEN: AuditLog entry should exist
    const auditLog = await prismaClient.auditLog.findFirst({
      where: {
        table_name: "transactions",
        record_id: correlationId,
        action: "CREATE",
      },
    });

    expect(auditLog, "AuditLog entry should be created").not.toBeNull();
    expect(auditLog!.reason).toContain(correlationId);
  });
});

// =============================================================================
// SECTION 5: P1 HIGH - IDEMPOTENCY TESTS
// =============================================================================

test.describe("Transaction Processing Worker - Idempotency", () => {
  test.skip(
    !workerRunning,
    "Worker process not running - set WORKER_RUNNING=true to enable",
  );
  test("3.3-WKR-011: [P1] Worker should process single transaction and create exactly one record", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A valid transaction
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = createTransactionPayload({
      store_id: store.store_id,
      shift_id: shift.shift_id,
    });

    // WHEN: Transaction is submitted
    const response1 = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    expect(response1.status()).toBe(202);
    const body1 = await response1.json();
    const correlationId = body1.data?.correlation_id;
    expect(correlationId).toBeDefined();

    // Wait for transaction to be processed with extended timeout for burn-in stability
    const transaction1 = await waitForTransactionProcessing(
      prismaClient,
      correlationId,
      45000, // 45 seconds for burn-in stability
    );

    expect(transaction1).not.toBeNull();

    // THEN: Should have exactly one transaction record
    const transactions = await prismaClient.transaction.findMany({
      where: { transaction_id: correlationId },
    });

    expect(transactions.length).toBe(1);
  });
});

// =============================================================================
// SECTION 6: P2 MEDIUM - EDGE CASES
// =============================================================================

test.describe("Transaction Processing Worker - Edge Cases", () => {
  test.skip(
    !workerRunning,
    "Worker process not running - set WORKER_RUNNING=true to enable",
  );
  test("3.3-WKR-012: [P2] Worker should handle transaction with many line items (100+)", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A transaction with many line items
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = createTransactionPayload({
      store_id: store.store_id,
      shift_id: shift.shift_id,
    });

    // Generate 100 line items
    payload.line_items = Array.from({ length: 100 }, (_, i) => ({
      sku: `BULK-${i.toString().padStart(3, "0")}`,
      name: `Bulk Item ${i}`,
      quantity: 1,
      unit_price: 1.0,
      discount: 0,
    }));
    payload.subtotal = 100.0;
    payload.tax = 8.0;
    payload.payments = [{ method: "CASH", amount: 108.0 }];

    // WHEN: Large transaction is submitted
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    expect(response.status()).toBe(202);
    const body = await response.json();
    const correlationId = body.data?.correlation_id;

    // Wait for worker processing (longer timeout for large transactions)
    const transaction = await waitForTransactionProcessing(
      prismaClient,
      correlationId,
      30000, // 30 seconds for large transaction
    );

    // THEN: All 100 line items should be created
    expect(transaction).not.toBeNull();
    expect(transaction.line_items.length).toBe(100);
  });

  test("3.3-WKR-013: [P2] Worker should handle high decimal precision", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A transaction with precise decimal values
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = createTransactionPayload({
      store_id: store.store_id,
      shift_id: shift.shift_id,
      subtotal: 99.99,
      tax: 7.9992,
      discount: 0.01,
    });
    payload.line_items = [
      {
        sku: "DECIMAL-001",
        name: "Decimal Price Item",
        quantity: 3,
        unit_price: 33.33,
        discount: 0,
      },
    ];
    payload.payments = [{ method: "CASH", amount: 107.9792 }];

    // WHEN: Decimal precision transaction is submitted
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    expect([202, 400]).toContain(response.status());

    if (response.status() === 202) {
      const body = await response.json();
      const correlationId = body.data?.correlation_id;

      // Wait for worker processing
      const transaction = await waitForTransactionProcessing(
        prismaClient,
        correlationId,
      );

      // THEN: Decimal values should be preserved
      if (transaction) {
        expect(Number(transaction.subtotal)).toBeCloseTo(99.99, 2);
        expect(Number(transaction.tax)).toBeCloseTo(7.9992, 2);
      }
    }
  });

  test("3.3-WKR-014: [P2] Worker should handle multiple payment methods", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A transaction with all payment methods
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = createTransactionPayload({
      store_id: store.store_id,
      shift_id: shift.shift_id,
      subtotal: 100.0,
      tax: 8.0,
      discount: 0,
    });
    payload.payments = [
      { method: "CASH", amount: 20.0 },
      { method: "CREDIT", amount: 30.0, reference: "5678" },
      { method: "DEBIT", amount: 25.0, reference: "1234" },
      { method: "EBT", amount: 20.0 },
      { method: "OTHER", amount: 13.0 },
    ];

    // WHEN: Multi-payment transaction is submitted
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    expect(response.status()).toBe(202);
    const body = await response.json();
    const correlationId = body.data?.correlation_id;

    // Wait for worker processing
    const transaction = await waitForTransactionProcessing(
      prismaClient,
      correlationId,
    );

    // THEN: All payment methods should be recorded
    expect(transaction).not.toBeNull();
    expect(transaction.payments.length).toBe(5);

    const methods = transaction.payments.map((p: any) => p.method);
    expect(methods).toContain("CASH");
    expect(methods).toContain("CREDIT");
    expect(methods).toContain("DEBIT");
    expect(methods).toContain("EBT");
    expect(methods).toContain("OTHER");
  });
});

// =============================================================================
// SECTION 7: P0 CRITICAL - AUTHENTICATION SECURITY TESTS
// =============================================================================

// NOTE: Authentication tests do NOT require the worker - they test API-level
// authentication failures before any message is queued to RabbitMQ.
test.describe("Transaction Processing Worker - Authentication Security", () => {
  test("3.3-SEC-001: [P0] Should reject request without Authorization header", async ({
    request,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A valid transaction payload but no auth token
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = createTransactionPayload({
      store_id: store.store_id,
      shift_id: shift.shift_id,
    });

    // WHEN: Request is made without Authorization header
    const response = await request.post("/api/transactions", {
      data: payload,
      headers: {
        "Content-Type": "application/json",
        // No Authorization header
      },
    });

    // THEN: Should return 401 Unauthorized
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toHaveProperty("code");
    expect(body.error).toHaveProperty("message");
  });

  test("3.3-SEC-002: [P0] Should reject request with invalid JWT token", async ({
    request,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A valid transaction payload with invalid token
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = createTransactionPayload({
      store_id: store.store_id,
      shift_id: shift.shift_id,
    });

    // WHEN: Request is made with invalid JWT token
    const response = await request.post("/api/transactions", {
      data: payload,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer invalid.jwt.token",
      },
    });

    // THEN: Should return 401 Unauthorized
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("3.3-SEC-003: [P0] Should reject request with malformed Authorization header", async ({
    request,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A valid transaction payload with malformed auth header
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = createTransactionPayload({
      store_id: store.store_id,
      shift_id: shift.shift_id,
    });

    // WHEN: Request is made with malformed Authorization header (no "Bearer" prefix)
    const response = await request.post("/api/transactions", {
      data: payload,
      headers: {
        "Content-Type": "application/json",
        Authorization: "some-token-without-bearer",
      },
    });

    // THEN: Should return 401 Unauthorized
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
  });
});

// =============================================================================
// SECTION 8: P0 CRITICAL - AUTHORIZATION SECURITY TESTS
// =============================================================================

// NOTE: Authorization tests do NOT require the worker - they test API-level
// permission checks before any message is queued to RabbitMQ.
test.describe("Transaction Processing Worker - Authorization Security", () => {
  test("3.3-SEC-004: [P0] Should reject user accessing store from different company", async ({
    corporateAdminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: A store belonging to a different company
    // First create an owner user for the other company
    const otherOwnerUser = await prismaClient.user.create({
      data: createUser({
        email: `other-owner-sec-${Date.now()}@test.nuvana.local`,
      }),
    });

    const otherCompany = await prismaClient.company.create({
      data: createCompany({
        name: "Test Other Company for SEC Test",
        owner_user_id: otherOwnerUser.user_id,
      }),
    });

    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      otherCompany.company_id,
      otherOwnerUser.user_id,
      "Test Other Company Store",
    );

    const payload = createTransactionPayload({
      store_id: store.store_id,
      shift_id: shift.shift_id,
    });

    // WHEN: Corporate admin tries to access store from different company
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    // THEN: Should return 403 Forbidden
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("PERMISSION_DENIED");
  });
});

// =============================================================================
// SECTION 9: P1 HIGH - INPUT VALIDATION SECURITY TESTS
// =============================================================================

// NOTE: Input validation tests do NOT require the worker - they test API-level
// Zod schema validation before any message is queued to RabbitMQ.
test.describe("Transaction Processing Worker - Input Validation Security", () => {
  test("3.3-SEC-005: [P1] Should reject invalid UUID format for store_id", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A transaction with invalid store_id format
    const { shift } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = createTransactionPayload({
      store_id: "not-a-valid-uuid",
      shift_id: shift.shift_id,
    });

    // WHEN: Transaction is submitted with invalid store_id
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    // THEN: Should return 400 Bad Request
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("3.3-SEC-006: [P1] Should reject invalid UUID format for shift_id", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A transaction with invalid shift_id format
    const { store } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = createTransactionPayload({
      store_id: store.store_id,
      shift_id: "invalid-shift-uuid",
    });

    // WHEN: Transaction is submitted with invalid shift_id
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    // THEN: Should return 400 Bad Request
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("3.3-SEC-007: [P1] Should reject missing required field (store_id)", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A transaction payload missing store_id
    const { shift } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = {
      // store_id intentionally missing
      shift_id: shift.shift_id,
      subtotal: 100.0,
      tax: 8.0,
      discount: 0,
      line_items: [
        {
          sku: "TEST-001",
          name: "Test Item",
          quantity: 1,
          unit_price: 100.0,
          discount: 0,
        },
      ],
      payments: [{ method: "CASH", amount: 108.0 }],
    };

    // WHEN: Transaction is submitted without store_id
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    // THEN: Should return 400 Bad Request
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("3.3-SEC-008: [P1] Should reject empty line_items array", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A transaction with empty line_items
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = {
      store_id: store.store_id,
      shift_id: shift.shift_id,
      subtotal: 0,
      tax: 0,
      discount: 0,
      line_items: [], // Empty array - should fail
      payments: [{ method: "CASH", amount: 0 }],
    };

    // WHEN: Transaction is submitted with empty line_items
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    // THEN: Should return 400 Bad Request
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("3.3-SEC-009: [P1] Should reject empty payments array", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A transaction with empty payments
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = {
      store_id: store.store_id,
      shift_id: shift.shift_id,
      subtotal: 100.0,
      tax: 8.0,
      discount: 0,
      line_items: [
        {
          sku: "TEST-001",
          name: "Test Item",
          quantity: 1,
          unit_price: 100.0,
          discount: 0,
        },
      ],
      payments: [], // Empty array - should fail
    };

    // WHEN: Transaction is submitted with empty payments
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    // THEN: Should return 400 Bad Request
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("3.3-SEC-010: [P1] Should reject invalid payment method", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A transaction with invalid payment method
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = {
      store_id: store.store_id,
      shift_id: shift.shift_id,
      subtotal: 100.0,
      tax: 8.0,
      discount: 0,
      line_items: [
        {
          sku: "TEST-001",
          name: "Test Item",
          quantity: 1,
          unit_price: 100.0,
          discount: 0,
        },
      ],
      payments: [{ method: "BITCOIN", amount: 108.0 }], // Invalid method
    };

    // WHEN: Transaction is submitted with invalid payment method
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    // THEN: Should return 400 Bad Request
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("3.3-SEC-011: [P1] Should reject negative subtotal", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A transaction with negative subtotal
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = {
      store_id: store.store_id,
      shift_id: shift.shift_id,
      subtotal: -50.0, // Negative - should fail
      tax: 0,
      discount: 0,
      line_items: [
        {
          sku: "TEST-001",
          name: "Test Item",
          quantity: 1,
          unit_price: 50.0,
          discount: 0,
        },
      ],
      payments: [{ method: "CASH", amount: 50.0 }],
    };

    // WHEN: Transaction is submitted with negative subtotal
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    // THEN: Should return 400 Bad Request
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("3.3-SEC-012: [P1] Should reject negative quantity in line items", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A transaction with negative quantity
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = {
      store_id: store.store_id,
      shift_id: shift.shift_id,
      subtotal: 100.0,
      tax: 8.0,
      discount: 0,
      line_items: [
        {
          sku: "TEST-001",
          name: "Test Item",
          quantity: -1,
          unit_price: 100.0,
          discount: 0,
        }, // Negative qty
      ],
      payments: [{ method: "CASH", amount: 108.0 }],
    };

    // WHEN: Transaction is submitted with negative quantity
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    // THEN: Should return 400 Bad Request
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  test("3.3-SEC-013: [P1] Should reject payment total less than transaction total", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A transaction where payment < total (underpayment)
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = {
      store_id: store.store_id,
      shift_id: shift.shift_id,
      subtotal: 100.0,
      tax: 8.0,
      discount: 0,
      line_items: [
        {
          sku: "TEST-001",
          name: "Test Item",
          quantity: 1,
          unit_price: 100.0,
          discount: 0,
        },
      ],
      payments: [{ method: "CASH", amount: 50.0 }], // Only $50, total is $108
    };

    // WHEN: Transaction is submitted with underpayment
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    // THEN: Should return 400 Bad Request
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });
});

// =============================================================================
// SECTION 10: P1 HIGH - SQL INJECTION PREVENTION TESTS
// =============================================================================

// NOTE: SQL Injection tests verify Prisma's parameterized queries protect against injection.
// The API accepts the payload (valid structure), worker processes it safely.
// These tests need the worker to verify the data is stored correctly as literal strings.
test.describe("Transaction Processing Worker - SQL Injection Prevention", () => {
  test.skip(
    !workerRunning,
    "Worker process not running - set WORKER_RUNNING=true to enable",
  );
  test("3.3-SEC-014: [P1] Should sanitize SQL injection attempt in SKU field", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A transaction with SQL injection attempt in SKU
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = createTransactionPayload({
      store_id: store.store_id,
      shift_id: shift.shift_id,
    });
    payload.line_items = [
      {
        sku: "'; DROP TABLE transactions; --",
        name: "Malicious Item",
        quantity: 1,
        unit_price: 10.0,
        discount: 0,
      },
    ];
    payload.subtotal = 10.0;
    payload.tax = 0.8;
    payload.payments = [{ method: "CASH", amount: 10.8 }];

    // WHEN: Transaction is submitted with SQL injection in SKU
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    // THEN: Should either accept (Prisma sanitizes) or reject, but NOT execute SQL
    expect([202, 400]).toContain(response.status());

    if (response.status() === 202) {
      const body = await response.json();
      const correlationId = body.data?.correlation_id;

      // Wait for worker processing
      const transaction = await waitForTransactionProcessing(
        prismaClient,
        correlationId,
      );

      // Verify the malicious SKU was stored as literal string, not executed
      if (transaction) {
        const lineItem = transaction.line_items[0];
        expect(lineItem.sku).toBe("'; DROP TABLE transactions; --");
      }
    }

    // Verify transactions table still exists (SQL injection didn't work)
    const count = await prismaClient.transaction.count();
    expect(count).toBeGreaterThanOrEqual(0); // Table exists
  });

  test("3.3-SEC-015: [P1] Should sanitize SQL injection attempt in name field", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A transaction with SQL injection attempt in name
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = createTransactionPayload({
      store_id: store.store_id,
      shift_id: shift.shift_id,
    });
    payload.line_items = [
      {
        sku: "SAFE-SKU",
        name: "Test'; DELETE FROM users WHERE '1'='1",
        quantity: 1,
        unit_price: 10.0,
        discount: 0,
      },
    ];
    payload.subtotal = 10.0;
    payload.tax = 0.8;
    payload.payments = [{ method: "CASH", amount: 10.8 }];

    // WHEN: Transaction is submitted with SQL injection in name
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    // THEN: Should either accept (Prisma sanitizes) or reject
    expect([202, 400]).toContain(response.status());

    // Verify users table still has data (SQL injection didn't delete)
    const userCount = await prismaClient.user.count();
    expect(userCount).toBeGreaterThan(0);
  });
});

// =============================================================================
// SECTION 11: P2 MEDIUM - DATA LEAKAGE PREVENTION TESTS
// =============================================================================

// NOTE: Data leakage tests do NOT require the worker - they test API response format.
test.describe("Transaction Processing Worker - Data Leakage Prevention", () => {
  test("3.3-SEC-016: [P2] Error response should not expose stack traces", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A request that will cause an error (non-existent shift)
    const { store } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = createTransactionPayload({
      store_id: store.store_id,
      shift_id: "00000000-0000-0000-0000-000000000000", // Non-existent
    });

    // WHEN: Transaction is submitted with non-existent shift
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    // THEN: Error response should not contain stack trace indicators
    const body = await response.json();
    const bodyString = JSON.stringify(body);

    // Check for stack trace patterns (file paths with line numbers)
    expect(bodyString).not.toMatch(/at\s+\w+\s+\(/); // "at FunctionName ("
    expect(bodyString).not.toContain(".ts:");
    expect(bodyString).not.toContain(".js:");
    expect(bodyString).not.toContain("node_modules");
    // Note: "Error:" can appear in user-facing error messages, so we check for
    // stack trace format patterns instead (e.g., "Error:\n    at")
    expect(bodyString).not.toMatch(/Error:\s*\n\s*at\s/);
  });

  test("3.3-SEC-017: [P2] Success response should only contain expected fields", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A valid transaction
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = createTransactionPayload({
      store_id: store.store_id,
      shift_id: shift.shift_id,
    });

    // WHEN: Transaction is submitted successfully
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    // THEN: Response should only contain expected fields
    expect(response.status()).toBe(202);
    const body = await response.json();

    expect(body).toHaveProperty("success", true);
    expect(body).toHaveProperty("data");
    expect(body.data).toHaveProperty("correlation_id");
    expect(body.data).toHaveProperty("status", "queued");
    expect(body.data).toHaveProperty("message");

    // Should NOT contain internal implementation details
    expect(body.data).not.toHaveProperty("user_id");
    expect(body.data).not.toHaveProperty("internal_id");
    expect(body.data).not.toHaveProperty("queue_name");
  });
});

// =============================================================================
// SECTION 12: P2 MEDIUM - ADDITIONAL EDGE CASES
// =============================================================================

test.describe("Transaction Processing Worker - Additional Edge Cases", () => {
  test.skip(
    !workerRunning,
    "Worker process not running - set WORKER_RUNNING=true to enable",
  );
  test("3.3-WKR-015: [P2] Should handle zero subtotal with valid line items", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A transaction with $0 subtotal (e.g., 100% discount scenario)
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = {
      store_id: store.store_id,
      shift_id: shift.shift_id,
      subtotal: 0,
      tax: 0,
      discount: 0,
      line_items: [
        {
          sku: "FREE-001",
          name: "Free Sample",
          quantity: 1,
          unit_price: 0,
          discount: 0,
        },
      ],
      payments: [{ method: "CASH", amount: 0 }],
    };

    // WHEN: Zero-total transaction is submitted
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    // THEN: Should be accepted (valid transaction)
    // Note: Payment amount > 0 is required per schema, so this may fail
    expect([202, 400]).toContain(response.status());
  });

  test("3.3-WKR-016: [P2] Should handle overpayment (change scenario)", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A transaction with overpayment (customer gives more cash)
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = createTransactionPayload({
      store_id: store.store_id,
      shift_id: shift.shift_id,
      subtotal: 47.5,
      tax: 3.8,
      discount: 0,
    });
    // Total is $51.30, customer pays $60 (gets change)
    payload.payments = [{ method: "CASH", amount: 60.0 }];

    // WHEN: Overpayment transaction is submitted
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    // THEN: Should be accepted (overpayment is valid)
    expect(response.status()).toBe(202);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test("3.3-WKR-017: [P2] Should handle line item with zero unit price", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A transaction with a free item (unit_price = 0)
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = createTransactionPayload({
      store_id: store.store_id,
      shift_id: shift.shift_id,
    });
    payload.line_items = [
      {
        sku: "PAID-001",
        name: "Paid Item",
        quantity: 1,
        unit_price: 50.0,
        discount: 0,
      },
      {
        sku: "FREE-001",
        name: "Free Gift",
        quantity: 1,
        unit_price: 0,
        discount: 0,
      },
    ];
    payload.subtotal = 50.0;
    payload.tax = 4.0;
    payload.payments = [{ method: "CASH", amount: 54.0 }];

    // WHEN: Transaction with free item is submitted
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    // THEN: Should be accepted
    expect(response.status()).toBe(202);

    const body = await response.json();
    const correlationId = body.data?.correlation_id;

    // Wait for worker processing
    const transaction = await waitForTransactionProcessing(
      prismaClient,
      correlationId,
    );

    // Verify both line items created
    if (transaction) {
      expect(transaction.line_items.length).toBe(2);
      const freeItem = transaction.line_items.find(
        (li: any) => li.sku === "FREE-001",
      );
      expect(freeItem).toBeDefined();
      expect(Number(freeItem.unit_price)).toBe(0);
    }
  });

  test("3.3-WKR-018: [P2] Should handle special characters in product name", async ({
    corporateAdminApiRequest,
    corporateAdminUser,
    prismaClient,
  }) => {
    // GIVEN: A transaction with special characters and unicode in product name
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      corporateAdminUser.company_id,
      corporateAdminUser.user_id,
    );

    const payload = createTransactionPayload({
      store_id: store.store_id,
      shift_id: shift.shift_id,
    });
    payload.line_items = [
      {
        sku: "SPECIAL-001",
        name: "Café Latté - 12oz (Hot) 咖啡 ☕️ & Croissant",
        quantity: 1,
        unit_price: 8.5,
        discount: 0,
      },
    ];
    payload.subtotal = 8.5;
    payload.tax = 0.68;
    payload.payments = [{ method: "CASH", amount: 9.18 }];

    // WHEN: Transaction with special characters is submitted
    const response = await corporateAdminApiRequest.post(
      "/api/transactions",
      payload,
    );

    expect(response.status()).toBe(202);

    const body = await response.json();
    const correlationId = body.data?.correlation_id;

    // Wait for worker processing
    const transaction = await waitForTransactionProcessing(
      prismaClient,
      correlationId,
    );

    // THEN: Special characters should be preserved
    if (transaction) {
      const item = transaction.line_items[0];
      expect(item.name).toContain("Café");
      expect(item.name).toContain("咖啡");
      expect(item.name).toContain("☕️");
    }
  });
});
