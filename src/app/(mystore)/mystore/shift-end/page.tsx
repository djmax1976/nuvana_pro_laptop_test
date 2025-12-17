"use client";

/**
 * Shift End Page
 *
 * Placeholder page for ending a shift without closing the day.
 * This page will handle shift closing workflow including:
 * - Cash reconciliation
 * - Shift summary
 * - Variance reporting
 *
 * Route: /mystore/shift-end
 *
 * Note: Day remains open after shift end - another shift can be started.
 * For closing the day, use /mystore/day-close instead.
 */

import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";

export default function ShiftEndPage() {
  const searchParams = useSearchParams();
  const shiftId = searchParams.get("shiftId");

  return (
    <div
      className="container mx-auto p-6 space-y-6"
      data-testid="shift-end-page"
    >
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">End Shift</h1>
        <p className="text-muted-foreground">
          Close your current shift. The business day will remain open.
        </p>
      </div>

      {/* Coming Soon Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Shift Closing
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-lg font-medium text-muted-foreground">
              Coming Soon
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Shift closing workflow is under development.
            </p>
            {shiftId && (
              <p className="mt-4 text-xs text-muted-foreground">
                Shift ID: {shiftId.slice(0, 8)}...
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
