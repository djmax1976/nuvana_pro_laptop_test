/**
 * Admin Role Management API client functions
 * Provides functions for interacting with the role management API
 * All functions require ADMIN_SYSTEM_CONFIG permission (Super Admin only)
 *
 * Uses shared API client for consistent:
 * - 401/session expiration handling (automatic redirect to login)
 * - Error formatting with ApiError class
 * - Timeout configuration (30s default)
 * - Credential handling (httpOnly cookies)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "./client";

// ============ Types ============

/**
 * Permission with details
 */
export interface Permission {
  permission_id: string;
  code: string;
  description: string | null;
}

/**
 * Role with full details including permissions
 */
export interface RoleWithDetails {
  role_id: string;
  code: string;
  scope: "SYSTEM" | "COMPANY" | "STORE";
  description: string | null;
  is_system_role: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  deleted_by: string | null;
  permissions: Permission[];
  user_count: number;
  company_count: number;
}

/**
 * Role creation input
 */
export interface CreateRoleInput {
  code: string;
  scope: "SYSTEM" | "COMPANY" | "STORE";
  description?: string;
  permissions?: string[]; // Permission IDs
}

/**
 * Role update input
 */
export interface UpdateRoleInput {
  code?: string;
  description?: string;
}

/**
 * Role permissions update input
 */
export interface UpdateRolePermissionsInput {
  permissions: string[]; // Permission IDs
}

/**
 * Company with allowed roles
 */
export interface CompanyWithAllowedRoles {
  company_id: string;
  name: string;
  code: string;
  public_id: string;
  status: string;
  owner: {
    user_id: string;
    name: string;
    email: string;
  };
  allowed_roles: Array<{
    company_allowed_role_id: string;
    role_id: string;
    role_code: string;
    role_scope: string;
    role_description: string | null;
    assigned_at: string;
    assigned_by: {
      user_id: string;
      name: string;
      email: string;
    };
  }>;
}

/**
 * Role with company access info
 */
