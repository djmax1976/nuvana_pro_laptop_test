/**
 * @test-level COMPONENT
 * @justification Tests UI modal behavior in isolation - fast, isolated, granular
 * @story 6-12
 * @enhanced-by workflow-9 on 2025-01-28
 * @enhanced-by cipher on 2025-12-15 - Updated for dropdown-based price/pack_value selection
 *
 * Component Tests: NewGameModal
 *
 * Tests NewGameModal component behavior for creating new lottery games:
 * - Modal display with game code
 * - Game name input with auto-uppercase
 * - Dropdown selection for ticket price and pack value
 * - Dynamic total tickets calculation display
 * - Form submission and game creation
 * - Cancel behavior
 * - Loading states
 * - Accessibility
 * - Input sanitization (XSS prevention)
 *
 * Story: 6-12 - Serialized Pack Reception with Batch Processing
 * Story: 6.x - Lottery Configuration Values Enhancement
 * Priority: P1 (High - Game Creation)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewGameModal } from "@/components/lottery/NewGameModal";
import { createGame, getLotteryConfigValues } from "@/lib/api/lottery";

// Mock the API client
vi.mock("@/lib/api/lottery", () => ({
  createGame: vi.fn(),
  getLotteryConfigValues: vi.fn(),
}));

// Mock config values for dropdowns
const mockConfigValues = {
  ticket_prices: [
    { config_value_id: "price-1", amount: 1, display_order: 1 },
    { config_value_id: "price-2", amount: 2, display_order: 2 },
    { config_value_id: "price-5", amount: 5, display_order: 3 },
    { config_value_id: "price-10", amount: 10, display_order: 4 },
    { config_value_id: "price-20", amount: 20, display_order: 5 },
  ],
  pack_values: [
    { config_value_id: "pack-150", amount: 150, display_order: 1 },
    { config_value_id: "pack-300", amount: 300, display_order: 2 },
    { config_value_id: "pack-500", amount: 500, display_order: 3 },
    { config_value_id: "pack-600", amount: 600, display_order: 4 },
  ],
};

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
    storeId: "test-store-id-123",
    onGamesCreated: mockOnGamesCreated,
    onCancel: mockOnCancel,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock config values API - always return success
    vi.mocked(getLotteryConfigValues).mockResolvedValue({
      success: true,
      data: mockConfigValues,
    });

    // Mock createGame API - return success with pack_value and total_tickets
    vi.mocked(createGame).mockResolvedValue({
      success: true,
      data: {
        game_id: "game-new",
        game_code: "9999",
        name: "NEW GAME",
        price: 5.0,
        pack_value: 300,
        total_tickets: 60,
        status: "ACTIVE",
        scope_type: "STATE",
        state_id: "state-123",
        store_id: null,
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

    // Wait for config to load first
    await waitFor(() => {
      expect(screen.getByTestId("new-game-name-input")).toBeInTheDocument();
    });

    // THEN: Game name input should be present and accessible
    const nameInput = screen.getByTestId("new-game-name-input");
    expect(nameInput).toBeInTheDocument();
    expect(nameInput).toHaveAttribute("id", "game-name");
  });

  it("6.12-NEWGAME-003: [P1] should display price dropdown field", async () => {
    // GIVEN: NewGameModal component
    render(<NewGameModal {...defaultProps} />);

    // THEN: Price dropdown should be present after config loads
    await waitFor(() => {
      const priceSelect = screen.getByTestId("new-game-price-select");
      expect(priceSelect).toBeInTheDocument();
    });
    // Check for price dropdown by its id attribute
    const priceSelect = screen.getByTestId("new-game-price-select");
    expect(priceSelect).toHaveAttribute("id", "game-price");
  });

  it("6.12-NEWGAME-003b: [P1] should display pack value dropdown field", async () => {
    // GIVEN: NewGameModal component
    render(<NewGameModal {...defaultProps} />);

    // THEN: Pack value dropdown should be present after config loads
    await waitFor(() => {
      const packValueSelect = screen.getByTestId("new-game-pack-value-select");
      expect(packValueSelect).toBeInTheDocument();
    });
    // Check for label using htmlFor since "pack value" appears in multiple places
    expect(screen.getByLabelText(/pack value/i)).toBeInTheDocument();
  });

  it("6.12-NEWGAME-004: [P1] should display pack number info", async () => {
    // GIVEN: NewGameModal component
    render(<NewGameModal {...defaultProps} />);

    // THEN: Pack number should be displayed after config loads
    await waitFor(() => {
      expect(screen.getByText(/pack number/i)).toBeInTheDocument();
    });
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

    // Wait for config to load
    await waitFor(() => {
      expect(screen.getByTestId("new-game-name-input")).toBeInTheDocument();
    });

    // WHEN: User types lowercase game name
    const nameInput = screen.getByTestId("new-game-name-input");
    await user.type(nameInput, "mega millions");

    // THEN: Input should be uppercase
    expect(nameInput).toHaveValue("MEGA MILLIONS");
  });

  it("6.12-NEWGAME-007: [P1] should display total tickets when price and pack value selected", async () => {
    // GIVEN: NewGameModal component with dropdowns
    const user = userEvent.setup({ delay: null });
    render(<NewGameModal {...defaultProps} />);

    // Wait for config to load
    await waitFor(() => {
      expect(screen.getByTestId("new-game-price-select")).toBeInTheDocument();
    });

    // WHEN: User selects price ($5) and pack value ($300)
    const priceSelect = screen.getByTestId("new-game-price-select");
    await user.click(priceSelect);
    await user.click(screen.getByRole("option", { name: "$5.00" }));

    const packValueSelect = screen.getByTestId("new-game-pack-value-select");
    await user.click(packValueSelect);
    await user.click(screen.getByRole("option", { name: "$300.00" }));

    // THEN: Total tickets should be displayed (300 / 5 = 60)
    await waitFor(() => {
      expect(screen.getByText("60")).toBeInTheDocument();
      expect(screen.getByText(/total tickets/i)).toBeInTheDocument();
    });
  });

  it("6.12-NEWGAME-008: [P1] should show error for non-divisible pack value", async () => {
    // GIVEN: NewGameModal component with dropdowns
    const user = userEvent.setup({ delay: null });

    // Mock config with non-divisible combination available
    vi.mocked(getLotteryConfigValues).mockResolvedValue({
      success: true,
      data: {
        ticket_prices: [
          { config_value_id: "price-3", amount: 3, display_order: 1 },
        ],
        pack_values: [
          { config_value_id: "pack-100", amount: 100, display_order: 1 },
        ],
      },
    });

    render(<NewGameModal {...defaultProps} />);

    // Wait for config to load
    await waitFor(() => {
      expect(screen.getByTestId("new-game-price-select")).toBeInTheDocument();
    });

    // WHEN: User selects price ($3) and pack value ($100) - 100/3 = 33.33 (not whole)
    const priceSelect = screen.getByTestId("new-game-price-select");
    await user.click(priceSelect);
    await user.click(screen.getByRole("option", { name: "$3.00" }));

    const packValueSelect = screen.getByTestId("new-game-pack-value-select");
    await user.click(packValueSelect);
    await user.click(screen.getByRole("option", { name: "$100.00" }));

    // THEN: Error message should be displayed
    await waitFor(() => {
      expect(
        screen.getByText(/pack value must be evenly divisible/i),
      ).toBeInTheDocument();
    });
  });

  it("6.12-NEWGAME-009: [P1] should show loading state while fetching config", async () => {
    // GIVEN: NewGameModal component with slow config API
    let resolveConfig: (value: any) => void;
    const configPromise = new Promise((resolve) => {
      resolveConfig = resolve;
    });
    vi.mocked(getLotteryConfigValues).mockReturnValue(configPromise as any);

    render(<NewGameModal {...defaultProps} />);

    // THEN: Loading state should be visible
    expect(screen.getByText(/loading configuration/i)).toBeInTheDocument();

    // Cleanup
    resolveConfig!({ success: true, data: mockConfigValues });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FORM SUBMISSION TESTS (P1)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Helper function to select dropdown values
   */
  const selectDropdownValues = async (
    user: ReturnType<typeof userEvent.setup>,
    priceAmount?: string,
    packValueAmount?: string,
  ) => {
    if (priceAmount) {
      const priceSelect = screen.getByTestId("new-game-price-select");
      await user.click(priceSelect);
      await user.click(screen.getByRole("option", { name: priceAmount }));
    }

    if (packValueAmount) {
      const packValueSelect = screen.getByTestId("new-game-pack-value-select");
      await user.click(packValueSelect);
      await user.click(screen.getByRole("option", { name: packValueAmount }));
    }
  };

  it("6.12-NEWGAME-010: [P1] should disable create button when name is empty", async () => {
    // GIVEN: NewGameModal component
    const user = userEvent.setup({ delay: null });
    render(<NewGameModal {...defaultProps} />);

    // Wait for config to load
    await waitFor(() => {
      expect(screen.getByTestId("new-game-price-select")).toBeInTheDocument();
    });

    // WHEN: Only price and pack value are selected (no name)
    await selectDropdownValues(user, "$5.00", "$300.00");

    // THEN: Create button should be disabled
    const createButton = screen.getByTestId("create-game-button");
    expect(createButton).toBeDisabled();
  });

  it("6.12-NEWGAME-011: [P1] should disable create button when price is not selected", async () => {
    // GIVEN: NewGameModal component
    const user = userEvent.setup({ delay: null });
    render(<NewGameModal {...defaultProps} />);

    // Wait for config to load
    await waitFor(() => {
      expect(screen.getByTestId("new-game-name-input")).toBeInTheDocument();
    });

    // WHEN: Only name and pack value are entered (no price)
    const nameInput = screen.getByTestId("new-game-name-input");
    await user.type(nameInput, "MEGA MILLIONS");
    await selectDropdownValues(user, undefined, "$300.00");

    // THEN: Create button should be disabled
    const createButton = screen.getByTestId("create-game-button");
    expect(createButton).toBeDisabled();
  });

  it("6.12-NEWGAME-012: [P1] should disable create button when pack value is not selected", async () => {
    // GIVEN: NewGameModal component
    const user = userEvent.setup({ delay: null });
    render(<NewGameModal {...defaultProps} />);

    // Wait for config to load
    await waitFor(() => {
      expect(screen.getByTestId("new-game-name-input")).toBeInTheDocument();
    });

    // WHEN: Name and price are entered, but no pack value
    const nameInput = screen.getByTestId("new-game-name-input");
    await user.type(nameInput, "MEGA MILLIONS");
    await selectDropdownValues(user, "$5.00", undefined);

    // THEN: Create button should be disabled
    const createButton = screen.getByTestId("create-game-button");
    expect(createButton).toBeDisabled();
  });

  it("6.12-NEWGAME-013: [P1] should enable create button with valid inputs", async () => {
    // GIVEN: NewGameModal component
    const user = userEvent.setup({ delay: null });
    render(<NewGameModal {...defaultProps} />);

    // Wait for config to load
    await waitFor(() => {
      expect(screen.getByTestId("new-game-name-input")).toBeInTheDocument();
    });

    // WHEN: Valid name, price, and pack value are selected
    const nameInput = screen.getByTestId("new-game-name-input");
    await user.type(nameInput, "MEGA MILLIONS");
    await selectDropdownValues(user, "$5.00", "$300.00");

    // THEN: Create button should be enabled
    const createButton = screen.getByTestId("create-game-button");
    expect(createButton).not.toBeDisabled();
  });

  it("6.12-NEWGAME-014: [P1] should call createGame API on form submission with pack_value", async () => {
    // GIVEN: NewGameModal component with valid inputs
    const user = userEvent.setup({ delay: null });
    render(<NewGameModal {...defaultProps} />);

    // Wait for config to load
    await waitFor(() => {
      expect(screen.getByTestId("new-game-name-input")).toBeInTheDocument();
    });

    const nameInput = screen.getByTestId("new-game-name-input");
    await user.type(nameInput, "MEGA MILLIONS");
    await selectDropdownValues(user, "$5.00", "$300.00");

    // WHEN: User clicks create button
    const createButton = screen.getByTestId("create-game-button");
    await user.click(createButton);

    // THEN: createGame API should be called with correct data including pack_value and store_id
    await waitFor(() => {
      expect(createGame).toHaveBeenCalledWith({
        game_code: "9999",
        name: "MEGA MILLIONS",
        price: 5.0,
        pack_value: 300,
        store_id: "test-store-id-123",
      });
    });
  });

  it("6.12-NEWGAME-015: [P1] should call onGamesCreated callback on successful creation", async () => {
    // GIVEN: NewGameModal component with valid inputs
    const user = userEvent.setup({ delay: null });
    render(<NewGameModal {...defaultProps} />);

    // Wait for config to load
    await waitFor(() => {
      expect(screen.getByTestId("new-game-name-input")).toBeInTheDocument();
    });

    const nameInput = screen.getByTestId("new-game-name-input");
    await user.type(nameInput, "MEGA MILLIONS");
    await selectDropdownValues(user, "$5.00", "$300.00");

    const createButton = screen.getByTestId("create-game-button");
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

    // Wait for config to load
    await waitFor(() => {
      expect(screen.getByTestId("new-game-name-input")).toBeInTheDocument();
    });

    const nameInput = screen.getByTestId("new-game-name-input");
    await user.type(nameInput, "MEGA MILLIONS");
    await selectDropdownValues(user, "$5.00", "$300.00");

    const createButton = screen.getByTestId("create-game-button");
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

    // Wait for config to load
    await waitFor(() => {
      expect(screen.getByTestId("new-game-name-input")).toBeInTheDocument();
    });

    const nameInput = screen.getByTestId("new-game-name-input");
    await user.type(nameInput, "MEGA MILLIONS");
    await selectDropdownValues(user, "$5.00", "$300.00");

    const createButton = screen.getByTestId("create-game-button");

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
        pack_value: 300,
        total_tickets: 60,
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

    // Wait for config to load
    await waitFor(() => {
      expect(screen.getByTestId("new-game-name-input")).toBeInTheDocument();
    });

    const nameInput = screen.getByTestId("new-game-name-input");
    await user.type(nameInput, "MEGA MILLIONS");
    await selectDropdownValues(user, "$5.00", "$300.00");

    const createButton = screen.getByTestId("create-game-button");
    await user.click(createButton);

    // THEN: Name input should be disabled during loading
    await waitFor(() => {
      expect(nameInput).toBeDisabled();
    });

    // Cleanup
    resolveApi!({
      success: true,
      data: {
        game_id: "game-new",
        game_code: "9999",
        name: "MEGA MILLIONS",
        price: 5.0,
        pack_value: 300,
        total_tickets: 60,
        status: "ACTIVE",
      },
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ERROR HANDLING TESTS (P1)
  // ═══════════════════════════════════════════════════════════════════════════

  it("6.12-NEWGAME-020: [P1] should show error toast on API failure", async () => {
    // GIVEN: NewGameModal component with failing API
    vi.mocked(createGame).mockRejectedValue(new Error("Network error"));

    const user = userEvent.setup({ delay: null });
    render(<NewGameModal {...defaultProps} />);

    // Wait for config to load
    await waitFor(() => {
      expect(screen.getByTestId("new-game-name-input")).toBeInTheDocument();
    });

    const nameInput = screen.getByTestId("new-game-name-input");
    await user.type(nameInput, "MEGA MILLIONS");
    await selectDropdownValues(user, "$5.00", "$300.00");

    const createButton = screen.getByTestId("create-game-button");
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

    // Wait for config to load
    await waitFor(() => {
      expect(screen.getByTestId("new-game-name-input")).toBeInTheDocument();
    });

    const nameInput = screen.getByTestId("new-game-name-input");
    await user.type(nameInput, "MEGA MILLIONS");
    await selectDropdownValues(user, "$5.00", "$300.00");

    const createButton = screen.getByTestId("create-game-button");
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

  it("6.12-NEWGAME-022: [P2] should submit form on Enter key in name field with valid inputs", async () => {
    // GIVEN: NewGameModal component with valid inputs
    const user = userEvent.setup({ delay: null });
    render(<NewGameModal {...defaultProps} />);

    // Wait for config to load
    await waitFor(() => {
      expect(screen.getByTestId("new-game-name-input")).toBeInTheDocument();
    });

    // Select dropdowns first
    await selectDropdownValues(user, "$5.00", "$300.00");

    const nameInput = screen.getByTestId("new-game-name-input");
    await user.type(nameInput, "MEGA MILLIONS");

    // WHEN: User presses Enter in name field
    await user.keyboard("{Enter}");

    // THEN: Form should be submitted
    await waitFor(() => {
      expect(createGame).toHaveBeenCalled();
    });
  });

  it("6.12-NEWGAME-023: [P2] should focus name input when modal opens and config loads", async () => {
    // GIVEN: NewGameModal component
    render(<NewGameModal {...defaultProps} />);

    // THEN: Name input should be focused after config loads
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

    // Wait for config to load
    await waitFor(() => {
      expect(screen.getByTestId("new-game-name-input")).toBeInTheDocument();
    });

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

    // Wait for config to load
    await waitFor(() => {
      expect(screen.getByTestId("new-game-name-input")).toBeInTheDocument();
    });

    // WHEN: User attempts SQL injection
    const nameInput = screen.getByTestId("new-game-name-input");
    await user.type(nameInput, "'; DROP TABLE games; --");

    // THEN: Input should be treated as plain text
    expect(nameInput).toHaveValue("'; DROP TABLE GAMES; --");

    // AND: API should be called with escaped input (server should also validate)
    await selectDropdownValues(user, "$5.00", "$300.00");
    const createButton = screen.getByTestId("create-game-button");
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

    // Wait for config to load
    await waitFor(() => {
      expect(screen.getByTestId("new-game-name-input")).toBeInTheDocument();
    });

    // AND: Required fields should be indicated (name, price, pack_value = 3 fields with *)
    expect(screen.getAllByText("*").length).toBeGreaterThanOrEqual(3);
  });

  it("6.12-NEWGAME-A11Y-002: [P2] should have labeled inputs and selects", async () => {
    // GIVEN: NewGameModal component
    render(<NewGameModal {...defaultProps} />);

    // Wait for config to load
    await waitFor(() => {
      expect(screen.getByTestId("new-game-name-input")).toBeInTheDocument();
    });

    // THEN: Inputs should have associated labels
    const nameInput = screen.getByTestId("new-game-name-input");
    const priceSelect = screen.getByTestId("new-game-price-select");
    const packValueSelect = screen.getByTestId("new-game-pack-value-select");

    expect(nameInput).toHaveAttribute("id", "game-name");
    expect(priceSelect).toHaveAttribute("id", "game-price");
    expect(packValueSelect).toHaveAttribute("id", "game-pack-value");
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

    // Wait for config to load
    await waitFor(() => {
      expect(screen.getByTestId("new-game-name-input")).toBeInTheDocument();
    });

    // Create first game
    const nameInput = screen.getByTestId("new-game-name-input");
    await user.type(nameInput, "FIRST GAME");
    await selectDropdownValues(user, "$5.00", "$300.00");

    const createButton = screen.getByTestId("create-game-button");
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
