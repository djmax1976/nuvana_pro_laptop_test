/**
 * @test-level Component
 * @justification Component tests for ClientDashboardPage - validates dashboard display and data loading
 * @story 4-8-cashier-shift-start-flow
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen } from "../../support/test-utils";
import ClientDashboardPage from "@/app/(client-dashboard)/client-dashboard/page";
import * as clientDashboardApi from "@/lib/api/client-dashboard";

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
  email: "owner@test.com",
  name: "Test Owner",
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
  });

  it("[P0] should display welcome message with user name", () => {
    // GIVEN: User is logged in
    renderWithProviders(<ClientDashboardPage />);

    // THEN: Welcome message should include user name
    expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
    expect(screen.getByText(/Test Owner/i)).toBeInTheDocument();
  });

  it("[P0] should display dashboard stats", () => {
    // GIVEN: Dashboard data is loaded
    renderWithProviders(<ClientDashboardPage />);

    // THEN: Stats should be displayed
    expect(screen.getByTestId("stat-active-stores")).toBeInTheDocument();
    expect(screen.getByTestId("stat-total-employees")).toBeInTheDocument();
    expect(screen.getByTestId("stat-companies")).toBeInTheDocument();
    expect(screen.getByTestId("stat-activity")).toBeInTheDocument();
  });

  it("[P0] should display companies section", () => {
    // GIVEN: Dashboard data with companies is loaded
    renderWithProviders(<ClientDashboardPage />);

    // THEN: Companies section should be displayed with company name
    const companiesSection = screen.getByTestId("companies-section");
    expect(companiesSection).toBeInTheDocument();
    expect(screen.getAllByText("Test Company").length).toBeGreaterThan(0);
  });

  it("[P0] should display stores section", () => {
    // GIVEN: Dashboard data with stores is loaded
    renderWithProviders(<ClientDashboardPage />);

    // THEN: Stores section should be displayed with store name
    expect(screen.getByTestId("stores-section")).toBeInTheDocument();
    expect(screen.getByText("Test Store")).toBeInTheDocument();
  });

  it("[P1] should show loading state when data is loading", () => {
    // GIVEN: Dashboard data is loading
    vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as any);

    renderWithProviders(<ClientDashboardPage />);

    // THEN: Loading message should be displayed
    expect(screen.getByText(/loading your dashboard/i)).toBeInTheDocument();
  });

  it("[P1] should show error state when data fails to load", () => {
    // GIVEN: Dashboard data failed to load
    vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { message: "Network error" },
    } as any);

    renderWithProviders(<ClientDashboardPage />);

    // THEN: Error message should be displayed
    expect(screen.getByText(/failed to load dashboard/i)).toBeInTheDocument();
  });

  it("[P1] should display empty state message when no companies exist", () => {
    // GIVEN: No companies exist
    vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue({
      ...mockQuery,
      data: {
        ...mockDashboardData,
        companies: [],
      },
    } as any);

    renderWithProviders(<ClientDashboardPage />);

    // THEN: Empty state message should be displayed
    expect(screen.getByText(/no companies found/i)).toBeInTheDocument();
  });

  it("[P1] should display empty state message when no stores exist", () => {
    // GIVEN: No stores exist
    vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue({
      ...mockQuery,
      data: {
        ...mockDashboardData,
        stores: [],
      },
    } as any);

    renderWithProviders(<ClientDashboardPage />);

    // THEN: Empty state message should be displayed
    expect(screen.getByText(/no stores found/i)).toBeInTheDocument();
  });
});
