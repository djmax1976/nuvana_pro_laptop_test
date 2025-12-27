"use client";

/**
 * Enhanced Pack Activation Form Component
 * Complete form for activating a lottery pack with bin assignment
 *
 * Story: Pack Activation UX Enhancement
 *
 * Features:
 * - Pack search with debounced combobox
 * - Bin selection with occupation status
 * - Automatic depletion of existing pack when bin is occupied
 * - Serial number validation
 * - Cashier authentication for non-managers
 * - Manager override (no auth required)
 *
 * MCP Guidance Applied:
 * - FE-002: FORM_VALIDATION - Comprehensive form validation
 * - SEC-014: INPUT_VALIDATION - Strict validation before submission
 * - SEC-010: AUTHZ - Role-based activation flow
 * - DB-001: ORM_USAGE - Uses API for database operations
 */

import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, CheckCircle2, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useClientAuth } from "@/contexts/ClientAuthContext";
import { useFullPackActivation, useLotteryDayBins } from "@/hooks/useLottery";
import {
  PackSearchCombobox,
  type PackSearchOption,
} from "./PackSearchCombobox";
import { BinSelector } from "./BinSelector";
import {
  LotteryAuthModal,
  type LotteryAuthResult,
  type SerialOverrideApproval,
} from "./LotteryAuthModal";
import type { DayBin, FullActivatePackInput } from "@/lib/api/lottery";

/**
 * Form validation schema
 * MCP SEC-014: INPUT_VALIDATION - Strict schemas with format constraints
 */
const activationFormSchema = z.object({
  pack_id: z.string().uuid("Please select a valid pack"),
  bin_id: z.string().uuid("Please select a valid bin"),
  serial_start: z.string().regex(/^\d{3}$/, "Serial must be exactly 3 digits"),
});

type ActivationFormValues = z.infer<typeof activationFormSchema>;

/**
 * Validates that a serial number falls within the pack's valid range.
 * Uses BigInt for accurate comparison of large serial numbers (24+ digits).
 *
 * MCP FE-002: FORM_VALIDATION - Mirror backend validation client-side
 * MCP SEC-014: INPUT_VALIDATION - Strict validation before submission
 *
 * Validation Rules:
 * 1. Must be exactly 3 numeric digits
 * 2. Must be within the pack's valid range (inclusive)
 *
 * @returns true if valid, false if invalid
 */
function validateSerialInRange(
  serial: string,
  packSerialStart: string,
  packSerialEnd: string,
): boolean {
  // Skip validation for default "000" value
  if (serial === "000") {
    return true;
  }

  const trimmedSerial = serial.trim();

  // Must be exactly 3 numeric digits
  if (!/^\d{3}$/.test(trimmedSerial)) {
    return false;
  }

  // Use BigInt for accurate comparison (handles numbers > Number.MAX_SAFE_INTEGER)
  try {
    const userSerialBigInt = BigInt(trimmedSerial);
    const rangeStartBigInt = BigInt(packSerialStart.trim());
    const rangeEndBigInt = BigInt(packSerialEnd.trim());

    // Must be within the pack's valid range
    return (
      userSerialBigInt >= rangeStartBigInt && userSerialBigInt <= rangeEndBigInt
    );
  } catch {
    return false;
  }
}

/**
 * Manager roles that can activate without cashier authentication
 */
const MANAGER_ROLES = [
  "CLIENT_OWNER",
  "CLIENT_ADMIN",
  "STORE_MANAGER",
  "SYSTEM_ADMIN",
];

interface EnhancedPackActivationFormProps {
  storeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  /** Day bins data for bin selection */
  dayBins?: DayBin[];
}

/**
 * EnhancedPackActivationForm component
 * Complete form for pack activation with authentication flow
 */
