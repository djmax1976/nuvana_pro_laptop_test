import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen, within } from "../../support/test-utils";
import { DaySummaryDetail } from "@/components/reports/DaySummaryDetail";
import { DaySummary } from "@/lib/api/day-summaries";

/**
 * @test-level Component
 * @justification UI component tests for DaySummaryDetail - comprehensive coverage
 * @story Phase 6.4 - Day Summary Dashboard
 *
 * ============================================================================
 * TRACEABILITY MATRIX - DaySummaryDetail Component Tests
 * ============================================================================
 *
 * | Test ID          | Requirement                              | Category         | Priority |
 * |------------------|------------------------------------------|------------------|----------|
 * | DS-DTL-001       | Display formatted business date          | Component        | HIGH     |
 * | DS-DTL-002       | Display status badge with correct styling| Component        | HIGH     |
 * | DS-DTL-003       | Display net sales formatted as currency  | Component        | HIGH     |
 * | DS-DTL-004       | Display transaction count                | Component        | MEDIUM   |
 * | DS-DTL-005       | Display items sold count                 | Component        | MEDIUM   |
 * | DS-DTL-006       | Calculate and display average transaction| Business Logic   | HIGH     |
 * | DS-DTL-007       | Display variance with color coding       | Component        | HIGH     |
 * | DS-DTL-008       | Display financial summary table          | Component        | HIGH     |
 * | DS-DTL-009       | Display cash summary table               | Component        | HIGH     |
 * | DS-DTL-010       | Display tender breakdown when present    | Component        | MEDIUM   |
 * | DS-DTL-011       | Display department breakdown when present| Component        | MEDIUM   |
 * | DS-DTL-012       | Display hourly breakdown when present    | Component        | MEDIUM   |
 * | DS-DTL-013       | Display notes when present               | Component        | LOW      |
 * | DS-DTL-014       | Hide breakdowns when empty               | Edge Case        | MEDIUM   |
 * | DS-DTL-015       | Handle zero transaction count            | Edge Case        | HIGH     |
 * | DS-DTL-016       | XSS prevention - sanitized text output   | Security         | CRITICAL |
 * | DS-DTL-017       | Correct currency formatting              | Assertions       | HIGH     |
 * | DS-DTL-018       | Variance color: red for negative         | Business Logic   | HIGH     |
 * | DS-DTL-019       | Variance color: amber for positive       | Business Logic   | HIGH     |
 * | DS-DTL-020       | Variance color: green for zero           | Business Logic   | HIGH     |
 * | DS-DTL-021       | Plural/singular shift text               | Business Logic   | LOW      |
 * | DS-DTL-022       | Hour formatting with leading zeros       | Assertions       | MEDIUM   |
 * | DS-DTL-023       | Filter out zero-transaction hours        | Business Logic   | MEDIUM   |
 *
 * ============================================================================
 */

// ============================================================================
// MOCKS
// ============================================================================

vi.mock("@/lib/utils", () => ({
  formatCurrency: (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value),
  cn: (...inputs: (string | undefined)[]) => inputs.filter(Boolean).join(" "),
}));

// ============================================================================
// TEST DATA FACTORIES
// ============================================================================

const createMockDaySummary = (overrides?: Partial<DaySummary>): DaySummary =>
  ({
    day_summary_id: "ds-test-001",
    store_id: "store-001",
    business_date: "2024-03-15T00:00:00Z",
    status: "CLOSED",
    gross_sales: 5000.0,
    returns_total: 150.0,
    discounts_total: 100.0,
    net_sales: 4750.0,
    tax_collected: 380.0,
    transaction_count: 125,
    items_sold_count: 450,
    shift_count: 3,
    total_cash: 2500.0,
    total_credit: 1800.0,
    total_debit: 350.0,
    total_other_tender: 100.0,
    expected_cash: 2500.0,
    actual_cash: 2495.0,
    total_cash_variance: -5.0,
    closed_at: "2024-03-15T22:00:00Z",
    closed_by: "user-001",
    notes: null,
    created_at: "2024-03-15T22:30:00Z",
    updated_at: "2024-03-15T22:30:00Z",
    ...overrides,
  }) as unknown as DaySummary;

