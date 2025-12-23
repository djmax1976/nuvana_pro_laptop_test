/**
 * Tax Rate API Client
 *
 * Frontend API functions for managing tax rates.
 * Phase 6.1: Shift & Day Summary Implementation Plan
 *
 * Enterprise coding standards applied:
 * - API-001: Schema validation using TypeScript types
 * - FE-001: HttpOnly cookies for auth tokens
 * - API-003: Error handling with typed responses
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

// ============ Types ============

/**
 * Tax rate type enum
 */
export type TaxRateType = "PERCENTAGE" | "FIXED";

/**
 * Tax jurisdiction level enum
 */
export type TaxJurisdictionLevel =
  | "FEDERAL"
  | "STATE"
  | "COUNTY"
  | "CITY"
  | "DISTRICT"
  | "COMBINED";

/**
 * Tax Rate response from the API
 */
export interface TaxRate {
  tax_rate_id: string;
  code: string;
  display_name: string;
  description: string | null;
  rate: number;
  rate_type: TaxRateType;
  jurisdiction_level: TaxJurisdictionLevel;
  jurisdiction_code: string | null;
  effective_from: string;
  effective_to: string | null;
  sort_order: number;
  is_compound: boolean;
  client_id: string | null;
  store_id: string | null;
  is_active: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
  store?: {
    store_id: string;
    name: string;
  } | null;
}

/**
 * Create tax rate input
 */
export interface CreateTaxRateInput {
  code: string;
  display_name: string;
  description?: string;
  rate: number;
  rate_type?: TaxRateType;
  jurisdiction_level?: TaxJurisdictionLevel;
  jurisdiction_code?: string;
  effective_from: string;
  effective_to?: string | null;
  sort_order?: number;
  is_compound?: boolean;
  store_id?: string;
}

/**
 * Update tax rate input
 */
export interface UpdateTaxRateInput {
  display_name?: string;
  description?: string | null;
  rate?: number;
  rate_type?: TaxRateType;
  jurisdiction_level?: TaxJurisdictionLevel;
  jurisdiction_code?: string | null;
  effective_from?: string;
  effective_to?: string | null;
  sort_order?: number;
  is_compound?: boolean;
  is_active?: boolean;
}

/**
 * Query parameters for listing tax rates
 */
export interface TaxRateQueryParams {
  include_inactive?: boolean;
  include_system?: boolean;
  client_id?: string;
  store_id?: string;
  jurisdiction_level?: TaxJurisdictionLevel;
  effective_date?: string;
  include_store?: boolean;
}

/**
 * API response wrapper
 */
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

/**
 * API error response
 */
interface ApiError {
  success: false;
  error: string | { code: string; message: string };
  message?: string;
}

// ============ API Request Helper ============

/**
 * Make authenticated API request
 * Uses credentials: "include" to send httpOnly cookies
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

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
      success: false,
      error: "Unknown error",
      message: `HTTP ${response.status}: ${response.statusText}`,
    }));

    let errorMessage: string;
    if (errorData.message) {
      errorMessage = errorData.message;
    } else if (typeof errorData.error === "string") {
      errorMessage = errorData.error;
    } else if (
      typeof errorData.error === "object" &&
      errorData.error?.message
    ) {
      errorMessage = errorData.error.message;
    } else {
      errorMessage = "API request failed";
    }

    throw new Error(errorMessage);
  }

  return response.json();
}

// ============ API Functions ============

/**
 * Get all tax rates
 */
export async function getTaxRates(
  params?: TaxRateQueryParams,
): Promise<ApiResponse<TaxRate[]>> {
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
  if (params?.store_id) {
    searchParams.append("store_id", params.store_id);
  }
  if (params?.jurisdiction_level) {
    searchParams.append("jurisdiction_level", params.jurisdiction_level);
  }
  if (params?.effective_date) {
    searchParams.append("effective_date", params.effective_date);
  }
  if (params?.include_store) {
    searchParams.append("include_store", "true");
  }

  const queryString = searchParams.toString();
  const endpoint = `/api/config/tax-rates${queryString ? `?${queryString}` : ""}`;

  return apiRequest<ApiResponse<TaxRate[]>>(endpoint, { method: "GET" });
}

/**
 * Get a single tax rate by ID
 */
export async function getTaxRateById(
  id: string,
): Promise<ApiResponse<TaxRate>> {
  return apiRequest<ApiResponse<TaxRate>>(`/api/config/tax-rates/${id}`, {
    method: "GET",
  });
}

/**
 * Create a new tax rate
 */
export async function createTaxRate(
  data: CreateTaxRateInput,
): Promise<ApiResponse<TaxRate>> {
  return apiRequest<ApiResponse<TaxRate>>("/api/config/tax-rates", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Update an existing tax rate
 */
export async function updateTaxRate(
  id: string,
  data: UpdateTaxRateInput,
): Promise<ApiResponse<TaxRate>> {
  return apiRequest<ApiResponse<TaxRate>>(`/api/config/tax-rates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/**
 * Deactivate (soft delete) a tax rate
 */
export async function deleteTaxRate(id: string): Promise<ApiResponse<TaxRate>> {
  return apiRequest<ApiResponse<TaxRate>>(`/api/config/tax-rates/${id}`, {
    method: "DELETE",
  });
}

// ============ TanStack Query Keys ============

export const taxRateKeys = {
  all: ["tax-rates"] as const,
  lists: () => [...taxRateKeys.all, "list"] as const,
  list: (params?: TaxRateQueryParams) =>
    [...taxRateKeys.lists(), params || {}] as const,
  details: () => [...taxRateKeys.all, "detail"] as const,
  detail: (id: string) => [...taxRateKeys.details(), id] as const,
};

// ============ TanStack Query Hooks ============

/**
 * Hook to fetch all tax rates
 */
export function useTaxRates(params?: TaxRateQueryParams) {
  return useQuery({
    queryKey: taxRateKeys.list(params),
    queryFn: () => getTaxRates(params),
    select: (response) => response.data,
    staleTime: 60000, // Consider data fresh for 1 minute
  });
}

/**
 * Hook to fetch a single tax rate by ID
 */
export function useTaxRate(id: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: taxRateKeys.detail(id || ""),
    queryFn: () => getTaxRateById(id!),
    enabled: options?.enabled !== false && id !== null,
    select: (response) => response.data,
  });
}

/**
 * Hook to create a new tax rate
 */
export function useCreateTaxRate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTaxRate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taxRateKeys.lists() });
    },
  });
}

/**
 * Hook to update a tax rate
 */
export function useUpdateTaxRate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTaxRateInput }) =>
      updateTaxRate(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: taxRateKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: taxRateKeys.detail(variables.id),
      });
    },
  });
}

/**
 * Hook to delete (deactivate) a tax rate
 */
export function useDeleteTaxRate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTaxRate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taxRateKeys.lists() });
    },
  });
}

// ============ Utility Functions ============

/**
 * Format tax rate for display
 */
export function formatTaxRate(rate: number, rateType: TaxRateType): string {
  if (rateType === "PERCENTAGE") {
    return `${(rate * 100).toFixed(2)}%`;
  }
  return `$${rate.toFixed(2)}`;
}

/**
 * Get jurisdiction level display name
 */
export function getJurisdictionLevelDisplay(
  level: TaxJurisdictionLevel,
): string {
  const displayNames: Record<TaxJurisdictionLevel, string> = {
    FEDERAL: "Federal",
    STATE: "State",
    COUNTY: "County",
    CITY: "City",
    DISTRICT: "District",
    COMBINED: "Combined",
  };
  return displayNames[level] || level;
}
