"use client";

/**
 * Terminal Shift Page
 *
 * Story 4.92: Terminal Shift Page
 *
 * Displays active shift information for a terminal after cashier authentication.
 * Shows terminal name, shift number, cashier name, shift start time,
 * starting cash input, and placeholder metrics for sales, tax, and voids.
 *
 * @security
 * - SEC-001: Requires authenticated user session (enforced by layout)
 * - DB-006: Terminal access validated via store association
 */

import { useParams } from "next/navigation";
import { useActiveShift } from "@/lib/api/shifts";
import { useCashiers } from "@/lib/api/cashiers";
import { useStoreTerminals } from "@/lib/api/stores";
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

  // Get store ID from shift to fetch related data
  const storeId = activeShift?.store_id;

  // Fetch terminals for the store to get terminal name
  const { data: terminals = [], isLoading: isLoadingTerminals } =
    useStoreTerminals(storeId, { enabled: !!storeId });

  // Find terminal info by ID
  const terminal = terminals.find((t) => t.pos_terminal_id === terminalId);

  // Get cashiers to find cashier name
  const { data: cashiers = [], isLoading: isLoadingCashiers } = useCashiers(
    storeId || "",
    { is_active: true },
    { enabled: !!storeId },
  );

  // Find cashier info from shift
  const cashier = activeShift
    ? cashiers.find((c) => c.cashier_id === activeShift.cashier_id)
    : null;

  // Loading state - wait for all required data
  if (isLoadingShift || isLoadingCashiers || isLoadingTerminals) {
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
      terminalName={terminal?.name || "Terminal"}
    />
  );
}
