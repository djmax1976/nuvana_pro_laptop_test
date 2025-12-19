import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createUser,
  createCompany,
  createStore,
  createShift,
  createCashier,
} from "../support/factories";
import { Prisma } from "@prisma/client";

/**
 * @test-level Unit
 * @justification Unit tests for day-summary.service.ts business logic
 * @story shift-day-summary-phase-3
 *
 * Day Summary Service Unit Tests
 *
 * Tests the business logic layer independent of HTTP layer.
 * Focuses on:
 * - Aggregation logic correctness
 * - Status transitions
 * - Edge cases in calculations
 * - Error handling
 *
 * ================================================================================
 * TRACEABILITY MATRIX
 * ================================================================================
 *
 * | Test ID  | Requirement                          | Service Method              | Priority |
 * |----------|--------------------------------------|-----------------------------|----------|
 * | SVC-001  | AGG-001: Multi-shift Aggregation     | updateDaySummary            | P0       |
 * | SVC-002  | AGG-002: Average Calculations        | updateDaySummary            | P0       |
 * | SVC-003  | AGG-003: Zero Transaction Handling   | updateDaySummary            | P1       |
 * | SVC-010  | STS-001: PENDING_CLOSE Transition    | updateDaySummary            | P0       |
 * | SVC-011  | STS-002: OPEN Status Retention       | updateDaySummary            | P0       |
 * | SVC-020  | EDGE-001: No Shifts Day              | updateDaySummary            | P1       |
 * | SVC-021  | EDGE-002: Large Decimal Values       | updateDaySummary            | P1       |
 * | SVC-022  | EDGE-003: Shift Timing Tracking      | updateDaySummary            | P2       |
 * | SVC-030  | ERR-001: StoreNotFoundError          | getOrCreateDaySummary       | P0       |
 * | SVC-031  | ERR-002: DaySummaryNotFoundError     | closeDaySummary             | P0       |
 * | SVC-040  | CONC-001: Concurrent Refresh         | updateDaySummary            | P2       |
 *
 * REQUIREMENT COVERAGE:
 * - Aggregation (AGG-001 to AGG-003): 3 tests
 * - Status Transitions (STS-001 to STS-002): 2 tests
 * - Edge Cases (EDGE-001 to EDGE-003): 3 tests
 * - Error Handling (ERR-001 to ERR-002): 2 tests
 * - Concurrency (CONC-001): 1 test
 * ================================================================================
 */

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

async function createPOSTerminal(
  prismaClient: any,
  storeId: string,
): Promise<{ pos_terminal_id: string }> {
  const uniqueId = crypto.randomUUID();
  return prismaClient.pOSTerminal.create({
    data: {
      store_id: storeId,
      name: `Terminal ${uniqueId.substring(0, 8)}`,
      device_id: `device-${uniqueId}`,
      deleted_at: null,
    },
  });
}

async function createTestCashier(
  prismaClient: any,
  storeId: string,
  createdByUserId: string,
): Promise<{ cashier_id: string }> {
  const cashierData = await createCashier({
    store_id: storeId,
    created_by: createdByUserId,
  });
  return prismaClient.cashier.create({ data: cashierData });
}

