/**
 * API Keys Admin API client functions
 * Provides functions for interacting with the API key management endpoints
 * All functions require SUPERADMIN authentication
 *
 * Uses shared API client for consistent:
 * - 401/session expiration handling (automatic redirect to login)
 * - Error formatting with ApiError class
 * - Timeout configuration (30s default)
 * - Credential handling (httpOnly cookies)
 *
 * @module lib/api/api-keys
 * @security SUPERADMIN only - API keys connect desktop app to cloud
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "./client";

// ============================================================================
// Types
// ============================================================================

/**
 * API key status values matching backend Prisma enum
 */
export type ApiKeyStatus =
  | "ACTIVE"
  | "REVOKED"
  | "EXPIRED"
  | "PENDING"
  | "SUSPENDED";

/**
 * Revocation reason values matching backend Prisma enum
 */
export type ApiKeyRevocationReason =
  | "ROTATION"
  | "COMPROMISED"
  | "STORE_CLOSED"
  | "ADMIN_ACTION"
  | "QUOTA_ABUSE";

/**
 * API key list item (summary view)
 */
export interface ApiKeyListItem {
  api_key_id: string;
  store_id: string;
  store_name: string;
  store_public_id: string;
  company_id: string;
  company_name: string;
  key_prefix: string;
  key_suffix: string;
  label: string | null;
  status: ApiKeyStatus;
  activated_at: string | null;
  last_used_at: string | null;
  last_sync_at: string | null;
  expires_at: string | null;
  created_at: string;
  created_by_name: string;
}

/**
 * API key details (full view)
 */
export interface ApiKeyDetails extends ApiKeyListItem {
  timezone: string;
  state_code: string | null;
  metadata: Record<string, unknown> | null;
  ip_allowlist: string[];
  ip_enforcement_enabled: boolean;
  rate_limit_rpm: number;
  daily_sync_quota: number;
  monthly_data_quota_mb: number;
  device_fingerprint: string | null;
  rotated_from_key_id: string | null;
  rotation_grace_ends_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  revoked_by_name: string | null;
  revocation_reason: ApiKeyRevocationReason | null;
  revocation_notes: string | null;
}

/**
 * API key creation input
 */
export interface CreateApiKeyInput {
  store_id: string;
  label?: string;
  expires_at?: string;
  metadata?: Record<string, unknown>;
  ip_allowlist?: string[];
  ip_enforcement_enabled?: boolean;
  rate_limit_rpm?: number;
  daily_sync_quota?: number;
  monthly_data_quota_mb?: number;
}

/**
 * API key creation response (includes raw key shown ONCE)
 */
export interface CreateApiKeyResponse {
  raw_key: string;
  key_prefix: string;
  key_suffix: string;
  api_key_id: string;
  store_id: string;
  company_id: string;
  label: string | null;
  status: ApiKeyStatus;
  created_at: string;
}

/**
 * API key update input
 */
export interface UpdateApiKeyInput {
  label?: string;
  metadata?: Record<string, unknown>;
  ip_allowlist?: string[];
  ip_enforcement_enabled?: boolean;
  rate_limit_rpm?: number;
  daily_sync_quota?: number;
  monthly_data_quota_mb?: number;
  expires_at?: string | null;
}

/**
 * API key rotate input
 */
export interface RotateApiKeyInput {
  grace_period_days?: number;
  new_label?: string;
  preserve_metadata?: boolean;
  preserve_ip_allowlist?: boolean;
}

/**
 * API key rotate response
 */
export interface RotateApiKeyResponse {
  new_key: {
    raw_key: string;
    api_key_id: string;
    key_prefix: string;
    key_suffix: string;
  };
  old_key: {
    api_key_id: string;
    grace_period_ends_at: string | null;
  };
}

/**
 * API key revoke input
 */
export interface RevokeApiKeyInput {
  reason: ApiKeyRevocationReason;
  notes?: string;
  notify_admins?: boolean;
}

/**
 * API key suspend input
 */
export interface SuspendApiKeyInput {
  reason: string;
}

/**
 * List API keys query parameters
 */
export interface ListApiKeysParams {
  store_id?: string;
  company_id?: string;
  status?: ApiKeyStatus;
  search?: string;
  include_expired?: boolean;
  include_revoked?: boolean;
  page?: number;
  limit?: number;
  sort_by?: "createdAt" | "lastUsedAt" | "storeName" | "status";
  sort_order?: "asc" | "desc";
}

/**
 * List API keys response
 */
export interface ListApiKeysResponse {
  success: boolean;
  data: {
    items: ApiKeyListItem[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      total_pages: number;
    };
  };
}

/**
 * Single API key response
 */
