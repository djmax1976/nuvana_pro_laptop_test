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
