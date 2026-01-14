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
export const LOTTERY_GAME_READ = "LOTTERY_GAME_READ";
export const LOTTERY_GAME_CREATE = "LOTTERY_GAME_CREATE";
export const LOTTERY_PACK_READ = "LOTTERY_PACK_READ";
export const LOTTERY_PACK_RECEIVE = "LOTTERY_PACK_RECEIVE";
export const LOTTERY_PACK_ACTIVATE = "LOTTERY_PACK_ACTIVATE";
export const LOTTERY_VARIANCE_READ = "LOTTERY_VARIANCE_READ";
export const LOTTERY_BIN_READ = "LOTTERY_BIN_READ";
export const LOTTERY_BIN_MANAGE = "LOTTERY_BIN_MANAGE";
export const LOTTERY_BIN_CONFIG_READ = "LOTTERY_BIN_CONFIG_READ";
export const LOTTERY_BIN_CONFIG_WRITE = "LOTTERY_BIN_CONFIG_WRITE";
export const LOTTERY_SHIFT_OPEN = "LOTTERY_SHIFT_OPEN";
export const LOTTERY_SHIFT_CLOSE = "LOTTERY_SHIFT_CLOSE";
export const LOTTERY_SHIFT_RECONCILE = "LOTTERY_SHIFT_RECONCILE";
export const LOTTERY_REPORT = "LOTTERY_REPORT";
export const LOTTERY_MANUAL_ENTRY = "LOTTERY_MANUAL_ENTRY";
export const LOTTERY_SERIAL_OVERRIDE = "LOTTERY_SERIAL_OVERRIDE";
export const LOTTERY_MARK_SOLD = "LOTTERY_MARK_SOLD";

// Report Permissions
export const REPORT_SHIFT = "REPORT_SHIFT";
export const REPORT_DAILY = "REPORT_DAILY";
export const REPORT_ANALYTICS = "REPORT_ANALYTICS";
export const REPORT_EXPORT = "REPORT_EXPORT";

// X/Z Report Permissions (Phase 4: Report Snapshots)
export const X_REPORT_GENERATE = "X_REPORT_GENERATE";
export const X_REPORT_READ = "X_REPORT_READ";
export const Z_REPORT_READ = "Z_REPORT_READ";
export const Z_REPORT_VERIFY = "Z_REPORT_VERIFY";

// Admin Permissions
export const ADMIN_OVERRIDE = "ADMIN_OVERRIDE";
export const ADMIN_AUDIT_VIEW = "ADMIN_AUDIT_VIEW";
export const ADMIN_SYSTEM_CONFIG = "ADMIN_SYSTEM_CONFIG";

// API Key Permissions (Desktop POS Authentication)
// Superadmin-only permissions for managing API keys
export const API_KEY_CREATE = "API_KEY_CREATE";
export const API_KEY_READ = "API_KEY_READ";
export const API_KEY_UPDATE = "API_KEY_UPDATE";
export const API_KEY_REVOKE = "API_KEY_REVOKE";
export const API_KEY_ROTATE = "API_KEY_ROTATE";

// Client Dashboard Permissions
export const CLIENT_DASHBOARD_ACCESS = "CLIENT_DASHBOARD_ACCESS";

// Client Employee Management Permissions
export const CLIENT_EMPLOYEE_CREATE = "CLIENT_EMPLOYEE_CREATE";
export const CLIENT_EMPLOYEE_READ = "CLIENT_EMPLOYEE_READ";
export const CLIENT_EMPLOYEE_DELETE = "CLIENT_EMPLOYEE_DELETE";
export const CLIENT_EMPLOYEE_MANAGE = "CLIENT_EMPLOYEE_MANAGE";

// Client Role Management Permissions
export const CLIENT_ROLE_MANAGE = "CLIENT_ROLE_MANAGE";

