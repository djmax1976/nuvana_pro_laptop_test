"use client";

/**
 * Activate Pack Modal Component
 * Two-step dialog form for activating a pack and assigning it to a bin during shift
 *
 * Story: 10.6 - Activate Pack During Shift
 *
 * @requirements
 * - AC #1: Activate Pack button (handled by parent component)
 * - AC #2, #3: Step 1 - Cashier authentication with PIN verification
 * - AC #4, #5: Step 2 - Pack scanning and validation
 * - AC #6: Bin selection with warning for active packs
 * - AC #7: Pack activation with full audit trail
 *
 * MCP Guidance Applied:
 * - FORM_VALIDATION: Mirror backend validation client-side, sanitize all user input
 * - INPUT_VALIDATION: Define strict schemas with length, type, and format constraints
 * - XSS: React automatically escapes output, no manual sanitization needed for text inputs
 * - CSRF: Uses credentials: "include" for secure cookie-based authentication
 */

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQuery, useMutation } from "@tanstack/react-query";
import { parseSerializedNumber } from "@/lib/utils/lottery-serial-parser";
import { BinWithPack } from "@/lib/api/shift-closing";

// ============ Types ============

/**
 * Active shift cashier information
 * Matches API response format from /api/stores/:storeId/active-shift-cashiers
 */
interface ActiveShiftCashier {
  id: string; // API returns 'id', not 'cashier_id'
  name: string;
  shiftId: string;
  employee_id?: string; // Optional, may not be in API response
}

/**
 * Verified cashier after PIN authentication
 */
interface VerifiedCashier {
  userId: string;
  name: string;
}

/**
 * Cashier permission verification result
 */
interface CashierPermissionVerificationResult {
  valid: boolean;
  error?: string;
  userId?: string;
  name?: string;
  hasPermission?: boolean;
}

/**
 * Pack validation result from API
 */
interface PackValidationResult {
  valid: boolean;
  error?: string;
  game?: {
    name: string;
    price: number;
  };
  pack?: {
    pack_id: string;
    serial_start: string;
    serial_end: string;
  };
}

/**
 * Pack activation result
 */
interface PackActivationResult {
  updatedBin: BinWithPack;
  previousPack?: {
    pack_id: string;
    game_name: string;
    game_price: number;
  };
}

/**
 * Props for ActivatePackModal component
 */
export interface ActivatePackModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  currentShiftId: string;
  bins: BinWithPack[];
  onPackActivated: (updatedBin: BinWithPack, previousPack?: PackInfo) => void;
}

/**
 * Previous pack information for callback
 */
export interface PackInfo {
  pack_id: string;
  game_name: string;
  game_price: number;
}

type ModalStep = "auth" | "scan";

// ============ Form Validation Schemas ============

/**
 * Step 1: Cashier authentication form schema
 * Validates cashier selection (required) and PIN number (required, exactly 4 numeric digits)
 *
 * MCP Guidance Applied:
 * - INPUT_VALIDATION: Define strict schemas with length, type, and format constraints
 * - FORM_VALIDATION: Mirror backend validation client-side
 */
const authFormSchema = z.object({
  cashierId: z
    .string({ message: "Cashier is required" })
    .min(1, { message: "Cashier is required" }),
  pin: z
    .string({ message: "PIN number is required" })
    .min(1, { message: "PIN number is required" })
    .regex(/^\d{4}$/, { message: "PIN must be exactly 4 numeric digits" }),
});

type AuthFormValues = z.infer<typeof authFormSchema>;

/**
 * Step 2: Pack scan and bin selection form schema
 * Validates serial input (24 digits) and bin selection (required)
 *
 * MCP Guidance Applied:
 * - INPUT_VALIDATION: Define strict schemas with length, type, and format constraints
 * - FORM_VALIDATION: Mirror backend validation client-side
 */
const scanFormSchema = z.object({
  serial: z
    .string({ message: "Serial number is required" })
    .min(1, { message: "Serial number is required" })
    .regex(/^\d{24}$/, {
      message: "Serial number must be exactly 24 numeric digits",
    }),
  binId: z
    .string({ message: "Bin is required" })
    .min(1, { message: "Bin is required" }),
});

type ScanFormValues = z.infer<typeof scanFormSchema>;

// ============ API Functions ============

/**
 * Get active shift cashiers for a store
 * Returns only cashiers with active shifts at this store
 */
async function getActiveShiftCashiers(
  storeId: string,
): Promise<ActiveShiftCashier[]> {
  const API_BASE_URL =
    process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

  const response = await fetch(
    `${API_BASE_URL}/api/stores/${storeId}/active-shift-cashiers`,
    {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({
      success: false,
      error: "Unknown error",
    }));
    const errorMessage =
      typeof errorData.error === "object"
        ? errorData.error.message
        : errorData.error || "Failed to load active cashiers";
    throw new Error(errorMessage);
  }

  const result = await response.json();
  return result.data || [];
}

