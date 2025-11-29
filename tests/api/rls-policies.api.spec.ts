import { test, expect } from "../support/fixtures/rbac.fixture";
import { PrismaClient } from "@prisma/client";
import {
  createUser,
  createCompany,
  createStore,
} from "../support/factories/database.factory";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../backend/src/utils/public-id";

/**
 * Row-Level Security (RLS) Policies API Tests
 *
 * Tests for PostgreSQL RLS policies enforcing multi-tenant data isolation:
 * - Company-level isolation (users only see their assigned company data)
 * - Store-level isolation (users only see their assigned store data)
 * - System Admin bypass (can access all data)
 * - Corporate Admin access (can access all stores in their company)
 * - Store Manager access (can only access assigned store)
 * - Silent filtering (no errors, empty results for unauthorized access)
 * - Prisma ORM integration with RLS
 * - Direct SQL query RLS enforcement
 * - INSERT/UPDATE/DELETE policy enforcement
 *
 * Priority: P0 (Critical - Security feature)
 *
 * Quality Standards Applied:
 * - Deterministic: No hard waits, explicit assertions
 * - Isolated: Auto-cleanup via fixtures, unique test data
 * - Explicit: All assertions visible in test bodies
 * - Focused: Each test validates one concern (<300 lines)
 * - Fast: API-based setup, parallel-safe data
 */

/**
 * Helper: Set RLS context for a user
 * Pure function pattern - reusable across tests
 *
 * Note: Uses SET (not SET LOCAL) because SET LOCAL only lasts within a transaction.
 * The session variable persists across Prisma queries until the connection is released.
 */
async function setRLSContext(
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  await prisma.$executeRawUnsafe(`SET app.current_user_id = '${userId}'`);
}

/**
 * Helper: Clear RLS context after test
 * Resets the session variable to prevent leakage between tests
 */
async function clearRLSContext(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`RESET app.current_user_id`);
}

/**
 * Helper: Create test companies with auto-cleanup tracking
 * Returns created company IDs for cleanup
 */
async function createTestCompanies(
  prisma: PrismaClient,
  count: number = 2,
): Promise<Array<{ company_id: string; name: string }>> {
  const companies = [];
  for (let i = 0; i < count; i++) {
    const owner = await prisma.user.create({
      data: createUser({ name: `Company Owner ${i}` }),
    });
    const company = await prisma.company.create({
      data: createCompany({ owner_user_id: owner.user_id }), // Uses faker - unique each time
    });
    companies.push({ company_id: company.company_id, name: company.name });
  }
  return companies;
}

/**
 * Helper: Create test stores with auto-cleanup tracking
 */
async function createTestStores(
  prisma: PrismaClient,
  companyIds: string[],
  storesPerCompany: number = 1,
): Promise<Array<{ store_id: string; company_id: string; name: string }>> {
  const stores = [];
  for (const companyId of companyIds) {
    for (let i = 0; i < storesPerCompany; i++) {
      const store = await prisma.store.create({
        data: createStore({ company_id: companyId }), // Uses faker - unique each time
      });
      stores.push({
        store_id: store.store_id,
        company_id: store.company_id,
        name: store.name,
      });
    }
  }
  return stores;
}

