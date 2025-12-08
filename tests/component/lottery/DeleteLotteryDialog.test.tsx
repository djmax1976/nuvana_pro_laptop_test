/**
 * Component Tests: DeleteLotteryDialog
 *
 * Tests DeleteLotteryDialog component behavior:
 * - Confirmation dialog rendering with pack details
 * - Delete confirmation flow
 * - API integration
 * - Security: XSS prevention in displayed pack data
 * - Business logic: Only non-active packs can be deleted
 *
 * @test-level COMPONENT
 * @justification Tests UI confirmation dialog behavior in isolation - fast, isolated, granular
 * @story 6-10-1 - Client Dashboard Lottery Page
 * @priority P1 (High - Delete Confirmation, API Integration)
 * @enhanced-by workflow-9 on 2025-01-28
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteLotteryDialog } from "@/components/lottery/DeleteLotteryDialog";

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

// Mock the toast hook
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

// Mock hooks
vi.mock("@/hooks/useLottery", () => ({
  usePackDetails: vi.fn(),
  useDeletePack: vi.fn(),
}));

import { usePackDetails, useDeletePack } from "@/hooks/useLottery";

describe("6.10.1-COMPONENT: DeleteLotteryDialog", () => {
  const mockOnSuccess = vi.fn();
  const mockOnOpenChange = vi.fn();
  const mockMutateAsync = vi.fn();
  const mockPackId = "pack-123";

  const mockPackData = {
    pack_id: mockPackId,
    pack_number: "PACK-001",
    status: "RECEIVED" as const, // RECEIVED packs can be deleted
    game: {
      game_id: "game-123",
      name: "Test Game",
    },
    bin: {
      bin_id: "bin-123",
      name: "Bin 1",
    },
  };

  // Test isolation: Clean up after each test
  beforeEach(() => {
    vi.clearAllMocks();
    (usePackDetails as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockPackData,
      isLoading: false,
      isError: false,
      error: null,
    });
    (useDeletePack as ReturnType<typeof vi.fn>).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    });
    mockMutateAsync.mockResolvedValue({
      success: true,
      message: "Pack deleted successfully",
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("6.10.1-COMPONENT-025: [P1] should render confirmation dialog with pack details (AC #6)", async () => {
    // GIVEN: DeleteLotteryDialog component with packId
    // WHEN: Component is rendered with open=true
    render(
      <DeleteLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        packId={mockPackId}
        onSuccess={mockOnSuccess}
      />,
    );

    // THEN: Dialog displays pack details
    await waitFor(
      () => {
        expect(
          screen.getByText("Delete Lottery Pack"),
          "Dialog title should be visible",
        ).toBeInTheDocument();
        expect(
          screen.getByText("PACK-001"),
          "Pack number should be displayed",
        ).toBeInTheDocument();
        expect(
          screen.getByText("Test Game"),
          "Game name should be displayed",
        ).toBeInTheDocument();
        expect(
          screen.getByText("Bin 1"),
          "Bin name should be displayed",
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it("6.10.1-COMPONENT-026: [P1] should display warning message (AC #6)", async () => {
    // GIVEN: DeleteLotteryDialog component
    // WHEN: Component is rendered
    render(
      <DeleteLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        packId={mockPackId}
        onSuccess={mockOnSuccess}
      />,
    );

    // THEN: Warning message is displayed
    await waitFor(
      () => {
        expect(
          screen.getByText(/this action cannot be undone/i),
          "Warning about permanent action should be displayed",
        ).toBeInTheDocument();
        expect(
          screen.getByText(/this action is permanent/i),
          "Warning about permanent deletion should be displayed",
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it("6.10.1-COMPONENT-027: [P1] should call API when Delete is confirmed (AC #6)", async () => {
    // GIVEN: DeleteLotteryDialog component
    const user = userEvent.setup();

    // WHEN: User clicks Delete Pack button
    render(
      <DeleteLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        packId={mockPackId}
        onSuccess={mockOnSuccess}
      />,
    );

    await waitFor(
      () => {
        expect(
          screen.getByTestId("confirm-delete-button"),
          "Delete button should be visible",
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    const deleteButton = screen.getByTestId("confirm-delete-button");
    await user.click(deleteButton);

    // THEN: API is called with pack ID
    await waitFor(
      () => {
        expect(
          mockMutateAsync,
          "API should be called with pack ID",
        ).toHaveBeenCalledWith(mockPackId);
      },
      { timeout: 3000 },
    );
  });

  it("6.10.1-COMPONENT-028: [P1] should close dialog when Cancel is clicked (AC #6)", async () => {
    // GIVEN: DeleteLotteryDialog component
    const user = userEvent.setup();

    // WHEN: User clicks Cancel button
    render(
      <DeleteLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        packId={mockPackId}
        onSuccess={mockOnSuccess}
      />,
    );

    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    await user.click(cancelButton);

    // THEN: onOpenChange is called with false
    expect(
      mockOnOpenChange,
      "onOpenChange should be called with false when Cancel is clicked",
    ).toHaveBeenCalledWith(false);
  });

  it("6.10.1-COMPONENT-029: [P1] should display loading state while deleting (AC #6)", async () => {
    // GIVEN: DeleteLotteryDialog component with pending deletion
    (useDeletePack as ReturnType<typeof vi.fn>).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: true,
    });

    // WHEN: Component is rendered
    render(
      <DeleteLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        packId={mockPackId}
        onSuccess={mockOnSuccess}
      />,
    );

    // THEN: Delete button shows loading state
    const deleteButton = screen.getByTestId("confirm-delete-button");
    expect(
      deleteButton,
      "Delete button should be disabled during deletion",
    ).toBeDisabled();
  });

  // ============ SECURITY TESTS (MANDATORY) ============

  it("6.10.1-COMPONENT-SEC-006: [P0] should prevent XSS in displayed pack data", async () => {
    // GIVEN: DeleteLotteryDialog component with pack containing XSS attempt
    const maliciousPackData = {
      ...mockPackData,
      pack_number: "<script>alert('XSS')</script>",
      game: {
        ...mockPackData.game,
        name: "<img src=x onerror=alert('XSS')>",
      },
    };

    (usePackDetails as ReturnType<typeof vi.fn>).mockReturnValue({
      data: maliciousPackData,
      isLoading: false,
      isError: false,
      error: null,
    });

    // WHEN: Component is rendered
    render(
      <DeleteLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        packId={mockPackId}
        onSuccess={mockOnSuccess}
      />,
    );

    // THEN: XSS attempts are escaped (React escapes by default)
    await waitFor(
      () => {
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
      },
      { timeout: 3000 },
    );
  });

  // ============ EDGE CASES ============

  it("6.10.1-COMPONENT-EDGE-012: [P2] should handle loading state while fetching pack details", async () => {
    // GIVEN: DeleteLotteryDialog component with loading state
    (usePackDetails as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });

    // WHEN: Component is rendered
    render(
      <DeleteLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        packId={mockPackId}
        onSuccess={mockOnSuccess}
      />,
    );

    // THEN: Loading state is displayed
    expect(
      screen.getByText(/loading pack details/i),
      "Loading message should be displayed",
    ).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-EDGE-013: [P2] should handle error state when pack details fail to load", async () => {
    // GIVEN: DeleteLotteryDialog component with error state
    (usePackDetails as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Failed to load pack details"),
    });

    // WHEN: Component is rendered
    render(
      <DeleteLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        packId={mockPackId}
        onSuccess={mockOnSuccess}
      />,
    );

    // THEN: Error message is displayed
    expect(
      screen.getByText(/failed to load pack details/i),
      "Error message should be displayed",
    ).toBeInTheDocument();
  });

  it("6.10.1-COMPONENT-EDGE-014: [P2] should handle API error and display error message", async () => {
    // GIVEN: DeleteLotteryDialog component with API error
    const user = userEvent.setup();

    mockMutateAsync.mockRejectedValue(
      new Error("Failed to delete pack: Pack is ACTIVE and cannot be deleted"),
    );

    render(
      <DeleteLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        packId={mockPackId}
        onSuccess={mockOnSuccess}
      />,
    );

    await waitFor(
      () => {
        expect(screen.getByTestId("confirm-delete-button")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // WHEN: User confirms deletion and API returns error
    const deleteButton = screen.getByTestId("confirm-delete-button");
    await user.click(deleteButton);

    // THEN: Error toast is displayed
    await waitFor(
      () => {
        expect(
          mockToast,
          "Toast should be called with error message",
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            variant: "destructive",
            title: "Error",
          }),
        );
      },
      { timeout: 3000 },
    );
  });

  it("6.10.1-COMPONENT-EDGE-015: [P2] should handle pack with null bin (no bin assigned)", async () => {
    // GIVEN: DeleteLotteryDialog component with pack that has no bin
    const packWithoutBin = {
      ...mockPackData,
      bin: null,
    };

    (usePackDetails as ReturnType<typeof vi.fn>).mockReturnValue({
      data: packWithoutBin,
      isLoading: false,
      isError: false,
      error: null,
    });

    // WHEN: Component is rendered
    render(
      <DeleteLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        packId={mockPackId}
        onSuccess={mockOnSuccess}
      />,
    );

    // THEN: Dialog displays "N/A" for bin
    await waitFor(
      () => {
        expect(
          screen.getByText(/N\/A/i),
          "N/A should be displayed for missing bin",
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });
});