// Cashier Management Permissions
export const CASHIER_CREATE = "CASHIER_CREATE";
export const CASHIER_READ = "CASHIER_READ";
export const CASHIER_UPDATE = "CASHIER_UPDATE";
export const CASHIER_DELETE = "CASHIER_DELETE";

// Configuration Management Permissions (Phase 1: Shift & Day Summary)
export const TENDER_TYPE_READ = "TENDER_TYPE_READ";
export const TENDER_TYPE_MANAGE = "TENDER_TYPE_MANAGE";
export const DEPARTMENT_READ = "DEPARTMENT_READ";
export const DEPARTMENT_MANAGE = "DEPARTMENT_MANAGE";
export const TAX_RATE_READ = "TAX_RATE_READ";
export const TAX_RATE_MANAGE = "TAX_RATE_MANAGE";
export const CONFIG_READ = "CONFIG_READ";
export const CONFIG_MANAGE = "CONFIG_MANAGE";

// POS Integration Permissions (Phase 1.6: POS Integration & Auto-Onboarding)
export const POS_CONNECTION_READ = "POS_CONNECTION_READ";
export const POS_CONNECTION_MANAGE = "POS_CONNECTION_MANAGE";
export const POS_SYNC_TRIGGER = "POS_SYNC_TRIGGER";
export const POS_SYNC_LOG_READ = "POS_SYNC_LOG_READ";

// POS Audit Permissions (Phase 0: Data Exchange Audit Infrastructure)
export const POS_AUDIT_READ = "POS_AUDIT_READ";