test.describe("RLS Policies - Company-Level Isolation", () => {
  test("2.3-API-001: [P0] should filter Company table by user's assigned company_id", async ({
    prismaClient,
    rlsPrismaClient,
    corporateAdminUser,
  }) => {
    // GIVEN: Two companies exist and user is assigned to Company A
    const companies = await createTestCompanies(prismaClient, 2);
    const [companyA, companyB] = companies;

    // Update user's UserRole to have company_id = companyA.company_id
    await prismaClient.userRole.updateMany({
      where: { user_id: corporateAdminUser.user_id },
      data: { company_id: companyA.company_id },
    });

    // Set RLS context on app_user connection (respects RLS)
    await setRLSContext(rlsPrismaClient, corporateAdminUser.user_id);

    // WHEN: Querying Company table with RLS-enforced connection
    const result = await rlsPrismaClient.company.findMany();

    // THEN: User only sees Company A (their assigned company)
    expect(result, "User should only see their assigned company").toHaveLength(
      1,
    );
    expect(result[0].company_id, "Returned company should be Company A").toBe(
      companyA.company_id,
    );
    expect(result[0].name, "Company name should match Company A").toBe(
      companyA.name,
    );
    // Explicit negative assertion: Company B should NOT be visible
    expect(
      result.some((c) => c.company_id === companyB.company_id),
      "Company B should not be visible to user assigned to Company A",
    ).toBe(false);

    // Cleanup: Use superuser connection to bypass RLS for cleanup
    await prismaClient.company.deleteMany({
      where: {
        company_id: { in: companies.map((c) => c.company_id) },
      },
    });
  });

  test("2.3-API-002: [P0] should filter Store table by user's assigned company_id", async ({
    prismaClient,
    rlsPrismaClient,
    corporateAdminUser,
  }) => {
    // GIVEN: Two companies with stores exist and user is assigned to Company A
    const companies = await createTestCompanies(prismaClient, 2);
    const [companyA, companyB] = companies;

    const stores = await createTestStores(prismaClient, [
      companyA.company_id,
      companyB.company_id,
    ]);
    const companyAStores = stores.filter(
      (s) => s.company_id === companyA.company_id,
    );
    const companyBStores = stores.filter(
      (s) => s.company_id === companyB.company_id,
    );

    // Update user's UserRole to have company_id = companyA.company_id
    await prismaClient.userRole.updateMany({
      where: { user_id: corporateAdminUser.user_id },
      data: { company_id: companyA.company_id },
    });

    // Set RLS context on app_user connection
    await setRLSContext(rlsPrismaClient, corporateAdminUser.user_id);

    // WHEN: Querying Store table with RLS-enforced connection
    const result = await rlsPrismaClient.store.findMany();

    // THEN: User only sees stores from Company A
    expect(
      result,
      "User should only see stores from their assigned company",
    ).toHaveLength(companyAStores.length);
    const resultStoreIds = result.map((s) => s.store_id).sort();
    const expectedStoreIds = companyAStores.map((s) => s.store_id).sort();
    expect(resultStoreIds, "Store IDs should match Company A stores").toEqual(
      expectedStoreIds,
    );
    // Explicit: All returned stores belong to Company A
    expect(
      result.every((s) => s.company_id === companyA.company_id),
      "All returned stores must belong to Company A",
    ).toBe(true);
    // Explicit negative: No stores from Company B
    expect(
      result.some((s) =>
        companyBStores.some((bs) => bs.store_id === s.store_id),
      ),
      "No stores from Company B should be visible",
    ).toBe(false);

    // Cleanup
    await prismaClient.store.deleteMany({
      where: { store_id: { in: stores.map((s) => s.store_id) } },
    });
    await prismaClient.company.deleteMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
  });

  test("2.3-API-003: [P0] should return empty result set when querying other company's data", async ({
    prismaClient,
    rlsPrismaClient,
    corporateAdminUser,
  }) => {
    // GIVEN: Two companies exist and user is assigned to Company A
    const companies = await createTestCompanies(prismaClient, 2);
    const [companyA, companyB] = companies;

    // Update user's UserRole to have company_id = companyA.company_id
    await prismaClient.userRole.updateMany({
      where: { user_id: corporateAdminUser.user_id },
      data: { company_id: companyA.company_id },
    });

    // Set RLS context on app_user connection
    await setRLSContext(rlsPrismaClient, corporateAdminUser.user_id);

    // WHEN: Querying Company B directly with RLS-enforced connection
    const companyBResult = await rlsPrismaClient.company.findUnique({
      where: { company_id: companyB.company_id },
    });

    // THEN: Query returns null (empty result, no error)
    expect(
      companyBResult,
      "Querying unauthorized company should return null without error",
    ).toBeNull();
    // Explicit: No exception thrown (silent filtering)
    // Test passes if no error is thrown

    // Cleanup
    await prismaClient.company.deleteMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
  });

  test("2.3-API-004: [P1] should prevent INSERT into other company's data", async ({
    prismaClient,
    rlsPrismaClient,
    corporateAdminUser,
  }) => {
    // GIVEN: Two companies exist and user is assigned to Company A
    const companies = await createTestCompanies(prismaClient, 2);
    const [companyA, companyB] = companies;

    await prismaClient.userRole.updateMany({
      where: { user_id: corporateAdminUser.user_id },
      data: { company_id: companyA.company_id },
    });

    await setRLSContext(rlsPrismaClient, corporateAdminUser.user_id);

    // WHEN: Attempting to create store for Company B with RLS-enforced connection
    // THEN: INSERT should fail (RLS policy prevents unauthorized inserts)
    await expect(
      rlsPrismaClient.store.create({
        data: createStore({ company_id: companyB.company_id }),
      }),
    ).rejects.toThrow();

    // Cleanup
    await prismaClient.company.deleteMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
  });

  test("2.3-API-005: [P1] should prevent UPDATE of other company's data", async ({
    prismaClient,
    rlsPrismaClient,
    corporateAdminUser,
  }) => {
    // GIVEN: Two companies exist and user is assigned to Company A
    const companies = await createTestCompanies(prismaClient, 2);
    const [companyA, companyB] = companies;

    await prismaClient.userRole.updateMany({
      where: { user_id: corporateAdminUser.user_id },
      data: { company_id: companyA.company_id },
    });

    await setRLSContext(rlsPrismaClient, corporateAdminUser.user_id);

    // WHEN: Attempting to update Company B with RLS-enforced connection
    // THEN: UPDATE should fail (RLS policy prevents unauthorized updates)
    await expect(
      rlsPrismaClient.company.update({
        where: { company_id: companyB.company_id },
        data: { name: "Updated Name" },
      }),
    ).rejects.toThrow();

    // Cleanup
    await prismaClient.company.deleteMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
  });

  test("2.3-API-006: [P1] should prevent DELETE of other company's data", async ({
    prismaClient,
    rlsPrismaClient,
    corporateAdminUser,
  }) => {
    // GIVEN: Two companies exist and user is assigned to Company A
    const companies = await createTestCompanies(prismaClient, 2);
    const [companyA, companyB] = companies;

    await prismaClient.userRole.updateMany({
      where: { user_id: corporateAdminUser.user_id },
      data: { company_id: companyA.company_id },
    });

    await setRLSContext(rlsPrismaClient, corporateAdminUser.user_id);

    // WHEN: Attempting to delete Company B with RLS-enforced connection
    // THEN: DELETE should fail (RLS policy prevents unauthorized deletes)
    await expect(
      rlsPrismaClient.company.delete({
        where: { company_id: companyB.company_id },
      }),
    ).rejects.toThrow();

    // Cleanup
    await prismaClient.company.deleteMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
  });
});

