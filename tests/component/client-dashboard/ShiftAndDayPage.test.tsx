/**
 * @test-level Component
 * @justification Component tests for ShiftAndDayPage - validates page title, Start Shift button, and dialog integration
 * @story 4-8-cashier-shift-start-flow
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../support/test-utils";
import ShiftAndDayPage from "@/app/(client-dashboard)/client-dashboard/shift-and-day/page";
import * as clientDashboardApi from "@/lib/api/client-dashboard";
import userEvent from "@testing-library/user-event";

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/client-dashboard/shift-and-day",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock ClientAuthContext
const mockUseClientAuth = vi.fn();
vi.mock("@/contexts/ClientAuthContext", () => ({
  useClientAuth: () => mockUseClientAuth(),
}));

// Mock client dashboard API
vi.mock("@/lib/api/client-dashboard", () => ({
  useClientDashboard: vi.fn(),
}));

// Mock CashierShiftStartDialog
vi.mock("@/components/shifts/CashierShiftStartDialog", () => ({
  CashierShiftStartDialog: ({
    open,
    storeId,
  }: {
    open: boolean;
    storeId: string;
  }) => {
    if (!open) return null;
    return (
      <div data-testid="cashier-shift-start-dialog">
        Shift Start Dialog for store: {storeId}
      </div>
    );
  },
}));

describe("4.8-COMPONENT: ShiftAndDayPage Component", () => {
  const mockStoreId = "550e8400-e29b-41d4-a716-446655440000";

  const mockDashboardData = {
    user: {
      id: "550e8400-e29b-41d4-a716-446655440001",
      email: "cashier@example.com",
      name: "Test Cashier",
    },
    companies: [],
    stores: [
      {
        store_id: mockStoreId,
        name: "Test Store",
        status: "ACTIVE",
      },
    ],
    stats: {
      total_companies: 0,
      total_stores: 1,
      active_stores: 1,
      total_employees: 0,
      today_transactions: 0,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseClientAuth.mockReturnValue({
      user: {
        id: "550e8400-e29b-41d4-a716-446655440001",
        email: "cashier@example.com",
        name: "Test Cashier",
      },
      permissions: [],
      isLoading: false,
      isAuthenticated: true,
      isClientUser: true,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });
    vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue({
      data: mockDashboardData,
      isLoading: false,
      isError: false,
      error: null,
    } as any);
  });

  it("[P0] 4.8-COMPONENT-030: should display 'Shift and Day' as page title", () => {
    // GIVEN: ShiftAndDayPage is rendered
    renderWithProviders(<ShiftAndDayPage />);

    // THEN: Page title should be "Shift and Day"
    expect(screen.getByText("Shift and Day")).toBeInTheDocument();
    const heading = screen.getByRole("heading", { name: /shift and day/i });
    expect(heading).toBeInTheDocument();
    expect(heading.tagName).toBe("H1");
  });

  it("[P0] 4.8-COMPONENT-031: should display 'Start Shift' button visible to all users", () => {
    // GIVEN: ShiftAndDayPage is rendered (user has no special permissions)
    renderWithProviders(<ShiftAndDayPage />);

    // THEN: "Start Shift" button should be visible (no permission check)
    expect(screen.getByTestId("start-shift-button")).toBeInTheDocument();
    expect(screen.getByText(/start shift/i)).toBeInTheDocument();
  });

  it("[P1] 4.8-COMPONENT-032: should open CashierShiftStartDialog when 'Start Shift' button is clicked", async () => {
    // GIVEN: ShiftAndDayPage is rendered
    const user = userEvent.setup();
    renderWithProviders(<ShiftAndDayPage />);

    // WHEN: "Start Shift" button is clicked
    const startShiftButton = screen.getByTestId("start-shift-button");
    await user.click(startShiftButton);

    // THEN: CashierShiftStartDialog should open
    await waitFor(() => {
      expect(
        screen.getByTestId("cashier-shift-start-dialog"),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(`Shift Start Dialog for store: ${mockStoreId}`),
    ).toBeInTheDocument();
  });

  it("[P1] 4.8-COMPONENT-033: should disable 'Start Shift' button when no store is available", () => {
    // GIVEN: No stores are available
    vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue({
      data: {
        ...mockDashboardData,
        stores: [],
      },
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    renderWithProviders(<ShiftAndDayPage />);

    // THEN: "Start Shift" button should be disabled
    const startShiftButton = screen.getByTestId("start-shift-button");
    expect(startShiftButton).toBeDisabled();
  });

  it("[P1] 4.8-COMPONENT-034: should disable 'Start Shift' button when data is loading", () => {
    // GIVEN: Dashboard data is loading
    vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as any);

    renderWithProviders(<ShiftAndDayPage />);

    // THEN: "Start Shift" button should be disabled
    const startShiftButton = screen.getByTestId("start-shift-button");
    expect(startShiftButton).toBeDisabled();
  });

  it("[P1] 4.8-COMPONENT-035: should display page description", () => {
    // GIVEN: ShiftAndDayPage is rendered
    renderWithProviders(<ShiftAndDayPage />);

    // THEN: Page description should be visible
    expect(
      screen.getByText(
        /view day reconciliations, daily summaries, and shift totals/i,
      ),
    ).toBeInTheDocument();
  });
});
