/**
 * @test-level Unit
 * @justification Unit tests for menu-permissions configuration - validates permission mapping,
 *               extraction functions, and business logic
 * @story permission-based-menu-visibility
 *
 * CRITICAL TEST COVERAGE:
 * - PERMISSION_CODES match backend constants
 * - CLIENT_MENU_PERMISSIONS has correct configuration for all menus
 * - extractMenuKeyFromHref correctly parses paths
 * - hasMenuPermission correctly evaluates permissions with ANY/ALL modes
 * - getMenuPermissionConfig returns correct configs
 * - getAccessibleMenuKeys returns correct keys
 * - Always-visible items bypass permission checks
 */

import { describe, it, expect } from "vitest";
import {
  PERMISSION_CODES,
  CLIENT_MENU_PERMISSIONS,
  extractMenuKeyFromHref,
  hasMenuPermission,
  getMenuPermissionConfig,
  getAccessibleMenuKeys,
  type MenuPermissionConfig,
} from "@/config/menu-permissions";

describe("UNIT: PERMISSION_CODES Constants", () => {
  it("[P0] should define all shift-related permissions", () => {
    expect(PERMISSION_CODES.SHIFT_OPEN).toBe("SHIFT_OPEN");
    expect(PERMISSION_CODES.SHIFT_CLOSE).toBe("SHIFT_CLOSE");
    expect(PERMISSION_CODES.SHIFT_READ).toBe("SHIFT_READ");
    expect(PERMISSION_CODES.SHIFT_RECONCILE).toBe("SHIFT_RECONCILE");
    expect(PERMISSION_CODES.SHIFT_REPORT_VIEW).toBe("SHIFT_REPORT_VIEW");
  });

  it("[P0] should define all inventory-related permissions", () => {
    expect(PERMISSION_CODES.INVENTORY_READ).toBe("INVENTORY_READ");
    expect(PERMISSION_CODES.INVENTORY_ADJUST).toBe("INVENTORY_ADJUST");
    expect(PERMISSION_CODES.INVENTORY_ORDER).toBe("INVENTORY_ORDER");
  });

  it("[P0] should define all lottery-related permissions", () => {
    expect(PERMISSION_CODES.LOTTERY_PACK_RECEIVE).toBe("LOTTERY_PACK_RECEIVE");
    expect(PERMISSION_CODES.LOTTERY_SHIFT_RECONCILE).toBe(
      "LOTTERY_SHIFT_RECONCILE",
    );
    expect(PERMISSION_CODES.LOTTERY_REPORT).toBe("LOTTERY_REPORT");
  });

  it("[P0] should define all report-related permissions", () => {
    expect(PERMISSION_CODES.REPORT_SHIFT).toBe("REPORT_SHIFT");
    expect(PERMISSION_CODES.REPORT_DAILY).toBe("REPORT_DAILY");
    expect(PERMISSION_CODES.REPORT_ANALYTICS).toBe("REPORT_ANALYTICS");
    expect(PERMISSION_CODES.REPORT_EXPORT).toBe("REPORT_EXPORT");
  });

  it("[P0] should define employee management permissions", () => {
    expect(PERMISSION_CODES.CLIENT_EMPLOYEE_CREATE).toBe(
      "CLIENT_EMPLOYEE_CREATE",
    );
    expect(PERMISSION_CODES.CLIENT_EMPLOYEE_READ).toBe("CLIENT_EMPLOYEE_READ");
    expect(PERMISSION_CODES.CLIENT_EMPLOYEE_DELETE).toBe(
      "CLIENT_EMPLOYEE_DELETE",
    );
  });

  it("[P0] should define cashier management permissions", () => {
    expect(PERMISSION_CODES.CASHIER_CREATE).toBe("CASHIER_CREATE");
    expect(PERMISSION_CODES.CASHIER_READ).toBe("CASHIER_READ");
    expect(PERMISSION_CODES.CASHIER_UPDATE).toBe("CASHIER_UPDATE");
    expect(PERMISSION_CODES.CASHIER_DELETE).toBe("CASHIER_DELETE");
  });

  it("[P0] should define client role management permission", () => {
    expect(PERMISSION_CODES.CLIENT_ROLE_MANAGE).toBe("CLIENT_ROLE_MANAGE");
  });
});

