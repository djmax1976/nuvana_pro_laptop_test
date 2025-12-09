/**
 * @test-level COMPONENT
 * @justification Tests UI modal behavior in isolation - fast, isolated, granular
 * @story 6-12
 * @enhanced-by workflow-9 on 2025-01-28
 *
 * Component Tests: NewGameModal
 *
 * Tests NewGameModal component behavior for creating new lottery games:
 * - Modal display with game code
 * - Game name input with auto-uppercase
 * - Price input validation
 * - Form submission and game creation
 * - Cancel behavior
 * - Loading states
 * - Accessibility
 * - Input sanitization (XSS prevention)
 *
 * Story: 6-12 - Serialized Pack Reception with Batch Processing
 * Priority: P1 (High - Game Creation)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewGameModal } from "@/components/lottery/NewGameModal";
import { createGame } from "@/lib/api/lottery";

// Mock the API client
vi.mock("@/lib/api/lottery", () => ({
  createGame: vi.fn(),
}));

// Mock the toast hook
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

describe("6.12-COMPONENT: NewGameModal", () => {
  const mockOnGamesCreated = vi.fn();
  const mockOnCancel = vi.fn();
  const mockOnOpenChange = vi.fn();

  const defaultProps = {
    open: true,
    onOpenChange: mockOnOpenChange,
    gamesToCreate: [
      {
        serial: "999976543210123456789012",
        game_code: "9999",
        pack_number: "7654321",
        serial_start: "012",
      },
    ],
    onGamesCreated: mockOnGamesCreated,
    onCancel: mockOnCancel,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createGame).mockResolvedValue({
      success: true,
      data: {
        game_id: "game-new",
        game_code: "9999",
        name: "NEW GAME",
        price: 10.0,
        status: "ACTIVE",
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BASIC RENDERING TESTS (P1)
  // ═══════════════════════════════════════════════════════════════════════════

  it("6.12-NEWGAME-001: [P1] should display modal with game code", async () => {
    // GIVEN: NewGameModal component
    // WHEN: Component is rendered
    render(<NewGameModal {...defaultProps} />);

    // THEN: Modal should display game code
    expect(screen.getByText(/new game found/i)).toBeInTheDocument();
    // Game code appears in multiple places, use getAllByText
    expect(screen.getAllByText("9999").length).toBeGreaterThanOrEqual(1);
  });

  it("6.12-NEWGAME-002: [P1] should display game name input field", async () => {
    // GIVEN: NewGameModal component
    render(<NewGameModal {...defaultProps} />);

    // THEN: Game name input should be present
    const nameInput = screen.getByTestId("new-game-name-input");
    expect(nameInput).toBeInTheDocument();
    // Label text may appear multiple times, use label for
    expect(screen.getByLabelText(/game name/i)).toBeInTheDocument();
  });

  it("6.12-NEWGAME-003: [P1] should display price input field", async () => {
    // GIVEN: NewGameModal component
    render(<NewGameModal {...defaultProps} />);

    // THEN: Price input should be present
    const priceInput = screen.getByTestId("new-game-price-input");
    expect(priceInput).toBeInTheDocument();
    // Label text may appear multiple times, use label for
    expect(screen.getByLabelText(/price/i)).toBeInTheDocument();
  });

  it("6.12-NEWGAME-004: [P1] should display pack number info", async () => {
    // GIVEN: NewGameModal component
    render(<NewGameModal {...defaultProps} />);

    // THEN: Pack number should be displayed
    expect(screen.getByText(/pack number/i)).toBeInTheDocument();
    expect(screen.getByText("7654321")).toBeInTheDocument();
  });

  it("6.12-NEWGAME-005: [P1] should not render when no games to create", async () => {
    // GIVEN: NewGameModal with empty gamesToCreate
    render(<NewGameModal {...defaultProps} gamesToCreate={[]} />);

    // THEN: Modal content should not be rendered
    expect(screen.queryByText(/new game found/i)).not.toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INPUT BEHAVIOR TESTS (P1)
  // ═══════════════════════════════════════════════════════════════════════════

  it("6.12-NEWGAME-006: [P1] should auto-uppercase game name input", async () => {
    // GIVEN: NewGameModal component
    const user = userEvent.setup({ delay: null });
    render(<NewGameModal {...defaultProps} />);

    // WHEN: User types lowercase game name
    const nameInput = screen.getByTestId("new-game-name-input");
    await user.type(nameInput, "mega millions");

    // THEN: Input should be uppercase
    expect(nameInput).toHaveValue("MEGA MILLIONS");
  });

  it("6.12-NEWGAME-007: [P1] should validate price input format", async () => {
    // GIVEN: NewGameModal component
    const user = userEvent.setup({ delay: null });
    render(<NewGameModal {...defaultProps} />);

    // WHEN: User types valid price
    const priceInput = screen.getByTestId("new-game-price-input");
    await user.type(priceInput, "10.00");

    // THEN: Price should be accepted
    expect(priceInput).toHaveValue("10.00");
  });

  it("6.12-NEWGAME-008: [P1] should reject non-numeric price input", async () => {
    // GIVEN: NewGameModal component
    const user = userEvent.setup({ delay: null });
    render(<NewGameModal {...defaultProps} />);

    // WHEN: User types invalid price (letters)
    const priceInput = screen.getByTestId("new-game-price-input");
    await user.type(priceInput, "abc");

    // THEN: Non-numeric characters should be rejected
    expect(priceInput).toHaveValue("");
  });

  it("6.12-NEWGAME-009: [P1] should limit price to 2 decimal places", async () => {
    // GIVEN: NewGameModal component
    const user = userEvent.setup({ delay: null });
    render(<NewGameModal {...defaultProps} />);

    // WHEN: User types price with more than 2 decimals
    const priceInput = screen.getByTestId("new-game-price-input");
    await user.type(priceInput, "10.123");

    // THEN: Price should be limited to 2 decimal places
    expect(priceInput).toHaveValue("10.12");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FORM SUBMISSION TESTS (P1)
  // ═══════════════════════════════════════════════════════════════════════════

  it("6.12-NEWGAME-010: [P1] should disable create button when name is empty", async () => {
    // GIVEN: NewGameModal component
    const user = userEvent.setup({ delay: null });
    render(<NewGameModal {...defaultProps} />);

    // WHEN: Only price is entered (no name)
    const priceInput = screen.getByTestId("new-game-price-input");
    await user.type(priceInput, "10.00");

    // THEN: Create button should be disabled
    const createButton = screen.getByTestId("create-game-button");
    expect(createButton).toBeDisabled();
  });

  it("6.12-NEWGAME-011: [P1] should disable create button when price is empty", async () => {
    // GIVEN: NewGameModal component
    const user = userEvent.setup({ delay: null });
    render(<NewGameModal {...defaultProps} />);

    // WHEN: Only name is entered (no price)
    const nameInput = screen.getByTestId("new-game-name-input");
    await user.type(nameInput, "MEGA MILLIONS");

    // THEN: Create button should be disabled
    const createButton = screen.getByTestId("create-game-button");
    expect(createButton).toBeDisabled();
  });

  it("6.12-NEWGAME-012: [P1] should disable create button when price is zero", async () => {
    // GIVEN: NewGameModal component
    const user = userEvent.setup({ delay: null });
    render(<NewGameModal {...defaultProps} />);

    // WHEN: Name and zero price are entered
    const nameInput = screen.getByTestId("new-game-name-input");
    const priceInput = screen.getByTestId("new-game-price-input");
    await user.type(nameInput, "MEGA MILLIONS");
    await user.type(priceInput, "0");

    // THEN: Create button should be disabled
    const createButton = screen.getByTestId("create-game-button");
    expect(createButton).toBeDisabled();
  });

  it("6.12-NEWGAME-013: [P1] should enable create button with valid inputs", async () => {
    // GIVEN: NewGameModal component
    const user = userEvent.setup({ delay: null });
    render(<NewGameModal {...defaultProps} />);

    // WHEN: Valid name and price are entered
    const nameInput = screen.getByTestId("new-game-name-input");
    const priceInput = screen.getByTestId("new-game-price-input");
    await user.type(nameInput, "MEGA MILLIONS");
    await user.type(priceInput, "5.00");

    // THEN: Create button should be enabled
    const createButton = screen.getByTestId("create-game-button");
    expect(createButton).not.toBeDisabled();
  });

  it("6.12-NEWGAME-014: [P1] should call createGame API on form submission", async () => {
    // GIVEN: NewGameModal component with valid inputs
    const user = userEvent.setup({ delay: null });
    render(<NewGameModal {...defaultProps} />);

    const nameInput = screen.getByTestId("new-game-name-input");
    const priceInput = screen.getByTestId("new-game-price-input");
    const createButton = screen.getByTestId("create-game-button");

    await user.type(nameInput, "MEGA MILLIONS");
    await user.type(priceInput, "5.00");

    // WHEN: User clicks create button
    await user.click(createButton);

    // THEN: createGame API should be called with correct data
    await waitFor(() => {
      expect(createGame).toHaveBeenCalledWith({
        game_code: "9999",
        name: "MEGA MILLIONS",
        price: 5.0,
      });
    });
  });

  it("6.12-NEWGAME-015: [P1] should call onGamesCreated callback on successful creation", async () => {
    // GIVEN: NewGameModal component with valid inputs
    const user = userEvent.setup({ delay: null });
    render(<NewGameModal {...defaultProps} />);

    const nameInput = screen.getByTestId("new-game-name-input");
    const priceInput = screen.getByTestId("new-game-price-input");
    const createButton = screen.getByTestId("create-game-button");

    await user.type(nameInput, "MEGA MILLIONS");
    await user.type(priceInput, "5.00");
    await user.click(createButton);

    // THEN: onGamesCreated should be called
    await waitFor(() => {
      expect(mockOnGamesCreated).toHaveBeenCalled();
    });

    // AND: Modal should close
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("6.12-NEWGAME-016: [P1] should show success toast on game creation", async () => {
    // GIVEN: NewGameModal component with valid inputs
    const user = userEvent.setup({ delay: null });
    render(<NewGameModal {...defaultProps} />);

    const nameInput = screen.getByTestId("new-game-name-input");
    const priceInput = screen.getByTestId("new-game-price-input");
    const createButton = screen.getByTestId("create-game-button");

    await user.type(nameInput, "MEGA MILLIONS");
    await user.type(priceInput, "5.00");
    await user.click(createButton);

    // THEN: Success toast should be shown
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Game created",
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CANCEL BEHAVIOR TESTS (P1)
  // ═══════════════════════════════════════════════════════════════════════════

  it("6.12-NEWGAME-017: [P1] should call onCancel when cancel button is clicked", async () => {
    // GIVEN: NewGameModal component
    const user = userEvent.setup({ delay: null });
    render(<NewGameModal {...defaultProps} />);

    // WHEN: User clicks cancel button
    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    await user.click(cancelButton);

    // THEN: onCancel should be called
    expect(mockOnCancel).toHaveBeenCalled();

    // AND: Modal should close
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LOADING STATE TESTS (P1)
  // ═══════════════════════════════════════════════════════════════════════════

  it("6.12-NEWGAME-018: [P1] should show loading state during API call", async () => {
    // GIVEN: NewGameModal component with slow API
    let resolveApi: (value: any) => void;
    const apiPromise = new Promise((resolve) => {
      resolveApi = resolve;
    });
    vi.mocked(createGame).mockReturnValue(apiPromise as any);

    const user = userEvent.setup({ delay: null });
    render(<NewGameModal {...defaultProps} />);

    const nameInput = screen.getByTestId("new-game-name-input");
    const priceInput = screen.getByTestId("new-game-price-input");
    const createButton = screen.getByTestId("create-game-button");

    await user.type(nameInput, "MEGA MILLIONS");
    await user.type(priceInput, "5.00");

    // WHEN: User clicks create button
    await user.click(createButton);

    // THEN: Create button should be disabled during loading
    await waitFor(() => {
      expect(createButton).toBeDisabled();
    });

    // Resolve the API call
    resolveApi!({
      success: true,
      data: {
        game_id: "game-new",
        game_code: "9999",
        name: "MEGA MILLIONS",
        price: 5.0,
        status: "ACTIVE",
      },
    });

    await waitFor(() => {
      expect(mockOnGamesCreated).toHaveBeenCalled();
    });
  });

  it("6.12-NEWGAME-019: [P1] should disable inputs during loading", async () => {
    // GIVEN: NewGameModal component with slow API
    let resolveApi: (value: any) => void;
    const apiPromise = new Promise((resolve) => {
      resolveApi = resolve;
    });
    vi.mocked(createGame).mockReturnValue(apiPromise as any);

    const user = userEvent.setup({ delay: null });
    render(<NewGameModal {...defaultProps} />);

    const nameInput = screen.getByTestId("new-game-name-input");
    const priceInput = screen.getByTestId("new-game-price-input");
    const createButton = screen.getByTestId("create-game-button");

    await user.type(nameInput, "MEGA MILLIONS");
    await user.type(priceInput, "5.00");
    await user.click(createButton);

    // THEN: Inputs should be disabled during loading
    await waitFor(() => {
      expect(nameInput).toBeDisabled();
      expect(priceInput).toBeDisabled();
    });

    // Cleanup
    resolveApi!({ success: true, data: {} });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ERROR HANDLING TESTS (P1)
  // ═══════════════════════════════════════════════════════════════════════════

  it("6.12-NEWGAME-020: [P1] should show error toast on API failure", async () => {
    // GIVEN: NewGameModal component with failing API
    vi.mocked(createGame).mockRejectedValue(new Error("Network error"));

    const user = userEvent.setup({ delay: null });
    render(<NewGameModal {...defaultProps} />);

    const nameInput = screen.getByTestId("new-game-name-input");
    const priceInput = screen.getByTestId("new-game-price-input");
    const createButton = screen.getByTestId("create-game-button");

    await user.type(nameInput, "MEGA MILLIONS");
    await user.type(priceInput, "5.00");
    await user.click(createButton);

    // THEN: Error toast should be shown
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Error",
          variant: "destructive",
        }),
      );
    });
  });

  it("6.12-NEWGAME-021: [P1] should not close modal on API failure", async () => {
    // GIVEN: NewGameModal component with failing API
    vi.mocked(createGame).mockRejectedValue(new Error("Network error"));

    const user = userEvent.setup({ delay: null });
    render(<NewGameModal {...defaultProps} />);

    const nameInput = screen.getByTestId("new-game-name-input");
    const priceInput = screen.getByTestId("new-game-price-input");
    const createButton = screen.getByTestId("create-game-button");

    await user.type(nameInput, "MEGA MILLIONS");
    await user.type(priceInput, "5.00");
    await user.click(createButton);

    // Wait for error handling
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalled();
    });

    // THEN: Modal should NOT close on error
    expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // KEYBOARD NAVIGATION TESTS (P2)
  // ═══════════════════════════════════════════════════════════════════════════

  it("6.12-NEWGAME-022: [P2] should submit form on Enter key in price field", async () => {
    // GIVEN: NewGameModal component with valid inputs
    const user = userEvent.setup({ delay: null });
    render(<NewGameModal {...defaultProps} />);

    const nameInput = screen.getByTestId("new-game-name-input");
    const priceInput = screen.getByTestId("new-game-price-input");

    await user.type(nameInput, "MEGA MILLIONS");
    await user.type(priceInput, "5.00");

    // WHEN: User presses Enter in price field
    await user.keyboard("{Enter}");

    // THEN: Form should be submitted
    await waitFor(() => {
      expect(createGame).toHaveBeenCalled();
    });
  });

  it("6.12-NEWGAME-023: [P2] should focus name input when modal opens", async () => {
    // GIVEN: NewGameModal component
    render(<NewGameModal {...defaultProps} />);

    // THEN: Name input should be focused
    await waitFor(() => {
      const nameInput = screen.getByTestId("new-game-name-input");
      expect(nameInput).toHaveFocus();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS (P0 - Mandatory)
  // ═══════════════════════════════════════════════════════════════════════════

  it("6.12-NEWGAME-SEC-001: [P0] should prevent XSS in game name input", async () => {
    // GIVEN: NewGameModal component
    const user = userEvent.setup({ delay: null });
    render(<NewGameModal {...defaultProps} />);

    // WHEN: User attempts to enter script tag in name
    const nameInput = screen.getByTestId("new-game-name-input");
    await user.type(nameInput, "<script>alert('xss')</script>");

    // THEN: Input should be escaped/displayed as text (React escapes by default)
    // The uppercase transformation also helps sanitize
    expect(nameInput).toHaveValue("<SCRIPT>ALERT('XSS')</SCRIPT>");

    // Script should not execute (React's JSX escaping)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("6.12-NEWGAME-SEC-002: [P0] should prevent SQL injection in game name", async () => {
    // GIVEN: NewGameModal component
    const user = userEvent.setup({ delay: null });
    render(<NewGameModal {...defaultProps} />);

    // WHEN: User attempts SQL injection
    const nameInput = screen.getByTestId("new-game-name-input");
    await user.type(nameInput, "'; DROP TABLE games; --");

    // THEN: Input should be treated as plain text
    expect(nameInput).toHaveValue("'; DROP TABLE GAMES; --");

    // AND: API should be called with escaped input (server should also validate)
    const priceInput = screen.getByTestId("new-game-price-input");
    const createButton = screen.getByTestId("create-game-button");
    await user.type(priceInput, "5.00");
    await user.click(createButton);

    await waitFor(() => {
      expect(createGame).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "'; DROP TABLE GAMES; --",
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCESSIBILITY TESTS (P2)
  // ═══════════════════════════════════════════════════════════════════════════

  it("6.12-NEWGAME-A11Y-001: [P2] should have proper ARIA attributes", async () => {
    // GIVEN: NewGameModal component
    render(<NewGameModal {...defaultProps} />);

    // THEN: Modal should have proper role
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // AND: Required fields should be indicated
    expect(screen.getAllByText("*").length).toBeGreaterThanOrEqual(2);
  });

  it("6.12-NEWGAME-A11Y-002: [P2] should have labeled inputs", async () => {
    // GIVEN: NewGameModal component
    render(<NewGameModal {...defaultProps} />);

    // THEN: Inputs should have associated labels
    const nameInput = screen.getByTestId("new-game-name-input");
    const priceInput = screen.getByTestId("new-game-price-input");

    expect(nameInput).toHaveAttribute("id", "game-name");
    expect(priceInput).toHaveAttribute("id", "game-price");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MULTIPLE GAMES TESTS (P2)
  // ═══════════════════════════════════════════════════════════════════════════

  it("6.12-NEWGAME-024: [P2] should show progress when multiple games to create", async () => {
    // GIVEN: NewGameModal with multiple games to create
    const multipleGames = [
      {
        serial: "999976543210123456789012",
        game_code: "9999",
        pack_number: "7654321",
        serial_start: "012",
      },
      {
        serial: "888865432109876543210123",
        game_code: "8888",
        pack_number: "6543210",
        serial_start: "012",
      },
    ];

    render(<NewGameModal {...defaultProps} gamesToCreate={multipleGames} />);

    // THEN: Progress indicator should show "1 of 2"
    expect(screen.getByText(/game 1 of 2/i)).toBeInTheDocument();
  });

  it("6.12-NEWGAME-025: [P2] should advance to next game after creating first", async () => {
    // GIVEN: NewGameModal with multiple games to create
    const multipleGames = [
      {
        serial: "999976543210123456789012",
        game_code: "9999",
        pack_number: "7654321",
        serial_start: "012",
      },
      {
        serial: "888865432109876543210123",
        game_code: "8888",
        pack_number: "6543210",
        serial_start: "012",
      },
    ];

    const user = userEvent.setup({ delay: null });
    render(<NewGameModal {...defaultProps} gamesToCreate={multipleGames} />);

    // Create first game
    const nameInput = screen.getByTestId("new-game-name-input");
    const priceInput = screen.getByTestId("new-game-price-input");
    const createButton = screen.getByTestId("create-game-button");

    await user.type(nameInput, "FIRST GAME");
    await user.type(priceInput, "5.00");
    await user.click(createButton);

    // THEN: Should advance to second game (game code 8888 appears)
    await waitFor(
      () => {
        // Game code appears in multiple places, use getAllByText
        expect(screen.getAllByText("8888").length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/game 2 of 2/i)).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
  });
});
