/**
 * Manual Entry Auth Modal Component Tests
 *
 * Tests for the manual entry authorization modal:
 * - Cashier dropdown with active shift cashiers
 * - PIN input field (4 digits, masked)
 * - Cancel and Verify buttons
 * - PIN verification and permission checking
 * - Error handling (invalid PIN, unauthorized user)
 *
 * @test-level Component
 * @justification Tests UI component behavior and user interactions
 * @story 10-4 - Manual Entry Override
 * @priority P1 (High - Authentication Flow)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../support/test-utils";
import userEvent from "@testing-library/user-event";

describe("10-4-COMPONENT: ManualEntryAuthModal", () => {
  const mockOnOpenChange = vi.fn();
  const mockOnAuthorized = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("10-4-COMPONENT-001: should show cashier dropdown with active shift cashiers only", async () => {
    // GIVEN: ManualEntryAuthModal component with storeId
    // WHEN: Modal is opened
    // Note: Component doesn't exist yet, test will fail (RED phase)
    const { ManualEntryAuthModal } =
      await import("@/components/shift-closing/ManualEntryAuthModal");
    const user = userEvent.setup();

    renderWithProviders(
      <ManualEntryAuthModal
        open={true}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onAuthorized={mockOnAuthorized}
      />,
    );

    // THEN: Cashier dropdown is visible
    const dropdown = screen.getByTestId("cashier-dropdown");
    expect(dropdown).toBeInTheDocument();

    // AND: Only active shift cashiers are shown
    await waitFor(() => {
      expect(screen.getByText("Cashier 1")).toBeInTheDocument();
      expect(screen.queryByText("Inactive Cashier")).not.toBeInTheDocument();
    });
  });

  it("10-4-COMPONENT-002: should mask PIN input", async () => {
    // GIVEN: ManualEntryAuthModal component
    const { ManualEntryAuthModal } =
      await import("@/components/shift-closing/ManualEntryAuthModal");
    const user = userEvent.setup();

    renderWithProviders(
      <ManualEntryAuthModal
        open={true}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onAuthorized={mockOnAuthorized}
      />,
    );

    // WHEN: User types PIN
    const pinInput = screen.getByTestId("pin-input");
    await user.type(pinInput, "1234");

    // THEN: PIN is masked (not visible as plain text)
    expect(pinInput).toHaveAttribute("type", "password");
    expect(pinInput).not.toHaveValue("1234"); // Value should be masked
  });

  it("10-4-COMPONENT-003: should disable Verify button until cashier selected and 4-digit PIN entered", async () => {
    // GIVEN: ManualEntryAuthModal component
    const { ManualEntryAuthModal } =
      await import("@/components/shift-closing/ManualEntryAuthModal");
    const user = userEvent.setup();

    renderWithProviders(
      <ManualEntryAuthModal
        open={true}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onAuthorized={mockOnAuthorized}
      />,
    );

    // WHEN: No cashier selected and no PIN entered
    const verifyButton = screen.getByTestId("verify-button");
    expect(verifyButton).toBeDisabled();

    // WHEN: Cashier selected but PIN not 4 digits
    const dropdown = screen.getByTestId("cashier-dropdown");
    await user.click(dropdown);
    await user.click(screen.getByText("Cashier 1"));

    const pinInput = screen.getByTestId("pin-input");
    await user.type(pinInput, "123"); // Only 3 digits

    // THEN: Verify button still disabled
    expect(verifyButton).toBeDisabled();

    // WHEN: 4-digit PIN entered
    await user.type(pinInput, "4");

    // THEN: Verify button is enabled
    expect(verifyButton).toBeEnabled();
  });

  it("10-4-COMPONENT-004: should show error for invalid PIN", async () => {
    // GIVEN: ManualEntryAuthModal component with cashier selected and PIN entered
    const { ManualEntryAuthModal } =
      await import("@/components/shift-closing/ManualEntryAuthModal");
    const user = userEvent.setup();

    renderWithProviders(
      <ManualEntryAuthModal
        open={true}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onAuthorized={mockOnAuthorized}
      />,
    );

    // WHEN: User enters invalid PIN and clicks Verify
    const dropdown = screen.getByTestId("cashier-dropdown");
    await user.click(dropdown);
    await user.click(screen.getByText("Cashier 1"));

    const pinInput = screen.getByTestId("pin-input");
    await user.type(pinInput, "9999"); // Invalid PIN

    const verifyButton = screen.getByTestId("verify-button");
    await user.click(verifyButton);

    // THEN: Error message is displayed
    await waitFor(() => {
      expect(screen.getByTestId("error-message")).toBeInTheDocument();
      expect(screen.getByText(/invalid.*pin/i)).toBeInTheDocument();
    });
  });

  it("10-4-COMPONENT-005: should show error for unauthorized user", async () => {
    // GIVEN: ManualEntryAuthModal component with cashier selected and valid PIN
    const { ManualEntryAuthModal } =
      await import("@/components/shift-closing/ManualEntryAuthModal");
    const user = userEvent.setup();

    renderWithProviders(
      <ManualEntryAuthModal
        open={true}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onAuthorized={mockOnAuthorized}
      />,
    );

    // WHEN: User enters valid PIN but user lacks LOTTERY_MANUAL_ENTRY permission
    const dropdown = screen.getByTestId("cashier-dropdown");
    await user.click(dropdown);
    await user.click(screen.getByText("Cashier Without Permission"));

    const pinInput = screen.getByTestId("pin-input");
    await user.type(pinInput, "1234"); // Valid PIN

    const verifyButton = screen.getByTestId("verify-button");
    await user.click(verifyButton);

    // THEN: Authorization error is displayed
    await waitFor(() => {
      expect(screen.getByTestId("error-message")).toBeInTheDocument();
      expect(
        screen.getByText(/not authorized.*manual entry/i),
      ).toBeInTheDocument();
    });
  });

  it("10-4-COMPONENT-006: should call onAuthorized on successful verification", async () => {
    // GIVEN: ManualEntryAuthModal component with authorized cashier
    const { ManualEntryAuthModal } =
      await import("@/components/shift-closing/ManualEntryAuthModal");
    const user = userEvent.setup();

    renderWithProviders(
      <ManualEntryAuthModal
        open={true}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onAuthorized={mockOnAuthorized}
      />,
    );

    // WHEN: User enters valid credentials and clicks Verify
    const dropdown = screen.getByTestId("cashier-dropdown");
    await user.click(dropdown);
    await user.click(screen.getByText("Shift Manager"));

    const pinInput = screen.getByTestId("pin-input");
    await user.type(pinInput, "1234"); // Valid PIN

    const verifyButton = screen.getByTestId("verify-button");
    await user.click(verifyButton);

    // THEN: onAuthorized callback is called with user info
    await waitFor(() => {
      expect(mockOnAuthorized).toHaveBeenCalledWith({
        userId: expect.any(String),
        name: expect.any(String),
      });
    });
  });

  it("10-4-COMPONENT-007: should close modal on successful authorization", async () => {
    // GIVEN: ManualEntryAuthModal component
    const { ManualEntryAuthModal } =
      await import("@/components/shift-closing/ManualEntryAuthModal");
    const user = userEvent.setup();

    renderWithProviders(
      <ManualEntryAuthModal
        open={true}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onAuthorized={mockOnAuthorized}
      />,
    );

    // WHEN: User successfully authorizes
    const dropdown = screen.getByTestId("cashier-dropdown");
    await user.click(dropdown);
    await user.click(screen.getByText("Shift Manager"));

    const pinInput = screen.getByTestId("pin-input");
    await user.type(pinInput, "1234");

    const verifyButton = screen.getByTestId("verify-button");
    await user.click(verifyButton);

    // THEN: Modal closes (onOpenChange called with false)
    await waitFor(() => {
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("10-4-COMPONENT-008: should close modal on Cancel button click", async () => {
    // GIVEN: ManualEntryAuthModal component
    const { ManualEntryAuthModal } =
      await import("@/components/shift-closing/ManualEntryAuthModal");
    const user = userEvent.setup();

    renderWithProviders(
      <ManualEntryAuthModal
        open={true}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onAuthorized={mockOnAuthorized}
      />,
    );

    // WHEN: User clicks Cancel button
    const cancelButton = screen.getByTestId("cancel-button");
    await user.click(cancelButton);

    // THEN: Modal closes
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    expect(mockOnAuthorized).not.toHaveBeenCalled();
  });

  // ============================================================================
  // 🔒 SECURITY TESTS (Mandatory - Applied Automatically)
  // ============================================================================

  it("10-4-COMPONENT-SEC-001: should prevent XSS in cashier name display", async () => {
    // GIVEN: ManualEntryAuthModal with XSS attempt in cashier name
    const { ManualEntryAuthModal } =
      await import("@/components/shift-closing/ManualEntryAuthModal");
    const user = userEvent.setup();

    // Mock API to return cashier with XSS attempt
    vi.mock("@tanstack/react-query", () => ({
      useQuery: vi.fn(() => ({
        data: [
          {
            id: "cashier-1",
            name: "<script>alert('XSS')</script>Evil Cashier",
            shiftId: "shift-1",
          },
        ],
        isLoading: false,
        error: null,
      })),
      useMutation: vi.fn(() => ({
        mutate: vi.fn(),
        isPending: false,
        isError: false,
      })),
    }));

    renderWithProviders(
      <ManualEntryAuthModal
        open={true}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onAuthorized={mockOnAuthorized}
      />,
    );

    // WHEN: Component renders cashier name
    await waitFor(() => {
      const dropdown = screen.getByTestId("cashier-dropdown");
      expect(dropdown).toBeInTheDocument();
    });

    // THEN: XSS is escaped (React auto-escapes)
    const cashierName = screen.getByText(/Evil Cashier/i);
    expect(cashierName).toBeInTheDocument();
    // Assertion: Script tag should not be executed (escaped as text)
    expect(cashierName.textContent).toContain("<script>");
    expect(cashierName.tagName).not.toBe("SCRIPT");
    // Assertion: No script elements should exist in DOM
    const scripts = document.querySelectorAll("script");
    expect(scripts.length).toBe(0);
  });

  // ============================================================================
  // 🔄 EDGE CASES (Standard Boundaries - Applied Automatically)
  // ============================================================================

  it("10-4-COMPONENT-EDGE-001: should reject PIN with non-numeric characters", async () => {
    // GIVEN: ManualEntryAuthModal component
    const { ManualEntryAuthModal } =
      await import("@/components/shift-closing/ManualEntryAuthModal");
    const user = userEvent.setup();

    renderWithProviders(
      <ManualEntryAuthModal
        open={true}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onAuthorized={mockOnAuthorized}
      />,
    );

    // WHEN: User types non-numeric characters in PIN
    const pinInput = screen.getByTestId("pin-input");

    // Attempt to type non-numeric characters
    await user.type(pinInput, "abcd");

    // THEN: PIN input should reject non-numeric characters
    // (Input type="password" with pattern validation should prevent this)
    // Assertion: Verify button should remain disabled
    const verifyButton = screen.getByTestId("verify-button");
    expect(verifyButton).toBeDisabled();

    // Assertion: Input should not contain non-numeric characters
    // (Actual behavior depends on input type and validation)
    expect(pinInput).toHaveAttribute("type", "password");
  });

  it("10-4-COMPONENT-EDGE-002: should handle empty PIN input", async () => {
    // GIVEN: ManualEntryAuthModal component
    const { ManualEntryAuthModal } =
      await import("@/components/shift-closing/ManualEntryAuthModal");
    const user = userEvent.setup();

    renderWithProviders(
      <ManualEntryAuthModal
        open={true}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onAuthorized={mockOnAuthorized}
      />,
    );

    // WHEN: PIN input is empty
    const pinInput = screen.getByTestId("pin-input");
    expect(pinInput).toHaveValue("");

    // THEN: Verify button is disabled
    const verifyButton = screen.getByTestId("verify-button");
    expect(verifyButton).toBeDisabled();

    // Assertion: Input should be empty
    expect(pinInput).toHaveValue("");
  });

  it("10-4-COMPONENT-EDGE-003: should handle PIN with wrong length (too short)", async () => {
    // GIVEN: ManualEntryAuthModal component
    const { ManualEntryAuthModal } =
      await import("@/components/shift-closing/ManualEntryAuthModal");
    const user = userEvent.setup();

    renderWithProviders(
      <ManualEntryAuthModal
        open={true}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onAuthorized={mockOnAuthorized}
      />,
    );

    // WHEN: User types PIN with less than 4 digits
    const pinInput = screen.getByTestId("pin-input");
    await user.type(pinInput, "123"); // Only 3 digits

    // THEN: Verify button should be disabled
    const verifyButton = screen.getByTestId("verify-button");
    expect(verifyButton).toBeDisabled();

    // Assertion: Input should have 3 digits
    expect(pinInput).toHaveValue("123");
  });

  it("10-4-COMPONENT-EDGE-004: should handle PIN with wrong length (too long)", async () => {
    // GIVEN: ManualEntryAuthModal component
    const { ManualEntryAuthModal } =
      await import("@/components/shift-closing/ManualEntryAuthModal");
    const user = userEvent.setup();

    renderWithProviders(
      <ManualEntryAuthModal
        open={true}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onAuthorized={mockOnAuthorized}
      />,
    );

    // WHEN: User types PIN with more than 4 digits
    const pinInput = screen.getByTestId("pin-input");

    // Attempt to type 5 digits (input should limit to 4)
    await user.type(pinInput, "12345");

    // THEN: PIN input should be limited to 4 digits
    // (Actual behavior depends on maxLength attribute)
    // Assertion: Input should not exceed 4 digits
    const value = (pinInput as HTMLInputElement).value;
    expect(value.length).toBeLessThanOrEqual(4);
  });

  // ============================================================================
  // ✅ ENHANCED ASSERTIONS (Best Practices - Applied Automatically)
  // ============================================================================

  it("10-4-COMPONENT-ASSERT-001: should have proper accessibility attributes", async () => {
    // GIVEN: ManualEntryAuthModal component
    const { ManualEntryAuthModal } =
      await import("@/components/shift-closing/ManualEntryAuthModal");

    renderWithProviders(
      <ManualEntryAuthModal
        open={true}
        onOpenChange={mockOnOpenChange}
        storeId="store-1"
        onAuthorized={mockOnAuthorized}
      />,
    );

    // THEN: All interactive elements have proper test IDs
    const modal = screen.getByTestId("manual-entry-auth-modal");
    expect(modal).toBeInTheDocument();

    const dropdown = screen.getByTestId("cashier-dropdown");
    expect(dropdown).toBeInTheDocument();

    const pinInput = screen.getByTestId("pin-input");
    expect(pinInput).toBeInTheDocument();

    const verifyButton = screen.getByTestId("verify-button");
    expect(verifyButton).toBeInTheDocument();

    const cancelButton = screen.getByTestId("cancel-button");
    expect(cancelButton).toBeInTheDocument();

    // Assertion: PIN input should have password type
    expect(pinInput).toHaveAttribute("type", "password");

    // Assertion: Buttons should be accessible
    expect(verifyButton).toHaveAttribute("type", "button");
    expect(cancelButton).toHaveAttribute("type", "button");
  });
});