async function createClosedShiftWithSummary(
  prismaClient: any,
  storeId: string,
  openedBy: string,
  cashierId: string,
  posTerminalId: string,
  businessDate: Date,
  summaryData: {
    gross_sales?: number;
    net_sales?: number;
    tax_collected?: number;
    transaction_count?: number;
    opening_cash?: number;
    closing_cash?: number;
    expected_cash?: number;
  } = {},
): Promise<{ shift_id: string; shift_summary_id: string }> {
  const openedAt = new Date(businessDate);
  openedAt.setHours(8, 0, 0, 0);
  const closedAt = new Date(businessDate);
  closedAt.setHours(16, 0, 0, 0);

  const shift = await prismaClient.shift.create({
    data: {
      ...createShift({
        store_id: storeId,
        opened_by: openedBy,
        cashier_id: cashierId,
        pos_terminal_id: posTerminalId,
        opening_cash: new Prisma.Decimal(summaryData.opening_cash || 100),
        closing_cash: new Prisma.Decimal(summaryData.closing_cash || 200),
        expected_cash: new Prisma.Decimal(summaryData.expected_cash || 200),
        variance: new Prisma.Decimal(0),
        status: "CLOSED",
        opened_at: openedAt,
        closed_at: closedAt,
      }),
    },
  });

  // Calculate shift duration in minutes
  const shiftDurationMins = Math.round(
    (closedAt.getTime() - openedAt.getTime()) / (1000 * 60),
  );

  // Calculate derived values
  const netSales = summaryData.net_sales || 450;
  const transactionCount = summaryData.transaction_count || 10;
  const avgTransaction = transactionCount > 0 ? netSales / transactionCount : 0;
  const itemsSold = 25;
  const avgItemsPerTxn =
    transactionCount > 0 ? itemsSold / transactionCount : 0;

  // Create shift summary
  const shiftSummary = await prismaClient.shiftSummary.create({
    data: {
      shift_id: shift.shift_id,
      store_id: storeId,
      business_date: businessDate,
      shift_opened_at: openedAt,
      shift_closed_at: closedAt,
      shift_duration_mins: shiftDurationMins,
      // Personnel
      opened_by_user_id: openedBy,
      closed_by_user_id: openedBy,
      cashier_user_id: null,
      // Sales
      gross_sales: new Prisma.Decimal(summaryData.gross_sales || 500),
      net_sales: new Prisma.Decimal(netSales),
      returns_total: new Prisma.Decimal(0),
      discounts_total: new Prisma.Decimal(50),
      // Tax
      tax_collected: new Prisma.Decimal(summaryData.tax_collected || 40),
      tax_exempt_sales: new Prisma.Decimal(0),
      taxable_sales: new Prisma.Decimal(netSales),
      // Transaction counts
      transaction_count: transactionCount,
      void_count: 0,
      refund_count: 0,
      no_sale_count: 0,
      // Item counts
      items_sold_count: itemsSold,
      items_returned_count: 0,
      // Averages
      avg_transaction: new Prisma.Decimal(avgTransaction.toFixed(2)),
      avg_items_per_txn: new Prisma.Decimal(avgItemsPerTxn.toFixed(2)),
      // Cash drawer
      opening_cash: new Prisma.Decimal(summaryData.opening_cash || 100),
      closing_cash: new Prisma.Decimal(summaryData.closing_cash || 200),
      expected_cash: new Prisma.Decimal(summaryData.expected_cash || 200),
      cash_variance: new Prisma.Decimal(0),
      variance_percentage: new Prisma.Decimal(0),
      variance_approved: false,
    },
  });

  return {
    shift_id: shift.shift_id,
    shift_summary_id: shiftSummary.shift_summary_id,
  };
}

async function cleanupStoreData(
  prismaClient: any,
  storeId: string,
): Promise<void> {
  // Delete shift summaries
  await prismaClient.shiftTenderSummary.deleteMany({
    where: { shift_summary: { store_id: storeId } },
  });
  await prismaClient.shiftDepartmentSummary.deleteMany({
    where: { shift_summary: { store_id: storeId } },
  });
  await prismaClient.shiftTaxSummary.deleteMany({
    where: { shift_summary: { store_id: storeId } },
  });
  await prismaClient.shiftHourlySummary.deleteMany({
    where: { shift_summary: { store_id: storeId } },
  });
  await prismaClient.shiftSummary.deleteMany({
    where: { store_id: storeId },
  });

  // Delete day summaries
  await prismaClient.dayTenderSummary.deleteMany({
    where: { day_summary: { store_id: storeId } },
  });
  await prismaClient.dayDepartmentSummary.deleteMany({
    where: { day_summary: { store_id: storeId } },
  });
  await prismaClient.dayTaxSummary.deleteMany({
    where: { day_summary: { store_id: storeId } },
  });
  await prismaClient.dayHourlySummary.deleteMany({
    where: { day_summary: { store_id: storeId } },
  });
  await prismaClient.daySummary.deleteMany({
    where: { store_id: storeId },
  });

  // Delete shifts
  await prismaClient.shift.deleteMany({
    where: { store_id: storeId },
  });
}

// =============================================================================
// SECTION 1: AGGREGATION LOGIC TESTS
// =============================================================================