describe("UNIT: CLIENT_MENU_PERMISSIONS Configuration", () => {
  it("[P0] should have configuration for all expected menu items", () => {
    const expectedMenuKeys = [
      "dashboard",
      "shifts",
      "shift-and-day",
      "inventory",
      "lottery",
      "employees",
      "cashiers",
      "roles",
      "reports",
      "ai",
      "settings",
    ];

    const configuredKeys = CLIENT_MENU_PERMISSIONS.map((c) => c.menuKey);

    expectedMenuKeys.forEach((key) => {
      expect(configuredKeys).toContain(key);
    });
  });

  it("[P0] should mark Dashboard as always visible", () => {
    const dashboardConfig = CLIENT_MENU_PERMISSIONS.find(
      (c) => c.menuKey === "dashboard",
    );
    expect(dashboardConfig?.alwaysVisible).toBe(true);
  });

  it("[P0] should mark AI Assistant as always visible", () => {
    const aiConfig = CLIENT_MENU_PERMISSIONS.find((c) => c.menuKey === "ai");
    expect(aiConfig?.alwaysVisible).toBe(true);
  });

  it("[P0] should mark Settings as always visible", () => {
    const settingsConfig = CLIENT_MENU_PERMISSIONS.find(
      (c) => c.menuKey === "settings",
    );
    expect(settingsConfig?.alwaysVisible).toBe(true);
  });

  it("[P0] should require shift permissions for Shift Management", () => {
    const shiftsConfig = CLIENT_MENU_PERMISSIONS.find(
      (c) => c.menuKey === "shifts",
    );
    expect(shiftsConfig?.requiredPermissions).toContain(
      PERMISSION_CODES.SHIFT_READ,
    );
    expect(shiftsConfig?.requiredPermissions).toContain(
      PERMISSION_CODES.SHIFT_OPEN,
    );
    expect(shiftsConfig?.mode).toBe("ANY");
  });

  it("[P0] should require CLIENT_ROLE_MANAGE for Roles menu with mode ALL", () => {
    const rolesConfig = CLIENT_MENU_PERMISSIONS.find(
      (c) => c.menuKey === "roles",
    );
    expect(rolesConfig?.requiredPermissions).toContain(
      PERMISSION_CODES.CLIENT_ROLE_MANAGE,
    );
    expect(rolesConfig?.mode).toBe("ALL");
  });

  it("[P1] should have valid structure for all configs", () => {
    CLIENT_MENU_PERMISSIONS.forEach((config) => {
      expect(config.menuKey).toBeDefined();
      expect(typeof config.menuKey).toBe("string");
      expect(config.menuTitle).toBeDefined();
      expect(typeof config.menuTitle).toBe("string");
      expect(Array.isArray(config.requiredPermissions)).toBe(true);
    });
  });
});

describe("UNIT: extractMenuKeyFromHref Function", () => {
  it("[P0] should extract 'dashboard' from root client-dashboard path", () => {
    expect(extractMenuKeyFromHref("/client-dashboard")).toBe("dashboard");
  });

  it("[P0] should extract 'shifts' from /client-dashboard/shifts", () => {
    expect(extractMenuKeyFromHref("/client-dashboard/shifts")).toBe("shifts");
  });

  it("[P0] should extract 'shift-and-day' from /client-dashboard/shift-and-day", () => {
    expect(extractMenuKeyFromHref("/client-dashboard/shift-and-day")).toBe(
      "shift-and-day",
    );
  });

  it("[P0] should extract 'inventory' from /client-dashboard/inventory", () => {
    expect(extractMenuKeyFromHref("/client-dashboard/inventory")).toBe(
      "inventory",
    );
  });

  it("[P1] should handle subpaths by returning first segment after client-dashboard", () => {
    expect(extractMenuKeyFromHref("/client-dashboard/shifts/123")).toBe(
      "shifts",
    );
    expect(extractMenuKeyFromHref("/client-dashboard/inventory/items")).toBe(
      "inventory",
    );
  });

  it("[P1] should handle paths without leading slash", () => {
    expect(extractMenuKeyFromHref("client-dashboard")).toBe("dashboard");
    expect(extractMenuKeyFromHref("client-dashboard/shifts")).toBe("shifts");
  });

  it("[P2] should return last segment for non-client-dashboard paths", () => {
    expect(extractMenuKeyFromHref("/other/path")).toBe("path");
    expect(extractMenuKeyFromHref("/single")).toBe("single");
  });
});

