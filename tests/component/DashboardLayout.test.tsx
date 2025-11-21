import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

// Mock the child components
vi.mock("@/components/layout/Sidebar", () => ({
  Sidebar: ({ onNavigate }: { onNavigate?: () => void }) => (
    <div data-testid="sidebar-navigation">
      <a href="/dashboard" onClick={onNavigate}>
        Dashboard
      </a>
      <a href="/companies" onClick={onNavigate}>
        Companies
      </a>
    </div>
  ),
}));

vi.mock("@/components/layout/Header", () => ({
  Header: () => <div>Header</div>,
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

describe("DashboardLayout Accessibility", () => {
  it("[P0] should have accessible title for mobile sidebar dialog", () => {
    render(
      <DashboardLayout>
        <div>Test Content</div>
      </DashboardLayout>,
    );

    // Open mobile sidebar by clicking hamburger
    const hamburger = screen.getByTestId("sidebar-toggle");
    fireEvent.click(hamburger);

    // Should have accessible dialog with title
    const dialog = screen.getByRole("dialog", { name: /navigation menu/i });
    expect(dialog).toBeInTheDocument();
  });

  it("[P0] should have accessible description for mobile sidebar", () => {
    render(
      <DashboardLayout>
        <div>Test Content</div>
      </DashboardLayout>,
    );

    // Open mobile sidebar
    const hamburger = screen.getByTestId("sidebar-toggle");
    fireEvent.click(hamburger);

    // Should have description (even if visually hidden with sr-only)
    const description = screen.getByText(
      /main navigation menu for the application/i,
    );
    expect(description).toBeInTheDocument();
    expect(description).toHaveClass("sr-only");
  });

  it("[P1] should hide title and description visually but keep for screen readers", () => {
    render(
      <DashboardLayout>
        <div>Test Content</div>
      </DashboardLayout>,
    );

    // Open mobile sidebar
    const hamburger = screen.getByTestId("sidebar-toggle");
    fireEvent.click(hamburger);

    // Both should have sr-only class (use getAllByText since there might be duplicates in DOM)
    const titles = screen.getAllByText(/navigation menu/i);
    const descriptions = screen.getAllByText(
      /main navigation menu for the application/i,
    );

    // At least one should have sr-only class
    expect(titles.some((el) => el.className.includes("sr-only"))).toBe(true);
    expect(descriptions.some((el) => el.className.includes("sr-only"))).toBe(
      true,
    );
  });
});

describe("DashboardLayout Mobile Behavior", () => {
  it("[P0] should open sidebar when hamburger is clicked", async () => {
    render(
      <DashboardLayout>
        <div>Test Content</div>
      </DashboardLayout>,
    );

    const hamburger = screen.getByTestId("sidebar-toggle");
    fireEvent.click(hamburger);

    await waitFor(() => {
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();
    });
  });

  it("[P0] should render sidebar content when opened", async () => {
    render(
      <DashboardLayout>
        <div>Test Content</div>
      </DashboardLayout>,
    );

    const hamburger = screen.getByTestId("sidebar-toggle");
    fireEvent.click(hamburger);

    await waitFor(() => {
      // Both desktop and mobile sidebars use the same Sidebar component with same testid
      // Check that the mobile sidebar within the dialog is visible
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();

      const sidebars = screen.getAllByTestId("sidebar-navigation");
      // Should have both desktop (hidden) and mobile (visible in dialog) sidebars
      expect(sidebars.length).toBe(2);
    });
  });

  it("[P0] should automatically close mobile sidebar when navigation link is clicked", async () => {
    render(
      <DashboardLayout>
        <div>Test Content</div>
      </DashboardLayout>,
    );

    // GIVEN: Mobile sidebar is closed initially
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // WHEN: User opens the sidebar via hamburger menu
    const hamburger = screen.getByTestId("sidebar-toggle");
    fireEvent.click(hamburger);

    // THEN: Sidebar should be open
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    // WHEN: User clicks any navigation link in the mobile sidebar
    // Get all sidebar instances, the second one is in the mobile Sheet dialog
    const mobileSidebarNavs = screen.getAllByTestId("sidebar-navigation");
    const mobileSidebar = mobileSidebarNavs[1]; // Mobile sidebar (in dialog)

    // Find the first navigation link within the mobile sidebar
    const navLinks = mobileSidebar.querySelectorAll("a[href]");
    expect(navLinks.length).toBeGreaterThan(0);

    fireEvent.click(navLinks[0]);

    // THEN: Mobile sidebar should automatically close
    await waitFor(
      () => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      },
      {
        timeout: 3000,
      },
    );
  });

  it("[P1] should have hamburger menu button", () => {
    render(
      <DashboardLayout>
        <div>Test Content</div>
      </DashboardLayout>,
    );

    const hamburger = screen.getByTestId("sidebar-toggle");
    expect(hamburger).toBeInTheDocument();
    expect(hamburger.tagName.toLowerCase()).toBe("button");
  });
});

describe("DashboardLayout Structure", () => {
  it("[P0] should render main content area", () => {
    render(
      <DashboardLayout>
        <div data-testid="test-content">Test Content</div>
      </DashboardLayout>,
    );

    const main = screen.getByRole("main");
    expect(main).toBeInTheDocument();

    const content = screen.getByTestId("test-content");
    expect(content).toBeInTheDocument();
  });

  it("[P0] should have proper semantic structure", () => {
    render(
      <DashboardLayout>
        <div>Test Content</div>
      </DashboardLayout>,
    );

    // Should have main landmark
    expect(screen.getByRole("main")).toBeInTheDocument();

    // Should have aside for desktop sidebar
    const layout = screen.getByTestId("dashboard-layout");
    expect(layout).toBeInTheDocument();
  });

  it("[P1] should render children inside main element", () => {
    const testContent = "Unique Test Content";
    render(
      <DashboardLayout>
        <div>{testContent}</div>
      </DashboardLayout>,
    );

    const main = screen.getByRole("main");
    expect(main).toHaveTextContent(testContent);
  });
});

describe("DashboardLayout Responsive Design", () => {
  it("[P1] should have responsive classes for mobile header", () => {
    render(
      <DashboardLayout>
        <div>Test Content</div>
      </DashboardLayout>,
    );

    const hamburger = screen.getByTestId("sidebar-toggle");
    const parent = hamburger.closest(".lg\\:hidden");
    expect(parent).toBeInTheDocument();
  });

  it("[P1] should have responsive classes for desktop sidebar", () => {
    const { container } = render(
      <DashboardLayout>
        <div>Test Content</div>
      </DashboardLayout>,
    );

    const desktopSidebar = container.querySelector("aside.hidden.lg\\:block");
    expect(desktopSidebar).toBeInTheDocument();
  });
});
