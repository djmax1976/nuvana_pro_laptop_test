/**
 * Permission Constants
 *
 * Defines all permission codes used in the RBAC system.
 * These constants are used for permission checking in middleware and services.
 *
 * Permission codes follow the pattern: RESOURCE_ACTION
 * - RESOURCE: The resource being accessed (USER, STORE, SHIFT, etc.)
 * - ACTION: The action being performed (CREATE, READ, UPDATE, DELETE, etc.)
 */

// User Management Permissions
export const USER_CREATE = "USER_CREATE";
export const USER_READ = "USER_READ";
export const USER_UPDATE = "USER_UPDATE";
export const USER_DELETE = "USER_DELETE";

// Company Management Permissions
export const COMPANY_CREATE = "COMPANY_CREATE";
export const COMPANY_READ = "COMPANY_READ";
export const COMPANY_UPDATE = "COMPANY_UPDATE";
export const COMPANY_DELETE = "COMPANY_DELETE";

// Store Management Permissions
export const STORE_CREATE = "STORE_CREATE";
export const STORE_READ = "STORE_READ";
export const STORE_UPDATE = "STORE_UPDATE";
export const STORE_DELETE = "STORE_DELETE";

// Shift Operations Permissions
export const SHIFT_OPEN = "SHIFT_OPEN";
export const SHIFT_CLOSE = "SHIFT_CLOSE";
export const SHIFT_READ = "SHIFT_READ";
export const SHIFT_RECONCILE = "SHIFT_RECONCILE";
export const SHIFT_REPORT_VIEW = "SHIFT_REPORT_VIEW";

// Transaction Permissions
export const TRANSACTION_CREATE = "TRANSACTION_CREATE";
export const TRANSACTION_READ = "TRANSACTION_READ";
export const TRANSACTION_IMPORT = "TRANSACTION_IMPORT";

// Inventory Permissions
export const INVENTORY_READ = "INVENTORY_READ";
export const INVENTORY_ADJUST = "INVENTORY_ADJUST";
export const INVENTORY_ORDER = "INVENTORY_ORDER";

// Lottery Permissions
export const LOTTERY_PACK_RECEIVE = "LOTTERY_PACK_RECEIVE";
export const LOTTERY_PACK_ACTIVATE = "LOTTERY_PACK_ACTIVATE";
export const LOTTERY_SHIFT_OPEN = "LOTTERY_SHIFT_OPEN";
export const LOTTERY_SHIFT_CLOSE = "LOTTERY_SHIFT_CLOSE";
export const LOTTERY_SHIFT_RECONCILE = "LOTTERY_SHIFT_RECONCILE";
export const LOTTERY_REPORT = "LOTTERY_REPORT";

// Report Permissions
export const REPORT_SHIFT = "REPORT_SHIFT";
export const REPORT_DAILY = "REPORT_DAILY";
export const REPORT_ANALYTICS = "REPORT_ANALYTICS";
export const REPORT_EXPORT = "REPORT_EXPORT";

// Admin Permissions
export const ADMIN_OVERRIDE = "ADMIN_OVERRIDE";
export const ADMIN_AUDIT_VIEW = "ADMIN_AUDIT_VIEW";
export const ADMIN_SYSTEM_CONFIG = "ADMIN_SYSTEM_CONFIG";

// Client Dashboard Permissions
export const CLIENT_DASHBOARD_ACCESS = "CLIENT_DASHBOARD_ACCESS";

// Client Employee Management Permissions
export const CLIENT_EMPLOYEE_CREATE = "CLIENT_EMPLOYEE_CREATE";
export const CLIENT_EMPLOYEE_READ = "CLIENT_EMPLOYEE_READ";
export const CLIENT_EMPLOYEE_DELETE = "CLIENT_EMPLOYEE_DELETE";

// Client Role Management Permissions
export const CLIENT_ROLE_MANAGE = "CLIENT_ROLE_MANAGE";

// Cashier Management Permissions
export const CASHIER_CREATE = "CASHIER_CREATE";
export const CASHIER_READ = "CASHIER_READ";
export const CASHIER_UPDATE = "CASHIER_UPDATE";
export const CASHIER_DELETE = "CASHIER_DELETE";

/**
 * All permission codes as a constant object
 * Useful for validation and iteration
 */
