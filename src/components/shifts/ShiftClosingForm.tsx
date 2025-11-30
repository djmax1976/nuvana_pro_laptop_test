"use client";

/**
 * Shift Closing and Reconciliation Form Component
 * Multi-step form for closing a shift and reconciling cash
 *
 * Story: 4.7 - Shift Management UI
 */

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  useCloseShift,
  useReconcileCash,
  useInvalidateShifts,
  type CloseShiftResponse,
} from "@/lib/api/shifts";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/utils";

/**
 * Form validation schema matching backend ReconcileCashSchema
 * Mirrors backend validation client-side for immediate feedback
 */
const reconcileFormSchema = z.object({
  closing_cash: z
    .number({ invalid_type_error: "Closing cash must be a number" } as any)
    .positive("Closing cash must be a positive number"),
  variance_reason: z.string().optional(),
});

type ReconcileFormValues = z.infer<typeof reconcileFormSchema>;

interface ShiftClosingFormProps {
  shiftId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

/**
 * Calculate variance amount and percentage
 */
function calculateVariance(
  actualCash: number,
  expectedCash: number,
): { amount: number; percentage: number } {
  const amount = actualCash - expectedCash;
  const percentage = expectedCash > 0 ? (amount / expectedCash) * 100 : 0;
  return { amount, percentage };
}

/**
 * Check if variance exceeds threshold ($5 or 1%)
 */
function exceedsVarianceThreshold(
  varianceAmount: number,
  variancePercentage: number,
): boolean {
  return Math.abs(varianceAmount) > 5 || Math.abs(variancePercentage) > 1;
}

/**
 * ShiftClosingForm component
 * Multi-step dialog form for closing and reconciling shifts
 * Uses React Hook Form with Zod validation matching backend schema
 */
export function ShiftClosingForm({
  shiftId,
  open,
  onOpenChange,
  onSuccess,
}: ShiftClosingFormProps) {
  const { toast } = useToast();
  const closeShiftMutation = useCloseShift();
  const reconcileCashMutation = useReconcileCash();
  const { invalidateList } = useInvalidateShifts();

  const [isClosing, setIsClosing] = useState(false);
  const [closeData, setCloseData] = useState<CloseShiftResponse | null>(null);
  const [isReconciling, setIsReconciling] = useState(false);
  const [actualCash, setActualCash] = useState<number | null>(null);

  const form = useForm<ReconcileFormValues>({
    resolver: zodResolver(reconcileFormSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues: {
      closing_cash: 0,
      variance_reason: "",
    },
  });

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setIsClosing(false);
      setCloseData(null);
      setIsReconciling(false);
      setActualCash(null);
      form.reset({
        closing_cash: 0,
        variance_reason: "",
      });
    }
  }, [open, form]);

  // Calculate variance when actual cash changes
  const variance =
    actualCash !== null && closeData
      ? calculateVariance(actualCash, closeData.expected_cash)
      : null;

  const hasVarianceAlert =
    variance !== null &&
    exceedsVarianceThreshold(variance.amount, variance.percentage);

  // Step 1: Initiate closing
  const handleInitiateClosing = async () => {
    setIsClosing(true);
    try {
      const response = await closeShiftMutation.mutateAsync(shiftId);
      setCloseData(response.data);
      setIsClosing(false);
    } catch (error) {
      setIsClosing(false);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to initiate shift closing. Please try again.";

      if (errorMessage.includes("SHIFT_NOT_FOUND")) {
        toast({
          title: "Error",
          description: "Shift not found.",
          variant: "destructive",
        });
      } else if (errorMessage.includes("SHIFT_ALREADY_CLOSING")) {
        toast({
          title: "Error",
          description: "Shift is already being closed.",
          variant: "destructive",
        });
      } else if (errorMessage.includes("SHIFT_ALREADY_CLOSED")) {
        toast({
          title: "Error",
          description: "Shift is already closed.",
          variant: "destructive",
        });
      } else if (errorMessage.includes("SHIFT_INVALID_STATUS")) {
        toast({
          title: "Error",
          description:
            "Shift cannot be closed in its current status. Only OPEN or ACTIVE shifts can be closed.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      }
    }
  };

  // Step 2: Reconcile cash
  const onSubmit = async (values: ReconcileFormValues) => {
    setIsReconciling(true);
    try {
      await reconcileCashMutation.mutateAsync({
        shiftId,
        data: {
          closing_cash: values.closing_cash,
          variance_reason: values.variance_reason || undefined,
        },
      });

      toast({
        title: "Success",
        description: "Shift reconciled successfully",
      });

      // Invalidate shift list to refresh
      invalidateList();

      // Reset form and close dialog
      form.reset();
      setCloseData(null);
      setActualCash(null);
      onOpenChange(false);

      // Call success callback if provided
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      setIsReconciling(false);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to reconcile shift. Please try again.";

      if (errorMessage.includes("SHIFT_NOT_FOUND")) {
        toast({
          title: "Error",
          description: "Shift not found.",
          variant: "destructive",
        });
      } else if (errorMessage.includes("SHIFT_NOT_CLOSING")) {
        toast({
          title: "Error",
          description:
            "Shift is not in CLOSING status. Please initiate closing first.",
          variant: "destructive",
        });
      } else if (errorMessage.includes("SHIFT_INVALID_STATUS")) {
        toast({
          title: "Error",
          description: "Shift cannot be reconciled in its current status.",
          variant: "destructive",
        });
      } else if (errorMessage.includes("INVALID_CASH_AMOUNT")) {
        toast({
          title: "Error",
          description: "Closing cash amount is invalid.",
          variant: "destructive",
        });
        form.setError("closing_cash", {
          type: "manual",
          message: "Closing cash must be a positive number",
        });
      } else {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      }
    }
  };

  // Watch closing_cash to update actualCash for variance calculation
  const watchedClosingCash = form.watch("closing_cash");
  useEffect(() => {
    // Update actualCash when closing_cash changes and closeData exists
    // Check for null/undefined, not just truthy (0 is a valid value)
    // Also check that the value is > 0 (positive validation)
    if (
      closeData &&
      watchedClosingCash !== null &&
      watchedClosingCash !== undefined &&
      watchedClosingCash > 0
    ) {
      setActualCash(watchedClosingCash);
    } else if (
      closeData &&
      (watchedClosingCash === 0 ||
        watchedClosingCash === null ||
        watchedClosingCash === undefined)
    ) {
      // Reset actualCash when value is cleared or set to 0
      setActualCash(null);
    }
  }, [watchedClosingCash, closeData]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {closeData ? "Reconcile Cash" : "Close Shift"}
          </DialogTitle>
          <DialogDescription>
            {closeData
              ? "Enter the actual cash count to reconcile the shift."
              : "Initiate closing to calculate expected cash and begin reconciliation."}
          </DialogDescription>
        </DialogHeader>

        {!closeData ? (
          // Step 1: Initiate closing
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Click the button below to initiate shift closing. The system will
              calculate the expected cash amount based on opening cash and
              transactions.
            </p>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isClosing}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleInitiateClosing}
                disabled={isClosing}
                data-testid="initiate-closing-button"
              >
                {isClosing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Initiate Closing
              </Button>
            </DialogFooter>
          </div>
        ) : (
          // Step 2: Reconcile cash
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Expected Cash (Read-only) */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Expected Cash</label>
                <Input
                  value={formatCurrency(closeData.expected_cash)}
                  readOnly
                  className="bg-muted"
                  data-testid="expected-cash-display"
                />
                <p className="text-xs text-muted-foreground">
                  Calculated from opening cash (
                  {formatCurrency(closeData.opening_cash)}) + cash transactions
                  ({formatCurrency(closeData.cash_transactions_total)})
                </p>
              </div>

              {/* Actual Cash Input */}
              <FormField
                control={form.control}
                name="closing_cash"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Actual Cash</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="0.00"
                        {...field}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === "") {
                            field.onChange(0);
                          } else {
                            const numValue = parseFloat(value);
                            // Only update if it's a valid number
                            if (!isNaN(numValue)) {
                              field.onChange(numValue);
                            } else {
                              field.onChange(0);
                            }
                          }
                        }}
                        value={field.value === 0 ? "" : field.value}
                        disabled={isReconciling}
                        data-testid="actual-cash-input"
                      />
                    </FormControl>
                    <FormDescription>
                      Enter the actual cash count from the register
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Variance Display (Read-only, calculated) */}
              {actualCash !== null && variance !== null && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Variance</label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Input
                        value={formatCurrency(variance.amount)}
                        readOnly
                        className={`bg-muted ${
                          variance.amount < 0
                            ? "text-destructive"
                            : variance.amount > 0
                              ? "text-green-600"
                              : ""
                        }`}
                        data-testid="variance-amount-display"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Amount
                      </p>
                    </div>
                    <div>
                      <Input
                        value={`${variance.percentage >= 0 ? "+" : ""}${variance.percentage.toFixed(2)}%`}
                        readOnly
                        className={`bg-muted ${
                          variance.percentage < 0
                            ? "text-destructive"
                            : variance.percentage > 0
                              ? "text-green-600"
                              : ""
                        }`}
                        data-testid="variance-percentage-display"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Percentage
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Variance Alert */}
              {hasVarianceAlert && (
                <Alert variant="destructive" data-testid="variance-alert">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Variance Exceeds Threshold</AlertTitle>
                  <AlertDescription>
                    The variance amount (
                    {formatCurrency(Math.abs(variance!.amount))}) or percentage
                    ({Math.abs(variance!.percentage).toFixed(2)}%) exceeds the
                    threshold ($5 or 1%). This shift will require variance
                    review and approval.
                  </AlertDescription>
                </Alert>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCloseData(null);
                    setActualCash(null);
                    form.reset();
                  }}
                  disabled={isReconciling}
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={isReconciling}
                  data-testid="submit-reconciliation"
                >
                  {isReconciling && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Reconcile
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
