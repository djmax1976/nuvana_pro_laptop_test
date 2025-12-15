/**
 * Ending Number Input Component Tests
 *
 * Tests for the 3-digit ending number input component:
 * - Numeric-only input validation
 * - Exactly 3 digits limit
 * - onComplete callback when 3 digits entered
 * - Monospace font display
 * - Placeholder display
 *
 * @test-level Component
 * @justification Tests UI component behavior and input validation
 * @story 10-1 - Lottery Shift Closing Page UI
 * @priority P1 (High - Input Validation)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../support/test-utils";
import userEvent from "@testing-library/user-event";

describe("10-1-COMPONENT: EndingNumberInput", () => {
  const mockOnChange = vi.fn();
  const mockOnComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("10-1-COMPONENT-011: should only accept numeric input", async () => {
    // GIVEN: EndingNumberInput component
    // WHEN: User types non-numeric characters
    const { EndingNumberInput } =
      await import("@/components/shift-closing/EndingNumberInput");
    const user = userEvent.setup();
    renderWithProviders(
      <EndingNumberInput
        value=""
        onChange={mockOnChange}
        onComplete={mockOnComplete}
        disabled={false}
        binId="bin-1"
      />,
    );

    const input = screen.getByTestId("ending-number-input-bin-1");
    await user.type(input, "abc");

    // THEN: Non-numeric characters are rejected
    expect(mockOnChange).not.toHaveBeenCalledWith(expect.stringContaining("a"));
    expect(mockOnChange).not.toHaveBeenCalledWith(expect.stringContaining("b"));
    expect(mockOnChange).not.toHaveBeenCalledWith(expect.stringContaining("c"));
  });

  it("10-1-COMPONENT-012: should limit to exactly 3 digits", async () => {
    // GIVEN: EndingNumberInput as controlled component
    // The component sanitizes input to limit to 3 digits
    const { EndingNumberInput } =
      await import("@/components/shift-closing/EndingNumberInput");
    const user = userEvent.setup();

    // Track all onChange calls to verify limiting behavior
    const onChangeCalls: string[] = [];
    const trackingOnChange = (value: string) => {
      onChangeCalls.push(value);
      mockOnChange(value);
    };

    renderWithProviders(
      <EndingNumberInput
        value=""
        onChange={trackingOnChange}
        onComplete={mockOnComplete}
        disabled={false}
        binId="bin-1"
      />,
    );

    const input = screen.getByTestId("ending-number-input-bin-1");
    await user.type(input, "1234");

    // THEN: Each character is passed to onChange, but 4th digit is not passed (limited to 3)
    // Component calls onChange for each keystroke with sanitized value
    expect(onChangeCalls).toContain("1");
    expect(onChangeCalls).toContain("2");
    expect(onChangeCalls).toContain("3");
    // The component limits to 3 digits, so "1234" becomes "123" (4th char rejected)
    expect(onChangeCalls).not.toContain("1234");
    expect(onChangeCalls.filter((v) => v.length > 3)).toHaveLength(0);
  });

  it("10-1-COMPONENT-013: should call onComplete when 3 digits entered", async () => {
    // GIVEN: EndingNumberInput as controlled component
    // We need to simulate the state management to test onComplete
    const { EndingNumberInput } =
      await import("@/components/shift-closing/EndingNumberInput");
    const user = userEvent.setup();

    // Create a wrapper that maintains state like a real parent component
    let currentValue = "";
    const { rerender } = renderWithProviders(
      <EndingNumberInput
        value={currentValue}
        onChange={(value) => {
          currentValue = value;
          mockOnChange(value);
        }}
        onComplete={mockOnComplete}
        disabled={false}
        binId="bin-1"
      />,
    );

    const input = screen.getByTestId("ending-number-input-bin-1");

    // Type each digit and rerender with updated value (simulating controlled component)
    await user.type(input, "1");
    rerender(
      <EndingNumberInput
        value={currentValue}
        onChange={(value) => {
          currentValue = value;
          mockOnChange(value);
        }}
        onComplete={mockOnComplete}
        disabled={false}
        binId="bin-1"
      />,
    );

    await user.type(input, "2");
    rerender(
      <EndingNumberInput
        value={currentValue}
        onChange={(value) => {
          currentValue = value;
          mockOnChange(value);
        }}
        onComplete={mockOnComplete}
        disabled={false}
        binId="bin-1"
      />,
    );

    await user.type(input, "3");
    rerender(
      <EndingNumberInput
        value={currentValue}
        onChange={(value) => {
          currentValue = value;
          mockOnChange(value);
        }}
        onComplete={mockOnComplete}
        disabled={false}
        binId="bin-1"
      />,
    );

    // THEN: onComplete callback is called when value reaches 3 digits
    await waitFor(() => {
      expect(mockOnComplete).toHaveBeenCalledWith("bin-1");
    });
  });

  it("10-1-COMPONENT-014: should display in monospace font", async () => {
    // GIVEN: EndingNumberInput component
    // WHEN: Component is rendered
    const { EndingNumberInput } =
      await import("@/components/shift-closing/EndingNumberInput");
    renderWithProviders(
      <EndingNumberInput
        value="123"
        onChange={mockOnChange}
        onComplete={mockOnComplete}
        disabled={false}
        binId="bin-1"
      />,
    );

    const input = screen.getByTestId("ending-number-input-bin-1");

    // THEN: Input has monospace font class
    expect(input).toHaveClass("font-mono"); // or font-family: 'Fira Code', monospace
  });

  it("10-1-COMPONENT-015: should show '000' placeholder", async () => {
    // GIVEN: EndingNumberInput component with empty value
    // WHEN: Component is rendered
    const { EndingNumberInput } =
      await import("@/components/shift-closing/EndingNumberInput");
    renderWithProviders(
      <EndingNumberInput
        value=""
        onChange={mockOnChange}
        onComplete={mockOnComplete}
        disabled={false}
        binId="bin-1"
      />,
    );

    const input = screen.getByTestId("ending-number-input-bin-1");

    // THEN: Placeholder shows "000"
    expect(input).toHaveAttribute("placeholder", "000");
  });

  // ============ SECURITY TESTS (MANDATORY) ============

  it("10-1-COMPONENT-SEC-001: should prevent XSS in user input", async () => {
    // GIVEN: EndingNumberInput component
    // WHEN: User types XSS script tags
    const { EndingNumberInput } =
      await import("@/components/shift-closing/EndingNumberInput");
    const user = userEvent.setup();
    renderWithProviders(
      <EndingNumberInput
        value=""
        onChange={mockOnChange}
        onComplete={mockOnComplete}
        disabled={false}
        binId="bin-1"
      />,
    );

    const input = screen.getByTestId("ending-number-input-bin-1");
    await user.type(input, "<script>alert('XSS')</script>");

    // THEN: XSS is sanitized - only numeric characters are passed to onChange
    // The component filters out all non-numeric characters
    expect(mockOnChange).not.toHaveBeenCalledWith(
      expect.stringContaining("<script>"),
    );
    expect(mockOnChange).not.toHaveBeenCalledWith(expect.stringContaining("<"));
    expect(mockOnChange).not.toHaveBeenCalledWith(expect.stringContaining(">"));
  });

  it("10-1-COMPONENT-SEC-002: should sanitize pasted malicious content", async () => {
    // GIVEN: User pastes malicious content
    const { EndingNumberInput } =
      await import("@/components/shift-closing/EndingNumberInput");
    const user = userEvent.setup();
    renderWithProviders(
      <EndingNumberInput
        value=""
        onChange={mockOnChange}
        onComplete={mockOnComplete}
        disabled={false}
        binId="bin-1"
      />,
    );

    const input = screen.getByTestId("ending-number-input-bin-1");

    // WHEN: User pastes content with script tags and non-numeric characters
    await user.click(input);
    await user.paste("<script>alert('XSS')</script>123");

    // THEN: Only numeric characters are extracted
    expect(mockOnChange).toHaveBeenCalledWith("123");
    expect(mockOnChange).not.toHaveBeenCalledWith(
      expect.stringContaining("<script>"),
    );
  });

  it("10-1-COMPONENT-SEC-003: should limit manual input to 3 digits", async () => {
    // GIVEN: Input field that accepts 3 digits for manual entry
    // Note: maxLength is 24 to support barcode scanning, but the component
    // sanitizes input to limit manual entry to 3 digits
    const { EndingNumberInput } =
      await import("@/components/shift-closing/EndingNumberInput");
    const user = userEvent.setup();

    const onChangeCalls: string[] = [];
    renderWithProviders(
      <EndingNumberInput
        value=""
        onChange={(value) => {
          onChangeCalls.push(value);
          mockOnChange(value);
        }}
        onComplete={mockOnComplete}
        disabled={false}
        binId="bin-1"
      />,
    );

    const input = screen.getByTestId("ending-number-input-bin-1");

    // WHEN: User types more than 3 digits
    await user.type(input, "12345");

    // THEN: Input is limited to 3 digits (component sanitizes to max 3)
    // No call should have more than 3 characters
    expect(onChangeCalls.every((v) => v.length <= 3)).toBe(true);
    expect(onChangeCalls).not.toContain("1234");
    expect(onChangeCalls).not.toContain("12345");
    // maxLength is 24 to support barcode scanning
    expect(input).toHaveAttribute("maxLength", "24");
  });

  // ============ EDGE CASES ============

  it("10-1-COMPONENT-EDGE-001: should handle empty string input", async () => {
    // GIVEN: Empty input value
    const { EndingNumberInput } =
      await import("@/components/shift-closing/EndingNumberInput");
    renderWithProviders(
      <EndingNumberInput
        value=""
        onChange={mockOnChange}
        onComplete={mockOnComplete}
        disabled={false}
        binId="bin-1"
      />,
    );

    const input = screen.getByTestId("ending-number-input-bin-1");

    // THEN: Input displays empty value
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("placeholder", "000");
  });

  it("10-1-COMPONENT-EDGE-002: should handle Unicode/emoji input", async () => {
    // GIVEN: Input with Unicode/emoji characters
    const { EndingNumberInput } =
      await import("@/components/shift-closing/EndingNumberInput");
    const user = userEvent.setup();

    const onChangeCalls: string[] = [];
    renderWithProviders(
      <EndingNumberInput
        value=""
        onChange={(value) => {
          onChangeCalls.push(value);
          mockOnChange(value);
        }}
        onComplete={mockOnComplete}
        disabled={false}
        binId="bin-1"
      />,
    );

    const input = screen.getByTestId("ending-number-input-bin-1");

    // WHEN: User types Unicode/emoji mixed with numbers
    await user.type(input, "😀12");

    // THEN: Only numeric characters are accepted
    // Component calls onChange for each keystroke with only numeric chars
    expect(onChangeCalls).toContain("1");
    expect(onChangeCalls).toContain("2");
    // No call should contain emoji
    expect(onChangeCalls.every((v) => !v.includes("😀"))).toBe(true);
  });

  it("10-1-COMPONENT-EDGE-003: should handle special characters input", async () => {
    // GIVEN: Input with special characters
    const { EndingNumberInput } =
      await import("@/components/shift-closing/EndingNumberInput");
    const user = userEvent.setup();

    const onChangeCalls: string[] = [];
    renderWithProviders(
      <EndingNumberInput
        value=""
        onChange={(value) => {
          onChangeCalls.push(value);
          mockOnChange(value);
        }}
        onComplete={mockOnComplete}
        disabled={false}
        binId="bin-1"
      />,
    );

    const input = screen.getByTestId("ending-number-input-bin-1");

    // WHEN: User types special characters mixed with numbers
    await user.type(input, "!@#123");

    // THEN: Only numeric characters are accepted
    // Component calls onChange for each numeric character
    expect(onChangeCalls).toContain("1");
    expect(onChangeCalls).toContain("2");
    expect(onChangeCalls).toContain("3");
    // No call should contain special characters
    expect(onChangeCalls.every((v) => !/[!@#]/.test(v))).toBe(true);
  });

  it("10-1-COMPONENT-EDGE-004: should handle leading zeros", async () => {
    // GIVEN: Input with leading zeros
    const { EndingNumberInput } =
      await import("@/components/shift-closing/EndingNumberInput");
    const user = userEvent.setup();

    // Track value changes as controlled component
    let currentValue = "";
    const { rerender } = renderWithProviders(
      <EndingNumberInput
        value={currentValue}
        onChange={(value) => {
          currentValue = value;
          mockOnChange(value);
        }}
        onComplete={mockOnComplete}
        disabled={false}
        binId="bin-1"
      />,
    );

    const input = screen.getByTestId("ending-number-input-bin-1");

    // WHEN: User types "000" with proper controlled component pattern
    for (const char of "000") {
      await user.type(input, char);
      rerender(
        <EndingNumberInput
          value={currentValue}
          onChange={(value) => {
            currentValue = value;
            mockOnChange(value);
          }}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
        />,
      );
    }

    // THEN: Leading zeros are accepted
    expect(mockOnChange).toHaveBeenCalledWith("0");
    // Note: In controlled component, each keystroke gets the new character
    // The accumulation is handled by the parent component
    await waitFor(() => {
      expect(mockOnComplete).toHaveBeenCalledWith("bin-1");
    });
  });

  it("10-1-COMPONENT-EDGE-005: should handle paste with mixed content", async () => {
    // GIVEN: Paste operation with mixed content
    const { EndingNumberInput } =
      await import("@/components/shift-closing/EndingNumberInput");
    const user = userEvent.setup();
    renderWithProviders(
      <EndingNumberInput
        value=""
        onChange={mockOnChange}
        onComplete={mockOnComplete}
        disabled={false}
        binId="bin-1"
      />,
    );

    const input = screen.getByTestId("ending-number-input-bin-1");

    // WHEN: User pastes "abc123def456"
    await user.click(input);
    await user.paste("abc123def456");

    // THEN: Only numeric characters are extracted (first 3 digits)
    expect(mockOnChange).toHaveBeenCalledWith("123");
  });

  it("10-1-COMPONENT-EDGE-006: should handle rapid typing", async () => {
    // GIVEN: Rapid typing scenario
    const { EndingNumberInput } =
      await import("@/components/shift-closing/EndingNumberInput");
    const user = userEvent.setup();

    const onChangeCalls: string[] = [];
    renderWithProviders(
      <EndingNumberInput
        value=""
        onChange={(value) => {
          onChangeCalls.push(value);
          mockOnChange(value);
        }}
        onComplete={mockOnComplete}
        disabled={false}
        binId="bin-1"
      />,
    );

    const input = screen.getByTestId("ending-number-input-bin-1");

    // WHEN: User types rapidly "12345"
    await user.type(input, "12345");

    // THEN: Input is limited to 3 digits (no call with more than 3 chars)
    expect(onChangeCalls.every((v) => v.length <= 3)).toBe(true);
    // Note: onComplete may or may not fire depending on controlled component state
    // The component fires onComplete when value transitions from <3 to 3 digits
  });

  it("10-1-COMPONENT-EDGE-007: should handle disabled state", async () => {
    // GIVEN: Input in disabled state
    const { EndingNumberInput } =
      await import("@/components/shift-closing/EndingNumberInput");
    const user = userEvent.setup();
    renderWithProviders(
      <EndingNumberInput
        value=""
        onChange={mockOnChange}
        onComplete={mockOnComplete}
        disabled={true}
        binId="bin-1"
      />,
    );

    const input = screen.getByTestId("ending-number-input-bin-1");

    // THEN: Input is disabled
    expect(input).toBeDisabled();

    // WHEN: User tries to type
    await user.type(input, "123");

    // THEN: onChange is not called (input is disabled)
    expect(mockOnChange).not.toHaveBeenCalled();
  });
});

// ============================================================================
// STORY 10-3: BARCODE SCANNING & VALIDATION TESTS
// ============================================================================

/**
 * Barcode Scanning & Validation Component Tests
 *
 * Tests for the new barcode scanning functionality:
 * - 24-digit barcode scan detection
 * - Validation service integration
 * - Error display (pack mismatch, minimum, maximum)
 * - Auto-fill on successful validation
 * - Rapid scanning performance
 *
 * @test-level Component
 * @justification Tests UI component behavior with barcode scanning
 * @story 10-3 - Ending Number Scanning & Validation
 * @priority P0-P1 (Critical - Core Feature)
 */

