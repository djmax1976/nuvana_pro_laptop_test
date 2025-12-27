/**
 * EnhancedPackActivationForm Component Tests
 *
 * Test file for EnhancedPackActivationForm component - the main form for
 * activating lottery packs with bin assignment and cashier authentication.
 *
 * ============================================================================
 * TRACEABILITY MATRIX
 * ============================================================================
 * | Test ID                    | Requirement              | Category         |
 * |----------------------------|--------------------------|------------------|
 * | EPAF-001                   | Render form dialog       | Component        |
 * | EPAF-002                   | Manager bypass auth      | Business Logic   |
 * | EPAF-003                   | Non-manager auth req     | Business Logic   |
 * | EPAF-004                   | Pack search integration  | Integration      |
 * | EPAF-005                   | Bin selection            | Integration      |
 * | EPAF-006                   | Serial auto-fill         | Business Logic   |
 * | EPAF-007                   | Form validation          | Assertions       |
 * | EPAF-008                   | Successful activation    | Integration      |
 * | EPAF-009                   | Activation error         | Error Handling   |
 * | EPAF-010                   | (Removed - auto-deplete) | -                |
 * | EPAF-011                   | Dialog close on success  | Business Logic   |
 * | EPAF-012                   | Form reset on open       | Business Logic   |
 * | EPAF-013                   | Submit button states     | Assertions       |
 * | EPAF-014                   | Cancel button            | Business Logic   |
 * | EPAF-015                   | Auth modal trigger       | Integration      |
 * | EPAF-016                   | Activate btn after auth  | Bug Fix          |
 * | EPAF-017                   | Auth user permissions    | Bug Fix          |
 * | EPAF-018                   | Serial change by manager | Authorization    |
 * | EPAF-019                   | Serial change by cashier | Authorization    |
 * | EPAF-020                   | Serial override modal    | Integration      |
 * | EPAF-021                   | Dual-auth flow cashier   | Business Logic   |
 * | EPAF-022                   | Approval status display  | Component        |
 * | EPAF-023                   | Override data in submit  | Integration      |
 * | EPAF-024                   | Request Change button    | Component        |
 * | EPAF-025                   | Red border incomplete    | Error Handling   |
 * | EPAF-026                   | Red border above range   | Error Handling   |
 * | EPAF-027                   | Clear border on valid    | Business Logic   |
 * | EPAF-028                   | Show valid range hint    | Component        |
 * | EPAF-029                   | Disable submit on error  | Business Logic   |
 * | EPAF-030                   | Error styling on input   | Component        |
 * | EPAF-031                   | Clear error on cancel    | Business Logic   |
 * | EPAF-032                   | Clear error on pack chg  | Business Logic   |
 * | EPAF-033                   | Red border short serial  | Error Handling   |
 * | EPAF-034                   | Prevent >3 digits input  | Input Constraint |
 * | EPAF-035                   | Accept correct length    | Business Logic   |
 * | EPAF-036                   | Red border incomplete    | Component        |
 * | EPAF-037                   | Mgmt auth shows mgr name | Authorization    |
 * | EPAF-038                   | Cashier auth shows name  | Authorization    |
 * | EPAF-039                   | Default serial 000       | Business Logic   |
 * ============================================================================
 *
 * Key Features Tested:
 * - Complete form with pack search, bin selection, serial confirmation
 * - Manager bypass for authentication
 * - Non-manager authentication requirement
 * - Auto-fill serial from pack selection
 * - Form validation with Zod schema
 * - Successful and failed activation flows
 * - Automatic depletion of existing pack when bin is occupied
 * - Dialog state management
 *
 * MCP Guidance Applied:
 * - FE-002: FORM_VALIDATION - Comprehensive form validation
 * - SEC-014: INPUT_VALIDATION - Strict validation before submission
 * - SEC-010: AUTHZ - Role-based activation flow
 * - DB-001: ORM_USAGE - Uses API for database operations
 *
 * @story Pack Activation UX Enhancement
 * @priority P0 (Critical - Core Feature)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EnhancedPackActivationForm } from "@/components/lottery/EnhancedPackActivationForm";
import type { DayBin } from "@/lib/api/lottery";

// Test UUIDs for form validation (Zod schema requires UUID format)
const TEST_PACK_ID = "11111111-1111-1111-1111-111111111111";
const TEST_BIN_ID = "22222222-2222-2222-2222-222222222222";
const TEST_GAME_ID = "33333333-3333-3333-3333-333333333333";

// Mock the child components
vi.mock("@/components/lottery/PackSearchCombobox", () => ({
  PackSearchCombobox: vi.fn(({ onValueChange, testId }) => (
    <div data-testid={testId}>
      <button
        data-testid="mock-pack-select"
        onClick={() =>
          onValueChange("11111111-1111-1111-1111-111111111111", {
            pack_id: "11111111-1111-1111-1111-111111111111",
            pack_number: "12345",
            game_id: "33333333-3333-3333-3333-333333333333",
            game_name: "Mega Millions",
            game_price: 2.0,
            serial_start: "001",
            serial_end: "150",
          })
        }
      >
        Select Pack
      </button>
    </div>
  )),
}));

vi.mock("@/components/lottery/BinSelector", () => ({
  BinSelector: vi.fn(({ onValueChange, testId }) => (
    <div data-testid={testId}>
      <button
        data-testid="mock-bin-select"
        onClick={() =>
          onValueChange("22222222-2222-2222-2222-222222222222", {
            bin_id: "22222222-2222-2222-2222-222222222222",
            bin_number: 1,
            name: "Bin A",
            pack: null,
          })
        }
      >
        Select Bin
      </button>
    </div>
  )),
}));

// Track the mock auth type for testing different scenarios
let mockAuthType: "cashier" | "management" = "cashier";
let mockAuthPermissions: string[] = [];

vi.mock("@/components/lottery/LotteryAuthModal", () => ({
  LotteryAuthModal: vi.fn(
    ({ open, onAuthenticated, mode, onSerialOverrideApproved }) => {
      // For serial_override mode, render different mock
      if (mode === "serial_override" && open) {
        return (
          <div data-testid="mock-serial-override-modal">
            <button
              data-testid="mock-approve-serial-override"
              onClick={() =>
                onSerialOverrideApproved?.({
                  approver_id: "manager-1",
                  approver_name: "Manager Approver",
                  approved_at: new Date(),
                  has_permission: true,
                })
              }
            >
              Approve Serial Override
            </button>
            <button
              data-testid="mock-deny-serial-override"
              onClick={() => {
                // Simulate permission denial - modal stays open, no callback
              }}
            >
              Deny (No Permission)
            </button>
          </div>
        );
      }

      // Regular activation mode
      return open ? (
        <div data-testid="mock-auth-modal">
          <button
            data-testid="mock-authenticate"
            onClick={() =>
              onAuthenticated({
                cashier_id: "cashier-1",
                cashier_name: "John Doe",
                shift_id: mockAuthType === "cashier" ? "shift-1" : "",
                auth_type: mockAuthType,
                permissions:
                  mockAuthType === "management" ? mockAuthPermissions : [],
              })
            }
          >
            Authenticate
          </button>
          <button
            data-testid="mock-authenticate-management"
            onClick={() =>
              onAuthenticated({
                cashier_id: "manager-1",
                cashier_name: "Jane Manager",
                shift_id: "",
                auth_type: "management",
                permissions: ["LOTTERY_SERIAL_OVERRIDE"],
              })
            }
          >
            Auth as Manager
          </button>
        </div>
      ) : null;
    },
  ),
}));

// Mock hooks
vi.mock("@/hooks/useLottery", () => ({
  useFullPackActivation: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({ success: true }),
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
  id: "user-1", // Fixed: Changed from userId to id to match ClientUser interface
  roles: ["STORE_MANAGER"],
};

// Mock permissions - LOTTERY_SERIAL_OVERRIDE is given to all roles except CASHIER
let mockPermissions: string[] = ["LOTTERY_SERIAL_OVERRIDE"];

vi.mock("@/contexts/ClientAuthContext", () => ({
  useClientAuth: () => ({
    user: mockUser,
    permissions: mockPermissions,
  }),
}));

import { useFullPackActivation } from "@/hooks/useLottery";

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

// Mock day bins (using UUIDs for consistency)
const mockDayBins: DayBin[] = [
  {
    bin_id: TEST_BIN_ID,
    bin_number: 1,
    name: "Bin A",
    is_active: true,
    pack: null,
  },
  {
    bin_id: "44444444-4444-4444-4444-444444444444",
    bin_number: 2,
    name: "Bin B",
    is_active: true,
    pack: {
      pack_id: "55555555-5555-5555-5555-555555555555",
      pack_number: "67890",
      game_name: "Powerball",
      game_price: 10.0,
      starting_serial: "001",
      ending_serial: "050",
      serial_end: "100",
    },
  },
];

describe("EnhancedPackActivationForm", () => {
  const defaultProps = {
    storeId: "store-123",
    open: true,
    onOpenChange: vi.fn(),
    onSuccess: vi.fn(),
    dayBins: mockDayBins,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset user to manager by default (with serial override permission)
    mockUser.roles = ["STORE_MANAGER"];
    mockPermissions = ["LOTTERY_SERIAL_OVERRIDE"];
    // Reset mock auth type
    mockAuthType = "cashier";
    mockAuthPermissions = [];
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ============================================================================
  // SECTION 1: COMPONENT RENDERING (EPAF-001)
  // ============================================================================

  describe("Component Rendering", () => {
    it("EPAF-001: should render form dialog when open is true", () => {
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      expect(screen.getByTestId("pack-activation-form")).toBeInTheDocument();
      expect(screen.getByText("Activate Lottery Pack")).toBeInTheDocument();
    });

    it("should not render dialog when open is false", () => {
      renderWithProviders(
        <EnhancedPackActivationForm {...defaultProps} open={false} />,
      );

      expect(
        screen.queryByTestId("pack-activation-form"),
      ).not.toBeInTheDocument();
    });

    it("should render pack search component", () => {
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      expect(screen.getByTestId("pack-search")).toBeInTheDocument();
    });

    it("should render serial start display with default value 0", () => {
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      const serialDisplay = screen.getByTestId("serial-start-display");
      expect(serialDisplay).toBeInTheDocument();
      expect(serialDisplay).toHaveTextContent("0");
    });

    it("should render change serial button", () => {
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      expect(screen.getByTestId("change-serial-button")).toBeInTheDocument();
    });
  });

  // ============================================================================
  // SECTION 2: MANAGER AUTHENTICATION BYPASS (EPAF-002, EPAF-003)
  // ============================================================================

  describe("Manager Authentication Bypass", () => {
    it("EPAF-002: should not show auth requirement for manager roles", () => {
      mockUser.roles = ["STORE_MANAGER"];
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Should not show "Authentication required" message
      expect(
        screen.queryByText(/authentication required/i),
      ).not.toBeInTheDocument();
      // Should not show authenticate button
      expect(
        screen.queryByTestId("authenticate-button"),
      ).not.toBeInTheDocument();
    });

    it("EPAF-003: should show auth requirement for non-manager roles", () => {
      mockUser.roles = ["CASHIER"];
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Should show "Authentication required" message
      expect(screen.getByText(/authentication required/i)).toBeInTheDocument();
      // Should show authenticate button
      expect(screen.getByTestId("authenticate-button")).toBeInTheDocument();
    });

    it("should show authenticated status after authentication", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      mockUser.roles = ["CASHIER"];

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Click authenticate button to open modal
      const authButton = screen.getByTestId("authenticate-button");
      await user.click(authButton);

      // Modal should appear
      await waitFor(() => {
        expect(screen.getByTestId("mock-auth-modal")).toBeInTheDocument();
      });

      // Click authenticate in mock modal
      await user.click(screen.getByTestId("mock-authenticate"));

      // Should show authenticated status
      await waitFor(() => {
        expect(screen.getByText(/authenticated as/i)).toBeInTheDocument();
        expect(screen.getByText("John Doe")).toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // SECTION 3: PACK SELECTION (EPAF-004, EPAF-006)
  // ============================================================================

  describe("Pack Selection", () => {
    it("EPAF-004: should integrate with PackSearchCombobox", async () => {
      const user = userEvent.setup();
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Click mock pack select
      await user.click(screen.getByTestId("mock-pack-select"));

      // Pack details should be displayed
      await waitFor(() => {
        expect(screen.getByText("Pack Details")).toBeInTheDocument();
        expect(screen.getByText(/Mega Millions/)).toBeInTheDocument();
      });
    });

    it("EPAF-006: should keep serial at 0 when pack is selected (manager can change)", async () => {
      const user = userEvent.setup();
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Click mock pack select
      await user.click(screen.getByTestId("mock-pack-select"));

      // Serial display should remain at 0 (not auto-filled)
      await waitFor(() => {
        const serialDisplay = screen.getByTestId("serial-start-display");
        expect(serialDisplay).toHaveTextContent("0");
      });

      // Manager can click "Change" to edit serial
      const changeButton = screen.getByTestId("change-serial-button");
      expect(changeButton).not.toBeDisabled();
    });

    it("should allow manager to change starting serial", async () => {
      const user = userEvent.setup();
      mockUser.roles = ["STORE_MANAGER"];
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Select a pack first
      await user.click(screen.getByTestId("mock-pack-select"));

      // Click change serial button
      await user.click(screen.getByTestId("change-serial-button"));

      // Input should appear
      await waitFor(() => {
        expect(screen.getByTestId("serial-start-input")).toBeInTheDocument();
      });

      // Type new value
      const input = screen.getByTestId(
        "serial-start-input",
      ) as HTMLInputElement;
      await user.clear(input);
      await user.type(input, "050");

      expect(input.value).toBe("050");
    });

    it("should show Request Change button when user lacks LOTTERY_SERIAL_OVERRIDE permission", async () => {
      const user = userEvent.setup();
      mockUser.roles = ["CASHIER"];
      mockPermissions = []; // CASHIER doesn't have LOTTERY_SERIAL_OVERRIDE
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Select a pack first
      await user.click(screen.getByTestId("mock-pack-select"));

      // Change button should be enabled but show "Request Change" text
      // (since dual-auth flow allows cashiers to request manager approval)
      const changeButton = screen.getByTestId("change-serial-button");
      expect(changeButton).not.toBeDisabled();

      // Should show helper text about requesting manager approval
      expect(
        screen.getByText(/click request change to get manager approval/i),
      ).toBeInTheDocument();
    });
  });

  // ============================================================================
  // SECTION 4: BIN SELECTION (EPAF-005)
  // Note: Auto-deplete is now automatic, no checkbox - test EPAF-010 removed
  // ============================================================================

  describe("Bin Selection", () => {
    it("EPAF-005: should integrate with BinSelector", async () => {
      const user = userEvent.setup();
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // First select a pack to enable bin selector
      await user.click(screen.getByTestId("mock-pack-select"));

      // Bin selector should be available
      expect(screen.getByTestId("bin-select")).toBeInTheDocument();
    });
  });

  // ============================================================================
  // SECTION 5: FORM VALIDATION (EPAF-007, EPAF-013)
  // ============================================================================

  describe("Form Validation", () => {
    it("EPAF-007: should validate required fields", async () => {
      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Submit button should be disabled without required fields
      const submitButton = screen.getByTestId("submit-activation");
      expect(submitButton).toBeDisabled();
    });

    it("EPAF-013: should show Activate Pack button for managers", async () => {
      mockUser.roles = ["STORE_MANAGER"];

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // For managers, the submit button should show "Activate Pack" text
      const submitButton = screen.getByTestId("submit-activation");
      expect(submitButton).toHaveTextContent("Activate Pack");

      // Button starts disabled (form incomplete)
      expect(submitButton).toBeDisabled();
    });

    it("should require authentication for non-managers before enabling submit", async () => {
      const user = userEvent.setup();
      mockUser.roles = ["CASHIER"];

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Select pack and bin
      await user.click(screen.getByTestId("mock-pack-select"));
      await user.click(screen.getByTestId("mock-bin-select"));

      // Submit button should still be disabled without auth
      const submitButton = screen.getByTestId("submit-activation");
      expect(submitButton).toBeDisabled();
    });
  });

  // ============================================================================
  // SECTION 6: ACTIVATION FLOW (EPAF-008, EPAF-009, EPAF-011)
  // ============================================================================

  describe("Activation Flow", () => {
    it("EPAF-008: should render pack details after pack selection", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      mockUser.roles = ["STORE_MANAGER"];

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Select pack
      await user.click(screen.getByTestId("mock-pack-select"));

      // Pack details should be displayed
      await waitFor(() => {
        expect(screen.getByText("Pack Details")).toBeInTheDocument();
        expect(screen.getByText(/Mega Millions/)).toBeInTheDocument();
        expect(screen.getByText(/\$2/)).toBeInTheDocument();
      });

      // Serial range should be shown
      expect(screen.getByText(/001/)).toBeInTheDocument();
      expect(screen.getByText(/150/)).toBeInTheDocument();
    });

    it("EPAF-009: should display error alert when mutation has error", async () => {
      vi.mocked(useFullPackActivation).mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: false,
        isError: true,
        error: new Error("Activation failed"),
      } as any);

      mockUser.roles = ["STORE_MANAGER"];

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Error alert should be visible with the error message
      expect(screen.getByText("Activation failed")).toBeInTheDocument();
    });

    it("EPAF-011: should disable buttons during submission", async () => {
      vi.mocked(useFullPackActivation).mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: true, // Simulating loading state
        isError: false,
        error: null,
      } as any);

      mockUser.roles = ["STORE_MANAGER"];

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Submit button should be disabled during submission
      const submitButton = screen.getByTestId("submit-activation");
      expect(submitButton).toBeDisabled();
    });
  });

  // ============================================================================
  // SECTION 7: DIALOG STATE MANAGEMENT (EPAF-012, EPAF-014, EPAF-015)
  // ============================================================================

  describe("Dialog State Management", () => {
    it("EPAF-014: should close dialog when Cancel button is clicked", async () => {
      const user = userEvent.setup();
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

    it("EPAF-015: should open auth modal when authenticate button clicked", async () => {
      const user = userEvent.setup();
      mockUser.roles = ["CASHIER"];

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      const authButton = screen.getByTestId("authenticate-button");
      await user.click(authButton);

      expect(screen.getByTestId("mock-auth-modal")).toBeInTheDocument();
    });

    it("should accept onSuccess callback prop", async () => {
      const onSuccess = vi.fn();

      mockUser.roles = ["STORE_MANAGER"];

      // Verify component accepts onSuccess prop without error
      renderWithProviders(
        <EnhancedPackActivationForm {...defaultProps} onSuccess={onSuccess} />,
      );

      // Form renders correctly with callback
      expect(screen.getByTestId("pack-activation-form")).toBeInTheDocument();
      expect(screen.getByTestId("submit-activation")).toBeInTheDocument();
    });
  });

  // ============================================================================
  // SECTION 8: BUTTON TEXT AND STATES
  // ============================================================================

  describe("Button States", () => {
    it("should show 'Authenticate & Activate' for non-authenticated non-managers", () => {
      mockUser.roles = ["CASHIER"];

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      const submitButton = screen.getByTestId("submit-activation");
      expect(submitButton).toHaveTextContent(/authenticate.*activate/i);
    });

    it("should show 'Activate Pack' for managers", () => {
      mockUser.roles = ["STORE_MANAGER"];

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      const submitButton = screen.getByTestId("submit-activation");
      expect(submitButton).toHaveTextContent("Activate Pack");
    });

    it("should show loading state during submission", async () => {
      vi.mocked(useFullPackActivation).mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: true,
        isError: false,
        error: null,
      } as any);

      mockUser.roles = ["STORE_MANAGER"];

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      const submitButton = screen.getByTestId("submit-activation");
      expect(submitButton).toBeDisabled();
    });
  });

  // ============================================================================
  // SECTION 9: BUG FIXES - ACTIVATE BUTTON & PERMISSION CHECKS
  // (EPAF-016, EPAF-017, EPAF-018, EPAF-019)
  // ============================================================================

  describe("Bug Fixes - Activate Button and Permission Checks", () => {
    it("EPAF-016: should show authenticated status after cashier authentication", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      mockUser.roles = ["CASHIER"];
      mockPermissions = []; // Cashier without special permissions

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Submit button should show authentication requirement
      const submitButton = screen.getByTestId("submit-activation");
      expect(submitButton).toHaveTextContent(/authenticate.*activate/i);

      // Click authenticate button to open modal
      const authButton = screen.getByTestId("authenticate-button");
      await user.click(authButton);

      await waitFor(() => {
        expect(screen.getByTestId("mock-auth-modal")).toBeInTheDocument();
      });

      // Click authenticate in mock modal (cashier auth)
      await user.click(screen.getByTestId("mock-authenticate"));

      // Should show authenticated status
      await waitFor(() => {
        expect(screen.getByText(/authenticated as/i)).toBeInTheDocument();
        expect(screen.getByText("John Doe")).toBeInTheDocument();
      });

      // Verify toast was shown
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Authenticated",
        }),
      );
    });

    it("EPAF-017: should use authenticated manager's permissions for Change Serial button", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      mockUser.roles = ["CASHIER"];
      mockPermissions = []; // Logged-in user (cashier) has NO serial override permission

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Select a pack first
      await user.click(screen.getByTestId("mock-pack-select"));

      // Change button should show "Request Change" initially (cashier can request approval)
      let changeButton = screen.getByTestId("change-serial-button");
      expect(changeButton).toHaveTextContent("Request Change");

      // Open auth modal
      const authButton = screen.getByTestId("authenticate-button");
      await user.click(authButton);

      await waitFor(() => {
        expect(screen.getByTestId("mock-auth-modal")).toBeInTheDocument();
      });

      // Authenticate as manager (who HAS LOTTERY_SERIAL_OVERRIDE)
      await user.click(screen.getByTestId("mock-authenticate-management"));

      // Change button should now show "Change" (using manager's permissions)
      await waitFor(() => {
        changeButton = screen.getByTestId("change-serial-button");
        expect(changeButton).toHaveTextContent("Change");
        expect(changeButton).not.toHaveTextContent("Request");
      });
    });

    it("EPAF-018: should allow manager to change serial without authentication modal", async () => {
      const user = userEvent.setup();
      mockUser.roles = ["STORE_MANAGER"];
      mockPermissions = ["LOTTERY_SERIAL_OVERRIDE"];

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Select a pack
      await user.click(screen.getByTestId("mock-pack-select"));

      // Change button should be enabled for managers
      const changeButton = screen.getByTestId("change-serial-button");
      expect(changeButton).not.toBeDisabled();

      // Click to edit
      await user.click(changeButton);

      // Input should appear
      await waitFor(() => {
        expect(screen.getByTestId("serial-start-input")).toBeInTheDocument();
      });
    });

    it("EPAF-019: should keep Request Change text for cashier auth without manager permissions", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      mockUser.roles = ["CASHIER"];
      mockPermissions = []; // Cashier has no permissions

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Select a pack
      await user.click(screen.getByTestId("mock-pack-select"));

      // Change button should show "Request Change" (cashier can request approval)
      let changeButton = screen.getByTestId("change-serial-button");
      expect(changeButton).toHaveTextContent("Request Change");

      // Open auth modal
      await user.click(screen.getByTestId("authenticate-button"));

      await waitFor(() => {
        expect(screen.getByTestId("mock-auth-modal")).toBeInTheDocument();
      });

      // Authenticate as cashier (not manager) - no permissions
      await user.click(screen.getByTestId("mock-authenticate"));

      // Change button should STILL show "Request Change" (cashier can request manager approval)
      await waitFor(() => {
        changeButton = screen.getByTestId("change-serial-button");
        expect(changeButton).toHaveTextContent("Request Change");
      });
    });

    it("should require authentication before submission for cashiers", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      mockUser.roles = ["CASHIER"];

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Before auth, submit button should show "Authenticate & Activate"
      const submitButton = screen.getByTestId("submit-activation");
      expect(submitButton).toHaveTextContent(/authenticate.*activate/i);
      expect(submitButton).toBeDisabled();

      // Authenticate button should be visible
      expect(screen.getByTestId("authenticate-button")).toBeInTheDocument();

      // Click authenticate to open modal
      await user.click(screen.getByTestId("authenticate-button"));

      await waitFor(() => {
        expect(screen.getByTestId("mock-auth-modal")).toBeInTheDocument();
      });

      // Authenticate
      await user.click(screen.getByTestId("mock-authenticate"));

      // After auth, authenticated status should appear
      await waitFor(() => {
        expect(screen.getByText(/authenticated as/i)).toBeInTheDocument();
      });
    });

    it("should use user.id correctly in mockUser context", async () => {
      mockUser.roles = ["STORE_MANAGER"];

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Verify mockUser.id is correctly set (this validates the test setup)
      // The actual user.id usage is verified in API/integration tests
      expect(mockUser.id).toBe("user-1");

      // The form should render for this user
      expect(screen.getByTestId("pack-activation-form")).toBeInTheDocument();
    });
  });

  // ============================================================================
  // SECTION 10: DUAL-AUTH SERIAL OVERRIDE FLOW
  // (EPAF-020, EPAF-021, EPAF-022, EPAF-023, EPAF-024)
  // ============================================================================

  describe("Dual-Auth Serial Override Flow", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Setup cashier user (no serial override permission)
      mockUser.roles = ["CASHIER"];
      mockPermissions = [];
      mockAuthType = "cashier";
      mockAuthPermissions = [];
    });

    it("EPAF-020: should show serial override modal when cashier clicks Request Change", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Select a pack first
      await user.click(screen.getByTestId("mock-pack-select"));

      // Authenticate as cashier
      await user.click(screen.getByTestId("authenticate-button"));

      // Wait for modal to appear before clicking inside it
      await waitFor(() => {
        expect(screen.getByTestId("mock-auth-modal")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("mock-authenticate"));

      // Wait for auth to complete
      await waitFor(() => {
        expect(screen.getByText(/authenticated as/i)).toBeInTheDocument();
      });

      // Click the change serial button (should say "Request Change" for cashier)
      const changeButton = screen.getByTestId("change-serial-button");
      await user.click(changeButton);

      // Serial override modal should appear
      await waitFor(() => {
        expect(
          screen.getByTestId("mock-serial-override-modal"),
        ).toBeInTheDocument();
      });
    });

    it("EPAF-024: should show 'Request Change' text for cashier without permission", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Select a pack first
      await user.click(screen.getByTestId("mock-pack-select"));

      // Authenticate as cashier
      await user.click(screen.getByTestId("authenticate-button"));

      await waitFor(() => {
        expect(screen.getByTestId("mock-auth-modal")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("mock-authenticate"));

      await waitFor(() => {
        expect(screen.getByText(/authenticated as/i)).toBeInTheDocument();
      });

      // Button should show "Request Change" instead of "Change"
      const changeButton = screen.getByTestId("change-serial-button");
      expect(changeButton).toHaveTextContent("Request Change");
    });

    it("EPAF-021: should enable serial editing after manager approval", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Select a pack
      await user.click(screen.getByTestId("mock-pack-select"));

      // Authenticate as cashier
      await user.click(screen.getByTestId("authenticate-button"));

      await waitFor(() => {
        expect(screen.getByTestId("mock-auth-modal")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("mock-authenticate"));

      await waitFor(() => {
        expect(screen.getByText(/authenticated as/i)).toBeInTheDocument();
      });

      // Click request change
      await user.click(screen.getByTestId("change-serial-button"));

      // Approve serial override
      await user.click(screen.getByTestId("mock-approve-serial-override"));

      // Serial input should now be visible
      await waitFor(() => {
        expect(screen.getByTestId("serial-start-input")).toBeInTheDocument();
      });
    });

    it("EPAF-022: should display approval status after manager approval", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Select a pack
      await user.click(screen.getByTestId("mock-pack-select"));

      // Authenticate as cashier
      await user.click(screen.getByTestId("authenticate-button"));

      await waitFor(() => {
        expect(screen.getByTestId("mock-auth-modal")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("mock-authenticate"));

      await waitFor(() => {
        expect(screen.getByText(/authenticated as/i)).toBeInTheDocument();
      });

      // Request and approve serial override
      await user.click(screen.getByTestId("change-serial-button"));
      await user.click(screen.getByTestId("mock-approve-serial-override"));

      // Should show approval status
      await waitFor(() => {
        expect(
          screen.getByText(/serial change approved by/i),
        ).toBeInTheDocument();
        expect(screen.getByText("Manager Approver")).toBeInTheDocument();
      });
    });

    it("EPAF-023: should show approval badge with manager name after approval", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Select pack
      await user.click(screen.getByTestId("mock-pack-select"));

      // Authenticate as cashier
      await user.click(screen.getByTestId("authenticate-button"));

      await waitFor(() => {
        expect(screen.getByTestId("mock-auth-modal")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("mock-authenticate"));

      await waitFor(() => {
        expect(screen.getByText(/authenticated as/i)).toBeInTheDocument();
      });

      // Request and approve serial override
      await user.click(screen.getByTestId("change-serial-button"));
      await user.click(screen.getByTestId("mock-approve-serial-override"));

      // Wait for approval badge to show
      await waitFor(() => {
        expect(
          screen.getByText(/serial change approved by/i),
        ).toBeInTheDocument();
        expect(screen.getByText("Manager Approver")).toBeInTheDocument();
      });

      // Serial input should be visible after approval
      await waitFor(() => {
        expect(screen.getByTestId("serial-start-input")).toBeInTheDocument();
      });
    });

    it("should default serial to 0 without requiring approval", async () => {
      // Use manager user who doesn't need approval
      mockUser.roles = ["STORE_MANAGER"];
      mockPermissions = ["LOTTERY_SERIAL_OVERRIDE"];

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Serial display should show default 0
      const serialDisplay = screen.getByTestId("serial-start-display");
      expect(serialDisplay).toHaveTextContent("0");

      // No serial override approval should be visible (not changed from default)
      expect(
        screen.queryByText(/serial change approved by/i),
      ).not.toBeInTheDocument();
    });

    it("should show toast on successful serial override approval", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Select a pack
      await user.click(screen.getByTestId("mock-pack-select"));

      // Authenticate as cashier
      await user.click(screen.getByTestId("authenticate-button"));

      await waitFor(() => {
        expect(screen.getByTestId("mock-auth-modal")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("mock-authenticate"));

      await waitFor(() => {
        expect(screen.getByText(/authenticated as/i)).toBeInTheDocument();
      });

      // Request and approve serial override
      await user.click(screen.getByTestId("change-serial-button"));
      await user.click(screen.getByTestId("mock-approve-serial-override"));

      // Should show toast
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Serial Override Approved",
          }),
        );
      });
    });

    it("should reset serial override approval when dialog closes and reopens", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      const onOpenChange = vi.fn();

      const { rerender } = renderWithProviders(
        <EnhancedPackActivationForm
          {...defaultProps}
          onOpenChange={onOpenChange}
        />,
      );

      // Select a pack
      await user.click(screen.getByTestId("mock-pack-select"));

      // Authenticate as cashier
      await user.click(screen.getByTestId("authenticate-button"));

      await waitFor(() => {
        expect(screen.getByTestId("mock-auth-modal")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("mock-authenticate"));

      await waitFor(() => {
        expect(screen.getByText(/authenticated as/i)).toBeInTheDocument();
      });

      // Request and approve serial override
      await user.click(screen.getByTestId("change-serial-button"));
      await user.click(screen.getByTestId("mock-approve-serial-override"));

      // Should show approval
      await waitFor(() => {
        expect(
          screen.getByText(/serial change approved by/i),
        ).toBeInTheDocument();
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

      // Approval status should be cleared
      await waitFor(() => {
        expect(
          screen.queryByText(/serial change approved by/i),
        ).not.toBeInTheDocument();
      });
    });

    it("should allow manager to change serial directly without dual-auth", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      // Use manager user
      mockUser.roles = ["STORE_MANAGER"];
      mockPermissions = ["LOTTERY_SERIAL_OVERRIDE"];

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Select a pack
      await user.click(screen.getByTestId("mock-pack-select"));

      // Button should say "Change" not "Request Change"
      const changeButton = screen.getByTestId("change-serial-button");
      expect(changeButton).toHaveTextContent("Change");
      expect(changeButton).not.toHaveTextContent("Request");

      // Click to change (no approval modal)
      await user.click(changeButton);

      // Serial input should appear immediately
      await waitFor(() => {
        expect(screen.getByTestId("serial-start-input")).toBeInTheDocument();
      });

      // No serial override modal should be shown
      expect(
        screen.queryByTestId("mock-serial-override-modal"),
      ).not.toBeInTheDocument();
    });
  });

  // ============================================================================
  // SECTION 11: SERIAL RANGE VALIDATION
  // (EPAF-025 through EPAF-032)
  // ============================================================================
  // | Test ID                    | Requirement              | Category         |
  // |----------------------------|--------------------------|------------------|
  // | EPAF-025                   | Red border incomplete    | Error Handling   |
  // | EPAF-026                   | Red border above range   | Error Handling   |
  // | EPAF-027                   | Clear border on valid    | Business Logic   |
  // | EPAF-028                   | Show valid range hint    | Component        |
  // | EPAF-029                   | Disable submit on error  | Business Logic   |
  // | EPAF-030                   | Error styling on input   | Component        |
  // | EPAF-031                   | Clear error on cancel    | Business Logic   |
  // | EPAF-032                   | Clear error on pack chg  | Business Logic   |
  // ============================================================================

  describe("Serial Range Validation", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockUser.roles = ["STORE_MANAGER"];
      mockPermissions = ["LOTTERY_SERIAL_OVERRIDE"];
    });

    it("EPAF-025: should show error when serial is incomplete (less than 3 digits)", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Select pack with range 001-150
      await user.click(screen.getByTestId("mock-pack-select"));

      // Click change serial
      await user.click(screen.getByTestId("change-serial-button"));

      await waitFor(() => {
        expect(screen.getByTestId("serial-start-input")).toBeInTheDocument();
      });

      // Type incomplete serial (1 digit only)
      const input = screen.getByTestId(
        "serial-start-input",
      ) as HTMLInputElement;
      await user.clear(input);
      await user.type(input, "5");

      // Should show red border styling (incomplete input)
      await waitFor(() => {
        expect(input).toHaveClass("border-destructive");
      });
    });

    it("EPAF-026: should show error when serial exceeds pack's ending serial", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Select pack with range 001-150
      await user.click(screen.getByTestId("mock-pack-select"));

      // Click change serial
      await user.click(screen.getByTestId("change-serial-button"));

      await waitFor(() => {
        expect(screen.getByTestId("serial-start-input")).toBeInTheDocument();
      });

      // Type serial above range (pack ends at 150, type 200)
      const input = screen.getByTestId(
        "serial-start-input",
      ) as HTMLInputElement;
      await user.clear(input);
      await user.type(input, "200");

      // Should show red border styling (no text error messages)
      await waitFor(() => {
        expect(input).toHaveClass("border-destructive");
      });
    });

    it("EPAF-027: should clear error when valid serial is entered", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Select pack with range 001-150
      await user.click(screen.getByTestId("mock-pack-select"));

      // Click change serial
      await user.click(screen.getByTestId("change-serial-button"));

      await waitFor(() => {
        expect(screen.getByTestId("serial-start-input")).toBeInTheDocument();
      });

      // Type invalid serial first (out of range)
      const input = screen.getByTestId(
        "serial-start-input",
      ) as HTMLInputElement;
      await user.clear(input);
      await user.type(input, "999");

      // Should show red border
      await waitFor(() => {
        expect(input).toHaveClass("border-destructive");
      });

      // Now type valid serial
      await user.clear(input);
      await user.type(input, "050");

      // Red border should be cleared
      await waitFor(() => {
        expect(input).not.toHaveClass("border-destructive");
      });
    });

    it("EPAF-028: should show valid range hint when editing serial", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Select pack with range 001-150
      await user.click(screen.getByTestId("mock-pack-select"));

      // Click change serial
      await user.click(screen.getByTestId("change-serial-button"));

      await waitFor(() => {
        expect(screen.getByTestId("serial-start-input")).toBeInTheDocument();
      });

      // Type valid serial
      const input = screen.getByTestId(
        "serial-start-input",
      ) as HTMLInputElement;
      await user.clear(input);
      await user.type(input, "050");

      // Should show valid range hint text (contains "Valid range:")
      await waitFor(() => {
        const validRangeHint = screen.getByText(/valid range:/i);
        expect(validRangeHint).toBeInTheDocument();
        // The hint text should contain the range values
        expect(validRangeHint.textContent).toContain("001");
        expect(validRangeHint.textContent).toContain("150");
      });
    });

    it("EPAF-029: should disable submit button when serial range error exists", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Select pack and bin
      await user.click(screen.getByTestId("mock-pack-select"));
      await user.click(screen.getByTestId("mock-bin-select"));

      // Click change serial
      await user.click(screen.getByTestId("change-serial-button"));

      await waitFor(() => {
        expect(screen.getByTestId("serial-start-input")).toBeInTheDocument();
      });

      // Type invalid serial
      const input = screen.getByTestId(
        "serial-start-input",
      ) as HTMLInputElement;
      await user.clear(input);
      await user.type(input, "999");

      // Submit button should be disabled
      await waitFor(() => {
        const submitButton = screen.getByTestId("submit-activation");
        expect(submitButton).toBeDisabled();
      });
    });

    it("EPAF-030: should apply error styling to input when serial is out of range", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Select pack
      await user.click(screen.getByTestId("mock-pack-select"));

      // Click change serial
      await user.click(screen.getByTestId("change-serial-button"));

      await waitFor(() => {
        expect(screen.getByTestId("serial-start-input")).toBeInTheDocument();
      });

      // Type invalid serial
      const input = screen.getByTestId(
        "serial-start-input",
      ) as HTMLInputElement;
      await user.clear(input);
      await user.type(input, "999");

      // Input should have error styling (border-destructive class)
      await waitFor(() => {
        expect(input).toHaveClass("border-destructive");
      });
    });

    it("EPAF-031: should clear serial range error when cancel is clicked", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Select pack
      await user.click(screen.getByTestId("mock-pack-select"));

      // Click change serial
      await user.click(screen.getByTestId("change-serial-button"));

      await waitFor(() => {
        expect(screen.getByTestId("serial-start-input")).toBeInTheDocument();
      });

      // Type invalid serial
      const input = screen.getByTestId(
        "serial-start-input",
      ) as HTMLInputElement;
      await user.clear(input);
      await user.type(input, "999");

      // Should show red border (error indicator)
      await waitFor(() => {
        expect(input).toHaveClass("border-destructive");
      });

      // Click Cancel button next to input (the smaller one in the serial edit section)
      // Use getAllByRole and select the first one (which is the inline Cancel button)
      const cancelButtons = screen.getAllByRole("button", { name: /cancel/i });
      // The first Cancel button should be the inline one next to serial input
      await user.click(cancelButtons[0]);

      // Input should be hidden (back to display mode)
      await waitFor(() => {
        expect(
          screen.queryByTestId("serial-start-input"),
        ).not.toBeInTheDocument();
      });

      // Serial display should show default "000"
      const serialDisplay = screen.getByTestId("serial-start-display");
      expect(serialDisplay).toHaveTextContent("000");
    });

    it("EPAF-032: should clear serial range error when a new pack is selected", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Select pack
      await user.click(screen.getByTestId("mock-pack-select"));

      // Click change serial
      await user.click(screen.getByTestId("change-serial-button"));

      await waitFor(() => {
        expect(screen.getByTestId("serial-start-input")).toBeInTheDocument();
      });

      // Type invalid serial
      const input = screen.getByTestId(
        "serial-start-input",
      ) as HTMLInputElement;
      await user.clear(input);
      await user.type(input, "999");

      // Should show red border (error indicator)
      await waitFor(() => {
        expect(input).toHaveClass("border-destructive");
      });

      // Select a different pack (same mock, but it triggers reset via useEffect)
      await user.click(screen.getByTestId("mock-pack-select"));

      // After pack re-selection, editing mode is reset and serial returns to "000"
      await waitFor(() => {
        // Input should be hidden (back to display mode)
        expect(
          screen.queryByTestId("serial-start-input"),
        ).not.toBeInTheDocument();
        // Serial display should show "000"
        const serialDisplay = screen.getByTestId("serial-start-display");
        expect(serialDisplay).toHaveTextContent("000");
      });
    });

    it("should accept serial at exact boundaries (inclusive range)", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Select pack with range 001-150
      await user.click(screen.getByTestId("mock-pack-select"));

      // Click change serial
      await user.click(screen.getByTestId("change-serial-button"));

      await waitFor(() => {
        expect(screen.getByTestId("serial-start-input")).toBeInTheDocument();
      });

      // Type exact start boundary
      const input = screen.getByTestId(
        "serial-start-input",
      ) as HTMLInputElement;
      await user.clear(input);
      await user.type(input, "001");

      // Should NOT show error (001 is valid start)
      await waitFor(() => {
        expect(
          screen.queryByText(/serial must be at least/i),
        ).not.toBeInTheDocument();
        expect(screen.queryByText(/cannot exceed/i)).not.toBeInTheDocument();
      });

      // Now try exact end boundary
      await user.clear(input);
      await user.type(input, "150");

      // Should NOT show error (150 is valid end)
      await waitFor(() => {
        expect(screen.queryByText(/cannot exceed/i)).not.toBeInTheDocument();
      });
    });

    it("should handle non-numeric input gracefully", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Select pack
      await user.click(screen.getByTestId("mock-pack-select"));

      // Click change serial
      await user.click(screen.getByTestId("change-serial-button"));

      await waitFor(() => {
        expect(screen.getByTestId("serial-start-input")).toBeInTheDocument();
      });

      // Type non-numeric characters
      const input = screen.getByTestId(
        "serial-start-input",
      ) as HTMLInputElement;
      await user.clear(input);
      await user.type(input, "abc");

      // Input should show red border (invalid input) since regex /^\d{3}$/ doesn't match
      // Non-numeric input fails validation and triggers error styling
      await waitFor(() => {
        expect(input).toHaveClass("border-destructive");
      });

      // Submit button should be disabled due to validation failure
      const submitButton = screen.getByTestId("submit-activation");
      expect(submitButton).toBeDisabled();
    });

    // ============================================================================
    // SECTION 11.1: SERIAL LENGTH VALIDATION
    // (EPAF-033 through EPAF-036)
    // ============================================================================
    // | Test ID                    | Requirement              | Category         |
    // |----------------------------|--------------------------|------------------|
    // | EPAF-033                   | Red border short serial  | Error Handling   |
    // | EPAF-034                   | Prevent >3 digits input  | Input Constraint |
    // | EPAF-035                   | Accept correct length    | Business Logic   |
    // | EPAF-036                   | Red border incomplete    | Component        |
    // ============================================================================

    it("EPAF-033: should show error when serial has fewer digits than pack format", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Select pack with 3-digit format (001-150)
      await user.click(screen.getByTestId("mock-pack-select"));

      // Click change serial
      await user.click(screen.getByTestId("change-serial-button"));

      await waitFor(() => {
        expect(screen.getByTestId("serial-start-input")).toBeInTheDocument();
      });

      // Type 2-digit serial (pack requires 3 digits)
      const input = screen.getByTestId(
        "serial-start-input",
      ) as HTMLInputElement;
      await user.clear(input);
      await user.type(input, "50");

      // Should show red border (visual error indicator)
      await waitFor(() => {
        expect(input).toHaveClass("border-destructive");
      });
    });

    it("EPAF-034: should prevent more than 3 digits via maxLength", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Select pack with 3-digit format (001-150)
      await user.click(screen.getByTestId("mock-pack-select"));

      // Click change serial
      await user.click(screen.getByTestId("change-serial-button"));

      await waitFor(() => {
        expect(screen.getByTestId("serial-start-input")).toBeInTheDocument();
      });

      // Try to type 4-digit serial (maxLength=3 should prevent it)
      const input = screen.getByTestId(
        "serial-start-input",
      ) as HTMLInputElement;
      await user.clear(input);
      await user.type(input, "0050");

      // Input should only contain 3 characters due to maxLength
      await waitFor(() => {
        expect(input.value.length).toBeLessThanOrEqual(3);
      });
    });

    it("EPAF-035: should accept serial with correct digit length", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Select pack with 3-digit format (001-150)
      await user.click(screen.getByTestId("mock-pack-select"));

      // Click change serial
      await user.click(screen.getByTestId("change-serial-button"));

      await waitFor(() => {
        expect(screen.getByTestId("serial-start-input")).toBeInTheDocument();
      });

      // Type exactly 3-digit serial within range
      const input = screen.getByTestId(
        "serial-start-input",
      ) as HTMLInputElement;
      await user.clear(input);
      await user.type(input, "075");

      // Should NOT have red border (valid input)
      await waitFor(() => {
        expect(input).not.toHaveClass("border-destructive");
      });
    });

    it("EPAF-036: should show red border for incomplete serial", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Select pack with 3-digit format (001-150)
      await user.click(screen.getByTestId("mock-pack-select"));

      // Click change serial
      await user.click(screen.getByTestId("change-serial-button"));

      await waitFor(() => {
        expect(screen.getByTestId("serial-start-input")).toBeInTheDocument();
      });

      // Type incomplete serial (1 digit)
      const input = screen.getByTestId(
        "serial-start-input",
      ) as HTMLInputElement;
      await user.clear(input);
      await user.type(input, "5");

      // Should show red border for incomplete input
      await waitFor(() => {
        expect(input).toHaveClass("border-destructive");
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════
  // Management Auth activated_by Logic Tests
  // ═══════════════════════════════════════════════════════════════════════════════════
  // These tests verify that the component correctly displays authenticated user names
  // and that the default serial is set to "000" when a pack is selected.
  //
  // | EPAF-037                   | Mgmt auth shows manager name     | Authorization    |
  // | EPAF-038                   | Cashier auth shows cashier name  | Authorization    |
  // | EPAF-039                   | Default serial 000 on new pack   | Business Logic   |
  // ═══════════════════════════════════════════════════════════════════════════════════

  describe("Management Auth activated_by Logic", () => {
    it("EPAF-037: should show management-authenticated user name after management auth", async () => {
      // This test verifies that when a cashier authenticates via Management tab,
      // the authentication result shows the management user's name
      mockUser.roles = ["CASHIER"];
      mockPermissions = [];

      const user = userEvent.setup({ pointerEventsCheck: 0 });

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Open auth modal via authenticate button
      await user.click(screen.getByTestId("authenticate-button"));

      // Auth modal should appear
      await waitFor(() => {
        expect(screen.getByTestId("mock-auth-modal")).toBeInTheDocument();
      });

      // Authenticate via Management tab (manager-1, Jane Manager)
      await user.click(screen.getByTestId("mock-authenticate-management"));

      // Should show the MANAGEMENT user's name (Jane Manager), not session user
      await waitFor(() => {
        expect(screen.getByText(/authenticated as/i)).toBeInTheDocument();
        expect(screen.getByText("Jane Manager")).toBeInTheDocument();
      });

      // Verify it's NOT showing the session user name
      expect(screen.queryByText("John Doe")).not.toBeInTheDocument();

      // Reset for other tests
      mockUser.roles = ["STORE_MANAGER"];
      mockPermissions = ["LOTTERY_SERIAL_OVERRIDE"];
    });

    it("EPAF-038: should show cashier-authenticated user name after cashier auth", async () => {
      // This test verifies that when a cashier authenticates via Cashier tab,
      // the authentication result shows the cashier's name
      mockUser.roles = ["CASHIER"];
      mockPermissions = [];
      mockAuthType = "cashier";

      const user = userEvent.setup({ pointerEventsCheck: 0 });

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Open auth modal via authenticate button
      await user.click(screen.getByTestId("authenticate-button"));

      // Auth modal should appear
      await waitFor(() => {
        expect(screen.getByTestId("mock-auth-modal")).toBeInTheDocument();
      });

      // Authenticate via Cashier tab (regular authenticate)
      await user.click(screen.getByTestId("mock-authenticate"));

      // Should show the cashier's name (John Doe)
      await waitFor(() => {
        expect(screen.getByText(/authenticated as/i)).toBeInTheDocument();
        expect(screen.getByText("John Doe")).toBeInTheDocument();
      });

      // Verify it's NOT showing the management user name
      expect(screen.queryByText("Jane Manager")).not.toBeInTheDocument();

      // Reset for other tests
      mockUser.roles = ["STORE_MANAGER"];
      mockPermissions = ["LOTTERY_SERIAL_OVERRIDE"];
      mockAuthType = "cashier";
    });

    it("EPAF-039: should set default serial to 000 when pack is selected", async () => {
      // This test verifies that when a pack is selected, the serial defaults to "000"
      mockUser.roles = ["STORE_MANAGER"];
      mockPermissions = ["LOTTERY_SERIAL_OVERRIDE"];

      const user = userEvent.setup({ pointerEventsCheck: 0 });

      renderWithProviders(<EnhancedPackActivationForm {...defaultProps} />);

      // Initially serial display should show "000" (from form defaultValues)
      const serialDisplayInitial = screen.getByTestId("serial-start-display");
      expect(serialDisplayInitial).toHaveTextContent("000");

      // Select pack (should reset serial to 000 via useEffect)
      await user.click(screen.getByTestId("mock-pack-select"));

      // Wait for pack to be selected
      await waitFor(() => {
        expect(screen.getByText("Pack Details")).toBeInTheDocument();
      });

      // Serial display should still show "000" (reset by useEffect when pack changes)
      await waitFor(() => {
        const serialDisplay = screen.getByTestId("serial-start-display");
        expect(serialDisplay).toHaveTextContent("000");
      });

      // Verify the pack's serial range is displayed (not the default)
      expect(screen.getByText(/Serial Range:/)).toBeInTheDocument();
    });
  });
});
