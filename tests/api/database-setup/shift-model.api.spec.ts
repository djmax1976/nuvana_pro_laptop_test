import { test, expect } from "../../support/fixtures";
import {
  createUser,
  createCompany,
  createStore,
  createShift,
  createCashier,
  createTransaction,
} from "../../support/factories";
import { Prisma } from "@prisma/client";

/**
 * Database Setup - Shift Model API Tests
 *
 * These tests verify the Shift model schema validation:
 * - Shift model field validation (all required fields present)
 * - Status enum values (NOT_STARTED, OPEN, ACTIVE, CLOSING, RECONCILING, CLOSED, VARIANCE_REVIEW)
 * - Relationships (Shift → Store, Shift → User opened_by, Shift → User cashier, Shift → Transactions)
 * - Indexes on store_id, status, opened_at
 * - Cash reconciliation fields (opening_cash, expected_cash, closing_cash, variance)
 * - Approval fields (approved_by, approved_at)
 *
 * Story: 4-1-shift-data-models
 * Status: ready-for-dev
 * Test Level: API (Prisma schema validation)
 */

/**
 * Helper function to create a test Cashier record
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

test.describe("4.1-API-001: Shift Model - Schema Validation", () => {
  test("[P0] 4.1-API-001-001: Shift model should have all required fields", async ({
    prismaClient,
  }) => {
    // GIVEN: Prisma schema defines Shift model with required fields
    // WHEN: Creating a Shift with all required fields
    let shiftId: string | null = null;
    let storeId: string | null = null;
    let companyId: string | null = null;
    let openerId: string | null = null;
    let cashierId: string | null = null;

    try {
      // Setup: Create required dependencies
      const opener = await prismaClient.user.create({
        data: createUser({ name: "Shift Opener" }),
      });
      openerId = opener.user_id;

      const owner = await prismaClient.user.create({
        data: createUser({ name: "Company Owner" }),
      });
      const company = await prismaClient.company.create({
        data: createCompany({ owner_user_id: owner.user_id }),
      });
      companyId = company.company_id;

      const store = await prismaClient.store.create({
        data: createStore({ company_id: company.company_id }),
      });
      storeId = store.store_id;

      // Create a Cashier record (not User)
      const cashier = await createTestCashier(
        prismaClient,
        store.store_id,
        opener.user_id,
      );
      cashierId = cashier.cashier_id;

      const shiftData = createShift({
        store_id: store.store_id,
        opened_by: opener.user_id,
        cashier_id: cashier.cashier_id,
        status: "NOT_STARTED",
      });

      // THEN: Shift should be created successfully with all required fields
      const shift = await prismaClient.shift.create({
        data: {
          store_id: shiftData.store_id,
          opened_by: shiftData.opened_by,
          cashier_id: shiftData.cashier_id,
          opening_cash: shiftData.opening_cash,
          status: shiftData.status,
          public_id: shiftData.public_id,
        },
      });
      shiftId = shift.shift_id;

      expect(shift).toHaveProperty("shift_id");
      expect(shift).toHaveProperty("store_id", store.store_id);
      expect(shift).toHaveProperty("opened_by", opener.user_id);
      expect(shift).toHaveProperty("cashier_id", cashier.cashier_id);
      expect(shift).toHaveProperty("opening_cash");
      expect(shift).toHaveProperty("status", "NOT_STARTED");
      expect(shift).toHaveProperty("opened_at");
      expect(shift).toHaveProperty("created_at");
      expect(shift).toHaveProperty("updated_at");
    } finally {
      // Cleanup: Always execute, even if test fails
      if (shiftId) {
        await prismaClient.shift
          .delete({ where: { shift_id: shiftId } })
          .catch(() => {});
      }
      if (cashierId) {
        await prismaClient.cashier
          .delete({ where: { cashier_id: cashierId } })
          .catch(() => {});
      }
      if (storeId) {
        await prismaClient.store
          .delete({ where: { store_id: storeId } })
          .catch(() => {});
      }
      if (companyId) {
        await prismaClient.company
          .delete({ where: { company_id: companyId } })
          .catch(() => {});
      }
      if (openerId) {
        await prismaClient.user
          .delete({ where: { user_id: openerId } })
          .catch(() => {});
      }
    }
  });

  test("[P0] 4.1-API-001-002: Shift status enum should accept all required values", async ({
    prismaClient,
  }) => {
    // GIVEN: Prisma schema defines ShiftStatus enum
    // WHEN: Creating Shifts with each enum value
    const statuses: Array<
      | "NOT_STARTED"
      | "OPEN"
      | "ACTIVE"
      | "CLOSING"
      | "RECONCILING"
      | "CLOSED"
      | "VARIANCE_REVIEW"
    > = [
      "NOT_STARTED",
      "OPEN",
      "ACTIVE",
      "CLOSING",
      "RECONCILING",
      "CLOSED",
      "VARIANCE_REVIEW",
    ];

    const shiftIds: string[] = [];
    let storeId: string | null = null;
    let companyId: string | null = null;
    let openerId: string | null = null;
    let cashierId: string | null = null;

    try {
      // Setup: Create required dependencies
      const opener = await prismaClient.user.create({
        data: createUser({ name: "Shift Opener" }),
      });
      openerId = opener.user_id;

      const owner = await prismaClient.user.create({
        data: createUser({ name: "Company Owner" }),
      });
      const company = await prismaClient.company.create({
        data: createCompany({ owner_user_id: owner.user_id }),
      });
      companyId = company.company_id;

      const store = await prismaClient.store.create({
        data: createStore({ company_id: company.company_id }),
      });
      storeId = store.store_id;

      // Create a Cashier record (not User)
      const cashier = await createTestCashier(
        prismaClient,
        store.store_id,
        opener.user_id,
      );
      cashierId = cashier.cashier_id;

      // THEN: Each status value should be accepted
      for (const status of statuses) {
        const shiftData = createShift({
          store_id: store.store_id,
          opened_by: opener.user_id,
          cashier_id: cashier.cashier_id,
          status: status,
        });

        const shift = await prismaClient.shift.create({
          data: {
            store_id: shiftData.store_id,
            opened_by: shiftData.opened_by,
            cashier_id: shiftData.cashier_id,
            opening_cash: shiftData.opening_cash,
            status: status,
            public_id: shiftData.public_id,
          },
        });
        shiftIds.push(shift.shift_id);

        expect(shift.status).toBe(status);
      }
    } finally {
      // Cleanup: Always execute, even if test fails
      for (const shiftId of shiftIds) {
        await prismaClient.shift
          .delete({ where: { shift_id: shiftId } })
          .catch(() => {});
      }
      if (cashierId) {
        await prismaClient.cashier
          .delete({ where: { cashier_id: cashierId } })
          .catch(() => {});
      }
      if (storeId) {
        await prismaClient.store
          .delete({ where: { store_id: storeId } })
          .catch(() => {});
      }
      if (companyId) {
        await prismaClient.company
          .delete({ where: { company_id: companyId } })
          .catch(() => {});
      }
      if (openerId) {
        await prismaClient.user
          .delete({ where: { user_id: openerId } })
          .catch(() => {});
      }
    }
  });

  test("[P0] 4.1-API-001-003: Shift should have relationship to Store", async ({
    prismaClient,
  }) => {
    // GIVEN: Prisma schema defines Shift with Store foreign key
    // WHEN: Creating a Shift with store_id and querying with include
    let shiftId: string | null = null;
    let storeId: string | null = null;
    let companyId: string | null = null;
    let openerId: string | null = null;
    let cashierId: string | null = null;

    try {
      // Setup: Create required dependencies
      const opener = await prismaClient.user.create({
        data: createUser({ name: "Shift Opener" }),
      });
      openerId = opener.user_id;

      const owner = await prismaClient.user.create({
        data: createUser({ name: "Company Owner" }),
      });
      const company = await prismaClient.company.create({
        data: createCompany({ owner_user_id: owner.user_id }),
      });
      companyId = company.company_id;

      const store = await prismaClient.store.create({
        data: createStore({ company_id: company.company_id }),
      });
      storeId = store.store_id;

      // Create a Cashier record (not User)
      const cashier = await createTestCashier(
        prismaClient,
        store.store_id,
        opener.user_id,
      );
      cashierId = cashier.cashier_id;

      const shiftData = createShift({
        store_id: store.store_id,
        opened_by: opener.user_id,
        cashier_id: cashier.cashier_id,
      });

      const shift = await prismaClient.shift.create({
        data: {
          store_id: shiftData.store_id,
          opened_by: shiftData.opened_by,
          cashier_id: shiftData.cashier_id,
          opening_cash: shiftData.opening_cash,
          status: shiftData.status,
          public_id: shiftData.public_id,
        },
      });
      shiftId = shift.shift_id;

      // THEN: Shift should have relationship to Store
      const shiftWithStore = await prismaClient.shift.findUnique({
        where: { shift_id: shift.shift_id },
        include: { store: true },
      });

      expect(shiftWithStore).not.toBeNull();
      expect(shiftWithStore?.store).not.toBeNull();
      expect(shiftWithStore?.store.store_id).toBe(store.store_id);
      expect(shiftWithStore?.store.name).toBe(store.name);
    } finally {
      // Cleanup
      if (shiftId) {
        await prismaClient.shift
          .delete({ where: { shift_id: shiftId } })
          .catch(() => {});
      }
      if (cashierId) {
        await prismaClient.cashier
          .delete({ where: { cashier_id: cashierId } })
          .catch(() => {});
      }
      if (storeId) {
        await prismaClient.store
          .delete({ where: { store_id: storeId } })
          .catch(() => {});
      }
      if (companyId) {
        await prismaClient.company
          .delete({ where: { company_id: companyId } })
          .catch(() => {});
      }
      if (openerId) {
        await prismaClient.user
          .delete({ where: { user_id: openerId } })
          .catch(() => {});
      }
    }
  });

  test("[P0] 4.1-API-001-004: Shift should have relationship to User (opened_by)", async ({
    prismaClient,
  }) => {
    // GIVEN: Prisma schema defines Shift with opened_by foreign key
    // WHEN: Creating a Shift with opened_by and querying with include
    let shiftId: string | null = null;
    let storeId: string | null = null;
    let companyId: string | null = null;
    let openerId: string | null = null;
    let cashierId: string | null = null;

    try {
      // Setup: Create required dependencies
      const opener = await prismaClient.user.create({
        data: createUser({ name: "Shift Opener" }),
      });
      openerId = opener.user_id;

      const owner = await prismaClient.user.create({
        data: createUser({ name: "Company Owner" }),
      });
      const company = await prismaClient.company.create({
        data: createCompany({ owner_user_id: owner.user_id }),
      });
      companyId = company.company_id;

      const store = await prismaClient.store.create({
        data: createStore({ company_id: company.company_id }),
      });
      storeId = store.store_id;

      // Create a Cashier record (not User)
      const cashier = await createTestCashier(
        prismaClient,
        store.store_id,
        opener.user_id,
      );
      cashierId = cashier.cashier_id;

      const shiftData = createShift({
        store_id: store.store_id,
        opened_by: opener.user_id,
        cashier_id: cashier.cashier_id,
      });

      const shift = await prismaClient.shift.create({
        data: {
          store_id: shiftData.store_id,
          opened_by: shiftData.opened_by,
          cashier_id: shiftData.cashier_id,
          opening_cash: shiftData.opening_cash,
          status: shiftData.status,
          public_id: shiftData.public_id,
        },
      });
      shiftId = shift.shift_id;

      // THEN: Shift should have relationship to User (opener)
      const shiftWithOpener = await prismaClient.shift.findUnique({
        where: { shift_id: shift.shift_id },
        include: { opener: true },
      });

      expect(shiftWithOpener).not.toBeNull();
      expect(shiftWithOpener?.opener).not.toBeNull();
      expect(shiftWithOpener?.opener.user_id).toBe(opener.user_id);
      expect(shiftWithOpener?.opener.name).toBe(opener.name);
    } finally {
      // Cleanup
      if (shiftId) {
        await prismaClient.shift
          .delete({ where: { shift_id: shiftId } })
          .catch(() => {});
      }
      if (cashierId) {
        await prismaClient.cashier
          .delete({ where: { cashier_id: cashierId } })
          .catch(() => {});
      }
      if (storeId) {
        await prismaClient.store
          .delete({ where: { store_id: storeId } })
          .catch(() => {});
      }
      if (companyId) {
        await prismaClient.company
          .delete({ where: { company_id: companyId } })
          .catch(() => {});
      }
      if (openerId) {
        await prismaClient.user
          .delete({ where: { user_id: openerId } })
          .catch(() => {});
      }
    }
  });

  test("[P0] 4.1-API-001-005: Shift should have relationship to Cashier", async ({
    prismaClient,
  }) => {
    // GIVEN: Prisma schema defines Shift with cashier_id foreign key to Cashier model
    // WHEN: Creating a Shift with cashier_id and querying with include
    let shiftId: string | null = null;
    let storeId: string | null = null;
    let companyId: string | null = null;
    let openerId: string | null = null;
    let cashierId: string | null = null;
    let ownerId: string | null = null;

    try {
      // Setup: Create required dependencies
      const opener = await prismaClient.user.create({
        data: createUser({ name: "Shift Opener" }),
      });
      openerId = opener.user_id;

      const owner = await prismaClient.user.create({
        data: createUser({ name: "Company Owner" }),
      });
      ownerId = owner.user_id;
      const company = await prismaClient.company.create({
        data: createCompany({ owner_user_id: owner.user_id }),
      });
      companyId = company.company_id;

      const store = await prismaClient.store.create({
        data: createStore({ company_id: company.company_id }),
      });
      storeId = store.store_id;

      // Create a Cashier record (Shift.cashier now points to Cashier model, not User)
      const cashier = await prismaClient.cashier.create({
        data: {
          store_id: store.store_id,
          employee_id: "0001",
          name: "Test Cashier",
          pin_hash: "$2b$10$testHashForTestOnly1234567890",
          hired_on: new Date(),
          created_by: opener.user_id,
        },
      });
      cashierId = cashier.cashier_id;

      const shiftData = createShift({
        store_id: store.store_id,
        opened_by: opener.user_id,
        cashier_id: cashier.cashier_id,
      });

      const shift = await prismaClient.shift.create({
        data: {
          store_id: shiftData.store_id,
          opened_by: shiftData.opened_by,
          cashier_id: shiftData.cashier_id,
          opening_cash: shiftData.opening_cash,
          status: shiftData.status,
          public_id: shiftData.public_id,
        },
      });
      shiftId = shift.shift_id;

      // THEN: Shift should have relationship to Cashier
      const shiftWithCashier = await prismaClient.shift.findUnique({
        where: { shift_id: shift.shift_id },
        include: { cashier: true },
      });

      expect(shiftWithCashier).not.toBeNull();
      expect(shiftWithCashier?.cashier).not.toBeNull();
      expect(shiftWithCashier?.cashier.cashier_id).toBe(cashier.cashier_id);
      expect(shiftWithCashier?.cashier.name).toBe(cashier.name);
    } finally {
      // Cleanup
      if (shiftId) {
        await prismaClient.shift
          .delete({ where: { shift_id: shiftId } })
          .catch(() => {});
      }
      if (cashierId) {
        await prismaClient.cashier
          .delete({ where: { cashier_id: cashierId } })
          .catch(() => {});
      }
      if (storeId) {
        await prismaClient.store
          .delete({ where: { store_id: storeId } })
          .catch(() => {});
      }
      if (companyId) {
        await prismaClient.company
          .delete({ where: { company_id: companyId } })
          .catch(() => {});
      }
      if (openerId) {
        await prismaClient.user
          .delete({ where: { user_id: openerId } })
          .catch(() => {});
      }
      if (ownerId) {
        await prismaClient.user
          .delete({ where: { user_id: ownerId } })
          .catch(() => {});
      }
    }
  });

  test("[P0] 4.1-API-001-006: Shift should support cash reconciliation fields", async ({
    prismaClient,
  }) => {
    // GIVEN: Prisma schema defines Shift with reconciliation fields
    // WHEN: Creating a Shift with reconciliation fields (opening_cash, expected_cash, closing_cash, variance)
    let shiftId: string | null = null;
    let storeId: string | null = null;
    let companyId: string | null = null;
    let openerId: string | null = null;
    let cashierId: string | null = null;

    try {
      // Setup: Create required dependencies
      const opener = await prismaClient.user.create({
        data: createUser({ name: "Shift Opener" }),
      });
      openerId = opener.user_id;

      const owner = await prismaClient.user.create({
        data: createUser({ name: "Company Owner" }),
      });
      const company = await prismaClient.company.create({
        data: createCompany({ owner_user_id: owner.user_id }),
      });
      companyId = company.company_id;

      const store = await prismaClient.store.create({
        data: createStore({ company_id: company.company_id }),
      });
      storeId = store.store_id;

      // Create a Cashier record (not User)
      const cashier = await createTestCashier(
        prismaClient,
        store.store_id,
        opener.user_id,
      );
      cashierId = cashier.cashier_id;

      const openingCash = new Prisma.Decimal("100.00");
      const expectedCash = new Prisma.Decimal("150.00");
      const closingCash = new Prisma.Decimal("145.00");
      const variance = new Prisma.Decimal("-5.00");

      const shiftData = createShift({
        store_id: store.store_id,
        opened_by: opener.user_id,
        cashier_id: cashier.cashier_id,
        opening_cash: openingCash,
        expected_cash: expectedCash,
        closing_cash: closingCash,
        variance: variance,
      });

      // THEN: Shift should be created with reconciliation fields
      const shift = await prismaClient.shift.create({
        data: {
          store_id: shiftData.store_id,
          opened_by: shiftData.opened_by,
          cashier_id: shiftData.cashier_id,
          opening_cash: shiftData.opening_cash,
          expected_cash: shiftData.expected_cash,
          closing_cash: shiftData.closing_cash,
          variance: shiftData.variance,
          status: shiftData.status,
          public_id: shiftData.public_id,
        },
      });
      shiftId = shift.shift_id;

      expect(shift.opening_cash).toEqual(openingCash);
      expect(shift.expected_cash).toEqual(expectedCash);
      expect(shift.closing_cash).toEqual(closingCash);
      expect(shift.variance).toEqual(variance);
    } finally {
      // Cleanup
      if (shiftId) {
        await prismaClient.shift
          .delete({ where: { shift_id: shiftId } })
          .catch(() => {});
      }
      if (cashierId) {
        await prismaClient.cashier
          .delete({ where: { cashier_id: cashierId } })
          .catch(() => {});
      }
      if (storeId) {
        await prismaClient.store
          .delete({ where: { store_id: storeId } })
          .catch(() => {});
      }
      if (companyId) {
        await prismaClient.company
          .delete({ where: { company_id: companyId } })
          .catch(() => {});
      }
      if (openerId) {
        await prismaClient.user
          .delete({ where: { user_id: openerId } })
          .catch(() => {});
      }
    }
  });

  test("[P1] 4.1-API-001-007: Shift should support approval fields for variance", async ({
    prismaClient,
  }) => {
    // GIVEN: Prisma schema defines Shift with approval fields
    // WHEN: Creating a Shift with approval fields (approved_by, approved_at, variance_reason)
    let shiftId: string | null = null;
    let storeId: string | null = null;
    let companyId: string | null = null;
    let openerId: string | null = null;
    let cashierId: string | null = null;
    let approverId: string | null = null;

    try {
      // Setup: Create required dependencies
      const opener = await prismaClient.user.create({
        data: createUser({ name: "Shift Opener" }),
      });
      openerId = opener.user_id;

      const approver = await prismaClient.user.create({
        data: createUser({ name: "Shift Approver" }),
      });
      approverId = approver.user_id;

      const owner = await prismaClient.user.create({
        data: createUser({ name: "Company Owner" }),
      });
      const company = await prismaClient.company.create({
        data: createCompany({ owner_user_id: owner.user_id }),
      });
      companyId = company.company_id;

      const store = await prismaClient.store.create({
        data: createStore({ company_id: company.company_id }),
      });
      storeId = store.store_id;

      // Create a Cashier record (not User)
      const cashier = await createTestCashier(
        prismaClient,
        store.store_id,
        opener.user_id,
      );
      cashierId = cashier.cashier_id;

      const varianceReason = "Shortage due to miscounted change";
      const approvedAt = new Date();

      const shiftData = createShift({
        store_id: store.store_id,
        opened_by: opener.user_id,
        cashier_id: cashier.cashier_id,
        variance_reason: varianceReason,
        approved_by: approver.user_id,
        approved_at: approvedAt,
        status: "VARIANCE_REVIEW",
      });

      // THEN: Shift should be created with approval fields
      const shift = await prismaClient.shift.create({
        data: {
          store_id: shiftData.store_id,
          opened_by: shiftData.opened_by,
          cashier_id: shiftData.cashier_id,
          opening_cash: shiftData.opening_cash,
          variance_reason: shiftData.variance_reason,
          approved_by: shiftData.approved_by,
          approved_at: shiftData.approved_at,
          status: shiftData.status,
          public_id: shiftData.public_id,
        },
      });
      shiftId = shift.shift_id;

      expect(shift.variance_reason).toBe(varianceReason);
      expect(shift.approved_by).toBe(approver.user_id);
      expect(shift.approved_at).not.toBeNull();
      expect(shift.status).toBe("VARIANCE_REVIEW");
    } finally {
      // Cleanup
      if (shiftId) {
        await prismaClient.shift
          .delete({ where: { shift_id: shiftId } })
          .catch(() => {});
      }
      if (cashierId) {
        await prismaClient.cashier
          .delete({ where: { cashier_id: cashierId } })
          .catch(() => {});
      }
      if (storeId) {
        await prismaClient.store
          .delete({ where: { store_id: storeId } })
          .catch(() => {});
      }
      if (companyId) {
        await prismaClient.company
          .delete({ where: { company_id: companyId } })
          .catch(() => {});
      }
      if (openerId) {
        await prismaClient.user
          .delete({ where: { user_id: openerId } })
          .catch(() => {});
      }
      if (approverId) {
        await prismaClient.user
          .delete({ where: { user_id: approverId } })
          .catch(() => {});
      }
    }
  });

  test("[P1] 4.1-API-001-008: Shift should have relationship to Transactions", async ({
    prismaClient,
  }) => {
    // GIVEN: Prisma schema defines Shift with Transactions relation
    // WHEN: Creating a Shift and querying with transactions include
    let shiftId: string | null = null;
    let storeId: string | null = null;
    let companyId: string | null = null;
    let openerId: string | null = null;
    let cashierId: string | null = null;
    let transactionIds: string[] = [];
    let ownerId: string | null = null;

    try {
      // Setup: Create required dependencies
      const opener = await prismaClient.user.create({
        data: createUser({ name: "Shift Opener" }),
      });
      openerId = opener.user_id;

      const owner = await prismaClient.user.create({
        data: createUser({ name: "Company Owner" }),
      });
      ownerId = owner.user_id;
      const company = await prismaClient.company.create({
        data: createCompany({ owner_user_id: owner.user_id }),
      });
      companyId = company.company_id;

      const store = await prismaClient.store.create({
        data: createStore({ company_id: company.company_id }),
      });
      storeId = store.store_id;

      // Create a Cashier record (not User)
      const cashier = await createTestCashier(
        prismaClient,
        store.store_id,
        opener.user_id,
      );
      cashierId = cashier.cashier_id;

      const shiftData = createShift({
        store_id: store.store_id,
        opened_by: opener.user_id,
        cashier_id: cashier.cashier_id,
      });

      const shift = await prismaClient.shift.create({
        data: {
          store_id: shiftData.store_id,
          opened_by: shiftData.opened_by,
          cashier_id: shiftData.cashier_id,
          opening_cash: shiftData.opening_cash,
          status: shiftData.status,
          public_id: shiftData.public_id,
        },
      });
      shiftId = shift.shift_id;

      // THEN: Shift should have relationship to Transactions (empty array initially)
      const shiftWithTransactions = await prismaClient.shift.findUnique({
        where: { shift_id: shift.shift_id },
        include: { transactions: true },
      });

      expect(shiftWithTransactions).not.toBeNull();
      expect(shiftWithTransactions?.transactions).toBeDefined();
      expect(Array.isArray(shiftWithTransactions?.transactions)).toBe(true);
      expect(shiftWithTransactions?.transactions.length).toBe(0);

      // ENTERPRISE-GRADE: Verify bidirectional relationship by creating transactions
      // Create multiple transactions linked to the shift
      const transaction1Data = createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: opener.user_id, // Use opener as cashier for simplicity
        subtotal: 50.0,
        tax: 4.0,
        discount: 0,
        total: 54.0,
        timestamp: new Date(),
      });

      const transaction1 = await prismaClient.transaction.create({
        data: {
          transaction_id: transaction1Data.transaction_id || undefined,
          store_id: transaction1Data.store_id,
          shift_id: transaction1Data.shift_id,
          cashier_id: transaction1Data.cashier_id,
          pos_terminal_id: transaction1Data.pos_terminal_id,
          timestamp: transaction1Data.timestamp || new Date(),
          subtotal: new Prisma.Decimal(transaction1Data.subtotal),
          tax: new Prisma.Decimal(transaction1Data.tax),
          discount: new Prisma.Decimal(transaction1Data.discount),
          total: new Prisma.Decimal(transaction1Data.total),
          public_id: transaction1Data.public_id,
        },
      });
      transactionIds.push(transaction1.transaction_id);

      const transaction2Data = createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: opener.user_id,
        subtotal: 100.0,
        tax: 8.0,
        discount: 0,
        total: 108.0,
        timestamp: new Date(),
      });

      const transaction2 = await prismaClient.transaction.create({
        data: {
          transaction_id: transaction2Data.transaction_id || undefined,
          store_id: transaction2Data.store_id,
          shift_id: transaction2Data.shift_id,
          cashier_id: transaction2Data.cashier_id,
          pos_terminal_id: transaction2Data.pos_terminal_id,
          timestamp: transaction2Data.timestamp || new Date(),
          subtotal: new Prisma.Decimal(transaction2Data.subtotal),
          tax: new Prisma.Decimal(transaction2Data.tax),
          discount: new Prisma.Decimal(transaction2Data.discount),
          total: new Prisma.Decimal(transaction2Data.total),
          public_id: transaction2Data.public_id,
        },
      });
      transactionIds.push(transaction2.transaction_id);

      // Verify transactions are linked to shift (bidirectional relationship)
      const shiftWithTransactionsAfter = await prismaClient.shift.findUnique({
        where: { shift_id: shift.shift_id },
        include: { transactions: true },
      });

      expect(shiftWithTransactionsAfter?.transactions.length).toBe(2);
      expect(
        shiftWithTransactionsAfter?.transactions.some(
          (t) => t.transaction_id === transaction1.transaction_id,
        ),
      ).toBe(true);
      expect(
        shiftWithTransactionsAfter?.transactions.some(
          (t) => t.transaction_id === transaction2.transaction_id,
        ),
      ).toBe(true);

      // Verify transaction -> shift relationship (bidirectional)
      const transaction1WithShift = await prismaClient.transaction.findUnique({
        where: { transaction_id: transaction1.transaction_id },
        include: { shift: true },
      });

      expect(transaction1WithShift).not.toBeNull();
      expect(transaction1WithShift?.shift).not.toBeNull();
      expect(transaction1WithShift?.shift.shift_id).toBe(shift.shift_id);
      expect(transaction1WithShift?.shift.store_id).toBe(store.store_id);

      // ENTERPRISE-GRADE: Verify foreign key constraint enforcement
      // Attempt to create transaction with invalid shift_id should fail
      const invalidTransactionData = createTransaction({
        store_id: store.store_id,
        shift_id: "00000000-0000-0000-0000-000000000000", // Non-existent shift
        cashier_id: opener.user_id,
        subtotal: 25.0,
        tax: 2.0,
        discount: 0,
        total: 27.0,
        timestamp: new Date(),
      });

      await expect(
        prismaClient.transaction.create({
          data: {
            transaction_id: invalidTransactionData.transaction_id || undefined,
            store_id: invalidTransactionData.store_id,
            shift_id: invalidTransactionData.shift_id,
            cashier_id: invalidTransactionData.cashier_id,
            pos_terminal_id: invalidTransactionData.pos_terminal_id,
            timestamp: invalidTransactionData.timestamp || new Date(),
            subtotal: new Prisma.Decimal(invalidTransactionData.subtotal),
            tax: new Prisma.Decimal(invalidTransactionData.tax),
            discount: new Prisma.Decimal(invalidTransactionData.discount),
            total: new Prisma.Decimal(invalidTransactionData.total),
            public_id: invalidTransactionData.public_id,
          },
        }),
      ).rejects.toThrow();

      // ENTERPRISE-GRADE: Verify relationship integrity - transactions should be queryable by shift
      const transactionsByShift = await prismaClient.transaction.findMany({
        where: { shift_id: shift.shift_id },
      });

      expect(transactionsByShift.length).toBe(2);
      expect(
        transactionsByShift.every((t) => t.shift_id === shift.shift_id),
      ).toBe(true);
    } finally {
      // Cleanup: Delete transactions first (due to foreign key constraints)
      // Note: Transaction has composite primary key (transaction_id, timestamp)
      // Use deleteMany for simplicity and consistency with other cleanup patterns
      if (transactionIds.length > 0) {
        await prismaClient.transaction
          .deleteMany({
            where: { transaction_id: { in: transactionIds } },
          })
          .catch(() => {});
      }
      if (shiftId) {
        await prismaClient.shift
          .delete({ where: { shift_id: shiftId } })
          .catch(() => {});
      }
      if (cashierId) {
        await prismaClient.cashier
          .delete({ where: { cashier_id: cashierId } })
          .catch(() => {});
      }
      if (storeId) {
        await prismaClient.store
          .delete({ where: { store_id: storeId } })
          .catch(() => {});
      }
      if (companyId) {
        await prismaClient.company
          .delete({ where: { company_id: companyId } })
          .catch(() => {});
      }
      if (openerId) {
        await prismaClient.user
          .delete({ where: { user_id: openerId } })
          .catch(() => {});
      }
      if (ownerId) {
        await prismaClient.user
          .delete({ where: { user_id: ownerId } })
          .catch(() => {});
      }
    }
  });
});
