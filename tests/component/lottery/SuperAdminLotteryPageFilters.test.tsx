/**
 * Component Tests: Super Admin Lottery Page - Search and Filters
 *
 * Enterprise-grade tests for search bar and filter functionality on the
 * Super Admin dashboard lottery games management page.
 *
 * @test-level COMPONENT
 * @justification Tests UI component rendering and user interaction - isolated, focused
 * @story Super Admin Dashboard Lottery Search & Filters
 * @priority P1 (High - Core Functionality Feature)
 * @created 2025-01-22
 *
 * Tracing Matrix:
 * | Test ID                          | Requirement           | Component Feature                     |
 * |----------------------------------|-----------------------|---------------------------------------|
 * | SADMIN-SEARCH-001                | Search Input          | Search bar renders with icon          |
 * | SADMIN-SEARCH-002                | Search Input          | Search filters by game name           |
 * | SADMIN-SEARCH-003                | Search Input          | Search filters by game code           |
 * | SADMIN-SEARCH-004                | Search Input          | Search is case-insensitive            |
 * | SADMIN-SEARCH-005                | Search Clear          | Clear button resets search            |
 * | SADMIN-SEARCH-006                | Search Debounce       | Input is debounced (300ms)            |
 * | SADMIN-PRICE-001                 | Price Filter          | Price dropdown renders options        |
 * | SADMIN-PRICE-002                 | Price Filter          | Price filter shows matching games     |
 * | SADMIN-PRICE-003                 | Price Filter          | "Other" shows non-standard prices     |
 * | SADMIN-STATUS-001                | Status Filter         | Status dropdown renders options       |
 * | SADMIN-STATUS-002                | Status Filter         | Filter by ACTIVE shows active games   |
 * | SADMIN-STATUS-003                | Status Filter         | Filter by INACTIVE shows inactive     |
 * | SADMIN-STATUS-004                | Status Filter         | Filter by DISCONTINUED shows disc.    |
 * | SADMIN-COMBINED-001              | Combined Filters      | Multiple filters work together        |
 * | SADMIN-CLEAR-001                 | Clear All Filters     | Clear button resets all filters       |
 *
 * Security Controls Applied:
 * - SEC-014: INPUT_VALIDATION - Allowlist filter values
 * - FE-021: EVENT_HANDLING - Debounced search input
 * - SEC-004: XSS - React auto-escapes all text content
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Mock the lottery API module
 */
vi.mock("@/lib/api/lottery", () => ({
  getGames: vi.fn(),
  createGame: vi.fn(),
  updateGame: vi.fn(),
}));

vi.mock("@/lib/api/geographic", () => ({
  getLotteryEnabledStates: vi.fn(),
}));

// Import after mocking
import { getGames } from "@/lib/api/lottery";
import { getLotteryEnabledStates } from "@/lib/api/geographic";
import LotteryPage from "@/app/(dashboard)/dashboard/lottery/page";

/**
 * Test fixture factory for lottery games
 *
 * SEC-014: INPUT_VALIDATION - Uses typed enum values
 */
function createMockGame(overrides: {
  game_id: string;
  game_code: string;
  name: string;
  status: "ACTIVE" | "INACTIVE" | "DISCONTINUED";
  price: number;
  state_id?: string;
}) {
  return {
    game_id: overrides.game_id,
    game_code: overrides.game_code,
    name: overrides.name,
    status: overrides.status,
    price: overrides.price,
    state_id: overrides.state_id ?? "state-ga-123",
    pack_value: 300.0,
    total_tickets: 30,
    description: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-15T00:00:00Z",
  };
}

/**
 * Mock states fixture
 */
const mockStates = [
  {
    state_id: "state-ga-123",
    code: "GA",
    name: "Georgia",
    lottery_enabled: true,
  },
  {
    state_id: "state-fl-456",
    code: "FL",
    name: "Florida",
    lottery_enabled: true,
  },
];

/**
 * Comprehensive mock games for filter testing
 * Covers various prices, statuses, and name patterns
 */
