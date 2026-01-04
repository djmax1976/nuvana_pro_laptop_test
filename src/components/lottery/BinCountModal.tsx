"use client";

/**
 * Bin Count Modal Component
 *
 * A modal dialog for store owners to configure the number of lottery bins
 * for their store. Displays current bin status and validates changes
 * before applying.
 *
 * Story: Lottery Bin Count Configuration
 *
 * @enterprise-standards
 * - FE-002: FORM_VALIDATION - Client-side validation matching backend
 * - SEC-014: INPUT_VALIDATION - Range constraints enforced
 * - A11Y-001: KEYBOARD - Full keyboard navigation support
 */

import { useState, useEffect, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  getLotteryBinCount,
  updateLotteryBinCount,
  validateLotteryBinCountChange,
  type LotteryBinCountResponse,
  type BinCountValidationResult,
} from "@/lib/api/lottery";

// Constants matching backend schema
const MIN_BIN_COUNT = 0;
const MAX_BIN_COUNT = 200;

interface BinCountModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Callback when the modal open state changes */
  onOpenChange: (open: boolean) => void;
  /** Store UUID */
  storeId: string;
  /** Store name for display */
  storeName?: string;
  /** Callback when bin count is successfully updated */
  onSuccess?: () => void;
}

/**
 * Modal component for configuring lottery bin count
 */