export const PERMISSIONS = {
  // User Management
  USER_CREATE,
  USER_READ,
  USER_UPDATE,
  USER_DELETE,

  // Company Management
  COMPANY_CREATE,
  COMPANY_READ,
  COMPANY_UPDATE,
  COMPANY_DELETE,

  // Store Management
  STORE_CREATE,
  STORE_READ,
  STORE_UPDATE,
  STORE_DELETE,

  // Shift Operations
  SHIFT_OPEN,
  SHIFT_CLOSE,
  SHIFT_READ,
  SHIFT_RECONCILE,
  SHIFT_REPORT_VIEW,

  // Transactions
  TRANSACTION_CREATE,
  TRANSACTION_READ,
  TRANSACTION_IMPORT,

  // Inventory
  INVENTORY_READ,
  INVENTORY_ADJUST,
  INVENTORY_ORDER,

  // Lottery
  LOTTERY_PACK_RECEIVE,
  LOTTERY_PACK_ACTIVATE,
  LOTTERY_SHIFT_OPEN,
  LOTTERY_SHIFT_CLOSE,
  LOTTERY_SHIFT_RECONCILE,
  LOTTERY_REPORT,

  // Reports
  REPORT_SHIFT,
  REPORT_DAILY,
  REPORT_ANALYTICS,
  REPORT_EXPORT,

  // Admin
  ADMIN_OVERRIDE,
  ADMIN_AUDIT_VIEW,
  ADMIN_SYSTEM_CONFIG,

  // Client Dashboard
  CLIENT_DASHBOARD_ACCESS,

  // Client Employee Management
  CLIENT_EMPLOYEE_CREATE,
  CLIENT_EMPLOYEE_READ,
  CLIENT_EMPLOYEE_DELETE,

  // Client Role Management
  CLIENT_ROLE_MANAGE,

  // Cashier Management
  CASHIER_CREATE,
  CASHIER_READ,
  CASHIER_UPDATE,
  CASHIER_DELETE,
} as const;

/**
 * Type for permission codes
 * Useful for TypeScript type checking
 */
export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Array of all permission codes
 * Useful for seeding and validation
 */
export const ALL_PERMISSIONS: PermissionCode[] = Object.values(PERMISSIONS);

/**
 * Permission descriptions for documentation and UI
 */
export const PERMISSION_DESCRIPTIONS: Record<PermissionCode, string> = {
  // User Management
  [USER_CREATE]: "Create new users",
  [USER_READ]: "View user information",
  [USER_UPDATE]: "Update user information",
  [USER_DELETE]: "Delete users",

  // Company Management
  [COMPANY_CREATE]: "Create new companies",
  [COMPANY_READ]: "View company information",
  [COMPANY_UPDATE]: "Update company information",
  [COMPANY_DELETE]: "Delete companies",

  // Store Management
  [STORE_CREATE]: "Create new stores",
  [STORE_READ]: "View store information",
  [STORE_UPDATE]: "Update store information",
  [STORE_DELETE]: "Delete stores",

  // Shift Operations
  [SHIFT_OPEN]: "Open shifts",
  [SHIFT_CLOSE]: "Close shifts",
  [SHIFT_READ]: "View shift information",
  [SHIFT_RECONCILE]: "Reconcile cash for shifts",
  [SHIFT_REPORT_VIEW]: "View shift reports",

  // Transactions
  [TRANSACTION_CREATE]: "Create transactions",
  [TRANSACTION_READ]: "View transactions",
  [TRANSACTION_IMPORT]: "Import transactions in bulk",

  // Inventory
  [INVENTORY_READ]: "View inventory levels",
  [INVENTORY_ADJUST]: "Adjust inventory quantities",
  [INVENTORY_ORDER]: "Create inventory orders",

  // Lottery
  [LOTTERY_PACK_RECEIVE]: "Receive lottery packs",
  [LOTTERY_PACK_ACTIVATE]: "Activate lottery packs",
  [LOTTERY_SHIFT_OPEN]: "Open shifts with lottery pack openings",
  [LOTTERY_SHIFT_CLOSE]: "Close shifts with lottery pack closings",
  [LOTTERY_SHIFT_RECONCILE]: "Reconcile lottery during shift",
  [LOTTERY_REPORT]: "Generate lottery reports",

  // Reports
  [REPORT_SHIFT]: "Generate shift reports",
  [REPORT_DAILY]: "Generate daily reports",
  [REPORT_ANALYTICS]: "View analytics reports",
  [REPORT_EXPORT]: "Export reports",

  // Admin
  [ADMIN_OVERRIDE]: "Override system restrictions",
  [ADMIN_AUDIT_VIEW]: "View audit logs",
  [ADMIN_SYSTEM_CONFIG]: "Configure system settings",

  // Client Dashboard
  [CLIENT_DASHBOARD_ACCESS]:
    "Access client dashboard and view owned companies/stores",

  // Client Employee Management
  [CLIENT_EMPLOYEE_CREATE]: "Create employees for owned stores",
  [CLIENT_EMPLOYEE_READ]: "View employees for owned stores",
  [CLIENT_EMPLOYEE_DELETE]: "Delete employees for owned stores",

  // Client Role Management
  [CLIENT_ROLE_MANAGE]: "Manage role permissions for owned stores",

  // Cashier Management
  [CASHIER_CREATE]: "Create cashiers for stores",
  [CASHIER_READ]: "View cashier list and details",
  [CASHIER_UPDATE]: "Update cashier information",
  [CASHIER_DELETE]: "Deactivate/remove cashiers",
};

