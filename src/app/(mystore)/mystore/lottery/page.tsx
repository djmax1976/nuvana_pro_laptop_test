"use client";

import { useState, useMemo, useCallback } from "react";
import { useClientAuth } from "@/contexts/ClientAuthContext";
import { useClientDashboard } from "@/lib/api/client-dashboard";
import {
  Loader2,
  AlertCircle,
  Plus,
  Zap,
  Moon,
  PenLine,
  X,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useLotteryPacks,
  usePackReception,
  usePackActivation,
  usePackDetails,
  useInvalidateLottery,
  useLotteryDayBins,
} from "@/hooks/useLottery";
import { DayBinsTable } from "@/components/lottery/DayBinsTable";
import { DepletedPacksSection } from "@/components/lottery/DepletedPacksSection";
import { PackReceptionForm } from "@/components/lottery/PackReceptionForm";
import {
  CloseDayModal,
  type ScannedBin,
} from "@/components/lottery/CloseDayModal";
import {
  PackActivationForm,
  type PackOption,
} from "@/components/lottery/PackActivationForm";
import {
  PackDetailsModal,
  type PackDetailsData,
} from "@/components/lottery/PackDetailsModal";
import { ManualEntryAuthModal } from "@/components/lottery/ManualEntryAuthModal";
import { ManualEntryIndicator } from "@/components/lottery/ManualEntryIndicator";
import { receivePack, closeLotteryDay } from "@/lib/api/lottery";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2 } from "lucide-react";

/**
 * Manual entry state interface
 * Tracks manual entry mode activation and authorization
 *
 * MCP Guidance Applied:
 * - FE-001: STATE_MANAGEMENT - Sensitive authorization state managed in memory
 * - SEC-010: AUTHZ - Authorization tracked with user ID for audit
 */
interface ManualEntryState {
  isActive: boolean;
  authorizedBy: {
    userId: string;
    name: string;
  } | null;
  authorizedAt: Date | null;
}

/**
 * Lottery Management Page - Day-based Bin View
 * Displays lottery bins with day-based tracking for the current business day.
 * Route: /mystore/lottery
 *
 * Story: MyStore Lottery Page Redesign
 * Story: Lottery Manual Entry Feature
 *
 * @requirements
 * - Display bins table with columns (Bin, Name, Amount, Pack #, Starting, Ending)
 * - Starting = first opening of the day OR last closing OR serial_start
 * - Ending = last closing of the day (grayed out, read-only by default)
 * - Click row to open pack details modal
 * - Collapsible depleted packs section
 * - Keep Receive Pack and Activate Pack buttons
 * - Manual Entry button: Opens auth modal, then enables inline ending serial inputs
 * - Close Day: When in manual entry mode, saves data from table inputs
 * - AC #8: All API calls use proper authentication (JWT tokens), RLS policies ensure store access only
 *
 * MCP Guidance Applied:
 * - FE-002: FORM_VALIDATION - Strict validation for 3-digit serial numbers
 * - SEC-014: INPUT_VALIDATION - Length, type, and format constraints on inputs
 * - SEC-010: AUTHZ - Permission-based access control for manual entry
 * - FE-001: STATE_MANAGEMENT - Secure state management for auth data
 */
