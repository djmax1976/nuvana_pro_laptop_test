"use client";

/**
 * Add Bin Modal Component for Client Dashboard
 * Dialog form for adding new lottery bins with pack activation in BATCH MODE
 *
 * This is the client owner version that does NOT require an active shift.
 * Owners can set up bins at any time.
 *
 * Based on Story 10.5 - Add Bin Functionality, adapted for client dashboard
 *
 * Features:
 * - Batch mode: Scan multiple packs, auto-assigns to bins sequentially
 * - Auto-add: Valid packs are automatically added to pending list (like PackReceptionForm)
 * - Auto-focus: Input field stays focused after each scan for continuous entry
 * - Default starting number: All packs start at ticket 0 (000)
 *
 * @requirements
 * - AC #2: Auto-assigned bin number (sequential from lowest available)
 * - AC #2: 24-digit serial input field with auto-focus
 * - AC #3: Pack validation (game lookup, pack status check)
 * - AC #4: Display pack info after valid scan (including pack number)
 * - AC #5: Batch create bins with pack activation
 *
 * MCP Guidance Applied:
 * - FORM_VALIDATION: Mirror backend validation client-side, sanitize all user input
 * - INPUT_VALIDATION: Define strict schemas with length, type, and format constraints
 * - XSS: React automatically escapes output, no manual sanitization needed for text inputs
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Trash2, X, Check, AlertTriangle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useMutation } from "@tanstack/react-query";
import { parseSerializedNumber } from "@/lib/utils/lottery-serial-parser";
import { useClientAuth } from "@/contexts/ClientAuthContext";
import { useToast } from "@/hooks/use-toast";

/**
 * Maximum bin number allowed (1-200 range)
 * This determines the upper limit for bin selection
 */
const MAX_BIN_NUMBER = 200;

/**
 * Default starting ticket number - all lottery packs start at 0
 */
const DEFAULT_STARTING_NUMBER = "000";

/**
 * Debounce delay for auto-validation (same as PackReceptionForm)
 */
const DEBOUNCE_DELAY_MS = 400;

/**
 * Pack validation result from API
 */
interface PackValidationResult {
  valid: boolean;
  error?: string;
  game?: {
    name: string;
    price: number;
  };
  pack?: {
    pack_id: string;
    pack_number: string;
    serial_start: string;
    serial_end: string;
  };
}

/**
 * Pending bin assignment (before batch submit)
 */
interface PendingBinAssignment {
  id: string; // Unique identifier for list key
  binNumber: number;
  packNumber: string;
  packId: string;
  gameName: string;
  gamePrice: number;
  serialStart: string;
  /** If true, will auto-deplete the previous pack in this bin */
  depletePrevious?: boolean;
  /** Pack number of the pack that will be depleted (for display) */
  previousPackNumber?: string;
  /** Game name of the pack that will be depleted (for display) */
  previousGameName?: string;
}

/**
 * Bin creation result
 */
interface BinWithPack {
  bin_id: string;
  name: string;
  location?: string;
  display_order: number;
  is_active: boolean;
  pack?: {
    pack_id: string;
    pack_number: string;
    game: {
      name: string;
      price: number;
    };
  };
}

/**
 * Information about an occupied bin for auto-depletion confirmation
 */
interface OccupiedBinInfo {
  binNumber: number;
  packNumber: string;
  gameName: string;
}

interface AddBinModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  /**
   * Array of bin numbers that are currently occupied (have an active pack)
   * Used to show warnings when selecting an occupied bin for auto-depletion
   */
  occupiedBinNumbers: number[];
  /**
   * Optional detailed info about occupied bins for auto-depletion warnings
   * Maps bin number to pack info (pack number, game name)
   */
  occupiedBinInfo?: Map<number, OccupiedBinInfo>;
  onBinCreated: (newBin: BinWithPack) => void;
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

/**
 * Validate pack for activation
 * Calls API to validate pack exists, status is RECEIVED, and returns game info
 */
