/**
 * Component Tests: VarianceApprovalDialog
 *
 * Tests VarianceApprovalDialog component behavior:
 * - Opens dialog with variance details
 * - Displays reason input field
 * - Submits approval with reason
 * - Shows success/error messages
 * - Refreshes variance alerts after approval
 *
 * @test-level COMPONENT
 * @justification Tests UI dialog behavior in isolation - fast, isolated, granular
 * @story 6-10 - Lottery Management UI
 * @priority P1 (High - Variance Approval)
 *
 * RED PHASE: These tests define expected behavior before implementation.
 * Tests will fail until component is implemented.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VarianceApprovalDialog } from "@/components/lottery/VarianceApprovalDialog";

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

// Mock toast hook
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe("6.10-COMPONENT: VarianceApprovalDialog", () => {
  const mockVariance = {
    variance_id: "v1",
    shift_id: "shift1",
    pack_id: "pack1",
    expected_count: 100,
    actual_count: 95,
    difference: -5,
    approved_at: null,
    pack: {
      pack_number: "PACK-001",
      game: { name: "Game 1" },
    },
    shift: {
      shift_id: "shift1",
      opened_at: "2024-01-01T10:00:00Z",
    },
  };

  const mockOnSuccess = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("6.10-COMPONENT-050: [P1] should display variance details in dialog (AC #6)", async () => {
    // GIVEN: VarianceApprovalDialog component with variance
    // WHEN: Dialog is opened
    render(
      <VarianceApprovalDialog
        variance={mockVariance}
        isOpen={true}
        onSuccess={mockOnSuccess}
        onClose={mockOnClose}
      />,
    );

    // THEN: Variance details are displayed
    expect(screen.getByText(/100|expected/i)).toBeInTheDocument();
    expect(screen.getByText(/95|actual/i)).toBeInTheDocument();
    expect(screen.getByText(/-5|difference/i)).toBeInTheDocument();
    expect(screen.getByText("PACK-001")).toBeInTheDocument();
  });

  it("6.10-COMPONENT-051: [P1] should display reason input field (AC #6)", async () => {
    // GIVEN: VarianceApprovalDialog component
    // WHEN: Dialog is opened
    render(
      <VarianceApprovalDialog
        variance={mockVariance}
        isOpen={true}
        onSuccess={mockOnSuccess}
        onClose={mockOnClose}
      />,
    );

    // THEN: Reason input field is displayed
    expect(screen.getByLabelText(/reason/i)).toBeInTheDocument();
  });

  it("6.10-COMPONENT-052: [P1] should require reason input (AC #6)", async () => {
    // GIVEN: VarianceApprovalDialog component
    const user = userEvent.setup();
    render(
      <VarianceApprovalDialog
        variance={mockVariance}
        isOpen={true}
        onSuccess={mockOnSuccess}
        onClose={mockOnClose}
      />,
    );

    // WHEN: User submits without entering reason
    const submitButton = screen.getByRole("button", {
      name: /approve|submit/i,
    });
    await user.click(submitButton);

    // THEN: Validation error is displayed
    await waitFor(() => {
      expect(screen.getByText(/reason.*required/i)).toBeInTheDocument();
    });
  });

  it("6.10-COMPONENT-053: [P1] should submit approval with reason (AC #6)", async () => {
    // GIVEN: VarianceApprovalDialog component with onApprove handler
    const user = userEvent.setup();
    const mockOnApprove = vi.fn().mockResolvedValue(undefined);

    render(
      <VarianceApprovalDialog
        variance={mockVariance}
        isOpen={true}
        onSuccess={mockOnSuccess}
        onClose={mockOnClose}
        onApprove={mockOnApprove}
      />,
    );

    // WHEN: User enters reason and submits
    const reasonInput = screen.getByLabelText(/reason/i);
    await user.type(reasonInput, "Test reason");
    const submitButton = screen.getByRole("button", {
      name: /approve|submit/i,
    });
    await user.click(submitButton);

    // THEN: onApprove handler is called with variance ID and reason
    await waitFor(() => {
      expect(mockOnApprove).toHaveBeenCalledWith(
        mockVariance.variance_id,
        "Test reason",
      );
    });
  });

  it("6.10-COMPONENT-054: [P1] should display success message after approval (AC #6)", async () => {
    // GIVEN: VarianceApprovalDialog component with successful approval
    const user = userEvent.setup();
    const mockOnApprove = vi.fn().mockResolvedValue(undefined);

    render(
      <VarianceApprovalDialog
        variance={mockVariance}
        isOpen={true}
        onSuccess={mockOnSuccess}
        onClose={mockOnClose}
        onApprove={mockOnApprove}
      />,
    );

    // WHEN: User approves variance
    const reasonInput = screen.getByLabelText(/reason/i);
    await user.type(reasonInput, "Test reason");
    const submitButton = screen.getByRole("button", {
      name: /approve|submit/i,
    });
    await user.click(submitButton);

    // THEN: Success message is displayed (via toast, which is mocked)
    await waitFor(() => {
      expect(mockOnApprove).toHaveBeenCalled();
    });
    // Dialog should close on success
    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it("6.10-COMPONENT-055: [P1] should refresh variance alerts after approval (AC #6)", async () => {
    // GIVEN: VarianceApprovalDialog component with successful approval
    const user = userEvent.setup();
    const mockOnApprove = vi.fn().mockResolvedValue(undefined);

    render(
      <VarianceApprovalDialog
        variance={mockVariance}
        isOpen={true}
        onSuccess={mockOnSuccess}
        onClose={mockOnClose}
        onApprove={mockOnApprove}
      />,
    );

    // WHEN: User approves variance
    const reasonInput = screen.getByLabelText(/reason/i);
    await user.type(reasonInput, "Test reason");
    const submitButton = screen.getByRole("button", {
      name: /approve|submit/i,
    });
    await user.click(submitButton);

    // THEN: onSuccess callback is called (triggers alert refresh)
    await waitFor(() => {
      expect(mockOnApprove).toHaveBeenCalled();
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });

  it("6.10-COMPONENT-056: [P1] should display error message on approval failure (AC #6)", async () => {
    // GIVEN: VarianceApprovalDialog component with approval failure
    const user = userEvent.setup();
    const mockOnApprove = vi
      .fn()
      .mockRejectedValue(new Error("Approval failed"));

    render(
      <VarianceApprovalDialog
        variance={mockVariance}
        isOpen={true}
        onSuccess={mockOnSuccess}
        onClose={mockOnClose}
        onApprove={mockOnApprove}
      />,
    );

    // WHEN: User approves variance
    const reasonInput = screen.getByLabelText(/reason/i);
    await user.type(reasonInput, "Test reason");
    const submitButton = screen.getByRole("button", {
      name: /approve|submit/i,
    });
    await user.click(submitButton);

    // THEN: Error is handled (toast is mocked, but error state should be set)
    await waitFor(() => {
      expect(mockOnApprove).toHaveBeenCalled();
    });
    // Dialog should remain open on error
    expect(mockOnClose).not.toHaveBeenCalled();
  });
});
