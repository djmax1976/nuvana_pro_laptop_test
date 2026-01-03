"use client";

/**
 * Unscanned Bin Warning Modal Component
 *
 * Compact dialog for handling bins that have not been scanned during day close.
 * Displays a simple table with checkbox to mark packs as sold out.
 *
 * Story: Lottery Day Close - Edge Case Handling
 *
 * @requirements
 * - Display warning when bins have no ending serial at day close
 * - Compact table layout: Bin #, Game, Price, Pack, Sold Out checkbox
 * - User marks sold out packs or returns to scan remaining tickets
 * - Maintain audit trail of user decisions
 *
 * MCP Guidance Applied:
 * - FE-002: FORM_VALIDATION - Track selections before proceeding
 * - SEC-014: INPUT_VALIDATION - Strict validation of user choices
 * - SEC-004: XSS - React auto-escapes all output
 * - FE-005: UI_SECURITY - No sensitive data exposed in DOM
 * - FE-001: STATE_MANAGEMENT - Secure state management with explicit types
 */

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Action types for unscanned bins
 * Each action has clear business meaning and audit implications
 */
export type UnscannedBinAction =
  | "SOLD_OUT" // Pack fully sold - ending = serial_end, mark DEPLETED
  | "RETURN_TO_SCAN"; // User wants to go back and scan/enter

/**
 * Decision record for a single bin
 * Used for audit trail and processing
 */
export interface BinDecision {
  bin_id: string;
  bin_number: number;
  pack_id: string;
  pack_number: string;
  game_name: string;
  game_price: number;
  starting_serial: string;
  serial_end: string;
  action: UnscannedBinAction;
  /** Computed ending serial based on action */
  ending_serial: string;
  /** Number of tickets sold (ending - starting) */
  tickets_sold: number;
  /** Total sales amount (tickets_sold × game_price) */
  sales_amount: number;
}

/**
 * Unscanned bin data passed to the modal
 */
export interface UnscannedBinInfo {
  bin_id: string;
  bin_number: number;
  pack_id: string;
  pack_number: string;
  game_name: string;
  game_price: number;
  starting_serial: string;
  serial_end: string;
  /**
   * Whether this is the pack's first period (affects ticket counting).
   *
   * Ticket counting formula (fencepost error prevention):
   * - true: tickets = closing - starting + 1 (new pack, starting serial is first ticket)
   * - false: tickets = closing - starting (continuing, starting serial was last sold ticket)
   */
  is_first_period: boolean;
}

/**
 * Modal result returned to parent component
 */
export interface UnscannedBinModalResult {
  /** User chose to return to scanning */
  returnToScan: boolean;
  /** Decisions for bins (only present if not returning to scan) */
  decisions?: BinDecision[];
}

interface UnscannedBinWarningModalProps {
  /** Modal open state */
  open: boolean;
  /** Callback to change modal open state */
  onOpenChange: (open: boolean) => void;
  /** List of bins without ending serials */
  unscannedBins: UnscannedBinInfo[];
  /** Callback when user confirms decisions */
  onConfirm: (result: UnscannedBinModalResult) => void;
  /** Callback when user cancels (closes modal without action) */
  onCancel: () => void;
}

/**
 * Truncate game name if too long
 */
function truncateGameName(name: string, maxLength: number = 18): string {
  if (name.length <= maxLength) return name;
  return name.substring(0, maxLength - 3) + "...";
}

/**
 * UnscannedBinWarningModal Component
 *
 * Displays a compact warning modal when attempting to close lottery day with bins
 * that have no ending serial. Simple table with sold out checkboxes.
 *
 * @example
 * <UnscannedBinWarningModal
 *   open={showWarningModal}
 *   onOpenChange={setShowWarningModal}
 *   unscannedBins={binsWithoutEnding}
 *   onConfirm={handleConfirm}
 *   onCancel={handleCancel}
 * />
 */