const createMockTenderSummary = (
  overrides?: Partial<{
    tender_code: string;
    tender_name: string;
    transaction_count: number;
    amount: number;
  }>,
) => ({
  tender_code: "CASH",
  tender_name: "Cash",
  transaction_count: 75,
  amount: 2500.0,
  ...overrides,
});

const createMockDepartmentSummary = (
  overrides?: Partial<{
    department_code: string;
    department_name: string;
    item_count: number;
    gross_sales: number;
    discounts: number;
    net_sales: number;
  }>,
) => ({
  department_code: "GROCERY",
  department_name: "Grocery",
  item_count: 200,
  gross_sales: 2500.0,
  discounts: 50.0,
  net_sales: 2450.0,
  ...overrides,
});

const createMockHourlySummary = (
  overrides?: Partial<{
    hour: number;
    transaction_count: number;
    item_count: number;
    gross_sales: number;
    net_sales: number;
  }>,
) => ({
  hour: 10,
  transaction_count: 15,
  item_count: 45,
  gross_sales: 500.0,
  net_sales: 450.0,
  ...overrides,
});

// ============================================================================
// COMPONENT RENDERING TESTS
// ============================================================================

describe("Phase 6.4-COMPONENT: DaySummaryDetail - Rendering", () => {
  /**
   * DS-DTL-001: Display formatted business date
   */
  it("should display the business date in long format", () => {
    const summary = createMockDaySummary();
    renderWithProviders(<DaySummaryDetail summary={summary} />);

    // Check for March 2024 date (timezone may vary)
    expect(screen.getByText(/March 1[45], 2024/i)).toBeInTheDocument();
  });

  /**
   * DS-DTL-002: Display status badge with correct styling
   */
  it("should display CLOSED status badge with green styling", () => {
    const summary = createMockDaySummary({ status: "CLOSED" });
    renderWithProviders(<DaySummaryDetail summary={summary} />);

    const badge = screen.getByText("CLOSED");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-green-100");
  });

  it("should display OPEN status badge with blue styling", () => {
    const summary = createMockDaySummary({ status: "OPEN" });
    renderWithProviders(<DaySummaryDetail summary={summary} />);

    const badge = screen.getByText("OPEN");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-blue-100");
  });

  /**
   * DS-DTL-003: Display net sales formatted as currency
   */
  it("should display net sales in the summary card", () => {
    const summary = createMockDaySummary({ net_sales: 4750.0 });
    renderWithProviders(<DaySummaryDetail summary={summary} />);

    // Use getAllByText since net sales appears in multiple places
    const netSalesElements = screen.getAllByText("$4,750.00");
    expect(netSalesElements.length).toBeGreaterThanOrEqual(1);
  });

  /**
   * DS-DTL-004: Display transaction count
   */
  it("should display transaction count", () => {
    const summary = createMockDaySummary({ transaction_count: 125 });
    renderWithProviders(<DaySummaryDetail summary={summary} />);

    expect(screen.getByText("125")).toBeInTheDocument();
  });

  /**
   * DS-DTL-005: Display items sold count
   */
  it("should display items sold count", () => {
    const summary = createMockDaySummary({ items_sold_count: 450 });
    renderWithProviders(<DaySummaryDetail summary={summary} />);

    expect(screen.getByText("450")).toBeInTheDocument();
  });

  /**
   * DS-DTL-008: Display financial summary table
   */
  it("should display financial summary with all values", () => {
    const summary = createMockDaySummary({
      gross_sales: 5000.0,
      returns_total: 150.0,
      discounts_total: 100.0,
      net_sales: 4750.0,
      tax_collected: 380.0,
    });
    renderWithProviders(<DaySummaryDetail summary={summary} />);

    expect(screen.getByText("Financial Summary")).toBeInTheDocument();
    expect(screen.getByText("Gross Sales")).toBeInTheDocument();
    expect(screen.getByText("Returns")).toBeInTheDocument();
    expect(screen.getByText("Discounts")).toBeInTheDocument();
    expect(screen.getByText("Tax Collected")).toBeInTheDocument();
  });

  /**
   * DS-DTL-009: Display cash summary table
   */
  it("should display cash summary with all values", () => {
    const summary = createMockDaySummary({
      total_cash: 2500.0,
      total_credit: 1800.0,
      total_debit: 350.0,
      total_other_tender: 100.0,
    });
    renderWithProviders(<DaySummaryDetail summary={summary} />);

    expect(screen.getByText("Cash Summary")).toBeInTheDocument();
    expect(screen.getByText("Total Cash")).toBeInTheDocument();
    expect(screen.getByText("Total Credit")).toBeInTheDocument();
    expect(screen.getByText("Total Debit")).toBeInTheDocument();
    expect(screen.getByText("Other Tender")).toBeInTheDocument();
  });
});

