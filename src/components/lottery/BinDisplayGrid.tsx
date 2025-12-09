"use client";

/**
 * Bin Display Grid Component
 * Displays lottery bins in a responsive grid with pack information
 *
 * Story 6.13: Lottery Database Enhancements & Bin Management
 * AC #2: Bins displayed in configured order, showing Bin Name | Game | Start Number | Ending Number | Total Sold
 * AC #2: Responsive display (2-3 columns per row based on screen size)
 * AC #2: Data loads quickly with optimized queries
 */

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getBinDisplay, type BinDisplayItem } from "@/lib/api/lottery";

interface BinDisplayGridProps {
  storeId: string;
  /**
   * Polling interval in milliseconds for real-time updates
   * Set to 0 or undefined to disable polling
   * Default: 30000 (30 seconds)
   */
  pollingInterval?: number;
}

/**
 * BinDisplayGrid component
 * Displays bins in a responsive grid layout with pack information
 */
export function BinDisplayGrid({
  storeId,
  pollingInterval = 30000,
}: BinDisplayGridProps) {
  // Fetch bin display data with TanStack Query
  const {
    data: binDisplayData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["bin-display", storeId],
    queryFn: async () => {
      const response = await getBinDisplay(storeId);
      if (!response.success) {
        throw new Error(response.error || "Failed to fetch bin display data");
      }
      return response.data;
    },
    enabled: !!storeId,
    // Real-time updates via polling
    refetchInterval: pollingInterval > 0 ? pollingInterval : false,
    refetchIntervalInBackground: true,
    // Stale time: consider data fresh for 10 seconds
    staleTime: 10000,
  });

  // Loading state
  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center p-8"
        data-testid="bin-display-loading"
      >
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading bin data...</span>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div
        className="rounded-lg border border-destructive p-8 text-center"
        data-testid="bin-display-error"
      >
        <p className="text-destructive">
          Failed to load bin display data:{" "}
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
      </div>
    );
  }

  // Empty state
  if (!binDisplayData || binDisplayData.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed p-8 text-center"
        data-testid="bin-display-empty"
      >
        <p className="text-muted-foreground">
          No bins configured for this store
        </p>
      </div>
    );
  }

  // Sort bins by display_order (ascending) to ensure consistent display
  const sortedBins = [...binDisplayData].sort(
    (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0),
  );

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
      data-testid="bin-display-grid"
      role="region"
      aria-label="Lottery bin display"
    >
      {sortedBins.map((bin) => (
        <BinCard key={bin.bin_id} bin={bin} />
      ))}
    </div>
  );
}

/**
 * BinCard component
 * Individual card displaying bin information
 */
function BinCard({ bin }: { bin: BinDisplayItem }) {
  // Format display values with proper escaping (XSS prevention)
  const binName = bin.bin_name || "Unnamed Bin";
  const gameName = bin.game_name || "No Game";
  const gameCode = bin.game_code || "N/A";
  const startNumber = bin.serial_start || "N/A";
  const endNumber = bin.serial_end || "N/A";
  const totalSold = bin.total_sold ?? 0;
  const price = bin.price ? `$${Number(bin.price).toFixed(2)}` : "N/A";

  // Determine if bin has an active pack
  const hasActivePack = bin.status === "ACTIVE" && bin.pack_number;

  return (
    <Card
      className="h-full"
      data-testid={`bin-card-${bin.bin_id}`}
      data-bin-id={bin.bin_id}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg font-semibold">{binName}</CardTitle>
          {hasActivePack && (
            <Badge variant="default" className="ml-2">
              Active
            </Badge>
          )}
        </div>
        {!hasActivePack && (
          <p className="text-sm text-muted-foreground mt-1">No active pack</p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Game Information */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Game:</span>
            <span className="font-medium">{gameName}</span>
          </div>
          {bin.game_code && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Code:</span>
              <span className="font-mono">{gameCode}</span>
            </div>
          )}
          {bin.price && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Price:</span>
              <span className="font-medium">{price}</span>
            </div>
          )}
        </div>

        {/* Pack Information (only show if pack exists) */}
        {hasActivePack && (
          <>
            <div className="border-t pt-3 space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Pack Number:</span>
                <span className="font-medium">{bin.pack_number}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Start Number:</span>
                <span className="font-mono">{startNumber}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">End Number:</span>
                <span className="font-mono">{endNumber}</span>
              </div>
            </div>

            {/* Total Sold */}
            <div className="border-t pt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  Total Sold:
                </span>
                <span className="text-lg font-bold">{totalSold}</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
