/**
 * Component Tests: LotteryTable
 *
 * Tests LotteryTable component rendering and interactions:
 * - Displays table with correct columns (Game Name, Game Number, Dollar Value, Pack Count, Status)
 * - Groups packs by game and shows aggregate counts
 * - Displays empty state when no inventory exists
 * - Filter functionality (game name, status, date range)
 * - Expandable rows with pack details sub-list
 * - Total bins and remaining packs badges
 * - Receive Packs button callback
 * - Security: XSS prevention in displayed game data
 * - Accessibility: ARIA attributes, table semantics
 *
 * @test-level COMPONENT
 * @justification Tests UI component behavior in isolation - fast, isolated, granular
 * @story 6-10-1 - Client Dashboard Lottery Page
 * @priority P2 (Medium - Table Display)
 * @enhanced-by workflow-9 on 2025-01-28
 *
 * Tracing Matrix:
 * | Test ID                        | Requirement      | Component Feature              |
 * |--------------------------------|------------------|--------------------------------|
 * | COMPONENT-005                  | AC #2            | Table columns display          |
 * | COMPONENT-006                  | AC #3            | Pack grouping by game          |
 * | COMPONENT-007                  | AC #3            | Status badges with counts      |
 * | COMPONENT-008                  | AC #3            | DEPLETED/RETURNED filtering    |
 * | COMPONENT-009                  | AC #8            | Empty state                    |
 * | COMPONENT-012                  | AC #7            | Loading state                  |
 * | COMPONENT-013                  | AC #7            | Error state                    |
 * | COMPONENT-FILTER-001          | Filter Feature   | Game name filter               |
 * | COMPONENT-FILTER-002          | Filter Feature   | Status filter                  |
 * | COMPONENT-FILTER-003          | Filter Feature   | Date range filter              |
 * | COMPONENT-EXPAND-001          | Expandable Rows  | Row expansion toggle           |
 * | COMPONENT-EXPAND-002          | Expandable Rows  | Pack details display           |
 * | COMPONENT-BADGE-001           | Badge Feature    | Total bins count               |
 * | COMPONENT-BADGE-002           | Badge Feature    | Total remaining packs count    |
 * | COMPONENT-CALLBACK-001        | Button Feature   | Receive packs callback         |
 * | SEC-007                        | Security         | XSS prevention                 |
 * | A11Y-003                       | Accessibility    | ARIA attributes                |
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LotteryTable } from "@/components/lottery/LotteryTable";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock useLotteryPacks hook
vi.mock("@/hooks/useLottery", () => ({
  useLotteryPacks: vi.fn(),
  usePackDetails: vi.fn(() => ({
    data: null,
    isLoading: false,
    isError: false,
    error: null,
  })),
  useUpdateGame: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useReturnPack: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({ success: true }),
    isPending: false,
  })),
}));

// Mock fetch for bins API
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { useLotteryPacks } from "@/hooks/useLottery";

/**
 * Default test props for LotteryTable component
 * SEC-014: INPUT_VALIDATION - Test stores are validated in component
 */
const defaultTestStores = [
  { store_id: "store-1", name: "Test Store 1" },
  { store_id: "store-2", name: "Test Store 2" },
];

const defaultTestProps = {
  storeId: "store-1",
  stores: defaultTestStores,
  onStoreChange: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
};

// Helper to wrap component with QueryClient
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

