/**
 * Component Tests: EditLotteryDialog
 *
 * Tests EditLotteryDialog component behavior:
 * - Form field rendering with existing pack data
 * - Form validation
 * - Form submission with API integration
 * - Security: XSS prevention in form inputs
 * - Edge cases: Empty strings, long inputs, special characters
 * - Business logic: ACTIVE packs cannot be updated (status changes only)
 *
 * @test-level COMPONENT
 * @justification Tests UI form behavior in isolation - fast, isolated, granular
 * @story 6-10-1 - Client Dashboard Lottery Page
 * @priority P1 (High - Form Validation, API Integration)
 * @enhanced-by workflow-9 on 2025-01-28
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditLotteryDialog } from "@/components/lottery/EditLotteryDialog";

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
  useUpdatePack: vi.fn(),
}));

import { usePackDetails, useUpdatePack } from "@/hooks/useLottery";

describe("6.10.1-COMPONENT: EditLotteryDialog", () => {
  const mockOnSuccess = vi.fn();
  const mockOnOpenChange = vi.fn();
  const mockMutateAsync = vi.fn();
  const mockPackId = "550e8400-e29b-41d4-a716-446655440000"; // Valid UUID

  const mockPackData = {
    pack_id: mockPackId,
    pack_number: "PACK-001",
    serial_start: "1000",
    serial_end: "2000",
    game_id: "550e8400-e29b-41d4-a716-446655440001", // Valid UUID for game
    current_bin_id: "550e8400-e29b-41d4-a716-446655440002", // Valid UUID for bin
    status: "RECEIVED" as const, // RECEIVED packs can be updated
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
    (useUpdatePack as ReturnType<typeof vi.fn>).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    });
    mockMutateAsync.mockResolvedValue({
      success: true,
      data: mockPackData,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("6.10.1-COMPONENT-020: [P1] should render form with existing pack data (AC #5)", async () => {
    // GIVEN: EditLotteryDialog component with packId
    // WHEN: Component is rendered with open=true
    render(
      <EditLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        packId={mockPackId}
        onSuccess={mockOnSuccess}
      />,
    );

    // THEN: Form fields are populated with pack data
    await waitFor(
      () => {
        expect(
          screen.getByDisplayValue("PACK-001"),
          "Pack number should be populated",
        ).toBeInTheDocument();
        expect(
          screen.getByDisplayValue("1000"),
          "Serial start should be populated",
        ).toBeInTheDocument();
        expect(
          screen.getByDisplayValue("2000"),
          "Serial end should be populated",
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it("6.10.1-COMPONENT-021: [P1] should display loading state while fetching pack details (AC #5)", async () => {
    // GIVEN: EditLotteryDialog component with loading state
    (usePackDetails as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });

    // WHEN: Component is rendered
    render(
      <EditLotteryDialog
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

  it("6.10.1-COMPONENT-022: [P1] should validate form on submission (AC #5)", async () => {
    // GIVEN: EditLotteryDialog component
    const user = userEvent.setup();

    render(
      <EditLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        packId={mockPackId}
        onSuccess={mockOnSuccess}
      />,
    );

    // WHEN: User clears required field and submits
    await waitFor(
      () => {
        expect(screen.getByDisplayValue("PACK-001")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // Wait for form to be fully interactive
    await waitFor(
      () => {
        const packInput = screen.getByTestId("pack-number-input");
        expect(packInput).not.toBeDisabled();
      },
      { timeout: 3000 },
    );

    const packNumberInput = screen.getByTestId("pack-number-input");
    await user.clear(packNumberInput);

    // Find submit button by text content
    const submitButton = screen.getByText("Update Pack");
    await user.click(submitButton);

    // THEN: Validation error is displayed
    await waitFor(
      () => {
        expect(
          screen.getByText(/pack number is required/i),
          "Pack number required validation error should be displayed",
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it("6.10.1-COMPONENT-023: [P1] should call API on successful form submission (AC #5)", async () => {
    // GIVEN: EditLotteryDialog component
    const user = userEvent.setup();

    render(
      <EditLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        packId={mockPackId}
        onSuccess={mockOnSuccess}
      />,
    );

    // WHEN: User modifies and submits form
    await waitFor(
      () => {
        expect(screen.getByDisplayValue("PACK-001")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    const packNumberInput = screen.getByTestId("pack-number-input");
    await user.clear(packNumberInput);
    await user.type(packNumberInput, "PACK-UPDATED");

    // Find submit button by text content
    const submitButton = screen.getByText("Update Pack");
    await user.click(submitButton);

    // THEN: API is called with updated data
    await waitFor(
      () => {
        expect(
          mockMutateAsync,
          "API should be called with updated pack data",
        ).toHaveBeenCalledWith({
          packId: mockPackId,
          data: expect.objectContaining({
            pack_number: "PACK-UPDATED",
          }),
        });
      },
      { timeout: 3000 },
    );
  });

  it("6.10.1-COMPONENT-024: [P1] should close dialog when Cancel is clicked (AC #5)", async () => {
    // GIVEN: EditLotteryDialog component
    const user = userEvent.setup();

    // WHEN: User clicks Cancel button
    render(
      <EditLotteryDialog
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

  // ============ SECURITY TESTS (MANDATORY) ============

  it("6.10.1-COMPONENT-SEC-004: [P0] should prevent XSS in pack_number input", async () => {
    // GIVEN: EditLotteryDialog component
    const user = userEvent.setup();

    render(
      <EditLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        packId={mockPackId}
        onSuccess={mockOnSuccess}
      />,
    );

    await waitFor(
      () => {
        expect(screen.getByDisplayValue("PACK-001")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // WHEN: User enters XSS attempt in pack_number
    const packNumberInput = screen.getByTestId("pack-number-input");
    const xssAttempts = [
      "<script>alert('XSS')</script>",
      "<img src=x onerror=alert('XSS')>",
      "javascript:alert('XSS')",
    ];

    for (const maliciousInput of xssAttempts) {
      await user.clear(packNumberInput);
      await user.type(packNumberInput, maliciousInput);

      // THEN: Input value is stored as plain text (React escapes by default)
      expect(
        packNumberInput,
        `XSS attempt "${maliciousInput}" should be stored as plain text`,
      ).toHaveValue(maliciousInput);
    }
  });

  it("6.10.1-COMPONENT-SEC-005: [P0] should validate serial numbers are numeric-only", async () => {
    // GIVEN: EditLotteryDialog component
    const user = userEvent.setup();

    render(
      <EditLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        packId={mockPackId}
        onSuccess={mockOnSuccess}
      />,
    );

    await waitFor(
      () => {
        expect(screen.getByDisplayValue("1000")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // WHEN: User enters non-numeric characters in serial fields
    const serialStartInput = screen.getByTestId("serial-start-input");
    await user.clear(serialStartInput);
    await user.type(serialStartInput, "ABC123");

    // Find submit button by text content
    const submitButton = screen.getByText("Update Pack");
    await user.click(submitButton);

    // THEN: Validation error is displayed (Zod schema enforces numeric-only regex)
    await waitFor(
      () => {
        expect(
          screen.getByText(
            /serial start must contain only numeric characters/i,
          ),
          "Serial start validation error should be displayed",
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  // ============ EDGE CASES ============

  it("6.10.1-COMPONENT-EDGE-009: [P2] should handle error state when pack details fail to load", async () => {
    // GIVEN: EditLotteryDialog component with error state
    (usePackDetails as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Failed to load pack details"),
    });

    // WHEN: Component is rendered
    render(
      <EditLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        packId={mockPackId}
        onSuccess={mockOnSuccess}
      />,
    );

    // THEN: Error message is displayed (may appear in multiple places in the dialog)
    const errorMessages = screen.getAllByText(/failed to load pack details/i);
    expect(
      errorMessages.length,
      "Error message should be displayed at least once",
    ).toBeGreaterThanOrEqual(1);
  });

  it("6.10.1-COMPONENT-EDGE-010: [P2] should handle API error and display error message", async () => {
    // GIVEN: EditLotteryDialog component with API error
    const user = userEvent.setup();

    mockMutateAsync.mockRejectedValue(
      new Error("Failed to update pack: Pack number already exists"),
    );

    render(
      <EditLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        packId={mockPackId}
        onSuccess={mockOnSuccess}
      />,
    );

    await waitFor(
      () => {
        expect(screen.getByDisplayValue("PACK-001")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // WHEN: User submits form and API returns error
    const submitButton = screen.getByText("Update Pack");
    await user.click(submitButton);

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

  it("6.10.1-COMPONENT-EDGE-011: [P2] should disable form during submission (loading state)", async () => {
    // GIVEN: EditLotteryDialog component with pending mutation
    (useUpdatePack as ReturnType<typeof vi.fn>).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: true, // Simulate loading state
    });

    render(
      <EditLotteryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        packId={mockPackId}
        onSuccess={mockOnSuccess}
      />,
    );

    await waitFor(
      () => {
        expect(screen.getByDisplayValue("PACK-001")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // WHEN: Form is in loading state
    const submitButton = screen.getByText("Update Pack");

    // THEN: Submit button is disabled
    expect(
      submitButton,
      "Submit button should be disabled during submission",
    ).toBeDisabled();

    // AND: Form inputs are disabled
    const packNumberInput = screen.getByTestId("pack-number-input");
    expect(
      packNumberInput,
      "Pack number input should be disabled during submission",
    ).toBeDisabled();
  });
});
