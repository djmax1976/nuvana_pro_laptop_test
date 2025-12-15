/**
 * Add Bin Modal Component Tests
 *
 * Tests for AddBinModal component:
 * - Auto-assigned bin number display (read-only)
 * - 24-digit serial input field
 * - Pack validation and display
 * - Error handling for invalid scans
 * - Optional location field
 * - Add Bin button enable/disable logic
 *
 * @test-level Component
 * @justification Tests UI component behavior, form interactions, and validation feedback
 * @story 10-5 - Add Bin Functionality
 * @priority P0-P3 (Mixed - Core UI functionality)
 *
 * RED PHASE: These tests will fail until AddBinModal component is implemented.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../support/test-utils";
import userEvent from "@testing-library/user-event";

describe("10-5-COMPONENT: AddBinModal", () => {
  const mockOnOpenChange = vi.fn();
  const mockOnBinCreated = vi.fn();
  const defaultProps = {
    open: true,
    onOpenChange: mockOnOpenChange,
    storeId: "store-123",
    currentShiftId: "shift-123",
    currentUserId: "user-123",
    existingBinCount: 3,
    onBinCreated: mockOnBinCreated,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AC-1: Add Bin Button (P3)
  // ═══════════════════════════════════════════════════════════════════════════

  it("10-5-COMPONENT-001: [P3] should render Add Bin button in ShiftClosingActions", async () => {
    // GIVEN: ShiftClosingActions component
    // WHEN: Component is rendered
    // Note: This test verifies the button exists in parent component
    // Component doesn't exist yet, test will fail (RED phase)
    const { ShiftClosingActions } =
      await import("@/components/shift-closing/ShiftClosingActions");
    const { renderWithProviders, screen } =
      await import("../../support/test-utils");

    renderWithProviders(
      <ShiftClosingActions
        canProceed={false}
        onAddBin={vi.fn()}
        onActivatePack={vi.fn()}
        onManualEntry={vi.fn()}
        onNext={vi.fn()}
      />,
    );

    // THEN: Add Bin button is visible
    expect(screen.getByTestId("add-bin-button")).toBeInTheDocument();
    expect(screen.getByText("+ Add Bin")).toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AC-2: Add Bin Modal - Step 1 (Bin Number) (P2)
  // ═══════════════════════════════════════════════════════════════════════════

  it("10-5-COMPONENT-002: [P2] should display auto-assigned bin number (read-only)", async () => {
    // GIVEN: AddBinModal with existingBinCount = 3
    // WHEN: Modal is opened
    // Component doesn't exist yet, test will fail (RED phase)
    const { AddBinModal } =
      await import("@/components/shift-closing/AddBinModal");
    renderWithProviders(<AddBinModal {...defaultProps} />);

    // THEN: Bin number shows "Bin 4" (next sequential number)
    const binNumberField = screen.getByTestId("bin-number-display");
    expect(binNumberField).toBeInTheDocument();
    expect(binNumberField).toHaveTextContent("Bin 4");
    expect(binNumberField).toHaveAttribute("readonly");
  });

  it("10-5-COMPONENT-003: [P2] should auto-assign Bin 1 when no bins exist", async () => {
    // GIVEN: AddBinModal with existingBinCount = 0
    // WHEN: Modal is opened
    const { AddBinModal } =
      await import("@/components/shift-closing/AddBinModal");
    renderWithProviders(<AddBinModal {...defaultProps} existingBinCount={0} />);

    // THEN: Bin number shows "Bin 1"
    const binNumberField = screen.getByTestId("bin-number-display");
    expect(binNumberField).toHaveTextContent("Bin 1");
  });

  it("10-5-COMPONENT-004: [P2] should have 24-digit serial input field", async () => {
    // GIVEN: AddBinModal is open
    // WHEN: Modal is rendered
    const { AddBinModal } =
      await import("@/components/shift-closing/AddBinModal");
    renderWithProviders(<AddBinModal {...defaultProps} />);

    // THEN: Serial input field is present
    const serialInput = screen.getByTestId("pack-serial-input");
    expect(serialInput).toBeInTheDocument();
    expect(serialInput).toHaveAttribute("type", "text");
    expect(serialInput).toHaveAttribute("maxLength", "24");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AC-3: Add Bin Modal - Step 2 (Scan Pack) (P1)
  // ═══════════════════════════════════════════════════════════════════════════

  it("10-5-COMPONENT-005: [P1] should accept 24-digit barcode scan", async () => {
    // GIVEN: AddBinModal is open
    // WHEN: User scans 24-digit barcode
    const { AddBinModal } =
      await import("@/components/shift-closing/AddBinModal");
    const user = userEvent.setup();
    renderWithProviders(<AddBinModal {...defaultProps} />);

    const serialInput = screen.getByTestId("pack-serial-input");
    await user.type(serialInput, "000112345670123456789012");

    // THEN: Input field contains the scanned serial
    expect(serialInput).toHaveValue("000112345670123456789012");
  });

  it("10-5-COMPONENT-006: [P1] should show game name and price after valid scan", async () => {
    // GIVEN: AddBinModal with valid pack scan
    // WHEN: Pack is validated successfully
    // Note: This requires API mock - test will fail until implementation
    const { AddBinModal } =
      await import("@/components/shift-closing/AddBinModal");
    const user = userEvent.setup();
    renderWithProviders(<AddBinModal {...defaultProps} />);

    // Mock API response for pack validation
    // TODO: Add API mock when implementing

    const serialInput = screen.getByTestId("pack-serial-input");
    await user.type(serialInput, "000112345670123456789012");
    await user.tab(); // Trigger validation on blur

    // THEN: Game name and price are displayed
    await waitFor(() => {
      expect(screen.getByTestId("pack-game-name")).toHaveTextContent(
        "$5 Powerball",
      );
      expect(screen.getByTestId("pack-price")).toHaveTextContent("$5.00");
    });
  });

  it("10-5-COMPONENT-007: [P1] should show error for unknown game code", async () => {
    // GIVEN: AddBinModal with invalid game code
    // WHEN: User scans serial with unknown game code
    const { AddBinModal } =
      await import("@/components/shift-closing/AddBinModal");
    const user = userEvent.setup();
    renderWithProviders(<AddBinModal {...defaultProps} />);

    // Mock API response: game not found
    // TODO: Add API mock when implementing

    const serialInput = screen.getByTestId("pack-serial-input");
    await user.type(serialInput, "999912345670123456789012");
    await user.tab();

    // THEN: Error message is displayed
    await waitFor(() => {
      expect(screen.getByTestId("pack-validation-error")).toHaveTextContent(
        "Unknown game code. Please add game first.",
      );
    });
    expect(serialInput).toHaveClass("border-red-500");
  });

  it("10-5-COMPONENT-008: [P1] should show error for already active pack", async () => {
    // GIVEN: AddBinModal with pack that is already ACTIVE
    // WHEN: User scans serial for active pack
    const { AddBinModal } =
      await import("@/components/shift-closing/AddBinModal");
    const user = userEvent.setup();
    renderWithProviders(<AddBinModal {...defaultProps} />);

    // Mock API response: pack status = ACTIVE
    // TODO: Add API mock when implementing

    const serialInput = screen.getByTestId("pack-serial-input");
    await user.type(serialInput, "000112345670123456789012");
    await user.tab();

    // THEN: Error message is displayed
    await waitFor(() => {
      expect(screen.getByTestId("pack-validation-error")).toHaveTextContent(
        "Pack already active in another bin",
      );
    });
  });

  it("10-5-COMPONENT-009: [P1] should show error for depleted pack", async () => {
    // GIVEN: AddBinModal with pack that is DEPLETED
    // WHEN: User scans serial for depleted pack
    const { AddBinModal } =
      await import("@/components/shift-closing/AddBinModal");
    const user = userEvent.setup();
    renderWithProviders(<AddBinModal {...defaultProps} />);

    // Mock API response: pack status = DEPLETED
    // TODO: Add API mock when implementing

    const serialInput = screen.getByTestId("pack-serial-input");
    await user.type(serialInput, "000112345670123456789012");
    await user.tab();

    // THEN: Error message is displayed
    await waitFor(() => {
      expect(screen.getByTestId("pack-validation-error")).toHaveTextContent(
        "Pack not available (DEPLETED)",
      );
    });
  });

  it("10-5-COMPONENT-010: [P1] should show error for pack not in inventory", async () => {
    // GIVEN: AddBinModal with pack that doesn't exist
    // WHEN: User scans serial for non-existent pack
    const { AddBinModal } =
      await import("@/components/shift-closing/AddBinModal");
    const user = userEvent.setup();
    renderWithProviders(<AddBinModal {...defaultProps} />);

    // Mock API response: pack not found
    // TODO: Add API mock when implementing

    const serialInput = screen.getByTestId("pack-serial-input");
    await user.type(serialInput, "000112345670123456789012");
    await user.tab();

    // THEN: Error message is displayed
    await waitFor(() => {
      expect(screen.getByTestId("pack-validation-error")).toHaveTextContent(
        "Pack not found in inventory. Receive it first.",
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AC-4: Successful Pack Validation (P2)
  // ═══════════════════════════════════════════════════════════════════════════

  it("10-5-COMPONENT-011: [P2] should display pack information after valid scan", async () => {
    // GIVEN: AddBinModal with valid pack scan
    // WHEN: Pack validation succeeds
    const { AddBinModal } =
      await import("@/components/shift-closing/AddBinModal");
    const user = userEvent.setup();
    renderWithProviders(<AddBinModal {...defaultProps} />);

    // Mock API response: valid pack
    // TODO: Add API mock when implementing

    const serialInput = screen.getByTestId("pack-serial-input");
    await user.type(serialInput, "000112345670123456789012");
    await user.tab();

    // THEN: Pack information is displayed
    await waitFor(() => {
      expect(screen.getByTestId("pack-info")).toBeInTheDocument();
      expect(screen.getByTestId("pack-number")).toHaveTextContent("1234567");
      expect(screen.getByTestId("pack-status")).toHaveTextContent("Available");
      expect(screen.getByTestId("pack-starting-serial")).toHaveTextContent(
        "001",
      );
    });
  });

  it("10-5-COMPONENT-012: [P2] should enable Add Bin button when pack is validated", async () => {
    // GIVEN: AddBinModal with valid pack
    // WHEN: Pack validation completes successfully
    const { AddBinModal } =
      await import("@/components/shift-closing/AddBinModal");
    const user = userEvent.setup();
    renderWithProviders(<AddBinModal {...defaultProps} />);

    // Mock API response: valid pack
    // TODO: Add API mock when implementing

    const serialInput = screen.getByTestId("pack-serial-input");
    await user.type(serialInput, "000112345670123456789012");
    await user.tab();

    // THEN: Add Bin button is enabled
    await waitFor(() => {
      const addBinButton = screen.getByTestId("add-bin-submit-button");
      expect(addBinButton).toBeEnabled();
    });
  });

  it("10-5-COMPONENT-013: [P2] should disable Add Bin button when pack is not validated", async () => {
    // GIVEN: AddBinModal without valid pack
    // WHEN: Modal is opened
    const { AddBinModal } =
      await import("@/components/shift-closing/AddBinModal");
    renderWithProviders(<AddBinModal {...defaultProps} />);

    // THEN: Add Bin button is disabled
    const addBinButton = screen.getByTestId("add-bin-submit-button");
    expect(addBinButton).toBeDisabled();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AC-5: Save New Bin (P0) - Component Integration
  // ═══════════════════════════════════════════════════════════════════════════

  it("10-5-COMPONENT-014: [P0] should call onBinCreated after successful bin creation", async () => {
    // GIVEN: AddBinModal with valid pack
    // WHEN: User clicks Add Bin button
    const { AddBinModal } =
      await import("@/components/shift-closing/AddBinModal");
    const user = userEvent.setup();
    renderWithProviders(<AddBinModal {...defaultProps} />);

    // Mock API responses: pack validation + bin creation
    // TODO: Add API mocks when implementing

    const serialInput = screen.getByTestId("pack-serial-input");
    await user.type(serialInput, "000112345670123456789012");
    await user.tab();

    await waitFor(() => {
      expect(screen.getByTestId("add-bin-submit-button")).toBeEnabled();
    });

    const addBinButton = screen.getByTestId("add-bin-submit-button");
    await user.click(addBinButton);

    // THEN: onBinCreated callback is called with new bin data
    await waitFor(() => {
      expect(mockOnBinCreated).toHaveBeenCalledTimes(1);
      expect(mockOnBinCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          bin_id: expect.any(String),
          name: "Bin 4",
        }),
      );
    });
  });

  it("10-5-COMPONENT-015: [P0] should close modal after successful bin creation", async () => {
    // GIVEN: AddBinModal with valid pack
    // WHEN: Bin is created successfully
    const { AddBinModal } =
      await import("@/components/shift-closing/AddBinModal");
    const user = userEvent.setup();
    renderWithProviders(<AddBinModal {...defaultProps} />);

    // Mock API responses
    // TODO: Add API mocks when implementing

    const serialInput = screen.getByTestId("pack-serial-input");
    await user.type(serialInput, "000112345670123456789012");
    await user.tab();

    await waitFor(() => {
      expect(screen.getByTestId("add-bin-submit-button")).toBeEnabled();
    });

    const addBinButton = screen.getByTestId("add-bin-submit-button");
    await user.click(addBinButton);

    // THEN: Modal is closed (onOpenChange called with false)
    await waitFor(() => {
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AC-6: Bin Location (Optional) (P3)
  // ═══════════════════════════════════════════════════════════════════════════

  it("10-5-COMPONENT-016: [P3] should have optional location text field", async () => {
    // GIVEN: AddBinModal is open
    // WHEN: Modal is rendered
    const { AddBinModal } =
      await import("@/components/shift-closing/AddBinModal");
    renderWithProviders(<AddBinModal {...defaultProps} />);

    // THEN: Location field is present
    const locationInput = screen.getByTestId("bin-location-input");
    expect(locationInput).toBeInTheDocument();
    expect(locationInput).toHaveAttribute("type", "text");
  });

  it("10-5-COMPONENT-017: [P3] should save location to bin when provided", async () => {
    // GIVEN: AddBinModal with location entered
    // WHEN: User enters location and creates bin
    const { AddBinModal } =
      await import("@/components/shift-closing/AddBinModal");
    const user = userEvent.setup();
    renderWithProviders(<AddBinModal {...defaultProps} />);

    // Mock API responses
    // TODO: Add API mocks when implementing

    const locationInput = screen.getByTestId("bin-location-input");
    await user.type(locationInput, "Front Counter");

    const serialInput = screen.getByTestId("pack-serial-input");
    await user.type(serialInput, "000112345670123456789012");
    await user.tab();

    await waitFor(() => {
      expect(screen.getByTestId("add-bin-submit-button")).toBeEnabled();
    });

    const addBinButton = screen.getByTestId("add-bin-submit-button");
    await user.click(addBinButton);

    // THEN: Location is included in bin creation
    await waitFor(() => {
      expect(mockOnBinCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          location: "Front Counter",
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════

  it("10-5-COMPONENT-018: [P2] should handle cancel button click", async () => {
    // GIVEN: AddBinModal is open
    // WHEN: User clicks cancel button
    const { AddBinModal } =
      await import("@/components/shift-closing/AddBinModal");
    const user = userEvent.setup();
    renderWithProviders(<AddBinModal {...defaultProps} />);

    const cancelButton = screen.getByTestId("add-bin-cancel-button");
    await user.click(cancelButton);

    // THEN: Modal is closed
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("10-5-COMPONENT-019: [P2] should reset form when modal reopens", async () => {
    // GIVEN: AddBinModal was used and closed
    // WHEN: Modal is reopened
    const { AddBinModal } =
      await import("@/components/shift-closing/AddBinModal");
    const { rerender } = renderWithProviders(
      <AddBinModal {...defaultProps} open={true} />,
    );

    // Enter data and close
    const user = userEvent.setup();
    const serialInput = screen.getByTestId("pack-serial-input");
    await user.type(serialInput, "000112345670123456789012");

    rerender(<AddBinModal {...defaultProps} open={false} />);
    rerender(<AddBinModal {...defaultProps} open={true} />);

    // THEN: Form is reset (serial input is empty)
    const newSerialInput = screen.getByTestId("pack-serial-input");
    expect(newSerialInput).toHaveValue("");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS (Mandatory - Applied Automatically)
  // ═══════════════════════════════════════════════════════════════════════════

  it("10-5-COMPONENT-SEC-001: [P0] should sanitize XSS payload in location field", async () => {
    // GIVEN: AddBinModal is open
    // AND: User enters XSS payload in location field
    const { AddBinModal } =
      await import("@/components/shift-closing/AddBinModal");
    const user = userEvent.setup();
    renderWithProviders(<AddBinModal {...defaultProps} />);

    const xssPayload = "<script>alert('xss')</script>";
    const locationInput = screen.getByTestId("bin-location-input");
    await user.type(locationInput, xssPayload);

    // THEN: XSS payload is stored but React will escape it on render
    // (XSS prevention is automatic in React - we verify it doesn't break the component)
    expect(locationInput).toHaveValue(xssPayload);
    // Component should not crash or execute script
    expect(screen.getByTestId("add-bin-modal")).toBeInTheDocument();
  });

  it("10-5-COMPONENT-SEC-002: [P0] should prevent script injection in serial input", async () => {
    // GIVEN: AddBinModal is open
    // AND: User attempts to inject script in serial field
    const { AddBinModal } =
      await import("@/components/shift-closing/AddBinModal");
    const user = userEvent.setup();
    renderWithProviders(<AddBinModal {...defaultProps} />);

    const maliciousInput = "<script>alert('xss')</script>";
    const serialInput = screen.getByTestId("pack-serial-input");
    await user.type(serialInput, maliciousInput);

    // THEN: Input validation should reject non-numeric characters
    // (Zod schema requires exactly 24 digits)
    expect(serialInput).toHaveValue(maliciousInput);
    // Form validation should prevent submission
    const addBinButton = screen.getByTestId("add-bin-submit-button");
    expect(addBinButton).toBeDisabled();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INPUT VALIDATION EDGE CASES (Applied Automatically)
  // ═══════════════════════════════════════════════════════════════════════════

  it("10-5-COMPONENT-EDGE-001: [P1] should reject serial input with less than 24 digits", async () => {
    // GIVEN: AddBinModal is open
    // WHEN: User enters serial with 23 digits
    const { AddBinModal } =
      await import("@/components/shift-closing/AddBinModal");
    const user = userEvent.setup();
    renderWithProviders(<AddBinModal {...defaultProps} />);

    const serialInput = screen.getByTestId("pack-serial-input");
    await user.type(serialInput, "00011234567012345678901"); // 23 digits
    await user.tab(); // Trigger validation

    // THEN: Validation error is shown
    await waitFor(() => {
      expect(
        screen.getByText(/must be exactly 24 numeric digits/i),
      ).toBeInTheDocument();
    });
    const addBinButton = screen.getByTestId("add-bin-submit-button");
    expect(addBinButton).toBeDisabled();
  });

  it("10-5-COMPONENT-EDGE-002: [P1] should reject serial input with more than 24 digits", async () => {
    // GIVEN: AddBinModal is open
    // WHEN: User enters serial with 25 digits (maxLength should prevent this)
    const { AddBinModal } =
      await import("@/components/shift-closing/AddBinModal");
    const user = userEvent.setup();
    renderWithProviders(<AddBinModal {...defaultProps} />);

    const serialInput = screen.getByTestId("pack-serial-input");
    // maxLength="24" should prevent typing more than 24 characters
    await user.type(serialInput, "0001123456701234567890123"); // 25 digits

    // THEN: Input is truncated to 24 characters
    expect(serialInput).toHaveValue("000112345670123456789012");
    expect(serialInput).toHaveAttribute("maxLength", "24");
  });

  it("10-5-COMPONENT-EDGE-003: [P1] should reject serial input with non-numeric characters", async () => {
    // GIVEN: AddBinModal is open
    // WHEN: User enters serial with letters
    const { AddBinModal } =
      await import("@/components/shift-closing/AddBinModal");
    const user = userEvent.setup();
    renderWithProviders(<AddBinModal {...defaultProps} />);

    const serialInput = screen.getByTestId("pack-serial-input");
    await user.type(serialInput, "00011234567012345678901a"); // Contains 'a'
    await user.tab(); // Trigger validation

    // THEN: Validation error is shown
    await waitFor(() => {
      expect(
        screen.getByText(/must be exactly 24 numeric digits/i),
      ).toBeInTheDocument();
    });
  });

  it("10-5-COMPONENT-EDGE-004: [P2] should handle empty serial input gracefully", async () => {
    // GIVEN: AddBinModal is open
    // WHEN: User leaves serial input empty and tabs away
    const { AddBinModal } =
      await import("@/components/shift-closing/AddBinModal");
    const user = userEvent.setup();
    renderWithProviders(<AddBinModal {...defaultProps} />);

    const serialInput = screen.getByTestId("pack-serial-input");
    await user.click(serialInput);
    await user.tab(); // Blur without entering anything

    // THEN: No validation error shown (empty is allowed until submit)
    // AND: Add Bin button is disabled
    const addBinButton = screen.getByTestId("add-bin-submit-button");
    expect(addBinButton).toBeDisabled();
  });

  it("10-5-COMPONENT-EDGE-005: [P2] should handle very long location input", async () => {
    // GIVEN: AddBinModal is open
    // WHEN: User enters very long location (255+ characters)
    const { AddBinModal } =
      await import("@/components/shift-closing/AddBinModal");
    const user = userEvent.setup();
    renderWithProviders(<AddBinModal {...defaultProps} />);

    const longLocation = "A".repeat(300);
    const locationInput = screen.getByTestId("bin-location-input");
    await user.type(locationInput, longLocation);

    // THEN: Input accepts the value (backend will validate max length)
    expect(locationInput).toHaveValue(longLocation);
  });

  it("10-5-COMPONENT-EDGE-006: [P2] should handle special characters in location field", async () => {
    // GIVEN: AddBinModal is open
    // WHEN: User enters special characters in location
    const { AddBinModal } =
      await import("@/components/shift-closing/AddBinModal");
    const user = userEvent.setup();
    renderWithProviders(<AddBinModal {...defaultProps} />);

    const specialChars = "Front Counter #2 & Register 3";
    const locationInput = screen.getByTestId("bin-location-input");
    await user.type(locationInput, specialChars);

    // THEN: Special characters are accepted
    expect(locationInput).toHaveValue(specialChars);
  });

  it("10-5-COMPONENT-EDGE-007: [P2] should handle Unicode/emoji in location field", async () => {
    // GIVEN: AddBinModal is open
    // WHEN: User enters Unicode/emoji in location
    const { AddBinModal } =
      await import("@/components/shift-closing/AddBinModal");
    const user = userEvent.setup();
    renderWithProviders(<AddBinModal {...defaultProps} />);

    const unicodeLocation = "Front Counter 🎰 Register 2";
    const locationInput = screen.getByTestId("bin-location-input");
    await user.type(locationInput, unicodeLocation);

    // THEN: Unicode/emoji are accepted
    expect(locationInput).toHaveValue(unicodeLocation);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ENHANCED ASSERTIONS (Applied Automatically)
  // ═══════════════════════════════════════════════════════════════════════════

  it("10-5-COMPONENT-ENH-001: [P2] should have proper accessibility attributes", async () => {
    // GIVEN: AddBinModal is open
    // WHEN: Modal is rendered
    const { AddBinModal } =
      await import("@/components/shift-closing/AddBinModal");
    renderWithProviders(<AddBinModal {...defaultProps} />);

    // THEN: Form inputs have proper labels
    const serialInput = screen.getByTestId("pack-serial-input");
    expect(serialInput).toHaveAttribute("type", "text");
    expect(serialInput).toHaveAttribute("maxLength", "24");
    expect(serialInput).toHaveAttribute("autoComplete", "off");

    const locationInput = screen.getByTestId("bin-location-input");
    expect(locationInput).toHaveAttribute("type", "text");
    expect(locationInput).toHaveAttribute("autoComplete", "off");

    // Bin number display should be read-only
    const binNumberDisplay = screen.getByTestId("bin-number-display");
    expect(binNumberDisplay).toBeInTheDocument();
  });

  it("10-5-COMPONENT-ENH-002: [P2] should display loading state during pack validation", async () => {
    // GIVEN: AddBinModal is open
    // WHEN: User enters valid serial and validation is in progress
    const { AddBinModal } =
      await import("@/components/shift-closing/AddBinModal");
    const user = userEvent.setup();
    renderWithProviders(<AddBinModal {...defaultProps} />);

    const serialInput = screen.getByTestId("pack-serial-input");
    await user.type(serialInput, "000112345670123456789012");
    await user.tab(); // Trigger validation

    // THEN: Loading indicator is shown
    await waitFor(() => {
      expect(screen.getByText(/validating pack/i)).toBeInTheDocument();
    });
  });
});