test.describe("DAY-SUMMARY-SERVICE: Aggregation Logic", () => {
  test("SVC-001: [P0] should correctly aggregate multiple shift summaries", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store with multiple closed shifts
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await createPOSTerminal(prismaClient, store.store_id);
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );

    const businessDate = new Date("2024-01-15");
    businessDate.setHours(0, 0, 0, 0);

    // Create first shift with specific values
    await createClosedShiftWithSummary(
      prismaClient,
      store.store_id,
      owner.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      businessDate,
      {
        gross_sales: 500,
        net_sales: 450,
        tax_collected: 40,
        transaction_count: 10,
        opening_cash: 100,
        closing_cash: 200,
        expected_cash: 200,
      },
    );

    // Create second shift with different values
    await createClosedShiftWithSummary(
      prismaClient,
      store.store_id,
      owner.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      businessDate,
      {
        gross_sales: 300,
        net_sales: 270,
        tax_collected: 24,
        transaction_count: 6,
        opening_cash: 100,
        closing_cash: 180,
        expected_cash: 180,
      },
    );

    try {
      // WHEN: Requesting the day summary (which triggers aggregation)
      const response = await superadminApiRequest.post(
        `/api/stores/${store.store_id}/day-summary/2024-01-15/refresh`,
      );

      // THEN: Should aggregate values correctly
      expect(response.status(), "Should return 200").toBe(200);
      const body = await response.json();
      expect(body.success, "Response should indicate success").toBe(true);

      // Verify aggregated values
      expect(body.data.shift_count, "Should count 2 shifts").toBe(2);
      expect(body.data.gross_sales, "Gross sales should sum to 800").toBe(800);
      expect(body.data.net_sales, "Net sales should sum to 720").toBe(720);
      expect(body.data.tax_collected, "Tax should sum to 64").toBe(64);
      expect(body.data.transaction_count, "Transactions should sum to 16").toBe(
        16,
      );
      expect(
        body.data.total_opening_cash,
        "Opening cash should sum to 200",
      ).toBe(200);
      expect(
        body.data.total_closing_cash,
        "Closing cash should sum to 380",
      ).toBe(380);
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.cashier.delete({
        where: { cashier_id: cashier.cashier_id },
      });
      await prismaClient.pOSTerminal.delete({
        where: { pos_terminal_id: terminal.pos_terminal_id },
      });
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });

  test("SVC-002: [P0] should calculate averages correctly", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store with shifts having transaction data
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await createPOSTerminal(prismaClient, store.store_id);
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );

    const businessDate = new Date("2024-01-15");
    businessDate.setHours(0, 0, 0, 0);

    await createClosedShiftWithSummary(
      prismaClient,
      store.store_id,
      owner.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      businessDate,
      {
        net_sales: 1000,
        transaction_count: 20,
      },
    );

    try {
      // WHEN: Refreshing the day summary
      const response = await superadminApiRequest.post(
        `/api/stores/${store.store_id}/day-summary/2024-01-15/refresh`,
      );

      // THEN: Should calculate avg_transaction correctly
      expect(response.status(), "Should return 200").toBe(200);
      const body = await response.json();

      // avg_transaction = net_sales / transaction_count = 1000 / 20 = 50
      expect(
        body.data.avg_transaction,
        "Average transaction should be 50",
      ).toBe(50);
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.cashier.delete({
        where: { cashier_id: cashier.cashier_id },
      });
      await prismaClient.pOSTerminal.delete({
        where: { pos_terminal_id: terminal.pos_terminal_id },
      });
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });

  test("SVC-003: [P1] should handle zero transactions without division error", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store with a shift but no transactions
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await createPOSTerminal(prismaClient, store.store_id);
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );

    const businessDate = new Date("2024-01-15");
    businessDate.setHours(0, 0, 0, 0);

    await createClosedShiftWithSummary(
      prismaClient,
      store.store_id,
      owner.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      businessDate,
      {
        net_sales: 0,
        transaction_count: 0,
      },
    );

    try {
      // WHEN: Refreshing the day summary
      const response = await superadminApiRequest.post(
        `/api/stores/${store.store_id}/day-summary/2024-01-15/refresh`,
      );

      // THEN: Should handle zero transactions without error
      expect(response.status(), "Should return 200").toBe(200);
      const body = await response.json();

      // avg_transaction should be 0, not NaN or error
      expect(body.data.avg_transaction, "Average should be 0 not NaN").toBe(0);
      expect(body.data.avg_items_per_txn, "Items per txn should be 0").toBe(0);
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.cashier.delete({
        where: { cashier_id: cashier.cashier_id },
      });
      await prismaClient.pOSTerminal.delete({
        where: { pos_terminal_id: terminal.pos_terminal_id },
      });
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });
});

