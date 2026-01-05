/**
 * BinCountModal Component Tests
 *
 * Test file for BinCountModal component used in client dashboard lottery management.
 * This component allows store owners to configure the number of lottery bins
 * for their store with real-time validation.
 *
 * Key Features Tested:
 * - Modal display with current bin statistics
 * - Number input validation (0-200 range)
 * - Real-time validation of proposed changes
 * - Success/warning messages for bin changes
 * - Blocking removal of bins with active packs
 * - Save and cancel functionality
 *
 * Test Categories:
 * 1. Modal Display and Statistics
 * 2. Input Validation
 * 3. Real-time Validation
 * 4. Save/Update Flow
 * 5. Error Handling
 * 6. Accessibility
 *
 * MCP Testing Guidelines Applied:
 * - Tests isolated with proper mocking
 * - Descriptive test names following naming convention
 * - data-testid attributes for reliable element selection
 * - Async operations properly awaited with waitFor
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BinCountModal } from "@/components/lottery/BinCountModal";

// Mock the lottery API functions
vi.mock("@/lib/api/lottery", () => ({
  getLotteryBinCount: vi.fn(),
  updateLotteryBinCount: vi.fn(),
  validateLotteryBinCountChange: vi.fn(),
}));

// Import mocked functions for control
import {
  getLotteryBinCount,
  updateLotteryBinCount,
  validateLotteryBinCountChange,
} from "@/lib/api/lottery";

const mockGetLotteryBinCount = getLotteryBinCount as ReturnType<typeof vi.fn>;
const mockUpdateLotteryBinCount = updateLotteryBinCount as ReturnType<
  typeof vi.fn
>;
const mockValidateLotteryBinCountChange =
  validateLotteryBinCountChange as ReturnType<typeof vi.fn>;

// Mock useToast
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Helper to create QueryClient wrapper
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = "TestQueryClientWrapper";
  return Wrapper;
}

// Helper to render with providers
function renderWithProviders(ui: React.ReactElement) {
  return render(ui, { wrapper: createWrapper() });
}

// Default props for the modal
const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  storeId: "test-store-id",
  storeName: "Test Store",
  onSuccess: vi.fn(),
};

// Mock successful bin count response
function mockBinCountResponse(
  binCount: number | null = 5,
  activeBins = 5,
  binsWithPacks = 2,
) {
  return {
    success: true,
    data: {
      store_id: "test-store-id",
      bin_count: binCount,
      active_bins: activeBins,
      bins_with_packs: binsWithPacks,
      empty_bins: activeBins - binsWithPacks,
    },
  };
}

// Mock validation response
function mockValidationResponse(
  allowed: boolean,
  binsToAdd = 0,
  binsToRemove = 0,
  message = "",
) {
  return {
    success: true,
    data: {
      allowed,
      current_count: 5,
      bins_to_add: binsToAdd,
      bins_to_remove: binsToRemove,
      bins_with_packs_blocking: allowed ? 0 : 1,
      message:
        message ||
        (allowed
          ? `Will add ${binsToAdd} bins`
          : "Cannot remove bins with packs"),
    },
  };
}

describe("BinCountModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementations
    mockGetLotteryBinCount.mockResolvedValue(mockBinCountResponse());
    mockValidateLotteryBinCountChange.mockResolvedValue(
      mockValidationResponse(true, 2, 0, "Will add 2 bins"),
    );
    mockUpdateLotteryBinCount.mockResolvedValue({
      success: true,
      data: {
        previous_count: 5,
        new_count: 7,
        bins_created: 2,
        bins_reactivated: 0,
        bins_deactivated: 0,
        bins_with_packs_count: 0,
      },
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Modal Display and Statistics
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Modal Display and Statistics", () => {
    it("should display the modal when open is true", async () => {
      renderWithProviders(<BinCountModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("bin-count-modal")).toBeInTheDocument();
      });
    });

    it("should display modal title and store name", async () => {
      renderWithProviders(<BinCountModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText("Configure Lottery Bins")).toBeInTheDocument();
        expect(screen.getByText(/Test Store/)).toBeInTheDocument();
      });
    });

    it("should display current bin statistics", async () => {
      mockGetLotteryBinCount.mockResolvedValue(mockBinCountResponse(10, 10, 3));

      renderWithProviders(<BinCountModal {...defaultProps} />);

      await waitFor(() => {
        // Check that statistics are displayed
        expect(screen.getByText("Current Status")).toBeInTheDocument();
        expect(screen.getByText("Active Bins")).toBeInTheDocument();
        expect(screen.getByText("With Packs")).toBeInTheDocument();
        expect(screen.getByText("Empty")).toBeInTheDocument();
      });
    });

    it("should display loading state while fetching data", () => {
      mockGetLotteryBinCount.mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );

      renderWithProviders(<BinCountModal {...defaultProps} />);

      // Should show loading indicator (Loader2 has animate-spin class)
      expect(document.querySelector(".animate-spin")).toBeInTheDocument();
    });

    it("should not render modal when open is false", () => {
      renderWithProviders(<BinCountModal {...defaultProps} open={false} />);

      expect(screen.queryByTestId("bin-count-modal")).not.toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Input Validation
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Input Validation", () => {
    it("should display the bin count input field", async () => {
      renderWithProviders(<BinCountModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("bin-count-input")).toBeInTheDocument();
      });
    });

    it("should initialize input with current bin count", async () => {
      mockGetLotteryBinCount.mockResolvedValue(mockBinCountResponse(10, 10, 2));

      renderWithProviders(<BinCountModal {...defaultProps} />);

      await waitFor(() => {
        const input = screen.getByTestId("bin-count-input") as HTMLInputElement;
        expect(input.value).toBe("10");
      });
    });

    it("should only accept numeric input", async () => {
      const user = userEvent.setup();
      renderWithProviders(<BinCountModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("bin-count-input")).toBeInTheDocument();
      });

      const input = screen.getByTestId("bin-count-input");
      await user.clear(input);
      await user.type(input, "abc123xyz");

      // Should only contain numeric characters
      expect((input as HTMLInputElement).value).toBe("123");
    });

    it("should display validation message for range constraints", async () => {
      renderWithProviders(<BinCountModal {...defaultProps} />);

      await waitFor(() => {
        expect(
          screen.getByText(/Enter a number between 0 and 200/),
        ).toBeInTheDocument();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Real-time Validation
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Real-time Validation", () => {
    it("should validate proposed changes when input changes", async () => {
      const user = userEvent.setup();
      renderWithProviders(<BinCountModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("bin-count-input")).toBeInTheDocument();
      });

      const input = screen.getByTestId("bin-count-input");
      await user.clear(input);
      await user.type(input, "10");

      await waitFor(() => {
        expect(mockValidateLotteryBinCountChange).toHaveBeenCalled();
      });
    });

    it("should display success validation result when allowed", async () => {
      const user = userEvent.setup();
      mockValidateLotteryBinCountChange.mockResolvedValue(
        mockValidationResponse(true, 5, 0, "Will add 5 new bins."),
      );

      renderWithProviders(<BinCountModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("bin-count-input")).toBeInTheDocument();
      });

      const input = screen.getByTestId("bin-count-input");
      await user.clear(input);
      await user.type(input, "10");

      await waitFor(() => {
        expect(screen.getByTestId("validation-result")).toBeInTheDocument();
        expect(screen.getByText("Ready to apply")).toBeInTheDocument();
      });
    });

    it("should display warning validation result when not allowed", async () => {
      const user = userEvent.setup();
      mockValidateLotteryBinCountChange.mockResolvedValue(
        mockValidationResponse(
          false,
          0,
          2,
          "Cannot remove bins because they have active packs.",
        ),
      );

      renderWithProviders(<BinCountModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("bin-count-input")).toBeInTheDocument();
      });

      const input = screen.getByTestId("bin-count-input");
      await user.clear(input);
      await user.type(input, "3");

      await waitFor(() => {
        expect(screen.getByTestId("validation-result")).toBeInTheDocument();
        expect(screen.getByText("Cannot apply")).toBeInTheDocument();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Save/Update Flow
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Save/Update Flow", () => {
    it("should disable save button when no changes made", async () => {
      mockGetLotteryBinCount.mockResolvedValue(mockBinCountResponse(5, 5, 2));

      renderWithProviders(<BinCountModal {...defaultProps} />);

      await waitFor(() => {
        const saveButton = screen.getByTestId("bin-count-save-button");
        expect(saveButton).toBeDisabled();
      });
    });

    it("should enable save button when valid changes are made", async () => {
      const user = userEvent.setup();
      mockGetLotteryBinCount.mockResolvedValue(mockBinCountResponse(5, 5, 2));
      mockValidateLotteryBinCountChange.mockResolvedValue(
        mockValidationResponse(true, 5, 0, "Will add 5 bins."),
      );

      renderWithProviders(<BinCountModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("bin-count-input")).toBeInTheDocument();
      });

      const input = screen.getByTestId("bin-count-input");
      await user.clear(input);
      await user.type(input, "10");

      await waitFor(() => {
        const saveButton = screen.getByTestId("bin-count-save-button");
        expect(saveButton).not.toBeDisabled();
      });
    });

    it("should disable save button when validation fails", async () => {
      const user = userEvent.setup();
      mockGetLotteryBinCount.mockResolvedValue(mockBinCountResponse(5, 5, 2));
      mockValidateLotteryBinCountChange.mockResolvedValue(
        mockValidationResponse(false, 0, 2, "Cannot remove bins with packs."),
      );

      renderWithProviders(<BinCountModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("bin-count-input")).toBeInTheDocument();
      });

      const input = screen.getByTestId("bin-count-input");
      await user.clear(input);
      await user.type(input, "3");

      await waitFor(() => {
        const saveButton = screen.getByTestId("bin-count-save-button");
        expect(saveButton).toBeDisabled();
      });
    });

    it("should call updateLotteryBinCount on save", async () => {
      const user = userEvent.setup();
      mockGetLotteryBinCount.mockResolvedValue(mockBinCountResponse(5, 5, 2));
      mockValidateLotteryBinCountChange.mockResolvedValue(
        mockValidationResponse(true, 5, 0, "Will add 5 bins."),
      );

      renderWithProviders(<BinCountModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("bin-count-input")).toBeInTheDocument();
      });

      const input = screen.getByTestId("bin-count-input");
      await user.clear(input);
      await user.type(input, "10");

      await waitFor(() => {
        expect(screen.getByTestId("bin-count-save-button")).not.toBeDisabled();
      });

      const saveButton = screen.getByTestId("bin-count-save-button");
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockUpdateLotteryBinCount).toHaveBeenCalledWith(
          "test-store-id",
          10,
        );
      });
    });

    it("should call onSuccess and close modal after successful save", async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();
      const onOpenChange = vi.fn();

      mockGetLotteryBinCount.mockResolvedValue(mockBinCountResponse(5, 5, 2));
      mockValidateLotteryBinCountChange.mockResolvedValue(
        mockValidationResponse(true, 5, 0, "Will add 5 bins."),
      );

      renderWithProviders(
        <BinCountModal
          {...defaultProps}
          onSuccess={onSuccess}
          onOpenChange={onOpenChange}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("bin-count-input")).toBeInTheDocument();
      });

      const input = screen.getByTestId("bin-count-input");
      await user.clear(input);
      await user.type(input, "10");

      await waitFor(() => {
        expect(screen.getByTestId("bin-count-save-button")).not.toBeDisabled();
      });

      const saveButton = screen.getByTestId("bin-count-save-button");
      await user.click(saveButton);

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it("should show success toast after save", async () => {
      const user = userEvent.setup();
      mockGetLotteryBinCount.mockResolvedValue(mockBinCountResponse(5, 5, 2));
      mockValidateLotteryBinCountChange.mockResolvedValue(
        mockValidationResponse(true, 5, 0, "Will add 5 bins."),
      );

      renderWithProviders(<BinCountModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("bin-count-input")).toBeInTheDocument();
      });

      const input = screen.getByTestId("bin-count-input");
      await user.clear(input);
      await user.type(input, "10");

      await waitFor(() => {
        expect(screen.getByTestId("bin-count-save-button")).not.toBeDisabled();
      });

      const saveButton = screen.getByTestId("bin-count-save-button");
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Bin Count Updated",
          }),
        );
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Error Handling
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Error Handling", () => {
    it("should display error state when fetching fails", async () => {
      mockGetLotteryBinCount.mockRejectedValue(new Error("Network error"));

      renderWithProviders(<BinCountModal {...defaultProps} />);

      await waitFor(() => {
        expect(
          screen.getByText(/Failed to load bin count/),
        ).toBeInTheDocument();
      });
    });

    it("should show error toast on save failure", async () => {
      const user = userEvent.setup();
      mockGetLotteryBinCount.mockResolvedValue(mockBinCountResponse(5, 5, 2));
      mockValidateLotteryBinCountChange.mockResolvedValue(
        mockValidationResponse(true, 5, 0, "Will add 5 bins."),
      );
      mockUpdateLotteryBinCount.mockRejectedValue(new Error("Update failed"));

      renderWithProviders(<BinCountModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("bin-count-input")).toBeInTheDocument();
      });

      const input = screen.getByTestId("bin-count-input");
      await user.clear(input);
      await user.type(input, "10");

      await waitFor(() => {
        expect(screen.getByTestId("bin-count-save-button")).not.toBeDisabled();
      });

      const saveButton = screen.getByTestId("bin-count-save-button");
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Error",
            variant: "destructive",
          }),
        );
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Accessibility
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Accessibility", () => {
    it("should have proper label for bin count input", async () => {
      renderWithProviders(<BinCountModal {...defaultProps} />);

      await waitFor(() => {
        const label = screen.getByText("Number of Bins");
        expect(label).toBeInTheDocument();
        expect(label.tagName).toBe("LABEL");
      });
    });

    it("should have accessible cancel button", async () => {
      renderWithProviders(<BinCountModal {...defaultProps} />);

      await waitFor(() => {
        const cancelButton = screen.getByTestId("bin-count-cancel-button");
        expect(cancelButton).toBeInTheDocument();
        expect(cancelButton).toHaveTextContent("Cancel");
      });
    });

    it("should call onOpenChange when cancel is clicked", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();

      renderWithProviders(
        <BinCountModal {...defaultProps} onOpenChange={onOpenChange} />,
      );

      await waitFor(() => {
        expect(
          screen.getByTestId("bin-count-cancel-button"),
        ).toBeInTheDocument();
      });

      const cancelButton = screen.getByTestId("bin-count-cancel-button");
      await user.click(cancelButton);

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. Edge Cases and Boundary Values
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Edge Cases and Boundary Values", () => {
    it("should handle store with null bin_count (never configured)", async () => {
      // GIVEN: Store has null bin_count but some active bins
      mockGetLotteryBinCount.mockResolvedValue({
        success: true,
        data: {
          store_id: "test-store-id",
          bin_count: null, // Never configured
          active_bins: 3,
          bins_with_packs: 0,
          empty_bins: 3,
        },
      });

      renderWithProviders(<BinCountModal {...defaultProps} />);

      await waitFor(() => {
        // Should initialize input with active_bins count since bin_count is null
        const input = screen.getByTestId("bin-count-input") as HTMLInputElement;
        expect(input.value).toBe("3");
      });
    });

    it("should accept boundary value 0", async () => {
      const user = userEvent.setup();
      mockGetLotteryBinCount.mockResolvedValue(mockBinCountResponse(5, 5, 0));
      mockValidateLotteryBinCountChange.mockResolvedValue(
        mockValidationResponse(true, 0, 5, "Will remove 5 bins."),
      );

      renderWithProviders(<BinCountModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("bin-count-input")).toBeInTheDocument();
      });

      const input = screen.getByTestId("bin-count-input");
      await user.clear(input);
      await user.type(input, "0");

      await waitFor(() => {
        expect(mockValidateLotteryBinCountChange).toHaveBeenCalledWith(
          "test-store-id",
          0,
        );
      });
    });

    it("should accept boundary value 200", async () => {
      const user = userEvent.setup();
      mockGetLotteryBinCount.mockResolvedValue(mockBinCountResponse(5, 5, 0));
      mockValidateLotteryBinCountChange.mockResolvedValue(
        mockValidationResponse(true, 195, 0, "Will add 195 bins."),
      );

      renderWithProviders(<BinCountModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("bin-count-input")).toBeInTheDocument();
      });

      const input = screen.getByTestId("bin-count-input");
      await user.clear(input);
      await user.type(input, "200");

      await waitFor(() => {
        expect(mockValidateLotteryBinCountChange).toHaveBeenCalledWith(
          "test-store-id",
          200,
        );
      });
    });

    it("should handle empty input gracefully", async () => {
      const user = userEvent.setup();
      mockGetLotteryBinCount.mockResolvedValue(mockBinCountResponse(5, 5, 2));

      renderWithProviders(<BinCountModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("bin-count-input")).toBeInTheDocument();
      });

      const input = screen.getByTestId("bin-count-input");
      await user.clear(input);

      // Should disable save button with empty input
      await waitFor(() => {
        const saveButton = screen.getByTestId("bin-count-save-button");
        expect(saveButton).toBeDisabled();
      });
    });

    it("should display store name in description when provided", async () => {
      renderWithProviders(
        <BinCountModal {...defaultProps} storeName="My Test Store" />,
      );

      await waitFor(() => {
        expect(screen.getByText(/My Test Store/)).toBeInTheDocument();
      });
    });

    it("should display generic text when store name is not provided", async () => {
      renderWithProviders(
        <BinCountModal {...defaultProps} storeName={undefined} />,
      );

      await waitFor(() => {
        expect(screen.getByText(/this store/)).toBeInTheDocument();
      });
    });

    it("should handle validation returning bins_with_packs_blocking count", async () => {
      const user = userEvent.setup();
      mockGetLotteryBinCount.mockResolvedValue(mockBinCountResponse(10, 10, 5));
      mockValidateLotteryBinCountChange.mockResolvedValue({
        success: true,
        data: {
          allowed: false,
          current_count: 10,
          bins_to_add: 0,
          bins_to_remove: 5,
          bins_with_packs_blocking: 3,
          message: "Cannot remove 3 bins because they have active packs.",
        },
      });

      renderWithProviders(<BinCountModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("bin-count-input")).toBeInTheDocument();
      });

      const input = screen.getByTestId("bin-count-input");
      await user.clear(input);
      await user.type(input, "5");

      await waitFor(() => {
        expect(screen.getByTestId("validation-result")).toBeInTheDocument();
        expect(screen.getByText("Cannot apply")).toBeInTheDocument();
        expect(screen.getByText(/Cannot remove 3 bins/)).toBeInTheDocument();
      });
    });

    it("should show correct statistics for store with no bins", async () => {
      mockGetLotteryBinCount.mockResolvedValue({
        success: true,
        data: {
          store_id: "test-store-id",
          bin_count: 0,
          active_bins: 0,
          bins_with_packs: 0,
          empty_bins: 0,
        },
      });

      renderWithProviders(<BinCountModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText("Current Status")).toBeInTheDocument();
        // All statistics should show 0
        const stats = screen.getAllByText("0");
        expect(stats.length).toBeGreaterThanOrEqual(3);
      });
    });

    it("should disable input while mutation is pending", async () => {
      const user = userEvent.setup();

      // Make the mutation never resolve
      mockUpdateLotteryBinCount.mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );
      mockGetLotteryBinCount.mockResolvedValue(mockBinCountResponse(5, 5, 0));
      mockValidateLotteryBinCountChange.mockResolvedValue(
        mockValidationResponse(true, 5, 0, "Will add 5 bins."),
      );

      renderWithProviders(<BinCountModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("bin-count-input")).toBeInTheDocument();
      });

      const input = screen.getByTestId("bin-count-input");
      await user.clear(input);
      await user.type(input, "10");

      await waitFor(() => {
        expect(screen.getByTestId("bin-count-save-button")).not.toBeDisabled();
      });

      // Click save
      const saveButton = screen.getByTestId("bin-count-save-button");
      await user.click(saveButton);

      // Input should be disabled while saving
      await waitFor(() => {
        expect(screen.getByTestId("bin-count-input")).toBeDisabled();
      });
    });
  });
});
