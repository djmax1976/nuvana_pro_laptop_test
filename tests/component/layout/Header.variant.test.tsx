/**
 * @test-level Component
 * @justification Component tests for Header variant functionality - validates "full" and "controls-only"
 *               variants, page title display, and mobile header integration
 * @story client-dashboard-page-title-header
 *
 * Header Component Variant Tests
 *
 * STORY: As a client dashboard user, I want to see the page title in the header bar
 * centered between the sidebar and controls, with a responsive mobile layout.
 *
 * TEST LEVEL: Component (React component behavior tests)
 * PRIMARY GOAL: Verify Header variant prop behavior, page title integration, and mobile layout
 *
 * TRACEABILITY MATRIX:
 * | Test ID                    | Requirement              | Priority |
 * |----------------------------|--------------------------|----------|
 * | HDR-VAR-001                | REQ-HEADER-VARIANT-001   | P0       |
 * | HDR-VAR-002                | REQ-HEADER-VARIANT-002   | P0       |
 * | HDR-VAR-003                | REQ-HEADER-VARIANT-003   | P0       |
 * | HDR-VAR-004                | REQ-HEADER-TITLE-001     | P0       |
 * | HDR-VAR-005                | REQ-HEADER-TITLE-002     | P1       |
 * | HDR-VAR-006                | REQ-HEADER-MOBILE-001    | P0       |
 * | HDR-VAR-007                | REQ-HEADER-MOBILE-002    | P1       |
 * | HDR-VAR-SEC-001            | SEC-XSS-001              | P0       |
 *
 * COMPONENT FUNCTIONALITY TESTED:
 * - Default "full" variant behavior (3-column layout)
 * - "controls-only" variant behavior (no header tag, minimal controls)
 * - Page title display from PageTitleContext
 * - No page title display when title is null
 * - Controls-only variant for mobile embedding
 * - XSS prevention via React escaping
 *
 * SECURITY CONSIDERATIONS (SEC-004: XSS):
 * - All text content uses React's automatic escaping
 * - No dangerouslySetInnerHTML usage
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Header } from "@/components/layout/Header";
import {
  PageTitleProvider,
  useSetPageTitle,
} from "@/contexts/PageTitleContext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CashierSessionProvider } from "@/contexts/CashierSessionContext";
import type { ReactNode } from "react";
import { useEffect } from "react";
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

// Test wrapper with all providers including PageTitleProvider
function createTestWrapper(options: { withPageTitleProvider?: boolean } = {}) {
  const { withPageTitleProvider = true } = options;

  return function TestWrapper({ children }: { children: ReactNode }) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const content = (
      <QueryClientProvider client={queryClient}>
        <CashierSessionProvider>{children}</CashierSessionProvider>
      </QueryClientProvider>
    );

    if (withPageTitleProvider) {
      return <PageTitleProvider>{content}</PageTitleProvider>;
    }
    return content;
  };
}

// Helper component to set page title
function PageTitleSetter({ title }: { title: string }) {
  const { setPageTitle } = useSetPageTitle();
  useEffect(() => {
    setPageTitle(title);
    return () => setPageTitle(null);
  }, [title, setPageTitle]);
  return null;
}

// Helper to set up authenticated user mock
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
  mockUseClientDashboard.mockReturnValue({
    data: {
      stores: [{ store_id: "store-1", name: "Test Store", status: "ACTIVE" }],
    },
    isLoading: false,
  });
}

// Helper to set up unauthenticated user mock
function setupUnauthenticatedUser() {
  mockUseAuth.mockReturnValue({
    user: null,
    isLoading: false,
    logout: mockLogout,
  });
  mockUseClientDashboard.mockReturnValue({
    data: null,
    isLoading: false,
  });
}

describe("COMPONENT: Header - Variant Prop Behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTheme.mockReturnValue({
      theme: "light",
      setTheme: vi.fn(),
      resolvedTheme: "light",
    });
    mockLogout.mockResolvedValue(undefined);
  });

  // ===========================================================================
  // SECTION 1: Default "full" Variant
  // ===========================================================================

  describe('Default "full" Variant', () => {
    it("[P0] HDR-VAR-001: should render full header with header tag by default", async () => {
      // GIVEN: Authenticated user
      setupAuthenticatedUser();
      const Wrapper = createTestWrapper();

      // WHEN: Header is rendered without variant prop
      render(
        <Wrapper>
          <Header />
        </Wrapper>,
      );

      // THEN: Should render a header element with data-testid
      await waitFor(() => {
        expect(screen.getByTestId("header")).toBeInTheDocument();
        expect(screen.getByTestId("header").tagName).toBe("HEADER");
      });
    });

    it("[P0] HDR-VAR-002: should render full header with variant='full'", async () => {
      // GIVEN: Authenticated user
      setupAuthenticatedUser();
      const Wrapper = createTestWrapper();

      // WHEN: Header is rendered with variant="full"
      render(
        <Wrapper>
          <Header variant="full" />
        </Wrapper>,
      );

      // THEN: Should render a header element
      await waitFor(() => {
        expect(screen.getByTestId("header")).toBeInTheDocument();
      });

      // AND: Should include datetime component
      expect(screen.getByTestId("current-datetime")).toBeInTheDocument();
    });

    it("[P1] HDR-VAR-003: full variant should have 3-column layout structure", async () => {
      // GIVEN: Authenticated user
      setupAuthenticatedUser();
      const Wrapper = createTestWrapper();

      // WHEN: Header is rendered
      render(
        <Wrapper>
          <Header variant="full" />
        </Wrapper>,
      );

      // THEN: Header should have flex layout
      await waitFor(() => {
        const header = screen.getByTestId("header");
        expect(header).toHaveClass("flex");
        expect(header).toHaveClass("justify-between");
      });
    });
  });

  // ===========================================================================
  // SECTION 2: "controls-only" Variant
  // ===========================================================================

  describe('"controls-only" Variant', () => {
    it("[P0] HDR-VAR-004: should NOT render header tag with variant='controls-only'", async () => {
      // GIVEN: Authenticated user
      setupAuthenticatedUser();
      const Wrapper = createTestWrapper();

      // WHEN: Header is rendered with variant="controls-only"
      render(
        <Wrapper>
          <Header variant="controls-only" />
        </Wrapper>,
      );

      // THEN: Should NOT render a header element with data-testid
      await waitFor(() => {
        expect(screen.queryByTestId("header")).not.toBeInTheDocument();
      });
    });

    it("[P0] HDR-VAR-005: controls-only should render store name and controls", async () => {
      // GIVEN: Authenticated user with store
      setupAuthenticatedUser();
      const Wrapper = createTestWrapper();

      // WHEN: Header is rendered with variant="controls-only"
      render(
        <Wrapper>
          <Header variant="controls-only" />
        </Wrapper>,
      );

      // THEN: Should render store name
      await waitFor(() => {
        expect(screen.getByTestId("header-store-name")).toBeInTheDocument();
        expect(screen.getByTestId("header-store-name")).toHaveTextContent(
          "Test Store",
        );
      });

      // AND: Should render logout button
      expect(screen.getByTestId("logout-button")).toBeInTheDocument();

      // AND: Should render theme toggle
      expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
    });

    it("[P0] HDR-VAR-006: controls-only should NOT render datetime", async () => {
      // GIVEN: Authenticated user
      setupAuthenticatedUser();
      const Wrapper = createTestWrapper();

      // WHEN: Header is rendered with variant="controls-only"
      render(
        <Wrapper>
          <Header variant="controls-only" />
        </Wrapper>,
      );

      // THEN: Should NOT render datetime component (mobile doesn't show it)
      await waitFor(() => {
        expect(screen.getByTestId("logout-button")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("current-datetime")).not.toBeInTheDocument();
    });

    it("[P1] HDR-VAR-007: controls-only should show login button when unauthenticated", async () => {
      // GIVEN: Unauthenticated user
      setupUnauthenticatedUser();
      const Wrapper = createTestWrapper();

      // WHEN: Header is rendered with variant="controls-only"
      render(
        <Wrapper>
          <Header variant="controls-only" />
        </Wrapper>,
      );

      // THEN: Should render login button
      expect(screen.getByTestId("login-button")).toBeInTheDocument();
    });

    it("[P1] HDR-VAR-008: controls-only should show loading skeleton when loading", async () => {
      // GIVEN: Auth is loading
      mockUseAuth.mockReturnValue({
        user: null,
        isLoading: true,
        logout: mockLogout,
      });
      mockUseClientDashboard.mockReturnValue({
        data: null,
        isLoading: false,
      });
      const Wrapper = createTestWrapper();

      // WHEN: Header is rendered with variant="controls-only"
      render(
        <Wrapper>
          <Header variant="controls-only" />
        </Wrapper>,
      );

      // THEN: Should show loading skeleton (animate-pulse class)
      const skeleton = document.querySelector(".animate-pulse");
      expect(skeleton).toBeInTheDocument();
    });

    it("[P1] HDR-VAR-009: controls-only logout should work correctly", async () => {
      // GIVEN: Authenticated user
      setupAuthenticatedUser();
      const Wrapper = createTestWrapper();
      const user = userEvent.setup();

      // WHEN: Header is rendered and logout clicked
      render(
        <Wrapper>
          <Header variant="controls-only" />
        </Wrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("logout-button")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("logout-button"));

      // THEN: Logout should be called
      expect(mockLogout).toHaveBeenCalledTimes(1);
    });
  });
});

describe("COMPONENT: Header - Page Title Display", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTheme.mockReturnValue({
      theme: "light",
      setTheme: vi.fn(),
      resolvedTheme: "light",
    });
    mockLogout.mockResolvedValue(undefined);
  });

  // ===========================================================================
  // SECTION 3: Page Title in Full Variant
  // ===========================================================================

  describe("Page Title in Full Variant", () => {
    it("[P0] HDR-VAR-010: should display page title when set via context", async () => {
      // GIVEN: Authenticated user and page title set
      setupAuthenticatedUser();
      const Wrapper = createTestWrapper();

      // WHEN: Header is rendered with page title set
      render(
        <Wrapper>
          <PageTitleSetter title="Lottery Management" />
          <Header variant="full" />
        </Wrapper>,
      );

      // THEN: Page title should be displayed
      await waitFor(() => {
        expect(screen.getByTestId("header-page-title")).toBeInTheDocument();
        expect(screen.getByTestId("header-page-title")).toHaveTextContent(
          "Lottery Management",
        );
      });
    });

    it("[P0] HDR-VAR-011: should NOT display page title when null", async () => {
      // GIVEN: Authenticated user with no page title set
      setupAuthenticatedUser();
      const Wrapper = createTestWrapper();

      // WHEN: Header is rendered without page title
      render(
        <Wrapper>
          <Header variant="full" />
        </Wrapper>,
      );

      // THEN: Page title element should not be present
      await waitFor(() => {
        expect(screen.getByTestId("header")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("header-page-title")).not.toBeInTheDocument();
    });

    it("[P1] HDR-VAR-012: page title should be centered in header", async () => {
      // GIVEN: Authenticated user with page title
      setupAuthenticatedUser();
      const Wrapper = createTestWrapper();

      // WHEN: Header is rendered with page title
      render(
        <Wrapper>
          <PageTitleSetter title="Settings" />
          <Header variant="full" />
        </Wrapper>,
      );

      // THEN: Title container should have centering classes
      await waitFor(() => {
        const titleElement = screen.getByTestId("header-page-title");
        const container = titleElement.parentElement;
        expect(container).toHaveClass("justify-center");
      });
    });

    it("[P1] HDR-VAR-013: page title should update when context changes", async () => {
      // GIVEN: Authenticated user
      setupAuthenticatedUser();
      const Wrapper = createTestWrapper();

      // Component that can change title
      function DynamicTitle({ title }: { title: string }) {
        const { setPageTitle } = useSetPageTitle();
        useEffect(() => {
          setPageTitle(title);
        }, [title, setPageTitle]);
        return null;
      }

      // WHEN: Initial render with one title
      const { rerender } = render(
        <Wrapper>
          <DynamicTitle title="Page A" />
          <Header variant="full" />
        </Wrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("header-page-title")).toHaveTextContent(
          "Page A",
        );
      });

      // Update title
      rerender(
        <Wrapper>
          <DynamicTitle title="Page B" />
          <Header variant="full" />
        </Wrapper>,
      );

      // THEN: Title should update
      await waitFor(() => {
        expect(screen.getByTestId("header-page-title")).toHaveTextContent(
          "Page B",
        );
      });
    });

    it("[P2] HDR-VAR-014: should handle long page titles with truncation", async () => {
      // GIVEN: Authenticated user with long page title
      setupAuthenticatedUser();
      const Wrapper = createTestWrapper();
      const longTitle =
        "Very Long Page Title That Should Be Truncated For Better UX";

      // WHEN: Header is rendered with long title
      render(
        <Wrapper>
          <PageTitleSetter title={longTitle} />
          <Header variant="full" />
        </Wrapper>,
      );

      // THEN: Title should have truncate class
      await waitFor(() => {
        const titleElement = screen.getByTestId("header-page-title");
        expect(titleElement).toHaveClass("truncate");
      });
    });
  });

  // ===========================================================================
  // SECTION 4: Page Title NOT in controls-only Variant
  // ===========================================================================

  describe("Page Title NOT in controls-only Variant", () => {
    it("[P0] HDR-VAR-015: controls-only should NOT display page title", async () => {
      // GIVEN: Authenticated user with page title set
      setupAuthenticatedUser();
      const Wrapper = createTestWrapper();

      // WHEN: Header is rendered with variant="controls-only" and page title
      render(
        <Wrapper>
          <PageTitleSetter title="Should Not Show" />
          <Header variant="controls-only" />
        </Wrapper>,
      );

      // THEN: Page title should NOT be displayed
      await waitFor(() => {
        expect(screen.getByTestId("logout-button")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("header-page-title")).not.toBeInTheDocument();
    });
  });
});

describe("COMPONENT: Header - Security Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTheme.mockReturnValue({
      theme: "light",
      setTheme: vi.fn(),
      resolvedTheme: "light",
    });
    mockLogout.mockResolvedValue(undefined);
  });

  // ===========================================================================
  // SECTION 5: XSS Prevention
  // ===========================================================================

  describe("XSS Prevention (SEC-004)", () => {
    it("[P0] HDR-VAR-SEC-001: should escape HTML in page title", async () => {
      // GIVEN: Authenticated user with malicious page title
      setupAuthenticatedUser();
      const Wrapper = createTestWrapper();
      const maliciousTitle = '<script>alert("xss")</script>';

      // WHEN: Header is rendered with malicious title
      render(
        <Wrapper>
          <PageTitleSetter title={maliciousTitle} />
          <Header variant="full" />
        </Wrapper>,
      );

      // THEN: Script should be escaped, not executed
      await waitFor(() => {
        const titleElement = screen.getByTestId("header-page-title");
        expect(titleElement.textContent).toBe(maliciousTitle);
        // The innerHTML should contain escaped characters
        expect(titleElement.innerHTML).toContain("&lt;script&gt;");
      });
    });

    it("[P1] HDR-VAR-SEC-002: should escape HTML in store name", async () => {
      // GIVEN: User with malicious store name
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
              name: '<img src="x" onerror="alert(1)">',
              status: "ACTIVE",
            },
          ],
        },
        isLoading: false,
      });
      const Wrapper = createTestWrapper();

      // WHEN: Header is rendered
      render(
        <Wrapper>
          <Header variant="full" />
        </Wrapper>,
      );

      // THEN: Store name should be escaped
      await waitFor(() => {
        const storeNameElement = screen.getByTestId("header-store-name");
        expect(storeNameElement.innerHTML).toContain("&lt;img");
      });
    });
  });
});

describe("COMPONENT: Header - Edge Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTheme.mockReturnValue({
      theme: "light",
      setTheme: vi.fn(),
      resolvedTheme: "light",
    });
    mockLogout.mockResolvedValue(undefined);
  });

  // ===========================================================================
  // SECTION 6: Edge Cases
  // ===========================================================================

  describe("Edge Cases", () => {
    it("[P2] HDR-VAR-016: should work without PageTitleProvider (usePageTitleSafe)", async () => {
      // GIVEN: Authenticated user, NO PageTitleProvider
      setupAuthenticatedUser();
      const Wrapper = createTestWrapper({ withPageTitleProvider: false });

      // WHEN: Header is rendered without PageTitleProvider
      render(
        <Wrapper>
          <Header variant="full" />
        </Wrapper>,
      );

      // THEN: Should render without crashing, no page title shown
      await waitFor(() => {
        expect(screen.getByTestId("header")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("header-page-title")).not.toBeInTheDocument();
    });

    it("[P2] HDR-VAR-017: should handle empty string page title", async () => {
      // GIVEN: Authenticated user with empty string title
      setupAuthenticatedUser();
      const Wrapper = createTestWrapper();

      // WHEN: Header is rendered with empty string title
      render(
        <Wrapper>
          <PageTitleSetter title="" />
          <Header variant="full" />
        </Wrapper>,
      );

      // THEN: Empty title element should still be rendered (truthy check on empty string)
      // Note: This depends on implementation - empty string is falsy so title won't show
      await waitFor(() => {
        expect(screen.getByTestId("header")).toBeInTheDocument();
      });
    });

    it("[P2] HDR-VAR-018: should handle special characters in page title", async () => {
      // GIVEN: Authenticated user with special characters in title
      setupAuthenticatedUser();
      const Wrapper = createTestWrapper();
      const specialTitle = 'Reports & Analytics "2024" <Data>';

      // WHEN: Header is rendered with special characters
      render(
        <Wrapper>
          <PageTitleSetter title={specialTitle} />
          <Header variant="full" />
        </Wrapper>,
      );

      // THEN: Special characters should be preserved
      await waitFor(() => {
        expect(screen.getByTestId("header-page-title")).toHaveTextContent(
          specialTitle,
        );
      });
    });

    it("[P2] HDR-VAR-019: controls-only should handle loading store name", async () => {
      // GIVEN: Authenticated user with loading store data
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
      const Wrapper = createTestWrapper();

      // WHEN: Header is rendered with loading store
      render(
        <Wrapper>
          <Header variant="controls-only" />
        </Wrapper>,
      );

      // THEN: Should show loading skeleton for store name
      await waitFor(() => {
        expect(
          screen.getByTestId("header-store-name-loading"),
        ).toBeInTheDocument();
      });
    });
  });
});
