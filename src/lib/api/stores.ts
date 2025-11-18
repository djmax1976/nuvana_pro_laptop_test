/**
 * Store API client functions
 * Provides functions for interacting with the store management API
 * All functions require STORE_* permissions and enforce company isolation
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/**
 * Store status values
 */
export type StoreStatus = "ACTIVE" | "INACTIVE" | "CLOSED";

/**
 * GPS coordinates structure
 */
export interface GpsCoordinates {
  lat: number; // -90 to 90
  lng: number; // -180 to 180
}

/**
 * Location JSON structure
 */
export interface LocationJson {
  address?: string;
  gps?: GpsCoordinates;
}

/**
 * Store entity type
 */
export interface Store {
  store_id: string;
  company_id: string;
  name: string;
  location_json: LocationJson | null;
  timezone: string;
  status: StoreStatus;
  created_at: string;
  updated_at: string;
}

/**
 * Create store input
 */
export interface CreateStoreInput {
  name: string;
  location_json?: LocationJson;
  timezone?: string; // IANA timezone format
  status?: StoreStatus;
}

/**
 * Update store input
 */
export interface UpdateStoreInput {
  name?: string;
  location_json?: LocationJson;
  timezone?: string; // IANA timezone format
  status?: StoreStatus;
}

/**
 * List stores response
 */
