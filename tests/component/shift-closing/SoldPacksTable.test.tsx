/**
 * Sold Packs Table Component Tests
 *
 * Tests for the sold packs table component:
 * - Read-only table rendering
 * - Auto-filled ending numbers
 * - Hide section when no depleted packs
 * - Display all columns correctly
 *
 * @test-level Component
 * @justification Tests UI component behavior and conditional rendering
 * @story 10-1 - Lottery Shift Closing Page UI
 * @priority P1 (High - Core Feature)
 */

import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "../../support/test-utils";
import { SoldPacksTable } from "@/components/shift-closing/SoldPacksTable";
import type { DepletedPack } from "@/lib/api/shift-closing";

describe("10-1-COMPONENT: SoldPacksTable", () => {
  const mockSoldPacks: DepletedPack[] = [
    {
      bin_id: "bin-1",
      bin_number: 1,
      pack_id: "pack-1",
      game_name: "$5 Powerball",
      game_price: 5,
      starting_serial: "045",
      ending_serial: "999",
    },
    {
      bin_id: "bin-2",
      bin_number: 2,
      pack_id: "pack-2",
      game_name: "$10 Scratch",
      game_price: 10,
      starting_serial: "100",
      ending_serial: "199",
    },
  ];

  it("10-1-COMPONENT-005: should show sold packs section when packs depleted this shift", () => {
    // GIVEN: Depleted packs from this shift
    // WHEN: Component is rendered
    renderWithProviders(<SoldPacksTable soldPacks={mockSoldPacks} />);

    // THEN: Sold packs section is displayed
    const section = screen.getByTestId("sold-packs-section");
    expect(section).toBeInTheDocument();

    // AND: Section title is displayed
    expect(screen.getByText("Sold Packs")).toBeInTheDocument();
  });

  it("10-1-COMPONENT-006: should hide sold packs section when no depleted packs", () => {
    // GIVEN: No depleted packs
    // WHEN: Component is rendered with empty array
    const { container } = renderWithProviders(
      <SoldPacksTable soldPacks={[]} />,
    );

    // THEN: Section is not rendered (returns null)
    const section = screen.queryByTestId("sold-packs-section");
    expect(section).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it("should render read-only table with correct columns", () => {
    // GIVEN: Depleted packs
    // WHEN: Component is rendered
    renderWithProviders(<SoldPacksTable soldPacks={mockSoldPacks} />);

    // THEN: Table headers are displayed
    expect(screen.getByText("Bin")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Amount")).toBeInTheDocument();
    expect(screen.getByText("Starting")).toBeInTheDocument();
    expect(screen.getByText("Ending")).toBeInTheDocument();
  });

  it("should display all depleted pack information", () => {
    // GIVEN: Depleted packs
    // WHEN: Component is rendered
    renderWithProviders(<SoldPacksTable soldPacks={mockSoldPacks} />);

    // THEN: All pack information is displayed
    expect(screen.getByText("1")).toBeInTheDocument(); // bin_number
    expect(screen.getByText("$5 Powerball")).toBeInTheDocument(); // game_name
    expect(screen.getByText("$5")).toBeInTheDocument(); // game_price
    expect(screen.getByText("045")).toBeInTheDocument(); // starting_serial
    expect(screen.getByText("999")).toBeInTheDocument(); // ending_serial

    // AND: Second pack information
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("$10 Scratch")).toBeInTheDocument();
    expect(screen.getByText("$10")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("199")).toBeInTheDocument();
  });

  it("should show auto-filled ending numbers (pack's serial_end)", () => {
    // GIVEN: Depleted pack with ending_serial
    // WHEN: Component is rendered
    renderWithProviders(<SoldPacksTable soldPacks={mockSoldPacks} />);

    // THEN: Ending serial is displayed (auto-filled from pack's serial_end)
    expect(screen.getByText("999")).toBeInTheDocument(); // ending_serial from pack-1
    expect(screen.getByText("199")).toBeInTheDocument(); // ending_serial from pack-2
  });

  it("should display bin numbers in monospace font with primary color", () => {
    // GIVEN: Depleted packs
    // WHEN: Component is rendered
    renderWithProviders(<SoldPacksTable soldPacks={mockSoldPacks} />);

    // THEN: Bin numbers are displayed
    const binCells = screen.getAllByText(/^[12]$/);
    expect(binCells.length).toBeGreaterThan(0);

    // Check that bin numbers have the expected styling classes
    binCells.forEach((cell) => {
      expect(cell).toHaveClass("font-mono", "text-primary", "font-semibold");
    });
  });

  it("should display starting and ending serials in monospace font", () => {
    // GIVEN: Depleted packs
    // WHEN: Component is rendered
    renderWithProviders(<SoldPacksTable soldPacks={mockSoldPacks} />);

    // THEN: Starting and ending serials are displayed in monospace
    const startingSerials = screen.getAllByText(/^(045|100)$/);
    const endingSerials = screen.getAllByText(/^(999|199)$/);

    expect(startingSerials.length).toBeGreaterThan(0);
    expect(endingSerials.length).toBeGreaterThan(0);

    // Check monospace font class
    startingSerials.forEach((cell) => {
      expect(cell).toHaveClass("font-mono");
    });
    endingSerials.forEach((cell) => {
      expect(cell).toHaveClass("font-mono");
    });
  });

  it("should handle null/undefined soldPacks gracefully", () => {
    // GIVEN: Null or undefined soldPacks
    // WHEN: Component is rendered
    const { container: container1 } = renderWithProviders(
      <SoldPacksTable soldPacks={null as any} />,
    );
    const { container: container2 } = renderWithProviders(
      <SoldPacksTable soldPacks={undefined as any} />,
    );

    // THEN: Component returns null (hides section)
    expect(container1.firstChild).toBeNull();
    expect(container2.firstChild).toBeNull();
  });

  // ============ SECURITY TESTS (MANDATORY) ============

  it("10-1-COMPONENT-SEC-006: should prevent XSS in game_name rendering", () => {
    // GIVEN: Sold pack with XSS attempt in game name
    const xssSoldPacks: DepletedPack[] = [
      {
        bin_id: "bin-1",
        bin_number: 1,
        pack_id: "pack-1",
        game_name: "<script>alert('XSS')</script>$5 Powerball",
        game_price: 5,
        starting_serial: "045",
        ending_serial: "999",
      },
    ];

    // WHEN: Component is rendered
    renderWithProviders(<SoldPacksTable soldPacks={xssSoldPacks} />);

    // THEN: XSS is escaped (React automatically escapes HTML)
    const gameNameCell = screen.getByText(
      /<script>alert\('XSS'\)<\/script>\$5 Powerball/,
    );
    expect(gameNameCell).toBeInTheDocument();
    // Verify it's rendered as text, not HTML
    expect(gameNameCell.tagName).not.toBe("SCRIPT");
  });

  // ============ AUTOMATIC ASSERTIONS ============

  it("10-1-COMPONENT-ASSERT-004: should have correct table structure with data-testid", () => {
    // GIVEN: Depleted packs
    // WHEN: Component is rendered
    renderWithProviders(<SoldPacksTable soldPacks={mockSoldPacks} />);

    // THEN: Section has correct data-testid
    const section = screen.getByTestId("sold-packs-section");
    expect(section).toBeInTheDocument();

    // AND: Table headers have scope="col"
    const headers = screen.getAllByRole("columnheader");
    headers.forEach((header) => {
      expect(header).toHaveAttribute("scope", "col");
    });
  });

  it("10-1-COMPONENT-ASSERT-005: should have read-only table (no input fields)", () => {
    // GIVEN: Depleted packs
    // WHEN: Component is rendered
    renderWithProviders(<SoldPacksTable soldPacks={mockSoldPacks} />);

    // THEN: No input fields are present (read-only table)
    const inputs = screen.queryAllByRole("textbox");
    expect(inputs.length).toBe(0);
  });

  // ============ EDGE CASES ============

  it("10-1-COMPONENT-EDGE-014: should handle many sold packs (50+)", () => {
    // GIVEN: Many sold packs (50)
    const manySoldPacks: DepletedPack[] = Array.from(
      { length: 50 },
      (_, i) => ({
        bin_id: `bin-${i + 1}`,
        bin_number: i + 1,
        pack_id: `pack-${i + 1}`,
        game_name: "$5 Powerball",
        game_price: 5,
        starting_serial: "045",
        ending_serial: "999",
      }),
    );

    // WHEN: Component is rendered
    renderWithProviders(<SoldPacksTable soldPacks={manySoldPacks} />);

    // THEN: All 50 sold packs are displayed
    const rows = screen.getAllByRole("row");
    // Header row + 50 data rows
    expect(rows.length).toBe(51);
  });

  it("10-1-COMPONENT-EDGE-015: should handle very long game names in sold packs", () => {
    // GIVEN: Sold pack with very long game name (1000+ characters)
    const longGameName = "A".repeat(1000) + " Powerball";
    const longNameSoldPacks: DepletedPack[] = [
      {
        bin_id: "bin-1",
        bin_number: 1,
        pack_id: "pack-1",
        game_name: longGameName,
        game_price: 5,
        starting_serial: "045",
        ending_serial: "999",
      },
    ];

    // WHEN: Component is rendered
    renderWithProviders(<SoldPacksTable soldPacks={longNameSoldPacks} />);

    // THEN: Long game name is displayed
    expect(screen.getByText(longGameName)).toBeInTheDocument();
  });

  it("10-1-COMPONENT-EDGE-016: should handle special characters in game names", () => {
    // GIVEN: Sold pack with special characters in game name
    const specialCharSoldPacks: DepletedPack[] = [
      {
        bin_id: "bin-1",
        bin_number: 1,
        pack_id: "pack-1",
        game_name: "Powerball™ & Mega Millions®",
        game_price: 5,
        starting_serial: "045",
        ending_serial: "999",
      },
    ];

    // WHEN: Component is rendered
    renderWithProviders(<SoldPacksTable soldPacks={specialCharSoldPacks} />);

    // THEN: Special characters are displayed correctly
    expect(screen.getByText(/Powerball™ & Mega Millions®/)).toBeInTheDocument();
  });
});