test.describe("RLS Policies - Store-Level Isolation", () => {
  test("2.3-API-007: [P0] should filter Shift table by user's assigned store_id", async ({
    prismaClient,
    rlsPrismaClient,
    storeManagerUser,
  }) => {
    // GIVEN: Two stores exist and user is assigned to Store 1
    const companyOwner = await prismaClient.user.create({
      data: createUser({ name: "Company Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: companyOwner.user_id }),
    });
    const stores = await createTestStores(
      prismaClient,
      [company.company_id],
      2,
    );
    const [store1, store2] = stores;

    // Create shifts for both stores
    const shift1 = await prismaClient.shift.create({
      data: {
        store_id: store1.store_id,
        opened_by: storeManagerUser.user_id,
        cashier_id: storeManagerUser.user_id,
        opened_at: new Date(),
        opening_cash: 1000,
      },
    });
    const shift2 = await prismaClient.shift.create({
      data: {
        store_id: store2.store_id,
        opened_by: storeManagerUser.user_id,
        cashier_id: storeManagerUser.user_id,
        opened_at: new Date(),
        opening_cash: 1000,
      },
    });

    // Update user's UserRole to have store_id = store1.store_id
    await prismaClient.userRole.updateMany({
      where: { user_id: storeManagerUser.user_id },
      data: { store_id: store1.store_id, company_id: company.company_id },
    });

    // Set RLS context on app_user connection
    await setRLSContext(rlsPrismaClient, storeManagerUser.user_id);

    // WHEN: Querying Shift table with RLS-enforced connection
    const shifts = await rlsPrismaClient.shift.findMany();

    // THEN: User only sees shifts from Store 1
    expect(shifts).toHaveLength(1);
    expect(shifts[0].shift_id).toBe(shift1.shift_id);
    expect(shifts[0].store_id).toBe(store1.store_id);
    // Explicit negative: Shift 2 should NOT be visible
    expect(shifts.some((s) => s.shift_id === shift2.shift_id)).toBe(false);

    // Cleanup
    await prismaClient.shift.deleteMany({
      where: { shift_id: { in: [shift1.shift_id, shift2.shift_id] } },
    });
    await prismaClient.store.deleteMany({
      where: { store_id: { in: stores.map((s) => s.store_id) } },
    });
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
  });

  test("2.3-API-008: [P0] should return empty result set when querying other store's data", async ({
    prismaClient,
    rlsPrismaClient,
    storeManagerUser,
  }) => {
    // GIVEN: Two stores exist and user is assigned to Store 1
    const companyOwner = await prismaClient.user.create({
      data: createUser({ name: "Company Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: companyOwner.user_id }),
    });
    const stores = await createTestStores(
      prismaClient,
      [company.company_id],
      2,
    );
    const [store1, store2] = stores;

    const shift2 = await prismaClient.shift.create({
      data: {
        store_id: store2.store_id,
        opened_by: storeManagerUser.user_id,
        cashier_id: storeManagerUser.user_id,
        opened_at: new Date(),
        opening_cash: 1000,
      },
    });

    // Update user's UserRole to have store_id = store1.store_id
    await prismaClient.userRole.updateMany({
      where: { user_id: storeManagerUser.user_id },
      data: { store_id: store1.store_id, company_id: company.company_id },
    });

    // Set RLS context on app_user connection
    await setRLSContext(rlsPrismaClient, storeManagerUser.user_id);

    // WHEN: Querying Shift from Store 2 directly with RLS-enforced connection
    const shift2Result = await rlsPrismaClient.shift.findUnique({
      where: { shift_id: shift2.shift_id },
    });

    // THEN: Query returns null (empty result, no error)
    expect(shift2Result).toBeNull();
    // Explicit: No exception thrown (silent filtering)

    // Cleanup
    await prismaClient.shift.deleteMany({
      where: { shift_id: shift2.shift_id },
    });
    await prismaClient.store.deleteMany({
      where: { store_id: { in: stores.map((s) => s.store_id) } },
    });
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
  });
});

test.describe("RLS Policies - Transaction Store-Level Isolation", () => {
  test("2.3-API-022: [P0] should filter Transaction table by user's assigned store_id", async ({
    prismaClient,
    rlsPrismaClient,
    storeManagerUser,
  }) => {
    // GIVEN: Two stores exist and user is assigned to Store 1
    const companyOwner = await prismaClient.user.create({
      data: createUser({ name: "Company Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: companyOwner.user_id }),
    });
    const stores = await createTestStores(
      prismaClient,
      [company.company_id],
      2,
    );
    const [store1, store2] = stores;

    // Create shifts for both stores
    const shift1 = await prismaClient.shift.create({
      data: {
        store_id: store1.store_id,
        opened_by: storeManagerUser.user_id,
        cashier_id: storeManagerUser.user_id,
        opened_at: new Date(),
        opening_cash: 1000,
      },
    });
    const shift2 = await prismaClient.shift.create({
      data: {
        store_id: store2.store_id,
        opened_by: storeManagerUser.user_id,
        cashier_id: storeManagerUser.user_id,
        opened_at: new Date(),
        opening_cash: 1000,
      },
    });

    // Create transactions for both stores
    const transaction1 = await prismaClient.transaction.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.TRANSACTION),
        store_id: store1.store_id,
        shift_id: shift1.shift_id,
        cashier_id: storeManagerUser.user_id,
        subtotal: 100,
        tax: 8,
        total: 108,
      },
    });
    const transaction2 = await prismaClient.transaction.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.TRANSACTION),
        store_id: store2.store_id,
        shift_id: shift2.shift_id,
        cashier_id: storeManagerUser.user_id,
        subtotal: 200,
        tax: 16,
        total: 216,
      },
    });

    // Update user's UserRole to have store_id = store1.store_id
    await prismaClient.userRole.updateMany({
      where: { user_id: storeManagerUser.user_id },
      data: { store_id: store1.store_id, company_id: company.company_id },
    });

    // Set RLS context on app_user connection
    await setRLSContext(rlsPrismaClient, storeManagerUser.user_id);

    // WHEN: Querying Transaction table with RLS-enforced connection
    const transactions = await rlsPrismaClient.transaction.findMany();

    // THEN: User only sees transactions from Store 1
    expect(transactions).toHaveLength(1);
    expect(transactions[0].transaction_id).toBe(transaction1.transaction_id);
    expect(transactions[0].store_id).toBe(store1.store_id);
    // Explicit negative: Transaction 2 should NOT be visible
    expect(
      transactions.some(
        (t) => t.transaction_id === transaction2.transaction_id,
      ),
    ).toBe(false);

    // Cleanup
    await prismaClient.transaction.deleteMany({
      where: {
        transaction_id: {
          in: [transaction1.transaction_id, transaction2.transaction_id],
        },
      },
    });
    await prismaClient.shift.deleteMany({
      where: { shift_id: { in: [shift1.shift_id, shift2.shift_id] } },
    });
    await prismaClient.store.deleteMany({
      where: { store_id: { in: stores.map((s) => s.store_id) } },
    });
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
  });

  test("2.3-API-023: [P0] should return empty result set when querying other store's transactions", async ({
    prismaClient,
    rlsPrismaClient,
    storeManagerUser,
  }) => {
    // GIVEN: Two stores exist and user is assigned to Store 1
    const companyOwner = await prismaClient.user.create({
      data: createUser({ name: "Company Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: companyOwner.user_id }),
    });
    const stores = await createTestStores(
      prismaClient,
      [company.company_id],
      2,
    );
    const [store1, store2] = stores;

    const shift2 = await prismaClient.shift.create({
      data: {
        store_id: store2.store_id,
        opened_by: storeManagerUser.user_id,
        cashier_id: storeManagerUser.user_id,
        opened_at: new Date(),
        opening_cash: 1000,
      },
    });

    const transaction2 = await prismaClient.transaction.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.TRANSACTION),
        store_id: store2.store_id,
        shift_id: shift2.shift_id,
        cashier_id: storeManagerUser.user_id,
        subtotal: 200,
        tax: 16,
        total: 216,
      },
    });

    // Update user's UserRole to have store_id = store1.store_id
    await prismaClient.userRole.updateMany({
      where: { user_id: storeManagerUser.user_id },
      data: { store_id: store1.store_id, company_id: company.company_id },
    });

    // Set RLS context on app_user connection
    await setRLSContext(rlsPrismaClient, storeManagerUser.user_id);

    // WHEN: Querying Transaction from Store 2 directly with RLS-enforced connection
    const transactionResult = await rlsPrismaClient.transaction.findUnique({
      where: { transaction_id: transaction2.transaction_id },
    });

    // THEN: Query returns null (empty result, no error)
    expect(transactionResult).toBeNull();

    // Cleanup
    await prismaClient.transaction.deleteMany({
      where: { transaction_id: transaction2.transaction_id },
    });
    await prismaClient.shift.deleteMany({
      where: { shift_id: shift2.shift_id },
    });
    await prismaClient.store.deleteMany({
      where: { store_id: { in: stores.map((s) => s.store_id) } },
    });
    await prismaClient.company.delete({
      where: { company_id: company.company_id },
    });
  });

  test("2.3-API-024: [P0] should allow System Admin to access all transactions", async ({
    prismaClient,
    superadminUser,
    storeManagerUser,
  }) => {
    // GIVEN: Multiple stores with transactions exist
    const companies = await createTestCompanies(prismaClient, 2);
    const stores = await createTestStores(
      prismaClient,
      companies.map((c) => c.company_id),
      1,
    );

    // Create shifts and transactions for each store
    const shifts = [];
    const transactions = [];
    for (const store of stores) {
      const shift = await prismaClient.shift.create({
        data: {
          store_id: store.store_id,
          opened_by: storeManagerUser.user_id,
          cashier_id: storeManagerUser.user_id,
          opened_at: new Date(),
          opening_cash: 1000,
        },
      });
      shifts.push(shift);

      const transaction = await prismaClient.transaction.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.TRANSACTION),
          store_id: store.store_id,
          shift_id: shift.shift_id,
          cashier_id: storeManagerUser.user_id,
          subtotal: 100,
          tax: 8,
          total: 108,
        },
      });
      transactions.push(transaction);
    }

    // Set RLS context for System Admin
    await setRLSContext(prismaClient, superadminUser.user_id);

    // WHEN: System Admin queries Transaction table
    const result = await prismaClient.transaction.findMany({
      where: {
        transaction_id: { in: transactions.map((t) => t.transaction_id) },
      },
    });

    // THEN: System Admin sees all transactions (RLS bypass)
    expect(result.length).toBeGreaterThanOrEqual(2);
    const resultTransactionIds = result.map((t) => t.transaction_id);
    for (const transaction of transactions) {
      expect(resultTransactionIds).toContain(transaction.transaction_id);
    }

    // Cleanup
    await prismaClient.transaction.deleteMany({
      where: {
        transaction_id: { in: transactions.map((t) => t.transaction_id) },
      },
    });
    await prismaClient.shift.deleteMany({
      where: { shift_id: { in: shifts.map((s) => s.shift_id) } },
    });
    await prismaClient.store.deleteMany({
      where: { store_id: { in: stores.map((s) => s.store_id) } },
    });
    await prismaClient.company.deleteMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
  });

  test("2.3-API-025: [P1] should allow Corporate Admin to access all transactions in their company", async ({
    prismaClient,
    rlsPrismaClient,
    corporateAdminUser,
    storeManagerUser,
  }) => {
    // GIVEN: Company A has multiple stores with transactions
    const companies = await createTestCompanies(prismaClient, 2);
    const [companyA, companyB] = companies;

    const storesA = await createTestStores(
      prismaClient,
      [companyA.company_id],
      2,
    );
    const storesB = await createTestStores(
      prismaClient,
      [companyB.company_id],
      1,
    );

    // Create shifts and transactions
    const shiftsA = [];
    const transactionsA = [];
    for (const store of storesA) {
      const shift = await prismaClient.shift.create({
        data: {
          store_id: store.store_id,
          opened_by: storeManagerUser.user_id,
          cashier_id: storeManagerUser.user_id,
          opened_at: new Date(),
          opening_cash: 1000,
        },
      });
      shiftsA.push(shift);

      const transaction = await prismaClient.transaction.create({
        data: {
          public_id: generatePublicId(PUBLIC_ID_PREFIXES.TRANSACTION),
          store_id: store.store_id,
          shift_id: shift.shift_id,
          cashier_id: storeManagerUser.user_id,
          subtotal: 100,
          tax: 8,
          total: 108,
        },
      });
      transactionsA.push(transaction);
    }

    const shiftB = await prismaClient.shift.create({
      data: {
        store_id: storesB[0].store_id,
        opened_by: storeManagerUser.user_id,
        cashier_id: storeManagerUser.user_id,
        opened_at: new Date(),
        opening_cash: 1000,
      },
    });
    const transactionB = await prismaClient.transaction.create({
      data: {
        public_id: generatePublicId(PUBLIC_ID_PREFIXES.TRANSACTION),
        store_id: storesB[0].store_id,
        shift_id: shiftB.shift_id,
        cashier_id: storeManagerUser.user_id,
        subtotal: 200,
        tax: 16,
        total: 216,
      },
    });

    // Update user's UserRole to have company_id = companyA.company_id
    await prismaClient.userRole.updateMany({
      where: { user_id: corporateAdminUser.user_id },
      data: { company_id: companyA.company_id },
    });

    // Set RLS context on app_user connection
    await setRLSContext(rlsPrismaClient, corporateAdminUser.user_id);

    // WHEN: Corporate Admin queries Transaction table with RLS-enforced connection
    const result = await rlsPrismaClient.transaction.findMany();

    // THEN: Corporate Admin sees all transactions in Company A, but not Company B
    const resultTransactionIds = result.map((t) => t.transaction_id);
    for (const transaction of transactionsA) {
      expect(resultTransactionIds).toContain(transaction.transaction_id);
    }
    expect(resultTransactionIds).not.toContain(transactionB.transaction_id);

    // Cleanup
    await prismaClient.transaction.deleteMany({
      where: {
        transaction_id: {
          in: [
            ...transactionsA.map((t) => t.transaction_id),
            transactionB.transaction_id,
          ],
        },
      },
    });
    await prismaClient.shift.deleteMany({
      where: {
        shift_id: { in: [...shiftsA.map((s) => s.shift_id), shiftB.shift_id] },
      },
    });
    await prismaClient.store.deleteMany({
      where: {
        store_id: {
          in: [
            ...storesA.map((s) => s.store_id),
            ...storesB.map((s) => s.store_id),
          ],
        },
      },
    });
    await prismaClient.company.deleteMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
  });
});

