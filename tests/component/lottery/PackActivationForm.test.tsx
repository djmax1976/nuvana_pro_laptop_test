/**
 * Component Tests: PackActivationForm
 *
 * Tests PackActivationForm component behavior:
 * - Displays packs with RECEIVED status for selection
 * - Activates pack on form submission
 * - Shows success/error messages
 * - Refreshes pack list after activation
 *
 * @test-level COMPONENT
 * @justification Tests UI form behavior in isolation - fast, isolated, granular
 * @story 6-10 - Lottery Management UI
 * @priority P1 (High - Pack Activation)
 *
 * RED PHASE: These tests define expected behavior before implementation.
 * Tests will fail until component is implemented.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PackActivationForm } from "@/components/lottery/PackActivationForm";

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

// Mock API client
vi.mock("@/lib/api/lottery", () => ({
  activatePack: vi.fn(),
  getPacks: vi.fn(),
}));

describe("6.10-COMPONENT: PackActivationForm", () => {
  const mockOnSuccess = vi.fn();
  const mockOnCancel = vi.fn();
  const mockPacks = [
    {
      pack_id: "123e4567-e89b-12d3-a456-426614174000",
      pack_number: "PACK-001",
      status: "RECEIVED" as const,
      game: { name: "Game 1" },
    },
    {
      pack_id: "223e4567-e89b-12d3-a456-426614174001",
      pack_number: "PACK-002",
      status: "RECEIVED" as const,
      game: { name: "Game 2" },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("6.10-COMPONENT-020: [P1] should display packs with RECEIVED status (AC #3)", async () => {
    // GIVEN: PackActivationForm component with RECEIVED packs
    const { getPacks } = await import("@/lib/api/lottery");
    vi.mocked(getPacks).mockResolvedValue({
      success: true,
      data: mockPacks,
    });

    // WHEN: Component is rendered
    render(
      <PackActivationForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // THEN: Only RECEIVED packs are displayed
    await waitFor(() => {
      expect(screen.getByText("PACK-001")).toBeInTheDocument();
      expect(screen.getByText("PACK-002")).toBeInTheDocument();
    });
  });

  it("6.10-COMPONENT-021: [P1] should not display packs with non-RECEIVED status (AC #3)", async () => {
    // GIVEN: PackActivationForm component with mixed status packs
    const { getPacks } = await import("@/lib/api/lottery");
    vi.mocked(getPacks).mockResolvedValue({
      success: true,
      data: [
        ...mockPacks,
        {
          pack_id: "323e4567-e89b-12d3-a456-426614174002",
          pack_number: "PACK-003",
          status: "ACTIVE" as const,
          game: { name: "Game 3" },
        },
      ],
    });

    // WHEN: Component is rendered
    render(
      <PackActivationForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // THEN: ACTIVE pack is not displayed
    await waitFor(() => {
      expect(screen.queryByText("PACK-003")).not.toBeInTheDocument();
    });
  });

  it("6.10-COMPONENT-022: [P1] should activate pack on form submission (AC #3)", async () => {
    // GIVEN: PackActivationForm component with selected pack
    const user = userEvent.setup();
    const { getPacks, activatePack } = await import("@/lib/api/lottery");
    vi.mocked(getPacks).mockResolvedValue({
      success: true,
      data: mockPacks,
    });
    vi.mocked(activatePack).mockResolvedValue({
      success: true,
      data: {
        pack_id: mockPacks[0].pack_id,
        status: "ACTIVE",
      },
    });

    render(
      <PackActivationForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // WHEN: User selects pack and submits
    await waitFor(() => {
      expect(screen.getByText("PACK-001")).toBeInTheDocument();
    });
    const packOption = screen.getByText("PACK-001");
    await user.click(packOption);
    const submitButton = screen.getByRole("button", {
      name: /activate|submit/i,
    });
    await user.click(submitButton);

    // THEN: activatePack API is called
    await waitFor(() => {
      expect(activatePack).toHaveBeenCalledWith(mockPacks[0].pack_id);
    });
  });

  it("6.10-COMPONENT-023: [P1] should display success message after activation (AC #3)", async () => {
    // GIVEN: PackActivationForm component with successful activation
    const user = userEvent.setup();
    const { getPacks, activatePack } = await import("@/lib/api/lottery");
    vi.mocked(getPacks).mockResolvedValue({
      success: true,
      data: mockPacks,
    });
    vi.mocked(activatePack).mockResolvedValue({
      success: true,
      data: {
        pack_id: mockPacks[0].pack_id,
        status: "ACTIVE",
      },
    });

    render(
      <PackActivationForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // WHEN: User activates pack
    await waitFor(() => {
      expect(screen.getByText("PACK-001")).toBeInTheDocument();
    });
    const packOption = screen.getByText("PACK-001");
    await user.click(packOption);
    const submitButton = screen.getByRole("button", {
      name: /activate|submit/i,
    });
    await user.click(submitButton);

    // THEN: Success message is displayed
    await waitFor(() => {
      expect(
        screen.getByText(/success|activated|pack.*activated/i),
      ).toBeInTheDocument();
    });
  });

  it("6.10-COMPONENT-024: [P1] should refresh pack list after activation (AC #3)", async () => {
    // GIVEN: PackActivationForm component with successful activation
    const user = userEvent.setup();
    const { getPacks, activatePack } = await import("@/lib/api/lottery");
    vi.mocked(getPacks).mockResolvedValue({
      success: true,
      data: mockPacks,
    });
    vi.mocked(activatePack).mockResolvedValue({
      success: true,
      data: {
        pack_id: mockPacks[0].pack_id,
        status: "ACTIVE",
      },
    });

    render(
      <PackActivationForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // WHEN: User activates pack
    await waitFor(() => {
      expect(screen.getByText("PACK-001")).toBeInTheDocument();
    });
    const packOption = screen.getByText("PACK-001");
    await user.click(packOption);
    const submitButton = screen.getByRole("button", {
      name: /activate|submit/i,
    });
    await user.click(submitButton);

    // THEN: onSuccess callback is called (triggers list refresh)
    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });

  it("6.10-COMPONENT-025: [P1] should display error message on activation failure (AC #3)", async () => {
    // GIVEN: PackActivationForm component with activation failure
    const user = userEvent.setup();
    const { getPacks, activatePack } = await import("@/lib/api/lottery");
    vi.mocked(getPacks).mockResolvedValue({
      success: true,
      data: mockPacks,
    });
    vi.mocked(activatePack).mockRejectedValue(new Error("Activation failed"));

    render(
      <PackActivationForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />,
    );

    // WHEN: User activates pack
    await waitFor(() => {
      expect(screen.getByText("PACK-001")).toBeInTheDocument();
    });
    const packOption = screen.getByText("PACK-001");
    await user.click(packOption);
    const submitButton = screen.getByRole("button", {
      name: /activate|submit/i,
    });
    await user.click(submitButton);

    // THEN: Error message is displayed
    await waitFor(() => {
      expect(
        screen.getByText(/error|failed|activation.*failed/i),
      ).toBeInTheDocument();
    });
  });
});