export interface ListStoresResponse {
  data: Store[];
  meta: {
    total: number;
    limit: number;
    offset: number;
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
 * List stores query parameters
 */
export interface ListStoresParams {
  limit?: number;
  offset?: number;
}

/**
 * IANA timezone validation regex
 * Matches formats like: America/New_York, Europe/London, UTC, GMT+5, GMT-3
 */
const IANA_TIMEZONE_REGEX =
  /^[A-Z][a-z]+(\/[A-Z][a-z_]+)+$|^UTC$|^GMT(\+|-)\d+$/;

/**
 * Validate IANA timezone format
 */
function validateTimezone(timezone: string): boolean {
  return IANA_TIMEZONE_REGEX.test(timezone);
}

/**
 * Validate GPS coordinates
 */
function validateGpsCoordinates(gps: GpsCoordinates): void {
  if (gps.lat < -90 || gps.lat > 90) {
    throw new Error("GPS latitude must be between -90 and 90");
  }
  if (gps.lng < -180 || gps.lng > 180) {
    throw new Error("GPS longitude must be between -180 and 180");
  }
}

/**
 * Validate location JSON structure
 */
function validateLocationJson(location: LocationJson): void {
  if (location.gps) {
    validateGpsCoordinates(location.gps);
  }
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
 * Get stores by company ID (Corporate Admin, filtered by company_id)
 * @param companyId - Company UUID
 * @param params - Query parameters for pagination
 * @returns List of stores for the company
 */
export async function getStoresByCompany(
  companyId: string,
  params?: ListStoresParams,
): Promise<ListStoresResponse> {
  if (!companyId) {
    throw new Error("Company ID is required");
  }

  const queryParams = new URLSearchParams();
  if (params?.limit) {
    queryParams.append("limit", params.limit.toString());
  }
  if (params?.offset) {
    queryParams.append("offset", params.offset.toString());
  }

  const queryString = queryParams.toString();
  const endpoint = `/api/companies/${companyId}/stores${
    queryString ? `?${queryString}` : ""
  }`;

  return apiRequest<ListStoresResponse>(endpoint, {
    method: "GET",
  });
}

/**
 * Get store by ID
 * @param storeId - Store UUID
 * @returns Store details
 */
export async function getStoreById(storeId: string): Promise<Store> {
  if (!storeId) {
    throw new Error("Store ID is required");
  }

  return apiRequest<Store>(`/api/stores/${storeId}`, {
    method: "GET",
  });
}

/**
 * Create a new store
 * @param companyId - Company UUID
 * @param data - Store creation data
 * @returns Created store
 */
export async function createStore(
  companyId: string,
  data: CreateStoreInput,
): Promise<Store> {
  if (!companyId) {
    throw new Error("Company ID is required");
  }

  if (!data.name || data.name.trim().length === 0) {
    throw new Error("Store name is required");
  }

  if (data.name.length > 255) {
    throw new Error("Store name must be 255 characters or less");
  }

  if (data.timezone && !validateTimezone(data.timezone)) {
    throw new Error(
      "Timezone must be in IANA format (e.g., America/New_York, Europe/London)",
    );
  }

  if (data.location_json) {
    validateLocationJson(data.location_json);
  }

  return apiRequest<Store>(`/api/companies/${companyId}/stores`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Update store
 * @param storeId - Store UUID
 * @param data - Store update data
 * @returns Updated store
 */
export async function updateStore(
  storeId: string,
  data: UpdateStoreInput,
): Promise<Store> {
  if (!storeId) {
    throw new Error("Store ID is required");
  }

  if (data.name !== undefined && data.name.trim().length === 0) {
    throw new Error("Store name cannot be empty");
  }

  if (data.name !== undefined && data.name.length > 255) {
    throw new Error("Store name must be 255 characters or less");
  }

  if (data.timezone && !validateTimezone(data.timezone)) {
    throw new Error(
      "Timezone must be in IANA format (e.g., America/New_York, Europe/London)",
    );
  }

  if (data.location_json) {
    validateLocationJson(data.location_json);
  }

  return apiRequest<Store>(`/api/stores/${storeId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * Delete store (soft delete)
 * @param storeId - Store UUID
 */
export async function deleteStore(storeId: string): Promise<void> {
  if (!storeId) {
    throw new Error("Store ID is required");
  }

  await apiRequest<void>(`/api/stores/${storeId}`, {
    method: "DELETE",
  });
}

// ============ TanStack Query Hooks ============

/**
 * Query key factory for store queries
 */
export const storeKeys = {
  all: ["stores"] as const,
  lists: () => [...storeKeys.all, "list"] as const,
  list: (companyId: string, params?: ListStoresParams) =>
    [...storeKeys.lists(), companyId, params] as const,
  details: () => [...storeKeys.all, "detail"] as const,
  detail: (id: string) => [...storeKeys.details(), id] as const,
};

/**
 * Hook to fetch stores list for a company
 * @param companyId - Company UUID
 * @param params - Query parameters for pagination
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with stores data
 */
export function useStoresByCompany(
  companyId: string | undefined,
  params?: ListStoresParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: storeKeys.list(companyId || "", params),
    queryFn: () => getStoresByCompany(companyId!, params),
    enabled: options?.enabled !== false && !!companyId,
  });
}

/**
 * Hook to fetch a single store by ID
 * @param storeId - Store UUID
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with store data
 */
export function useStore(
  storeId: string | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: storeKeys.detail(storeId || ""),
    queryFn: () => getStoreById(storeId!),
    enabled: options?.enabled !== false && !!storeId,
  });
}

/**
 * Hook to create a new store
 * @returns TanStack Query mutation for creating a store
 */
export function useCreateStore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      companyId,
      data,
    }: {
      companyId: string;
      data: CreateStoreInput;
    }) => createStore(companyId, data),
    onSuccess: (data) => {
      // Invalidate stores list for the company
      queryClient.invalidateQueries({
        queryKey: storeKeys.list(data.company_id),
      });
    },
  });
}

/**
 * Hook to update a store
 * @returns TanStack Query mutation for updating a store
 */
export function useUpdateStore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      storeId,
      data,
    }: {
      storeId: string;
      data: UpdateStoreInput;
    }) => updateStore(storeId, data),
    onSuccess: (data) => {
      // Invalidate both list and detail queries
      queryClient.invalidateQueries({
        queryKey: storeKeys.list(data.company_id),
      });
      queryClient.invalidateQueries({
        queryKey: storeKeys.detail(data.store_id),
      });
    },
  });
}

/**
 * Hook to delete a store
 * @returns TanStack Query mutation for deleting a store
 */
export function useDeleteStore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      storeId,
      companyId,
    }: {
      storeId: string;
      companyId: string;
    }) => deleteStore(storeId),
    onSuccess: (_, variables) => {
      // Invalidate stores list for the company
      queryClient.invalidateQueries({
        queryKey: storeKeys.list(variables.companyId),
      });
    },
  });
}
