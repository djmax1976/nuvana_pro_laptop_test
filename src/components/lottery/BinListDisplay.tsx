"use client";

/**
 * Bin List Display Component
 * Displays a list of existing lottery bins for a store in a simplified table format
 *
 * Features:
 * - Fetches bins from GET /api/lottery/bins/:storeId endpoint
 * - Displays columns: Bin#, Game Name, Dollar Amount, Pack Number, Activation Date, Actions
 * - Delete functionality with confirmation dialog (soft delete)
 * - Newest bins appear at TOP of list (sorted by display_order DESC)
 * - Uses React Query for data fetching with proper loading/error states
 * - Supports empty state when no bins exist
 * - Includes test IDs for testing
 * - Uses centralized timezone management via useDateFormat hook
 *
 * MCP Enterprise Best Practices Applied:
 * - FE-001: STATE_MANAGEMENT - Centralized timezone from StoreContext via useDateFormat
 * - FE-002: FORM_VALIDATION - Strict type checking on props and UUID validation
 * - SEC-004: XSS - React auto-escapes all output, no dangerouslySetInnerHTML
 * - SEC-014: INPUT_VALIDATION - Type-safe props with TypeScript interfaces
 * - API-003: ERROR_HANDLING - Graceful degradation with safe fallbacks
 * - Proper TypeScript types with JSDoc comments
 * - Error handling with user-friendly messages
 * - Accessibility attributes (ARIA labels, semantic HTML)
 * - Optimistic UI updates with rollback on error
 *
 * Story 6.13: Lottery Database Enhancements & Bin Management
 */

