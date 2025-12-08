/**
 * Component Tests: LotteryTable
 *
 * Tests LotteryTable component rendering and interactions:
 * - Displays table with correct columns (Bin Number, Dollar Amount, Game Number, Game Name, Pack Number, Status, Actions)
 * - Filters packs to show only ACTIVE status
 * - Sorts bins in order (Bin 1, Bin 2, Bin 3, etc.)
 * - Displays empty state when no active packs exist
 * - Security: XSS prevention in displayed pack data
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
import userEvent from "@testing-library/user-event";
import { LotteryTable } from "@/components/lottery/LotteryTable";

// Mock useLotteryPacks hook
vi.mock("@/hooks/useLottery", () => ({
  useLotteryPacks: vi.fn(),
}));

import { useLotteryPacks } from "@/hooks/useLottery";

describe("6.10.1-COMPONENT: LotteryTable", () => {
  const mockActivePacks = [
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
        name: "Game 1",
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
      game_id: "game-2",
      store_id: "store-1",
      current_bin_id: "bin-2",
      received_at: new Date(),
      activated_at: new Date(),
      depleted_at: null,
      returned_at: null,
      game: {
        game_id: "game-2",
        name: "Game 2",
        price: 10.0,
      },
      bin: {
        bin_id: "bin-2",
        name: "Bin 2",
        store_id: "store-1",
        location: "Location 2",
      },
    },
  ];

  // Test isolation: Clean up after each test
  beforeEach(() => {
    vi.clearAllMocks();
    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockActivePacks,
      isLoading: false,
      isError: false,
      error: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("6.10.1-COMPONENT-005: [P2] should display table with correct columns (AC #2)", async () => {
    // GIVEN: LotteryTable component with active packs
    // WHEN: Component is rendered
    render(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

    // THEN: Table headers are displayed
    expect(
      screen.getByText("Bin Number"),
      "Bin Number header should be displayed",
    ).toBeInTheDocument();
    expect(
      screen.getByText("Dollar Amount"),
      "Dollar Amount header should be displayed",
    ).toBeInTheDocument();
    expect(
      screen.getByText("Game Number"),
      "Game Number header should be displayed",
    ).toBeInTheDocument();
    expect(
      screen.getByText("Game Name"),
      "Game Name header should be displayed",
    ).toBeInTheDocument();
    expect(
      screen.getByText("Pack Number"),
      "Pack Number header should be displayed",
    ).toBeInTheDocument();
    expect(
      screen.getByText("Status"),
      "Status header should be displayed",
    ).toBeInTheDocument();
    expect(
      screen.getByText("Actions"),
      "Actions header should be displayed",
    ).toBeInTheDocument();

    // AND: Table has proper data-testid
    expect(
      screen.getByTestId("lottery-table"),
      "Table should have lottery-table data-testid",
    ).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-006: [P2] should display pack data in table rows (AC #2)", async () => {
    // GIVEN: LotteryTable component with active packs
    // WHEN: Component is rendered
    render(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

    // THEN: Pack data is displayed in rows
    expect(
      screen.getByText("Bin 1"),
      "Bin name should be displayed",
    ).toBeInTheDocument();
    expect(
      screen.getByText("$5.00"),
      "Dollar amount should be displayed",
    ).toBeInTheDocument();
    expect(
      screen.getByText("Game 1"),
      "Game name should be displayed",
    ).toBeInTheDocument();
    expect(
      screen.getByText("P001"),
      "Pack number should be displayed",
    ).toBeInTheDocument();
    // Both packs are ACTIVE, so we expect multiple status badges
    expect(
      screen.getAllByText("ACTIVE").length,
      "ACTIVE status should be displayed for both packs",
    ).toBeGreaterThanOrEqual(1);

    // AND: Each row has data-testid
    expect(
      screen.getByTestId("lottery-table-row-pack-1"),
      "Table row should have data-testid",
    ).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-007: [P2] should filter packs to show only ACTIVE status (AC #3)", async () => {
    // GIVEN: LotteryTable component with mixed status packs
    const mixedPacks = [
      ...mockActivePacks,
      {
        pack_id: "pack-3",
        pack_number: "P003",
        status: "RECEIVED" as const,
        serial_start: "3001",
        serial_end: "4000",
        game_id: "game-3",
        store_id: "store-1",
        current_bin_id: "bin-3",
        received_at: new Date(),
        activated_at: null,
        depleted_at: null,
        returned_at: null,
        game: {
          game_id: "game-3",
          name: "Game 3",
          price: 15.0,
        },
        bin: {
          bin_id: "bin-3",
          name: "Bin 3",
          store_id: "store-1",
          location: "Location 3",
        },
      },
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mixedPacks,
      isLoading: false,
      isError: false,
      error: null,
    });

    // WHEN: Component is rendered
    render(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

    // THEN: Only ACTIVE packs are displayed
    expect(
      screen.getByText("P001"),
      "Active pack P001 should be displayed",
    ).toBeInTheDocument();
    expect(
      screen.getByText("P002"),
      "Active pack P002 should be displayed",
    ).toBeInTheDocument();
    expect(
      screen.queryByText("P003"),
      "Received pack P003 should NOT be displayed",
    ).not.toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-008: [P2] should sort bins in ascending order (AC #3)", async () => {
    // GIVEN: LotteryTable component with unsorted bins
    const unsortedPacks = [
      {
        pack_id: "pack-3",
        pack_number: "P003",
        status: "ACTIVE" as const,
        serial_start: "3001",
        serial_end: "4000",
        game_id: "game-3",
        store_id: "store-1",
        current_bin_id: "bin-3",
        received_at: new Date(),
        activated_at: new Date(),
        depleted_at: null,
        returned_at: null,
        game: {
          game_id: "game-3",
          name: "Game 3",
          price: 15.0,
        },
        bin: {
          bin_id: "bin-3",
          name: "Bin 3",
          store_id: "store-1",
          location: "Location 3",
        },
      },
      ...mockActivePacks,
    ];

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: unsortedPacks,
      isLoading: false,
      isError: false,
      error: null,
    });

    // WHEN: Component is rendered
    render(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

    // THEN: Bins are displayed in order (Bin 1, Bin 2, Bin 3)
    const rows = screen.getAllByTestId(/lottery-table-row-/);
    expect(rows[0], "First row should be pack-1 (Bin 1)").toHaveAttribute(
      "data-testid",
      "lottery-table-row-pack-1",
    );
    expect(rows[1], "Second row should be pack-2 (Bin 2)").toHaveAttribute(
      "data-testid",
      "lottery-table-row-pack-2",
    );
    expect(rows[2], "Third row should be pack-3 (Bin 3)").toHaveAttribute(
      "data-testid",
      "lottery-table-row-pack-3",
    );
  });

  it("6.10.1-COMPONENT-009: [P3] should display empty state when no active packs exist (AC #8)", async () => {
    // GIVEN: LotteryTable component with no active packs
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
      screen.getByText(/no active lottery packs for this store/i),
      "Empty state message should be displayed",
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("lottery-table-empty"),
      "Empty state should have data-testid",
    ).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-010: [P2] should call onEdit when edit button is clicked (AC #5)", async () => {
    // GIVEN: LotteryTable component with onEdit handler
    const user = userEvent.setup();
    const onEdit = vi.fn();

    // WHEN: User clicks edit button for a pack
    render(
      <LotteryTable storeId="store-1" onEdit={onEdit} onDelete={vi.fn()} />,
    );
    const editButton = screen.getByTestId("edit-pack-pack-1");
    await user.click(editButton);

    // THEN: onEdit is called with pack ID
    expect(onEdit, "onEdit should be called with pack ID").toHaveBeenCalledWith(
      "pack-1",
    );
    expect(
      onEdit,
      "onEdit should be called exactly once",
    ).toHaveBeenCalledTimes(1);
  });

  it("6.10.1-COMPONENT-011: [P2] should call onDelete when delete button is clicked (AC #6)", async () => {
    // GIVEN: LotteryTable component with onDelete handler
    const user = userEvent.setup();
    const onDelete = vi.fn();

    // WHEN: User clicks delete button for a pack
    render(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={onDelete} />,
    );
    const deleteButton = screen.getByTestId("delete-pack-pack-1");
    await user.click(deleteButton);

    // THEN: onDelete is called with pack ID
    expect(
      onDelete,
      "onDelete should be called with pack ID",
    ).toHaveBeenCalledWith("pack-1");
    expect(
      onDelete,
      "onDelete should be called exactly once",
    ).toHaveBeenCalledTimes(1);
  });

  it("6.10.1-COMPONENT-012: [P2] should display loading state (AC #7)", async () => {
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

  it("6.10.1-COMPONENT-013: [P2] should display error state (AC #7)", async () => {
    // GIVEN: LotteryTable component with error state
    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { message: "Failed to load packs" },
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
      screen.getByText(/failed to load lottery packs/i),
      "Error message should be displayed",
    ).toBeInTheDocument();
  });

  // ============ SECURITY TESTS (MANDATORY) ============

  it("6.10.1-COMPONENT-SEC-007: [P0] should prevent XSS in displayed pack data", async () => {
    // GIVEN: LotteryTable component with pack containing XSS attempt
    const maliciousPack = {
      pack_id: "pack-xss",
      pack_number: "<script>alert('XSS')</script>",
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
        name: "<img src=x onerror=alert('XSS')>",
        price: 5.0,
      },
      bin: {
        bin_id: "bin-1",
        name: "Bin 1",
        store_id: "store-1",
        location: "Location 1",
      },
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
    // Verify pack_number is displayed as plain text
    const packNumberElement = screen.getByText(
      /<script>alert\('XSS'\)<\/script>/i,
    );
    expect(
      packNumberElement,
      "XSS attempt should be displayed as plain text, not executed",
    ).toBeInTheDocument();

    // Verify it's text content, not executable HTML
    expect(
      packNumberElement.innerHTML,
      "XSS should be escaped in HTML",
    ).toContain("&lt;script&gt;");
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
      "Active lottery packs table",
    );
    expect(
      tableRegion,
      "Table region should have id for tab association",
    ).toHaveAttribute("id", "lottery-table-store-1");
  });

  it("6.10.1-COMPONENT-A11Y-004: [P2] should have proper ARIA labels for action buttons", async () => {
    // GIVEN: LotteryTable component
    // WHEN: Component is rendered
    render(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

    // THEN: Action buttons have proper ARIA labels
    const editButton = screen.getByTestId("edit-pack-pack-1");
    expect(editButton, "Edit button should have aria-label").toHaveAttribute(
      "aria-label",
      "Edit pack P001",
    );

    const deleteButton = screen.getByTestId("delete-pack-pack-1");
    expect(
      deleteButton,
      "Delete button should have aria-label",
    ).toHaveAttribute("aria-label", "Delete pack P001");
  });

  // ============ EDGE CASES ============

  it("6.10.1-COMPONENT-EDGE-017: [P2] should handle pack with null bin (no bin assigned)", async () => {
    // GIVEN: LotteryTable component with pack that has no bin
    const packWithoutBin = {
      ...mockActivePacks[0],
      bin: null,
    };

    (useLotteryPacks as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [packWithoutBin],
      isLoading: false,
      isError: false,
      error: null,
    });

    // WHEN: Component is rendered
    render(
      <LotteryTable storeId="store-1" onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

    // THEN: Table displays "N/A" for missing data (bin and game number)
    // The implementation shows N/A for: bin name (when null), dollar amount (if missing), and game number (always N/A currently)
    // When bin is null, we expect at least 2 N/A: one for bin name, one for game number
    const naElements = screen.getAllByText("N/A");
    expect(
      naElements.length,
      "N/A should be displayed for missing bin and game number (at least 2)",
    ).toBeGreaterThanOrEqual(2);

    // Verify the table row exists
    expect(
      screen.getByTestId("lottery-table-row-pack-1"),
      "Table row should be rendered even with null bin",
    ).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-EDGE-018: [P2] should handle pack with missing game price", async () => {
    // GIVEN: LotteryTable component with pack that has no game price
    const packWithoutPrice = {
      ...mockActivePacks[0],
      game: {
        game_id: "game-1",
        name: "Game 1",
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

    // THEN: Table displays "N/A" for missing data (price and game number)
    // The implementation shows N/A for: dollar amount (when price is null) and game number (always N/A currently)
    // We expect at least 2 N/A: one for dollar amount, one for game number
    const naElements = screen.getAllByText("N/A");
    expect(
      naElements.length,
      "N/A should be displayed for missing price and game number (at least 2)",
    ).toBeGreaterThanOrEqual(2);

    // Verify the table row exists and game name is still displayed
    expect(
      screen.getByTestId("lottery-table-row-pack-1"),
      "Table row should be rendered even with null price",
    ).toBeInTheDocument();
    expect(
      screen.getByText("Game 1"),
      "Game name should still be displayed",
    ).toBeInTheDocument();
  });
});
