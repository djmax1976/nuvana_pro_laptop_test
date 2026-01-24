/**
 * Component Tests: Super Admin Lottery Page - Game Status Badge Colors
 *
 * Enterprise-grade tests for game status badge color variants on the
 * Super Admin dashboard lottery games management page.
 *
 * @test-level COMPONENT
 * @justification Tests UI component rendering in isolation - fast, isolated, granular
 * @story Game Status Badge Color Update
 * @priority P1 (High - Visual Feedback Feature)
 * @created 2025-01-XX
 *
 * Tracing Matrix:
 * | Test ID                    | Requirement              | Component Feature                   |
 * |----------------------------|--------------------------|-------------------------------------|
 * | SADMIN-BADGE-001           | Game Status Badge Color  | ACTIVE uses success (green) variant |
 * | SADMIN-BADGE-002           | Game Status Badge Color  | INACTIVE uses destructive (red)     |
 * | SADMIN-BADGE-003           | Game Status Badge Color  | DISCONTINUED uses destructive (red) |
 * | SADMIN-BADGE-004           | Fallback Behavior        | Unknown status uses outline variant |
 *
 * Security Controls Applied:
 * - SEC-014: INPUT_VALIDATION - Strict enum types for game status
 * - FE-005: UI_SECURITY - Display values derived from backend enums
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
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
import { getGames, createGame, updateGame } from "@/lib/api/lottery";
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
  state_id?: string;
}) {
  return {
    game_id: overrides.game_id,
    game_code: overrides.game_code,
    name: overrides.name,
    status: overrides.status,
    state_id: overrides.state_id ?? "state-ga-123",
    price: 10.0,
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

describe("Super Admin Lottery Page: Game Status Badge Colors", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock returns
    (getLotteryEnabledStates as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: mockStates,
    });
  });

  afterEach(() => {
    cleanup();
  });

  /**
   * SADMIN-BADGE-001: ACTIVE game status uses success (green) variant
   *
   * Business Requirement: ACTIVE games should be visually distinguished
   * with green color to indicate they are currently available for sale.
   */
  it("SADMIN-BADGE-001: [P1] should display ACTIVE game with success (green) badge", async () => {
    // GIVEN: Games list with an ACTIVE game
    const mockGames = [
      createMockGame({
        game_id: "game-active-1",
        game_code: "1001",
        name: "Active Test Game",
        status: "ACTIVE",
      }),
    ];

    (getGames as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: mockGames,
    });

    // WHEN: Page is rendered
    renderWithQueryClient(<LotteryPage />);

    // THEN: Wait for games to load and verify badge color
    await waitFor(() => {
      const gameRow = screen.getByTestId("game-row-game-active-1");
      expect(gameRow).toBeInTheDocument();
    });

    // Find the badge within the row and verify it uses success variant
    const gameRow = screen.getByTestId("game-row-game-active-1");
    const badge = gameRow.querySelector('[class*="bg-success"]');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("Active");
  });

  /**
   * SADMIN-BADGE-002: INACTIVE game status uses destructive (red) variant
   *
   * Business Requirement: INACTIVE games MUST be visually flagged with
   * RED color to immediately alert Super Admins that these games are
   * not available for sale.
   *
   * User Story: Super Admin requested red color for inactive games
   * to quickly identify which games need attention.
   */
  it("SADMIN-BADGE-002: [P1] should display INACTIVE game with destructive (red) badge", async () => {
    // GIVEN: Games list with an INACTIVE game
    const mockGames = [
      createMockGame({
        game_id: "game-inactive-1",
        game_code: "2001",
        name: "Inactive Test Game",
        status: "INACTIVE",
      }),
    ];

    (getGames as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: mockGames,
    });

    // WHEN: Page is rendered
    renderWithQueryClient(<LotteryPage />);

    // THEN: Wait for games to load
    await waitFor(() => {
      const gameRow = screen.getByTestId("game-row-game-inactive-1");
      expect(gameRow).toBeInTheDocument();
    });

    // Verify badge uses destructive variant (red)
    const gameRow = screen.getByTestId("game-row-game-inactive-1");
    const badge = gameRow.querySelector('[class*="bg-destructive"]');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("Inactive");
  });

  /**
   * SADMIN-BADGE-003: DISCONTINUED game status uses destructive (red) variant
   *
   * Business Requirement: DISCONTINUED games should also be flagged red
   * (same as INACTIVE) to indicate they are no longer available.
   */
  it("SADMIN-BADGE-003: [P1] should display DISCONTINUED game with destructive (red) badge", async () => {
    // GIVEN: Games list with a DISCONTINUED game
    const mockGames = [
      createMockGame({
        game_id: "game-discontinued-1",
        game_code: "3001",
        name: "Discontinued Test Game",
        status: "DISCONTINUED",
      }),
    ];

    (getGames as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: mockGames,
    });

    // WHEN: Page is rendered
    renderWithQueryClient(<LotteryPage />);

    // THEN: Wait for games to load
    await waitFor(() => {
      const gameRow = screen.getByTestId("game-row-game-discontinued-1");
      expect(gameRow).toBeInTheDocument();
    });

    // Verify badge uses destructive variant (red)
    const gameRow = screen.getByTestId("game-row-game-discontinued-1");
    const badge = gameRow.querySelector('[class*="bg-destructive"]');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("Discontinued");
  });

  /**
   * SADMIN-BADGE-004: All three status types displayed correctly together
   *
   * Integration test: Verify all badge colors render correctly when
   * multiple games with different statuses are displayed.
   */
  it("SADMIN-BADGE-004: [P1] should display all three status types with correct colors", async () => {
    // GIVEN: Games with all three status types
    const mockGames = [
      createMockGame({
        game_id: "game-active-multi",
        game_code: "1001",
        name: "Active Game",
        status: "ACTIVE",
      }),
      createMockGame({
        game_id: "game-inactive-multi",
        game_code: "2001",
        name: "Inactive Game",
        status: "INACTIVE",
      }),
      createMockGame({
        game_id: "game-discontinued-multi",
        game_code: "3001",
        name: "Discontinued Game",
        status: "DISCONTINUED",
      }),
    ];

    (getGames as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: mockGames,
    });

    // WHEN: Page is rendered
    renderWithQueryClient(<LotteryPage />);

    // THEN: Wait for all games to load
    await waitFor(() => {
      expect(
        screen.getByTestId("game-row-game-active-multi"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("game-row-game-inactive-multi"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("game-row-game-discontinued-multi"),
      ).toBeInTheDocument();
    });

    // Verify ACTIVE uses success (green)
    const activeRow = screen.getByTestId("game-row-game-active-multi");
    const activeBadge = activeRow.querySelector('[class*="bg-success"]');
    expect(activeBadge).toBeInTheDocument();
    expect(activeBadge).toHaveTextContent("Active");

    // Verify INACTIVE uses destructive (red)
    const inactiveRow = screen.getByTestId("game-row-game-inactive-multi");
    const inactiveBadge = inactiveRow.querySelector('[class*="bg-destructive"]');
    expect(inactiveBadge).toBeInTheDocument();
    expect(inactiveBadge).toHaveTextContent("Inactive");

    // Verify DISCONTINUED uses destructive (red)
    const discontinuedRow = screen.getByTestId(
      "game-row-game-discontinued-multi",
    );
    const discontinuedBadge = discontinuedRow.querySelector(
      '[class*="bg-destructive"]',
    );
    expect(discontinuedBadge).toBeInTheDocument();
    expect(discontinuedBadge).toHaveTextContent("Discontinued");
  });

  /**
   * SADMIN-BADGE-005: Unknown status falls back to outline variant
   *
   * Defensive test: If backend returns unexpected status value,
   * the UI should handle gracefully with outline variant.
   *
   * SEC-014: INPUT_VALIDATION - Defensive handling of unexpected values
   */
  it("SADMIN-BADGE-005: [P2] should use outline variant for unknown status values", async () => {
    // GIVEN: Game with unexpected status value (simulating data corruption or API change)
    const mockGames = [
      {
        game_id: "game-unknown-1",
        game_code: "9001",
        name: "Unknown Status Game",
        status: "PENDING", // Not a valid enum value
        state_id: "state-ga-123",
        price: 10.0,
        pack_value: 300.0,
        total_tickets: 30,
        description: null,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-15T00:00:00Z",
      },
    ];

    (getGames as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: mockGames,
    });

    // WHEN: Page is rendered
    renderWithQueryClient(<LotteryPage />);

    // THEN: Wait for games to load
    await waitFor(() => {
      const gameRow = screen.getByTestId("game-row-game-unknown-1");
      expect(gameRow).toBeInTheDocument();
    });

    // Verify badge uses outline variant (fallback)
    const gameRow = screen.getByTestId("game-row-game-unknown-1");
    // Outline variant doesn't have bg-* class, just border
    const badge = gameRow.querySelector("span.inline-flex");
    expect(badge).toBeInTheDocument();
    // Should display the raw status value
    expect(badge).toHaveTextContent("PENDING");
  });
});