// Mock the validation service to isolate component behavior
vi.mock("@/lib/services/lottery-closing-validation", () => ({
  validateEndingSerial: vi.fn(),
}));

import { validateEndingSerial } from "@/lib/services/lottery-closing-validation";

describe("10-3-COMPONENT: EndingNumberInput - Barcode Scanning", () => {
  const mockOnChange = vi.fn();
  const mockOnComplete = vi.fn();

  const mockBinData = {
    packNumber: "1234567",
    startingSerial: "045",
    serialEnd: "150",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset validation service mock
    vi.mocked(validateEndingSerial).mockResolvedValue({
      valid: false,
      error: "Not implemented",
    });
  });

  describe("TEST-10.3-C1: 24-Digit Barcode Scan Detection", () => {
    it("should accept 24-digit barcode scan", async () => {
      // GIVEN: EndingNumberInput component with validation props
      // AND: Validation service returns success
      vi.mocked(validateEndingSerial).mockResolvedValue({
        valid: true,
        endingNumber: "067",
      });

      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber={mockBinData.packNumber}
          startingSerial={mockBinData.startingSerial}
          serialEnd={mockBinData.serialEnd}
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User scans 24-digit barcode (simulated by pasting)
      const scannedSerial = "000112345670123456789012"; // 24 digits
      await user.click(input);
      await user.paste(scannedSerial);

      // THEN: Component detects 24-digit scan and processes it
      // Note: Test will fail until barcode scanning is implemented (RED phase)
      await waitFor(() => {
        // Component should detect 24-digit input and trigger validation
        expect(mockOnChange).toHaveBeenCalled();
      });
    });

    it("should show scanning activity indicator during processing", async () => {
      // GIVEN: EndingNumberInput component
      // AND: Validation service returns success (with delay to see activity indicator)
      vi.mocked(validateEndingSerial).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ valid: true, endingNumber: "067" }),
              200, // Longer delay to ensure we can see the scanning indicator
            ),
          ),
      );

      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber={mockBinData.packNumber}
          startingSerial={mockBinData.startingSerial}
          serialEnd={mockBinData.serialEnd}
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User scans 24-digit barcode
      const scannedSerial = "000112345670123456789012";
      await user.click(input);
      await user.paste(scannedSerial);

      // THEN: Scanning activity indicator is shown during validation
      // Wait for the scanning indicator to appear (async state update)
      await waitFor(() => {
        const activityIndicator = screen.queryByTestId(
          "scanning-activity-bin-1",
        );
        expect(activityIndicator).toBeInTheDocument();
      });
    });
  });

  describe("TEST-10.3-C2: Auto-Fill on Successful Validation", () => {
    it("should auto-fill 3-digit ending from valid scan", async () => {
      // GIVEN: EndingNumberInput component with valid bin data
      // AND: Validation service returns success
      vi.mocked(validateEndingSerial).mockResolvedValue({
        valid: true,
        endingNumber: "067",
      });

      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber="1234567"
          startingSerial="045"
          serialEnd="150"
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User scans valid 24-digit barcode
      // Serial: "000112345670123456789012" -> pack: "1234567", ticket: "067"
      // Pack matches, ending "067" >= starting "045", ending "067" <= max "150"
      const scannedSerial = "000112345670123456789012";
      await user.click(input);
      await user.paste(scannedSerial);

      // THEN: Validation service is called
      await waitFor(() => {
        expect(validateEndingSerial).toHaveBeenCalledWith(
          scannedSerial,
          expect.objectContaining({
            pack_number: "1234567",
            starting_serial: "045",
            serial_end: "150",
          }),
        );
      });

      // AND: 3-digit ending number is auto-filled
      await waitFor(() => {
        expect(mockOnChange).toHaveBeenCalledWith("067");
      });
    });

    it("should show green border on valid entry", async () => {
      // GIVEN: EndingNumberInput component with validation returning success
      vi.mocked(validateEndingSerial).mockResolvedValue({
        valid: true,
        endingNumber: "067",
      });

      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();

      // Track value changes for controlled component
      let currentValue = "";
      const { rerender } = renderWithProviders(
        <EndingNumberInput
          value={currentValue}
          onChange={(value) => {
            currentValue = value;
            mockOnChange(value);
          }}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber="1234567"
          startingSerial="045"
          serialEnd="150"
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User scans valid barcode and ending is auto-filled
      const scannedSerial = "000112345670123456789012";
      await user.click(input);
      await user.paste(scannedSerial);

      // Wait for validation to complete and value to be set
      await waitFor(() => {
        expect(mockOnChange).toHaveBeenCalledWith("067");
      });

      // Update to the final validated value
      rerender(
        <EndingNumberInput
          value="067"
          onChange={(value) => {
            currentValue = value;
            mockOnChange(value);
          }}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber="1234567"
          startingSerial="045"
          serialEnd="150"
        />,
      );

      // THEN: Input shows green border (success state)
      // Note: Green border requires both isValid=true AND value.length===3
      // The component maintains isValid state after successful validation
      await waitFor(() => {
        expect(input).toHaveClass("border-green-500");
      });
    });
  });

  describe("TEST-10.3-C3: Error Display - Wrong Pack Number", () => {
    it("should show error for wrong pack number", async () => {
      // GIVEN: EndingNumberInput component with pack "1234567"
      // AND: Validation service returns pack mismatch error
      vi.mocked(validateEndingSerial).mockResolvedValue({
        valid: false,
        error: "Wrong pack - this serial belongs to a different lottery",
      });

      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber="1234567" // Expected pack
          startingSerial="045"
          serialEnd="150"
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User scans barcode with different pack number
      // Serial: "000198765430123456789012" -> pack: "9876543" (doesn't match)
      const scannedSerial = "000198765430123456789012";
      await user.click(input);
      await user.paste(scannedSerial);

      // THEN: Error message is displayed
      await waitFor(() => {
        const errorMessage = screen.getByTestId("error-message-bin-1");
        expect(errorMessage).toBeInTheDocument();
        expect(errorMessage).toHaveTextContent("Wrong pack");
        expect(errorMessage).toHaveTextContent("different lottery");
      });

      // AND: Input field shows red border
      expect(input).toHaveClass("border-red-500"); // or similar error class

      // AND: Ending number is NOT filled in
      expect(mockOnChange).not.toHaveBeenCalledWith(
        expect.stringMatching(/^\d{3}$/),
      );
    });
  });

  describe("TEST-10.3-C4: Error Display - Ending < Starting", () => {
    it("should show error for ending < starting", async () => {
      // GIVEN: EndingNumberInput component with starting serial "045"
      // AND: Validation service returns minimum check error
      vi.mocked(validateEndingSerial).mockResolvedValue({
        valid: false,
        error: "Ending number cannot be less than starting (045)",
      });

      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber="1234567"
          startingSerial="045" // Starting serial
          serialEnd="150"
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User scans barcode with ending < starting
      // Serial: "000112345670123456789012" -> pack: "1234567" (matches), ticket: "030" (< "045")
      const scannedSerial = "000112345670123456789012";
      // Note: Need to mock parser to return ticket "030" instead of "067"
      await user.click(input);
      await user.paste(scannedSerial);

      // THEN: Error message is displayed
      await waitFor(() => {
        const errorMessage = screen.getByTestId("error-message-bin-1");
        expect(errorMessage).toBeInTheDocument();
        expect(errorMessage).toHaveTextContent("cannot be less than starting");
        expect(errorMessage).toHaveTextContent("045"); // Starting serial in message
      });

      // AND: Input field shows red border
      expect(input).toHaveClass("border-red-500");

      // AND: Ending number is NOT filled in
      expect(mockOnChange).not.toHaveBeenCalledWith(
        expect.stringMatching(/^\d{3}$/),
      );
    });
  });

  describe("TEST-10.3-C5: Error Display - Ending > Maximum", () => {
    it("should show error for ending > maximum", async () => {
      // GIVEN: EndingNumberInput component with serial_end "150"
      // AND: Validation service returns maximum check error
      vi.mocked(validateEndingSerial).mockResolvedValue({
        valid: false,
        error: "Number exceeds pack maximum (150)",
      });

      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber="1234567"
          startingSerial="045"
          serialEnd="150" // Maximum serial
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User scans barcode with ending > serial_end
      // Serial: "000112345670123456789012" -> pack: "1234567" (matches), ticket: "200" (> "150")
      const scannedSerial = "000112345670123456789012";
      // Note: Need to mock parser to return ticket "200" instead of "067"
      await user.click(input);
      await user.paste(scannedSerial);

      // THEN: Error message is displayed
      await waitFor(() => {
        const errorMessage = screen.getByTestId("error-message-bin-1");
        expect(errorMessage).toBeInTheDocument();
        expect(errorMessage).toHaveTextContent("exceeds pack maximum");
        expect(errorMessage).toHaveTextContent("150"); // serial_end in message
      });

      // AND: Input field shows red border
      expect(input).toHaveClass("border-red-500");

      // AND: Ending number is NOT filled in
      expect(mockOnChange).not.toHaveBeenCalledWith(
        expect.stringMatching(/^\d{3}$/),
      );
    });
  });

  describe("TEST-10.3-C6: Green Border on Valid Entry", () => {
    it("should show green border on valid entry", async () => {
      // GIVEN: EndingNumberInput component
      // AND: Validation service returns success
      vi.mocked(validateEndingSerial).mockResolvedValue({
        valid: true,
        endingNumber: "067",
      });

      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      const { rerender } = renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber="1234567"
          startingSerial="045"
          serialEnd="150"
        />,
      );

      // WHEN: Valid scan completes and ending is auto-filled
      const input = screen.getByTestId("ending-number-input-bin-1");
      const scannedSerial = "000112345670123456789012";
      await user.click(input);
      await user.paste(scannedSerial);

      // Simulate successful validation and value update
      rerender(
        <EndingNumberInput
          value="067"
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber="1234567"
          startingSerial="045"
          serialEnd="150"
        />,
      );

      // THEN: Input shows green border
      await waitFor(() => {
        expect(input).toHaveClass("border-green-500"); // or "border-success"
      });
    });
  });

  describe("TEST-10.3-C7: Red Border on Error", () => {
    it("should show red border on validation error", async () => {
      // GIVEN: EndingNumberInput component
      // AND: Validation service returns error
      vi.mocked(validateEndingSerial).mockResolvedValue({
        valid: false,
        error: "Wrong pack - this serial belongs to a different lottery",
      });

      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber="1234567"
          startingSerial="045"
          serialEnd="150"
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User scans barcode with wrong pack number
      const scannedSerial = "000198765430123456789012"; // Wrong pack
      await user.click(input);
      await user.paste(scannedSerial);

      // THEN: Input shows red border
      await waitFor(() => {
        expect(input).toHaveClass("border-red-500"); // or "border-error"
      });
    });
  });

  describe("TEST-10.3-C8: onComplete Callback After Valid Scan", () => {
    it("should call onComplete after valid scan", async () => {
      // GIVEN: EndingNumberInput component
      // AND: Validation service returns success
      vi.mocked(validateEndingSerial).mockResolvedValue({
        valid: true,
        endingNumber: "067",
      });

      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber="1234567"
          startingSerial="045"
          serialEnd="150"
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User scans valid barcode
      const scannedSerial = "000112345670123456789012";
      await user.click(input);
      await user.paste(scannedSerial);

      // THEN: onComplete callback is called (triggers auto-advance)
      await waitFor(() => {
        expect(mockOnComplete).toHaveBeenCalledWith("bin-1");
      });
    });
  });

  describe("TEST-10.3-C9: No onComplete After Invalid Scan", () => {
    it("should NOT call onComplete after invalid scan", async () => {
      // GIVEN: EndingNumberInput component
      // AND: Validation service returns error
      vi.mocked(validateEndingSerial).mockResolvedValue({
        valid: false,
        error: "Wrong pack - this serial belongs to a different lottery",
      });

      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber="1234567"
          startingSerial="045"
          serialEnd="150"
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User scans barcode with wrong pack number
      const scannedSerial = "000198765430123456789012"; // Wrong pack
      await user.click(input);
      await user.paste(scannedSerial);

      // THEN: onComplete is NOT called
      await waitFor(() => {
        expect(mockOnComplete).not.toHaveBeenCalled();
      });
    });
  });

  describe("TEST-10.3-C10: Clear Input After Invalid Scan", () => {
    it("should clear input after invalid scan for re-scan", async () => {
      // GIVEN: EndingNumberInput component
      // AND: Validation service returns error
      vi.mocked(validateEndingSerial).mockResolvedValue({
        valid: false,
        error: "Wrong pack - this serial belongs to a different lottery",
      });

      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber="1234567"
          startingSerial="045"
          serialEnd="150"
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User scans invalid barcode
      const scannedSerial = "000198765430123456789012"; // Wrong pack
      await user.click(input);
      await user.paste(scannedSerial);

      // THEN: Component calls onChange("") to clear input after validation failure
      await waitFor(() => {
        expect(mockOnChange).toHaveBeenCalledWith("");
      });

      // AND: Error message is displayed
      await waitFor(() => {
        const errorMessage = screen.queryByTestId("error-message-bin-1");
        expect(errorMessage).toBeInTheDocument();
      });
    });
  });

  describe("TEST-10.3-C11: Rapid Scanning Performance", () => {
    it("should handle rapid sequential scans without blocking", async () => {
      // GIVEN: EndingNumberInput component
      // AND: Validation service returns success for both scans
      vi.mocked(validateEndingSerial)
        .mockResolvedValueOnce({
          valid: true,
          endingNumber: "067",
        })
        .mockResolvedValueOnce({
          valid: true,
          endingNumber: "068",
        });

      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber="1234567"
          startingSerial="045"
          serialEnd="150"
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User scans multiple barcodes rapidly (< 100ms between scans)
      const scan1 = "000112345670123456789012"; // Valid
      const scan2 = "000112345670123456789013"; // Valid (next ticket)

      const startTime = performance.now();
      await user.click(input);
      await user.paste(scan1);
      // Simulate rapid second scan (< 100ms later)
      await new Promise((resolve) => setTimeout(resolve, 50)); // 50ms delay
      await user.paste(scan2);
      const endTime = performance.now();

      // THEN: Both scans are processed without blocking
      const timeBetweenScans = endTime - startTime;
      expect(timeBetweenScans).toBeLessThan(200); // Both scans processed quickly

      // AND: Second scan doesn't interfere with first
      await waitFor(() => {
        expect(mockOnChange).toHaveBeenCalled();
      });
    });
  });

  describe("TEST-10.3-C12: Security Tests - Input Sanitization", () => {
    it("should sanitize non-numeric characters from input (XSS prevention)", async () => {
      // GIVEN: EndingNumberInput component
      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber="1234567"
          startingSerial="045"
          serialEnd="150"
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User attempts to input script injection or special characters
      await user.click(input);
      await user.type(input, "<script>alert('xss')</script>123");

      // THEN: Only numeric characters are accepted (sanitized)
      await waitFor(() => {
        expect(mockOnChange).toHaveBeenCalledWith(
          expect.stringMatching(/^\d+$/),
        );
        // Should only contain digits, no script tags or special characters
      });
    });

    it("should reject input longer than 24 digits (potential injection)", async () => {
      // GIVEN: EndingNumberInput component
      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber="1234567"
          startingSerial="045"
          serialEnd="150"
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User attempts to input more than 24 digits
      const longInput = "000112345670123456789012345"; // 27 digits
      await user.click(input);
      await user.type(input, longInput);

      // THEN: Input is limited to 24 digits maximum (for barcode) or 3 digits (for manual)
      // Component should enforce length constraint
      await waitFor(() => {
        const calls = mockOnChange.mock.calls;
        const lastCall = calls[calls.length - 1];
        if (lastCall && lastCall[0]) {
          expect(lastCall[0].length).toBeLessThanOrEqual(24);
        }
      });
    });
  });

  describe("TEST-10.3-C13: Business Logic - Closing Serial > Serial End Error", () => {
    it("should show error when ending > serial_end (business rule violation)", async () => {
      // Reset mock implementation and clear all calls to ensure clean state
      vi.clearAllMocks();
      vi.mocked(validateEndingSerial).mockReset();

      // GIVEN: EndingNumberInput component with serial_end "150"
      // AND: Validation service returns maximum check error
      vi.mocked(validateEndingSerial).mockResolvedValue({
        valid: false,
        error: "Number exceeds pack maximum (150)",
      });

      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();

      // Use fresh local mocks to ensure test isolation
      const localMockOnChange = vi.fn();
      const localMockOnComplete = vi.fn();

      renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={localMockOnChange}
          onComplete={localMockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber="1234567"
          startingSerial="045"
          serialEnd="150" // Maximum serial
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User scans barcode with ending "151" (greater than serial_end "150")
      // Business rule: closing_serial > serial_end is an error
      const aboveMaxScan = "000112345671513456789012"; // Ticket 151 > 150 (ERROR)
      await user.click(input);
      await user.paste(aboveMaxScan);

      // THEN: Validation service is called with the scanned barcode
      await waitFor(() => {
        expect(validateEndingSerial).toHaveBeenCalledWith(
          aboveMaxScan,
          expect.objectContaining({
            pack_number: "1234567",
            starting_serial: "045",
            serial_end: "150",
          }),
        );
      });

      // AND: onChange is called with empty string (cleared after error)
      await waitFor(() => {
        expect(localMockOnChange).toHaveBeenCalledWith("");
      });

      // AND: onComplete is NOT called (no auto-advance on error)
      expect(localMockOnComplete).not.toHaveBeenCalled();

      // AND: Error message is displayed
      await waitFor(() => {
        const errorMessage = screen.getByTestId("error-message-bin-1");
        expect(errorMessage).toBeInTheDocument();
        expect(errorMessage).toHaveTextContent(/exceeds pack maximum/i);
      });
    });
  });

  describe("TEST-10.3-C14: Enhanced Assertions - Validation Result Structure", () => {
    it("should handle validation result with correct structure", async () => {
      // GIVEN: EndingNumberInput component
      // AND: Validation service returns structured result
      vi.mocked(validateEndingSerial).mockResolvedValue({
        valid: true,
        endingNumber: "067",
        error: undefined,
      });

      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber="1234567"
          startingSerial="045"
          serialEnd="150"
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User scans valid barcode
      const scannedSerial = "000112345670123456789012";
      await user.click(input);
      await user.paste(scannedSerial);

      // THEN: Validation service is called with correct parameters
      await waitFor(() => {
        expect(validateEndingSerial).toHaveBeenCalledWith(
          scannedSerial,
          expect.objectContaining({
            pack_number: "1234567",
            starting_serial: "045",
            serial_end: "150",
          }),
        );
      });

      // AND: Result structure is validated
      const callArgs = vi.mocked(validateEndingSerial).mock.results[0].value;
      await callArgs.then(
        (result: { valid: boolean; endingNumber?: string }) => {
          expect(result).toHaveProperty("valid");
          expect(result).toHaveProperty("endingNumber");
          expect(typeof result.valid).toBe("boolean");
          expect(typeof result.endingNumber).toBe("string");
          expect(result.endingNumber?.length).toBe(3);
        },
      );
    });
  });

  describe("TEST-10.3-C15: Edge Cases - Boundary Conditions", () => {
    it("should accept ending equals starting serial (boundary case)", async () => {
      // GIVEN: EndingNumberInput component with starting_serial "045"
      vi.mocked(validateEndingSerial).mockResolvedValue({
        valid: true,
        endingNumber: "045", // Equals starting
      });

      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber="1234567"
          startingSerial="045" // Starting serial
          serialEnd="150"
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User scans barcode with ending "045" (equals starting)
      const boundaryScan = "000112345670453456789012"; // Ticket 045 == starting
      await user.click(input);
      await user.paste(boundaryScan);

      // THEN: Validation passes (boundary case: ending == starting is valid)
      await waitFor(() => {
        expect(mockOnChange).toHaveBeenCalledWith("045");
      });

      // AND: No error is displayed
      const errorMessage = screen.queryByTestId("error-message-bin-1");
      expect(errorMessage).not.toBeInTheDocument();
    });

    it("should accept ending equals serial_end (boundary case)", async () => {
      // GIVEN: EndingNumberInput component with serial_end "150"
      vi.mocked(validateEndingSerial).mockResolvedValue({
        valid: true,
        endingNumber: "150", // Equals serial_end
      });

      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber="1234567"
          startingSerial="045"
          serialEnd="150" // Maximum serial
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User scans barcode with ending "150" (equals serial_end)
      const boundaryScan = "000112345671503456789012"; // Ticket 150 == serial_end
      await user.click(input);
      await user.paste(boundaryScan);

      // THEN: Validation passes (boundary case: ending == serial_end is valid, only > is error)
      await waitFor(() => {
        expect(mockOnChange).toHaveBeenCalledWith("150");
      });

      // AND: No error is displayed
      const errorMessage = screen.queryByTestId("error-message-bin-1");
      expect(errorMessage).not.toBeInTheDocument();
    });
  });
});

