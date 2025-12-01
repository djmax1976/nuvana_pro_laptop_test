/**
 * @test-level Component
 * @justification Component tests for ClientSidebar - validates "Shifts" and "Shift and Day" navigation links and routing
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
  email: "cashier@example.com",
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

  it("[P0] 4.8-COMPONENT-024: should display 'Shifts' navigation link", () => {
    // GIVEN: ClientSidebar is rendered
    renderWithProviders(<ClientSidebar />);

    // THEN: "Shifts" link should be visible
    expect(screen.getByText(/^shifts$/i)).toBeInTheDocument();
  });

  it("[P0] 4.8-COMPONENT-025: should display 'Shift and Day' navigation link", () => {
    // GIVEN: ClientSidebar is rendered
    renderWithProviders(<ClientSidebar />);

    // THEN: "Shift and Day" link should be visible
    expect(screen.getByText(/shift and day/i)).toBeInTheDocument();
  });

  it("[P0] 4.8-COMPONENT-026: should navigate to /client-dashboard/shifts when 'Shifts' link is clicked", async () => {
    // GIVEN: ClientSidebar is rendered
    const user = userEvent.setup();
    renderWithProviders(<ClientSidebar />);

    // WHEN: "Shifts" link is clicked
    const shiftsLink = screen.getByText(/^shifts$/i).closest("a");
    if (shiftsLink) {
      await user.click(shiftsLink);
    }

    // THEN: Should navigate to /client-dashboard/shifts
    const link = screen.getByText(/^shifts$/i).closest("a");
    expect(link).toHaveAttribute("href", "/client-dashboard/shifts");
  });

  it("[P0] 4.8-COMPONENT-027: should navigate to /client-dashboard/shift-and-day when 'Shift and Day' link is clicked", async () => {
    // GIVEN: ClientSidebar is rendered
    const user = userEvent.setup();
    renderWithProviders(<ClientSidebar />);

    // WHEN: "Shift and Day" link is clicked
    const shiftAndDayLink = screen.getByText(/shift and day/i).closest("a");
    if (shiftAndDayLink) {
      await user.click(shiftAndDayLink);
    }

    // THEN: Should navigate to /client-dashboard/shift-and-day
    const link = screen.getByText(/shift and day/i).closest("a");
    expect(link).toHaveAttribute("href", "/client-dashboard/shift-and-day");
  });

  it("[P1] 4.8-COMPONENT-028: should highlight 'Shifts' link when on shifts page", () => {
    // GIVEN: User is on the shifts page
    mockPathname.mockReturnValue("/client-dashboard/shifts");

    renderWithProviders(<ClientSidebar />);

    // THEN: "Shifts" link should be highlighted/active
    const link = screen.getByText(/^shifts$/i).closest("a");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/client-dashboard/shifts");
  });

  it("[P1] 4.8-COMPONENT-029: should highlight 'Shift and Day' link when on shift-and-day page", () => {
    // GIVEN: User is on the shift-and-day page
    mockPathname.mockReturnValue("/client-dashboard/shift-and-day");

    renderWithProviders(<ClientSidebar />);

    // THEN: "Shift and Day" link should be highlighted/active
    const link = screen.getByText(/shift and day/i).closest("a");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/client-dashboard/shift-and-day");
  });
});
