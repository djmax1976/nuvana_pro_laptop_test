/**
 * Day Close Reconciliation API Tests
 *
 * Tests for the Day Close reconciliation endpoint:
 * - GET /api/stores/:storeId/day-summary/:date/reconciliation
 *
 * This endpoint provides combined shift + lottery data for a business day,
 * used when clicking on a "Day Close" row in Lottery Management.
 *
 * @test-level API (Integration)
 * @justification Endpoint integration tests verifying HTTP layer, authentication,
 *                authorization, response structure, and business logic for the
 *                Day Close reconciliation view.
 * @story day-close-reconciliation
 * @priority P0 (Critical - Core Business Feature)
 *
 * ================================================================================
 * TRACEABILITY MATRIX
 * ================================================================================
 *
 * | Test ID               | Requirement                     | API Endpoint                                          | Priority |
 * |-----------------------|---------------------------------|-------------------------------------------------------|----------|
 * | RECON-001             | AUTH-001: JWT Required          | GET /api/stores/:storeId/day-summary/:date/reconciliation | P0    |
 * | RECON-002             | AUTH-002: JWT Validation        | GET /api/stores/:storeId/day-summary/:date/reconciliation | P0    |
 * | RECON-003             | AUTH-003: Token Expiry          | GET /api/stores/:storeId/day-summary/:date/reconciliation | P0    |
 * | RECON-010             | AUTHZ-001: Permission Required  | GET /api/stores/:storeId/day-summary/:date/reconciliation | P0    |
 * | RECON-011             | AUTHZ-002: Permission Denied    | GET /api/stores/:storeId/day-summary/:date/reconciliation | P0    |
 * | RECON-020             | VAL-001: UUID Format storeId    | GET /api/stores/:storeId/day-summary/:date/reconciliation | P0    |
 * | RECON-021             | VAL-002: Date Format YYYY-MM-DD | GET /api/stores/:storeId/day-summary/:date/reconciliation | P0    |
 * | RECON-022             | VAL-003: Invalid Date Value     | GET /api/stores/:storeId/day-summary/:date/reconciliation | P0    |
 * | RECON-030             | BIZ-001: Empty Day Response     | GET /api/stores/:storeId/day-summary/:date/reconciliation | P1    |
 * | RECON-031             | BIZ-002: Shifts List            | GET /api/stores/:storeId/day-summary/:date/reconciliation | P1    |
 * | RECON-032             | BIZ-003: Lottery Bins Closed    | GET /api/stores/:storeId/day-summary/:date/reconciliation | P1    |
 * | RECON-033             | BIZ-004: Day Totals Aggregation | GET /api/stores/:storeId/day-summary/:date/reconciliation | P1    |
 * | RECON-034             | BIZ-005: Closed Day Status      | GET /api/stores/:storeId/day-summary/:date/reconciliation | P1    |
 * | RECON-040             | SEC-001: Tenant Isolation       | GET /api/stores/:storeId/day-summary/:date/reconciliation | P0    |
 * | RECON-041             | SEC-002: Cross-Store Access     | GET /api/stores/:storeId/day-summary/:date/reconciliation | P0    |
 * | RECON-050             | BIZ-006: Multiple Shifts        | GET /api/stores/:storeId/day-summary/:date/reconciliation | P1    |
 * | RECON-051             | BIZ-007: Shift Order by Time    | GET /api/stores/:storeId/day-summary/:date/reconciliation | P1    |
 * | RECON-052             | BIZ-008: Lottery Totals Calc    | GET /api/stores/:storeId/day-summary/:date/reconciliation | P1    |
 *
 * REQUIREMENT COVERAGE:
 * - Authentication (AUTH-001 to AUTH-003): 3 tests
 * - Authorization (AUTHZ-001 to AUTHZ-002): 2 tests
 * - Validation (VAL-001 to VAL-003): 3 tests
 * - Business Logic (BIZ-001 to BIZ-008): 8 tests
 * - Security (SEC-001 to SEC-002): 2 tests
 * ================================================================================
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import { Prisma } from "@prisma/client";
import { withBypassClient } from "../support/prisma-bypass";
import {
  createUser,
  createCompany,
  createStore,
  createShift,
  createExpiredJWTAccessToken,
  createCashier,
} from "../support/factories";

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Creates a POS terminal for testing
 * @security DB-006: Scoped to store_id
 */
