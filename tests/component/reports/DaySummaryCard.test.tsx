import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "../../support/test-utils";
import { DaySummaryCard } from "@/components/reports/DaySummaryCard";

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

describe("Phase 6.4-COMPONENT: DaySummaryCard - Display Day Summary", () => {
  const mockSummary = {
    day_summary_id: "ds-1",
    store_id: "store-1",
    business_date: "2024-03-15T00:00:00Z",
    status: "closed",
    net_sales: 1500.75,
    gross_sales: 1650.0,
    tax_collected: 120.25,
    transaction_count: 45,
    shift_count: 3,
    variance_amount: -5.5,
    variance_percentage: -0.37,
    opened_at: "2024-03-15T06:00:00Z",
    closed_at: "2024-03-15T22:00:00Z",
    created_at: "2024-03-15T22:30:00Z",
    updated_at: "2024-03-15T22:30:00Z",
  };

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
      card.click();
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
    const positiveSummary = {
      ...mockSummary,
      variance_amount: 5.5,
      variance_percentage: 0.37,
    };

    const { container } = renderWithProviders(
      <DaySummaryCard summary={positiveSummary} />,
    );

    const varianceElement = container.querySelector('[class*="text-amber"]');
    expect(varianceElement).toBeInTheDocument();
  });

  it("should display zero variance in green", () => {
    const zeroSummary = {
      ...mockSummary,
      variance_amount: 0,
      variance_percentage: 0,
    };

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
    const openSummary = {
      ...mockSummary,
      status: "open",
    };

    renderWithProviders(<DaySummaryCard summary={openSummary} />);

    expect(screen.getByText(/open/i)).toBeInTheDocument();
  });
});
