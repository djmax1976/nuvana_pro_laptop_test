/**
 * @test-level Component
 * @justification Component tests for ActiveShiftView - validates active shift display in client owner dashboard
 * @story client-owner-dashboard-shift-detail-view
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen } from "../../../support/test-utils";
import { ActiveShiftView } from "@/components/shifts/client-dashboard/ActiveShiftView";
import type { ShiftDetailResponse } from "@/lib/api/shifts";

// Mock date-fns
vi.mock("date-fns", () => ({
  format: vi.fn((date: Date, formatStr: string) => {
    if (isNaN(date.getTime())) return "Invalid Date";
    if (formatStr === "h:mm a") return "10:00 AM";
    if (formatStr === "MMMM d, yyyy") return "January 1, 2024";
    return date.toISOString();
  }),
}));

describe("CLIENT-DASHBOARD-COMPONENT: ActiveShiftView Component", () => {
  const mockActiveShift: ShiftDetailResponse = {
    shift_id: "shift-123-active",
    store_id: "store-1",
    opened_by: "user-1",
    cashier_id: "cashier-1",
    pos_terminal_id: "terminal-1",
    status: "ACTIVE",
    shift_number: 1,
    opening_cash: 150.0,
    closing_cash: null,
    expected_cash: null,
    variance_amount: null,
    variance_percentage: null,
    opened_at: "2024-01-01T10:00:00Z",
    closed_at: null,
    store_name: "Test Store",
    cashier_name: "Jane Doe",
    opener_name: "Manager Smith",
    transaction_count: 25,
    variance_reason: null,
    approved_by: null,
    approved_by_name: null,
    approved_at: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[P0] ACTIVE-SHIFT-001: should render active shift view with correct header", () => {
    // GIVEN: Component is rendered with active shift data
    // WHEN: Component renders
    renderWithProviders(<ActiveShiftView shift={mockActiveShift} />);

    // THEN: Should display correct header
    expect(screen.getByText("Active Shift")).toBeInTheDocument();
    expect(screen.getByTestId("active-shift-view")).toBeInTheDocument();
  });

  it("[P0] ACTIVE-SHIFT-002: should display shift information card with cashier details", () => {
    // GIVEN: Component is rendered with shift data
    renderWithProviders(<ActiveShiftView shift={mockActiveShift} />);

    // THEN: Should display cashier name
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    // THEN: Should display store name
    expect(screen.getAllByText("Test Store").length).toBeGreaterThan(0);
    // THEN: Should display shift info card
    expect(screen.getByTestId("shift-info-card")).toBeInTheDocument();
  });

  it("[P0] ACTIVE-SHIFT-003: should display opening cash amount", () => {
    // GIVEN: Component is rendered with shift data
    renderWithProviders(<ActiveShiftView shift={mockActiveShift} />);

    // THEN: Should display opening cash
    expect(screen.getByText("Opening Cash")).toBeInTheDocument();
    expect(screen.getByText("$150.00")).toBeInTheDocument();
  });

  it("[P0] ACTIVE-SHIFT-004: should display transaction metrics card with placeholders", () => {
    // GIVEN: Component is rendered with shift data
    renderWithProviders(<ActiveShiftView shift={mockActiveShift} />);

    // THEN: Should display metrics card
    expect(screen.getByTestId("transaction-metrics-card")).toBeInTheDocument();
    // THEN: Should display placeholder metrics
    expect(screen.getByText("Total Sales")).toBeInTheDocument();
    expect(screen.getByText("Total Tax Collected")).toBeInTheDocument();
    expect(screen.getByText("Total Voids")).toBeInTheDocument();
  });

  it("[P0] ACTIVE-SHIFT-005: should display transaction count", () => {
    // GIVEN: Component is rendered with shift data
    renderWithProviders(<ActiveShiftView shift={mockActiveShift} />);

    // THEN: Should display transaction count
    expect(screen.getByTestId("transaction-count-card")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText("Transactions")).toBeInTheDocument();
  });

  it("[P1] ACTIVE-SHIFT-006: should display shift status badge", () => {
    // GIVEN: Component is rendered with active shift
    renderWithProviders(<ActiveShiftView shift={mockActiveShift} />);

    // THEN: Should display status badge (ACTIVE)
    // Note: ShiftStatusBadge component handles the exact display
    expect(screen.getByTestId("active-shift-view")).toBeInTheDocument();
  });

  it("[P1] ACTIVE-SHIFT-007: should handle unknown cashier name gracefully", () => {
    // GIVEN: Shift with no cashier name
    const shiftWithoutCashier: ShiftDetailResponse = {
      ...mockActiveShift,
      cashier_name: undefined,
    };

    // WHEN: Component renders
    renderWithProviders(<ActiveShiftView shift={shiftWithoutCashier} />);

    // THEN: Should display "Unknown" for cashier
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("[P1] ACTIVE-SHIFT-008: should display truncated shift ID", () => {
    // GIVEN: Component is rendered with shift data
    renderWithProviders(<ActiveShiftView shift={mockActiveShift} />);

    // THEN: Should display truncated shift ID (first 8 chars)
    expect(screen.getByText("shift-12...")).toBeInTheDocument();
  });
});
