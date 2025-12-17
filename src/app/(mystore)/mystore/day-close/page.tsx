"use client";

/**
 * Day Close Page
 *
 * Placeholder page for closing the business day.
 * This page will handle the complete day close workflow including:
 * - Closing the current shift (automatically)
 * - Closing the business day for this terminal
 * - Triggering lottery day close (if enabled)
 * - Day summary with all shifts
 * - Cash reconciliation totals
 * - Variance reporting
 *
 * Route: /mystore/day-close
 *
 * Business Day Date Assignment:
 * - Uses configurable cutoff time (default 4:00 AM)
 * - Close before cutoff = previous calendar date
 * - Close after cutoff = current calendar date
 * - One business day per calendar date per terminal
 *
 * Note: This closes both the shift AND the day.
 * For closing only the shift, use /mystore/shift-end instead.
 */

import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarCheck } from "lucide-react";

export default function DayClosePage() {
  const searchParams = useSearchParams();
  const shiftId = searchParams.get("shiftId");

  return (
    <div
      className="container mx-auto p-6 space-y-6"
      data-testid="day-close-page"
    >
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Close Day</h1>
        <p className="text-muted-foreground">
          End your shift and close the business day for this terminal.
        </p>
      </div>

      {/* Coming Soon Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5" />
            Day Close
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-lg font-medium text-muted-foreground">
              Coming Soon
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Day close workflow is under development.
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              This will close your current shift, the business day, and lottery
              day (if enabled).
            </p>
            {shiftId && (
              <p className="mt-2 text-xs text-muted-foreground">
                Shift ID: {shiftId.slice(0, 8)}...
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
