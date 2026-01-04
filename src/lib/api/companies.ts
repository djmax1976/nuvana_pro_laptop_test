/**
 * Company API client functions
 * Provides functions for interacting with the company management API
 * All functions require ADMIN_SYSTEM_CONFIG permission (System Admin only)
 *
 * Uses shared API client for consistent:
 * - 401/session expiration handling (automatic redirect to login)
 * - Error formatting with ApiError class
 * - Timeout configuration (30s default)
 * - Credential handling (httpOnly cookies)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "./client";

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
  /** @deprecated Use structured address fields instead */
  address?: string | null;
  // Structured address fields
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state_id?: string | null;
  county_id?: string | null;
  zip_code?: string | null;
  status: CompanyStatus;
  created_at: string;
  updated_at: string;
}

/**
 * Update company input
 * Note: Companies are now created through the User creation flow (CLIENT_OWNER role)
 * owner_user_id cannot be changed after creation
 *
 * @enterprise-standards
 * - API-001: VALIDATION - All inputs validated via Zod schemas
 * - SEC-014: INPUT_VALIDATION - Strict validation for address fields
 */
export interface UpdateCompanyInput {
  name?: string;
  /** @deprecated Use structured address fields instead */
  address?: string;
  status?: CompanyStatus;
  // === Structured Address Fields ===
  /** Street address line 1 (e.g., "123 Main Street") */
  address_line1?: string;
  /** Street address line 2 (e.g., "Suite 100") */
  address_line2?: string | null;
  /** City name (denormalized for display) */
  city?: string;
  /** FK to us_states - determines lottery game visibility */
  state_id?: string;
  /** FK to us_counties - for tax jurisdiction */
  county_id?: string;
  /** ZIP code (5-digit or ZIP+4 format) */
  zip_code?: string;
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
 * Get all companies with pagination (System Admin only)
 * @param params - Query parameters for pagination and filtering
 * @returns List of companies with pagination metadata
 */
export async function getCompanies(
  params?: ListCompaniesParams,
): Promise<ListCompaniesResponse> {
  const response = await apiClient.get<ListCompaniesResponse>(
    "/api/companies",
    {
      params,
    },
  );
  return response.data;
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

  const response = await apiClient.get<Company>(`/api/companies/${companyId}`);
  return response.data;
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

  const response = await apiClient.put<Company>(
    `/api/companies/${companyId}`,
    data,
  );
  return response.data;
}

/**
 * Delete company (soft delete) (System Admin only)
 * @param companyId - Company UUID
 */
export async function deleteCompany(companyId: string): Promise<void> {
  if (!companyId) {
    throw new Error("Company ID is required");
  }

  await apiClient.delete(`/api/companies/${companyId}`);
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
