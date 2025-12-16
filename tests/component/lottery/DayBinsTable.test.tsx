/**
 * @test-level COMPONENT
 * @justification Tests UI component behavior in isolation - fast, isolated, granular
 *
 * Component Tests: DayBinsTable
 *
 * Tests DayBinsTable component behavior for day-based bin tracking:
 * - Display columns: Bin, Name, Amount, Pack #, Starting, Ending
 * - Row click interactions
 * - Empty bin styling (grayed out)
 * - Ending column styling (grayed out, read-only)
 * - Empty state when no bins exist
 * - XSS prevention for user-generated content
 *
 * MCP Guidance Applied:
 * - TESTING: Component tests are fast, isolated, and granular
 * - SECURITY: XSS prevention tests for all user-generated fields
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  DayBinsTable,
  type DayBinsTableProps,
} from "@/components/lottery/DayBinsTable";
import type { DayBin } from "@/lib/api/lottery";

describe("DayBinsTable Component", () => {
  const mockBins: DayBin[] = [
    {
      bin_id: "bin-001",
      bin_number: 1,
      pack: {
        pack_id: "pack-001",
        pack_number: "1234567",
        game_name: "Mega Millions",
        game_price: 5.0,
        starting_serial: "001",
        ending_serial: "025",
      },
    },
    {
      bin_id: "bin-002",
      bin_number: 2,
      pack: null, // Empty bin
    },
    {
      bin_id: "bin-003",
      bin_number: 3,
      pack: {
        pack_id: "pack-002",
        pack_number: "7654321",
        game_name: "Powerball",
        game_price: 10.0,
        starting_serial: "050",
        ending_serial: null, // No closing yet
      },
    },
  ];

  const defaultProps: DayBinsTableProps = {
    bins: mockBins,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BASIC RENDERING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("should render the table with correct data-testid", () => {
    // GIVEN: DayBinsTable with bins
    // WHEN: Component is rendered
    render(<DayBinsTable {...defaultProps} />);

    // THEN: Table is rendered with proper test id
    expect(screen.getByTestId("day-bins-table")).toBeInTheDocument();
  });

  it("should display all column headers correctly", () => {
    // GIVEN: DayBinsTable with bins
    // WHEN: Component is rendered
    render(<DayBinsTable {...defaultProps} />);

    // THEN: All column headers are displayed
    expect(screen.getByText("Bin")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Amount")).toBeInTheDocument();
    expect(screen.getByText("Pack #")).toBeInTheDocument();
    expect(screen.getByText("Starting")).toBeInTheDocument();
    expect(screen.getByText("Ending")).toBeInTheDocument();
  });

  it("should display bin data correctly for bins with packs", () => {
    // GIVEN: DayBinsTable with bins that have packs
    // WHEN: Component is rendered
    render(<DayBinsTable {...defaultProps} />);

    // THEN: First bin data is displayed correctly
    expect(screen.getByText("1")).toBeInTheDocument(); // Bin number
    expect(screen.getByText("Mega Millions")).toBeInTheDocument();
    expect(screen.getByText("$5.00")).toBeInTheDocument();
    expect(screen.getByText("1234567")).toBeInTheDocument();
    expect(screen.getByText("001")).toBeInTheDocument(); // Starting serial
    expect(screen.getByText("025")).toBeInTheDocument(); // Ending serial

    // Third bin data
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Powerball")).toBeInTheDocument();
    expect(screen.getByText("$10.00")).toBeInTheDocument();
    expect(screen.getByText("7654321")).toBeInTheDocument();
    expect(screen.getByText("050")).toBeInTheDocument(); // Starting serial
  });

  it("should sort bins by bin_number", () => {
    // GIVEN: Unsorted bins
    const unsortedBins: DayBin[] = [
      { ...mockBins[2], bin_number: 3 },
      { ...mockBins[0], bin_number: 1 },
      { ...mockBins[1], bin_number: 2 },
    ];

    // WHEN: Component is rendered
    render(<DayBinsTable bins={unsortedBins} />);

    // THEN: Bins are displayed in order
    const rows = screen.getAllByTestId(/day-bins-row-/);
    expect(rows[0]).toHaveAttribute("data-testid", "day-bins-row-bin-001");
    expect(rows[1]).toHaveAttribute("data-testid", "day-bins-row-bin-002");
    expect(rows[2]).toHaveAttribute("data-testid", "day-bins-row-bin-003");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EMPTY BIN STYLING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("should display '(Empty)' for bins without packs", () => {
    // GIVEN: DayBinsTable with empty bin
    // WHEN: Component is rendered
    render(<DayBinsTable {...defaultProps} />);

    // THEN: Empty bin shows '(Empty)' text
    expect(screen.getByText("(Empty)")).toBeInTheDocument();
  });

  it("should display '--' placeholders for empty bin fields", () => {
    // GIVEN: DayBinsTable with empty bin
    // WHEN: Component is rendered
    render(<DayBinsTable bins={[mockBins[1]]} />);

    // THEN: All data columns show '--' for empty bin
    const dashPlaceholders = screen.getAllByText("--");
    // Amount, Pack #, Starting, Ending = 4 placeholders
    expect(dashPlaceholders.length).toBeGreaterThanOrEqual(4);
  });

  it("should apply reduced opacity to empty bin rows", () => {
    // GIVEN: DayBinsTable with empty bin
    // WHEN: Component is rendered
    render(<DayBinsTable {...defaultProps} />);

    // THEN: Empty bin row has reduced opacity
    const emptyRow = screen.getByTestId("day-bins-row-bin-002");
    expect(emptyRow).toHaveClass("opacity-50");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ENDING SERIAL STYLING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("should display '--' for bins without ending serial", () => {
    // GIVEN: Bin with pack but no ending serial
    const binWithNoEnding: DayBin[] = [
      {
        bin_id: "bin-test",
        bin_number: 1,
        pack: {
          pack_id: "pack-test",
          pack_number: "1111111",
          game_name: "Test Game",
          game_price: 2.0,
          starting_serial: "001",
          ending_serial: null,
        },
      },
    ];

    // WHEN: Component is rendered
    render(<DayBinsTable bins={binWithNoEnding} />);

    // THEN: Ending serial shows '--'
    const row = screen.getByTestId("day-bins-row-bin-test");
    // Last cell (Ending) should contain "--"
    expect(row).toHaveTextContent("--");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ROW CLICK INTERACTION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("should call onRowClick with pack_id when bin with pack is clicked", () => {
    // GIVEN: DayBinsTable with onRowClick callback
    const onRowClick = vi.fn();

    // WHEN: Component is rendered and a bin row is clicked
    render(<DayBinsTable {...defaultProps} onRowClick={onRowClick} />);
    const row = screen.getByTestId("day-bins-row-bin-001");
    fireEvent.click(row);

    // THEN: onRowClick is called with pack_id
    expect(onRowClick).toHaveBeenCalledWith("pack-001");
  });

  it("should NOT call onRowClick when empty bin is clicked", () => {
    // GIVEN: DayBinsTable with onRowClick callback
    const onRowClick = vi.fn();

    // WHEN: Component is rendered and empty bin row is clicked
    render(<DayBinsTable {...defaultProps} onRowClick={onRowClick} />);
    const emptyRow = screen.getByTestId("day-bins-row-bin-002");
    fireEvent.click(emptyRow);

    // THEN: onRowClick is NOT called
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("should apply cursor-pointer style to clickable rows", () => {
    // GIVEN: DayBinsTable with onRowClick callback
    const onRowClick = vi.fn();

    // WHEN: Component is rendered
    render(<DayBinsTable {...defaultProps} onRowClick={onRowClick} />);

    // THEN: Rows with packs have cursor-pointer
    const clickableRow = screen.getByTestId("day-bins-row-bin-001");
    expect(clickableRow).toHaveClass("cursor-pointer");

    // Empty rows should NOT have cursor-pointer
    const emptyRow = screen.getByTestId("day-bins-row-bin-002");
    expect(emptyRow).not.toHaveClass("cursor-pointer");
  });

  it("should apply hover style to clickable rows", () => {
    // GIVEN: DayBinsTable with onRowClick callback
    const onRowClick = vi.fn();

    // WHEN: Component is rendered
    render(<DayBinsTable {...defaultProps} onRowClick={onRowClick} />);

    // THEN: Rows with packs have hover style
    const clickableRow = screen.getByTestId("day-bins-row-bin-001");
    expect(clickableRow).toHaveClass("hover:bg-muted/50");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EMPTY STATE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("should display empty state message when no bins exist", () => {
    // GIVEN: DayBinsTable with empty bins array
    // WHEN: Component is rendered
    render(<DayBinsTable bins={[]} />);

    // THEN: Empty state message is displayed
    expect(screen.getByTestId("day-bins-table-empty")).toBeInTheDocument();
    expect(
      screen.getByText(/no bins configured for this store/i),
    ).toBeInTheDocument();
  });

  it("should display empty state message when bins is null/undefined", () => {
    // GIVEN: DayBinsTable with null bins
    // WHEN: Component is rendered
    render(<DayBinsTable bins={null as any} />);

    // THEN: Empty state message is displayed
    expect(screen.getByTestId("day-bins-table-empty")).toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PRICE FORMATTING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("should format price with dollar sign and two decimal places", () => {
    // GIVEN: Bin with various prices
    const binsWithPrices: DayBin[] = [
      {
        bin_id: "bin-a",
        bin_number: 1,
        pack: {
          pack_id: "pack-a",
          pack_number: "1111111",
          game_name: "Game A",
          game_price: 1.0,
          starting_serial: "001",
          ending_serial: null,
        },
      },
      {
        bin_id: "bin-b",
        bin_number: 2,
        pack: {
          pack_id: "pack-b",
          pack_number: "2222222",
          game_name: "Game B",
          game_price: 20.0,
          starting_serial: "001",
          ending_serial: null,
        },
      },
    ];

    // WHEN: Component is rendered
    render(<DayBinsTable bins={binsWithPrices} />);

    // THEN: Prices are formatted correctly
    expect(screen.getByText("$1.00")).toBeInTheDocument();
    expect(screen.getByText("$20.00")).toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - XSS Prevention
  // ═══════════════════════════════════════════════════════════════════════════

  it("[SECURITY] should prevent XSS in game name field", () => {
    // GIVEN: Bin with XSS attempt in game name
    const xssPayload = "<script>alert('xss')</script>";
    const xssBin: DayBin[] = [
      {
        bin_id: "bin-xss",
        bin_number: 1,
        pack: {
          pack_id: "pack-xss",
          pack_number: "1234567",
          game_name: xssPayload,
          game_price: 5.0,
          starting_serial: "001",
          ending_serial: null,
        },
      },
    ];

    // WHEN: Component is rendered
    render(<DayBinsTable bins={xssBin} />);

    // THEN: XSS payload is rendered as escaped text (not executed)
    const gameCell = screen.getByText(xssPayload);
    expect(gameCell).toBeInTheDocument();
    expect(gameCell.tagName).not.toBe("SCRIPT");
  });

  it("[SECURITY] should prevent XSS in pack number field", () => {
    // GIVEN: Bin with XSS attempt in pack number
    const xssPayload = "<img src=x onerror=alert('xss')>";
    const xssBin: DayBin[] = [
      {
        bin_id: "bin-xss",
        bin_number: 1,
        pack: {
          pack_id: "pack-xss",
          pack_number: xssPayload,
          game_name: "Safe Game",
          game_price: 5.0,
          starting_serial: "001",
          ending_serial: null,
        },
      },
    ];

    // WHEN: Component is rendered
    render(<DayBinsTable bins={xssBin} />);

    // THEN: XSS payload is rendered as escaped text
    expect(screen.getByText(xssPayload)).toBeInTheDocument();
  });

  it("[SECURITY] should prevent XSS in serial number fields", () => {
    // GIVEN: Bin with XSS attempts in serial fields
    const xssStarting = "<svg onload=alert('start')>";
    const xssEnding = "<svg onload=alert('end')>";
    const xssBin: DayBin[] = [
      {
        bin_id: "bin-xss",
        bin_number: 1,
        pack: {
          pack_id: "pack-xss",
          pack_number: "1234567",
          game_name: "Safe Game",
          game_price: 5.0,
          starting_serial: xssStarting,
          ending_serial: xssEnding,
        },
      },
    ];

    // WHEN: Component is rendered
    render(<DayBinsTable bins={xssBin} />);

    // THEN: XSS payloads are rendered as escaped text
    expect(screen.getByText(xssStarting)).toBeInTheDocument();
    expect(screen.getByText(xssEnding)).toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("[EDGE CASE] should handle special characters in game names", () => {
    // GIVEN: Bin with special characters in game name
    const specialBin: DayBin[] = [
      {
        bin_id: "bin-special",
        bin_number: 1,
        pack: {
          pack_id: "pack-special",
          pack_number: "1234567",
          game_name: "Lucky 7's™ & More €$£",
          game_price: 5.0,
          starting_serial: "001",
          ending_serial: null,
        },
      },
    ];

    // WHEN: Component is rendered
    render(<DayBinsTable bins={specialBin} />);

    // THEN: Special characters are displayed correctly
    expect(screen.getByText("Lucky 7's™ & More €$£")).toBeInTheDocument();
  });

  it("[EDGE CASE] should handle very long pack numbers without breaking layout", () => {
    // GIVEN: Bin with very long pack number
    const longBin: DayBin[] = [
      {
        bin_id: "bin-long",
        bin_number: 1,
        pack: {
          pack_id: "pack-long",
          pack_number: "12345678901234567890",
          game_name: "Test Game",
          game_price: 5.0,
          starting_serial: "001",
          ending_serial: null,
        },
      },
    ];

    // WHEN: Component is rendered
    render(<DayBinsTable bins={longBin} />);

    // THEN: Long pack number is displayed
    expect(screen.getByText("12345678901234567890")).toBeInTheDocument();
  });

  it("[EDGE CASE] should handle zero price gracefully", () => {
    // GIVEN: Bin with zero price
    const zeroPriceBin: DayBin[] = [
      {
        bin_id: "bin-zero",
        bin_number: 1,
        pack: {
          pack_id: "pack-zero",
          pack_number: "1234567",
          game_name: "Free Game",
          game_price: 0,
          starting_serial: "001",
          ending_serial: null,
        },
      },
    ];

    // WHEN: Component is rendered
    render(<DayBinsTable bins={zeroPriceBin} />);

    // THEN: Zero price is formatted correctly
    expect(screen.getByText("$0.00")).toBeInTheDocument();
  });

  it("[EDGE CASE] should handle decimal prices correctly", () => {
    // GIVEN: Bin with decimal price
    const decimalBin: DayBin[] = [
      {
        bin_id: "bin-decimal",
        bin_number: 1,
        pack: {
          pack_id: "pack-decimal",
          pack_number: "1234567",
          game_name: "Decimal Game",
          game_price: 2.5,
          starting_serial: "001",
          ending_serial: null,
        },
      },
    ];

    // WHEN: Component is rendered
    render(<DayBinsTable bins={decimalBin} />);

    // THEN: Decimal price is formatted correctly
    expect(screen.getByText("$2.50")).toBeInTheDocument();
  });

  it("[EDGE CASE] should handle many bins (scrollable)", () => {
    // GIVEN: Many bins
    const manyBins: DayBin[] = Array.from({ length: 50 }, (_, i) => ({
      bin_id: `bin-${i}`,
      bin_number: i + 1,
      pack:
        i % 2 === 0
          ? {
              pack_id: `pack-${i}`,
              pack_number: `${1000000 + i}`,
              game_name: `Game ${i}`,
              game_price: i + 1,
              starting_serial: `${String(i).padStart(3, "0")}`,
              ending_serial: null,
            }
          : null,
    }));

    // WHEN: Component is rendered
    render(<DayBinsTable bins={manyBins} />);

    // THEN: Table is rendered with scrollable container
    const container = screen.getByTestId("day-bins-table");
    expect(container).toBeInTheDocument();
    // First and last bins should be rendered
    expect(screen.getByTestId("day-bins-row-bin-0")).toBeInTheDocument();
    expect(screen.getByTestId("day-bins-row-bin-49")).toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCESSIBILITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("[A11Y] should have proper table header scope attributes", () => {
    // GIVEN: DayBinsTable with bins
    // WHEN: Component is rendered
    render(<DayBinsTable {...defaultProps} />);

    // THEN: All headers have scope="col"
    const headers = screen.getAllByRole("columnheader");
    headers.forEach((header) => {
      expect(header).toHaveAttribute("scope", "col");
    });
  });

  it("[A11Y] should use semantic table elements", () => {
    // GIVEN: DayBinsTable with bins
    // WHEN: Component is rendered
    render(<DayBinsTable {...defaultProps} />);

    // THEN: Table uses semantic elements
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("rowgroup").length).toBeGreaterThanOrEqual(1); // thead and/or tbody
    expect(screen.getAllByRole("row")).toHaveLength(4); // header + 3 data rows
  });
});
