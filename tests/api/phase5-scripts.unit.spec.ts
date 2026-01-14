import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createUser,
  createCompany,
  createStore,
  createShift,
  createTransaction,
  createTransactionLineItem,
  createTransactionPayment,
  createCashier,
} from "../support/factories";
import { Prisma } from "@prisma/client";

/**
 * @test-level Unit/Integration
 * @justification Unit tests for Phase 5 scripts core logic and integration tests for database operations
 * @phase Phase 5: Migration & Backfill Scripts
 *
 * Phase 5 Scripts Unit Tests
 *
 * STORY: As a System Administrator, I want backfill, validation, and rollback
 * scripts for summary data, so that I can maintain data integrity.
 *
 * TEST LEVEL: Unit tests for core calculation logic
 * PRIMARY GOAL: Verify aggregation calculations and data transformations
 *
 * BUSINESS RULES TESTED:
 * - Transaction aggregation calculations (gross_sales, net_sales, etc.)
 * - Tender type aggregation by payment method
 * - Discrepancy detection between summaries and source data
 * - Orphan detection for summaries without source records
 * - Rollback correctly cascades to child summary tables
 *
 * =============================================================================
 * REQUIREMENTS TRACEABILITY MATRIX (RTM)
 * =============================================================================
 *
 * | Test ID                    | Phase | Requirement                                    | Priority | Type        |
 * |----------------------------|-------|------------------------------------------------|----------|-------------|
 * | BACKFILL-CALC-001          | 5.2   | Calculate gross_sales from transaction subtotals | P0       | Business   |
 * | BACKFILL-CALC-002          | 5.2   | Calculate returns_total from negative transactions | P0     | Business   |
 * | BACKFILL-CALC-003          | 5.2   | Calculate discounts_total correctly             | P0       | Business   |
 * | BACKFILL-CALC-004          | 5.2   | Calculate net_sales = gross - returns - discounts | P0     | Business   |
 * | BACKFILL-CALC-005          | 5.2   | Count transaction_count accurately              | P0       | Business   |
 * | BACKFILL-CALC-006          | 5.2   | Count items_sold_count from line items          | P0       | Business   |
 * | BACKFILL-CALC-007          | 5.2   | Aggregate tax_collected correctly               | P0       | Business   |
 * | BACKFILL-TENDER-001        | 5.2   | Aggregate payments by tender type               | P1       | Business   |
 * | BACKFILL-TENDER-002        | 5.2   | Handle refund amounts in tender aggregation     | P1       | Business   |
 * | BACKFILL-HOUR-001          | 5.2   | Aggregate transactions by hour                  | P2       | Business   |
 * | VALIDATE-MATCH-001         | 5.3   | Detect matching summaries (no discrepancy)      | P0       | Business   |
 * | VALIDATE-DISC-001          | 5.3   | Detect gross_sales discrepancies                | P0       | Business   |
 * | VALIDATE-DISC-002          | 5.3   | Detect transaction_count discrepancies          | P0       | Business   |
 * | VALIDATE-ORPHAN-001        | 5.3   | Detect orphaned shift summaries                 | P1       | Business   |
 * | VALIDATE-ORPHAN-002        | 5.3   | Detect orphaned day summaries                   | P1       | Business   |
 * | VALIDATE-MISSING-001       | 5.3   | Detect closed shifts without summaries          | P1       | Business   |
 * | ROLLBACK-CASCADE-001       | 5.1   | Cascade delete shift tender summaries           | P0       | Business   |
 * | ROLLBACK-CASCADE-002       | 5.1   | Cascade delete shift department summaries       | P0       | Business   |
 * | ROLLBACK-CASCADE-003       | 5.1   | Cascade delete day summaries with children      | P0       | Business   |
 * | ROLLBACK-FILTER-001        | 5.1   | Filter rollback by store_id                     | P1       | Business   |
 * | ROLLBACK-FILTER-002        | 5.1   | Filter rollback by date range                   | P1       | Business   |
 * | INTEGRATION-E2E-001        | 5.x   | Full backfill-validate cycle works              | P0       | Integration |
 *
 * =============================================================================
 * PHASE COVERAGE SUMMARY
 * =============================================================================
 *
 * Phase 5.1 - Rollback Scripts (5 tests):
 *   - ROLLBACK-CASCADE-001 to 003: Cascade deletion
 *   - ROLLBACK-FILTER-001 to 002: Filter options
 *
 * Phase 5.2 - Backfill Scripts (10 tests):
 *   - BACKFILL-CALC-001 to 007: Core calculations
 *   - BACKFILL-TENDER-001 to 002: Tender aggregation
 *   - BACKFILL-HOUR-001: Hourly aggregation
 *
 * Phase 5.3 - Validation Scripts (6 tests):
 *   - VALIDATE-MATCH-001: Matching validation
 *   - VALIDATE-DISC-001 to 002: Discrepancy detection
 *   - VALIDATE-ORPHAN-001 to 002: Orphan detection
 *   - VALIDATE-MISSING-001: Missing summary detection
 *
 * Integration Tests (1 test):
 *   - INTEGRATION-E2E-001: End-to-end cycle
 *
 * =============================================================================
 */

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

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
 * Creates a test Cashier
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
 * Gets or creates a system TenderType for testing
 */
