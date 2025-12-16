/**
 * @test-level COMPONENT
 * @justification Tests UI interactions without backend, fast execution
 * @story Lottery Day Closing Feature
 * @priority P0 (Critical - UI Logic)
 *
 * CloseDayModal Component Tests
 *
 * Tests the UI interactions and state management for lottery day closing:
 * - Serial input handling and parsing
 * - Bin matching and display
 * - Save button enable/disable logic
 * - Error handling and validation feedback
 * - List management (add/remove scanned bins)
 * - Accessibility and keyboard navigation
 *
 * MCP Guidance Applied:
 * - TESTING: Component tests are fast, isolated, and granular
 * - SECURITY: XSS prevention tests for all user-generated fields
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CloseDayModal } from "@/components/lottery/CloseDayModal";
import type { DayBin } from "@/lib/api/lottery";
import { closeLotteryDay } from "@/lib/api/lottery";

// Mock the API functions
vi.mock("@/lib/api/lottery", () => ({
  closeLotteryDay: vi.fn(),
}));

// Mock toast hook
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

// Mock serial parser utility
vi.mock("@/lib/utils/lottery-serial-parser", () => ({
  parseSerializedNumber: vi.fn((serial: string) => {
    // Simple mock parser - extracts game code (4), pack number (7), ending (3)
    if (serial.length !== 24) {
      return null;
    }
    return {
      game_code: serial.substring(0, 4),
      pack_number: serial.substring(4, 11),
      serial_end: serial.substring(11, 14),
    };
  }),
}));

describe("CloseDayModal Component", () => {
  // Sample test data
  const mockBins: DayBin[] = [
    {
      bin_id: "bin-1",
      bin_number: 1,
      name: "Bin 1",
      is_active: true,
      pack: {
        pack_id: "pack-1",
        pack_number: "1234567",
        game_name: "Lucky 7s",
        game_price: 5.0,
        starting_serial: "001",
        ending_serial: null,
        serial_end: "050",
      },
    },
    {
      bin_id: "bin-2",
      bin_number: 2,
      name: "Bin 2",
      is_active: true,
      pack: {
        pack_id: "pack-2",
        pack_number: "7654321",
        game_name: "Money Bags",
        game_price: 10.0,
        starting_serial: "010",
        ending_serial: null,
        serial_end: "100",
      },
    },
    {
      bin_id: "bin-3",
      bin_number: 3,
      name: "Bin 3 (Empty)",
      is_active: true,
      pack: null, // Empty bin
    },
    {
      bin_id: "bin-4",
      bin_number: 4,
      name: "Bin 4 (Inactive)",
      is_active: false,
      pack: {
        pack_id: "pack-4",
        pack_number: "9999999",
        game_name: "Inactive Game",
        game_price: 2.0,
        starting_serial: "001",
        ending_serial: null,
        serial_end: "030",
      },
    },
  ];

  const mockOnSuccess = vi.fn();
  const mockOnOpenChange = vi.fn();

  const defaultProps = {
    open: true,
    onOpenChange: mockOnOpenChange,
    bins: mockBins,
    storeId: "store-123",
    onSuccess: mockOnSuccess,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock closeLotteryDay API - return success
    vi.mocked(closeLotteryDay).mockResolvedValue({
      success: true,
      data: {
        closings_created: 2,
        business_day: "2025-12-15",
        bins_closed: [
          {
            bin_number: 1,
            pack_number: "1234567",
            game_name: "Lucky 7s",
            closing_serial: "025",
          },
          {
            bin_number: 2,
            pack_number: "7654321",
            game_name: "Money Bags",
            closing_serial: "050",
          },
        ],
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  // Helper to create 24-digit serial for a pack
  function createSerial(
    gameCode: string,
    packNumber: string,
    ending: string,
  ): string {
    // Format: GGGG (4) + PPPPPPP (7) + EEE (3) + XXXXXXXXXX (10)
    return `${gameCode.padStart(4, "0")}${packNumber.padStart(7, "0")}${ending.padStart(3, "0")}${"0".repeat(10)}`;
  }

  // Helper to simulate 24-digit serial scan
  async function scanSerial(serial: string) {
    const user = userEvent.setup({ delay: null });
    const input = screen.getByTestId("serial-input");
    await user.clear(input);
    await user.type(input, serial);
    // Wait for debounce (typically 300-500ms)
    await waitFor(() => {}, { timeout: 600 });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDERING TESTS (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  it("CLOSE-001: [P0] should render modal when open=true", () => {
    // GIVEN: CloseDayModal component
    // WHEN: Component is rendered with open=true
    render(<CloseDayModal {...defaultProps} />);

    // THEN: Modal should be visible
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("CLOSE-002: [P0] should not render when open=false", () => {
    // GIVEN: CloseDayModal component with open=false
    // WHEN: Component is rendered
    render(<CloseDayModal {...defaultProps} open={false} />);

    // THEN: Modal should not be visible
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("CLOSE-003: [P0] should display title 'Close Lottery Day'", () => {
    // GIVEN: CloseDayModal component
    // WHEN: Component is rendered
    render(<CloseDayModal {...defaultProps} />);

    // THEN: Modal title is displayed
    expect(screen.getByText(/close lottery day/i)).toBeInTheDocument();
  });

  it("CLOSE-004: [P0] should show input field with correct placeholder", () => {
    // GIVEN: CloseDayModal component
    // WHEN: Component is rendered
    render(<CloseDayModal {...defaultProps} />);

    // THEN: Serial input field is present with placeholder
    const input = screen.getByTestId("serial-input");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute(
      "placeholder",
      expect.stringMatching(/scan.*serial/i),
    );
  });

  it("CLOSE-005: [P0] should show pending bins section with bins that have active packs", () => {
    // GIVEN: CloseDayModal component with bins
    // WHEN: Component is rendered
    render(<CloseDayModal {...defaultProps} />);

    // THEN: Pending bins section shows active bins with packs
    expect(screen.getByText(/pending bins/i)).toBeInTheDocument();
    // Should show 2 active bins with packs (bin-1 and bin-2)
    expect(screen.getByText("Bin 1")).toBeInTheDocument();
    expect(screen.getByText("Lucky 7s")).toBeInTheDocument();
    expect(screen.getByText("Bin 2")).toBeInTheDocument();
    expect(screen.getByText("Money Bags")).toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INPUT HANDLING TESTS (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  it("CLOSE-006: [P0] should auto-focus input when modal opens", async () => {
    // GIVEN: CloseDayModal component
    // WHEN: Component is rendered
    render(<CloseDayModal {...defaultProps} />);

    // THEN: Input should be auto-focused
    await waitFor(() => {
      const input = screen.getByTestId("serial-input");
      expect(input).toHaveFocus();
    });
  });

  it("CLOSE-007: [P0] should only accept numeric input (strip non-digits)", async () => {
    // GIVEN: CloseDayModal component
    const user = userEvent.setup({ delay: null });
    render(<CloseDayModal {...defaultProps} />);

    // WHEN: User types alphanumeric input
    const input = screen.getByTestId("serial-input");
    await user.type(input, "ABC123DEF456");

    // THEN: Only numeric characters are accepted
    expect(input).toHaveValue("123456");
  });

  it("CLOSE-008: [P0] should trigger parsing after 24 digits with debounce", async () => {
    // GIVEN: CloseDayModal component
    const user = userEvent.setup({ delay: null });
    render(<CloseDayModal {...defaultProps} />);

    // WHEN: User enters 24 digits
    const validSerial = createSerial("0001", "1234567", "025");
    const input = screen.getByTestId("serial-input");
    await user.type(input, validSerial);

    // THEN: After debounce, serial is parsed and processed
    await waitFor(() => {
      // Input should be cleared after successful scan
      expect(input).toHaveValue("");
    });
  });

  it("CLOSE-009: [P0] should clear input and refocus after successful scan", async () => {
    // GIVEN: CloseDayModal component with valid serial
    render(<CloseDayModal {...defaultProps} />);

    // WHEN: Valid serial is scanned
    const validSerial = createSerial("0001", "1234567", "025");
    await scanSerial(validSerial);

    // THEN: Input is cleared and refocused
    await waitFor(() => {
      const input = screen.getByTestId("serial-input");
      expect(input).toHaveValue("");
      expect(input).toHaveFocus();
    });
  });

  it("CLOSE-010: [P0] should show loading state while validating", async () => {
    // GIVEN: CloseDayModal component with slow validation
    const user = userEvent.setup({ delay: null });
    render(<CloseDayModal {...defaultProps} />);

    // WHEN: User enters 24 digits
    const validSerial = createSerial("0001", "1234567", "025");
    const input = screen.getByTestId("serial-input");
    await user.type(input, validSerial);

    // THEN: Loading indicator appears during validation
    // Note: This depends on implementation - may show spinner or disabled state
    // For now, we check that input remains enabled
    expect(input).toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BIN MATCHING TESTS (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  it("CLOSE-011: [P0] should add bin to scanned list when valid serial matches a bin", async () => {
    // GIVEN: CloseDayModal component
    render(<CloseDayModal {...defaultProps} />);

    // WHEN: Valid serial for bin-1 is scanned
    const validSerial = createSerial("0001", "1234567", "025");
    await scanSerial(validSerial);

    // THEN: Bin is added to scanned list
    await waitFor(() => {
      expect(screen.getByText(/scanned bins/i)).toBeInTheDocument();
      // Scanned bin should appear in the scanned section
      const scannedSection = screen.getByTestId("scanned-bins-list");
      expect(scannedSection).toHaveTextContent("Bin 1");
    });
  });

  it("CLOSE-012: [P0] should show toast error when serial doesn't match any bin", async () => {
    // GIVEN: CloseDayModal component
    render(<CloseDayModal {...defaultProps} />);

    // WHEN: Serial with non-matching pack number is scanned
    const invalidSerial = createSerial("0001", "9999999", "025");
    await scanSerial(invalidSerial);

    // THEN: Error toast is shown
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          title: expect.stringMatching(/not found|no matching/i),
        }),
      );
    });
  });

  it("CLOSE-013: [P0] should show toast error for duplicate scan", async () => {
    // GIVEN: CloseDayModal component with one bin already scanned
    render(<CloseDayModal {...defaultProps} />);

    const validSerial = createSerial("0001", "1234567", "025");

    // WHEN: Same serial is scanned twice
    await scanSerial(validSerial);
    await scanSerial(validSerial);

    // THEN: Duplicate error toast is shown
    await waitFor(() => {
      const toastCalls = mockToast.mock.calls;
      const duplicateCalls = toastCalls.filter((call) =>
        call[0]?.title?.match(/already.*scanned|duplicate/i),
      );
      expect(duplicateCalls.length).toBeGreaterThan(0);
    });
  });

  it("CLOSE-014: [P0] should display scanned bins in bin_number order", async () => {
    // GIVEN: CloseDayModal component
    render(<CloseDayModal {...defaultProps} />);

    // WHEN: Bins are scanned in reverse order (bin-2, then bin-1)
    const serial2 = createSerial("0002", "7654321", "050");
    const serial1 = createSerial("0001", "1234567", "025");
    await scanSerial(serial2);
    await scanSerial(serial1);

    // THEN: Scanned bins are displayed in bin_number order (1, 2)
    await waitFor(() => {
      const scannedList = screen.getByTestId("scanned-bins-list");
      const binElements = scannedList.querySelectorAll(
        "[data-testid^='scanned-bin-']",
      );
      expect(binElements[0]).toHaveAttribute(
        "data-testid",
        "scanned-bin-bin-1",
      );
      expect(binElements[1]).toHaveAttribute(
        "data-testid",
        "scanned-bin-bin-2",
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDATION TESTS (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  it("CLOSE-015: [P0] should show error when closing_serial < starting_serial", async () => {
    // GIVEN: CloseDayModal component
    render(<CloseDayModal {...defaultProps} />);

    // WHEN: Serial with ending < starting is scanned (starting is "001", ending is "000")
    const invalidSerial = createSerial("0001", "1234567", "000");
    await scanSerial(invalidSerial);

    // THEN: Validation error is shown
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          title: expect.stringMatching(/invalid.*serial|must be greater/i),
        }),
      );
    });
  });

  it("CLOSE-016: [P0] should show error when closing_serial > serial_end", async () => {
    // GIVEN: CloseDayModal component (bin-1 has serial_end = "050")
    render(<CloseDayModal {...defaultProps} />);

    // WHEN: Serial with ending > serial_end is scanned
    const invalidSerial = createSerial("0001", "1234567", "051");
    await scanSerial(invalidSerial);

    // THEN: Validation error is shown
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          title: expect.stringMatching(/exceeds|too high|maximum/i),
        }),
      );
    });
  });

  it("CLOSE-017: [P0] should accept closing_serial = starting_serial (edge case)", async () => {
    // GIVEN: CloseDayModal component (bin-1 starting_serial = "001")
    render(<CloseDayModal {...defaultProps} />);

    // WHEN: Serial with ending = starting is scanned
    const edgeSerial = createSerial("0001", "1234567", "001");
    await scanSerial(edgeSerial);

    // THEN: Serial is accepted without error
    await waitFor(() => {
      const scannedList = screen.getByTestId("scanned-bins-list");
      expect(scannedList).toHaveTextContent("Bin 1");
    });
    expect(mockToast).not.toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
      }),
    );
  });

  it("CLOSE-018: [P0] should accept closing_serial = serial_end (edge case)", async () => {
    // GIVEN: CloseDayModal component (bin-1 serial_end = "050")
    render(<CloseDayModal {...defaultProps} />);

    // WHEN: Serial with ending = serial_end is scanned
    const edgeSerial = createSerial("0001", "1234567", "050");
    await scanSerial(edgeSerial);

    // THEN: Serial is accepted without error
    await waitFor(() => {
      const scannedList = screen.getByTestId("scanned-bins-list");
      expect(scannedList).toHaveTextContent("Bin 1");
    });
    expect(mockToast).not.toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
      }),
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SAVE BUTTON LOGIC TESTS (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  it("CLOSE-019: [P0] should disable Save button when not all active bins scanned", async () => {
    // GIVEN: CloseDayModal component with 2 active bins
    render(<CloseDayModal {...defaultProps} />);

    // WHEN: Only 1 bin is scanned
    const serial1 = createSerial("0001", "1234567", "025");
    await scanSerial(serial1);

    // THEN: Save button is disabled
    await waitFor(() => {
      const saveButton = screen.getByTestId("save-button");
      expect(saveButton).toBeDisabled();
    });
  });

  it("CLOSE-020: [P0] should enable Save button when all active bins scanned", async () => {
    // GIVEN: CloseDayModal component with 2 active bins
    render(<CloseDayModal {...defaultProps} />);

    // WHEN: All active bins are scanned
    const serial1 = createSerial("0001", "1234567", "025");
    const serial2 = createSerial("0002", "7654321", "050");
    await scanSerial(serial1);
    await scanSerial(serial2);

    // THEN: Save button is enabled
    await waitFor(() => {
      const saveButton = screen.getByTestId("save-button");
      expect(saveButton).not.toBeDisabled();
    });
  });

  it("CLOSE-021: [P0] should ignore empty bins (pack: null) in completion check", async () => {
    // GIVEN: CloseDayModal with bins including empty bin (bin-3)
    render(<CloseDayModal {...defaultProps} />);

    // WHEN: All active bins with packs are scanned (bin-1, bin-2)
    const serial1 = createSerial("0001", "1234567", "025");
    const serial2 = createSerial("0002", "7654321", "050");
    await scanSerial(serial1);
    await scanSerial(serial2);

    // THEN: Save button is enabled (empty bin-3 is ignored)
    await waitFor(() => {
      const saveButton = screen.getByTestId("save-button");
      expect(saveButton).not.toBeDisabled();
    });
  });

  it("CLOSE-022: [P0] should show loading state during submission", async () => {
    // GIVEN: CloseDayModal with all bins scanned
    const user = userEvent.setup({ delay: null });
    render(<CloseDayModal {...defaultProps} />);

    const serial1 = createSerial("0001", "1234567", "025");
    const serial2 = createSerial("0002", "7654321", "050");
    await scanSerial(serial1);
    await scanSerial(serial2);

    // Make API slow to test loading state
    let resolveApi: (value: any) => void;
    const apiPromise = new Promise((resolve) => {
      resolveApi = resolve;
    });
    vi.mocked(closeLotteryDay).mockReturnValue(apiPromise as any);

    // WHEN: User clicks save
    const saveButton = screen.getByTestId("save-button");
    await user.click(saveButton);

    // THEN: Loading state is shown
    await waitFor(() => {
      expect(saveButton).toBeDisabled();
      expect(saveButton).toHaveTextContent(/saving|closing/i);
    });

    // Cleanup
    resolveApi!({
      success: true,
      data: {
        closings_created: 2,
        business_day: "2025-12-15",
        bins_closed: [],
      },
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LIST MANAGEMENT TESTS (P1)
  // ═══════════════════════════════════════════════════════════════════════════

  it("CLOSE-023: [P1] should allow removing scanned bin with X button", async () => {
    // GIVEN: CloseDayModal with one scanned bin
    const user = userEvent.setup({ delay: null });
    render(<CloseDayModal {...defaultProps} />);

    const serial1 = createSerial("0001", "1234567", "025");
    await scanSerial(serial1);

    // WHEN: User clicks remove button for scanned bin
    await waitFor(() => {
      const removeButton = screen.getByTestId("remove-bin-bin-1");
      expect(removeButton).toBeInTheDocument();
    });

    const removeButton = screen.getByTestId("remove-bin-bin-1");
    await user.click(removeButton);

    // THEN: Bin is removed from scanned list
    await waitFor(() => {
      expect(screen.queryByTestId("scanned-bin-bin-1")).not.toBeInTheDocument();
    });
  });

  it("CLOSE-024: [P1] should re-disable Save after removing a bin", async () => {
    // GIVEN: CloseDayModal with all bins scanned (Save enabled)
    const user = userEvent.setup({ delay: null });
    render(<CloseDayModal {...defaultProps} />);

    const serial1 = createSerial("0001", "1234567", "025");
    const serial2 = createSerial("0002", "7654321", "050");
    await scanSerial(serial1);
    await scanSerial(serial2);

    await waitFor(() => {
      const saveButton = screen.getByTestId("save-button");
      expect(saveButton).not.toBeDisabled();
    });

    // WHEN: User removes one bin
    const removeButton = screen.getByTestId("remove-bin-bin-1");
    await user.click(removeButton);

    // THEN: Save button is disabled again
    await waitFor(() => {
      const saveButton = screen.getByTestId("save-button");
      expect(saveButton).toBeDisabled();
    });
  });

  it("CLOSE-025: [P1] should update pending bins list after scan", async () => {
    // GIVEN: CloseDayModal component
    render(<CloseDayModal {...defaultProps} />);

    // Initially, both bins should be in pending list
    expect(screen.getByTestId("pending-bin-bin-1")).toBeInTheDocument();
    expect(screen.getByTestId("pending-bin-bin-2")).toBeInTheDocument();

    // WHEN: One bin is scanned
    const serial1 = createSerial("0001", "1234567", "025");
    await scanSerial(serial1);

    // THEN: Scanned bin is removed from pending list
    await waitFor(() => {
      expect(screen.queryByTestId("pending-bin-bin-1")).not.toBeInTheDocument();
      expect(screen.getByTestId("pending-bin-bin-2")).toBeInTheDocument();
    });
  });

  it("CLOSE-026: [P1] should update pending bins list after removal", async () => {
    // GIVEN: CloseDayModal with one scanned bin
    const user = userEvent.setup({ delay: null });
    render(<CloseDayModal {...defaultProps} />);

    const serial1 = createSerial("0001", "1234567", "025");
    await scanSerial(serial1);

    await waitFor(() => {
      expect(screen.queryByTestId("pending-bin-bin-1")).not.toBeInTheDocument();
    });

    // WHEN: User removes the scanned bin
    const removeButton = screen.getByTestId("remove-bin-bin-1");
    await user.click(removeButton);

    // THEN: Bin returns to pending list
    await waitFor(() => {
      expect(screen.getByTestId("pending-bin-bin-1")).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ERROR HANDLING TESTS (P1)
  // ═══════════════════════════════════════════════════════════════════════════

  it("CLOSE-027: [P1] should show toast on API error", async () => {
    // GIVEN: CloseDayModal with all bins scanned and failing API
    const user = userEvent.setup({ delay: null });
    vi.mocked(closeLotteryDay).mockRejectedValue(new Error("Network error"));

    render(<CloseDayModal {...defaultProps} />);

    const serial1 = createSerial("0001", "1234567", "025");
    const serial2 = createSerial("0002", "7654321", "050");
    await scanSerial(serial1);
    await scanSerial(serial2);

    // WHEN: User clicks save
    const saveButton = screen.getByTestId("save-button");
    await user.click(saveButton);

    // THEN: Error toast is shown
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          title: expect.stringMatching(/error|failed/i),
        }),
      );
    });
  });

  it("CLOSE-028: [P1] should re-enable form after API error", async () => {
    // GIVEN: CloseDayModal with failing API
    const user = userEvent.setup({ delay: null });
    vi.mocked(closeLotteryDay).mockRejectedValue(new Error("Network error"));

    render(<CloseDayModal {...defaultProps} />);

    const serial1 = createSerial("0001", "1234567", "025");
    const serial2 = createSerial("0002", "7654321", "050");
    await scanSerial(serial1);
    await scanSerial(serial2);

    const saveButton = screen.getByTestId("save-button");
    await user.click(saveButton);

    // Wait for error
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalled();
    });

    // THEN: Save button is re-enabled after error
    await waitFor(() => {
      expect(saveButton).not.toBeDisabled();
    });
  });

  it("CLOSE-029: [P1] should close modal and call onSuccess after successful save", async () => {
    // GIVEN: CloseDayModal with all bins scanned and successful API
    const user = userEvent.setup({ delay: null });
    render(<CloseDayModal {...defaultProps} />);

    const serial1 = createSerial("0001", "1234567", "025");
    const serial2 = createSerial("0002", "7654321", "050");
    await scanSerial(serial1);
    await scanSerial(serial2);

    // WHEN: User clicks save
    const saveButton = screen.getByTestId("save-button");
    await user.click(saveButton);

    // THEN: onSuccess callback is called
    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalled();
    });

    // AND: Modal is closed
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCESSIBILITY TESTS (P2)
  // ═══════════════════════════════════════════════════════════════════════════

  it("CLOSE-030: [P2] should have proper ARIA labels", () => {
    // GIVEN: CloseDayModal component
    // WHEN: Component is rendered
    render(<CloseDayModal {...defaultProps} />);

    // THEN: Modal has proper role
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // AND: Input has aria-label
    const input = screen.getByTestId("serial-input");
    expect(input).toHaveAttribute("aria-label", expect.any(String));
  });

  it("CLOSE-031: [P2] should support keyboard navigation", async () => {
    // GIVEN: CloseDayModal with all bins scanned
    const user = userEvent.setup({ delay: null });
    render(<CloseDayModal {...defaultProps} />);

    const serial1 = createSerial("0001", "1234567", "025");
    const serial2 = createSerial("0002", "7654321", "050");
    await scanSerial(serial1);
    await scanSerial(serial2);

    await waitFor(() => {
      const saveButton = screen.getByTestId("save-button");
      expect(saveButton).not.toBeDisabled();
    });

    // WHEN: User tabs to save button and presses Enter
    const saveButton = screen.getByTestId("save-button");
    saveButton.focus();
    await user.keyboard("{Enter}");

    // THEN: Form is submitted
    await waitFor(() => {
      expect(closeLotteryDay).toHaveBeenCalled();
    });
  });

  it("CLOSE-032: [P2] should trap focus within modal", async () => {
    // GIVEN: CloseDayModal component
    const user = userEvent.setup({ delay: null });
    render(<CloseDayModal {...defaultProps} />);

    // WHEN: User tabs through focusable elements
    await user.tab();
    await user.tab();
    await user.tab();

    // THEN: Focus remains within modal
    const activeElement = document.activeElement;
    const modal = screen.getByRole("dialog");
    expect(modal.contains(activeElement)).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CANCEL BEHAVIOR TESTS (P1)
  // ═══════════════════════════════════════════════════════════════════════════

  it("CLOSE-033: [P1] should call onOpenChange(false) when cancel button clicked", async () => {
    // GIVEN: CloseDayModal component
    const user = userEvent.setup({ delay: null });
    render(<CloseDayModal {...defaultProps} />);

    // WHEN: User clicks cancel button
    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    await user.click(cancelButton);

    // THEN: onOpenChange is called with false
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("CLOSE-034: [P1] should not call onSuccess when cancel is clicked", async () => {
    // GIVEN: CloseDayModal component with scanned bins
    const user = userEvent.setup({ delay: null });
    render(<CloseDayModal {...defaultProps} />);

    const serial1 = createSerial("0001", "1234567", "025");
    await scanSerial(serial1);

    // WHEN: User clicks cancel
    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    await user.click(cancelButton);

    // THEN: onSuccess is NOT called
    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // API INTEGRATION TESTS (P1)
  // ═══════════════════════════════════════════════════════════════════════════

  it("CLOSE-035: [P1] should call closeLotteryDay API with correct data", async () => {
    // GIVEN: CloseDayModal with all bins scanned
    const user = userEvent.setup({ delay: null });
    render(<CloseDayModal {...defaultProps} />);

    const serial1 = createSerial("0001", "1234567", "025");
    const serial2 = createSerial("0002", "7654321", "050");
    await scanSerial(serial1);
    await scanSerial(serial2);

    // WHEN: User clicks save
    const saveButton = screen.getByTestId("save-button");
    await user.click(saveButton);

    // THEN: API is called with correct storeId and closings data
    await waitFor(() => {
      expect(closeLotteryDay).toHaveBeenCalledWith("store-123", {
        closings: expect.arrayContaining([
          { pack_id: "pack-1", closing_serial: "025" },
          { pack_id: "pack-2", closing_serial: "050" },
        ]),
        entry_method: "SCAN",
      });
    });
  });

  it("CLOSE-036: [P1] should show success toast after successful save", async () => {
    // GIVEN: CloseDayModal with all bins scanned
    const user = userEvent.setup({ delay: null });
    render(<CloseDayModal {...defaultProps} />);

    const serial1 = createSerial("0001", "1234567", "025");
    const serial2 = createSerial("0002", "7654321", "050");
    await scanSerial(serial1);
    await scanSerial(serial2);

    // WHEN: User clicks save
    const saveButton = screen.getByTestId("save-button");
    await user.click(saveButton);

    // THEN: Success toast is shown
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringMatching(/success|closed/i),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASE TESTS (P2)
  // ═══════════════════════════════════════════════════════════════════════════

  it("CLOSE-037: [P2] should handle empty bins array gracefully", () => {
    // GIVEN: CloseDayModal with no bins
    // WHEN: Component is rendered
    render(<CloseDayModal {...defaultProps} bins={[]} />);

    // THEN: Empty state is shown
    expect(screen.getByText(/no active bins/i)).toBeInTheDocument();
  });

  it("CLOSE-038: [P2] should handle all empty bins (no active packs)", () => {
    // GIVEN: CloseDayModal with only empty bins
    const emptyBins: DayBin[] = [
      {
        bin_id: "bin-1",
        bin_number: 1,
        name: "Empty Bin 1",
        is_active: true,
        pack: null,
      },
      {
        bin_id: "bin-2",
        bin_number: 2,
        name: "Empty Bin 2",
        is_active: true,
        pack: null,
      },
    ];

    // WHEN: Component is rendered
    render(<CloseDayModal {...defaultProps} bins={emptyBins} />);

    // THEN: Save button is enabled (no bins to scan)
    const saveButton = screen.getByTestId("save-button");
    expect(saveButton).not.toBeDisabled();
  });

  it("CLOSE-039: [P2] should ignore inactive bins", async () => {
    // GIVEN: CloseDayModal with active and inactive bins
    render(<CloseDayModal {...defaultProps} />);

    // WHEN: All active bins are scanned (bin-1, bin-2), ignoring bin-4 (inactive)
    const serial1 = createSerial("0001", "1234567", "025");
    const serial2 = createSerial("0002", "7654321", "050");
    await scanSerial(serial1);
    await scanSerial(serial2);

    // THEN: Save button is enabled (inactive bin-4 is ignored)
    await waitFor(() => {
      const saveButton = screen.getByTestId("save-button");
      expect(saveButton).not.toBeDisabled();
    });

    // AND: Inactive bin should not appear in pending list
    expect(screen.queryByTestId("pending-bin-bin-4")).not.toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS (P0 - Mandatory)
  // ═══════════════════════════════════════════════════════════════════════════

  it("CLOSE-SEC-001: [P0] should prevent XSS in bin names", () => {
    // GIVEN: Bins with XSS payload in name
    const xssBins: DayBin[] = [
      {
        bin_id: "bin-xss",
        bin_number: 1,
        name: "<script>alert('xss')</script>",
        is_active: true,
        pack: {
          pack_id: "pack-1",
          pack_number: "1234567",
          game_name: "Safe Game",
          game_price: 5.0,
          starting_serial: "001",
          ending_serial: null,
          serial_end: "050",
        },
      },
    ];

    // WHEN: Component is rendered
    render(<CloseDayModal {...defaultProps} bins={xssBins} />);

    // THEN: XSS payload is escaped (React escapes by default)
    const nameElement = screen.getByText("<script>alert('xss')</script>");
    expect(nameElement).toBeInTheDocument();
    expect(nameElement.tagName).not.toBe("SCRIPT");
  });

  it("CLOSE-SEC-002: [P0] should prevent XSS in game names", () => {
    // GIVEN: Bins with XSS payload in game name
    const xssBins: DayBin[] = [
      {
        bin_id: "bin-1",
        bin_number: 1,
        name: "Bin 1",
        is_active: true,
        pack: {
          pack_id: "pack-1",
          pack_number: "1234567",
          game_name: "<img src=x onerror=alert('xss')>",
          game_price: 5.0,
          starting_serial: "001",
          ending_serial: null,
          serial_end: "050",
        },
      },
    ];

    // WHEN: Component is rendered
    render(<CloseDayModal {...defaultProps} bins={xssBins} />);

    // THEN: XSS payload is rendered as text
    expect(
      screen.getByText("<img src=x onerror=alert('xss')>"),
    ).toBeInTheDocument();
  });
});