/**
 * Verify cashier PIN
 * Validates PIN against selected cashier
 */
async function verifyCashierPin(
  cashierId: string,
  pin: string,
  storeId: string,
): Promise<CashierPermissionVerificationResult> {
  const API_BASE_URL =
    process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

  const response = await fetch(
    `${API_BASE_URL}/api/auth/verify-cashier-permission`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cashierId,
        pin,
        permission: "LOTTERY_MANUAL_ENTRY", // TODO: Update endpoint to accept LOTTERY_PACK_ACTIVATE when available
        storeId,
      }),
    },
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({
      success: false,
      error: "Unknown error",
    }));
    const errorMessage =
      typeof errorData.error === "object"
        ? errorData.error.message
        : errorData.error || "Verification failed";
    return {
      valid: false,
      error: errorMessage,
    };
  }

  const result = await response.json();
  return result;
}

/**
 * Validate pack for activation
 * Calls API to validate pack exists, status is RECEIVED, and returns game info
 */
async function validatePackForActivation(
  storeId: string,
  packNumber: string,
): Promise<PackValidationResult> {
  const API_BASE_URL =
    process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

  const response = await fetch(
    `${API_BASE_URL}/api/lottery/packs/validate-for-activation/${storeId}/${packNumber}`,
    {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({
      success: false,
      error: "Unknown error",
    }));
    const errorMessage =
      typeof errorData.error === "object"
        ? errorData.error.message
        : errorData.error || "Failed to validate pack";
    return {
      valid: false,
      error: errorMessage,
    };
  }

  const result = await response.json();
  return result.data || { valid: false, error: "Invalid response" };
}

/**
 * Activate pack in bin
 * Activates pack and assigns it to selected bin with full audit trail
 */
async function activatePack(
  storeId: string,
  data: {
    pack_id: string;
    bin_id: string;
    serial_start: string;
    activated_by: string;
    activated_shift_id: string;
  },
): Promise<PackActivationResult> {
  const API_BASE_URL =
    process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

  const response = await fetch(
    `${API_BASE_URL}/api/stores/${storeId}/lottery/packs/activate`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    },
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({
      success: false,
      error: "Unknown error",
    }));
    const errorMessage =
      typeof errorData.error === "object"
        ? errorData.error.message
        : errorData.error || "Failed to activate pack";
    throw new Error(errorMessage);
  }

  const result = await response.json();
  return result.data;
}

// ============ Component ============

/**
 * ActivatePackModal component
 * Two-step modal for pack activation with cashier authentication
 *
 * MCP Guidance Applied:
 * - FORM_VALIDATION: Display validation errors clearly, disable submission until fields pass checks
 * - INPUT_VALIDATION: Apply length, type, and format constraints at the boundary
 * - XSS: React automatically escapes output, no manual sanitization needed for text inputs
 * - CSRF: Uses credentials: "include" for secure cookie-based authentication
 */
