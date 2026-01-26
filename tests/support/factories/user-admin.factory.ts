/**
 * User Admin Test Data Factory
 *
 * Generates realistic test data for User Admin entities using faker.
 * Follows factory pattern with override support for specific scenarios.
 *
 * Story: 2.8 - User and Role Management Dashboard
 */

import { faker } from "@faker-js/faker";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../../../backend/src/utils/public-id";

/**
 * User status enum values
 */
export type UserStatus = "ACTIVE" | "INACTIVE";

/**
 * Scope type enum values
 *
 * Scope Hierarchy:
 * - SYSTEM: Access to everything (superadmin)
 * - SUPPORT: Cross-company read access for support staff (no company_id/store_id required)
 * - COMPANY: Access to company and all stores within it
 * - STORE: Access to specific store only
 */
export type ScopeType = "SYSTEM" | "SUPPORT" | "COMPANY" | "STORE";

/**
 * User data structure for test creation
 */
export interface AdminUserData {
  public_id: string;
  email: string;
  name: string;
  status?: UserStatus;
}

/**
 * Role assignment request structure
 */
export interface AssignRoleRequest {
  role_id: string;
  scope_type: ScopeType;
  company_id?: string;
  store_id?: string;
}

/**
 * Create user request structure
 */
export interface CreateUserRequest {
  email: string;
  name: string;
  roles?: AssignRoleRequest[];
}

/**
 * Create a single admin user with optional overrides
 *
 * @param overrides - Optional fields to override default values
 * @returns AdminUserData object for test use
 *
 * @example
 * // Create with defaults
 * const user = createAdminUser();
 *
 * // Create with specific email
 * const namedUser = createAdminUser({ email: 'test@example.com' });
 */
export const createAdminUser = (
  overrides: Partial<AdminUserData> = {},
): AdminUserData => ({
  public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
  email: `test_${faker.string.alphanumeric(8).toLowerCase()}@test.nuvana.local`,
  name: `Test ${faker.person.fullName()}`,
  status: "ACTIVE",
  ...overrides,
});

/**
 * Create multiple admin users
 *
 * @param count - Number of users to create
 * @returns Array of AdminUserData objects
 *
 * @example
 * const users = createAdminUsers(5);
 */
export const createAdminUsers = (count: number): AdminUserData[] =>
  Array.from({ length: count }, () => createAdminUser());

/**
 * Create a user creation request with optional role assignments
 *
 * @param overrides - Optional fields to override default values
 * @returns CreateUserRequest object for API testing
 *
 * @example
 * const request = createUserRequest();
 * const requestWithRole = createUserRequest({
 *   roles: [{ role_id: 'uuid', scope_type: 'SYSTEM' }]
 * });
 */
export const createUserRequest = (
  overrides: Partial<CreateUserRequest> = {},
): CreateUserRequest => ({
  email: `test_${faker.string.alphanumeric(8).toLowerCase()}@test.nuvana.local`,
  name: `Test ${faker.person.fullName()}`,
  ...overrides,
});

/**
 * Create a SYSTEM scope role assignment request
 *
 * @param role_id - The role ID to assign
 * @returns AssignRoleRequest for SYSTEM scope
 *
 * @example
 * const assignment = createSystemScopeAssignment('role-uuid');
 */
export const createSystemScopeAssignment = (
  role_id: string,
): AssignRoleRequest => ({
  role_id,
  scope_type: "SYSTEM",
});

/**
 * Create a SUPPORT scope role assignment request
 *
 * SUPPORT scope has cross-company read access for support staff.
 * Does NOT require company_id or store_id - access is across all companies.
 * SEC-010 AUTHZ: SUPPORT scope is different from SYSTEM scope -
 * SUPPORT cannot access system-level admin functions.
 *
 * @param role_id - The role ID to assign
 * @returns AssignRoleRequest for SUPPORT scope
 *
 * @example
 * const assignment = createSupportScopeAssignment('role-uuid');
 */
export const createSupportScopeAssignment = (
  role_id: string,
): AssignRoleRequest => ({
  role_id,
  scope_type: "SUPPORT",
});

/**
 * Create a COMPANY scope role assignment request
 *
 * @param role_id - The role ID to assign
 * @param company_id - The company ID for scope
 * @returns AssignRoleRequest for COMPANY scope
 *
 * @example
 * const assignment = createCompanyScopeAssignment('role-uuid', 'company-uuid');
 */
export const createCompanyScopeAssignment = (
  role_id: string,
  company_id: string,
): AssignRoleRequest => ({
  role_id,
  scope_type: "COMPANY",
  company_id,
});

/**
 * Create a STORE scope role assignment request
 *
 * @param role_id - The role ID to assign
 * @param company_id - The company ID for scope
 * @param store_id - The store ID for scope
 * @returns AssignRoleRequest for STORE scope
 *
 * @example
 * const assignment = createStoreScopeAssignment('role-uuid', 'company-uuid', 'store-uuid');
 */
export const createStoreScopeAssignment = (
  role_id: string,
  company_id: string,
  store_id: string,
): AssignRoleRequest => ({
  role_id,
  scope_type: "STORE",
  company_id,
  store_id,
});

/**
 * Create an invalid role assignment (missing required scope IDs)
 *
 * @param role_id - The role ID to assign
 * @param scope_type - The scope type that requires IDs
 * @returns AssignRoleRequest with missing required IDs
 *
 * @example
 * const invalidAssignment = createInvalidScopeAssignment('role-uuid', 'COMPANY');
 */
export const createInvalidScopeAssignment = (
  role_id: string,
  scope_type: ScopeType,
): AssignRoleRequest => ({
  role_id,
  scope_type,
  // Missing required company_id, store_id based on scope_type
});
