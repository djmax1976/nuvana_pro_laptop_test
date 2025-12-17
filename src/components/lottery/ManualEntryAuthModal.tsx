"use client";

/**
 * Manual Entry Authentication Modal Component
 * Dialog form for authorizing manual entry mode in lottery shift closing
 *
 * Story: 10.4 - Manual Entry Override
 *
 * @requirements
 * - AC #2: Modal with cashier authentication form
 * - AC #3: Permission check for LOTTERY_MANUAL_ENTRY
 * - Cashier dropdown (only active shift cashiers at this store)
 * - PIN input field (4 digits, masked)
 * - Cancel and Verify buttons
 * - Error handling for invalid PIN and unauthorized users
 */

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
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQuery, useMutation } from "@tanstack/react-query";

/**
 * Form validation schema for manual entry authentication
 * Validates cashier selection (required) and PIN number (required, exactly 4 numeric digits)
 *
 * MCP Guidance Applied:
 * - FORM_VALIDATION: Mirror backend validation client-side, sanitize all user input
 * - INPUT_VALIDATION: Define strict schemas with length, type, and format constraints
 */
const manualEntryAuthFormSchema = z.object({
  cashierId: z
    .string({ message: "Cashier is required" })
    .min(1, { message: "Cashier is required" }),
  pin: z
    .string({ message: "PIN number is required" })
    .min(1, { message: "PIN number is required" })
    .regex(/^\d{4}$/, { message: "PIN must be exactly 4 numeric digits" }),
});

type ManualEntryAuthFormValues = z.infer<typeof manualEntryAuthFormSchema>;

/**
 * Active shift cashier type
 */
export interface ActiveShiftCashier {
  id: string;
  name: string;
  shiftId: string;
}

/**
 * Cashier permission verification result
 */
export interface CashierPermissionVerificationResult {
  valid: boolean;
  userId?: string;
  name?: string;
  hasPermission?: boolean;
  error?: string;
}

interface ManualEntryAuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  onAuthorized: (authorizedBy: { userId: string; name: string }) => void;
}

/**
 * Fetch active shift cashiers for a store
 * TODO: This will be implemented in Task 5 when API endpoint is created
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
 * Verify cashier PIN and check permission
 * TODO: This will be implemented in Task 5 when API endpoint is created
 */
async function verifyCashierPermission(
  cashierId: string,
  pin: string,
  permission: string,
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
        permission,
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
 * ManualEntryAuthModal component
 * Dialog form for authorizing manual entry mode
 * Uses React Hook Form with Zod validation
 *
 * MCP Guidance Applied:
 * - FORM_VALIDATION: Display validation errors clearly, disable submission until fields pass checks
 * - INPUT_VALIDATION: Apply length, type, and format constraints at the boundary
 * - XSS: React automatically escapes output, no manual sanitization needed for text inputs
 * - AUTHENTICATION: Secure authentication flow with proper error handling
 */
export function ManualEntryAuthModal({
  open,
  onOpenChange,
  storeId,
  onAuthorized,
}: ManualEntryAuthModalProps) {
  const form = useForm<ManualEntryAuthFormValues>({
    resolver: zodResolver(manualEntryAuthFormSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    shouldFocusError: true,
    defaultValues: {
      cashierId: "",
      pin: "",
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

  // Verify cashier permission mutation
  const verifyPermissionMutation = useMutation({
    mutationFn: ({ cashierId, pin }: { cashierId: string; pin: string }) =>
      verifyCashierPermission(cashierId, pin, "LOTTERY_MANUAL_ENTRY", storeId),
  });

  const isSubmitting =
    form.formState.isSubmitting || verifyPermissionMutation.isPending;

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      form.reset({
        cashierId: "",
        pin: "",
      });
      verifyPermissionMutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = async (values: ManualEntryAuthFormValues) => {
    try {
      const result = await verifyPermissionMutation.mutateAsync({
        cashierId: values.cashierId,
        pin: values.pin,
      });

      // Check if PIN is valid
      if (!result.valid) {
        form.setError("pin", {
          type: "manual",
          message: result.error || "Invalid PIN. Please try again.",
        });
        return;
      }

      // Check if user has permission
      if (!result.hasPermission) {
        form.setError("root", {
          type: "manual",
          message:
            "You are not authorized for manual entry. Minimum role required: Shift Manager",
        });
        return;
      }

      // Success - call onAuthorized callback
      if (result.userId && result.name) {
        onAuthorized({
          userId: result.userId,
          name: result.name,
        });
        onOpenChange(false);
      }
    } catch (error) {
      // Error handling is done by mutation state
      if (error instanceof Error) {
        form.setError("root", {
          type: "manual",
          message: error.message,
        });
      }
    }
  };

  const handleCancel = () => {
    form.reset();
    onOpenChange(false);
  };

  // Disable Verify button until cashier selected and 4-digit PIN entered
  const isFormValid =
    form.watch("cashierId") && form.watch("pin")?.length === 4;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[425px]"
        data-testid="manual-entry-auth-modal"
      >
        <DialogHeader>
          <DialogTitle>Authorize Manual Entry</DialogTitle>
          <DialogDescription>
            Enter cashier credentials to authorize manual entry mode
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            {cashiersError && (
              <Alert variant="destructive">
                <AlertDescription data-testid="error-message">
                  Failed to load cashiers. Please try again.
                </AlertDescription>
              </Alert>
            )}

            {verifyPermissionMutation.isError && (
              <Alert variant="destructive">
                <AlertDescription data-testid="error-message">
                  {verifyPermissionMutation.error instanceof Error
                    ? verifyPermissionMutation.error.message
                    : "Verification failed. Please try again."}
                </AlertDescription>
              </Alert>
            )}

            {form.formState.errors.root && (
              <Alert variant="destructive">
                <AlertDescription data-testid="error-message">
                  {form.formState.errors.root.message}
                </AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="cashierId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cashier Name</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isSubmitting || isLoadingCashiers}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="cashier-dropdown">
                        <SelectValue
                          placeholder={
                            isLoadingCashiers
                              ? "Loading cashiers..."
                              : "Select cashier name"
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {activeCashiers.map((cashier) => (
                        <SelectItem key={cashier.id} value={cashier.id}>
                          {cashier.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="pin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>PIN Number</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Enter 4-digit PIN"
                      autoComplete="off"
                      disabled={isSubmitting}
                      maxLength={4}
                      data-testid="pin-input"
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
                data-testid="cancel-button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !isFormValid || isLoadingCashiers}
                data-testid="verify-button"
              >
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Verify
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
