"use client";

import { useState, useMemo } from "react";
import { useClientAuth } from "@/contexts/ClientAuthContext";
import { useClientDashboard } from "@/lib/api/client-dashboard";
import { Loader2, AlertCircle, Plus, Zap, Moon } from "lucide-react";
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
import { CloseDayModal } from "@/components/lottery/CloseDayModal";
import {
  PackActivationForm,
  type PackOption,
} from "@/components/lottery/PackActivationForm";
import {
  PackDetailsModal,
  type PackDetailsData,
} from "@/components/lottery/PackDetailsModal";
import { receivePack } from "@/lib/api/lottery";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2 } from "lucide-react";

/**
 * Lottery Management Page - Day-based Bin View
 * Displays lottery bins with day-based tracking for the current business day.
 * Route: /mystore/lottery
 *
 * Story: MyStore Lottery Page Redesign
 *
 * @requirements
 * - Display bins table with columns (Bin, Name, Amount, Pack #, Starting, Ending)
 * - Starting = first opening of the day OR last closing OR serial_start
 * - Ending = last closing of the day (grayed out, read-only)
 * - Click row to open pack details modal
 * - Collapsible depleted packs section
 * - Keep Receive Pack and Activate Pack buttons
 * - AC #8: All API calls use proper authentication (JWT tokens), RLS policies ensure store access only
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
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setReceptionDialogOpen(true)}
            data-testid="receive-pack-button"
          >
            <Plus className="mr-2 h-4 w-4" />
            Receive Pack
          </Button>
          <Button
            onClick={() => setCloseDayDialogOpen(true)}
            variant="outline"
            data-testid="close-day-button"
            disabled={!dayBinsData?.bins.some((bin) => bin.pack !== null)}
          >
            <Moon className="mr-2 h-4 w-4" />
            Close Day
          </Button>
          <Button
            onClick={() => setActivationDialogOpen(true)}
            variant="outline"
            data-testid="activate-pack-button"
            disabled={receivedPacks.length === 0}
          >
            <Zap className="mr-2 h-4 w-4" />
            Activate Pack
          </Button>
        </div>
      </div>

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

      {/* Close Day Modal */}
      {dayBinsData && (
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
        />
      )}
    </div>
  );
}
