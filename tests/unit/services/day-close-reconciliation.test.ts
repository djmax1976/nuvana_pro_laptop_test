/**
 * Day Close Reconciliation Service Unit Tests
 *
 * Tests for the daySummaryService.getReconciliation() method.
 * This method combines shift data + lottery data for a business day.
 *
 * @test-level Unit
 * @justification Unit tests for service layer business logic with real database
 * @story day-close-reconciliation
 * @priority P0 (Critical - Core Business Logic)
 *
 * ================================================================================
 * TRACEABILITY MATRIX
 * ================================================================================
 *
 * | Test ID                 | Requirement                    | Method                          | Priority |
 * |-------------------------|--------------------------------|---------------------------------|----------|
 * | RECON-SVC-001           | BIZ-001: Date Normalization    | getReconciliation()             | P0       |
 * | RECON-SVC-002           | BIZ-002: Empty Day Handling    | getReconciliation()             | P0       |
 * | RECON-SVC-003           | BIZ-003: Shift Aggregation     | getReconciliation()             | P1       |
 * | RECON-SVC-004           | BIZ-004: Lottery Aggregation   | getReconciliation()             | P1       |
 * | RECON-SVC-005           | BIZ-005: Day Totals Calc       | getReconciliation()             | P1       |
 * | RECON-SVC-006           | BIZ-006: Status Resolution     | getReconciliation()             | P1       |
 * | RECON-SVC-007           | BIZ-007: Closed By User Name   | getReconciliation()             | P2       |
 * | RECON-SVC-008           | BIZ-008: Lottery Totals Calc   | getReconciliation()             | P1       |
 * | RECON-SVC-010           | SEC-001: Tenant Isolation      | getReconciliation()             | P0       |
 * | RECON-SVC-011           | SEC-002: No Cross-Store Leak   | getReconciliation()             | P0       |
 *
 * REQUIREMENT COVERAGE:
 * - Business Logic (BIZ-001 to BIZ-008): 8 tests
 * - Security (SEC-001 to SEC-002): 2 tests
 * ================================================================================
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";
import { daySummaryService } from "../../../backend/src/services/day-summary.service";
import {
  createUser as createUserFactory,
  createCompany as createCompanyFactory,
  createStore as createStoreFactory,
} from "../../support/factories";

// =============================================================================
// TEST DATABASE SETUP
// =============================================================================

const prisma = new PrismaClient();

// Track created entities for cleanup
const createdEntities: {
  storeIds: string[];
  companyIds: string[];
  userIds: string[];
  shiftIds: string[];
  daySummaryIds: string[];
  lotteryDayIds: string[];
} = {
  storeIds: [],
  companyIds: [],
  userIds: [],
  shiftIds: [],
  daySummaryIds: [],
  lotteryDayIds: [],
};

beforeAll(async () => {
  // Verify we're using test database
  const dbUrl = process.env.DATABASE_URL || "";
  if (!dbUrl.includes("_test") && !dbUrl.includes("test")) {
    throw new Error("SAFETY: Must use test database for unit tests");
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

afterEach(async () => {
  // Cleanup in reverse order of creation (FK constraints)
  try {
    for (const storeId of createdEntities.storeIds) {
      await prisma.lotteryDayPack.deleteMany({
        where: { day: { store_id: storeId } },
      });
      await prisma.lotteryBusinessDay.deleteMany({
        where: { store_id: storeId },
      });
      await prisma.shiftSummary.deleteMany({ where: { store_id: storeId } });
      await prisma.dayTenderSummary.deleteMany({
        where: { day_summary: { store_id: storeId } },
      });
      await prisma.dayDepartmentSummary.deleteMany({
        where: { day_summary: { store_id: storeId } },
      });
      await prisma.dayTaxSummary.deleteMany({
        where: { day_summary: { store_id: storeId } },
      });
      await prisma.dayHourlySummary.deleteMany({
        where: { day_summary: { store_id: storeId } },
      });
      await prisma.daySummary.deleteMany({ where: { store_id: storeId } });
      await prisma.shift.deleteMany({ where: { store_id: storeId } });
      await prisma.lotteryPack.deleteMany({ where: { store_id: storeId } });
      await prisma.lotteryBin.deleteMany({ where: { store_id: storeId } });
      await prisma.lotteryGame.deleteMany({ where: { store_id: storeId } });
      await prisma.cashier.deleteMany({ where: { store_id: storeId } });
      await prisma.pOSTerminal.deleteMany({ where: { store_id: storeId } });
      await prisma.store.deleteMany({ where: { store_id: storeId } });
    }

    for (const companyId of createdEntities.companyIds) {
      await prisma.company.deleteMany({ where: { company_id: companyId } });
    }

    for (const userId of createdEntities.userIds) {
      await prisma.user.deleteMany({ where: { user_id: userId } });
    }
  } catch {
    // Cleanup errors can be safely ignored in tests
  }

  // Reset tracking
  createdEntities.storeIds = [];
  createdEntities.companyIds = [];
  createdEntities.userIds = [];
  createdEntities.shiftIds = [];
  createdEntities.daySummaryIds = [];
  createdEntities.lotteryDayIds = [];
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

async function createTestCompany(): Promise<{
  company_id: string;
  owner_user_id: string;
}> {
  // Create an owner user for the company
  const ownerData = createUserFactory();
  const owner = await prisma.user.create({ data: ownerData });
  createdEntities.userIds.push(owner.user_id);

  const companyData = createCompanyFactory({ owner_user_id: owner.user_id });
  const company = await prisma.company.create({ data: companyData });
  createdEntities.companyIds.push(company.company_id);
  return { company_id: company.company_id, owner_user_id: owner.user_id };
}

async function createTestStore(
  companyId: string,
): Promise<{ store_id: string; name: string }> {
  const storeData = createStoreFactory({ company_id: companyId });
  const store = await prisma.store.create({ data: storeData });
  createdEntities.storeIds.push(store.store_id);
  return store;
}

async function createTestUser(): Promise<{ user_id: string; name: string }> {
  const userData = createUserFactory();
  const user = await prisma.user.create({ data: userData });
  createdEntities.userIds.push(user.user_id);
  return user;
}

async function createTestCashier(
  storeId: string,
  createdBy: string,
): Promise<{ cashier_id: string; name: string }> {
  const cashier = await prisma.cashier.create({
    data: {
      store_id: storeId,
      employee_id: `${Math.floor(1000 + Math.random() * 9000)}`,
      name: `Test Cashier ${Date.now()}`,
      pin_hash: `$2b$10$test${Math.random().toString(36).substring(2, 15)}`,
      hired_on: new Date(),
      created_by: createdBy,
    },
  });
  return cashier;
}

async function createTestTerminal(
  storeId: string,
): Promise<{ pos_terminal_id: string }> {
  const terminal = await prisma.pOSTerminal.create({
    data: {
      store_id: storeId,
      name: `Terminal ${Date.now()}`,
      device_id: `device-${Date.now()}`,
    },
  });
  return terminal;
}

async function createTestShiftWithSummary(
  storeId: string,
  cashierId: string,
  openedBy: string,
  posTerminalId: string,
  businessDate: Date,
  options: {
    netSales?: number;
    transactionCount?: number;
    lotterySales?: number | null;
    lotteryTicketsSold?: number | null;
  } = {},
): Promise<{ shift_id: string; shift_summary_id: string }> {
  const {
    netSales = 150.0,
    transactionCount = 10,
    lotterySales = null,
    lotteryTicketsSold = null,
  } = options;

  const openedAt = new Date(businessDate);
  openedAt.setHours(8, 0, 0, 0);
  const closedAt = new Date(businessDate);
  closedAt.setHours(16, 0, 0, 0);

  const shift = await prisma.shift.create({
    data: {
      store_id: storeId,
      cashier_id: cashierId,
      opened_by: openedBy,
      pos_terminal_id: posTerminalId,
      status: "CLOSED",
      opened_at: openedAt,
      closed_at: closedAt,
      opening_cash: new Prisma.Decimal(100.0),
      closing_cash: new Prisma.Decimal(250.0),
      expected_cash: new Prisma.Decimal(200.0),
      variance: new Prisma.Decimal(50.0),
    },
  });
  createdEntities.shiftIds.push(shift.shift_id);

  const normalizedDate = new Date(businessDate);
  normalizedDate.setHours(0, 0, 0, 0);

  const durationMins = Math.floor(
    (closedAt.getTime() - openedAt.getTime()) / (60 * 1000),
  );

  const summary = await prisma.shiftSummary.create({
    data: {
      shift_id: shift.shift_id,
      store_id: storeId,
      business_date: normalizedDate,
      // Timing fields
      shift_opened_at: openedAt,
      shift_closed_at: closedAt,
      shift_duration_mins: durationMins,
      // Personnel fields
      opened_by_user_id: openedBy,
      closed_by_user_id: openedBy,
      // Sales totals
      gross_sales: new Prisma.Decimal(netSales * 1.1),
      returns_total: new Prisma.Decimal(0),
      discounts_total: new Prisma.Decimal(0),
      net_sales: new Prisma.Decimal(netSales),
      // Tax fields
      tax_collected: new Prisma.Decimal(netSales * 0.08),
      tax_exempt_sales: new Prisma.Decimal(0),
      taxable_sales: new Prisma.Decimal(netSales),
      // Transaction counts
      transaction_count: transactionCount,
      void_count: 0,
      refund_count: 0,
      no_sale_count: 0,
      // Item counts
      items_sold_count: transactionCount * 2,
      items_returned_count: 0,
      // Averages
      avg_transaction: new Prisma.Decimal(netSales / (transactionCount || 1)),
      avg_items_per_txn: new Prisma.Decimal(2.0),
      // Cash drawer reconciliation
      opening_cash: new Prisma.Decimal(100.0),
      closing_cash: new Prisma.Decimal(250.0),
      expected_cash: new Prisma.Decimal(200.0),
      cash_variance: new Prisma.Decimal(50.0),
      variance_percentage: new Prisma.Decimal(0),
      variance_approved: true,
      // Lottery fields
      lottery_sales:
        lotterySales !== null ? new Prisma.Decimal(lotterySales) : null,
      lottery_tickets_sold: lotteryTicketsSold,
    },
  });

  return {
    shift_id: shift.shift_id,
    shift_summary_id: summary.shift_summary_id,
  };
}

async function createTestDaySummary(
  storeId: string,
  businessDate: Date,
  status: "OPEN" | "PENDING_CLOSE" | "CLOSED" = "OPEN",
  closedBy?: string,
): Promise<{ day_summary_id: string }> {
  const normalizedDate = new Date(businessDate);
  normalizedDate.setHours(0, 0, 0, 0);

  const daySummary = await prisma.daySummary.create({
    data: {
      store_id: storeId,
      business_date: normalizedDate,
      status,
      shift_count: 2,
      gross_sales: new Prisma.Decimal(1000.0),
      net_sales: new Prisma.Decimal(900.0),
      tax_collected: new Prisma.Decimal(80.0),
      transaction_count: 50,
      total_opening_cash: new Prisma.Decimal(200.0),
      total_closing_cash: new Prisma.Decimal(500.0),
      total_expected_cash: new Prisma.Decimal(450.0),
      total_cash_variance: new Prisma.Decimal(50.0),
      lottery_sales: new Prisma.Decimal(100.0),
      lottery_tickets_sold: 20,
      closed_at: status === "CLOSED" ? new Date() : null,
      closed_by: closedBy || null,
    },
  });
  createdEntities.daySummaryIds.push(daySummary.day_summary_id);

  return { day_summary_id: daySummary.day_summary_id };
}

async function createTestLotteryDayWithPacks(
  storeId: string,
  businessDate: Date,
  status: "OPEN" | "PENDING_CLOSE" | "CLOSED" = "CLOSED",
  closedBy?: string,
): Promise<{ day_id: string; totalSales: number; totalTickets: number }> {
  const normalizedDate = new Date(businessDate);
  normalizedDate.setHours(0, 0, 0, 0);

  // Create game
  const game = await prisma.lotteryGame.create({
    data: {
      name: `Test Game ${Date.now()}`,
      game_code: `${Math.floor(1000 + Math.random() * 9000)}`,
      price: 5.0,
      pack_value: 150,
      status: "ACTIVE",
      store_id: storeId,
    },
  });

  // Create bin
  const bin = await prisma.lotteryBin.create({
    data: {
      store_id: storeId,
      name: `Test Bin ${Date.now()}`,
      display_order: 0,
      is_active: true,
    },
  });

  // Create pack
  const pack = await prisma.lotteryPack.create({
    data: {
      game_id: game.game_id,
      store_id: storeId,
      pack_number: `UNIT-${Date.now()}`,
      serial_start: "001",
      serial_end: "050",
      status: "ACTIVE",
      activated_at: new Date(),
      current_bin_id: bin.bin_id,
      tickets_sold_count: 20,
    },
  });

  // Create lottery day
  const lotteryDay = await prisma.lotteryBusinessDay.create({
    data: {
      store_id: storeId,
      business_date: normalizedDate,
      status,
      opened_at: new Date(),
      closed_at: status === "CLOSED" ? new Date() : null,
      closed_by: closedBy || null,
    },
  });
  createdEntities.lotteryDayIds.push(lotteryDay.day_id);

  // Create day pack
  const ticketsSold = 20;
  const salesAmount = ticketsSold * 5; // $5 per ticket

  await prisma.lotteryDayPack.create({
    data: {
      day_id: lotteryDay.day_id,
      pack_id: pack.pack_id,
      starting_serial: "001",
      ending_serial: "020",
      tickets_sold: ticketsSold,
      sales_amount: new Prisma.Decimal(salesAmount),
    },
  });

  return {
    day_id: lotteryDay.day_id,
    totalSales: salesAmount,
    totalTickets: ticketsSold,
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe("DaySummaryService.getReconciliation()", () => {
  describe("RECON-SVC: Date Handling", () => {
    it("RECON-SVC-001: [P0] should normalize date to start of day", async () => {
      // GIVEN: Company and store
      const company = await createTestCompany();
      const store = await createTestStore(company.company_id);

      // Business date with time component
      const businessDateWithTime = new Date("2026-01-15T14:30:00.000Z");

      // WHEN: Calling getReconciliation
      const result = await daySummaryService.getReconciliation(
        store.store_id,
        businessDateWithTime,
      );

      // THEN: business_date should be normalized to YYYY-MM-DD
      expect(result.business_date).toBe("2026-01-15");
    });

    it("RECON-SVC-002: [P0] should return empty data for day with no records", async () => {
      // GIVEN: Empty store
      const company = await createTestCompany();
      const store = await createTestStore(company.company_id);
      // eslint-disable-next-line no-restricted-syntax -- Test uses specific hardcoded business date
      const emptyDate = new Date("2020-01-01");

      // WHEN: Calling getReconciliation
      const result = await daySummaryService.getReconciliation(
        store.store_id,
        emptyDate,
      );

      // THEN: Should return empty arrays with default status
      expect(result.status).toBe("OPEN");
      expect(result.shifts).toEqual([]);
      expect(result.lottery.bins_closed).toEqual([]);
      expect(result.lottery.is_closed).toBe(false);
      expect(result.lottery.total_sales).toBe(0);
      expect(result.lottery.total_tickets_sold).toBe(0);
    });
  });

  describe("RECON-SVC: Shift Aggregation", () => {
    it("RECON-SVC-003: [P1] should aggregate all shifts for business date", async () => {
      // GIVEN: Store with multiple shifts
      const company = await createTestCompany();
      const store = await createTestStore(company.company_id);
      const user = await createTestUser();
      const cashier1 = await createTestCashier(store.store_id, user.user_id);
      const cashier2 = await createTestCashier(store.store_id, user.user_id);
      const terminal = await createTestTerminal(store.store_id);
      // eslint-disable-next-line no-restricted-syntax -- Test uses specific hardcoded business date
      const businessDate = new Date("2026-01-15");

      // Create two shifts
      await createTestShiftWithSummary(
        store.store_id,
        cashier1.cashier_id,
        user.user_id,
        terminal.pos_terminal_id,
        businessDate,
        { netSales: 100.0, transactionCount: 5 },
      );

      await createTestShiftWithSummary(
        store.store_id,
        cashier2.cashier_id,
        user.user_id,
        terminal.pos_terminal_id,
        businessDate,
        { netSales: 200.0, transactionCount: 10 },
      );

      // WHEN: Calling getReconciliation
      const result = await daySummaryService.getReconciliation(
        store.store_id,
        businessDate,
      );

      // THEN: Should return both shifts
      expect(result.shifts.length).toBe(2);

      // Verify shift structure
      for (const shift of result.shifts) {
        expect(shift).toHaveProperty("shift_id");
        expect(shift).toHaveProperty("cashier_name");
        expect(shift).toHaveProperty("opened_at");
        expect(shift).toHaveProperty("closed_at");
        expect(shift).toHaveProperty("status");
        expect(shift).toHaveProperty("net_sales");
        expect(shift).toHaveProperty("transaction_count");
      }
    });
  });

  describe("RECON-SVC: Lottery Aggregation", () => {
    it("RECON-SVC-004: [P1] should aggregate lottery bins closed", async () => {
      // GIVEN: Store with closed lottery day
      const company = await createTestCompany();
      const store = await createTestStore(company.company_id);
      const user = await createTestUser();
      // eslint-disable-next-line no-restricted-syntax -- Test uses specific hardcoded business date
      const businessDate = new Date("2026-01-15");

      await createTestLotteryDayWithPacks(
        store.store_id,
        businessDate,
        "CLOSED",
        user.user_id,
      );

      // WHEN: Calling getReconciliation
      const result = await daySummaryService.getReconciliation(
        store.store_id,
        businessDate,
      );

      // THEN: Should return lottery data
      expect(result.lottery.is_closed).toBe(true);
      expect(result.lottery.bins_closed.length).toBeGreaterThan(0);

      // Verify bin structure
      const bin = result.lottery.bins_closed[0];
      expect(bin).toHaveProperty("bin_number");
      expect(bin).toHaveProperty("pack_number");
      expect(bin).toHaveProperty("game_name");
      expect(bin).toHaveProperty("game_price");
      expect(bin).toHaveProperty("starting_serial");
      expect(bin).toHaveProperty("closing_serial");
      expect(bin).toHaveProperty("tickets_sold");
      expect(bin).toHaveProperty("sales_amount");
    });

    it("RECON-SVC-008: [P1] should calculate correct lottery totals from bins", async () => {
      // GIVEN: Store with closed lottery day with known values
      const company = await createTestCompany();
      const store = await createTestStore(company.company_id);
      const user = await createTestUser();
      // eslint-disable-next-line no-restricted-syntax -- Test uses specific hardcoded business date
      const businessDate = new Date("2026-01-15");

      const lotteryData = await createTestLotteryDayWithPacks(
        store.store_id,
        businessDate,
        "CLOSED",
        user.user_id,
      );

      // WHEN: Calling getReconciliation
      const result = await daySummaryService.getReconciliation(
        store.store_id,
        businessDate,
      );

      // THEN: Totals should match expected values
      expect(result.lottery.total_sales).toBe(lotteryData.totalSales);
      expect(result.lottery.total_tickets_sold).toBe(lotteryData.totalTickets);
    });
  });

  describe("RECON-SVC: Day Totals", () => {
    it("RECON-SVC-005: [P1] should return day totals from DaySummary", async () => {
      // GIVEN: Store with day summary
      const company = await createTestCompany();
      const store = await createTestStore(company.company_id);
      const user = await createTestUser();
      // eslint-disable-next-line no-restricted-syntax -- Test uses specific hardcoded business date
      const businessDate = new Date("2026-01-15");

      await createTestDaySummary(
        store.store_id,
        businessDate,
        "CLOSED",
        user.user_id,
      );

      // WHEN: Calling getReconciliation
      const result = await daySummaryService.getReconciliation(
        store.store_id,
        businessDate,
      );

      // THEN: Day totals should be populated
      expect(result.day_totals.shift_count).toBe(2);
      expect(result.day_totals.gross_sales).toBe(1000.0);
      expect(result.day_totals.net_sales).toBe(900.0);
      expect(result.day_totals.tax_collected).toBe(80.0);
      expect(result.day_totals.transaction_count).toBe(50);
      expect(result.day_totals.total_opening_cash).toBe(200.0);
      expect(result.day_totals.total_closing_cash).toBe(500.0);
      expect(result.day_totals.total_expected_cash).toBe(450.0);
      expect(result.day_totals.total_cash_variance).toBe(50.0);
    });
  });

  describe("RECON-SVC: Status Resolution", () => {
    it("RECON-SVC-006: [P1] should return correct status for closed day", async () => {
      // GIVEN: Store with closed day summary
      const company = await createTestCompany();
      const store = await createTestStore(company.company_id);
      const user = await createTestUser();
      // eslint-disable-next-line no-restricted-syntax -- Test uses specific hardcoded business date
      const businessDate = new Date("2026-01-15");

      await createTestDaySummary(
        store.store_id,
        businessDate,
        "CLOSED",
        user.user_id,
      );

      // WHEN: Calling getReconciliation
      const result = await daySummaryService.getReconciliation(
        store.store_id,
        businessDate,
      );

      // THEN: Status should be CLOSED
      expect(result.status).toBe("CLOSED");
      expect(result.closed_at).not.toBeNull();
      expect(result.closed_by).not.toBeNull();
    });

    it("RECON-SVC-007: [P2] should return closed_by_name for closed day", async () => {
      // GIVEN: Store with closed day summary and user
      const company = await createTestCompany();
      const store = await createTestStore(company.company_id);
      const user = await createTestUser();
      // eslint-disable-next-line no-restricted-syntax -- Test uses specific hardcoded business date
      const businessDate = new Date("2026-01-15");

      await createTestDaySummary(
        store.store_id,
        businessDate,
        "CLOSED",
        user.user_id,
      );

      // WHEN: Calling getReconciliation
      const result = await daySummaryService.getReconciliation(
        store.store_id,
        businessDate,
      );

      // THEN: closed_by_name should be populated with user's name
      expect(result.closed_by_name).not.toBeNull();
      // Factory creates names starting with "Test "
      expect(result.closed_by_name).toContain("Test ");
    });
  });

  describe("RECON-SVC: Tenant Isolation", () => {
    it("RECON-SVC-010: [P0] should only return data for specified store", async () => {
      // GIVEN: Two stores with data
      const company = await createTestCompany();
      const store1 = await createTestStore(company.company_id);
      const store2 = await createTestStore(company.company_id);
      const user = await createTestUser();
      // eslint-disable-next-line no-restricted-syntax -- Test uses specific hardcoded business date
      const businessDate = new Date("2026-01-15");

      // Create data for both stores
      const cashier1 = await createTestCashier(store1.store_id, user.user_id);
      const terminal1 = await createTestTerminal(store1.store_id);
      await createTestShiftWithSummary(
        store1.store_id,
        cashier1.cashier_id,
        user.user_id,
        terminal1.pos_terminal_id,
        businessDate,
        { netSales: 100.0 },
      );

      const cashier2 = await createTestCashier(store2.store_id, user.user_id);
      const terminal2 = await createTestTerminal(store2.store_id);
      await createTestShiftWithSummary(
        store2.store_id,
        cashier2.cashier_id,
        user.user_id,
        terminal2.pos_terminal_id,
        businessDate,
        { netSales: 200.0 },
      );

      // WHEN: Calling getReconciliation for store1
      const result = await daySummaryService.getReconciliation(
        store1.store_id,
        businessDate,
      );

      // THEN: Should only return store1 data
      expect(result.store_id).toBe(store1.store_id);
      expect(result.shifts.length).toBe(1);
      expect(result.shifts[0].net_sales).toBe(100.0);
    });

    it("RECON-SVC-011: [P0] should not leak data from other stores", async () => {
      // GIVEN: Two stores, only one has lottery data
      const company = await createTestCompany();
      const store1 = await createTestStore(company.company_id);
      const store2 = await createTestStore(company.company_id);
      const user = await createTestUser();
      // eslint-disable-next-line no-restricted-syntax -- Test uses specific hardcoded business date
      const businessDate = new Date("2026-01-15");

      // Only store2 has lottery data
      await createTestLotteryDayWithPacks(
        store2.store_id,
        businessDate,
        "CLOSED",
        user.user_id,
      );

      // WHEN: Calling getReconciliation for store1
      const result = await daySummaryService.getReconciliation(
        store1.store_id,
        businessDate,
      );

      // THEN: Should not contain store2's lottery data
      expect(result.lottery.is_closed).toBe(false);
      expect(result.lottery.bins_closed.length).toBe(0);
    });
  });
});
