/**
 * Tender Type API Client
 *
 * Frontend API functions for managing tender types (payment methods).
 * Phase 6.1: Shift & Day Summary Implementation Plan
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
 * Tender type response from the API
 */
export interface TenderType {
  tender_type_id: string;
  code: string;
  display_name: string;
  description: string | null;
  is_cash_equivalent: boolean;
  requires_reference: boolean;
  is_electronic: boolean;
  affects_cash_drawer: boolean;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
  client_id: string | null;
  store_id: string | null;
  pos_code: string | null;
  pos_source: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Create tender type input
 */
export interface CreateTenderTypeInput {
  code: string;
  display_name: string;
  description?: string;
  is_cash_equivalent?: boolean;
  requires_reference?: boolean;
  sort_order?: number;
}

/**
 * Update tender type input
 */
export interface UpdateTenderTypeInput {
  display_name?: string;
  description?: string;
  is_cash_equivalent?: boolean;
  requires_reference?: boolean;
  is_active?: boolean;
  sort_order?: number;
}

/**
 * Query parameters for listing tender types
 */
export interface TenderTypeQueryParams {
  include_inactive?: boolean;
  include_system?: boolean;
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
 * Get all tender types
 */
export async function getTenderTypes(
  params?: TenderTypeQueryParams,
): Promise<ApiResponse<TenderType[]>> {
  const searchParams = new URLSearchParams();

  if (params?.include_inactive) {
    searchParams.append("include_inactive", "true");
  }
  if (params?.include_system !== undefined) {
    searchParams.append("include_system", String(params.include_system));
  }
  if (params?.client_id) {
    searchParams.append("client_id", params.client_id);
  }

  const queryString = searchParams.toString();
  const endpoint = `/api/config/tender-types${queryString ? `?${queryString}` : ""}`;

  const response = await apiClient.get<ApiResponse<TenderType[]>>(endpoint);
  return response.data;
}

/**
 * Get a single tender type by ID
 */
export async function getTenderTypeById(
  id: string,
): Promise<ApiResponse<TenderType>> {
  const response = await apiClient.get<ApiResponse<TenderType>>(
    `/api/config/tender-types/${id}`,
  );
  return response.data;
}

/**
 * Create a new tender type
 */
export async function createTenderType(
  data: CreateTenderTypeInput,
): Promise<ApiResponse<TenderType>> {
  const response = await apiClient.post<ApiResponse<TenderType>>(
    "/api/config/tender-types",
    data,
  );
  return response.data;
}

/**
 * Update an existing tender type
 */
export async function updateTenderType(
  id: string,
  data: UpdateTenderTypeInput,
): Promise<ApiResponse<TenderType>> {
  const response = await apiClient.patch<ApiResponse<TenderType>>(
    `/api/config/tender-types/${id}`,
    data,
  );
  return response.data;
}

/**
 * Deactivate (soft delete) a tender type
 */
export async function deleteTenderType(
  id: string,
): Promise<ApiResponse<TenderType>> {
  const response = await apiClient.delete<ApiResponse<TenderType>>(
    `/api/config/tender-types/${id}`,
  );
  return response.data;
}

// ============ TanStack Query Keys ============

export const tenderTypeKeys = {
  all: ["tender-types"] as const,
  lists: () => [...tenderTypeKeys.all, "list"] as const,
  list: (params?: TenderTypeQueryParams) =>
    [...tenderTypeKeys.lists(), params || {}] as const,
  details: () => [...tenderTypeKeys.all, "detail"] as const,
  detail: (id: string) => [...tenderTypeKeys.details(), id] as const,
};

// ============ TanStack Query Hooks ============

/**
 * Hook to fetch all tender types
 */
export function useTenderTypes(params?: TenderTypeQueryParams) {
  return useQuery({
    queryKey: tenderTypeKeys.list(params),
    queryFn: () => getTenderTypes(params),
    select: (response) => response.data,
    staleTime: 60000, // Consider data fresh for 1 minute
  });
}

/**
 * Hook to fetch a single tender type by ID
 */
export function useTenderType(
  id: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: tenderTypeKeys.detail(id || ""),
    queryFn: () => getTenderTypeById(id!),
    enabled: options?.enabled !== false && id !== null,
    select: (response) => response.data,
  });
}

/**
 * Hook to create a new tender type
 */
export function useCreateTenderType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTenderType,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenderTypeKeys.lists() });
    },
  });
}

/**
 * Hook to update a tender type
 */
export function useUpdateTenderType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTenderTypeInput }) =>
      updateTenderType(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: tenderTypeKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: tenderTypeKeys.detail(variables.id),
      });
    },
  });
}

/**
 * Hook to delete (deactivate) a tender type
 */
export function useDeleteTenderType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTenderType,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenderTypeKeys.lists() });
    },
  });
}