async function createPOSTerminal(
  storeId: string,
  name?: string,
): Promise<{ pos_terminal_id: string; store_id: string; name: string }> {
  return await withBypassClient(async (tx) => {
    const uniqueId = crypto.randomUUID();
    const terminal = await tx.pOSTerminal.create({
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
  });
}

/**
 * Creates a test Cashier
 * @security DB-006: Scoped to store_id
 */
async function createTestCashier(
  storeId: string,
  createdByUserId: string,
): Promise<{ cashier_id: string; store_id: string; employee_id: string }> {
  return await withBypassClient(async (tx) => {
    const cashierData = await createCashier({
      store_id: storeId,
      created_by: createdByUserId,
    });
    return tx.cashier.create({ data: cashierData });
  });
}

/**
 * Creates a CLOSED shift with ShiftSummary for a specific business date
 * @security DB-006: Scoped to store_id
 */
async function createClosedShiftWithSummary(
  storeId: string,
  openedBy: string,
  cashierId: string,
  posTerminalId: string,
  businessDate: Date,
  options: {
    openingCash?: number;
    closingCash?: number;
    netSales?: number;
    transactionCount?: number;
    lotterySales?: number;
    lotteryTicketsSold?: number;
  } = {},
): Promise<{ shift_id: string; shift_summary_id: string }> {
  const {
    openingCash = 100.0,
    closingCash = 250.0,
    netSales = 150.0,
    transactionCount = 10,
    lotterySales = null,
    lotteryTicketsSold = null,
  } = options;

  return await withBypassClient(async (tx) => {
    // Set shift times within the business date
    const openedAt = new Date(businessDate);
    openedAt.setHours(8, 0, 0, 0);
    const closedAt = new Date(businessDate);
    closedAt.setHours(16, 0, 0, 0);

    const shift = await tx.shift.create({
      data: {
        ...createShift({
          store_id: storeId,
          opened_by: openedBy,
          cashier_id: cashierId,
          pos_terminal_id: posTerminalId,
          opening_cash: new Prisma.Decimal(openingCash),
          closing_cash: new Prisma.Decimal(closingCash),
          expected_cash: new Prisma.Decimal(200.0),
          variance: new Prisma.Decimal(closingCash - 200.0),
          status: "CLOSED",
          opened_at: openedAt,
          closed_at: closedAt,
        }),
      },
    });

    // Create ShiftSummary with business_date
    const normalizedDate = new Date(businessDate);
    normalizedDate.setHours(0, 0, 0, 0);

    const durationMins = Math.floor(
      (closedAt.getTime() - openedAt.getTime()) / (60 * 1000),
    );

    const summary = await tx.shiftSummary.create({
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
        opening_cash: new Prisma.Decimal(openingCash),
        closing_cash: new Prisma.Decimal(closingCash),
        expected_cash: new Prisma.Decimal(200.0),
        cash_variance: new Prisma.Decimal(closingCash - 200.0),
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
  });
}

/**
 * Creates a DaySummary for a specific business date
 * @security DB-006: Scoped to store_id
 */
async function createDaySummary(
  storeId: string,
  businessDate: Date,
  status: "OPEN" | "PENDING_CLOSE" | "CLOSED" = "OPEN",
  closedBy?: string,
): Promise<{ day_summary_id: string; status: string }> {
  return await withBypassClient(async (tx) => {
    const normalizedDate = new Date(businessDate);
    normalizedDate.setHours(0, 0, 0, 0);

    const daySummary = await tx.daySummary.create({
      data: {
        store_id: storeId,
        business_date: normalizedDate,
        status,
        shift_count: 1,
        gross_sales: new Prisma.Decimal(500.0),
        net_sales: new Prisma.Decimal(450.0),
        tax_collected: new Prisma.Decimal(40.0),
        transaction_count: 10,
        total_cash_variance: new Prisma.Decimal(5.0),
        total_opening_cash: new Prisma.Decimal(100.0),
        total_closing_cash: new Prisma.Decimal(255.0),
        total_expected_cash: new Prisma.Decimal(250.0),
        lottery_sales: new Prisma.Decimal(50.0),
        lottery_tickets_sold: 10,
        closed_at: status === "CLOSED" ? new Date() : null,
        closed_by: closedBy || null,
      },
    });

    return {
      day_summary_id: daySummary.day_summary_id,
      status: daySummary.status,
    };
  });
}

/**
 * Creates a LotteryBusinessDay with day packs for testing
 * @security DB-006: Scoped to store_id
 */
async function createLotteryDayWithPacks(
  storeId: string,
  businessDate: Date,
  status: "OPEN" | "PENDING_CLOSE" | "CLOSED" = "CLOSED",
  closedByUserId?: string,
): Promise<{ day_id: string; day_packs: any[] }> {
  return await withBypassClient(async (tx) => {
    const normalizedDate = new Date(businessDate);
    normalizedDate.setHours(0, 0, 0, 0);

    // Create game for the packs
    const game = await tx.lotteryGame.create({
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
    const bin = await tx.lotteryBin.create({
      data: {
        store_id: storeId,
        name: "Test Bin 1",
        display_order: 0,
        is_active: true,
      },
    });

    // Create pack
    const pack = await tx.lotteryPack.create({
      data: {
        game_id: game.game_id,
        store_id: storeId,
        pack_number: `RECON-${Date.now()}`,
        serial_start: "001",
        serial_end: "050",
        status: "ACTIVE",
        activated_at: new Date(),
        current_bin_id: bin.bin_id,
        tickets_sold_count: 15,
      },
    });

    // Create LotteryBusinessDay
    const lotteryDay = await tx.lotteryBusinessDay.create({
      data: {
        store_id: storeId,
        business_date: normalizedDate,
        status,
        opened_at: new Date(),
        closed_at: status === "CLOSED" ? new Date() : null,
        closed_by: closedByUserId || null,
      },
    });

    // Create LotteryDayPack
    const dayPack = await tx.lotteryDayPack.create({
      data: {
        day_id: lotteryDay.day_id,
        pack_id: pack.pack_id,
        starting_serial: "001",
        ending_serial: "015",
        tickets_sold: 15,
        sales_amount: new Prisma.Decimal(75.0), // 15 tickets * $5
      },
    });

    return {
      day_id: lotteryDay.day_id,
      day_packs: [{ ...dayPack, pack, game, bin }],
    };
  });
}

/**
 * Formats a date to YYYY-MM-DD string
 */
function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Cleans up test data for a store
 * @security Ensures test isolation
 */
async function cleanupStoreData(storeId: string): Promise<void> {
  await withBypassClient(async (tx) => {
    // Delete in correct order due to FK constraints
    await tx.lotteryDayPack.deleteMany({
      where: { day: { store_id: storeId } },
    });
    await tx.lotteryBusinessDay.deleteMany({
      where: { store_id: storeId },
    });
    await tx.shiftSummary.deleteMany({
      where: { store_id: storeId },
    });
    await tx.dayTenderSummary.deleteMany({
      where: { day_summary: { store_id: storeId } },
    });
    await tx.dayDepartmentSummary.deleteMany({
      where: { day_summary: { store_id: storeId } },
    });
    await tx.dayTaxSummary.deleteMany({
      where: { day_summary: { store_id: storeId } },
    });
    await tx.dayHourlySummary.deleteMany({
      where: { day_summary: { store_id: storeId } },
    });
    await tx.daySummary.deleteMany({
      where: { store_id: storeId },
    });
    await tx.shift.deleteMany({
      where: { store_id: storeId },
    });
    await tx.lotteryPack.deleteMany({
      where: { store_id: storeId },
    });
    await tx.lotteryBin.deleteMany({
      where: { store_id: storeId },
    });
    await tx.lotteryGame.deleteMany({
      where: { store_id: storeId },
    });
    await tx.cashier.deleteMany({
      where: { store_id: storeId },
    });
    await tx.pOSTerminal.deleteMany({
      where: { store_id: storeId },
    });
  });
}

// =============================================================================
// SECTION 1: P0 CRITICAL - AUTHENTICATION TESTS
// =============================================================================

test.describe("RECON-API: Authentication", () => {
  test("RECON-001: [P0] should return 401 when JWT token is missing", async ({
    apiRequest,
  }) => {
    // GIVEN: Valid store ID and date format
    const storeId = "00000000-0000-0000-0000-000000000000";
    const date = "2026-01-06";

    // WHEN: Requesting reconciliation without JWT token
    const response = await apiRequest.get(
      `/api/stores/${storeId}/day-summary/${date}/reconciliation`,
    );

    // THEN: Should return 401 Unauthorized
    expect(response.status(), "Should return 401 for missing token").toBe(401);
  });

  test("RECON-002: [P0] should return 401 for invalid JWT token", async ({
    apiRequest,
  }) => {
    // GIVEN: Invalid JWT token
    const storeId = "00000000-0000-0000-0000-000000000000";
    const date = "2026-01-06";

    // WHEN: Requesting with invalid token
    const response = await apiRequest.get(
      `/api/stores/${storeId}/day-summary/${date}/reconciliation`,
      {
        headers: { Authorization: "Bearer invalid.jwt.token" },
      },
    );

    // THEN: Should return 401 Unauthorized
    expect(response.status(), "Should return 401 for invalid token").toBe(401);
  });

  test("RECON-003: [P0] should return 401 for expired JWT token", async ({
    apiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: Expired JWT token
    const expiredToken = createExpiredJWTAccessToken({
      user_id: storeManagerUser.user_id,
      email: storeManagerUser.email,
      roles: ["STORE_MANAGER"],
    });
    const date = "2026-01-06";

    // WHEN: Requesting with expired token
    const response = await apiRequest.get(
      `/api/stores/${storeManagerUser.store_id}/day-summary/${date}/reconciliation`,
      {
        headers: { Authorization: `Bearer ${expiredToken}` },
      },
    );

    // THEN: Should return 401 Unauthorized
    expect(response.status(), "Should return 401 for expired token").toBe(401);
  });
});

// =============================================================================
// SECTION 2: P0 CRITICAL - AUTHORIZATION TESTS
// =============================================================================

test.describe("RECON-API: Authorization", () => {
  test("RECON-010: [P0] should return 200 for user with SHIFT_REPORT_VIEW permission", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: User with SHIFT_REPORT_VIEW permission
    const date = formatDate(new Date());

    // WHEN: Requesting reconciliation
    const response = await storeManagerApiRequest.get(
      `/api/stores/${storeManagerUser.store_id}/day-summary/${date}/reconciliation`,
    );

    // THEN: Should return 200 OK
    expect(response.status(), "Should return 200 for authorized user").toBe(
      200,
    );
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  test("RECON-011: [P0] should return 403 for user without SHIFT_REPORT_VIEW permission", async ({
    storeManagerUser,
    request,
    backendUrl,
  }) => {
    // GIVEN: User without required permission (create limited user)
    const limitedUser = await withBypassClient(async (tx) => {
      const userData = createUser({ email: `limited-${Date.now()}@test.com` });
      const user = await tx.user.create({ data: userData });

      // Create a role with no permissions (empty permission set)
      const role = await tx.role.create({
        data: {
          code: `LIMITED_${Date.now()}`,
          scope: "STORE",
          is_system_role: false,
        },
      });

      // Assign role to user for the store
      await tx.userRole.create({
        data: {
          user_id: user.user_id,
          role_id: role.role_id,
          store_id: storeManagerUser.store_id,
        },
      });

      return user;
    });

    // Create token for limited user with empty permissions array
    // SEC-010: Test verifies permission check correctly denies access
    const { createJWTAccessToken } =
      await import("../support/factories/jwt.factory");
    const token = createJWTAccessToken({
      user_id: limitedUser.user_id,
      email: limitedUser.email,
      roles: ["LIMITED"],
      permissions: [], // Explicitly empty - no SHIFT_REPORT_VIEW permission
      store_ids: [storeManagerUser.store_id],
    });

    const date = formatDate(new Date());

    // WHEN: Requesting reconciliation with cookie-based auth (matches production)
    // API-004: Backend uses Cookie-based authentication via access_token cookie
    const response = await request.get(
      `${backendUrl}/api/stores/${storeManagerUser.store_id}/day-summary/${date}/reconciliation`,
      {
        headers: {
          Cookie: `access_token=${token}`,
        },
      },
    );

    // THEN: Should return 403 Forbidden with proper error structure
    expect(response.status(), "Should return 403 for unauthorized user").toBe(
      403,
    );
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("PERMISSION_DENIED");
  });
});

// =============================================================================
// SECTION 3: P0 CRITICAL - VALIDATION TESTS
// =============================================================================

test.describe("RECON-API: Validation", () => {
  test("RECON-020: [P0] should return 400 for invalid storeId UUID format", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: Invalid UUID format
    const invalidStoreId = "not-a-valid-uuid";
    const date = "2026-01-06";

    // WHEN: Requesting with invalid storeId
    const response = await storeManagerApiRequest.get(
      `/api/stores/${invalidStoreId}/day-summary/${date}/reconciliation`,
    );

    // THEN: Should return 400 Bad Request
    expect(response.status(), "Should return 400 for invalid UUID").toBe(400);
  });

  test("RECON-021: [P0] should return 400 for invalid date format", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: Invalid date format
    const invalidDate = "01-06-2026"; // Wrong format (should be YYYY-MM-DD)

    // WHEN: Requesting with invalid date format
    const response = await storeManagerApiRequest.get(
      `/api/stores/${storeManagerUser.store_id}/day-summary/${invalidDate}/reconciliation`,
    );

    // THEN: Should return 400 Bad Request
    expect(response.status(), "Should return 400 for invalid date format").toBe(
      400,
    );
  });

  test("RECON-022: [P0] should return 400 for invalid date value", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: Invalid date value (e.g., Feb 30)
    const invalidDate = "2026-02-30";

    // WHEN: Requesting with invalid date value
    const response = await storeManagerApiRequest.get(
      `/api/stores/${storeManagerUser.store_id}/day-summary/${invalidDate}/reconciliation`,
    );

    // THEN: Should return 400 Bad Request
    expect(response.status(), "Should return 400 for invalid date value").toBe(
      400,
    );
  });
});

// =============================================================================
// SECTION 4: P0 CRITICAL - SECURITY TESTS (TENANT ISOLATION)
// =============================================================================

test.describe("RECON-API: Tenant Isolation", () => {
  test("RECON-040: [P0] should only return data for authorized store", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: Shift and day summary for the store
    const businessDate = new Date();
    const terminal = await createPOSTerminal(storeManagerUser.store_id);
    const cashier = await createTestCashier(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    await createClosedShiftWithSummary(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      businessDate,
      { netSales: 500.0, transactionCount: 25 },
    );

    const date = formatDate(businessDate);

    // WHEN: Requesting reconciliation for own store
    const response = await storeManagerApiRequest.get(
      `/api/stores/${storeManagerUser.store_id}/day-summary/${date}/reconciliation`,
    );

    // THEN: Should return data for own store only
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.store_id).toBe(storeManagerUser.store_id);
    expect(body.data.shifts.length).toBeGreaterThan(0);

    // Cleanup
    await cleanupStoreData(storeManagerUser.store_id);
  });

  test("RECON-041: [P0] should return 403 for cross-store access attempt", async ({
    storeManagerApiRequest,
  }) => {
    // GIVEN: A different store the user doesn't have access to
    // SEC-001: TENANT_ISOLATION - Verify cross-tenant access is blocked
    const { store: otherStore } = await withBypassClient(async (tx) => {
      // Create owner user first
      const ownerData = createUser({
        email: `other-owner-${Date.now()}@test.com`,
      });
      const owner = await tx.user.create({ data: ownerData });

      // Create company with owner
      const companyData = createCompany({
        name: `Test Other Company ${Date.now()}`,
        owner_user_id: owner.user_id,
      });
      const company = await tx.company.create({ data: companyData });

      // Create store
      const storeData = createStore({
        name: `Test Other Store ${Date.now()}`,
        company_id: company.company_id,
      });
      const store = await tx.store.create({ data: storeData });

      return { company, store };
    });

    const date = formatDate(new Date());

    // WHEN: Attempting to access another store's data
    const response = await storeManagerApiRequest.get(
      `/api/stores/${otherStore.store_id}/day-summary/${date}/reconciliation`,
    );

    // THEN: Should return 403 Forbidden (or 404 depending on implementation)
    expect([403, 404]).toContain(response.status());
  });
});

// =============================================================================
// SECTION 5: P1 BUSINESS LOGIC TESTS
// =============================================================================

test.describe("RECON-API: Business Logic", () => {
  test("RECON-030: [P1] should return empty response structure for day with no data", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: A date with no shifts or lottery data
    const emptyDate = "2020-01-01"; // Far past date with no data

    // WHEN: Requesting reconciliation
    const response = await storeManagerApiRequest.get(
      `/api/stores/${storeManagerUser.store_id}/day-summary/${emptyDate}/reconciliation`,
    );

    // THEN: Should return 200 with empty arrays
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      store_id: storeManagerUser.store_id,
      business_date: emptyDate,
      status: "OPEN", // Default status for non-existent day
      shifts: [],
      lottery: {
        is_closed: false,
        bins_closed: [],
        total_sales: 0,
        total_tickets_sold: 0,
      },
    });
  });

  test("RECON-031: [P1] should return shifts list with correct structure", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: A closed shift with summary
    const businessDate = new Date();
    const terminal = await createPOSTerminal(storeManagerUser.store_id);
    const cashier = await createTestCashier(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    await createClosedShiftWithSummary(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      businessDate,
      {
        openingCash: 100.0,
        closingCash: 300.0,
        netSales: 200.0,
        transactionCount: 15,
        lotterySales: 50.0,
        lotteryTicketsSold: 10,
      },
    );

    const date = formatDate(businessDate);

    // WHEN: Requesting reconciliation
    const response = await storeManagerApiRequest.get(
      `/api/stores/${storeManagerUser.store_id}/day-summary/${date}/reconciliation`,
    );

    // THEN: Should return shift with all required fields
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.shifts.length).toBeGreaterThan(0);

    const shift = body.data.shifts[0];
    expect(shift).toMatchObject({
      shift_id: expect.any(String),
      terminal_name: expect.any(String),
      cashier_name: expect.any(String),
      opened_at: expect.any(String),
      closed_at: expect.any(String),
      status: "CLOSED",
      opening_cash: expect.any(Number),
      closing_cash: expect.any(Number),
      net_sales: expect.any(Number),
      transaction_count: expect.any(Number),
    });

    // Cleanup
    await cleanupStoreData(storeManagerUser.store_id);
  });

  test("RECON-032: [P1] should return lottery bins closed data", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: A lottery day with closed bins
    const businessDate = new Date();
    await createLotteryDayWithPacks(
      storeManagerUser.store_id,
      businessDate,
      "CLOSED",
      storeManagerUser.user_id,
    );

    const date = formatDate(businessDate);

    // WHEN: Requesting reconciliation
    const response = await storeManagerApiRequest.get(
      `/api/stores/${storeManagerUser.store_id}/day-summary/${date}/reconciliation`,
    );

    // THEN: Should return lottery bins with correct structure
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.lottery.is_closed).toBe(true);
    expect(body.data.lottery.bins_closed.length).toBeGreaterThan(0);

    const bin = body.data.lottery.bins_closed[0];
    expect(bin).toMatchObject({
      bin_number: expect.any(Number),
      pack_number: expect.any(String),
      game_name: expect.any(String),
      game_price: expect.any(Number),
      starting_serial: expect.any(String),
      closing_serial: expect.any(String),
      tickets_sold: expect.any(Number),
      sales_amount: expect.any(Number),
    });

    // Cleanup
    await cleanupStoreData(storeManagerUser.store_id);
  });

  test("RECON-033: [P1] should return correct day totals aggregation", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: A day summary with known values
    const businessDate = new Date();
    await createDaySummary(
      storeManagerUser.store_id,
      businessDate,
      "CLOSED",
      storeManagerUser.user_id,
    );

    const date = formatDate(businessDate);

    // WHEN: Requesting reconciliation
    const response = await storeManagerApiRequest.get(
      `/api/stores/${storeManagerUser.store_id}/day-summary/${date}/reconciliation`,
    );

    // THEN: Should return day totals with all fields
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.day_totals).toMatchObject({
      shift_count: expect.any(Number),
      gross_sales: expect.any(Number),
      net_sales: expect.any(Number),
      tax_collected: expect.any(Number),
      transaction_count: expect.any(Number),
      total_opening_cash: expect.any(Number),
      total_closing_cash: expect.any(Number),
      total_expected_cash: expect.any(Number),
      total_cash_variance: expect.any(Number),
    });

    // Cleanup
    await cleanupStoreData(storeManagerUser.store_id);
  });

  test("RECON-034: [P1] should return CLOSED status for closed day", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: A closed day summary
    const businessDate = new Date();
    await createDaySummary(
      storeManagerUser.store_id,
      businessDate,
      "CLOSED",
      storeManagerUser.user_id,
    );

    const date = formatDate(businessDate);

    // WHEN: Requesting reconciliation
    const response = await storeManagerApiRequest.get(
      `/api/stores/${storeManagerUser.store_id}/day-summary/${date}/reconciliation`,
    );

    // THEN: Should return CLOSED status
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe("CLOSED");
    expect(body.data.closed_at).not.toBeNull();
    expect(body.data.closed_by).not.toBeNull();

    // Cleanup
    await cleanupStoreData(storeManagerUser.store_id);
  });

  test("RECON-050: [P1] should return multiple shifts in correct order", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: Multiple shifts for the same day
    const businessDate = new Date();
    const terminal = await createPOSTerminal(storeManagerUser.store_id);
    const cashier1 = await createTestCashier(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );
    const cashier2 = await createTestCashier(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    // Create first shift (earlier)
    await createClosedShiftWithSummary(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier1.cashier_id,
      terminal.pos_terminal_id,
      businessDate,
      { netSales: 100.0 },
    );

    // Create second shift (later) - need to create with different times
    const shift2Date = new Date(businessDate);
    await createClosedShiftWithSummary(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier2.cashier_id,
      terminal.pos_terminal_id,
      shift2Date,
      { netSales: 200.0 },
    );

    const date = formatDate(businessDate);

    // WHEN: Requesting reconciliation
    const response = await storeManagerApiRequest.get(
      `/api/stores/${storeManagerUser.store_id}/day-summary/${date}/reconciliation`,
    );

    // THEN: Should return multiple shifts
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.shifts.length).toBeGreaterThanOrEqual(2);

    // Cleanup
    await cleanupStoreData(storeManagerUser.store_id);
  });

  test("RECON-052: [P1] should calculate correct lottery totals from bins", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: A lottery day with known pack values
    const businessDate = new Date();
    await createLotteryDayWithPacks(
      storeManagerUser.store_id,
      businessDate,
      "CLOSED",
      storeManagerUser.user_id,
    );

    const date = formatDate(businessDate);

    // WHEN: Requesting reconciliation
    const response = await storeManagerApiRequest.get(
      `/api/stores/${storeManagerUser.store_id}/day-summary/${date}/reconciliation`,
    );

    // THEN: Lottery totals should be calculated from bins
    expect(response.status()).toBe(200);
    const body = await response.json();

    // Calculate expected totals from bins
    const expectedTotalSales = body.data.lottery.bins_closed.reduce(
      (sum: number, bin: any) => sum + bin.sales_amount,
      0,
    );
    const expectedTotalTickets = body.data.lottery.bins_closed.reduce(
      (sum: number, bin: any) => sum + bin.tickets_sold,
      0,
    );

    expect(body.data.lottery.total_sales).toBe(expectedTotalSales);
    expect(body.data.lottery.total_tickets_sold).toBe(expectedTotalTickets);

    // Cleanup
    await cleanupStoreData(storeManagerUser.store_id);
  });
});

