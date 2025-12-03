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
 * Location JSON structure
 */
export interface LocationJson {
  address?: string;
  gps?: { lat: number; lng: number };
}

/**
 * Store configuration type
 */
export interface StoreConfiguration {
  timezone?: string;
  location?: {
    address?: string;
  };
  operating_hours?: {
    monday?: { open?: string; close?: string; closed?: boolean };
    tuesday?: { open?: string; close?: string; closed?: boolean };
    wednesday?: { open?: string; close?: string; closed?: boolean };
    thursday?: { open?: string; close?: string; closed?: boolean };
    friday?: { open?: string; close?: string; closed?: boolean };
    saturday?: { open?: string; close?: string; closed?: boolean };
    sunday?: { open?: string; close?: string; closed?: boolean };
  };
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
  configuration?: StoreConfiguration | null;
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
 * Store with company info (for system admin view)
 */
export interface StoreWithCompany extends Store {
  company?: {
    name: string;
  };
}

/**
 * Validate IANA timezone format (safer implementation to avoid ReDoS)
 * Supports formats like: America/New_York, Europe/London, UTC, GMT+5, GMT-3
 */
function validateTimezone(timezone: string): boolean {
  if (timezone === "UTC") {
    return true;
  }
  if (/^GMT[+-]\d{1,2}$/.test(timezone)) {
    return true;
  }
  // Limit length to prevent ReDoS
  if (timezone.length > 50) {
    return false;
  }
  // Split and validate each segment instead of using nested quantifiers
  const parts = timezone.split("/");
  if (parts.length < 2 || parts.length > 3) {
    return false;
  }
  // Each part should contain only letters and underscores
  const segmentPattern = /^[A-Za-z_]+$/;
  return parts.every((part) => segmentPattern.test(part));
}

/**
 * Validate location JSON structure (address only, no GPS validation needed)
 */
function validateLocationJson(location: LocationJson): void {
  // No validation needed for address-only location
  return;
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
 * Get all stores (System Admin only)
 * @param params - Query parameters for pagination
 * @returns List of all stores with company info
 */
export async function getAllStores(params?: ListStoresParams): Promise<{
  data: StoreWithCompany[];
  meta: { total: number; limit: number; offset: number };
}> {
  const queryParams = new URLSearchParams();
  if (params?.limit) {
    queryParams.append("limit", params.limit.toString());
  }
  if (params?.offset) {
    queryParams.append("offset", params.offset.toString());
  }

  const queryString = queryParams.toString();
  const endpoint = `/api/stores${queryString ? `?${queryString}` : ""}`;

  return apiRequest<{
    data: StoreWithCompany[];
    meta: { total: number; limit: number; offset: number };
  }>(endpoint, {
    method: "GET",
  });
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
  listAll: (params?: ListStoresParams) =>
    [...storeKeys.lists(), "all", params] as const,
  list: (companyId: string, params?: ListStoresParams) =>
    [...storeKeys.lists(), companyId, params] as const,
  details: () => [...storeKeys.all, "detail"] as const,
  detail: (id: string) => [...storeKeys.details(), id] as const,
};

/**
 * Hook to fetch all stores (System Admin only)
 * @param params - Query parameters for pagination
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with all stores data
 */
export function useAllStores(
  params?: ListStoresParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: storeKeys.listAll(params),
    queryFn: () => getAllStores(params),
    enabled: options?.enabled !== false,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}

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
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
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
      // Invalidate ALL store queries to ensure lists refresh
      queryClient.invalidateQueries({
        queryKey: storeKeys.all,
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
      // Invalidate ALL store queries to ensure lists and details refresh
      queryClient.invalidateQueries({
        queryKey: storeKeys.all,
      });
    },
  });
}

/**
 * Store configuration input
 */
export interface StoreConfigurationInput {
  timezone?: string; // IANA timezone format
  location?: {
    address?: string;
    gps?: { lat: number; lng: number };
  };
  operating_hours?: {
    monday?: { open?: string; close?: string; closed?: boolean };
    tuesday?: { open?: string; close?: string; closed?: boolean };
    wednesday?: { open?: string; close?: string; closed?: boolean };
    thursday?: { open?: string; close?: string; closed?: boolean };
    friday?: { open?: string; close?: string; closed?: boolean };
    saturday?: { open?: string; close?: string; closed?: boolean };
    sunday?: { open?: string; close?: string; closed?: boolean };
  };
}

