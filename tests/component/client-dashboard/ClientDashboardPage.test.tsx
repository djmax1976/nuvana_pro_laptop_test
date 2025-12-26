/**
 * @test-level Component
 * @justification Tests for Client Owner Dashboard main page
 * @story Client Owner Dashboard - Landing Page
 *
 * ClientDashboardPage Component Tests
 *
 * CRITICAL TEST COVERAGE:
 * - Page structure and component composition
 * - Loading and error states
 * - KPI cards rendering
 * - All dashboard sections presence
 * - Accessibility (landmark regions, ARIA)
 *
 * Requirements Traceability Matrix:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ Test ID                    │ Requirement         │ Priority    │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ PAGE-001                   │ Page renders        │ P0          │
 * │ PAGE-002                   │ Loading state       │ P0          │
 * │ PAGE-003                   │ Error state         │ P0          │
 * │ PAGE-004                   │ KPI cards display   │ P0          │
 * │ PAGE-005                   │ All sections render │ P0          │
 * │ PAGE-006                   │ Accessibility       │ P0          │
 * └─────────────────────────────────────────────────────────────────┘
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

// Mock Recharts to avoid canvas issues
vi.mock("recharts", () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-line-chart">{children}</div>
  ),
  Line: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="mock-line">{children}</div>
  ),
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-area-chart">{children}</div>
  ),
  Area: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="mock-area">{children}</div>
  ),
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-pie-chart">{children}</div>
  ),
  Pie: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-pie">{children}</div>
  ),
  Cell: () => <div data-testid="mock-cell" />,
  XAxis: () => <div data-testid="mock-xaxis" />,
  YAxis: () => <div data-testid="mock-yaxis" />,
  CartesianGrid: () => <div data-testid="mock-grid" />,
  Tooltip: () => <div data-testid="mock-tooltip" />,
  Legend: () => <div data-testid="mock-legend" />,
  LabelList: () => <div data-testid="mock-label-list" />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-responsive-container">{children}</div>
  ),
}));

describe("CLIENT-DASHBOARD: ClientDashboardPage Component", () => {
  const mockDashboardData = {
    user: mockUser,
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

  // ============================================
  // LOADING STATE TESTS
  // ============================================
  describe("Loading State", () => {
    it("[P0] PAGE-002: should render loading skeleton when data is loading", () => {
      // GIVEN: Dashboard is loading
      vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
      } as any);

      renderWithProviders(<ClientDashboardPage />);

      // THEN: Page container is present
      expect(screen.getByTestId("client-dashboard-page")).toBeInTheDocument();

      // AND: Skeleton elements are rendered (multiple animate-pulse elements)
      const skeletons = document.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // ERROR STATE TESTS
  // ============================================
  describe("Error State", () => {
    it("[P0] PAGE-003: should render error message when loading fails", () => {
      // GIVEN: Dashboard loading failed
      vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: { message: "Network error" },
      } as any);

      renderWithProviders(<ClientDashboardPage />);

      // THEN: Error message is displayed
      expect(screen.getByText(/Failed to load dashboard/)).toBeInTheDocument();
      expect(screen.getByText(/Network error/)).toBeInTheDocument();
    });

    it("[P0] PAGE-003b: should handle unknown error", () => {
      // GIVEN: Dashboard loading failed with no message
      vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: null,
      } as any);

      renderWithProviders(<ClientDashboardPage />);

      // THEN: Generic error message is displayed
      expect(screen.getByText(/Unknown error/)).toBeInTheDocument();
    });
  });

  // ============================================
  // SUCCESS STATE TESTS
  // ============================================
  describe("Success State", () => {
    it("[P0] PAGE-001: should render dashboard page container", () => {
      // GIVEN: Dashboard loaded successfully
      renderWithProviders(<ClientDashboardPage />);

      // THEN: Page container is present
      expect(screen.getByTestId("client-dashboard-page")).toBeInTheDocument();
    });

    it("[P0] PAGE-004: should render KPI section with cards", () => {
      // GIVEN: Dashboard loaded successfully
      renderWithProviders(<ClientDashboardPage />);

      // THEN: KPI section is present
      expect(screen.getByTestId("kpi-section")).toBeInTheDocument();

      // AND: KPI cards are rendered (8 total - 4 in each row)
      // Check for unique KPI labels in the cards
      expect(
        screen.getByText("Taxable Sales (includes Food Sales)"),
      ).toBeInTheDocument();
      // Some labels like "Lottery Variance" also appear in dropdown, so use getAllByText
      expect(screen.getAllByText(/Food Sales/i).length).toBeGreaterThanOrEqual(
        1,
      );
      expect(
        screen.getAllByText(/Lottery Sales/i).length,
      ).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Fuel Sales/i).length).toBeGreaterThanOrEqual(
        1,
      );
      expect(screen.getByText("Average Ticket")).toBeInTheDocument();
      expect(
        screen.getAllByText(/Sales by Hour/i).length,
      ).toBeGreaterThanOrEqual(1);
      expect(
        screen.getAllByText(/Lottery Variance/i).length,
      ).toBeGreaterThanOrEqual(1);
      expect(
        screen.getAllByText(/Cash Variance/i).length,
      ).toBeGreaterThanOrEqual(1);
    });

    it("[P0] PAGE-004b: should display KPI values", () => {
      // GIVEN: Dashboard loaded successfully
      renderWithProviders(<ClientDashboardPage />);

      // THEN: KPI values are displayed (some values may appear in multiple places)
      expect(screen.getByText("$5,892")).toBeInTheDocument();
      expect(screen.getByText("$2,156")).toBeInTheDocument();
      expect(screen.getByText("$1,847")).toBeInTheDocument();
      expect(screen.getByText("$3,245")).toBeInTheDocument();
      // $24.95 appears in both KPI cards and ShiftPerformanceCard, so use getAllByText
      expect(screen.getAllByText("$24.95").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("$847")).toBeInTheDocument();
      // $0 may appear multiple times, so use getAllByText
      expect(screen.getAllByText("$0").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("-$12")).toBeInTheDocument();
    });

    it("[P0] PAGE-005: should render all dashboard sections", () => {
      // GIVEN: Dashboard loaded successfully
      renderWithProviders(<ClientDashboardPage />);

      // THEN: Sales Overview is present
      expect(screen.getByText("Sales Overview")).toBeInTheDocument();

      // AND: Shift Performance is present
      expect(screen.getByText("Shift Performance")).toBeInTheDocument();

      // AND: Recent Transactions is present
      expect(screen.getByText("Recent Transactions")).toBeInTheDocument();

      // AND: Recent Activity is present
      expect(screen.getByText("Recent Activity")).toBeInTheDocument();

      // AND: Lottery Packs is present
      expect(screen.getByText("Active Lottery Packs")).toBeInTheDocument();

      // AND: Shift History is present
      expect(screen.getByText("Recent Shift History")).toBeInTheDocument();
    });

    it("[P0] PAGE-005b: should render action buttons", () => {
      // GIVEN: Dashboard loaded successfully
      renderWithProviders(<ClientDashboardPage />);

      // THEN: View All buttons are present
      expect(screen.getByTestId("view-all-transactions")).toBeInTheDocument();
      expect(screen.getByTestId("view-all-packs")).toBeInTheDocument();
      expect(screen.getByTestId("view-all-shifts")).toBeInTheDocument();
    });
  });

  // ============================================
  // ACCESSIBILITY TESTS
  // ============================================
  describe("Accessibility", () => {
    it("[P0] PAGE-006: should have accessible KPI section", () => {
      // GIVEN: Dashboard loaded successfully
      renderWithProviders(<ClientDashboardPage />);

      // THEN: KPI section has proper heading
      expect(
        screen.getByText("Key Performance Indicators"),
      ).toBeInTheDocument();

      // AND: KPI lists have proper aria-labels
      expect(
        screen.getByRole("list", { name: "Primary metrics" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("list", { name: "Secondary metrics" }),
      ).toBeInTheDocument();
    });

    it("[P0] PAGE-006b: should have proper region landmarks", () => {
      // GIVEN: Dashboard loaded successfully
      renderWithProviders(<ClientDashboardPage />);

      // THEN: All card regions are present
      expect(screen.getByTestId("sales-overview-card")).toHaveAttribute(
        "role",
        "region",
      );
      expect(screen.getByTestId("shift-performance-card")).toHaveAttribute(
        "role",
        "region",
      );
      expect(screen.getByTestId("recent-transactions-card")).toHaveAttribute(
        "role",
        "region",
      );
      expect(screen.getByTestId("recent-activity-card")).toHaveAttribute(
        "role",
        "region",
      );
      expect(screen.getByTestId("lottery-packs-card")).toHaveAttribute(
        "role",
        "region",
      );
      expect(screen.getByTestId("shift-history-card")).toHaveAttribute(
        "role",
        "region",
      );
    });
  });

  // ============================================
  // INTEGRATION TESTS
  // ============================================
  describe("Integration", () => {
    it("[P1] PAGE-007: should render charts in dashboard", () => {
      // GIVEN: Dashboard loaded successfully
      renderWithProviders(<ClientDashboardPage />);

      // THEN: Mock chart components are rendered
      const responsiveContainers = screen.getAllByTestId(
        "mock-responsive-container",
      );
      expect(responsiveContainers.length).toBeGreaterThan(0);
    });

    it("[P1] PAGE-007b: should render pie chart for shift performance", () => {
      // GIVEN: Dashboard loaded successfully
      renderWithProviders(<ClientDashboardPage />);

      // THEN: Pie chart is rendered
      expect(screen.getByTestId("mock-pie-chart")).toBeInTheDocument();
    });
  });
});
