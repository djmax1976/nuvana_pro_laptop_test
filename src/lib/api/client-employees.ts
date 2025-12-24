/**
 * Client Employee Management API client functions
 * Provides functions for interacting with the client employee management API
 * All functions require CLIENT_EMPLOYEE permissions (Client Users only)
 *
 * Story: 2.91 - Client Employee Management
 *
 * Uses shared API client for consistent:
 * - 401/session expiration handling (automatic redirect to login)
 * - Error formatting with ApiError class
 * - Timeout configuration (30s default)
 * - Credential handling (httpOnly cookies)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clientDashboardKeys } from "./client-dashboard";
import apiClient from "./client";

// ============ Types ============

/**
 * Employee role information
 */
export interface EmployeeRole {
  user_role_id: string;
  role_code: string;
  role_description: string | null;
}

/**
 * Employee data returned from API
 */
export interface Employee {
  user_id: string;
  email: string;
  name: string;
  status: string;
  created_at: string;
  store_id: string | null;
  store_name: string | null;
  company_id: string | null;
  company_name: string | null;
  roles: EmployeeRole[];
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
 * List employees response
 */
export interface ListEmployeesResponse {
  success: boolean;
  data: Employee[];
  meta: PaginationMeta;
}

/**
 * Single employee response
 */
export interface EmployeeResponse {
  success: boolean;
  data: Employee;
}

/**
 * Delete employee response
 */
export interface DeleteEmployeeResponse {
  success: boolean;
  message: string;
}

/**
 * List employees parameters
 */
export interface ListEmployeesParams {
  page?: number;
  limit?: number;
  search?: string;
  store_id?: string;
}

/**
 * Create employee input
 */
export interface CreateEmployeeInput {
  email: string;
  name: string;
  store_id: string;
  role_id: string;
  password?: string;
}

/**
 * Store role for dropdown
 */
export interface StoreRole {
  role_id: string;
  code: string;
  description: string | null;
}

/**
 * Roles response
 */
export interface RolesResponse {
  success: boolean;
  data: StoreRole[];
}

// ============ API Functions ============

/**
 * Get employees for the current client's stores
 * @param params - List parameters (page, limit, search, store_id filter)
 * @returns Paginated list of employees
 */
export async function getEmployees(
  params?: ListEmployeesParams,
): Promise<ListEmployeesResponse> {
  const response = await apiClient.get<ListEmployeesResponse>(
    "/api/client/employees",
    { params },
  );
  return response.data;
}

/**
 * Create a new employee
 * @param data - Employee creation data
 * @returns Created employee
 */
export async function createEmployee(
  data: CreateEmployeeInput,
): Promise<EmployeeResponse> {
  // Client-side validation
  if (!data.email?.trim()) {
    throw new Error("Email is required");
  }
  if (!data.name?.trim()) {
    throw new Error("Name is required");
  }
  if (!data.store_id) {
    throw new Error("Store is required");
  }
  if (!data.role_id) {
    throw new Error("Role is required");
  }

  const response = await apiClient.post<EmployeeResponse>(
    "/api/client/employees",
    data,
  );
  return response.data;
}

/**
 * Delete an employee
 * @param userId - Employee user ID to delete
 * @returns Success message
 */
export async function deleteEmployee(
  userId: string,
): Promise<DeleteEmployeeResponse> {
  if (!userId) {
    throw new Error("User ID is required");
  }

  const response = await apiClient.delete<DeleteEmployeeResponse>(
    `/api/client/employees/${userId}`,
  );
  return response.data;
}

/**
 * Get available STORE scope roles for employee assignment
 * @returns List of STORE scope roles
 */
export async function getStoreRoles(): Promise<RolesResponse> {
  const response = await apiClient.get<RolesResponse>(
    "/api/client/employees/roles",
  );
  return response.data;
}

/**
 * Update employee email address
 * @param userId - Employee user ID
 * @param email - New email address
 * @returns Updated user data
 */
export async function updateEmployeeEmail(
  userId: string,
  email: string,
): Promise<EmployeeResponse> {
  if (!userId) {
    throw new Error("User ID is required");
  }
  if (!email?.trim()) {
    throw new Error("Email is required");
  }

  const response = await apiClient.put<EmployeeResponse>(
    `/api/client/employees/${userId}/email`,
    { email },
  );
  return response.data;
}

/**
 * Reset employee password
 * @param userId - Employee user ID
 * @param password - New password (plaintext, will be hashed server-side)
 * @returns Success response
 */
export async function resetEmployeePassword(
  userId: string,
  password: string,
): Promise<{ success: boolean }> {
  if (!userId) {
    throw new Error("User ID is required");
  }
  if (!password) {
    throw new Error("Password is required");
  }

  const response = await apiClient.put<{ success: boolean }>(
    `/api/client/employees/${userId}/password`,
    { password },
  );
  return response.data;
}

// ============ TanStack Query Keys ============

/**
 * Query key factory for client employee queries
 */
export const clientEmployeeKeys = {
  all: ["client-employees"] as const,
  lists: () => [...clientEmployeeKeys.all, "list"] as const,
  list: (params?: ListEmployeesParams) =>
    [...clientEmployeeKeys.lists(), params] as const,
  details: () => [...clientEmployeeKeys.all, "detail"] as const,
  detail: (id: string) => [...clientEmployeeKeys.details(), id] as const,
  roles: () => [...clientEmployeeKeys.all, "roles"] as const,
};

// ============ TanStack Query Hooks ============

/**
 * Hook to fetch employees for the current client's stores
 * @param params - List parameters (page, limit, search, store_id)
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with employees data
 */
export function useClientEmployees(
  params?: ListEmployeesParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: clientEmployeeKeys.list(params),
    queryFn: () => getEmployees(params),
    enabled: options?.enabled !== false,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 30000, // Consider data fresh for 30 seconds
  });
}

