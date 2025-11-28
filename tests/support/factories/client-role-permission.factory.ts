/**
 * Client Role Permission Test Data Factory
 *
 * Generates realistic test data for Client Role Permission entities using faker.
 * Follows factory pattern with override support for specific scenarios.
 *
 * Story: 2.92 - Client Role Permission Management
 */

import { faker } from "@faker-js/faker";

/**
 * Client role permission data structure
 */
export interface ClientRolePermissionData {
  owner_user_id: string;
  role_id: string;
  permission_id: string;
  is_enabled: boolean;
}

/**
 * Create a client role permission with optional overrides
 *
 * @param overrides - Optional fields to override default values
 * @returns ClientRolePermissionData object for testing
 *
 * @example
 * const permission = createClientRolePermission({ owner_user_id: 'user-uuid', role_id: 'role-uuid' });
 */
export const createClientRolePermission = (
  overrides: Partial<ClientRolePermissionData> = {},
): ClientRolePermissionData => ({
  owner_user_id: overrides.owner_user_id || faker.string.uuid(),
  role_id: overrides.role_id || faker.string.uuid(),
  permission_id: overrides.permission_id || faker.string.uuid(),
  is_enabled: overrides.is_enabled ?? true,
});

/**
 * Create multiple client role permissions
 *
 * @param count - Number of permissions to create
 * @param overrides - Optional fields to override for all permissions
 * @returns Array of ClientRolePermissionData objects
 *
 * @example
 * const permissions = createClientRolePermissions(5, { owner_user_id: 'user-uuid' });
 */
export const createClientRolePermissions = (
  count: number,
  overrides: Partial<ClientRolePermissionData> = {},
): ClientRolePermissionData[] =>
  Array.from({ length: count }, () => createClientRolePermission(overrides));

/**
 * Permission update request structure for API
 */
export interface UpdateRolePermissionsRequest {
  permissions: Array<{
    permission_id: string;
    is_enabled: boolean;
  }>;
}

/**
 * Create a permission update request
 *
 * @param permissions - Array of permission updates
 * @returns UpdateRolePermissionsRequest object for API testing
 *
 * @example
 * const request = createUpdateRolePermissionsRequest([
 *   { permission_id: 'perm-1', is_enabled: true },
 *   { permission_id: 'perm-2', is_enabled: false }
 * ]);
 */
export const createUpdateRolePermissionsRequest = (
  permissions: Array<{ permission_id: string; is_enabled: boolean }>,
): UpdateRolePermissionsRequest => ({
  permissions,
});