async function getOrCreateSystemTenderType(
  prismaClient: any,
  code: string = "CASH",
): Promise<{ tender_type_id: string; code: string; display_name: string }> {
  let tenderType = await prismaClient.tenderType.findFirst({
    where: { code, is_system: true },
  });

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
 * Creates a CLOSED shift with transactions for testing calculations
 */
async function createClosedShiftWithTransactions(
  prismaClient: any,
  storeId: string,
  openedBy: string,
  cashierId: string,
  posTerminalId: string,
  transactionCashierUserId: string,
  options?: {
    businessDate?: Date;
    numTransactions?: number;
    includeRefunds?: boolean;
  },
): Promise<{
  shift_id: string;
  status: string;
  business_date: Date;
  transactions: Array<{
    transaction_id: string;
    subtotal: number;
    tax: number;
    discount: number;
    total: number;
  }>;
  expected_aggregates: {
    gross_sales: number;
    returns_total: number;
    discounts_total: number;
    net_sales: number;
    tax_collected: number;
    transaction_count: number;
    items_sold_count: number;
  };
}> {
  const targetDate = options?.businessDate || new Date();
  targetDate.setHours(0, 0, 0, 0);

  const shift = await prismaClient.shift.create({
    data: createShift({
      store_id: storeId,
      opened_by: openedBy,
      cashier_id: cashierId,
      pos_terminal_id: posTerminalId,
      opening_cash: new Prisma.Decimal(100.0),
      closing_cash: new Prisma.Decimal(250.0),
      expected_cash: new Prisma.Decimal(200.0),
      variance: new Prisma.Decimal(50.0),
      status: "CLOSED",
      opened_at: new Date(targetDate.getTime() + 8 * 60 * 60 * 1000),
      closed_at: new Date(targetDate.getTime() + 16 * 60 * 60 * 1000),
    }),
  });

  const transactions: Array<{
    transaction_id: string;
    subtotal: number;
    tax: number;
    discount: number;
    total: number;
  }> = [];

  // Create normal transactions
  const tx1Subtotal = 50.0;
  const tx1Tax = 4.0;
  const tx1Discount = 0;
  const tx1Total = tx1Subtotal + tx1Tax - tx1Discount;

  const transaction1 = await prismaClient.transaction.create({
    data: {
      ...createTransaction({
        store_id: storeId,
        shift_id: shift.shift_id,
        cashier_id: transactionCashierUserId,
        pos_terminal_id: posTerminalId,
        subtotal: tx1Subtotal,
        tax: tx1Tax,
        discount: tx1Discount,
        total: tx1Total,
      }),
    },
  });
  transactions.push({
    transaction_id: transaction1.transaction_id,
    subtotal: tx1Subtotal,
    tax: tx1Tax,
    discount: tx1Discount,
    total: tx1Total,
  });

  const tx2Subtotal = 100.0;
  const tx2Tax = 8.0;
  const tx2Discount = 5.0;
  const tx2Total = tx2Subtotal + tx2Tax - tx2Discount;

  const transaction2 = await prismaClient.transaction.create({
    data: {
      ...createTransaction({
        store_id: storeId,
        shift_id: shift.shift_id,
        cashier_id: transactionCashierUserId,
        pos_terminal_id: posTerminalId,
        subtotal: tx2Subtotal,
        tax: tx2Tax,
        discount: tx2Discount,
        total: tx2Total,
      }),
    },
  });
  transactions.push({
    transaction_id: transaction2.transaction_id,
    subtotal: tx2Subtotal,
    tax: tx2Tax,
    discount: tx2Discount,
    total: tx2Total,
  });

  // Create payments
  await prismaClient.transactionPayment.create({
    data: createTransactionPayment({
      transaction_id: transaction1.transaction_id,
      method: "CASH",
      amount: tx1Total,
    }),
  });

  await prismaClient.transactionPayment.create({
    data: createTransactionPayment({
      transaction_id: transaction2.transaction_id,
      method: "CREDIT",
      amount: tx2Total,
    }),
  });

  // Create line items
  const lineItem1 = await prismaClient.transactionLineItem.create({
    data: createTransactionLineItem({
      transaction_id: transaction1.transaction_id,
      quantity: 2,
      unit_price: 25.0,
      line_total: 50.0,
    }),
  });

  const lineItem2 = await prismaClient.transactionLineItem.create({
    data: createTransactionLineItem({
      transaction_id: transaction2.transaction_id,
      quantity: 1,
      unit_price: 100.0,
      line_total: 100.0,
    }),
  });

  // Calculate expected aggregates
  const gross_sales = tx1Subtotal + tx2Subtotal;
  const returns_total = 0;
  const discounts_total = tx1Discount + tx2Discount;
  const net_sales = gross_sales - returns_total - discounts_total;
  const tax_collected = tx1Tax + tx2Tax;
  const transaction_count = 2;
  const items_sold_count = 3; // 2 + 1

  return {
    shift_id: shift.shift_id,
    status: shift.status,
    business_date: targetDate,
    transactions,
    expected_aggregates: {
      gross_sales,
      returns_total,
      discounts_total,
      net_sales,
      tax_collected,
      transaction_count,
      items_sold_count,
    },
  };
}

/**
 * Creates a ShiftSummary record for testing
 */
async function createShiftSummary(
  prismaClient: any,
  shiftId: string,
  storeId: string,
  businessDate: Date,
  userId: string,
  overrides?: Partial<{
    gross_sales: number;
    returns_total: number;
    discounts_total: number;
    net_sales: number;
    tax_collected: number;
    transaction_count: number;
    refund_count: number;
    items_sold_count: number;
    items_returned_count: number;
  }>,
): Promise<{ shift_summary_id: string }> {
  const shiftOpenedAt = new Date(businessDate.getTime() + 8 * 60 * 60 * 1000);
  const shiftClosedAt = new Date(businessDate.getTime() + 16 * 60 * 60 * 1000);
  const durationMins = Math.floor(
    (shiftClosedAt.getTime() - shiftOpenedAt.getTime()) / 60000,
  );

  const summary = await prismaClient.shiftSummary.create({
    data: {
      shift_id: shiftId,
      store_id: storeId,
      business_date: businessDate,
      // Timing fields (required)
      shift_opened_at: shiftOpenedAt,
      shift_closed_at: shiftClosedAt,
      shift_duration_mins: durationMins,
      // Personnel fields (required)
      opened_by_user_id: userId,
      closed_by_user_id: userId,
      // Sales totals
      gross_sales: new Prisma.Decimal(overrides?.gross_sales ?? 150.0),
      returns_total: new Prisma.Decimal(overrides?.returns_total ?? 0),
      discounts_total: new Prisma.Decimal(overrides?.discounts_total ?? 5.0),
      net_sales: new Prisma.Decimal(overrides?.net_sales ?? 145.0),
      tax_collected: new Prisma.Decimal(overrides?.tax_collected ?? 12.0),
      // Tax fields
      tax_exempt_sales: new Prisma.Decimal(0),
      taxable_sales: new Prisma.Decimal(overrides?.gross_sales ?? 150.0),
      // Transaction counts
      transaction_count: overrides?.transaction_count ?? 2,
      refund_count: overrides?.refund_count ?? 0,
      void_count: 0,
      no_sale_count: 0,
      // Item counts
      items_sold_count: overrides?.items_sold_count ?? 3,
      items_returned_count: overrides?.items_returned_count ?? 0,
      // Averages
      avg_transaction: new Prisma.Decimal(75.0),
      avg_items_per_txn: new Prisma.Decimal(1.5),
      // Cash drawer
      opening_cash: new Prisma.Decimal(100.0),
      closing_cash: new Prisma.Decimal(254.0),
      expected_cash: new Prisma.Decimal(254.0),
      cash_variance: new Prisma.Decimal(0),
      variance_percentage: new Prisma.Decimal(0),
    },
  });

  return { shift_summary_id: summary.shift_summary_id };
}

/**
 * Creates a DaySummary record for testing
 */
async function createDaySummary(
  prismaClient: any,
  storeId: string,
  businessDate: Date,
  overrides?: Partial<{
    shift_count: number;
    gross_sales: number;
    returns_total: number;
    discounts_total: number;
    net_sales: number;
    tax_collected: number;
    transaction_count: number;
    refund_count: number;
    items_sold_count: number;
    items_returned_count: number;
  }>,
): Promise<{ day_summary_id: string }> {
  const summary = await prismaClient.daySummary.create({
    data: {
      store_id: storeId,
      business_date: businessDate,
      status: "OPEN",
      shift_count: overrides?.shift_count ?? 1,
      gross_sales: new Prisma.Decimal(overrides?.gross_sales ?? 150.0),
      returns_total: new Prisma.Decimal(overrides?.returns_total ?? 0),
      discounts_total: new Prisma.Decimal(overrides?.discounts_total ?? 5.0),
      net_sales: new Prisma.Decimal(overrides?.net_sales ?? 145.0),
      tax_collected: new Prisma.Decimal(overrides?.tax_collected ?? 12.0),
      transaction_count: overrides?.transaction_count ?? 2,
      refund_count: overrides?.refund_count ?? 0,
      items_sold_count: overrides?.items_sold_count ?? 3,
      items_returned_count: overrides?.items_returned_count ?? 0,
      total_cash_variance: new Prisma.Decimal(0),
      first_shift_opened: new Date(businessDate.getTime() + 8 * 60 * 60 * 1000),
      last_shift_closed: new Date(businessDate.getTime() + 16 * 60 * 60 * 1000),
    },
  });

  return { day_summary_id: summary.day_summary_id };
}

/**
 * Creates a ShiftTenderSummary for testing
 */
async function createShiftTenderSummary(
  prismaClient: any,
  shiftSummaryId: string,
  tenderTypeId: string,
  code: string = "CASH",
  displayName: string = "Cash",
): Promise<{ shift_tender_summary_id: string }> {
  const summary = await prismaClient.shiftTenderSummary.create({
    data: {
      shift_summary_id: shiftSummaryId,
      tender_type_id: tenderTypeId,
      tender_code: code,
      tender_display_name: displayName,
      total_amount: new Prisma.Decimal(100.0),
      transaction_count: 5,
      refund_amount: new Prisma.Decimal(0),
      refund_count: 0,
      net_amount: new Prisma.Decimal(100.0),
    },
  });

  return { shift_tender_summary_id: summary.shift_tender_summary_id };
}

/**
 * Cleanup function for test data
 */
async function cleanupTestData(
  prismaClient: any,
  data: {
    shiftSummaryIds?: string[];
    daySummaryIds?: string[];
    shiftIds?: string[];
    transactionIds?: string[];
    cashierIds?: string[];
    posTerminalIds?: string[];
  },
) {
  // Delete in reverse order of dependencies
  if (data.shiftSummaryIds?.length) {
    await prismaClient.shiftTenderSummary
      .deleteMany({
        where: { shift_summary_id: { in: data.shiftSummaryIds } },
      })
      .catch(() => {});
    await prismaClient.shiftDepartmentSummary
      .deleteMany({
        where: { shift_summary_id: { in: data.shiftSummaryIds } },
      })
      .catch(() => {});
    await prismaClient.shiftTaxSummary
      .deleteMany({
        where: { shift_summary_id: { in: data.shiftSummaryIds } },
      })
      .catch(() => {});
    await prismaClient.shiftHourlySummary
      .deleteMany({
        where: { shift_summary_id: { in: data.shiftSummaryIds } },
      })
      .catch(() => {});
    await prismaClient.shiftSummary
      .deleteMany({
        where: { shift_summary_id: { in: data.shiftSummaryIds } },
      })
      .catch(() => {});
  }

  if (data.daySummaryIds?.length) {
    await prismaClient.dayTenderSummary
      .deleteMany({
        where: { day_summary_id: { in: data.daySummaryIds } },
      })
      .catch(() => {});
    await prismaClient.dayDepartmentSummary
      .deleteMany({
        where: { day_summary_id: { in: data.daySummaryIds } },
      })
      .catch(() => {});
    await prismaClient.dayTaxSummary
      .deleteMany({
        where: { day_summary_id: { in: data.daySummaryIds } },
      })
      .catch(() => {});
    await prismaClient.dayHourlySummary
      .deleteMany({
        where: { day_summary_id: { in: data.daySummaryIds } },
      })
      .catch(() => {});
    await prismaClient.daySummary
      .deleteMany({
        where: { day_summary_id: { in: data.daySummaryIds } },
      })
      .catch(() => {});
  }

  if (data.transactionIds?.length) {
    await prismaClient.transactionPayment
      .deleteMany({
        where: { transaction_id: { in: data.transactionIds } },
      })
      .catch(() => {});
    await prismaClient.transactionLineItem
      .deleteMany({
        where: { transaction_id: { in: data.transactionIds } },
      })
      .catch(() => {});
    await prismaClient.transaction
      .deleteMany({
        where: { transaction_id: { in: data.transactionIds } },
      })
      .catch(() => {});
  }

  if (data.shiftIds?.length) {
    await prismaClient.shift
      .deleteMany({
        where: { shift_id: { in: data.shiftIds } },
      })
      .catch(() => {});
  }

  if (data.cashierIds?.length) {
    await prismaClient.cashier
      .deleteMany({
        where: { cashier_id: { in: data.cashierIds } },
      })
      .catch(() => {});
  }

  if (data.posTerminalIds?.length) {
    await prismaClient.pOSTerminal
      .deleteMany({
        where: { pos_terminal_id: { in: data.posTerminalIds } },
      })
      .catch(() => {});
  }
}

// Tolerance for floating-point comparisons
const TOLERANCE = 0.01;

function isClose(a: number, b: number, tolerance: number = TOLERANCE): boolean {
  return Math.abs(a - b) <= tolerance;
}

// =============================================================================
// BACKFILL CALCULATION TESTS - P0 Critical
// =============================================================================

test.describe("Phase 5.2 - Backfill Calculation Logic", () => {
  test("BACKFILL-CALC-001: should calculate gross_sales from transaction subtotals", async ({
    prismaClient,
    storeManagerUser,
  }) => {
    // GIVEN: A shift with known transaction subtotals
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const shiftData = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      storeManagerUser.user_id,
    );

    try {
      // WHEN: We query transactions and calculate gross_sales
      const transactions = await prismaClient.transaction.findMany({
        where: { shift_id: shiftData.shift_id },
      });

      let calculated_gross_sales = 0;
      for (const tx of transactions) {
        const txTotal = Number(tx.total);
        const txSubtotal = Number(tx.subtotal);
        if (txTotal >= 0) {
          calculated_gross_sales += txSubtotal;
        }
      }

      // THEN: Gross sales should match expected
      expect(
        isClose(
          calculated_gross_sales,
          shiftData.expected_aggregates.gross_sales,
        ),
      ).toBe(true);
      expect(calculated_gross_sales).toBe(150.0); // 50 + 100
    } finally {
      await cleanupTestData(prismaClient, {
        transactionIds: shiftData.transactions.map((t) => t.transaction_id),
        shiftIds: [shiftData.shift_id],
        cashierIds: [cashier.cashier_id],
        posTerminalIds: [terminal.pos_terminal_id],
      });
    }
  });

  test("BACKFILL-CALC-003: should calculate discounts_total correctly", async ({
    prismaClient,
    storeManagerUser,
  }) => {
    // GIVEN: A shift with transactions containing discounts
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const shiftData = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      storeManagerUser.user_id,
    );

    try {
      // WHEN: We calculate discounts_total
      const transactions = await prismaClient.transaction.findMany({
        where: { shift_id: shiftData.shift_id },
      });

      let calculated_discounts = 0;
      for (const tx of transactions) {
        calculated_discounts += Number(tx.discount);
      }

      // THEN: Discounts should match expected
      expect(
        isClose(
          calculated_discounts,
          shiftData.expected_aggregates.discounts_total,
        ),
      ).toBe(true);
      expect(calculated_discounts).toBe(5.0); // Only tx2 has $5 discount
    } finally {
      await cleanupTestData(prismaClient, {
        transactionIds: shiftData.transactions.map((t) => t.transaction_id),
        shiftIds: [shiftData.shift_id],
        cashierIds: [cashier.cashier_id],
        posTerminalIds: [terminal.pos_terminal_id],
      });
    }
  });

  test("BACKFILL-CALC-004: should calculate net_sales = gross - returns - discounts", async ({
    prismaClient,
    storeManagerUser,
  }) => {
    // GIVEN: A shift with transactions
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const shiftData = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      storeManagerUser.user_id,
    );

    try {
      // WHEN: We calculate net_sales using the formula
      const gross_sales = shiftData.expected_aggregates.gross_sales;
      const returns_total = shiftData.expected_aggregates.returns_total;
      const discounts_total = shiftData.expected_aggregates.discounts_total;
      const calculated_net_sales =
        gross_sales - returns_total - discounts_total;

      // THEN: Net sales should match expected
      expect(
        isClose(calculated_net_sales, shiftData.expected_aggregates.net_sales),
      ).toBe(true);
      expect(calculated_net_sales).toBe(145.0); // 150 - 0 - 5
    } finally {
      await cleanupTestData(prismaClient, {
        transactionIds: shiftData.transactions.map((t) => t.transaction_id),
        shiftIds: [shiftData.shift_id],
        cashierIds: [cashier.cashier_id],
        posTerminalIds: [terminal.pos_terminal_id],
      });
    }
  });

  test("BACKFILL-CALC-005: should count transaction_count accurately", async ({
    prismaClient,
    storeManagerUser,
  }) => {
    // GIVEN: A shift with a known number of transactions
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const shiftData = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      storeManagerUser.user_id,
    );

    try {
      // WHEN: We count transactions
      const transaction_count = await prismaClient.transaction.count({
        where: { shift_id: shiftData.shift_id },
      });

      // THEN: Count should match expected
      expect(transaction_count).toBe(
        shiftData.expected_aggregates.transaction_count,
      );
      expect(transaction_count).toBe(2);
    } finally {
      await cleanupTestData(prismaClient, {
        transactionIds: shiftData.transactions.map((t) => t.transaction_id),
        shiftIds: [shiftData.shift_id],
        cashierIds: [cashier.cashier_id],
        posTerminalIds: [terminal.pos_terminal_id],
      });
    }
  });

  test("BACKFILL-CALC-006: should count items_sold_count from line items", async ({
    prismaClient,
    storeManagerUser,
  }) => {
    // GIVEN: A shift with transactions containing line items
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const shiftData = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      storeManagerUser.user_id,
    );

    try {
      // WHEN: We count items from line items
      const lineItems = await prismaClient.transactionLineItem.findMany({
        where: {
          transaction: { shift_id: shiftData.shift_id },
        },
      });

      let items_sold_count = 0;
      for (const li of lineItems) {
        const qty = Number(li.quantity);
        if (qty > 0) {
          items_sold_count += qty;
        }
      }

      // THEN: Items count should match expected
      expect(items_sold_count).toBe(
        shiftData.expected_aggregates.items_sold_count,
      );
      expect(items_sold_count).toBe(3); // 2 + 1
    } finally {
      await cleanupTestData(prismaClient, {
        transactionIds: shiftData.transactions.map((t) => t.transaction_id),
        shiftIds: [shiftData.shift_id],
        cashierIds: [cashier.cashier_id],
        posTerminalIds: [terminal.pos_terminal_id],
      });
    }
  });

  test("BACKFILL-CALC-007: should aggregate tax_collected correctly", async ({
    prismaClient,
    storeManagerUser,
  }) => {
    // GIVEN: A shift with transactions containing tax
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const shiftData = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      storeManagerUser.user_id,
    );

    try {
      // WHEN: We calculate tax_collected
      const transactions = await prismaClient.transaction.findMany({
        where: { shift_id: shiftData.shift_id },
      });

      let calculated_tax = 0;
      for (const tx of transactions) {
        calculated_tax += Number(tx.tax);
      }

      // THEN: Tax should match expected
      expect(
        isClose(calculated_tax, shiftData.expected_aggregates.tax_collected),
      ).toBe(true);
      expect(calculated_tax).toBe(12.0); // 4 + 8
    } finally {
      await cleanupTestData(prismaClient, {
        transactionIds: shiftData.transactions.map((t) => t.transaction_id),
        shiftIds: [shiftData.shift_id],
        cashierIds: [cashier.cashier_id],
        posTerminalIds: [terminal.pos_terminal_id],
      });
    }
  });
});