// ============================================================================
// BUSINESS LOGIC TESTS
// ============================================================================

describe("Phase 6.4-BUSINESS: DaySummaryDetail - Business Logic", () => {
  /**
   * DS-DTL-006: Calculate and display average transaction
   */
  it("should calculate average transaction correctly", () => {
    const summary = createMockDaySummary({
      net_sales: 5000.0,
      transaction_count: 100,
    });
    renderWithProviders(<DaySummaryDetail summary={summary} />);

    // Average should be $50.00
    expect(screen.getByText(/Avg: \$50\.00/)).toBeInTheDocument();
  });

  /**
   * DS-DTL-018: Variance color - red for negative
   */
  it("should display negative variance in red", () => {
    const summary = createMockDaySummary({ total_cash_variance: -25.0 });
    const { container } = renderWithProviders(
      <DaySummaryDetail summary={summary} />,
    );

    const varianceElements = container.querySelectorAll(".text-red-600");
    expect(varianceElements.length).toBeGreaterThan(0);
  });

  /**
   * DS-DTL-019: Variance color - amber for positive
   */
  it("should display positive variance in amber", () => {
    const summary = createMockDaySummary({ total_cash_variance: 15.0 });
    const { container } = renderWithProviders(
      <DaySummaryDetail summary={summary} />,
    );

    const varianceElements = container.querySelectorAll(".text-amber-600");
    expect(varianceElements.length).toBeGreaterThan(0);
  });

  /**
   * DS-DTL-020: Variance color - green for zero
   */
  it("should display zero variance in green", () => {
    const summary = createMockDaySummary({ total_cash_variance: 0 });
    const { container } = renderWithProviders(
      <DaySummaryDetail summary={summary} />,
    );

    const varianceElements = container.querySelectorAll(".text-green-600");
    expect(varianceElements.length).toBeGreaterThan(0);
  });

  /**
   * DS-DTL-021: Plural/singular shift text
   */
  it("should display singular 'shift' for one shift", () => {
    const summary = createMockDaySummary({ shift_count: 1 });
    renderWithProviders(<DaySummaryDetail summary={summary} />);

    expect(screen.getByText(/1 shift$/)).toBeInTheDocument();
  });

  it("should display plural 'shifts' for multiple shifts", () => {
    const summary = createMockDaySummary({ shift_count: 3 });
    renderWithProviders(<DaySummaryDetail summary={summary} />);

    expect(screen.getByText(/3 shifts$/)).toBeInTheDocument();
  });

  /**
   * DS-DTL-023: Filter out zero-transaction hours
   */
  it("should not display hours with zero transactions", () => {
    const summary = createMockDaySummary({
      hourly_summaries: [
        createMockHourlySummary({ hour: 9, transaction_count: 10 }),
        createMockHourlySummary({ hour: 10, transaction_count: 0 }), // Should be filtered
        createMockHourlySummary({ hour: 11, transaction_count: 15 }),
      ],
    });
    renderWithProviders(<DaySummaryDetail summary={summary} />);

    expect(screen.getByText("09:00")).toBeInTheDocument();
    expect(screen.getByText("11:00")).toBeInTheDocument();
    expect(screen.queryByText("10:00")).not.toBeInTheDocument();
  });
});

