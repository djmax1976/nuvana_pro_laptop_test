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
  type BinValidationError,
} from "@/components/lottery/DayBinsTable";
import type { DayBin } from "@/lib/api/lottery";

describe("DayBinsTable Component", () => {
  const mockBins: DayBin[] = [
    {
      bin_id: "bin-001",
      bin_number: 1,
      name: "Bin 1",
      is_active: true,
      pack: {
        pack_id: "pack-001",
        pack_number: "1234567",
        game_name: "Mega Millions",
        game_price: 5.0,
        starting_serial: "001",
        ending_serial: "025",
        serial_end: "050",
        is_first_period: true,
      },
    },
    {
      bin_id: "bin-002",
      bin_number: 2,
      name: "Bin 2",
      is_active: true,
      pack: null, // Empty bin
    },
    {
      bin_id: "bin-003",
      bin_number: 3,
      name: "Bin 3",
      is_active: true,
      pack: {
        pack_id: "pack-002",
        pack_number: "7654321",
        game_name: "Powerball",
        game_price: 10.0,
        starting_serial: "050",
        ending_serial: null, // No closing yet
        serial_end: "100",
        is_first_period: true,
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
        name: "Bin Test",
        is_active: true,
        pack: {
          pack_id: "pack-test",
          pack_number: "1111111",
          game_name: "Test Game",
          game_price: 2.0,
          starting_serial: "001",
          ending_serial: null,
          serial_end: "050",
          is_first_period: true,
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
        name: "Bin A",
        is_active: true,
        pack: {
          pack_id: "pack-a",
          pack_number: "1111111",
          game_name: "Game A",
          game_price: 1.0,
          starting_serial: "001",
          ending_serial: null,
          serial_end: "050",
          is_first_period: true,
        },
      },
      {
        bin_id: "bin-b",
        bin_number: 2,
        name: "Bin B",
        is_active: true,
        pack: {
          pack_id: "pack-b",
          pack_number: "2222222",
          game_name: "Game B",
          game_price: 20.0,
          starting_serial: "001",
          ending_serial: null,
          serial_end: "050",
          is_first_period: true,
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
        name: "Bin XSS",
        is_active: true,
        pack: {
          pack_id: "pack-xss",
          pack_number: "1234567",
          game_name: xssPayload,
          game_price: 5.0,
          starting_serial: "001",
          ending_serial: null,
          serial_end: "050",
          is_first_period: true,
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
        name: "Bin XSS Pack",
        is_active: true,
        pack: {
          pack_id: "pack-xss",
          pack_number: xssPayload,
          game_name: "Safe Game",
          game_price: 5.0,
          starting_serial: "001",
          ending_serial: null,
          serial_end: "050",
          is_first_period: true,
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
        name: "Bin XSS Serial",
        is_active: true,
        pack: {
          pack_id: "pack-xss",
          pack_number: "1234567",
          game_name: "Safe Game",
          game_price: 5.0,
          starting_serial: xssStarting,
          ending_serial: xssEnding,
          serial_end: "050",
          is_first_period: true,
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
        name: "Bin Special",
        is_active: true,
        pack: {
          pack_id: "pack-special",
          pack_number: "1234567",
          game_name: "Lucky 7's™ & More €$£",
          game_price: 5.0,
          starting_serial: "001",
          ending_serial: null,
          serial_end: "050",
          is_first_period: true,
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
        name: "Bin Long",
        is_active: true,
        pack: {
          pack_id: "pack-long",
          pack_number: "12345678901234567890",
          game_name: "Test Game",
          game_price: 5.0,
          starting_serial: "001",
          ending_serial: null,
          serial_end: "050",
          is_first_period: true,
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
        name: "Bin Zero",
        is_active: true,
        pack: {
          pack_id: "pack-zero",
          pack_number: "1234567",
          game_name: "Free Game",
          game_price: 0,
          starting_serial: "001",
          ending_serial: null,
          serial_end: "050",
          is_first_period: true,
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
        name: "Bin Decimal",
        is_active: true,
        pack: {
          pack_id: "pack-decimal",
          pack_number: "1234567",
          game_name: "Decimal Game",
          game_price: 2.5,
          starting_serial: "001",
          ending_serial: null,
          serial_end: "050",
          is_first_period: true,
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
      name: `Bin ${i}`,
      is_active: true,
      pack:
        i % 2 === 0
          ? {
              pack_id: `pack-${i}`,
              pack_number: `${1000000 + i}`,
              game_name: `Game ${i}`,
              game_price: i + 1,
              starting_serial: `${String(i).padStart(3, "0")}`,
              ending_serial: null,
              serial_end: "050",
              is_first_period: true,
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

  // ═══════════════════════════════════════════════════════════════════════════
  // MANUAL ENTRY MODE TESTS
  // Story: Lottery Manual Entry Feature
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Manual Entry Mode", () => {
    const manualEntryProps: DayBinsTableProps = {
      bins: mockBins,
      manualEntryMode: true,
      endingValues: {},
      onEndingChange: vi.fn(),
      onInputComplete: vi.fn(),
    };

    it("should render input fields in Ending column when manualEntryMode is true", () => {
      // GIVEN: DayBinsTable in manual entry mode
      // WHEN: Component is rendered
      render(<DayBinsTable {...manualEntryProps} />);

      // THEN: Input fields are rendered for bins with packs
      expect(screen.getByTestId("ending-input-bin-001")).toBeInTheDocument();
      expect(screen.getByTestId("ending-input-bin-003")).toBeInTheDocument();

      // Empty bin should not have input
      expect(
        screen.queryByTestId("ending-input-bin-002"),
      ).not.toBeInTheDocument();
    });

    it("should display '(Edit)' indicator in Ending column header when in manual entry mode", () => {
      // GIVEN: DayBinsTable in manual entry mode
      // WHEN: Component is rendered
      render(<DayBinsTable {...manualEntryProps} />);

      // THEN: Edit indicator is shown
      expect(screen.getByText("(Edit)")).toBeInTheDocument();
    });

    it("should NOT display '(Edit)' indicator when not in manual entry mode", () => {
      // GIVEN: DayBinsTable not in manual entry mode
      // WHEN: Component is rendered
      render(<DayBinsTable {...defaultProps} />);

      // THEN: Edit indicator is not shown
      expect(screen.queryByText("(Edit)")).not.toBeInTheDocument();
    });

    it("should call onEndingChange when user types in input", () => {
      // GIVEN: DayBinsTable in manual entry mode
      const onEndingChange = vi.fn();
      render(
        <DayBinsTable {...manualEntryProps} onEndingChange={onEndingChange} />,
      );

      // WHEN: User types in the input
      const input = screen.getByTestId("ending-input-bin-001");
      fireEvent.change(input, { target: { value: "123" } });

      // THEN: onEndingChange is called with bin_id and value
      expect(onEndingChange).toHaveBeenCalledWith("bin-001", "123");
    });

    it("should only allow numeric input (strip non-numeric characters)", () => {
      // GIVEN: DayBinsTable in manual entry mode
      const onEndingChange = vi.fn();
      render(
        <DayBinsTable {...manualEntryProps} onEndingChange={onEndingChange} />,
      );

      // WHEN: User types mixed characters
      const input = screen.getByTestId("ending-input-bin-001");
      fireEvent.change(input, { target: { value: "12a3b" } });

      // THEN: Only numeric characters are passed
      expect(onEndingChange).toHaveBeenCalledWith("bin-001", "123");
    });

    it("should enforce max length of 3 digits", () => {
      // GIVEN: DayBinsTable in manual entry mode
      const onEndingChange = vi.fn();
      render(
        <DayBinsTable {...manualEntryProps} onEndingChange={onEndingChange} />,
      );

      // WHEN: User types more than 3 digits
      const input = screen.getByTestId("ending-input-bin-001");
      fireEvent.change(input, { target: { value: "12345" } });

      // THEN: Value is truncated to 3 digits
      expect(onEndingChange).toHaveBeenCalledWith("bin-001", "123");
    });

    it("should call onInputComplete when 3 digits are entered", () => {
      // GIVEN: DayBinsTable in manual entry mode
      const onInputComplete = vi.fn();
      render(
        <DayBinsTable
          {...manualEntryProps}
          onInputComplete={onInputComplete}
        />,
      );

      // WHEN: User enters 3 digits
      const input = screen.getByTestId("ending-input-bin-001");
      fireEvent.change(input, { target: { value: "123" } });

      // THEN: onInputComplete is called with bin_id
      expect(onInputComplete).toHaveBeenCalledWith("bin-001");
    });

    it("should NOT call onInputComplete when less than 3 digits are entered", () => {
      // GIVEN: DayBinsTable in manual entry mode
      const onInputComplete = vi.fn();
      render(
        <DayBinsTable
          {...manualEntryProps}
          onInputComplete={onInputComplete}
        />,
      );

      // WHEN: User enters less than 3 digits
      const input = screen.getByTestId("ending-input-bin-001");
      fireEvent.change(input, { target: { value: "12" } });

      // THEN: onInputComplete is NOT called
      expect(onInputComplete).not.toHaveBeenCalled();
    });

    it("should display current ending values from props", () => {
      // GIVEN: DayBinsTable with pre-filled ending values
      const endingValues = {
        "bin-001": "025",
        "bin-003": "075",
      };
      render(
        <DayBinsTable {...manualEntryProps} endingValues={endingValues} />,
      );

      // THEN: Inputs display the values
      const input1 = screen.getByTestId(
        "ending-input-bin-001",
      ) as HTMLInputElement;
      const input3 = screen.getByTestId(
        "ending-input-bin-003",
      ) as HTMLInputElement;

      expect(input1.value).toBe("025");
      expect(input3.value).toBe("075");
    });

    it("should apply green border style when input has 3 digits", () => {
      // GIVEN: DayBinsTable with complete ending value
      const endingValues = {
        "bin-001": "025",
      };
      render(
        <DayBinsTable {...manualEntryProps} endingValues={endingValues} />,
      );

      // THEN: Input has green border class
      const input = screen.getByTestId("ending-input-bin-001");
      expect(input).toHaveClass("border-green-500");
    });

    it("should NOT have green border when input has less than 3 digits", () => {
      // GIVEN: DayBinsTable with incomplete ending value
      const endingValues = {
        "bin-001": "02",
      };
      render(
        <DayBinsTable {...manualEntryProps} endingValues={endingValues} />,
      );

      // THEN: Input does not have green border class
      const input = screen.getByTestId("ending-input-bin-001");
      expect(input).not.toHaveClass("border-green-500");
      expect(input).toHaveClass("border-primary");
    });

    it("should disable row click in manual entry mode", () => {
      // GIVEN: DayBinsTable in manual entry mode with onRowClick
      const onRowClick = vi.fn();
      render(<DayBinsTable {...manualEntryProps} onRowClick={onRowClick} />);

      // WHEN: User clicks a row
      const row = screen.getByTestId("day-bins-row-bin-001");
      fireEvent.click(row);

      // THEN: onRowClick is NOT called (row click disabled in manual entry mode)
      expect(onRowClick).not.toHaveBeenCalled();
    });

    it("should NOT have cursor-pointer on rows in manual entry mode", () => {
      // GIVEN: DayBinsTable in manual entry mode with onRowClick
      render(<DayBinsTable {...manualEntryProps} onRowClick={vi.fn()} />);

      // THEN: Rows should not have cursor-pointer
      const row = screen.getByTestId("day-bins-row-bin-001");
      expect(row).not.toHaveClass("cursor-pointer");
    });

    it("should apply highlight background to active rows in manual entry mode", () => {
      // GIVEN: DayBinsTable in manual entry mode
      // WHEN: Component is rendered
      render(<DayBinsTable {...manualEntryProps} />);

      // THEN: Rows with packs have highlight background
      const row = screen.getByTestId("day-bins-row-bin-001");
      expect(row).toHaveClass("bg-primary/5");
    });

    it("should stop click propagation on input to prevent row click", () => {
      // GIVEN: DayBinsTable in manual entry mode with onRowClick
      const onRowClick = vi.fn();
      render(<DayBinsTable {...manualEntryProps} onRowClick={onRowClick} />);

      // WHEN: User clicks directly on the input
      const input = screen.getByTestId("ending-input-bin-001");
      fireEvent.click(input);

      // THEN: onRowClick is NOT called
      expect(onRowClick).not.toHaveBeenCalled();
    });

    it("should render display span with ending serial when NOT in manual entry mode", () => {
      // GIVEN: DayBinsTable NOT in manual entry mode
      // WHEN: Component is rendered
      render(<DayBinsTable {...defaultProps} />);

      // THEN: Display spans are rendered (not inputs)
      expect(screen.getByTestId("ending-display-bin-001")).toBeInTheDocument();
      expect(screen.getByTestId("ending-display-bin-001")).toHaveTextContent(
        "025",
      );
    });

    it("should have proper aria-label on inputs for accessibility", () => {
      // GIVEN: DayBinsTable in manual entry mode
      // WHEN: Component is rendered
      render(<DayBinsTable {...manualEntryProps} />);

      // THEN: Input has aria-label
      const input = screen.getByTestId("ending-input-bin-001");
      expect(input).toHaveAttribute("aria-label", "Ending serial for bin 1");
    });

    it("should have numeric inputMode on inputs for mobile keyboards", () => {
      // GIVEN: DayBinsTable in manual entry mode
      // WHEN: Component is rendered
      render(<DayBinsTable {...manualEntryProps} />);

      // THEN: Input has inputMode="numeric"
      const input = screen.getByTestId("ending-input-bin-001");
      expect(input).toHaveAttribute("inputMode", "numeric");
    });

    it("should have maxLength of 3 on inputs", () => {
      // GIVEN: DayBinsTable in manual entry mode
      // WHEN: Component is rendered
      render(<DayBinsTable {...manualEntryProps} />);

      // THEN: Input has maxLength="3"
      const input = screen.getByTestId("ending-input-bin-001");
      expect(input).toHaveAttribute("maxLength", "3");
    });

    it("[SECURITY] should sanitize input to prevent script injection", () => {
      // GIVEN: DayBinsTable in manual entry mode
      const onEndingChange = vi.fn();
      render(
        <DayBinsTable {...manualEntryProps} onEndingChange={onEndingChange} />,
      );

      // WHEN: User attempts to inject script via input
      const input = screen.getByTestId("ending-input-bin-001");
      fireEvent.change(input, {
        target: { value: "<script>alert('xss')</script>123" },
      });

      // THEN: Only numeric characters are passed (script tags stripped)
      expect(onEndingChange).toHaveBeenCalledWith("bin-001", "123");
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // AUTO-ADVANCE FOCUS TESTS
    // Story: Lottery Manual Entry Feature - Focus Management
    // ═══════════════════════════════════════════════════════════════════════════

    it("should auto-focus first active bin input when manual entry mode is activated", async () => {
      // GIVEN: DayBinsTable not in manual entry mode initially
      const { rerender } = render(
        <DayBinsTable {...defaultProps} manualEntryMode={false} />,
      );

      // WHEN: Manual entry mode is activated
      rerender(<DayBinsTable {...manualEntryProps} />);

      // THEN: First active bin's input should receive focus after delay
      await vi.waitFor(
        () => {
          const firstInput = screen.getByTestId("ending-input-bin-001");
          expect(document.activeElement).toBe(firstInput);
        },
        { timeout: 200 },
      );
    });

    it("should auto-advance focus to next bin input after entering 3 digits", async () => {
      // GIVEN: DayBinsTable in manual entry mode with multiple active bins
      const multipleBins: DayBin[] = [
        {
          bin_id: "bin-001",
          bin_number: 1,
          name: "Bin 1",
          is_active: true,
          pack: {
            pack_id: "pack-001",
            pack_number: "1234567",
            game_name: "Game 1",
            game_price: 5.0,
            starting_serial: "001",
            ending_serial: null,
            serial_end: "050",
            is_first_period: true,
          },
        },
        {
          bin_id: "bin-002",
          bin_number: 2,
          name: "Bin 2",
          is_active: true,
          pack: {
            pack_id: "pack-002",
            pack_number: "7654321",
            game_name: "Game 2",
            game_price: 10.0,
            starting_serial: "001",
            ending_serial: null,
            serial_end: "100",
            is_first_period: true,
          },
        },
      ];

      const onEndingChange = vi.fn();
      render(
        <DayBinsTable
          bins={multipleBins}
          manualEntryMode={true}
          endingValues={{}}
          onEndingChange={onEndingChange}
        />,
      );

      // WHEN: User enters 3 digits in first input
      const firstInput = screen.getByTestId("ending-input-bin-001");
      fireEvent.change(firstInput, { target: { value: "025" } });

      // THEN: Focus should move to second bin's input after delay
      await vi.waitFor(
        () => {
          const secondInput = screen.getByTestId("ending-input-bin-002");
          expect(document.activeElement).toBe(secondInput);
        },
        { timeout: 150 },
      );
    });

    it("should NOT auto-advance focus when less than 3 digits entered", async () => {
      // GIVEN: DayBinsTable in manual entry mode with multiple active bins
      const multipleBins: DayBin[] = [
        {
          bin_id: "bin-001",
          bin_number: 1,
          name: "Bin 1",
          is_active: true,
          pack: {
            pack_id: "pack-001",
            pack_number: "1234567",
            game_name: "Game 1",
            game_price: 5.0,
            starting_serial: "001",
            ending_serial: null,
            serial_end: "050",
            is_first_period: true,
          },
        },
        {
          bin_id: "bin-002",
          bin_number: 2,
          name: "Bin 2",
          is_active: true,
          pack: {
            pack_id: "pack-002",
            pack_number: "7654321",
            game_name: "Game 2",
            game_price: 10.0,
            starting_serial: "001",
            ending_serial: null,
            serial_end: "100",
            is_first_period: true,
          },
        },
      ];

      const onEndingChange = vi.fn();
      render(
        <DayBinsTable
          bins={multipleBins}
          manualEntryMode={true}
          endingValues={{}}
          onEndingChange={onEndingChange}
        />,
      );

      // Focus first input manually
      const firstInput = screen.getByTestId(
        "ending-input-bin-001",
      ) as HTMLInputElement;
      firstInput.focus();

      // WHEN: User enters only 2 digits
      fireEvent.change(firstInput, { target: { value: "02" } });

      // Wait a bit to ensure no auto-advance happens
      await new Promise((resolve) => setTimeout(resolve, 100));

      // THEN: Focus should remain on first input (no auto-advance)
      expect(document.activeElement).toBe(firstInput);
    });

    it("should NOT auto-advance focus when on last active bin", async () => {
      // GIVEN: DayBinsTable in manual entry mode - only one active bin
      const singleBin: DayBin[] = [
        {
          bin_id: "bin-001",
          bin_number: 1,
          name: "Bin 1",
          is_active: true,
          pack: {
            pack_id: "pack-001",
            pack_number: "1234567",
            game_name: "Game 1",
            game_price: 5.0,
            starting_serial: "001",
            ending_serial: null,
            serial_end: "050",
            is_first_period: true,
          },
        },
      ];

      const onEndingChange = vi.fn();
      const onInputComplete = vi.fn();
      render(
        <DayBinsTable
          bins={singleBin}
          manualEntryMode={true}
          endingValues={{}}
          onEndingChange={onEndingChange}
          onInputComplete={onInputComplete}
        />,
      );

      // Focus the only input
      const onlyInput = screen.getByTestId(
        "ending-input-bin-001",
      ) as HTMLInputElement;
      onlyInput.focus();

      // WHEN: User enters 3 digits in the only (last) bin
      fireEvent.change(onlyInput, { target: { value: "025" } });

      // Wait for potential auto-advance
      await new Promise((resolve) => setTimeout(resolve, 100));

      // THEN: Focus should remain on the input (no crash, no error)
      // onInputComplete should still be called
      expect(onInputComplete).toHaveBeenCalledWith("bin-001");
    });

    it("should skip empty bins during auto-advance focus", async () => {
      // GIVEN: DayBinsTable with empty bin between active bins
      const binsWithEmpty: DayBin[] = [
        {
          bin_id: "bin-001",
          bin_number: 1,
          name: "Bin 1",
          is_active: true,
          pack: {
            pack_id: "pack-001",
            pack_number: "1234567",
            game_name: "Game 1",
            game_price: 5.0,
            starting_serial: "001",
            ending_serial: null,
            serial_end: "050",
            is_first_period: true,
          },
        },
        {
          bin_id: "bin-002",
          bin_number: 2,
          name: "Bin 2 (Empty)",
          is_active: true,
          pack: null, // Empty bin - should be skipped
        },
        {
          bin_id: "bin-003",
          bin_number: 3,
          name: "Bin 3",
          is_active: true,
          pack: {
            pack_id: "pack-003",
            pack_number: "9999999",
            game_name: "Game 3",
            game_price: 20.0,
            starting_serial: "001",
            ending_serial: null,
            serial_end: "100",
            is_first_period: true,
          },
        },
      ];

      const onEndingChange = vi.fn();
      render(
        <DayBinsTable
          bins={binsWithEmpty}
          manualEntryMode={true}
          endingValues={{}}
          onEndingChange={onEndingChange}
        />,
      );

      // WHEN: User enters 3 digits in first input
      const firstInput = screen.getByTestId("ending-input-bin-001");
      fireEvent.change(firstInput, { target: { value: "025" } });

      // THEN: Focus should skip empty bin-002 and move to bin-003
      await vi.waitFor(
        () => {
          const thirdInput = screen.getByTestId("ending-input-bin-003");
          expect(document.activeElement).toBe(thirdInput);
        },
        { timeout: 150 },
      );

      // Verify bin-002 has no input (it's empty)
      expect(
        screen.queryByTestId("ending-input-bin-002"),
      ).not.toBeInTheDocument();
    });

    it("should NOT re-focus first input after mode activation during subsequent state updates", async () => {
      // GIVEN: DayBinsTable in manual entry mode
      const onEndingChange = vi.fn();
      const { rerender } = render(
        <DayBinsTable {...manualEntryProps} onEndingChange={onEndingChange} />,
      );

      // Wait for initial focus
      await vi.waitFor(
        () => {
          const firstInput = screen.getByTestId("ending-input-bin-001");
          expect(document.activeElement).toBe(firstInput);
        },
        { timeout: 200 },
      );

      // Focus a different input manually (simulating user navigation)
      const thirdInput = screen.getByTestId("ending-input-bin-003");
      thirdInput.focus();
      expect(document.activeElement).toBe(thirdInput);

      // WHEN: State update triggers re-render (simulated by changing endingValues)
      rerender(
        <DayBinsTable
          {...manualEntryProps}
          onEndingChange={onEndingChange}
          endingValues={{ "bin-001": "123" }}
        />,
      );

      // Re-focus to simulate user still has focus after React re-render
      // (In browser, focus is preserved on the same element if it stays in DOM)
      const thirdInputAfterRerender = screen.getByTestId(
        "ending-input-bin-003",
      );
      thirdInputAfterRerender.focus();

      // Wait a bit for any potential focus change from component logic
      await new Promise((resolve) => setTimeout(resolve, 150));

      // THEN: Focus should NOT jump back to first input
      // The component's useEffect should not re-trigger initial focus after mode is already active
      const currentFocus = document.activeElement;
      const firstInput = screen.getByTestId("ending-input-bin-001");

      // The key assertion: focus should NOT have jumped back to first input
      expect(currentFocus).not.toBe(firstInput);
      expect(currentFocus).toBe(thirdInputAfterRerender);
    });

    it("should reset focus tracking when manual entry mode is deactivated", async () => {
      // GIVEN: DayBinsTable that was in manual entry mode
      const { rerender } = render(<DayBinsTable {...manualEntryProps} />);

      // Wait for initial focus
      await vi.waitFor(
        () => {
          const firstInput = screen.getByTestId("ending-input-bin-001");
          expect(document.activeElement).toBe(firstInput);
        },
        { timeout: 200 },
      );

      // WHEN: Manual entry mode is deactivated
      rerender(<DayBinsTable {...defaultProps} manualEntryMode={false} />);

      // THEN: Inputs should no longer exist
      expect(
        screen.queryByTestId("ending-input-bin-001"),
      ).not.toBeInTheDocument();

      // AND WHEN: Manual entry mode is re-activated
      rerender(<DayBinsTable {...manualEntryProps} />);

      // THEN: Input should be rendered and focusable
      // Note: The component sets focus asynchronously via setTimeout
      const firstInput = await screen.findByTestId("ending-input-bin-001");
      expect(firstInput).toBeInTheDocument();

      // Wait for the component's setTimeout(100ms) to apply focus
      await vi.waitFor(
        () => {
          expect(document.activeElement).toBe(firstInput);
        },
        { timeout: 250 },
      );
    });

    it("should allow sequential entry through all bins without focus jumping back", async () => {
      // GIVEN: DayBinsTable in manual entry mode with 3 active bins
      const threeBins: DayBin[] = [
        {
          bin_id: "bin-001",
          bin_number: 1,
          name: "Bin 1",
          is_active: true,
          pack: {
            pack_id: "pack-001",
            pack_number: "1111111",
            game_name: "Game 1",
            game_price: 5.0,
            starting_serial: "001",
            ending_serial: null,
            serial_end: "050",
            is_first_period: true,
          },
        },
        {
          bin_id: "bin-002",
          bin_number: 2,
          name: "Bin 2",
          is_active: true,
          pack: {
            pack_id: "pack-002",
            pack_number: "2222222",
            game_name: "Game 2",
            game_price: 10.0,
            starting_serial: "001",
            ending_serial: null,
            serial_end: "100",
            is_first_period: true,
          },
        },
        {
          bin_id: "bin-003",
          bin_number: 3,
          name: "Bin 3",
          is_active: true,
          pack: {
            pack_id: "pack-003",
            pack_number: "3333333",
            game_name: "Game 3",
            game_price: 20.0,
            starting_serial: "001",
            ending_serial: null,
            serial_end: "150",
            is_first_period: true,
          },
        },
      ];

      const onEndingChange = vi.fn();
      const onInputComplete = vi.fn();

      render(
        <DayBinsTable
          bins={threeBins}
          manualEntryMode={true}
          endingValues={{}}
          onEndingChange={onEndingChange}
          onInputComplete={onInputComplete}
        />,
      );

      // Wait for initial focus on bin 1
      await vi.waitFor(
        () => {
          const input1 = screen.getByTestId("ending-input-bin-001");
          expect(document.activeElement).toBe(input1);
        },
        { timeout: 200 },
      );

      // WHEN: Enter 3 digits in bin 1
      const input1 = screen.getByTestId("ending-input-bin-001");
      fireEvent.change(input1, { target: { value: "025" } });

      // THEN: onInputComplete should be called for bin 1
      expect(onInputComplete).toHaveBeenCalledWith("bin-001");

      // THEN: Focus should auto-advance to bin 2 via the component's setTimeout
      await vi.waitFor(
        () => {
          const input2 = screen.getByTestId("ending-input-bin-002");
          expect(document.activeElement).toBe(input2);
        },
        { timeout: 150 },
      );

      // WHEN: Enter 3 digits in bin 2
      const input2 = screen.getByTestId("ending-input-bin-002");
      fireEvent.change(input2, { target: { value: "050" } });

      // THEN: onInputComplete should be called for bin 2
      expect(onInputComplete).toHaveBeenCalledWith("bin-002");

      // THEN: Focus should auto-advance to bin 3
      await vi.waitFor(
        () => {
          const input3 = screen.getByTestId("ending-input-bin-003");
          expect(document.activeElement).toBe(input3);
        },
        { timeout: 150 },
      );

      // WHEN: Enter 3 digits in bin 3 (last bin)
      const input3 = screen.getByTestId("ending-input-bin-003");
      fireEvent.change(input3, { target: { value: "075" } });

      // THEN: onInputComplete should be called for bin 3
      expect(onInputComplete).toHaveBeenCalledWith("bin-003");

      // Wait to verify focus doesn't jump back to bin 1
      await new Promise((resolve) => setTimeout(resolve, 100));

      // THEN: Focus should NOT have jumped back to bin 1
      // (Should remain on bin 3 or stay where it was)
      const input1After = screen.getByTestId("ending-input-bin-001");
      expect(document.activeElement).not.toBe(input1After);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // VALIDATION ERROR DISPLAY TESTS
    // Story: Lottery Manual Entry Validation
    // ═══════════════════════════════════════════════════════════════════════════

    it("should display error styling when validationErrors contains an error for a bin", () => {
      // GIVEN: DayBinsTable with validation error for bin-001
      const validationErrors: Record<string, BinValidationError> = {
        "bin-001": { message: "Number exceeds pack maximum (029)" },
      };

      // WHEN: Component is rendered with validation errors
      render(
        <DayBinsTable
          {...manualEntryProps}
          endingValues={{ "bin-001": "130" }}
          validationErrors={validationErrors}
        />,
      );

      // THEN: Input should have red border classes
      const input = screen.getByTestId("ending-input-bin-001");
      expect(input).toHaveClass("border-red-500");
      expect(input).toHaveClass("bg-red-50");
    });

    it("should display error message below input when validation error exists", () => {
      // GIVEN: DayBinsTable with validation error
      const validationErrors: Record<string, BinValidationError> = {
        "bin-001": { message: "Number exceeds pack maximum (029)" },
      };

      // WHEN: Component is rendered
      render(
        <DayBinsTable
          {...manualEntryProps}
          endingValues={{ "bin-001": "130" }}
          validationErrors={validationErrors}
        />,
      );

      // THEN: Error message should be displayed
      const errorSpan = screen.getByTestId("ending-error-bin-001");
      expect(errorSpan).toBeInTheDocument();
      expect(errorSpan).toHaveTextContent("Number exceeds pack maximum (029)");
    });

    it("should have aria-invalid=true when validation error exists", () => {
      // GIVEN: DayBinsTable with validation error
      const validationErrors: Record<string, BinValidationError> = {
        "bin-001": { message: "Invalid ending number" },
      };

      // WHEN: Component is rendered
      render(
        <DayBinsTable
          {...manualEntryProps}
          validationErrors={validationErrors}
        />,
      );

      // THEN: Input should have aria-invalid="true"
      const input = screen.getByTestId("ending-input-bin-001");
      expect(input).toHaveAttribute("aria-invalid", "true");
    });

    it("should have aria-describedby pointing to error message when error exists", () => {
      // GIVEN: DayBinsTable with validation error
      const validationErrors: Record<string, BinValidationError> = {
        "bin-001": { message: "Invalid ending number" },
      };

      // WHEN: Component is rendered
      render(
        <DayBinsTable
          {...manualEntryProps}
          validationErrors={validationErrors}
        />,
      );

      // THEN: Input should have aria-describedby pointing to error id
      const input = screen.getByTestId("ending-input-bin-001");
      expect(input).toHaveAttribute("aria-describedby", "ending-error-bin-001");
    });

    it("should NOT display error styling when no validation error exists", () => {
      // GIVEN: DayBinsTable with complete value but no error
      const endingValues = { "bin-001": "025" };

      // WHEN: Component is rendered without validation errors
      render(
        <DayBinsTable
          {...manualEntryProps}
          endingValues={endingValues}
          validationErrors={{}}
        />,
      );

      // THEN: Input should have green border (valid 3-digit entry)
      const input = screen.getByTestId("ending-input-bin-001");
      expect(input).toHaveClass("border-green-500");
      expect(input).not.toHaveClass("border-red-500");
    });

    it("should call onValidateEnding when input loses focus with 3 digits", () => {
      // GIVEN: DayBinsTable with onValidateEnding callback
      const onValidateEnding = vi.fn();
      render(
        <DayBinsTable
          {...manualEntryProps}
          endingValues={{ "bin-001": "025" }}
          onValidateEnding={onValidateEnding}
        />,
      );

      // WHEN: Input loses focus
      const input = screen.getByTestId("ending-input-bin-001");
      fireEvent.blur(input);

      // THEN: onValidateEnding should be called with bin_id, value, and pack data
      expect(onValidateEnding).toHaveBeenCalledWith("bin-001", "025", {
        starting_serial: "001",
        serial_end: "050",
      });
    });

    it("should NOT call onValidateEnding when input loses focus with less than 3 digits", () => {
      // GIVEN: DayBinsTable with incomplete value
      const onValidateEnding = vi.fn();
      render(
        <DayBinsTable
          {...manualEntryProps}
          endingValues={{ "bin-001": "02" }}
          onValidateEnding={onValidateEnding}
        />,
      );

      // WHEN: Input loses focus
      const input = screen.getByTestId("ending-input-bin-001");
      fireEvent.blur(input);

      // THEN: onValidateEnding should NOT be called
      expect(onValidateEnding).not.toHaveBeenCalled();
    });

    it("should show error on one bin without affecting other bins", () => {
      // GIVEN: Two bins, only one has error
      const multipleBins: DayBin[] = [
        {
          bin_id: "bin-001",
          bin_number: 1,
          name: "Bin 1",
          is_active: true,
          pack: {
            pack_id: "pack-001",
            pack_number: "1234567",
            game_name: "Game 1",
            game_price: 5.0,
            starting_serial: "001",
            ending_serial: null,
            serial_end: "029", // Max 029
            is_first_period: true,
          },
        },
        {
          bin_id: "bin-002",
          bin_number: 2,
          name: "Bin 2",
          is_active: true,
          pack: {
            pack_id: "pack-002",
            pack_number: "7654321",
            game_name: "Game 2",
            game_price: 10.0,
            starting_serial: "001",
            ending_serial: null,
            serial_end: "100",
            is_first_period: true,
          },
        },
      ];

      const validationErrors: Record<string, BinValidationError> = {
        "bin-001": { message: "Max: 029" },
      };

      // WHEN: Component is rendered
      render(
        <DayBinsTable
          bins={multipleBins}
          manualEntryMode={true}
          endingValues={{ "bin-001": "130", "bin-002": "050" }}
          validationErrors={validationErrors}
        />,
      );

      // THEN: First bin should have error styling
      const input1 = screen.getByTestId("ending-input-bin-001");
      expect(input1).toHaveClass("border-red-500");

      // AND: Second bin should have valid styling
      const input2 = screen.getByTestId("ending-input-bin-002");
      expect(input2).toHaveClass("border-green-500");
      expect(input2).not.toHaveClass("border-red-500");
    });

    it("should have role=alert on error message for screen readers", () => {
      // GIVEN: DayBinsTable with validation error
      const validationErrors: Record<string, BinValidationError> = {
        "bin-001": { message: "Number exceeds pack maximum" },
      };

      // WHEN: Component is rendered
      render(
        <DayBinsTable
          {...manualEntryProps}
          validationErrors={validationErrors}
        />,
      );

      // THEN: Error span should have role="alert"
      const errorSpan = screen.getByTestId("ending-error-bin-001");
      expect(errorSpan).toHaveAttribute("role", "alert");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MARK SOLD OUT ACTIONS COLUMN TESTS
  // Story: Lottery Pack Auto-Depletion Feature
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // TRACEABILITY MATRIX:
  // | Test ID | Requirement | Type | Priority |
  // |---------|-------------|------|----------|
  // | ACT-001 | Actions column renders when onMarkSoldOut provided AND manualEntryMode is true | UI | P0 |
  // | ACT-002 | Actions column hidden when onMarkSoldOut not provided | UI | P0 |
  // | ACT-003 | Mark Sold button calls onMarkSoldOut with pack_id | Interaction | P0 |
  // | ACT-004 | Mark Sold button hidden for empty bins | Business Logic | P0 |
  // | ACT-005 | Actions column hidden when NOT in manual entry mode | Business Logic | P1 |
  // | ACT-006 | Button click does not trigger row click | Interaction | P1 |
  // | ACT-007 | Button has proper accessibility attributes | A11Y | P1 |
  // | ACT-008 | XSS prevention in button aria-label | Security | P0 |

  describe("Actions Column - Mark Sold Out", () => {
    const mockBinsWithPacks: DayBin[] = [
      {
        bin_id: "bin-001",
        bin_number: 1,
        name: "Bin 1",
        is_active: true,
        pack: {
          pack_id: "pack-001",
          pack_number: "1234567",
          game_name: "Mega Millions",
          game_price: 5.0,
          starting_serial: "001",
          ending_serial: "025",
          serial_end: "050",
          is_first_period: true,
        },
      },
      {
        bin_id: "bin-002",
        bin_number: 2,
        name: "Bin 2",
        is_active: true,
        pack: null, // Empty bin
      },
      {
        bin_id: "bin-003",
        bin_number: 3,
        name: "Bin 3",
        is_active: true,
        pack: {
          pack_id: "pack-003",
          pack_number: "7654321",
          game_name: "Powerball",
          game_price: 10.0,
          starting_serial: "050",
          ending_serial: null,
          serial_end: "100",
          is_first_period: true,
        },
      },
    ];

    it("ACT-001: [P0] should render Actions column when onMarkSoldOut is provided AND manualEntryMode is true", () => {
      // GIVEN: DayBinsTable with onMarkSoldOut callback and manual entry mode active
      const onMarkSoldOut = vi.fn();
      const onEndingChange = vi.fn();

      // WHEN: Component is rendered in manual entry mode
      render(
        <DayBinsTable
          bins={mockBinsWithPacks}
          onMarkSoldOut={onMarkSoldOut}
          manualEntryMode={true}
          endingValues={{}}
          onEndingChange={onEndingChange}
        />,
      );

      // THEN: Actions column header is rendered
      expect(screen.getByText("Actions")).toBeInTheDocument();
    });

    it("ACT-002: [P0] should NOT render Actions column when onMarkSoldOut is not provided", () => {
      // GIVEN: DayBinsTable without onMarkSoldOut callback
      // WHEN: Component is rendered
      render(<DayBinsTable bins={mockBinsWithPacks} />);

      // THEN: Actions column header is NOT rendered
      expect(screen.queryByText("Actions")).not.toBeInTheDocument();
    });

    it("ACT-003: [P0] should call onMarkSoldOut with pack_id when Mark Sold button is clicked", () => {
      // GIVEN: DayBinsTable with onMarkSoldOut callback in manual entry mode
      const onMarkSoldOut = vi.fn();
      const onEndingChange = vi.fn();
      render(
        <DayBinsTable
          bins={mockBinsWithPacks}
          onMarkSoldOut={onMarkSoldOut}
          manualEntryMode={true}
          endingValues={{}}
          onEndingChange={onEndingChange}
        />,
      );

      // WHEN: Mark Sold button is clicked
      const button = screen.getByTestId("mark-sold-btn-bin-001");
      fireEvent.click(button);

      // THEN: onMarkSoldOut is called with the pack_id
      expect(onMarkSoldOut).toHaveBeenCalledWith("pack-001");
    });

    it("ACT-004: [P0] should display '--' placeholder for empty bins", () => {
      // GIVEN: DayBinsTable with empty bin in manual entry mode
      const onMarkSoldOut = vi.fn();
      const onEndingChange = vi.fn();
      render(
        <DayBinsTable
          bins={mockBinsWithPacks}
          onMarkSoldOut={onMarkSoldOut}
          manualEntryMode={true}
          endingValues={{}}
          onEndingChange={onEndingChange}
        />,
      );

      // THEN: Empty bin row should NOT have Mark Sold button
      expect(
        screen.queryByTestId("mark-sold-btn-bin-002"),
      ).not.toBeInTheDocument();

      // The Actions cell for empty bin should show "--"
      const emptyRow = screen.getByTestId("day-bins-row-bin-002");
      expect(emptyRow).toHaveTextContent("--");
    });

    it("ACT-005: [P1] should NOT render Actions column when NOT in manual entry mode", () => {
      // GIVEN: DayBinsTable with onMarkSoldOut but NOT in manual entry mode
      const onMarkSoldOut = vi.fn();

      // WHEN: Component is rendered without manual entry mode
      render(
        <DayBinsTable
          bins={mockBinsWithPacks}
          onMarkSoldOut={onMarkSoldOut}
          manualEntryMode={false}
        />,
      );

      // THEN: Actions column header is NOT rendered
      expect(screen.queryByText("Actions")).not.toBeInTheDocument();

      // AND: Mark Sold buttons are NOT rendered
      expect(
        screen.queryByTestId("mark-sold-btn-bin-001"),
      ).not.toBeInTheDocument();
    });

    it("ACT-006: [P1] should NOT trigger row click when Mark Sold button is clicked", () => {
      // GIVEN: DayBinsTable with both onRowClick and onMarkSoldOut callbacks in manual entry mode
      // Note: Row click is disabled in manual entry mode, but button should still stop propagation
      const onRowClick = vi.fn();
      const onMarkSoldOut = vi.fn();
      const onEndingChange = vi.fn();

      render(
        <DayBinsTable
          bins={mockBinsWithPacks}
          onRowClick={onRowClick}
          onMarkSoldOut={onMarkSoldOut}
          manualEntryMode={true}
          endingValues={{}}
          onEndingChange={onEndingChange}
        />,
      );

      // WHEN: Mark Sold button is clicked
      const button = screen.getByTestId("mark-sold-btn-bin-001");
      fireEvent.click(button);

      // THEN: onMarkSoldOut is called
      expect(onMarkSoldOut).toHaveBeenCalledWith("pack-001");

      // AND: onRowClick is NOT called (button stops propagation + row click disabled in manual mode)
      expect(onRowClick).not.toHaveBeenCalled();
    });

    it("ACT-007: [P1] [A11Y] should have proper accessibility attributes", () => {
      // GIVEN: DayBinsTable with onMarkSoldOut callback in manual entry mode
      const onMarkSoldOut = vi.fn();
      const onEndingChange = vi.fn();
      render(
        <DayBinsTable
          bins={mockBinsWithPacks}
          onMarkSoldOut={onMarkSoldOut}
          manualEntryMode={true}
          endingValues={{}}
          onEndingChange={onEndingChange}
        />,
      );

      // THEN: Button has aria-label
      const button = screen.getByTestId("mark-sold-btn-bin-001");
      expect(button).toHaveAttribute(
        "aria-label",
        "Mark pack 1234567 as sold out",
      );
    });

    it("ACT-008: [P0] [SECURITY] should prevent XSS in button aria-label", () => {
      // GIVEN: Bin with XSS attempt in pack number
      const xssPayload = "<script>alert('xss')</script>";
      const xssBins: DayBin[] = [
        {
          bin_id: "bin-xss",
          bin_number: 1,
          name: "Bin XSS",
          is_active: true,
          pack: {
            pack_id: "pack-xss",
            pack_number: xssPayload,
            game_name: "Safe Game",
            game_price: 5.0,
            starting_serial: "001",
            ending_serial: null,
            serial_end: "050",
            is_first_period: true,
          },
        },
      ];

      const onMarkSoldOut = vi.fn();
      const onEndingChange = vi.fn();

      // WHEN: Component is rendered in manual entry mode
      render(
        <DayBinsTable
          bins={xssBins}
          onMarkSoldOut={onMarkSoldOut}
          manualEntryMode={true}
          endingValues={{}}
          onEndingChange={onEndingChange}
        />,
      );

      // THEN: Button is rendered (not broken by XSS)
      const button = screen.getByTestId("mark-sold-btn-bin-xss");
      expect(button).toBeInTheDocument();

      // AND: aria-label contains escaped payload (not executed)
      expect(button).toHaveAttribute(
        "aria-label",
        `Mark pack ${xssPayload} as sold out`,
      );
    });

    it("should render Mark Sold button for all bins with packs in manual entry mode", () => {
      // GIVEN: DayBinsTable with multiple bins in manual entry mode
      const onMarkSoldOut = vi.fn();
      const onEndingChange = vi.fn();
      render(
        <DayBinsTable
          bins={mockBinsWithPacks}
          onMarkSoldOut={onMarkSoldOut}
          manualEntryMode={true}
          endingValues={{}}
          onEndingChange={onEndingChange}
        />,
      );

      // THEN: Both bins with packs have Mark Sold buttons
      expect(screen.getByTestId("mark-sold-btn-bin-001")).toBeInTheDocument();
      expect(screen.getByTestId("mark-sold-btn-bin-003")).toBeInTheDocument();

      // AND: Empty bin does not have button
      expect(
        screen.queryByTestId("mark-sold-btn-bin-002"),
      ).not.toBeInTheDocument();
    });

    it("should call onMarkSoldOut with correct pack_id for different bins", () => {
      // GIVEN: DayBinsTable with multiple bins in manual entry mode
      const onMarkSoldOut = vi.fn();
      const onEndingChange = vi.fn();
      render(
        <DayBinsTable
          bins={mockBinsWithPacks}
          onMarkSoldOut={onMarkSoldOut}
          manualEntryMode={true}
          endingValues={{}}
          onEndingChange={onEndingChange}
        />,
      );

      // WHEN: Click first bin's button
      fireEvent.click(screen.getByTestId("mark-sold-btn-bin-001"));

      // THEN: Called with pack-001
      expect(onMarkSoldOut).toHaveBeenCalledWith("pack-001");

      // WHEN: Click third bin's button
      fireEvent.click(screen.getByTestId("mark-sold-btn-bin-003"));

      // THEN: Called with pack-003
      expect(onMarkSoldOut).toHaveBeenCalledWith("pack-003");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RETURN PACK BUTTON TESTS
  // Story: Lottery Pack Return Feature
  // MCP: SEC-010 AUTHZ - ACTIVE and RECEIVED packs can be returned
  // ═══════════════════════════════════════════════════════════════════════════
  // TRACEABILITY:
  // | Test ID  | Requirement                    | Priority |
  // |----------|--------------------------------|----------|
  // | RET-001  | Return button renders          | P0       |
  // | RET-002  | Return button calls callback   | P0       |
  // | RET-003  | Return button has aria-label   | P1       |
  // | RET-004  | Return hidden in manual mode   | P0       |
  // | RET-005  | No Return for empty bins       | P0       |
  // | RET-006  | XSS in aria-label              | P0       |
  // | RET-007  | Multiple bins Return buttons   | P1       |
  // | RET-008  | Actions column visibility      | P0       |
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Return Pack Button", () => {
    const mockBinsWithPacks: DayBin[] = [
      {
        bin_id: "bin-001",
        bin_number: 1,
        name: "Bin 1",
        is_active: true,
        pack: {
          pack_id: "pack-001",
          pack_number: "1234567",
          game_name: "Mega Millions",
          game_price: 5.0,
          starting_serial: "001",
          ending_serial: "025",
          serial_end: "050",
          is_first_period: true,
        },
      },
      {
        bin_id: "bin-002",
        bin_number: 2,
        name: "Bin 2",
        is_active: true,
        pack: null, // Empty bin
      },
      {
        bin_id: "bin-003",
        bin_number: 3,
        name: "Bin 3",
        is_active: true,
        pack: {
          pack_id: "pack-003",
          pack_number: "7654321",
          game_name: "Powerball",
          game_price: 10.0,
          starting_serial: "050",
          ending_serial: null,
          serial_end: "100",
          is_first_period: true,
        },
      },
    ];

    it("RET-001: [P0] should render Return button when onReturnPack is provided", () => {
      // GIVEN: DayBinsTable with onReturnPack callback
      const onReturnPack = vi.fn();

      // WHEN: Component is rendered (NOT in manual entry mode)
      render(
        <DayBinsTable bins={mockBinsWithPacks} onReturnPack={onReturnPack} />,
      );

      // THEN: Return buttons are rendered for bins with packs
      expect(screen.getByTestId("return-pack-btn-bin-001")).toBeInTheDocument();
      expect(screen.getByTestId("return-pack-btn-bin-003")).toBeInTheDocument();
    });

    it("RET-002: [P0] should call onReturnPack with pack_id when clicked", () => {
      // GIVEN: DayBinsTable with onReturnPack callback
      const onReturnPack = vi.fn();
      render(
        <DayBinsTable bins={mockBinsWithPacks} onReturnPack={onReturnPack} />,
      );

      // WHEN: Return button is clicked
      const button = screen.getByTestId("return-pack-btn-bin-001");
      fireEvent.click(button);

      // THEN: onReturnPack is called with the pack_id
      expect(onReturnPack).toHaveBeenCalledWith("pack-001");
    });

    it("RET-003: [P1] should have accessible aria-label on Return button", () => {
      // GIVEN: DayBinsTable with onReturnPack callback
      const onReturnPack = vi.fn();
      render(
        <DayBinsTable bins={mockBinsWithPacks} onReturnPack={onReturnPack} />,
      );

      // THEN: Button has descriptive aria-label
      const button = screen.getByTestId("return-pack-btn-bin-001");
      expect(button).toHaveAttribute(
        "aria-label",
        "Return pack 1234567 to supplier",
      );
    });

    it("RET-004: [P0] should NOT render Return button in manual entry mode", () => {
      // GIVEN: DayBinsTable with onReturnPack but IN manual entry mode
      const onReturnPack = vi.fn();
      const onEndingChange = vi.fn();

      // WHEN: Component is rendered in manual entry mode
      render(
        <DayBinsTable
          bins={mockBinsWithPacks}
          onReturnPack={onReturnPack}
          manualEntryMode={true}
          endingValues={{}}
          onEndingChange={onEndingChange}
        />,
      );

      // THEN: Return buttons are NOT rendered
      expect(
        screen.queryByTestId("return-pack-btn-bin-001"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("return-pack-btn-bin-003"),
      ).not.toBeInTheDocument();
    });

    it("RET-005: [P0] should NOT render Return button for empty bins", () => {
      // GIVEN: DayBinsTable with onReturnPack callback
      const onReturnPack = vi.fn();
      render(
        <DayBinsTable bins={mockBinsWithPacks} onReturnPack={onReturnPack} />,
      );

      // THEN: Empty bin (bin-002) does not have Return button
      expect(
        screen.queryByTestId("return-pack-btn-bin-002"),
      ).not.toBeInTheDocument();
    });

    it("RET-006: [P0] [SECURITY] should prevent XSS in Return button aria-label", () => {
      // GIVEN: Bin with XSS attempt in pack number
      const xssPayload = "<script>alert('xss')</script>";
      const xssBins: DayBin[] = [
        {
          bin_id: "bin-xss",
          bin_number: 1,
          name: "Bin XSS",
          is_active: true,
          pack: {
            pack_id: "pack-xss",
            pack_number: xssPayload,
            game_name: "Safe Game",
            game_price: 5.0,
            starting_serial: "001",
            ending_serial: null,
            serial_end: "050",
            is_first_period: true,
          },
        },
      ];

      const onReturnPack = vi.fn();

      // WHEN: Component is rendered
      render(<DayBinsTable bins={xssBins} onReturnPack={onReturnPack} />);

      // THEN: Button is rendered (not broken by XSS)
      const button = screen.getByTestId("return-pack-btn-bin-xss");
      expect(button).toBeInTheDocument();

      // AND: aria-label contains escaped payload (not executed)
      expect(button).toHaveAttribute(
        "aria-label",
        `Return pack ${xssPayload} to supplier`,
      );
    });

    it("RET-007: [P1] should call onReturnPack with correct pack_id for different bins", () => {
      // GIVEN: DayBinsTable with multiple bins
      const onReturnPack = vi.fn();
      render(
        <DayBinsTable bins={mockBinsWithPacks} onReturnPack={onReturnPack} />,
      );

      // WHEN: Click first bin's Return button
      fireEvent.click(screen.getByTestId("return-pack-btn-bin-001"));

      // THEN: Called with pack-001
      expect(onReturnPack).toHaveBeenCalledWith("pack-001");

      // WHEN: Click third bin's Return button
      fireEvent.click(screen.getByTestId("return-pack-btn-bin-003"));

      // THEN: Called with pack-003
      expect(onReturnPack).toHaveBeenCalledWith("pack-003");
    });

    it("RET-008: [P0] should render Actions column header when onReturnPack provided", () => {
      // GIVEN: DayBinsTable with onReturnPack callback
      const onReturnPack = vi.fn();

      // WHEN: Component is rendered
      render(
        <DayBinsTable bins={mockBinsWithPacks} onReturnPack={onReturnPack} />,
      );

      // THEN: Actions column header is visible
      expect(screen.getByText("Actions")).toBeInTheDocument();
    });

    it("RET-009: [P1] should NOT render Actions column when no action handlers provided", () => {
      // GIVEN: DayBinsTable without any action handlers
      // WHEN: Component is rendered
      render(<DayBinsTable bins={mockBinsWithPacks} />);

      // THEN: Actions column header is NOT visible
      expect(screen.queryByText("Actions")).not.toBeInTheDocument();
    });

    it("RET-010: [P1] should stop propagation when Return button clicked (no row click)", () => {
      // GIVEN: DayBinsTable with both onRowClick and onReturnPack
      const onRowClick = vi.fn();
      const onReturnPack = vi.fn();
      render(
        <DayBinsTable
          bins={mockBinsWithPacks}
          onRowClick={onRowClick}
          onReturnPack={onReturnPack}
        />,
      );

      // WHEN: Return button is clicked
      fireEvent.click(screen.getByTestId("return-pack-btn-bin-001"));

      // THEN: onReturnPack is called but NOT onRowClick
      expect(onReturnPack).toHaveBeenCalledWith("pack-001");
      expect(onRowClick).not.toHaveBeenCalled();
    });

    it("RET-011: [P1] should render both Return and Mark Sold buttons when appropriate", () => {
      // GIVEN: DayBinsTable with both handlers but NOT in manual entry mode
      const onReturnPack = vi.fn();
      const onMarkSoldOut = vi.fn();

      // WHEN: Component is rendered (NOT in manual entry mode)
      render(
        <DayBinsTable
          bins={mockBinsWithPacks}
          onReturnPack={onReturnPack}
          onMarkSoldOut={onMarkSoldOut}
          manualEntryMode={false}
        />,
      );

      // THEN: Only Return button is visible (Mark Sold requires manual entry mode)
      expect(screen.getByTestId("return-pack-btn-bin-001")).toBeInTheDocument();
      expect(
        screen.queryByTestId("mark-sold-btn-bin-001"),
      ).not.toBeInTheDocument();
    });

    it("RET-012: [P1] should switch from Return to Mark Sold when entering manual mode", () => {
      // GIVEN: DayBinsTable with both handlers
      const onReturnPack = vi.fn();
      const onMarkSoldOut = vi.fn();
      const onEndingChange = vi.fn();

      // WHEN: Component is rendered IN manual entry mode
      render(
        <DayBinsTable
          bins={mockBinsWithPacks}
          onReturnPack={onReturnPack}
          onMarkSoldOut={onMarkSoldOut}
          manualEntryMode={true}
          endingValues={{}}
          onEndingChange={onEndingChange}
        />,
      );

      // THEN: Mark Sold is visible, Return is NOT
      expect(screen.getByTestId("mark-sold-btn-bin-001")).toBeInTheDocument();
      expect(
        screen.queryByTestId("return-pack-btn-bin-001"),
      ).not.toBeInTheDocument();
    });
  });
});