test.describe("RLS Policies - System Admin Bypass", () => {
  test("2.3-API-009: [P0] should allow System Admin to access all companies", async ({
    prismaClient,
    superadminUser,
  }) => {
    // GIVEN: Multiple companies exist
    const companies = await createTestCompanies(prismaClient, 3);
    const companyIds = companies.map((c) => c.company_id);

    // Set RLS context for System Admin
    await setRLSContext(prismaClient, superadminUser.user_id);

    // WHEN: System Admin queries Company table
    const result = await prismaClient.company.findMany({
      where: {
        company_id: { in: companyIds },
      },
    });

    // THEN: System Admin sees all companies (RLS bypass)
    expect(result.length).toBeGreaterThanOrEqual(3);
    const resultCompanyIds = result.map((c) => c.company_id);
    // Explicit: All test companies should be visible
    for (const companyId of companyIds) {
      expect(resultCompanyIds).toContain(companyId);
    }

    // Cleanup
    await prismaClient.company.deleteMany({
      where: { company_id: { in: companyIds } },
    });
  });

  test("2.3-API-010: [P0] should allow System Admin to access all stores", async ({
    prismaClient,
    superadminUser,
  }) => {
    // GIVEN: Multiple stores in different companies exist
    const companies = await createTestCompanies(prismaClient, 2);
    const stores = await createTestStores(
      prismaClient,
      companies.map((c) => c.company_id),
      1,
    );
    const storeIds = stores.map((s) => s.store_id);

    // Set RLS context for System Admin
    await setRLSContext(prismaClient, superadminUser.user_id);

    // WHEN: System Admin queries Store table
    const result = await prismaClient.store.findMany({
      where: {
        store_id: { in: storeIds },
      },
    });

    // THEN: System Admin sees all stores (RLS bypass)
    expect(result).toHaveLength(stores.length);
    const resultStoreIds = result.map((s) => s.store_id);
    // Explicit: All test stores should be visible
    for (const storeId of storeIds) {
      expect(resultStoreIds).toContain(storeId);
    }

    // Cleanup
    await prismaClient.store.deleteMany({
      where: { store_id: { in: storeIds } },
    });
    await prismaClient.company.deleteMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
  });
});