describe("6.10.1-COMPONENT: LotteryTable (Grouped by Game)", () => {
  /**
   * Mock packs with game.status and can_return fields
   * SEC-010: AUTHZ - can_return comes from backend
   * Story: Game Status Display - game.status for lifecycle badge
   */
  const mockPacks = [
    {
      pack_id: "pack-1",
      pack_number: "P001",
      status: "ACTIVE" as const,
      serial_start: "1000",
      serial_end: "2000",
      game_id: "game-1",
      store_id: "store-1",
      current_bin_id: "bin-1",
      received_at: "2025-01-15T10:00:00Z",
      activated_at: "2025-01-16T10:00:00Z",
      depleted_at: null,
      returned_at: null,
      can_return: true, // SEC-010: Backend authorization
      game: {
        game_id: "game-1",
        game_code: "001",
        name: "Mega Millions",
        price: 5.0,
        status: "ACTIVE", // Game lifecycle status
      },
      bin: {
        bin_id: "bin-1",
        name: "Bin 1",
        store_id: "store-1",
        location: "Location 1",
      },
    },
    {
      pack_id: "pack-2",
      pack_number: "P002",
      status: "ACTIVE" as const,
      serial_start: "2001",
      serial_end: "3000",
      game_id: "game-1",
      store_id: "store-1",
      current_bin_id: "bin-2",
      received_at: "2025-01-15T10:00:00Z",
      activated_at: "2025-01-16T10:00:00Z",
      depleted_at: null,
      returned_at: null,
      can_return: true, // SEC-010: Backend authorization
      game: {
        game_id: "game-1",
        game_code: "001",
        name: "Mega Millions",
        price: 5.0,
        status: "ACTIVE", // Game lifecycle status
      },
      bin: {
        bin_id: "bin-2",
        name: "Bin 2",
        store_id: "store-1",
        location: "Location 2",
      },
    },
    {
      pack_id: "pack-3",
      pack_number: "P003",
      status: "RECEIVED" as const,
      serial_start: "3001",
      serial_end: "4000",
      game_id: "game-2",
      store_id: "store-1",
      current_bin_id: null,
      received_at: "2025-01-20T10:00:00Z",
      activated_at: null,
      depleted_at: null,
      returned_at: null,
      can_return: true, // SEC-010: Backend authorization - RECEIVED can be returned
      game: {
        game_id: "game-2",
        game_code: "002",
        name: "Powerball",
        price: 10.0,
        status: "ACTIVE", // Game lifecycle status
      },
      bin: null,
    },
  ];

  const mockBins = [
    { bin_id: "bin-1" },
    { bin_id: "bin-2" },
    { bin_id: "bin-3" },
  ];

  // Test isolation: Clean up after each test
  beforeEach(() => {
    vi.clearAllMocks();
    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockPacks,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    // Mock fetch for bins API
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockBins }),
    });
  });

  afterEach(() => {
    cleanup();
  });

  // ============ BASIC RENDERING TESTS ============

  it("6.10.1-COMPONENT-005: [P2] should display table with correct columns", async () => {
    // GIVEN: LotteryTable component with packs
    // WHEN: Component is rendered
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // THEN: Table headers are displayed
    expect(
      screen.getByText("Game Name"),
      "Game Name header should be displayed",
    ).toBeInTheDocument();
    expect(
      screen.getByText("Game Number"),
      "Game Number header should be displayed",
    ).toBeInTheDocument();
    expect(
      screen.getByText("Dollar Value"),
      "Dollar Value header should be displayed",
    ).toBeInTheDocument();
    expect(
      screen.getByText("Pack Count"),
      "Pack Count header should be displayed",
    ).toBeInTheDocument();
    expect(
      screen.getByText("Status"),
      "Status header should be displayed",
    ).toBeInTheDocument();

    // AND: Table has proper data-testid
    expect(
      screen.getByTestId("lottery-table"),
      "Table should have lottery-table data-testid",
    ).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-006: [P2] should group packs by game and display counts", async () => {
    // GIVEN: LotteryTable component with multiple packs of same game
    // WHEN: Component is rendered
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // THEN: Games are displayed (not individual packs)
    expect(
      screen.getByText("Mega Millions"),
      "Game name should be displayed",
    ).toBeInTheDocument();
    expect(
      screen.getByText("Powerball"),
      "Second game name should be displayed",
    ).toBeInTheDocument();

    // AND: Pack counts are displayed
    expect(
      screen.getByText("2"),
      "Pack count of 2 should be displayed for Mega Millions",
    ).toBeInTheDocument();
    expect(
      screen.getByText("1"),
      "Pack count of 1 should be displayed for Powerball",
    ).toBeInTheDocument();

    // AND: Game codes are displayed
    expect(
      screen.getByText("001"),
      "Game code 001 should be displayed",
    ).toBeInTheDocument();
    expect(
      screen.getByText("002"),
      "Game code 002 should be displayed",
    ).toBeInTheDocument();

    // AND: Dollar values are displayed
    expect(
      screen.getByText("$5.00"),
      "Dollar value $5.00 should be displayed",
    ).toBeInTheDocument();
    expect(
      screen.getByText("$10.00"),
      "Dollar value $10.00 should be displayed",
    ).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-007: [P2] should show game status badge (not pack count badges)", async () => {
    // GIVEN: LotteryTable component with mixed status packs
    // WHEN: Component is rendered
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // THEN: Game status badges are displayed (not pack count badges)
    // Story: Game Status Display - Parent row shows game lifecycle status
    expect(
      screen.getByTestId("game-status-badge-game-1"),
      "Game status badge should be displayed for Mega Millions",
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("game-status-badge-game-2"),
      "Game status badge should be displayed for Powerball",
    ).toBeInTheDocument();

    // AND: Old pack count badges should NOT be present (replaced by game status)
    expect(
      screen.queryByText("2 Active"),
      "Pack count badges should NOT be displayed",
    ).not.toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-008: [P2] should filter out DEPLETED and RETURNED packs from default view", async () => {
    // GIVEN: LotteryTable component with DEPLETED pack
    const packsWithDepleted = [
      ...mockPacks,
      {
        pack_id: "pack-4",
        pack_number: "P004",
        status: "DEPLETED" as const,
        serial_start: "4001",
        serial_end: "5000",
        game_id: "game-1",
        store_id: "store-1",
        current_bin_id: "bin-1",
        received_at: "2025-01-15T10:00:00Z",
        activated_at: "2025-01-16T10:00:00Z",
        depleted_at: "2025-01-20T10:00:00Z",
        returned_at: null,
        game: {
          game_id: "game-1",
          game_code: "001",
          name: "Mega Millions",
          price: 5.0,
        },
        bin: null,
      },
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: packsWithDepleted,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    // WHEN: Component is rendered
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // THEN: DEPLETED pack is NOT counted in default view (still shows 2 for Mega Millions)
    // The table shows total pack count, which is 2 for the filtered view (excluding DEPLETED)
    const gameRow = screen.getByTestId("lottery-table-row-game-1");
    expect(
      within(gameRow).getByText("2"),
      "Pack count should still be 2 (DEPLETED not counted in default view)",
    ).toBeInTheDocument();
    // Game status badge is shown instead of pack count badges
    expect(
      screen.getByTestId("game-status-badge-game-1"),
      "Game status badge should be displayed",
    ).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-009: [P3] should display empty state when no inventory exists", async () => {
    // GIVEN: LotteryTable component with no packs
    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    // WHEN: Component is rendered
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // THEN: Empty state message is displayed
    expect(
      screen.getByText(/no lottery inventory for this store/i),
      "Empty state message should be displayed",
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("lottery-table-empty"),
      "Empty state should have data-testid",
    ).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-012: [P2] should display loading state", async () => {
    // GIVEN: LotteryTable component with loading state
    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    // WHEN: Component is rendered
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // THEN: Loading spinner is displayed
    expect(
      screen.getByTestId("lottery-table-loading"),
      "Loading spinner should be displayed",
    ).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-013: [P2] should display error state", async () => {
    // GIVEN: LotteryTable component with error state
    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { message: "Failed to load inventory" },
      refetch: vi.fn(),
    });

    // WHEN: Component is rendered
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // THEN: Error message is displayed
    expect(
      screen.getByTestId("lottery-table-error"),
      "Error state should have data-testid",
    ).toBeInTheDocument();
    expect(
      screen.getByText(/failed to load lottery inventory/i),
      "Error message should be displayed",
    ).toBeInTheDocument();
  });

  // ============ FILTER TESTS ============

  it("6.10.1-COMPONENT-FILTER-001: [P2] should filter games by name search", async () => {
    // GIVEN: LotteryTable component with multiple games
    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // WHEN: User types in game name filter
    const filterInput = screen.getByTestId("filter-game-name");
    await user.type(filterInput, "Mega");

    // THEN: Only matching games are displayed
    expect(screen.getByText("Mega Millions")).toBeInTheDocument();
    expect(screen.queryByText("Powerball")).not.toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-FILTER-002: [P2] should filter games by game code", async () => {
    // GIVEN: LotteryTable component with multiple games
    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // WHEN: User types game code in filter
    const filterInput = screen.getByTestId("filter-game-name");
    await user.type(filterInput, "002");

    // THEN: Only matching games are displayed
    expect(screen.queryByText("Mega Millions")).not.toBeInTheDocument();
    expect(screen.getByText("Powerball")).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-FILTER-003: [P2] should display empty state when filter matches no games", async () => {
    // GIVEN: LotteryTable component
    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // WHEN: User types non-matching filter
    const filterInput = screen.getByTestId("filter-game-name");
    await user.type(filterInput, "NonExistentGame");

    // THEN: Empty state with filter message is displayed
    expect(screen.getByTestId("lottery-table-empty")).toBeInTheDocument();
    expect(
      screen.getByText(/no lottery inventory matches your filters/i),
    ).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-FILTER-004: [P2] should filter by status SOLD (maps to DEPLETED)", async () => {
    // GIVEN: LotteryTable with DEPLETED packs
    const packsWithDepleted = [
      ...mockPacks,
      {
        pack_id: "pack-sold",
        pack_number: "P999",
        status: "DEPLETED" as const,
        serial_start: "9001",
        serial_end: "9999",
        game_id: "game-3",
        store_id: "store-1",
        current_bin_id: null,
        received_at: "2025-01-10T10:00:00Z",
        activated_at: "2025-01-11T10:00:00Z",
        depleted_at: "2025-01-15T10:00:00Z",
        returned_at: null,
        game: {
          game_id: "game-3",
          game_code: "003",
          name: "Sold Out Game",
          price: 2.0,
        },
        bin: null,
      },
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: packsWithDepleted,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // WHEN: User selects SOLD status filter
    const statusSelect = screen.getByTestId("filter-status");
    await user.click(statusSelect);
    const soldOption = await screen.findByRole("option", { name: "Sold" });
    await user.click(soldOption);

    // THEN: Only DEPLETED (sold) games are shown
    expect(screen.getByText("Sold Out Game")).toBeInTheDocument();
    expect(screen.queryByText("Mega Millions")).not.toBeInTheDocument();
    expect(screen.queryByText("Powerball")).not.toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-FILTER-005: [P2] should filter by date range", async () => {
    // GIVEN: LotteryTable with packs received on different dates
    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // WHEN: User sets date range that only includes one pack's received_at
    const dateFromInput = screen.getByTestId("filter-date-from");
    const dateToInput = screen.getByTestId("filter-date-to");

    await user.clear(dateFromInput);
    await user.type(dateFromInput, "2025-01-18");
    await user.clear(dateToInput);
    await user.type(dateToInput, "2025-01-25");

    // THEN: Only packs received within date range are shown
    // Pack 3 (Powerball) was received on 2025-01-20
    await waitFor(() => {
      expect(screen.getByText("Powerball")).toBeInTheDocument();
      expect(screen.queryByText("Mega Millions")).not.toBeInTheDocument();
    });
  });

  // ============ EXPANDABLE ROW TESTS ============

  it("6.10.1-COMPONENT-EXPAND-001: [P2] should expand row when clicked", async () => {
    // GIVEN: LotteryTable component
    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // WHEN: User clicks on a game row
    const gameRow = screen.getByTestId("lottery-table-row-game-1");
    await user.click(gameRow);

    // THEN: Pack details header row and pack rows are expanded
    expect(screen.getByTestId("pack-details-game-1")).toBeInTheDocument();
    expect(screen.getByTestId("pack-row-pack-1")).toBeInTheDocument();
    expect(screen.getByTestId("pack-row-pack-2")).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-EXPAND-002: [P2] should display pack details in expanded row", async () => {
    // GIVEN: LotteryTable component
    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // WHEN: User expands a game row
    const gameRow = screen.getByTestId("lottery-table-row-game-1");
    await user.click(gameRow);

    // THEN: Sub-list header row shows column headers aligned with parent
    const packDetails = screen.getByTestId("pack-details-game-1");
    expect(within(packDetails).getByText("Pack #")).toBeInTheDocument();
    expect(within(packDetails).getByText("Received At")).toBeInTheDocument();
    expect(within(packDetails).getByText("Activated At")).toBeInTheDocument();
    expect(within(packDetails).getByText("Returned At")).toBeInTheDocument();
    expect(within(packDetails).getByText("Status")).toBeInTheDocument();
    // "Returned" was replaced with "Actions" for Return button
    expect(within(packDetails).getByText("Actions")).toBeInTheDocument();

    // AND: Pack data rows are visible (pack number only, no serial range)
    expect(screen.getByText("#P001")).toBeInTheDocument();
    expect(screen.getByText("#P002")).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-EXPAND-003: [P2] should collapse row when clicked again", async () => {
    // GIVEN: LotteryTable component with expanded row
    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    const gameRow = screen.getByTestId("lottery-table-row-game-1");
    await user.click(gameRow); // Expand
    expect(screen.getByTestId("pack-details-game-1")).toBeInTheDocument();
    expect(screen.getByTestId("pack-row-pack-1")).toBeInTheDocument();

    // WHEN: User clicks the row again
    await user.click(gameRow);

    // THEN: Pack details are collapsed
    expect(screen.queryByTestId("pack-details-game-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pack-row-pack-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pack-row-pack-2")).not.toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-EXPAND-004: [P2] should expand via chevron button", async () => {
    // GIVEN: LotteryTable component
    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // WHEN: User clicks the expand button
    const expandButton = screen.getByTestId("expand-game-game-1");
    await user.click(expandButton);

    // THEN: Pack details header and pack rows are expanded
    expect(screen.getByTestId("pack-details-game-1")).toBeInTheDocument();
    expect(screen.getByTestId("pack-row-pack-1")).toBeInTheDocument();
    expect(screen.getByTestId("pack-row-pack-2")).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-EXPAND-005: [P2] should hide DEPLETED packs in expanded sub-list", async () => {
    // GIVEN: LotteryTable with mix of ACTIVE and DEPLETED packs
    const packsWithDepleted = [
      ...mockPacks.slice(0, 2), // Keep the 2 ACTIVE Mega Millions packs
      {
        pack_id: "pack-depleted",
        pack_number: "P999",
        status: "DEPLETED" as const,
        serial_start: "9001",
        serial_end: "9999",
        game_id: "game-1", // Same game
        store_id: "store-1",
        current_bin_id: null,
        received_at: "2025-01-10T10:00:00Z",
        activated_at: "2025-01-11T10:00:00Z",
        depleted_at: "2025-01-15T10:00:00Z",
        returned_at: null,
        game: {
          game_id: "game-1",
          game_code: "001",
          name: "Mega Millions",
          price: 5.0,
        },
        bin: null,
      },
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: packsWithDepleted,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // WHEN: User expands Mega Millions row
    const gameRow = screen.getByTestId("lottery-table-row-game-1");
    await user.click(gameRow);

    // THEN: DEPLETED pack is NOT shown in sub-list
    expect(screen.getByText("#P001")).toBeInTheDocument();
    expect(screen.getByText("#P002")).toBeInTheDocument();
    expect(screen.queryByText("#P999")).not.toBeInTheDocument();
  });

  // ============ BADGE TESTS ============

  it("6.10.1-COMPONENT-BADGE-001: [P2] should display total bins count", async () => {
    // GIVEN: LotteryTable component with mocked bins
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // THEN: Total bins badge shows correct count
    await waitFor(() => {
      expect(screen.getByTestId("total-bins-badge")).toBeInTheDocument();
      expect(screen.getByTestId("total-bins-count")).toHaveTextContent("3");
    });
  });

  it("6.10.1-COMPONENT-BADGE-002: [P2] should display total remaining packs count", async () => {
    // GIVEN: LotteryTable component with 3 packs (2 ACTIVE, 1 RECEIVED)
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // THEN: Total remaining packs badge shows 3
    expect(
      screen.getByTestId("total-remaining-packs-badge"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("total-remaining-packs-count")).toHaveTextContent(
      "3",
    );
  });

  it("6.10.1-COMPONENT-BADGE-003: [P2] should not count DEPLETED packs in remaining total", async () => {
    // GIVEN: LotteryTable with DEPLETED packs
    const packsWithDepleted = [
      ...mockPacks,
      {
        pack_id: "pack-depleted",
        pack_number: "P999",
        status: "DEPLETED" as const,
        serial_start: "9001",
        serial_end: "9999",
        game_id: "game-1",
        store_id: "store-1",
        current_bin_id: null,
        received_at: "2025-01-10T10:00:00Z",
        activated_at: "2025-01-11T10:00:00Z",
        depleted_at: "2025-01-15T10:00:00Z",
        returned_at: null,
        game: {
          game_id: "game-1",
          game_code: "001",
          name: "Mega Millions",
          price: 5.0,
        },
        bin: null,
      },
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: packsWithDepleted,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // THEN: Total remaining packs still shows 3 (DEPLETED not counted)
    expect(screen.getByTestId("total-remaining-packs-count")).toHaveTextContent(
      "3",
    );
  });

  // ============ CALLBACK TESTS ============

  it("6.10.1-COMPONENT-CALLBACK-001: [P2] should call onReceivePacksClick when button clicked", async () => {
    // GIVEN: LotteryTable component with callback
    const onReceivePacksClick = vi.fn();
    const user = userEvent.setup();
    renderWithQueryClient(
      <LotteryTable
        {...defaultTestProps}
        onReceivePacksClick={onReceivePacksClick}
      />,
    );

    // WHEN: User clicks Receive Packs button
    const receiveButton = screen.getByTestId("receive-packs-button");
    await user.click(receiveButton);

    // THEN: Callback is invoked
    expect(onReceivePacksClick).toHaveBeenCalledTimes(1);
  });

  it("6.10.1-COMPONENT-CALLBACK-002: [P2] should display Receive Packs button with correct text", async () => {
    // GIVEN: LotteryTable component
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // THEN: Button displays correct text
    const receiveButton = screen.getByTestId("receive-packs-button");
    expect(receiveButton).toHaveTextContent("+ Receive Packs");
  });

  // ============ SECURITY TESTS (MANDATORY) ============

  it("6.10.1-COMPONENT-SEC-007: [P0] should prevent XSS in displayed game data", async () => {
    // GIVEN: LotteryTable component with game containing XSS attempt
    const maliciousPack = {
      pack_id: "pack-xss",
      pack_number: "P001",
      status: "ACTIVE" as const,
      serial_start: "1000",
      serial_end: "2000",
      game_id: "game-xss",
      store_id: "store-1",
      current_bin_id: "bin-1",
      received_at: "2025-01-15T10:00:00Z",
      activated_at: "2025-01-16T10:00:00Z",
      depleted_at: null,
      returned_at: null,
      game: {
        game_id: "game-xss",
        game_code: "<script>alert('XSS')</script>",
        name: "<img src=x onerror=alert('XSS')>",
        price: 5.0,
      },
      bin: null,
    };

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [maliciousPack],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    // WHEN: Component is rendered
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // THEN: XSS attempts are escaped (React escapes by default)
    // Verify game name is displayed as plain text
    const gameNameElement = screen.getByText(
      /<img src=x onerror=alert\('XSS'\)>/i,
    );
    expect(
      gameNameElement,
      "XSS attempt should be displayed as plain text, not executed",
    ).toBeInTheDocument();

    // Verify it's text content, not executable HTML
    expect(
      gameNameElement.innerHTML,
      "XSS should be escaped in HTML",
    ).toContain("&lt;img");
  });

  it("6.10.1-COMPONENT-SEC-008: [P0] should prevent XSS in filter input", async () => {
    // GIVEN: LotteryTable component
    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // WHEN: User types XSS attempt in filter
    const filterInput = screen.getByTestId("filter-game-name");
    await user.type(filterInput, "<script>alert('xss')</script>");

    // THEN: Input value is properly escaped (no script execution)
    expect(filterInput).toHaveValue("<script>alert('xss')</script>");
    // The filter just treats this as a string search, no execution
  });

  // ============ ACCESSIBILITY TESTS ============

  it("6.10.1-COMPONENT-A11Y-003: [P2] should have proper ARIA attributes for table", async () => {
    // GIVEN: LotteryTable component
    // WHEN: Component is rendered
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // THEN: Table has proper ARIA attributes
    const tableRegion = screen.getByTestId("lottery-table");
    expect(tableRegion, "Table region should have role=region").toHaveAttribute(
      "role",
      "region",
    );
    expect(tableRegion, "Table region should have aria-label").toHaveAttribute(
      "aria-label",
      "Lottery inventory table",
    );
    expect(
      tableRegion,
      "Table region should have id for tab association",
    ).toHaveAttribute("id", "lottery-table-store-1");
  });

  it("6.10.1-COMPONENT-A11Y-004: [P2] should have aria-label on Receive Packs button", async () => {
    // GIVEN: LotteryTable component
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // THEN: Button has aria-label
    const receiveButton = screen.getByTestId("receive-packs-button");
    expect(receiveButton).toHaveAttribute(
      "aria-label",
      "Receive lottery packs",
    );
  });

  // ============ EDGE CASES ============

  it("6.10.1-COMPONENT-EDGE-017: [P2] should handle pack with null game data", async () => {
    // GIVEN: LotteryTable component with pack that has no game
    const packWithoutGame = {
      pack_id: "pack-no-game",
      pack_number: "P001",
      status: "ACTIVE" as const,
      serial_start: "1000",
      serial_end: "2000",
      game_id: null,
      store_id: "store-1",
      current_bin_id: "bin-1",
      received_at: "2025-01-15T10:00:00Z",
      activated_at: "2025-01-16T10:00:00Z",
      depleted_at: null,
      returned_at: null,
      game: null,
      bin: null,
    };

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [packWithoutGame],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    // WHEN: Component is rendered
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // THEN: Table displays fallback values for missing game data
    expect(
      screen.getByText("Unknown Game"),
      "Unknown Game should be displayed for null game",
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("N/A").length,
      "N/A should be displayed for missing game code and price",
    ).toBeGreaterThanOrEqual(2);
  });

  it("6.10.1-COMPONENT-EDGE-018: [P2] should handle pack with missing game price", async () => {
    // GIVEN: LotteryTable component with pack that has no game price
    const packWithoutPrice = {
      ...mockPacks[0],
      game: {
        game_id: "game-1",
        game_code: "001",
        name: "Game Without Price",
        price: null as unknown as number,
      },
    };

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [packWithoutPrice],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    // WHEN: Component is rendered
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // THEN: Table displays "N/A" for missing price
    expect(
      screen.getByText("N/A"),
      "N/A should be displayed for missing price",
    ).toBeInTheDocument();

    // AND: Game name is still displayed
    expect(
      screen.getByText("Game Without Price"),
      "Game name should still be displayed",
    ).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-019: [P2] should sort games alphabetically by name", async () => {
    // GIVEN: LotteryTable component with games in random order
    // WHEN: Component is rendered
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // THEN: Games are sorted alphabetically (Mega Millions before Powerball)
    const rows = screen.getAllByTestId(/lottery-table-row-/);
    expect(rows.length, "Should have 2 game rows").toBe(2);

    // Verify first row is Mega Millions (alphabetically first)
    expect(
      rows[0],
      "First row should be game-1 (Mega Millions)",
    ).toHaveAttribute("data-testid", "lottery-table-row-game-1");
    expect(rows[1], "Second row should be game-2 (Powerball)").toHaveAttribute(
      "data-testid",
      "lottery-table-row-game-2",
    );
  });

  it("6.10.1-COMPONENT-EDGE-020: [P2] should handle bins API failure gracefully", async () => {
    // GIVEN: Bins API returns error
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    // WHEN: Component is rendered
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // THEN: Total bins shows 0 (graceful fallback)
    await waitFor(() => {
      expect(screen.getByTestId("total-bins-count")).toHaveTextContent("0");
    });
  });

  it("6.10.1-COMPONENT-EDGE-021: [P2] should expand row with no visible packs and show message", async () => {
    // GIVEN: Pack where all packs are DEPLETED
    const allDepletedPacks = [
      {
        pack_id: "pack-1",
        pack_number: "P001",
        status: "DEPLETED" as const,
        serial_start: "1000",
        serial_end: "2000",
        game_id: "game-1",
        store_id: "store-1",
        current_bin_id: null,
        received_at: "2025-01-10T10:00:00Z",
        activated_at: "2025-01-11T10:00:00Z",
        depleted_at: "2025-01-15T10:00:00Z",
        returned_at: null,
        game: {
          game_id: "game-1",
          game_code: "001",
          name: "All Sold Game",
          price: 5.0,
        },
        bin: null,
      },
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: allDepletedPacks,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();

    // Select SOLD filter to see the game
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    const statusSelect = screen.getByTestId("filter-status");
    await user.click(statusSelect);
    const soldOption = await screen.findByRole("option", { name: "Sold" });
    await user.click(soldOption);

    // WHEN: User expands the game row
    const gameRow = screen.getByTestId("lottery-table-row-game-1");
    await user.click(gameRow);

    // THEN: Sub-list header is shown and empty message is displayed
    expect(screen.getByTestId("pack-details-game-1")).toBeInTheDocument();
    expect(
      screen.getByText(/no active or received packs/i),
    ).toBeInTheDocument();
  });

  // ============ STORE DROPDOWN TESTS ============

  it("6.10.1-COMPONENT-STORE-001: [P2] should show store dropdown when multiple stores exist", async () => {
    // GIVEN: LotteryTable with multiple stores
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // THEN: Store dropdown is displayed
    expect(screen.getByTestId("store-selector")).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-STORE-002: [P2] should hide store dropdown when only one store exists", async () => {
    // GIVEN: LotteryTable with single store
    const singleStoreProps = {
      ...defaultTestProps,
      stores: [{ store_id: "store-1", name: "Only Store" }],
    };

    renderWithQueryClient(<LotteryTable {...singleStoreProps} />);

    // THEN: Store dropdown is NOT displayed
    expect(screen.queryByTestId("store-selector")).not.toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-STORE-003: [P2] should call onStoreChange when store is selected", async () => {
    // GIVEN: LotteryTable with multiple stores
    const onStoreChange = vi.fn();
    const user = userEvent.setup();

    renderWithQueryClient(
      <LotteryTable {...defaultTestProps} onStoreChange={onStoreChange} />,
    );

    // WHEN: User selects a different store
    const storeSelector = screen.getByTestId("store-selector");
    await user.click(storeSelector);
    const store2Option = await screen.findByRole("option", {
      name: "Test Store 2",
    });
    await user.click(store2Option);

    // THEN: onStoreChange is called with the new store ID
    expect(onStoreChange).toHaveBeenCalledWith("store-2");
  });

  it("6.10.1-COMPONENT-STORE-004: [P2] should validate store selection against allowed stores", async () => {
    // GIVEN: LotteryTable with specific stores
    const onStoreChange = vi.fn();
    const user = userEvent.setup();

    renderWithQueryClient(
      <LotteryTable {...defaultTestProps} onStoreChange={onStoreChange} />,
    );

    // WHEN: User selects a valid store
    const storeSelector = screen.getByTestId("store-selector");
    await user.click(storeSelector);
    const store2Option = await screen.findByRole("option", {
      name: "Test Store 2",
    });
    await user.click(store2Option);

    // THEN: Callback is invoked (validation passed)
    expect(onStoreChange).toHaveBeenCalledTimes(1);
  });

  it("6.10.1-COMPONENT-STORE-005: [P2] should have accessible label on store dropdown", async () => {
    // GIVEN: LotteryTable with multiple stores
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // THEN: Store dropdown has aria-label
    const storeSelector = screen.getByTestId("store-selector");
    expect(storeSelector).toHaveAttribute("aria-label", "Select store");
  });

  // ============ RETURNED FILTER TESTS (Story: Lottery Pack Return Feature) ============

  it("6.10.1-COMPONENT-RETURN-001: [P2] should have RETURNED option in status filter", async () => {
    // GIVEN: LotteryTable component
    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // WHEN: User opens status filter dropdown
    const statusSelect = screen.getByTestId("filter-status");
    await user.click(statusSelect);

    // THEN: RETURNED option is available
    const returnedOption = await screen.findByRole("option", {
      name: "Returned",
    });
    expect(returnedOption).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-RETURN-002: [P2] should filter to show RETURNED packs when Returned selected", async () => {
    // GIVEN: LotteryTable with RETURNED packs
    const packsWithReturned = [
      ...mockPacks,
      {
        pack_id: "pack-returned",
        pack_number: "P100",
        status: "RETURNED" as const,
        serial_start: "8001",
        serial_end: "9000",
        game_id: "game-3",
        store_id: "store-1",
        current_bin_id: null,
        received_at: "2025-01-10T10:00:00Z",
        activated_at: null,
        depleted_at: null,
        returned_at: "2025-01-15T10:00:00Z",
        game: {
          game_id: "game-3",
          game_code: "003",
          name: "Returned Game",
          price: 3.0,
        },
        bin: null,
      },
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: packsWithReturned,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // WHEN: User selects RETURNED status filter
    const statusSelect = screen.getByTestId("filter-status");
    await user.click(statusSelect);
    const returnedOption = await screen.findByRole("option", {
      name: "Returned",
    });
    await user.click(returnedOption);

    // THEN: Only RETURNED games are shown
    expect(screen.getByText("Returned Game")).toBeInTheDocument();
    expect(screen.queryByText("Mega Millions")).not.toBeInTheDocument();
    expect(screen.queryByText("Powerball")).not.toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-RETURN-003: [P2] should show returned packs when RETURNED filter is selected", async () => {
    // GIVEN: LotteryTable with RETURNED packs
    const packsWithReturned = [
      ...mockPacks,
      {
        pack_id: "pack-returned",
        pack_number: "P100",
        status: "RETURNED" as const,
        serial_start: "8001",
        serial_end: "9000",
        game_id: "game-1", // Same game as mockPacks
        store_id: "store-1",
        current_bin_id: null,
        received_at: "2025-01-10T10:00:00Z",
        activated_at: null,
        depleted_at: null,
        returned_at: "2025-01-15T10:00:00Z",
        can_return: false, // Already returned
        game: {
          game_id: "game-1",
          game_code: "001",
          name: "Mega Millions",
          price: 5.0,
          status: "ACTIVE",
        },
        bin: null,
      },
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: packsWithReturned,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // WHEN: User selects RETURNED status filter
    const statusSelect = screen.getByTestId("filter-status");
    await user.click(statusSelect);
    const returnedOption = await screen.findByRole("option", {
      name: "Returned",
    });
    await user.click(returnedOption);

    // THEN: Game row is visible with pack count of 1 (only the returned pack)
    const gameRow = screen.getByTestId("lottery-table-row-game-1");
    expect(gameRow).toBeInTheDocument();
    // The table shows total pack count in the Pack Count column (which is 1 for this filtered view)
    expect(within(gameRow).getByText("1")).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-RETURN-004: [P2] should show Return button in expanded pack row", async () => {
    // GIVEN: LotteryTable component with packs that have can_return field
    const packsWithCanReturn = mockPacks.map((pack) => ({
      ...pack,
      can_return: pack.status === "ACTIVE" || pack.status === "RECEIVED",
    }));

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: packsWithCanReturn,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // WHEN: User expands a game row
    const gameRow = screen.getByTestId("lottery-table-row-game-1");
    await user.click(gameRow);

    // THEN: Return buttons are displayed for each pack (replaced checkboxes)
    expect(screen.getByTestId("return-pack-btn-pack-1")).toBeInTheDocument();
    expect(screen.getByTestId("return-pack-btn-pack-2")).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-RETURN-005: [P2] should disable Return button for already RETURNED packs", async () => {
    // GIVEN: LotteryTable with RETURNED pack
    // SEC-010: AUTHZ - can_return=false for already returned packs (from backend)
    const packsWithReturned = [
      {
        pack_id: "pack-returned",
        pack_number: "P100",
        status: "RETURNED" as const,
        serial_start: "8001",
        serial_end: "9000",
        game_id: "game-3",
        store_id: "store-1",
        current_bin_id: null,
        received_at: "2025-01-10T10:00:00Z",
        activated_at: null,
        depleted_at: null,
        returned_at: "2025-01-15T10:00:00Z",
        can_return: false, // Backend says cannot return again
        game: {
          game_id: "game-3",
          game_code: "003",
          name: "Returned Game",
          price: 3.0,
          status: "ACTIVE",
        },
        bin: null,
      },
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: packsWithReturned,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // Select RETURNED filter to see the pack
    const statusSelect = screen.getByTestId("filter-status");
    await user.click(statusSelect);
    const returnedOption = await screen.findByRole("option", {
      name: "Returned",
    });
    await user.click(returnedOption);

    // Expand the game row
    const gameRow = screen.getByTestId("lottery-table-row-game-3");
    await user.click(gameRow);

    // THEN: Return button is disabled (replaced checkbox)
    const returnBtn = screen.getByTestId("return-pack-btn-pack-returned");
    expect(returnBtn).toBeDisabled();
    expect(returnBtn).toHaveAttribute(
      "aria-label",
      "Pack P100 already returned",
    );
  });

  it("6.10.1-COMPONENT-RETURN-006: [P2] should show aligned columns in expanded pack sub-list", async () => {
    // GIVEN: LotteryTable component
    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // WHEN: User expands a game row
    const gameRow = screen.getByTestId("lottery-table-row-game-1");
    await user.click(gameRow);

    // THEN: Sub-list has aligned column headers (no serial range, just Pack #)
    const packDetails = screen.getByTestId("pack-details-game-1");
    expect(within(packDetails).getByText("Pack #")).toBeInTheDocument();
    expect(within(packDetails).getByText("Received At")).toBeInTheDocument();
    expect(within(packDetails).getByText("Activated At")).toBeInTheDocument();
    expect(within(packDetails).getByText("Returned At")).toBeInTheDocument();
    expect(within(packDetails).getByText("Status")).toBeInTheDocument();
    // "Returned" column header was replaced with "Actions" for Return button
    expect(within(packDetails).getByText("Actions")).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-RETURN-007: [P2] should show Pack # only in aligned sub-list (no serial range)", async () => {
    // GIVEN: LotteryTable component
    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // WHEN: User expands a game row
    const gameRow = screen.getByTestId("lottery-table-row-game-1");
    await user.click(gameRow);

    // THEN: Pack number is displayed (no serial range per user request)
    expect(screen.getByText("#P001")).toBeInTheDocument();
    expect(screen.getByText("#P002")).toBeInTheDocument();
    // Serial range should NOT be displayed
    expect(screen.queryByText("1000 - 2000")).not.toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-RETURN-008: [P2] should not count RETURNED packs in remaining total", async () => {
    // GIVEN: LotteryTable with RETURNED packs
    const packsWithReturned = [
      ...mockPacks,
      {
        pack_id: "pack-returned",
        pack_number: "P100",
        status: "RETURNED" as const,
        serial_start: "8001",
        serial_end: "9000",
        game_id: "game-3",
        store_id: "store-1",
        current_bin_id: null,
        received_at: "2025-01-10T10:00:00Z",
        activated_at: null,
        depleted_at: null,
        returned_at: "2025-01-15T10:00:00Z",
        game: {
          game_id: "game-3",
          game_code: "003",
          name: "Returned Game",
          price: 3.0,
        },
        bin: null,
      },
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: packsWithReturned,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // THEN: Total remaining packs still shows 3 (RETURNED not counted)
    expect(screen.getByTestId("total-remaining-packs-count")).toHaveTextContent(
      "3",
    );
  });

  it("6.10.1-COMPONENT-RETURN-009: [P2] should hide RETURNED packs from default view sub-list", async () => {
    // GIVEN: LotteryTable with mix of ACTIVE and RETURNED packs for same game
    const packsWithReturned = [
      ...mockPacks.slice(0, 2), // Keep the 2 ACTIVE Mega Millions packs
      {
        pack_id: "pack-returned",
        pack_number: "P999",
        status: "RETURNED" as const,
        serial_start: "9001",
        serial_end: "9999",
        game_id: "game-1", // Same game
        store_id: "store-1",
        current_bin_id: null,
        received_at: "2025-01-10T10:00:00Z",
        activated_at: null,
        depleted_at: null,
        returned_at: "2025-01-15T10:00:00Z",
        game: {
          game_id: "game-1",
          game_code: "001",
          name: "Mega Millions",
          price: 5.0,
        },
        bin: null,
      },
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: packsWithReturned,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    renderWithQueryClient(<LotteryTable {...defaultTestProps} />);

    // WHEN: User expands Mega Millions row
    const gameRow = screen.getByTestId("lottery-table-row-game-1");
    await user.click(gameRow);

    // THEN: RETURNED pack is NOT shown in sub-list (pack rows are direct children, not nested)
    expect(screen.getByText("#P001")).toBeInTheDocument();
    expect(screen.getByText("#P002")).toBeInTheDocument();
    expect(screen.queryByText("#P999")).not.toBeInTheDocument();
  });
});