export interface ApiKeyResponse {
  success: boolean;
  data: ApiKeyDetails;
}

/**
 * Audit event item
 */
export interface ApiKeyAuditEvent {
  audit_event_id: string;
  event_type: string;
  actor_user_id: string | null;
  actor_type: "ADMIN" | "SYSTEM" | "DEVICE";
  ip_address: string | null;
  event_details: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Audit trail response
 */
export interface AuditTrailResponse {
  success: boolean;
  data: {
    items: ApiKeyAuditEvent[];
    pagination: {
      total: number;
      page: number;
      limit: number;
    };
  };
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * List all API keys with filtering and pagination
 * @param params - Query parameters for filtering
 * @returns List of API keys with pagination
 */
export async function listApiKeys(
  params?: ListApiKeysParams,
): Promise<ListApiKeysResponse> {
  const response = await apiClient.get<ListApiKeysResponse>(
    "/api/v1/admin/api-keys",
    { params },
  );
  return response.data;
}

/**
 * Get API key details by ID
 * @param keyId - API key UUID
 * @returns API key details
 */
export async function getApiKey(keyId: string): Promise<ApiKeyResponse> {
  if (!keyId) {
    throw new Error("API key ID is required");
  }

  const response = await apiClient.get<ApiKeyResponse>(
    `/api/v1/admin/api-keys/${keyId}`,
  );
  return response.data;
}

/**
 * Create a new API key for a store
 * IMPORTANT: The raw_key in the response is shown ONCE and must be copied immediately
 * @param data - API key creation data
 * @returns Created API key with raw key
 */
export async function createApiKey(
  data: CreateApiKeyInput,
): Promise<{ success: boolean; data: CreateApiKeyResponse; message: string }> {
  if (!data.store_id) {
    throw new Error("Store ID is required");
  }

  const response = await apiClient.post<{
    success: boolean;
    data: CreateApiKeyResponse;
    message: string;
  }>("/api/v1/admin/api-keys", data);
  return response.data;
}

/**
 * Update API key settings
 * @param keyId - API key UUID
 * @param data - Update data
 * @returns Updated API key info
 */
export async function updateApiKey(
  keyId: string,
  data: UpdateApiKeyInput,
): Promise<{
  success: boolean;
  data: {
    api_key_id: string;
    label: string | null;
    status: ApiKeyStatus;
    updated_at: string;
  };
  message: string;
}> {
  if (!keyId) {
    throw new Error("API key ID is required");
  }

  const response = await apiClient.patch<{
    success: boolean;
    data: {
      api_key_id: string;
      label: string | null;
      status: ApiKeyStatus;
      updated_at: string;
    };
    message: string;
  }>(`/api/v1/admin/api-keys/${keyId}`, data);
  return response.data;
}

/**
 * Rotate an API key (creates new key, sets grace period on old)
 * IMPORTANT: The raw_key in the response is shown ONCE and must be copied immediately
 * @param keyId - API key UUID to rotate
 * @param data - Rotation options
 * @returns New API key with raw key and old key grace info
 */
export async function rotateApiKey(
  keyId: string,
  data?: RotateApiKeyInput,
): Promise<{ success: boolean; data: RotateApiKeyResponse; message: string }> {
  if (!keyId) {
    throw new Error("API key ID is required");
  }

  const response = await apiClient.post<{
    success: boolean;
    data: RotateApiKeyResponse;
    message: string;
  }>(`/api/v1/admin/api-keys/${keyId}/rotate`, data || {});
  return response.data;
}

/**
 * Revoke an API key immediately
 * @param keyId - API key UUID
 * @param data - Revocation details
 * @returns Success message
 */
export async function revokeApiKey(
  keyId: string,
  data: RevokeApiKeyInput,
): Promise<{ success: boolean; message: string }> {
  if (!keyId) {
    throw new Error("API key ID is required");
  }

  if (!data.reason) {
    throw new Error("Revocation reason is required");
  }

  const response = await apiClient.post<{ success: boolean; message: string }>(
    `/api/v1/admin/api-keys/${keyId}/revoke`,
    data,
  );
  return response.data;
}

/**
 * Suspend an API key temporarily
 * @param keyId - API key UUID
 * @param data - Suspension reason
 * @returns Success message
 */
export async function suspendApiKey(
  keyId: string,
  data?: SuspendApiKeyInput,
): Promise<{ success: boolean; message: string }> {
  if (!keyId) {
    throw new Error("API key ID is required");
  }

  const response = await apiClient.post<{ success: boolean; message: string }>(
    `/api/v1/admin/api-keys/${keyId}/suspend`,
    data || { reason: "Suspended by admin" },
  );
  return response.data;
}

/**
 * Reactivate a suspended API key
 * @param keyId - API key UUID
 * @returns Success message
 */
export async function reactivateApiKey(
  keyId: string,
): Promise<{ success: boolean; message: string }> {
  if (!keyId) {
    throw new Error("API key ID is required");
  }

  const response = await apiClient.post<{ success: boolean; message: string }>(
    `/api/v1/admin/api-keys/${keyId}/reactivate`,
  );
  return response.data;
}

/**
 * Get audit trail for an API key
 * @param keyId - API key UUID
 * @param params - Pagination and filter options
 * @returns Audit events
 */
export async function getApiKeyAudit(
  keyId: string,
  params?: {
    page?: number;
    limit?: number;
    event_types?: string;
    start_date?: string;
    end_date?: string;
  },
): Promise<AuditTrailResponse> {
  if (!keyId) {
    throw new Error("API key ID is required");
  }

  const response = await apiClient.get<AuditTrailResponse>(
    `/api/v1/admin/api-keys/${keyId}/audit`,
    { params },
  );
  return response.data;
}

// ============================================================================
// TanStack Query Hooks
// ============================================================================

/**
 * Query key factory for API key queries
 */
export const apiKeyKeys = {
  all: ["api-keys"] as const,
  lists: () => [...apiKeyKeys.all, "list"] as const,
  list: (params?: ListApiKeysParams) =>
    [...apiKeyKeys.lists(), params] as const,
  details: () => [...apiKeyKeys.all, "detail"] as const,
  detail: (id: string) => [...apiKeyKeys.details(), id] as const,
  audit: (id: string) => [...apiKeyKeys.detail(id), "audit"] as const,
};

/**
 * Hook to fetch API keys list with filtering and pagination
 * @param params - Query parameters
 * @returns TanStack Query result with API keys data
 */
export function useApiKeys(params?: ListApiKeysParams) {
  return useQuery({
    queryKey: apiKeyKeys.list(params),
    queryFn: () => listApiKeys(params),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook to fetch a single API key by ID
 * @param keyId - API key UUID
 * @param options - Query options
 * @returns TanStack Query result with API key details
 */
export function useApiKey(
  keyId: string | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: apiKeyKeys.detail(keyId || ""),
    queryFn: () => getApiKey(keyId!),
    enabled: options?.enabled !== false && !!keyId,
  });
}

/**
 * Hook to fetch API key audit trail
 * @param keyId - API key UUID
 * @param params - Pagination options
 * @param options - Query options
 * @returns TanStack Query result with audit data
 */
export function useApiKeyAudit(
  keyId: string | undefined,
  params?: {
    page?: number;
    limit?: number;
    event_types?: string;
    start_date?: string;
    end_date?: string;
  },
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: [...apiKeyKeys.audit(keyId || ""), params],
    queryFn: () => getApiKeyAudit(keyId!, params),
    enabled: options?.enabled !== false && !!keyId,
  });
}

/**
 * Hook to create a new API key
 * @returns TanStack Query mutation
 */
export function useCreateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateApiKeyInput) => createApiKey(data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: apiKeyKeys.all,
        refetchType: "all",
      });
    },
  });
}

