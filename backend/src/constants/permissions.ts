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

// Transaction Permissions
export const TRANSACTION_CREATE = "TRANSACTION_CREATE";
export const TRANSACTION_READ = "TRANSACTION_READ";

// Inventory Permissions
export const INVENTORY_READ = "INVENTORY_READ";
export const INVENTORY_ADJUST = "INVENTORY_ADJUST";
export const INVENTORY_ORDER = "INVENTORY_ORDER";

// Lottery Permissions
export const LOTTERY_PACK_RECEIVE = "LOTTERY_PACK_RECEIVE";
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

  // Transactions
  TRANSACTION_CREATE,
  TRANSACTION_READ,

  // Inventory
  INVENTORY_READ,
  INVENTORY_ADJUST,
  INVENTORY_ORDER,

  // Lottery
  LOTTERY_PACK_RECEIVE,
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

  // Transactions
  [TRANSACTION_CREATE]: "Create transactions",
  [TRANSACTION_READ]: "View transactions",

  // Inventory
  [INVENTORY_READ]: "View inventory levels",
  [INVENTORY_ADJUST]: "Adjust inventory quantities",
  [INVENTORY_ORDER]: "Create inventory orders",

  // Lottery
  [LOTTERY_PACK_RECEIVE]: "Receive lottery packs",
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
};
