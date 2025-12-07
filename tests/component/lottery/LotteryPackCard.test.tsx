/**
 * Component Tests: LotteryPackCard
 *
 * Tests LotteryPackCard component rendering and interactions:
 * - Displays pack information (pack_number, game name, serial range)
 * - Shows status badges with correct colors
 * - Displays tickets remaining calculation
 * - Shows bin assignment (if applicable)
 * - Handles click for pack details
 *
 * @test-level COMPONENT
 * @justification Tests UI component behavior in isolation - fast, isolated, granular
 * @story 6-10 - Lottery Management UI
 * @priority P1 (High - Pack Display)
 *
 * RED PHASE: These tests define expected behavior before implementation.
 * Tests will fail until component is implemented.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LotteryPackCard } from "@/components/lottery/LotteryPackCard";

// Note: Component should be in src/components/lottery/LotteryPackCard.tsx

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

describe("6.10-COMPONENT: LotteryPackCard", () => {
  const mockPack = {
    pack_id: "123e4567-e89b-12d3-a456-426614174000",
    pack_number: "PACK-001",
    serial_start: "0001",
    serial_end: "0100",
    status: "ACTIVE" as const,
    game: {
      game_id: "223e4567-e89b-12d3-a456-426614174001",
      name: "Scratch-Off Game 1",
    },
    tickets_remaining: 75,
    bin: {
      bin_id: "323e4567-e89b-12d3-a456-426614174002",
      bin_number: "BIN-01",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("6.10-COMPONENT-001: [P1] should display pack number (AC #1)", async () => {
    // GIVEN: LotteryPackCard component with pack data
    // WHEN: Component is rendered
    render(<LotteryPackCard pack={mockPack} />);

    // THEN: Pack number is displayed
    expect(screen.getByText("PACK-001")).toBeInTheDocument();
  });

  it("6.10-COMPONENT-002: [P1] should display game name (AC #1)", async () => {
    // GIVEN: LotteryPackCard component with pack data
    // WHEN: Component is rendered
    render(<LotteryPackCard pack={mockPack} />);

    // THEN: Game name is displayed
    expect(screen.getByText("Scratch-Off Game 1")).toBeInTheDocument();
  });

  it("6.10-COMPONENT-003: [P1] should display serial range (AC #1)", async () => {
    // GIVEN: LotteryPackCard component with pack data
    // WHEN: Component is rendered
    render(<LotteryPackCard pack={mockPack} />);

    // THEN: Serial range is displayed (0001 - 0100)
    expect(screen.getByText(/0001.*0100/)).toBeInTheDocument();
  });

  it("6.10-COMPONENT-004: [P1] should display ACTIVE status badge with green color (AC #1)", async () => {
    // GIVEN: LotteryPackCard component with ACTIVE pack
    // WHEN: Component is rendered
    render(<LotteryPackCard pack={mockPack} />);

    // THEN: ACTIVE status badge is displayed with green color
    const badge = screen.getByText("ACTIVE");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass(/green|bg-green|text-green/);
  });

  it("6.10-COMPONENT-005: [P1] should display RECEIVED status badge with blue/gray color (AC #1)", async () => {
    // GIVEN: LotteryPackCard component with RECEIVED pack
    const receivedPack = { ...mockPack, status: "RECEIVED" as const };
    // WHEN: Component is rendered
    render(<LotteryPackCard pack={receivedPack} />);

    // THEN: RECEIVED status badge is displayed with blue/gray color
    const badge = screen.getByText("RECEIVED");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass(/blue|gray|bg-blue|bg-gray/);
  });

  it("6.10-COMPONENT-006: [P1] should display tickets remaining (AC #4)", async () => {
    // GIVEN: LotteryPackCard component with pack data
    // WHEN: Component is rendered
    render(<LotteryPackCard pack={mockPack} />);

    // THEN: Tickets remaining is displayed
    expect(screen.getByText(/75.*remaining/i)).toBeInTheDocument();
  });

  it("6.10-COMPONENT-007: [P1] should display bin assignment when available (AC #4)", async () => {
    // GIVEN: LotteryPackCard component with bin assignment
    // WHEN: Component is rendered
    render(<LotteryPackCard pack={mockPack} />);

    // THEN: Bin number is displayed
    expect(screen.getByText(/BIN-01/i)).toBeInTheDocument();
  });

  it("6.10-COMPONENT-008: [P1] should not display bin when not assigned (AC #4)", async () => {
    // GIVEN: LotteryPackCard component without bin assignment
    const packWithoutBin = { ...mockPack, bin: null };
    // WHEN: Component is rendered
    render(<LotteryPackCard pack={packWithoutBin} />);

    // THEN: Bin information is not displayed
    expect(screen.queryByText(/BIN/i)).not.toBeInTheDocument();
  });

  it("6.10-COMPONENT-009: [P1] should handle click for pack details (AC #1)", async () => {
    // GIVEN: LotteryPackCard component with onClick handler
    const user = userEvent.setup();
    const onDetailsClick = vi.fn();
    // WHEN: Component is rendered and card is clicked
    render(<LotteryPackCard pack={mockPack} onDetailsClick={onDetailsClick} />);
    const card = screen.getByRole("button") || screen.getByTestId("pack-card");
    await user.click(card);

    // THEN: onClick handler is called with pack_id
    expect(onDetailsClick).toHaveBeenCalledWith(mockPack.pack_id);
  });
});