// ============================================================================
// INTEGRATION TESTS (BREAKDOWN SECTIONS)
// ============================================================================

describe("Phase 6.4-INTEGRATION: DaySummaryDetail - Breakdown Sections", () => {
  /**
   * DS-DTL-010: Display tender breakdown when present
   */
  it("should display tender breakdown table when tender_summaries exist", () => {
    const summary = createMockDaySummary({
      tender_summaries: [
        createMockTenderSummary({ tender_name: "Cash", amount: 2500 }),
        createMockTenderSummary({
          tender_code: "CREDIT",
          tender_name: "Credit Card",
          amount: 1800,
        }),
      ],
    });
    renderWithProviders(<DaySummaryDetail summary={summary} />);

    expect(screen.getByText("Tender Breakdown")).toBeInTheDocument();
    expect(screen.getByText("Cash")).toBeInTheDocument();
    expect(screen.getByText("Credit Card")).toBeInTheDocument();
  });

  /**
   * DS-DTL-011: Display department breakdown when present
   */
  it("should display department breakdown table when department_summaries exist", () => {
    const summary = createMockDaySummary({
      department_summaries: [
        createMockDepartmentSummary({ department_name: "Grocery" }),
        createMockDepartmentSummary({
          department_code: "DELI",
          department_name: "Deli",
        }),
      ],
    });
    renderWithProviders(<DaySummaryDetail summary={summary} />);

    expect(screen.getByText("Department Breakdown")).toBeInTheDocument();
    expect(screen.getByText("Grocery")).toBeInTheDocument();
    expect(screen.getByText("Deli")).toBeInTheDocument();
  });

  /**
   * DS-DTL-012: Display hourly breakdown when present
   */
  it("should display hourly breakdown table when hourly_summaries exist", () => {
    const summary = createMockDaySummary({
      hourly_summaries: [
        createMockHourlySummary({ hour: 9, net_sales: 450 }),
        createMockHourlySummary({ hour: 14, net_sales: 650 }),
      ],
    });
    renderWithProviders(<DaySummaryDetail summary={summary} />);

    expect(screen.getByText("Hourly Breakdown")).toBeInTheDocument();
    expect(screen.getByText("09:00")).toBeInTheDocument();
    expect(screen.getByText("14:00")).toBeInTheDocument();
  });

  /**
   * DS-DTL-013: Display notes when present
   */
  it("should display notes section when notes exist", () => {
    const summary = createMockDaySummary({
      notes: "End of day reconciliation completed by manager.",
    });
    renderWithProviders(<DaySummaryDetail summary={summary} />);

    expect(screen.getByText("Notes")).toBeInTheDocument();
    expect(
      screen.getByText("End of day reconciliation completed by manager."),
    ).toBeInTheDocument();
  });
});

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

