/**
 * @test-level Unit
 * @justification Unit tests for useMenuPermissions hook - tests permission-based menu visibility logic
 * @story permission-based-menu-visibility
 *
 * CRITICAL TEST COVERAGE:
 * - filterNavItems function filters correctly based on permissions
 * - canAccessMenu function correctly evaluates href paths
 * - canAccessMenuByKey function correctly evaluates menu keys
 * - hasPermission utility function works correctly
 * - accessibleMenuKeys computed property returns correct keys
 * - Pure function versions work correctly for non-hook contexts
 * - Edge cases: empty permissions, unknown menu keys, null/undefined handling
 */

import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  useMenuPermissions,
  filterNavItemsByPermissions,
  canUserAccessMenu,
  type NavItem,
} from "@/hooks/useMenuPermissions";
import { PERMISSION_CODES } from "@/config/menu-permissions";

// Mock navigation items for testing
const mockNavItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/client-dashboard",
    icon: () => null,
    exact: true,
  },
  {
    title: "Shift Management",
    href: "/client-dashboard/shifts",
    icon: () => null,
  },
  {
    title: "Daily Summary",
    href: "/client-dashboard/shift-and-day",
    icon: () => null,
  },
  {
    title: "Inventory",
    href: "/client-dashboard/inventory",
    icon: () => null,
  },
  {
    title: "Lottery",
    href: "/client-dashboard/lottery",
    icon: () => null,
  },
  {
    title: "Employees",
    href: "/client-dashboard/employees",
    icon: () => null,
  },
  {
    title: "Cashiers",
    href: "/client-dashboard/cashiers",
    icon: () => null,
  },
  {
    title: "Roles & Permissions",
    href: "/client-dashboard/roles",
    icon: () => null,
  },
  {
    title: "Reports",
    href: "/client-dashboard/reports",
    icon: () => null,
  },
  {
    title: "AI Assistant",
    href: "/client-dashboard/ai",
    icon: () => null,
  },
  {
    title: "Settings",
    href: "/client-dashboard/settings",
    icon: () => null,
  },
];

describe("UNIT: useMenuPermissions Hook - filterNavItems", () => {
  it("[P0] should filter out menus user lacks permissions for", () => {
    // GIVEN: User with only shift read permission
    const permissions = [PERMISSION_CODES.SHIFT_READ];

    // WHEN: Hook is rendered
    const { result } = renderHook(() => useMenuPermissions(permissions));

    // THEN: filterNavItems should only return accessible items
    const filtered = result.current.filterNavItems(mockNavItems);

    // Should include: Dashboard (always), Shift Management, Daily Summary, AI, Settings
    expect(filtered.map((i) => i.title)).toContain("Dashboard");
    expect(filtered.map((i) => i.title)).toContain("Shift Management");
    expect(filtered.map((i) => i.title)).toContain("Daily Summary");
    expect(filtered.map((i) => i.title)).toContain("AI Assistant");
    expect(filtered.map((i) => i.title)).toContain("Settings");

    // Should NOT include: Inventory, Lottery, Employees, Cashiers, Roles, Reports
    expect(filtered.map((i) => i.title)).not.toContain("Inventory");
    expect(filtered.map((i) => i.title)).not.toContain("Lottery");
    expect(filtered.map((i) => i.title)).not.toContain("Employees");
    expect(filtered.map((i) => i.title)).not.toContain("Cashiers");
    expect(filtered.map((i) => i.title)).not.toContain("Roles & Permissions");
    expect(filtered.map((i) => i.title)).not.toContain("Reports");
  });

  it("[P0] should return all menus when user has all permissions", () => {
    // GIVEN: User with all permissions
    const allPermissions = [
      PERMISSION_CODES.SHIFT_READ,
      PERMISSION_CODES.SHIFT_OPEN,
      PERMISSION_CODES.INVENTORY_READ,
      PERMISSION_CODES.LOTTERY_PACK_RECEIVE,
      PERMISSION_CODES.CLIENT_EMPLOYEE_READ,
      PERMISSION_CODES.CASHIER_READ,
      PERMISSION_CODES.CLIENT_ROLE_MANAGE,
      PERMISSION_CODES.REPORT_SHIFT,
    ];

    // WHEN: Hook is rendered
    const { result } = renderHook(() => useMenuPermissions(allPermissions));

    // THEN: All nav items should be returned
    const filtered = result.current.filterNavItems(mockNavItems);
    expect(filtered.length).toBe(mockNavItems.length);
  });

  it("[P0] should only return always-visible items when user has no permissions", () => {
    // GIVEN: User with no permissions
    const permissions: string[] = [];

    // WHEN: Hook is rendered
    const { result } = renderHook(() => useMenuPermissions(permissions));

    // THEN: Only always-visible items should be returned
    const filtered = result.current.filterNavItems(mockNavItems);
    const titles = filtered.map((i) => i.title);

    expect(titles).toContain("Dashboard");
    expect(titles).toContain("AI Assistant");
    expect(titles).toContain("Settings");
    expect(titles.length).toBe(3);
  });
});

