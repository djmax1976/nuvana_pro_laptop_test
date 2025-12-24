/**
 * Store Settings API client functions
 * Provides functions for interacting with the client store settings API
 * All functions require STORE_READ/STORE_UPDATE permissions (Client Users only)
 *
 * Story: 6.14 - Store Settings Page with Employee/Cashier Management
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

  const response = await apiClient.get<StoreSettingsResponse>(
    `/api/client/stores/${storeId}/settings`,
  );
  return response.data;
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

  const response = await apiClient.put<UpdateStoreSettingsResponse>(
    `/api/client/stores/${storeId}/settings`,
    config,
  );
  return response.data;
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
