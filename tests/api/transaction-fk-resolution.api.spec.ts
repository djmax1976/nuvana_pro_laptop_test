import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createTransactionPayload,
  createStore,
  createCashier,
} from "../support/factories";

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
 */

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Creates a test store and open shift for transaction testing
 */
async function createTestStoreAndShift(
  prismaClient: any,
  companyId: string,
  createdByUserId: string,
) {
  const store = await prismaClient.store.create({
    data: createStore({
      company_id: companyId,
      name: `FK Test Store ${Date.now()}`,
      timezone: "America/New_York",
      status: "ACTIVE",
    }),
  });

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

// =============================================================================
// TEST SUITES
// =============================================================================

test.describe("Phase 1.5: Transaction FK Resolution", () => {
  test.describe("P1 - Tender Type FK Resolution", () => {
    test("should populate tender_type_id and tender_code from payment method", async ({
      authenticatedApiRequest,
      authenticatedUser,
    }) => {
      const { prisma, company, user } = authenticatedUser;

      // Setup
      const { store, cashier, shift } = await createTestStoreAndShift(
        prisma,
        company.company_id,
        user.user_id,
      );

      // Ensure tender type exists for CASH
      const cashTenderType = await prisma.tenderType.findFirst({
        where: { code: "CASH", is_active: true },
      });

      // Skip if no tender types seeded
      if (!cashTenderType) {
        test.skip();
        return;
      }

      // Create transaction with CASH payment
      const payload = createTransactionPayload({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: cashier.cashier_id,
        payments: [{ method: "CASH", amount: 100.0 }],
      });

      const response = await authenticatedApiRequest.post("/api/transactions", {
        data: payload,
      });

      expect(response.status()).toBe(202);

      // Wait for worker to process (adjust timeout as needed)
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Query the created transaction
      const transaction = await prisma.transaction.findFirst({
        where: { shift_id: shift.shift_id },
        include: {
          payments: true,
        },
        orderBy: { created_at: "desc" },
      });

      // Verify FK fields were populated
      expect(transaction).not.toBeNull();
      expect(transaction?.payments).toHaveLength(1);

      const payment = transaction?.payments[0];
      expect(payment?.tender_type_id).toBe(cashTenderType.tender_type_id);
      expect(payment?.tender_code).toBe("CASH");
    });

    test("should use tender_code from payload when explicitly provided", async ({
      authenticatedApiRequest,
      authenticatedUser,
    }) => {
      const { prisma, company, user } = authenticatedUser;

      // Setup
      const { store, cashier, shift } = await createTestStoreAndShift(
        prisma,
        company.company_id,
        user.user_id,
      );

      // Ensure tender type exists for CREDIT
      const creditTenderType = await prisma.tenderType.findFirst({
        where: { code: "CREDIT", is_active: true },
      });

      if (!creditTenderType) {
        test.skip();
        return;
      }

      // Create transaction with explicit tender_code
      const payload = {
        ...createTransactionPayload({
          store_id: store.store_id,
          shift_id: shift.shift_id,
          cashier_id: cashier.cashier_id,
        }),
        payments: [
          {
            method: "CREDIT" as const,
            amount: 100.0,
            tender_code: "CREDIT",
            reference: "1234",
          },
        ],
      };

      const response = await authenticatedApiRequest.post("/api/transactions", {
        data: payload,
      });

      expect(response.status()).toBe(202);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verify
      const transaction = await prisma.transaction.findFirst({
        where: { shift_id: shift.shift_id },
        include: { payments: true },
        orderBy: { created_at: "desc" },
      });

      const payment = transaction?.payments[0];
      expect(payment?.tender_type_id).toBe(creditTenderType.tender_type_id);
      expect(payment?.tender_code).toBe("CREDIT");
    });

    test("should handle unknown tender_code gracefully", async ({
      authenticatedApiRequest,
      authenticatedUser,
    }) => {
      const { prisma, company, user } = authenticatedUser;

      const { store, cashier, shift } = await createTestStoreAndShift(
        prisma,
        company.company_id,
        user.user_id,
      );

      // Create transaction with valid method but unknown tender_code
      const payload = createTransactionPayload({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: cashier.cashier_id,
        payments: [{ method: "OTHER", amount: 100.0 }],
      });

      const response = await authenticatedApiRequest.post("/api/transactions", {
        data: payload,
      });

      // Transaction should still be accepted (202)
      expect(response.status()).toBe(202);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Check if transaction was created (FK resolution failure should not block transaction)
      const transaction = await prisma.transaction.findFirst({
        where: { shift_id: shift.shift_id },
        include: { payments: true },
        orderBy: { created_at: "desc" },
      });

      // Transaction should exist even if tender type wasn't resolved
      expect(transaction).not.toBeNull();
    });
  });

  test.describe("P1 - Department FK Resolution", () => {
    test("should populate department_id and department_code from line item", async ({
      authenticatedApiRequest,
      authenticatedUser,
    }) => {
      const { prisma, company, user } = authenticatedUser;

      // Setup
      const { store, cashier, shift } = await createTestStoreAndShift(
        prisma,
        company.company_id,
        user.user_id,
      );

      // Find or create a test department
      let testDepartment = await prisma.department.findFirst({
        where: { code: "GROCERY", is_active: true },
      });

      if (!testDepartment) {
        testDepartment = await prisma.department.create({
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
      const payload = {
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: cashier.cashier_id,
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

      const response = await authenticatedApiRequest.post("/api/transactions", {
        data: payload,
      });

      expect(response.status()).toBe(202);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verify
      const transaction = await prisma.transaction.findFirst({
        where: { shift_id: shift.shift_id },
        include: { line_items: true },
        orderBy: { created_at: "desc" },
      });

      expect(transaction).not.toBeNull();
      expect(transaction?.line_items).toHaveLength(1);

      const lineItem = transaction?.line_items[0];
      expect(lineItem?.department_id).toBe(testDepartment.department_id);
      expect(lineItem?.department_code).toBe("GROCERY");
      expect(Number(lineItem?.tax_amount)).toBe(0.8);
    });

    test("should allow line items without department_code", async ({
      authenticatedApiRequest,
      authenticatedUser,
    }) => {
      const { prisma, company, user } = authenticatedUser;

      const { store, cashier, shift } = await createTestStoreAndShift(
        prisma,
        company.company_id,
        user.user_id,
      );

      // Create transaction without department_code
      const payload = createTransactionPayload({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: cashier.cashier_id,
      });

      const response = await authenticatedApiRequest.post("/api/transactions", {
        data: payload,
      });

      expect(response.status()).toBe(202);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verify line items have null department
      const transaction = await prisma.transaction.findFirst({
        where: { shift_id: shift.shift_id },
        include: { line_items: true },
        orderBy: { created_at: "desc" },
      });

      expect(transaction).not.toBeNull();
      transaction?.line_items.forEach((li: any) => {
        expect(li.department_id).toBeNull();
        expect(li.department_code).toBeNull();
      });
    });
  });

  test.describe("P1 - Query Response with FK Fields", () => {
    test("should include tender_type fields in query response", async ({
      authenticatedApiRequest,
      authenticatedUser,
    }) => {
      const { prisma, company, user } = authenticatedUser;

      // Setup
      const { store, cashier, shift } = await createTestStoreAndShift(
        prisma,
        company.company_id,
        user.user_id,
      );

      // Create and wait for transaction
      const payload = createTransactionPayload({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: cashier.cashier_id,
        payments: [{ method: "CASH", amount: 100.0 }],
      });

      await authenticatedApiRequest.post("/api/transactions", {
        data: payload,
      });
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Query transactions with include_payments=true
      const queryResponse = await authenticatedApiRequest.get(
        `/api/transactions?shift_id=${shift.shift_id}&include_payments=true`,
      );

      expect(queryResponse.status()).toBe(200);

      const data = await queryResponse.json();
      expect(data.transactions).toHaveLength(1);

      const payments = data.transactions[0].payments;
      expect(payments).toBeDefined();
      expect(payments[0]).toHaveProperty("tender_type_id");
      expect(payments[0]).toHaveProperty("tender_code");
      // tender_name is optional (populated from join)
    });

    test("should include department fields in query response", async ({
      authenticatedApiRequest,
      authenticatedUser,
    }) => {
      const { prisma, company, user } = authenticatedUser;

      // Setup
      const { store, cashier, shift } = await createTestStoreAndShift(
        prisma,
        company.company_id,
        user.user_id,
      );

      // Create transaction with department
      const payload = {
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: cashier.cashier_id,
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

      await authenticatedApiRequest.post("/api/transactions", {
        data: payload,
      });
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Query with include_line_items=true
      const queryResponse = await authenticatedApiRequest.get(
        `/api/transactions?shift_id=${shift.shift_id}&include_line_items=true`,
      );

      expect(queryResponse.status()).toBe(200);

      const data = await queryResponse.json();
      expect(data.transactions).toHaveLength(1);

      const lineItems = data.transactions[0].line_items;
      expect(lineItems).toBeDefined();
      expect(lineItems[0]).toHaveProperty("department_id");
      expect(lineItems[0]).toHaveProperty("department_code");
      expect(lineItems[0]).toHaveProperty("tax_amount");
    });
  });

  test.describe("P2 - Tax Amount Per Line Item", () => {
    test("should store and return tax_amount per line item", async ({
      authenticatedApiRequest,
      authenticatedUser,
    }) => {
      const { prisma, company, user } = authenticatedUser;

      const { store, cashier, shift } = await createTestStoreAndShift(
        prisma,
        company.company_id,
        user.user_id,
      );

      // Create transaction with specific tax amounts per line item
      const payload = {
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: cashier.cashier_id,
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

      const response = await authenticatedApiRequest.post("/api/transactions", {
        data: payload,
      });
      expect(response.status()).toBe(202);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verify tax amounts stored correctly
      const transaction = await prisma.transaction.findFirst({
        where: { shift_id: shift.shift_id },
        include: { line_items: { orderBy: { sku: "asc" } } },
        orderBy: { created_at: "desc" },
      });

      expect(transaction?.line_items).toHaveLength(2);
      expect(Number(transaction?.line_items[0]?.tax_amount)).toBe(0.8);
      expect(Number(transaction?.line_items[1]?.tax_amount)).toBe(1.2);
    });
  });
});