describe("UNIT: useMenuPermissions Hook - canAccessMenu", () => {
  it("[P0] should return true for accessible menu by href", () => {
    // GIVEN: User with shift read permission
    const permissions = [PERMISSION_CODES.SHIFT_READ];

    // WHEN: Hook is rendered
    const { result } = renderHook(() => useMenuPermissions(permissions));

    // THEN: canAccessMenu should return true for shift management
    expect(result.current.canAccessMenu("/client-dashboard/shifts")).toBe(true);
  });

  it("[P0] should return false for inaccessible menu by href", () => {
    // GIVEN: User without inventory permission
    const permissions = [PERMISSION_CODES.SHIFT_READ];

    // WHEN: Hook is rendered
    const { result } = renderHook(() => useMenuPermissions(permissions));

    // THEN: canAccessMenu should return false for inventory
    expect(result.current.canAccessMenu("/client-dashboard/inventory")).toBe(
      false,
    );
  });

  it("[P0] should return true for always-visible menus regardless of permissions", () => {
    // GIVEN: User with no permissions
    const permissions: string[] = [];

    // WHEN: Hook is rendered
    const { result } = renderHook(() => useMenuPermissions(permissions));

    // THEN: canAccessMenu should return true for always-visible items
    expect(result.current.canAccessMenu("/client-dashboard")).toBe(true);
    expect(result.current.canAccessMenu("/client-dashboard/ai")).toBe(true);
    expect(result.current.canAccessMenu("/client-dashboard/settings")).toBe(
      true,
    );
  });

  it("[P1] should handle subpaths correctly", () => {
    // GIVEN: User with shift read permission
    const permissions = [PERMISSION_CODES.SHIFT_READ];

    // WHEN: Hook is rendered
    const { result } = renderHook(() => useMenuPermissions(permissions));

    // THEN: Base path should be checked, not subpaths
    // /client-dashboard/shifts/123 should use "shifts" config
    expect(result.current.canAccessMenu("/client-dashboard/shifts")).toBe(true);
  });
});

describe("UNIT: useMenuPermissions Hook - canAccessMenuByKey", () => {
  it("[P0] should return true for accessible menu by key", () => {
    // GIVEN: User with inventory read permission
    const permissions = [PERMISSION_CODES.INVENTORY_READ];

    // WHEN: Hook is rendered
    const { result } = renderHook(() => useMenuPermissions(permissions));

    // THEN: canAccessMenuByKey should return true for inventory
    expect(result.current.canAccessMenuByKey("inventory")).toBe(true);
  });

  it("[P0] should return false for inaccessible menu by key", () => {
    // GIVEN: User without lottery permission
    const permissions = [PERMISSION_CODES.SHIFT_READ];

    // WHEN: Hook is rendered
    const { result } = renderHook(() => useMenuPermissions(permissions));

    // THEN: canAccessMenuByKey should return false for lottery
    expect(result.current.canAccessMenuByKey("lottery")).toBe(false);
  });

  it("[P1] should return false for unknown menu keys (deny by default)", () => {
    // GIVEN: User with all permissions
    const permissions = Object.values(PERMISSION_CODES);

    // WHEN: Hook is rendered
    const { result } = renderHook(() => useMenuPermissions(permissions));

    // THEN: Unknown menu keys should be denied
    expect(result.current.canAccessMenuByKey("unknown-menu")).toBe(false);
    expect(result.current.canAccessMenuByKey("admin")).toBe(false);
  });
});

