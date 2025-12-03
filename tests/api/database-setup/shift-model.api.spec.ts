import { test, expect } from "../../support/fixtures";
import {
  createUser,
  createCompany,
  createStore,
  createShift,
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

      const cashier = await prismaClient.user.create({
        data: createUser({ name: "Shift Cashier" }),
      });
      cashierId = cashier.user_id;

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

      const shiftData = createShift({
        store_id: store.store_id,
        opened_by: opener.user_id,
        cashier_id: cashier.user_id,
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
      expect(shift).toHaveProperty("cashier_id", cashier.user_id);
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
      if (cashierId) {
        await prismaClient.user
          .delete({ where: { user_id: cashierId } })
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

      const cashier = await prismaClient.user.create({
        data: createUser({ name: "Shift Cashier" }),
      });
      cashierId = cashier.user_id;

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

      // THEN: Each status value should be accepted
      for (const status of statuses) {
        const shiftData = createShift({
          store_id: store.store_id,
          opened_by: opener.user_id,
          cashier_id: cashier.user_id,
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
      if (cashierId) {
        await prismaClient.user
          .delete({ where: { user_id: cashierId } })
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

      const cashier = await prismaClient.user.create({
        data: createUser({ name: "Shift Cashier" }),
      });
      cashierId = cashier.user_id;

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

      const shiftData = createShift({
        store_id: store.store_id,
        opened_by: opener.user_id,
        cashier_id: cashier.user_id,
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
      if (cashierId) {
        await prismaClient.user
          .delete({ where: { user_id: cashierId } })
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

      const cashier = await prismaClient.user.create({
        data: createUser({ name: "Shift Cashier" }),
      });
      cashierId = cashier.user_id;

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

      const shiftData = createShift({
        store_id: store.store_id,
        opened_by: opener.user_id,
        cashier_id: cashier.user_id,
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
      if (cashierId) {
        await prismaClient.user
          .delete({ where: { user_id: cashierId } })
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

      const cashier = await prismaClient.user.create({
        data: createUser({ name: "Shift Cashier" }),
      });
      cashierId = cashier.user_id;

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

      const openingCash = new Prisma.Decimal("100.00");
      const expectedCash = new Prisma.Decimal("150.00");
      const closingCash = new Prisma.Decimal("145.00");
      const variance = new Prisma.Decimal("-5.00");

      const shiftData = createShift({
        store_id: store.store_id,
        opened_by: opener.user_id,
        cashier_id: cashier.user_id,
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
      if (cashierId) {
        await prismaClient.user
          .delete({ where: { user_id: cashierId } })
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

      const cashier = await prismaClient.user.create({
        data: createUser({ name: "Shift Cashier" }),
      });
      cashierId = cashier.user_id;

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

      const varianceReason = "Shortage due to miscounted change";
      const approvedAt = new Date();

      const shiftData = createShift({
        store_id: store.store_id,
        opened_by: opener.user_id,
        cashier_id: cashier.user_id,
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
      if (cashierId) {
        await prismaClient.user
          .delete({ where: { user_id: cashierId } })
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

    try {
      // Setup: Create required dependencies
      const opener = await prismaClient.user.create({
        data: createUser({ name: "Shift Opener" }),
      });
      openerId = opener.user_id;

      const cashier = await prismaClient.user.create({
        data: createUser({ name: "Shift Cashier" }),
      });
      cashierId = cashier.user_id;

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

      const shiftData = createShift({
        store_id: store.store_id,
        opened_by: opener.user_id,
        cashier_id: cashier.user_id,
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
    } finally {
      // Cleanup
      if (shiftId) {
        await prismaClient.shift
          .delete({ where: { shift_id: shiftId } })
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
      if (cashierId) {
        await prismaClient.user
          .delete({ where: { user_id: cashierId } })
          .catch(() => {});
      }
    }
  });
});
