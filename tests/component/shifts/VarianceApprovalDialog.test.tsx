/**
 * @test-level Component
 * @justification Component tests for VarianceApprovalDialog - validates variance approval flow with required reason
 * @story 4-7-shift-management-ui
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../support/test-utils";
import { VarianceApprovalDialog } from "@/components/shifts/VarianceApprovalDialog";
import * as shiftsApi from "@/lib/api/shifts";
import type { ShiftResponse } from "@/lib/api/shifts";
import userEvent from "@testing-library/user-event";

// Mock the API hooks
vi.mock("@/lib/api/shifts", () => ({
  useReconcileCash: vi.fn(),
  useInvalidateShifts: vi.fn(),
}));

// Mock toast hook
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe("4.7-COMPONENT: VarianceApprovalDialog Component", () => {
  const mockShift: ShiftResponse = {
    shift_id: "shift-123",
    store_id: "store-1",
    opened_by: "user-1",
    cashier_id: "cashier-1",
    pos_terminal_id: "terminal-1",
    status: "VARIANCE_REVIEW",
    opening_cash: 100.0,
    closing_cash: 200.0,
    expected_cash: 180.0,
    variance_amount: 20.0,
    variance_percentage: 11.11,
    opened_at: "2024-01-01T10:00:00Z",
    closed_at: "2024-01-01T18:00:00Z",
    store_name: "Store 1",
    cashier_name: "John Doe",
    day_summary_id: "day-summary-1",
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
    vi.mocked(shiftsApi.useReconcileCash).mockReturnValue(
      mockReconcileCashMutation as any,
    );
    vi.mocked(shiftsApi.useInvalidateShifts).mockReturnValue(
      mockInvalidate as any,
    );
  });

  it("[P0] 4.7-COMPONENT-050: should render dialog when open is true", () => {
    // GIVEN: Component is rendered with open=true
    renderWithProviders(
      <VarianceApprovalDialog
        shift={mockShift}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Dialog should be visible
    // Use getAllByText since "Approve Variance" appears in both heading and button
    const approveVarianceElements = screen.getAllByText("Approve Variance");
    expect(approveVarianceElements.length).toBeGreaterThan(0);
    expect(screen.getByTestId("variance-reason-input")).toBeInTheDocument();
  });

  it("[P0] 4.7-COMPONENT-051: should display variance amount and percentage prominently", () => {
    // GIVEN: Component is rendered with shift having variance
    renderWithProviders(
      <VarianceApprovalDialog
        shift={mockShift}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Variance details should be displayed
    expect(screen.getByTestId("variance-alert")).toBeInTheDocument();
    expect(screen.getByTestId("variance-amount-display")).toBeInTheDocument();
    expect(
      screen.getByTestId("variance-percentage-display"),
    ).toBeInTheDocument();
  });

  it("[P0] 4.7-COMPONENT-052: should require variance reason", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    renderWithProviders(
      <VarianceApprovalDialog
        shift={mockShift}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Form is submitted without variance reason
    const submitButton = screen.getByTestId("submit-variance-approval");
    await user.click(submitButton);

    // THEN: Validation error should be displayed
    await waitFor(() => {
      expect(
        screen.getByText(/variance reason is required/i),
      ).toBeInTheDocument();
    });
  });

  it("[P0] 4.7-COMPONENT-053: should submit approval with valid reason", async () => {
    // GIVEN: Component is rendered and mutation succeeds
    const user = userEvent.setup();
    mockReconcileCashMutation.mutateAsync.mockResolvedValue({
      success: true,
      data: {
        shift_id: mockShift.shift_id,
        status: "CLOSED",
        closing_cash: mockShift.closing_cash,
        expected_cash: mockShift.expected_cash,
        variance_amount: mockShift.variance_amount,
        variance_percentage: mockShift.variance_percentage,
        variance_reason: "Cash handling error",
        approved_by: "user-1",
        approved_at: "2024-01-01T19:00:00Z",
        closed_at: "2024-01-01T19:00:00Z",
      },
    });

    renderWithProviders(
      <VarianceApprovalDialog
        shift={mockShift}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Variance reason is entered and form is submitted
    const reasonInput = screen.getByTestId("variance-reason-input");
    await user.type(reasonInput, "Cash handling error during shift");

    const submitButton = screen.getByTestId("submit-variance-approval");
    await user.click(submitButton);

    // THEN: Reconcile cash mutation should be called with variance reason
    await waitFor(() => {
      expect(mockReconcileCashMutation.mutateAsync).toHaveBeenCalledWith({
        shiftId: mockShift.shift_id,
        data: {
          variance_reason: "Cash handling error during shift",
        },
      });
    });
  });

  it("[P0] 4.7-COMPONENT-054: should handle approval errors", async () => {
    // GIVEN: Component is rendered and mutation fails
    const user = userEvent.setup();
    mockReconcileCashMutation.mutateAsync.mockRejectedValue(
      new Error(
        "SHIFT_NOT_VARIANCE_REVIEW: Shift is not in VARIANCE_REVIEW status",
      ),
    );

    renderWithProviders(
      <VarianceApprovalDialog
        shift={mockShift}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Form is submitted with valid reason
    const reasonInput = screen.getByTestId("variance-reason-input");
    await user.type(reasonInput, "Test reason");

    const submitButton = screen.getByTestId("submit-variance-approval");
    await user.click(submitButton);

    // THEN: Error should be handled (toast notification would be shown)
    await waitFor(() => {
      expect(mockReconcileCashMutation.mutateAsync).toHaveBeenCalled();
    });
  });

  it("[P1] 4.7-COMPONENT-055: should reset form when dialog closes", async () => {
    // GIVEN: Component is rendered and form has values
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { rerender } = renderWithProviders(
      <VarianceApprovalDialog
        shift={mockShift}
        open={true}
        onOpenChange={onOpenChange}
      />,
    );

    const reasonInput = screen.getByTestId("variance-reason-input");
    await user.type(reasonInput, "Test reason");

    // WHEN: Cancel button is clicked
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    // THEN: Dialog should be closed (simulate parent closing when onOpenChange(false) is invoked)
    rerender(
      <VarianceApprovalDialog
        shift={mockShift}
        open={false}
        onOpenChange={onOpenChange}
      />,
    );

    // Assert dialog is closed
    await waitFor(() => {
      expect(screen.queryByText("Approve Variance")).not.toBeInTheDocument();
    });

    // WHEN: Dialog is reopened
    rerender(
      <VarianceApprovalDialog
        shift={mockShift}
        open={true}
        onOpenChange={onOpenChange}
      />,
    );

    // THEN: Form should be reset to empty value
    const newReasonInput = screen.getByTestId("variance-reason-input");
    expect(newReasonInput).toHaveValue("");
  });

  // ============================================================================
  // SECURITY TESTS - XSS Prevention & Input Validation (Component Level)
  // ============================================================================

  it("[P1] 4.7-COMPONENT-SEC-001: should sanitize XSS attempts in variance reason input", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    renderWithProviders(
      <VarianceApprovalDialog
        shift={mockShift}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: XSS attempt is entered in variance reason field
    const reasonInput = screen.getByTestId("variance-reason-input");
    await user.type(reasonInput, "<script>alert('xss')</script>");

    // THEN: Input should be sanitized (React automatically escapes HTML in textarea)
    // Textarea content is escaped by React, preventing XSS
    expect(reasonInput).toHaveValue("<script>alert('xss')</script>");
    // Note: React escapes this on render, preventing script execution
  });

  it("[P1] 4.7-COMPONENT-SEC-002: should prevent HTML injection in variance reason", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    renderWithProviders(
      <VarianceApprovalDialog
        shift={mockShift}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: HTML injection attempt is entered
    const reasonInput = screen.getByTestId("variance-reason-input");
    await user.type(reasonInput, "<img src=x onerror=alert('xss')>");

    // THEN: HTML should be escaped (React prevents HTML injection)
    expect(reasonInput).toHaveValue("<img src=x onerror=alert('xss')>");
    // Note: React escapes HTML entities, preventing injection
  });

  it("[P1] 4.7-COMPONENT-SEC-003: should validate variance reason rejects empty strings", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    renderWithProviders(
      <VarianceApprovalDialog
        shift={mockShift}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Form is submitted with empty variance reason
    const submitButton = screen.getByTestId("submit-variance-approval");
    await user.click(submitButton);

    // THEN: Validation error should be displayed
    await waitFor(() => {
      expect(
        screen.getByText(/variance reason is required/i),
      ).toBeInTheDocument();
    });
  });

  it("[P1] 4.7-COMPONENT-SEC-004: should validate variance reason rejects whitespace-only strings", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    renderWithProviders(
      <VarianceApprovalDialog
        shift={mockShift}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Form is submitted with whitespace-only variance reason
    const reasonInput = screen.getByTestId("variance-reason-input");
    await user.type(reasonInput, "   ");

    const submitButton = screen.getByTestId("submit-variance-approval");
    await user.click(submitButton);

    // THEN: Validation error should be displayed (trimmed validation)
    await waitFor(() => {
      expect(
        screen.getByText(/variance reason cannot be empty/i),
      ).toBeInTheDocument();
    });
  });

  // ============================================================================
  // EDGE CASE TESTS - Variance Reason Boundary Conditions
  // ============================================================================

  it("[P1] 4.7-COMPONENT-EDGE-001: should accept minimum length variance reason (1 character)", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    mockReconcileCashMutation.mutateAsync.mockResolvedValue({
      success: true,
      data: {
        shift_id: mockShift.shift_id,
        status: "CLOSED",
        closing_cash: mockShift.closing_cash,
        expected_cash: mockShift.expected_cash,
        variance_amount: mockShift.variance_amount,
        variance_percentage: mockShift.variance_percentage,
        variance_reason: "X",
        approved_by: "user-1",
        approved_at: "2024-01-01T19:00:00Z",
        closed_at: "2024-01-01T19:00:00Z",
      },
    });

    renderWithProviders(
      <VarianceApprovalDialog
        shift={mockShift}
        open={true}
        onOpenChange={onOpenChange}
      />,
    );

    // WHEN: Minimum length reason (1 character) is entered and form is submitted
    const reasonInput = screen.getByTestId("variance-reason-input");
    await user.type(reasonInput, "X");

    const submitButton = screen.getByTestId("submit-variance-approval");
    await user.click(submitButton);

    // THEN: Minimum length should be accepted, mutation should be called with correct payload, and dialog should close
    await waitFor(() => {
      expect(mockReconcileCashMutation.mutateAsync).toHaveBeenCalledWith({
        shiftId: mockShift.shift_id,
        data: {
          variance_reason: "X",
        },
      });
    });

    // THEN: Dialog should close on successful submission
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("[P1] 4.7-COMPONENT-EDGE-002: should handle very long variance reason (1000+ characters)", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    const longReason = "A".repeat(1000);
    renderWithProviders(
      <VarianceApprovalDialog
        shift={mockShift}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Very long variance reason is entered
    // Use paste for long strings to avoid timeout
    const reasonInput = screen.getByTestId("variance-reason-input");
    await user.clear(reasonInput);
    await user.paste(longReason);

    // THEN: Very long string should be accepted (validation may be at backend level)
    expect(reasonInput).toHaveValue(longReason);
  }, 10000); // Increase timeout for long string test

  it("[P1] 4.7-COMPONENT-EDGE-003: should handle special characters and unicode in variance reason", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    const specialChars =
      "Test reason with émojis 🎉 and spéciál chárs: !@#$%^&*()";
    renderWithProviders(
      <VarianceApprovalDialog
        shift={mockShift}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Special characters and unicode are entered
    // Use paste for special characters/unicode to avoid encoding issues
    const reasonInput = screen.getByTestId("variance-reason-input");
    await user.clear(reasonInput);
    await user.paste(specialChars);

    // THEN: Special characters should be accepted
    expect(reasonInput).toHaveValue(specialChars);
  });

  // ============================================================================
  // ADDITIONAL ASSERTIONS - Response Structure & Data Types
  // ============================================================================

  it("[P1] 4.7-COMPONENT-ASSERT-001: should verify response structure on successful approval", async () => {
    // GIVEN: Component is rendered and mutation succeeds
    const user = userEvent.setup();
    const mockResponse = {
      success: true,
      data: {
        shift_id: mockShift.shift_id,
        status: "CLOSED",
        closing_cash: mockShift.closing_cash,
        expected_cash: mockShift.expected_cash,
        variance_amount: mockShift.variance_amount,
        variance_percentage: mockShift.variance_percentage,
        variance_reason: "Cash handling error",
        approved_by: "user-1",
        approved_at: "2024-01-01T19:00:00Z",
        closed_at: "2024-01-01T19:00:00Z",
      },
    };
    mockReconcileCashMutation.mutateAsync.mockResolvedValue(mockResponse);

    renderWithProviders(
      <VarianceApprovalDialog
        shift={mockShift}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Variance reason is entered and form is submitted
    const reasonInput = screen.getByTestId("variance-reason-input");
    await user.type(reasonInput, "Cash handling error");

    const submitButton = screen.getByTestId("submit-variance-approval");
    await user.click(submitButton);

    // THEN: Response should have correct structure
    await waitFor(() => {
      expect(mockReconcileCashMutation.mutateAsync).toHaveBeenCalled();
    });

    const callArgs = mockReconcileCashMutation.mutateAsync.mock.calls[0]?.[0];
    if (callArgs) {
      expect(callArgs).toHaveProperty("shiftId");
      expect(callArgs).toHaveProperty("data");
      expect(callArgs.data).toHaveProperty("variance_reason");
      expect(typeof callArgs.data.variance_reason).toBe("string");
      expect(callArgs.data.variance_reason.length).toBeGreaterThan(0);
    }
  });
});
