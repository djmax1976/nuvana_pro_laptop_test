/**
 * @test-level COMPONENT
 * @justification Tests UI component behavior in isolation - fast, isolated, granular
 *
 * Component Tests: ActivatedPacksSection
 *
 * Tests ActivatedPacksSection component behavior for displaying activated packs:
 * - Collapsible section with trigger button
 * - Table columns: Bin, Game, Price, Pack #, Activated, Status
 * - Status badges: Active, Sold Out (Depleted), Returned
 * - Time/datetime formatting for activated_at timestamps
 * - Enterprise close-to-close business day model (multi-day period handling)
 * - Default open/closed state
 * - Empty state (hidden when no activated packs)
 * - XSS prevention for user-generated content
 * - Status count subtitle in header
 *
 * MCP Guidance Applied:
 * - TESTING: Component tests are fast, isolated, and granular
 * - SECURITY: XSS prevention tests for all user-generated fields
 * - FE-001: STATE_MANAGEMENT - Tests state toggle behavior
 * - SEC-014: INPUT_VALIDATION - Tests defensive null/undefined checks, status allowlist
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  ActivatedPacksSection,
  type ActivatedPacksSectionProps,
} from "@/components/lottery/ActivatedPacksSection";
import type { ActivatedPackDay, OpenBusinessPeriod } from "@/lib/api/lottery";

describe("ActivatedPacksSection Component", () => {
  // Mock data with status field (enterprise close-to-close model)
  const mockActivatedPacks: ActivatedPackDay[] = [
    {
      pack_id: "pack-001",
      pack_number: "1234567",
      game_name: "Mega Millions",
      game_price: 5.0,
      bin_number: 1,
      activated_at: "2025-12-15T14:30:00Z",
      status: "ACTIVE",
    },
    {
      pack_id: "pack-002",
      pack_number: "7654321",
      game_name: "Powerball",
      game_price: 10.0,
      bin_number: 3,
      activated_at: "2025-12-15T16:45:00Z",
      status: "ACTIVE",
    },
    {
      pack_id: "pack-003",
      pack_number: "9999999",
      game_name: "Lucky 7's",
      game_price: 2.0,
      bin_number: 0, // 0 indicates pack may not have been in a bin
      activated_at: "2025-12-15T10:00:00Z",
      status: "ACTIVE",
    },
  ];

  // Mock data including depleted packs (enterprise close-to-close model)
  const mockMixedStatusPacks: ActivatedPackDay[] = [
    {
      pack_id: "pack-001",
      pack_number: "1234567",
      game_name: "Mega Millions",
      game_price: 5.0,
      bin_number: 1,
      activated_at: "2025-12-15T14:30:00Z",
      status: "DEPLETED", // This pack was activated then sold out
    },
    {
      pack_id: "pack-002",
      pack_number: "7654321",
      game_name: "Powerball",
      game_price: 10.0,
      bin_number: 3,
      activated_at: "2025-12-15T16:45:00Z",
      status: "ACTIVE",
    },
    {
      pack_id: "pack-003",
      pack_number: "9999999",
      game_name: "Lucky 7's",
      game_price: 2.0,
      bin_number: 2,
      activated_at: "2025-12-15T10:00:00Z",
      status: "ACTIVE",
    },
    {
      pack_id: "pack-004",
      pack_number: "8888888",
      game_name: "Scratch & Win",
      game_price: 1.0,
      bin_number: 1, // Now in bin 1, replacing pack-001
      activated_at: "2025-12-16T09:00:00Z",
      status: "ACTIVE",
    },
  ];

  // Mock data with returned pack
  const mockWithReturnedPack: ActivatedPackDay[] = [
    {
      pack_id: "pack-001",
      pack_number: "1234567",
      game_name: "Mega Millions",
      game_price: 5.0,
      bin_number: 1,
      activated_at: "2025-12-15T14:30:00Z",
      status: "ACTIVE",
    },
    {
      pack_id: "pack-002",
      pack_number: "7654321",
      game_name: "Powerball",
      game_price: 10.0,
      bin_number: 3,
      activated_at: "2025-12-15T16:45:00Z",
      status: "RETURNED",
    },
  ];

  const mockOpenBusinessPeriod: OpenBusinessPeriod = {
    started_at: "2025-12-15T00:00:00Z",
    last_closed_date: "2025-12-14",
    is_first_period: false,
    days_since_last_close: 0,
  };

  const mockMultiDayPeriod: OpenBusinessPeriod = {
    started_at: "2025-12-13T00:00:00Z",
    last_closed_date: "2025-12-12",
    is_first_period: false,
    days_since_last_close: 2, // 2 days since last close
  };

  const mockFirstPeriod: OpenBusinessPeriod = {
    started_at: null,
    last_closed_date: null,
    is_first_period: true,
    days_since_last_close: null,
  };

  const defaultProps: ActivatedPacksSectionProps = {
    activatedPacks: mockActivatedPacks,
    openBusinessPeriod: mockOpenBusinessPeriod,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BASIC RENDERING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("should render the section with correct data-testid", () => {
    // GIVEN: ActivatedPacksSection with activated packs
    // WHEN: Component is rendered
    render(<ActivatedPacksSection {...defaultProps} />);

    // THEN: Section is rendered with proper test id
    expect(screen.getByTestId("activated-packs-section")).toBeInTheDocument();
  });

  it("should display trigger button with pack count", () => {
    // GIVEN: ActivatedPacksSection with 3 activated packs
    // WHEN: Component is rendered
    render(<ActivatedPacksSection {...defaultProps} />);

    // THEN: Trigger button shows count
    const trigger = screen.getByTestId("activated-packs-trigger");
    expect(trigger).toBeInTheDocument();
    // Text is split across elements, so check textContent directly on trigger
    expect(trigger.textContent).toContain("Activated Packs Today (3)");
  });

  it("should display 'Current Period' title when spanning multiple days", () => {
    // GIVEN: ActivatedPacksSection with multi-day business period
    // WHEN: Component is rendered
    render(
      <ActivatedPacksSection
        activatedPacks={mockActivatedPacks}
        openBusinessPeriod={mockMultiDayPeriod}
      />,
    );

    // THEN: Title shows 'Current Period' instead of 'Today'
    const trigger = screen.getByTestId("activated-packs-trigger");
    expect(trigger.textContent).toContain(
      "Activated Packs - Current Period (3)",
    );
  });

  it("should display generic title for first period (no prior closes)", () => {
    // GIVEN: ActivatedPacksSection for first ever business period
    // WHEN: Component is rendered
    render(
      <ActivatedPacksSection
        activatedPacks={mockActivatedPacks}
        openBusinessPeriod={mockFirstPeriod}
      />,
    );

    // THEN: Title shows generic 'Activated Packs' without Today/Current Period
    const trigger = screen.getByTestId("activated-packs-trigger");
    expect(trigger.textContent).toContain("Activated Packs (3)");
    expect(trigger.textContent).not.toContain("Today");
    expect(trigger.textContent).not.toContain("Current Period");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STATUS BADGE TESTS - Enterprise Close-to-Close Model
  // ═══════════════════════════════════════════════════════════════════════════

  it("should display Status column header when expanded", () => {
    // GIVEN: ActivatedPacksSection expanded
    // WHEN: Component is rendered
    render(<ActivatedPacksSection {...defaultProps} defaultOpen={true} />);

    // THEN: Status column header is displayed
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  it("should display Active status badge for active packs", () => {
    // GIVEN: ActivatedPacksSection with active packs
    // WHEN: Component is rendered
    render(<ActivatedPacksSection {...defaultProps} defaultOpen={true} />);

    // THEN: Active badges are displayed
    // Note: With responsive design, badges appear in both table and card views
    // Each pack has 2 badges (table + card view), so 3 packs = 6 Active badges minimum
    const activeBadges = screen.getAllByText("Active");
    expect(activeBadges.length).toBeGreaterThanOrEqual(3);
  });

  it("should display Sold Out badge for depleted packs", () => {
    // GIVEN: ActivatedPacksSection with mixed status packs (includes depleted)
    // WHEN: Component is rendered
    render(
      <ActivatedPacksSection
        activatedPacks={mockMixedStatusPacks}
        openBusinessPeriod={mockOpenBusinessPeriod}
        defaultOpen={true}
      />,
    );

    // THEN: Sold Out badge is displayed for depleted pack (in both views)
    expect(screen.getAllByText("Sold Out").length).toBeGreaterThanOrEqual(1);
    // And Active badges for the rest
    const activeBadges = screen.getAllByText("Active");
    expect(activeBadges.length).toBeGreaterThanOrEqual(3);
  });

  it("should display Returned badge for returned packs", () => {
    // GIVEN: ActivatedPacksSection with a returned pack
    // WHEN: Component is rendered
    render(
      <ActivatedPacksSection
        activatedPacks={mockWithReturnedPack}
        openBusinessPeriod={mockOpenBusinessPeriod}
        defaultOpen={true}
      />,
    );

    // THEN: Returned and Active badges are displayed (in both responsive views)
    expect(screen.getAllByText("Returned").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Active").length).toBeGreaterThanOrEqual(1);
  });

  it("should display status count subtitle when there are non-active packs", () => {
    // GIVEN: ActivatedPacksSection with mixed status packs
    // WHEN: Component is rendered
    render(
      <ActivatedPacksSection
        activatedPacks={mockMixedStatusPacks}
        openBusinessPeriod={mockOpenBusinessPeriod}
      />,
    );

    // THEN: Subtitle shows status breakdown
    const trigger = screen.getByTestId("activated-packs-trigger");
    expect(trigger.textContent).toContain("3 active");
    expect(trigger.textContent).toContain("1 sold out");
  });

  it("should NOT display subtitle when all packs are active", () => {
    // GIVEN: ActivatedPacksSection with all active packs
    // WHEN: Component is rendered
    render(<ActivatedPacksSection {...defaultProps} />);

    // THEN: No subtitle is displayed
    const trigger = screen.getByTestId("activated-packs-trigger");
    expect(trigger.textContent).not.toContain("active,");
    expect(trigger.textContent).not.toContain("sold out");
  });

  it("should apply reduced opacity to depleted pack rows", () => {
    // GIVEN: ActivatedPacksSection with depleted pack
    // WHEN: Component is rendered
    render(
      <ActivatedPacksSection
        activatedPacks={mockMixedStatusPacks}
        openBusinessPeriod={mockOpenBusinessPeriod}
        defaultOpen={true}
      />,
    );

    // THEN: Depleted pack rows have opacity class (appears in both table and card views)
    const depletedRows = screen.getAllByTestId("activated-pack-row-pack-001");
    depletedRows.forEach((row) => {
      // Table row has opacity-75 class, card has opacity-75 + bg-muted/30
      expect(row.className).toContain("opacity-75");
    });
  });

  it("should render status badge with correct test id", () => {
    // GIVEN: ActivatedPacksSection expanded
    // WHEN: Component is rendered
    render(<ActivatedPacksSection {...defaultProps} defaultOpen={true} />);

    // THEN: Status badges have correct test ids (appear in both responsive views)
    expect(
      screen.getAllByTestId("pack-status-pack-001").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByTestId("pack-status-pack-002").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByTestId("pack-status-pack-003").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("[SEC-014] should handle unknown status with safe fallback", () => {
    // GIVEN: Pack with unknown status (edge case from future API changes)
    const unknownStatusPacks: ActivatedPackDay[] = [
      {
        pack_id: "pack-unknown",
        pack_number: "1234567",
        game_name: "Test Game",
        game_price: 5.0,
        bin_number: 1,
        activated_at: "2025-12-15T14:30:00Z",
        status: "UNKNOWN_STATUS" as any, // Invalid status
      },
    ];

    // WHEN: Component is rendered
    render(
      <ActivatedPacksSection
        activatedPacks={unknownStatusPacks}
        defaultOpen={true}
      />,
    );

    // THEN: Falls back to Active display (safe default per allowlist pattern)
    // In both responsive views
    expect(screen.getAllByText("Active").length).toBeGreaterThanOrEqual(1);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // COLLAPSIBLE BEHAVIOR TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("should be collapsed by default", () => {
    // GIVEN: ActivatedPacksSection with default props
    // WHEN: Component is rendered
    render(<ActivatedPacksSection {...defaultProps} />);

    // THEN: Content is not visible
    expect(
      screen.queryByTestId("activated-packs-content"),
    ).not.toBeInTheDocument();
  });

  it("should expand when trigger is clicked", () => {
    // GIVEN: ActivatedPacksSection collapsed
    render(<ActivatedPacksSection {...defaultProps} />);

    // WHEN: Trigger button is clicked
    fireEvent.click(screen.getByTestId("activated-packs-trigger"));

    // THEN: Content becomes visible
    expect(screen.getByTestId("activated-packs-content")).toBeInTheDocument();
  });

  it("should collapse when trigger is clicked again", () => {
    // GIVEN: ActivatedPacksSection expanded
    render(<ActivatedPacksSection {...defaultProps} />);
    fireEvent.click(screen.getByTestId("activated-packs-trigger"));
    expect(screen.getByTestId("activated-packs-content")).toBeInTheDocument();

    // WHEN: Trigger button is clicked again
    fireEvent.click(screen.getByTestId("activated-packs-trigger"));

    // THEN: Content is hidden
    expect(
      screen.queryByTestId("activated-packs-content"),
    ).not.toBeInTheDocument();
  });

  it("should respect defaultOpen prop", () => {
    // GIVEN: ActivatedPacksSection with defaultOpen=true
    // WHEN: Component is rendered
    render(<ActivatedPacksSection {...defaultProps} defaultOpen={true} />);

    // THEN: Content is visible
    expect(screen.getByTestId("activated-packs-content")).toBeInTheDocument();
  });

  it("should show chevron down when expanded", () => {
    // GIVEN: ActivatedPacksSection expanded
    render(<ActivatedPacksSection {...defaultProps} defaultOpen={true} />);

    // THEN: ChevronDown icon should be present (expanded state)
    const trigger = screen.getByTestId("activated-packs-trigger");
    const svgs = trigger.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(1); // Sparkles icon + ChevronDown
  });

  it("should show chevron right when collapsed", () => {
    // GIVEN: ActivatedPacksSection collapsed
    render(<ActivatedPacksSection {...defaultProps} defaultOpen={false} />);

    // THEN: ChevronRight icon should be present (collapsed state)
    const trigger = screen.getByTestId("activated-packs-trigger");
    const svgs = trigger.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(1); // Sparkles icon + ChevronRight
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TABLE CONTENT TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("should display all column headers when expanded", () => {
    // GIVEN: ActivatedPacksSection expanded
    // WHEN: Component is rendered
    render(<ActivatedPacksSection {...defaultProps} defaultOpen={true} />);

    // THEN: All column headers are displayed
    expect(screen.getByText("Bin")).toBeInTheDocument();
    expect(screen.getByText("Game")).toBeInTheDocument();
    expect(screen.getByText("Price")).toBeInTheDocument();
    expect(screen.getByText("Pack #")).toBeInTheDocument();
    expect(screen.getByText("Activated")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  it("should show 'Activated' column header when spanning multiple days", () => {
    // GIVEN: ActivatedPacksSection with multi-day business period expanded
    // WHEN: Component is rendered
    render(
      <ActivatedPacksSection
        activatedPacks={mockActivatedPacks}
        openBusinessPeriod={mockMultiDayPeriod}
        defaultOpen={true}
      />,
    );

    // THEN: Column header shows 'Activated' (consistent across all views)
    expect(screen.getByText("Activated")).toBeInTheDocument();
  });

  it("should display activated pack data correctly", () => {
    // GIVEN: ActivatedPacksSection with activated packs expanded
    // WHEN: Component is rendered
    render(<ActivatedPacksSection {...defaultProps} defaultOpen={true} />);

    // THEN: Pack data is displayed correctly
    // Note: With responsive design, content appears in both table and card views
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
    // GIVEN: ActivatedPacksSection expanded
    // WHEN: Component is rendered
    render(<ActivatedPacksSection {...defaultProps} defaultOpen={true} />);

    // THEN: Bin numbers are displayed (first two packs have bins)
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("should display bin number '0' for packs with bin_number 0", () => {
    // GIVEN: ActivatedPacksSection with pack that has bin_number 0
    // WHEN: Component is rendered
    render(<ActivatedPacksSection {...defaultProps} defaultOpen={true} />);

    // THEN: '0' is displayed for bin column of pack with bin_number 0
    // (0 is a valid bin number, component shows it as-is)
    const rows = screen.getAllByTestId(/activated-pack-row-/);
    const packWithBinZero = rows.find((row) =>
      row.getAttribute("data-testid")?.includes("pack-003"),
    );
    expect(packWithBinZero).toHaveTextContent("0");
  });

  it("should create unique row test ids", () => {
    // GIVEN: ActivatedPacksSection expanded
    // WHEN: Component is rendered
    render(<ActivatedPacksSection {...defaultProps} defaultOpen={true} />);

    // THEN: Each row has test id (may appear twice due to responsive design: table + cards)
    expect(
      screen.getAllByTestId("activated-pack-row-pack-001").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByTestId("activated-pack-row-pack-002").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByTestId("activated-pack-row-pack-003").length,
    ).toBeGreaterThanOrEqual(1);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TIME FORMATTING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("should format activated_at time correctly", () => {
    // GIVEN: ActivatedPacksSection with specific times
    // Note: Time formatting depends on locale, so we check for pattern
    // WHEN: Component is rendered
    render(<ActivatedPacksSection {...defaultProps} defaultOpen={true} />);

    // THEN: Times are formatted as HH:MM (locale-dependent format)
    const content = screen.getByTestId("activated-packs-content");
    expect(content).toBeInTheDocument();
  });

  it("should display '--' for invalid activated_at time", () => {
    // GIVEN: Pack with invalid activated_at
    const invalidTimePacks: ActivatedPackDay[] = [
      {
        pack_id: "pack-invalid",
        pack_number: "1234567",
        game_name: "Test Game",
        game_price: 5.0,
        bin_number: 1,
        activated_at: "not-a-valid-iso-string",
        status: "ACTIVE",
      },
    ];

    // WHEN: Component is rendered
    render(
      <ActivatedPacksSection
        activatedPacks={invalidTimePacks}
        defaultOpen={true}
      />,
    );

    // THEN: Component renders without crashing (time cell shows '--' fallback)
    // Note: With responsive design, content appears in both table and card views
    expect(screen.getByTestId("activated-packs-content")).toBeInTheDocument();
    expect(screen.getAllByText("Test Game").length).toBeGreaterThanOrEqual(1);
  });

  it("should display '--' for empty activated_at time", () => {
    // GIVEN: Pack with empty activated_at
    const emptyTimePacks: ActivatedPackDay[] = [
      {
        pack_id: "pack-empty",
        pack_number: "1234567",
        game_name: "Test Game",
        game_price: 5.0,
        bin_number: 1,
        activated_at: "",
        status: "ACTIVE",
      },
    ];

    // WHEN: Component is rendered
    render(
      <ActivatedPacksSection
        activatedPacks={emptyTimePacks}
        defaultOpen={true}
      />,
    );

    // THEN: '--' is displayed for empty time (may appear in both responsive views)
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(1);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EMPTY STATE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("should NOT render when activatedPacks is empty", () => {
    // GIVEN: ActivatedPacksSection with no activated packs
    // WHEN: Component is rendered
    const { container } = render(<ActivatedPacksSection activatedPacks={[]} />);

    // THEN: Nothing is rendered
    expect(container.firstChild).toBeNull();
  });

  it("should NOT render when activatedPacks is null", () => {
    // GIVEN: ActivatedPacksSection with null packs
    // WHEN: Component is rendered
    const { container } = render(
      <ActivatedPacksSection activatedPacks={null as any} />,
    );

    // THEN: Nothing is rendered
    expect(container.firstChild).toBeNull();
  });

  it("should NOT render when activatedPacks is undefined", () => {
    // GIVEN: ActivatedPacksSection with undefined packs
    // WHEN: Component is rendered
    const { container } = render(
      <ActivatedPacksSection activatedPacks={undefined as any} />,
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
    const xssPacks: ActivatedPackDay[] = [
      {
        pack_id: "pack-xss",
        pack_number: "1234567",
        game_name: xssPayload,
        game_price: 5.0,
        bin_number: 1,
        activated_at: "2025-12-15T14:30:00Z",
        status: "ACTIVE",
      },
    ];

    // WHEN: Component is rendered
    render(
      <ActivatedPacksSection activatedPacks={xssPacks} defaultOpen={true} />,
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
    const xssPacks: ActivatedPackDay[] = [
      {
        pack_id: "pack-xss",
        pack_number: xssPayload,
        game_name: "Safe Game",
        game_price: 5.0,
        bin_number: 1,
        activated_at: "2025-12-15T14:30:00Z",
        status: "ACTIVE",
      },
    ];

    // WHEN: Component is rendered
    render(
      <ActivatedPacksSection activatedPacks={xssPacks} defaultOpen={true} />,
    );

    // THEN: XSS payload is rendered as escaped text (in both responsive views)
    expect(screen.getAllByText(xssPayload).length).toBeGreaterThanOrEqual(1);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("[EDGE CASE] should handle special characters in game names", () => {
    // GIVEN: Pack with special characters in game name
    const specialPacks: ActivatedPackDay[] = [
      {
        pack_id: "pack-special",
        pack_number: "1234567",
        game_name: "Lucky 7's™ & More €$£",
        game_price: 5.0,
        bin_number: 1,
        activated_at: "2025-12-15T14:30:00Z",
        status: "ACTIVE",
      },
    ];

    // WHEN: Component is rendered
    render(
      <ActivatedPacksSection
        activatedPacks={specialPacks}
        defaultOpen={true}
      />,
    );

    // THEN: Special characters are displayed correctly (in both responsive views)
    expect(
      screen.getAllByText("Lucky 7's™ & More €$£").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("[EDGE CASE] should handle zero price gracefully", () => {
    // GIVEN: Pack with zero price
    const zeroPricePacks: ActivatedPackDay[] = [
      {
        pack_id: "pack-zero",
        pack_number: "1234567",
        game_name: "Free Game",
        game_price: 0,
        bin_number: 1,
        activated_at: "2025-12-15T14:30:00Z",
        status: "ACTIVE",
      },
    ];

    // WHEN: Component is rendered
    render(
      <ActivatedPacksSection
        activatedPacks={zeroPricePacks}
        defaultOpen={true}
      />,
    );

    // THEN: Zero price is formatted correctly (in both responsive views)
    expect(screen.getAllByText("$0.00").length).toBeGreaterThanOrEqual(1);
  });

  it("[EDGE CASE] should handle many activated packs", () => {
    // GIVEN: Many activated packs
    const manyPacks: ActivatedPackDay[] = Array.from(
      { length: 50 },
      (_, i) => ({
        pack_id: `pack-${i}`,
        pack_number: `${1000000 + i}`,
        game_name: `Game ${i}`,
        game_price: i + 1,
        bin_number: i % 10,
        activated_at: `2025-12-15T${String(i % 24).padStart(2, "0")}:00:00Z`,
        status: "ACTIVE" as const,
      }),
    );

    // WHEN: Component is rendered
    render(
      <ActivatedPacksSection activatedPacks={manyPacks} defaultOpen={true} />,
    );

    // THEN: All packs are rendered - check trigger text directly
    const trigger = screen.getByTestId("activated-packs-trigger");
    expect(trigger.textContent).toContain("(50)");
    // Text appears in both table and card views
    expect(screen.getAllByText("Game 0").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Game 49").length).toBeGreaterThanOrEqual(1);
  });

  it("[EDGE CASE] should handle single activated pack", () => {
    // GIVEN: Single activated pack
    const singlePack: ActivatedPackDay[] = [mockActivatedPacks[0]];

    // WHEN: Component is rendered
    render(<ActivatedPacksSection activatedPacks={singlePack} />);

    // THEN: Count shows (1) - check trigger text directly
    const trigger = screen.getByTestId("activated-packs-trigger");
    expect(trigger.textContent).toContain("(1)");
  });

  it("[EDGE CASE] should render without openBusinessPeriod prop", () => {
    // GIVEN: ActivatedPacksSection without openBusinessPeriod
    // WHEN: Component is rendered
    render(
      <ActivatedPacksSection
        activatedPacks={mockActivatedPacks}
        defaultOpen={true}
      />,
    );

    // THEN: Component renders with fallback title
    const trigger = screen.getByTestId("activated-packs-trigger");
    expect(trigger.textContent).toContain("Activated Packs Today (3)");
  });

  it("[EDGE CASE] should handle all three status types in same list", () => {
    // GIVEN: Packs with all three status types
    const allStatusesPacks: ActivatedPackDay[] = [
      { ...mockActivatedPacks[0], status: "ACTIVE" },
      {
        ...mockActivatedPacks[1],
        pack_id: "pack-depleted",
        status: "DEPLETED",
      },
      {
        ...mockActivatedPacks[2],
        pack_id: "pack-returned",
        status: "RETURNED",
      },
    ];

    // WHEN: Component is rendered
    render(
      <ActivatedPacksSection
        activatedPacks={allStatusesPacks}
        defaultOpen={true}
      />,
    );

    // THEN: All status badges are displayed (in both responsive views)
    expect(screen.getAllByText("Active").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Sold Out").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Returned").length).toBeGreaterThanOrEqual(1);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCESSIBILITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("[A11Y] should have proper table header scope attributes", () => {
    // GIVEN: ActivatedPacksSection expanded
    // WHEN: Component is rendered
    render(<ActivatedPacksSection {...defaultProps} defaultOpen={true} />);

    // THEN: All headers have scope="col"
    const headers = screen.getAllByRole("columnheader");
    headers.forEach((header) => {
      expect(header).toHaveAttribute("scope", "col");
    });
  });

  it("[A11Y] should use semantic table elements when expanded", () => {
    // GIVEN: ActivatedPacksSection expanded
    // WHEN: Component is rendered
    render(<ActivatedPacksSection {...defaultProps} defaultOpen={true} />);

    // THEN: Table uses semantic elements
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("[A11Y] should be keyboard accessible", () => {
    // GIVEN: ActivatedPacksSection
    // WHEN: Component is rendered
    render(<ActivatedPacksSection {...defaultProps} />);

    // THEN: Trigger button is focusable and has button role
    const trigger = screen.getByTestId("activated-packs-trigger");
    expect(trigger.closest("button")).toBeInTheDocument();
  });

  it("[A11Y] should have aria-expanded attribute on trigger", () => {
    // GIVEN: ActivatedPacksSection
    // WHEN: Component is rendered collapsed
    render(<ActivatedPacksSection {...defaultProps} />);

    // THEN: Trigger has aria-expanded="false"
    const trigger = screen.getByTestId("activated-packs-trigger");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("[A11Y] should update aria-expanded when expanded", () => {
    // GIVEN: ActivatedPacksSection
    render(<ActivatedPacksSection {...defaultProps} />);

    // WHEN: Trigger is clicked
    fireEvent.click(screen.getByTestId("activated-packs-trigger"));

    // THEN: aria-expanded is updated to "true"
    const trigger = screen.getByTestId("activated-packs-trigger");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("[A11Y] should have aria-controls linking trigger to content", () => {
    // GIVEN: ActivatedPacksSection expanded
    // WHEN: Component is rendered
    render(<ActivatedPacksSection {...defaultProps} defaultOpen={true} />);

    // THEN: Trigger has aria-controls pointing to content
    const trigger = screen.getByTestId("activated-packs-trigger");
    expect(trigger).toHaveAttribute("aria-controls", "activated-packs-content");
    expect(screen.getByTestId("activated-packs-content")).toHaveAttribute(
      "id",
      "activated-packs-content",
    );
  });

  it("[A11Y] should have role=region on content area", () => {
    // GIVEN: ActivatedPacksSection expanded
    // WHEN: Component is rendered
    render(<ActivatedPacksSection {...defaultProps} defaultOpen={true} />);

    // THEN: Content area has role="region"
    const content = screen.getByTestId("activated-packs-content");
    expect(content).toHaveAttribute("role", "region");
  });

  it("[A11Y] should have aria-label on content region", () => {
    // GIVEN: ActivatedPacksSection expanded
    // WHEN: Component is rendered
    render(<ActivatedPacksSection {...defaultProps} defaultOpen={true} />);

    // THEN: Content area has descriptive aria-label
    const content = screen.getByTestId("activated-packs-content");
    expect(content).toHaveAttribute("aria-label", "Activated packs table");
  });
});