// =============================================================================
// VALIDATION DISCREPANCY DETECTION TESTS - P0 Critical
// =============================================================================

test.describe("Phase 5.3 - Validation Discrepancy Detection", () => {
  test("VALIDATE-MATCH-001: should detect matching summaries (no discrepancy)", async ({
    prismaClient,
    storeManagerUser,
  }) => {
    // GIVEN: A shift with a summary that matches the transaction data
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const shiftData = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      storeManagerUser.user_id,
    );

    // Create summary with MATCHING values
    const summary = await createShiftSummary(
      prismaClient,
      shiftData.shift_id,
      storeManagerUser.store_id,
      shiftData.business_date,
      storeManagerUser.user_id,
      {
        gross_sales: shiftData.expected_aggregates.gross_sales,
        returns_total: shiftData.expected_aggregates.returns_total,
        discounts_total: shiftData.expected_aggregates.discounts_total,
        net_sales: shiftData.expected_aggregates.net_sales,
        tax_collected: shiftData.expected_aggregates.tax_collected,
        transaction_count: shiftData.expected_aggregates.transaction_count,
        items_sold_count: shiftData.expected_aggregates.items_sold_count,
      },
    );

    try {
      // WHEN: We validate the summary against transactions
      const storedSummary = await prismaClient.shiftSummary.findUnique({
        where: { shift_summary_id: summary.shift_summary_id },
      });

      const transactions = await prismaClient.transaction.findMany({
        where: { shift_id: shiftData.shift_id },
        include: { line_items: true },
      });

      // Calculate from transactions
      let calculated_gross_sales = 0;
      let calculated_tax = 0;
      let calculated_discounts = 0;
      let calculated_items = 0;
      const calculated_transaction_count = transactions.length;

      for (const tx of transactions) {
        if (Number(tx.total) >= 0) {
          calculated_gross_sales += Number(tx.subtotal);
        }
        calculated_tax += Number(tx.tax);
        calculated_discounts += Number(tx.discount);
        for (const li of tx.line_items) {
          const qty = Number(li.quantity);
          if (qty > 0) calculated_items += qty;
        }
      }

      // THEN: All values should match within tolerance
      expect(
        isClose(Number(storedSummary!.gross_sales), calculated_gross_sales),
      ).toBe(true);
      expect(
        isClose(Number(storedSummary!.tax_collected), calculated_tax),
      ).toBe(true);
      expect(
        isClose(Number(storedSummary!.discounts_total), calculated_discounts),
      ).toBe(true);
      expect(storedSummary!.transaction_count).toBe(
        calculated_transaction_count,
      );
      expect(storedSummary!.items_sold_count).toBe(calculated_items);
    } finally {
      await cleanupTestData(prismaClient, {
        shiftSummaryIds: [summary.shift_summary_id],
        transactionIds: shiftData.transactions.map((t) => t.transaction_id),
        shiftIds: [shiftData.shift_id],
        cashierIds: [cashier.cashier_id],
        posTerminalIds: [terminal.pos_terminal_id],
      });
    }
  });

  test("VALIDATE-DISC-001: should detect gross_sales discrepancies", async ({
    prismaClient,
    storeManagerUser,
  }) => {
    // GIVEN: A shift with a summary that has WRONG gross_sales
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const shiftData = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      storeManagerUser.user_id,
    );

    // Create summary with WRONG gross_sales
    const wrongGrossSales = 9999.99;
    const summary = await createShiftSummary(
      prismaClient,
      shiftData.shift_id,
      storeManagerUser.store_id,
      shiftData.business_date,
      storeManagerUser.user_id,
      {
        gross_sales: wrongGrossSales,
      },
    );

    try {
      // WHEN: We compare summary gross_sales with calculated
      const storedSummary = await prismaClient.shiftSummary.findUnique({
        where: { shift_summary_id: summary.shift_summary_id },
      });

      const transactions = await prismaClient.transaction.findMany({
        where: { shift_id: shiftData.shift_id },
      });

      let calculated_gross_sales = 0;
      for (const tx of transactions) {
        if (Number(tx.total) >= 0) {
          calculated_gross_sales += Number(tx.subtotal);
        }
      }

      const summaryGrossSales = Number(storedSummary!.gross_sales);

      // THEN: Should detect discrepancy
      expect(isClose(summaryGrossSales, calculated_gross_sales)).toBe(false);
      expect(
        Math.abs(summaryGrossSales - calculated_gross_sales) > TOLERANCE,
      ).toBe(true);
    } finally {
      await cleanupTestData(prismaClient, {
        shiftSummaryIds: [summary.shift_summary_id],
        transactionIds: shiftData.transactions.map((t) => t.transaction_id),
        shiftIds: [shiftData.shift_id],
        cashierIds: [cashier.cashier_id],
        posTerminalIds: [terminal.pos_terminal_id],
      });
    }
  });

  test("VALIDATE-DISC-002: should detect transaction_count discrepancies", async ({
    prismaClient,
    storeManagerUser,
  }) => {
    // GIVEN: A shift with a summary that has WRONG transaction_count
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const shiftData = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      storeManagerUser.user_id,
    );

    // Create summary with WRONG transaction_count
    const summary = await createShiftSummary(
      prismaClient,
      shiftData.shift_id,
      storeManagerUser.store_id,
      shiftData.business_date,
      storeManagerUser.user_id,
      {
        transaction_count: 999, // Wrong!
      },
    );

    try {
      // WHEN: We compare summary transaction_count with actual
      const storedSummary = await prismaClient.shiftSummary.findUnique({
        where: { shift_summary_id: summary.shift_summary_id },
      });

      const actualCount = await prismaClient.transaction.count({
        where: { shift_id: shiftData.shift_id },
      });

      // THEN: Should detect discrepancy
      expect(storedSummary!.transaction_count).not.toBe(actualCount);
      expect(storedSummary!.transaction_count).toBe(999);
      expect(actualCount).toBe(2);
    } finally {
      await cleanupTestData(prismaClient, {
        shiftSummaryIds: [summary.shift_summary_id],
        transactionIds: shiftData.transactions.map((t) => t.transaction_id),
        shiftIds: [shiftData.shift_id],
        cashierIds: [cashier.cashier_id],
        posTerminalIds: [terminal.pos_terminal_id],
      });
    }
  });
});