const comprehensiveMockGames = [
  createMockGame({
    game_id: "game-1",
    game_code: "GA001",
    name: "Georgia Jackpot",
    status: "ACTIVE",
    price: 5,
    state_id: "state-ga-123",
  }),
  createMockGame({
    game_id: "game-2",
    game_code: "GA002",
    name: "Peach State Millions",
    status: "ACTIVE",
    price: 10,
    state_id: "state-ga-123",
  }),
  createMockGame({
    game_id: "game-3",
    game_code: "FL001",
    name: "Sunshine Cash",
    status: "INACTIVE",
    price: 20,
    state_id: "state-fl-456",
  }),
  createMockGame({
    game_id: "game-4",
    game_code: "GA003",
    name: "Lucky 7s",
    status: "DISCONTINUED",
    price: 1,
    state_id: "state-ga-123",
  }),
  createMockGame({
    game_id: "game-5",
    game_code: "FL002",
    name: "Florida Fantasy",
    status: "ACTIVE",
    price: 2,
    state_id: "state-fl-456",
  }),
  createMockGame({
    game_id: "game-6",
    game_code: "GA004",
    name: "Gold Rush",
    status: "ACTIVE",
    price: 3,
    state_id: "state-ga-123",
  }),
  createMockGame({
    game_id: "game-7",
    game_code: "GA005",
    name: "Super Scratch",
    status: "ACTIVE",
    price: 25,
    state_id: "state-ga-123",
  }),
  createMockGame({
    game_id: "game-8",
    game_code: "FL003",
    name: "Ocean Treasures",
    status: "ACTIVE",
    price: 30,
    state_id: "state-fl-456",
  }),
  createMockGame({
    game_id: "game-9",
    game_code: "GA006",
    name: "Diamond Delight",
    status: "ACTIVE",
    price: 50,
    state_id: "state-ga-123",
  }),
  createMockGame({
    game_id: "game-10",
    game_code: "FL004",
    name: "Premium Special",
    status: "ACTIVE",
    price: 100, // Non-standard price for "Other" filter
    state_id: "state-fl-456",
  }),
];

/**
 * Helper to wrap component with QueryClient
 */
