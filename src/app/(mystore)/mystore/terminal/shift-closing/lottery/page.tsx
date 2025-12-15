"use client";

/**
 * Lottery Shift Closing Page
 *
 * Story: 10.1 - Lottery Shift Closing Page UI
 *
 * Displays all lottery bins with their active packs and allows cashiers
 * to enter ending serial numbers to close out lottery sales.
 *
 * Route: /mystore/terminal/shift-closing/lottery
 */

import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  useLotteryClosingData,
  submitLotteryClosing,
  LotteryClosingSubmissionInput,
} from "@/lib/api/shift-closing";
import { useShiftDetail } from "@/lib/api/shifts";
import { Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ActivePacksTable } from "@/components/shift-closing/ActivePacksTable";
import { SoldPacksTable } from "@/components/shift-closing/SoldPacksTable";
import { ShiftClosingActions } from "@/components/shift-closing/ShiftClosingActions";
import { ManualEntryAuthModal } from "@/components/shift-closing/ManualEntryAuthModal";
import { ManualEntryIndicator } from "@/components/shift-closing/ManualEntryIndicator";
import { AddBinModal } from "@/components/shift-closing/AddBinModal";
import {
  ActivatePackModal,
  PackInfo,
} from "@/components/shift-closing/ActivatePackModal";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { BinWithPack } from "@/lib/api/shift-closing";

/**
 * Manual entry state interface
 * Tracks manual entry mode activation and authorization
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
 * Lottery Shift Closing Page Component
 * Main page component for entering ending serial numbers
 */
