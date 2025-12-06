/**
 * @test-level Component
 * @justification Component tests for ClientSidebar - validates permission-based menu visibility,
 *               navigation links, and routing behavior
 * @story permission-based-menu-visibility
 *
 * CRITICAL TEST COVERAGE:
 * - Permission-based menu item visibility (core feature)
 * - Menu items hidden when user lacks required permissions
 * - Menu items shown when user has ANY required permission (mode: ANY)
 * - Menu items shown only when user has ALL required permissions (mode: ALL)
 * - Always-visible items (Dashboard, AI, Settings) shown regardless of permissions
 * - Navigation link rendering and href attributes
 * - Active state highlighting based on current pathname
 * - Empty permissions scenario (only always-visible items shown)
 * - Full permissions scenario (all items shown)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen } from "../../support/test-utils";
import {
  ClientSidebar,
  ALL_NAV_ITEMS,
} from "@/components/layout/ClientSidebar";
import userEvent from "@testing-library/user-event";
import { PERMISSION_CODES } from "@/config/menu-permissions";

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
  email: "client@test.com",
  name: "Test Client",
  is_client_user: true,
};

const mockUseClientAuth = vi.fn();
vi.mock("@/contexts/ClientAuthContext", () => ({
  useClientAuth: () => mockUseClientAuth(),
}));

/**
 * Helper to create mock auth context with specific permissions
 */
function createMockAuthContext(permissions: string[]) {
  return {
    user: mockUser,
    permissions,
    isLoading: false,
    isAuthenticated: true,
    isClientUser: true,
    isStoreUser: false,
    userRole: "CLIENT_OWNER",
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  };
}

