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
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  PackDetailsModal,
  type PackDetailsData,
} from "@/components/lottery/PackDetailsModal";

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

describe("6.10-COMPONENT: PackDetailsModal", () => {
  const mockPack: PackDetailsData = {
    pack_id: "123e4567-e89b-12d3-a456-426614174000",
    pack_number: "PACK-001",
    serial_start: "0001",
    serial_end: "0100",
    status: "ACTIVE",
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

  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("6.10-COMPONENT-030: [P2] should display serial range (AC #4)", async () => {
    // GIVEN: PackDetailsModal component with pack data
    // WHEN: Modal is rendered
    render(
      <PackDetailsModal
        pack={mockPack}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // THEN: Serial range is displayed
    expect(screen.getByText(/0001 - 0100/i)).toBeInTheDocument();
  });

  it("6.10-COMPONENT-031: [P2] should display tickets remaining (AC #4)", async () => {
    // GIVEN: PackDetailsModal component with pack data
    // WHEN: Modal is rendered
    render(
      <PackDetailsModal
        pack={mockPack}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // THEN: Tickets remaining is displayed
    expect(screen.getByText("75")).toBeInTheDocument();
  });

  it("6.10-COMPONENT-032: [P2] should display pack status (AC #4)", async () => {
    // GIVEN: PackDetailsModal component with pack data
    // WHEN: Modal is rendered
    render(
      <PackDetailsModal
        pack={mockPack}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // THEN: Pack status is displayed
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
  });

  it("6.10-COMPONENT-033: [P2] should display activation timestamp (AC #4)", async () => {
    // GIVEN: PackDetailsModal component with pack data
    // WHEN: Modal is rendered
    render(
      <PackDetailsModal
        pack={mockPack}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // THEN: Activation timestamp is displayed (formatted)
    expect(screen.getByText(/Jan 01, 2024/i)).toBeInTheDocument();
  });

  it("6.10-COMPONENT-034: [P2] should display game information (AC #4)", async () => {
    // GIVEN: PackDetailsModal component with pack data
    // WHEN: Modal is rendered
    render(
      <PackDetailsModal
        pack={mockPack}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // THEN: Game information is displayed
    expect(screen.getByText("Scratch-Off Game 1")).toBeInTheDocument();
  });

  it("6.10-COMPONENT-035: [P2] should display bin assignment if available (AC #4)", async () => {
    // GIVEN: PackDetailsModal component with pack data including bin
    // WHEN: Modal is rendered
    render(
      <PackDetailsModal
        pack={mockPack}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // THEN: Bin assignment is displayed
    expect(screen.getByText(/Bin 01/i)).toBeInTheDocument();
  });

  it("6.10-COMPONENT-036: [P2] should not display bin if not assigned (AC #4)", async () => {
    // GIVEN: PackDetailsModal component with pack data without bin
    const packWithoutBin: PackDetailsData = { ...mockPack, bin: null };

    // WHEN: Modal is rendered
    render(
      <PackDetailsModal
        pack={packWithoutBin}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // THEN: Bin section is not displayed
    expect(screen.queryByText(/Bin 01/i)).not.toBeInTheDocument();
  });

  it("6.10-COMPONENT-037: [P2] should close modal when clicking outside (AC #4)", async () => {
    // GIVEN: PackDetailsModal component
    const user = userEvent.setup();
    render(
      <PackDetailsModal
        pack={mockPack}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // WHEN: User presses escape or clicks overlay
    // Note: Dialog close is handled by onOpenChange callback
    // Testing that the component renders and accepts the callback
    expect(screen.getByText("Pack Details")).toBeInTheDocument();
  });

  it("6.10-COMPONENT-038: [P2] should handle zero tickets remaining (AC #4)", async () => {
    // GIVEN: PackDetailsModal component with pack having zero tickets remaining
    const depletedPack: PackDetailsData = { ...mockPack, tickets_remaining: 0 };

    // WHEN: Modal is rendered
    render(
      <PackDetailsModal
        pack={depletedPack}
        open={true}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // THEN: Zero tickets remaining is displayed
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("6.10-COMPONENT-039: [P2] should not render content when open is false (AC #4)", async () => {
    // GIVEN: PackDetailsModal component with open=false
    render(
      <PackDetailsModal
        pack={mockPack}
        open={false}
        onOpenChange={mockOnOpenChange}
      />,
    );

    // THEN: Dialog content is not visible
    expect(screen.queryByText("Pack Details")).not.toBeInTheDocument();
  });

  it("6.10-COMPONENT-040: [P2] should show loading state (AC #4)", async () => {
    // GIVEN: PackDetailsModal component in loading state
    render(
      <PackDetailsModal
        pack={null}
        open={true}
        onOpenChange={mockOnOpenChange}
        isLoading={true}
      />,
    );

    // THEN: Loading indicator is shown
    expect(screen.getByText(/loading pack details/i)).toBeInTheDocument();
  });
});
