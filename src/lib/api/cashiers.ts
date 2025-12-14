/**
 * Cashier API client functions
 * Provides functions for interacting with the cashier management API
 * All functions require CASHIER_* permissions (except authenticate)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

/**
 * Cashier entity type
 */
export interface Cashier {
  cashier_id: string;
  store_id: string;
  employee_id: string;
  name: string;
  is_active: boolean;
  hired_on: string; // ISO date string
  termination_date: string | null; // ISO date string
  created_at: string; // ISO date string
  updated_at: string; // ISO date string
  disabled_at: string | null; // ISO date string
}

/**
 * Cashier session data returned when terminal_id is provided
 */
export interface CashierSession {
  session_id: string;
  session_token: string;
  expires_at: string; // ISO date string
}

/**
 * Cashier authentication result
 * Includes session data when terminal_id was provided in the request
 */
export interface CashierAuthResult {
  cashier_id: string;
  employee_id: string;
  name: string;
  session: CashierSession | null;
}

/**
 * API error response
 * Note: error can be a string OR an object with code/message
 */
interface ApiError {
  success: false;
  error: string | { code: string; message: string };
  message?: string;
}

/**
 * API success response
 */
interface ApiSuccessResponse<T> {
  success: true;
  data: T;
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
      success: false,
      error: "Unknown error",
      message: `HTTP ${response.status}: ${response.statusText}`,
    }));

    // Handle nested error object: { error: { code, message } }
    const errorMessage =
      errorData.message ||
      (typeof errorData.error === "object"
        ? errorData.error.message
        : errorData.error) ||
      "API request failed";

    throw new Error(errorMessage);
  }

  const result: ApiSuccessResponse<T> = await response.json();
  return result.data;
}

/**
 * Make authenticated API request that returns void (for 204 No Content responses)
 * Uses credentials: "include" to send httpOnly cookies
 */
async function apiRequestVoid(
  endpoint: string,
  options: RequestInit = {},
): Promise<void> {
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
      success: false,
      error: "Unknown error",
      message: `HTTP ${response.status}: ${response.statusText}`,
    }));

    // Handle nested error object: { error: { code, message } }
    const errorMessage =
      errorData.message ||
      (typeof errorData.error === "object"
        ? errorData.error.message
        : errorData.error) ||
      "API request failed";

    throw new Error(errorMessage);
  }

  // 204 No Content responses have no body, so we just return void
  if (response.status === 204) {
    return;
  }

  // For other successful responses, verify they're empty or parse if needed
  const contentType = response.headers.get("Content-Type");
  if (contentType && contentType.includes("application/json")) {
    const result: ApiSuccessResponse<never> = await response.json();
    // If we get here, the response had data but we expected void
    // This shouldn't happen, but we'll return void anyway
    return;
  }

  return;
}

/**
 * Input type for creating a cashier
 */
export interface CreateCashierInput {
  name: string;
  pin: string;
  hired_on: string; // ISO date string (YYYY-MM-DD)
  termination_date?: string | null;
}

/**
 * Input type for updating a cashier
 */
export interface UpdateCashierInput {
  name?: string;
  pin?: string;
  hired_on?: string;
  termination_date?: string | null;
}

/**
 * Get cashiers for a store
 * @param storeId - Store UUID
 * @param filters - Filter options (is_active)
 * @returns Array of cashiers
 */
export async function getCashiers(
  storeId: string,
  filters?: { is_active?: boolean },
): Promise<Cashier[]> {
  if (!storeId) {
    throw new Error("Store ID is required");
  }

  const queryParams = new URLSearchParams();
  if (filters?.is_active !== undefined) {
    queryParams.append("is_active", filters.is_active.toString());
  }

  const queryString = queryParams.toString();
  const endpoint = `/api/stores/${storeId}/cashiers${queryString ? `?${queryString}` : ""}`;

  return apiRequest<Cashier[]>(endpoint, {
    method: "GET",
  });
}

/**
 * Get a single cashier by ID
 * @param storeId - Store UUID
 * @param cashierId - Cashier UUID
 * @returns Cashier data
 */
export async function getCashierById(
  storeId: string,
  cashierId: string,
): Promise<Cashier> {
  if (!storeId) {
    throw new Error("Store ID is required");
  }
  if (!cashierId) {
    throw new Error("Cashier ID is required");
  }

  return apiRequest<Cashier>(`/api/stores/${storeId}/cashiers/${cashierId}`, {
    method: "GET",
  });
}

/**
 * Create a new cashier
 * @param storeId - Store UUID
 * @param data - Cashier data (name, pin, hired_on, termination_date)
 * @returns Created cashier data
 */
