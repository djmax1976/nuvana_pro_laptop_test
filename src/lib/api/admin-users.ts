/**
 * Admin Users API client functions
 * Provides functions for interacting with the user management API
 * All functions require ADMIN_SYSTEM_CONFIG permission (System Admin only)
 *
 * Uses shared API client for consistent:
 * - 401/session expiration handling (automatic redirect to login)
 * - Error formatting with ApiError class
 * - Timeout configuration (30s default)
 * - Credential handling (httpOnly cookies)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AdminUser,
  UserStatus,
  CreateUserInput,
  UpdateUserStatusInput,
  UpdateUserProfileInput,
  AssignRoleRequest,
  ListUsersParams,
  ListUsersResponse,
  UserResponse,
  UserRoleResponse,
  RolesResponse,
  UserRoleDetail,
  HierarchicalUsersResponse,
  HierarchicalUsersData,
} from "@/types/admin-user";
import apiClient from "./client";

// ============ API Functions ============

/**
 * Get all users with pagination, search, and filtering (System Admin only)
 * @param params - Query parameters for pagination and filtering
 * @returns List of users with pagination metadata
 */
export async function getUsers(
  params?: ListUsersParams,
): Promise<ListUsersResponse> {
  const response = await apiClient.get<ListUsersResponse>("/api/admin/users", {
    params,
  });
  return response.data;
}

/**
 * Get all users organized hierarchically for Super Admin dashboard
 * Returns system users and client owners with their companies, stores, and staff
 *
 * Performance: Uses optimized single query with JOINs (no N+1)
 *
 * @returns Hierarchical user structure
 */
export async function getHierarchicalUsers(): Promise<HierarchicalUsersResponse> {
  const response = await apiClient.get<HierarchicalUsersResponse>(
    "/api/admin/users/hierarchical",
  );
  return response.data;
}

/**
 * Get user by ID with full role details (System Admin only)
 * @param userId - User UUID
 * @returns User details with roles
 */
export async function getUserById(userId: string): Promise<UserResponse> {
  if (!userId) {
    throw new Error("User ID is required");
  }

  const response = await apiClient.get<UserResponse>(
    `/api/admin/users/${userId}`,
  );
  return response.data;
}

/**
 * Create a new user with optional initial roles (System Admin only)
 * @param data - User creation data
 * @returns Created user with roles
 */
export async function createUser(data: CreateUserInput): Promise<UserResponse> {
  if (!data.email || data.email.trim().length === 0) {
    throw new Error("Email is required");
  }

  if (!data.name || data.name.trim().length === 0) {
    throw new Error("Name is required");
  }

  const response = await apiClient.post<UserResponse>("/api/admin/users", data);
  return response.data;
}

/**
 * Update user status (activate/deactivate) (System Admin only)
 * @param userId - User UUID
 * @param data - Status update data
 * @returns Updated user with roles
 */
export async function updateUserStatus(
  userId: string,
  data: UpdateUserStatusInput,
): Promise<UserResponse> {
  if (!userId) {
    throw new Error("User ID is required");
  }

  const response = await apiClient.patch<UserResponse>(
    `/api/admin/users/${userId}/status`,
    data,
  );
  return response.data;
}

/**
 * Update user profile (name, email, and/or password) (System Admin only)
 * @param userId - User UUID
 * @param data - Profile update data
 * @returns Updated user with roles
 */
export async function updateUserProfile(
  userId: string,
  data: UpdateUserProfileInput,
): Promise<UserResponse> {
  if (!userId) {
    throw new Error("User ID is required");
  }

  // Validate at least one field is provided
  if (!data.name && !data.email && !data.password) {
    throw new Error(
      "At least one field (name, email, or password) must be provided",
    );
  }

  const response = await apiClient.patch<UserResponse>(
    `/api/admin/users/${userId}`,
    data,
  );
  return response.data;
}

/**
 * Assign a role to a user (System Admin only)
 * @param userId - User UUID
 * @param roleAssignment - Role assignment details with scope
 * @returns Created user role
 */
export async function assignRole(
  userId: string,
  roleAssignment: AssignRoleRequest,
): Promise<UserRoleResponse> {
  if (!userId) {
    throw new Error("User ID is required");
  }

  if (!roleAssignment.role_id) {
    throw new Error("Role ID is required");
  }

  const response = await apiClient.post<UserRoleResponse>(
    `/api/admin/users/${userId}/roles`,
    roleAssignment,
  );
  return response.data;
}

/**
 * Revoke a role from a user (System Admin only)
 * @param userId - User UUID
 * @param userRoleId - User role UUID to revoke
 * @returns Success message
 */