async function validatePackForActivation(
  storeId: string,
  packNumber: string,
): Promise<PackValidationResult> {
  const response = await fetch(
    `${API_BASE_URL}/api/lottery/packs/validate-for-activation/${storeId}/${packNumber}`,
    {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({
      success: false,
      error: "Unknown error",
    }));
    const errorMessage =
      typeof errorData.error === "object"
        ? errorData.error.message
        : errorData.error || "Failed to validate pack";
    return {
      valid: false,
      error: errorMessage,
    };
  }

  const result = await response.json();
  return result.data || { valid: false, error: "Invalid response" };
}

/**
 * Create bin with pack activation (no shift required for client dashboard)
 * Creates bin, activates pack, and creates all required records in transaction
 * If deplete_previous is true, will auto-deplete any existing pack in the bin
 */
async function createBinWithPack(
  storeId: string,
  data: {
    bin_name: string;
    location?: string;
    display_order: number;
    pack_number: string;
    serial_start: string;
    activated_by: string;
    activated_shift_id?: string | null;
    deplete_previous?: boolean;
  },
): Promise<BinWithPack> {
  const response = await fetch(
    `${API_BASE_URL}/api/stores/${storeId}/lottery/bins/create-with-pack`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    },
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({
      success: false,
      error: "Unknown error",
    }));
    const errorMessage =
      typeof errorData.error === "object"
        ? errorData.error.message
        : errorData.error || "Failed to create bin";
    throw new Error(errorMessage);
  }

  const result = await response.json();
  return result.data.bin;
}

/**
 * Generate a unique ID for pending items
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * AddBinModal component for Client Dashboard
 * Modal for adding new bins with pack activation in BATCH MODE - NO SHIFT REQUIRED
 *
 * Flow (same as PackReceptionForm):
 * 1. User scans 24-digit barcode
 * 2. System auto-validates when 24 digits entered (with debounce)
 * 3. If valid, auto-adds to pending list with next available bin number
 * 4. Input clears and focuses for next scan
 * 5. User clicks "Add X Bins" to submit all at once
 *
 * MCP Guidance Applied:
 * - FORM_VALIDATION: Display validation errors clearly, disable submission until fields pass checks
 * - INPUT_VALIDATION: Apply length, type, and format constraints at the boundary
 * - XSS: React automatically escapes output, no manual sanitization needed for text inputs
 */
