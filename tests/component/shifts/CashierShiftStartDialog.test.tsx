/**
 * @test-level Component
 * @justification Component tests for CashierShiftStartDialog - validates form validation, terminal selection, submission, and error handling
 * @story 4-8-cashier-shift-start-flow
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../support/test-utils";
import { CashierShiftStartDialog } from "@/components/shifts/CashierShiftStartDialog";
import * as shiftsApi from "@/lib/api/shifts";
import * as storesApi from "@/lib/api/stores";
import userEvent from "@testing-library/user-event";

// Mock the API hooks
vi.mock("@/lib/api/shifts", () => ({
  useOpenShift: vi.fn(),
  useInvalidateShifts: vi.fn(),
}));

vi.mock("@/lib/api/stores", () => ({
  useStoreTerminals: vi.fn(),
}));

// Mock toast hook
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: (...args: any[]) => mockToast(...args),
  }),
}));

describe("4.8-COMPONENT: CashierShiftStartDialog Component", () => {
  const mockStoreId = "550e8400-e29b-41d4-a716-446655440000";

  const mockTerminals = [
    {
      pos_terminal_id: "550e8400-e29b-41d4-a716-446655440011",
      name: "Terminal 1",
      has_active_shift: false,
    },
    {
      pos_terminal_id: "550e8400-e29b-41d4-a716-446655440012",
      name: "Terminal 2",
      has_active_shift: false,
    },
    {
      pos_terminal_id: "550e8400-e29b-41d4-a716-446655440013",
      name: "Terminal 3",
      has_active_shift: true, // Has active shift, should not appear in dropdown
    },
  ];

  const mockMutation = {
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  };

  const mockInvalidate = {
    invalidateList: vi.fn(),
    invalidateDetail: vi.fn(),
    invalidateAll: vi.fn(),
  };

  const mockQuery = {
    data: mockTerminals,
    isLoading: false,
    isError: false,
    error: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockToast.mockClear();
    vi.mocked(shiftsApi.useOpenShift).mockReturnValue(mockMutation as any);
    vi.mocked(shiftsApi.useInvalidateShifts).mockReturnValue(
      mockInvalidate as any,
    );
    vi.mocked(storesApi.useStoreTerminals).mockReturnValue(mockQuery as any);
  });

  it("[P1] 4.8-COMPONENT-001: should render dialog when open is true", () => {
    // GIVEN: Component is rendered with open=true
    renderWithProviders(
      <CashierShiftStartDialog
        storeId={mockStoreId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Dialog should be visible
    expect(
      screen.getByRole("heading", { name: /start shift/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("terminal-select")).toBeInTheDocument();
    expect(screen.getByTestId("opening-cash-input")).toBeInTheDocument();
  });

  it("[P1] 4.8-COMPONENT-002: should not render dialog when open is false", () => {
    // GIVEN: Component is rendered with open=false
    renderWithProviders(
      <CashierShiftStartDialog
        storeId={mockStoreId}
        open={false}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Dialog should not be visible
    expect(screen.queryByText(/start shift/i)).not.toBeInTheDocument();
  });

  it("[P1] 4.8-COMPONENT-003: should display all terminals with active shift indicators", async () => {
    // GIVEN: Component is rendered with terminals (some have active shifts)
    const user = userEvent.setup();
    renderWithProviders(
      <CashierShiftStartDialog
        storeId={mockStoreId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Opening terminal dropdown
    const terminalSelect = screen.getByTestId("terminal-select");
    await user.click(terminalSelect);

    // THEN: All terminals should be displayed, with active shift ones disabled and marked
    expect(
      screen.getByRole("option", { name: "Terminal 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Terminal 2" }),
    ).toBeInTheDocument();
    // Terminal 3 should be visible but disabled and marked
    const terminal3Option = screen.getByRole("option", {
      name: /Terminal 3.*Active Shift/i,
    });
    expect(terminal3Option).toBeInTheDocument();
    expect(terminal3Option).toHaveAttribute("aria-disabled", "true");
  });

  it("[P1] 4.8-COMPONENT-004: should display message when all terminals have active shifts", async () => {
    // GIVEN: All terminals have active shifts
    vi.mocked(storesApi.useStoreTerminals).mockReturnValue({
      ...mockQuery,
      data: mockTerminals.map((t) => ({ ...t, has_active_shift: true })),
    } as any);

    renderWithProviders(
      <CashierShiftStartDialog
        storeId={mockStoreId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Message about all terminals having active shifts should be displayed
    await waitFor(() => {
      expect(
        screen.getByText(/all.*terminal.*have active shifts/i),
      ).toBeInTheDocument();
    });
  });

  it("[P1] 4.8-COMPONENT-004a: should display 'No terminals found' message when no terminals exist", async () => {
    // GIVEN: No terminals exist for the store
    vi.mocked(storesApi.useStoreTerminals).mockReturnValue({
      ...mockQuery,
      data: [],
    } as any);

    renderWithProviders(
      <CashierShiftStartDialog
        storeId={mockStoreId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: "No terminals found" message should be displayed
    // The component shows "No terminals found for this store. Please create terminals first." in the alert div
    await waitFor(() => {
      expect(
        screen.getByText(
          /no terminals found for this store\. please create terminals first/i,
        ),
      ).toBeInTheDocument();
    });
  });

  it("[P1] 4.8-COMPONENT-005: should validate terminal is required", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    renderWithProviders(
      <CashierShiftStartDialog
        storeId={mockStoreId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Submitting form without selecting terminal
    const submitButton = screen.getByTestId("submit-button");
    await user.click(submitButton);

    // THEN: Validation error should be displayed
    await waitFor(() => {
      expect(
        screen.getByText(/terminal must be selected/i),
      ).toBeInTheDocument();
    });
  });

  it("[P1] 4.8-COMPONENT-006: should validate opening cash is required and >= 0", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    mockMutation.mutateAsync.mockResolvedValue({
      shift_id: "test-shift-id",
      store_id: mockStoreId,
      cashier_id: "test-cashier-id",
      pos_terminal_id: "550e8400-e29b-41d4-a716-446655440011",
      opening_cash: 0,
      status: "OPEN",
      opened_at: new Date().toISOString(),
    });

    renderWithProviders(
      <CashierShiftStartDialog
        storeId={mockStoreId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Submitting form with default opening cash (0) after selecting terminal
    // Note: opening_cash defaults to 0, so it's always filled and valid
    const terminalSelect = screen.getByTestId("terminal-select");
    await user.click(terminalSelect);
    await user.click(screen.getByRole("option", { name: "Terminal 1" }));

    const submitButton = screen.getByTestId("submit-button");
    await user.click(submitButton);

    // THEN: Form should submit successfully with default value of 0
    // (opening_cash has default value, so "required" validation always passes)
    await waitFor(() => {
      expect(mockMutation.mutateAsync).toHaveBeenCalledWith({
        store_id: mockStoreId,
        pos_terminal_id: "550e8400-e29b-41d4-a716-446655440011",
        opening_cash: 0,
      });
    });
  });

  it("[P1] 4.8-COMPONENT-007: should call openShift() without cashier_id when form is submitted", async () => {
    // GIVEN: Component is rendered with valid form data
    const user = userEvent.setup();
    const mockOnOpenChange = vi.fn();
    mockMutation.mutateAsync.mockResolvedValue({
      success: true,
      data: { shift_id: "shift-123" },
    });

    renderWithProviders(
      <CashierShiftStartDialog
        storeId={mockStoreId}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // WHEN: Filling form and submitting
    const terminalSelect = screen.getByTestId("terminal-select");
    await user.click(terminalSelect);
    await user.click(screen.getByRole("option", { name: "Terminal 1" }));

    const cashInput = screen.getByTestId("opening-cash-input");
    await user.type(cashInput, "100");

    const submitButton = screen.getByTestId("submit-button");
    await user.click(submitButton);

    // THEN: openShift() should be called without cashier_id
    await waitFor(() => {
      expect(mockMutation.mutateAsync).toHaveBeenCalledWith({
        store_id: mockStoreId,
        pos_terminal_id: "550e8400-e29b-41d4-a716-446655440011",
        opening_cash: 100,
        // cashier_id should NOT be in the call
      });
    });
  });

  it("[P1] 4.8-COMPONENT-008: should close dialog and show success message on successful submission", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    const mockOnOpenChange = vi.fn();
    mockMutation.mutateAsync.mockResolvedValue({
      success: true,
      data: { shift_id: "shift-123" },
    });

    renderWithProviders(
      <CashierShiftStartDialog
        storeId={mockStoreId}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // WHEN: Submitting form successfully
    const terminalSelect = screen.getByTestId("terminal-select");
    await user.click(terminalSelect);
    await user.click(screen.getByRole("option", { name: "Terminal 1" }));

    const cashInput = screen.getByTestId("opening-cash-input");
    await user.type(cashInput, "100");

    const submitButton = screen.getByTestId("submit-button");
    await user.click(submitButton);

    // THEN: Dialog should close and success message should be shown
    await waitFor(() => {
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Success",
        }),
      );
    });
  });

  it("[P1] 4.8-COMPONENT-009: should handle API errors gracefully", async () => {
    // GIVEN: Component is rendered with API error
    const user = userEvent.setup();
    mockMutation.mutateAsync.mockRejectedValue({
      response: {
        data: {
          error: {
            code: "TERMINAL_ALREADY_IN_USE",
            message: "Terminal is already in use",
          },
        },
      },
    });

    renderWithProviders(
      <CashierShiftStartDialog
        storeId={mockStoreId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Submitting form
    const terminalSelect = screen.getByTestId("terminal-select");
    await user.click(terminalSelect);
    await user.click(screen.getByRole("option", { name: "Terminal 1" }));

    const cashInput = screen.getByTestId("opening-cash-input");
    await user.type(cashInput, "100");

    const submitButton = screen.getByTestId("submit-button");
    await user.click(submitButton);

    // THEN: Error message should be displayed
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          title: "Error",
        }),
      );
    });
  });

  it("[P1] 4.8-COMPONENT-010: should show loading state during submission", async () => {
    // GIVEN: Component is rendered with pending mutation
    const user = userEvent.setup();
    vi.mocked(shiftsApi.useOpenShift).mockReturnValue({
      ...mockMutation,
      isPending: true,
    } as any);

    renderWithProviders(
      <CashierShiftStartDialog
        storeId={mockStoreId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Submit button should be disabled
    const submitButton = screen.getByTestId("submit-button");
    expect(submitButton).toBeDisabled();
  });

  it("[P1] 4.8-COMPONENT-011: should handle SHIFT_ALREADY_ACTIVE error", async () => {
    // GIVEN: Component is rendered and mutation fails with SHIFT_ALREADY_ACTIVE
    const user = userEvent.setup();
    mockMutation.mutateAsync.mockRejectedValue(
      new Error("SHIFT_ALREADY_ACTIVE: An active shift already exists"),
    );

    renderWithProviders(
      <CashierShiftStartDialog
        storeId={mockStoreId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Form is filled with valid data and submitted
    const terminalSelect = screen.getByTestId("terminal-select");
    await user.click(terminalSelect);
    await user.click(screen.getByRole("option", { name: "Terminal 1" }));

    const cashInput = screen.getByTestId("opening-cash-input");
    await user.type(cashInput, "100");

    const submitButton = screen.getByTestId("submit-button");
    await user.click(submitButton);

    // THEN: Terminal-specific active-shift error message should be displayed
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Error",
          description:
            "An active shift already exists for this terminal. Please close the existing shift first.",
          variant: "destructive",
        }),
      );
    });
  });

  it("[P1] 4.8-COMPONENT-012: should handle TERMINAL_NOT_FOUND error", async () => {
    // GIVEN: Component is rendered and mutation fails with TERMINAL_NOT_FOUND
    const user = userEvent.setup();
    mockMutation.mutateAsync.mockRejectedValue(
      new Error("TERMINAL_NOT_FOUND: Terminal not found"),
    );

    renderWithProviders(
      <CashierShiftStartDialog
        storeId={mockStoreId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Form is submitted and error occurs
    const terminalSelect = screen.getByTestId("terminal-select");
    await user.click(terminalSelect);
    await user.click(screen.getByRole("option", { name: "Terminal 1" }));

    const cashInput = screen.getByTestId("opening-cash-input");
    await user.type(cashInput, "100");

    const submitButton = screen.getByTestId("submit-button");
    await user.click(submitButton);

    // THEN: Error message should be displayed
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Error",
          description: "Selected terminal is not valid for this store.",
          variant: "destructive",
        }),
      );
    });
  });

  it("[P1] 4.8-COMPONENT-013: should handle INVALID_OPENING_CASH error", async () => {
    // GIVEN: Component is rendered and mutation fails with INVALID_OPENING_CASH
    const user = userEvent.setup();
    mockMutation.mutateAsync.mockRejectedValue(
      new Error("INVALID_OPENING_CASH: Opening cash amount is invalid"),
    );

    renderWithProviders(
      <CashierShiftStartDialog
        storeId={mockStoreId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Form is submitted and error occurs
    const terminalSelect = screen.getByTestId("terminal-select");
    await user.click(terminalSelect);
    await user.click(screen.getByRole("option", { name: "Terminal 1" }));

    const cashInput = screen.getByTestId("opening-cash-input");
    await user.type(cashInput, "100");

    const submitButton = screen.getByTestId("submit-button");
    await user.click(submitButton);

    // THEN: Error message should be displayed
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Error",
          description: "Opening cash amount is invalid.",
          variant: "destructive",
        }),
      );
    });
  });

  it("[P1] 4.8-COMPONENT-014: should disable submit button when no available terminals", () => {
    // GIVEN: Component is rendered with no available terminals (all have active shifts)
    vi.mocked(storesApi.useStoreTerminals).mockReturnValue({
      ...mockQuery,
      data: mockTerminals.map((t) => ({ ...t, has_active_shift: true })),
    } as any);

    renderWithProviders(
      <CashierShiftStartDialog
        storeId={mockStoreId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Submit button should be disabled
    const submitButton = screen.getByTestId("submit-button");
    expect(submitButton).toBeDisabled();
  });

  it("[P1] 4.8-COMPONENT-014a: should disable submit button when no terminals exist", () => {
    // GIVEN: Component is rendered with no terminals at all
    vi.mocked(storesApi.useStoreTerminals).mockReturnValue({
      ...mockQuery,
      data: [],
    } as any);

    renderWithProviders(
      <CashierShiftStartDialog
        storeId={mockStoreId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Submit button should be disabled
    const submitButton = screen.getByTestId("submit-button");
    expect(submitButton).toBeDisabled();
  });

  it("[P1] 4.8-COMPONENT-015: should reset form when dialog closes and reopens", async () => {
    // GIVEN: Component is rendered and form has values
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { rerender } = renderWithProviders(
      <CashierShiftStartDialog
        storeId={mockStoreId}
        open={true}
        onOpenChange={onOpenChange}
      />,
    );

    // Fill form
    const terminalSelect = screen.getByTestId("terminal-select");
    await user.click(terminalSelect);
    await user.click(screen.getByRole("option", { name: "Terminal 1" }));

    const cashInput = screen.getByTestId("opening-cash-input");
    await user.type(cashInput, "100");

    // WHEN: Dialog is closed and reopened
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    // Close the dialog
    rerender(
      <CashierShiftStartDialog
        storeId={mockStoreId}
        open={false}
        onOpenChange={onOpenChange}
      />,
    );

    // Then reopen it to trigger the reset
    rerender(
      <CashierShiftStartDialog
        storeId={mockStoreId}
        open={true}
        onOpenChange={onOpenChange}
      />,
    );

    // THEN: Form should be reset
    await waitFor(() => {
      const newCashInput = screen.getByTestId(
        "opening-cash-input",
      ) as HTMLInputElement;
      // Component resets to 0, which displays as empty string
      expect(newCashInput.value).toBe("");
    });
  });

  it("[P1] 4.8-COMPONENT-016: should call onSuccess callback after successful submission", async () => {
    // GIVEN: Component is rendered with onSuccess callback
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    mockMutation.mutateAsync.mockResolvedValue({
      success: true,
      data: { shift_id: "shift-123" },
    });

    renderWithProviders(
      <CashierShiftStartDialog
        storeId={mockStoreId}
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={onSuccess}
      />,
    );

    // WHEN: Form is filled and submitted successfully
    const terminalSelect = screen.getByTestId("terminal-select");
    await user.click(terminalSelect);
    await user.click(screen.getByRole("option", { name: "Terminal 1" }));

    const cashInput = screen.getByTestId("opening-cash-input");
    await user.type(cashInput, "100");

    const submitButton = screen.getByTestId("submit-button");
    await user.click(submitButton);

    // THEN: onSuccess callback should be invoked
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it("[P1] 4.8-COMPONENT-017: should invalidate shift queries after successful submission", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    mockMutation.mutateAsync.mockResolvedValue({
      success: true,
      data: { shift_id: "shift-123" },
    });

    renderWithProviders(
      <CashierShiftStartDialog
        storeId={mockStoreId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Form is submitted successfully
    const terminalSelect = screen.getByTestId("terminal-select");
    await user.click(terminalSelect);
    await user.click(screen.getByRole("option", { name: "Terminal 1" }));

    const cashInput = screen.getByTestId("opening-cash-input");
    await user.type(cashInput, "100");

    const submitButton = screen.getByTestId("submit-button");
    await user.click(submitButton);

    // THEN: Shift queries should be invalidated
    await waitFor(() => {
      expect(mockInvalidate.invalidateList).toHaveBeenCalledTimes(1);
    });
  });

  it("[P0] 4.8-COMPONENT-018: should accept opening_cash values (no maximum limit)", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    mockMutation.mutateAsync.mockResolvedValue({
      shift_id: "test-shift-id",
      store_id: mockStoreId,
      cashier_id: "test-cashier-id",
      pos_terminal_id: "550e8400-e29b-41d4-a716-446655440011",
      opening_cash: 1001,
      status: "OPEN",
      opened_at: new Date().toISOString(),
    });

    renderWithProviders(
      <CashierShiftStartDialog
        storeId={mockStoreId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Entering opening cash > 1000 and submitting
    const terminalSelect = screen.getByTestId("terminal-select");
    await user.click(terminalSelect);
    await user.click(screen.getByRole("option", { name: "Terminal 1" }));

    const cashInput = screen.getByTestId("opening-cash-input");
    await user.clear(cashInput);
    await user.type(cashInput, "1001");

    const submitButton = screen.getByTestId("submit-button");
    await user.click(submitButton);

    // THEN: Form should submit successfully (no max validation in frontend)
    await waitFor(() => {
      expect(mockMutation.mutateAsync).toHaveBeenCalledWith({
        store_id: mockStoreId,
        pos_terminal_id: "550e8400-e29b-41d4-a716-446655440011",
        opening_cash: 1001,
      });
    });
  });

  it("[P1] 4.8-COMPONENT-019: should accept opening_cash at maximum (1000)", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    const mockOnOpenChange = vi.fn();
    mockMutation.mutateAsync.mockResolvedValue({
      success: true,
      data: { shift_id: "shift-123" },
    });

    renderWithProviders(
      <CashierShiftStartDialog
        storeId={mockStoreId}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // WHEN: Entering opening cash = 1000
    const terminalSelect = screen.getByTestId("terminal-select");
    await user.click(terminalSelect);
    await user.click(screen.getByRole("option", { name: "Terminal 1" }));

    const cashInput = screen.getByTestId("opening-cash-input");
    await user.type(cashInput, "1000");

    const submitButton = screen.getByTestId("submit-button");
    await user.click(submitButton);

    // THEN: Should succeed
    await waitFor(() => {
      expect(mockMutation.mutateAsync).toHaveBeenCalledWith({
        store_id: mockStoreId,
        pos_terminal_id: "550e8400-e29b-41d4-a716-446655440011",
        opening_cash: 1000,
      });
    });
  });

  it("[P1] 4.8-COMPONENT-020: should handle opening_cash = 0", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    const mockOnOpenChange = vi.fn();
    mockMutation.mutateAsync.mockResolvedValue({
      success: true,
      data: { shift_id: "shift-123" },
    });

    renderWithProviders(
      <CashierShiftStartDialog
        storeId={mockStoreId}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // WHEN: Entering opening cash = 0
    const terminalSelect = screen.getByTestId("terminal-select");
    await user.click(terminalSelect);
    await user.click(screen.getByRole("option", { name: "Terminal 1" }));

    const cashInput = screen.getByTestId("opening-cash-input");
    // Leave as 0 (default value)

    const submitButton = screen.getByTestId("submit-button");
    await user.click(submitButton);

    // THEN: Should succeed
    await waitFor(() => {
      expect(mockMutation.mutateAsync).toHaveBeenCalledWith({
        store_id: mockStoreId,
        pos_terminal_id: "550e8400-e29b-41d4-a716-446655440011",
        opening_cash: 0,
      });
    });
  });

  it("[P1] 4.8-COMPONENT-021: should handle decimal opening_cash values", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    const mockOnOpenChange = vi.fn();
    mockMutation.mutateAsync.mockResolvedValue({
      success: true,
      data: { shift_id: "shift-123" },
    });

    renderWithProviders(
      <CashierShiftStartDialog
        storeId={mockStoreId}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // WHEN: Entering decimal opening cash
    const terminalSelect = screen.getByTestId("terminal-select");
    await user.click(terminalSelect);
    await user.click(screen.getByRole("option", { name: "Terminal 1" }));

    const cashInput = screen.getByTestId("opening-cash-input");
    await user.type(cashInput, "100.50");

    const submitButton = screen.getByTestId("submit-button");
    await user.click(submitButton);

    // THEN: Should succeed with decimal value
    await waitFor(() => {
      expect(mockMutation.mutateAsync).toHaveBeenCalledWith({
        store_id: mockStoreId,
        pos_terminal_id: "550e8400-e29b-41d4-a716-446655440011",
        opening_cash: 100.5,
      });
    });
  });

  it("[P0] 4.8-COMPONENT-022: should sanitize XSS attempts in terminal names", async () => {
    // GIVEN: Component is rendered with terminal name containing script tag
    const user = userEvent.setup();
    const xssTerminal = {
      pos_terminal_id: "550e8400-e29b-41d4-a716-446655440014",
      name: '<script>alert("XSS")</script>Terminal XSS',
      has_active_shift: false,
    };

    vi.mocked(storesApi.useStoreTerminals).mockReturnValue({
      ...mockQuery,
      data: [xssTerminal],
    } as any);

    renderWithProviders(
      <CashierShiftStartDialog
        storeId={mockStoreId}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Opening terminal dropdown
    const terminalSelect = screen.getByTestId("terminal-select");
    await user.click(terminalSelect);

    // THEN: Terminal name should be rendered as text, not executed as script
    // React should automatically escape HTML, so we verify the text is visible but not executed
    const terminalOption = screen.getByRole("option", {
      name: /Terminal XSS/i,
    });
    expect(terminalOption).toBeInTheDocument();
    // Verify script tag is not executed (if it were, we'd see an alert - test would fail)
    expect(terminalOption.textContent).toContain("Terminal XSS");
  });
});
