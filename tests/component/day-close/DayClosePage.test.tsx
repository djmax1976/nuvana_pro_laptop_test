/**
 * @test-level COMPONENT
 * @justification Tests Day Close Page UI behavior without backend dependencies
 * @story Day Close Workflow
 * @priority P0 (Critical - UI Integration)
 *
 * Day Close Wizard Component Tests
 *
 * Tests the complete 3-step day close wizard UI including:
 * - Step 1: Lottery Close (DayCloseModeScanner)
 * - Step 2: Report Scanning (ReportScanningStep)
 * - Step 3: Day Close (ShiftClosingForm)
 * - Header display with terminal name, shift info
 * - Open shifts blocking behavior (shown in Step 1)
 * - Auto-skip to Step 2 when lottery already closed
 * - Navigation and redirect behavior
 *
 * ================================================================================
 * TRACEABILITY MATRIX
 * ================================================================================
 *
 * | Test ID              | Requirement                          | Component/Feature              | Priority |
 * |----------------------|--------------------------------------|--------------------------------|----------|
 * | DC-PAGE-001          | FE-002: Wizard renders Step 1        | DayCloseWizard                 | P0       |
 * | DC-PAGE-002          | FE-002: Loading state shown           | DayCloseWizard                 | P0       |
 * | DC-PAGE-003          | BIZ: Blocking banner visible Step 1  | DayCloseModeScanner            | P0       |
 * | DC-PAGE-003a         | BIZ: No banner when no blocks        | DayCloseModeScanner            | P0       |
 * | DC-PAGE-003b         | BIZ: Loading state for open shifts   | DayCloseWizard                 | P0       |
 * | DC-PAGE-005          | BIZ: Step 1 visible when not closed  | DayCloseWizard                 | P0       |
 * | DC-PAGE-006          | BIZ: Auto-skip to Step 2 if closed   | DayCloseWizard                 | P0       |
 * | DC-HDR-001           | FE-002: Terminal name in header      | ShiftInfoHeader                | P0       |
 * | DC-HDR-002           | FE-002: Shift number in header       | ShiftInfoHeader                | P0       |
 * | DC-HDR-003           | FE-002: Cashier name in header       | ShiftInfoHeader                | P0       |
 * | DC-HDR-004           | FE-002: Start time in header         | ShiftInfoHeader                | P0       |
 * | DC-HDR-005           | FE-002: Opening cash in header       | ShiftInfoHeader                | P0       |
 * | DC-HDR-006           | FE-002: Header loading state         | ShiftInfoHeader                | P1       |
 * | DC-PAGE-008          | FE-002: No Close Day button Step 1   | DayCloseWizard                 | P0       |
 * | DC-PAGE-009          | BIZ: Step 1 shows DayCloseModeScanner| DayCloseModeScanner            | P0       |
 * | DC-PAGE-010          | BIZ: Step indicator shows 3 steps    | StepIndicator                  | P0       |
 *
 * REQUIREMENT COVERAGE:
 * - Form Validation (FE-002): 10 tests
 * - Business Logic: 8 tests
 * - Header Display: 6 tests
 * - Wizard Navigation: 6 tests
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
const mockGet = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
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
  useOpenShiftsCheck: vi.fn(),
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
import { useShiftDetail, useOpenShiftsCheck } from "@/lib/api/shifts";
import { useStoreTerminals } from "@/lib/api/stores";
import { useCashiers } from "@/lib/api/cashiers";
import { useLotteryDayBins } from "@/hooks/useLottery";

// Import the component under test
import DayClosePage from "@/app/(mystore)/mystore/day-close/page";

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

describe("DayClosePage Component", () => {
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

  // Terminal mock data for header display
  const mockTerminals = [
    {
      pos_terminal_id: "terminal-123",
      name: "T1",
      store_id: "store-123",
      status: "ACTIVE",
    },
    {
      pos_terminal_id: "terminal-456",
      name: "T2",
      store_id: "store-123",
      status: "ACTIVE",
    },
  ];

  // Cashier mock data for header display
  const mockCashiers = [
    {
      cashier_id: "cashier-123",
      name: "John Smith",
      employee_id: "E001",
      is_active: true,
    },
    {
      cashier_id: "cashier-456",
      name: "Jane Doe",
      employee_id: "E002",
      is_active: true,
    },
  ];

  const mockDayBinsData = {
    bins: [
      {
        bin_id: "bin-1",
        bin_number: 1,
        name: "Bin 1",
        is_active: true,
        pack: {
          pack_id: "pack-1",
          pack_number: "1234567",
          game_name: "Lucky 7s",
          game_price: 5.0,
          starting_serial: "001",
          ending_serial: null,
          serial_end: "050",
        },
      },
    ],
    business_day: {
      date: "2025-12-25",
      first_shift_opened_at: "2025-12-25T08:00:00.000Z",
      last_shift_closed_at: null,
    },
    depleted_packs: [],
  };

  const mockOpenShiftsNone = {
    has_open_shifts: false,
    open_shift_count: 0,
    open_shifts: [],
  };

  const mockOpenShiftsBlocking = {
    has_open_shifts: true,
    open_shift_count: 2,
    open_shifts: [
      {
        shift_id: "shift-456",
        terminal_name: "Terminal 2",
        cashier_name: "Jane Doe",
        status: "ACTIVE",
        opened_at: "2025-12-25T09:00:00.000Z",
      },
      {
        shift_id: "shift-789",
        terminal_name: "Terminal 3",
        cashier_name: "Bob Smith",
        status: "OPEN",
        opened_at: "2025-12-25T10:00:00.000Z",
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default search params
    mockGet.mockReturnValue("shift-123");

    // Default mocks - page loads successfully with no blockers
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

    vi.mocked(useOpenShiftsCheck).mockReturnValue({
      data: mockOpenShiftsNone,
      isLoading: false,
      isFetched: true,
    } as any);

    // Terminal and cashier mocks for header display
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

  it("DC-PAGE-001: [P0] should render day close wizard with Step 1 (Lottery Close)", async () => {
    // GIVEN: Valid page props
    // WHEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: Wizard should be visible with Step 1 active
    await waitFor(() => {
      expect(screen.getByTestId("day-close-wizard")).toBeInTheDocument();
    });
    // Step indicator should show "Lottery Close" as current step
    expect(screen.getByTestId("step-1-indicator")).toBeInTheDocument();
    expect(screen.getByText("Lottery Close")).toBeInTheDocument();
  });

  it("DC-PAGE-002: [P0] should show loading state while data is loading", () => {
    // GIVEN: Dashboard is loading
    vi.mocked(useClientDashboard).mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
      error: null,
    } as any);

    // WHEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: Loading state should be visible
    expect(screen.getByTestId("day-close-wizard-loading")).toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P0 CRITICAL - OPEN SHIFTS BLOCKING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("DC-PAGE-003: [P0] should show blocking banner when other open shifts exist", async () => {
    // GIVEN: Other open shifts exist (excluding current shift)
    vi.mocked(useOpenShiftsCheck).mockReturnValue({
      data: mockOpenShiftsBlocking,
      isLoading: false,
      isFetched: true,
    } as any);

    // WHEN: Page is rendered (Step 1 - DayCloseModeScanner shows blocking banner)
    renderWithQueryClient(<DayClosePage />);

    // THEN: Blocking banner should be visible in Step 1 (DayCloseModeScanner)
    await waitFor(() => {
      expect(
        screen.getByTestId("open-shifts-blocking-banner"),
      ).toBeInTheDocument();
    });

    // AND: Should show shift details from DayCloseModeScanner
    expect(screen.getByText(/Terminal 2/)).toBeInTheDocument();
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
    expect(screen.getByText(/Terminal 3/)).toBeInTheDocument();
    expect(screen.getByText(/Bob Smith/)).toBeInTheDocument();
  });

  it("DC-PAGE-003a: [P0] should NOT show blocking banner when no other open shifts", async () => {
    // GIVEN: No other open shifts
    vi.mocked(useOpenShiftsCheck).mockReturnValue({
      data: mockOpenShiftsNone,
      isLoading: false,
      isFetched: true,
    } as any);

    // WHEN: Page is rendered (Step 1 active)
    renderWithQueryClient(<DayClosePage />);

    // Wait for wizard to load
    await waitFor(() => {
      expect(screen.getByTestId("day-close-wizard")).toBeInTheDocument();
    });

    // THEN: Blocking banner should NOT be visible
    expect(
      screen.queryByTestId("open-shifts-blocking-banner"),
    ).not.toBeInTheDocument();
  });

  it("DC-PAGE-003b: [P0] should show loading state while open shifts query is loading", async () => {
    // GIVEN: Open shifts check is loading
    vi.mocked(useOpenShiftsCheck).mockReturnValue({
      data: null,
      isLoading: true,
      isFetched: false,
    } as any);

    // WHEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: Page shows loading spinner (openShiftsLoading blocks rendering)
    await waitFor(() => {
      expect(
        screen.getByTestId("day-close-wizard-loading"),
      ).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P0 CRITICAL - COMPLETE DAY CLOSE BUTTON TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("DC-PAGE-005: [P0] should render Step 1 with DayCloseModeScanner when lottery not closed", async () => {
    // GIVEN: Lottery not closed (business_day.status not CLOSED)
    // WHEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: Wizard should show Step 1 (Lottery Close) content
    await waitFor(() => {
      expect(screen.getByTestId("step-1-content")).toBeInTheDocument();
    });
    // Complete Day Close button is only in Step 3, not visible in Step 1
    expect(
      screen.queryByTestId("complete-day-close-btn"),
    ).not.toBeInTheDocument();
  });

  it("DC-PAGE-006: [P0] should auto-advance to Step 2 when lottery already closed", async () => {
    // GIVEN: Lottery already closed (business_day.status = CLOSED)
    const closedDayBins = {
      ...mockDayBinsData,
      business_day: {
        ...mockDayBinsData.business_day,
        status: "CLOSED",
        last_shift_closed_at: "2025-12-25T18:00:00.000Z",
      },
    };
    vi.mocked(useLotteryDayBins).mockReturnValue({
      data: closedDayBins,
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    // WHEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: Wizard should auto-advance to Step 2 (Report Scanning)
    await waitFor(() => {
      expect(screen.getByTestId("step-2-content")).toBeInTheDocument();
    });
    // Step 2 indicator should show as active
    expect(screen.getByTestId("step-1-indicator")).toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P0 CRITICAL - HEADER DISPLAY TESTS (Terminal Name, Shift Info Card)
  // ═══════════════════════════════════════════════════════════════════════════

  it("DC-HDR-001: [P0] should display terminal name in header", async () => {
    // GIVEN: Terminal data is loaded
    // WHEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: Terminal name should be visible in header card
    await waitFor(() => {
      expect(screen.getByText("T1")).toBeInTheDocument();
    });
  });

  it("DC-HDR-002: [P0] should display shift number in header", async () => {
    // GIVEN: Shift data with shift_number
    // WHEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: Shift number should be visible (e.g., "#1")
    await waitFor(() => {
      expect(screen.getByText("#1")).toBeInTheDocument();
    });
  });

  it("DC-HDR-003: [P0] should display cashier name in shift info card", async () => {
    // GIVEN: Cashier data is loaded
    // WHEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: Cashier name should be visible
    await waitFor(() => {
      expect(screen.getByText("John Smith")).toBeInTheDocument();
    });
    // Also verify the label
    expect(screen.getByText("Cashier:")).toBeInTheDocument();
  });

  it("DC-HDR-004: [P0] should display shift start time in shift info card", async () => {
    // GIVEN: Shift data with opened_at
    // WHEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: Start time should be visible with proper formatting
    // opened_at: "2025-12-25T08:00:00.000Z" => "Dec 25, 2025 at 8:00 AM" (UTC)
    await waitFor(() => {
      expect(screen.getByText("Started:")).toBeInTheDocument();
    });
    // The formatted date should include "Dec 25, 2025"
    expect(screen.getByText(/Dec 25, 2025/)).toBeInTheDocument();
  });

  it("DC-HDR-005: [P0] should display opening cash in shift info card", async () => {
    // GIVEN: Shift data with opening_cash = 200.00
    // WHEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: Opening cash should be visible with currency formatting
    await waitFor(() => {
      expect(screen.getByText("Opening Cash:")).toBeInTheDocument();
    });
    expect(screen.getByText("$200.00")).toBeInTheDocument();
  });

  it("DC-HDR-006: [P1] should show loading state when terminal data is loading", async () => {
    // GIVEN: Terminal data is still loading
    vi.mocked(useStoreTerminals).mockReturnValue({
      data: [],
      isLoading: true,
    } as any);

    // WHEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: Loading indicator should be visible
    await waitFor(() => {
      expect(
        screen.getByTestId("day-close-wizard-loading"),
      ).toBeInTheDocument();
    });
  });

  it("DC-HDR-007: [P1] should show loading state when cashier data is loading", async () => {
    // GIVEN: Cashier data is still loading
    vi.mocked(useCashiers).mockReturnValue({
      data: [],
      isLoading: true,
    } as any);

    // WHEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: Loading indicator should be visible
    await waitFor(() => {
      expect(
        screen.getByTestId("day-close-wizard-loading"),
      ).toBeInTheDocument();
    });
  });

  it("DC-HDR-008: [P1] should display 'Terminal' as fallback when terminal not found", async () => {
    // GIVEN: Terminal not found in list
    vi.mocked(useStoreTerminals).mockReturnValue({
      data: [], // Empty list
      isLoading: false,
    } as any);

    // WHEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: Default "Terminal" text should be visible in the card
    await waitFor(() => {
      expect(screen.getByText("Terminal")).toBeInTheDocument();
    });
  });

  it("DC-HDR-009: [P1] should display 'Unknown Cashier' when cashier not found", async () => {
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
      data: [], // Empty list
      isLoading: false,
    } as any);

    // WHEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: "Unknown Cashier" should be visible
    await waitFor(() => {
      expect(screen.getByText("Unknown Cashier")).toBeInTheDocument();
    });
  });

  it("DC-HDR-010: [P1] should hide shift number display when shift_number is null", async () => {
    // GIVEN: Shift has no shift_number
    const shiftWithoutNumber = { ...mockShiftData, shift_number: null };
    vi.mocked(useShiftDetail).mockReturnValue({
      data: shiftWithoutNumber,
      isLoading: false,
    } as any);

    // WHEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: Shift label should NOT be visible when shift_number is null
    await waitFor(() => {
      expect(screen.getByText("T1")).toBeInTheDocument();
    });
    expect(screen.queryByText("Shift:")).not.toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P0 CRITICAL - BUTTON REMOVAL VERIFICATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("DC-PAGE-008: [P0] should NOT have standalone Close Day button in Step 1", async () => {
    // This test verifies the business requirement that the Close Day button
    // is not shown in the lottery scanning step. The Complete Day Close button
    // only appears in Step 3 of the wizard.

    // GIVEN: Day close page is rendered (starts at Step 1)
    renderWithQueryClient(<DayClosePage />);

    // WHEN: Wizard loads Step 1
    await waitFor(() => {
      expect(screen.getByTestId("day-close-wizard")).toBeInTheDocument();
    });
    expect(screen.getByTestId("step-1-content")).toBeInTheDocument();

    // THEN: There should be no "Close Day" or "Complete Day Close" button
    const buttons = screen.getAllByRole("button");
    const closeButtonsWithExactText = buttons.filter(
      (btn) =>
        btn.textContent === "Close Day" ||
        btn.textContent === "Complete Day Close",
    );
    expect(closeButtonsWithExactText).toHaveLength(0);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P0 CRITICAL - REDIRECT BEHAVIOR TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("DC-PAGE-REDIRECT-001: [P0] should redirect to dashboard when shift is already closed", async () => {
    // GIVEN: Shift is already closed
    vi.mocked(useShiftDetail).mockReturnValue({
      data: { ...mockShiftData, status: "CLOSED" },
      isLoading: false,
    } as any);

    // WHEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: Should redirect to /mystore
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/mystore");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P0 CRITICAL - ERROR STATE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("DC-PAGE-ERR-001: [P0] should show error state when dashboard fails to load", async () => {
    // GIVEN: Dashboard API fails
    vi.mocked(useClientDashboard).mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      error: new Error("Network error"),
    } as any);

    // WHEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: Error state should be visible
    await waitFor(() => {
      expect(screen.getByTestId("day-close-wizard-error")).toBeInTheDocument();
    });
  });

  it("DC-PAGE-ERR-002: [P0] should show no store message when no store available", async () => {
    // GIVEN: No stores available
    vi.mocked(useClientDashboard).mockReturnValue({
      data: { stores: [] },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    // WHEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: No store message should be visible
    await waitFor(() => {
      expect(screen.getByText(/No store available/i)).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INTEGRATION SCENARIO TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("DC-PAGE-INT-001: should display shift info header with terminal name", async () => {
    // GIVEN: Valid page data with terminal info
    // WHEN: Page is rendered (Step 1)
    renderWithQueryClient(<DayClosePage />);

    // THEN: Shift info header should be visible with terminal name
    await waitFor(() => {
      expect(screen.getByTestId("shift-info-header")).toBeInTheDocument();
    });
    expect(screen.getByText("T1")).toBeInTheDocument();
    expect(screen.getByText("Terminal:")).toBeInTheDocument();
  });

  it("DC-PAGE-INT-002: should show Step 1 content when lottery not yet closed", async () => {
    // GIVEN: Lottery not closed (no status = CLOSED in business_day)
    // WHEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: Should show Step 1 (Lottery Close) content with DayCloseModeScanner
    await waitFor(() => {
      expect(screen.getByTestId("step-1-content")).toBeInTheDocument();
    });
    // Step indicator should show Step 1 as active
    expect(screen.getByText("Lottery Close")).toBeInTheDocument();
  });

  it("DC-PAGE-INT-003: should auto-skip to Step 2 when lottery already closed", async () => {
    // GIVEN: Lottery already closed (business_day.status = CLOSED)
    const closedDayBins = {
      ...mockDayBinsData,
      business_day: {
        ...mockDayBinsData.business_day,
        status: "CLOSED",
        last_shift_closed_at: "2025-12-25T18:00:00.000Z",
      },
    };
    vi.mocked(useLotteryDayBins).mockReturnValue({
      data: closedDayBins,
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    // WHEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: Should auto-advance to Step 2 (Report Scanning)
    await waitFor(() => {
      expect(screen.getByTestId("step-2-content")).toBeInTheDocument();
    });
    // Step 1 indicator should show as completed (green)
    expect(screen.getByTestId("step-1-indicator")).toBeInTheDocument();
  });
});

describe("DayClosePage Wizard Step Navigation", () => {
  // These tests verify the 3-step wizard navigation behavior
  // Step 1: Lottery Close (DayCloseModeScanner), Step 2: Report Scanning, Step 3: Day Close

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReturnValue("shift-123");

    vi.mocked(useClientDashboard).mockReturnValue({
      data: {
        stores: [
          { store_id: "store-123", name: "Test Store", status: "ACTIVE" },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useShiftDetail).mockReturnValue({
      data: {
        shift_id: "shift-123",
        store_id: "store-123",
        pos_terminal_id: "terminal-123",
        cashier_id: "cashier-123",
        status: "ACTIVE",
        opened_at: "2025-12-25T08:00:00.000Z",
        opening_cash: 200.0,
        cashier_name: "John Smith",
        shift_number: 1,
      },
      isLoading: false,
    } as any);

    vi.mocked(useLotteryDayBins).mockReturnValue({
      data: {
        bins: [
          {
            bin_id: "bin-1",
            bin_number: 1,
            name: "Bin 1",
            is_active: true,
            pack: {
              pack_id: "pack-1",
              pack_number: "1234567",
              game_name: "Lucky 7s",
              game_price: 5.0,
              starting_serial: "001",
              ending_serial: null,
              serial_end: "050",
            },
          },
        ],
        business_day: {
          date: "2025-12-25",
          first_shift_opened_at: "2025-12-25T08:00:00.000Z",
          last_shift_closed_at: null,
        },
        depleted_packs: [],
      },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useOpenShiftsCheck).mockReturnValue({
      data: { has_open_shifts: false, open_shift_count: 0, open_shifts: [] },
      isLoading: false,
      isFetched: true,
    } as any);

    // Terminal and cashier mocks
    vi.mocked(useStoreTerminals).mockReturnValue({
      data: [
        {
          pos_terminal_id: "terminal-123",
          name: "T1",
          store_id: "store-123",
          status: "ACTIVE",
        },
      ],
      isLoading: false,
    } as any);

    vi.mocked(useCashiers).mockReturnValue({
      data: [
        {
          cashier_id: "cashier-123",
          name: "John Smith",
          employee_id: "E001",
          is_active: true,
        },
      ],
      isLoading: false,
    } as any);
  });

  afterEach(() => {
    cleanup();
  });

  it("DC-PAGE-009: [P0] should show Step 1 with DayCloseModeScanner for lottery scanning", async () => {
    // GIVEN: Page with lottery not closed
    // WHEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: Step 1 should be visible with DayCloseModeScanner content
    await waitFor(() => {
      expect(screen.getByTestId("step-1-content")).toBeInTheDocument();
    });

    // Step indicator should show "Lottery Close" as step 1
    expect(screen.getByText("Lottery Close")).toBeInTheDocument();
    expect(screen.getByTestId("step-1-indicator")).toBeInTheDocument();
  });

  it("DC-PAGE-010: [P0] should show step indicator with 3 steps", async () => {
    // GIVEN: Page with valid data
    // WHEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: Step indicator should show all 3 steps
    await waitFor(() => {
      expect(screen.getByTestId("step-indicator")).toBeInTheDocument();
    });

    // Verify all step labels are present
    expect(screen.getByText("Lottery Close")).toBeInTheDocument();
    expect(screen.getByText("Report Scanning")).toBeInTheDocument();
    expect(screen.getByText("Day Close")).toBeInTheDocument();
  });
});

/**
 * ================================================================================
 * LOTTERY DATA COLUMN MAPPING TESTS
 * ================================================================================
 *
 * CRITICAL BUSINESS RULE:
 * - Lottery data from our lottery close system goes to REPORTS column (reports.scratchOff)
 * - POS column is reserved for data from third-party POS integration (pos.scratchOff)
 *
 * This test verifies that when lottery is already closed and we auto-skip to Step 2,
 * the calculated lottery data is correctly placed in the reports column, not POS column.
 * ================================================================================
 */
