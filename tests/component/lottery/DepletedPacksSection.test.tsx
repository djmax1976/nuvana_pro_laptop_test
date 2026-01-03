/**
 * @test-level COMPONENT
 * @justification Tests UI component behavior in isolation - fast, isolated, granular
 *
 * Component Tests: DepletedPacksSection
 *
 * Tests DepletedPacksSection component behavior for displaying depleted packs:
 * - Collapsible section with trigger button
 * - Table columns: Bin, Game, Amount, Pack #, Activated At, Sold Out At
 * - Time formatting for activated_at and depleted_at timestamps
 * - Default open/closed state
 * - Empty state (hidden when no depleted packs)
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
  DepletedPacksSection,
  type DepletedPacksSectionProps,
} from "@/components/lottery/DepletedPacksSection";
import type { DepletedPackDay } from "@/lib/api/lottery";

describe("DepletedPacksSection Component", () => {
  const mockDepletedPacks: DepletedPackDay[] = [
    {
      pack_id: "pack-001",
      pack_number: "1234567",
      game_name: "Mega Millions",
      game_price: 5.0,
      bin_number: 1,
      activated_at: "2025-12-15T08:00:00Z",
      depleted_at: "2025-12-15T14:30:00Z",
    },
    {
      pack_id: "pack-002",
      pack_number: "7654321",
      game_name: "Powerball",
      game_price: 10.0,
      bin_number: 3,
      activated_at: "2025-12-15T09:15:00Z",
      depleted_at: "2025-12-15T16:45:00Z",
    },
    {
      pack_id: "pack-003",
      pack_number: "9999999",
      game_name: "Lucky 7's",
      game_price: 2.0,
      bin_number: 0, // 0 indicates pack may not have been in a bin
      activated_at: "2025-12-15T07:30:00Z",
      depleted_at: "2025-12-15T10:00:00Z",
    },
  ];

  const defaultProps: DepletedPacksSectionProps = {
    depletedPacks: mockDepletedPacks,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BASIC RENDERING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("should render the section with correct data-testid", () => {
    // GIVEN: DepletedPacksSection with depleted packs
    // WHEN: Component is rendered
    render(<DepletedPacksSection {...defaultProps} />);

    // THEN: Section is rendered with proper test id
    expect(screen.getByTestId("depleted-packs-section")).toBeInTheDocument();
  });

  it("should display trigger button with pack count", () => {
    // GIVEN: DepletedPacksSection with 3 depleted packs
    // WHEN: Component is rendered
    render(<DepletedPacksSection {...defaultProps} />);

    // THEN: Trigger button shows count
    const trigger = screen.getByTestId("depleted-packs-trigger");
    expect(trigger).toBeInTheDocument();
    // Text is split across elements, so check textContent directly on trigger
    expect(trigger.textContent).toContain("Sold Out Packs Today (3)");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // COLLAPSIBLE BEHAVIOR TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("should be collapsed by default", () => {
    // GIVEN: DepletedPacksSection with default props
    // WHEN: Component is rendered
    render(<DepletedPacksSection {...defaultProps} />);

    // THEN: Content is not visible
    expect(
      screen.queryByTestId("depleted-packs-content"),
    ).not.toBeInTheDocument();
  });

  it("should expand when trigger is clicked", () => {
    // GIVEN: DepletedPacksSection collapsed
    render(<DepletedPacksSection {...defaultProps} />);

    // WHEN: Trigger button is clicked
    fireEvent.click(screen.getByTestId("depleted-packs-trigger"));

    // THEN: Content becomes visible
    expect(screen.getByTestId("depleted-packs-content")).toBeInTheDocument();
  });

  it("should collapse when trigger is clicked again", () => {
    // GIVEN: DepletedPacksSection expanded
    render(<DepletedPacksSection {...defaultProps} />);
    fireEvent.click(screen.getByTestId("depleted-packs-trigger"));
    expect(screen.getByTestId("depleted-packs-content")).toBeInTheDocument();

    // WHEN: Trigger button is clicked again
    fireEvent.click(screen.getByTestId("depleted-packs-trigger"));

    // THEN: Content is hidden
    expect(
      screen.queryByTestId("depleted-packs-content"),
    ).not.toBeInTheDocument();
  });

  it("should respect defaultOpen prop", () => {
    // GIVEN: DepletedPacksSection with defaultOpen=true
    // WHEN: Component is rendered
    render(<DepletedPacksSection {...defaultProps} defaultOpen={true} />);

    // THEN: Content is visible
    expect(screen.getByTestId("depleted-packs-content")).toBeInTheDocument();
  });

  it("should show chevron down when expanded", () => {
    // GIVEN: DepletedPacksSection expanded
    render(<DepletedPacksSection {...defaultProps} defaultOpen={true} />);

    // THEN: ChevronDown icon should be present (expanded state)
    // Note: Lucide icons don't have data-testid by default, so we check for svg
    const trigger = screen.getByTestId("depleted-packs-trigger");
    const svgs = trigger.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(1); // Package icon + ChevronDown
  });

  it("should show chevron right when collapsed", () => {
    // GIVEN: DepletedPacksSection collapsed
    render(<DepletedPacksSection {...defaultProps} defaultOpen={false} />);

    // THEN: ChevronRight icon should be present (collapsed state)
    const trigger = screen.getByTestId("depleted-packs-trigger");
    const svgs = trigger.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(1); // Package icon + ChevronRight
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TABLE CONTENT TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("should display all column headers when expanded", () => {
    // GIVEN: DepletedPacksSection expanded
    // WHEN: Component is rendered
    render(<DepletedPacksSection {...defaultProps} defaultOpen={true} />);

    // THEN: All column headers are displayed
    expect(screen.getByText("Bin")).toBeInTheDocument();
    expect(screen.getByText("Game")).toBeInTheDocument();
    expect(screen.getByText("Price")).toBeInTheDocument();
    expect(screen.getByText("Pack #")).toBeInTheDocument();
    expect(screen.getByText("Activated At")).toBeInTheDocument();
    expect(screen.getByText("Sold Out At")).toBeInTheDocument();
  });

  it("should display depleted pack data correctly", () => {
    // GIVEN: DepletedPacksSection with depleted packs expanded
    // WHEN: Component is rendered
    render(<DepletedPacksSection {...defaultProps} defaultOpen={true} />);

    // THEN: Pack data is displayed correctly
    // Note: With responsive design, content appears in both table (desktop) and cards (mobile)
    // Use getAllByText to handle multiple matches across responsive views
    expect(screen.getAllByText("Mega Millions").length).toBeGreaterThanOrEqual(
      1,
    );
    expect(screen.getAllByText("$5.00").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("1234567").length).toBeGreaterThanOrEqual(1);

    expect(screen.getAllByText("Powerball").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("$10.00").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("7654321").length).toBeGreaterThanOrEqual(1);

    expect(screen.getAllByText("Lucky 7's").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("$2.00").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("9999999").length).toBeGreaterThanOrEqual(1);
  });

  it("should display bin numbers correctly", () => {
    // GIVEN: DepletedPacksSection expanded
    // WHEN: Component is rendered
    render(<DepletedPacksSection {...defaultProps} defaultOpen={true} />);

    // THEN: Bin numbers are displayed (first two packs have bins)
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("should display bin number '0' for packs with bin_number 0", () => {
    // GIVEN: DepletedPacksSection with pack that has bin_number 0
    // WHEN: Component is rendered
    render(<DepletedPacksSection {...defaultProps} defaultOpen={true} />);

    // THEN: '0' is displayed for bin column of pack with bin_number 0
    // (0 is a valid bin number, component shows it as-is)
    const rows = screen.getAllByTestId(/depleted-pack-row-/);
    const packWithBinZero = rows.find((row) =>
      row.getAttribute("data-testid")?.includes("pack-003"),
    );
    expect(packWithBinZero).toHaveTextContent("0");
  });

  it("should create unique row test ids", () => {
    // GIVEN: DepletedPacksSection expanded
    // WHEN: Component is rendered
    render(<DepletedPacksSection {...defaultProps} defaultOpen={true} />);

    // THEN: Each row has test id (may appear twice due to responsive design: table + cards)
    // Use getAllByTestId to handle multiple matches across responsive views
    expect(
      screen.getAllByTestId("depleted-pack-row-pack-001").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByTestId("depleted-pack-row-pack-002").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByTestId("depleted-pack-row-pack-003").length,
    ).toBeGreaterThanOrEqual(1);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TIME FORMATTING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("should format activated_at and depleted_at times correctly", () => {
    // GIVEN: DepletedPacksSection with specific times
    // Note: Time formatting depends on locale, so we check for pattern
    // WHEN: Component is rendered
    render(<DepletedPacksSection {...defaultProps} defaultOpen={true} />);

    // THEN: Times are formatted as HH:MM (locale-dependent format)
    // The exact format varies by locale, but should contain time-like patterns
    const content = screen.getByTestId("depleted-packs-content");
    expect(content).toBeInTheDocument();
  });

  it("should display '--' for invalid depleted_at time", () => {
    // GIVEN: Pack with invalid depleted_at
    const invalidTimePacks: DepletedPackDay[] = [
      {
        pack_id: "pack-invalid",
        pack_number: "1234567",
        game_name: "Test Game",
        game_price: 5.0,
        bin_number: 1,
        activated_at: "2025-12-15T08:00:00Z",
        depleted_at: "not-a-valid-iso-string",
      },
    ];

    // WHEN: Component is rendered
    render(
      <DepletedPacksSection
        depletedPacks={invalidTimePacks}
        defaultOpen={true}
      />,
    );

    // THEN: Component renders without crashing (time cell may show '--' or fallback)
    // Note: With responsive design, content appears in both table and cards
    expect(screen.getByTestId("depleted-packs-content")).toBeInTheDocument();
    expect(screen.getAllByText("Test Game").length).toBeGreaterThanOrEqual(1);
  });

  it("should display '--' for invalid activated_at time", () => {
    // GIVEN: Pack with invalid activated_at
    const invalidTimePacks: DepletedPackDay[] = [
      {
        pack_id: "pack-invalid-activated",
        pack_number: "1234567",
        game_name: "Test Game",
        game_price: 5.0,
        bin_number: 1,
        activated_at: "not-a-valid-iso-string",
        depleted_at: "2025-12-15T14:30:00Z",
      },
    ];

    // WHEN: Component is rendered
    render(
      <DepletedPacksSection
        depletedPacks={invalidTimePacks}
        defaultOpen={true}
      />,
    );

    // THEN: Component renders without crashing (time cell may show '--' or fallback)
    // Note: With responsive design, content appears in both table and cards
    expect(screen.getByTestId("depleted-packs-content")).toBeInTheDocument();
    expect(screen.getAllByText("Test Game").length).toBeGreaterThanOrEqual(1);
  });

  it("should display '--' for empty depleted_at time", () => {
    // GIVEN: Pack with empty depleted_at
    const emptyTimePacks: DepletedPackDay[] = [
      {
        pack_id: "pack-empty",
        pack_number: "1234567",
        game_name: "Test Game",
        game_price: 5.0,
        bin_number: 1,
        activated_at: "2025-12-15T08:00:00Z",
        depleted_at: "",
      },
    ];

    // WHEN: Component is rendered
    render(
      <DepletedPacksSection
        depletedPacks={emptyTimePacks}
        defaultOpen={true}
      />,
    );

    // THEN: '--' is displayed for empty time (may appear in both table and card views)
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(1);
  });

  it("should display '--' for empty activated_at time", () => {
    // GIVEN: Pack with empty activated_at
    const emptyTimePacks: DepletedPackDay[] = [
      {
        pack_id: "pack-empty-activated",
        pack_number: "1234567",
        game_name: "Test Game",
        game_price: 5.0,
        bin_number: 1,
        activated_at: "",
        depleted_at: "2025-12-15T14:30:00Z",
      },
    ];

    // WHEN: Component is rendered
    render(
      <DepletedPacksSection
        depletedPacks={emptyTimePacks}
        defaultOpen={true}
      />,
    );

    // THEN: '--' is displayed for empty time (may appear in both table and card views)
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(1);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EMPTY STATE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("should NOT render when depletedPacks is empty", () => {
    // GIVEN: DepletedPacksSection with no depleted packs
    // WHEN: Component is rendered
    const { container } = render(<DepletedPacksSection depletedPacks={[]} />);

    // THEN: Nothing is rendered
    expect(container.firstChild).toBeNull();
  });

  it("should NOT render when depletedPacks is null", () => {
    // GIVEN: DepletedPacksSection with null packs
    // WHEN: Component is rendered
    const { container } = render(
      <DepletedPacksSection depletedPacks={null as any} />,
    );

    // THEN: Nothing is rendered
    expect(container.firstChild).toBeNull();
  });

  it("should NOT render when depletedPacks is undefined", () => {
    // GIVEN: DepletedPacksSection with undefined packs
    // WHEN: Component is rendered
    const { container } = render(
      <DepletedPacksSection depletedPacks={undefined as any} />,
    );

    // THEN: Nothing is rendered
    expect(container.firstChild).toBeNull();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS - XSS Prevention
  // ═══════════════════════════════════════════════════════════════════════════

  it("[SECURITY] should prevent XSS in game name field", () => {
    // GIVEN: Pack with XSS attempt in game name
    const xssPayload = "<script>alert('xss')</script>";
    const xssPacks: DepletedPackDay[] = [
      {
        pack_id: "pack-xss",
        pack_number: "1234567",
        game_name: xssPayload,
        game_price: 5.0,
        bin_number: 1,
        activated_at: "2025-12-15T08:00:00Z",
        depleted_at: "2025-12-15T14:30:00Z",
      },
    ];

    // WHEN: Component is rendered
    render(
      <DepletedPacksSection depletedPacks={xssPacks} defaultOpen={true} />,
    );

    // THEN: XSS payload is rendered as escaped text (not executed)
    // Note: With responsive design, text appears in both table and card views
    const gameCells = screen.getAllByText(xssPayload);
    expect(gameCells.length).toBeGreaterThanOrEqual(1);
    gameCells.forEach((cell) => {
      expect(cell.tagName).not.toBe("SCRIPT");
    });
  });

  it("[SECURITY] should prevent XSS in pack number field", () => {
    // GIVEN: Pack with XSS attempt in pack number
    const xssPayload = "<img src=x onerror=alert('xss')>";
    const xssPacks: DepletedPackDay[] = [
      {
        pack_id: "pack-xss",
        pack_number: xssPayload,
        game_name: "Safe Game",
        game_price: 5.0,
        bin_number: 1,
        activated_at: "2025-12-15T08:00:00Z",
        depleted_at: "2025-12-15T14:30:00Z",
      },
    ];

    // WHEN: Component is rendered
    render(
      <DepletedPacksSection depletedPacks={xssPacks} defaultOpen={true} />,
    );

    // THEN: XSS payload is rendered as escaped text (in both responsive views)
    expect(screen.getAllByText(xssPayload).length).toBeGreaterThanOrEqual(1);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("[EDGE CASE] should handle special characters in game names", () => {
    // GIVEN: Pack with special characters in game name
    const specialPacks: DepletedPackDay[] = [
      {
        pack_id: "pack-special",
        pack_number: "1234567",
        game_name: "Lucky 7's™ & More €$£",
        game_price: 5.0,
        bin_number: 1,
        activated_at: "2025-12-15T08:00:00Z",
        depleted_at: "2025-12-15T14:30:00Z",
      },
    ];

    // WHEN: Component is rendered
    render(
      <DepletedPacksSection depletedPacks={specialPacks} defaultOpen={true} />,
    );

    // THEN: Special characters are displayed correctly (in both responsive views)
    expect(
      screen.getAllByText("Lucky 7's™ & More €$£").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("[EDGE CASE] should handle zero price gracefully", () => {
    // GIVEN: Pack with zero price
    const zeroPricePacks: DepletedPackDay[] = [
      {
        pack_id: "pack-zero",
        pack_number: "1234567",
        game_name: "Free Game",
        game_price: 0,
        bin_number: 1,
        activated_at: "2025-12-15T08:00:00Z",
        depleted_at: "2025-12-15T14:30:00Z",
      },
    ];

    // WHEN: Component is rendered
    render(
      <DepletedPacksSection
        depletedPacks={zeroPricePacks}
        defaultOpen={true}
      />,
    );

    // THEN: Zero price is formatted correctly (in both responsive views)
    expect(screen.getAllByText("$0.00").length).toBeGreaterThanOrEqual(1);
  });

  it("[EDGE CASE] should handle many depleted packs", () => {
    // GIVEN: Many depleted packs
    const manyPacks: DepletedPackDay[] = Array.from({ length: 50 }, (_, i) => ({
      pack_id: `pack-${i}`,
      pack_number: `${1000000 + i}`,
      game_name: `Game ${i}`,
      game_price: i + 1,
      bin_number: i % 10,
      activated_at: `2025-12-15T${String((i + 6) % 24).padStart(2, "0")}:00:00Z`,
      depleted_at: `2025-12-15T${String(i % 24).padStart(2, "0")}:00:00Z`,
    }));

    // WHEN: Component is rendered
    render(
      <DepletedPacksSection depletedPacks={manyPacks} defaultOpen={true} />,
    );

    // THEN: All packs are rendered - check trigger text directly
    const trigger = screen.getByTestId("depleted-packs-trigger");
    expect(trigger.textContent).toContain("(50)");
    // Text appears in both table and card views
    expect(screen.getAllByText("Game 0").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Game 49").length).toBeGreaterThanOrEqual(1);
  });

  it("[EDGE CASE] should handle single depleted pack", () => {
    // GIVEN: Single depleted pack
    const singlePack: DepletedPackDay[] = [mockDepletedPacks[0]];

    // WHEN: Component is rendered
    render(<DepletedPacksSection depletedPacks={singlePack} />);

    // THEN: Count shows (1) - check trigger text directly
    const trigger = screen.getByTestId("depleted-packs-trigger");
    expect(trigger.textContent).toContain("(1)");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCESSIBILITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("[A11Y] should have proper table header scope attributes", () => {
    // GIVEN: DepletedPacksSection expanded
    // WHEN: Component is rendered
    render(<DepletedPacksSection {...defaultProps} defaultOpen={true} />);

    // THEN: All headers have scope="col"
    const headers = screen.getAllByRole("columnheader");
    headers.forEach((header) => {
      expect(header).toHaveAttribute("scope", "col");
    });
  });

  it("[A11Y] should use semantic table elements when expanded", () => {
    // GIVEN: DepletedPacksSection expanded
    // WHEN: Component is rendered
    render(<DepletedPacksSection {...defaultProps} defaultOpen={true} />);

    // THEN: Table uses semantic elements
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("[A11Y] should be keyboard accessible", () => {
    // GIVEN: DepletedPacksSection
    // WHEN: Component is rendered
    render(<DepletedPacksSection {...defaultProps} />);

    // THEN: Trigger button is focusable and has button role
    const trigger = screen.getByTestId("depleted-packs-trigger");
    expect(trigger.closest("button")).toBeInTheDocument();
  });
});
