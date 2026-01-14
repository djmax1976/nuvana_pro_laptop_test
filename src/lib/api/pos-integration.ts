/**
 * POS Integration API Client
 *
 * React Query hooks and API functions for POS integration management.
 * Provides type-safe access to all POS integration endpoints.
 *
 * Uses shared API client for consistent:
 * - 401/session expiration handling (automatic redirect to login)
 * - Error formatting with ApiError class
 * - Timeout configuration (30s default)
 * - Credential handling (httpOnly cookies)
 *
 * Security Standards Applied:
 * - SEC-010: AUTHZ - Step-up authentication via elevation tokens
 * - SEC-012: SESSION_TIMEOUT - Short-lived elevation tokens (5 minutes)
 *
 * @module lib/api/pos-integration
 * @security Credentials are encrypted server-side; never returned in responses
 * @security POS operations require elevation tokens obtained via step-up authentication
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient, { ApiError } from "./client";
import { isValidUUID } from "@/lib/pos-integration/pos-types";
import { useElevationToken } from "@/contexts/ElevationTokenContext";
import type {
  POSIntegration,
  CreatePOSIntegrationRequest,
  UpdatePOSIntegrationRequest,
  POSConnectionTestResult,
  POSSyncResult,
  POSSyncLogsResponse,
  POSSyncLogsQuery,
  TriggerSyncOptions,
} from "@/types/pos-integration";

// ============================================================================
// Query Key Factory
// ============================================================================

/**
 * Query keys for POS integration queries
 * Following the factory pattern for hierarchical, composable keys
 */
export const posIntegrationKeys = {
  /** Root key for all POS integration queries */
  all: ["pos-integrations"] as const,

  /** Keys for POS integration details */
  details: () => [...posIntegrationKeys.all, "detail"] as const,
  detail: (storeId: string) =>
    [...posIntegrationKeys.details(), storeId] as const,

  /** Keys for sync logs */
  logs: () => [...posIntegrationKeys.all, "logs"] as const,
  logsList: (storeId: string) =>
    [...posIntegrationKeys.logs(), storeId] as const,
  logsWithParams: (storeId: string, params?: POSSyncLogsQuery) =>
    [...posIntegrationKeys.logsList(storeId), params] as const,
};

// ============================================================================
// API Response Types
// ============================================================================

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

interface ApiErrorResponse {
  success: false;
  error: {
    message: string;
    code?: string;
  };
}

/**
 * Options for POS API operations that may require elevation
 */
interface ElevatedRequestOptions {
  /** Elevation token for step-up authentication (optional for read operations) */
  elevationToken?: string;
}

/**
 * Build headers with optional elevation token
 */