export async function revokeRole(
  userId: string,
  userRoleId: string,
): Promise<{ success: true; message: string }> {
  if (!userId) {
    throw new Error("User ID is required");
  }

  if (!userRoleId) {
    throw new Error("User role ID is required");
  }

  const response = await apiClient.delete<{ success: true; message: string }>(
    `/api/admin/users/${userId}/roles/${userRoleId}`,
  );
  return response.data;
}

/**
 * Delete a user (System Admin only)
 * User must be INACTIVE before deletion (permanent deletion)
 * @param userId - User UUID
 * @returns Deleted user data (before deletion)
 */
export async function deleteUser(userId: string): Promise<UserResponse> {
  if (!userId) {
    throw new Error("User ID is required");
  }

  const response = await apiClient.delete<UserResponse>(
    `/api/admin/users/${userId}`,
  );
  return response.data;
}

/**
 * Get available roles for dropdown selection (System Admin only)
 * @returns List of roles with scope information
 */
export async function getRoles(): Promise<RolesResponse> {
  const response = await apiClient.get<RolesResponse>("/api/admin/roles");
  return response.data;
}

// ============ PIN Management API Functions ============

/**
 * PIN status response type
 */
export interface PINStatusResponse {
  success: boolean;
  data: {
    has_pin: boolean;
  };
}

/**
 * Set user PIN input
 */
export interface SetUserPINInput {
  pin: string;
  store_id: string;
}

/**
 * Get user PIN status (has PIN or not) (System Admin only)
 * @param userId - User UUID
 * @returns PIN status (has_pin: boolean)
 */
export async function getUserPINStatus(
  userId: string,
): Promise<PINStatusResponse> {
  if (!userId) {
    throw new Error("User ID is required");
  }

  const response = await apiClient.get<PINStatusResponse>(
    `/api/admin/users/${userId}/pin/status`,
  );
  return response.data;
}

/**
 * Set or update user PIN (System Admin only)
 * @param userId - User UUID
 * @param data - PIN data with store_id for uniqueness validation
 * @returns Success message
 */
export async function setUserPIN(
  userId: string,
  data: SetUserPINInput,
): Promise<{ success: boolean; message: string }> {
  if (!userId) {
    throw new Error("User ID is required");
  }

  if (!data.pin || !/^\d{4}$/.test(data.pin)) {
    throw new Error("PIN must be exactly 4 numeric digits");
  }

  if (!data.store_id) {
    throw new Error("Store ID is required for PIN uniqueness validation");
  }

  const response = await apiClient.put<{ success: boolean; message: string }>(
    `/api/admin/users/${userId}/pin`,
    data,
  );
  return response.data;
}

/**
 * Clear user PIN (System Admin only)
 * @param userId - User UUID
 * @returns Success message
 */
export async function clearUserPIN(
  userId: string,
): Promise<{ success: boolean; message: string }> {
  if (!userId) {
    throw new Error("User ID is required");
  }

  const response = await apiClient.delete<{ success: boolean; message: string }>(
    `/api/admin/users/${userId}/pin`,
  );
  return response.data;
}

// ============ TanStack Query Hooks ============

/**
 * Query key factory for admin user queries
 */
export const adminUserKeys = {
  all: ["admin-users"] as const,
  lists: () => [...adminUserKeys.all, "list"] as const,
  list: (params?: ListUsersParams) =>
    [...adminUserKeys.lists(), params] as const,
  hierarchical: () => [...adminUserKeys.all, "hierarchical"] as const,
  details: () => [...adminUserKeys.all, "detail"] as const,
  detail: (id: string) => [...adminUserKeys.details(), id] as const,
  roles: () => [...adminUserKeys.all, "roles"] as const,
};

/**
 * Hook to fetch users list with pagination, search, and filtering
 * @param params - Query parameters for pagination and filtering
 * @returns TanStack Query result with users data
 */
export function useAdminUsers(params?: ListUsersParams) {
  return useQuery({
    queryKey: adminUserKeys.list(params),
    queryFn: () => getUsers(params),
  });
}

/**
 * Hook to fetch users organized hierarchically
 * Returns system users and client owners with their companies, stores, and staff
 *
 * @returns TanStack Query result with hierarchical user data
 */
export function useHierarchicalUsers() {
  return useQuery({
    queryKey: adminUserKeys.hierarchical(),
    queryFn: async () => {
      const response = await getHierarchicalUsers();
      return response.data;
    },
  });
}

/**
 * Hook to fetch a single user by ID
 * @param userId - User UUID
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with user data
 */
