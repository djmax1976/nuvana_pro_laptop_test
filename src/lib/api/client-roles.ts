/**
 * Client Role Permission Management API client functions
 * Provides functions for interacting with the client role permission management API
 * All functions require CLIENT_ROLE_MANAGE permission (Client Owners only)
 *
 * Story: 2.92 - Client Role Permission Management
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
 * Permission with category and state information
 */
export interface PermissionWithState {
  permission_id: string;
  code: string;
  description: string;
  category: string;
  category_name: string;
  is_enabled: boolean;
  is_system_default: boolean;
  is_client_override: boolean;
}

/**
 * Role with permissions and badges
 */
export interface RoleWithPermissions {
  role_id: string;
  code: string;
  description: string | null;
  scope: string;
  permissions: PermissionWithState[];
  permission_badges: string[];
}

/**
 * Permission update input
 */
export interface PermissionUpdate {
  permission_id: string;
  is_enabled: boolean;
}

/**
 * Update permissions request body
 */
export interface UpdatePermissionsInput {
  permissions: PermissionUpdate[];
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

// ============ API Functions ============

/**
 * Get all STORE scope roles with their permission configuration
 * @returns List of roles with permission badges
 */
export async function getClientRoles(): Promise<
  ApiResponse<RoleWithPermissions[]>
> {
  const response =
    await apiClient.get<ApiResponse<RoleWithPermissions[]>>(
      "/api/client/roles",
    );
  return response.data;
}

/**
 * Get permission configuration for a specific role
 * @param roleId - Role UUID
 * @returns Role with permissions grouped by category
 */
export async function getRolePermissions(
  roleId: string,
): Promise<ApiResponse<RoleWithPermissions>> {
  if (!roleId) {
    throw new Error("Role ID is required");
  }

  const response = await apiClient.get<ApiResponse<RoleWithPermissions>>(
    `/api/client/roles/${roleId}/permissions`,
  );
  return response.data;
}

/**
 * Update permission configuration for a role
 * @param roleId - Role UUID
 * @param permissions - Array of permission updates
 * @returns Updated role with permissions
 */
export async function updateRolePermissions(
  roleId: string,
  permissions: PermissionUpdate[],
): Promise<ApiResponse<RoleWithPermissions>> {
  if (!roleId) {
    throw new Error("Role ID is required");
  }

  if (!permissions || permissions.length === 0) {
    throw new Error("At least one permission update is required");
  }

  const response = await apiClient.put<ApiResponse<RoleWithPermissions>>(
    `/api/client/roles/${roleId}/permissions`,
    { permissions },
  );
  return response.data;
}

/**
 * Reset role to system default permissions
 * Removes all client overrides for the role
 * @param roleId - Role UUID
 * @returns Role with default permissions
 */
export async function resetRoleDefaults(
  roleId: string,
): Promise<ApiResponse<RoleWithPermissions>> {
  if (!roleId) {
    throw new Error("Role ID is required");
  }

  const response = await apiClient.post<ApiResponse<RoleWithPermissions>>(
    `/api/client/roles/${roleId}/reset`,
  );
  return response.data;
}

// ============ TanStack Query Keys ============

/**
 * Query key factory for client role queries
 */
export const clientRoleKeys = {
  all: ["client-roles"] as const,
  lists: () => [...clientRoleKeys.all, "list"] as const,
  list: () => [...clientRoleKeys.lists()] as const,
  details: () => [...clientRoleKeys.all, "detail"] as const,
  detail: (roleId: string) => [...clientRoleKeys.details(), roleId] as const,
  permissions: (roleId: string) =>
    [...clientRoleKeys.all, "permissions", roleId] as const,
};

// ============ TanStack Query Hooks ============

/**
 * Hook to fetch all STORE scope roles with their permission configuration
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with roles data
 */
export function useClientRoles(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: clientRoleKeys.list(),
    queryFn: getClientRoles,
    enabled: options?.enabled !== false,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 30000, // Consider data fresh for 30 seconds
    select: (response) => response.data,
  });
}