// =============================================================================
// SECTION 2: STATUS TRANSITION TESTS
// =============================================================================

test.describe("DAY-SUMMARY-SERVICE: Status Transitions", () => {
  test("SVC-010: [P0] should set status to PENDING_CLOSE when all shifts are closed", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store with all shifts closed
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await createPOSTerminal(prismaClient, store.store_id);
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );

    const businessDate = new Date("2024-01-15");
    businessDate.setHours(0, 0, 0, 0);

    await createClosedShiftWithSummary(
      prismaClient,
      store.store_id,
      owner.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      businessDate,
    );

    try {
      // WHEN: Refreshing the day summary
      const response = await superadminApiRequest.post(
        `/api/stores/${store.store_id}/day-summary/2024-01-15/refresh`,
      );

      // THEN: Status should be PENDING_CLOSE
      expect(response.status(), "Should return 200").toBe(200);
      const body = await response.json();
      expect(body.data.status, "Status should be PENDING_CLOSE").toBe(
        "PENDING_CLOSE",
      );
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.cashier.delete({
        where: { cashier_id: cashier.cashier_id },
      });
      await prismaClient.pOSTerminal.delete({
        where: { pos_terminal_id: terminal.pos_terminal_id },
      });
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });

  test("SVC-011: [P0] should keep status OPEN when active shifts exist", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store with an active shift
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await createPOSTerminal(prismaClient, store.store_id);
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );

    const businessDate = new Date("2024-01-15");
    const openedAt = new Date(businessDate);
    openedAt.setHours(8, 0, 0, 0);

    // Create an ACTIVE shift
    await prismaClient.shift.create({
      data: {
        ...createShift({
          store_id: store.store_id,
          opened_by: owner.user_id,
          cashier_id: cashier.cashier_id,
          pos_terminal_id: terminal.pos_terminal_id,
          opening_cash: new Prisma.Decimal(100),
          status: "ACTIVE",
          opened_at: openedAt,
        }),
      },
    });

    try {
      // WHEN: Refreshing the day summary
      const response = await superadminApiRequest.post(
        `/api/stores/${store.store_id}/day-summary/2024-01-15/refresh`,
      );

      // THEN: Status should remain OPEN
      expect(response.status(), "Should return 200").toBe(200);
      const body = await response.json();
      expect(body.data.status, "Status should be OPEN").toBe("OPEN");
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.cashier.delete({
        where: { cashier_id: cashier.cashier_id },
      });
      await prismaClient.pOSTerminal.delete({
        where: { pos_terminal_id: terminal.pos_terminal_id },
      });
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });
});

// =============================================================================
// SECTION 3: EDGE CASES
// =============================================================================

