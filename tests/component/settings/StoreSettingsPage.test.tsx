/**
 * @test-level COMPONENT
 * @justification Tests React page component rendering, navigation, and tab switching
 * @story 6-14-store-settings-page
 */
// tests/component/settings/StoreSettingsPage.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../support/test-utils";
import userEvent from "@testing-library/user-event";
import SettingsPage from "@/app/(client-dashboard)/client-dashboard/settings/page";
import * as clientDashboardApi from "@/lib/api/client-dashboard";

/**
 * StoreSettingsPage Component Tests
 *
 * Tests the Settings page component that displays store tabs and internal tabs.
 *
 * Component tests are SECOND in pyramid order (20-30% of tests)
 */

// Mock the API hooks
vi.mock("@/lib/api/client-dashboard", () => ({
  useClientDashboard: vi.fn(),
}));

describe("StoreSettingsPage Component", () => {
  const mockStores = [
    {
      store_id: "store-1",
      name: "Store 1",
      company_id: "company-1",
    },
    {
      store_id: "store-2",
      name: "Store 2",
      company_id: "company-1",
    },
  ];

  const mockDashboardData = {
    stores: mockStores,
  };

  const mockUseClientDashboard = {
    data: mockDashboardData,
    isLoading: false,
    isError: false,
    error: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue(
      mockUseClientDashboard as any,
    );
  });

  describe("Page Rendering", () => {
    it("should render settings page with title", async () => {
      // GIVEN: SettingsPage is rendered
      renderWithProviders(<SettingsPage />);

      // WHEN: Component renders
      // THEN: Page title is displayed
      await waitFor(() => {
        expect(screen.getByText("Settings")).toBeInTheDocument();
      });
    });

    it("should display store tabs when multiple stores exist", async () => {
      // GIVEN: SettingsPage is rendered with multiple stores
      renderWithProviders(<SettingsPage />);

      // WHEN: Component renders
      // THEN: Store tabs are displayed
      await waitFor(() => {
        expect(screen.getByTestId("settings-page")).toBeInTheDocument();
      });
    });

    it("should display internal tabs (Store Info, Employees, Cashiers)", async () => {
      // GIVEN: SettingsPage is rendered
      renderWithProviders(<SettingsPage />);

      // WHEN: Component renders
      await waitFor(() => {
        // THEN: Internal tabs are displayed
        expect(screen.getByTestId("store-info-tab")).toBeInTheDocument();
        expect(screen.getByTestId("employees-tab")).toBeInTheDocument();
        expect(screen.getByTestId("cashiers-tab")).toBeInTheDocument();
      });
    });

    it("should have Store Info tab selected by default", async () => {
      // GIVEN: SettingsPage is rendered
      renderWithProviders(<SettingsPage />);

      // WHEN: Component renders
      await waitFor(() => {
        // THEN: Store Info tab is selected by default
        const storeInfoTab = screen.getByTestId("store-info-tab");
        expect(storeInfoTab).toHaveAttribute("data-state", "active");
      });
    });
  });

  describe("Tab Switching", () => {
    it("should switch to Employees tab when clicked", async () => {
      // GIVEN: SettingsPage is rendered
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByTestId("employees-tab")).toBeInTheDocument();
      });

      // WHEN: User clicks Employees tab
      const employeesTab = screen.getByTestId("employees-tab");
      await user.click(employeesTab);

      // THEN: Employees tab is active
      await waitFor(() => {
        expect(employeesTab).toHaveAttribute("data-state", "active");
      });
    });

    it("should switch to Cashiers tab when clicked", async () => {
      // GIVEN: SettingsPage is rendered
      const user = userEvent.setup();
      renderWithProviders(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByTestId("cashiers-tab")).toBeInTheDocument();
      });

      // WHEN: User clicks Cashiers tab
      const cashiersTab = screen.getByTestId("cashiers-tab");
      await user.click(cashiersTab);

      // THEN: Cashiers tab is active
      await waitFor(() => {
        expect(cashiersTab).toHaveAttribute("data-state", "active");
      });
    });
  });

  describe("Loading and Error States", () => {
    it("should show loading state while fetching dashboard data", async () => {
      // GIVEN: SettingsPage is rendered
      vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue({
        ...mockUseClientDashboard,
        isLoading: true,
        data: undefined,
      } as any);

      renderWithProviders(<SettingsPage />);

      // WHEN: Dashboard data is loading
      // THEN: Loading spinner is displayed
      expect(screen.getByText(/loading stores/i)).toBeInTheDocument();
    });

    it("should show error message when fetch fails", async () => {
      // GIVEN: SettingsPage is rendered
      vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue({
        ...mockUseClientDashboard,
        isLoading: false,
        isError: true,
        error: new Error("Failed to load"),
      } as any);

      renderWithProviders(<SettingsPage />);

      // WHEN: Dashboard fetch fails
      // THEN: Error message is displayed
      await waitFor(() => {
        expect(screen.getByText(/failed to load stores/i)).toBeInTheDocument();
      });
    });

    it("should show message when no stores are available", async () => {
      // GIVEN: SettingsPage is rendered
      vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue({
        ...mockUseClientDashboard,
        data: { stores: [] },
      } as any);

      renderWithProviders(<SettingsPage />);

      // WHEN: No stores are available
      // THEN: No stores message is displayed
      await waitFor(() => {
        expect(screen.getByText(/no stores available/i)).toBeInTheDocument();
      });
    });
  });
});