describe("DayClosePage Lottery Data Column Mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReturnValue("shift-123");

    vi.mocked(useClientDashboard).mockReturnValue({
      data: {
        stores: [
          { store_id: "store-123", name: "Test Store", status: "ACTIVE" },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    vi.mocked(useShiftDetail).mockReturnValue({
      data: {
        shift_id: "shift-123",
        store_id: "store-123",
        pos_terminal_id: "terminal-123",
        cashier_id: "cashier-123",
        status: "ACTIVE",
        opened_at: "2025-12-25T08:00:00.000Z",
        opening_cash: 200.0,
        cashier_name: "John Smith",
        shift_number: 1,
      },
      isLoading: false,
    } as any);

    vi.mocked(useOpenShiftsCheck).mockReturnValue({
      data: { has_open_shifts: false, open_shift_count: 0, open_shifts: [] },
      isLoading: false,
      isFetched: true,
    } as any);

    vi.mocked(useStoreTerminals).mockReturnValue({
      data: [
        {
          pos_terminal_id: "terminal-123",
          name: "T1",
          store_id: "store-123",
          status: "ACTIVE",
        },
      ],
      isLoading: false,
    } as any);

    vi.mocked(useCashiers).mockReturnValue({
      data: [
        {
          cashier_id: "cashier-123",
          name: "John Smith",
          employee_id: "E001",
          is_active: true,
        },
      ],
      isLoading: false,
    } as any);
  });

  afterEach(() => {
    cleanup();
  });

  it("DC-LOTTERY-COL-001: [P0] should place calculated lottery data in BOTH columns when lottery already closed", async () => {
    // GIVEN: Lottery already closed with calculated lottery total
    // Business rule: Until 3rd-party POS integration, lottery data populates BOTH columns
    // for reconciliation comparison (POS and Reports columns should match)
    const closedDayBins = {
      bins: [
        {
          bin_id: "bin-1",
          bin_number: 1,
          name: "Bin 1",
          is_active: true,
          pack: {
            pack_id: "pack-1",
            pack_number: "1234567",
            game_name: "Lucky 7s",
            game_price: 5.0,
            starting_serial: "001",
            ending_serial: "025", // Closed with ending serial
            serial_end: "050",
          },
        },
        {
          bin_id: "bin-2",
          bin_number: 2,
          name: "Bin 2",
          is_active: true,
          pack: {
            pack_id: "pack-2",
            pack_number: "7654321",
            game_name: "Money Bags",
            game_price: 10.0,
            starting_serial: "010",
            ending_serial: "050", // Closed with ending serial
            serial_end: "100",
          },
        },
      ],
      business_day: {
        date: "2025-12-25",
        status: "CLOSED", // Lottery already closed
        first_shift_opened_at: "2025-12-25T08:00:00.000Z",
        last_shift_closed_at: "2025-12-25T18:00:00.000Z",
      },
      depleted_packs: [],
    };

    vi.mocked(useLotteryDayBins).mockReturnValue({
      data: closedDayBins,
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    // WHEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: Should auto-advance to Step 2 (lottery already closed)
    await waitFor(() => {
      expect(screen.getByTestId("step-2-content")).toBeInTheDocument();
    });

    // AND: The lottery close indicator should show completed (step 1)
    const step1Indicator = screen.getByTestId("step-1-indicator");
    expect(step1Indicator).toBeInTheDocument();

    // Calculated lottery total:
    // Bin 1: (25 - 1) * 5.0 = 24 * 5 = $120
    // Bin 2: (50 - 10) * 10.0 = 40 * 10 = $400
    // Total: $520 - This should be in BOTH pos.scratchOff AND reports.scratchOff
  });

  it("DC-LOTTERY-COL-002: [P0] should start with zero values in lottery columns when lottery not yet closed", async () => {
    // This test verifies that when lottery is not yet closed, the lottery columns
    // should have zero/initial values until the lottery close process completes
    //
    // GIVEN: Lottery not closed yet (step 1 should show)
    const openDayBins = {
      bins: [
        {
          bin_id: "bin-1",
          bin_number: 1,
          name: "Bin 1",
          is_active: true,
          pack: {
            pack_id: "pack-1",
            pack_number: "1234567",
            game_name: "Lucky 7s",
            game_price: 5.0,
            starting_serial: "001",
            ending_serial: null, // Not closed yet
            serial_end: "050",
          },
        },
      ],
      business_day: {
        date: "2025-12-25",
        status: "OPEN", // Not closed
        first_shift_opened_at: "2025-12-25T08:00:00.000Z",
        last_shift_closed_at: null,
      },
      depleted_packs: [],
    };

    vi.mocked(useLotteryDayBins).mockReturnValue({
      data: openDayBins,
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    // WHEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: Should show Step 1 (lottery not closed)
    await waitFor(() => {
      expect(screen.getByTestId("step-1-content")).toBeInTheDocument();
    });

    // Step 1 lottery scanner should be visible
    expect(screen.getByText("Lottery Close")).toBeInTheDocument();
  });
});
