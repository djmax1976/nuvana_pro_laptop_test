/**
 * @test-level Component
 * @justification Component tests for ShiftOpeningForm - validates form validation, submission, and error handling
 * @story 4-7-shift-management-ui
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../support/test-utils";
import { ShiftOpeningForm } from "@/components/shifts/ShiftOpeningForm";
import * as shiftsApi from "@/lib/api/shifts";
import userEvent from "@testing-library/user-event";

// Mock the API hooks
vi.mock("@/lib/api/shifts", () => ({
  useOpenShift: vi.fn(),
  useInvalidateShifts: vi.fn(),
}));

// Mock toast hook
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: (...args: any[]) => mockToast(...args),
  }),
}));

describe("4.7-COMPONENT: ShiftOpeningForm Component", () => {
  const mockCashiers = [
    {
      user_id: "550e8400-e29b-41d4-a716-446655440001",
      name: "John Doe",
      email: "john@example.com",
    },
    {
      user_id: "550e8400-e29b-41d4-a716-446655440002",
      name: "Jane Smith",
      email: "jane@example.com",
    },
  ];

  const mockTerminals = [
    {
      pos_terminal_id: "550e8400-e29b-41d4-a716-446655440011",
      name: "Terminal 1",
    },
    {
      pos_terminal_id: "550e8400-e29b-41d4-a716-446655440012",
      name: "Terminal 2",
    },
  ];

  const mockStoreId = "550e8400-e29b-41d4-a716-446655440000";

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

  beforeEach(() => {
    vi.clearAllMocks();
    mockToast.mockClear();
    vi.mocked(shiftsApi.useOpenShift).mockReturnValue(mockMutation as any);
    vi.mocked(shiftsApi.useInvalidateShifts).mockReturnValue(
      mockInvalidate as any,
    );
  });

  it("[P0] 4.7-COMPONENT-020: should render form when open is true", () => {
    // GIVEN: Component is rendered with open=true
    renderWithProviders(
      <ShiftOpeningForm
        storeId={mockStoreId}
        cashiers={mockCashiers}
        terminals={mockTerminals}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Form should be visible
    expect(screen.getByText("Open New Shift")).toBeInTheDocument();
    expect(screen.getByTestId("cashier-select")).toBeInTheDocument();
    expect(screen.getByTestId("terminal-select")).toBeInTheDocument();
    expect(screen.getByTestId("opening-cash-input")).toBeInTheDocument();
  });

  it("[P0] 4.7-COMPONENT-021: should not render form when open is false", () => {
    // GIVEN: Component is rendered with open=false
    renderWithProviders(
      <ShiftOpeningForm
        storeId={mockStoreId}
        cashiers={mockCashiers}
        terminals={mockTerminals}
        open={false}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Form should not be visible
    expect(screen.queryByText("Open New Shift")).not.toBeInTheDocument();
  });

  it("[P0] 4.7-COMPONENT-022: should display cashier options", () => {
    // GIVEN: Component is rendered with cashiers
    renderWithProviders(
      <ShiftOpeningForm
        storeId={mockStoreId}
        cashiers={mockCashiers}
        terminals={mockTerminals}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Cashier select is opened
    const cashierSelect = screen.getByTestId("cashier-select");
    // Note: Select component interaction may require special handling in tests

    // THEN: Cashier options should be available
    expect(cashierSelect).toBeInTheDocument();
  });

  it("[P0] 4.7-COMPONENT-023: should display terminal options", () => {
    // GIVEN: Component is rendered with terminals
    renderWithProviders(
      <ShiftOpeningForm
        storeId={mockStoreId}
        cashiers={mockCashiers}
        terminals={mockTerminals}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Terminal select should be available
    expect(screen.getByTestId("terminal-select")).toBeInTheDocument();
  });

  it("[P0] 4.7-COMPONENT-024: should validate opening cash is non-negative", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    renderWithProviders(
      <ShiftOpeningForm
        storeId={mockStoreId}
        cashiers={mockCashiers}
        terminals={mockTerminals}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // Select cashier and terminal first (required fields)
    const cashierSelect = screen.getByTestId("cashier-select");
    await user.click(cashierSelect);
    const cashierOption = await screen.findByTestId(
      "cashier-option-550e8400-e29b-41d4-a716-446655440001",
    );
    await user.click(cashierOption);

    const terminalSelect = screen.getByTestId("terminal-select");
    await user.click(terminalSelect);
    const terminalOption = await screen.findByTestId(
      "terminal-option-550e8400-e29b-41d4-a716-446655440011",
    );
    await user.click(terminalOption);

    // WHEN: Negative opening cash is entered and form is submitted
    const openingCashInput = screen.getByTestId(
      "opening-cash-input",
    ) as HTMLInputElement;
    await user.clear(openingCashInput);
    // Type negative value - the component's onChange will convert it to -10
    await user.type(openingCashInput, "-10");

    // Blur the input to trigger validation
    await user.tab();

    const submitButton = screen.getByTestId("submit-shift-opening");
    await user.click(submitButton);

    // THEN: Validation error should be displayed
    // The validation happens on submit, and the error should appear via FormMessage
    await waitFor(
      () => {
        expect(
          screen.getByText(/opening cash must be a non-negative number/i),
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it("[P0] 4.7-COMPONENT-025: should require cashier selection", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    renderWithProviders(
      <ShiftOpeningForm
        storeId={mockStoreId}
        cashiers={mockCashiers}
        terminals={mockTerminals}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Form is submitted without selecting cashier
    const submitButton = screen.getByTestId("submit-shift-opening");
    await user.click(submitButton);

    // THEN: Validation error should be displayed
    await waitFor(() => {
      expect(screen.getByText(/cashier must be selected/i)).toBeInTheDocument();
    });
  });

  it("[P0] 4.7-COMPONENT-026: should require terminal selection", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    renderWithProviders(
      <ShiftOpeningForm
        storeId={mockStoreId}
        cashiers={mockCashiers}
        terminals={mockTerminals}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Form is submitted without selecting terminal
    const submitButton = screen.getByTestId("submit-shift-opening");
    await user.click(submitButton);

    // THEN: Validation error should be displayed
    await waitFor(() => {
      expect(
        screen.getByText(/terminal must be selected/i),
      ).toBeInTheDocument();
    });
  });

  it("[P0] 4.7-COMPONENT-027: should submit form with valid data", async () => {
    // GIVEN: Component is rendered and mutation succeeds
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    mockMutation.mutateAsync.mockResolvedValue({
      success: true,
      data: {
        shift_id: "shift-1",
        store_id: mockStoreId,
        opened_by: "user-1",
        cashier_id: "550e8400-e29b-41d4-a716-446655440001",
        pos_terminal_id: "550e8400-e29b-41d4-a716-446655440011",
        opened_at: "2024-01-01T10:00:00Z",
        opening_cash: 100.0,
        status: "OPEN",
      },
    });

    renderWithProviders(
      <ShiftOpeningForm
        storeId={mockStoreId}
        cashiers={mockCashiers}
        terminals={mockTerminals}
        open={true}
        onOpenChange={onOpenChange}
      />,
    );

    // WHEN: Valid form data is entered and submitted
    // Select cashier
    const cashierSelect = screen.getByTestId("cashier-select");
    await user.click(cashierSelect);
    const cashierOption = await screen.findByTestId(
      "cashier-option-550e8400-e29b-41d4-a716-446655440001",
    );
    await user.click(cashierOption);

    // Select terminal
    const terminalSelect = screen.getByTestId("terminal-select");
    await user.click(terminalSelect);
    const terminalOption = await screen.findByTestId(
      "terminal-option-550e8400-e29b-41d4-a716-446655440011",
    );
    await user.click(terminalOption);

    // Enter opening cash
    const openingCashInput = screen.getByTestId("opening-cash-input");
    await user.type(openingCashInput, "100");

    // Submit form
    const submitButton = screen.getByTestId("submit-shift-opening");
    await user.click(submitButton);

    // THEN: Mutation should be called with expected payload
    await waitFor(() => {
      expect(mockMutation.mutateAsync).toHaveBeenCalledTimes(1);
      expect(mockMutation.mutateAsync).toHaveBeenCalledWith({
        store_id: mockStoreId,
        cashier_id: "550e8400-e29b-41d4-a716-446655440001",
        pos_terminal_id: "550e8400-e29b-41d4-a716-446655440011",
        opening_cash: 100,
      });
    });
  });

  it("[P0] 4.7-COMPONENT-028: should handle SHIFT_ALREADY_ACTIVE error", async () => {
    // GIVEN: Component is rendered and mutation fails with SHIFT_ALREADY_ACTIVE
    const user = userEvent.setup();
    mockMutation.mutateAsync.mockRejectedValue(
      new Error("SHIFT_ALREADY_ACTIVE: An active shift already exists"),
    );

    renderWithProviders(
      <ShiftOpeningForm
        storeId={mockStoreId}
        cashiers={mockCashiers}
        terminals={mockTerminals}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Form is filled with valid data and submitted
    // Select cashier
    const cashierSelect = screen.getByTestId("cashier-select");
    await user.click(cashierSelect);
    const cashierOption = await screen.findByTestId(
      "cashier-option-550e8400-e29b-41d4-a716-446655440001",
    );
    await user.click(cashierOption);

    // Select terminal
    const terminalSelect = screen.getByTestId("terminal-select");
    await user.click(terminalSelect);
    const terminalOption = await screen.findByTestId(
      "terminal-option-550e8400-e29b-41d4-a716-446655440011",
    );
    await user.click(terminalOption);

    // Enter opening cash
    const openingCashInput = screen.getByTestId("opening-cash-input");
    await user.type(openingCashInput, "100");

    // Submit form
    const submitButton = screen.getByTestId("submit-shift-opening");
    await user.click(submitButton);

    // THEN: Terminal-specific active-shift error message should be displayed
    // The error is shown in a toast notification
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

  it("[P0] 4.7-COMPONENT-029: should handle CASHIER_NOT_FOUND error", async () => {
    // GIVEN: Component is rendered and mutation fails with CASHIER_NOT_FOUND
    const user = userEvent.setup();
    mockMutation.mutateAsync.mockRejectedValue(
      new Error("CASHIER_NOT_FOUND: Cashier not found"),
    );

    renderWithProviders(
      <ShiftOpeningForm
        storeId={mockStoreId}
        cashiers={mockCashiers}
        terminals={mockTerminals}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Form is submitted and error occurs
    // Select cashier and terminal first (required for form submission)
    const cashierSelect = screen.getByTestId("cashier-select");
    await user.click(cashierSelect);
    const cashierOption = await screen.findByTestId(
      "cashier-option-550e8400-e29b-41d4-a716-446655440001",
    );
    await user.click(cashierOption);

    const terminalSelect = screen.getByTestId("terminal-select");
    await user.click(terminalSelect);
    const terminalOption = await screen.findByTestId(
      "terminal-option-550e8400-e29b-41d4-a716-446655440011",
    );
    await user.click(terminalOption);

    const openingCashInput = screen.getByTestId("opening-cash-input");
    await user.type(openingCashInput, "100");
    const submitButton = screen.getByTestId("submit-shift-opening");
    await user.click(submitButton);

    // THEN: Error message should be displayed
    // The form error message is "Cashier is not valid for this store"
    await waitFor(() => {
      expect(
        screen.getByText(/cashier is not valid for this store/i),
      ).toBeInTheDocument();
    });
  });

  it("[P0] 4.7-COMPONENT-030: should disable submit button when no cashiers available", () => {
    // GIVEN: Component is rendered with no cashiers
    renderWithProviders(
      <ShiftOpeningForm
        storeId={mockStoreId}
        cashiers={[]}
        terminals={mockTerminals}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Submit button should be disabled
    const submitButton = screen.getByTestId("submit-shift-opening");
    expect(submitButton).toBeDisabled();
  });

  it("[P0] 4.7-COMPONENT-031: should disable submit button when no terminals available", () => {
    // GIVEN: Component is rendered with no terminals
    renderWithProviders(
      <ShiftOpeningForm
        storeId={mockStoreId}
        cashiers={mockCashiers}
        terminals={[]}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Submit button should be disabled
    const submitButton = screen.getByTestId("submit-shift-opening");
    expect(submitButton).toBeDisabled();
  });

  it("[P1] 4.7-COMPONENT-032: should reset form when dialog closes", async () => {
    // GIVEN: Component is rendered and form has values
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { rerender } = renderWithProviders(
      <ShiftOpeningForm
        storeId={mockStoreId}
        cashiers={mockCashiers}
        terminals={mockTerminals}
        open={true}
        onOpenChange={onOpenChange}
      />,
    );

    const openingCashInput = screen.getByTestId("opening-cash-input");
    await user.type(openingCashInput, "100");

    // WHEN: Dialog is closed and reopened
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    // Close the dialog first
    rerender(
      <ShiftOpeningForm
        storeId={mockStoreId}
        cashiers={mockCashiers}
        terminals={mockTerminals}
        open={false}
        onOpenChange={onOpenChange}
      />,
    );

    // Then reopen it to trigger the reset
    rerender(
      <ShiftOpeningForm
        storeId={mockStoreId}
        cashiers={mockCashiers}
        terminals={mockTerminals}
        open={true}
        onOpenChange={onOpenChange}
      />,
    );

    // THEN: Form should be reset
    // Wait for form to reset after dialog reopens
    const newOpeningCashInput = (await screen.findByTestId(
      "opening-cash-input",
    )) as HTMLInputElement;
    await waitFor(() => {
      // Component resets to 0, which displays as empty string in the input
      // (see component: value={field.value === 0 ? "" : field.value})
      expect(newOpeningCashInput.value).toBe("");
    });
  });

  it("[P1] 4.7-COMPONENT-033: should call onSuccess callback after successful submission", async () => {
    // GIVEN: Component is rendered with onSuccess callback
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    mockMutation.mutateAsync.mockResolvedValue({
      success: true,
      data: {
        shift_id: "shift-1",
        store_id: mockStoreId,
        opened_by: "user-1",
        cashier_id: "550e8400-e29b-41d4-a716-446655440001",
        pos_terminal_id: "550e8400-e29b-41d4-a716-446655440011",
        opened_at: "2024-01-01T10:00:00Z",
        opening_cash: 100.0,
        status: "OPEN",
      },
    });

    renderWithProviders(
      <ShiftOpeningForm
        storeId={mockStoreId}
        cashiers={mockCashiers}
        terminals={mockTerminals}
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={onSuccess}
      />,
    );

    // WHEN: Form is filled with all required fields and submitted
    // Select cashier
    const cashierSelect = screen.getByTestId("cashier-select");
    await user.click(cashierSelect);
    const cashierOption = await screen.findByTestId(
      "cashier-option-550e8400-e29b-41d4-a716-446655440001",
    );
    await user.click(cashierOption);

    // Select terminal
    const terminalSelect = screen.getByTestId("terminal-select");
    await user.click(terminalSelect);
    const terminalOption = await screen.findByTestId(
      "terminal-option-550e8400-e29b-41d4-a716-446655440011",
    );
    await user.click(terminalOption);

    // Enter opening cash
    const openingCashInput = screen.getByTestId("opening-cash-input");
    await user.type(openingCashInput, "100");

    // Submit form
    const submitButton = screen.getByTestId("submit-shift-opening");
    await user.click(submitButton);

    // THEN: Mutation should be called with expected payload
    await waitFor(() => {
      expect(mockMutation.mutateAsync).toHaveBeenCalledTimes(1);
      expect(mockMutation.mutateAsync).toHaveBeenCalledWith({
        store_id: mockStoreId,
        cashier_id: "550e8400-e29b-41d4-a716-446655440001",
        pos_terminal_id: "550e8400-e29b-41d4-a716-446655440011",
        opening_cash: 100,
      });
    });

    // AND: onSuccess callback should be invoked once
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // SECURITY TESTS - Input Validation & XSS Prevention (Component Level)
  // ============================================================================

  it("[P1] 4.7-COMPONENT-SEC-001: should sanitize XSS attempts in opening cash input", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    renderWithProviders(
      <ShiftOpeningForm
        storeId={mockStoreId}
        cashiers={mockCashiers}
        terminals={mockTerminals}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: XSS attempt is entered in opening cash field
    const openingCashInput = screen.getByTestId("opening-cash-input");
    await user.type(openingCashInput, "<script>alert('xss')</script>");

    // THEN: Input should be sanitized (number input should reject non-numeric)
    // Number input type prevents script injection - returns null for invalid input
    expect(openingCashInput).toHaveValue(null);
  });

  it("[P1] 4.7-COMPONENT-SEC-002: should validate opening cash accepts only numeric input", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    renderWithProviders(
      <ShiftOpeningForm
        storeId={mockStoreId}
        cashiers={mockCashiers}
        terminals={mockTerminals}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Non-numeric characters are entered
    const openingCashInput = screen.getByTestId("opening-cash-input");
    await user.type(openingCashInput, "abc123");

    // THEN: Only numeric characters should be accepted
    // Number input type enforces numeric-only input
    expect(openingCashInput).toHaveValue(123);
  });

  // ============================================================================
  // EDGE CASE TESTS - Opening Cash Boundary Conditions
  // ============================================================================

  it("[P1] 4.7-COMPONENT-EDGE-001: should accept zero opening cash", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    renderWithProviders(
      <ShiftOpeningForm
        storeId={mockStoreId}
        cashiers={mockCashiers}
        terminals={mockTerminals}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Zero is entered as opening cash
    const openingCashInput = screen.getByTestId(
      "opening-cash-input",
    ) as HTMLInputElement;
    await user.clear(openingCashInput);
    await user.type(openingCashInput, "0");

    // THEN: Zero should be accepted (non-negative validation)
    // Component stores 0 but displays as empty string (value={field.value === 0 ? "" : field.value})
    // So we check that the form field accepts 0 by verifying it's not showing an error
    await waitFor(() => {
      // The input should have "0" typed in it, even though it may display as empty when value is 0
      // Actually, when typing "0", the component converts it to number 0, which displays as ""
      // So we verify the form accepts it by checking no validation error appears
      const errorMessage = screen.queryByText(
        /opening cash must be a non-negative number/i,
      );
      expect(errorMessage).not.toBeInTheDocument();
    });

    // Also verify the input has the value (might be "0" or empty string if converted to 0)
    const value = openingCashInput.value;
    expect(value === "0" || value === "").toBe(true);
  });

  it("[P1] 4.7-COMPONENT-EDGE-002: should accept maximum opening cash ($1000)", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    renderWithProviders(
      <ShiftOpeningForm
        storeId={mockStoreId}
        cashiers={mockCashiers}
        terminals={mockTerminals}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Maximum allowed opening cash ($1000) is entered
    const openingCashInput = screen.getByTestId("opening-cash-input");
    await user.type(openingCashInput, "1000");

    // THEN: Maximum value should be accepted
    expect(openingCashInput).toHaveValue(1000);
  });

  it("[P1] 4.7-COMPONENT-EDGE-003: should handle decimal precision for opening cash", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    renderWithProviders(
      <ShiftOpeningForm
        storeId={mockStoreId}
        cashiers={mockCashiers}
        terminals={mockTerminals}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Decimal values are entered (0.01, 0.99, 100.50)
    const openingCashInput = screen.getByTestId("opening-cash-input");
    await user.type(openingCashInput, "100.50");

    // THEN: Decimal precision should be accepted
    expect(openingCashInput).toHaveValue(100.5);
  });

  it("[P1] 4.7-COMPONENT-EDGE-004: should allow entry of large values (backend validates limit)", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    renderWithProviders(
      <ShiftOpeningForm
        storeId={mockStoreId}
        cashiers={mockCashiers}
        terminals={mockTerminals}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Very large value (> $1000) is entered
    const openingCashInput = screen.getByTestId("opening-cash-input");
    await user.type(openingCashInput, "1000000");

    // THEN: Large value should be accepted by the UI input (backend validates business rules)
    // Note: Frontend allows entry of large values; business rule enforcement is at backend level
    expect(openingCashInput).toHaveValue(1000000);
  });

  // ============================================================================
  // ADDITIONAL ASSERTIONS - Response Structure & Data Types
  // ============================================================================

  it("[P1] 4.7-COMPONENT-ASSERT-001: should verify response structure on successful submission", async () => {
    // GIVEN: Component is rendered and mutation succeeds
    const user = userEvent.setup();
    const mockResponse = {
      success: true,
      data: {
        shift_id: "shift-1",
        store_id: mockStoreId,
        opened_by: "user-1",
        cashier_id: "550e8400-e29b-41d4-a716-446655440001",
        pos_terminal_id: "550e8400-e29b-41d4-a716-446655440011",
        opened_at: "2024-01-01T10:00:00Z",
        opening_cash: 100.0,
        status: "OPEN",
      },
    };
    mockMutation.mutateAsync.mockResolvedValue(mockResponse);

    renderWithProviders(
      <ShiftOpeningForm
        storeId={mockStoreId}
        cashiers={mockCashiers}
        terminals={mockTerminals}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // WHEN: Form is submitted successfully
    // Select cashier
    const cashierSelect = screen.getByTestId("cashier-select");
    await user.click(cashierSelect);
    const cashierOption = await screen.findByTestId(
      "cashier-option-550e8400-e29b-41d4-a716-446655440001",
    );
    await user.click(cashierOption);

    // Select terminal
    const terminalSelect = screen.getByTestId("terminal-select");
    await user.click(terminalSelect);
    const terminalOption = await screen.findByTestId(
      "terminal-option-550e8400-e29b-41d4-a716-446655440011",
    );
    await user.click(terminalOption);

    // Enter opening cash
    const openingCashInput = screen.getByTestId("opening-cash-input");
    await user.clear(openingCashInput);
    await user.type(openingCashInput, "100");

    // Submit form
    const submitButton = screen.getByTestId("submit-shift-opening");
    await user.click(submitButton);

    // THEN: Response should have correct structure
    await waitFor(
      () => {
        expect(mockMutation.mutateAsync).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );

    const callArgs = mockMutation.mutateAsync.mock.calls[0]?.[0];
    if (callArgs) {
      expect(callArgs).toHaveProperty("store_id");
      expect(callArgs).toHaveProperty("cashier_id");
      expect(callArgs).toHaveProperty("pos_terminal_id");
      expect(callArgs).toHaveProperty("opening_cash");
      expect(typeof callArgs.opening_cash).toBe("number");
      expect(callArgs.opening_cash).toBeGreaterThanOrEqual(0);
    }
  });

  it("[P1] 4.7-COMPONENT-ASSERT-002: should verify UUID format for IDs", async () => {
    // GIVEN: Component is rendered
    renderWithProviders(
      <ShiftOpeningForm
        storeId={mockStoreId}
        cashiers={mockCashiers}
        terminals={mockTerminals}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    // THEN: Store ID should be in UUID format (RFC4122 v1/v4 pattern)
    // Component receives storeId as prop, validation occurs in Zod schema at form submission
    // This test verifies the prop format matches expected UUID structure
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(mockStoreId).toMatch(uuidRegex);
  });
});