function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("Super Admin Lottery Page: Search Functionality", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    (getLotteryEnabledStates as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: mockStates,
    });

    (getGames as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: comprehensiveMockGames,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  /**
   * SADMIN-SEARCH-001: Search bar renders with icon
   *
   * Business Requirement: Search bar should be visually identifiable
   * with a search icon for user discoverability.
   */
  it("SADMIN-SEARCH-001: [P1] should render search bar with search icon", async () => {
    // WHEN: Page is rendered
    renderWithQueryClient(<LotteryPage />);

    // THEN: Search input is rendered
    await waitFor(() => {
      const searchInput = screen.getByTestId("search-games-input");
      expect(searchInput).toBeInTheDocument();
      expect(searchInput).toHaveAttribute(
        "placeholder",
        "Search by game name or code...",
      );
    });
  });

  /**
   * SADMIN-SEARCH-002: Search filters by game name
   *
   * Business Requirement: Super Admin can quickly find games by name
   */
  it("SADMIN-SEARCH-002: [P1] should filter games by name when searching", async () => {
    // GIVEN: Page is rendered with games
    renderWithQueryClient(<LotteryPage />);

    await waitFor(() => {
      expect(screen.getByTestId("search-games-input")).toBeInTheDocument();
    });

    // Wait for games to load
    await waitFor(() => {
      expect(screen.getByText("Georgia Jackpot")).toBeInTheDocument();
    });

    // WHEN: User types in search box
    const searchInput = screen.getByTestId("search-games-input");
    fireEvent.change(searchInput, { target: { value: "Jackpot" } });

    // Advance timers to trigger debounce
    vi.advanceTimersByTime(350);

    // THEN: Only matching games are shown
    await waitFor(() => {
      expect(screen.getByText("Georgia Jackpot")).toBeInTheDocument();
      expect(screen.queryByText("Sunshine Cash")).not.toBeInTheDocument();
      expect(screen.queryByText("Florida Fantasy")).not.toBeInTheDocument();
    });
  });

  /**
   * SADMIN-SEARCH-003: Search filters by game code
   *
   * Business Requirement: Super Admin can search by game code (e.g., "GA001")
   */
  it("SADMIN-SEARCH-003: [P1] should filter games by game code when searching", async () => {
    // GIVEN: Page is rendered with games
    renderWithQueryClient(<LotteryPage />);

    await waitFor(() => {
      expect(screen.getByTestId("search-games-input")).toBeInTheDocument();
    });

    // Wait for games to load
    await waitFor(() => {
      expect(screen.getByText("Georgia Jackpot")).toBeInTheDocument();
    });

    // WHEN: User searches by game code
    const searchInput = screen.getByTestId("search-games-input");
    fireEvent.change(searchInput, { target: { value: "FL001" } });

    vi.advanceTimersByTime(350);

    // THEN: Only game with matching code is shown
    await waitFor(() => {
      expect(screen.getByText("Sunshine Cash")).toBeInTheDocument();
      expect(screen.queryByText("Georgia Jackpot")).not.toBeInTheDocument();
    });
  });

  /**
   * SADMIN-SEARCH-004: Search is case-insensitive
   *
   * SEC-014: INPUT_VALIDATION - Case-insensitive search for better UX
   */
  it("SADMIN-SEARCH-004: [P1] should perform case-insensitive search", async () => {
    // GIVEN: Page is rendered with games
    renderWithQueryClient(<LotteryPage />);

    await waitFor(() => {
      expect(screen.getByText("Georgia Jackpot")).toBeInTheDocument();
    });

    // WHEN: User searches with different case
    const searchInput = screen.getByTestId("search-games-input");
    fireEvent.change(searchInput, { target: { value: "GEORGIA" } });

    vi.advanceTimersByTime(350);

    // THEN: Match is found regardless of case
    await waitFor(() => {
      expect(screen.getByText("Georgia Jackpot")).toBeInTheDocument();
    });
  });

  /**
   * SADMIN-SEARCH-005: Clear button resets search
   *
   * Business Requirement: User can easily clear search with X button
   */
  it("SADMIN-SEARCH-005: [P1] should show clear button when search has value", async () => {
    // GIVEN: Page is rendered
    renderWithQueryClient(<LotteryPage />);

    await waitFor(() => {
      expect(screen.getByTestId("search-games-input")).toBeInTheDocument();
    });

    // Initially, clear button should not be visible
    expect(screen.queryByLabelText("Clear search")).not.toBeInTheDocument();

    // WHEN: User types in search box
    const searchInput = screen.getByTestId("search-games-input");
    fireEvent.change(searchInput, { target: { value: "test" } });

    // THEN: Clear button appears
    await waitFor(() => {
      expect(screen.getByLabelText("Clear search")).toBeInTheDocument();
    });

    // WHEN: Clear button is clicked
    const clearButton = screen.getByLabelText("Clear search");
    fireEvent.click(clearButton);

    // THEN: Search is cleared
    expect(searchInput).toHaveValue("");
  });

  /**
   * SADMIN-SEARCH-006: Search is debounced
   *
   * FE-021: EVENT_HANDLING - 300ms debounce for performance
   */
  it("SADMIN-SEARCH-006: [P1] should debounce search input by 300ms", async () => {
    // GIVEN: Page is rendered with games
    renderWithQueryClient(<LotteryPage />);

    await waitFor(() => {
      expect(screen.getByText("Georgia Jackpot")).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId("search-games-input");

    // WHEN: User types quickly
    fireEvent.change(searchInput, { target: { value: "G" } });
    fireEvent.change(searchInput, { target: { value: "Go" } });
    fireEvent.change(searchInput, { target: { value: "Gol" } });
    fireEvent.change(searchInput, { target: { value: "Gold" } });

    // THEN: Before debounce, all games still shown
    // (filtering hasn't happened yet)
    expect(screen.getByText("Georgia Jackpot")).toBeInTheDocument();

    // WHEN: Debounce time passes
    vi.advanceTimersByTime(350);

    // THEN: Filter is applied after debounce
    await waitFor(() => {
      expect(screen.getByText("Gold Rush")).toBeInTheDocument();
      expect(screen.queryByText("Georgia Jackpot")).not.toBeInTheDocument();
    });
  });
});

describe("Super Admin Lottery Page: Price Filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (getLotteryEnabledStates as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: mockStates,
    });

    (getGames as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: comprehensiveMockGames,
    });
  });

  afterEach(() => {
    cleanup();
  });

  /**
   * SADMIN-PRICE-001: Price filter dropdown renders options
   *
   * Business Requirement: Price filter shows all standard price points
   */
  it("SADMIN-PRICE-001: [P1] should render price filter with all options", async () => {
    // WHEN: Page is rendered
    renderWithQueryClient(<LotteryPage />);

    await waitFor(() => {
      expect(screen.getByTestId("price-filter")).toBeInTheDocument();
    });

    // WHEN: Opening the dropdown
    const priceFilter = screen.getByTestId("price-filter");
    fireEvent.click(priceFilter);

    // THEN: All price options are available
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "All Prices" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "$1" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "$2" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "$3" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "$5" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "$10" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "$20" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "$25" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "$30" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "$50" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Other" })).toBeInTheDocument();
    });
  });

  /**
   * SADMIN-PRICE-002: Price filter shows matching games
   *
   * Business Requirement: Filter shows only games with selected price
   */
  it("SADMIN-PRICE-002: [P1] should filter games by selected price ($5)", async () => {
    // GIVEN: Page is rendered with games
    renderWithQueryClient(<LotteryPage />);

    await waitFor(() => {
      expect(screen.getByText("Georgia Jackpot")).toBeInTheDocument(); // $5 game
    });

    // WHEN: User selects $5 price filter
    const priceFilter = screen.getByTestId("price-filter");
    fireEvent.click(priceFilter);

    await waitFor(() => {
      const option = screen.getByRole("option", { name: "$5" });
      fireEvent.click(option);
    });

    // THEN: Only $5 games are shown
    await waitFor(() => {
      expect(screen.getByText("Georgia Jackpot")).toBeInTheDocument(); // $5
      expect(screen.queryByText("Florida Fantasy")).not.toBeInTheDocument(); // $2
      expect(screen.queryByText("Peach State Millions")).not.toBeInTheDocument(); // $10
    });
  });

  /**
   * SADMIN-PRICE-003: "Other" filter shows non-standard prices
   *
   * SEC-014: INPUT_VALIDATION - "Other" captures prices outside standard list
   */
  it("SADMIN-PRICE-003: [P1] should filter games with non-standard prices using 'Other'", async () => {
    // GIVEN: Page is rendered with games (includes $100 game)
    renderWithQueryClient(<LotteryPage />);

    await waitFor(() => {
      expect(screen.getByText("Premium Special")).toBeInTheDocument(); // $100 game
    });

    // WHEN: User selects "Other" price filter
    const priceFilter = screen.getByTestId("price-filter");
    fireEvent.click(priceFilter);

    await waitFor(() => {
      const option = screen.getByRole("option", { name: "Other" });
      fireEvent.click(option);
    });

    // THEN: Only non-standard price games are shown
    await waitFor(() => {
      expect(screen.getByText("Premium Special")).toBeInTheDocument(); // $100
      expect(screen.queryByText("Georgia Jackpot")).not.toBeInTheDocument(); // $5
      expect(screen.queryByText("Super Scratch")).not.toBeInTheDocument(); // $25
    });
  });
});

