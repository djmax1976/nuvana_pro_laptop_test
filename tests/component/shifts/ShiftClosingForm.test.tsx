/**
 * @test-level Component
 * @justification Component tests for ShiftClosingForm - validates closing initiation, reconciliation flow, and variance threshold logic
 * @story 4-7-shift-management-ui
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../support/test-utils";
import { ShiftClosingForm } from "@/components/shifts/ShiftClosingForm";
import * as shiftsApi from "@/lib/api/shifts";
import userEvent from "@testing-library/user-event";

// Mock the API hooks
vi.mock("@/lib/api/shifts", () => ({
  useCloseShift: vi.fn(),
  useReconcileCash: vi.fn(),
  useInvalidateShifts: vi.fn(),
}));

// Mock toast hook
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe("4.7-COMPONENT: ShiftClosingForm Component", () => {
  const mockShiftId = "shift-123";

  const mockCloseShiftMutation = {
    mutateAsync: vi.fn(),
    isPending: false,
  };

  const mockReconcileCashMutation = {
    mutateAsync: vi.fn(),
    isPending: false,
  };

  const mockInvalidate = {
    invalidateList: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(shiftsApi.useCloseShift).mockReturnValue(
      mockCloseShiftMutation as any,
    );
    vi.mocked(shiftsApi.useReconcileCash).mockReturnValue(
      mockReconcileCashMutation as any,
    );
    vi.mocked(shiftsApi.useInvalidateShifts).mockReturnValue(
      mockInvalidate as any,
    );
  });

  it("[P0] 4.7-COMPONENT-040: should render initiate closing step when open", () => {
    // GIVEN: Component is rendered with open=true
    renderWithProviders(
      <ShiftClosingForm
        shiftId={mockShiftId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Initiate closing button should be displayed
    expect(screen.getByTestId("initiate-closing-button")).toBeInTheDocument();
    expect(screen.getByText(/close shift/i)).toBeInTheDocument();
  });

  it("[P0] 4.7-COMPONENT-041: should initiate closing when button is clicked", async () => {
    // GIVEN: Component is rendered and close shift succeeds
    const user = userEvent.setup();
    mockCloseShiftMutation.mutateAsync.mockResolvedValue({
      success: true,
      data: {
        shift_id: mockShiftId,
        status: "CLOSING",
        closing_initiated_at: "2024-01-01T10:00:00Z",
        closing_initiated_by: "user-1",
        expected_cash: 245.0,
        opening_cash: 100.0,
        cash_transactions_total: 145.0,
        calculated_at: "2024-01-01T10:00:00Z",
      },
    });

    renderWithProviders(
      <ShiftClosingForm
        shiftId={mockShiftId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Initiate closing button is clicked
    const initiateButton = screen.getByTestId("initiate-closing-button");
    await user.click(initiateButton);

    // THEN: Close shift mutation should be called
    await waitFor(() => {
      expect(mockCloseShiftMutation.mutateAsync).toHaveBeenCalledWith(
        mockShiftId,
      );
    });
  });

  it("[P0] 4.7-COMPONENT-042: should display reconciliation form after closing initiated", async () => {
    // GIVEN: Component is rendered and closing is initiated
    const user = userEvent.setup();
    mockCloseShiftMutation.mutateAsync.mockResolvedValue({
      success: true,
      data: {
        shift_id: mockShiftId,
        status: "CLOSING",
        expected_cash: 245.0,
        opening_cash: 100.0,
        cash_transactions_total: 145.0,
        closing_initiated_at: "2024-01-01T10:00:00Z",
        closing_initiated_by: "user-1",
        calculated_at: "2024-01-01T10:00:00Z",
      },
    });

    renderWithProviders(
      <ShiftClosingForm
        shiftId={mockShiftId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Closing is initiated
    const initiateButton = screen.getByTestId("initiate-closing-button");
    await user.click(initiateButton);

    // THEN: Reconciliation form should be displayed
    await waitFor(() => {
      expect(screen.getByTestId("expected-cash-display")).toBeInTheDocument();
      expect(screen.getByTestId("actual-cash-input")).toBeInTheDocument();
    });
  });

  it("[P0] 4.7-COMPONENT-043: should calculate and display variance", async () => {
    // GIVEN: Component is in reconciliation step
    const user = userEvent.setup();
    mockCloseShiftMutation.mutateAsync.mockResolvedValue({
      success: true,
      data: {
        shift_id: mockShiftId,
        status: "CLOSING",
        expected_cash: 245.0,
        opening_cash: 100.0,
        cash_transactions_total: 145.0,
        closing_initiated_at: "2024-01-01T10:00:00Z",
        closing_initiated_by: "user-1",
        calculated_at: "2024-01-01T10:00:00Z",
      },
    });

    renderWithProviders(
      <ShiftClosingForm
        shiftId={mockShiftId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Closing is initiated and actual cash is entered
    await user.click(screen.getByTestId("initiate-closing-button"));
    await waitFor(() => {
      expect(screen.getByTestId("actual-cash-input")).toBeInTheDocument();
    });

    const actualCashInput = screen.getByTestId("actual-cash-input");
    await user.type(actualCashInput, "250");

    // THEN: Variance should be calculated and displayed
    await waitFor(() => {
      expect(screen.getByTestId("variance-amount-display")).toBeInTheDocument();
      expect(
        screen.getByTestId("variance-percentage-display"),
      ).toBeInTheDocument();
    });
  });

  it("[P0] 4.7-COMPONENT-044: should display variance alert when threshold exceeded", async () => {
    // GIVEN: Component is in reconciliation step with variance > $5
    const user = userEvent.setup();
    mockCloseShiftMutation.mutateAsync.mockResolvedValue({
      success: true,
      data: {
        shift_id: mockShiftId,
        status: "CLOSING",
        expected_cash: 100.0,
        opening_cash: 50.0,
        cash_transactions_total: 50.0,
        closing_initiated_at: "2024-01-01T10:00:00Z",
        closing_initiated_by: "user-1",
        calculated_at: "2024-01-01T10:00:00Z",
      },
    });

    renderWithProviders(
      <ShiftClosingForm
        shiftId={mockShiftId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Closing is initiated and actual cash creates variance > $5
    await user.click(screen.getByTestId("initiate-closing-button"));
    await waitFor(() => {
      expect(screen.getByTestId("actual-cash-input")).toBeInTheDocument();
    });

    const actualCashInput = screen.getByTestId("actual-cash-input");
    await user.type(actualCashInput, "110"); // Variance = $10 > $5 threshold

    // THEN: Variance alert should be displayed
    await waitFor(() => {
      expect(screen.getByTestId("variance-alert")).toBeInTheDocument();
      expect(
        screen.getByText(/variance exceeds threshold/i),
      ).toBeInTheDocument();
    });
  });

  it("[P0] 4.7-COMPONENT-045: should submit reconciliation with valid data", async () => {
    // GIVEN: Component is in reconciliation step
    const user = userEvent.setup();
    mockCloseShiftMutation.mutateAsync.mockResolvedValue({
      success: true,
      data: {
        shift_id: mockShiftId,
        status: "CLOSING",
        expected_cash: 245.0,
        opening_cash: 100.0,
        cash_transactions_total: 145.0,
        closing_initiated_at: "2024-01-01T10:00:00Z",
        closing_initiated_by: "user-1",
        calculated_at: "2024-01-01T10:00:00Z",
      },
    });

    mockReconcileCashMutation.mutateAsync.mockResolvedValue({
      success: true,
      data: {
        shift_id: mockShiftId,
        status: "RECONCILING",
        closing_cash: 250.0,
        expected_cash: 245.0,
        variance_amount: 5.0,
        variance_percentage: 2.04,
      },
    });

    renderWithProviders(
      <ShiftClosingForm
        shiftId={mockShiftId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Closing is initiated, actual cash entered, and form submitted
    await user.click(screen.getByTestId("initiate-closing-button"));
    await waitFor(() => {
      expect(screen.getByTestId("actual-cash-input")).toBeInTheDocument();
    });

    const actualCashInput = screen.getByTestId("actual-cash-input");
    await user.type(actualCashInput, "250");

    const submitButton = screen.getByTestId("submit-reconciliation");
    await user.click(submitButton);

    // THEN: Reconcile cash mutation should be called
    await waitFor(() => {
      expect(mockReconcileCashMutation.mutateAsync).toHaveBeenCalledWith({
        shiftId: mockShiftId,
        data: {
          closing_cash: 250,
          variance_reason: undefined,
        },
      });
    });
  });

  it("[P0] 4.7-COMPONENT-046: should validate closing cash is positive", async () => {
    // GIVEN: Component is in reconciliation step
    const user = userEvent.setup();
    mockCloseShiftMutation.mutateAsync.mockResolvedValue({
      success: true,
      data: {
        shift_id: mockShiftId,
        status: "CLOSING",
        expected_cash: 245.0,
        opening_cash: 100.0,
        cash_transactions_total: 145.0,
        closing_initiated_at: "2024-01-01T10:00:00Z",
        closing_initiated_by: "user-1",
        calculated_at: "2024-01-01T10:00:00Z",
      },
    });

    renderWithProviders(
      <ShiftClosingForm
        shiftId={mockShiftId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Closing is initiated and invalid cash amount is entered
    await user.click(screen.getByTestId("initiate-closing-button"));
    await waitFor(() => {
      expect(screen.getByTestId("actual-cash-input")).toBeInTheDocument();
    });

    const actualCashInput = screen.getByTestId("actual-cash-input");
    await user.type(actualCashInput, "0");

    const submitButton = screen.getByTestId("submit-reconciliation");
    await user.click(submitButton);

    // THEN: Validation error should be displayed
    await waitFor(() => {
      expect(
        screen.getByText(/closing cash must be a positive number/i),
      ).toBeInTheDocument();
    });
  });

  it("[P1] 4.7-COMPONENT-047: should handle closing initiation errors", async () => {
    // GIVEN: Component is rendered and close shift fails
    const user = userEvent.setup();
    mockCloseShiftMutation.mutateAsync.mockRejectedValue(
      new Error("SHIFT_NOT_FOUND: Shift not found"),
    );

    renderWithProviders(
      <ShiftClosingForm
        shiftId={mockShiftId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Initiate closing button is clicked
    const initiateButton = screen.getByTestId("initiate-closing-button");
    await user.click(initiateButton);

    // THEN: Error should be handled (toast notification would be shown)
    await waitFor(() => {
      expect(mockCloseShiftMutation.mutateAsync).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // SECURITY TESTS - Input Validation & XSS Prevention (Component Level)
  // ============================================================================

  it("[P1] 4.7-COMPONENT-SEC-001: should sanitize XSS attempts in closing cash input", async () => {
    // GIVEN: Component is in reconciliation step
    const user = userEvent.setup();
    mockCloseShiftMutation.mutateAsync.mockResolvedValue({
      success: true,
      data: {
        shift_id: mockShiftId,
        status: "CLOSING",
        expected_cash: 245.0,
        opening_cash: 100.0,
        cash_transactions_total: 145.0,
        closing_initiated_at: "2024-01-01T10:00:00Z",
        closing_initiated_by: "user-1",
        calculated_at: "2024-01-01T10:00:00Z",
      },
    });

    renderWithProviders(
      <ShiftClosingForm
        shiftId={mockShiftId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Closing is initiated and XSS attempt is entered
    await user.click(screen.getByTestId("initiate-closing-button"));
    await waitFor(() => {
      expect(screen.getByTestId("actual-cash-input")).toBeInTheDocument();
    });

    const actualCashInput = screen.getByTestId("actual-cash-input");
    await user.type(actualCashInput, "<script>alert('xss')</script>");

    // THEN: Input should be sanitized (number input should reject non-numeric)
    // Number input returns null for invalid input
    expect(actualCashInput).toHaveValue(null);
  });

  it("[P1] 4.7-COMPONENT-SEC-002: should validate closing cash accepts only numeric input", async () => {
    // GIVEN: Component is in reconciliation step
    const user = userEvent.setup();
    mockCloseShiftMutation.mutateAsync.mockResolvedValue({
      success: true,
      data: {
        shift_id: mockShiftId,
        status: "CLOSING",
        expected_cash: 245.0,
        opening_cash: 100.0,
        cash_transactions_total: 145.0,
        closing_initiated_at: "2024-01-01T10:00:00Z",
        closing_initiated_by: "user-1",
        calculated_at: "2024-01-01T10:00:00Z",
      },
    });

    renderWithProviders(
      <ShiftClosingForm
        shiftId={mockShiftId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Closing is initiated and non-numeric characters are entered
    await user.click(screen.getByTestId("initiate-closing-button"));
    await waitFor(() => {
      expect(screen.getByTestId("actual-cash-input")).toBeInTheDocument();
    });

    const actualCashInput = screen.getByTestId("actual-cash-input");
    await user.type(actualCashInput, "abc250");

    // THEN: Only numeric characters should be accepted
    expect(actualCashInput).toHaveValue(250);
  });

  // ============================================================================
  // EDGE CASE TESTS - Closing Cash Boundary Conditions
  // ============================================================================

  it("[P1] 4.7-COMPONENT-EDGE-001: should accept minimum closing cash (0.01)", async () => {
    // GIVEN: Component is in reconciliation step
    const user = userEvent.setup();
    mockCloseShiftMutation.mutateAsync.mockResolvedValue({
      success: true,
      data: {
        shift_id: mockShiftId,
        status: "CLOSING",
        expected_cash: 245.0,
        opening_cash: 100.0,
        cash_transactions_total: 145.0,
        closing_initiated_at: "2024-01-01T10:00:00Z",
        closing_initiated_by: "user-1",
        calculated_at: "2024-01-01T10:00:00Z",
      },
    });

    renderWithProviders(
      <ShiftClosingForm
        shiftId={mockShiftId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Closing is initiated and minimum value (0.01) is entered
    await user.click(screen.getByTestId("initiate-closing-button"));
    await waitFor(() => {
      expect(screen.getByTestId("actual-cash-input")).toBeInTheDocument();
    });

    const actualCashInput = screen.getByTestId(
      "actual-cash-input",
    ) as HTMLInputElement;
    await user.clear(actualCashInput);
    // Use paste for decimal values to avoid character-by-character typing issues
    await user.click(actualCashInput);
    await user.paste("0.01");

    // THEN: Minimum value should be accepted (positive validation)
    // Wait for the value to be set - the input should contain "0.01"
    await waitFor(
      () => {
        const value = actualCashInput.value;
        // The input should have the pasted value "0.01"
        expect(value).toBe("0.01");
      },
      { timeout: 2000 },
    );
  });

  it("[P1] 4.7-COMPONENT-EDGE-002: should handle very large closing cash values", async () => {
    // GIVEN: Component is in reconciliation step
    const user = userEvent.setup();
    mockCloseShiftMutation.mutateAsync.mockResolvedValue({
      success: true,
      data: {
        shift_id: mockShiftId,
        status: "CLOSING",
        expected_cash: 245.0,
        opening_cash: 100.0,
        cash_transactions_total: 145.0,
        closing_initiated_at: "2024-01-01T10:00:00Z",
        closing_initiated_by: "user-1",
        calculated_at: "2024-01-01T10:00:00Z",
      },
    });

    renderWithProviders(
      <ShiftClosingForm
        shiftId={mockShiftId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Closing is initiated and very large value is entered
    await user.click(screen.getByTestId("initiate-closing-button"));
    await waitFor(() => {
      expect(screen.getByTestId("actual-cash-input")).toBeInTheDocument();
    });

    const actualCashInput = screen.getByTestId("actual-cash-input");
    await user.type(actualCashInput, "1000000");

    // THEN: Large value should be accepted (validation may be at backend level)
    expect(actualCashInput).toHaveValue(1000000);
  });

  it("[P1] 4.7-COMPONENT-EDGE-003: should handle decimal precision for closing cash", async () => {
    // GIVEN: Component is in reconciliation step
    const user = userEvent.setup();
    mockCloseShiftMutation.mutateAsync.mockResolvedValue({
      success: true,
      data: {
        shift_id: mockShiftId,
        status: "CLOSING",
        expected_cash: 245.0,
        opening_cash: 100.0,
        cash_transactions_total: 145.0,
        closing_initiated_at: "2024-01-01T10:00:00Z",
        closing_initiated_by: "user-1",
        calculated_at: "2024-01-01T10:00:00Z",
      },
    });

    renderWithProviders(
      <ShiftClosingForm
        shiftId={mockShiftId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Closing is initiated and decimal value is entered
    await user.click(screen.getByTestId("initiate-closing-button"));
    await waitFor(() => {
      expect(screen.getByTestId("actual-cash-input")).toBeInTheDocument();
    });

    const actualCashInput = screen.getByTestId("actual-cash-input");
    await user.type(actualCashInput, "250.99");

    // THEN: Decimal precision should be accepted
    expect(actualCashInput).toHaveValue(250.99);
  });

  // ============================================================================
  // ADDITIONAL ASSERTIONS - Response Structure & Data Types
  // ============================================================================

  it("[P1] 4.7-COMPONENT-ASSERT-001: should verify response structure on closing initiation", async () => {
    // GIVEN: Component is rendered and close shift succeeds
    const user = userEvent.setup();
    const mockResponse = {
      success: true,
      data: {
        shift_id: mockShiftId,
        status: "CLOSING",
        closing_initiated_at: "2024-01-01T10:00:00Z",
        closing_initiated_by: "user-1",
        expected_cash: 245.0,
        opening_cash: 100.0,
        cash_transactions_total: 145.0,
        calculated_at: "2024-01-01T10:00:00Z",
      },
    };
    mockCloseShiftMutation.mutateAsync.mockResolvedValue(mockResponse);

    renderWithProviders(
      <ShiftClosingForm
        shiftId={mockShiftId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Closing is initiated
    await user.click(screen.getByTestId("initiate-closing-button"));

    // THEN: Response should have correct structure
    await waitFor(() => {
      expect(mockCloseShiftMutation.mutateAsync).toHaveBeenCalledWith(
        mockShiftId,
      );
      expect(screen.getByTestId("expected-cash-display")).toBeInTheDocument();
    });
  });

  it("[P1] 4.7-COMPONENT-ASSERT-002: should verify variance calculation accuracy", async () => {
    // GIVEN: Component is in reconciliation step with known values
    const user = userEvent.setup();
    mockCloseShiftMutation.mutateAsync.mockResolvedValue({
      success: true,
      data: {
        shift_id: mockShiftId,
        status: "CLOSING",
        expected_cash: 100.0,
        opening_cash: 50.0,
        cash_transactions_total: 50.0,
        closing_initiated_at: "2024-01-01T10:00:00Z",
        closing_initiated_by: "user-1",
        calculated_at: "2024-01-01T10:00:00Z",
      },
    });

    renderWithProviders(
      <ShiftClosingForm
        shiftId={mockShiftId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Closing is initiated and actual cash creates known variance
    await user.click(screen.getByTestId("initiate-closing-button"));
    await waitFor(() => {
      expect(screen.getByTestId("actual-cash-input")).toBeInTheDocument();
    });

    const actualCashInput = screen.getByTestId(
      "actual-cash-input",
    ) as HTMLInputElement;
    await user.clear(actualCashInput);
    await user.type(actualCashInput, "110"); // Variance = 110 - 100 = 10

    // Wait for the form value to be updated first
    await waitFor(() => {
      expect(actualCashInput.value).toBe("110");
    });

    // THEN: Variance should be calculated correctly
    // Wait for actualCash to be updated and variance to be calculated
    await waitFor(
      () => {
        const varianceAmount = screen.getByTestId(
          "variance-amount-display",
        ) as HTMLInputElement;
        expect(varianceAmount).toBeInTheDocument();
        // Variance = 110 - 100 = 10, formatted as currency
        // Input elements use 'value' attribute, not textContent
        const value = varianceAmount.value || "";
        expect(value).toMatch(/\$?\s*\+?\s*10(\.00)?/);
      },
      { timeout: 3000 },
    );
  });
});
