/**
 * @test-level COMPONENT
 * @justification Tests UI interactions without backend, fast execution
 * @story Lottery Day Close Enhancement - Phase 2
 * @priority P0 (Critical - UI Logic)
 *
 * DayCloseModeScanner Component Tests
 *
 * Tests the full-page scanner interface for lottery day closing:
 * - Serial input handling with 400ms debounce for scanner detection
 * - Bin matching and direct table row updates
 * - Floating scan bar behavior (appears when inline input scrolls out of view)
 * - Save button enable/disable logic
 * - Error handling and validation feedback
 * - Click row to undo scanned bins
 * - Sound toggle functionality
 * - Progress tracking
 *
 * MCP Guidance Applied:
 * - TESTING: Component tests are fast, isolated, and granular
 * - SECURITY: XSS prevention tests for all user-generated fields
 * - FE-002: FORM_VALIDATION - Strict 24-digit validation
 * - SEC-014: INPUT_VALIDATION - Length, type, and format constraints
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DayCloseModeScanner } from "@/components/lottery/DayCloseModeScanner";
import type { DayBin } from "@/lib/api/lottery";
import { closeLotteryDay } from "@/lib/api/lottery";
import { renderWithProviders } from "../../support/test-utils";

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

// Mock notification sound hook
const mockPlaySuccess = vi.fn();
const mockPlayError = vi.fn();
const mockToggleMute = vi.fn();
vi.mock("@/hooks/use-notification-sound", () => ({
  useNotificationSound: () => ({
    playSuccess: mockPlaySuccess,
    playError: mockPlayError,
    isMuted: false,
    toggleMute: mockToggleMute,
  }),
}));

// Mock serial parser utility
vi.mock("@/lib/utils/lottery-serial-parser", () => ({
  parseSerializedNumber: vi.fn((serial: string) => {
    // Simple mock parser - extracts game code (4), pack number (7), serial_start (3)
    if (serial.length !== 24) {
      throw new Error("Invalid serial length");
    }
    return {
      game_code: serial.substring(0, 4),
      pack_number: serial.substring(4, 11),
      serial_start: serial.substring(11, 14), // Component uses serial_start for closing serial
    };
  }),
}));

describe("DayCloseModeScanner Component", () => {
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
  const mockOnCancel = vi.fn();

  const defaultProps = {
    storeId: "store-123",
    bins: mockBins,
    onSuccess: mockOnSuccess,
    onCancel: mockOnCancel,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock closeLotteryDay API - return success
    vi.mocked(closeLotteryDay).mockResolvedValue({
      success: true,
      data: {
        closings_created: 2,
        business_day: "2025-12-15",
        day_closed: true,
        bins_closed: [
          {
            bin_number: 1,
            pack_number: "1234567",
            game_name: "Lucky 7s",
            closing_serial: "025",
            starting_serial: "000",
            game_price: 1,
            tickets_sold: 25,
            sales_amount: 25,
          },
          {
            bin_number: 2,
            pack_number: "7654321",
            game_name: "Money Bags",
            closing_serial: "050",
            starting_serial: "000",
            game_price: 5,
            tickets_sold: 50,
            sales_amount: 250,
          },
        ],
        lottery_total: 275,
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

  // Helper to simulate 24-digit serial scan and wait for input to clear
  async function scanSerial(serial: string) {
    const user = userEvent.setup({ delay: null });
    const input = screen.getByTestId("inline-serial-input");
    await user.clear(input);
    await user.type(input, serial);
    // Wait for debounce (400ms) + processing, then verify input is cleared
    await waitFor(
      () => {
        expect(screen.getByTestId("inline-serial-input")).toHaveValue("");
      },
      { timeout: 1500 },
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDERING TESTS (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  it("SCANNER-001: [P0] should render scanner interface", () => {
    // GIVEN: DayCloseModeScanner component
    // WHEN: Component is rendered
    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    // THEN: Scanner interface should be visible
    expect(screen.getByTestId("day-close-mode-scanner")).toBeInTheDocument();
  });

  it("SCANNER-002: [P0] should display 'Close Lottery' title", () => {
    // GIVEN: DayCloseModeScanner component
    // WHEN: Component is rendered
    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    // THEN: Title is displayed (h2 heading in main content area)
    const titles = screen.getAllByText("Close Lottery");
    expect(titles.length).toBeGreaterThan(0);
    // Check that one is a heading
    const headingTitle = titles.find((el) => el.tagName === "H2");
    expect(headingTitle).toBeInTheDocument();
  });

  it("SCANNER-003: [P0] should show input field with correct placeholder", () => {
    // GIVEN: DayCloseModeScanner component
    // WHEN: Component is rendered
    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    // THEN: Serial input field is present with placeholder
    const input = screen.getByTestId("inline-serial-input");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute(
      "placeholder",
      expect.stringMatching(/scan.*barcode|serial/i),
    );
  });

  it("SCANNER-004: [P0] should show bins table with active bins", () => {
    // GIVEN: DayCloseModeScanner component with bins
    // WHEN: Component is rendered
    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    // THEN: Table shows active bins with packs
    expect(screen.getByTestId("bin-row-bin-1")).toBeInTheDocument();
    expect(screen.getByTestId("bin-row-bin-2")).toBeInTheDocument();
    // Bin numbers should be visible
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("SCANNER-005: [P0] should show progress bar", () => {
    // GIVEN: DayCloseModeScanner component
    // WHEN: Component is rendered
    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    // THEN: Progress bar is visible
    expect(screen.getByText("Progress")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INPUT HANDLING TESTS (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  it("SCANNER-006: [P0] should auto-focus input on mount", async () => {
    // GIVEN: DayCloseModeScanner component
    // WHEN: Component is rendered
    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    // THEN: Input should be auto-focused after delay
    await waitFor(() => {
      const input = screen.getByTestId("inline-serial-input");
      expect(input).toHaveFocus();
    });
  });

  it("SCANNER-007: [P0] should only accept numeric input", async () => {
    // GIVEN: DayCloseModeScanner component
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    // WHEN: User types alphanumeric input
    const input = screen.getByTestId("inline-serial-input");
    await user.type(input, "ABC123DEF456");

    // THEN: Only numeric characters are accepted
    expect(input).toHaveValue("123456");
  });

  it("SCANNER-008: [P0] should show character count", async () => {
    // GIVEN: DayCloseModeScanner component
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    // WHEN: User types digits
    const input = screen.getByTestId("inline-serial-input");
    await user.type(input, "123456");

    // THEN: Character count is updated (multiple elements exist - inline and floating)
    const countElements = screen.getAllByText("6/24");
    expect(countElements.length).toBeGreaterThan(0);
  });

  it("SCANNER-009: [P0] should clear input after successful scan", async () => {
    // GIVEN: DayCloseModeScanner component with valid serial
    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    // WHEN: Valid serial is scanned
    const validSerial = createSerial("0001", "1234567", "025");
    await scanSerial(validSerial);

    // THEN: Input is cleared
    await waitFor(() => {
      const input = screen.getByTestId("inline-serial-input");
      expect(input).toHaveValue("");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BIN MATCHING TESTS (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  it("SCANNER-010: [P0] should update bin row when valid serial matches", async () => {
    // GIVEN: DayCloseModeScanner component
    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    // WHEN: Valid serial for bin-1 is scanned
    const validSerial = createSerial("0001", "1234567", "025");
    await scanSerial(validSerial);

    // THEN: Bin row shows the ending serial
    await waitFor(() => {
      const binRow = screen.getByTestId("bin-row-bin-1");
      expect(binRow).toHaveTextContent("025");
      // Row should have green styling
      expect(binRow.className).toMatch(/bg-green/);
    });
  });

  it("SCANNER-011: [P0] should play success sound on valid scan", async () => {
    // GIVEN: DayCloseModeScanner component
    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    // WHEN: Valid serial is scanned
    const validSerial = createSerial("0001", "1234567", "025");
    await scanSerial(validSerial);

    // THEN: Success sound is played
    await waitFor(() => {
      expect(mockPlaySuccess).toHaveBeenCalled();
    });
  });

  it("SCANNER-012: [P0] should show toast error when serial doesn't match any bin", async () => {
    // GIVEN: DayCloseModeScanner component
    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    // WHEN: Serial with non-matching pack number is scanned
    const invalidSerial = createSerial("0001", "9999999", "025");
    await scanSerial(invalidSerial);

    // THEN: Error toast is shown
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          title: expect.stringMatching(/not found/i),
        }),
      );
    });

    // AND: Error sound is played
    expect(mockPlayError).toHaveBeenCalled();
  });

  it("SCANNER-013: [P0] should show toast error for duplicate scan", async () => {
    // GIVEN: DayCloseModeScanner component
    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    const validSerial = createSerial("0001", "1234567", "025");

    // WHEN: Same serial is scanned twice
    await scanSerial(validSerial);
    await scanSerial(validSerial);

    // THEN: Duplicate error toast is shown
    await waitFor(() => {
      const toastCalls = mockToast.mock.calls;
      const duplicateCalls = toastCalls.filter((call) =>
        call[0]?.title?.match(/duplicate/i),
      );
      expect(duplicateCalls.length).toBeGreaterThan(0);
    });
  });

  it("SCANNER-014: [P0] should update progress when bins are scanned", async () => {
    // GIVEN: DayCloseModeScanner component
    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    // WHEN: One bin is scanned
    const serial1 = createSerial("0001", "1234567", "025");
    await scanSerial(serial1);

    // THEN: Progress updates to 50% (1 of 2 active bins)
    await waitFor(() => {
      expect(screen.getByText("50%")).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDATION TESTS (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  it("SCANNER-015: [P0] should show error when closing_serial < starting_serial", async () => {
    // GIVEN: DayCloseModeScanner component
    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    // WHEN: Serial with ending < starting is scanned
    const invalidSerial = createSerial("0001", "1234567", "000");
    await scanSerial(invalidSerial);

    // THEN: Validation error is shown
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          title: expect.stringMatching(/invalid.*serial/i),
        }),
      );
    });
  });

  it("SCANNER-016: [P0] should show error when closing_serial > serial_end", async () => {
    // GIVEN: DayCloseModeScanner component (bin-1 has serial_end = "050")
    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    // WHEN: Serial with ending > serial_end is scanned
    const invalidSerial = createSerial("0001", "1234567", "051");
    await scanSerial(invalidSerial);

    // THEN: Validation error is shown
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          title: expect.stringMatching(/invalid.*serial/i),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BUTTON LOGIC TESTS (P0)
  // ═══════════════════════════════════════════════════════════════════════════

  it("SCANNER-017: [P0] should disable Close button when not all bins scanned", async () => {
    // GIVEN: DayCloseModeScanner component with 2 active bins
    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    // WHEN: Only 1 bin is scanned
    const serial1 = createSerial("0001", "1234567", "025");
    await scanSerial(serial1);

    // THEN: Close button is disabled
    await waitFor(() => {
      const closeButton = screen.getByTestId("close-lottery-button");
      expect(closeButton).toBeDisabled();
    });
  });

  it("SCANNER-018: [P0] should enable Close button when all active bins scanned", async () => {
    // GIVEN: DayCloseModeScanner component with 2 active bins
    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    // WHEN: All active bins are scanned
    const serial1 = createSerial("0001", "1234567", "025");
    const serial2 = createSerial("0002", "7654321", "050");
    await scanSerial(serial1);
    await scanSerial(serial2);

    // THEN: Close button is enabled
    await waitFor(() => {
      const closeButton = screen.getByTestId("close-lottery-button");
      expect(closeButton).not.toBeDisabled();
    });
  });

  it("SCANNER-019: [P0] should show all-scanned banner when complete", async () => {
    // GIVEN: DayCloseModeScanner component
    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    // WHEN: All active bins are scanned
    const serial1 = createSerial("0001", "1234567", "025");
    const serial2 = createSerial("0002", "7654321", "050");
    await scanSerial(serial1);
    await scanSerial(serial2);

    // THEN: Success banner is shown
    await waitFor(() => {
      expect(screen.getByTestId("all-scanned-banner")).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // UNDO FUNCTIONALITY TESTS (P1)
  // ═══════════════════════════════════════════════════════════════════════════

  it("SCANNER-020: [P1] should allow removing scanned bin by clicking row", async () => {
    // GIVEN: DayCloseModeScanner with one scanned bin
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    const serial1 = createSerial("0001", "1234567", "025");
    await scanSerial(serial1);

    // Verify row is green (scanned)
    await waitFor(() => {
      const binRow = screen.getByTestId("bin-row-bin-1");
      expect(binRow.className).toMatch(/bg-green/);
    });

    // WHEN: User clicks the green row to undo
    const binRow = screen.getByTestId("bin-row-bin-1");
    await user.click(binRow);

    // THEN: Row returns to normal state
    await waitFor(() => {
      const row = screen.getByTestId("bin-row-bin-1");
      expect(row.className).not.toMatch(/bg-green/);
    });
  });

  it("SCANNER-021: [P1] should re-disable Close button after undo", async () => {
    // GIVEN: DayCloseModeScanner with all bins scanned
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    const serial1 = createSerial("0001", "1234567", "025");
    const serial2 = createSerial("0002", "7654321", "050");
    await scanSerial(serial1);
    await scanSerial(serial2);

    await waitFor(() => {
      const closeButton = screen.getByTestId("close-lottery-button");
      expect(closeButton).not.toBeDisabled();
    });

    // WHEN: User clicks row to undo
    const binRow = screen.getByTestId("bin-row-bin-1");
    await user.click(binRow);

    // THEN: Close button is disabled again
    await waitFor(() => {
      const closeButton = screen.getByTestId("close-lottery-button");
      expect(closeButton).toBeDisabled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CANCEL BEHAVIOR TESTS (P1)
  // ═══════════════════════════════════════════════════════════════════════════

  it("SCANNER-022: [P1] should call onCancel when cancel button clicked", async () => {
    // GIVEN: DayCloseModeScanner component
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    // WHEN: User clicks cancel button
    const cancelButton = screen.getByTestId("cancel-day-close-button");
    await user.click(cancelButton);

    // THEN: onCancel is called
    expect(mockOnCancel).toHaveBeenCalled();
  });

  it("SCANNER-023: [P1] should not call onSuccess when cancel is clicked", async () => {
    // GIVEN: DayCloseModeScanner component with scanned bins
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    const serial1 = createSerial("0001", "1234567", "025");
    await scanSerial(serial1);

    // WHEN: User clicks cancel
    const cancelButton = screen.getByTestId("cancel-day-close-button");
    await user.click(cancelButton);

    // THEN: onSuccess is NOT called
    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // API INTEGRATION TESTS (P1)
  // ═══════════════════════════════════════════════════════════════════════════

  it("SCANNER-024: [P1] should call closeLotteryDay API with correct data", async () => {
    // GIVEN: DayCloseModeScanner with all bins scanned
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    const serial1 = createSerial("0001", "1234567", "025");
    const serial2 = createSerial("0002", "7654321", "050");
    await scanSerial(serial1);
    await scanSerial(serial2);

    // WHEN: User clicks close button
    const closeButton = screen.getByTestId("close-lottery-button");
    await user.click(closeButton);

    // THEN: API is called with correct data
    await waitFor(() => {
      expect(closeLotteryDay).toHaveBeenCalledWith("store-123", {
        closings: expect.arrayContaining([
          { pack_id: "pack-1", closing_serial: "025" },
          { pack_id: "pack-2", closing_serial: "050" },
        ]),
        entry_method: "SCAN",
        current_shift_id: undefined,
      });
    });
  });

  it("SCANNER-025: [P1] should call onSuccess with lottery data after save", async () => {
    // GIVEN: DayCloseModeScanner with all bins scanned
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    const serial1 = createSerial("0001", "1234567", "025");
    const serial2 = createSerial("0002", "7654321", "050");
    await scanSerial(serial1);
    await scanSerial(serial2);

    // WHEN: User clicks close button
    const closeButton = screen.getByTestId("close-lottery-button");
    await user.click(closeButton);

    // THEN: onSuccess is called with lottery data
    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          closings_created: 2,
          business_day: "2025-12-15",
          lottery_total: 275,
        }),
      );
    });
  });

  it("SCANNER-026: [P1] should show error toast on API failure", async () => {
    // GIVEN: DayCloseModeScanner with failing API
    const user = userEvent.setup({ delay: null });
    vi.mocked(closeLotteryDay).mockRejectedValue(new Error("Network error"));

    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    const serial1 = createSerial("0001", "1234567", "025");
    const serial2 = createSerial("0002", "7654321", "050");
    await scanSerial(serial1);
    await scanSerial(serial2);

    // WHEN: User clicks close button
    const closeButton = screen.getByTestId("close-lottery-button");
    await user.click(closeButton);

    // THEN: Error toast is shown
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          title: expect.stringMatching(/error/i),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SOUND TOGGLE TESTS (P2)
  // ═══════════════════════════════════════════════════════════════════════════

  it("SCANNER-027: [P2] should have sound toggle button", () => {
    // GIVEN: DayCloseModeScanner component
    // WHEN: Component is rendered
    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    // THEN: Sound toggle button is present
    expect(screen.getByTestId("inline-sound-toggle")).toBeInTheDocument();
  });

  it("SCANNER-028: [P2] should call toggleMute when sound button clicked", async () => {
    // GIVEN: DayCloseModeScanner component
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    // WHEN: User clicks sound toggle
    const soundToggle = screen.getByTestId("inline-sound-toggle");
    await user.click(soundToggle);

    // THEN: toggleMute is called
    expect(mockToggleMute).toHaveBeenCalled();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASE TESTS (P2)
  // ═══════════════════════════════════════════════════════════════════════════

  it("SCANNER-029: [P2] should handle empty bins array gracefully", () => {
    // GIVEN: DayCloseModeScanner with no bins
    // WHEN: Component is rendered
    renderWithProviders(<DayCloseModeScanner {...defaultProps} bins={[]} />);

    // THEN: Component renders without crashing
    expect(screen.getByTestId("day-close-mode-scanner")).toBeInTheDocument();
    // AND: Close button is disabled
    expect(screen.getByTestId("close-lottery-button")).toBeDisabled();
  });

  it("SCANNER-030: [P2] should ignore inactive bins in completion check", async () => {
    // GIVEN: DayCloseModeScanner with active and inactive bins
    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    // WHEN: All active bins are scanned (ignoring inactive bin-4)
    const serial1 = createSerial("0001", "1234567", "025");
    const serial2 = createSerial("0002", "7654321", "050");
    await scanSerial(serial1);
    await scanSerial(serial2);

    // THEN: Close button is enabled
    await waitFor(() => {
      const closeButton = screen.getByTestId("close-lottery-button");
      expect(closeButton).not.toBeDisabled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY TESTS (P0 - Mandatory)
  // ═══════════════════════════════════════════════════════════════════════════

  it("SCANNER-SEC-001: [P0] should sanitize serial input to digits only", async () => {
    // GIVEN: DayCloseModeScanner component
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    // WHEN: User attempts to enter XSS payload in serial input
    const input = screen.getByTestId("inline-serial-input");
    await user.type(input, "<script>alert(1)</script>");

    // THEN: Only digits are accepted, XSS payload is stripped
    expect(input).toHaveValue("1"); // Only the "1" from "alert(1)" is kept
  });

  it("SCANNER-SEC-002: [P0] should only display 3-digit serial numbers", async () => {
    // GIVEN: DayCloseModeScanner component with a valid scan
    renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

    // WHEN: Valid serial is scanned
    const validSerial = createSerial("0001", "1234567", "025");
    await scanSerial(validSerial);

    // THEN: Only the 3-digit closing serial is displayed
    await waitFor(() => {
      const binRow = screen.getByTestId("bin-row-bin-1");
      expect(binRow).toHaveTextContent("025");
    });
  });
});
