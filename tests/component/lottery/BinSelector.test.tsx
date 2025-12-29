/**
 * BinSelector Component Tests
 *
 * Test file for BinSelector component used in lottery pack activation.
 * This component provides bin selection with occupation status indication.
 *
 * ============================================================================
 * TRACEABILITY MATRIX
 * ============================================================================
 * | Test ID                    | Requirement              | Category         |
 * |----------------------------|--------------------------|------------------|
 * | BS-001                     | Render selector UI       | Component        |
 * | BS-002                     | Render with custom props | Component        |
 * | BS-003                     | Display bin numbers      | Assertions       |
 * | BS-004                     | Show occupation status   | Business Logic   |
 * | BS-005                     | Selection callback       | Integration      |
 * | BS-006                     | Occupied bin info        | Business Logic   |
 * | BS-007                     | (Removed - no checkbox)  | -                |
 * | BS-008                     | Empty bins state         | Edge Cases       |
 * | BS-009                     | Disabled state           | Edge Cases       |
 * | BS-010                     | Error display            | Assertions       |
 * | BS-011                     | XSS prevention output    | Security         |
 * ============================================================================
 *
 * Key Features Tested:
 * - Bin selection dropdown displaying bin numbers (Bin 1, Bin 2, etc.)
 * - Occupation status indication (badge showing game name and pack number)
 * - Info message when selecting occupied bin (existing pack will be marked as sold)
 * - Selection callback with full bin data
 * - Disabled state handling
 * - Error message display
 *
 * MCP Guidance Applied:
 * - FE-002: FORM_VALIDATION - Controlled component with validation
 * - SEC-014: INPUT_VALIDATION - UUID validation for bin_id
 * - SEC-004: XSS - React auto-escapes output (validated)
 *
 * @story Pack Activation UX Enhancement
 * @priority P0 (Critical - Core Feature)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  BinSelector,
  type BinSelectorProps,
} from "@/components/lottery/BinSelector";
import type { DayBin } from "@/lib/api/lottery";

// Mock bins data
const mockBins: DayBin[] = [
  {
    bin_id: "bin-1",
    bin_number: 1,
    name: "Bin A",
    is_active: true,
    pack: null, // Empty bin
  },
  {
    bin_id: "bin-2",
    bin_number: 2,
    name: "Bin B",
    is_active: true,
    pack: {
      pack_id: "pack-existing",
      pack_number: "12345",
      game_name: "Mega Millions",
      game_price: 5.0,
      starting_serial: "001",
      ending_serial: "050",
      serial_end: "150",
    },
  },
  {
    bin_id: "bin-3",
    bin_number: 3,
    name: "Bin C",
    is_active: true,
    pack: null,
  },
];

describe("BinSelector", () => {
  const defaultProps: BinSelectorProps = {
    bins: mockBins,
    onValueChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // SECTION 1: COMPONENT RENDERING (BS-001, BS-002)
  // ============================================================================

  describe("Component Rendering", () => {
    it("BS-001: should render selector with default props", () => {
      render(<BinSelector {...defaultProps} />);

      expect(screen.getByText("Target Bin")).toBeInTheDocument();
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    it("BS-002: should render with custom label", () => {
      render(<BinSelector {...defaultProps} label="Select Destination Bin" />);

      expect(screen.getByText("Select Destination Bin")).toBeInTheDocument();
    });

    it("should render with custom placeholder", async () => {
      const user = userEvent.setup();
      render(<BinSelector {...defaultProps} placeholder="Choose a bin..." />);

      // Open the select to see placeholder
      const trigger = screen.getByRole("combobox");
      await user.click(trigger);

      // The placeholder should be visible when no value is selected
      expect(trigger).toHaveTextContent("Choose a bin...");
    });

    it("BS-009: should be disabled when disabled prop is true", () => {
      render(<BinSelector {...defaultProps} disabled={true} />);

      expect(screen.getByRole("combobox")).toBeDisabled();
    });

    it("BS-010: should display error message when error prop is provided", () => {
      render(
        <BinSelector {...defaultProps} error="Please select a valid bin" />,
      );

      expect(screen.getByText("Please select a valid bin")).toBeInTheDocument();
    });

    it("should render with testId prop", () => {
      render(<BinSelector {...defaultProps} testId="bin-selector-test" />);

      expect(screen.getByTestId("bin-selector-test")).toBeInTheDocument();
    });
  });

  // ============================================================================
  // SECTION 2: BIN DISPLAY (BS-003, BS-004)
  // ============================================================================

  describe("Bin Display", () => {
    it("BS-003: should display all bins in dropdown with bin numbers", async () => {
      const user = userEvent.setup();
      render(<BinSelector {...defaultProps} />);

      const trigger = screen.getByRole("combobox");
      await user.click(trigger);

      await waitFor(() => {
        // Component now displays "Bin {number}" only, not the redundant name
        expect(screen.getByText("Bin 1")).toBeInTheDocument();
        expect(screen.getByText("Bin 2")).toBeInTheDocument();
        expect(screen.getByText("Bin 3")).toBeInTheDocument();
      });
    });

    it("BS-004: should show occupation badge for occupied bins", async () => {
      const user = userEvent.setup();
      render(<BinSelector {...defaultProps} />);

      const trigger = screen.getByRole("combobox");
      await user.click(trigger);

      await waitFor(() => {
        // Bin 2 has a pack - should show badge with game name and pack number
        expect(screen.getByText(/Mega Millions/)).toBeInTheDocument();
        expect(screen.getByText(/#12345/)).toBeInTheDocument();
      });
    });

    it("BS-008: should show empty state when no bins available", async () => {
      const user = userEvent.setup();
      render(<BinSelector {...defaultProps} bins={[]} />);

      const trigger = screen.getByRole("combobox");
      await user.click(trigger);

      await waitFor(() => {
        expect(screen.getByText("No bins configured")).toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // SECTION 3: SELECTION BEHAVIOR (BS-005)
  // ============================================================================

  describe("Selection Behavior", () => {
    it("BS-005: should call onValueChange when bin is selected", async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();

      render(<BinSelector {...defaultProps} onValueChange={onValueChange} />);

      const trigger = screen.getByRole("combobox");
      await user.click(trigger);

      await waitFor(() => {
        expect(screen.getByText("Bin 1")).toBeInTheDocument();
      });

      // Click on Bin 1 (the first option) - component now shows "Bin {number}" format
      const option = screen.getByText("Bin 1").closest('[role="option"]');
      if (option) {
        await user.click(option);
      }

      expect(onValueChange).toHaveBeenCalledWith(
        "bin-1",
        expect.objectContaining({
          bin_id: "bin-1",
          bin_number: 1,
          name: "Bin A",
        }),
      );
    });

    it("should display selected bin in trigger", async () => {
      const user = userEvent.setup();
      render(<BinSelector {...defaultProps} value="bin-1" />);

      const trigger = screen.getByRole("combobox");

      // With value set, the trigger should show the selected bin
      expect(trigger).toHaveTextContent("Bin 1");
    });
  });

  // ============================================================================
  // SECTION 4: OCCUPIED BIN INFO MESSAGE (BS-006)
  // ============================================================================

  describe("Occupied Bin Info Message", () => {
    it("BS-006: should show info message when selecting occupied bin", async () => {
      const onValueChange = vi.fn();

      render(
        <BinSelector
          {...defaultProps}
          value="bin-2"
          onValueChange={onValueChange}
        />,
      );

      // Info message should be displayed for occupied bin
      await waitFor(() => {
        const warning = screen.getByTestId("occupied-bin-warning");
        expect(warning).toBeInTheDocument();
        expect(screen.getByText(/Bin 2 currently has/)).toBeInTheDocument();
        // Use within to find Mega Millions in the warning message specifically
        // (it also appears in the dropdown trigger as a badge)
        expect(within(warning).getByText(/Mega Millions/)).toBeInTheDocument();
        expect(screen.getByText(/will be marked as sold/i)).toBeInTheDocument();
      });
    });

    it("should not show auto-deplete checkbox (depletion is automatic)", async () => {
      render(<BinSelector {...defaultProps} value="bin-2" />);

      // No checkbox should exist - depletion is now automatic
      expect(
        screen.queryByTestId("auto-deplete-checkbox"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/auto-deplete existing pack/i),
      ).not.toBeInTheDocument();
    });

    it("should not show info message for empty bin", () => {
      render(<BinSelector {...defaultProps} value="bin-1" />);

      expect(
        screen.queryByTestId("occupied-bin-warning"),
      ).not.toBeInTheDocument();
    });
  });

  // ============================================================================
  // SECTION 5: SECURITY (BS-011)
  // ============================================================================

  describe("Security", () => {
    it("BS-011: should safely render bin data with special characters (XSS prevention)", async () => {
      const user = userEvent.setup();
      const xssBins: DayBin[] = [
        {
          bin_id: "bin-xss",
          bin_number: 1,
          name: "<script>alert('xss')</script>",
          is_active: true,
          pack: {
            pack_id: "pack-xss",
            pack_number: "<img src=x onerror=alert(1)>",
            game_name: "<script>document.cookie</script>",
            game_price: 5.0,
            starting_serial: "001",
            ending_serial: "050",
            serial_end: "100",
          },
        },
      ];

      render(<BinSelector {...defaultProps} bins={xssBins} />);

      const trigger = screen.getByRole("combobox");
      await user.click(trigger);

      // React auto-escapes - text should be displayed literally, not executed
      await waitFor(() => {
        const listbox = document.querySelector('[role="listbox"]');
        expect(listbox?.textContent).toContain("<script>");
        // The dangerous content should NOT be executed
      });
    });
  });

  // ============================================================================
  // SECTION 6: EDGE CASES
  // ============================================================================

  describe("Edge Cases", () => {
    it("should handle bin with missing pack data gracefully", () => {
      const binsWithNullPack: DayBin[] = [
        {
          bin_id: "bin-null",
          bin_number: 1,
          name: "Empty Bin",
          is_active: true,
          pack: null,
        },
      ];

      render(
        <BinSelector
          {...defaultProps}
          bins={binsWithNullPack}
          value="bin-null"
        />,
      );

      // Should not show warning for null pack
      expect(
        screen.queryByTestId("occupied-bin-warning"),
      ).not.toBeInTheDocument();
    });

    it("should handle undefined value gracefully", () => {
      render(<BinSelector {...defaultProps} value={undefined} />);

      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });
  });
});
