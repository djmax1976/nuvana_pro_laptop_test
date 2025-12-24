/**
 * Department API Client
 *
 * Frontend API functions for managing departments (product categories).
 * Phase 6.2: Shift & Day Summary Implementation Plan
 *
 * Enterprise coding standards applied:
 * - API-001: Schema validation using TypeScript types
 * - FE-001: HttpOnly cookies for auth tokens
 * - API-003: Error handling with typed responses
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
 * Department response from the API
 */
export interface Department {
  department_id: string;
  code: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  is_lottery: boolean;
  is_system: boolean;
  is_active: boolean;
  display_order: number;
  client_id: string | null;
  created_at: string;
  updated_at: string;
  children?: Department[];
  parent?: Department;
}

/**
 * Department tree node
 */
export interface DepartmentTreeNode extends Department {
  children: DepartmentTreeNode[];
}

/**
 * Create department input
 */
export interface CreateDepartmentInput {
  code: string;
  name: string;
  description?: string;
  parent_id?: string;
  is_lottery?: boolean;
  display_order?: number;
}

/**
 * Update department input
 */
export interface UpdateDepartmentInput {
  name?: string;
  description?: string;
  parent_id?: string | null;
  is_lottery?: boolean;
  is_active?: boolean;
  display_order?: number;
}

/**
 * Query parameters for listing departments
 */
export interface DepartmentQueryParams {
  include_inactive?: boolean;
  include_system?: boolean;
  parent_id?: string;
  is_lottery?: boolean;
  include_children?: boolean;
  client_id?: string;
}

/**
 * API response wrapper
 */
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

// ============ API Functions ============

/**
 * Get all departments
 */
export async function getDepartments(
  params?: DepartmentQueryParams,
): Promise<ApiResponse<Department[]>> {
  const searchParams = new URLSearchParams();

  if (params?.include_inactive) {
    searchParams.append("include_inactive", "true");
  }
  if (params?.include_system !== undefined) {
    searchParams.append("include_system", String(params.include_system));
  }
  if (params?.parent_id) {
    searchParams.append("parent_id", params.parent_id);
  }
  if (params?.is_lottery !== undefined) {
    searchParams.append("is_lottery", String(params.is_lottery));
  }
  if (params?.include_children) {
    searchParams.append("include_children", "true");
  }
  if (params?.client_id) {
    searchParams.append("client_id", params.client_id);
  }

  const queryString = searchParams.toString();
  const endpoint = `/api/config/departments${queryString ? `?${queryString}` : ""}`;

  const response = await apiClient.get<ApiResponse<Department[]>>(endpoint);
  return response.data;
}

/**
 * Get department tree (hierarchical)
 */
export async function getDepartmentTree(): Promise<
  ApiResponse<DepartmentTreeNode[]>
> {
  const response = await apiClient.get<ApiResponse<DepartmentTreeNode[]>>(
    "/api/config/departments/tree",
  );
  return response.data;
}

/**
 * Get a single department by ID
 */
export async function getDepartmentById(
  id: string,
): Promise<ApiResponse<Department>> {
  const response = await apiClient.get<ApiResponse<Department>>(
    `/api/config/departments/${id}`,
  );
  return response.data;
}

/**
 * Create a new department
 */
export async function createDepartment(
  data: CreateDepartmentInput,
): Promise<ApiResponse<Department>> {
  const response = await apiClient.post<ApiResponse<Department>>(
    "/api/config/departments",
    data,
  );
  return response.data;
}

/**
 * Update an existing department
 */
export async function updateDepartment(
  id: string,
  data: UpdateDepartmentInput,
): Promise<ApiResponse<Department>> {
  const response = await apiClient.patch<ApiResponse<Department>>(
    `/api/config/departments/${id}`,
    data,
  );
  return response.data;
}

/**
 * Deactivate (soft delete) a department
 */
export async function deleteDepartment(
  id: string,
): Promise<ApiResponse<Department>> {
  const response = await apiClient.delete<ApiResponse<Department>>(
    `/api/config/departments/${id}`,
  );
  return response.data;
}

// ============ TanStack Query Keys ============

export const departmentKeys = {
  all: ["departments"] as const,
  lists: () => [...departmentKeys.all, "list"] as const,
  list: (params?: DepartmentQueryParams) =>
    [...departmentKeys.lists(), params || {}] as const,
  tree: () => [...departmentKeys.all, "tree"] as const,
  details: () => [...departmentKeys.all, "detail"] as const,
  detail: (id: string) => [...departmentKeys.details(), id] as const,
};

// ============ TanStack Query Hooks ============

/**
 * Hook to fetch all departments
 */
export function useDepartments(params?: DepartmentQueryParams) {
  return useQuery({
    queryKey: departmentKeys.list(params),
    queryFn: () => getDepartments(params),
    select: (response) => response.data,
    staleTime: 60000, // Consider data fresh for 1 minute
  });
}

/**
 * Hook to fetch department tree
 */
export function useDepartmentTree() {
  return useQuery({
    queryKey: departmentKeys.tree(),
    queryFn: getDepartmentTree,
    select: (response) => response.data,
    staleTime: 60000, // Consider data fresh for 1 minute
  });
}

/**
 * Hook to fetch a single department by ID
 */
export function useDepartment(
  id: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: departmentKeys.detail(id || ""),
    queryFn: () => getDepartmentById(id!),
    enabled: options?.enabled !== false && id !== null,
    select: (response) => response.data,
  });
}

/**
 * Hook to create a new department
 */
export function useCreateDepartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createDepartment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: departmentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: departmentKeys.tree() });
    },
  });
}

/**
 * Hook to update a department
 */
export function useUpdateDepartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateDepartmentInput }) =>
      updateDepartment(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: departmentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: departmentKeys.tree() });
      queryClient.invalidateQueries({
        queryKey: departmentKeys.detail(variables.id),
      });
    },
  });
}

/**
 * Hook to delete (deactivate) a department
 */
export function useDeleteDepartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteDepartment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: departmentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: departmentKeys.tree() });
    },
  });
}