export default function LotteryManagementPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useClientAuth();
  const {
    data: dashboardData,
    isLoading: dashboardLoading,
    isError: dashboardError,
    error: dashboardErrorObj,
  } = useClientDashboard();
  const { toast } = useToast();

  // Dialog state management
  const [receptionDialogOpen, setReceptionDialogOpen] = useState(false);
  const [activationDialogOpen, setActivationDialogOpen] = useState(false);
  const [closeDayDialogOpen, setCloseDayDialogOpen] = useState(false);
  // Scanned bins state - persists when modal is closed until day is closed
  const [scannedBins, setScannedBins] = useState<ScannedBin[]>([]);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Manual entry state management
  const [manualEntryAuthModalOpen, setManualEntryAuthModalOpen] =
    useState(false);
  const [manualEntryState, setManualEntryState] = useState<ManualEntryState>({
    isActive: false,
    authorizedBy: null,
    authorizedAt: null,
  });

  // Manual entry values - keyed by bin_id
  const [manualEndingValues, setManualEndingValues] = useState<
    Record<string, string>
  >({});

  // Submission state for manual entry close day
  const [isSubmittingManualClose, setIsSubmittingManualClose] = useState(false);

  // Get first active store ID from user's accessible stores
  const storeId =
    dashboardData?.stores.find((s) => s.status === "ACTIVE")?.store_id ||
    dashboardData?.stores[0]?.store_id;

  // Fetch day bins data for the new table view
  const {
    data: dayBinsData,
    isLoading: dayBinsLoading,
    isError: dayBinsError,
    error: dayBinsErrorObj,
  } = useLotteryDayBins(storeId);

  // Fetch lottery packs for activation form (need RECEIVED packs)
  const { data: packs, isLoading: packsLoading } = useLotteryPacks(storeId);

  // Fetch pack details when selected
  const { data: packDetails, isLoading: packDetailsLoading } = usePackDetails(
    selectedPackId,
    { enabled: !!selectedPackId && detailsDialogOpen },
  );

  // Mutations
  const packReceptionMutation = usePackReception();
  const packActivationMutation = usePackActivation();
  const { invalidatePacks, invalidateAll } = useInvalidateLottery();

  // Filter packs for activation form (RECEIVED status only)
  const receivedPacks: PackOption[] = useMemo(() => {
    if (!packs) return [];
    return packs
      .filter((pack) => pack.status === "RECEIVED")
      .map((pack) => ({
        pack_id: pack.pack_id,
        pack_number: pack.pack_number,
        game: pack.game || { game_id: pack.game_id, name: "Unknown Game" },
        serial_start: pack.serial_start,
        serial_end: pack.serial_end,
      }));
  }, [packs]);

  // Handlers
  const handlePackDetailsClick = (packId: string) => {
    setSelectedPackId(packId);
    setDetailsDialogOpen(true);
  };

  const handlePackReception = async (
    data: Parameters<typeof receivePack>[0],
  ) => {
    try {
      await packReceptionMutation.mutateAsync(data);
      invalidateAll(); // Invalidate all lottery data including day bins
      setReceptionDialogOpen(false);
      setSuccessMessage("Pack received successfully");
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (error) {
      throw error; // Error handling is done in the form component
    }
  };

  const handlePackActivation = async (packId: string) => {
    try {
      await packActivationMutation.mutateAsync(packId);
      invalidateAll(); // Invalidate all lottery data including day bins
      setActivationDialogOpen(false);
      setSuccessMessage("Pack activated successfully");
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (error) {
      throw error; // Error handling is done in the form component
    }
  };

  /**
   * Handle Manual Entry button click
   * Opens the auth modal for PIN verification
   */
  const handleManualEntryClick = useCallback(() => {
    setManualEntryAuthModalOpen(true);
  }, []);

  /**
   * Handle Manual Entry authorization success
   * Called when user successfully verifies with LOTTERY_MANUAL_ENTRY permission
   */
  const handleManualEntryAuthorized = useCallback(
    (authorizedBy: { userId: string; name: string }) => {
      setManualEntryState({
        isActive: true,
        authorizedBy,
        authorizedAt: new Date(),
      });
      setManualEntryAuthModalOpen(false);

      // Clear any previous manual entry values
      setManualEndingValues({});

      toast({
        title: "Manual Entry Enabled",
        description: `Authorized by ${authorizedBy.name}. You can now enter ending serial numbers.`,
      });
    },
    [toast],
  );

  /**
   * Handle cancel/exit manual entry mode
   * Clears authorization and entered values
   */
  const handleCancelManualEntry = useCallback(() => {
    setManualEntryState({
      isActive: false,
      authorizedBy: null,
      authorizedAt: null,
    });
    setManualEndingValues({});

    toast({
      title: "Manual Entry Cancelled",
      description: "Manual entry mode has been deactivated.",
    });
  }, [toast]);

  /**
   * Handle ending value change in manual entry mode
   * Called when user types in an ending serial input
   */
  const handleEndingValueChange = useCallback(
    (binId: string, value: string) => {
      setManualEndingValues((prev) => ({
        ...prev,
        [binId]: value,
      }));
    },
    [],
  );

  /**
   * Handle input complete (3 digits entered)
   * Can be used for audio feedback or other UX enhancements
   */
  const handleInputComplete = useCallback((binId: string) => {
    // Optional: Add audio feedback or visual confirmation
    // The auto-advance is handled in DayBinsTable
  }, []);

  /**
   * Check if all active bins have valid 3-digit ending values
   * Used to enable/disable the Close Day button in manual entry mode
   */
  const canCloseManualEntry = useMemo(() => {
    if (!manualEntryState.isActive || !dayBinsData?.bins) return false;

    const activeBins = dayBinsData.bins.filter((bin) => bin.pack !== null);
    if (activeBins.length === 0) return false;

    return activeBins.every((bin) => {
      const value = manualEndingValues[bin.bin_id];
      return value && /^\d{3}$/.test(value);
    });
  }, [manualEntryState.isActive, dayBinsData?.bins, manualEndingValues]);

  /**
   * Handle Close Day in manual entry mode
   * Submits the manually entered ending serial numbers
   */
  const handleManualCloseDay = useCallback(async () => {
    if (!canCloseManualEntry || !storeId || !dayBinsData?.bins) {
      return;
    }

    setIsSubmittingManualClose(true);

    try {
      // Build closings array from manual entry values
      const activeBins = dayBinsData.bins.filter((bin) => bin.pack !== null);
      const closings = activeBins.map((bin) => ({
        pack_id: bin.pack!.pack_id,
        closing_serial: manualEndingValues[bin.bin_id],
      }));

      // Submit to API with MANUAL entry method
      const response = await closeLotteryDay(storeId, {
        closings,
        entry_method: "MANUAL",
      });

      if (response.success && response.data) {
        // Reset manual entry state
        setManualEntryState({
          isActive: false,
          authorizedBy: null,
          authorizedAt: null,
        });
        setManualEndingValues({});

        // Invalidate data to refresh the table
        invalidateAll();

        toast({
          title: "Day Closed Successfully",
          description: `Closed ${response.data.closings_created} pack(s) for business day ${response.data.business_day}`,
        });

        setSuccessMessage("Lottery day closed successfully via manual entry");
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        throw new Error("Failed to close lottery day");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to close lottery day";
      toast({
        title: "Close Day Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSubmittingManualClose(false);
    }
  }, [
    canCloseManualEntry,
    storeId,
    dayBinsData?.bins,
    manualEndingValues,
    invalidateAll,
    toast,
  ]);

  /**
   * Handle Close Day button click
   * Routes to either manual close (if in manual entry mode) or opens scan modal
   */
  const handleCloseDayClick = useCallback(() => {
    if (manualEntryState.isActive) {
      handleManualCloseDay();
    } else {
      setCloseDayDialogOpen(true);
    }
  }, [manualEntryState.isActive, handleManualCloseDay]);

  // Loading state - waiting for auth or dashboard data
  if (authLoading || dashboardLoading) {
    return (
      <div className="space-y-6" data-testid="lottery-management-page">
        <div className="space-y-1">
          <h1 className="text-heading-2 font-bold text-foreground">
            Lottery Management
          </h1>
          <p className="text-muted-foreground">Loading...</p>
        </div>
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Error state - dashboard data failed to load
  if (dashboardError) {
    return (
      <div className="space-y-6" data-testid="lottery-management-page">
        <div className="space-y-1">
          <h1 className="text-heading-2 font-bold text-foreground">
            Lottery Management
          </h1>
          <p className="text-destructive">
            Failed to load store information:{" "}
            {dashboardErrorObj?.message || "Unknown error"}
          </p>
        </div>
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-sm font-medium text-destructive">
              Error loading dashboard
            </p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {dashboardErrorObj instanceof Error
              ? dashboardErrorObj.message
              : "An unknown error occurred"}
          </p>
        </div>
      </div>
    );
  }

  // No store available
  if (!storeId) {
    return (
      <div className="space-y-6" data-testid="lottery-management-page">
        <div className="space-y-1">
          <h1 className="text-heading-2 font-bold text-foreground">
            Lottery Management
          </h1>
          <p className="text-muted-foreground">No active store available</p>
        </div>
        <div className="rounded-lg border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            You need access to an active store to manage lottery packs.
          </p>
        </div>
      </div>
    );
  }

  // Get store name and current date for subtitle
  const storeName =
    dashboardData?.stores.find((s) => s.store_id === storeId)?.name ||
    "your store";
  const currentDate = dayBinsData?.business_day?.date
    ? new Date(dayBinsData.business_day.date + "T12:00:00").toLocaleDateString(
        undefined,
        {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        },
      )
    : new Date().toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

  // Format day start time if available
  const dayStartTime = dayBinsData?.business_day?.first_shift_opened_at
    ? new Date(dayBinsData.business_day.first_shift_opened_at).toLocaleString(
        undefined,
        {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        },
      )
    : null;

  // Convert pack details to modal format
  // Note: Convert null to undefined for location since PackDetailsData expects string | undefined
  const packDetailsForModal: PackDetailsData | null = packDetails
    ? ({
        pack_id: packDetails.pack_id,
        pack_number: packDetails.pack_number,
        serial_start: packDetails.serial_start,
        serial_end: packDetails.serial_end,
        status: packDetails.status,
        game: packDetails.game || {
          game_id: packDetails.game_id,
          name: "Unknown Game",
        },
        bin: packDetails.bin
          ? {
              bin_id: packDetails.bin.bin_id,
              name: packDetails.bin.name,
              location: packDetails.bin.location ?? undefined,
            }
          : null,
        received_at: packDetails.received_at,
        activated_at: packDetails.activated_at,
        depleted_at: packDetails.depleted_at ?? undefined,
        returned_at: packDetails.returned_at ?? undefined,
        tickets_remaining: packDetails.tickets_remaining,
        shift_openings: packDetails.shift_openings?.map((o) => ({
          opening_id: o.opening_id,
          shift_id: o.shift_id,
          opening_serial: o.opening_serial,
          created_at: o.opened_at, // API uses opened_at, component expects created_at
        })),
        shift_closings: packDetails.shift_closings?.map((c) => ({
          closing_id: c.closing_id,
          shift_id: c.shift_id,
          closing_serial: c.closing_serial,
          opening_serial: c.opening_serial,
          expected_count: c.expected_count,
          actual_count: c.actual_count,
          difference: c.difference,
          has_variance: c.has_variance,
          created_at: c.closed_at, // API uses closed_at, component expects created_at
        })),
      } as PackDetailsData)
    : null;

  return (
    <div className="space-y-6" data-testid="lottery-management-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-heading-2 font-bold text-foreground">
            Lottery Management
          </h1>
          <p className="text-muted-foreground">
            {storeName} &bull; {currentDate}
          </p>
          {dayStartTime && (
            <p className="text-sm text-muted-foreground">
              Day started: {dayStartTime}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setReceptionDialogOpen(true)}
            data-testid="receive-pack-button"
            disabled={manualEntryState.isActive}
          >
            <Plus className="mr-2 h-4 w-4" />
            Receive Pack
          </Button>

          {/* Manual Entry Button - Shows Cancel when active */}
          {manualEntryState.isActive ? (
            <Button
              onClick={handleCancelManualEntry}
              variant="destructive"
              data-testid="cancel-manual-entry-button"
            >
              <X className="mr-2 h-4 w-4" />
              Cancel Manual Entry
            </Button>
          ) : (
            <Button
              onClick={handleManualEntryClick}
              variant="outline"
              data-testid="manual-entry-button"
              disabled={!dayBinsData?.bins.some((bin) => bin.pack !== null)}
            >
              <PenLine className="mr-2 h-4 w-4" />
              Manual Entry
            </Button>
          )}

          {/* Close Day Button - Different behavior based on manual entry mode */}
          <Button
            onClick={handleCloseDayClick}
            variant={manualEntryState.isActive ? "default" : "outline"}
            data-testid="close-day-button"
            disabled={
              manualEntryState.isActive
                ? !canCloseManualEntry || isSubmittingManualClose
                : !dayBinsData?.bins.some((bin) => bin.pack !== null)
            }
          >
            {isSubmittingManualClose ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : manualEntryState.isActive ? (
              <Save className="mr-2 h-4 w-4" />
            ) : (
              <Moon className="mr-2 h-4 w-4" />
            )}
            {manualEntryState.isActive ? "Save & Close Day" : "Close Day"}
          </Button>

          <Button
            onClick={() => setActivationDialogOpen(true)}
            variant="outline"
            data-testid="activate-pack-button"
            disabled={receivedPacks.length === 0 || manualEntryState.isActive}
          >
            <Zap className="mr-2 h-4 w-4" />
            Activate Pack
          </Button>
        </div>
      </div>

      {/* Manual Entry Mode Indicator */}
      {manualEntryState.isActive && (
        <ManualEntryIndicator
          isActive={manualEntryState.isActive}
          authorizedBy={manualEntryState.authorizedBy}
          authorizedAt={manualEntryState.authorizedAt}
        />
      )}

      {/* Success Message */}
      {successMessage && (
        <Alert
          className="border-green-500/50 bg-green-50 dark:bg-green-950/20"
          data-testid="success-message"
        >
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      {/* Day Bins Table Loading State */}
      {dayBinsLoading && (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">
            Loading bins...
          </span>
        </div>
      )}

      {/* Day Bins Table Error State */}
      {dayBinsError && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-sm font-medium text-destructive">
              Failed to load bins
            </p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {dayBinsErrorObj instanceof Error
              ? dayBinsErrorObj.message
              : "Please try refreshing the page."}
          </p>
        </div>
      )}

      {/* Day Bins Table */}
      {!dayBinsLoading && !dayBinsError && dayBinsData && (
        <>
          <DayBinsTable
            bins={dayBinsData.bins}
            onRowClick={handlePackDetailsClick}
            manualEntryMode={manualEntryState.isActive}
            endingValues={manualEndingValues}
            onEndingChange={handleEndingValueChange}
            onInputComplete={handleInputComplete}
          />

          {/* Depleted Packs Section (Collapsible) */}
          <DepletedPacksSection
            depletedPacks={dayBinsData.depleted_packs}
            defaultOpen={false}
          />
        </>
      )}

      {/* Empty State - No bins configured */}
      {!dayBinsLoading && !dayBinsError && dayBinsData?.bins.length === 0 && (
        <div className="rounded-lg border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No bins configured for this store. Contact your administrator to set
            up lottery bins.
          </p>
        </div>
      )}

      {/* Pack Reception Dialog */}
      <PackReceptionForm
        storeId={storeId}
        open={receptionDialogOpen}
        onOpenChange={setReceptionDialogOpen}
        onSuccess={() => {
          invalidateAll();
        }}
      />

      {/* Pack Activation Dialog */}
      <PackActivationForm
        packs={receivedPacks}
        open={activationDialogOpen}
        onOpenChange={setActivationDialogOpen}
        onSuccess={() => {
          invalidateAll();
        }}
        onActivate={handlePackActivation}
      />

      {/* Pack Details Modal */}
      <PackDetailsModal
        pack={packDetailsForModal}
        open={detailsDialogOpen}
        onOpenChange={setDetailsDialogOpen}
        isLoading={packDetailsLoading}
      />

      {/* Close Day Modal - Only used for scan mode */}
      {dayBinsData && !manualEntryState.isActive && (
        <CloseDayModal
          storeId={storeId}
          bins={dayBinsData.bins}
          open={closeDayDialogOpen}
          onOpenChange={setCloseDayDialogOpen}
          onSuccess={() => {
            invalidateAll();
            setSuccessMessage("Lottery day closed successfully");
            setTimeout(() => setSuccessMessage(null), 5000);
          }}
          scannedBins={scannedBins}
          onScannedBinsChange={setScannedBins}
        />
      )}

      {/* Manual Entry Auth Modal */}
      {storeId && (
        <ManualEntryAuthModal
          open={manualEntryAuthModalOpen}
          onOpenChange={setManualEntryAuthModalOpen}
          storeId={storeId}
          onAuthorized={handleManualEntryAuthorized}
        />
      )}
    </div>
  );
}
