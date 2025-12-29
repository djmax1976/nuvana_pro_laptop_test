/**
 * Header Component Tests
 *
 * @component Header
 * @file src/components/layout/Header.tsx
 *
 * Test Coverage:
 * - Authentication states (authenticated, unauthenticated, loading)
 * - Store name display
 * - Date/time display
 * - Theme toggle visibility
 * - Logout button functionality
 * - Accessibility
 *
 * Traceability:
 * - REQ-HEADER-001: Display store name for authenticated users
 * - REQ-HEADER-002: Display current date and time
 * - REQ-HEADER-003: Provide logout functionality
 * - REQ-HEADER-004: Theme toggle for authenticated users only
 * - REQ-HEADER-005: Login button for unauthenticated users
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../support/test-utils";
import { Header } from "@/components/layout/Header";
import userEvent from "@testing-library/user-event";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock next-themes for ThemeToggle
const mockUseTheme = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: () => mockUseTheme(),
}));

// Mock AuthContext
const mockUseAuth = vi.fn();
const mockLogout = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock useClientDashboard for store name
const mockUseClientDashboard = vi.fn();
vi.mock("@/lib/api/client-dashboard", () => ({
  useClientDashboard: () => mockUseClientDashboard(),
}));

describe("Header Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTheme.mockReturnValue({
      theme: "light",
      setTheme: vi.fn(),
      resolvedTheme: "light",
    });
    mockLogout.mockResolvedValue(undefined);
  });

  describe("Authentication States", () => {
    it("[P1] should show login button when user is not authenticated", async () => {
      // GIVEN: User is not authenticated
      mockUseAuth.mockReturnValue({
        user: null,
        isLoading: false,
        logout: mockLogout,
      });
      mockUseClientDashboard.mockReturnValue({
        data: null,
        isLoading: false,
      });

      // WHEN: Header component is rendered
      renderWithProviders(<Header />);

      // THEN: Login button should be visible
      expect(screen.getByTestId("login-button")).toBeInTheDocument();

      // AND: Theme toggle should NOT be visible
      expect(screen.queryByTestId("theme-toggle")).not.toBeInTheDocument();

      // AND: Logout button should NOT be visible
      expect(screen.queryByTestId("logout-button")).not.toBeInTheDocument();
    });

    it("[P1] should show authenticated controls when user is logged in", async () => {
      // GIVEN: User is authenticated
      mockUseAuth.mockReturnValue({
        user: {
          user_id: "user-123",
          email: "test@test.com",
          name: "Test User",
          status: "ACTIVE",
        },
        isLoading: false,
        logout: mockLogout,
      });
      mockUseClientDashboard.mockReturnValue({
        data: {
          stores: [
            { store_id: "store-1", name: "Test Store", status: "ACTIVE" },
          ],
        },
        isLoading: false,
      });

      // WHEN: Header component is rendered
      renderWithProviders(<Header />);

      // THEN: Theme toggle should be visible
      await waitFor(() => {
        expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
      });

      // AND: Logout button should be visible
      expect(screen.getByTestId("logout-button")).toBeInTheDocument();

      // AND: Login button should NOT be visible
      expect(screen.queryByTestId("login-button")).not.toBeInTheDocument();
    });

    it("[P2] should show loading state during authentication check", async () => {
      // GIVEN: Authentication is loading
      mockUseAuth.mockReturnValue({
        user: null,
        isLoading: true,
        logout: mockLogout,
      });
      mockUseClientDashboard.mockReturnValue({
        data: null,
        isLoading: false,
      });

      // WHEN: Header component is rendered
      renderWithProviders(<Header />);

      // THEN: Neither login nor logout should be visible during loading
      expect(screen.queryByTestId("login-button")).not.toBeInTheDocument();
      expect(screen.queryByTestId("logout-button")).not.toBeInTheDocument();
      expect(screen.queryByTestId("theme-toggle")).not.toBeInTheDocument();
    });
  });

  describe("Store Name Display", () => {
    it("[P1] should display store name when authenticated and data loaded", async () => {
      // GIVEN: Authenticated user with store data
      mockUseAuth.mockReturnValue({
        user: {
          user_id: "user-123",
          email: "test@test.com",
          name: "Test User",
          status: "ACTIVE",
        },
        isLoading: false,
        logout: mockLogout,
      });
      mockUseClientDashboard.mockReturnValue({
        data: {
          stores: [
            {
              store_id: "store-1",
              name: "Downtown Gas Station",
              status: "ACTIVE",
            },
          ],
        },
        isLoading: false,
      });

      // WHEN: Header component is rendered
      renderWithProviders(<Header />);

      // THEN: Store name should be visible
      await waitFor(() => {
        expect(screen.getByTestId("header-store-name")).toBeInTheDocument();
        expect(screen.getByTestId("header-store-name")).toHaveTextContent(
          "Downtown Gas Station",
        );
      });
    });

    it("[P1] should display first active store name when multiple stores exist", async () => {
      // GIVEN: User has multiple stores, first active one should be shown
      mockUseAuth.mockReturnValue({
        user: {
          user_id: "user-123",
          email: "test@test.com",
          name: "Test User",
          status: "ACTIVE",
        },
        isLoading: false,
        logout: mockLogout,
      });
      mockUseClientDashboard.mockReturnValue({
        data: {
          stores: [
            { store_id: "store-1", name: "Inactive Store", status: "INACTIVE" },
            { store_id: "store-2", name: "Active Store", status: "ACTIVE" },
            { store_id: "store-3", name: "Another Active", status: "ACTIVE" },
          ],
        },
        isLoading: false,
      });

      // WHEN: Header component is rendered
      renderWithProviders(<Header />);

      // THEN: First active store name should be displayed
      await waitFor(() => {
        expect(screen.getByTestId("header-store-name")).toHaveTextContent(
          "Active Store",
        );
      });
    });

    it("[P2] should show loading skeleton while dashboard data is loading", async () => {
      // GIVEN: Authenticated but dashboard data is loading
      mockUseAuth.mockReturnValue({
        user: {
          user_id: "user-123",
          email: "test@test.com",
          name: "Test User",
          status: "ACTIVE",
        },
        isLoading: false,
        logout: mockLogout,
      });
      mockUseClientDashboard.mockReturnValue({
        data: null,
        isLoading: true,
      });

      // WHEN: Header component is rendered
      renderWithProviders(<Header />);

      // THEN: Store name element should not be present (loading skeleton shown instead)
      expect(screen.queryByTestId("header-store-name")).not.toBeInTheDocument();
    });

    it("[P2] should handle long store names", async () => {
      // GIVEN: Store with very long name
      const longStoreName =
        "Super Long Gas Station Name That Goes On Forever And Ever";
      mockUseAuth.mockReturnValue({
        user: {
          user_id: "user-123",
          email: "test@test.com",
          name: "Test User",
          status: "ACTIVE",
        },
        isLoading: false,
        logout: mockLogout,
      });
      mockUseClientDashboard.mockReturnValue({
        data: {
          stores: [
            { store_id: "store-1", name: longStoreName, status: "ACTIVE" },
          ],
        },
        isLoading: false,
      });

      // WHEN: Header component is rendered
      renderWithProviders(<Header />);

      // THEN: Full store name should be displayed
      await waitFor(() => {
        expect(screen.getByTestId("header-store-name")).toHaveTextContent(
          longStoreName,
        );
      });
    });

    it("[P2] should not display store name when no stores exist", async () => {
      // GIVEN: Authenticated user with no stores
      mockUseAuth.mockReturnValue({
        user: {
          user_id: "user-123",
          email: "test@test.com",
          name: "Test User",
          status: "ACTIVE",
        },
        isLoading: false,
        logout: mockLogout,
      });
      mockUseClientDashboard.mockReturnValue({
        data: { stores: [] },
        isLoading: false,
      });

      // WHEN: Header component is rendered
      renderWithProviders(<Header />);

      // THEN: Store name should not be displayed
      await waitFor(() => {
        expect(
          screen.queryByTestId("header-store-name"),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("Date/Time Display", () => {
    it("[P1] should display CurrentDateTime component when authenticated", async () => {
      // GIVEN: Authenticated user
      mockUseAuth.mockReturnValue({
        user: {
          user_id: "user-123",
          email: "test@test.com",
          name: "Test User",
          status: "ACTIVE",
        },
        isLoading: false,
        logout: mockLogout,
      });
      mockUseClientDashboard.mockReturnValue({
        data: {
          stores: [
            { store_id: "store-1", name: "Test Store", status: "ACTIVE" },
          ],
        },
        isLoading: false,
      });

      // WHEN: Header component is rendered
      renderWithProviders(<Header />);

      // THEN: CurrentDateTime component should be present
      await waitFor(() => {
        expect(screen.getByTestId("current-datetime")).toBeInTheDocument();
      });
    });

    it("[P2] should NOT display CurrentDateTime when not authenticated", async () => {
      // GIVEN: User is not authenticated
      mockUseAuth.mockReturnValue({
        user: null,
        isLoading: false,
        logout: mockLogout,
      });
      mockUseClientDashboard.mockReturnValue({
        data: null,
        isLoading: false,
      });

      // WHEN: Header component is rendered
      renderWithProviders(<Header />);

      // THEN: CurrentDateTime should NOT be visible
      expect(screen.queryByTestId("current-datetime")).not.toBeInTheDocument();
    });
  });

  describe("Logout Functionality", () => {
    it("[P0] should call logout when logout button is clicked", async () => {
      // GIVEN: Authenticated user
      mockUseAuth.mockReturnValue({
        user: {
          user_id: "user-123",
          email: "test@test.com",
          name: "Test User",
          status: "ACTIVE",
        },
        isLoading: false,
        logout: mockLogout,
      });
      mockUseClientDashboard.mockReturnValue({
        data: {
          stores: [
            { store_id: "store-1", name: "Test Store", status: "ACTIVE" },
          ],
        },
        isLoading: false,
      });

      // WHEN: Header is rendered and logout button is clicked
      renderWithProviders(<Header />);
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByTestId("logout-button")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("logout-button"));

      // THEN: Logout function should be called
      expect(mockLogout).toHaveBeenCalledTimes(1);
    });

    it("[P1] should have accessible logout button with aria-label", async () => {
      // GIVEN: Authenticated user
      mockUseAuth.mockReturnValue({
        user: {
          user_id: "user-123",
          email: "test@test.com",
          name: "Test User",
          status: "ACTIVE",
        },
        isLoading: false,
        logout: mockLogout,
      });
      mockUseClientDashboard.mockReturnValue({
        data: {
          stores: [
            { store_id: "store-1", name: "Test Store", status: "ACTIVE" },
          ],
        },
        isLoading: false,
      });

      // WHEN: Header component is rendered
      renderWithProviders(<Header />);

      // THEN: Logout button should have aria-label for accessibility
      await waitFor(() => {
        const logoutButton = screen.getByTestId("logout-button");
        expect(logoutButton).toHaveAttribute("aria-label", "Logout");
      });
    });
  });

  describe("Login Navigation", () => {
    it("[P1] should navigate to login page when login button is clicked", async () => {
      // GIVEN: User is not authenticated
      mockUseAuth.mockReturnValue({
        user: null,
        isLoading: false,
        logout: mockLogout,
      });
      mockUseClientDashboard.mockReturnValue({
        data: null,
        isLoading: false,
      });

      // WHEN: Header is rendered and login button is clicked
      renderWithProviders(<Header />);
      const user = userEvent.setup();

      await user.click(screen.getByTestId("login-button"));

      // THEN: Should navigate to login page
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
  });

  describe("Theme Toggle", () => {
    it("[P2] should NOT display theme toggle when user is not authenticated", async () => {
      // GIVEN: User is not authenticated
      mockUseAuth.mockReturnValue({
        user: null,
        isLoading: false,
        logout: mockLogout,
      });
      mockUseClientDashboard.mockReturnValue({
        data: null,
        isLoading: false,
      });

      // WHEN: Header component is rendered
      renderWithProviders(<Header />);

      // THEN: Theme toggle should NOT be visible
      expect(screen.queryByTestId("theme-toggle")).not.toBeInTheDocument();
    });

    it("[P2] should display theme toggle when user is authenticated", async () => {
      // GIVEN: User is authenticated
      mockUseAuth.mockReturnValue({
        user: {
          user_id: "user-123",
          email: "test@test.com",
          name: "Test User",
          status: "ACTIVE",
        },
        isLoading: false,
        logout: mockLogout,
      });
      mockUseClientDashboard.mockReturnValue({
        data: {
          stores: [
            { store_id: "store-1", name: "Test Store", status: "ACTIVE" },
          ],
        },
        isLoading: false,
      });

      // WHEN: Header component is rendered
      renderWithProviders(<Header />);

      // THEN: Theme toggle should be visible
      await waitFor(() => {
        expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
      });
    });
  });

  describe("Layout and Ordering", () => {
    it("[P2] should display controls in correct order: datetime, theme, logout", async () => {
      // GIVEN: User is authenticated
      mockUseAuth.mockReturnValue({
        user: {
          user_id: "user-123",
          email: "test@test.com",
          name: "Test User",
          status: "ACTIVE",
        },
        isLoading: false,
        logout: mockLogout,
      });
      mockUseClientDashboard.mockReturnValue({
        data: {
          stores: [
            { store_id: "store-1", name: "Test Store", status: "ACTIVE" },
          ],
        },
        isLoading: false,
      });

      // WHEN: Header component is rendered
      renderWithProviders(<Header />);

      // THEN: Elements should be in correct order
      await waitFor(() => {
        const header = screen.getByTestId("header");
        const datetime = screen.getByTestId("current-datetime");
        const themeToggle = screen.getByTestId("theme-toggle");
        const logoutButton = screen.getByTestId("logout-button");

        const elements = Array.from(header.querySelectorAll("[data-testid]"));
        const datetimeIndex = elements.indexOf(datetime);
        const themeIndex = elements.indexOf(themeToggle);
        const logoutIndex = elements.indexOf(logoutButton);

        expect(datetimeIndex).toBeLessThan(themeIndex);
        expect(themeIndex).toBeLessThan(logoutIndex);
      });
    });

    it("[P2] should have correct header height class", async () => {
      // GIVEN: Authenticated user
      mockUseAuth.mockReturnValue({
        user: {
          user_id: "user-123",
          email: "test@test.com",
          name: "Test User",
          status: "ACTIVE",
        },
        isLoading: false,
        logout: mockLogout,
      });
      mockUseClientDashboard.mockReturnValue({
        data: {
          stores: [
            { store_id: "store-1", name: "Test Store", status: "ACTIVE" },
          ],
        },
        isLoading: false,
      });

      // WHEN: Header component is rendered
      renderWithProviders(<Header />);

      // THEN: Header should have h-16 class (matches sidebar)
      const header = screen.getByTestId("header");
      expect(header).toHaveClass("h-16");
    });
  });

  describe("Accessibility", () => {
    it("[P1] should have proper test IDs for all interactive elements", async () => {
      // GIVEN: Authenticated user
      mockUseAuth.mockReturnValue({
        user: {
          user_id: "user-123",
          email: "test@test.com",
          name: "Test User",
          status: "ACTIVE",
        },
        isLoading: false,
        logout: mockLogout,
      });
      mockUseClientDashboard.mockReturnValue({
        data: {
          stores: [
            { store_id: "store-1", name: "Test Store", status: "ACTIVE" },
          ],
        },
        isLoading: false,
      });

      // WHEN: Header component is rendered
      renderWithProviders(<Header />);

      // THEN: All key elements should have test IDs
      await waitFor(() => {
        expect(screen.getByTestId("header")).toBeInTheDocument();
        expect(screen.getByTestId("header-store-name")).toBeInTheDocument();
        expect(screen.getByTestId("current-datetime")).toBeInTheDocument();
        expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
        expect(screen.getByTestId("logout-button")).toBeInTheDocument();
      });
    });
  });
});
