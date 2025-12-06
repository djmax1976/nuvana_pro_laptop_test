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
  owner_user_id: string;
  owner_name?: string;
  owner_email?: string;
  name: string;
  address?: string | null;
  status: CompanyStatus;
  created_at: string;
  updated_at: string;
}

/**
 * Update company input
 * Note: Companies are now created through the User creation flow (CLIENT_OWNER role)
 * owner_user_id cannot be changed after creation
 */
export interface UpdateCompanyInput {
  name?: string;
  address?: string;
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
  ownerUserId?: string;
  search?: string;
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
  if (params?.ownerUserId) {
    queryParams.append("ownerUserId", params.ownerUserId);
  }
  if (params?.search) {
    queryParams.append("search", params.search);
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

// Note: createCompany has been removed - companies are now created
// through the User creation flow when assigning the CLIENT_OWNER role

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

  if (data.address !== undefined && data.address.length > 500) {
    throw new Error("Address must be 500 characters or less");
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
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with companies data
 */
export function useCompanies(
  params?: ListCompaniesParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: companyKeys.list(params),
    queryFn: () => getCompanies(params),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    enabled: options?.enabled !== false,
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

// Note: useCreateCompany has been removed - companies are now created
// through the User creation flow when assigning the CLIENT_OWNER role

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
    onSuccess: () => {
      // Invalidate all company queries to ensure lists and details refresh
      queryClient.invalidateQueries({
        queryKey: companyKeys.all,
        refetchType: "all",
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
      // Invalidate all company queries to ensure lists refresh
      queryClient.invalidateQueries({
        queryKey: companyKeys.all,
        refetchType: "all",
      });
    },
  });
}