export function useAdminUser(
  userId: string | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: adminUserKeys.detail(userId || ""),
    queryFn: () => getUserById(userId!),
    enabled: options?.enabled !== false && !!userId,
  });
}

/**
 * Hook to fetch available roles
 * @returns TanStack Query result with roles data
 */
export function useRoles() {
  return useQuery({
    queryKey: adminUserKeys.roles(),
    queryFn: () => getRoles(),
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes as roles rarely change
  });
}

/**
 * Hook to create a new user
 * @returns TanStack Query mutation for creating a user
 */
export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateUserInput) => createUser(data),
    onSuccess: () => {
      // Invalidate all user list queries (with any params) to refetch after creation
      queryClient.invalidateQueries({
        queryKey: adminUserKeys.all,
        refetchType: "all",
      });
    },
  });
}

/**
 * Hook to update user status
 * @returns TanStack Query mutation for updating user status
 */
export function useUpdateUserStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      data,
    }: {
      userId: string;
      data: UpdateUserStatusInput;
    }) => updateUserStatus(userId, data),
    onSuccess: (response) => {
      // Invalidate all user queries to ensure fresh data
      queryClient.invalidateQueries({
        queryKey: adminUserKeys.all,
        refetchType: "all",
      });
    },
  });
}

/**
 * Hook to update user profile (name, email, password)
 * @returns TanStack Query mutation for updating user profile
 */
export function useUpdateUserProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      data,
    }: {
      userId: string;
      data: UpdateUserProfileInput;
    }) => updateUserProfile(userId, data),
    onSuccess: () => {
      // Invalidate all user queries to ensure fresh data
      queryClient.invalidateQueries({
        queryKey: adminUserKeys.all,
        refetchType: "all",
      });
    },
  });
}

/**
 * Hook to assign a role to a user
 * @returns TanStack Query mutation for role assignment
 */
export function useAssignRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      roleAssignment,
    }: {
      userId: string;
      roleAssignment: AssignRoleRequest;
    }) => assignRole(userId, roleAssignment),
    onSuccess: () => {
      // Invalidate all user queries to ensure fresh data
      queryClient.invalidateQueries({
        queryKey: adminUserKeys.all,
        refetchType: "all",
      });
    },
  });
}

/**
 * Hook to revoke a role from a user
 * @returns TanStack Query mutation for role revocation
 */
export function useRevokeRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      userRoleId,
    }: {
      userId: string;
      userRoleId: string;
    }) => revokeRole(userId, userRoleId),
    onSuccess: () => {
      // Invalidate all user queries to ensure fresh data
      queryClient.invalidateQueries({
        queryKey: adminUserKeys.all,
        refetchType: "all",
      });
    },
  });
}

/**
 * Hook to delete a user
 * @returns TanStack Query mutation for user deletion
 */
export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => deleteUser(userId),
    onSuccess: () => {
      // Invalidate all user queries to ensure fresh data
      queryClient.invalidateQueries({
        queryKey: adminUserKeys.all,
        refetchType: "all",
      });
    },
  });
}

// ============ PIN Management Hooks ============

/**
 * Hook to get user PIN status
 * @param userId - User UUID
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with PIN status
 */
export function useGetUserPINStatus(
  userId: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: [...adminUserKeys.detail(userId), "pin-status"],
    queryFn: () => getUserPINStatus(userId),
    enabled: options?.enabled !== false && !!userId,
  });
}

/**
 * Hook to set or update user PIN
 * @returns TanStack Query mutation for setting user PIN
 */
export function useSetUserPIN() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      data,
    }: {
      userId: string;
      data: SetUserPINInput;
    }) => setUserPIN(userId, data),
    onSuccess: (_, variables) => {
      // Invalidate user detail and PIN status queries
      queryClient.invalidateQueries({
        queryKey: adminUserKeys.detail(variables.userId),
      });
    },
  });
}

/**
 * Hook to clear user PIN
 * @returns TanStack Query mutation for clearing user PIN
 */
export function useClearUserPIN() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => clearUserPIN(userId),
    onSuccess: (_, userId) => {
      // Invalidate user detail and PIN status queries
      queryClient.invalidateQueries({
        queryKey: adminUserKeys.detail(userId),
      });
    },
  });
}

// Re-export types for convenience
export type {
  AdminUser,
  UserStatus,
  CreateUserInput,
  UpdateUserStatusInput,
  UpdateUserProfileInput,
  AssignRoleRequest,
  ListUsersParams,
  UserRoleDetail,
  HierarchicalUsersData,
};