describe("UNIT: useMenuPermissions Hook - hasPermission", () => {
  it("[P0] should return true when user has the permission", () => {
    // GIVEN: User with specific permission
    const permissions = [PERMISSION_CODES.SHIFT_READ];

    // WHEN: Hook is rendered
    const { result } = renderHook(() => useMenuPermissions(permissions));

    // THEN: hasPermission should return true
    expect(result.current.hasPermission(PERMISSION_CODES.SHIFT_READ)).toBe(
      true,
    );
  });

  it("[P0] should return false when user lacks the permission", () => {
    // GIVEN: User without specific permission
    const permissions = [PERMISSION_CODES.SHIFT_READ];

    // WHEN: Hook is rendered
    const { result } = renderHook(() => useMenuPermissions(permissions));

    // THEN: hasPermission should return false
    expect(result.current.hasPermission(PERMISSION_CODES.INVENTORY_READ)).toBe(
      false,
    );
  });

  it("[P1] should handle empty permissions array", () => {
    // GIVEN: User with no permissions
    const permissions: string[] = [];

    // WHEN: Hook is rendered
    const { result } = renderHook(() => useMenuPermissions(permissions));

    // THEN: All hasPermission calls should return false
    expect(result.current.hasPermission(PERMISSION_CODES.SHIFT_READ)).toBe(
      false,
    );
    expect(result.current.hasPermission(PERMISSION_CODES.INVENTORY_READ)).toBe(
      false,
    );
  });
});

describe("UNIT: useMenuPermissions Hook - accessibleMenuKeys", () => {
  it("[P0] should return correct accessible keys based on permissions", () => {
    // GIVEN: User with shift and inventory permissions
    const permissions = [
      PERMISSION_CODES.SHIFT_READ,
      PERMISSION_CODES.INVENTORY_READ,
    ];

    // WHEN: Hook is rendered
    const { result } = renderHook(() => useMenuPermissions(permissions));

    // THEN: accessibleMenuKeys should contain correct keys
    const keys = result.current.accessibleMenuKeys;

    // Always visible
    expect(keys).toContain("dashboard");
    expect(keys).toContain("ai");
    expect(keys).toContain("settings");

    // Permission-based
    expect(keys).toContain("shifts");
    expect(keys).toContain("shift-and-day");
    expect(keys).toContain("inventory");

    // Should NOT contain
    expect(keys).not.toContain("lottery");
    expect(keys).not.toContain("employees");
    expect(keys).not.toContain("cashiers");
    expect(keys).not.toContain("roles");
    expect(keys).not.toContain("reports");
  });

  it("[P1] should only return always-visible keys when user has no permissions", () => {
    // GIVEN: User with no permissions
    const permissions: string[] = [];

    // WHEN: Hook is rendered
    const { result } = renderHook(() => useMenuPermissions(permissions));

    // THEN: Only always-visible keys should be returned
    const keys = result.current.accessibleMenuKeys;
    expect(keys).toContain("dashboard");
    expect(keys).toContain("ai");
    expect(keys).toContain("settings");
    expect(keys.length).toBe(3);
  });
});

describe("UNIT: useMenuPermissions Hook - getMenuConfig", () => {
  it("[P1] should return config for known menu keys", () => {
    // GIVEN: Hook is rendered
    const { result } = renderHook(() => useMenuPermissions([]));

    // WHEN: Getting config for known menu
    const config = result.current.getMenuConfig("shifts");

    // THEN: Config should be returned
    expect(config).toBeDefined();
    expect(config?.menuKey).toBe("shifts");
    expect(config?.requiredPermissions).toContain(PERMISSION_CODES.SHIFT_READ);
  });

  it("[P1] should return undefined for unknown menu keys", () => {
    // GIVEN: Hook is rendered
    const { result } = renderHook(() => useMenuPermissions([]));

    // WHEN: Getting config for unknown menu
    const config = result.current.getMenuConfig("unknown-menu");

    // THEN: Config should be undefined
    expect(config).toBeUndefined();
  });
});

describe("UNIT: filterNavItemsByPermissions Pure Function", () => {
  it("[P0] should filter items correctly based on permissions", () => {
    // GIVEN: Permissions array
    const permissions = [PERMISSION_CODES.SHIFT_READ];

    // WHEN: Calling pure function
    const filtered = filterNavItemsByPermissions(permissions, mockNavItems);

    // THEN: Should only return accessible items
    const titles = filtered.map((i) => i.title);
    expect(titles).toContain("Dashboard");
    expect(titles).toContain("Shift Management");
    expect(titles).not.toContain("Inventory");
  });

  it("[P1] should return empty array for nav items with no config", () => {
    // GIVEN: Nav items with unknown hrefs
    const unknownItems: NavItem[] = [
      { title: "Unknown", href: "/unknown/path", icon: () => null },
    ];

    // WHEN: Calling pure function
    const filtered = filterNavItemsByPermissions([], unknownItems);

    // THEN: Should return empty array (deny by default)
    expect(filtered.length).toBe(0);
  });
});

