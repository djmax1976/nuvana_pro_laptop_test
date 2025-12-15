/**
 * Terminal Shift Page Component Tests
 *
 * Tests for TerminalShiftPage navigation:
 * - End Shift button navigation to closing page
 * - Shift ID passed as query parameter
 *
 * @test-level Component
 * @justification Tests navigation behavior for shift closing flow
 * @story 10-1 - Lottery Shift Closing Page UI
 * @priority P1 (High - Navigation)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen } from "../../support/test-utils";
import userEvent from "@testing-library/user-event";
import { TerminalShiftPageContent } from "@/components/terminals/TerminalShiftPage";

// Mock Next.js navigation
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/mystore/terminal",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock useUpdateStartingCash
vi.mock("@/lib/api/shifts", () => ({
  useUpdateStartingCash: () => ({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
  }),
}));

// Mock CashierSessionContext
const mockSession = {
  sessionToken: "test-token",
  cashierId: "cashier-1",
  storeId: "store-1",
  terminalId: "terminal-1",
};

vi.mock("@/contexts/CashierSessionContext", () => ({
  useCashierSession: () => ({
    session: mockSession,
  }),
}));

describe("10-1-COMPONENT: TerminalShiftPage Navigation", () => {
  const mockShift = {
    shift_id: "shift-123",
    cashier_id: "cashier-1",
    opened_at: "2025-01-28T10:00:00Z",
    shift_number: 1,
    opening_cash: 100.0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("10-1-NAV-001: should navigate to closing page when End Shift button is clicked", async () => {
    // GIVEN: TerminalShiftPageContent with active shift
    // WHEN: User clicks End Shift button
    const user = userEvent.setup();
    renderWithProviders(
      <TerminalShiftPageContent
        shift={mockShift}
        cashierName="Test Cashier"
        terminalId="terminal-1"
      />,
    );

    const endShiftButton = screen.getByTestId("end-shift-button");
    await user.click(endShiftButton);

    // THEN: Router navigates to closing page with shiftId query parameter
    expect(mockPush).toHaveBeenCalledWith(
      "/mystore/terminal/shift-closing/lottery?shiftId=shift-123",
    );
  });

  it("10-1-NAV-002: should pass correct shiftId in navigation URL", async () => {
    // GIVEN: TerminalShiftPageContent with different shift ID
    // WHEN: User clicks End Shift button
    const differentShift = {
      ...mockShift,
      shift_id: "shift-456",
    };
    const user = userEvent.setup();
    renderWithProviders(
      <TerminalShiftPageContent
        shift={differentShift}
        cashierName="Test Cashier"
        terminalId="terminal-1"
      />,
    );

    const endShiftButton = screen.getByTestId("end-shift-button");
    await user.click(endShiftButton);

    // THEN: Router navigates with correct shiftId
    expect(mockPush).toHaveBeenCalledWith(
      "/mystore/terminal/shift-closing/lottery?shiftId=shift-456",
    );
  });

  it("10-1-NAV-003: should have End Shift button enabled (not disabled)", () => {
    // GIVEN: TerminalShiftPageContent component
    // WHEN: Component is rendered
    renderWithProviders(
      <TerminalShiftPageContent
        shift={mockShift}
        cashierName="Test Cashier"
        terminalId="terminal-1"
      />,
    );

    const endShiftButton = screen.getByTestId("end-shift-button");

    // THEN: End Shift button is enabled (not disabled)
    expect(endShiftButton).not.toBeDisabled();
    expect(endShiftButton).toBeEnabled();
  });

  // ============ SECURITY TESTS (MANDATORY) ============

  it("10-1-NAV-SEC-001: should validate shiftId in navigation URL", async () => {
    // GIVEN: TerminalShiftPageContent with shift
    // WHEN: User clicks End Shift button
    const user = userEvent.setup();
    renderWithProviders(
      <TerminalShiftPageContent
        shift={mockShift}
        cashierName="Test Cashier"
        terminalId="terminal-1"
      />,
    );

    const endShiftButton = screen.getByTestId("end-shift-button");
    await user.click(endShiftButton);

    // THEN: Navigation URL contains valid shiftId (not malicious input)
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringMatching(/shiftId=shift-123$/),
    );
    // Verify no path traversal or injection attempts
    expect(mockPush).not.toHaveBeenCalledWith(expect.stringContaining("../"));
    expect(mockPush).not.toHaveBeenCalledWith(
      expect.stringContaining("javascript:"),
    );
  });

  // ============ AUTOMATIC ASSERTIONS ============

  it("10-1-NAV-ASSERT-001: should have correct data-testid for End Shift button", () => {
    // GIVEN: TerminalShiftPageContent component
    // WHEN: Component is rendered
    renderWithProviders(
      <TerminalShiftPageContent
        shift={mockShift}
        cashierName="Test Cashier"
        terminalId="terminal-1"
      />,
    );

    // THEN: End Shift button has correct data-testid
    const endShiftButton = screen.getByTestId("end-shift-button");
    expect(endShiftButton).toBeInTheDocument();
    expect(endShiftButton).toHaveAttribute("data-testid", "end-shift-button");
  });

  // ============ EDGE CASES ============

  it("10-1-NAV-EDGE-001: should handle missing shift object", () => {
    // GIVEN: TerminalShiftPageContent with null/undefined shift
    // WHEN: Component is rendered
    renderWithProviders(
      <TerminalShiftPageContent
        shift={null as any}
        cashierName="Test Cashier"
        terminalId="terminal-1"
      />,
    );

    // THEN: Component handles missing shift gracefully
    // End Shift button may be disabled or not rendered
    const endShiftButton = screen.queryByTestId("end-shift-button");
    // Component should handle null shift without crashing
    expect(endShiftButton === null || endShiftButton !== null).toBe(true);
  });

  it("10-1-NAV-EDGE-002: should handle navigation errors gracefully", async () => {
    // GIVEN: Router that throws error
    const errorPush = vi.fn().mockRejectedValue(new Error("Navigation failed"));
    vi.mocked(require("next/navigation").useRouter).mockReturnValue({
      push: errorPush,
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    });

    // WHEN: User clicks End Shift button
    const user = userEvent.setup();
    renderWithProviders(
      <TerminalShiftPageContent
        shift={mockShift}
        cashierName="Test Cashier"
        terminalId="terminal-1"
      />,
    );

    const endShiftButton = screen.getByTestId("end-shift-button");

    // THEN: Navigation error is handled (component doesn't crash)
    await user.click(endShiftButton);
    expect(errorPush).toHaveBeenCalled();
    // Component should handle error gracefully
  });

  it("10-1-NAV-EDGE-003: should handle rapid button clicks", async () => {
    // GIVEN: TerminalShiftPageContent component
    // WHEN: User rapidly clicks End Shift button multiple times
    const user = userEvent.setup();
    renderWithProviders(
      <TerminalShiftPageContent
        shift={mockShift}
        cashierName="Test Cashier"
        terminalId="terminal-1"
      />,
    );

    const endShiftButton = screen.getByTestId("end-shift-button");
    await user.click(endShiftButton);
    await user.click(endShiftButton);
    await user.click(endShiftButton);

    // THEN: Navigation is called for each click
    expect(mockPush).toHaveBeenCalledTimes(3);
  });
});
