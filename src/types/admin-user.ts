/**
 * Admin User Types
 * TypeScript types for user management and role assignment
 */

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
 */
export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  roles: AssignRoleRequest[];
  companyName?: string;
  companyAddress?: string;
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