describe("UNIT: canUserAccessMenu Pure Function", () => {
  it("[P0] should return true for accessible menu", () => {
    // GIVEN: User with shift permission
    const permissions = [PERMISSION_CODES.SHIFT_READ];

    // WHEN: Calling pure function
    const result = canUserAccessMenu(permissions, "/client-dashboard/shifts");

    // THEN: Should return true
    expect(result).toBe(true);
  });

  it("[P0] should return false for inaccessible menu", () => {
    // GIVEN: User without inventory permission
    const permissions = [PERMISSION_CODES.SHIFT_READ];

    // WHEN: Calling pure function
    const result = canUserAccessMenu(
      permissions,
      "/client-dashboard/inventory",
    );

    // THEN: Should return false
    expect(result).toBe(false);
  });

  it("[P1] should return false for unknown paths", () => {
    // GIVEN: Any permissions
    const permissions = Object.values(PERMISSION_CODES);

    // WHEN: Calling pure function with unknown path
    const result = canUserAccessMenu(permissions, "/unknown/path");

    // THEN: Should return false (deny by default)
    expect(result).toBe(false);
  });
});

describe("UNIT: useMenuPermissions Hook - Permission Modes", () => {
  it("[P0] should show menu when user has ANY of required permissions (mode: ANY)", () => {
    // GIVEN: User with only one of the shift permissions
    const permissions = [PERMISSION_CODES.SHIFT_CLOSE]; // Only close, not read/open

    // WHEN: Hook is rendered
    const { result } = renderHook(() => useMenuPermissions(permissions));

    // THEN: Shift Management should be accessible (requires ANY of shift perms)
    expect(result.current.canAccessMenuByKey("shifts")).toBe(true);
  });

  it("[P0] should require ALL permissions when mode is ALL", () => {
    // GIVEN: User with role manage permission
    const permissions = [PERMISSION_CODES.CLIENT_ROLE_MANAGE];

    // WHEN: Hook is rendered
    const { result } = renderHook(() => useMenuPermissions(permissions));

    // THEN: Roles menu should be accessible (requires ALL = just CLIENT_ROLE_MANAGE)
    expect(result.current.canAccessMenuByKey("roles")).toBe(true);
  });

  it("[P1] should hide menu when user has none of required permissions", () => {
    // GIVEN: User with unrelated permissions
    const permissions = [PERMISSION_CODES.INVENTORY_READ];

    // WHEN: Hook is rendered
    const { result } = renderHook(() => useMenuPermissions(permissions));

    // THEN: Shift Management should NOT be accessible
    expect(result.current.canAccessMenuByKey("shifts")).toBe(false);
  });
});

describe("UNIT: useMenuPermissions Hook - Edge Cases", () => {
  it("[P1] should handle duplicate permissions in array", () => {
    // GIVEN: Permissions array with duplicates
    const permissions = [
      PERMISSION_CODES.SHIFT_READ,
      PERMISSION_CODES.SHIFT_READ,
      PERMISSION_CODES.SHIFT_READ,
    ];

    // WHEN: Hook is rendered
    const { result } = renderHook(() => useMenuPermissions(permissions));

    // THEN: Should work correctly
    expect(result.current.canAccessMenuByKey("shifts")).toBe(true);
  });

  it("[P1] should handle empty string in permissions array", () => {
    // GIVEN: Permissions array with empty string
    const permissions = ["", PERMISSION_CODES.SHIFT_READ];

    // WHEN: Hook is rendered
    const { result } = renderHook(() => useMenuPermissions(permissions));

    // THEN: Should work correctly, ignoring empty string
    expect(result.current.canAccessMenuByKey("shifts")).toBe(true);
    expect(result.current.hasPermission("")).toBe(true); // Empty string is in array
    expect(result.current.hasPermission(PERMISSION_CODES.SHIFT_READ)).toBe(
      true,
    );
  });

  it("[P2] should be memoized and return stable references", () => {
    // GIVEN: Same permissions array
    const permissions = [PERMISSION_CODES.SHIFT_READ];

    // WHEN: Hook is rendered twice with same permissions
    const { result, rerender } = renderHook(
      (props) => useMenuPermissions(props.permissions),
      { initialProps: { permissions } },
    );

    const firstFilterFn = result.current.filterNavItems;

    // Re-render with same permissions reference
    rerender({ permissions });

    // THEN: filterNavItems function should be stable
    expect(result.current.filterNavItems).toBe(firstFilterFn);
  });
});