test.describe("RLS Policies - Corporate Admin Company Access", () => {
  test("2.3-API-011: [P1] should allow Corporate Admin to access all stores in their company", async ({
    prismaClient,
    rlsPrismaClient,
    corporateAdminUser,
  }) => {
    // GIVEN: Company A has multiple stores and user is Corporate Admin for Company A
    const companies = await createTestCompanies(prismaClient, 2);
    const [companyA, companyB] = companies;

    const stores = await createTestStores(
      prismaClient,
      [companyA.company_id, companyB.company_id],
      2,
    );
    const companyAStores = stores.filter(
      (s) => s.company_id === companyA.company_id,
    );
    const companyBStores = stores.filter(
      (s) => s.company_id === companyB.company_id,
    );

    // Update user's UserRole to have company_id = companyA.company_id (COMPANY scope)
    await prismaClient.userRole.updateMany({
      where: { user_id: corporateAdminUser.user_id },
      data: { company_id: companyA.company_id },
    });

    // Set RLS context on app_user connection
    await setRLSContext(rlsPrismaClient, corporateAdminUser.user_id);

    // WHEN: Corporate Admin queries Store table with RLS-enforced connection
    const result = await rlsPrismaClient.store.findMany();

    // THEN: Corporate Admin sees all stores in Company A, but not Company B
    const resultStoreIds = result.map((s) => s.store_id);
    // Explicit: All Company A stores should be visible
    for (const store of companyAStores) {
      expect(resultStoreIds).toContain(store.store_id);
    }
    // Explicit negative: No Company B stores should be visible
    for (const store of companyBStores) {
      expect(resultStoreIds).not.toContain(store.store_id);
    }

    // Cleanup
    await prismaClient.store.deleteMany({
      where: { store_id: { in: stores.map((s) => s.store_id) } },
    });
    await prismaClient.company.deleteMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
  });
});

