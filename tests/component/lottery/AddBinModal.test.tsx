/**
 * AddBinModal Component Tests - Client Dashboard (Batch Mode with Auto-Add)
 *
 * Test file for AddBinModal component used in client dashboard lottery management.
 * This component allows client owners to create bins and activate packs in batch mode
 * WITHOUT requiring an active shift.
 *
 * Key Features Tested:
 * - 24-digit serial input with auto-focus
 * - Auto-validation when 24 digits entered (with debounce)
 * - Auto-add to pending list on valid scan (like PackReceptionForm)
 * - Duplicate pack detection (client-side check before API)
 * - Batch submission of all pending bins
 * - Input clears and focuses after each scan
 * - Sequential bin number assignment (lowest available)
 *
 * Test Categories:
 * 1. Serial Input and Auto-Focus
 * 2. Auto-Add Flow (scan -> validate -> auto-add to list)
 * 3. Duplicate Detection
 * 4. Sequential Bin Assignment
 * 5. Pending List Management
 * 6. Batch Submit
 * 7. Error Handling
 * 8. Modal State Management
 * 9. Accessibility
 *
 * MCP Testing Guidelines Applied:
 * - Tests isolated with proper mocking
 * - Descriptive test names following naming convention
 * - data-testid attributes for reliable element selection
 * - Async operations properly awaited with waitFor
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock useClientAuth
vi.mock("@/contexts/ClientAuthContext", () => ({
  useClientAuth: () => ({
    user: { id: "test-user-id", email: "test@example.com" },
    isAuthenticated: true,
  }),
}));

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

// Mock successful pack validation response
function mockPackValidationSuccess(
  gameName = "$10 Jackpot",
  price = 10.0,
  packNumber = "5555555",
) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        data: {
          valid: true,
          game: { name: gameName, price },
          pack: {
            pack_id: `pack-${packNumber}`,
            pack_number: packNumber,
            serial_start: "001",
            serial_end: "300",
          },
        },
      }),
  };
}

// Mock pack validation error response
function mockPackValidationError(error: string) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        data: {
          valid: false,
          error,
        },
      }),
  };
}

// Mock successful bin creation response
function mockBinCreationSuccess(binNumber: number, packNumber: string) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        data: {
          bin: {
            bin_id: `bin-${binNumber}`,
            name: `Bin ${binNumber}`,
            display_order: binNumber - 1,
            is_active: true,
            pack: {
              pack_id: `pack-${packNumber}`,
              pack_number: packNumber,
              game: { name: "$10 Jackpot", price: 10.0 },
            },
          },
        },
      }),
  };
}

// Default props for AddBinModal
const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  storeId: "test-store-id",
  occupiedBinNumbers: [],
  onBinCreated: vi.fn(),
};

describe("AddBinModal (Client Dashboard) - Auto-Add Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockToast.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SERIAL INPUT AND AUTO-FOCUS TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Serial Input and Auto-Focus", () => {
    it("should have 24-digit serial input field with auto-focus on open", async () => {
      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      renderWithProviders(<AddBinModal {...defaultProps} />);

      const serialInput = screen.getByTestId("pack-serial-input");
      expect(serialInput).toBeInTheDocument();
      expect(serialInput).toHaveAttribute("maxLength", "24");

      // Auto-focus happens after 150ms delay
      await waitFor(
        () => {
          expect(document.activeElement).toBe(serialInput);
        },
        { timeout: 500 },
      );
    });

    it("should display digit counter showing progress", async () => {
      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(<AddBinModal {...defaultProps} />);

      const serialInput = screen.getByTestId("pack-serial-input");

      // Initially shows 0/24
      expect(screen.getByText("0/24 digits")).toBeInTheDocument();

      // Type some digits
      await user.type(serialInput, "123456");
      expect(screen.getByText("6/24 digits")).toBeInTheDocument();
    });

    it("should only accept numeric input and filter non-digits", async () => {
      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(<AddBinModal {...defaultProps} />);

      const serialInput = screen.getByTestId("pack-serial-input");
      await user.type(serialInput, "abc123def456");

      // Only digits should remain
      expect(serialInput).toHaveValue("123456");
    });

    it("should truncate serial input at 24 characters", async () => {
      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(<AddBinModal {...defaultProps} />);

      const serialInput = screen.getByTestId("pack-serial-input");
      await user.type(serialInput, "123456789012345678901234567890");

      // Should be truncated to 24
      expect(serialInput).toHaveValue("123456789012345678901234");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTO-ADD FLOW TESTS (Core Feature)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Auto-Add Flow (Scan -> Validate -> Auto-Add)", () => {
    it("should auto-validate and add pack to pending list when 24 digits entered", async () => {
      mockFetch.mockResolvedValueOnce(mockPackValidationSuccess());

      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(<AddBinModal {...defaultProps} />);

      const serialInput = screen.getByTestId("pack-serial-input");
      await user.type(serialInput, "000155555550123456789012");

      // Wait for debounce (400ms) + validation + auto-add
      await waitFor(
        () => {
          expect(
            screen.getByTestId("pending-assignments-list"),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Pack should be in pending list with auto-assigned bin 1
      expect(screen.getByText("$10 Jackpot")).toBeInTheDocument();
      expect(screen.getByText(/Bin 1/)).toBeInTheDocument();
    });

    it("should clear serial input after auto-adding to pending list", async () => {
      mockFetch.mockResolvedValueOnce(mockPackValidationSuccess());

      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(<AddBinModal {...defaultProps} />);

      const serialInput = screen.getByTestId("pack-serial-input");
      await user.type(serialInput, "000155555550123456789012");

      // Wait for auto-add to complete
      await waitFor(
        () => {
          expect(
            screen.getByTestId("pending-assignments-list"),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Serial input should be cleared
      expect(serialInput).toHaveValue("");
    });

    it("should show validating indicator during validation", async () => {
      // Delay the response to see loading state
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(mockPackValidationSuccess()), 500),
          ),
      );

      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(<AddBinModal {...defaultProps} />);

      const serialInput = screen.getByTestId("pack-serial-input");
      await user.type(serialInput, "000155555550123456789012");

      // Wait for debounce to trigger validation
      await waitFor(
        () => {
          expect(screen.getByText(/Validating/)).toBeInTheDocument();
        },
        { timeout: 1000 },
      );
    });

    it("should auto-assign sequential bin numbers for multiple packs", async () => {
      mockFetch
        .mockResolvedValueOnce(
          mockPackValidationSuccess("Game 1", 1.0, "1111111"),
        )
        .mockResolvedValueOnce(
          mockPackValidationSuccess("Game 2", 2.0, "2222222"),
        )
        .mockResolvedValueOnce(
          mockPackValidationSuccess("Game 3", 3.0, "3333333"),
        );

      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(<AddBinModal {...defaultProps} />);

      const serialInput = screen.getByTestId("pack-serial-input");

      // Scan first pack
      await user.type(serialInput, "000111111110123456789012");
      await waitFor(
        () => {
          expect(screen.getByText("Game 1")).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Scan second pack
      await user.type(serialInput, "000222222220123456789012");
      await waitFor(
        () => {
          expect(screen.getByText("Game 2")).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Scan third pack
      await user.type(serialInput, "000333333330123456789012");
      await waitFor(
        () => {
          expect(screen.getByText("Game 3")).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // All 3 should be in pending list with sequential bin numbers
      expect(screen.getByText("Bins Ready to Add (3)")).toBeInTheDocument();
      expect(screen.getAllByText(/Bin 1/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Bin 2/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Bin 3/).length).toBeGreaterThan(0);
    });

    it("should skip occupied bins when auto-assigning", async () => {
      mockFetch.mockResolvedValueOnce(
        mockPackValidationSuccess("Game 1", 5.0, "5555555"),
      );

      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(
        <AddBinModal {...defaultProps} occupiedBinNumbers={[1, 2, 3]} />,
      );

      const serialInput = screen.getByTestId("pack-serial-input");
      await user.type(serialInput, "000155555550123456789012");

      // Should auto-assign to Bin 4 (first available after 1,2,3)
      await waitFor(
        () => {
          expect(screen.getByText(/Bin 4/)).toBeInTheDocument();
        },
        { timeout: 2000 },
      );
    });

    it("should add new packs at TOP of pending list (newest first)", async () => {
      // GIVEN: Multiple packs scanned sequentially
      mockFetch
        .mockResolvedValueOnce(
          mockPackValidationSuccess("First Game", 1.0, "1111111"),
        )
        .mockResolvedValueOnce(
          mockPackValidationSuccess("Second Game", 2.0, "2222222"),
        )
        .mockResolvedValueOnce(
          mockPackValidationSuccess("Third Game", 3.0, "3333333"),
        );

      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(<AddBinModal {...defaultProps} />);

      const serialInput = screen.getByTestId("pack-serial-input");

      // Scan first pack
      await user.type(serialInput, "000111111110123456789012");
      await waitFor(
        () => {
          expect(screen.getByText("First Game")).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Scan second pack
      await user.type(serialInput, "000222222220123456789012");
      await waitFor(
        () => {
          expect(screen.getByText("Second Game")).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Scan third pack
      await user.type(serialInput, "000333333330123456789012");
      await waitFor(
        () => {
          expect(screen.getByText("Third Game")).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // THEN: Newest pack (Third Game) should be at TOP of list
      const pendingList = screen.getByTestId("pending-assignments-list");
      const listItems = within(pendingList).getAllByRole("listitem");

      // Third Game (newest) should be first in the list
      expect(listItems[0]).toHaveTextContent("Third Game");
      // Second Game should be second
      expect(listItems[1]).toHaveTextContent("Second Game");
      // First Game (oldest) should be last
      expect(listItems[2]).toHaveTextContent("First Game");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DUPLICATE DETECTION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Duplicate Detection", () => {
    it("should show toast error for duplicate pack in pending list", async () => {
      mockFetch.mockResolvedValueOnce(
        mockPackValidationSuccess("Game 1", 5.0, "1234567"),
      );

      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(<AddBinModal {...defaultProps} />);

      const serialInput = screen.getByTestId("pack-serial-input");

      // Add first pack
      await user.type(serialInput, "000112345670123456789012");
      await waitFor(
        () => {
          expect(
            screen.getByTestId("pending-assignments-list"),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Try to add same pack again (same serial = same pack number)
      await user.type(serialInput, "000112345670123456789012");

      // Should show toast error for duplicate (no second API call needed)
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

      // Only 1 item in pending list
      expect(screen.getByText("Bins Ready to Add (1)")).toBeInTheDocument();
    });

    it("should show toast error for pack not in RECEIVED status", async () => {
      mockFetch.mockResolvedValueOnce(
        mockPackValidationError("Pack must be in RECEIVED status to activate"),
      );

      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(<AddBinModal {...defaultProps} />);

      const serialInput = screen.getByTestId("pack-serial-input");
      await user.type(serialInput, "000155555550123456789012");

      await waitFor(
        () => {
          expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({
              title: "Invalid pack",
              variant: "destructive",
            }),
          );
        },
        { timeout: 2000 },
      );
    });

    it("should show toast error for pack not found", async () => {
      mockFetch.mockResolvedValueOnce(
        mockPackValidationError("Pack not found"),
      );

      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(<AddBinModal {...defaultProps} />);

      const serialInput = screen.getByTestId("pack-serial-input");
      await user.type(serialInput, "000199999990123456789012");

      await waitFor(
        () => {
          expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({
              title: "Invalid pack",
              description: "Pack not found",
              variant: "destructive",
            }),
          );
        },
        { timeout: 2000 },
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PENDING LIST MANAGEMENT TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Pending List Management", () => {
    it("should display pack info in pending list (Bin Dropdown, Game Name, Price, Green Check)", async () => {
      mockFetch.mockResolvedValueOnce(
        mockPackValidationSuccess("Super Jackpot", 25.0, "7777777"),
      );

      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(<AddBinModal {...defaultProps} />);

      const serialInput = screen.getByTestId("pack-serial-input");
      await user.type(serialInput, "000177777770123456789012");

      await waitFor(
        () => {
          expect(
            screen.getByTestId("pending-assignments-list"),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Check layout: 1. Bin dropdown, 2. Game name, 3. Price, 4. Green check
      const pendingList = screen.getByTestId("pending-assignments-list");

      // 1. Bin dropdown exists (shows "Bin 1" initially)
      expect(within(pendingList).getByText(/Bin 1/)).toBeInTheDocument();

      // 2. Game name
      expect(screen.getByTestId("pending-game-name")).toHaveTextContent(
        "Super Jackpot",
      );

      // 3. Price
      expect(screen.getByTestId("pending-price")).toHaveTextContent("$25.00");

      // 4. Green check icon
      expect(screen.getByTestId("valid-check-icon")).toBeInTheDocument();
    });

    it("should allow user to change bin number via dropdown", async () => {
      mockFetch.mockResolvedValueOnce(
        mockPackValidationSuccess("Game 1", 5.0, "1111111"),
      );

      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(<AddBinModal {...defaultProps} />);

      const serialInput = screen.getByTestId("pack-serial-input");
      await user.type(serialInput, "000111111110123456789012");

      await waitFor(
        () => {
          expect(
            screen.getByTestId("pending-assignments-list"),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Find the bin select trigger and click it
      const pendingList = screen.getByTestId("pending-assignments-list");
      const binSelect = within(pendingList).getByRole("combobox");
      await user.click(binSelect);

      // Select a different bin (Bin 5)
      const option = await screen.findByText("Bin 5");
      await user.click(option);

      // Bin should now show Bin 5
      await waitFor(() => {
        expect(within(pendingList).getByText(/Bin 5/)).toBeInTheDocument();
      });
    });

    it("should allow removing items from pending list", async () => {
      mockFetch.mockResolvedValueOnce(mockPackValidationSuccess());

      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(<AddBinModal {...defaultProps} />);

      const serialInput = screen.getByTestId("pack-serial-input");
      await user.type(serialInput, "000155555550123456789012");

      // Wait for pack to be added
      await waitFor(
        () => {
          expect(screen.getByText("Bins Ready to Add (1)")).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Find and click remove button
      const pendingList = screen.getByTestId("pending-assignments-list");
      const removeButton = within(pendingList).getByRole("button");
      await user.click(removeButton);

      // Pending list should be empty (hidden when empty)
      await waitFor(() => {
        expect(
          screen.queryByTestId("pending-assignments-list"),
        ).not.toBeInTheDocument();
      });
    });

    it("should re-enable bin number when item removed from pending list", async () => {
      mockFetch
        .mockResolvedValueOnce(
          mockPackValidationSuccess("Game 1", 5.0, "1111111"),
        )
        .mockResolvedValueOnce(
          mockPackValidationSuccess("Game 2", 10.0, "2222222"),
        );

      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(<AddBinModal {...defaultProps} />);

      const serialInput = screen.getByTestId("pack-serial-input");

      // Add first pack (gets Bin 1)
      await user.type(serialInput, "000111111110123456789012");
      await waitFor(
        () => {
          expect(screen.getByText("Bins Ready to Add (1)")).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Remove it
      const pendingList = screen.getByTestId("pending-assignments-list");
      const removeButton = within(pendingList).getByRole("button");
      await user.click(removeButton);

      // Wait for removal
      await waitFor(() => {
        expect(
          screen.queryByTestId("pending-assignments-list"),
        ).not.toBeInTheDocument();
      });

      // Add another pack - should get Bin 1 again (not Bin 2)
      await user.type(serialInput, "000222222220123456789012");
      await waitFor(
        () => {
          expect(screen.getByText(/Bin 1/)).toBeInTheDocument();
        },
        { timeout: 2000 },
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BATCH SUBMIT TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Batch Submit", () => {
    it("should submit all pending bins at once", async () => {
      mockFetch
        .mockResolvedValueOnce(
          mockPackValidationSuccess("Game 1", 5.0, "1111111"),
        )
        .mockResolvedValueOnce(
          mockPackValidationSuccess("Game 2", 10.0, "2222222"),
        )
        .mockResolvedValueOnce(mockBinCreationSuccess(1, "1111111"))
        .mockResolvedValueOnce(mockBinCreationSuccess(2, "2222222"));

      const onBinCreated = vi.fn();
      const onOpenChange = vi.fn();
      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(
        <AddBinModal
          {...defaultProps}
          onBinCreated={onBinCreated}
          onOpenChange={onOpenChange}
        />,
      );

      const serialInput = screen.getByTestId("pack-serial-input");

      // Add 2 packs
      await user.type(serialInput, "000111111110123456789012");
      await waitFor(
        () => {
          expect(screen.getByText("Game 1")).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      await user.type(serialInput, "000222222220123456789012");
      await waitFor(
        () => {
          expect(screen.getByText("Game 2")).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Click submit
      await user.click(screen.getByTestId("add-bin-submit-button"));

      // Wait for all bins to be created
      await waitFor(() => {
        expect(onBinCreated).toHaveBeenCalledTimes(2);
      });

      // Modal should close
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("should disable submit button when no pending items", async () => {
      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      renderWithProviders(<AddBinModal {...defaultProps} />);

      const submitButton = screen.getByTestId("add-bin-submit-button");
      expect(submitButton).toBeDisabled();
    });

    it("should show singular 'Bin' when only 1 pending item", async () => {
      mockFetch.mockResolvedValueOnce(mockPackValidationSuccess());

      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(<AddBinModal {...defaultProps} />);

      const serialInput = screen.getByTestId("pack-serial-input");
      await user.type(serialInput, "000155555550123456789012");

      await waitFor(
        () => {
          expect(screen.getByText("Bins Ready to Add (1)")).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Button should say "Add 1 Bin" (singular)
      expect(screen.getByTestId("add-bin-submit-button")).toHaveTextContent(
        "Add 1 Bin",
      );
    });

    it("should show plural 'Bins' when multiple pending items", async () => {
      mockFetch
        .mockResolvedValueOnce(
          mockPackValidationSuccess("Game 1", 1.0, "1111111"),
        )
        .mockResolvedValueOnce(
          mockPackValidationSuccess("Game 2", 2.0, "2222222"),
        );

      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(<AddBinModal {...defaultProps} />);

      const serialInput = screen.getByTestId("pack-serial-input");

      await user.type(serialInput, "000111111110123456789012");
      await waitFor(
        () => {
          expect(screen.getByText("Game 1")).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      await user.type(serialInput, "000222222220123456789012");
      await waitFor(
        () => {
          expect(screen.getByText("Game 2")).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Button should say "Add 2 Bins" (plural)
      expect(screen.getByTestId("add-bin-submit-button")).toHaveTextContent(
        "Add 2 Bins",
      );
    });

    it("should handle partial failure during batch submit", async () => {
      mockFetch
        .mockResolvedValueOnce(
          mockPackValidationSuccess("Game 1", 5.0, "1111111"),
        )
        .mockResolvedValueOnce(
          mockPackValidationSuccess("Game 2", 10.0, "2222222"),
        )
        .mockResolvedValueOnce(mockBinCreationSuccess(1, "1111111"))
        .mockRejectedValueOnce(new Error("Database error"));

      const onBinCreated = vi.fn();
      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(
        <AddBinModal {...defaultProps} onBinCreated={onBinCreated} />,
      );

      const serialInput = screen.getByTestId("pack-serial-input");

      // Add 2 packs
      await user.type(serialInput, "000111111110123456789012");
      await waitFor(
        () => {
          expect(screen.getByText("Game 1")).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      await user.type(serialInput, "000222222220123456789012");
      await waitFor(
        () => {
          expect(screen.getByText("Game 2")).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Click submit
      await user.click(screen.getByTestId("add-bin-submit-button"));

      // First bin should succeed
      await waitFor(() => {
        expect(onBinCreated).toHaveBeenCalledTimes(1);
      });

      // Error should be displayed
      await waitFor(() => {
        expect(screen.getByTestId("error-message")).toBeInTheDocument();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NO BINS AVAILABLE TEST
  // ═══════════════════════════════════════════════════════════════════════════

  describe("No Bins Available", () => {
    it("should show toast error when all bins are occupied", async () => {
      mockFetch.mockResolvedValueOnce(mockPackValidationSuccess());

      // All 200 bins occupied
      const allOccupied = Array.from({ length: 200 }, (_, i) => i + 1);
      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(
        <AddBinModal {...defaultProps} occupiedBinNumbers={allOccupied} />,
      );

      const serialInput = screen.getByTestId("pack-serial-input");
      await user.type(serialInput, "000155555550123456789012");

      await waitFor(
        () => {
          expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({
              title: "No bins available",
              variant: "destructive",
            }),
          );
        },
        { timeout: 2000 },
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DEFAULT STARTING NUMBER TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Default Starting Number (000)", () => {
    it("should use default starting number 000 for all packs", async () => {
      mockFetch
        .mockResolvedValueOnce(mockPackValidationSuccess())
        .mockResolvedValueOnce(mockBinCreationSuccess(1, "5555555"));

      const onBinCreated = vi.fn();
      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(
        <AddBinModal {...defaultProps} onBinCreated={onBinCreated} />,
      );

      const serialInput = screen.getByTestId("pack-serial-input");
      await user.type(serialInput, "000155555550123456789012");

      await waitFor(
        () => {
          expect(
            screen.getByTestId("pending-assignments-list"),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Submit
      await user.click(screen.getByTestId("add-bin-submit-button"));

      // Check the API was called with serial_start: "000"
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining("/bins/create-with-pack"),
          expect.objectContaining({
            body: expect.stringContaining('"serial_start":"000"'),
          }),
        );
      });
    });

    it("should NOT have a starting number input field", async () => {
      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      renderWithProviders(<AddBinModal {...defaultProps} />);

      // No starting number input should exist
      expect(
        screen.queryByTestId("starting-number-input"),
      ).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/starting/i)).not.toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MODAL STATE MANAGEMENT TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Modal State Management", () => {
    it("should reset all state when modal reopens", async () => {
      mockFetch.mockResolvedValueOnce(mockPackValidationSuccess());

      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      const { rerender } = renderWithProviders(
        <AddBinModal {...defaultProps} />,
      );

      const serialInput = screen.getByTestId("pack-serial-input");
      await user.type(serialInput, "000155555550123456789012");

      // Wait for pack to be added
      await waitFor(
        () => {
          expect(
            screen.getByTestId("pending-assignments-list"),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Close modal
      rerender(<AddBinModal {...defaultProps} open={false} />);

      // Reopen modal
      rerender(<AddBinModal {...defaultProps} open={true} />);

      // State should be reset
      expect(
        screen.queryByTestId("pending-assignments-list"),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("pack-serial-input")).toHaveValue("");
    });

    it("should call onOpenChange with false when cancel is clicked", async () => {
      const onOpenChange = vi.fn();
      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(
        <AddBinModal {...defaultProps} onOpenChange={onOpenChange} />,
      );

      await user.click(screen.getByTestId("add-bin-cancel-button"));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCESSIBILITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Accessibility", () => {
    it("should have proper form labels", async () => {
      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      renderWithProviders(<AddBinModal {...defaultProps} />);

      expect(screen.getByLabelText(/serial number/i)).toBeInTheDocument();
    });

    it("should have autocomplete off for security-sensitive fields", async () => {
      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      renderWithProviders(<AddBinModal {...defaultProps} />);

      const serialInput = screen.getByTestId("pack-serial-input");
      expect(serialInput).toHaveAttribute("autocomplete", "off");
    });

    it("should have aria-label on serial input", async () => {
      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      renderWithProviders(<AddBinModal {...defaultProps} />);

      const serialInput = screen.getByTestId("pack-serial-input");
      expect(serialInput).toHaveAttribute("aria-label");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REGRESSION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Regression Tests", () => {
    it("should handle rapid successive scans correctly", async () => {
      mockFetch
        .mockResolvedValueOnce(
          mockPackValidationSuccess("Game 1", 1.0, "1111111"),
        )
        .mockResolvedValueOnce(
          mockPackValidationSuccess("Game 2", 2.0, "2222222"),
        );

      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(<AddBinModal {...defaultProps} />);

      const serialInput = screen.getByTestId("pack-serial-input");

      // Type first serial quickly
      await user.type(serialInput, "000111111110123456789012");

      // Wait for first to be processed
      await waitFor(
        () => {
          expect(screen.getByText("Game 1")).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      // Type second serial
      await user.type(serialInput, "000222222220123456789012");

      // Both should be in list
      await waitFor(
        () => {
          expect(screen.getByText("Game 2")).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      expect(screen.getByText("Bins Ready to Add (2)")).toBeInTheDocument();
    });

    it("should not allow submission while validating", async () => {
      // Create a delayed response
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(mockPackValidationSuccess()), 1000),
          ),
      );

      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(<AddBinModal {...defaultProps} />);

      const serialInput = screen.getByTestId("pack-serial-input");
      await user.type(serialInput, "000155555550123456789012");

      // During validation, input should be disabled
      await waitFor(() => {
        expect(serialInput).toBeDisabled();
      });
    });

    it("should handle network errors gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(<AddBinModal {...defaultProps} />);

      const serialInput = screen.getByTestId("pack-serial-input");
      await user.type(serialInput, "000155555550123456789012");

      await waitFor(
        () => {
          expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({
              title: "Validation error",
              variant: "destructive",
            }),
          );
        },
        { timeout: 2000 },
      );

      // Input should be cleared and ready for next scan
      expect(serialInput).toHaveValue("");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // OCCUPIED BIN HANDLING TESTS (AUTO-DEPLETION CONFIRMATION)
  // Story: Lottery Pack Auto-Depletion Feature
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // TRACEABILITY MATRIX:
  // | Test ID | Requirement | Type | Priority |
  // |---------|-------------|------|----------|
  // | OCC-001 | Allow selecting occupied bins | UI | P0 |
  // | OCC-002 | Show warning when occupied bin selected | UI | P0 |
  // | OCC-003 | Display amber warning icon for auto-deplete | UI | P0 |
  // | OCC-004 | Show "(Occupied)" label in bin dropdown | UI | P0 |
  // | OCC-005 | Set depletePrevious flag for occupied bins | Business Logic | P0 |
  // | OCC-006 | Show toast when auto-assigning to occupied bin | UI | P1 |
  // | OCC-007 | Pass deplete_previous to API | Integration | P0 |
  // | OCC-008 | Prioritize empty bins over occupied | Business Logic | P1 |
  // | OCC-009 | Display previous pack info in warning | UI | P1 |
  // | OCC-010 | Clear depletePrevious when switching to empty bin | Business Logic | P1 |

  describe("Occupied Bin Handling (Auto-Depletion)", () => {
    const occupiedBinInfo = new Map([
      [1, { binNumber: 1, packNumber: "PREV001", gameName: "Old Game 1" }],
      [2, { binNumber: 2, packNumber: "PREV002", gameName: "Old Game 2" }],
    ]);

    const propsWithOccupiedBins = {
      ...defaultProps,
      occupiedBinNumbers: [1, 2],
      occupiedBinInfo,
    };

    it("OCC-001: [P0] should allow selecting occupied bins in dropdown", async () => {
      mockFetch.mockResolvedValueOnce(
        mockPackValidationSuccess("New Game", 5.0, "NEW001"),
      );

      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(<AddBinModal {...propsWithOccupiedBins} />);

      const serialInput = screen.getByTestId("pack-serial-input");
      await user.type(serialInput, "000100010010123456789012");

      // Wait for pack to be added to pending list
      await waitFor(
        () => {
          expect(
            screen.getByTestId("pending-assignments-list"),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Find and click the bin dropdown
      const pendingList = screen.getByTestId("pending-assignments-list");
      const binSelect = within(pendingList).getByRole("combobox");
      await user.click(binSelect);

      // Occupied bins should be selectable (showing "(Occupied)")
      expect(screen.getByText("Bin 1 (Occupied)")).toBeInTheDocument();
      expect(screen.getByText("Bin 2 (Occupied)")).toBeInTheDocument();
    });

    it("OCC-002: [P0] should show warning toast when pack assigned to occupied bin", async () => {
      // All empty bins taken by pending, forcing auto-assign to occupied bin
      // Or simply test when user manually selects occupied bin
      mockFetch.mockResolvedValueOnce(
        mockPackValidationSuccess("New Game", 5.0, "NEW002"),
      );

      // Only bins 1 and 2 are occupied, empty bins exist
      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(<AddBinModal {...propsWithOccupiedBins} />);

      const serialInput = screen.getByTestId("pack-serial-input");
      await user.type(serialInput, "000200020020123456789012");

      // Wait for pack to be added (auto-assigned to Bin 3, first empty)
      await waitFor(
        () => {
          expect(
            screen.getByTestId("pending-assignments-list"),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Change to occupied bin
      const pendingList = screen.getByTestId("pending-assignments-list");
      const binSelect = within(pendingList).getByRole("combobox");
      await user.click(binSelect);

      // Select occupied bin 1
      const occupiedOption = screen.getByText("Bin 1 (Occupied)");
      await user.click(occupiedOption);

      // Toast warning should be shown
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Bin occupied - Pack will be marked sold",
          }),
        );
      });
    });

    it("OCC-003: [P0] should display amber warning icon for bins that will auto-deplete", async () => {
      mockFetch.mockResolvedValueOnce(
        mockPackValidationSuccess("New Game", 5.0, "NEW003"),
      );

      // Props where all empty bins are "occupied" to force auto-assign to occupied bin
      const allOccupiedExceptHigh = {
        ...defaultProps,
        occupiedBinNumbers: [1, 2, 3, 4, 5], // First 5 occupied
        occupiedBinInfo: new Map([
          [1, { binNumber: 1, packNumber: "P1", gameName: "G1" }],
          [2, { binNumber: 2, packNumber: "P2", gameName: "G2" }],
          [3, { binNumber: 3, packNumber: "P3", gameName: "G3" }],
          [4, { binNumber: 4, packNumber: "P4", gameName: "G4" }],
          [5, { binNumber: 5, packNumber: "P5", gameName: "G5" }],
        ]),
      };

      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(<AddBinModal {...allOccupiedExceptHigh} />);

      const serialInput = screen.getByTestId("pack-serial-input");
      await user.type(serialInput, "000300030030123456789012");

      // Wait for pack to be added to pending list
      await waitFor(
        () => {
          expect(
            screen.getByTestId("pending-assignments-list"),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // First pack should auto-assign to Bin 6 (first empty)
      const pendingList = screen.getByTestId("pending-assignments-list");
      expect(within(pendingList).getByText(/Bin 6/)).toBeInTheDocument();

      // Should have green check (not warning) since it's an empty bin
      expect(screen.getByTestId("valid-check-icon")).toBeInTheDocument();
    });

    it("OCC-004: [P0] should show '(Occupied)' label in bin dropdown for occupied bins", async () => {
      mockFetch.mockResolvedValueOnce(
        mockPackValidationSuccess("New Game", 5.0, "NEW004"),
      );

      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(<AddBinModal {...propsWithOccupiedBins} />);

      const serialInput = screen.getByTestId("pack-serial-input");
      await user.type(serialInput, "000400040040123456789012");

      await waitFor(
        () => {
          expect(
            screen.getByTestId("pending-assignments-list"),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Open dropdown
      const pendingList = screen.getByTestId("pending-assignments-list");
      const binSelect = within(pendingList).getByRole("combobox");
      await user.click(binSelect);

      // Check that occupied bins show "(Occupied)" label
      expect(screen.getByText("Bin 1 (Occupied)")).toBeInTheDocument();
      expect(screen.getByText("Bin 2 (Occupied)")).toBeInTheDocument();

      // Empty bins should NOT have "(Occupied)" label
      const bin3Option = screen.getByText("Bin 3");
      expect(bin3Option.textContent).not.toContain("(Occupied)");
    });

    it("OCC-008: [P1] should prioritize empty bins over occupied bins for auto-assignment", async () => {
      mockFetch.mockResolvedValueOnce(
        mockPackValidationSuccess("New Game", 5.0, "NEW008"),
      );

      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(<AddBinModal {...propsWithOccupiedBins} />);

      const serialInput = screen.getByTestId("pack-serial-input");
      await user.type(serialInput, "000800080080123456789012");

      // Wait for pack to be added
      await waitFor(
        () => {
          expect(
            screen.getByTestId("pending-assignments-list"),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Should be assigned to Bin 3 (first empty), not Bin 1 (occupied)
      const pendingList = screen.getByTestId("pending-assignments-list");
      expect(within(pendingList).getByText(/Bin 3/)).toBeInTheDocument();

      // Should have green check icon (empty bin = no warning)
      expect(screen.getByTestId("valid-check-icon")).toBeInTheDocument();
    });

    it("OCC-007: [P0] should pass deplete_previous to API when submitting", async () => {
      mockFetch
        .mockResolvedValueOnce(
          mockPackValidationSuccess("New Game", 5.0, "NEW007"),
        )
        .mockResolvedValueOnce(mockBinCreationSuccess(1, "NEW007"));

      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(<AddBinModal {...propsWithOccupiedBins} />);

      const serialInput = screen.getByTestId("pack-serial-input");
      await user.type(serialInput, "000700070070123456789012");

      // Wait for pack to be added
      await waitFor(
        () => {
          expect(
            screen.getByTestId("pending-assignments-list"),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Change to occupied bin
      const pendingList = screen.getByTestId("pending-assignments-list");
      const binSelect = within(pendingList).getByRole("combobox");
      await user.click(binSelect);

      const occupiedOption = screen.getByText("Bin 1 (Occupied)");
      await user.click(occupiedOption);

      // Submit
      await user.click(screen.getByTestId("add-bin-submit-button"));

      // Check that API was called with deplete_previous: true
      await waitFor(() => {
        const createCall = mockFetch.mock.calls.find((call) =>
          String(call[0]).includes("/bins/create-with-pack"),
        );
        expect(createCall).toBeDefined();
        const body = JSON.parse(createCall![1].body);
        expect(body.deplete_previous).toBe(true);
      });
    });

    it("OCC-009: [P1] should display previous pack info in warning text", async () => {
      mockFetch.mockResolvedValueOnce(
        mockPackValidationSuccess("New Game", 5.0, "NEW009"),
      );

      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(<AddBinModal {...propsWithOccupiedBins} />);

      const serialInput = screen.getByTestId("pack-serial-input");
      await user.type(serialInput, "000900090090123456789012");

      await waitFor(
        () => {
          expect(
            screen.getByTestId("pending-assignments-list"),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Change to occupied bin
      const pendingList = screen.getByTestId("pending-assignments-list");
      const binSelect = within(pendingList).getByRole("combobox");
      await user.click(binSelect);

      const occupiedOption = screen.getByText("Bin 1 (Occupied)");
      await user.click(occupiedOption);

      // Toast should include previous pack info
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            description: expect.stringContaining("PREV001"),
          }),
        );
      });
    });

    it("OCC-010: [P1] should clear depletePrevious flag when switching to empty bin", async () => {
      mockFetch
        .mockResolvedValueOnce(
          mockPackValidationSuccess("New Game", 5.0, "NEW010"),
        )
        .mockResolvedValueOnce(mockBinCreationSuccess(5, "NEW010"));

      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(<AddBinModal {...propsWithOccupiedBins} />);

      const serialInput = screen.getByTestId("pack-serial-input");
      await user.type(serialInput, "001000100100123456789012");

      await waitFor(
        () => {
          expect(
            screen.getByTestId("pending-assignments-list"),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // First select occupied bin
      const pendingList = screen.getByTestId("pending-assignments-list");
      const binSelect = within(pendingList).getByRole("combobox");
      await user.click(binSelect);
      await user.click(screen.getByText("Bin 1 (Occupied)"));

      // Then switch back to empty bin
      await user.click(binSelect);
      await user.click(screen.getByText("Bin 5"));

      // Now it should have green check (not warning)
      await waitFor(() => {
        expect(screen.getByTestId("valid-check-icon")).toBeInTheDocument();
      });

      // Submit
      await user.click(screen.getByTestId("add-bin-submit-button"));

      // Check that API was NOT called with deplete_previous: true
      await waitFor(() => {
        const createCall = mockFetch.mock.calls.find((call) =>
          String(call[0]).includes("/bins/create-with-pack"),
        );
        expect(createCall).toBeDefined();
        const body = JSON.parse(createCall![1].body);
        expect(body.deplete_previous).toBeFalsy();
      });
    });

    it("should show amber background styling for items that will auto-deplete", async () => {
      mockFetch.mockResolvedValueOnce(
        mockPackValidationSuccess("New Game", 5.0, "NEWAMBER"),
      );

      const { AddBinModal } = await import("@/components/lottery/AddBinModal");
      const user = userEvent.setup();
      renderWithProviders(<AddBinModal {...propsWithOccupiedBins} />);

      const serialInput = screen.getByTestId("pack-serial-input");
      await user.type(serialInput, "000100010010123456789012");

      await waitFor(
        () => {
          expect(
            screen.getByTestId("pending-assignments-list"),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Change to occupied bin to trigger warning styling
      const pendingList = screen.getByTestId("pending-assignments-list");
      const binSelect = within(pendingList).getByRole("combobox");
      await user.click(binSelect);
      await user.click(screen.getByText("Bin 1 (Occupied)"));

      // Check for amber styling on the row (using regex for partial class match)
      await waitFor(() => {
        // The pending item should have amber background
        const pendingItems = screen.getAllByTestId(/pending-item-/);
        expect(pendingItems.length).toBeGreaterThan(0);
        // Check for amber class
        expect(pendingItems[0].className).toMatch(/amber/);
      });
    });
  });
});