test.describe("DAY-SUMMARY-SERVICE: Edge Cases", () => {
  test("SVC-020: [P1] should handle day with no shifts gracefully", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store with no shifts for the date
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    try {
      // WHEN: Refreshing a day with no shifts
      const response = await superadminApiRequest.post(
        `/api/stores/${store.store_id}/day-summary/2024-01-15/refresh`,
      );

      // THEN: Should create/update summary with zero values
      expect(response.status(), "Should return 200").toBe(200);
      const body = await response.json();
      expect(body.data.shift_count, "Shift count should be 0").toBe(0);
      expect(body.data.gross_sales, "Gross sales should be 0").toBe(0);
      expect(body.data.transaction_count, "Transaction count should be 0").toBe(
        0,
      );
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });

  test("SVC-021: [P1] should handle large decimal values correctly", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store with shift having large values
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await createPOSTerminal(prismaClient, store.store_id);
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );

    const businessDate = new Date("2024-01-15");
    businessDate.setHours(0, 0, 0, 0);

    await createClosedShiftWithSummary(
      prismaClient,
      store.store_id,
      owner.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      businessDate,
      {
        gross_sales: 999999.99,
        net_sales: 899999.99,
        tax_collected: 89999.99,
        transaction_count: 1000,
      },
    );

    try {
      // WHEN: Refreshing the day summary
      const response = await superadminApiRequest.post(
        `/api/stores/${store.store_id}/day-summary/2024-01-15/refresh`,
      );

      // THEN: Should handle large values without precision loss
      expect(response.status(), "Should return 200").toBe(200);
      const body = await response.json();
      expect(body.data.gross_sales, "Should preserve large gross_sales").toBe(
        999999.99,
      );
      expect(body.data.net_sales, "Should preserve large net_sales").toBe(
        899999.99,
      );
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.cashier.delete({
        where: { cashier_id: cashier.cashier_id },
      });
      await prismaClient.pOSTerminal.delete({
        where: { pos_terminal_id: terminal.pos_terminal_id },
      });
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });

  test("SVC-022: [P2] should track first_shift_opened and last_shift_closed correctly", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store with multiple shifts at different times
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await createPOSTerminal(prismaClient, store.store_id);
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );

    const businessDate = new Date("2024-01-15");
    businessDate.setHours(0, 0, 0, 0);

    // First shift: 6:00 AM - 2:00 PM
    const shift1OpenedAt = new Date(businessDate);
    shift1OpenedAt.setHours(6, 0, 0, 0);
    const shift1ClosedAt = new Date(businessDate);
    shift1ClosedAt.setHours(14, 0, 0, 0);

    // Second shift: 2:00 PM - 10:00 PM
    const shift2OpenedAt = new Date(businessDate);
    shift2OpenedAt.setHours(14, 0, 0, 0);
    const shift2ClosedAt = new Date(businessDate);
    shift2ClosedAt.setHours(22, 0, 0, 0);

    // Create shifts with specific times
    const shift1 = await prismaClient.shift.create({
      data: {
        ...createShift({
          store_id: store.store_id,
          opened_by: owner.user_id,
          cashier_id: cashier.cashier_id,
          pos_terminal_id: terminal.pos_terminal_id,
          status: "CLOSED",
          opened_at: shift1OpenedAt,
          closed_at: shift1ClosedAt,
        }),
      },
    });

    await prismaClient.shiftSummary.create({
      data: {
        shift_id: shift1.shift_id,
        store_id: store.store_id,
        business_date: businessDate,
        shift_opened_at: shift1OpenedAt,
        shift_closed_at: shift1ClosedAt,
        gross_sales: new Prisma.Decimal(100),
        net_sales: new Prisma.Decimal(90),
        returns_total: new Prisma.Decimal(0),
        discounts_total: new Prisma.Decimal(10),
        tax_collected: new Prisma.Decimal(8),
        tax_exempt_sales: new Prisma.Decimal(0),
        taxable_sales: new Prisma.Decimal(90),
        transaction_count: 5,
        void_count: 0,
        refund_count: 0,
        items_sold_count: 10,
        items_returned_count: 0,
        opening_cash: new Prisma.Decimal(100),
        closing_cash: new Prisma.Decimal(150),
        expected_cash: new Prisma.Decimal(150),
        cash_variance: new Prisma.Decimal(0),
      },
    });

    const shift2 = await prismaClient.shift.create({
      data: {
        ...createShift({
          store_id: store.store_id,
          opened_by: owner.user_id,
          cashier_id: cashier.cashier_id,
          pos_terminal_id: terminal.pos_terminal_id,
          status: "CLOSED",
          opened_at: shift2OpenedAt,
          closed_at: shift2ClosedAt,
        }),
      },
    });

    await prismaClient.shiftSummary.create({
      data: {
        shift_id: shift2.shift_id,
        store_id: store.store_id,
        business_date: businessDate,
        shift_opened_at: shift2OpenedAt,
        shift_closed_at: shift2ClosedAt,
        gross_sales: new Prisma.Decimal(200),
        net_sales: new Prisma.Decimal(180),
        returns_total: new Prisma.Decimal(0),
        discounts_total: new Prisma.Decimal(20),
        tax_collected: new Prisma.Decimal(16),
        tax_exempt_sales: new Prisma.Decimal(0),
        taxable_sales: new Prisma.Decimal(180),
        transaction_count: 8,
        void_count: 0,
        refund_count: 0,
        items_sold_count: 15,
        items_returned_count: 0,
        opening_cash: new Prisma.Decimal(100),
        closing_cash: new Prisma.Decimal(200),
        expected_cash: new Prisma.Decimal(200),
        cash_variance: new Prisma.Decimal(0),
      },
    });

    try {
      // WHEN: Refreshing the day summary
      const response = await superadminApiRequest.post(
        `/api/stores/${store.store_id}/day-summary/2024-01-15/refresh`,
      );

      // THEN: Should track first and last correctly
      expect(response.status(), "Should return 200").toBe(200);
      const body = await response.json();

      // First shift opened should be 6:00 AM
      const firstOpened = new Date(body.data.first_shift_opened);
      expect(firstOpened.getHours(), "First opened should be 6 AM").toBe(6);

      // Last shift closed should be 10:00 PM
      const lastClosed = new Date(body.data.last_shift_closed);
      expect(lastClosed.getHours(), "Last closed should be 10 PM").toBe(22);
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.cashier.delete({
        where: { cashier_id: cashier.cashier_id },
      });
      await prismaClient.pOSTerminal.delete({
        where: { pos_terminal_id: terminal.pos_terminal_id },
      });
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });
});