function buildElevatedHeaders(elevationToken?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (elevationToken) {
    headers["X-Elevation-Token"] = elevationToken;
  }
  return headers;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Get POS integration for a store
 * GET /api/stores/:storeId/pos-integration
 *
 * SEC-010: AUTHZ - Supports elevation token for step-up authentication
 *
 * @param storeId - UUID of the store
 * @param options - Optional elevation token for step-up auth
 * @returns The POS integration or null if not configured
 * @throws ApiError on network/server errors
 */
async function getPOSIntegration(
  storeId: string,
  options?: ElevatedRequestOptions,
): Promise<POSIntegration | null> {
  // SEC-014: INPUT_VALIDATION - Validate UUID format before API call
  if (!isValidUUID(storeId)) {
    throw new ApiError("Invalid store ID format", 400, "INVALID_STORE_ID");
  }

  try {
    const response = await apiClient.get<ApiResponse<POSIntegration>>(
      `/api/stores/${storeId}/pos-integration`,
      { headers: buildElevatedHeaders(options?.elevationToken) },
    );
    return response.data.data;
  } catch (error) {
    // Handle 404 as "not configured" rather than error
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Create a new POS integration for a store
 * POST /api/stores/:storeId/pos-integration
 *
 * SEC-010: AUTHZ - Requires elevation token for step-up authentication
 *
 * @param storeId - UUID of the store
 * @param data - POS integration configuration
 * @param options - Optional elevation token for step-up auth
 * @returns The created POS integration
 * @throws ApiError on validation/server errors
 */
async function createPOSIntegration(
  storeId: string,
  data: CreatePOSIntegrationRequest,
  options?: ElevatedRequestOptions,
): Promise<POSIntegration> {
  // SEC-014: INPUT_VALIDATION - Validate UUID format before API call
  if (!isValidUUID(storeId)) {
    throw new ApiError("Invalid store ID format", 400, "INVALID_STORE_ID");
  }

  const response = await apiClient.post<ApiResponse<POSIntegration>>(
    `/api/stores/${storeId}/pos-integration`,
    data,
    { headers: buildElevatedHeaders(options?.elevationToken) },
  );
  return response.data.data;
}

/**
 * Update an existing POS integration
 * PATCH /api/stores/:storeId/pos-integration
 *
 * SEC-010: AUTHZ - Requires elevation token for step-up authentication
 *
 * @param storeId - UUID of the store
 * @param data - Partial POS integration configuration
 * @param options - Optional elevation token for step-up auth
 * @returns The updated POS integration
 * @throws ApiError on validation/server errors
 */
async function updatePOSIntegration(
  storeId: string,
  data: UpdatePOSIntegrationRequest,
  options?: ElevatedRequestOptions,
): Promise<POSIntegration> {
  // SEC-014: INPUT_VALIDATION - Validate UUID format before API call
  if (!isValidUUID(storeId)) {
    throw new ApiError("Invalid store ID format", 400, "INVALID_STORE_ID");
  }

  const response = await apiClient.patch<ApiResponse<POSIntegration>>(
    `/api/stores/${storeId}/pos-integration`,
    data,
    { headers: buildElevatedHeaders(options?.elevationToken) },
  );
  return response.data.data;
}

/**
 * Delete (deactivate) a POS integration
 * DELETE /api/stores/:storeId/pos-integration
 *
 * SEC-010: AUTHZ - Requires elevation token for step-up authentication
 *
 * @param storeId - UUID of the store
 * @param options - Optional elevation token for step-up auth
 * @throws ApiError on server errors
 */
async function deletePOSIntegration(
  storeId: string,
  options?: ElevatedRequestOptions,
): Promise<void> {
  // SEC-014: INPUT_VALIDATION - Validate UUID format before API call
  if (!isValidUUID(storeId)) {
    throw new ApiError("Invalid store ID format", 400, "INVALID_STORE_ID");
  }

  await apiClient.delete(`/api/stores/${storeId}/pos-integration`, {
    headers: buildElevatedHeaders(options?.elevationToken),
  });
}

/**
 * Test POS connection
 * POST /api/stores/:storeId/pos-integration/test
 *
 * Can test with existing configuration or new configuration
 *
 * SEC-010: AUTHZ - Requires elevation token for step-up authentication
 *
 * @param storeId - UUID of the store
 * @param config - Optional configuration to test (if not using existing)
 * @param options - Optional elevation token for step-up auth
 * @returns Connection test result
 * @throws ApiError on network/server errors
 */
async function testPOSConnection(
  storeId: string,
  config?: Partial<CreatePOSIntegrationRequest>,
  options?: ElevatedRequestOptions,
): Promise<POSConnectionTestResult> {
  // SEC-014: INPUT_VALIDATION - Validate UUID format before API call
  if (!isValidUUID(storeId)) {
    throw new ApiError("Invalid store ID format", 400, "INVALID_STORE_ID");
  }

  const response = await apiClient.post<POSConnectionTestResult>(
    `/api/stores/${storeId}/pos-integration/test`,
    config || {},
    { headers: buildElevatedHeaders(options?.elevationToken) },
  );
  return response.data;
}

/**
 * Trigger a manual POS sync
 * POST /api/stores/:storeId/pos-integration/sync
 *
 * SEC-010: AUTHZ - Requires elevation token for step-up authentication
 *
 * @param storeId - UUID of the store
 * @param syncOptions - Optional sync options to override defaults
 * @param options - Optional elevation token for step-up auth
 * @returns Sync result with entity counts
 * @throws ApiError on connection/server errors
 */
async function triggerPOSSync(
  storeId: string,
  syncOptions?: TriggerSyncOptions,
  options?: ElevatedRequestOptions,
): Promise<POSSyncResult> {
  // SEC-014: INPUT_VALIDATION - Validate UUID format before API call
  if (!isValidUUID(storeId)) {
    throw new ApiError("Invalid store ID format", 400, "INVALID_STORE_ID");
  }

  const response = await apiClient.post<POSSyncResult>(
    `/api/stores/${storeId}/pos-integration/sync`,
    syncOptions || {},
    { headers: buildElevatedHeaders(options?.elevationToken) },
  );
  return response.data;
}

/**
 * Get sync logs for a POS integration
 * GET /api/stores/:storeId/pos-integration/logs
 *
 * SEC-010: AUTHZ - Supports elevation token for step-up authentication
 *
 * @param storeId - UUID of the store
 * @param params - Optional query parameters for filtering/pagination
 * @param options - Optional elevation token for step-up auth
 * @returns Paginated sync logs
 * @throws ApiError on server errors
 */
async function getPOSSyncLogs(
  storeId: string,
  params?: POSSyncLogsQuery,
  options?: ElevatedRequestOptions,
): Promise<POSSyncLogsResponse> {
  // SEC-014: INPUT_VALIDATION - Validate UUID format before API call
  if (!isValidUUID(storeId)) {
    throw new ApiError("Invalid store ID format", 400, "INVALID_STORE_ID");
  }

  // Build query string from params
  const queryParams = new URLSearchParams();
  if (params?.limit !== undefined) {
    queryParams.set("limit", params.limit.toString());
  }
  if (params?.offset !== undefined) {
    queryParams.set("offset", params.offset.toString());
  }
  if (params?.status) {
    queryParams.set("status", params.status);
  }
  if (params?.from_date) {
    queryParams.set("from_date", params.from_date);
  }
  if (params?.to_date) {
    queryParams.set("to_date", params.to_date);
  }

  const queryString = queryParams.toString();
  const url = `/api/stores/${storeId}/pos-integration/logs${queryString ? `?${queryString}` : ""}`;

  const response = await apiClient.get<POSSyncLogsResponse>(url, {
    headers: buildElevatedHeaders(options?.elevationToken),
  });
  return response.data;
}

// ============================================================================
// React Query Hooks
// ============================================================================

/**
 * Hook to fetch POS integration for a store
 *
 * SEC-010: AUTHZ - Automatically includes elevation token from context
 *
 * @param storeId - UUID of the store
 * @param options - Optional query options
 * @returns Query result with POS integration data (or null if not configured)
 *
 * @example
 * ```tsx
 * const { data: integration, isLoading, error } = usePOSIntegration(storeId);
 *
 * if (isLoading) return <Spinner />;
 * if (!integration) return <POSSetupWizard storeId={storeId} />;
 * return <ConfiguredStatusView integration={integration} />;
 * ```
 */
export function usePOSIntegration(
  storeId: string | undefined,
  options?: { enabled?: boolean },
) {
  const { getTokenForRequest } = useElevationToken();

  return useQuery({
    queryKey: posIntegrationKeys.detail(storeId || ""),
    queryFn: () => {
      const elevationToken = getTokenForRequest();
      return getPOSIntegration(storeId!, {
        elevationToken: elevationToken || undefined,
      });
    },
    enabled: options?.enabled !== false && !!storeId && isValidUUID(storeId),
    // Keep cached data fresh for 60 seconds
    staleTime: 60 * 1000,
    // Retry once on failure (except 401/403)
    retry: (failureCount, error) => {
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
        return false;
      }
      return failureCount < 1;
    },
  });
}

/**
 * Hook to create a new POS integration
 *
 * SEC-010: AUTHZ - Automatically includes elevation token from context
 *
 * @returns Mutation for creating POS integration
 *
 * @example
 * ```tsx
 * const createMutation = useCreatePOSIntegration();
 *
 * const handleSubmit = async (data: CreatePOSIntegrationRequest) => {
 *   try {
 *     await createMutation.mutateAsync({ storeId, data });
 *     toast.success("POS integration created!");
 *   } catch (error) {
 *     toast.error(error.message);
 *   }
 * };
 * ```
 */
export function useCreatePOSIntegration() {
  const queryClient = useQueryClient();
  const { getTokenForRequest } = useElevationToken();

  return useMutation({
    mutationFn: ({
      storeId,
      data,
    }: {
      storeId: string;
      data: CreatePOSIntegrationRequest;
    }) => {
      const elevationToken = getTokenForRequest();
      return createPOSIntegration(storeId, data, {
        elevationToken: elevationToken || undefined,
      });
    },
    onSuccess: (_, { storeId }) => {
      // Invalidate the POS integration query to refetch
      queryClient.invalidateQueries({
        queryKey: posIntegrationKeys.detail(storeId),
        refetchType: "all",
      });
    },
  });
}

/**
 * Hook to update an existing POS integration
 *
 * SEC-010: AUTHZ - Automatically includes elevation token from context
 *
 * @returns Mutation for updating POS integration
 *
 * @example
 * ```tsx
 * const updateMutation = useUpdatePOSIntegration();
 *
 * const handleToggleAutoSync = async (enabled: boolean) => {
 *   await updateMutation.mutateAsync({
 *     storeId,
 *     data: { sync_enabled: enabled }
 *   });
 * };
 * ```
 */
export function useUpdatePOSIntegration() {
  const queryClient = useQueryClient();
  const { getTokenForRequest } = useElevationToken();

  return useMutation({
    mutationFn: ({
      storeId,
      data,
    }: {
      storeId: string;
      data: UpdatePOSIntegrationRequest;
    }) => {
      const elevationToken = getTokenForRequest();
      return updatePOSIntegration(storeId, data, {
        elevationToken: elevationToken || undefined,
      });
    },
    onSuccess: (_, { storeId }) => {
      // Invalidate to refetch updated data
      queryClient.invalidateQueries({
        queryKey: posIntegrationKeys.detail(storeId),
        refetchType: "all",
      });
    },
  });
}

/**
 * Hook to delete (deactivate) a POS integration
 *
 * SEC-010: AUTHZ - Automatically includes elevation token from context
 *
 * @returns Mutation for deleting POS integration
 *
 * @example
 * ```tsx
 * const deleteMutation = useDeletePOSIntegration();
 *
 * const handleDelete = async () => {
 *   if (confirm("Are you sure?")) {
 *     await deleteMutation.mutateAsync({ storeId });
 *   }
 * };
 * ```
 */
export function useDeletePOSIntegration() {
  const queryClient = useQueryClient();
  const { getTokenForRequest } = useElevationToken();

  return useMutation({
    mutationFn: ({ storeId }: { storeId: string }) => {
      const elevationToken = getTokenForRequest();
      return deletePOSIntegration(storeId, {
        elevationToken: elevationToken || undefined,
      });
    },
    onSuccess: (_, { storeId }) => {
      // Invalidate all POS integration queries for this store
      queryClient.invalidateQueries({
        queryKey: posIntegrationKeys.detail(storeId),
        refetchType: "all",
      });
      // Also invalidate sync logs
      queryClient.invalidateQueries({
        queryKey: posIntegrationKeys.logsList(storeId),
        refetchType: "all",
      });
    },
  });
}

/**
 * Hook to test POS connection
 *
 * SEC-010: AUTHZ - Automatically includes elevation token from context
 *
 * @returns Mutation for testing connection
 *
 * @example
 * ```tsx
 * const testMutation = useTestPOSConnection();
 *
 * const handleTest = async () => {
 *   const result = await testMutation.mutateAsync({
 *     storeId,
 *     config: { host: "192.168.1.100", port: 8080, use_ssl: true }
 *   });
 *   if (result.success) {
 *     setConnectionTested(true);
 *   }
 * };
 * ```
 */
export function useTestPOSConnection() {
  const { getTokenForRequest } = useElevationToken();

  return useMutation({
    mutationFn: ({
      storeId,
      config,
    }: {
      storeId: string;
      config?: Partial<CreatePOSIntegrationRequest>;
    }) => {
      const elevationToken = getTokenForRequest();
      return testPOSConnection(storeId, config, {
        elevationToken: elevationToken || undefined,
      });
    },
  });
}

/**
 * Hook to trigger a manual POS sync
 *
 * SEC-010: AUTHZ - Automatically includes elevation token from context
 *
 * @returns Mutation for triggering sync
 *
 * @example
 * ```tsx
 * const syncMutation = useTriggerPOSSync();
 *
 * const handleSyncNow = async () => {
 *   const result = await syncMutation.mutateAsync({ storeId });
 *   if (result.success) {
 *     toast.success(`Synced ${result.data.departments?.received || 0} departments`);
 *   }
 * };
 * ```
 */
export function useTriggerPOSSync() {
  const queryClient = useQueryClient();
  const { getTokenForRequest } = useElevationToken();

  return useMutation({
    mutationFn: ({
      storeId,
      options,
    }: {
      storeId: string;
      options?: TriggerSyncOptions;
    }) => {
      const elevationToken = getTokenForRequest();
      return triggerPOSSync(storeId, options, {
        elevationToken: elevationToken || undefined,
      });
    },
    onSuccess: (_, { storeId }) => {
      // Invalidate integration to get updated last_sync_at
      queryClient.invalidateQueries({
        queryKey: posIntegrationKeys.detail(storeId),
        refetchType: "all",
      });
      // Invalidate sync logs to show new log entry
      queryClient.invalidateQueries({
        queryKey: posIntegrationKeys.logsList(storeId),
        refetchType: "all",
      });
    },
  });
}

/**
 * Hook to fetch POS sync logs
 *
 * SEC-010: AUTHZ - Automatically includes elevation token from context
 *
 * @param storeId - UUID of the store
 * @param params - Optional query parameters for filtering/pagination
 * @param options - Optional query options
 * @returns Query result with paginated sync logs
 *
 * @example
 * ```tsx
 * const { data, isLoading, fetchNextPage } = usePOSSyncLogs(storeId, {
 *   limit: 10,
 *   status: "FAILED"
 * });
 *
 * if (isLoading) return <Spinner />;
 * return (
 *   <ul>
 *     {data?.data.map(log => <SyncLogEntry key={log.sync_log_id} log={log} />)}
 *   </ul>
 * );
 * ```
 */
export function usePOSSyncLogs(
  storeId: string | undefined,
  params?: POSSyncLogsQuery,
  options?: { enabled?: boolean },
) {
  const { getTokenForRequest } = useElevationToken();

  return useQuery({
    queryKey: posIntegrationKeys.logsWithParams(storeId || "", params),
    queryFn: () => {
      const elevationToken = getTokenForRequest();
      return getPOSSyncLogs(storeId!, params, {
        elevationToken: elevationToken || undefined,
      });
    },
    enabled: options?.enabled !== false && !!storeId && isValidUUID(storeId),
    // Sync logs can be stale for longer
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

// ============================================================================
// Utility Exports
// ============================================================================

/**
 * Re-export ApiError for error handling in components
 */
export { ApiError };

/**
 * Check if an error is an ApiError
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Get user-friendly error message from any error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected error occurred";
}