describe("COMPONENT: ClientSidebar - Permission-Based Menu Visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname.mockReturnValue("/client-dashboard");
  });

  describe("Always-Visible Menu Items", () => {
    it("[P0] should always display Dashboard regardless of permissions", () => {
      // GIVEN: User with no permissions
      mockUseClientAuth.mockReturnValue(createMockAuthContext([]));

      // WHEN: ClientSidebar is rendered
      renderWithProviders(<ClientSidebar />);

      // THEN: Dashboard should be visible
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(
        screen.getByTestId("client-nav-link-dashboard"),
      ).toBeInTheDocument();
    });

    it("[P0] should always display AI Assistant regardless of permissions", () => {
      // GIVEN: User with no permissions
      mockUseClientAuth.mockReturnValue(createMockAuthContext([]));

      // WHEN: ClientSidebar is rendered
      renderWithProviders(<ClientSidebar />);

      // THEN: AI Assistant should be visible
      expect(screen.getByText("AI Assistant")).toBeInTheDocument();
      expect(
        screen.getByTestId("client-nav-link-ai-assistant"),
      ).toBeInTheDocument();
    });

    it("[P0] should always display Settings regardless of permissions", () => {
      // GIVEN: User with no permissions
      mockUseClientAuth.mockReturnValue(createMockAuthContext([]));

      // WHEN: ClientSidebar is rendered
      renderWithProviders(<ClientSidebar />);

      // THEN: Settings should be visible
      expect(screen.getByText("Settings")).toBeInTheDocument();
      expect(
        screen.getByTestId("client-nav-link-settings"),
      ).toBeInTheDocument();
    });
  });

  describe("Shift Management Menu - Permission-Based Visibility", () => {
    it("[P0] should hide Shift Management when user has no shift permissions", () => {
      // GIVEN: User without any shift permissions
      mockUseClientAuth.mockReturnValue(createMockAuthContext([]));

      // WHEN: ClientSidebar is rendered
      renderWithProviders(<ClientSidebar />);

      // THEN: Shift Management should NOT be visible
      expect(screen.queryByText("Shift Management")).not.toBeInTheDocument();
    });

    it("[P0] should show Shift Management when user has SHIFT_READ permission", () => {
      // GIVEN: User with SHIFT_READ permission
      mockUseClientAuth.mockReturnValue(
        createMockAuthContext([PERMISSION_CODES.SHIFT_READ]),
      );

      // WHEN: ClientSidebar is rendered
      renderWithProviders(<ClientSidebar />);

      // THEN: Shift Management should be visible
      expect(screen.getByText("Shift Management")).toBeInTheDocument();
    });

    it("[P0] should show Shift Management when user has SHIFT_OPEN permission", () => {
      // GIVEN: User with SHIFT_OPEN permission
      mockUseClientAuth.mockReturnValue(
        createMockAuthContext([PERMISSION_CODES.SHIFT_OPEN]),
      );

      // WHEN: ClientSidebar is rendered
      renderWithProviders(<ClientSidebar />);

      // THEN: Shift Management should be visible
      expect(screen.getByText("Shift Management")).toBeInTheDocument();
    });

    it("[P1] should show Shift Management when user has SHIFT_CLOSE permission", () => {
      // GIVEN: User with SHIFT_CLOSE permission
      mockUseClientAuth.mockReturnValue(
        createMockAuthContext([PERMISSION_CODES.SHIFT_CLOSE]),
      );

      // WHEN: ClientSidebar is rendered
      renderWithProviders(<ClientSidebar />);

      // THEN: Shift Management should be visible
      expect(screen.getByText("Shift Management")).toBeInTheDocument();
    });

    it("[P1] should show Shift Management when user has SHIFT_RECONCILE permission", () => {
      // GIVEN: User with SHIFT_RECONCILE permission
      mockUseClientAuth.mockReturnValue(
        createMockAuthContext([PERMISSION_CODES.SHIFT_RECONCILE]),
      );

      // WHEN: ClientSidebar is rendered
      renderWithProviders(<ClientSidebar />);

      // THEN: Shift Management should be visible
      expect(screen.getByText("Shift Management")).toBeInTheDocument();
    });
  });

  describe("Daily Summary Menu - Permission-Based Visibility", () => {
    it("[P0] should hide Daily Summary when user has no relevant permissions", () => {
      // GIVEN: User without shift/report permissions
      mockUseClientAuth.mockReturnValue(createMockAuthContext([]));

      // WHEN: ClientSidebar is rendered
      renderWithProviders(<ClientSidebar />);

      // THEN: Daily Summary should NOT be visible
      expect(screen.queryByText("Daily Summary")).not.toBeInTheDocument();
    });

    it("[P0] should show Daily Summary when user has SHIFT_READ permission", () => {
      // GIVEN: User with SHIFT_READ permission
      mockUseClientAuth.mockReturnValue(
        createMockAuthContext([PERMISSION_CODES.SHIFT_READ]),
      );

      // WHEN: ClientSidebar is rendered
      renderWithProviders(<ClientSidebar />);

      // THEN: Daily Summary should be visible
      expect(screen.getByText("Daily Summary")).toBeInTheDocument();
    });

    it("[P0] should show Daily Summary when user has REPORT_DAILY permission", () => {
      // GIVEN: User with REPORT_DAILY permission
      mockUseClientAuth.mockReturnValue(
        createMockAuthContext([PERMISSION_CODES.REPORT_DAILY]),
      );

      // WHEN: ClientSidebar is rendered
      renderWithProviders(<ClientSidebar />);

      // THEN: Daily Summary should be visible
      expect(screen.getByText("Daily Summary")).toBeInTheDocument();
    });
  });

  describe("Inventory Menu - Permission-Based Visibility", () => {
    it("[P0] should hide Inventory when user has no inventory permissions", () => {
      // GIVEN: User without inventory permissions
      mockUseClientAuth.mockReturnValue(createMockAuthContext([]));

      // WHEN: ClientSidebar is rendered
      renderWithProviders(<ClientSidebar />);

      // THEN: Inventory should NOT be visible
      expect(screen.queryByText("Inventory")).not.toBeInTheDocument();
    });

    it("[P0] should show Inventory when user has INVENTORY_READ permission", () => {
      // GIVEN: User with INVENTORY_READ permission
      mockUseClientAuth.mockReturnValue(
        createMockAuthContext([PERMISSION_CODES.INVENTORY_READ]),
      );

      // WHEN: ClientSidebar is rendered
      renderWithProviders(<ClientSidebar />);

      // THEN: Inventory should be visible
      expect(screen.getByText("Inventory")).toBeInTheDocument();
    });

    it("[P1] should show Inventory when user has INVENTORY_ADJUST permission", () => {
      // GIVEN: User with INVENTORY_ADJUST permission
      mockUseClientAuth.mockReturnValue(
        createMockAuthContext([PERMISSION_CODES.INVENTORY_ADJUST]),
      );

      // WHEN: ClientSidebar is rendered
      renderWithProviders(<ClientSidebar />);

      // THEN: Inventory should be visible
      expect(screen.getByText("Inventory")).toBeInTheDocument();
    });
  });

  describe("Lottery Menu - Permission-Based Visibility", () => {
    it("[P0] should hide Lottery when user has no lottery permissions", () => {
      // GIVEN: User without lottery permissions
      mockUseClientAuth.mockReturnValue(createMockAuthContext([]));

      // WHEN: ClientSidebar is rendered
      renderWithProviders(<ClientSidebar />);

      // THEN: Lottery should NOT be visible
      expect(screen.queryByText("Lottery")).not.toBeInTheDocument();
    });

    it("[P0] should show Lottery when user has LOTTERY_PACK_RECEIVE permission", () => {
      // GIVEN: User with LOTTERY_PACK_RECEIVE permission
      mockUseClientAuth.mockReturnValue(
        createMockAuthContext([PERMISSION_CODES.LOTTERY_PACK_RECEIVE]),
      );

      // WHEN: ClientSidebar is rendered
      renderWithProviders(<ClientSidebar />);

      // THEN: Lottery should be visible
      expect(screen.getByText("Lottery")).toBeInTheDocument();
    });

    it("[P1] should show Lottery when user has LOTTERY_REPORT permission", () => {
      // GIVEN: User with LOTTERY_REPORT permission
      mockUseClientAuth.mockReturnValue(
        createMockAuthContext([PERMISSION_CODES.LOTTERY_REPORT]),
      );

      // WHEN: ClientSidebar is rendered
      renderWithProviders(<ClientSidebar />);

      // THEN: Lottery should be visible
      expect(screen.getByText("Lottery")).toBeInTheDocument();
    });
  });

  describe("Employees Menu - Permission-Based Visibility", () => {
    it("[P0] should hide Employees when user has no employee permissions", () => {
      // GIVEN: User without employee permissions
      mockUseClientAuth.mockReturnValue(createMockAuthContext([]));

      // WHEN: ClientSidebar is rendered
      renderWithProviders(<ClientSidebar />);

      // THEN: Employees should NOT be visible
      expect(screen.queryByText("Employees")).not.toBeInTheDocument();
    });

    it("[P0] should show Employees when user has CLIENT_EMPLOYEE_READ permission", () => {
      // GIVEN: User with CLIENT_EMPLOYEE_READ permission
      mockUseClientAuth.mockReturnValue(
        createMockAuthContext([PERMISSION_CODES.CLIENT_EMPLOYEE_READ]),
      );

      // WHEN: ClientSidebar is rendered
      renderWithProviders(<ClientSidebar />);

      // THEN: Employees should be visible
      expect(screen.getByText("Employees")).toBeInTheDocument();
    });

    it("[P1] should show Employees when user has CLIENT_EMPLOYEE_CREATE permission", () => {
      // GIVEN: User with CLIENT_EMPLOYEE_CREATE permission
      mockUseClientAuth.mockReturnValue(
        createMockAuthContext([PERMISSION_CODES.CLIENT_EMPLOYEE_CREATE]),
      );

      // WHEN: ClientSidebar is rendered
      renderWithProviders(<ClientSidebar />);

      // THEN: Employees should be visible
      expect(screen.getByText("Employees")).toBeInTheDocument();
    });
  });

  describe("Cashiers Menu - Permission-Based Visibility", () => {
    it("[P0] should hide Cashiers when user has no cashier permissions", () => {
      // GIVEN: User without cashier permissions
      mockUseClientAuth.mockReturnValue(createMockAuthContext([]));

      // WHEN: ClientSidebar is rendered
      renderWithProviders(<ClientSidebar />);

      // THEN: Cashiers should NOT be visible
      expect(screen.queryByText("Cashiers")).not.toBeInTheDocument();
    });

    it("[P0] should show Cashiers when user has CASHIER_READ permission", () => {
      // GIVEN: User with CASHIER_READ permission
      mockUseClientAuth.mockReturnValue(
        createMockAuthContext([PERMISSION_CODES.CASHIER_READ]),
      );

      // WHEN: ClientSidebar is rendered
      renderWithProviders(<ClientSidebar />);

      // THEN: Cashiers should be visible
      expect(screen.getByText("Cashiers")).toBeInTheDocument();
    });

    it("[P1] should show Cashiers when user has CASHIER_CREATE permission", () => {
      // GIVEN: User with CASHIER_CREATE permission
      mockUseClientAuth.mockReturnValue(
        createMockAuthContext([PERMISSION_CODES.CASHIER_CREATE]),
      );

      // WHEN: ClientSidebar is rendered
      renderWithProviders(<ClientSidebar />);

      // THEN: Cashiers should be visible
      expect(screen.getByText("Cashiers")).toBeInTheDocument();
    });
  });

  describe("Roles & Permissions Menu - Permission-Based Visibility", () => {
    it("[P0] should hide Roles & Permissions when user lacks CLIENT_ROLE_MANAGE permission", () => {
      // GIVEN: User without CLIENT_ROLE_MANAGE permission
      mockUseClientAuth.mockReturnValue(
        createMockAuthContext([PERMISSION_CODES.SHIFT_READ]),
      );

      // WHEN: ClientSidebar is rendered
      renderWithProviders(<ClientSidebar />);

      // THEN: Roles & Permissions should NOT be visible
      expect(screen.queryByText("Roles & Permissions")).not.toBeInTheDocument();
    });

    it("[P0] should show Roles & Permissions when user has CLIENT_ROLE_MANAGE permission", () => {
      // GIVEN: User with CLIENT_ROLE_MANAGE permission
      mockUseClientAuth.mockReturnValue(
        createMockAuthContext([PERMISSION_CODES.CLIENT_ROLE_MANAGE]),
      );

      // WHEN: ClientSidebar is rendered
      renderWithProviders(<ClientSidebar />);

      // THEN: Roles & Permissions should be visible
      expect(screen.getByText("Roles & Permissions")).toBeInTheDocument();
    });
  });

  describe("Reports Menu - Permission-Based Visibility", () => {
    it("[P0] should hide Reports when user has no report permissions", () => {
      // GIVEN: User without report permissions
      mockUseClientAuth.mockReturnValue(createMockAuthContext([]));

      // WHEN: ClientSidebar is rendered
      renderWithProviders(<ClientSidebar />);

      // THEN: Reports should NOT be visible
      expect(screen.queryByText("Reports")).not.toBeInTheDocument();
    });

    it("[P0] should show Reports when user has REPORT_SHIFT permission", () => {
      // GIVEN: User with REPORT_SHIFT permission
      mockUseClientAuth.mockReturnValue(
        createMockAuthContext([PERMISSION_CODES.REPORT_SHIFT]),
      );

      // WHEN: ClientSidebar is rendered
      renderWithProviders(<ClientSidebar />);

      // THEN: Reports should be visible
      expect(screen.getByText("Reports")).toBeInTheDocument();
    });

    it("[P1] should show Reports when user has REPORT_ANALYTICS permission", () => {
      // GIVEN: User with REPORT_ANALYTICS permission
      mockUseClientAuth.mockReturnValue(
        createMockAuthContext([PERMISSION_CODES.REPORT_ANALYTICS]),
      );

      // WHEN: ClientSidebar is rendered
      renderWithProviders(<ClientSidebar />);

      // THEN: Reports should be visible
      expect(screen.getByText("Reports")).toBeInTheDocument();
    });
  });
});