/**
 * Hook to fetch permission configuration for a specific role
 * @param roleId - Role UUID
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with role permissions data
 */
export function useRolePermissions(
  roleId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: clientRoleKeys.permissions(roleId || ""),
    queryFn: () => getRolePermissions(roleId!),
    enabled: !!roleId && options?.enabled !== false,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 30000,
    select: (response) => response.data,
  });
}

/**
 * Hook to update role permissions
 * Invalidates role list and specific role permissions on success
 * @returns TanStack Mutation for updating permissions
 */
export function useUpdateRolePermissions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      roleId,
      permissions,
    }: {
      roleId: string;
      permissions: PermissionUpdate[];
    }) => updateRolePermissions(roleId, permissions),
    onSuccess: (_, variables) => {
      // Invalidate the role list to update permission badges
      queryClient.invalidateQueries({ queryKey: clientRoleKeys.lists() });
      // Invalidate the specific role's permissions
      queryClient.invalidateQueries({
        queryKey: clientRoleKeys.permissions(variables.roleId),
      });
    },
  });
}

/**
 * Hook to reset role to default permissions
 * Invalidates role list and specific role permissions on success
 * @returns TanStack Mutation for resetting permissions
 */
export function useResetRoleDefaults() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (roleId: string) => resetRoleDefaults(roleId),
    onSuccess: (_, roleId) => {
      // Invalidate the role list to update permission badges
      queryClient.invalidateQueries({ queryKey: clientRoleKeys.lists() });
      // Invalidate the specific role's permissions
      queryClient.invalidateQueries({
        queryKey: clientRoleKeys.permissions(roleId),
      });
    },
  });
}

/**
 * Hook to invalidate client role queries
 * Useful after mutations that affect role data
 */
export function useInvalidateClientRoles() {
  const queryClient = useQueryClient();

  return {
    invalidateList: () =>
      queryClient.invalidateQueries({ queryKey: clientRoleKeys.lists() }),
    invalidateRole: (roleId: string) =>
      queryClient.invalidateQueries({
        queryKey: clientRoleKeys.permissions(roleId),
      }),
    invalidateAll: () =>
      queryClient.invalidateQueries({ queryKey: clientRoleKeys.all }),
  };
}

// ============ Permission Category Helpers ============

/**
 * Group permissions by category for UI display using Map for safe dynamic access
 * @param permissions - Array of permissions
 * @returns Map of permissions grouped by category
 */
export function groupPermissionsByCategory(
  permissions: PermissionWithState[],
): Map<string, PermissionWithState[]> {
  return permissions.reduce((groups, permission) => {
    const category = permission.category;
    const existing = groups.get(category);
    if (existing) {
      existing.push(permission);
    } else {
      groups.set(category, [permission]);
    }
    return groups;
  }, new Map<string, PermissionWithState[]>());
}

/**
 * Check if a role has any client overrides
 * @param permissions - Array of permissions
 * @returns true if any permission has a client override
 */
export function hasClientOverrides(
  permissions: PermissionWithState[],
): boolean {
  return permissions.some((p) => p.is_client_override);
}

// Safe lookup map for category display names
const CATEGORY_DISPLAY_NAMES = new Map<string, string>([
  ["SHIFTS", "Shift Operations"],
  ["TRANSACTIONS", "Transactions"],
  ["INVENTORY", "Inventory"],
  ["LOTTERY", "Lottery"],
  ["REPORTS", "Reports"],
  ["EMPLOYEES", "Employee Management"],
  ["STORE", "Store"],
  ["OTHER", "Other"],
]);

/**
 * Get the display name for a permission category
 * @param categoryKey - Category key (e.g., "SHIFTS", "TRANSACTIONS")
 * @returns Display name for the category
 */
export function getCategoryDisplayName(categoryKey: string): string {
  return CATEGORY_DISPLAY_NAMES.get(categoryKey) ?? categoryKey;
}
