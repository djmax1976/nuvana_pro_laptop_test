/**
 * Component Tests: PackDetailsModal
 *
 * Tests PackDetailsModal component behavior:
 * - Displays pack details (serial range, tickets remaining, status, game info, bin)
 * - Calculates and displays tickets remaining
 * - Shows activation timestamp
 * - Handles modal open/close
 *
 * @test-level COMPONENT
 * @justification Tests UI modal behavior in isolation - fast, isolated, granular
 * @story 6-10 - Lottery Management UI
 * @priority P2 (Medium - Pack Details Display)
 *
 * RED PHASE: These tests define expected behavior before implementation.
 * Tests will fail until component is implemented.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PackDetailsModal } from "@/components/lottery/PackDetailsModal";

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

describe("6.10-COMPONENT: PackDetailsModal", () => {
  const mockPack = {
    pack_id: "123e4567-e89b-12d3-a456-426614174000",
    pack_number: "PACK-001",
    serial_start: "0001",
    serial_end: "0100",
    status: "ACTIVE" as const,
    activated_at: "2024-01-01T10:00:00Z",
    game: {
      game_id: "223e4567-e89b-12d3-a456-426614174001",
      name: "Scratch-Off Game 1",
      description: "Test game",
    },
    tickets_remaining: 75,
    bin: {
      bin_id: "323e4567-e89b-12d3-a456-426614174002",
      name: "Bin 01",
    },
  };

  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("6.10-COMPONENT-030: [P2] should display serial range (AC #4)", async () => {
    // GIVEN: PackDetailsModal component with pack data
    // WHEN: Modal is rendered
    render(
      <PackDetailsModal pack={mockPack} isOpen={true} onClose={mockOnClose} />,
    );

    // THEN: Serial range is displayed
    expect(screen.getByText(/0001.*0100|serial.*range/i)).toBeInTheDocument();
  });

  it("6.10-COMPONENT-031: [P2] should display tickets remaining (AC #4)", async () => {
    // GIVEN: PackDetailsModal component with pack data
    // WHEN: Modal is rendered
    render(
      <PackDetailsModal pack={mockPack} isOpen={true} onClose={mockOnClose} />,
    );

    // THEN: Tickets remaining is displayed
    expect(screen.getByText(/75|tickets.*remaining/i)).toBeInTheDocument();
  });

  it("6.10-COMPONENT-032: [P2] should display pack status (AC #4)", async () => {
    // GIVEN: PackDetailsModal component with pack data
    // WHEN: Modal is rendered
    render(
      <PackDetailsModal pack={mockPack} isOpen={true} onClose={mockOnClose} />,
    );

    // THEN: Pack status is displayed
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
  });

  it("6.10-COMPONENT-033: [P2] should display activation timestamp (AC #4)", async () => {
    // GIVEN: PackDetailsModal component with pack data
    // WHEN: Modal is rendered
    render(
      <PackDetailsModal pack={mockPack} isOpen={true} onClose={mockOnClose} />,
    );

    // THEN: Activation timestamp is displayed
    expect(screen.getByText(/2024-01-01|activated.*at/i)).toBeInTheDocument();
  });

  it("6.10-COMPONENT-034: [P2] should display game information (AC #4)", async () => {
    // GIVEN: PackDetailsModal component with pack data
    // WHEN: Modal is rendered
    render(
      <PackDetailsModal pack={mockPack} isOpen={true} onClose={mockOnClose} />,
    );

    // THEN: Game information is displayed
    expect(screen.getByText("Scratch-Off Game 1")).toBeInTheDocument();
  });

  it("6.10-COMPONENT-035: [P2] should display bin assignment if available (AC #4)", async () => {
    // GIVEN: PackDetailsModal component with pack data including bin
    // WHEN: Modal is rendered
    render(
      <PackDetailsModal pack={mockPack} isOpen={true} onClose={mockOnClose} />,
    );

    // THEN: Bin assignment is displayed
    expect(screen.getByText(/Bin 01|bin.*assignment/i)).toBeInTheDocument();
  });

  it("6.10-COMPONENT-036: [P2] should not display bin if not assigned (AC #4)", async () => {
    // GIVEN: PackDetailsModal component with pack data without bin
    const packWithoutBin = { ...mockPack, bin: null };
    // WHEN: Modal is rendered
    render(
      <PackDetailsModal
        pack={packWithoutBin}
        isOpen={true}
        onClose={mockOnClose}
      />,
    );

    // THEN: Bin assignment is not displayed
    expect(
      screen.queryByText(/Bin 01|bin.*assignment/i),
    ).not.toBeInTheDocument();
  });

  it("6.10-COMPONENT-037: [P2] should close modal when close button is clicked (AC #4)", async () => {
    // GIVEN: PackDetailsModal component
    const user = userEvent.setup();
    render(
      <PackDetailsModal pack={mockPack} isOpen={true} onClose={mockOnClose} />,
    );

    // WHEN: User clicks close button
    const closeButton = screen.getByRole("button", { name: /close/i });
    await user.click(closeButton);

    // THEN: onClose callback is called
    expect(mockOnClose).toHaveBeenCalled();
  });

  it("6.10-COMPONENT-038: [P2] should handle zero tickets remaining (AC #4)", async () => {
    // GIVEN: PackDetailsModal component with pack having zero tickets remaining
    const depletedPack = { ...mockPack, tickets_remaining: 0 };
    // WHEN: Modal is rendered
    render(
      <PackDetailsModal
        pack={depletedPack}
        isOpen={true}
        onClose={mockOnClose}
      />,
    );

    // THEN: Zero tickets remaining is displayed
    expect(screen.getByText(/0|zero.*tickets/i)).toBeInTheDocument();
  });
});
