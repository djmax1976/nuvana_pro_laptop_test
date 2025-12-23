"use client";

/**
 * Shift Detail Page for Client Owner Dashboard
 *
 * Displays comprehensive shift information:
 * - For OPEN/ACTIVE shifts: Shows ongoing shift dashboard (similar to terminal shift page)
 * - For CLOSED shifts: Shows complete shift summary with payment methods, sales breakdown, and variance details
 *
 * This page is independent from the cashier terminal pages and can be customized
 * for client owner specific features in the future.
 *
 * Route: /client-dashboard/shifts/[shiftId]
 *
 * @security
 * - SEC-001: Requires authenticated user session with SHIFT_READ permission
 * - FE-001: STATE_MANAGEMENT - Secure state management for auth data
 * - FE-005: UI_SECURITY - No sensitive data exposed, read-only display
 * - API-008: OUTPUT_FILTERING - Uses whitelisted API response fields only
 */

import { useParams, useRouter } from "next/navigation";
import { useShiftDetail } from "@/lib/api/shifts";
import { useShiftSummary } from "@/lib/api/shift-summary";
import { Loader2, ArrowLeft, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ActiveShiftView } from "@/components/shifts/client-dashboard/ActiveShiftView";
import { ClosedShiftSummary } from "@/components/shifts/client-dashboard/ClosedShiftSummary";

/**
 * Check if shift status indicates an active/ongoing shift
 */
function isActiveShift(status: string): boolean {
  return ["NOT_STARTED", "OPEN", "ACTIVE", "CLOSING", "RECONCILING"].includes(
    status,
  );
}

/**
 * Check if shift status indicates a closed shift
 */
function isClosedShift(status: string): boolean {
  return ["CLOSED", "VARIANCE_REVIEW"].includes(status);
}

export default function ShiftDetailPage() {
  const params = useParams();
  const router = useRouter();
  const shiftId = params.shiftId as string;

  // Fetch shift details
  const {
    data: shiftData,
    isLoading: isLoadingShift,
    error: shiftError,
  } = useShiftDetail(shiftId, { enabled: !!shiftId });

  // Fetch shift summary (payment methods, sales breakdown) - only for closed shifts
  const shouldFetchSummary = shiftData && isClosedShift(shiftData.status);
  const {
    data: summaryData,
    isLoading: isLoadingSummary,
    error: summaryError,
  } = useShiftSummary(shiftId, { enabled: shouldFetchSummary });

  // Handle back navigation
  const handleBack = () => {
    router.push("/client-dashboard/shifts");
  };

  // Loading state
  if (isLoadingShift) {
    return (
      <div className="container mx-auto p-6" data-testid="shift-detail-loading">
        <div className="flex h-[400px] items-center justify-center">
          <div className="space-y-4 text-center">
            <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary" />
            <p className="text-muted-foreground">Loading shift details...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (shiftError) {
    return (
      <div className="container mx-auto p-6" data-testid="shift-detail-error">
        <Button
          variant="ghost"
          onClick={handleBack}
          className="mb-4"
          data-testid="back-button"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Shifts
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {shiftError instanceof Error
              ? shiftError.message
              : "Failed to load shift details. Please try again."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // No shift data
  if (!shiftData) {
    return (
      <div
        className="container mx-auto p-6"
        data-testid="shift-detail-not-found"
      >
        <Button
          variant="ghost"
          onClick={handleBack}
          className="mb-4"
          data-testid="back-button"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Shifts
        </Button>
        <Alert>
          <AlertDescription>
            Shift not found or you do not have access to view this shift.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div
      className="container mx-auto p-6 space-y-6"
      data-testid="shift-detail-page"
    >
      {/* Back Button */}
      <Button
        variant="ghost"
        onClick={handleBack}
        className="mb-2"
        data-testid="back-button"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Shifts
      </Button>

      {/* Render appropriate view based on shift status */}
      {isActiveShift(shiftData.status) && <ActiveShiftView shift={shiftData} />}

      {isClosedShift(shiftData.status) && (
        <ClosedShiftSummary
          shift={shiftData}
          summary={summaryData}
          isLoadingSummary={isLoadingSummary}
          summaryError={summaryError}
        />
      )}
    </div>
  );
}
