/**
 * Component Tests: LotteryTable
 *
 * Tests LotteryTable component rendering and interactions:
 * - Displays table with correct columns (Game Name, Game Number, Dollar Value, Pack Count, Status)
 * - Groups packs by game and shows aggregate counts
 * - Displays empty state when no inventory exists
 * - Security: XSS prevention in displayed game data
 * - Accessibility: ARIA attributes, table semantics
 *
 * @test-level COMPONENT
 * @justification Tests UI component behavior in isolation - fast, isolated, granular
 * @story 6-10-1 - Client Dashboard Lottery Page
 * @priority P2 (Medium - Table Display)
 * @enhanced-by workflow-9 on 2025-01-28
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LotteryTable } from "@/components/lottery/LotteryTable";

// Mock useLotteryPacks hook
vi.mock("@/hooks/useLottery", () => ({
  useLotteryPacks: vi.fn(),
}));

import { useLotteryPacks } from "@/hooks/useLottery";

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
      received_at: new Date(),
      activated_at: new Date(),
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
      received_at: new Date(),
      activated_at: new Date(),
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
      received_at: new Date(),
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

  // Test isolation: Clean up after each test
  beforeEach(() => {
    vi.clearAllMocks();
    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockPacks,
      isLoading: false,
      isError: false,
      error: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("6.10.1-COMPONENT-005: [P2] should display table with correct columns", async () => {
    // GIVEN: LotteryTable component with packs
    // WHEN: Component is rendered
    render(
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
    render(
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
    render(
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

  it("6.10.1-COMPONENT-008: [P2] should filter out DEPLETED and RETURNED packs from counts", async () => {
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
        received_at: new Date(),
        activated_at: new Date(),
        depleted_at: new Date(),
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
    });

    // WHEN: Component is rendered
    render(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

    // THEN: DEPLETED pack is NOT counted (still shows 2 for Mega Millions)
    expect(
      screen.getByText("2"),
      "Pack count should still be 2 (DEPLETED not counted)",
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
    });

    // WHEN: Component is rendered
    render(
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
    });

    // WHEN: Component is rendered
    render(
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
    });

    // WHEN: Component is rendered
    render(
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
      received_at: new Date(),
      activated_at: new Date(),
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
    });

    // WHEN: Component is rendered
    render(
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

  // ============ ACCESSIBILITY TESTS ============

  it("6.10.1-COMPONENT-A11Y-003: [P2] should have proper ARIA attributes for table", async () => {
    // GIVEN: LotteryTable component
    // WHEN: Component is rendered
    render(
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
      received_at: new Date(),
      activated_at: new Date(),
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
    });

    // WHEN: Component is rendered
    render(
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
        price: null as any,
      },
    };

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [packWithoutPrice],
      isLoading: false,
      isError: false,
      error: null,
    });

    // WHEN: Component is rendered
    render(
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
    render(
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
});