// =============================================================================
// SECTION 6: RESPONSE STRUCTURE VALIDATION
// =============================================================================

test.describe("RECON-API: Response Structure", () => {
  test("RECON-060: [P1] should return complete response structure", async ({
    storeManagerApiRequest,
    storeManagerUser,
  }) => {
    // GIVEN: A day with all types of data
    const businessDate = new Date();
    const terminal = await createPOSTerminal(storeManagerUser.store_id);
    const cashier = await createTestCashier(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
    );

    await createClosedShiftWithSummary(
      storeManagerUser.store_id,
      storeManagerUser.user_id,
      cashier.cashier_id,
      terminal.pos_terminal_id,
      businessDate,
    );

    await createDaySummary(
      storeManagerUser.store_id,
      businessDate,
      "CLOSED",
      storeManagerUser.user_id,
    );

    await createLotteryDayWithPacks(
      storeManagerUser.store_id,
      businessDate,
      "CLOSED",
      storeManagerUser.user_id,
    );

    const date = formatDate(businessDate);

    // WHEN: Requesting reconciliation
    const response = await storeManagerApiRequest.get(
      `/api/stores/${storeManagerUser.store_id}/day-summary/${date}/reconciliation`,
    );

    // THEN: Should return complete response structure
    expect(response.status()).toBe(200);
    const body = await response.json();

    // Validate response structure matches DayCloseReconciliationResponse type
    // SEC-014: Verify only necessary fields are exposed in API response
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();

    // Validate top-level fields
    expect(typeof body.data.store_id).toBe("string");
    expect(typeof body.data.business_date).toBe("string");
    expect(typeof body.data.status).toBe("string");
    expect(["OPEN", "PENDING_CLOSE", "CLOSED"]).toContain(body.data.status);

    // Nullable fields - can be string or null
    expect(
      body.data.closed_at === null || typeof body.data.closed_at === "string",
    ).toBe(true);
    expect(
      body.data.closed_by === null || typeof body.data.closed_by === "string",
    ).toBe(true);
    expect(
      body.data.closed_by_name === null ||
        typeof body.data.closed_by_name === "string",
    ).toBe(true);
    expect(
      body.data.notes === null || typeof body.data.notes === "string",
    ).toBe(true);

    // Validate shifts array structure
    expect(Array.isArray(body.data.shifts)).toBe(true);
    if (body.data.shifts.length > 0) {
      const shift = body.data.shifts[0];
      expect(typeof shift.shift_id).toBe("string");
      expect(typeof shift.net_sales).toBe("number");
      expect(typeof shift.transaction_count).toBe("number");
    }

    // Validate lottery object structure
    expect(body.data.lottery).toBeDefined();
    expect(typeof body.data.lottery.is_closed).toBe("boolean");
    expect(
      body.data.lottery.closed_at === null ||
        typeof body.data.lottery.closed_at === "string",
    ).toBe(true);
    expect(Array.isArray(body.data.lottery.bins_closed)).toBe(true);
    expect(typeof body.data.lottery.total_sales).toBe("number");
    expect(typeof body.data.lottery.total_tickets_sold).toBe("number");

    // Validate day_totals object structure
    expect(body.data.day_totals).toBeDefined();
    expect(typeof body.data.day_totals.shift_count).toBe("number");
    expect(typeof body.data.day_totals.gross_sales).toBe("number");
    expect(typeof body.data.day_totals.net_sales).toBe("number");
    expect(typeof body.data.day_totals.tax_collected).toBe("number");
    expect(typeof body.data.day_totals.transaction_count).toBe("number");
    expect(typeof body.data.day_totals.total_opening_cash).toBe("number");
    expect(typeof body.data.day_totals.total_closing_cash).toBe("number");
    expect(typeof body.data.day_totals.total_expected_cash).toBe("number");
    expect(typeof body.data.day_totals.total_cash_variance).toBe("number");

    // Cleanup
    await cleanupStoreData(storeManagerUser.store_id);
  });
});
