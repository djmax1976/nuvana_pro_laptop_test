import { test, expect } from "../support/fixtures/rbac.fixture";
import { createStore, createCashier } from "../support/factories";

/**
 * Phase 1.5: Transaction FK Resolution Tests
 *
 * Tests for verifying that transaction imports correctly resolve and populate
 * foreign key fields for TenderType (payments) and Department (line items).
 *
 * TEST LEVEL: API Integration
 * PRIMARY GOAL: Verify FK resolution during transaction creation and query response
 *
 * BUSINESS RULES TESTED:
 * - tender_type_id populated from payment method or tender_code
 * - tender_code populated as denormalized snapshot
 * - department_id populated from department_code
 * - department_code populated as denormalized snapshot
 * - tax_amount captured per line item
 * - Query response includes FK fields
 *
 * FIXTURE: Uses corporateAdminUser/corporateAdminApiRequest which has TRANSACTION_CREATE permission
 */

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Creates a test store, cashier, and open shift for transaction testing.
 * Uses proper test marker prefix for cleanup.
 *
 * IMPORTANT: Transaction.cashier_id is a FK to User.user_id, NOT Cashier.cashier_id.
 * The Shift model requires a Cashier, but Transaction stores the User who rang up
 * the sale. When creating transactions, either omit cashier_id (worker uses
 * authenticated user) or explicitly pass a User.user_id.
 *
 * @param prismaClient - Prisma client
 * @param companyId - Company ID
 * @param createdByUserId - User ID for shift opener, cashier creator, and transaction cashier
 * @returns Store, cashier, shift objects
 */
async function createTestStoreAndShift(
  prismaClient: any,
  companyId: string,
  createdByUserId: string,
) {
  // Use "Test " prefix for proper cleanup
  const store = await prismaClient.store.create({
    data: createStore({
      company_id: companyId,
      name: `Test FK Store ${Date.now()}`,
      timezone: "America/New_York",
      status: "ACTIVE",
    }),
  });

  // Cashier is required for Shift, but Transaction.cashier_id references User.user_id
  const cashier = await prismaClient.cashier.create({
    data: await createCashier({
      store_id: store.store_id,
      created_by: createdByUserId,
    }),
  });

  const shift = await prismaClient.shift.create({
    data: {
      store_id: store.store_id,
      opened_by: createdByUserId,
      cashier_id: cashier.cashier_id,
      opening_cash: 100.0,
      status: "OPEN",
    },
  });

  return { store, cashier, shift };
}

/**
 * Wait for async worker to process transaction.
 * Uses polling with timeout and looks up by transaction_id (correlation_id from API response).
 *
 * @param prismaClient - Prisma client
 * @param transactionId - Transaction ID (correlation_id from API response)
 * @param maxWaitMs - Maximum wait time (default 30000ms for worker processing)
 * @param pollIntervalMs - Polling interval (default 500ms)
 * @returns Transaction if found, null if timeout
 */
