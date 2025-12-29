/**
 * BinSelectionModal Component Tests
 *
 * Test file for BinSelectionModal component used in batch pack activation.
 * This component provides a sub-modal for selecting a target bin for a scanned pack.
 *
 * ============================================================================
 * TRACEABILITY MATRIX
 * ============================================================================
 * | Test ID                    | Requirement              | Category         |
 * |----------------------------|--------------------------|------------------|
 * | BSM-001                    | Render modal UI          | Component        |
 * | BSM-002                    | Display pack details     | Component        |
 * | BSM-003                    | Render bin selector      | Component        |
 * | BSM-004                    | Filter pending bins      | Business Logic   |
 * | BSM-005                    | Bin selection callback   | Integration      |
 * | BSM-006                    | Cancel button            | Business Logic   |
 * | BSM-007                    | Add button disabled      | Assertions       |
 * | BSM-008                    | Add button enabled       | Assertions       |
 * | BSM-009                    | Modal close on add       | Business Logic   |
 * | BSM-010                    | Occupied bin detection   | Business Logic   |
 * | BSM-011                    | Reset on reopen          | Business Logic   |
 * | BSM-012                    | Not render when no pack  | Edge Cases       |
 * | BSM-013                    | All pending bins filter  | Security         |
 * | BSM-014                    | Proper testids           | Accessibility    |
 * ============================================================================
 *
 * Key Features Tested:
 * - Modal rendering with pack details
 * - Bin selection from filtered dropdown
 * - Pending bin filtering (prevents duplicate bin assignment)
 * - Occupied bin detection for replacement workflow
 * - Selection state management
 *
 * MCP Guidance Applied:
 * - FE-002: FORM_VALIDATION - Validates bin selection before add
 * - SEC-014: INPUT_VALIDATION - UUID validation, filters pending bins
 * - FE-005: UI_SECURITY - No secrets exposed in UI
 * - SEC-004: XSS - React auto-escapes output
 *
 * @story Batch Pack Activation
 * @priority P0 (Critical - Core Feature)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BinSelectionModal } from "@/components/lottery/BinSelectionModal";
import type { PackSearchOption } from "@/components/lottery/PackSearchCombobox";
import type { DayBin } from "@/lib/api/lottery";

// Test UUIDs
const TEST_BIN_ID_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TEST_BIN_ID_2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const TEST_BIN_ID_3 = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const TEST_PACK_ID = "11111111-1111-1111-1111-111111111111";

// Mock BinSelector to control selection behavior
vi.mock("@/components/lottery/BinSelector", () => ({
  BinSelector: vi.fn(({ bins, value, onValueChange, testId }) => (
    <div data-testid={testId}>
      <select
        data-testid={`${testId}-select`}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      >
        <option value="">Select a bin...</option>
        {bins.map((bin: DayBin) => (
          <option key={bin.bin_id} value={bin.bin_id}>
            Bin {bin.bin_number} - {bin.name}
            {bin.pack ? " (occupied)" : ""}
          </option>
        ))}
      </select>
      <div data-testid={`${testId}-bin-count`}>
        {bins.length} bins available
      </div>
    </div>
  )),
}));

// Mock pack data
const mockPack: PackSearchOption = {
  pack_id: TEST_PACK_ID,
  pack_number: "12345",
  game_id: "game-1",
  game_name: "Mega Millions",
  game_price: 2.0,
  serial_start: "001",
  serial_end: "150",
};

// Mock bins data
const mockBins: DayBin[] = [
  {
    bin_id: TEST_BIN_ID_1,
    bin_number: 1,
    name: "Bin A",
    is_active: true,
    pack: null,
  },
  {
    bin_id: TEST_BIN_ID_2,
    bin_number: 2,
    name: "Bin B",
    is_active: true,
    pack: {
      pack_id: "existing-pack-1",
      pack_number: "99999",
      game_name: "Existing Game",
      game_price: 3.0,
      starting_serial: "001",
      ending_serial: "050",
      serial_end: "100",
    },
  },
  {
    bin_id: TEST_BIN_ID_3,
    bin_number: 3,
    name: "Bin C",
    is_active: true,
    pack: null,
  },
];

describe("BinSelectionModal", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    pack: mockPack,
    bins: mockBins,
    pendingBinIds: [] as string[],
    onConfirm: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ============================================================================
  // SECTION 1: COMPONENT RENDERING (BSM-001, BSM-002, BSM-003)
  // ============================================================================

  describe("Component Rendering", () => {
    it("BSM-001: should render modal when open and pack is provided", async () => {
      render(<BinSelectionModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
        expect(screen.getByText("Select Bin")).toBeInTheDocument();
      });
    });

    it("BSM-002: should display pack details correctly", async () => {
      render(<BinSelectionModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText("Pack Details")).toBeInTheDocument();
        expect(screen.getByText("Mega Millions")).toBeInTheDocument();
        expect(screen.getByText("12345")).toBeInTheDocument();
        expect(screen.getByText("$2")).toBeInTheDocument();
        expect(screen.getByText("001 - 150")).toBeInTheDocument();
      });
    });

    it("BSM-003: should render bin selector component", async () => {
      render(<BinSelectionModal {...defaultProps} />);

      await waitFor(() => {
        expect(
          screen.getByTestId("bin-selection-dropdown"),
        ).toBeInTheDocument();
      });
    });

    it("BSM-012: should not render content when pack is null", () => {
      render(<BinSelectionModal {...defaultProps} pack={null} />);

      expect(
        screen.queryByTestId("bin-selection-modal"),
      ).not.toBeInTheDocument();
    });

    it("should not render when open is false", () => {
      render(<BinSelectionModal {...defaultProps} open={false} />);

      expect(
        screen.queryByTestId("bin-selection-modal"),
      ).not.toBeInTheDocument();
    });

    it("BSM-014: should have proper testids for automation", async () => {
      render(<BinSelectionModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
        expect(
          screen.getByTestId("bin-selection-dropdown"),
        ).toBeInTheDocument();
        expect(screen.getByTestId("bin-selection-cancel")).toBeInTheDocument();
        expect(screen.getByTestId("bin-selection-add")).toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // SECTION 2: PENDING BIN FILTERING (BSM-004, BSM-013) - CRITICAL SECURITY
  // ============================================================================

  describe("Pending Bin Filtering", () => {
    it("BSM-004: should filter out bins already in pending list", async () => {
      render(
        <BinSelectionModal
          {...defaultProps}
          pendingBinIds={[TEST_BIN_ID_1]} // Bin 1 is pending
        />,
      );

      await waitFor(() => {
        // The mock BinSelector shows bin count
        expect(
          screen.getByTestId("bin-selection-dropdown-bin-count"),
        ).toHaveTextContent("2 bins available");
      });
    });

    it("BSM-013: should filter out multiple pending bins", async () => {
      render(
        <BinSelectionModal
          {...defaultProps}
          pendingBinIds={[TEST_BIN_ID_1, TEST_BIN_ID_3]} // Two bins pending
        />,
      );

      await waitFor(() => {
        // Only Bin B (index 2) should be available
        expect(
          screen.getByTestId("bin-selection-dropdown-bin-count"),
        ).toHaveTextContent("1 bins available");
      });
    });

    it("should show all bins when no pending bins", async () => {
      render(<BinSelectionModal {...defaultProps} pendingBinIds={[]} />);

      await waitFor(() => {
        expect(
          screen.getByTestId("bin-selection-dropdown-bin-count"),
        ).toHaveTextContent("3 bins available");
      });
    });

    it("should handle all bins being pending (empty dropdown)", async () => {
      render(
        <BinSelectionModal
          {...defaultProps}
          pendingBinIds={[TEST_BIN_ID_1, TEST_BIN_ID_2, TEST_BIN_ID_3]}
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByTestId("bin-selection-dropdown-bin-count"),
        ).toHaveTextContent("0 bins available");
      });
    });
  });

  // ============================================================================
  // SECTION 3: BUTTON STATES (BSM-007, BSM-008)
  // ============================================================================

  describe("Button States", () => {
    it("BSM-007: should disable Add button when no bin is selected", async () => {
      render(<BinSelectionModal {...defaultProps} />);

      await waitFor(() => {
        const addButton = screen.getByTestId("bin-selection-add");
        expect(addButton).toBeDisabled();
      });
    });

    it("BSM-008: should enable Add button when bin is selected", async () => {
      const user = userEvent.setup();
      render(<BinSelectionModal {...defaultProps} />);

      const select = screen.getByTestId("bin-selection-dropdown-select");
      await user.selectOptions(select, TEST_BIN_ID_1);

      await waitFor(() => {
        const addButton = screen.getByTestId("bin-selection-add");
        expect(addButton).not.toBeDisabled();
      });
    });
  });

  // ============================================================================
  // SECTION 4: SELECTION AND CALLBACK (BSM-005, BSM-009, BSM-010)
  // ============================================================================

  describe("Selection and Callback", () => {
    it("BSM-005: should call onConfirm with correct parameters when Add is clicked", async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();

      render(<BinSelectionModal {...defaultProps} onConfirm={onConfirm} />);

      // Select a bin
      const select = screen.getByTestId("bin-selection-dropdown-select");
      await user.selectOptions(select, TEST_BIN_ID_1);

      // Click Add button
      const addButton = screen.getByTestId("bin-selection-add");
      await user.click(addButton);

      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalledWith(
          TEST_BIN_ID_1,
          expect.objectContaining({
            bin_id: TEST_BIN_ID_1,
            bin_number: 1,
            name: "Bin A",
          }),
          false, // Bin A is not occupied
        );
      });
    });

    it("BSM-009: should close modal when Add is clicked", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();

      render(
        <BinSelectionModal {...defaultProps} onOpenChange={onOpenChange} />,
      );

      // Select a bin
      const select = screen.getByTestId("bin-selection-dropdown-select");
      await user.selectOptions(select, TEST_BIN_ID_1);

      // Click Add button
      const addButton = screen.getByTestId("bin-selection-add");
      await user.click(addButton);

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it("BSM-010: should detect occupied bin and pass depletesPrevious=true", async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();

      render(<BinSelectionModal {...defaultProps} onConfirm={onConfirm} />);

      // Select occupied bin (Bin B has a pack)
      const select = screen.getByTestId("bin-selection-dropdown-select");
      await user.selectOptions(select, TEST_BIN_ID_2);

      // Click Add button
      const addButton = screen.getByTestId("bin-selection-add");
      await user.click(addButton);

      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalledWith(
          TEST_BIN_ID_2,
          expect.objectContaining({
            bin_id: TEST_BIN_ID_2,
            bin_number: 2,
            name: "Bin B",
          }),
          true, // Bin B is occupied
        );
      });
    });
  });

  // ============================================================================
  // SECTION 5: CANCEL BEHAVIOR (BSM-006)
  // ============================================================================

  describe("Cancel Behavior", () => {
    it("BSM-006: should call onOpenChange(false) when Cancel is clicked", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();

      render(
        <BinSelectionModal {...defaultProps} onOpenChange={onOpenChange} />,
      );

      const cancelButton = screen.getByTestId("bin-selection-cancel");
      await user.click(cancelButton);

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("should not call onConfirm when Cancel is clicked", async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();

      render(<BinSelectionModal {...defaultProps} onConfirm={onConfirm} />);

      const cancelButton = screen.getByTestId("bin-selection-cancel");
      await user.click(cancelButton);

      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // SECTION 6: STATE RESET (BSM-011)
  // ============================================================================

  describe("State Reset", () => {
    it("BSM-011: should reset selection when modal reopens with new pack", async () => {
      const user = userEvent.setup();

      const { rerender } = render(<BinSelectionModal {...defaultProps} />);

      // Select a bin
      const select = screen.getByTestId("bin-selection-dropdown-select");
      await user.selectOptions(select, TEST_BIN_ID_1);

      // Close modal
      rerender(<BinSelectionModal {...defaultProps} open={false} />);

      // Reopen with different pack
      const newPack: PackSearchOption = {
        ...mockPack,
        pack_id: "new-pack-id",
        pack_number: "99999",
      };
      rerender(
        <BinSelectionModal {...defaultProps} open={true} pack={newPack} />,
      );

      await waitFor(() => {
        const selectElement = screen.getByTestId(
          "bin-selection-dropdown-select",
        ) as HTMLSelectElement;
        expect(selectElement.value).toBe("");
      });
    });

    it("should reset selection when modal reopens with same pack", async () => {
      const user = userEvent.setup();

      const { rerender } = render(<BinSelectionModal {...defaultProps} />);

      // Select a bin
      const select = screen.getByTestId("bin-selection-dropdown-select");
      await user.selectOptions(select, TEST_BIN_ID_1);

      // Close and reopen modal
      rerender(<BinSelectionModal {...defaultProps} open={false} />);
      rerender(<BinSelectionModal {...defaultProps} open={true} />);

      await waitFor(() => {
        const selectElement = screen.getByTestId(
          "bin-selection-dropdown-select",
        ) as HTMLSelectElement;
        expect(selectElement.value).toBe("");
      });
    });
  });

  // ============================================================================
  // SECTION 7: EDGE CASES
  // ============================================================================

  describe("Edge Cases", () => {
    it("should handle pack with null game_price", async () => {
      const packWithNullPrice: PackSearchOption = {
        ...mockPack,
        game_price: null,
      };

      render(<BinSelectionModal {...defaultProps} pack={packWithNullPrice} />);

      await waitFor(() => {
        expect(screen.getByText("N/A")).toBeInTheDocument();
      });
    });

    it("should handle empty bins array", async () => {
      render(<BinSelectionModal {...defaultProps} bins={[]} />);

      await waitFor(() => {
        expect(
          screen.getByTestId("bin-selection-dropdown-bin-count"),
        ).toHaveTextContent("0 bins available");
      });
    });

    it("should not crash when clicking Add with no available bins", async () => {
      render(<BinSelectionModal {...defaultProps} bins={[]} />);

      // Add button should be disabled
      const addButton = screen.getByTestId("bin-selection-add");
      expect(addButton).toBeDisabled();
    });
  });

  // ============================================================================
  // SECTION 8: ACCESSIBILITY
  // ============================================================================

  describe("Accessibility", () => {
    it("should have descriptive dialog title and description", async () => {
      render(<BinSelectionModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText("Select Bin")).toBeInTheDocument();
        expect(
          screen.getByText(/choose a bin for this pack/i),
        ).toBeInTheDocument();
      });
    });

    it("should have Cancel and Add buttons with proper labels", async () => {
      render(<BinSelectionModal {...defaultProps} />);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /cancel/i }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: /add to list/i }),
        ).toBeInTheDocument();
      });
    });
  });
});