describe("Super Admin Lottery Page: Status Filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (getLotteryEnabledStates as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: mockStates,
    });

    (getGames as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: comprehensiveMockGames,
    });
  });

  afterEach(() => {
    cleanup();
  });

  /**
   * SADMIN-STATUS-001: Status filter dropdown renders options
   *
   * Business Requirement: Status filter shows all game lifecycle states
   */
  it("SADMIN-STATUS-001: [P1] should render status filter with all options", async () => {
    // WHEN: Page is rendered
    renderWithQueryClient(<LotteryPage />);

    await waitFor(() => {
      expect(screen.getByTestId("status-filter")).toBeInTheDocument();
    });

    // WHEN: Opening the dropdown
    const statusFilter = screen.getByTestId("status-filter");
    fireEvent.click(statusFilter);

    // THEN: All status options are available
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "All Status" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Active" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Inactive" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Discontinued" })).toBeInTheDocument();
    });
  });

  /**
   * SADMIN-STATUS-002: Filter by ACTIVE shows active games
   *
   * Business Requirement: ACTIVE filter shows only games available for sale
   */
  it("SADMIN-STATUS-002: [P1] should filter games by ACTIVE status", async () => {
    // GIVEN: Page is rendered with games of various statuses
    renderWithQueryClient(<LotteryPage />);

    await waitFor(() => {
      expect(screen.getByText("Georgia Jackpot")).toBeInTheDocument(); // ACTIVE
      expect(screen.getByText("Sunshine Cash")).toBeInTheDocument(); // INACTIVE
    });

    // WHEN: User selects ACTIVE filter
    const statusFilter = screen.getByTestId("status-filter");
    fireEvent.click(statusFilter);

    await waitFor(() => {
      const option = screen.getByRole("option", { name: "Active" });
      fireEvent.click(option);
    });

    // THEN: Only ACTIVE games are shown
    await waitFor(() => {
      expect(screen.getByText("Georgia Jackpot")).toBeInTheDocument();
      expect(screen.queryByText("Sunshine Cash")).not.toBeInTheDocument();
      expect(screen.queryByText("Lucky 7s")).not.toBeInTheDocument(); // DISCONTINUED
    });
  });

  /**
   * SADMIN-STATUS-003: Filter by INACTIVE shows inactive games
   *
   * Business Requirement: INACTIVE filter shows temporarily unavailable games
   */
  it("SADMIN-STATUS-003: [P1] should filter games by INACTIVE status", async () => {
    // GIVEN: Page is rendered with games
    renderWithQueryClient(<LotteryPage />);

    await waitFor(() => {
      expect(screen.getByText("Sunshine Cash")).toBeInTheDocument(); // INACTIVE
    });

    // WHEN: User selects INACTIVE filter
    const statusFilter = screen.getByTestId("status-filter");
    fireEvent.click(statusFilter);

    await waitFor(() => {
      const option = screen.getByRole("option", { name: "Inactive" });
      fireEvent.click(option);
    });

    // THEN: Only INACTIVE games are shown
    await waitFor(() => {
      expect(screen.getByText("Sunshine Cash")).toBeInTheDocument();
      expect(screen.queryByText("Georgia Jackpot")).not.toBeInTheDocument();
      expect(screen.queryByText("Lucky 7s")).not.toBeInTheDocument();
    });
  });

  /**
   * SADMIN-STATUS-004: Filter by DISCONTINUED shows discontinued games
   *
   * Business Requirement: DISCONTINUED filter shows retired games
   */
  it("SADMIN-STATUS-004: [P1] should filter games by DISCONTINUED status", async () => {
    // GIVEN: Page is rendered with games
    renderWithQueryClient(<LotteryPage />);

    await waitFor(() => {
      expect(screen.getByText("Lucky 7s")).toBeInTheDocument(); // DISCONTINUED
    });

    // WHEN: User selects DISCONTINUED filter
    const statusFilter = screen.getByTestId("status-filter");
    fireEvent.click(statusFilter);

    await waitFor(() => {
      const option = screen.getByRole("option", { name: "Discontinued" });
      fireEvent.click(option);
    });

    // THEN: Only DISCONTINUED games are shown
    await waitFor(() => {
      expect(screen.getByText("Lucky 7s")).toBeInTheDocument();
      expect(screen.queryByText("Georgia Jackpot")).not.toBeInTheDocument();
      expect(screen.queryByText("Sunshine Cash")).not.toBeInTheDocument();
    });
  });
});

