import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "../../support/test-utils";
import { DaySummaryCard } from "@/components/reports/DaySummaryCard";
import type { DaySummary } from "@/lib/api/day-summaries";

/**
 * @test-level Component
 * @justification UI component tests for DaySummaryCard - tests rendering and click interactions
 * @story Phase 6.4 - Day Summary Dashboard
 *
 * Component Tests: DaySummaryCard
 *
 * CRITICAL TEST COVERAGE:
 * - Displays day number and status badge
 * - Shows net sales and transaction count
 * - Shows variance with appropriate color coding
 * - Click handler triggers navigation
 */

// Helper to create mock DaySummary with test-specific properties
const createMockSummary = (overrides: Partial<DaySummary> = {}): DaySummary =>
  ({
    day_summary_id: "ds-1",
    store_id: "store-1",
    business_date: "2024-03-15T00:00:00Z",
    status: "closed",
    net_sales: 1500.75,
    gross_sales: 1650.0,
    tax_collected: 120.25,
    transaction_count: 45,
    shift_count: 3,
    items_sold_count: 100,
    returns_total: 50.0,
    discounts_total: 99.25,
    total_cash: 800.0,
    total_credit: 500.0,
    total_debit: 200.75,
    total_other_tender: 0,
    expected_cash: 805.5,
    actual_cash: 800.0,
    total_cash_variance: -5.5,
    notes: null,
    closed_by: "user-1",
    closed_at: "2024-03-15T22:00:00Z",
    created_at: "2024-03-15T22:30:00Z",
    updated_at: "2024-03-15T22:30:00Z",
    // Extended properties for component display
    variance_amount: -5.5,
    variance_percentage: -0.37,
    ...overrides,
  }) as unknown as DaySummary;

describe("Phase 6.4-COMPONENT: DaySummaryCard - Display Day Summary", () => {
  const mockSummary = createMockSummary();

  it("should display the day number", () => {
    renderWithProviders(<DaySummaryCard summary={mockSummary} />);

    expect(screen.getByText("15")).toBeInTheDocument();
  });

  it("should display net sales formatted as currency", () => {
    renderWithProviders(<DaySummaryCard summary={mockSummary} />);

    expect(screen.getByText(/\$1,500\.75/)).toBeInTheDocument();
  });

  it("should display transaction count", () => {
    renderWithProviders(<DaySummaryCard summary={mockSummary} />);

    expect(screen.getByText(/45/)).toBeInTheDocument();
  });

  it("should display shift count", () => {
    renderWithProviders(<DaySummaryCard summary={mockSummary} />);

    expect(screen.getByText(/3/)).toBeInTheDocument();
  });

  it("should call onClick when card is clicked", async () => {
    const onClick = vi.fn();
    const { container } = renderWithProviders(
      <DaySummaryCard summary={mockSummary} onClick={onClick} />,
    );

    const card = container.querySelector('[class*="cursor-pointer"]');
    if (card) {
      (card as HTMLElement).click();
    }

    expect(onClick).toHaveBeenCalled();
  });

  it("should display negative variance in red", () => {
    const { container } = renderWithProviders(
      <DaySummaryCard summary={mockSummary} />,
    );

    const varianceElement = container.querySelector('[class*="text-red"]');
    expect(varianceElement).toBeInTheDocument();
  });

  it("should display positive variance in amber", () => {
    const positiveSummary = createMockSummary({
      variance_amount: 5.5,
      variance_percentage: 0.37,
    } as Partial<DaySummary>);

    const { container } = renderWithProviders(
      <DaySummaryCard summary={positiveSummary} />,
    );

    const varianceElement = container.querySelector('[class*="text-amber"]');
    expect(varianceElement).toBeInTheDocument();
  });

  it("should display zero variance in green", () => {
    const zeroSummary = createMockSummary({
      variance_amount: 0,
      variance_percentage: 0,
    } as Partial<DaySummary>);

    const { container } = renderWithProviders(
      <DaySummaryCard summary={zeroSummary} />,
    );

    const varianceElement = container.querySelector('[class*="text-green"]');
    expect(varianceElement).toBeInTheDocument();
  });

  it("should display closed status badge", () => {
    renderWithProviders(<DaySummaryCard summary={mockSummary} />);

    expect(screen.getByText(/closed/i)).toBeInTheDocument();
  });

  it("should display open status badge for open day", () => {
    const openSummary = createMockSummary({
      status: "open" as DaySummary["status"],
    });

    renderWithProviders(<DaySummaryCard summary={openSummary} />);

    expect(screen.getByText(/open/i)).toBeInTheDocument();
  });
});
