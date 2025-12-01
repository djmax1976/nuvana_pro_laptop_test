"use client";

/**
 * Client Dashboard Shift and Day Page
 * Displays day reconciliation view with shift summaries and daily totals
 *
 * Story: 4.8 - Cashier Shift Start Flow
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { useClientDashboard } from "@/lib/api/client-dashboard";
import { CashierShiftStartDialog } from "@/components/shifts/CashierShiftStartDialog";

export default function ShiftAndDayPage() {
  const { data, isLoading } = useClientDashboard();
  const [isShiftDialogOpen, setIsShiftDialogOpen] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  // Get first active store for shift start (or first store if no active stores)
  const firstStoreId =
    data?.stores.find((s) => s.status === "ACTIVE")?.store_id ||
    data?.stores[0]?.store_id ||
    null;

  // Handle "Start Shift" button click
  const handleStartShift = () => {
    if (firstStoreId) {
      setSelectedStoreId(firstStoreId);
      setIsShiftDialogOpen(true);
    }
  };

  return (
    <div className="space-y-6" data-testid="shift-and-day-page">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Shift and Day</h1>
          <p className="text-sm text-muted-foreground mt-2">
            View day reconciliations, daily summaries, and shift totals
          </p>
        </div>

        {/* Action Buttons */}
        <Button
          onClick={handleStartShift}
          disabled={!firstStoreId || isLoading}
          data-testid="start-shift-button"
        >
          <Clock className="mr-2 h-4 w-4" />
          Start Shift
        </Button>
      </div>

      {/* Content Area - To be implemented */}
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground">
          Shift and Day reconciliation view coming soon
        </p>
      </div>

      {/* Cashier Shift Start Dialog */}
      {selectedStoreId && (
        <CashierShiftStartDialog
          storeId={selectedStoreId}
          open={isShiftDialogOpen}
          onOpenChange={setIsShiftDialogOpen}
        />
      )}
    </div>
  );
}
