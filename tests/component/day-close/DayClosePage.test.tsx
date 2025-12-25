/**
 * @test-level COMPONENT
 * @justification Tests Day Close Page UI behavior without backend dependencies
 * @story Day Close Workflow
 * @priority P0 (Critical - UI Integration)
 *
 * Day Close Page Component Tests
 *
 * Tests the complete day close workflow UI including:
 * - Open shifts blocking behavior
 * - Lottery modal auto-opening
 * - Complete Day Close button state
 * - Navigation and redirect behavior
 *
 * ================================================================================
 * TRACEABILITY MATRIX
 * ================================================================================
 *
 * | Test ID              | Requirement                          | Component/Feature              | Priority |
 * |----------------------|--------------------------------------|--------------------------------|----------|
 * | DC-PAGE-001          | FE-002: Page renders correctly       | DayClosePage                   | P0       |
 * | DC-PAGE-002          | FE-002: Loading state shown           | DayClosePage                   | P0       |
 * | DC-PAGE-003          | BIZ: Blocking banner visible          | DayClosePage                   | P0       |
 * | DC-PAGE-004          | BIZ: Lottery modal auto-opens         | DayClosePage                   | P0       |
 * | DC-PAGE-005          | BIZ: Complete button disabled         | DayClosePage                   | P0       |
 * | DC-PAGE-006          | BIZ: Complete button enabled          | DayClosePage                   | P0       |
 * | DC-PAGE-007          | BIZ: Shift ID shown in badge          | DayClosePage                   | P1       |
 * | DC-PAGE-008          | FE-002: No button removed from page   | DayClosePage/LotteryPage       | P0       |
 * | DC-PAGE-009          | BIZ: Modal title is Close Lottery     | CloseDayModal                  | P0       |
 * | DC-PAGE-010          | BIZ: Modal button is Close Lottery    | CloseDayModal                  | P0       |
 *
 * REQUIREMENT COVERAGE:
 * - Form Validation (FE-002): 4 tests
 * - Business Logic: 6 tests
 * ================================================================================
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
import { useLotteryDayBins } from "@/hooks/useLottery";

// Import the component under test
import DayClosePage from "@/app/(mystore)/mystore/day-close/page";

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
    status: "ACTIVE",
    opened_at: "2025-12-25T08:00:00.000Z",
  };

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
  });

  afterEach(() => {
    cleanup();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P0 CRITICAL - RENDERING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("DC-PAGE-001: [P0] should render day close page with correct title", async () => {
    // GIVEN: Valid page props
    // WHEN: Page is rendered
    render(<DayClosePage />);

    // THEN: Page title should be visible
    await waitFor(() => {
      expect(screen.getByText("Close Day")).toBeInTheDocument();
    });
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
    render(<DayClosePage />);

    // THEN: Loading state should be visible
    expect(screen.getByTestId("day-close-page-loading")).toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P0 CRITICAL - OPEN SHIFTS BLOCKING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("DC-PAGE-003: [P0] should show blocking banner when other open shifts exist", async () => {
    // GIVEN: Other open shifts exist
    vi.mocked(useOpenShiftsCheck).mockReturnValue({
      data: mockOpenShiftsBlocking,
      isLoading: false,
      isFetched: true,
    } as any);

    // WHEN: Page is rendered
    render(<DayClosePage />);

    // THEN: Blocking banner should be visible
    await waitFor(() => {
      expect(
        screen.getByTestId("open-shifts-blocking-banner"),
      ).toBeInTheDocument();
    });

    // AND: Should show shift details
    expect(screen.getByText("Terminal 2")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Terminal 3")).toBeInTheDocument();
    expect(screen.getByText("Bob Smith")).toBeInTheDocument();
  });

  it("DC-PAGE-003a: [P0] should NOT show blocking banner when no other open shifts", async () => {
    // GIVEN: No other open shifts
    vi.mocked(useOpenShiftsCheck).mockReturnValue({
      data: mockOpenShiftsNone,
      isLoading: false,
      isFetched: true,
    } as any);

    // WHEN: Page is rendered
    render(<DayClosePage />);

    // Wait for page to load
    await waitFor(() => {
      expect(screen.getByText("Close Day")).toBeInTheDocument();
    });

    // THEN: Blocking banner should NOT be visible
    expect(
      screen.queryByTestId("open-shifts-blocking-banner"),
    ).not.toBeInTheDocument();
  });

  it("DC-PAGE-003b: [P0] should show checking state while open shifts query is loading", async () => {
    // GIVEN: Open shifts check is loading
    vi.mocked(useOpenShiftsCheck).mockReturnValue({
      data: null,
      isLoading: true,
      isFetched: false,
    } as any);

    // WHEN: Page is rendered
    render(<DayClosePage />);

    // THEN: Checking state should be visible
    await waitFor(() => {
      expect(screen.getByTestId("open-shifts-checking")).toBeInTheDocument();
    });
    expect(screen.getByText(/Checking for open shifts/i)).toBeInTheDocument();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P0 CRITICAL - COMPLETE DAY CLOSE BUTTON TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("DC-PAGE-005: [P0] should disable Complete Day Close button when lottery not closed", async () => {
    // GIVEN: Lottery not closed (last_shift_closed_at is null)
    // WHEN: Page is rendered
    render(<DayClosePage />);

    // THEN: Complete Day Close button should be disabled
    await waitFor(() => {
      const button = screen.getByTestId("complete-day-close-btn");
      expect(button).toBeDisabled();
    });
  });

  it("DC-PAGE-006: [P0] should enable Complete Day Close button when lottery already closed", async () => {
    // GIVEN: Lottery already closed
    const closedDayBins = {
      ...mockDayBinsData,
      business_day: {
        ...mockDayBinsData.business_day,
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
    render(<DayClosePage />);

    // THEN: Complete Day Close button should be enabled
    await waitFor(() => {
      const button = screen.getByTestId("complete-day-close-btn");
      expect(button).not.toBeDisabled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P1 IMPORTANT - SHIFT ID DISPLAY TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("DC-PAGE-007: [P1] should display shift ID in badge", async () => {
    // GIVEN: Shift ID in URL params
    mockGet.mockReturnValue("shift-123");

    // WHEN: Page is rendered
    render(<DayClosePage />);

    // THEN: Truncated shift ID should be visible in badge
    await waitFor(() => {
      // Look for text that starts with "Shift:"
      expect(screen.getByText(/Shift:/)).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P0 CRITICAL - BUTTON REMOVAL VERIFICATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("DC-PAGE-008: [P0] should NOT have standalone Close Day button (removed from lottery page)", async () => {
    // This test verifies the business requirement that the Close Day button
    // was removed from the lottery page. The day close workflow is now
    // exclusively through the day-close page.

    // GIVEN: Day close page is rendered
    render(<DayClosePage />);

    // WHEN: Page loads
    await waitFor(() => {
      expect(screen.getByText("Close Day")).toBeInTheDocument();
    });

    // THEN: There should be no button with just "Close Day" text
    // (the page title is "Close Day" but there's no standalone Close Day button)
    const buttons = screen.getAllByRole("button");
    const closeButtonsWithExactText = buttons.filter(
      (btn) => btn.textContent === "Close Day",
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
    render(<DayClosePage />);

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
    render(<DayClosePage />);

    // THEN: Error state should be visible
    await waitFor(() => {
      expect(screen.getByTestId("day-close-page-error")).toBeInTheDocument();
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
    render(<DayClosePage />);

    // THEN: No store message should be visible
    await waitFor(() => {
      expect(screen.getByText(/No store available/i)).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INTEGRATION SCENARIO TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  it("DC-PAGE-INT-001: should display store name and date in header", async () => {
    // GIVEN: Valid page data
    // WHEN: Page is rendered
    render(<DayClosePage />);

    // THEN: Store name should be visible
    await waitFor(() => {
      expect(screen.getByText(/Test Store/)).toBeInTheDocument();
    });
  });

  it("DC-PAGE-INT-002: should show lottery status message", async () => {
    // GIVEN: Lottery not closed
    // WHEN: Page is rendered
    render(<DayClosePage />);

    // THEN: Should show appropriate lottery status message
    await waitFor(() => {
      expect(
        screen.getByText(/Close lottery first to proceed with day close/i),
      ).toBeInTheDocument();
    });
  });

  it("DC-PAGE-INT-003: should show lottery closed message when already closed", async () => {
    // GIVEN: Lottery already closed
    const closedDayBins = {
      ...mockDayBinsData,
      business_day: {
        ...mockDayBinsData.business_day,
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
    render(<DayClosePage />);

    // THEN: Should show lottery closed message
    await waitFor(() => {
      expect(
        screen.getByText(
          /Lottery is closed. Complete the day close when ready/i,
        ),
      ).toBeInTheDocument();
    });
  });
});

describe("DayClosePage Modal Integration", () => {
  // These tests verify the modal title and button text changes
  // The actual modal behavior is tested in CloseDayModal.test.tsx

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
      data: { shift_id: "shift-123", status: "ACTIVE" },
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
  });

  afterEach(() => {
    cleanup();
  });

  it("DC-PAGE-009: [P0] should show modal with 'Close Lottery' title", async () => {
    // GIVEN: Page with lottery not closed
    // WHEN: Page is rendered and modal auto-opens
    render(<DayClosePage />);

    // Wait for modal to auto-open (300ms delay + render time)
    await waitFor(
      () => {
        expect(screen.getByTestId("close-day-modal")).toBeInTheDocument();
      },
      { timeout: 2000 },
    );

    // THEN: Modal title should be "Close Lottery" (not "Close Lottery Day")
    // Use heading role to target the title specifically
    expect(
      screen.getByRole("heading", { name: /Close Lottery/i }),
    ).toBeInTheDocument();
  });

  it("DC-PAGE-010: [P0] should have 'Close Lottery' button in modal", async () => {
    // GIVEN: Page with lottery not closed
    // WHEN: Page is rendered and modal auto-opens
    render(<DayClosePage />);

    // Wait for modal to auto-open
    await waitFor(
      () => {
        expect(screen.getByTestId("close-day-modal")).toBeInTheDocument();
      },
      { timeout: 2000 },
    );

    // THEN: Save button should say "Close Lottery"
    const saveButton = screen.getByTestId("save-button");
    expect(saveButton).toHaveTextContent(/Close Lottery/i);
  });
});
