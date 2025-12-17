"use client";

import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
  MutationCache,
} from "@tanstack/react-query";
import { useState, useEffect } from "react";

/**
 * Handle 401 errors globally - redirect to login
 * This catches expired sessions during any API call
 */
function handleUnauthorizedError() {
  // Only redirect if not already on login page
  if (
    typeof window !== "undefined" &&
    !window.location.pathname.includes("/login")
  ) {
    // Store current path for redirect after re-login
    try {
      sessionStorage.setItem("redirect_after_login", window.location.pathname);
    } catch {
      // Ignore storage errors
    }

    // Clear auth data
    try {
      localStorage.removeItem("auth_session");
      localStorage.removeItem("client_auth_session");
    } catch {
      // Ignore storage errors
    }

    // Broadcast to other tabs
    try {
      const channel = new BroadcastChannel("nuvana_session_sync");
      channel.postMessage({ type: "session_expired", reason: "api_401" });
      channel.close();
    } catch {
      // BroadcastChannel not supported
    }

    // Redirect to login with session expired reason
    window.location.href = "/login?reason=session_expired";
  }
}

/**
 * Check if an error is a 401 Unauthorized error
 */
function isUnauthorizedError(error: unknown): boolean {
  if (error && typeof error === "object") {
    // Check for various 401 error shapes
    if ("status" in error && error.status === 401) return true;
    if ("response" in error) {
      const response = (error as { response?: { status?: number } }).response;
      if (response?.status === 401) return true;
    }
    if ("message" in error) {
      const message = (error as { message?: string }).message;
      if (
        message?.includes("401") ||
        message?.toLowerCase().includes("unauthorized")
      ) {
        return true;
      }
    }
  }
  return false;
}

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

  // Listen for session expiration events from other sources (api-client, SessionExpirationGuard)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleSessionExpired = () => {
      // Clear all queries on session expiration
      queryClient.clear();
    };

    window.addEventListener("nuvana:session_expired", handleSessionExpired);
    return () => {
      window.removeEventListener(
        "nuvana:session_expired",
        handleSessionExpired,
      );
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