export function ActivatePackModal({
  open,
  onOpenChange,
  storeId,
  currentShiftId,
  bins,
  onPackActivated,
}: ActivatePackModalProps) {
  // Modal step state
  const [step, setStep] = useState<ModalStep>("auth");
  const [verifiedCashier, setVerifiedCashier] =
    useState<VerifiedCashier | null>(null);

  // Pack validation state
  const [packValidation, setPackValidation] =
    useState<PackValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Selected bin state (for warning display)
  const [selectedBinId, setSelectedBinId] = useState<string>("");

  // Step 1: Authentication form
  const authForm = useForm<AuthFormValues>({
    resolver: zodResolver(authFormSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    shouldFocusError: true,
    defaultValues: {
      cashierId: "",
      pin: "",
    },
  });

  // Step 2: Scan form
  const scanForm = useForm<ScanFormValues>({
    resolver: zodResolver(scanFormSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    shouldFocusError: true,
    defaultValues: {
      serial: "",
      binId: "",
    },
  });

  // Fetch active shift cashiers
  const {
    data: activeCashiers = [],
    isLoading: isLoadingCashiers,
    error: cashiersError,
  } = useQuery({
    queryKey: ["active-shift-cashiers", storeId],
    queryFn: () => getActiveShiftCashiers(storeId),
    enabled: open && !!storeId,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  // Verify cashier PIN mutation
  const verifyPinMutation = useMutation({
    mutationFn: ({ cashierId, pin }: { cashierId: string; pin: string }) =>
      verifyCashierPin(cashierId, pin, storeId),
  });

  // Pack validation mutation
  const validatePackMutation = useMutation({
    mutationFn: (packNumber: string) =>
      validatePackForActivation(storeId, packNumber),
  });

  // Pack activation mutation
  const activatePackMutation = useMutation({
    mutationFn: (data: {
      pack_id: string;
      bin_id: string;
      serial_start: string;
      activated_by: string;
      activated_shift_id: string;
    }) => activatePack(storeId, data),
  });

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      // Reset to Step 1
      setStep("auth");
      setVerifiedCashier(null);
      setPackValidation(null);
      setIsValidating(false);
      setSelectedBinId("");
      authForm.reset({
        cashierId: "",
        pin: "",
      });
      scanForm.reset({
        serial: "",
        binId: "",
      });
      verifyPinMutation.reset();
      validatePackMutation.reset();
      activatePackMutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Handle Step 1: PIN verification
  const handleAuthSubmit = async (values: AuthFormValues) => {
    try {
      const result = await verifyPinMutation.mutateAsync({
        cashierId: values.cashierId,
        pin: values.pin,
      });

      // Check if PIN is valid
      if (!result.valid) {
        authForm.setError("pin", {
          type: "manual",
          message: result.error || "Invalid PIN. Please try again.",
        });
        return;
      }

      // Success - proceed to Step 2
      if (result.userId && result.name) {
        setVerifiedCashier({
          userId: result.userId,
          name: result.name,
        });
        setStep("scan");
      }
    } catch (error) {
      if (error instanceof Error) {
        authForm.setError("root", {
          type: "manual",
          message: error.message,
        });
      }
    }
  };

  // Handle serial input blur - validate pack
  const handleSerialBlur = async () => {
    const serialValue = scanForm.getValues("serial");
    if (!serialValue || serialValue.length !== 24) {
      setPackValidation(null);
      return;
    }

    try {
      setIsValidating(true);
      const parsed = parseSerializedNumber(serialValue);
      const result = await validatePackMutation.mutateAsync(parsed.pack_number);
      setPackValidation(result);
    } catch (error) {
      setPackValidation({
        valid: false,
        error:
          error instanceof Error ? error.message : "Failed to validate pack",
      });
    } finally {
      setIsValidating(false);
    }
  };

  // Handle bin selection change - check for active pack warning
  const handleBinChange = (binId: string) => {
    setSelectedBinId(binId);
    scanForm.setValue("binId", binId);
  };

  // Get selected bin info for warning
  const selectedBin = bins.find((b) => b.bin_id === selectedBinId);
  const hasActivePack = selectedBin?.pack !== null;

  // Handle Step 2: Pack activation
  const handleScanSubmit = async (values: ScanFormValues) => {
    if (!packValidation?.valid || !packValidation.pack) {
      scanForm.setError("serial", {
        type: "manual",
        message: "Pack must be validated before activation",
      });
      return;
    }

    if (!verifiedCashier) {
      scanForm.setError("root", {
        type: "manual",
        message: "Cashier authentication required",
      });
      return;
    }

    try {
      // Parse serial to get serial_start
      const parsed = parseSerializedNumber(values.serial);

      // Activate pack
      const result = await activatePackMutation.mutateAsync({
        pack_id: packValidation.pack.pack_id,
        bin_id: values.binId,
        serial_start: parsed.serial_start,
        activated_by: verifiedCashier.userId,
        activated_shift_id: currentShiftId,
      });

      // Call callback with updated bin and previous pack info
      const previousPack: PackInfo | undefined = result.previousPack
        ? {
            pack_id: result.previousPack.pack_id,
            game_name: result.previousPack.game_name,
            game_price: result.previousPack.game_price,
          }
        : undefined;

      onPackActivated(result.updatedBin, previousPack);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof Error) {
        scanForm.setError("root", {
          type: "manual",
          message: error.message,
        });
      } else {
        scanForm.setError("root", {
          type: "manual",
          message: "Failed to activate pack. Please try again.",
        });
      }
    }
  };

  // Handle cancel
  const handleCancel = () => {
    if (step === "scan") {
      // Go back to Step 1
      setStep("auth");
      setVerifiedCashier(null);
      setPackValidation(null);
      setSelectedBinId("");
      scanForm.reset();
    } else {
      // Close modal
      authForm.reset();
      onOpenChange(false);
    }
  };

  const isSubmitting =
    authForm.formState.isSubmitting ||
    scanForm.formState.isSubmitting ||
    verifyPinMutation.isPending ||
    activatePackMutation.isPending;

  // Step 1 form validation
  const isAuthFormValid =
    authForm.watch("cashierId") && authForm.watch("pin")?.length === 4;

  // Step 2 form validation
  const isScanFormValid =
    packValidation?.valid === true && scanForm.watch("binId") !== "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {step === "auth"
              ? "Step 1: Cashier Authentication"
              : "Step 2: Scan Pack"}
          </DialogTitle>
          <DialogDescription>
            {step === "auth"
              ? "Select cashier and enter PIN to verify authorization"
              : `Verified as: ${verifiedCashier?.name || "Unknown"}`}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Cashier Authentication */}
        {step === "auth" && (
          <Form {...authForm}>
            <form
              onSubmit={authForm.handleSubmit(handleAuthSubmit)}
              className="space-y-4"
            >
              {/* Cashier Dropdown */}
              <FormField
                control={authForm.control}
                name="cashierId"
                render={({ field }) => (
                  <FormItem data-testid="step-1-auth">
                    <FormLabel>Cashier</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isLoadingCashiers || isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="cashier-dropdown">
                          <SelectValue placeholder="Select cashier" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {activeCashiers.map((cashier) => (
                          <SelectItem
                            key={cashier.id}
                            value={cashier.id}
                            data-testid={`cashier-option-${cashier.id}`}
                          >
                            {cashier.name}
                            {cashier.employee_id && ` (${cashier.employee_id})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* PIN Input */}
              <FormField
                control={authForm.control}
                name="pin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PIN</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        maxLength={4}
                        placeholder="0000"
                        disabled={isSubmitting}
                        data-testid="pin-input"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Error Message */}
              {authForm.formState.errors.root && (
                <Alert variant="destructive" data-testid="error-message">
                  <AlertDescription>
                    {authForm.formState.errors.root.message}
                  </AlertDescription>
                </Alert>
              )}

              {/* Cashiers Loading Error */}
              {cashiersError && (
                <Alert variant="destructive">
                  <AlertDescription>
                    Failed to load cashiers. Please try again.
                  </AlertDescription>
                </Alert>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancel}
                  disabled={isSubmitting}
                  data-testid="cancel-button"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!isAuthFormValid || isSubmitting}
                  data-testid="verify-button"
                >
                  {verifyPinMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}

        {/* Step 2: Scan Pack and Select Bin */}
        {step === "scan" && (
          <Form {...scanForm}>
            <form
              onSubmit={scanForm.handleSubmit(handleScanSubmit)}
              className="space-y-4"
            >
              <div data-testid="step-2-scan">
                {/* Verified Cashier Display */}
                {verifiedCashier && (
                  <Alert className="mb-4">
                    <AlertDescription data-testid="verified-cashier-name">
                      Verified as: <strong>{verifiedCashier.name}</strong>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Serial Input */}
                <FormField
                  control={scanForm.control}
                  name="serial"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pack Serial Number (24 digits)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="text"
                          maxLength={24}
                          placeholder="000000000000000000000000"
                          disabled={isSubmitting}
                          onBlur={handleSerialBlur}
                          data-testid="serial-input"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Pack Validation Status */}
                {isValidating && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Validating pack...
                  </div>
                )}

                {packValidation && (
                  <div>
                    {packValidation.valid &&
                    packValidation.game &&
                    packValidation.pack ? (
                      <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <AlertDescription data-testid="pack-info">
                          <div className="mt-2 space-y-1">
                            <div>
                              <strong>Game:</strong> {packValidation.game.name}
                            </div>
                            <div>
                              <strong>Price:</strong> $
                              {packValidation.game.price.toFixed(2)}
                            </div>
                            <div>
                              <strong>Pack Number:</strong>{" "}
                              {packValidation.pack.pack_id}
                            </div>
                            <div>
                              <strong>Status:</strong> Available
                            </div>
                          </div>
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <Alert variant="destructive" data-testid="scan-error">
                        <XCircle className="h-4 w-4" />
                        <AlertDescription>
                          {packValidation.error || "Invalid pack"}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}

                {/* Bin Selection */}
                <FormField
                  control={scanForm.control}
                  name="binId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assign to Bin</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          handleBinChange(value);
                        }}
                        value={field.value}
                        disabled={isSubmitting || !packValidation?.valid}
                        data-testid="bin-dropdown"
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select bin" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {bins.map((bin) => (
                            <SelectItem
                              key={bin.bin_id}
                              value={bin.bin_id}
                              data-testid={`bin-option-${bin.bin_id}`}
                            >
                              Bin {bin.bin_number}:{" "}
                              {bin.pack ? bin.pack.game_name : "Empty"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Bin Warning */}
                {hasActivePack && selectedBin?.pack && (
                  <Alert
                    variant="default"
                    className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950"
                    data-testid="bin-warning"
                  >
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <AlertDescription>
                      This bin already has{" "}
                      <strong>{selectedBin.pack.game_name}</strong>. Activating
                      will replace it.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Error Message */}
                {scanForm.formState.errors.root && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {scanForm.formState.errors.root.message}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancel}
                  disabled={isSubmitting}
                >
                  {step === "scan" ? "Back" : "Cancel"}
                </Button>
                <Button
                  type="submit"
                  disabled={!isScanFormValid || isSubmitting}
                  data-testid="activate-button"
                >
                  {activatePackMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Activating...
                    </>
                  ) : (
                    "Activate"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