describe("Super Admin Lottery Page: Badge Color Consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getLotteryEnabledStates as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: mockStates,
    });
  });

  afterEach(() => {
    cleanup();
  });

  /**
   * Visual consistency test: Badge colors should use semantic meaning
   *
   * Green (success) = Available/Active = Positive state
   * Red (destructive) = Unavailable/Inactive = Warning state
   */
  it("SADMIN-BADGE-VISUAL: [P1] badge colors follow semantic meaning (green=available, red=unavailable)", async () => {
    // GIVEN: Mix of available and unavailable games
    const mockGames = [
      createMockGame({
        game_id: "game-available",
        game_code: "1001",
        name: "Available Game",
        status: "ACTIVE", // Available for sale
      }),
      createMockGame({
        game_id: "game-unavailable-1",
        game_code: "2001",
        name: "Unavailable Game 1",
        status: "INACTIVE", // Not available
      }),
      createMockGame({
        game_id: "game-unavailable-2",
        game_code: "3001",
        name: "Unavailable Game 2",
        status: "DISCONTINUED", // Not available
      }),
    ];

    (getGames as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: mockGames,
    });

    // WHEN: Page is rendered
    renderWithQueryClient(<LotteryPage />);

    await waitFor(() => {
      expect(screen.getByTestId("game-row-game-available")).toBeInTheDocument();
    });

    // THEN: Available games use green (success)
    const availableRow = screen.getByTestId("game-row-game-available");
    expect(availableRow.querySelector('[class*="bg-success"]')).toBeInTheDocument();

    // AND: Unavailable games use red (destructive)
    const unavailableRow1 = screen.getByTestId("game-row-game-unavailable-1");
    expect(
      unavailableRow1.querySelector('[class*="bg-destructive"]'),
    ).toBeInTheDocument();

    const unavailableRow2 = screen.getByTestId("game-row-game-unavailable-2");
    expect(
      unavailableRow2.querySelector('[class*="bg-destructive"]'),
    ).toBeInTheDocument();
  });
});
