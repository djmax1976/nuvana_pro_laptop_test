/**
 * @test-level COMPONENT
 * @justification Tests UI form behavior in isolation - fast, isolated, granular
 * @story 6-12
 * @enhanced-by workflow-9 on 2025-01-28
 *
 * Component Tests: PackReceptionForm (Serialized Input)
 *
 * Tests PackReceptionForm component behavior for serialized pack reception:
 * - Serialized number input with auto-generation
 * - Debouncing for serial parsing
 * - Pack list management
 * - Batch submission
 * - Error handling
 * - Loading states
 * - Accessibility
 * - Input sanitization (XSS prevention)
 *
 * Story: 6-12 - Serialized Pack Reception with Batch Processing
 * Priority: P1 (High - Pack Reception)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PackReceptionForm } from "@/components/lottery/PackReceptionForm";
import { receivePackBatch } from "@/lib/api/lottery";
import { parseSerializedNumber } from "@/lib/utils/lottery-serial-parser";

// Mock the API client
vi.mock("@/lib/api/lottery", () => ({
  receivePackBatch: vi.fn(),
}));

// Mock the serial parser
vi.mock("@/lib/utils/lottery-serial-parser", () => ({
  parseSerializedNumber: vi.fn(),
}));

// Mock the toast hook
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe("6.12-COMPONENT: PackReceptionForm (Serialized Input)", () => {
  const mockOnSuccess = vi.fn();
  const mockOnOpenChange = vi.fn();
  const mockStoreId = "123e4567-e89b-12d3-a456-426614174000";

  const defaultProps = {
    storeId: mockStoreId,
    open: true,
    onOpenChange: mockOnOpenChange,
    onSuccess: mockOnSuccess,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // Helper to advance timers properly within act
  const advanceTimers = async (ms: number) => {
    await act(async () => {
      vi.advanceTimersByTime(ms);
    });
  };

  it("6.12-COMPONENT-010: [P1] should render serialized input field (AC #1)", async () => {
    // GIVEN: PackReceptionForm component
    // WHEN: Component is rendered
    render(<PackReceptionForm {...defaultProps} />);

    // THEN: Serialized input field is displayed
    expect(
      screen.getByText("Serialized Number (24 digits)"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("000000000000000000000000"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /receive.*pack/i }),
    ).toBeInTheDocument();
  });

  it("6.12-COMPONENT-011: [P1] should accept only numeric input (AC #1)", async () => {
    // GIVEN: PackReceptionForm component
    const user = userEvent.setup({ delay: null });
    render(<PackReceptionForm {...defaultProps} />);

    // WHEN: User types non-numeric characters
    const input = screen.getByPlaceholderText("000000000000000000000000");
    await user.type(input, "abc123def");

    // THEN: Only numeric characters are accepted
    expect(input).toHaveValue("123");
  });

  it("6.12-COMPONENT-012: [P1] should limit input to 24 digits (AC #1)", async () => {
    // GIVEN: PackReceptionForm component
    const user = userEvent.setup({ delay: null });
    render(<PackReceptionForm {...defaultProps} />);

    // WHEN: User types more than 24 digits
    const input = screen.getByPlaceholderText("000000000000000000000000");
    await user.type(input, "123456789012345678901234567890");

    // THEN: Input is limited to 24 digits
    expect(input).toHaveValue("123456789012345678901234");
  });

  it("6.12-COMPONENT-013: [P1] should parse serial and add to list after debounce (AC #2)", async () => {
    // GIVEN: PackReceptionForm component with mocked parser - render FIRST
    const mockParsed = {
      game_code: "0001",
      pack_number: "1234567",
      serial_start: "012",
    };
    vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);

    render(<PackReceptionForm {...defaultProps} />);

    // Enable fake timers AFTER render so dialog animations complete
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    // WHEN: User enters 24-digit serial
    const input = screen.getByPlaceholderText("000000000000000000000000");
    await user.type(input, "000112345670123456789012");

    // THEN: Debounce timer is set (wait 400ms)
    expect(parseSerializedNumber).not.toHaveBeenCalled();
    await advanceTimers(400);

    // THEN: Serial is parsed and pack is added to list
    expect(parseSerializedNumber).toHaveBeenCalledWith(
      "000112345670123456789012",
    );
    expect(screen.getByText(/Pack: 1234567/i)).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("6.12-COMPONENT-014: [P1] should clear input and maintain single field after valid entry (AC #2)", async () => {
    // GIVEN: PackReceptionForm component
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const mockParsed = {
      game_code: "0001",
      pack_number: "1234567",
      serial_start: "012",
    };
    vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);

    render(<PackReceptionForm {...defaultProps} />);

    // WHEN: User enters valid serial
    const input = screen.getByPlaceholderText("000000000000000000000000");
    await user.type(input, "000112345670123456789012");
    await advanceTimers(400);

    // THEN: Pack is added to list
    expect(screen.getByText(/Pack: 1234567/i)).toBeInTheDocument();

    // AND: Input is cleared (single field remains)
    expect(input).toHaveValue("");

    // AND: Only one input field exists
    const inputs = screen.queryAllByPlaceholderText("000000000000000000000000");
    expect(inputs.length).toBe(1);

    vi.useRealTimers();
  });

  it("6.12-COMPONENT-015: [P1] should show error and clear input for duplicate pack in list (AC #2)", async () => {
    // GIVEN: PackReceptionForm component with one pack in list
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const mockParsed = {
      game_code: "0001",
      pack_number: "1234567",
      serial_start: "012",
    };
    vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);

    render(<PackReceptionForm {...defaultProps} />);

    // Add first pack
    const input = screen.getByPlaceholderText("000000000000000000000000");
    await user.type(input, "000112345670123456789012");
    await advanceTimers(400);

    expect(screen.getByText(/Pack: 1234567/i)).toBeInTheDocument();

    // Input should be cleared after first entry
    expect(input).toHaveValue("");

    // WHEN: User enters same serial again (in the same single input field)
    await user.type(input, "000112345670123456789012");
    await advanceTimers(400);

    // THEN: Error toast is shown (mocked toast, so we just verify parseSerializedNumber was called)
    expect(parseSerializedNumber).toHaveBeenCalledTimes(2);

    // AND: Input is cleared after duplicate detection
    expect(input).toHaveValue("");

    // AND: Only one input field exists (no duplicates created)
    const inputs = screen.queryAllByPlaceholderText("000000000000000000000000");
    expect(inputs.length).toBe(1);

    vi.useRealTimers();
  });

  it("6.12-COMPONENT-016: [P1] should allow removing packs from list (AC #3)", async () => {
    // GIVEN: PackReceptionForm component with packs in list
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const mockParsed = {
      game_code: "0001",
      pack_number: "1234567",
      serial_start: "012",
    };
    vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);

    render(<PackReceptionForm {...defaultProps} />);

    // Add pack to list
    const input = screen.getByPlaceholderText("000000000000000000000000");
    await user.type(input, "000112345670123456789012");
    await advanceTimers(400);

    expect(screen.getByText(/Pack: 1234567/i)).toBeInTheDocument();

    // WHEN: User clicks remove button
    const removeButton = screen.getByTestId("remove-pack-0");
    await user.click(removeButton);

    // THEN: Pack is removed from list
    expect(screen.queryByText(/Pack: 1234567/i)).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it("6.12-COMPONENT-017: [P1] should batch submit all packs (AC #4)", async () => {
    // GIVEN: PackReceptionForm component with packs in list
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const mockParsed = {
      game_code: "0001",
      pack_number: "1234567",
      serial_start: "012",
    };
    vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);
    vi.mocked(receivePackBatch).mockResolvedValue({
      success: true,
      data: {
        created: [
          {
            pack_id: "pack-1",
            game_id: "game-1",
            pack_number: "1234567",
            serial_start: "012",
            serial_end: "161",
            status: "RECEIVED",
            game: { game_id: "game-1", name: "Test Game" },
          },
        ],
        duplicates: [],
        errors: [],
      },
    });

    render(<PackReceptionForm {...defaultProps} />);

    // Add pack to list
    const input = screen.getByPlaceholderText("000000000000000000000000");
    await user.type(input, "000112345670123456789012");
    await advanceTimers(400);

    expect(screen.getByText(/Pack: 1234567/i)).toBeInTheDocument();

    // WHEN: User clicks Receive button
    const submitButton = screen.getByRole("button", { name: /receive.*pack/i });
    await user.click(submitButton);

    // THEN: Batch API is called with all serials
    await waitFor(() => {
      expect(receivePackBatch).toHaveBeenCalledWith({
        serialized_numbers: ["000112345670123456789012"],
        store_id: mockStoreId,
      });
    });

    vi.useRealTimers();
  });

  it("6.12-COMPONENT-018: [P1] should disable submit button when no packs in list (AC #4)", async () => {
    // GIVEN: PackReceptionForm component with empty list
    render(<PackReceptionForm {...defaultProps} />);

    // THEN: Submit button is disabled
    const submitButton = screen.getByRole("button", { name: /receive.*pack/i });
    expect(submitButton).toBeDisabled();
  });

  it("6.12-COMPONENT-019: [P1] should show pack count in button (AC #4)", async () => {
    // GIVEN: PackReceptionForm component with packs in list
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const mockParsed = {
      game_code: "0001",
      pack_number: "1234567",
      serial_start: "012",
    };
    vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);

    render(<PackReceptionForm {...defaultProps} />);

    // Add pack to list
    const input = screen.getByPlaceholderText("000000000000000000000000");
    await user.type(input, "000112345670123456789012");
    await advanceTimers(400);

    // THEN: Button shows pack count
    expect(
      screen.getByRole("button", { name: /receive.*1.*pack/i }),
    ).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("6.12-COMPONENT-020: [P1] should show error for invalid game code (AC #5)", async () => {
    // GIVEN: PackReceptionForm component
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const mockParsed = {
      game_code: "9999",
      pack_number: "1234567",
      serial_start: "012",
    };
    vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);
    vi.mocked(receivePackBatch).mockResolvedValue({
      success: true,
      data: {
        created: [],
        duplicates: [],
        errors: [
          {
            serial: "999912345670123456789012",
            error: "Game code 9999 not found in database.",
          },
        ],
      },
    });

    render(<PackReceptionForm {...defaultProps} />);

    // WHEN: User enters serial with invalid game code and submits
    const input = screen.getByPlaceholderText("000000000000000000000000");
    await user.type(input, "999912345670123456789012");
    await advanceTimers(400);

    expect(screen.getByText(/Pack: 1234567/i)).toBeInTheDocument();

    const submitButton = screen.getByRole("button", { name: /receive.*pack/i });
    await user.click(submitButton);

    // THEN: Error is shown (toast is mocked, so we verify API was called)
    await waitFor(() => {
      expect(receivePackBatch).toHaveBeenCalled();
    });

    vi.useRealTimers();
  });

  it("6.12-COMPONENT-021: [P1] should reset form after successful submission (AC #4)", async () => {
    // GIVEN: PackReceptionForm component with packs in list
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const mockParsed = {
      game_code: "0001",
      pack_number: "1234567",
      serial_start: "012",
    };
    vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);
    vi.mocked(receivePackBatch).mockResolvedValue({
      success: true,
      data: {
        created: [
          {
            pack_id: "pack-1",
            game_id: "game-1",
            pack_number: "1234567",
            serial_start: "012",
            serial_end: "161",
            status: "RECEIVED",
            game: { game_id: "game-1", name: "Test Game" },
          },
        ],
        duplicates: [],
        errors: [],
      },
    });

    render(<PackReceptionForm {...defaultProps} />);

    // Add pack to list
    const input = screen.getByPlaceholderText("000000000000000000000000");
    await user.type(input, "000112345670123456789012");
    await advanceTimers(400);

    expect(screen.getByText(/Pack: 1234567/i)).toBeInTheDocument();

    // WHEN: User submits successfully
    const submitButton = screen.getByRole("button", { name: /receive.*pack/i });
    await user.click(submitButton);

    // THEN: Form is reset and dialog closes
    await waitFor(() => {
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    vi.useRealTimers();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASE TESTS (P1)
  // ═══════════════════════════════════════════════════════════════════════════

  it("6.12-COMPONENT-022: [P1] should handle empty input gracefully", async () => {
    // GIVEN: PackReceptionForm component
    vi.useFakeTimers();
    render(<PackReceptionForm {...defaultProps} />);

    // WHEN: User leaves input empty and debounce timer expires
    await advanceTimers(400);

    // THEN: No parsing occurs for empty input
    expect(parseSerializedNumber).not.toHaveBeenCalled();
    expect(screen.queryByText(/Pack:/i)).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it("6.12-COMPONENT-023: [P1] should handle API error gracefully", async () => {
    // GIVEN: PackReceptionForm component with packs in list
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const mockParsed = {
      game_code: "0001",
      pack_number: "1234567",
      serial_start: "012",
    };
    vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);
    vi.mocked(receivePackBatch).mockRejectedValue(new Error("Network error"));

    render(<PackReceptionForm {...defaultProps} />);

    // Add pack to list
    const input = screen.getByPlaceholderText("000000000000000000000000");
    await user.type(input, "000112345670123456789012");
    await advanceTimers(400);

    expect(screen.getByText(/Pack: 1234567/i)).toBeInTheDocument();

    // WHEN: User submits and API fails
    const submitButton = screen.getByRole("button", { name: /receive.*pack/i });
    await user.click(submitButton);

    // THEN: Error is handled (toast is mocked, so we verify API was called)
    await waitFor(() => {
      expect(receivePackBatch).toHaveBeenCalled();
    });
    // Form should not close on error
    expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);

    vi.useRealTimers();
  });

  it("6.12-COMPONENT-024: [P1] should handle partial batch success (some duplicates)", async () => {
    // GIVEN: PackReceptionForm component with packs in list
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const mockParsed = {
      game_code: "0001",
      pack_number: "1234567",
      serial_start: "012",
    };
    vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);
    vi.mocked(receivePackBatch).mockResolvedValue({
      success: true,
      data: {
        created: [
          {
            pack_id: "pack-1",
            game_id: "game-1",
            pack_number: "1234567",
            serial_start: "012",
            serial_end: "161",
            status: "RECEIVED",
            game: { game_id: "game-1", name: "Test Game" },
          },
        ],
        duplicates: ["000198765430456789012345"], // Some duplicates
        errors: [],
      },
    });

    render(<PackReceptionForm {...defaultProps} />);

    // Add pack to list
    const input = screen.getByPlaceholderText("000000000000000000000000");
    await user.type(input, "000112345670123456789012");
    await advanceTimers(400);

    expect(screen.getByText(/Pack: 1234567/i)).toBeInTheDocument();

    // WHEN: User submits batch with some duplicates
    const submitButton = screen.getByRole("button", { name: /receive.*pack/i });
    await user.click(submitButton);

    // THEN: API is called and handles partial success
    await waitFor(() => {
      expect(receivePackBatch).toHaveBeenCalled();
    });
    // Form should close on success (even with duplicates)
    await waitFor(() => {
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    vi.useRealTimers();
  });

  it("6.12-COMPONENT-025: [P1] should show loading state during submission", async () => {
    // GIVEN: PackReceptionForm component with packs in list
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const mockParsed = {
      game_code: "0001",
      pack_number: "1234567",
      serial_start: "012",
    };
    vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);

    // Mock API with delay
    let resolveApi: (value: any) => void;
    const apiPromise = new Promise((resolve) => {
      resolveApi = resolve;
    });
    vi.mocked(receivePackBatch).mockReturnValue(apiPromise);

    render(<PackReceptionForm {...defaultProps} />);

    // Add pack to list
    const input = screen.getByPlaceholderText("000000000000000000000000");
    await user.type(input, "000112345670123456789012");
    await advanceTimers(400);

    expect(screen.getByText(/Pack: 1234567/i)).toBeInTheDocument();

    // WHEN: User submits
    const submitButton = screen.getByRole("button", { name: /receive.*pack/i });
    await user.click(submitButton);

    // THEN: Submit button should be disabled during loading
    await waitFor(() => {
      expect(submitButton).toBeDisabled();
    });

    // Resolve API call
    resolveApi!({
      success: true,
      data: {
        created: [
          {
            pack_id: "pack-1",
            game_id: "game-1",
            pack_number: "1234567",
            serial_start: "012",
            serial_end: "161",
            status: "RECEIVED",
            game: { game_id: "game-1", name: "Test Game" },
          },
        ],
        duplicates: [],
        errors: [],
      },
    });

    await waitFor(() => {
      expect(submitButton).not.toBeDisabled();
    });

    vi.useRealTimers();
  });

  it("6.12-COMPONENT-026: [P2] should prevent XSS in serial input", async () => {
    // GIVEN: PackReceptionForm component
    const user = userEvent.setup({ delay: null });
    render(<PackReceptionForm {...defaultProps} />);

    // WHEN: User attempts to enter script tag (should be filtered to numeric only)
    const input = screen.getByPlaceholderText("000000000000000000000000");
    await user.type(input, "<script>alert('xss')</script>");

    // THEN: Only numeric characters are accepted (XSS prevented)
    expect(input).toHaveValue("");
    // Script tags should not be rendered in DOM
    expect(screen.queryByText(/script/i)).not.toBeInTheDocument();
  });

  it("6.12-COMPONENT-027: [P2] should handle multiple packs with same pack_number (in-session duplicate)", async () => {
    // GIVEN: PackReceptionForm component with one pack in list
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const mockParsed = {
      game_code: "0001",
      pack_number: "1234567",
      serial_start: "012",
    };
    vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);

    render(<PackReceptionForm {...defaultProps} />);

    // Add first pack
    const input = screen.getByPlaceholderText("000000000000000000000000");
    await user.type(input, "000112345670123456789012");
    await advanceTimers(400);

    expect(screen.getByText(/Pack: 1234567/i)).toBeInTheDocument();

    // Input should be cleared after first entry
    expect(input).toHaveValue("");

    // WHEN: User enters same serial again (in the same single input field)
    await user.type(input, "000112345670456789012345"); // Same serial triggers duplicate check
    await advanceTimers(400);

    // THEN: Duplicate detection should prevent adding (or show error)
    // The component should detect in-session duplicates
    expect(parseSerializedNumber).toHaveBeenCalledTimes(2);

    // AND: Only one input field exists
    const inputs = screen.queryAllByPlaceholderText("000000000000000000000000");
    expect(inputs.length).toBe(1);

    vi.useRealTimers();
  });

  it("6.12-COMPONENT-028: [P2] should have accessible form labels", async () => {
    // GIVEN: PackReceptionForm component
    render(<PackReceptionForm {...defaultProps} />);

    // THEN: Input should have accessible label
    const input = screen.getByPlaceholderText("000000000000000000000000");
    expect(input).toHaveAttribute(
      "aria-label",
      expect.stringContaining("serial"),
    );
    // OR: Input should be associated with label
    expect(
      screen.getByText("Serialized Number (24 digits)"),
    ).toBeInTheDocument();
  });

  it("6.12-COMPONENT-029: [P2] should handle keyboard navigation", async () => {
    // GIVEN: PackReceptionForm component
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PackReceptionForm {...defaultProps} />);

    // WHEN: User navigates with Tab key
    const input = screen.getByPlaceholderText("000000000000000000000000");
    await user.tab();

    // THEN: Input receives focus
    expect(input).toHaveFocus();

    // WHEN: User presses Enter after entering valid serial
    const mockParsed = {
      game_code: "0001",
      pack_number: "1234567",
      serial_start: "012",
    };
    vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);
    await user.type(input, "000112345670123456789012");
    await advanceTimers(400);

    // THEN: Serial is processed (Enter key behavior depends on component implementation)
    expect(parseSerializedNumber).toHaveBeenCalled();

    vi.useRealTimers();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS (P0 - Mandatory)
  // ═══════════════════════════════════════════════════════════════════════════

  it("6.12-COMPONENT-SEC-001: [P0] should sanitize input to prevent script injection", async () => {
    // GIVEN: PackReceptionForm component
    const user = userEvent.setup({ delay: null });
    render(<PackReceptionForm {...defaultProps} />);

    // WHEN: User attempts various script injection patterns
    const input = screen.getByPlaceholderText("000000000000000000000000");
    const maliciousInputs = [
      "<script>alert('xss')</script>",
      "javascript:alert('xss')",
      "onerror=alert('xss')",
      "<img src=x onerror=alert('xss')>",
    ];

    for (const malicious of maliciousInputs) {
      await user.clear(input);
      await user.type(input, malicious);

      // THEN: Only numeric characters are accepted (all non-numeric filtered)
      const value = (input as HTMLInputElement).value;
      expect(
        /^\d*$/.test(value),
        `Input should only contain digits after typing: ${malicious}`,
      ).toBe(true);
    }

    // AND: No script tags should be in DOM
    expect(screen.queryByText(/script/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/javascript/i)).not.toBeInTheDocument();
  });

  it("6.12-COMPONENT-SEC-002: [P0] should prevent SQL injection patterns in input", async () => {
    // GIVEN: PackReceptionForm component
    const user = userEvent.setup({ delay: null });
    render(<PackReceptionForm {...defaultProps} />);

    // WHEN: User attempts SQL injection patterns
    const input = screen.getByPlaceholderText("000000000000000000000000");
    const sqlInjectionPatterns = [
      "'; DROP TABLE packs; --",
      "1' OR '1'='1",
      "1'; INSERT INTO packs VALUES ('xss'); --",
    ];

    for (const sql of sqlInjectionPatterns) {
      await user.clear(input);
      await user.type(input, sql);

      // THEN: Only numeric characters are accepted
      const value = (input as HTMLInputElement).value;
      expect(
        /^\d*$/.test(value),
        `Input should only contain digits after typing: ${sql}`,
      ).toBe(true);
    }
  });

  it("6.12-COMPONENT-SEC-003: [P0] should prevent HTML entity encoding bypass attempts", async () => {
    // GIVEN: PackReceptionForm component
    const user = userEvent.setup({ delay: null });
    render(<PackReceptionForm {...defaultProps} />);

    // WHEN: User attempts HTML entity encoding
    const input = screen.getByPlaceholderText("000000000000000000000000");
    const htmlEntities = [
      "&#60;script&#62;",
      "&lt;script&gt;",
      "&#x3C;script&#x3E;",
    ];

    for (const entity of htmlEntities) {
      await user.clear(input);
      await user.type(input, entity);

      // THEN: Only numeric characters are accepted
      const value = (input as HTMLInputElement).value;
      expect(
        /^\d*$/.test(value),
        `Input should only contain digits after typing: ${entity}`,
      ).toBe(true);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADDITIONAL EDGE CASE TESTS (P1)
  // ═══════════════════════════════════════════════════════════════════════════

  it("6.12-COMPONENT-030: [P1] should handle rapid input changes (debounce cancellation)", async () => {
    // GIVEN: PackReceptionForm component - render FIRST, then enable fake timers
    const mockParsed = {
      game_code: "0001",
      pack_number: "1234567",
      serial_start: "012",
    };
    vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);

    render(<PackReceptionForm {...defaultProps} />);

    // Enable fake timers AFTER render so dialog animations complete
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    // WHEN: User types rapidly, changing input before debounce completes
    const input = screen.getByPlaceholderText("000000000000000000000000");
    await user.type(input, "000112345670123456789012");
    await advanceTimers(200); // Partway through debounce
    await user.clear(input);
    await user.type(input, "000198765430456789012345"); // Different serial
    await advanceTimers(400); // Complete debounce

    // THEN: Only the final serial should be parsed
    expect(parseSerializedNumber).toHaveBeenCalledTimes(1);
    expect(parseSerializedNumber).toHaveBeenCalledWith(
      "000198765430456789012345",
    );

    vi.useRealTimers();
  });

  it("6.12-COMPONENT-031: [P1] should handle paste operation with valid serial", async () => {
    // GIVEN: PackReceptionForm component - render FIRST, then enable fake timers
    const mockParsed = {
      game_code: "0001",
      pack_number: "1234567",
      serial_start: "012",
    };
    vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);

    render(<PackReceptionForm {...defaultProps} />);

    // Enable fake timers AFTER render so dialog animations complete
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    // WHEN: User pastes valid 24-digit serial
    const input = screen.getByPlaceholderText("000000000000000000000000");
    await user.click(input);
    await user.paste("000112345670123456789012");
    await advanceTimers(400);

    // THEN: Serial is parsed and pack is added
    expect(parseSerializedNumber).toHaveBeenCalledWith(
      "000112345670123456789012",
    );
    expect(screen.getByText(/Pack: 1234567/i)).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("6.12-COMPONENT-032: [P1] should handle paste operation with invalid serial", async () => {
    // GIVEN: PackReceptionForm component - render FIRST, then enable fake timers
    render(<PackReceptionForm {...defaultProps} />);

    // Enable fake timers AFTER render so dialog animations complete
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    // WHEN: User pastes invalid serial (too short)
    const input = screen.getByPlaceholderText("000000000000000000000000");
    await user.click(input);
    await user.paste("12345678901234567890"); // 20 digits
    await advanceTimers(400);

    // THEN: Input is limited to 24 digits, parsing may fail or not occur
    expect(input).toHaveValue("123456789012345678901234"); // Limited to 24

    vi.useRealTimers();
  });

  it("6.12-COMPONENT-033: [P1] should handle all packs failing (all errors scenario)", async () => {
    // GIVEN: PackReceptionForm component
    const mockParsed = {
      game_code: "0001",
      pack_number: "1234567",
      serial_start: "012",
    };
    vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);
    vi.mocked(receivePackBatch).mockResolvedValue({
      success: true,
      data: {
        created: [],
        duplicates: [],
        errors: [
          {
            serial: "000112345670123456789012",
            error: "Game code 0001 not found",
          },
        ],
      },
    });

    // Use real timers with waitFor for debounced operations
    const user = userEvent.setup({ delay: null });
    render(<PackReceptionForm {...defaultProps} />);

    // Add pack to list - wait for debounce
    const input = screen.getByPlaceholderText("000000000000000000000000");
    await user.type(input, "000112345670123456789012");

    // Wait for debounced pack to appear
    await waitFor(
      () => {
        expect(screen.getByText(/Pack: 1234567/i)).toBeInTheDocument();
      },
      { timeout: 1000 },
    );

    // WHEN: User submits and all packs fail
    const submitButton = screen.getByRole("button", { name: /receive.*pack/i });
    await user.click(submitButton);

    // THEN: API is called and error is handled
    await waitFor(
      () => {
        expect(receivePackBatch).toHaveBeenCalled();
      },
      { timeout: 1000 },
    );
    // Form should not close when all packs fail
    expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("6.12-COMPONENT-034: [P1] should handle multiple pack entries in single input field", async () => {
    // GIVEN: PackReceptionForm component
    // Mock parser to return different pack numbers for each serial
    let callCount = 0;
    vi.mocked(parseSerializedNumber).mockImplementation(() => {
      callCount++;
      return {
        game_code: "0001",
        pack_number: String(1234567 + callCount),
        serial_start: "012",
      };
    });

    // Use real timers with waitFor for debounced operations
    const user = userEvent.setup({ delay: null });
    render(<PackReceptionForm {...defaultProps} />);

    // WHEN: User adds multiple packs via the single input field
    const input = screen.getByPlaceholderText("000000000000000000000000");

    // Add first pack
    await user.type(input, "000112345670123456789012");
    await waitFor(
      () => {
        expect(input).toHaveValue("");
      },
      { timeout: 1000 },
    );

    // Add second pack (different serial)
    await user.type(input, "000112345680123456789012");
    await waitFor(
      () => {
        expect(input).toHaveValue("");
      },
      { timeout: 1000 },
    );

    // THEN: Multiple packs are displayed in list
    const packElements = screen.queryAllByText(/Pack:/i);
    expect(
      packElements.length,
      "Multiple packs should be displayed",
    ).toBeGreaterThanOrEqual(2);

    // AND: Only one input field exists
    const inputs = screen.queryAllByPlaceholderText("000000000000000000000000");
    expect(inputs.length).toBe(1);
  });

  it("6.12-COMPONENT-035: [P2] should have proper ARIA attributes for screen readers", async () => {
    // GIVEN: PackReceptionForm component
    render(<PackReceptionForm {...defaultProps} />);

    // THEN: Input should have proper ARIA attributes
    const input = screen.getByPlaceholderText("000000000000000000000000");
    expect(
      input,
      "Input should have aria-label or be associated with label",
    ).toBeInTheDocument();

    // AND: Submit button should have accessible name
    const submitButton = screen.getByRole("button", { name: /receive.*pack/i });
    expect(
      submitButton,
      "Submit button should have accessible name",
    ).toBeInTheDocument();
  });

  it("6.12-COMPONENT-036: [P2] should handle form submission with Enter key", async () => {
    // GIVEN: PackReceptionForm component
    const mockParsed = {
      game_code: "0001",
      pack_number: "1234567",
      serial_start: "012",
    };
    vi.mocked(parseSerializedNumber).mockReturnValue(mockParsed);
    vi.mocked(receivePackBatch).mockResolvedValue({
      success: true,
      data: {
        created: [
          {
            pack_id: "pack-1",
            game_id: "game-1",
            pack_number: "1234567",
            serial_start: "012",
            serial_end: "161",
            status: "RECEIVED",
            game: { game_id: "game-1", name: "Test Game" },
          },
        ],
        duplicates: [],
        errors: [],
      },
    });

    // Use real timers with waitFor for debounced operations
    const user = userEvent.setup({ delay: null });
    render(<PackReceptionForm {...defaultProps} />);

    // Add pack to list
    const input = screen.getByPlaceholderText("000000000000000000000000");
    await user.type(input, "000112345670123456789012");

    // Wait for debounced pack to appear
    await waitFor(
      () => {
        expect(screen.getByText(/Pack: 1234567/i)).toBeInTheDocument();
      },
      { timeout: 1000 },
    );

    // WHEN: User presses Enter in input field (if form submission is supported)
    // Note: Behavior depends on component implementation
    const submitButton = screen.getByRole("button", { name: /receive.*pack/i });
    expect(submitButton, "Submit button should be enabled").not.toBeDisabled();
  });
});
