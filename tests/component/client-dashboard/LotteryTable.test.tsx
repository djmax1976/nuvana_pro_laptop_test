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
  useUpdateGame: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}));

// Mock fetch for bins API
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { useLotteryPacks } from "@/hooks/useLottery";

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
      game: {
        game_id: "game-1",
        game_code: "001",
        name: "Mega Millions",
        price: 5.0,
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
      game: {
        game_id: "game-1",
        game_code: "001",
        name: "Mega Millions",
        price: 5.0,
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
      game: {
        game_id: "game-2",
        game_code: "002",
        name: "Powerball",
        price: 10.0,
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
    renderWithQueryClient(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

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
    renderWithQueryClient(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

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

  it("6.10.1-COMPONENT-007: [P2] should show status badges with pack counts", async () => {
    // GIVEN: LotteryTable component with mixed status packs
    // WHEN: Component is rendered
    renderWithQueryClient(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

    // THEN: Status badges are displayed with counts
    expect(
      screen.getByText("2 Active"),
      "2 Active badge should be displayed for Mega Millions",
    ).toBeInTheDocument();
    expect(
      screen.getByText("1 Received"),
      "1 Received badge should be displayed for Powerball",
    ).toBeInTheDocument();
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
    renderWithQueryClient(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

    // THEN: DEPLETED pack is NOT counted in default view (still shows 2 for Mega Millions)
    expect(
      screen.getByText("2"),
      "Pack count should still be 2 (DEPLETED not counted in default view)",
    ).toBeInTheDocument();
    expect(
      screen.getByText("2 Active"),
      "Active count should still be 2",
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
    renderWithQueryClient(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

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
    renderWithQueryClient(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

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
    renderWithQueryClient(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

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
    renderWithQueryClient(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

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
    renderWithQueryClient(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

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
    renderWithQueryClient(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

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
    renderWithQueryClient(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

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
    renderWithQueryClient(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

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
    renderWithQueryClient(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

    // WHEN: User clicks on a game row
    const gameRow = screen.getByTestId("lottery-table-row-game-1");
    await user.click(gameRow);

    // THEN: Pack details are expanded
    expect(screen.getByTestId("pack-details-game-1")).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-EXPAND-002: [P2] should display pack details in expanded row", async () => {
    // GIVEN: LotteryTable component
    const user = userEvent.setup();
    renderWithQueryClient(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

    // WHEN: User expands a game row
    const gameRow = screen.getByTestId("lottery-table-row-game-1");
    await user.click(gameRow);

    // THEN: Pack details table shows correct columns and data
    const packDetails = screen.getByTestId("pack-details-game-1");

    // Check sub-table headers
    expect(within(packDetails).getByText("Pack #")).toBeInTheDocument();
    expect(within(packDetails).getByText("Serial Range")).toBeInTheDocument();
    expect(within(packDetails).getByText("Bin")).toBeInTheDocument();

    // Check pack data
    expect(within(packDetails).getByText("P001")).toBeInTheDocument();
    expect(within(packDetails).getByText("P002")).toBeInTheDocument();
    expect(within(packDetails).getByText("1000 - 2000")).toBeInTheDocument();
    expect(within(packDetails).getByText("Bin 1")).toBeInTheDocument();
    expect(within(packDetails).getByText("Bin 2")).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-EXPAND-003: [P2] should collapse row when clicked again", async () => {
    // GIVEN: LotteryTable component with expanded row
    const user = userEvent.setup();
    renderWithQueryClient(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

    const gameRow = screen.getByTestId("lottery-table-row-game-1");
    await user.click(gameRow); // Expand
    expect(screen.getByTestId("pack-details-game-1")).toBeInTheDocument();

    // WHEN: User clicks the row again
    await user.click(gameRow);

    // THEN: Pack details are collapsed
    expect(screen.queryByTestId("pack-details-game-1")).not.toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-EXPAND-004: [P2] should expand via chevron button", async () => {
    // GIVEN: LotteryTable component
    const user = userEvent.setup();
    renderWithQueryClient(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

    // WHEN: User clicks the expand button
    const expandButton = screen.getByTestId("expand-game-game-1");
    await user.click(expandButton);

    // THEN: Pack details are expanded
    expect(screen.getByTestId("pack-details-game-1")).toBeInTheDocument();
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
    renderWithQueryClient(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

    // WHEN: User expands Mega Millions row
    const gameRow = screen.getByTestId("lottery-table-row-game-1");
    await user.click(gameRow);

    // THEN: DEPLETED pack is NOT shown in sub-list
    const packDetails = screen.getByTestId("pack-details-game-1");
    expect(within(packDetails).getByText("P001")).toBeInTheDocument();
    expect(within(packDetails).getByText("P002")).toBeInTheDocument();
    expect(within(packDetails).queryByText("P999")).not.toBeInTheDocument();
  });

  // ============ BADGE TESTS ============

  it("6.10.1-COMPONENT-BADGE-001: [P2] should display total bins count", async () => {
    // GIVEN: LotteryTable component with mocked bins
    renderWithQueryClient(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

    // THEN: Total bins badge shows correct count
    await waitFor(() => {
      expect(screen.getByTestId("total-bins-badge")).toBeInTheDocument();
      expect(screen.getByTestId("total-bins-count")).toHaveTextContent("3");
    });
  });

  it("6.10.1-COMPONENT-BADGE-002: [P2] should display total remaining packs count", async () => {
    // GIVEN: LotteryTable component with 3 packs (2 ACTIVE, 1 RECEIVED)
    renderWithQueryClient(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

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

    renderWithQueryClient(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

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
        storeId="store-1"
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
    renderWithQueryClient(<LotteryTable storeId="store-1" />);

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
    renderWithQueryClient(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

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
    renderWithQueryClient(<LotteryTable storeId="store-1" />);

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
    renderWithQueryClient(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

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
    renderWithQueryClient(<LotteryTable storeId="store-1" />);

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
    renderWithQueryClient(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

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
    renderWithQueryClient(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

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
    renderWithQueryClient(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

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
    renderWithQueryClient(<LotteryTable storeId="store-1" />);

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
    renderWithQueryClient(<LotteryTable storeId="store-1" />);

    const statusSelect = screen.getByTestId("filter-status");
    await user.click(statusSelect);
    const soldOption = await screen.findByRole("option", { name: "Sold" });
    await user.click(soldOption);

    // WHEN: User expands the game row
    const gameRow = screen.getByTestId("lottery-table-row-game-1");
    await user.click(gameRow);

    // THEN: Message about no active/received packs is shown
    const packDetails = screen.getByTestId("pack-details-game-1");
    expect(
      within(packDetails).getByText(/no active or received packs/i),
    ).toBeInTheDocument();
  });
});
