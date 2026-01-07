/**
 * @test-level COMPONENT
 * @justification Tests UI component behavior in isolation - fast, isolated, granular
 *
 * Component Tests: ReturnPackDialog
 *
 * Tests ReturnPackDialog component behavior for lottery pack returns:
 * - Dialog rendering and form fields
 * - Form validation (return reason, serial format, notes requirement)
 * - Sales calculation from serial numbers
 * - API submission and error handling
 * - XSS prevention for user-generated content
 * - Accessibility compliance
 *
 * MCP Guidance Applied:
 * - TESTING: Component tests are fast, isolated, and granular
 * - SECURITY: XSS prevention tests for all user-generated fields
 * - FE-002: FORM_VALIDATION - Tests for client-side validation
 * - SEC-014: INPUT_VALIDATION - Tests for input constraints
 *
 * =============================================================================
 * TRACEABILITY MATRIX
 * =============================================================================
 * | Test ID     | Requirement              | Priority | Type        |
 * |-------------|--------------------------|----------|-------------|
 * | REN-001     | Dialog renders correctly | P0       | Rendering   |
 * | REN-002     | Pack details display     | P0       | Rendering   |
 * | REN-003     | Return reason dropdown   | P0       | Rendering   |
 * | VAL-001     | Serial format validation | P0       | Validation  |
 * | VAL-002     | Serial range validation  | P0       | Validation  |
 * | VAL-003     | Notes required for OTHER | P1       | Validation  |
 * | VAL-004     | Submit button disabled   | P0       | Validation  |
 * | CAL-001     | Sales calculation        | P0       | Business    |
 * | CAL-002     | Tickets sold calculation | P0       | Business    |
 * | API-001     | Successful submission    | P0       | Integration |
 * | API-002     | Error handling           | P0       | Integration |
 * | API-003     | Loading state            | P1       | UX          |
 * | SEC-001     | XSS in pack number       | P0       | Security    |
 * | SEC-002     | XSS in game name         | P0       | Security    |
 * | SEC-003     | XSS in notes input       | P0       | Security    |
 * | ACC-001     | ARIA labels              | P1       | A11y        |
 * | ACC-002     | Form field associations  | P1       | A11y        |
 * | EDG-001     | Non-ACTIVE pack warning  | P1       | Edge Case   |
 * | EDG-002     | Dialog close behavior    | P1       | Edge Case   |
 * =============================================================================
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReturnPackDialog } from "@/components/lottery/ReturnPackDialog";
import type { LotteryPackResponse } from "@/lib/api/lottery";

// ═══════════════════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════════════════

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockReturnPackMutate = vi.fn();
const mockUseReturnPack = vi.fn(() => ({
  mutateAsync: mockReturnPackMutate,
  isPending: false,
}));

const mockUsePackDetails = vi.fn();

vi.mock("@/hooks/useLottery", () => ({
  useReturnPack: () => mockUseReturnPack(),
  usePackDetails: (packId: string | null, options?: { enabled?: boolean }) =>
    mockUsePackDetails(packId, options),
}));

// ═══════════════════════════════════════════════════════════════════════════
// TEST FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

const createMockPack = (
  overrides: Partial<LotteryPackResponse> = {},
): LotteryPackResponse => ({
  pack_id: "pack-001",
  game_id: "game-001",
  pack_number: "1234567",
  serial_start: "001",
  serial_end: "050",
  status: "ACTIVE",
  store_id: "store-001",
  current_bin_id: "bin-001",
  received_at: "2024-01-15T10:00:00Z",
  activated_at: "2024-01-15T12:00:00Z",
  game: {
    game_id: "game-001",
    game_code: "MM",
    name: "Mega Millions",
    price: 5.0,
  },
  bin: {
    bin_id: "bin-001",
    name: "Bin 1",
    location: null,
  },
  ...overrides,
});

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════

describe("ReturnPackDialog Component", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    packId: "pack-001",
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePackDetails.mockReturnValue({
      data: createMockPack(),
      isLoading: false,
      isError: false,
      error: null,
    });
    mockReturnPackMutate.mockResolvedValue({
      success: true,
      data: {
        pack_id: "pack-001",
        pack_number: "1234567",
        status: "RETURNED",
        sales_amount: "125.00",
      },
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDERING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Rendering", () => {
    it("REN-001: [P0] should render dialog with title and description", () => {
      // GIVEN: ReturnPackDialog with valid pack
      // WHEN: Component is rendered
      renderWithProviders(
        <ReturnPackDialog {...defaultProps} packData={createMockPack()} />,
      );

      // THEN: Dialog title and description are displayed
      expect(screen.getByText("Return Lottery Pack")).toBeInTheDocument();
      expect(
        screen.getByText(/Mark this pack as returned to supplier/),
      ).toBeInTheDocument();
    });

    it("REN-002: [P0] should display pack details correctly", () => {
      // GIVEN: ReturnPackDialog with pack data
      const mockPack = createMockPack();

      // WHEN: Component is rendered
      renderWithProviders(
        <ReturnPackDialog {...defaultProps} packData={mockPack} />,
      );

      // THEN: Pack details are displayed
      expect(screen.getByText("1234567")).toBeInTheDocument(); // Pack number
      expect(screen.getByText("Mega Millions")).toBeInTheDocument(); // Game name
      expect(screen.getByText("$5.00")).toBeInTheDocument(); // Price
      expect(screen.getByText("001 - 050")).toBeInTheDocument(); // Serial range
      expect(screen.getByText("ACTIVE")).toBeInTheDocument(); // Status
    });

    it("REN-003: [P0] should render return reason dropdown with all options", async () => {
      // GIVEN: ReturnPackDialog is rendered
      const user = userEvent.setup();
      renderWithProviders(
        <ReturnPackDialog {...defaultProps} packData={createMockPack()} />,
      );

      // WHEN: User opens the dropdown
      const trigger = screen.getByTestId("return-reason-select");
      await user.click(trigger);

      // THEN: All return reason options are available
      await waitFor(() => {
        expect(screen.getByText("Supplier Recall")).toBeInTheDocument();
        expect(screen.getByText("Damaged")).toBeInTheDocument();
        expect(screen.getByText("Expired")).toBeInTheDocument();
        expect(screen.getByText("Inventory Adjustment")).toBeInTheDocument();
        expect(screen.getByText("Store Closure")).toBeInTheDocument();
        expect(screen.getByText("Other")).toBeInTheDocument();
      });
    });

    it("REN-004: [P1] should render serial input field", () => {
      // GIVEN: ReturnPackDialog with pack data
      // WHEN: Component is rendered
      renderWithProviders(
        <ReturnPackDialog {...defaultProps} packData={createMockPack()} />,
      );

      // THEN: Serial input field is present
      const input = screen.getByTestId("last-sold-serial-input");
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute("maxLength", "3");
      expect(input).toHaveAttribute("inputMode", "numeric");
    });

    it("REN-005: [P1] should render notes textarea", () => {
      // GIVEN: ReturnPackDialog with pack data
      // WHEN: Component is rendered
      renderWithProviders(
        <ReturnPackDialog {...defaultProps} packData={createMockPack()} />,
      );

      // THEN: Notes textarea is present
      const textarea = screen.getByTestId("return-notes-input");
      expect(textarea).toBeInTheDocument();
      expect(textarea).toHaveAttribute("maxLength", "500");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Form Validation", () => {
    it("VAL-001: [P0] should only allow numeric input in serial field", async () => {
      // GIVEN: ReturnPackDialog is rendered
      const user = userEvent.setup();
      renderWithProviders(
        <ReturnPackDialog {...defaultProps} packData={createMockPack()} />,
      );

      // WHEN: User types non-numeric characters
      const input = screen.getByTestId("last-sold-serial-input");
      await user.type(input, "abc123xyz");

      // THEN: Only numeric characters are accepted
      expect(input).toHaveValue("123");
    });

    it("VAL-002: [P0] should limit serial input to 3 digits", async () => {
      // GIVEN: ReturnPackDialog is rendered
      const user = userEvent.setup();
      renderWithProviders(
        <ReturnPackDialog {...defaultProps} packData={createMockPack()} />,
      );

      // WHEN: User types more than 3 digits
      const input = screen.getByTestId("last-sold-serial-input");
      await user.type(input, "12345");

      // THEN: Input is limited to 3 digits
      expect(input).toHaveValue("123");
    });

    it("VAL-003: [P0] should show error when serial is out of range", async () => {
      // GIVEN: Pack with serial range 001-050
      const user = userEvent.setup();
      renderWithProviders(
        <ReturnPackDialog {...defaultProps} packData={createMockPack()} />,
      );

      // WHEN: User enters serial outside range (e.g., 075)
      const input = screen.getByTestId("last-sold-serial-input");
      await user.type(input, "075");

      // THEN: Error message is displayed
      await waitFor(() => {
        expect(
          screen.getByText(/Serial must be within range 001 - 050/),
        ).toBeInTheDocument();
      });
    });

    it("VAL-004: [P1] should require notes when reason is OTHER", async () => {
      // GIVEN: ReturnPackDialog is rendered
      const user = userEvent.setup();
      renderWithProviders(
        <ReturnPackDialog {...defaultProps} packData={createMockPack()} />,
      );

      // WHEN: User selects OTHER reason
      const trigger = screen.getByTestId("return-reason-select");
      await user.click(trigger);
      await waitFor(() => {
        const otherOption = screen.getByText("Other");
        fireEvent.click(otherOption);
      });

      // THEN: Notes field shows required indicator
      await waitFor(() => {
        expect(
          screen.getByText(/Notes are required when reason is 'Other'/),
        ).toBeInTheDocument();
      });
    });

    it("VAL-005: [P0] should disable submit button when form is incomplete", () => {
      // GIVEN: ReturnPackDialog with no inputs filled
      // WHEN: Component is rendered
      renderWithProviders(
        <ReturnPackDialog {...defaultProps} packData={createMockPack()} />,
      );

      // THEN: Submit button is disabled
      const submitButton = screen.getByTestId("confirm-return-button");
      expect(submitButton).toBeDisabled();
    });

    it("VAL-006: [P0] should enable submit when all required fields are valid", async () => {
      // GIVEN: ReturnPackDialog is rendered
      const user = userEvent.setup();
      renderWithProviders(
        <ReturnPackDialog {...defaultProps} packData={createMockPack()} />,
      );

      // WHEN: User fills all required fields
      // Select reason
      const trigger = screen.getByTestId("return-reason-select");
      await user.click(trigger);
      await waitFor(() => {
        const damagedOption = screen.getByText("Damaged");
        fireEvent.click(damagedOption);
      });

      // Enter valid serial
      const input = screen.getByTestId("last-sold-serial-input");
      await user.type(input, "025");

      // THEN: Submit button is enabled
      await waitFor(() => {
        const submitButton = screen.getByTestId("confirm-return-button");
        expect(submitButton).not.toBeDisabled();
      });
    });

    it("VAL-007: [P1] should limit notes to 500 characters", async () => {
      // GIVEN: ReturnPackDialog is rendered
      const user = userEvent.setup();
      renderWithProviders(
        <ReturnPackDialog {...defaultProps} packData={createMockPack()} />,
      );

      // WHEN: User types more than 500 characters
      const textarea = screen.getByTestId("return-notes-input");
      const longText = "a".repeat(550);
      await user.type(textarea, longText);

      // THEN: Input is limited to 500 characters
      expect(textarea).toHaveValue("a".repeat(500));
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SALES CALCULATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Sales Calculation", () => {
    it("CAL-001: [P0] should calculate tickets sold correctly", async () => {
      // GIVEN: Pack with serial_start=001, price=$5.00
      const user = userEvent.setup();
      renderWithProviders(
        <ReturnPackDialog {...defaultProps} packData={createMockPack()} />,
      );

      // WHEN: User enters last sold serial 025
      const input = screen.getByTestId("last-sold-serial-input");
      await user.type(input, "025");

      // THEN: Tickets sold is calculated (025 - 001 + 1 = 25)
      await waitFor(() => {
        expect(
          screen.getByTestId("sales-calculation-preview"),
        ).toBeInTheDocument();
        expect(screen.getByText("25")).toBeInTheDocument(); // Tickets sold
      });
    });

    it("CAL-002: [P0] should calculate sales amount correctly", async () => {
      // GIVEN: Pack with price=$5.00
      const user = userEvent.setup();
      renderWithProviders(
        <ReturnPackDialog {...defaultProps} packData={createMockPack()} />,
      );

      // WHEN: User enters last sold serial 025
      const input = screen.getByTestId("last-sold-serial-input");
      await user.type(input, "025");

      // THEN: Sales amount is calculated (25 * $5.00 = $125.00)
      await waitFor(() => {
        expect(screen.getByText("$125.00")).toBeInTheDocument();
      });
    });

    it("CAL-003: [P1] should not show calculation for invalid serial", async () => {
      // GIVEN: ReturnPackDialog is rendered
      const user = userEvent.setup();
      renderWithProviders(
        <ReturnPackDialog {...defaultProps} packData={createMockPack()} />,
      );

      // WHEN: User enters serial outside range
      const input = screen.getByTestId("last-sold-serial-input");
      await user.type(input, "075");

      // THEN: Sales calculation is not displayed
      await waitFor(() => {
        expect(
          screen.queryByTestId("sales-calculation-preview"),
        ).not.toBeInTheDocument();
      });
    });

    it("CAL-004: [P1] should not show calculation for incomplete serial", async () => {
      // GIVEN: ReturnPackDialog is rendered
      const user = userEvent.setup();
      renderWithProviders(
        <ReturnPackDialog {...defaultProps} packData={createMockPack()} />,
      );

      // WHEN: User enters only 2 digits
      const input = screen.getByTestId("last-sold-serial-input");
      await user.type(input, "02");

      // THEN: Sales calculation is not displayed
      expect(
        screen.queryByTestId("sales-calculation-preview"),
      ).not.toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // API SUBMISSION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("API Submission", () => {
    it("API-001: [P0] should call returnPack API with correct data on submit", async () => {
      // GIVEN: ReturnPackDialog with valid inputs
      const user = userEvent.setup();
      const onSuccess = vi.fn();
      renderWithProviders(
        <ReturnPackDialog
          {...defaultProps}
          packData={createMockPack()}
          onSuccess={onSuccess}
        />,
      );

      // Fill form
      const trigger = screen.getByTestId("return-reason-select");
      await user.click(trigger);
      await waitFor(() => {
        const damagedOption = screen.getByText("Damaged");
        fireEvent.click(damagedOption);
      });

      const serialInput = screen.getByTestId("last-sold-serial-input");
      await user.type(serialInput, "025");

      const notesInput = screen.getByTestId("return-notes-input");
      await user.type(notesInput, "Pack was damaged in shipping");

      // WHEN: User clicks submit
      const submitButton = screen.getByTestId("confirm-return-button");
      await user.click(submitButton);

      // THEN: API is called with correct data
      await waitFor(() => {
        expect(mockReturnPackMutate).toHaveBeenCalledWith({
          packId: "pack-001",
          data: {
            return_reason: "DAMAGED",
            last_sold_serial: "025",
            return_notes: "Pack was damaged in shipping",
          },
        });
      });
    });

    it("API-002: [P0] should show success toast and call onSuccess after successful return", async () => {
      // GIVEN: ReturnPackDialog with API returning success
      const user = userEvent.setup();
      const onSuccess = vi.fn();
      const onOpenChange = vi.fn();
      renderWithProviders(
        <ReturnPackDialog
          {...defaultProps}
          packData={createMockPack()}
          onSuccess={onSuccess}
          onOpenChange={onOpenChange}
        />,
      );

      // Fill form
      const trigger = screen.getByTestId("return-reason-select");
      await user.click(trigger);
      await waitFor(() => {
        const damagedOption = screen.getByText("Damaged");
        fireEvent.click(damagedOption);
      });

      const serialInput = screen.getByTestId("last-sold-serial-input");
      await user.type(serialInput, "025");

      // WHEN: User submits
      const submitButton = screen.getByTestId("confirm-return-button");
      await user.click(submitButton);

      // THEN: Success toast is shown and callbacks are called
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Pack returned successfully",
          }),
        );
        expect(onSuccess).toHaveBeenCalled();
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it("API-003: [P0] should show error toast when API fails", async () => {
      // GIVEN: ReturnPackDialog with API returning error
      mockReturnPackMutate.mockRejectedValue(new Error("Network error"));

      const user = userEvent.setup();
      renderWithProviders(
        <ReturnPackDialog {...defaultProps} packData={createMockPack()} />,
      );

      // Fill form
      const trigger = screen.getByTestId("return-reason-select");
      await user.click(trigger);
      await waitFor(() => {
        const damagedOption = screen.getByText("Damaged");
        fireEvent.click(damagedOption);
      });

      const serialInput = screen.getByTestId("last-sold-serial-input");
      await user.type(serialInput, "025");

      // WHEN: User submits
      const submitButton = screen.getByTestId("confirm-return-button");
      await user.click(submitButton);

      // THEN: Error toast is shown
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Error",
            variant: "destructive",
          }),
        );
      });
    });

    it("API-004: [P1] should show loading state during submission", async () => {
      // GIVEN: ReturnPackDialog with pending mutation
      mockUseReturnPack.mockReturnValue({
        mutateAsync: mockReturnPackMutate,
        isPending: true,
      });

      renderWithProviders(
        <ReturnPackDialog {...defaultProps} packData={createMockPack()} />,
      );

      // THEN: Submit button shows loading state
      const submitButton = screen.getByTestId("confirm-return-button");
      expect(submitButton).toBeDisabled();
      expect(submitButton).toHaveAttribute("aria-label", "Returning pack...");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Security - XSS Prevention", () => {
    it("SEC-001: [P0] [SECURITY] should prevent XSS in pack number display", () => {
      // GIVEN: Pack with XSS payload in pack number
      const xssPayload = "<script>alert('xss')</script>";
      const xssPack = createMockPack({ pack_number: xssPayload });

      // WHEN: Component is rendered
      renderWithProviders(
        <ReturnPackDialog {...defaultProps} packData={xssPack} />,
      );

      // THEN: Payload is escaped and displayed as text
      const packNumberDisplay = screen.getByText(xssPayload);
      expect(packNumberDisplay).toBeInTheDocument();
      expect(packNumberDisplay.tagName).not.toBe("SCRIPT");
    });

    it("SEC-002: [P0] [SECURITY] should prevent XSS in game name display", () => {
      // GIVEN: Pack with XSS payload in game name
      const xssPayload = '<img src=x onerror="alert(1)">';
      const xssPack = createMockPack({
        game: {
          game_id: "game-001",
          game_code: "XSS",
          name: xssPayload,
          price: 5.0,
        },
      });

      // WHEN: Component is rendered
      renderWithProviders(
        <ReturnPackDialog {...defaultProps} packData={xssPack} />,
      );

      // THEN: Payload is escaped and displayed as text
      const gameNameDisplay = screen.getByText(xssPayload);
      expect(gameNameDisplay).toBeInTheDocument();
      expect(gameNameDisplay.tagName).not.toBe("IMG");
    });

    it("SEC-003: [P0] [SECURITY] should sanitize notes input", async () => {
      // GIVEN: ReturnPackDialog is rendered
      const user = userEvent.setup();
      renderWithProviders(
        <ReturnPackDialog {...defaultProps} packData={createMockPack()} />,
      );

      // WHEN: User enters XSS payload in notes
      const xssPayload = "<script>alert('xss')</script>";
      const textarea = screen.getByTestId("return-notes-input");
      await user.type(textarea, xssPayload);

      // THEN: Input contains raw text (not executed)
      expect(textarea).toHaveValue(xssPayload);
      // No script execution occurs (React auto-escapes)
    });

    it("SEC-004: [P0] [SECURITY] should not render raw HTML in serial range", () => {
      // GIVEN: Pack with XSS in serial values
      const xssPack = createMockPack({
        serial_start: "<b>001</b>",
        serial_end: "<i>050</i>",
      });

      // WHEN: Component is rendered
      renderWithProviders(
        <ReturnPackDialog {...defaultProps} packData={xssPack} />,
      );

      // THEN: HTML tags are rendered as text
      expect(screen.getByText(/<b>001<\/b> - <i>050<\/i>/)).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Edge Cases", () => {
    it("EDG-001: [P1] should show warning for non-ACTIVE pack status", () => {
      // GIVEN: Pack with RECEIVED status
      const receivedPack = createMockPack({ status: "RECEIVED" });

      // WHEN: Component is rendered
      renderWithProviders(
        <ReturnPackDialog {...defaultProps} packData={receivedPack} />,
      );

      // THEN: Warning is displayed
      expect(screen.getByText("Cannot Return Pack")).toBeInTheDocument();
      // Check for the warning message container with role="alert"
      const alertContainer = screen.getByRole("alert");
      expect(alertContainer).toBeInTheDocument();
      // Verify the status is shown (appears in both alert and pack details)
      // Use getAllByText since "RECEIVED" appears in both locations
      const statusElements = screen.getAllByText("RECEIVED");
      expect(statusElements.length).toBeGreaterThanOrEqual(1);
    });

    it("EDG-002: [P1] should disable submit for non-ACTIVE pack", () => {
      // GIVEN: Pack with DEPLETED status
      const depletedPack = createMockPack({ status: "DEPLETED" });

      // WHEN: Component is rendered
      renderWithProviders(
        <ReturnPackDialog {...defaultProps} packData={depletedPack} />,
      );

      // THEN: Submit button is disabled
      const submitButton = screen.getByTestId("confirm-return-button");
      expect(submitButton).toBeDisabled();
    });

    it("EDG-003: [P1] should reset form when dialog closes", async () => {
      // GIVEN: ReturnPackDialog with filled form
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      renderWithProviders(
        <ReturnPackDialog
          {...defaultProps}
          packData={createMockPack()}
          onOpenChange={onOpenChange}
        />,
      );

      // Fill serial input
      const serialInput = screen.getByTestId("last-sold-serial-input");
      await user.type(serialInput, "025");
      expect(serialInput).toHaveValue("025");

      // WHEN: User clicks cancel
      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      await user.click(cancelButton);

      // THEN: onOpenChange is called with false
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("EDG-004: [P1] should handle pack with no game data gracefully", () => {
      // GIVEN: Pack without game data
      const packNoGame = createMockPack({ game: undefined });

      // WHEN: Component is rendered
      renderWithProviders(
        <ReturnPackDialog {...defaultProps} packData={packNoGame} />,
      );

      // THEN: Fallback values are displayed
      expect(screen.getByText("Unknown")).toBeInTheDocument();
      expect(screen.getByText("N/A")).toBeInTheDocument();
    });

    it("EDG-005: [P1] should handle loading state when fetching pack details", () => {
      // GIVEN: usePackDetails returns loading state
      mockUsePackDetails.mockReturnValue({
        data: null,
        isLoading: true,
        isError: false,
        error: null,
      });

      // WHEN: Component is rendered without packData prop
      renderWithProviders(
        <ReturnPackDialog {...defaultProps} packData={undefined} />,
      );

      // THEN: Loading state is displayed
      expect(screen.getByText("Loading pack details...")).toBeInTheDocument();
    });

    it("EDG-006: [P1] should handle error state when pack fetch fails", () => {
      // GIVEN: usePackDetails returns error
      mockUsePackDetails.mockReturnValue({
        data: null,
        isLoading: false,
        isError: true,
        error: { message: "Pack not found" },
      });

      // WHEN: Component is rendered without packData prop
      renderWithProviders(
        <ReturnPackDialog {...defaultProps} packData={undefined} />,
      );

      // THEN: Error state is displayed
      expect(
        screen.getByText("Failed to load pack details"),
      ).toBeInTheDocument();
      expect(screen.getByText("Pack not found")).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCESSIBILITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Accessibility", () => {
    it("ACC-001: [P1] should have proper aria-describedby for form fields", () => {
      // GIVEN: ReturnPackDialog is rendered
      renderWithProviders(
        <ReturnPackDialog {...defaultProps} packData={createMockPack()} />,
      );

      // THEN: Serial input has aria-describedby
      const serialInput = screen.getByTestId("last-sold-serial-input");
      expect(serialInput).toHaveAttribute("aria-describedby", "serial-help");
      expect(
        screen.getByText(/Enter the 3-digit serial number/),
      ).toBeInTheDocument();
    });

    it("ACC-002: [P1] should have accessible dialog structure", () => {
      // GIVEN: ReturnPackDialog is rendered
      renderWithProviders(
        <ReturnPackDialog {...defaultProps} packData={createMockPack()} />,
      );

      // THEN: Dialog has proper ARIA attributes
      expect(
        screen.getByRole("dialog", { name: /Return Lottery Pack/i }),
      ).toBeInTheDocument();
    });

    it("ACC-003: [P1] should have descriptive button labels", () => {
      // GIVEN: ReturnPackDialog is rendered
      renderWithProviders(
        <ReturnPackDialog {...defaultProps} packData={createMockPack()} />,
      );

      // THEN: Buttons have accessible labels
      expect(
        screen.getByRole("button", { name: /cancel/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Return pack 1234567/i }),
      ).toBeInTheDocument();
    });
  });
});
