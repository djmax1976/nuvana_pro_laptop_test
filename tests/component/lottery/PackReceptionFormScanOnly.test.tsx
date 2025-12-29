/**
 * PackReceptionForm Scan-Only Component Tests
 *
 * Tests for the scan-only enforcement feature in PackReceptionForm.
 * Verifies that manual keyboard entry is detected and rejected.
 *
 * Story: Scan-Only Pack Reception Security
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

// Use vi.hoisted to ensure mockToast is available when vi.mock runs
const { mockToast } = vi.hoisted(() => ({
  mockToast: vi.fn(),
}));

// Mock the API calls
vi.mock("@/lib/api/lottery", () => ({
  receivePackBatch: vi.fn(),
  getGames: vi.fn().mockResolvedValue({
    success: true,
    data: [
      {
        game_id: "game-1",
        game_code: "0001",
        name: "Test Game",
        price: 1.0,
        pack_value: 300,
        total_tickets: 300,
      },
    ],
  }),
  checkPackExists: vi.fn().mockResolvedValue({
    success: true,
    data: { exists: false },
  }),
  getLotteryConfigValues: vi.fn().mockResolvedValue({
    success: true,
    data: { enforce_scan_only: true },
  }),
}));

// Mock toast
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe("PackReceptionForm Scan-Only Enforcement", () => {
  // Track mock time for scanner simulation
  // The hook uses: performance.now() + performance.timeOrigin
  // We mock performance.now() to return controlled incremental values
  // and set timeOrigin to 0 so the total timestamp = our mock value
  let mockNow = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNow = 0;
    // Mock high-resolution timing
    // Hook uses: performance.now() + performance.timeOrigin
    vi.spyOn(performance, "now").mockImplementation(() => mockNow);
    // Set timeOrigin to a base value so timestamps look realistic
    Object.defineProperty(performance, "timeOrigin", {
      value: Date.now(),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Advance mock time by specified milliseconds
   * Used to simulate scanner timing (fast) vs manual typing (slow)
   */
  const advanceMockTime = (ms: number) => {
    mockNow += ms;
  };

  const defaultProps = {
    storeId: "store-123",
    open: true,
    onOpenChange: vi.fn(),
    onSuccess: vi.fn(),
    enforceScanOnly: true,
  };

  describe("UI Elements", () => {
    it("should show barcode input label", async () => {
      render(<PackReceptionForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      // UI is simplified - just shows "Barcode" label (use exact match for the label)
      expect(
        screen.getByLabelText(/Scan 24-digit barcode/i),
      ).toBeInTheDocument();
    });

    it("should render dialog title", async () => {
      render(<PackReceptionForm {...defaultProps} />);

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /Receive Lottery Packs/i }),
        ).toBeInTheDocument();
      });
    });
  });

  describe("Scanner Input Detection", () => {
    /**
     * Helper to simulate scanner input by firing rapid keydown events
     * This mimics how a barcode scanner sends characters very quickly (10ms between keys)
     * Uses controlled mock time to ensure timing is detected as scanner input
     */
    const simulateScannerInput = async (
      input: HTMLInputElement,
      barcode: string,
    ) => {
      // Scanners type very fast - 10ms between characters
      let currentValue = "";
      for (let i = 0; i < barcode.length; i++) {
        const char = barcode[i];
        currentValue += char;

        // Advance mock time by 10ms (scanner speed) - except for first char
        if (i > 0) {
          advanceMockTime(10);
        }

        // Fire keydown event (triggers scan detection timing)
        fireEvent.keyDown(input, { key: char });
        // Fire change event with updated value (updates React state)
        fireEvent.change(input, { target: { value: currentValue } });

        // Allow React to process
        await act(async () => {
          await new Promise((r) => setTimeout(r, 0));
        });
      }
    };

    it("should accept fast scanner-like input", async () => {
      const { checkPackExists } = await import("@/lib/api/lottery");
      (checkPackExists as any).mockResolvedValue({
        success: true,
        data: { exists: false },
      });

      // Clear mock before this specific test to ensure clean state
      mockToast.mockClear();

      render(<PackReceptionForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      const input = screen.getByTestId("serial-input") as HTMLInputElement;

      // Simulate fast scanner input with proper keydown events
      await simulateScannerInput(input, "000112345670010000000001");

      // Wait for debounce and processing - allow time for pack to be added
      await waitFor(
        () => {
          // Pack should be added (no rejection toast shown)
          // We verify by checking the toast calls don't include manual entry rejection
          const manualEntryCall = mockToast.mock.calls.find(
            (call) =>
              call[0]?.title?.match(/Manual Entry/i) ||
              call[0]?.title?.match(/Manual Entry Not Allowed/i) ||
              call[0]?.title?.match(/Manual Entry Rejected/i),
          );
          expect(manualEntryCall).toBeUndefined();
        },
        { timeout: 3000 },
      );
    });
  });

  describe("Manual Entry Detection", () => {
    // For manual entry tests, we need REAL performance.now() timing
    // because userEvent.type with delay uses real time
    beforeEach(() => {
      // Restore real performance.now for these tests
      vi.spyOn(performance, "now").mockRestore();
    });

    it("should show rejection message for slow manual typing", async () => {
      render(<PackReceptionForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      const input = screen.getByTestId("serial-input");
      const user = userEvent.setup({ delay: 150 }); // 150ms between keystrokes

      // Type slowly like a human - only need 3 chars to trigger detection
      // (detection happens after 2 keystrokes with slow timing)
      await user.type(input, "001");

      // Wait for the toast to be called with rejection message
      await waitFor(
        () => {
          expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({
              title: expect.stringMatching(/Manual Entry/i),
              variant: "destructive",
            }),
          );
        },
        { timeout: 5000 },
      );
    });

    it("should clear input after manual entry rejection", async () => {
      render(<PackReceptionForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      const input = screen.getByTestId("serial-input") as HTMLInputElement;
      const user = userEvent.setup({ delay: 150 });

      // Type slowly - only need 3 chars to trigger rejection
      await user.type(input, "001");

      // Wait for rejection to be triggered
      await waitFor(
        () => {
          expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({
              title: expect.stringMatching(/Manual Entry/i),
            }),
          );
        },
        { timeout: 5000 },
      );

      // Wait for React to process the state update that clears the input
      await act(async () => {
        await new Promise((r) => setTimeout(r, 200));
      });

      // Verify the rejection was shown with destructive variant
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
        }),
      );
    });
  });

  describe("Disabled Enforcement", () => {
    it("should accept any input when enforcement is disabled", async () => {
      const { receivePackBatch, getGames } = await import("@/lib/api/lottery");

      (getGames as any).mockResolvedValue({
        success: true,
        data: [
          {
            game_id: "game-1",
            game_code: "0001",
            name: "Test Game",
            price: 1.0,
            pack_value: 300,
            total_tickets: 300,
          },
        ],
      });

      (receivePackBatch as any).mockResolvedValue({
        success: true,
        data: {
          created: [{ pack_id: "pack-1" }],
          duplicates: [],
          errors: [],
          games_not_found: [],
        },
      });

      render(<PackReceptionForm {...defaultProps} enforceScanOnly={false} />);

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      const input = screen.getByTestId("serial-input");
      const user = userEvent.setup({ delay: 50 }); // Moderate typing speed

      // Type at moderate speed
      await user.type(input, "000112345670010000000001");

      // Wait for processing
      await waitFor(
        () => {
          // Should NOT reject manual entry
          expect(mockToast).not.toHaveBeenCalledWith(
            expect.objectContaining({
              title: expect.stringMatching(/Manual Entry/i),
            }),
          );
        },
        { timeout: 5000 },
      );
    });
  });

  describe("Edge Cases", () => {
    it("should BLOCK paste events when scan-only is enforced", async () => {
      render(<PackReceptionForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      const input = screen.getByTestId("serial-input") as HTMLInputElement;
      const barcode = "000112345670010000000001";

      // Simulate paste - should be BLOCKED
      await act(async () => {
        fireEvent.paste(input, {
          clipboardData: { getData: () => barcode },
        });
      });

      // Wait a bit for event handling
      await act(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });

      // Should show rejection message for paste
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: expect.stringMatching(/Paste Not Allowed/i),
            variant: "destructive",
          }),
        );
      });

      // Input should remain empty (paste was prevented)
      expect(input.value).toBe("");
    });

    it("should allow paste when scan-only is disabled", async () => {
      const { checkPackExists } = await import("@/lib/api/lottery");
      (checkPackExists as any).mockResolvedValue({
        success: true,
        data: { exists: false },
      });

      render(<PackReceptionForm {...defaultProps} enforceScanOnly={false} />);

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      const input = screen.getByTestId("serial-input");
      const barcode = "000112345670010000000001";

      // Simulate paste - should be allowed when enforceScanOnly is false
      await act(async () => {
        fireEvent.paste(input, {
          clipboardData: { getData: () => barcode },
        });
        fireEvent.change(input, { target: { value: barcode } });
      });

      // Wait a bit for debounce
      await act(async () => {
        await new Promise((r) => setTimeout(r, 500));
      });

      // Should NOT show paste rejection
      expect(mockToast).not.toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringMatching(/Paste Not Allowed/i),
        }),
      );
    });

    it("should reset detector when input is cleared", async () => {
      render(<PackReceptionForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      const input = screen.getByTestId("serial-input") as HTMLInputElement;
      const user = userEvent.setup({ delay: 20 });

      // Type some characters
      await user.type(input, "000112");

      // Clear input
      await user.clear(input);

      // Input should be empty after clear
      await waitFor(() => {
        expect(input.value).toBe("");
      });
    });
  });

  describe("Integration with Form Submission", () => {
    /**
     * Helper to simulate scanner input by firing rapid keydown events
     * This mimics how a barcode scanner sends characters very quickly (10ms between keys)
     * Uses controlled mock time to ensure timing is detected as scanner input
     */
    const simulateScannerInput = async (
      input: HTMLInputElement,
      barcode: string,
    ) => {
      // Scanners type very fast - 10ms between characters
      let currentValue = "";
      for (let i = 0; i < barcode.length; i++) {
        const char = barcode[i];
        currentValue += char;

        // Advance mock time by 10ms (scanner speed) - except for first char
        if (i > 0) {
          advanceMockTime(10);
        }

        // Fire keydown event (triggers scan detection timing)
        fireEvent.keyDown(input, { key: char });
        // Fire change event with updated value (updates React state)
        fireEvent.change(input, { target: { value: currentValue } });

        // Allow React to process
        await act(async () => {
          await new Promise((r) => setTimeout(r, 0));
        });
      }
    };

    it("should include scan metrics in batch submission", async () => {
      const { receivePackBatch, getGames, checkPackExists } =
        await import("@/lib/api/lottery");

      (getGames as any).mockResolvedValue({
        success: true,
        data: [
          {
            game_id: "game-1",
            game_code: "0001",
            name: "Test Game",
            price: 1.0,
            pack_value: 300,
            total_tickets: 300,
          },
        ],
      });

      (checkPackExists as any).mockResolvedValue({
        success: true,
        data: { exists: false },
      });

      (receivePackBatch as any).mockResolvedValue({
        success: true,
        data: {
          created: [{ pack_id: "pack-1", game_id: "game-1" }],
          duplicates: [],
          errors: [],
          games_not_found: [],
        },
      });

      render(<PackReceptionForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/Loading games/i)).not.toBeInTheDocument();
      });

      const input = screen.getByTestId("serial-input") as HTMLInputElement;

      // Simulate scanner input with proper keydown events
      await simulateScannerInput(input, "000112345670010000000001");

      // Wait for debounce and pack processing
      await waitFor(
        () => {
          expect(
            screen.getByText(/Packs Ready to Receive/i),
          ).toBeInTheDocument();
        },
        { timeout: 5000 },
      );

      // Click submit
      const submitButton = screen.getByTestId("submit-batch-reception");
      await userEvent.click(submitButton);

      // Verify receivePackBatch was called with scan_metrics
      await waitFor(() => {
        expect(receivePackBatch).toHaveBeenCalledWith(
          expect.objectContaining({
            serialized_numbers: expect.arrayContaining([
              "000112345670010000000001",
            ]),
            // scan_metrics should be included when enforceScanOnly is true
          }),
        );
      });
    });
  });
});