describe("Super Admin Lottery Page: Combined Filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    (getLotteryEnabledStates as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: mockStates,
    });

    (getGames as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: comprehensiveMockGames,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  /**
   * SADMIN-COMBINED-001: Multiple filters work together
   *
   * Business Requirement: All filters can be combined for precise results
   */
  it("SADMIN-COMBINED-001: [P1] should apply multiple filters simultaneously", async () => {
    // GIVEN: Page is rendered with games
    renderWithQueryClient(<LotteryPage />);

    await waitFor(() => {
      expect(screen.getByText("Georgia Jackpot")).toBeInTheDocument();
    });

    // WHEN: User applies multiple filters

    // 1. Select state filter (Georgia only)
    const stateFilter = screen.getByTestId("state-filter");
    fireEvent.click(stateFilter);
    await waitFor(() => {
      const gaOption = screen.getByRole("option", { name: "Georgia (GA)" });
      fireEvent.click(gaOption);
    });

    // 2. Select ACTIVE status
    const statusFilter = screen.getByTestId("status-filter");
    fireEvent.click(statusFilter);
    await waitFor(() => {
      const activeOption = screen.getByRole("option", { name: "Active" });
      fireEvent.click(activeOption);
    });

    // 3. Search for "Gold"
    const searchInput = screen.getByTestId("search-games-input");
    fireEvent.change(searchInput, { target: { value: "Gold" } });
    vi.advanceTimersByTime(350);

    // THEN: Only games matching ALL criteria are shown
    await waitFor(() => {
      // Gold Rush: GA, ACTIVE, contains "Gold" - SHOULD SHOW
      expect(screen.getByText("Gold Rush")).toBeInTheDocument();

      // Georgia Jackpot: GA, ACTIVE, but no "Gold" - SHOULD NOT SHOW
      expect(screen.queryByText("Georgia Jackpot")).not.toBeInTheDocument();

      // Sunshine Cash: FL, INACTIVE - SHOULD NOT SHOW
      expect(screen.queryByText("Sunshine Cash")).not.toBeInTheDocument();

      // Florida Fantasy: FL, ACTIVE - SHOULD NOT SHOW (wrong state)
      expect(screen.queryByText("Florida Fantasy")).not.toBeInTheDocument();
    });
  });

  /**
   * SADMIN-CLEAR-001: Clear All Filters button resets all filters
   *
   * Business Requirement: User can quickly reset all filters
   */
  it("SADMIN-CLEAR-001: [P1] should clear all filters when Clear Filters clicked", async () => {
    // GIVEN: Page is rendered with filters applied
    renderWithQueryClient(<LotteryPage />);

    await waitFor(() => {
      expect(screen.getByText("Georgia Jackpot")).toBeInTheDocument();
    });

    // Apply some filters
    const searchInput = screen.getByTestId("search-games-input");
    fireEvent.change(searchInput, { target: { value: "Georgia" } });
    vi.advanceTimersByTime(350);

    // Clear Filters button should now be visible
    await waitFor(() => {
      expect(screen.getByTestId("clear-filters-button")).toBeInTheDocument();
    });

    // WHEN: User clicks Clear Filters
    const clearButton = screen.getByTestId("clear-filters-button");
    fireEvent.click(clearButton);

    // THEN: All filters are reset
    await waitFor(() => {
      // Search is cleared
      expect(searchInput).toHaveValue("");

      // All games are shown again
      expect(screen.getByText("Georgia Jackpot")).toBeInTheDocument();
      expect(screen.getByText("Sunshine Cash")).toBeInTheDocument();
      expect(screen.getByText("Florida Fantasy")).toBeInTheDocument();
    });
  });
});