export function UnscannedBinWarningModal({
  open,
  onOpenChange,
  unscannedBins,
  onConfirm,
  onCancel,
}: UnscannedBinWarningModalProps) {
  // Track which bins are marked as sold out
  // Key: bin_id, Value: true if marked sold out
  const [soldOutBins, setSoldOutBins] = useState<Record<string, boolean>>({});

  /**
   * Compute select all state for header checkbox
   * MCP: FE-001 STATE_MANAGEMENT - Derive state from source of truth
   * Returns: true (all selected), false (none selected), "indeterminate" (partial)
   */
  const selectAllState = (() => {
    if (unscannedBins.length === 0) return false;
    const checkedCount = unscannedBins.filter(
      (bin) => soldOutBins[bin.bin_id],
    ).length;
    if (checkedCount === 0) return false;
    if (checkedCount === unscannedBins.length) return true;
    return "indeterminate" as const;
  })();

  /**
   * Handle Select All checkbox toggle
   * MCP: SEC-014 INPUT_VALIDATION - Only accept boolean values
   * When checked: mark all bins as sold out
   * When unchecked: clear all selections
   */
  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        // Select all bins
        const allSelected: Record<string, boolean> = {};
        unscannedBins.forEach((bin) => {
          allSelected[bin.bin_id] = true;
        });
        setSoldOutBins(allSelected);
      } else {
        // Deselect all bins
        setSoldOutBins({});
      }
    },
    [unscannedBins],
  );

  /**
   * Handle checkbox toggle for a bin
   * MCP: SEC-014 INPUT_VALIDATION - Only accept boolean values
   */
  const handleSoldOutToggle = useCallback((binId: string, checked: boolean) => {
    setSoldOutBins((prev) => ({
      ...prev,
      [binId]: checked,
    }));
  }, []);

  /**
   * Handle Return to Scan button click
   * Returns user to scanning screen to scan remaining tickets
   * Calculates tickets sold and sales amount for sold out bins
   */
  const handleReturnToScan = useCallback(() => {
    // Build decisions for bins marked as sold out
    const decisions: BinDecision[] = unscannedBins
      .filter((bin) => soldOutBins[bin.bin_id])
      .map((bin) => {
        // Calculate tickets sold with correct fencepost handling
        // For sold out pack, ending = serial_end (last ticket in pack)
        const startingNum = parseInt(bin.starting_serial, 10);
        const endingNum = parseInt(bin.serial_end, 10);

        // Fencepost error prevention:
        // - New pack (first period): tickets = ending - starting + 1 (inclusive)
        // - Continuing pack: tickets = ending - starting (exclusive of starting)
        const ticketsSold =
          !Number.isNaN(startingNum) && !Number.isNaN(endingNum)
            ? Math.max(
                0,
                bin.is_first_period
                  ? endingNum - startingNum + 1
                  : endingNum - startingNum,
              )
            : 0;
        const salesAmount = ticketsSold * bin.game_price;

        return {
          bin_id: bin.bin_id,
          bin_number: bin.bin_number,
          pack_id: bin.pack_id,
          pack_number: bin.pack_number,
          game_name: bin.game_name,
          game_price: bin.game_price,
          starting_serial: bin.starting_serial,
          serial_end: bin.serial_end,
          action: "SOLD_OUT" as const,
          ending_serial: bin.serial_end,
          tickets_sold: ticketsSold,
          sales_amount: salesAmount,
        };
      });

    onConfirm({
      returnToScan: true,
      decisions: decisions.length > 0 ? decisions : undefined,
    });
    onOpenChange(false);
  }, [unscannedBins, soldOutBins, onConfirm, onOpenChange]);

  /**
   * Handle cancel - reset state and close
   */
  const handleCancel = useCallback(() => {
    setSoldOutBins({});
    onCancel();
    onOpenChange(false);
  }, [onCancel, onOpenChange]);

  /**
   * Reset state when modal opens (controlled prop change)
   * MCP: FE-001 STATE_MANAGEMENT - Reset internal state when controlled open prop changes
   */
  useEffect(() => {
    if (open) {
      // Reset selections when modal opens to ensure clean state
      setSoldOutBins({});
    }
  }, [open]);

  /**
   * Handle internal open state changes from Dialog
   */
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      // Note: State reset is handled by useEffect on `open` prop
      onOpenChange(newOpen);
    },
    [onOpenChange],
  );

  // Don't render if no unscanned bins
  if (unscannedBins.length === 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-xl"
        data-testid="unscanned-bin-warning-modal"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
            <AlertTriangle className="h-5 w-5" />
            Bins Without Ending Serials
          </DialogTitle>
          <DialogDescription>
            If the pack is sold please mark it sold
          </DialogDescription>
        </DialogHeader>

        {/* Compact Table */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="border-b">
                <th className="text-left py-2 px-3 font-medium">#</th>
                <th className="text-left py-2 px-3 font-medium">Game</th>
                <th className="text-left py-2 px-3 font-medium">$</th>
                <th className="text-left py-2 px-3 font-medium">Pack</th>
                <th className="text-center py-2 px-3 font-medium">
                  <div className="flex items-center justify-center gap-2">
                    <span>Sold Out</span>
                    <Checkbox
                      checked={
                        selectAllState === "indeterminate"
                          ? "indeterminate"
                          : selectAllState
                      }
                      onCheckedChange={(checked) =>
                        handleSelectAll(checked === true)
                      }
                      data-testid="select-all-sold-out"
                      aria-label="Select all bins as sold out"
                    />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {unscannedBins.map((bin, index) => {
                const isChecked = soldOutBins[bin.bin_id] || false;

                return (
                  <tr
                    key={bin.bin_id}
                    className={cn(
                      "border-b last:border-b-0 h-10",
                      isChecked && "bg-green-50 dark:bg-green-950/20",
                      index % 2 === 0 && !isChecked && "bg-muted/20",
                    )}
                    data-testid={`unscanned-bin-row-${bin.bin_id}`}
                  >
                    <td className="py-2 px-3 font-medium">{bin.bin_number}</td>
                    <td className="py-2 px-3" title={bin.game_name}>
                      {truncateGameName(bin.game_name)}
                    </td>
                    <td className="py-2 px-3">${bin.game_price}</td>
                    <td className="py-2 px-3 font-mono text-xs">
                      {bin.pack_number}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(checked) =>
                          handleSoldOutToggle(bin.bin_id, checked === true)
                        }
                        data-testid={`bin-sold-out-${bin.bin_id}`}
                        aria-label={`Mark bin ${bin.bin_number} as sold out`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleCancel}
            data-testid="unscanned-bin-modal-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleReturnToScan}
            data-testid="unscanned-bin-modal-return"
          >
            Return to Scan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
