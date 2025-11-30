"use client";

/**
 * Variance Approval Dialog Component
 * Dialog for approving variance with required reason input
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
import { Textarea } from "@/components/ui/textarea";
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
  useReconcileCash,
  useInvalidateShifts,
  type ShiftResponse,
} from "@/lib/api/shifts";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/utils";

/**
 * Form validation schema matching backend ApproveVarianceSchema
 * Mirrors backend validation client-side for immediate feedback
 */
const varianceApprovalFormSchema = z.object({
  variance_reason: z
    .string()
    .min(1, "Variance reason is required")
    .trim()
    .refine((val) => val.length > 0, "Variance reason cannot be empty"),
});

type VarianceApprovalFormValues = z.infer<typeof varianceApprovalFormSchema>;

interface VarianceApprovalDialogProps {
  shift: ShiftResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

/**
 * VarianceApprovalDialog component
 * Dialog form for approving variance with required reason
 * Uses React Hook Form with Zod validation matching backend schema
 */
export function VarianceApprovalDialog({
  shift,
  open,
  onOpenChange,
  onSuccess,
}: VarianceApprovalDialogProps) {
  const { toast } = useToast();
  const reconcileCashMutation = useReconcileCash();
  const { invalidateList } = useInvalidateShifts();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<VarianceApprovalFormValues>({
    resolver: zodResolver(varianceApprovalFormSchema),
    defaultValues: {
      variance_reason: "",
    },
  });

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      form.reset({
        variance_reason: "",
      });
    }
  }, [open, form]);

  const onSubmit = async (values: VarianceApprovalFormValues) => {
    setIsSubmitting(true);
    try {
      await reconcileCashMutation.mutateAsync({
        shiftId: shift.shift_id,
        data: {
          variance_reason: values.variance_reason.trim(),
        },
      });

      toast({
        title: "Success",
        description: "Variance approved successfully. Shift is now closed.",
      });

      // Invalidate shift list to refresh
      invalidateList();

      // Reset form and close dialog
      form.reset();
      onOpenChange(false);

      // Call success callback if provided
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      setIsSubmitting(false);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to approve variance. Please try again.";

      if (errorMessage.includes("SHIFT_NOT_FOUND")) {
        toast({
          title: "Error",
          description: "Shift not found.",
          variant: "destructive",
        });
      } else if (errorMessage.includes("SHIFT_NOT_VARIANCE_REVIEW")) {
        toast({
          title: "Error",
          description:
            "Shift is not in VARIANCE_REVIEW status. Variance approval is only available for shifts requiring review.",
          variant: "destructive",
        });
      } else if (errorMessage.includes("VARIANCE_REASON_REQUIRED")) {
        toast({
          title: "Error",
          description: "Variance reason is required for approval.",
          variant: "destructive",
        });
        form.setError("variance_reason", {
          type: "manual",
          message: "Variance reason is required",
        });
      } else if (errorMessage.includes("SHIFT_LOCKED")) {
        toast({
          title: "Error",
          description: "Shift is locked and cannot be modified.",
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

  const varianceAmount = shift.variance_amount ?? 0;
  const variancePercentage = shift.variance_percentage ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Approve Variance</DialogTitle>
          <DialogDescription>
            This shift has a variance that requires approval. Please provide a
            reason for the variance to complete the shift closure.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Variance Alert - Prominently Displayed */}
            <Alert variant="destructive" data-testid="variance-alert">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Variance Detected</AlertTitle>
              <AlertDescription className="mt-2">
                <div className="space-y-1">
                  <div className="font-semibold">
                    Variance Amount: {formatCurrency(Math.abs(varianceAmount))}
                  </div>
                  <div className="font-semibold">
                    Variance Percentage:{" "}
                    {Math.abs(variancePercentage).toFixed(2)}%
                  </div>
                </div>
              </AlertDescription>
            </Alert>

            {/* Variance Details */}
            <div className="grid grid-cols-2 gap-4 p-4 border rounded-lg bg-muted/50">
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Variance Amount
                </label>
                <div
                  className={`text-lg font-semibold ${
                    varianceAmount < 0
                      ? "text-destructive"
                      : varianceAmount > 0
                        ? "text-green-600"
                        : ""
                  }`}
                  data-testid="variance-amount-display"
                >
                  {varianceAmount >= 0 ? "+" : ""}
                  {formatCurrency(varianceAmount)}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Variance Percentage
                </label>
                <div
                  className={`text-lg font-semibold ${
                    variancePercentage < 0
                      ? "text-destructive"
                      : variancePercentage > 0
                        ? "text-green-600"
                        : ""
                  }`}
                  data-testid="variance-percentage-display"
                >
                  {variancePercentage >= 0 ? "+" : ""}
                  {variancePercentage.toFixed(2)}%
                </div>
              </div>
            </div>

            {/* Variance Reason Input (Required, Multiline) */}
            <FormField
              control={form.control}
              name="variance_reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Variance Reason *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter reason for variance (e.g., cash handling error, transaction discrepancy, etc.)"
                      {...field}
                      disabled={isSubmitting}
                      rows={4}
                      data-testid="variance-reason-input"
                    />
                  </FormControl>
                  <FormDescription>
                    Provide a detailed explanation for the variance. This reason
                    will be recorded and may be reviewed during audits.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                data-testid="submit-variance-approval"
              >
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Approve Variance
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
