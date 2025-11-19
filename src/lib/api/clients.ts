/**
 * Client API client functions
 * Provides functions for interacting with the client management API
 * All functions require ADMIN_SYSTEM_CONFIG permission (System Admin only)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Client,
  ClientStatus,
  CreateClientInput,
  UpdateClientInput,
  ListClientsParams,
  ListClientsResponse,
  ClientResponse,
} from "@/types/client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/**
 * API error response
 */
export interface ApiError {
  success: false;
  error: string;
  message: string;
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

  const data = await response.json();

  if (!response.ok || data.success === false) {
    throw new Error(
      data.message ||
        data.error ||
        `HTTP ${response.status}: ${response.statusText}`,
    );
  }

  return data;
}

/**
 * Get all clients with pagination, search, and filtering (System Admin only)
 * @param params - Query parameters for pagination and filtering
 * @returns List of clients with pagination metadata
 */
export async function getClients(
  params?: ListClientsParams,
): Promise<ListClientsResponse> {
  const queryParams = new URLSearchParams();
  if (params?.page) {
    queryParams.append("page", params.page.toString());
  }
  if (params?.limit) {
    queryParams.append("limit", params.limit.toString());
  }
  if (params?.search) {
    queryParams.append("search", params.search);
  }
  if (params?.status) {
    queryParams.append("status", params.status);
  }

  const queryString = queryParams.toString();
  const endpoint = `/api/clients${queryString ? `?${queryString}` : ""}`;

  return apiRequest<ListClientsResponse>(endpoint, {
    method: "GET",
  });
}

/**
 * Get client by ID (System Admin only)
 * @param clientId - Client UUID
 * @returns Client details
 */
export async function getClientById(clientId: string): Promise<ClientResponse> {
  if (!clientId) {
    throw new Error("Client ID is required");
  }

  return apiRequest<ClientResponse>(`/api/clients/${clientId}`, {
    method: "GET",
  });
}

/**
 * Create a new client (System Admin only)
 * @param data - Client creation data
 * @returns Created client
 */
export async function createClient(
  data: CreateClientInput,
): Promise<ClientResponse> {
  if (!data.name || data.name.trim().length === 0) {
    throw new Error("Client name is required");
  }

  if (data.name.length > 255) {
    throw new Error("Client name must be 255 characters or less");
  }

  return apiRequest<ClientResponse>("/api/clients", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Update client (System Admin only)
 * @param clientId - Client UUID
 * @param data - Client update data
 * @returns Updated client
 */
export async function updateClient(
  clientId: string,
  data: UpdateClientInput,
): Promise<ClientResponse> {
  if (!clientId) {
    throw new Error("Client ID is required");
  }

  if (data.name !== undefined && data.name.trim().length === 0) {
    throw new Error("Client name cannot be empty");
  }

  if (data.name !== undefined && data.name.length > 255) {
    throw new Error("Client name must be 255 characters or less");
  }

  return apiRequest<ClientResponse>(`/api/clients/${clientId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * Delete client (soft delete) (System Admin only)
 * @param clientId - Client UUID
 * @returns Deleted client
 */
export async function deleteClient(clientId: string): Promise<ClientResponse> {
  if (!clientId) {
    throw new Error("Client ID is required");
  }

  return apiRequest<ClientResponse>(`/api/clients/${clientId}`, {
    method: "DELETE",
  });
}

// ============ TanStack Query Hooks ============

/**
 * Client dropdown item type
 */
export interface ClientDropdownItem {
  client_id: string;
  name: string;
}

/**
 * Client dropdown response
 */
export interface ClientDropdownResponse {
  success: true;
  data: ClientDropdownItem[];
}

/**
 * Get clients for dropdown selection (System Admin only)
 * Returns only active, non-deleted clients with minimal data
 * @returns List of clients for dropdown
 */
export async function getClientsDropdown(): Promise<ClientDropdownResponse> {
  return apiRequest<ClientDropdownResponse>("/api/clients/dropdown", {
    method: "GET",
  });
}

/**
 * Query key factory for client queries
 */
export const clientKeys = {
  all: ["clients"] as const,
  lists: () => [...clientKeys.all, "list"] as const,
  list: (params?: ListClientsParams) =>
    [...clientKeys.lists(), params] as const,
  details: () => [...clientKeys.all, "detail"] as const,
  detail: (id: string) => [...clientKeys.details(), id] as const,
  dropdown: () => [...clientKeys.all, "dropdown"] as const,
};

/**
 * Hook to fetch clients list with pagination, search, and filtering
 * @param params - Query parameters for pagination and filtering
 * @returns TanStack Query result with clients data
 */
export function useClients(params?: ListClientsParams) {
  return useQuery({
    queryKey: clientKeys.list(params),
    queryFn: () => getClients(params),
  });
}

/**
 * Hook to fetch clients for dropdown selection
 * @returns TanStack Query result with dropdown data
 */
export function useClientsDropdown() {
  return useQuery({
    queryKey: clientKeys.dropdown(),
    queryFn: () => getClientsDropdown(),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes as dropdown data changes less frequently
  });
}

/**
 * Hook to fetch a single client by ID
 * @param clientId - Client UUID
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with client data
 */
export function useClient(
  clientId: string | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: clientKeys.detail(clientId || ""),
    queryFn: () => getClientById(clientId!),
    enabled: options?.enabled !== false && !!clientId,
  });
}

/**
 * Hook to create a new client
 * @returns TanStack Query mutation for creating a client
 */
export function useCreateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateClientInput) => createClient(data),
    onSuccess: () => {
      // Invalidate clients list to refetch after creation
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
    },
  });
}

/**
 * Hook to update a client
 * @returns TanStack Query mutation for updating a client
 */
export function useUpdateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      clientId,
      data,
    }: {
      clientId: string;
      data: UpdateClientInput;
    }) => updateClient(clientId, data),
    onSuccess: (response) => {
      // Invalidate both list and detail queries
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
      if (response.data?.client_id) {
        queryClient.invalidateQueries({
          queryKey: clientKeys.detail(response.data.client_id),
        });
      }
    },
  });
}

/**
 * Hook to delete a client
 * @returns TanStack Query mutation for deleting a client
 */
export function useDeleteClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (clientId: string) => deleteClient(clientId),
    onSuccess: () => {
      // Invalidate clients list to refetch after deletion
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
    },
  });
}

// Re-export types for convenience
export type {
  Client,
  ClientStatus,
  CreateClientInput,
  UpdateClientInput,
  ListClientsParams,
};
