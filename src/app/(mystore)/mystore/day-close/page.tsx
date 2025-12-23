"use client";

/**
 * Day Close Page
 *
 * Comprehensive day closing workflow including:
 * - Lottery day close (required first step via modal)
 * - Payment methods breakdown with dual columns (left)
 * - Department sales breakdown with dual columns (right)
 * - Cash reconciliation
 *
 * Dual-column layout:
 * - Reports Totals: Manual input for payouts and lottery items
 * - POS Totals: Read-only values from POS system
 *
 * Route: /mystore/day-close
 *
 * Flow:
 * 1. Page loads -> Check if lottery already closed
 * 2. If not closed -> CloseDayModal pops up (mandatory)
 * 3. After lottery close -> Show full page with lottery total in sales
 * 4. User can see placeholder data and enter manual values for testing
 *
 * Key difference from Shift End:
 * - Lottery close is REQUIRED (modal auto-opens)
 * - Button is disabled until lottery is closed
 *
 * @security
 * - SEC-001: Requires authenticated user session
 * - FE-001: STATE_MANAGEMENT - Secure state management for auth data
 * - FE-002: FORM_VALIDATION - Input sanitization via shared components
 * - SEC-014: INPUT_VALIDATION - Strict input validation
 */

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, Loader2, AlertCircle } from "lucide-react";

import { useClientAuth } from "@/contexts/ClientAuthContext";
import { useClientDashboard } from "@/lib/api/client-dashboard";
import { useLotteryDayBins } from "@/hooks/useLottery";
import {
  CloseDayModal,
  type LotteryCloseResult,
  type ScannedBin,
} from "@/components/lottery/CloseDayModal";
import { ShiftClosingForm } from "@/components/shifts/ShiftClosingForm";
import { useShiftDetail } from "@/lib/api/shifts";

// Import shared shift-closing components
import {
  MoneyReceivedCard,
  SalesBreakdownCard,
  LotteryStatusBanner,
  LotterySalesDetails,
  formatBusinessDate,
  truncateUuid,
  type MoneyReceivedState,
  type MoneyReceivedReportsState,
  type SalesBreakdownState,
  type SalesBreakdownReportsState,
  type LotteryStatus,
  DEFAULT_MONEY_RECEIVED_STATE,
  DEFAULT_SALES_BREAKDOWN_STATE,
} from "@/components/shift-closing";

/**
 * Determine lottery status for the banner
 */
function determineLotteryStatus(
  lotteryCompleted: boolean,
  isLotteryAlreadyClosed: boolean,
): LotteryStatus {
  if (lotteryCompleted) return "closed";
  if (isLotteryAlreadyClosed) return "closed_earlier";
  return "not_closed";
}

/**
 * Day Close Page Component
 */