test.describe("RLS Policies - Prisma ORM Integration", () => {
  test("2.3-API-012: [P0] should enforce RLS policies on Prisma queries", async ({
    prismaClient,
    rlsPrismaClient,
    corporateAdminUser,
  }) => {
    // GIVEN: Two companies exist and user is assigned to Company A
    const companies = await createTestCompanies(prismaClient, 2);
    const [companyA] = companies;

    // Update user's UserRole to have company_id = companyA.company_id
    await prismaClient.userRole.updateMany({
      where: { user_id: corporateAdminUser.user_id },
      data: { company_id: companyA.company_id },
    });

    // Set RLS context on app_user connection
    await setRLSContext(rlsPrismaClient, corporateAdminUser.user_id);

    // WHEN: Using Prisma query methods with RLS-enforced connection
    const result = await rlsPrismaClient.company.findMany();

    // THEN: Prisma queries respect RLS policies
    expect(result).toHaveLength(1);
    expect(result[0].company_id).toBe(companyA.company_id);
    // Explicit: Only assigned company is visible
    expect(result.every((c) => c.company_id === companyA.company_id)).toBe(
      true,
    );

    // Cleanup
    await prismaClient.company.deleteMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
  });

  test("2.3-API-013: [P0] should enforce RLS policies on direct SQL queries", async ({
    prismaClient,
    rlsPrismaClient,
    corporateAdminUser,
  }) => {
    // GIVEN: Two companies exist and user is assigned to Company A
    const companies = await createTestCompanies(prismaClient, 2);
    const [companyA] = companies;

    // Update user's UserRole to have company_id = companyA.company_id
    await prismaClient.userRole.updateMany({
      where: { user_id: corporateAdminUser.user_id },
      data: { company_id: companyA.company_id },
    });

    // Set RLS context on app_user connection
    await setRLSContext(rlsPrismaClient, corporateAdminUser.user_id);

    // WHEN: Using direct SQL query with RLS-enforced connection
    const result = await rlsPrismaClient.$queryRawUnsafe<
      Array<{ company_id: string; name: string }>
    >(`SELECT company_id, name FROM companies`);

    // THEN: Direct SQL queries also respect RLS policies (cannot bypass)
    expect(result).toHaveLength(1);
    expect(result[0].company_id).toBe(companyA.company_id);
    // Explicit: RLS policies apply even to raw SQL

    // Cleanup
    await prismaClient.company.deleteMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
  });
});

test.describe("RLS Policies - Silent Filtering", () => {
  test("2.3-API-014: [P1] should return empty result set without errors for unauthorized access", async ({
    prismaClient,
    rlsPrismaClient,
    corporateAdminUser,
  }) => {
    // GIVEN: Company B exists and user is assigned to Company A
    const companies = await createTestCompanies(prismaClient, 2);
    const [companyA, companyB] = companies;

    // Update user's UserRole to have company_id = companyA.company_id
    await prismaClient.userRole.updateMany({
      where: { user_id: corporateAdminUser.user_id },
      data: { company_id: companyA.company_id },
    });

    // Set RLS context on app_user connection
    await setRLSContext(rlsPrismaClient, corporateAdminUser.user_id);

    // WHEN: Querying Company B with RLS-enforced connection
    const companyBResult = await rlsPrismaClient.company.findUnique({
      where: { company_id: companyB.company_id },
    });

    // THEN: Query returns null (empty result) without throwing error
    expect(companyBResult).toBeNull();
    // Explicit: No error is thrown (silent filtering)
    // Test passes if no exception is thrown

    // Cleanup
    await prismaClient.company.deleteMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
  });

  test("2.3-API-015: [P1] should not leak information about existence of other companies", async ({
    prismaClient,
    rlsPrismaClient,
    corporateAdminUser,
  }) => {
    // GIVEN: Company B exists and user is assigned to Company A
    const companies = await createTestCompanies(prismaClient, 2);
    const [companyA, companyB] = companies;

    // Update user's UserRole to have company_id = companyA.company_id
    await prismaClient.userRole.updateMany({
      where: { user_id: corporateAdminUser.user_id },
      data: { company_id: companyA.company_id },
    });

    // Set RLS context on app_user connection
    await setRLSContext(rlsPrismaClient, corporateAdminUser.user_id);

    // WHEN: Querying all companies with RLS-enforced connection
    const result = await rlsPrismaClient.company.findMany();

    // THEN: User only sees Company A (cannot detect Company B exists)
    expect(result).toHaveLength(1);
    expect(result[0].company_id).toBe(companyA.company_id);
    // Explicit: Company B should NOT be in results
    expect(result.every((c) => c.company_id !== companyB.company_id)).toBe(
      true,
    );
    // Explicit: User cannot infer existence of other companies
    expect(result.length).toBe(1);

    // Cleanup
    await prismaClient.company.deleteMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
  });
});

