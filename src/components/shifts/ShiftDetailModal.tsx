"use client";

/**
 * Shift Detail Modal Component
 * Displays full shift details including metadata, cash reconciliation, and variance information
 *
 * Story: 4.7 - Shift Management UI
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ShiftResponse,
  type ShiftDetailResponse,
  useShiftDetail,
} from "@/lib/api/shifts";
import { ShiftStatusBadge } from "./ShiftStatusBadge";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { FileText, ExternalLink, Loader2 } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ShiftDetailModalProps {
  shift: ShiftResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: string | null): string {
  if (!timestamp) return "—";
  try {
    const date = new Date(timestamp);
    return format(date, "MMM dd, yyyy HH:mm:ss");
  } catch {
    return timestamp;
  }
}

/**
 * ShiftDetailModal component
 * Modal dialog displaying comprehensive shift details
 */
export function ShiftDetailModal({
  shift,
  open,
  onOpenChange,
}: ShiftDetailModalProps) {
  // Fetch full shift details using the detail endpoint
  const {
    data: shiftDetail,
    isLoading,
    error,
  } = useShiftDetail(shift.shift_id, { enabled: open });

  // Use detail data if available, otherwise fall back to list data
  const displayShift: ShiftResponse | ShiftDetailResponse =
    shiftDetail || shift;
  const isClosed = displayShift.status === "CLOSED";
  const hasVariance =
    displayShift.variance_amount !== null && displayShift.variance_amount !== 0;
  const isDetailResponse = "transaction_count" in displayShift;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Shift Details</DialogTitle>
          <DialogDescription>
            Complete information for shift{" "}
            {displayShift.shift_id.substring(0, 8)}...
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                Loading shift details...
              </span>
            </div>
          )}

          {/* Error State */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                Failed to load shift details:{" "}
                {error instanceof Error ? error.message : "Unknown error"}
              </AlertDescription>
            </Alert>
          )}

          {/* Shift Metadata */}
          <Card>
            <CardHeader>
              <CardTitle>Shift Information</CardTitle>
              <CardDescription>Basic shift metadata</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Shift ID
                  </label>
                  <p className="text-sm font-mono">{displayShift.shift_id}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Status
                  </label>
                  <div className="mt-1">
                    <ShiftStatusBadge
                      status={displayShift.status}
                      shiftId={displayShift.shift_id}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Store
                  </label>
                  <p className="text-sm">
                    {displayShift.store_name || "Unknown"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Cashier
                  </label>
                  <p className="text-sm">
                    {displayShift.cashier_name || "Unknown"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Opened At
                  </label>
                  <p className="text-sm">
                    {formatTimestamp(displayShift.opened_at)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Closed At
                  </label>
                  <p className="text-sm">
                    {formatTimestamp(displayShift.closed_at)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cash Reconciliation Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Cash Reconciliation</CardTitle>
              <CardDescription>
                Cash amounts and reconciliation details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Opening Cash
                  </label>
                  <p className="text-lg font-semibold">
                    {formatCurrency(displayShift.opening_cash)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Closing Cash
                  </label>
                  <p className="text-lg font-semibold">
                    {displayShift.closing_cash !== null
                      ? formatCurrency(displayShift.closing_cash)
                      : "—"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Expected Cash
                  </label>
                  <p className="text-lg font-semibold">
                    {displayShift.expected_cash !== null
                      ? formatCurrency(displayShift.expected_cash)
                      : "—"}
                  </p>
                </div>
                {hasVariance && (
                  <>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">
                        Variance Amount
                      </label>
                      <p
                        className={`text-lg font-semibold ${
                          displayShift.variance_amount! < 0
                            ? "text-destructive"
                            : displayShift.variance_amount! > 0
                              ? "text-green-600"
                              : ""
                        }`}
                      >
                        {displayShift.variance_amount! >= 0 ? "+" : ""}
                        {formatCurrency(displayShift.variance_amount!)}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">
                        Variance Percentage
                      </label>
                      <p
                        className={`text-lg font-semibold ${
                          displayShift.variance_percentage! < 0
                            ? "text-destructive"
                            : displayShift.variance_percentage! > 0
                              ? "text-green-600"
                              : ""
                        }`}
                      >
                        {displayShift.variance_percentage! >= 0 ? "+" : ""}
                        {displayShift.variance_percentage!.toFixed(2)}%
                      </p>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Variance Details (if applicable) */}
          {hasVariance &&
            displayShift.status === "CLOSED" &&
            isDetailResponse && (
              <Card>
                <CardHeader>
                  <CardTitle>Variance Details</CardTitle>
                  <CardDescription>
                    Variance approval information
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {isDetailResponse &&
                      (displayShift as ShiftDetailResponse).variance_reason && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">
                            Variance Reason
                          </label>
                          <p className="text-sm mt-1 p-3 bg-muted rounded-md">
                            {
                              (displayShift as ShiftDetailResponse)
                                .variance_reason
                            }
                          </p>
                        </div>
                      )}
                    {isDetailResponse &&
                      ((displayShift as ShiftDetailResponse).approved_by_name ||
                        (displayShift as ShiftDetailResponse).approved_at) && (
                        <div className="grid grid-cols-2 gap-4">
                          {(displayShift as ShiftDetailResponse)
                            .approved_by_name && (
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">
                                Approved By
                              </label>
                              <p className="text-sm">
                                {
                                  (displayShift as ShiftDetailResponse)
                                    .approved_by_name
                                }
                              </p>
                            </div>
                          )}
                          {(displayShift as ShiftDetailResponse)
                            .approved_at && (
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">
                                Approved At
                              </label>
                              <p className="text-sm">
                                {formatTimestamp(
                                  (displayShift as ShiftDetailResponse)
                                    .approved_at,
                                )}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                  </div>
                </CardContent>
              </Card>
            )}

          {/* Transaction Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Transactions</CardTitle>
              <CardDescription>Transaction summary</CardDescription>
            </CardHeader>
            <CardContent>
              {isDetailResponse ? (
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">
                      Total Transactions:
                    </span>
                    <span className="text-lg font-semibold">
                      {(displayShift as ShiftDetailResponse).transaction_count}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Loading transaction count...
                </p>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            {isClosed && (
              <Button asChild variant="outline">
                <Link href={`/shifts/${displayShift.shift_id}/report`}>
                  <FileText className="mr-2 h-4 w-4" />
                  View Report
                  <ExternalLink className="ml-2 h-3 w-3" />
                </Link>
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