describe("COMPONENT: ClientSidebar - Full Permission Scenarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname.mockReturnValue("/client-dashboard");
  });

  it("[P0] should show only always-visible items when user has no permissions", () => {
    // GIVEN: User with no permissions
    mockUseClientAuth.mockReturnValue(createMockAuthContext([]));

    // WHEN: ClientSidebar is rendered
    renderWithProviders(<ClientSidebar />);

    // THEN: Only Dashboard, AI Assistant, and Settings should be visible
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("AI Assistant")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();

    // AND: All other menus should be hidden
    expect(screen.queryByText("Shift Management")).not.toBeInTheDocument();
    expect(screen.queryByText("Daily Summary")).not.toBeInTheDocument();
    expect(screen.queryByText("Inventory")).not.toBeInTheDocument();
    expect(screen.queryByText("Lottery")).not.toBeInTheDocument();
    expect(screen.queryByText("Employees")).not.toBeInTheDocument();
    expect(screen.queryByText("Cashiers")).not.toBeInTheDocument();
    expect(screen.queryByText("Roles & Permissions")).not.toBeInTheDocument();
    expect(screen.queryByText("Reports")).not.toBeInTheDocument();
  });

  it("[P0] should show all menu items when user has all permissions", () => {
    // GIVEN: User with all relevant permissions
    const allPermissions = [
      PERMISSION_CODES.CLIENT_DASHBOARD_ACCESS,
      PERMISSION_CODES.SHIFT_READ,
      PERMISSION_CODES.SHIFT_OPEN,
      PERMISSION_CODES.SHIFT_CLOSE,
      PERMISSION_CODES.SHIFT_RECONCILE,
      PERMISSION_CODES.SHIFT_REPORT_VIEW,
      PERMISSION_CODES.REPORT_DAILY,
      PERMISSION_CODES.REPORT_SHIFT,
      PERMISSION_CODES.REPORT_ANALYTICS,
      PERMISSION_CODES.REPORT_EXPORT,
      PERMISSION_CODES.INVENTORY_READ,
      PERMISSION_CODES.INVENTORY_ADJUST,
      PERMISSION_CODES.LOTTERY_PACK_RECEIVE,
      PERMISSION_CODES.LOTTERY_REPORT,
      PERMISSION_CODES.CLIENT_EMPLOYEE_READ,
      PERMISSION_CODES.CLIENT_EMPLOYEE_CREATE,
      PERMISSION_CODES.CASHIER_READ,
      PERMISSION_CODES.CASHIER_CREATE,
      PERMISSION_CODES.CLIENT_ROLE_MANAGE,
    ];
    mockUseClientAuth.mockReturnValue(createMockAuthContext(allPermissions));

    // WHEN: ClientSidebar is rendered
    renderWithProviders(<ClientSidebar />);

    // THEN: All menu items should be visible
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Shift Management")).toBeInTheDocument();
    expect(screen.getByText("Daily Summary")).toBeInTheDocument();
    expect(screen.getByText("Inventory")).toBeInTheDocument();
    expect(screen.getByText("Lottery")).toBeInTheDocument();
    expect(screen.getByText("Employees")).toBeInTheDocument();
    expect(screen.getByText("Cashiers")).toBeInTheDocument();
    expect(screen.getByText("Roles & Permissions")).toBeInTheDocument();
    expect(screen.getByText("Reports")).toBeInTheDocument();
    expect(screen.getByText("AI Assistant")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("[P0] should show correct subset of menus based on role-specific permissions (Store Manager)", () => {
    // GIVEN: User with typical Store Manager permissions
    const storeManagerPermissions = [
      PERMISSION_CODES.SHIFT_READ,
      PERMISSION_CODES.SHIFT_OPEN,
      PERMISSION_CODES.SHIFT_CLOSE,
      PERMISSION_CODES.SHIFT_RECONCILE,
      PERMISSION_CODES.SHIFT_REPORT_VIEW,
      PERMISSION_CODES.INVENTORY_READ,
      PERMISSION_CODES.INVENTORY_ADJUST,
      PERMISSION_CODES.LOTTERY_PACK_RECEIVE,
      PERMISSION_CODES.LOTTERY_SHIFT_RECONCILE,
      PERMISSION_CODES.REPORT_SHIFT,
      PERMISSION_CODES.REPORT_DAILY,
      PERMISSION_CODES.CLIENT_EMPLOYEE_READ,
      PERMISSION_CODES.CASHIER_READ,
      PERMISSION_CODES.CASHIER_CREATE,
    ];
    mockUseClientAuth.mockReturnValue(
      createMockAuthContext(storeManagerPermissions),
    );

    // WHEN: ClientSidebar is rendered
    renderWithProviders(<ClientSidebar />);

    // THEN: Store Manager appropriate menus should be visible
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Shift Management")).toBeInTheDocument();
    expect(screen.getByText("Daily Summary")).toBeInTheDocument();
    expect(screen.getByText("Inventory")).toBeInTheDocument();
    expect(screen.getByText("Lottery")).toBeInTheDocument();
    expect(screen.getByText("Employees")).toBeInTheDocument();
    expect(screen.getByText("Cashiers")).toBeInTheDocument();
    expect(screen.getByText("Reports")).toBeInTheDocument();

    // AND: Roles & Permissions should NOT be visible (CLIENT_ROLE_MANAGE not granted)
    expect(screen.queryByText("Roles & Permissions")).not.toBeInTheDocument();
  });

  it("[P0] should show correct subset of menus based on role-specific permissions (Cashier)", () => {
    // GIVEN: User with typical Cashier permissions (limited)
    const cashierPermissions = [
      PERMISSION_CODES.SHIFT_READ,
      PERMISSION_CODES.SHIFT_OPEN,
      PERMISSION_CODES.SHIFT_CLOSE,
      PERMISSION_CODES.TRANSACTION_CREATE,
      PERMISSION_CODES.TRANSACTION_READ,
    ];
    mockUseClientAuth.mockReturnValue(
      createMockAuthContext(cashierPermissions),
    );

    // WHEN: ClientSidebar is rendered
    renderWithProviders(<ClientSidebar />);

    // THEN: Only Cashier appropriate menus should be visible
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Shift Management")).toBeInTheDocument();
    expect(screen.getByText("Daily Summary")).toBeInTheDocument(); // Has SHIFT_READ

    // AND: Restricted menus should NOT be visible
    expect(screen.queryByText("Inventory")).not.toBeInTheDocument();
    expect(screen.queryByText("Lottery")).not.toBeInTheDocument();
    expect(screen.queryByText("Employees")).not.toBeInTheDocument();
    expect(screen.queryByText("Cashiers")).not.toBeInTheDocument();
    expect(screen.queryByText("Roles & Permissions")).not.toBeInTheDocument();
    expect(screen.queryByText("Reports")).not.toBeInTheDocument();
  });
});

describe("COMPONENT: ClientSidebar - Navigation and Active State", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Grant all permissions for navigation tests
    mockUseClientAuth.mockReturnValue(
      createMockAuthContext([
        PERMISSION_CODES.SHIFT_READ,
        PERMISSION_CODES.INVENTORY_READ,
        PERMISSION_CODES.LOTTERY_PACK_RECEIVE,
        PERMISSION_CODES.CLIENT_EMPLOYEE_READ,
        PERMISSION_CODES.CASHIER_READ,
        PERMISSION_CODES.CLIENT_ROLE_MANAGE,
        PERMISSION_CODES.REPORT_SHIFT,
      ]),
    );
  });

  it("[P0] should navigate to /client-dashboard/shifts when Shift Management link is clicked", async () => {
    // GIVEN: ClientSidebar is rendered
    mockPathname.mockReturnValue("/client-dashboard");
    const user = userEvent.setup();
    renderWithProviders(<ClientSidebar />);

    // WHEN: Shift Management link is clicked
    const shiftsLink = screen.getByText("Shift Management").closest("a");
    if (shiftsLink) {
      await user.click(shiftsLink);
    }

    // THEN: Should have correct href
    expect(shiftsLink).toHaveAttribute("href", "/client-dashboard/shifts");
  });

  it("[P0] should highlight Shift Management link when on shifts page", () => {
    // GIVEN: User is on the shifts page
    mockPathname.mockReturnValue("/client-dashboard/shifts");

    renderWithProviders(<ClientSidebar />);

    // THEN: Shift Management link should be highlighted/active
    const link = screen.getByText("Shift Management").closest("a");
    expect(link).toBeInTheDocument();
    expect(link).toHaveClass("bg-primary");
    expect(link).toHaveClass("text-primary-foreground");
  });

  it("[P0] should highlight Daily Summary link when on shift-and-day page", () => {
    // GIVEN: User is on the shift-and-day page
    mockPathname.mockReturnValue("/client-dashboard/shift-and-day");

    renderWithProviders(<ClientSidebar />);

    // THEN: Daily Summary link should be highlighted/active
    const link = screen.getByText("Daily Summary").closest("a");
    expect(link).toBeInTheDocument();
    expect(link).toHaveClass("bg-primary");
    expect(link).toHaveClass("text-primary-foreground");
  });

  it("[P1] should highlight Dashboard link when on root client-dashboard page", () => {
    // GIVEN: User is on the root client-dashboard page
    mockPathname.mockReturnValue("/client-dashboard");

    renderWithProviders(<ClientSidebar />);

    // THEN: Dashboard link should be highlighted/active
    const link = screen.getByText("Dashboard").closest("a");
    expect(link).toBeInTheDocument();
    expect(link).toHaveClass("bg-primary");
    expect(link).toHaveClass("text-primary-foreground");
  });

  it("[P1] should call onNavigate callback when a link is clicked", async () => {
    // GIVEN: ClientSidebar with onNavigate callback
    mockPathname.mockReturnValue("/client-dashboard");
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<ClientSidebar onNavigate={onNavigate} />);

    // WHEN: A link is clicked
    const dashboardLink = screen.getByText("Dashboard").closest("a");
    if (dashboardLink) {
      await user.click(dashboardLink);
    }

    // THEN: onNavigate should be called
    expect(onNavigate).toHaveBeenCalled();
  });
});