describe("UNIT: hasMenuPermission Function", () => {
  describe("Mode: ANY", () => {
    const configAny: MenuPermissionConfig = {
      menuKey: "test",
      menuTitle: "Test Menu",
      requiredPermissions: [
        PERMISSION_CODES.SHIFT_READ,
        PERMISSION_CODES.SHIFT_OPEN,
        PERMISSION_CODES.SHIFT_CLOSE,
      ],
      mode: "ANY",
    };

    it("[P0] should return true when user has ONE of the required permissions", () => {
      const userPermissions = [PERMISSION_CODES.SHIFT_READ];
      expect(hasMenuPermission(userPermissions, configAny)).toBe(true);
    });

    it("[P0] should return true when user has ALL required permissions", () => {
      const userPermissions = [
        PERMISSION_CODES.SHIFT_READ,
        PERMISSION_CODES.SHIFT_OPEN,
        PERMISSION_CODES.SHIFT_CLOSE,
      ];
      expect(hasMenuPermission(userPermissions, configAny)).toBe(true);
    });

    it("[P0] should return false when user has NONE of the required permissions", () => {
      const userPermissions = [PERMISSION_CODES.INVENTORY_READ];
      expect(hasMenuPermission(userPermissions, configAny)).toBe(false);
    });
  });

  describe("Mode: ALL", () => {
    const configAll: MenuPermissionConfig = {
      menuKey: "test",
      menuTitle: "Test Menu",
      requiredPermissions: [
        PERMISSION_CODES.SHIFT_READ,
        PERMISSION_CODES.SHIFT_OPEN,
      ],
      mode: "ALL",
    };

    it("[P0] should return true when user has ALL required permissions", () => {
      const userPermissions = [
        PERMISSION_CODES.SHIFT_READ,
        PERMISSION_CODES.SHIFT_OPEN,
        PERMISSION_CODES.INVENTORY_READ, // Extra permission is fine
      ];
      expect(hasMenuPermission(userPermissions, configAll)).toBe(true);
    });

    it("[P0] should return false when user has only SOME required permissions", () => {
      const userPermissions = [PERMISSION_CODES.SHIFT_READ]; // Missing SHIFT_OPEN
      expect(hasMenuPermission(userPermissions, configAll)).toBe(false);
    });

    it("[P0] should return false when user has NONE of the required permissions", () => {
      const userPermissions = [PERMISSION_CODES.INVENTORY_READ];
      expect(hasMenuPermission(userPermissions, configAll)).toBe(false);
    });
  });

  describe("Always Visible", () => {
    const configAlwaysVisible: MenuPermissionConfig = {
      menuKey: "test",
      menuTitle: "Test Menu",
      requiredPermissions: [PERMISSION_CODES.SHIFT_READ],
      alwaysVisible: true,
    };

    it("[P0] should return true for alwaysVisible regardless of permissions", () => {
      expect(hasMenuPermission([], configAlwaysVisible)).toBe(true);
    });

    it("[P0] should return true even with completely unrelated permissions", () => {
      const userPermissions = [PERMISSION_CODES.INVENTORY_READ];
      expect(hasMenuPermission(userPermissions, configAlwaysVisible)).toBe(
        true,
      );
    });
  });

  describe("Empty Required Permissions", () => {
    const configEmpty: MenuPermissionConfig = {
      menuKey: "test",
      menuTitle: "Test Menu",
      requiredPermissions: [],
    };

    it("[P0] should return true when no permissions are required", () => {
      expect(hasMenuPermission([], configEmpty)).toBe(true);
    });
  });

  describe("Default Mode (ANY)", () => {
    const configNoMode: MenuPermissionConfig = {
      menuKey: "test",
      menuTitle: "Test Menu",
      requiredPermissions: [
        PERMISSION_CODES.SHIFT_READ,
        PERMISSION_CODES.SHIFT_OPEN,
      ],
      // No mode specified - should default to ANY
    };

    it("[P0] should default to mode ANY when not specified", () => {
      const userPermissions = [PERMISSION_CODES.SHIFT_READ]; // Only one permission
      expect(hasMenuPermission(userPermissions, configNoMode)).toBe(true);
    });
  });
});