export function BinCountModal({
  open,
  onOpenChange,
  storeId,
  storeName,
  onSuccess,
}: BinCountModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Local state for input value
  const [inputValue, setInputValue] = useState<string>("");
  const [validationResult, setValidationResult] =
    useState<BinCountValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Fetch current bin count
  const {
    data: binCountData,
    isLoading: isLoadingBinCount,
    error: binCountError,
  } = useQuery<{ success: boolean; data: LotteryBinCountResponse }>({
    queryKey: ["lottery-bin-count", storeId],
    queryFn: () => getLotteryBinCount(storeId),
    enabled: open && !!storeId,
    staleTime: 0, // Always refetch when modal opens
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (newCount: number) => updateLotteryBinCount(storeId, newCount),
    onSuccess: (response) => {
      if (response.success) {
        const result = response.data;
        let message = `Bin count updated to ${result.new_count}.`;
        if (result.bins_created > 0) {
          message += ` ${result.bins_created} bin(s) created.`;
        }
        if (result.bins_reactivated > 0) {
          message += ` ${result.bins_reactivated} bin(s) reactivated.`;
        }
        if (result.bins_deactivated > 0) {
          message += ` ${result.bins_deactivated} bin(s) removed.`;
        }

        toast({
          title: "Bin Count Updated",
          description: message,
        });

        // Invalidate queries to refresh data
        queryClient.invalidateQueries({
          queryKey: ["lottery-bin-count", storeId],
        });
        queryClient.invalidateQueries({
          queryKey: ["lottery-bins", storeId],
        });

        onOpenChange(false);
        onSuccess?.();
      }
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.error?.message ||
        error?.message ||
        "Failed to update bin count";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    },
  });

  // Initialize input value when data loads
  useEffect(() => {
    if (binCountData?.data && open) {
      const currentCount =
        binCountData.data.bin_count ?? binCountData.data.active_bins;
      setInputValue(currentCount.toString());
      setValidationResult(null);
    }
  }, [binCountData?.data, open]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setValidationResult(null);
      setIsValidating(false);
    }
  }, [open]);

  // Validate the proposed change
  const validateChange = useCallback(
    async (newCount: number) => {
      if (newCount < MIN_BIN_COUNT || newCount > MAX_BIN_COUNT) {
        setValidationResult(null);
        return;
      }

      setIsValidating(true);
      try {
        const response = await validateLotteryBinCountChange(storeId, newCount);
        if (response.success) {
          setValidationResult(response.data);
        }
      } catch (error) {
        console.error("Validation error:", error);
        setValidationResult(null);
      } finally {
        setIsValidating(false);
      }
    },
    [storeId],
  );

  // Handle input change with validation
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // Only allow digits
    if (value !== "" && !/^\d+$/.test(value)) {
      return;
    }

    setInputValue(value);

    // Validate after a short delay
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue)) {
      validateChange(numValue);
    } else {
      setValidationResult(null);
    }
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const numValue = parseInt(inputValue, 10);
    if (
      isNaN(numValue) ||
      numValue < MIN_BIN_COUNT ||
      numValue > MAX_BIN_COUNT
    ) {
      toast({
        title: "Invalid Input",
        description: `Please enter a number between ${MIN_BIN_COUNT} and ${MAX_BIN_COUNT}.`,
        variant: "destructive",
      });
      return;
    }

    if (validationResult && !validationResult.allowed) {
      toast({
        title: "Cannot Apply Change",
        description: validationResult.message,
        variant: "destructive",
      });
      return;
    }

    updateMutation.mutate(numValue);
  };

  // Determine if save button should be disabled
  const currentCount =
    binCountData?.data?.bin_count ?? binCountData?.data?.active_bins ?? 0;
  const numValue = parseInt(inputValue, 10);
  const hasChanges = !isNaN(numValue) && numValue !== currentCount;
  const isValidValue =
    !isNaN(numValue) && numValue >= MIN_BIN_COUNT && numValue <= MAX_BIN_COUNT;
  const canSave =
    hasChanges &&
    isValidValue &&
    !isValidating &&
    !updateMutation.isPending &&
    (validationResult === null || validationResult.allowed);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" data-testid="bin-count-modal">
        <DialogHeader>
          <DialogTitle>Configure Lottery Bins</DialogTitle>
          <DialogDescription>
            Set the number of lottery bins for {storeName || "this store"}.
            Changes will create or remove bin slots automatically.
          </DialogDescription>
        </DialogHeader>

        {isLoadingBinCount ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : binCountError ? (
          <div className="py-4 text-center text-destructive">
            Failed to load bin count. Please try again.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              {/* Current Statistics */}
              <div className="rounded-lg border bg-muted/50 p-3">
                <div className="text-sm text-muted-foreground mb-2">
                  Current Status
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-lg font-semibold">
                      {binCountData?.data?.active_bins ?? 0}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Active Bins
                    </div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold">
                      {binCountData?.data?.bins_with_packs ?? 0}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      With Packs
                    </div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold">
                      {binCountData?.data?.empty_bins ?? 0}
                    </div>
                    <div className="text-xs text-muted-foreground">Empty</div>
                  </div>
                </div>
              </div>

              {/* Input Field */}
              <div className="grid gap-2">
                <Label htmlFor="bin-count">Number of Bins</Label>
                <Input
                  id="bin-count"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={inputValue}
                  onChange={handleInputChange}
                  placeholder={`${MIN_BIN_COUNT}-${MAX_BIN_COUNT}`}
                  className="text-center text-lg font-mono"
                  data-testid="bin-count-input"
                  autoComplete="off"
                  disabled={updateMutation.isPending}
                />
                <p className="text-xs text-muted-foreground">
                  Enter a number between {MIN_BIN_COUNT} and {MAX_BIN_COUNT}
                </p>
              </div>

              {/* Validation Result */}
              {isValidating && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking...
                </div>
              )}

              {validationResult && !isValidating && (
                <div
                  className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                    validationResult.allowed
                      ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
                      : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                  }`}
                  data-testid="validation-result"
                >
                  {validationResult.allowed ? (
                    <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  )}
                  <div>
                    <div className="font-medium">
                      {validationResult.allowed
                        ? "Ready to apply"
                        : "Cannot apply"}
                    </div>
                    <div className="mt-1">{validationResult.message}</div>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={updateMutation.isPending}
                data-testid="bin-count-cancel-button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!canSave}
                data-testid="bin-count-save-button"
              >
                {updateMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
