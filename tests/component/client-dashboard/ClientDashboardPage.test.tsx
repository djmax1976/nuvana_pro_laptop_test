/**
 * @test-level Component
 * @justification Component tests for ClientDashboardPage - validates "Start Shift" button display, permission checks, and dialog opening
 * @story 4-8-cashier-shift-start-flow
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../support/test-utils";
import ClientDashboardPage from "@/app/(client-dashboard)/client-dashboard/page";
import * as clientDashboardApi from "@/lib/api/client-dashboard";
import * as shiftsApi from "@/lib/api/shifts";
import * as storesApi from "@/lib/api/stores";
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
  usePathname: () => "/client-dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock ClientAuthContext
const mockUser = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  email: "cashier@example.com",
  name: "Test Cashier",
  is_client_user: true,
};

const mockUseClientAuth = vi.fn();
vi.mock("@/contexts/ClientAuthContext", () => ({
  useClientAuth: () => mockUseClientAuth(),
}));

// Mock API hooks
vi.mock("@/lib/api/client-dashboard", () => ({
  useClientDashboard: vi.fn(),
}));

vi.mock("@/lib/api/shifts", () => ({
  useOpenShift: vi.fn(),
  useInvalidateShifts: vi.fn(),
}));

vi.mock("@/lib/api/stores", () => ({
  useStoreTerminals: vi.fn(),
}));

// Mock toast hook
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: (...args: any[]) => mockToast(...args),
  }),
}));

describe("4.8-COMPONENT: ClientDashboardPage Component", () => {
  const mockStoreId = "550e8400-e29b-41d4-a716-446655440000";

  const mockDashboardData = {
    user: mockUser,
    companies: [
      {
        company_id: "550e8400-e29b-41d4-a716-446655440010",
        name: "Test Company",
        address: "123 Test St",
        status: "ACTIVE",
        store_count: 1,
      },
    ],
    stores: [
      {
        store_id: mockStoreId,
        name: "Test Store",
        company_id: "550e8400-e29b-41d4-a716-446655440010",
        company_name: "Test Company",
        status: "ACTIVE",
        location_json: { address: "123 Test St" },
      },
    ],
    stats: {
      total_companies: 1,
      total_stores: 1,
      active_stores: 1,
      total_employees: 5,
      today_transactions: 10,
    },
  };

  const mockQuery = {
    data: mockDashboardData,
    isLoading: false,
    isError: false,
    error: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockToast.mockClear();
    mockUseClientAuth.mockReturnValue({
      user: mockUser,
      permissions: [],
      isLoading: false,
      isAuthenticated: true,
      isClientUser: true,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });
    vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue(
      mockQuery as any,
    );
    vi.mocked(shiftsApi.useInvalidateShifts).mockReturnValue({
      invalidateList: vi.fn(),
      invalidateDetail: vi.fn(),
      invalidateAll: vi.fn(),
    } as any);
    vi.mocked(shiftsApi.useOpenShift).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    } as any);
  });

  it("[P0] 4.8-COMPONENT-018: should display 'Start Shift' button for users with SHIFT_OPEN permission", () => {
    // GIVEN: User has SHIFT_OPEN permission
    mockUseClientAuth.mockReturnValue({
      user: mockUser,
      permissions: ["SHIFT_OPEN"],
      isLoading: false,
      isAuthenticated: true,
      isClientUser: true,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    renderWithProviders(<ClientDashboardPage />);

    // THEN: "Start Shift" button should be visible
    expect(screen.getByTestId("start-shift-button")).toBeInTheDocument();
    expect(screen.getByText(/start shift/i)).toBeInTheDocument();
  });

  it("[P0] 4.8-COMPONENT-019: should NOT display 'Start Shift' button for users without SHIFT_OPEN permission", () => {
    // GIVEN: User does NOT have SHIFT_OPEN permission
    mockUseClientAuth.mockReturnValue({
      user: mockUser,
      permissions: [], // No SHIFT_OPEN permission
      isLoading: false,
      isAuthenticated: true,
      isClientUser: true,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    renderWithProviders(<ClientDashboardPage />);

    // THEN: "Start Shift" button should NOT be visible
    expect(screen.queryByTestId("start-shift-button")).not.toBeInTheDocument();
  });

  it("[P0] 4.8-COMPONENT-020: should display both 'Start Shift' and 'Open Shift' buttons for Store Managers", () => {
    // GIVEN: User has both SHIFT_OPEN and SHIFT_MANAGE permissions (Store Manager)
    mockUseClientAuth.mockReturnValue({
      user: mockUser,
      permissions: ["SHIFT_OPEN", "SHIFT_MANAGE"],
      isLoading: false,
      isAuthenticated: true,
      isClientUser: true,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    renderWithProviders(<ClientDashboardPage />);

    // THEN: Both buttons should be visible
    expect(screen.getByTestId("start-shift-button")).toBeInTheDocument();
    expect(screen.getByTestId("open-shift-button")).toBeInTheDocument();
    expect(screen.getByText(/start shift/i)).toBeInTheDocument();
    expect(screen.getByText(/open shift/i)).toBeInTheDocument();
  });

  it("[P0] 4.8-COMPONENT-021: should open CashierShiftStartDialog when 'Start Shift' button is clicked", async () => {
    // GIVEN: User has SHIFT_OPEN permission and clicks "Start Shift"
    const user = userEvent.setup();
    mockUseClientAuth.mockReturnValue({
      user: mockUser,
      permissions: ["SHIFT_OPEN"],
      isLoading: false,
      isAuthenticated: true,
      isClientUser: true,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    // Mock terminal query
    vi.mocked(storesApi.useStoreTerminals).mockReturnValue({
      data: [
        {
          pos_terminal_id: "550e8400-e29b-41d4-a716-446655440011",
          name: "Terminal 1",
          has_active_shift: false,
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    renderWithProviders(<ClientDashboardPage />);

    // WHEN: "Start Shift" button is clicked
    const startShiftButton = screen.getByTestId("start-shift-button");
    await user.click(startShiftButton);

    // THEN: CashierShiftStartDialog should open
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /start shift/i }),
      ).toBeInTheDocument();
      expect(screen.getByTestId("terminal-select")).toBeInTheDocument();
    });
  });

  it("[P0] 4.8-COMPONENT-022: should disable 'Start Shift' button when no store is available", () => {
    // GIVEN: User has SHIFT_OPEN permission but no stores
    mockUseClientAuth.mockReturnValue({
      user: mockUser,
      permissions: ["SHIFT_OPEN"],
      isLoading: false,
      isAuthenticated: true,
      isClientUser: true,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue({
      ...mockQuery,
      data: {
        ...mockDashboardData,
        stores: [], // No stores
      },
    } as any);

    renderWithProviders(<ClientDashboardPage />);

    // THEN: "Start Shift" button should be disabled
    const startShiftButton = screen.getByTestId("start-shift-button");
    expect(startShiftButton).toBeDisabled();
  });

  it("[P1] 4.8-COMPONENT-023: should link 'Open Shift' button to /client-dashboard/shifts", () => {
    // GIVEN: User has SHIFT_MANAGE permission
    mockUseClientAuth.mockReturnValue({
      user: mockUser,
      permissions: ["SHIFT_OPEN", "SHIFT_MANAGE"],
      isLoading: false,
      isAuthenticated: true,
      isClientUser: true,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    renderWithProviders(<ClientDashboardPage />);

    // THEN: "Open Shift" button should link to shifts page
    const openShiftButton = screen.getByTestId("open-shift-button");
    expect(openShiftButton).toBeInTheDocument();
    expect(openShiftButton.closest("a")).toHaveAttribute(
      "href",
      "/client-dashboard/shifts",
    );
  });
});