export default function DayClosePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const shiftId = searchParams.get("shiftId");

  // Auth and dashboard data
  const { isLoading: authLoading } = useClientAuth();
  const {
    data: dashboardData,
    isLoading: dashboardLoading,
    isError: dashboardError,
  } = useClientDashboard();

  // Get store ID from user's accessible stores
  const storeId =
    dashboardData?.stores.find((s) => s.status === "ACTIVE")?.store_id ||
    dashboardData?.stores[0]?.store_id;

  // Fetch shift details to check if already closed
  const { data: shiftData, isLoading: shiftLoading } = useShiftDetail(shiftId);
  const isShiftClosed = shiftData?.status === "CLOSED";

  // Lottery day bins data
  const { data: dayBinsData, isLoading: dayBinsLoading } =
    useLotteryDayBins(storeId);

  // Lottery modal state
  const [closeDayModalOpen, setCloseDayModalOpen] = useState(false);
  const [lotteryCompleted, setLotteryCompleted] = useState(false);
  const [lotteryData, setLotteryData] = useState<LotteryCloseResult | null>(
    null,
  );
  // Scanned bins state - persists when modal is closed until day is closed
  const [scannedBins, setScannedBins] = useState<ScannedBin[]>([]);

  // Shift closing form state
  const [shiftClosingFormOpen, setShiftClosingFormOpen] = useState(false);

  // Money received state (dual-column)
  const [moneyReceivedState, setMoneyReceivedState] =
    useState<MoneyReceivedState>(DEFAULT_MONEY_RECEIVED_STATE);

  // Sales breakdown state (dual-column)
  const [salesBreakdownState, setSalesBreakdownState] =
    useState<SalesBreakdownState>(DEFAULT_SALES_BREAKDOWN_STATE);

  // Check if lottery is already closed for today
  const isLotteryAlreadyClosed =
    dayBinsData?.business_day?.last_shift_closed_at !== null;

  // Determine lottery status
  const lotteryStatus = determineLotteryStatus(
    lotteryCompleted,
    isLotteryAlreadyClosed,
  );

  // Calculate scratch off total from lottery data
  const scratchOffTotal = lotteryData?.lottery_total ?? 0;

  // Auto-open lottery modal when page loads and lottery not closed
  // This is the KEY DIFFERENCE from Shift End - lottery is REQUIRED
  useEffect(() => {
    if (
      !authLoading &&
      !dashboardLoading &&
      !dayBinsLoading &&
      storeId &&
      dayBinsData &&
      !isLotteryAlreadyClosed &&
      !lotteryCompleted
    ) {
      // Small delay to ensure UI is ready
      const timer = setTimeout(() => {
        setCloseDayModalOpen(true);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [
    authLoading,
    dashboardLoading,
    dayBinsLoading,
    storeId,
    dayBinsData,
    isLotteryAlreadyClosed,
    lotteryCompleted,
  ]);

  // Handle lottery close success
  const handleLotterySuccess = useCallback((data: LotteryCloseResult) => {
    setLotteryData(data);
    setLotteryCompleted(true);
    setCloseDayModalOpen(false);

    // Update the POS scratch off value with lottery total
    setSalesBreakdownState((prev) => ({
      ...prev,
      pos: {
        ...prev.pos,
        scratchOff: data.lottery_total,
      },
    }));
  }, []);

  // Handle money received reports state changes (manual inputs)
  const handleMoneyReportsChange = useCallback(
    (changes: Partial<MoneyReceivedReportsState>) => {
      setMoneyReceivedState((prev) => ({
        ...prev,
        reports: { ...prev.reports, ...changes },
      }));
    },
    [],
  );

  // Handle sales breakdown reports state changes (manual inputs)
  const handleSalesReportsChange = useCallback(
    (changes: Partial<SalesBreakdownReportsState>) => {
      setSalesBreakdownState((prev) => ({
        ...prev,
        reports: { ...prev.reports, ...changes },
      }));
    },
    [],
  );

  // Handle opening lottery modal
  const handleOpenLotteryModal = useCallback(() => {
    setCloseDayModalOpen(true);
  }, []);

  // Handle opening shift closing form
  const handleOpenShiftClosingForm = useCallback(() => {
    setShiftClosingFormOpen(true);
  }, []);

  // Handle shift closing success - navigate to mystore dashboard
  const handleShiftClosingSuccess = useCallback(() => {
    setShiftClosingFormOpen(false);
    router.push("/mystore");
  }, [router]);

  // Redirect to dashboard if shift is already closed
  // Users should start a new shift from the dashboard, not view this page for closed shifts
  // Note: This effect must be before any early returns to follow React Hooks rules
  useEffect(() => {
    if (isShiftClosed) {
      router.replace("/mystore");
    }
  }, [isShiftClosed, router]);

  // Loading state
  if (authLoading || dashboardLoading || shiftLoading) {
    return (
      <div
        className="container mx-auto p-6 flex items-center justify-center min-h-[400px]"
        data-testid="day-close-page-loading"
      >
        <div className="flex flex-col items-center gap-4">
          <Loader2
            className="h-8 w-8 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (dashboardError) {
    return (
      <div className="container mx-auto p-6" data-testid="day-close-page-error">
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" aria-hidden="true" />
              <p>Failed to load dashboard data. Please try again.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No store available
  if (!storeId) {
    return (
      <div className="container mx-auto p-6" data-testid="day-close-page">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-center">
              No store available. Please contact your administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get store name
  const storeName =
    dashboardData?.stores.find((s) => s.store_id === storeId)?.name ||
    "Your Store";

  // Format the business date for display
  const businessDate =
    lotteryData?.business_day || dayBinsData?.business_day?.date;
  const formattedDate = formatBusinessDate(businessDate);

  return (
    <div
      className="container mx-auto p-6 space-y-6"
      data-testid="day-close-page"
    >
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <CalendarCheck className="h-8 w-8" aria-hidden="true" />
              Close Day
            </h1>
            <p className="text-muted-foreground">
              {storeName} - {formattedDate}
            </p>
          </div>
          {shiftId && (
            <Badge variant="outline" className="text-xs">
              Shift: {truncateUuid(shiftId)}
            </Badge>
          )}
        </div>
      </div>

      {/* Lottery Status Banner - Required for Day Close */}
      {!dayBinsLoading && (
        <LotteryStatusBanner
          status={lotteryStatus}
          lotteryData={lotteryData}
          lotteryTotal={scratchOffTotal}
          isRequired={true} // Lottery is REQUIRED for day close
          onOpenLotteryModal={handleOpenLotteryModal}
        />
      )}

      {/* Main Content - Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Payment Methods */}
        <MoneyReceivedCard
          state={moneyReceivedState}
          onReportsChange={handleMoneyReportsChange}
        />

        {/* Right Column - Department Sales */}
        <SalesBreakdownCard
          state={salesBreakdownState}
          onReportsChange={handleSalesReportsChange}
        />
      </div>

      {/* Lottery Breakdown Details (shown after close) */}
      {lotteryData && <LotterySalesDetails data={lotteryData} />}

      {/* Action Buttons */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {lotteryCompleted || isLotteryAlreadyClosed
                ? "Lottery is closed. Complete the day close when ready."
                : "Close lottery first to proceed with day close."}
            </p>
            <div className="flex gap-3">
              <Button variant="outline" disabled>
                Cancel
              </Button>
              <Button
                disabled={
                  (!lotteryCompleted && !isLotteryAlreadyClosed) || !shiftId
                }
                data-testid="complete-day-close-btn"
                onClick={handleOpenShiftClosingForm}
              >
                Complete Day Close
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lottery Close Modal */}
      {dayBinsData && (
        <CloseDayModal
          storeId={storeId}
          bins={dayBinsData.bins}
          open={closeDayModalOpen}
          onOpenChange={setCloseDayModalOpen}
          onSuccessWithData={handleLotterySuccess}
          scannedBins={scannedBins}
          onScannedBinsChange={setScannedBins}
        />
      )}

      {/* Shift Closing Form Modal */}
      {shiftId && (
        <ShiftClosingForm
          shiftId={shiftId}
          storeId={storeId}
          open={shiftClosingFormOpen}
          onOpenChange={setShiftClosingFormOpen}
          onSuccess={handleShiftClosingSuccess}
        />
      )}
    </div>
  );
}