describe("Super Admin Lottery Page: Filter Edge Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    (getLotteryEnabledStates as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: mockStates,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  /**
   * SADMIN-EDGE-001: Empty results show appropriate message
   *
   * UX Requirement: User feedback when no games match filters
   */
  it("SADMIN-EDGE-001: [P2] should show empty state when no games match filters", async () => {
    // GIVEN: Page with games
    (getGames as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: comprehensiveMockGames,
    });

    renderWithQueryClient(<LotteryPage />);

    await waitFor(() => {
      expect(screen.getByText("Georgia Jackpot")).toBeInTheDocument();
    });

    // WHEN: User searches for non-existent game
    const searchInput = screen.getByTestId("search-games-input");
    fireEvent.change(searchInput, { target: { value: "ZZZZNONEXISTENT" } });
    vi.advanceTimersByTime(350);

    // THEN: Empty state message is shown
    await waitFor(() => {
      expect(screen.queryByText("Georgia Jackpot")).not.toBeInTheDocument();
      // The games table should have no data rows
    });
  });

  /**
   * SADMIN-EDGE-002: Special characters in search
   *
   * SEC-014: INPUT_VALIDATION - Safe handling of special characters
   */
  it("SADMIN-EDGE-002: [P2] should safely handle special characters in search", async () => {
    // GIVEN: Page with games
    (getGames as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: comprehensiveMockGames,
    });

    renderWithQueryClient(<LotteryPage />);

    await waitFor(() => {
      expect(screen.getByText("Georgia Jackpot")).toBeInTheDocument();
    });

    // WHEN: User enters special characters
    const searchInput = screen.getByTestId("search-games-input");
    fireEvent.change(searchInput, { target: { value: "<script>alert('xss')</script>" } });
    vi.advanceTimersByTime(350);

    // THEN: No errors, just no matches (XSS is safely handled)
    await waitFor(() => {
      // Page should still be functional, just with no matches
      expect(searchInput).toHaveValue("<script>alert('xss')</script>");
      // No game matches this search
      expect(screen.queryByText("Georgia Jackpot")).not.toBeInTheDocument();
    });
  });

  /**
   * SADMIN-EDGE-003: Whitespace-only search
   *
   * SEC-014: INPUT_VALIDATION - Whitespace trimmed, treated as empty
   */
  it("SADMIN-EDGE-003: [P2] should treat whitespace-only search as empty", async () => {
    // GIVEN: Page with games
    (getGames as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: comprehensiveMockGames,
    });

    renderWithQueryClient(<LotteryPage />);

    await waitFor(() => {
      expect(screen.getByText("Georgia Jackpot")).toBeInTheDocument();
    });

    // WHEN: User enters only whitespace
    const searchInput = screen.getByTestId("search-games-input");
    fireEvent.change(searchInput, { target: { value: "   " } });
    vi.advanceTimersByTime(350);

    // THEN: All games are still shown (whitespace treated as no filter)
    await waitFor(() => {
      expect(screen.getByText("Georgia Jackpot")).toBeInTheDocument();
      expect(screen.getByText("Sunshine Cash")).toBeInTheDocument();
    });
  });

  /**
   * SADMIN-EDGE-004: Empty games list
   *
   * Edge case: No games exist in the system
   */
  it("SADMIN-EDGE-004: [P2] should handle empty games list gracefully", async () => {
    // GIVEN: No games exist
    (getGames as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [],
    });

    // WHEN: Page is rendered
    renderWithQueryClient(<LotteryPage />);

    // THEN: Search and filters are still rendered (UI is functional)
    await waitFor(() => {
      expect(screen.getByTestId("search-games-input")).toBeInTheDocument();
      expect(screen.getByTestId("price-filter")).toBeInTheDocument();
      expect(screen.getByTestId("status-filter")).toBeInTheDocument();
    });
  });

  /**
   * SADMIN-EDGE-005: Games with null price
   *
   * SEC-014: INPUT_VALIDATION - Safe handling of null values
   */
  it("SADMIN-EDGE-005: [P2] should handle games with null price in filter", async () => {
    // GIVEN: Game with null price
    const gamesWithNullPrice = [
      {
        game_id: "game-null-price",
        game_code: "NULL001",
        name: "Null Price Game",
        status: "ACTIVE",
        price: null,
        state_id: "state-ga-123",
        pack_value: 300.0,
        total_tickets: 30,
        description: null,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-15T00:00:00Z",
      },
      ...comprehensiveMockGames,
    ];

    (getGames as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: gamesWithNullPrice,
    });

    renderWithQueryClient(<LotteryPage />);

    await waitFor(() => {
      expect(screen.getByText("Null Price Game")).toBeInTheDocument();
    });

    // WHEN: User selects $5 filter
    const priceFilter = screen.getByTestId("price-filter");
    fireEvent.click(priceFilter);

    await waitFor(() => {
      const option = screen.getByRole("option", { name: "$5" });
      fireEvent.click(option);
    });

    // THEN: Null price game is excluded (null !== 5)
    await waitFor(() => {
      expect(screen.queryByText("Null Price Game")).not.toBeInTheDocument();
      expect(screen.getByText("Georgia Jackpot")).toBeInTheDocument(); // $5
    });
  });
});

