"use client";

/**
 * Terminal Shift Page
 *
 * Story 4.92: Terminal Shift Page
 *
 * Displays active shift information for a terminal after cashier authentication.
 * Shows cashier name, shift start time, shift number, starting cash input,
 * and placeholder metrics for sales, tax, and voids.
 */

import { useParams } from "next/navigation";
import { useActiveShift } from "@/lib/api/shifts";
import { useCashiers } from "@/lib/api/cashiers";
import { TerminalShiftPageContent } from "@/components/terminals/TerminalShiftPage";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function TerminalShiftPage() {
  const params = useParams();
  const terminalId = params.terminalId as string;

  // Get active shift for this terminal
  const {
    data: activeShift,
    isLoading: isLoadingShift,
    error: shiftError,
  } = useActiveShift(terminalId, { enabled: !!terminalId });

  // Get cashiers to find cashier name (we'll need storeId for this)
  // For now, we'll get it from the shift when available
  const storeId = activeShift?.store_id;
  const { data: cashiers = [], isLoading: isLoadingCashiers } = useCashiers(
    storeId || "",
    { is_active: true },
    { enabled: !!storeId },
  );

  // Find cashier info from shift
  const cashier = activeShift
    ? cashiers.find((c) => c.cashier_id === activeShift.cashier_id)
    : null;

  // Loading state
  if (isLoadingShift || isLoadingCashiers) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="space-y-4 text-center">
          <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary" />
          <p className="text-muted-foreground">Loading shift information...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (shiftError) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load shift information. Please try again.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // No active shift
  if (!activeShift) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <AlertDescription>
            No active shift found for this terminal. Please start a shift first.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <TerminalShiftPageContent
      shift={activeShift}
      cashierName={cashier?.name || "Unknown Cashier"}
      terminalId={terminalId}
    />
  );
}
