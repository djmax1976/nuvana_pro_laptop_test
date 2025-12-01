"use client";

/**
 * Cashier Shift Start Dialog Component
 * Dialog form for cashiers to start their own shift by selecting an available terminal
 *
 * Story: 4.8 - Cashier Shift Start Flow
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
import { useOpenShift, useInvalidateShifts } from "@/lib/api/shifts";
import { useStoreTerminals, TerminalWithStatus } from "@/lib/api/stores";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo } from "react";

/**
 * Form validation schema matching backend OpenShiftSchema
 * Note: cashier_id is NOT included - auto-assigned by backend
 * Mirrors backend validation client-side for immediate feedback
 */
const cashierShiftStartFormSchema = z.object({
  store_id: z.string().uuid("Store ID must be a valid UUID"),
  pos_terminal_id: z.string().uuid("Terminal must be selected"),
  opening_cash: z
    .number({ message: "Opening cash is required" })
    .nonnegative({ message: "Opening cash must be a non-negative number" })
    .min(0, { message: "Opening cash must be 0 or greater" }),
});

type CashierShiftStartFormValues = z.infer<typeof cashierShiftStartFormSchema>;

interface CashierShiftStartDialogProps {
  storeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

/**
 * CashierShiftStartDialog component
 * Dialog form for cashiers to start their own shift
 * Uses React Hook Form with Zod validation matching backend schema
 * Auto-assigns cashier_id to logged-in user (not included in form)
 */
export function CashierShiftStartDialog({
  storeId,
  open,
  onOpenChange,
  onSuccess,
}: CashierShiftStartDialogProps) {
  const { toast } = useToast();
  const openShiftMutation = useOpenShift();
  const { invalidateList } = useInvalidateShifts();

  // Fetch terminals for the store
  const {
    data: terminalsData,
    isLoading: isLoadingTerminals,
    error: terminalsError,
  } = useStoreTerminals(storeId, { enabled: open && !!storeId });

  // Show all terminals - filter available ones for selection, but show all for visibility
  const allTerminals = useMemo(() => {
    if (!terminalsData) return [];
    return terminalsData;
  }, [terminalsData]);

  // Filter terminals to show only available ones (no active shift) for selection
  const availableTerminals = useMemo(() => {
    if (!terminalsData) return [];
    return terminalsData.filter((terminal) => !terminal.has_active_shift);
  }, [terminalsData]);

  const form = useForm<CashierShiftStartFormValues>({
    resolver: zodResolver(cashierShiftStartFormSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    shouldFocusError: true,
    defaultValues: {
      store_id: storeId,
      pos_terminal_id: "",
      opening_cash: 0,
    },
  });

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      form.reset({
        store_id: storeId,
        pos_terminal_id: "",
        opening_cash: 0,
      });
    }
  }, [open, storeId, form]);

  const onSubmit = async (values: CashierShiftStartFormValues) => {
    try {
      // Call openShift without cashier_id - backend will auto-assign to authenticated user
      await openShiftMutation.mutateAsync({
        store_id: values.store_id,
        pos_terminal_id: values.pos_terminal_id,
        opening_cash: values.opening_cash,
        // cashier_id is NOT included - backend auto-assigns
      });

      toast({
        title: "Success",
        description: "Shift started successfully",
      });

      // Invalidate shift list to refresh
      invalidateList();

      // Reset form
      form.reset();

      // Close dialog
      onOpenChange(false);

      // Call success callback if provided
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      // Handle validation errors from backend
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to start shift. Please try again.";

      // Check for specific error codes
      if (errorMessage.includes("SHIFT_ALREADY_ACTIVE")) {
        toast({
          title: "Error",
          description:
            "An active shift already exists for this terminal. Please close the existing shift first.",
          variant: "destructive",
        });
      } else if (errorMessage.includes("TERMINAL_NOT_FOUND")) {
        toast({
          title: "Error",
          description: "Selected terminal is not valid for this store.",
          variant: "destructive",
        });
        form.setError("pos_terminal_id", {
          type: "manual",
          message: "Terminal is not valid for this store",
        });
      } else if (errorMessage.includes("INVALID_OPENING_CASH")) {
        toast({
          title: "Error",
          description: "Opening cash amount is invalid.",
          variant: "destructive",
        });
        form.setError("opening_cash", {
          type: "manual",
          message: "Opening cash must be a non-negative number",
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

  const isSubmitting = openShiftMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Start Shift</DialogTitle>
          <DialogDescription>
            Select an available terminal and enter opening cash amount to start
            your shift.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Store ID (hidden, set from prop) */}
            <FormField
              control={form.control}
              name="store_id"
              render={({ field }) => (
                <FormItem className="hidden">
                  <FormControl>
                    <Input type="hidden" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Terminal Selection */}
            <FormField
              control={form.control}
              name="pos_terminal_id"
              render={({ field }) => {
                // Validate that selected terminal is available (no active shift)
                const selectedTerminal = allTerminals.find(
                  (t) => t.pos_terminal_id === field.value,
                );
                const isSelectedTerminalUnavailable =
                  selectedTerminal?.has_active_shift;

                return (
                  <FormItem>
                    <FormLabel>POS Terminal</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        const terminal = allTerminals.find(
                          (t) => t.pos_terminal_id === value,
                        );
                        // Only allow selection of available terminals
                        if (terminal && !terminal.has_active_shift) {
                          field.onChange(value);
                        }
                      }}
                      value={field.value}
                      disabled={isSubmitting || isLoadingTerminals}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="terminal-select">
                          <SelectValue placeholder="Select a terminal" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {isLoadingTerminals ? (
                          <SelectItem value="loading" disabled>
                            Loading terminals...
                          </SelectItem>
                        ) : terminalsError ? (
                          <SelectItem value="error" disabled>
                            Failed to load terminals
                          </SelectItem>
                        ) : allTerminals.length === 0 ? (
                          <SelectItem value="no-terminals" disabled>
                            No terminals found for this store
                          </SelectItem>
                        ) : (
                          allTerminals.map((terminal) => (
                            <SelectItem
                              key={terminal.pos_terminal_id}
                              value={terminal.pos_terminal_id}
                              disabled={terminal.has_active_shift}
                              data-testid={`terminal-option-${terminal.pos_terminal_id}`}
                            >
                              {terminal.name}
                              {terminal.has_active_shift && " (Active Shift)"}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {allTerminals.length > 0
                        ? `Select an available POS terminal for this shift (${availableTerminals.length} of ${allTerminals.length} available)`
                        : "Select an available POS terminal for this shift"}
                    </FormDescription>
                    {isSelectedTerminalUnavailable && (
                      <p className="text-sm font-medium text-destructive">
                        This terminal has an active shift. Please select an
                        available terminal.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            {/* Show message if no terminals found */}
            {!isLoadingTerminals &&
              !terminalsError &&
              allTerminals.length === 0 && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
                  No terminals found for this store. Please create terminals
                  first.
                </div>
              )}

            {/* Show message if terminals exist but all have active shifts */}
            {!isLoadingTerminals &&
              !terminalsError &&
              allTerminals.length > 0 &&
              availableTerminals.length === 0 && (
                <div className="rounded-md bg-yellow-50 p-3 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
                  No available terminals. All {allTerminals.length} terminal(s)
                  have active shifts. Please close existing shifts first.
                </div>
              )}

            {/* Show debug info about terminals */}
            {!isLoadingTerminals &&
              !terminalsError &&
              allTerminals.length > 0 && (
                <div className="rounded-md bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
                  Found {allTerminals.length} terminal(s) total,{" "}
                  {availableTerminals.length} available for new shift.
                  {allTerminals
                    .filter((t) => t.has_active_shift)
                    .map((t) => t.name)
                    .join(", ") && (
                    <span>
                      {" "}
                      Active shifts on:{" "}
                      {allTerminals
                        .filter((t) => t.has_active_shift)
                        .map((t) => t.name)
                        .join(", ")}
                    </span>
                  )}
                </div>
              )}

            {/* Opening Cash */}
            <FormField
              control={form.control}
              name="opening_cash"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Opening Cash</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      {...field}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Convert empty string to 0, otherwise parse as number
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
                      disabled={isSubmitting}
                      data-testid="opening-cash-input"
                    />
                  </FormControl>
                  <FormDescription>
                    Enter the starting cash amount (must be ≥ 0)
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
                disabled={
                  isSubmitting ||
                  isLoadingTerminals ||
                  availableTerminals.length === 0
                }
                data-testid="submit-button"
              >
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Start Shift
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
