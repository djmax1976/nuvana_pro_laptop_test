/**
 * DayCloseModeScanner - Returned Pack Scanning Tests
 *
 * Tests the behavior when a user scans a pack that has been marked as returned.
 * Instead of showing a generic "Pack not found" error, the component should
 * display a specific message indicating the pack was returned.
 *
 * @test-level COMPONENT
 * @justification Tests UI behavior for returned pack scanning without backend
 * @story Lottery Day Close - Returned Pack Error Handling
 * @priority P0 (Critical - User Experience, Data Integrity)
 *
 * TRACEABILITY MATRIX:
 * ┌─────────────────────────────────────────────────────────────────────────────────┐
 * │ Test ID              │ Requirement                     │ MCP Rule   │ Priority │
 * ├─────────────────────────────────────────────────────────────────────────────────┤
 * │ RETURNED-001         │ Detect returned pack on scan    │ SEC-014    │ P0       │
 * │ RETURNED-002         │ Show specific error message     │ FE-005     │ P0       │
 * │ RETURNED-003         │ Display game name in message    │ FE-005     │ P1       │
 * │ RETURNED-004         │ Display return date in message  │ FE-005     │ P1       │
 * │ RETURNED-005         │ Guide user to Returned section  │ FE-002     │ P1       │
 * │ RETURNED-006         │ Play error sound on scan        │ FE-001     │ P1       │
 * │ RETURNED-007         │ Clear input after error         │ FE-001     │ P0       │
 * │ RETURNED-008         │ Handle empty returnedPacks      │ SEC-014    │ P1       │
 * │ RETURNED-009         │ Handle undefined returnedPacks  │ SEC-014    │ P1       │
 * │ RETURNED-010         │ Still show "not found" for unknown │ FE-002  │ P0       │
 * └─────────────────────────────────────────────────────────────────────────────────┘
 *
 * TESTING PYRAMID PLACEMENT:
 * ┌───────────────────────────────────────────────────────────────────────────────┐
 * │ Level        │ Coverage                         │ Related Files               │
 * ├───────────────────────────────────────────────────────────────────────────────┤
 * │ Unit         │ findReturnedPack logic           │ day-close-sold-out.test.ts  │
 * │ Component    │ UI behavior (this file)          │ DayCloseModeScanner.tsx     │
 * │ Integration  │ Full scan flow with backend      │ *-integration.test.ts       │
 * │ E2E          │ Complete day close workflow      │ lottery-management-flow.e2e │
 * └───────────────────────────────────────────────────────────────────────────────┘
 *
 * SECURITY STANDARDS TESTED:
 * - SEC-014: INPUT_VALIDATION - Pack number validation before lookup
 * - FE-005: UI_SECURITY - Only display necessary info (no internal IDs)
 * - FE-001: STATE_MANAGEMENT - Clean state after error
 *
 * Key Features Tested:
 * - Returned pack detection during barcode scan
 * - Specific error message with pack details
 * - Date formatting for user-friendly display
 * - Input clearing and focus management after error
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DayCloseModeScanner } from "@/components/lottery/DayCloseModeScanner";
import type { DayBin, ReturnedPackDay } from "@/lib/api/lottery";
import { renderWithProviders } from "../../support/test-utils";

// Mock the API functions
vi.mock("@/lib/api/lottery", () => ({
  prepareLotteryDayClose: vi.fn(),
}));

// Mock toast hook - capture toast calls for assertions
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
    if (serial.length !== 24) {
      throw new Error("Invalid serial length");
    }
    return {
      game_code: serial.substring(0, 4),
      pack_number: serial.substring(4, 11),
      serial_start: serial.substring(11, 14),
    };
  }),
}));

describe("DayCloseModeScanner - Returned Pack Scanning", () => {
  // Active bins - packs that ARE in the scanning list
  const mockActiveBins: DayBin[] = [
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
        is_first_period: true,
      },
    },
  ];

  // Returned packs - packs that have been returned and are NOT in active bins
  const mockReturnedPacks: ReturnedPackDay[] = [
    {
      pack_id: "pack-returned-1",
      pack_number: "9999999",
      game_name: "Cash Bonanza",
      game_price: 10.0,
      bin_number: 3,
      activated_at: "2026-01-05T10:00:00.000Z",
      returned_at: "2026-01-06T14:30:00.000Z",
      return_reason: "DAMAGED",
      return_notes: "Water damage",
      last_sold_serial: "015",
      tickets_sold_on_return: 15,
      return_sales_amount: 150,
      returned_by_name: "John Doe",
    },
    {
      pack_id: "pack-returned-2",
      pack_number: "8888888",
      game_name: "Money Bags",
      game_price: 20.0,
      bin_number: 5,
      activated_at: "2026-01-04T08:00:00.000Z",
      returned_at: "2026-01-06T09:15:00.000Z",
      return_reason: "SUPPLIER_RECALL",
      return_notes: null,
      last_sold_serial: null,
      tickets_sold_on_return: 0,
      return_sales_amount: 0,
      returned_by_name: "Jane Smith",
    },
  ];

  const mockOnSuccess = vi.fn();
  const mockOnCancel = vi.fn();

  const defaultProps = {
    storeId: "store-123",
    bins: mockActiveBins,
    onSuccess: mockOnSuccess,
    onCancel: mockOnCancel,
    returnedPacks: mockReturnedPacks,
  };

  beforeEach(() => {
    vi.clearAllMocks();
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
    return `${gameCode.padStart(4, "0")}${packNumber.padStart(7, "0")}${ending.padStart(3, "0")}${"0".repeat(10)}`;
  }

  // Helper to type a serial and wait for processing
  async function typeSerial(serial: string) {
    const user = userEvent.setup({ delay: null });
    const input = screen.getByTestId("inline-serial-input");
    await user.clear(input);
    await user.type(input, serial);
    // Wait for debounce + processing
    await waitFor(
      () => {
        expect(screen.getByTestId("inline-serial-input")).toHaveValue("");
      },
      { timeout: 1500 },
    );
  }

  // ============================================================================
  // RETURNED PACK DETECTION TESTS
  // ============================================================================

  describe("Returned Pack Detection", () => {
    it("RETURNED-001: [P0] should detect returned pack and show specific error", async () => {
      // GIVEN: DayCloseModeScanner with returned packs data
      renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

      // WHEN: Scanning a pack that was returned (pack_number: 9999999)
      const returnedPackSerial = createSerial("0001", "9999999", "015");
      await typeSerial(returnedPackSerial);

      // THEN: Should show specific "Pack already returned" error
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Pack already returned",
            variant: "destructive",
          }),
        );
      });
    });

    it("RETURNED-002: [P0] should include game name in error message", async () => {
      // GIVEN: DayCloseModeScanner with returned packs data
      renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

      // WHEN: Scanning a returned pack
      const returnedPackSerial = createSerial("0001", "9999999", "015");
      await typeSerial(returnedPackSerial);

      // THEN: Error message should include game name "Cash Bonanza"
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            description: expect.stringContaining("Cash Bonanza"),
          }),
        );
      });
    });

    it("RETURNED-003: [P1] should include pack number in error message", async () => {
      // GIVEN: DayCloseModeScanner with returned packs data
      renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

      // WHEN: Scanning a returned pack
      const returnedPackSerial = createSerial("0001", "9999999", "015");
      await typeSerial(returnedPackSerial);

      // THEN: Error message should include pack number
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            description: expect.stringContaining("9999999"),
          }),
        );
      });
    });

    it("RETURNED-004: [P1] should include formatted return date in message", async () => {
      // GIVEN: DayCloseModeScanner with returned packs data
      renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

      // WHEN: Scanning a returned pack (returned on Jan 6, 2026 at 2:30 PM)
      const returnedPackSerial = createSerial("0001", "9999999", "015");
      await typeSerial(returnedPackSerial);

      // THEN: Error message should include formatted date
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            description: expect.stringMatching(/Jan.*6/),
          }),
        );
      });
    });

    it("RETURNED-005: [P1] should guide user to Returned Packs section", async () => {
      // GIVEN: DayCloseModeScanner with returned packs data
      renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

      // WHEN: Scanning a returned pack
      const returnedPackSerial = createSerial("0001", "9999999", "015");
      await typeSerial(returnedPackSerial);

      // THEN: Error message should mention "Returned Packs section"
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            description: expect.stringContaining("Returned Packs section"),
          }),
        );
      });
    });
  });

  // ============================================================================
  // ERROR HANDLING BEHAVIOR TESTS
  // ============================================================================

  describe("Error Handling Behavior", () => {
    it("RETURNED-006: [P1] should play error sound when returned pack scanned", async () => {
      // GIVEN: DayCloseModeScanner with returned packs data
      renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

      // WHEN: Scanning a returned pack
      const returnedPackSerial = createSerial("0001", "9999999", "015");
      await typeSerial(returnedPackSerial);

      // THEN: Error sound should be played
      await waitFor(() => {
        expect(mockPlayError).toHaveBeenCalled();
      });
    });

    it("RETURNED-007: [P0] should clear input after returned pack error", async () => {
      // GIVEN: DayCloseModeScanner with returned packs data
      renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

      // WHEN: Scanning a returned pack
      const returnedPackSerial = createSerial("0001", "9999999", "015");
      await typeSerial(returnedPackSerial);

      // THEN: Input should be cleared
      const input = screen.getByTestId("inline-serial-input");
      expect(input).toHaveValue("");
    });

    it("RETURNED-010: [P0] should still show 'Pack not found' for unknown packs", async () => {
      // GIVEN: DayCloseModeScanner with returned packs data
      renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

      // WHEN: Scanning an unknown pack (not in active bins OR returned packs)
      const unknownPackSerial = createSerial("0001", "5555555", "015");
      await typeSerial(unknownPackSerial);

      // THEN: Should show generic "Pack not found" error
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Pack not found",
            description: expect.stringContaining("No active pack"),
          }),
        );
      });
    });
  });

  // ============================================================================
  // EDGE CASES - EMPTY/UNDEFINED RETURNED PACKS
  // ============================================================================

  describe("Edge Cases - Empty/Undefined returnedPacks", () => {
    it("RETURNED-008: [P1] should handle empty returnedPacks array gracefully", async () => {
      // GIVEN: DayCloseModeScanner with empty returnedPacks
      renderWithProviders(
        <DayCloseModeScanner {...defaultProps} returnedPacks={[]} />,
      );

      // WHEN: Scanning an unknown pack
      const unknownPackSerial = createSerial("0001", "9999999", "015");
      await typeSerial(unknownPackSerial);

      // THEN: Should show generic "Pack not found" (not crash)
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Pack not found",
          }),
        );
      });
    });

    it("RETURNED-009: [P1] should handle undefined returnedPacks gracefully", async () => {
      // GIVEN: DayCloseModeScanner without returnedPacks prop
      renderWithProviders(
        <DayCloseModeScanner {...defaultProps} returnedPacks={undefined} />,
      );

      // WHEN: Scanning an unknown pack
      const unknownPackSerial = createSerial("0001", "9999999", "015");
      await typeSerial(unknownPackSerial);

      // THEN: Should show generic "Pack not found" (not crash)
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Pack not found",
          }),
        );
      });
    });
  });

  // ============================================================================
  // MULTIPLE RETURNED PACKS TESTS
  // ============================================================================

  describe("Multiple Returned Packs", () => {
    it("RETURNED-MULTI-001: [P0] should detect second returned pack", async () => {
      // GIVEN: DayCloseModeScanner with multiple returned packs
      renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

      // WHEN: Scanning the second returned pack (pack_number: 8888888)
      const secondReturnedSerial = createSerial("0002", "8888888", "010");
      await typeSerial(secondReturnedSerial);

      // THEN: Should show error with "Money Bags" game name
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Pack already returned",
            description: expect.stringContaining("Money Bags"),
          }),
        );
      });
    });
  });

  // ============================================================================
  // ACTIVE PACK SCANNING (POSITIVE CASE)
  // ============================================================================

  describe("Active Pack Scanning (Positive Case)", () => {
    it("RETURNED-POSITIVE-001: [P0] should still process active packs normally", async () => {
      // GIVEN: DayCloseModeScanner with both active and returned packs
      renderWithProviders(<DayCloseModeScanner {...defaultProps} />);

      // WHEN: Scanning an active pack (pack_number: 1234567)
      const activePackSerial = createSerial("0001", "1234567", "025");
      await typeSerial(activePackSerial);

      // THEN: Should show success message, not error
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Bin scanned",
          }),
        );
      });
      expect(mockPlaySuccess).toHaveBeenCalled();
    });
  });
});
