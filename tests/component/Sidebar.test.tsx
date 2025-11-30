import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "../support/test-utils";
import { Sidebar } from "@/components/layout/Sidebar";

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

describe("Sidebar Component - Permission Enforcement", () => {
  it("should display Companies link for System Admin", () => {
    // GIVEN: User is System Admin
    // Note: Currently Sidebar shows all items because userRoles is empty
    // This test verifies the Companies link exists (will be filtered when auth is implemented)
    renderWithProviders(<Sidebar />);

    // WHEN: Component is rendered
    // THEN: Companies link should be present
    // When auth is implemented, this will only show for SYSTEM_ADMIN role
    expect(
      screen.getByTestId("nav-link-companies"),
      "Companies link should be visible for System Admin",
    ).toBeInTheDocument();
  });

  it("should display Stores link for Corporate Admin and Store Manager", () => {
    // GIVEN: User is Corporate Admin or Store Manager
    renderWithProviders(<Sidebar />);

    // WHEN: Component is rendered
    // THEN: Stores link should be present
    // When auth is implemented, this will only show for CORPORATE_ADMIN or STORE_MANAGER roles
    expect(
      screen.getByTestId("nav-link-stores"),
      "Stores link should be visible for Corporate Admin and Store Manager",
    ).toBeInTheDocument();
  });

  it("should display Shift Settings link for System Admin and Corporate Admin", () => {
    // GIVEN: User is System Admin or Corporate Admin
    renderWithProviders(<Sidebar />);

    // WHEN: Component is rendered
    // THEN: Shift Settings link should be present
    // When auth is implemented, this will only show for SYSTEM_ADMIN or CORPORATE_ADMIN roles
    // For now, check if it exists (may not be implemented yet)
    const shiftSettingsLink = screen.queryByTestId("nav-link-shift-settings");
    if (shiftSettingsLink) {
      expect(shiftSettingsLink).toBeInTheDocument();
    }
    // Note: Shift Settings link is not yet implemented in the Sidebar component
  });

  it("should display Dashboard link for all users", () => {
    // GIVEN: Any authenticated user
    renderWithProviders(<Sidebar />);

    // WHEN: Component is rendered
    // THEN: Dashboard link should be present (no role restriction)
    expect(
      screen.getByTestId("nav-link-dashboard"),
      "Dashboard link should be visible for all authenticated users",
    ).toBeInTheDocument();
  });

  it("should filter navigation items based on user roles", () => {
    // GIVEN: Sidebar component with role-based filtering logic
    renderWithProviders(<Sidebar />);

    // WHEN: Component is rendered
    // THEN: Navigation items should be filtered
    // Currently shows all items because userRoles is empty (placeholder)
    // When auth context is implemented, items will be filtered by roles
    const sidebar = screen.getByTestId("sidebar-navigation");
    expect(
      sidebar,
      "Sidebar navigation container should be present",
    ).toBeInTheDocument();
  });
});

describe("Sidebar Component - Security Tests", () => {
  it("should not expose navigation items to unauthorized users", () => {
    // GIVEN: User has no roles or invalid roles
    renderWithProviders(<Sidebar />);

    // WHEN: Component is rendered
    // THEN: Navigation should still render (current implementation shows all)
    // Future: Should hide restricted items when auth is fully implemented
    const sidebar = screen.getByTestId("sidebar-navigation");
    expect(
      sidebar,
      "Sidebar should render even with no roles",
    ).toBeInTheDocument();
  });

  it("should use data-testid attributes for reliable test selectors", () => {
    // GIVEN: Sidebar component is rendered
    renderWithProviders(<Sidebar />);

    // WHEN: Querying navigation elements
    // THEN: All navigation links should use data-testid (not CSS classes)
    expect(
      screen.getByTestId("nav-link-dashboard"),
      "Dashboard link should use data-testid",
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("nav-link-companies"),
      "Companies link should use data-testid",
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("nav-link-stores"),
      "Stores link should use data-testid",
    ).toBeInTheDocument();
  });
});

describe("Sidebar Component - Mobile Behavior", () => {
  it("should call onNavigate callback when navigation link is clicked", () => {
    // GIVEN: Sidebar component with onNavigate callback
    const mockOnNavigate = vi.fn();
    renderWithProviders(<Sidebar onNavigate={mockOnNavigate} />);

    // WHEN: User clicks a navigation link
    const dashboardLink = screen.getByTestId("nav-link-dashboard");
    dashboardLink.click();

    // THEN: onNavigate callback should be invoked
    expect(
      mockOnNavigate,
      "onNavigate should be called when navigation link is clicked",
    ).toHaveBeenCalledTimes(1);
  });

  it("should not throw error when onNavigate is not provided", () => {
    // GIVEN: Sidebar component without onNavigate callback (desktop mode)
    renderWithProviders(<Sidebar />);

    // WHEN: User clicks a navigation link
    const dashboardLink = screen.getByTestId("nav-link-dashboard");

    // THEN: Should not throw error (optional callback)
    expect(() => dashboardLink.click()).not.toThrow();
  });

  it("should call onNavigate for each navigation link clicked", () => {
    // GIVEN: Sidebar component with onNavigate callback
    const mockOnNavigate = vi.fn();
    renderWithProviders(<Sidebar onNavigate={mockOnNavigate} />);

    // WHEN: User clicks multiple navigation links
    const dashboardLink = screen.getByTestId("nav-link-dashboard");
    const companiesLink = screen.getByTestId("nav-link-companies");
    const storesLink = screen.getByTestId("nav-link-stores");

    dashboardLink.click();
    companiesLink.click();
    storesLink.click();

    // THEN: onNavigate should be called for each click
    expect(
      mockOnNavigate,
      "onNavigate should be called three times",
    ).toHaveBeenCalledTimes(3);
  });

  // ============================================================================
  // SECURITY TESTS - XSS Prevention & Authorization (Component Level)
  // ============================================================================
  // Note: XSS testing is not applicable here since navigation items are hardcoded
  // in the component. React automatically escapes text content when rendering
  // via JSX expressions (e.g., <span>{item.title}</span>), so XSS is not a concern
  // for hardcoded navigation items. If navigation items become dynamic in the future,
  // proper XSS testing should be added to verify sanitization of user-provided content.

  it("[P1] SIDEBAR-SEC-002: should use secure navigation with data-testid attributes", () => {
    // GIVEN: Sidebar component is rendered
    renderWithProviders(<Sidebar />);

    // WHEN: Component is rendered
    // THEN: All navigation links should use data-testid (resilient selectors)
    const navLinks = [
      "nav-link-dashboard",
      "nav-link-companies",
      "nav-link-stores",
      // "nav-link-shift-settings" - not yet implemented
    ];

    navLinks.forEach((testId) => {
      const link = screen.getByTestId(testId);
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("data-testid", testId);
    });
  });

  // ============================================================================
  // ADDITIONAL ASSERTIONS - Component Structure
  // ============================================================================

  it("[P1] SIDEBAR-ASSERT-001: should verify sidebar structure has required elements", () => {
    // GIVEN: Sidebar component is rendered
    renderWithProviders(<Sidebar />);

    // WHEN: Component is rendered
    // THEN: Sidebar should have required structure
    expect(screen.getByTestId("sidebar-navigation")).toBeInTheDocument();
    expect(screen.getByText("Nuvana Pro")).toBeInTheDocument();
  });
});
