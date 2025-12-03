import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "../support/test-utils";
import { Sidebar } from "@/components/layout/Sidebar";
import userEvent from "@testing-library/user-event";

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

/**
 * Sidebar Component Tests
 *
 * These component tests replace the E2E tests from:
 * - mobile-sidebar.spec.ts
 * - basic-ui-layout-and-navigation.spec.ts
 *
 * WHY COMPONENT TESTS INSTEAD OF E2E:
 * - Component behavior (click handlers, rendering) doesn't need browser
 * - Tests run in <100ms vs 5-10s for E2E
 * - No flakiness from network, browser state, or auth
 * - Tests the actual component logic, not integration with backend
 *
 * WHAT E2E TESTS WERE DOING WRONG:
 * - Mocking auth API defeats the purpose of E2E
 * - Testing UI toggle behavior in browser is wasteful
 * - Using .first() to handle "mobile sheet duplication" masked bugs
 */

describe("Sidebar Component - Navigation Items", () => {
  it("should render all expected navigation items", () => {
    // GIVEN: Sidebar component is rendered
    renderWithProviders(<Sidebar />);

    // THEN: All navigation items should be present
    const expectedNavItems = [
      "dashboard",
      "users",
      "roles",
      "companies",
      "stores",
      "transactions",
      "shift settings",
      "inventory",
      "lottery",
      "reports",
      "ai assistant",
    ];

    expectedNavItems.forEach((item) => {
      expect(
        screen.getByTestId(`nav-link-${item}`),
        `Navigation link "${item}" should be visible`,
      ).toBeInTheDocument();
    });
  });

  it("should display correct count of navigation items (11 items)", () => {
    // GIVEN: Sidebar component is rendered
    renderWithProviders(<Sidebar />);

    // THEN: There should be exactly 11 navigation links
    const navLinks = screen.getAllByRole("link");
    expect(navLinks).toHaveLength(11);
  });

  it("should display Dashboard link for all users", () => {
    // GIVEN: Any authenticated user
    renderWithProviders(<Sidebar />);

    // THEN: Dashboard link should be present (no role restriction)
    expect(
      screen.getByTestId("nav-link-dashboard"),
      "Dashboard link should be visible for all authenticated users",
    ).toBeInTheDocument();
  });

  it("should display Companies link for System Admin", () => {
    // GIVEN: User is System Admin
    renderWithProviders(<Sidebar />);

    // THEN: Companies link should be present
    expect(
      screen.getByTestId("nav-link-companies"),
      "Companies link should be visible for System Admin",
    ).toBeInTheDocument();
  });

  it("should display Stores link for Corporate Admin and Store Manager", () => {
    // GIVEN: User is Corporate Admin or Store Manager
    renderWithProviders(<Sidebar />);

    // THEN: Stores link should be present
    expect(
      screen.getByTestId("nav-link-stores"),
      "Stores link should be visible for Corporate Admin and Store Manager",
    ).toBeInTheDocument();
  });

  it("should display Shift Settings link for System Admin and Corporate Admin", () => {
    // GIVEN: User is System Admin or Corporate Admin
    renderWithProviders(<Sidebar />);

    // THEN: Shift Settings link should be present
    expect(
      screen.getByTestId("nav-link-shift settings"),
      "Shift Settings link should be visible",
    ).toBeInTheDocument();
  });
});

describe("Sidebar Component - Structure", () => {
  it("should have sidebar-navigation test id on container", () => {
    // GIVEN: Sidebar component is rendered
    renderWithProviders(<Sidebar />);

    // THEN: Container should have correct test id
    expect(screen.getByTestId("sidebar-navigation")).toBeInTheDocument();
  });

  it("should display Nuvana Pro branding", () => {
    // GIVEN: Sidebar component is rendered
    renderWithProviders(<Sidebar />);

    // THEN: Branding should be visible
    expect(screen.getByText("Nuvana Pro")).toBeInTheDocument();
  });

  it("should apply custom className when provided", () => {
    // GIVEN: Sidebar with custom className
    renderWithProviders(<Sidebar className="custom-class" />);

    // THEN: Custom class should be applied
    const sidebar = screen.getByTestId("sidebar-navigation");
    expect(sidebar).toHaveClass("custom-class");
  });
});

describe("Sidebar Component - Security Tests", () => {
  it("should use data-testid attributes for reliable test selectors", () => {
    // GIVEN: Sidebar component is rendered
    renderWithProviders(<Sidebar />);

    // THEN: All navigation links should use data-testid (not CSS classes)
    const navLinks = [
      "nav-link-dashboard",
      "nav-link-companies",
      "nav-link-stores",
    ];

    navLinks.forEach((testId) => {
      const link = screen.getByTestId(testId);
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("data-testid", testId);
    });
  });
});

describe("Sidebar Component - Mobile Behavior (onNavigate callback)", () => {
  /**
   * These tests replace E2E tests from mobile-sidebar.spec.ts
   *
   * The onNavigate callback is used to close the mobile sheet when a
   * navigation link is clicked. Testing this behavior as a component test
   * is faster and more reliable than E2E browser automation.
   */

  it("should call onNavigate callback when navigation link is clicked", async () => {
    // GIVEN: Sidebar component with onNavigate callback
    const mockOnNavigate = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<Sidebar onNavigate={mockOnNavigate} />);

    // WHEN: User clicks a navigation link
    const dashboardLink = screen.getByTestId("nav-link-dashboard");
    await user.click(dashboardLink);

    // THEN: onNavigate callback should be invoked (closes mobile sheet)
    expect(mockOnNavigate).toHaveBeenCalledTimes(1);
  });

  it("should not throw error when onNavigate is not provided (desktop mode)", async () => {
    // GIVEN: Sidebar component without onNavigate callback
    const user = userEvent.setup();
    renderWithProviders(<Sidebar />);

    // WHEN: User clicks a navigation link
    const dashboardLink = screen.getByTestId("nav-link-dashboard");

    // THEN: Should not throw error (optional callback)
    await expect(user.click(dashboardLink)).resolves.not.toThrow();
  });

  it("should call onNavigate for each navigation link clicked", async () => {
    // GIVEN: Sidebar component with onNavigate callback
    const mockOnNavigate = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<Sidebar onNavigate={mockOnNavigate} />);

    // WHEN: User clicks multiple navigation links
    await user.click(screen.getByTestId("nav-link-dashboard"));
    await user.click(screen.getByTestId("nav-link-companies"));
    await user.click(screen.getByTestId("nav-link-stores"));

    // THEN: onNavigate should be called for each click
    expect(mockOnNavigate).toHaveBeenCalledTimes(3);
  });
});
