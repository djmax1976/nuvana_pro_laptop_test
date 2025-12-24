/**
 * @test-level COMPONENT
 * @justification Tests UI component behavior in isolation - fast, isolated, granular
 *
 * Component Tests: MarkSoldOutDialog
 *
 * Tests MarkSoldOutDialog component behavior for manual pack depletion:
 * - Dialog rendering and visibility
 * - Loading state while fetching pack details
 * - Error state when pack details fail to load
 * - Pack details display
 * - Confirmation button interactions
 * - Cancel button behavior
 * - Success/failure handling
 * - Accessibility attributes
 * - XSS prevention
 *
 * =============================================================================
 * TRACEABILITY MATRIX
 * =============================================================================
 *
 * | Test ID | Requirement | Type | Priority |
 * |---------|-------------|------|----------|
 * | MSD-001 | Dialog renders when open=true | UI | P0 |
 * | MSD-002 | Dialog hidden when open=false | UI | P0 |
 * | MSD-003 | Shows loading state while fetching pack | UI | P0 |
 * | MSD-004 | Shows error state on fetch failure | UI | P0 |
 * | MSD-005 | Displays pack details correctly | UI | P0 |
 * | MSD-006 | Shows warning about irreversible action | UI | P0 |
 * | MSD-007 | Confirm button calls mutation with packId and data | Interaction | P0 |
 * | MSD-008 | Cancel button closes dialog | Interaction | P0 |
 * | MSD-009 | onSuccess callback triggered on success | Interaction | P1 |
 * | MSD-010 | Shows error toast on mutation failure | Error Handling | P0 |
 * | MSD-011 | Disables buttons during processing | UI | P1 |
 * | MSD-012 | Prevents closing during processing | UI | P1 |
 * | MSD-013 | XSS prevention in pack details | Security | P0 |
 * | MSD-014 | Accessibility - aria labels and roles | A11Y | P1 |
 * | MSD-015 | Handles null packId gracefully | Edge Case | P1 |
 * | MSD-016 | Displays Unknown/N/A for missing pack details | UI | P1 |
 * | MSD-017 | Handles API response with success=false | Error Handling | P1 |
 * | MSD-018 | Error state dialog closes on Close button | Interaction | P1 |
 *
 * =============================================================================
 *
 * MCP Guidance Applied:
 * - TESTING: Component tests are fast, isolated, and granular
 * - SECURITY: XSS prevention tests for all user-generated fields
 * - API-001: VALIDATION - Mutation is called with packId and empty data object
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MarkSoldOutDialog } from "@/components/lottery/MarkSoldOutDialog";

// Mock the useLottery hooks
const mockUsePackDetails = vi.fn();
const mockUseMarkPackAsSoldOut = vi.fn();

vi.mock("@/hooks/useLottery", () => ({
  usePackDetails: (...args: any[]) => mockUsePackDetails(...args),
  useMarkPackAsSoldOut: () => mockUseMarkPackAsSoldOut(),
}));

// Mock the toast hook
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe("MarkSoldOutDialog Component", () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const mockPackData = {
    pack_id: "pack-001",
    pack_number: "1234567",
    serial_end: "050",
    status: "ACTIVE",
    game: { name: "Mega Millions" },
    bin: { name: "Bin 1" },
  };

  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    packId: "pack-001",
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockUsePackDetails.mockReturnValue({
      data: mockPackData,
      isLoading: false,
      isError: false,
      error: null,
    });

    mockUseMarkPackAsSoldOut.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ success: true }),
      isPending: false,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BASIC RENDERING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("MSD-001: [P0] should render dialog when open=true", () => {
    // GIVEN: Dialog is open
    // WHEN: Component is rendered
    render(<MarkSoldOutDialog {...defaultProps} />, { wrapper });

    // THEN: Dialog content is visible
    expect(screen.getByText("Mark Pack as Sold Out")).toBeInTheDocument();
    expect(screen.getByText(/Mark this pack as sold out/)).toBeInTheDocument();
  });

  it("MSD-002: [P0] should NOT render dialog when open=false", () => {
    // GIVEN: Dialog is closed
    // WHEN: Component is rendered
    render(<MarkSoldOutDialog {...defaultProps} open={false} />, { wrapper });

    // THEN: Dialog content is not visible
    expect(screen.queryByText("Mark Pack as Sold Out")).not.toBeInTheDocument();
  });

  it("MSD-003: [P0] should show loading state while fetching pack details", () => {
    // GIVEN: Pack details are loading
    mockUsePackDetails.mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
      error: null,
    });

    // WHEN: Component is rendered
    render(<MarkSoldOutDialog {...defaultProps} />, { wrapper });

    // THEN: Loading state is shown
    expect(screen.getByText("Loading pack details...")).toBeInTheDocument();
  });

  it("MSD-004: [P0] should show error state when pack fetch fails", () => {
    // GIVEN: Pack fetch failed
    mockUsePackDetails.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      error: new Error("Failed to load pack"),
    });

    // WHEN: Component is rendered
    render(<MarkSoldOutDialog {...defaultProps} />, { wrapper });

    // THEN: Error state is shown
    expect(screen.getByText("Failed to load pack details")).toBeInTheDocument();
    expect(screen.getByText("Failed to load pack")).toBeInTheDocument();
    expect(screen.getByText("Close")).toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PACK DETAILS DISPLAY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("MSD-005: [P0] should display pack details correctly", () => {
    // GIVEN: Pack data is available
    // WHEN: Component is rendered
    render(<MarkSoldOutDialog {...defaultProps} />, { wrapper });

    // THEN: Pack details are displayed
    expect(screen.getByText("1234567")).toBeInTheDocument(); // Pack number
    expect(screen.getByText("Mega Millions")).toBeInTheDocument(); // Game name
    expect(screen.getByText("Bin 1")).toBeInTheDocument(); // Bin name
    expect(screen.getByText("050")).toBeInTheDocument(); // Serial end
    expect(screen.getByText("ACTIVE")).toBeInTheDocument(); // Status
  });

  it("MSD-006: [P0] should show warning about irreversible action", () => {
    // GIVEN: Dialog is open
    // WHEN: Component is rendered
    render(<MarkSoldOutDialog {...defaultProps} />, { wrapper });

    // THEN: Warning is displayed
    expect(
      screen.getByText("This action cannot be undone"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The pack will be marked as depleted/),
    ).toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERACTION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("MSD-007: [P0] should call mutation when confirm button is clicked", async () => {
    // GIVEN: Dialog with pack data
    const mockMutateAsync = vi.fn().mockResolvedValue({ success: true });
    mockUseMarkPackAsSoldOut.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    });

    render(<MarkSoldOutDialog {...defaultProps} />, { wrapper });

    // WHEN: Confirm button is clicked
    const confirmButton = screen.getByTestId("confirm-mark-sold-button");
    fireEvent.click(confirmButton);

    // THEN: Mutation is called with packId and empty data object
    // MCP Guidance: API-001 - Always send valid JSON body for POST requests
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        packId: "pack-001",
        data: {},
      });
    });
  });

  it("MSD-008: [P0] should close dialog when cancel button is clicked", () => {
    // GIVEN: Dialog is open
    const onOpenChange = vi.fn();
    render(
      <MarkSoldOutDialog {...defaultProps} onOpenChange={onOpenChange} />,
      { wrapper },
    );

    // WHEN: Cancel button is clicked
    const cancelButton = screen.getByText("Cancel");
    fireEvent.click(cancelButton);

    // THEN: onOpenChange is called with false
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("MSD-009: [P1] should call onSuccess callback after successful mutation", async () => {
    // GIVEN: Mutation will succeed
    const mockMutateAsync = vi.fn().mockResolvedValue({ success: true });
    mockUseMarkPackAsSoldOut.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    });

    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <MarkSoldOutDialog
        {...defaultProps}
        onSuccess={onSuccess}
        onOpenChange={onOpenChange}
      />,
      { wrapper },
    );

    // WHEN: Confirm button is clicked
    fireEvent.click(screen.getByTestId("confirm-mark-sold-button"));

    // THEN: onSuccess is called
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });

    // AND: Dialog is closed
    expect(onOpenChange).toHaveBeenCalledWith(false);

    // AND: Success toast is shown
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Pack marked as sold out",
      }),
    );
  });

  it("MSD-010: [P0] should show error toast on mutation failure", async () => {
    // GIVEN: Mutation will fail
    const mockMutateAsync = vi
      .fn()
      .mockRejectedValue(new Error("Network error"));
    mockUseMarkPackAsSoldOut.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    });

    render(<MarkSoldOutDialog {...defaultProps} />, { wrapper });

    // WHEN: Confirm button is clicked
    fireEvent.click(screen.getByTestId("confirm-mark-sold-button"));

    // THEN: Error toast is shown
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Error",
          description: "Network error",
          variant: "destructive",
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PROCESSING STATE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("MSD-011: [P1] should disable buttons during processing", () => {
    // GIVEN: Mutation is pending
    mockUseMarkPackAsSoldOut.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
    });

    // WHEN: Component is rendered
    render(<MarkSoldOutDialog {...defaultProps} />, { wrapper });

    // THEN: Buttons are disabled
    expect(screen.getByTestId("confirm-mark-sold-button")).toBeDisabled();
    expect(screen.getByText("Cancel")).toBeDisabled();
  });

  it("MSD-012: [P1] should prevent closing during processing", () => {
    // GIVEN: Mutation is pending
    mockUseMarkPackAsSoldOut.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
    });

    const onOpenChange = vi.fn();
    render(
      <MarkSoldOutDialog {...defaultProps} onOpenChange={onOpenChange} />,
      { wrapper },
    );

    // WHEN: Cancel button is clicked
    const cancelButton = screen.getByText("Cancel");
    fireEvent.click(cancelButton);

    // THEN: onOpenChange is NOT called (button is disabled)
    // Note: The disabled button prevents the click from doing anything
    expect(cancelButton).toBeDisabled();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("MSD-013: [P0] [SECURITY] should prevent XSS in pack details", () => {
    // GIVEN: Pack data with XSS payloads
    const xssPackData = {
      pack_id: "pack-xss",
      pack_number: "<script>alert('xss')</script>",
      serial_end: "<img src=x onerror=alert('xss')>",
      status: "ACTIVE",
      game: { name: "<svg onload=alert('xss')>" },
      bin: { name: "javascript:alert('xss')" },
    };

    mockUsePackDetails.mockReturnValue({
      data: xssPackData,
      isLoading: false,
      isError: false,
      error: null,
    });

    // WHEN: Component is rendered
    render(<MarkSoldOutDialog {...defaultProps} />, { wrapper });

    // THEN: XSS payloads are rendered as text (escaped)
    expect(
      screen.getByText("<script>alert('xss')</script>"),
    ).toBeInTheDocument();
    expect(screen.getByText("<svg onload=alert('xss')>")).toBeInTheDocument();

    // Verify no script elements were created
    expect(document.querySelector("script")).toBeNull();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCESSIBILITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("MSD-014: [P1] [A11Y] should have proper accessibility attributes", () => {
    // GIVEN: Dialog is open
    // WHEN: Component is rendered
    render(<MarkSoldOutDialog {...defaultProps} />, { wrapper });

    // THEN: Warning has role="alert" and aria-live
    const warning = screen
      .getByText("This action cannot be undone")
      .closest('div[role="alert"]');
    expect(warning).toBeInTheDocument();
    expect(warning).toHaveAttribute("aria-live", "polite");

    // AND: Confirm button has aria-label
    const confirmButton = screen.getByTestId("confirm-mark-sold-button");
    expect(confirmButton).toHaveAttribute(
      "aria-label",
      "Mark pack 1234567 as sold out",
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("MSD-015: [P1] should handle null packId gracefully", async () => {
    // GIVEN: Dialog with null packId
    mockUsePackDetails.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<MarkSoldOutDialog {...defaultProps} packId={null} />, { wrapper });

    // WHEN: Confirm button is clicked
    const confirmButton = screen.getByTestId("confirm-mark-sold-button");
    fireEvent.click(confirmButton);

    // THEN: Error toast is shown
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Error",
          description: "Pack ID is required",
          variant: "destructive",
        }),
      );
    });
  });

  it("MSD-016: [P1] should display 'Unknown' for missing pack details", () => {
    // GIVEN: Pack data with missing fields
    mockUsePackDetails.mockReturnValue({
      data: { pack_id: "pack-001" }, // Minimal data
      isLoading: false,
      isError: false,
      error: null,
    });

    // WHEN: Component is rendered
    render(<MarkSoldOutDialog {...defaultProps} />, { wrapper });

    // THEN: Unknown/N/A placeholders are shown
    expect(screen.getByText("Unknown")).toBeInTheDocument(); // Pack number or game
    expect(screen.getByText("N/A")).toBeInTheDocument(); // Bin or serial
  });

  it("MSD-017: [P1] should handle API response with success=false", async () => {
    // GIVEN: Mutation returns success=false
    const mockMutateAsync = vi.fn().mockResolvedValue({
      success: false,
      message: "Pack is already depleted",
    });
    mockUseMarkPackAsSoldOut.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    });

    render(<MarkSoldOutDialog {...defaultProps} />, { wrapper });

    // WHEN: Confirm button is clicked
    fireEvent.click(screen.getByTestId("confirm-mark-sold-button"));

    // THEN: Error toast is shown with API message
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Error",
          description: "Pack is already depleted",
          variant: "destructive",
        }),
      );
    });
  });

  it("MSD-018: [P1] should close error state dialog when Close button is clicked", () => {
    // GIVEN: Error state
    mockUsePackDetails.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      error: new Error("Network error"),
    });

    const onOpenChange = vi.fn();
    render(
      <MarkSoldOutDialog {...defaultProps} onOpenChange={onOpenChange} />,
      { wrapper },
    );

    // WHEN: Close button is clicked
    const closeButton = screen.getByText("Close");
    fireEvent.click(closeButton);

    // THEN: onOpenChange is called with false
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