export interface RoleWithCompanyAccess {
  role_id: string;
  code: string;
  scope: string;
  description: string | null;
  is_system_role: boolean;
  companies: Array<{
    company_id: string;
    company_name: string;
    company_public_id: string;
    assigned_at: string;
  }>;
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

// ============ Role CRUD API Functions ============

/**
 * Get all roles with details
 * @param includeDeleted - Whether to include soft-deleted roles
 * @returns List of roles with permissions and usage counts
 */
export async function getRoles(
  includeDeleted = false,
): Promise<ApiResponse<RoleWithDetails[]>> {
  const response = await apiClient.get<ApiResponse<RoleWithDetails[]>>(
    "/api/admin/roles",
    { params: includeDeleted ? { include_deleted: true } : undefined },
  );
  return response.data;
}

/**
 * Get soft-deleted roles
 * @returns List of deleted roles
 */
export async function getDeletedRoles(): Promise<
  ApiResponse<RoleWithDetails[]>
> {
  const response = await apiClient.get<ApiResponse<RoleWithDetails[]>>(
    "/api/admin/roles/deleted",
  );
  return response.data;
}

/**
 * Get all permissions available in the system
 * @returns Array of all permissions
 */
export async function getAllPermissions(): Promise<ApiResponse<Permission[]>> {
  const response = await apiClient.get<ApiResponse<Permission[]>>(
    "/api/admin/roles/permissions",
  );
  return response.data;
}

/**
 * Get a single role by ID with full details
 * @param roleId - Role UUID
 * @returns Role with details
 */
export async function getRoleById(
  roleId: string,
): Promise<ApiResponse<RoleWithDetails>> {
  if (!roleId) {
    throw new Error("Role ID is required");
  }
  const response = await apiClient.get<ApiResponse<RoleWithDetails>>(
    `/api/admin/roles/${roleId}`,
  );
  return response.data;
}

/**
 * Create a new role
 * @param data - Role creation data
 * @returns Created role
 */
export async function createRole(
  data: CreateRoleInput,
): Promise<ApiResponse<RoleWithDetails>> {
  if (!data.code || data.code.trim().length === 0) {
    throw new Error("Role code is required");
  }
  if (!data.scope) {
    throw new Error("Role scope is required");
  }

  const response = await apiClient.post<ApiResponse<RoleWithDetails>>(
    "/api/admin/roles",
    data,
  );
  return response.data;
}

/**
 * Update a role's basic info
 * @param roleId - Role UUID
 * @param data - Update data
 * @returns Updated role
 */
export async function updateRole(
  roleId: string,
  data: UpdateRoleInput,
): Promise<ApiResponse<RoleWithDetails>> {
  if (!roleId) {
    throw new Error("Role ID is required");
  }

  const response = await apiClient.put<ApiResponse<RoleWithDetails>>(
    `/api/admin/roles/${roleId}`,
    data,
  );
  return response.data;
}

/**
 * Update a role's permissions
 * @param roleId - Role UUID
 * @param data - Permission update data
 * @returns Updated role
 */
export async function updateRolePermissions(
  roleId: string,
  data: UpdateRolePermissionsInput,
): Promise<ApiResponse<RoleWithDetails>> {
  if (!roleId) {
    throw new Error("Role ID is required");
  }

  const response = await apiClient.put<ApiResponse<RoleWithDetails>>(
    `/api/admin/roles/${roleId}/permissions`,
    data,
  );
  return response.data;
}

/**
 * Soft delete a role
 * @param roleId - Role UUID
 * @returns Success response
 */
export async function deleteRole(
  roleId: string,
): Promise<ApiResponse<{ message: string }>> {
  if (!roleId) {
    throw new Error("Role ID is required");
  }

  const response = await apiClient.delete<ApiResponse<{ message: string }>>(
    `/api/admin/roles/${roleId}`,
  );
  return response.data;
}

/**
 * Restore a soft-deleted role
 * @param roleId - Role UUID
 * @returns Restored role
 */
export async function restoreRole(
  roleId: string,
): Promise<ApiResponse<RoleWithDetails>> {
  if (!roleId) {
    throw new Error("Role ID is required");
  }

  const response = await apiClient.post<ApiResponse<RoleWithDetails>>(
    `/api/admin/roles/${roleId}/restore`,
  );
  return response.data;
}

/**
 * Permanently delete a soft-deleted role
 * @param roleId - Role UUID
 * @returns Success response
 */
export async function purgeRole(
  roleId: string,
): Promise<ApiResponse<{ message: string }>> {
  if (!roleId) {
    throw new Error("Role ID is required");
  }

  const response = await apiClient.delete<ApiResponse<{ message: string }>>(
    `/api/admin/roles/${roleId}/purge`,
  );
  return response.data;
}

// ============ Company Role Access API Functions ============

/**
 * Get all companies with their allowed roles
 * @returns List of companies with allowed roles
 */
export async function getCompaniesWithRoles(): Promise<
  ApiResponse<CompanyWithAllowedRoles[]>
> {
  const response = await apiClient.get<ApiResponse<CompanyWithAllowedRoles[]>>(
    "/api/admin/companies/roles",
  );
  return response.data;
}

/**
 * Get a company's allowed roles
 * @param companyId - Company UUID
 * @returns Company with allowed roles
 */
export async function getCompanyRoles(
  companyId: string,
): Promise<ApiResponse<CompanyWithAllowedRoles>> {
  if (!companyId) {
    throw new Error("Company ID is required");
  }

  const response = await apiClient.get<ApiResponse<CompanyWithAllowedRoles>>(
    `/api/admin/companies/${companyId}/roles`,
  );
  return response.data;
}

/**
 * Set all allowed roles for a company (replaces existing)
 * @param companyId - Company UUID
 * @param roleIds - Array of role IDs to allow
 * @returns Updated company with allowed roles
 */
export async function setCompanyRoles(
  companyId: string,
  roleIds: string[],
): Promise<ApiResponse<CompanyWithAllowedRoles>> {
  if (!companyId) {
    throw new Error("Company ID is required");
  }

  const response = await apiClient.put<ApiResponse<CompanyWithAllowedRoles>>(
    `/api/admin/companies/${companyId}/roles`,
    { role_ids: roleIds },
  );
  return response.data;
}

/**
 * Add a single role to a company
 * @param companyId - Company UUID
 * @param roleId - Role UUID
 * @returns Success response
 */
export async function addRoleToCompany(
  companyId: string,
  roleId: string,
): Promise<ApiResponse<{ message: string }>> {
  if (!companyId) {
    throw new Error("Company ID is required");
  }
  if (!roleId) {
    throw new Error("Role ID is required");
  }

  const response = await apiClient.post<ApiResponse<{ message: string }>>(
    `/api/admin/companies/${companyId}/roles`,
    { role_id: roleId },
  );
  return response.data;
}

/**
 * Remove a role from a company
 * @param companyId - Company UUID
 * @param roleId - Role UUID
 * @returns Success response
 */
export async function removeRoleFromCompany(
  companyId: string,
  roleId: string,
): Promise<ApiResponse<{ message: string }>> {
  if (!companyId) {
    throw new Error("Company ID is required");
  }
  if (!roleId) {
    throw new Error("Role ID is required");
  }

  const response = await apiClient.delete<ApiResponse<{ message: string }>>(
    `/api/admin/companies/${companyId}/roles/${roleId}`,
  );
  return response.data;
}

/**
 * Get all companies that have access to a specific role
 * @param roleId - Role UUID
 * @returns Role with company access info
 */
export async function getRoleCompanyAccess(
  roleId: string,
): Promise<ApiResponse<RoleWithCompanyAccess>> {
  if (!roleId) {
    throw new Error("Role ID is required");
  }

  const response = await apiClient.get<ApiResponse<RoleWithCompanyAccess>>(
    `/api/admin/roles/${roleId}/companies`,
  );
  return response.data;
}

// ============ TanStack Query Keys ============

/**
 * Query key factory for admin role queries
 */
export const adminRoleKeys = {
  all: ["admin-roles"] as const,
  lists: () => [...adminRoleKeys.all, "list"] as const,
  list: (includeDeleted?: boolean) =>
    [...adminRoleKeys.lists(), { includeDeleted }] as const,
  deleted: () => [...adminRoleKeys.all, "deleted"] as const,
  details: () => [...adminRoleKeys.all, "detail"] as const,
  detail: (id: string) => [...adminRoleKeys.details(), id] as const,
  permissions: () => [...adminRoleKeys.all, "permissions"] as const,
  companies: () => [...adminRoleKeys.all, "companies"] as const,
  companyRoles: (companyId: string) =>
    [...adminRoleKeys.companies(), companyId] as const,
  roleCompanies: (roleId: string) =>
    [...adminRoleKeys.all, "role-companies", roleId] as const,
};

// ============ TanStack Query Hooks - Roles ============

/**
 * Hook to fetch all roles
 * @param includeDeleted - Whether to include soft-deleted roles
 * @returns TanStack Query result with roles data
 */
export function useAdminRoles(includeDeleted = false) {
  return useQuery({
    queryKey: adminRoleKeys.list(includeDeleted),
    queryFn: () => getRoles(includeDeleted),
    select: (response) => response.data,
    staleTime: 30000,
  });
}

/**
 * Hook to fetch deleted roles
 * @returns TanStack Query result with deleted roles data
 */
export function useDeletedRoles() {
  return useQuery({
    queryKey: adminRoleKeys.deleted(),
    queryFn: getDeletedRoles,
    select: (response) => response.data,
    staleTime: 30000,
  });
}

/**
 * Hook to fetch all permissions
 * @returns TanStack Query result with permissions data
 */
export function useAllPermissions() {
  return useQuery({
    queryKey: adminRoleKeys.permissions(),
    queryFn: getAllPermissions,
    select: (response) => response.data,
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes as permissions rarely change
  });
}

/**
 * Hook to fetch a single role by ID
 * @param roleId - Role UUID
 * @param options - Query options
 * @returns TanStack Query result with role data
 */
export function useAdminRole(
  roleId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: adminRoleKeys.detail(roleId || ""),
    queryFn: () => getRoleById(roleId!),
    enabled: !!roleId && options?.enabled !== false,
    select: (response) => response.data,
    staleTime: 30000,
  });
}

