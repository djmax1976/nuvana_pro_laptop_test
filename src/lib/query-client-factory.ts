/**
 * QueryClient Factory
 *
 * Creates properly configured QueryClient instances with:
 * - Global 401 error handling
 * - Consistent retry behavior
 * - Session expiration detection
 *
 * Use this factory instead of directly instantiating QueryClient
 * to ensure consistent behavior across all dashboards.
 */

import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";
import {
  handleUnauthorizedError,
  isUnauthorizedError,
} from "@/lib/auth-error-handler";

export interface CreateQueryClientOptions {
  /**
   * How long data stays fresh before being considered stale (ms)
   * @default 30000 (30 seconds)
   */
  staleTime?: number;

  /**
   * How long unused data stays in cache (ms)
   * @default 300000 (5 minutes)
   */
  gcTime?: number;

  /**
   * Maximum retry attempts for failed queries
   * @default 1
   */
  maxRetries?: number;
}

/**
 * Creates a QueryClient with proper 401/session expiration handling
 *
 * This ensures that when any API call returns a 401:
 * 1. The error is detected via isUnauthorizedError()
 * 2. Session data is cleared from localStorage
 * 3. Other tabs are notified via BroadcastChannel
 * 4. User is redirected to /login?reason=session_expired
 *
 * @param options - Optional configuration overrides
 * @returns Configured QueryClient instance
 */
export function createQueryClient(
  options: CreateQueryClientOptions = {},
): QueryClient {
  const { staleTime = 30000, gcTime = 300000, maxRetries = 1 } = options;

  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        // Handle 401 errors globally for queries
        if (isUnauthorizedError(error)) {
          handleUnauthorizedError();
        }
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        // Handle 401 errors globally for mutations
        if (isUnauthorizedError(error)) {
          handleUnauthorizedError();
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime,
        gcTime,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
        retry: (failureCount, error) => {
          // Don't retry on 401 errors - redirect to login instead
          if (isUnauthorizedError(error)) return false;
          // Retry other errors up to maxRetries
          return failureCount < maxRetries;
        },
      },
      mutations: {
        retry: (failureCount, error) => {
          // Don't retry on 401 errors
          if (isUnauthorizedError(error)) return false;
          return failureCount < maxRetries;
        },
      },
    },
  });
}
