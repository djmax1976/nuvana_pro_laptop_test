/**
 * @test-level Component
 * @justification Component tests for TerminalAuthModal - validates form rendering, validation, and submission
 * @story 4-9-mystore-terminal-dashboard
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../support/test-utils";
import { TerminalAuthModal } from "@/components/terminals/TerminalAuthModal";
import userEvent from "@testing-library/user-event";
import * as cashiersApi from "@/lib/api/cashiers";
import * as shiftsApi from "@/lib/api/shifts";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock the cashiers API hooks
vi.mock("@/lib/api/cashiers", () => ({
  useCashiers: vi.fn(),
  useAuthenticateCashier: vi.fn(),
}));

// Mock the shifts API hooks
vi.mock("@/lib/api/shifts", () => ({
  useActiveShift: vi.fn(),
  useShiftStart: vi.fn(),
}));

describe("4.9-COMPONENT: TerminalAuthModal Component", () => {
  const mockTerminalId = "550e8400-e29b-41d4-a716-446655440011";
  const mockStoreId = "550e8400-e29b-41d4-a716-446655440022";
  const mockTerminalName = "Terminal 1";
  const mockOnOpenChange = vi.fn();
  const mockOnSubmit = vi.fn();

  // Mock cashiers data
  const mockCashiers = [
    { cashier_id: "cashier-1", name: "John Doe", is_active: true },
    { cashier_id: "cashier-2", name: "Jane Smith", is_active: true },
    { cashier_id: "cashier-3", name: "Mike Johnson", is_active: true },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementation for useCashiers
    vi.mocked(cashiersApi.useCashiers).mockReturnValue({
      data: mockCashiers,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // Default mock implementation for useAuthenticateCashier
    vi.mocked(cashiersApi.useAuthenticateCashier).mockReturnValue({
      mutateAsync: vi
        .fn()
        .mockResolvedValue({ success: true, cashier_id: "cashier-1" }),
      isPending: false,
      isError: false,
      error: null,
      reset: vi.fn(),
    } as any);

    // Default mock implementation for useActiveShift
    vi.mocked(shiftsApi.useActiveShift).mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      isError: false,
    } as any);

    // Default mock implementation for useShiftStart
    vi.mocked(shiftsApi.useShiftStart).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ shift_id: "shift-1" }),
      isPending: false,
      isError: false,
      error: null,
      reset: vi.fn(),
    } as any);
  });

  it("[P0] 4.9-COMPONENT-010: should render TerminalAuthModal when open is true", () => {
    // GIVEN: Component is rendered with open=true
    renderWithProviders(
      <TerminalAuthModal
        terminalId={mockTerminalId}
        storeId={mockStoreId}
        terminalName={mockTerminalName}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // THEN: Modal should be visible
    expect(screen.getByTestId("terminal-auth-modal")).toBeInTheDocument();
    expect(screen.getByText(/terminal authentication/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(`Authenticate to access terminal: ${mockTerminalName}`, "i"),
      ),
    ).toBeInTheDocument();
  });

  it("[P0] 4.9-COMPONENT-011: should render form with Cashier Name dropdown, Starting Cash, and PIN Number input", () => {
    // GIVEN: Component is rendered
    renderWithProviders(
      <TerminalAuthModal
        terminalId={mockTerminalId}
        storeId={mockStoreId}
        terminalName={mockTerminalName}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // THEN: Cashier Name dropdown should be visible
    expect(screen.getByTestId("cashier-name-select")).toBeInTheDocument();
    // Use getAllByText since there are multiple elements with "Cashier Name" text
    const cashierNameElements = screen.getAllByText(/cashier name/i);
    expect(cashierNameElements.length).toBeGreaterThan(0);
    // THEN: Starting Cash input should be visible
    expect(screen.getByTestId("starting-cash-input")).toBeInTheDocument();
    expect(screen.getByText(/starting cash/i)).toBeInTheDocument();
    // THEN: PIN Number input should be visible
    expect(screen.getByTestId("pin-number-input")).toBeInTheDocument();
    expect(screen.getByText(/pin number/i)).toBeInTheDocument();
  });

  it("[P0] 4.9-COMPONENT-012: should display cashier name options from API in dropdown", async () => {
    // GIVEN: Component is rendered with mocked cashiers from API
    const user = userEvent.setup();
    renderWithProviders(
      <TerminalAuthModal
        terminalId={mockTerminalId}
        storeId={mockStoreId}
        terminalName={mockTerminalName}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // WHEN: Cashier Name dropdown is clicked
    const selectTrigger = screen.getByTestId("cashier-name-select");
    await user.click(selectTrigger);

    // THEN: Cashier name options from API should be visible
    // Note: Radix UI Select creates multiple elements (hidden option + visible span)
    // Use getAllByText to handle multiple matches
    await waitFor(() => {
      const johnDoeElements = screen.getAllByText("John Doe");
      const janeSmithElements = screen.getAllByText("Jane Smith");
      const mikeJohnsonElements = screen.getAllByText("Mike Johnson");
      expect(johnDoeElements.length).toBeGreaterThan(0);
      expect(janeSmithElements.length).toBeGreaterThan(0);
      expect(mikeJohnsonElements.length).toBeGreaterThan(0);
    });
  });

  it("[P0] 4.9-COMPONENT-013: should display Cancel and Start Shift buttons", () => {
    // GIVEN: Component is rendered
    renderWithProviders(
      <TerminalAuthModal
        terminalId={mockTerminalId}
        storeId={mockStoreId}
        terminalName={mockTerminalName}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // THEN: Cancel button should be visible
    expect(
      screen.getByTestId("terminal-auth-cancel-button"),
    ).toBeInTheDocument();
    expect(screen.getByText(/cancel/i)).toBeInTheDocument();
    // THEN: Start Shift button should be visible (shows "Resume Shift" if active shift exists)
    expect(
      screen.getByTestId("terminal-auth-submit-button"),
    ).toBeInTheDocument();
    expect(screen.getByText(/start shift/i)).toBeInTheDocument();
  });

  it("[P1] 4.9-COMPONENT-014: should validate that cashier name is required", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    renderWithProviders(
      <TerminalAuthModal
        terminalId={mockTerminalId}
        storeId={mockStoreId}
        terminalName={mockTerminalName}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // WHEN: PIN is filled but cashier name is not selected
    const pinInput = screen.getByTestId("pin-number-input");
    await user.type(pinInput, "1234");

    // WHEN: Form is submitted without cashier name
    const submitButton = screen.getByTestId("terminal-auth-submit-button");
    await user.click(submitButton);

    // THEN: Validation error should be displayed
    await waitFor(() => {
      expect(screen.getByTestId("cashier-name-error")).toBeInTheDocument();
      expect(screen.getByText(/cashier name is required/i)).toBeInTheDocument();
    });
  });

  it("[P1] 4.9-COMPONENT-015: should validate that PIN number is required", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    renderWithProviders(
      <TerminalAuthModal
        terminalId={mockTerminalId}
        storeId={mockStoreId}
        terminalName={mockTerminalName}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // WHEN: Cashier name is selected but PIN is not entered
    const selectTrigger = screen.getByTestId("cashier-name-select");
    await user.click(selectTrigger);
    // Use getByRole to find the clickable SelectItem (not the hidden option)
    await waitFor(() => {
      expect(
        screen.getByRole("option", { name: "John Doe" }),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByRole("option", { name: "John Doe" }));

    // WHEN: Form is submitted without PIN
    const submitButton = screen.getByTestId("terminal-auth-submit-button");
    await user.click(submitButton);

    // THEN: Validation error should be displayed
    await waitFor(() => {
      expect(screen.getByTestId("pin-number-error")).toBeInTheDocument();
      expect(screen.getByText(/pin number is required/i)).toBeInTheDocument();
    });
  });

  it("[P1] 4.9-COMPONENT-016: should close modal when Cancel button is clicked", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    renderWithProviders(
      <TerminalAuthModal
        terminalId={mockTerminalId}
        storeId={mockStoreId}
        terminalName={mockTerminalName}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // WHEN: Cancel button is clicked
    const cancelButton = screen.getByTestId("terminal-auth-cancel-button");
    await user.click(cancelButton);

    // THEN: onOpenChange should be called with false
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("[P1] 4.9-COMPONENT-017: should submit form with valid data", async () => {
    // GIVEN: Component is rendered with onSubmit handler
    const user = userEvent.setup();
    renderWithProviders(
      <TerminalAuthModal
        terminalId={mockTerminalId}
        storeId={mockStoreId}
        terminalName={mockTerminalName}
        open={true}
        onOpenChange={mockOnOpenChange}
        onSubmit={mockOnSubmit}
      />,
    );

    // WHEN: Form is filled with valid data
    const selectTrigger = screen.getByTestId("cashier-name-select");
    await user.click(selectTrigger);
    // Use getByRole to find the clickable SelectItem (not the hidden option)
    await waitFor(() => {
      expect(
        screen.getByRole("option", { name: "John Doe" }),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByRole("option", { name: "John Doe" }));

    const pinInput = screen.getByTestId("pin-number-input");
    await user.type(pinInput, "1234");

    // WHEN: Form is submitted
    const submitButton = screen.getByTestId("terminal-auth-submit-button");
    await user.click(submitButton);

    // THEN: onSubmit should be called with form values (starting_cash is optional)
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        cashier_name: "John Doe",
        pin_number: "1234",
        starting_cash: undefined,
      });
    });
  });

  it("[P1] 4.9-COMPONENT-017b: should submit form with valid data including starting cash", async () => {
    // GIVEN: Component is rendered with onSubmit handler
    const user = userEvent.setup();
    renderWithProviders(
      <TerminalAuthModal
        terminalId={mockTerminalId}
        storeId={mockStoreId}
        terminalName={mockTerminalName}
        open={true}
        onOpenChange={mockOnOpenChange}
        onSubmit={mockOnSubmit}
      />,
    );

    // WHEN: Form is filled with valid data including starting cash
    const selectTrigger = screen.getByTestId("cashier-name-select");
    await user.click(selectTrigger);
    await waitFor(() => {
      expect(
        screen.getByRole("option", { name: "John Doe" }),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByRole("option", { name: "John Doe" }));

    const startingCashInput = screen.getByTestId("starting-cash-input");
    await user.type(startingCashInput, "150.50");

    const pinInput = screen.getByTestId("pin-number-input");
    await user.type(pinInput, "1234");

    // WHEN: Form is submitted
    const submitButton = screen.getByTestId("terminal-auth-submit-button");
    await user.click(submitButton);

    // THEN: onSubmit should be called with form values including starting_cash
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        cashier_name: "John Doe",
        pin_number: "1234",
        starting_cash: 150.5,
      });
    });
  });

  it("[P1] 4.9-COMPONENT-018: should reset form when modal is closed and reopened", async () => {
    // GIVEN: Component is rendered, form is filled, then closed
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(
      <TerminalAuthModal
        terminalId={mockTerminalId}
        storeId={mockStoreId}
        terminalName={mockTerminalName}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // Fill form
    const selectTrigger = screen.getByTestId("cashier-name-select");
    await user.click(selectTrigger);
    // Use getByRole to find the clickable SelectItem (not the hidden option)
    await waitFor(() => {
      expect(
        screen.getByRole("option", { name: "John Doe" }),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByRole("option", { name: "John Doe" }));

    const pinInput = screen.getByTestId("pin-number-input");
    await user.type(pinInput, "1234");

    // Close modal
    const cancelButton = screen.getByTestId("terminal-auth-cancel-button");
    await user.click(cancelButton);

    // WHEN: Modal is reopened
    rerender(
      <TerminalAuthModal
        terminalId={mockTerminalId}
        storeId={mockStoreId}
        terminalName={mockTerminalName}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // THEN: Form should be reset (empty)
    await waitFor(() => {
      const newPinInput = screen.getByTestId("pin-number-input");
      expect(newPinInput).toHaveValue("");
    });
  });

  it("[P2] 4.9-COMPONENT-019: should mask PIN number input (password type)", () => {
    // GIVEN: Component is rendered
    renderWithProviders(
      <TerminalAuthModal
        terminalId={mockTerminalId}
        storeId={mockStoreId}
        terminalName={mockTerminalName}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // THEN: PIN input should have password type
    const pinInput = screen.getByTestId("pin-number-input");
    expect(pinInput).toHaveAttribute("type", "password");
  });

  // ============ RESUME MODE TESTS ============

  describe("Resume Mode (Active Shift Exists)", () => {
    const mockActiveShift = {
      shift_id: "shift-123",
      cashier_id: "cashier-1",
      cashier_name: "John Doe",
      opened_at: "2025-01-28T10:00:00Z",
      shift_number: 1,
      opening_cash: 150.0,
    };

    beforeEach(() => {
      // Mock active shift exists for resume mode
      vi.mocked(shiftsApi.useActiveShift).mockReturnValue({
        data: mockActiveShift,
        isLoading: false,
        error: null,
        isError: false,
      } as any);
    });

    it("[P0] 4.9-COMPONENT-020: should NOT show starting cash input when resuming an active shift", () => {
      // GIVEN: Component is rendered with an active shift (resume mode)
      renderWithProviders(
        <TerminalAuthModal
          terminalId={mockTerminalId}
          storeId={mockStoreId}
          terminalName={mockTerminalName}
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
      );

      // THEN: Starting Cash input should NOT be visible in resume mode
      expect(
        screen.queryByTestId("starting-cash-input"),
      ).not.toBeInTheDocument();
      // THEN: Cashier Name dropdown should NOT be visible (read-only display instead)
      expect(
        screen.queryByTestId("cashier-name-select"),
      ).not.toBeInTheDocument();
      // THEN: PIN input should still be visible
      expect(screen.getByTestId("pin-number-input")).toBeInTheDocument();
    });

    it("[P0] 4.9-COMPONENT-021: should show shift owner display in resume mode", () => {
      // GIVEN: Component is rendered with an active shift (resume mode)
      renderWithProviders(
        <TerminalAuthModal
          terminalId={mockTerminalId}
          storeId={mockStoreId}
          terminalName={mockTerminalName}
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
      );

      // THEN: Shift owner display should be visible with cashier name
      expect(screen.getByTestId("shift-owner-display")).toBeInTheDocument();
      expect(screen.getByTestId("shift-owner-name")).toHaveTextContent(
        "John Doe",
      );
    });

    it("[P0] 4.9-COMPONENT-022: should show 'Resume Shift' button text in resume mode", () => {
      // GIVEN: Component is rendered with an active shift (resume mode)
      renderWithProviders(
        <TerminalAuthModal
          terminalId={mockTerminalId}
          storeId={mockStoreId}
          terminalName={mockTerminalName}
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
      );

      // THEN: Submit button should show "Resume Shift" instead of "Start Shift"
      const submitButton = screen.getByTestId("terminal-auth-submit-button");
      expect(submitButton).toHaveTextContent(/resume shift/i);
      expect(submitButton).not.toHaveTextContent(/start shift/i);
    });

    it("[P1] 4.9-COMPONENT-023: should show resume mode description text", () => {
      // GIVEN: Component is rendered with an active shift (resume mode)
      renderWithProviders(
        <TerminalAuthModal
          terminalId={mockTerminalId}
          storeId={mockStoreId}
          terminalName={mockTerminalName}
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
      );

      // THEN: Description should indicate resume mode
      expect(
        screen.getByText(
          new RegExp(`Resume shift on terminal: ${mockTerminalName}`, "i"),
        ),
      ).toBeInTheDocument();
    });
  });
});