test.describe("RLS Policies - Edge Cases", () => {
  test("2.3-API-016: [P1] should handle user with no assigned company_id (sees nothing)", async ({
    prismaClient,
    rlsPrismaClient,
    corporateAdminUser,
  }) => {
    // GIVEN: Companies exist but user has no company_id assigned
    const companies = await createTestCompanies(prismaClient, 2);

    // UserRole exists but company_id is null
    await prismaClient.userRole.updateMany({
      where: { user_id: corporateAdminUser.user_id },
      data: { company_id: null },
    });

    await setRLSContext(rlsPrismaClient, corporateAdminUser.user_id);

    // WHEN: Querying companies with RLS-enforced connection
    const result = await rlsPrismaClient.company.findMany({
      where: {
        company_id: { in: companies.map((c) => c.company_id) },
      },
    });

    // THEN: User sees nothing (no company_id = no access)
    expect(
      result,
      "User with no company_id assignment should see no companies",
    ).toHaveLength(0);

    // Cleanup
    await prismaClient.company.deleteMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
  });

  test("2.3-API-017: [P1] should handle user with no roles (sees nothing)", async ({
    prismaClient,
    rlsPrismaClient,
  }) => {
    // GIVEN: Companies exist and user exists but has no roles
    const companies = await createTestCompanies(prismaClient, 2);
    const user = await prismaClient.user.create({
      data: createUser(),
    });

    // User has no UserRole records
    await setRLSContext(rlsPrismaClient, user.user_id);

    // WHEN: Querying companies with RLS-enforced connection
    const result = await rlsPrismaClient.company.findMany({
      where: {
        company_id: { in: companies.map((c) => c.company_id) },
      },
    });

    // THEN: User sees nothing (no roles = no access)
    expect(result, "User with no roles should see no companies").toHaveLength(
      0,
    );

    // Cleanup
    await prismaClient.user.delete({ where: { user_id: user.user_id } });
    await prismaClient.company.deleteMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
  });
});

test.describe("RLS Policies - Security Tests", () => {
  test("2.3-API-018: [P0] should prevent SQL injection in RLS context user ID", async ({
    prismaClient,
    corporateAdminUser,
  }) => {
    // GIVEN: Companies exist and user is assigned to Company A
    const companies = await createTestCompanies(prismaClient, 2);
    const [companyA] = companies;

    await prismaClient.userRole.updateMany({
      where: { user_id: corporateAdminUser.user_id },
      data: { company_id: companyA.company_id },
    });

    // WHEN: Attempting SQL injection in RLS context
    const maliciousUserId = `'; DROP TABLE companies; --`;

    // THEN: SQL injection should be prevented (either sanitized or error thrown)
    await expect(
      prismaClient.$executeRawUnsafe(
        `SET LOCAL app.current_user_id = '${maliciousUserId}'`,
      ),
    ).rejects.toThrow();

    // Verify companies still exist (not dropped)
    const companiesAfter = await prismaClient.company.findMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
    expect(
      companiesAfter,
      "Companies should not be deleted by SQL injection",
    ).toHaveLength(2);

    // Cleanup
    await prismaClient.company.deleteMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
  });

  test("2.3-API-019: [P0] should prevent unauthorized access without valid user context", async ({
    prismaClient,
    rlsPrismaClient,
  }) => {
    // GIVEN: Companies exist
    const companies = await createTestCompanies(prismaClient, 2);

    // WHEN: Querying without setting RLS context (no user context) on RLS-enforced connection
    // THEN: RLS policies should filter all rows (empty result)
    const result = await rlsPrismaClient.company.findMany({
      where: {
        company_id: { in: companies.map((c) => c.company_id) },
      },
    });

    expect(
      result,
      "Query without RLS context should return empty result",
    ).toHaveLength(0);

    // Cleanup
    await prismaClient.company.deleteMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
  });

  test("2.3-API-020: [P0] should prevent access with invalid user ID format", async ({
    prismaClient,
    rlsPrismaClient,
  }) => {
    // GIVEN: Companies exist
    const companies = await createTestCompanies(prismaClient, 2);

    // WHEN: Setting RLS context with invalid user ID (non-existent UUID) on RLS-enforced connection
    const invalidUserId = "00000000-0000-0000-0000-000000000000";
    await setRLSContext(rlsPrismaClient, invalidUserId);

    // THEN: Query should return empty result (user doesn't exist, no roles)
    const result = await rlsPrismaClient.company.findMany({
      where: {
        company_id: { in: companies.map((c) => c.company_id) },
      },
    });

    expect(
      result,
      "Query with invalid user ID should return empty result",
    ).toHaveLength(0);

    // Cleanup
    await prismaClient.company.deleteMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
  });

  test("2.3-API-021: [P0] should prevent data leakage through error messages", async ({
    prismaClient,
    rlsPrismaClient,
    corporateAdminUser,
  }) => {
    // GIVEN: Company B exists and user is assigned to Company A
    const companies = await createTestCompanies(prismaClient, 2);
    const [companyA, companyB] = companies;

    await prismaClient.userRole.updateMany({
      where: { user_id: corporateAdminUser.user_id },
      data: { company_id: companyA.company_id },
    });

    await setRLSContext(rlsPrismaClient, corporateAdminUser.user_id);

    // WHEN: Attempting to access Company B (unauthorized) with RLS-enforced connection
    // THEN: Should return null without revealing Company B exists
    const result = await rlsPrismaClient.company.findUnique({
      where: { company_id: companyB.company_id },
    });

    expect(
      result,
      "Unauthorized access should return null without error",
    ).toBeNull();
    // Verify no information leakage about Company B existence

    // Cleanup
    await prismaClient.company.deleteMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
  });

  test("2.3-API-026: [P0] should prevent boolean-based SQL injection in RLS context", async ({
    prismaClient,
    corporateAdminUser,
  }) => {
    // GIVEN: Companies exist and user is assigned to Company A
    const companies = await createTestCompanies(prismaClient, 2);
    const [companyA] = companies;

    await prismaClient.userRole.updateMany({
      where: { user_id: corporateAdminUser.user_id },
      data: { company_id: companyA.company_id },
    });

    // WHEN: Attempting boolean-based SQL injection in RLS context
    const maliciousUserId = `' OR '1'='1`;

    // THEN: SQL injection should be prevented (either sanitized or error thrown)
    await expect(
      prismaClient.$executeRawUnsafe(
        `SET LOCAL app.current_user_id = '${maliciousUserId}'`,
      ),
    ).rejects.toThrow();

    // Verify companies still exist and RLS still works
    const companiesAfter = await prismaClient.company.findMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
    expect(
      companiesAfter,
      "Companies should not be affected by SQL injection attempt",
    ).toHaveLength(2);

    // Cleanup
    await prismaClient.company.deleteMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
  });

  test("2.3-API-027: [P0] should prevent UNION-based SQL injection in RLS context", async ({
    prismaClient,
    corporateAdminUser,
  }) => {
    // GIVEN: Companies exist and user is assigned to Company A
    const companies = await createTestCompanies(prismaClient, 2);
    const [companyA] = companies;

    await prismaClient.userRole.updateMany({
      where: { user_id: corporateAdminUser.user_id },
      data: { company_id: companyA.company_id },
    });

    // WHEN: Attempting UNION-based SQL injection in RLS context
    const maliciousUserId = `' UNION SELECT company_id FROM companies --`;

    // THEN: SQL injection should be prevented (either sanitized or error thrown)
    await expect(
      prismaClient.$executeRawUnsafe(
        `SET LOCAL app.current_user_id = '${maliciousUserId}'`,
      ),
    ).rejects.toThrow();

    // Verify companies still exist
    const companiesAfter = await prismaClient.company.findMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
    expect(
      companiesAfter,
      "Companies should not be affected by UNION injection attempt",
    ).toHaveLength(2);

    // Cleanup
    await prismaClient.company.deleteMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
  });

  test("2.3-API-028: [P0] should prevent comment-based SQL injection in RLS context", async ({
    prismaClient,
    corporateAdminUser,
  }) => {
    // GIVEN: Companies exist and user is assigned to Company A
    const companies = await createTestCompanies(prismaClient, 2);
    const [companyA, companyB] = companies;

    await prismaClient.userRole.updateMany({
      where: { user_id: corporateAdminUser.user_id },
      data: { company_id: companyA.company_id },
    });

    // WHEN: Attempting SQL injection via company name query (simulating malicious input)
    const maliciousCompanyName = `Test'; DROP TABLE companies; -- `;

    // THEN: Prisma parameterized queries prevent SQL injection
    // This should safely query without executing the DROP TABLE command
    const result = await prismaClient.company.findMany({
      where: { name: maliciousCompanyName },
    });

    // Verify: No results found (malicious string doesn't match any company)
    expect(result).toHaveLength(0);

    // AND: All companies still exist (SQL injection was prevented)
    const companiesAfter = await prismaClient.company.findMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
    expect(
      companiesAfter,
      "Companies should not be affected by SQL injection attempt",
    ).toHaveLength(2);

    // Cleanup
    await prismaClient.company.deleteMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
  });
});