/**
 * Permission Categories for UI Display
 *
 * Groups permissions into logical categories for the role permission editor.
 * This map includes both client-assignable permissions (for STORE scope roles)
 * and restricted permissions (for system/admin use only). The categories are
 * used for organizing permissions in the UI and for getPermissionCategory().
 *
 * Note: The presence of a permission in a category does NOT imply it's
 * client-assignable. See CLIENT_ASSIGNABLE_PERMISSIONS for the definitive
 * list of permissions clients can assign to roles.
 */
export const PERMISSION_CATEGORIES = {
  SHIFTS: {
    name: "Shift Operations",
    description:
      "Permissions for opening, closing, reconciling, and viewing shifts",
    permissions: [
      SHIFT_OPEN,
      SHIFT_CLOSE,
      SHIFT_RECONCILE,
      SHIFT_READ,
      SHIFT_REPORT_VIEW,
    ],
  },
  TRANSACTIONS: {
    name: "Transactions",
    description: "Permissions for creating and viewing transactions",
    permissions: [TRANSACTION_CREATE, TRANSACTION_READ],
  },
  INVENTORY: {
    name: "Inventory",
    description: "Permissions for viewing and managing inventory",
    permissions: [INVENTORY_READ, INVENTORY_ADJUST, INVENTORY_ORDER],
  },
  LOTTERY: {
    name: "Lottery",
    description: "Permissions for lottery pack management and reconciliation",
    permissions: [
      LOTTERY_PACK_RECEIVE,
      LOTTERY_PACK_ACTIVATE,
      LOTTERY_SHIFT_OPEN,
      LOTTERY_SHIFT_CLOSE,
      LOTTERY_SHIFT_RECONCILE,
      LOTTERY_REPORT,
    ],
  },
  REPORTS: {
    name: "Reports",
    description: "Permissions for viewing and generating reports",
    permissions: [REPORT_SHIFT, REPORT_DAILY, REPORT_ANALYTICS, REPORT_EXPORT],
  },
  EMPLOYEES: {
    name: "Employee Management",
    description: "Permissions for managing store employees",
    permissions: [
      CLIENT_EMPLOYEE_CREATE,
      CLIENT_EMPLOYEE_READ,
      CLIENT_EMPLOYEE_DELETE,
    ],
  },
  ROLES: {
    name: "Role Management",
    description: "Permissions for managing role permissions and assignments",
    permissions: [CLIENT_ROLE_MANAGE],
  },
  STORE: {
    name: "Store",
    description: "Permissions for viewing and updating store information",
    permissions: [STORE_READ, STORE_UPDATE],
  },
  CASHIERS: {
    name: "Cashier Management",
    description: "Permissions for managing cashiers at store terminals",
    permissions: [CASHIER_CREATE, CASHIER_READ, CASHIER_UPDATE, CASHIER_DELETE],
  },
} as const;