describe("UNIT: getMenuPermissionConfig Function", () => {
  it("[P0] should return config for existing menu key", () => {
    const config = getMenuPermissionConfig("shifts");
    expect(config).toBeDefined();
    expect(config?.menuKey).toBe("shifts");
    expect(config?.menuTitle).toBe("Shift Management");
  });

  it("[P0] should return undefined for non-existent menu key", () => {
    const config = getMenuPermissionConfig("non-existent");
    expect(config).toBeUndefined();
  });

  it("[P1] should return correct config for all known keys", () => {
    const knownKeys = [
      "dashboard",
      "shifts",
      "shift-and-day",
      "inventory",
      "lottery",
      "employees",
      "cashiers",
      "roles",
      "reports",
      "ai",
      "settings",
    ];

    knownKeys.forEach((key) => {
      const config = getMenuPermissionConfig(key);
      expect(config).toBeDefined();
      expect(config?.menuKey).toBe(key);
    });
  });
});

describe("UNIT: getAccessibleMenuKeys Function", () => {
  it("[P0] should return only always-visible keys when user has no permissions", () => {
    const keys = getAccessibleMenuKeys([]);
    expect(keys).toContain("dashboard");
    expect(keys).toContain("ai");
    expect(keys).toContain("settings");
    expect(keys.length).toBe(3);
  });

  it("[P0] should return additional keys based on user permissions", () => {
    const permissions = [PERMISSION_CODES.SHIFT_READ];
    const keys = getAccessibleMenuKeys(permissions);

    expect(keys).toContain("dashboard"); // Always visible
    expect(keys).toContain("shifts"); // Has SHIFT_READ
    expect(keys).toContain("shift-and-day"); // Has SHIFT_READ
    expect(keys).not.toContain("inventory"); // No inventory permission
  });

  it("[P0] should return all keys when user has all permissions", () => {
    const allPermissions = [
      PERMISSION_CODES.SHIFT_READ,
      PERMISSION_CODES.SHIFT_OPEN,
      PERMISSION_CODES.SHIFT_REPORT_VIEW,
      PERMISSION_CODES.REPORT_DAILY,
      PERMISSION_CODES.INVENTORY_READ,
      PERMISSION_CODES.LOTTERY_PACK_RECEIVE,
      PERMISSION_CODES.CLIENT_EMPLOYEE_READ,
      PERMISSION_CODES.CASHIER_READ,
      PERMISSION_CODES.CLIENT_ROLE_MANAGE,
      PERMISSION_CODES.REPORT_SHIFT,
    ];

    const keys = getAccessibleMenuKeys(allPermissions);

    expect(keys).toContain("dashboard");
    expect(keys).toContain("shifts");
    expect(keys).toContain("shift-and-day");
    expect(keys).toContain("inventory");
    expect(keys).toContain("lottery");
    expect(keys).toContain("employees");
    expect(keys).toContain("cashiers");
    expect(keys).toContain("roles");
    expect(keys).toContain("reports");
    expect(keys).toContain("ai");
    expect(keys).toContain("settings");
  });
});

describe("UNIT: Menu Permission Business Logic", () => {
  it("[P0] should correctly configure Shift Management for mode ANY", () => {
    // Business requirement: User should see Shift Management if they can do ANY shift operation
    const config = getMenuPermissionConfig("shifts");
    expect(config?.mode).toBe("ANY");

    // User with only SHIFT_CLOSE should see the menu
    expect(hasMenuPermission([PERMISSION_CODES.SHIFT_CLOSE], config!)).toBe(
      true,
    );

    // User with only SHIFT_RECONCILE should see the menu
    expect(hasMenuPermission([PERMISSION_CODES.SHIFT_RECONCILE], config!)).toBe(
      true,
    );
  });

  it("[P0] should correctly configure Roles menu for mode ALL", () => {
    // Business requirement: User must have CLIENT_ROLE_MANAGE to see Roles menu
    const config = getMenuPermissionConfig("roles");
    expect(config?.mode).toBe("ALL");
    expect(config?.requiredPermissions).toContain(
      PERMISSION_CODES.CLIENT_ROLE_MANAGE,
    );

    // User without CLIENT_ROLE_MANAGE should NOT see the menu
    expect(hasMenuPermission([PERMISSION_CODES.SHIFT_READ], config!)).toBe(
      false,
    );
  });

  it("[P0] should not have overlapping always-visible and permission requirements", () => {
    // Always-visible items should have clear, consistent configuration
    const alwaysVisibleConfigs = CLIENT_MENU_PERMISSIONS.filter(
      (c) => c.alwaysVisible,
    );

    alwaysVisibleConfigs.forEach((config) => {
      // Should work with empty permissions
      expect(hasMenuPermission([], config)).toBe(true);
    });
  });

  it("[P1] should have unique menu keys", () => {
    const keys = CLIENT_MENU_PERMISSIONS.map((c) => c.menuKey);
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });
});
