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
 *
 * Note: These tests use enforceScanOnly=false to test core functionality.
 * Scan-only enforcement is tested in PackReceptionFormScanOnly.test.tsx
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
import { PackReceptionForm } from "@/components/lottery/PackReceptionForm";

// Use vi.hoisted to ensure mocks are available when vi.mock runs
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

// Mock the API client
vi.mock("@/lib/api/lottery", () => ({
  receivePackBatch: mockReceivePackBatch,
  getGames: mockGetGames,
  checkPackExists: mockCheckPackExists,
  createGame: vi.fn().mockResolvedValue({
    success: true,
    data: {
      game_id: "game-new",
      game_code: "9999",
      name: "NEW GAME",
      price: 10.0,
      status: "ACTIVE",
    },
  }),
}));

// Mock the serial parser
vi.mock("@/lib/utils/lottery-serial-parser", () => ({
  parseSerializedNumber: mockParseSerializedNumber,
}));

// Mock the toast hook
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
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
    // Disable scan-only enforcement for these tests since they use
    // direct typing which doesn't simulate scanner keystroke timing.
    // Scan-only enforcement is tested in PackReceptionFormScanOnly.test.tsx
    enforceScanOnly: false,
  };

  // Default game data
  const defaultGame = {
    game_id: "game-1",
    game_code: "0001",
    name: "TEST GAME",
    description: null,
    price: 5.0,
    pack_value: 300,
    total_tickets: 300,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Default parsed serial
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
   * Helper to simulate scanner-like input (fast typing)
   * This bypasses the scan detection by firing events quickly
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
      // Minimal delay to allow React to process
      await act(async () => {
        await new Promise((r) => setTimeout(r, 2));
      });
    }
  };

  describe("Rendering", () => {
    it("6.12-COMPONENT-010: [P1] should render barcode input field (AC #1)", async () => {
      render(<PackReceptionForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      expect(screen.getByText("Barcode")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("Scan barcode..."),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /receive.*pack/i }),
      ).toBeInTheDocument();
    });

    it("6.12-COMPONENT-011: [P1] should accept only numeric input (AC #1)", async () => {
      render(<PackReceptionForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText("Scan barcode...");
      const user = userEvent.setup({ delay: null });

      await user.type(input, "abc123def");

      // Component filters to digits only via handleChange
      expect(input).toHaveValue("123");
    });

    it("6.12-COMPONENT-012: [P1] should limit input to 24 digits (AC #1)", async () => {
      render(<PackReceptionForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText("Scan barcode...");
      const user = userEvent.setup({ delay: null });

      await user.type(input, "123456789012345678901234567890");

      expect(input).toHaveValue("123456789012345678901234");
    });
  });

  describe("Pack Processing", () => {
    it("6.12-COMPONENT-013: [P1] should parse serial and add to list after input (AC #2)", async () => {
      render(<PackReceptionForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      const input = screen.getByTestId("serial-input") as HTMLInputElement;

      // Simulate barcode scan
      await simulateBarcodeScan(input, "000112345670123456789012");

      // Wait for debounce and pack processing
      await waitFor(
        () => {
          expect(mockParseSerializedNumber).toHaveBeenCalledWith(
            "000112345670123456789012",
          );
        },
        { timeout: 2000 },
      );

      // Pack should be added to list
      await waitFor(
        () => {
          expect(
            screen.getByText(/Packs Ready to Receive/i),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Should display game name and pack number
      expect(screen.getByText(/TEST GAME/)).toBeInTheDocument();
      expect(screen.getByText(/Pack: 1234567/)).toBeInTheDocument();
    });

    it("6.12-COMPONENT-014: [P1] should clear input after valid entry (AC #2)", async () => {
      render(<PackReceptionForm {...defaultProps} />);

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
        { timeout: 2000 },
      );

      // Input should be cleared
      expect(input).toHaveValue("");
    });

    it("6.12-COMPONENT-015: [P1] should show error for duplicate pack in list (AC #2)", async () => {
      render(<PackReceptionForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      const input = screen.getByTestId("serial-input") as HTMLInputElement;

      // Add first pack
      await simulateBarcodeScan(input, "000112345670123456789012");

      await waitFor(
        () => {
          expect(
            screen.getByText(/Packs Ready to Receive/i),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Try to add same pack again
      await simulateBarcodeScan(input, "000112345670123456789012");

      await waitFor(
        () => {
          expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({
              title: "Duplicate pack",
              variant: "destructive",
            }),
          );
        },
        { timeout: 2000 },
      );
    });

    it("6.12-COMPONENT-016: [P1] should show error for pack already in database", async () => {
      mockCheckPackExists.mockResolvedValue({
        success: true,
        data: {
          exists: true,
          pack: {
            pack_number: "1234567",
            status: "RECEIVED",
            game: { name: "TEST GAME" },
          },
        },
      });

      render(<PackReceptionForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      const input = screen.getByTestId("serial-input") as HTMLInputElement;

      await simulateBarcodeScan(input, "000112345670123456789012");

      await waitFor(
        () => {
          expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({
              title: "Pack already in inventory",
              variant: "destructive",
            }),
          );
        },
        { timeout: 2000 },
      );
    });
  });

  describe("Pack List Management", () => {
    it("6.12-COMPONENT-020: [P1] should remove pack from list on remove button click", async () => {
      render(<PackReceptionForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      const input = screen.getByTestId("serial-input") as HTMLInputElement;

      // Add a pack
      await simulateBarcodeScan(input, "000112345670123456789012");

      await waitFor(
        () => {
          expect(
            screen.getByText(/Packs Ready to Receive/i),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Click remove button
      const removeButton = screen.getByTestId("remove-pack-0");
      await userEvent.click(removeButton);

      // Pack should be removed
      await waitFor(() => {
        expect(
          screen.queryByText(/Packs Ready to Receive/i),
        ).not.toBeInTheDocument();
      });
    });

    it("6.12-COMPONENT-021: [P1] should support multiple packs in list", async () => {
      // Setup different parsed values for each pack
      mockParseSerializedNumber
        .mockReturnValueOnce({
          game_code: "0001",
          pack_number: "1111111",
          serial_start: "001",
        })
        .mockReturnValueOnce({
          game_code: "0001",
          pack_number: "2222222",
          serial_start: "002",
        });

      render(<PackReceptionForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      const input = screen.getByTestId("serial-input") as HTMLInputElement;

      // Add first pack
      await simulateBarcodeScan(input, "000111111110010000000001");

      await waitFor(
        () => {
          expect(screen.getByText(/1111111/)).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Add second pack
      await simulateBarcodeScan(input, "000122222220020000000002");

      await waitFor(
        () => {
          expect(screen.getByText(/2222222/)).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Both packs should be in list
      expect(
        screen.getByText(/Packs Ready to Receive \(2\)/i),
      ).toBeInTheDocument();
    });
  });

  describe("Batch Submission", () => {
    it("6.12-COMPONENT-030: [P1] should disable submit button when no packs", async () => {
      render(<PackReceptionForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      const submitButton = screen.getByTestId("submit-batch-reception");
      expect(submitButton).toBeDisabled();
    });

    it("6.12-COMPONENT-031: [P1] should enable submit button when packs exist", async () => {
      render(<PackReceptionForm {...defaultProps} />);

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
        { timeout: 2000 },
      );

      const submitButton = screen.getByTestId("submit-batch-reception");
      expect(submitButton).not.toBeDisabled();
    });

    it("6.12-COMPONENT-032: [P1] should call receivePackBatch API on submit", async () => {
      render(<PackReceptionForm {...defaultProps} />);

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
        { timeout: 2000 },
      );

      const submitButton = screen.getByTestId("submit-batch-reception");
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(mockReceivePackBatch).toHaveBeenCalledWith(
          expect.objectContaining({
            store_id: mockStoreId,
            serialized_numbers: ["000112345670123456789012"],
          }),
        );
      });
    });

    it("6.12-COMPONENT-033: [P1] should show success toast and close on successful submission", async () => {
      render(<PackReceptionForm {...defaultProps} />);

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
        { timeout: 2000 },
      );

      const submitButton = screen.getByTestId("submit-batch-reception");
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Packs received",
          }),
        );
      });

      expect(mockOnSuccess).toHaveBeenCalled();
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it("6.12-COMPONENT-034: [P1] should show error toast on submission failure", async () => {
      mockReceivePackBatch.mockResolvedValue({
        success: true,
        data: {
          created: [],
          duplicates: [],
          errors: [
            { serial: "000112345670123456789012", error: "Invalid pack" },
          ],
          games_not_found: [],
        },
      });

      render(<PackReceptionForm {...defaultProps} />);

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
        { timeout: 2000 },
      );

      const submitButton = screen.getByTestId("submit-batch-reception");
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "No packs received",
            variant: "destructive",
          }),
        );
      });
    });
  });

  describe("Error Handling", () => {
    it("6.12-COMPONENT-040: [P1] should show error for invalid serial format", async () => {
      mockParseSerializedNumber.mockImplementation(() => {
        throw new Error("Invalid serial format");
      });

      render(<PackReceptionForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      const input = screen.getByTestId("serial-input") as HTMLInputElement;

      await simulateBarcodeScan(input, "000112345670123456789012");

      await waitFor(
        () => {
          expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({
              title: "Invalid serial",
              variant: "destructive",
            }),
          );
        },
        { timeout: 2000 },
      );
    });
  });

  describe("New Game Modal", () => {
    it("6.12-COMPONENT-045: [P1] should show NewGameModal when game code not found", async () => {
      // Return empty games list
      mockGetGames.mockResolvedValue({
        success: true,
        data: [], // No games in cache
      });

      render(<PackReceptionForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      const input = screen.getByTestId("serial-input") as HTMLInputElement;

      await simulateBarcodeScan(input, "000112345670123456789012");

      // NewGameModal should appear
      await waitFor(
        () => {
          expect(screen.getByText(/New Game Found/i)).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });
  });

  describe("Loading States", () => {
    it("6.12-COMPONENT-050: [P1] should show loading state while fetching games", async () => {
      // Create a promise that we control
      let resolveGames: (value: any) => void;
      mockGetGames.mockReturnValue(
        new Promise((resolve) => {
          resolveGames = resolve;
        }),
      );

      render(<PackReceptionForm {...defaultProps} />);

      // Should show loading
      expect(screen.getByText(/Loading games/i)).toBeInTheDocument();

      // Resolve the promise
      await act(async () => {
        resolveGames!({
          success: true,
          data: [defaultGame],
        });
      });

      // Loading should disappear
      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });
    });

    it("6.12-COMPONENT-051: [P1] should show loading state during submission", async () => {
      let resolveSubmit: (value: any) => void;
      mockReceivePackBatch.mockReturnValue(
        new Promise((resolve) => {
          resolveSubmit = resolve;
        }),
      );

      render(<PackReceptionForm {...defaultProps} />);

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
        { timeout: 2000 },
      );

      const submitButton = screen.getByTestId("submit-batch-reception");
      await userEvent.click(submitButton);

      // Button should show loading state
      expect(submitButton).toBeDisabled();

      // Resolve the promise
      await act(async () => {
        resolveSubmit!({
          success: true,
          data: {
            created: [{ pack_id: "pack-1" }],
            duplicates: [],
            errors: [],
            games_not_found: [],
          },
        });
      });
    });
  });

  describe("Dialog Behavior", () => {
    it("6.12-COMPONENT-060: [P1] should reset form when dialog closes", async () => {
      const { rerender } = render(<PackReceptionForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      const input = screen.getByTestId("serial-input") as HTMLInputElement;

      // Add a pack
      await simulateBarcodeScan(input, "000112345670123456789012");

      await waitFor(
        () => {
          expect(
            screen.getByText(/Packs Ready to Receive/i),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Close and reopen dialog
      rerender(<PackReceptionForm {...defaultProps} open={false} />);
      rerender(<PackReceptionForm {...defaultProps} open={true} />);

      // Wait for games to load
      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      // Pack list should be empty
      expect(
        screen.queryByText(/Packs Ready to Receive/i),
      ).not.toBeInTheDocument();
    });

    it("6.12-COMPONENT-061: [P1] should not close dialog while submitting", async () => {
      let resolveSubmit: (value: any) => void;
      mockReceivePackBatch.mockReturnValue(
        new Promise((resolve) => {
          resolveSubmit = resolve;
        }),
      );

      render(<PackReceptionForm {...defaultProps} />);

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
        { timeout: 2000 },
      );

      const submitButton = screen.getByTestId("submit-batch-reception");
      await userEvent.click(submitButton);

      // Cancel button should be disabled during submission
      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      expect(cancelButton).toBeDisabled();

      // Resolve the promise
      await act(async () => {
        resolveSubmit!({
          success: true,
          data: {
            created: [{ pack_id: "pack-1" }],
            duplicates: [],
            errors: [],
            games_not_found: [],
          },
        });
      });
    });
  });
});
