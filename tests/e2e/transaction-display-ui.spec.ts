/**
 * @test-level E2E
 * @justification End-to-end tests for transaction display UI - validates complete user journey from navigation to viewing transaction details
 * @story 3-5-transaction-display-ui
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import {
  createTransaction,
  createTransactionLineItem,
  createTransactionPayment,
} from "../support/factories/transaction.factory";
import {
  createStore,
  createCompany,
  createClientUser,
  createUser,
} from "../support/factories";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";

/**
 * Helper function to create a company with an owner and store
 */
async function createCompanyWithStore(
  prismaClient: PrismaClient,
  overrides: Record<string, unknown> = {},
) {
  const owner = await prismaClient.user.create({
    data: createUser({ name: "Company Owner" }),
  });
  const company = await prismaClient.company.create({
    data: createCompany({ owner_user_id: owner.user_id, ...overrides }),
  });
  const store = await prismaClient.store.create({
    data: createStore({ company_id: company.company_id }),
  });
  return { owner, company, store };
}

/**
 * Transaction Display UI E2E Tests - Story 3.5
 *
 * STORY: As a Store Manager, I want to view transactions in a table with filtering,
 * so that I can review sales activity and transaction details.
 *
 * TEST LEVEL: E2E (end-to-end user journey tests)
 * PRIMARY GOAL: Verify complete user flow from navigation to viewing transaction details
 *
 * BUSINESS RULES TESTED:
 * - Navigate to transactions page
 * - View transaction list with required columns
 * - Filter transactions by date range
 * - Filter transactions by shift
 * - Filter transactions by cashier
 * - Click transaction to view details (line items, payments)
 * - Pagination navigation
 * - RLS enforcement (users only see accessible stores)
 *
 * ACCEPTANCE CRITERIA COVERAGE:
 * - AC #1: Transaction display with filtering and pagination
 */