/**
 * Hook to fetch available STORE scope roles
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with roles data
 */
export function useStoreRoles(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: clientEmployeeKeys.roles(),
    queryFn: getStoreRoles,
    enabled: options?.enabled !== false,
    staleTime: 10 * 60 * 1000, // Roles rarely change, cache for 10 minutes
  });
}

/**
 * Hook to create an employee
 * Invalidates employee list and dashboard queries on success
 * @returns TanStack Mutation for creating employees
 */
export function useCreateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateEmployeeInput) => createEmployee(data),
    onSuccess: () => {
      // Invalidate employee list
      queryClient.invalidateQueries({ queryKey: clientEmployeeKeys.lists() });
      // Invalidate dashboard to update employee count
      queryClient.invalidateQueries({
        queryKey: clientDashboardKeys.dashboard(),
      });
    },
  });
}

/**
 * Hook to delete an employee
 * Invalidates employee list and dashboard queries on success
 * @returns TanStack Mutation for deleting employees
 */
export function useDeleteEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => deleteEmployee(userId),
    onSuccess: () => {
      // Invalidate employee list
      queryClient.invalidateQueries({ queryKey: clientEmployeeKeys.lists() });
      // Invalidate dashboard to update employee count
      queryClient.invalidateQueries({
        queryKey: clientDashboardKeys.dashboard(),
      });
    },
  });
}

/**
 * Hook to update employee email
 * Invalidates employee list and detail queries on success
 * @returns TanStack Mutation for updating employee email
 */
export function useUpdateEmployeeEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, email }: { userId: string; email: string }) =>
      updateEmployeeEmail(userId, email),
    onSuccess: (_, variables) => {
      // Invalidate employee list
      queryClient.invalidateQueries({ queryKey: clientEmployeeKeys.lists() });
      // Invalidate specific employee detail
      queryClient.invalidateQueries({
        queryKey: clientEmployeeKeys.detail(variables.userId),
      });
    },
  });
}

/**
 * Hook to reset employee password
 * Invalidates employee list and detail queries on success
 * @returns TanStack Mutation for resetting employee password
 */
export function useResetEmployeePassword() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) =>
      resetEmployeePassword(userId, password),
    onSuccess: (_, variables) => {
      // Invalidate employee list
      queryClient.invalidateQueries({ queryKey: clientEmployeeKeys.lists() });
      // Invalidate specific employee detail
      queryClient.invalidateQueries({
        queryKey: clientEmployeeKeys.detail(variables.userId),
      });
    },
  });
}

/**
 * Hook to invalidate client employee queries
 * Useful after mutations that affect employee data
 */
export function useInvalidateClientEmployees() {
  const queryClient = useQueryClient();

  return {
    invalidateList: () =>
      queryClient.invalidateQueries({ queryKey: clientEmployeeKeys.lists() }),
    invalidateRoles: () =>
      queryClient.invalidateQueries({ queryKey: clientEmployeeKeys.roles() }),
    invalidateAll: () =>
      queryClient.invalidateQueries({ queryKey: clientEmployeeKeys.all }),
  };
}
