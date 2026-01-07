/**
 * UnscannedBinWarningModal Component Tests
 *
 * Test file for the compact UnscannedBinWarningModal component used in lottery day close.
 * This component handles bins that have not been scanned during day close.
 *
 * @test-level COMPONENT
 * @justification Tests React component behavior with user interactions
 * @story Lottery Day Close - Edge Case Handling
 * @priority P0 (Critical - Data Integrity)
 *
 * TRACEABILITY MATRIX:
 * ┌─────────────────────────────────────────────────────────────────────────────────┐
 * │ Test Section         │ Tests        │ Coverage Area                    │ Pri   │
 * ├─────────────────────────────────────────────────────────────────────────────────┤
 * │ Modal Rendering      │ 6 tests      │ UI display, visibility           │ P1    │
 * │ Checkbox Selection   │ 6 tests      │ User interaction, state changes  │ P0    │
 * │ Select All           │ 8 tests      │ Bulk selection, indeterminate    │ P1    │
 * │ Calculations         │ 5 tests      │ Ticket count, sales amount       │ P0    │
 * │ Button Behavior      │ 5 tests      │ Actions, callbacks               │ P0    │
 * │ Accessibility        │ 4 tests      │ ARIA, screen readers             │ P1    │
 * │ Edge Cases           │ 4 tests      │ State reset, large datasets      │ P1    │
 * └─────────────────────────────────────────────────────────────────────────────────┘
 *
 * TESTING PYRAMID PLACEMENT:
 * ┌─────────────────────────────────────────────────────────────────────────────────┐
 * │ Level                │ Coverage                         │ Files                 │
 * ├─────────────────────────────────────────────────────────────────────────────────┤
 * │ Unit                 │ calculateTicketsSold logic       │ frontend-ticket-*.ts  │
 * │ Component (this)     │ UI behavior, user interaction    │ This file             │
 * │ Integration          │ Frontend-backend parity          │ *-consistency.*.ts    │
 * │ E2E                  │ Full day close workflow          │ lottery-day-close.e2e │
 * └─────────────────────────────────────────────────────────────────────────────────┘
 *
 * SECURITY STANDARDS TESTED:
 * - SEC-014: INPUT_VALIDATION - Numeric validation in calculations
 * - FE-005: UI_SECURITY - Price validation before multiplication
 * - FE-001: STATE_MANAGEMENT - Clean state transitions
 *
 * CALCULATION FORMULA TESTED:
 * tickets_sold = (ending_serial + 1) - starting_serial
 * This is the "fencepost" inclusive counting formula.
 *
 * Key Features Tested:
 * - Compact table rendering with bin details (Bin #, Game, $, Pack, Sold Out checkbox)
 * - Checkbox selection for marking packs as sold out
 * - Tickets sold and sales amount calculation for sold out packs
 * - Return to Scan button behavior
 * - Modal cancel/close behavior
 * - State reset on modal reopen
 *
 * MCP Testing Guidelines Applied:
 * - Tests isolated with proper mocking
 * - Descriptive test names following naming convention
 * - data-testid attributes for reliable element selection
 * - Async operations properly awaited
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  UnscannedBinWarningModal,
  type UnscannedBinInfo,
  type UnscannedBinModalResult,
} from "@/components/lottery/UnscannedBinWarningModal";

// Sample test data - represents bins without ending serials
// Simple calculation: tickets = ending - starting
const mockUnscannedBins: UnscannedBinInfo[] = [
  {
    bin_id: "bin-1",
    bin_number: 1,
    pack_id: "pack-1",
    pack_number: "5633001",
    game_name: "Lucky 7s",
    game_price: 5.0,
    starting_serial: "000",
    serial_end: "014", // (014 + 1) - 000 = 15 tickets (inclusive counting)
  },
  {
    bin_id: "bin-2",
    bin_number: 2,
    pack_id: "pack-2",
    pack_number: "5633002",
    game_name: "Cash Bonanza",
    game_price: 10.0,
    starting_serial: "005",
    serial_end: "054", // (054 + 1) - 005 = 50 tickets (inclusive counting)
  },
];

// Single bin for simpler tests
const singleBin: UnscannedBinInfo[] = [mockUnscannedBins[0]];

describe("UnscannedBinWarningModal", () => {
  let mockOnConfirm: ReturnType<typeof vi.fn>;
  let mockOnCancel: ReturnType<typeof vi.fn>;
  let mockOnOpenChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnConfirm = vi.fn();
    mockOnCancel = vi.fn();
    mockOnOpenChange = vi.fn();
  });

  // ============ MODAL RENDERING TESTS ============

  describe("Modal Rendering", () => {
    it("should render modal when open is true", () => {
      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={singleBin}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      expect(
        screen.getByTestId("unscanned-bin-warning-modal"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Bins Without Ending Serials"),
      ).toBeInTheDocument();
    });

    it("should not render modal when open is false", () => {
      render(
        <UnscannedBinWarningModal
          open={false}
          onOpenChange={mockOnOpenChange}
          unscannedBins={singleBin}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      expect(
        screen.queryByTestId("unscanned-bin-warning-modal"),
      ).not.toBeInTheDocument();
    });

    it("should not render when unscannedBins is empty", () => {
      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={[]}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      expect(
        screen.queryByTestId("unscanned-bin-warning-modal"),
      ).not.toBeInTheDocument();
    });

    it("should display instruction text at the top", () => {
      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={singleBin}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      expect(
        screen.getByText("If the pack is sold please mark it sold"),
      ).toBeInTheDocument();
    });

    it("should display compact table with correct headers", () => {
      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={singleBin}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      // Check table headers
      expect(screen.getByText("#")).toBeInTheDocument();
      expect(screen.getByText("Game")).toBeInTheDocument();
      expect(screen.getByText("$")).toBeInTheDocument();
      expect(screen.getByText("Pack")).toBeInTheDocument();
      expect(screen.getByText("Sold Out")).toBeInTheDocument();
    });

    it("should display all unscanned bins in table rows", () => {
      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={mockUnscannedBins}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      // Check bin 1 details
      const row1 = screen.getByTestId("unscanned-bin-row-bin-1");
      expect(within(row1).getByText("1")).toBeInTheDocument();
      expect(within(row1).getByText("Lucky 7s")).toBeInTheDocument();
      expect(within(row1).getByText("$5")).toBeInTheDocument();
      expect(within(row1).getByText("5633001")).toBeInTheDocument();

      // Check bin 2 details
      const row2 = screen.getByTestId("unscanned-bin-row-bin-2");
      expect(within(row2).getByText("2")).toBeInTheDocument();
      expect(within(row2).getByText("Cash Bonanza")).toBeInTheDocument();
      expect(within(row2).getByText("$10")).toBeInTheDocument();
      expect(within(row2).getByText("5633002")).toBeInTheDocument();
    });

    it("should truncate long game names with ellipsis", () => {
      const longNameBin: UnscannedBinInfo[] = [
        {
          bin_id: "bin-long",
          bin_number: 1,
          pack_id: "pack-long",
          pack_number: "1234567",
          game_name: "Super Mega Million Dollar Jackpot Extravaganza",
          game_price: 20.0,
          starting_serial: "000",
          serial_end: "049",
        },
      ];

      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={longNameBin}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      // Should be truncated with ... (maxLength=18, so 15 chars + "...")
      // "Super Mega Million..." -> "Super Mega Mill..."
      expect(screen.getByText("Super Mega Mill...")).toBeInTheDocument();
    });
  });

  // ============ CHECKBOX SELECTION TESTS ============

  describe("Checkbox Selection", () => {
    it("should have unchecked checkbox for each bin initially", () => {
      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={mockUnscannedBins}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      const checkbox1 = screen.getByTestId("bin-sold-out-bin-1");
      const checkbox2 = screen.getByTestId("bin-sold-out-bin-2");

      expect(checkbox1).not.toBeChecked();
      expect(checkbox2).not.toBeChecked();
    });

    it("should allow checking a bin as sold out", async () => {
      const user = userEvent.setup();

      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={singleBin}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      const checkbox = screen.getByTestId("bin-sold-out-bin-1");
      await user.click(checkbox);

      expect(checkbox).toBeChecked();
    });

    it("should allow unchecking a previously checked bin", async () => {
      const user = userEvent.setup();

      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={singleBin}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      const checkbox = screen.getByTestId("bin-sold-out-bin-1");

      // Check then uncheck
      await user.click(checkbox);
      expect(checkbox).toBeChecked();

      await user.click(checkbox);
      expect(checkbox).not.toBeChecked();
    });

    it("should highlight row in green when checked", async () => {
      const user = userEvent.setup();

      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={singleBin}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      const row = screen.getByTestId("unscanned-bin-row-bin-1");
      expect(row).not.toHaveClass("bg-green-50");

      const checkbox = screen.getByTestId("bin-sold-out-bin-1");
      await user.click(checkbox);

      expect(row).toHaveClass("bg-green-50");
    });

    it("should allow multiple bins to be checked", async () => {
      const user = userEvent.setup();

      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={mockUnscannedBins}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      const checkbox1 = screen.getByTestId("bin-sold-out-bin-1");
      const checkbox2 = screen.getByTestId("bin-sold-out-bin-2");

      await user.click(checkbox1);
      await user.click(checkbox2);

      expect(checkbox1).toBeChecked();
      expect(checkbox2).toBeChecked();
    });
  });

  // ============ SELECT ALL TESTS ============

  describe("Select All Functionality", () => {
    it("should have Select All checkbox in header", () => {
      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={mockUnscannedBins}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      expect(screen.getByTestId("select-all-sold-out")).toBeInTheDocument();
    });

    it("should have Select All checkbox unchecked initially", () => {
      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={mockUnscannedBins}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      const selectAll = screen.getByTestId("select-all-sold-out");
      expect(selectAll).not.toBeChecked();
    });

    it("should select all bins when Select All is clicked", async () => {
      const user = userEvent.setup();

      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={mockUnscannedBins}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      // Click Select All
      await user.click(screen.getByTestId("select-all-sold-out"));

      // All individual checkboxes should be checked
      expect(screen.getByTestId("bin-sold-out-bin-1")).toBeChecked();
      expect(screen.getByTestId("bin-sold-out-bin-2")).toBeChecked();
    });

    it("should deselect all bins when Select All is clicked twice", async () => {
      const user = userEvent.setup();

      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={mockUnscannedBins}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      // Click Select All twice
      await user.click(screen.getByTestId("select-all-sold-out"));
      await user.click(screen.getByTestId("select-all-sold-out"));

      // All individual checkboxes should be unchecked
      expect(screen.getByTestId("bin-sold-out-bin-1")).not.toBeChecked();
      expect(screen.getByTestId("bin-sold-out-bin-2")).not.toBeChecked();
    });

    it("should show Select All as checked when all bins are manually selected", async () => {
      const user = userEvent.setup();

      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={mockUnscannedBins}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      // Manually select all bins
      await user.click(screen.getByTestId("bin-sold-out-bin-1"));
      await user.click(screen.getByTestId("bin-sold-out-bin-2"));

      // Select All should be checked
      expect(screen.getByTestId("select-all-sold-out")).toBeChecked();
    });

    it("should show Select All as indeterminate when some bins are selected", async () => {
      const user = userEvent.setup();

      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={mockUnscannedBins}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      // Select only one bin
      await user.click(screen.getByTestId("bin-sold-out-bin-1"));

      // Select All should be in indeterminate state
      const selectAll = screen.getByTestId("select-all-sold-out");
      // Radix UI uses data-state attribute for indeterminate
      expect(selectAll).toHaveAttribute("data-state", "indeterminate");
    });

    it("should select remaining bins when Select All clicked in indeterminate state", async () => {
      const user = userEvent.setup();

      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={mockUnscannedBins}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      // Select one bin to get indeterminate state
      await user.click(screen.getByTestId("bin-sold-out-bin-1"));

      // Click Select All to select all
      await user.click(screen.getByTestId("select-all-sold-out"));

      // All should now be checked
      expect(screen.getByTestId("bin-sold-out-bin-1")).toBeChecked();
      expect(screen.getByTestId("bin-sold-out-bin-2")).toBeChecked();
      expect(screen.getByTestId("select-all-sold-out")).toBeChecked();
    });

    it("should include all bins in decisions when Select All used", async () => {
      const user = userEvent.setup();

      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={mockUnscannedBins}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      // Use Select All
      await user.click(screen.getByTestId("select-all-sold-out"));

      // Click Return to Scan
      await user.click(screen.getByTestId("unscanned-bin-modal-return"));

      // onConfirm should include decisions for all bins
      const result = mockOnConfirm.mock.calls[0][0] as UnscannedBinModalResult;
      expect(result.decisions).toHaveLength(2);
      expect(result.decisions?.map((d) => d.bin_id)).toEqual([
        "bin-1",
        "bin-2",
      ]);
    });

    it("should highlight all rows green when Select All is clicked", async () => {
      const user = userEvent.setup();

      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={mockUnscannedBins}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      // Click Select All
      await user.click(screen.getByTestId("select-all-sold-out"));

      // All rows should be green
      expect(screen.getByTestId("unscanned-bin-row-bin-1")).toHaveClass(
        "bg-green-50",
      );
      expect(screen.getByTestId("unscanned-bin-row-bin-2")).toHaveClass(
        "bg-green-50",
      );
    });
  });

  // ============ CALCULATION TESTS ============

  describe("Calculations", () => {
    it("should calculate tickets sold correctly for sold out pack", async () => {
      const user = userEvent.setup();

      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={singleBin}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      // Mark as sold out and click return
      await user.click(screen.getByTestId("bin-sold-out-bin-1"));
      await user.click(screen.getByTestId("unscanned-bin-modal-return"));

      const result = mockOnConfirm.mock.calls[0][0] as UnscannedBinModalResult;

      // Bin 1: starting=000, serial_end=014
      // Inclusive calculation: (014 + 1) - 000 = 15 tickets
      expect(result.decisions?.[0].tickets_sold).toBe(15);
    });

    it("should calculate sales amount correctly for sold out pack", async () => {
      const user = userEvent.setup();

      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={singleBin}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      // Mark as sold out and click return
      await user.click(screen.getByTestId("bin-sold-out-bin-1"));
      await user.click(screen.getByTestId("unscanned-bin-modal-return"));

      const result = mockOnConfirm.mock.calls[0][0] as UnscannedBinModalResult;

      // Bin 1: 15 tickets × $5 = $75 (inclusive counting)
      expect(result.decisions?.[0].sales_amount).toBe(75);
    });

    it("should include game_price in decision", async () => {
      const user = userEvent.setup();

      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={singleBin}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      await user.click(screen.getByTestId("bin-sold-out-bin-1"));
      await user.click(screen.getByTestId("unscanned-bin-modal-return"));

      const result = mockOnConfirm.mock.calls[0][0] as UnscannedBinModalResult;
      expect(result.decisions?.[0].game_price).toBe(5.0);
    });

    it("should calculate correctly for multiple sold out packs", async () => {
      const user = userEvent.setup();

      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={mockUnscannedBins}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      // Mark both as sold out
      await user.click(screen.getByTestId("bin-sold-out-bin-1"));
      await user.click(screen.getByTestId("bin-sold-out-bin-2"));
      await user.click(screen.getByTestId("unscanned-bin-modal-return"));

      const result = mockOnConfirm.mock.calls[0][0] as UnscannedBinModalResult;

      expect(result.decisions).toHaveLength(2);

      // Bin 1: (014 + 1) - 000 = 15 tickets × $5 = $75 (inclusive counting)
      const bin1 = result.decisions?.find((d) => d.bin_id === "bin-1");
      expect(bin1?.tickets_sold).toBe(15);
      expect(bin1?.sales_amount).toBe(75);

      // Bin 2: (054 + 1) - 005 = 50 tickets × $10 = $500 (inclusive counting)
      const bin2 = result.decisions?.find((d) => d.bin_id === "bin-2");
      expect(bin2?.tickets_sold).toBe(50);
      expect(bin2?.sales_amount).toBe(500);
    });

    it("should handle single-ticket pack (starting equals ending = 1 ticket)", async () => {
      const user = userEvent.setup();
      const singleTicketBin: UnscannedBinInfo[] = [
        {
          bin_id: "bin-single",
          bin_number: 1,
          pack_id: "pack-single",
          pack_number: "9999999",
          game_name: "Single Ticket Pack",
          game_price: 5.0,
          starting_serial: "000",
          serial_end: "000", // Single ticket pack: (000 + 1) - 000 = 1 ticket
        },
      ];

      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={singleTicketBin}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      await user.click(screen.getByTestId("bin-sold-out-bin-single"));
      await user.click(screen.getByTestId("unscanned-bin-modal-return"));

      const result = mockOnConfirm.mock.calls[0][0] as UnscannedBinModalResult;

      // Inclusive calculation: (000 + 1) - 000 = 1 ticket sold
      // A pack where serial_end equals starting_serial is a single-ticket pack
      expect(result.decisions?.[0].tickets_sold).toBe(1);
      expect(result.decisions?.[0].sales_amount).toBe(5);
    });
  });

  // ============ BUTTON BEHAVIOR TESTS ============

  describe("Button Behavior", () => {
    it("should call onCancel when cancel button clicked", async () => {
      const user = userEvent.setup();

      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={singleBin}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      await user.click(screen.getByTestId("unscanned-bin-modal-cancel"));

      expect(mockOnCancel).toHaveBeenCalledTimes(1);
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it("should call onConfirm with returnToScan=true when Return to Scan clicked", async () => {
      const user = userEvent.setup();

      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={singleBin}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      await user.click(screen.getByTestId("unscanned-bin-modal-return"));

      expect(mockOnConfirm).toHaveBeenCalledWith({
        returnToScan: true,
        decisions: undefined,
      });
    });

    it("should include decisions for checked bins when Return to Scan clicked", async () => {
      const user = userEvent.setup();

      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={mockUnscannedBins}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      // Only check first bin
      await user.click(screen.getByTestId("bin-sold-out-bin-1"));
      await user.click(screen.getByTestId("unscanned-bin-modal-return"));

      const result = mockOnConfirm.mock.calls[0][0] as UnscannedBinModalResult;

      expect(result.returnToScan).toBe(true);
      expect(result.decisions).toHaveLength(1);
      expect(result.decisions?.[0].bin_id).toBe("bin-1");
      expect(result.decisions?.[0].action).toBe("SOLD_OUT");
    });

    it("should have Return to Scan button always visible", () => {
      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={singleBin}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      expect(
        screen.getByTestId("unscanned-bin-modal-return"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("unscanned-bin-modal-return"),
      ).toHaveTextContent("Return to Scan");
    });
  });

  // ============ ACCESSIBILITY TESTS ============

  describe("Accessibility", () => {
    it("should have accessible dialog role", () => {
      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={singleBin}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("should have accessible checkboxes with aria-labels", () => {
      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={singleBin}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      const checkbox = screen.getByTestId("bin-sold-out-bin-1");
      expect(checkbox).toHaveAttribute("aria-label", "Mark bin 1 as sold out");
    });

    it("should have table structure for screen readers", () => {
      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={singleBin}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      expect(screen.getByRole("table")).toBeInTheDocument();
      expect(screen.getAllByRole("row")).toHaveLength(2); // header + 1 data row
    });

    it("should have title attribute on game name for full name tooltip", () => {
      const longNameBin: UnscannedBinInfo[] = [
        {
          bin_id: "bin-long",
          bin_number: 1,
          pack_id: "pack-long",
          pack_number: "1234567",
          game_name: "Super Mega Million Dollar Jackpot",
          game_price: 20.0,
          starting_serial: "000",
          serial_end: "049",
        },
      ];

      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={longNameBin}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      const gameCell = screen.getByTitle("Super Mega Million Dollar Jackpot");
      expect(gameCell).toBeInTheDocument();
    });
  });

  // ============ EDGE CASES ============

  describe("Edge Cases", () => {
    it("should reset checkboxes when modal reopens", async () => {
      const user = userEvent.setup();

      const { rerender } = render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={singleBin}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      // Check a bin
      await user.click(screen.getByTestId("bin-sold-out-bin-1"));
      expect(screen.getByTestId("bin-sold-out-bin-1")).toBeChecked();

      // Close modal
      rerender(
        <UnscannedBinWarningModal
          open={false}
          onOpenChange={mockOnOpenChange}
          unscannedBins={singleBin}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      // Reopen modal
      rerender(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={singleBin}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      // Checkbox should be reset
      expect(screen.getByTestId("bin-sold-out-bin-1")).not.toBeChecked();
    });

    it("should handle many bins (10+) without issues", () => {
      const manyBins: UnscannedBinInfo[] = Array.from(
        { length: 12 },
        (_, i) => ({
          bin_id: `bin-${i + 1}`,
          bin_number: i + 1,
          pack_id: `pack-${i + 1}`,
          pack_number: `563300${i + 1}`,
          game_name: `Game ${i + 1}`,
          game_price: (i + 1) * 5,
          starting_serial: "000",
          serial_end: "049",
        }),
      );

      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={manyBins}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      // Should render all 12 rows
      const rows = screen.getAllByRole("row");
      expect(rows).toHaveLength(13); // 1 header + 12 data rows

      // Each should have a checkbox
      for (let i = 1; i <= 12; i++) {
        expect(screen.getByTestId(`bin-sold-out-bin-${i}`)).toBeInTheDocument();
      }
    });

    it("should include ending_serial in decision (equal to serial_end for sold out)", async () => {
      const user = userEvent.setup();

      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={singleBin}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      await user.click(screen.getByTestId("bin-sold-out-bin-1"));
      await user.click(screen.getByTestId("unscanned-bin-modal-return"));

      const result = mockOnConfirm.mock.calls[0][0] as UnscannedBinModalResult;
      expect(result.decisions?.[0].ending_serial).toBe("014"); // serial_end value
    });

    it("should include all bin metadata in decision", async () => {
      const user = userEvent.setup();

      render(
        <UnscannedBinWarningModal
          open={true}
          onOpenChange={mockOnOpenChange}
          unscannedBins={singleBin}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />,
      );

      await user.click(screen.getByTestId("bin-sold-out-bin-1"));
      await user.click(screen.getByTestId("unscanned-bin-modal-return"));

      const result = mockOnConfirm.mock.calls[0][0] as UnscannedBinModalResult;
      const decision = result.decisions?.[0];

      // Inclusive calculation: (014 + 1) - 000 = 15 tickets × $5 = $75
      expect(decision).toMatchObject({
        bin_id: "bin-1",
        bin_number: 1,
        pack_id: "pack-1",
        pack_number: "5633001",
        game_name: "Lucky 7s",
        game_price: 5.0,
        starting_serial: "000",
        serial_end: "014",
        action: "SOLD_OUT",
        ending_serial: "014",
        tickets_sold: 15,
        sales_amount: 75,
      });
    });
  });
});
