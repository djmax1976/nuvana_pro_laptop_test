"use client";

/**
 * Add Bin Modal Component
 * Dialog form for adding new lottery bins with pack activation
 *
 * Story: 10.5 - Add Bin Functionality
 *
 * @requirements
 * - AC #2: Auto-assigned bin number (read-only)
 * - AC #2: 24-digit serial input field
 * - AC #3: Pack validation (game lookup, pack status check)
 * - AC #4: Display pack info after valid scan, enable Add Bin button
 * - AC #5: Create bin with pack activation
 * - AC #6: Optional location text field
 *
 * MCP Guidance Applied:
 * - FORM_VALIDATION: Mirror backend validation client-side, sanitize all user input
 * - INPUT_VALIDATION: Define strict schemas with length, type, and format constraints
 * - XSS: React automatically escapes output, no manual sanitization needed for text inputs
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useMutation } from "@tanstack/react-query";
import { parseSerializedNumber } from "@/lib/utils/lottery-serial-parser";

/**
 * Form validation schema for add bin form
 * Validates serial input (24 digits) and optional location field
 *
 * MCP Guidance Applied:
 * - INPUT_VALIDATION: Define strict schemas with length, type, and format constraints
 * - FORM_VALIDATION: Mirror backend validation client-side
 */
const addBinFormSchema = z.object({
  serial: z
    .string({ message: "Serial number is required" })
    .min(1, { message: "Serial number is required" })
    .regex(/^\d{24}$/, {
      message: "Serial number must be exactly 24 numeric digits",
    }),
  location: z.string().optional(),
});

type AddBinFormValues = z.infer<typeof addBinFormSchema>;

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
 * Bin creation result
 */
interface BinWithPack {
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
}

interface AddBinModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  currentShiftId: string;
  currentUserId: string;
  existingBinCount: number;
  onBinCreated: (newBin: BinWithPack) => void;
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
 * Create bin with pack activation
 * Creates bin, activates pack, and creates all required records in transaction
 */
async function createBinWithPack(
  storeId: string,
  data: {
    bin_name: string;
    location?: string;
    display_order: number;
    pack_number: string;
    serial_start: string;
    activated_by: string;
    activated_shift_id: string;
  },
): Promise<BinWithPack> {
  const API_BASE_URL =
    process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

  const response = await fetch(
    `${API_BASE_URL}/api/stores/${storeId}/lottery/bins/create-with-pack`,
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
        : errorData.error || "Failed to create bin";
    throw new Error(errorMessage);
  }

  const result = await response.json();
  return result.data.bin;
}

/**
 * AddBinModal component
 * Modal for adding new bins with pack activation
 *
 * MCP Guidance Applied:
 * - FORM_VALIDATION: Display validation errors clearly, disable submission until fields pass checks
 * - INPUT_VALIDATION: Apply length, type, and format constraints at the boundary
 * - XSS: React automatically escapes output, no manual sanitization needed for text inputs
 */