import React, { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { deleteBin } from "@/lib/api/lottery";
import { useDateFormat } from "@/hooks/useDateFormat";

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
 * State for delete confirmation dialog
 */
interface DeleteDialogState {
  isOpen: boolean;
  binId: string | null;
  binName: string;
  binNumber: number;
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
 * Create a timezone-aware date formatter for activation dates
 * Returns a function that formats ISO date strings using the store's timezone
 *
 * MCP Guidance Applied:
 * - FE-001: STATE_MANAGEMENT - Uses centralized timezone from StoreContext
 * - SEC-014: INPUT_VALIDATION - Validates input before processing
 * - API-003: ERROR_HANDLING - Returns safe fallback on error
 * - SEC-004: XSS - Only uses safe formatting methods, no HTML injection possible
 *
 * @param formatDate - Format function from useDateFormat hook
 * @returns Formatter function for ISO date strings
 */
function createActivationDateFormatter(
  formatDate: (date: Date | string) => string,
): (dateString?: string | null) => string {
  return (dateString?: string | null): string => {
    // Input validation - check for null/undefined/empty
    if (!dateString || typeof dateString !== "string") {
      return "N/A";
    }

    // Trim whitespace to prevent parsing issues
    const trimmedInput = dateString.trim();
    if (trimmedInput.length === 0) {
      return "N/A";
    }

    try {
      const dateObj = new Date(trimmedInput);

      // Validate date is valid (not NaN)
      // Using Number.isNaN for strict NaN check (SEC-014)
      if (Number.isNaN(dateObj.getTime())) {
        return "N/A";
      }

      // Validate date is within reasonable range (not year 0 or far future)
      const year = dateObj.getFullYear();
      if (year < 2000 || year > 2100) {
        return "N/A";
      }

      // Use store timezone for formatting via useDateFormat hook
      return formatDate(trimmedInput);
    } catch {
      // Catch any parsing errors and return safe fallback
      // MCP: API-003 ERROR_HANDLING - Graceful degradation
      return "N/A";
    }
  };
}

/**
 * Initial state for delete dialog
 */
const INITIAL_DELETE_DIALOG_STATE: DeleteDialogState = {
  isOpen: false,
  binId: null,
  binName: "",
  binNumber: 0,
};

/**
 * BinListDisplay component
 * Displays existing bins for a store with simplified columns:
 * Bin#, Game Name, Dollar Amount, Pack Number, Activation Date, Actions
 *
 * @example
 * ```tsx
 * <BinListDisplay storeId={storeId} />
 * ```
 */
export function BinListDisplay({ storeId, onDataLoaded }: BinListDisplayProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ========================================================================
  // TIMEZONE-AWARE DATE FORMATTING
  // MCP: FE-001 STATE_MANAGEMENT - Centralized timezone from StoreContext
  // ========================================================================
  const { formatDate } = useDateFormat();

  // Create memoized date formatter with store timezone
  // MCP: FE-001 STATE_MANAGEMENT - Memoized formatter for performance
  const formatActivationDate = useMemo(
    () => createActivationDateFormatter(formatDate),
    [formatDate],
  );

  // Delete confirmation dialog state
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>(
    INITIAL_DELETE_DIALOG_STATE,
  );

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

  // Delete mutation with optimistic updates
  const deleteMutation = useMutation({
    mutationFn: async (binId: string) => {
      const result = await deleteBin(binId);
      if (!result.success) {
        throw new Error("Failed to delete bin");
      }
      return result;
    },
    onMutate: async (binId: string) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["lottery-bins", storeId] });

      // Snapshot previous value for rollback
      const previousBins = queryClient.getQueryData<BinItem[]>([
        "lottery-bins",
        storeId,
      ]);

      // Optimistically remove the bin from cache
      if (previousBins) {
        queryClient.setQueryData<BinItem[]>(
          ["lottery-bins", storeId],
          previousBins.filter((bin) => bin.bin_id !== binId),
        );
      }

      return { previousBins };
    },
    onError: (_error, _binId, context) => {
      // Rollback on error
      if (context?.previousBins) {
        queryClient.setQueryData(
          ["lottery-bins", storeId],
          context.previousBins,
        );
      }
      toast({
        title: "Error",
        description: "Failed to delete bin. Please try again.",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({
        title: "Bin Deleted",
        description: "The bin has been successfully removed.",
      });
    },
    onSettled: () => {
      // Refetch to ensure consistency with server
      queryClient.invalidateQueries({ queryKey: ["lottery-bins", storeId] });
    },
  });

  /**
   * Open delete confirmation dialog
   * Validates bin data before opening
   */
  const handleDeleteClick = useCallback(
    (bin: BinItem, binNumber: number) => {
      // Validate bin_id is a valid UUID format
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!bin.bin_id || !uuidRegex.test(bin.bin_id)) {
        toast({
          title: "Error",
          description: "Invalid bin identifier.",
          variant: "destructive",
        });
        return;
      }

      setDeleteDialog({
        isOpen: true,
        binId: bin.bin_id,
        binName: bin.name,
        binNumber,
      });
    },
    [toast],
  );

  /**
   * Confirm and execute bin deletion
   */
  const handleDeleteConfirm = useCallback(() => {
    if (deleteDialog.binId) {
      deleteMutation.mutate(deleteDialog.binId);
    }
    setDeleteDialog(INITIAL_DELETE_DIALOG_STATE);
  }, [deleteDialog.binId, deleteMutation]);

  /**
   * Cancel delete operation
   */
  const handleDeleteCancel = useCallback(() => {
    setDeleteDialog(INITIAL_DELETE_DIALOG_STATE);
  }, []);

  // Notify parent when data loads
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

  // Sort bins by display_order ascending (Bin 1, 2, 3...)
  const sortedBins = [...bins].sort(
    (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0),
  );

  return (
    <>
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
              <TableHead scope="col" className="w-20 text-center">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedBins.map((bin) => {
              // Calculate bin number from display_order (0-indexed) + 1
              const binNumber = (bin.display_order ?? 0) + 1;
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

                  {/* Delete Action */}
                  <TableCell className="text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteClick(bin, binNumber)}
                      disabled={deleteMutation.isPending}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      aria-label={`Delete bin ${binNumber}`}
                      data-testid={`delete-bin-${bin.bin_id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteDialog.isOpen}
        onOpenChange={(open) => {
          if (!open) handleDeleteCancel();
        }}
      >
        <AlertDialogContent data-testid="delete-bin-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete Bin {deleteDialog.binNumber}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this bin? This action will remove
              the bin from the configuration. Any active pack in this bin will
              need to be reassigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={handleDeleteCancel}
              data-testid="delete-bin-cancel"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="delete-bin-confirm"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
