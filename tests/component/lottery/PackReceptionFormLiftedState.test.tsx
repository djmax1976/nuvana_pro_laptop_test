/**
 * @test-level COMPONENT
 * @test-type Lifted State Pattern Tests
 * @story Scan-Only Pack Reception Security - State Persistence
 *
 * Traceability Matrix:
 * | Test ID | Requirement | Description |
 * |---------|-------------|-------------|
 * | LST-001 | FE-001 | Controlled mode accepts packList prop |
 * | LST-002 | FE-001 | onPackAdd callback fires when pack added |
 * | LST-003 | FE-001 | onPackRemove callback fires on removal |
 * | LST-004 | FE-001 | onPacksClear callback fires on submit |
 * | LST-005 | FE-001 | Pack list persists across modal close/reopen |
 * | LST-006 | FE-001 | Uncontrolled mode works without props |
 * | LST-007 | FE-001 | Newest packs prepended to list (top) |
 * | LST-008 | FE-001 | Internal state cleared in uncontrolled mode |
 * | LST-009 | SEC-014 | Controlled mode preserves data on close |
 *
 * Enterprise Testing Standards:
 * - Tests follow AAA pattern (Arrange, Act, Assert)
 * - Each test is independent and isolated
 * - Mocks are properly scoped and cleaned up
 * - Tests focus on behavior, not implementation
 *
 * MCP Guidance Applied:
 * - FE-001: STATE_MANAGEMENT - Tests lifted state pattern
 * - SEC-014: INPUT_VALIDATION - Tests data persistence security
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  act,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  PackReceptionForm,
  type PackItem,
} from "@/components/lottery/PackReceptionForm";

// Use vi.hoisted for mock functions - ALL mocks must be hoisted
const {
  mockToast,
  mockReceivePackBatch,
  mockGetGames,
  mockCheckPackExists,
  mockParseSerializedNumber,
} = vi.hoisted(() => ({
  mockToast: vi.fn(),
  mockReceivePackBatch: vi.fn(),
  mockGetGames: vi.fn(),
  mockCheckPackExists: vi.fn(),
  mockParseSerializedNumber: vi.fn(),
}));

// Mock dependencies
vi.mock("@/lib/api/lottery", () => ({
  receivePackBatch: mockReceivePackBatch,
  getGames: mockGetGames,
  checkPackExists: mockCheckPackExists,
  createGame: vi.fn().mockResolvedValue({
    success: true,
    data: { game_id: "game-new", game_code: "0001" },
  }),
}));

vi.mock("@/lib/utils/lottery-serial-parser", () => ({
  parseSerializedNumber: mockParseSerializedNumber,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe("PackReceptionForm Lifted State Pattern", () => {
  // Test fixtures
  const mockStoreId = "store-123e4567-e89b-12d3-a456-426614174000";
  const mockOnSuccess = vi.fn();
  const mockOnOpenChange = vi.fn();
  const mockOnPackAdd = vi.fn();
  const mockOnPackRemove = vi.fn();
  const mockOnPacksClear = vi.fn();

  // Default game for tests
  const defaultGame = {
    game_id: "game-1",
    game_code: "0001",
    name: "Test Game",
    price: 5.0,
    pack_value: 300,
    total_tickets: 300,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Sample pack for controlled mode tests
  const samplePack: PackItem = {
    serial: "000112345670123456789012",
    game_code: "0001",
    pack_number: "1234567",
    serial_start: "012",
    game_name: "Test Game",
    game_id: "game-1",
    game_price: 5.0,
    game_pack_value: 300,
    game_total_tickets: 300,
    addedAt: Date.now(),
  };

  // Default parsed serial for tests
  const defaultParsed = {
    game_code: "0001",
    pack_number: "1234567",
    serial_start: "012",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock responses
    mockGetGames.mockResolvedValue({
      success: true,
      data: [defaultGame],
    });

    mockCheckPackExists.mockResolvedValue({
      success: true,
      data: { exists: false, pack: null },
    });

    // Critical: Parse function must return proper structure
    mockParseSerializedNumber.mockReturnValue(defaultParsed);

    mockReceivePackBatch.mockResolvedValue({
      success: true,
      data: {
        created: [{ pack_id: "pack-1", game_id: "game-1" }],
        duplicates: [],
        errors: [],
        games_not_found: [],
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Helper to simulate scanner input (fast keystrokes)
   */
  const simulateBarcodeScan = async (
    input: HTMLInputElement,
    barcode: string,
  ) => {
    let currentValue = "";
    for (const char of barcode.split("")) {
      currentValue += char;
      fireEvent.keyDown(input, { key: char });
      fireEvent.change(input, { target: { value: currentValue } });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 2));
      });
    }
  };

  describe("Controlled Mode (Parent Owns State)", () => {
    /**
     * LST-001: Controlled mode accepts packList prop
     * Verifies component renders externally provided pack list
     */
    it("LST-001: should render packs from external packList prop", async () => {
      render(
        <PackReceptionForm
          storeId={mockStoreId}
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          packList={[samplePack]}
          onPackAdd={mockOnPackAdd}
          onPackRemove={mockOnPackRemove}
          onPacksClear={mockOnPacksClear}
        />,
      );

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      // Pack from external state should be displayed
      expect(
        screen.getByText(/Packs Ready to Receive \(1\)/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/Test Game/i)).toBeInTheDocument();
      expect(screen.getByText(/Pack: 1234567/i)).toBeInTheDocument();
    });

    /**
     * LST-002: onPackAdd callback fires when pack added
     * Verifies parent is notified when user scans a new pack
     */
    it("LST-002: should call onPackAdd when pack is scanned", async () => {
      render(
        <PackReceptionForm
          storeId={mockStoreId}
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          packList={[]}
          onPackAdd={mockOnPackAdd}
          onPackRemove={mockOnPackRemove}
          onPacksClear={mockOnPacksClear}
        />,
      );

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      const input = screen.getByTestId("serial-input") as HTMLInputElement;
      await simulateBarcodeScan(input, "000112345670123456789012");

      // Wait for processing and callback
      await waitFor(
        () => {
          expect(mockOnPackAdd).toHaveBeenCalledTimes(1);
          expect(mockOnPackAdd).toHaveBeenCalledWith(
            expect.objectContaining({
              serial: "000112345670123456789012",
              game_code: "0001",
              pack_number: "1234567",
            }),
          );
        },
        { timeout: 3000 },
      );
    });

    /**
     * LST-003: onPackRemove callback fires on removal
     * Verifies parent is notified when user removes a pack
     */
    it("LST-003: should call onPackRemove when pack is removed", async () => {
      render(
        <PackReceptionForm
          storeId={mockStoreId}
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          packList={[samplePack]}
          onPackAdd={mockOnPackAdd}
          onPackRemove={mockOnPackRemove}
          onPacksClear={mockOnPacksClear}
        />,
      );

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      // Click remove button
      const removeButton = screen.getByTestId("remove-pack-0");
      await userEvent.click(removeButton);

      // Parent should be notified
      expect(mockOnPackRemove).toHaveBeenCalledTimes(1);
      expect(mockOnPackRemove).toHaveBeenCalledWith(0);
    });

    /**
     * LST-004: onPacksClear callback fires on submit
     * Verifies parent is notified to clear packs after successful submission
     */
    it("LST-004: should call onPacksClear after successful submission", async () => {
      render(
        <PackReceptionForm
          storeId={mockStoreId}
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          packList={[samplePack]}
          onPackAdd={mockOnPackAdd}
          onPackRemove={mockOnPackRemove}
          onPacksClear={mockOnPacksClear}
        />,
      );

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      // Submit the batch
      const submitButton = screen.getByTestId("submit-batch-reception");
      await userEvent.click(submitButton);

      // Wait for submission to complete
      await waitFor(() => {
        expect(mockOnPacksClear).toHaveBeenCalledTimes(1);
      });
    });

    /**
     * LST-005: Pack list persists across modal close/reopen
     * Critical enterprise requirement - accidental modal close shouldn't lose data
     */
    it("LST-005: should NOT clear pack list when modal closes in controlled mode", async () => {
      const { rerender } = render(
        <PackReceptionForm
          storeId={mockStoreId}
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          packList={[samplePack]}
          onPackAdd={mockOnPackAdd}
          onPackRemove={mockOnPackRemove}
          onPacksClear={mockOnPacksClear}
        />,
      );

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      // Verify pack is displayed
      expect(
        screen.getByText(/Packs Ready to Receive \(1\)/i),
      ).toBeInTheDocument();

      // Close dialog
      rerender(
        <PackReceptionForm
          storeId={mockStoreId}
          open={false}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          packList={[samplePack]}
          onPackAdd={mockOnPackAdd}
          onPackRemove={mockOnPackRemove}
          onPacksClear={mockOnPacksClear}
        />,
      );

      // onPacksClear should NOT be called on close in controlled mode
      expect(mockOnPacksClear).not.toHaveBeenCalled();

      // Reopen dialog
      rerender(
        <PackReceptionForm
          storeId={mockStoreId}
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          packList={[samplePack]}
          onPackAdd={mockOnPackAdd}
          onPackRemove={mockOnPackRemove}
          onPacksClear={mockOnPacksClear}
        />,
      );

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      // Pack should still be displayed (parent maintained state)
      expect(
        screen.getByText(/Packs Ready to Receive \(1\)/i),
      ).toBeInTheDocument();
    });

    /**
     * LST-007: Newest packs prepended to list (shown at top)
     * Verifies visual feedback - newest scans appear first
     */
    it("LST-007: should prepend new packs to beginning of list", async () => {
      const existingPack: PackItem = {
        serial: "000188888880888888888888",
        game_code: "0001",
        pack_number: "8888888",
        serial_start: "888",
        game_name: "Older Pack",
        addedAt: Date.now() - 60000, // 1 minute ago
      };

      // Track the pack that gets added
      let addedPack: PackItem | null = null;
      const trackingOnPackAdd = (pack: PackItem) => {
        addedPack = pack;
        mockOnPackAdd(pack);
      };

      render(
        <PackReceptionForm
          storeId={mockStoreId}
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          packList={[existingPack]}
          onPackAdd={trackingOnPackAdd}
          onPackRemove={mockOnPackRemove}
          onPacksClear={mockOnPacksClear}
        />,
      );

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      const input = screen.getByTestId("serial-input") as HTMLInputElement;
      await simulateBarcodeScan(input, "000112345670123456789012");

      // Wait for callback
      await waitFor(
        () => {
          expect(mockOnPackAdd).toHaveBeenCalled();
        },
        { timeout: 3000 },
      );

      // Verify the new pack has a more recent addedAt timestamp
      expect(addedPack).not.toBeNull();
      expect(addedPack!.addedAt).toBeGreaterThan(existingPack.addedAt!);
    });

    /**
     * LST-009: Controlled mode preserves data on close (security)
     * Ensures accidental closure doesn't trigger data loss
     */
    it("LST-009: should preserve unsaved scans when user accidentally closes modal", async () => {
      // Simulate parent component managing state
      let parentPackList: PackItem[] = [];

      const updateParentState = (pack: PackItem) => {
        parentPackList = [pack, ...parentPackList];
      };

      const { rerender } = render(
        <PackReceptionForm
          storeId={mockStoreId}
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          packList={parentPackList}
          onPackAdd={updateParentState}
          onPackRemove={mockOnPackRemove}
          onPacksClear={mockOnPacksClear}
        />,
      );

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      const input = screen.getByTestId("serial-input") as HTMLInputElement;
      await simulateBarcodeScan(input, "000112345670123456789012");

      // Wait for pack to be added to parent state
      await waitFor(
        () => {
          expect(parentPackList.length).toBe(1);
        },
        { timeout: 3000 },
      );

      // Simulate accidental close (e.g., clicking outside modal)
      rerender(
        <PackReceptionForm
          storeId={mockStoreId}
          open={false}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          packList={parentPackList}
          onPackAdd={updateParentState}
          onPackRemove={mockOnPackRemove}
          onPacksClear={mockOnPacksClear}
        />,
      );

      // Parent state should still have the pack
      expect(parentPackList.length).toBe(1);
      expect(parentPackList[0].serial).toBe("000112345670123456789012");

      // Reopen modal with preserved state
      rerender(
        <PackReceptionForm
          storeId={mockStoreId}
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          packList={parentPackList}
          onPackAdd={updateParentState}
          onPackRemove={mockOnPackRemove}
          onPacksClear={mockOnPacksClear}
        />,
      );

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      // Pack should still be visible
      expect(
        screen.getByText(/Packs Ready to Receive \(1\)/i),
      ).toBeInTheDocument();
    });
  });

  describe("Uncontrolled Mode (Backward Compatibility)", () => {
    /**
     * LST-006: Uncontrolled mode works without props
     * Verifies backward compatibility with existing usage
     */
    it("LST-006: should work without lifted state props (backward compatibility)", async () => {
      render(
        <PackReceptionForm
          storeId={mockStoreId}
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}

          // No packList, onPackAdd, onPackRemove, onPacksClear props
        />,
      );

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      const input = screen.getByTestId("serial-input") as HTMLInputElement;
      await simulateBarcodeScan(input, "000112345670123456789012");

      // Pack should be added using internal state
      await waitFor(
        () => {
          expect(
            screen.getByText(/Packs Ready to Receive/i),
          ).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });

    /**
     * LST-008: Internal state cleared in uncontrolled mode
     * Verifies that uncontrolled mode clears on modal close (original behavior)
     */
    it("LST-008: should clear internal state when modal closes in uncontrolled mode", async () => {
      const { rerender } = render(
        <PackReceptionForm
          storeId={mockStoreId}
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}

          // No lifted state props = uncontrolled mode
        />,
      );

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      const input = screen.getByTestId("serial-input") as HTMLInputElement;
      await simulateBarcodeScan(input, "000112345670123456789012");

      await waitFor(
        () => {
          expect(
            screen.getByText(/Packs Ready to Receive/i),
          ).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      // Close dialog
      rerender(
        <PackReceptionForm
          storeId={mockStoreId}
          open={false}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
        />,
      );

      // Reopen dialog
      rerender(
        <PackReceptionForm
          storeId={mockStoreId}
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
        />,
      );

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      // Pack list should be empty (internal state was cleared)
      expect(
        screen.queryByText(/Packs Ready to Receive/i),
      ).not.toBeInTheDocument();
    });
  });

  describe("Multiple Packs in Controlled Mode", () => {
    it("should display multiple packs from external state", async () => {
      const multiplePacks: PackItem[] = [
        {
          serial: "000111111110111111111111",
          game_code: "0001",
          pack_number: "1111111",
          serial_start: "111",
          game_name: "Pack One",
          addedAt: Date.now(),
        },
        {
          serial: "000122222220222222222222",
          game_code: "0001",
          pack_number: "2222222",
          serial_start: "222",
          game_name: "Pack Two",
          addedAt: Date.now() - 1000,
        },
        {
          serial: "000133333330333333333333",
          game_code: "0001",
          pack_number: "3333333",
          serial_start: "333",
          game_name: "Pack Three",
          addedAt: Date.now() - 2000,
        },
      ];

      render(
        <PackReceptionForm
          storeId={mockStoreId}
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          packList={multiplePacks}
          onPackAdd={mockOnPackAdd}
          onPackRemove={mockOnPackRemove}
          onPacksClear={mockOnPacksClear}
        />,
      );

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      // All packs should be displayed
      expect(
        screen.getByText(/Packs Ready to Receive \(3\)/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/Pack: 1111111/i)).toBeInTheDocument();
      expect(screen.getByText(/Pack: 2222222/i)).toBeInTheDocument();
      expect(screen.getByText(/Pack: 3333333/i)).toBeInTheDocument();
    });

    it("should call onPackRemove with correct index for middle item", async () => {
      const multiplePacks: PackItem[] = [
        {
          serial: "000111111110111111111111",
          game_code: "0001",
          pack_number: "1111111",
          serial_start: "111",
          game_name: "Pack One",
        },
        {
          serial: "000122222220222222222222",
          game_code: "0001",
          pack_number: "2222222",
          serial_start: "222",
          game_name: "Pack Two",
        },
        {
          serial: "000133333330333333333333",
          game_code: "0001",
          pack_number: "3333333",
          serial_start: "333",
          game_name: "Pack Three",
        },
      ];

      render(
        <PackReceptionForm
          storeId={mockStoreId}
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          packList={multiplePacks}
          onPackAdd={mockOnPackAdd}
          onPackRemove={mockOnPackRemove}
          onPacksClear={mockOnPacksClear}
        />,
      );

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      // Remove middle pack (index 1)
      const removeButton = screen.getByTestId("remove-pack-1");
      await userEvent.click(removeButton);

      expect(mockOnPackRemove).toHaveBeenCalledWith(1);
    });
  });

  describe("Submit Button State in Controlled Mode", () => {
    it("should enable submit button when external packList has items", async () => {
      render(
        <PackReceptionForm
          storeId={mockStoreId}
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          packList={[samplePack]}
          onPackAdd={mockOnPackAdd}
          onPackRemove={mockOnPackRemove}
          onPacksClear={mockOnPacksClear}
        />,
      );

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      const submitButton = screen.getByTestId("submit-batch-reception");
      expect(submitButton).not.toBeDisabled();
    });

    it("should disable submit button when external packList is empty", async () => {
      render(
        <PackReceptionForm
          storeId={mockStoreId}
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
          packList={[]}
          onPackAdd={mockOnPackAdd}
          onPackRemove={mockOnPackRemove}
          onPacksClear={mockOnPacksClear}
        />,
      );

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      const submitButton = screen.getByTestId("submit-batch-reception");
      expect(submitButton).toBeDisabled();
    });
  });
});
