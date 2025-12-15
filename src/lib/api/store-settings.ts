/**
 * Store Settings API client functions
 * Provides functions for interacting with the client store settings API
 * All functions require STORE_READ/STORE_UPDATE permissions (Client Users only)
 *
 * Story: 6.14 - Store Settings Page with Employee/Cashier Management
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

// ============ Types ============

/**
 * Store settings data returned from API
 */
export interface StoreSettings {
  name: string;
  address: string | null;
  timezone: string;
  contact_email: string | null;
  operating_hours: OperatingHours | null;
}

/**
 * Operating hours structure
 */
export interface OperatingHours {
  monday?: { open: string; close: string; closed?: boolean };
  tuesday?: { open: string; close: string; closed?: boolean };
  wednesday?: { open: string; close: string; closed?: boolean };
  thursday?: { open: string; close: string; closed?: boolean };
  friday?: { open: string; close: string; closed?: boolean };
  saturday?: { open: string; close: string; closed?: boolean };
  sunday?: { open: string; close: string; closed?: boolean };
}

/**
 * Update store settings input
 */
export interface UpdateStoreSettingsInput {
  address?: string;
  timezone?: string;
  contact_email?: string | null;
  operating_hours?: OperatingHours;
}

/**
 * Store settings response
 */
export interface StoreSettingsResponse {
  success: boolean;
  data: StoreSettings;
}

/**
 * Update store settings response
 */
export interface UpdateStoreSettingsResponse {
  success: boolean;
  data: {
    store_id: string;
    name: string;
    configuration: any;
  };
}

/**
 * API error response
 */
export interface ApiError {
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

    const errorMessage =
      typeof errorData.error === "object"
        ? errorData.error.message
        : errorData.message || errorData.error || "API request failed";

    throw new Error(errorMessage);
  }

  return response.json();
}

// ============ API Functions ============

/**
 * Get store settings for a specific store
 * @param storeId - Store UUID
 * @returns Store settings data
 */
export async function getStoreSettings(
  storeId: string,
): Promise<StoreSettingsResponse> {
  if (!storeId) {
    throw new Error("Store ID is required");
  }

  return apiRequest<StoreSettingsResponse>(
    `/api/client/stores/${storeId}/settings`,
    { method: "GET" },
  );
}

/**
 * Update store settings for a specific store
 * @param storeId - Store UUID
 * @param config - Store settings update data
 * @returns Updated store data
 */
export async function updateStoreSettings(
  storeId: string,
  config: UpdateStoreSettingsInput,
): Promise<UpdateStoreSettingsResponse> {
  if (!storeId) {
    throw new Error("Store ID is required");
  }

  return apiRequest<UpdateStoreSettingsResponse>(
    `/api/client/stores/${storeId}/settings`,
    {
      method: "PUT",
      body: JSON.stringify(config),
    },
  );
}

// ============ TanStack Query Keys ============

/**
 * Query key factory for store settings queries
 */
export const storeSettingsKeys = {
  all: ["store-settings"] as const,
  details: () => [...storeSettingsKeys.all, "detail"] as const,
  detail: (storeId: string) =>
    [...storeSettingsKeys.details(), storeId] as const,
};

// ============ TanStack Query Hooks ============

/**
 * Hook to fetch store settings for a specific store
 * @param storeId - Store UUID
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with store settings data
 */
export function useStoreSettings(
  storeId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: storeSettingsKeys.detail(storeId || ""),
    queryFn: () => getStoreSettings(storeId!),
    enabled: (options?.enabled !== false && !!storeId) || false,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    staleTime: 30000, // Consider data fresh for 30 seconds
  });
}

/**
 * Hook to update store settings
 * Invalidates store settings query on success
 * @returns TanStack Mutation for updating store settings
 */
export function useUpdateStoreSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      storeId,
      config,
    }: {
      storeId: string;
      config: UpdateStoreSettingsInput;
    }) => updateStoreSettings(storeId, config),
    onSuccess: (_, variables) => {
      // Invalidate store settings query for this store
      queryClient.invalidateQueries({
        queryKey: storeSettingsKeys.detail(variables.storeId),
      });
    },
  });
}
