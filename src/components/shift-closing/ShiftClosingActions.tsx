"use client";

/**
 * Shift Closing Actions Component
 *
 * Story: 10.1 - Lottery Shift Closing Page UI
 *
 * Displays action buttons for shift closing operations.
 *
 * @requirements
 * - AC #6: Next button disabled when entries incomplete
 * - AC #6: Next button enabled when all active bins have 3-digit entries
 * - AC #7: Render all action buttons
 */

import { Button } from "@/components/ui/button";

/**
 * Props for ShiftClosingActions component
 */
export interface ShiftClosingActionsProps {
  /** Whether Next button should be enabled */
  canProceed: boolean;
  /** Callback for Add Bin button */
  onAddBin: () => void;
  /** Callback for Activate Pack button */
  onActivatePack: () => void;
  /** Callback for Manual Entry button */
  onManualEntry: () => void;
  /** Callback for Next button */
  onNext: () => void;
}

/**
 * ShiftClosingActions component
 * Displays action buttons for shift closing operations
 */
export function ShiftClosingActions({
  canProceed,
  onAddBin,
  onActivatePack,
  onManualEntry,
  onNext,
}: ShiftClosingActionsProps) {
  return (
    <div
      className="flex flex-col sm:flex-row gap-2 sm:gap-4"
      data-testid="shift-closing-actions"
    >
      <Button
        variant="outline"
        onClick={onAddBin}
        data-testid="add-bin-button"
        className="w-full sm:w-auto text-sm md:text-base"
      >
        + Add Bin
      </Button>
      <Button
        variant="outline"
        onClick={onActivatePack}
        data-testid="activate-pack-button"
        className="w-full sm:w-auto text-sm md:text-base"
      >
        Activate Pack
      </Button>
      <Button
        variant="outline"
        onClick={onManualEntry}
        data-testid="manual-entry-button"
        className="w-full sm:w-auto text-sm md:text-base"
      >
        Manual Entry
      </Button>
      <Button
        onClick={onNext}
        disabled={!canProceed}
        data-testid="next-button"
        className={`w-full sm:w-auto text-sm md:text-base ${
          canProceed
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "bg-muted text-muted-foreground cursor-not-allowed"
        }`}
      >
        Next
      </Button>
    </div>
  );
}
