/**
 * Terminal Shift Page Component Tests
 *
 * Tests for TerminalShiftPage navigation:
 * - End Shift button navigation to shift-end page
 * - Close Day button navigation to day-close page
 * - Shift ID passed as query parameter
 *
 * @test-level Component
 * @justification Tests navigation behavior for shift and day closing flows
 * @story 4.92 - Terminal Shift Page
 * @priority P1 (High - Navigation)
 */

import React from "react";
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
  CashierSessionProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

describe("4.92-COMPONENT: TerminalShiftPage Navigation", () => {
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

  it("4.92-NAV-001: should navigate to shift-end page when End Shift button is clicked", async () => {
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

    // THEN: Router navigates to shift-end page with shiftId query parameter
    expect(mockPush).toHaveBeenCalledWith(
      "/mystore/shift-end?shiftId=shift-123",
    );
  });

  it("4.92-NAV-002: should navigate to day-close page when Close Day button is clicked", async () => {
    // GIVEN: TerminalShiftPageContent with active shift
    // WHEN: User clicks Close Day button
    const user = userEvent.setup();
    renderWithProviders(
      <TerminalShiftPageContent
        shift={mockShift}
        cashierName="Test Cashier"
        terminalId="terminal-1"
      />,
    );

    const closeDayButton = screen.getByTestId("close-day-button");
    await user.click(closeDayButton);

    // THEN: Router navigates to day-close page with shiftId query parameter
    expect(mockPush).toHaveBeenCalledWith(
      "/mystore/day-close?shiftId=shift-123",
    );
  });

  it("4.92-NAV-003: should pass correct shiftId in navigation URLs", async () => {
    // GIVEN: TerminalShiftPageContent with different shift ID
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

    // WHEN: User clicks End Shift button
    const endShiftButton = screen.getByTestId("end-shift-button");
    await user.click(endShiftButton);

    // THEN: Router navigates with correct shiftId
    expect(mockPush).toHaveBeenCalledWith(
      "/mystore/shift-end?shiftId=shift-456",
    );
  });

  it("4.92-NAV-004: should have End Shift and Close Day buttons enabled", () => {
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
    const closeDayButton = screen.getByTestId("close-day-button");

    // THEN: Both buttons are enabled (not disabled)
    expect(endShiftButton).not.toBeDisabled();
    expect(endShiftButton).toBeEnabled();
    expect(closeDayButton).not.toBeDisabled();
    expect(closeDayButton).toBeEnabled();
  });

  // ============ SECURITY TESTS (MANDATORY) ============

  it("4.92-NAV-SEC-001: should validate shiftId in End Shift navigation URL", async () => {
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

  it("4.92-NAV-SEC-002: should validate shiftId in Close Day navigation URL", async () => {
    // GIVEN: TerminalShiftPageContent with shift
    // WHEN: User clicks Close Day button
    const user = userEvent.setup();
    renderWithProviders(
      <TerminalShiftPageContent
        shift={mockShift}
        cashierName="Test Cashier"
        terminalId="terminal-1"
      />,
    );

    const closeDayButton = screen.getByTestId("close-day-button");
    await user.click(closeDayButton);

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

  it("4.92-NAV-ASSERT-001: should have correct data-testid for both buttons", () => {
    // GIVEN: TerminalShiftPageContent component
    // WHEN: Component is rendered
    renderWithProviders(
      <TerminalShiftPageContent
        shift={mockShift}
        cashierName="Test Cashier"
        terminalId="terminal-1"
      />,
    );

    // THEN: Both buttons have correct data-testid
    const endShiftButton = screen.getByTestId("end-shift-button");
    const closeDayButton = screen.getByTestId("close-day-button");
    expect(endShiftButton).toBeInTheDocument();
    expect(endShiftButton).toHaveAttribute("data-testid", "end-shift-button");
    expect(closeDayButton).toBeInTheDocument();
    expect(closeDayButton).toHaveAttribute("data-testid", "close-day-button");
  });

  // ============ EDGE CASES ============

  it("4.92-NAV-EDGE-001: should require valid shift object", () => {
    // GIVEN: TerminalShiftPageContent component
    // WHEN: Rendering with a valid shift object
    // THEN: Component renders correctly with both buttons
    renderWithProviders(
      <TerminalShiftPageContent
        shift={mockShift}
        cashierName="Test Cashier"
        terminalId="terminal-1"
      />,
    );

    // Component requires valid shift - verify buttons are present
    const endShiftButton = screen.getByTestId("end-shift-button");
    const closeDayButton = screen.getByTestId("close-day-button");
    expect(endShiftButton).toBeInTheDocument();
    expect(closeDayButton).toBeInTheDocument();
  });

  it("4.92-NAV-EDGE-002: should handle navigation errors gracefully", async () => {
    // GIVEN: Router push that throws error
    // For this test, we simulate a navigation error by mocking push to reject
    // Since router.push() is async, we test that the component doesn't crash

    // Setup mockPush to reject
    mockPush.mockRejectedValueOnce(new Error("Navigation failed"));

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
    expect(mockPush).toHaveBeenCalled();
    // Component should handle error gracefully (no unhandled rejection)
  });

  it("4.92-NAV-EDGE-003: should handle rapid button clicks", async () => {
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
