"use client";

/**
 * Day Close Wizard Page
 *
 * 3-step wizard for closing the business day:
 * - Step 1: Lottery Close - Scan all active bins to record ending serials
 * - Step 2: Report Scanning - Scan vendor invoices, lottery reports, gaming reports
 * - Step 3: Day Close - Final summary with payment methods, department sales, confirmation
 *
 * Route: /mystore/day-close
 *
 * This is a SINGLE PAGE with internal step state (not separate routes).
 * Data flows through the wizard steps - lottery totals are imported into Step 3.
 *
 * @security
 * - SEC-001: Requires authenticated user session
 * - FE-001: STATE_MANAGEMENT - Secure state management
 * - FE-002: FORM_VALIDATION - Input sanitization via shared components
 * - SEC-014: INPUT_VALIDATION - Strict input validation
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CalendarCheck,
  Loader2,
  AlertCircle,
  Check,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";

import { useClientAuth } from "@/contexts/ClientAuthContext";
import { useClientDashboard } from "@/lib/api/client-dashboard";
import { useLotteryDayBins } from "@/hooks/useLottery";
import { ShiftClosingForm } from "@/components/shifts/ShiftClosingForm";
import { useShiftDetail, useOpenShiftsCheck } from "@/lib/api/shifts";
import {
  commitLotteryDayClose,
  cancelLotteryDayClose,
} from "@/lib/api/lottery";
import { useToast } from "@/hooks/use-toast";
import {
  DayCloseModeScanner,
  type LotteryCloseResult,
  type ScannedBin,
} from "@/components/lottery/DayCloseModeScanner";

// Import shared shift-closing components for Step 3
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
  DEFAULT_MONEY_RECEIVED_STATE,
  DEFAULT_SALES_BREAKDOWN_STATE,
} from "@/components/shift-closing";

// Import Step 2 component
import { ReportScanningStep } from "@/components/day-close/ReportScanningStep";
import type { ReportScanningState } from "@/components/day-close/ReportScanningStep";

// ============ TYPES ============

type WizardStep = 1 | 2 | 3;

interface WizardState {
  currentStep: WizardStep;
  // Step 1: Lottery data
  lotteryCompleted: boolean;
  lotteryData: LotteryCloseResult | null;
  scannedBins: ScannedBin[];
  // Step 2: Report scanning data
  reportScanningData: ReportScanningState | null;
  // Step 3 uses shared state from shift-closing components
  // Two-phase commit tracking
  pendingLotteryDayId: string | null;
  pendingLotteryCloseExpiresAt: string | null;
}

// ============ STEP INDICATOR COMPONENT ============

interface StepIndicatorProps {
  currentStep: WizardStep;
  lotteryCompleted: boolean;
  reportScanningCompleted: boolean;
}

function StepIndicator({
  currentStep,
  lotteryCompleted,
  reportScanningCompleted,
}: StepIndicatorProps) {
  const steps = [
    { number: 1, label: "Lottery Close", completed: lotteryCompleted },
    { number: 2, label: "Report Scanning", completed: reportScanningCompleted },
    { number: 3, label: "Day Close", completed: false },
  ];

  return (
    <div className="bg-card border-b px-6 py-4" data-testid="step-indicator">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.number} className="flex items-center flex-1">
              {/* Step circle and label */}
              <div className="flex items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg transition-colors ${
                    step.completed
                      ? "bg-green-600 text-white"
                      : currentStep === step.number
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                  }`}
                  data-testid={`step-${step.number}-indicator`}
                >
                  {step.completed ? <Check className="w-5 h-5" /> : step.number}
                </div>
                <span
                  className={`ml-3 font-medium ${
                    step.completed
                      ? "text-green-600"
                      : currentStep === step.number
                        ? "text-primary"
                        : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {/* Connecting line (not after last step) */}
              {index < steps.length - 1 && (
                <div
                  className={`flex-1 h-1 mx-4 transition-colors ${
                    step.completed ? "bg-green-600" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============ MAIN COMPONENT ============

export default function DayCloseWizardPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const shiftId = searchParams.get("shiftId");

  // ============ AUTH & DATA HOOKS ============
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

  // Open shifts check - BUSINESS RULE: All shifts must be closed before day close
  const {
    data: openShiftsData,
    isLoading: openShiftsLoading,
    isFetched: openShiftsFetched,
  } = useOpenShiftsCheck(storeId);

  // Exclude current shift from blocking list
  const otherOpenShifts =
    openShiftsData?.open_shifts?.filter((s) => s.shift_id !== shiftId) ?? [];
  const hasOtherOpenShifts = otherOpenShifts.length > 0;
  const openShiftsCheckComplete = !!storeId && openShiftsFetched;

  // Check if lottery is already closed for today
  // Use the business_day.status field which is "CLOSED" when lottery was closed
  const isLotteryAlreadyClosed =
    !!dayBinsData && dayBinsData.business_day?.status === "CLOSED";

  // Calculate lottery close result from dayBinsData when lottery was closed earlier
  // This allows Step 3 to display lottery details even when we didn't close it in this session
  const calculatedLotteryData = useMemo((): LotteryCloseResult | null => {
    if (!isLotteryAlreadyClosed || !dayBinsData) return null;

    // Get bins with active packs that have ending serials (closed)
    const closedBins = dayBinsData.bins.filter(
      (bin) => bin.is_active && bin.pack && bin.pack.ending_serial,
    );

    if (closedBins.length === 0) return null;

    // Calculate lottery totals from closed bins
    let lotteryTotal = 0;
    const binsClosedData = closedBins.map((bin) => {
      const pack = bin.pack!;
      const startingSerialNum = parseInt(pack.starting_serial, 10) || 0;
      const closingSerialNum = parseInt(pack.ending_serial!, 10) || 0;
      const ticketsSold = Math.max(0, closingSerialNum - startingSerialNum);
      const salesAmount = ticketsSold * pack.game_price;
      lotteryTotal += salesAmount;

      return {
        bin_number: bin.bin_number,
        pack_number: pack.pack_number,
        game_name: pack.game_name,
        closing_serial: pack.ending_serial!,
        starting_serial: pack.starting_serial,
        game_price: pack.game_price,
        tickets_sold: ticketsSold,
        sales_amount: salesAmount,
      };
    });

    return {
      closings_created: closedBins.length,
      business_day: dayBinsData.business_day?.date || "",
      lottery_total: lotteryTotal,
      bins_closed: binsClosedData,
    };
  }, [isLotteryAlreadyClosed, dayBinsData]);

  // ============ WIZARD STATE ============
  const [wizardState, setWizardState] = useState<WizardState>({
    currentStep: 1,
    lotteryCompleted: false,
    lotteryData: null,
    scannedBins: [],
    reportScanningData: null,
    pendingLotteryDayId: null,
    pendingLotteryCloseExpiresAt: null,
  });

  // Loading state for committing lottery close
  const [isCommittingLottery, setIsCommittingLottery] = useState(false);

  // Shift closing form state (Step 3)
  const [shiftClosingFormOpen, setShiftClosingFormOpen] = useState(false);

  // Money received state (Step 3 - dual-column)
  const [moneyReceivedState, setMoneyReceivedState] =
    useState<MoneyReceivedState>(DEFAULT_MONEY_RECEIVED_STATE);

  // Sales breakdown state (Step 3 - dual-column)
  const [salesBreakdownState, setSalesBreakdownState] =
    useState<SalesBreakdownState>(DEFAULT_SALES_BREAKDOWN_STATE);

  // ============ DERIVED STATE ============
  const {
    currentStep,
    lotteryCompleted,
    lotteryData,
    scannedBins,
    reportScanningData,
    pendingLotteryDayId,
    pendingLotteryCloseExpiresAt,
  } = wizardState;

  // If lottery was already closed before wizard started, skip to step 2
  // and populate lotteryData from calculated values
  useEffect(() => {
    if (isLotteryAlreadyClosed && !lotteryCompleted && currentStep === 1) {
      setWizardState((prev) => ({
        ...prev,
        currentStep: 2,
        lotteryCompleted: true,
        lotteryData: calculatedLotteryData, // Populate with calculated data
      }));

      // Also update sales breakdown with calculated lottery total
      if (calculatedLotteryData) {
        setSalesBreakdownState((prev) => ({
          ...prev,
          pos: {
            ...prev.pos,
            scratchOff: calculatedLotteryData.lottery_total,
          },
        }));
      }
    }
  }, [
    isLotteryAlreadyClosed,
    lotteryCompleted,
    currentStep,
    calculatedLotteryData,
  ]);

  // Calculate scratch off total from lottery data
  const scratchOffTotal = lotteryData?.lottery_total ?? 0;

  // Report scanning completed when data exists
  const reportScanningCompleted = reportScanningData !== null;

  // ============ STEP 1 HANDLERS ============
  const handleLotterySuccess = useCallback((data: LotteryCloseResult) => {
    setWizardState((prev) => ({
      ...prev,
      lotteryCompleted: true,
      lotteryData: data,
      currentStep: 2, // Auto-advance to step 2
      // Store pending close data for two-phase commit
      pendingLotteryDayId: data.day_id || null,
      pendingLotteryCloseExpiresAt: data.pending_close_expires_at || null,
    }));

    // Update sales breakdown with lottery total
    setSalesBreakdownState((prev) => ({
      ...prev,
      pos: {
        ...prev.pos,
        scratchOff: data.lottery_total,
      },
    }));
  }, []);

  const handleScannedBinsChange = useCallback((bins: ScannedBin[]) => {
    setWizardState((prev) => ({
      ...prev,
      scannedBins: bins,
    }));
  }, []);

  /**
   * Cancel lottery scanning step
   * Note: Since prepare-close hasn't been called yet in step 1, no cleanup needed
   * The user is simply exiting before scanning is complete
   */
  const handleLotteryCancel = useCallback(async () => {
    // If somehow we got a pending close state (edge case), cancel it
    if (pendingLotteryDayId && storeId) {
      try {
        await cancelLotteryDayClose(storeId);
      } catch {
        // Ignore errors - will auto-expire
      }
    }
    router.push("/mystore");
  }, [pendingLotteryDayId, storeId, router]);

  // ============ STEP 2 HANDLERS ============
  const handleReportScanningComplete = useCallback(
    (data: ReportScanningState) => {
      setWizardState((prev) => ({
        ...prev,
        reportScanningData: data,
        currentStep: 3, // Auto-advance to step 3
      }));

      // Import report data into Step 3 state
      // Lottery payouts go into money received reports
      setMoneyReceivedState((prev) => ({
        ...prev,
        reports: {
          ...prev.reports,
          lotteryPayouts: data.lotteryReports?.payouts ?? 0,
        },
      }));

      // Lottery sales go into sales breakdown reports
      setSalesBreakdownState((prev) => ({
        ...prev,
        reports: {
          ...prev.reports,
          scratchOff: data.lotteryReports?.instantSales ?? 0,
          onlineLottery: data.lotteryReports?.onlineSales ?? 0,
        },
      }));
    },
    [],
  );

  const handleReportScanningBack = useCallback(() => {
    // Only go back if lottery wasn't already closed when we started
    if (!isLotteryAlreadyClosed) {
      setWizardState((prev) => ({
        ...prev,
        currentStep: 1,
      }));
    }
  }, [isLotteryAlreadyClosed]);

  // ============ STEP 3 HANDLERS ============
  const handleMoneyReportsChange = useCallback(
    (changes: Partial<MoneyReceivedReportsState>) => {
      setMoneyReceivedState((prev) => ({
        ...prev,
        reports: { ...prev.reports, ...changes },
      }));
    },
    [],
  );

  const handleSalesReportsChange = useCallback(
    (changes: Partial<SalesBreakdownReportsState>) => {
      setSalesBreakdownState((prev) => ({
        ...prev,
        reports: { ...prev.reports, ...changes },
      }));
    },
    [],
  );

  /**
   * Handle "Complete Day Close" button click
   * Two-phase commit: First commit pending lottery close, then open shift closing form
   * This ensures lottery and day close have the same timestamp (enterprise requirement)
   */
  const handleOpenShiftClosingForm = useCallback(async () => {
    // If we have a pending lottery close (two-phase commit), commit it first
    if (pendingLotteryDayId && storeId) {
      setIsCommittingLottery(true);
      try {
        const result = await commitLotteryDayClose(storeId);

        if (result.success) {
          toast({
            title: "Lottery Closed",
            description: `Lottery day closed successfully. ${result.data?.closings_created || 0} pack(s) recorded.`,
          });

          // Clear pending state - lottery is now committed
          setWizardState((prev) => ({
            ...prev,
            pendingLotteryDayId: null,
            pendingLotteryCloseExpiresAt: null,
          }));
        } else {
          throw new Error("Failed to commit lottery close");
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to finalize lottery close";
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
        setIsCommittingLottery(false);
        return; // Don't proceed to shift closing if lottery commit failed
      }
      setIsCommittingLottery(false);
    }

    // Now open the shift closing form
    setShiftClosingFormOpen(true);
  }, [pendingLotteryDayId, storeId, toast]);

  const handleShiftClosingSuccess = useCallback(() => {
    setShiftClosingFormOpen(false);
    router.push("/mystore");
  }, [router]);

  const handleStep3Back = useCallback(() => {
    setWizardState((prev) => ({
      ...prev,
      currentStep: 2,
    }));
  }, []);

  /**
   * Cancel wizard and cleanup pending lottery close
   * Enterprise requirement: Must cancel pending close to release the lock
   */
  const handleCancelWizard = useCallback(async () => {
    if (
      !confirm("Are you sure you want to cancel? All progress will be lost.")
    ) {
      return;
    }

    // If we have a pending lottery close, cancel it to release the lock
    if (pendingLotteryDayId && storeId) {
      try {
        await cancelLotteryDayClose(storeId);
      } catch {
        // Don't block navigation - the pending close will auto-expire
      }
    }

    router.push("/mystore");
  }, [pendingLotteryDayId, storeId, router]);

  // ============ REDIRECT IF SHIFT CLOSED ============
  useEffect(() => {
    if (isShiftClosed) {
      router.replace("/mystore");
    }
  }, [isShiftClosed, router]);

  // ============ CLEANUP ON PAGE UNLOAD ============
  // Cancel pending lottery close when user navigates away or closes tab
  // Enterprise requirement: Release locks to prevent stale pending states
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingLotteryDayId && storeId) {
        // Show confirmation dialog before leaving
        e.preventDefault();
        // Modern browsers require returnValue to be set
        e.returnValue =
          "You have unsaved changes. Are you sure you want to leave?";
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [pendingLotteryDayId, storeId]);

  // ============ LOADING STATE ============
  if (
    authLoading ||
    dashboardLoading ||
    shiftLoading ||
    dayBinsLoading ||
    openShiftsLoading
  ) {
    return (
      <div
        className="flex items-center justify-center min-h-[400px]"
        data-testid="day-close-wizard-loading"
      >
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // ============ ERROR STATE ============
  if (dashboardError) {
    return (
      <div
        className="container mx-auto p-6"
        data-testid="day-close-wizard-error"
      >
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <p>Failed to load dashboard data. Please try again.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============ NO STORE STATE ============
  if (!storeId) {
    return (
      <div
        className="container mx-auto p-6"
        data-testid="day-close-wizard-no-store"
      >
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

  // Get store name and format date
  const storeName =
    dashboardData?.stores.find((s) => s.store_id === storeId)?.name ||
    "Your Store";
  const businessDate =
    lotteryData?.business_day || dayBinsData?.business_day?.date;
  const formattedDate = formatBusinessDate(businessDate);

  // Transform open shifts to blocking format for DayCloseModeScanner
  const blockingShifts = otherOpenShifts.map((shift) => ({
    shift_id: shift.shift_id,
    terminal_name: shift.terminal_name,
    cashier_name: shift.cashier_name,
    shift_number: shift.shift_number,
  }));

  // ============ RENDER ============
  return (
    <div className="min-h-screen bg-background" data-testid="day-close-wizard">
      {/* Top Navigation Bar */}
      <nav className="bg-card border-b px-6 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <span className="text-xl font-bold">Nuvana</span>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground">{storeName}</span>
          </div>
          <div className="flex items-center gap-4">
            {shiftId && (
              <Badge variant="outline" className="text-xs">
                Shift: {truncateUuid(shiftId)}
              </Badge>
            )}
          </div>
        </div>
      </nav>

      {/* Step Progress Indicator */}
      <StepIndicator
        currentStep={currentStep}
        lotteryCompleted={lotteryCompleted || isLotteryAlreadyClosed}
        reportScanningCompleted={reportScanningCompleted}
      />

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto p-6">
        {/* ============ STEP 1: LOTTERY CLOSE ============ */}
        {currentStep === 1 && (
          <div data-testid="step-1-content">
            <DayCloseModeScanner
              storeId={storeId}
              bins={dayBinsData?.bins ?? []}
              currentShiftId={shiftId || undefined}
              onCancel={handleLotteryCancel}
              onSuccess={handleLotterySuccess}
              scannedBins={scannedBins}
              onScannedBinsChange={handleScannedBinsChange}
              blockingShifts={blockingShifts}
            />
          </div>
        )}

        {/* ============ STEP 2: REPORT SCANNING ============ */}
        {currentStep === 2 && (
          <div data-testid="step-2-content">
            <ReportScanningStep
              storeId={storeId}
              onComplete={handleReportScanningComplete}
              onBack={handleReportScanningBack}
              canGoBack={!isLotteryAlreadyClosed}
              initialData={reportScanningData}
            />
          </div>
        )}

        {/* ============ STEP 3: DAY CLOSE ============ */}
        {currentStep === 3 && (
          <div data-testid="step-3-content" className="space-y-6">
            {/* Header */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold flex items-center gap-2">
                    <CalendarCheck className="h-8 w-8" />
                    Step 3: Close Day
                  </h1>
                  <p className="text-muted-foreground">
                    {storeName} - {formattedDate}
                  </p>
                </div>
              </div>
            </div>

            {/* Lottery Status Banner - shows "pending" when lottery is scanned but not yet committed */}
            <LotteryStatusBanner
              status={pendingLotteryDayId ? "pending" : "closed"}
              lotteryData={lotteryData}
              lotteryTotal={scratchOffTotal}
              isRequired={true}
            />

            {/* Open Shifts Blocking Banner */}
            {openShiftsCheckComplete && hasOtherOpenShifts && (
              <Card
                className="border-destructive bg-destructive/5"
                data-testid="open-shifts-blocking-banner"
              >
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <AlertCircle className="h-6 w-6 text-destructive flex-shrink-0 mt-0.5" />
                    <div className="space-y-3">
                      <div>
                        <h3 className="font-semibold text-destructive">
                          Cannot Close Day – Open Shifts Found
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          All shifts must be closed before the day can be
                          closed.
                        </p>
                      </div>
                      <ul className="space-y-2">
                        {otherOpenShifts.map((shift) => (
                          <li
                            key={shift.shift_id}
                            className="text-sm flex items-center gap-2"
                          >
                            <Badge
                              variant="outline"
                              className="text-amber-600 border-amber-300"
                            >
                              {shift.status}
                            </Badge>
                            <span className="font-medium">
                              {shift.terminal_name || "Unknown Terminal"}
                            </span>
                            <span className="text-muted-foreground">•</span>
                            <span>{shift.cashier_name}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
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

            {/* Lottery Breakdown Details */}
            {lotteryData && <LotterySalesDetails data={lotteryData} />}

            {/* Action Buttons */}
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {pendingLotteryDayId
                      ? "Lottery scanned and ready. Click Complete Day Close to finalize lottery and shift."
                      : "Lottery is closed. Complete the day close when ready."}
                  </p>
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={handleStep3Back}
                      disabled={isCommittingLottery}
                    >
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Back
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleCancelWizard}
                      disabled={isCommittingLottery}
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={
                        hasOtherOpenShifts || !shiftId || isCommittingLottery
                      }
                      data-testid="complete-day-close-btn"
                      onClick={handleOpenShiftClosingForm}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      {isCommittingLottery ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Finalizing Lottery...
                        </>
                      ) : (
                        <>
                          <Check className="mr-2 h-4 w-4" />
                          Complete Day Close
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

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
        )}
      </main>
    </div>
  );
}
