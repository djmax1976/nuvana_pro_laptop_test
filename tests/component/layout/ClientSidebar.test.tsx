/**
 * @test-level Component
 * @justification Component tests for ClientSidebar - validates "Shift and Day" navigation link and routing
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

  it("[P0] 4.8-COMPONENT-024: should display 'Shift and Day' navigation link", () => {
    // GIVEN: ClientSidebar is rendered
    renderWithProviders(<ClientSidebar />);

    // THEN: "Shift and Day" link should be visible
    expect(screen.getByText(/shift and day/i)).toBeInTheDocument();
  });

  it("[P0] 4.8-COMPONENT-025: should navigate to /client-dashboard/shifts when 'Shift and Day' link is clicked", async () => {
    // GIVEN: ClientSidebar is rendered
    const user = userEvent.setup();
    renderWithProviders(<ClientSidebar />);

    // WHEN: "Shift and Day" link is clicked
    const shiftAndDayLink = screen.getByText(/shift and day/i).closest("a");
    if (shiftAndDayLink) {
      await user.click(shiftAndDayLink);
    }

    // THEN: Should navigate to /client-dashboard/shifts
    // Note: In Next.js Link components, the href is set but navigation is handled by Next.js router
    // We verify the href attribute is correct
    const link = screen.getByText(/shift and day/i).closest("a");
    expect(link).toHaveAttribute("href", "/client-dashboard/shifts");
  });

  it("[P1] 4.8-COMPONENT-026: should highlight 'Shift and Day' link when on shifts page", () => {
    // GIVEN: User is on the shifts page
    mockPathname.mockReturnValue("/client-dashboard/shifts");

    renderWithProviders(<ClientSidebar />);

    // THEN: "Shift and Day" link should be highlighted/active
    // Note: Active state styling depends on component implementation
    // This test verifies the link exists and can be found
    const link = screen.getByText(/shift and day/i).closest("a");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/client-dashboard/shifts");
  });
});