async function waitForTransaction(
  prismaClient: any,
  transactionId: string,
  maxWaitMs: number = 30000,
  pollIntervalMs: number = 500,
): Promise<any | null> {
  const startTime = Date.now();
  let pollCount = 0;

  while (Date.now() - startTime < maxWaitMs) {
    pollCount++;
    try {
      const transaction = await prismaClient.transaction.findUnique({
        where: { transaction_id: transactionId },
        include: {
          payments: true,
          line_items: true,
        },
      });

      if (transaction) {
        console.log(
          `[waitForTransaction] Found transaction ${transactionId} after ${pollCount} polls (${Date.now() - startTime}ms)`,
        );
        return transaction;
      }
    } catch (error) {
      // Log error but continue polling
      console.warn(
        `[waitForTransaction] Poll ${pollCount} error:`,
        error instanceof Error ? error.message : "Unknown error",
      );
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  console.warn(
    `[waitForTransaction] Timeout waiting for transaction ${transactionId} after ${pollCount} polls (${maxWaitMs}ms). ` +
      `Ensure the transaction worker is running: npm run worker:transaction`,
  );
  return null;
}

/**
 * Ensures a system-level tender type exists for testing.
 * Creates it if it doesn't exist (enterprise-grade: tests should not skip).
 *
 * @param prismaClient - Prisma client
 * @param code - Tender type code (e.g., "CASH", "CREDIT")
 * @param displayName - Display name for the tender type
 * @param options - Optional configuration
 * @returns Tender type record
 */
async function ensureSystemTenderType(
  prismaClient: any,
  code: string,
  displayName: string,
  options: {
    is_cash_equivalent?: boolean;
    is_electronic?: boolean;
    affects_cash_drawer?: boolean;
  } = {},
): Promise<any> {
  let tenderType = await prismaClient.tenderType.findFirst({
    where: { code, client_id: null, is_active: true },
  });

  if (!tenderType) {
    tenderType = await prismaClient.tenderType.create({
      data: {
        code,
        display_name: displayName,
        description: `System tender type for ${code} (created by test)`,
        is_cash_equivalent: options.is_cash_equivalent ?? code === "CASH",
        requires_reference: false,
        is_electronic: options.is_electronic ?? code !== "CASH",
        affects_cash_drawer: options.affects_cash_drawer ?? code === "CASH",
        sort_order: 0,
        is_system: true,
        is_active: true,
        client_id: null, // System-level
      },
    });
  }

  return tenderType;
}

/**
 * Ensures a system-level department exists for testing.
 * Creates it if it doesn't exist (enterprise-grade: tests should not skip).
 *
 * @param prismaClient - Prisma client
 * @param code - Department code (e.g., "GROCERY")
 * @param displayName - Display name for the department
 * @returns Department record
 */
async function ensureSystemDepartment(
  prismaClient: any,
  code: string,
  displayName: string,
): Promise<any> {
  let department = await prismaClient.department.findFirst({
    where: { code, client_id: null, is_active: true },
  });

  if (!department) {
    department = await prismaClient.department.create({
      data: {
        code,
        display_name: displayName,
        description: `System department for ${code} (created by test)`,
        is_active: true,
        is_system: true,
        is_taxable: true,
        client_id: null, // System-level
      },
    });
  }

  return department;
}

// Skip tests if worker is not running - set WORKER_RUNNING=true to enable
const workerRunning = process.env.WORKER_RUNNING === "true";

/**
 * Enterprise-grade assertion helper for transaction existence.
 * Provides detailed diagnostic message when assertion fails.
 *
 * @param transaction - Transaction object from waitForTransaction
 * @param correlationId - The correlation ID used for lookup
 */
function assertTransactionExists(
  transaction: any,
  correlationId: string,
): asserts transaction is NonNullable<typeof transaction> {
  if (transaction === null || transaction === undefined) {
    throw new Error(
      `Transaction not found for correlation_id ${correlationId}. ` +
        `This typically means the transaction worker is not running. ` +
        `Ensure you start the worker process: npm run worker:transaction\n` +
        `The API returned 202 Accepted, meaning the message was queued for async processing, ` +
        `but without a running worker, the transaction record is never created.`,
    );
  }
}

// =============================================================================
// TEST SUITES
// =============================================================================

test.describe("Phase 1.5: Transaction FK Resolution", () => {
  // Skip all tests in this suite if worker is not running
  test.skip(
    !workerRunning,
    "Worker process not running - set WORKER_RUNNING=true to enable these tests",
  );

  test.describe("P1 - Tender Type FK Resolution", () => {
    test("should populate tender_type_id and tender_code from payment method", async ({
      corporateAdminApiRequest,
      corporateAdminUser,
      prismaClient,
    }) => {
      // Setup - create store and shift for corporate admin's company
      const { store, shift } = await createTestStoreAndShift(
        prismaClient,
        corporateAdminUser.company_id,
        corporateAdminUser.user_id,
      );

      // Enterprise-grade: Ensure tender type exists (don't skip tests)
      const cashTenderType = await ensureSystemTenderType(
        prismaClient,
        "CASH",
        "Cash",
        {
          is_cash_equivalent: true,
          is_electronic: false,
          affects_cash_drawer: true,
        },
      );

      // Create simple transaction with known amounts (payment must >= subtotal + tax - discount)
      const subtotal = 50.0;
      const tax = 4.0;
      const total = subtotal + tax;

      // NOTE: Omit cashier_id - worker will use authenticated user's ID
      // Transaction.cashier_id is a FK to User.user_id, not Cashier.cashier_id
      const payload = {
        store_id: store.store_id,
        shift_id: shift.shift_id,
        subtotal,
        tax,
        discount: 0,
        line_items: [
          {
            sku: "TEST-CASH-001",
            name: "Cash Test Product",
            quantity: 1,
            unit_price: subtotal,
            discount: 0,
          },
        ],
        payments: [{ method: "CASH" as const, amount: total }],
      };

      const response = await corporateAdminApiRequest.post(
        "/api/transactions",
        payload,
      );

      expect(response.status()).toBe(202);

      // Get correlation_id from response to wait for transaction
      const responseBody = await response.json();
      const correlationId = responseBody.data.correlation_id;

      // Wait for worker to process transaction using correlation_id
      const transaction = await waitForTransaction(prismaClient, correlationId);

      // Enterprise-grade: Comprehensive verification
      assertTransactionExists(transaction, correlationId);
      expect(transaction?.payments).toHaveLength(1);

      const payment = transaction?.payments[0];
      // Verify FK resolution: tender_type_id should match resolved tender type
      expect(payment?.tender_type_id).toBe(cashTenderType.tender_type_id);
      // Verify denormalized snapshot: tender_code should match resolved code
      expect(payment?.tender_code).toBe("CASH");
      // Verify method field is preserved (backward compatibility)
      expect(payment?.method).toBe("CASH");
      // Verify amount is correct
      expect(Number(payment?.amount)).toBe(total);
    });

    test("should use tender_code from payload when explicitly provided", async ({
      corporateAdminApiRequest,
      corporateAdminUser,
      prismaClient,
    }) => {
      // Setup
      const { store, shift } = await createTestStoreAndShift(
        prismaClient,
        corporateAdminUser.company_id,
        corporateAdminUser.user_id,
      );

      // Enterprise-grade: Ensure tender type exists (don't skip tests)
      const creditTenderType = await ensureSystemTenderType(
        prismaClient,
        "CREDIT",
        "Credit Card",
        {
          is_cash_equivalent: false,
          is_electronic: true,
          affects_cash_drawer: false,
        },
      );

      // Create simple transaction with explicit tender_code
      const subtotal = 75.0;
      const tax = 6.0;
      const total = subtotal + tax;

      // NOTE: Omit cashier_id - worker will use authenticated user's ID
      const payload = {
        store_id: store.store_id,
        shift_id: shift.shift_id,
        subtotal,
        tax,
        discount: 0,
        line_items: [
          {
            sku: "TEST-CREDIT-001",
            name: "Credit Test Product",
            quantity: 1,
            unit_price: subtotal,
            discount: 0,
          },
        ],
        payments: [
          {
            method: "CREDIT" as const,
            amount: total,
            tender_code: "CREDIT", // Explicit tender_code should take precedence
            reference: "1234",
          },
        ],
      };

      const response = await corporateAdminApiRequest.post(
        "/api/transactions",
        payload,
      );

      expect(response.status()).toBe(202);

      // Get correlation_id from response to wait for transaction
      const responseBody = await response.json();
      const correlationId = responseBody.data.correlation_id;

      // Wait for worker to process transaction using correlation_id
      const transaction = await waitForTransaction(prismaClient, correlationId);

      // Enterprise-grade: Comprehensive verification
      assertTransactionExists(transaction, correlationId);
      expect(transaction?.payments).toHaveLength(1);

      const payment = transaction?.payments[0];
      // Verify FK resolution: tender_type_id should match resolved tender type
      expect(payment?.tender_type_id).toBe(creditTenderType.tender_type_id);
      // Verify denormalized snapshot: tender_code should match resolved code
      expect(payment?.tender_code).toBe("CREDIT");
      // Verify method field is preserved (backward compatibility)
      expect(payment?.method).toBe("CREDIT");
      // Verify reference is preserved
      expect(payment?.reference).toBe("1234");
      // Verify amount is correct
      expect(Number(payment?.amount)).toBe(total);
    });

    test("should handle unknown tender_code gracefully", async ({
      corporateAdminApiRequest,
      corporateAdminUser,
      prismaClient,
    }) => {
      const { store, shift } = await createTestStoreAndShift(
        prismaClient,
        corporateAdminUser.company_id,
        corporateAdminUser.user_id,
      );

      // Enterprise-grade: Verify no tender type exists for "UNKNOWN_TEST_CODE"
      const unknownTenderType = await prismaClient.tenderType.findFirst({
        where: { code: "UNKNOWN_TEST_CODE", is_active: true },
      });
      expect(unknownTenderType).toBeNull(); // Ensure it doesn't exist

      // Create simple transaction with unknown tender code
      const subtotal = 25.0;
      const tax = 2.0;
      const total = subtotal + tax;

      // NOTE: Omit cashier_id - worker will use authenticated user's ID
      const payload = {
        store_id: store.store_id,
        shift_id: shift.shift_id,
        subtotal,
        tax,
        discount: 0,
        line_items: [
          {
            sku: "TEST-OTHER-001",
            name: "Other Payment Product",
            quantity: 1,
            unit_price: subtotal,
            discount: 0,
          },
        ],
        payments: [
          {
            method: "OTHER" as const,
            amount: total,
            tender_code: "UNKNOWN_TEST_CODE", // Unknown code that doesn't exist
          },
        ],
      };

      const response = await corporateAdminApiRequest.post(
        "/api/transactions",
        payload,
      );

      // Enterprise-grade: Transaction should still be accepted (202)
      // FK resolution failure should NOT block transaction creation (graceful degradation)
      expect(response.status()).toBe(202);

      // Get correlation_id from response to wait for transaction
      const responseBody = await response.json();
      const correlationId = responseBody.data.correlation_id;

      // Wait for worker to process transaction using correlation_id
      const transaction = await waitForTransaction(prismaClient, correlationId);

      // Enterprise-grade: Comprehensive verification of graceful degradation
      assertTransactionExists(transaction, correlationId);
      expect(transaction?.payments).toHaveLength(1);

      const payment = transaction?.payments[0];
      // Verify graceful degradation: tender_type_id should be null when resolution fails
      expect(payment?.tender_type_id).toBeNull();
      // Verify graceful degradation: tender_code should be null when resolution fails
      expect(payment?.tender_code).toBeNull();
      // Verify method field is preserved (backward compatibility)
      expect(payment?.method).toBe("OTHER");
      // Verify amount is correct
      expect(Number(payment?.amount)).toBe(total);
    });
  });

  test.describe("P1 - Department FK Resolution", () => {
    test("should populate department_id and department_code from line item", async ({
      corporateAdminApiRequest,
      corporateAdminUser,
      prismaClient,
    }) => {
      // Setup
      const { store, shift } = await createTestStoreAndShift(
        prismaClient,
        corporateAdminUser.company_id,
        corporateAdminUser.user_id,
      );

      // Enterprise-grade: Ensure system department exists (don't skip tests)
      const testDepartment = await ensureSystemDepartment(
        prismaClient,
        "GROCERY",
        "Grocery",
      );

      // Ensure CASH tender type exists for payment
      await ensureSystemTenderType(prismaClient, "CASH", "Cash", {
        is_cash_equivalent: true,
        is_electronic: false,
        affects_cash_drawer: true,
      });

      // Create transaction with department_code
      // NOTE: Omit cashier_id - worker will use authenticated user's ID
      const payload = {
        store_id: store.store_id,
        shift_id: shift.shift_id,
        subtotal: 10.0,
        tax: 0.8,
        discount: 0,
        line_items: [
          {
            sku: "TEST-SKU-001",
            name: "Test Product",
            quantity: 1,
            unit_price: 10.0,
            discount: 0,
            tax_amount: 0.8,
            department_code: "GROCERY",
          },
        ],
        payments: [{ method: "CASH" as const, amount: 10.8 }],
      };

      const response = await corporateAdminApiRequest.post(
        "/api/transactions",
        payload,
      );

      expect(response.status()).toBe(202);

      // Get correlation_id from response to wait for transaction
      const responseBody = await response.json();
      const correlationId = responseBody.data.correlation_id;

      // Wait for worker to process transaction using correlation_id
      const transaction = await waitForTransaction(prismaClient, correlationId);

      // Enterprise-grade: Comprehensive verification
      assertTransactionExists(transaction, correlationId);
      expect(transaction?.line_items).toHaveLength(1);

      const lineItem = transaction?.line_items[0];
      // Verify FK resolution: department_id should match resolved department
      expect(lineItem?.department_id).toBe(testDepartment.department_id);
      // Verify denormalized snapshot: department_code should match resolved code
      expect(lineItem?.department_code).toBe("GROCERY");
      // Verify tax_amount is stored per line item
      expect(Number(lineItem?.tax_amount)).toBe(0.8);
      // Verify other line item fields
      expect(lineItem?.sku).toBe("TEST-SKU-001");
      expect(lineItem?.name).toBe("Test Product");
      expect(Number(lineItem?.quantity)).toBe(1);
      expect(Number(lineItem?.unit_price)).toBe(10.0);
    });

    test("should allow line items without department_code", async ({
      corporateAdminApiRequest,
      corporateAdminUser,
      prismaClient,
    }) => {
      const { store, shift } = await createTestStoreAndShift(
        prismaClient,
        corporateAdminUser.company_id,
        corporateAdminUser.user_id,
      );

      // Ensure CASH tender type exists for payment
      await ensureSystemTenderType(prismaClient, "CASH", "Cash", {
        is_cash_equivalent: true,
        is_electronic: false,
        affects_cash_drawer: true,
      });

      // Create simple transaction without department_code
      const subtotal = 30.0;
      const tax = 2.4;
      const total = subtotal + tax;

      // NOTE: Omit cashier_id - worker will use authenticated user's ID
      const payload = {
        store_id: store.store_id,
        shift_id: shift.shift_id,
        subtotal,
        tax,
        discount: 0,
        line_items: [
          {
            sku: "TEST-NO-DEPT-001",
            name: "No Department Product",
            quantity: 1,
            unit_price: subtotal,
            discount: 0,
            // No department_code specified - should result in null FK fields
          },
        ],
        payments: [{ method: "CASH" as const, amount: total }],
      };

      const response = await corporateAdminApiRequest.post(
        "/api/transactions",
        payload,
      );

      expect(response.status()).toBe(202);

      // Get correlation_id from response to wait for transaction
      const responseBody = await response.json();
      const correlationId = responseBody.data.correlation_id;

      // Wait for worker to process transaction using correlation_id
      const transaction = await waitForTransaction(prismaClient, correlationId);

      // Enterprise-grade: Comprehensive verification of optional department handling
      assertTransactionExists(transaction, correlationId);
      expect(transaction?.line_items).toHaveLength(1);

      transaction?.line_items.forEach((li: any) => {
        // Verify FK fields are null when no department_code provided
        expect(li.department_id).toBeNull();
        expect(li.department_code).toBeNull();
        // Verify other fields are still populated
        expect(li.sku).toBe("TEST-NO-DEPT-001");
        expect(li.name).toBe("No Department Product");
        expect(Number(li.quantity)).toBe(1);
        expect(Number(li.unit_price)).toBe(subtotal);
        // Verify tax_amount defaults to 0 when not provided
        expect(Number(li.tax_amount)).toBe(0);
      });
    });
  });

  test.describe("P1 - Query Response with FK Fields", () => {
    test("should include tender_type fields in query response", async ({
      corporateAdminApiRequest,
      corporateAdminUser,
      prismaClient,
    }) => {
      // Setup
      const { store, shift } = await createTestStoreAndShift(
        prismaClient,
        corporateAdminUser.company_id,
        corporateAdminUser.user_id,
      );

      // Enterprise-grade: Ensure tender type exists
      const cashTenderType = await ensureSystemTenderType(
        prismaClient,
        "CASH",
        "Cash",
        {
          is_cash_equivalent: true,
          is_electronic: false,
          affects_cash_drawer: true,
        },
      );

      // Create simple transaction for query test
      const subtotal = 40.0;
      const tax = 3.2;
      const total = subtotal + tax;

      // NOTE: Omit cashier_id - worker will use authenticated user's ID
      const payload = {
        store_id: store.store_id,
        shift_id: shift.shift_id,
        subtotal,
        tax,
        discount: 0,
        line_items: [
          {
            sku: "TEST-QUERY-001",
            name: "Query Test Product",
            quantity: 1,
            unit_price: subtotal,
            discount: 0,
          },
        ],
        payments: [{ method: "CASH" as const, amount: total }],
      };

      const createResponse = await corporateAdminApiRequest.post(
        "/api/transactions",
        payload,
      );

      expect(createResponse.status()).toBe(202);

      // Get correlation_id from response to wait for transaction
      const responseBody = await createResponse.json();
      const correlationId = responseBody.data.correlation_id;

      // Wait for worker to process transaction using correlation_id
      const processedTransaction = await waitForTransaction(
        prismaClient,
        correlationId,
      );
      assertTransactionExists(processedTransaction, correlationId);

      // Query transactions with include_payments=true
      const queryResponse = await corporateAdminApiRequest.get(
        `/api/transactions?shift_id=${shift.shift_id}&include_payments=true`,
      );

      expect(queryResponse.status()).toBe(200);

      const data = await queryResponse.json();
      expect(
        data.data.transactions,
        `Expected 1 transaction but got ${data.data.transactions?.length || 0}. ` +
          `Worker may not have processed the transaction.`,
      ).toHaveLength(1);

      const transaction = data.data.transactions[0];
      const payments = transaction.payments;

      // Enterprise-grade: Comprehensive verification of query response
      expect(payments).toBeDefined();
      expect(payments).toHaveLength(1);

      const payment = payments[0];
      // Verify FK fields are included in response
      expect(payment).toHaveProperty("tender_type_id");
      expect(payment).toHaveProperty("tender_code");
      // Verify FK fields have correct values
      expect(payment.tender_type_id).toBe(cashTenderType.tender_type_id);
      expect(payment.tender_code).toBe("CASH");
      // Verify tender_name is populated from join (optional field)
      expect(payment).toHaveProperty("tender_name");
      expect(payment.tender_name).toBe(cashTenderType.display_name);
      // Verify other payment fields
      expect(payment.method).toBe("CASH");
      expect(Number(payment.amount)).toBe(total);
    });

    test("should include department fields in query response", async ({
      corporateAdminApiRequest,
      corporateAdminUser,
      prismaClient,
    }) => {
      // Setup
      const { store, shift } = await createTestStoreAndShift(
        prismaClient,
        corporateAdminUser.company_id,
        corporateAdminUser.user_id,
      );

      // Enterprise-grade: Ensure tender type exists
      await ensureSystemTenderType(prismaClient, "CASH", "Cash", {
        is_cash_equivalent: true,
        is_electronic: false,
        affects_cash_drawer: true,
      });

      // Enterprise-grade: Ensure department exists for this test
      const testDepartment = await ensureSystemDepartment(
        prismaClient,
        "GROCERY",
        "Grocery",
      );

      // Create transaction with line items including department_code
      // NOTE: Omit cashier_id - worker will use authenticated user's ID
      const payload = {
        store_id: store.store_id,
        shift_id: shift.shift_id,
        subtotal: 10.0,
        tax: 0.8,
        discount: 0,
        line_items: [
          {
            sku: "TEST-SKU-002",
            name: "Test Product 2",
            quantity: 1,
            unit_price: 10.0,
            discount: 0,
            tax_amount: 0.8,
            department_code: "GROCERY",
          },
        ],
        payments: [{ method: "CASH" as const, amount: 10.8 }],
      };

      const createResponse = await corporateAdminApiRequest.post(
        "/api/transactions",
        payload,
      );

      expect(createResponse.status()).toBe(202);

      // Get correlation_id from response to wait for transaction
      const responseBody = await createResponse.json();
      const correlationId = responseBody.data.correlation_id;

      // Wait for worker to process transaction using correlation_id
      const processedTransaction = await waitForTransaction(
        prismaClient,
        correlationId,
      );
      assertTransactionExists(processedTransaction, correlationId);

      // Query with include_line_items=true
      const queryResponse = await corporateAdminApiRequest.get(
        `/api/transactions?shift_id=${shift.shift_id}&include_line_items=true`,
      );

      expect(queryResponse.status()).toBe(200);

      const data = await queryResponse.json();
      expect(
        data.data.transactions,
        `Expected 1 transaction but got ${data.data.transactions?.length || 0}. ` +
          `Worker may not have processed the transaction.`,
      ).toHaveLength(1);

      const transaction = data.data.transactions[0];
      const lineItems = transaction.line_items;

      // Enterprise-grade: Comprehensive verification of query response
      expect(lineItems).toBeDefined();
      expect(lineItems).toHaveLength(1);

      const lineItem = lineItems[0];
      // Verify FK fields are included in response
      expect(lineItem).toHaveProperty("department_id");
      expect(lineItem).toHaveProperty("department_code");
      expect(lineItem).toHaveProperty("tax_amount");
      // Verify FK fields have correct values
      expect(lineItem.department_id).toBe(testDepartment.department_id);
      expect(lineItem.department_code).toBe("GROCERY");
      // Verify department_name is populated from join (optional field)
      expect(lineItem).toHaveProperty("department_name");
      expect(lineItem.department_name).toBe(testDepartment.display_name);
      // Verify tax_amount is included
      expect(Number(lineItem.tax_amount)).toBe(0.8);
      // Verify other line item fields
      expect(lineItem.sku).toBe("TEST-SKU-002");
      expect(lineItem.name).toBe("Test Product 2");
      expect(Number(lineItem.quantity)).toBe(1);
      expect(Number(lineItem.unit_price)).toBe(10.0);
    });
  });

  test.describe("P2 - Tax Amount Per Line Item", () => {
    test("should store and return tax_amount per line item", async ({
      corporateAdminApiRequest,
      corporateAdminUser,
      prismaClient,
    }) => {
      const { store, shift } = await createTestStoreAndShift(
        prismaClient,
        corporateAdminUser.company_id,
        corporateAdminUser.user_id,
      );

      // Enterprise-grade: Ensure tender type exists
      await ensureSystemTenderType(prismaClient, "CASH", "Cash", {
        is_cash_equivalent: true,
        is_electronic: false,
        affects_cash_drawer: true,
      });

      // Create transaction with specific tax amounts per line item
      // NOTE: Omit cashier_id - worker will use authenticated user's ID
      const payload = {
        store_id: store.store_id,
        shift_id: shift.shift_id,
        subtotal: 25.0,
        tax: 2.0,
        discount: 0,
        line_items: [
          {
            sku: "SKU-A",
            name: "Product A",
            quantity: 1,
            unit_price: 10.0,
            discount: 0,
            tax_amount: 0.8,
          },
          {
            sku: "SKU-B",
            name: "Product B",
            quantity: 1,
            unit_price: 15.0,
            discount: 0,
            tax_amount: 1.2,
          },
        ],
        payments: [{ method: "CASH" as const, amount: 27.0 }],
      };

      const response = await corporateAdminApiRequest.post(
        "/api/transactions",
        payload,
      );
      expect(response.status()).toBe(202);

      // Get correlation_id from response to wait for transaction
      const responseBody = await response.json();
      const correlationId = responseBody.data.correlation_id;

      // Wait for worker to process transaction using correlation_id
      const transaction = await waitForTransaction(prismaClient, correlationId);

      // Enterprise-grade: Comprehensive verification
      assertTransactionExists(transaction, correlationId);
      expect(transaction?.line_items).toHaveLength(2);

      // Sort line items by SKU for predictable order
      const sortedLineItems = [...transaction.line_items].sort(
        (a: any, b: any) => a.sku.localeCompare(b.sku),
      );

      // Verify tax amounts stored correctly per line item
      expect(Number(sortedLineItems[0]?.tax_amount)).toBe(0.8);
      expect(Number(sortedLineItems[1]?.tax_amount)).toBe(1.2);
      // Verify tax amounts sum to transaction tax (0.8 + 1.2 = 2.0)
      const totalTaxFromLineItems = sortedLineItems.reduce(
        (sum, li) => sum + Number(li.tax_amount),
        0,
      );
      expect(totalTaxFromLineItems).toBe(2.0);
      expect(Number(transaction.tax)).toBe(2.0);
    });
  });

  test.describe("P2 - Edge Cases and Security", () => {
    test("should handle invalid department_id gracefully", async ({
      corporateAdminApiRequest,
      corporateAdminUser,
      prismaClient,
    }) => {
      const { store, shift } = await createTestStoreAndShift(
        prismaClient,
        corporateAdminUser.company_id,
        corporateAdminUser.user_id,
      );

      // Ensure CASH tender type exists
      await ensureSystemTenderType(prismaClient, "CASH", "Cash", {
        is_cash_equivalent: true,
        is_electronic: false,
        affects_cash_drawer: true,
      });

      // Create transaction with invalid department_id (non-existent UUID)
      const invalidDepartmentId = "00000000-0000-0000-0000-000000000000";
      const subtotal = 20.0;
      const tax = 1.6;
      const total = subtotal + tax;

      const payload = {
        store_id: store.store_id,
        shift_id: shift.shift_id,
        subtotal,
        tax,
        discount: 0,
        line_items: [
          {
            sku: "TEST-INVALID-DEPT-ID",
            name: "Invalid Department ID Product",
            quantity: 1,
            unit_price: subtotal,
            discount: 0,
            department_id: invalidDepartmentId, // Invalid/non-existent ID
          },
        ],
        payments: [{ method: "CASH" as const, amount: total }],
      };

      const response = await corporateAdminApiRequest.post(
        "/api/transactions",
        payload,
      );

      // Enterprise-grade: Transaction should still be accepted (graceful degradation)
      expect(response.status()).toBe(202);

      const responseBody = await response.json();
      const correlationId = responseBody.data.correlation_id;

      const transaction = await waitForTransaction(prismaClient, correlationId);

      // Enterprise-grade: Verify graceful degradation
      assertTransactionExists(transaction, correlationId);
      expect(transaction?.line_items).toHaveLength(1);

      const lineItem = transaction?.line_items[0];
      // Invalid department_id should result in null FK fields
      expect(lineItem?.department_id).toBeNull();
      expect(lineItem?.department_code).toBeNull();
      // Verify other fields are still populated
      expect(lineItem?.sku).toBe("TEST-INVALID-DEPT-ID");
    });

    test("should handle conflicting tender_code and method", async ({
      corporateAdminApiRequest,
      corporateAdminUser,
      prismaClient,
    }) => {
      const { store, shift } = await createTestStoreAndShift(
        prismaClient,
        corporateAdminUser.company_id,
        corporateAdminUser.user_id,
      );

      // Ensure both tender types exist
      const cashTenderType = await ensureSystemTenderType(
        prismaClient,
        "CASH",
        "Cash",
        {
          is_cash_equivalent: true,
          is_electronic: false,
          affects_cash_drawer: true,
        },
      );
      const creditTenderType = await ensureSystemTenderType(
        prismaClient,
        "CREDIT",
        "Credit Card",
        {
          is_cash_equivalent: false,
          is_electronic: true,
          affects_cash_drawer: false,
        },
      );

      // Create transaction with method="CASH" but tender_code="CREDIT"
      // Enterprise-grade: tender_code should take precedence per implementation
      const subtotal = 30.0;
      const tax = 2.4;
      const total = subtotal + tax;

      const payload = {
        store_id: store.store_id,
        shift_id: shift.shift_id,
        subtotal,
        tax,
        discount: 0,
        line_items: [
          {
            sku: "TEST-CONFLICT-001",
            name: "Conflict Test Product",
            quantity: 1,
            unit_price: subtotal,
            discount: 0,
          },
        ],
        payments: [
          {
            method: "CASH" as const, // Method is CASH
            amount: total,
            tender_code: "CREDIT", // But tender_code is CREDIT (should take precedence)
          },
        ],
      };

      const response = await corporateAdminApiRequest.post(
        "/api/transactions",
        payload,
      );

      expect(response.status()).toBe(202);

      const responseBody = await response.json();
      const correlationId = responseBody.data.correlation_id;

      const transaction = await waitForTransaction(prismaClient, correlationId);

      // Enterprise-grade: Verify tender_code takes precedence
      assertTransactionExists(transaction, correlationId);
      expect(transaction?.payments).toHaveLength(1);

      const payment = transaction?.payments[0];
      // tender_code should take precedence over method
      expect(payment?.tender_type_id).toBe(creditTenderType.tender_type_id);
      expect(payment?.tender_code).toBe("CREDIT");
      // method field should still reflect what was sent (backward compatibility)
      expect(payment?.method).toBe("CASH");
    });

    test("should handle multiple payments with different tender types", async ({
      corporateAdminApiRequest,
      corporateAdminUser,
      prismaClient,
    }) => {
      const { store, shift } = await createTestStoreAndShift(
        prismaClient,
        corporateAdminUser.company_id,
        corporateAdminUser.user_id,
      );

      // Ensure both tender types exist
      const cashTenderType = await ensureSystemTenderType(
        prismaClient,
        "CASH",
        "Cash",
        {
          is_cash_equivalent: true,
          is_electronic: false,
          affects_cash_drawer: true,
        },
      );
      const creditTenderType = await ensureSystemTenderType(
        prismaClient,
        "CREDIT",
        "Credit Card",
        {
          is_cash_equivalent: false,
          is_electronic: true,
          affects_cash_drawer: false,
        },
      );

      // Create transaction with split payment (cash + credit)
      const subtotal = 100.0;
      const tax = 8.0;
      const total = subtotal + tax;
      const cashAmount = 50.0;
      const creditAmount = total - cashAmount;

      const payload = {
        store_id: store.store_id,
        shift_id: shift.shift_id,
        subtotal,
        tax,
        discount: 0,
        line_items: [
          {
            sku: "TEST-SPLIT-001",
            name: "Split Payment Product",
            quantity: 1,
            unit_price: subtotal,
            discount: 0,
          },
        ],
        payments: [
          { method: "CASH" as const, amount: cashAmount },
          { method: "CREDIT" as const, amount: creditAmount },
        ],
      };

      const response = await corporateAdminApiRequest.post(
        "/api/transactions",
        payload,
      );

      expect(response.status()).toBe(202);

      const responseBody = await response.json();
      const correlationId = responseBody.data.correlation_id;

      const transaction = await waitForTransaction(prismaClient, correlationId);

      // Enterprise-grade: Verify both payments have correct FK resolution
      assertTransactionExists(transaction, correlationId);
      expect(transaction?.payments).toHaveLength(2);

      // Sort payments by method for predictable order
      const sortedPayments = [...transaction.payments].sort((a: any, b: any) =>
        a.method.localeCompare(b.method),
      );

      const cashPayment = sortedPayments.find((p: any) => p.method === "CASH");
      const creditPayment = sortedPayments.find(
        (p: any) => p.method === "CREDIT",
      );

      // Verify CASH payment FK resolution
      expect(cashPayment?.tender_type_id).toBe(cashTenderType.tender_type_id);
      expect(cashPayment?.tender_code).toBe("CASH");
      expect(Number(cashPayment?.amount)).toBe(cashAmount);

      // Verify CREDIT payment FK resolution
      expect(creditPayment?.tender_type_id).toBe(
        creditTenderType.tender_type_id,
      );
      expect(creditPayment?.tender_code).toBe("CREDIT");
      expect(Number(creditPayment?.amount)).toBe(creditAmount);
    });
  });
});
