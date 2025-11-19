/**
 * Company API client functions
 * Provides functions for interacting with the company management API
 * All functions require ADMIN_SYSTEM_CONFIG permission (System Admin only)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/**
 * Company status values
 */
export type CompanyStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING";

/**
 * Company entity type
 */
export interface Company {
  company_id: string;
  client_id: string | null;
  client_name?: string;
  name: string;
  status: CompanyStatus;
  created_at: string;
  updated_at: string;
}

/**
 * Create company input
 */
export interface CreateCompanyInput {
  client_id: string;
  name: string;
  status?: CompanyStatus;
}

/**
 * Update company input
 */
export interface UpdateCompanyInput {
  client_id?: string;
  name?: string;
  status?: CompanyStatus;
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total_items: number;
  total_pages: number;
  has_next_page: boolean;
  has_previous_page: boolean;
}

/**
 * List companies response
 */
export interface ListCompaniesResponse {
  data: Company[];
  meta: PaginationMeta;
  request_metadata?: {
    timestamp: string;
    request_id: string;
    response_time_ms?: number;
  };
}

/**
 * API error response
 */
export interface ApiError {
  error: string;
  message: string;
}

/**
 * List companies query parameters
 */
export interface ListCompaniesParams {
  page?: number;
  limit?: number;
  status?: CompanyStatus;
  clientId?: string;
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
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData: ApiError = await response.json().catch(() => ({
      error: "Unknown error",
      message: `HTTP ${response.status}: ${response.statusText}`,
    }));

    throw new Error(
      errorData.message || errorData.error || "API request failed",
    );
  }

  return response.json();
}

/**
 * Get all companies with pagination (System Admin only)
 * @param params - Query parameters for pagination and filtering
 * @returns List of companies with pagination metadata
 */
export async function getCompanies(
  params?: ListCompaniesParams,
): Promise<ListCompaniesResponse> {
  const queryParams = new URLSearchParams();
  if (params?.page) {
    queryParams.append("page", params.page.toString());
  }
  if (params?.limit) {
    queryParams.append("limit", params.limit.toString());
  }
  if (params?.status) {
    queryParams.append("status", params.status);
  }
  if (params?.clientId) {
    queryParams.append("clientId", params.clientId);
  }

  const queryString = queryParams.toString();
  const endpoint = `/api/companies${queryString ? `?${queryString}` : ""}`;

  return apiRequest<ListCompaniesResponse>(endpoint, {
    method: "GET",
  });
}

/**
 * Get company by ID (System Admin only)
 * @param companyId - Company UUID
 * @returns Company details
 */
export async function getCompanyById(companyId: string): Promise<Company> {
  if (!companyId) {
    throw new Error("Company ID is required");
  }

  return apiRequest<Company>(`/api/companies/${companyId}`, {
    method: "GET",
  });
}

/**
 * Create a new company (System Admin only)
 * @param data - Company creation data
 * @returns Created company
 */
export async function createCompany(
  data: CreateCompanyInput,
): Promise<Company> {
  if (!data.client_id) {
    throw new Error("Client is required");
  }

  if (!data.name || data.name.trim().length === 0) {
    throw new Error("Company name is required");
  }

  if (data.name.length > 255) {
    throw new Error("Company name must be 255 characters or less");
  }

  return apiRequest<Company>("/api/companies", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Update company (System Admin only)
 * @param companyId - Company UUID
 * @param data - Company update data
 * @returns Updated company
 */
export async function updateCompany(
  companyId: string,
  data: UpdateCompanyInput,
): Promise<Company> {
  if (!companyId) {
    throw new Error("Company ID is required");
  }

  if (data.name !== undefined && data.name.trim().length === 0) {
    throw new Error("Company name cannot be empty");
  }

  if (data.name !== undefined && data.name.length > 255) {
    throw new Error("Company name must be 255 characters or less");
  }

  return apiRequest<Company>(`/api/companies/${companyId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * Delete company (soft delete) (System Admin only)
 * @param companyId - Company UUID
 */
export async function deleteCompany(companyId: string): Promise<void> {
  if (!companyId) {
    throw new Error("Company ID is required");
  }

  await apiRequest<void>(`/api/companies/${companyId}`, {
    method: "DELETE",
  });
}

// ============ TanStack Query Hooks ============

/**
 * Query key factory for company queries
 */
export const companyKeys = {
  all: ["companies"] as const,
  lists: () => [...companyKeys.all, "list"] as const,
  list: (params?: ListCompaniesParams) =>
    [...companyKeys.lists(), params] as const,
  details: () => [...companyKeys.all, "detail"] as const,
  detail: (id: string) => [...companyKeys.details(), id] as const,
};

/**
 * Hook to fetch companies list with pagination
 * @param params - Query parameters for pagination and filtering
 * @returns TanStack Query result with companies data
 */
export function useCompanies(params?: ListCompaniesParams) {
  return useQuery({
    queryKey: companyKeys.list(params),
    queryFn: () => getCompanies(params),
  });
}

/**
 * Hook to fetch a single company by ID
 * @param companyId - Company UUID
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with company data
 */
export function useCompany(
  companyId: string | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: companyKeys.detail(companyId || ""),
    queryFn: () => getCompanyById(companyId!),
    enabled: options?.enabled !== false && !!companyId,
  });
}

/**
 * Hook to create a new company
 * @returns TanStack Query mutation for creating a company
 */
export function useCreateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCompanyInput) => createCompany(data),
    onSuccess: () => {
      // Invalidate companies list to refetch after creation
      queryClient.invalidateQueries({ queryKey: companyKeys.lists() });
    },
  });
}

/**
 * Hook to update a company
 * @returns TanStack Query mutation for updating a company
 */
export function useUpdateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      companyId,
      data,
    }: {
      companyId: string;
      data: UpdateCompanyInput;
    }) => updateCompany(companyId, data),
    onSuccess: (data) => {
      // Invalidate both list and detail queries
      queryClient.invalidateQueries({ queryKey: companyKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: companyKeys.detail(data.company_id),
      });
    },
  });
}

/**
 * Hook to delete a company
 * @returns TanStack Query mutation for deleting a company
 */
export function useDeleteCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (companyId: string) => deleteCompany(companyId),
    onSuccess: () => {
      // Invalidate companies list to refetch after deletion
      queryClient.invalidateQueries({ queryKey: companyKeys.lists() });
    },
  });
}