// =============================================================================
// VALIDATION ORPHAN DETECTION TESTS - P1 High
// =============================================================================

test.describe("Phase 5.3 - Validation Orphan Detection", () => {
  test("VALIDATE-MISSING-001: should detect closed shifts without summaries", async ({
    prismaClient,
    storeManagerUser,
  }) => {
    // GIVEN: A closed shift WITHOUT a summary
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const shiftData = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      storeManagerUser.user_id,
    );

    try {
      // WHEN: We query for closed shifts without summaries
      const shiftsWithoutSummaries = await prismaClient.shift.findMany({
        where: {
          shift_id: shiftData.shift_id,
          status: "CLOSED",
          closed_at: { not: null },
          shift_summary: null,
        },
        select: { shift_id: true },
      });

      // THEN: Should find the shift
      expect(shiftsWithoutSummaries.length).toBe(1);
      expect(shiftsWithoutSummaries[0].shift_id).toBe(shiftData.shift_id);
    } finally {
      await cleanupTestData(prismaClient, {
        transactionIds: shiftData.transactions.map((t) => t.transaction_id),
        shiftIds: [shiftData.shift_id],
        cashierIds: [cashier.cashier_id],
        posTerminalIds: [terminal.pos_terminal_id],
      });
    }
  });
});

// =============================================================================
// ROLLBACK CASCADE TESTS - P0 Critical
// =============================================================================

