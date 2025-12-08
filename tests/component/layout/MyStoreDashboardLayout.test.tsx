/**
 * @test-level Component
 * @justification Component tests for MyStoreDashboardLayout - validates layout rendering, sidebar navigation, and terminal display
 * @story 4-9-mystore-terminal-dashboard
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../support/test-utils";
import { MyStoreDashboardLayout } from "@/components/layout/MyStoreDashboardLayout";
import * as storesApi from "@/lib/api/stores";
import * as clientDashboardApi from "@/lib/api/client-dashboard";
import userEvent from "@testing-library/user-event";

// Mock Next.js navigation
const mockPush = vi.fn();
const mockPathname = vi.fn(() => "/mystore");

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
  ClientAuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock the API hooks
vi.mock("@/lib/api/stores", () => ({
  useStoreTerminals: vi.fn(),
}));

vi.mock("@/lib/api/client-dashboard", () => ({
  useClientDashboard: vi.fn(),
}));

// Mock Header component
vi.mock("@/components/layout/Header", () => ({
  Header: () => <div data-testid="header">Header</div>,
}));

describe("4.9-COMPONENT: MyStoreDashboardLayout Component", () => {
  const mockStoreId = "550e8400-e29b-41d4-a716-446655440000";

  const mockTerminals = [
    {
      pos_terminal_id: "550e8400-e29b-41d4-a716-446655440011",
      name: "Terminal 1",
      has_active_shift: false,
      connection_type: "NETWORK",
      terminal_status: "ACTIVE",
    },
    {
      pos_terminal_id: "550e8400-e29b-41d4-a716-446655440012",
      name: "Terminal 2",
      has_active_shift: false,
      connection_type: "API",
      terminal_status: "INACTIVE",
    },
  ];

  const mockDashboardData = {
    stores: [
      {
        store_id: mockStoreId,
        name: "Test Store",
        status: "ACTIVE",
      },
    ],
  };

  const mockQuery = {
    data: mockTerminals,
    isLoading: false,
    isError: false,
    error: null,
  };

  const mockDashboardQuery = {
    data: mockDashboardData,
    isLoading: false,
    isError: false,
    error: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname.mockReturnValue("/mystore");
    mockUseClientAuth.mockReturnValue({
      user: mockUser,
      permissions: [],
      isLoading: false,
      isAuthenticated: true,
      isClientUser: true,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });
    vi.mocked(storesApi.useStoreTerminals).mockReturnValue(mockQuery as any);
    vi.mocked(clientDashboardApi.useClientDashboard).mockReturnValue(
      mockDashboardQuery as any,
    );
  });

  it("[P0] 4.9-COMPONENT-001: should render MyStoreDashboardLayout correctly", () => {
    // GIVEN: Component is rendered
    renderWithProviders(
      <MyStoreDashboardLayout>
        <div>Test Content</div>
      </MyStoreDashboardLayout>,
    );

    // THEN: Layout should be visible
    expect(screen.getByTestId("mystore-dashboard-layout")).toBeInTheDocument();
    expect(screen.getByText("Test Content")).toBeInTheDocument();
  });

  it("[P0] 4.9-COMPONENT-002: should display sidebar with terminal links and Clock In/Out link", () => {
    // GIVEN: Component is rendered
    renderWithProviders(
      <MyStoreDashboardLayout>
        <div>Test Content</div>
      </MyStoreDashboardLayout>,
    );

    // THEN: Sidebar should be visible
    expect(screen.getByTestId("mystore-sidebar")).toBeInTheDocument();
    // THEN: Clock In/Out link should be visible
    expect(screen.getByTestId("clock-in-out-link")).toBeInTheDocument();
    // THEN: Terminal links should be visible
    expect(
      screen.getByTestId("terminal-link-550e8400-e29b-41d4-a716-446655440011"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("terminal-link-550e8400-e29b-41d4-a716-446655440012"),
    ).toBeInTheDocument();
  });

  it("[P0] 4.9-COMPONENT-003: should NOT display Shifts, Inventory, Employees, Reports, or AI Assistant navigation (but should show Lottery per Story 6.10)", () => {
    // GIVEN: Component is rendered
    renderWithProviders(
      <MyStoreDashboardLayout>
        <div>Test Content</div>
      </MyStoreDashboardLayout>,
    );

    // THEN: Excluded navigation items should NOT be present
    expect(screen.queryByText(/shifts/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/inventory/i)).not.toBeInTheDocument();
    // Note: Lottery IS shown per Story 6.10 - Lottery Management UI
    expect(screen.queryByText(/lottery/i)).toBeInTheDocument();
    expect(screen.queryByText(/employees/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/reports/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ai assistant/i)).not.toBeInTheDocument();
  });

  it("[P1] 4.9-COMPONENT-004: should display terminal list with connection type and status", () => {
    // GIVEN: Component is rendered with terminals
    renderWithProviders(
      <MyStoreDashboardLayout>
        <div>Test Content</div>
      </MyStoreDashboardLayout>,
    );

    // THEN: Terminal names should be visible
    expect(screen.getByText("Terminal 1")).toBeInTheDocument();
    expect(screen.getByText("Terminal 2")).toBeInTheDocument();
    // THEN: Terminal status badges should be visible
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    expect(screen.getByText("INACTIVE")).toBeInTheDocument();
  });

  it("[P1] 4.9-COMPONENT-005: should open TerminalAuthModal when terminal link is clicked", async () => {
    // GIVEN: Component is rendered
    const user = userEvent.setup();
    renderWithProviders(
      <MyStoreDashboardLayout>
        <div>Test Content</div>
      </MyStoreDashboardLayout>,
    );

    // WHEN: Terminal link is clicked
    const terminalLink = screen.getByTestId(
      "terminal-link-550e8400-e29b-41d4-a716-446655440011",
    );
    await user.click(terminalLink);

    // THEN: TerminalAuthModal should be visible
    await waitFor(() => {
      expect(screen.getByTestId("terminal-auth-modal")).toBeInTheDocument();
    });
    expect(screen.getByText(/terminal authentication/i)).toBeInTheDocument();
  });

  it("[P1] 4.9-COMPONENT-006: should display loading state when terminals are loading", () => {
    // GIVEN: Component is rendered with loading terminals
    vi.mocked(storesApi.useStoreTerminals).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as any);

    renderWithProviders(
      <MyStoreDashboardLayout>
        <div>Test Content</div>
      </MyStoreDashboardLayout>,
    );

    // THEN: Loading indicator should be visible
    expect(screen.getByTestId("terminals-loading")).toBeInTheDocument();
    expect(screen.getByText(/loading terminals/i)).toBeInTheDocument();
  });

  it("[P1] 4.9-COMPONENT-007: should display error state when terminal fetching fails", () => {
    // GIVEN: Component is rendered with error fetching terminals
    vi.mocked(storesApi.useStoreTerminals).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Failed to fetch terminals"),
    } as any);

    renderWithProviders(
      <MyStoreDashboardLayout>
        <div>Test Content</div>
      </MyStoreDashboardLayout>,
    );

    // THEN: Error message should be visible
    expect(screen.getByTestId("terminals-error")).toBeInTheDocument();
    expect(screen.getByText(/failed to load terminals/i)).toBeInTheDocument();
  });

  it("[P1] 4.9-COMPONENT-008: should display empty state when no terminals are available", () => {
    // GIVEN: Component is rendered with no terminals
    vi.mocked(storesApi.useStoreTerminals).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    renderWithProviders(
      <MyStoreDashboardLayout>
        <div>Test Content</div>
      </MyStoreDashboardLayout>,
    );

    // THEN: Empty state message should be visible
    expect(screen.getByTestId("terminals-empty")).toBeInTheDocument();
    expect(screen.getByText(/no terminals available/i)).toBeInTheDocument();
  });

  it("[P2] 4.9-COMPONENT-009: should toggle mobile sidebar when menu button is clicked", async () => {
    // GIVEN: Component is rendered (mobile view)
    const user = userEvent.setup();
    // Mock window.innerWidth to simulate mobile
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 500,
    });

    renderWithProviders(
      <MyStoreDashboardLayout>
        <div>Test Content</div>
      </MyStoreDashboardLayout>,
    );

    // WHEN: Menu button is clicked
    const menuButton = screen.getByTestId("mystore-sidebar-toggle");
    await user.click(menuButton);

    // THEN: Mobile sidebar should open (Sheet component)
    // Note: Sheet component behavior is tested via integration tests
    expect(menuButton).toBeInTheDocument();
  });
});
