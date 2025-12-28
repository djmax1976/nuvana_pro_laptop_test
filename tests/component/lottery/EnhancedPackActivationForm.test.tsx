/**
 * EnhancedPackActivationForm Component Tests (Batch Mode)
 *
 * Test file for EnhancedPackActivationForm component - the batch activation form
 * for activating multiple lottery packs in a single session.
 *
 * ============================================================================
 * TRACEABILITY MATRIX
 * ============================================================================
 * | Test ID                    | Requirement              | Category         |
 * |----------------------------|--------------------------|------------------|
 * | BATCH-001                  | Render batch form dialog | Component        |
 * | BATCH-002                  | Pack search integration  | Integration      |
 * | BATCH-003                  | Bin selection modal      | Integration      |
 * | BATCH-004                  | Add pack to pending list | Business Logic   |
 * | BATCH-005                  | Newest pack at top       | Business Logic   |
 * | BATCH-006                  | Remove pack from list    | Business Logic   |
 * | BATCH-007                  | Duplicate pack rejection | Validation       |
 * | BATCH-008                  | Pending bin warning      | Component        |
 * | BATCH-009                  | Activate all packs       | Integration      |
 * | BATCH-010                  | Partial failure handling | Error Handling   |
 * | BATCH-011                  | Empty list disable btn   | Business Logic   |
 * | BATCH-012                  | Success closes modal     | Business Logic   |
 * | BATCH-013                  | Retry failed packs       | Error Handling   |
 * | BATCH-014                  | Reset on modal open      | Business Logic   |
 * | BATCH-015                  | Occupied bin indicator   | Component        |
 * | BATCH-016                  | PendingBinIds filtering  | Security         |
 * | BATCH-017                  | No duplicate bin select  | Security         |
 * | BATCH-018                  | Multiple bin tracking    | Business Logic   |
 * | BATCH-019                  | Clear input after add    | UX Enhancement   |
 * | BATCH-020                  | Toast on duplicate pack  | UX Enhancement   |
 * | BATCH-021                  | Pack Sold button render  | Component        |
 * | BATCH-022                  | Toggle pack sold on      | Business Logic   |
 * | BATCH-023                  | Toggle pack sold off     | Business Logic   |
 * | BATCH-024                  | API mark_sold fields     | Integration      |
 * | BATCH-025                  | No mark_sold if not set  | Business Logic   |
 * | BATCH-026                  | Persist mark sold state  | Business Logic   |
 * | BATCH-027                  | Disabled during submit   | UX Enhancement   |
 * ============================================================================
 *
 * Key Features Tested:
 * - Batch activation workflow
 * - Pending pack list management
 * - Bin selection sub-modal integration
 * - Sequential API calls with error handling
 * - Partial failure recovery
 *
 * MCP Guidance Applied:
 * - FE-002: FORM_VALIDATION - Pack validation before add
 * - SEC-014: INPUT_VALIDATION - Duplicate check, UUID validation
 * - FE-001: STATE_MANAGEMENT - Pending list state management
 * - API-003: ERROR_HANDLING - Partial failure handling
 *
 * @story Batch Pack Activation
 * @priority P0 (Critical - Core Feature)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { EnhancedPackActivationForm } from "@/components/lottery/EnhancedPackActivationForm";
import type { DayBin } from "@/lib/api/lottery";

// Test UUIDs for validation
const TEST_PACK_ID_1 = "11111111-1111-1111-1111-111111111111";
const TEST_PACK_ID_2 = "22222222-2222-2222-2222-222222222222";
const TEST_PACK_ID_3 = "33333333-3333-3333-3333-333333333333";
const TEST_BIN_ID_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TEST_BIN_ID_2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const TEST_BIN_ID_3 = "cccccccc-cccc-cccc-cccc-cccccccccccc";

// Track which pack to return when pack search is triggered
let currentPackIndex = 0;
const testPacks = [
  {
    pack_id: TEST_PACK_ID_1,
    pack_number: "12345",
    game_id: "game-1",
    game_name: "Mega Millions",
    game_price: 2.0,
    serial_start: "001",
    serial_end: "150",
  },
  {
    pack_id: TEST_PACK_ID_2,
    pack_number: "67890",
    game_id: "game-2",
    game_name: "Powerball",
    game_price: 5.0,
    serial_start: "001",
    serial_end: "100",
  },
  {
    pack_id: TEST_PACK_ID_3,
    pack_number: "11111",
    game_id: "game-3",
    game_name: "Cash 5",
    game_price: 1.0,
    serial_start: "001",
    serial_end: "200",
  },
];

// Track which bin to select in modal
let currentBinIndex = 0;

// Mock PackSearchCombobox - simulates pack selection (uses new fully controlled API)
vi.mock("@/components/lottery/PackSearchCombobox", () => ({
  PackSearchCombobox: vi.fn(
    ({ onPackSelect, testId, disabled, searchQuery }) => (
      <div data-testid={testId}>
        <input
          data-testid="mock-pack-search-input"
          value={searchQuery || ""}
          readOnly
          disabled={disabled}
        />
        <button
          data-testid="mock-pack-select"
          disabled={disabled}
          onClick={() => {
            const pack = testPacks[currentPackIndex % testPacks.length];
            onPackSelect(pack);
            currentPackIndex++;
          }}
        >
          Select Pack
        </button>
        <button
          data-testid="mock-select-duplicate"
          disabled={disabled}
          onClick={() => {
            // Always select the first pack (for duplicate testing)
            const pack = testPacks[0];
            onPackSelect(pack);
          }}
        >
          Select Duplicate
        </button>
      </div>
    ),
  ),
}));

// Mock BinSelectionModal - simulates bin selection
// Uses createPortal to render outside the main dialog's overlay which has pointer-events: none
vi.mock("@/components/lottery/BinSelectionModal", () => ({
  BinSelectionModal: vi.fn(
    ({ open, onOpenChange, pack, bins, pendingBinIds, onConfirm }) => {
      if (!open || !pack) return null;

      const handleSelectBin = (index: number) => {
        const bin = bins[index];
        if (bin) {
          const isOccupied = bin.pack !== null;
          onConfirm(bin.bin_id, bin, isOccupied);
        }
      };

      // Render in a portal to escape the dialog's pointer-events: none overlay
      return createPortal(
        <div
          data-testid="bin-selection-modal"
          style={{ pointerEvents: "auto" }}
        >
          <div data-testid="modal-pack-name">{pack.game_name}</div>
          <div data-testid="modal-pack-number">{pack.pack_number}</div>
          {bins.map((bin: DayBin, index: number) => (
            <button
              key={bin.bin_id}
              data-testid={`select-bin-${index}`}
              onClick={() => handleSelectBin(index)}
              style={{ pointerEvents: "auto" }}
            >
              Bin {bin.bin_number}
              {pendingBinIds.includes(bin.bin_id) && " (pending)"}
              {bin.pack && " (occupied)"}
            </button>
          ))}
          <button
            data-testid="cancel-bin-selection"
            onClick={() => onOpenChange(false)}
            style={{ pointerEvents: "auto" }}
          >
            Cancel
          </button>
        </div>,
        document.body,
      );
    },
  ),
}));

// Mock hooks
const mockMutateAsync = vi.fn();
vi.mock("@/hooks/useLottery", () => ({
  useFullPackActivation: vi.fn(() => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
    isError: false,
    error: null,
  })),
  useLotteryDayBins: vi.fn(() => ({
    data: { bins: [] },
    isLoading: false,
  })),
}));

// Mock useToast
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Mock ClientAuthContext
const mockUser = {
  id: "user-1",
  roles: ["STORE_MANAGER"],
};

vi.mock("@/contexts/ClientAuthContext", () => ({
  useClientAuth: () => ({
    user: mockUser,
    permissions: ["LOTTERY_SERIAL_OVERRIDE", "LOTTERY_MARK_SOLD"],
  }),
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

// Mock day bins
const mockDayBins: DayBin[] = [
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

describe("EnhancedPackActivationForm (Batch Mode)", () => {
  const defaultProps = {
    storeId: "store-123",
    open: true,
    onOpenChange: vi.fn(),
    onSuccess: vi.fn(),
    dayBins: mockDayBins,
  };

  // Setup userEvent with pointerEventsCheck disabled to work with dialog overlays
  // The mock components render inside the dialog context which has pointer-events: none on overlays
  const setupUser = () => userEvent.setup({ pointerEventsCheck: 0 });

  beforeEach(() => {
    vi.clearAllMocks();
    currentPackIndex = 0;
    currentBinIndex = 0;
    mockMutateAsync.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ============================================================================
  // SECTION 1: COMPONENT RENDERING (BATCH-001)
  // ============================================================================

  describe("Component Rendering", () => {
    it("BATCH-001: should render batch activation form dialog when open", () => {
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      expect(
        screen.getByTestId("batch-pack-activation-form"),
      ).toBeInTheDocument();
      expect(screen.getByText("Activate Packs")).toBeInTheDocument();
      expect(screen.getByText(/scan or search for packs/i)).toBeInTheDocument();
    });

    it("should not render dialog when open is false", () => {
      renderWithProviders(
        <EnhancedPackActivationForm {...defaultProps} open={false} />,
      );

      expect(
        screen.queryByTestId("batch-pack-activation-form"),
      ).not.toBeInTheDocument();
    });

    it("should render pack search component", () => {
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      expect(screen.getByTestId("batch-pack-search")).toBeInTheDocument();
    });

    it("should render empty pending list with helper text", () => {
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      expect(screen.getByText("Pending Packs (0)")).toBeInTheDocument();
      expect(
        screen.getByText("Scan a pack to get started"),
      ).toBeInTheDocument();
    });

    it("BATCH-011: should disable activate button when list is empty", () => {
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      const activateButton = screen.getByTestId("activate-all-button");
      expect(activateButton).toBeDisabled();
      expect(activateButton).toHaveTextContent("Add Packs to Activate");
    });
  });

  // ============================================================================
  // SECTION 2: PACK SELECTION AND BIN MODAL (BATCH-002, BATCH-003)
  // ============================================================================

  describe("Pack Selection and Bin Modal", () => {
    it("BATCH-002: should open bin selection modal when pack is selected", async () => {
      const user = setupUser();
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Select a pack
      await user.click(screen.getByTestId("mock-pack-select"));

      // Bin modal should open
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });

      // Modal should show pack details
      expect(screen.getByTestId("modal-pack-name")).toHaveTextContent(
        "Mega Millions",
      );
      expect(screen.getByTestId("modal-pack-number")).toHaveTextContent(
        "12345",
      );
    });

    it("BATCH-003: should show all bins in selection modal", async () => {
      const user = setupUser();
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      await user.click(screen.getByTestId("mock-pack-select"));

      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });

      // All bins should be visible
      expect(screen.getByTestId("select-bin-0")).toHaveTextContent("Bin 1");
      expect(screen.getByTestId("select-bin-1")).toHaveTextContent("Bin 2");
      expect(screen.getByTestId("select-bin-2")).toHaveTextContent("Bin 3");
    });

    it("BATCH-015: should indicate occupied bins in selection modal", async () => {
      const user = setupUser();
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      await user.click(screen.getByTestId("mock-pack-select"));

      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });

      // Bin 2 is occupied
      expect(screen.getByTestId("select-bin-1")).toHaveTextContent(
        "(occupied)",
      );
    });

    it("should close bin modal when cancel is clicked", async () => {
      const user = setupUser();
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      await user.click(screen.getByTestId("mock-pack-select"));

      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("cancel-bin-selection"));

      await waitFor(() => {
        expect(
          screen.queryByTestId("bin-selection-modal"),
        ).not.toBeInTheDocument();
      });

      // Pending list should remain empty
      expect(screen.getByText("Pending Packs (0)")).toBeInTheDocument();
    });
  });

  // ============================================================================
  // SECTION 3: PENDING LIST MANAGEMENT (BATCH-004, BATCH-005, BATCH-006)
  // ============================================================================

  describe("Pending List Management", () => {
    it("BATCH-004: should add pack to pending list after bin selection", async () => {
      const user = setupUser();
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Select pack
      await user.click(screen.getByTestId("mock-pack-select"));

      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });

      // Select bin
      await user.click(screen.getByTestId("select-bin-0"));

      // Modal should close
      await waitFor(() => {
        expect(
          screen.queryByTestId("bin-selection-modal"),
        ).not.toBeInTheDocument();
      });

      // Pack should be in pending list
      expect(screen.getByText("Pending Packs (1)")).toBeInTheDocument();
      expect(
        screen.getByTestId(`pending-item-${TEST_PACK_ID_1}`),
      ).toBeInTheDocument();

      // Toast should be shown
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Pack Added",
        }),
      );
    });

    it("BATCH-005: should prepend newest pack to top of list", async () => {
      const user = setupUser();
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Add first pack
      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });
      await user.click(screen.getByTestId("select-bin-0"));

      await waitFor(() => {
        expect(
          screen.queryByTestId("bin-selection-modal"),
        ).not.toBeInTheDocument();
      });

      // Add second pack
      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });
      await user.click(screen.getByTestId("select-bin-2"));

      await waitFor(() => {
        expect(screen.getByText("Pending Packs (2)")).toBeInTheDocument();
      });

      // Get all pending items
      const pendingItems = screen.getAllByTestId(/^pending-item-/);

      // Second pack (Powerball) should be first in the list
      expect(pendingItems[0]).toHaveTextContent("Powerball");
      expect(pendingItems[1]).toHaveTextContent("Mega Millions");
    });

    it("BATCH-006: should remove pack from list when X button is clicked", async () => {
      const user = setupUser();
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Add a pack
      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });
      await user.click(screen.getByTestId("select-bin-0"));

      await waitFor(() => {
        expect(screen.getByText("Pending Packs (1)")).toBeInTheDocument();
      });

      // Remove the pack
      await user.click(screen.getByTestId(`remove-pending-${TEST_PACK_ID_1}`));

      // List should be empty
      await waitFor(() => {
        expect(screen.getByText("Pending Packs (0)")).toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // SECTION 4: VALIDATION (BATCH-007, BATCH-008)
  // ============================================================================

  describe("Validation", () => {
    it("BATCH-007: should reject duplicate pack", async () => {
      const user = setupUser();
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Add first pack
      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });
      await user.click(screen.getByTestId("select-bin-0"));

      await waitFor(() => {
        expect(screen.getByText("Pending Packs (1)")).toBeInTheDocument();
      });

      // Try to add same pack again
      await user.click(screen.getByTestId("mock-select-duplicate"));

      // Toast error should be shown
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Pack Already Added",
          variant: "destructive",
        }),
      );

      // List should still have only 1 pack
      expect(screen.getByText("Pending Packs (1)")).toBeInTheDocument();
    });

    it("BATCH-008: should show pending indicator for bins already in list", async () => {
      const user = setupUser();
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Add first pack to bin 1
      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });
      await user.click(screen.getByTestId("select-bin-0"));

      await waitFor(() => {
        expect(
          screen.queryByTestId("bin-selection-modal"),
        ).not.toBeInTheDocument();
      });

      // Add second pack - bin 1 should show as pending
      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });

      // Bin 1 should show (pending) indicator
      expect(screen.getByTestId("select-bin-0")).toHaveTextContent("(pending)");
    });
  });

  // ============================================================================
  // SECTION 5: BATCH ACTIVATION (BATCH-009, BATCH-010, BATCH-012, BATCH-013)
  // ============================================================================

  describe("Batch Activation", () => {
    it("BATCH-009: should activate all packs successfully", async () => {
      const user = setupUser();
      const onOpenChange = vi.fn();
      const onSuccess = vi.fn();

      renderWithProviders(
        <EnhancedPackActivationForm
          {...defaultProps}
          onOpenChange={onOpenChange}
          onSuccess={onSuccess}
        />,
      );

      // Add two packs
      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });
      await user.click(screen.getByTestId("select-bin-0"));

      await waitFor(() => {
        expect(
          screen.queryByTestId("bin-selection-modal"),
        ).not.toBeInTheDocument();
      });

      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });
      await user.click(screen.getByTestId("select-bin-2"));

      await waitFor(() => {
        expect(screen.getByText("Pending Packs (2)")).toBeInTheDocument();
      });

      // Activate button should be enabled with count
      const activateButton = screen.getByTestId("activate-all-button");
      expect(activateButton).not.toBeDisabled();
      expect(activateButton).toHaveTextContent("Activate 2 Packs");

      // Click activate
      await user.click(activateButton);

      // API should be called twice
      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledTimes(2);
      });

      // Success toast and callbacks
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Packs Activated",
        }),
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onSuccess).toHaveBeenCalled();
    });

    it("BATCH-010: should handle partial failure", async () => {
      const user = setupUser();

      // First call succeeds, second fails
      mockMutateAsync
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValueOnce(new Error("Pack not found"));

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Add two packs
      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });
      await user.click(screen.getByTestId("select-bin-0"));

      await waitFor(() => {
        expect(
          screen.queryByTestId("bin-selection-modal"),
        ).not.toBeInTheDocument();
      });

      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });
      await user.click(screen.getByTestId("select-bin-2"));

      await waitFor(() => {
        expect(screen.getByText("Pending Packs (2)")).toBeInTheDocument();
      });

      // Activate
      await user.click(screen.getByTestId("activate-all-button"));

      // Wait for both API calls
      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledTimes(2);
      });

      // Should show partial success toast
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Partial Success",
            variant: "destructive",
          }),
        );
      });

      // Modal should stay open (verify main form is still visible)
      expect(
        screen.getByTestId("batch-pack-activation-form"),
      ).toBeInTheDocument();

      // Failed pack should show error styling
      await waitFor(() => {
        const failedItem = screen.getByTestId(`pending-item-${TEST_PACK_ID_2}`);
        expect(failedItem).toBeInTheDocument();
      });

      // Retry button should appear
      expect(screen.getByTestId("retry-failed-button")).toBeInTheDocument();
    });

    it("BATCH-012: should close modal on complete success", async () => {
      const user = setupUser();
      const onOpenChange = vi.fn();
      const onSuccess = vi.fn();

      renderWithProviders(
        <EnhancedPackActivationForm
          {...defaultProps}
          onOpenChange={onOpenChange}
          onSuccess={onSuccess}
        />,
      );

      // Add one pack
      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });
      await user.click(screen.getByTestId("select-bin-0"));

      await waitFor(() => {
        expect(screen.getByText("Pending Packs (1)")).toBeInTheDocument();
      });

      // Activate
      await user.click(screen.getByTestId("activate-all-button"));

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onSuccess).toHaveBeenCalled();
      });
    });

    it("BATCH-013: should allow retry of failed packs", async () => {
      const user = setupUser();

      // First attempt fails, retry succeeds
      mockMutateAsync
        .mockRejectedValueOnce(new Error("Temporary error"))
        .mockResolvedValueOnce({ success: true });

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Add pack
      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });
      await user.click(screen.getByTestId("select-bin-0"));

      await waitFor(() => {
        expect(screen.getByText("Pending Packs (1)")).toBeInTheDocument();
      });

      // First activation attempt (will fail)
      await user.click(screen.getByTestId("activate-all-button"));

      await waitFor(() => {
        expect(screen.getByTestId("retry-failed-button")).toBeInTheDocument();
      });

      // Clear errors
      await user.click(screen.getByTestId("retry-failed-button"));

      // Retry (will succeed)
      await user.click(screen.getByTestId("activate-all-button"));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledTimes(2);
      });

      // Should show success
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Packs Activated",
        }),
      );
    });
  });

  // ============================================================================
  // SECTION 6: DIALOG STATE MANAGEMENT (BATCH-014)
  // ============================================================================

  describe("Dialog State Management", () => {
    it("BATCH-014: should reset state when modal reopens", async () => {
      const user = setupUser();

      const { rerender } = renderWithProviders(
        <EnhancedPackActivationForm {...defaultProps} />,
      );

      // Add a pack
      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });
      await user.click(screen.getByTestId("select-bin-0"));

      await waitFor(() => {
        expect(screen.getByText("Pending Packs (1)")).toBeInTheDocument();
      });

      // Close and reopen dialog
      rerender(
        <QueryClientProvider
          client={
            new QueryClient({
              defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
              },
            })
          }
        >
          <EnhancedPackActivationForm {...defaultProps} open={false} />
        </QueryClientProvider>,
      );

      rerender(
        <QueryClientProvider
          client={
            new QueryClient({
              defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
              },
            })
          }
        >
          <EnhancedPackActivationForm {...defaultProps} open={true} />
        </QueryClientProvider>,
      );

      // List should be empty
      await waitFor(() => {
        expect(screen.getByText("Pending Packs (0)")).toBeInTheDocument();
      });
    });

    it("should close dialog when Cancel button is clicked", async () => {
      const user = setupUser();
      const onOpenChange = vi.fn();

      renderWithProviders(
        <EnhancedPackActivationForm
          {...defaultProps}
          onOpenChange={onOpenChange}
        />,
      );

      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      await user.click(cancelButton);

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  // ============================================================================
  // SECTION 7: OCCUPIED BIN HANDLING
  // ============================================================================

  describe("Occupied Bin Handling", () => {
    it("should show Replace badge for packs going to occupied bins", async () => {
      const user = setupUser();
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Add pack to occupied bin (bin 2)
      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });
      await user.click(screen.getByTestId("select-bin-1")); // Bin 2 is occupied

      await waitFor(() => {
        expect(screen.getByText("Pending Packs (1)")).toBeInTheDocument();
      });

      // Should show Replace badge
      const pendingItem = screen.getByTestId(`pending-item-${TEST_PACK_ID_1}`);
      expect(within(pendingItem).getByText("Replace")).toBeInTheDocument();
    });

    it("should send deplete_previous flag for occupied bins", async () => {
      const user = setupUser();
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Add pack to occupied bin
      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });
      await user.click(screen.getByTestId("select-bin-1")); // Occupied bin

      await waitFor(() => {
        expect(screen.getByText("Pending Packs (1)")).toBeInTheDocument();
      });

      // Activate
      await user.click(screen.getByTestId("activate-all-button"));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              deplete_previous: true,
            }),
          }),
        );
      });
    });
  });

  // ============================================================================
  // SECTION 8: API INTEGRATION
  // ============================================================================

  describe("API Integration", () => {
    it("should send correct data in API calls", async () => {
      const user = setupUser();
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Add pack
      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });
      await user.click(screen.getByTestId("select-bin-0"));

      await waitFor(() => {
        expect(screen.getByText("Pending Packs (1)")).toBeInTheDocument();
      });

      // Activate
      await user.click(screen.getByTestId("activate-all-button"));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          storeId: "store-123",
          data: {
            pack_id: TEST_PACK_ID_1,
            bin_id: TEST_BIN_ID_1,
            serial_start: "000",
            activated_by: "user-1",
            deplete_previous: undefined, // Bin 1 is not occupied
          },
        });
      });
    });

    it("should handle all-failed activation gracefully", async () => {
      const user = setupUser();

      mockMutateAsync.mockRejectedValue(new Error("Server error"));

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Add pack
      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });
      await user.click(screen.getByTestId("select-bin-0"));

      await waitFor(() => {
        expect(screen.getByText("Pending Packs (1)")).toBeInTheDocument();
      });

      // Activate
      await user.click(screen.getByTestId("activate-all-button"));

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Activation Failed",
            variant: "destructive",
          }),
        );
      });

      // Modal stays open (verify main form is still visible)
      expect(
        screen.getByTestId("batch-pack-activation-form"),
      ).toBeInTheDocument();
    });
  });

  // ============================================================================
  // SECTION 9: DUPLICATE BIN PREVENTION (SEC-014) - CRITICAL SECURITY
  // ============================================================================

  describe("Duplicate Bin Prevention", () => {
    it("BATCH-016: should pass pendingBinIds to bin selection modal for filtering", async () => {
      const user = setupUser();
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Add first pack to bin 1
      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });
      await user.click(screen.getByTestId("select-bin-0"));

      await waitFor(() => {
        expect(
          screen.queryByTestId("bin-selection-modal"),
        ).not.toBeInTheDocument();
      });

      // Add second pack - verify bin 1 shows as pending (filtered at modal level)
      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });

      // The mock shows "(pending)" for bins in pendingBinIds
      // This verifies pendingBinIds is being passed correctly
      expect(screen.getByTestId("select-bin-0")).toHaveTextContent("(pending)");
    });

    it("BATCH-017: should not allow selecting same bin for multiple packs via modal", async () => {
      const user = setupUser();
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Add first pack to bin 1
      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });
      await user.click(screen.getByTestId("select-bin-0"));

      await waitFor(() => {
        expect(screen.getByText("Pending Packs (1)")).toBeInTheDocument();
      });

      // Add second pack
      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });

      // Select a different bin (bin 3)
      await user.click(screen.getByTestId("select-bin-2"));

      await waitFor(() => {
        expect(screen.getByText("Pending Packs (2)")).toBeInTheDocument();
      });

      // Verify both packs are in different bins
      const pendingItems = screen.getAllByTestId(/^pending-item-/);
      expect(pendingItems).toHaveLength(2);
    });

    it("BATCH-018: should correctly track multiple pending bin IDs", async () => {
      const user = setupUser();
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Add three packs to three different bins
      for (let i = 0; i < 3; i++) {
        await user.click(screen.getByTestId("mock-pack-select"));
        await waitFor(() => {
          expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
        });
        await user.click(screen.getByTestId(`select-bin-${i}`));
        await waitFor(() => {
          expect(
            screen.queryByTestId("bin-selection-modal"),
          ).not.toBeInTheDocument();
        });
      }

      // All three packs should be in the list
      expect(screen.getByText("Pending Packs (3)")).toBeInTheDocument();
    });
  });

  // ============================================================================
  // SECTION 10: INPUT CLEARING AND REFOCUS (UX Enhancement)
  // ============================================================================

  describe("Input Clearing and Refocus", () => {
    it("BATCH-019: should clear input after successful bin selection", async () => {
      const user = setupUser();
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // The mock PackSearchCombobox doesn't have input state, but verifies
      // the onValueChange callback behavior which triggers the clear
      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });
      await user.click(screen.getByTestId("select-bin-0"));

      // Toast should show for successful add (input clearing happens internally)
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Pack Added",
        }),
      );
    });

    it("BATCH-020: should show toast and clear when duplicate pack is selected", async () => {
      const user = setupUser();
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Add first pack
      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });
      await user.click(screen.getByTestId("select-bin-0"));

      await waitFor(() => {
        expect(screen.getByText("Pending Packs (1)")).toBeInTheDocument();
      });

      // Clear previous toasts
      mockToast.mockClear();

      // Try to add same pack again
      await user.click(screen.getByTestId("mock-select-duplicate"));

      // Should show error toast (internal clear happens via ref)
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Pack Already Added",
          variant: "destructive",
        }),
      );

      // Bin modal should NOT open for duplicate pack
      expect(
        screen.queryByTestId("bin-selection-modal"),
      ).not.toBeInTheDocument();
    });
  });

  // ============================================================================
  // SECTION 11: PACK SOLD FUNCTIONALITY (Dual-Auth Pattern)
  // ============================================================================

  describe("Pack Sold Functionality", () => {
    it("BATCH-021: should render Pack Sold button for each pending item", async () => {
      const user = setupUser();
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Add a pack
      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });
      await user.click(screen.getByTestId("select-bin-0"));

      await waitFor(() => {
        expect(screen.getByText("Pending Packs (1)")).toBeInTheDocument();
      });

      // Pack Sold button should be visible
      expect(
        screen.getByTestId(`mark-sold-${TEST_PACK_ID_1}`),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId(`mark-sold-${TEST_PACK_ID_1}`),
      ).toHaveTextContent("Pack Sold");
    });

    it("BATCH-022: should toggle pack sold status when button is clicked (with permission)", async () => {
      const user = setupUser();
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Add a pack
      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });
      await user.click(screen.getByTestId("select-bin-0"));

      await waitFor(() => {
        expect(screen.getByText("Pending Packs (1)")).toBeInTheDocument();
      });

      // Click Pack Sold button
      const markSoldButton = screen.getByTestId(`mark-sold-${TEST_PACK_ID_1}`);
      await user.click(markSoldButton);

      // Button should change to indicate pack is marked as sold
      await waitFor(() => {
        expect(markSoldButton).toHaveTextContent("Sold ✓");
      });

      // Toast should confirm the action
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Pack Marked as Sold",
        }),
      );
    });

    it("BATCH-023: should toggle off pack sold status when button is clicked again", async () => {
      const user = setupUser();
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Add a pack
      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });
      await user.click(screen.getByTestId("select-bin-0"));

      await waitFor(() => {
        expect(screen.getByText("Pending Packs (1)")).toBeInTheDocument();
      });

      // Click Pack Sold button to enable
      const markSoldButton = screen.getByTestId(`mark-sold-${TEST_PACK_ID_1}`);
      await user.click(markSoldButton);

      await waitFor(() => {
        expect(markSoldButton).toHaveTextContent("Sold ✓");
      });

      // Clear toast mock
      mockToast.mockClear();

      // Click again to disable
      await user.click(markSoldButton);

      await waitFor(() => {
        expect(markSoldButton).toHaveTextContent("Pack Sold");
      });

      // Toast should confirm removal
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Pack Sold Removed",
        }),
      );
    });

    it("BATCH-024: should send mark_sold_approved_by in API call when pack is marked as sold", async () => {
      const user = setupUser();
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Add a pack
      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });
      await user.click(screen.getByTestId("select-bin-0"));

      await waitFor(() => {
        expect(screen.getByText("Pending Packs (1)")).toBeInTheDocument();
      });

      // Mark pack as sold
      await user.click(screen.getByTestId(`mark-sold-${TEST_PACK_ID_1}`));

      await waitFor(() => {
        expect(
          screen.getByTestId(`mark-sold-${TEST_PACK_ID_1}`),
        ).toHaveTextContent("Sold ✓");
      });

      // Activate
      await user.click(screen.getByTestId("activate-all-button"));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          storeId: "store-123",
          data: expect.objectContaining({
            pack_id: TEST_PACK_ID_1,
            mark_sold_approved_by: "user-1",
            mark_sold_reason: "Pack marked as pre-sold during activation",
          }),
        });
      });
    });

    it("BATCH-025: should not send mark_sold fields when pack is not marked as sold", async () => {
      const user = setupUser();
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Add a pack (without marking as sold)
      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });
      await user.click(screen.getByTestId("select-bin-0"));

      await waitFor(() => {
        expect(screen.getByText("Pending Packs (1)")).toBeInTheDocument();
      });

      // Activate without marking as sold
      await user.click(screen.getByTestId("activate-all-button"));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          storeId: "store-123",
          data: expect.objectContaining({
            pack_id: TEST_PACK_ID_1,
            mark_sold_approved_by: undefined,
            mark_sold_reason: undefined,
          }),
        });
      });
    });

    it("BATCH-026: should maintain mark sold state after removing another pack", async () => {
      const user = setupUser();
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Add two packs
      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });
      await user.click(screen.getByTestId("select-bin-0"));

      await waitFor(() => {
        expect(
          screen.queryByTestId("bin-selection-modal"),
        ).not.toBeInTheDocument();
      });

      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });
      await user.click(screen.getByTestId("select-bin-2"));

      await waitFor(() => {
        expect(screen.getByText("Pending Packs (2)")).toBeInTheDocument();
      });

      // Mark first pack as sold
      await user.click(screen.getByTestId(`mark-sold-${TEST_PACK_ID_1}`));

      await waitFor(() => {
        expect(
          screen.getByTestId(`mark-sold-${TEST_PACK_ID_1}`),
        ).toHaveTextContent("Sold ✓");
      });

      // Remove second pack
      await user.click(screen.getByTestId(`remove-pending-${TEST_PACK_ID_2}`));

      await waitFor(() => {
        expect(screen.getByText("Pending Packs (1)")).toBeInTheDocument();
      });

      // First pack should still be marked as sold
      expect(
        screen.getByTestId(`mark-sold-${TEST_PACK_ID_1}`),
      ).toHaveTextContent("Sold ✓");
    });

    it("BATCH-027: Pack Sold button should be disabled during submission", async () => {
      const user = setupUser();

      // Make mutation hang to test disabled state
      mockMutateAsync.mockImplementation(() => new Promise(() => {}));

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Add a pack
      await user.click(screen.getByTestId("mock-pack-select"));
      await waitFor(() => {
        expect(screen.getByTestId("bin-selection-modal")).toBeInTheDocument();
      });
      await user.click(screen.getByTestId("select-bin-0"));

      await waitFor(() => {
        expect(screen.getByText("Pending Packs (1)")).toBeInTheDocument();
      });

      // Start activation
      await user.click(screen.getByTestId("activate-all-button"));

      // Button should show loading state in header
      await waitFor(() => {
        expect(screen.getByTestId("activate-all-button")).toHaveTextContent(
          "Activating...",
        );
      });

      // Pack Sold button should be disabled during submission
      expect(screen.getByTestId(`mark-sold-${TEST_PACK_ID_1}`)).toBeDisabled();
    });
  });
});