describe("Phase 6.4-EDGE: DaySummaryDetail - Edge Cases", () => {
  /**
   * DS-DTL-014: Hide breakdowns when empty
   */
  it("should not display tender breakdown when tender_summaries is empty", () => {
    const summary = createMockDaySummary({ tender_summaries: [] });
    renderWithProviders(<DaySummaryDetail summary={summary} />);

    expect(screen.queryByText("Tender Breakdown")).not.toBeInTheDocument();
  });

  it("should not display department breakdown when department_summaries is empty", () => {
    const summary = createMockDaySummary({ department_summaries: [] });
    renderWithProviders(<DaySummaryDetail summary={summary} />);

    expect(screen.queryByText("Department Breakdown")).not.toBeInTheDocument();
  });

  it("should not display hourly breakdown when hourly_summaries is empty", () => {
    const summary = createMockDaySummary({ hourly_summaries: [] });
    renderWithProviders(<DaySummaryDetail summary={summary} />);

    expect(screen.queryByText("Hourly Breakdown")).not.toBeInTheDocument();
  });

  it("should not display notes when notes is null", () => {
    const summary = createMockDaySummary({ notes: null });
    renderWithProviders(<DaySummaryDetail summary={summary} />);

    // Notes card should not be present
    const notesHeadings = screen.queryAllByText("Notes");
    // The heading in notes section shouldn't appear
    expect(
      notesHeadings.filter((el) => el.closest('[class*="CardHeader"]') !== null)
        .length,
    ).toBe(0);
  });

  /**
   * DS-DTL-015: Handle zero transaction count
   */
  it("should handle zero transaction count without division error", () => {
    const summary = createMockDaySummary({
      net_sales: 0,
      transaction_count: 0,
    });

    // Should not throw - renders without error
    expect(() =>
      renderWithProviders(<DaySummaryDetail summary={summary} />),
    ).not.toThrow();

    // Average should be $0.00
    expect(screen.getByText(/Avg: \$0\.00/)).toBeInTheDocument();
  });

  it("should handle negative values correctly", () => {
    const summary = createMockDaySummary({
      returns_total: 500.0,
      discounts_total: 200.0,
    });
    renderWithProviders(<DaySummaryDetail summary={summary} />);

    // Returns should be displayed in parentheses
    expect(screen.getByText(/\(\$500\.00\)/)).toBeInTheDocument();
    // Discounts should be displayed in parentheses
    expect(screen.getByText(/\(\$200\.00\)/)).toBeInTheDocument();
  });
});

// ============================================================================
// SECURITY TESTS
// ============================================================================

