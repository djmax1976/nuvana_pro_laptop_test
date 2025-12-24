"use client";

import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
  MutationCache,
} from "@tanstack/react-query";
import { useState, useEffect } from "react";
import {
  handleUnauthorizedError,
  isUnauthorizedError,
  SESSION_EXPIRED_EVENT,
} from "@/lib/auth-error-handler";

/**
 * QueryClient provider component
 * Wraps the app with TanStack Query for server state management
 *
 * Features:
 * - Global 401 error handling with automatic logout
 * - Cross-tab session synchronization
 * - Configurable caching and retry behavior
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
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
            staleTime: 60 * 1000, // 1 minute - data stays fresh for 1 min
            gcTime: 5 * 60 * 1000, // 5 minutes - cache persists for 5 min (formerly cacheTime)
            refetchOnWindowFocus: false, // Don't refetch on window focus
            refetchOnMount: false, // Don't refetch on component mount if data is fresh
            refetchOnReconnect: false, // Don't refetch on reconnect
            retry: (failureCount, error) => {
              // Don't retry on 401 errors
              if (isUnauthorizedError(error)) return false;
              // Only retry once for other errors
              return failureCount < 1;
            },
          },
          mutations: {
            retry: (failureCount, error) => {
              // Don't retry on 401 errors
              if (isUnauthorizedError(error)) return false;
              return failureCount < 1;
            },
          },
        },
      }),
  );

  // Listen for session expiration events from api-client
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleSessionExpired = () => {
      // Clear all queries on session expiration
      queryClient.clear();
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