/**
 * CLIENT_ASSIGNABLE_PERMISSIONS
 *
 * Permissions that Client Owners can assign to STORE scope roles.
 * These are operational permissions safe for delegation to store staff.
 *
 * SECURITY: This list is deny-by-default. Only explicitly listed permissions
 * can be assigned by clients. Any new permission requires security review
 * before being added to this list.
 *
 * INCLUDED (safe for client delegation):
 * - Shift operations: Daily shift management
 * - Transactions: POS transaction processing
 * - Inventory: Stock management (read-only or with adjustment rights)
 * - Lottery: Scratch-off pack management
 * - Reports: Shift and daily reporting
 * - Client employees: Managing store staff
 * - Store: Read and update store info
 *
 * EXCLUDED (require system admin - security/compliance risk):
 * - ADMIN_*: System administration (security risk)
 * - COMPANY_*: Company management (scope violation)
 * - CLIENT_DASHBOARD_ACCESS: Always required, cannot be removed
 * - CLIENT_ROLE_MANAGE: Only for Client Owner (privilege escalation risk)
 * - USER_CREATE/UPDATE/DELETE: System user management (scope violation)
 * - STORE_CREATE/DELETE: Store lifecycle (scope violation)
 */
export const CLIENT_ASSIGNABLE_PERMISSIONS: PermissionCode[] = [
  // Shift Operations - Core daily operations
  SHIFT_OPEN,
  SHIFT_CLOSE,
  SHIFT_RECONCILE,
  SHIFT_READ,
  SHIFT_REPORT_VIEW,

  // Transactions - POS transaction processing
  TRANSACTION_CREATE,
  TRANSACTION_READ,
  TRANSACTION_IMPORT,

  // Inventory - Stock management
  INVENTORY_READ,
  INVENTORY_ADJUST,
  INVENTORY_ORDER,

  // Lottery - Scratch-off pack management
  LOTTERY_PACK_RECEIVE,
  LOTTERY_PACK_ACTIVATE,
  LOTTERY_SHIFT_OPEN,
  LOTTERY_SHIFT_CLOSE,
  LOTTERY_SHIFT_RECONCILE,
  LOTTERY_REPORT,

  // Reports - Shift and daily reporting
  REPORT_SHIFT,
  REPORT_DAILY,
  REPORT_ANALYTICS,
  REPORT_EXPORT,

  // Client Employee Management - Managing store staff (delegation)
  CLIENT_EMPLOYEE_CREATE,
  CLIENT_EMPLOYEE_READ,
  CLIENT_EMPLOYEE_DELETE,

  // Cashier Management - Managing cashiers for stores
  CASHIER_CREATE,
  CASHIER_READ,
  CASHIER_UPDATE,
  CASHIER_DELETE,

  // Store - Read and update store information
  STORE_READ,
  STORE_UPDATE,
];

/**
 * CLIENT_RESTRICTED_PERMISSIONS
 *
 * Permissions that clients CANNOT assign to roles.
 * These are system-managed permissions that require elevated privileges.
 *
 * SECURITY: Any attempt to assign these permissions via the client API
 * must be rejected with a clear error message.
 */
export const CLIENT_RESTRICTED_PERMISSIONS: PermissionCode[] = [
  // Admin - System administration (security risk)
  ADMIN_OVERRIDE,
  ADMIN_AUDIT_VIEW,
  ADMIN_SYSTEM_CONFIG,

  // Company Management - Scope violation (clients manage stores, not companies)
  COMPANY_CREATE,
  COMPANY_READ,
  COMPANY_UPDATE,
  COMPANY_DELETE,

  // User Management - System user management (scope violation)
  USER_CREATE,
  USER_READ,
  USER_UPDATE,
  USER_DELETE,

  // Store Lifecycle - Scope violation (clients cannot create/delete stores via role assignment)
  STORE_CREATE,
  STORE_DELETE,

  // Client Dashboard Access - Always required, cannot be removed (breaks access)
  CLIENT_DASHBOARD_ACCESS,

  // Client Role Management - Only for Client Owner (privilege escalation risk)
  CLIENT_ROLE_MANAGE,
];

/**
 * Helper function to check if a permission is assignable by clients
 * @param permissionCode The permission code to check
 * @returns true if the permission can be assigned by clients
 */
export function isClientAssignablePermission(permissionCode: string): boolean {
  return CLIENT_ASSIGNABLE_PERMISSIONS.includes(
    permissionCode as PermissionCode,
  );
}

/**
 * Helper function to get permission category for a permission code
 * @param permissionCode The permission code to look up
 * @returns The category name or null if not found
 */
export function getPermissionCategory(permissionCode: string): string | null {
  for (const [categoryKey, category] of Object.entries(PERMISSION_CATEGORIES)) {
    if ((category.permissions as readonly string[]).includes(permissionCode)) {
      return categoryKey;
    }
  }
  return null;
}
