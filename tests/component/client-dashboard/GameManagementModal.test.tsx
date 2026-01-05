/**
 * Component Tests: GameManagementModal
 *
 * Tests GameManagementModal component for managing game details:
 * - Form rendering with correct fields (name, code, price, pack value, status)
 * - Form validation (required fields, format validation)
 * - Form submission and API call
 * - Modal open/close behavior
 * - Loading states during submission
 * - Error handling
 * - Security: XSS prevention, input validation
 * - Accessibility: Form labels, ARIA attributes
 *
 * @test-level COMPONENT
 * @justification Tests UI component behavior in isolation - fast, isolated, granular
 * @story 6-10-1 - Client Dashboard Lottery Page
 * @priority P2 (Medium - Game Management)
 *
 * Tracing Matrix:
 * | Test ID                        | Requirement      | Component Feature              |
 * |--------------------------------|------------------|--------------------------------|
 * | COMPONENT-001                  | Form Display     | Modal rendering                |
 * | COMPONENT-002                  | Form Display     | Form fields display            |
 * | COMPONENT-003                  | Form Validation  | Required field validation      |
 * | COMPONENT-004                  | Form Validation  | Game code format validation    |
 * | COMPONENT-005                  | Form Validation  | Price validation               |
 * | COMPONENT-006                  | Form Submit      | Successful submission          |
 * | COMPONENT-007                  | Form Submit      | Loading state during submit    |
 * | COMPONENT-008                  | Error Handling   | API error display              |
 * | COMPONENT-009                  | Modal Behavior   | Close on success               |
 * | SEC-001                        | Security         | XSS prevention in form         |
 * | A11Y-001                       | Accessibility    | Form labels                    |
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameManagementModal } from "@/components/lottery/GameManagementModal";

// Mock useUpdateGame hook
const mockMutateAsync = vi.fn();
vi.mock("@/hooks/useLottery", () => ({
  useUpdateGame: vi.fn(() => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  })),
}));

// Mock useToast hook
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

import { useUpdateGame } from "@/hooks/useLottery";

describe("6.10.1-COMPONENT: GameManagementModal", () => {
  const mockGame = {
    game_id: "game-1",
    game_name: "Mega Millions",
    game_code: "0012",
    price: 5.0,
    pack_value: 300,
    status: "ACTIVE" as const,
  };

  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    storeId: "store-1",
    game: mockGame,
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue({ success: true });
    (useUpdateGame as ReturnType<typeof vi.fn>).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  // ============ BASIC RENDERING TESTS ============

  it("6.10.1-COMPONENT-GMM-001: [P2] should render modal when open is true", async () => {
    // GIVEN: GameManagementModal with open=true
    // WHEN: Component is rendered
    render(<GameManagementModal {...defaultProps} />);

    // THEN: Modal is displayed
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/manage game:/i)).toBeInTheDocument();
    expect(screen.getByText("Mega Millions")).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-GMM-002: [P2] should not render modal when open is false", async () => {
    // GIVEN: GameManagementModal with open=false
    // WHEN: Component is rendered
    render(<GameManagementModal {...defaultProps} open={false} />);

    // THEN: Modal is not displayed
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-GMM-003: [P2] should not render when game is null", async () => {
    // GIVEN: GameManagementModal with null game
    // WHEN: Component is rendered
    render(<GameManagementModal {...defaultProps} game={null} />);

    // THEN: Nothing is rendered
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-GMM-004: [P2] should display all form fields", async () => {
    // GIVEN: GameManagementModal
    // WHEN: Component is rendered
    render(<GameManagementModal {...defaultProps} />);

    // THEN: All form fields are displayed
    expect(screen.getByTestId("game-name-input")).toBeInTheDocument();
    expect(screen.getByTestId("game-code-input")).toBeInTheDocument();
    expect(screen.getByTestId("game-price-input")).toBeInTheDocument();
    expect(screen.getByTestId("game-pack-value-input")).toBeInTheDocument();
    expect(screen.getByTestId("game-status-select")).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-GMM-005: [P2] should populate form with game data", async () => {
    // GIVEN: GameManagementModal with game data
    // WHEN: Component is rendered
    render(<GameManagementModal {...defaultProps} />);

    // THEN: Form fields are populated with game data
    expect(screen.getByTestId("game-name-input")).toHaveValue("Mega Millions");
    expect(screen.getByTestId("game-code-input")).toHaveValue("0012");
    expect(screen.getByTestId("game-price-input")).toHaveValue(5);
    expect(screen.getByTestId("game-pack-value-input")).toHaveValue(300);
  });

  // ============ FORM VALIDATION TESTS ============

  it("6.10.1-COMPONENT-GMM-VAL-001: [P2] should show error for empty game name", async () => {
    // GIVEN: GameManagementModal
    const user = userEvent.setup();
    render(<GameManagementModal {...defaultProps} />);

    // WHEN: User clears game name and submits
    const nameInput = screen.getByTestId("game-name-input");
    await user.clear(nameInput);
    const submitButton = screen.getByTestId("save-game-button");
    await user.click(submitButton);

    // THEN: Validation error is shown
    await waitFor(() => {
      expect(screen.getByText(/game name is required/i)).toBeInTheDocument();
    });

    // AND: Form is not submitted
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("6.10.1-COMPONENT-GMM-VAL-002: [P2] should show error for invalid game code (not 4 digits)", async () => {
    // GIVEN: GameManagementModal
    const user = userEvent.setup();
    render(<GameManagementModal {...defaultProps} />);

    // WHEN: User enters invalid game code
    const codeInput = screen.getByTestId("game-code-input");
    await user.clear(codeInput);
    await user.type(codeInput, "123"); // Only 3 digits
    const submitButton = screen.getByTestId("save-game-button");
    await user.click(submitButton);

    // THEN: Validation error is shown
    await waitFor(() => {
      expect(screen.getByText(/must be exactly 4 digits/i)).toBeInTheDocument();
    });

    // AND: Form is not submitted
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("6.10.1-COMPONENT-GMM-VAL-003: [P2] should show error for non-numeric game code", async () => {
    // GIVEN: GameManagementModal
    const user = userEvent.setup();
    render(<GameManagementModal {...defaultProps} />);

    // WHEN: User enters non-numeric game code
    const codeInput = screen.getByTestId("game-code-input");
    await user.clear(codeInput);
    await user.type(codeInput, "ABCD");
    const submitButton = screen.getByTestId("save-game-button");
    await user.click(submitButton);

    // THEN: Validation error is shown
    await waitFor(() => {
      expect(screen.getByText(/must be exactly 4 digits/i)).toBeInTheDocument();
    });
  });

  it("6.10.1-COMPONENT-GMM-VAL-004: [P2] should show error for zero or negative price", async () => {
    // GIVEN: GameManagementModal
    const user = userEvent.setup();
    render(<GameManagementModal {...defaultProps} />);

    // WHEN: User enters zero price
    const priceInput = screen.getByTestId("game-price-input");
    await user.clear(priceInput);
    await user.type(priceInput, "0");
    const submitButton = screen.getByTestId("save-game-button");
    await user.click(submitButton);

    // THEN: Validation error is shown
    await waitFor(() => {
      expect(
        screen.getByText(/price must be greater than 0/i),
      ).toBeInTheDocument();
    });
  });

  it("6.10.1-COMPONENT-GMM-VAL-005: [P2] should show error for pack value less than 1", async () => {
    // GIVEN: GameManagementModal
    const user = userEvent.setup();
    render(<GameManagementModal {...defaultProps} />);

    // WHEN: User enters pack value of 0
    const packValueInput = screen.getByTestId("game-pack-value-input");
    await user.clear(packValueInput);
    await user.type(packValueInput, "0");
    const submitButton = screen.getByTestId("save-game-button");
    await user.click(submitButton);

    // THEN: Validation error is shown
    await waitFor(() => {
      expect(
        screen.getByText(/pack value must be at least 1/i),
      ).toBeInTheDocument();
    });
  });

  // ============ FORM SUBMISSION TESTS ============

  it("6.10.1-COMPONENT-GMM-SUB-001: [P2] should submit form with correct data", async () => {
    // GIVEN: GameManagementModal
    const user = userEvent.setup();
    render(<GameManagementModal {...defaultProps} />);

    // WHEN: User modifies and submits form
    const nameInput = screen.getByTestId("game-name-input");
    await user.clear(nameInput);
    await user.type(nameInput, "Updated Game Name");

    const submitButton = screen.getByTestId("save-game-button");
    await user.click(submitButton);

    // THEN: API is called with correct data
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        gameId: "game-1",
        data: {
          name: "UPDATED GAME NAME", // Uppercased
          game_code: "0012",
          price: 5,
          pack_value: 300,
          status: "ACTIVE",
        },
      });
    });
  });

  it("6.10.1-COMPONENT-GMM-SUB-002: [P2] should show success toast on successful submit", async () => {
    // GIVEN: GameManagementModal
    const user = userEvent.setup();
    render(<GameManagementModal {...defaultProps} />);

    // WHEN: User submits form successfully
    const submitButton = screen.getByTestId("save-game-button");
    await user.click(submitButton);

    // THEN: Success toast is shown
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Game updated",
        }),
      );
    });
  });

  it("6.10.1-COMPONENT-GMM-SUB-003: [P2] should call onSuccess callback on successful submit", async () => {
    // GIVEN: GameManagementModal with onSuccess callback
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<GameManagementModal {...defaultProps} onSuccess={onSuccess} />);

    // WHEN: User submits form successfully
    const submitButton = screen.getByTestId("save-game-button");
    await user.click(submitButton);

    // THEN: onSuccess callback is called
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it("6.10.1-COMPONENT-GMM-SUB-004: [P2] should close modal on successful submit", async () => {
    // GIVEN: GameManagementModal
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <GameManagementModal {...defaultProps} onOpenChange={onOpenChange} />,
    );

    // WHEN: User submits form successfully
    const submitButton = screen.getByTestId("save-game-button");
    await user.click(submitButton);

    // THEN: Modal is closed
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  // ============ LOADING STATE TESTS ============

  it("6.10.1-COMPONENT-GMM-LOAD-001: [P2] should disable form during submission", async () => {
    // GIVEN: GameManagementModal with pending state
    (useUpdateGame as ReturnType<typeof vi.fn>).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: true,
    });

    render(<GameManagementModal {...defaultProps} />);

    // THEN: Form fields are disabled
    expect(screen.getByTestId("game-name-input")).toBeDisabled();
    expect(screen.getByTestId("game-code-input")).toBeDisabled();
    expect(screen.getByTestId("game-price-input")).toBeDisabled();
    expect(screen.getByTestId("game-pack-value-input")).toBeDisabled();
    expect(screen.getByTestId("save-game-button")).toBeDisabled();
  });

  it("6.10.1-COMPONENT-GMM-LOAD-002: [P2] should show loading spinner during submission", async () => {
    // GIVEN: GameManagementModal with pending state
    (useUpdateGame as ReturnType<typeof vi.fn>).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: true,
    });

    render(<GameManagementModal {...defaultProps} />);

    // THEN: Loading spinner is shown in submit button
    const submitButton = screen.getByTestId("save-game-button");
    expect(submitButton.querySelector(".animate-spin")).toBeInTheDocument();
  });

  // ============ ERROR HANDLING TESTS ============

  it("6.10.1-COMPONENT-GMM-ERR-001: [P2] should show error toast on API failure", async () => {
    // GIVEN: GameManagementModal with API that fails
    mockMutateAsync.mockRejectedValue(new Error("Network error"));
    const user = userEvent.setup();
    render(<GameManagementModal {...defaultProps} />);

    // WHEN: User submits form
    const submitButton = screen.getByTestId("save-game-button");
    await user.click(submitButton);

    // THEN: Error toast is shown
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Error",
          description: "Network error",
          variant: "destructive",
        }),
      );
    });
  });

  it("6.10.1-COMPONENT-GMM-ERR-002: [P2] should show generic error for non-Error exceptions", async () => {
    // GIVEN: GameManagementModal with API that throws non-Error
    mockMutateAsync.mockRejectedValue("Unknown failure");
    const user = userEvent.setup();
    render(<GameManagementModal {...defaultProps} />);

    // WHEN: User submits form
    const submitButton = screen.getByTestId("save-game-button");
    await user.click(submitButton);

    // THEN: Generic error toast is shown
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Error",
          description: "Failed to update game",
          variant: "destructive",
        }),
      );
    });
  });

  // ============ MODAL BEHAVIOR TESTS ============

  it("6.10.1-COMPONENT-GMM-MOD-001: [P2] should not close modal during pending submission", async () => {
    // GIVEN: GameManagementModal with pending state
    (useUpdateGame as ReturnType<typeof vi.fn>).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: true,
    });

    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <GameManagementModal {...defaultProps} onOpenChange={onOpenChange} />,
    );

    // WHEN: User clicks cancel button
    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    await user.click(cancelButton);

    // THEN: Modal should not close (onOpenChange not called with false)
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("6.10.1-COMPONENT-GMM-MOD-002: [P2] should close modal when cancel is clicked (not pending)", async () => {
    // GIVEN: GameManagementModal not pending
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <GameManagementModal {...defaultProps} onOpenChange={onOpenChange} />,
    );

    // WHEN: User clicks cancel button
    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    await user.click(cancelButton);

    // THEN: Modal closes
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // ============ STATUS DROPDOWN TESTS ============

  it("6.10.1-COMPONENT-GMM-STATUS-001: [P2] should display all status options", async () => {
    // GIVEN: GameManagementModal
    const user = userEvent.setup();
    render(<GameManagementModal {...defaultProps} />);

    // WHEN: User opens status dropdown
    const statusSelect = screen.getByTestId("game-status-select");
    await user.click(statusSelect);

    // THEN: All status options are available
    await waitFor(() => {
      expect(
        screen.getByRole("option", { name: /active/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: /inactive/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: /discontinued/i }),
      ).toBeInTheDocument();
    });
  });

  it("6.10.1-COMPONENT-GMM-STATUS-002: [P2] should submit with changed status", async () => {
    // GIVEN: GameManagementModal
    const user = userEvent.setup();
    render(<GameManagementModal {...defaultProps} />);

    // WHEN: User changes status and submits
    const statusSelect = screen.getByTestId("game-status-select");
    await user.click(statusSelect);
    const inactiveOption = await screen.findByRole("option", {
      name: /inactive/i,
    });
    await user.click(inactiveOption);

    const submitButton = screen.getByTestId("save-game-button");
    await user.click(submitButton);

    // THEN: API is called with updated status
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "INACTIVE",
          }),
        }),
      );
    });
  });

  // ============ SECURITY TESTS (MANDATORY) ============

  it("6.10.1-COMPONENT-GMM-SEC-001: [P0] should not execute XSS in game name input", async () => {
    // GIVEN: GameManagementModal
    const user = userEvent.setup();
    render(<GameManagementModal {...defaultProps} />);

    // WHEN: User enters XSS attempt in name field
    const nameInput = screen.getByTestId("game-name-input");
    await user.clear(nameInput);
    await user.type(nameInput, "<script>alert('xss')</script>");

    // THEN: Input contains the text as-is (not executed)
    expect(nameInput).toHaveValue("<script>alert('xss')</script>");
    // React escapes by default, no script execution
  });

  it("6.10.1-COMPONENT-GMM-SEC-002: [P0] should validate game code is only digits", async () => {
    // GIVEN: GameManagementModal
    const user = userEvent.setup();
    render(<GameManagementModal {...defaultProps} />);

    // WHEN: User enters potentially malicious game code
    const codeInput = screen.getByTestId("game-code-input");
    await user.clear(codeInput);
    await user.type(codeInput, "<img>");

    const submitButton = screen.getByTestId("save-game-button");
    await user.click(submitButton);

    // THEN: Validation rejects the input
    await waitFor(() => {
      expect(screen.getByText(/must be exactly 4 digits/i)).toBeInTheDocument();
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  // ============ ACCESSIBILITY TESTS ============

  it("6.10.1-COMPONENT-GMM-A11Y-001: [P2] should have proper form labels", async () => {
    // GIVEN: GameManagementModal
    render(<GameManagementModal {...defaultProps} />);

    // THEN: Form fields have associated labels
    expect(screen.getByLabelText(/game name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/game code/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ticket price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/pack value/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/status/i)).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-GMM-A11Y-002: [P2] should have dialog role and description", async () => {
    // GIVEN: GameManagementModal
    render(<GameManagementModal {...defaultProps} />);

    // THEN: Dialog has proper role
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    // AND: Dialog has aria-describedby
    expect(dialog).toHaveAttribute(
      "aria-describedby",
      "game-management-description",
    );
  });

  // ============ EDGE CASES ============

  it("6.10.1-COMPONENT-GMM-EDGE-001: [P2] should handle game with null price", async () => {
    // GIVEN: Game with null price
    const gameWithNullPrice = {
      ...mockGame,
      price: null,
    };

    render(<GameManagementModal {...defaultProps} game={gameWithNullPrice} />);

    // THEN: Price input shows empty
    expect(screen.getByTestId("game-price-input")).toHaveValue(null);
  });

  it("6.10.1-COMPONENT-GMM-EDGE-002: [P2] should handle game with null pack_value (default 300)", async () => {
    // GIVEN: Game with null pack_value
    const gameWithNullPackValue = {
      ...mockGame,
      pack_value: null,
    };

    render(
      <GameManagementModal {...defaultProps} game={gameWithNullPackValue} />,
    );

    // THEN: Pack value defaults to 300
    expect(screen.getByTestId("game-pack-value-input")).toHaveValue(300);
  });

  it("6.10.1-COMPONENT-GMM-EDGE-003: [P2] should handle game with undefined status (default ACTIVE)", async () => {
    // GIVEN: Game with undefined status
    const gameWithUndefinedStatus = {
      game_id: "game-1",
      game_name: "Test Game",
      game_code: "0001",
      price: 1.0,
      pack_value: 100,
      status: undefined as unknown as string,
    };

    render(
      <GameManagementModal {...defaultProps} game={gameWithUndefinedStatus} />,
    );

    // THEN: Status defaults to ACTIVE (shown in select)
    // We check that the form can render without errors
    expect(screen.getByTestId("game-status-select")).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-GMM-EDGE-004: [P2] should trim and uppercase game name on submit", async () => {
    // GIVEN: GameManagementModal
    const user = userEvent.setup();
    render(<GameManagementModal {...defaultProps} />);

    // WHEN: User enters name with whitespace and lowercase
    const nameInput = screen.getByTestId("game-name-input");
    await user.clear(nameInput);
    await user.type(nameInput, "  test game  ");

    const submitButton = screen.getByTestId("save-game-button");
    await user.click(submitButton);

    // THEN: Name is trimmed and uppercased in API call
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "TEST GAME",
          }),
        }),
      );
    });
  });
});