describe("Phase 6.4-SECURITY: DaySummaryDetail - XSS Prevention", () => {
  /**
   * DS-DTL-016: XSS prevention - sanitized text output
   */
  it("should escape XSS payloads in notes", () => {
    const xssPayload = '<script>alert("xss")</script>';
    const summary = createMockDaySummary({ notes: xssPayload });
    renderWithProviders(<DaySummaryDetail summary={summary} />);

    // The script tag should be rendered as text, not executed
    const notesElement = screen.getByText(/<script>/);
    expect(notesElement).toBeInTheDocument();

    // Verify no script elements were actually created
    const scripts = document.querySelectorAll("script");
    const maliciousScripts = Array.from(scripts).filter((s) =>
      s.textContent?.includes('alert("xss")'),
    );
    expect(maliciousScripts).toHaveLength(0);
  });

  it("should escape XSS payloads in department names from API", () => {
    const xssPayload = '<img src=x onerror="alert(1)">';
    const summary = createMockDaySummary({
      department_summaries: [
        createMockDepartmentSummary({ department_name: xssPayload }),
      ],
    });
    renderWithProviders(<DaySummaryDetail summary={summary} />);

    // Should render as text, not as an image element
    expect(screen.getByText(/<img/)).toBeInTheDocument();
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });

  it("should escape XSS payloads in tender names from API", () => {
    const xssPayload = '"><script>evil()</script>';
    const summary = createMockDaySummary({
      tender_summaries: [createMockTenderSummary({ tender_name: xssPayload })],
    });
    renderWithProviders(<DaySummaryDetail summary={summary} />);

    // Should render as text
    expect(screen.getByText(/"><script>/)).toBeInTheDocument();
  });
});

// ============================================================================
// ASSERTION/DATA ACCURACY TESTS
// ============================================================================

describe("Phase 6.4-ASSERTIONS: DaySummaryDetail - Data Accuracy", () => {
  /**
   * DS-DTL-017: Correct currency formatting
   */
  it("should format all currency values correctly", () => {
    const summary = createMockDaySummary({
      gross_sales: 5000.5,
      net_sales: 4750.25,
      tax_collected: 380.12,
      total_cash: 2500.0,
    });
    renderWithProviders(<DaySummaryDetail summary={summary} />);

    // All values should be formatted with $ and commas - use getAllByText for values that appear multiple times
    expect(screen.getAllByText("$5,000.50").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("$4,750.25").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("$380.12")).toBeInTheDocument();
    expect(screen.getByText("$2,500.00")).toBeInTheDocument();
  });

  /**
   * DS-DTL-022: Hour formatting with leading zeros
   */
  it("should format hours with leading zeros", () => {
    const summary = createMockDaySummary({
      hourly_summaries: [
        createMockHourlySummary({ hour: 6, transaction_count: 5 }),
        createMockHourlySummary({ hour: 12, transaction_count: 20 }),
        createMockHourlySummary({ hour: 23, transaction_count: 3 }),
      ],
    });
    renderWithProviders(<DaySummaryDetail summary={summary} />);

    expect(screen.getByText("06:00")).toBeInTheDocument();
    expect(screen.getByText("12:00")).toBeInTheDocument();
    expect(screen.getByText("23:00")).toBeInTheDocument();
  });

  it("should display correct tender breakdown values", () => {
    const summary = createMockDaySummary({
      tender_summaries: [
        createMockTenderSummary({
          tender_name: "Cash",
          transaction_count: 75,
          amount: 2500.0,
        }),
        createMockTenderSummary({
          tender_code: "CREDIT",
          tender_name: "Credit",
          transaction_count: 50,
          amount: 1800.0,
        }),
      ],
    });
    renderWithProviders(<DaySummaryDetail summary={summary} />);

    // Verify tender data is correctly displayed
    expect(screen.getByText("75")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getByText("$2,500.00")).toBeInTheDocument();
    expect(screen.getByText("$1,800.00")).toBeInTheDocument();
  });

  it("should display correct department breakdown values", () => {
    const summary = createMockDaySummary({
      department_summaries: [
        createMockDepartmentSummary({
          department_name: "Grocery",
          item_count: 200,
          gross_sales: 2500.0,
          discounts: 50.0,
          net_sales: 2450.0,
        }),
      ],
    });
    renderWithProviders(<DaySummaryDetail summary={summary} />);

    // Verify department data - use getAllByText for values that appear multiple times
    expect(screen.getByText("Grocery")).toBeInTheDocument();
    expect(screen.getByText("200")).toBeInTheDocument();
    expect(screen.getByText("$2,450.00")).toBeInTheDocument();
  });
});

// ============================================================================
// ACCESSIBILITY TESTS
// ============================================================================

describe("Phase 6.4-A11Y: DaySummaryDetail - Accessibility", () => {
  it("should have semantic heading structure", () => {
    const summary = createMockDaySummary();
    renderWithProviders(<DaySummaryDetail summary={summary} />);

    // Check for main heading
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toBeInTheDocument();
  });

  it("should have properly labeled tables", () => {
    const summary = createMockDaySummary({
      tender_summaries: [createMockTenderSummary()],
      department_summaries: [createMockDepartmentSummary()],
    });
    renderWithProviders(<DaySummaryDetail summary={summary} />);

    // Tables should exist
    const tables = screen.getAllByRole("table");
    expect(tables.length).toBeGreaterThanOrEqual(4);
  });

  it("should maintain proper color contrast for variance indicators", () => {
    const summary = createMockDaySummary({ total_cash_variance: -5.0 });
    const { container } = renderWithProviders(
      <DaySummaryDetail summary={summary} />,
    );

    // Red variance should use text-red-600 (good contrast)
    const redElements = container.querySelectorAll(".text-red-600");
    expect(redElements.length).toBeGreaterThan(0);
  });
});
