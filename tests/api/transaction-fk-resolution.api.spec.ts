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

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const transaction = await prismaClient.transaction.findUnique({
        where: { transaction_id: transactionId },
        include: {
          payments: true,
          line_items: true,
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

// Skip tests if worker is not running - set WORKER_RUNNING=true to enable
const workerRunning = process.env.WORKER_RUNNING === "true";

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

      // Ensure tender type exists for CASH (should be seeded)
      const cashTenderType = await prismaClient.tenderType.findFirst({
        where: { code: "CASH", is_active: true },
      });

      // Skip if no tender types seeded
      if (!cashTenderType) {
        test.skip();
        return;
      }

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

      // Verify FK fields were populated
      expect(transaction).not.toBeNull();
      expect(transaction?.payments).toHaveLength(1);

      const payment = transaction?.payments[0];
      expect(payment?.tender_type_id).toBe(cashTenderType.tender_type_id);
      expect(payment?.tender_code).toBe("CASH");
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

      // Ensure tender type exists for CREDIT (should be seeded)
      const creditTenderType = await prismaClient.tenderType.findFirst({
        where: { code: "CREDIT", is_active: true },
      });

      if (!creditTenderType) {
        test.skip();
        return;
      }

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
            tender_code: "CREDIT",
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

      const payment = transaction?.payments[0];
      expect(payment?.tender_type_id).toBe(creditTenderType.tender_type_id);
      expect(payment?.tender_code).toBe("CREDIT");
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

      // Create simple transaction with OTHER method (which may not have a tender type seeded)
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
        payments: [{ method: "OTHER" as const, amount: total }],
      };

      const response = await corporateAdminApiRequest.post(
        "/api/transactions",
        payload,
      );

      // Transaction should still be accepted (202)
      expect(response.status()).toBe(202);

      // Get correlation_id from response to wait for transaction
      const responseBody = await response.json();
      const correlationId = responseBody.data.correlation_id;

      // Wait for worker to process transaction using correlation_id
      const transaction = await waitForTransaction(prismaClient, correlationId);

      // Transaction should exist even if tender type wasn't resolved
      // FK resolution failure should NOT block transaction creation
      expect(transaction).not.toBeNull();

      // Payment should exist but tender_type_id may be null
      expect(transaction?.payments).toHaveLength(1);
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

      // Find or create a test department (GROCERY should be seeded as system dept)
      let testDepartment = await prismaClient.department.findFirst({
        where: { code: "GROCERY", is_active: true },
      });

      if (!testDepartment) {
        testDepartment = await prismaClient.department.create({
          data: {
            code: "GROCERY",
            display_name: "Grocery",
            description: "Test grocery department",
            is_active: true,
            is_system: true,
          },
        });
      }

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

      expect(transaction).not.toBeNull();
      expect(transaction?.line_items).toHaveLength(1);

      const lineItem = transaction?.line_items[0];
      expect(lineItem?.department_id).toBe(testDepartment.department_id);
      expect(lineItem?.department_code).toBe("GROCERY");
      expect(Number(lineItem?.tax_amount)).toBe(0.8);
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
            // No department_code specified
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

      // Verify line items have null department (no department_code was provided)
      expect(transaction).not.toBeNull();
      transaction?.line_items.forEach((li: any) => {
        expect(li.department_id).toBeNull();
        expect(li.department_code).toBeNull();
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
      await waitForTransaction(prismaClient, correlationId);

      // Query transactions with include_payments=true
      const queryResponse = await corporateAdminApiRequest.get(
        `/api/transactions?shift_id=${shift.shift_id}&include_payments=true`,
      );

      expect(queryResponse.status()).toBe(200);

      const data = await queryResponse.json();
      expect(data.data.transactions).toHaveLength(1);

      const payments = data.data.transactions[0].payments;
      expect(payments).toBeDefined();
      expect(payments[0]).toHaveProperty("tender_type_id");
      expect(payments[0]).toHaveProperty("tender_code");
      // tender_name is optional (populated from join if available)
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

      // Create transaction with line items (no department_code specified)
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
      await waitForTransaction(prismaClient, correlationId);

      // Query with include_line_items=true
      const queryResponse = await corporateAdminApiRequest.get(
        `/api/transactions?shift_id=${shift.shift_id}&include_line_items=true`,
      );

      expect(queryResponse.status()).toBe(200);

      const data = await queryResponse.json();
      expect(data.data.transactions).toHaveLength(1);

      const lineItems = data.data.transactions[0].line_items;
      expect(lineItems).toBeDefined();
      // These fields should exist in the response even if null
      expect(lineItems[0]).toHaveProperty("department_id");
      expect(lineItems[0]).toHaveProperty("department_code");
      expect(lineItems[0]).toHaveProperty("tax_amount");
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

      // Verify tax amounts stored correctly
      expect(transaction?.line_items).toHaveLength(2);

      // Sort line items by SKU for predictable order
      const sortedLineItems = [...transaction.line_items].sort(
        (a: any, b: any) => a.sku.localeCompare(b.sku),
      );

      expect(Number(sortedLineItems[0]?.tax_amount)).toBe(0.8);
      expect(Number(sortedLineItems[1]?.tax_amount)).toBe(1.2);
    });
  });
});
