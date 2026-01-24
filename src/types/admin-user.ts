/**
 * Admin User Types
 * TypeScript types for user management and role assignment
 *
 * @enterprise-standards
 * - FE-002: FORM_VALIDATION - Types mirror backend validation schemas
 * - SEC-014: INPUT_VALIDATION - Strict type definitions for all external input
 */

import type { AddressFieldsValue } from "@/components/address";

/**
 * User status enum
 */
export enum UserStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
}

/**
 * Scope type for role assignments
 */
export type ScopeType = "SYSTEM" | "COMPANY" | "STORE";

/**
 * Role detail in user response
 */
export interface UserRoleDetail {
  user_role_id: string;
  role: {
    role_id: string;
    code: string;
    description: string | null;
    scope: string;
  };
  company_id: string | null;
  company_name: string | null;
  store_id: string | null;
  store_name: string | null;
  assigned_at: string;
}

/**
 * Admin user with roles
 */
export interface AdminUser {
  user_id: string;
  email: string;
  name: string;
  status: UserStatus;
  created_at: string;
  updated_at: string;
  roles: UserRoleDetail[];
}

/**
 * Role assignment request
 */
export interface AssignRoleRequest {
  role_id: string;
  scope_type: ScopeType;
  company_id?: string;
  store_id?: string;
}

/**
 * Create user input
 * When roles include CLIENT_OWNER, companyName and companyAddress are required
 * When roles include CLIENT_USER, company_id and store_id are required in the role assignment
 *
 * Phase 2: Structured Address Implementation
 * - companyAddress now accepts AddressFieldsValue (structured object)
 * - Enables tax jurisdiction calculations, geographic filtering, and address validation
 * - Backend stores both structured fields and legacy address string for backward compatibility
 */
export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  roles: AssignRoleRequest[];
  companyName?: string;
  /** Structured company address for CLIENT_OWNER role */
  companyAddress?: AddressFieldsValue;
  company_id?: string;
  store_id?: string;
}

/**
 * Update user status input
 */
export interface UpdateUserStatusInput {
  status: UserStatus;
}

/**
 * Update user profile input (System Admin only)
 * Allows updating name, email, and/or password
 */
export interface UpdateUserProfileInput {
  name?: string;
  email?: string;
  password?: string;
}

/**
 * List users parameters
 */
export interface ListUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: UserStatus;
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * List users response
 */
export interface ListUsersResponse {
  success: true;
  data: AdminUser[];
  meta: PaginationMeta;
}

/**
 * Single user response
 */
export interface UserResponse {
  success: true;
  data: AdminUser;
}

/**
 * User role response
 */
export interface UserRoleResponse {
  success: true;
  data: UserRoleDetail;
}

/**
 * Role for dropdown
 */
export interface RoleOption {
  role_id: string;
  code: string;
  description: string | null;
  scope: string;
}

/**
 * Roles list response
 */
export interface RolesResponse {
  success: true;
  data: RoleOption[];
}

// ============================================================================
// Hierarchical User Types (for Super Admin Dashboard)
// ============================================================================

/**
 * Store group containing users
 */
export interface StoreGroup {
  store_id: string;
  store_name: string;
  users: AdminUser[];
}

/**
 * Company group containing stores
 */
export interface CompanyGroup {
  company_id: string;
  company_name: string;
  stores: StoreGroup[];
}

/**
 * Client owner group with their companies and store users
 */
export interface ClientOwnerGroup {
  client_owner: AdminUser;
  companies: CompanyGroup[];
}

/**
 * Hierarchical users data structure
 */
export interface HierarchicalUsersData {
  system_users: AdminUser[];
  client_owners: ClientOwnerGroup[];
  meta: {
    total_system_users: number;
    total_client_owners: number;
    total_companies: number;
    total_stores: number;
    total_store_users: number;
  };
}

/**
 * Hierarchical users API response
 */
export interface HierarchicalUsersResponse {
  success: true;
  data: HierarchicalUsersData;
}
