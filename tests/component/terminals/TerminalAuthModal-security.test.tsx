/**
 * @test-level Component
 * @justification Security tests for TerminalAuthModal - validates shift ownership verification
 * @story 4-9-mystore-terminal-dashboard
 *
 * CRITICAL SECURITY TESTS:
 * These tests ensure that cashiers can only access their own shifts.
 * A cashier should NOT be able to access another cashier's active shift.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../support/test-utils";
import { TerminalAuthModal } from "@/components/terminals/TerminalAuthModal";
import userEvent from "@testing-library/user-event";
import * as cashiersApi from "@/lib/api/cashiers";
import * as shiftsApi from "@/lib/api/shifts";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock the cashiers API hooks
vi.mock("@/lib/api/cashiers", () => ({
  useCashiers: vi.fn(),
  useAuthenticateCashier: vi.fn(),
}));

// Mock the shifts API hooks
vi.mock("@/lib/api/shifts", () => ({
  useActiveShift: vi.fn(),
  useShiftStart: vi.fn(),
}));

describe("4.9-SECURITY: TerminalAuthModal Shift Ownership Verification", () => {
  const mockTerminalId = "550e8400-e29b-41d4-a716-446655440011";
  const mockStoreId = "550e8400-e29b-41d4-a716-446655440022";
  const mockTerminalName = "Terminal 1";
  const mockOnOpenChange = vi.fn();

  // Cashier A owns the active shift
  const cashierA = {
    cashier_id: "cashier-a-id",
    name: "Cashier A",
    is_active: true,
  };

  // Cashier B is a different cashier who should NOT be able to access A's shift
  const cashierB = {
    cashier_id: "cashier-b-id",
    name: "Cashier B",
    is_active: true,
  };

  // Active shift owned by Cashier A
  const activeShiftOwnedByCashierA = {
    shift_id: "shift-123",
    store_id: mockStoreId,
    cashier_id: cashierA.cashier_id,
    cashier_name: cashierA.name,
    pos_terminal_id: mockTerminalId,
    status: "OPEN",
    opened_at: new Date().toISOString(),
    opening_cash: 100,
    shift_number: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: No cashiers loaded (for resume mode, we don't need the list)
    vi.mocked(cashiersApi.useCashiers).mockReturnValue({
      data: [cashierA, cashierB],
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    } as any);

    // Default mock for useAuthenticateCashier
    vi.mocked(cashiersApi.useAuthenticateCashier).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({
        cashier_id: cashierA.cashier_id,
        session: {
          session_id: "session-123",
          session_token: "token-abc",
          expires_at: new Date(Date.now() + 3600000).toISOString(),
        },
      }),
      isPending: false,
      isError: false,
      error: null,
      reset: vi.fn(),
    } as any);

    // Default mock for useShiftStart
    vi.mocked(shiftsApi.useShiftStart).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ shift_id: "shift-1" }),
      isPending: false,
      isError: false,
      error: null,
      reset: vi.fn(),
    } as any);
  });

  describe("Resume Shift Mode - PIN Only UI", () => {
    beforeEach(() => {
      // Set up active shift scenario
      vi.mocked(shiftsApi.useActiveShift).mockReturnValue({
        data: activeShiftOwnedByCashierA,
        isLoading: false,
        error: null,
        isError: false,
      } as any);
    });

    it("[P0] SECURITY-001: should display PIN-only form when terminal has active shift", async () => {
      // GIVEN: Terminal has an active shift owned by Cashier A
      renderWithProviders(
        <TerminalAuthModal
          terminalId={mockTerminalId}
          storeId={mockStoreId}
          terminalName={mockTerminalName}
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
      );

      // THEN: Should show the shift owner's name (read-only, not a dropdown)
      await waitFor(() => {
        expect(screen.getByTestId("shift-owner-display")).toBeInTheDocument();
        expect(screen.getByTestId("shift-owner-name")).toHaveTextContent(
          cashierA.name,
        );
      });

      // AND: Should NOT show the cashier dropdown (since we're in resume mode)
      expect(
        screen.queryByTestId("cashier-name-select"),
      ).not.toBeInTheDocument();

      // AND: Should show PIN input
      expect(screen.getByTestId("pin-number-input")).toBeInTheDocument();

      // AND: Submit button should say "Resume Shift"
      expect(
        screen.getByTestId("terminal-auth-submit-button"),
      ).toHaveTextContent("Resume Shift");
    });

    it("[P0] SECURITY-002: should display helpful message about resuming shift", async () => {
      renderWithProviders(
        <TerminalAuthModal
          terminalId={mockTerminalId}
          storeId={mockStoreId}
          terminalName={mockTerminalName}
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByText(/this terminal has an active shift/i),
        ).toBeInTheDocument();
        expect(
          screen.getByText(/enter your pin to resume/i),
        ).toBeInTheDocument();
      });
    });

    it("[P0] SECURITY-010: PIN input field should accept user input in resume mode", async () => {
      // GIVEN: Terminal has an active shift
      const user = userEvent.setup();
      renderWithProviders(
        <TerminalAuthModal
          terminalId={mockTerminalId}
          storeId={mockStoreId}
          terminalName={mockTerminalName}
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
      );

      // Wait for resume mode to be active
      await waitFor(() => {
        expect(screen.getByTestId("shift-owner-display")).toBeInTheDocument();
      });

      // WHEN: User types in the PIN input
      const pinInput = screen.getByTestId("pin-number-input");

      // Verify input is not disabled
      expect(pinInput).not.toBeDisabled();

      // Type into the input
      await user.type(pinInput, "1234");

      // THEN: The input should contain the typed value
      expect(pinInput).toHaveValue("1234");
    });

    it("[P0] SECURITY-011: PIN input should be enabled and focusable in resume mode", async () => {
      renderWithProviders(
        <TerminalAuthModal
          terminalId={mockTerminalId}
          storeId={mockStoreId}
          terminalName={mockTerminalName}
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("shift-owner-display")).toBeInTheDocument();
      });

      const pinInput = screen.getByTestId("pin-number-input");

      // Check input properties
      expect(pinInput).not.toBeDisabled();
      expect(pinInput).toHaveAttribute("type", "password");
      expect(pinInput.tagName.toLowerCase()).toBe("input");
    });
  });

  describe("Shift Ownership Verification", () => {
    beforeEach(() => {
      // Set up active shift scenario
      vi.mocked(shiftsApi.useActiveShift).mockReturnValue({
        data: activeShiftOwnedByCashierA,
        isLoading: false,
        error: null,
        isError: false,
      } as any);
    });

    it("[P0] SECURITY-003: should ALLOW access when correct cashier enters valid PIN", async () => {
      // GIVEN: Cashier A's credentials authenticate successfully
      const mockMutateAsync = vi.fn().mockResolvedValue({
        cashier_id: cashierA.cashier_id, // Same as shift owner
        session: {
          session_id: "session-123",
          session_token: "token-abc",
          expires_at: new Date(Date.now() + 3600000).toISOString(),
        },
      });

      vi.mocked(cashiersApi.useAuthenticateCashier).mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        isError: false,
        error: null,
        reset: vi.fn(),
      } as any);

      const user = userEvent.setup();
      renderWithProviders(
        <TerminalAuthModal
          terminalId={mockTerminalId}
          storeId={mockStoreId}
          terminalName={mockTerminalName}
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
      );

      // Wait for resume mode to be active
      await waitFor(() => {
        expect(screen.getByTestId("shift-owner-display")).toBeInTheDocument();
      });

      // WHEN: Cashier A enters their PIN
      const pinInput = screen.getByTestId("pin-number-input");
      await user.type(pinInput, "1234");

      const submitButton = screen.getByTestId("terminal-auth-submit-button");
      await user.click(submitButton);

      // THEN: Authentication should be called with the shift owner's name
      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          storeId: mockStoreId,
          identifier: { name: cashierA.name },
          pin: "1234",
          terminalId: mockTerminalId,
        });
      });

      // AND: Should navigate to shift page (access granted)
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          `/terminal/${mockTerminalId}/shift`,
        );
      });

      // AND: Modal should close
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it("[P0] SECURITY-004: should DENY access when wrong PIN is entered", async () => {
      // GIVEN: Authentication fails (wrong PIN)
      const mockMutateAsync = vi
        .fn()
        .mockRejectedValue(new Error("Authentication failed"));

      vi.mocked(cashiersApi.useAuthenticateCashier).mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        isError: true,
        error: new Error("Authentication failed"),
        reset: vi.fn(),
      } as any);

      const user = userEvent.setup();
      renderWithProviders(
        <TerminalAuthModal
          terminalId={mockTerminalId}
          storeId={mockStoreId}
          terminalName={mockTerminalName}
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("shift-owner-display")).toBeInTheDocument();
      });

      // WHEN: Wrong PIN is entered
      const pinInput = screen.getByTestId("pin-number-input");
      await user.type(pinInput, "9999");

      const submitButton = screen.getByTestId("terminal-auth-submit-button");
      await user.click(submitButton);

      // THEN: Should show error message
      await waitFor(() => {
        expect(screen.getByText(/invalid pin/i)).toBeInTheDocument();
      });

      // AND: Should NOT navigate
      expect(mockPush).not.toHaveBeenCalled();

      // AND: Modal should remain open
      expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);
    });

    it("[P0] SECURITY-005: should DENY access when different cashier's ID is returned (ownership mismatch)", async () => {
      // GIVEN: Authentication succeeds but returns DIFFERENT cashier ID
      // This simulates the bug where Cashier B could authenticate and access Cashier A's shift
      const mockMutateAsync = vi.fn().mockResolvedValue({
        cashier_id: cashierB.cashier_id, // DIFFERENT from shift owner
        session: {
          session_id: "session-456",
          session_token: "token-xyz",
          expires_at: new Date(Date.now() + 3600000).toISOString(),
        },
      });

      vi.mocked(cashiersApi.useAuthenticateCashier).mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        isError: false,
        error: null,
        reset: vi.fn(),
      } as any);

      const user = userEvent.setup();
      renderWithProviders(
        <TerminalAuthModal
          terminalId={mockTerminalId}
          storeId={mockStoreId}
          terminalName={mockTerminalName}
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("shift-owner-display")).toBeInTheDocument();
      });

      // WHEN: Someone enters a PIN (possibly Cashier B somehow)
      const pinInput = screen.getByTestId("pin-number-input");
      await user.type(pinInput, "1234");

      const submitButton = screen.getByTestId("terminal-auth-submit-button");
      await user.click(submitButton);

      // THEN: Should show ownership error
      await waitFor(() => {
        expect(screen.getByTestId("ownership-error")).toBeInTheDocument();
        expect(
          screen.getByText(/only the cashier who started this shift/i),
        ).toBeInTheDocument();
      });

      // AND: Should NOT navigate (access denied)
      expect(mockPush).not.toHaveBeenCalled();

      // AND: Modal should remain open
      expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);
    });
  });

  describe("New Shift Mode (No Active Shift)", () => {
    beforeEach(() => {
      // No active shift on terminal
      vi.mocked(shiftsApi.useActiveShift).mockReturnValue({
        data: null,
        isLoading: false,
        error: null,
        isError: false,
      } as any);
    });

    it("[P1] SECURITY-006: should show full form with cashier dropdown when no active shift", async () => {
      renderWithProviders(
        <TerminalAuthModal
          terminalId={mockTerminalId}
          storeId={mockStoreId}
          terminalName={mockTerminalName}
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
      );

      // THEN: Should show cashier dropdown
      await waitFor(() => {
        expect(screen.getByTestId("cashier-name-select")).toBeInTheDocument();
      });

      // AND: Should NOT show shift owner display
      expect(
        screen.queryByTestId("shift-owner-display"),
      ).not.toBeInTheDocument();

      // AND: Submit button should say "Start Shift"
      expect(
        screen.getByTestId("terminal-auth-submit-button"),
      ).toHaveTextContent("Start Shift");
    });

    it("[P1] SECURITY-007: should allow any cashier to start a new shift", async () => {
      const mockAuthMutateAsync = vi.fn().mockResolvedValue({
        cashier_id: cashierB.cashier_id,
        session: {
          session_id: "session-789",
          session_token: "token-new",
          expires_at: new Date(Date.now() + 3600000).toISOString(),
        },
      });

      const mockStartShiftMutateAsync = vi.fn().mockResolvedValue({
        shift_id: "new-shift-id",
      });

      vi.mocked(cashiersApi.useAuthenticateCashier).mockReturnValue({
        mutateAsync: mockAuthMutateAsync,
        isPending: false,
        isError: false,
        error: null,
        reset: vi.fn(),
      } as any);

      vi.mocked(shiftsApi.useShiftStart).mockReturnValue({
        mutateAsync: mockStartShiftMutateAsync,
        isPending: false,
        isError: false,
        error: null,
        reset: vi.fn(),
      } as any);

      const user = userEvent.setup();
      renderWithProviders(
        <TerminalAuthModal
          terminalId={mockTerminalId}
          storeId={mockStoreId}
          terminalName={mockTerminalName}
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
      );

      // Wait for form to render
      await waitFor(() => {
        expect(screen.getByTestId("cashier-name-select")).toBeInTheDocument();
      });

      // WHEN: Cashier B selects themselves and enters PIN
      const selectTrigger = screen.getByTestId("cashier-name-select");
      await user.click(selectTrigger);

      await waitFor(() => {
        expect(
          screen.getByRole("option", { name: cashierB.name }),
        ).toBeInTheDocument();
      });
      await user.click(screen.getByRole("option", { name: cashierB.name }));

      const pinInput = screen.getByTestId("pin-number-input");
      await user.type(pinInput, "5678");

      const submitButton = screen.getByTestId("terminal-auth-submit-button");
      await user.click(submitButton);

      // THEN: Should authenticate with selected cashier
      await waitFor(() => {
        expect(mockAuthMutateAsync).toHaveBeenCalledWith({
          storeId: mockStoreId,
          identifier: { name: cashierB.name },
          pin: "5678",
          terminalId: mockTerminalId,
        });
      });

      // AND: Should start a new shift
      await waitFor(() => {
        expect(mockStartShiftMutateAsync).toHaveBeenCalled();
      });

      // AND: Should navigate to shift page
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          `/terminal/${mockTerminalId}/shift`,
        );
      });
    });
  });

  describe("Edge Cases", () => {
    it("[P2] SECURITY-008: should handle missing cashier_name in active shift gracefully", async () => {
      // GIVEN: Active shift exists but cashier_name is missing (edge case)
      const shiftWithoutCashierName = {
        ...activeShiftOwnedByCashierA,
        cashier_name: undefined,
      };

      vi.mocked(shiftsApi.useActiveShift).mockReturnValue({
        data: shiftWithoutCashierName,
        isLoading: false,
        error: null,
        isError: false,
      } as any);

      // WHEN: Component renders
      renderWithProviders(
        <TerminalAuthModal
          terminalId={mockTerminalId}
          storeId={mockStoreId}
          terminalName={mockTerminalName}
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
      );

      // THEN: Component should not crash
      await waitFor(() => {
        expect(screen.getByTestId("terminal-auth-modal")).toBeInTheDocument();
      });
    });

    it("[P2] SECURITY-009: should clear ownership error when modal is reopened", async () => {
      // Set up active shift
      vi.mocked(shiftsApi.useActiveShift).mockReturnValue({
        data: activeShiftOwnedByCashierA,
        isLoading: false,
        error: null,
        isError: false,
      } as any);

      // Mock authentication to return different cashier (trigger ownership error)
      vi.mocked(cashiersApi.useAuthenticateCashier).mockReturnValue({
        mutateAsync: vi.fn().mockResolvedValue({
          cashier_id: cashierB.cashier_id, // Different from shift owner
          session: {
            session_id: "session-123",
            session_token: "token-abc",
            expires_at: new Date(Date.now() + 3600000).toISOString(),
          },
        }),
        isPending: false,
        isError: false,
        error: null,
        reset: vi.fn(),
      } as any);

      const user = userEvent.setup();
      const { rerender } = renderWithProviders(
        <TerminalAuthModal
          terminalId={mockTerminalId}
          storeId={mockStoreId}
          terminalName={mockTerminalName}
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
      );

      // Trigger ownership error
      await waitFor(() => {
        expect(screen.getByTestId("shift-owner-display")).toBeInTheDocument();
      });

      const pinInput = screen.getByTestId("pin-number-input");
      await user.type(pinInput, "1234");
      await user.click(screen.getByTestId("terminal-auth-submit-button"));

      await waitFor(() => {
        expect(screen.getByTestId("ownership-error")).toBeInTheDocument();
      });

      // Close and reopen modal
      rerender(
        <TerminalAuthModal
          terminalId={mockTerminalId}
          storeId={mockStoreId}
          terminalName={mockTerminalName}
          open={false}
          onOpenChange={mockOnOpenChange}
        />,
      );

      rerender(
        <TerminalAuthModal
          terminalId={mockTerminalId}
          storeId={mockStoreId}
          terminalName={mockTerminalName}
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
      );

      // THEN: Ownership error should be cleared
      await waitFor(() => {
        expect(screen.queryByTestId("ownership-error")).not.toBeInTheDocument();
      });
    });
  });
});