/**
 * Hook to update an API key
 * @returns TanStack Query mutation
 */
export function useUpdateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ keyId, data }: { keyId: string; data: UpdateApiKeyInput }) =>
      updateApiKey(keyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: apiKeyKeys.all,
        refetchType: "all",
      });
    },
  });
}

/**
 * Hook to rotate an API key
 * @returns TanStack Query mutation
 */
export function useRotateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      keyId,
      data,
    }: {
      keyId: string;
      data?: RotateApiKeyInput;
    }) => rotateApiKey(keyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: apiKeyKeys.all,
        refetchType: "all",
      });
    },
  });
}

/**
 * Hook to revoke an API key
 * @returns TanStack Query mutation
 */
export function useRevokeApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ keyId, data }: { keyId: string; data: RevokeApiKeyInput }) =>
      revokeApiKey(keyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: apiKeyKeys.all,
        refetchType: "all",
      });
    },
  });
}

/**
 * Hook to suspend an API key
 * @returns TanStack Query mutation
 */
export function useSuspendApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      keyId,
      data,
    }: {
      keyId: string;
      data?: SuspendApiKeyInput;
    }) => suspendApiKey(keyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: apiKeyKeys.all,
        refetchType: "all",
      });
    },
  });
}

/**
 * Hook to reactivate a suspended API key
 * @returns TanStack Query mutation
 */
export function useReactivateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (keyId: string) => reactivateApiKey(keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: apiKeyKeys.all,
        refetchType: "all",
      });
    },
  });
}