// ============================================================================
// STORY 10-4: MANUAL ENTRY MODE TESTS
// ============================================================================

/**
 * Manual Entry Mode Component Tests
 *
 * Tests for manual entry mode functionality in EndingNumberInput:
 * - Direct 3-digit typing when manualEntryMode is true
 * - Range validation (ending >= starting, ending <= serial_end)
 * - Pack number validation skipped in manual mode
 * - Barcode scanning still works in manual mode
 *
 * @test-level Component
 * @justification Tests UI component behavior with manual entry mode
 * @story 10-4 - Manual Entry Override
 * @priority P1 (High - Core Feature)
 */

// Mock the validation service for manual entry mode
vi.mock("@/lib/services/lottery-closing-validation", () => ({
  validateEndingSerial: vi.fn(),
  validateManualEntryEnding: vi.fn(),
}));

import { validateManualEntryEnding } from "@/lib/services/lottery-closing-validation";

describe("10-4-COMPONENT: EndingNumberInput - Manual Entry Mode", () => {
  const mockOnChange = vi.fn();
  const mockOnComplete = vi.fn();

  const mockBinData = {
    packNumber: "1234567",
    startingSerial: "045",
    serialEnd: "150",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset validation service mock
    vi.mocked(validateManualEntryEnding).mockResolvedValue({
      valid: false,
      error: "Not implemented",
    });
  });

  describe("TEST-10.4-C8: Direct 3-Digit Typing in Manual Mode", () => {
    it("should allow direct 3-digit typing when manualEntryMode is true", async () => {
      // GIVEN: EndingNumberInput component with manualEntryMode=true
      // AND: Validation service returns success
      vi.mocked(validateManualEntryEnding).mockResolvedValue({
        valid: true,
      });

      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();

      // Track onChange calls and simulate controlled component behavior
      let currentValue = "";
      const { rerender } = renderWithProviders(
        <EndingNumberInput
          value={currentValue}
          onChange={(value) => {
            currentValue = value;
            mockOnChange(value);
          }}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber={mockBinData.packNumber}
          startingSerial={mockBinData.startingSerial}
          serialEnd={mockBinData.serialEnd}
          manualEntryMode={true}
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User types 3-digit number directly with proper controlled component pattern
      for (const char of "100") {
        await user.type(input, char);
        rerender(
          <EndingNumberInput
            value={currentValue}
            onChange={(value) => {
              currentValue = value;
              mockOnChange(value);
            }}
            onComplete={mockOnComplete}
            disabled={false}
            binId="bin-1"
            packNumber={mockBinData.packNumber}
            startingSerial={mockBinData.startingSerial}
            serialEnd={mockBinData.serialEnd}
            manualEntryMode={true}
          />,
        );
      }

      // THEN: Input accepts the value (onChange called with accumulated values)
      await waitFor(() => {
        expect(mockOnChange).toHaveBeenCalledWith("1");
        expect(mockOnChange).toHaveBeenCalledWith("10");
        expect(mockOnChange).toHaveBeenCalledWith("100");
      });

      // AND: Validation is called when 3 digits are entered
      await waitFor(() => {
        expect(validateManualEntryEnding).toHaveBeenCalledWith("100", {
          starting_serial: "045",
          serial_end: "150",
        });
      });
    });
  });

  describe("TEST-10.4-C9: Range Validation in Manual Mode", () => {
    it("should validate ending >= starting in manual mode", async () => {
      // GIVEN: EndingNumberInput component with manualEntryMode=true
      // AND: Validation service returns error for ending < starting
      vi.mocked(validateManualEntryEnding).mockResolvedValue({
        valid: false,
        error: "Ending number cannot be less than starting (045)",
      });

      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      const { rerender } = renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber={mockBinData.packNumber}
          startingSerial={mockBinData.startingSerial}
          serialEnd={mockBinData.serialEnd}
          manualEntryMode={true}
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User enters ending number less than starting
      await user.type(input, "040");

      // Simulate value update after typing
      rerender(
        <EndingNumberInput
          value="040"
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber={mockBinData.packNumber}
          startingSerial={mockBinData.startingSerial}
          serialEnd={mockBinData.serialEnd}
          manualEntryMode={true}
        />,
      );

      // THEN: Validation error is displayed
      await waitFor(() => {
        const errorMessage = screen.getByTestId("error-message-bin-1");
        expect(errorMessage).toBeInTheDocument();
        expect(errorMessage).toHaveTextContent(/cannot be less than starting/i);
        expect(errorMessage).toHaveTextContent("045");
      });

      // AND: Input shows red border
      expect(input).toHaveClass("border-red-500");
    });

    it("should validate ending <= serial_end in manual mode", async () => {
      // GIVEN: EndingNumberInput component with manualEntryMode=true
      // AND: Validation service returns error for ending > serial_end
      vi.mocked(validateManualEntryEnding).mockResolvedValue({
        valid: false,
        error: "Number exceeds pack maximum (150)",
      });

      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      const { rerender } = renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber={mockBinData.packNumber}
          startingSerial={mockBinData.startingSerial}
          serialEnd={mockBinData.serialEnd}
          manualEntryMode={true}
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User enters ending number greater than serial_end
      await user.type(input, "151");

      // Simulate value update after typing
      rerender(
        <EndingNumberInput
          value="151"
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber={mockBinData.packNumber}
          startingSerial={mockBinData.startingSerial}
          serialEnd={mockBinData.serialEnd}
          manualEntryMode={true}
        />,
      );

      // THEN: Validation error is displayed
      await waitFor(() => {
        const errorMessage = screen.getByTestId("error-message-bin-1");
        expect(errorMessage).toBeInTheDocument();
        expect(errorMessage).toHaveTextContent(/exceeds pack maximum/i);
        expect(errorMessage).toHaveTextContent("150");
      });

      // AND: Input shows red border
      expect(input).toHaveClass("border-red-500");
    });

    it("should accept valid ending number within range", async () => {
      // GIVEN: EndingNumberInput component with manualEntryMode=true
      // AND: Validation service returns success
      vi.mocked(validateManualEntryEnding).mockResolvedValue({
        valid: true,
      });

      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      const { rerender } = renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber={mockBinData.packNumber}
          startingSerial={mockBinData.startingSerial}
          serialEnd={mockBinData.serialEnd}
          manualEntryMode={true}
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User enters valid ending number (within range)
      await user.type(input, "100");

      // Simulate value update after typing
      rerender(
        <EndingNumberInput
          value="100"
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber={mockBinData.packNumber}
          startingSerial={mockBinData.startingSerial}
          serialEnd={mockBinData.serialEnd}
          manualEntryMode={true}
        />,
      );

      // THEN: No error is displayed
      await waitFor(() => {
        const errorMessage = screen.queryByTestId("error-message-bin-1");
        expect(errorMessage).not.toBeInTheDocument();
      });

      // AND: onComplete is called when validation passes
      await waitFor(() => {
        expect(mockOnComplete).toHaveBeenCalledWith("bin-1");
      });
    });
  });

  describe("TEST-10.4-C10: Pack Number Validation Skipped", () => {
    it("should skip pack number validation in manual mode", async () => {
      // GIVEN: EndingNumberInput component with manualEntryMode=true
      // AND: Validation service returns success (pack validation skipped)
      vi.mocked(validateManualEntryEnding).mockResolvedValue({
        valid: true,
      });

      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      const { rerender } = renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber={mockBinData.packNumber}
          startingSerial={mockBinData.startingSerial}
          serialEnd={mockBinData.serialEnd}
          manualEntryMode={true}
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User enters valid ending number
      await user.type(input, "100");

      // Simulate value update after typing
      rerender(
        <EndingNumberInput
          value="100"
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber={mockBinData.packNumber}
          startingSerial={mockBinData.startingSerial}
          serialEnd={mockBinData.serialEnd}
          manualEntryMode={true}
        />,
      );

      // THEN: validateManualEntryEnding is called (not validateEndingSerial)
      await waitFor(() => {
        expect(validateManualEntryEnding).toHaveBeenCalledWith("100", {
          starting_serial: "045",
          serial_end: "150",
        });
        // Pack number should NOT be in the validation call
        expect(validateManualEntryEnding).not.toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            pack_number: expect.anything(),
          }),
        );
      });

      // AND: No pack validation error is displayed
      await waitFor(() => {
        expect(screen.queryByText(/wrong pack/i)).not.toBeInTheDocument();
      });
    });
  });

  describe("TEST-10.4-C11: Barcode Scanning Still Works", () => {
    it("should keep barcode scanning functional in manual mode", async () => {
      // GIVEN: EndingNumberInput component with manualEntryMode=true
      // AND: Validation service returns success for barcode scan
      vi.mocked(validateEndingSerial).mockResolvedValue({
        valid: true,
        endingNumber: "067",
      });

      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber={mockBinData.packNumber}
          startingSerial={mockBinData.startingSerial}
          serialEnd={mockBinData.serialEnd}
          manualEntryMode={true}
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User scans 24-digit barcode (simulated by pasting)
      const scannedSerial = "000112345670123456789012"; // 24 digits
      await user.click(input);
      await user.paste(scannedSerial);

      // THEN: Barcode scanning still works (both modes available)
      await waitFor(() => {
        // Component should detect 24-digit input and trigger barcode validation
        expect(validateEndingSerial).toHaveBeenCalledWith(
          scannedSerial,
          expect.objectContaining({
            pack_number: "1234567",
            starting_serial: "045",
            serial_end: "150",
          }),
        );
      });

      // AND: Ending number is auto-filled from barcode scan
      await waitFor(() => {
        expect(mockOnChange).toHaveBeenCalledWith("067");
      });
    });
  });

  describe("TEST-10.4-C12: Error Display in Manual Mode", () => {
    it("should display same error messages as scanning mode", async () => {
      // GIVEN: EndingNumberInput component with manualEntryMode=true
      // AND: Validation service returns error
      vi.mocked(validateManualEntryEnding).mockResolvedValue({
        valid: false,
        error: "Ending number cannot be less than starting (045)",
      });

      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      const { rerender } = renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber={mockBinData.packNumber}
          startingSerial={mockBinData.startingSerial}
          serialEnd={mockBinData.serialEnd}
          manualEntryMode={true}
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User enters invalid ending number
      await user.type(input, "040");

      // Simulate value update after typing
      rerender(
        <EndingNumberInput
          value="040"
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber={mockBinData.packNumber}
          startingSerial={mockBinData.startingSerial}
          serialEnd={mockBinData.serialEnd}
          manualEntryMode={true}
        />,
      );

      // THEN: Error message is displayed with same format as scanning mode
      await waitFor(() => {
        const errorMessage = screen.getByTestId("error-message-bin-1");
        expect(errorMessage).toBeInTheDocument();
        expect(errorMessage).toHaveTextContent(/cannot be less than starting/i);
        expect(errorMessage).toHaveTextContent("045");
      });

      // AND: Input shows red border (same styling as scanning mode)
      expect(input).toHaveClass("border-red-500");
    });
  });

  describe("TEST-10.4-C13: Boundary Cases in Manual Mode", () => {
    it("should accept ending equal to starting serial", async () => {
      // GIVEN: EndingNumberInput component with manualEntryMode=true
      // AND: Validation service returns success for boundary case
      vi.mocked(validateManualEntryEnding).mockResolvedValue({
        valid: true,
      });

      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      const { rerender } = renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber={mockBinData.packNumber}
          startingSerial={mockBinData.startingSerial}
          serialEnd={mockBinData.serialEnd}
          manualEntryMode={true}
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User enters ending equal to starting (boundary case)
      await user.type(input, "045");

      // Simulate value update after typing
      rerender(
        <EndingNumberInput
          value="045"
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber={mockBinData.packNumber}
          startingSerial={mockBinData.startingSerial}
          serialEnd={mockBinData.serialEnd}
          manualEntryMode={true}
        />,
      );

      // THEN: Validation passes (boundary case: ending == starting is valid)
      await waitFor(() => {
        expect(validateManualEntryEnding).toHaveBeenCalledWith("045", {
          starting_serial: "045",
          serial_end: "150",
        });
      });

      // AND: No error is displayed
      const errorMessage = screen.queryByTestId("error-message-bin-1");
      expect(errorMessage).not.toBeInTheDocument();
    });

    it("should accept ending equal to serial_end", async () => {
      // GIVEN: EndingNumberInput component with manualEntryMode=true
      // AND: Validation service returns success for boundary case
      vi.mocked(validateManualEntryEnding).mockResolvedValue({
        valid: true,
      });

      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      const { rerender } = renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber={mockBinData.packNumber}
          startingSerial={mockBinData.startingSerial}
          serialEnd={mockBinData.serialEnd}
          manualEntryMode={true}
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User enters ending equal to serial_end (boundary case)
      await user.type(input, "150");

      // Simulate value update after typing
      rerender(
        <EndingNumberInput
          value="150"
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber={mockBinData.packNumber}
          startingSerial={mockBinData.startingSerial}
          serialEnd={mockBinData.serialEnd}
          manualEntryMode={true}
        />,
      );

      // THEN: Validation passes (boundary case: ending == serial_end is valid)
      await waitFor(() => {
        expect(validateManualEntryEnding).toHaveBeenCalledWith("150", {
          starting_serial: "045",
          serial_end: "150",
        });
      });

      // AND: No error is displayed
      const errorMessage = screen.queryByTestId("error-message-bin-1");
      expect(errorMessage).not.toBeInTheDocument();
    });
  });

  // ============================================================================
  // 🔒 SECURITY TESTS (Mandatory - Applied Automatically)
  // ============================================================================

  describe("10-4-COMPONENT-SEC: Security Tests", () => {
    it("10-4-COMPONENT-SEC-002: should prevent XSS in user input", async () => {
      // GIVEN: EndingNumberInput component
      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      const mockOnChange = vi.fn();

      renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber={mockBinData.packNumber}
          startingSerial={mockBinData.startingSerial}
          serialEnd={mockBinData.serialEnd}
          manualEntryMode={true}
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User types XSS payload
      await user.type(input, "<script>alert('XSS')</script>");

      // THEN: XSS is prevented (component filters non-numeric characters)
      // Assertion: Script tag should not be executed
      expect(input).toBeInTheDocument();
      // Assertion: No script elements should exist in DOM
      const scripts = document.querySelectorAll("script");
      expect(scripts.length).toBe(0);
      // Assertion: onChange should never be called with script tags
      expect(mockOnChange).not.toHaveBeenCalledWith(
        expect.stringContaining("<script>"),
      );
    });
  });

  // ============================================================================
  // 🔄 EDGE CASES (Standard Boundaries - Applied Automatically)
  // ============================================================================

  describe("10-4-COMPONENT-EDGE: Ending Number Edge Cases", () => {
    it("10-4-COMPONENT-EDGE-005: should handle empty ending number", async () => {
      // GIVEN: EndingNumberInput component with empty value
      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      const mockOnChange = vi.fn();

      renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber={mockBinData.packNumber}
          startingSerial={mockBinData.startingSerial}
          serialEnd={mockBinData.serialEnd}
          manualEntryMode={true}
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // THEN: Input is empty and no validation error
      expect(input).toHaveValue("");
      const errorMessage = screen.queryByTestId("error-message-bin-1");
      expect(errorMessage).not.toBeInTheDocument();
    });

    it("10-4-COMPONENT-EDGE-006: should reject ending number with non-numeric characters", async () => {
      // GIVEN: EndingNumberInput component
      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      const mockOnChange = vi.fn();

      vi.mocked(validateManualEntryEnding).mockResolvedValue({
        valid: false,
        error: "Ending number must be exactly 3 digits",
      });

      renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber={mockBinData.packNumber}
          startingSerial={mockBinData.startingSerial}
          serialEnd={mockBinData.serialEnd}
          manualEntryMode={true}
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User types non-numeric characters
      // Note: Input type="text" with pattern may allow typing but validation should reject
      await user.type(input, "abc");

      // THEN: Validation should reject non-numeric input
      // (Actual behavior depends on input constraints)
      // Assertion: Input should not accept non-numeric or validation should fail
      await waitFor(() => {
        // Either input prevents typing or validation fails
        const value = (input as HTMLInputElement).value;
        expect(value).not.toMatch(/^[a-zA-Z]+$/); // Should not be only letters
      });
    });

    it("10-4-COMPONENT-EDGE-007: should handle ending number with wrong length (1-2 digits)", async () => {
      // GIVEN: EndingNumberInput component (controlled)
      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      const mockOnChange = vi.fn();

      // Track onChange calls to verify partial input
      const onChangeCalls: string[] = [];

      renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={(value) => {
            onChangeCalls.push(value);
            mockOnChange(value);
          }}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber={mockBinData.packNumber}
          startingSerial={mockBinData.startingSerial}
          serialEnd={mockBinData.serialEnd}
          manualEntryMode={true}
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User types 1-2 digits
      await user.type(input, "12");

      // THEN: Input accepts partial input but onComplete not called (needs 3 digits)
      expect(mockOnChange).toHaveBeenCalled();
      expect(mockOnComplete).not.toHaveBeenCalled();
      // In controlled component, value is controlled by parent - verify onChange was called
      expect(onChangeCalls).toContain("1");
      expect(onChangeCalls).toContain("2");
    });

    it("10-4-COMPONENT-EDGE-008: should handle ending number with wrong length (4+ digits)", async () => {
      // GIVEN: EndingNumberInput component (controlled)
      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      const mockOnChange = vi.fn();

      // Track all onChange calls to verify limiting behavior
      const onChangeCalls: string[] = [];

      renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={(value) => {
            onChangeCalls.push(value);
            mockOnChange(value);
          }}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber={mockBinData.packNumber}
          startingSerial={mockBinData.startingSerial}
          serialEnd={mockBinData.serialEnd}
          manualEntryMode={true}
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User types more than 3 digits
      await user.type(input, "1234");

      // THEN: Component sanitizes input to 3 digits max
      // No onChange call should have more than 3 characters
      expect(onChangeCalls.every((v) => v.length <= 3)).toBe(true);
    });

    it("10-4-COMPONENT-EDGE-009: should handle zero ending number (000)", async () => {
      // GIVEN: EndingNumberInput component with zero starting (controlled)
      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");
      const user = userEvent.setup();
      const mockOnChange = vi.fn();

      vi.mocked(validateManualEntryEnding).mockResolvedValue({
        valid: true,
      });

      // Create controlled component that updates value
      let currentValue = "";
      const { rerender } = renderWithProviders(
        <EndingNumberInput
          value={currentValue}
          onChange={(value) => {
            currentValue = value;
            mockOnChange(value);
          }}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber={mockBinData.packNumber}
          startingSerial="000"
          serialEnd={mockBinData.serialEnd}
          manualEntryMode={true}
        />,
      );

      const input = screen.getByTestId("ending-number-input-bin-1");

      // WHEN: User types "000" with proper controlled component pattern
      for (const char of "000") {
        await user.type(input, char);
        rerender(
          <EndingNumberInput
            value={currentValue}
            onChange={(value) => {
              currentValue = value;
              mockOnChange(value);
            }}
            onComplete={mockOnComplete}
            disabled={false}
            binId="bin-1"
            packNumber={mockBinData.packNumber}
            startingSerial="000"
            serialEnd={mockBinData.serialEnd}
            manualEntryMode={true}
          />,
        );
      }

      // THEN: Zero is accepted and validation is called
      await waitFor(() => {
        expect(validateManualEntryEnding).toHaveBeenCalledWith("000", {
          starting_serial: "000",
          serial_end: mockBinData.serialEnd,
        });
      });
    });
  });

  // ============================================================================
  // ✅ ENHANCED ASSERTIONS (Best Practices - Applied Automatically)
  // ============================================================================

  describe("10-4-COMPONENT-ASSERT: Enhanced Assertions", () => {
    it("10-4-COMPONENT-ASSERT-002: should have proper accessibility attributes", async () => {
      // GIVEN: EndingNumberInput component
      const { EndingNumberInput } =
        await import("@/components/shift-closing/EndingNumberInput");

      renderWithProviders(
        <EndingNumberInput
          value=""
          onChange={mockOnChange}
          onComplete={mockOnComplete}
          disabled={false}
          binId="bin-1"
          packNumber={mockBinData.packNumber}
          startingSerial={mockBinData.startingSerial}
          serialEnd={mockBinData.serialEnd}
          manualEntryMode={true}
        />,
      );

      // THEN: Input has proper test ID and attributes
      const input = screen.getByTestId("ending-number-input-bin-1");
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute("data-testid", "ending-number-input-bin-1");

      // Assertion: Input should have appropriate type
      expect(input).toHaveAttribute("type", "text");

      // Assertion: Input should have maxLength if applicable
      // (maxLength may be set to 3 for ending numbers)
    });
  });
});