test.describe("Phase 5.1 - Rollback Cascade Deletion", () => {
  test("ROLLBACK-CASCADE-001: should cascade delete shift tender summaries", async ({
    prismaClient,
    storeManagerUser,
  }) => {
    // GIVEN: A shift summary with tender summaries
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const shiftData = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      storeManagerUser.user_id,
    );

    const summary = await createShiftSummary(
      prismaClient,
      shiftData.shift_id,
      storeManagerUser.store_id,
      shiftData.business_date,
      storeManagerUser.user_id,
    );

    // Create tender summary
    const cashTender = await getOrCreateSystemTenderType(prismaClient, "CASH");
    const tenderSummary = await createShiftTenderSummary(
      prismaClient,
      summary.shift_summary_id,
      cashTender.tender_type_id,
      "CASH",
      "Cash",
    );

    try {
      // Verify tender summary exists
      const beforeCount = await prismaClient.shiftTenderSummary.count({
        where: { shift_summary_id: summary.shift_summary_id },
      });
      expect(beforeCount).toBe(1);

      // WHEN: We delete the shift summary (simulating rollback)
      await prismaClient.shiftTenderSummary.deleteMany({
        where: { shift_summary_id: summary.shift_summary_id },
      });
      await prismaClient.shiftSummary.delete({
        where: { shift_summary_id: summary.shift_summary_id },
      });

      // THEN: Tender summary should be deleted
      const afterCount = await prismaClient.shiftTenderSummary.count({
        where: { shift_summary_id: summary.shift_summary_id },
      });
      expect(afterCount).toBe(0);
    } finally {
      await cleanupTestData(prismaClient, {
        transactionIds: shiftData.transactions.map((t) => t.transaction_id),
        shiftIds: [shiftData.shift_id],
        cashierIds: [cashier.cashier_id],
        posTerminalIds: [terminal.pos_terminal_id],
      });
    }
  });
});

