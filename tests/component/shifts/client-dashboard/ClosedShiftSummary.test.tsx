/**
 * @test-level Component
 * @justification Component tests for ClosedShiftSummary - validates closed shift display
 * @story client-owner-dashboard-shift-detail-view
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen } from "../../../support/test-utils";
import { ClosedShiftSummary } from "@/components/shifts/client-dashboard/ClosedShiftSummary";
import type { ShiftDetailResponse } from "@/lib/api/shifts";
import type { ShiftSummaryResponse } from "@/lib/api/shift-summary";

// Mock date-fns
vi.mock("date-fns", () => ({
  format: vi.fn((date: Date, formatStr: string) => {
    if (isNaN(date.getTime())) return "Invalid Date";
    if (formatStr === "MMM d, yyyy h:mm a") return "Jan 1, 2024 10:00 AM";
    return date.toISOString();
  }),
}));

describe("CLIENT-DASHBOARD-COMPONENT: ClosedShiftSummary Component", () => {
  const mockClosedShift: ShiftDetailResponse = {
    shift_id: "shift-456-closed",
    store_id: "store-1",
    opened_by: "user-1",
    cashier_id: "cashier-1",
    pos_terminal_id: "terminal-1",
    status: "CLOSED",
    shift_number: 2,
    opening_cash: 200.0,
    closing_cash: 850.0,
    expected_cash: 800.0,
    variance_amount: 50.0,
    variance_percentage: 6.25,
    opened_at: "2024-01-01T10:00:00Z",
    closed_at: "2024-01-01T18:00:00Z",
    store_name: "Main Street Store",
    cashier_name: "John Smith",
    opener_name: "Manager Jones",
    day_summary_id: "day-summary-1",
    transaction_count: 45,
    variance_reason: "Customer returned cash payment",
    approved_by: "approver-1",
    approved_by_name: "Supervisor Adams",
    approved_at: "2024-01-01T18:05:00Z",
  };

  const mockSummary: ShiftSummaryResponse = {
    shift_id: "shift-456-closed",
    total_sales: 2500.0,
    transaction_count: 45,
    payment_methods: [
      { method: "CASH", total: 600.0, count: 20 },
      { method: "CREDIT_CARD", total: 1500.0, count: 20 },
      { method: "DEBIT_CARD", total: 400.0, count: 5 },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[P0] CLOSED-SHIFT-001: should render closed shift summary with correct header", () => {
    // GIVEN: Component is rendered with closed shift data
    renderWithProviders(
      <ClosedShiftSummary
        shift={mockClosedShift}
        summary={mockSummary}
        isLoadingSummary={false}
        summaryError={null}
      />,
    );

    // THEN: Should display correct header
    expect(screen.getByText("Shift Summary")).toBeInTheDocument();
    expect(screen.getByTestId("closed-shift-summary")).toBeInTheDocument();
  });

  it("[P0] CLOSED-SHIFT-002: should display shift information card", () => {
    // GIVEN: Component is rendered with closed shift
    renderWithProviders(
      <ClosedShiftSummary
        shift={mockClosedShift}
        summary={mockSummary}
        isLoadingSummary={false}
        summaryError={null}
      />,
    );

    // THEN: Should display shift info card
    expect(screen.getByTestId("shift-info-card")).toBeInTheDocument();
    expect(screen.getByText("Shift Information")).toBeInTheDocument();
    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.getAllByText("Main Street Store").length).toBeGreaterThan(0);
  });

  it("[P0] CLOSED-SHIFT-003: should display cash reconciliation card", () => {
    // GIVEN: Component is rendered with closed shift
    renderWithProviders(
      <ClosedShiftSummary
        shift={mockClosedShift}
        summary={mockSummary}
        isLoadingSummary={false}
        summaryError={null}
      />,
    );

    // THEN: Should display cash reconciliation card
    expect(screen.getByTestId("cash-reconciliation-card")).toBeInTheDocument();
    expect(screen.getByText("Cash Reconciliation")).toBeInTheDocument();
    expect(screen.getByText("Opening Cash")).toBeInTheDocument();
    expect(screen.getByText("$200.00")).toBeInTheDocument();
    expect(screen.getByText("Closing Cash")).toBeInTheDocument();
    expect(screen.getByText("$850.00")).toBeInTheDocument();
    expect(screen.getByText("Expected Cash")).toBeInTheDocument();
    expect(screen.getByText("$800.00")).toBeInTheDocument();
  });

  it("[P0] CLOSED-SHIFT-004: should display variance with positive amount", () => {
    // GIVEN: Component is rendered with positive variance
    renderWithProviders(
      <ClosedShiftSummary
        shift={mockClosedShift}
        summary={mockSummary}
        isLoadingSummary={false}
        summaryError={null}
      />,
    );

    // THEN: Should display variance
    expect(screen.getByText("Variance")).toBeInTheDocument();
    // Positive variance should show + sign
    expect(screen.getByText(/\+\$50\.00/)).toBeInTheDocument();
    expect(screen.getByText(/\+6\.25%/)).toBeInTheDocument();
  });

  it("[P0] CLOSED-SHIFT-005: should display variance details card when variance exists", () => {
    // GIVEN: Component is rendered with variance
    renderWithProviders(
      <ClosedShiftSummary
        shift={mockClosedShift}
        summary={mockSummary}
        isLoadingSummary={false}
        summaryError={null}
      />,
    );

    // THEN: Should display variance details card
    expect(screen.getByTestId("variance-details-card")).toBeInTheDocument();
    expect(screen.getByText("Variance Details")).toBeInTheDocument();
    expect(
      screen.getByText("Customer returned cash payment"),
    ).toBeInTheDocument();
    expect(screen.getByText("Supervisor Adams")).toBeInTheDocument();
  });

  it("[P0] CLOSED-SHIFT-006: should display payment methods summary", () => {
    // GIVEN: Component is rendered with summary data
    renderWithProviders(
      <ClosedShiftSummary
        shift={mockClosedShift}
        summary={mockSummary}
        isLoadingSummary={false}
        summaryError={null}
      />,
    );

    // THEN: Should display money received summary
    expect(screen.getByTestId("money-received-summary")).toBeInTheDocument();
    expect(screen.getByText("Payment Methods")).toBeInTheDocument();
  });

  it("[P0] CLOSED-SHIFT-007: should display sales breakdown summary", () => {
    // GIVEN: Component is rendered with summary data
    renderWithProviders(
      <ClosedShiftSummary
        shift={mockClosedShift}
        summary={mockSummary}
        isLoadingSummary={false}
        summaryError={null}
      />,
    );

    // THEN: Should display sales breakdown summary
    expect(screen.getByTestId("sales-breakdown-summary")).toBeInTheDocument();
    expect(screen.getByText("Sales Summary")).toBeInTheDocument();
  });

  it("[P1] CLOSED-SHIFT-008: should show loading state when summary is loading", () => {
    // GIVEN: Summary is loading
    renderWithProviders(
      <ClosedShiftSummary
        shift={mockClosedShift}
        summary={undefined}
        isLoadingSummary={true}
        summaryError={null}
      />,
    );

    // THEN: Should display loading message
    expect(screen.getByText("Loading shift breakdown...")).toBeInTheDocument();

    // AND: Should not display summary components
    expect(
      screen.queryByTestId("money-received-summary"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("sales-breakdown-summary"),
    ).not.toBeInTheDocument();
  });

  it("[P1] CLOSED-SHIFT-009: should show error state when summary fails to load", () => {
    // GIVEN: Summary has error
    const mockError = new Error("Failed to fetch summary");

    renderWithProviders(
      <ClosedShiftSummary
        shift={mockClosedShift}
        summary={undefined}
        isLoadingSummary={false}
        summaryError={mockError}
      />,
    );

    // THEN: Should display error message
    expect(
      screen.getByText(/Failed to load shift breakdown/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Failed to fetch summary/)).toBeInTheDocument();
  });

  it("[P1] CLOSED-SHIFT-010: should display negative variance with correct styling", () => {
    // GIVEN: Shift with negative variance
    const shiftWithNegativeVariance: ShiftDetailResponse = {
      ...mockClosedShift,
      variance_amount: -25.0,
      variance_percentage: -3.12,
    };

    renderWithProviders(
      <ClosedShiftSummary
        shift={shiftWithNegativeVariance}
        summary={mockSummary}
        isLoadingSummary={false}
        summaryError={null}
      />,
    );

    // THEN: Should display negative variance (no + sign)
    expect(screen.getByText(/-\$25\.00/)).toBeInTheDocument();
    expect(screen.getByText(/-3\.12%/)).toBeInTheDocument();
  });

  it("[P1] CLOSED-SHIFT-011: should not show variance details card when no variance", () => {
    // GIVEN: Shift with no variance
    const shiftWithNoVariance: ShiftDetailResponse = {
      ...mockClosedShift,
      variance_amount: 0,
      variance_percentage: 0,
      variance_reason: null,
      approved_by: null,
      approved_by_name: null,
      approved_at: null,
    };

    renderWithProviders(
      <ClosedShiftSummary
        shift={shiftWithNoVariance}
        summary={mockSummary}
        isLoadingSummary={false}
        summaryError={null}
      />,
    );

    // THEN: Should not display variance details card
    expect(
      screen.queryByTestId("variance-details-card"),
    ).not.toBeInTheDocument();

    // AND: Should display success message
    expect(screen.getByText(/no variance/)).toBeInTheDocument();
  });

  it("[P1] CLOSED-SHIFT-012: should display truncated shift ID", () => {
    // GIVEN: Component is rendered with shift data
    renderWithProviders(
      <ClosedShiftSummary
        shift={mockClosedShift}
        summary={mockSummary}
        isLoadingSummary={false}
        summaryError={null}
      />,
    );

    // THEN: Should display truncated shift ID (first 8 chars)
    expect(screen.getByText("shift-45...")).toBeInTheDocument();
  });

  it("[P2] CLOSED-SHIFT-013: should handle unknown cashier name gracefully", () => {
    // GIVEN: Shift with no cashier name
    const shiftWithoutCashier: ShiftDetailResponse = {
      ...mockClosedShift,
      cashier_name: undefined,
    };

    renderWithProviders(
      <ClosedShiftSummary
        shift={shiftWithoutCashier}
        summary={mockSummary}
        isLoadingSummary={false}
        summaryError={null}
      />,
    );

    // THEN: Should display "Unknown" for cashier
    expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);
  });

  it("[P2] CLOSED-SHIFT-014: should display transaction count", () => {
    // GIVEN: Component is rendered with transaction count
    renderWithProviders(
      <ClosedShiftSummary
        shift={mockClosedShift}
        summary={mockSummary}
        isLoadingSummary={false}
        summaryError={null}
      />,
    );

    // THEN: Should display transaction count (appears in multiple places)
    expect(screen.getAllByText("Transactions").length).toBeGreaterThan(0);
    expect(screen.getAllByText("45").length).toBeGreaterThan(0);
  });
});