/**
 * Hook to create a new role
 * @returns TanStack Query mutation for creating a role
 */
export function useCreateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.lists() });
    },
  });
}

/**
 * Hook to update a role
 * @returns TanStack Query mutation for updating a role
 */
export function useUpdateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ roleId, data }: { roleId: string; data: UpdateRoleInput }) =>
      updateRole(roleId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: adminRoleKeys.detail(variables.roleId),
      });
    },
  });
}

/**
 * Hook to update a role's permissions
 * @returns TanStack Query mutation for updating role permissions
 */
export function useUpdateRolePermissions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      roleId,
      data,
    }: {
      roleId: string;
      data: UpdateRolePermissionsInput;
    }) => updateRolePermissions(roleId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: adminRoleKeys.detail(variables.roleId),
      });
    },
  });
}

/**
 * Hook to delete a role
 * @returns TanStack Query mutation for deleting a role
 */
export function useDeleteRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.lists() });
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.deleted() });
    },
  });
}

/**
 * Hook to restore a role
 * @returns TanStack Query mutation for restoring a role
 */
export function useRestoreRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: restoreRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.lists() });
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.deleted() });
    },
  });
}

/**
 * Hook to purge a role
 * @returns TanStack Query mutation for purging a role
 */
export function usePurgeRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: purgeRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.deleted() });
    },
  });
}

// ============ TanStack Query Hooks - Company Role Access ============

/**
 * Hook to fetch all companies with their allowed roles
 * @returns TanStack Query result with companies data
 */
export function useCompaniesWithRoles() {
  return useQuery({
    queryKey: adminRoleKeys.companies(),
    queryFn: getCompaniesWithRoles,
    select: (response) => response.data,
    staleTime: 30000,
  });
}