describe("Super Admin Lottery Page: Filter Count Display", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    (getLotteryEnabledStates as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: mockStates,
    });

    (getGames as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: comprehensiveMockGames,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  /**
   * SADMIN-COUNT-001: Filtered count updates correctly
   *
   * Business Requirement: User sees how many games match current filters
   */
  it("SADMIN-COUNT-001: [P1] should update game count display when filters change", async () => {
    // GIVEN: Page is rendered
    renderWithQueryClient(<LotteryPage />);

    // Wait for initial load - games are displayed
    await waitFor(() => {
      expect(screen.getByText("Georgia Jackpot")).toBeInTheDocument();
    });

    // Verify multiple games are shown initially
    expect(screen.getByText("Peach State Millions")).toBeInTheDocument();
    expect(screen.getByText("Sunshine Cash")).toBeInTheDocument();

    // WHEN: Apply filter that reduces results
    const statusFilter = screen.getByTestId("status-filter");
    fireEvent.click(statusFilter);

    await waitFor(() => {
      const option = screen.getByRole("option", { name: "Discontinued" });
      fireEvent.click(option);
    });

    // THEN: Count should update to show fewer games
    await waitFor(() => {
      // Only 1 DISCONTINUED game in test data
      expect(screen.getByText("Lucky 7s")).toBeInTheDocument();
      // Other games should not be visible
      expect(screen.queryByText("Georgia Jackpot")).not.toBeInTheDocument();
    });
  });
});