export async function createCashier(
  storeId: string,
  data: CreateCashierInput,
): Promise<Cashier> {
  if (!storeId) {
    throw new Error("Store ID is required");
  }

  return apiRequest<Cashier>(`/api/stores/${storeId}/cashiers`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Update an existing cashier
 * @param storeId - Store UUID
 * @param cashierId - Cashier UUID
 * @param data - Fields to update
 * @returns Updated cashier data
 */
export async function updateCashier(
  storeId: string,
  cashierId: string,
  data: UpdateCashierInput,
): Promise<Cashier> {
  if (!storeId) {
    throw new Error("Store ID is required");
  }
  if (!cashierId) {
    throw new Error("Cashier ID is required");
  }

  return apiRequest<Cashier>(`/api/stores/${storeId}/cashiers/${cashierId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * Delete (soft delete) a cashier
 * @param storeId - Store UUID
 * @param cashierId - Cashier UUID
 */
export async function deleteCashier(
  storeId: string,
  cashierId: string,
): Promise<void> {
  if (!storeId) {
    throw new Error("Store ID is required");
  }
  if (!cashierId) {
    throw new Error("Cashier ID is required");
  }

  await apiRequestVoid(`/api/stores/${storeId}/cashiers/${cashierId}`, {
    method: "DELETE",
  });
}

/**
 * Authenticate cashier by name or employee_id and PIN
 *
 * When terminalId is provided, a Cashier Session Token is created and returned.
 * This token must be included in subsequent terminal operation requests via
 * the X-Cashier-Session header.
 *
 * @param storeId - Store UUID
 * @param identifier - Name or employee_id
 * @param pin - PIN number (4 digits)
 * @param terminalId - Optional terminal UUID for creating session token
 * @returns Cashier authentication result with optional session data
 */
export async function authenticateCashier(
  storeId: string,
  identifier: { name?: string; employee_id?: string },
  pin: string,
  terminalId?: string,
): Promise<CashierAuthResult> {
  if (!storeId) {
    throw new Error("Store ID is required");
  }

  if (!identifier.name && !identifier.employee_id) {
    throw new Error("Either name or employee_id must be provided");
  }

  if (!pin || !/^\d{4}$/.test(pin)) {
    throw new Error("PIN must be exactly 4 numeric digits");
  }

  return apiRequest<CashierAuthResult>(
    `/api/stores/${storeId}/cashiers/authenticate`,
    {
      method: "POST",
      body: JSON.stringify({
        name: identifier.name,
        employee_id: identifier.employee_id,
        pin,
        terminal_id: terminalId,
      }),
    },
  );
}

/**
 * Query keys for cashier queries
 */
export const cashierKeys = {
  all: () => ["cashiers"] as const,
  lists: () => [...cashierKeys.all(), "list"] as const,
  list: (storeId: string, filters?: { is_active?: boolean }) =>
    [...cashierKeys.lists(), storeId, filters] as const,
  details: () => [...cashierKeys.all(), "detail"] as const,
  detail: (storeId: string, cashierId: string) =>
    [...cashierKeys.details(), storeId, cashierId] as const,
};

/**
 * Hook to fetch cashiers for a store
 * @param storeId - Store UUID
 * @param filters - Filter options (is_active)
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with cashiers data
 */
export function useCashiers(
  storeId: string | undefined,
  filters?: { is_active?: boolean },
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: cashierKeys.list(storeId || "", filters),
    queryFn: () => getCashiers(storeId!, filters),
    enabled: options?.enabled !== false && !!storeId,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook to authenticate cashier
 * @returns TanStack Query mutation for cashier authentication
 */
export function useAuthenticateCashier() {
  return useMutation({
    mutationFn: ({
      storeId,
      identifier,
      pin,
      terminalId,
    }: {
      storeId: string;
      identifier: { name?: string; employee_id?: string };
      pin: string;
      terminalId?: string;
    }) => authenticateCashier(storeId, identifier, pin, terminalId),
  });
}

/**
 * Hook to fetch a single cashier by ID
 * @param storeId - Store UUID
 * @param cashierId - Cashier UUID
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with cashier data
 */
export function useCashier(
  storeId: string | undefined,
  cashierId: string | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: cashierKeys.detail(storeId || "", cashierId || ""),
    queryFn: () => getCashierById(storeId!, cashierId!),
    enabled: options?.enabled !== false && !!storeId && !!cashierId,
  });
}

/**
 * Hook to create a cashier
 * @returns TanStack Query mutation for creating a cashier
 */
export function useCreateCashier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      storeId,
      data,
    }: {
      storeId: string;
      data: CreateCashierInput;
    }) => createCashier(storeId, data),
    onSuccess: (_, variables) => {
      // Invalidate ALL cashier list queries for this store (regardless of filters)
      // Using partial key match to invalidate both filtered and unfiltered queries
      // refetchType: "all" ensures queries refetch even when navigating between pages
      queryClient.invalidateQueries({
        queryKey: ["cashiers", "list", variables.storeId],
        refetchType: "all",
      });
    },
  });
}

/**
 * Hook to update a cashier
 * @returns TanStack Query mutation for updating a cashier
 */
export function useUpdateCashier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      storeId,
      cashierId,
      data,
    }: {
      storeId: string;
      cashierId: string;
      data: UpdateCashierInput;
    }) => updateCashier(storeId, cashierId, data),
    onSuccess: (_, variables) => {
      // Invalidate ALL cashier list queries for this store (regardless of filters)
      // refetchType: "all" ensures queries refetch even when navigating between pages
      queryClient.invalidateQueries({
        queryKey: ["cashiers", "list", variables.storeId],
        refetchType: "all",
      });
      queryClient.invalidateQueries({
        queryKey: cashierKeys.detail(variables.storeId, variables.cashierId),
        refetchType: "all",
      });
    },
  });
}

/**
 * Hook to delete a cashier
 * @returns TanStack Query mutation for deleting a cashier
 */
export function useDeleteCashier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      storeId,
      cashierId,
    }: {
      storeId: string;
      cashierId: string;
    }) => deleteCashier(storeId, cashierId),
    onSuccess: (_, variables) => {
      // Invalidate ALL cashier list queries for this store (regardless of filters)
      // refetchType: "all" ensures queries refetch even when navigating between pages
      queryClient.invalidateQueries({
        queryKey: ["cashiers", "list", variables.storeId],
        refetchType: "all",
      });
    },
  });
}
