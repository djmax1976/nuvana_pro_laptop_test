/**
 * @test-level COMPONENT
 * @justification Tests Day Close Page Header UI behavior without backend dependencies
 * @story Day Close Header Display - Terminal Name and Shift Info
 * @priority P0 (Critical - UI Header)
 *
 * Day Close Page Header Component Tests
 *
 * Tests the header section of the day close wizard including:
 * - Terminal name display (matching shift page format)
 * - Shift number display
 * - Cashier name, started time, opening cash card
 * - Fallback behavior when data is missing
 *
 * ================================================================================
 * TRACEABILITY MATRIX
 * ================================================================================
 *
 * | Test ID              | Requirement                          | Component/Feature              | Priority |
 * |----------------------|--------------------------------------|--------------------------------|----------|
 * | DC-HDR-001           | FE-002: Terminal name in header       | DayClosePage Header            | P0       |
 * | DC-HDR-002           | FE-002: Shift number in header        | DayClosePage Header            | P0       |
 * | DC-HDR-003           | FE-002: Cashier name in header        | DayClosePage Header            | P0       |
 * | DC-HDR-004           | FE-002: Start time in header          | DayClosePage Header            | P0       |
 * | DC-HDR-005           | FE-002: Opening cash in header        | DayClosePage Header            | P0       |
 * | DC-HDR-006           | FE-002: Terminal loading state        | DayClosePage Header            | P1       |
 * | DC-HDR-007           | FE-002: Cashier loading state         | DayClosePage Header            | P1       |
 * | DC-HDR-008           | FE-002: Terminal fallback display     | DayClosePage Header            | P1       |
 * | DC-HDR-009           | FE-002: Cashier fallback display      | DayClosePage Header            | P1       |
 * | DC-HDR-010           | FE-002: Shift number null handling    | DayClosePage Header            | P1       |
 * | DC-HDR-011           | FE-002: Currency formatting           | DayClosePage Header            | P0       |
 * | DC-HDR-012           | SEC-001: No sensitive data exposed    | DayClosePage Header            | P0       |
 *
 * REQUIREMENT COVERAGE:
 * - Form Validation (FE-002): 10 tests
 * - Security (SEC-001): 1 test
 * - Edge Cases: 3 tests
 * ================================================================================
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
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

// Mock lottery API
vi.mock("@/lib/api/lottery", () => ({
  commitLotteryDayClose: vi.fn(),
  cancelLotteryDayClose: vi.fn(),
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

describe("DayClosePage Header Tests", () => {
  // ============ MOCK DATA ============
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
    {
      pos_terminal_id: "terminal-456",
      name: "T2",
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
      status: "OPEN",
    },
    depleted_packs: [],
  };

  const mockOpenShiftsNone = {
    has_open_shifts: false,
    open_shift_count: 0,
    open_shifts: [],
  };

  // ============ SETUP ============
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

    vi.mocked(useOpenShiftsCheck).mockReturnValue({
      data: mockOpenShiftsNone,
      isLoading: false,
      isFetched: true,
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
  // P0 CRITICAL - HEADER DISPLAY TESTS
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
    // GIVEN: Shift data with shift_number = 1
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
      expect(screen.getByText("Cashier:")).toBeInTheDocument();
    });
    expect(screen.getByText("John Smith")).toBeInTheDocument();
  });

  it("DC-HDR-004: [P0] should display shift start time in shift info card", async () => {
    // GIVEN: Shift data with opened_at
    // WHEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: Start time should be visible with proper formatting
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

  it("DC-HDR-011: [P0] should format currency correctly for different amounts", async () => {
    // GIVEN: Shift data with specific opening_cash
    const shiftWithDifferentCash = { ...mockShiftData, opening_cash: 1234.56 };
    vi.mocked(useShiftDetail).mockReturnValue({
      data: shiftWithDifferentCash,
      isLoading: false,
    } as any);

    // WHEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: Opening cash should be properly formatted with commas
    await waitFor(() => {
      expect(screen.getByText("$1,234.56")).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P1 IMPORTANT - LOADING STATE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════════
  // P1 IMPORTANT - FALLBACK DISPLAY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("DC-HDR-008: [P1] should display 'Terminal' as fallback when terminal not found", async () => {
    // GIVEN: Terminal not found in list
    vi.mocked(useStoreTerminals).mockReturnValue({
      data: [], // Empty list - terminal won't be found
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
      data: [], // Empty list - cashier won't be found
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

    // THEN: Terminal name should be visible but not shift label
    await waitFor(() => {
      expect(screen.getByText("T1")).toBeInTheDocument();
    });
    expect(screen.queryByText("Shift:")).not.toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P0 CRITICAL - SECURITY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("DC-HDR-012: [P0] SEC-001: should not expose sensitive data in header", async () => {
    // GIVEN: Page is rendered with mock data
    renderWithQueryClient(<DayClosePage />);

    // THEN: No sensitive data should be visible
    await waitFor(() => {
      expect(screen.getByText("T1")).toBeInTheDocument();
    });

    // Verify no UUIDs are fully visible in header area
    // (shift_id, store_id, etc. should not be displayed)
    const pageContent = document.body.textContent || "";
    expect(pageContent).not.toContain("shift-123"); // Full shift ID should not be visible
    expect(pageContent).not.toContain("store-123"); // Full store ID should not be visible
    expect(pageContent).not.toContain("terminal-123"); // Full terminal ID should not be visible
    expect(pageContent).not.toContain("cashier-123"); // Full cashier ID should not be visible
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("DC-HDR-EDGE-001: should prefer cashier_name from shift data over lookup", async () => {
    // GIVEN: Shift has cashier_name but cashiers list has different name
    const shiftWithCashierName = {
      ...mockShiftData,
      cashier_name: "From Shift Data",
    };
    vi.mocked(useShiftDetail).mockReturnValue({
      data: shiftWithCashierName,
      isLoading: false,
    } as any);
    vi.mocked(useCashiers).mockReturnValue({
      data: [
        {
          cashier_id: "cashier-123",
          name: "From Cashier List",
          is_active: true,
        },
      ],
      isLoading: false,
    } as any);

    // WHEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: Should show name from shift data (preferred source)
    await waitFor(() => {
      expect(screen.getByText("From Shift Data")).toBeInTheDocument();
    });
    expect(screen.queryByText("From Cashier List")).not.toBeInTheDocument();
  });

  it("DC-HDR-EDGE-002: should fallback to cashier lookup when shift cashier_name is undefined", async () => {
    // GIVEN: Shift has no cashier_name but cashiers list has the cashier
    const shiftWithoutCashierName = {
      ...mockShiftData,
      cashier_name: undefined,
    };
    vi.mocked(useShiftDetail).mockReturnValue({
      data: shiftWithoutCashierName,
      isLoading: false,
    } as any);
    vi.mocked(useCashiers).mockReturnValue({
      data: mockCashiers,
      isLoading: false,
    } as any);

    // WHEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: Should show name from cashier lookup
    await waitFor(() => {
      expect(screen.getByText("John Smith")).toBeInTheDocument();
    });
  });

  it("DC-HDR-EDGE-003: should handle zero opening cash correctly", async () => {
    // GIVEN: Shift has opening_cash = 0
    const shiftWithZeroCash = { ...mockShiftData, opening_cash: 0 };
    vi.mocked(useShiftDetail).mockReturnValue({
      data: shiftWithZeroCash,
      isLoading: false,
    } as any);

    // WHEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: Should display $0.00 properly formatted
    await waitFor(() => {
      expect(screen.getByText("$0.00")).toBeInTheDocument();
    });
  });
});

describe("DayClosePage Header - Wizard Integration", () => {
  // Tests verifying the header integrates properly with the wizard steps

  const mockDashboardData = {
    stores: [{ store_id: "store-123", name: "Test Store", status: "ACTIVE" }],
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
    business_day: { date: "2025-12-25", status: "OPEN" },
    depleted_packs: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReturnValue("shift-123");

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
      data: { has_open_shifts: false, open_shift_count: 0, open_shifts: [] },
      isLoading: false,
      isFetched: true,
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

  it("DC-HDR-WIZ-001: should display header above step indicator", async () => {
    // GIVEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: Both header card and step indicator should be visible
    await waitFor(() => {
      expect(screen.getByTestId("shift-info-header")).toBeInTheDocument();
    });
    expect(screen.getByTestId("step-indicator")).toBeInTheDocument();
  });

  it("DC-HDR-WIZ-002: should display wizard data-testid", async () => {
    // GIVEN: Page is rendered
    renderWithQueryClient(<DayClosePage />);

    // THEN: Wizard container should have correct data-testid
    await waitFor(() => {
      expect(screen.getByTestId("day-close-wizard")).toBeInTheDocument();
    });
  });
});