// NAXML File Management Permissions (Phase 1: NAXML Core Infrastructure)
export const NAXML_FILE_READ = "NAXML_FILE_READ";
export const NAXML_FILE_IMPORT = "NAXML_FILE_IMPORT";
export const NAXML_FILE_EXPORT = "NAXML_FILE_EXPORT";
export const NAXML_WATCHER_READ = "NAXML_WATCHER_READ";
export const NAXML_WATCHER_MANAGE = "NAXML_WATCHER_MANAGE";

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
  LOTTERY_GAME_READ,
  LOTTERY_GAME_CREATE,
  LOTTERY_PACK_READ,
  LOTTERY_PACK_RECEIVE,
  LOTTERY_PACK_ACTIVATE,
  LOTTERY_VARIANCE_READ,
  LOTTERY_BIN_READ,
  LOTTERY_BIN_MANAGE,
  LOTTERY_BIN_CONFIG_READ,
  LOTTERY_BIN_CONFIG_WRITE,
  LOTTERY_SHIFT_OPEN,
  LOTTERY_SHIFT_CLOSE,
  LOTTERY_SHIFT_RECONCILE,
  LOTTERY_REPORT,
  LOTTERY_MANUAL_ENTRY,
  LOTTERY_SERIAL_OVERRIDE,
  LOTTERY_MARK_SOLD,

  // Reports
  REPORT_SHIFT,
  REPORT_DAILY,
  REPORT_ANALYTICS,
  REPORT_EXPORT,

  // X/Z Reports (Phase 4)
  X_REPORT_GENERATE,
  X_REPORT_READ,
  Z_REPORT_READ,
  Z_REPORT_VERIFY,

  // Admin
  ADMIN_OVERRIDE,
  ADMIN_AUDIT_VIEW,
  ADMIN_SYSTEM_CONFIG,

  // API Key Management (Desktop POS)
  API_KEY_CREATE,
  API_KEY_READ,
  API_KEY_UPDATE,
  API_KEY_REVOKE,
  API_KEY_ROTATE,

  // Client Dashboard
  CLIENT_DASHBOARD_ACCESS,

  // Client Employee Management
  CLIENT_EMPLOYEE_CREATE,
  CLIENT_EMPLOYEE_READ,
  CLIENT_EMPLOYEE_DELETE,
  CLIENT_EMPLOYEE_MANAGE,

  // Client Role Management
  CLIENT_ROLE_MANAGE,

  // Cashier Management
  CASHIER_CREATE,
  CASHIER_READ,
  CASHIER_UPDATE,
  CASHIER_DELETE,

  // Configuration Management (Phase 1: Shift & Day Summary)
  TENDER_TYPE_READ,
  TENDER_TYPE_MANAGE,
  DEPARTMENT_READ,
  DEPARTMENT_MANAGE,
  TAX_RATE_READ,
  TAX_RATE_MANAGE,
  CONFIG_READ,
  CONFIG_MANAGE,

  // POS Integration (Phase 1.6: POS Integration & Auto-Onboarding)
  POS_CONNECTION_READ,
  POS_CONNECTION_MANAGE,
  POS_SYNC_TRIGGER,
  POS_SYNC_LOG_READ,

  // POS Audit (Phase 0: Data Exchange Audit Infrastructure)
  POS_AUDIT_READ,

  // NAXML File Management (Phase 1: NAXML Core Infrastructure)
  NAXML_FILE_READ,
  NAXML_FILE_IMPORT,
  NAXML_FILE_EXPORT,
  NAXML_WATCHER_READ,
  NAXML_WATCHER_MANAGE,
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
  [LOTTERY_GAME_READ]: "View lottery games",
  [LOTTERY_GAME_CREATE]: "Create and import lottery games",
  [LOTTERY_PACK_READ]: "View lottery packs",
  [LOTTERY_PACK_RECEIVE]: "Receive lottery packs",
  [LOTTERY_PACK_ACTIVATE]: "Activate lottery packs",
  [LOTTERY_VARIANCE_READ]: "View lottery variances",
  [LOTTERY_BIN_READ]: "View lottery bins",
  [LOTTERY_BIN_MANAGE]: "Create, update, and delete lottery bins",
  [LOTTERY_BIN_CONFIG_READ]: "View lottery bin configurations",
  [LOTTERY_BIN_CONFIG_WRITE]: "Create and update lottery bin configurations",
  [LOTTERY_SHIFT_OPEN]: "Open shifts with lottery pack openings",
  [LOTTERY_SHIFT_CLOSE]: "Close shifts with lottery pack closings",
  [LOTTERY_SHIFT_RECONCILE]: "Reconcile lottery during shift",
  [LOTTERY_REPORT]: "Generate lottery reports",
  [LOTTERY_MANUAL_ENTRY]:
    "Override mandatory barcode scanning for manual lottery serial entry",
  [LOTTERY_SERIAL_OVERRIDE]:
    "Change starting serial number when activating lottery packs (default is 0)",
  [LOTTERY_MARK_SOLD]:
    "Mark lottery packs as pre-sold during activation (requires manager approval for cashiers)",

  // Reports
  [REPORT_SHIFT]: "Generate shift reports",
  [REPORT_DAILY]: "Generate daily reports",
  [REPORT_ANALYTICS]: "View analytics reports",
  [REPORT_EXPORT]: "Export reports",

  // X/Z Reports (Phase 4)
  [X_REPORT_GENERATE]: "Generate X Reports (mid-shift snapshots)",
  [X_REPORT_READ]: "View X Reports",
  [Z_REPORT_READ]: "View Z Reports (end-of-shift final snapshots)",
  [Z_REPORT_VERIFY]: "Verify Z Report integrity",

  // Admin
  [ADMIN_OVERRIDE]: "Override system restrictions",
  [ADMIN_AUDIT_VIEW]: "View audit logs",
  [ADMIN_SYSTEM_CONFIG]: "Configure system settings",

  // API Key Management (Desktop POS)
  [API_KEY_CREATE]: "Create API keys for desktop POS applications",
  [API_KEY_READ]: "View API key details and audit logs",
  [API_KEY_UPDATE]: "Update API key settings (quotas, IP allowlist)",
  [API_KEY_REVOKE]: "Revoke API keys immediately",
  [API_KEY_ROTATE]: "Rotate API keys with grace period",

  // Client Dashboard
  [CLIENT_DASHBOARD_ACCESS]:
    "Access client dashboard and view owned companies/stores",

  // Client Employee Management
  [CLIENT_EMPLOYEE_CREATE]: "Create employees for owned stores",
  [CLIENT_EMPLOYEE_READ]: "View employees for owned stores",
  [CLIENT_EMPLOYEE_DELETE]: "Delete employees for owned stores",
  [CLIENT_EMPLOYEE_MANAGE]:
    "Manage employee credentials (email, password) for owned stores",

  // Client Role Management
  [CLIENT_ROLE_MANAGE]: "Manage role permissions for owned stores",

  // Cashier Management
  [CASHIER_CREATE]: "Create cashiers for stores",
  [CASHIER_READ]: "View cashier list and details",
  [CASHIER_UPDATE]: "Update cashier information",
  [CASHIER_DELETE]: "Deactivate/remove cashiers",

  // Configuration Management (Phase 1: Shift & Day Summary)
  [TENDER_TYPE_READ]: "View tender types (payment methods)",
  [TENDER_TYPE_MANAGE]: "Create, update, and delete tender types",
  [DEPARTMENT_READ]: "View departments",
  [DEPARTMENT_MANAGE]: "Create, update, and delete departments",
  [TAX_RATE_READ]: "View tax rates",
  [TAX_RATE_MANAGE]: "Create, update, and delete tax rates",
  [CONFIG_READ]: "View system configuration",
  [CONFIG_MANAGE]: "Manage system configuration",

  // POS Integration (Phase 1.6: POS Integration & Auto-Onboarding)
  [POS_CONNECTION_READ]: "View POS integration connection details",
  [POS_CONNECTION_MANAGE]: "Create, update, and delete POS connections",
  [POS_SYNC_TRIGGER]: "Trigger manual POS data synchronization",
  [POS_SYNC_LOG_READ]: "View POS synchronization history and logs",

  // POS Audit (Phase 0: Data Exchange Audit Infrastructure)
  [POS_AUDIT_READ]: "View POS data exchange audit records for compliance",

  // NAXML File Management (Phase 1: NAXML Core Infrastructure)
  [NAXML_FILE_READ]: "View NAXML file processing logs and status",
  [NAXML_FILE_IMPORT]: "Import NAXML files for processing",
  [NAXML_FILE_EXPORT]: "Export data to NAXML format",
  [NAXML_WATCHER_READ]: "View file watcher configuration and status",
  [NAXML_WATCHER_MANAGE]: "Configure and control file watcher service",
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
      LOTTERY_GAME_READ,
      LOTTERY_GAME_CREATE,
      LOTTERY_PACK_READ,
      LOTTERY_PACK_RECEIVE,
      LOTTERY_PACK_ACTIVATE,
      LOTTERY_VARIANCE_READ,
      LOTTERY_BIN_READ,
      LOTTERY_BIN_MANAGE,
      LOTTERY_BIN_CONFIG_READ,
      LOTTERY_BIN_CONFIG_WRITE,
      LOTTERY_SHIFT_OPEN,
      LOTTERY_SHIFT_CLOSE,
      LOTTERY_SHIFT_RECONCILE,
      LOTTERY_REPORT,
      LOTTERY_MANUAL_ENTRY,
      LOTTERY_SERIAL_OVERRIDE,
      LOTTERY_MARK_SOLD,
    ],
  },
  REPORTS: {
    name: "Reports",
    description: "Permissions for viewing and generating reports",
    permissions: [
      REPORT_SHIFT,
      REPORT_DAILY,
      REPORT_ANALYTICS,
      REPORT_EXPORT,
      X_REPORT_GENERATE,
      X_REPORT_READ,
      Z_REPORT_READ,
      Z_REPORT_VERIFY,
    ],
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
  CONFIG: {
    name: "Configuration",
    description:
      "Permissions for managing system configuration (tender types, departments, tax rates)",
    permissions: [
      TENDER_TYPE_READ,
      TENDER_TYPE_MANAGE,
      DEPARTMENT_READ,
      DEPARTMENT_MANAGE,
      TAX_RATE_READ,
      TAX_RATE_MANAGE,
      CONFIG_READ,
      CONFIG_MANAGE,
    ],
  },
  POS_INTEGRATION: {
    name: "POS Integration",
    description:
      "Permissions for managing POS system connections and synchronization",
    permissions: [
      POS_CONNECTION_READ,
      POS_CONNECTION_MANAGE,
      POS_SYNC_TRIGGER,
      POS_SYNC_LOG_READ,
    ],
  },
  POS_AUDIT: {
    name: "POS Audit",
    description:
      "Permissions for viewing POS data exchange audit records (compliance)",
    permissions: [POS_AUDIT_READ],
  },
  NAXML: {
    name: "NAXML File Management",
    description:
      "Permissions for managing NAXML file processing and file watcher service",
    permissions: [
      NAXML_FILE_READ,
      NAXML_FILE_IMPORT,
      NAXML_FILE_EXPORT,
      NAXML_WATCHER_READ,
      NAXML_WATCHER_MANAGE,
    ],
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
  LOTTERY_GAME_READ,
  LOTTERY_GAME_CREATE,
  LOTTERY_PACK_READ,
  LOTTERY_PACK_RECEIVE,
  LOTTERY_PACK_ACTIVATE,
  LOTTERY_VARIANCE_READ,
  LOTTERY_BIN_READ,
  LOTTERY_BIN_MANAGE,
  LOTTERY_BIN_CONFIG_READ,
  LOTTERY_BIN_CONFIG_WRITE,
  LOTTERY_SHIFT_OPEN,
  LOTTERY_SHIFT_CLOSE,
  LOTTERY_SHIFT_RECONCILE,
  LOTTERY_REPORT,
  LOTTERY_MANUAL_ENTRY,
  LOTTERY_SERIAL_OVERRIDE,
  LOTTERY_MARK_SOLD,

  // Reports - Shift and daily reporting
  REPORT_SHIFT,
  REPORT_DAILY,
  REPORT_ANALYTICS,
  REPORT_EXPORT,

  // X/Z Reports - Mid-shift and end-of-shift snapshots (Phase 4)
  X_REPORT_GENERATE,
  X_REPORT_READ,
  Z_REPORT_READ,
  Z_REPORT_VERIFY,

  // Client Employee Management - Managing store staff (delegation)
  CLIENT_EMPLOYEE_CREATE,
  CLIENT_EMPLOYEE_READ,
  CLIENT_EMPLOYEE_DELETE,
  CLIENT_EMPLOYEE_MANAGE,

  // Cashier Management - Managing cashiers for stores
  CASHIER_CREATE,
  CASHIER_READ,
  CASHIER_UPDATE,
  CASHIER_DELETE,

  // Store - Read and update store information
  STORE_READ,
  STORE_UPDATE,

  // POS Integration - Managing store POS connections
  POS_CONNECTION_READ,
  POS_CONNECTION_MANAGE,
  POS_SYNC_TRIGGER,
  POS_SYNC_LOG_READ,

  // POS Audit - Viewing store POS data exchange audit records
  POS_AUDIT_READ,

  // NAXML File Management - Managing NAXML file processing
  NAXML_FILE_READ,
  NAXML_FILE_IMPORT,
  NAXML_FILE_EXPORT,
  NAXML_WATCHER_READ,
  NAXML_WATCHER_MANAGE,
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

  // API Key Management - Superadmin-only (security critical)
  API_KEY_CREATE,
  API_KEY_READ,
  API_KEY_UPDATE,
  API_KEY_REVOKE,
  API_KEY_ROTATE,

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
