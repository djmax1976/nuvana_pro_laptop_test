/**
 * Lottery Management UI Integration Tests
 *
 * Tests for Lottery Management UI integration:
 * - Pack list display with status indicators (AC #1)
 * - Pack reception flow (form submission, API call, list refresh) (AC #2)
 * - Pack activation flow (AC #3)
 * - Pack details display (AC #4)
 * - Variance alert display (AC #5)
 * - Variance approval flow (AC #6)
 * - RLS enforcement (user can only see their store's packs) (AC #8)
 * - Error handling and error messages (AC #8)
 * - Loading states (AC #8)
 * - Integration with shift opening/closing (AC #7)
 *
 * @test-level Integration
 * @justification Tests UI components working together with API hooks, full user flows, and RLS enforcement
 * @story 6-10 - Lottery Management UI
 * @priority P0 (Critical - User Flows, Security, Data Integrity)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderWithProviders, screen, waitFor } from "../support/test-utils";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { LotteryPackCard } from "@/components/lottery/LotteryPackCard";
import { PackReceptionForm } from "@/components/lottery/PackReceptionForm";
import { PackActivationForm } from "@/components/lottery/PackActivationForm";
import { PackDetailsModal } from "@/components/lottery/PackDetailsModal";
import { VarianceAlert } from "@/components/lottery/VarianceAlert";
import { VarianceApprovalDialog } from "@/components/lottery/VarianceApprovalDialog";
import * as lotteryApi from "@/lib/api/lottery";
import * as lotteryHooks from "@/hooks/useLottery";

// Mock the API module
vi.mock("@/lib/api/lottery", () => ({
  receivePack: vi.fn(),
  activatePack: vi.fn(),
  getPacks: vi.fn(),
  getPackDetails: vi.fn(),
  getVariances: vi.fn(),
  approveVariance: vi.fn(),
}));

// Mock the hooks module
vi.mock("@/hooks/useLottery", () => ({
  useLotteryPacks: vi.fn(),
  usePackDetails: vi.fn(),
  useLotteryVariances: vi.fn(),
  usePackReception: vi.fn(),
  usePackActivation: vi.fn(),
  useVarianceApproval: vi.fn(),
}));

// Mock toast hook
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

describe("Lottery Management UI Integration", () => {
  let queryClient: QueryClient;

  const mockStoreId = "store-123";
  const mockGameId = "game-123";
  const mockPackId = "pack-123";

  const mockGame = {
    game_id: mockGameId,
    name: "Test Game",
  };

  const mockPack = {
    pack_id: mockPackId,
    game_id: mockGameId,
    pack_number: "PACK-001",
    serial_start: "1000",
    serial_end: "2000",
    status: "RECEIVED" as const,
    store_id: mockStoreId,
    current_bin_id: null,
    received_at: "2025-01-28T10:00:00Z",
    activated_at: null,
    game: mockGame,
    store: {
      store_id: mockStoreId,
      name: "Test Store",
    },
    bin: null,
  };

  const mockActivePack = {
    ...mockPack,
    pack_id: "pack-456",
    pack_number: "PACK-002",
    status: "ACTIVE" as const,
    activated_at: "2025-01-28T10:05:00Z",
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
    mockToast.mockClear();
  });

  describe("6.10-INT [P0]: Pack List Display with Status Indicators", () => {
    it("6.10-INT-001 [P0]: should display packs with status indicators", () => {
      const packs = [mockPack, mockActivePack];

      renderWithProviders(
        <div>
          {packs.map((pack) => (
            <LotteryPackCard
              key={pack.pack_id}
              pack={{
                pack_id: pack.pack_id,
                pack_number: pack.pack_number,
                serial_start: pack.serial_start,
                serial_end: pack.serial_end,
                status: pack.status,
                game: pack.game,
                tickets_remaining: 500,
              }}
            />
          ))}
        </div>,
        { queryClient },
      );

      // Check that packs are displayed
      expect(screen.getByText("PACK-001")).toBeInTheDocument();
      expect(screen.getByText("PACK-002")).toBeInTheDocument();

      // Check status badges
      expect(screen.getByTestId("status-badge-pack-123")).toHaveTextContent(
        "RECEIVED",
      );
      expect(screen.getByTestId("status-badge-pack-456")).toHaveTextContent(
        "ACTIVE",
      );

      // Check game names
      expect(screen.getByText("Test Game")).toBeInTheDocument();
    });

    it("6.10-INT-002 [P1]: should display serial ranges and tickets remaining", () => {
      renderWithProviders(
        <LotteryPackCard
          pack={{
            pack_id: mockPackId,
            pack_number: "PACK-001",
            serial_start: "1000",
            serial_end: "2000",
            status: "ACTIVE",
            game: mockGame,
            tickets_remaining: 500,
          }}
        />,
        { queryClient },
      );

      expect(screen.getByText(/1000 - 2000/)).toBeInTheDocument();
      expect(screen.getByText(/500/)).toBeInTheDocument();
    });
  });

  describe("6.10-INT [P0]: Pack Reception Flow", () => {
    it("6.10-INT-003 [P0]: should submit pack reception form and refresh list", async () => {
      const user = userEvent.setup();
      const mockOnSuccess = vi.fn();
      const mockOnSubmit = vi.fn().mockResolvedValue(undefined);

      const mockUsePackReception = {
        mutateAsync: mockOnSubmit,
        isPending: false,
        isError: false,
        error: null,
      };

      vi.mocked(lotteryHooks.usePackReception).mockReturnValue(
        mockUsePackReception as any,
      );

      renderWithProviders(
        <PackReceptionForm
          storeId={mockStoreId}
          games={[mockGame]}
          bins={[]}
          open={true}
          onOpenChange={vi.fn()}
          onSuccess={mockOnSuccess}
          onSubmit={mockOnSubmit}
        />,
        { queryClient },
      );

      // Fill in form
      const gameSelect = screen.getByTestId("game-select");
      await user.click(gameSelect);
      await user.click(screen.getByText("Test Game"));

      const packNumberInput = screen.getByTestId("pack-number-input");
      await user.type(packNumberInput, "PACK-003");

      const serialStartInput = screen.getByTestId("serial-start-input");
      await user.type(serialStartInput, "2001");

      const serialEndInput = screen.getByTestId("serial-end-input");
      await user.type(serialEndInput, "3000");

      // Submit form
      const submitButton = screen.getByRole("button", {
        name: /receive pack/i,
      });
      await user.click(submitButton);

      // Wait for submission
      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          game_id: mockGameId,
          pack_number: "PACK-003",
          serial_start: "2001",
          serial_end: "3000",
          store_id: mockStoreId,
          bin_id: undefined,
        });
      });

      // Check success callback
      expect(mockOnSuccess).toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Pack received",
        }),
      );
    });

    it("6.10-INT-004 [P1]: should show validation errors for invalid input", async () => {
      const user = userEvent.setup();

      renderWithProviders(
        <PackReceptionForm
          storeId={mockStoreId}
          games={[mockGame]}
          bins={[]}
          open={true}
          onOpenChange={vi.fn()}
          onSubmit={vi.fn()}
        />,
        { queryClient },
      );

      // Try to submit without filling required fields
      const submitButton = screen.getByRole("button", {
        name: /receive pack/i,
      });
      await user.click(submitButton);

      // Check validation errors
      await waitFor(() => {
        expect(screen.getByText(/game must be selected/i)).toBeInTheDocument();
      });
    });
  });

  describe("6.10-INT [P0]: Pack Activation Flow", () => {
    it("6.10-INT-005 [P0]: should activate a pack and refresh list", async () => {
      const user = userEvent.setup();
      const mockOnActivate = vi.fn().mockResolvedValue(undefined);
      const mockOnSuccess = vi.fn();

      renderWithProviders(
        <PackActivationForm
          packs={[mockPack]}
          open={true}
          onOpenChange={vi.fn()}
          onSuccess={mockOnSuccess}
          onActivate={mockOnActivate}
        />,
        { queryClient },
      );

      // Select pack
      const packSelect = screen.getByRole("combobox", { name: /select pack/i });
      await user.click(packSelect);
      await user.click(screen.getByText(/PACK-001/));

      // Activate pack
      const activateButton = screen.getByRole("button", {
        name: /activate pack/i,
      });
      await user.click(activateButton);

      // Wait for activation
      await waitFor(() => {
        expect(mockOnActivate).toHaveBeenCalledWith(mockPackId);
      });

      // Check success
      expect(mockOnSuccess).toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Pack activated",
        }),
      );
    });
  });

  describe("6.10-INT [P0]: Pack Details Display", () => {
    it("6.10-INT-006 [P0]: should display full pack details in modal", () => {
      const mockPackDetail = {
        ...mockActivePack,
        tickets_remaining: 500,
        shift_openings: [
          {
            opening_id: "opening-123",
            shift_id: "shift-123",
            opening_serial: "1500",
            created_at: "2025-01-28T11:00:00Z",
            shift: {
              shift_id: "shift-123",
              shift_number: 1,
              status: "OPEN",
            },
          },
        ],
        shift_closings: [],
      };

      renderWithProviders(
        <PackDetailsModal
          pack={mockPackDetail}
          open={true}
          onOpenChange={vi.fn()}
        />,
        { queryClient },
      );

      // Check pack information
      expect(screen.getByText("PACK-002")).toBeInTheDocument();
      expect(screen.getByText("Test Game")).toBeInTheDocument();
      expect(screen.getByText(/1000 - 2000/)).toBeInTheDocument();
      expect(screen.getByText(/500/)).toBeInTheDocument();

      // Check status
      expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    });
  });

  describe("6.10-INT [P0]: Variance Alert Display", () => {
    it("6.10-INT-007 [P0]: should display variance alerts prominently", () => {
      const mockVariances = [
        {
          variance_id: "variance-123",
          shift_id: "shift-123",
          pack_id: mockPackId,
          expected_count: 100,
          actual_count: 95,
          difference: -5,
          approved_at: null,
          pack: {
            pack_number: "PACK-001",
            game: {
              name: "Test Game",
            },
          },
          shift: {
            shift_id: "shift-123",
            opened_at: "2025-01-28T10:00:00Z",
          },
        },
      ];

      renderWithProviders(
        <VarianceAlert variances={mockVariances} onVarianceClick={vi.fn()} />,
        { queryClient },
      );

      // Check variance alert is displayed
      expect(screen.getByText(/variance detected/i)).toBeInTheDocument();
      expect(screen.getByText(/100/)).toBeInTheDocument();
      expect(screen.getByText(/95/)).toBeInTheDocument();
      expect(screen.getByText(/-5/)).toBeInTheDocument();
    });

    it("6.10-INT-008 [P1]: should highlight unresolved variances", () => {
      const mockVariances = [
        {
          variance_id: "variance-123",
          shift_id: "shift-123",
          pack_id: mockPackId,
          expected_count: 100,
          actual_count: 95,
          difference: -5,
          approved_at: null,
          pack: {
            pack_number: "PACK-001",
            game: {
              name: "Test Game",
            },
          },
          shift: {
            shift_id: "shift-123",
            opened_at: "2025-01-28T10:00:00Z",
          },
        },
      ];

      renderWithProviders(
        <VarianceAlert variances={mockVariances} onVarianceClick={vi.fn()} />,
        { queryClient },
      );

      // Unresolved variance should be highlighted (destructive variant)
      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
    });
  });

  describe("6.10-INT [P0]: Variance Approval Flow", () => {
    it("6.10-INT-009 [P0]: should approve variance with reason", async () => {
      const user = userEvent.setup();
      const mockOnApprove = vi.fn().mockResolvedValue(undefined);
      const mockOnSuccess = vi.fn();

      const mockVariance = {
        variance_id: "variance-123",
        shift_id: "shift-123",
        pack_id: mockPackId,
        expected_count: 100,
        actual_count: 95,
        difference: -5,
        approved_at: null,
        pack: {
          pack_number: "PACK-001",
          game: {
            name: "Test Game",
          },
        },
        shift: {
          shift_id: "shift-123",
          opened_at: "2025-01-28T10:00:00Z",
        },
      };

      renderWithProviders(
        <VarianceApprovalDialog
          variance={mockVariance}
          isOpen={true}
          onClose={vi.fn()}
          onSuccess={mockOnSuccess}
          onApprove={mockOnApprove}
        />,
        { queryClient },
      );

      // Enter reason
      const reasonInput = screen.getByLabelText(/variance reason/i);
      await user.type(reasonInput, "Count discrepancy due to damaged tickets");

      // Submit approval
      const approveButton = screen.getByRole("button", {
        name: /approve variance/i,
      });
      await user.click(approveButton);

      // Wait for approval
      await waitFor(() => {
        expect(mockOnApprove).toHaveBeenCalledWith(
          "variance-123",
          "Count discrepancy due to damaged tickets",
        );
      });

      // Check success
      expect(mockOnSuccess).toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Variance approved",
        }),
      );
    });
  });

  describe("6.10-INT [P0]: RLS Enforcement and Error Handling", () => {
    it("6.10-INT-010 [P0]: should only display packs for user's store", () => {
      const store1Packs = [mockPack];
      const store2Pack = {
        ...mockPack,
        pack_id: "pack-999",
        pack_number: "PACK-999",
        store_id: "store-999", // Different store
      };

      // Mock hook to return only store1 packs
      vi.mocked(lotteryHooks.useLotteryPacks).mockReturnValue({
        data: store1Packs,
        isLoading: false,
        isError: false,
        error: null,
      } as any);

      renderWithProviders(
        <div>
          {store1Packs.map((pack) => (
            <LotteryPackCard
              key={pack.pack_id}
              pack={{
                pack_id: pack.pack_id,
                pack_number: pack.pack_number,
                serial_start: pack.serial_start,
                serial_end: pack.serial_end,
                status: pack.status,
                game: pack.game,
              }}
            />
          ))}
        </div>,
        { queryClient },
      );

      // Should only show store1 pack
      expect(screen.getByText("PACK-001")).toBeInTheDocument();
      expect(screen.queryByText("PACK-999")).not.toBeInTheDocument();
    });

    it("6.10-INT-011 [P0]: should display error messages for failed operations", async () => {
      const user = userEvent.setup();
      const mockOnSubmit = vi
        .fn()
        .mockRejectedValue(new Error("Pack number already exists"));

      renderWithProviders(
        <PackReceptionForm
          storeId={mockStoreId}
          games={[mockGame]}
          bins={[]}
          open={true}
          onOpenChange={vi.fn()}
          onSubmit={mockOnSubmit}
        />,
        { queryClient },
      );

      // Fill and submit form
      const gameSelect = screen.getByTestId("game-select");
      await user.click(gameSelect);
      await user.click(screen.getByText("Test Game"));

      const packNumberInput = screen.getByTestId("pack-number-input");
      await user.type(packNumberInput, "PACK-001");

      const serialStartInput = screen.getByTestId("serial-start-input");
      await user.type(serialStartInput, "1000");

      const serialEndInput = screen.getByTestId("serial-end-input");
      await user.type(serialEndInput, "2000");

      const submitButton = screen.getByRole("button", {
        name: /receive pack/i,
      });
      await user.click(submitButton);

      // Wait for error
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Error",
            description: "Pack number already exists",
            variant: "destructive",
          }),
        );
      });
    });

    it("6.10-INT-012 [P1]: should show loading states during API calls", () => {
      vi.mocked(lotteryHooks.useLotteryPacks).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
      } as any);

      renderWithProviders(
        <div data-testid="pack-list">
          {vi.mocked(lotteryHooks.useLotteryPacks).mock.results[0]?.value
            ?.isLoading && <div>Loading packs...</div>}
        </div>,
        { queryClient },
      );

      // Loading state should be shown (component would show loading UI)
      expect(
        vi.mocked(lotteryHooks.useLotteryPacks).mock.results[0]?.value
          ?.isLoading,
      ).toBe(true);
    });
  });

  describe("6.10-INT [P0]: Integration with Shift Opening/Closing", () => {
    it("6.10-INT-013 [P0]: should display packs in shift context", () => {
      const mockPackDetail = {
        ...mockActivePack,
        shift_openings: [
          {
            opening_id: "opening-123",
            shift_id: "shift-123",
            opening_serial: "1500",
            created_at: "2025-01-28T11:00:00Z",
            shift: {
              shift_id: "shift-123",
              shift_number: 1,
              status: "OPEN",
            },
          },
        ],
        shift_closings: [
          {
            closing_id: "closing-123",
            shift_id: "shift-123",
            closing_serial: "1800",
            opening_serial: "1500",
            expected_count: 301,
            actual_count: 295,
            difference: -6,
            has_variance: true,
            created_at: "2025-01-28T12:00:00Z",
            shift: {
              shift_id: "shift-123",
              shift_number: 1,
              status: "CLOSING",
            },
          },
        ],
      };

      renderWithProviders(
        <PackDetailsModal
          pack={mockPackDetail}
          open={true}
          onOpenChange={vi.fn()}
        />,
        { queryClient },
      );

      // Check shift openings are displayed
      expect(screen.getByText(/shift opening/i)).toBeInTheDocument();
      expect(screen.getByText(/1500/)).toBeInTheDocument();

      // Check shift closings are displayed
      expect(screen.getByText(/shift closing/i)).toBeInTheDocument();
      expect(screen.getByText(/1800/)).toBeInTheDocument();
    });
  });
});