/**
 * Update store configuration
 * @param storeId - Store UUID
 * @param config - Store configuration data
 * @returns Updated store
 */
export async function updateStoreConfiguration(
  storeId: string,
  config: StoreConfigurationInput,
): Promise<Store> {
  if (!storeId) {
    throw new Error("Store ID is required");
  }

  if (config.timezone && !validateTimezone(config.timezone)) {
    throw new Error(
      "Timezone must be in IANA format (e.g., America/New_York, Europe/London)",
    );
  }

  if (config.location) {
    validateLocationJson(config.location);
  }

  return apiRequest<Store>(`/api/stores/${storeId}/configuration`, {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

/**
 * Hook to update store configuration
 * @returns TanStack Query mutation for updating store configuration
 */
export function useUpdateStoreConfiguration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      storeId,
      config,
    }: {
      storeId: string;
      config: StoreConfigurationInput;
    }) => updateStoreConfiguration(storeId, config),
    onSuccess: (data) => {
      // Invalidate both list and detail queries
      queryClient.invalidateQueries({
        queryKey: storeKeys.detail(data.store_id),
      });
      queryClient.invalidateQueries({
        queryKey: storeKeys.list(data.company_id),
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
    onSuccess: () => {
      // Invalidate ALL store queries to ensure lists refresh
      queryClient.invalidateQueries({
        queryKey: storeKeys.all,
      });
    },
  });
}

/**
 * Terminal with active shift status and connection configuration
 * Story 4.82: Terminal Connection Configuration UI
 */
export interface TerminalWithStatus {
  pos_terminal_id: string;
  store_id: string;
  name: string;
  device_id: string | null;
  deleted_at: string | null;
  has_active_shift: boolean;
  created_at: string;
  updated_at: string;
  // Connection fields (Story 4.82)
  connection_type?: "NETWORK" | "API" | "WEBHOOK" | "FILE" | "MANUAL";
  connection_config?: Record<string, unknown> | null;
  vendor_type?:
    | "GENERIC"
    | "SQUARE"
    | "CLOVER"
    | "TOAST"
    | "LIGHTSPEED"
    | "CUSTOM";
  terminal_status?: "ACTIVE" | "INACTIVE" | "PENDING" | "ERROR";
  last_sync_at?: string | null;
  sync_status?: "NEVER" | "SUCCESS" | "FAILED" | "IN_PROGRESS";
}

/**
 * Get terminals for a store with active shift status
 * Story 4.8: Cashier Shift Start Flow
 * @param storeId - Store UUID
 * @returns Array of terminals with has_active_shift boolean flag
 */
export async function getStoreTerminals(
  storeId: string,
): Promise<TerminalWithStatus[]> {
  if (!storeId) {
    throw new Error("Store ID is required");
  }

  return apiRequest<TerminalWithStatus[]>(`/api/stores/${storeId}/terminals`, {
    method: "GET",
  });
}

/**
 * Hook to fetch terminals for a store
 * Story 4.8: Cashier Shift Start Flow
 * @param storeId - Store UUID
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with terminals data
 */
export function useStoreTerminals(
  storeId: string | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: [...storeKeys.details(), storeId || "", "terminals"],
    queryFn: () => getStoreTerminals(storeId!),
    enabled: options?.enabled !== false && !!storeId,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}

/**
 * Terminal entity type
 */
export interface Terminal {
  pos_terminal_id: string;
  store_id: string;
  name: string;
  device_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Create terminal input
 * Story 4.82: Terminal Connection Configuration UI
 */
export interface CreateTerminalInput {
  name: string;
  device_id?: string;
  connection_type?: "NETWORK" | "API" | "WEBHOOK" | "FILE" | "MANUAL";
  connection_config?: Record<string, unknown> | null;
  vendor_type?:
    | "GENERIC"
    | "SQUARE"
    | "CLOVER"
    | "TOAST"
    | "LIGHTSPEED"
    | "CUSTOM";
}

/**
 * Update terminal input
 * Story 4.82: Terminal Connection Configuration UI
 */
export interface UpdateTerminalInput {
  name?: string;
  device_id?: string;
  connection_type?: "NETWORK" | "API" | "WEBHOOK" | "FILE" | "MANUAL";
  connection_config?: Record<string, unknown> | null;
  vendor_type?:
    | "GENERIC"
    | "SQUARE"
    | "CLOVER"
    | "TOAST"
    | "LIGHTSPEED"
    | "CUSTOM";
}

/**
 * Create a new terminal for a store
 * @param storeId - Store UUID
 * @param data - Terminal creation data
 * @returns Created terminal
 */
export async function createTerminal(
  storeId: string,
  data: CreateTerminalInput,
): Promise<Terminal> {
  if (!storeId) {
    throw new Error("Store ID is required");
  }

  if (!data.name || data.name.trim().length === 0) {
    throw new Error("Terminal name is required");
  }

  if (data.name.length > 100) {
    throw new Error("Terminal name must be 100 characters or less");
  }

  return apiRequest<Terminal>(`/api/stores/${storeId}/terminals`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Update a terminal
 * @param storeId - Store UUID
 * @param terminalId - Terminal UUID
 * @param data - Terminal update data
 * @returns Updated terminal
 */
export async function updateTerminal(
  storeId: string,
  terminalId: string,
  data: UpdateTerminalInput,
): Promise<Terminal> {
  if (!storeId) {
    throw new Error("Store ID is required");
  }

  if (!terminalId) {
    throw new Error("Terminal ID is required");
  }

  if (data.name !== undefined && data.name.trim().length === 0) {
    throw new Error("Terminal name cannot be empty");
  }

  if (data.name !== undefined && data.name.length > 100) {
    throw new Error("Terminal name must be 100 characters or less");
  }

  return apiRequest<Terminal>(
    `/api/stores/${storeId}/terminals/${terminalId}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    },
  );
}

/**
 * Delete a terminal
 * @param storeId - Store UUID
 * @param terminalId - Terminal UUID
 */
export async function deleteTerminal(
  storeId: string,
  terminalId: string,
): Promise<void> {
  if (!storeId) {
    throw new Error("Store ID is required");
  }

  if (!terminalId) {
    throw new Error("Terminal ID is required");
  }

  return apiRequest<void>(`/api/stores/${storeId}/terminals/${terminalId}`, {
    method: "DELETE",
  });
}

/**
 * Hook to create a terminal
 * @returns Mutation for creating a terminal
 */
export function useCreateTerminal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      storeId,
      data,
    }: {
      storeId: string;
      data: CreateTerminalInput;
    }) => createTerminal(storeId, data),
    onSuccess: (_, variables) => {
      // Invalidate terminals query for the store
      queryClient.invalidateQueries({
        queryKey: [...storeKeys.details(), variables.storeId, "terminals"],
      });
      // Also invalidate store details to refresh terminal count if needed
      queryClient.invalidateQueries({
        queryKey: storeKeys.detail(variables.storeId),
      });
    },
  });
}

/**
 * Hook to update a terminal
 * @returns Mutation for updating a terminal
 */
export function useUpdateTerminal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      storeId,
      terminalId,
      data,
    }: {
      storeId: string;
      terminalId: string;
      data: UpdateTerminalInput;
    }) => updateTerminal(storeId, terminalId, data),
    onSuccess: (_, variables) => {
      // Invalidate terminals query for the store
      queryClient.invalidateQueries({
        queryKey: [...storeKeys.details(), variables.storeId, "terminals"],
      });
    },
  });
}

/**
 * Hook to delete a terminal
 * @returns Mutation for deleting a terminal
 */
export function useDeleteTerminal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      storeId,
      terminalId,
    }: {
      storeId: string;
      terminalId: string;
    }) => deleteTerminal(storeId, terminalId),
    onSuccess: (_, variables) => {
      // Invalidate terminals query for the store
      queryClient.invalidateQueries({
        queryKey: [...storeKeys.details(), variables.storeId, "terminals"],
      });
      // Also invalidate store details to refresh terminal count if needed
      queryClient.invalidateQueries({
        queryKey: storeKeys.detail(variables.storeId),
      });
    },
  });
}