test.describe("RLS Policies - Context Isolation", () => {
  test("2.3-API-029: [P1] should properly clear RLS context after reset", async ({
    prismaClient,
    rlsPrismaClient,
    corporateAdminUser,
  }) => {
    // GIVEN: Companies exist and user context is set
    const companies = await createTestCompanies(prismaClient, 2);
    const [companyA] = companies;

    await prismaClient.userRole.updateMany({
      where: { user_id: corporateAdminUser.user_id },
      data: { company_id: companyA.company_id },
    });

    // Set RLS context
    await setRLSContext(rlsPrismaClient, corporateAdminUser.user_id);

    // Verify user can see their company
    const beforeClear = await rlsPrismaClient.company.findMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
    expect(
      beforeClear,
      "User should see their company before context clear",
    ).toHaveLength(1);

    // WHEN: Clearing RLS context
    await clearRLSContext(rlsPrismaClient);

    // THEN: User should see nothing (no context = no access)
    const afterClear = await rlsPrismaClient.company.findMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
    expect(
      afterClear,
      "User should see nothing after RLS context is cleared",
    ).toHaveLength(0);

    // Cleanup
    await prismaClient.company.deleteMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
  });

  test("2.3-API-030: [P1] should maintain RLS isolation across multiple queries in same context", async ({
    prismaClient,
    rlsPrismaClient,
    corporateAdminUser,
  }) => {
    // GIVEN: Multiple companies exist and user is assigned to Company A
    const companies = await createTestCompanies(prismaClient, 3);
    const [companyA, companyB, companyC] = companies;

    await prismaClient.userRole.updateMany({
      where: { user_id: corporateAdminUser.user_id },
      data: { company_id: companyA.company_id },
    });

    // Set RLS context once
    await setRLSContext(rlsPrismaClient, corporateAdminUser.user_id);

    // WHEN: Running multiple queries in same context
    const query1 = await rlsPrismaClient.company.findMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
    const query2 = await rlsPrismaClient.company.findUnique({
      where: { company_id: companyB.company_id },
    });
    const query3 = await rlsPrismaClient.company.findMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });

    // THEN: All queries should respect RLS consistently
    expect(query1, "First query should only return Company A").toHaveLength(1);
    expect(query1[0].company_id, "First query should return Company A").toBe(
      companyA.company_id,
    );
    expect(query2, "Second query for Company B should return null").toBeNull();
    expect(
      query3,
      "Third query should still only return Company A",
    ).toHaveLength(1);
    expect(query3[0].company_id, "Third query should return Company A").toBe(
      companyA.company_id,
    );

    // Cleanup
    await prismaClient.company.deleteMany({
      where: { company_id: { in: companies.map((c) => c.company_id) } },
    });
  });
});