export function AddBinModal({
  open,
  onOpenChange,
  storeId,
  currentShiftId,
  currentUserId,
  existingBinCount,
  onBinCreated,
}: AddBinModalProps) {
  const form = useForm<AddBinFormValues>({
    resolver: zodResolver(addBinFormSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    shouldFocusError: true,
    defaultValues: {
      serial: "",
      location: "",
    },
  });

  // State for pack validation
  const [packValidation, setPackValidation] =
    useState<PackValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Auto-assigned bin number (next sequential number)
  const nextBinNumber = existingBinCount + 1;
  const binName = `Bin ${nextBinNumber}`;

  // Pack validation mutation
  const validatePackMutation = useMutation({
    mutationFn: (packNumber: string) =>
      validatePackForActivation(storeId, packNumber),
  });

  // Bin creation mutation
  const createBinMutation = useMutation({
    mutationFn: (data: {
      bin_name: string;
      location?: string;
      display_order: number;
      pack_number: string;
      serial_start: string;
      activated_by: string;
      activated_shift_id: string;
    }) => createBinWithPack(storeId, data),
  });

  // Reset form and validation state when dialog opens/closes
  useEffect(() => {
    if (open) {
      form.reset({
        serial: "",
        location: "",
      });
      setPackValidation(null);
      validatePackMutation.reset();
      createBinMutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Handle serial input blur - validate pack
  const handleSerialBlur = async () => {
    const serial = form.getValues("serial");
    if (!serial || serial.length !== 24) {
      setPackValidation(null);
      return;
    }

    try {
      setIsValidating(true);
      // Parse serial to get pack number
      const parsed = parseSerializedNumber(serial);
      const validationResult = await validatePackMutation.mutateAsync(
        parsed.pack_number,
      );
      setPackValidation(validationResult);
    } catch (error) {
      if (error instanceof Error) {
        setPackValidation({
          valid: false,
          error: error.message,
        });
      } else {
        setPackValidation({
          valid: false,
          error: "Failed to validate pack",
        });
      }
    } finally {
      setIsValidating(false);
    }
  };

  // Handle form submission
  const handleSubmit = async (values: AddBinFormValues) => {
    if (!packValidation?.valid) {
      form.setError("serial", {
        type: "manual",
        message: "Pack must be validated before creating bin",
      });
      return;
    }

    try {
      // Parse serial to get pack number and serial start
      const parsed = parseSerializedNumber(values.serial);

      // Create bin with pack activation
      const newBin = await createBinMutation.mutateAsync({
        bin_name: binName,
        location: values.location || undefined,
        display_order: nextBinNumber,
        pack_number: parsed.pack_number,
        serial_start: parsed.serial_start,
        activated_by: currentUserId,
        activated_shift_id: currentShiftId,
      });

      // Call callback and close modal
      onBinCreated(newBin);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof Error) {
        form.setError("root", {
          type: "manual",
          message: error.message,
        });
      } else {
        form.setError("root", {
          type: "manual",
          message: "Failed to create bin. Please try again.",
        });
      }
    }
  };

  const handleCancel = () => {
    form.reset();
    setPackValidation(null);
    onOpenChange(false);
  };

  const isSubmitting =
    form.formState.isSubmitting || createBinMutation.isPending;
  const isFormValid = packValidation?.valid === true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="add-bin-modal">
        <DialogHeader>
          <DialogTitle>Add Bin</DialogTitle>
          <DialogDescription>
            Scan a pack barcode to create a new bin and activate the pack
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            {/* Error message from root */}
            {form.formState.errors.root && (
              <Alert variant="destructive">
                <AlertDescription data-testid="error-message">
                  {form.formState.errors.root.message}
                </AlertDescription>
              </Alert>
            )}

            {/* Bin Number Display (read-only) */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Bin Number</label>
              <div
                className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm"
                data-testid="bin-number-display"
              >
                {binName}
              </div>
              <p className="text-xs text-muted-foreground">
                Auto-assigned sequential number
              </p>
            </div>

            {/* Serial Input Field */}
            <FormField
              control={form.control}
              name="serial"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pack Serial Number (24 digits)</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="Scan or enter 24-digit barcode"
                      autoComplete="off"
                      disabled={isSubmitting || isValidating}
                      maxLength={24}
                      data-testid="pack-serial-input"
                      {...field}
                      onBlur={() => {
                        field.onBlur();
                        handleSerialBlur();
                      }}
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

            {packValidation && !isValidating && (
              <div data-testid="pack-validation-status">
                {packValidation.valid ? (
                  <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertDescription
                      className="text-green-800 dark:text-green-200"
                      data-testid="pack-info"
                    >
                      <div className="space-y-1">
                        <div>
                          <strong>Game:</strong> {packValidation.game?.name}
                        </div>
                        <div>
                          <strong>Price:</strong> $
                          {packValidation.game?.price.toFixed(2)}
                        </div>
                        <div>
                          <strong>Pack#:</strong>{" "}
                          {packValidation.pack?.pack_id || "N/A"}
                        </div>
                        <div>
                          <strong>Starting Serial:</strong>{" "}
                          {packValidation.pack?.serial_start || "N/A"}
                        </div>
                        <div className="flex items-center gap-2">
                          <strong>Status:</strong>
                          <span
                            className="text-green-600 font-semibold"
                            data-testid="pack-status"
                          >
                            Available
                          </span>
                        </div>
                      </div>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription data-testid="pack-validation-error">
                      {packValidation.error || "Pack validation failed"}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {/* Optional Location Field */}
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="e.g., Front Counter, Register 2"
                      autoComplete="off"
                      disabled={isSubmitting}
                      data-testid="bin-location-input"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isSubmitting}
                data-testid="add-bin-cancel-button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !isFormValid || isValidating}
                data-testid="add-bin-submit-button"
              >
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Add Bin
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