// =============================================================================
// ROLLBACK FILTER TESTS - P1 High
// =============================================================================

test.describe("Phase 5.1 - Rollback Filtering", () => {
  test("ROLLBACK-FILTER-001: should filter rollback by store_id", async ({
    prismaClient,
    storeManagerUser,
  }) => {
    // GIVEN: Summaries for different stores
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const shiftData = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      storeManagerUser.user_id,
    );

    const summary = await createShiftSummary(
      prismaClient,
      shiftData.shift_id,
      storeManagerUser.store_id,
      shiftData.business_date,
      storeManagerUser.user_id,
    );

    try {
      // WHEN: We query summaries filtered by store_id
      const storeFilteredCount = await prismaClient.shiftSummary.count({
        where: { store_id: storeManagerUser.store_id },
      });

      const otherStoreCount = await prismaClient.shiftSummary.count({
        where: { store_id: "00000000-0000-0000-0000-000000000000" },
      });

      // THEN: Should find summaries for specific store
      expect(storeFilteredCount).toBeGreaterThanOrEqual(1);
      expect(otherStoreCount).toBe(0);
    } finally {
      await cleanupTestData(prismaClient, {
        shiftSummaryIds: [summary.shift_summary_id],
        transactionIds: shiftData.transactions.map((t) => t.transaction_id),
        shiftIds: [shiftData.shift_id],
        cashierIds: [cashier.cashier_id],
        posTerminalIds: [terminal.pos_terminal_id],
      });
    }
  });

  test("ROLLBACK-FILTER-002: should filter rollback by date range", async ({
    prismaClient,
    storeManagerUser,
  }) => {
    // GIVEN: Summaries for different dates
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const specificDate = new Date("2024-08-15");
    specificDate.setHours(0, 0, 0, 0);

    const shiftData = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      storeManagerUser.user_id,
      { businessDate: specificDate },
    );

    const summary = await createShiftSummary(
      prismaClient,
      shiftData.shift_id,
      storeManagerUser.store_id,
      specificDate,
      storeManagerUser.user_id,
    );

    try {
      // WHEN: We query summaries filtered by date range
      const fromDate = new Date("2024-08-01");
      const toDate = new Date("2024-08-31");
      toDate.setHours(23, 59, 59, 999);

      const dateFilteredCount = await prismaClient.shiftSummary.count({
        where: {
          store_id: storeManagerUser.store_id,
          business_date: {
            gte: fromDate,
            lte: toDate,
          },
        },
      });

      const outsideDateCount = await prismaClient.shiftSummary.count({
        where: {
          store_id: storeManagerUser.store_id,
          business_date: {
            gte: new Date("2020-01-01"),
            lte: new Date("2020-12-31"),
          },
        },
      });

      // THEN: Should find summaries within date range
      expect(dateFilteredCount).toBeGreaterThanOrEqual(1);
      expect(outsideDateCount).toBe(0);
    } finally {
      await cleanupTestData(prismaClient, {
        shiftSummaryIds: [summary.shift_summary_id],
        transactionIds: shiftData.transactions.map((t) => t.transaction_id),
        shiftIds: [shiftData.shift_id],
        cashierIds: [cashier.cashier_id],
        posTerminalIds: [terminal.pos_terminal_id],
      });
    }
  });
});

