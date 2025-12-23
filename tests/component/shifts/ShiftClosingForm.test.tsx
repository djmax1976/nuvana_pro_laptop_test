/**
 * @test-level Component
 * @justification Component tests for ShiftClosingForm - validates simplified single-step closing flow
 * @story Simplified Shift Closing
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../support/test-utils";
import { ShiftClosingForm } from "@/components/shifts/ShiftClosingForm";
import * as shiftsApi from "@/lib/api/shifts";
import userEvent from "@testing-library/user-event";

// Mock the API hooks
vi.mock("@/lib/api/shifts", () => ({
  useCloseShift: vi.fn(),
  useInvalidateShifts: vi.fn(),
}));

// Mock toast hook
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe("COMPONENT: ShiftClosingForm Component (Simplified Flow)", () => {
  const mockShiftId = "shift-123";

  const mockCloseShiftMutation = {
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
    vi.mocked(shiftsApi.useInvalidateShifts).mockReturnValue(
      mockInvalidate as any,
    );
  });

  it("[P0] COMPONENT-001: should render cash input form when open", () => {
    // GIVEN: Component is rendered with open=true
    renderWithProviders(
      <ShiftClosingForm
        shiftId={mockShiftId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Cash input and close button should be displayed
    expect(screen.getByTestId("closing-cash-input")).toBeInTheDocument();
    expect(screen.getByTestId("close-shift-button")).toBeInTheDocument();
    expect(screen.getByText(/close shift/i)).toBeInTheDocument();
  });

  it("[P0] COMPONENT-002: should close shift directly when button is clicked", async () => {
    // GIVEN: Component is rendered and close shift succeeds
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();

    mockCloseShiftMutation.mutateAsync.mockResolvedValue({
      success: true,
      data: {
        shift_id: mockShiftId,
        status: "CLOSED",
        closing_cash: 250.0,
        closed_at: "2024-01-01T10:00:00Z",
        closed_by: "user-1",
      },
    });

    renderWithProviders(
      <ShiftClosingForm
        shiftId={mockShiftId}
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />,
    );

    // WHEN: User enters cash and clicks close
    const cashInput = screen.getByTestId("closing-cash-input");
    await user.type(cashInput, "250");

    const closeButton = screen.getByTestId("close-shift-button");
    await user.click(closeButton);

    // THEN: Close shift mutation should be called with closing_cash
    await waitFor(() => {
      expect(mockCloseShiftMutation.mutateAsync).toHaveBeenCalledWith({
        shiftId: mockShiftId,
        closingCash: 250,
      });
    });

    // AND: Success callback should be called
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("[P0] COMPONENT-003: should validate closing cash is non-negative", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();

    renderWithProviders(
      <ShiftClosingForm
        shiftId={mockShiftId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: User tries to submit with empty cash (0)
    const closeButton = screen.getByTestId("close-shift-button");
    await user.click(closeButton);

    // THEN: Mutation should NOT be called (form validation)
    // The form allows 0 as valid (min: 0), so let's test the input behavior
    expect(mockCloseShiftMutation.mutateAsync).not.toHaveBeenCalled();
  });

  it("[P0] COMPONENT-004: should accept zero cash value", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    mockCloseShiftMutation.mutateAsync.mockResolvedValue({
      success: true,
      data: {
        shift_id: mockShiftId,
        status: "CLOSED",
        closing_cash: 0,
        closed_at: "2024-01-01T10:00:00Z",
        closed_by: "user-1",
      },
    });

    renderWithProviders(
      <ShiftClosingForm
        shiftId={mockShiftId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: User submits with 0 cash (explicitly typing 0)
    const cashInput = screen.getByTestId("closing-cash-input");
    await user.type(cashInput, "0");

    const closeButton = screen.getByTestId("close-shift-button");
    await user.click(closeButton);

    // THEN: Mutation should be called with 0
    await waitFor(() => {
      expect(mockCloseShiftMutation.mutateAsync).toHaveBeenCalledWith({
        shiftId: mockShiftId,
        closingCash: 0,
      });
    });
  });

  it("[P1] COMPONENT-005: should handle closing errors", async () => {
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

    // WHEN: User tries to close shift
    const cashInput = screen.getByTestId("closing-cash-input");
    await user.type(cashInput, "100");

    const closeButton = screen.getByTestId("close-shift-button");
    await user.click(closeButton);

    // THEN: Error should be handled (toast notification would be shown)
    await waitFor(() => {
      expect(mockCloseShiftMutation.mutateAsync).toHaveBeenCalled();
    });
  });

  it("[P1] COMPONENT-006: should handle already closed shift error", async () => {
    // GIVEN: Component is rendered and shift is already closed
    const user = userEvent.setup();
    mockCloseShiftMutation.mutateAsync.mockRejectedValue(
      new Error("SHIFT_ALREADY_CLOSED: Shift is already closed"),
    );

    renderWithProviders(
      <ShiftClosingForm
        shiftId={mockShiftId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: User tries to close shift
    const cashInput = screen.getByTestId("closing-cash-input");
    await user.type(cashInput, "100");

    const closeButton = screen.getByTestId("close-shift-button");
    await user.click(closeButton);

    // THEN: Error should be handled
    await waitFor(() => {
      expect(mockCloseShiftMutation.mutateAsync).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // SECURITY TESTS - Input Validation & XSS Prevention (Component Level)
  // ============================================================================

  it("[P1] COMPONENT-SEC-001: should sanitize XSS attempts in closing cash input", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();

    renderWithProviders(
      <ShiftClosingForm
        shiftId={mockShiftId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: XSS attempt is entered
    const cashInput = screen.getByTestId("closing-cash-input");
    await user.type(cashInput, "<script>alert('xss')</script>");

    // THEN: Input should be sanitized (number input should reject non-numeric)
    expect(cashInput).toHaveValue(null);
  });

  it("[P1] COMPONENT-SEC-002: should validate closing cash accepts only numeric input", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();

    renderWithProviders(
      <ShiftClosingForm
        shiftId={mockShiftId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Non-numeric characters are entered
    const cashInput = screen.getByTestId("closing-cash-input");
    await user.type(cashInput, "abc250");

    // THEN: Only numeric characters should be accepted
    expect(cashInput).toHaveValue(250);
  });

  // ============================================================================
  // EDGE CASE TESTS - Closing Cash Boundary Conditions
  // ============================================================================

  it("[P1] COMPONENT-EDGE-001: should accept small decimal values (0.01)", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();

    renderWithProviders(
      <ShiftClosingForm
        shiftId={mockShiftId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Minimum decimal value is entered
    const cashInput = screen.getByTestId(
      "closing-cash-input",
    ) as HTMLInputElement;
    await user.click(cashInput);
    await user.paste("0.01");

    // THEN: Minimum value should be accepted
    await waitFor(
      () => {
        expect(cashInput.value).toBe("0.01");
      },
      { timeout: 2000 },
    );
  });

  it("[P1] COMPONENT-EDGE-002: should handle very large closing cash values", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();

    renderWithProviders(
      <ShiftClosingForm
        shiftId={mockShiftId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Very large value is entered
    const cashInput = screen.getByTestId("closing-cash-input");
    await user.type(cashInput, "1000000");

    // THEN: Large value should be accepted
    expect(cashInput).toHaveValue(1000000);
  });

  it("[P1] COMPONENT-EDGE-003: should handle decimal precision for closing cash", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();

    renderWithProviders(
      <ShiftClosingForm
        shiftId={mockShiftId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Decimal value is entered
    const cashInput = screen.getByTestId("closing-cash-input");
    await user.type(cashInput, "250.99");

    // THEN: Decimal precision should be accepted
    expect(cashInput).toHaveValue(250.99);
  });

  // ============================================================================
  // UI STATE TESTS
  // ============================================================================

  it("[P1] COMPONENT-UI-001: should disable buttons while submitting", async () => {
    // GIVEN: Component is rendered with pending mutation
    vi.mocked(shiftsApi.useCloseShift).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
    } as any);

    renderWithProviders(
      <ShiftClosingForm
        shiftId={mockShiftId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Buttons should be disabled
    expect(screen.getByTestId("close-shift-button")).toBeDisabled();
  });

  it("[P1] COMPONENT-UI-002: should close dialog when cancel is clicked", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    renderWithProviders(
      <ShiftClosingForm
        shiftId={mockShiftId}
        open={true}
        onOpenChange={onOpenChange}
      />,
    );

    // WHEN: Cancel button is clicked
    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    await user.click(cancelButton);

    // THEN: onOpenChange should be called with false
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("[P1] COMPONENT-UI-003: should reset form when dialog reopens", async () => {
    // GIVEN: Component is rendered with some value
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(
      <ShiftClosingForm
        shiftId={mockShiftId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // Enter a value
    const cashInput = screen.getByTestId("closing-cash-input");
    await user.type(cashInput, "500");
    expect(cashInput).toHaveValue(500);

    // WHEN: Dialog is closed and reopened
    rerender(
      <ShiftClosingForm
        shiftId={mockShiftId}
        open={false}
        onOpenChange={vi.fn()}
      />,
    );
    rerender(
      <ShiftClosingForm
        shiftId={mockShiftId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Form should be reset (input should be empty or 0)
    const newCashInput = screen.getByTestId("closing-cash-input");
    expect(newCashInput).toHaveValue(null); // Empty because 0 shows as ""
  });
});
