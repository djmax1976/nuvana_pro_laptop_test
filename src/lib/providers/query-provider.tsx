"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/**
 * QueryClient provider component
 * Wraps the app with TanStack Query for server state management
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute - data stays fresh for 1 min
            gcTime: 5 * 60 * 1000, // 5 minutes - cache persists for 5 min (formerly cacheTime)
            refetchOnWindowFocus: false, // Don't refetch on window focus
            refetchOnMount: false, // Don't refetch on component mount if data is fresh
            refetchOnReconnect: false, // Don't refetch on reconnect
            retry: 1, // Only retry once on failure
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
