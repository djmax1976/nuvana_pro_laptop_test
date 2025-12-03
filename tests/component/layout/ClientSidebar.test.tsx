/**
 * @test-level Component
 * @justification Component tests for ClientSidebar - validates "Shift Management" and "Daily Summary" navigation links and routing
 * @story 4-8-cashier-shift-start-flow
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen } from "../../support/test-utils";
import { ClientSidebar } from "@/components/layout/ClientSidebar";
import userEvent from "@testing-library/user-event";

// Mock Next.js navigation
const mockPush = vi.fn();
const mockPathname = vi.fn(() => "/client-dashboard");

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => mockPathname(),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock ClientAuthContext
const mockUser = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  email: "cashier@test.com",
  name: "Test Cashier",
  is_client_user: true,
};

const mockUseClientAuth = vi.fn();
vi.mock("@/contexts/ClientAuthContext", () => ({
  useClientAuth: () => mockUseClientAuth(),
}));

describe("4.8-COMPONENT: ClientSidebar Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname.mockReturnValue("/client-dashboard");
    mockUseClientAuth.mockReturnValue({
      user: mockUser,
      permissions: ["SHIFT_OPEN"],
      isLoading: false,
      isAuthenticated: true,
      isClientUser: true,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });
  });

  it("[P0] 4.8-COMPONENT-024: should display 'Shift Management' navigation link", () => {
    // GIVEN: ClientSidebar is rendered
    renderWithProviders(<ClientSidebar />);

    // THEN: "Shift Management" link should be visible
    expect(screen.getByText(/shift management/i)).toBeInTheDocument();
  });

  it("[P0] 4.8-COMPONENT-025: should display 'Daily Summary' navigation link", () => {
    // GIVEN: ClientSidebar is rendered
    renderWithProviders(<ClientSidebar />);

    // THEN: "Daily Summary" link should be visible
    expect(screen.getByText(/daily summary/i)).toBeInTheDocument();
  });

  it("[P0] 4.8-COMPONENT-026: should navigate to /client-dashboard/shifts when 'Shift Management' link is clicked", async () => {
    // GIVEN: ClientSidebar is rendered
    const user = userEvent.setup();
    renderWithProviders(<ClientSidebar />);

    // WHEN: "Shift Management" link is clicked
    const shiftsLink = screen.getByText(/shift management/i).closest("a");
    if (shiftsLink) {
      await user.click(shiftsLink);
    }

    // THEN: Should navigate to /client-dashboard/shifts
    const link = screen.getByText(/shift management/i).closest("a");
    expect(link).toHaveAttribute("href", "/client-dashboard/shifts");
  });

  it("[P0] 4.8-COMPONENT-027: should navigate to /client-dashboard/shift-and-day when 'Daily Summary' link is clicked", async () => {
    // GIVEN: ClientSidebar is rendered
    const user = userEvent.setup();
    renderWithProviders(<ClientSidebar />);

    // WHEN: "Daily Summary" link is clicked
    const dailySummaryLink = screen.getByText(/daily summary/i).closest("a");
    if (dailySummaryLink) {
      await user.click(dailySummaryLink);
    }

    // THEN: Should navigate to /client-dashboard/shift-and-day
    const link = screen.getByText(/daily summary/i).closest("a");
    expect(link).toHaveAttribute("href", "/client-dashboard/shift-and-day");
  });

  it("[P1] 4.8-COMPONENT-028: should highlight 'Shift Management' link when on shifts page", () => {
    // GIVEN: User is on the shifts page
    mockPathname.mockReturnValue("/client-dashboard/shifts");

    renderWithProviders(<ClientSidebar />);

    // THEN: "Shift Management" link should be highlighted/active
    const link = screen.getByText(/shift management/i).closest("a");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/client-dashboard/shifts");
    expect(link).toHaveClass("bg-primary");
    expect(link).toHaveClass("text-primary-foreground");
  });

  it("[P1] 4.8-COMPONENT-029: should highlight 'Daily Summary' link when on shift-and-day page", () => {
    // GIVEN: User is on the shift-and-day page
    mockPathname.mockReturnValue("/client-dashboard/shift-and-day");

    renderWithProviders(<ClientSidebar />);

    // THEN: "Daily Summary" link should be highlighted/active
    const link = screen.getByText(/daily summary/i).closest("a");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/client-dashboard/shift-and-day");
    expect(link).toHaveClass("bg-primary");
    expect(link).toHaveClass("text-primary-foreground");
  });
});
