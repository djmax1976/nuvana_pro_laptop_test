"use client";

/**
 * VarianceApprovalDialog Component
 * Dialog for approving lottery variance with required reason input
 *
 * Story: 6.10 - Lottery Management UI
 * AC #6: Variance approval dialog/form, reason input, approval submission, success/error messages, alert refresh
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
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import type { LotteryVariance } from "./VarianceAlert";

/**
 * Form validation schema matching backend variance approval schema
 * Mirrors backend validation client-side for immediate feedback
 * Backend requires: reason (string, min 1, max 500 characters)
 */
const varianceApprovalFormSchema = z.object({
  reason: z
    .string()
    .min(1, "Variance reason is required")
    .max(500, "Variance reason cannot exceed 500 characters")
    .trim()
    .refine((val) => val.length > 0, "Variance reason cannot be empty"),
});

type VarianceApprovalFormValues = z.infer<typeof varianceApprovalFormSchema>;

export interface VarianceApprovalDialogProps {
  variance: LotteryVariance;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onApprove?: (varianceId: string, reason: string) => Promise<void>;
}

/**
 * VarianceApprovalDialog component
 * Dialog form for approving lottery variance with required reason
 * Uses React Hook Form with Zod validation matching backend schema
 * Follows FORM_VALIDATION, INPUT_VALIDATION, and XSS prevention patterns
 */
export function VarianceApprovalDialog({
  variance,
  isOpen,
  onClose,
  onSuccess,
  onApprove,
}: VarianceApprovalDialogProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<VarianceApprovalFormValues>({
    resolver: zodResolver(varianceApprovalFormSchema),
    defaultValues: {
      reason: "",
    },
  });

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      form.reset({
        reason: "",
      });
    }
  }, [isOpen, form]);

  const onSubmit = async (values: VarianceApprovalFormValues) => {
    if (!onApprove) {
      toast({
        title: "Error",
        description: "Approval handler not provided",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Sanitize input: trim and validate length (already done by Zod, but double-check)
      const sanitizedReason = values.reason.trim();

      if (sanitizedReason.length === 0) {
        form.setError("reason", {
          type: "manual",
          message: "Variance reason cannot be empty",
        });
        setIsSubmitting(false);
        return;
      }

      if (sanitizedReason.length > 500) {
        form.setError("reason", {
          type: "manual",
          message: "Variance reason cannot exceed 500 characters",
        });
        setIsSubmitting(false);
        return;
      }

      // Call approval handler (provided by parent component, which handles API call)
      await onApprove(variance.variance_id, sanitizedReason);

      toast({
        title: "Success",
        description: "Variance approved successfully",
      });

      // Reset form and close dialog
      form.reset();
      onClose();

      // Call success callback if provided (triggers alert refresh)
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      setIsSubmitting(false);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to approve variance. Please try again.";

      // Handle specific error cases
      if (errorMessage.includes("VARIANCE_NOT_FOUND")) {
        toast({
          title: "Error",
          description: "Variance not found.",
          variant: "destructive",
        });
      } else if (errorMessage.includes("VARIANCE_ALREADY_APPROVED")) {
        toast({
          title: "Error",
          description: "This variance has already been approved.",
          variant: "destructive",
        });
      } else if (errorMessage.includes("REASON_REQUIRED")) {
        toast({
          title: "Error",
          description: "Variance reason is required for approval.",
          variant: "destructive",
        });
        form.setError("reason", {
          type: "manual",
          message: "Variance reason is required",
        });
      } else if (
        errorMessage.includes("FORBIDDEN") ||
        errorMessage.includes("RLS")
      ) {
        toast({
          title: "Error",
          description: "You do not have permission to approve this variance.",
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

  const isUnresolved = variance.approved_at === null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Approve Lottery Variance</DialogTitle>
          <DialogDescription>
            {isUnresolved
              ? "This lottery variance requires approval. Please provide a reason for the variance to complete the approval."
              : "This variance has already been approved."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Variance Alert - Prominently Displayed */}
            <Alert
              variant={isUnresolved ? "destructive" : "default"}
              data-testid="variance-alert"
            >
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>
                {isUnresolved
                  ? "Variance Detected"
                  : "Variance Already Approved"}
              </AlertTitle>
              <AlertDescription className="mt-2">
                <div className="space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="font-medium text-muted-foreground">
                        Pack:
                      </span>{" "}
                      <span className="font-semibold">
                        {variance.pack.pack_number}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">
                        Game:
                      </span>{" "}
                      <span className="font-semibold">
                        {variance.pack.game.name}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">
                        Expected:
                      </span>{" "}
                      <span className="font-semibold">
                        {variance.expected_count}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">
                        Actual:
                      </span>{" "}
                      <span className="font-semibold">
                        {variance.actual_count}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="font-medium text-muted-foreground">
                        Difference:
                      </span>{" "}
                      <span
                        className={`font-semibold ${
                          variance.difference < 0
                            ? "text-destructive"
                            : variance.difference > 0
                              ? "text-green-600"
                              : ""
                        }`}
                      >
                        {variance.difference > 0 ? "+" : ""}
                        {variance.difference}
                      </span>
                    </div>
                  </div>
                </div>
              </AlertDescription>
            </Alert>

            {/* Variance Reason Input (Required, Multiline) */}
            {isUnresolved && (
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Variance Reason *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter reason for variance (e.g., ticket scanning error, pack discrepancy, etc.)"
                        {...field}
                        disabled={isSubmitting}
                        rows={4}
                        data-testid="variance-reason-input"
                        maxLength={500}
                      />
                    </FormControl>
                    <FormDescription>
                      Provide a detailed explanation for the variance. This
                      reason will be recorded and may be reviewed during audits.
                      Maximum 500 characters.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
              >
                {isUnresolved ? "Cancel" : "Close"}
              </Button>
              {isUnresolved && (
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
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