// =============================================================================
// SECTION 4: ERROR HANDLING TESTS
// =============================================================================

test.describe("DAY-SUMMARY-SERVICE: Error Handling", () => {
  test("SVC-030: [P0] should throw StoreNotFoundError for invalid store", async ({
    superadminApiRequest,
  }) => {
    // GIVEN: Non-existent store ID
    const nonExistentStoreId = "00000000-0000-0000-0000-000000000001";

    // WHEN: Attempting to refresh day summary
    const response = await superadminApiRequest.post(
      `/api/stores/${nonExistentStoreId}/day-summary/2024-01-15/refresh`,
    );

    // THEN: Should return 404 with STORE_NOT_FOUND
    expect(response.status(), "Should return 404").toBe(404);
    const body = await response.json();
    expect(body.success, "Should indicate failure").toBe(false);
    expect(body.error.code, "Should be STORE_NOT_FOUND").toBe(
      "STORE_NOT_FOUND",
    );
  });

  test("SVC-031: [P0] should throw DaySummaryNotFoundError when closing non-existent day", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store without a day summary for the date
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });

    try {
      // WHEN: Attempting to close a non-existent day
      const response = await superadminApiRequest.post(
        `/api/stores/${store.store_id}/day-summary/2024-01-15/close`,
      );

      // THEN: Should return 404
      expect(response.status(), "Should return 404").toBe(404);
      const body = await response.json();
      expect(body.success, "Should indicate failure").toBe(false);
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });
});

// =============================================================================
// SECTION 5: CONCURRENT UPDATES TEST
// =============================================================================

test.describe("DAY-SUMMARY-SERVICE: Concurrency", () => {
  test("SVC-040: [P2] should handle concurrent refresh requests gracefully", async ({
    superadminApiRequest,
    prismaClient,
  }) => {
    // GIVEN: Store with shifts
    const owner = await prismaClient.user.create({
      data: createUser({ name: "Store Owner" }),
    });
    const company = await prismaClient.company.create({
      data: createCompany({ owner_user_id: owner.user_id }),
    });
    const store = await prismaClient.store.create({
      data: createStore({ company_id: company.company_id }),
    });
    const terminal = await createPOSTerminal(prismaClient, store.store_id);
    const cashier = await createTestCashier(
      prismaClient,
      store.store_id,
      owner.user_id,
    );

    const businessDate = new Date("2024-01-15");
    businessDate.setHours(0, 0, 0, 0);

    await createClosedShiftWithSummary(
      prismaClient,
      store.store_id,
      owner.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      businessDate,
    );

    try {
      // WHEN: Making concurrent refresh requests
      const [response1, response2] = await Promise.all([
        superadminApiRequest.post(
          `/api/stores/${store.store_id}/day-summary/2024-01-15/refresh`,
        ),
        superadminApiRequest.post(
          `/api/stores/${store.store_id}/day-summary/2024-01-15/refresh`,
        ),
      ]);

      // THEN: Both should succeed (or one should fail gracefully)
      // The key is no crashes or data corruption
      const successCount = [response1.status(), response2.status()].filter(
        (s) => s === 200,
      ).length;
      expect(
        successCount,
        "At least one request should succeed",
      ).toBeGreaterThanOrEqual(1);
    } finally {
      await cleanupStoreData(prismaClient, store.store_id);
      await prismaClient.cashier.delete({
        where: { cashier_id: cashier.cashier_id },
      });
      await prismaClient.pOSTerminal.delete({
        where: { pos_terminal_id: terminal.pos_terminal_id },
      });
      await prismaClient.store.delete({ where: { store_id: store.store_id } });
      await prismaClient.company.delete({
        where: { company_id: company.company_id },
      });
      await prismaClient.user.delete({ where: { user_id: owner.user_id } });
    }
  });
});