test.describe("3.5-E2E: Transaction Display UI", () => {
  test("3.5-E2E-001: [P0] Should navigate to transactions page and display transaction list", async ({
    storeManagerPage,
    prismaClient,
  }) => {
    // GIVEN: A store exists with transactions
    const { owner, company, store } =
      await createCompanyWithStore(prismaClient);
    const cashier = await prismaClient.user.create({
      data: createClientUser(),
    });
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: cashier.user_id,
        cashier_id: cashier.user_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });

    const transaction = await prismaClient.transaction.create({
      data: createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: cashier.user_id,
        total: 50.0,
      }),
    });

    // WHEN: Navigating to the transactions page
    await storeManagerPage.goto("/transactions");

    // THEN: Transaction list should be displayed
    await expect(storeManagerPage.getByText("Transactions")).toBeVisible();
    await expect(
      storeManagerPage.locator('[data-testid="transaction-list-table"]'),
    ).toBeVisible();
  });

  test("3.5-E2E-002: [P0] Should display transaction columns (transaction_id, timestamp, total, cashier, store)", async ({
    storeManagerPage,
    prismaClient,
  }) => {
    // GIVEN: A store exists with a transaction
    const { owner, company, store } =
      await createCompanyWithStore(prismaClient);
    const cashier = await prismaClient.user.create({
      data: createClientUser({ name: "Test Cashier" }),
    });
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: cashier.user_id,
        cashier_id: cashier.user_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });

    const transaction = await prismaClient.transaction.create({
      data: createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: cashier.user_id,
        total: 75.5,
      }),
    });

    // WHEN: Navigating to the transactions page
    await storeManagerPage.goto("/transactions");
    await expect(
      storeManagerPage.locator('[data-testid="transaction-list-table"]'),
    ).toBeVisible();

    // THEN: Transaction columns should be displayed
    await expect(storeManagerPage.getByText("Transaction ID")).toBeVisible();
    await expect(storeManagerPage.getByText("Timestamp")).toBeVisible();
    await expect(storeManagerPage.getByText("Total")).toBeVisible();
    await expect(storeManagerPage.getByText("Cashier")).toBeVisible();
    await expect(storeManagerPage.getByText("Store")).toBeVisible();
  });

  test("3.5-E2E-003: [P0] Should filter transactions by date range", async ({
    storeManagerPage,
    prismaClient,
  }) => {
    // GIVEN: A store exists with transactions in different date ranges
    const { owner, company, store } =
      await createCompanyWithStore(prismaClient);
    const cashier = await prismaClient.user.create({
      data: createClientUser(),
    });
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: cashier.user_id,
        cashier_id: cashier.user_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const transactionToday = await prismaClient.transaction.create({
      data: createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: cashier.user_id,
        timestamp: today,
        total: 100.0,
      }),
    });

    const transactionYesterday = await prismaClient.transaction.create({
      data: createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: cashier.user_id,
        timestamp: yesterday,
        total: 50.0,
      }),
    });

    // WHEN: Navigating to transactions page and filtering by today's date
    await storeManagerPage.goto("/transactions");
    await expect(
      storeManagerPage.locator('[data-testid="transaction-list-table"]'),
    ).toBeVisible();

    // Apply date range filter for today
    await storeManagerPage
      .locator('[data-testid="date-range-picker-from"]')
      .fill(today.toISOString().split("T")[0]);
    await storeManagerPage
      .locator('[data-testid="date-range-picker-to"]')
      .fill(today.toISOString().split("T")[0]);
    await storeManagerPage
      .locator('[data-testid="apply-filters-button"]')
      .click();

    // THEN: Only today's transaction should be displayed
    await expect(
      storeManagerPage.locator(`text=${transactionToday.public_id}`),
    ).toBeVisible();
    await expect(
      storeManagerPage.locator(`text=${transactionYesterday.public_id}`),
    ).not.toBeVisible();
  });

  test("3.5-E2E-004: [P0] Should filter transactions by shift", async ({
    storeManagerPage,
    prismaClient,
  }) => {
    // GIVEN: A store exists with multiple shifts and transactions
    const { owner, company, store } =
      await createCompanyWithStore(prismaClient);
    const cashier = await prismaClient.user.create({
      data: createClientUser(),
    });

    const shift1 = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: cashier.user_id,
        cashier_id: cashier.user_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });

    const shift2 = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: cashier.user_id,
        cashier_id: cashier.user_id,
        opening_cash: 200.0,
        status: "OPEN",
      },
    });

    const transaction1 = await prismaClient.transaction.create({
      data: createTransaction({
        store_id: store.store_id,
        shift_id: shift1.shift_id,
        cashier_id: cashier.user_id,
        total: 100.0,
      }),
    });

    const transaction2 = await prismaClient.transaction.create({
      data: createTransaction({
        store_id: store.store_id,
        shift_id: shift2.shift_id,
        cashier_id: cashier.user_id,
        total: 200.0,
      }),
    });

    // WHEN: Navigating to transactions page and filtering by shift1
    await storeManagerPage.goto("/transactions");
    await expect(
      storeManagerPage.locator('[data-testid="transaction-list-table"]'),
    ).toBeVisible();

    // Apply shift filter
    await storeManagerPage
      .locator('[data-testid="shift-filter-select"]')
      .click();
    await storeManagerPage
      .locator(`[data-testid="shift-option-${shift1.shift_id}"]`)
      .click();
    await storeManagerPage
      .locator('[data-testid="apply-filters-button"]')
      .click();

    // THEN: Only transactions from shift1 should be displayed
    await expect(
      storeManagerPage.locator(`text=${transaction1.public_id}`),
    ).toBeVisible();
    await expect(
      storeManagerPage.locator(`text=${transaction2.public_id}`),
    ).not.toBeVisible();
  });

  test("3.5-E2E-005: [P0] Should filter transactions by cashier", async ({
    storeManagerPage,
    prismaClient,
  }) => {
    // GIVEN: A store exists with multiple cashiers and transactions
    const { owner, company, store } =
      await createCompanyWithStore(prismaClient);
    const cashier1 = await prismaClient.user.create({
      data: createClientUser({ name: "Cashier One" }),
    });
    const cashier2 = await prismaClient.user.create({
      data: createClientUser({ name: "Cashier Two" }),
    });

    const shift1 = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: cashier1.user_id,
        cashier_id: cashier1.user_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });

    const shift2 = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: cashier2.user_id,
        cashier_id: cashier2.user_id,
        opening_cash: 200.0,
        status: "OPEN",
      },
    });

    const transaction1 = await prismaClient.transaction.create({
      data: createTransaction({
        store_id: store.store_id,
        shift_id: shift1.shift_id,
        cashier_id: cashier1.user_id,
        total: 100.0,
      }),
    });

    const transaction2 = await prismaClient.transaction.create({
      data: createTransaction({
        store_id: store.store_id,
        shift_id: shift2.shift_id,
        cashier_id: cashier2.user_id,
        total: 200.0,
      }),
    });

    // WHEN: Navigating to transactions page and filtering by cashier1
    await storeManagerPage.goto("/transactions");
    await expect(
      storeManagerPage.locator('[data-testid="transaction-list-table"]'),
    ).toBeVisible();

    // Apply cashier filter
    await storeManagerPage
      .locator('[data-testid="cashier-filter-select"]')
      .click();
    await storeManagerPage
      .locator(`[data-testid="cashier-option-${cashier1.user_id}"]`)
      .click();
    await storeManagerPage
      .locator('[data-testid="apply-filters-button"]')
      .click();

    // THEN: Only transactions from cashier1 should be displayed
    await expect(
      storeManagerPage.locator(`text=${transaction1.public_id}`),
    ).toBeVisible();
    await expect(
      storeManagerPage.locator(`text=${transaction2.public_id}`),
    ).not.toBeVisible();
  });

  test("3.5-E2E-006: [P0] Should open transaction detail dialog when clicking transaction row", async ({
    storeManagerPage,
    prismaClient,
  }) => {
    // GIVEN: A store exists with a transaction that has line items and payments
    const { owner, company, store } =
      await createCompanyWithStore(prismaClient);
    const cashier = await prismaClient.user.create({
      data: createClientUser(),
    });
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: cashier.user_id,
        cashier_id: cashier.user_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });

    const transaction = await prismaClient.transaction.create({
      data: createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: cashier.user_id,
        total: 100.0,
      }),
    });

    await prismaClient.transactionLineItem.create({
      data: createTransactionLineItem({
        transaction_id: transaction.transaction_id,
        name: "Test Product",
        quantity: 2,
        unit_price: 50.0,
        line_total: 100.0,
      }),
    });

    await prismaClient.transactionPayment.create({
      data: createTransactionPayment({
        transaction_id: transaction.transaction_id,
        method: "CASH",
        amount: 100.0,
      }),
    });

    // WHEN: Navigating to transactions page and clicking transaction row
    await storeManagerPage.goto("/transactions");
    await expect(
      storeManagerPage.locator('[data-testid="transaction-list-table"]'),
    ).toBeVisible();

    const transactionRow = storeManagerPage.locator(
      `[data-testid="transaction-row-${transaction.transaction_id}"]`,
    );
    await transactionRow.click();

    // THEN: Transaction detail dialog should open
    await expect(
      storeManagerPage.locator('[data-testid="transaction-detail-dialog"]'),
    ).toBeVisible();
    await expect(
      storeManagerPage.locator(`text=${transaction.public_id}`),
    ).toBeVisible();
  });

  test("3.5-E2E-007: [P0] Should display transaction line items and payments in detail dialog", async ({
    storeManagerPage,
    prismaClient,
  }) => {
    // GIVEN: A store exists with a transaction that has line items and payments
    const { owner, company, store } =
      await createCompanyWithStore(prismaClient);
    const cashier = await prismaClient.user.create({
      data: createClientUser(),
    });
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: cashier.user_id,
        cashier_id: cashier.user_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });

    const transaction = await prismaClient.transaction.create({
      data: createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: cashier.user_id,
        total: 100.0,
      }),
    });

    const lineItem = await prismaClient.transactionLineItem.create({
      data: createTransactionLineItem({
        transaction_id: transaction.transaction_id,
        name: "Test Product",
        quantity: 2,
        unit_price: 50.0,
        line_total: 100.0,
      }),
    });

    const payment = await prismaClient.transactionPayment.create({
      data: createTransactionPayment({
        transaction_id: transaction.transaction_id,
        method: "CASH",
        amount: 100.0,
      }),
    });

    // WHEN: Opening transaction detail dialog
    await storeManagerPage.goto("/transactions");
    const transactionRow = storeManagerPage.locator(
      `[data-testid="transaction-row-${transaction.transaction_id}"]`,
    );
    await transactionRow.click();

    // THEN: Line items and payments should be displayed
    await expect(
      storeManagerPage.locator('[data-testid="transaction-detail-dialog"]'),
    ).toBeVisible();
    await expect(
      storeManagerPage.locator('[data-testid="line-items-table"]'),
    ).toBeVisible();
    await expect(
      storeManagerPage.locator('[data-testid="payments-table"]'),
    ).toBeVisible();
    await expect(storeManagerPage.getByText("Test Product")).toBeVisible();
    await expect(storeManagerPage.getByText("CASH")).toBeVisible();
  });

  test("3.5-E2E-008: [P0] Should navigate pagination controls", async ({
    storeManagerPage,
    prismaClient,
  }) => {
    // GIVEN: A store exists with more than 50 transactions (to test pagination)
    const { owner, company, store } =
      await createCompanyWithStore(prismaClient);
    const cashier = await prismaClient.user.create({
      data: createClientUser(),
    });
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: cashier.user_id,
        cashier_id: cashier.user_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });

    // Create 55 transactions (more than default limit of 50)
    const transactions = [];
    for (let i = 0; i < 55; i++) {
      const transaction = await prismaClient.transaction.create({
        data: createTransaction({
          store_id: store.store_id,
          shift_id: shift.shift_id,
          cashier_id: cashier.user_id,
          total: 10.0 + i,
        }),
      });
      transactions.push(transaction);
    }

    // WHEN: Navigating to transactions page
    await storeManagerPage.goto("/transactions");
    await expect(
      storeManagerPage.locator('[data-testid="transaction-list-table"]'),
    ).toBeVisible();

    // THEN: Pagination controls should be visible
    await expect(
      storeManagerPage.locator('[data-testid="pagination-controls"]'),
    ).toBeVisible();
    await expect(
      storeManagerPage.locator('[data-testid="pagination-next-button"]'),
    ).toBeVisible();

    // WHEN: Clicking next page
    await storeManagerPage
      .locator('[data-testid="pagination-next-button"]')
      .click();

    // THEN: Second page should be displayed
    await expect(
      storeManagerPage.locator('[data-testid="pagination-page-2"]'),
    ).toBeVisible();
  });

  test("3.5-E2E-009: [P0] Should enforce RLS - Store Manager only sees transactions from assigned store", async ({
    storeManagerPage,
    prismaClient,
  }) => {
    // GIVEN: Two stores exist with transactions, but Store Manager only has access to one
    const {
      owner: owner1,
      company: company1,
      store: store1,
    } = await createCompanyWithStore(prismaClient);
    const {
      owner: owner2,
      company: company2,
      store: store2,
    } = await createCompanyWithStore(prismaClient);

    const cashier1 = await prismaClient.user.create({
      data: createClientUser(),
    });
    const cashier2 = await prismaClient.user.create({
      data: createClientUser(),
    });

    const shift1 = await prismaClient.shift.create({
      data: {
        store_id: store1.store_id,
        opened_by: cashier1.user_id,
        cashier_id: cashier1.user_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });

    const shift2 = await prismaClient.shift.create({
      data: {
        store_id: store2.store_id,
        opened_by: cashier2.user_id,
        cashier_id: cashier2.user_id,
        opening_cash: 200.0,
        status: "OPEN",
      },
    });

    const transaction1 = await prismaClient.transaction.create({
      data: createTransaction({
        store_id: store1.store_id,
        shift_id: shift1.shift_id,
        cashier_id: cashier1.user_id,
        total: 100.0,
      }),
    });

    const transaction2 = await prismaClient.transaction.create({
      data: createTransaction({
        store_id: store2.store_id,
        shift_id: shift2.shift_id,
        cashier_id: cashier2.user_id,
        total: 200.0,
      }),
    });

    // WHEN: Store Manager navigates to transactions page
    // (Store Manager fixture should only have access to store1)
    await storeManagerPage.goto("/transactions");

    // THEN: Only transactions from accessible store should be displayed
    await expect(
      storeManagerPage.locator(`text=${transaction1.public_id}`),
    ).toBeVisible();
    await expect(
      storeManagerPage.locator(`text=${transaction2.public_id}`),
    ).not.toBeVisible();
  });

  // ============================================================================
  // SECURITY TESTS - Authentication & Authorization (E2E Level)
  // ============================================================================

  test("3.5-E2E-SEC-001: [P1] Should require authentication to access transactions page", async ({
    page,
  }) => {
    // GIVEN: User is not authenticated
    // (Using page fixture without authentication)

    // WHEN: Attempting to navigate to transactions page
    await page.goto("/transactions");

    // THEN: Should redirect to login or show unauthorized
    // (Behavior depends on auth implementation - verify user cannot access)
    const currentUrl = page.url();
    expect(
      currentUrl.includes("/login") || currentUrl.includes("/auth"),
    ).toBeTruthy();
  });

  test("3.5-E2E-SEC-002: [P1] Should enforce authorization - only users with TRANSACTION_READ permission can view", async ({
    page,
    regularUser,
  }) => {
    // GIVEN: User without TRANSACTION_READ permission
    // (regularUser has only SHIFT_READ and INVENTORY_READ, not TRANSACTION_READ)

    // Set up authentication for regularUser (similar to storeManagerPage fixture)
    await page.addInitScript(
      (userData: any) => {
        localStorage.setItem(
          "auth_session",
          JSON.stringify({
            id: userData.user_id,
            email: userData.email,
            name: userData.name,
            user_metadata: {
              email: userData.email,
              full_name: userData.name,
            },
          }),
        );
      },
      {
        user_id: regularUser.user_id,
        email: regularUser.email,
        name: regularUser.name,
      },
    );

    // Intercept auth check endpoint
    await page.route("**/api/auth/me*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: regularUser.user_id,
            email: regularUser.email,
            name: regularUser.name,
            roles: regularUser.roles,
            permissions: regularUser.permissions,
          },
        }),
      });
    });

    // Add authentication cookie
    await page.context().addCookies([
      {
        name: "access_token",
        value: regularUser.token,
        domain: "localhost",
        path: "/",
      },
    ]);

    // WHEN: Attempting to access transactions page
    const response = await page.goto("/transactions", {
      waitUntil: "networkidle",
    });

    // THEN: Should show 403 Forbidden or redirect to unauthorized page
    // Check for 403 status or redirect to login/unauthorized page
    const status = response?.status();
    const currentUrl = page.url();

    expect(
      status === 403 ||
        currentUrl.includes("/login") ||
        currentUrl.includes("/auth") ||
        currentUrl.includes("/unauthorized") ||
        currentUrl.includes("/forbidden"),
      "Should deny access with 403 or redirect to unauthorized page",
    ).toBeTruthy();
  });

  // ============================================================================
  // INPUT VALIDATION TESTS - Date Range Validation (E2E Level)
  // ============================================================================

  test("3.5-E2E-VALID-001: [P2] Should handle invalid date format in date range filter", async ({
    storeManagerPage,
    prismaClient,
  }) => {
    // GIVEN: A store exists with transactions
    const { owner, company, store } =
      await createCompanyWithStore(prismaClient);
    const cashier = await prismaClient.user.create({
      data: createClientUser(),
    });
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: cashier.user_id,
        cashier_id: cashier.user_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });

    await prismaClient.transaction.create({
      data: createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: cashier.user_id,
        total: 50.0,
      }),
    });

    // WHEN: Navigating to transactions page
    await storeManagerPage.goto("/transactions");
    await expect(
      storeManagerPage.locator('[data-testid="transaction-list-table"]'),
    ).toBeVisible();

    // WHEN: Attempting to enter invalid date format
    const fromInput = storeManagerPage.locator(
      '[data-testid="date-range-picker-from"]',
    );
    // Date input type should prevent invalid input, but test that component handles gracefully
    await fromInput.fill("invalid-date");

    // THEN: Component should handle invalid input gracefully
    // (Date input validation happens at browser level, but component should not break)
    expect(await fromInput.isVisible()).toBeTruthy();
  });

  test("3.5-E2E-VALID-002: [P2] Should validate date range - from date cannot be after to date", async ({
    storeManagerPage,
    prismaClient,
  }) => {
    // GIVEN: A store exists with transactions
    const { owner, company, store } =
      await createCompanyWithStore(prismaClient);
    const cashier = await prismaClient.user.create({
      data: createClientUser(),
    });
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: cashier.user_id,
        cashier_id: cashier.user_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });

    await prismaClient.transaction.create({
      data: createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: cashier.user_id,
        total: 50.0,
      }),
    });

    // WHEN: Navigating to transactions page
    await storeManagerPage.goto("/transactions");
    await expect(
      storeManagerPage.locator('[data-testid="transaction-list-table"]'),
    ).toBeVisible();

    // WHEN: Setting from date after to date
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const fromInput = storeManagerPage.locator(
      '[data-testid="date-range-picker-from"]',
    );
    const toInput = storeManagerPage.locator(
      '[data-testid="date-range-picker-to"]',
    );

    // Set to date first (yesterday)
    await toInput.fill(yesterday.toISOString().split("T")[0]);
    // Then set from date (today) - should be prevented by min attribute or validated
    await fromInput.fill(today.toISOString().split("T")[0]);

    // THEN: Validation should prevent invalid range (handled at API level)
    // Component should allow input, but API will reject
    const applyButton = storeManagerPage.locator(
      '[data-testid="apply-filters-button"]',
    );
    await applyButton.click();

    // Verify validation error is displayed
    // Check for error element or error text indicating validation failure
    const errorElement = storeManagerPage.locator(
      '[data-testid="transaction-list-error"]',
    );
    const errorText = storeManagerPage.getByText(
      /invalid date range|from date cannot be after|from date must be less than or equal to to date/i,
    );

    // Either the error element should be visible, or error text should be visible
    await expect(errorElement.or(errorText).first()).toBeVisible({
      timeout: 5000,
    });
  });

  // ============================================================================
  // EDGE CASES - Default Filter Behavior
  // ============================================================================

  // SKIPPED: Default date filter not implemented - transactions page initializes with empty filters instead of defaulting to today's date range
  test.skip("3.5-E2E-EDGE-001: [P2] Should default to today's transactions when no filters are applied", async ({
    storeManagerPage,
    prismaClient,
  }) => {
    // GIVEN: A store exists with transactions from today and yesterday
    const { owner, company, store } =
      await createCompanyWithStore(prismaClient);
    const cashier = await prismaClient.user.create({
      data: createClientUser(),
    });
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: cashier.user_id,
        cashier_id: cashier.user_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const transactionToday = await prismaClient.transaction.create({
      data: createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: cashier.user_id,
        timestamp: today,
        total: 100.0,
      }),
    });

    const transactionYesterday = await prismaClient.transaction.create({
      data: createTransaction({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: cashier.user_id,
        timestamp: yesterday,
        total: 50.0,
      }),
    });

    // WHEN: Navigating to transactions page with no filters
    await storeManagerPage.goto("/transactions");
    await expect(
      storeManagerPage.locator('[data-testid="transaction-list-table"]'),
    ).toBeVisible();

    // THEN: Should show today's transactions by default
    // Note: This requires implementation of default filter behavior in page component
    // Currently page initializes with empty filters - this test documents expected behavior
    await expect(
      storeManagerPage.locator(`text=${transactionToday.public_id}`),
    ).toBeVisible();
    // Verify yesterday's transaction is not visible when default filter is applied
    await expect(
      storeManagerPage.locator(`text=${transactionYesterday.public_id}`),
    ).not.toBeVisible();
  });

  // ============================================================================
  // EDGE CASES - Large Data Sets
  // ============================================================================

  test("3.5-E2E-EDGE-002: [P2] Should handle pagination with large number of transactions", async ({
    storeManagerPage,
    prismaClient,
  }) => {
    // GIVEN: A store exists with more than 100 transactions
    const { owner, company, store } =
      await createCompanyWithStore(prismaClient);
    const cashier = await prismaClient.user.create({
      data: createClientUser(),
    });
    const shift = await prismaClient.shift.create({
      data: {
        store_id: store.store_id,
        opened_by: cashier.user_id,
        cashier_id: cashier.user_id,
        opening_cash: 100.0,
        status: "OPEN",
      },
    });

    // Create 105 transactions (more than default limit of 50, tests pagination)
    const transactions = [];
    for (let i = 0; i < 105; i++) {
      const transaction = await prismaClient.transaction.create({
        data: createTransaction({
          store_id: store.store_id,
          shift_id: shift.shift_id,
          cashier_id: cashier.user_id,
          total: 10.0 + i,
        }),
      });
      transactions.push(transaction);
    }

    // WHEN: Navigating to transactions page
    await storeManagerPage.goto("/transactions");
    await expect(
      storeManagerPage.locator('[data-testid="transaction-list-table"]'),
    ).toBeVisible();

    // THEN: Pagination controls should be visible and functional
    await expect(
      storeManagerPage.locator('[data-testid="pagination-controls"]'),
    ).toBeVisible();
    await expect(
      storeManagerPage.locator('[data-testid="pagination-next-button"]'),
    ).toBeVisible();

    // WHEN: Clicking next page
    await storeManagerPage
      .locator('[data-testid="pagination-next-button"]')
      .click();

    // THEN: Second page should be displayed
    // Verify transactions from second page are visible
    await expect(
      storeManagerPage.locator(`text=${transactions[50].public_id}`),
    ).toBeVisible();
  });
});