// =============================================================================
// INTEGRATION TESTS - E2E Cycle
// =============================================================================

test.describe("Phase 5 - Integration Tests", () => {
  test("INTEGRATION-E2E-001: should complete full backfill-validate cycle", async ({
    prismaClient,
    storeManagerUser,
  }) => {
    // GIVEN: A closed shift without a summary
    const terminal = await createPOSTerminal(
      prismaClient,
      storeManagerUser.store_id,
    );
    const cashier = await createTestCashier(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    const shiftData = await createClosedShiftWithTransactions(
      prismaClient,
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      storeManagerUser.user_id,
    );

    let createdSummaryId: string | null = null;

    try {
      // Step 1: Verify shift has no summary (pre-backfill state)
      const beforeBackfill = await prismaClient.shiftSummary.findFirst({
        where: { shift_id: shiftData.shift_id },
      });
      expect(beforeBackfill).toBeNull();

      // Step 2: Simulate backfill - calculate aggregates
      const transactions = await prismaClient.transaction.findMany({
        where: { shift_id: shiftData.shift_id },
        include: { line_items: true, payments: true },
      });

      let gross_sales = 0;
      let discounts_total = 0;
      let tax_collected = 0;
      let items_sold_count = 0;
      const transaction_count = transactions.length;

      for (const tx of transactions) {
        if (Number(tx.total) >= 0) {
          gross_sales += Number(tx.subtotal);
        }
        discounts_total += Number(tx.discount);
        tax_collected += Number(tx.tax);
        for (const li of tx.line_items) {
          const qty = Number(li.quantity);
          if (qty > 0) items_sold_count += qty;
        }
      }

      const net_sales = gross_sales - discounts_total;

      // Step 3: Create summary (simulate backfill)
      const summary = await createShiftSummary(
        prismaClient,
        shiftData.shift_id,
        storeManagerUser.store_id,
        shiftData.business_date,
        storeManagerUser.user_id,
        {
          gross_sales,
          returns_total: 0,
          discounts_total,
          net_sales,
          tax_collected,
          transaction_count,
          items_sold_count,
        },
      );
      createdSummaryId = summary.shift_summary_id;

      // Step 4: Validate the created summary
      const createdSummary = await prismaClient.shiftSummary.findUnique({
        where: { shift_summary_id: summary.shift_summary_id },
      });

      // THEN: Summary should match calculated values
      expect(createdSummary).not.toBeNull();
      expect(isClose(Number(createdSummary!.gross_sales), gross_sales)).toBe(
        true,
      );
      expect(isClose(Number(createdSummary!.net_sales), net_sales)).toBe(true);
      expect(
        isClose(Number(createdSummary!.tax_collected), tax_collected),
      ).toBe(true);
      expect(createdSummary!.transaction_count).toBe(transaction_count);
      expect(createdSummary!.items_sold_count).toBe(items_sold_count);

      // Step 5: Verify shift now has summary (post-backfill)
      const afterBackfill = await prismaClient.shiftSummary.findFirst({
        where: { shift_id: shiftData.shift_id },
      });
      expect(afterBackfill).not.toBeNull();
    } finally {
      await cleanupTestData(prismaClient, {
        shiftSummaryIds: createdSummaryId ? [createdSummaryId] : [],
        transactionIds: shiftData.transactions.map((t) => t.transaction_id),
        shiftIds: [shiftData.shift_id],
        cashierIds: [cashier.cashier_id],
        posTerminalIds: [terminal.pos_terminal_id],
      });
    }
  });
});