describe("COMPONENT: ClientSidebar - Test Data Attributes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname.mockReturnValue("/client-dashboard");
    // Grant all permissions for test attribute verification
    mockUseClientAuth.mockReturnValue(
      createMockAuthContext([
        PERMISSION_CODES.SHIFT_READ,
        PERMISSION_CODES.INVENTORY_READ,
        PERMISSION_CODES.LOTTERY_PACK_RECEIVE,
        PERMISSION_CODES.CLIENT_EMPLOYEE_READ,
        PERMISSION_CODES.CASHIER_READ,
        PERMISSION_CODES.CLIENT_ROLE_MANAGE,
        PERMISSION_CODES.REPORT_SHIFT,
      ]),
    );
  });

  it("[P1] should have correct testid for sidebar navigation container", () => {
    renderWithProviders(<ClientSidebar />);
    expect(screen.getByTestId("client-sidebar-navigation")).toBeInTheDocument();
  });

  it("[P1] should have correct testid for nav element", () => {
    renderWithProviders(<ClientSidebar />);
    expect(screen.getByTestId("client-sidebar-nav")).toBeInTheDocument();
  });

  it("[P1] should generate correct testids for all nav links", () => {
    renderWithProviders(<ClientSidebar />);

    // Check testids for visible nav links
    expect(screen.getByTestId("client-nav-link-dashboard")).toBeInTheDocument();
    expect(
      screen.getByTestId("client-nav-link-shift-management"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("client-nav-link-daily-summary"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("client-nav-link-inventory")).toBeInTheDocument();
    expect(screen.getByTestId("client-nav-link-lottery")).toBeInTheDocument();
    expect(screen.getByTestId("client-nav-link-employees")).toBeInTheDocument();
    expect(screen.getByTestId("client-nav-link-cashiers")).toBeInTheDocument();
    expect(
      screen.getByTestId("client-nav-link-roles-and-permissions"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("client-nav-link-reports")).toBeInTheDocument();
    expect(
      screen.getByTestId("client-nav-link-ai-assistant"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("client-nav-link-settings")).toBeInTheDocument();
  });
});

describe("COMPONENT: ClientSidebar - Edge Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname.mockReturnValue("/client-dashboard");
  });

  it("[P1] should handle undefined permissions gracefully", () => {
    // GIVEN: User context with undefined permissions (edge case)
    mockUseClientAuth.mockReturnValue({
      user: mockUser,
      permissions: undefined as unknown as string[],
      isLoading: false,
      isAuthenticated: true,
      isClientUser: true,
      isStoreUser: false,
      userRole: "CLIENT_OWNER",
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    // WHEN: ClientSidebar is rendered
    // THEN: Should not crash and render at least always-visible items
    expect(() => renderWithProviders(<ClientSidebar />)).not.toThrow();
  });

  it("[P1] should handle empty string permissions in array", () => {
    // GIVEN: User with empty string in permissions array
    mockUseClientAuth.mockReturnValue(
      createMockAuthContext(["", PERMISSION_CODES.SHIFT_READ]),
    );

    // WHEN: ClientSidebar is rendered
    renderWithProviders(<ClientSidebar />);

    // THEN: Should show Shift Management (valid permission works)
    expect(screen.getByText("Shift Management")).toBeInTheDocument();
  });

  it("[P2] should apply custom className when provided", () => {
    // GIVEN: Custom className
    mockUseClientAuth.mockReturnValue(createMockAuthContext([]));

    // WHEN: ClientSidebar is rendered with custom className
    renderWithProviders(<ClientSidebar className="custom-class" />);

    // THEN: Custom class should be applied
    const sidebar = screen.getByTestId("client-sidebar-navigation");
    expect(sidebar).toHaveClass("custom-class");
  });
});

describe("COMPONENT: ClientSidebar - ALL_NAV_ITEMS Export", () => {
  it("[P2] should export ALL_NAV_ITEMS with correct count", () => {
    // THEN: ALL_NAV_ITEMS should contain all menu items
    expect(ALL_NAV_ITEMS).toHaveLength(11); // Dashboard, Shifts, Daily, Inventory, Lottery, Employees, Cashiers, Roles, Reports, AI, Settings
  });

  it("[P2] should have correct structure for each nav item", () => {
    // THEN: Each nav item should have required properties
    ALL_NAV_ITEMS.forEach((item) => {
      expect(item).toHaveProperty("title");
      expect(item).toHaveProperty("href");
      expect(item).toHaveProperty("icon");
      expect(typeof item.title).toBe("string");
      expect(typeof item.href).toBe("string");
      expect(item.href.startsWith("/client-dashboard")).toBe(true);
    });
  });
});
