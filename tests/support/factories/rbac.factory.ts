/**
 * RBAC Test Data Factories
 *
 * Pure functions for generating test data related to RBAC models:
 * - Role, Permission, UserRole, RolePermission entities
 * Uses faker for dynamic values to prevent collisions in parallel tests.
 */

import { faker } from "@faker-js/faker";

export type RoleData = {
  code: string;
  description: string;
  scope: "SYSTEM" | "COMPANY" | "STORE";
};

export type PermissionData = {
  code: string;
  description: string;
};

export type UserRoleData = {
  user_id: string;
  role_id: string;
  company_id?: string | null;
  store_id?: string | null;
};

export type RolePermissionData = {
  role_id: string;
  permission_id: string;
};

/**
 * Creates a Role test data object
 */
export const createRole = (overrides: Partial<RoleData> = {}): RoleData => ({
  code: faker.string.alphanumeric(10).toUpperCase(),
  description: faker.lorem.sentence(),
  scope: faker.helpers.arrayElement(["SYSTEM", "COMPANY", "STORE"]),
  ...overrides,
});

/**
 * Creates default role test data objects
 */
export const createSuperadminRole = (
  overrides: Partial<RoleData> = {},
): RoleData =>
  createRole({
    code: "SUPERADMIN",
    description: "System super administrator",
    scope: "SYSTEM",
    ...overrides,
  });

export const createCorporateAdminRole = (
  overrides: Partial<RoleData> = {},
): RoleData =>
  createRole({
    code: "CORPORATE_ADMIN",
    description: "Corporate administrator",
    scope: "COMPANY",
    ...overrides,
  });

export const createStoreManagerRole = (
  overrides: Partial<RoleData> = {},
): RoleData =>
  createRole({
    code: "STORE_MANAGER",
    description: "Store manager",
    scope: "STORE",
    ...overrides,
  });

export const createShiftManagerRole = (
  overrides: Partial<RoleData> = {},
): RoleData =>
  createRole({
    code: "SHIFT_MANAGER",
    description: "Shift manager",
    scope: "STORE",
    ...overrides,
  });

export const createCashierRole = (
  overrides: Partial<RoleData> = {},
): RoleData =>
  createRole({
    code: "CASHIER",
    description: "Cashier",
    scope: "STORE",
    ...overrides,
  });

/**
 * Creates a Permission test data object
 */
export const createPermission = (
  overrides: Partial<PermissionData> = {},
): PermissionData => ({
  code: faker.string.alphanumeric(10).toUpperCase(),
  description: faker.lorem.sentence(),
  ...overrides,
});

/**
 * Creates default permission test data objects
 */
export const createUserCreatePermission = (
  overrides: Partial<PermissionData> = {},
): PermissionData =>
  createPermission({
    code: "USER_CREATE",
    description: "Create users",
    ...overrides,
  });

export const createUserReadPermission = (
  overrides: Partial<PermissionData> = {},
): PermissionData =>
  createPermission({
    code: "USER_READ",
    description: "Read users",
    ...overrides,
  });

export const createUserUpdatePermission = (
  overrides: Partial<PermissionData> = {},
): PermissionData =>
  createPermission({
    code: "USER_UPDATE",
    description: "Update users",
    ...overrides,
  });

export const createUserDeletePermission = (
  overrides: Partial<PermissionData> = {},
): PermissionData =>
  createPermission({
    code: "USER_DELETE",
    description: "Delete users",
    ...overrides,
  });

export const createStoreCreatePermission = (
  overrides: Partial<PermissionData> = {},
): PermissionData =>
  createPermission({
    code: "STORE_CREATE",
    description: "Create stores",
    ...overrides,
  });

export const createStoreReadPermission = (
  overrides: Partial<PermissionData> = {},
): PermissionData =>
  createPermission({
    code: "STORE_READ",
    description: "Read stores",
    ...overrides,
  });

export const createShiftOpenPermission = (
  overrides: Partial<PermissionData> = {},
): PermissionData =>
  createPermission({
    code: "SHIFT_OPEN",
    description: "Open shifts",
    ...overrides,
  });

export const createShiftClosePermission = (
  overrides: Partial<PermissionData> = {},
): PermissionData =>
  createPermission({
    code: "SHIFT_CLOSE",
    description: "Close shifts",
    ...overrides,
  });

/**
 * Creates a UserRole test data object
 */
export const createUserRole = (
  overrides: Partial<UserRoleData> = {},
): UserRoleData => ({
  user_id: overrides.user_id || faker.string.uuid(),
  role_id: overrides.role_id || faker.string.uuid(),
  company_id: overrides.company_id ?? null,
  store_id: overrides.store_id ?? null,
  ...overrides,
});

/**
 * Creates a RolePermission test data object
 */
export const createRolePermission = (
  overrides: Partial<RolePermissionData> = {},
): RolePermissionData => ({
  role_id: overrides.role_id || faker.string.uuid(),
  permission_id: overrides.permission_id || faker.string.uuid(),
  ...overrides,
});

/**
 * Creates multiple Role test data objects
 */
export const createRoles = (
  count: number,
  overrides: Partial<RoleData> = {},
): RoleData[] => Array.from({ length: count }, () => createRole(overrides));

/**
 * Creates multiple Permission test data objects
 */
export const createPermissions = (
  count: number,
  overrides: Partial<PermissionData> = {},
): PermissionData[] =>
  Array.from({ length: count }, () => createPermission(overrides));

/**
 * Creates multiple UserRole test data objects
 */
export const createUserRoles = (
  count: number,
  overrides: Partial<UserRoleData> = {},
): UserRoleData[] =>
  Array.from({ length: count }, () => createUserRole(overrides));

/**
 * Creates multiple RolePermission test data objects
 */
export const createRolePermissions = (
  count: number,
  overrides: Partial<RolePermissionData> = {},
): RolePermissionData[] =>
  Array.from({ length: count }, () => createRolePermission(overrides));
