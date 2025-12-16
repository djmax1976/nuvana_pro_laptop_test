"use client";

/**
 * Bin List Display Component
 * Displays a list of existing lottery bins for a store in a simplified table format
 *
 * Features:
 * - Fetches bins from GET /api/lottery/bins/:storeId endpoint
 * - Displays columns: Bin#, Game Name, Dollar Amount, Pack Number, Activation Date
 * - Only shows bins with pack info (no status column needed - if shown, it's active)
 * - Uses React Query for data fetching with proper loading/error states
 * - Supports empty state when no bins exist
 * - Includes test IDs for testing
 *
 * MCP Enterprise Best Practices Applied:
 * - Proper TypeScript types with JSDoc comments
 * - Error handling with user-friendly messages
 * - Accessibility attributes (ARIA labels, semantic HTML)
 * - Security: XSS prevention via React's automatic escaping
 */

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Bin data structure from API
 * Matches response from GET /api/lottery/bins/:storeId
 */
export interface BinItem {
  bin_id: string;
  store_id: string;
  name: string;
  location: string | null;
  display_order: number;
  is_active: boolean;
  current_pack?: {
    pack_id: string;
    pack_number: string;
    status: string;
    activated_at?: string | null;
    game?: {
      name: string;
      game_code: string;
      price: number | null;
    };
  } | null;
}

/**
 * API response wrapper
 */
interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

/**
 * Component props
 */
export interface BinListDisplayProps {
  /**
   * Store UUID to fetch bins for
   */
  storeId: string;
  /**
   * Display mode: 'table' only (grid removed for simplified design)
   * @default 'table'
   */
  displayMode?: "table";
  /**
   * Optional callback when data is loaded
   */
  onDataLoaded?: (bins: BinItem[]) => void;
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

/**
 * Fetch bins for a store from the API
 * GET /api/lottery/bins/:storeId
 *
 * @param storeId - Store UUID
 * @returns Promise resolving to array of bin items
 * @throws Error if API request fails
 */
async function fetchBins(storeId: string): Promise<BinItem[]> {
  const response = await fetch(`${API_BASE_URL}/api/lottery/bins/${storeId}`, {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({
      success: false,
      error: "Unknown error",
    }));
    const errorMessage =
      typeof errorData.error === "object"
        ? errorData.error.message
        : errorData.error || "Failed to fetch bins";
    throw new Error(errorMessage);
  }

  const result: ApiResponse<BinItem[]> = await response.json();
  if (!result.success) {
    throw new Error(result.error || "Failed to fetch bins");
  }

  return result.data;
}

/**
 * Format date for display
 * @param dateString - ISO date string
 * @returns Formatted date string or "N/A"
 */
function formatActivationDate(dateString?: string | null): string {
  if (!dateString) return "N/A";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "N/A";
  }
}

/**
 * BinListDisplay component
 * Displays existing bins for a store with simplified columns:
 * Bin#, Game Name, Dollar Amount, Pack Number, Activation Date
 *
 * @example
 * ```tsx
 * <BinListDisplay storeId={storeId} />
 * ```
 */
export function BinListDisplay({ storeId, onDataLoaded }: BinListDisplayProps) {
  const {
    data: bins,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["lottery-bins", storeId],
    queryFn: () => fetchBins(storeId),
    enabled: !!storeId,
    staleTime: 30000,
  });

  React.useEffect(() => {
    if (bins && onDataLoaded) {
      onDataLoaded(bins);
    }
  }, [bins, onDataLoaded]);

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center p-8"
        data-testid="bin-list-loading"
        role="status"
        aria-label="Loading bins"
      >
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading bins...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div
        className="rounded-lg border border-destructive bg-destructive/10 p-8 text-center"
        data-testid="bin-list-error"
        role="alert"
        aria-live="assertive"
      >
        <p className="text-destructive font-medium">Failed to load bins</p>
        <p className="text-sm text-destructive/80 mt-2">
          {error instanceof Error ? error.message : "Unknown error occurred"}
        </p>
      </div>
    );
  }

  if (!bins || bins.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed p-8 text-center"
        data-testid="bin-list-empty"
        role="status"
      >
        <p className="text-muted-foreground">
          No bins configured for this store
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Add a bin to get started with lottery management
        </p>
      </div>
    );
  }

  // Sort bins by display_order (ascending) and calculate bin number (1-indexed)
  const sortedBins = [...bins].sort(
    (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0),
  );

  return (
    <div
      className="rounded-md border overflow-x-auto"
      data-testid="bin-list-table"
      role="region"
      aria-label="Lottery bins table"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className="w-20">
              Bin #
            </TableHead>
            <TableHead scope="col">Game Name</TableHead>
            <TableHead scope="col" className="w-28 text-right">
              Amount
            </TableHead>
            <TableHead scope="col" className="w-32">
              Pack Number
            </TableHead>
            <TableHead scope="col" className="w-36">
              Activation Date
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedBins.map((bin, index) => {
            // Calculate bin number from display_order (0-indexed) + 1
            const binNumber = (bin.display_order ?? index) + 1;
            const hasPack = !!bin.current_pack;

            return (
              <TableRow
                key={bin.bin_id}
                data-testid={`bin-row-${bin.bin_id}`}
                data-bin-id={bin.bin_id}
                className={!hasPack ? "opacity-60" : ""}
              >
                {/* Bin Number */}
                <TableCell className="font-mono font-semibold text-primary">
                  {binNumber}
                </TableCell>

                {/* Game Name */}
                <TableCell className="font-medium">
                  {hasPack ? (
                    bin.current_pack?.game?.name || "Unknown Game"
                  ) : (
                    <span className="text-muted-foreground italic">
                      No pack assigned
                    </span>
                  )}
                </TableCell>

                {/* Dollar Amount */}
                <TableCell className="text-right font-medium">
                  {hasPack && bin.current_pack?.game?.price != null ? (
                    `$${Number(bin.current_pack.game.price).toFixed(2)}`
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </TableCell>

                {/* Pack Number */}
                <TableCell className="font-mono text-sm">
                  {hasPack ? (
                    bin.current_pack?.pack_number || "N/A"
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </TableCell>

                {/* Activation Date */}
                <TableCell className="text-sm">
                  {hasPack ? (
                    formatActivationDate(bin.current_pack?.activated_at)
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