export function AddBinModal({
  open,
  onOpenChange,
  storeId,
  occupiedBinNumbers,
  occupiedBinInfo,
  onBinCreated,
}: AddBinModalProps) {
  const { user } = useClientAuth();
  const { toast } = useToast();
  const serialInputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // State
  const [serialInput, setSerialInput] = useState("");
  const [pendingAssignments, setPendingAssignments] = useState<
    PendingBinAssignment[]
  >([]);
  const [isValidating, setIsValidating] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculate available bin numbers (exclude already pending, but allow occupied with warning)
  const getAvailableBinNumbers = useCallback(() => {
    const pendingBinNumbers = new Set(
      pendingAssignments.map((p) => p.binNumber),
    );
    return Array.from({ length: MAX_BIN_NUMBER }, (_, i) => i + 1).filter(
      (num) => !pendingBinNumbers.has(num),
    );
  }, [pendingAssignments]);

  // Get the first available EMPTY bin number (prioritize empty bins for auto-assignment)
  const getFirstEmptyBinNumber = useCallback(() => {
    const pendingBinNumbers = new Set(
      pendingAssignments.map((p) => p.binNumber),
    );
    const occupiedSet = new Set(occupiedBinNumbers);
    for (let i = 1; i <= MAX_BIN_NUMBER; i++) {
      if (!occupiedSet.has(i) && !pendingBinNumbers.has(i)) {
        return i;
      }
    }
    return null; // All bins are occupied or pending
  }, [occupiedBinNumbers, pendingAssignments]);

  // Pack validation mutation
  const validatePackMutation = useMutation({
    mutationFn: (packNumber: string) =>
      validatePackForActivation(storeId, packNumber),
  });

  // Bin creation mutation
  const createBinMutation = useMutation({
    mutationFn: (data: {
      bin_name: string;
      location?: string;
      display_order: number;
      pack_number: string;
      serial_start: string;
      activated_by: string;
      activated_shift_id?: string | null;
      deplete_previous?: boolean;
    }) => createBinWithPack(storeId, data),
  });

  // Clear input and refocus for next entry
  const clearInputAndFocus = useCallback(() => {
    setSerialInput("");
    // Clear DOM value directly (handles scanner edge cases)
    if (serialInputRef.current) {
      serialInputRef.current.value = "";
    }
    // Immediately focus after clearing
    setTimeout(() => {
      serialInputRef.current?.focus();
    }, 50);
  }, []);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open) {
      setSerialInput("");
      setPendingAssignments([]);
      setSubmitError(null);
      setIsValidating(false);
      validatePackMutation.reset();
      createBinMutation.reset();
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
      // Focus input after dialog animation
      setTimeout(() => {
        serialInputRef.current?.focus();
      }, 150);
    } else {
      // Clear everything when dialog closes
      setSerialInput("");
      setPendingAssignments([]);
      setSubmitError(null);
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /**
   * Handle serial complete - validate and auto-add to pending list
   * Same flow as PackReceptionForm
   */
  const handleSerialComplete = useCallback(
    async (serial: string): Promise<void> => {
      // Validate format (client-side)
      if (!/^\d{24}$/.test(serial)) {
        return; // Not yet 24 digits
      }

      try {
        setIsValidating(true);

        // Parse serial client-side
        const parsed = parseSerializedNumber(serial);

        // Check if pack already exists in pending list (duplicate in same session)
        const existingInList = pendingAssignments.find(
          (p) => p.packNumber === parsed.pack_number,
        );
        if (existingInList) {
          toast({
            title: "Duplicate pack",
            description: "This pack is already in the pending list",
            variant: "destructive",
          });
          clearInputAndFocus();
          return;
        }

        // Validate pack via API
        const validationResult = await validatePackMutation.mutateAsync(
          parsed.pack_number,
        );

        if (!validationResult.valid) {
          toast({
            title: "Invalid pack",
            description: validationResult.error || "Pack validation failed",
            variant: "destructive",
          });
          clearInputAndFocus();
          return;
        }

        // Get next available empty bin number (prioritize empty bins)
        const nextEmptyBin = getFirstEmptyBinNumber();
        const availableBins = getAvailableBinNumbers();

        if (availableBins.length === 0) {
          toast({
            title: "No bins available",
            description: "All bin slots are pending assignment",
            variant: "destructive",
          });
          clearInputAndFocus();
          return;
        }

        // Use first empty bin if available, otherwise use first available (which may be occupied)
        const nextBinNumber = nextEmptyBin ?? availableBins[0];
        const isOccupied = occupiedBinNumbers.includes(nextBinNumber);
        const previousPackInfo =
          isOccupied && occupiedBinInfo?.get(nextBinNumber);

        // Auto-add to pending list (same as PackReceptionForm)
        const newAssignment: PendingBinAssignment = {
          id: generateId(),
          binNumber: nextBinNumber,
          packNumber: validationResult.pack!.pack_number,
          packId: validationResult.pack!.pack_id,
          gameName: validationResult.game!.name,
          gamePrice: validationResult.game!.price,
          serialStart: DEFAULT_STARTING_NUMBER,
          depletePrevious: isOccupied,
          previousPackNumber: previousPackInfo
            ? previousPackInfo.packNumber
            : undefined,
          previousGameName: previousPackInfo
            ? previousPackInfo.gameName
            : undefined,
        };

        // Add new assignment at TOP of list (newest first)
        setPendingAssignments((prev) => [newAssignment, ...prev]);

        // Show warning toast if assigning to an occupied bin
        if (isOccupied) {
          toast({
            title: "Bin occupied - Pack will be marked sold",
            description: previousPackInfo
              ? `Bin ${nextBinNumber} has Pack #${previousPackInfo.packNumber} (${previousPackInfo.gameName}). It will be marked as sold when you submit.`
              : `Bin ${nextBinNumber} already has a pack. It will be marked as sold when you submit.`,
          });
        }
        clearInputAndFocus();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to validate pack";
        toast({
          title: "Validation error",
          description: errorMessage,
          variant: "destructive",
        });
        clearInputAndFocus();
      } finally {
        setIsValidating(false);
      }
    },
    [
      pendingAssignments,
      toast,
      clearInputAndFocus,
      validatePackMutation,
      getAvailableBinNumbers,
      getFirstEmptyBinNumber,
      occupiedBinNumbers,
      occupiedBinInfo,
    ],
  );

  /**
   * Handle input change with debouncing (same as PackReceptionForm)
   */
  const handleSerialChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const cleanedValue = e.target.value.replace(/\D/g, "").slice(0, 24);
      setSerialInput(cleanedValue);

      // Clear existing debounce timer
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      // Set new debounce timer
      debounceTimer.current = setTimeout(() => {
        if (cleanedValue.length === 24) {
          handleSerialComplete(cleanedValue);
        }
      }, DEBOUNCE_DELAY_MS);
    },
    [handleSerialComplete],
  );

  // Handle removing item from pending list
  const handleRemoveFromPending = useCallback((id: string) => {
    setPendingAssignments((prev) => prev.filter((p) => p.id !== id));
    setTimeout(() => {
      serialInputRef.current?.focus();
    }, 50);
  }, []);

  // Handle changing bin number for a pending item
  const handleBinNumberChange = useCallback(
    (id: string, newBinNumber: number) => {
      const isOccupied = occupiedBinNumbers.includes(newBinNumber);
      const previousPackInfo = isOccupied && occupiedBinInfo?.get(newBinNumber);

      setPendingAssignments((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                binNumber: newBinNumber,
                depletePrevious: isOccupied,
                previousPackNumber: previousPackInfo
                  ? previousPackInfo.packNumber
                  : undefined,
                previousGameName: previousPackInfo
                  ? previousPackInfo.gameName
                  : undefined,
              }
            : p,
        ),
      );

      // Show warning if user changes to an occupied bin
      if (isOccupied) {
        toast({
          title: "Bin occupied - Pack will be marked sold",
          description: previousPackInfo
            ? `Bin ${newBinNumber} has Pack #${previousPackInfo.packNumber}. It will be marked as sold.`
            : `Bin ${newBinNumber} already has a pack. It will be marked as sold.`,
        });
      }
    },
    [occupiedBinNumbers, occupiedBinInfo, toast],
  );

  // Get available bin numbers for a specific pending item (includes its own current bin, allows occupied)
  const getAvailableBinsForItem = useCallback(
    (currentItemId: string) => {
      const otherPendingBinNumbers = new Set(
        pendingAssignments
          .filter((p) => p.id !== currentItemId)
          .map((p) => p.binNumber),
      );
      return Array.from({ length: MAX_BIN_NUMBER }, (_, i) => i + 1).filter(
        (num) => !otherPendingBinNumbers.has(num),
      );
    },
    [pendingAssignments],
  );

  // Handle batch submit
  const handleBatchSubmit = async () => {
    if (pendingAssignments.length === 0) {
      setSubmitError("No bins to add. Scan a pack first.");
      return;
    }

    if (!user?.id) {
      setSubmitError("User authentication required");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Create all bins in sequence (could be parallelized but sequential is safer)
      for (const assignment of pendingAssignments) {
        const newBin = await createBinMutation.mutateAsync({
          bin_name: `Bin ${assignment.binNumber}`,
          display_order: assignment.binNumber - 1, // display_order is 0-indexed
          pack_number: assignment.packNumber,
          serial_start: assignment.serialStart,
          activated_by: user.id,
          activated_shift_id: null, // No shift required for client dashboard
          deplete_previous: assignment.depletePrevious, // Auto-deplete if replacing existing pack
        });

        // Notify parent for each created bin
        onBinCreated(newBin);
      }

      // Success - close modal
      onOpenChange(false);
    } catch (error) {
      if (error instanceof Error) {
        setSubmitError(error.message);
      } else {
        setSubmitError("Failed to create bins. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    setPendingAssignments([]);
    setSerialInput("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto"
        data-testid="add-bin-modal-client"
      >
        <DialogHeader>
          <DialogTitle>Add Bins</DialogTitle>
          <DialogDescription>
            Scan pack barcodes to create bins and activate packs. Packs are
            automatically added to the list when scanned.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Error message */}
          {submitError && (
            <Alert variant="destructive">
              <AlertDescription data-testid="error-message">
                {submitError}
              </AlertDescription>
            </Alert>
          )}

          {/* Serial Input Field */}
          <div className="space-y-2">
            <Label htmlFor="serial-input">Pack Serial Number (24 digits)</Label>
            <Input
              ref={serialInputRef}
              id="serial-input"
              type="text"
              value={serialInput}
              onChange={handleSerialChange}
              placeholder="Scan or enter 24-digit barcode"
              autoComplete="off"
              disabled={isSubmitting || isValidating}
              maxLength={24}
              data-testid="pack-serial-input"
              className="font-mono"
              aria-label="Enter 24-digit serialized number"
            />
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                {serialInput.length}/24 digits
              </p>
              {isValidating && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Validating...
                </p>
              )}
            </div>
          </div>

          {/* Pending Assignments List */}
          {pendingAssignments.length > 0 && (
            <div className="space-y-2" data-testid="pending-assignments-list">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Bins Ready to Add ({pendingAssignments.length})
                </Label>
              </div>
              <div className="border rounded-md divide-y max-h-60 overflow-y-auto">
                {pendingAssignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className={`p-3 flex items-center gap-3 hover:bg-muted/50 ${
                      assignment.depletePrevious
                        ? "bg-amber-50 dark:bg-amber-950/20"
                        : ""
                    }`}
                    data-testid={`pending-item-${assignment.id}`}
                  >
                    {/* 1. BIN DROPDOWN (first) */}
                    <Select
                      value={String(assignment.binNumber)}
                      onValueChange={(value) =>
                        handleBinNumberChange(
                          assignment.id,
                          parseInt(value, 10),
                        )
                      }
                      disabled={isSubmitting}
                    >
                      <SelectTrigger
                        className={`w-24 ${
                          assignment.depletePrevious ? "border-amber-500" : ""
                        }`}
                        data-testid={`bin-select-${assignment.id}`}
                      >
                        <SelectValue placeholder="Bin" />
                      </SelectTrigger>
                      <SelectContent>
                        {getAvailableBinsForItem(assignment.id).map(
                          (binNum) => {
                            const isOccupied =
                              occupiedBinNumbers.includes(binNum);
                            return (
                              <SelectItem key={binNum} value={String(binNum)}>
                                Bin {binNum} {isOccupied ? "(Occupied)" : ""}
                              </SelectItem>
                            );
                          },
                        )}
                      </SelectContent>
                    </Select>

                    {/* 2. GAME NAME (second) */}
                    <div className="flex-1 min-w-0">
                      <span
                        className="font-medium truncate block"
                        data-testid="pending-game-name"
                      >
                        {assignment.gameName}
                      </span>
                      {/* Show warning about previous pack being depleted */}
                      {assignment.depletePrevious && (
                        <span className="text-xs text-amber-600 dark:text-amber-500 truncate block">
                          Replaces:{" "}
                          {assignment.previousPackNumber || "existing pack"}
                        </span>
                      )}
                    </div>

                    {/* 3. DOLLAR AMOUNT (third) */}
                    <span
                      className="text-sm font-medium"
                      data-testid="pending-price"
                    >
                      ${assignment.gamePrice.toFixed(2)}
                    </span>

                    {/* 4. STATUS ICON - Warning for auto-deplete, Green check otherwise */}
                    {assignment.depletePrevious ? (
                      <AlertTriangle
                        className="h-5 w-5 text-amber-500"
                        data-testid="deplete-warning-icon"
                        aria-label="Will mark existing pack as sold"
                      />
                    ) : (
                      <Check
                        className="h-5 w-5 text-green-500"
                        data-testid="valid-check-icon"
                      />
                    )}

                    {/* Remove button */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveFromPending(assignment.id)}
                      disabled={isSubmitting}
                      data-testid={`remove-pending-${assignment.id}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isSubmitting}
            data-testid="add-bin-cancel-button"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleBatchSubmit}
            disabled={isSubmitting || pendingAssignments.length === 0}
            data-testid="add-bin-submit-button"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add{" "}
            {pendingAssignments.length > 0
              ? `${pendingAssignments.length} `
              : ""}
            Bin{pendingAssignments.length !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