export function EnhancedPackActivationForm({
  storeId,
  open,
  onOpenChange,
  onSuccess,
  dayBins,
}: EnhancedPackActivationFormProps) {
  const { toast } = useToast();
  const { user, permissions } = useClientAuth();
  const fullActivationMutation = useFullPackActivation();

  // Fetch day bins if not provided
  const { data: fetchedDayBins } = useLotteryDayBins(storeId, undefined, {
    enabled: open && !dayBins,
  });

  // Use provided bins or fetched bins
  const bins = useMemo(
    () => dayBins || fetchedDayBins?.bins || [],
    [dayBins, fetchedDayBins?.bins],
  );

  // Selected pack state
  const [selectedPack, setSelectedPack] = useState<PackSearchOption | null>(
    null,
  );

  // Authentication state
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authResult, setAuthResult] = useState<LotteryAuthResult | null>(null);

  // Serial editing state
  const [isEditingSerial, setIsEditingSerial] = useState(false);

  // Serial validation state (true = invalid, used for red border styling)
  // SEC-014: Real-time validation feedback for serial number input
  const [isSerialInvalid, setIsSerialInvalid] = useState(false);

  // Serial override approval state (for dual-auth when cashier needs manager to approve)
  const [showSerialOverrideModal, setShowSerialOverrideModal] = useState(false);
  const [serialOverrideApproval, setSerialOverrideApproval] =
    useState<SerialOverrideApproval | null>(null);

  // Check if user is a manager (can skip authentication)
  const isManager = useMemo(() => {
    return user?.roles?.some((role) => MANAGER_ROLES.includes(role)) || false;
  }, [user?.roles]);

  // Check if user can modify starting serial (requires LOTTERY_SERIAL_OVERRIDE permission)
  // For managers: check logged-in user's permissions
  // For cashiers with auth: check the authenticated user's permissions from authResult
  // For dual-auth: check if a manager has approved the serial override
  const canModifySerial = useMemo(() => {
    // If a manager has already approved the serial override, allow editing
    if (serialOverrideApproval?.has_permission) {
      return true;
    }
    if (isManager) {
      // Logged-in manager - use their permissions
      return permissions.includes("LOTTERY_SERIAL_OVERRIDE");
    }
    if (authResult?.auth_type === "management" && authResult.permissions) {
      // Cashier authenticated via management tab - use manager's permissions
      return authResult.permissions.includes("LOTTERY_SERIAL_OVERRIDE");
    }
    // Cashier authenticated via PIN - cashiers typically don't have this permission
    // but check just in case the CASHIER role was granted this permission
    if (authResult?.auth_type === "cashier") {
      // Cashier auth doesn't return permissions, so fall back to logged-in user's permissions
      // (which would be the cashier session's permissions if they have any)
      return permissions.includes("LOTTERY_SERIAL_OVERRIDE");
    }
    return false;
  }, [isManager, permissions, authResult, serialOverrideApproval]);

  // Check if cashier needs manager approval for serial change
  // This is true when: cashier is authenticated but doesn't have LOTTERY_SERIAL_OVERRIDE permission
  const needsManagerApprovalForSerial = useMemo(() => {
    // Managers never need additional approval
    if (isManager) return false;
    // If authenticated via management tab with permissions, no additional approval needed
    if (authResult?.auth_type === "management" && authResult.permissions) {
      return !authResult.permissions.includes("LOTTERY_SERIAL_OVERRIDE");
    }
    // Cashier auth - needs manager approval (unless already approved)
    if (authResult?.auth_type === "cashier") {
      return !serialOverrideApproval?.has_permission;
    }
    return true;
  }, [isManager, authResult, serialOverrideApproval]);

  // Form setup
  const form = useForm<ActivationFormValues>({
    resolver: zodResolver(activationFormSchema),
    mode: "onChange",
    defaultValues: {
      pack_id: "",
      bin_id: "",
      serial_start: "000", // Default to 000 (3-digit format required by schema)
    },
  });

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      // Use reset with keepDefaultValues to ensure clean state
      form.reset({
        pack_id: "",
        bin_id: "",
        serial_start: "000", // Default to 000 (3-digit format required)
      });
      setSelectedPack(null);
      setAuthResult(null);
      setIsEditingSerial(false);
      setSerialOverrideApproval(null);
      setIsSerialInvalid(false);
      // Trigger validation to update formState after reset
      form.trigger();
    }
  }, [open, form]);

  // When pack is selected, keep serial_start at "000" (default)
  // LOTTERY_SERIAL_OVERRIDE permission is required to change starting serial
  useEffect(() => {
    if (selectedPack) {
      // Reset to 000 when a new pack is selected
      // Must include shouldValidate to update form.formState.isValid
      form.setValue("serial_start", "000", { shouldValidate: true });
      setIsEditingSerial(false);
      setIsSerialInvalid(false);
    }
  }, [selectedPack, form]);

  // Get selected bin for occupation check
  const watchedBinId = form.watch("bin_id");
  const selectedBin = bins.find((b) => b.bin_id === watchedBinId);
  const isBinOccupied = selectedBin?.pack !== null;

  const handlePackChange = (packId: string, pack: PackSearchOption | null) => {
    form.setValue("pack_id", packId, { shouldValidate: true });
    setSelectedPack(pack);
  };

  const handleBinChange = (binId: string) => {
    form.setValue("bin_id", binId, { shouldValidate: true });
  };

  const handleAuthenticated = (result: LotteryAuthResult) => {
    setAuthResult(result);
    // Trigger form validation to update isValid state after auth succeeds
    // This ensures the Activate button enables when all fields are valid
    form.trigger();
    toast({
      title: "Authenticated",
      description: `Authenticated as ${result.cashier_name}`,
    });
  };

  // Handle "Change Starting Serial" button click
  // If user has permission, allow editing directly
  // If user needs manager approval, show the manager approval modal
  const handleChangeSerialClick = () => {
    if (canModifySerial) {
      // User already has permission (manager or manager already approved)
      setIsEditingSerial(true);
    } else if (needsManagerApprovalForSerial) {
      // Cashier needs manager to approve - show the serial override modal
      setShowSerialOverrideModal(true);
    }
  };

  // Handle serial override approval from manager
  const handleSerialOverrideApproved = (approval: SerialOverrideApproval) => {
    setSerialOverrideApproval(approval);
    setIsEditingSerial(true); // Automatically enable editing after approval
    toast({
      title: "Serial Override Approved",
      description: `Approved by ${approval.approver_name}. You can now change the starting serial.`,
    });
  };

  // Handle canceling serial edit
  const handleCancelSerialEdit = () => {
    form.setValue("serial_start", "000");
    setIsEditingSerial(false);
    setIsSerialInvalid(false);
  };

  /**
   * Handle serial input change with real-time range validation
   * MCP FE-002: FORM_VALIDATION - Real-time validation feedback
   * MCP SEC-014: INPUT_VALIDATION - Validate before submission
   */
  const handleSerialInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    fieldOnChange: (value: string) => void,
  ) => {
    const value = e.target.value;
    fieldOnChange(value);

    // Validate against pack's serial range if a pack is selected
    if (selectedPack && value !== "000") {
      const isValid = validateSerialInRange(
        value,
        selectedPack.serial_start,
        selectedPack.serial_end,
      );
      setIsSerialInvalid(!isValid);
    } else {
      setIsSerialInvalid(false);
    }
  };

  const handleSubmit = async (values: ActivationFormValues) => {
    // For non-managers, require authentication
    if (!isManager && !authResult) {
      setShowAuthModal(true);
      return;
    }

    // Build activation input
    // For management auth (auth_type === "management"), shift_id is empty string
    // We convert empty string to undefined so backend treats it as no shift
    //
    // IMPORTANT: For management auth, use the authenticated user's ID (authResult.cashier_id)
    // NOT the session user's ID, so backend can verify they have manager roles
    const activatedByUserId =
      authResult?.auth_type === "management"
        ? authResult.cashier_id // Use management-authenticated user's ID
        : user?.id || authResult?.cashier_id || ""; // Session user or cashier

    const activationData: FullActivatePackInput = {
      pack_id: values.pack_id,
      bin_id: values.bin_id,
      serial_start: values.serial_start,
      activated_by: activatedByUserId,
      activated_shift_id: authResult?.shift_id || undefined, // undefined for managers
      deplete_previous: isBinOccupied ? true : undefined, // Always deplete when bin is occupied
      // Dual-auth: Include manager approval for serial override if present
      serial_override_approved_by: serialOverrideApproval?.approver_id,
      serial_override_reason:
        values.serial_start !== "000" && serialOverrideApproval
          ? "Manager approved serial override"
          : undefined,
    };

    try {
      await fullActivationMutation.mutateAsync({
        storeId,
        data: activationData,
      });

      toast({
        title: "Pack Activated",
        description: `Pack #${selectedPack?.pack_number} has been activated in ${selectedBin?.name || "the selected bin"}.`,
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to activate pack";
      toast({
        title: "Activation Failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleCancel = () => {
    form.reset();
    setSelectedPack(null);
    setAuthResult(null);
    onOpenChange(false);
  };

  const isSubmitting = fullActivationMutation.isPending;
  // Form is valid only if: Zod validation passes, auth is satisfied, AND no serial range error
  const isFormValid =
    form.formState.isValid && (isManager || authResult) && !isSerialInvalid;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="sm:max-w-[550px]"
          data-testid="pack-activation-form"
        >
          <DialogHeader>
            <DialogTitle>Activate Lottery Pack</DialogTitle>
            <DialogDescription>
              Search for a pack, select a bin, and confirm the starting serial.
              {!isManager && " You will need to authenticate as a cashier."}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="space-y-4"
            >
              {/* Auth status indicator */}
              {!isManager && (
                <div className="rounded-md border p-3">
                  {authResult ? (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>
                        Authenticated as{" "}
                        <strong>{authResult.cashier_name}</strong>
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-6 text-xs"
                        onClick={() => setShowAuthModal(true)}
                      >
                        Change
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <AlertCircle className="h-4 w-4" />
                      <span>Authentication required before activation</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="ml-auto"
                        onClick={() => setShowAuthModal(true)}
                        data-testid="authenticate-button"
                      >
                        Authenticate
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Pack search */}
              <FormField
                control={form.control}
                name="pack_id"
                render={() => (
                  <FormItem>
                    <PackSearchCombobox
                      storeId={storeId}
                      value={form.watch("pack_id")}
                      onValueChange={handlePackChange}
                      label="Pack"
                      statusFilter="RECEIVED"
                      disabled={isSubmitting}
                      error={form.formState.errors.pack_id?.message}
                      testId="pack-search"
                    />
                    {/* Note: FormMessage omitted - PackSearchCombobox displays its own error */}
                  </FormItem>
                )}
              />

              {/* Pack details */}
              {selectedPack && (
                <div className="rounded-md border bg-muted/50 p-3 text-sm">
                  <div className="font-medium">Pack Details</div>
                  <div className="mt-1 grid grid-cols-2 gap-2 text-muted-foreground">
                    <div>Game: {selectedPack.game_name}</div>
                    <div>
                      Price:{" "}
                      {selectedPack.game_price !== null
                        ? `$${selectedPack.game_price}`
                        : "N/A"}
                    </div>
                    <div className="col-span-2">
                      Serial Range: {selectedPack.serial_start} -{" "}
                      {selectedPack.serial_end}
                    </div>
                  </div>
                </div>
              )}

              {/* Bin selector */}
              <FormField
                control={form.control}
                name="bin_id"
                render={() => (
                  <FormItem>
                    <BinSelector
                      bins={bins}
                      value={form.watch("bin_id")}
                      onValueChange={handleBinChange}
                      disabled={isSubmitting || !selectedPack}
                      error={form.formState.errors.bin_id?.message}
                      testId="bin-select"
                    />
                    {/* Note: FormMessage omitted - BinSelector displays its own error */}
                  </FormItem>
                )}
              />

              {/* Starting serial - read-only by default, editable only by managers */}
              <FormField
                control={form.control}
                name="serial_start"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Starting Serial</FormLabel>
                    {isEditingSerial ? (
                      // Editing mode - show input field with cancel option
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <FormControl>
                            <Input
                              {...field}
                              onChange={(e) =>
                                handleSerialInputChange(e, field.onChange)
                              }
                              placeholder="Enter 3-digit serial"
                              disabled={isSubmitting}
                              inputMode="numeric"
                              maxLength={3}
                              autoFocus
                              className={
                                isSerialInvalid || field.value.length !== 3
                                  ? "border-destructive focus-visible:ring-destructive"
                                  : ""
                              }
                              data-testid="serial-start-input"
                            />
                          </FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleCancelSerialEdit}
                            disabled={isSubmitting}
                          >
                            Cancel
                          </Button>
                        </div>
                        {/* Show valid range hint when editing */}
                        {selectedPack && (
                          <p className="text-xs text-muted-foreground">
                            Valid range: {selectedPack.serial_start} -{" "}
                            {selectedPack.serial_end}
                          </p>
                        )}
                      </div>
                    ) : (
                      // Read-only mode - show value with change button
                      <div className="flex items-center gap-2">
                        <div
                          className="flex h-10 w-full items-center rounded-md border border-input bg-muted px-3 py-2 text-sm"
                          data-testid="serial-start-display"
                        >
                          {field.value || "000"}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleChangeSerialClick}
                          disabled={isSubmitting || !selectedPack}
                          title={
                            needsManagerApprovalForSerial
                              ? "Click to request manager approval for serial change"
                              : canModifySerial
                                ? "Change starting serial"
                                : "You do not have permission to change the starting serial"
                          }
                          data-testid="change-serial-button"
                        >
                          <Pencil className="mr-1 h-3 w-3" />
                          {needsManagerApprovalForSerial
                            ? "Request Change"
                            : "Change"}
                        </Button>
                      </div>
                    )}
                    {/* Show serial override approval status */}
                    {serialOverrideApproval && (
                      <div className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>
                          Serial change approved by{" "}
                          <strong>
                            {serialOverrideApproval.approver_name}
                          </strong>
                        </span>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {canModifySerial
                        ? "Starting serial defaults to 0. Click Change to modify."
                        : needsManagerApprovalForSerial
                          ? "Starting serial defaults to 0. Click Request Change to get manager approval."
                          : "Starting serial defaults to 0. You do not have permission to change it."}
                    </p>
                  </FormItem>
                )}
              />

              {/* Form error */}
              {fullActivationMutation.isError && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {fullActivationMutation.error instanceof Error
                      ? fullActivationMutation.error.message
                      : "Failed to activate pack"}
                  </AlertDescription>
                </Alert>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancel}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || !isFormValid}
                  data-testid="submit-activation"
                >
                  {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {!isManager && !authResult
                    ? "Authenticate & Activate"
                    : "Activate Pack"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Authentication Modal - for initial cashier/manager authentication */}
      <LotteryAuthModal
        open={showAuthModal}
        onOpenChange={setShowAuthModal}
        storeId={storeId}
        onAuthenticated={handleAuthenticated}
        mode="activation"
      />

      {/* Serial Override Approval Modal - for manager to approve serial change */}
      <LotteryAuthModal
        open={showSerialOverrideModal}
        onOpenChange={setShowSerialOverrideModal}
        storeId={storeId}
        onAuthenticated={() => {}} // Not used in serial_override mode
        mode="serial_override"
        onSerialOverrideApproved={handleSerialOverrideApproved}
      />
    </>
  );
}
