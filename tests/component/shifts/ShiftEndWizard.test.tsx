/**
 * @test-level COMPONENT
 * @justification Tests ShiftEndWizard UI behavior without backend dependencies
 * @story Shift Closing Plan - 2-Step Wizard
 * @priority P0 (Critical - UI Integration)
 *
 * Shift End Wizard Page Component Tests
 *
 * Tests the 2-step shift close wizard UI including:
 * - Header display with terminal name, shift info
 * - Step indicator progress
 * - Report scanning step (Step 1)
 * - Close shift step (Step 2)
 * - Navigation between steps
 * - Redirect behavior for closed shifts
 *
 * ================================================================================
 * TRACEABILITY MATRIX
 * ================================================================================
 *
 * | Test ID              | Requirement                          | Component/Feature              | Priority |
 * |----------------------|--------------------------------------|--------------------------------|----------|
 * | SEW-001              | FE-002: Page renders correctly       | ShiftEndWizard                 | P0       |
 * | SEW-002              | FE-002: Loading state shown          | ShiftEndWizard                 | P0       |
 * | SEW-003              | FE-002: Step 1 shown initially       | ShiftEndWizard                 | P0       |
 * | SEW-004              | FE-002: Header displays shift info   | ShiftEndWizard Header          | P0       |
 * | SEW-005              | FE-002: Step indicator visible       | ShiftEndWizard Step Indicator  | P0       |
 * | SEW-006              | BIZ: Step 2 shows after step 1       | ShiftEndWizard Navigation      | P0       |
 * | SEW-007              | BIZ: Redirect when shift closed      | ShiftEndWizard                 | P0       |
 * | SEW-008              | FE-002: Error state handled          | ShiftEndWizard Error           | P0       |
 *
 * REQUIREMENT COVERAGE:
 * - Form Validation (FE-002): 8 tests
 * - Business Logic: 2 tests
 * ================================================================================
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock Next.js hooks
const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockBack = vi.fn();
const mockGet = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  }),
  useSearchParams: () => ({
    get: mockGet,
  }),
}));

// Mock client auth context
vi.mock("@/contexts/ClientAuthContext", () => ({
  useClientAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    user: { user_id: "user-123", name: "Test User" },
  }),
}));

// Mock client dashboard API
vi.mock("@/lib/api/client-dashboard", () => ({
  useClientDashboard: vi.fn(),
}));

// Mock shifts API
vi.mock("@/lib/api/shifts", () => ({
  useShiftDetail: vi.fn(),
  useCloseShift: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useInvalidateShifts: () => ({
    invalidateList: vi.fn(),
    invalidateDetail: vi.fn(),
  }),
}));

// Mock stores API for terminal data
vi.mock("@/lib/api/stores", () => ({
  useStoreTerminals: vi.fn(),
}));

// Mock cashiers API
vi.mock("@/lib/api/cashiers", () => ({
  useCashiers: vi.fn(),
}));

// Mock lottery hooks
vi.mock("@/hooks/useLottery", () => ({
  useLotteryDayBins: vi.fn(),
}));

// Mock toast
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Import mocked modules
import { useClientDashboard } from "@/lib/api/client-dashboard";
import { useShiftDetail } from "@/lib/api/shifts";
import { useStoreTerminals } from "@/lib/api/stores";
import { useCashiers } from "@/lib/api/cashiers";
import { useLotteryDayBins } from "@/hooks/useLottery";

// Import the component under test
import ShiftEndWizardPage from "@/app/(mystore)/mystore/shift-end/page";

// Create a QueryClient for each test to ensure isolation
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  });
}

// Render helper with QueryClientProvider
function renderWithQueryClient(
  ui: React.ReactElement,
  queryClient?: QueryClient,
) {
  const client = queryClient ?? createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe("ShiftEndWizard Page", () => {
  // Default mock data
  const mockDashboardData = {
    stores: [
      {
        store_id: "store-123",
        name: "Test Store",
        status: "ACTIVE",
      },
    ],
  };

  const mockShiftData = {
    shift_id: "shift-123",
    store_id: "store-123",
    pos_terminal_id: "terminal-123",
    cashier_id: "cashier-123",
    status: "ACTIVE",
    opened_at: "2025-12-25T08:00:00.000Z",
    opening_cash: 200.0,
    cashier_name: "John Smith",
    shift_number: 1,
  };

  const mockTerminals = [
    {
      pos_terminal_id: "terminal-123",
      name: "T1",
      store_id: "store-123",
      status: "ACTIVE",
    },
  ];

  const mockCashiers = [
    {
      cashier_id: "cashier-123",
      name: "John Smith",
      employee_id: "E001",
      is_active: true,
    },
  ];

  const mockDayBinsData = {
    bins: [],
    business_day: {
      date: "2025-12-25",
      first_shift_opened_at: "2025-12-25T08:00:00.000Z",
      last_shift_closed_at: null,
    },
    depleted_packs: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default search params
    mockGet.mockReturnValue("shift-123");

    // Default mocks - page loads successfully
    vi.mocked(useClientDashboard).mockReturnValue({
      data: mockDashboardData,
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useShiftDetail).mockReturnValue({
      data: mockShiftData,
      isLoading: false,
    } as any);

    vi.mocked(useLotteryDayBins).mockReturnValue({
      data: mockDayBinsData,
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useStoreTerminals).mockReturnValue({
      data: mockTerminals,
      isLoading: false,
    } as any);

    vi.mocked(useCashiers).mockReturnValue({
      data: mockCashiers,
      isLoading: false,
    } as any);
  });

  afterEach(() => {
    cleanup();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P0 CRITICAL - RENDERING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("SEW-001: [P0] should render wizard page with correct test id", async () => {
    // GIVEN: Valid page props
    // WHEN: Page is rendered
    renderWithQueryClient(<ShiftEndWizardPage />);

    // THEN: Wizard container should be visible
    await waitFor(() => {
      expect(screen.getByTestId("shift-end-wizard")).toBeInTheDocument();
    });
  });

  it("SEW-002: [P0] should show loading state while data is loading", () => {
    // GIVEN: Dashboard is loading
    vi.mocked(useClientDashboard).mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
      error: null,
    } as any);

    // WHEN: Page is rendered
    renderWithQueryClient(<ShiftEndWizardPage />);

    // THEN: Loading state should be visible
    expect(screen.getByTestId("shift-end-wizard-loading")).toBeInTheDocument();
  });

  it("SEW-003: [P0] should show step 1 (Report Scanning) initially", async () => {
    // GIVEN: Page loads normally
    // WHEN: Page is rendered
    renderWithQueryClient(<ShiftEndWizardPage />);

    // THEN: Step 1 content should be visible with ReportScanningStep component
    await waitFor(() => {
      expect(
        screen.getByTestId("shift-close-step-1-content"),
      ).toBeInTheDocument();
    });
    // Report Scanning step component should be rendered (header removed - uses step indicator)
    expect(screen.getByTestId("report-scanning-step")).toBeInTheDocument();
  });

  it("SEW-004: [P0] should display shift info in header", async () => {
    // GIVEN: Shift data is loaded
    // WHEN: Page is rendered
    renderWithQueryClient(<ShiftEndWizardPage />);

    // THEN: Header should display all shift info in one card
    await waitFor(() => {
      expect(screen.getByTestId("shift-info-header")).toBeInTheDocument();
    });
    expect(screen.getByText("T1")).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.getByText("$200.00")).toBeInTheDocument();
  });

  it("SEW-005: [P0] should display step indicator", async () => {
    // GIVEN: Page loads normally
    // WHEN: Page is rendered
    renderWithQueryClient(<ShiftEndWizardPage />);

    // THEN: Step indicator should be visible
    await waitFor(() => {
      expect(
        screen.getByTestId("shift-close-step-indicator"),
      ).toBeInTheDocument();
    });
    // Step labels should be visible
    expect(screen.getByText("Report Scanning")).toBeInTheDocument();
    expect(screen.getByText("Close Shift")).toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P0 CRITICAL - NAVIGATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("SEW-006: [P0] should advance to step 2 when step 1 completes", async () => {
    // GIVEN: Page is on step 1
    const user = userEvent.setup();
    renderWithQueryClient(<ShiftEndWizardPage />);

    // Wait for step 1 to load
    await waitFor(() => {
      expect(
        screen.getByTestId("shift-close-step-1-content"),
      ).toBeInTheDocument();
    });

    // WHEN: User clicks "Next" on report scanning step
    const nextButton = screen.getByTestId("report-scanning-next-btn");
    await user.click(nextButton);

    // THEN: Step 2 should be visible
    await waitFor(() => {
      expect(
        screen.getByTestId("shift-close-step-2-content"),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("Step 2: Close Shift")).toBeInTheDocument();
  });

  it("SEW-007: [P0] should redirect to dashboard when shift is already closed", async () => {
    // GIVEN: Shift is already closed
    vi.mocked(useShiftDetail).mockReturnValue({
      data: { ...mockShiftData, status: "CLOSED" },
      isLoading: false,
    } as any);

    // WHEN: Page is rendered
    renderWithQueryClient(<ShiftEndWizardPage />);

    // THEN: Should redirect to /mystore
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/mystore");
    });
  });

  it("SEW-008: [P0] should show error state when dashboard fails to load", async () => {
    // GIVEN: Dashboard API fails
    vi.mocked(useClientDashboard).mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      error: new Error("Network error"),
    } as any);

    // WHEN: Page is rendered
    renderWithQueryClient(<ShiftEndWizardPage />);

    // THEN: Error state should be visible
    await waitFor(() => {
      expect(screen.getByTestId("shift-end-wizard-error")).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P1 - STEP 2 TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("SEW-009: [P1] should show back button on step 2", async () => {
    // GIVEN: Page is on step 2
    const user = userEvent.setup();
    renderWithQueryClient(<ShiftEndWizardPage />);

    // Advance to step 2
    await waitFor(() => {
      expect(
        screen.getByTestId("shift-close-step-1-content"),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("report-scanning-next-btn"));

    // WHEN: Step 2 is displayed
    await waitFor(() => {
      expect(
        screen.getByTestId("shift-close-step-2-content"),
      ).toBeInTheDocument();
    });

    // THEN: Back button should be visible
    expect(screen.getByTestId("shift-close-back-btn")).toBeInTheDocument();
  });

  it("SEW-010: [P1] should return to step 1 when back button clicked", async () => {
    // GIVEN: Page is on step 2
    const user = userEvent.setup();
    renderWithQueryClient(<ShiftEndWizardPage />);

    // Advance to step 2
    await waitFor(() => {
      expect(
        screen.getByTestId("shift-close-step-1-content"),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("report-scanning-next-btn"));
    await waitFor(() => {
      expect(
        screen.getByTestId("shift-close-step-2-content"),
      ).toBeInTheDocument();
    });

    // WHEN: User clicks back button
    await user.click(screen.getByTestId("shift-close-back-btn"));

    // THEN: Step 1 should be visible again
    await waitFor(() => {
      expect(
        screen.getByTestId("shift-close-step-1-content"),
      ).toBeInTheDocument();
    });
  });

  it("SEW-011: [P1] should show Complete Shift Close button on step 2", async () => {
    // GIVEN: Page is on step 2
    const user = userEvent.setup();
    renderWithQueryClient(<ShiftEndWizardPage />);

    // Advance to step 2
    await waitFor(() => {
      expect(
        screen.getByTestId("shift-close-step-1-content"),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("report-scanning-next-btn"));

    // WHEN: Step 2 is displayed
    await waitFor(() => {
      expect(
        screen.getByTestId("shift-close-step-2-content"),
      ).toBeInTheDocument();
    });

    // THEN: Complete button should be visible and enabled
    const completeButton = screen.getByTestId("complete-shift-close-btn");
    expect(completeButton).toBeInTheDocument();
    expect(completeButton).not.toBeDisabled();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P1 - EDGE CASE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("SEW-012: [P1] should show no store message when no store available", async () => {
    // GIVEN: No stores available
    vi.mocked(useClientDashboard).mockReturnValue({
      data: { stores: [] },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    // WHEN: Page is rendered
    renderWithQueryClient(<ShiftEndWizardPage />);

    // THEN: No store message should be visible
    await waitFor(() => {
      expect(screen.getByText(/No store available/i)).toBeInTheDocument();
    });
  });

  it("SEW-013: [P1] should use fallback terminal name when terminal not found", async () => {
    // GIVEN: Terminal not found in list
    vi.mocked(useStoreTerminals).mockReturnValue({
      data: [],
      isLoading: false,
    } as any);

    // WHEN: Page is rendered
    renderWithQueryClient(<ShiftEndWizardPage />);

    // THEN: Default "Terminal" text should be visible in the card
    await waitFor(() => {
      expect(screen.getByText("Terminal")).toBeInTheDocument();
    });
  });

  it("SEW-014: [P1] should use fallback cashier name when cashier not found", async () => {
    // GIVEN: Cashier not found and no cashier_name in shift data
    const shiftWithoutCashierName = {
      ...mockShiftData,
      cashier_name: undefined,
      cashier_id: "nonexistent-cashier",
    };
    vi.mocked(useShiftDetail).mockReturnValue({
      data: shiftWithoutCashierName,
      isLoading: false,
    } as any);
    vi.mocked(useCashiers).mockReturnValue({
      data: [],
      isLoading: false,
    } as any);

    // WHEN: Page is rendered
    renderWithQueryClient(<ShiftEndWizardPage />);

    // THEN: "Unknown Cashier" should be visible
    await waitFor(() => {
      expect(screen.getByText("Unknown Cashier")).toBeInTheDocument();
    });
  });
});
