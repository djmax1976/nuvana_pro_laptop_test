/**
 * Admin Users API client functions
 * Provides functions for interacting with the user management API
 * All functions require ADMIN_SYSTEM_CONFIG permission (System Admin only)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AdminUser,
  UserStatus,
  CreateUserInput,
  UpdateUserStatusInput,
  AssignRoleRequest,
  ListUsersParams,
  ListUsersResponse,
  UserResponse,
  UserRoleResponse,
  RolesResponse,
  UserRoleDetail,
} from "@/types/admin-user";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

/**
 * API error response
 */
export interface ApiError {
  success: false;
  error: string;
  message: string;
}

/**
 * Make authenticated API request
 * Uses credentials: "include" to send httpOnly cookies
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  // Only set Content-Type header if there's a body
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers,
  });

  const data = await response.json();

  if (!response.ok || data.success === false) {
    throw new Error(
      data.message ||
        data.error ||
        `HTTP ${response.status}: ${response.statusText}`,
    );
  }

  return data;
}

// ============ API Functions ============

/**
 * Get all users with pagination, search, and filtering (System Admin only)
 * @param params - Query parameters for pagination and filtering
 * @returns List of users with pagination metadata
 */
export async function getUsers(
  params?: ListUsersParams,
): Promise<ListUsersResponse> {
  const queryParams = new URLSearchParams();
  if (params?.page) {
    queryParams.append("page", params.page.toString());
  }
  if (params?.limit) {
    queryParams.append("limit", params.limit.toString());
  }
  if (params?.search) {
    queryParams.append("search", params.search);
  }
  if (params?.status) {
    queryParams.append("status", params.status);
  }

  const queryString = queryParams.toString();
  const endpoint = `/api/admin/users${queryString ? `?${queryString}` : ""}`;

  return apiRequest<ListUsersResponse>(endpoint, {
    method: "GET",
  });
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

  return apiRequest<UserResponse>(`/api/admin/users/${userId}`, {
    method: "GET",
  });
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

  return apiRequest<UserResponse>("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(data),
  });
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

  return apiRequest<UserResponse>(`/api/admin/users/${userId}/status`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
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

  return apiRequest<UserRoleResponse>(`/api/admin/users/${userId}/roles`, {
    method: "POST",
    body: JSON.stringify(roleAssignment),
  });
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

  return apiRequest<{ success: true; message: string }>(
    `/api/admin/users/${userId}/roles/${userRoleId}`,
    {
      method: "DELETE",
    },
  );
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

  return apiRequest<UserResponse>(`/api/admin/users/${userId}`, {
    method: "DELETE",
  });
}

/**
 * Get available roles for dropdown selection (System Admin only)
 * @returns List of roles with scope information
 */
export async function getRoles(): Promise<RolesResponse> {
  return apiRequest<RolesResponse>("/api/admin/roles", {
    method: "GET",
  });
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

// Re-export types for convenience
export type {
  AdminUser,
  UserStatus,
  CreateUserInput,
  UpdateUserStatusInput,
  AssignRoleRequest,
  ListUsersParams,
  UserRoleDetail,
};