export default function LotteryShiftClosingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const shiftId = searchParams.get("shiftId") ?? undefined;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch shift data to get storeId
  const { data: shiftData, isLoading: isLoadingShift } = useShiftDetail(
    shiftId ?? null,
    {
      enabled: !!shiftId,
    },
  );

  // Fetch closing data
  const {
    data: closingData,
    isLoading,
    error,
  } = useLotteryClosingData(shiftId ?? null, {
    enabled: !!shiftId,
  });

  // State for ending number entries
  const [endingNumbers, setEndingNumbers] = useState<Record<string, string>>(
    {},
  );

  // State for manual entry mode
  const [manualEntryState, setManualEntryState] = useState<ManualEntryState>({
    isActive: false,
    authorizedBy: null,
    authorizedAt: null,
  });

  // State for manual entry auth modal
  const [isManualEntryModalOpen, setIsManualEntryModalOpen] = useState(false);

  // State for add bin modal
  const [isAddBinModalOpen, setIsAddBinModalOpen] = useState(false);

  // State for activate pack modal
  const [isActivatePackModalOpen, setIsActivatePackModalOpen] = useState(false);

  // Check if all active bins have valid 3-digit entries
  const canProceed = useMemo(() => {
    if (!closingData?.bins) return false;

    const activeBins = closingData.bins.filter((bin) => bin.pack !== null);
    return activeBins.every((bin) => {
      const entry = endingNumbers[bin.bin_id];
      return entry && entry.length === 3 && /^\d{3}$/.test(entry);
    });
  }, [closingData?.bins, endingNumbers]);

  // Handle ending number change
  const handleEndingNumberChange = (binId: string, value: string) => {
    setEndingNumbers((prev) => ({
      ...prev,
      [binId]: value,
    }));
  };

  // Handle input complete (3 digits entered) - triggers auto-advance
  const handleInputComplete = (binId: string) => {
    // Auto-advance is handled by ActivePacksTable component
    // This callback can be used for additional logic if needed
  };

  // State for submission loading
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handle Next button click - submit closing data
  const handleNext = async () => {
    if (!canProceed || !shiftId || !closingData?.bins || !user?.id) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Collect closing data from state
      const activeBins = closingData.bins.filter((bin) => bin.pack !== null);
      const closings: LotteryClosingSubmissionInput[] = activeBins.map(
        (bin) => {
          const endingSerial = endingNumbers[bin.bin_id];
          const entryMethod = manualEntryState.isActive ? "MANUAL" : "SCAN";

          const closing: LotteryClosingSubmissionInput = {
            bin_id: bin.bin_id,
            pack_id: bin.pack!.pack_id,
            ending_serial: endingSerial,
            entry_method: entryMethod,
          };

          // Add manual entry authorization if manual entry was used
          if (entryMethod === "MANUAL" && manualEntryState.authorizedBy) {
            closing.manual_entry_authorized_by =
              manualEntryState.authorizedBy.userId;
            closing.manual_entry_authorized_at =
              manualEntryState.authorizedAt?.toISOString();
          }

          return closing;
        },
      );

      // Submit closing data
      const response = await submitLotteryClosing(shiftId, closings, user.id);

      if (response.success && response.data?.summary) {
        const summary = response.data.summary;

        // Show success message with summary
        toast({
          title: "Closing Data Submitted",
          description: `Closed ${summary.packs_closed} pack(s), ${summary.packs_depleted} depleted, ${summary.total_tickets_sold} tickets sold`,
        });

        // If variances detected, show them (TODO: Show variance dialog)
        if (summary.variances.length > 0) {
          toast({
            title: "Variances Detected",
            description: `${summary.variances.length} variance(s) detected. Please review.`,
            variant: "warning",
          });
          // TODO: Show VarianceSummaryDialog component
        }

        // Navigate to next page in closing flow
        router.push(`/mystore/terminal/shift-closing/cash?shiftId=${shiftId}`);
      } else {
        throw new Error("Failed to submit closing data");
      }
    } catch (error: any) {
      // Handle errors gracefully - preserve user data
      const errorMessage =
        error.message || "Failed to submit closing data. Please try again.";
      toast({
        title: "Submission Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Add Bin button click
  const handleAddBin = () => {
    setIsAddBinModalOpen(true);
  };

  // Handle bin created callback - refresh closing data
  const handleBinCreated = (newBin: {
    bin_id: string;
    name: string;
    location?: string;
    display_order: number;
    is_active: boolean;
    pack?: {
      pack_id: string;
      pack_number: string;
      game: {
        name: string;
        price: number;
      };
    };
  }) => {
    // Refetch closing data to show newly created bin
    queryClient.invalidateQueries({
      queryKey: ["lottery-closing-data", shiftId],
    });
    setIsAddBinModalOpen(false);

    // Show success toast
    const gameName = newBin.pack?.game?.name || "pack";
    toast({
      title: "Bin Created",
      description: `${newBin.name} created with ${gameName}`,
    });
  };

  // Handle Activate Pack button click
  const handleActivatePack = () => {
    setIsActivatePackModalOpen(true);
  };

  // Handle pack activated callback - refresh closing data
  const handlePackActivated = (
    updatedBin: BinWithPack,
    previousPack?: PackInfo,
  ) => {
    // Refetch closing data to show updated bin with new pack
    queryClient.invalidateQueries({
      queryKey: ["shift-closing", "closing-data", shiftId ?? undefined],
    });
    setIsActivatePackModalOpen(false);

    // Show success toast
    const packNumber = updatedBin.pack?.pack_number || "pack";
    const binNumber = updatedBin.bin_number;
    toast({
      title: "Pack Activated",
      description: `Pack ${packNumber} activated in Bin ${binNumber}`,
    });

    // If previous pack was replaced, it will appear in Sold Packs section automatically
    // via the query invalidation above
  };

  // Handle Manual Entry button click
  const handleManualEntry = () => {
    setIsManualEntryModalOpen(true);
  };

  // Handle manual entry authorization
  const handleManualEntryAuthorized = (authorizedBy: {
    userId: string;
    name: string;
  }) => {
    setManualEntryState({
      isActive: true,
      authorizedBy,
      authorizedAt: new Date(),
    });
    setIsManualEntryModalOpen(false);
  };

  // Reset manual entry state on navigation/unmount
  useEffect(() => {
    return () => {
      // Reset state when component unmounts
      setManualEntryState({
        isActive: false,
        authorizedBy: null,
        authorizedAt: null,
      });
    };
  }, []);

  // Reset manual entry state when shiftId changes (navigation to different shift)
  useEffect(() => {
    setManualEntryState({
      isActive: false,
      authorizedBy: null,
      authorizedAt: null,
    });
  }, [shiftId]);

  if (isLoading || isLoadingShift) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load closing data: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  if (!closingData) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>No closing data available</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="container mx-auto py-4 md:py-6 px-4 md:px-6 space-y-4 md:space-y-6">
      {/* Page Header */}
      <div className="space-y-2">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          Lottery Shift Closing
        </h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Enter closing serial numbers for each lottery pack
        </p>
      </div>

      {/* Manual Entry Mode Indicator */}
      <ManualEntryIndicator
        isActive={manualEntryState.isActive}
        authorizedBy={manualEntryState.authorizedBy}
        authorizedAt={manualEntryState.authorizedAt}
      />

      {/* Active Packs Table */}
      <div className="space-y-2 md:space-y-4">
        <h2 className="text-lg md:text-xl font-semibold">Active Packs</h2>
        <ActivePacksTable
          bins={closingData.bins}
          endingValues={endingNumbers}
          onChange={handleEndingNumberChange}
          onComplete={handleInputComplete}
          manualEntryMode={manualEntryState.isActive}
        />
      </div>

      {/* Sold Packs Section */}
      <SoldPacksTable soldPacks={closingData.soldPacks} />

      {/* Action Buttons */}
      <ShiftClosingActions
        canProceed={canProceed}
        onAddBin={handleAddBin}
        onActivatePack={handleActivatePack}
        onManualEntry={handleManualEntry}
        onNext={handleNext}
      />

      {/* Manual Entry Auth Modal */}
      {shiftData?.store_id && (
        <ManualEntryAuthModal
          open={isManualEntryModalOpen}
          onOpenChange={setIsManualEntryModalOpen}
          storeId={shiftData.store_id}
          onAuthorized={handleManualEntryAuthorized}
        />
      )}

      {/* Add Bin Modal */}
      {shiftData?.store_id && shiftId && user?.id && (
        <AddBinModal
          open={isAddBinModalOpen}
          onOpenChange={setIsAddBinModalOpen}
          storeId={shiftData.store_id}
          currentShiftId={shiftId}
          currentUserId={user.id}
          existingBinCount={closingData?.bins?.length || 0}
          onBinCreated={handleBinCreated}
        />
      )}

      {/* Activate Pack Modal */}
      {shiftData?.store_id && shiftId && closingData?.bins && (
        <ActivatePackModal
          open={isActivatePackModalOpen}
          onOpenChange={setIsActivatePackModalOpen}
          storeId={shiftData.store_id}
          currentShiftId={shiftId}
          bins={closingData.bins}
          onPackActivated={handlePackActivated}
        />
      )}
    </div>
  );
}
