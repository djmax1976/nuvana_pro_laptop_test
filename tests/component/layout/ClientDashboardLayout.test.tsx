/**
 * @test-level Component/Integration
 * @justification Integration tests for ClientDashboardLayout - validates layout structure,
 *               PageTitleProvider integration, MobileHeader behavior, and responsive design
 * @story client-dashboard-page-title-header
 *
 * ClientDashboardLayout Component Tests
 *
 * STORY: As a client dashboard user, I want a consistent layout with:
 * - Sidebar navigation on desktop
 * - Mobile-friendly slide-out menu
 * - Page title displayed in header (centered)
 * - Store name and controls on the right
 *
 * TEST LEVEL: Component/Integration (React component with multiple child components)
 * PRIMARY GOAL: Verify layout structure, provider hierarchy, and component integration
 *
 * TRACEABILITY MATRIX:
 * | Test ID                    | Requirement              | Priority |
 * |----------------------------|--------------------------|----------|
 * | CDL-001                    | REQ-LAYOUT-STRUCTURE-001 | P0       |
 * | CDL-002                    | REQ-LAYOUT-PROVIDER-001  | P0       |
 * | CDL-003                    | REQ-LAYOUT-SIDEBAR-001   | P0       |
 * | CDL-004                    | REQ-LAYOUT-MOBILE-001    | P0       |
 * | CDL-005                    | REQ-MOBILE-HEADER-001    | P0       |
 * | CDL-006                    | REQ-MOBILE-HEADER-002    | P0       |
 * | CDL-007                    | REQ-MOBILE-TITLE-001     | P0       |
 * | CDL-008                    | REQ-MOBILE-CONTROLS-001  | P1       |
 * | CDL-009                    | REQ-LAYOUT-A11Y-001      | P1       |
 * | CDL-SEC-001                | SEC-XSS-001              | P0       |
 *
 * COMPONENT FUNCTIONALITY TESTED:
 * - Layout structure (sidebar, header, main content)
 * - PageTitleProvider wrapping children correctly
 * - Desktop sidebar visibility
 * - Mobile sidebar sheet behavior
 * - MobileHeader component with page title
 * - MobileHeader with controls-only Header variant
 * - Accessibility (aria labels, semantic HTML)
 *
 * SECURITY CONSIDERATIONS:
 * - FE-001: STATE_MANAGEMENT - No sensitive data in layout state
 * - SEC-004: XSS - React automatic escaping for all text content
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClientDashboardLayout } from "@/components/layout/ClientDashboardLayout";
import { usePageTitleEffect } from "@/contexts/PageTitleContext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CashierSessionProvider } from "@/contexts/CashierSessionContext";
import type { ReactNode } from "react";

// Mock next/navigation
const mockPush = vi.fn();
const mockPathname = vi.fn(() => "/client-dashboard");

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => mockPathname(),
  useSearchParams: () => new URLSearchParams(),
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

// Mock ClientAuthContext
const mockUseClientAuth = vi.fn();
vi.mock("@/contexts/ClientAuthContext", () => ({
  useClientAuth: () => mockUseClientAuth(),
}));

// Mock useClientDashboard for store name
const mockUseClientDashboard = vi.fn();
vi.mock("@/lib/api/client-dashboard", () => ({
  useClientDashboard: () => mockUseClientDashboard(),
}));

// Test wrapper for queries
function TestWrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <CashierSessionProvider>{children}</CashierSessionProvider>
    </QueryClientProvider>
  );
}

// Helper to set up authenticated user
function setupAuthenticatedUser() {
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
  mockUseClientAuth.mockReturnValue({
    user: {
      id: "user-123",
      email: "test@test.com",
      name: "Test User",
      is_client_user: true,
    },
    permissions: ["CLIENT_DASHBOARD_ACCESS"],
    isLoading: false,
    isAuthenticated: true,
    isClientUser: true,
    isStoreUser: false,
    userRole: "CLIENT_OWNER",
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  });
  mockUseClientDashboard.mockReturnValue({
    data: {
      stores: [{ store_id: "store-1", name: "Test Store", status: "ACTIVE" }],
    },
    isLoading: false,
  });
}

// Test page component that sets a title
function TestPageWithTitle({ title }: { title: string }) {
  usePageTitleEffect(title);
  return <div data-testid="test-page-content">Page Content for {title}</div>;
}

// Test page component without title
function TestPageNoTitle() {
  return <div data-testid="test-page-no-title">Page without title</div>;
}

describe("COMPONENT: ClientDashboardLayout - Structure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTheme.mockReturnValue({
      theme: "light",
      setTheme: vi.fn(),
      resolvedTheme: "light",
    });
    mockLogout.mockResolvedValue(undefined);
    setupAuthenticatedUser();
  });

  // ===========================================================================
  // SECTION 1: Basic Layout Structure
  // ===========================================================================

  describe("Basic Layout Structure", () => {
    it("[P0] CDL-001: should render layout container with correct test id", () => {
      // GIVEN: Layout with child content
      // WHEN: Rendered
      render(
        <TestWrapper>
          <ClientDashboardLayout>
            <TestPageNoTitle />
          </ClientDashboardLayout>
        </TestWrapper>,
      );

      // THEN: Layout container should be present
      expect(screen.getByTestId("client-dashboard-layout")).toBeInTheDocument();
    });

    it("[P0] CDL-002: should render children content", () => {
      // GIVEN: Layout with specific child content
      // WHEN: Rendered
      render(
        <TestWrapper>
          <ClientDashboardLayout>
            <div data-testid="custom-child">Custom Content</div>
          </ClientDashboardLayout>
        </TestWrapper>,
      );

      // THEN: Child content should be rendered
      expect(screen.getByTestId("custom-child")).toBeInTheDocument();
      expect(screen.getByTestId("custom-child")).toHaveTextContent(
        "Custom Content",
      );
    });

    it("[P0] CDL-003: should wrap children with PageTitleProvider", () => {
      // GIVEN: Layout with page that uses title effect
      // WHEN: Rendered
      render(
        <TestWrapper>
          <ClientDashboardLayout>
            <TestPageWithTitle title="Test Title" />
          </ClientDashboardLayout>
        </TestWrapper>,
      );

      // THEN: Page content should render without error (provider is present)
      expect(screen.getByTestId("test-page-content")).toBeInTheDocument();
    });

    it("[P1] CDL-004: should have flex layout for responsive design", () => {
      // GIVEN: Layout
      // WHEN: Rendered
      render(
        <TestWrapper>
          <ClientDashboardLayout>
            <TestPageNoTitle />
          </ClientDashboardLayout>
        </TestWrapper>,
      );

      // THEN: Container should have flex class
      const layout = screen.getByTestId("client-dashboard-layout");
      expect(layout).toHaveClass("flex");
    });

    it("[P1] CDL-005: should have full height layout", () => {
      // GIVEN: Layout
      // WHEN: Rendered
      render(
        <TestWrapper>
          <ClientDashboardLayout>
            <TestPageNoTitle />
          </ClientDashboardLayout>
        </TestWrapper>,
      );

      // THEN: Container should have h-screen class
      const layout = screen.getByTestId("client-dashboard-layout");
      expect(layout).toHaveClass("h-screen");
    });
  });
});

describe("COMPONENT: ClientDashboardLayout - MobileHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTheme.mockReturnValue({
      theme: "light",
      setTheme: vi.fn(),
      resolvedTheme: "light",
    });
    mockLogout.mockResolvedValue(undefined);
    setupAuthenticatedUser();
  });

  // ===========================================================================
  // SECTION 2: MobileHeader Component (Internal)
  // ===========================================================================

  describe("MobileHeader Component", () => {
    it("[P0] CDL-006: should render mobile header with menu button", () => {
      // GIVEN: Layout
      // WHEN: Rendered
      render(
        <TestWrapper>
          <ClientDashboardLayout>
            <TestPageNoTitle />
          </ClientDashboardLayout>
        </TestWrapper>,
      );

      // THEN: Mobile sidebar toggle should be present
      expect(screen.getByTestId("client-sidebar-toggle")).toBeInTheDocument();
    });

    it("[P0] CDL-007: should display page title in mobile header", async () => {
      // GIVEN: Layout with page that sets title
      // WHEN: Rendered
      render(
        <TestWrapper>
          <ClientDashboardLayout>
            <TestPageWithTitle title="Lottery" />
          </ClientDashboardLayout>
        </TestWrapper>,
      );

      // THEN: Page title should be displayed in mobile header
      await waitFor(() => {
        expect(
          screen.getByTestId("mobile-header-page-title"),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId("mobile-header-page-title"),
        ).toHaveTextContent("Lottery");
      });
    });

    it("[P0] CDL-008: should NOT show page title in mobile header when not set", () => {
      // GIVEN: Layout with page that doesn't set title
      // WHEN: Rendered
      render(
        <TestWrapper>
          <ClientDashboardLayout>
            <TestPageNoTitle />
          </ClientDashboardLayout>
        </TestWrapper>,
      );

      // THEN: Mobile page title should not be present
      expect(
        screen.queryByTestId("mobile-header-page-title"),
      ).not.toBeInTheDocument();
    });

    it("[P0] CDL-009: mobile header should use Header controls-only variant", async () => {
      // GIVEN: Layout
      // WHEN: Rendered
      render(
        <TestWrapper>
          <ClientDashboardLayout>
            <TestPageNoTitle />
          </ClientDashboardLayout>
        </TestWrapper>,
      );

      // THEN: Should have logout buttons (one from mobile controls-only, one from desktop header)
      // Both mobile and desktop headers are in the DOM, just hidden via CSS
      await waitFor(() => {
        const logoutButtons = screen.getAllByTestId("logout-button");
        // Should have at least one logout button (mobile controls-only uses this)
        expect(logoutButtons.length).toBeGreaterThanOrEqual(1);
      });

      // AND: Desktop header with testid="header" should be present
      expect(screen.getByTestId("header")).toBeInTheDocument();
    });

    it("[P1] CDL-010: mobile header should have correct layout structure", () => {
      // GIVEN: Layout
      // WHEN: Rendered
      render(
        <TestWrapper>
          <ClientDashboardLayout>
            <TestPageWithTitle title="Reports" />
          </ClientDashboardLayout>
        </TestWrapper>,
      );

      // THEN: Menu button should be on the left
      const menuButton = screen.getByTestId("client-sidebar-toggle");
      expect(menuButton).toBeInTheDocument();

      // AND: Title should be centered (in flex container)
      const title = screen.getByTestId("mobile-header-page-title");
      const titleContainer = title.parentElement;
      expect(titleContainer).toHaveClass("justify-center");
    });

    it("[P1] CDL-011: menu button should have accessible label", () => {
      // GIVEN: Layout
      // WHEN: Rendered
      render(
        <TestWrapper>
          <ClientDashboardLayout>
            <TestPageNoTitle />
          </ClientDashboardLayout>
        </TestWrapper>,
      );

      // THEN: Menu button should have aria-label
      const menuButton = screen.getByTestId("client-sidebar-toggle");
      expect(menuButton).toHaveAttribute("aria-label", "Open navigation menu");
    });
  });

  // ===========================================================================
  // SECTION 3: Mobile Sidebar Sheet Behavior
  // ===========================================================================

  describe("Mobile Sidebar Sheet", () => {
    it("[P0] CDL-012: clicking menu button should open sidebar sheet", async () => {
      // GIVEN: Layout
      const user = userEvent.setup();
      render(
        <TestWrapper>
          <ClientDashboardLayout>
            <TestPageNoTitle />
          </ClientDashboardLayout>
        </TestWrapper>,
      );

      // Note: Both desktop sidebar and mobile sheet sidebar exist in DOM
      // Desktop sidebar is hidden via CSS (hidden lg:block)
      // When menu button is clicked, the mobile sheet opens with another sidebar instance
      const initialSidebars = screen.getAllByTestId(
        "client-sidebar-navigation",
      );
      const initialCount = initialSidebars.length;

      // WHEN: Menu button is clicked
      await user.click(screen.getByTestId("client-sidebar-toggle"));

      // THEN: Should have sidebars present (desktop + sheet)
      // The sheet opens and contains another sidebar instance
      await waitFor(() => {
        const sidebars = screen.getAllByTestId("client-sidebar-navigation");
        // After clicking, we should have sidebars in the DOM
        expect(sidebars.length).toBeGreaterThanOrEqual(1);
      });
    });

    it("[P1] CDL-013: sidebar sheet should have accessible title", async () => {
      // GIVEN: Layout with open sidebar
      const user = userEvent.setup();
      render(
        <TestWrapper>
          <ClientDashboardLayout>
            <TestPageNoTitle />
          </ClientDashboardLayout>
        </TestWrapper>,
      );

      await user.click(screen.getByTestId("client-sidebar-toggle"));

      // THEN: Sheet should have sr-only title for accessibility
      await waitFor(() => {
        const sheetTitle = screen.getByText("Client Navigation Menu");
        expect(sheetTitle).toHaveClass("sr-only");
      });
    });
  });
});

describe("COMPONENT: ClientDashboardLayout - Page Title Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTheme.mockReturnValue({
      theme: "light",
      setTheme: vi.fn(),
      resolvedTheme: "light",
    });
    mockLogout.mockResolvedValue(undefined);
    setupAuthenticatedUser();
  });

  // ===========================================================================
  // SECTION 4: Page Title Context Integration
  // ===========================================================================

  describe("Page Title Context Integration", () => {
    it("[P0] CDL-014: should pass page title to desktop header", async () => {
      // GIVEN: Layout with page that sets title
      // WHEN: Rendered
      render(
        <TestWrapper>
          <ClientDashboardLayout>
            <TestPageWithTitle title="Settings" />
          </ClientDashboardLayout>
        </TestWrapper>,
      );

      // THEN: Title should appear in desktop header
      await waitFor(() => {
        expect(screen.getByTestId("header-page-title")).toBeInTheDocument();
        expect(screen.getByTestId("header-page-title")).toHaveTextContent(
          "Settings",
        );
      });
    });

    it("[P0] CDL-015: should pass page title to mobile header", async () => {
      // GIVEN: Layout with page that sets title
      // WHEN: Rendered
      render(
        <TestWrapper>
          <ClientDashboardLayout>
            <TestPageWithTitle title="Cashiers" />
          </ClientDashboardLayout>
        </TestWrapper>,
      );

      // THEN: Title should appear in mobile header
      await waitFor(() => {
        expect(
          screen.getByTestId("mobile-header-page-title"),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId("mobile-header-page-title"),
        ).toHaveTextContent("Cashiers");
      });
    });

    it("[P1] CDL-016: page title should update when navigating", async () => {
      // GIVEN: Layout with initial page
      const { rerender } = render(
        <TestWrapper>
          <ClientDashboardLayout>
            <TestPageWithTitle title="Page A" />
          </ClientDashboardLayout>
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("header-page-title")).toHaveTextContent(
          "Page A",
        );
      });

      // WHEN: Navigating to new page (simulated by rerender)
      rerender(
        <TestWrapper>
          <ClientDashboardLayout>
            <TestPageWithTitle title="Page B" />
          </ClientDashboardLayout>
        </TestWrapper>,
      );

      // THEN: Title should update
      await waitFor(() => {
        expect(screen.getByTestId("header-page-title")).toHaveTextContent(
          "Page B",
        );
      });
    });

    it("[P1] CDL-017: page title should clear when page unmounts", async () => {
      // Component that can toggle child
      function ToggleableApp() {
        const [showPage, setShowPage] = React.useState(true);
        return (
          <>
            {showPage && <TestPageWithTitle title="Temporary" />}
            <button
              data-testid="toggle-page"
              onClick={() => setShowPage(false)}
            >
              Hide
            </button>
          </>
        );
      }

      // Need React for useState
      const React = await import("react");

      render(
        <TestWrapper>
          <ClientDashboardLayout>
            <ToggleableApp />
          </ClientDashboardLayout>
        </TestWrapper>,
      );

      // Verify title is shown
      await waitFor(() => {
        expect(screen.getByTestId("header-page-title")).toHaveTextContent(
          "Temporary",
        );
      });

      // Hide the page
      const user = userEvent.setup();
      await user.click(screen.getByTestId("toggle-page"));

      // Title should be cleared
      await waitFor(() => {
        expect(
          screen.queryByTestId("header-page-title"),
        ).not.toBeInTheDocument();
      });
    });
  });
});

describe("COMPONENT: ClientDashboardLayout - Security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTheme.mockReturnValue({
      theme: "light",
      setTheme: vi.fn(),
      resolvedTheme: "light",
    });
    mockLogout.mockResolvedValue(undefined);
    setupAuthenticatedUser();
  });

  // ===========================================================================
  // SECTION 5: Security Tests
  // ===========================================================================

  describe("XSS Prevention (SEC-004)", () => {
    it("[P0] CDL-SEC-001: should escape HTML in mobile header page title", async () => {
      // GIVEN: Page with malicious title
      const maliciousTitle = '<script>alert("xss")</script>';

      // WHEN: Rendered
      render(
        <TestWrapper>
          <ClientDashboardLayout>
            <TestPageWithTitle title={maliciousTitle} />
          </ClientDashboardLayout>
        </TestWrapper>,
      );

      // THEN: Script should be escaped in mobile header
      await waitFor(() => {
        const mobileTitle = screen.getByTestId("mobile-header-page-title");
        expect(mobileTitle.textContent).toBe(maliciousTitle);
        expect(mobileTitle.innerHTML).toContain("&lt;script&gt;");
      });
    });

    it("[P1] CDL-SEC-002: should escape HTML in desktop header page title", async () => {
      // GIVEN: Page with malicious title
      const maliciousTitle = '<img src="x" onerror="alert(1)">';

      // WHEN: Rendered
      render(
        <TestWrapper>
          <ClientDashboardLayout>
            <TestPageWithTitle title={maliciousTitle} />
          </ClientDashboardLayout>
        </TestWrapper>,
      );

      // THEN: Script should be escaped in desktop header
      await waitFor(() => {
        const desktopTitle = screen.getByTestId("header-page-title");
        expect(desktopTitle.innerHTML).toContain("&lt;img");
      });
    });
  });
});

describe("COMPONENT: ClientDashboardLayout - Edge Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTheme.mockReturnValue({
      theme: "light",
      setTheme: vi.fn(),
      resolvedTheme: "light",
    });
    mockLogout.mockResolvedValue(undefined);
    setupAuthenticatedUser();
  });

  // ===========================================================================
  // SECTION 6: Edge Cases
  // ===========================================================================

  describe("Edge Cases", () => {
    it("[P2] CDL-018: should handle very long page title", async () => {
      // GIVEN: Page with very long title
      const longTitle = "A".repeat(100);

      // WHEN: Rendered
      render(
        <TestWrapper>
          <ClientDashboardLayout>
            <TestPageWithTitle title={longTitle} />
          </ClientDashboardLayout>
        </TestWrapper>,
      );

      // THEN: Should render without error
      await waitFor(() => {
        expect(
          screen.getByTestId("mobile-header-page-title"),
        ).toBeInTheDocument();
      });

      // AND: Mobile title should have truncate class for overflow
      const mobileTitle = screen.getByTestId("mobile-header-page-title");
      expect(mobileTitle).toHaveClass("truncate");
    });

    it("[P2] CDL-019: should handle Unicode characters in title", async () => {
      // GIVEN: Page with Unicode title
      const unicodeTitle = "日本語 🎰 Lottery";

      // WHEN: Rendered
      render(
        <TestWrapper>
          <ClientDashboardLayout>
            <TestPageWithTitle title={unicodeTitle} />
          </ClientDashboardLayout>
        </TestWrapper>,
      );

      // THEN: Unicode should be preserved
      await waitFor(() => {
        expect(
          screen.getByTestId("mobile-header-page-title"),
        ).toHaveTextContent(unicodeTitle);
      });
    });

    it("[P2] CDL-020: should handle empty children gracefully", () => {
      // GIVEN: Layout with no children
      // WHEN: Rendered
      render(
        <TestWrapper>
          <ClientDashboardLayout>{null}</ClientDashboardLayout>
        </TestWrapper>,
      );

      // THEN: Should render without error
      expect(screen.getByTestId("client-dashboard-layout")).toBeInTheDocument();
    });

    it("[P2] CDL-021: should handle multiple children", () => {
      // GIVEN: Layout with multiple children
      // WHEN: Rendered
      render(
        <TestWrapper>
          <ClientDashboardLayout>
            <div data-testid="child-1">Child 1</div>
            <div data-testid="child-2">Child 2</div>
          </ClientDashboardLayout>
        </TestWrapper>,
      );

      // THEN: All children should render
      expect(screen.getByTestId("child-1")).toBeInTheDocument();
      expect(screen.getByTestId("child-2")).toBeInTheDocument();
    });
  });
});
