/**
 * @test-level Component
 * @justification Component tests for ShiftDetailModal - validates shift detail display, loading states, and report link
 * @story 4-7-shift-management-ui
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "../../support/test-utils";
import { ShiftDetailModal } from "@/components/shifts/ShiftDetailModal";
import * as shiftsApi from "@/lib/api/shifts";
import type { ShiftResponse, ShiftDetailResponse } from "@/lib/api/shifts";

// Mock Next.js Link component
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

// Mock the API hooks
vi.mock("@/lib/api/shifts", () => ({
  useShiftDetail: vi.fn(),
}));

// Mock date-fns
vi.mock("date-fns", () => ({
  format: vi.fn((date: Date) => {
    if (isNaN(date.getTime())) return "Invalid Date";
    return date.toISOString();
  }),
}));

describe("4.7-COMPONENT: ShiftDetailModal Component", () => {
  const mockShift: ShiftResponse = {
    shift_id: "shift-123",
    store_id: "store-1",
    opened_by: "user-1",
    cashier_id: "cashier-1",
    pos_terminal_id: "terminal-1",
    status: "CLOSED",
    opening_cash: 100.0,
    closing_cash: 250.0,
    expected_cash: 245.0,
    variance_amount: 5.0,
    variance_percentage: 2.04,
    opened_at: "2024-01-01T10:00:00Z",
    closed_at: "2024-01-01T18:00:00Z",
    store_name: "Store 1",
    cashier_name: "John Doe",
    day_summary_id: "day-summary-1",
  };

  const mockShiftDetail: ShiftDetailResponse = {
    ...mockShift,
    shift_number: 1,
    transaction_count: 50,
    variance_reason: "Minor cash discrepancy",
    approved_by: "user-2",
    approved_by_name: "Manager",
    approved_at: "2024-01-01T19:00:00Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[P0] 4.7-COMPONENT-060: should render modal when open is true", () => {
    // GIVEN: Component is rendered with open=true
    vi.mocked(shiftsApi.useShiftDetail).mockReturnValue({
      data: mockShiftDetail,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <ShiftDetailModal shift={mockShift} open={true} onOpenChange={vi.fn()} />,
    );

    // THEN: Modal should be visible
    expect(screen.getByText("Shift Details")).toBeInTheDocument();
  });

  it("[P0] 4.7-COMPONENT-061: should display shift metadata", () => {
    // GIVEN: Component is rendered with shift data
    vi.mocked(shiftsApi.useShiftDetail).mockReturnValue({
      data: mockShiftDetail,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <ShiftDetailModal shift={mockShift} open={true} onOpenChange={vi.fn()} />,
    );

    // THEN: Shift metadata should be displayed
    expect(screen.getByText("Store 1")).toBeInTheDocument();
    expect(screen.getByText("John Doe")).toBeInTheDocument();
  });

  it("[P0] 4.7-COMPONENT-062: should display cash reconciliation summary", () => {
    // GIVEN: Component is rendered with shift data
    vi.mocked(shiftsApi.useShiftDetail).mockReturnValue({
      data: mockShiftDetail,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <ShiftDetailModal shift={mockShift} open={true} onOpenChange={vi.fn()} />,
    );

    // THEN: Cash reconciliation should be displayed
    expect(screen.getByText(/cash reconciliation/i)).toBeInTheDocument();
  });

  it("[P0] 4.7-COMPONENT-063: should display transaction count", () => {
    // GIVEN: Component is rendered with shift detail data
    vi.mocked(shiftsApi.useShiftDetail).mockReturnValue({
      data: mockShiftDetail,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <ShiftDetailModal shift={mockShift} open={true} onOpenChange={vi.fn()} />,
    );

    // THEN: Transaction count should be displayed
    const totalTransactionsLabel = screen.getByText(/total transactions/i);
    expect(totalTransactionsLabel).toBeInTheDocument();
    // Use within to scope the query to the transaction section container,
    // ensuring we match the correct "50" value next to "Total Transactions:"
    // The label and value are siblings in a flex container div
    const transactionContainer = totalTransactionsLabel.parentElement;
    expect(transactionContainer).toBeTruthy();
    expect(within(transactionContainer!).getByText("50")).toBeInTheDocument();
  });

  it("[P0] 4.7-COMPONENT-064: should display variance details when applicable", () => {
    // GIVEN: Component is rendered with shift having variance
    vi.mocked(shiftsApi.useShiftDetail).mockReturnValue({
      data: mockShiftDetail,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <ShiftDetailModal shift={mockShift} open={true} onOpenChange={vi.fn()} />,
    );

    // THEN: Variance details should be displayed
    expect(screen.getByText(/variance details/i)).toBeInTheDocument();
    expect(screen.getByText("Minor cash discrepancy")).toBeInTheDocument();
    expect(screen.getByText("Manager")).toBeInTheDocument();
  });

  it("[P0] 4.7-COMPONENT-065: should display report link for CLOSED shifts", () => {
    // GIVEN: Component is rendered with CLOSED shift
    vi.mocked(shiftsApi.useShiftDetail).mockReturnValue({
      data: mockShiftDetail,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <ShiftDetailModal shift={mockShift} open={true} onOpenChange={vi.fn()} />,
    );

    // THEN: Report link should be displayed
    expect(screen.getByText(/view report/i)).toBeInTheDocument();
  });

  it("[P0] 4.7-COMPONENT-066: should display loading state while fetching details", () => {
    // GIVEN: Shift detail API is loading
    vi.mocked(shiftsApi.useShiftDetail).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      isError: false,
      isSuccess: false,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <ShiftDetailModal shift={mockShift} open={true} onOpenChange={vi.fn()} />,
    );

    // THEN: Loading state should be displayed
    expect(screen.getByText(/loading shift details/i)).toBeInTheDocument();
  });

  it("[P0] 4.7-COMPONENT-067: should display error state when API fails", () => {
    // GIVEN: Shift detail API returns error
    vi.mocked(shiftsApi.useShiftDetail).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Failed to load shift details"),
      isError: true,
      isSuccess: false,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <ShiftDetailModal shift={mockShift} open={true} onOpenChange={vi.fn()} />,
    );

    // THEN: Error message should be displayed
    expect(
      screen.getByText(/failed to load shift details/i),
    ).toBeInTheDocument();
  });

  it("[P1] 4.7-COMPONENT-068: should not display report link for non-CLOSED shifts", () => {
    // GIVEN: Component is rendered with OPEN shift
    const openShift: ShiftResponse = {
      ...mockShift,
      status: "OPEN",
      closed_at: null,
    };

    vi.mocked(shiftsApi.useShiftDetail).mockReturnValue({
      data: { ...openShift, transaction_count: 0 },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <ShiftDetailModal shift={openShift} open={true} onOpenChange={vi.fn()} />,
    );

    // THEN: Report link should not be displayed
    expect(screen.queryByText(/view report/i)).not.toBeInTheDocument();
  });

  // ============================================================================
  // SECURITY TESTS - XSS Prevention (Component Level)
  // ============================================================================

  it("[P1] 4.7-COMPONENT-SEC-001: should sanitize XSS in displayed shift data", () => {
    // GIVEN: Component is rendered with shift containing potential XSS
    const xssShift: ShiftResponse = {
      ...mockShift,
      store_name: "<script>alert('xss')</script>Store 1",
      cashier_name: "John<script>alert('xss')</script>",
    };

    vi.mocked(shiftsApi.useShiftDetail).mockReturnValue({
      data: { ...xssShift, transaction_count: 50 },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <ShiftDetailModal shift={xssShift} open={true} onOpenChange={vi.fn()} />,
    );

    // THEN: XSS should be escaped (React automatically escapes HTML)
    // React escapes HTML entities, preventing script execution
    expect(screen.getByText(/store 1/i)).toBeInTheDocument();

    // Verify that injected script text is rendered as plain text (escaped)
    // React escapes HTML, so the script tag should appear as literal text
    // Check store_name field
    // There are multiple elements with this text (store and cashier), so use getAllByText
    const xssElements = screen.getAllByText(
      /<script>alert\('xss'\)<\/script>/i,
    );
    expect(xssElements.length).toBeGreaterThan(0);

    // Check cashier_name field - verify John is visible and script is escaped
    expect(screen.getByText(/john/i)).toBeInTheDocument();

    // Verify that no actual script element exists in the DOM
    expect(document.querySelector("script")).toBeNull();
  });

  // ============================================================================
  // ADDITIONAL ASSERTIONS - Response Structure & Data Types
  // ============================================================================

  it("[P1] 4.7-COMPONENT-ASSERT-001: should verify shift detail response structure", () => {
    // GIVEN: Component is rendered with shift detail data
    vi.mocked(shiftsApi.useShiftDetail).mockReturnValue({
      data: mockShiftDetail,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <ShiftDetailModal shift={mockShift} open={true} onOpenChange={vi.fn()} />,
    );

    // THEN: Component should display the transaction count from shift detail
    const totalTransactionsLabel = screen.getByText(/total transactions/i);
    expect(totalTransactionsLabel).toBeInTheDocument();
    // Verify the transaction count value is displayed in the component
    const transactionContainer = totalTransactionsLabel.parentElement;
    expect(transactionContainer).toBeTruthy();
    const transactionCountElement = within(transactionContainer!).getByText(
      mockShiftDetail.transaction_count.toString(),
    );
    expect(transactionCountElement).toBeInTheDocument();
  });

  it("[P1] 4.7-COMPONENT-ASSERT-002: should verify variance details structure when present", () => {
    // GIVEN: Component is rendered with shift having variance
    vi.mocked(shiftsApi.useShiftDetail).mockReturnValue({
      data: mockShiftDetail,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // WHEN: Component is rendered
    renderWithProviders(
      <ShiftDetailModal shift={mockShift} open={true} onOpenChange={vi.fn()} />,
    );

    // THEN: Variance details should be displayed in the DOM
    // Verify variance reason label and value are displayed
    expect(screen.getByText("Variance Reason")).toBeInTheDocument();
    expect(screen.getByText("Minor cash discrepancy")).toBeInTheDocument();

    // Verify approved by label and value are displayed
    expect(screen.getByText("Approved By")).toBeInTheDocument();
    expect(screen.getByText("Manager")).toBeInTheDocument();

    // Verify approved at label is displayed (value is formatted timestamp)
    expect(screen.getByText("Approved At")).toBeInTheDocument();
  });
});
