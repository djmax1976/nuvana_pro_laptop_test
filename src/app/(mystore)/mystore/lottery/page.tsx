"use client";

import { useState, useMemo } from "react";
import { useClientAuth } from "@/contexts/ClientAuthContext";
import { useClientDashboard } from "@/lib/api/client-dashboard";
import { Loader2, AlertCircle, Plus, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useLotteryPacks,
  useLotteryVariances,
  usePackReception,
  usePackActivation,
  usePackDetails,
  useVarianceApproval,
  useInvalidateLottery,
} from "@/hooks/useLottery";
import { LotteryPackCard } from "@/components/lottery/LotteryPackCard";
import { PackReceptionForm } from "@/components/lottery/PackReceptionForm";
import {
  PackActivationForm,
  type PackOption,
} from "@/components/lottery/PackActivationForm";
import {
  PackDetailsModal,
  type PackDetailsData,
} from "@/components/lottery/PackDetailsModal";
import {
  VarianceAlert,
  type LotteryVariance,
} from "@/components/lottery/VarianceAlert";
import { VarianceApprovalDialog } from "@/components/lottery/VarianceApprovalDialog";
import { receivePack } from "@/lib/api/lottery";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2 } from "lucide-react";

/**
 * Lottery Management Page
 * Allows Store Managers to manage lottery packs and view reconciliation
 * Route: /mystore/lottery
 *
 * @requirements
 * - AC #1: View packs with status indicators (RECEIVED, ACTIVE, DEPLETED, RETURNED)
 * - AC #2: Pack reception form
 * - AC #3: Pack activation form
 * - AC #4: Pack details view
 * - AC #5: Variance alerts displayed prominently
 * - AC #6: Variance approval dialog
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
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [varianceDialogOpen, setVarianceDialogOpen] = useState(false);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [selectedVariance, setSelectedVariance] =
    useState<LotteryVariance | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Get first active store ID from user's accessible stores
  const storeId =
    dashboardData?.stores.find((s) => s.status === "ACTIVE")?.store_id ||
    dashboardData?.stores[0]?.store_id;

  // Fetch lottery data
  // Note: These endpoints may not be implemented yet - API functions handle 404s gracefully
  const {
    data: packs,
    isLoading: packsLoading,
    isError: packsError,
    error: packsErrorObj,
  } = useLotteryPacks(storeId);
  const {
    data: variances,
    isLoading: variancesLoading,
    isError: variancesError,
    error: variancesErrorObj,
  } = useLotteryVariances(storeId, { status: "unresolved" });

  // Fetch pack details when selected
  const { data: packDetails, isLoading: packDetailsLoading } = usePackDetails(
    selectedPackId,
    { enabled: !!selectedPackId && detailsDialogOpen },
  );

  // Mutations
  const packReceptionMutation = usePackReception();
  const packActivationMutation = usePackActivation();
  const varianceApprovalMutation = useVarianceApproval();
  const { invalidatePacks, invalidateVariances } = useInvalidateLottery();

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

  // Convert API variance response to component format
  const varianceData: LotteryVariance[] = useMemo(() => {
    if (!variances) return [];
    return variances.map((v) => ({
      variance_id: v.variance_id,
      shift_id: v.shift_id,
      pack_id: v.pack_id,
      expected_count: v.expected_count,
      actual_count: v.actual_count,
      difference: v.difference,
      approved_at: v.approved_at,
      pack: {
        pack_number: v.pack?.pack_number || "Unknown",
        game: {
          name: v.pack?.game?.name || "Unknown Game",
        },
      },
      shift: {
        shift_id: v.shift_id,
        opened_at: v.shift?.opened_at || "",
      },
    }));
  }, [variances]);

  // Handlers
  const handlePackDetailsClick = (packId: string) => {
    setSelectedPackId(packId);
    setDetailsDialogOpen(true);
  };

  const handleVarianceClick = (variance: LotteryVariance) => {
    setSelectedVariance(variance);
    setVarianceDialogOpen(true);
  };

  const handlePackReception = async (
    data: Parameters<typeof receivePack>[0],
  ) => {
    try {
      await packReceptionMutation.mutateAsync(data);
      invalidatePacks();
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
      invalidatePacks();
      setActivationDialogOpen(false);
      setSuccessMessage("Pack activated successfully");
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (error) {
      throw error; // Error handling is done in the form component
    }
  };

  const handleVarianceApproval = async (varianceId: string, reason: string) => {
    // Find the variance to get shift_id (varianceId is passed from dialog, but we need shift_id for API)
    const variance =
      varianceData.find((v) => v.variance_id === varianceId) ||
      selectedVariance;
    if (!variance) return;

    try {
      await varianceApprovalMutation.mutateAsync({
        shiftId: variance.shift_id,
        data: { variance_reason: reason },
      });
      invalidateVariances();
      invalidatePacks();
      setVarianceDialogOpen(false);
      setSelectedVariance(null);
      setSuccessMessage("Variance approved successfully");
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (error) {
      throw error; // Error handling is done in the dialog component
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
            Manage lottery packs and view reconciliation for{" "}
            {dashboardData?.stores.find((s) => s.store_id === storeId)?.name ||
              "your store"}
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

      {/* Variance Alerts */}
      {!variancesLoading && !variancesError && (
        <VarianceAlert
          variances={varianceData}
          onVarianceClick={handleVarianceClick}
        />
      )}

      {/* Variances Error State */}
      {variancesError && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-sm font-medium text-destructive">
              Failed to load variances
            </p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {variancesErrorObj instanceof Error
              ? variancesErrorObj.message
              : "Please try refreshing the page."}
          </p>
        </div>
      )}

      {/* Packs Loading State */}
      {packsLoading && (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">
            Loading packs...
          </span>
        </div>
      )}

      {/* Packs Error State */}
      {packsError && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-sm font-medium text-destructive">
              Failed to load packs
            </p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {packsErrorObj instanceof Error
              ? packsErrorObj.message
              : "Please try refreshing the page."}
          </p>
        </div>
      )}

      {/* Packs Grid */}
      {!packsLoading && !packsError && (
        <>
          {!packs || packs.length === 0 ? (
            <div className="rounded-lg border p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No lottery packs found. Click &quot;Receive Pack&quot; to add
                your first pack.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {packs.map((pack) => (
                <LotteryPackCard
                  key={pack.pack_id}
                  pack={{
                    pack_id: pack.pack_id,
                    pack_number: pack.pack_number,
                    serial_start: pack.serial_start,
                    serial_end: pack.serial_end,
                    status: pack.status,
                    game: pack.game || {
                      game_id: pack.game_id,
                      name: "Unknown Game",
                    },
                    tickets_remaining: pack.tickets_remaining,
                    bin: pack.bin,
                  }}
                  onDetailsClick={handlePackDetailsClick}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Pack Reception Dialog */}
      <PackReceptionForm
        storeId={storeId}
        open={receptionDialogOpen}
        onOpenChange={setReceptionDialogOpen}
        onSuccess={() => {
          invalidatePacks();
        }}
      />

      {/* Pack Activation Dialog */}
      <PackActivationForm
        packs={receivedPacks}
        open={activationDialogOpen}
        onOpenChange={setActivationDialogOpen}
        onSuccess={() => {
          invalidatePacks();
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

      {/* Variance Approval Dialog */}
      {selectedVariance && (
        <VarianceApprovalDialog
          variance={selectedVariance}
          isOpen={varianceDialogOpen}
          onClose={() => {
            setVarianceDialogOpen(false);
            setSelectedVariance(null);
          }}
          onSuccess={() => {
            invalidateVariances();
            invalidatePacks();
          }}
          onApprove={handleVarianceApproval}
        />
      )}
    </div>
  );
}