/**
 * Hook to fetch a company's allowed roles
 * @param companyId - Company UUID
 * @param options - Query options
 * @returns TanStack Query result with company roles data
 */
export function useCompanyRoles(
  companyId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: adminRoleKeys.companyRoles(companyId || ""),
    queryFn: () => getCompanyRoles(companyId!),
    enabled: !!companyId && options?.enabled !== false,
    select: (response) => response.data,
    staleTime: 30000,
  });
}

/**
 * Hook to fetch companies that have access to a role
 * @param roleId - Role UUID
 * @param options - Query options
 * @returns TanStack Query result with role company access data
 */
export function useRoleCompanyAccess(
  roleId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: adminRoleKeys.roleCompanies(roleId || ""),
    queryFn: () => getRoleCompanyAccess(roleId!),
    enabled: !!roleId && options?.enabled !== false,
    select: (response) => response.data,
    staleTime: 30000,
  });
}

/**
 * Hook to fetch roles that can be assigned to companies
 * Returns COMPANY and STORE scope roles (excludes SYSTEM scope)
 * @returns TanStack Query result with assignable roles
 */
export function useAssignableRoles() {
  return useQuery({
    queryKey: [...adminRoleKeys.all, "assignable"] as const,
    queryFn: async () => {
      const response = await getRoles(false);
      // Filter to only COMPANY and STORE scope roles
      // Note: is_system_role indicates the role was created by the system (not deletable),
      // but these roles should still be assignable to companies
      return response.data.filter(
        (role) => role.scope === "COMPANY" || role.scope === "STORE",
      );
    },
    staleTime: 30000,
  });
}

/**
 * Hook to set company allowed roles
 * @returns TanStack Query mutation for setting company roles
 */
export function useSetCompanyRoles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      companyId,
      roleIds,
    }: {
      companyId: string;
      roleIds: string[];
    }) => setCompanyRoles(companyId, roleIds),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.companies() });
      queryClient.invalidateQueries({
        queryKey: adminRoleKeys.companyRoles(variables.companyId),
      });
    },
  });
}

/**
 * Hook to add a role to a company
 * @returns TanStack Query mutation for adding role to company
 */
export function useAddRoleToCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      companyId,
      roleId,
    }: {
      companyId: string;
      roleId: string;
    }) => addRoleToCompany(companyId, roleId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.companies() });
      queryClient.invalidateQueries({
        queryKey: adminRoleKeys.companyRoles(variables.companyId),
      });
      queryClient.invalidateQueries({
        queryKey: adminRoleKeys.roleCompanies(variables.roleId),
      });
    },
  });
}

/**
 * Hook to remove a role from a company
 * @returns TanStack Query mutation for removing role from company
 */
export function useRemoveRoleFromCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      companyId,
      roleId,
    }: {
      companyId: string;
      roleId: string;
    }) => removeRoleFromCompany(companyId, roleId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: adminRoleKeys.companies() });
      queryClient.invalidateQueries({
        queryKey: adminRoleKeys.companyRoles(variables.companyId),
      });
      queryClient.invalidateQueries({
        queryKey: adminRoleKeys.roleCompanies(variables.roleId),
      });
    },
  });
}

// ============ Helper Functions ============

/**
 * Get scope display name
 * @param scope - Role scope
 * @returns Display name for the scope
 */
export function getScopeDisplayName(scope: string): string {
  const scopeNames = new Map<string, string>([
    ["SYSTEM", "System"],
    ["COMPANY", "Company"],
    ["STORE", "Store"],
  ]);
  return scopeNames.get(scope) ?? scope;
}

/**
 * Get scope badge color
 * @param scope - Role scope
 * @returns CSS class for badge color
 */
export function getScopeBadgeColor(scope: string): string {
  const scopeColors = new Map<string, string>([
    ["SYSTEM", "bg-red-100 text-red-800"],
    ["COMPANY", "bg-blue-100 text-blue-800"],
    ["STORE", "bg-green-100 text-green-800"],
  ]);
  return scopeColors.get(scope) ?? "bg-gray-100 text-gray-800";
}

/**
 * Check if a role is deletable
 * @param role - Role with details
 * @returns Object with canDelete and reason
 */
export function canDeleteRole(role: RoleWithDetails): {
  canDelete: boolean;
  reason?: string;
} {
  if (role.is_system_role) {
    return { canDelete: false, reason: "System roles cannot be deleted" };
  }
  if (role.deleted_at) {
    return { canDelete: false, reason: "Role is already deleted" };
  }
  if (role.user_count > 0) {
    return {
      canDelete: false,
      reason: `${role.user_count} user(s) have this role assigned`,
    };
  }
  return { canDelete: true };
}
